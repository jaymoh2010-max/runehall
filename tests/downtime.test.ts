import { describe, expect, it } from "vitest";
import { cpToCurrency, currencyToCp } from "../src/shared/inventory";
import { emptyCharacterDraft, normalizeCharacterDraft } from "../src/shared/rules";
import {
  defaultSubsistDc,
  earnIncomeCp,
  normalizeDowntimeActivities,
} from "../src/shared/downtime";
import { performDowntimeDay } from "../src/server/downtime";
import { dcForLevel } from "../src/shared/gmScreen";
import type { DerivedCharacter } from "../src/shared/types";

const skills = [
  { id: "crafting", name: "Crafting", ability: "int", rank: 1, mod: 10, trained: true },
  { id: "survival", name: "Survival", ability: "wis", rank: 1, mod: 10, trained: true },
] satisfies DerivedCharacter["skills"];

function draftWithCoins(copper: number) {
  const draft = emptyCharacterDraft("Downtime Test");
  draft.play.downtimeDays = 5;
  draft.play.lifestyle = "comfortable";
  draft.currency = cpToCurrency(copper);
  return draft;
}

function check(result: ReturnType<typeof performDowntimeDay>) {
  if ("error" in result) throw new Error(result.error);
  return result;
}

describe("Player Core table 4-2 Earn Income", () => {
  it("uses the rank and task-level columns", () => {
    expect(earnIncomeCp(0, 1, "success")).toBe(5);
    expect(earnIncomeCp(5, 1, "success")).toBe(90);
    expect(earnIncomeCp(10, 2, "success")).toBe(500);
    expect(earnIncomeCp(15, 3, "success")).toBe(2_800);
    expect(earnIncomeCp(19, 4, "success")).toBe(13_000);
    expect(earnIncomeCp(20, 4, "success")).toBe(20_000);
    expect(earnIncomeCp(10, 1, "failure")).toBe(70);
    expect(earnIncomeCp(10, 1, "critical-failure")).toBe(0);
  });

  it("moves a critical success up one task level and uses the level 20 row", () => {
    expect(earnIncomeCp(5, 1, "critical-success")).toBe(150);
    expect(earnIncomeCp(19, 4, "critical-success")).toBe(20_000);
    expect(earnIncomeCp(20, 1, "critical-success")).toBe(5_000);
    expect(earnIncomeCp(20, 4, "critical-success")).toBe(30_000);
  });

  it("derives the default Subsist DC from the settlement level", () => {
    expect(defaultSubsistDc(1)).toBe(15);
    expect(defaultSubsistDc(10)).toBe(27);
  });
});

describe("downtime activity normalization", () => {
  it("clamps stale or malformed rows and keeps unique ids", () => {
    const activities = normalizeDowntimeActivities([
      {
        id: "downtime_a",
        kind: "earn-income",
        skill: "lore:Mining",
        taskLevel: 99,
        dc: 0,
        daysSpent: -2,
        earnedCp: "12",
        status: "complete",
        lastDegree: "success",
      },
      { id: "downtime_a", kind: "craft" },
      { id: "downtime_b", kind: "not-a-kind" },
      null,
    ]);
    expect(activities).toHaveLength(2);
    expect(activities[0]).toMatchObject({
      id: "downtime_a",
      kind: "earn-income",
      taskLevel: 20,
      dc: 1,
      daysSpent: 0,
      earnedCp: 12,
      status: "complete",
      lastDegree: "success",
    });
    expect(activities[1]).toMatchObject({ id: "downtime_b", kind: "other" });
    expect(normalizeCharacterDraft({ name: "Legacy" }, "Legacy").play.downtimeActivities).toEqual(
      []
    );
  });
});

describe("downtime task validation", () => {
  it("caps the task level at the settlement and derives the DC on the server", () => {
    const draft = draftWithCoins(1_000);
    const tooHigh = performDowntimeDay({
      draft,
      skills,
      lore: [],
      input: { kind: "earn-income", skill: "crafting", taskLevel: 20, dc: 1 },
      settlementLevel: 5,
      now: 1_000,
      id: "downtime_bad",
      rng: () => 0.5,
    });
    expect("error" in tooHigh).toBe(true);

    const result = check(
      performDowntimeDay({
        draft,
        skills,
        lore: [],
        input: { kind: "earn-income", skill: "crafting", taskLevel: 5, dc: 1 },
        settlementLevel: 5,
        now: 1_000,
        id: "downtime_good",
        rng: () => 0.99,
      })
    );
    expect(result.activity?.dc).toBe(dcForLevel(5));
  });
});

