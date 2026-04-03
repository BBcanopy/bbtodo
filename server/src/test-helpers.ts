import type { FastifyInstance } from "fastify";

import type { AppConfig } from "./config.js";
import {
  OIDC_NONCE_COOKIE,
  OIDC_STATE_COOKIE,
  OIDC_VERIFIER_COOKIE,
  normalizeIssuer,
  type JwtVerifier,
  type OidcAuthTestingOptions,
  type OidcOAuth2Namespace,
  type OidcOAuthToken
} from "./oidc.js";

export const testConfig: AppConfig = {
  clientUrl: "http://localhost:5173",
  sessionSecret: "12345678901234567890123456789012",
  oidcIssuer: "https://issuer.example.com",
  oidcClientId: "bbtodo-test",
  oidcClientSecret: "top-secret",
  oidcScopes: "openid profile email offline_access"
};

export interface TestIdentity {
  displayName: string;
  email: string;
  subject: string;
}

interface MockVerifiedClaims {
  aud: string | string[];
  azp?: string;
  email?: string;
  iss: string;
  name?: string;
  nonce?: string;
  preferred_username?: string;
  sub?: string;
}

function buildMockToken(
  accessToken: string,
  options?: {
    expiresIn?: number;
    idToken?: string;
    refreshToken?: string;
  }
): OidcOAuthToken {
  const expiresIn = options?.expiresIn ?? 60 * 60;

  return {
    access_token: accessToken,
    expires_at: new Date(Date.now() + expiresIn * 1000),
    expires_in: expiresIn,
    id_token: options?.idToken,
    refresh_token: options?.refreshToken,
    token_type: "Bearer"
  };
}

export function createMutableMockOidcProvider(initialIdentity: TestIdentity) {
  let currentIdentity = initialIdentity;
  let currentVerifierError: Error | null = null;
  let currentRefreshError: Error | null = null;
  let currentClaimsOverrides: Partial<MockVerifiedClaims> = {};
  let currentExpectedNonce = "test-nonce";
  let currentRefreshToken = "test-refresh-token";
  let refreshCallCount = 0;
  let refreshDelayMs = 0;
  let shouldOmitIdToken = false;
  let shouldOmitInitialRefreshToken = false;
  let shouldOmitRefreshedRefreshToken = false;
  let refreshResponseAccessToken = "test-access-token-refreshed";
  let refreshResponseIdToken = "test-id-token-refreshed";
  let refreshResponseRefreshToken = "test-refresh-token-refreshed";

  function getClaims() {
    const baseClaims: MockVerifiedClaims = {
      aud: testConfig.oidcClientId,
      email: currentIdentity.email,
      iss: normalizeIssuer(testConfig.oidcIssuer),
      name: currentIdentity.displayName,
      nonce: currentExpectedNonce,
      sub: currentIdentity.subject
    };

    return {
      ...baseClaims,
      ...currentClaimsOverrides
    };
  }

  const oauth2Namespace: OidcOAuth2Namespace = {
    async generateAuthorizationUri(_request, reply) {
      reply.setCookie(OIDC_STATE_COOKIE, "test-state", {
        httpOnly: true,
        path: "/auth",
        sameSite: "lax"
      });
      reply.setCookie(OIDC_VERIFIER_COOKIE, "test-code-verifier", {
        httpOnly: true,
        path: "/auth",
        sameSite: "lax"
      });

      return "https://issuer.example.com/authorize?state=test-state";
    },
    async getAccessTokenFromAuthorizationCodeFlow(request, reply) {
      if (
        request.url !==
        `/auth/callback?code=auth-code&state=test-state&iss=${encodeURIComponent(testConfig.oidcIssuer)}`
      ) {
        throw new Error(`Unexpected callback URL: ${request.url}`);
      }

      if (
        request.cookies[OIDC_STATE_COOKIE] !== "test-state" ||
        request.cookies[OIDC_VERIFIER_COOKIE] !== "test-code-verifier"
      ) {
        throw new Error("Unexpected OIDC state or verifier cookies.");
      }

      reply.clearCookie(OIDC_STATE_COOKIE, {
        path: "/auth"
      });
      reply.clearCookie(OIDC_VERIFIER_COOKIE, {
        path: "/auth"
      });

      return {
        token: buildMockToken("test-access-token", {
          idToken: shouldOmitIdToken ? undefined : "test-id-token",
          refreshToken: shouldOmitInitialRefreshToken ? undefined : currentRefreshToken
        })
      };
    },
    async getNewAccessTokenUsingRefreshToken(refreshToken) {
      refreshCallCount += 1;

      if (refreshDelayMs > 0) {
        await new Promise((resolve) => {
          setTimeout(resolve, refreshDelayMs);
        });
      }

      if (currentRefreshError) {
        throw currentRefreshError;
      }

      if (!refreshToken.refresh_token || refreshToken.refresh_token !== currentRefreshToken) {
        throw new Error(`Unexpected refresh token: ${refreshToken.refresh_token ?? "<missing>"}`);
      }

      const nextRefreshToken = shouldOmitRefreshedRefreshToken
        ? undefined
        : refreshResponseRefreshToken;

      if (nextRefreshToken) {
        currentRefreshToken = nextRefreshToken;
      }

      return {
        token: buildMockToken(refreshResponseAccessToken, {
          idToken: refreshResponseIdToken,
          refreshToken: nextRefreshToken
        })
      };
    }
  };

  const jwtVerifier: JwtVerifier = {
    async verify(token) {
      if (token !== "test-id-token") {
        throw new Error(`Unexpected id token: ${token}`);
      }

      if (currentVerifierError) {
        throw currentVerifierError;
      }

      return getClaims();
    }
  };

  return {
    authTesting: {
      jwtVerifier,
      onAuthorizationNonce(nonce: string) {
        currentExpectedNonce = nonce;
      },
      oauth2Namespace
    } satisfies OidcAuthTestingOptions,
    getRefreshCallCount() {
      return refreshCallCount;
    },
    provider: {
      jwtVerifier,
      onAuthorizationNonce(nonce: string) {
        currentExpectedNonce = nonce;
      },
      oauth2Namespace
    } satisfies OidcAuthTestingOptions,
    setClaimsOverrides(overrides: Partial<MockVerifiedClaims>) {
      currentClaimsOverrides = overrides;
    },
    setIdentity(identity: TestIdentity) {
      currentIdentity = identity;
      currentClaimsOverrides = {};
      currentExpectedNonce = "test-nonce";
      currentRefreshError = null;
      currentRefreshToken = "test-refresh-token";
      currentVerifierError = null;
      refreshCallCount = 0;
      refreshDelayMs = 0;
      refreshResponseAccessToken = "test-access-token-refreshed";
      refreshResponseIdToken = "test-id-token-refreshed";
      refreshResponseRefreshToken = "test-refresh-token-refreshed";
      shouldOmitIdToken = false;
      shouldOmitInitialRefreshToken = false;
      shouldOmitRefreshedRefreshToken = false;
    },
    setMissingIdToken(value: boolean) {
      shouldOmitIdToken = value;
    },
    setMissingRefreshToken(value: boolean) {
      shouldOmitInitialRefreshToken = value;
    },
    setMissingRefreshTokenOnRefresh(value: boolean) {
      shouldOmitRefreshedRefreshToken = value;
    },
    setRefreshError(error: Error | null) {
      currentRefreshError = error;
    },
    setRefreshDelayMs(value: number) {
      refreshDelayMs = value;
    },
    setRefreshResponse(options: {
      accessToken?: string;
      idToken?: string;
      refreshToken?: string;
    }) {
      refreshResponseAccessToken = options.accessToken ?? refreshResponseAccessToken;
      refreshResponseIdToken = options.idToken ?? refreshResponseIdToken;
      refreshResponseRefreshToken = options.refreshToken ?? refreshResponseRefreshToken;
    },
    setVerifierError(error: Error | null) {
      currentVerifierError = error;
    }
  };
}

