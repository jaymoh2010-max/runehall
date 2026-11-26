import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { contextForDraft } from "../src/server/compendium";
import {
  computeCharacter,
  emptyCharacterDraft,
  spellbookBudgetFor,
  spellbookUsage,
} from "../src/shared/rules";
import type { ClassData, Spell } from "../src/shared/types";

function read<T>(file: string): T[] {
  return JSON.parse(fs.readFileSync(path.resolve("data", "compendium", file), "utf8")) as T[];
}

const classes = read<ClassData>("classes.json");
const spells = read<Spell>("spells.json");
const byName = <T extends { name: string }>(items: T[], name: string): T => {
  const found = items.find((item) => item.name === name);
  if (!found) throw new Error(`Missing ${name}`);
  return found;
};

const spellbookClasses = {
  Wizard: { cantrips: 10, ranked: 5 },
  Magus: { cantrips: 8, ranked: 5 },
  Witch: { cantrips: 10, ranked: 5 },
  Necromancer: { cantrips: 8, ranked: 5 },
} as const;

function wizardDraft(level = 1) {
  const wizard = byName(classes, "Wizard");
  const draft = emptyCharacterDraft("Spellbook Test");
  draft.classId = wizard.id;
  draft.keyAbility = "int";
  draft.level = level;
  const school = wizard.choiceGroups.find((group) => group.tag === "wizard-arcane-school")!;
  draft.classChoices[school.key] = ["cf:E4GZDMn4DYk6qSEV"];
  return { draft, wizard };
}

describe("spellbook budgets", () => {
  it("uses the class starting counts and two free spells per level", () => {
    for (const [name, expected] of Object.entries(spellbookClasses)) {
      const classData = byName(classes, name);
      expect(spellbookBudgetFor(classData, 1), name).toMatchObject({
        startingCantrips: expected.cantrips,
        cantrips: expected.cantrips,
        startingRanked: expected.ranked,
        ranked: expected.ranked,
        perLevel: 2,
      });
      expect(spellbookBudgetFor(classData, 5), name).toMatchObject({
        ranked: expected.ranked + 8,
      });
    }
    expect(spellbookBudgetFor(byName(classes, "Cleric"), 5)).toBeNull();
  });

  it("counts free picks while excluding granted and paid spells", () => {
    const { draft, wizard } = wizardDraft();
    const cantrips = [
      "Detect Magic",
      "Light",
      "Daze",
      "Message",
      "Prestidigitation",
      "Sigil",
      "Electric Arc",
      "Frostbite",
      "Figment",
      "Tangle Vine",
    ].map((name) => byName(spells, name).id);
    const ranked = ["Fear", "Command", "Sleep", "Charm", "Dizzying Colors"].map(
      (name) => byName(spells, name).id
    );
    draft.spells.cantrips = cantrips;
    draft.spells.known = ranked;
    const context = contextForDraft(draft);
    const usage = spellbookUsage(draft, wizard, context.spells, context.deity)!;
    expect(usage).toMatchObject({
      freeCantrips: 10,
      freeRanked: 5,
      overCantrips: 0,
      overRanked: 0,
      learnedCantrips: 0,
      learnedRanked: 0,
    });

    draft.spells.known = [...ranked, byName(spells, "Force Barrage").id];
    const withCurriculum = spellbookUsage(draft, wizard, context.spells, context.deity)!;
    expect(withCurriculum.freeRanked).toBe(5);
    expect(withCurriculum.grantedRanked).toBe(3);

    draft.spells.learned = [ranked[0]];
    const withPaid = spellbookUsage(draft, wizard, context.spells, context.deity)!;
    expect(withPaid.freeRanked).toBe(4);
    expect(withPaid.learnedRanked).toBe(1);
  });

  it("warns when free picks exceed the level budget", () => {
    const { draft } = wizardDraft(2);
    draft.spells.known = [
      "Fear",
      "Command",
      "Sleep",
      "Charm",
      "Dizzying Colors",
      "Heal",
      "Bless",
      "Grease",
      "Runic Weapon",
    ].map((name) => byName(spells, name).id);
    const derived = computeCharacter(draft, contextForDraft(draft));
    expect(
      derived.validation.some(
        (issue) => issue.severity === "warning" && /free spellbook spells/.test(issue.message)
      )
    ).toBe(true);
  });
});
