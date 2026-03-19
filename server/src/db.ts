import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import Database from "better-sqlite3";
import { and, asc, desc, eq, inArray, isNull, max, ne } from "drizzle-orm";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const SQLITE_DATABASE_PATH = "/data/bbtodo.sqlite";

const timestamps = {
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
};

export const taskStatusValues = ["todo", "in_progress", "done"] as const;
export type TaskStatus = (typeof taskStatusValues)[number];

export const defaultLaneTemplates = [
  { name: "Todo", systemKey: "todo" },
  { name: "In Progress", systemKey: "in_progress" },
  { name: "Done", systemKey: "done" }
] as const satisfies ReadonlyArray<{ name: string; systemKey: TaskStatus }>;

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
  (table) => [uniqueIndex("users_issuer_subject_idx").on(table.issuer, table.subject)]
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
  (table) => [
    index("sessions_user_id_idx").on(table.userId),
    index("sessions_expires_at_idx").on(table.expiresAt)
  ]
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
  (table) => [index("projects_user_updated_at_idx").on(table.userId, table.updatedAt)]
);

export const lanes = sqliteTable(
  "lanes",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    systemKey: text("system_key", { enum: taskStatusValues }),
    position: integer("position").notNull(),
    ...timestamps
  },
  (table) => [
    index("lanes_project_position_idx").on(table.projectId, table.position),
    uniqueIndex("lanes_project_system_key_idx").on(table.projectId, table.systemKey)
  ]
);

export const tasks = sqliteTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    laneId: text("lane_id").references(() => lanes.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    position: integer("position").notNull().default(0),
    // Legacy compatibility for the pre-lane API and migration path.
    status: text("status", { enum: taskStatusValues }).notNull(),
    ...timestamps
  },
  (table) => [
    index("tasks_project_status_updated_at_idx").on(table.projectId, table.status, table.updatedAt),
    index("tasks_project_lane_position_idx").on(table.projectId, table.laneId, table.position)
  ]
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
  (table) => [index("api_tokens_user_updated_at_idx").on(table.userId, table.updatedAt)]
);

export type DatabaseClient = BetterSQLite3Database<{
  apiTokens: typeof apiTokens;
  lanes: typeof lanes;
  projects: typeof projects;
  sessions: typeof sessions;
  tasks: typeof tasks;
  users: typeof users;
}>;

export type UserRecord = typeof users.$inferSelect;
export type ProjectRecord = typeof projects.$inferSelect;
export type LaneRecord = typeof lanes.$inferSelect;
export type TaskRecord = typeof tasks.$inferSelect;
export type ApiTokenRecord = typeof apiTokens.$inferSelect;
export type ProjectTaskCounts = Record<TaskStatus, number>;

export interface LaneWithTaskCount extends LaneRecord {
  taskCount: number;
}

export interface ProjectWithTaskCounts extends ProjectRecord {
  laneSummaries: LaneWithTaskCount[];
  taskCounts: ProjectTaskCounts;
}

export interface DatabaseServices {
  database: Database.Database;
  db: DatabaseClient;
}

function createEmptyTaskCounts(): ProjectTaskCounts {
  return {
    todo: 0,
    in_progress: 0,
    done: 0
  };
}

function getTableColumns(database: Database.Database, tableName: string) {
  return new Set(
    database
      .prepare(`PRAGMA table_info(${tableName})`)
      .all()
      .map((column) => String((column as { name: string }).name))
  );
}

function listProjectLanesByProjectId(db: DatabaseClient, projectId: string) {
  return db
    .select()
    .from(lanes)
    .where(eq(lanes.projectId, projectId))
    .orderBy(asc(lanes.position), asc(lanes.createdAt))
    .all();
}

function createDefaultLanesForProject(db: DatabaseClient, projectId: string, now: string) {
  const createdLanes: LaneRecord[] = [];

  defaultLaneTemplates.forEach((template, index) => {
    const lane = {
      id: crypto.randomUUID(),
      projectId,
      name: template.name,
      systemKey: template.systemKey,
      position: index,
      createdAt: now,
      updatedAt: now
    };

    db.insert(lanes).values(lane).run();
    createdLanes.push(lane);
  });

  return createdLanes;
}

function ensureDefaultLanes(db: DatabaseClient, projectId: string, now: string) {
  const existingLanes = listProjectLanesByProjectId(db, projectId);
  let nextPosition =
    existingLanes.length > 0
      ? Math.max(...existingLanes.map((lane) => lane.position)) + 1
      : 0;

  defaultLaneTemplates.forEach((template) => {
    if (existingLanes.some((lane) => lane.systemKey === template.systemKey)) {
      return;
    }

    const lane = {
      id: crypto.randomUUID(),
      projectId,
      name: template.name,
      systemKey: template.systemKey,
      position: nextPosition,
      createdAt: now,
      updatedAt: now
    };

    db.insert(lanes).values(lane).run();
    existingLanes.push(lane);
    nextPosition += 1;
  });

  return listProjectLanesByProjectId(db, projectId);
}

