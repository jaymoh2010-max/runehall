import { describe, expect, it } from "vitest";
import type { InitiativeEntry } from "../src/shared/types";
import {
  filterInitiativeForPlayers,
  normalizeInitiativeResources,
  refreshInitiativeTurn,
  renameInitiativeEntries,
  setInitiativeActions,
  setInitiativeReaction,
  sortInitiativeEntries,
} from "../src/shared/initiative";

function entry(
  name: string,
  initiative: number,
  tieBreak?: number,
  perception?: number
): InitiativeEntry {
  return {
    id: name,
    tokenId: null,
    name,
    initiative,
    color: "#fff",
    ownerId: null,
    sceneId: null,
    tieBreak,
    perception,
  };
}

describe("initiative ordering", () => {
  it("sorts by initiative, then explicit tie break, then name", () => {
    const sorted = sortInitiativeEntries([
      entry("B", 15),
      entry("A", 15),
      entry("C", 20),
      entry("D", 15, -1),
    ]);
    expect(sorted.map((item) => item.name)).toEqual(["C", "D", "A", "B"]);
  });

  it("uses Perception as the default tie break", () => {
    const sorted = sortInitiativeEntries([entry("Lower", 15, 0, 2), entry("Higher", 15, 0, 7)]);
    expect(sorted.map((item) => item.name)).toEqual(["Higher", "Lower"]);
  });
});

describe("initiative chip renames", () => {
  it("renames a token entry without touching the rest of the order", () => {
    const target = { ...entry("Old name", 20), tokenId: "tok_1" };
    const other = { ...entry("Other", 15), tokenId: "tok_2" };
    const renamed = renameInitiativeEntries([target, other], {
      tokenId: "tok_1",
      name: "New name",
    });
    expect(renamed.map((item) => item.name)).toEqual(["New name", "Other"]);
  });

  it("keeps a group's ×N suffix when its shared label changes", () => {
    const target = {
      ...entry("Guard ×3", 20),
      tokenId: "tok_1",
      groupId: "grp_1",
      groupName: "Guard",
    };
    const renamed = renameInitiativeEntries([target], {
      tokenId: "tok_1",
      name: "Guard 1",
      groupId: "grp_1",
      groupName: "Iron Guard",
    });
    expect(renamed[0]?.name).toBe("Iron Guard ×3");
  });

  it("does not relabel a group when only one member is renamed", () => {
    const target = {
      ...entry("Guard ×3", 20),
      tokenId: "tok_1",
      groupId: "grp_1",
      groupName: "Guard",
    };
    const renamed = renameInitiativeEntries([target], {
      tokenId: "tok_1",
      name: "Guard 1",
      groupId: "grp_1",
    });
    expect(renamed[0]?.name).toBe("Guard ×3");
  });
});

describe("action economy", () => {
  it("clamps persisted actions and reactions to the PF2e limits", () => {
    const normalized = normalizeInitiativeResources({
      ...entry("Hero", 20),
      actionsUsed: 99,
      reactionsUsed: -4,
    });
    expect(normalized.actionsUsed).toBe(3);
    expect(normalized.reactionsUsed).toBe(0);
  });

  it("sets one entry's actions without touching its neighbours", () => {
    const hero = { ...entry("Hero", 20), actionsUsed: 0 };
    const other = { ...entry("Other", 15), actionsUsed: 2 };
    const next = setInitiativeActions([hero, other], hero.id, 2);
    expect(next[0].actionsUsed).toBe(2);
    expect(next[1].actionsUsed).toBe(2);
  });

  it("sets a reaction and refreshes both resources at turn start", () => {
    const spent = setInitiativeReaction(
      [{ ...entry("Hero", 20), actionsUsed: 2, reactionsUsed: 0 }],
      "Hero",
      1
    )[0];
    expect(spent.reactionsUsed).toBe(1);
    const refreshed = refreshInitiativeTurn(spent);
    expect(refreshed.actionsUsed).toBe(0);
    expect(refreshed.reactionsUsed).toBe(0);
  });
});

describe("player-facing initiative", () => {
  it("removes entries for hidden tokens and moves the active index", () => {
    const visible = { ...entry("Visible", 20), tokenId: "tok_visible" };
    const hidden = { ...entry("Lurker", 15), tokenId: "tok_hidden" };
    const result = filterInitiativeForPlayers([visible, hidden], new Set(["tok_hidden"]), 1);
    expect(result.entries.map((item) => item.name)).toEqual(["Visible"]);
    expect(result.turnIndex).toBe(0);
  });

  it("keeps the active index when the active entry is visible", () => {
    const first = { ...entry("First", 20), tokenId: "tok_first" };
    const second = { ...entry("Second", 15), tokenId: "tok_second" };
    const result = filterInitiativeForPlayers([first, second], new Set(), 1);
    expect(result.entries.map((item) => item.name)).toEqual(["First", "Second"]);
    expect(result.turnIndex).toBe(1);
  });
});
