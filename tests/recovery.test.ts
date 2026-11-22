import { describe, expect, it } from "vitest";
import { emptyCharacterDraft } from "../src/shared/rules";
import {
  applyRecoveryToDraft,
  clearRecoveryImmunities,
  hasRecoveryFeat,
  medicineRank,
  recoveryDcsForRank,
  recoveryHealingFormula,
} from "../src/shared/recovery";
import type { DerivedCharacter } from "../src/shared/types";

function hero(hp = 20, maxHp = 50) {
  const draft = emptyCharacterDraft("Recovery Test");
  draft.level = 5;
  draft.play.hp = hp;
  return draft;
}

function dyingHero(dying = 2) {
  const draft = hero(0);
  draft.play.conditions = [
    { name: "Dying", value: dying, duration: null },
    { name: "Unconscious", value: null, duration: null },
    { name: "Wounded", value: 1, duration: null },
  ];
  return draft;
}

function apply(
  draft: ReturnType<typeof hero>,
  overrides: Partial<Parameters<typeof applyRecoveryToDraft>[0]> = {}
) {
  return applyRecoveryToDraft({
    draft,
    maxHp: 50,
    level: 5,
    activity: "treat-wounds",
    degree: "success",
    healing: 10,
    healerId: "healer-1",
    ...overrides,
  });
}

describe("recovery DCs and healing", () => {
  it("only offers the DCs unlocked by the healer's Medicine rank", () => {
    expect(recoveryDcsForRank(0)).toEqual([]);
    expect(recoveryDcsForRank(1)).toEqual([15]);
    expect(recoveryDcsForRank(2)).toEqual([15, 20]);
    expect(recoveryDcsForRank(3)).toEqual([15, 20, 30]);
    expect(recoveryDcsForRank(4)).toEqual([15, 20, 30, 40]);
    expect(recoveryDcsForRank(4, "stabilize")).toEqual([15]);
  });

  it("uses the Treat Wounds healing table", () => {
    expect(recoveryHealingFormula(15)).toBe("2d8");
    expect(recoveryHealingFormula(20)).toBe("2d8+10");
    expect(recoveryHealingFormula(30)).toBe("4d8+10");
    expect(recoveryHealingFormula(40)).toBe("4d8+30");
    expect(recoveryHealingFormula(14)).toBeNull();
  });

  it("reads the Medicine rank from derived skills", () => {
    expect(
      medicineRank({
        skills: [
          { id: "medicine", name: "Medicine", ability: "wis", rank: 3, mod: 12, trained: true },
        ],
      } as Pick<DerivedCharacter, "skills">)
    ).toBe(3);
  });

  it("detects Robust Health and Continual Recovery from selected or granted feats", () => {
    const derived = {
      selectedFeats: [{ name: "Robust Health" }],
      grantedFeats: [{ name: "Continual Recovery", id: null }],
    };
    expect(hasRecoveryFeat(derived as never, "Robust Health")).toBe(true);
    expect(hasRecoveryFeat(derived as never, "Continual Recovery")).toBe(true);
    expect(hasRecoveryFeat(derived as never, "Battle Medicine")).toBe(false);
  });
});

describe("Treat Wounds", () => {
  it("heals on success and marks the target immune", () => {
    const result = apply(hero(20), { degree: "success", healing: 10 });
    expect(result.healed).toBe(10);
    expect(result.draft.play.hp).toBe(30);
    expect(result.draft.play.treatWoundsImmune).toBe(true);
    expect(result.notes.join(" ")).toContain("immune");
  });

  it("doubles healing on a critical success and adds Robust Health first", () => {
    const result = apply(hero(10), {
      degree: "critical-success",
      healing: 10,
      robustHealth: true,
    });
    expect(result.healed).toBe(30);
    expect(result.draft.play.hp).toBe(40);
  });

  it("deals 1d8 damage on a critical failure", () => {
    const result = apply(hero(20), {
      degree: "critical-failure",
      healing: 10,
      damage: 6,
    });
    expect(result.healed).toBe(0);
    expect(result.damage).toBe(6);
    expect(result.draft.play.hp).toBe(14);
  });

  it("does not heal on failure but still applies the immunity", () => {
    const result = apply(hero(20), { degree: "failure", healing: 10 });
    expect(result.healed).toBe(0);
    expect(result.draft.play.hp).toBe(20);
    expect(result.draft.play.treatWoundsImmune).toBe(true);
  });
});

describe("Battle Medicine", () => {
  it("shares the healing table and records the healer-specific immunity", () => {
    const result = apply(hero(20), {
      activity: "battle-medicine",
      degree: "success",
      healing: 12,
    });
    expect(result.healed).toBe(12);
    expect(result.draft.play.battleMedicineImmuneBy).toContain("healer-1");
    expect(result.draft.play.treatWoundsImmune).toBe(false);
  });

  it("does not damage the target on a critical failure", () => {
    const result = apply(hero(20), {
      activity: "battle-medicine",
      degree: "critical-failure",
      damage: 8,
    });
    expect(result.damage).toBe(0);
    expect(result.draft.play.hp).toBe(20);
    expect(result.draft.play.battleMedicineImmuneBy).toContain("healer-1");
  });
});

describe("Stabilize", () => {
  it("ends dying while leaving the target unconscious at 0 HP", () => {
    const result = apply(dyingHero(2), {
      activity: "stabilize",
      degree: "success",
    });
    expect(result.draft.play.hp).toBe(0);
    expect(result.draft.play.conditions.some((entry) => entry.name === "Dying")).toBe(false);
    expect(result.draft.play.conditions.some((entry) => entry.name === "Unconscious")).toBe(true);
    expect(result.draft.play.conditions.some((entry) => entry.name === "Wounded")).toBe(true);
  });

  it("restores 1 HP on a critical success", () => {
    const result = apply(dyingHero(1), {
      activity: "stabilize",
      degree: "critical-success",
    });
    expect(result.draft.play.hp).toBe(1);
    expect(result.draft.play.conditions.some((entry) => entry.name === "Dying")).toBe(false);
    expect(result.draft.play.conditions.some((entry) => entry.name === "Unconscious")).toBe(false);
  });

  it("increases dying on a critical failure and can kill at the threshold", () => {
    const increased = apply(dyingHero(1), {
      activity: "stabilize",
      degree: "critical-failure",
    });
    expect(increased.draft.play.conditions.find((entry) => entry.name === "Dying")?.value).toBe(2);
    expect(increased.draft.play.conditions.some((entry) => entry.name === "Dead")).toBe(false);

    const dead = apply(dyingHero(3), {
      activity: "stabilize",
      degree: "critical-failure",
    });
    expect(dead.draft.play.conditions.some((entry) => entry.name === "Dead")).toBe(true);
  });

  it("does nothing to a target that is not dying", () => {
    const result = apply(hero(20), { activity: "stabilize", degree: "success" });
    expect(result.draft.play.hp).toBe(20);
    expect(result.notes.join(" ")).toContain("not dying");
  });
});

describe("recovery immunity reset", () => {
  it("clears both immunity types together", () => {
    const draft = hero(20);
    draft.play.treatWoundsImmune = true;
    draft.play.battleMedicineImmuneBy = ["healer-1"];
    const cleared = clearRecoveryImmunities(draft);
    expect(cleared.play.treatWoundsImmune).toBe(false);
    expect(cleared.play.battleMedicineImmuneBy).toEqual([]);
  });
});
