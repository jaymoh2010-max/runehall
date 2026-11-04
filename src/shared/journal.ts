import type { JournalAttachment, JournalKind } from "./types";

const MAX_ATTACHMENTS = 12;

export function isJournalKind(value: unknown): value is JournalKind {
  return value === "note" || value === "handout";
}

export function normalizeJournalKind(value: unknown): JournalKind {
  return value === "handout" ? "handout" : "note";
}

/**
 * Journal attachments are local upload references. Reject external URLs so a
 * shared handout cannot silently become a tracking pixel or remote payload.
 */
export function normalizeJournalAttachments(value: unknown): JournalAttachment[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const attachments: JournalAttachment[] = [];
  for (const [index, raw] of value.entries()) {
    if (!raw || typeof raw !== "object") continue;
    const record = raw as Record<string, unknown>;
    const url = typeof record.url === "string" ? record.url.trim().slice(0, 500) : "";
    if (!/^\/uploads\/[A-Za-z0-9._-]+$/.test(url) || seen.has(url)) continue;
    const mimeType =
      typeof record.mimeType === "string" && record.mimeType.startsWith("image/")
        ? record.mimeType.slice(0, 80)
        : "image/*";
    const name =
      typeof record.name === "string" && record.name.trim()
        ? record.name.trim().slice(0, 140)
        : "Handout image";
    const id =
      typeof record.id === "string" && record.id.trim()
        ? record.id.trim().slice(0, 80)
        : `att_${index + 1}`;
    seen.add(url);
    attachments.push({ id, name, url, mimeType });
    if (attachments.length >= MAX_ATTACHMENTS) break;
  }
  return attachments;
}
