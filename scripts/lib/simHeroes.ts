/**
 * Deterministic level-1 hero factory for campaign simulations.
 *
 * The normal character simulation script builds random characters across the
 * whole compendium. This smaller helper exists so campaign-level simulations
 * can create representative, valid party members through the real API without
 * depending on random rolls or on a pathbuilder export for every class.
 */
import fs from "node:fs";
import path from "node:path";
import {
  cantripLimitFor,
  cantripPreparedLimitFor,
  casterInfo,
  classKeyOptions,
  computeCharacter,
  divineFontInfo,
  emptyCharacterDraft,
  flexibleBoosts,
  grantedTrainedSkills,
  isPreparedCasterClass,
  ordinarySpellSlotsFor,
  requiredExtraSkills,
} from "../../src/shared/rules";
import { featAllowedByHeritageGrant, heritageFeatGrant } from "../../src/shared/heritage";
import { activeGrantChoiceGroups } from "../../src/shared/classGrantChoices";
import { selectedClassGrants } from "../../src/shared/classGrants";
import { SKILLS } from "../../src/shared/types";
import type {
  AbilityKey,
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
} from "../../src/shared/types";

const compendiumDir = path.resolve(import.meta.dirname, "..", "..", "data", "compendium");
const read = <T>(file: string): T[] =>
  JSON.parse(fs.readFileSync(path.join(compendiumDir, file), "utf8")) as T[];

const ancestries = read<Ancestry>("ancestries.json");
const heritages = read<Heritage>("heritages.json");
const backgrounds = read<Background>("backgrounds.json");
const classes = read<ClassData>("classes.json");
const feats = read<Feat>("feats.json");
const spells = read<Spell>("spells.json");
const equipment = read<Equipment>("equipment.json");
const deities = read<Deity>("deities.json");

function byName<T extends { name: string }>(items: T[], name: string): T | null {
  const wanted = name.trim().toLowerCase();
  return items.find((entry) => entry.name.trim().toLowerCase() === wanted) ?? null;
}

export interface SimulatedHeroOptions {
  name: string;
  className: string;
  ancestryName?: string;
  heritageName?: string;
  backgroundName?: string;
  /** Preferred key ability; defaults to the class's first option. */
  keyAbility?: AbilityKey;
}

