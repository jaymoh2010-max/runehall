#!/usr/bin/env node
/**
 * Prune audit entries older than the configured retention window.
 *
 * Usage:
 *   npm run audit-prune
 *   npm run audit-prune -- --days 180
 *   npm run audit-prune -- --days 180 --delete
 *
 * Retention is read from Hall controls (app_settings) or AUDIT_RETENTION_DAYS.
 * The default is a dry run.
 */
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const args = process.argv.slice(2);
const daysArg = args.indexOf("--days");
const shouldDelete = args.includes("--delete");
const dataDir = path.resolve(process.env.DATA_DIR || "data");
const databasePath = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : path.join(dataDir, "runehall.db");

if (!fs.existsSync(databasePath)) {
  console.error(`No database found at ${databasePath}. Start Runehall once first.`);
  process.exit(1);
}

const db = new DatabaseSync(databasePath);
db.exec("PRAGMA busy_timeout = 5000;");

let days = 0;
if (daysArg >= 0) {
  days = Math.max(0, Math.min(3650, Math.round(Number(args[daysArg + 1]) || 0)));
} else {
  const row = db
    .prepare("SELECT value FROM app_settings WHERE key = 'audit_retention_days'")
    .get();
  days = row
    ? Math.max(0, Math.min(3650, Math.round(Number(row.value) || 0)))
    : Math.max(0, Math.min(3650, Math.round(Number(process.env.AUDIT_RETENTION_DAYS) || 0)));
}

const total = Number(
  (db.prepare("SELECT COUNT(*) AS count FROM audit_log").get() || {}).count || 0,
);

if (days <= 0) {
  console.log(`Audit entries: ${total}`);
  console.log("Retention is disabled. Set --days N or update audit retention in Hall controls.");
  db.close();
  process.exit(0);
}

const cutoff = Date.now() - days * 86_400_000;
const expired = Number(
  (
    db
      .prepare("SELECT COUNT(*) AS count FROM audit_log WHERE created_at < ?")
      .get(cutoff) || {}
  ).count || 0,
);
console.log(`Audit entries: ${total}`);
console.log(`Retention:    ${days} days`);
console.log(`Cutoff:       ${new Date(cutoff).toISOString()}`);
console.log(`Expired:      ${expired}`);

if (!expired) {
  console.log("Nothing to prune.");
} else if (!shouldDelete) {
  console.log("Dry run only. Re-run with --delete to remove these entries.");
} else {
  db.prepare("DELETE FROM audit_log WHERE created_at < ?").run(cutoff);
  console.log(`Deleted ${expired} audit entr${expired === 1 ? "y" : "ies"}.`);
}
db.close();
