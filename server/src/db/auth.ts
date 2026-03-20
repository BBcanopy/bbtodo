import { and, eq } from "drizzle-orm";

import { type DatabaseClient, type UserTheme, sessions, users } from "./schema.js";

export async function upsertUser(
  db: DatabaseClient,
  input: {
    issuer: string;
    subject: string;
    email: string | null;
    displayName: string | null;
  }
) {
  const now = new Date().toISOString();
  db
    .insert(users)
    .values({
      id: crypto.randomUUID(),
      issuer: input.issuer,
      subject: input.subject,
      email: input.email,
      displayName: input.displayName,
      theme: "sea",
      createdAt: now,
      updatedAt: now
    })
    .onConflictDoUpdate({
      target: [users.issuer, users.subject],
      set: {
        email: input.email,
        displayName: input.displayName,
        updatedAt: now
      }
    })
    .run();

  const existing = db
    .select()
    .from(users)
    .where(and(eq(users.issuer, input.issuer), eq(users.subject, input.subject)))
    .get();

  if (!existing) {
    throw new Error("Failed to resolve user after upsert.");
  }

  return existing;
}

export function updateUserTheme(
  db: DatabaseClient,
  input: {
    theme: UserTheme;
    userId: string;
  }
) {
  const updatedAt = new Date().toISOString();

  db
    .update(users)
    .set({
      theme: input.theme,
      updatedAt
    })
    .where(eq(users.id, input.userId))
    .run();

  return db.select().from(users).where(eq(users.id, input.userId)).get() ?? null;
}

export function createSession(
  db: DatabaseClient,
  input: {
    userId: string;
    expiresAt: string;
  }
) {
  const session = {
    id: crypto.randomUUID(),
    userId: input.userId,
    expiresAt: input.expiresAt,
    createdAt: new Date().toISOString()
  };

  db.insert(sessions).values(session).run();

  return session;
}

export function getUserForSession(db: DatabaseClient, sessionId: string) {
  const session = db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
  if (!session) {
    return null;
  }

  if (new Date(session.expiresAt).getTime() <= Date.now()) {
    db.delete(sessions).where(eq(sessions.id, sessionId)).run();
    return null;
  }

  return db.select().from(users).where(eq(users.id, session.userId)).get() ?? null;
}

export function deleteSession(db: DatabaseClient, sessionId: string) {
  db.delete(sessions).where(eq(sessions.id, sessionId)).run();
}