function migrateLegacyBoardData(db: DatabaseClient) {
  const allProjects = db.select().from(projects).all();

  for (const project of allProjects) {
    const projectLanes = ensureDefaultLanes(db, project.id, project.updatedAt);
    const lanesBySystemKey = new Map<TaskStatus, LaneRecord>(
      projectLanes.flatMap((lane) => (lane.systemKey ? [[lane.systemKey, lane] as const] : []))
    );
    const legacyTasks = db
      .select()
      .from(tasks)
      .where(and(eq(tasks.projectId, project.id), isNull(tasks.laneId)))
      .orderBy(desc(tasks.updatedAt))
      .all();

    const tasksByStatus = new Map<TaskStatus, TaskRecord[]>(
      taskStatusValues.map((status) => [status, []])
    );

    legacyTasks.forEach((task) => {
      tasksByStatus.get(task.status)?.push(task);
    });

    taskStatusValues.forEach((status) => {
      const lane = lanesBySystemKey.get(status);
      if (!lane) {
        return;
      }

      (tasksByStatus.get(status) ?? []).forEach((task, index) => {
        db
          .update(tasks)
          .set({
            laneId: lane.id,
            position: index
          })
          .where(eq(tasks.id, task.id))
          .run();
      });
    });
  }
}

export function createDatabase(sqlitePath: string): DatabaseServices {
  if (sqlitePath !== ":memory:") {
    mkdirSync(dirname(sqlitePath), { recursive: true });
  }

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

    CREATE TABLE IF NOT EXISTS lanes (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      system_key TEXT,
      position INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS lanes_project_position_idx
      ON lanes (project_id, position);

    CREATE UNIQUE INDEX IF NOT EXISTS lanes_project_system_key_idx
      ON lanes (project_id, system_key);

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      lane_id TEXT REFERENCES lanes(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      position INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS tasks_project_status_updated_at_idx
      ON tasks (project_id, status, updated_at);

    CREATE INDEX IF NOT EXISTS tasks_project_lane_position_idx
      ON tasks (project_id, lane_id, position);

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

  const taskColumns = getTableColumns(database, "tasks");
  if (!taskColumns.has("body")) {
    database.exec("ALTER TABLE tasks ADD COLUMN body TEXT NOT NULL DEFAULT '';");
  }
  if (!taskColumns.has("lane_id")) {
    database.exec("ALTER TABLE tasks ADD COLUMN lane_id TEXT REFERENCES lanes(id) ON DELETE CASCADE;");
  }
  if (!taskColumns.has("position")) {
    database.exec("ALTER TABLE tasks ADD COLUMN position INTEGER NOT NULL DEFAULT 0;");
  }

  const services = {
    database,
    db: drizzle(database, {
      schema: {
        apiTokens,
        lanes,
        projects,
        sessions,
        tasks,
        users
      }
    })
  };

  migrateLegacyBoardData(services.db);

  return services;
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

export function listProjectsForUser(db: DatabaseClient, userId: string) {
  const projectRows = db
    .select()
    .from(projects)
    .where(eq(projects.userId, userId))
    .orderBy(desc(projects.updatedAt))
    .all();

  if (projectRows.length === 0) {
    return [];
  }

  const projectIds = projectRows.map((project) => project.id);
  const laneRows = db
    .select()
    .from(lanes)
    .where(inArray(lanes.projectId, projectIds))
    .orderBy(asc(lanes.position), asc(lanes.createdAt))
    .all();
  const lanesById = new Map(laneRows.map((lane) => [lane.id, lane]));
  const laneCounts = new Map<string, number>(laneRows.map((lane) => [lane.id, 0]));
  const countsByProject = new Map<string, ProjectTaskCounts>(
    projectIds.map((projectId) => [projectId, createEmptyTaskCounts()])
  );

  const taskRows = db
    .select({
      laneId: tasks.laneId,
      projectId: tasks.projectId
    })
    .from(tasks)
    .where(inArray(tasks.projectId, projectIds))
    .all();

  taskRows.forEach((task) => {
    if (task.laneId) {
      laneCounts.set(task.laneId, (laneCounts.get(task.laneId) ?? 0) + 1);
      const lane = lanesById.get(task.laneId);
      const projectCounts = countsByProject.get(task.projectId);
      if (lane?.systemKey && projectCounts) {
        projectCounts[lane.systemKey] += 1;
      }
    }
  });

  return projectRows.map((project) => ({
    ...project,
    laneSummaries: laneRows
      .filter((lane) => lane.projectId === project.id)
      .map((lane) => ({
        ...lane,
        taskCount: laneCounts.get(lane.id) ?? 0
      })),
    taskCounts: countsByProject.get(project.id) ?? createEmptyTaskCounts()
  }));
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
  createDefaultLanesForProject(db, project.id, now);

  return project;
}

export function getOwnedProject(db: DatabaseClient, userId: string, projectId: string) {
  return db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .get();
}

export function deleteOwnedProject(db: DatabaseClient, userId: string, projectId: string) {
  const project = getOwnedProject(db, userId, projectId);
  if (!project) {
    return false;
  }

  db.delete(projects).where(eq(projects.id, projectId)).run();
  return true;
}

function getProjectLaneById(db: DatabaseClient, projectId: string, laneId: string) {
  return db
    .select()
    .from(lanes)
    .where(and(eq(lanes.id, laneId), eq(lanes.projectId, projectId)))
    .get();
}

function getProjectLaneBySystemKey(db: DatabaseClient, projectId: string, systemKey: TaskStatus) {
  return db
    .select()
    .from(lanes)
    .where(and(eq(lanes.projectId, projectId), eq(lanes.systemKey, systemKey)))
    .get();
}

function resolveTaskLane(
  db: DatabaseClient,
  input: {
    laneId?: string;
    projectId: string;
    status?: TaskStatus;
  },
  currentTask?: TaskRecord
) {
  if (input.laneId) {
    return getProjectLaneById(db, input.projectId, input.laneId);
  }

  if (input.status) {
    return getProjectLaneBySystemKey(db, input.projectId, input.status);
  }

  if (currentTask?.laneId) {
    return getProjectLaneById(db, input.projectId, currentTask.laneId);
  }

  return (
    getProjectLaneBySystemKey(db, input.projectId, "todo") ??
    listProjectLanesByProjectId(db, input.projectId)[0] ??
    null
  );
}

export function listLanesForProject(
  db: DatabaseClient,
  input: {
    userId: string;
    projectId: string;
  }
) {
  const project = getOwnedProject(db, input.userId, input.projectId);
  if (!project) {
    return null;
  }

  const projectLanes = listProjectLanesByProjectId(db, input.projectId);
  const laneCounts = new Map<string, number>(projectLanes.map((lane) => [lane.id, 0]));
  const taskRows = db
    .select({
      laneId: tasks.laneId
    })
    .from(tasks)
    .where(eq(tasks.projectId, input.projectId))
    .all();

  taskRows.forEach((task) => {
    if (task.laneId) {
      laneCounts.set(task.laneId, (laneCounts.get(task.laneId) ?? 0) + 1);
    }
  });

  return projectLanes.map((lane) => ({
    ...lane,
    taskCount: laneCounts.get(lane.id) ?? 0
  }));
}

export function createLane(
  db: DatabaseClient,
  input: {
    userId: string;
    projectId: string;
    name: string;
  }
) {
  const project = getOwnedProject(db, input.userId, input.projectId);
  if (!project) {
    return null;
  }

  const now = new Date().toISOString();
  const lastPosition = db
    .select({
      value: max(lanes.position)
    })
    .from(lanes)
    .where(eq(lanes.projectId, input.projectId))
    .get();

  const lane = {
    id: crypto.randomUUID(),
    projectId: input.projectId,
    name: input.name,
    systemKey: null,
    position: (lastPosition?.value ?? -1) + 1,
    createdAt: now,
    updatedAt: now
  };

  db.insert(lanes).values(lane).run();
  touchProject(db, input.projectId, now);

  return {
    ...lane,
    taskCount: 0
  };
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
    const lane = getProjectLaneBySystemKey(db, input.projectId, input.status);
    if (!lane) {
      return [];
    }

    filters.push(eq(tasks.laneId, lane.id));
  }

  return db
    .select()
    .from(tasks)
    .where(and(...filters))
    .orderBy(asc(tasks.position), desc(tasks.updatedAt))
    .all();
}

function touchProject(db: DatabaseClient, projectId: string, updatedAt: string) {
  db.update(projects).set({ updatedAt }).where(eq(projects.id, projectId)).run();
}

function getLaneTaskIds(db: DatabaseClient, projectId: string, laneId: string, excludedTaskId?: string) {
  const filters = [eq(tasks.projectId, projectId), eq(tasks.laneId, laneId)];

  if (excludedTaskId) {
    filters.push(ne(tasks.id, excludedTaskId));
  }

  return db
    .select({
      id: tasks.id
    })
    .from(tasks)
    .where(and(...filters))
    .orderBy(asc(tasks.position), desc(tasks.updatedAt))
    .all()
    .map((task) => task.id);
}

function reorderLaneTasks(
  db: DatabaseClient,
  input: {
    projectId: string;
    taskId: string;
    targetLaneId: string;
    targetPosition: number;
  }
) {
  const task = db.select().from(tasks).where(eq(tasks.id, input.taskId)).get();
  if (!task || !task.laneId) {
    return;
  }

  if (task.laneId === input.targetLaneId) {
    const laneTaskIds = getLaneTaskIds(db, input.projectId, input.targetLaneId, task.id);
    const clampedPosition = Math.max(0, Math.min(input.targetPosition, laneTaskIds.length));
    laneTaskIds.splice(clampedPosition, 0, task.id);

    laneTaskIds.forEach((taskId, index) => {
      db
        .update(tasks)
        .set({ position: index })
        .where(eq(tasks.id, taskId))
        .run();
    });

    return;
  }

  const sourceTaskIds = getLaneTaskIds(db, input.projectId, task.laneId, task.id);
  sourceTaskIds.forEach((taskId, index) => {
    db
      .update(tasks)
      .set({ position: index })
      .where(eq(tasks.id, taskId))
      .run();
  });

  const targetTaskIds = getLaneTaskIds(db, input.projectId, input.targetLaneId);
  const clampedPosition = Math.max(0, Math.min(input.targetPosition, targetTaskIds.length));
  targetTaskIds.splice(clampedPosition, 0, task.id);

  targetTaskIds.forEach((taskId, index) => {
    db
      .update(tasks)
      .set({ position: index })
      .where(eq(tasks.id, taskId))
      .run();
  });
}

export function createTask(
  db: DatabaseClient,
  input: {
    userId: string;
    projectId: string;
    title: string;
    body?: string;
    laneId?: string;
  }
) {
  const project = getOwnedProject(db, input.userId, input.projectId);
  if (!project) {
    return null;
  }

  const lane = resolveTaskLane(db, {
    laneId: input.laneId,
    projectId: input.projectId
  });
  if (!lane) {
    return null;
  }

  const lastPosition = db
    .select({
      value: max(tasks.position)
    })
    .from(tasks)
    .where(and(eq(tasks.projectId, input.projectId), eq(tasks.laneId, lane.id)))
    .get();

  const now = new Date().toISOString();
  const task = {
    id: crypto.randomUUID(),
    projectId: input.projectId,
    laneId: lane.id,
    title: input.title,
    body: input.body ?? "",
    position: (lastPosition?.value ?? -1) + 1,
    status: lane.systemKey ?? "todo",
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
    body?: string;
    laneId?: string;
    position?: number;
    projectId: string;
    status?: TaskStatus;
    taskId: string;
    title?: string;
    userId: string;
  }
) {
  const task = getOwnedTask(db, input);
  if (!task) {
    return null;
  }

  const nextLane = resolveTaskLane(
    db,
    {
      laneId: input.laneId,
      projectId: input.projectId,
      status: input.status
    },
    task
  );
  if (!nextLane) {
    return null;
  }

  const shouldReorder = input.position !== undefined || nextLane.id !== task.laneId;
  if (shouldReorder) {
    const laneTaskIds = getLaneTaskIds(
      db,
      input.projectId,
      nextLane.id,
      nextLane.id === task.laneId ? task.id : undefined
    );
    const targetPosition = Math.max(
      0,
      Math.min(input.position ?? laneTaskIds.length, laneTaskIds.length)
    );

    reorderLaneTasks(db, {
      projectId: input.projectId,
      taskId: task.id,
      targetLaneId: nextLane.id,
      targetPosition
    });
  }

  const updatedAt = new Date().toISOString();
  const nextStatus =
    input.status ?? nextLane.systemKey ?? task.status;

  db
    .update(tasks)
    .set({
      body: input.body ?? task.body,
      laneId: nextLane.id,
      status: nextStatus,
      title: input.title ?? task.title,
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
    projectId: string;
    taskId: string;
    userId: string;
  }
) {
  const task = getOwnedTask(db, input);
  if (!task) {
    return false;
  }

  db.delete(tasks).where(eq(tasks.id, task.id)).run();

  if (task.laneId) {
    getLaneTaskIds(db, input.projectId, task.laneId).forEach((taskId, index) => {
      db
        .update(tasks)
        .set({ position: index })
        .where(eq(tasks.id, taskId))
        .run();
    });
  }

  touchProject(db, input.projectId, new Date().toISOString());
  return true;
}
