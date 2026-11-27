import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { applyMigrationsTo } from "../src/server/migrate";
import type { Migration } from "../src/server/migrations";

const directories: string[] = [];

function temporaryDatabase(): { db: DatabaseSync; file: string } {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "runehall-migration-metadata-"));
  directories.push(directory);
  const file = path.join(directory, "runehall.db");
  return { db: new DatabaseSync(file), file };
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("migration metadata", () => {
  it("rejects a version whose recorded name belongs to another branch", () => {
    const { db, file } = temporaryDatabase();
    const first: Migration[] = [
      { version: 1, name: "alpha_schema", sql: "CREATE TABLE alpha (id INTEGER);" },
    ];
    applyMigrationsTo(db, {
      databasePath: file,
      databaseExisted: false,
      migrationsList: first,
    });
    const conflicting: Migration[] = [
      { version: 1, name: "beta_schema", sql: "CREATE TABLE alpha (id INTEGER);" },
    ];
    expect(() =>
      applyMigrationsTo(db, {
        databasePath: file,
        databaseExisted: true,
        migrationsList: conflicting,
      })
    ).toThrow(/Schema history conflict at migration 1/);
    db.close();
  });

  it("records checksums and rejects edited migration SQL", () => {
    const { db, file } = temporaryDatabase();
    const first: Migration[] = [
      { version: 1, name: "alpha_schema", sql: "CREATE TABLE alpha (id INTEGER);" },
      {
        version: 2,
        name: "checksum_metadata",
        sql: "ALTER TABLE schema_migrations ADD COLUMN checksum TEXT NOT NULL DEFAULT '';",
      },
    ];
    applyMigrationsTo(db, {
      databasePath: file,
      databaseExisted: false,
      migrationsList: first,
    });
    const rows = db
      .prepare("SELECT version, name, checksum FROM schema_migrations ORDER BY version")
      .all() as { version: number; name: string; checksum: string }[];
    expect(rows[0]).toMatchObject({ version: 1, name: "alpha_schema" });
    expect(rows[0].checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(rows[1].checksum).toMatch(/^[a-f0-9]{64}$/);

    const edited: Migration[] = [
      {
        version: 1,
        name: "alpha_schema",
        sql: "CREATE TABLE alpha (id INTEGER, extra TEXT);",
      },
      first[1],
    ];
    expect(() =>
      applyMigrationsTo(db, {
        databasePath: file,
        databaseExisted: true,
        migrationsList: edited,
      })
    ).toThrow(/checksum mismatch at migration 1/);
    db.close();
  });
});
