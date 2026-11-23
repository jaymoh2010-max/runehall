import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { contextForDraft } from "../src/server/compendium";
import { ANIMIST_APPARITIONS } from "../src/shared/apparitions";
import {
  addAttunedApparition,
  animistApparitionInfo,
  canAttuneApparition,
  computeCharacter,
  emptyCharacterDraft,
  removeAttunedApparition,
  setPrimaryApparition,
} from "../src/shared/rules";
import { applyLongRest } from "../src/shared/rest";
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
const animist = byName(classes, "Animist");
const witness = ANIMIST_APPARITIONS.find((entry) => entry.name === "Witness to Ancient Battles")!;
const steward = ANIMIST_APPARITIONS.find((entry) => entry.name === "Steward of Stone and Fire")!;
const sureStrike = byName(spells, "Sure Strike");
const shield = byName(spells, "Shield");
const enlarge = byName(spells, "Enlarge");
const fireball = byName(spells, "Fireball");
const heal = byName(spells, "Heal");

function animistDraft(level: number, apparitions = [witness.id, steward.id]) {
  const draft = emptyCharacterDraft("Apparition Animist");
  draft.level = level;
  draft.classId = animist.id;
  draft.keyAbility = "wis";
  draft.spells.tradition = "divine";
  draft.spells.attunedApparitions = apparitions;
  draft.spells.primaryApparition = apparitions[0] ?? null;
  return draft;
}

