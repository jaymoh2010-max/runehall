import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  addSpellFormulas,
  cantripCastRank,
  castSpell,
  defaultSpellActions,
  focusCastRank,
  scaleSpellFormula,
  spellActionVariants,
  spellCastOptionAvailable,
  spellCastOptions,
  spellDamageAtRank,
} from "../src/shared/spellcasting";
import { emptyCharacterDraft } from "../src/shared/rules";
import type {
  Ancestry,
  Background,
  CharacterContext,
  ClassData,
  Deity,
  Heritage,
  Spell,
} from "../src/shared/types";

function read<T>(file: string): T[] {
  return JSON.parse(fs.readFileSync(path.resolve("data", "compendium", file), "utf8")) as T[];
}

function byName<T extends { name: string }>(items: T[], name: string): T {
  const found = items.find((item) => item.name === name);
  if (!found) throw new Error(`Missing ${name}`);
  return found;
}

const ancestries = read<Ancestry>("ancestries.json");
const heritages = read<Heritage>("heritages.json");
const backgrounds = read<Background>("backgrounds.json");
const classes = read<ClassData>("classes.json");
const deities = read<Deity>("deities.json");
const spells = read<Spell>("spells.json");

const human = byName(ancestries, "Human");
const skilledHuman = byName(heritages, "Skilled Human");
const acolyte = byName(backgrounds, "Acolyte");
const cleric = byName(classes, "Cleric");
const wizard = byName(classes, "Wizard");
const sorcerer = byName(classes, "Sorcerer");
const abadar = byName(deities, "Abadar");

const heal = byName(spells, "Heal");
const harm = byName(spells, "Harm");
const bless = byName(spells, "Bless");
const fireball = byName(spells, "Fireball");
const ignition = byName(spells, "Ignition");
const telekineticProjectile = byName(spells, "Telekinetic Projectile");
const forceBolt = byName(spells, "Force Bolt");
const forceBarrage = byName(spells, "Force Barrage");
const fear = byName(spells, "Fear");
const liveWire = byName(spells, "Live Wire");
const thunderstrike = byName(spells, "Thunderstrike");
const breathOfLife = byName(spells, "Breath of Life");
const shield = byName(spells, "Shield");

function draftFor(classData: ClassData) {
  const draft = emptyCharacterDraft("Cast Test");
  draft.ancestryId = human.id;
  draft.heritageId = skilledHuman.id;
  draft.backgroundId = acolyte.id;
  draft.classId = classData.id;
  draft.keyAbility = classData.keyAbility[0] ?? "wis";
  return draft;
}

function contextFor(classData: ClassData, list: Spell[], deity: Deity | null = null) {
  const map = Object.fromEntries(list.map((spell) => [spell.id, spell]));
  return {
    ancestry: human,
    heritage: skilledHuman,
    background: acolyte,
    classData,
    deity,
    feats: {},
    spells: map,
    equipment: {},
  } satisfies CharacterContext;
}

function repeat(id: string, count: number): string[] {
  return Array.from({ length: count }, () => id);
}

