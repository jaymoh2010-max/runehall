import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { contextForDraft } from "../src/server/compendium";
import { CLASS_GRANTS, selectedClassGrants } from "../src/shared/classGrants";
import {
  casterTraditionFor,
  computeCharacter,
  emptyCharacterDraft,
  spellRepertoireLimits,
} from "../src/shared/rules";
import type { Ancestry, Background, ClassData, Feat, Heritage, Spell } from "../src/shared/types";

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
const feats = read<Feat>("feats.json");
const spells = read<Spell>("spells.json");

const human = byName(ancestries, "Human");
const warrior = byName(backgrounds, "Warrior");
const druid = byName(classes, "Druid");
const bard = byName(classes, "Bard");
const wizard = byName(classes, "Wizard");
const cleric = byName(classes, "Cleric");
const sorcerer = byName(classes, "Sorcerer");
const oracle = byName(classes, "Oracle");
const witch = byName(classes, "Witch");

function draftFor(classData: ClassData) {
  const draft = emptyCharacterDraft("Class Grant Test");
  draft.ancestryId = human.id;
  draft.heritageId = byName(heritages, "Skilled Human").id;
  draft.backgroundId = warrior.id;
  draft.classId = classData.id;
  draft.keyAbility = classData.keyAbility[0] ?? "str";
  draft.boosts.ancestry = ["str", "dex"];
  draft.boosts.background = ["str", "con"];
  draft.boosts.free = ["str", "dex", "con", "wis"];
  draft.featChoices[byName(heritages, "Skilled Human").id] = ["stealth"];
  return draft;
}

function chooseOption(draft: ReturnType<typeof draftFor>, classData: ClassData, optionId: string) {
  const group = classData.choiceGroups.find((entry) =>
    entry.options.some((option) => option.id === optionId)
  );
  if (!group) throw new Error(`Missing choice group for ${optionId}`);
  draft.classChoices[group.key] = [optionId];
}

