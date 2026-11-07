import { describe, expect, it } from "vitest";
import type { InitiativeEntry } from "../src/shared/types";
import { sortInitiativeEntries } from "../src/shared/initiative";

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
