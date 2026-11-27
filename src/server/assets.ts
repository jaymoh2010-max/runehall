import fs from "node:fs";
import path from "node:path";
import { db, type UploadedAssetRow } from "./db";
import { newId, parseJson, uploadsDir } from "./util";
import type { CampaignAsset } from "../shared/types";

const UPLOAD_PATTERN = /\/uploads\/([A-Za-z0-9._-]+)/g;
const GLOBAL_TABLES = [
  "users",
  "scenes",
  "tokens",
  "characters",
  "journal_entries",
  "messages",
  "campaign_npcs",
  "encounters",
  "encounter_combatants",
  "campaign_audio_tracks",
  // Export/import-only campaign tables can still contain legacy upload URLs.
  "campaign_player_notes",
  "campaign_safety_preferences",
  "campaign_factions",
  "campaign_knowledge",
  "campaign_chapters",
  "campaign_session_zero",
  "campaign_requests",
];
const IMAGE_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
};
const AUDIO_MIME: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".webm": "audio/webm",
};

function uploadFilenames(value: unknown): string[] {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (!text) return [];
  const names: string[] = [];
  for (const match of text.matchAll(UPLOAD_PATTERN)) names.push(match[1]);
  return names;
}

function mimeForFilename(filename: string): string {
  const extension = path.extname(filename).toLowerCase();
  return IMAGE_MIME[extension] ?? AUDIO_MIME[extension] ?? "application/octet-stream";
}

function addUsage(usages: Map<string, string[]>, filename: string, label: string): void {
  const list = usages.get(filename) ?? [];
  if (!list.includes(label)) list.push(label);
  usages.set(filename, list);
}

/** References in one campaign, with labels for the asset library. */
export function campaignAssetUsages(campaignId: string): Map<string, string[]> {
  const usages = new Map<string, string[]>();
  const scenes = db
    .prepare("SELECT id, name, image_url, thumbnail_url, props FROM scenes WHERE campaign_id = ?")
    .all(campaignId) as {
    id: string;
    name: string;
    image_url: string | null;
    thumbnail_url: string | null;
    props: string;
  }[];
  for (const scene of scenes) {
    for (const filename of uploadFilenames(scene.image_url)) {
      addUsage(usages, filename, `Scene: ${scene.name}`);
    }
    for (const filename of uploadFilenames(scene.thumbnail_url)) {
      addUsage(usages, filename, `Scene thumbnail: ${scene.name}`);
    }
    for (const filename of uploadFilenames(scene.props)) {
      addUsage(usages, filename, `Scene prop: ${scene.name}`);
    }
  }
  const tokens = db
    .prepare(
      `SELECT t.id, t.name, t.image_url FROM tokens t
       JOIN scenes s ON s.id = t.scene_id WHERE s.campaign_id = ?`
    )
    .all(campaignId) as { id: string; name: string; image_url: string | null }[];
  for (const token of tokens) {
    for (const filename of uploadFilenames(token.image_url)) {
      addUsage(usages, filename, `Token: ${token.name}`);
    }
  }
  const characters = db
    .prepare("SELECT id, name, data, summary FROM characters WHERE campaign_id = ?")
    .all(campaignId) as { id: string; name: string; data: string; summary: string | null }[];
  for (const character of characters) {
    for (const filename of uploadFilenames(`${character.data}\n${character.summary ?? ""}`)) {
      addUsage(usages, filename, `Character: ${character.name}`);
    }
  }
  const handouts = db
    .prepare("SELECT id, title, attachments FROM journal_entries WHERE campaign_id = ?")
    .all(campaignId) as { id: string; title: string; attachments: string }[];
  for (const entry of handouts) {
    for (const filename of uploadFilenames(entry.attachments)) {
      addUsage(usages, filename, `Journal: ${entry.title}`);
    }
  }
  const npcs = db
    .prepare("SELECT id, name, image_url FROM campaign_npcs WHERE campaign_id = ?")
    .all(campaignId) as { id: string; name: string; image_url: string | null }[];
  for (const npc of npcs) {
    for (const filename of uploadFilenames(npc.image_url)) {
      addUsage(usages, filename, `NPC: ${npc.name}`);
    }
  }
  const messages = db
    .prepare("SELECT id, content FROM messages WHERE campaign_id = ?")
    .all(campaignId) as { id: string; content: string }[];
  for (const message of messages) {
    for (const filename of uploadFilenames(message.content)) {
      addUsage(usages, filename, "Chat");
    }
  }
  const audioTracks = db
    .prepare("SELECT id, name, url FROM campaign_audio_tracks WHERE campaign_id = ?")
    .all(campaignId) as { id: string; name: string; url: string }[];
  for (const track of audioTracks) {
    for (const filename of uploadFilenames(track.url)) {
      addUsage(usages, filename, `Soundtrack: ${track.name}`);
    }
  }
  return usages;
}

