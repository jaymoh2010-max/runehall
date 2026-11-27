import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyMigrationsTo } from "../src/server/migrate";
import {
  backupFileName,
  createPreMigrationBackup,
  prunePreMigrationBackups,
  restoreDatabaseBackup,
  verifyDatabaseFile,
} from "../src/server/migrationBackup";

const temporaryDirectories: string[] = [];
const envKeys = [
  "MIGRATION_BACKUP",
  "MIGRATION_ROLLBACK",
  "MIGRATION_BACKUP_DIR",
  "MIGRATION_BACKUP_KEEP",
  "BACKUP_DIR",
] as const;
const savedEnv = new Map<string, string | undefined>();

function temporaryDirectory(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "runehall-migration-backup-"));
  temporaryDirectories.push(directory);
  return directory;
}

function createDatabase(file: string, statements: string[]): void {
  const connection = new DatabaseSync(file);
  try {
    connection.exec("PRAGMA journal_mode = WAL;");
    for (const statement of statements) connection.exec(statement);
  } finally {
    connection.close();
  }
}

function readTables(file: string): string[] {
  const connection = new DatabaseSync(file, { readOnly: true });
  try {
    return (
      connection.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as {
        name: string;
      }[]
    ).map((row) => row.name);
  } finally {
    connection.close();
  }
}

