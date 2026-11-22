import { describe, expect, it } from "vitest";
import {
  AFFLICTION_PRESETS,
  AFFLICTION_TYPES,
  advanceAfflictionDuration,
  afflictionDurationSeconds,
  afflictionOnsetPassed,
  afflictionRounds,
  applyAfflictionSave,
  formatAfflictionDuration,
  initialIntervalRemaining,
  initialOnsetRemaining,
  normalizeAffliction,
  normalizeAfflictions,
  resetAfflictionTimers,
  resolveAfflictionTurnEnd,
} from "../src/shared/afflictions";
import { emptyCharacterDraft } from "../src/shared/rules";
import type { CharacterAffliction, CharacterDraft } from "../src/shared/types";

describe("affliction templates", () => {
  it("bundles unique, valid recovery frames", () => {
    expect(new Set(AFFLICTION_PRESETS.map((preset) => preset.id)).size).toBe(
      AFFLICTION_PRESETS.length
    );
    for (const preset of AFFLICTION_PRESETS) {
      expect(AFFLICTION_TYPES).toContain(preset.type);
      expect(preset.dc).toBeGreaterThanOrEqual(1);
      expect(preset.dc).toBeLessThanOrEqual(60);
      expect(preset.stageMax).toBeGreaterThanOrEqual(1);
      expect(preset.stageMax).toBeLessThanOrEqual(10);
      expect(afflictionDurationSeconds(preset.duration)).not.toBeNull();
      if (/rounds?$/i.test(preset.interval)) {
        expect(initialIntervalRemaining(preset.interval)).not.toBeNull();
      }
      if (/rounds?$/i.test(preset.onset)) {
        expect(initialOnsetRemaining(preset.onset)).not.toBeNull();
      }
    }
  });
});

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
    duration: "",
    durationRemaining: null,
    onset: "1 round",
    onsetRemaining: 1,
    intervalRemaining: 1,
    virulent: false,
    virulentSuccesses: 0,
    virulentCrit: "reduce",
    savesCanEnd: true,
    notes: "",
    ...overrides,
  };
}

