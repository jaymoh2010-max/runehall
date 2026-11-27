#!/usr/bin/env node
/**
 * Restore a backup created by scripts/backup.mjs.
 *
 * Usage:
 *   npm run restore -- --from backups/runehall-2026-01-01T12-00-00-000Z --yes
 *   npm run restore -- --from <dir> --yes --allow-unverified
 *   npm run restore -- --from <dir> --yes --allow-unsafe (corrupt live DB)
 *   npm run restore -- --from <dir> --yes --allow-newer-schema
 *
 * The server must be stopped first. The script refuses to restore if the API
 * port is accepting connections, keeps a safety copy of the current DB, and
 * verifies the backup manifest checksums before changing anything.
 */
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  missingStructuredUploads,
  readManifest,
  verifyBackupManifest,
  verifyDatabaseFile,
} from "./backup-lib.mjs";

const args = process.argv.slice(2);
const fromIndex = args.indexOf("--from");
const fromArg = fromIndex >= 0 ? args[fromIndex + 1] : args.find((arg) => !arg.startsWith("--"));
const assumeYes = args.includes("--yes");
const allowUnverified = args.includes("--allow-unverified");
const allowUnsafe = args.includes("--allow-unsafe");
const allowNewerSchema = args.includes("--allow-newer-schema");
const dataDir = path.resolve(process.env.DATA_DIR || "data");
const backupRoot = path.resolve(process.env.BACKUP_DIR || "backups");
const databasePath = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : path.join(dataDir, "runehall.db");
const uploadsDir = path.join(dataDir, "uploads");
const compendiumDir = path.resolve(process.env.COMPENDIUM_DIR || path.join(dataDir, "compendium"));
const port = Number(process.env.PORT || 3001);
const configuredHost = process.env.HOST || "127.0.0.1";
const probeHosts = [
  ...new Set([
    configuredHost === "0.0.0.0" || configuredHost === "::" ? "127.0.0.1" : configuredHost,
    "127.0.0.1",
    "::1",
  ]),
];

if (!fromArg) {
  console.error("Usage: npm run restore -- --from <backup-directory> --yes");
  process.exit(1);
}
const backupDir = path.resolve(fromArg);
const backupDb = path.join(backupDir, "runehall.db");
const backupUploads = path.join(backupDir, "uploads");
const backupCompendium = path.join(backupDir, "compendium");
if (!fs.existsSync(backupDb)) {
  console.error(`No runehall.db found in ${backupDir}`);
  process.exit(1);
}
if (
  path.resolve(backupDir) === path.resolve(dataDir) ||
  path.resolve(backupDb) === path.resolve(databasePath) ||
  path.resolve(backupUploads) === path.resolve(uploadsDir) ||
  path.resolve(backupCompendium) === path.resolve(compendiumDir)
) {
  console.error("Refusing to restore a backup that overlaps the live data directory.");
  process.exit(1);
}
if (!assumeYes) {
  console.error("Refusing to overwrite live data without --yes.");
  console.error(`Re-run with: npm run restore -- --from "${backupDir}" --yes`);
  process.exit(1);
}

const manifest = readManifest(backupDir);
if (!manifest) {
  if (!allowUnverified) {
    console.error(`No valid backup.json found in ${backupDir}.`);
    console.error(
      "Refusing to restore an unverifiable archive. Add --allow-unverified only for a manually inspected backup."
    );
    process.exit(1);
  }
  console.warn("WARNING: restoring an archive without backup.json; checksums cannot be verified.");
} else {
  const verification = verifyBackupManifest(backupDir, manifest);
  if (!verification.ok) {
    console.error("Backup integrity check failed:");
    for (const error of verification.errors) console.error(`  - ${error}`);
    console.error("Nothing was changed.");
    process.exit(1);
  }
  if (verification.legacy) {
    if (!allowUnverified) {
      console.error(
        "This is a legacy backup without per-file checksums; add --allow-unverified to restore it."
      );
      process.exit(1);
    }
    console.warn("WARNING: this is a legacy backup without per-file checksums.");
  } else {
    const hasDatabase = manifest.files?.some(
      (file) => path.normalize(String(file?.path ?? "")) === "runehall.db"
    );
    if (!hasDatabase) {
      console.error("The backup manifest does not include runehall.db.");
      process.exit(1);
    }
    console.log(`Verified ${verification.checked} files against the backup manifest.`);
  }
}

