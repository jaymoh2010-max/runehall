#!/usr/bin/env node
/**
 * Copy a checksummed Runehall backup to another disk, NAS mount, or synced
 * folder. The destination archive is verified before it is accepted.
 *
 * Usage:
 *   npm run ship-backup -- --to "D:\RunehallBackups" --keep 14
 *   npm run ship-backup -- --from backups/runehall-... --to /mnt/nas/runehall
 *
 * Environment:
 *   BACKUP_DIR       Local source directory (default: backups)
 *   BACKUP_SHIP_DIR  Default destination when --to is omitted
 *   BACKUP_SHIP_KEEP Remote retention count (default: 14; 0 keeps all)
 */
import fs from "node:fs";
import path from "node:path";
import { newestBackup, readManifest, verifyBackupManifest } from "./backup-lib.mjs";

const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
};
const sourceDir = path.resolve(process.env.BACKUP_DIR || "backups");
const source = path.resolve(option("--from") || newestBackup(sourceDir) || "");
const destination = path.resolve(option("--to") || process.env.BACKUP_SHIP_DIR || "");
const keepValue = option("--keep") ?? process.env.BACKUP_SHIP_KEEP ?? "14";
const keep = Math.max(0, Math.round(Number(keepValue) || 0));

if (!source || source === path.resolve("")) {
  console.error("No backup archive found. Run `npm run backup` first.");
  process.exit(1);
}
if (!fs.existsSync(source)) {
  console.error(`Backup archive not found: ${source}`);
  process.exit(1);
}
if (!destination || destination === path.resolve("")) {
  console.error("Choose a destination with --to <folder> or set BACKUP_SHIP_DIR.");
  process.exit(1);
}
if (path.resolve(destination) === path.dirname(path.resolve(source))) {
  console.error("The destination is the same folder as the source backup directory.");
  process.exit(1);
}

const manifest = readManifest(source);
if (!manifest) {
  console.error(`No valid backup.json found in ${source}.`);
  process.exit(1);
}
const sourceCheck = verifyBackupManifest(source, manifest);
if (!sourceCheck.ok) {
  console.error("Source backup failed integrity verification:");
  for (const error of sourceCheck.errors) console.error(`  - ${error}`);
  process.exit(1);
}
if (sourceCheck.legacy) {
  console.error(
    "This is a legacy backup without checksums. Create a new backup before shipping it off-machine."
  );
  process.exit(1);
}

fs.mkdirSync(destination, { recursive: true });
const archiveName = path.basename(source);
const final = path.join(destination, archiveName);

function verifyExisting() {
  const existingManifest = readManifest(final);
  if (!existingManifest) return false;
  return verifyBackupManifest(final, existingManifest).ok;
}

if (fs.existsSync(final)) {
  if (!verifyExisting()) {
    console.error(`Destination archive already exists but failed verification: ${final}`);
    process.exit(1);
  }
  console.log(`Already shipped and verified: ${final}`);
} else {
  const temporary = path.join(destination, `.incoming-${archiveName}-${process.pid}-${Date.now()}`);
  try {
    fs.cpSync(source, temporary, { recursive: true, errorOnExist: true });
    const copyCheck = verifyBackupManifest(temporary, manifest);
    if (!copyCheck.ok) {
      console.error("Copied backup failed integrity verification:");
      for (const error of copyCheck.errors) console.error(`  - ${error}`);
      fs.rmSync(temporary, { recursive: true, force: true });
      process.exit(1);
    }
    fs.renameSync(temporary, final);
  } catch (error) {
    fs.rmSync(temporary, { recursive: true, force: true });
    console.error("Could not ship the backup:", error);
    process.exit(1);
  }
  console.log(`Shipped and verified: ${source}`);
  console.log(`  -> ${final}`);
}

console.log(`  ${sourceCheck.checked} files matched the manifest digest.`);

if (keep > 0) {
  const archives = fs
    .readdirSync(destination, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("runehall-"))
    .map((entry) => entry.name)
    .sort()
    .reverse();
  const stale = archives
    .slice(keep)
    .filter((name) => path.resolve(path.join(destination, name)) !== path.resolve(final));
  for (const name of stale) {
    fs.rmSync(path.join(destination, name), { recursive: true, force: true });
  }
  if (stale.length) {
    console.log(`Retention: kept the newest ${keep} off-machine backups; removed ${stale.length}.`);
  }
}
