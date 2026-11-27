// Character-builder audit. By default this runs a random sample; pass --full
// for the exhaustive matrix, --legacy to include legacy content, and
// --capstone to run the category sweeps at level 20 instead of levels 1 and 5.
// `--one <seed>` reproduces a single seed from the --levels sweep.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  animistApparitionLimit,
  automaticSkillRanks,
  cantripLimitFor,
  cantripPreparedLimitFor,
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
  requiredExtraSkills,
  skillRankCap,
  spellRepertoireLimits,
  spellSlotsFor,
} from "../src/shared/rules";
import { ANIMIST_APPARITIONS } from "../src/shared/apparitions";
import { validateFormula } from "../src/shared/dice";
import { automationForEquipment, automationForFeat } from "../src/shared/automation";
import { featChoice, featChoiceOptions } from "../src/shared/effects";
import {
  featAllowedByHeritageGrant,
  heritageChosenFeatId,
  heritageFeatGrant,
  heritageSkillChoice,
} from "../src/shared/heritage";
import { SKILLS, SKILL_BY_ID, type SkillId } from "../src/shared/types";
import { activeGrantChoiceGroups, deitySupportsClass } from "../src/shared/classGrantChoices";
import { selectedClassGrants } from "../src/shared/classGrants";
import { attachRuneIds } from "../src/shared/runes";
import { contextForDraft } from "../src/server/compendium";
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
const spellById = new Map(spells.map((spell) => [spell.id, spell]));

// Automation gap tally across every simulated selection, so the most common
// "manual" options stay visible to the developer.
const automationTally = { full: 0, partial: 0, manual: 0 };
const manualFeatFrequency = new Map<string, number>();
const manualItemFrequency = new Map<string, number>();
let simulationCount = 0;

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
  const existingClassSkills = [...new Set(draft.skills.classSkills ?? [])];
  draft.skills.classSkills = (classData.skillChoices ?? []).flatMap((group) => {
    const picks = existingClassSkills
      .filter((skill) => group.options.includes(skill))
      .slice(0, group.count);
    while (picks.length < group.count) {
      const remaining = group.options.filter((option) => !picks.includes(option));
      if (!remaining.length) break;
      picks.push(pick(rng, remaining));
    }
    return picks;
  });
  const next: Record<string, string[]> = { ...draft.classChoices };
  for (const group of classData.choiceGroups) {
    if ((group.sourceFeature?.level ?? 0) > draft.level) continue;
    const existing = next[group.key] ?? [];
    if (
      existing.length === group.count &&
      existing.every((id) => group.options.some((option) => option.id === id))
    ) {
      continue;
    }
    const options = sample(rng, group.options, group.count);
    const ids = options.map((option) => option.id);
    if (forcedChoice?.groupKey === group.key && !ids.includes(forcedChoice.optionId)) {
      if (ids.length >= group.count) ids[0] = forcedChoice.optionId;
      else ids.push(forcedChoice.optionId);
    }
    next[group.key] = ids;
  }
  draft.classChoices = next;
}

