import {
  emptyCharacterDraft,
  baseAbilityScores,
  casterInfo,
  flexibleBoosts,
  spellSlotsFor,
} from "../shared/rules";
import { newId } from "./util";
import { featGrant } from "../shared/effects";
import {
  ABILITIES,
  SKILLS,
  type AbilityKey,
  type CharacterCompanion,
  type CharacterDraft,
  type ContentMode,
  type PathbuilderImportReport,
  type SpellTradition,
} from "../shared/types";
import {
  ancestries,
  backgrounds,
  classes,
  deities,
  equipment,
  feats,
  heritages,
  spells,
  contextForDraft,
} from "./compendium";

type Obj = Record<string, unknown>;

function obj(value: unknown): Obj {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Obj) : {};
}

function arr<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function text(value: unknown, max = 200): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function num(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function nameKey(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2019]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function nameMap<T extends { id: string; name: string }>(items: T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of items) {
    const key = nameKey(item.name);
    if (!map.has(key)) map.set(key, item);
  }
  return map;
}

function lookup<T>(map: Map<string, T>, raw: unknown): T | null {
  const name = text(raw);
  if (!name) return null;
  return map.get(nameKey(name)) ?? map.get(nameKey(name.replace(/\s*\([^)]*\)\s*$/, ""))) ?? null;
}

function lookupEquipment<T extends { id: string; name: string }>(
  map: Map<string, T>,
  raw: unknown
): T | null {
  return (
    lookup(map, raw) ??
    lookup(map, `${text(raw)} Armor`) ??
    lookup(map, `${text(raw)} Weapon`) ??
    null
  );
}

const ABILITY_NAMES: Record<string, AbilityKey> = {
  str: "str",
  strength: "str",
  dex: "dex",
  dexterity: "dex",
  con: "con",
  constitution: "con",
  int: "int",
  intelligence: "int",
  wis: "wis",
  wisdom: "wis",
  cha: "cha",
  charisma: "cha",
};

function abilityKey(value: unknown): AbilityKey | null {
  return ABILITY_NAMES[text(value).toLowerCase()] ?? null;
}

function abilityList(value: unknown): AbilityKey[] {
  return arr(value)
    .map(abilityKey)
    .filter((key): key is AbilityKey => Boolean(key));
}

function assignFlexPicks(
  picks: AbilityKey[],
  groups: { from: AbilityKey[] }[]
): (AbilityKey | null)[] {
  const remaining = [...picks];
  return groups.map((group) => {
    const index = remaining.findIndex((ability) => group.from.includes(ability));
    if (index < 0) return null;
    return remaining.splice(index, 1)[0];
  });
}

function tradition(value: unknown): SpellTradition | null {
  const raw = text(value).toLowerCase();
  return raw === "arcane" || raw === "divine" || raw === "occult" || raw === "primal" ? raw : null;
}

export type PathbuilderReport = PathbuilderImportReport;

export interface PathbuilderImportOptions {
  contentMode?: ContentMode;
  includeLegacy?: boolean;
}

export interface PathbuilderImportResult {
  draft: CharacterDraft;
  report: PathbuilderReport;
}

/**
 * Convert a Pathbuilder 2e export's `build` object into a Runehall draft.
 * Mapping is best-effort: names are matched against the local compendium, and
 * anything that cannot be resolved is reported instead of guessed silently.
 */
