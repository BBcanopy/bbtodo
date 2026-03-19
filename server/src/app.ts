import cookie from "@fastify/cookie";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import Fastify from "fastify";
import {
  jsonSchemaTransform,
  serializerCompiler,
  type ZodTypeProvider,
  validatorCompiler
} from "fastify-type-provider-zod";
import { z } from "zod";

import {
  apiTokenParamsSchema,
  apiTokenSummarySchema,
  createApiTokenBodySchema,
  createApiTokenResponseSchema,
  createLaneBodySchema,
  createProjectBodySchema,
  createTaskBodySchema,
  errorResponseSchema,
  laneParamsSchema,
  laneResponseSchema,
  listTasksQuerySchema,
  meResponseSchema,
  projectParamsSchema,
  projectResponseSchema,
  taskParamsSchema,
  taskTagsResponseSchema,
  taskResponseSchema,
  toApiTokenSummary,
  toLaneResponse,
  toMeResponse,
  toProjectResponse,
  toTaskResponse,
  updateLaneBodySchema,
  updateProjectBodySchema,
  updateThemeBodySchema,
  updateTaskBodySchema
} from "./api-schemas.js";
import type { AppConfig } from "./config.js";
import {
  SQLITE_DATABASE_PATH,
  type DatabaseClient,
  createApiToken,
  createLane,
  createDatabase,
  createProject,
  createSession,
  createTask,
  deleteOwnedApiToken,
  deleteOwnedProject,
  deleteOwnedTask,
  deleteSession,
  getUserForApiToken,
  getUserForSession,
  listLanesForProject,
  listApiTokensForUser,
  listProjectsForUser,
  listTaskTagsForUser,
  listTasksForProject,
  updateOwnedLane,
  updateOwnedProjectName,
  updateUserTheme,
  updateOwnedTask,
  upsertUser,
  type UserRecord
} from "./db.js";
import { authFlowStateSchema, createOidcProvider, type OidcProvider } from "./oidc.js";

const AUTH_FLOW_COOKIE = "bbtodo_oidc";
const SESSION_COOKIE = "bbtodo_session";
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const callbackQuerySchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
  iss: z.url().optional()
});

function isSecureCookie(clientUrl: string) {
  return new URL(clientUrl).protocol === "https:";
}

function parseSignedCookie(
  app: ReturnType<typeof Fastify>,
  rawCookieValue: string | undefined,
  schema: typeof authFlowStateSchema
) {
  if (!rawCookieValue) {
    return null;
  }

  const unsigned = app.unsignCookie(rawCookieValue);
  if (!unsigned.valid) {
    return null;
  }

  return schema.parse(JSON.parse(unsigned.value));
}

function getSignedSessionId(
  app: ReturnType<typeof Fastify>,
  rawCookieValue: string | undefined
) {
  if (!rawCookieValue) {
    return null;
  }

  const unsigned = app.unsignCookie(rawCookieValue);
  return unsigned.valid ? unsigned.value : null;
}

async function requireApiUser(
  app: ReturnType<typeof Fastify>,
  db: DatabaseClient,
  request: {
    headers: Record<string, string | string[] | undefined>;
    cookies: Record<string, string | undefined>;
  },
  reply: {
    clearCookie: ReturnType<typeof Fastify>["clearCookie"];
    status: ReturnType<typeof Fastify>["status"];
    send: ReturnType<typeof Fastify>["send"];
  }
) {
  const authorizationHeader = request.headers.authorization;
  const bearerToken =
    typeof authorizationHeader === "string" &&
    authorizationHeader.startsWith("Bearer ")
      ? authorizationHeader.slice("Bearer ".length).trim()
      : null;

  if (bearerToken) {
    const user = getUserForApiToken(db, bearerToken);
    if (!user) {
      reply.status(401).send({
        message: "Authentication required."
      });
      return null;
    }

    return user;
  }

  const sessionId = getSignedSessionId(app, request.cookies[SESSION_COOKIE]);
  if (!sessionId) {
    reply.status(401).send({
      message: "Authentication required."
    });
    return null;
  }

  const user = getUserForSession(db, sessionId);
  if (!user) {
    reply.clearCookie(SESSION_COOKIE, {
      path: "/"
    });
    reply.status(401).send({
      message: "Authentication required."
    });
    return null;
  }

  return user;
}

