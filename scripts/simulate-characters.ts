import fs from "node:fs";
import path from "node:path";
import {
  abilityMod,
  automaticSkillRanks,
  baseAbilityScores,
  casterInfo,
  classKeyOptions,
  computeCharacter,
  divineFontInfo,
  emptyCharacterDraft,
  featPrerequisiteStatus,
  featSlotsFor,
  flexibleBoosts,
  grantedTrainedSkills,
  normalizeCharacterDraft,
  ordinarySpellSlotsFor,
  skillRankCap,
  spellRepertoireLimits,
  spellSlotsFor,
} from "../src/shared/rules";
import { validateFormula } from "../src/shared/dice";
import { automationForEquipment, automationForFeat } from "../src/shared/automation";
import {
  featAllowedByHeritageGrant,
  heritageChosenFeatId,
  heritageFeatGrant,
  heritageSkillChoice,
} from "../src/shared/heritage";
import { SKILLS } from "../src/shared/types";
import { activeGrantChoiceGroups } from "../src/shared/classGrantChoices";
import { selectedClassGrants } from "../src/shared/classGrants";
import type {
  Ancestry,
  Background,
  CharacterContext,
  CharacterDraft,
  ClassData,
  Deity,
  Equipment,
  Feat,
  Heritage,
  Spell,
} from "../src/shared/types";

const dir = path.resolve("data", "compendium");
const read = <T>(file: string): T[] =>
  JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")) as T[];

const ancestries = read<Ancestry>("ancestries.json");
const heritages = read<Heritage>("heritages.json");
const backgrounds = read<Background>("backgrounds.json");
const classes = read<ClassData>("classes.json");
const feats = read<Feat>("feats.json");
const spells = read<Spell>("spells.json");
const equipment = read<Equipment>("equipment.json");
const deities = read<Deity>("deities.json");

const remasterAncestries = ancestries.filter((entry) => entry.remaster);
const remasterBackgrounds = backgrounds.filter((entry) => entry.remaster);
const remasterClasses = classes.filter((entry) => entry.remaster);
const remasterFeats = feats.filter((entry) => entry.remaster);
const remasterSpells = spells.filter((entry) => entry.remaster);
const featNames = feats.map((entry) => entry.name.toLowerCase());

// Automation gap tally across every simulated selection, so the most common
// "manual" options stay visible to the developer.
const automationTally = { full: 0, partial: 0, manual: 0 };
const manualFeatFrequency = new Map<string, number>();
const manualItemFrequency = new Map<string, number>();

