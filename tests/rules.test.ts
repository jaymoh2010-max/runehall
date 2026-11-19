import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  animistSlots,
  boundedCasterSlots,
  casterInfo,
  characterSummary,
  checkFeatPrerequisite,
  computeCharacter,
  divineFontInfo,
  emptyCharacterDraft,
  featAvailability,
  featClassAccess,
  featPrerequisiteStatus,
  fullCasterSlots,
  grantedTrainedSkills,
  normalizeCharacterDraft,
  spellRepertoireLimits,
  spellSlotsFor,
} from "../src/shared/rules";
import type {
  Ancestry,
  Background,
  CharacterContext,
  ClassData,
  Deity,
  Equipment,
  Feat,
  Heritage,
  Spell,
} from "../src/shared/types";

function read<T>(file: string): T[] {
  return JSON.parse(fs.readFileSync(path.resolve("data", "compendium", file), "utf8")) as T[];
}

const ancestries = read<Ancestry>("ancestries.json");
const heritages = read<Heritage>("heritages.json");
const backgrounds = read<Background>("backgrounds.json");
const classes = read<ClassData>("classes.json");
const feats = read<Feat>("feats.json");
const deities = read<Deity>("deities.json");
const equipment = read<Equipment>("equipment.json");
const spells = read<Spell>("spells.json");

function buildCleric() {
  const dwarf = ancestries.find((entry) => entry.name === "Dwarf")!;
  const forge = heritages.find((entry) => entry.name === "Forge Dwarf")!;
  const acolyte = backgrounds.find((entry) => entry.name === "Acolyte")!;
  const cleric = classes.find((entry) => entry.name === "Cleric")!;
  const abadar = deities.find((entry) => entry.name === "Abadar")!;
  const dwarvenWeaponFamiliarity = feats.find(
    (entry) => entry.name === "Dwarven Weapon Familiarity"
  )!;
  const doctrine = cleric.choiceGroups.find((group) => group.tag === "cleric-doctrine")!;
  const warpriest = doctrine.options.find((option) => option.name === "Warpriest")!;
  const guidance = spells.find((entry) => entry.name === "Guidance")!;
  const bless = spells.find((entry) => entry.name === "Bless")!;

  const draft = emptyCharacterDraft("Test Cleric");
  draft.ancestryId = dwarf.id;
  draft.heritageId = forge.id;
  draft.backgroundId = acolyte.id;
  draft.classId = cleric.id;
  draft.deityId = abadar.id;
  draft.keyAbility = "wis";
  draft.boosts.ancestry = ["str"];
  draft.boosts.background = ["wis", "con"];
  draft.boosts.free = ["str", "dex", "con", "wis"];
  draft.skills.trained = ["arcana", "medicine"];
  draft.feats.ancestry["1"] = dwarvenWeaponFamiliarity.id;
  draft.classChoices[doctrine.key] = [warpriest.id];
  draft.spells.tradition = "divine";
  draft.spells.cantrips = [guidance.id];
  draft.spells.known = [bless.id];
  draft.spells.prepared = [bless.id];

  const context: CharacterContext = {
    ancestry: dwarf,
    heritage: forge,
    background: acolyte,
    classData: cleric,
    deity: abadar,
    feats: { [dwarvenWeaponFamiliarity.id]: dwarvenWeaponFamiliarity },
    spells: { [guidance.id]: guidance, [bless.id]: bless },
    equipment: {},
  };
  return { draft, context };
}

