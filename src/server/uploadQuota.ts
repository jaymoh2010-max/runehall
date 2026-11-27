import fs from "node:fs";
import { db } from "./db";
import { dataDir } from "./util";

const MIB = 1024 * 1024;
const DEFAULT_CAMPAIGN_QUOTA_MB = 1024;
const DEFAULT_USER_QUOTA_MB = 512;
const DEFAULT_MIN_FREE_MB = 512;

export type UploadQuotaFailure = {
  ok: false;
  status: 413 | 507;
  error: string;
};

export type UploadQuotaResult = { ok: true } | UploadQuotaFailure;

function quotaBytes(name: string, fallbackMb: number): number {
  const raw = Number(process.env[name]);
  const mb = Number.isFinite(raw) && raw >= 0 ? raw : fallbackMb;
  return mb <= 0 ? Number.POSITIVE_INFINITY : Math.round(mb * MIB);
}

function usage(query: string, ...params: unknown[]): number {
  const row = db.prepare(query).get(...params) as { bytes: number | null } | undefined;
  return Math.max(0, Number(row?.bytes ?? 0));
}

/**
 * Reject before streaming when the account/campaign is already out of space,
 * and again with the real file size before the asset row is recorded.
 */
export function checkUploadQuota(
  campaignId: string | null,
  userId: string,
  incomingBytes: number
): UploadQuotaResult {
  const campaignQuota = quotaBytes("UPLOAD_CAMPAIGN_QUOTA_MB", DEFAULT_CAMPAIGN_QUOTA_MB);
  const userQuota = quotaBytes("UPLOAD_USER_QUOTA_MB", DEFAULT_USER_QUOTA_MB);
  const minFree = quotaBytes("UPLOAD_MIN_FREE_MB", DEFAULT_MIN_FREE_MB);
  const bytes = Math.max(0, Math.round(incomingBytes));

  if (campaignId) {
    const used = usage(
      "SELECT COALESCE(SUM(size), 0) AS bytes FROM uploaded_assets WHERE campaign_id = ?",
      campaignId
    );
    if (used + bytes > campaignQuota) {
      return {
        ok: false,
        status: 413,
        error: "This campaign's upload storage is full. Remove unused art or raise the quota.",
      };
    }
  }

  const userUsed = usage(
    "SELECT COALESCE(SUM(size), 0) AS bytes FROM uploaded_assets WHERE uploaded_by = ?",
    userId
  );
  if (userUsed + bytes > userQuota) {
    return {
      ok: false,
      status: 413,
      error: "Your upload storage is full. Remove unused files or raise the quota.",
    };
  }

  if (Number.isFinite(minFree)) {
    try {
      const stats = fs.statfsSync(dataDir());
      const free = Number(stats.bavail) * Number(stats.bsize);
      if (free < minFree + bytes) {
        return {
          ok: false,
          status: 507,
          error: "The server is low on disk space. Ask the host to free space and try again.",
        };
      }
    } catch {
      // Some platforms do not expose statfs; the other quota checks still apply.
    }
  }

  return { ok: true };
}