export function importPathbuilder(
  build: Obj,
  options: PathbuilderImportOptions = {}
): PathbuilderImportResult {
  const matched: Record<string, number> = {};
  const unmatched: string[] = [];
  const warnings: string[] = [];
  const match = (kind: string) => {
    matched[kind] = (matched[kind] ?? 0) + 1;
  };

  const draft = emptyCharacterDraft(text(build.name, 120) || "Imported Hero");
  draft.contentMode = options.contentMode ?? "expanded";
  draft.includeLegacy = Boolean(options.includeLegacy);
  draft.level = Math.max(1, Math.min(20, Math.round(num(build.level, 1))));

  const ancestry = lookup(nameMap(ancestries), build.ancestry);
  if (ancestry) {
    draft.ancestryId = ancestry.id;
    match("ancestry");
  } else if (text(build.ancestry)) {
    unmatched.push(`Ancestry: ${text(build.ancestry)}`);
  }

  const heritage = lookup(nameMap(heritages), build.heritage);
  if (heritage) {
    draft.heritageId = heritage.id;
    match("heritage");
  } else if (text(build.heritage)) {
    unmatched.push(`Heritage: ${text(build.heritage)}`);
  }

  const background = lookup(nameMap(backgrounds), build.background);
  if (background) {
    draft.backgroundId = background.id;
    match("background");
    const backgroundProficiencies = obj(build.proficiencies);
    const backgroundSkillPicks = background.skillChoices.flatMap((group) =>
      group.options
        .filter((option) => num(backgroundProficiencies[option], 0) > 0)
        .slice(0, group.count)
    );
    if (backgroundSkillPicks.length) {
      draft.skills.background = backgroundSkillPicks;
      match("background skill");
    }
    const backgroundLoreNames = arr<unknown[]>(build.lores)
      .map((entry) => text(Array.isArray(entry) ? entry[0] : entry, 80))
      .filter(Boolean);
    for (const group of background.loreChoices) {
      const candidates = group.options.length ? group.options : backgroundLoreNames;
      const picks = candidates
        .filter((name) => backgroundLoreNames.some((lore) => nameKey(lore) === nameKey(name)))
        .slice(0, group.count);
      if (picks.length) {
        draft.skills.backgroundLore = [...new Set([...draft.skills.backgroundLore, ...picks])];
        match("background lore");
      }
    }
    const backgroundFeatNames = arr<unknown[]>(build.feats)
      .map((entry) => (Array.isArray(entry) ? text(entry[0], 120) : ""))
      .filter(Boolean);
    for (const group of background.featChoices) {
      const picked = group.options.find((option) =>
        backgroundFeatNames.some((name) => nameKey(name) === nameKey(option.name))
      );
      if (picked) {
        draft.backgroundFeat = picked.id;
        match("background feat");
        break;
      }
    }
  } else if (text(build.background)) {
    unmatched.push(`Background: ${text(build.background)}`);
  }

  const classData = lookup(nameMap(classes), build.class);
  if (classData) {
    draft.classId = classData.id;
    match("class");
  } else if (text(build.class)) {
    unmatched.push(`Class: ${text(build.class)}`);
  }
  const dualClass = text(build.dualClass);
  if (dualClass) {
    warnings.push(
      `Dual-class (${dualClass}) is not supported; only ${classData?.name ?? "the primary class"} was imported.`
    );
  }
  if (classData?.choiceGroups.length) {
    const chosenNames = new Set(
      [
        ...arr<string>(build.specials).map((value) => text(value, 120)),
        ...arr<unknown[]>(build.feats).map((entry) =>
          Array.isArray(entry) ? text(entry[0], 120) : ""
        ),
      ]
        .filter(Boolean)
        .map(nameKey)
    );
    const missing: string[] = [];
    for (const group of classData.choiceGroups) {
      const matches = group.options.filter((option) => {
        const key = nameKey(option.name);
        return [...chosenNames].some(
          (chosen) => chosen === key || chosen.includes(key) || key.includes(chosen)
        );
      });
      if (matches.length >= group.count) {
        draft.classChoices[group.key] = matches.slice(0, group.count).map((option) => option.id);
        match("class choice");
      } else {
        missing.push(group.prompt);
      }
    }
    if (missing.length) {
      warnings.push(
        `Pathbuilder did not identify these class choices: ${missing.join("; ")}. Review the Class and Feats steps.`
      );
    }
  }

  const deity = lookup(nameMap(deities), build.deity);
  if (deity) {
    draft.deityId = deity.id;
    match("deity");
  } else if (text(build.deity) && text(build.deity).toLowerCase() !== "not set") {
    unmatched.push(`Deity: ${text(build.deity)}`);
  }

  const abilities = obj(build.abilities);
  const breakdown = obj(abilities.breakdown);
  const classBoost = abilityList(breakdown.classBoosts)[0] ?? null;
  draft.keyAbility =
    classBoost && classData?.keyAbility.includes(classBoost)
      ? classBoost
      : (classData?.keyAbility[0] ?? null);

  if (ancestry) {
    draft.boosts.ancestry = assignFlexPicks(
      abilityList(breakdown.ancestryFree),
      flexibleBoosts(ancestry)
    );
  }
  if (background) {
    const groups = background.boosts.filter((entry) => !entry.fixed);
    const fixed = new Set(
      background.boosts.filter((entry) => entry.fixed).flatMap((entry) => entry.from)
    );
    draft.boosts.background = assignFlexPicks(
      abilityList(breakdown.backgroundBoosts).filter((ability) => !fixed.has(ability)),
      groups
    );
  }

  const levelBoosts = obj(breakdown.mapLevelledBoosts);
  const levelOne = abilityList(levelBoosts["1"]);
  draft.boosts.free = [
    levelOne[0] ?? null,
    levelOne[1] ?? null,
    levelOne[2] ?? null,
    levelOne[3] ?? null,
  ];
  for (const milestone of [5, 10, 15, 20]) {
    draft.boosts.levels[String(milestone)] = abilityList(levelBoosts[String(milestone)]);
  }
  const extraBoostLevels = Object.keys(levelBoosts).filter(
    (level) => !["1", "5", "10", "15", "20"].includes(level)
  );
  if (extraBoostLevels.length) {
    warnings.push(
      `Pathbuilder applied extra ability boosts at level(s) ${extraBoostLevels.join(", ")}; review the final scores.`
    );
  }

  draft.details.gender = text(build.gender, 80);
  draft.details.age = text(build.age, 40);
  draft.details.languages = arr<string>(build.languages)
    .map((language) => text(language, 40))
    .filter(Boolean);

  const money = obj(build.money);
  draft.currency.gp =
    Math.max(0, Math.round(num(money.gp))) + Math.max(0, Math.round(num(money.pp))) * 10;
  draft.currency.sp = Math.max(0, Math.round(num(money.sp)));
  draft.currency.cp = Math.max(0, Math.round(num(money.cp)));

  const featMap = nameMap(feats);
  let lastParent: { id: string } | null = null;
  for (const entry of arr<unknown[]>(build.feats)) {
    if (!Array.isArray(entry)) continue;
    const name = text(entry[0], 160);
    const category = text(entry[2], 40);
    if (!name || category === "Heritage") continue;
    const choiceType = text(entry[5], 40);
    const feat = lookup(featMap, name);
    if (!feat) {
      unmatched.push(`Feat: ${name}`);
      continue;
    }
    if (feat.id === draft.backgroundFeat) {
      match("background feat");
      lastParent = feat;
      continue;
    }
    const level = Math.max(1, Math.min(20, Math.round(num(entry[3], feat.level || 1))));
    if (choiceType === "childChoice" && lastParent && featGrant(lastParent.id)) {
      draft.featChoices[lastParent.id] = [feat.id];
      match("feat");
      continue;
    }
    const slot =
      category === "Ancestry Feat"
        ? "ancestry"
        : category === "Class Feat"
          ? "class"
          : category === "Skill Feat"
            ? "skill"
            : category === "General Feat"
              ? "general"
              : null;
    if (!slot) {
      if (category === "Awarded Feat") {
        warnings.push(
          `Skipped awarded feat ${feat.name}; it is usually granted automatically by a class or background.`
        );
      } else {
        draft.feats.extras.push(feat.id);
        match("feat");
      }
      lastParent = feat;
      continue;
    }
    const bucket = draft.feats[slot];
    const key = String(level);
    if (bucket[key]) draft.feats.extras.push(feat.id);
    else bucket[key] = feat.id;
    match("feat");
    lastParent = feat;
  }

  for (const entry of arr<unknown[]>(build.lores)) {
    const name = text(Array.isArray(entry) ? entry[0] : entry, 80);
    if (!name) continue;
    draft.skills.lore.push(name);
    match("lore");
  }

  const proficiencies = obj(build.proficiencies);
  const skillRanks: Record<string, number> = {};
  for (const skill of SKILLS) {
    const value = num(proficiencies[skill.id], NaN);
    if (Number.isFinite(value)) {
      skillRanks[skill.id] = Math.max(0, Math.min(4, Math.round(value / 2)));
    }
  }
  draft.skills.trained = Object.entries(skillRanks)
    .filter(([, rank]) => rank >= 1)
    .map(([id]) => id);
  const increaseLevels = (classData?.skillIncreaseLevels ?? [])
    .filter((level) => level <= draft.level)
    .sort((a, b) => a - b);
  const pending = Object.entries(skillRanks)
    .filter(([, rank]) => rank > 1)
    .map(([id, rank]) => ({ id, remaining: rank - 1 }));
  const increases: Record<string, string> = {};
  for (const level of increaseLevels) {
    const candidate = pending.find((entry) => entry.remaining > 0);
    if (!candidate) break;
    increases[String(level)] = candidate.id;
    candidate.remaining -= 1;
  }
  draft.skills.increases = increases;
  if (pending.some((entry) => entry.remaining > 0)) {
    warnings.push(
      "Some Pathbuilder skill ranks could not be reconstructed from the available skill increases; review the Skills step."
    );
  }

  const equipmentMap = nameMap(equipment);
  const findRune = (rawName: string) => {
    const direct = lookupEquipment(equipmentMap, rawName);
    if (direct) return direct;
    return lookupEquipment(
      equipmentMap,
      rawName.replace(/^Reinforcing\s*\(/i, "Reinforcing Rune (")
    );
  };
  const runeIdsFor = (names: string[]) => {
    const ids: string[] = [];
    for (const name of names) {
      if (!name) continue;
      const rune = findRune(name);
      if (rune) ids.push(rune.id);
      else unmatched.push(`Rune: ${name}`);
    }
    return [...new Set(ids)];
  };
  const strikingRune = (value: string) => {
    const raw = value.toLowerCase();
    if (!raw) return null;
    if (raw.includes("major")) return "Striking (Major)";
    if (raw.includes("greater")) return "Striking (Greater)";
    return "Striking";
  };
  const resilientRune = (value: string) => {
    const raw = value.toLowerCase();
    if (!raw) return null;
    if (raw.includes("major")) return "Resilient (Major)";
    if (raw.includes("greater")) return "Resilient (Greater)";
    return "Resilient";
  };
  const addEquipment = (
    rawName: unknown,
    quantity: unknown,
    equipped: boolean,
    invested: boolean,
    runeNames: string[] = []
  ) => {
    const name = text(rawName, 160);
    if (!name) return;
    const item = lookupEquipment(equipmentMap, name);
    if (!item) {
      unmatched.push(`Equipment: ${name}`);
      return;
    }
    const runes = runeIdsFor(runeNames);
    const existing = draft.equipment.find((entry) => entry.itemId === item.id);
    if (existing) {
      existing.quantity += Math.max(1, Math.round(num(quantity, 1)));
      existing.equipped = existing.equipped || equipped;
      existing.invested = existing.invested || invested;
      if (runes.length) existing.runes = [...new Set([...(existing.runes ?? []), ...runes])];
    } else {
      draft.equipment.push({
        itemId: item.id,
        quantity: Math.max(1, Math.round(num(quantity, 1))),
        equipped,
        invested,
        ...(runes.length ? { runes } : {}),
      });
    }
    match("equipment");
  };
  for (const entry of arr<unknown[]>(build.equipment)) {
    if (!Array.isArray(entry)) continue;
    const invested = entry.some((value) => text(value, 20).toLowerCase() === "invested");
    addEquipment(entry[0], entry[1], false, invested);
  }
  for (const weapon of arr<Obj>(build.weapons)) {
    const runeNames: string[] = [];
    const potency = Math.max(0, Math.min(3, Math.round(num(weapon.pot))));
    if (potency) runeNames.push(`Weapon Potency (+${potency})`);
    const striking = strikingRune(text(weapon.str));
    if (striking) runeNames.push(striking);
    for (const rune of arr(weapon.runes)) runeNames.push(text(rune));
    addEquipment(weapon.name, weapon.qty, true, true, runeNames);
  }
  for (const armor of arr<Obj>(build.armor)) {
    const isShield = text(armor.prof).toLowerCase() === "shield";
    const runeNames: string[] = [];
    const potency = Math.max(0, Math.min(3, Math.round(num(armor.pot))));
    if (potency && !isShield) runeNames.push(`Armor Potency (+${potency})`);
    const resilient = resilientRune(text(armor.res));
    if (resilient) runeNames.push(resilient);
    for (const rune of arr(armor.runes)) runeNames.push(text(rune));
    addEquipment(armor.name, armor.qty, Boolean(armor.worn), true, runeNames);
  }

  const spellMap = nameMap(spells);
  const spellSets = {
    cantrips: new Set<string>(draft.spells.cantrips),
    known: new Set<string>(draft.spells.known),
    focus: new Set<string>(draft.spells.focus),
  };
  const addSpell = (rawName: unknown, target: Set<string>) => {
    const name = text(rawName, 160);
    if (!name) return null;
    const spell = lookup(spellMap, name);
    if (!spell) {
      unmatched.push(`Spell: ${name}`);
      return null;
    }
    target.add(spell.id);
    match("spell");
    return spell.id;
  };
  const prepared: string[] = [];
  let preparedCasters = 0;
  for (const caster of arr<Obj>(build.spellCasters)) {
    const casterTradition = tradition(caster.magicTradition);
    const isPrepared = text(caster.spellcastingType).toLowerCase() === "prepared";
    if (isPrepared && casterTradition) preparedCasters += 1;
    if (!draft.spells.tradition && casterTradition) draft.spells.tradition = casterTradition;
    for (const group of arr<Obj>(caster.spells)) {
      const rank = Math.max(0, Math.round(num(group.spellLevel, 0)));
      for (const name of arr(group.list)) {
        if (!casterTradition) {
          addSpell(name, spellSets.focus);
        } else if (rank === 0) {
          addSpell(name, spellSets.cantrips);
        } else {
          const id = addSpell(name, spellSets.known);
          if (isPrepared && id) prepared.push(id);
        }
      }
    }
    if (
      classData &&
      casterTradition &&
      text(caster.name).toLowerCase() === classData.name.toLowerCase()
    ) {
      const derivedSlots = spellSlotsFor(
        draft.level,
        casterInfo(classData).progression,
        classData.name
      );
      const perDay = arr(caster.perDay).map((value) => Math.max(0, Math.round(num(value))));
      if (derivedSlots) {
        const length = Math.max(derivedSlots.length, perDay.length);
        const differs = Array.from(
          { length },
          (_, index) => (derivedSlots[index] ?? 0) !== (perDay[index] ?? 0)
        ).some(Boolean);
        if (differs) {
          warnings.push(
            `Pathbuilder lists per-day slots ${JSON.stringify(perDay)} for ${caster.name}, but Runehall derives ${JSON.stringify(derivedSlots)}; bonus or archetype slots may need review.`
          );
        }
      }
    }
  }
  for (const entry of Object.values(obj(build.focus))) {
    for (const caster of Object.values(obj(entry))) {
      for (const name of arr(obj(caster).focusCantrips)) addSpell(name, spellSets.focus);
      for (const name of arr(obj(caster).focusSpells)) addSpell(name, spellSets.focus);
    }
  }
  draft.spells.cantrips = [...spellSets.cantrips];
  draft.spells.known = [...spellSets.known];
  draft.spells.prepared = prepared;
  draft.spells.focus = [...spellSets.focus];
  if (preparedCasters) {
    warnings.push(
      "Prepared casters import their prepared list; add any missing spellbook spells in the Spells step."
    );
  }

  const companionKind = (value: unknown): CharacterCompanion["kind"] => {
    const raw = text(value).toLowerCase();
    if (raw.includes("familiar")) return "familiar";
    if (raw.includes("eidolon")) return "eidolon";
    if (raw.includes("summon")) return "summon";
    return "animal";
  };
  const importCompanion = (raw: Obj, fallbackKind: CharacterCompanion["kind"]) => {
    const name =
      text(raw.name, 120) ||
      text(raw.type, 120) ||
      (fallbackKind === "familiar" ? "Familiar" : "Companion");
    const abilities = arr(raw.abilities)
      .map((ability) => text(ability, 80))
      .filter(Boolean);
    const equipmentNames = arr(raw.equipment)
      .map((item) => (Array.isArray(item) ? text(item[0], 80) : text(item, 80)))
      .filter(Boolean);
    const details = [
      text(raw.type, 80),
      ...abilities,
      equipmentNames.length ? `Equipment: ${equipmentNames.join(", ")}` : "",
    ].filter(Boolean);
    draft.companions.push({
      id: newId("comp"),
      name,
      kind: fallbackKind === "familiar" ? "familiar" : companionKind(raw.type),
      level: Math.max(0, Math.min(20, Math.round(num(raw.level, draft.level)))),
      hpCurrent: null,
      hpMax: null,
      ac: null,
      monsterId: null,
      notes: details.join(" · "),
    });
    match("companion");
  };
  for (const familiar of arr<Obj>(build.familiars)) importCompanion(familiar, "familiar");
  for (const pet of arr<Obj>(build.pets)) importCompanion(pet, "animal");
  if (draft.companions.length) {
    warnings.push(
      "Pets and familiars were imported as companions; their HP, AC, and statblocks still need review."
    );
  }

  const context = contextForDraft(draft);
  const computed = baseAbilityScores(draft, context);
  const expected = abilities;
  for (const ability of ABILITIES) {
    const wanted = num(expected[ability], NaN);
    if (Number.isFinite(wanted) && computed[ability] !== wanted) {
      warnings.push(
        `${ability.toUpperCase()} imports as ${computed[ability]} but Pathbuilder shows ${wanted}; review the ability boosts.`
      );
    }
  }

  return { draft, report: { matched, unmatched, warnings } };
}
