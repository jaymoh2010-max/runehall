import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  multiclassDedicationFor,
  multiclassProficiencyRank,
  multiclassSlotCounts,
} from "../src/shared/multiclass";
import { emptyCharacterDraft } from "../src/shared/rules";
import { contextForDraft } from "../src/server/compendium";
import { computeCharacter } from "../src/shared/rules";
import { spellCastOptions } from "../src/shared/spellcasting";
import type { ClassData, Spell } from "../src/shared/types";

function read<T>(file: string): T[] {
  return JSON.parse(fs.readFileSync(path.resolve("data", "compendium", file), "utf8")) as T[];
}

const classes = read<ClassData>("classes.json");
const spells = read<Spell>("spells.json");
const fighter = classes.find((entry) => entry.name === "Fighter")!;
const shield = spells.find((entry) => entry.name === "Shield")!;

describe("multiclass dedication cantrips", () => {
  it("recognizes fixed-tradition spellcasting dedications", () => {
    expect(multiclassDedicationFor([])).toBeNull();
    expect(multiclassDedicationFor(["feat:oQ6EZRFXbHWCx08C"])).toMatchObject({
      className: "Wizard",
      tradition: "arcane",
      ability: "int",
      cantripLimit: 2,
    });
    expect(multiclassDedicationFor(["feat:OW3W2vMARiojda7e"])).toMatchObject({
      className: "Psychic",
      cantripLimit: 1,
    });
    expect(multiclassDedicationFor(["feat:y0vdu6DGhKKElmE6"])).toMatchObject({
      className: "Witch",
      // The familiar knows two cantrips, but only one can be prepared each day.
      cantripLimit: 1,
    });
    expect(multiclassDedicationFor(["feat:5UQagWB13Z8xR5Z6"])).toMatchObject({
      className: "Sorcerer",
      tradition: null,
      variableTradition: true,
    });
    expect(multiclassDedicationFor(["feat:unknown"])).toBeNull();
  });

  it("derives basic, expert, and master archetype slots", () => {
    const none = { basic: false, expert: false, master: false };
    expect(multiclassSlotCounts(4, { ...none, basic: true })).toEqual([1, 0, 0, 0, 0, 0, 0, 0]);
    expect(multiclassSlotCounts(8, { ...none, basic: true })).toEqual([1, 1, 1, 0, 0, 0, 0, 0]);
    expect(multiclassSlotCounts(12, { basic: true, expert: true, master: false })).toEqual([
      1, 1, 1, 1, 0, 0, 0, 0,
    ]);
    expect(multiclassSlotCounts(18, { basic: true, expert: true, master: true })).toEqual([
      1, 1, 1, 1, 1, 1, 1, 0,
    ]);
    expect(multiclassSlotCounts(20, { basic: true, expert: true, master: true })).toEqual([
      1, 1, 1, 1, 1, 1, 1, 1,
    ]);
  });

  it("only promotes dedication proficiency when the expert or master feat is taken", () => {
    expect(multiclassProficiencyRank(12, { expert: false, master: false })).toBe(1);
    expect(multiclassProficiencyRank(12, { expert: true, master: false })).toBe(2);
    expect(multiclassProficiencyRank(18, { expert: true, master: false })).toBe(2);
    expect(multiclassProficiencyRank(18, { expert: true, master: true })).toBe(3);
  });

  it("keeps the dedication DC and attack at trained until Expert Spellcasting", () => {
    const base = emptyCharacterDraft("Dedicated Fighter");
    base.classId = fighter.id;
    base.keyAbility = "str";
    base.level = 12;
    base.feats.class["2"] = "feat:oQ6EZRFXbHWCx08C";
    base.feats.class["4"] = "feat:SHUfHzElHZPXJFiP";
    const trained = computeCharacter(base, contextForDraft(base));

    const expertDraft = structuredClone(base);
    expertDraft.feats.class["12"] = "feat:hpCBELEKGA4ynYv4";
    const expert = computeCharacter(expertDraft, contextForDraft(expertDraft));

    expect(expert.multiclassCaster?.spellDc).toBe((trained.multiclassCaster?.spellDc ?? 0) + 2);
    expect(expert.multiclassCaster?.spellAttack).toBe(
      (trained.multiclassCaster?.spellAttack ?? 0) + 2
    );
  });

  it("derives a separate spell DC for a dedication cantrip", () => {
    const draft = emptyCharacterDraft("Dedicated Fighter");
    draft.classId = fighter.id;
    draft.keyAbility = "str";
    draft.level = 4;
    draft.feats.class["2"] = "feat:oQ6EZRFXbHWCx08C";
    draft.feats.class["4"] = "feat:SHUfHzElHZPXJFiP";
    draft.spells.multiclassCantrips = [shield.id];
    const derived = computeCharacter(draft, contextForDraft(draft));
    expect(derived.multiclassCaster).toMatchObject({
      className: "Wizard",
      tradition: "arcane",
      ability: "int",
      cantripLimit: 2,
      spellSlots: [1, 0, 0, 0, 0, 0, 0, 0],
    });
    expect(derived.multiclassCaster?.spellDc).toBeTypeOf("number");
    expect(derived.multiclassCaster?.spellAttack).toBeTypeOf("number");
  });

  it("uses the higher qualifying ability for a Psychic dedication", () => {
    const draft = emptyCharacterDraft("Psychic Fighter");
    draft.classId = fighter.id;
    draft.keyAbility = "str";
    draft.level = 2;
    draft.feats.class["2"] = "feat:OW3W2vMARiojda7e";
    draft.boosts.free = ["cha", "cha", "int", "str"];
    const derived = computeCharacter(draft, contextForDraft(draft));
    expect(derived.multiclassCaster?.ability).toBe("cha");
    expect(derived.multiclassCaster?.spellDc).toBe(10 + 4 + derived.abilityMods.cha);
  });

  it("uses the chosen tradition for a variable-tradition dedication", () => {
    const draft = emptyCharacterDraft("Dedicated Sorcerer");
    draft.classId = fighter.id;
    draft.keyAbility = "str";
    draft.level = 2;
    draft.feats.class["2"] = "feat:5UQagWB13Z8xR5Z6";
    draft.spells.multiclassTradition = "occult";
    const derived = computeCharacter(draft, contextForDraft(draft));
    expect(derived.multiclassCaster).toMatchObject({
      className: "Sorcerer",
      tradition: "occult",
      variableTradition: true,
    });
  });

  it("warns when dedication spells exceed a per-rank slot", () => {
    const draft = emptyCharacterDraft("Ranked Dedication");
    draft.classId = fighter.id;
    draft.keyAbility = "str";
    draft.level = 6;
    draft.feats.class["2"] = "feat:oQ6EZRFXbHWCx08C";
    draft.feats.class["4"] = "feat:SHUfHzElHZPXJFiP";
    const rankTwo = spells
      .filter(
        (spell) =>
          spell.rank === 2 && spell.traditions.includes("arcane") && spell.id.startsWith("spell:")
      )
      .slice(0, 2);
    expect(rankTwo).toHaveLength(2);
    draft.spells.multiclassSpells = rankTwo.map((spell) => spell.id);
    const derived = computeCharacter(draft, contextForDraft(draft));
    expect(
      derived.validation.some((entry) => /rank 2 spell.*only 1 rank 2 slot/.test(entry.message))
    ).toBe(true);
  });

  it("offers every available dedication slot rank for heightening", () => {
    const draft = emptyCharacterDraft("Dedicated Wizard");
    draft.classId = fighter.id;
    draft.keyAbility = "str";
    draft.level = 8;
    draft.feats.class["2"] = "feat:oQ6EZRFXbHWCx08C";
    draft.feats.class["4"] = "feat:SHUfHzElHZPXJFiP";
    const context = contextForDraft(draft);
    const derived = computeCharacter(draft, context);
    const forceBarrage = spells.find((spell) => spell.name === "Force Barrage")!;
    const options = spellCastOptions(forceBarrage, draft, context, {
      multiclass: true,
      multiclassSlots: derived.multiclassCaster?.spellSlots ?? [],
      multiclassSlotsUsed: draft.spells.multiclassSlotsUsed,
    });
    expect(options.map((option) => option.rank)).toEqual([1, 2, 3]);
    expect(options.every((option) => option.resource === "multiclass")).toBe(true);
  });
});