/** Every upload reference in the database, matching the cleanup script. */
export function globalAssetReferences(): Map<string, number> {
  const references = new Map<string, number>();
  for (const table of GLOBAL_TABLES) {
    let rows: unknown[];
    try {
      rows = db.prepare(`SELECT * FROM ${table}`).all();
    } catch {
      continue;
    }
    for (const row of rows) {
      for (const filename of uploadFilenames(row)) {
        references.set(filename, (references.get(filename) ?? 0) + 1);
      }
    }
  }
  return references;
}

export function listCampaignAssets(campaignId: string, userId: string): CampaignAsset[] {
  const usages = campaignAssetUsages(campaignId);
  const references = globalAssetReferences();
  const records = db.prepare("SELECT * FROM uploaded_assets").all() as UploadedAssetRow[];
  const byFilename = new Map(records.map((record) => [record.filename, record]));
  const visibleRecords = records.filter(
    (record) =>
      record.campaign_id === campaignId ||
      (record.campaign_id === null && record.uploaded_by === userId)
  );
  const filenames = new Set([...usages.keys(), ...visibleRecords.map((record) => record.filename)]);
  const directory = uploadsDir();
  const assets: CampaignAsset[] = [];
  for (const filename of filenames) {
    const filePath = path.join(directory, filename);
    if (!fs.existsSync(filePath)) continue;
    const stat = fs.statSync(filePath);
    const record = byFilename.get(filename);
    const usage = usages.get(filename) ?? [];
    const globalCount = references.get(filename) ?? 0;
    const belongsToCampaign = record?.campaign_id === campaignId;
    const ownedByUser = record?.campaign_id === null && record?.uploaded_by === userId;
    const mimeType = record?.mime_type || mimeForFilename(filename);
    if (!mimeType.startsWith("image/")) continue;
    assets.push({
      filename,
      url: `/uploads/${filename}`,
      name: record?.original_name || filename,
      mimeType,
      size: record?.size || stat.size,
      createdAt: record?.created_at || Math.round(stat.mtimeMs),
      usage,
      unused: usage.length === 0,
      deletable: globalCount === 0 && (belongsToCampaign || ownedByUser),
      usedElsewhere: usage.length === 0 && globalCount > 0,
    });
  }
  return assets.sort((a, b) => b.createdAt - a.createdAt);
}

export function isValidAssetFilename(filename: string): boolean {
  return /^[A-Za-z0-9._-]+$/.test(filename) && filename !== "." && filename !== "..";
}

export function deleteCampaignAsset(
  campaignId: string,
  userId: string,
  filename: string
): { ok: true } | { ok: false; code: number; error: string } {
  if (!isValidAssetFilename(filename)) {
    return { ok: false, code: 400, error: "That filename is not valid." };
  }
  const record = db.prepare("SELECT * FROM uploaded_assets WHERE filename = ?").get(filename) as
    UploadedAssetRow | undefined;
  if (!record) return { ok: false, code: 404, error: "Asset not found." };
  const belongs =
    record.campaign_id === campaignId ||
    (record.campaign_id === null && record.uploaded_by === userId);
  if (!belongs) {
    return { ok: false, code: 403, error: "That asset belongs to another campaign." };
  }
  if (globalAssetReferences().has(filename)) {
    return {
      ok: false,
      code: 409,
      error: "That image is still used somewhere. Remove its references first.",
    };
  }
  const filePath = path.join(uploadsDir(), filename);
  if (path.dirname(filePath) !== uploadsDir()) {
    return { ok: false, code: 400, error: "That filename is not valid." };
  }
  fs.rmSync(filePath, { force: true });
  db.prepare("DELETE FROM uploaded_assets WHERE filename = ?").run(filename);
  return { ok: true };
}

const JSON_UPLOAD_KEY = /(url|image|thumbnail|avatar|portrait|attachment)/i;

function jsonUploadFilenames(value: unknown): string[] {
  const names: string[] = [];
  const visit = (node: unknown, key: string) => {
    if (typeof node === "string") {
      if (JSON_UPLOAD_KEY.test(key)) names.push(...uploadFilenames(node));
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) visit(item, key);
      return;
    }
    if (!node || typeof node !== "object") return;
    for (const [childKey, child] of Object.entries(node)) visit(child, childKey);
  };
  visit(value, "");
  return names;
}

export interface AssetDatabase {
  prepare(query: string): {
    all(...params: unknown[]): unknown[];
    run(...params: unknown[]): unknown;
  };
}

interface LegacyUploadReference {
  campaignId: string | null;
  uploadedBy: string | null;
}

function noteReference(
  references: Map<string, LegacyUploadReference>,
  filename: string,
  campaignId: string | null,
  uploadedBy: string | null
): void {
  if (!filename) return;
  const existing = references.get(filename);
  references.set(filename, {
    campaignId: campaignId ?? existing?.campaignId ?? null,
    uploadedBy: uploadedBy ?? existing?.uploadedBy ?? null,
  });
}

