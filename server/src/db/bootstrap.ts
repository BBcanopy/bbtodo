import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";
import { and, desc, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import { ensureDefaultLanes } from "./board.js";
import {
  apiTokens,
  type DatabaseClient,
  type DatabaseServices,
  lanes,
  projects,
  sessions,
  taskStatusValues,
  tasks,
  type TaskRecord,
  type TaskStatus,
  taskTags,
  users
} from "./schema.js";

export const SQLITE_DATABASE_PATH = "/data/bbtodo.sqlite";
const DRIZZLE_MIGRATIONS_TABLE = "__drizzle_migrations";
const DRIZZLE_MIGRATIONS_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "../../drizzle");

interface MigrationJournalEntry {
  breakpoints: boolean;
  idx: number;
  tag: string;
  version: string;
  when: number;
}

function getLatestMigrationEntry() {
  const journalPath = resolve(DRIZZLE_MIGRATIONS_PATH, "meta", "_journal.json");
  if (!existsSync(journalPath)) {
    throw new Error(`Missing Drizzle migration journal at ${journalPath}.`);
  }

  const journal = JSON.parse(readFileSync(journalPath, "utf8")) as {
    entries?: MigrationJournalEntry[];
  };
  const latestEntry = journal.entries?.at(-1);
  if (!latestEntry) {
    throw new Error("Drizzle migration journal is empty.");
  }

  const sqlPath = resolve(DRIZZLE_MIGRATIONS_PATH, `${latestEntry.tag}.sql`);
  const sql = readFileSync(sqlPath, "utf8");

  return {
    createdAt: latestEntry.when,
    hash: createHash("sha256").update(sql).digest("hex")
  };
}

function tableExists(database: Database.Database, tableName: string) {
  const result = database
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
    .get(tableName);

  return result !== undefined;
}

function getTableColumns(database: Database.Database, tableName: string) {
  if (!tableExists(database, tableName)) {
    return new Set<string>();
  }

  return new Set(
    database
      .prepare(`PRAGMA table_info(${tableName})`)
      .all()
      .map((column) => String((column as { name: string }).name))
  );
}

function hasAnyApplicationTables(database: Database.Database) {
  return ["api_tokens", "lanes", "projects", "sessions", "task_tags", "tasks", "users"].some(
    (tableName) => tableExists(database, tableName)
  );
}

function createLegacyCompatTables(database: Database.Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      issuer TEXT NOT NULL,
      subject TEXT NOT NULL,
      email TEXT,
      display_name TEXT,
      theme TEXT NOT NULL DEFAULT 'sea',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS lanes (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      system_key TEXT,
      position INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

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

    CREATE TABLE IF NOT EXISTS task_tags (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      tag TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT 'moss',
      position INTEGER NOT NULL
    );

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
  `);
}

function ensureLegacyCompatColumns(database: Database.Database) {
  const userColumns = getTableColumns(database, "users");
  if (!userColumns.has("theme")) {
    database.exec("ALTER TABLE users ADD COLUMN theme TEXT NOT NULL DEFAULT 'sea';");
  }

  const taskColumns = getTableColumns(database, "tasks");
  if (!taskColumns.has("body")) {
    database.exec("ALTER TABLE tasks ADD COLUMN body TEXT NOT NULL DEFAULT '';");
  }
  if (!taskColumns.has("lane_id")) {
    database.exec(
      "ALTER TABLE tasks ADD COLUMN lane_id TEXT REFERENCES lanes(id) ON DELETE CASCADE;"
    );
  }
  if (!taskColumns.has("position")) {
    database.exec("ALTER TABLE tasks ADD COLUMN position INTEGER NOT NULL DEFAULT 0;");
  }

  const taskTagColumns = getTableColumns(database, "task_tags");
  if (!taskTagColumns.has("color")) {
    database.exec("ALTER TABLE task_tags ADD COLUMN color TEXT NOT NULL DEFAULT 'moss';");
  }
}

function ensureLegacyCompatIndexes(database: Database.Database) {
  database.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS users_issuer_subject_idx
      ON users (issuer, subject);

    CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions (user_id);
    CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions (expires_at);

    CREATE INDEX IF NOT EXISTS projects_user_updated_at_idx
      ON projects (user_id, updated_at);

    CREATE INDEX IF NOT EXISTS lanes_project_position_idx
      ON lanes (project_id, position);

    CREATE UNIQUE INDEX IF NOT EXISTS lanes_project_system_key_idx
      ON lanes (project_id, system_key);

    CREATE INDEX IF NOT EXISTS tasks_project_status_updated_at_idx
      ON tasks (project_id, status, updated_at);

    CREATE INDEX IF NOT EXISTS tasks_project_lane_position_idx
      ON tasks (project_id, lane_id, position);

    CREATE INDEX IF NOT EXISTS task_tags_task_position_idx
      ON task_tags (task_id, position);

    CREATE UNIQUE INDEX IF NOT EXISTS task_tags_task_tag_idx
      ON task_tags (task_id, tag);

    CREATE INDEX IF NOT EXISTS api_tokens_user_updated_at_idx
      ON api_tokens (user_id, updated_at);
  `);
}

function markLatestDrizzleMigrationApplied(database: Database.Database) {
  const latestMigration = getLatestMigrationEntry();

  database.exec(`
    CREATE TABLE IF NOT EXISTS ${DRIZZLE_MIGRATIONS_TABLE} (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      hash TEXT NOT NULL,
      created_at NUMERIC
    );
  `);

  const existing = database
    .prepare(`SELECT 1 FROM ${DRIZZLE_MIGRATIONS_TABLE} WHERE created_at = ? LIMIT 1`)
    .get(latestMigration.createdAt);
  if (existing) {
    return;
  }

  database
    .prepare(`INSERT INTO ${DRIZZLE_MIGRATIONS_TABLE} ("hash", "created_at") VALUES (?, ?)`)
    .run(latestMigration.hash, latestMigration.createdAt);
}

function bootstrapLegacyDatabase(database: Database.Database) {
  if (tableExists(database, DRIZZLE_MIGRATIONS_TABLE) || !hasAnyApplicationTables(database)) {
    return;
  }

  const bootstrap = database.transaction(() => {
    createLegacyCompatTables(database);
    ensureLegacyCompatColumns(database);
    ensureLegacyCompatIndexes(database);
    markLatestDrizzleMigrationApplied(database);
  });

  bootstrap();
}

function migrateLegacyBoardData(db: DatabaseClient) {
  const allProjects = db.select().from(projects).all();

  for (const project of allProjects) {
    const projectLanes = ensureDefaultLanes(db, project.id, project.updatedAt);
    const lanesBySystemKey = new Map<TaskStatus, (typeof projectLanes)[number]>(
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
  bootstrapLegacyDatabase(database);

  const services = {
    database,
    db: drizzle(database, {
      schema: {
        apiTokens,
        lanes,
        projects,
        sessions,
        taskTags,
        tasks,
        users
      }
    })
  };

  migrate(services.db, {
    migrationsFolder: DRIZZLE_MIGRATIONS_PATH
  });
  migrateLegacyBoardData(services.db);

  return services;
}