export async function loginWithOidc(app: FastifyInstance) {
  const loginResponse = await app.inject({
    method: "GET",
    url: "/auth/login"
  });

  const nonceCookie = loginResponse.cookies.find(
    (cookie) => cookie.name === OIDC_NONCE_COOKIE
  );
  const stateCookie = loginResponse.cookies.find(
    (cookie) => cookie.name === OIDC_STATE_COOKIE
  );
  const verifierCookie = loginResponse.cookies.find(
    (cookie) => cookie.name === OIDC_VERIFIER_COOKIE
  );
  if (!nonceCookie || !stateCookie || !verifierCookie) {
    throw new Error("OIDC login cookies missing.");
  }

  const redirectLocation = loginResponse.headers.location;
  if (!redirectLocation) {
    throw new Error("OIDC login redirect URL missing.");
  }

  const redirectUrl = new URL(redirectLocation);
  const nonce = redirectUrl.searchParams.get("nonce");
  if (!nonce) {
    throw new Error("OIDC nonce missing from login redirect URL.");
  }
  const oidcTestControls = (app as FastifyInstance & {
    oidcTestControls?: OidcAuthTestingOptions;
  }).oidcTestControls;
  oidcTestControls?.onAuthorizationNonce?.(nonce);

  const callbackResponse = await app.inject({
    method: "GET",
    url: `/auth/callback?code=auth-code&state=test-state&iss=${encodeURIComponent(testConfig.oidcIssuer)}`,
    cookies: {
      [OIDC_NONCE_COOKIE]: nonceCookie.value,
      [OIDC_STATE_COOKIE]: stateCookie.value,
      [OIDC_VERIFIER_COOKIE]: verifierCookie.value
    }
  });

  const sessionCookie = callbackResponse.cookies.find(
    (cookie) => cookie.name === "bbtodo_session"
  );
  if (!sessionCookie) {
    throw new Error("Session cookie missing.");
  }

  return {
    callbackResponse,
    loginResponse,
    sessionCookie: sessionCookie.value,
    sessionCookieRecord: sessionCookie
  };
}
