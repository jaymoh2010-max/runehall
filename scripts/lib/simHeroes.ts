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
  classKeyOptions,
  computeCharacter,
  emptyCharacterDraft,
  flexibleBoosts,
  grantedTrainedSkills,
} from "../../src/shared/rules";
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
  draft.heritageId = heritage?.id ?? null;
  draft.backgroundId = background.id;
  draft.classId = classData.id;

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

  const granted = grantedTrainedSkills(draft, context);
  const additional = Math.max(
    0,
    classData.trainedSkills.additional + Math.max(0, abilityModOf(draft, context, "int"))
  );
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

function abilityModOf(
  draft: CharacterDraft,
  context: CharacterContext,
  ability: AbilityKey
): number {
  const score = computeCharacter(draft, context).abilities[ability];
  return Math.floor((score - 10) / 2);
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
  ]);
  const selectedSpellIds = new Set<string>([
    ...draft.spells.cantrips,
    ...draft.spells.known,
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
