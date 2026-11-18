import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { computeCharacter, emptyCharacterDraft } from "../src/shared/rules";
import type {
  Ancestry,
  Background,
  CharacterContext,
  ClassData,
  Equipment,
} from "../src/shared/types";

function read<T>(file: string): T[] {
  return JSON.parse(fs.readFileSync(path.resolve("data", "compendium", file), "utf8")) as T[];
}

const ancestries = read<Ancestry>("ancestries.json");
const backgrounds = read<Background>("backgrounds.json");
const classes = read<ClassData>("classes.json");
const equipment = read<Equipment>("equipment.json");

function byName<T extends { name: string }>(items: T[], name: string): T {
  const found = items.find((item) => item.name === name);
  if (!found) throw new Error(`Missing ${name}`);
  return found;
}

const human = byName(ancestries, "Human");
const warrior = byName(backgrounds, "Warrior");
const scholar = byName(backgrounds, "Scholar");
const fighter = byName(classes, "Fighter");
const wizard = byName(classes, "Wizard");
const rogue = byName(classes, "Rogue");
const chainMail = byName(equipment, "Chain Mail");
const longsword = byName(equipment, "Longsword");
const steelShield = byName(equipment, "Steel Shield");

function contextFor(
  background: Background,
  classData: ClassData,
  items: Equipment[] = []
): CharacterContext {
  return {
    ancestry: human,
    background,
    classData,
    feats: {},
    spells: {},
    equipment: Object.fromEntries(items.map((item) => [item.id, item])),
  };
}

/**
 * These fixtures pin the derived math for representative level-1 builds. They
 * intentionally do not assert build legality; rules.test.ts covers that side.
 * If a fixture changes, inspect whether the rules engine or the compendium
 * changed before updating the expected numbers.
 */
describe("golden sheets", () => {
  it("level 1 fighter with chain mail, longsword, and shield", () => {
    const draft = emptyCharacterDraft("Golden Fighter");
    draft.ancestryId = human.id;
    draft.backgroundId = warrior.id;
    draft.classId = fighter.id;
    draft.keyAbility = "str";
    draft.boosts.ancestry = ["str", "dex"];
    draft.boosts.background = ["str", "con"];
    draft.boosts.free = ["str", "dex", "con", "wis"];
    draft.skills.trained = ["athletics", "acrobatics"];
    draft.equipment = [
      { itemId: chainMail.id, quantity: 1, equipped: true },
      { itemId: longsword.id, quantity: 1, equipped: true },
      { itemId: steelShield.id, quantity: 1, equipped: true },
    ];

    const derived = computeCharacter(
      draft,
      contextFor(warrior, fighter, [chainMail, longsword, steelShield])
    );

    expect(derived.abilities).toEqual({
      str: 18,
      dex: 14,
      con: 14,
      int: 10,
      wis: 12,
      cha: 10,
    });
    expect(derived.maxHp).toBe(20);
    expect(derived.ac).toBe(18);
    expect(derived.saves).toEqual({ fortitude: 7, reflex: 7, will: 4 });
    expect(derived.perception).toBe(6);
    expect(derived.classDc).toBe(17);
    expect(derived.attacks.find((attack) => attack.name === "Longsword")?.attackBonus).toBe(9);
    expect(derived.skills.find((skill) => skill.id === "athletics")?.mod).toBe(7);
  });

  it("folds status and circumstance conditions into the fighter's math", () => {
    const draft = emptyCharacterDraft("Conditioned Fighter");
    draft.ancestryId = human.id;
    draft.backgroundId = warrior.id;
    draft.classId = fighter.id;
    draft.keyAbility = "str";
    draft.boosts.ancestry = ["str", "dex"];
    draft.boosts.background = ["str", "con"];
    draft.boosts.free = ["str", "dex", "con", "wis"];
    draft.skills.trained = ["athletics", "acrobatics"];
    draft.equipment = [
      { itemId: chainMail.id, quantity: 1, equipped: true },
      { itemId: longsword.id, quantity: 1, equipped: true },
      { itemId: steelShield.id, quantity: 1, equipped: true },
    ];
    draft.play.conditions = [
      { name: "Frightened", value: 2, duration: null },
      { name: "Clumsy", value: 1, duration: null },
      { name: "Off-Guard", value: null, duration: null },
      { name: "Drained", value: 1, duration: null },
    ];

    const derived = computeCharacter(
      draft,
      contextFor(warrior, fighter, [chainMail, longsword, steelShield])
    );

    expect(derived.maxHp).toBe(19);
    expect(derived.ac).toBe(14);
    expect(derived.saves).toEqual({ fortitude: 5, reflex: 5, will: 2 });
    expect(derived.perception).toBe(4);
    expect(derived.classDc).toBe(15);
    expect(derived.attacks.find((attack) => attack.name === "Longsword")?.attackBonus).toBe(7);
    expect(derived.skills.find((skill) => skill.id === "athletics")?.mod).toBe(5);
    expect(derived.conditionEffects.notes.length).toBeGreaterThan(0);
  });

  it("level 1 wizard with Intelligence spellcasting", () => {
    const draft = emptyCharacterDraft("Golden Wizard");
    draft.ancestryId = human.id;
    draft.backgroundId = scholar.id;
    draft.classId = wizard.id;
    draft.keyAbility = "int";
    draft.boosts.ancestry = ["int", "dex"];
    draft.boosts.background = ["int", "wis"];
    draft.boosts.free = ["int", "dex", "con", "wis"];
    draft.skills.trained = ["arcana", "occultism"];

    const derived = computeCharacter(draft, contextFor(scholar, wizard));

    expect(derived.abilities).toEqual({
      str: 10,
      dex: 14,
      con: 12,
      int: 18,
      wis: 14,
      cha: 10,
    });
    expect(derived.maxHp).toBe(15);
    expect(derived.ac).toBe(15);
    expect(derived.saves).toEqual({ fortitude: 4, reflex: 5, will: 7 });
    expect(derived.perception).toBe(5);
    expect(derived.spellDc).toBe(17);
    expect(derived.spellAttack).toBe(7);
    expect(derived.spellSlots).toEqual([3]);
    expect(derived.skills.find((skill) => skill.id === "arcana")?.mod).toBe(7);
  });

  it("level 1 rogue with Dexterity skills", () => {
    const draft = emptyCharacterDraft("Golden Rogue");
    draft.ancestryId = human.id;
    draft.backgroundId = warrior.id;
    draft.classId = rogue.id;
    draft.keyAbility = "dex";
    draft.boosts.ancestry = ["dex", "con"];
    draft.boosts.background = ["str", "con"];
    draft.boosts.free = ["dex", "con", "wis", "cha"];
    draft.skills.trained = ["stealth", "thievery", "acrobatics", "athletics"];

    const derived = computeCharacter(draft, contextFor(warrior, rogue));

    expect(derived.abilities).toEqual({
      str: 12,
      dex: 16,
      con: 16,
      int: 10,
      wis: 12,
      cha: 12,
    });
    expect(derived.maxHp).toBe(19);
    expect(derived.ac).toBe(16);
    expect(derived.saves).toEqual({ fortitude: 6, reflex: 8, will: 6 });
    expect(derived.perception).toBe(6);
    expect(derived.classDc).toBe(16);
    expect(derived.skills.find((skill) => skill.id === "stealth")?.mod).toBe(6);
    expect(derived.skills.find((skill) => skill.id === "thievery")?.mod).toBe(6);
  });
});