function mulberry32(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = (rng: () => number) => rng();
const pick = <T>(rng: () => number, items: T[]): T => items[Math.floor(rng() * items.length)];
const sample = <T>(rng: () => number, items: T[], count: number): T[] => {
  const copy = [...items];
  const out: T[] = [];
  while (copy.length && out.length < count)
    out.push(copy.splice(Math.floor(rng() * copy.length), 1)[0]);
  return out;
};

function contextFor(
  draft: CharacterDraft,
  selectedFeats: Feat[],
  selectedSpells: Spell[],
  selectedEquipment: Equipment[]
): CharacterContext {
  return {
    ancestry: ancestries.find((entry) => entry.id === draft.ancestryId) ?? null,
    heritage: heritages.find((entry) => entry.id === draft.heritageId) ?? null,
    background: backgrounds.find((entry) => entry.id === draft.backgroundId) ?? null,
    classData: classes.find((entry) => entry.id === draft.classId) ?? null,
    deity: deities.find((entry) => entry.id === draft.deityId) ?? null,
    feats: Object.fromEntries(selectedFeats.map((feat) => [feat.id, feat])),
    spells: Object.fromEntries(selectedSpells.map((spell) => [spell.id, spell])),
    equipment: Object.fromEntries(selectedEquipment.map((item) => [item.id, item])),
    featNames,
  };
}

function chooseBackgroundChoices(rng: () => number, draft: CharacterDraft, background: Background) {
  draft.skills.background = [];
  for (const group of background.skillChoices ?? []) {
    for (const choice of sample(rng, group.options, group.count)) {
      if (!draft.skills.background.includes(choice)) draft.skills.background.push(choice);
    }
  }
  draft.skills.backgroundLore = [];
  for (const group of background.loreChoices ?? []) {
    if (group.options.length) {
      for (const choice of sample(rng, group.options, group.count))
        draft.skills.backgroundLore.push(choice);
    } else {
      for (let index = 0; index < group.count; index++) {
        draft.skills.backgroundLore.push(`Simulation ${index + 1} Lore`);
      }
    }
  }
  const featChoice = (background.featChoices ?? [])[0];
  draft.backgroundFeat = featChoice?.options.length ? pick(rng, featChoice.options).id : null;
}

function chooseClassChoices(
  rng: () => number,
  draft: CharacterDraft,
  classData: ClassData,
  forcedChoice?: { groupKey: string; optionId: string }
) {
  draft.classChoices = {};
  for (const group of classData.choiceGroups) {
    if ((group.sourceFeature?.level ?? 0) > draft.level) continue;
    const options = sample(rng, group.options, group.count);
    const ids = options.map((option) => option.id);
    if (forcedChoice?.groupKey === group.key && !ids.includes(forcedChoice.optionId)) {
      if (ids.length >= group.count) ids[0] = forcedChoice.optionId;
      else ids.push(forcedChoice.optionId);
    }
    draft.classChoices[group.key] = ids;
  }
}

function chooseGrantChoices(rng: () => number, draft: CharacterDraft, classData: ClassData) {
  draft.grantChoices = {};
  const deity = deities.find((entry) => entry.id === draft.deityId) ?? null;
  const featIds = selectedClassGrants(draft, classData, deity).feats.map((feat) => feat.id);
  for (const group of activeGrantChoiceGroups(draft, classData, deity, featIds)) {
    if (!group.options.length) continue;
    draft.grantChoices[group.key] = sample(rng, group.options, group.count).map(
      (option) => option.id
    );
  }
}

function chooseBoosts(rng: () => number, draft: CharacterDraft, context: CharacterContext) {
  const ancestry = context.ancestry;
  const background = context.background;
  const classData = context.classData;
  const fixed = new Set<string>();
  if (ancestry) {
    for (const entry of ancestry.boosts)
      if (entry.fixed) for (const ability of entry.from) fixed.add(ability);
  }
  if (background) {
    for (const entry of background.boosts)
      if (entry.fixed) for (const ability of entry.from) fixed.add(ability);
  }
  const ancestryFlex = flexibleBoosts(ancestry);
  const ancestryPicks: string[] = [];
  for (const entry of ancestryFlex) {
    const choices = entry.from.filter(
      (ability) => !ancestryPicks.includes(ability) && !fixed.has(ability)
    );
    ancestryPicks.push(choices.length ? pick(rng, choices) : pick(rng, entry.from));
  }
  draft.boosts.ancestry = ancestryPicks as CharacterDraft["boosts"]["ancestry"];

  const backgroundFlex = (background?.boosts ?? []).filter((entry) => !entry.fixed);
  const backgroundPicks: string[] = [];
  for (const entry of backgroundFlex) {
    const choices = entry.from.filter((ability) => !backgroundPicks.includes(ability));
    backgroundPicks.push(choices.length ? pick(rng, choices) : pick(rng, entry.from));
  }
  draft.boosts.background = backgroundPicks as CharacterDraft["boosts"]["background"];

  const keyOptions = classKeyOptions(draft, classData);
  draft.keyAbility = keyOptions.length ? pick(rng, keyOptions) : null;

  const free: string[] = [];
  for (let index = 0; index < 4; index++) {
    const choices = ["str", "dex", "con", "int", "wis", "cha"].filter(
      (ability) => !free.includes(ability)
    );
    free.push(pick(rng, choices));
  }
  draft.boosts.free = free as CharacterDraft["boosts"]["free"];

  for (const milestone of [5, 10, 15, 20]) {
    if (draft.level < milestone) continue;
    const abilities = ["str", "dex", "con", "int", "wis", "cha"];
    draft.boosts.levels[String(milestone)] = sample(
      rng,
      abilities,
      4
    ) as CharacterDraft["boosts"]["levels"][string];
  }
}

function chooseSkills(rng: () => number, draft: CharacterDraft, context: CharacterContext) {
  const classData = context.classData!;
  const fixed = grantedTrainedSkills(draft, context);
  const required = Math.max(
    0,
    classData.trainedSkills.additional +
      Math.max(0, abilityMod(baseAbilityScores(draft, context).int))
  );
  const candidates = SKILLS.map((skill) => skill.id).filter((id) => !fixed.has(id));
  draft.skills.trained = sample(rng, candidates, Math.min(required, candidates.length));

  const ranks: Record<string, number> = {};
  for (const skill of SKILLS) ranks[skill.id] = 0;
  for (const skill of fixed) if (skill in ranks) ranks[skill] = 1;
  for (const skill of draft.skills.trained)
    if (skill in ranks) ranks[skill] = Math.max(ranks[skill], 1);

  draft.skills.increases = {};
  for (const level of classData.skillIncreaseLevels.filter((entry) => entry <= draft.level)) {
    const automatic = automaticSkillRanks({ ...draft, level }, context);
    for (const [skill, rank] of Object.entries(automatic)) {
      if (skill in ranks) ranks[skill] = Math.max(ranks[skill], rank);
    }
    const cap = skillRankCap(level);
    const options = SKILLS.map((skill) => skill.id).filter((id) => (ranks[id] ?? 0) < cap);
    if (!options.length) continue;
    const choice = pick(rng, options);
    draft.skills.increases[String(level)] = choice;
    ranks[choice] = Math.min(4, (ranks[choice] ?? 0) + 1);
  }
}

function chooseDeity(rng: () => number, draft: CharacterDraft, classData: ClassData) {
  const needsDeity =
    classData.name.toLowerCase() === "cleric" ||
    classData.name.toLowerCase() === "champion" ||
    classData.features.some((feature) => feature.name.toLowerCase().startsWith("deity ("));
  if (!needsDeity) return;
  const options = deities.filter((deity) => deity.weapons.length > 0 || deity.skill.length > 0);
  const deity = pick(rng, options.length ? options : deities);
  draft.deityId = deity.id;
  const skills = deity.skill ?? [];
  draft.deitySkill = skills.length > 1 ? pick(rng, skills) : null;
}

function chooseFeats(
  rng: () => number,
  draft: CharacterDraft,
  context: CharacterContext,
  selectedFeats: Feat[]
) {
  const classData = context.classData!;
  const slots = featSlotsFor(classData, draft.level);
  for (const slot of slots) {
    const derived = computeCharacter(draft, context);
    const candidatePool = (remasterFeats.length ? remasterFeats : feats).filter((feat) => {
      if (feat.level > slot.level) return false;
      const expected = slot.category === "class" ? ["class", "archetype"] : [slot.category];
      if (!expected.includes(feat.category)) return false;
      if (selectedFeats.some((selected) => selected.name === feat.name)) return false;
      return featPrerequisiteStatus(feat, draft, context, derived).status !== "unmet";
    });
    if (!candidatePool.length) continue;
    const feat = pick(rng, candidatePool);
    draft.feats[slot.category][String(slot.level)] = feat.id;
    selectedFeats.push(feat);
    context.feats[feat.id] = feat;
  }
}

function chooseSpells(
  rng: () => number,
  draft: CharacterDraft,
  context: CharacterContext,
  selectedSpells: Spell[]
) {
  const classData = context.classData!;
  const caster = casterInfo(classData);
  if (caster.progression === "none") return;

  const classTrait = classData.name.toLowerCase();
  const focusPool = (remasterSpells.length ? remasterSpells : spells).filter(
    (spell) =>
      spell.traits.includes("focus") &&
      (spell.traits.includes(classTrait) || spell.traits.includes("focus"))
  );
  if (caster.progression === "focus") {
    for (const spell of sample(rng, focusPool, 1)) {
      draft.spells.focus.push(spell.id);
      selectedSpells.push(spell);
      context.spells[spell.id] = spell;
    }
    return;
  }

  const tradition =
    caster.tradition ?? (caster.traditionOptions ? pick(rng, caster.traditionOptions) : null);
  draft.spells.tradition = tradition;
  const pool = (remasterSpells.length ? remasterSpells : spells).filter(
    (spell) => !tradition || spell.traditions.includes(tradition)
  );
  const maxRank = spellSlotsFor(draft.level, caster.progression, classData.name)?.length ?? 0;
  if (!maxRank) return;

  const cantripLimit = 5;
  for (const spell of sample(
    rng,
    pool.filter((entry) => entry.rank === 0),
    cantripLimit
  )) {
    draft.spells.cantrips.push(spell.id);
    selectedSpells.push(spell);
    context.spells[spell.id] = spell;
  }

  const repertoire = spellRepertoireLimits(classData, draft.level);
  const preparedClasses = new Set([
    "animist",
    "cleric",
    "druid",
    "magus",
    "necromancer",
    "witch",
    "wizard",
  ]);
  const prepared = preparedClasses.has(classTrait);
  const slots = spellSlotsFor(draft.level, caster.progression, classData.name) ?? [];
  // Clerics track divine font separately; only ordinary slots may hold
  // non-font preparations.
  const ordinarySlots =
    ordinarySpellSlotsFor(draft.level, caster.progression, classData.name) ?? slots;
  const font = divineFontInfo(draft.level, classData.name);
  const classGrantSpells = selectedClassGrants(draft, classData, context.deity).spells;
  for (let rank = 1; rank <= maxRank; rank++) {
    const slotLimit = ordinarySlots[rank - 1] ?? 0;
    const limit = repertoire?.ranks[rank - 1] ?? (prepared ? Math.max(1, slotLimit) : 1);
    const exact = pool.filter((spell) => spell.rank === rank);
    const lower = pool.filter((spell) => spell.rank > 0 && spell.rank < rank);
    const rankPool = exact.length ? exact : lower;
    const curriculumAtRank = classGrantSpells
      .filter((spell) => spell.kind === "curriculum" && spell.rank === rank)
      .map((spell) => rankPool.find((candidate) => candidate.id === spell.id))
      .filter((spell): spell is Spell => Boolean(spell));
    const forced = curriculumAtRank.length ? pick(rng, curriculumAtRank) : null;
    const samplePool = forced ? rankPool.filter((spell) => spell.id !== forced.id) : rankPool;
    const known = [
      ...(forced ? [forced] : []),
      ...sample(rng, samplePool, Math.max(0, limit - (forced ? 1 : 0))),
    ];
    for (const spell of known) {
      draft.spells.known.push(spell.id);
      selectedSpells.push(spell);
      context.spells[spell.id] = spell;
    }
    if (prepared && slotLimit) {
      const preparedIds = known.slice(0, slotLimit).map((spell) => spell.id);
      if (preparedIds.length) {
        draft.spells.preparedByRank[String(rank)] = preparedIds;
        draft.spells.prepared.push(...preparedIds);
      }
    }
  }
  if (prepared && font) {
    const deity = deities.find((entry) => entry.id === draft.deityId) ?? null;
    const fontNames = (deity?.font?.length ? deity.font : ["heal", "harm"]).map((name) =>
      name.toLowerCase()
    );
    const fontSpell =
      pool.find((spell) => fontNames.includes(spell.name.toLowerCase())) ??
      pool.find((spell) => spell.name === "Heal") ??
      pool.find((spell) => spell.name === "Harm");
    if (fontSpell) {
      const lower = fontSpell.name.trim().toLowerCase();
      if (lower === "heal" || lower === "harm") draft.spells.fontChoice = lower;
      if (!draft.spells.known.includes(fontSpell.id)) {
        draft.spells.known.push(fontSpell.id);
        selectedSpells.push(fontSpell);
        context.spells[fontSpell.id] = fontSpell;
      }
      const key = String(font.rank);
      const copies = Array.from({ length: font.slots }, () => fontSpell.id);
      draft.spells.preparedByRank[key] = [...(draft.spells.preparedByRank[key] ?? []), ...copies];
      draft.spells.prepared.push(...copies);
    }
  }

  for (const spell of sample(rng, focusPool, 1)) {
    draft.spells.focus.push(spell.id);
    selectedSpells.push(spell);
    context.spells[spell.id] = spell;
  }
}

function chooseEquipment(
  rng: () => number,
  draft: CharacterDraft,
  context: CharacterContext,
  selectedEquipment: Equipment[]
) {
  const derived = computeCharacter(draft, context);
  const attacks = derived.prof.attacks;
  const category =
    attacks.martial > 0
      ? "martial"
      : attacks.simple > 0
        ? "simple"
        : attacks.unarmed > 0
          ? "unarmed"
          : "simple";
  const weaponPool = equipment.filter(
    (item) =>
      item.weapon &&
      item.weapon.category === category &&
      item.level <= 1 &&
      item.weapon.damage.dice > 0 &&
      item.weapon.damage.die
  );
  if (weaponPool.length) {
    const weapon = pick(rng, weaponPool);
    draft.equipment.push({ itemId: weapon.id, quantity: 1, equipped: true });
    selectedEquipment.push(weapon);
    context.equipment[weapon.id] = weapon;
  }

  const defenseCategory =
    derived.prof.defenses.heavy > 0
      ? "heavy"
      : derived.prof.defenses.medium > 0
        ? "medium"
        : derived.prof.defenses.light > 0
          ? "light"
          : "unarmored";
  const armorPool = equipment.filter(
    (item) => item.armor && item.armor.category === defenseCategory && item.level <= 1
  );
  if (armorPool.length) {
    const armor = pick(rng, armorPool);
    draft.equipment.push({ itemId: armor.id, quantity: 1, equipped: true });
    selectedEquipment.push(armor);
    context.equipment[armor.id] = armor;
  }

  const shieldPool = equipment.filter((item) => item.shield && item.level <= 1);
  if (shieldPool.length && rng() > 0.5) {
    const shield = pick(rng, shieldPool);
    draft.equipment.push({ itemId: shield.id, quantity: 1, equipped: true });
    selectedEquipment.push(shield);
    context.equipment[shield.id] = shield;
  }
}

function diffObjects(a: unknown, b: unknown, prefix = ""): string[] {
  const out: string[] = [];
  if (a === b) return out;
  if (
    typeof a !== typeof b ||
    a === null ||
    b === null ||
    typeof a !== "object" ||
    typeof b !== "object"
  ) {
    out.push(`${prefix || "root"}: ${JSON.stringify(a)} -> ${JSON.stringify(b)}`);
    return out;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) {
      out.push(`${prefix}: ${JSON.stringify(a)} -> ${JSON.stringify(b)}`);
      return out;
    }
    const length = Math.max(a.length, b.length);
    for (let index = 0; index < length; index++) {
      out.push(...diffObjects(a[index], b[index], `${prefix}[${index}]`));
    }
    return out;
  }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    out.push(
      ...diffObjects(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key],
        prefix ? `${prefix}.${key}` : key
      )
    );
  }
  return out;
}

