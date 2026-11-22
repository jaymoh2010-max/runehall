import { describe, expect, it } from "vitest";
import {
  adjustDegreeForIncapacitation,
  counteractRankFor,
  incapacitationNote,
  resolveCounteract,
  shiftDegree,
  spellHasIncapacitation,
} from "../src/shared/spellChecks";

describe("degree shifts", () => {
  it("moves one step and clamps at the ends", () => {
    expect(shiftDegree("failure", 1)).toBe("success");
    expect(shiftDegree("success", 1)).toBe("critical-success");
    expect(shiftDegree("critical-success", 1)).toBe("critical-success");
    expect(shiftDegree("critical-failure", -1)).toBe("critical-failure");
  });
});

describe("incapacitation", () => {
  it("improves a save only when the target is above twice the effect rank", () => {
    const threshold = 4;
    expect(adjustDegreeForIncapacitation("failure", 4, 2)).toEqual({
      degree: "failure",
      adjusted: false,
      threshold,
    });
    expect(adjustDegreeForIncapacitation("failure", 5, 2)).toEqual({
      degree: "success",
      adjusted: true,
      threshold,
    });
    expect(adjustDegreeForIncapacitation("critical-success", 12, 2)).toEqual({
      degree: "critical-success",
      adjusted: true,
      threshold,
    });
  });

  it("recognizes the trait and writes a useful reminder", () => {
    expect(spellHasIncapacitation({ traits: ["incapacitation", "mental"] })).toBe(true);
    expect(spellHasIncapacitation({ traits: ["mental"] })).toBe(false);
    expect(incapacitationNote(3)).toContain("level 6");
  });
});

describe("counteract checks", () => {
  it("uses the cast rank on success and one higher on a critical success", () => {
    expect(counteractRankFor("success", 3)).toBe(3);
    expect(counteractRankFor("critical-success", 3)).toBe(4);
    expect(counteractRankFor("failure", 3)).toBeNull();
    expect(counteractRankFor("critical-failure", 3)).toBeNull();
    expect(counteractRankFor("critical-success", 10)).toBe(10);
  });

  it("counteracts effects at or below the resulting rank", () => {
    const success = resolveCounteract("success", 3, 3);
    expect(success.counteracted).toBe(true);
    expect(success.note).toContain("rank 3");

    const tooHigh = resolveCounteract("success", 3, 4);
    expect(tooHigh.counteracted).toBe(false);
    expect(tooHigh.note).toContain("too low");

    const crit = resolveCounteract("critical-success", 3, 4);
    expect(crit.counteracted).toBe(true);
    expect(crit.counteractRank).toBe(4);

    const fail = resolveCounteract("failure", 3, 1);
    expect(fail.counteracted).toBe(false);
    expect(fail.note).toContain("failed");
  });
});
