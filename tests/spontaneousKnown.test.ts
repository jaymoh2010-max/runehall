import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { contextForDraft } from "../src/server/compendium";
import {
  addKnownSpellAtRank,
  computeCharacter,
  emptyCharacterDraft,
  knownSpellRanks,
  removeKnownSpellAtRank,
} from "../src/shared/rules";
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
const sorcerer = byName(classes, "Sorcerer");
const fireball = byName(spells, "Fireball");

function sorcererDraft(level: number) {
  const draft = emptyCharacterDraft("Ranked Sorcerer");
  draft.level = level;
  draft.classId = sorcerer.id;
  draft.keyAbility = "cha";
  return draft;
}

describe("spontaneous known-at-rank spells", () => {
  it("offers only the ranks where a non-signature spell is known", () => {
    const draft = sorcererDraft(9);
    draft.spells.known = [fireball.id];
    draft.spells.knownRanks = { [fireball.id]: [3, 5] };
    const context = contextForDraft(draft);
    expect(knownSpellRanks(draft, fireball)).toEqual([3, 5]);
    expect(spellCastOptions(fireball, draft, context).map((option) => option.rank)).toEqual([3, 5]);
    expect(spellCastOptions(fireball, draft, context).map((option) => option.label)).toEqual([
      "Rank 3 slot",
      "Rank 5 slot",
    ]);
  });

  it("lets a signature spell use every rank up to the highest slot", () => {
    const draft = sorcererDraft(9);
    draft.spells.known = [fireball.id];
    draft.spells.knownRanks = { [fireball.id]: [3, 5] };
    draft.spells.signature = [fireball.id];
    const context = contextForDraft(draft);
    expect(spellCastOptions(fireball, draft, context).map((option) => option.rank)).toEqual([
      3, 4, 5,
    ]);
  });

  it("does not let a signature spell drop below the rank where it was learned", () => {
    const draft = sorcererDraft(11);
    draft.spells.known = [fireball.id];
    draft.spells.knownRanks = { [fireball.id]: [5] };
    draft.spells.signature = [fireball.id];
    const context = contextForDraft(draft);
    expect(spellCastOptions(fireball, draft, context).map((option) => option.rank)).toEqual([5, 6]);
  });

  it("spends the slot of the rank copy that was cast and restores it", () => {
    const draft = sorcererDraft(9);
    draft.spells.known = [fireball.id];
    draft.spells.knownRanks = { [fireball.id]: [3, 5] };
    const context = contextForDraft(draft);
    const cast = castSpell(draft, fireball, context, { rank: 5, resource: "slot" });
    expect(cast?.draft.spells.slotsUsed).toEqual({ "5": 1 });
    expect(cast?.draft.spells.preparedUsed).toEqual({});
    expect(canRestoreSpellUse(cast!.draft, fireball, { rank: 5, resource: "slot" })).toBe(true);
    const restored = restoreSpellUse(cast!.draft, fireball, context, {
      rank: 5,
      resource: "slot",
    });
    expect(restored?.spells.slotsUsed).toEqual({ "5": 0 });
  });

  it("adds and removes individual rank copies with the last copy forgetting the spell", () => {
    let draft = sorcererDraft(9);
    draft = addKnownSpellAtRank(draft, fireball, 3);
    expect(draft.spells.known).toEqual([fireball.id]);
    expect(knownSpellRanks(draft, fireball)).toEqual([3]);
    draft = addKnownSpellAtRank(draft, fireball, 5);
    expect(knownSpellRanks(draft, fireball)).toEqual([3, 5]);
    draft = { ...draft, spells: { ...draft.spells, signature: [fireball.id] } };

    const withoutThree = removeKnownSpellAtRank(draft, fireball, 3);
    expect(knownSpellRanks(withoutThree, fireball)).toEqual([5]);
    expect(withoutThree.spells.known).toEqual([fireball.id]);
    expect(withoutThree.spells.signature).toEqual([fireball.id]);

    const forgotten = removeKnownSpellAtRank(withoutThree, fireball, 5);
    expect(forgotten.spells.known).toEqual([]);
    expect(forgotten.spells.knownRanks).toEqual({});
    expect(forgotten.spells.signature).toEqual([]);
  });

  it("warns when a learned rank is outside the spell's valid range", () => {
    const draft = sorcererDraft(9);
    draft.spells.known = [fireball.id];
    draft.spells.knownRanks = { [fireball.id]: [2] };
    const derived = computeCharacter(draft, contextForDraft(draft));
    expect(
      derived.validation.some(
        (issue) => issue.severity === "warning" && issue.message.includes("learned at rank 2")
      )
    ).toBe(true);
  });
});
