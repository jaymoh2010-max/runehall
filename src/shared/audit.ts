import type { AuditEntry } from "./types";

export const AUDIT_RETENTION_MAX_DAYS = 3650;

export function normalizeAuditRetentionDays(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(AUDIT_RETENTION_MAX_DAYS, Math.round(number)));
}

/** `null` means retention is disabled and entries are kept forever. */
export function auditRetentionCutoff(days: number, nowValue = Date.now()): number | null {
  const normalized = normalizeAuditRetentionDays(days);
  return normalized > 0 ? nowValue - normalized * 86_400_000 : null;
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  // Neutralize spreadsheet formulas in user-controlled audit fields.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function auditCsv(entries: AuditEntry[]): string {
  const header = [
    "id",
    "created_at",
    "actor_id",
    "actor_name",
    "action",
    "target_type",
    "target_id",
    "detail",
    "ip",
  ];
  const lines = [header.join(",")];
  for (const entry of entries) {
    lines.push(
      [
        entry.id,
        new Date(entry.createdAt).toISOString(),
        entry.actorId,
        entry.actorName,
        entry.action,
        entry.targetType,
        entry.targetId,
        entry.detail,
        entry.ip,
      ]
        .map(csvCell)
        .join(",")
    );
  }
  return `${lines.join("\r\n")}\r\n`;
}
