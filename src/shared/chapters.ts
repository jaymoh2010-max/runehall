import type { ChapterStatus } from "./types";

export const CHAPTER_STATUSES: ReadonlyArray<{
  id: ChapterStatus;
  label: string;
  note: string;
}> = [
  { id: "planned", label: "Planned", note: "Not started yet." },
  { id: "active", label: "Active", note: "The party is here now." },
  { id: "complete", label: "Complete", note: "Finished or skipped." },
];

export function normalizeChapterStatus(value: unknown): ChapterStatus {
  return value === "active" || value === "complete" ? value : "planned";
}

export function chapterStatusLabel(value: unknown): string {
  return (
    CHAPTER_STATUSES.find((entry) => entry.id === normalizeChapterStatus(value))?.label ?? "Planned"
  );
}

export function normalizeChapterLevel(value: unknown, fallback = 1): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(1, Math.min(20, Math.round(number)));
}