interface Problem {
  seed: number;
  character: string;
  kind: string;
  detail: string;
}

function validateCharacter(
  seed: number,
  draft: CharacterDraft,
  context: CharacterContext,
  derived: ReturnType<typeof computeCharacter>,
  problems: Problem[]
) {
  const character = `${draft.name} (${draft.level})`;
  const push = (kind: string, detail: string) => problems.push({ seed, character, kind, detail });
  const numeric = (label: string, value: number | null) => {
    if (value !== null && !Number.isFinite(value)) push("non-finite", `${label}=${value}`);
  };
  numeric("HP", derived.maxHp);
  numeric("AC", derived.ac);
  numeric("speed", derived.speed);
  numeric("perception", derived.perception);
  numeric("class DC", derived.classDc);
  numeric("spell DC", derived.spellDc);
  numeric("spell attack", derived.spellAttack);
  numeric("fortitude", derived.saves.fortitude);
  numeric("reflex", derived.saves.reflex);
  numeric("will", derived.saves.will);
  numeric("bulk", derived.bulk.total);
  numeric("wealth", derived.wealth.remaining);
  for (const ability of Object.entries(derived.abilities))
    numeric(`ability ${ability[0]}`, ability[1]);
  for (const skill of derived.skills) numeric(`skill ${skill.id}`, skill.mod);
  for (const lore of derived.lore) numeric(`lore ${lore.name}`, lore.mod);
  for (const attack of derived.attacks) {
    numeric(`attack ${attack.name}`, attack.attackBonus);
    if (!validateFormula(attack.damageFormula).ok && attack.damageFormula !== "0") {
      push("bad-damage", `${attack.name}: ${attack.damageFormula}`);
    }
  }
  for (const message of derived.validation) {
    if (/undefined|NaN|\[object Object\]/.test(message.message))
      push("bad-validation", message.message);
  }
  if (draft.level === 1) {
    for (const [ability, score] of Object.entries(derived.abilities)) {
      if (score > 18) push("level-1-cap", `${ability}=${score}`);
    }
  }
  const errors = derived.validation.filter((issue) => issue.severity === "error");
  for (const error of errors) push("validation-error", error.message);
}