describe("animist prepared and apparition spellcasting", () => {
  it("keeps prepared and apparition slots separate across levels", () => {
    for (const [level, prepared, apparition] of [
      [1, [1], [1]],
      [3, [2, 1], [1, 1]],
      [10, [2, 2, 2, 2, 2], [2, 2, 2, 1, 1]],
      [19, [2, 2, 2, 2, 2, 2, 2, 2, 2], [2, 2, 2, 2, 2, 2, 2, 2, 1, 1]],
    ] as const) {
      const draft = animistDraft(level);
      const derived = computeCharacter(draft, contextForDraft(draft));
      expect(derived.spellSlots).toEqual(prepared);
      expect(derived.animistApparitions?.slots).toEqual(apparition);
    }
  });

  it("builds the attuned apparition repertoire up to the current apparition rank", () => {
    const level1 = animistDraft(1);
    const info1 = animistApparitionInfo(level1, contextForDraft(level1))!;
    const names1 = info1.repertoire.map((entry) => entry.spell.name);
    expect(names1).toEqual(expect.arrayContaining(["Shield", "Sure Strike", "Ignition"]));
    expect(names1).toContain("Interposing Earth");
    expect(names1).not.toContain("Enlarge");
    expect(names1).not.toContain("Fireball");
    expect(info1.maxAttuned).toBe(2);
    expect(info1.attuned).toHaveLength(2);

    const level3 = animistDraft(3);
    const info3 = animistApparitionInfo(level3, contextForDraft(level3))!;
    expect(info3.repertoire.map((entry) => entry.spell.name)).toEqual(
      expect.arrayContaining(["Enlarge", "Exploding Earth"])
    );
    expect(info3.repertoire.map((entry) => entry.spell.name)).not.toContain("Fireball");

    const level7 = animistDraft(7);
    const info7 = animistApparitionInfo(level7, contextForDraft(level7))!;
    expect(info7.repertoire.map((entry) => entry.spell.name)).toEqual(
      expect.arrayContaining(["Weapon Storm", "Wall of Fire"])
    );
    expect(info7.maxAttuned).toBe(3);
  });

  it("casts apparition spells from their own slots and restores them", () => {
    const draft = animistDraft(3);
    const context = contextForDraft(draft);
    const options = spellCastOptions(sureStrike, draft, context);
    expect(options).toEqual([
      { rank: 1, resource: "apparition", remaining: 1, label: "Apparition slot" },
      { rank: 2, resource: "apparition", remaining: 1, label: "Apparition slot" },
    ]);

    const first = castSpell(draft, sureStrike, context, { rank: 1, resource: "apparition" });
    expect(first?.draft.spells.apparitionUsed).toEqual({ "1": 1 });
    expect(first?.draft.spells.slotsUsed).toEqual({});
    expect(first?.draft.spells.preparedUsed).toEqual({});

    const second = castSpell(first!.draft, sureStrike, context, {
      rank: 2,
      resource: "apparition",
    });
    expect(second?.draft.spells.apparitionUsed).toEqual({ "1": 1, "2": 1 });
    expect(canRestoreSpellUse(second!.draft, sureStrike, { rank: 1, resource: "apparition" })).toBe(
      true
    );
    const restored = restoreSpellUse(second!.draft, sureStrike, context, {
      rank: 1,
      resource: "apparition",
    });
    expect(restored?.spells.apparitionUsed).toEqual({ "1": 0, "2": 1 });
  });

  it("does not offer ordinary slots or apparition slots for illegal spells", () => {
    const draft = animistDraft(3);
    const context = contextForDraft(draft);
    expect(spellCastOptions(shield, draft, context)).toEqual([
      { rank: 2, resource: "cantrip", remaining: null, label: "Cantrip" },
    ]);
    expect(spellCastOptions(enlarge, draft, context)).toEqual([
      { rank: 2, resource: "apparition", remaining: 1, label: "Apparition slot" },
    ]);
    expect(spellCastOptions(fireball, draft, context)).toEqual([]);
    expect(spellCastOptions(heal, draft, context)).toEqual([]);
  });

  it("grants the primary apparition's vessel focus spell and raises the pool", () => {
    const level1 = animistDraft(1);
    const derived1 = computeCharacter(level1, contextForDraft(level1));
    expect(derived1.grantedSpells.map((spell) => spell.name)).toContain("Embodiment of Battle");
    expect(derived1.focusPointsMax).toBe(1);

    const level7 = animistDraft(7);
    const derived7 = computeCharacter(level7, contextForDraft(level7));
    expect(derived7.focusPointsMax).toBe(2);

    const level15 = animistDraft(15);
    const derived15 = computeCharacter(level15, contextForDraft(level15));
    expect(derived15.focusPointsMax).toBe(3);
  });

  it("caps attunement and keeps the primary inside the attuned list", () => {
    const draft = animistDraft(1, [witness.id]);
    const added = addAttunedApparition(draft, animist, steward.id);
    expect(added.spells.attunedApparitions).toEqual([witness.id, steward.id]);
    expect(added.spells.primaryApparition).toBe(witness.id);
    expect(canAttuneApparition(added, animist, ANIMIST_APPARITIONS[0]!.id)).toBe(false);

    const changed = setPrimaryApparition(added, animist, steward.id);
    expect(changed.spells.primaryApparition).toBe(steward.id);
    const removed = removeAttunedApparition(changed, animist, steward.id);
    expect(removed.spells.attunedApparitions).toEqual([witness.id]);
    expect(removed.spells.primaryApparition).toBe(witness.id);
    expect(setPrimaryApparition(removed, animist, steward.id)).toBe(removed);
  });

  it("resets apparition uses on a long rest", () => {
    const draft = animistDraft(3);
    draft.spells.apparitionUsed = { "1": 1, "2": 1 };
    const derived = computeCharacter(draft, contextForDraft(draft));
    const rested = applyLongRest(draft, derived, { preparedCaster: true });
    expect(rested.draft.spells.apparitionUsed).toEqual({});
    expect(rested.draft.spells.preparationsPending).toBe(true);
  });

  it("resolves every curated apparition spell and vessel at level 19", () => {
    for (const definition of ANIMIST_APPARITIONS) {
      const draft = animistDraft(19, [definition.id, witness.id]);
      const info = animistApparitionInfo(draft, contextForDraft(draft))!;
      const entry = info.attuned.find((apparition) => apparition.id === definition.id);
      expect(entry, definition.name).toBeTruthy();
      expect(entry!.cantrip, `${definition.name} cantrip`).toBeTruthy();
      expect(entry!.spells, `${definition.name} spells`).toHaveLength(9);
      expect(entry!.vesselSpell, `${definition.name} vessel`).toBeTruthy();
      expect(entry!.spells.map((spell) => spell.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    }
  });
});
