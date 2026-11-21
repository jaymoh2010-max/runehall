import { describe, expect, it } from "vitest";
import { applyLongRest, longRestHealing } from "../src/shared/rest";
import { emptyCharacterDraft } from "../src/shared/rules";
import type { CharacterDraft, DerivedCharacter } from "../src/shared/types";

function hero(level = 5): CharacterDraft {
  const draft = emptyCharacterDraft("Rest Test");
  draft.level = level;
  draft.spells.slotsUsed = { "1": 2, "2": 1 };
  draft.spells.divineFontUsed = 2;
  draft.spells.preparedUsed = { "1:spell:magic-missile": 1 };
  draft.spells.fontUsed = { "spell:heal": 1 };
  draft.spells.prepared = ["spell:magic-missile"];
  draft.play.hp = 10;
  draft.play.tempHp = 6;
  draft.play.heroPoints = 2;
  draft.play.focusPoints = 0;
  draft.play.xp = 450;
  draft.play.shieldRaised = true;
  draft.play.afflictions = [
    {
      id: "aff-rest",
      name: "Grave Curse",
      type: "curse",
      dc: 18,
      save: "will",
      stage: 2,
      stageMax: 3,
      interval: "1 day",
      duration: "",
      onset: "1 hour",
      onsetRemaining: null,
      intervalRemaining: null,
      virulent: false,
      virulentSuccesses: 0,
      virulentCrit: "reduce",
      savesCanEnd: true,
      notes: "",
    },
  ];
  draft.play.persistentDamage = [
    {
      id: "pd-rest",
      formula: "1d6",
      type: "fire",
      dc: 15,
      notes: "",
    },
  ];
  draft.play.conditions = [
    { name: "Fatigued", value: null, duration: null },
    { name: "Drained", value: 2, duration: null },
    { name: "Doomed", value: 1, duration: null },
    { name: "Frightened", value: 1, duration: 3 },
  ];
  return draft;
}

const derived = {
  maxHp: 60,
  focusPointsMax: 3,
  abilityMods: { str: 0, dex: 1, con: 2, int: 0, wis: 1, cha: 0 },
} satisfies Pick<DerivedCharacter, "maxHp" | "focusPointsMax" | "abilityMods">;

