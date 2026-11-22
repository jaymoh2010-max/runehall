import type { InitiativeEntry } from "./types";

export const ACTIONS_PER_TURN = 3;
export const REACTIONS_PER_ROUND = 1;

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const number = typeof value === "number" && Number.isFinite(value) ? Math.round(value) : fallback;
  return Math.max(min, Math.min(max, number));
}

/** Keep a persisted initiative entry's per-turn action economy inside the rules. */
export function normalizeInitiativeResources(entry: InitiativeEntry): InitiativeEntry {
  return {
    ...entry,
    actionsUsed: clampInt(entry.actionsUsed, 0, 0, ACTIONS_PER_TURN),
    reactionsUsed: clampInt(entry.reactionsUsed, 0, 0, REACTIONS_PER_ROUND),
  };
}

export function setInitiativeActions(
  entries: InitiativeEntry[],
  entryId: string,
  actionsUsed: number
): InitiativeEntry[] {
  return entries.map((entry) =>
    entry.id === entryId
      ? {
          ...entry,
          actionsUsed: clampInt(actionsUsed, 0, 0, ACTIONS_PER_TURN),
        }
      : entry
  );
}

export function setInitiativeReaction(
  entries: InitiativeEntry[],
  entryId: string,
  reactionsUsed: number
): InitiativeEntry[] {
  return entries.map((entry) =>
    entry.id === entryId
      ? {
          ...entry,
          reactionsUsed: clampInt(reactionsUsed, 0, 0, REACTIONS_PER_ROUND),
        }
      : entry
  );
}

/** A creature's actions and reaction refresh when its own turn begins. */
export function refreshInitiativeTurn(entry: InitiativeEntry): InitiativeEntry {
  return { ...entry, actionsUsed: 0, reactionsUsed: 0 };
}

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
 * Keep initiative chips in step with token and group renames. Group entries
 * keep their "×N" suffix; renaming one member must not relabel the whole group.
 */
export function renameInitiativeEntries(
  entries: InitiativeEntry[],
  change: {
    tokenId: string;
    name?: string | null;
    groupId?: string | null;
    groupName?: string | null;
  }
): InitiativeEntry[] {
  const groupName = change.groupName?.trim() ?? "";
  const tokenName = change.name?.trim() ?? "";
  return entries.map((entry) => {
    if (change.groupId && entry.groupId === change.groupId) {
      const suffix = entry.name.match(/ ×\d+$/)?.[0] ?? "";
      if (suffix) {
        if (!groupName) return entry;
        const nextName = `${groupName}${suffix}`.slice(0, 80);
        return nextName === entry.name ? entry : { ...entry, name: nextName };
      }
      const nextName = (groupName || tokenName).slice(0, 80);
      return nextName && nextName !== entry.name ? { ...entry, name: nextName } : entry;
    }
    if (change.tokenId && entry.tokenId === change.tokenId && tokenName) {
      const nextName = tokenName.slice(0, 80);
      return nextName !== entry.name ? { ...entry, name: nextName } : entry;
    }
    return entry;
  });
}

/**
 * Remove hidden combatants from the player-facing initiative order without
 * leaking their names. If the hidden combatant is active, players start at the
 * top of the visible order instead of pointing at a missing index.
 */
export function filterInitiativeForPlayers(
  entries: InitiativeEntry[],
  hiddenTokenIds: ReadonlySet<string>,
  turnIndex: number,
  hiddenSceneIds: ReadonlySet<string> = new Set()
): { entries: InitiativeEntry[]; turnIndex: number } {
  const visible = entries.filter(
    (entry) =>
      (!entry.tokenId || !hiddenTokenIds.has(entry.tokenId)) &&
      (!entry.sceneId || !hiddenSceneIds.has(entry.sceneId))
  );
  const activeEntryId = entries[turnIndex]?.id;
  const visibleTurnIndex = Math.max(
    0,
    activeEntryId ? visible.findIndex((entry) => entry.id === activeEntryId) : 0
  );
  return { entries: visible, turnIndex: visibleTurnIndex };
}
