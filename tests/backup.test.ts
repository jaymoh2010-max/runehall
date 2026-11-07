import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error JavaScript helper used by the CLI scripts.
import {
  manifestDigest,
  readManifest,
  sha256File,
  verifyBackupManifest,
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