export function buildSimulatedHero(options: SimulatedHeroOptions): CharacterDraft {
  const ancestry = byName(ancestries, options.ancestryName ?? "Human") ?? ancestries[0];
  const heritage = options.heritageName
    ? (byName(heritages, options.heritageName) ?? null)
    : (heritages.find(
        (entry) =>
          entry.ancestry === ancestry.name || entry.ancestrySlug === ancestry.name.toLowerCase()
      ) ?? null);
  const background = byName(backgrounds, options.backgroundName ?? "Warrior") ?? backgrounds[0];
  const classData = byName(classes, options.className);
  if (!classData) throw new Error(`Unknown class in compendium: ${options.className}`);

  const draft = emptyCharacterDraft(options.name);
  draft.contentMode = "expanded";
  draft.includeLegacy = false;
  draft.level = 1;
  draft.ancestryId = ancestry.id;
  draft.ancestrySize = ancestry.sizeChoices?.[0] ?? null;
  draft.heritageId = heritage?.id ?? null;
  draft.backgroundId = background.id;
  draft.classId = classData.id;
  draft.skills.classSkills = (classData.skillChoices ?? []).flatMap((group) =>
    group.options.slice(0, group.count)
  );

  if (heritage?.name === "Skilled Human") {
    draft.featChoices[heritage.id] = ["stealth"];
  } else if (heritage?.name === "Versatile Human") {
    const toughness = feats.find((feat) => feat.name === "Toughness");
    if (toughness) draft.featChoices[heritage.id] = [toughness.id];
  } else if (heritage?.name === "Ancient Elf") {
    const grant = heritageFeatGrant(heritage);
    const dedication = grant
      ? feats.find(
          (feat) =>
            featAllowedByHeritageGrant(feat, grant, classData.name) &&
            !feat.traits.some((trait) => trait.toLowerCase() === classData.name.toLowerCase())
        )
      : null;
    if (dedication) draft.featChoices[heritage.id] = [dedication.id];
  }

  // Subclass-style choices that exist at 1st level. The first option is
  // deterministic and keeps the simulation stable from run to run.
  for (const group of classData.choiceGroups) {
    if ((group.sourceFeature?.level ?? 0) > 1) continue;
    draft.classChoices[group.key] = group.options.slice(0, group.count).map((entry) => entry.id);
  }

  const context = contextForDraft(draft);
  const fixed = new Set<string>();
  for (const entry of ancestry.boosts) if (entry.fixed) for (const id of entry.from) fixed.add(id);
  for (const entry of background.boosts)
    if (entry.fixed) for (const id of entry.from) fixed.add(id);

  const ancestryPicks: string[] = [];
  for (const group of flexibleBoosts(ancestry)) {
    const choice =
      group.from.find((id) => !ancestryPicks.includes(id) && !fixed.has(id)) ?? group.from[0];
    ancestryPicks.push(choice);
  }
  draft.boosts.ancestry = ancestryPicks as CharacterDraft["boosts"]["ancestry"];

  const backgroundPicks: string[] = [];
  for (const group of background.boosts.filter((entry) => !entry.fixed)) {
    const choice = group.from.find((id) => !backgroundPicks.includes(id)) ?? group.from[0];
    backgroundPicks.push(choice);
  }
  draft.boosts.background = backgroundPicks as CharacterDraft["boosts"]["background"];

  const keyOptions = classKeyOptions(draft, classData);
  draft.keyAbility =
    options.keyAbility && keyOptions.includes(options.keyAbility)
      ? options.keyAbility
      : (keyOptions[0] ?? null);

  const freePreferences: Record<string, AbilityKey[]> = {
    fighter: ["str", "dex", "con", "wis"],
    wizard: ["int", "dex", "con", "wis"],
    cleric: ["wis", "con", "str", "cha"],
    rogue: ["dex", "con", "wis", "cha"],
    ranger: ["dex", "str", "con", "wis"],
    bard: ["cha", "dex", "con", "wis"],
  };
  const preferred =
    freePreferences[classData.name.toLowerCase()] ?? (["str", "dex", "con", "wis"] as AbilityKey[]);
  const free: AbilityKey[] = [];
  for (const ability of preferred)
    if (!free.includes(ability) && free.length < 4) free.push(ability);
  for (const ability of ["str", "dex", "con", "int", "wis", "cha"] as AbilityKey[]) {
    if (free.length >= 4) break;
    if (!free.includes(ability)) free.push(ability);
  }
  draft.boosts.free = free as CharacterDraft["boosts"]["free"];

  if (classData.name.toLowerCase() === "cleric" || classData.name.toLowerCase() === "champion") {
    const deity =
      deities.find((entry) => entry.skill?.length || entry.weapons?.length) ?? deities[0] ?? null;
    draft.deityId = deity?.id ?? null;
  }

  const deity = deities.find((entry) => entry.id === draft.deityId) ?? null;
  const grantFeatIds = selectedClassGrants(draft, classData, deity).feats.map((feat) => feat.id);
  for (const group of activeGrantChoiceGroups(draft, classData, deity, grantFeatIds)) {
    if (!group.options.length) continue;
    draft.grantChoices[group.key] = group.options.slice(0, group.count).map((option) => option.id);
  }

  const caster = casterInfo(classData);
  if (caster.progression !== "none" && caster.progression !== "focus") {
    const tradition = caster.tradition ?? caster.traditionOptions?.[0] ?? null;
    draft.spells.tradition = tradition;
    const pool = spells.filter(
      (spell) => spell.remaster && (!tradition || spell.traditions.includes(tradition))
    );
    const classGrantSpells = selectedClassGrants(draft, classData, deity).spells;
    const cantripLimit = cantripLimitFor(classData) ?? 0;
    for (const spell of pool.filter((spell) => spell.rank === 0).slice(0, cantripLimit)) {
      draft.spells.cantrips.push(spell.id);
    }
    if (isPreparedCasterClass(classData.name)) {
      const preparedLimit = cantripPreparedLimitFor(classData) ?? draft.spells.cantrips.length;
      draft.spells.preparedCantrips = draft.spells.cantrips.slice(0, preparedLimit);
    }
    const ordinary = ordinarySpellSlotsFor(1, caster.progression, classData.name) ?? [];
    for (let rank = 1; rank <= ordinary.length; rank += 1) {
      const count = ordinary[rank - 1] ?? 0;
      if (!count) continue;
      const exact = pool.filter((spell) => spell.rank === rank);
      if (!exact.length) continue;
      const curriculum = classGrantSpells
        .filter((spell) => spell.kind === "curriculum" && spell.rank === rank)
        .map((spell) => exact.find((candidate) => candidate.id === spell.id))
        .filter((spell): spell is Spell => Boolean(spell));
      const ordered = [
        ...curriculum.slice(0, 1),
        ...exact.filter((spell) => spell.id !== curriculum[0]?.id),
      ];
      for (let index = 0; index < count; index += 1) {
        const spell = ordered[index % ordered.length];
        if (!draft.spells.known.includes(spell.id)) draft.spells.known.push(spell.id);
        draft.spells.prepared.push(spell.id);
        (draft.spells.preparedByRank[String(rank)] ??= []).push(spell.id);
      }
    }
    if (classData.name.toLowerCase() === "cleric") {
      const font = divineFontInfo(1, classData.name);
      const fontNames = (deity?.font?.length ? deity.font : ["heal", "harm"]).map((name) =>
        name.toLowerCase()
      );
      const fontSpell =
        pool.find((spell) => fontNames.includes(spell.name.toLowerCase())) ??
        pool.find((spell) => spell.name === "Heal") ??
        pool.find((spell) => spell.name === "Harm");
      if (font && fontSpell) {
        const lower = fontSpell.name.trim().toLowerCase();
        if (lower === "heal" || lower === "harm") draft.spells.fontChoice = lower;
        if (!draft.spells.known.includes(fontSpell.id)) {
          draft.spells.known.push(fontSpell.id);
        }
        const key = String(font.rank);
        for (let index = 0; index < font.slots; index += 1) {
          draft.spells.prepared.push(fontSpell.id);
          (draft.spells.preparedByRank[key] ??= []).push(fontSpell.id);
        }
      }
    }
  }

  const granted = grantedTrainedSkills(draft, context);
  const additional = requiredExtraSkills(draft, context);
  const candidates = SKILLS.map((skill) => skill.id).filter((id) => !granted.has(id));
  draft.skills.trained = candidates.slice(0, additional);

  // One representative weapon and suit of armor so AC/attacks are real.
  draft.equipment = [];
  const withEquipment = computeCharacter(draft, context);
  const weaponCategory =
    withEquipment.prof.attacks.martial > 0
      ? "martial"
      : withEquipment.prof.attacks.simple > 0
        ? "simple"
        : null;
  const weapon = weaponCategory
    ? (equipment.find(
        (item) =>
          item.weapon?.category === weaponCategory && item.level <= 1 && item.weapon.damage.dice > 0
      ) ?? null)
    : null;
  const armorCategory = withEquipment.prof.defenses.heavy
    ? "heavy"
    : withEquipment.prof.defenses.medium
      ? "medium"
      : withEquipment.prof.defenses.light
        ? "light"
        : null;
  const armor = armorCategory
    ? (equipment.find((item) => item.armor?.category === armorCategory && item.level <= 1) ?? null)
    : null;
  if (weapon) draft.equipment.push({ itemId: weapon.id, quantity: 1, equipped: true });
  if (armor) draft.equipment.push({ itemId: armor.id, quantity: 1, equipped: true });

  draft.currency = { gp: 10, sp: 0, cp: 0 };
  return draft;
}