function simulate(
  seed: number,
  forcedClass?: ClassData,
  forcedLevel?: number,
  forcedAncestry?: Ancestry,
  forcedBackground?: Background,
  forcedChoice?: { groupKey: string; optionId: string }
): Problem[] {
  const rng = mulberry32(seed);
  const problems: Problem[] = [];
  const ancestry = forcedAncestry ?? pick(rng, remasterAncestries);
  const heritageChoices = heritages.filter(
    (entry) =>
      entry.remaster &&
      // Ancient Elf needs a dedication whose prerequisites depend on the final
      // ability scores; it is covered by a targeted heritage test instead.
      entry.name !== "Ancient Elf" &&
      (entry.versatile ||
        entry.ancestry === ancestry.name ||
        entry.ancestrySlug === ancestry.name.toLowerCase())
  );
  const heritage = heritageChoices.length ? pick(rng, heritageChoices) : null;
  const background = forcedBackground ?? pick(rng, remasterBackgrounds);
  const classData = forcedClass ?? pick(rng, remasterClasses);
  const level = forcedLevel ?? pick(rng, [1, 5, 10, 15, 20]);

  const draft = emptyCharacterDraft(`${classData.name} ${ancestry.name} ${level}`);
  draft.contentMode = "expanded";
  draft.level = level;
  draft.ancestryId = ancestry.id;
  draft.heritageId = heritage?.id ?? null;
  draft.backgroundId = background.id;
  draft.classId = classData.id;
  chooseBackgroundChoices(rng, draft, background);

  const baseContext = contextFor(draft, [], [], []);
  chooseClassChoices(rng, draft, classData, forcedChoice);
  chooseBoosts(rng, draft, baseContext);
  chooseDeity(rng, draft, classData);
  chooseGrantChoices(rng, draft, classData);

  const heritageSkill = heritageSkillChoice(heritage);
  if (heritage && heritageSkill) {
    const options = heritageSkill.options.filter((skill) => !draft.skills.trained.includes(skill));
    draft.featChoices[heritage.id] = [pick(rng, options.length ? options : heritageSkill.options)];
  }
  const heritageGrant = heritageFeatGrant(heritage);
  if (heritage && heritageGrant) {
    const candidates = remasterFeats.filter((feat) =>
      featAllowedByHeritageGrant(feat, heritageGrant, classData.name)
    );
    const chosen = candidates.find((feat) => feat.name === "Toughness") ?? candidates[0] ?? null;
    if (chosen) draft.featChoices[heritage.id] = [chosen.id];
  }
  const heritageFeatId = heritageChosenFeatId(draft, heritage);
  const heritageFeat = heritageFeatId
    ? (feats.find((feat) => feat.id === heritageFeatId) ?? null)
    : null;

  const context = contextFor(draft, heritageFeat ? [heritageFeat] : [], [], []);
  chooseSkills(rng, draft, context);

  const selectedFeats: Feat[] = heritageFeat ? [heritageFeat] : [];
  chooseFeats(rng, draft, context, selectedFeats);

  const selectedSpells: Spell[] = [];
  chooseSpells(rng, draft, context, selectedSpells);

  const selectedEquipment: Equipment[] = [];
  chooseEquipment(rng, draft, context, selectedEquipment);

  for (const feat of selectedFeats) {
    const level = automationForFeat(feat).level;
    automationTally[level]++;
    if (level === "manual")
      manualFeatFrequency.set(feat.name, (manualFeatFrequency.get(feat.name) ?? 0) + 1);
  }
  for (const item of selectedEquipment) {
    if (automationForEquipment(item).level === "manual")
      manualItemFrequency.set(item.name, (manualItemFrequency.get(item.name) ?? 0) + 1);
  }

  try {
    const normalized = normalizeCharacterDraft(JSON.parse(JSON.stringify(draft)), draft.name);
    const roundTripped = normalizeCharacterDraft(
      JSON.parse(JSON.stringify(normalized)),
      draft.name
    );
    const differences = diffObjects(normalized, roundTripped);
    if (differences.length) {
      problems.push({
        seed,
        character: draft.name,
        kind: "normalize-mismatch",
        detail: differences.slice(0, 8).join("; "),
      });
    }
    const derived = computeCharacter(normalized, context);
    validateCharacter(seed, draft, context, derived, problems);
  } catch (error) {
    problems.push({
      seed,
      character: draft.name,
      kind: "crash",
      detail: error instanceof Error ? `${error.message}\n${error.stack}` : String(error),
    });
  }
  return problems;
}

