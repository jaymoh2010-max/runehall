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
import { readManifest, verifyBackupManifest } from "./backup-lib.mjs";

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
const port = Number(process.env.PORT || 3001);

if (!fromArg) {
  console.error("Usage: npm run restore -- --from <backup-directory> --yes");
  process.exit(1);
}
const backupDir = path.resolve(fromArg);
const backupDb = path.join(backupDir, "runehall.db");
if (!fs.existsSync(backupDb)) {
  console.error(`No runehall.db found in ${backupDir}`);
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
    console.warn("WARNING: this is a legacy backup without per-file checksums.");
  } else {
    console.log(`Verified ${verification.checked} files against the backup manifest.`);
  }
}

function portIsOpen() {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port, timeout: 600 });
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

if (await portIsOpen()) {
  console.error(
    `Runehall appears to be running on port ${port}. Stop the server before restoring.`
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

for (const suffix of ["", "-wal", "-shm"]) {
  const file = `${databasePath}${suffix}`;
  if (fs.existsSync(file)) fs.rmSync(file, { force: true });
}
fs.mkdirSync(path.dirname(databasePath), { recursive: true });
fs.copyFileSync(backupDb, databasePath);

const backupUploads = path.join(backupDir, "uploads");
if (fs.existsSync(uploadsDir)) fs.rmSync(uploadsDir, { recursive: true, force: true });
fs.mkdirSync(uploadsDir, { recursive: true });
if (fs.existsSync(backupUploads)) {
  fs.cpSync(backupUploads, uploadsDir, { recursive: true });
}

console.log(`Restored ${backupDir}`);
console.log(`  Database: ${databasePath}`);
console.log(`  Uploads:  ${uploadsDir}`);
console.log(`  Safety copy of previous data: ${safetyDir}`);
console.log("Start Runehall again with: npm run dev");
