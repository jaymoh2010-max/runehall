import type { CampaignThread } from "./types";

const MAX_THREADS = 50;
const MAX_THREAD_TEXT = 300;

/**
 * Dashboard threads are stored as JSON. Empty rows are dropped, text is
 * trimmed, and the list is capped so a malformed payload cannot bloat the
 * dashboard.
 */
export function normalizeCampaignThreads(value: unknown): CampaignThread[] {
  if (!Array.isArray(value)) return [];
  const threads: CampaignThread[] = [];
  for (const [index, raw] of value.entries()) {
    if (!raw || typeof raw !== "object") continue;
    const record = raw as Record<string, unknown>;
    const text =
      typeof record.text === "string" ? record.text.trim().slice(0, MAX_THREAD_TEXT) : "";
    if (!text) continue;
    const id =
      typeof record.id === "string" && record.id.trim()
        ? record.id.trim().slice(0, 80)
        : `thread_${index + 1}`;
    threads.push({
      id,
      text,
      done: Boolean(record.done),
      visible: record.visible !== false,
    });
    if (threads.length >= MAX_THREADS) break;
  }
  return threads;
}

export function openThreadCount(threads: CampaignThread[]): number {
  return threads.filter((thread) => !thread.done).length;
}
