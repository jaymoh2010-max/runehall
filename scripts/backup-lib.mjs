#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export function sha256File(filename) {
  const hash = crypto.createHash("sha256");
  const buffer = Buffer.alloc(1024 * 1024);
  const descriptor = fs.openSync(filename, "r");
  try {
    let bytes = 0;
    while ((bytes = fs.readSync(descriptor, buffer, 0, buffer.length, null)) > 0) {
      hash.update(buffer.subarray(0, bytes));
    }
  } finally {
    fs.closeSync(descriptor);
  }
  return hash.digest("hex");
}

/** Deterministic digest over path, byte length, and per-file hash. */
export function manifestDigest(files) {
  const lines = [...files]
    .sort((a, b) => String(a.path).localeCompare(String(b.path)))
    .map((file) => `${file.path}\0${file.bytes}\0${file.sha256}`);
  return crypto.createHash("sha256").update(lines.join("\n")).digest("hex");
}

/**
 * Verify every file recorded in a backup manifest before shipping or restoring.
 * Version 1 archives predate per-file hashes and are reported as legacy.
 */
export function verifyBackupManifest(root, manifest) {
  if (!manifest || manifest.format !== "runehall-backup") {
    return { ok: false, legacy: false, checked: 0, errors: ["Not a Runehall backup manifest."] };
  }
  if (!Array.isArray(manifest.files)) {
    return { ok: false, legacy: false, checked: 0, errors: ["Backup manifest has no file list."] };
  }
  if (Number(manifest.version) < 2) {
    return { ok: true, legacy: true, checked: 0, errors: [] };
  }
  const errors = [];
  if (!manifest.digest || manifestDigest(manifest.files) !== manifest.digest) {
    errors.push("Backup manifest digest does not match its file list.");
  }
  const rootPath = path.resolve(root);
  let checked = 0;
  for (const file of manifest.files) {
    if (!file || typeof file.path !== "string" || !file.path) {
      errors.push("Backup manifest contains an invalid file entry.");
      continue;
    }
    const full = path.resolve(rootPath, file.path);
    if (full !== rootPath && !full.startsWith(`${rootPath}${path.sep}`)) {
      errors.push(`Backup path escapes the archive: ${file.path}`);
      continue;
    }
    if (!fs.existsSync(full)) {
      errors.push(`Missing file: ${file.path}`);
      continue;
    }
    const size = fs.statSync(full).size;
    if (Number(file.bytes) !== size) {
      errors.push(`Size mismatch: ${file.path}`);
      continue;
    }
    const digest = sha256File(full);
    if (digest !== file.sha256) {
      errors.push(`Checksum mismatch: ${file.path}`);
      continue;
    }
    checked += 1;
  }
  return { ok: errors.length === 0, legacy: false, checked, errors };
}

/** Fail before publishing an archive that restore would refuse. */
export function verifyDatabaseFile(file) {
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

/**
 * Every /uploads/... filename referenced by the database. Backups and restores
 * use this to prove the file copy actually covers the rows they restore.
 */
export function referencedUploads(databaseFile) {
  const database = new DatabaseSync(databaseFile, { readOnly: true });
  const referenced = new Set();
  try {
    const tables = database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((row) => String(Object.values(row)[0]));
    for (const table of tables) {
      for (const row of database.prepare(`SELECT * FROM "${table}"`).all()) {
        for (const match of JSON.stringify(row).matchAll(/\/uploads\/([A-Za-z0-9._-]+)/g)) {
          referenced.add(match[1]);
        }
      }
    }
  } finally {
    database.close();
  }
  return referenced;
}

export function missingReferencedUploads(databaseFile, uploadsDir) {
  return [...referencedUploads(databaseFile)].filter(
    (filename) => !fs.existsSync(path.join(uploadsDir, filename))
  );
}

const UPLOAD_URL = /\/uploads\/([A-Za-z0-9._-]+)/g;
const STRUCTURED_COLUMNS = {
  users: ["avatar_url"],
  scenes: ["image_url", "thumbnail_url", "props"],
  tokens: ["image_url"],
  characters: ["data", "summary"],
  journal_entries: ["attachments"],
  campaign_npcs: ["image_url"],
  campaign_audio_tracks: ["url"],
};
const JSON_UPLOAD_COLUMNS = new Set(["props", "data", "summary", "attachments"]);
const URL_KEY = /(url|image|thumbnail|avatar|portrait|attachment)/i;

function addUploadNames(target, value) {
  for (const match of String(value ?? "").matchAll(UPLOAD_URL)) target.add(match[1]);
}

function addJsonUploads(target, value) {
  if (typeof value === "string") {
    addUploadNames(target, value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) addJsonUploads(target, item);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (typeof child === "string") {
      if (URL_KEY.test(key) || child.startsWith("/uploads/")) addUploadNames(target, child);
    } else {
      addJsonUploads(target, child);
    }
  }
}

/**
 * Uploads that structured data actually needs in order to restore. Free-text
 * fields (chat, journal prose, notes) are intentionally excluded: a player
 * typing /uploads/foo must not be able to block every backup and restore.
 */
export function structuredReferencedUploads(databaseFile) {
  const database = new DatabaseSync(databaseFile, { readOnly: true });
  const referenced = new Set();
  try {
    for (const [table, columns] of Object.entries(STRUCTURED_COLUMNS)) {
      const exists = database
        .prepare("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?")
        .get(table);
      if (!exists) continue;
      const available = new Set(
        database
          .prepare(`PRAGMA table_info("${table.replace(/"/g, '""')}")`)
          .all()
          .map((column) => String(column.name))
      );
      const selected = columns.filter((column) => available.has(column));
      if (!selected.length) continue;
      for (const row of database
        .prepare(
          `SELECT ${selected
            .map((column) => `"${column.replace(/"/g, '""')}"`)
            .join(", ")} FROM "${table.replace(/"/g, '""')}"`
        )
        .all()) {
        for (const column of selected) {
          const value = row[column];
          if (value === null || value === undefined) continue;
          if (JSON_UPLOAD_COLUMNS.has(column)) {
            try {
              addJsonUploads(referenced, JSON.parse(String(value)));
            } catch {
              // Malformed JSON is not a reason to lose the backup.
            }
          } else {
            addUploadNames(referenced, value);
          }
        }
      }
    }
    // uploaded_assets.filename is a bare filename rather than a /uploads/ URL.
    if (
      database
        .prepare(
          "SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = 'uploaded_assets'"
        )
        .get()
    ) {
      for (const row of database.prepare("SELECT filename FROM uploaded_assets").all()) {
        if (typeof row.filename === "string" && row.filename) referenced.add(row.filename);
      }
    }
  } finally {
    database.close();
  }
  return referenced;
}

export function missingStructuredUploads(databaseFile, uploadsDir) {
  return [...structuredReferencedUploads(databaseFile)].filter(
    (filename) => !fs.existsSync(path.join(uploadsDir, filename))
  );
}

export function newestBackup(directory) {
  if (!fs.existsSync(directory)) return null;
  const archives = fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("runehall-"))
    .map((entry) => entry.name)
    .sort()
    .reverse();
  return archives[0] ? path.join(directory, archives[0]) : null;
}

export function readManifest(directory) {
  const filename = path.join(directory, "backup.json");
  if (!fs.existsSync(filename)) return null;
  try {
    return JSON.parse(fs.readFileSync(filename, "utf8"));
  } catch {
    return null;
  }
}
