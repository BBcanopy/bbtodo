import { generateKeyPairSync } from "node:crypto";

import jwt from "@fastify/jwt";
import Fastify from "fastify";
import { afterEach, describe, expect, it } from "vitest";

import {
  buildAuthenticatedIdentity,
  createJwksSecretResolver,
  resolveOidcDiscoveryDocument,
  verifyOidcIdToken
} from "./oidc.js";

const createdApps: ReturnType<typeof Fastify>[] = [];

afterEach(async () => {
  while (createdApps.length > 0) {
    const app = createdApps.pop();
    if (app) {
      await app.close();
    }
  }
});

async function createOidcMetadataServer() {
  const metadataApp = Fastify();
  createdApps.push(metadataApp);

  let issuerUrl = "";
  let cacheControlHeader = "public, max-age=300";
  let currentJwks: JsonWebKey[] = [];
  metadataApp.get("/.well-known/openid-configuration", async () => ({
    issuer: issuerUrl,
    jwks_uri: `${issuerUrl}/.well-known/jwks.json`
  }));
  metadataApp.get("/.well-known/jwks.json", async (_request, reply) => {
    reply.header("Cache-Control", cacheControlHeader);
    return {
      keys: currentJwks
    };
  });

  issuerUrl = await metadataApp.listen({
    host: "127.0.0.1",
    port: 0
  });

  return {
    issuerUrl,
    setJwks(keys: JsonWebKey[], nextCacheControlHeader = cacheControlHeader) {
      currentJwks = keys;
      cacheControlHeader = nextCacheControlHeader;
    }
  };
}

function createSigningKey(kid: string) {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048
  });

  return {
    kid,
    privateKeyPem: privateKey.export({
      format: "pem",
      type: "pkcs8"
    }),
    publicJwk: {
      ...(publicKey.export({
        format: "jwk"
      }) as JsonWebKey),
      alg: "RS256",
      kid,
      use: "sig"
    },
    publicKeyPem: publicKey.export({
      format: "pem",
      type: "spki"
    })
  };
}

async function createJwtSigner(key: {
  privateKeyPem: string | Buffer;
  publicKeyPem: string | Buffer;
}) {
  const signerApp = Fastify();
  createdApps.push(signerApp);
  await signerApp.register(jwt as never, {
    secret: {
      private: key.privateKeyPem,
      public: key.publicKeyPem
    }
  } as never);
  await signerApp.ready();

  return signerApp;
}

async function createJwtVerifier(
  discoveryDocument: Awaited<ReturnType<typeof resolveOidcDiscoveryDocument>>,
  options: {
    now?: () => number;
  } = {}
) {
  const jwksSecretResolver = createJwksSecretResolver({
    clientSecret: "top-secret",
    jwksUri: discoveryDocument.jwksUri,
    now: options.now
  });
  const verifierApp = Fastify();
  createdApps.push(verifierApp);
  await verifierApp.register(jwt as never, {
    decode: {
      complete: true
    },
    secret: jwksSecretResolver,
    verify: {
      allowedAud: "bbtodo-test",
      allowedIss: discoveryDocument.issuer
    }
  } as never);
  await verifierApp.ready();

  return {
    jwksSecretResolver,
    verifierApp
  };
}

function createSignedIdToken(
  signerApp: Awaited<ReturnType<typeof createJwtSigner>>,
  discoveryDocument: Awaited<ReturnType<typeof resolveOidcDiscoveryDocument>>,
  options: {
    email?: string;
    kid: string;
    name?: string;
    nonce?: string;
    sub?: string;
  }
) {
  return signerApp.jwt.sign(
    {
      email: options.email ?? "jwks@example.com",
      name: options.name ?? "JWKS User",
      nonce: options.nonce ?? "expected-nonce"
    },
    {
      algorithm: "RS256",
      aud: "bbtodo-test",
      expiresIn: "1h",
      header: {
        alg: "RS256",
        kid: options.kid
      },
      iss: discoveryDocument.issuer,
      sub: options.sub ?? "jwks-user"
    }
  );
}

