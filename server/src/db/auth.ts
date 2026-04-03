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
    oidcToken: string | null;
    userId: string;
    expiresAt: string;
  }
) {
  const session = {
    id: crypto.randomUUID(),
    userId: input.userId,
    expiresAt: input.expiresAt,
    oidcToken: input.oidcToken,
    createdAt: new Date().toISOString()
  };

  db.insert(sessions).values(session).run();

  return session;
}

export function getSession(db: DatabaseClient, sessionId: string) {
  return db.select().from(sessions).where(eq(sessions.id, sessionId)).get() ?? null;
}

export function getSessionWithUser(db: DatabaseClient, sessionId: string) {
  const session = getSession(db, sessionId);
  if (!session) {
    return null;
  }

  const user = db.select().from(users).where(eq(users.id, session.userId)).get();
  if (!user) {
    db.delete(sessions).where(eq(sessions.id, sessionId)).run();
    return null;
  }

  return {
    session,
    user
  };
}

export function updateSession(
  db: DatabaseClient,
  input: {
    oidcToken: string | null;
    sessionId: string;
    expiresAt: string;
  }
) {
  db
    .update(sessions)
    .set({
      expiresAt: input.expiresAt,
      oidcToken: input.oidcToken
    })
    .where(eq(sessions.id, input.sessionId))
    .run();

  return getSession(db, input.sessionId);
}

export function deleteSession(db: DatabaseClient, sessionId: string) {
  db.delete(sessions).where(eq(sessions.id, sessionId)).run();
}
