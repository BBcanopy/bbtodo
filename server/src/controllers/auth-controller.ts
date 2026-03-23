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
import { authFlowStateSchema, type OidcProvider } from "../oidc.js";
import {
  AUTH_FLOW_COOKIE,
  SESSION_COOKIE,
  SESSION_TTL_MS,
  apiDocsSecurity,
  getSignedSessionId,
  parseSignedCookie,
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
    oidcProvider: OidcProvider;
    secureCookie: boolean;
  }
) {
  const { config, database, oidcProvider, secureCookie } = options;

  app.route({
    method: "GET",
    url: "/auth/login",
    schema: {
      response: {
        302: z.null()
      },
      tags: ["auth"]
    },
    handler: async (_request, reply) => {
      const loginRequest = await oidcProvider.createLoginRequest();
      reply.setCookie(AUTH_FLOW_COOKIE, JSON.stringify(loginRequest.flowState), {
        httpOnly: true,
        maxAge: 10 * 60,
        path: "/auth",
        sameSite: "lax",
        secure: secureCookie,
        signed: true
      });

      return reply.redirect(loginRequest.redirectUrl);
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
      const flowState = parseSignedCookie(
        app,
        request.cookies[AUTH_FLOW_COOKIE],
        authFlowStateSchema
      );

      if (!flowState) {
        return reply.status(400).send({
          message: "Missing or invalid OIDC flow cookie."
        });
      }

      const callbackUrl = new URL(request.raw.url ?? request.url, config.clientUrl);
      const identity = await oidcProvider.completeLogin(callbackUrl, flowState);
      const user = await upsertUser(database, identity);
      const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
      const session = createSession(database, {
        userId: user.id,
        expiresAt
      });

      reply.clearCookie(AUTH_FLOW_COOKIE, {
        path: "/auth"
      });
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
      const sessionId = getSignedSessionId(app, request.cookies[SESSION_COOKIE]);
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
