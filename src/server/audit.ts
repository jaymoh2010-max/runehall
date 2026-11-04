import type { FastifyRequest } from "fastify";
import { db, type AuditLogRow } from "./db";
import { newId, now, safeString, sanitizeUserText } from "./util";
import type { AuditEntry, PublicUser } from "../shared/types";

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
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      newId("audit"),
      now(),
      input.actor?.id ?? null,
      safeString(input.actor?.displayName, "", 80),
      safeString(input.action, "unknown", 80),
      safeString(input.targetType, "", 40),
      input.targetId ? safeString(input.targetId, "", 120) : null,
      sanitizeUserText(input.detail ?? "", 2000),
      safeString(input.request?.ip, "", 80),
    );
  } catch {
    // Audit logging must not break the request that triggered it.
  }
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
      `SELECT * FROM audit_log ${where} ORDER BY created_at DESC, rowid DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset) as AuditLogRow[];
  const totalRow = db
    .prepare(`SELECT COUNT(*) AS count FROM audit_log ${where}`)
    .get(...params) as { count: number };
  return { entries: rows.map(serialize), total: Number(totalRow?.count ?? 0) };
}
