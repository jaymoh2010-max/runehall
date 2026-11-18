import { describe, expect, it } from "vitest";
import type { InitiativeEntry } from "../src/shared/types";
import { filterInitiativeForPlayers, sortInitiativeEntries } from "../src/shared/initiative";

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
