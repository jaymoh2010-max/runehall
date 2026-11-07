import {
  ABILITIES,
  ABILITY_LABELS,
  SAVE_ABILITY,
  SKILLS,
  SKILL_BY_ID,
  type AbilityKey,
  type Ancestry,
  type Background,
  type CasterProgression,
  type CharacterContext,
  type CharacterDraft,
  type ClassChoiceGroup,
  type ClassChoiceOption,
  type ClassData,
  type Deity,
  type DerivedAttack,
  type DerivedCharacter,
  type DerivedSkill,
  type Equipment,
  type Feat,
  type FeatureSummary,
  type ProficiencyRank,
  type SaveKey,
  type Severity,
  type SkillId,
  type SpellTradition,
  type ValidationIssue,
} from "./types";
import { propertyRuneDamage, shieldRuneBonus, summarizeRunes } from "./runes";
import { collectFeatEffects } from "./effects";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
export const STARTING_WEALTH_CP = [
  0, 1500, 3000, 7500, 14000, 27000, 44000, 72000, 110000, 160000, 230000, 320000, 450000, 600000,
  800000, 1050000, 1350000, 1800000, 2400000, 3200000, 4500000,
];

export function startingWealthCp(level: number): number {
  const safe = Math.max(1, Math.min(20, Math.floor(level || 1)));
  return STARTING_WEALTH_CP[safe] ?? 1500;
}

const FULL_CASTER_CLASSES = new Set([
  "animist",
  "bard",
  "cleric",
  "druid",
  "oracle",
  "sorcerer",
  "witch",
  "wizard",
]);
const BOUNDED_CASTER_CLASSES = new Set(["magus", "necromancer", "summoner"]);
const PREPARED_CASTER_CLASSES = new Set([
  "animist",
  "cleric",
  "druid",
  "magus",
  "necromancer",
  "witch",
  "wizard",
]);

export function isPreparedCasterClass(className?: string): boolean {
  return PREPARED_CASTER_CLASSES.has(className?.toLowerCase() ?? "");
}

interface CasterInfo {
  progression: CasterProgression;
  tradition: SpellTradition | null;
  traditionOptions: SpellTradition[] | null;
  requiresDeity: boolean;
  /** Attribute used for spell attack rolls and spell DCs. Null means the class key attribute. */
  spellAbility: AbilityKey | null;
}

const TRADITIONS: SpellTradition[] = ["arcane", "divine", "occult", "primal"];

export function casterInfo(classData: ClassData | null | undefined): CasterInfo {
  const name = (classData?.name || "").toLowerCase();
  const none = {
    progression: "none" as const,
    tradition: null,
    traditionOptions: null,
    requiresDeity: false,
    spellAbility: null,
  };
  if (!name) return none;
  if (name === "cleric") {
    return {
      progression: "full",
      tradition: "divine",
      traditionOptions: null,
      requiresDeity: true,
      spellAbility: "wis",
    };
  }
  if (name === "druid") {
    return {
      progression: "full",
      tradition: "primal",
      traditionOptions: null,
      requiresDeity: false,
      spellAbility: "wis",
    };
  }
  if (name === "bard") {
    return {
      progression: "full",
      tradition: "occult",
      traditionOptions: null,
      requiresDeity: false,
      spellAbility: "cha",
    };
  }
  if (name === "wizard") {
    return {
      progression: "full",
      tradition: "arcane",
      traditionOptions: null,
      requiresDeity: false,
      spellAbility: "int",
    };
  }
  if (name === "animist") {
    return {
      progression: "full",
      tradition: "divine",
      traditionOptions: null,
      requiresDeity: false,
      spellAbility: "wis",
    };
  }
  if (name === "oracle") {
    return {
      progression: "full",
      tradition: "divine",
      traditionOptions: null,
      requiresDeity: false,
      spellAbility: "cha",
    };
  }
  if (name === "psychic") {
    return {
      progression: "bounded",
      tradition: "occult",
      traditionOptions: null,
      requiresDeity: false,
      spellAbility: null,
    };
  }
  if (name === "sorcerer") {
    return {
      progression: "full",
      tradition: null,
      traditionOptions: TRADITIONS,
      requiresDeity: false,
      spellAbility: "cha",
    };
  }
  if (name === "witch") {
    return {
      progression: "full",
      tradition: null,
      traditionOptions: TRADITIONS,
      requiresDeity: false,
      spellAbility: "int",
    };
  }
  if (name === "summoner") {
    return {
      progression: "bounded",
      tradition: null,
      traditionOptions: TRADITIONS,
      requiresDeity: false,
      spellAbility: "cha",
    };
  }
  if (name === "magus") {
    return {
      progression: "bounded",
      tradition: "arcane",
      traditionOptions: null,
      requiresDeity: false,
      spellAbility: "int",
    };
  }
  if (name === "necromancer") {
    return {
      progression: "bounded",
      tradition: "occult",
      traditionOptions: null,
      requiresDeity: false,
      spellAbility: "int",
    };
  }
  if (name === "champion") {
    return {
      progression: "focus",
      tradition: "divine",
      traditionOptions: null,
      requiresDeity: true,
      spellAbility: "cha",
    };
  }
  if (FULL_CASTER_CLASSES.has(name)) {
    return {
      progression: "full",
      tradition: null,
      traditionOptions: TRADITIONS,
      requiresDeity: false,
      spellAbility: null,
    };
  }
  if (BOUNDED_CASTER_CLASSES.has(name)) {
    return {
      progression: "bounded",
      tradition: null,
      traditionOptions: TRADITIONS,
      requiresDeity: false,
      spellAbility: null,
    };
  }
  if (Number(classData?.spellcasting) > 0) {
    return {
      progression: "full",
      tradition: null,
      traditionOptions: TRADITIONS,
      requiresDeity: false,
      spellAbility: null,
    };
  }
  return none;
}

// ---------------------------------------------------------------------------
// Basic math
// ---------------------------------------------------------------------------
export function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function proficiencyBonus(rank: number, level: number): number {
  if (rank <= 0) return 0;
  return level + Math.min(4, rank) * 2;
}

export function skillRankCap(level: number): number {
  if (level >= 15) return 4;
  if (level >= 7) return 3;
  if (level >= 3) return 2;
  return 1;
}

export function fullCasterSlots(level: number): number[] {
  const maxRank = Math.ceil(level / 2);
  // At 19th and 20th level, full casters have three slots of every rank from
  // 1st through 9th, plus a single 10th-rank slot from a capstone feature.
  if (maxRank >= 10) return [3, 3, 3, 3, 3, 3, 3, 3, 3, 1];
  const slots: number[] = [];
  for (let rank = 1; rank <= maxRank; rank++) {
    if (rank < maxRank) slots.push(3);
    else slots.push(level % 2 === 1 ? 2 : 3);
  }
  return slots;
}

/**
 * Magus, summoner, and necromancer use the reduced bounded-caster table:
 * one slot of the highest rank at odd levels, two at even levels, and two
 * slots of every lower rank.
 */
export function boundedCasterSlots(level: number): number[] {
  // Bounded casters cap at 9th-rank spells. From 18th level onward they have
  // two slots of every rank.
  if (level >= 18) return [2, 2, 2, 2, 2, 2, 2, 2, 2];
  const maxRank = Math.ceil(level / 2);
  const slots: number[] = [];
  for (let rank = 1; rank <= maxRank; rank++) {
    if (rank < maxRank) slots.push(2);
    else slots.push(level % 2 === 1 ? 1 : 2);
  }
  return slots;
}

/**
 * The animist's total slots per rank, combining prepared animist spell slots
 * and spontaneous apparition spell slots. The table is from Player Core's
 * Animist Spells per Day.
 */
export function animistSlots(level: number): number[] {
  const table: number[][] = [
    [2],
    [3],
    [3, 2],
    [3, 3],
    [3, 3, 2],
    [3, 3, 3],
    [3, 3, 3, 2],
    [3, 3, 3, 3],
    [3, 3, 3, 3, 2],
    [4, 4, 4, 3, 3],
    [4, 4, 4, 4, 3, 2],
    [4, 4, 4, 4, 3, 3],
    [4, 4, 4, 4, 4, 3, 2],
    [4, 4, 4, 4, 4, 3, 3],
    [4, 4, 4, 4, 4, 4, 3, 2],
    [4, 4, 4, 4, 4, 4, 3, 3],
    [4, 4, 4, 4, 4, 4, 4, 3, 2],
    [4, 4, 4, 4, 4, 4, 4, 3, 3],
    [4, 4, 4, 4, 4, 4, 4, 4, 3, 1],
    [4, 4, 4, 4, 4, 4, 4, 4, 3, 1],
  ];
  const safe = Math.max(1, Math.min(20, Math.floor(level || 1)));
  return table[safe - 1];
}

/** Wizards gain one extra curriculum spell slot at each rank up to 9th. */
export function wizardSlots(level: number): number[] {
  return fullCasterSlots(level).map((count, index) => (index < 9 ? count + 1 : count));
}

/** Clerics add divine font slots of their highest regular rank (heal or harm only). */
export function divineFontInfo(
  level: number,
  className?: string
): { slots: number; rank: number } | null {
  if (className?.toLowerCase() !== "cleric") return null;
  return {
    slots: level >= 15 ? 6 : level >= 5 ? 5 : 4,
    rank: Math.min(9, Math.max(1, Math.ceil(level / 2))),
  };
}

export function clericSlots(level: number): number[] {
  const slots = fullCasterSlots(level);
  const font = divineFontInfo(level, "cleric")!;
  slots[font.rank - 1] += font.slots;
  return slots;
}

export function spellSlotsFor(
  level: number,
  progression: CasterProgression,
  className?: string
): number[] | null {
  if (progression === "full") {
    switch (className?.toLowerCase()) {
      case "animist":
        return animistSlots(level);
      case "cleric":
        return clericSlots(level);
      case "wizard":
        return wizardSlots(level);
      default:
        return fullCasterSlots(level);
    }
  }
  if (progression === "bounded") {
    const slots = boundedCasterSlots(level);
    // Psychic and necromancer capstones grant a single 10th-rank slot.
    if (level >= 19 && ["psychic", "necromancer"].includes(className?.toLowerCase() ?? "")) {
      slots.push(1);
    }
    return slots;
  }
  return null;
}

export function signed(value: number): string {
  return value >= 0 ? `+${value}` : `${value}`;
}

