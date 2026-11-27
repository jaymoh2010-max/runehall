import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { backfillUploadedAssets, type AssetDatabase } from "../src/server/assets";

const directories: string[] = [];

function temporaryDirectory(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "runehall-legacy-uploads-"));
  directories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("legacy upload backfill", () => {
  it("registers rowless files and infers campaign and uploader scope", () => {
    const root = temporaryDirectory();
    const uploads = path.join(root, "uploads");
    fs.mkdirSync(uploads, { recursive: true });
    for (const filename of ["legacy.png", "portrait.png", "unused.png", ".gitkeep"]) {
      fs.writeFileSync(path.join(uploads, filename), "asset");
    }

    const database = new DatabaseSync(path.join(root, "runehall.db"));
    try {
      database.exec(`
        CREATE TABLE users (id TEXT PRIMARY KEY, avatar_url TEXT);
        CREATE TABLE scenes (
          id TEXT PRIMARY KEY,
          campaign_id TEXT NOT NULL,
          image_url TEXT,
          thumbnail_url TEXT,
          props TEXT NOT NULL DEFAULT '[]'
        );
        CREATE TABLE tokens (
          id TEXT PRIMARY KEY,
          scene_id TEXT NOT NULL,
          image_url TEXT
        );
        CREATE TABLE characters (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          campaign_id TEXT,
          data TEXT NOT NULL,
          summary TEXT
        );
        CREATE TABLE journal_entries (
          id TEXT PRIMARY KEY,
          campaign_id TEXT NOT NULL,
          attachments TEXT NOT NULL DEFAULT '[]'
        );
        CREATE TABLE campaign_npcs (
          id TEXT PRIMARY KEY,
          campaign_id TEXT NOT NULL,
          image_url TEXT
        );
        CREATE TABLE campaign_audio_tracks (
          id TEXT PRIMARY KEY,
          campaign_id TEXT NOT NULL,
          url TEXT NOT NULL
        );
        CREATE TABLE uploaded_assets (
          id TEXT PRIMARY KEY,
          filename TEXT NOT NULL UNIQUE,
          original_name TEXT NOT NULL,
          mime_type TEXT NOT NULL,
          size INTEGER NOT NULL,
          campaign_id TEXT,
          uploaded_by TEXT,
          created_at INTEGER NOT NULL
        );
      `);
      database.prepare("INSERT INTO users (id, avatar_url) VALUES (?, ?)").run("user-1", null);
      database
        .prepare("INSERT INTO scenes (id, campaign_id, image_url) VALUES (?, ?, ?)")
        .run("scene-1", "campaign-1", "/uploads/legacy.png");
      database
        .prepare("INSERT INTO characters (id, user_id, campaign_id, data) VALUES (?, ?, ?, ?)")
        .run(
          "character-1",
          "user-1",
          "campaign-1",
          JSON.stringify({
            portraitUrl: "/uploads/portrait.png",
            notes: "Backstory mentions /uploads/notes-only.png",
          })
        );

      const added = backfillUploadedAssets({
        database: database as unknown as AssetDatabase,
        directory: uploads,
      });
      expect(added).toBe(3);

      const rows = database
        .prepare("SELECT filename, campaign_id, uploaded_by FROM uploaded_assets ORDER BY filename")
        .all() as {
        filename: string;
        campaign_id: string | null;
        uploaded_by: string | null;
      }[];
      expect(rows).toEqual([
        { filename: "legacy.png", campaign_id: "campaign-1", uploaded_by: null },
        { filename: "portrait.png", campaign_id: "campaign-1", uploaded_by: "user-1" },
        { filename: "unused.png", campaign_id: null, uploaded_by: null },
      ]);
      expect(rows.some((row) => row.filename.includes("notes-only"))).toBe(false);

      expect(
        backfillUploadedAssets({
          database: database as unknown as AssetDatabase,
          directory: uploads,
        })
      ).toBe(0);
    } finally {
      database.close();
    }
  });
});
