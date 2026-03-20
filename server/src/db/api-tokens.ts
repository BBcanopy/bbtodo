import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { and, desc, eq } from "drizzle-orm";

import { apiTokens, type DatabaseClient, users } from "./schema.js";

function hashApiTokenSecret(salt: string, secret: string) {
  return createHash("sha256").update(`${salt}.${secret}`).digest("hex");
}

export function listApiTokensForUser(db: DatabaseClient, userId: string) {
  return db
    .select()
    .from(apiTokens)
    .where(eq(apiTokens.userId, userId))
    .orderBy(desc(apiTokens.updatedAt))
    .all();
}

export function createApiToken(db: DatabaseClient, userId: string, name: string) {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const salt = randomBytes(16).toString("base64url");
  const secret = randomBytes(24).toString("base64url");
  const tokenHash = hashApiTokenSecret(salt, secret);
  const token = {
    id,
    userId,
    name,
    salt,
    tokenHash,
    lastUsedAt: null,
    createdAt: now,
    updatedAt: now
  };

  db.insert(apiTokens).values(token).run();

  return {
    token,
    rawToken: `bbtodo_pat_${id}.${secret}`
  };
}

export function deleteOwnedApiToken(db: DatabaseClient, userId: string, tokenId: string) {
  const token = db
    .select()
    .from(apiTokens)
    .where(and(eq(apiTokens.id, tokenId), eq(apiTokens.userId, userId)))
    .get();
  if (!token) {
    return false;
  }

  db.delete(apiTokens).where(eq(apiTokens.id, tokenId)).run();
  return true;
}

export function getUserForApiToken(db: DatabaseClient, rawToken: string) {
  if (!rawToken.startsWith("bbtodo_pat_")) {
    return null;
  }

  const payload = rawToken.slice("bbtodo_pat_".length);
  const separatorIndex = payload.indexOf(".");
  if (separatorIndex === -1) {
    return null;
  }

  const tokenId = payload.slice(0, separatorIndex);
  const secret = payload.slice(separatorIndex + 1);
  if (!tokenId || !secret) {
    return null;
  }

  const token = db.select().from(apiTokens).where(eq(apiTokens.id, tokenId)).get();
  if (!token) {
    return null;
  }

  const expected = Buffer.from(hashApiTokenSecret(token.salt, secret), "hex");
  const actual = Buffer.from(token.tokenHash, "hex");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null;
  }

  const now = new Date().toISOString();
  db
    .update(apiTokens)
    .set({
      lastUsedAt: now,
      updatedAt: now
    })
    .where(eq(apiTokens.id, token.id))
    .run();

  return db.select().from(users).where(eq(users.id, token.userId)).get() ?? null;
}
