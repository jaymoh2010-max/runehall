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
// Build in a staging directory and publish with one rename so an interrupted
// backup never looks like a complete archive.
const staging = `${destination}.partial`;
let finalized = false;
fs.mkdirSync(staging, { recursive: true });
process.on("exit", () => {
  if (!finalized) fs.rmSync(staging, { recursive: true, force: true });
});

function sqlString(value) {
  return value.replace(/'/g, "''");
}

const snapshotPath = path.join(staging, "runehall.db");
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

const stagedUploads = path.join(staging, "uploads");
if (fs.existsSync(uploadsDir)) {
  fs.cpSync(uploadsDir, stagedUploads, { recursive: true });
} else {
  fs.mkdirSync(stagedUploads, { recursive: true });
}

// A backup must not contain a database row that points at an upload the copy
// missed. The snapshot and file copy are separate operations; this check
// catches an asset deleted between them (or pre-existing orphan rows).
try {
  const snapshot = new DatabaseSync(snapshotPath, { readOnly: true });
  const referenced = new Set();
  try {
    const tables = snapshot
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((row) => String(Object.values(row)[0]));
    for (const table of tables) {
      for (const row of snapshot.prepare(`SELECT * FROM "${table}"`).all()) {
        for (const match of JSON.stringify(row).matchAll(/\/uploads\/([A-Za-z0-9._-]+)/g)) {
          referenced.add(match[1]);
        }
      }
    }
  } finally {
    snapshot.close();
  }
  const missing = [...referenced].filter(
    (filename) => !fs.existsSync(path.join(stagedUploads, filename))
  );
  if (missing.length) {
    console.warn(
      `WARNING: ${missing.length} referenced upload(s) are missing from this backup: ${missing
        .slice(0, 8)
        .join(", ")}${missing.length > 8 ? ", …" : ""}`
    );
  }
} catch (error) {
  console.warn(
    `WARNING: could not verify backup upload references: ${
      error instanceof Error ? error.message : String(error)
    }`
  );
}

// The compendium is required for the server to start and for the builder to
// work. Include it in every backup so a restore into a clean machine is
// actually usable. The manifest copy stays for quick version inspection.
const manifestPath = path.join(compendiumDir, "manifest.json");
if (fs.existsSync(manifestPath)) {
  fs.copyFileSync(manifestPath, path.join(staging, "compendium-manifest.json"));
}
if (fs.existsSync(compendiumDir)) {
  fs.cpSync(compendiumDir, path.join(staging, "compendium"), { recursive: true });
} else {
  console.warn(
    `WARNING: no compendium found at ${compendiumDir}; the backup will not include rules data.`
  );
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
        path: path.relative(staging, full).split(path.sep).join("/"),
        bytes: fs.statSync(full).size,
        sha256: sha256File(full),
      });
    }
  }
};
walk(staging);
files.sort((a, b) => a.path.localeCompare(b.path));
const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);
const digest = manifestDigest(files);

fs.writeFileSync(
  path.join(staging, "backup.json"),
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

fs.renameSync(staging, destination);
finalized = true;

console.log(`Runehall backup created:`);
console.log(`  ${destination}`);
console.log(`  ${(totalBytes / 1024 / 1024).toFixed(1)} MB, ${files.length} files`);
console.log(`  manifest ${digest.slice(0, 16)}…`);

if (keep > 0) {
  const archives = fs
    .readdirSync(backupRoot, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        entry.name.startsWith("runehall-") &&
        !entry.name.includes(".partial")
    )
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