const args = process.argv.slice(2);
const matrix = args.includes("--matrix");
const content = args.includes("--content");
const optionsSweep = args.includes("--options");
const prereqSweep = args.includes("--prereqs");
const seedArg = args.find((arg) => /^\d+$/.test(arg));
const seeds = Number(seedArg ?? 200);
const allProblems: Problem[] = [];
if (matrix) {
  const levels = [1, 5, 10, 15, 20];
  let seed = 10_000;
  for (const classData of remasterClasses) {
    for (const level of levels) {
      const ancestry = remasterAncestries[seed % remasterAncestries.length];
      const background = remasterBackgrounds[seed % remasterBackgrounds.length];
      allProblems.push(...simulate(seed++, classData, level, ancestry, background));
    }
  }
  console.log(`Matrix: ${remasterClasses.length} classes x ${levels.length} levels.`);
}
if (optionsSweep) {
  let seed = 30_000;
  let optionCount = 0;
  for (const classData of remasterClasses) {
    for (const group of classData.choiceGroups) {
      for (const option of group.options) {
        const level = Math.max(1, group.sourceFeature?.level ?? 1);
        allProblems.push(
          ...simulate(seed++, classData, level, undefined, undefined, {
            groupKey: group.key,
            optionId: option.id,
          })
        );
        optionCount++;
      }
    }
  }
  console.log(`Options: ${optionCount} class/subclass options.`);
}
if (prereqSweep) {
  const fighter = remasterClasses.find((entry) => entry.name === "Fighter") ?? remasterClasses[0];
  const draft = emptyCharacterDraft("Prerequisite Sweep");
  draft.classId = fighter.id;
  draft.level = 20;
  const context = contextFor(draft, [], [], []);
  const derived = computeCharacter(draft, context);
  const counts = { met: 0, unmet: 0, unknown: 0 };
  for (const feat of feats) {
    try {
      const status = featPrerequisiteStatus(feat, draft, context, derived).status;
      counts[status]++;
    } catch (error) {
      allProblems.push({
        seed: 0,
        character: feat.name,
        kind: "prereq-crash",
        detail: error instanceof Error ? `${error.message}\n${error.stack}` : String(error),
      });
    }
  }
  console.log("Feat prerequisite sweep:", counts, `across ${feats.length} feats.`);
}
if (content) {
  let seed = 20_000;
  for (const ancestry of remasterAncestries) {
    allProblems.push(...simulate(seed++, undefined, 1, ancestry));
    allProblems.push(...simulate(seed++, undefined, 5, ancestry));
  }
  for (const background of remasterBackgrounds) {
    allProblems.push(...simulate(seed++, undefined, 1, undefined, background));
    allProblems.push(...simulate(seed++, undefined, 5, undefined, background));
  }
  console.log(
    `Content: ${remasterAncestries.length} ancestries and ${remasterBackgrounds.length} backgrounds at levels 1 and 5.`
  );
}
for (let seed = 1; seed <= seeds; seed++) allProblems.push(...simulate(seed));

