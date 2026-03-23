import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

import {
  getUserForApiToken,
  getUserForSession,
  type DatabaseClient,
  type UserRecord
} from "../db.js";

export const AUTH_FLOW_COOKIE = "bbtodo_oidc";
export const SESSION_COOKIE = "bbtodo_session";
export const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export const apiDocsSecurity: Array<Record<string, string[]>> = [
  { apiToken: [] },
  { sessionCookie: [] }
];
export const sessionDocsSecurity: Array<Record<string, string[]>> = [{ sessionCookie: [] }];

export function withZodTypeProvider(app: FastifyInstance) {
  return app.withTypeProvider<ZodTypeProvider>();
}

export type TypedApp = ReturnType<typeof withZodTypeProvider>;

type AuthRequest = Pick<FastifyRequest, "headers" | "cookies">;
type AuthReply = Pick<FastifyReply, "clearCookie" | "status" | "send">;

export function parseSignedCookie<TSchema extends z.ZodTypeAny>(
  app: FastifyInstance,
  rawCookieValue: string | undefined,
  schema: TSchema
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

export function getSignedSessionId(app: FastifyInstance, rawCookieValue: string | undefined) {
  if (!rawCookieValue) {
    return null;
  }

  const unsigned = app.unsignCookie(rawCookieValue);
  return unsigned.valid ? unsigned.value : null;
}

export interface ApiAuthContext {
  source: "bearer" | "session";
  user: UserRecord;
}

export function getApiAuthContext(
  app: FastifyInstance,
  db: DatabaseClient,
  request: AuthRequest,
  reply: AuthReply
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

    return {
      source: "bearer",
      user
    } satisfies ApiAuthContext;
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

  return {
    source: "session",
    user
  } satisfies ApiAuthContext;
}

export async function requireApiUser(
  app: FastifyInstance,
  db: DatabaseClient,
  request: AuthRequest,
  reply: AuthReply
) {
  const auth = getApiAuthContext(app, db, request, reply);
  return auth?.user ?? null;
}

export async function requireSessionApiUser(
  app: FastifyInstance,
  db: DatabaseClient,
  request: AuthRequest,
  reply: AuthReply
) {
  const auth = getApiAuthContext(app, db, request, reply);
  if (!auth) {
    return null;
  }

  if (auth.source === "bearer") {
    reply.status(403).send({
      message: "API tokens cannot create API tokens."
    });
    return null;
  }

  return auth.user;
}