describe("spending a day on a downtime activity", () => {
  it("rolls once for Earn Income, then repeats the daily pay", () => {
    const draft = draftWithCoins(1_000);
    const first = check(
      performDowntimeDay({
        draft,
        skills,
        lore: [],
        input: {
          kind: "earn-income",
          skill: "crafting",
          taskLevel: 5,
          dc: 15,
          label: "Dock work",
        },
        settlementLevel: 5,
        now: 1_000,
        id: "downtime_earn",
        rng: () => 0.99,
      })
    );
    expect(first.degree).toBe("critical-success");
    expect(first.earnedCp).toBe(150);
    expect(first.paidCp).toBe(15);
    expect(first.activity).toMatchObject({
      kind: "earn-income",
      label: "Dock work",
      daysSpent: 1,
      dailyEarnedCp: 150,
      status: "active",
    });
    expect(draft.play.downtimeDays).toBe(4);
    expect(currencyToCp(draft.currency)).toBe(1_135);

    const second = check(
      performDowntimeDay({
        draft,
        skills,
        lore: [],
        input: { activityId: "downtime_earn" },
        settlementLevel: 5,
        now: 2_000,
        id: "downtime_next",
      })
    );
    expect(second.roll).toBeNull();
    expect(second.earnedCp).toBe(150);
    expect(second.activity).toMatchObject({ daysSpent: 2, earnedCp: 300, status: "active" });
    expect(draft.play.downtimeDays).toBe(3);
    expect(currencyToCp(draft.currency)).toBe(1_270);
  });

  it("waives upkeep on a successful Subsist and applies fatigue on failure", () => {
    const successDraft = draftWithCoins(0);
    const success = check(
      performDowntimeDay({
        draft: successDraft,
        skills,
        lore: [],
        input: { kind: "subsist", skill: "survival", dc: 15 },
        settlementLevel: 1,
        now: 1_000,
        id: "downtime_subsist",
        rng: () => 0.99,
      })
    );
    expect(success.upkeepWaived).toBe(true);
    expect(success.paidCp).toBe(0);
    expect(success.activity?.status).toBe("complete");
    expect(currencyToCp(successDraft.currency)).toBe(0);
    expect(successDraft.play.downtimeDays).toBe(4);

    const failureDraft = draftWithCoins(100);
    const failure = check(
      performDowntimeDay({
        draft: failureDraft,
        skills: [
          { id: "survival", name: "Survival", ability: "wis", rank: 0, mod: -5, trained: false },
        ],
        lore: [],
        input: { kind: "subsist", skill: "survival", dc: 20 },
        settlementLevel: 1,
        now: 2_000,
        id: "downtime_fail",
        rng: () => 0,
      })
    );
    expect(failure.degree).toBe("critical-failure");
    expect(failure.upkeepWaived).toBe(false);
    expect(failure.paidCp).toBe(15);
    expect(currencyToCp(failureDraft.currency)).toBe(85);
    expect(failureDraft.play.conditions.some((entry) => entry.name === "Fatigued")).toBe(true);
  });

  it("tracks a multi-day project and completes it on the last day", () => {
    const draft = draftWithCoins(100);
    const first = check(
      performDowntimeDay({
        draft,
        skills,
        lore: [],
        input: { kind: "craft", label: "Striking rune", daysRequired: 2 },
        settlementLevel: 1,
        now: 1_000,
        id: "downtime_craft",
      })
    );
    expect(first.completed).toBe(false);
    expect(first.activity).toMatchObject({
      daysSpent: 1,
      daysRequired: 2,
      status: "active",
    });
    const second = check(
      performDowntimeDay({
        draft,
        skills,
        lore: [],
        input: { activityId: "downtime_craft" },
        settlementLevel: 1,
        now: 2_000,
        id: "downtime_other",
      })
    );
    expect(second.completed).toBe(true);
    expect(second.activity).toMatchObject({
      daysSpent: 2,
      earnedCp: 0,
      paidCp: 30,
      status: "complete",
    });
    expect(draft.play.downtimeDays).toBe(3);
  });

  it("rejects an activity the purse cannot cover without mutating the draft", () => {
    const draft = draftWithCoins(0);
    draft.play.lifestyle = "comfortable";
    draft.play.downtimeDays = 3;
    const before = JSON.stringify(draft);
    const result = performDowntimeDay({
      draft,
      skills,
      lore: [],
      input: { kind: "craft", label: "Unaffordable", daysRequired: 4 },
      settlementLevel: 1,
      now: 1_000,
      id: "downtime_broke",
    });
    expect("error" in result).toBe(true);
    expect(JSON.stringify(draft)).toBe(before);
  });
});
