import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { migrations } from "../src/server/migrations";

const temporaryDirectories: string[] = [];

function temporaryDatabase(): { directory: string; db: DatabaseSync; file: string } {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "runehall-migration-"));
  temporaryDirectories.push(directory);
  const file = path.join(directory, "runehall.db");
  const db = new DatabaseSync(file);
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(`
    CREATE TABLE schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    );
  `);
  return { directory, db, file };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("migrations", () => {
  it("is append-only, ordered, and uniquely numbered", () => {
    const versions = migrations.map((migration) => migration.version);
    expect(versions).toEqual([...versions].sort((a, b) => a - b));
    expect(new Set(versions).size).toBe(versions.length);
    expect(versions[0]).toBe(1);
  });

  it("upgrades an existing v10 database and promotes the oldest account to admin", () => {
    const { db } = temporaryDatabase();
    const before = migrations.filter((migration) => migration.version <= 10);
    for (const migration of before) db.exec(migration.sql);

    db.prepare(
      "INSERT INTO users (id, username, display_name, password_hash, avatar_url, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).run("usr_first", "first", "First User", "hash", null, 1_000);
    db.prepare(
      "INSERT INTO users (id, username, display_name, password_hash, avatar_url, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).run("usr_second", "second", "Second User", "hash", null, 2_000);

    const migration = migrations.find((entry) => entry.version === 11);
    expect(migration).toBeDefined();
    db.exec(migration!.sql);

    db.prepare(
      "INSERT INTO campaigns (id, name, description, gm_id, invite_code, ruleset, xp_mode, created_at, updated_at, last_played_at) VALUES (?, ?, '', ?, ?, 'core', 'milestone', ?, ?, ?)",
    ).run("camp_one", "Test Campaign", "usr_first", "TESTCODE", 1_000, 1_000, 1_000);
    db.prepare(
      "INSERT INTO characters (id, user_id, campaign_id, name, data, summary, created_at, updated_at) VALUES (?, ?, NULL, ?, '{}', NULL, ?, ?)",
    ).run("char_one", "usr_first", "Test Hero", 1_000, 1_000);

    const revisionMigration = migrations.find((entry) => entry.version === 12);
    expect(revisionMigration).toBeDefined();
    db.exec(revisionMigration!.sql);

    const campaignRevision = db
      .prepare("SELECT revision FROM campaigns WHERE id = ?")
      .get("camp_one") as { revision: number };
    const characterRevision = db
      .prepare("SELECT revision FROM characters WHERE id = ?")
      .get("char_one") as { revision: number };
    expect(campaignRevision.revision).toBe(0);
    expect(characterRevision.revision).toBe(1);

    const templateMigration = migrations.find((entry) => entry.version === 13);
    expect(templateMigration).toBeDefined();
    db.exec(templateMigration!.sql);
    const sceneColumns = db.prepare("PRAGMA table_info(scenes)").all() as { name: string }[];
    expect(sceneColumns.map((column) => column.name)).toContain("templates");

    for (const migration of migrations.filter((entry) => entry.version >= 14)) {
      db.exec(migration.sql);
    }
    const tablesAfterAssets = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all() as { name: string }[];
    expect(tablesAfterAssets.map((table) => table.name)).toContain("uploaded_assets");
    expect(tablesAfterAssets.map((table) => table.name)).toContain("session_checkins");
    const sessionColumns = db.prepare("PRAGMA table_info(campaign_sessions)").all() as {
      name: string;
    }[];
    expect(sessionColumns.map((column) => column.name)).toContain("agenda");

    const columns = db.prepare("PRAGMA table_info(users)").all() as { name: string }[];
    expect(columns.map((column) => column.name)).toContain("is_admin");

    const first = db.prepare("SELECT is_admin FROM users WHERE id = ?").get("usr_first") as {
      is_admin: number;
    };
    const second = db.prepare("SELECT is_admin FROM users WHERE id = ?").get("usr_second") as {
      is_admin: number;
    };
    expect(first.is_admin).toBe(1);
    expect(second.is_admin).toBe(0);

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all() as { name: string }[];
    const names = tables.map((table) => table.name);
    expect(names).toEqual(
      expect.arrayContaining(["app_settings", "registration_invites", "audit_log"]),
    );

    db.close();
  });
});
