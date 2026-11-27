import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error JavaScript helper used by the CLI scripts.
import {
  manifestDigest,
  missingReferencedUploads,
  missingStructuredUploads,
  readManifest,
  referencedUploads,
  sha256File,
  structuredReferencedUploads,
  verifyBackupManifest,
  verifyDatabaseFile,
} from "../scripts/backup-lib.mjs";

const directories: string[] = [];

function temporaryDirectory(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "runehall-backup-test-"));
  directories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function writeBackup(root: string) {
  fs.mkdirSync(path.join(root, "uploads"), { recursive: true });
  const contents = "portable backup fixture";
  fs.writeFileSync(path.join(root, "uploads", "clue.txt"), contents);
  const files = [
    {
      path: "uploads/clue.txt",
      bytes: Buffer.byteLength(contents),
      sha256: sha256File(path.join(root, "uploads", "clue.txt")),
    },
  ];
  const manifest = {
    format: "runehall-backup",
    version: 2,
    files,
    digest: manifestDigest(files),
  };
  fs.writeFileSync(path.join(root, "backup.json"), JSON.stringify(manifest));
  return manifest;
}

describe("backup manifests", () => {
  it("hashes files with SHA-256", () => {
    const directory = temporaryDirectory();
    const file = path.join(directory, "abc.txt");
    fs.writeFileSync(file, "abc");
    expect(sha256File(file)).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
  });

  it("builds a deterministic digest regardless of file order", () => {
    const files = [
      { path: "b.txt", bytes: 2, sha256: "b".repeat(64) },
      { path: "a.txt", bytes: 1, sha256: "a".repeat(64) },
    ];
    expect(manifestDigest(files)).toBe(manifestDigest([...files].reverse()));
  });

  it("verifies every file and rejects corruption", () => {
    const directory = temporaryDirectory();
    const manifest = writeBackup(directory);
    expect(verifyBackupManifest(directory, manifest)).toMatchObject({
      ok: true,
      legacy: false,
      checked: 1,
      errors: [],
    });
    fs.writeFileSync(path.join(directory, "uploads", "clue.txt"), "Portable backup fixture");
    const result = verifyBackupManifest(directory, manifest);
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("Checksum mismatch");
  });

  it("rejects paths that escape the archive root", () => {
    const directory = temporaryDirectory();
    const manifest = {
      format: "runehall-backup",
      version: 2,
      files: [{ path: "../outside.txt", bytes: 1, sha256: "0".repeat(64) }],
      digest: "",
    };
    const result = verifyBackupManifest(directory, manifest);
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("escapes the archive");
  });

  it("accepts legacy manifests without per-file checksums", () => {
    const directory = temporaryDirectory();
    expect(
      verifyBackupManifest(directory, { format: "runehall-backup", version: 1, files: [] })
    ).toEqual({ ok: true, legacy: true, checked: 0, errors: [] });
  });

  it("reads a manifest defensively", () => {
    const directory = temporaryDirectory();
    expect(readManifest(directory)).toBeNull();
    fs.writeFileSync(path.join(directory, "backup.json"), "{not json");
    expect(readManifest(directory)).toBeNull();
  });
});

describe("backup database checks", () => {
  it("accepts a healthy database and rejects foreign-key damage", () => {
    const directory = temporaryDirectory();
    const healthy = path.join(directory, "healthy.db");
    const database = new DatabaseSync(healthy);
    database.exec("CREATE TABLE parent (id TEXT PRIMARY KEY);");
    database.close();
    expect(() => verifyDatabaseFile(healthy)).not.toThrow();

    const broken = path.join(directory, "broken.db");
    const damaged = new DatabaseSync(broken);
    try {
      damaged.exec("PRAGMA foreign_keys = OFF;");
      damaged.exec(`
        CREATE TABLE parent (id TEXT PRIMARY KEY);
        CREATE TABLE child (parent_id TEXT REFERENCES parent(id));
      `);
      damaged.prepare("INSERT INTO child (parent_id) VALUES (?)").run("missing");
    } finally {
      damaged.close();
    }
    expect(() => verifyDatabaseFile(broken)).toThrow(/foreign key/i);
  });
});

describe("backup upload references", () => {
  it("finds database-referenced uploads and reports missing files", () => {
    const directory = temporaryDirectory();
    const databaseFile = path.join(directory, "runehall.db");
    const uploads = path.join(directory, "uploads");
    fs.mkdirSync(uploads, { recursive: true });
    fs.writeFileSync(path.join(uploads, "kept.png"), "image");
    const database = new DatabaseSync(databaseFile);
    database.exec("CREATE TABLE scenes (image_url TEXT, props TEXT);");
    database
      .prepare("INSERT INTO scenes (image_url, props) VALUES (?, ?)")
      .run("/uploads/kept.png", JSON.stringify({ image: "/uploads/missing.png" }));
    database.close();

    expect([...referencedUploads(databaseFile)].sort()).toEqual(["kept.png", "missing.png"]);
    expect(missingReferencedUploads(databaseFile, uploads)).toEqual(["missing.png"]);
  });

  it("requires structured uploads but ignores free-text mentions", () => {
    const directory = temporaryDirectory();
    const databaseFile = path.join(directory, "runehall.db");
    const uploads = path.join(directory, "uploads");
    fs.mkdirSync(uploads, { recursive: true });
    for (const filename of ["kept.png", "portrait.png", "library.png"]) {
      fs.writeFileSync(path.join(uploads, filename), "image");
    }
    const database = new DatabaseSync(databaseFile);
    database.exec(`
      CREATE TABLE scenes (image_url TEXT, props TEXT);
      CREATE TABLE messages (content TEXT);
      CREATE TABLE characters (data TEXT, summary TEXT);
      CREATE TABLE uploaded_assets (filename TEXT);
    `);
    database
      .prepare("INSERT INTO scenes (image_url, props) VALUES (?, ?)")
      .run("/uploads/kept.png", JSON.stringify([{ imageUrl: "/uploads/missing.png" }]));
    database
      .prepare("INSERT INTO messages (content) VALUES (?)")
      .run("A chat mention of /uploads/chat-only.png");
    database.prepare("INSERT INTO characters (data, summary) VALUES (?, ?)").run(
      JSON.stringify({
        portraitUrl: "/uploads/portrait.png",
        notes: "Backstory mentions /uploads/notes-only.png",
      }),
      null
    );
    database.prepare("INSERT INTO uploaded_assets (filename) VALUES (?)").run("library.png");
    database.close();

    const structured = [...structuredReferencedUploads(databaseFile)].sort();
    expect(structured).toEqual(["kept.png", "library.png", "missing.png", "portrait.png"]);
    expect(structured).not.toContain("chat-only.png");
    expect(structured).not.toContain("notes-only.png");
    expect(missingStructuredUploads(databaseFile, uploads)).toEqual(["missing.png"]);
  });
});
