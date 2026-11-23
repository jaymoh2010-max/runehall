import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { contextForDraft } from "../src/server/compendium";
import {
  addPreparedCantrip,
  canPrepareCantrip,
  computeCharacter,
  emptyCharacterDraft,
  knownCantripIds,
  preparedCantripIds,
  removePreparedCantrip,
} from "../src/shared/rules";
import { castSpell, spellCastOptions } from "../src/shared/spellcasting";
import type { Ancestry, Background, ClassData, Heritage, Spell } from "../src/shared/types";

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
const spells = read<Spell>("spells.json");

const human = byName(ancestries, "Human");
const skilledHuman = byName(heritages, "Skilled Human");
const acolyte = byName(backgrounds, "Acolyte");
const cleric = byName(classes, "Cleric");
const wizard = byName(classes, "Wizard");

function draftFor(classData: ClassData) {
  const draft = emptyCharacterDraft("Cantrip Test");
  draft.ancestryId = human.id;
  draft.heritageId = skilledHuman.id;
  draft.backgroundId = acolyte.id;
  draft.classId = classData.id;
  draft.keyAbility = classData.keyAbility[0] ?? "wis";
  return draft;
}

function cantripPool(count: number): Spell[] {
  return spells
    .filter((spell) => spell.rank === 0 && !spell.traits.includes("focus"))
    .slice(0, count);
}

describe("prepared cantrips", () => {
  it("falls back to the known list for legacy drafts", () => {
    const draft = draftFor(cleric);
    const context = contextForDraft(draft);
    const known = cantripPool(3);
    draft.spells.cantrips = known.map((spell) => spell.id);
    draft.spells.preparedCantrips = null;
    expect(knownCantripIds(draft, context)).toEqual(known.map((spell) => spell.id));
    expect(preparedCantripIds(draft, context)).toEqual(known.map((spell) => spell.id));
  });

  it("distinguishes an explicit empty prepared list from a legacy list", () => {
    const draft = draftFor(cleric);
    const context = contextForDraft(draft);
    draft.spells.cantrips = cantripPool(3).map((spell) => spell.id);
    draft.spells.preparedCantrips = [];
    expect(preparedCantripIds(draft, context)).toEqual([]);
  });

  it("caps a cleric at five prepared cantrips", () => {
    const draft = draftFor(cleric);
    const context = contextForDraft(draft);
    const pool = cantripPool(6);
    draft.spells.cantrips = pool.map((spell) => spell.id);
    draft.spells.preparedCantrips = pool.slice(0, 5).map((spell) => spell.id);
    expect(canPrepareCantrip(draft, context, pool[5]!)).toBe(false);
    const fewer = removePreparedCantrip(draft, context, pool[0]!.id);
    expect(canPrepareCantrip(fewer, context, pool[5]!)).toBe(true);
    const added = addPreparedCantrip(fewer, context, pool[5]!.id);
    expect(preparedCantripIds(added, context)).toHaveLength(5);
    expect(preparedCantripIds(added, context)).not.toContain(pool[0]!.id);
  });

  it("allows a wizard's extra curriculum cantrip beyond the normal five", () => {
    const draft = draftFor(wizard);
    const schoolGroup = wizard.choiceGroups.find((group) => group.tag === "wizard-arcane-school")!;
    draft.classChoices[schoolGroup.key] = ["cf:E4GZDMn4DYk6qSEV"];
    const context = contextForDraft(draft);
    const curriculum = computeCharacter(draft, context)
      .grantedSpells.filter((spell) => spell.kind === "curriculum" && spell.rank === 0)
      .map((spell) => spell.id);
    expect(curriculum.length).toBeGreaterThan(0);
    const regular = cantripPool(20)
      .filter((spell) => !curriculum.includes(spell.id))
      .map((spell) => spell.id);
    expect(regular.length).toBeGreaterThanOrEqual(5);
    draft.spells.cantrips = [...regular, ...curriculum];
    draft.spells.preparedCantrips = [...regular.slice(0, 5)];
    const extra = spells.find((spell) => spell.id === curriculum[0])!;
    expect(canPrepareCantrip(draft, context, extra)).toBe(true);
    const prepared = addPreparedCantrip(draft, context, extra.id);
    expect(preparedCantripIds(prepared, context)).toHaveLength(6);
    const unpreparedRegular = regular.find(
      (id) => !preparedCantripIds(prepared, context).includes(id)
    );
    expect(unpreparedRegular).toBeDefined();
    expect(
      canPrepareCantrip(
        prepared,
        context,
        spells.find((spell) => spell.id === unpreparedRegular)!
      )
    ).toBe(false);
  });

  it("offers a cantrip only when it is prepared for the day", () => {
    const draft = draftFor(cleric);
    const context = contextForDraft(draft);
    const [guidance, light] = cantripPool(2);
    draft.spells.cantrips = [guidance!.id, light!.id];
    draft.spells.preparedCantrips = [guidance!.id];

    expect(spellCastOptions(guidance!, draft, context)).toEqual([
      { rank: 1, resource: "cantrip", remaining: null, label: "Cantrip" },
    ]);
    expect(spellCastOptions(light!, draft, context)).toEqual([]);
    expect(castSpell(draft, light!, context, { rank: 1, resource: "cantrip" })).toBeNull();
    expect(castSpell(draft, guidance!, context, { rank: 1, resource: "cantrip" })?.draft).toBe(
      draft
    );
  });
});