export function contextForDraft(draft: CharacterDraft): CharacterContext {
  // Only selected feats/spells belong in the active context. Passing the full
  // compendium here would apply every feat effect to every character.
  const selectedFeatIds = new Set<string>([
    ...Object.values(draft.feats.ancestry),
    ...Object.values(draft.feats.class),
    ...Object.values(draft.feats.skill),
    ...Object.values(draft.feats.general),
    ...draft.feats.extras,
    ...Object.keys(draft.featChoices),
    ...Object.values(draft.featChoices).flat(),
  ]);
  const selectedSpellIds = new Set<string>([
    ...draft.spells.cantrips,
    ...draft.spells.known,
    ...draft.spells.prepared,
    ...Object.values(draft.spells.preparedByRank ?? {}).flat(),
    ...draft.spells.focus,
  ]);
  const selectedEquipmentIds = new Set(draft.equipment.map((entry) => entry.itemId));
  return {
    ancestry: ancestries.find((entry) => entry.id === draft.ancestryId) ?? null,
    heritage: heritages.find((entry) => entry.id === draft.heritageId) ?? null,
    background: backgrounds.find((entry) => entry.id === draft.backgroundId) ?? null,
    classData: classes.find((entry) => entry.id === draft.classId) ?? null,
    deity: deities.find((entry) => entry.id === draft.deityId) ?? null,
    feats: Object.fromEntries(
      feats.filter((feat) => selectedFeatIds.has(feat.id)).map((feat) => [feat.id, feat])
    ),
    spells: Object.fromEntries(
      spells.filter((spell) => selectedSpellIds.has(spell.id)).map((spell) => [spell.id, spell])
    ),
    equipment: Object.fromEntries(
      equipment.filter((item) => selectedEquipmentIds.has(item.id)).map((item) => [item.id, item])
    ),
    featNames: feats.map((feat) => feat.name.toLowerCase()),
  };
}
