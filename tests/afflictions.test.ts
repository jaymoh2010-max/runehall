import { describe, expect, it } from "vitest";
import {
  applyAfflictionSave,
  normalizeAffliction,
  normalizeAfflictions,
} from "../src/shared/afflictions";
import type { CharacterAffliction } from "../src/shared/types";

function affliction(overrides: Partial<CharacterAffliction> = {}): CharacterAffliction {
  return {
    id: "aff-1",
    name: "Giant Spider Venom",
    type: "poison",
    dc: 18,
    save: "fortitude",
    stage: 1,
    stageMax: 3,
    interval: "1 round",
    duration: "1 minute",
    onset: "1 round",
    virulent: false,
    virulentSuccesses: 0,
    virulentCrit: "reduce",
    savesCanEnd: true,
    notes: "",
    ...overrides,
  };
}

describe("afflictions", () => {
  it("normalizes untrusted affliction data and clamps values", () => {
    const normalized = normalizeAffliction({
      name: "  Grave Curse  ",
      type: "curse",
      dc: 99,
      save: "will",
      stage: 8,
      stageMax: 3,
      interval: "",
      duration: "1 day",
      virulent: true,
      virulentSuccesses: 4,
      virulentCrit: "streak",
      savesCanEnd: false,
      notes: "x".repeat(1_500),
    });
    expect(normalized).toMatchObject({
      name: "Grave Curse",
      type: "curse",
      dc: 60,
      save: "will",
      stage: 3,
      stageMax: 3,
      interval: "",
      duration: "1 day",
      virulent: true,
      virulentSuccesses: 1,
      virulentCrit: "streak",
      savesCanEnd: false,
    });
    expect(normalized!.notes).toHaveLength(1_000);
    expect(normalizeAffliction({ type: "poison" })).toBeNull();
    expect(normalizeAffliction({ name: "X", type: "unknown" })?.type).toBe("poison");
  });

  it("drops duplicate ids and caps the list", () => {
    const entries = Array.from({ length: 25 }, (_, index) => ({
      id: index < 2 ? "same" : `aff-${index}`,
      name: `Affliction ${index}`,
    }));
    const normalized = normalizeAfflictions(entries);
    expect(normalized).toHaveLength(20);
    expect(new Set(normalized.map((entry) => entry.id)).size).toBe(20);
  });

  it("reduces two stages on a normal critical success and ends only below stage 1", () => {
    const reduced = applyAfflictionSave(affliction({ stage: 3 }), "critical-success");
    expect(reduced.affliction?.stage).toBe(1);
    expect(reduced.outcome).toBe("reduced");

    const ended = applyAfflictionSave(affliction({ stage: 2 }), "critical-success");
    expect(ended.affliction).toBeNull();
    expect(ended.outcome).toBe("ended");
  });

  it("keeps a save-removable-only affliction at stage 1", () => {
    const result = applyAfflictionSave(
      affliction({ stage: 1, savesCanEnd: false }),
      "critical-success"
    );
    expect(result.affliction?.stage).toBe(1);
    expect(result.outcome).toBe("reduced");
    expect(result.message).toContain("persists");
  });

  it("reduces the stage on success and ends at stage 1", () => {
    const reduced = applyAfflictionSave(affliction({ stage: 3 }), "success");
    expect(reduced.affliction?.stage).toBe(2);
    expect(reduced.outcome).toBe("reduced");

    const ended = applyAfflictionSave(affliction({ stage: 1 }), "success");
    expect(ended.affliction).toBeNull();
    expect(ended.outcome).toBe("ended");
  });

  it("worsens on failure and critical failure, capped at the maximum stage", () => {
    const failed = applyAfflictionSave(affliction({ stage: 1 }), "failure");
    expect(failed.affliction?.stage).toBe(2);
    expect(failed.outcome).toBe("worsened");

    const critical = applyAfflictionSave(affliction({ stage: 1 }), "critical-failure");
    expect(critical.affliction?.stage).toBe(3);

    const capped = applyAfflictionSave(affliction({ stage: 3 }), "critical-failure");
    expect(capped.affliction?.stage).toBe(3);
    expect(capped.message).toContain("maximum");
  });

  it("requires two consecutive successes for a virulent affliction", () => {
    const first = applyAfflictionSave(affliction({ stage: 2, virulent: true }), "success");
    expect(first.outcome).toBe("pending");
    expect(first.affliction?.stage).toBe(2);
    expect(first.affliction?.virulentSuccesses).toBe(1);

    const second = applyAfflictionSave(first.affliction!, "success");
    expect(second.outcome).toBe("reduced");
    expect(second.affliction?.stage).toBe(1);
    expect(second.affliction?.virulentSuccesses).toBe(0);

    const reset = applyAfflictionSave(first.affliction!, "failure");
    expect(reset.affliction?.virulentSuccesses).toBe(0);
    expect(reset.affliction?.stage).toBe(3);
  });

  it("supports both virulent critical-success policies", () => {
    const reduce = applyAfflictionSave(
      affliction({ stage: 2, virulent: true }),
      "critical-success"
    );
    expect(reduce.affliction?.stage).toBe(1);
    expect(reduce.outcome).toBe("reduced");

    const streak = applyAfflictionSave(
      affliction({ stage: 2, virulent: true, virulentCrit: "streak" }),
      "critical-success"
    );
    expect(streak.affliction?.stage).toBe(2);
    expect(streak.affliction?.virulentSuccesses).toBe(1);
    expect(streak.outcome).toBe("pending");
  });
});
