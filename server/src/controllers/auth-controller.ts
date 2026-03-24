import type { FastifyReply } from "fastify";
import { z } from "zod";

import {
  errorResponseSchema,
  meResponseSchema,
  toMeResponse,
  updateThemeBodySchema
} from "../api-schemas.js";
import type { AppConfig } from "../config.js";
import {
  createSession,
  deleteSession,
  updateUserTheme,
  upsertUser,
  type DatabaseClient
} from "../db.js";
import {
  OIDC_NONCE_COOKIE,
  OIDC_OAUTH_NAMESPACE,
  OIDC_STATE_COOKIE,
  OIDC_VERIFIER_COOKIE,
  buildAuthenticatedIdentity,
  buildAuthorizationRedirectUrl,
  createOidcNonce,
  type JwksSecretResolver,
  type JwtVerifier,
  type OidcOAuth2Namespace,
  verifyOidcIdToken
} from "../oidc.js";
import {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  apiDocsSecurity,
  getSignedCookieValue,
  requireApiUser,
  type TypedApp
} from "./controller-support.js";

const callbackQuerySchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
  iss: z.url().optional()
});

export function registerAuthController(
  app: TypedApp,
  options: {
    config: AppConfig;
    database: DatabaseClient;
    secureCookie: boolean;
  }
) {
  const { config, database, secureCookie } = options;
  const authApp = app as TypedApp & {
    [OIDC_OAUTH_NAMESPACE]: OidcOAuth2Namespace;
    jwt: JwtVerifier;
    oidcJwksSecretResolver?: JwksSecretResolver;
  };

  function clearOidcCookies(reply: {
    clearCookie: FastifyReply["clearCookie"];
  }) {
    reply.clearCookie(OIDC_NONCE_COOKIE, {
      path: "/auth"
    });
    reply.clearCookie(OIDC_STATE_COOKIE, {
      path: "/auth"
    });
    reply.clearCookie(OIDC_VERIFIER_COOKIE, {
      path: "/auth"
    });
  }

  app.route({
    method: "GET",
    url: "/auth/login",
    schema: {
      response: {
        302: z.null()
      },
      tags: ["auth"]
    },
    handler: async (request, reply) => {
      const nonce = createOidcNonce();
      reply.setCookie(OIDC_NONCE_COOKIE, nonce, {
        httpOnly: true,
        maxAge: 10 * 60,
        path: "/auth",
        sameSite: "lax",
        secure: secureCookie,
        signed: true
      });

      const authorizationUri = await authApp[OIDC_OAUTH_NAMESPACE].generateAuthorizationUri(
        request,
        reply
      );
      return reply.redirect(buildAuthorizationRedirectUrl(authorizationUri, nonce));
    }
  });

  app.route({
    method: "GET",
    url: "/auth/callback",
    schema: {
      querystring: callbackQuerySchema,
      response: {
        302: z.null(),
        400: errorResponseSchema
      },
      tags: ["auth"]
    },
    handler: async (request, reply) => {
      const nonce = getSignedCookieValue(app, request.cookies[OIDC_NONCE_COOKIE]);

      if (!nonce) {
        return reply.status(400).send({
          message: "Missing or invalid OIDC nonce cookie."
        });
      }

      let tokenResponse:
        | Awaited<
            ReturnType<OidcOAuth2Namespace["getAccessTokenFromAuthorizationCodeFlow"]>
          >
        | undefined;
      try {
        tokenResponse = await authApp[
          OIDC_OAUTH_NAMESPACE
        ].getAccessTokenFromAuthorizationCodeFlow(request, reply);
      } catch {
        clearOidcCookies(reply);
        return reply.status(400).send({
          message: "OIDC code exchange failed."
        });
      }

      const idToken = tokenResponse.token.id_token;
      if (!idToken) {
        clearOidcCookies(reply);
        return reply.status(400).send({
          message: "OIDC provider did not return an id_token."
        });
      }

      let verifiedClaims: unknown;
      try {
        verifiedClaims = await verifyOidcIdToken({
          idToken,
          jwtVerifier: authApp.jwt,
          jwksSecretResolver: authApp.oidcJwksSecretResolver
        });
      } catch (error) {
        app.log.warn({ err: error }, "OIDC id_token validation failed.");
        clearOidcCookies(reply);
        return reply.status(400).send({
          message: "OIDC id_token validation failed."
        });
      }

      let identity;
      try {
        identity = buildAuthenticatedIdentity(config, verifiedClaims, nonce);
      } catch (error) {
        clearOidcCookies(reply);
        return reply.status(400).send({
          message:
            error instanceof z.ZodError
              ? error.issues[0]?.message ?? "OIDC identity claims were invalid."
              : error instanceof Error
              ? error.message
              : "OIDC identity claims were invalid."
        });
      }

      const user = await upsertUser(database, identity);
      const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
      const session = createSession(database, {
        userId: user.id,
        expiresAt
      });

      clearOidcCookies(reply);
      reply.setCookie(SESSION_COOKIE, session.id, {
        expires: new Date(expiresAt),
        httpOnly: true,
        path: "/",
        sameSite: "lax",
        secure: secureCookie,
        signed: true
      });

      return reply.redirect("/");
    }
  });

  app.route({
    method: "POST",
    url: "/auth/logout",
    schema: {
      response: {
        204: z.null()
      },
      tags: ["auth"]
    },
    handler: async (request, reply) => {
      const sessionId = getSignedCookieValue(app, request.cookies[SESSION_COOKIE]);
      if (sessionId) {
        deleteSession(database, sessionId);
      }

      reply.clearCookie(SESSION_COOKIE, {
        path: "/"
      });

      return reply.status(204).send(null);
    }
  });

  app.route({
    method: "GET",
    url: "/api/v1/me",
    schema: {
      security: apiDocsSecurity,
      response: {
        200: meResponseSchema,
        401: errorResponseSchema
      },
      tags: ["auth"]
    },
    handler: async (request, reply) => {
      const user = await requireApiUser(app, database, request, reply);
      if (!user) {
        return;
      }

      return toMeResponse(user);
    }
  });

  app.route({
    method: "PATCH",
    url: "/api/v1/me/theme",
    schema: {
      body: updateThemeBodySchema,
      security: apiDocsSecurity,
      response: {
        200: meResponseSchema,
        401: errorResponseSchema
      },
      tags: ["auth"]
    },
    handler: async (request, reply) => {
      const user = await requireApiUser(app, database, request, reply);
      if (!user) {
        return;
      }

      const updatedUser = updateUserTheme(database, {
        userId: user.id,
        theme: request.body.theme
      });

      return toMeResponse(updatedUser ?? user);
    }
  });
}
