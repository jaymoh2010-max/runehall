import type { DatabaseSync } from "node:sqlite";
import { migrations, type Migration } from "./migrations";
import {
  createPreMigrationBackup,
  migrationBackupDisabled,
  migrationRollbackDisabled,
  restoreDatabaseBackup,
} from "./migrationBackup";

export interface MigrationRunOptions {
  databasePath: string;
  /** False when the database file was absent or empty before it was opened. */
  databaseExisted: boolean;
  /** Test hook; production uses the shipped migration list. */
  migrationsList?: Migration[];
  backupDir?: string;
  backupKeep?: number;
}

export interface MigrationRunResult {
  applied: number[];
  current: number;
  /** Snapshot created before pending migrations, when one was needed. */
  backupPath: string | null;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function rollbackDatabase(
  connection: DatabaseSync,
  databasePath: string,
  backupPath: string | null
): string {
  if (!backupPath) {
    if (migrationBackupDisabled()) {
      return "Pre-migration backups were disabled with MIGRATION_BACKUP, so no rollback was possible.";
    }
    return "No pre-migration backup was needed for this fresh database; nothing was rolled back.";
  }
  if (migrationRollbackDisabled()) {
    return `Automatic rollback is disabled with MIGRATION_ROLLBACK. Stop the server and restore ${backupPath} manually.`;
  }
  try {
    connection.close();
  } catch {
    // the original migration error is more useful than a close failure
  }
  try {
    restoreDatabaseBackup(databasePath, backupPath);
    return `The pre-migration backup was restored from ${backupPath}.`;
  } catch (error) {
    return `Automatic rollback failed (${describe(
      error
    )}). Stop the server and restore ${backupPath} manually.`;
  }
}

/**
 * Apply pending migrations to one connection. A verified snapshot is taken
 * before the first pending migration; a failed upgrade closes the connection
 * and restores that snapshot so startup never leaves a half-upgraded schema.
 */
export function applyMigrationsTo(
  connection: DatabaseSync,
  options: MigrationRunOptions
): MigrationRunResult {
  const list = options.migrationsList ?? migrations;
  connection.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    );
  `);
  const appliedVersions = new Set(
    (
      connection.prepare("SELECT version FROM schema_migrations ORDER BY version").all() as {
        version: number;
      }[]
    ).map((row) => Number(row.version))
  );
  const pending = list.filter((migration) => !appliedVersions.has(migration.version));
  const current = list.length ? list[list.length - 1].version : 0;
  if (!pending.length) {
    connection.exec(`PRAGMA user_version = ${current};`);
    return { applied: [], current, backupPath: null };
  }

  const fromVersion = appliedVersions.size ? Math.max(...appliedVersions) : 0;
  const toVersion = pending[pending.length - 1].version;
  let backupPath: string | null = null;
  if (!options.databaseExisted) {
    console.log("[db] fresh database; skipping pre-migration backup");
  } else {
    try {
      const backup = createPreMigrationBackup({
        databasePath: options.databasePath,
        fromVersion,
        toVersion,
        existingDatabase: true,
        backupDir: options.backupDir,
        keep: options.backupKeep,
      });
      backupPath = backup.path;
      if (backup.created) {
        console.log(`[db] pre-migration backup: ${backup.path}`);
      } else if (backup.reason === "disabled") {
        console.warn(
          "[db] WARNING: MIGRATION_BACKUP is off; pending migrations will run without a rollback snapshot."
        );
      }
    } catch (error) {
      throw new Error(
        `Pre-migration backup failed: ${describe(
          error
        )}. Fix the backup location, or set MIGRATION_BACKUP=off to migrate without a snapshot (unsafe).`
      );
    }
  }

  const applied: number[] = [];
  for (const migration of pending) {
    connection.exec("BEGIN");
    try {
      connection.exec(migration.sql);
      connection
        .prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)")
        .run(migration.version, migration.name, Date.now());
      connection.exec("COMMIT");
      applied.push(migration.version);
      console.log(`[db] applied migration ${migration.version}: ${migration.name}`);
    } catch (error) {
      try {
        connection.exec("ROLLBACK");
      } catch {
        // ignore rollback failures; the original error is more useful
      }
      const rollback = rollbackDatabase(connection, options.databasePath, backupPath);
      throw new Error(
        `Migration ${migration.version} (${migration.name}) failed: ${describe(error)}. ${rollback}`
      );
    }
  }
  connection.exec(`PRAGMA user_version = ${current};`);
  return { applied, current, backupPath };
}
