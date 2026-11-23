import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { contextForDraft } from "../src/server/compendium";
import {
  addStudiousSpell,
  canPrepareStudiousSpell,
  computeCharacter,
  emptyCharacterDraft,
  removeStudiousSpell,
  studiousSlotInfoFor,
} from "../src/shared/rules";
import { MAGUS_STUDIOUS_BY_STUDY } from "../src/shared/classGrants";
import {
  canRestoreSpellUse,
  castSpell,
  restoreSpellUse,
  spellCastOptions,
} from "../src/shared/spellcasting";
import type { ClassData, Spell } from "../src/shared/types";

function read<T>(file: string): T[] {
  return JSON.parse(fs.readFileSync(path.resolve("data", "compendium", file), "utf8")) as T[];
}

function byName<T extends { name: string }>(items: T[], name: string): T {
  const found = items.find((item) => item.name === name);
  if (!found) throw new Error(`Missing ${name}`);
  return found;
}

const classes = read<ClassData>("classes.json");
const spells = read<Spell>("spells.json");
const magus = byName(classes, "Magus");
const geckoGrip = byName(spells, "Gecko Grip");

function magusDraft(level: number) {
  const draft = emptyCharacterDraft("Studious Magus");
  draft.level = level;
  draft.classId = magus.id;
  draft.keyAbility = "int";
  const study = magus.choiceGroups.find((group) => group.tag === "magus-hybrid-study")!;
  // Inexorable Iron: Enlarge (7th), Earthbind (11th), Planar Tether (13th).
  draft.classChoices[study.key] = ["cf:ZslXrvYRxHBXc1Ds"];
  return draft;
}

describe("magus studious spells", () => {
  it("keeps every hybrid-study studious spell resolvable", () => {
    const study = magus.choiceGroups.find((group) => group.tag === "magus-hybrid-study")!;
    const optionIds = new Set(study.options.map((option) => option.id));
    for (const [optionId, tiers] of Object.entries(MAGUS_STUDIOUS_BY_STUDY)) {
      expect(optionIds.has(optionId)).toBe(true);
      for (const entry of Object.values(tiers)) {
        if (!entry) continue;
        const spell = spells.find((candidate) => candidate.id === entry.id);
        expect(spell, `${entry.name} (${entry.id})`).toBeTruthy();
        expect(spell!.name).toBe(entry.name);
        expect(spell!.rank).toBe(entry.rank);
      }
    }
  });

  it("scales the special slots and their allowed spell list", () => {
    const level7 = magusDraft(7);
    const info7 = studiousSlotInfoFor(level7, magus)!;
    expect(info7.rank).toBe(2);
    expect(info7.count).toBe(2);
    expect(info7.spells.map((spell) => spell.name)).toEqual(
      expect.arrayContaining(["Gecko Grip", "Enlarge"])
    );
    expect(info7.spells.map((spell) => spell.name)).not.toContain("Haste");

    const level11 = magusDraft(11);
    const info11 = studiousSlotInfoFor(level11, magus)!;
    expect(info11.rank).toBe(3);
    expect(info11.spells.map((spell) => spell.name)).toEqual(
      expect.arrayContaining(["Gecko Grip", "Enlarge", "Haste", "Earthbind"])
    );

    const level13 = magusDraft(13);
    const info13 = studiousSlotInfoFor(level13, magus)!;
    expect(info13.rank).toBe(4);
    expect(info13.spells.map((spell) => spell.name)).toEqual(
      expect.arrayContaining([
        "Gecko Grip",
        "Enlarge",
        "Haste",
        "Earthbind",
        "Fly",
        "Planar Tether",
      ])
    );
  });

  it("caps preparation at two studious copies and only allows the list", () => {
    const draft = magusDraft(7);
    const prepared = addStudiousSpell(draft, magus, geckoGrip.id);
    const twice = addStudiousSpell(prepared, magus, geckoGrip.id);
    expect(twice.spells.studiousPrepared).toEqual([geckoGrip.id, geckoGrip.id]);
    expect(canPrepareStudiousSpell(twice, magus, geckoGrip.id)).toBe(false);

    const other = byName(spells, "Haste");
    expect(canPrepareStudiousSpell(draft, magus, other.id)).toBe(false);

    const removed = removeStudiousSpell(twice, magus, geckoGrip.id);
    expect(removed.spells.studiousPrepared).toEqual([geckoGrip.id]);
  });

  it("offers and spends studious resources separately from ordinary slots", () => {
    const draft = magusDraft(7);
    let current = addStudiousSpell(
      addStudiousSpell(draft, magus, geckoGrip.id),
      magus,
      geckoGrip.id
    );
    const context = contextForDraft(current);
    const derived = computeCharacter(current, context);
    expect(derived.studiousSlots?.rank).toBe(2);
    expect(spellCastOptions(geckoGrip, current, context)).toEqual([
      { rank: 2, resource: "studious", remaining: 2, label: "Studious slot" },
    ]);

    const first = castSpell(current, geckoGrip, context, { rank: 2, resource: "studious" });
    expect(first?.draft.spells.studiousUsed).toEqual({ [geckoGrip.id]: 1 });
    expect(first?.draft.spells.slotsUsed).toEqual({});
    expect(canRestoreSpellUse(first!.draft, geckoGrip, { rank: 2, resource: "studious" })).toBe(
      true
    );
    current = first!.draft;
    const second = castSpell(current, geckoGrip, context, { rank: 2, resource: "studious" });
    expect(second?.draft.spells.studiousUsed).toEqual({ [geckoGrip.id]: 2 });
    expect(
      castSpell(second!.draft, geckoGrip, context, { rank: 2, resource: "studious" })
    ).toBeNull();

    const restored = restoreSpellUse(second!.draft, geckoGrip, context, {
      rank: 2,
      resource: "studious",
    });
    expect(restored?.spells.studiousUsed).toEqual({ [geckoGrip.id]: 1 });
    expect(
      castSpell(restored!, geckoGrip, context, { rank: 2, resource: "studious" })
    ).not.toBeNull();
  });
});