export function titleCase(value: string): string {
  return String(value || "")
    .replace(/[-_]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function traitLabel(value: string): string {
  const special: Record<string, string> = {
    "versatile-p": "Versatile P",
    "versatile-s": "Versatile S",
    "versatile-b": "Versatile B",
    "deadly-d10": "Deadly d10",
    "fatal-d12": "Fatal d12",
    "reload-0": "Reload 0",
    "two-hand-d10": "Two-Hand d10",
    "two-hand-d12": "Two-Hand d12",
    "thrown-20": "Thrown 20 ft.",
    "range-increment-60": "Range 60 ft.",
    nonlethal: "Nonlethal",
  };
  if (special[value]) return special[value];
  return titleCase(value);
}

export function parseClassFeatureUuidName(uuid: string): string {
  const body = String(uuid || "").replace(/^Compendium\.[^.]+\./, "");
  const itemIndex = body.indexOf(".Item.");
  if (itemIndex >= 0) return body.slice(itemIndex + 6);
  return body.split(".").pop() || body;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------
export function emptyCharacterDraft(name = "New Hero"): CharacterDraft {
  return {
    version: 1,
    name,
    level: 1,
    contentMode: "core",
    includeLegacy: false,
    ancestryId: null,
    heritageId: null,
    backgroundId: null,
    classId: null,
    deityId: null,
    deitySkill: null,
    backgroundFeat: null,
    keyAbility: null,
    portraitUrl: null,
    boosts: {
      ancestry: [],
      background: [],
      free: [null, null, null, null],
      levels: { "5": [], "10": [], "15": [], "20": [] },
    },
    skills: {
      trained: [],
      increases: {},
      lore: [],
      background: [],
      backgroundLore: [],
    },
    feats: {
      ancestry: {},
      class: {},
      skill: {},
      general: {},
      extras: [],
    },
    classChoices: {},
    spells: {
      tradition: null,
      cantrips: [],
      known: [],
      prepared: [],
      focus: [],
      divineFontUsed: 0,
      slotsUsed: {},
    },
    equipment: [],
    companions: [],
    currency: { gp: 0, sp: 0, cp: 0 },
    details: {
      age: "",
      gender: "",
      pronouns: "",
      height: "",
      weight: "",
      appearance: "",
      personality: "",
      beliefs: "",
      notes: "",
      languages: [],
    },
    play: {
      hp: null,
      tempHp: 0,
      heroPoints: 1,
      focusPoints: 1,
      conditions: [],
      xp: 0,
      shieldRaised: false,
    },
  };
}

export function normalizeCharacterDraft(input: unknown, fallbackName = "New Hero"): CharacterDraft {
  const base = emptyCharacterDraft(fallbackName);
  if (!input || typeof input !== "object") return base;
  const raw = input as Partial<CharacterDraft> & Record<string, unknown>;
  const num = (value: unknown, fallback: number) =>
    typeof value === "number" && Number.isFinite(value) ? value : fallback;
  const str = (value: unknown, fallback = "") => (typeof value === "string" ? value : fallback);
  const obj = (value: unknown) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const arr = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);
  const cleanAbilities = (value: unknown) =>
    arr<AbilityKey>(value).filter((x) => ABILITIES.includes(x));

  const boosts = obj(raw.boosts);
  const levelsRaw = obj(boosts.levels);
  const levels: Record<string, (AbilityKey | null)[]> = { "5": [], "10": [], "15": [], "20": [] };
  for (const key of Object.keys(levels)) {
    levels[key] = arr<AbilityKey | null>(levelsRaw[key]).map((x) =>
      x && ABILITIES.includes(x) ? x : null
    );
  }
  const skills = obj(raw.skills);
  const feats = obj(raw.feats);
  const spells = obj(raw.spells);
  const details = obj(raw.details);
  const play = obj(raw.play);
  const currency = obj(raw.currency);
  const increaseRaw = obj(skills.increases);
  const increases: Record<string, string> = {};
  for (const [key, value] of Object.entries(increaseRaw)) {
    if (typeof value === "string") increases[key] = value;
  }
  const featRecord = (value: unknown) => {
    const out: Record<string, string> = {};
    for (const [key, v] of Object.entries(obj(value))) if (typeof v === "string") out[key] = v;
    return out;
  };
  const choicesRaw = obj(raw.classChoices);
  const classChoices: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(choicesRaw))
    classChoices[key] = arr<string>(value).filter((x) => typeof x === "string");

  type NormalizedEquipment = {
    itemId: string;
    quantity: number;
    equipped: boolean;
    invested: boolean;
    runes: string[];
  };
  const equipmentMap = new Map<string, NormalizedEquipment>();
  for (const item of arr<Record<string, unknown>>(raw.equipment)) {
    if (!item || typeof item.itemId !== "string") continue;
    const itemId = String(item.itemId);
    const runes = [
      ...new Set(arr<string>(item.runes).filter((value) => typeof value === "string")),
    ].slice(0, 12);
    const existing = equipmentMap.get(itemId);
    if (existing) {
      existing.quantity += Math.max(1, Math.floor(num(item.quantity, 1)));
      existing.equipped = existing.equipped || Boolean(item.equipped);
      existing.invested = existing.invested || Boolean(item.invested);
      existing.runes = [...new Set([...existing.runes, ...runes])].slice(0, 12);
    } else {
      equipmentMap.set(itemId, {
        itemId,
        quantity: Math.max(1, Math.floor(num(item.quantity, 1))),
        equipped: Boolean(item.equipped),
        invested: Boolean(item.invested),
        runes,
      });
    }
  }
  const equipmentEntries = [...equipmentMap.values()];

  return {
    version: 1,
    name: str(raw.name, fallbackName).slice(0, 120) || fallbackName,
    level: Math.max(1, Math.min(20, Math.floor(num(raw.level, 1)))),
    contentMode: raw.contentMode === "expanded" ? "expanded" : "core",
    includeLegacy: raw.includeLegacy === true,
    ancestryId: typeof raw.ancestryId === "string" ? raw.ancestryId : null,
    heritageId: typeof raw.heritageId === "string" ? raw.heritageId : null,
    backgroundId: typeof raw.backgroundId === "string" ? raw.backgroundId : null,
    classId: typeof raw.classId === "string" ? raw.classId : null,
    deityId: typeof raw.deityId === "string" ? raw.deityId : null,
    deitySkill: typeof raw.deitySkill === "string" ? raw.deitySkill : null,
    backgroundFeat: typeof raw.backgroundFeat === "string" ? raw.backgroundFeat : null,
    keyAbility:
      raw.keyAbility && ABILITIES.includes(raw.keyAbility as AbilityKey)
        ? (raw.keyAbility as AbilityKey)
        : null,
    portraitUrl: typeof raw.portraitUrl === "string" ? raw.portraitUrl : null,
    boosts: {
      ancestry: cleanAbilities(boosts.ancestry),
      background: cleanAbilities(boosts.background),
      free: [0, 1, 2, 3].map((i) => {
        const value = arr<AbilityKey | null>(boosts.free)[i];
        return value && ABILITIES.includes(value) ? value : null;
      }),
      levels,
    },
    skills: {
      trained: arr<string>(skills.trained).filter((x) => typeof x === "string"),
      increases,
      lore: arr<string>(skills.lore).filter((x) => typeof x === "string"),
      background: arr<string>(skills.background).filter((x) => typeof x === "string"),
      backgroundLore: arr<string>(skills.backgroundLore).filter((x) => typeof x === "string"),
    },
    feats: {
      ancestry: featRecord(feats.ancestry),
      class: featRecord(feats.class),
      skill: featRecord(feats.skill),
      general: featRecord(feats.general),
      extras: arr<string>(feats.extras).filter((x) => typeof x === "string"),
    },
    classChoices,
    spells: {
      tradition: TRADITIONS.includes(spells.tradition as SpellTradition)
        ? (spells.tradition as SpellTradition)
        : null,
      cantrips: arr<string>(spells.cantrips).filter((x) => typeof x === "string"),
      known: arr<string>(spells.known).filter((x) => typeof x === "string"),
      prepared: arr<string>(spells.prepared).filter((x) => typeof x === "string"),
      focus: arr<string>(spells.focus).filter((x) => typeof x === "string"),
      divineFontUsed: Math.max(0, Math.min(10, Math.round(num(spells.divineFontUsed, 0)))),
      slotsUsed: Object.fromEntries(
        Object.entries(obj(spells.slotsUsed)).filter(([, value]) => typeof value === "number")
      ) as Record<string, number>,
    },
    equipment: equipmentEntries,
    companions: arr<Record<string, unknown>>(raw.companions)
      .filter((companion) => companion && typeof companion.name === "string")
      .map((companion) => {
        const kind = ["animal", "familiar", "eidolon", "summon"].includes(String(companion.kind))
          ? (companion.kind as "animal" | "familiar" | "eidolon" | "summon")
          : "animal";
        const hpMax =
          typeof companion.hpMax === "number" && Number.isFinite(companion.hpMax)
            ? Math.max(1, Math.floor(companion.hpMax))
            : null;
        const rawHpCurrent =
          typeof companion.hpCurrent === "number" && Number.isFinite(companion.hpCurrent)
            ? Math.max(0, Math.floor(companion.hpCurrent))
            : null;
        return {
          id:
            typeof companion.id === "string"
              ? companion.id
              : `comp_${Math.random().toString(16).slice(2, 10)}`,
          name: String(companion.name).slice(0, 80),
          kind,
          level: Math.max(1, Math.min(20, Math.floor(num(companion.level, 1)))),
          hpCurrent:
            hpMax !== null && rawHpCurrent !== null ? Math.min(rawHpCurrent, hpMax) : rawHpCurrent,
          hpMax,
          ac:
            typeof companion.ac === "number" && Number.isFinite(companion.ac)
              ? Math.max(0, Math.floor(companion.ac))
              : null,
          monsterId: typeof companion.monsterId === "string" ? companion.monsterId : null,
          notes: str(companion.notes).slice(0, 4000),
        };
      }),
    currency: {
      gp: Math.max(0, num(currency.gp, 0)),
      sp: Math.max(0, num(currency.sp, 0)),
      cp: Math.max(0, num(currency.cp, 0)),
    },
    details: {
      age: str(details.age),
      gender: str(details.gender),
      pronouns: str(details.pronouns),
      height: str(details.height),
      weight: str(details.weight),
      appearance: str(details.appearance),
      personality: str(details.personality),
      beliefs: str(details.beliefs),
      notes: str(details.notes),
      languages: arr<string>(details.languages).filter((x) => typeof x === "string"),
    },
    play: {
      hp: typeof play.hp === "number" && Number.isFinite(play.hp) ? play.hp : null,
      tempHp: Math.max(0, num(play.tempHp, 0)),
      heroPoints: Math.max(0, Math.min(3, Math.floor(num(play.heroPoints, 1)))),
      focusPoints: Math.max(0, Math.min(3, Math.floor(num(play.focusPoints, 1)))),
      conditions: arr<Record<string, unknown>>(play.conditions)
        .filter((c) => c && typeof c.name === "string")
        .map((c) => ({
          name: String(c.name),
          value: typeof c.value === "number" ? c.value : null,
          duration: typeof c.duration === "number" ? c.duration : null,
        })),
      xp: Math.max(0, num(play.xp, 0)),
      shieldRaised: Boolean(play.shieldRaised),
    },
  };
}

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------
export function flexibleBoosts(ancestry: Ancestry | null | undefined) {
  return (ancestry?.boosts ?? []).filter((entry) => !entry.fixed);
}

export function fixedBoosts(ancestry: Ancestry | null | undefined) {
  return (ancestry?.boosts ?? []).filter((entry) => entry.fixed);
}

export function selectedChoiceOptions(
  draft: CharacterDraft,
  classData: ClassData | null | undefined
): ClassChoiceOption[] {
  if (!classData) return [];
  const out: ClassChoiceOption[] = [];
  for (const group of classData.choiceGroups) {
    if ((group.sourceFeature?.level ?? 0) > draft.level) continue;
    for (const id of draft.classChoices[group.key] ?? []) {
      const option = group.options.find((o) => o.id === id);
      if (option) out.push(option);
    }
  }
  return out;
}

export function choiceOptionsById(
  classData: ClassData | null | undefined
): Map<string, ClassChoiceOption> {
  const map = new Map<string, ClassChoiceOption>();
  if (!classData) return map;
  for (const group of classData.choiceGroups) {
    for (const option of group.options) map.set(option.id, option);
  }
  return map;
}

export function applicableChoiceGroups(
  draft: CharacterDraft,
  classData: ClassData | null | undefined
): ClassChoiceGroup[] {
  if (!classData) return [];
  return classData.choiceGroups.filter((group) => (group.sourceFeature?.level ?? 0) <= draft.level);
}

export function deitySkillOptions(deity: Deity | null | undefined): SkillId[] {
  return (deity?.skill ?? []).filter((skill): skill is SkillId =>
    Boolean(SKILL_BY_ID[skill as SkillId])
  );
}

export function selectedDeitySkill(
  draft: CharacterDraft,
  deity: Deity | null | undefined
): SkillId | null {
  const options = deitySkillOptions(deity);
  if (draft.deitySkill && options.includes(draft.deitySkill as SkillId)) {
    return draft.deitySkill as SkillId;
  }
  return options.length === 1 ? options[0] : null;
}

/** Automatic skill-rank upgrades from active class features and chosen options. */
export function automaticSkillRanks(
  draft: CharacterDraft,
  context: CharacterContext
): Record<string, number> {
  const out: Record<string, number> = {};
  const add = (feature: { skillRanks?: Record<string, number> | null } | null | undefined) => {
    for (const [skill, rank] of Object.entries(feature?.skillRanks ?? {})) {
      out[skill] = Math.max(out[skill] ?? 0, Math.min(4, Number(rank) || 0));
    }
  };
  for (const feature of context.classData?.features ?? []) {
    if (feature.level <= draft.level) add(feature);
  }
  for (const option of selectedChoiceOptions(draft, context.classData)) {
    add(option);
    for (const feature of option.grantedFeatures ?? []) {
      if (feature.level <= draft.level) add(feature);
    }
  }
  return out;
}

/** All training that is fixed by the character's ancestry, background, class, subclass, and deity. */
export function grantedTrainedSkills(
  draft: CharacterDraft,
  context: CharacterContext
): Set<string> {
  const out = new Set<string>();
  for (const skill of context.background?.trainedSkills ?? []) out.add(skill);
  for (const skill of context.classData?.trainedSkills.value ?? []) out.add(skill);

  for (const option of selectedChoiceOptions(draft, context.classData)) {
    for (const skill of option.trainedSkills ?? []) out.add(skill);
  }

  for (const skill of Object.keys(automaticSkillRanks(draft, context))) out.add(skill);

  for (const group of context.background?.skillChoices ?? []) {
    for (const skill of draft.skills.background) {
      if (group.options.includes(skill)) out.add(skill);
    }
  }

  const deitySkill = selectedDeitySkill(draft, context.deity);
  if (deitySkill) out.add(deitySkill);
  return out;
}

export function classKeyOptions(
  draft: CharacterDraft,
  classData: ClassData | null | undefined
): AbilityKey[] {
  if (!classData) return [];
  const options = selectedChoiceOptions(draft, classData);
  const fromChoices = [...new Set(options.flatMap((option) => option.keyOptions ?? []))];
  if (fromChoices.length) return fromChoices;
  return [...new Set(classData.keyAbility)];
}

export function requiredExtraSkills(draft: CharacterDraft, context: CharacterContext): number {
  const classData = context.classData;
  if (!classData) return 0;
  const baseMod = abilityMod(baseAbilityScores(draft, context).int);
  return Math.max(0, classData.trainedSkills.additional + Math.max(0, baseMod));
}

export function featSlotsFor(classData: ClassData | null | undefined, level: number) {
  const out: {
    category: "ancestry" | "class" | "skill" | "general";
    level: number;
  }[] = [];
  if (!classData) return out;
  for (const category of ["ancestry", "class", "skill", "general"] as const) {
    for (const slotLevel of classData.featLevels[category]) {
      if (slotLevel <= level) out.push({ category, level: slotLevel });
    }
  }
  return out.sort((a, b) => a.level - b.level || a.category.localeCompare(b.category));
}

// ---------------------------------------------------------------------------
// Feat prerequisites
// ---------------------------------------------------------------------------
export type PrerequisiteStatus = "met" | "unmet" | "unknown";

export interface PrerequisiteCheck {
  text: string;
  status: PrerequisiteStatus;
}

const PREREQUISITE_RANKS: Record<string, number> = {
  trained: 1,
  expert: 2,
  master: 3,
  legendary: 4,
};

const ABILITY_BY_LABEL: Record<string, AbilityKey> = {
  strength: "str",
  dexterity: "dex",
  constitution: "con",
  intelligence: "int",
  wisdom: "wis",
  charisma: "cha",
};

function lowerName(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function combineStatuses(statuses: PrerequisiteStatus[], mode: "and" | "or"): PrerequisiteStatus {
  if (!statuses.length) return "met";
  if (mode === "or") {
    if (statuses.includes("met")) return "met";
    if (statuses.every((status) => status === "unmet")) return "unmet";
    return "unknown";
  }
  if (statuses.includes("unmet")) return "unmet";
  if (statuses.every((status) => status === "met")) return "met";
  return "unknown";
}

function proficiencyRankForTarget(
  target: string,
  derived: DerivedCharacter,
  context: CharacterContext
): number | null {
  const value = lowerName(target).replace(/[.!]$/g, "");
  if (!value) return null;

  if (value === "perception") return derived.prof.perception;
  if (/^(fortitude|reflex|will)( saves?)?$/.test(value)) {
    return derived.prof[value.split(" ")[0] as SaveKey];
  }
  if (/^(all )?saves?$/.test(value)) {
    return Math.min(derived.prof.fortitude, derived.prof.reflex, derived.prof.will);
  }
  if (value === "class dc") return derived.prof.classDc;
  if (/^spell (attack( rolls?| modifier)?|dcs?)$/.test(value) || value === "spellcasting") {
    return derived.prof.spellcasting;
  }

  if (value === "unarmored defense" || value === "unarmored")
    return derived.prof.defenses.unarmored;
  if (value === "light armor" || value === "light") return derived.prof.defenses.light;
  if (value === "medium armor" || value === "medium") return derived.prof.defenses.medium;
  if (value === "heavy armor" || value === "heavy") return derived.prof.defenses.heavy;
  if (value === "all armor") {
    return Math.min(
      derived.prof.defenses.light,
      derived.prof.defenses.medium,
      derived.prof.defenses.heavy
    );
  }

  if (
    value === "simple weapons" ||
    value === "simple weapons and unarmed attacks" ||
    value === "all simple weapons"
  ) {
    return Math.max(derived.prof.attacks.simple, derived.prof.attacks.unarmed);
  }
  if (value === "all weapons") {
    return Math.max(
      derived.prof.attacks.simple,
      derived.prof.attacks.martial,
      derived.prof.attacks.advanced,
      derived.prof.attacks.unarmed
    );
  }
  if (value === "martial weapons") return derived.prof.attacks.martial;
  if (value === "advanced weapons") return derived.prof.attacks.advanced;
  if (value === "unarmed attacks" || value === "unarmed attack")
    return derived.prof.attacks.unarmed;
  if (value === "all martial weapons" || value === "martial weapons and unarmed attacks") {
    return Math.max(derived.prof.attacks.martial, derived.prof.attacks.unarmed);
  }
  if (
    value === "any kind of weapon or unarmed attack" ||
    value === "a weapon" ||
    value === "weapon"
  ) {
    return Math.max(
      derived.prof.attacks.simple,
      derived.prof.attacks.martial,
      derived.prof.attacks.advanced,
      derived.prof.attacks.unarmed
    );
  }
  if (value === "a simple weapon") return derived.prof.attacks.simple;
  if (value === "a martial weapon") return derived.prof.attacks.martial;
  if (value === "an advanced weapon") return derived.prof.attacks.advanced;
  if (value === "an unarmed attack") return derived.prof.attacks.unarmed;
  if (value === "a deity's favored weapon" || value === "your deity's favored weapon") {
    return derived.prof.attacks.favoredWeapon ?? 0;
  }
  if (value === "alchemical bombs" || value === "an alchemical bomb") {
    return derived.prof.attacks["weapon-base-alchemical-bomb"] ?? 0;
  }
  if (value.includes("firearm") || value.includes("crossbow")) {
    const other = context.classData?.attacks.other;
    if (other && typeof other === "object" && /firearm|crossbow/i.test(String(other.name ?? ""))) {
      return Number(other.rank ?? 0);
    }
    return derived.prof.attacks.martial;
  }

  if (value === "a skill" || value === "any skill") {
    return Math.max(...derived.skills.map((skill) => skill.rank));
  }
  if (value === "a lore skill" || value === "a specific lore skill" || value === "lore") {
    return derived.lore.length ? Math.max(...derived.lore.map((entry) => entry.rank)) : 0;
  }
  const abilitySkill = /^(?:a|an) (\w+) skill$/.exec(value);
  if (abilitySkill) {
    const ability = ABILITY_BY_LABEL[abilitySkill[1]];
    if (!ability) return null;
    const ranks = derived.skills
      .filter((skill) => skill.ability === ability)
      .map((skill) => skill.rank);
    return ranks.length ? Math.max(...ranks) : 0;
  }
  const loreTarget = value.replace(/ lore$/, "");
  const lore = derived.lore.find((entry) => {
    const loreName = lowerName(entry.name).replace(/ lore$/, "");
    return loreName === loreTarget || lowerName(entry.name) === value;
  });
  if (lore) return lore.rank;
  const skill = SKILLS.find((entry) => entry.id === value || lowerName(entry.name) === value);
  if (skill) return derived.skills.find((entry) => entry.id === skill.id)?.rank ?? 0;

  return null;
}

function proficiencyPrerequisite(
  text: string,
  derived: DerivedCharacter,
  context: CharacterContext
): PrerequisiteStatus | null {
  const match = /^(trained|expert|master|legendary) in (.+)$/i.exec(text.trim());
  if (!match) return null;
  const required = PREREQUISITE_RANKS[match[1].toLowerCase()];
  const targetText = match[2].trim();
  const andMode = /\s+and\s+/i.test(targetText) && !/\bor\b/i.test(targetText);
  const targets = targetText
    .split(andMode ? /\s+and\s+/i : /\s*,\s*|\s+or\s+/i)
    .map((target) => target.trim())
    .filter(Boolean);
  const statuses = targets.map((target) => {
    const rank = proficiencyRankForTarget(target, derived, context);
    if (rank === null) return "unknown" as const;
    return rank >= required ? ("met" as const) : ("unmet" as const);
  });
  return combineStatuses(statuses, andMode ? "and" : "or");
}

function abilityPrerequisite(text: string, derived: DerivedCharacter): PrerequisiteStatus | null {
  const match = /^(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\s*\+(\d+)$/i.exec(
    text.trim()
  );
  if (!match) return null;
  const ability = ABILITY_BY_LABEL[match[1].toLowerCase()];
  const required = Number(match[2]);
  return derived.abilityMods[ability] >= required ? "met" : "unmet";
}

function currentTraits(
  draft: CharacterDraft,
  context: CharacterContext,
  derived: DerivedCharacter
): Set<string> {
  const traits = new Set<string>();
  const add = (values: string[] | undefined) => {
    for (const value of values ?? []) traits.add(lowerName(value));
  };
  add(context.ancestry?.traits);
  add(context.heritage?.traits);
  add(context.deity?.traits);
  add(context.classData?.traits);
  for (const option of selectedChoiceOptions(draft, context.classData)) add(option.traits);
  for (const feat of derived.selectedFeats) add(feat.traits);
  for (const feature of derived.features) add(feature.traits);
  return traits;
}

function namedPrerequisite(
  text: string,
  draft: CharacterDraft,
  context: CharacterContext,
  derived: DerivedCharacter
): PrerequisiteStatus {
  const name = lowerName(text);
  const selectedFeatNames = new Set(derived.selectedFeats.map((feat) => lowerName(feat.name)));
  const grantedFeatNames = new Set(derived.grantedFeats.map((feat) => lowerName(feat.name)));
  const featureNames = new Set(derived.features.map((feature) => lowerName(feature.name)));
  const selectedOptions = selectedChoiceOptions(draft, context.classData);
  const selectedOptionNames = new Set(selectedOptions.map((option) => lowerName(option.name)));

  if (
    selectedFeatNames.has(name) ||
    grantedFeatNames.has(name) ||
    featureNames.has(name) ||
    selectedOptionNames.has(name)
  ) {
    return "met";
  }
  if (context.featNames?.includes(name)) return "unmet";

  const classFeature = context.classData?.features.find(
    (feature) => lowerName(feature.name) === name
  );
  if (classFeature) return classFeature.level <= draft.level ? "met" : "unmet";
  const classOption = context.classData?.choiceGroups
    .flatMap((group) => group.options)
    .find((option) => lowerName(option.name) === name);
  if (classOption) return "unmet";
  if (name.endsWith(" dedication")) return "unmet";

  if (name.endsWith(" heritage")) {
    const heritage = name.slice(0, -" heritage".length).trim();
    return lowerName(context.heritage?.name ?? "") === heritage ? "met" : "unmet";
  }
  if (context.ancestry && lowerName(context.ancestry.name) === name) return "met";
  if (context.heritage && lowerName(context.heritage.name) === name) return "met";
  if (context.deity && lowerName(context.deity.name) === name) return "met";

  const spellNames = new Set(Object.values(context.spells).map((spell) => lowerName(spell.name)));
  if (spellNames.has(name)) return "met";

  if (name === "champion's aura" || name === "champion's reaction") {
    return context.classData?.name.toLowerCase() === "champion" ? "met" : "unknown";
  }
  if (name === "lay on hands") {
    return context.classData?.name.toLowerCase() === "champion" || spellNames.has("lay on hands")
      ? "met"
      : "unknown";
  }
  if (name === "bloodline spell") {
    return context.classData?.name.toLowerCase() === "sorcerer" ? "met" : "unknown";
  }
  if (name === "hex" || name === "hexes") {
    return context.classData?.name.toLowerCase() === "witch" ? "met" : "unknown";
  }
  if (name === "initial revelation spell") {
    return context.classData?.name.toLowerCase() === "oracle" ? "met" : "unknown";
  }
  if (name === "warden spells") {
    return context.classData?.name.toLowerCase() === "ranger" ? "met" : "unknown";
  }

  return "unknown";
}

export function checkFeatPrerequisite(
  raw: string,
  draft: CharacterDraft,
  context: CharacterContext,
  derived: DerivedCharacter
): PrerequisiteStatus {
  const text = raw.trim().replace(/[.]$/g, "");
  const lower = lowerName(text);
  if (!lower) return "unknown";

  if (/^(you have( a| the)? )?focus pool$/.test(lower)) {
    return derived.focusPointsMax > 0 ? "met" : "unmet";
  }
  if (/^(you have( a| the)? )?spellcasting class feature$/.test(lower)) {
    return derived.casterProgression !== "none" || derived.prof.spellcasting > 0 ? "met" : "unmet";
  }
  if (/^(you have( a| the)? )?versatile heritage$/.test(lower)) {
    return context.heritage?.versatile ? "met" : "unmet";
  }
  if (lower === "ability to cast spells from spell slots") {
    return (derived.spellSlots?.length ?? 0) > 0 ? "met" : "unmet";
  }
  if (lower === "ability to cast focus spells") return derived.focusPointsMax > 0 ? "met" : "unmet";
  if (
    /^(?:you have(?: the)? ability to cast|you're able to cast|you can cast|ability to cast|able to cast) (?:a )?spells?(?: (?:from|using) (?:spell )?slots?)?$/.test(
      lower
    )
  ) {
    return derived.casterProgression !== "none" ? "met" : "unmet";
  }
  if (/^(arcane|divine|occult|primal) spells$/.test(lower)) {
    return derived.casterTradition === lower.split(" ")[0] ? "met" : "unmet";
  }
  const traditionCast =
    /^(?:ability to cast|able to cast|you can cast) (arcane|divine|occult|primal) spells$/i.exec(
      text
    );
  if (traditionCast) {
    return derived.casterTradition === traditionCast[1].toLowerCase() ? "met" : "unmet";
  }
  const specificSpell = /^(?:ability to cast|able to cast|you can cast) (.+)$/i.exec(text);
  if (specificSpell) {
    const target = lowerName(specificSpell[1])
      .replace(/\s+(?:cantrip|spell)$/, "")
      .replace(/\s+(?:with|using) a spell slot$/, "")
      .replace(/^the /, "");
    if (!target || /\b(at least|or higher|spell slot|ritual|trait|any|one of)\b/.test(target)) {
      return "unknown";
    }
    const spellNames = new Set(Object.values(context.spells).map((spell) => lowerName(spell.name)));
    const alternatives = target
      .split(/\s+or\s+/i)
      .map((part) => part.trim())
      .filter(Boolean);
    if (alternatives.some((name) => spellNames.has(name))) return "met";
    if (alternatives.length > 1) return "unmet";
    const required = target
      .split(/\s+and\s+/i)
      .map((part) => part.trim())
      .filter(Boolean);
    return required.every((name) => spellNames.has(name)) ? "met" : "unmet";
  }
  if (lower === "low-light vision") {
    return derived.senses.some((sense) => /lowlight|low-light|darkvision/i.test(sense))
      ? "met"
      : "unmet";
  }
  if (lower === "darkvision") {
    return derived.senses.some((sense) => /darkvision/i.test(sense)) ? "met" : "unmet";
  }
  if (lower === "you follow a deity" || lower === "follower of a specific religion") {
    return context.deity ? "met" : "unmet";
  }
  if (
    /^(worshipper|worship|follow|follower) of (.+)$/i.test(text) ||
    /^(worship|follow) (.+)$/i.test(text)
  ) {
    const match = /(?:of|worship|follow)\s+(.+)$/i.exec(text);
    if (match) {
      return context.deity && lowerName(context.deity.name) === lowerName(match[1])
        ? "met"
        : "unknown";
    }
  }
  if (/^at least (\d+) years old$/i.test(text)) {
    const required = Number(/^at least (\d+) years old$/i.exec(text)![1]);
    const age = Number(draft.details.age);
    if (!Number.isFinite(age) || !draft.details.age.trim()) return "unknown";
    return age >= required ? "met" : "unmet";
  }
  if (lower === "exactly one kinetic element") {
    const gates = draft.classChoices ?? {};
    const count = Object.entries(gates)
      .filter(([key]) => key.includes("kinetic-gate"))
      .flatMap(([, values]) => values)
      .filter((value, index, values) => values.indexOf(value) === index).length;
    return count === 1 ? "met" : "unmet";
  }
  if (
    lower.includes("member of") ||
    lower.includes("affiliation") ||
    lower.startsWith("access to") ||
    lower.includes("hero-god accomplishment") ||
    lower.includes("passed the") ||
    lower === "holy" ||
    lower === "unholy" ||
    lower === "you aren't unholy" ||
    lower === "you are not holy" ||
    lower.includes("swim speed") ||
    lower.includes("fly speed") ||
    lower.includes("animal companion") ||
    lower.includes("familiar") ||
    lower.includes("construct companion")
  ) {
    return "unknown";
  }

  const proficiency = proficiencyPrerequisite(text, derived, context);
  if (proficiency) return proficiency;
  if (/^master proficiency in a weapon$/i.test(text)) {
    const rank = Math.max(
      derived.prof.attacks.simple,
      derived.prof.attacks.martial,
      derived.prof.attacks.advanced,
      derived.prof.attacks.unarmed
    );
    return rank >= 3 ? "met" : "unmet";
  }
  const ability = abilityPrerequisite(text, derived);
  if (ability) return ability;

  // Trait lists such as "ardande trait, plant trait, or wood trait".
  if (/\btrait\b/i.test(text) && !/\btraits?\b/i.test(text.replace(/\btrait\b/gi, ""))) {
    const traits = currentTraits(draft, context, derived);
    const names = text
      .split(/\s*,\s*|\s+or\s+/i)
      .map((part) => lowerName(part).replace(/\s+trait$/, ""))
      .filter(Boolean);
    if (names.some((name) => traits.has(name))) return "met";
    return "unknown";
  }

  // Compound OR/AND conditions. Proficiency and ability checks handled their
  // own lists above.
  if (/\s+or\s+/i.test(text)) {
    const parts = text
      .split(/\s+or\s+/i)
      .map((part) => part.trim())
      .filter(Boolean);
    return combineStatuses(
      parts.map((part) => checkFeatPrerequisite(part, draft, context, derived)),
      "or"
    );
  }
  if (/\s+and\s+/i.test(text)) {
    const parts = text
      .split(/\s+and\s+/i)
      .map((part) => part.trim())
      .filter(Boolean);
    return combineStatuses(
      parts.map((part) => checkFeatPrerequisite(part, draft, context, derived)),
      "and"
    );
  }

  return namedPrerequisite(text, draft, context, derived);
}

export function featPrerequisiteChecks(
  feat: Feat,
  draft: CharacterDraft,
  context: CharacterContext,
  derived: DerivedCharacter
): PrerequisiteCheck[] {
  return (feat.prerequisites ?? []).map((text) => ({
    text,
    status: checkFeatPrerequisite(text, draft, context, derived),
  }));
}

export function featPrerequisiteStatus(
  feat: Feat,
  draft: CharacterDraft,
  context: CharacterContext,
  derived: DerivedCharacter
): { status: PrerequisiteStatus; checks: PrerequisiteCheck[] } {
  const checks = featPrerequisiteChecks(feat, draft, context, derived);
  return {
    status: combineStatuses(
      checks.map((check) => check.status),
      "and"
    ),
    checks,
  };
}

export type FeatAvailability = "available" | "blocked" | "verify";

/**
 * Whether a feat may appear as a future choice. Definitively unmet
 * prerequisites block it; prerequisites that need table verification remain
 * visible with a warning.
 */
export function featAvailability(
  feat: Feat,
  draft: CharacterDraft,
  context: CharacterContext,
  derived: DerivedCharacter
): FeatAvailability {
  const { status } = featPrerequisiteStatus(feat, draft, context, derived);
  if (status === "unmet") return "blocked";
  if (status === "unknown") return "verify";
  return "available";
}

/**
 * Repertoire limits for spontaneous casters. A spontaneous caster learns one
 * spell each time they gain a spell slot, so the cumulative slots gained at a
 * rank are also the number of spells known at that rank.
 */
export function spellRepertoireLimits(
  classData: ClassData | null | undefined,
  level: number
): { cantrips: number; ranks: number[] } | null {
  const name = classData?.name.toLowerCase();
  if (!name || !["bard", "oracle", "sorcerer", "summoner"].includes(name)) return null;
  const bounded = name === "summoner";
  const ranks: number[] = [];
  let previous: number[] = [];
  for (let current = 1; current <= level; current++) {
    const slots = bounded ? boundedCasterSlots(current) : fullCasterSlots(current);
    for (let index = 0; index < slots.length; index++) {
      const count = slots[index] ?? 0;
      const before = previous[index] ?? 0;
      if (count > before) ranks[index] = (ranks[index] ?? 0) + (count - before);
    }
    previous = slots;
  }
  return { cantrips: 5, ranks };
}

// ---------------------------------------------------------------------------
// Ability scores
// ---------------------------------------------------------------------------
export interface BoostApplication {
  source: string;
  ability: AbilityKey;
  amount: number;
}

export function baseAbilityScores(
  draft: CharacterDraft,
  context: CharacterContext,
  capAt18 = true
): Record<AbilityKey, number> {
  const scores = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
  const add = (ability: AbilityKey, amount: number) => {
    if (ABILITIES.includes(ability)) scores[ability] += amount;
  };

  const ancestry = context.ancestry;
  if (ancestry) {
    const flex = flexibleBoosts(ancestry);
    for (const entry of ancestry.boosts) {
      if (entry.fixed) for (const ability of entry.from) add(ability, 2);
    }
    flex.forEach((entry, index) => {
      const pick = draft.boosts.ancestry[index];
      if (pick && entry.from.includes(pick)) add(pick, 2);
    });
    for (const flaw of ancestry.flaws) add(flaw, -2);
  }

  const background = context.background;
  if (background) {
    const flex = background.boosts.filter((entry) => !entry.fixed);
    for (const entry of background.boosts) {
      if (entry.fixed) for (const ability of entry.from) add(ability, 2);
    }
    flex.forEach((entry, index) => {
      const pick = draft.boosts.background[index];
      if (pick && entry.from.includes(pick)) add(pick, 2);
    });
  }

  const classData = context.classData;
  if (classData) {
    const options = classKeyOptions(draft, classData);
    const key =
      draft.keyAbility && options.includes(draft.keyAbility)
        ? draft.keyAbility
        : options.length === 1
          ? options[0]
          : null;
    if (key) add(key, 2);
  }

  for (const pick of draft.boosts.free) {
    if (pick) add(pick, 2);
  }

  // No ability score can exceed 18 during 1st-level creation. The cap is
  // applied before milestone boosts even when viewing a higher-level draft,
  // because those milestones build on the 1st-level character.
  if (capAt18) {
    for (const ability of ABILITIES) scores[ability] = Math.min(18, scores[ability]);
  }

  // At 5th level and every 5 levels thereafter, a boost adds +2 normally, but
  // only +1 while the score is already 18 or higher. Two such partial boosts
  // are needed to raise an ability modifier from +4 to +5.
  for (const milestone of [5, 10, 15, 20]) {
    if (draft.level < milestone) continue;
    for (const pick of draft.boosts.levels[String(milestone)] ?? []) {
      if (!pick) continue;
      scores[pick] += scores[pick] >= 18 ? 1 : 2;
    }
  }

  return scores;
}

// ---------------------------------------------------------------------------
// Proficiencies
// ---------------------------------------------------------------------------
function applyProficiencyMap(
  prof: DerivedCharacter["prof"],
  map: Record<string, { rank?: number; attribute?: AbilityKey | null }> | null | undefined,
  className: string
) {
  if (!map) return;
  const classSlug = className.toLowerCase();
  for (const [key, value] of Object.entries(map)) {
    const rank = Math.max(0, Math.min(4, Number(value?.rank ?? 0)));
    if (!rank) continue;
    if (key === "perception") prof.perception = Math.max(prof.perception, rank);
    else if (key === "fortitude") prof.fortitude = Math.max(prof.fortitude, rank);
    else if (key === "reflex") prof.reflex = Math.max(prof.reflex, rank);
    else if (key === "will") prof.will = Math.max(prof.will, rank);
    else if (key in prof.defenses) prof.defenses[key] = Math.max(prof.defenses[key] ?? 0, rank);
    else if (key in prof.attacks) prof.attacks[key] = Math.max(prof.attacks[key] ?? 0, rank);
    else if (key.startsWith("weapon-base-") || key.endsWith("-firearms-crossbows")) {
      prof.attacks[key] = Math.max(prof.attacks[key] ?? 0, rank);
    } else if (key === "spellcasting") prof.spellcasting = Math.max(prof.spellcasting, rank);
    else if (key === classSlug) prof.classDc = Math.max(prof.classDc, rank);
    else if (key === "classDC" || key === "classDc") prof.classDc = Math.max(prof.classDc, rank);
  }
}

function buildProficiencies(
  draft: CharacterDraft,
  context: CharacterContext
): DerivedCharacter["prof"] {
  const classData = context.classData;
  const className = classData?.name ?? "";
  const caster = casterInfo(classData);
  const prof: DerivedCharacter["prof"] = {
    perception: Number(classData?.perception ?? 0),
    fortitude: Number(classData?.savingThrows?.fortitude ?? 0),
    reflex: Number(classData?.savingThrows?.reflex ?? 0),
    will: Number(classData?.savingThrows?.will ?? 0),
    attacks: {
      unarmed: Number(classData?.attacks?.unarmed ?? 0),
      simple: Number(classData?.attacks?.simple ?? 0),
      martial: Number(classData?.attacks?.martial ?? 0),
      advanced: Number(classData?.attacks?.advanced ?? 0),
      favoredWeapon: 0,
    },
    defenses: {
      unarmored: Number(classData?.defenses?.unarmored ?? 0),
      light: Number(classData?.defenses?.light ?? 0),
      medium: Number(classData?.defenses?.medium ?? 0),
      heavy: Number(classData?.defenses?.heavy ?? 0),
    },
    spellcasting: caster.progression !== "none" ? 1 : 0,
    classDc: classData ? 1 : 0,
  };

  if (!classData) return prof;
  const chosen = selectedChoiceOptions(draft, classData);
  const suppressed = new Set(
    chosen.flatMap((option) => (option.suppressedFeatures ?? []).map(parseClassFeatureUuidName))
  );

  for (const feature of classData.features) {
    if (feature.level > draft.level) continue;
    if (suppressed.has(feature.name)) continue;
    applyProficiencyMap(prof, feature.proficiencies, className);
  }
  for (const option of chosen) {
    applyProficiencyMap(prof, option.proficiencies, className);
    for (const feature of option.grantedFeatures ?? []) {
      if (feature.level > draft.level) continue;
      if (suppressed.has(feature.name)) continue;
      applyProficiencyMap(prof, feature.proficiencies, className);
    }
  }

  // Clerics and champions are trained in their deity's favored weapon. The
  // base rank comes from the class (or the Deity feature), and doctrine
  // features can upgrade it.
  const hasDeityFeature = classData.features.some((feature) =>
    feature.name.toLowerCase().startsWith("deity (")
  );
  const other = classData.attacks.other;
  const otherRank =
    other && typeof other === "object" && typeof other.rank === "number" ? other.rank : 0;
  let favoredWeaponRank = hasDeityFeature || caster.requiresDeity ? 1 : 0;
  if (
    other &&
    typeof other === "object" &&
    String(other.name ?? "")
      .toLowerCase()
      .includes("deity")
  ) {
    favoredWeaponRank = Math.max(favoredWeaponRank, otherRank);
  }
  for (const feature of classData.features) {
    if (feature.level > draft.level) continue;
    if (suppressed.has(feature.name)) continue;
    favoredWeaponRank = Math.max(favoredWeaponRank, Number(feature.favoredWeaponRank ?? 0));
  }
  for (const option of chosen) {
    for (const feature of option.grantedFeatures ?? []) {
      if (feature.level > draft.level) continue;
      if (suppressed.has(feature.name)) continue;
      favoredWeaponRank = Math.max(favoredWeaponRank, Number(feature.favoredWeaponRank ?? 0));
    }
  }
  prof.attacks.favoredWeapon = favoredWeaponRank;
  return prof;
}

function matchesDeityWeapon(item: Equipment, deity: Deity | null | undefined): boolean {
  if (!deity?.weapons?.length) return false;
  const clean = (value: string) =>
    value
      .toLowerCase()
      .replace(/\s*\([^)]*\)\s*/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const itemName = clean(item.name);
  return deity.weapons.some((weapon) => clean(weapon) === itemName);
}

function isFirearm(item: Equipment): boolean {
  return item.weapon?.group === "firearm" || item.traits.includes("firearm");
}

function isBomb(item: Equipment): boolean {
  return item.weapon?.group === "bomb" || item.traits.includes("bomb");
}

function attackRankFor(
  item: Equipment,
  prof: DerivedCharacter["prof"],
  classData: ClassData | null | undefined,
  deity: Deity | null | undefined
): number {
  if (!item.weapon) return 0;
  let rank = prof.attacks[item.weapon.category || "simple"] ?? 0;
  const weaponSlug = item.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  rank = Math.max(rank, prof.attacks[`weapon-base-${weaponSlug}`] ?? 0);
  if (isBomb(item)) rank = Math.max(rank, prof.attacks["weapon-base-alchemical-bomb"] ?? 0);
  if (matchesDeityWeapon(item, deity)) {
    rank = Math.max(rank, prof.attacks.favoredWeapon ?? 0);
  }
  const other = classData?.attacks.other;
  if (other && typeof other === "object") {
    const label = String(other.name ?? "").toLowerCase();
    const special = Number(other.rank ?? 0);
    if (label.includes("firearm") && isFirearm(item)) rank = Math.max(rank, special);
    if (label.includes("bomb") && isBomb(item)) rank = Math.max(rank, special);
  }
  return rank;
}

function weaponSpecializationBonus(features: { name: string }[], rank: number): number {
  const greater = features.some((feature) =>
    /^greater weapon specialization\b/i.test(feature.name)
  );
  const base = features.some(
    (feature) =>
      /weapon specialization/i.test(feature.name) &&
      !/^greater/i.test(feature.name) &&
      !/eidolon/i.test(feature.name)
  );
  if (!base && !greater) return 0;
  const values = greater ? [0, 0, 4, 6, 8] : [0, 0, 2, 3, 4];
  return values[rank] ?? 0;
}

// ---------------------------------------------------------------------------
// Character computation
// ---------------------------------------------------------------------------
export function computeCharacter(
  draft: CharacterDraft,
  context: CharacterContext
): DerivedCharacter {
  const ancestry = context.ancestry ?? null;
  const classData = context.classData ?? null;
  const background = context.background ?? null;
  const abilities = baseAbilityScores(draft, context);
  // Validate the 1st-level allocation independently of later milestones.
  const rawAbilities = baseAbilityScores({ ...draft, level: 1 }, context, false);
  const abilityMods = Object.fromEntries(
    ABILITIES.map((ability) => [ability, abilityMod(abilities[ability])])
  ) as Record<AbilityKey, number>;
  const prof = buildProficiencies(draft, context);
  const featMods = collectFeatEffects(Object.keys(context.feats));
  const caster = casterInfo(classData);
  const keyOptions = classKeyOptions(draft, classData);
  const key =
    draft.keyAbility && keyOptions.includes(draft.keyAbility)
      ? draft.keyAbility
      : keyOptions.length === 1
        ? keyOptions[0]
        : null;
  const keyMod = key ? abilityMods[key] : 0;
  const needsDeity =
    caster.requiresDeity ||
    Boolean(
      classData?.features.some((feature) => feature.name.toLowerCase().startsWith("deity ("))
    );
  const spellAbility = caster.spellAbility ?? key;
  const spellMod = spellAbility ? abilityMods[spellAbility] : 0;
  const validation: ValidationIssue[] = [];
  const issue = (severity: Severity, message: string, step?: string) =>
    validation.push({ severity, message, step });

  // --- Core selections -----------------------------------------------------
  if (!ancestry) issue("error", "Choose an ancestry.", "ancestry");
  if (ancestry && !draft.heritageId) issue("error", "Choose a heritage.", "heritage");
  if (!background) issue("error", "Choose a background.", "background");
  if (!classData) issue("error", "Choose a class.", "class");
  if (classData && keyOptions.length > 1 && !key)
    issue("error", "Choose your key ability score.", "abilities");
  if (classData && keyOptions.length === 0 && !key)
    issue("warning", "This class needs a key ability score; select one manually.", "abilities");

  // --- Ability boosts ------------------------------------------------------
  if (ancestry) {
    const flex = flexibleBoosts(ancestry);
    const picks = flex.map((_, index) => draft.boosts.ancestry[index] ?? null);
    if (picks.some((pick) => pick === null))
      issue("error", "Choose all ancestry ability boosts.", "abilities");
    const fixedAbilities = new Set(
      ancestry.boosts.filter((entry) => entry.fixed).flatMap((entry) => entry.from)
    );
    for (let i = 0; i < picks.length; i++) {
      const pick = picks[i];
      if (pick && !flex[i].from.includes(pick))
        issue("error", "An ancestry boost is not allowed for that ability.", "abilities");
      if (pick && fixedAbilities.has(pick))
        issue(
          "error",
          "An ancestry free boost must go to an ability that isn't already boosted by your ancestry.",
          "abilities"
        );
    }
    const duplicates = picks.filter(Boolean).filter((pick, i, arr) => arr.indexOf(pick) !== i);
    if (duplicates.length)
      issue("error", "Ancestry boosts must be applied to different abilities.", "abilities");
  }
  if (background) {
    const flex = background.boosts.filter((entry) => !entry.fixed);
    const picks = flex.map((_, index) => draft.boosts.background[index] ?? null);
    if (picks.some((pick) => pick === null))
      issue("error", "Choose all background ability boosts.", "abilities");
    for (let i = 0; i < picks.length; i++) {
      const pick = picks[i];
      if (pick && !flex[i].from.includes(pick))
        issue("error", "A background boost is not allowed for that ability.", "abilities");
    }
    const duplicates = picks.filter(Boolean).filter((pick, i, arr) => arr.indexOf(pick) !== i);
    if (duplicates.length)
      issue("error", "Background boosts must be applied to different abilities.", "abilities");
  }
  if (!draft.boosts.free.some(Boolean)) {
    if (draft.level >= 1) issue("error", "Choose your four free ability boosts.", "abilities");
  } else {
    if (draft.boosts.free.filter(Boolean).length < 4)
      issue("error", "Choose all four free ability boosts.", "abilities");
    const duplicates = draft.boosts.free
      .filter(Boolean)
      .filter((pick, i, arr) => arr.indexOf(pick) !== i);
    if (duplicates.length)
      issue("error", "The four free boosts must be applied to different abilities.", "abilities");
  }
  for (const milestone of [5, 10, 15, 20]) {
    if (draft.level < milestone) continue;
    const picks = draft.boosts.levels[String(milestone)] ?? [];
    if (picks.filter(Boolean).length < 4)
      issue("error", `Choose all four level ${milestone} ability boosts.`, "abilities");
    const duplicates = picks.filter(Boolean).filter((pick, i, arr) => arr.indexOf(pick) !== i);
    if (duplicates.length)
      issue(
        "error",
        `Level ${milestone} boosts must be applied to different abilities.`,
        "abilities"
      );
  }
  for (const ability of ABILITIES) {
    if (rawAbilities[ability] > 18) {
      issue(
        "error",
        `${ABILITY_LABELS[ability]} would be ${rawAbilities[ability]} at 1st level. Reassign a boost so no score exceeds 18.`,
        "abilities"
      );
    }
  }

  // --- Skills --------------------------------------------------------------
  const fixedSkillSet = grantedTrainedSkills(draft, context);
  const deitySkills = deitySkillOptions(context.deity);
  if (context.deity && deitySkills.length > 1 && !selectedDeitySkill(draft, context.deity)) {
    issue("error", "Choose which skill your deity grants.", "class");
  }
  for (const group of background?.skillChoices ?? []) {
    const chosen = draft.skills.background.filter((skill) => group.options.includes(skill));
    if (chosen.length < group.count) {
      issue(
        "error",
        `Choose ${group.count} skill${group.count === 1 ? "" : "s"} for ${background?.name ?? "your background"}.`,
        "background"
      );
    }
  }
  for (const group of background?.loreChoices ?? []) {
    const chosen = draft.skills.backgroundLore.filter(
      (lore) => !group.options.length || group.options.includes(lore)
    );
    if (chosen.length < group.count) {
      issue(
        "error",
        `Choose ${group.count} Lore skill${group.count === 1 ? "" : "s"} for ${background?.name ?? "your background"}.`,
        "background"
      );
    }
    if (new Set(chosen).size < chosen.length) {
      issue(
        "error",
        `Choose different Lore skills for ${background?.name ?? "your background"}.`,
        "background"
      );
    }
  }
  for (const group of background?.featChoices ?? []) {
    const chosen = group.options.filter((option) => option.id === draft.backgroundFeat);
    if (chosen.length < group.count) {
      issue(
        "error",
        `Choose your starting feat for ${background?.name ?? "your background"}.`,
        "background"
      );
    }
  }
  const extraRequired = classData
    ? Math.max(0, classData.trainedSkills.additional + Math.max(0, abilityMods.int))
    : 0;
  const selectedExtra = draft.skills.trained.filter(
    (skill) => SKILL_BY_ID[skill as SkillId] && !fixedSkillSet.has(skill)
  );
  const uniqueExtra = [...new Set(selectedExtra)];
  if (classData && uniqueExtra.length !== extraRequired) {
    issue(
      "error",
      uniqueExtra.length < extraRequired
        ? `Choose ${extraRequired - uniqueExtra.length} more trained skill${extraRequired - uniqueExtra.length === 1 ? "" : "s"}.`
        : "You have selected too many trained skills.",
      "skills"
    );
  }
  if (fixedSkillSet.size) {
    for (const skill of fixedSkillSet) {
      if (!SKILL_BY_ID[skill as SkillId])
        issue("warning", `Unknown trained skill “${skill}”.`, "skills");
    }
  }

  const ranks: Record<string, number> = {};
  for (const skill of SKILLS) ranks[skill.id] = 0;
  for (const skill of fixedSkillSet) if (skill in ranks) ranks[skill] = 1;
  for (const skill of uniqueExtra) if (skill in ranks) ranks[skill] = 1;
  for (const skill of draft.skills.trained)
    if (skill in ranks) ranks[skill] = Math.max(ranks[skill], 1);
  for (const [skill, rank] of Object.entries(automaticSkillRanks(draft, context))) {
    if (skill in ranks) ranks[skill] = Math.max(ranks[skill], rank);
  }

  const increaseLevels = (classData?.skillIncreaseLevels ?? [])
    .filter((level) => level <= draft.level)
    .sort((a, b) => a - b);
  for (const level of increaseLevels) {
    const skill = draft.skills.increases[String(level)];
    if (!skill) {
      issue("error", `Choose a skill increase for level ${level}.`, "skills");
      continue;
    }
    if (!(skill in ranks)) {
      issue("error", `Unknown skill selected for level ${level}.`, "skills");
      continue;
    }
    // A skill increase can either train an untrained skill or raise an
    // already-trained skill by one rank.
    ranks[skill] = Math.min(4, ranks[skill] + 1);
    if (ranks[skill] > skillRankCap(level)) {
      issue(
        "error",
        `${SKILL_BY_ID[skill as SkillId]?.name ?? skill} is above the proficiency rank allowed at level ${level}.`,
        "skills"
      );
    }
  }
  for (const skill of SKILLS) {
    if (ranks[skill.id] > skillRankCap(draft.level)) {
      issue(
        "error",
        `${skill.name} has a proficiency rank above what your level allows.`,
        "skills"
      );
    }
  }

  const equippedArmorItem = equippedArmor(draft, context);
  const meetsArmorStrength = equippedArmorItem?.armor
    ? abilityMods.str >= (equippedArmorItem.armor.strength || 0)
    : true;
  const armorCheckPenalty =
    equippedArmorItem?.armor && !meetsArmorStrength && equippedArmorItem.armor.checkPenalty
      ? -Math.abs(equippedArmorItem.armor.checkPenalty)
      : 0;

  const derivedSkills: DerivedSkill[] = SKILLS.map((skill) => {
    const rank = ranks[skill.id] ?? 0;
    const mod =
      proficiencyBonus(rank, draft.level) +
      abilityMods[skill.ability] +
      (skill.armorPenalty ? armorCheckPenalty : 0);
    return {
      id: skill.id,
      name: skill.name,
      ability: skill.ability,
      rank,
      mod,
      trained: rank > 0,
    };
  });

  const lore: DerivedCharacter["lore"] = [];
  for (const name of background?.lore ?? []) {
    lore.push({ name, mod: proficiencyBonus(1, draft.level) + abilityMods.int, rank: 1 });
  }
  for (const raw of draft.skills.backgroundLore) {
    const clean = String(raw || "").trim();
    if (!clean) continue;
    lore.push({
      name: clean.toLowerCase().includes("lore") ? clean : `${clean} Lore`,
      mod: proficiencyBonus(1, draft.level) + abilityMods.int,
      rank: 1,
    });
  }
  for (const name of draft.skills.lore) {
    const clean = String(name || "").trim();
    if (!clean) continue;
    lore.push({
      name: clean.toLowerCase().includes("lore") ? clean : `${clean} Lore`,
      mod: proficiencyBonus(1, draft.level) + abilityMods.int,
      rank: 1,
    });
  }
  const classLoreFeatures = [
    ...(classData?.features ?? []),
    ...(classData
      ? selectedChoiceOptions(draft, classData).flatMap((option) => option.grantedFeatures ?? [])
      : []),
  ];
  for (const feature of classLoreFeatures) {
    if (feature.level > draft.level) continue;
    for (const entry of feature.lore ?? []) {
      const rank = draft.level >= 15 ? 4 : draft.level >= 7 ? 3 : draft.level >= 3 ? 2 : 1;
      lore.push({
        name: entry.name,
        mod: proficiencyBonus(rank, draft.level) + abilityMods[entry.ability],
        rank,
      });
    }
  }
  if (lore.length) {
    // background lore may duplicate custom entries
    const seen = new Set<string>();
    for (let i = lore.length - 1; i >= 0; i--) {
      const key = lore[i].name.toLowerCase();
      if (seen.has(key)) lore.splice(i, 1);
      else seen.add(key);
    }
  }

  // --- HP / AC / saves -----------------------------------------------------
  const conMod = abilityMods.con;
  const ancestryHp = ancestry?.hp ?? 0;
  const classHp = classData?.hp ?? 0;
  const perLevel = Math.max(1, classHp + conMod);
  const maxHp =
    Math.max(1, ancestryHp + perLevel + Math.max(0, draft.level - 1) * perLevel) +
    (featMods.hpPerLevel ?? 0) * draft.level;
  const currentHp =
    draft.play.hp === null ? maxHp : Math.max(0, Math.min(maxHp, Math.round(draft.play.hp)));

  const armor = equippedArmor(draft, context);
  const armorEntry =
    draft.equipment.find(
      (entry) => entry.equipped && Boolean(context.equipment[entry.itemId]?.armor)
    ) ?? null;
  const armorRunes = summarizeRunes(armorEntry?.runes, context.equipment);
  const shield = equippedShield(draft, context);
  const shieldEntry =
    draft.equipment.find(
      (entry) => entry.equipped && Boolean(context.equipment[entry.itemId]?.shield)
    ) ?? null;
  const shieldRunes = shieldRuneBonus(shieldEntry?.runes, context.equipment);
  const shieldInfo = shield?.shield
    ? {
        name: shield.name,
        hardness: Math.max(
          shield.shield.hardness,
          Math.min(
            shieldRunes.maxHardness ?? Number.POSITIVE_INFINITY,
            shield.shield.hardness + shieldRunes.hardness
          )
        ),
        hp: Math.max(
          shield.shield.hp,
          Math.min(shieldRunes.maxHp ?? Number.POSITIVE_INFINITY, shield.shield.hp + shieldRunes.hp)
        ),
        brokenThreshold: 0,
        raised: draft.play.shieldRaised,
      }
    : null;
  if (shieldInfo) shieldInfo.brokenThreshold = Math.floor(shieldInfo.hp / 2);
  const shieldBonus =
    draft.play.shieldRaised && shield?.shield ? Math.abs(shield.shield.acBonus || 2) : 0;
  let ac: number;
  let speed = (ancestry?.speed ?? 25) + (featMods.speed ?? 0);
  if (armor?.armor) {
    const armorCategory = armor.armor.category === "unarmored" ? "unarmored" : armor.armor.category;
    // Negative Dexterity still applies; only the armor's Dex cap limits it.
    const dex = Math.min(abilityMods.dex, armor.armor.dexCap);
    ac =
      10 +
      dex +
      armor.armor.acBonus +
      armorRunes.armorPotency +
      proficiencyBonus(prof.defenses[armorCategory] ?? 0, draft.level) +
      shieldBonus;
    if (!meetsArmorStrength) speed += armor.armor.speedPenalty || 0;
  } else {
    ac =
      10 +
      abilityMods.dex +
      proficiencyBonus(prof.defenses.unarmored ?? 0, draft.level) +
      shieldBonus;
  }
  if (shield?.shield?.speedPenalty) speed += shield.shield.speedPenalty;
  speed = Math.max(5, speed);

  const saves: Record<SaveKey, number> = {
    fortitude:
      proficiencyBonus(prof.fortitude, draft.level) + abilityMods.con + armorRunes.resilient,
    reflex: proficiencyBonus(prof.reflex, draft.level) + abilityMods.dex + armorRunes.resilient,
    will: proficiencyBonus(prof.will, draft.level) + abilityMods.wis + armorRunes.resilient,
  };
  const perception = proficiencyBonus(prof.perception, draft.level) + abilityMods.wis;
  const classDc = classData
    ? 10 + proficiencyBonus(prof.classDc, draft.level) + keyMod
    : 10 + keyMod;
  const spellDc =
    caster.progression === "none"
      ? null
      : 10 + proficiencyBonus(prof.spellcasting, draft.level) + spellMod;
  const spellAttack =
    caster.progression === "none"
      ? null
      : proficiencyBonus(prof.spellcasting, draft.level) + spellMod;

  // --- Equipment -----------------------------------------------------------
  const ownedEquipment = draft.equipment
    .map((entry) => ({ entry, item: context.equipment[entry.itemId] }))
    .filter((x): x is { entry: (typeof draft.equipment)[number]; item: Equipment } =>
      Boolean(x.item)
    );
  const bulkTotal = ownedEquipment.reduce(
    (sum, { entry, item }) => sum + (item.bulk || 0) * entry.quantity,
    0
  );
  const capacity = 5 + abilityMods.str;
  const maxBulk = 10 + abilityMods.str;
  const spent = ownedEquipment.reduce((sum, { entry, item }) => {
    const runeCost = (entry.runes ?? []).reduce(
      (runeSum, runeId) => runeSum + (context.equipment[runeId]?.price.cpTotal ?? 0),
      0
    );
    return sum + item.price.cpTotal * entry.quantity + runeCost;
  }, 0);
  const budget = startingWealthCp(draft.level);
  if (spent > budget)
    issue(
      "warning",
      "Your equipment costs more than the standard starting wealth for this level.",
      "gear"
    );

  for (const { entry, item } of ownedEquipment) {
    if (!entry.runes?.length) continue;
    const runeEffects = summarizeRunes(entry.runes, context.equipment);
    const slots = Math.max(runeEffects.weaponPotency, runeEffects.armorPotency);
    if (runeEffects.property.length > slots) {
      issue(
        "error",
        `${item.name} has ${runeEffects.property.length} property runes but its potency supports ${slots}.`,
        "gear"
      );
    }
  }

  // --- Attacks -------------------------------------------------------------
  const chosenOptions = selectedChoiceOptions(draft, classData);
  const selectedOptionNames = new Set(chosenOptions.map((option) => option.name.toLowerCase()));
  const thief = selectedOptionNames.has("thief");
  const activeFeatures = [
    ...(classData?.features ?? []).filter((feature) => feature.level <= draft.level),
    ...chosenOptions
      .flatMap((option) => option.grantedFeatures ?? [])
      .filter((feature) => feature.level <= draft.level),
  ];
  const attacks: DerivedAttack[] = [];
  for (const { entry, item } of ownedEquipment) {
    if (!entry.equipped || !item.weapon) continue;
    const weapon = item.weapon;
    // Some bombs deal only persistent or non-damage effects and have no
    // direct damage die. They still exist as equipment, but aren't strikes.
    if (weapon.damage.dice <= 0 || !/^d\d+$/.test(weapon.damage.die)) continue;
    const rank = attackRankFor(item, prof, classData, context.deity);
    const runes = summarizeRunes(entry.runes, context.equipment);
    const ranged = weapon.range !== null || item.traits.includes("thrown");
    const isThrown =
      item.traits.includes("thrown") || item.traits.some((t) => t.startsWith("thrown-"));
    const finesse = item.traits.includes("finesse");
    let attackAbility = abilityMods.str;
    let damageAbility = abilityMods.str;
    if (ranged) {
      attackAbility = abilityMods.dex;
      damageAbility = isThrown ? abilityMods.str : 0;
      if (!isThrown && item.traits.includes("propulsive")) {
        // Propulsive adds half a positive Strength modifier, or the full
        // negative modifier.
        damageAbility = abilityMods.str > 0 ? Math.floor(abilityMods.str / 2) : abilityMods.str;
      }
    } else if (finesse) {
      attackAbility = Math.max(abilityMods.str, abilityMods.dex);
      damageAbility = thief ? Math.max(abilityMods.str, abilityMods.dex) : abilityMods.str;
    }
    const attackBonus =
      proficiencyBonus(rank, draft.level) +
      attackAbility +
      (weapon.bonus || 0) +
      runes.weaponPotency;
    const damageDice = Math.max(weapon.damage.dice, runes.strikingDice);
    const damageBase = `${damageDice}${weapon.damage.die}`;
    // Alchemical bombs have an item bonus to attack rolls but not to damage.
    const weaponDamageBonus = isBomb(item) ? 0 : weapon.bonus || 0;
    const damageMod =
      damageAbility + weaponDamageBonus + weaponSpecializationBonus(activeFeatures, rank);
    const damageFormula = damageMod === 0 ? damageBase : `${damageBase}${signed(damageMod)}`;
    const extraDamage = runes.property
      .map((rune) => propertyRuneDamage(rune))
      .filter((entry): entry is { formula: string; type: string; label: string } => Boolean(entry));
    const notes = [
      isThrown ? "Thrown" : ranged ? "Ranged" : "",
      finesse ? "Finesse" : "",
      item.traits.includes("propulsive") ? "Propulsive" : "",
      runes.weaponPotency ? `+${runes.weaponPotency} potency` : "",
      runes.strikingDice > 1 ? `${runes.strikingDice} damage dice` : "",
      ...runes.property.map((rune) => rune.name),
    ].filter(Boolean);
    attacks.push({
      id: `weapon:${item.id}`,
      name: item.name,
      sourceItemId: item.id,
      attackBonus,
      attackFormula: `1d20${signed(attackBonus)}`,
      damageFormula,
      damageType: weapon.damage.type,
      extraDamage,
      traits: item.traits,
      hands: weapon.hands,
      ranged,
      notes: notes.join(" · "),
    });
  }
  const deityFist =
    context.deity?.weapons.some((weapon) => /^(fist|unarmed)/i.test(weapon)) ?? false;
  const fistRank = Math.max(
    prof.attacks.unarmed ?? 0,
    deityFist ? (prof.attacks.favoredWeapon ?? 0) : 0
  );
  const fistAttack =
    proficiencyBonus(fistRank, draft.level) + Math.max(abilityMods.str, abilityMods.dex);
  const fistDamage = abilityMods.str + weaponSpecializationBonus(activeFeatures, fistRank);
  attacks.push({
    id: "unarmed:fist",
    name: "Fist",
    sourceItemId: null,
    attackBonus: fistAttack,
    attackFormula: `1d20${signed(fistAttack)}`,
    damageFormula: fistDamage === 0 ? "1d4" : `1d4${signed(fistDamage)}`,
    damageType: "bludgeoning",
    traits: ["agile", "finesse", "nonlethal", "unarmed"],
    hands: 1,
    ranged: false,
    notes: "Nonlethal",
  });

  // --- Spells --------------------------------------------------------------
  const slots = spellSlotsFor(draft.level, caster.progression, classData?.name);
  const maxSpellRank = slots
    ? slots.length
    : caster.progression === "none"
      ? 0
      : Math.ceil(draft.level / 2);
  const tradition = caster.tradition ?? draft.spells.tradition;
  if (caster.traditionOptions && !tradition) {
    issue("error", "Choose your magical tradition.", "spells");
  }
  for (const spellId of [...draft.spells.cantrips, ...draft.spells.known]) {
    const spell = context.spells[spellId];
    if (!spell) continue;
    if (spell.rank > maxSpellRank) {
      issue(
        "warning",
        `${spell.name} is a rank ${spell.rank} spell, above what this character can cast.`,
        "spells"
      );
    }
  }
  if (caster.progression !== "none") {
    for (const spellId of draft.spells.known) {
      if (!context.spells[spellId])
        issue("warning", "A selected spell is missing from the compendium.", "spells");
    }
  }
  const preparedCaster = PREPARED_CASTER_CLASSES.has(classData?.name.toLowerCase() ?? "");
  if (preparedCaster && draft.spells.prepared.length) {
    const preparedByRank = new Map<number, number>();
    for (const spellId of draft.spells.prepared) {
      const spell = context.spells[spellId];
      if (!spell) {
        issue("warning", "A prepared spell is missing from the compendium.", "spells");
        continue;
      }
      if (!draft.spells.known.includes(spellId) && !draft.spells.cantrips.includes(spellId)) {
        issue(
          "warning",
          `${spell.name} is prepared but is not in this character's spellbook or list.`,
          "spells"
        );
      }
      if (spell.rank > 0) preparedByRank.set(spell.rank, (preparedByRank.get(spell.rank) ?? 0) + 1);
    }
    for (const [rank, count] of preparedByRank) {
      const limit = slots?.[rank - 1] ?? 0;
      if (count > limit) {
        issue(
          "error",
          `${classData?.name ?? "This class"} has ${count} rank ${rank} spells prepared but only ${limit} slot${limit === 1 ? "" : "s"}.`,
          "spells"
        );
      }
    }
  }
  const repertoire = spellRepertoireLimits(classData, draft.level);
  if (repertoire) {
    if (draft.spells.cantrips.length > repertoire.cantrips) {
      issue(
        "error",
        `${classData?.name ?? "This class"} knows ${draft.spells.cantrips.length} cantrips but the repertoire allows ${repertoire.cantrips}.`,
        "spells"
      );
    }
    const knownByRank = new Map<number, number>();
    for (const spellId of draft.spells.known) {
      const spell = context.spells[spellId];
      if (!spell) continue;
      knownByRank.set(spell.rank, (knownByRank.get(spell.rank) ?? 0) + 1);
    }
    for (const [rank, count] of knownByRank) {
      const limit = repertoire.ranks[rank - 1] ?? 0;
      if (count > limit) {
        issue(
          "error",
          `${classData?.name ?? "This class"} knows ${count} rank ${rank} spells but the repertoire allows ${limit}.`,
          "spells"
        );
      }
    }
  }

  // --- Feats ---------------------------------------------------------------
  const selectedFeatIds: string[] = [];
  const slotsForFeats = featSlotsFor(classData, draft.level);
  for (const slot of slotsForFeats) {
    const featId = draft.feats[slot.category]?.[String(slot.level)];
    if (!featId) {
      issue("error", `Choose a ${slot.category} feat for level ${slot.level}.`, "feats");
      continue;
    }
    selectedFeatIds.push(featId);
    const feat = context.feats[featId];
    if (!feat) {
      issue("warning", "A selected feat is missing from the compendium.", "feats");
      continue;
    }
    if (feat.level > slot.level)
      issue("error", `${feat.name} is above the level ${slot.level} slot.`, "feats");
    const expected = slot.category === "class" ? ["class", "archetype"] : [slot.category];
    if (!expected.includes(feat.category)) {
      issue(
        "error",
        `${feat.name} is a ${feat.category} feat and cannot fill a ${slot.category} feat slot.`,
        "feats"
      );
    }
  }
  for (const id of draft.feats.extras) selectedFeatIds.push(id);
  const selectedFeats = [...new Set(selectedFeatIds)]
    .map((id) => context.feats[id])
    .filter((feat): feat is Feat => Boolean(feat));

  // --- Class choices -------------------------------------------------------
  if (classData) {
    for (const group of applicableChoiceGroups(draft, classData)) {
      const selected = (draft.classChoices[group.key] ?? []).filter((id) =>
        group.options.some((option) => option.id === id)
      );
      if (selected.length !== group.count) {
        issue(
          "error",
          `${group.prompt} Choose ${group.count} option${group.count === 1 ? "" : "s"}.`,
          "class"
        );
      }
      if (new Set(selected).size !== selected.length) {
        issue("error", `${group.prompt} Choose different options.`, "class");
      }
    }
  }

  // --- Deity ---------------------------------------------------------------
  if (needsDeity && !context.deity) issue("error", "Choose a deity.", "class");

  // --- Features ------------------------------------------------------------
  const suppressed = new Set(
    chosenOptions.flatMap((option) =>
      (option.suppressedFeatures ?? []).map(parseClassFeatureUuidName)
    )
  );
  const features: FeatureSummary[] = classData
    ? classData.features.filter(
        (feature) => feature.level <= draft.level && !suppressed.has(feature.name)
      )
    : [];
  const addFeature = (feature: FeatureSummary) => {
    if (feature.level > draft.level || suppressed.has(feature.name)) return;
    if (!features.some((existing) => existing.name === feature.name)) features.push(feature);
  };
  for (const option of chosenOptions) {
    addFeature({
      id: option.id,
      name: option.name,
      level: option.level,
      description: option.description,
      traits: option.traits,
      otherTags: option.otherTags,
      proficiencies: option.proficiencies,
      keyOptions: option.keyOptions,
      suppressedFeatures: option.suppressedFeatures,
      senses: option.senses,
      languages: option.languages,
    });
    for (const feature of option.grantedFeatures ?? []) addFeature(feature);
  }

  const selectedBackgroundFeat = (background?.featChoices ?? [])
    .flatMap((group) => group.options)
    .find((option) => option.id === draft.backgroundFeat);
  const grantedFeats = [
    ...(background?.grantedFeats ?? []).map((feat) => ({ name: feat.name, id: feat.id })),
    ...(selectedBackgroundFeat
      ? [{ name: selectedBackgroundFeat.name, id: selectedBackgroundFeat.id }]
      : []),
  ];

  let focusPointsMax =
    caster.progression !== "none" ||
    features.some((feature) =>
      /focus|devotion spells|conflux spells|link spells|hexes|revelation spells|grave spells|composition spells|psi cantrips/i.test(
        feature.name
      )
    )
      ? 1
      : 0;
  if (
    classData?.name.toLowerCase() === "necromancer" ||
    classData?.name.toLowerCase() === "psychic"
  ) {
    focusPointsMax = Math.max(focusPointsMax, 2);
  }
  // A focus pool can hold one point per focus spell, up to 3. This is a
  // table aid because some focus spells are granted automatically.
  focusPointsMax = Math.max(focusPointsMax, Math.min(3, draft.spells.focus.length));
  focusPointsMax = Math.min(3, focusPointsMax);

  const languages = [
    ...(ancestry?.languages ?? []).map(titleCase),
    ...draft.details.languages,
    ...(featMods.languages ?? []).map(titleCase),
  ].filter(
    (value, index, arr) => arr.findIndex((x) => x.toLowerCase() === value.toLowerCase()) === index
  );

  const senses = [
    ...(ancestry?.vision && ancestry.vision !== "normal" ? [ancestry.vision] : []),
    ...(featMods.senses ?? []),
  ].filter(
    (value, index, arr) => arr.findIndex((x) => x.toLowerCase() === value.toLowerCase()) === index
  );

  const className = classData?.name.toLowerCase();
  const font = divineFontInfo(draft.level, classData?.name);
  const divineFontSlots = font?.slots ?? null;
  const divineFontRank = font?.rank ?? null;
  const spellSlotsNote =
    caster.progression === "focus"
      ? "Focus spells only. Champions use Charisma for spell attack rolls and spell DCs."
      : className === "animist"
        ? "Animist slots combine prepared animist spells and spontaneous apparition slots; the tracker shows the total per rank."
        : className === "cleric"
          ? `Divine font: ${font?.slots ?? 0} rank ${font?.rank ?? 1} heal-or-harm slots, tracked separately from ordinary slots.`
          : className === "wizard"
            ? "Includes one extra curriculum spell slot at each rank."
            : null;

  const summary = {
    abilities,
    abilityMods,
    classKeyOptions: keyOptions,
    prof,
    maxHp,
    currentHp,
    tempHp: draft.play.tempHp,
    ac,
    shieldBonus,
    shield: shieldInfo,
    speed,
    otherSpeeds: ancestry?.otherSpeeds ?? [],
    perception,
    saves,
    skills: derivedSkills,
    lore,
    classDc,
    spellDc,
    spellAttack,
    attacks,
    spellSlots: slots,
    spellSlotsNote,
    divineFontSlots,
    divineFontRank,
    focusPointsMax,
    size: ancestry?.size ?? "med",
    languages,
    senses,
    equipment: draft.equipment,
    bulk: {
      total: Math.round(bulkTotal * 10) / 10,
      capacity,
      encumbered: bulkTotal > capacity,
      max: maxBulk,
    },
    wealth: {
      budget,
      spent,
      remaining: budget - spent,
      currencyCp: draft.currency.gp * 100 + draft.currency.sp * 10 + draft.currency.cp,
    },
    features,
    selectedFeats,
    grantedFeats,
    casterTradition: tradition,
    casterProgression: caster.progression,
    maxSpellRank,
    validation,
    xp: draft.play.xp,
  } satisfies DerivedCharacter;

  for (const feat of selectedFeats) {
    const { status, checks } = featPrerequisiteStatus(feat, draft, context, summary);
    if (status === "unmet") {
      const unmet = checks.filter((check) => check.status === "unmet").map((check) => check.text);
      issue("error", `${feat.name} prerequisites are not met: ${unmet.join("; ")}.`, "feats");
    } else if (status === "unknown") {
      const unknown = checks
        .filter((check) => check.status === "unknown")
        .map((check) => check.text);
      issue("warning", `Verify ${feat.name} prerequisites: ${unknown.join("; ")}.`, "feats");
    }
  }

  return summary;
}

export function equippedArmor(draft: CharacterDraft, context: CharacterContext): Equipment | null {
  for (const entry of draft.equipment) {
    if (!entry.equipped) continue;
    const item = context.equipment[entry.itemId];
    if (item?.armor) return item;
  }
  return null;
}

export function equippedShield(draft: CharacterDraft, context: CharacterContext): Equipment | null {
  for (const entry of draft.equipment) {
    if (!entry.equipped) continue;
    const item = context.equipment[entry.itemId];
    if (item?.shield) return item;
  }
  return null;
}

export function weaponDamageLabel(weapon: Equipment["weapon"] | null | undefined): string {
  if (!weapon) return "";
  if (weapon.damage.dice <= 0 || !/^d\d+$/.test(weapon.damage.die)) return "No direct damage";
  return `${weapon.damage.dice}${weapon.damage.die} ${weapon.damage.type}`;
}

export function abilityLabel(ability: AbilityKey): string {
  return ABILITY_LABELS[ability];
}

export function saveAbility(save: SaveKey): AbilityKey {
  return SAVE_ABILITY[save];
}

// ---------------------------------------------------------------------------
// Summary for campaign/dashboard lists
// ---------------------------------------------------------------------------
export function characterSummary(draft: CharacterDraft, context: CharacterContext) {
  const derived = computeCharacter(draft, context);
  return {
    level: draft.level,
    ancestry: context.ancestry?.name ?? "",
    heritage: context.heritage?.name ?? "",
    background: context.background?.name ?? "",
    className: context.classData?.name ?? "",
    keyAbility: draft.keyAbility ?? derived.classKeyOptions[0] ?? "",
    hp: derived.maxHp,
    currentHp: derived.currentHp,
    tempHp: draft.play.tempHp,
    ac: derived.ac,
    speed: derived.speed,
    perception: derived.perception,
    fortitude: derived.saves.fortitude,
    reflex: derived.saves.reflex,
    will: derived.saves.will,
    classDc: derived.classDc,
    spellDc: derived.spellDc,
    heroPoints: draft.play.heroPoints,
    focusPoints: draft.play.focusPoints,
    conditions: draft.play.conditions.map(
      (condition) =>
        `${condition.name}${condition.value ? ` ${condition.value}` : ""}${condition.duration ? ` (${condition.duration}r)` : ""}`
    ),
    portraitUrl: draft.portraitUrl,
  };
}