describe("PF2e long rest", () => {
  it("heals Constitution modifier times level", () => {
    expect(longRestHealing(hero(5), derived)).toBe(10);
    expect(longRestHealing(hero(1), derived)).toBe(2);
  });

  it("uses a minimum healing of 1 per level for low Constitution", () => {
    const lowCon = { ...derived, abilityMods: { ...derived.abilityMods, con: -2 } };
    expect(longRestHealing(hero(5), lowCon)).toBe(5);
  });

  it("halves healing for a rough rest, with a minimum of 1", () => {
    expect(longRestHealing(hero(5), derived, true)).toBe(5);
    expect(
      longRestHealing(
        hero(1),
        { ...derived, abilityMods: { ...derived.abilityMods, con: 0 } },
        true
      )
    ).toBe(1);
  });

  it("caps healing at maximum HP", () => {
    const draft = hero(5);
    draft.play.hp = 58;
    const result = applyLongRest(draft, derived);
    expect(result.summary).toMatchObject({ healing: 10, healed: 2, hpBefore: 58, hpAfter: 60 });
  });

  it("treats a null current HP as full health", () => {
    const draft = hero(5);
    draft.play.hp = null;
    const result = applyLongRest(draft, derived);
    expect(result.summary).toMatchObject({ hpBefore: 60, hpAfter: 60, healed: 0 });
  });

  it("resets daily resources and clears temporary HP", () => {
    const result = applyLongRest(hero(5), derived);
    expect(result.draft.spells.slotsUsed).toEqual({});
    expect(result.draft.spells.divineFontUsed).toBe(0);
    expect(result.draft.spells.preparedUsed).toEqual({});
    expect(result.draft.spells.fontUsed).toEqual({});
    expect(result.draft.play.afflictions).toEqual(hero(5).play.afflictions);
    expect(result.draft.play.persistentDamage).toEqual(hero(5).play.persistentDamage);
    expect(result.draft.play.tempHp).toBe(0);
    expect(result.draft.play.focusPoints).toBe(3);
    expect(result.draft.play.shieldRaised).toBe(false);
    expect(result.draft.play.hp).toBe(20);
    expect(result.summary).toMatchObject({
      tempHpCleared: 6,
      slotsRestored: 3,
      divineFontRestored: 2,
      focusBefore: 0,
      focusAfter: 3,
      shieldLowered: true,
    });
  });

  it("removes fatigued and reduces doomed and drained by one", () => {
    const result = applyLongRest(hero(5), derived);
    expect(result.draft.play.conditions).toEqual([
      { name: "Drained", value: 1, duration: null },
      { name: "Frightened", value: 1, duration: 3 },
    ]);
    expect(result.summary.removedConditions).toEqual(["Fatigued", "Doomed"]);
    expect(result.summary.reducedConditions).toEqual([{ name: "Drained", from: 2, to: 1 }]);
  });

  it("reduces legacy trailing-value doomed and drained names", () => {
    const draft = hero(5);
    draft.play.conditions = [
      { name: "Doomed 1", value: null, duration: null },
      { name: "Drained 2", value: null, duration: null },
    ];
    const result = applyLongRest(draft, derived);
    expect(result.draft.play.conditions).toEqual([{ name: "Drained", value: 1, duration: null }]);
    expect(result.summary.removedConditions).toEqual(["Doomed 1"]);
    expect(result.summary.reducedConditions).toEqual([{ name: "Drained", from: 2, to: 1 }]);
  });

  it("clears wounded at full HP but keeps it below full HP", () => {
    const full = hero(5);
    full.play.hp = 60;
    full.play.conditions = [{ name: "Wounded", value: 1, duration: null }];
    expect(applyLongRest(full, derived).draft.play.conditions).toEqual([]);

    const hurt = hero(5);
    hurt.play.hp = 20;
    hurt.play.conditions = [{ name: "Wounded", value: 1, duration: null }];
    expect(applyLongRest(hurt, derived).draft.play.conditions).toEqual([
      { name: "Wounded", value: 1, duration: null },
    ]);
  });

  it("does not rest a dead character back to life", () => {
    const draft = hero(5);
    draft.play.hp = 0;
    draft.play.conditions = [
      { name: "Dead", value: null, duration: null },
      { name: "Dying", value: 4, duration: null },
    ];
    const result = applyLongRest(draft, derived);
    expect(result.draft).toBe(draft);
    expect(result.summary.healed).toBe(0);
    expect(result.summary.slotsRestored).toBe(0);
  });

  it("clears dying and unconscious once healing brings the character above zero", () => {
    const draft = hero(5);
    draft.play.hp = 0;
    draft.play.conditions = [
      { name: "Dying", value: 1, duration: null },
      { name: "Unconscious", value: null, duration: null },
    ];
    const result = applyLongRest(draft, derived);
    expect(result.draft.play.hp).toBe(10);
    expect(result.draft.play.conditions).toEqual([]);
    expect(result.summary.removedConditions).toEqual(["Dying", "Unconscious"]);
  });

  it("leaves prepared spells, hero points, and XP untouched", () => {
    const result = applyLongRest(hero(5), derived);
    expect(result.draft.spells.prepared).toEqual(["spell:magic-missile"]);
    expect(result.draft.play.heroPoints).toBe(2);
    expect(result.draft.play.xp).toBe(450);
  });

  it("does not mutate the input draft", () => {
    const draft = hero(5);
    const before = JSON.stringify(draft);
    applyLongRest(draft, derived);
    expect(JSON.stringify(draft)).toBe(before);
  });
});
