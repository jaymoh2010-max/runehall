import type { FastifyRequest } from "fastify";
import { db, type AuditLogRow } from "./db";
import { newId, now, safeString, sanitizeUserText } from "./util";
import type { AuditEntry, PublicUser } from "../shared/types";
import { auditRetentionCutoff, normalizeAuditRetentionDays } from "../shared/audit";

const AUDIT_RETENTION_KEY = "audit_retention_days";

export interface AuditInput {
  action: string;
  actor?: Pick<PublicUser, "id" | "displayName"> | null;
  targetType?: string;
  targetId?: string | null;
  detail?: string;
  request?: Pick<FastifyRequest, "ip">;
}

function serialize(row: AuditLogRow): AuditEntry {
  return {
    id: row.id,
    createdAt: row.created_at,
    actorId: row.actor_id,
    actorName: row.actor_name,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    detail: row.detail,
    ip: row.ip,
  };
}

/**
 * Record a security-relevant action. Audit writes are best-effort: a failure
 * here must never block sign-in, registration, or campaign work.
 */
export function logAudit(input: AuditInput): void {
  try {
    db.prepare(
      `INSERT INTO audit_log
        (id, created_at, actor_id, actor_name, action, target_type, target_id, detail, ip)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      newId("audit"),
      now(),
      input.actor?.id ?? null,
      safeString(input.actor?.displayName, "", 80),
      safeString(input.action, "unknown", 80),
      safeString(input.targetType, "", 40),
      input.targetId ? safeString(input.targetId, "", 120) : null,
      sanitizeUserText(input.detail ?? "", 2000),
      safeString(input.request?.ip, "", 80)
    );
  } catch {
    // Audit logging must not break the request that triggered it.
  }
}

export interface AuditStatus {
  total: number;
  oldestAt: number | null;
  retentionDays: number;
}

export function getAuditRetentionDays(): number {
  const row = db
    .prepare("SELECT value FROM app_settings WHERE key = ?")
    .get(AUDIT_RETENTION_KEY) as { value: string } | undefined;
  if (row) return normalizeAuditRetentionDays(row.value);
  return normalizeAuditRetentionDays(process.env.AUDIT_RETENTION_DAYS);
}

export function setAuditRetentionDays(value: unknown): number {
  const days = normalizeAuditRetentionDays(value);
  db.prepare(
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(AUDIT_RETENTION_KEY, String(days), now());
  return days;
}

export function auditStatus(): AuditStatus {
  const row = db
    .prepare("SELECT COUNT(*) AS total, MIN(created_at) AS oldest FROM audit_log")
    .get() as { total: number; oldest: number | null };
  return {
    total: Number(row?.total ?? 0),
    oldestAt: row?.oldest ?? null,
    retentionDays: getAuditRetentionDays(),
  };
}

export function listAuditForExport(action = ""): AuditEntry[] {
  const filter = safeString(action, "", 80);
  const where = filter ? "WHERE action = ?" : "";
  const rows = db
    .prepare(`SELECT * FROM audit_log ${where} ORDER BY created_at ASC, rowid ASC LIMIT 100000`)
    .all(...(filter ? [filter] : [])) as AuditLogRow[];
  return rows.map(serialize);
}

export function pruneAuditLog(
  days: number,
  dryRun = false
): { deleted: number; cutoff: number | null } {
  const cutoff = auditRetentionCutoff(days);
  if (cutoff === null) return { deleted: 0, cutoff: null };
  const count = db
    .prepare("SELECT COUNT(*) AS count FROM audit_log WHERE created_at < ?")
    .get(cutoff) as { count: number };
  const deleted = Number(count?.count ?? 0);
  if (!dryRun && deleted > 0) {
    db.prepare("DELETE FROM audit_log WHERE created_at < ?").run(cutoff);
  }
  return { deleted, cutoff };
}

export interface AuditQuery {
  limit?: number;
  offset?: number;
  action?: string;
}

export function listAudit(query: AuditQuery = {}): { entries: AuditEntry[]; total: number } {
  const limit = Math.max(1, Math.min(200, Math.round(query.limit ?? 50)));
  const offset = Math.max(0, Math.round(query.offset ?? 0));
  const action = safeString(query.action, "", 80);
  const where = action ? "WHERE action = ?" : "";
  const params = action ? [action] : [];
  const rows = db
    .prepare(
      `SELECT * FROM audit_log ${where} ORDER BY created_at DESC, rowid DESC LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset) as AuditLogRow[];
  const totalRow = db
    .prepare(`SELECT COUNT(*) AS count FROM audit_log ${where}`)
    .get(...params) as { count: number };
  return { entries: rows.map(serialize), total: Number(totalRow?.count ?? 0) };
}
