#!/usr/bin/env node
/**
 * Local password reset and administrator recovery.
 *
 * Usage:
 *   npm run reset-password -- --list
 *   npm run reset-password -- --username alice
 *   npm run reset-password -- --username alice --password "a long new password"
 *   npm run reset-password -- --username alice --admin
 *
 * With no --password, Runehall generates a strong temporary password and
 * prints it once. Every existing session for that account is invalidated.
 * The server may keep running; SQLite WAL and busy_timeout handle the write.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const has = (name) => args.includes(name);

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

if (has("--list")) {
  const users = db
    .prepare("SELECT username, display_name, is_admin, created_at FROM users ORDER BY created_at ASC")
    .all();
  if (!users.length) {
    console.log("No accounts exist yet. Register the first account in the app.");
  } else {
    console.log("Account                 Display name            Admin  Created");
    for (const user of users) {
      console.log(
        `${String(user.username).padEnd(23)} ${String(user.display_name).padEnd(23)} ${
          user.is_admin ? "yes  " : "no   "
        } ${new Date(Number(user.created_at)).toISOString()}`,
      );
    }
  }
  db.close();
  process.exit(0);
}

const username = (option("--username") || "").trim();
if (!username) {
  console.error("Usage: npm run reset-password -- --username <username> [--password <value>] [--admin]");
  console.error("       npm run reset-password -- --list");
  process.exit(1);
}

const row = db
  .prepare("SELECT id, username, display_name, is_admin FROM users WHERE username = ?")
  .get(username);
if (!row) {
  console.error(`No account named "${username}". Run with --list to see accounts.`);
  db.close();
  process.exit(1);
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto
    .scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 })
    .toString("hex");
  return `scrypt$${salt}$${hash}`;
}

const provided = option("--password");
const password = provided ?? crypto.randomBytes(18).toString("base64url");
if (password.length < 8) {
  console.error("The new password must be at least 8 characters.");
  db.close();
  process.exit(1);
}

const makeAdmin = has("--admin");
const removeAdmin = has("--remove-admin");
const now = Date.now();

db.exec("BEGIN");
try {
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(password), row.id);
  db.prepare("DELETE FROM sessions WHERE user_id = ?").run(row.id);
  if (makeAdmin) db.prepare("UPDATE users SET is_admin = 1 WHERE id = ?").run(row.id);
  if (removeAdmin) db.prepare("UPDATE users SET is_admin = 0 WHERE id = ?").run(row.id);
  const detail = [
    "local recovery tool",
    makeAdmin ? "granted administrator" : "",
    removeAdmin ? "removed administrator" : "",
  ]
    .filter(Boolean)
    .join("; ");
  db.prepare(
    `INSERT INTO audit_log
      (id, created_at, actor_id, actor_name, action, target_type, target_id, detail, ip)
     VALUES (?, ?, NULL, 'local-cli', 'auth.password_reset', 'user', ?, ?, '')`,
  ).run(`audit_${crypto.randomBytes(12).toString("hex")}`, now, row.id, detail);
  db.exec("COMMIT");
} catch (error) {
  try {
    db.exec("ROLLBACK");
  } catch {
    // ignore
  }
  console.error(`Could not reset the password: ${error instanceof Error ? error.message : String(error)}`);
  db.close();
  process.exit(1);
}

db.close();

console.log(`Reset password for @${row.username} (${row.display_name}).`);
if (!provided) {
  console.log("");
  console.log(`  Temporary password: ${password}`);
  console.log("");
  console.log("Store it now; it will not be shown again. Change it after signing in.");
} else {
  console.log("All sessions for this account were signed out.");
}
if (makeAdmin) console.log("This account is now an administrator.");
if (removeAdmin) console.log("This account is no longer an administrator.");
