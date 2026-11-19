import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { contextForDraft } from "../src/server/compendium";
import {
  addPreparedCopy,
  computeCharacter,
  emptyCharacterDraft,
  normalizeCharacterDraft,
  preparedEntries,
  preparedRankSummaries,
  removePreparedCopy,
  removePreparedSpellEverywhere,
} from "../src/shared/rules";
import { castSpell, spellCastOptions } from "../src/shared/spellcasting";
import type { Ancestry, Background, ClassData, Deity, Heritage, Spell } from "../src/shared/types";

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
const abadar = byName(deities, "Abadar");

const heal = byName(spells, "Heal");
const harm = byName(spells, "Harm");
const bless = byName(spells, "Bless");
const guidance = byName(spells, "Guidance");
const heroism = byName(spells, "Heroism");
const fireball = byName(spells, "Fireball");
const fear = byName(spells, "Fear");
const grease = byName(spells, "Grease");
const sleep = byName(spells, "Sleep");
const forceBarrage = byName(spells, "Force Barrage");
const light = byName(spells, "Light");

function draftFor(classData: ClassData) {
  const draft = emptyCharacterDraft("Prepared Test");
  draft.ancestryId = human.id;
  draft.heritageId = skilledHuman.id;
  draft.backgroundId = acolyte.id;
  draft.classId = classData.id;
  draft.keyAbility = classData.keyAbility[0] ?? "wis";
  return draft;
}

function clericAt(level: number, byRank: Record<string, string[]>) {
  const draft = draftFor(cleric);
  draft.level = level;
  draft.deityId = abadar.id;
  draft.classChoices[cleric.choiceGroups.find((group) => group.tag === "cleric-doctrine")!.key] = [
    "cf:0Aocw3igLwna9cjp",
  ];
  draft.spells.known = [heal.id, harm.id, bless.id, heroism.id];
  draft.spells.cantrips = [guidance.id];
  draft.spells.preparedByRank = byRank;
  draft.spells.prepared = Object.keys(byRank)
    .map(Number)
    .sort((a, b) => a - b)
    .flatMap((rank) => byRank[String(rank)] ?? []);
  return draft;
}

function repeated(id: string, count: number) {
  return Array.from({ length: count }, () => id);
}

function wizardAt(level: number, byRank: Record<string, string[]>, known: string[]) {
  const draft = draftFor(wizard);
  draft.level = level;
  const schoolGroup = wizard.choiceGroups.find((group) => group.tag === "wizard-arcane-school")!;
  draft.classChoices[schoolGroup.key] = ["cf:E4GZDMn4DYk6qSEV"];
  draft.spells.cantrips = [light.id];
  draft.spells.known = known;
  draft.spells.preparedByRank = byRank;
  draft.spells.prepared = Object.keys(byRank)
    .map(Number)
    .sort((a, b) => a - b)
    .flatMap((rank) => byRank[String(rank)] ?? []);
  return draft;
}