const grouped = new Map<string, Problem[]>();
for (const problem of allProblems) {
  const key = `${problem.kind}: ${problem.detail}`;
  const list = grouped.get(key) ?? [];
  list.push(problem);
  grouped.set(key, list);
}
console.log(
  `Simulated ${seeds} characters; ${allProblems.length} problems in ${grouped.size} groups.`
);
console.log(
  `\nFeat automation across selections: ${automationTally.full} full / ${automationTally.partial} partial / ${automationTally.manual} manual.`
);
const topManualFeats = [...manualFeatFrequency.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
if (topManualFeats.length) {
  console.log("Most common manual feats selected:");
  for (const [name, count] of topManualFeats) console.log(`  ${count}x ${name}`);
}
const topManualItems = [...manualItemFrequency.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
if (topManualItems.length) {
  console.log("Most common manual items selected:");
  for (const [name, count] of topManualItems) console.log(`  ${count}x ${name}`);
}
for (const [key, list] of [...grouped.entries()]
  .sort((a, b) => b[1].length - a[1].length)
  .slice(0, 40)) {
  console.log(`\n${list.length}x ${key}`);
  console.log(
    list
      .slice(0, 4)
      .map((problem) => `  seed ${problem.seed}: ${problem.character}`)
      .join("\n")
  );
}

// The weekly simulation job must fail when a rules problem is found; otherwise
// the workflow can stay green while the report lists crashes.
if (allProblems.length) process.exitCode = 1;