export function buildApp(options: {
  config: AppConfig;
  oidcProvider?: OidcProvider;
  sqlitePath?: string;
}) {
  const app = Fastify({
    logger: true
  });
  const database = createDatabase(options.sqlitePath ?? SQLITE_DATABASE_PATH);
  const oidcProvider = options.oidcProvider ?? createOidcProvider(options.config);
  const secureCookie = isSecureCookie(options.config.clientUrl);

  app.register(cookie, {
    secret: options.config.sessionSecret
  });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.register(swagger, {
    openapi: {
      info: {
        title: "bbtodo API",
        version: "0.1.0",
        description: "Minimal kanban and todo API for bbtodo."
      },
      openapi: "3.1.0",
      servers: [
        {
          url: options.config.clientUrl
        }
      ]
    },
    transform: jsonSchemaTransform
  });
  app.register(swaggerUi, {
    routePrefix: "/docs"
  });

  app.after(() => {
    const typedApp = app.withTypeProvider<ZodTypeProvider>();

  typedApp.route({
    method: "GET",
    url: "/health",
    schema: {
      response: {
        200: z.object({
          app: z.literal("bbtodo-server"),
          status: z.literal("ok")
        })
      },
      tags: ["system"]
    },
    handler: async () => ({
      app: "bbtodo-server",
      status: "ok"
    } as const)
  });

  typedApp.route({
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

  typedApp.route({
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

      const callbackUrl = new URL(
        request.raw.url ?? request.url,
        options.config.clientUrl
      );
      const identity = await oidcProvider.completeLogin(callbackUrl, flowState);
      const user = await upsertUser(database.db, identity);
      const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
      const session = createSession(database.db, {
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

  typedApp.route({
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
        deleteSession(database.db, sessionId);
      }

      reply.clearCookie(SESSION_COOKIE, {
        path: "/"
      });

      return reply.status(204).send(null);
    }
  });

  typedApp.route({
    method: "GET",
    url: "/api/v1/me",
    schema: {
      response: {
        200: meResponseSchema,
        401: errorResponseSchema
      },
      tags: ["auth"]
    },
    handler: async (request, reply) => {
      const user = await requireApiUser(app, database.db, request, reply);
      if (!user) {
        return;
      }

      return toMeResponse(user);
    }
  });

  typedApp.route({
    method: "PATCH",
    url: "/api/v1/me/theme",
    schema: {
      body: updateThemeBodySchema,
      response: {
        200: meResponseSchema,
        401: errorResponseSchema
      },
      tags: ["auth"]
    },
    handler: async (request, reply) => {
      const user = await requireApiUser(app, database.db, request, reply);
      if (!user) {
        return;
      }

      const updatedUser = updateUserTheme(database.db, {
        userId: user.id,
        theme: request.body.theme
      });

      return toMeResponse(updatedUser ?? user);
    }
  });

  typedApp.route({
    method: "GET",
    url: "/api/v1/api-tokens",
    schema: {
      response: {
        200: z.array(apiTokenSummarySchema),
        401: errorResponseSchema
      },
      tags: ["api-tokens"]
    },
    handler: async (request, reply) => {
      const user = await requireApiUser(app, database.db, request, reply);
      if (!user) {
        return;
      }

      return listApiTokensForUser(database.db, user.id).map(toApiTokenSummary);
    }
  });

  typedApp.route({
    method: "POST",
    url: "/api/v1/api-tokens",
    schema: {
      body: createApiTokenBodySchema,
      response: {
        201: createApiTokenResponseSchema,
        401: errorResponseSchema
      },
      tags: ["api-tokens"]
    },
    handler: async (request, reply) => {
      const user = await requireApiUser(app, database.db, request, reply);
      if (!user) {
        return;
      }

      const token = createApiToken(database.db, user.id, request.body.name.trim());
      return reply.status(201).send({
        token: token.rawToken,
        tokenInfo: toApiTokenSummary(token.token)
      });
    }
  });

  typedApp.route({
    method: "DELETE",
    url: "/api/v1/api-tokens/:tokenId",
    schema: {
      params: apiTokenParamsSchema,
      response: {
        204: z.null(),
        401: errorResponseSchema,
        404: errorResponseSchema
      },
      tags: ["api-tokens"]
    },
    handler: async (request, reply) => {
      const user = await requireApiUser(app, database.db, request, reply);
      if (!user) {
        return;
      }

      const deleted = deleteOwnedApiToken(database.db, user.id, request.params.tokenId);
      if (!deleted) {
        return reply.status(404).send({
          message: "API token not found."
        });
      }

      return reply.status(204).send(null);
    }
  });

  typedApp.route({
    method: "GET",
    url: "/api/v1/task-tags",
    schema: {
      response: {
        200: taskTagsResponseSchema,
        401: errorResponseSchema
      },
      tags: ["tags"]
    },
    handler: async (request, reply) => {
      const user = await requireApiUser(app, database.db, request, reply);
      if (!user) {
        return;
      }

      return taskTagsResponseSchema.parse(listTaskTagsForUser(database.db, user.id));
    }
  });

  typedApp.route({
    method: "GET",
    url: "/api/v1/projects",
    schema: {
      response: {
        200: z.array(projectResponseSchema),
        401: errorResponseSchema
      },
      tags: ["projects"]
    },
    handler: async (request, reply) => {
      const user = await requireApiUser(app, database.db, request, reply);
      if (!user) {
        return;
      }

      return listProjectsForUser(database.db, user.id).map((project) =>
        toProjectResponse(project, project.taskCounts, project.laneSummaries)
      );
    }
  });

  typedApp.route({
    method: "POST",
    url: "/api/v1/projects",
    schema: {
      body: createProjectBodySchema,
      response: {
        201: projectResponseSchema,
        401: errorResponseSchema
      },
      tags: ["projects"]
    },
    handler: async (request, reply) => {
      const user = await requireApiUser(app, database.db, request, reply);
      if (!user) {
        return;
      }

      const project = createProject(database.db, user.id, request.body.name.trim());
      const laneSummaries = listLanesForProject(database.db, {
        userId: user.id,
        projectId: project.id
      });

      return reply
        .status(201)
        .send(toProjectResponse(project, undefined, laneSummaries ?? []));
    }
  });

  typedApp.route({
    method: "PATCH",
    url: "/api/v1/projects/:projectId",
    schema: {
      body: updateProjectBodySchema,
      params: projectParamsSchema,
      response: {
        200: projectResponseSchema,
        401: errorResponseSchema,
        404: errorResponseSchema
      },
      tags: ["projects"]
    },
    handler: async (request, reply) => {
      const user = await requireApiUser(app, database.db, request, reply);
      if (!user) {
        return;
      }

      const project = updateOwnedProjectName(database.db, {
        name: request.body.name.trim(),
        projectId: request.params.projectId,
        userId: user.id
      });
      if (!project) {
        return reply.status(404).send({
          message: "Project not found."
        });
      }

      const laneSummaries = listLanesForProject(database.db, {
        userId: user.id,
        projectId: project.id
      });

      return toProjectResponse(project, undefined, laneSummaries ?? []);
    }
  });

  typedApp.route({
    method: "DELETE",
    url: "/api/v1/projects/:projectId",
    schema: {
      params: projectParamsSchema,
      response: {
        204: z.null(),
        401: errorResponseSchema,
        404: errorResponseSchema
      },
      tags: ["projects"]
    },
    handler: async (request, reply) => {
      const user = await requireApiUser(app, database.db, request, reply);
      if (!user) {
        return;
      }

      const deleted = deleteOwnedProject(database.db, user.id, request.params.projectId);
      if (!deleted) {
        return reply.status(404).send({
          message: "Project not found."
        });
      }

      return reply.status(204).send(null);
    }
  });

  typedApp.route({
    method: "GET",
    url: "/api/v1/projects/:projectId/lanes",
    schema: {
      params: projectParamsSchema,
      response: {
        200: z.array(laneResponseSchema),
        401: errorResponseSchema,
        404: errorResponseSchema
      },
      tags: ["lanes"]
    },
    handler: async (request, reply) => {
      const user = await requireApiUser(app, database.db, request, reply);
      if (!user) {
        return;
      }

      const projectLanes = listLanesForProject(database.db, {
        userId: user.id,
        projectId: request.params.projectId
      });
      if (!projectLanes) {
        return reply.status(404).send({
          message: "Project not found."
        });
      }

      return projectLanes.map(toLaneResponse);
    }
  });

  typedApp.route({
    method: "POST",
    url: "/api/v1/projects/:projectId/lanes",
    schema: {
      body: createLaneBodySchema,
      params: projectParamsSchema,
      response: {
        201: laneResponseSchema,
        401: errorResponseSchema,
        404: errorResponseSchema
      },
      tags: ["lanes"]
    },
    handler: async (request, reply) => {
      const user = await requireApiUser(app, database.db, request, reply);
      if (!user) {
        return;
      }

      const lane = createLane(database.db, {
        userId: user.id,
        projectId: request.params.projectId,
        name: request.body.name.trim()
      });
      if (!lane) {
        return reply.status(404).send({
          message: "Project not found."
        });
      }

      return reply.status(201).send(toLaneResponse(lane));
    }
  });

  typedApp.route({
    method: "PATCH",
    url: "/api/v1/projects/:projectId/lanes/:laneId",
    schema: {
      body: updateLaneBodySchema,
      params: laneParamsSchema,
      response: {
        200: laneResponseSchema,
        401: errorResponseSchema,
        404: errorResponseSchema
      },
      tags: ["lanes"]
    },
    handler: async (request, reply) => {
      const user = await requireApiUser(app, database.db, request, reply);
      if (!user) {
        return;
      }

      const lane = updateOwnedLane(database.db, {
        userId: user.id,
        projectId: request.params.projectId,
        laneId: request.params.laneId,
        position: request.body.position
      });
      if (!lane) {
        return reply.status(404).send({
          message: "Lane not found."
        });
      }

      const projectLanes = listLanesForProject(database.db, {
        userId: user.id,
        projectId: request.params.projectId
      });
      const updatedLane = projectLanes?.find((candidate) => candidate.id === lane.id);

      return toLaneResponse(updatedLane ?? lane);
    }
  });

  typedApp.route({
    method: "GET",
    url: "/api/v1/projects/:projectId/tasks",
    schema: {
      params: projectParamsSchema,
      querystring: listTasksQuerySchema,
      response: {
        200: z.array(taskResponseSchema),
        401: errorResponseSchema,
        404: errorResponseSchema
      },
      tags: ["tasks"]
    },
    handler: async (request, reply) => {
      const user = await requireApiUser(app, database.db, request, reply);
      if (!user) {
        return;
      }

      const tasks = listTasksForProject(database.db, {
        userId: user.id,
        projectId: request.params.projectId,
        status: request.query.status
      });
      if (!tasks) {
        return reply.status(404).send({
          message: "Project not found."
        });
      }

      return tasks.map(toTaskResponse);
    }
  });

  typedApp.route({
    method: "POST",
    url: "/api/v1/projects/:projectId/tasks",
    schema: {
      body: createTaskBodySchema,
      params: projectParamsSchema,
      response: {
        201: taskResponseSchema,
        401: errorResponseSchema,
        404: errorResponseSchema
      },
      tags: ["tasks"]
    },
    handler: async (request, reply) => {
      const user = await requireApiUser(app, database.db, request, reply);
      if (!user) {
        return;
      }

      const task = createTask(database.db, {
        userId: user.id,
        projectId: request.params.projectId,
        title: request.body.title.trim(),
        body: request.body.body,
        laneId: request.body.laneId,
        tags: request.body.tags
      });
      if (!task) {
        return reply.status(404).send({
          message: "Project or lane not found."
        });
      }

      return reply.status(201).send(toTaskResponse(task));
    }
  });

  typedApp.route({
    method: "PATCH",
    url: "/api/v1/projects/:projectId/tasks/:taskId",
    schema: {
      body: updateTaskBodySchema,
      params: taskParamsSchema,
      response: {
        200: taskResponseSchema,
        401: errorResponseSchema,
        404: errorResponseSchema
      },
      tags: ["tasks"]
    },
    handler: async (request, reply) => {
      const user = await requireApiUser(app, database.db, request, reply);
      if (!user) {
        return;
      }

      const task = updateOwnedTask(database.db, {
        userId: user.id,
        projectId: request.params.projectId,
        taskId: request.params.taskId,
        title: request.body.title?.trim(),
        body: request.body.body,
        laneId: request.body.laneId,
        tags: request.body.tags,
        position: request.body.position,
        status: request.body.status
      });
      if (!task) {
        return reply.status(404).send({
          message: "Task or lane not found."
        });
      }

      return toTaskResponse(task);
    }
  });

  typedApp.route({
    method: "DELETE",
    url: "/api/v1/projects/:projectId/tasks/:taskId",
    schema: {
      params: taskParamsSchema,
      response: {
        204: z.null(),
        401: errorResponseSchema,
        404: errorResponseSchema
      },
      tags: ["tasks"]
    },
    handler: async (request, reply) => {
      const user = await requireApiUser(app, database.db, request, reply);
      if (!user) {
        return;
      }

      const deleted = deleteOwnedTask(database.db, {
        userId: user.id,
        projectId: request.params.projectId,
        taskId: request.params.taskId
      });
      if (!deleted) {
        return reply.status(404).send({
          message: "Task not found."
        });
      }

      return reply.status(204).send(null);
    }
  });

  typedApp.route({
    method: "GET",
    url: "/docs/openapi.json",
    schema: {
      hide: true
    },
    handler: async () => app.swagger()
  });

  });

  app.addHook("onClose", async () => {
    database.database.close();
  });

  return app;
}