beforeEach(() => {
  for (const key of envKeys) {
    savedEnv.set(key, process.env[key]);
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of envKeys) {
    const value = savedEnv.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  savedEnv.clear();
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("pre-migration backups", () => {
  it("creates a verified snapshot with the original data", () => {
    const directory = temporaryDirectory();
    const databasePath = path.join(directory, "runehall.db");
    const backupDir = path.join(directory, "backups");
    createDatabase(databasePath, [
      "CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT NOT NULL);",
      "INSERT INTO notes (body) VALUES ('before migration');",
    ]);

    const result = createPreMigrationBackup({
      databasePath,
      fromVersion: 57,
      toVersion: 58,
      existingDatabase: true,
      backupDir,
      date: new Date("2026-11-27T05:00:00.000Z"),
    });

    expect(result).toMatchObject({
      created: true,
      reason: null,
      path: path.join(backupDir, backupFileName(57, 58, new Date("2026-11-27T05:00:00.000Z"))),
    });
    expect(result.path).toContain("2026-11-27T05-00-00-000Z-57-to-58.db");
    verifyDatabaseFile(result.path!);
    const snapshot = new DatabaseSync(result.path!, { readOnly: true });
    try {
      expect(snapshot.prepare("SELECT body FROM notes").get()).toEqual({
        body: "before migration",
      });
    } finally {
      snapshot.close();
    }
  });

  it("skips a fresh database and honors the disabled flag", () => {
    const directory = temporaryDirectory();
    const databasePath = path.join(directory, "runehall.db");
    const backupDir = path.join(directory, "backups");
    expect(
      createPreMigrationBackup({
        databasePath,
        fromVersion: 0,
        toVersion: 1,
        existingDatabase: false,
        backupDir,
      })
    ).toEqual({ created: false, path: null, reason: "fresh-database" });
    expect(fs.existsSync(backupDir)).toBe(false);

    createDatabase(databasePath, ["CREATE TABLE notes (id INTEGER PRIMARY KEY);"]);
    process.env.MIGRATION_BACKUP = "off";
    expect(
      createPreMigrationBackup({
        databasePath,
        fromVersion: 0,
        toVersion: 1,
        existingDatabase: true,
        backupDir,
      })
    ).toEqual({ created: false, path: null, reason: "disabled" });
    expect(fs.existsSync(backupDir)).toBe(false);
  });

  it("prunes old snapshots without touching the newest one", () => {
    const directory = temporaryDirectory();
    const names = [
      "runehall-pre-migration-2026-11-25T00-00-00-000Z-56-to-57.db",
      "runehall-pre-migration-2026-11-26T00-00-00-000Z-57-to-58.db",
      "runehall-pre-migration-2026-11-27T00-00-00-000Z-58-to-59.db",
      "keep-me.txt",
    ];
    for (const name of names) fs.writeFileSync(path.join(directory, name), "snapshot");

    expect(prunePreMigrationBackups(directory, 2)).toEqual([
      "runehall-pre-migration-2026-11-25T00-00-00-000Z-56-to-57.db",
    ]);
    expect(fs.readdirSync(directory).sort()).toEqual([
      "keep-me.txt",
      "runehall-pre-migration-2026-11-26T00-00-00-000Z-57-to-58.db",
      "runehall-pre-migration-2026-11-27T00-00-00-000Z-58-to-59.db",
    ]);
    expect(prunePreMigrationBackups(directory, 0)).toEqual([]);
  });

  it("restores the snapshot and removes stale WAL sidecars", () => {
    const directory = temporaryDirectory();
    const databasePath = path.join(directory, "runehall.db");
    const backupDir = path.join(directory, "backups");
    createDatabase(databasePath, [
      "CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT NOT NULL);",
      "INSERT INTO notes (body) VALUES ('original');",
    ]);
    const backup = createPreMigrationBackup({
      databasePath,
      fromVersion: 0,
      toVersion: 1,
      existingDatabase: true,
      backupDir,
    });
    createDatabase(databasePath, [
      "INSERT INTO notes (body) VALUES ('changed after backup');",
      "CREATE TABLE extra (id INTEGER PRIMARY KEY);",
    ]);
    fs.writeFileSync(`${databasePath}-wal`, "stale");
    fs.writeFileSync(`${databasePath}-shm`, "stale");

    restoreDatabaseBackup(databasePath, backup.path!);

    const connection = new DatabaseSync(databasePath, { readOnly: true });
    try {
      expect(connection.prepare("SELECT body FROM notes").all()).toEqual([{ body: "original" }]);
    } finally {
      connection.close();
    }
    expect(fs.existsSync(`${databasePath}-wal`)).toBe(false);
    expect(fs.existsSync(`${databasePath}-shm`)).toBe(false);
    expect(readTables(databasePath)).not.toContain("extra");
  });
});

describe("migration runner safety", () => {
  it("backs up and rolls back a failed upgrade", () => {
    const directory = temporaryDirectory();
    const databasePath = path.join(directory, "runehall.db");
    const backupDir = path.join(directory, "backups");
    createDatabase(databasePath, [
      `CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at INTEGER NOT NULL
      );`,
      "CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT NOT NULL);",
      "INSERT INTO notes (body) VALUES ('before upgrade');",
    ]);
    const connection = new DatabaseSync(databasePath);

    expect(() =>
      applyMigrationsTo(connection, {
        databasePath,
        databaseExisted: true,
        backupDir,
        migrationsList: [
          {
            version: 1,
            name: "add_upgrade_step",
            sql: "CREATE TABLE upgrade_step (id INTEGER PRIMARY KEY);",
          },
          {
            version: 2,
            name: "broken_upgrade",
            sql: "CREATE TABLE broken (id INTEGER PRIMARY KEY); INSERT INTO missing_table VALUES (1);",
          },
        ],
      })
    ).toThrow(/Migration 2 \(broken_upgrade\) failed[\s\S]*pre-migration backup was restored/);

    const reopened = new DatabaseSync(databasePath, { readOnly: true });
    try {
      expect(reopened.prepare("SELECT body FROM notes").all()).toEqual([
        { body: "before upgrade" },
      ]);
      expect(reopened.prepare("SELECT COUNT(*) AS count FROM schema_migrations").get()).toEqual({
        count: 0,
      });
    } finally {
      reopened.close();
    }
    const tables = readTables(databasePath);
    expect(tables).not.toContain("upgrade_step");
    expect(tables).not.toContain("broken");
    const backups = fs.readdirSync(backupDir).filter((name) => name.endsWith(".db"));
    expect(backups).toHaveLength(1);
    expect(backups[0]).toContain("0-to-2");
  });

  it("applies pending migrations and keeps the rollback point", () => {
    const directory = temporaryDirectory();
    const databasePath = path.join(directory, "runehall.db");
    const backupDir = path.join(directory, "backups");
    createDatabase(databasePath, [
      `CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at INTEGER NOT NULL
      );`,
      "CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT NOT NULL);",
      "INSERT INTO notes (body) VALUES ('kept');",
    ]);
    const connection = new DatabaseSync(databasePath);

    const result = applyMigrationsTo(connection, {
      databasePath,
      databaseExisted: true,
      backupDir,
      migrationsList: [
        {
          version: 1,
          name: "add_upgrade_step",
          sql: "CREATE TABLE upgrade_step (id INTEGER PRIMARY KEY);",
        },
      ],
    });
    connection.close();

    expect(result.applied).toEqual([1]);
    expect(result.current).toBe(1);
    expect(result.backupPath).toBeTruthy();
    expect(fs.existsSync(result.backupPath!)).toBe(true);
    expect(readTables(databasePath)).toContain("upgrade_step");
  });

  it("does not snapshot when every migration is already applied", () => {
    const directory = temporaryDirectory();
    const databasePath = path.join(directory, "runehall.db");
    const backupDir = path.join(directory, "backups");
    createDatabase(databasePath, [
      `CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at INTEGER NOT NULL
      );`,
      "INSERT INTO schema_migrations (version, name, applied_at) VALUES (1, 'done', 1000);",
    ]);
    const connection = new DatabaseSync(databasePath);

    const result = applyMigrationsTo(connection, {
      databasePath,
      databaseExisted: true,
      backupDir,
      migrationsList: [{ version: 1, name: "done", sql: "CREATE TABLE unused (id INTEGER);" }],
    });
    connection.close();

    expect(result).toMatchObject({ applied: [], current: 1, backupPath: null });
    expect(fs.existsSync(backupDir)).toBe(false);
  });
});