describe("class-choice grants", () => {
  it("keeps every curated grant resolvable in the compendium", () => {
    for (const [optionId, grant] of Object.entries(CLASS_GRANTS)) {
      expect(optionId.startsWith("cf:")).toBe(true);
      for (const item of grant.feats ?? []) {
        expect(feats.some((feat) => feat.id === item.id && feat.name === item.name)).toBe(true);
      }
      for (const item of grant.spells ?? []) {
        const spell = spells.find((entry) => entry.id === item.id);
        expect(spell, `${item.name} (${item.id})`).toBeTruthy();
        expect(spell!.name).toBe(item.name);
        expect(spell!.rank).toBe(item.rank);
        if (item.kind === "focus") expect(spell!.traits).toContain("focus");
      }
    }
  });

  it("does not repeat a spell within one option's grants", () => {
    for (const [optionId, grant] of Object.entries(CLASS_GRANTS)) {
      const ids = (grant.spells ?? []).map((spell) => spell.id);
      expect(new Set(ids).size, optionId).toBe(ids.length);
    }
  });

  it("grants the Druid order feat and focus spell without using a feat slot", () => {
    const draft = draftFor(druid);
    chooseOption(draft, druid, "cf:POBvoXifa9HaejAg");
    const context = contextForDraft(draft);
    const grants = selectedClassGrants(draft, druid);
    expect(grants.feats.map((feat) => feat.name)).toContain("Animal Companion");
    expect(grants.spells).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Heal Animal", kind: "focus", rank: 1 }),
      ])
    );
    expect(context.feats["feat:f2Pl5dWEL9ZvEyI1"]?.name).toBe("Animal Companion");
    expect(context.spells["spell:Zmh4ynfnCtwKeAYl"]?.name).toBe("Heal Animal");

    const derived = computeCharacter(draft, context);
    expect(derived.grantedFeats.some((feat) => feat.name === "Animal Companion")).toBe(true);
    expect(derived.grantedSpells.some((spell) => spell.name === "Heal Animal")).toBe(true);
    expect(derived.selectedFeats.some((feat) => feat.name === "Animal Companion")).toBe(false);
    expect(derived.focusPointsMax).toBe(1);
  });

  it("keeps a Bard muse spell in the repertoire, not the focus pool", () => {
    const draft = draftFor(bard);
    chooseOption(draft, bard, "cf:4ripp6EfdVpS0d60");
    const grants = selectedClassGrants(draft, bard);
    expect(grants.feats.map((feat) => feat.name)).toContain("Bardic Lore");
    expect(grants.spells).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "Sure Strike", kind: "repertoire" })])
    );
    expect(spellRepertoireLimits(bard, 1)).toEqual({
      cantrips: 5,
      ranks: [2],
      subtractGranted: false,
    });
    const derived = computeCharacter(draft, contextForDraft(draft));
    expect(derived.grantedSpells.find((spell) => spell.name === "Sure Strike")?.kind).toBe(
      "repertoire"
    );
    expect(derived.focusPointsMax).toBe(1);
  });

  it("grants a Wizard school's initial focus spell", () => {
    const draft = draftFor(wizard);
    chooseOption(draft, wizard, "cf:E4GZDMn4DYk6qSEV");
    const derived = computeCharacter(draft, contextForDraft(draft));
    expect(derived.grantedSpells).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Force Bolt", kind: "focus", rank: 1 }),
      ])
    );
    expect(derived.focusPointsMax).toBe(1);
  });

  it("grants Cleric doctrine feats and only Cloistered Cleric's focus floor", () => {
    const cloistered = draftFor(cleric);
    chooseOption(cloistered, cleric, "cf:ZZzLMOUAtBVgV1DF");
    const cloisteredDerived = computeCharacter(cloistered, contextForDraft(cloistered));
    expect(cloisteredDerived.grantedFeats.map((feat) => feat.name)).toContain("Domain Initiate");
    expect(cloisteredDerived.focusPointsMax).toBe(1);

    const warpriest = draftFor(cleric);
    chooseOption(warpriest, cleric, "cf:0Aocw3igLwna9cjp");
    const warpriestDerived = computeCharacter(warpriest, contextForDraft(warpriest));
    expect(warpriestDerived.grantedFeats.map((feat) => feat.name)).toContain("Shield Block");
    expect(warpriestDerived.focusPointsMax).toBe(0);
  });

  it("grants a Sorcerer bloodline focus spell and derives its tradition", () => {
    const draft = draftFor(sorcerer);
    chooseOption(draft, sorcerer, "cf:3qqvnC2U8W26yae7");
    expect(casterTraditionFor(draft, sorcerer)).toBe("occult");
    const derived = computeCharacter(draft, contextForDraft(draft));
    expect(derived.grantedSpells).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Tentacular Limbs", kind: "focus", rank: 1 }),
      ])
    );
    expect(derived.focusPointsMax).toBe(1);
    expect(
      derived.validation.some((issue) => issue.message.includes("Choose your magical tradition"))
    ).toBe(false);
  });

  it("grants every fixed bloodline's level-1 gifts as repertoire", () => {
    const BLOODLINE_GIFTS: Record<string, { cantrip: string; first: string }> = {
      "cf:3qqvnC2U8W26yae7": { cantrip: "Daze", first: "Phantom Pain" },
      "cf:TFihgf3jDhmKd0fa": { cantrip: "Shield", first: "Mystic Armor" },
      "cf:vhW3glAaEfq2DKrw": { cantrip: "Light", first: "Heal" },
      "cf:w5koctOVrEcpxTIq": { cantrip: "Caustic Blast", first: "Fear" },
      "cf:o39zQMIdERWtmBSB": { cantrip: "Ignition", first: "Charm" },
      "cf:ZHabYxSgYK0XbjhM": { cantrip: "Shield", first: "Fear" },
      "cf:eW3cfCH7Wpx2vik2": { cantrip: "Figment", first: "Charm" },
      "cf:tYOMBiH3HbViNWwn": { cantrip: "Detect Magic", first: "Illusory Disguise" },
      "cf:O0uXZRWMNliDbkxU": { cantrip: "Daze", first: "Illusory Disguise" },
      "cf:b6hyZTs1rVGHDexz": { cantrip: "Detect Magic", first: "Ill Omen" },
      "cf:ZEtJJ5UOlV5oTWWp": { cantrip: "Detect Magic", first: "Force Barrage" },
      "cf:5Wxjghw7lHuCxjZz": { cantrip: "Tangle Vine", first: "Charm" },
      "cf:TWR1wbPJuCLnGdFZ": { cantrip: "Detect Magic", first: "Breathe Fire" },
      "cf:PpzH9tJULk5ksX9w": { cantrip: "Vitality Lash", first: "Heal" },
      "cf:uoQOm41BVdSo6pAS": { cantrip: "Void Warp", first: "Grim Tendrils" },
      "cf:7WBZ2kkhZ7JorWu2": { cantrip: "Void Warp", first: "Harm" },
      "cf:dKTb959aCQIzSIXj": { cantrip: "Read Aura", first: "Mystic Armor" },
    };
    for (const [optionId, expected] of Object.entries(BLOODLINE_GIFTS)) {
      const draft = draftFor(sorcerer);
      chooseOption(draft, sorcerer, optionId);
      const grants = selectedClassGrants(draft, sorcerer);
      expect(grants.spells, optionId).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: expected.cantrip, rank: 0, kind: "repertoire" }),
          expect.objectContaining({ name: expected.first, rank: 1, kind: "repertoire" }),
        ])
      );
      expect(grants.spells.filter((spell) => spell.kind === "focus")).toHaveLength(1);
    }
  });

  it("keeps Elemental's fixed focus spell while the element remains unchosen", () => {
    const draft = draftFor(sorcerer);
    chooseOption(draft, sorcerer, "cf:RXRnJcG4XSabZ35a");
    const grants = selectedClassGrants(draft, sorcerer);
    expect(grants.spells.filter((spell) => spell.kind === "repertoire")).toEqual([]);
    expect(grants.spells).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "Elemental Toss", kind: "focus" })])
    );
    expect(grants.notes.join(" ")).toMatch(/Elemental.*element/i);
  });

  it("does not count bloodline gifts against Sorcerer repertoire limits", () => {
    const draft = draftFor(sorcerer);
    chooseOption(draft, sorcerer, "cf:3qqvnC2U8W26yae7");
    draft.spells.cantrips = [
      "spell:4gBIw4IDrSfFHik4", // Daze, also granted
      "spell:TVKNbcgTee19PXZR",
      "spell:gpzpAAAJ1Lza2JVl",
      "spell:0zU8CPejjQFnhZFI",
      "spell:vLzFcIaSXs7YTIqJ",
    ];
    draft.spells.known = [
      "spell:R8bqnYiThB6MYTxD", // Phantom Pain, also granted
      "spell:4koZzrnMXhhosn0D",
      "spell:6ZIKB0151LUR19Rw",
    ];
    const derived = computeCharacter(draft, contextForDraft(draft));
    expect(
      derived.validation.some(
        (issue) =>
          issue.message.includes("knows 6 cantrips") ||
          issue.message.includes("knows 3 rank 1 spells")
      )
    ).toBe(false);
    expect(
      derived.grantedSpells.filter((spell) => spell.id === "spell:4gBIw4IDrSfFHik4")
    ).toHaveLength(1);
  });

  it("grants fixed rank-0 and rank-1 Wizard school curriculum", () => {
    const SCHOOL_CURRICULUM: Record<string, string[]> = {
      "cf:srcPBNjhq7FBSmi3": [
        "Figment",
        "Gouging Claw",
        "Fleet Step",
        "Illusory Disguise",
        "Sure Strike",
      ],
      "cf:HYTaibaCGE85rhbZ": [
        "Detect Magic",
        "Sigil",
        "Mystic Armor",
        "Runic Body",
        "Runic Weapon",
        "Sure Strike",
      ],
      "cf:wObrT6PytPdS5aUi": [
        "Message",
        "Sigil",
        "Command",
        "Disguise Magic",
        "Runic Body",
        "Runic Weapon",
      ],
      "cf:E4GZDMn4DYk6qSEV": [
        "Shield",
        "Telekinetic Projectile",
        "Breathe Fire",
        "Force Barrage",
        "Mystic Armor",
      ],
      "cf:YZ2XPmx1WHyWtM0g": [
        "Prestidigitation",
        "Read Aura",
        "Hydraulic Push",
        "Pummeling Rubble",
        "Summon Construct",
      ],
      "cf:a7yKDVnAYduaKIrL": [
        "Message",
        "Spout",
        "Gust of Wind",
        "Hydraulic Push",
        "Rude Awakening",
      ],
      "cf:XXnGHBxNZvRsdkKM": [
        "Message",
        "Telekinetic Hand",
        "Fleet Step",
        "Lock",
        "Thoughtful Gift",
      ],
      "cf:jtAqb5rnhQblZuM8": ["Prestidigitation", "Read Aura", "Alarm", "Charm", "Item Facade"],
      "cf:bCj5dSlq9VpjWXkU": [
        "Detect Magic",
        "Sigil",
        "Disguise Magic",
        "Illusory Disguise",
        "Mindlink",
      ],
      "cf:dPAwM9IdabdH68mW": [
        "Needle Darts",
        "Shield",
        "Mending",
        "Runic Weapon",
        "Summon Construct",
      ],
      "cf:L5FiuXsfW6Sa31gO": ["Daze", "Figment", "Dizzying Colors", "Sleep", "Sure Strike"],
      "cf:Eygg2xIAFtc4xZgQ": ["Phase Bolt", "Warp Step", "Alarm", "Pet Cache", "Thoughtful Gift"],
      "cf:ZBFICTkzUjE4BDGJ": ["Gouging Claw", "Tangle Vine", "Jump", "Pest Form", "Spider Sting"],
      "cf:X8BINW8OLQpIPpys": [
        "Gale Blast",
        "Scatter Scree",
        "Cradle Aloft",
        "Gentle Landing",
        "Pummeling Rubble",
      ],
      "cf:KGkWSv9rARpwWzXW": ["Detect Magic", "Alarm"],
      "cf:0QAFC61tpP63GUQa": [
        "Figment",
        "Frostbite",
        "Disguise Magic",
        "Gloom Mantle",
        "Illusory Object",
      ],
      "cf:ZpFCZnVzIfZLfNii": [
        "Telekinetic Hand",
        "Void Warp",
        "Grim Tendrils",
        "Phantasmal Minion",
        "Summon Undead",
      ],
      "cf:n2LRzksKVSzOuzqN": [
        "Telekinetic Hand",
        "Telekinetic Projectile",
        "Fleet Step",
        "Gust of Wind",
        "Mending",
      ],
    };
    for (const [optionId, expectedNames] of Object.entries(SCHOOL_CURRICULUM)) {
      const draft = draftFor(wizard);
      chooseOption(draft, wizard, optionId);
      const grants = selectedClassGrants(draft, wizard);
      expect(
        grants.spells.filter((spell) => spell.kind === "curriculum").map((spell) => spell.name),
        optionId
      ).toEqual(expectedNames);
      expect(
        grants.spells.filter((spell) => spell.kind === "focus"),
        optionId
      ).toHaveLength(optionId === "cf:HYTaibaCGE85rhbZ" ? 0 : 1);
    }
  });

  it("keeps Runelord's common curriculum until a sin is chosen", () => {
    const runelord = draftFor(wizard);
    chooseOption(runelord, wizard, "cf:HYTaibaCGE85rhbZ");
    const runelordGrants = selectedClassGrants(runelord, wizard);
    expect(runelordGrants.focusPoints).toBe(1);
    expect(runelordGrants.spells.filter((spell) => spell.kind === "curriculum")).toHaveLength(6);
    expect(runelordGrants.spells.filter((spell) => spell.kind === "focus")).toEqual([]);
    expect(runelordGrants.notes.join(" ")).toMatch(/sin/i);

    const unified = draftFor(wizard);
    chooseOption(unified, wizard, "cf:xYYhJtGhFSWNifcO");
    const unifiedGrants = selectedClassGrants(unified, wizard);
    expect(unifiedGrants.spells.filter((spell) => spell.kind === "curriculum")).toEqual([]);
    expect(unifiedGrants.notes.join(" ")).toMatch(/additional 1st-level wizard feat/i);
  });

  it("grants a bard's composition cantrip and focus spell", () => {
    const grants = selectedClassGrants(draftFor(bard), bard);
    expect(grants.spells).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Courageous Anthem",
          kind: "repertoire",
          rank: 0,
        }),
        expect.objectContaining({ name: "Counter Performance", kind: "focus" }),
      ])
    );
    expect(grants.focusPoints).toBe(1);
  });

  it("grants a witch's chosen hex", () => {
    const draft = draftFor(witch);
    const patron = witch.choiceGroups.find((group) => group.tag === "witch-patron")!;
    draft.classChoices[patron.key] = [patron.options[0].id];
    draft.grantChoices["grant:witch-hex"] = ["patrons-puppet"];
    const grants = selectedClassGrants(draft, witch);
    expect(grants.spells).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "Patron's Puppet", kind: "focus" })])
    );
    expect(grants.focusPoints).toBe(1);
  });

  it("grants an oracle's initial revelation by mystery", () => {
    const draft = draftFor(oracle);
    const mystery = oracle.choiceGroups.find((group) => group.tag === "oracle-mystery")!;
    draft.classChoices[mystery.key] = ["cf:GTSvbFb36InvuH0w"];
    draft.grantChoices["grant:oracle-mystery"] = ["flames"];
    const grants = selectedClassGrants(draft, oracle);
    expect(grants.spells).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "Incendiary Aura", kind: "focus" })])
    );
    expect(grants.focusPoints).toBe(1);
  });
});
