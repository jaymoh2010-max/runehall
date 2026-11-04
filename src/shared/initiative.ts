import type { InitiativeEntry } from "./types";

export function compareInitiative(a: InitiativeEntry, b: InitiativeEntry): number {
  return (
    b.initiative - a.initiative ||
    (a.tieBreak ?? 0) - (b.tieBreak ?? 0) ||
    a.name.localeCompare(b.name)
  );
}

export function sortInitiativeEntries(entries: InitiativeEntry[]): InitiativeEntry[] {
  return [...entries].sort(compareInitiative);
}

export function normalizeTieBreaks(entries: InitiativeEntry[]): InitiativeEntry[] {
  return entries.map((entry, index) => ({ ...entry, tieBreak: index }));
}
