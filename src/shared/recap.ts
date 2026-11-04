import type {
  CampaignSession,
  CampaignThread,
  ChatMessage,
  JournalEntry,
  LootParcel,
  RollResult,
  SessionRecap,
  SessionRecapStats,
} from "./types";

type RecapMessage = Pick<
  ChatMessage,
  "type" | "visibility" | "authorName" | "data" | "createdAt"
>;
type RecapJournal = Pick<JournalEntry, "title" | "kind" | "visible" | "updatedAt">;
type RecapLoot = Pick<
  LootParcel,
  | "name"
  | "items"
  | "gp"
  | "sp"
  | "cp"
  | "status"
  | "distributedToName"
  | "updatedAt"
>;

export interface SessionRecapInput {
  campaignId: string;
  campaignName: string;
  from: number;
  to: number;
  session: Pick<CampaignSession, "title" | "scheduledAt" | "attendance"> | null;
  messages: RecapMessage[];
  journal: RecapJournal[];
  loot: RecapLoot[];
  threads: CampaignThread[];
}

const MAX_ROLL_LINES = 12;
const MAX_JOURNAL_LINES = 10;
const MAX_LOOT_LINES = 10;

const DEGREE_LABELS: Record<string, string> = {
  "critical-success": "critical success",
  success: "success",
  failure: "failure",
  "critical-failure": "critical failure",
};

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function rollResult(message: RecapMessage): RollResult | null {
  if (message.type !== "roll" || !message.data || typeof message.data !== "object") return null;
  return "total" in message.data ? (message.data as RollResult) : null;
}

function inWindow(timestamp: number, from: number, to: number): boolean {
  return timestamp >= from && timestamp <= to;
}

function coinParts(loot: RecapLoot): string[] {
  const parts: string[] = [];
  if (Math.round(loot.gp) > 0) parts.push(`${Math.round(loot.gp)} gp`);
  if (Math.round(loot.sp) > 0) parts.push(`${Math.round(loot.sp)} sp`);
  if (Math.round(loot.cp) > 0) parts.push(`${Math.round(loot.cp)} cp`);
  return parts;
}

function rollSummary(stats: SessionRecapStats): string {
  const parts = [`${stats.successes} ${stats.successes === 1 ? "success" : "successes"}`];
  parts.push(`${stats.failures} ${stats.failures === 1 ? "failure" : "failures"}`);
  if (stats.criticalSuccesses) {
    parts.push(
      `${stats.criticalSuccesses} critical ${stats.criticalSuccesses === 1 ? "success" : "successes"}`,
    );
  }
  if (stats.criticalFailures) {
    parts.push(
      `${stats.criticalFailures} critical ${stats.criticalFailures === 1 ? "failure" : "failures"}`,
    );
  }
  return `${stats.rolls} ${stats.rolls === 1 ? "roll" : "rolls"}: ${parts.join(", ")}.`;
}

/**
 * Build a GM-editable recap draft from player-safe records only. GM-only chat,
 * hidden handouts, and GM-only threads are filtered again here so a future
 * caller cannot leak them by skipping the query filters.
 */
export function buildSessionRecap(input: SessionRecapInput): SessionRecap {
  const messages = input.messages.filter(
    (message) => message.visibility === "all" && inWindow(message.createdAt, input.from, input.to),
  );
  const journal = input.journal.filter(
    (entry) => entry.visible && inWindow(entry.updatedAt, input.from, input.to),
  );
  const loot = input.loot.filter((parcel) => inWindow(parcel.updatedAt, input.from, input.to));
  const threads = input.threads.filter((thread) => thread.visible && !thread.done);
  const rolls = messages
    .map((message) => ({ message, result: rollResult(message) }))
    .filter((entry): entry is { message: RecapMessage; result: RollResult } => entry.result !== null);

  let successes = 0;
  let failures = 0;
  let criticalSuccesses = 0;
  let criticalFailures = 0;
  for (const { result } of rolls) {
    if (result.degree === "critical-success") criticalSuccesses += 1;
    else if (result.degree === "success") successes += 1;
    else if (result.degree === "failure") failures += 1;
    else if (result.degree === "critical-failure") criticalFailures += 1;
  }

  const stats: SessionRecapStats = {
    messages: messages.length,
    rolls: rolls.length,
    successes,
    failures,
    criticalSuccesses,
    criticalFailures,
    journalEntries: journal.length,
    handouts: journal.filter((entry) => entry.kind === "handout").length,
    lootParcels: loot.length,
    openThreads: threads.length,
  };

  const lines: string[] = [`# Session recap — ${input.campaignName}`, ""];
  lines.push(
    `**Window:** ${formatTimestamp(input.from)} – ${formatTimestamp(input.to)}`,
  );
  if (input.session) {
    lines.push(
      `**Session:** ${input.session.title} — ${formatTimestamp(input.session.scheduledAt)}`,
    );
    const present = input.session.attendance
      .filter((entry) => entry.status === "attended" || entry.status === "late")
      .map((entry) => entry.displayName);
    if (present.length) lines.push(`**Present:** ${present.join(", ")}`);
  }
  lines.push("", "## What happened", "", "_Add the story beats here._");

  if (rolls.length) {
    lines.push("", "## Moments at the table", "", `- ${rollSummary(stats)}`);
    for (const { message, result } of rolls.slice(0, MAX_ROLL_LINES)) {
      const label = result.label || "Roll";
      const dc = result.dc === null || result.dc === undefined ? "" : ` vs DC ${result.dc}`;
      const degree = result.degree ? ` (${DEGREE_LABELS[result.degree] ?? result.degree})` : "";
      lines.push(`- **${label}** — ${message.authorName}: ${result.total}${dc}${degree}.`);
    }
    if (rolls.length > MAX_ROLL_LINES) {
      lines.push(`- ${rolls.length - MAX_ROLL_LINES} more rolls are not listed.`);
    }
  }

  if (journal.length) {
    lines.push("", "## Discoveries");
    for (const entry of journal.slice(0, MAX_JOURNAL_LINES)) {
      const kind = entry.kind === "handout" ? " (handout)" : "";
      lines.push(`- **${entry.title}**${kind}`);
    }
    if (journal.length > MAX_JOURNAL_LINES) {
      lines.push(`- ${journal.length - MAX_JOURNAL_LINES} more entries are not listed.`);
    }
  }

  if (loot.length) {
    lines.push("", "## Treasure");
    for (const parcel of loot.slice(0, MAX_LOOT_LINES)) {
      const items = parcel.items
        .map((item) => `${item.quantity}× ${item.name}`)
        .join(", ");
      const coins = coinParts(parcel);
      const contents = [...(items ? [items] : []), ...(coins.length ? [coins.join(", ")] : [])];
      const distributed = parcel.distributedToName
        ? ` — distributed to ${parcel.distributedToName}`
        : parcel.status === "distributed"
          ? " — distributed"
          : "";
      lines.push(
        `- **${parcel.name}**: ${contents.length ? contents.join("; ") : "no recorded contents"}${distributed}.`,
      );
    }
    if (loot.length > MAX_LOOT_LINES) {
      lines.push(`- ${loot.length - MAX_LOOT_LINES} more parcels are not listed.`);
    }
  }

  if (threads.length) {
    lines.push("", "## Loose ends");
    for (const thread of threads) lines.push(`- ${thread.text}`);
  }

  return {
    campaignId: input.campaignId,
    from: input.from,
    to: input.to,
    sessionTitle: input.session?.title ?? null,
    sessionAt: input.session?.scheduledAt ?? null,
    stats,
    draft: lines.join("\n"),
  };
}