describe("OIDC helpers", () => {
  it(
    "resolves discovery metadata and verifies a JWKS-backed id_token",
    async () => {
      const metadataServer = await createOidcMetadataServer();
      const signingKey = createSigningKey("test-key");
      metadataServer.setJwks([signingKey.publicJwk]);

      const discoveryDocument = await resolveOidcDiscoveryDocument(
        metadataServer.issuerUrl
      );
      expect(discoveryDocument).toEqual({
        issuer: metadataServer.issuerUrl,
        jwksUri: `${metadataServer.issuerUrl}/.well-known/jwks.json`
      });

      const signerApp = await createJwtSigner(signingKey);
      const validIdToken = createSignedIdToken(signerApp, discoveryDocument, {
        kid: signingKey.kid
      });

      const { verifierApp } = await createJwtVerifier(discoveryDocument);

      await expect(
        Promise.resolve(
          verifierApp.jwt.verify<{
            email: string;
            name: string;
            nonce: string;
            sub: string;
          }>(validIdToken)
        )
      ).resolves.toMatchObject({
        email: "jwks@example.com",
        name: "JWKS User",
        nonce: "expected-nonce",
        sub: "jwks-user"
      });
    },
    15_000
  );

  it(
    "does not cache JWKS entries when cache-control forbids it",
    async () => {
      const metadataServer = await createOidcMetadataServer();
      const signingKey = createSigningKey("no-store-key");
      metadataServer.setJwks([signingKey.publicJwk], "private, no-store");

      const discoveryDocument = await resolveOidcDiscoveryDocument(
        metadataServer.issuerUrl
      );
      const signerApp = await createJwtSigner(signingKey);
      const validIdToken = createSignedIdToken(signerApp, discoveryDocument, {
        kid: signingKey.kid,
        sub: "no-store-user"
      });
      const { verifierApp } = await createJwtVerifier(discoveryDocument);

      await expect(
        Promise.resolve(
          verifierApp.jwt.verify<{
            sub: string;
          }>(validIdToken)
        )
      ).resolves.toMatchObject({
        sub: "no-store-user"
      });

      metadataServer.setJwks([], "private, no-store");

      await expect(
        Promise.resolve().then(() => verifierApp.jwt.verify(validIdToken))
      ).rejects.toThrow(/Cannot fetch key|JWKS did not contain a signing key/i);
    },
    15_000
  );

  it(
    "expires cached JWKS keys after their cache header TTL",
    async () => {
      let nowMs = 0;
      const metadataServer = await createOidcMetadataServer();
      const signingKey = createSigningKey("ttl-key");
      metadataServer.setJwks([signingKey.publicJwk], "public, max-age=1");

      const discoveryDocument = await resolveOidcDiscoveryDocument(
        metadataServer.issuerUrl
      );
      const signerApp = await createJwtSigner(signingKey);
      const validIdToken = createSignedIdToken(signerApp, discoveryDocument, {
        kid: signingKey.kid,
        sub: "ttl-user"
      });
      const { verifierApp } = await createJwtVerifier(discoveryDocument, {
        now: () => nowMs
      });

      await expect(
        Promise.resolve(
          verifierApp.jwt.verify<{
            sub: string;
          }>(validIdToken)
        )
      ).resolves.toMatchObject({
        sub: "ttl-user"
      });

      metadataServer.setJwks([], "public, max-age=1");

      await expect(
        Promise.resolve(
          verifierApp.jwt.verify<{
            sub: string;
          }>(validIdToken)
        )
      ).resolves.toMatchObject({
        sub: "ttl-user"
      });

      nowMs += 1_100;

      await expect(
        Promise.resolve().then(() => verifierApp.jwt.verify(validIdToken))
      ).rejects.toThrow(/Cannot fetch key|JWKS did not contain a signing key/i);
    },
    15_000
  );

  it(
    "retries a transient key-fetch failure once",
    async () => {
      let clearCacheCalls = 0;
      let verifyCalls = 0;

      await expect(
        verifyOidcIdToken({
          idToken: "test-id-token",
          jwtVerifier: {
            async verify() {
              verifyCalls += 1;
              if (verifyCalls === 1) {
                throw new Error("Cannot fetch key.");
              }

              return {
                sub: "retry-user"
              };
            }
          },
          jwksSecretResolver: {
            clearCache() {
              clearCacheCalls += 1;
            }
          }
        })
      ).resolves.toMatchObject({
        sub: "retry-user"
      });

      expect(clearCacheCalls).toBe(1);
      expect(verifyCalls).toBe(2);
    }
  );

  it(
    "retries verification after clearing a stale cached JWKS key",
    async () => {
      let nowMs = 0;
      const metadataServer = await createOidcMetadataServer();
      const originalKey = createSigningKey("rotating-key");
      const rotatedKey = createSigningKey("rotating-key");
      metadataServer.setJwks([originalKey.publicJwk], "public, max-age=3600");

      const discoveryDocument = await resolveOidcDiscoveryDocument(
        metadataServer.issuerUrl
      );
      const originalSignerApp = await createJwtSigner(originalKey);
      const rotatedSignerApp = await createJwtSigner(rotatedKey);
      const { jwksSecretResolver, verifierApp } = await createJwtVerifier(
        discoveryDocument,
        {
          now: () => nowMs
        }
      );

      const originalIdToken = createSignedIdToken(
        originalSignerApp,
        discoveryDocument,
        {
          kid: originalKey.kid,
          sub: "original-user"
        }
      );

      await expect(
        verifyOidcIdToken({
          idToken: originalIdToken,
          jwtVerifier: verifierApp.jwt,
          jwksSecretResolver
        })
      ).resolves.toMatchObject({
        sub: "original-user"
      });

      metadataServer.setJwks([rotatedKey.publicJwk], "public, max-age=3600");

      const rotatedIdToken = createSignedIdToken(
        rotatedSignerApp,
        discoveryDocument,
        {
          kid: rotatedKey.kid,
          sub: "rotated-user"
        }
      );

      await expect(
        Promise.resolve().then(() => verifierApp.jwt.verify(rotatedIdToken))
      ).rejects.toThrow(/signature/i);

      await expect(
        verifyOidcIdToken({
          idToken: rotatedIdToken,
          jwtVerifier: verifierApp.jwt,
          jwksSecretResolver
        })
      ).resolves.toMatchObject({
        sub: "rotated-user"
      });
    },
    15_000
  );

  it(
    "rejects an id_token signed by a key that is not in JWKS",
    async () => {
      const metadataServer = await createOidcMetadataServer();
      const trustedKey = createSigningKey("test-key");
      metadataServer.setJwks([trustedKey.publicJwk]);

      const signerApp = Fastify();
      createdApps.push(signerApp);
      const unrelatedKeys = generateKeyPairSync("rsa", {
        modulusLength: 2048
      });
      const unrelatedPrivateKeyPem = unrelatedKeys.privateKey.export({
        format: "pem",
        type: "pkcs8"
      });
      const unrelatedPublicKeyPem = unrelatedKeys.publicKey.export({
        format: "pem",
        type: "spki"
      });

      await signerApp.register(jwt as never, {
        secret: {
          private: unrelatedPrivateKeyPem,
          public: unrelatedPublicKeyPem
        }
      } as never);
      await signerApp.ready();

      const invalidIdToken = signerApp.jwt.sign(
        {
          nonce: "expected-nonce"
        },
        {
          algorithm: "RS256",
          aud: "bbtodo-test",
          expiresIn: "1h",
          header: {
            alg: "RS256",
            kid: "unknown-key"
          },
          iss: `${metadataServer.issuerUrl}/`,
          sub: "jwks-user"
        }
      );

      const { verifierApp } = await createJwtVerifier({
        issuer: `${metadataServer.issuerUrl}/`,
        jwksUri: `${metadataServer.issuerUrl}/.well-known/jwks.json`
      });

      await expect(
        Promise.resolve().then(() => verifierApp.jwt.verify(invalidIdToken))
      ).rejects.toThrow();
    },
    15_000
  );

  it("accepts issuer claims without a trailing slash when config includes one", () => {
    expect(
      buildAuthenticatedIdentity(
        {
          clientUrl: "http://localhost:8080",
          oidcClientId: "bbtodo-test",
          oidcClientSecret: "top-secret",
          oidcIssuer: "https://issuer.example.com/",
          oidcScopes: "openid profile email",
          sessionSecret: "12345678901234567890123456789012"
        },
        {
          aud: "bbtodo-test",
          email: "jwks@example.com",
          iss: "https://issuer.example.com",
          name: "Issuer Match",
          nonce: "expected-nonce",
          sub: "issuer-match-user"
        },
        "expected-nonce"
      )
    ).toMatchObject({
      email: "jwks@example.com",
      issuer: "https://issuer.example.com/",
      subject: "issuer-match-user"
    });
  });
});
