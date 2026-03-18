import * as oidc from "openid-client";
import { z } from "zod";

import type { AppConfig } from "./config.js";

export const authFlowStateSchema = z.object({
  codeVerifier: z.string().min(1),
  nonce: z.string().min(1),
  state: z.string().min(1)
});

export type AuthFlowState = z.infer<typeof authFlowStateSchema>;

export interface AuthenticatedIdentity {
  issuer: string;
  subject: string;
  email: string | null;
  displayName: string | null;
}

export interface OidcProvider {
  createLoginRequest(): Promise<{
    redirectUrl: string;
    flowState: AuthFlowState;
  }>;
  completeLogin(
    callbackUrl: URL,
    flowState: AuthFlowState
  ): Promise<AuthenticatedIdentity>;
}

function resolveClientAuthentication(config: AppConfig) {
  if (config.oidcClientSecret) {
    return {
      clientMetadata: {
        client_secret: config.oidcClientSecret,
        redirect_uris: [`${config.clientUrl}/auth/callback`],
        response_types: ["code"]
      },
      clientAuth: oidc.ClientSecretPost(config.oidcClientSecret)
    };
  }

  return {
    clientMetadata: {
      redirect_uris: [`${config.clientUrl}/auth/callback`],
      response_types: ["code"],
      token_endpoint_auth_method: "none"
    },
    clientAuth: oidc.None()
  };
}

export function createOidcProvider(config: AppConfig): OidcProvider {
  const authConfigPromise = oidc.discovery(
    new URL(config.oidcIssuer),
    config.oidcClientId,
    resolveClientAuthentication(config).clientMetadata,
    resolveClientAuthentication(config).clientAuth
  );

  return {
    async createLoginRequest() {
      const authConfig = await authConfigPromise;
      const codeVerifier = oidc.randomPKCECodeVerifier();
      const nonce = oidc.randomNonce();
      const state = oidc.randomState();
      const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);

      const redirectUrl = oidc.buildAuthorizationUrl(authConfig, {
        response_type: "code",
        redirect_uri: `${config.clientUrl}/auth/callback`,
        scope: config.oidcScopes,
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
        nonce,
        state
      });

      return {
        redirectUrl: redirectUrl.toString(),
        flowState: {
          codeVerifier,
          nonce,
          state
        }
      };
    },
    async completeLogin(callbackUrl, flowState) {
      const authConfig = await authConfigPromise;
      const tokens = await oidc.authorizationCodeGrant(authConfig, callbackUrl, {
        pkceCodeVerifier: flowState.codeVerifier,
        expectedNonce: flowState.nonce,
        expectedState: flowState.state,
        idTokenExpected: true
      });
      const claims = tokens.claims();

      if (!claims?.sub) {
        throw new Error("OIDC provider did not return a subject claim.");
      }

      let userInfo:
        | Record<string, string | undefined>
        | undefined;

      const userInfoEndpoint = authConfig.serverMetadata().userinfo_endpoint;
      if (userInfoEndpoint && tokens.access_token) {
        const response = await oidc.fetchUserInfo(
          authConfig,
          tokens.access_token,
          claims.sub
        );
        userInfo = response as Record<string, string | undefined>;
      }

      return {
        issuer: new URL(config.oidcIssuer).toString(),
        subject: claims.sub,
        email:
          userInfo?.email ??
          (typeof claims.email === "string" ? claims.email : null),
        displayName:
          userInfo?.name ??
          userInfo?.preferred_username ??
          (typeof claims.name === "string" ? claims.name : null) ??
          (typeof claims.preferred_username === "string"
            ? claims.preferred_username
            : null)
      };
    }
  };
}
