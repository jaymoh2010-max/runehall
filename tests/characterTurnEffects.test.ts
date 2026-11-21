import { describe, expect, it } from "vitest";
import {
  characterHasRegenerationSuppressed,
  characterRegenerationActive,
  characterTokenTurnEffects,
  characterTurnHealingParts,
  clearRegenerationSuppression,
  normalizeCharacterTurnEffects,
  normalizeDamageTypeList,
  REGENERATION_SUPPRESSED_CONDITION,
  suppressRegenerationFromDamage,
} from "../src/shared/characterTurnEffects";
import { emptyCharacterDraft } from "../src/shared/rules";
import type { CharacterCondition, CharacterPlay } from "../src/shared/types";

function play(overrides: Partial<CharacterPlay> = {}): CharacterPlay {
  return { ...emptyCharacterDraft("Turn Effect Hero").play, ...overrides };
}

describe("character turn effects", () => {
  it("normalizes values, notes, and suppressed damage types", () => {
    const effects = normalizeCharacterTurnEffects({
      fastHealing: "5.4",
      fastHealingActive: false,
      fastHealingNote: "  while below half HP  ",
      regeneration: 99_999,
      regenerationNote: 7,
      regenerationDeactivatedBy: "Fire Damage, acid or fire, COLD",
    });
    expect(effects.fastHealing).toBe(5);
    expect(effects.fastHealingActive).toBe(false);
    expect(effects.fastHealingNote).toBe("while below half HP");
    expect(effects.regeneration).toBe(1000);
    expect(effects.regenerationNote).toBe("");
    expect(effects.regenerationDeactivatedBy).toEqual(["fire", "acid", "cold"]);
  });

  it("normalizes damage type lists from arrays and prose", () => {
    expect(normalizeDamageTypeList([" Fire ", "fire", "acid damage"])).toEqual(["fire", "acid"]);
    expect(normalizeDamageTypeList("acid and fire, cold or electricity")).toEqual([
      "acid",
      "fire",
      "cold",
      "electricity",
    ]);
  });

  it("adds fast healing and active regeneration together", () => {
    const parts = characterTurnHealingParts(
      play({ fastHealing: 5, fastHealingActive: true, regeneration: 10 })
    );
    expect(parts).toEqual({
      fastHealing: 5,
      regeneration: 10,
      total: 15,
      suppressed: false,
    });
  });

  it("keeps fast healing while regeneration is suppressed", () => {
    const parts = characterTurnHealingParts(
      play({
        fastHealing: 5,
        regeneration: 10,
        conditions: [{ name: REGENERATION_SUPPRESSED_CONDITION, value: null, duration: null }],
      })
    );
    expect(parts.fastHealing).toBe(5);
    expect(parts.regeneration).toBe(0);
    expect(parts.total).toBe(5);
    expect(parts.suppressed).toBe(true);
    expect(
      characterRegenerationActive(
        play({
          regeneration: 10,
          conditions: [{ name: REGENERATION_SUPPRESSED_CONDITION, value: null, duration: null }],
        })
      )
    ).toBe(false);
  });

  it("suppresses regeneration only for a matching damage type", () => {
    const base = play({ regeneration: 10, regenerationDeactivatedBy: ["fire", "acid"] });
    const cold = suppressRegenerationFromDamage(base, "cold");
    expect(cold.applied).toBe(false);
    expect(cold.conditions).toBe(base.conditions);

    const fire = suppressRegenerationFromDamage(base, ["Fire Damage"]);
    expect(fire.applied).toBe(true);
    expect(fire.types).toEqual(["fire"]);
    expect(characterHasRegenerationSuppressed(fire.conditions)).toBe(true);

    const again = suppressRegenerationFromDamage({ ...base, conditions: fire.conditions }, [
      "fire",
    ]);
    expect(again.applied).toBe(false);
  });

  it("does not suppress an inactive or zero regeneration entry", () => {
    expect(
      suppressRegenerationFromDamage(
        play({ regeneration: 0, regenerationDeactivatedBy: ["fire"] }),
        ["fire"]
      ).applied
    ).toBe(false);
    expect(
      suppressRegenerationFromDamage(
        play({ regeneration: 10, regenerationActive: false, regenerationDeactivatedBy: ["fire"] }),
        ["fire"]
      ).applied
    ).toBe(false);
  });

  it("clears suppression while preserving other conditions", () => {
    const conditions: CharacterCondition[] = [
      { name: "Frightened", value: 1, duration: null },
      { name: REGENERATION_SUPPRESSED_CONDITION, value: null, duration: null },
    ];
    const cleared = clearRegenerationSuppression(conditions);
    expect(cleared).toEqual([{ name: "Frightened", value: 1, duration: null }]);
    expect(clearRegenerationSuppression(cleared)).toBe(cleared);
  });

  it("mirrors character effects into the token shape", () => {
    const effects = characterTokenTurnEffects(
      play({
        fastHealing: 4,
        fastHealingActive: false,
        fastHealingNote: "conditional",
        regeneration: 8,
        regenerationNote: "regen",
        regenerationDeactivatedBy: ["fire"],
        persistentDamage: [{ id: "pd", formula: "1d6", type: "fire", dc: 15, notes: "" }],
      })
    );
    expect(effects).toMatchObject({
      fastHealing: 4,
      fastHealingActive: false,
      fastHealingNote: "conditional",
      regeneration: 8,
      regenerationNote: "regen",
      regenerationDeactivatedBy: ["fire"],
    });
    expect(effects.persistentDamage).toHaveLength(1);
  });
});