describe("PF2e character rules", () => {
  it("builds a level 1 cleric with correct scores and defenses", () => {
    const { draft, context } = buildCleric();
    const derived = computeCharacter(draft, context);
    expect(derived.abilities).toEqual({
      str: 14,
      dex: 12,
      con: 16,
      int: 10,
      wis: 18,
      cha: 8,
    });
    expect(derived.abilityMods).toEqual({ str: 2, dex: 1, con: 3, int: 0, wis: 4, cha: -1 });
    expect(derived.maxHp).toBe(21);
    expect(derived.ac).toBe(14);
    // Warpriest's first doctrine grants expert Fortitude.
    expect(derived.saves).toEqual({ fortitude: 8, reflex: 4, will: 9 });
    expect(derived.perception).toBe(7);
    expect(derived.classDc).toBe(17);
    expect(derived.spellDc).toBe(17);
    expect(derived.spellAttack).toBe(7);
    expect(derived.divineFontSlots).toBe(4);
    expect(derived.divineFontRank).toBe(1);
    expect(derived.validation.filter((issue) => issue.severity === "error")).toEqual([]);
  });

  it("records unresolved builder choices in the character summary", () => {
    const empty = emptyCharacterDraft("Unfinished Hero");
    const emptySummary = characterSummary(empty, { feats: {}, spells: {}, equipment: {} });
    expect(emptySummary.validationErrors).toBeGreaterThan(0);

    const { draft, context } = buildCleric();
    const readySummary = characterSummary(draft, context);
    expect(readySummary.validationErrors).toBe(0);
  });

  it("blocks class feats that belong to another class", () => {
    const reachSpell = read<Feat>("feats.json").find((feat) => feat.name === "Reach Spell")!;
    const classes = read<ClassData>("classes.json");
    const fighter = classes.find((entry) => entry.name === "Fighter")!;
    const wizard = classes.find((entry) => entry.name === "Wizard")!;
    const context = {
      feats: { [reachSpell.id]: reachSpell },
      spells: {},
      equipment: {},
      classData: fighter,
    };
    expect(featClassAccess(reachSpell, context).allowed).toBe(false);
    expect(featClassAccess(reachSpell, { ...context, classData: wizard }).allowed).toBe(true);

    const draft = emptyCharacterDraft("Illegal Fighter");
    draft.classId = fighter.id;
    draft.feats.class["1"] = reachSpell.id;
    const derived = computeCharacter(draft, context);
    expect(
      derived.validation.some((issue) => issue.message.includes("not available to Fighter"))
    ).toBe(true);
  });

  it("trains background, class, and deity skills", () => {
    const { draft, context } = buildCleric();
    const derived = computeCharacter(draft, context);
    const byName = Object.fromEntries(derived.skills.map((skill) => [skill.id, skill]));
    expect(byName.arcana.mod).toBe(3);
    expect(byName.medicine.mod).toBe(7); // Wis +4, trained at level 1
    expect(byName.religion.mod).toBe(7);
    expect(byName.society.mod).toBe(3);
    expect(derived.lore[0].name).toBe("Scribing Lore");
    expect(derived.grantedFeats[0].name).toBe("Student of the Canon");
  });

  it("computes fists and adds level boosts", () => {
    const { draft, context } = buildCleric();
    draft.level = 5;
    draft.boosts.levels["5"] = ["str", "dex", "con", "wis"];
    const derived = computeCharacter(draft, context);
    expect(derived.abilities.str).toBe(16);
    // Wisdom starts at 18. A boost at 5th level is a partial boost (+1) while
    // the modifier is already +4, so it becomes 19, not 20.
    expect(derived.abilities.wis).toBe(19);
    expect(fullCasterSlots(5)).toEqual([3, 3, 2]);
    // Cleric: 3/3/2 base plus 5 divine font slots at the highest rank.
    expect(derived.spellSlots).toEqual([3, 3, 7]);
    expect(derived.divineFontSlots).toBe(5);
    expect(derived.divineFontRank).toBe(3);
    expect(derived.attacks.find((attack) => attack.name === "Fist")?.attackBonus).toBe(10);
  });

  it("normalizes partial drafts safely", () => {
    const draft = normalizeCharacterDraft(
      {
        name: "Half-Built",
        level: 99,
        boosts: { free: ["str", "str", "dex"] },
        equipment: [{ itemId: "item:x", quantity: -1 }],
        details: { notes: "Hello" },
      },
      "Fallback"
    );
    expect(draft.level).toBe(20);
    expect(draft.name).toBe("Half-Built");
    expect(draft.boosts.free).toHaveLength(4);
    expect(draft.equipment[0].quantity).toBe(1);
    expect(draft.details.notes).toBe("Hello");
  });

  it("normalizes character condition values and durations", () => {
    const draft = normalizeCharacterDraft(
      {
        name: "Condition Test",
        play: { conditions: [{ name: "Frightened", value: 2, duration: 3 }] },
      },
      "Fallback"
    );
    expect(draft.play.conditions[0]).toEqual({ name: "Frightened", value: 2, duration: 3 });
  });

  it("preserves companion bestiary links when normalizing", () => {
    const draft = normalizeCharacterDraft(
      {
        name: "Beastmaster",
        companions: [
          {
            id: "comp_wolf",
            name: "Wolf",
            kind: "animal",
            level: 1,
            hpCurrent: 10,
            hpMax: 10,
            ac: 15,
            monsterId: "monster:wolf",
            notes: "Jaws +6",
          },
        ],
      },
      "Fallback"
    );
    expect(draft.companions[0].monsterId).toBe("monster:wolf");
    expect(draft.companions[0].name).toBe("Wolf");
  });

  it("uses partial boosts at 5th, 10th, 15th, and 20th level", () => {
    const { draft, context } = buildCleric();
    draft.level = 10;
    draft.boosts.levels["5"] = ["wis", "str", "dex", "con"];
    draft.boosts.levels["10"] = ["wis", "str", "dex", "con"];
    expect(computeCharacter(draft, context).abilities.wis).toBe(20);

    draft.level = 15;
    draft.boosts.levels["15"] = ["wis", "str", "dex", "con"];
    expect(computeCharacter(draft, context).abilities.wis).toBe(21);

    draft.level = 20;
    draft.boosts.levels["20"] = ["wis", "str", "dex", "con"];
    expect(computeCharacter(draft, context).abilities.wis).toBe(22);
  });

  it("waives armor check and speed penalties when Strength meets the requirement", () => {
    const human = ancestries.find((entry) => entry.name === "Human")!;
    const fighter = classes.find((entry) => entry.name === "Fighter")!;
    const chainMail = equipment.find((entry) => entry.name === "Chain Mail")!;

    const build = (strong: boolean) => {
      const draft = emptyCharacterDraft("Armored Fighter");
      draft.ancestryId = human.id;
      draft.classId = fighter.id;
      draft.keyAbility = "str";
      draft.boosts.ancestry = strong ? ["str", "dex"] : ["dex", "con"];
      draft.boosts.free = strong ? ["str", "dex", "con", "wis"] : ["dex", "con", "wis", "cha"];
      draft.skills.trained = ["athletics"];
      draft.equipment = [{ itemId: chainMail.id, quantity: 1, equipped: true }];
      const context: CharacterContext = {
        ancestry: human,
        classData: fighter,
        feats: {},
        spells: {},
        equipment: { [chainMail.id]: chainMail },
      };
      return computeCharacter(draft, context);
    };

    const strong = build(true);
    expect(strong.abilities.str).toBe(16);
    expect(strong.speed).toBe(25);
    expect(strong.skills.find((skill) => skill.id === "athletics")?.mod).toBe(6);

    const weak = build(false);
    expect(weak.abilities.str).toBe(12);
    expect(weak.speed).toBe(20);
    expect(weak.skills.find((skill) => skill.id === "athletics")?.mod).toBe(2);
  });

  it("uses Intelligence for a magus's spell DC and attack", () => {
    const human = ancestries.find((entry) => entry.name === "Human")!;
    const magus = classes.find((entry) => entry.name === "Magus")!;
    const scion = backgrounds.find((entry) => entry.name === "Academic Scion")!;

    const draft = emptyCharacterDraft("Test Magus");
    draft.ancestryId = human.id;
    draft.backgroundId = scion.id;
    draft.classId = magus.id;
    draft.keyAbility = "str";
    draft.boosts.ancestry = ["int", "dex"];
    draft.boosts.background = ["int", "wis"];
    draft.boosts.free = ["int", "dex", "con", "wis"];

    const context: CharacterContext = {
      ancestry: human,
      background: scion,
      classData: magus,
      feats: {},
      spells: {},
      equipment: {},
    };
    const derived = computeCharacter(draft, context);
    expect(casterInfo(magus).spellAbility).toBe("int");
    expect(derived.abilities.int).toBe(16);
    expect(derived.spellDc).toBe(16);
    expect(derived.spellAttack).toBe(6);
  });

  it("treats champions as Charisma-based focus casters", () => {
    const human = ancestries.find((entry) => entry.name === "Human")!;
    const champion = classes.find((entry) => entry.name === "Champion")!;
    const blessed = backgrounds.find((entry) => entry.name === "Blessed")!;
    const abadar = deities.find((entry) => entry.name === "Abadar")!;

    const draft = emptyCharacterDraft("Test Champion");
    draft.ancestryId = human.id;
    draft.backgroundId = blessed.id;
    draft.classId = champion.id;
    draft.deityId = abadar.id;
    draft.keyAbility = "str";
    draft.boosts.ancestry = ["cha", "con"];
    draft.boosts.background = ["cha", "int"];
    draft.boosts.free = ["cha", "con", "wis", "dex"];

    const context: CharacterContext = {
      ancestry: human,
      background: blessed,
      classData: champion,
      deity: abadar,
      feats: {},
      spells: {},
      equipment: {},
    };
    const derived = computeCharacter(draft, context);
    expect(casterInfo(champion).progression).toBe("focus");
    expect(casterInfo(champion).spellAbility).toBe("cha");
    expect(derived.abilities.cha).toBe(16);
    expect(derived.spellDc).toBe(16);
    expect(derived.spellSlots).toBeNull();
    expect(derived.spellSlotsNote).toContain("Focus spells");
  });

  it("grants deity, subclass, and background skill choices", () => {
    const { draft, context } = buildCleric();
    expect(grantedTrainedSkills(draft, context).has("society")).toBe(true); // Abadar

    const rogue = classes.find((entry) => entry.name === "Rogue")!;
    const racket = rogue.choiceGroups.find((group) => group.tag === "rogue-racket")!;
    const thief = racket.options.find((option) => option.name === "Thief")!;
    const rogueDraft = emptyCharacterDraft("Test Rogue");
    rogueDraft.classId = rogue.id;
    rogueDraft.classChoices[racket.key] = [thief.id];
    const rogueSkills = grantedTrainedSkills(rogueDraft, {
      classData: rogue,
      feats: {},
      spells: {},
      equipment: {},
    });
    expect(rogueSkills.has("stealth")).toBe(true);
    expect(rogueSkills.has("thievery")).toBe(true);

    const druid = classes.find((entry) => entry.name === "Druid")!;
    const order = druid.choiceGroups.find((group) => group.tag === "druid-order")!;
    const animal = order.options.find((option) => option.name === "Animal Order")!;
    const druidDraft = emptyCharacterDraft("Test Druid");
    druidDraft.classId = druid.id;
    druidDraft.classChoices[order.key] = [animal.id];
    const druidSkills = grantedTrainedSkills(druidDraft, {
      classData: druid,
      feats: {},
      spells: {},
      equipment: {},
    });
    expect(druidSkills.has("athletics")).toBe(true);

    const hermit = backgrounds.find((entry) => entry.name === "Hermit")!;
    const backgroundDraft = emptyCharacterDraft("Test Hermit");
    backgroundDraft.backgroundId = hermit.id;
    backgroundDraft.skills.background = ["nature"];
    const backgroundSkills = grantedTrainedSkills(backgroundDraft, {
      background: hermit,
      feats: {},
      spells: {},
      equipment: {},
    });
    expect(backgroundSkills.has("nature")).toBe(true);

    const shelyn = deities.find((entry) => entry.name === "Shelyn")!;
    const deityDraft = emptyCharacterDraft("Test Shelyn");
    deityDraft.deityId = shelyn.id;
    deityDraft.deitySkill = "performance";
    const deitySkills = grantedTrainedSkills(deityDraft, {
      deity: shelyn,
      feats: {},
      spells: {},
      equipment: {},
    });
    expect(deitySkills.has("performance")).toBe(true);
  });

  it("lets a skill increase train an untrained skill", () => {
    const { draft, context } = buildCleric();
    draft.level = 3;
    draft.skills.increases["3"] = "athletics";
    const derived = computeCharacter(draft, context);
    expect(derived.skills.find((skill) => skill.id === "athletics")?.rank).toBe(1);
    expect(derived.validation.some((issue) => issue.message.includes("already trained"))).toBe(
      false
    );
  });

  it("uses the bounded and focus slot tables", () => {
    expect(boundedCasterSlots(1)).toEqual([1]);
    expect(boundedCasterSlots(2)).toEqual([2]);
    expect(boundedCasterSlots(3)).toEqual([2, 1]);
    expect(boundedCasterSlots(4)).toEqual([2, 2]);
    expect(boundedCasterSlots(7)).toEqual([2, 2, 2, 1]);
    expect(spellSlotsFor(7, "bounded")).toEqual([2, 2, 2, 1]);
    expect(spellSlotsFor(1, "focus")).toBeNull();
    expect(animistSlots(1)).toEqual([2]);
    expect(animistSlots(3)).toEqual([3, 2]);
    expect(animistSlots(10)).toEqual([4, 4, 4, 3, 3]);
    expect(animistSlots(15)).toEqual([4, 4, 4, 4, 4, 4, 3, 2]);
    expect(spellSlotsFor(10, "full", "Animist")).toEqual([4, 4, 4, 3, 3]);
    expect(spellSlotsFor(1, "full", "Cleric")).toEqual([6]);
    expect(spellSlotsFor(5, "full", "Cleric")).toEqual([3, 3, 7]);
    expect(spellSlotsFor(15, "full", "Cleric")).toEqual([3, 3, 3, 3, 3, 3, 3, 8]);
    expect(spellSlotsFor(1, "full", "Wizard")).toEqual([3]);
    expect(spellSlotsFor(5, "full", "Wizard")).toEqual([4, 4, 3]);
    expect(fullCasterSlots(19)).toEqual([3, 3, 3, 3, 3, 3, 3, 3, 3, 1]);
    expect(fullCasterSlots(20)).toEqual([3, 3, 3, 3, 3, 3, 3, 3, 3, 1]);
    expect(boundedCasterSlots(19)).toEqual([2, 2, 2, 2, 2, 2, 2, 2, 2]);
    expect(boundedCasterSlots(20)).toEqual([2, 2, 2, 2, 2, 2, 2, 2, 2]);
    expect(spellSlotsFor(19, "full", "Wizard")).toEqual([4, 4, 4, 4, 4, 4, 4, 4, 4, 1]);
    expect(spellSlotsFor(19, "full", "Cleric")).toEqual([3, 3, 3, 3, 3, 3, 3, 3, 9, 1]);
    expect(spellSlotsFor(19, "bounded", "Psychic")).toEqual([2, 2, 2, 2, 2, 2, 2, 2, 2, 1]);
    expect(spellSlotsFor(19, "bounded", "Necromancer")).toEqual([2, 2, 2, 2, 2, 2, 2, 2, 2, 1]);
    expect(spellSlotsFor(19, "bounded", "Magus")).toEqual([2, 2, 2, 2, 2, 2, 2, 2, 2]);
  });

  it("tracks cleric divine font separately from ordinary slots", () => {
    expect(divineFontInfo(1, "Cleric")).toEqual({ slots: 4, rank: 1 });
    expect(divineFontInfo(5, "Cleric")).toEqual({ slots: 5, rank: 3 });
    expect(divineFontInfo(15, "Cleric")).toEqual({ slots: 6, rank: 8 });
    expect(divineFontInfo(19, "Cleric")).toEqual({ slots: 6, rank: 9 });
    expect(divineFontInfo(10, "Wizard")).toBeNull();
  });

  it("treats a deity's favored weapon as proficient", () => {
    const { draft, context } = buildCleric();
    const iomedae = deities.find((entry) => entry.name === "Iomedae")!;
    const longsword = equipment.find((entry) => entry.name === "Longsword")!;
    draft.deityId = iomedae.id;
    draft.equipment = [{ itemId: longsword.id, quantity: 1, equipped: true }];
    const withSword: CharacterContext = {
      ...context,
      deity: iomedae,
      equipment: { [longsword.id]: longsword },
    };
    const derived = computeCharacter(draft, withSword);
    // Clerics are untrained in martial weapons, but Iomedae grants the
    // longsword as a favored weapon. 3 (trained) + 2 (Strength) = 5.
    expect(derived.attacks.find((attack) => attack.name === "Longsword")?.attackBonus).toBe(5);
  });

  it("applies warpriest doctrine armor proficiency", () => {
    const { draft, context } = buildCleric();
    const chainMail = equipment.find((entry) => entry.name === "Chain Mail")!;
    draft.equipment = [{ itemId: chainMail.id, quantity: 1, equipped: true }];
    const derived = computeCharacter(draft, {
      ...context,
      equipment: { [chainMail.id]: chainMail },
    });
    // 10 + Dex 1 (capped at 1) + armor 4 + trained proficiency 3.
    expect(derived.prof.defenses.medium).toBe(1);
    expect(derived.ac).toBe(18);
  });

  it("adds class-granted custom lore such as Esoteric Lore", () => {
    const thaumaturge = classes.find((entry) => entry.name === "Thaumaturge")!;
    const draft = emptyCharacterDraft("Test Thaumaturge");
    draft.classId = thaumaturge.id;
    const derived = computeCharacter(draft, {
      classData: thaumaturge,
      feats: {},
      spells: {},
      equipment: {},
    });
    const esoteric = derived.lore.find((entry) => entry.name === "Esoteric Lore");
    // Charisma 12 (class key boost) gives a +1 modifier on top of training.
    expect(esoteric).toMatchObject({ rank: 1, mod: 4 });
  });

  it("enforces the skill rank cap at each increase level", () => {
    const { draft, context } = buildCleric();
    draft.level = 9;
    draft.skills.increases = {
      "3": "athletics",
      "5": "athletics",
      "7": "athletics",
      "9": "athletics",
    };
    const derived = computeCharacter(draft, context);
    expect(derived.skills.find((skill) => skill.id === "athletics")?.rank).toBe(4);
    expect(
      derived.validation.some((issue) =>
        issue.message.includes("above the proficiency rank allowed")
      )
    ).toBe(true);
  });

  it("adds half Strength to propulsive ranged damage", () => {
    const human = ancestries.find((entry) => entry.name === "Human")!;
    const fighter = classes.find((entry) => entry.name === "Fighter")!;
    const bow = equipment.find((entry) => entry.name === "Composite Longbow")!;
    const draft = emptyCharacterDraft("Test Archer");
    draft.ancestryId = human.id;
    draft.classId = fighter.id;
    draft.keyAbility = "str";
    draft.boosts.ancestry = ["str", "dex"];
    draft.boosts.free = ["str", "dex", "con", "wis"];
    draft.equipment = [{ itemId: bow.id, quantity: 1, equipped: true }];
    const derived = computeCharacter(draft, {
      ancestry: human,
      classData: fighter,
      feats: {},
      spells: {},
      equipment: { [bow.id]: bow },
    });
    expect(derived.abilities.str).toBe(16);
    // Propulsive adds half the Strength modifier (+3 / 2 = +1).
    expect(
      derived.attacks.find((attack) => attack.name === "Composite Longbow")?.damageFormula
    ).toBe("1d8+1");
  });

  it("gives gunslingers expert proficiency with firearms at 1st level", () => {
    const human = ancestries.find((entry) => entry.name === "Human")!;
    const gunslinger = classes.find((entry) => entry.name === "Gunslinger")!;
    const pistol = equipment.find((entry) => entry.name === "Dueling Pistol")!;
    const draft = emptyCharacterDraft("Test Gunslinger");
    draft.ancestryId = human.id;
    draft.classId = gunslinger.id;
    draft.keyAbility = "dex";
    draft.boosts.ancestry = ["dex", "con"];
    draft.boosts.free = ["dex", "con", "wis", "cha"];
    draft.equipment = [{ itemId: pistol.id, quantity: 1, equipped: true }];
    const derived = computeCharacter(draft, {
      ancestry: human,
      classData: gunslinger,
      feats: {},
      spells: {},
      equipment: { [pistol.id]: pistol },
    });
    // Expert (rank 2) from the gunslinger's firearm proficiency, not just the
    // trained martial-weapon rank: 5 + Dexterity 3 = 8.
    expect(derived.attacks.find((attack) => attack.name === "Dueling Pistol")?.attackBonus).toBe(8);
  });

  it("keeps non-land ancestry speeds", () => {
    const merfolk = ancestries.find((entry) => entry.name === "Merfolk")!;
    const draft = emptyCharacterDraft("Merfolk");
    draft.ancestryId = merfolk.id;
    const derived = computeCharacter(draft, {
      ancestry: merfolk,
      feats: {},
      spells: {},
      equipment: {},
    });
    expect(derived.speed).toBe(5);
    expect(derived.otherSpeeds).toContainEqual({ type: "swim", value: 25 });
  });

  it("applies automatic class-feature skill rank upgrades", () => {
    const inventor = classes.find((entry) => entry.name === "Inventor")!;
    const draft = emptyCharacterDraft("Test Inventor");
    draft.classId = inventor.id;
    draft.level = 7;
    const derived = computeCharacter(draft, {
      classData: inventor,
      feats: {},
      spells: {},
      equipment: {},
    });
    expect(derived.skills.find((skill) => skill.id === "crafting")?.rank).toBe(3);
  });

  it("enforces spontaneous spell repertoire limits", () => {
    const bard = classes.find((entry) => entry.name === "Bard")!;
    const summoner = classes.find((entry) => entry.name === "Summoner")!;
    expect(spellRepertoireLimits(bard, 1)).toEqual({ cantrips: 5, ranks: [2] });
    expect(spellRepertoireLimits(bard, 5)).toEqual({ cantrips: 5, ranks: [3, 3, 2] });
    expect(spellRepertoireLimits(summoner, 3)).toEqual({ cantrips: 5, ranks: [2, 1] });
    expect(
      spellRepertoireLimits(
        classes.find((entry) => entry.name === "Wizard")!,
        5
      )
    ).toBeNull();

    const rankOne = spells.filter((spell) => spell.rank === 1).slice(0, 3);
    const draft = emptyCharacterDraft("Test Bard");
    draft.classId = bard.id;
    draft.spells.known = rankOne.map((spell) => spell.id);
    const context: CharacterContext = {
      classData: bard,
      feats: {},
      spells: Object.fromEntries(rankOne.map((spell) => [spell.id, spell])),
      equipment: {},
    };
    const over = computeCharacter(draft, context);
    expect(
      over.validation.some((issue) =>
        issue.message.includes("knows 3 rank 1 spells but the repertoire allows 2")
      )
    ).toBe(true);

    draft.spells.known = rankOne.slice(0, 2).map((spell) => spell.id);
    const legal = computeCharacter(draft, context);
    expect(
      legal.validation.some((issue) =>
        issue.message.includes("rank 1 spells but the repertoire allows")
      )
    ).toBe(false);
  });

  it("checks prepared spell slot limits", () => {
    const wizard = classes.find((entry) => entry.name === "Wizard")!;
    const rankOne = spells.filter((spell) => spell.rank === 1).slice(0, 4);
    const draft = emptyCharacterDraft("Test Wizard");
    draft.classId = wizard.id;
    draft.spells.known = rankOne.map((spell) => spell.id);
    draft.spells.prepared = rankOne.map((spell) => spell.id);
    const context: CharacterContext = {
      classData: wizard,
      feats: {},
      spells: Object.fromEntries(rankOne.map((spell) => [spell.id, spell])),
      equipment: {},
    };
    const over = computeCharacter(draft, context);
    expect(
      over.validation.some((issue) =>
        issue.message.includes("4 rank 1 spells prepared but only 3 slots")
      )
    ).toBe(true);

    draft.spells.prepared = rankOne.slice(0, 3).map((spell) => spell.id);
    const legal = computeCharacter(draft, context);
    expect(
      legal.validation.some((issue) => issue.message.includes("spells prepared but only"))
    ).toBe(false);
  });

  it("grants the chosen background starting feat", () => {
    const antiThrune = backgrounds.find((entry) => entry.name === "Anti-Thrune Saboteur")!;
    const dirtyTrick = feats.find((entry) => entry.name === "Dirty Trick")!;
    const draft = emptyCharacterDraft("Saboteur");
    draft.backgroundId = antiThrune.id;
    const context: CharacterContext = {
      background: antiThrune,
      feats: {},
      spells: {},
      equipment: {},
    };
    const missing = computeCharacter(draft, context);
    expect(
      missing.validation.some((issue) => issue.message.includes("Choose your starting feat"))
    ).toBe(true);

    draft.backgroundFeat = dirtyTrick.id;
    const selected = computeCharacter(draft, context);
    expect(selected.grantedFeats.map((feat) => feat.name)).toContain("Dirty Trick");
    expect(
      selected.validation.some((issue) => issue.message.includes("Choose your starting feat"))
    ).toBe(false);
  });

  it("adds background-granted Lore choices", () => {
    const timeTraveler = backgrounds.find((entry) => entry.name === "Time Traveler")!;
    const draft = emptyCharacterDraft("Time Traveler");
    draft.backgroundId = timeTraveler.id;
    draft.skills.backgroundLore = ["Farming Lore", "Sailing Lore", "Warfare Lore"];
    const context: CharacterContext = {
      background: timeTraveler,
      feats: {},
      spells: {},
      equipment: {},
    };
    const derived = computeCharacter(draft, context);
    expect(derived.lore.map((entry) => entry.name)).toEqual(
      expect.arrayContaining(["Farming Lore", "Sailing Lore", "Warfare Lore"])
    );
    expect(
      derived.validation.some((issue) =>
        issue.message.includes("Choose 3 Lore skills for Time Traveler")
      )
    ).toBe(false);

    const missing = computeCharacter(
      { ...draft, skills: { ...draft.skills, backgroundLore: [] } },
      context
    );
    expect(
      missing.validation.some((issue) =>
        issue.message.includes("Choose 3 Lore skills for Time Traveler")
      )
    ).toBe(true);
  });

  it("evaluates common feat prerequisites", () => {
    const rogue = classes.find((entry) => entry.name === "Rogue")!;
    const ranger = classes.find((entry) => entry.name === "Ranger")!;
    const titan = feats.find((entry) => entry.name === "Titan Wrestler")!;
    const harder = feats.find((entry) => entry.name === "The Harder They Fall (Kingmaker)")!;
    const draft = emptyCharacterDraft("Prereq Rogue");
    draft.classId = rogue.id;
    draft.feats.skill["1"] = titan.id;
    const context: CharacterContext = {
      classData: rogue,
      feats: { [titan.id]: titan },
      spells: {},
      equipment: {},
      featNames: feats.map((feat) => feat.name.toLowerCase()),
    };
    const untrained = computeCharacter(draft, context);
    expect(featPrerequisiteStatus(titan, draft, context, untrained).status).toBe("unmet");
    expect(featAvailability(titan, draft, context, untrained)).toBe("blocked");
    expect(
      untrained.validation.some((issue) =>
        issue.message.includes("Titan Wrestler prerequisites are not met")
      )
    ).toBe(true);
    expect(checkFeatPrerequisite("Strength +2", draft, context, untrained)).toBe("unmet");

    draft.skills.trained = ["athletics"];
    const trained = computeCharacter(draft, context);
    expect(featPrerequisiteStatus(titan, draft, context, trained).status).toBe("met");
    expect(featAvailability(titan, draft, context, trained)).toBe("available");
    expect(
      featPrerequisiteStatus(harder, draft, { ...context, classData: ranger }, trained).status
    ).toBe("met");
    expect(
      checkFeatPrerequisite("trained in Athletics or Acrobatics", draft, context, trained)
    ).toBe("met");
    expect(
      trained.validation.some((issue) =>
        issue.message.includes("Titan Wrestler prerequisites are not met")
      )
    ).toBe(false);
  });

  it("marks story and campaign prerequisites as needing review", () => {
    const rogue = classes.find((entry) => entry.name === "Rogue")!;
    const draft = emptyCharacterDraft("Story Rogue");
    draft.classId = rogue.id;
    const derived = computeCharacter(draft, {
      classData: rogue,
      feats: {},
      spells: {},
      equipment: {},
    });
    expect(
      checkFeatPrerequisite(
        "member of the Pathfinder Society",
        draft,
        {
          classData: rogue,
          feats: {},
          spells: {},
          equipment: {},
        },
        derived
      )
    ).toBe("unknown");
  });

  it("applies fundamental and property runes to attacks, AC, and saves", () => {
    const human = ancestries.find((entry) => entry.name === "Human")!;
    const fighter = classes.find((entry) => entry.name === "Fighter")!;
    const longsword = equipment.find((entry) => entry.name === "Longsword")!;
    const chainMail = equipment.find((entry) => entry.name === "Chain Mail")!;
    const weaponPotency = equipment.find((entry) => entry.name === "Weapon Potency (+1)")!;
    const striking = equipment.find((entry) => entry.name === "Striking")!;
    const armorPotency = equipment.find((entry) => entry.name === "Armor Potency (+1)")!;
    const resilient = equipment.find((entry) => entry.name === "Resilient")!;
    const flaming = equipment.find((entry) => entry.name === "Flaming")!;

    const draft = emptyCharacterDraft("Rune Fighter");
    draft.level = 5;
    draft.ancestryId = human.id;
    draft.classId = fighter.id;
    draft.keyAbility = "str";
    draft.boosts.ancestry = ["str", "dex"];
    draft.boosts.free = ["str", "dex", "con", "wis"];
    draft.equipment = [
      { itemId: longsword.id, quantity: 1, equipped: true },
      { itemId: chainMail.id, quantity: 1, equipped: true },
    ];
    const context: CharacterContext = {
      ancestry: human,
      classData: fighter,
      feats: {},
      spells: {},
      equipment: { [longsword.id]: longsword, [chainMail.id]: chainMail },
    };
    const baseline = computeCharacter(draft, context);

    draft.equipment = [
      {
        itemId: longsword.id,
        quantity: 1,
        equipped: true,
        runes: [weaponPotency.id, striking.id, flaming.id],
      },
      {
        itemId: chainMail.id,
        quantity: 1,
        equipped: true,
        runes: [armorPotency.id, resilient.id],
      },
    ];
    const runedContext: CharacterContext = {
      ...context,
      equipment: {
        ...context.equipment,
        [weaponPotency.id]: weaponPotency,
        [striking.id]: striking,
        [armorPotency.id]: armorPotency,
        [resilient.id]: resilient,
        [flaming.id]: flaming,
      },
    };
    const runed = computeCharacter(draft, runedContext);
    const baselineSword = baseline.attacks.find((attack) => attack.name === "Longsword")!;
    const runedSword = runed.attacks.find((attack) => attack.name === "Longsword")!;

    expect(runedSword.attackBonus).toBe(baselineSword.attackBonus + 1);
    expect(runedSword.damageFormula.startsWith("2d8")).toBe(true);
    expect(runedSword.extraDamage).toEqual([{ formula: "1d6", type: "fire", label: "Flaming" }]);
    expect(runed.ac).toBe(baseline.ac + 1);
    expect(runed.saves.fortitude).toBe(baseline.saves.fortitude + 1);
    expect(runed.saves.reflex).toBe(baseline.saves.reflex + 1);
    expect(runed.saves.will).toBe(baseline.saves.will + 1);
    expect(runed.wealth.spent).toBeGreaterThan(baseline.wealth.spent);
  });

  it("applies reinforcing runes to shield durability", () => {
    const human = ancestries.find((entry) => entry.name === "Human")!;
    const fighter = classes.find((entry) => entry.name === "Fighter")!;
    const shield = equipment.find((entry) => entry.name === "Broadleaf Shield")!;
    const reinforcing = equipment.find((entry) => entry.name === "Reinforcing Rune (Minor)")!;
    const draft = emptyCharacterDraft("Shield Fighter");
    draft.ancestryId = human.id;
    draft.classId = fighter.id;
    draft.keyAbility = "str";
    draft.equipment = [
      {
        itemId: shield.id,
        quantity: 1,
        equipped: true,
        runes: [reinforcing.id],
      },
    ];
    const derived = computeCharacter(draft, {
      ancestry: human,
      classData: fighter,
      feats: {},
      spells: {},
      equipment: { [shield.id]: shield, [reinforcing.id]: reinforcing },
    });
    expect(derived.shield).toMatchObject({
      name: "Broadleaf Shield",
      hardness: 7,
      hp: 60,
      brokenThreshold: 30,
    });
  });

  it("never lowers a superior shield below its base durability with a reinforcing rune", () => {
    const human = ancestries.find((entry) => entry.name === "Human")!;
    const fighter = classes.find((entry) => entry.name === "Fighter")!;
    const shield = equipment.find((entry) => entry.name === "Arctic Worm Chitin Shield")!;
    const reinforcing = equipment.find((entry) => entry.name === "Reinforcing Rune (Minor)")!;
    const draft = emptyCharacterDraft("Shield Fighter");
    draft.ancestryId = human.id;
    draft.classId = fighter.id;
    draft.keyAbility = "str";
    draft.equipment = [
      {
        itemId: shield.id,
        quantity: 1,
        equipped: true,
        runes: [reinforcing.id],
      },
    ];
    const derived = computeCharacter(draft, {
      ancestry: human,
      classData: fighter,
      feats: {},
      spells: {},
      equipment: { [shield.id]: shield, [reinforcing.id]: reinforcing },
    });
    expect(derived.shield?.hardness).toBe(shield.shield!.hardness);
    expect(derived.shield?.hp).toBe(shield.shield!.hp);
  });

  it("adds weapon specialization damage for proficient weapons", () => {
    const human = ancestries.find((entry) => entry.name === "Human")!;
    const fighter = classes.find((entry) => entry.name === "Fighter")!;
    const longsword = equipment.find((entry) => entry.name === "Longsword")!;
    const draft = emptyCharacterDraft("Test Fighter");
    draft.level = 7;
    draft.ancestryId = human.id;
    draft.classId = fighter.id;
    draft.keyAbility = "str";
    draft.boosts.ancestry = ["str", "dex"];
    draft.boosts.free = ["str", "dex", "con", "wis"];
    draft.equipment = [{ itemId: longsword.id, quantity: 1, equipped: true }];
    const context: CharacterContext = {
      ancestry: human,
      classData: fighter,
      feats: {},
      spells: {},
      equipment: { [longsword.id]: longsword },
    };
    const derived = computeCharacter(draft, context);
    expect(derived.prof.attacks.martial).toBe(3); // master from Fighter Weapon Mastery
    expect(derived.attacks.find((attack) => attack.name === "Longsword")?.damageFormula).toBe(
      "1d8+6"
    );
  });
});
