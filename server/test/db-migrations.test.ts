import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

import { createDatabase } from "../src/db.js";

const tempDirectories: string[] = [];

afterEach(() => {
  while (tempDirectories.length > 0) {
    const directory = tempDirectories.pop();
    if (directory) {
      rmSync(directory, { force: true, recursive: true });
    }
  }
});

function createTempSqlitePath() {
  const directory = mkdtempSync(join(tmpdir(), "bbtodo-db-"));
  tempDirectories.push(directory);
  return join(directory, "bbtodo.sqlite");
}

describe("database migrations", () => {
  it("upgrades a legacy database missing lane columns and backfills default lanes", () => {
    const sqlitePath = createTempSqlitePath();
    const legacyDatabase = new Database(sqlitePath);
    legacyDatabase.pragma("foreign_keys = ON");
    legacyDatabase.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        issuer TEXT NOT NULL,
        subject TEXT NOT NULL,
        email TEXT,
        display_name TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE UNIQUE INDEX users_issuer_subject_idx
        ON users (issuer, subject);

      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX sessions_user_id_idx ON sessions (user_id);
      CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);

      CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX projects_user_updated_at_idx
        ON projects (user_id, updated_at);

      CREATE TABLE tasks (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX tasks_project_status_updated_at_idx
        ON tasks (project_id, status, updated_at);

      CREATE TABLE api_tokens (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        salt TEXT NOT NULL,
        token_hash TEXT NOT NULL,
        last_used_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX api_tokens_user_updated_at_idx
        ON api_tokens (user_id, updated_at);
    `);

    const now = "2026-03-19T00:24:29.000Z";
    legacyDatabase
      .prepare(
        `INSERT INTO users (id, issuer, subject, email, display_name, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run("user-1", "https://issuer.example.com", "subject-1", "one@example.com", "User One", now, now);
    legacyDatabase
      .prepare(
        `INSERT INTO projects (id, user_id, name, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run("project-1", "user-1", "Legacy board", now, now);
    legacyDatabase
      .prepare(
        `INSERT INTO tasks (id, project_id, title, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run("task-1", "project-1", "Legacy task", "todo", now, now);
    legacyDatabase.close();

    const services = createDatabase(sqlitePath);

    try {
      const taskColumns = (
        services.database.prepare("PRAGMA table_info(tasks)").all() as Array<{ name: string }>
      ).map((column) => column.name);
      expect(taskColumns).toEqual(expect.arrayContaining(["body", "lane_id", "position"]));
      expect(taskColumns).not.toContain("status");

      const taskTagColumns = (
        services.database.prepare("PRAGMA table_info(task_tags)").all() as Array<{ name: string }>
      ).map((column) => column.name);
      expect(taskTagColumns).toEqual(expect.arrayContaining(["color"]));

      const laneColumns = (
        services.database.prepare("PRAGMA table_info(lanes)").all() as Array<{ name: string }>
      ).map((column) => column.name);
      expect(laneColumns).not.toContain("system_key");

      const lanes = services.database
        .prepare("SELECT id, name, position FROM lanes WHERE project_id = ? ORDER BY position ASC")
        .all("project-1") as Array<{
        id: string;
        name: string;
        position: number;
      }>;
      expect(lanes).toHaveLength(3);
      expect(lanes).toEqual([
        expect.objectContaining({ name: "Todo", position: 0 }),
        expect.objectContaining({ name: "In Progress", position: 1 }),
        expect.objectContaining({ name: "Done", position: 2 })
      ]);

      const migratedTask = services.database
        .prepare("SELECT body, lane_id, position FROM tasks WHERE id = ?")
        .get("task-1") as {
        body: string;
        lane_id: string | null;
        position: number;
      };
      expect(migratedTask).toEqual({
        body: "",
        lane_id: lanes[0]?.id ?? null,
        position: 0
      });

      const migratedTaskTags = services.database
        .prepare("SELECT color FROM task_tags WHERE task_id = ?")
        .all("task-1") as Array<{ color: string }>;
      expect(migratedTaskTags).toEqual([]);

      const migrationRows = services.database
        .prepare('SELECT hash, created_at FROM "__drizzle_migrations"')
        .all();
      expect(migrationRows).toHaveLength(1);
    } finally {
      services.database.close();
    }
  });
});
