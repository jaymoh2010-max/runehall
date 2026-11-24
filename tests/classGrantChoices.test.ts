import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { contextForDraft } from "../src/server/compendium";
import {
  activeGrantChoiceGroups,
  canonicalDomainKey,
  deitySupportsClass,
  DOMAIN_ADVANCED_SPELLS,
  DOMAIN_SPELLS,
  GRANT_CHOICE_KEYS,
} from "../src/shared/classGrantChoices";
import { selectedClassGrants, selectedClassGrantFeatIds } from "../src/shared/classGrants";
import { applicableChoiceGroups, computeCharacter, emptyCharacterDraft } from "../src/shared/rules";
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
const warrior = byName(backgrounds, "Warrior");
const cleric = byName(classes, "Cleric");
const champion = byName(classes, "Champion");
const sorcerer = byName(classes, "Sorcerer");
const wizard = byName(classes, "Wizard");
const abadar = byName(deities, "Abadar");
const iomedae = byName(deities, "Iomedae");
const asmodeus = byName(deities, "Asmodeus");

function draftFor(classData: ClassData) {
  const draft = emptyCharacterDraft("Grant Choice Test");
  draft.ancestryId = human.id;
  draft.heritageId = skilledHuman.id;
  draft.backgroundId = warrior.id;
  draft.classId = classData.id;
  draft.keyAbility = classData.keyAbility[0] ?? "str";
  return draft;
}

function chooseTag(
  draft: ReturnType<typeof draftFor>,
  classData: ClassData,
  tag: string,
  optionId: string
) {
  const group = classData.choiceGroups.find((entry) => entry.tag === tag);
  if (!group) throw new Error(`Missing group ${tag}`);
  draft.classChoices[group.key] = [optionId];
}

function groupFor(
  draft: ReturnType<typeof draftFor>,
  classData: ClassData,
  deity: Deity | null,
  key: string
) {
  return activeGrantChoiceGroups(
    draft,
    classData,
    deity,
    selectedClassGrantFeatIds(draft, classData, deity)
  ).find((group) => group.key === key);
}

