import { z } from "zod";

import {
  apiTokenParamsSchema,
  apiTokenSummarySchema,
  createApiTokenBodySchema,
  createApiTokenResponseSchema,
  errorResponseSchema,
  toApiTokenSummary
} from "../api-schemas.js";
import {
  createApiToken,
  deleteOwnedApiToken,
  listApiTokensForUser,
  type DatabaseClient
} from "../db.js";
import {
  apiDocsSecurity,
  requireApiUser,
  requireSessionApiUser,
  sessionDocsSecurity,
  type TypedApp
} from "./controller-support.js";

export function registerApiTokensController(
  app: TypedApp,
  options: {
    database: DatabaseClient;
  }
) {
  const { database } = options;

  app.route({
    method: "GET",
    url: "/api/v1/api-tokens",
    schema: {
      security: apiDocsSecurity,
      response: {
        200: z.array(apiTokenSummarySchema),
        401: errorResponseSchema
      },
      tags: ["api-tokens"]
    },
    handler: async (request, reply) => {
      const user = await requireApiUser(app, database, request, reply);
      if (!user) {
        return;
      }

      return listApiTokensForUser(database, user.id).map(toApiTokenSummary);
    }
  });

  app.route({
    method: "POST",
    url: "/api/v1/api-tokens",
    schema: {
      body: createApiTokenBodySchema,
      security: sessionDocsSecurity,
      response: {
        201: createApiTokenResponseSchema,
        403: errorResponseSchema,
        401: errorResponseSchema
      },
      tags: ["api-tokens"]
    },
    handler: async (request, reply) => {
      const user = await requireSessionApiUser(app, database, request, reply);
      if (!user) {
        return;
      }

      const token = createApiToken(database, user.id, request.body.name.trim());
      return reply.status(201).send({
        token: token.rawToken,
        tokenInfo: toApiTokenSummary(token.token)
      });
    }
  });

  app.route({
    method: "DELETE",
    url: "/api/v1/api-tokens/:tokenId",
    schema: {
      params: apiTokenParamsSchema,
      security: apiDocsSecurity,
      response: {
        204: z.null(),
        401: errorResponseSchema,
        404: errorResponseSchema
      },
      tags: ["api-tokens"]
    },
    handler: async (request, reply) => {
      const user = await requireApiUser(app, database, request, reply);
      if (!user) {
        return;
      }

      const deleted = deleteOwnedApiToken(database, user.id, request.params.tokenId);
      if (!deleted) {
        return reply.status(404).send({
          message: "API token not found."
        });
      }

      return reply.status(204).send(null);
    }
  });
}
