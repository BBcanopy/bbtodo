import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import Database from "better-sqlite3";
import { and, desc, eq } from "drizzle-orm";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { index, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
};

export const taskStatusValues = ["todo", "in_progress", "done"] as const;
export type TaskStatus = (typeof taskStatusValues)[number];

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    issuer: text("issuer").notNull(),
    subject: text("subject").notNull(),
    email: text("email"),
    displayName: text("display_name"),
    ...timestamps
  },
  (table) => ({
    issuerSubjectIdx: uniqueIndex("users_issuer_subject_idx").on(
      table.issuer,
      table.subject
    )
  })
);

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull()
  },
  (table) => ({
    userIdIdx: index("sessions_user_id_idx").on(table.userId),
    expiresAtIdx: index("sessions_expires_at_idx").on(table.expiresAt)
  })
);

export const projects = sqliteTable(
  "projects",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    ...timestamps
  },
  (table) => ({
    userUpdatedAtIdx: index("projects_user_updated_at_idx").on(
      table.userId,
      table.updatedAt
    )
  })
);

export const tasks = sqliteTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    status: text("status", { enum: taskStatusValues }).notNull(),
    ...timestamps
  },
  (table) => ({
    projectStatusUpdatedAtIdx: index("tasks_project_status_updated_at_idx").on(
      table.projectId,
      table.status,
      table.updatedAt
    )
  })
);

export const apiTokens = sqliteTable(
  "api_tokens",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    salt: text("salt").notNull(),
    tokenHash: text("token_hash").notNull(),
    lastUsedAt: text("last_used_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => ({
    userUpdatedAtIdx: index("api_tokens_user_updated_at_idx").on(
      table.userId,
      table.updatedAt
    )
  })
);

export type DatabaseClient = BetterSQLite3Database<{
  users: typeof users;
  sessions: typeof sessions;
  projects: typeof projects;
  tasks: typeof tasks;
  apiTokens: typeof apiTokens;
}>;

export type UserRecord = typeof users.$inferSelect;
export type ProjectRecord = typeof projects.$inferSelect;
export type TaskRecord = typeof tasks.$inferSelect;
export type ApiTokenRecord = typeof apiTokens.$inferSelect;

export interface DatabaseServices {
  database: Database.Database;
  db: DatabaseClient;
}

export function createDatabase(sqlitePath: string): DatabaseServices {
  const database = new Database(sqlitePath);
  database.pragma("foreign_keys = ON");
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      issuer TEXT NOT NULL,
      subject TEXT NOT NULL,
      email TEXT,
      display_name TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS users_issuer_subject_idx
      ON users (issuer, subject);

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions (user_id);
    CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions (expires_at);

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS projects_user_updated_at_idx
      ON projects (user_id, updated_at);

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS tasks_project_status_updated_at_idx
      ON tasks (project_id, status, updated_at);

    CREATE TABLE IF NOT EXISTS api_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      salt TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      last_used_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS api_tokens_user_updated_at_idx
      ON api_tokens (user_id, updated_at);
  `);

  return {
    database,
    db: drizzle(database, {
      schema: {
        users,
        sessions,
        projects,
        tasks,
        apiTokens
      }
    })
  };
}

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

export function deleteOwnedApiToken(
  db: DatabaseClient,
  userId: string,
  tokenId: string
) {
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

export function listProjectsForUser(db: DatabaseClient, userId: string) {
  return db
    .select()
    .from(projects)
    .where(eq(projects.userId, userId))
    .orderBy(desc(projects.updatedAt))
    .all();
}

export function createProject(db: DatabaseClient, userId: string, name: string) {
  const now = new Date().toISOString();
  const project = {
    id: crypto.randomUUID(),
    userId,
    name,
    createdAt: now,
    updatedAt: now
  };

  db.insert(projects).values(project).run();
  return project;
}

export function getOwnedProject(
  db: DatabaseClient,
  userId: string,
  projectId: string
) {
  return db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .get();
}

export function deleteOwnedProject(
  db: DatabaseClient,
  userId: string,
  projectId: string
) {
  const project = getOwnedProject(db, userId, projectId);
  if (!project) {
    return false;
  }

  db.delete(projects).where(eq(projects.id, projectId)).run();
  return true;
}

export function listTasksForProject(
  db: DatabaseClient,
  input: {
    userId: string;
    projectId: string;
    status?: TaskStatus;
  }
) {
  const project = getOwnedProject(db, input.userId, input.projectId);
  if (!project) {
    return null;
  }

  const filters = [eq(tasks.projectId, input.projectId)];
  if (input.status) {
    filters.push(eq(tasks.status, input.status));
  }

  return db
    .select()
    .from(tasks)
    .where(and(...filters))
    .orderBy(desc(tasks.updatedAt))
    .all();
}

function touchProject(db: DatabaseClient, projectId: string, updatedAt: string) {
  db.update(projects).set({ updatedAt }).where(eq(projects.id, projectId)).run();
}

export function createTask(
  db: DatabaseClient,
  input: {
    userId: string;
    projectId: string;
    title: string;
  }
) {
  const project = getOwnedProject(db, input.userId, input.projectId);
  if (!project) {
    return null;
  }

  const now = new Date().toISOString();
  const task = {
    id: crypto.randomUUID(),
    projectId: input.projectId,
    title: input.title,
    status: "todo" as TaskStatus,
    createdAt: now,
    updatedAt: now
  };

  db.insert(tasks).values(task).run();
  touchProject(db, input.projectId, now);

  return task;
}

export function getOwnedTask(
  db: DatabaseClient,
  input: {
    userId: string;
    projectId: string;
    taskId: string;
  }
) {
  const result = db
    .select({ task: tasks })
    .from(tasks)
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .where(
      and(
        eq(tasks.id, input.taskId),
        eq(tasks.projectId, input.projectId),
        eq(projects.userId, input.userId)
      )
    )
    .get();

  return result?.task ?? null;
}

export function updateOwnedTask(
  db: DatabaseClient,
  input: {
    userId: string;
    projectId: string;
    taskId: string;
    title?: string;
    status?: TaskStatus;
  }
) {
  const task = getOwnedTask(db, input);
  if (!task) {
    return null;
  }

  const updatedAt = new Date().toISOString();
  db
    .update(tasks)
    .set({
      title: input.title ?? task.title,
      status: input.status ?? task.status,
      updatedAt
    })
    .where(eq(tasks.id, task.id))
    .run();

  touchProject(db, input.projectId, updatedAt);

  return db.select().from(tasks).where(eq(tasks.id, task.id)).get() ?? null;
}

export function deleteOwnedTask(
  db: DatabaseClient,
  input: {
    userId: string;
    projectId: string;
    taskId: string;
  }
) {
  const task = getOwnedTask(db, input);
  if (!task) {
    return false;
  }

  db.delete(tasks).where(eq(tasks.id, task.id)).run();
  touchProject(db, input.projectId, new Date().toISOString());
  return true;
}
