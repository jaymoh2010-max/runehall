import { describe, expect, it } from "vitest";
import type { InitiativeEntry } from "../src/shared/types";
import { sortInitiativeEntries } from "../src/shared/initiative";

function entry(name: string, initiative: number, tieBreak?: number): InitiativeEntry {
  return {
    id: name,
    tokenId: null,
    name,
    initiative,
    color: "#fff",
    ownerId: null,
    sceneId: null,
    tieBreak,
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
});
