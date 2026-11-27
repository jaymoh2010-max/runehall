import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

/**
 * Database snapshots taken immediately before pending migrations run. These
 * are intentionally DB-only: migrations do not change uploaded files, and a
 * full archive would make startup needlessly slow on a large table.
 */
export interface MigrationBackupOptions {
  databasePath: string;
  /** Highest migration version already recorded, or 0 for a new schema. */
  fromVersion: number;
  /** Last migration version in this upgrade run. */
  toVersion: number;
  /** False when the database file was absent or empty before it was opened. */
  existingDatabase: boolean;
  backupDir?: string;
  /** 0 keeps every pre-migration backup. */
  keep?: number;
  /** Injectable clock so tests get deterministic file names. */
  date?: Date;
}

export type MigrationBackupSkipReason = "fresh-database" | "disabled";

export interface MigrationBackupResult {
  created: boolean;
  path: string | null;
  reason: MigrationBackupSkipReason | null;
}

const BACKUP_PREFIX = "runehall-pre-migration-";
const BACKUP_SUFFIX = ".db";

/** `MIGRATION_BACKUP=off` is the documented escape hatch for disposable DBs. */
export function migrationBackupDisabled(): boolean {
  const value = (process.env.MIGRATION_BACKUP ?? "").trim().toLowerCase();
  return ["0", "false", "no", "off", "disabled"].includes(value);
}

/** `MIGRATION_ROLLBACK=off` keeps a failed upgrade in place for inspection. */
export function migrationRollbackDisabled(): boolean {
  const value = (process.env.MIGRATION_ROLLBACK ?? "").trim().toLowerCase();
  return ["0", "false", "no", "off", "disabled"].includes(value);
}

export function defaultMigrationBackupDir(): string {
  const configured = (process.env.MIGRATION_BACKUP_DIR ?? "").trim();
  if (configured) return path.resolve(configured);
  const base = (process.env.BACKUP_DIR ?? "").trim() || "backups";
  return path.resolve(base, "pre-migration");
}

export function migrationBackupKeep(): number {
  const raw = (process.env.MIGRATION_BACKUP_KEEP ?? "").trim();
  if (!raw) return 5;
  const value = Math.round(Number(raw));
  return Number.isFinite(value) ? Math.max(0, value) : 5;
}

function sqlString(value: string): string {
  return value.replace(/'/g, "''");
}

function stamp(date: Date): string {
  return date.toISOString().replace(/[:.]/g, "-");
}

export function backupFileName(fromVersion: number, toVersion: number, date: Date): string {
  return `${BACKUP_PREFIX}${stamp(date)}-${fromVersion}-to-${toVersion}${BACKUP_SUFFIX}`;
}

/** Throws when a file is not a readable SQLite database with a clean integrity check. */
export function verifyDatabaseFile(filePath: string): void {
  const connection = new DatabaseSync(filePath, { readOnly: true });
  try {
    const rows = connection.prepare("PRAGMA integrity_check").all() as Record<string, unknown>[];
    const results = rows.map((row) => String(Object.values(row)[0] ?? ""));
    if (results.length !== 1 || results[0] !== "ok") {
      throw new Error(`integrity check returned ${results.join(", ") || "no result"}`);
    }
  } finally {
    connection.close();
  }
}

/** Remove old snapshots, newest first, while never touching the fresh backup. */
export function prunePreMigrationBackups(directory: string, keep: number): string[] {
  if (!(keep > 0) || !fs.existsSync(directory)) return [];
  const names = fs
    .readdirSync(directory, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() && entry.name.startsWith(BACKUP_PREFIX) && entry.name.endsWith(BACKUP_SUFFIX)
    )
    .map((entry) => entry.name)
    .sort();
  const remove = names.slice(0, Math.max(0, names.length - keep));
  for (const name of remove) {
    fs.rmSync(path.join(directory, name), { force: true });
  }
  return remove;
}

/**
 * Create a consistent snapshot with SQLite `VACUUM INTO`. The snapshot is
 * verified, then published with one rename so a partial file can never be
 * mistaken for a usable rollback point.
 */
export function createPreMigrationBackup(options: MigrationBackupOptions): MigrationBackupResult {
  if (!options.existingDatabase) {
    return { created: false, path: null, reason: "fresh-database" };
  }
  if (migrationBackupDisabled()) {
    return { created: false, path: null, reason: "disabled" };
  }
  const directory = path.resolve(options.backupDir ?? defaultMigrationBackupDir());
  fs.mkdirSync(directory, { recursive: true });
  const destination = path.join(
    directory,
    backupFileName(options.fromVersion, options.toVersion, options.date ?? new Date())
  );
  const temporary = `${destination}.partial-${process.pid}`;
  fs.rmSync(temporary, { force: true });
  try {
    const source = new DatabaseSync(options.databasePath);
    try {
      source.exec("PRAGMA busy_timeout = 5000;");
      source.exec(`VACUUM INTO '${sqlString(temporary)}';`);
    } finally {
      source.close();
    }
    verifyDatabaseFile(temporary);
    fs.renameSync(temporary, destination);
  } catch (error) {
    fs.rmSync(temporary, { force: true });
    throw new Error(
      `could not create ${destination}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  prunePreMigrationBackups(directory, options.keep ?? migrationBackupKeep());
  return { created: true, path: destination, reason: null };
}

/** Replace a database with a verified snapshot. The caller must stop the
 * server or close the connection first. WAL sidecars are removed so SQLite
 * cannot replay writes made after the snapshot.
 */
export function restoreDatabaseBackup(databasePath: string, backupPath: string): void {
  if (!fs.existsSync(backupPath)) {
    throw new Error(`backup not found at ${backupPath}`);
  }
  verifyDatabaseFile(backupPath);
  for (const suffix of ["-wal", "-shm"]) {
    fs.rmSync(`${databasePath}${suffix}`, { force: true });
  }
  const temporary = `${databasePath}.restore-${process.pid}.tmp`;
  const displaced = `${databasePath}.restore-old-${process.pid}`;
  fs.rmSync(temporary, { force: true });
  fs.rmSync(displaced, { force: true });
  try {
    fs.copyFileSync(backupPath, temporary);
    if (fs.existsSync(databasePath)) fs.renameSync(databasePath, displaced);
    fs.renameSync(temporary, databasePath);
    fs.rmSync(displaced, { force: true });
  } catch (error) {
    // Put the original file back if publishing the snapshot failed.
    if (!fs.existsSync(databasePath) && fs.existsSync(displaced)) {
      try {
        fs.renameSync(displaced, databasePath);
      } catch {
        // the caller reports the original restore failure below
      }
    }
    fs.rmSync(temporary, { force: true });
    throw error;
  }
}
