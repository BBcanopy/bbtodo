import { createPublicKey } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import type { AppConfig } from "./config.js";

export const OIDC_NONCE_COOKIE = "bbtodo_oidc_nonce";
export const OIDC_STATE_COOKIE = "bbtodo_oidc_state";
export const OIDC_VERIFIER_COOKIE = "bbtodo_oidc_verifier";
export const OIDC_OAUTH_NAMESPACE = "oidcOAuth2";

const oidcDiscoverySchema = z.object({
  issuer: z.url(),
  jwks_uri: z.url()
});

const oidcJwksSchema = z.object({
  keys: z.array(z.record(z.string(), z.unknown()))
});

const oidcIdTokenClaimsSchema = z.object({
  aud: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
  azp: z.string().min(1).optional(),
  email: z.string().min(1).optional(),
  iss: z.url(),
  name: z.string().min(1).optional(),
  nonce: z.string().min(1).optional(),
  preferred_username: z.string().min(1).optional(),
  sub: z.string().min(1)
});

export interface AuthenticatedIdentity {
  issuer: string;
  subject: string;
  email: string | null;
  displayName: string | null;
}

export interface OidcDiscoveryDocument {
  issuer: string;
  jwksUri: string;
}

export interface OidcOAuth2Namespace {
  generateAuthorizationUri(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<string>;
  getAccessTokenFromAuthorizationCodeFlow(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<{
    token: {
      access_token: string;
      id_token?: string;
    };
  }>;
}

export interface JwtVerifier {
  verify(token: string): unknown | Promise<unknown>;
}

export interface JwksSecretResolver {
  (tokenOrHeader: DecodedJwtLike): Promise<string>;
  clearCache(): void;
}

export interface OidcAuthTestingOptions {
  discoveryDocument?: OidcDiscoveryDocument;
  jwtVerifier?: JwtVerifier;
  onAuthorizationNonce?: (nonce: string) => void;
  oauth2Namespace?: OidcOAuth2Namespace;
}

interface DecodedJwtHeaderLike {
  alg?: string;
  kid?: string;
}

interface DecodedJwtLike extends DecodedJwtHeaderLike {
  header?: {
    alg?: string;
    kid?: string;
  };
}

interface CachedJwksPublicKey {
  expiresAt: number;
  pem: string;
}

export const DEFAULT_JWKS_CACHE_TTL_MS = 5 * 60 * 1000;

export function normalizeIssuer(issuer: string) {
  return new URL(issuer).toString();
}

export function getOidcDiscoveryUrl(issuer: string) {
  const normalizedIssuer = normalizeIssuer(issuer).replace(/\/$/, "");
  return `${normalizedIssuer}/.well-known/openid-configuration`;
}

export async function resolveOidcDiscoveryDocument(
  issuer: string,
  fetchFn: typeof fetch = fetch
): Promise<OidcDiscoveryDocument> {
  const discoveryUrl = getOidcDiscoveryUrl(issuer);
  const response = await fetchFn(discoveryUrl, {
    headers: {
      accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(
      `OIDC discovery failed with status ${response.status} for ${discoveryUrl}.`
    );
  }

  const parsed = oidcDiscoverySchema.parse(await response.json());
  return {
    issuer: parsed.issuer,
    jwksUri: parsed.jwks_uri
  };
}

async function resolveJwksPublicKeyPem(
  jwksUri: string,
  alg: string,
  kid: string,
  cache: Map<string, CachedJwksPublicKey>,
  fetchFn: typeof fetch,
  defaultCacheTtlMs: number,
  now: () => number
) {
  const cacheKey = `${alg}:${kid}:${jwksUri}`;
  const cachedKey = cache.get(cacheKey);
  if (cachedKey && cachedKey.expiresAt > now()) {
    return cachedKey.pem;
  }

  const response = await fetchFn(jwksUri, {
    headers: {
      accept: "application/json"
    }
  });
  if (!response.ok) {
    throw new Error(
      `OIDC JWKS fetch failed with status ${response.status} for ${jwksUri}.`
    );
  }

  const jwks = oidcJwksSchema.parse(await response.json());
  const jwk = jwks.keys.find(
    (entry) =>
      typeof entry.kid === "string" &&
      entry.kid === kid &&
      (typeof entry.alg !== "string" || entry.alg === alg)
  );
  if (!jwk) {
    throw new Error(`OIDC JWKS did not contain a signing key for kid ${kid}.`);
  }

  const publicKey = createPublicKey({
    format: "jwk",
    key: jwk as JsonWebKey
  });
  const pemString = publicKey
    .export({
      format: "pem",
      type: "spki"
    })
    .toString();

  cache.set(cacheKey, {
    expiresAt: now() + resolveJwksCacheTtlMs(response.headers, now(), defaultCacheTtlMs),
    pem: pemString
  });
  return pemString;
}

function parseCacheControlMaxAgeMs(cacheControlHeader: string | null) {
  if (!cacheControlHeader) {
    return null;
  }

  const directives = cacheControlHeader
    .split(",")
    .map((directive) => directive.trim().toLowerCase());
  if (
    directives.includes("no-store") ||
    directives.includes("no-cache")
  ) {
    return 0;
  }
  const maxAgeDirective = directives.find((directive) => directive.startsWith("max-age="));
  if (!maxAgeDirective) {
    return null;
  }

  const seconds = Number.parseInt(maxAgeDirective.slice("max-age=".length), 10);
  if (!Number.isFinite(seconds) || seconds < 0) {
    return null;
  }

  return seconds * 1000;
}

function resolveJwksCacheTtlMs(
  headers: Pick<Headers, "get">,
  nowMs: number,
  defaultCacheTtlMs: number
) {
  const cacheControlMaxAgeMs = parseCacheControlMaxAgeMs(headers.get("cache-control"));
  if (cacheControlMaxAgeMs !== null) {
    return cacheControlMaxAgeMs;
  }

  const expiresHeader = headers.get("expires");
  if (expiresHeader) {
    const expiresAt = Date.parse(expiresHeader);
    if (Number.isFinite(expiresAt)) {
      return Math.max(0, expiresAt - nowMs);
    }
  }

  return defaultCacheTtlMs;
}

export function createJwksSecretResolver(
  options: {
    clientSecret: string;
    defaultCacheTtlMs?: number;
    jwksUri: string;
    fetchFn?: typeof fetch;
    now?: () => number;
  }
) : JwksSecretResolver {
  const cache = new Map<string, CachedJwksPublicKey>();
  const defaultCacheTtlMs =
    options.defaultCacheTtlMs ?? DEFAULT_JWKS_CACHE_TTL_MS;
  const fetchFn = options.fetchFn ?? fetch;
  const now = options.now ?? Date.now;

  const resolver = async (tokenOrHeader: DecodedJwtLike) => {
    const header = tokenOrHeader.header ?? tokenOrHeader;
    const alg = header.alg;
    if (!alg) {
      throw new Error("OIDC id_token header did not include an algorithm.");
    }

    if (alg.startsWith("HS")) {
      return options.clientSecret;
    }

    const kid = header.kid;
    if (!kid) {
      throw new Error("OIDC id_token header did not include a key id.");
    }

    return resolveJwksPublicKeyPem(
      options.jwksUri,
      alg,
      kid,
      cache,
      fetchFn,
      defaultCacheTtlMs,
      now
    );
  };

  resolver.clearCache = () => {
    cache.clear();
  };

  return resolver;
}

export function shouldRetryJwksVerification(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const normalizedMessage = error.message.toLowerCase();
  return (
    normalizedMessage.includes("cannot fetch key") ||
    normalizedMessage.includes("signature") ||
    normalizedMessage.includes("jwks") ||
    normalizedMessage.includes("public key") ||
    normalizedMessage.includes("secret or public key") ||
    normalizedMessage.includes("kid")
  );
}

export async function verifyOidcIdToken(options: {
  idToken: string;
  jwtVerifier: JwtVerifier;
  jwksSecretResolver?: Pick<JwksSecretResolver, "clearCache">;
}) {
  try {
    return await options.jwtVerifier.verify(options.idToken);
  } catch (error) {
    if (!options.jwksSecretResolver || !shouldRetryJwksVerification(error)) {
      throw error;
    }

    options.jwksSecretResolver.clearCache();
    return options.jwtVerifier.verify(options.idToken);
  }
}

export function createOidcNonce() {
  return crypto.randomUUID();
}

export function buildAuthorizationRedirectUrl(
  authorizationUri: string,
  nonce: string
) {
  const redirectUrl = new URL(authorizationUri);
  redirectUrl.searchParams.set("nonce", nonce);
  return redirectUrl.toString();
}

export function buildAuthenticatedIdentity(
  config: AppConfig,
  verifiedClaims: unknown,
  expectedNonce: string
): AuthenticatedIdentity {
  const claims = oidcIdTokenClaimsSchema.parse(verifiedClaims);
  const normalizedIssuer = normalizeIssuer(config.oidcIssuer);

  if (normalizeIssuer(claims.iss) !== normalizedIssuer) {
    throw new Error("OIDC id_token issuer did not match the configured issuer.");
  }

  const audienceValues = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audienceValues.includes(config.oidcClientId)) {
    throw new Error("OIDC id_token audience did not include the configured client.");
  }

  if (audienceValues.length > 1 && claims.azp !== config.oidcClientId) {
    throw new Error("OIDC id_token azp claim did not match the configured client.");
  }

  if (claims.nonce !== expectedNonce) {
    throw new Error("OIDC id_token nonce did not match the login request.");
  }

  return {
    issuer: normalizedIssuer,
    subject: claims.sub,
    email: claims.email ?? null,
    displayName: claims.name ?? claims.preferred_username ?? null
  };
}