try {
  verifyDatabaseFile(backupDb);
} catch (error) {
  console.error(`Backup database check failed: ${error instanceof Error ? error.message : error}`);
  console.error("Nothing was changed.");
  process.exit(1);
}

function latestCodeMigration() {
  try {
    const source = fs.readFileSync(path.resolve("src", "server", "migrations.ts"), "utf8");
    const versions = [...source.matchAll(/version:\s*(\d+)/g)].map((match) => Number(match[1]));
    return versions.length ? Math.max(...versions) : 0;
  } catch {
    return null;
  }
}

function latestAppliedMigration(file) {
  const database = new DatabaseSync(file, { readOnly: true });
  try {
    const row = database.prepare("SELECT MAX(version) AS version FROM schema_migrations").get();
    const version = Number(row?.version);
    return Number.isFinite(version) ? version : null;
  } catch {
    return null;
  } finally {
    database.close();
  }
}

const codeSchema = latestCodeMigration();
const backupSchema = latestAppliedMigration(backupDb);
if (codeSchema !== null && backupSchema !== null && backupSchema > codeSchema) {
  const message = `Backup schema is newer (v${backupSchema}) than this server (v${codeSchema}).`;
  if (!allowNewerSchema) {
    console.error(message);
    console.error(
      "Nothing was changed. Upgrade Runehall, or pass --allow-newer-schema if you deliberately downgraded."
    );
    process.exit(1);
  }
  console.warn(`WARNING: ${message} Restoring anyway.`);
}

try {
  const missing = missingStructuredUploads(backupDb, backupUploads);
  if (missing.length) {
    console.error(
      `Backup is incomplete: ${missing.length} referenced upload(s) are missing: ${missing
        .slice(0, 8)
        .join(", ")}${missing.length > 8 ? ", …" : ""}`
    );
    console.error("Nothing was changed.");
    process.exit(1);
  }
} catch (error) {
  console.error(
    `Backup upload check failed: ${error instanceof Error ? error.message : String(error)}`
  );
  console.error("Nothing was changed.");
  process.exit(1);
}

function portIsOpen(host) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port, timeout: 1500 });
    socket.setNoDelay(true);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => resolve(false));
  });
}

