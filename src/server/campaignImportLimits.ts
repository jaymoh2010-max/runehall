import path from "node:path";

export type CampaignImportRecord = Record<string, unknown>;

export function record(value: unknown): CampaignImportRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as CampaignImportRecord)
    : {};
}

export function records(value: unknown, max: number, label: string): CampaignImportRecord[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error(`The ${label} section is invalid.`);
  if (value.length > max) throw new Error(`Too many ${label} to import (maximum ${max}).`);
  return value.filter(
    (entry): entry is CampaignImportRecord => Boolean(entry) && typeof entry === "object"
  );
}

function assertRecordLimit(value: unknown, max: number, label: string): void {
  if (value === undefined || value === null) return;
  if (!Array.isArray(value)) throw new Error(`The ${label} section is invalid.`);
  if (value.length > max) throw new Error(`Too many ${label} to import (maximum ${max}).`);
}

/** Default JSON body cap for a campaign archive, in megabytes. */
export const DEFAULT_CAMPAIGN_IMPORT_MAX_MB = 128;
export const MAX_CAMPAIGN_IMPORT_MAX_MB = 256;

/** Keep in sync with the self-contained export's 50 MB embedded-asset cap. */
export const MAX_EMBEDDED_ASSET_BYTES = 25 * 1024 * 1024;
export const MAX_EMBEDDED_TOTAL_BYTES = 50 * 1024 * 1024;

export function campaignImportMaxMb(env: Record<string, string | undefined> = process.env): number {
  const raw = env.CAMPAIGN_IMPORT_MAX_MB;
  if (raw === undefined || raw.trim() === "") return DEFAULT_CAMPAIGN_IMPORT_MAX_MB;
  const value = Number(raw);
  if (!Number.isFinite(value)) return DEFAULT_CAMPAIGN_IMPORT_MAX_MB;
  return Math.max(1, Math.min(MAX_CAMPAIGN_IMPORT_MAX_MB, Math.round(value)));
}

export function campaignImportBodyLimit(
  env: Record<string, string | undefined> = process.env
): number {
  return campaignImportMaxMb(env) * 1024 * 1024;
}

const ASSET_MIME_BY_EXTENSION = new Map<string, string>([
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".gif", "image/gif"],
  [".avif", "image/avif"],
  [".mp3", "audio/mpeg"],
  [".ogg", "audio/ogg"],
  [".wav", "audio/wav"],
  [".m4a", "audio/mp4"],
  [".webm", "audio/webm"],
]);

export interface EmbeddedAssetCandidate {
  filename: string;
  mimeType: string;
}

/** Validate an embedded-asset URL exactly as the importer will use it. */
export function embeddedAssetCandidate(assetUrl: unknown): EmbeddedAssetCandidate | null {
  if (typeof assetUrl !== "string" || !assetUrl.startsWith("/uploads/")) return null;
  const filename = assetUrl.slice("/uploads/".length);
  if (!/^[A-Za-z0-9._-]+$/.test(filename) || filename === "." || filename === "..") {
    return null;
  }
  const mimeType = ASSET_MIME_BY_EXTENSION.get(path.extname(filename).toLowerCase());
  return mimeType ? { filename, mimeType } : null;
}

/** Decoded size of a standard base64 string without allocating the buffer. */
export function base64DecodedBytes(encoded: string): number {
  const compact = encoded.replace(/\s+/g, "").replace(/=+$/, "");
  return compact ? Math.floor((compact.length * 3) / 4) : 0;
}

const IMPORT_ROW_LIMITS = [
  ["members", 500, "members"],
  ["audioTracks", 2_000, "audioTracks"],
  ["characters", 2_000, "characters"],
  ["scenes", 5_000, "scenes"],
  ["tokens", 200_000, "tokens"],
  ["messages", 200_000, "messages"],
  ["journal", 50_000, "journal"],
  ["encounters", 20_000, "encounters"],
  ["factions", 5_000, "factions"],
  ["knowledge", 20_000, "knowledge entries"],
  ["chapters", 1_000, "chapters"],
  ["npcs", 20_000, "NPCs"],
  ["xpAwards", 50_000, "XP awards"],
] as const;

export interface CampaignImportPreflight {
  embeddedAssets: number;
  embeddedBytes: number;
}

export interface CampaignImportPreflightLimits {
  embeddedAssetBytes?: number;
  embeddedTotalBytes?: number;
}

/**
 * Validate the cheap, structural parts of an archive before the importer opens
 * a write transaction or writes embedded files. The row and asset limits are
 * the same limits the import itself enforces.
 */
export function preflightCampaignImport(
  raw: unknown,
  limits: CampaignImportPreflightLimits = {}
): CampaignImportPreflight {
  const payload = record(raw);
  if (payload.format !== "runehall-campaign") {
    throw new Error("That file is not a Runehall campaign export.");
  }
  const version = Number(payload.version);
  if (Number.isFinite(version) && version > 1) {
    throw new Error("This export was created by a newer Runehall version.");
  }

  for (const [key, max, label] of IMPORT_ROW_LIMITS) {
    assertRecordLimit(payload[key], max, label);
  }

  const maxAsset = Math.max(0, Math.round(limits.embeddedAssetBytes ?? MAX_EMBEDDED_ASSET_BYTES));
  const maxTotal = Math.max(0, Math.round(limits.embeddedTotalBytes ?? MAX_EMBEDDED_TOTAL_BYTES));
  let embeddedAssets = 0;
  let embeddedBytes = 0;
  for (const [assetUrl, encoded] of Object.entries(record(payload.embeddedAssets))) {
    if (typeof encoded !== "string" || !embeddedAssetCandidate(assetUrl)) continue;
    const bytes = base64DecodedBytes(encoded);
    if (!bytes) continue;
    if (bytes > maxAsset) {
      throw new Error("An embedded asset in this archive is larger than 25 MB.");
    }
    embeddedBytes += bytes;
    if (embeddedBytes > maxTotal) {
      throw new Error("Embedded campaign assets exceed the 50 MB import limit.");
    }
    embeddedAssets += 1;
  }
  return { embeddedAssets, embeddedBytes };
}