function noteReferences(
  references: Map<string, LegacyUploadReference>,
  filenames: Iterable<string>,
  campaignId: string | null,
  uploadedBy: string | null
): void {
  for (const filename of filenames) noteReference(references, filename, campaignId, uploadedBy);
}

function legacyUploadReferences(
  database: AssetDatabase = db as unknown as AssetDatabase
): Map<string, LegacyUploadReference> {
  const references = new Map<string, LegacyUploadReference>();
  const users = database.prepare("SELECT id, avatar_url FROM users").all() as {
    id: string;
    avatar_url: string | null;
  }[];
  for (const user of users) {
    noteReferences(references, uploadFilenames(user.avatar_url), null, user.id);
  }

  const scenes = database
    .prepare("SELECT campaign_id, image_url, thumbnail_url, props FROM scenes")
    .all() as {
    campaign_id: string;
    image_url: string | null;
    thumbnail_url: string | null;
    props: string;
  }[];
  for (const scene of scenes) {
    noteReferences(
      references,
      [
        ...uploadFilenames(scene.image_url),
        ...uploadFilenames(scene.thumbnail_url),
        ...jsonUploadFilenames(parseJson(scene.props, [])),
      ],
      scene.campaign_id,
      null
    );
  }

  const tokens = database
    .prepare(
      `SELECT t.image_url, s.campaign_id FROM tokens t
       JOIN scenes s ON s.id = t.scene_id`
    )
    .all() as { image_url: string | null; campaign_id: string }[];
  for (const token of tokens) {
    noteReferences(references, uploadFilenames(token.image_url), token.campaign_id, null);
  }

  const characters = database
    .prepare("SELECT user_id, campaign_id, data, summary FROM characters")
    .all() as {
    user_id: string;
    campaign_id: string | null;
    data: string;
    summary: string | null;
  }[];
  for (const character of characters) {
    noteReferences(
      references,
      [
        ...jsonUploadFilenames(parseJson(character.data, null)),
        ...jsonUploadFilenames(parseJson(character.summary, null)),
      ],
      character.campaign_id,
      character.user_id
    );
  }

  const journal = database
    .prepare("SELECT campaign_id, attachments FROM journal_entries")
    .all() as { campaign_id: string; attachments: string }[];
  for (const entry of journal) {
    noteReferences(
      references,
      jsonUploadFilenames(parseJson(entry.attachments, [])),
      entry.campaign_id,
      null
    );
  }

  const npcs = database.prepare("SELECT campaign_id, image_url FROM campaign_npcs").all() as {
    campaign_id: string;
    image_url: string | null;
  }[];
  for (const npc of npcs) {
    noteReferences(references, uploadFilenames(npc.image_url), npc.campaign_id, null);
  }

  const audio = database.prepare("SELECT campaign_id, url FROM campaign_audio_tracks").all() as {
    campaign_id: string;
    url: string;
  }[];
  for (const track of audio) {
    noteReferences(references, uploadFilenames(track.url), track.campaign_id, null);
  }
  return references;
}

/**
 * Register files that predate the uploaded_assets table. Migration 15 created
 * the table but could not infer owners or campaign scope; this one-shot scan
 * does that from structured references and leaves unreferenced files
 * admin-only. It is idempotent and runs before the upload routes are served.
 */
export function backfillUploadedAssets(
  options: { database?: AssetDatabase; directory?: string } = {}
): number {
  const database = options.database ?? (db as unknown as AssetDatabase);
  const directory = options.directory ?? uploadsDir();
  if (!fs.existsSync(directory)) return 0;
  const existing = new Set(
    (
      database.prepare("SELECT filename FROM uploaded_assets").all() as {
        filename: string;
      }[]
    ).map((row) => row.filename)
  );
  const orphans = fs
    .readdirSync(directory, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        !entry.name.startsWith(".") &&
        isValidAssetFilename(entry.name) &&
        !existing.has(entry.name)
    );
  if (!orphans.length) return 0;
  const references = legacyUploadReferences(database);
  let added = 0;
  for (const entry of orphans) {
    const filePath = path.join(directory, entry.name);
    const stat = fs.statSync(filePath);
    const reference = references.get(entry.name);
    try {
      database
        .prepare(
          `INSERT OR IGNORE INTO uploaded_assets
         (id, filename, original_name, mime_type, size, campaign_id, uploaded_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          newId("asset"),
          entry.name,
          entry.name,
          mimeForFilename(entry.name),
          stat.size,
          reference?.campaignId ?? null,
          reference?.uploadedBy ?? null,
          Math.round(stat.mtimeMs)
        );
      added += 1;
    } catch {
      // A foreign-key conflict leaves the file for an administrator to repair;
      // it must not prevent the server from starting.
    }
  }
  return added;
}