function withAffliction(overrides: Partial<CharacterAffliction> = {}): CharacterDraft {
  const draft = emptyCharacterDraft("Affliction Hero");
  draft.play.afflictions = [affliction(overrides)];
  return draft;
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

  it("tracks maximum durations in seconds and ends when they run out", () => {
    expect(afflictionDurationSeconds("1 round")).toBe(6);
    expect(afflictionDurationSeconds("2 minutes")).toBe(120);
    expect(afflictionDurationSeconds("1 hour")).toBe(3_600);
    expect(afflictionDurationSeconds("1 day")).toBe(86_400);
    expect(afflictionDurationSeconds("until cured")).toBeNull();

    const normalized = normalizeAffliction({ name: "Venom", duration: "1 minute" });
    expect(normalized?.durationRemaining).toBe(60);
    expect(advanceAfflictionDuration(normalized!, 54)?.durationRemaining).toBe(6);
    expect(advanceAfflictionDuration(normalized!, 60)).toBeNull();
    expect(formatAfflictionDuration(3_600)).toBe("1 hour left");
    expect(formatAfflictionDuration(null)).toBe("no timed maximum");
  });

  it("ends an affliction at the end of the turn that exhausts its duration", () => {
    const draft = withAffliction({
      duration: "1 round",
      durationRemaining: 6,
      onsetRemaining: 0,
      intervalRemaining: 10,
    });
    const result = resolveAfflictionTurnEnd(
      draft,
      { fortitude: 10, reflex: 0, will: 0 },
      { rng: () => 0.5 }
    );
    expect(result.changed).toBe(true);
    expect(result.draft.play.afflictions).toHaveLength(0);
    expect(result.notes.join(" ")).toContain("maximum duration");
  });

  it("parses only round-based onset and interval timers", () => {
    expect(afflictionRounds("1 round")).toBe(1);
    expect(afflictionRounds(" 2 Rounds ")).toBe(2);
    expect(afflictionRounds("1 minute")).toBeNull();
    expect(afflictionRounds("")).toBeNull();
    expect(initialOnsetRemaining("")).toBe(0);
    expect(initialOnsetRemaining("1 round")).toBe(1);
    expect(initialOnsetRemaining("1 hour")).toBeNull();
    expect(initialIntervalRemaining("")).toBeNull();
    expect(initialIntervalRemaining("3 rounds")).toBe(3);
    expect(initialIntervalRemaining("1 day")).toBeNull();
  });

  it("derives timers for legacy afflictions and preserves explicit values", () => {
    const derived = normalizeAffliction({
      name: "Giant Spider Venom",
      onset: "2 rounds",
      interval: "3 rounds",
    });
    expect(derived?.onsetRemaining).toBe(2);
    expect(derived?.intervalRemaining).toBe(3);

    const explicit = normalizeAffliction({
      name: "Grave Curse",
      onset: "1 hour",
      interval: "1 day",
      onsetRemaining: null,
      intervalRemaining: 0,
    });
    expect(explicit?.onsetRemaining).toBeNull();
    expect(explicit?.intervalRemaining).toBe(0);
  });

  it("advances onset before rolling an interval save", () => {
    const draft = withAffliction({
      onset: "1 round",
      onsetRemaining: 1,
      interval: "1 round",
      intervalRemaining: null,
      stage: 2,
    });
    const saves = { fortitude: 10, reflex: 0, will: 0 };

    const onset = resolveAfflictionTurnEnd(draft, saves, { rng: () => 0.5 });
    expect(onset.changed).toBe(true);
    expect(onset.rolls).toHaveLength(0);
    expect(onset.notes.join(" ")).toContain("onset ends");
    expect(onset.draft.play.afflictions[0].onsetRemaining).toBe(0);
    expect(onset.draft.play.afflictions[0].intervalRemaining).toBe(1);

    const saved = resolveAfflictionTurnEnd(onset.draft, saves, {
      rng: () => 0.5,
      labelPrefix: "Affliction Hero",
    });
    expect(saved.rolls).toHaveLength(1);
    expect(saved.rolls[0].label).toBe("Affliction Hero · Giant Spider Venom stage save");
    expect(saved.rolls[0].degree).toBe("success");
    expect(saved.draft.play.afflictions[0].stage).toBe(1);
    expect(saved.draft.play.afflictions[0].intervalRemaining).toBe(1);
    expect(saved.notes.join(" ")).toContain("stage 2 → 1");
  });

  it("leaves non-round and manual-onset afflictions alone", () => {
    const manualOnset = withAffliction({
      onset: "1 hour",
      onsetRemaining: null,
      interval: "1 round",
      intervalRemaining: 1,
    });
    const first = resolveAfflictionTurnEnd(
      manualOnset,
      { fortitude: 10, reflex: 0, will: 0 },
      { rng: () => 0.5 }
    );
    expect(first.changed).toBe(false);
    expect(first.rolls).toHaveLength(0);

    const manualInterval = withAffliction({
      onset: "",
      onsetRemaining: 0,
      interval: "1 day",
      intervalRemaining: null,
    });
    const second = resolveAfflictionTurnEnd(
      manualInterval,
      { fortitude: 10, reflex: 0, will: 0 },
      { rng: () => 0.5 }
    );
    expect(second.changed).toBe(false);
    expect(second.rolls).toHaveLength(0);
  });

  it("does not tick afflictions for a dead character", () => {
    const draft = withAffliction({ onsetRemaining: 1 });
    draft.play.conditions = [{ name: "Dead", value: null, duration: null }];
    const result = resolveAfflictionTurnEnd(
      draft,
      { fortitude: 10, reflex: 0, will: 0 },
      { rng: () => 0.5 }
    );
    expect(result.changed).toBe(false);
    expect(result.draft).toBe(draft);
  });

  it("resets and fast-forwards timers from their text", () => {
    const base = affliction({ onset: "2 rounds", interval: "3 rounds" });
    expect(resetAfflictionTimers(base).onsetRemaining).toBe(2);
    expect(resetAfflictionTimers(base).intervalRemaining).toBe(3);
    const passed = afflictionOnsetPassed(base);
    expect(passed.onsetRemaining).toBe(0);
    expect(passed.intervalRemaining).toBe(3);
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