describe("free class grant choices", () => {
  it("requires domain and font support for clerics and champions", () => {
    const philosophy = byName(deities, "Laws of Mortality");
    expect(deitySupportsClass(abadar, cleric)).toBe(true);
    expect(deitySupportsClass(philosophy, cleric)).toBe(false);
    expect(deitySupportsClass(abadar, champion)).toBe(true);
    expect(deitySupportsClass(philosophy, champion)).toBe(false);
    expect(deitySupportsClass(philosophy, wizard)).toBe(true);
  });

  it("maps every deity domain to a rank-1 cleric focus spell", () => {
    const domainKeys = new Set(
      deities
        .flatMap((deity) => [...(deity.domains ?? []), ...(deity.alternateDomains ?? [])])
        .map(canonicalDomainKey)
    );
    expect(domainKeys.size).toBe(61);
    for (const key of domainKeys) {
      const entry = DOMAIN_SPELLS[key];
      expect(entry, key).toBeDefined();
      const spell = spells.find((candidate) => candidate.id === entry.id);
      expect(spell, `${key}: ${entry.id}`).toBeTruthy();
      expect(spell!.name).toBe(entry.name);
      expect(spell!.rank).toBe(1);
      expect(spell!.traits).toEqual(expect.arrayContaining(["cleric", "focus"]));
    }
  });

  it("maps every deity domain to an advanced cleric focus spell", () => {
    const domains = read<{
      id: string;
      advancedDomainSpell: { id: string; name: string };
    }>("domains.json");
    for (const domain of domains) {
      const key = canonicalDomainKey(domain.id.replace(/^domain:/, ""));
      const entry = DOMAIN_ADVANCED_SPELLS[key];
      expect(entry, key).toBeDefined();
      expect(entry).toEqual(domain.advancedDomainSpell);
      const spell = spells.find((candidate) => candidate.id === entry.id);
      expect(spell, `${key}: ${entry.id}`).toBeTruthy();
      expect(spell!.name).toBe(entry.name);
      expect(spell!.traits).toEqual(expect.arrayContaining(["cleric", "focus"]));
    }
  });

  it("resolves the legacy domain aliases", () => {
    expect(canonicalDomainKey("delirium")).toBe("disorientation");
    expect(canonicalDomainKey("void")).toBe("nothingness");
    expect(canonicalDomainKey("wyrmkin")).toBe("dragon");
  });

  it("grants a Cloistered Cleric's chosen domain as a focus spell", () => {
    const draft = draftFor(cleric);
    chooseTag(draft, cleric, "cleric-doctrine", "cf:ZZzLMOUAtBVgV1DF");
    draft.deityId = abadar.id;

    const group = groupFor(draft, cleric, abadar, GRANT_CHOICE_KEYS.clericDomain);
    expect(group).toBeDefined();
    expect(group!.options.map((option) => option.domain)).toEqual(
      expect.arrayContaining(["cities", "earth", "travel", "wealth"])
    );
    expect(group!.options.some((option) => option.domain === "fire")).toBe(false);

    draft.grantChoices[GRANT_CHOICE_KEYS.clericDomain] = ["domain:cities"];
    const context = contextForDraft(draft);
    const derived = computeCharacter(draft, context);

    expect(derived.grantedFeats.map((feat) => feat.name)).toContain("Domain Initiate");
    expect(derived.grantedSpells).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Face in the Crowd",
          kind: "focus",
          rank: 1,
        }),
      ])
    );
    expect(context.spells["spell:yH13KXUK2x093NUv"]?.name).toBe("Face in the Crowd");
    expect(derived.focusPointsMax).toBe(1);
  });

  it("grants an alternate domain spell through Expanded Domain Initiate", () => {
    const draft = draftFor(cleric);
    draft.level = 4;
    chooseTag(draft, cleric, "cleric-doctrine", "cf:ZZzLMOUAtBVgV1DF");
    draft.deityId = abadar.id;
    draft.feats.class["4"] = "feat:vQ4DNfpktmaqdgdM";

    const group = groupFor(draft, cleric, abadar, GRANT_CHOICE_KEYS.clericExpandedDomain);
    expect(group).toBeDefined();
    expect(group!.options.map((option) => option.domain)).toEqual(
      expect.arrayContaining(["creation", "duty", "metal", "toil"])
    );
    expect(group!.options.some((option) => option.domain === "cities")).toBe(false);

    draft.grantChoices[GRANT_CHOICE_KEYS.clericExpandedDomain] = ["domain:creation"];
    const derived = computeCharacter(draft, contextForDraft(draft));
    expect(derived.grantedSpells).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Creative Splash",
          kind: "focus",
          rank: 1,
        }),
      ])
    );
  });

  it("grants an advanced domain spell through Advanced Domain", () => {
    const draft = draftFor(cleric);
    draft.level = 8;
    chooseTag(draft, cleric, "cleric-doctrine", "cf:ZZzLMOUAtBVgV1DF");
    draft.deityId = abadar.id;
    draft.feats.class["2"] = "feat:hT4INKGtly4QY8KN";
    draft.grantChoices[GRANT_CHOICE_KEYS.clericDomain] = ["domain:cities"];
    draft.feats.class["8"] = "feat:uR44wELN9OlU68cL";

    const group = groupFor(draft, cleric, abadar, GRANT_CHOICE_KEYS.clericAdvancedDomain);
    expect(group).toBeDefined();
    expect(group!.options.map((option) => option.domain)).toEqual(["cities"]);

    draft.grantChoices[GRANT_CHOICE_KEYS.clericAdvancedDomain] = ["advanced-domain:cities"];
    const derived = computeCharacter(draft, contextForDraft(draft));
    expect(derived.grantedSpells).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Pulse of Civilization",
          kind: "focus",
          rank: 4,
        }),
      ])
    );
    expect(derived.focusPointsMax).toBe(2);
  });

  it("hides advanced domain options until an initial domain is chosen", () => {
    const draft = draftFor(cleric);
    draft.level = 8;
    chooseTag(draft, cleric, "cleric-doctrine", "cf:ZZzLMOUAtBVgV1DF");
    draft.deityId = abadar.id;
    draft.feats.class["8"] = "feat:uR44wELN9OlU68cL";

    const group = groupFor(draft, cleric, abadar, GRANT_CHOICE_KEYS.clericAdvancedDomain);
    expect(group).toBeDefined();
    expect(group!.options).toHaveLength(0);
    expect(group!.emptyHint).toMatch(/Domain Initiate/i);
  });

  it("allows repeated Advanced Domain picks for multiple initialized domains", () => {
    const draft = draftFor(cleric);
    draft.level = 10;
    chooseTag(draft, cleric, "cleric-doctrine", "cf:ZZzLMOUAtBVgV1DF");
    draft.deityId = abadar.id;
    draft.feats.class["4"] = "feat:vQ4DNfpktmaqdgdM";
    draft.feats.class["8"] = "feat:uR44wELN9OlU68cL";
    draft.feats.class["10"] = "feat:uR44wELN9OlU68cL";
    draft.grantChoices[GRANT_CHOICE_KEYS.clericDomain] = ["domain:cities"];
    draft.grantChoices[GRANT_CHOICE_KEYS.clericExpandedDomain] = ["domain:earth"];

    const group = groupFor(draft, cleric, abadar, GRANT_CHOICE_KEYS.clericAdvancedDomain);
    expect(group).toBeDefined();
    expect(group!.count).toBe(2);
    expect(group!.options.map((option) => option.domain)).toEqual(
      expect.arrayContaining(["cities", "earth"])
    );

    draft.grantChoices[GRANT_CHOICE_KEYS.clericAdvancedDomain] = [
      "advanced-domain:cities",
      "advanced-domain:earth",
    ];
    const derived = computeCharacter(draft, contextForDraft(draft));
    expect(derived.grantedSpells).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Pulse of Civilization", kind: "focus" }),
        expect.objectContaining({ name: "Localized Quake", kind: "focus" }),
      ])
    );
    expect(derived.focusPointsMax).toBe(3);
  });

  it("activates Domain Initiate chosen through Natural Ambition", () => {
    const draft = draftFor(cleric);
    chooseTag(draft, cleric, "cleric-doctrine", "cf:0Aocw3igLwna9cjp");
    draft.deityId = abadar.id;
    draft.feats.ancestry["1"] = "feat:PodajLVxqYSAqVox";
    draft.featChoices["feat:PodajLVxqYSAqVox"] = ["feat:hT4INKGtly4QY8KN"];

    const group = groupFor(draft, cleric, abadar, GRANT_CHOICE_KEYS.clericDomain);
    expect(group).toBeDefined();
    expect(group!.options.length).toBeGreaterThan(0);
  });

  it("rejects a domain outside the deity's list", () => {
    const draft = draftFor(cleric);
    chooseTag(draft, cleric, "cleric-doctrine", "cf:ZZzLMOUAtBVgV1DF");
    draft.deityId = abadar.id;
    draft.grantChoices[GRANT_CHOICE_KEYS.clericDomain] = ["domain:fire"];

    const derived = computeCharacter(draft, contextForDraft(draft));
    expect(derived.grantedSpells.some((spell) => spell.name === "Fire Ray")).toBe(false);
    expect(
      derived.validation.some(
        (issue) => issue.severity === "error" && /domain/i.test(issue.message)
      )
    ).toBe(true);
  });

  it("grants the chosen Elemental influence's cantrip and 1st-rank gift", () => {
    const draft = draftFor(sorcerer);
    chooseTag(draft, sorcerer, "sorcerer-bloodline", "cf:RXRnJcG4XSabZ35a");

    const group = groupFor(draft, sorcerer, null, GRANT_CHOICE_KEYS.sorcererElement);
    expect(group?.options.map((option) => option.id)).toEqual([
      "air",
      "earth",
      "fire",
      "metal",
      "water",
      "wood",
    ]);

    draft.grantChoices[GRANT_CHOICE_KEYS.sorcererElement] = ["fire"];
    const grants = selectedClassGrants(draft, sorcerer);
    expect(grants.spells).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "spell:6DfLZBl8wKIV03Iq",
          name: "Ignition",
          rank: 0,
          kind: "repertoire",
        }),
        expect.objectContaining({
          id: "spell:y6rAdMK6EFlV6U0t",
          name: "Breathe Fire",
          rank: 1,
          kind: "repertoire",
        }),
        expect.objectContaining({
          name: "Elemental Toss",
          kind: "focus",
          rank: 1,
        }),
      ])
    );
    const derived = computeCharacter(draft, contextForDraft(draft));
    expect(derived.grantedSpells).toHaveLength(3);
    expect(derived.focusPointsMax).toBe(1);
  });

  it("grants a Runelord sin's focus spell and rank-0/1 curriculum", () => {
    const draft = draftFor(wizard);
    chooseTag(draft, wizard, "wizard-arcane-school", "cf:HYTaibaCGE85rhbZ");

    const group = groupFor(draft, wizard, null, GRANT_CHOICE_KEYS.runelordSin);
    expect(group?.options.map((option) => option.id)).toEqual([
      "envy",
      "gluttony",
      "greed",
      "lust",
      "pride",
      "sloth",
      "wrath",
    ]);

    draft.grantChoices[GRANT_CHOICE_KEYS.runelordSin] = ["wrath"];
    const grants = selectedClassGrants(draft, wizard);
    expect(grants.focusPoints).toBe(1);
    expect(grants.spells.filter((spell) => spell.kind === "focus")).toEqual([
      expect.objectContaining({ name: "Vengeful Glare", rank: 1, kind: "focus" }),
    ]);
    expect(grants.spells.filter((spell) => spell.kind === "curriculum")).toHaveLength(10);
    expect(
      grants.spells.filter((spell) => spell.kind === "curriculum").map((spell) => spell.name)
    ).toEqual(expect.arrayContaining(["Frostbite", "Ignition", "Force Barrage", "Thunderstrike"]));

    const derived = computeCharacter(draft, contextForDraft(draft));
    expect(derived.grantedSpells).toHaveLength(11);
    expect(derived.focusPointsMax).toBe(1);
  });

  it("hides the arcane thesis group when Runelord is selected", () => {
    const draft = draftFor(wizard);
    chooseTag(draft, wizard, "wizard-arcane-school", "cf:HYTaibaCGE85rhbZ");
    expect(
      applicableChoiceGroups(draft, wizard).some((group) => group.tag === "wizard-arcane-thesis")
    ).toBe(false);
  });

  it("filters Champion devotion spells by deity font", () => {
    const draft = draftFor(champion);
    chooseTag(draft, champion, "champion-cause", "cf:peEXunfbSD8WcMFk");

    const withIomedae = groupFor(draft, champion, iomedae, GRANT_CHOICE_KEYS.championDevotion);
    expect(withIomedae?.options.map((option) => option.id)).toEqual([
      "lay-on-hands",
      "shields-of-the-spirit",
    ]);

    const withAsmodeus = groupFor(draft, champion, asmodeus, GRANT_CHOICE_KEYS.championDevotion);
    expect(withAsmodeus?.options.map((option) => option.id)).toEqual([
      "touch-of-the-void",
      "shields-of-the-spirit",
    ]);
  });

  it("grants a Champion devotion spell as a focus spell", () => {
    const draft = draftFor(champion);
    chooseTag(draft, champion, "champion-cause", "cf:peEXunfbSD8WcMFk");
    draft.deityId = iomedae.id;
    draft.grantChoices[GRANT_CHOICE_KEYS.championDevotion] = ["lay-on-hands"];

    const context = contextForDraft(draft);
    const derived = computeCharacter(draft, context);
    expect(derived.grantedSpells).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Lay on Hands",
          kind: "focus",
          rank: 1,
        }),
      ])
    );
    expect(context.spells["spell:zNN9212H2FGfM7VS"]?.name).toBe("Lay on Hands");
    expect(derived.focusPointsMax).toBe(1);
  });

  it("requires an active free choice on the class step", () => {
    const elemental = draftFor(sorcerer);
    chooseTag(elemental, sorcerer, "sorcerer-bloodline", "cf:RXRnJcG4XSabZ35a");
    expect(
      computeCharacter(elemental, contextForDraft(elemental)).validation.some(
        (issue) => issue.severity === "error" && /choose an element/i.test(issue.message)
      )
    ).toBe(true);

    const runelord = draftFor(wizard);
    chooseTag(runelord, wizard, "wizard-arcane-school", "cf:HYTaibaCGE85rhbZ");
    expect(
      computeCharacter(runelord, contextForDraft(runelord)).validation.some(
        (issue) => issue.severity === "error" && /choose your sin/i.test(issue.message)
      )
    ).toBe(true);
  });
});
