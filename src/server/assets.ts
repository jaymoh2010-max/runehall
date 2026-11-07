import fs from "node:fs";
import path from "node:path";
import { db, type UploadedAssetRow } from "./db";
import { uploadsDir } from "./util";
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
  "loot_parcels",
  "encounters",
  "encounter_combatants",
  "campaign_dashboard",
  "campaign_sessions",
  "session_attendance",
];
const IMAGE_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
};

function uploadFilenames(value: unknown): string[] {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (!text) return [];
  const names: string[] = [];
  for (const match of text.matchAll(UPLOAD_PATTERN)) names.push(match[1]);
  return names;
}

function mimeForFilename(filename: string): string {
  return IMAGE_MIME[path.extname(filename).toLowerCase()] ?? "image/*";
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
    .prepare("SELECT id, name, image_url, thumbnail_url FROM scenes WHERE campaign_id = ?")
    .all(campaignId) as {
    id: string;
    name: string;
    image_url: string | null;
    thumbnail_url: string | null;
  }[];
  for (const scene of scenes) {
    for (const filename of uploadFilenames(scene.image_url)) {
      addUsage(usages, filename, `Scene: ${scene.name}`);
    }
    for (const filename of uploadFilenames(scene.thumbnail_url)) {
      addUsage(usages, filename, `Scene thumbnail: ${scene.name}`);
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
    assets.push({
      filename,
      url: `/uploads/${filename}`,
      name: record?.original_name || filename,
      mimeType: record?.mime_type || mimeForFilename(filename),
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
