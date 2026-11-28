#!/usr/bin/env node
/**
 * Find uploaded files that are no longer referenced anywhere in the database.
 *
 * Usage:
 *   npm run cleanup-assets
 *   npm run cleanup-assets -- --delete
 *   npm run cleanup-assets -- --delete --verbose
 *
 * The default is a dry run. Deletion skips files modified in the last hour so
 * an upload that is still being written or registered cannot be removed.
 */
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const args = process.argv.slice(2);
const shouldDelete = args.includes("--delete");
const verbose = args.includes("--verbose");
const dataDir = path.resolve(process.env.DATA_DIR || "data");
const databasePath = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : path.join(dataDir, "runehall.db");
const uploadsDir = path.join(dataDir, "uploads");

if (!fs.existsSync(databasePath)) {
  console.error(`No database found at ${databasePath}. Start Runehall once first.`);
  process.exit(1);
}

const db = new DatabaseSync(databasePath);
db.exec("PRAGMA busy_timeout = 5000;");
const referenced = new Set();
const uploadPattern = /\/uploads\/([A-Za-z0-9._-]+)/g;

// Scan every user table, not a hand-maintained list. A journal attachment,
// private note, or faction portrait is just as real as a scene background.
// uploaded_assets is included automatically.
const tables = db
  .prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  )
  .all()
  .map((row) => row.name);

for (const table of tables) {
  let rows;
  try {
    rows = db.prepare(`SELECT * FROM "${table.replace(/"/g, '""')}"`).all();
  } catch {
    continue;
  }
  for (const row of rows) {
    const text = JSON.stringify(row);
    for (const match of text.matchAll(uploadPattern)) {
      referenced.add(match[1]);
    }
  }
}

// The asset library stores bare filenames, not /uploads/ URLs. Files there are
// deliberately kept even when no scene or journal currently uses them.
try {
  const assetRows = db.prepare("SELECT filename FROM uploaded_assets").all();
  for (const row of assetRows) {
    if (typeof row.filename === "string" && row.filename) referenced.add(row.filename);
  }
} catch {
  // Older database without an asset library.
}
db.close();

const files = fs.existsSync(uploadsDir)
  ? fs
      .readdirSync(uploadsDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && !entry.name.startsWith("."))
      .map((entry) => entry.name)
  : [];
const GRACE_MS = 60 * 60 * 1000;
const unused = files.filter((file) => !referenced.has(file));
const sizes = new Map();
const recent = [];
const deletable = [];
const nowMs = Date.now();
for (const file of unused) {
  const stat = fs.statSync(path.join(uploadsDir, file));
  sizes.set(file, stat.size);
  if (nowMs - stat.mtimeMs < GRACE_MS) recent.push(file);
  else deletable.push(file);
}
const recentSet = new Set(recent);
const totalBytes = unused.reduce((total, file) => total + (sizes.get(file) ?? 0), 0);

console.log(`Upload directory: ${uploadsDir}`);
console.log(`Scanned tables:   ${tables.length}`);
console.log(`Referenced files: ${[...referenced].filter((name) => files.includes(name)).length}`);
console.log(`Uploaded files:   ${files.length}`);
console.log(
  `Unused files:     ${unused.length} (${(totalBytes / 1024 / 1024).toFixed(2)} MB)${
    recent.length ? `, ${recent.length} recent` : ""
  }`
);

const list = verbose ? unused : unused.slice(0, 50);
for (const file of list) {
  const bytes = sizes.get(file) ?? 0;
  const action = shouldDelete ? (recentSet.has(file) ? "keep" : "delete") : "unused";
  console.log(`  ${action}  ${file}  (${(bytes / 1024).toFixed(1)} KB)`);
}
if (!verbose && unused.length > list.length) {
  console.log(`  .and ${unused.length - list.length} more. Use --verbose to list them all.`);
}

if (!unused.length) {
  console.log("\nNo unused uploads found.");
  process.exit(0);
}
if (!shouldDelete) {
  console.log("\nDry run only. Re-run with --delete to remove these files.");
  process.exit(0);
}
if (!deletable.length) {
  console.log("\nNo files are older than the one-hour grace period yet.");
  process.exit(0);
}
for (const file of deletable) {
  fs.rmSync(path.join(uploadsDir, file), { force: true });
}

// Uploaded files are tracked in uploaded_assets. Remove the metadata rows for
// the files we just deleted so the asset library does not keep stale records.
try {
  const cleanupDb = new DatabaseSync(databasePath);
  const hasAssetTable = cleanupDb
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'uploaded_assets'")
    .get();
  if (hasAssetTable) {
    const removeRecord = cleanupDb.prepare("DELETE FROM uploaded_assets WHERE filename = ?");
    for (const file of deletable) removeRecord.run(file);
  }
  cleanupDb.close();
} catch {
  // File cleanup is still successful if an older database cannot be updated.
}

console.log(
  `\nDeleted ${deletable.length} unused upload${deletable.length === 1 ? "" : "s"}${
    recent.length ? `; kept ${recent.length} recent file${recent.length === 1 ? "" : "s"}` : ""
  }.`
);