describe("rank-aware prepared spells", () => {
  it("normalizes the flat list and rank map without losing duplicates", () => {
    const normalized = normalizeCharacterDraft({
      name: "Prepared",
      spells: {
        prepared: [bless.id, bless.id],
        preparedByRank: { "1": [bless.id, bless.id] },
      },
    });
    expect(normalized.spells.prepared).toEqual([bless.id, bless.id]);
    expect(normalized.spells.preparedByRank).toEqual({ "1": [bless.id, bless.id] });
  });

  it("normalizes the divine font choice", () => {
    const chosen = normalizeCharacterDraft({
      name: "Font",
      spells: { fontChoice: "Harm" },
    });
    expect(chosen.spells.fontChoice).toBe("harm");
    const invalid = normalizeCharacterDraft({
      name: "Font",
      spells: { fontChoice: "both" },
    });
    expect(invalid.spells.fontChoice).toBeNull();
  });

  it("derives the flat mirror from a rank map and drops stale mismatches", () => {
    const fromMap = normalizeCharacterDraft({
      name: "From map",
      spells: { preparedByRank: { "3": [heroism.id] } },
    });
    expect(fromMap.spells.prepared).toEqual([heroism.id]);
    expect(fromMap.spells.preparedByRank).toEqual({ "3": [heroism.id] });

    const stale = normalizeCharacterDraft({
      name: "Stale",
      spells: {
        prepared: [bless.id],
        preparedByRank: { "3": [heroism.id] },
      },
    });
    expect(stale.spells.prepared).toEqual([bless.id]);
    expect(stale.spells.preparedByRank).toEqual({});
  });

  it("classifies explicit rank-3 Heal copies as font at level 5", () => {
    const draft = clericAt(5, {
      "1": [bless.id, bless.id],
      "3": [...repeated(heal.id, 5), heroism.id, heroism.id],
    });
    const context = contextForDraft(draft);
    const entries = preparedEntries(draft, {
      spells: context.spells,
      deity: abadar,
      classData: cleric,
    });
    const summaries = preparedRankSummaries(entries);
    expect(summaries.get(3)).toEqual({
      total: 7,
      font: 5,
      ordinary: 2,
      ids: [...repeated(heal.id, 5), heroism.id, heroism.id],
    });
    expect(
      computeCharacter(draft, context).validation.filter(
        (i) => i.step === "spells" && i.severity === "error"
      )
    ).toEqual([]);
  });

  it("keeps a rank-1 Heal ordinary at level 5", () => {
    const draft = clericAt(5, { "1": [heal.id], "3": repeated(heal.id, 5) });
    const context = contextForDraft(draft);
    const entries = preparedEntries(draft, {
      spells: context.spells,
      deity: abadar,
      classData: cleric,
    });
    const summaries = preparedRankSummaries(entries);
    expect(summaries.get(1)?.font).toBe(0);
    expect(summaries.get(1)?.ordinary).toBe(1);
    expect(summaries.get(3)?.font).toBe(5);
  });

  it("infers legacy flat Heal copies at their base rank, not the font rank", () => {
    const draft = draftFor(cleric);
    draft.level = 5;
    draft.deityId = abadar.id;
    draft.spells.prepared = repeated(heal.id, 5);
    const context = contextForDraft(draft);
    const entries = preparedEntries(draft, {
      spells: context.spells,
      deity: abadar,
      classData: cleric,
    });
    expect(entries.every((entry) => entry.rank === 1 && !entry.font)).toBe(true);
  });

  it("adds and removes prepared copies at a specific rank", () => {
    const draft = clericAt(5, {});
    const context = { spells: contextForDraft(draft).spells, deity: abadar, classData: cleric };
    let next = addPreparedCopy(draft, context, heroism.id, 3);
    next = addPreparedCopy(next, context, heroism.id, 5);
    expect(next.spells.preparedByRank["3"]).toEqual([heroism.id]);
    expect(next.spells.preparedByRank["5"]).toEqual([heroism.id]);
    expect(next.spells.prepared).toEqual([heroism.id, heroism.id]);

    next = {
      ...next,
      spells: {
        ...next.spells,
        preparedUsed: { [`3:${heroism.id}`]: 1 },
        fontUsed: { [heroism.id]: 1 },
      },
    };
    next = removePreparedCopy(next, context, heroism.id, 3);
    expect(next.spells.preparedByRank["3"]).toBeUndefined();
    expect(next.spells.preparedByRank["5"]).toEqual([heroism.id]);
    expect(next.spells.preparedUsed).toEqual({});

    next = removePreparedSpellEverywhere(next, heroism.id);
    expect(next.spells.preparedByRank).toEqual({});
    expect(next.spells.prepared).toEqual([]);
    expect(next.spells.fontUsed).toEqual({});
  });

  it("rejects a rank-3 spell prepared in a rank-1 slot", () => {
    const draft = clericAt(5, { "1": [heroism.id] });
    const derived = computeCharacter(draft, contextForDraft(draft));
    expect(
      derived.validation.some(
        (issue) =>
          issue.severity === "error" && issue.message.includes("can't be prepared in a rank 1 slot")
      )
    ).toBe(true);
  });

  it("offers font and ordinary casts for explicit prepared ranks", () => {
    const draft = clericAt(5, {
      "1": [heal.id],
      "3": repeated(heal.id, 6),
    });
    const context = contextForDraft(draft);
    const options = spellCastOptions(heal, draft, context, { focusPointsMax: 0 });
    expect(options).toEqual([
      { rank: 3, resource: "font", remaining: 5, label: "Divine font" },
      { rank: 1, resource: "slot", remaining: 1, label: "Rank 1 slot" },
      { rank: 3, resource: "slot", remaining: 1, label: "Rank 3 slot" },
    ]);
  });

  it("consumes one font copy per cast even when the font pool has room", () => {
    const draft = clericAt(5, { "3": repeated(heal.id, 3) });
    const context = contextForDraft(draft);
    let current = draft;
    for (let index = 0; index < 3; index += 1) {
      const result = castSpell(current, heal, context, { rank: 3, resource: "font" });
      expect(result).not.toBeNull();
      current = result!.draft;
    }
    expect(current.spells.divineFontUsed).toBe(3);
    expect(current.spells.fontUsed).toEqual({ [heal.id]: 3 });
    expect(spellCastOptions(heal, current, context, { focusPointsMax: 0 })).toEqual([
      { rank: 3, resource: "font", remaining: 0, label: "Divine font" },
    ]);
    expect(castSpell(current, heal, context, { rank: 3, resource: "font" })).toBeNull();
  });

  it("tracks upcast copies separately at each prepared rank", () => {
    const draft = draftFor(wizard);
    draft.level = 9;
    draft.spells.known = [fireball.id];
    draft.spells.preparedByRank = { "3": [fireball.id], "5": [fireball.id] };
    draft.spells.prepared = [fireball.id, fireball.id];
    const context = contextForDraft(draft);

    const rankFive = castSpell(draft, fireball, context, { rank: 5, resource: "slot" });
    expect(rankFive).not.toBeNull();
    expect(rankFive!.draft.spells.preparedUsed).toEqual({ [`5:${fireball.id}`]: 1 });
    expect(spellCastOptions(fireball, rankFive!.draft, context)).toEqual([
      { rank: 3, resource: "slot", remaining: 1, label: "Rank 3 slot" },
      { rank: 5, resource: "slot", remaining: 0, label: "Rank 5 slot" },
    ]);
    expect(
      castSpell(rankFive!.draft, fireball, context, { rank: 3, resource: "slot" })
    ).not.toBeNull();
  });

  it("offers an available ordinary copy before an exhausted font option", () => {
    const draft = clericAt(5, { "1": [heal.id], "3": repeated(heal.id, 5) });
    draft.spells.divineFontUsed = 5;
    draft.spells.fontUsed = { [heal.id]: 5 };
    const context = contextForDraft(draft);
    expect(spellCastOptions(heal, draft, context, { focusPointsMax: 0 })).toEqual([
      { rank: 1, resource: "slot", remaining: 1, label: "Rank 1 slot" },
      { rank: 3, resource: "font", remaining: 0, label: "Divine font" },
    ]);
  });

  it("classifies only the chosen divine font spell", () => {
    const draft = clericAt(1, { "1": [heal.id, harm.id] });
    const context = contextForDraft(draft);
    draft.spells.fontChoice = "harm";
    let entries = preparedEntries(draft, {
      spells: context.spells,
      deity: abadar,
      classData: cleric,
    });
    expect(entries).toEqual([
      { id: heal.id, rank: 1, font: false },
      { id: harm.id, rank: 1, font: true },
    ]);

    draft.spells.fontChoice = "heal";
    entries = preparedEntries(draft, {
      spells: context.spells,
      deity: abadar,
      classData: cleric,
    });
    expect(entries).toEqual([
      { id: heal.id, rank: 1, font: true },
      { id: harm.id, rank: 1, font: false },
    ]);
  });

  it("infers a divine font choice from a single prepared font spell", () => {
    const draft = clericAt(1, { "1": [harm.id] });
    const context = contextForDraft(draft);
    const entries = preparedEntries(draft, {
      spells: context.spells,
      deity: abadar,
      classData: cleric,
    });
    expect(entries).toEqual([{ id: harm.id, rank: 1, font: true }]);
  });

  it("warns a dual-font cleric when no font spell is chosen", () => {
    const draft = clericAt(1, { "1": [bless.id] });
    const context = contextForDraft(draft);
    expect(
      computeCharacter(draft, context).validation.some(
        (issue) =>
          issue.severity === "warning" &&
          issue.step === "spells" &&
          issue.message.includes("Choose Heal or Harm")
      )
    ).toBe(true);
  });

  it("offers divine font only for the chosen spell", () => {
    const draft = clericAt(5, { "3": [heal.id, harm.id] });
    draft.spells.fontChoice = "harm";
    const context = contextForDraft(draft);
    const healOptions = spellCastOptions(heal, draft, context, { focusPointsMax: 0 });
    expect(healOptions.every((option) => option.resource !== "font")).toBe(true);
    const harmOptions = spellCastOptions(harm, draft, context, { focusPointsMax: 0 });
    expect(harmOptions[0]).toMatchObject({ rank: 3, resource: "font", remaining: 1 });
    expect(harmOptions.some((option) => option.resource === "slot")).toBe(false);
  });

  it("enforces the rank-1 Wizard curriculum slot", () => {
    const threeOrdinary = wizardAt(1, { "1": [fear.id, grease.id, sleep.id] }, [
      fear.id,
      grease.id,
      sleep.id,
    ]);
    const bad = computeCharacter(threeOrdinary, contextForDraft(threeOrdinary)).validation;
    expect(
      bad.some(
        (issue) =>
          issue.severity === "error" &&
          issue.step === "spells" &&
          issue.message.includes("extra Wizard slot")
      )
    ).toBe(true);

    for (const prepared of [
      [fear.id, grease.id, forceBarrage.id],
      [fear.id, forceBarrage.id, bless.id],
      [forceBarrage.id, forceBarrage.id, forceBarrage.id],
    ]) {
      const draft = wizardAt(1, { "1": prepared }, [...prepared]);
      const validation = computeCharacter(draft, contextForDraft(draft)).validation;
      expect(
        validation.some(
          (issue) => issue.severity === "error" && issue.message.includes("extra Wizard slot")
        )
      ).toBe(false);
    }
  });

  it("offers only the prepared rank for an upcast Wizard spell", () => {
    const draft = draftFor(wizard);
    draft.level = 9;
    draft.spells.known = [fireball.id];
    draft.spells.preparedByRank = { "3": [fireball.id], "5": [fireball.id] };
    draft.spells.prepared = [fireball.id, fireball.id];
    const context = contextForDraft(draft);
    const options = spellCastOptions(fireball, draft, context);
    expect(options.map((option) => option.rank)).toEqual([3, 5]);
    expect(options.every((option) => option.resource === "slot")).toBe(true);
  });
});
