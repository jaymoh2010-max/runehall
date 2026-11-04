#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

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
