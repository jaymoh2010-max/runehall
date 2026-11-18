import type { InitiativeEntry } from "./types";

export function compareInitiative(a: InitiativeEntry, b: InitiativeEntry): number {
  return (
    b.initiative - a.initiative ||
    (a.tieBreak ?? 0) - (b.tieBreak ?? 0) ||
    (b.perception ?? 0) - (a.perception ?? 0) ||
    a.name.localeCompare(b.name)
  );
}

export function sortInitiativeEntries(entries: InitiativeEntry[]): InitiativeEntry[] {
  return [...entries].sort(compareInitiative);
}

export function normalizeTieBreaks(entries: InitiativeEntry[]): InitiativeEntry[] {
  return entries.map((entry, index) => ({ ...entry, tieBreak: index }));
}

/**
 * Remove hidden combatants from the player-facing initiative order without
 * leaking their names. If the hidden combatant is active, players start at the
 * top of the visible order instead of pointing at a missing index.
 */
export function filterInitiativeForPlayers(
  entries: InitiativeEntry[],
  hiddenTokenIds: ReadonlySet<string>,
  turnIndex: number
): { entries: InitiativeEntry[]; turnIndex: number } {
  const visible = entries.filter((entry) => !entry.tokenId || !hiddenTokenIds.has(entry.tokenId));
  const activeEntryId = entries[turnIndex]?.id;
  const visibleTurnIndex = Math.max(
    0,
    activeEntryId ? visible.findIndex((entry) => entry.id === activeEntryId) : 0
  );
  return { entries: visible, turnIndex: visibleTurnIndex };
}