describe("spell casting", () => {
  it("computes cantrip and focus cast ranks", () => {
    expect(cantripCastRank(1)).toBe(1);
    expect(cantripCastRank(4)).toBe(2);
    expect(cantripCastRank(5)).toBe(3);
    expect(cantripCastRank(20)).toBe(10);
    expect(focusCastRank(1, 1)).toBe(1);
    expect(focusCastRank(1, 5)).toBe(3);
    expect(focusCastRank(3, 1)).toBe(3);
  });

  it("spends divine font first for prepared Heal copies", () => {
    const draft = draftFor(cleric);
    const context = contextFor(cleric, [heal, harm, bless], abadar);
    draft.spells.prepared = repeat(heal.id, 4);

    let options = spellCastOptions(heal, draft, context, { focusPointsMax: 0 });
    expect(options).toEqual([{ rank: 1, resource: "font", remaining: 4, label: "Divine font" }]);

    let current = draft;
    for (let index = 0; index < 4; index += 1) {
      const result = castSpell(current, heal, context, { rank: 1, resource: "font" });
      expect(result).not.toBeNull();
      current = result!.draft;
    }
    expect(current.spells.divineFontUsed).toBe(4);
    expect(current.spells.fontUsed).toEqual({ [heal.id]: 4 });
    expect(current.spells.slotsUsed).toEqual({});
    expect(current.spells.prepared).toEqual(draft.spells.prepared);

    options = spellCastOptions(heal, current, context, { focusPointsMax: 0 });
    expect(options).toEqual([{ rank: 1, resource: "font", remaining: 0, label: "Divine font" }]);
    expect(castSpell(current, heal, context, { rank: 1, resource: "font" })).toBeNull();
  });

  it("spills surplus Heal copies into ordinary slots after font is full", () => {
    const draft = draftFor(cleric);
    const context = contextFor(cleric, [heal], abadar);
    draft.spells.prepared = repeat(heal.id, 6);
    draft.spells.divineFontUsed = 4;

    const options = spellCastOptions(heal, draft, context, { focusPointsMax: 0 });
    expect(options).toEqual([{ rank: 1, resource: "slot", remaining: 2, label: "Rank 1 slot" }]);
    const result = castSpell(draft, heal, context, { rank: 1, resource: "slot" });
    expect(result?.draft.spells.slotsUsed).toEqual({ "1": 1 });
    expect(result?.draft.spells.preparedUsed).toEqual({ [`1:${heal.id}`]: 1 });
    expect(result?.draft.spells.divineFontUsed).toBe(4);
  });

  it("spends ordinary slots for non-font prepared spells and stops when full", () => {
    const draft = draftFor(cleric);
    const context = contextFor(cleric, [bless], abadar);
    draft.spells.prepared = repeat(bless.id, 2);

    let options = spellCastOptions(bless, draft, context, { focusPointsMax: 0 });
    expect(options).toEqual([{ rank: 1, resource: "slot", remaining: 2, label: "Rank 1 slot" }]);
    let current = draft;
    for (let index = 0; index < 2; index += 1) {
      const result = castSpell(current, bless, context, { rank: 1, resource: "slot" });
      expect(result).not.toBeNull();
      current = result!.draft;
    }
    expect(current.spells.slotsUsed).toEqual({ "1": 2 });
    expect(current.spells.preparedUsed).toEqual({ [`1:${bless.id}`]: 2 });
    options = spellCastOptions(bless, current, context, { focusPointsMax: 0 });
    expect(spellCastOptionAvailable(options[0])).toBe(false);
    expect(castSpell(current, bless, context, { rank: 1, resource: "slot" })).toBeNull();
  });

  it("requires prepared spells for prepared casters", () => {
    const draft = draftFor(wizard);
    const context = contextFor(wizard, [fireball]);
    draft.level = 5;
    draft.spells.known = [fireball.id];

    expect(spellCastOptions(fireball, draft, context)).toEqual([]);
    expect(castSpell(draft, fireball, context, { rank: 3, resource: "slot" })).toBeNull();

    draft.spells.prepared = [fireball.id];
    const options = spellCastOptions(fireball, draft, context);
    expect(options).toEqual([{ rank: 3, resource: "slot", remaining: 1, label: "Rank 3 slot" }]);
    const result = castSpell(draft, fireball, context, { rank: 3, resource: "slot" });
    expect(result?.draft.spells.slotsUsed).toEqual({ "3": 1 });
    expect(result?.draft.spells.preparedUsed).toEqual({ [`3:${fireball.id}`]: 1 });
    expect(castSpell(result!.draft, fireball, context, { rank: 3, resource: "slot" })).toBeNull();
  });

  it("only heightens spontaneous spells that are signatures", () => {
    const draft = draftFor(sorcerer);
    const context = contextFor(sorcerer, [fireball]);
    draft.level = 9;
    draft.spells.known = [fireball.id];

    expect(spellCastOptions(fireball, draft, context).map((entry) => entry.rank)).toEqual([3]);

    draft.spells.signature = [fireball.id];
    const options = spellCastOptions(fireball, draft, context);
    expect(options.map((entry) => entry.rank)).toEqual([3, 4, 5]);
    expect(options.every((entry) => entry.resource === "slot")).toBe(true);

    const rankFive = castSpell(draft, fireball, context, { rank: 5, resource: "slot" });
    expect(rankFive?.draft.spells.slotsUsed).toEqual({ "5": 1 });
  });

  it("spends and gates focus points", () => {
    const draft = draftFor(wizard);
    const context = contextFor(wizard, [forceBolt]);
    draft.level = 5;
    draft.spells.focus = [forceBolt.id];
    draft.play.focusPoints = 1;

    const options = spellCastOptions(forceBolt, draft, context, {
      focus: true,
      focusPointsMax: 1,
    });
    expect(options).toEqual([{ rank: 3, resource: "focus", remaining: 1, label: "Focus point" }]);

    const result = castSpell(
      draft,
      forceBolt,
      context,
      { rank: 3, resource: "focus" },
      {
        focus: true,
        focusPointsMax: 1,
      }
    );
    expect(result?.draft.play.focusPoints).toBe(0);
    expect(result?.draft.spells.slotsUsed).toEqual({});
    expect(
      castSpell(
        result!.draft,
        forceBolt,
        context,
        { rank: 3, resource: "focus" },
        {
          focus: true,
          focusPointsMax: 1,
        }
      )
    ).toBeNull();
  });

  it("clamps focus points below the derived maximum", () => {
    const draft = draftFor(cleric);
    const context = contextFor(cleric, [forceBolt]);
    draft.spells.focus = [forceBolt.id];
    draft.play.focusPoints = 1;

    const options = spellCastOptions(forceBolt, draft, context, {
      focus: true,
      focusPointsMax: 0,
    });
    expect(options[0].remaining).toBe(0);
    expect(
      castSpell(
        draft,
        forceBolt,
        context,
        { rank: 1, resource: "focus" },
        {
          focus: true,
          focusPointsMax: 0,
        }
      )
    ).toBeNull();
  });

  it("does not spend resources for cantrips", () => {
    const draft = draftFor(wizard);
    const context = contextFor(wizard, [telekineticProjectile]);
    draft.level = 5;
    draft.spells.cantrips = [telekineticProjectile.id];

    const options = spellCastOptions(telekineticProjectile, draft, context);
    expect(options).toEqual([{ rank: 3, resource: "cantrip", remaining: null, label: "Cantrip" }]);
    const result = castSpell(draft, telekineticProjectile, context, {
      rank: 3,
      resource: "cantrip",
    });
    expect(result?.draft).toBe(draft);
  });

  it("scales structured interval damage and cantrip baselines", () => {
    expect(spellDamageAtRank(fireball, 5).parts).toEqual([{ formula: "10d6", type: "fire" }]);
    expect(spellDamageAtRank(ignition, 3).parts).toEqual([{ formula: "4d4", type: "fire" }]);
    expect(spellDamageAtRank(telekineticProjectile, 1).parts).toEqual([
      { formula: "2d6", type: "untyped" },
    ]);
    expect(spellDamageAtRank(forceBolt, 3).parts).toEqual([{ formula: "2d4+2", type: "force" }]);
  });

  it("keeps base damage types for multi-part heightening", () => {
    expect(spellDamageAtRank(liveWire, 3).parts).toEqual([
      { formula: "2d4", type: "slashing" },
      { formula: "2d4", type: "electricity" },
    ]);
    expect(spellDamageAtRank(thunderstrike, 3).parts).toEqual([
      { formula: "3d12", type: "electricity" },
      { formula: "3d4", type: "sonic" },
    ]);
  });

  it("keeps unsafe or prose-only heightening manual", () => {
    expect(spellDamageAtRank(heal, 3)).toMatchObject({
      supported: false,
      reason: "variable-actions",
      parts: [{ formula: "1d8", type: "vitality" }],
    });
    expect(spellDamageAtRank(forceBarrage, 3)).toMatchObject({
      supported: false,
      reason: "no-heightening",
    });
    expect(spellDamageAtRank(fear, 3)).toMatchObject({
      supported: false,
      reason: "no-base-damage",
      parts: [],
    });
    expect(spellDamageAtRank(breathOfLife, 9)).toMatchObject({
      supported: false,
      reason: "data-conflict",
    });
    expect(spellDamageAtRank(shield, 5)).toMatchObject({
      supported: false,
      reason: "no-base-damage",
    });
  });

  it("combines and scales formulas safely", () => {
    expect(scaleSpellFormula("2d6", 2)).toBe("4d6");
    expect(scaleSpellFormula("1d4+1", 1)).toBe("1d4+1");
    expect(scaleSpellFormula("1d4+1", 2)).toBe("2d4+2");
    expect(scaleSpellFormula("4", 3)).toBe("12");
    expect(scaleSpellFormula("1d4+1 persistent", 2)).toBeNull();
    expect(addSpellFormulas("6d6", "4d6")).toBe("10d6");
    expect(addSpellFormulas("1d4+1", "1d4+1")).toBe("2d4+2");
    expect(addSpellFormulas("4", "1d6+2")).toBe("1d6+6");
  });

  it("builds Heal and Harm action variants with rank scaling", () => {
    const rankOne = spellActionVariants(heal, 1);
    expect(rankOne.map((variant) => [variant.actions, variant.formula, variant.note])).toEqual([
      [1, "1d8", "Touch"],
      [2, "1d8+8", "30 feet"],
      [3, "1d8", "30-ft emanation"],
    ]);
    expect(rankOne.every((variant) => variant.healing && variant.type === "vitality")).toBe(true);

    expect(spellActionVariants(heal, 3).map((variant) => variant.formula)).toEqual([
      "3d8",
      "3d8+24",
      "3d8",
    ]);
    expect(spellActionVariants(harm, 3).map((variant) => variant.formula)).toEqual([
      "3d8",
      "3d8+24",
      "3d8",
    ]);
    expect(spellActionVariants(harm, 3).every((variant) => !variant.healing)).toBe(true);
    expect(spellActionVariants(harm, 3)[0].type).toBe("void");
    expect(defaultSpellActions(heal)).toBe(2);
    expect(defaultSpellActions(harm)).toBe(2);
  });

  it("builds Force Barrage shard variants on its +2 heightening", () => {
    expect(
      spellActionVariants(forceBarrage, 1).map((variant) => [variant.actions, variant.formula])
    ).toEqual([
      [1, "1d4+1"],
      [2, "2d4+2"],
      [3, "3d4+3"],
    ]);
    expect(
      spellActionVariants(forceBarrage, 3).map((variant) => [variant.actions, variant.formula])
    ).toEqual([
      [1, "2d4+2"],
      [2, "4d4+4"],
      [3, "6d4+6"],
    ]);
    expect(
      spellActionVariants(forceBarrage, 5).map((variant) => [variant.actions, variant.formula])
    ).toEqual([
      [1, "3d4+3"],
      [2, "6d4+6"],
      [3, "9d4+9"],
    ]);
    expect(defaultSpellActions(forceBarrage)).toBe(1);
    expect(spellActionVariants(fireball, 5)).toEqual([]);
  });
});