// A stopped server can still take a moment to release the listener. Check each
// host three times before deciding the port is free.
for (const host of probeHosts) {
  let open = false;
  for (let attempt = 0; attempt < 3 && !open; attempt += 1) {
    open = await portIsOpen(host);
    if (!open && attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  if (!open) continue;
  console.error(
    `Runehall appears to be running on ${host}:${port}. Stop the server before restoring.`
  );
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const safetyDir = path.join(backupRoot, `pre-restore-${stamp}`);
let safetyError = null;
try {
  fs.mkdirSync(safetyDir, { recursive: true });
  if (fs.existsSync(databasePath)) {
    // Use the same consistent snapshot mechanism as the backup command; a plain
    // file copy can miss committed pages still sitting in the WAL.
    const safetyDb = path.join(safetyDir, "runehall.db");
    const source = new DatabaseSync(databasePath);
    try {
      source.exec("PRAGMA busy_timeout = 5000;");
      source.exec(`VACUUM INTO '${safetyDb.replace(/'/g, "''")}';`);
    } finally {
      source.close();
    }
  }
  if (fs.existsSync(uploadsDir)) {
    fs.cpSync(uploadsDir, path.join(safetyDir, "uploads"), { recursive: true });
  }
  if (fs.existsSync(compendiumDir)) {
    fs.cpSync(compendiumDir, path.join(safetyDir, "compendium"), { recursive: true });
  }
} catch (error) {
  safetyError = error;
}
if (safetyError) {
  const message = safetyError instanceof Error ? safetyError.message : String(safetyError);
  if (!allowUnsafe) {
    console.error(`Could not create a safety copy of the current data: ${message}`);
    console.error(
      "Nothing was changed. Fix the live database or pass --allow-unsafe to restore without a safety copy."
    );
    process.exit(1);
  }
  console.warn(`WARNING: restoring without a complete safety copy: ${message}`);
}

// Stage the replacement on the same filesystem, then swap. If a copy or
// rename fails, the live database and uploads are restored instead of being
// lost. The previous data is kept in `live/` for a quick local rollback.
const localSafety = path.join(dataDir, `.restore-${stamp}`);
const liveDir = path.join(localSafety, "live");
const stagedDb = path.join(localSafety, "runehall.db");
const stagedUploads = path.join(localSafety, "uploads");
const stagedCompendium = path.join(localSafety, "compendium");
let restoredCompendium = false;

const moveIfPresent = (source, name) => {
  if (!fs.existsSync(source)) return false;
  const destination = path.join(liveDir, name);
  fs.renameSync(source, destination);
  return true;
};

try {
  fs.mkdirSync(liveDir, { recursive: true });
  fs.copyFileSync(backupDb, stagedDb);
  verifyDatabaseFile(stagedDb);
  if (fs.existsSync(backupUploads)) {
    fs.cpSync(backupUploads, stagedUploads, { recursive: true });
  }
  if (fs.existsSync(backupCompendium)) {
    fs.cpSync(backupCompendium, stagedCompendium, { recursive: true });
  }

  moveIfPresent(databasePath, "runehall.db");
  for (const suffix of ["-wal", "-shm", "-journal"]) {
    moveIfPresent(`${databasePath}${suffix}`, `runehall.db${suffix}`);
  }
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  fs.renameSync(stagedDb, databasePath);

  moveIfPresent(uploadsDir, "uploads");
  if (fs.existsSync(stagedUploads)) {
    fs.renameSync(stagedUploads, uploadsDir);
  } else {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  if (fs.existsSync(stagedCompendium)) {
    moveIfPresent(compendiumDir, "compendium");
    fs.mkdirSync(path.dirname(compendiumDir), { recursive: true });
    fs.renameSync(stagedCompendium, compendiumDir);
    restoredCompendium = true;
  } else {
    console.warn(
      `WARNING: this backup has no compendium at ${backupCompendium}. Keep the existing rules data in ${compendiumDir}.`
    );
  }
} catch (error) {
  const failures = [];
  const restoreLive = (current, name, failedName) => {
    const live = path.join(liveDir, name);
    if (!fs.existsSync(live)) return;
    if (fs.existsSync(current)) fs.renameSync(current, path.join(localSafety, failedName));
    fs.renameSync(live, current);
  };
  try {
    restoreLive(databasePath, "runehall.db", "failed-runehall.db");
    for (const suffix of ["-wal", "-shm", "-journal"]) {
      restoreLive(
        `${databasePath}${suffix}`,
        `runehall.db${suffix}`,
        `failed-runehall.db${suffix}`
      );
    }
    restoreLive(uploadsDir, "uploads", "failed-uploads");
    restoreLive(compendiumDir, "compendium", "failed-compendium");
  } catch (rollbackError) {
    failures.push(rollbackError instanceof Error ? rollbackError.message : String(rollbackError));
  }
  console.error(`Restore failed: ${error instanceof Error ? error.message : String(error)}`);
  if (failures.length) {
    console.error(`Rollback also failed: ${failures.join("; ")}`);
    console.error(`Recover from the safety copy at ${safetyDir}.`);
  } else {
    console.error("The previous database and uploads were restored.");
  }
  process.exit(1);
}

console.log(`Restored ${backupDir}`);
console.log(`  Database: ${databasePath}`);
console.log(`  Uploads:  ${uploadsDir}`);
console.log(`  Compendium: ${restoredCompendium ? compendiumDir : "left unchanged"}`);
console.log(`  Safety copy of previous data: ${safetyDir}`);
console.log(`  Local rollback copy: ${liveDir}`);
console.log("Start Runehall again with: npm run dev");
