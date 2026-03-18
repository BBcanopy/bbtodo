import type { FastifyInstance } from "fastify";

import type { AppConfig } from "./config.js";
import type { OidcProvider } from "./oidc.js";

export const testConfig: AppConfig = {
  apiHost: "127.0.0.1",
  apiPort: 3000,
  publicOrigin: "http://localhost:5173",
  sessionSecret: "12345678901234567890123456789012",
  sessionTtlHours: 168,
  oidcIssuer: "https://issuer.example.com",
  oidcClientId: "bbtodo-test",
  oidcClientSecret: "top-secret",
  oidcScopes: "openid profile email"
};

export interface TestIdentity {
  displayName: string;
  email: string;
  subject: string;
}

export function createMutableMockOidcProvider(initialIdentity: TestIdentity) {
  let currentIdentity = initialIdentity;

  const provider: OidcProvider = {
    async createLoginRequest() {
      return {
        redirectUrl: "https://issuer.example.com/authorize?state=test-state",
        flowState: {
          codeVerifier: "test-code-verifier",
          nonce: "test-nonce",
          state: "test-state"
        }
      };
    },
    async completeLogin(callbackUrl, flowState) {
      if (
        callbackUrl.toString() !==
        "http://localhost:5173/auth/callback?code=auth-code&state=test-state"
      ) {
        throw new Error(`Unexpected callback URL: ${callbackUrl.toString()}`);
      }

      if (
        flowState.codeVerifier !== "test-code-verifier" ||
        flowState.nonce !== "test-nonce" ||
        flowState.state !== "test-state"
      ) {
        throw new Error("Unexpected OIDC flow state.");
      }

      return {
        issuer: testConfig.oidcIssuer,
        subject: currentIdentity.subject,
        email: currentIdentity.email,
        displayName: currentIdentity.displayName
      };
    }
  };

  return {
    provider,
    setIdentity(identity: TestIdentity) {
      currentIdentity = identity;
    }
  };
}

export async function loginWithOidc(app: FastifyInstance) {
  const loginResponse = await app.inject({
    method: "GET",
    url: "/auth/login"
  });

  const transactionCookie = loginResponse.cookies.find(
    (cookie) => cookie.name === "bbtodo_oidc"
  );
  if (!transactionCookie) {
    throw new Error("OIDC transaction cookie missing.");
  }

  const callbackResponse = await app.inject({
    method: "GET",
    url: "/auth/callback?code=auth-code&state=test-state",
    cookies: {
      bbtodo_oidc: transactionCookie.value
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
    sessionCookie: sessionCookie.value
  };
}
