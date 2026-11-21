import { describe, expect, it } from "vitest";
import { applyHeroicRecovery } from "../src/shared/damage";
import {
  clampHeroPoints,
  grantHeroPoints,
  MAX_HERO_POINTS,
  resetHeroPoints,
  SESSION_HERO_POINTS,
} from "../src/shared/heroPoints";
import { emptyCharacterDraft } from "../src/shared/rules";
import type { CharacterCondition, CharacterDraft } from "../src/shared/types";

function hero(conditions: CharacterCondition[], heroPoints = 1, hp = 0): CharacterDraft {
  const draft = emptyCharacterDraft("Hero Point Test");
  return {
    ...draft,
    play: { ...draft.play, hp, heroPoints, conditions },
  };
}

function conditionValue(draft: CharacterDraft, name: string): number {
  const wanted = name.toLowerCase();
  for (const condition of draft.play.conditions) {
    const raw = String(condition.name ?? "").trim();
    const match = raw.match(/^(.*?)\s+(\d+)$/);
    if ((match?.[1] ?? raw).trim().toLowerCase() !== wanted) continue;
    return Number(match?.[2] ?? condition.value ?? 1);
  }
  return 0;
}

describe("Hero Point math", () => {
  it("clamps to the PF2e range", () => {
    expect(MAX_HERO_POINTS).toBe(3);
    expect(SESSION_HERO_POINTS).toBe(1);
    expect(clampHeroPoints(-2)).toBe(0);
    expect(clampHeroPoints(9)).toBe(3);
    expect(clampHeroPoints("2")).toBe(2);
    expect(clampHeroPoints("nonsense")).toBe(1);
  });

  it("grants points up to the cap and reports overflow", () => {
    expect(grantHeroPoints(1, 1)).toEqual({ value: 2, gained: 1, capped: 0 });
    expect(grantHeroPoints(2, 3)).toEqual({ value: 3, gained: 1, capped: 2 });
    expect(grantHeroPoints(3, 1)).toEqual({ value: 3, gained: 0, capped: 1 });
  });

  it("resets to one by default", () => {
    expect(resetHeroPoints()).toBe(1);
    expect(resetHeroPoints(3)).toBe(3);
    expect(resetHeroPoints(99)).toBe(3);
  });
});

describe("Heroic Recovery", () => {
  it("spends all Hero Points, removes dying, and does not add wounded", () => {
    const draft = hero([{ name: "Dying", value: 2 }], 2, 0);
    const result = applyHeroicRecovery(draft);
    expect(result.applied).toBe(true);
    expect(result.spent).toBe(2);
    expect(result.draft.play.heroPoints).toBe(0);
    expect(result.draft.play.hp).toBe(0);
    expect(conditionValue(result.draft, "dying")).toBe(0);
    expect(conditionValue(result.draft, "unconscious")).toBe(1);
    expect(conditionValue(result.draft, "wounded")).toBe(0);
  });

  it("keeps existing wounded and other conditions", () => {
    const draft = hero(
      [
        { name: "Dying", value: 1 },
        { name: "Wounded", value: 2 },
        { name: "Frightened", value: 1 },
      ],
      1,
      0
    );
    const result = applyHeroicRecovery(draft);
    expect(conditionValue(result.draft, "wounded")).toBe(2);
    expect(conditionValue(result.draft, "frightened")).toBe(1);
  });

  it("refuses when there are no Hero Points", () => {
    const draft = hero([{ name: "Dying", value: 1 }], 0, 0);
    const result = applyHeroicRecovery(draft);
    expect(result.applied).toBe(false);
    expect(result.reason).toBe("no-hero-points");
  });

  it("refuses when not dying or already dead", () => {
    expect(applyHeroicRecovery(hero([], 1, 10)).reason).toBe("not-dying");
    expect(applyHeroicRecovery(hero([{ name: "Dead" }], 2, 0)).reason).toBe("dead");
  });
});