function chooseGrantChoices(rng: () => number, draft: CharacterDraft, classData: ClassData) {
  const deity = deities.find((entry) => entry.id === draft.deityId) ?? null;
  const featIds = selectedClassGrants(draft, classData, deity).feats.map((feat) => feat.id);
  for (const group of activeGrantChoiceGroups(draft, classData, deity, featIds)) {
    if (!group.options.length) continue;
    const existing = (draft.grantChoices[group.key] ?? []).filter((id) =>
      group.options.some((option) => option.id === id)
    );
    if (existing.length >= group.count) {
      draft.grantChoices[group.key] = existing.slice(0, group.count);
      continue;
    }
    const remaining = group.options.filter((option) => !existing.includes(option.id));
    const additions = sample(
      rng,
      remaining,
      Math.min(remaining.length, group.count - existing.length)
    ).map((option) => option.id);
    draft.grantChoices[group.key] = [...existing, ...additions].slice(0, group.count);
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
  const fixed = grantedTrainedSkills(draft, context);
  const required = requiredExtraSkills(draft, context);
  const candidates = SKILLS.map((skill) => skill.id).filter((id) => !fixed.has(id));
  draft.skills.trained = sample(rng, candidates, Math.min(required, candidates.length));
}

function chooseSkillIncreases(
  rng: () => number,
  draft: CharacterDraft,
  context: CharacterContext,
  preserveExisting = false
) {
  const classData = context.classData!;
  const fixed = grantedTrainedSkills(draft, context);
  const ranks: Record<string, number> = {};
  for (const skill of SKILLS) ranks[skill.id] = 0;
  for (const skill of fixed) if (skill in ranks) ranks[skill] = 1;
  for (const skill of draft.skills.trained)
    if (skill in ranks) ranks[skill] = Math.max(ranks[skill], 1);
  for (const [skill, rank] of Object.entries(automaticSkillRanks(draft, context))) {
    if (skill in ranks) ranks[skill] = Math.max(ranks[skill], rank);
  }

  const next: Record<string, string> = preserveExisting ? { ...draft.skills.increases } : {};
  for (const level of classData.skillIncreaseLevels.filter((entry) => entry <= draft.level)) {
    const cap = skillRankCap(level);
    const existing = preserveExisting ? next[String(level)] : undefined;
    let choice =
      existing && (ranks[existing] ?? 0) < cap && SKILL_BY_ID[existing as SkillId]
        ? existing
        : undefined;
    if (!choice) {
      const options = SKILLS.map((skill) => skill.id).filter((id) => (ranks[id] ?? 0) < cap);
      if (!options.length) {
        delete next[String(level)];
        continue;
      }
      choice = pick(rng, options);
      next[String(level)] = choice;
    }
    ranks[choice] = Math.min(4, (ranks[choice] ?? 0) + 1);
  }
  draft.skills.increases = next;
}

/**
 * Feats and class grants can add fixed trained skills after the initial skill
 * pass (for example Hellspawn granting Deception). Recompute the fixed set and
 * replace any chosen skill that became redundant so the final draft still has
 * exactly the required number of free skill picks.
 */
function rebalanceTrainedSkills(
  rng: () => number,
  draft: CharacterDraft,
  context: CharacterContext
) {
  const fixed = grantedTrainedSkills(draft, context);
  const required = requiredExtraSkills(draft, context);
  const selected = [
    ...new Set(
      draft.skills.trained.filter((skill) => SKILL_BY_ID[skill as SkillId] && !fixed.has(skill))
    ),
  ];
  const increasedSkills = new Set(Object.values(draft.skills.increases));
  const available = SKILLS.map((skill) => skill.id).filter(
    (id) => !fixed.has(id) && !selected.includes(id)
  );
  // When a milestone ability boost raises Intelligence, the builder asks for an
  // extra trained skill. Avoid skills that already have a recorded skill
  // increase: training one now would invalidate that earlier choice.
  const preferred = available.filter((id) => !increasedSkills.has(id));
  const candidates = preferred.length ? preferred : available;
  while (selected.length < required && candidates.length) {
    const choice = candidates.splice(Math.floor(rng() * candidates.length), 1)[0];
    selected.push(choice);
  }
  draft.skills.trained = selected.slice(0, required);
}

function chooseDeity(
  rng: () => number,
  draft: CharacterDraft,
  classData: ClassData,
  forcedDeity?: Deity | null
) {
  const needsDeity =
    classData.name.toLowerCase() === "cleric" ||
    classData.name.toLowerCase() === "champion" ||
    classData.features.some((feature) => feature.name.toLowerCase().startsWith("deity ("));
  if (!needsDeity) return;
  const legal = deities.filter((deity) => deitySupportsClass(deity, classData));
  const options = legal.filter((deity) => deity.weapons.length > 0 || deity.skill.length > 0);
  const deity =
    forcedDeity !== undefined
      ? forcedDeity
      : pick(rng, options.length ? options : legal.length ? legal : deities);
  if (!deity) return;
  draft.deityId = deity.id;
  const skills = deity.skill ?? [];
  draft.deitySkill = skills.length > 1 ? pick(rng, skills) : null;
}

function chooseFeats(
  rng: () => number,
  draft: CharacterDraft,
  context: CharacterContext,
  selectedFeats: Feat[],
  fillEmptyOnly = false,
  freeArchetype = false
) {
  const classData = context.classData!;
  const slots = featSlotsFor(classData, draft.level, freeArchetype);
  for (const slot of slots) {
    const key = String(slot.level);
    const bucket = slot.freeArchetype ? draft.feats.freeArchetype : draft.feats[slot.category];
    if (fillEmptyOnly && bucket[key]) continue;
    const derived = computeCharacter(draft, context);
    const candidatePool = (remasterFeats.length ? remasterFeats : feats).filter((feat) => {
      if (feat.level > slot.level) return false;
      if (slot.freeArchetype) {
        if (feat.category !== "class" || !feat.traits.includes("archetype")) return false;
      } else {
        const expected = slot.category === "class" ? ["class", "archetype"] : [slot.category];
        if (!expected.includes(feat.category)) return false;
      }
      if (selectedFeats.some((selected) => selected.name === feat.name)) return false;
      return featPrerequisiteStatus(feat, draft, context, derived).status !== "unmet";
    });
    if (!candidatePool.length) continue;
    const feat = pick(rng, candidatePool);
    bucket[key] = feat.id;
    selectedFeats.push(feat);
    context.feats[feat.id] = feat;
  }
}

function fillFeatChoices(
  rng: () => number,
  draft: CharacterDraft,
  context: CharacterContext
): void {
  for (const feat of Object.values(context.feats)) {
    if (draft.featChoices[feat.id]?.length) continue;
    const choice = featChoice(feat.id);
    if (!choice) continue;
    if (choice.kind === "text") {
      const text =
        (choice.placeholder ?? "").replace(/^e\.g\.\s*/i, "").trim() || "Adventuring Lore";
      draft.featChoices[feat.id] = [text];
      continue;
    }
    const options = featChoiceOptions(choice, draft, context);
    if (!options.length) continue;
    draft.featChoices[feat.id] = [pick(rng, options).id];
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

  const repertoire = spellRepertoireLimits(classData, draft.level);
  const cantripLimit = cantripLimitFor(classData) ?? repertoire?.cantrips ?? 5;
  for (const spell of sample(
    rng,
    pool.filter((entry) => entry.rank === 0),
    cantripLimit
  )) {
    draft.spells.cantrips.push(spell.id);
    selectedSpells.push(spell);
    context.spells[spell.id] = spell;
  }

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
  if (prepared) {
    const preparedLimit = cantripPreparedLimitFor(classData) ?? cantripLimit;
    draft.spells.preparedCantrips = draft.spells.cantrips.slice(0, preparedLimit);
  }
  const slots = spellSlotsFor(draft.level, caster.progression, classData.name) ?? [];
  // Clerics track divine font separately; only ordinary slots may hold
  // non-font preparations.
  const ordinarySlots =
    ordinarySpellSlotsFor(draft.level, caster.progression, classData.name) ?? slots;
  const font = divineFontInfo(draft.level, classData.name);
  const classGrantSpells = selectedClassGrants(draft, classData, context.deity).spells;
  const grantedByRank = new Map<number, number>();
  if (repertoire?.subtractGranted) {
    for (const spell of classGrantSpells) {
      if (spell.kind === "focus" || spell.rank <= 0) continue;
      grantedByRank.set(spell.rank, (grantedByRank.get(spell.rank) ?? 0) + 1);
    }
  }
  for (let rank = 1; rank <= maxRank; rank++) {
    const slotLimit = ordinarySlots[rank - 1] ?? 0;
    const repertoireLimit = repertoire?.ranks[rank - 1] ?? (prepared ? Math.max(1, slotLimit) : 1);
    const limit = Math.max(0, repertoireLimit - (grantedByRank.get(rank) ?? 0));
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
      const curriculumIds = new Set(
        classGrantSpells
          .filter((spell) => spell.kind === "curriculum" && spell.rank === rank)
          .map((spell) => spell.id)
      );
      const curriculum = known.find((spell) => curriculumIds.has(spell.id)) ?? null;
      const ordered = curriculum
        ? [curriculum, ...known.filter((spell) => spell.id !== curriculum.id)]
        : known;
      const maxNonCurriculum = curriculumIds.size ? Math.max(0, slotLimit - 1) : slotLimit;
      const preparedIds: string[] = [];
      let nonCurriculum = 0;
      for (const spell of ordered) {
        if (preparedIds.length >= slotLimit) break;
        const isCurriculum = curriculumIds.has(spell.id);
        if (!isCurriculum && nonCurriculum >= maxNonCurriculum) continue;
        preparedIds.push(spell.id);
        if (!isCurriculum) nonCurriculum += 1;
      }
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

function upgradeFundamentalRunes(draft: CharacterDraft, context: CharacterContext) {
  // High-level builds need level-appropriate fundamental runes, otherwise
  // level 20 AC and attack checks only exercise level 1 gear.
  const bestRune = (matches: (name: string) => boolean): Equipment | null =>
    equipment
      .filter((item) => item.level > 0 && item.level <= draft.level && matches(item.name))
      .sort((a, b) => b.level - a.level)[0] ?? null;
  const addRune = (entry: (typeof draft.equipment)[number], rune: Equipment | null) => {
    if (!rune) return;
    entry.runes = attachRuneIds(entry.runes, rune, context.equipment);
    context.equipment[rune.id] = rune;
  };
  const weaponEntry = draft.equipment.find((entry) => context.equipment[entry.itemId]?.weapon);
  if (weaponEntry) {
    addRune(
      weaponEntry,
      bestRune((name) => name.startsWith("Weapon Potency"))
    );
    addRune(
      weaponEntry,
      bestRune((name) => name === "Striking" || name.startsWith("Striking ("))
    );
  }
  const armorEntry = draft.equipment.find((entry) => context.equipment[entry.itemId]?.armor);
  if (armorEntry) {
    addRune(
      armorEntry,
      bestRune((name) => name.startsWith("Armor Potency"))
    );
    addRune(
      armorEntry,
      bestRune((name) => name.startsWith("Resilient"))
    );
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

  upgradeFundamentalRunes(draft, context);
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

function buildDraftFrom(
  seed: number,
  forcedClass?: ClassData,
  forcedLevel?: number,
  forcedAncestry?: Ancestry,
  forcedBackground?: Background,
  forcedChoice?: { groupKey: string; optionId: string },
  forcedHeritage?: Heritage | null,
  forcedDeity?: Deity | null
): {
  draft: CharacterDraft;
  context: CharacterContext;
  selectedFeats: Feat[];
  selectedSpells: Spell[];
  selectedEquipment: Equipment[];
} {
  const rng = mulberry32(seed);
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
  const heritage =
    forcedHeritage !== undefined
      ? forcedHeritage
      : heritageChoices.length
        ? pick(rng, heritageChoices)
        : null;
  const background = forcedBackground ?? pick(rng, remasterBackgrounds);
  const classData = forcedClass ?? pick(rng, remasterClasses);
  const level = forcedLevel ?? pick(rng, [1, 5, 10, 15, 20]);

  const draft = emptyCharacterDraft(`${classData.name} ${ancestry.name} ${level}`);
  draft.contentMode = "expanded";
  draft.includeLegacy = true;
  draft.level = level;
  draft.ancestryId = ancestry.id;
  draft.ancestrySize = ancestry.sizeChoices?.[0] ?? null;
  draft.heritageId = heritage?.id ?? null;
  draft.backgroundId = background.id;
  draft.classId = classData.id;
  chooseBackgroundChoices(rng, draft, background);

  const baseContext = contextFor(draft, [], [], []);
  chooseClassChoices(rng, draft, classData, forcedChoice);
  chooseBoosts(rng, draft, baseContext);
  chooseDeity(rng, draft, classData, forcedDeity);
  chooseGrantChoices(rng, draft, classData);
  if (classData.name.toLowerCase() === "animist") {
    const attuned = ANIMIST_APPARITIONS.slice(0, animistApparitionLimit(level)).map(
      (entry) => entry.id
    );
    draft.spells.attunedApparitions = attuned;
    draft.spells.primaryApparition = attuned[0] ?? null;
  }

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
  fillFeatChoices(rng, draft, context);
  // A regular class feat can activate a grant-choice group (for example,
  // Domain Initiate). Fill any groups that were not active before feats.
  chooseGrantChoices(rng, draft, classData);
  rebalanceTrainedSkills(rng, draft, context);
  chooseSkillIncreases(rng, draft, context);

  const selectedSpells: Spell[] = [];
  chooseSpells(rng, draft, context, selectedSpells);

  const selectedEquipment: Equipment[] = [];
  chooseEquipment(rng, draft, context, selectedEquipment);
  return { draft, context, selectedFeats, selectedSpells, selectedEquipment };
}

export interface SimulatedCharacterBuild {
  draft: CharacterDraft;
  context: CharacterContext;
  selectedFeats: Feat[];
  selectedSpells: Spell[];
  selectedEquipment: Equipment[];
  /** How the build was produced when advancing through a campaign. */
  source?: "fresh" | "advanced" | "fallback";
  /** Validation errors that forced a fallback rebuild, for reports. */
  fallbackReason?: string;
}

export interface SimulatedCharacterOptions {
  seed: number;
  className: string;
  level: number;
  ancestryName?: string;
  backgroundName?: string;
  heritageName?: string;
  deityName?: string;
}

/** Deterministic, fully populated character build for campaign simulations. */
export function buildSimulatedCharacter(
  options: SimulatedCharacterOptions
): SimulatedCharacterBuild {
  const classData = classes.find(
    (entry) => entry.name.toLowerCase() === options.className.toLowerCase()
  );
  if (!classData) throw new Error(`Unknown class: ${options.className}`);
  const ancestry = options.ancestryName
    ? ancestries.find((entry) => entry.name.toLowerCase() === options.ancestryName!.toLowerCase())
    : remasterAncestries[options.seed % remasterAncestries.length];
  if (!ancestry) throw new Error(`Unknown ancestry: ${options.ancestryName}`);
  const background = options.backgroundName
    ? backgrounds.find(
        (entry) => entry.name.toLowerCase() === options.backgroundName!.toLowerCase()
      )
    : remasterBackgrounds[options.seed % remasterBackgrounds.length];
  if (!background) throw new Error(`Unknown background: ${options.backgroundName}`);
  const heritage =
    options.heritageName !== undefined
      ? (heritages.find(
          (entry) => entry.name.toLowerCase() === options.heritageName!.toLowerCase()
        ) ?? null)
      : undefined;
  const deity =
    options.deityName !== undefined
      ? (deities.find((entry) => entry.name.toLowerCase() === options.deityName!.toLowerCase()) ??
        null)
      : undefined;
  const build = buildDraftFrom(
    options.seed,
    classData,
    options.level,
    ancestry,
    background,
    undefined,
    heritage,
    deity
  );
  return { ...build, source: "fresh" };
}

function advanceSpells(
  rng: () => number,
  draft: CharacterDraft,
  context: CharacterContext,
  selectedSpells: Spell[]
) {
  const classData = context.classData!;
  const caster = casterInfo(classData);
  if (caster.progression === "none") return;

  const classTrait = classData.name.toLowerCase();
  const poolSource = remasterSpells.length ? remasterSpells : spells;
  const focusPool = poolSource.filter(
    (spell) =>
      spell.traits.includes("focus") &&
      (spell.traits.includes(classTrait) || spell.traits.includes("focus"))
  );
  if (caster.progression === "focus") {
    if (!draft.spells.focus.length) {
      for (const spell of sample(rng, focusPool, 1)) {
        draft.spells.focus.push(spell.id);
        selectedSpells.push(spell);
        context.spells[spell.id] = spell;
      }
    }
    return;
  }

  const tradition =
    draft.spells.tradition ??
    caster.tradition ??
    (caster.traditionOptions ? pick(rng, caster.traditionOptions) : null);
  draft.spells.tradition = tradition;
  const pool = poolSource.filter((spell) => !tradition || spell.traditions.includes(tradition));
  const maxRank = spellSlotsFor(draft.level, caster.progression, classData.name)?.length ?? 0;
  if (!maxRank) return;

  const repertoire = spellRepertoireLimits(classData, draft.level);
  const cantripLimit = cantripLimitFor(classData) ?? repertoire?.cantrips ?? 5;
  const existingCantrips = new Set(draft.spells.cantrips);
  for (const spell of sample(
    rng,
    pool.filter((spell) => spell.rank === 0 && !existingCantrips.has(spell.id)),
    Math.max(0, cantripLimit - draft.spells.cantrips.length)
  )) {
    draft.spells.cantrips.push(spell.id);
    selectedSpells.push(spell);
    context.spells[spell.id] = spell;
  }

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
  const grantedIds = new Set(classGrantSpells.map((spell) => spell.id));
  const subtractGranted = Boolean(repertoire?.subtractGranted);
  const grantedByRank = new Map<number, number>();
  if (subtractGranted) {
    for (const spell of classGrantSpells) {
      if (spell.kind === "focus" || spell.rank <= 0) continue;
      grantedByRank.set(spell.rank, (grantedByRank.get(spell.rank) ?? 0) + 1);
    }
  }

  const known = new Set(draft.spells.known);
  const rankOf = (id: string) => spellById.get(id)?.rank ?? 0;
  const selectable = (spell: Spell) =>
    !known.has(spell.id) && !(subtractGranted && grantedIds.has(spell.id));

  for (let rank = 1; rank <= maxRank; rank++) {
    const slotLimit = ordinarySlots[rank - 1] ?? 0;
    const repertoireLimit = repertoire?.ranks[rank - 1] ?? (prepared ? Math.max(1, slotLimit) : 1);
    const limit = Math.max(0, repertoireLimit - (grantedByRank.get(rank) ?? 0));
    const existingAtRank = [...known].filter(
      (id) =>
        rankOf(id) === rank &&
        !spellById.get(id)?.traits.includes("focus") &&
        !(subtractGranted && grantedIds.has(id))
    ).length;
    const needed = Math.max(0, limit - existingAtRank);
    if (!needed) continue;
    const exact = pool.filter((spell) => spell.rank === rank && selectable(spell));
    const lower = pool.filter((spell) => spell.rank > 0 && spell.rank < rank && selectable(spell));
    const rankPool = exact.length ? exact : lower;
    if (!rankPool.length) continue;
    const curriculumAtRank: Spell[] = [];
    for (const granted of classGrantSpells) {
      if (granted.kind !== "curriculum" || granted.rank !== rank) continue;
      const spell = pool.find((candidate) => candidate.id === granted.id);
      if (spell && !known.has(spell.id)) curriculumAtRank.push(spell);
    }
    const forced = curriculumAtRank.length ? pick(rng, curriculumAtRank) : null;
    const chosen = [
      ...(forced ? [forced] : []),
      ...sample(
        rng,
        rankPool.filter((spell) => spell.id !== forced?.id),
        Math.max(0, needed - (forced ? 1 : 0))
      ),
    ];
    for (const spell of chosen) {
      if (known.has(spell.id)) continue;
      draft.spells.known.push(spell.id);
      known.add(spell.id);
      selectedSpells.push(spell);
      context.spells[spell.id] = spell;
    }
  }

  if (prepared) {
    const preparedLimit = cantripPreparedLimitFor(classData) ?? cantripLimit;
    const currentCantrips = (draft.spells.preparedCantrips ?? []).filter((id) =>
      draft.spells.cantrips.includes(id)
    );
    for (const id of draft.spells.cantrips) {
      if (currentCantrips.length >= preparedLimit) break;
      if (!currentCantrips.includes(id)) currentCantrips.push(id);
    }
    draft.spells.preparedCantrips = currentCantrips;
  }

  let fontSpell: Spell | null = null;
  if (prepared && font) {
    const deity = context.deity;
    const fontNames = (deity?.font?.length ? deity.font : ["heal", "harm"]).map((name) =>
      name.toLowerCase()
    );
    const storedFont = draft.spells.fontChoice;
    fontSpell = storedFont
      ? (pool.find((spell) => spell.name.trim().toLowerCase() === storedFont) ?? null)
      : null;
    fontSpell ??=
      pool.find((spell) => fontNames.includes(spell.name.toLowerCase())) ??
      pool.find((spell) => spell.name === "Heal") ??
      pool.find((spell) => spell.name === "Harm") ??
      null;
    if (fontSpell) {
      const lower = fontSpell.name.trim().toLowerCase();
      if (lower === "heal" || lower === "harm") {
        draft.spells.fontChoice ??= lower;
      }
      if (!draft.spells.known.includes(fontSpell.id)) {
        draft.spells.known.push(fontSpell.id);
        selectedSpells.push(fontSpell);
        context.spells[fontSpell.id] = fontSpell;
      }
    }
  }

  if (prepared) {
    const previousByRank = draft.spells.preparedByRank ?? {};
    const byRank: Record<string, string[]> = {};
    const knownIds = [...draft.spells.known];
    for (let rank = 1; rank <= maxRank; rank++) {
      const slotLimit = ordinarySlots[rank - 1] ?? 0;
      if (!slotLimit) continue;
      const eligible = knownIds.filter((id) => {
        const spell = spellById.get(id);
        if (!spell || spell.rank <= 0 || spell.rank > rank) return false;
        if (spell.traits.includes("focus")) return false;
        if (font && fontSpell && rank === font.rank && id === fontSpell.id) return false;
        return true;
      });
      const ordered = [
        ...eligible.filter((id) => rankOf(id) === rank),
        ...eligible.filter((id) => rankOf(id) < rank),
      ];
      const curriculumIds = new Set(
        classGrantSpells
          .filter((spell) => spell.kind === "curriculum" && spell.rank === rank)
          .map((spell) => spell.id)
      );
      const curriculumPick = ordered.find((id) => curriculumIds.has(id)) ?? null;
      const reordered = curriculumPick
        ? [curriculumPick, ...ordered.filter((id) => id !== curriculumPick)]
        : ordered;
      const maxNonCurriculum = curriculumIds.size ? Math.max(0, slotLimit - 1) : slotLimit;
      const picks: string[] = [];
      let nonCurriculum = 0;
      for (const id of previousByRank[String(rank)] ?? []) {
        if (picks.length >= slotLimit) break;
        if (!reordered.includes(id) || picks.includes(id)) continue;
        if (!curriculumIds.has(id) && nonCurriculum >= maxNonCurriculum) continue;
        picks.push(id);
        if (!curriculumIds.has(id)) nonCurriculum += 1;
      }
      for (const id of reordered) {
        if (picks.length >= slotLimit) break;
        if (picks.includes(id)) continue;
        if (!curriculumIds.has(id) && nonCurriculum >= maxNonCurriculum) continue;
        picks.push(id);
        if (!curriculumIds.has(id)) nonCurriculum += 1;
      }
      if (picks.length) byRank[String(rank)] = picks;
    }
    if (font && fontSpell) {
      const key = String(font.rank);
      const ordinary = (byRank[key] ?? []).filter((id) => id !== fontSpell!.id);
      byRank[key] = [...ordinary, ...Array.from({ length: font.slots }, () => fontSpell!.id)];
    }
    draft.spells.preparedByRank = byRank;
    draft.spells.prepared = Object.keys(byRank)
      .map(Number)
      .sort((a, b) => a - b)
      .flatMap((rank) => byRank[String(rank)] ?? []);
  }
}

export interface AdvanceSimulatedCharacterOptions {
  previous: SimulatedCharacterBuild;
  level: number;
  seed?: number;
  freeArchetype?: boolean;
}

function validationErrors(draft: CharacterDraft, context: CharacterContext): string[] {
  return computeCharacter(draft, context)
    .validation.filter((issue) => issue.severity === "error")
    .map((issue) => issue.message);
}

/**
 * Advance a simulated character one or more levels without rerolling its
 * identity or earlier selections. New class choices, feats, skill increases,
 * spells, ability boosts, and fundamental runes are filled in for the levels
 * that just became available. If the result is invalid, the caller gets a
 * fresh level-appropriate build as a safety net.
 */
export function advanceSimulatedCharacter(
  options: AdvanceSimulatedCharacterOptions
): SimulatedCharacterBuild {
  const { previous, level } = options;
  const fromLevel = previous.draft.level;
  if (!Number.isInteger(level) || level < 1 || level > 20) {
    throw new Error(`Invalid level: ${level}`);
  }
  if (level <= fromLevel) {
    throw new Error(`Advancement must move forward from level ${fromLevel} to ${level}`);
  }

  const draft = structuredClone(previous.draft);
  draft.level = level;
  const classData = classes.find((entry) => entry.id === draft.classId);
  if (!classData) throw new Error(`Unknown class id: ${draft.classId}`);
  const seed = options.seed ?? 0;
  const rng = mulberry32((seed + level * 10_007) >>> 0);

  for (const milestone of [5, 10, 15, 20]) {
    if (milestone <= fromLevel || milestone > level) continue;
    if ((draft.boosts.levels[String(milestone)] ?? []).length) continue;
    const abilities = ["str", "dex", "con", "int", "wis", "cha"];
    draft.boosts.levels[String(milestone)] = sample(
      rng,
      abilities,
      4
    ) as CharacterDraft["boosts"]["levels"][string];
  }

  chooseClassChoices(rng, draft, classData);
  if (classData.name.toLowerCase() === "animist") {
    const limit = animistApparitionLimit(level);
    const current = draft.spells.attunedApparitions
      .filter((id) => ANIMIST_APPARITIONS.some((entry) => entry.id === id))
      .slice(0, limit);
    for (const entry of ANIMIST_APPARITIONS) {
      if (current.length >= limit) break;
      if (!current.includes(entry.id)) current.push(entry.id);
    }
    draft.spells.attunedApparitions = current;
    if (!draft.spells.primaryApparition || !current.includes(draft.spells.primaryApparition)) {
      draft.spells.primaryApparition = current[0] ?? null;
    }
  }

  let context = contextForDraft(draft);
  chooseGrantChoices(rng, draft, classData);
  context = contextForDraft(draft);

  const selectedFeats = Object.values(context.feats);
  chooseFeats(rng, draft, context, selectedFeats, true, options.freeArchetype === true);
  fillFeatChoices(rng, draft, context);
  chooseGrantChoices(rng, draft, classData);
  context = contextForDraft(draft);
  rebalanceTrainedSkills(rng, draft, context);
  chooseSkillIncreases(rng, draft, context, true);

  const selectedSpells = Object.values(context.spells);
  advanceSpells(rng, draft, context, selectedSpells);
  context = contextForDraft(draft);

  upgradeFundamentalRunes(draft, context);
  context = contextForDraft(draft);

  const build: SimulatedCharacterBuild = {
    draft,
    context,
    selectedFeats: Object.values(context.feats),
    selectedSpells: Object.values(context.spells),
    selectedEquipment: Object.values(context.equipment),
    source: "advanced",
  };
  const errors = validationErrors(draft, context);
  if (!errors.length) return build;

  const ancestry = context.ancestry ?? null;
  const background = context.background ?? null;
  if (!ancestry || !background) {
    throw new Error(`Cannot rebuild ${draft.name}: missing ancestry or background`);
  }
  const fresh = buildDraftFrom(
    seed,
    classData,
    level,
    ancestry,
    background,
    undefined,
    context.heritage,
    context.deity
  );
  fresh.draft.name = previous.draft.name;
  return {
    ...fresh,
    source: "fallback",
    fallbackReason: errors.slice(0, 3).join("; "),
  };
}

function simulate(
  seed: number,
  forcedClass?: ClassData,
  forcedLevel?: number,
  forcedAncestry?: Ancestry,
  forcedBackground?: Background,
  forcedChoice?: { groupKey: string; optionId: string },
  forcedHeritage?: Heritage | null,
  forcedDeity?: Deity | null
): Problem[] {
  simulationCount++;
  const problems: Problem[] = [];
  const { draft, context, selectedFeats, selectedSpells, selectedEquipment } = buildDraftFrom(
    seed,
    forcedClass,
    forcedLevel,
    forcedAncestry,
    forcedBackground,
    forcedChoice,
    forcedHeritage,
    forcedDeity
  );
  void selectedSpells;

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

function runCli(): void {
  const args = process.argv.slice(2);
  const full = args.includes("--full");
  const includeLegacy = args.includes("--legacy");
  const matrix = full || args.includes("--matrix");
  const content = full || args.includes("--content");
  const optionsSweep = full || args.includes("--options");
  const prereqSweep = full || args.includes("--prereqs");
  const levelsSweep = full || args.includes("--levels");
  const ancestrySweep = full || args.includes("--ancestries");
  const crossSweep = full || args.includes("--cross");
  const heritageSweep = full || args.includes("--heritages");
  const backgroundSweep = full || args.includes("--backgrounds");
  const deitySweep = full || args.includes("--deities");
  const sweepLevels = args.includes("--capstone")
    ? [20]
    : args.includes("--deep")
      ? [1, 10, 20]
      : [1, 5];
  const seedArg = args.find((arg, index) => /^\d+$/.test(arg) && args[index - 1] !== "--one");
  const seeds = Number(seedArg ?? 200);
  const allProblems: Problem[] = [];
  const oneIndex = args.indexOf("--one");
  const sweepAncestries = includeLegacy ? ancestries : remasterAncestries;
  const sweepHeritages = includeLegacy ? heritages : heritages.filter((entry) => entry.remaster);
  const sweepBackgrounds = includeLegacy ? backgrounds : remasterBackgrounds;
  const sweepDeities = includeLegacy ? deities : deities.filter((entry) => entry.remaster);
  const sweepClasses = remasterClasses;
  if (oneIndex >= 0) {
    const seed = Number(args[oneIndex + 1] ?? 40423);
    const index = seed - 40_000;
    const classData = sweepClasses[Math.floor(index / 20) % sweepClasses.length];
    const level = (index % 20) + 1;
    const ancestry = sweepAncestries[seed % sweepAncestries.length];
    const background = sweepBackgrounds[seed % sweepBackgrounds.length];
    allProblems.push(...simulate(seed, classData, level, ancestry, background));
    console.log(`One: seed ${seed} -> ${classData.name} ${ancestry.name} level ${level}.`);
  }
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
  if (levelsSweep) {
    let seed = 40_000;
    let count = 0;
    for (const classData of sweepClasses) {
      for (let level = 1; level <= 20; level++) {
        const ancestry = sweepAncestries[seed % sweepAncestries.length];
        const background = sweepBackgrounds[seed % sweepBackgrounds.length];
        allProblems.push(...simulate(seed++, classData, level, ancestry, background));
        count++;
      }
    }
    console.log(`Levels: ${count} builds (${sweepClasses.length} classes x 20 levels).`);
  }
  if (ancestrySweep) {
    let seed = 50_000;
    let count = 0;
    for (const ancestry of sweepAncestries) {
      for (let level = 1; level <= 20; level++) {
        const classData = sweepClasses[seed % sweepClasses.length];
        const background = sweepBackgrounds[seed % sweepBackgrounds.length];
        allProblems.push(...simulate(seed++, classData, level, ancestry, background));
        count++;
      }
    }
    console.log(`Ancestries: ${count} builds (${sweepAncestries.length} ancestries x 20 levels).`);
  }
  if (crossSweep) {
    let seed = 60_000;
    let count = 0;
    for (const classData of sweepClasses) {
      for (const ancestry of sweepAncestries) {
        for (const level of sweepLevels) {
          const background = sweepBackgrounds[seed % sweepBackgrounds.length];
          allProblems.push(...simulate(seed++, classData, level, ancestry, background));
          count++;
        }
      }
    }
    console.log(`Cross: ${count} class x ancestry builds at levels ${sweepLevels.join(", ")}.`);
  }
  if (heritageSweep) {
    let seed = 70_000;
    let count = 0;
    let skipped = 0;
    for (const heritage of sweepHeritages) {
      const ancestry = heritage.versatile
        ? sweepAncestries[seed % sweepAncestries.length]
        : sweepAncestries.find(
            (entry) =>
              entry.name === heritage.ancestry ||
              entry.name.toLowerCase().replace(/\s+/g, "-") === heritage.ancestrySlug.toLowerCase()
          );
      if (!ancestry) {
        skipped++;
        continue;
      }
      const classData = sweepClasses[seed % sweepClasses.length];
      for (const level of sweepLevels) {
        const background = sweepBackgrounds[seed % sweepBackgrounds.length];
        allProblems.push(
          ...simulate(seed++, classData, level, ancestry, background, undefined, heritage)
        );
        count++;
      }
    }
    console.log(
      `Heritages: ${count} builds (${sweepHeritages.length} heritages, ${skipped} without a matching ancestry) at levels ${sweepLevels.join(", ")}.`
    );
  }
  if (backgroundSweep) {
    let seed = 80_000;
    let count = 0;
    for (const background of sweepBackgrounds) {
      const classData = sweepClasses[seed % sweepClasses.length];
      const ancestry = sweepAncestries[seed % sweepAncestries.length];
      for (const level of sweepLevels) {
        allProblems.push(...simulate(seed++, classData, level, ancestry, background));
        count++;
      }
    }
    console.log(
      `Backgrounds: ${count} builds (${sweepBackgrounds.length} backgrounds x ${sweepLevels.length} levels).`
    );
  }
  if (deitySweep) {
    let seed = 90_000;
    let count = 0;
    const divineClasses = sweepClasses.filter((entry) =>
      ["Cleric", "Champion"].includes(entry.name)
    );
    for (const deity of sweepDeities) {
      for (const classData of divineClasses) {
        if (!deitySupportsClass(deity, classData)) continue;
        for (const level of sweepLevels) {
          const ancestry = sweepAncestries[seed % sweepAncestries.length];
          const background = sweepBackgrounds[seed % sweepBackgrounds.length];
          allProblems.push(
            ...simulate(seed++, classData, level, ancestry, background, undefined, undefined, deity)
          );
          count++;
        }
      }
    }
    console.log(
      `Deities: ${count} divine builds (${sweepDeities.length} deities x ${divineClasses.length} classes) at levels ${sweepLevels.join(", ")}.`
    );
  }
  if (optionsSweep) {
    let seed = 30_000;
    let optionCount = 0;
    for (const classData of sweepClasses) {
      for (const group of classData.choiceGroups) {
        for (const option of group.options) {
          const levels = new Set([Math.max(1, group.sourceFeature?.level ?? 1), 20]);
          for (const level of levels) {
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
    }
    console.log(`Options: ${optionCount} class/subclass option builds.`);
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
    for (const ancestry of sweepAncestries) {
      allProblems.push(...simulate(seed++, undefined, 1, ancestry));
      allProblems.push(...simulate(seed++, undefined, 5, ancestry));
    }
    for (const background of sweepBackgrounds) {
      allProblems.push(...simulate(seed++, undefined, 1, undefined, background));
      allProblems.push(...simulate(seed++, undefined, 5, undefined, background));
    }
    console.log(
      `Content: ${sweepAncestries.length} ancestries and ${sweepBackgrounds.length} backgrounds at levels 1 and 5.`
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
    `Simulated ${simulationCount} characters total (${seeds} random seeds, ${includeLegacy ? "all" : "remaster"} content); ${allProblems.length} problems in ${grouped.size} groups.`
  );
  console.log(
    `\nFeat automation across selections: ${automationTally.full} full / ${automationTally.partial} partial / ${automationTally.manual} manual.`
  );
  const topManualFeats = [...manualFeatFrequency.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);
  if (topManualFeats.length) {
    console.log("Most common manual feats selected:");
    for (const [name, count] of topManualFeats) console.log(`  ${count}x ${name}`);
  }
  const topManualItems = [...manualItemFrequency.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
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
}

const directEntry =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (directEntry) runCli();
