#!/usr/bin/env node
/**
 * Create a consistent, timestamped backup of the Runehall database and
 * uploaded assets. Uses SQLite VACUUM INTO so it is safe while the server is
 * running and does not depend on copying the -wal file.
 *
 * Usage:
 *   npm run backup
 *   npm run backup -- --dir D:\RunehallBackups
 *   npm run backup -- --dir D:\RunehallBackups --keep 14
 */
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { manifestDigest, sha256File } from "./backup-lib.mjs";

const args = process.argv.slice(2);
const dirArg = args.indexOf("--dir");
const keepArg = args.indexOf("--keep");
const keep = keepArg >= 0 ? Math.max(0, Math.round(Number(args[keepArg + 1]) || 0)) : 0;
const backupRoot = path.resolve(
  dirArg >= 0 ? args[dirArg + 1] : process.env.BACKUP_DIR || "backups"
);
const dataDir = path.resolve(process.env.DATA_DIR || "data");
const databasePath = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : path.join(dataDir, "runehall.db");
const uploadsDir = path.join(dataDir, "uploads");
const compendiumDir = path.resolve(process.env.COMPENDIUM_DIR || path.join(dataDir, "compendium"));

if (!fs.existsSync(databasePath)) {
  console.error(`No database found at ${databasePath}. Start Runehall once before backing up.`);
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const destination = path.join(backupRoot, `runehall-${stamp}`);
fs.mkdirSync(destination, { recursive: true });

function sqlString(value) {
  return value.replace(/'/g, "''");
}

const snapshotPath = path.join(destination, "runehall.db");
const source = new DatabaseSync(databasePath);
try {
  source.exec("PRAGMA busy_timeout = 5000;");
  source.exec(`VACUUM INTO '${sqlString(snapshotPath)}';`);
} catch (error) {
  console.error("Could not create the database snapshot.", error);
  process.exit(1);
} finally {
  source.close();
}

if (fs.existsSync(uploadsDir)) {
  fs.cpSync(uploadsDir, path.join(destination, "uploads"), { recursive: true });
} else {
  fs.mkdirSync(path.join(destination, "uploads"), { recursive: true });
}

// Keep a copy of the compendium manifest and, when explicitly requested, the
// full compendium. The manifest alone is enough to identify the data version.
const manifestPath = path.join(compendiumDir, "manifest.json");
if (fs.existsSync(manifestPath)) {
  fs.copyFileSync(manifestPath, path.join(destination, "compendium-manifest.json"));
}
if (args.includes("--with-compendium") && fs.existsSync(compendiumDir)) {
  fs.cpSync(compendiumDir, path.join(destination, "compendium"), { recursive: true });
}

let packageVersion = "unknown";
try {
  packageVersion = JSON.parse(fs.readFileSync("package.json", "utf8")).version ?? "unknown";
} catch {
  // optional metadata only
}

const files = [];
const walk = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full);
    else {
      files.push({
        path: path.relative(destination, full).split(path.sep).join("/"),
        bytes: fs.statSync(full).size,
        sha256: sha256File(full),
      });
    }
  }
};
walk(destination);
files.sort((a, b) => a.path.localeCompare(b.path));
const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);
const digest = manifestDigest(files);

fs.writeFileSync(
  path.join(destination, "backup.json"),
  JSON.stringify(
    {
      format: "runehall-backup",
      version: 2,
      createdAt: new Date().toISOString(),
      appVersion: packageVersion,
      source: { dataDir, databasePath, uploadsDir },
      totalBytes,
      digest,
      files,
    },
    null,
    2
  )
);

console.log(`Runehall backup created:`);
console.log(`  ${destination}`);
console.log(`  ${(totalBytes / 1024 / 1024).toFixed(1)} MB, ${files.length} files`);
console.log(`  manifest ${digest.slice(0, 16)}…`);

if (keep > 0) {
  const archives = fs
    .readdirSync(backupRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("runehall-"))
    .map((entry) => entry.name)
    .sort()
    .reverse();
  const stale = archives.slice(keep);
  for (const name of stale) {
    if (path.join(backupRoot, name) === destination) continue;
    fs.rmSync(path.join(backupRoot, name), { recursive: true, force: true });
  }
  if (stale.length) {
    console.log(
      `\nRetention: kept the newest ${keep} backup${keep === 1 ? "" : "s"}; removed ${stale.length}.`
    );
  }
}

console.log(`\nCopy this whole folder somewhere safe. To restore, stop the server and run:`);
console.log(`  npm run restore -- --from "${destination}" --yes`);
