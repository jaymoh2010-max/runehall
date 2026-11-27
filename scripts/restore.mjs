#!/usr/bin/env node
/**
 * Restore a backup created by scripts/backup.mjs.
 *
 * Usage:
 *   npm run restore -- --from backups/runehall-2026-01-01T12-00-00-000Z --yes
 *   npm run restore -- --from <dir> --yes --allow-unverified
 *
 * The server must be stopped first. The script refuses to restore if the API
 * port is accepting connections, keeps a safety copy of the current DB, and
 * verifies the backup manifest checksums before changing anything.
 */
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { missingReferencedUploads, readManifest, verifyBackupManifest } from "./backup-lib.mjs";

const args = process.argv.slice(2);
const fromIndex = args.indexOf("--from");
const fromArg = fromIndex >= 0 ? args[fromIndex + 1] : args.find((arg) => !arg.startsWith("--"));
const assumeYes = args.includes("--yes");
const allowUnverified = args.includes("--allow-unverified");
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

function verifyDatabase(file) {
  const database = new DatabaseSync(file, { readOnly: true });
  try {
    const integrity = database
      .prepare("PRAGMA integrity_check")
      .all()
      .map((row) => Object.values(row)[0]);
    if (!integrity.every((value) => value === "ok")) {
      throw new Error(`SQLite integrity check failed: ${integrity.join(", ")}`);
    }
    const foreignKeys = database.prepare("PRAGMA foreign_key_check").all();
    if (foreignKeys.length) {
      throw new Error(`SQLite foreign key check found ${foreignKeys.length} issue(s)`);
    }
  } finally {
    database.close();
  }
}

try {
  verifyDatabase(backupDb);
} catch (error) {
  console.error(`Backup database check failed: ${error instanceof Error ? error.message : error}`);
  console.error("Nothing was changed.");
  process.exit(1);
}

try {
  const missing = missingReferencedUploads(backupDb, backupUploads);
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
    const socket = net.createConnection({ host, port, timeout: 600 });
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

for (const host of probeHosts) {
  if (!(await portIsOpen(host))) continue;
  console.error(
    `Runehall appears to be running on ${host}:${port}. Stop the server before restoring.`
  );
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const safetyDir = path.join(backupRoot, `pre-restore-${stamp}`);
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

for (const suffix of ["", "-wal", "-shm"]) {
  const file = `${databasePath}${suffix}`;
  if (fs.existsSync(file)) fs.rmSync(file, { force: true });
}
fs.mkdirSync(path.dirname(databasePath), { recursive: true });
fs.copyFileSync(backupDb, databasePath);

if (fs.existsSync(uploadsDir)) fs.rmSync(uploadsDir, { recursive: true, force: true });
fs.mkdirSync(uploadsDir, { recursive: true });
if (fs.existsSync(backupUploads)) {
  fs.cpSync(backupUploads, uploadsDir, { recursive: true });
}

let restoredCompendium = false;
if (fs.existsSync(backupCompendium)) {
  if (fs.existsSync(compendiumDir)) fs.rmSync(compendiumDir, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(compendiumDir), { recursive: true });
  fs.cpSync(backupCompendium, compendiumDir, { recursive: true });
  restoredCompendium = true;
} else {
  console.warn(
    `WARNING: this backup has no compendium at ${backupCompendium}. Keep the existing rules data in ${compendiumDir}.`
  );
}

console.log(`Restored ${backupDir}`);
console.log(`  Database: ${databasePath}`);
console.log(`  Uploads:  ${uploadsDir}`);
console.log(`  Compendium: ${restoredCompendium ? compendiumDir : "left unchanged"}`);
console.log(`  Safety copy of previous data: ${safetyDir}`);
console.log("Start Runehall again with: npm run dev");
