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
  type CharacterCustomItem,
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
  type Spell,
  type SpellTradition,
  type PreparedSpellsByRank,
  type AnimistApparitionInfo,
  type ApparitionSpell,
  type AttunedApparition,
  type StudiousSlotInfo,
  type StudiousSlotSpell,
  type ValidationIssue,
} from "./types";
import {
  isHandwrapsOfMightyBlows,
  propertyRuneDamage,
  shieldRuneBonus,
  summarizeRunes,
} from "./runes";
import { conditionModifiers } from "./conditions";
import { normalizeAfflictions } from "./afflictions";
import { normalizePersistentDamageList } from "./persistentDamage";
import { clampHeroPoints } from "./heroPoints";
import { normalizeCharacterTurnEffects } from "./characterTurnEffects";
import { INVESTED_LIMIT, investedCount } from "./itemActivation";
import { normalizeSustainedSpells } from "./sustain";
import {
  FEAT_CHOICES,
  WEAPON_PROFICIENCY_ID,
  collectFeatChoiceEffects,
  collectFeatEffects,
  collectItemEffects,
  mergeEffects,
  selectedFeatGrantInstances,
} from "./effects";
import {
  featAllowedByHeritageGrant,
  heritageChosenFeatId,
  heritageEffects,
  heritageFeatGrant,
  heritageFeatTraits,
  heritageGrantedTraits,
  heritageSkillChoice,
} from "./heritage";
import { MAGUS_STUDIOUS_BASE, MAGUS_STUDIOUS_BY_STUDY, selectedClassGrants } from "./classGrants";
import { APPARITION_BY_ID } from "./apparitions";
import { activeGrantChoiceGroups } from "./classGrantChoices";
import {
  multiclassDedicationFor,
  multiclassProficiencyRank,
  multiclassSlotCounts,
} from "./multiclass";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
/** GM Core table 10-10: the lump-sum wealth of a new character at each level. */
export const STARTING_WEALTH_CP = [
  0, 1_500, 3_000, 7_500, 14_000, 27_000, 45_000, 72_000, 110_000, 160_000, 230_000, 320_000,
  450_000, 640_000, 930_000, 1_350_000, 2_000_000, 3_000_000, 4_500_000, 6_900_000, 11_200_000,
];

export function startingWealthCp(level: number): number {
  const safe = Math.max(1, Math.min(20, Math.floor(level || 1)));
  return STARTING_WEALTH_CP[safe] ?? 1_500;
}

/** Currency needed to bring an existing character up to the new-character benchmark. */
export function replacementWealthGrantCp(level: number, committedCp: number): number {
  const committed = Math.max(0, Math.round(Number.isFinite(committedCp) ? committedCp : 0));
  return Math.max(0, startingWealthCp(level) - committed);
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

/**
 * What a class calls its source of ordinary spells. Prepared classes do not
 * all use a spellbook: witches use a familiar, necromancers a dirge, and
 * clerics/druids/animists prepare from a class spell list.
 */
export function spellSourceLabel(classData: ClassData | null | undefined): string {
  const name = classData?.name.toLowerCase() ?? "";
  if (name === "wizard" || name === "magus") return "spellbook";
  if (name === "witch") return "familiar";
  if (name === "necromancer") return "dirge";
  if (isPreparedCasterClass(name)) return "spell list";
  const caster = casterInfo(classData);
  if (caster.progression === "focus") return "focus spells";
  if (caster.progression === "none") return "spells";
  return "repertoire";
}

const SPELLBOOK_CLASS_NAMES = new Set(["wizard", "magus", "witch", "necromancer"]);

/** Whether this class keeps spells in a spellbook, familiar, or dirge. */
export function isSpellbookClass(classData: ClassData | null | undefined): boolean {
  return SPELLBOOK_CLASS_NAMES.has(classData?.name.toLowerCase() ?? "");
}

/**
 * The class's full source list: spellbook/familiar/dirge for book casters,
 * repertoire for spontaneous casters, and the prepared list for cleric,
 * druid, and animist. Legacy drafts with only `known` still read correctly.
 */
export function sourceSpellIds(
  draft: Pick<CharacterDraft, "spells">,
  classData: ClassData | null | undefined
): string[] {
  if (!isSpellbookClass(classData)) return draft.spells.known;
  const book = draft.spells.spellbook ?? [];
  return book.length ? book : draft.spells.known;
}

/** Write the class's source list, migrating legacy `known` book contents once. */
export function withSourceSpellIds(
  draft: CharacterDraft,
  classData: ClassData | null | undefined,
  ids: string[]
): CharacterDraft {
  const unique = [...new Set(ids.filter((id) => typeof id === "string"))];
  if (!isSpellbookClass(classData)) {
    return { ...draft, spells: { ...draft.spells, known: unique } };
  }
  return { ...draft, spells: { ...draft.spells, spellbook: unique, known: [] } };
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

export function casterTraditionFor(
  draft: CharacterDraft,
  classData: ClassData | null | undefined
): SpellTradition | null {
  const caster = casterInfo(classData);
  if (caster.tradition) return caster.tradition;
  const matches = new Set<SpellTradition>();
  for (const option of selectedChoiceOptions(draft, classData)) {
    const description = (option.description ?? "").replace(/<[^>]+>/g, " ");
    for (const pattern of [
      /Tradition\s+(arcane|divine|occult|primal)/gi,
      /Spell List\s+(arcane|divine|occult|primal)/gi,
    ]) {
      for (const match of description.matchAll(pattern)) {
        matches.add(match[1].toLowerCase() as SpellTradition);
      }
    }
  }
  if (matches.size === 1) return [...matches][0];
  return draft.spells.tradition ?? null;
}

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

/** Sorcerer and Oracle use the spontaneous full-caster table (4/rank, 3 at the newest). */
export function spontaneousFullCasterSlots(level: number): number[] {
  const maxRank = Math.ceil(level / 2);
  if (maxRank >= 10) return [4, 4, 4, 4, 4, 4, 4, 4, 4, 1];
  const slots: number[] = [];
  for (let rank = 1; rank <= maxRank; rank++) {
    slots.push(rank < maxRank ? 4 : level % 2 === 1 ? 3 : 4);
  }
  return slots;
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
 * Bards use the prepared full-caster slot progression (three slots per rank,
 * two at 1st level) even though they cast spontaneously. They are not on the
 * sorcerer/oracle four-slot table.
 */
export function bardSlots(level: number): number[] {
  const safe = Math.max(1, Math.min(20, Math.floor(level || 1)));
  if (safe >= 19) return [3, 3, 3, 3, 3, 3, 3, 3, 3, 1];
  return fullCasterSlots(safe);
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

/**
 * Animist prepared slots per rank. The animist table prints "prepared+spontaneous"
 * pairs; this is the left-hand number from each column.
 */
export function animistPreparedSlots(level: number): number[] {
  const table: number[][] = [
    [1],
    [2],
    [2, 1],
    [2, 2],
    [2, 2, 1],
    [2, 2, 2],
    [2, 2, 2, 1],
    [2, 2, 2, 2],
    [2, 2, 2, 2, 1],
    [2, 2, 2, 2, 2],
    [2, 2, 2, 2, 2, 1],
    [2, 2, 2, 2, 2, 2],
    [2, 2, 2, 2, 2, 2, 1],
    [2, 2, 2, 2, 2, 2, 2],
    [2, 2, 2, 2, 2, 2, 2, 1],
    [2, 2, 2, 2, 2, 2, 2, 2],
    [2, 2, 2, 2, 2, 2, 2, 2, 1],
    [2, 2, 2, 2, 2, 2, 2, 2, 2],
    [2, 2, 2, 2, 2, 2, 2, 2, 2],
    [2, 2, 2, 2, 2, 2, 2, 2, 2],
  ];
  const safe = Math.max(1, Math.min(20, Math.floor(level || 1)));
  return table[safe - 1];
}

/** Animist spontaneous apparition slots per rank (the right-hand table column). */
export function animistApparitionSlots(level: number): number[] {
  const table: number[][] = [
    [1],
    [1],
    [1, 1],
    [1, 1],
    [1, 1, 1],
    [1, 1, 1],
    [1, 1, 1, 1],
    [1, 1, 1, 1],
    [1, 1, 1, 1, 1],
    [2, 2, 2, 1, 1],
    [2, 2, 2, 1, 1, 1],
    [2, 2, 2, 2, 1, 1],
    [2, 2, 2, 2, 2, 1, 1],
    [2, 2, 2, 2, 2, 1, 1],
    [2, 2, 2, 2, 2, 2, 1, 1],
    [2, 2, 2, 2, 2, 2, 1, 1],
    [2, 2, 2, 2, 2, 2, 2, 1, 1],
    [2, 2, 2, 2, 2, 2, 2, 1, 1],
    [2, 2, 2, 2, 2, 2, 2, 2, 1, 1],
    [2, 2, 2, 2, 2, 2, 2, 2, 1, 1],
  ];
  const safe = Math.max(1, Math.min(20, Math.floor(level || 1)));
  return table[safe - 1];
}

/** Apparitions attuned each day: two at 1st, three at 7th, four at 15th. */
export function animistApparitionLimit(level: number): number {
  return level >= 15 ? 4 : level >= 7 ? 3 : 2;
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
    // The published cleric table moves divine font to 10th rank at 19th and
    // 20th level, alongside the single miraculous spell slot.
    rank: Math.min(10, Math.max(1, Math.ceil(level / 2))),
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
        return animistPreparedSlots(level);
      case "cleric":
        return clericSlots(level);
      case "wizard":
        return wizardSlots(level);
      case "bard":
        return bardSlots(level);
      case "sorcerer":
      case "oracle":
        return spontaneousFullCasterSlots(level);
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

/** Ordinary prepared slots; a cleric's divine font is tracked separately. */
export function ordinarySpellSlotsFor(
  level: number,
  progression: CasterProgression,
  className?: string
): number[] | null {
  if (className?.toLowerCase() === "cleric") return fullCasterSlots(level);
  return spellSlotsFor(level, progression, className);
}

const CANTRIP_LIMITS: Record<string, number> = {
  cleric: 5,
  druid: 5,
  // Bard composition cantrips are extra; these five are the occult cantrips
  // chosen from the bard spell list.
  bard: 5,
  oracle: 5,
  // A sorcerer's bloodline cantrip is one of the five cantrips they know, so
  // only four are chosen from the spell list.
  sorcerer: 4,
  witch: 5,
  // The wizard's spellbook starts with 10 cantrips and prepares five plus one
  // curriculum cantrip each day.
  wizard: 10,
  // A magus spellbook starts with eight cantrips and prepares five each day.
  magus: 8,
  summoner: 5,
  // Psychic gains three regular occult cantrips, plus three psi cantrips from
  // the conscious mind.
  psychic: 3,
  // An animist's two prepared cantrips are the only cantrips stored here;
  // apparition cantrips come from the attuned apparitions.
  animist: 2,
  necromancer: 5,
};

/** Cantrips a class can know or hold in its spellbook/repertoire. */
export function cantripLimitFor(classData: ClassData | null | undefined): number | null {
  return CANTRIP_LIMITS[classData?.name.toLowerCase() ?? ""] ?? null;
}

/** Cantrips a prepared caster prepares each day. */
const PREPARED_CANTRIP_LIMITS: Record<string, number> = {
  cleric: 5,
  druid: 5,
  witch: 5,
  wizard: 5,
  magus: 5,
  necromancer: 5,
  animist: 2,
};

export function cantripPreparedLimitFor(classData: ClassData | null | undefined): number | null {
  const name = classData?.name.toLowerCase() ?? "";
  if (!isPreparedCasterClass(name)) return null;
  return PREPARED_CANTRIP_LIMITS[name] ?? null;
}

export interface SpellbookBudget {
  startingCantrips: number;
  startingRanked: number;
  perLevel: number;
  cantrips: number;
  ranked: number;
}

export interface SpellbookUsage {
  budget: SpellbookBudget;
  freeCantrips: number;
  freeRanked: number;
  learnedCantrips: number;
  learnedRanked: number;
  grantedCantrips: number;
  grantedRanked: number;
  overCantrips: number;
  overRanked: number;
}

const SPELLBOOK_START: Record<string, { cantrips: number; ranked: number }> = {
  wizard: { cantrips: 10, ranked: 5 },
  magus: { cantrips: 8, ranked: 5 },
  witch: { cantrips: 10, ranked: 5 },
  necromancer: { cantrips: 8, ranked: 5 },
};

/** The free starting spellbook/familiar/dirge budget for book casters. */
export function spellbookBudgetFor(
  classData: ClassData | null | undefined,
  level: number
): SpellbookBudget | null {
  const name = classData?.name.toLowerCase() ?? "";
  const start = SPELLBOOK_START[name];
  if (!start) return null;
  const perLevel = 2;
  const ranked = start.ranked + Math.max(0, Math.floor(level) - 1) * perLevel;
  return {
    startingCantrips: start.cantrips,
    startingRanked: start.ranked,
    perLevel,
    cantrips: start.cantrips,
    ranked,
  };
}

/**
 * Compare the character's manually chosen book contents with the free
 * starting/level-up budget. Granted spells and paid Learn a Spell additions
 * are excluded from the free count.
 */
export function spellbookUsage(
  draft: CharacterDraft,
  classData: ClassData | null | undefined,
  spellMap: Record<string, Spell>,
  deity?: Pick<Deity, "domains" | "alternateDomains" | "font"> | null
): SpellbookUsage | null {
  const budget = spellbookBudgetFor(classData, draft.level);
  if (!budget) return null;
  const granted = selectedClassGrants(draft, classData, deity as Deity | null | undefined).spells;
  const grantedIds = new Set(granted.map((spell) => spell.id));
  const studious = studiousSlotInfoFor(draft, classData)?.spells ?? [];
  for (const spell of studious) {
    grantedIds.add(spell.id);
  }
  const grantedCantrips = [
    ...new Set(
      granted
        .filter((spell) => spell.rank === 0 && spell.kind !== "focusCantrip")
        .map((spell) => spell.id)
    ),
  ].length;
  const grantedRanked = [
    ...new Set([
      ...granted
        .filter((spell) => spell.rank > 0 && spell.kind !== "focus")
        .map((spell) => spell.id),
      ...studious.map((spell) => spell.id),
    ]),
  ].length;
  const learned = new Set(draft.spells.learned ?? []);
  const idsByKind = (ids: Iterable<string>) => {
    let cantrips = 0;
    let ranked = 0;
    let learnedCantrips = 0;
    let learnedRanked = 0;
    for (const id of new Set(ids)) {
      const spell = spellMap[id];
      if (!spell) continue;
      const rank = Number(spell.rank ?? 0);
      if (rank <= 0) {
        if (!grantedIds.has(id)) {
          if (learned.has(id)) learnedCantrips += 1;
          else cantrips += 1;
        }
      } else if (!grantedIds.has(id)) {
        if (learned.has(id)) learnedRanked += 1;
        else ranked += 1;
      }
    }
    return { cantrips, ranked, learnedCantrips, learnedRanked };
  };
  const cantripCounts = idsByKind(draft.spells.cantrips);
  const rankedCounts = idsByKind(sourceSpellIds(draft, classData));
  return {
    budget,
    freeCantrips: cantripCounts.cantrips,
    freeRanked: rankedCounts.ranked,
    learnedCantrips: cantripCounts.learnedCantrips,
    learnedRanked: rankedCounts.learnedRanked,
    grantedCantrips,
    grantedRanked,
    overCantrips: Math.max(0, cantripCounts.cantrips - budget.cantrips),
    overRanked: Math.max(0, rankedCounts.ranked - budget.ranked),
  };
}

type CantripContext = Pick<CharacterContext, "spells" | "deity" | "classData">;

/**
 * Cantrips this character can prepare from: the selected cantrip list plus
 * cantrips granted by a class choice (for example a wizard curriculum cantrip
 * or a bard muse cantrip).
 */
export function knownCantripIds(
  draft: Pick<CharacterDraft, "spells">,
  context: CantripContext
): string[] {
  const ids = new Set(draft.spells.cantrips);
  for (const grant of selectedClassGrants(draft as CharacterDraft, context.classData, context.deity)
    .spells) {
    if (grant.rank === 0 && grant.kind !== "focus") ids.add(grant.id);
  }
  return [...ids];
}

/**
 * Cantrips prepared for the day. Legacy drafts have no explicit prepared list;
 * they fall back to every known cantrip until the player runs daily
 * preparations, preserving old sheets.
 */
export function preparedCantripIds(
  draft: Pick<CharacterDraft, "spells">,
  context: CantripContext
): string[] {
  const known = knownCantripIds(draft, context);
  if (!isPreparedCasterClass(context.classData?.name)) return known;
  const prepared = draft.spells.preparedCantrips;
  if (prepared === null || prepared === undefined) return known;
  const knownSet = new Set(known);
  return prepared.filter((id) => knownSet.has(id));
}

export function isCantripPrepared(
  draft: Pick<CharacterDraft, "level" | "spells">,
  context: CantripContext,
  spellId: string
): boolean {
  if (!isPreparedCasterClass(context.classData?.name)) return true;
  if (preparedCantripIds(draft, context).includes(spellId)) return true;
  return apparitionCantripIds(draft, context).includes(spellId);
}

/**
 * Whether a prepared caster can add another copy of this cantrip today. The
 * wizard's extra curriculum cantrip is allowed beyond the normal five; all
 * other prepared classes are capped by PREPARED_CANTRIP_LIMITS.
 */
export function canPrepareCantrip(
  draft: Pick<CharacterDraft, "spells">,
  context: CantripContext,
  spell: Pick<Spell, "id" | "rank">
): boolean {
  if (!isPreparedCasterClass(context.classData?.name)) return false;
  if (spell.rank !== 0) return false;
  const known = knownCantripIds(draft, context);
  if (!known.includes(spell.id)) return false;
  const current = preparedCantripIds(draft, context);
  if (current.includes(spell.id)) return false;

  const baseLimit = cantripPreparedLimitFor(context.classData) ?? 0;
  if (current.length >= baseLimit) {
    const curriculum = new Set(
      selectedClassGrants(draft as CharacterDraft, context.classData, context.deity)
        .spells.filter((grant) => grant.rank === 0 && grant.kind === "curriculum")
        .map((grant) => grant.id)
    );
    const wizardExtra =
      context.classData?.name.toLowerCase() === "wizard" &&
      curriculum.size > 0 &&
      curriculum.has(spell.id) &&
      current.length < baseLimit + 1;
    if (!wizardExtra) return false;
  }
  return true;
}

export function addPreparedCantrip(
  draft: CharacterDraft,
  context: CantripContext,
  spellId: string
): CharacterDraft {
  const current = preparedCantripIds(draft, context);
  if (current.includes(spellId)) return draft;
  return {
    ...draft,
    spells: {
      ...draft.spells,
      preparedCantrips: [...current, spellId],
    },
  };
}

export function removePreparedCantrip(
  draft: CharacterDraft,
  context: CantripContext,
  spellId: string
): CharacterDraft {
  const prepared = draft.spells.preparedCantrips;
  if (prepared === null || prepared === undefined) {
    const known = knownCantripIds(draft, context);
    if (!known.includes(spellId)) return draft;
    return {
      ...draft,
      spells: {
        ...draft.spells,
        preparedCantrips: known.filter((id) => id !== spellId),
      },
    };
  }
  if (!prepared.includes(spellId)) return draft;
  return {
    ...draft,
    spells: {
      ...draft.spells,
      preparedCantrips: prepared.filter((id) => id !== spellId),
    },
  };
}

/**
 * Magus studious slots: two special slots from 7th level, becoming 3rd rank at
 * 11th and 4th rank at 13th. Only Gecko Grip, Haste, Fly, and the chosen hybrid
 * study's studious spells can be prepared in them.
 */
export function studiousSlotInfoFor(
  draft: Pick<CharacterDraft, "level" | "classChoices">,
  classData: ClassData | null | undefined
): StudiousSlotInfo | null {
  if (classData?.name.toLowerCase() !== "magus" || draft.level < 7) return null;
  const rank = draft.level >= 13 ? 4 : draft.level >= 11 ? 3 : 2;
  const group = classData.choiceGroups.find((entry) => entry.tag === "magus-hybrid-study");
  const chosen = group ? (draft.classChoices[group.key]?.[0] ?? null) : null;
  const hybrid = chosen ? MAGUS_STUDIOUS_BY_STUDY[chosen] : undefined;
  const spells: StudiousSlotSpell[] = [];
  for (const entry of MAGUS_STUDIOUS_BASE) {
    if (entry.level <= draft.level) spells.push(entry.spell);
  }
  for (const tier of ["7", "11", "13"] as const) {
    const spell = hybrid?.[tier];
    if (spell && Number(tier) <= draft.level) spells.push(spell);
  }
  const unique = [...new Map(spells.map((spell) => [spell.id, spell])).values()].filter(
    (spell) => spell.rank <= rank
  );
  return { rank, count: 2, spells: unique };
}

export function canPrepareStudiousSpell(
  draft: Pick<CharacterDraft, "level" | "classChoices" | "spells">,
  classData: ClassData | null | undefined,
  spellId: string
): boolean {
  const info = studiousSlotInfoFor(draft, classData);
  if (!info) return false;
  if (!info.spells.some((spell) => spell.id === spellId)) return false;
  return draft.spells.studiousPrepared.length < info.count;
}

export function addStudiousSpell(
  draft: CharacterDraft,
  classData: ClassData | null | undefined,
  spellId: string
): CharacterDraft {
  if (!canPrepareStudiousSpell(draft, classData, spellId)) return draft;
  return {
    ...draft,
    spells: {
      ...draft.spells,
      studiousPrepared: [...draft.spells.studiousPrepared, spellId],
    },
  };
}

export function removeStudiousSpell(
  draft: CharacterDraft,
  classData: ClassData | null | undefined,
  spellId: string
): CharacterDraft {
  const info = studiousSlotInfoFor(draft, classData);
  if (!info) return draft;
  const prepared = [...draft.spells.studiousPrepared];
  const index = prepared.lastIndexOf(spellId);
  if (index < 0) return draft;
  prepared.splice(index, 1);
  const copies = prepared.filter((id) => id === spellId).length;
  const used = { ...draft.spells.studiousUsed };
  if (copies === 0) delete used[spellId];
  else if ((used[spellId] ?? 0) > copies) used[spellId] = copies;
  return {
    ...draft,
    spells: {
      ...draft.spells,
      studiousPrepared: prepared,
      studiousUsed: used,
    },
  };
}

/**
 * Resolve the curated apparition spell names against the compendium. The
 * index is cached per compendium spell record, which is stable for a session.
 */
const apparitionSpellIndexes = new WeakMap<Record<string, Spell>, Map<string, Spell>>();

function apparitionSpellKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function apparitionSpellIndex(spells: Record<string, Spell>): Map<string, Spell> {
  const cached = apparitionSpellIndexes.get(spells);
  if (cached) return cached;
  const index = new Map<string, Spell>();
  for (const spell of Object.values(spells)) {
    index.set(apparitionSpellKey(spell.name), spell);
  }
  apparitionSpellIndexes.set(spells, index);
  return index;
}

/**
 * The animist's attuned apparitions and their repertoire. Prepared animist
 * spells use ordinary prepared slots; these spells use their own spontaneous
 * apparition slots and never mix with the prepared pool.
 */
export function animistApparitionInfo(
  draft: Pick<CharacterDraft, "level" | "spells">,
  context: Pick<CharacterContext, "spells" | "classData">
): AnimistApparitionInfo | null {
  if (context.classData?.name.toLowerCase() !== "animist") return null;
  const level = Math.max(1, Math.min(20, Math.floor(draft.level || 1)));
  const slots = animistApparitionSlots(level);
  const maxRank = slots.length;
  const index = apparitionSpellIndex(context.spells);
  const resolve = (name: string): Spell | null => index.get(apparitionSpellKey(name)) ?? null;

  const attuned: AttunedApparition[] = [];
  const selected = draft.spells.attunedApparitions ?? [];
  for (const id of selected) {
    const definition = APPARITION_BY_ID.get(id);
    if (!definition) continue;
    const cantrip = resolve(definition.spells.find((entry) => entry.rank === 0)?.name ?? "");
    const spells = definition.spells
      .filter((entry) => entry.rank > 0 && entry.rank <= maxRank)
      .map((entry) => resolve(entry.name))
      .filter((spell): spell is Spell => Boolean(spell))
      .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
    attuned.push({
      id: definition.id,
      name: definition.name,
      skills: definition.skills,
      cantrip,
      spells,
      vesselSpell: resolve(definition.vesselSpell),
    });
  }

  const primary = draft.spells.primaryApparition;
  const primaryId =
    primary && attuned.some((entry) => entry.id === primary) ? primary : (attuned[0]?.id ?? null);

  const byId = new Map<string, ApparitionSpell>();
  for (const apparition of attuned) {
    const available = [...(apparition.cantrip ? [apparition.cantrip] : []), ...apparition.spells];
    for (const spell of available) {
      if (byId.has(spell.id)) continue;
      byId.set(spell.id, {
        apparitionId: apparition.id,
        apparitionName: apparition.name,
        spell,
      });
    }
  }
  const repertoire = [...byId.values()].sort(
    (a, b) => a.spell.rank - b.spell.rank || a.spell.name.localeCompare(b.spell.name)
  );

  return {
    slots,
    maxAttuned: animistApparitionLimit(level),
    primaryId,
    attuned,
    repertoire,
  };
}

/** Whether another apparition can be attuned during daily preparations. */
export function canAttuneApparition(
  draft: Pick<CharacterDraft, "level" | "spells">,
  classData: ClassData | null | undefined,
  apparitionId: string
): boolean {
  if (classData?.name.toLowerCase() !== "animist") return false;
  if (!APPARITION_BY_ID.has(apparitionId)) return false;
  if (draft.spells.attunedApparitions.includes(apparitionId)) return false;
  return draft.spells.attunedApparitions.length < animistApparitionLimit(draft.level);
}

export function addAttunedApparition(
  draft: CharacterDraft,
  classData: ClassData | null | undefined,
  apparitionId: string
): CharacterDraft {
  if (!canAttuneApparition(draft, classData, apparitionId)) return draft;
  const attuned = [...draft.spells.attunedApparitions, apparitionId];
  return {
    ...draft,
    spells: {
      ...draft.spells,
      attunedApparitions: attuned,
      primaryApparition: draft.spells.primaryApparition ?? apparitionId,
    },
  };
}

export function removeAttunedApparition(
  draft: CharacterDraft,
  classData: ClassData | null | undefined,
  apparitionId: string
): CharacterDraft {
  if (classData?.name.toLowerCase() !== "animist") return draft;
  if (!draft.spells.attunedApparitions.includes(apparitionId)) return draft;
  const attuned = draft.spells.attunedApparitions.filter((id) => id !== apparitionId);
  return {
    ...draft,
    spells: {
      ...draft.spells,
      attunedApparitions: attuned,
      primaryApparition:
        draft.spells.primaryApparition === apparitionId
          ? (attuned[0] ?? null)
          : draft.spells.primaryApparition,
    },
  };
}

export function setPrimaryApparition(
  draft: CharacterDraft,
  classData: ClassData | null | undefined,
  apparitionId: string | null
): CharacterDraft {
  if (classData?.name.toLowerCase() !== "animist") return draft;
  if (apparitionId && !draft.spells.attunedApparitions.includes(apparitionId)) return draft;
  return {
    ...draft,
    spells: { ...draft.spells, primaryApparition: apparitionId },
  };
}

/** Cantrips granted by attuned apparitions; these are castable at will. */
export function apparitionCantripIds(
  draft: Pick<CharacterDraft, "level" | "spells">,
  context: Pick<CharacterContext, "spells" | "classData">
): string[] {
  return (
    animistApparitionInfo(draft, context)
      ?.repertoire.filter((entry) => entry.spell.rank === 0)
      .map((entry) => entry.spell.id) ?? []
  );
}

/** Heal/Harm are the only spells a cleric's divine font can prepare. */
export function isFontSpell(spell: Spell, deity: Deity | null | undefined): boolean {
  const name = spell.name.trim().toLowerCase();
  if (name !== "heal" && name !== "harm") return false;
  const font = (deity?.font ?? []).map((value) => value.toLowerCase());
  return font.length === 0 || font.includes(name);
}

export type DivineFontChoice = "heal" | "harm";

/** Font spells this deity allows. A deity without font data is treated as dual. */
export function deityFontChoices(deity: Deity | null | undefined): DivineFontChoice[] {
  const font = (deity?.font ?? [])
    .map((value) => value.trim().toLowerCase())
    .filter((value): value is DivineFontChoice => value === "heal" || value === "harm");
  return font.length ? [...new Set(font)] : ["heal", "harm"];
}

/** True when this spell is the copy that can occupy divine font slots. */
export function isChosenFontSpell(
  spell: Spell,
  deity: Deity | null | undefined,
  choice: DivineFontChoice | null
): boolean {
  const choices = deityFontChoices(deity);
  const selected =
    choices.length === 1 ? choices[0]! : choice && choices.includes(choice) ? choice : null;
  return selected !== null && spell.name.trim().toLowerCase() === selected;
}

function preparedFontCandidates(
  draft: CharacterDraft,
  spells: Record<string, Spell>,
  fontRank: number,
  deity: Deity | null | undefined
): Set<DivineFontChoice> {
  const explicit = hasExplicitPreparedMap(draft);
  const ids = explicit ? (explicit[String(fontRank)] ?? []) : draft.spells.prepared;
  const out = new Set<DivineFontChoice>();
  for (const id of ids) {
    const spell = spells[id];
    if (!spell) continue;
    if (!explicit && spell.rank !== fontRank) continue;
    if (!isFontSpell(spell, deity)) continue;
    const name = spell.name.trim().toLowerCase();
    if (name === "heal" || name === "harm") out.add(name);
  }
  return out;
}

/**
 * The font spell locked in by the player, inferred from today's prepared
 * copies for legacy drafts, or null when a dual-font deity still needs a pick.
 */
export function effectiveFontChoice(
  draft: CharacterDraft,
  context: Pick<CharacterContext, "spells" | "deity" | "classData">
): DivineFontChoice | null {
  const font = divineFontInfo(draft.level, context.classData?.name);
  if (!font) return null;
  const choices = deityFontChoices(context.deity);
  if (choices.length === 1) return choices[0]!;
  const stored = draft.spells.fontChoice;
  if (stored && choices.includes(stored)) return stored;
  const candidates = preparedFontCandidates(draft, context.spells, font.rank, context.deity);
  return candidates.size === 1 ? [...candidates][0]! : null;
}

export interface PreparedEntry {
  id: string;
  /** The rank of the slot the copy occupies, not the spell's base rank. */
  rank: number;
  font: boolean;
}

export interface PreparedRankSummary {
  total: number;
  font: number;
  ordinary: number;
  ids: string[];
}

function hasExplicitPreparedMap(draft: CharacterDraft): PreparedSpellsByRank | null {
  const byRank = draft.spells.preparedByRank ?? {};
  if (!Object.keys(byRank).length) return null;
  if (!draft.spells.prepared.length) return byRank;
  return samePreparedMultiset(flattenPreparedByRank(byRank), draft.spells.prepared) ? byRank : null;
}

function expandExplicitPrepared(
  byRank: PreparedSpellsByRank,
  spells: Record<string, Spell>,
  deity: Deity | null | undefined,
  font: { slots: number; rank: number } | null,
  fontChoice: DivineFontChoice | null
): PreparedEntry[] {
  const entries: PreparedEntry[] = [];
  const ranks = Object.keys(byRank)
    .map(Number)
    .filter((rank) => Number.isInteger(rank) && rank >= 1 && rank <= 10)
    .sort((a, b) => a - b);
  for (const rank of ranks) {
    let fontLeft = font && rank === font.rank ? font.slots : 0;
    for (const id of byRank[String(rank)] ?? []) {
      const spell = spells[id];
      const isFont = Boolean(
        font &&
        fontLeft > 0 &&
        rank === font.rank &&
        spell &&
        isChosenFontSpell(spell, deity, fontChoice)
      );
      if (isFont) fontLeft -= 1;
      entries.push({ id, rank, font: isFont });
    }
  }
  return entries;
}

function inferLegacyPrepared(
  prepared: string[],
  spells: Record<string, Spell>,
  deity: Deity | null | undefined,
  font: { slots: number; rank: number } | null,
  fontChoice: DivineFontChoice | null
): PreparedEntry[] {
  const entries: PreparedEntry[] = [];
  let fontLeft = font?.slots ?? 0;
  for (const id of prepared) {
    const spell = spells[id];
    if (!spell || spell.rank <= 0) continue;
    // A flat legacy list has no slot rank. Only a base rank equal to the font
    // rank is unambiguously a divine font copy.
    const isFont = Boolean(
      font &&
      fontLeft > 0 &&
      spell.rank === font.rank &&
      isChosenFontSpell(spell, deity, fontChoice)
    );
    if (isFont) fontLeft -= 1;
    entries.push({ id, rank: isFont ? font!.rank : spell.rank, font: isFont });
  }
  return entries;
}

/** Effective prepared copies, using explicit ranks when available. */
export function preparedEntries(
  draft: CharacterDraft,
  context: Pick<CharacterContext, "spells" | "deity" | "classData">
): PreparedEntry[] {
  const font = divineFontInfo(draft.level, context.classData?.name);
  const fontChoice = effectiveFontChoice(draft, context);
  const explicit = hasExplicitPreparedMap(draft);
  return explicit
    ? expandExplicitPrepared(explicit, context.spells, context.deity, font, fontChoice)
    : inferLegacyPrepared(draft.spells.prepared, context.spells, context.deity, font, fontChoice);
}

export function preparedUsedKey(rank: number, spellId: string): string {
  return `${rank}:${spellId}`;
}

export function preparedRankSummaries(entries: PreparedEntry[]): Map<number, PreparedRankSummary> {
  const out = new Map<number, PreparedRankSummary>();
  for (const entry of entries) {
    const row = out.get(entry.rank) ?? { total: 0, font: 0, ordinary: 0, ids: [] };
    row.total += 1;
    row.ids.push(entry.id);
    if (entry.font) row.font += 1;
    else row.ordinary += 1;
    out.set(entry.rank, row);
  }
  return out;
}

/** Materialize inferred ranks into the explicit map (used on first builder edit). */
export function preparedByRankForDraft(
  draft: CharacterDraft,
  context: Pick<CharacterContext, "spells" | "deity" | "classData">
): PreparedSpellsByRank {
  const explicit = hasExplicitPreparedMap(draft);
  if (explicit) {
    return Object.fromEntries(Object.entries(explicit).map(([rank, ids]) => [rank, [...ids]]));
  }
  const out: PreparedSpellsByRank = {};
  for (const entry of inferLegacyPrepared(
    draft.spells.prepared,
    context.spells,
    context.deity,
    divineFontInfo(draft.level, context.classData?.name),
    effectiveFontChoice(draft, context)
  )) {
    (out[String(entry.rank)] ??= []).push(entry.id);
  }
  return out;
}

export function addPreparedCopy(
  draft: CharacterDraft,
  context: Pick<CharacterContext, "spells" | "deity" | "classData">,
  spellId: string,
  rank: number
): CharacterDraft {
  const nextRank = Math.max(1, Math.min(10, Math.floor(rank)));
  const byRank = preparedByRankForDraft(draft, context);
  byRank[String(nextRank)] = [...(byRank[String(nextRank)] ?? []), spellId];
  return {
    ...draft,
    spells: {
      ...draft.spells,
      preparedByRank: byRank,
      prepared: flattenPreparedByRank(byRank),
    },
  };
}

export function removePreparedCopy(
  draft: CharacterDraft,
  context: Pick<CharacterContext, "spells" | "deity" | "classData">,
  spellId: string,
  rank: number
): CharacterDraft {
  const key = String(Math.max(1, Math.min(10, Math.floor(rank))));
  const byRank = preparedByRankForDraft(draft, context);
  const list = [...(byRank[key] ?? [])];
  const index = list.lastIndexOf(spellId);
  if (index < 0) return draft;
  list.splice(index, 1);
  if (list.length) byRank[key] = list;
  else delete byRank[key];
  const preparedUsed = { ...draft.spells.preparedUsed };
  if (!list.length) delete preparedUsed[preparedUsedKey(Number(key), spellId)];
  return {
    ...draft,
    spells: {
      ...draft.spells,
      preparedByRank: byRank,
      prepared: flattenPreparedByRank(byRank),
      preparedUsed,
    },
  };
}

/** Remove every prepared copy of a spell, across ranks and the legacy mirror. */
export function removePreparedSpellEverywhere(
  draft: CharacterDraft,
  spellId: string
): CharacterDraft {
  const existing = draft.spells.preparedByRank ?? {};
  const preparedUsed = Object.fromEntries(
    Object.entries(draft.spells.preparedUsed).filter(([key]) => !key.endsWith(`:${spellId}`))
  );
  const fontUsed = { ...draft.spells.fontUsed };
  delete fontUsed[spellId];
  if (!Object.keys(existing).length) {
    return {
      ...draft,
      spells: {
        ...draft.spells,
        prepared: draft.spells.prepared.filter((id) => id !== spellId),
        preparedByRank: {},
        preparedUsed,
        fontUsed,
      },
    };
  }
  const byRank: PreparedSpellsByRank = {};
  for (const [rank, ids] of Object.entries(existing)) {
    const next = ids.filter((id) => id !== spellId);
    if (next.length) byRank[rank] = next;
  }
  return {
    ...draft,
    spells: {
      ...draft.spells,
      preparedByRank: byRank,
      prepared: flattenPreparedByRank(byRank),
      preparedUsed,
      fontUsed,
    },
  };
}

/**
 * Ranks at which a spontaneous caster knows a spell. Legacy drafts fall back
 * to the spell's printed rank; knownRanks only stores extra learned ranks.
 */
export function knownSpellRanks(
  draft: Pick<CharacterDraft, "spells">,
  spell: Pick<Spell, "id" | "rank">
): number[] {
  if (spell.rank <= 0) return [0];
  const stored = draft.spells.knownRanks?.[spell.id] ?? [];
  const ranks = [...new Set(stored)].filter((rank) => rank >= spell.rank && rank <= 10);
  return ranks.length ? ranks.sort((a, b) => a - b) : [spell.rank];
}

/** Learn a spontaneous spell at a specific rank (or add another rank copy). */
export function addKnownSpellAtRank(
  draft: CharacterDraft,
  spell: Pick<Spell, "id" | "rank">,
  rank: number
): CharacterDraft {
  if (spell.rank <= 0) return draft;
  if (!Number.isInteger(rank) || rank < spell.rank || rank > 10) return draft;
  const isKnown = draft.spells.known.includes(spell.id);
  const current = isKnown ? knownSpellRanks(draft, spell) : [];
  if (current.includes(rank)) return draft;
  return {
    ...draft,
    spells: {
      ...draft.spells,
      known: isKnown ? draft.spells.known : [...draft.spells.known, spell.id],
      knownRanks: {
        ...draft.spells.knownRanks,
        [spell.id]: [...current, rank].sort((a, b) => a - b),
      },
    },
  };
}

/**
 * Remove one learned rank of a spontaneous spell. Removing the last rank also
 * removes the spell from the repertoire and clears its signature flag.
 */
export function removeKnownSpellAtRank(
  draft: CharacterDraft,
  spell: Pick<Spell, "id" | "rank">,
  rank: number
): CharacterDraft {
  if (spell.rank <= 0) return draft;
  const current = knownSpellRanks(draft, spell);
  if (!current.includes(rank)) return draft;
  const remaining = current.filter((entry) => entry !== rank);
  const knownRanks = { ...draft.spells.knownRanks };
  if (remaining.length) {
    knownRanks[spell.id] = remaining;
  } else {
    delete knownRanks[spell.id];
  }
  return {
    ...draft,
    spells: {
      ...draft.spells,
      known:
        remaining.length > 0
          ? draft.spells.known
          : draft.spells.known.filter((id) => id !== spell.id),
      knownRanks,
      signature:
        remaining.length > 0
          ? draft.spells.signature
          : draft.spells.signature.filter((id) => id !== spell.id),
    },
  };
}

/** Whether a spontaneous spell is known at this rank. */
export function knowsSpellAtRank(
  draft: Pick<CharacterDraft, "spells">,
  spell: Pick<Spell, "id" | "rank">,
  rank: number
): boolean {
  return knownSpellRanks(draft, spell).includes(rank);
}

/** Ordinary prepared slots available at one rank, excluding the divine font. */
export function ordinaryPreparedLimitAt(
  draft: CharacterDraft,
  derived: Pick<DerivedCharacter, "spellSlots" | "divineFontSlots" | "divineFontRank">,
  classData: ClassData | null | undefined,
  rank: number
): number {
  const caster = casterInfo(classData);
  const ordinarySlots = ordinarySpellSlotsFor(draft.level, caster.progression, classData?.name);
  const fontAtRank = derived.divineFontRank === rank ? (derived.divineFontSlots ?? 0) : 0;
  return (
    ordinarySlots?.[rank - 1] ?? Math.max(0, (derived.spellSlots?.[rank - 1] ?? 0) - fontAtRank)
  );
}

/**
 * Whether another prepared copy of this spell fits at this rank. Mirrors the
 * builder's preparation rules, including the wizard curriculum slot and the
 * cleric divine font.
 */
export function canPrepareSpellAtRank(
  draft: CharacterDraft,
  derived: Pick<
    DerivedCharacter,
    "spellSlots" | "divineFontSlots" | "divineFontRank" | "maxSpellRank" | "grantedSpells"
  >,
  context: Pick<CharacterContext, "spells" | "deity" | "classData">,
  spell: Spell,
  rank: number
): boolean {
  if (!Number.isInteger(rank) || rank < Math.max(1, spell.rank) || rank > derived.maxSpellRank) {
    return false;
  }
  // Cantrips and focus spells never occupy spell slots.
  if (spell.rank === 0 || spell.traits.includes("focus")) return false;
  const entries = preparedEntries(draft, context);
  const summary = preparedRankSummaries(entries).get(rank);
  const totalCount = summary?.total ?? 0;
  const ordinaryCount = summary?.ordinary ?? 0;
  const fontCount = summary?.font ?? 0;
  const ordinaryLimit = ordinaryPreparedLimitAt(draft, derived, context.classData, rank);
  const curriculumIds = new Set(
    derived.grantedSpells.filter((entry) => entry.kind === "curriculum").map((entry) => entry.id)
  );
  const curriculumRanks = new Set(
    derived.grantedSpells
      .filter((entry) => entry.kind === "curriculum" && entry.rank > 0)
      .map((entry) => entry.rank)
  );
  const wizardCurriculum = context.classData?.name.toLowerCase() === "wizard";

  if (wizardCurriculum && curriculumRanks.has(rank)) {
    if (curriculumIds.has(spell.id)) return totalCount < ordinaryLimit;
    const nonCurriculum = entries.filter(
      (entry) => entry.rank === rank && !curriculumIds.has(entry.id)
    ).length;
    return totalCount < ordinaryLimit && nonCurriculum < Math.max(0, ordinaryLimit - 1);
  }

  const fontRank = derived.divineFontRank;
  const fontSlots = derived.divineFontSlots ?? 0;
  const fontChoice = effectiveFontChoice(draft, context);
  const fontRoom =
    fontRank === rank &&
    isFontSpell(spell, context.deity) &&
    (fontChoice === null || isChosenFontSpell(spell, context.deity, fontChoice)) &&
    fontCount < fontSlots;
  return fontRoom || ordinaryCount < ordinaryLimit;
}

/**
 * Add one prepared copy and lock in the divine font choice when a dual-font
 * cleric prepares their first Heal or Harm at the font rank.
 */
export function addPreparedSpellCopy(
  draft: CharacterDraft,
  context: Pick<CharacterContext, "spells" | "deity" | "classData">,
  spell: Spell,
  rank: number
): CharacterDraft {
  const font = divineFontInfo(draft.level, context.classData?.name);
  const choices = deityFontChoices(context.deity);
  const name = spell.name.trim().toLowerCase();
  let chosenFont: DivineFontChoice | null = null;
  if (
    font &&
    font.slots > 0 &&
    font.rank === rank &&
    isFontSpell(spell, context.deity) &&
    (name === "heal" || name === "harm")
  ) {
    const existing = effectiveFontChoice(draft, context);
    chosenFont =
      existing ?? (choices.length > 1 ? (name as DivineFontChoice) : (choices[0] ?? null));
  }
  const next = addPreparedCopy(draft, context, spell.id, rank);
  if (!chosenFont || draft.spells.fontChoice) return next;
  return {
    ...next,
    spells: { ...next.spells, fontChoice: chosenFont },
  };
}

export function preparedSlotSplits(
  prepared: string[],
  spells: Record<string, Spell>,
  deity: Deity | null | undefined,
  fontRank: number | null,
  fontSlots: number
): Map<number, { total: number; font: number }> {
  const splits = new Map<number, { total: number; font: number }>();
  for (const id of prepared) {
    const spell = spells[id];
    if (!spell || spell.rank <= 0) continue;
    const entry = splits.get(spell.rank) ?? { total: 0, font: 0 };
    entry.total += 1; // Duplicate preparations each occupy a slot.
    if (spell.rank === fontRank && isFontSpell(spell, deity)) entry.font += 1;
    splits.set(spell.rank, entry);
  }
  for (const entry of splits.values()) entry.font = Math.min(entry.font, fontSlots);
  return splits;
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
    ancestrySize: null,
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
      classSkills: [],
      backgroundLore: [],
    },
    abpSkill: null,
    abpApex: null,
    feats: {
      ancestry: {},
      class: {},
      skill: {},
      general: {},
      freeArchetype: {},
      extras: [],
    },
    classChoices: {},
    grantChoices: {},
    featChoices: {},
    spells: {
      tradition: null,
      cantrips: [],
      known: [],
      spellbook: [],
      learned: [],
      knownRanks: {},
      prepared: [],
      preparedByRank: {},
      preparedCantrips: [],
      studiousPrepared: [],
      studiousUsed: {},
      attunedApparitions: [],
      primaryApparition: null,
      apparitionUsed: {},
      focus: [],
      divineFontUsed: 0,
      fontChoice: null,
      slotsUsed: {},
      preparedUsed: {},
      fontUsed: {},
      signature: [],
      rituals: [],
      multiclassCantrips: [],
      multiclassSpells: [],
      multiclassSlotsUsed: {},
      multiclassTradition: null,
      innate: [],
      innateUsed: {},
      innateMax: {},
      preparationsPending: false,
    },
    equipment: [],
    customItems: [],
    companions: [],
    currency: { gp: 0, sp: 0, cp: 0 },
    wealthBudgetCp: startingWealthCp(1),
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
      afflictions: [],
      persistentDamage: [],
      fastHealing: 0,
      fastHealingActive: true,
      fastHealingNote: "",
      regeneration: 0,
      regenerationActive: true,
      regenerationNote: "",
      regenerationDeactivatedBy: [],
      sustainedSpells: [],
      treatWoundsImmune: false,
      battleMedicineImmuneBy: [],
      xp: 0,
      shieldRaised: false,
    },
  };
}

export function flattenPreparedByRank(byRank: PreparedSpellsByRank): string[] {
  return Object.keys(byRank)
    .map(Number)
    .filter((rank) => Number.isInteger(rank) && rank >= 1 && rank <= 10)
    .sort((a, b) => a - b)
    .flatMap((rank) => byRank[String(rank)] ?? []);
}

export function samePreparedMultiset(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const counts = new Map<string, number>();
  for (const id of a) counts.set(id, (counts.get(id) ?? 0) + 1);
  for (const id of b) {
    const next = (counts.get(id) ?? 0) - 1;
    if (next < 0) return false;
    counts.set(id, next);
  }
  return true;
}

function normalizePreparedByRankValue(value: unknown): PreparedSpellsByRank | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out: PreparedSpellsByRank = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const rank = Number(key);
    if (!Number.isInteger(rank) || rank < 1 || rank > 10) continue;
    const ids = Array.isArray(raw) ? raw.filter((id): id is string => typeof id === "string") : [];
    if (ids.length) out[String(rank)] = ids;
  }
  return Object.keys(out).length ? out : null;
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
    levels[key] = arr<AbilityKey | null>(levelsRaw[key])
      .slice(0, 4)
      .map((x) => (x && ABILITIES.includes(x) ? x : null));
  }
  const skills = obj(raw.skills);
  const feats = obj(raw.feats);
  const spells = obj(raw.spells);
  const prepared = arr<string>(spells.prepared).filter((x) => typeof x === "string");
  const rankMap = normalizePreparedByRankValue(spells.preparedByRank);
  const rankedFlat = rankMap ? flattenPreparedByRank(rankMap) : [];
  const finalPrepared = prepared.length ? prepared : rankedFlat;
  const preparedByRank =
    rankMap && (prepared.length === 0 || samePreparedMultiset(prepared, rankedFlat)) ? rankMap : {};
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
  const grantChoicesRaw = obj(raw.grantChoices);
  const grantChoices: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(grantChoicesRaw))
    grantChoices[key] = arr<string>(value).filter((x) => typeof x === "string");
  const featChoicesRaw = obj(raw.featChoices);
  const featChoices: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(featChoicesRaw))
    featChoices[key] = arr<string>(value).filter((x) => typeof x === "string");

  type NormalizedEquipment = {
    itemId: string;
    quantity: number;
    equipped: boolean;
    invested: boolean;
    usesUsed: number;
    usesMax?: number;
    usesKind?: "daily" | "charges";
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
      existing.usesUsed = Math.max(
        existing.usesUsed,
        Math.max(0, Math.floor(num(item.usesUsed, 0)))
      );
      if (typeof item.usesMax === "number" && Number.isFinite(item.usesMax)) {
        existing.usesMax = Math.max(0, Math.min(999, Math.floor(item.usesMax)));
      }
      if (item.usesKind === "daily" || item.usesKind === "charges") {
        existing.usesKind = item.usesKind;
      }
      existing.runes = [...new Set([...existing.runes, ...runes])].slice(0, 12);
    } else {
      equipmentMap.set(itemId, {
        itemId,
        quantity: Math.max(1, Math.floor(num(item.quantity, 1))),
        equipped: Boolean(item.equipped),
        invested: Boolean(item.invested),
        usesUsed: Math.max(0, Math.min(999, Math.floor(num(item.usesUsed, 0)))),
        ...(typeof item.usesMax === "number" && Number.isFinite(item.usesMax)
          ? { usesMax: Math.max(0, Math.min(999, Math.floor(item.usesMax))) }
          : {}),
        ...(item.usesKind === "daily" || item.usesKind === "charges"
          ? { usesKind: item.usesKind as "daily" | "charges" }
          : {}),
        runes,
      });
    }
  }
  const equipmentEntries = [...equipmentMap.values()];
  const customItemIds = new Set<string>();
  const customItems: CharacterCustomItem[] = [];
  for (const item of arr<Record<string, unknown>>(raw.customItems)) {
    if (!item || typeof item.id !== "string" || !item.id.startsWith("custom:")) continue;
    const id = item.id.slice(0, 120);
    if (customItemIds.has(id)) continue;
    const name = str(item.name).trim().slice(0, 120);
    if (!name) continue;
    customItemIds.add(id);
    customItems.push({
      id,
      name,
      description: str(item.description).slice(0, 4000),
    });
  }

  return {
    version: 1,
    name: str(raw.name, fallbackName).slice(0, 120) || fallbackName,
    level: Math.max(1, Math.min(20, Math.floor(num(raw.level, 1)))),
    contentMode: raw.contentMode === "expanded" ? "expanded" : "core",
    includeLegacy: raw.includeLegacy === true,
    ancestryId: typeof raw.ancestryId === "string" ? raw.ancestryId : null,
    ancestrySize: typeof raw.ancestrySize === "string" ? raw.ancestrySize : null,
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
    abpSkill: SKILLS.some((skill) => skill.id === raw.abpSkill) ? (raw.abpSkill as SkillId) : null,
    abpApex: ABILITIES.includes(raw.abpApex as AbilityKey) ? (raw.abpApex as AbilityKey) : null,
    skills: {
      trained: arr<string>(skills.trained).filter((x) => typeof x === "string"),
      increases,
      lore: arr<string>(skills.lore).filter((x) => typeof x === "string"),
      background: arr<string>(skills.background).filter((x) => typeof x === "string"),
      classSkills: arr<string>(skills.classSkills).filter((x) => typeof x === "string"),
      backgroundLore: arr<string>(skills.backgroundLore).filter((x) => typeof x === "string"),
    },
    feats: {
      ancestry: featRecord(feats.ancestry),
      class: featRecord(feats.class),
      skill: featRecord(feats.skill),
      general: featRecord(feats.general),
      freeArchetype: featRecord(feats.freeArchetype),
      extras: arr<string>(feats.extras).filter((x) => typeof x === "string"),
    },
    classChoices,
    grantChoices,
    featChoices,
    spells: {
      tradition: TRADITIONS.includes(spells.tradition as SpellTradition)
        ? (spells.tradition as SpellTradition)
        : null,
      cantrips: arr<string>(spells.cantrips).filter((x) => typeof x === "string"),
      known: arr<string>(spells.known).filter((x) => typeof x === "string"),
      spellbook: arr<string>(spells.spellbook).filter((x) => typeof x === "string"),
      learned: [
        ...new Set(
          arr<string>(spells.learned).filter(
            (x) =>
              typeof x === "string" &&
              (arr<string>(spells.known).includes(x) || arr<string>(spells.spellbook).includes(x))
          )
        ),
      ].slice(0, 200),
      knownRanks: Object.fromEntries(
        Object.entries(obj(spells.knownRanks))
          .filter(([, value]) => Array.isArray(value))
          .map(([key, value]) => [
            key,
            [
              ...new Set(
                (value as unknown[])
                  .filter(
                    (rank): rank is number =>
                      typeof rank === "number" &&
                      Number.isFinite(rank) &&
                      Number.isInteger(rank) &&
                      rank >= 1 &&
                      rank <= 10
                  )
                  .map((rank) => rank)
              ),
            ].sort((a, b) => a - b),
          ])
          .filter(([, ranks]) => (ranks as number[]).length > 0)
      ) as Record<string, number[]>,
      prepared: finalPrepared,
      preparedByRank,
      preparedCantrips: Array.isArray(spells.preparedCantrips)
        ? [...new Set(arr<string>(spells.preparedCantrips).filter((x) => typeof x === "string"))]
        : null,
      studiousPrepared: arr<string>(spells.studiousPrepared)
        .filter((x) => typeof x === "string")
        .slice(0, 10),
      studiousUsed: Object.fromEntries(
        Object.entries(obj(spells.studiousUsed))
          .filter(([, value]) => typeof value === "number" && Number.isFinite(value))
          .map(([key, value]) => [key, Math.max(0, Math.floor(value as number))])
      ) as Record<string, number>,
      attunedApparitions: [
        ...new Set(
          arr<string>(spells.attunedApparitions).filter(
            (id) => typeof id === "string" && APPARITION_BY_ID.has(id)
          )
        ),
      ].slice(0, 8),
      primaryApparition:
        typeof spells.primaryApparition === "string" ? spells.primaryApparition : null,
      apparitionUsed: Object.fromEntries(
        Object.entries(obj(spells.apparitionUsed))
          .filter(
            ([key, value]) =>
              /^\d+$/.test(key) &&
              Number(key) >= 1 &&
              Number(key) <= 10 &&
              typeof value === "number" &&
              Number.isFinite(value)
          )
          .map(([key, value]) => [key, Math.max(0, Math.min(20, Math.floor(value as number)))])
      ) as Record<string, number>,
      focus: arr<string>(spells.focus).filter((x) => typeof x === "string"),
      signature: arr<string>(spells.signature).filter((x) => typeof x === "string"),
      rituals: [...new Set(arr<string>(spells.rituals).filter((x) => typeof x === "string"))].slice(
        0,
        80
      ),
      ritualSkills: Object.fromEntries(
        Object.entries(obj(spells.ritualSkills))
          .filter(([, value]) => typeof value === "string" && value.trim())
          .map(([key, value]) => [key.slice(0, 120), String(value).trim().slice(0, 120)])
      ) as Record<string, string>,
      multiclassCantrips: [
        ...new Set(arr<string>(spells.multiclassCantrips).filter((x) => typeof x === "string")),
      ].slice(0, 20),
      multiclassSpells: [
        ...new Set(arr<string>(spells.multiclassSpells).filter((x) => typeof x === "string")),
      ].slice(0, 40),
      multiclassSlotsUsed: Object.fromEntries(
        Object.entries(obj(spells.multiclassSlotsUsed))
          .filter(([, value]) => typeof value === "number" && Number.isFinite(value))
          .map(([key, value]) => [key, Math.max(0, Math.min(20, Math.floor(value as number)))])
      ) as Record<string, number>,
      multiclassTradition:
        spells.multiclassTradition === "arcane" ||
        spells.multiclassTradition === "divine" ||
        spells.multiclassTradition === "occult" ||
        spells.multiclassTradition === "primal"
          ? spells.multiclassTradition
          : null,
      innate: [...new Set(arr<string>(spells.innate).filter((x) => typeof x === "string"))].slice(
        0,
        80
      ),
      innateUsed: Object.fromEntries(
        Object.entries(obj(spells.innateUsed))
          .filter(([, value]) => typeof value === "number" && Number.isFinite(value))
          .map(([key, value]) => [key, Math.max(0, Math.min(20, Math.floor(value as number)))])
      ) as Record<string, number>,
      innateMax: Object.fromEntries(
        Object.entries(obj(spells.innateMax))
          .filter(([, value]) => typeof value === "number" && Number.isFinite(value))
          .map(([key, value]) => [key, Math.max(1, Math.min(20, Math.floor(value as number)))])
      ) as Record<string, number>,
      divineFontUsed: Math.max(0, Math.min(10, Math.round(num(spells.divineFontUsed, 0)))),
      fontChoice:
        typeof spells.fontChoice === "string" &&
        ["heal", "harm"].includes(spells.fontChoice.toLowerCase())
          ? (spells.fontChoice.toLowerCase() as "heal" | "harm")
          : null,
      slotsUsed: Object.fromEntries(
        Object.entries(obj(spells.slotsUsed)).filter(([, value]) => typeof value === "number")
      ) as Record<string, number>,
      preparedUsed: Object.fromEntries(
        Object.entries(obj(spells.preparedUsed))
          .filter(([, value]) => typeof value === "number" && Number.isFinite(value))
          .map(([key, value]) => [key, Math.max(0, Math.floor(value as number))])
      ) as Record<string, number>,
      fontUsed: Object.fromEntries(
        Object.entries(obj(spells.fontUsed))
          .filter(([, value]) => typeof value === "number" && Number.isFinite(value))
          .map(([key, value]) => [key, Math.max(0, Math.floor(value as number))])
      ) as Record<string, number>,
      preparationsPending: spells.preparationsPending === true,
    },
    equipment: equipmentEntries,
    customItems,
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
    wealthBudgetCp:
      typeof raw.wealthBudgetCp === "number" && Number.isFinite(raw.wealthBudgetCp)
        ? Math.max(0, Math.round(raw.wealthBudgetCp))
        : null,
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
      heroPoints: clampHeroPoints(num(play.heroPoints, 1)),
      focusPoints: Math.max(0, Math.min(3, Math.floor(num(play.focusPoints, 1)))),
      conditions: arr<Record<string, unknown>>(play.conditions)
        .filter((c) => c && typeof c.name === "string")
        .map((c) => ({
          name: String(c.name),
          value: typeof c.value === "number" ? c.value : null,
          duration: typeof c.duration === "number" ? c.duration : null,
        })),
      afflictions: normalizeAfflictions(play.afflictions),
      persistentDamage: normalizePersistentDamageList(play.persistentDamage),
      ...normalizeCharacterTurnEffects(play),
      sustainedSpells: normalizeSustainedSpells(play.sustainedSpells),
      treatWoundsImmune: play.treatWoundsImmune === true,
      battleMedicineImmuneBy: [
        ...new Set(
          arr<string>(play.battleMedicineImmuneBy).filter(
            (value): value is string => typeof value === "string" && value.length > 0
          )
        ),
      ].slice(0, 40),
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
  const suppressed = new Set<string>();
  for (const group of classData.choiceGroups) {
    for (const id of draft.classChoices[group.key] ?? []) {
      const option = group.options.find((entry) => entry.id === id);
      for (const uuid of option?.suppressedFeatures ?? []) {
        suppressed.add(parseClassFeatureUuidName(uuid).toLowerCase());
      }
    }
  }
  return classData.choiceGroups.filter(
    (group) =>
      (group.sourceFeature?.level ?? 0) <= draft.level &&
      !(group.sourceFeature?.name && suppressed.has(group.sourceFeature.name.toLowerCase()))
  );
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
  add(heritageEffects(draft, context.heritage, context.ancestry));
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
  const classSkillOptions = new Set(
    (context.classData?.skillChoices ?? []).flatMap((choice) => choice.options)
  );
  for (const skill of draft.skills.classSkills ?? []) {
    if (classSkillOptions.has(skill)) out.add(skill);
  }

  for (const option of selectedChoiceOptions(draft, context.classData)) {
    for (const skill of option.trainedSkills ?? []) out.add(skill);
  }

  for (const skill of Object.keys(automaticSkillRanks(draft, context))) out.add(skill);
  for (const skill of heritageEffects(draft, context.heritage, context.ancestry).trainedSkills ??
    []) {
    out.add(skill);
  }
  const activeFeatIds = Object.keys(context.feats);
  const featEffects = mergeEffects([
    collectFeatEffects(activeFeatIds),
    collectFeatChoiceEffects(draft.featChoices, activeFeatIds, draft.level),
  ]);
  for (const skill of featEffects.trainedSkills ?? []) out.add(skill);

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
  // Class training grants extra skills from the 1st-level Intelligence
  // modifier. Later milestone boosts do not retroactively add skills.
  const baseMod = abilityMod(baseAbilityScores({ ...draft, level: 1 }, context, false).int);
  return Math.max(0, classData.trainedSkills.additional + Math.max(0, baseMod));
}

export interface FeatSlot {
  category: "ancestry" | "class" | "skill" | "general";
  level: number;
  /** Free Archetype slots use the separate even-level bucket. */
  freeArchetype?: boolean;
}

export interface AutomaticBonusProgression {
  /** Item bonus to weapon and unarmed attack rolls. */
  attack: number;
  /** Minimum weapon damage dice. */
  damageDice: number;
  /** Item bonus to AC. */
  defense: number;
  /** Item bonus to all saving throws. */
  saves: number;
  /** Item bonus to Perception. */
  perception: number;
  /** Item bonus to the skill chosen for ABP potency. */
  skill: number;
}

/**
 * PF2e Automatic Bonus Progression (GM Core). Fundamental rune bonuses are
 * replaced by level-based potency; property runes still apply normally.
 */
export function automaticBonusProgression(level: number): AutomaticBonusProgression {
  const lvl = Math.max(1, Math.min(20, Math.round(level)));
  return {
    attack: lvl >= 16 ? 3 : lvl >= 10 ? 2 : lvl >= 2 ? 1 : 0,
    damageDice: lvl >= 19 ? 4 : lvl >= 12 ? 3 : lvl >= 4 ? 2 : 1,
    // GM Core table 4-11: defense 5/11/18, saves 8/14/20, Perception
    // 7/13/19, and the first chosen skill's potency 3/9/17.
    defense: lvl >= 18 ? 3 : lvl >= 11 ? 2 : lvl >= 5 ? 1 : 0,
    saves: lvl >= 20 ? 3 : lvl >= 14 ? 2 : lvl >= 8 ? 1 : 0,
    perception: lvl >= 19 ? 3 : lvl >= 13 ? 2 : lvl >= 7 ? 1 : 0,
    skill: lvl >= 17 ? 3 : lvl >= 9 ? 2 : lvl >= 3 ? 1 : 0,
  };
}

function bumpDamageDice(formula: string, minimumDice: number): string {
  const match = formula.match(/^(\d+)d(\d+)/);
  if (!match) return formula;
  const dice = Math.max(Number(match[1]), minimumDice);
  return `${dice}d${match[2]}${formula.slice(match[0].length)}`;
}

export function featSlotsFor(
  classData: ClassData | null | undefined,
  level: number,
  freeArchetype = false
) {
  const out: FeatSlot[] = [];
  if (!classData) return out;
  for (const category of ["ancestry", "class", "skill", "general"] as const) {
    for (const slotLevel of classData.featLevels[category]) {
      if (slotLevel <= level) out.push({ category, level: slotLevel });
    }
  }
  if (freeArchetype) {
    for (let slotLevel = 2; slotLevel <= level; slotLevel += 2) {
      out.push({ category: "class", level: slotLevel, freeArchetype: true });
    }
  }
  return out.sort(
    (a, b) =>
      a.level - b.level ||
      Number(Boolean(a.freeArchetype)) - Number(Boolean(b.freeArchetype)) ||
      a.category.localeCompare(b.category)
  );
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
  add(heritageGrantedTraits(context.heritage));
  add(heritageFeatTraits(context.heritage, context.ancestry));
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
    return derived.spellSlots?.some((count) => count > 0) ? "met" : "unmet";
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

const CLASS_TRAIT_NAMES = new Set([
  "alchemist",
  "animist",
  "barbarian",
  "bard",
  "champion",
  "cleric",
  "commander",
  "druid",
  "exemplar",
  "fighter",
  "guardian",
  "gunslinger",
  "inventor",
  "investigator",
  "kineticist",
  "magus",
  "monk",
  "necromancer",
  "oracle",
  "psychic",
  "ranger",
  "rogue",
  "runesmith",
  "sorcerer",
  "summoner",
  "swashbuckler",
  "thaumaturge",
  "witch",
  "wizard",
]);

/**
 * Class feats carry one or more class traits. If a feat has a recognizable
 * class trait and the current class is not among them, the feat is illegal.
 * Feats without recognizable class metadata stay available rather than risk
 * hiding a valid option.
 */
export function featClassAccess(
  feat: Feat,
  context: CharacterContext
): { allowed: boolean; reason?: string } {
  if (feat.category !== "class") return { allowed: true };
  const classData = context.classData;
  const className = classData?.name.trim().toLowerCase() ?? "";
  if (!className) {
    return { allowed: false, reason: "Choose a class before selecting class feats." };
  }
  const classTraits = feat.traits
    .map((trait) => trait.trim().toLowerCase())
    .filter((trait) => CLASS_TRAIT_NAMES.has(trait));
  if (!classTraits.length || classTraits.includes(className)) return { allowed: true };
  return {
    allowed: false,
    reason: `${feat.name} is not available to ${classData?.name ?? "this class"}.`,
  };
}

export function featPrerequisiteStatus(
  feat: Feat,
  draft: CharacterDraft,
  context: CharacterContext,
  derived: DerivedCharacter
): { status: PrerequisiteStatus; checks: PrerequisiteCheck[] } {
  const grantedByHeritage = heritageChosenFeatId(draft, context.heritage) === feat.id;
  const access = grantedByHeritage ? { allowed: true } : featClassAccess(feat, context);
  const checks: PrerequisiteCheck[] = [
    ...(access.allowed
      ? []
      : [{ text: access.reason ?? "Not available to this class.", status: "unmet" as const }]),
    ...featPrerequisiteChecks(feat, draft, context, derived),
  ];
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
export interface SpellRepertoireLimits {
  cantrips: number;
  ranks: number[];
  /**
   * Sorcerer bloodline gifts are part of the spells-known total, so they are
   * subtracted when judging the player's own picks. Bard muse, oracle mystery,
   * and psychic conscious-mind spells are extras and must not be subtracted.
   */
  subtractGranted: boolean;
}

export function spellRepertoireLimits(
  classData: ClassData | null | undefined,
  level: number
): SpellRepertoireLimits | null {
  const name = classData?.name.toLowerCase();
  if (!name || !["bard", "oracle", "sorcerer", "summoner", "psychic"].includes(name)) return null;
  // Bards use the prepared full-caster table (3 slots per rank, 2 at 1st).
  // The muse spell is an extra repertoire entry, not one of those slots.
  if (name === "bard") {
    const ranks = [...bardSlots(level)];
    // Magnum Opus adds two 10th-rank spells to the repertoire.
    if (level >= 19) ranks[9] = Math.max(ranks[9] ?? 0, 2);
    return { cantrips: 5, ranks, subtractGranted: false };
  }
  const bounded = name === "summoner" || name === "psychic";
  const ranks: number[] = [];
  let previous: number[] = [];
  for (let current = 1; current <= level; current++) {
    // Spontaneous full casters have four slots per rank, not the prepared
    // caster's three. Their repertoire grows with those slots.
    const slots = bounded ? boundedCasterSlots(current) : spontaneousFullCasterSlots(current);
    for (let index = 0; index < slots.length; index++) {
      const count = slots[index] ?? 0;
      const before = previous[index] ?? 0;
      if (count > before) ranks[index] = (ranks[index] ?? 0) + (count - before);
    }
    previous = slots;
  }
  // Bloodline Paragon, Oracular Clarity, and Infinite Mind add two
  // 10th-rank spells to the repertoire.
  if (level >= 19 && ["oracle", "sorcerer", "psychic"].includes(name)) {
    ranks[9] = Math.max(ranks[9] ?? 0, 2);
  }
  // Only the sorcerer's bloodline gifts are part of the base known total.
  return {
    cantrips: name === "psychic" ? 3 : 5,
    ranks,
    subtractGranted: name === "sorcerer",
  };
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
      .replace(/[^a-z0-9]+/g, " ")
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

export function weaponSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function attackRankFor(
  item: Equipment,
  prof: DerivedCharacter["prof"],
  classData: ClassData | null | undefined,
  deity: Deity | null | undefined
): number {
  if (!item.weapon) return 0;
  let rank = prof.attacks[item.weapon.category || "simple"] ?? 0;
  if (isFirearm(item)) {
    const category = item.weapon.category || "simple";
    rank = Math.max(rank, prof.attacks[`${category}-firearms-crossbows`] ?? 0);
  }
  const slug = weaponSlug(item.name);
  rank = Math.max(rank, prof.attacks[`weapon-base-${slug}`] ?? 0);
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

/**
 * Conditional class damage that is rolled in addition to the weapon's normal
 * damage. Keeping it separate avoids silently adding sneak attack or rage
 * damage to every attack when the condition is not true.
 */
export function classSituationalDamage(
  classData: ClassData | null | undefined,
  level: number,
  ranged: boolean,
  details: {
    weaponTraits?: string[];
    unarmed?: boolean;
    thrown?: boolean;
    choices?: string[];
  } = {}
): { formula: string; type: string; label: string }[] {
  const name = classData?.name.toLowerCase();
  const traits = new Set((details.weaponTraits ?? []).map((trait) => trait.toLowerCase()));
  const agileOrFinesse = details.unarmed || traits.has("agile") || traits.has("finesse");
  const out: { formula: string; type: string; label: string }[] = [];
  if (name === "rogue") {
    // Ranged rogues can sneak attack with any ranged weapon. Thrown melee
    // weapons still need agile or finesse.
    const qualifies = ranged ? !details.thrown || agileOrFinesse : agileOrFinesse;
    if (qualifies) {
      const dice = level >= 17 ? 4 : level >= 11 ? 3 : level >= 5 ? 2 : 1;
      out.push({ formula: `${dice}d6`, type: "precision", label: "Sneak Attack" });
    }
  }
  if (name === "swashbuckler" && agileOrFinesse) {
    const tier = level >= 17 ? 4 : level >= 13 ? 3 : level >= 9 ? 2 : level >= 5 ? 1 : 0;
    out.push({
      formula: `${2 + tier}`,
      type: "precision",
      label: tier ? `Precise Strike (+${tier})` : "Precise Strike",
    });
    out.push({
      formula: `${2 + tier}d6`,
      type: "precision",
      label: "Precise Strike (finisher)",
    });
  }
  if (name === "investigator") {
    const dice = level >= 17 ? 5 : level >= 13 ? 4 : level >= 9 ? 3 : level >= 5 ? 2 : 1;
    out.push({ formula: `${dice}d6`, type: "precision", label: "Strategic Strike" });
  }
  if (name === "barbarian" && !ranged) {
    // Rage is a flat 2 damage; only agile weapons halve it. Instinct
    // specialization and other class feats add their own damage separately.
    const bonus = agileOrFinesse ? 1 : 2;
    out.push({ formula: `${bonus}`, type: "untyped", label: "Rage" });
  }
  if (name === "ranger" && (details.choices ?? []).includes("Precision")) {
    const dice = level >= 19 ? "3d8" : level >= 11 ? "2d8" : "1d8";
    out.push({ formula: dice, type: "precision", label: "Hunter's Edge (precision)" });
  }
  return out;
}

/** Monk unarmed strikes scale with class level. */
export function monkUnarmedDamage(level: number): string {
  if (level >= 20) return "4d6";
  if (level >= 15) return "3d6";
  if (level >= 10) return "2d6";
  if (level >= 5) return "1d8";
  return "1d6";
}

// ---------------------------------------------------------------------------
// Character computation
// ---------------------------------------------------------------------------
/**
 * Class features and feats that improve a successful save. Evasion and
 * Juggernaut apply to every save of their type, not only to one hazard.
 */
export function saveUpgradesFrom(names: string[]): Record<SaveKey, boolean> {
  const normalized = names.map((name) => name.trim().toLowerCase());
  return {
    fortitude: normalized.some((name) => /juggernaut\b/.test(name)),
    reflex: normalized.some((name) => /\bevasion\b/.test(name)),
    // Will-save success upgrades use several feature names across classes.
    will: normalized.some((name) =>
      /\b(resolve|resolute faith|majestic will|performer's heart|indomitable will|agile mind|wild willpower|unbreakable will)\b/.test(
        name
      )
    ),
  };
}

export function computeCharacter(
  draft: CharacterDraft,
  context: CharacterContext
): DerivedCharacter {
  const ancestry = context.ancestry ?? null;
  const classData = context.classData ?? null;
  const background = context.background ?? null;
  const classGrants = selectedClassGrants(draft, classData, context.deity);
  const animistApparitions = animistApparitionInfo(draft, {
    spells: context.spells,
    classData,
  });
  const primaryApparition = animistApparitions?.attuned.find(
    (entry) => entry.id === animistApparitions.primaryId
  );
  if (
    primaryApparition?.vesselSpell &&
    !classGrants.spells.some((spell) => spell.id === primaryApparition.vesselSpell!.id)
  ) {
    classGrants.spells.push({
      id: primaryApparition.vesselSpell.id,
      name: primaryApparition.vesselSpell.name,
      rank: primaryApparition.vesselSpell.rank,
      kind: "focus",
      source: primaryApparition.name,
    });
  }
  const abilities = baseAbilityScores(draft, context);
  if (
    context.automaticBonusProgression &&
    draft.level >= 17 &&
    draft.abpApex &&
    ABILITIES.includes(draft.abpApex)
  ) {
    abilities[draft.abpApex] += 2;
  }
  // Validate the 1st-level allocation independently of later milestones.
  const rawAbilities = baseAbilityScores({ ...draft, level: 1 }, context, false);
  const abilityMods = Object.fromEntries(
    ABILITIES.map((ability) => [ability, abilityMod(abilities[ability])])
  ) as Record<AbilityKey, number>;
  const prof = buildProficiencies(draft, context);
  const hadMartialTraining = prof.attacks.martial >= 1;
  const activeFeatIds = Object.keys(context.feats);
  const featMods = mergeEffects([
    collectFeatEffects(activeFeatIds),
    collectFeatChoiceEffects(draft.featChoices, activeFeatIds, draft.level),
    heritageEffects(draft, context.heritage, context.ancestry),
  ]);
  for (const [key, rank] of Object.entries(featMods.proficiencyRanks ?? {})) {
    const value = Math.max(0, Math.min(4, Math.round(rank)));
    if (key === "perception") prof.perception = Math.max(prof.perception, value);
    else if (key === "fortitude") prof.fortitude = Math.max(prof.fortitude, value);
    else if (key === "reflex") prof.reflex = Math.max(prof.reflex, value);
    else if (key === "will") prof.will = Math.max(prof.will, value);
  }
  if (featMods.armorProficiency) {
    const categories = ["light", "medium", "heavy"] as const;
    const next = categories.find((category) => prof.defenses[category] === 0) ?? "heavy";
    prof.defenses[next] = Math.max(prof.defenses[next], draft.level >= 13 ? 2 : 1);
  }
  if (featMods.weaponProficiency) {
    const rank = draft.level >= 11 ? 2 : 1;
    if (!hadMartialTraining) {
      prof.attacks.martial = Math.max(prof.attacks.martial, rank);
    } else {
      const weapon = draft.featChoices[WEAPON_PROFICIENCY_ID]?.[0]?.trim();
      if (weapon) {
        const key = `weapon-base-${weaponSlug(weapon)}`;
        prof.attacks[key] = Math.max(prof.attacks[key] ?? 0, rank);
      }
    }
  }
  for (const weaponName of featMods.specificWeaponProficiency ?? []) {
    const key = `weapon-base-${weaponSlug(weaponName)}`;
    prof.attacks[key] = Math.max(prof.attacks[key] ?? 0, 1);
  }
  const itemMods = collectItemEffects(
    draft.equipment
      .filter((entry) => {
        if (!entry.equipped) return false;
        const item = context.equipment[entry.itemId];
        // Invested magic items only grant their benefits after investiture.
        return !item?.traits.includes("invested") || entry.invested;
      })
      .map((entry) => entry.itemId)
  );
  const apexAbility = itemMods.apexAbilities?.[0];
  let apexNote: string | null = null;
  if (apexAbility) {
    // Apex items raise the modifier by 1 or to +4, whichever is higher.
    abilityMods[apexAbility] = Math.max(abilityMods[apexAbility] + 1, 4);
    apexNote = `Apex: ${ABILITY_LABELS[apexAbility]} modifier increased to ${abilityMods[apexAbility] >= 0 ? "+" : ""}${abilityMods[apexAbility]}.`;
  }
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
  // Bulk is calculated before conditions so carrying too much automatically
  // applies the Encumbered condition without making the player add it twice.
  const ownedEquipment = draft.equipment
    .map((entry) => ({ entry, item: context.equipment[entry.itemId] }))
    .filter((x): x is { entry: (typeof draft.equipment)[number]; item: Equipment } =>
      Boolean(x.item)
    );
  const bulkTotal = ownedEquipment.reduce((sum, { entry, item }) => {
    // Worn armor counts as 1 less Bulk (Player Core: "If you wear a suit of
    // armor, its Bulk is reduced by 1").
    const wornArmorReduction = entry.equipped && item.armor ? 1 : 0;
    const unitBulk = Math.max(0, (item.bulk || 0) - wornArmorReduction);
    return sum + unitBulk * entry.quantity;
  }, 0);
  const capacity = 5 + abilityMods.str;
  const maxBulk = 10 + abilityMods.str;
  const carriesEncumberedCondition = draft.play.conditions.some(
    (condition) => condition.name.trim().toLowerCase() === "encumbered"
  );
  const isEncumbered = bulkTotal > capacity;
  const effectiveConditions =
    isEncumbered && !carriesEncumberedCondition
      ? [...draft.play.conditions, { name: "Encumbered", value: null, duration: null }]
      : draft.play.conditions;
  const conditionEffects = conditionModifiers(effectiveConditions, { level: draft.level });
  const abp = context.automaticBonusProgression
    ? automaticBonusProgression(draft.level)
    : { attack: 0, damageDice: 1, defense: 0, saves: 0, perception: 0, skill: 0 };
  const validation: ValidationIssue[] = [];
  const issue = (severity: Severity, message: string, step?: string) =>
    validation.push({ severity, message, step });

  // --- Core selections -----------------------------------------------------
  if (!ancestry) issue("error", "Choose an ancestry.", "ancestry");
  if (ancestry?.sizeChoices?.length) {
    if (!draft.ancestrySize || !ancestry.sizeChoices.includes(draft.ancestrySize)) {
      issue("error", `${ancestry.name}: choose your size.`, "ancestry");
    }
  }
  if (ancestry && !draft.heritageId) issue("error", "Choose a heritage.", "heritage");
  if (!background) issue("error", "Choose a background.", "background");
  if (!classData) issue("error", "Choose a class.", "class");
  if (classData && keyOptions.length > 1 && !key)
    issue("error", "Choose your key ability score.", "abilities");
  if (classData && keyOptions.length === 0 && !key)
    issue("warning", "This class needs a key ability score; select one manually.", "abilities");

  const heritage = context.heritage ?? null;
  if (ancestry && heritage) {
    const expected = (heritage.ancestrySlug || heritage.ancestry)
      .toLowerCase()
      .replace(/\s+/g, "-");
    const actual = ancestry.name.toLowerCase().replace(/\s+/g, "-");
    if (!heritage.versatile && expected && expected !== actual) {
      issue("error", `${heritage.name} is not available to ${ancestry.name}.`, "heritage");
    }
  }
  const heritageSkill = heritageSkillChoice(heritage);
  if (heritage && heritageSkill) {
    const chosen = draft.featChoices[heritage.id]?.[0];
    if (!chosen || !heritageSkill.options.includes(chosen as SkillId)) {
      issue("error", `${heritage.name}: ${heritageSkill.prompt}.`, "skills");
    }
  }
  const heritageGrant = heritageFeatGrant(heritage);
  const heritageFeatId = heritageChosenFeatId(draft, heritage);
  if (heritage && heritageGrant && !heritageFeatId) {
    issue("error", `${heritage.name}: ${heritageGrant.prompt}.`, "feats");
  }
  if (heritage && heritageGrant && heritageFeatId) {
    const feat = context.feats[heritageFeatId];
    if (feat && !featAllowedByHeritageGrant(feat, heritageGrant, classData?.name)) {
      issue("error", `${feat.name} is not a valid ${heritage.name} choice.`, "feats");
    }
  }

  for (const featId of activeFeatIds) {
    const definition = FEAT_CHOICES[featId];
    if (definition && !draft.featChoices[featId]?.[0]?.trim()) {
      const name = context.feats[featId]?.name ?? "Feat";
      issue("warning", `${name}: ${definition.prompt}.`, "feats");
    }
  }
  if (
    activeFeatIds.includes(WEAPON_PROFICIENCY_ID) &&
    hadMartialTraining &&
    !draft.featChoices[WEAPON_PROFICIENCY_ID]?.[0]?.trim()
  ) {
    issue("warning", "Weapon Proficiency: choose an advanced weapon.", "feats");
  }
  for (const instance of selectedFeatGrantInstances(draft)) {
    const name = context.feats[instance.featId]?.name ?? "Feat";
    if (!instance.choice) {
      issue("warning", `${name}: ${instance.grant.prompt}.`, "feats");
      continue;
    }
    const chosen = context.feats[instance.choice];
    if (
      !chosen ||
      chosen.id === instance.featId ||
      chosen.category !== instance.grant.category ||
      chosen.level > instance.grant.level
    ) {
      issue(
        "warning",
        `${name}: the chosen granted feat is not valid for this selection.`,
        "feats"
      );
    }
  }

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
  for (const choice of classData?.skillChoices ?? []) {
    const selected = (draft.skills.classSkills ?? []).filter((skill) =>
      choice.options.includes(skill)
    );
    if (selected.length < choice.count) {
      issue("error", `${classData?.name}: ${choice.prompt}.`, "skills");
    }
  }
  const extraRequired = classData ? requiredExtraSkills(draft, context) : 0;
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
  const armorCheckPenalty = equippedArmorItem?.armor?.checkPenalty
    ? -Math.abs(equippedArmorItem.armor.checkPenalty)
    : 0;
  const armorTraits = new Set(equippedArmorItem?.traits ?? []);
  const armorPenaltyForSkill = (skill: (typeof SKILLS)[number]) => {
    if (!skill.armorPenalty) return 0;
    // Noisy armor applies its check penalty to Stealth even at the required
    // Strength. Flexible armor waives the penalty for Acrobatics and Athletics.
    if (armorTraits.has("noisy") && skill.id === "stealth") return armorCheckPenalty;
    if (meetsArmorStrength) return 0;
    if (armorTraits.has("flexible") && (skill.id === "acrobatics" || skill.id === "athletics")) {
      return 0;
    }
    return armorCheckPenalty;
  };

  const derivedSkills: DerivedSkill[] = SKILLS.map((skill) => {
    const rank = ranks[skill.id] ?? 0;
    const proficiency =
      rank > 0
        ? proficiencyBonus(rank, draft.level)
        : featMods.untrainedImprovisation
          ? draft.level >= 7
            ? draft.level
            : draft.level >= 5
              ? draft.level - 1
              : Math.max(0, draft.level - 2)
          : 0;
    const mod =
      proficiency +
      abilityMods[skill.ability] +
      armorPenaltyForSkill(skill) +
      Math.max(
        itemMods.skillItemBonus?.[skill.id] ?? 0,
        draft.abpSkill === skill.id ? abp.skill : 0
      ) +
      conditionEffects.checks[skill.ability];
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
    lore.push({
      name,
      mod: proficiencyBonus(1, draft.level) + abilityMods.int + conditionEffects.checks.int,
      rank: 1,
    });
  }
  for (const raw of draft.skills.backgroundLore) {
    const clean = String(raw || "").trim();
    if (!clean) continue;
    lore.push({
      name: clean.toLowerCase().includes("lore") ? clean : `${clean} Lore`,
      mod: proficiencyBonus(1, draft.level) + abilityMods.int + conditionEffects.checks.int,
      rank: 1,
    });
  }
  for (const name of draft.skills.lore) {
    const clean = String(name || "").trim();
    if (!clean) continue;
    lore.push({
      name: clean.toLowerCase().includes("lore") ? clean : `${clean} Lore`,
      mod: proficiencyBonus(1, draft.level) + abilityMods.int + conditionEffects.checks.int,
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
        mod:
          proficiencyBonus(rank, draft.level) +
          abilityMods[entry.ability] +
          conditionEffects.checks[entry.ability],
        rank,
      });
    }
  }
  for (const apparition of animistApparitions?.attuned ?? []) {
    const rank = draft.level >= 15 ? 4 : draft.level >= 7 ? 3 : draft.level >= 3 ? 2 : 1;
    for (const name of apparition.skills) {
      lore.push({
        name,
        mod: proficiencyBonus(rank, draft.level) + abilityMods.int + conditionEffects.checks.int,
        rank,
      });
    }
  }
  for (const entry of featMods.lore ?? []) {
    lore.push({
      name: entry.name,
      mod:
        proficiencyBonus(entry.rank, draft.level) + abilityMods.int + conditionEffects.checks.int,
      rank: entry.rank,
    });
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
  const ancestryHp =
    (draft.ancestrySize ? ancestry?.hpBySize?.[draft.ancestrySize] : undefined) ??
    ancestry?.hp ??
    0;
  const classHp = classData?.hp ?? 0;
  const perLevel = Math.max(1, classHp + conMod);
  const maxHp = Math.max(
    1,
    Math.max(1, ancestryHp + perLevel + Math.max(0, draft.level - 1) * perLevel) +
      (featMods.hpPerLevel ?? 0) * draft.level +
      conditionEffects.maxHp
  );
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
  let speed = (context.heritage?.speeds?.base ?? (ancestry?.speed || 25)) + (featMods.speed ?? 0);
  const speedPenalties: number[] = [];
  if (armor?.armor) {
    const armorCategory = armor.armor.category === "unarmored" ? "unarmored" : armor.armor.category;
    // Negative Dexterity still applies; only the armor's Dex cap limits it.
    const dex = Math.min(abilityMods.dex, armor.armor.dexCap);
    // Armor potency and ABP replace the armor's potency bonus, while a
    // separate item bonus (such as Bands of Force) competes with the armor's
    // total item bonus instead of stacking with it.
    const armorItemBonus = armor.armor.acBonus + Math.max(armorRunes.armorPotency, abp.defense);
    ac =
      10 +
      dex +
      Math.max(armorItemBonus, itemMods.acItemBonus ?? 0) +
      proficiencyBonus(prof.defenses[armorCategory] ?? 0, draft.level) +
      shieldBonus;
    // Armor speed penalties always apply. Meeting the Strength threshold
    // reduces the penalty by 5 feet (so full plate's -10 becomes -5).
    const armorSpeedPenalty = Math.min(0, armor.armor.speedPenalty || 0);
    if (!featMods.ignoreArmorSpeedPenalty) {
      const adjusted = meetsArmorStrength ? Math.min(0, armorSpeedPenalty + 5) : armorSpeedPenalty;
      if (adjusted) speedPenalties.push(adjusted);
    }
  } else {
    ac =
      10 +
      abilityMods.dex +
      Math.max(abp.defense, itemMods.acItemBonus ?? 0) +
      proficiencyBonus(prof.defenses.unarmored ?? 0, draft.level) +
      shieldBonus;
  }
  if (shield?.shield?.speedPenalty) speedPenalties.push(shield.shield.speedPenalty);
  if (conditionEffects.speed) speedPenalties.push(conditionEffects.speed);
  // Unburdened Iron reduces one Speed penalty by 5 feet, not every penalty.
  if (speedPenalties.length && featMods.speedPenaltyReduction) {
    let index = 0;
    for (let i = 1; i < speedPenalties.length; i++) {
      if (speedPenalties[i] < speedPenalties[index]) index = i;
    }
    speedPenalties[index] = Math.min(0, speedPenalties[index] + featMods.speedPenaltyReduction);
  }
  speed = Math.max(5, speed + speedPenalties.reduce((sum, penalty) => sum + penalty, 0));
  ac += conditionEffects.ac;

  const saves: Record<SaveKey, number> = {
    fortitude:
      proficiencyBonus(prof.fortitude, draft.level) +
      abilityMods.con +
      Math.max(armorRunes.resilient, abp.saves, itemMods.saveItemBonus?.fortitude ?? 0) +
      conditionEffects.saves.fortitude,
    reflex:
      proficiencyBonus(prof.reflex, draft.level) +
      abilityMods.dex +
      Math.max(armorRunes.resilient, abp.saves, itemMods.saveItemBonus?.reflex ?? 0) +
      conditionEffects.saves.reflex,
    will:
      proficiencyBonus(prof.will, draft.level) +
      abilityMods.wis +
      Math.max(armorRunes.resilient, abp.saves, itemMods.saveItemBonus?.will ?? 0) +
      conditionEffects.saves.will,
  };
  const perception =
    proficiencyBonus(prof.perception, draft.level) +
    abilityMods.wis +
    Math.max(itemMods.perceptionItemBonus ?? 0, abp.perception) +
    conditionEffects.perception;
  const initiative = perception + (featMods.initiativeBonus ?? 0);
  const classDc = classData
    ? 10 +
      proficiencyBonus(prof.classDc, draft.level) +
      keyMod +
      (key ? conditionEffects.checks[key] : conditionEffects.allChecks)
    : 10 + keyMod;
  const spellDc =
    caster.progression === "none"
      ? null
      : 10 +
        proficiencyBonus(prof.spellcasting, draft.level) +
        spellMod +
        (spellAbility ? conditionEffects.checks[spellAbility] : conditionEffects.allChecks);
  const spellAttack =
    caster.progression === "none"
      ? null
      : proficiencyBonus(prof.spellcasting, draft.level) +
        spellMod +
        (spellAbility ? conditionEffects.checks[spellAbility] : conditionEffects.allChecks);

  const multiclassFeatIds = [
    ...Object.values(draft.feats.ancestry),
    ...Object.values(draft.feats.class),
    ...Object.values(draft.feats.skill),
    ...Object.values(draft.feats.general),
    ...Object.values(draft.feats.freeArchetype),
    ...draft.feats.extras,
    ...Object.values(draft.featChoices).flat(),
    ...(draft.backgroundFeat ? [draft.backgroundFeat] : []),
  ];
  const multiclassFeatSet = new Set(multiclassFeatIds);
  const multiclass = multiclassDedicationFor(multiclassFeatIds);
  const multiclassTradition = multiclass
    ? (multiclass.tradition ?? draft.spells.multiclassTradition)
    : null;
  const multiclassSlots = multiclass
    ? multiclassSlotCounts(draft.level, {
        basic: multiclassFeatSet.has(multiclass.basicFeatId),
        expert: multiclassFeatSet.has(multiclass.expertFeatId),
        master: multiclassFeatSet.has(multiclass.masterFeatId),
      })
    : [];
  const multiclassCondition = multiclass
    ? conditionEffects.checks[multiclass.ability]
    : conditionEffects.allChecks;
  const multiclassRank = multiclassProficiencyRank(draft.level);
  const multiclassSpellDc = multiclass
    ? 10 +
      proficiencyBonus(multiclassRank, draft.level) +
      abilityMods[multiclass.ability] +
      multiclassCondition
    : null;
  const multiclassSpellAttack = multiclass
    ? proficiencyBonus(multiclassRank, draft.level) +
      abilityMods[multiclass.ability] +
      multiclassCondition
    : null;

  // Focus spells from a class without spell slots use the proficiency and
  // tradition of the ability that granted them. Monk ki and ranger warden
  // spells use Wisdom; champions already have a focus caster profile.
  const focusCasterClass = classData?.name.toLowerCase();
  const focusAbility: AbilityKey | null =
    caster.progression !== "none"
      ? (caster.spellAbility ?? key ?? null)
      : focusCasterClass === "champion"
        ? "cha"
        : "wis";
  const classFocusGrants = classGrants.spells.filter((spell) => spell.kind === "focus");
  const hasFocusSpells = draft.spells.focus.length > 0 || classFocusGrants.length > 0;
  const focusRank = caster.progression !== "none" ? Math.max(1, prof.spellcasting) : 1;
  const focusMod = focusAbility ? abilityMods[focusAbility] : 0;
  const focusCondition = focusAbility
    ? conditionEffects.checks[focusAbility]
    : conditionEffects.allChecks;
  const focusSpellDc = hasFocusSpells
    ? 10 + proficiencyBonus(focusRank, draft.level) + focusMod + focusCondition
    : null;
  const focusSpellAttack = hasFocusSpells
    ? proficiencyBonus(focusRank, draft.level) + focusMod + focusCondition
    : null;

  // Innate spells use their own trained (expert at 12th) Charisma-based
  // proficiency. They do not inherit the class's spellcasting proficiency.
  const hasInnateSpells = draft.spells.innate.length > 0;
  const innateRank = draft.level >= 12 ? 2 : 1;
  const innateMod = abilityMods.cha;
  const innateCondition = conditionEffects.checks.cha;
  const innateSpellDc = hasInnateSpells
    ? 10 + proficiencyBonus(innateRank, draft.level) + innateMod + innateCondition
    : null;
  const innateSpellAttack = hasInnateSpells
    ? proficiencyBonus(innateRank, draft.level) + innateMod + innateCondition
    : null;

  // --- Equipment -----------------------------------------------------------
  if (bulkTotal > maxBulk) {
    issue(
      "warning",
      `You carry ${Math.round(bulkTotal * 10) / 10} Bulk, above your maximum of ${maxBulk}. Drop or stow gear before moving.`,
      "gear"
    );
  }
  const spent = ownedEquipment.reduce((sum, { entry, item }) => {
    const runeCost = (entry.runes ?? []).reduce(
      (runeSum, runeId) => runeSum + (context.equipment[runeId]?.price.cpTotal ?? 0),
      0
    );
    return sum + item.price.cpTotal * entry.quantity + runeCost;
  }, 0);
  const budget = draft.wealthBudgetCp;
  const currencyCp = draft.currency.gp * 100 + draft.currency.sp * 10 + draft.currency.cp;
  const committed = spent + currencyCp;
  if (budget !== null && committed > budget)
    issue(
      "warning",
      "Your equipment and coins exceed the standard starting wealth for this level.",
      "gear"
    );

  const invested = investedCount(draft);
  const investedLimit = INVESTED_LIMIT + (featMods.investedLimit ?? 0);
  if (invested > investedLimit) {
    issue(
      "error",
      `Invested ${invested} items; PF2e allows at most ${investedLimit}. Uninvest one before play.`,
      "gear"
    );
  }
  for (const { entry, item } of ownedEquipment) {
    if (entry.equipped && !entry.invested && item.traits.includes("invested")) {
      issue(
        "warning",
        `${item.name} is equipped but not invested; its magical bonuses are inactive until you invest it.`,
        "gear"
      );
    }
  }
  if ((itemMods.apexAbilities?.length ?? 0) > 1) {
    issue(
      "warning",
      "Only one apex item's ability increase applies. Uninvest the others or choose which one is active.",
      "gear"
    );
  }

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
    let attackAbilityKey: AbilityKey = "str";
    let damageAbility = abilityMods.str;
    if (ranged) {
      attackAbility = abilityMods.dex;
      attackAbilityKey = "dex";
      damageAbility = isThrown ? abilityMods.str : 0;
      if (!isThrown && item.traits.includes("propulsive")) {
        // Propulsive adds half a positive Strength modifier, or the full
        // negative modifier.
        damageAbility = abilityMods.str > 0 ? Math.floor(abilityMods.str / 2) : abilityMods.str;
      }
    } else if (finesse) {
      attackAbility = Math.max(abilityMods.str, abilityMods.dex);
      attackAbilityKey = abilityMods.dex > abilityMods.str ? "dex" : "str";
      damageAbility = thief ? Math.max(abilityMods.str, abilityMods.dex) : abilityMods.str;
    }
    const attackPotency = Math.max(weapon.bonus || 0, runes.weaponPotency, abp.attack);
    const attackBonus =
      proficiencyBonus(rank, draft.level) +
      attackAbility +
      attackPotency +
      conditionEffects.checks[attackAbilityKey] +
      conditionEffects.attackCircumstance;
    const damageDice = Math.max(weapon.damage.dice, runes.strikingDice, abp.damageDice);
    const damageBase = `${damageDice}${weapon.damage.die}`;
    // Alchemical bombs have an item bonus to attack rolls but not to damage.
    const weaponDamageBonus = isBomb(item) ? 0 : weapon.bonus || 0;
    const strengthBasedDamage = ranged
      ? isThrown || item.traits.includes("propulsive")
      : !(finesse && thief);
    const damageMod =
      damageAbility +
      weaponDamageBonus +
      weaponSpecializationBonus(activeFeatures, rank) +
      (strengthBasedDamage ? conditionEffects.damage : 0);
    const damageFormula = damageMod === 0 ? damageBase : `${damageBase}${signed(damageMod)}`;
    const extraDamage = runes.property
      .map((rune) => propertyRuneDamage(rune))
      .filter((entry): entry is { formula: string; type: string; label: string } => Boolean(entry));
    extraDamage.push(
      ...classSituationalDamage(classData, draft.level, ranged, {
        weaponTraits: item.traits,
        thrown: isThrown,
        choices: chosenOptions.map((option) => option.name),
      })
    );
    const notes = [
      isThrown ? "Thrown" : ranged ? "Ranged" : "",
      finesse ? "Finesse" : "",
      item.traits.includes("propulsive") ? "Propulsive" : "",
      attackPotency ? `+${attackPotency} attack potency` : "",
      damageDice > 1 ? `${damageDice} damage dice` : "",
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
  const handwrapsEntry =
    draft.equipment.find((entry) => {
      if (!entry.equipped || !entry.invested) return false;
      return isHandwrapsOfMightyBlows(context.equipment[entry.itemId]);
    }) ?? null;
  const handwrapsRunes = summarizeRunes(handwrapsEntry?.runes, context.equipment);
  const fistRank = Math.max(
    prof.attacks.unarmed ?? 0,
    deityFist ? (prof.attacks.favoredWeapon ?? 0) : 0
  );
  const fistAbilityKey: AbilityKey = abilityMods.dex > abilityMods.str ? "dex" : "str";
  const fistPotency = Math.max(handwrapsRunes.weaponPotency, abp.attack);
  const fistAttack =
    proficiencyBonus(fistRank, draft.level) +
    Math.max(abilityMods.str, abilityMods.dex) +
    fistPotency +
    conditionEffects.checks[fistAbilityKey] +
    conditionEffects.attackCircumstance;
  const fistDamage =
    abilityMods.str + weaponSpecializationBonus(activeFeatures, fistRank) + conditionEffects.damage;
  const unarmedStriking = Math.max(handwrapsRunes.strikingDice, abp.damageDice);
  const unarmedBase = bumpDamageDice(
    classData?.name.toLowerCase() === "monk" ? monkUnarmedDamage(draft.level) : "1d4",
    unarmedStriking
  );
  const fistExtraDamage = classSituationalDamage(classData, draft.level, false, {
    unarmed: true,
    choices: chosenOptions.map((option) => option.name),
  });
  for (const rune of handwrapsRunes.property) {
    const damage = propertyRuneDamage(rune);
    if (damage) fistExtraDamage.push(damage);
  }
  const fistNotes = [
    "Nonlethal",
    fistPotency ? `+${fistPotency} attack potency` : "",
    unarmedStriking > 1 ? `${unarmedStriking} damage dice` : "",
    ...handwrapsRunes.property.map((rune) => rune.name),
  ].filter(Boolean);
  attacks.push({
    id: "unarmed:fist",
    name: classData?.name.toLowerCase() === "monk" ? "Unarmed strike" : "Fist",
    sourceItemId: null,
    attackBonus: fistAttack,
    attackFormula: `1d20${signed(fistAttack)}`,
    damageFormula: fistDamage === 0 ? unarmedBase : `${unarmedBase}${signed(fistDamage)}`,
    damageType: "bludgeoning",
    extraDamage: fistExtraDamage,
    traits: ["agile", "finesse", "nonlethal", "unarmed"],
    hands: 1,
    ranged: false,
    notes: fistNotes.join(" · "),
  });

  // --- Spells --------------------------------------------------------------
  const slots = spellSlotsFor(draft.level, caster.progression, classData?.name);
  const maxSpellRank = slots
    ? slots.length
    : caster.progression === "none"
      ? 0
      : Math.ceil(draft.level / 2);
  const studiousSlots = studiousSlotInfoFor(draft, classData);
  const tradition = casterTraditionFor(draft, classData);
  if (caster.traditionOptions && !tradition) {
    issue("error", "Choose your magical tradition.", "spells");
  }
  const grantedSpellIds = new Set(classGrants.spells.map((spell) => spell.id));
  const grantedKnownSpellIds = new Set(
    classGrants.spells.filter((spell) => spell.kind !== "focus").map((spell) => spell.id)
  );
  const sourceSpells = sourceSpellIds(draft, classData);
  if (caster.progression !== "none" && caster.progression !== "focus") {
    const cantripIds = new Set([
      ...draft.spells.cantrips,
      ...draft.spells.prepared.filter((id) => context.spells[id]?.rank === 0),
      ...classGrants.spells.filter((spell) => spell.rank === 0).map((spell) => spell.id),
    ]);
    if (!cantripIds.size) {
      issue("error", "Choose at least one cantrip.", "spells");
    }
    const hasRankedSpell =
      [...sourceSpells, ...draft.spells.prepared].some(
        (id) => (context.spells[id]?.rank ?? 0) > 0
      ) || classGrants.spells.some((spell) => spell.rank > 0);
    if (maxSpellRank >= 1 && !hasRankedSpell) {
      issue("error", "Choose at least one rank 1 spell.", "spells");
    }
    if (
      maxSpellRank >= 1 &&
      isPreparedCasterClass(classData?.name) &&
      !draft.spells.prepared.length
    ) {
      issue("error", "Prepare at least one spell for the day.", "spells");
    }
    const cantripLimit = cantripLimitFor(classData);
    const baseCantripCount = draft.spells.cantrips.filter(
      (spellId) => !grantedKnownSpellIds.has(spellId)
    ).length;
    const bookUsage = spellbookUsage(draft, classData, context.spells, context.deity);
    if (cantripLimit !== null && baseCantripCount > cantripLimit && !bookUsage) {
      issue(
        "warning",
        `${classData?.name ?? "This class"} has ${baseCantripCount} cantrips selected; the level-${draft.level} limit is ${cantripLimit}.`,
        "spells"
      );
    }
    if (bookUsage) {
      const source = spellSourceLabel(classData);
      if (bookUsage.overCantrips > 0) {
        issue(
          "warning",
          `${classData?.name ?? "This class"} free ${source} cantrips: ${bookUsage.freeCantrips} selected, but the starting budget is ${bookUsage.budget.cantrips}. Paid Learn a Spell additions are excluded.`,
          "spells"
        );
      }
      if (bookUsage.overRanked > 0) {
        issue(
          "warning",
          `${classData?.name ?? "This class"} free ${source} spells: ${bookUsage.freeRanked} selected, but the level-${draft.level} budget is ${bookUsage.budget.ranked} (${bookUsage.budget.startingRanked} starting + ${bookUsage.budget.perLevel} per level). Paid Learn a Spell additions are excluded.`,
          "spells"
        );
      }
    }
    const preparedCantripLimit = cantripPreparedLimitFor(classData);
    const preparedCantrips = draft.spells.preparedCantrips;
    if (preparedCantripLimit !== null && preparedCantrips !== null && preparedCantrips.length) {
      const uniquePrepared = new Set(preparedCantrips);
      if (uniquePrepared.size !== preparedCantrips.length) {
        issue("warning", "A prepared cantrip is listed more than once.", "spells");
      }
      const curriculumIds = new Set(
        classGrants.spells
          .filter((spell) => spell.rank === 0 && spell.kind === "curriculum")
          .map((spell) => spell.id)
      );
      let total = 0;
      let nonCurriculum = 0;
      for (const spellId of uniquePrepared) {
        const spell = context.spells[spellId];
        if (!spell) {
          issue("warning", "A prepared cantrip is missing from the compendium.", "spells");
          continue;
        }
        if (spell.rank !== 0) {
          issue(
            "warning",
            `${spell.name} is not a cantrip and cannot be prepared in a cantrip slot.`,
            "spells"
          );
          continue;
        }
        if (!grantedKnownSpellIds.has(spellId) && !draft.spells.cantrips.includes(spellId)) {
          issue(
            "warning",
            `${spell.name} is prepared but is not in this character's cantrip list.`,
            "spells"
          );
          continue;
        }
        total += 1;
        if (!curriculumIds.has(spellId)) nonCurriculum += 1;
      }
      const wizard = classData?.name.toLowerCase() === "wizard";
      const maxPrepared = preparedCantripLimit + (wizard && curriculumIds.size > 0 ? 1 : 0);
      if (total > maxPrepared) {
        issue(
          "error",
          `${classData?.name ?? "This class"} has ${total} cantrips prepared but only ${maxPrepared} can be prepared each day.`,
          "spells"
        );
      } else if (wizard && total > preparedCantripLimit && nonCurriculum > preparedCantripLimit) {
        issue(
          "error",
          `Wizard: ${nonCurriculum} non-curriculum cantrips prepared; only ${preparedCantripLimit} ordinary cantrip slots are available. The extra cantrip must be a curriculum spell.`,
          "spells"
        );
      } else if (
        wizard &&
        total > preparedCantripLimit &&
        ![...uniquePrepared].some((spellId) => curriculumIds.has(spellId))
      ) {
        issue("error", "Wizard: the extra prepared cantrip must be a curriculum spell.", "spells");
      }
    }
  }
  for (const spellId of [...draft.spells.cantrips, ...sourceSpells]) {
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
    for (const spellId of sourceSpells) {
      if (!context.spells[spellId])
        issue("warning", "A selected spell is missing from the compendium.", "spells");
    }
  }
  if (multiclass) {
    if (multiclass.variableTradition && !multiclassTradition) {
      issue(
        "warning",
        `Choose the tradition granted by the ${multiclass.className} Dedication.`,
        "spells"
      );
    }
    if (draft.spells.multiclassCantrips.length > multiclass.cantripLimit) {
      issue(
        "warning",
        `${multiclass.className} Dedication allows ${multiclass.cantripLimit} cantrip${multiclass.cantripLimit === 1 ? "" : "s"}; remove the extra selection${draft.spells.multiclassCantrips.length === multiclass.cantripLimit + 1 ? "" : "s"}.`,
        "spells"
      );
    }
    for (const spellId of draft.spells.multiclassCantrips) {
      const spell = context.spells[spellId];
      if (!spell) {
        issue("warning", "A dedication cantrip is missing from the compendium.", "spells");
        continue;
      }
      if (spell.rank !== 0) {
        issue("warning", `${spell.name} is not a cantrip.`, "spells");
        continue;
      }
      if (
        spell.traditions.length &&
        multiclassTradition &&
        !spell.traditions.includes(multiclassTradition)
      ) {
        issue(
          "warning",
          `${spell.name} is not a ${multiclassTradition} cantrip for the ${multiclass.className} Dedication.`,
          "spells"
        );
      }
    }
    for (const spellId of draft.spells.multiclassSpells) {
      const spell = context.spells[spellId];
      if (!spell) {
        issue("warning", "A dedication spell is missing from the compendium.", "spells");
        continue;
      }
      if (spell.rank === 0) {
        issue("warning", `${spell.name} is a cantrip, not a ranked dedication spell.`, "spells");
        continue;
      }
      if (
        spell.traditions.length &&
        multiclassTradition &&
        !spell.traditions.includes(multiclassTradition)
      ) {
        issue(
          "warning",
          `${spell.name} is not a ${multiclassTradition} spell for the ${multiclass.className} Dedication.`,
          "spells"
        );
      }
    }
  }
  const preparedCaster = PREPARED_CASTER_CLASSES.has(classData?.name.toLowerCase() ?? "");
  if (preparedCaster && draft.spells.prepared.length) {
    const ordinarySlots = ordinarySpellSlotsFor(draft.level, caster.progression, classData?.name);
    const fontInfo = divineFontInfo(draft.level, classData?.name);
    const fontChoices = deityFontChoices(context.deity);
    const fontChoice = effectiveFontChoice(draft, {
      spells: context.spells,
      deity: context.deity,
      classData,
    });
    const fontLabel = fontChoice
      ? titleCase(fontChoice)
      : fontChoices.length === 1
        ? titleCase(fontChoices[0]!)
        : "Heal or Harm";
    const entries = preparedEntries(draft, {
      spells: context.spells,
      deity: context.deity,
      classData,
    });
    const summaries = preparedRankSummaries(entries);

    if (fontInfo && fontChoices.length > 1 && !draft.spells.fontChoice && !fontChoice) {
      issue("warning", "Choose Heal or Harm for your divine font.", "spells");
    }
    if (fontInfo && fontChoice) {
      const otherFont = fontChoice === "heal" ? "harm" : "heal";
      if (
        entries.some(
          (entry) =>
            entry.rank === fontInfo.rank &&
            !entry.font &&
            context.spells[entry.id]?.name.trim().toLowerCase() === otherFont
        )
      ) {
        issue(
          "warning",
          `${titleCase(otherFont)} is prepared at rank ${fontInfo.rank}, but your divine font is ${titleCase(fontChoice)}; those copies use ordinary slots.`,
          "spells"
        );
      }
    }

    for (const id of [...new Set(draft.spells.prepared)]) {
      const spell = context.spells[id];
      if (!spell) {
        issue("warning", "A prepared spell is missing from the compendium.", "spells");
        continue;
      }
      if (spell.rank === 0 || spell.traits.includes("focus")) {
        issue(
          "error",
          `${spell.name} is a cantrip or focus spell and cannot occupy a prepared slot. Remove it from the prepared list.`,
          "spells"
        );
      }
    }

    for (const entry of entries) {
      const spell = context.spells[entry.id];
      if (!spell) continue;
      if (entry.rank > maxSpellRank) {
        issue(
          "error",
          `Rank ${entry.rank} spell slots aren't available at level ${draft.level}.`,
          "spells"
        );
        continue;
      }
      if (spell.rank > entry.rank) {
        issue(
          "error",
          `${spell.name} is a rank ${spell.rank} spell and can't be prepared in a rank ${entry.rank} slot.`,
          "spells"
        );
        continue;
      }
      if (
        !entry.font &&
        !sourceSpells.includes(entry.id) &&
        !draft.spells.cantrips.includes(entry.id) &&
        !grantedSpellIds.has(entry.id)
      ) {
        issue(
          "warning",
          `${spell.name} is prepared but is not in this character's spellbook or list.`,
          "spells"
        );
      }
    }

    for (const [rank, summary] of summaries) {
      const ordinaryLimit = Math.max(0, ordinarySlots?.[rank - 1] ?? 0);
      const fontLimit = fontInfo && rank === fontInfo.rank ? fontInfo.slots : 0;
      const totalLimit = ordinaryLimit + fontLimit;
      if (summary.total > totalLimit) {
        issue(
          "error",
          `${classData?.name ?? "This class"} has ${summary.total} rank ${rank} spells prepared but only ${totalLimit} slot${totalLimit === 1 ? "" : "s"}.`,
          "spells"
        );
      } else if (summary.ordinary > ordinaryLimit) {
        issue(
          "error",
          `${classData?.name ?? "This class"}: ${summary.ordinary} rank ${rank} spell${summary.ordinary === 1 ? "" : "s"} prepared in ordinary slots; only ${ordinaryLimit} ordinary slot${ordinaryLimit === 1 ? "" : "s"} available${fontLimit ? ` (divine font is ${fontLabel} only)` : ""}.`,
          "spells"
        );
      }
    }

    if (classData?.name.toLowerCase() === "wizard") {
      const curriculumSpells = classGrants.spells.filter((spell) => spell.kind === "curriculum");
      const curriculumIds = new Set(curriculumSpells.map((spell) => spell.id));
      const curriculumRanks = new Set(
        curriculumSpells.filter((spell) => spell.rank > 0).map((spell) => spell.rank)
      );
      const baseSlots = fullCasterSlots(draft.level);
      for (const rank of curriculumRanks) {
        const baseLimit = Math.max(0, baseSlots[rank - 1] ?? 0);
        const nonCurriculum = entries.filter(
          (entry) => entry.rank === rank && !curriculumIds.has(entry.id)
        ).length;
        if (nonCurriculum > baseLimit) {
          issue(
            "error",
            `Wizard: ${nonCurriculum} rank ${rank} non-curriculum spell${nonCurriculum === 1 ? "" : "s"} prepared; only ${baseLimit} ordinary slot${baseLimit === 1 ? "" : "s"} available. The extra Wizard slot must hold a curriculum spell.`,
            "spells"
          );
        }
      }
    }

    if (fontInfo && fontInfo.rank > 1 && !Object.keys(draft.spells.preparedByRank ?? {}).length) {
      issue(
        "warning",
        `This prepared list predates rank-aware slots. Re-prepare ${fontLabel} at rank ${fontInfo.rank} to use divine font slots.`,
        "spells"
      );
    }
  }
  if (studiousSlots) {
    const prepared = draft.spells.studiousPrepared;
    if (prepared.length > studiousSlots.count) {
      issue(
        "error",
        `Magus studious slots hold ${studiousSlots.count} spells, but ${prepared.length} are prepared.`,
        "spells"
      );
    }
    const allowed = new Set(studiousSlots.spells.map((spell) => spell.id));
    for (const spellId of new Set(prepared)) {
      if (!allowed.has(spellId)) {
        const spell = context.spells[spellId];
        issue(
          "warning",
          `${spell?.name ?? "A prepared spell"} is not a valid magus studious spell for your hybrid study and level.`,
          "spells"
        );
      }
    }
    const used = Object.values(draft.spells.studiousUsed).reduce(
      (total, value) => total + Math.max(0, Math.round(Number(value) || 0)),
      0
    );
    if (used > studiousSlots.count) {
      issue("warning", "More studious spell uses are spent than the slots allow.", "spells");
    }
  }
  if (animistApparitions) {
    const attuned = draft.spells.attunedApparitions;
    if (attuned.length !== animistApparitions.maxAttuned) {
      issue(
        "error",
        `Attune to ${animistApparitions.maxAttuned} apparition${animistApparitions.maxAttuned === 1 ? "" : "s"} during daily preparations (${attuned.length} selected).`,
        "spells"
      );
    }
    if (draft.spells.primaryApparition && !attuned.includes(draft.spells.primaryApparition)) {
      issue("warning", "The primary apparition must be one of your attuned apparitions.", "spells");
    }
    for (const [rank, used] of Object.entries(draft.spells.apparitionUsed)) {
      const count = animistApparitions.slots[Number(rank) - 1] ?? 0;
      if (Math.max(0, Math.round(Number(used) || 0)) > count) {
        issue(
          "warning",
          `More rank ${rank} apparition slots are spent than the ${count} available.`,
          "spells"
        );
      }
    }
  }

  const spontaneousCaster =
    caster.progression !== "none" &&
    caster.progression !== "focus" &&
    !isPreparedCasterClass(classData?.name);
  const repertoire = spellRepertoireLimits(classData, draft.level);
  if (repertoire) {
    const baseCantrips = draft.spells.cantrips.filter(
      (spellId) => !grantedKnownSpellIds.has(spellId)
    );
    // cantripLimitFor applies the class-specific chosen-cantrip cap (for
    // example, a sorcerer's bloodline cantrip is one of their five known
    // cantrips, while a bard's composition cantrip is extra).
    const chosenCantripLimit = cantripLimitFor(classData) ?? repertoire.cantrips;
    if (baseCantrips.length > chosenCantripLimit) {
      issue(
        "error",
        `${classData?.name ?? "This class"} knows ${baseCantrips.length} cantrips but the repertoire allows ${chosenCantripLimit}.`,
        "spells"
      );
    }
    const knownByRank = new Map<number, number>();
    for (const spellId of draft.spells.known) {
      if (grantedKnownSpellIds.has(spellId)) continue;
      const spell = context.spells[spellId];
      if (!spell) continue;
      const ranks = spontaneousCaster ? knownSpellRanks(draft, spell) : [spell.rank];
      for (const rank of ranks) {
        knownByRank.set(rank, (knownByRank.get(rank) ?? 0) + 1);
      }
    }
    // Sorcerer bloodline gifts are part of the spells-known total. Other
    // class-granted repertoire spells are extras and must not shrink the
    // player's own choices.
    const grantedByRank = new Map<number, number>();
    if (repertoire.subtractGranted) {
      for (const spell of classGrants.spells) {
        if (spell.kind === "focus" || spell.rank <= 0) continue;
        grantedByRank.set(spell.rank, (grantedByRank.get(spell.rank) ?? 0) + 1);
      }
    }
    for (const [rank, count] of knownByRank) {
      const limit = Math.max(0, (repertoire.ranks[rank - 1] ?? 0) - (grantedByRank.get(rank) ?? 0));
      if (count > limit) {
        issue(
          "error",
          `${classData?.name ?? "This class"} knows ${count} rank ${rank} spells but the repertoire allows ${limit}.`,
          "spells"
        );
      }
    }
  }

  if (spontaneousCaster) {
    for (const [spellId, ranks] of Object.entries(draft.spells.knownRanks)) {
      if (!draft.spells.known.includes(spellId)) {
        issue(
          "warning",
          "A learned spell rank is recorded for a spell that is not in the repertoire.",
          "spells"
        );
        continue;
      }
      const spell = context.spells[spellId];
      if (!spell) continue;
      for (const rank of ranks) {
        if (rank < spell.rank || rank > maxSpellRank) {
          issue(
            "warning",
            `${spell.name} is learned at rank ${rank}, outside the available range for a rank ${spell.rank} spell at level ${draft.level}.`,
            "spells"
          );
        }
      }
    }
  }
  if (spontaneousCaster && draft.spells.signature.length) {
    if (draft.level < 3) {
      issue("warning", "Signature spells are gained at 3rd level.", "spells");
    }
    const signatureRanks = new Map<number, string>();
    for (const spellId of draft.spells.signature) {
      const spell = context.spells[spellId];
      if (!spell || !draft.spells.known.includes(spellId)) {
        issue("warning", "A signature spell must be in your spell repertoire.", "spells");
        continue;
      }
      if (spell.rank === 0) {
        issue("warning", "Cantrips cannot be signature spells.", "spells");
        continue;
      }
      const existing = signatureRanks.get(spell.rank);
      if (existing && existing !== spellId) {
        issue("warning", `Choose only one signature spell for rank ${spell.rank}.`, "spells");
      }
      signatureRanks.set(spell.rank, spellId);
    }
  }

  // --- Feats ---------------------------------------------------------------
  const selectedFeatIds: string[] = [];
  const slotsForFeats = featSlotsFor(classData, draft.level, Boolean(context.freeArchetype));
  for (const slot of slotsForFeats) {
    const featId = (slot.freeArchetype ? draft.feats.freeArchetype : draft.feats[slot.category])?.[
      String(slot.level)
    ];
    if (!featId) {
      issue(
        slot.freeArchetype ? "warning" : "error",
        slot.freeArchetype
          ? `Choose a free archetype feat for level ${slot.level}.`
          : `Choose ${slot.category === "ancestry" ? "an" : "a"} ${slot.category} feat for level ${slot.level}.`,
        "feats"
      );
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
    const access = featClassAccess(feat, context);
    if (!access.allowed) issue("error", access.reason!, "feats");
    if (slot.freeArchetype) {
      if (feat.category !== "class" || !feat.traits.includes("archetype")) {
        issue(
          "error",
          `${feat.name} is not an archetype feat and cannot fill a free archetype slot.`,
          "feats"
        );
      }
    } else {
      const expected = slot.category === "class" ? ["class", "archetype"] : [slot.category];
      if (!expected.includes(feat.category)) {
        issue(
          "error",
          `${feat.name} is a ${feat.category} feat and cannot fill a ${slot.category} feat slot.`,
          "feats"
        );
      }
    }
  }
  for (const category of ["ancestry", "class", "skill", "general"] as const) {
    for (const key of Object.keys(draft.feats[category])) {
      if (!slotsForFeats.some((slot) => slot.category === category && String(slot.level) === key)) {
        issue(
          "warning",
          `A ${category} feat is stored at level ${key}, which is not a legal ${category} slot. Review the Feats step.`,
          "feats"
        );
      }
    }
  }
  for (const key of Object.keys(draft.feats.freeArchetype)) {
    if (!slotsForFeats.some((slot) => slot.freeArchetype && String(slot.level) === key)) {
      issue(
        "warning",
        `A free archetype feat is stored at level ${key}, but that variant is not enabled for this campaign.`,
        "feats"
      );
    }
  }
  if (context.automaticBonusProgression && draft.level >= 3 && !draft.abpSkill) {
    issue("warning", "Choose a skill for Automatic Bonus Progression skill potency.", "feats");
  }
  if (context.automaticBonusProgression && draft.level >= 17 && !draft.abpApex) {
    issue(
      "warning",
      "Choose an ability for Automatic Bonus Progression's 17th-level apex.",
      "feats"
    );
  }
  for (const id of draft.feats.extras) selectedFeatIds.push(id);
  for (const id of Object.values(draft.feats.freeArchetype)) selectedFeatIds.push(id);
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
    for (const group of activeGrantChoiceGroups(
      draft,
      classData,
      context.deity,
      classGrants.feats.map((feat) => feat.id)
    )) {
      if (!group.options.length) {
        issue(
          "error",
          group.emptyHint ?? `${group.prompt} No legal options are available.`,
          "class"
        );
        continue;
      }
      const picks = [...new Set(draft.grantChoices[group.key] ?? [])];
      if (picks.length !== group.count) {
        issue(
          "error",
          `${group.prompt} Choose ${group.count} option${group.count === 1 ? "" : "s"}.`,
          "class"
        );
      } else if (!picks.every((id) => group.options.some((option) => option.id === id))) {
        issue(
          "error",
          `${group.prompt} That saved choice is no longer available; choose again.`,
          "class"
        );
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
  const grantedFeats: { name: string; id: string | null; source?: string }[] = [
    ...(background?.grantedFeats ?? []).map((feat) => ({ name: feat.name, id: feat.id })),
    ...(selectedBackgroundFeat
      ? [{ name: selectedBackgroundFeat.name, id: selectedBackgroundFeat.id }]
      : []),
  ];
  for (const grant of classGrants.feats) {
    if (grantedFeats.some((feat) => feat.id === grant.id)) continue;
    grantedFeats.push({ name: grant.name, id: grant.id, source: grant.source ?? "Class choice" });
  }
  for (const instance of selectedFeatGrantInstances(draft)) {
    if (!instance.choice) continue;
    const feat = context.feats[instance.choice];
    if (
      feat &&
      feat.id !== instance.featId &&
      feat.category === instance.grant.category &&
      feat.level <= instance.grant.level &&
      !grantedFeats.some((entry) => entry.id === feat.id)
    ) {
      grantedFeats.push({ name: feat.name, id: feat.id });
    }
  }
  const chosenHeritageFeat = heritageFeatId ? context.feats[heritageFeatId] : null;
  if (chosenHeritageFeat && !grantedFeats.some((feat) => feat.id === chosenHeritageFeat.id)) {
    grantedFeats.push({ name: chosenHeritageFeat.name, id: chosenHeritageFeat.id });
  }

  const saveUpgrades = saveUpgradesFrom([
    ...features.map((feature) => feature.name),
    ...selectedFeats.map((feat) => feat.name),
    ...grantedFeats.map((feat) => feat.name),
  ]);

  let focusPointsMax =
    features.some((feature) =>
      /focus|devotion spells|conflux spells|link spells|hexes|revelation spells|grave spells|composition spells|psi cantrips/i.test(
        feature.name
      )
    ) ||
    grantedFeats.some((feat) => /focus/i.test(feat.name)) ||
    draft.spells.focus.length > 0
      ? 1
      : 0;
  const focusClassName = classData?.name.toLowerCase();
  if (focusClassName === "necromancer" || focusClassName === "psychic") {
    focusPointsMax = Math.max(focusPointsMax, 2);
  }
  // Clarity of Focus raises the psychic's pool from 2 to 3 at 5th level.
  if (focusClassName === "psychic" && draft.level >= 5) {
    focusPointsMax = Math.max(focusPointsMax, 3);
  }
  // An animist starts with one Focus Point from their primary apparition's
  // vessel spell; Third and Fourth Apparition raise the pool at 7th and 15th.
  if (focusClassName === "animist") {
    const apparitionFocus = 1 + (draft.level >= 7 ? 1 : 0) + (draft.level >= 15 ? 1 : 0);
    focusPointsMax = Math.max(focusPointsMax, Math.min(3, apparitionFocus));
  }
  // A focus pool can hold one point per focus spell, up to 3. Count both
  // manually chosen and class-granted focus spells without double-counting.
  const grantedFocusSpells = classGrants.spells.filter(
    (spell) => spell.kind === "focus" && spell.id
  );
  const uniqueFocusSpells = new Set([
    ...draft.spells.focus,
    ...grantedFocusSpells.map((spell) => spell.id),
  ]);
  focusPointsMax = Math.max(
    focusPointsMax,
    Math.min(3, uniqueFocusSpells.size),
    Math.min(3, classGrants.focusPoints)
  );
  focusPointsMax = Math.min(3, focusPointsMax);

  const featureLanguages = features.flatMap((feature) => {
    const raw = feature.languages;
    if (!raw || typeof raw !== "object") return [];
    const granted = (raw as { granted?: unknown }).granted;
    return Array.isArray(granted)
      ? granted.filter((value): value is string => typeof value === "string")
      : [];
  });

  const languages = [
    ...(ancestry?.languages ?? []).map(titleCase),
    ...draft.details.languages,
    ...(featMods.languages ?? []).map(titleCase),
    ...featureLanguages.map(titleCase),
  ].filter(
    (value, index, arr) => arr.findIndex((x) => x.toLowerCase() === value.toLowerCase()) === index
  );

  const senses = [
    ...(ancestry?.vision && ancestry.vision !== "normal" ? [ancestry.vision] : []),
    ...(featMods.senses ?? []),
  ].filter(
    (value, index, arr) => arr.findIndex((x) => x.toLowerCase() === value.toLowerCase()) === index
  );
  const notes = [
    ...new Set([
      ...(featMods.notes ?? []),
      ...(itemMods.notes ?? []),
      ...classGrants.notes,
      ...(apexNote ? [apexNote] : []),
    ]),
    ...(hasFocusSpells && caster.progression === "none"
      ? [
          "Focus spell attack rolls and DCs use Wisdom unless the granting ability names a different attribute.",
        ]
      : []),
  ];

  const className = classData?.name.toLowerCase();
  const font = divineFontInfo(draft.level, classData?.name);
  const divineFontSlots = font?.slots ?? null;
  const divineFontRank = font?.rank ?? null;
  const spellSlotsNote =
    caster.progression === "focus"
      ? "Focus spells only. Champions use Charisma for spell attack rolls and spell DCs."
      : className === "animist"
        ? "Animist prepared slots and spontaneous apparition slots are separate; apparition spells can only use apparition slots."
        : className === "cleric"
          ? `Divine font: ${font?.slots ?? 0} rank ${font?.rank ?? 1} ${(context.deity?.font?.length
              ? context.deity.font
              : ["heal", "harm"]
            )
              .map(titleCase)
              .join("-or-")} slots, tracked separately from ordinary slots.`
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
    otherSpeeds: (() => {
      const merged = new Map<string, { type: string; value: number }>();
      for (const entry of ancestry?.otherSpeeds ?? []) merged.set(entry.type, entry);
      for (const entry of context.heritage?.speeds?.other ?? []) merged.set(entry.type, entry);
      return [...merged.values()];
    })(),
    perception,
    initiative,
    saves,
    saveUpgrades,
    skills: derivedSkills,
    lore,
    classDc,
    spellDc,
    spellAttack,
    focusSpellDc,
    focusSpellAttack,
    innateSpellDc,
    innateSpellAttack,
    attacks,
    spellSlots: slots,
    spellSlotsNote,
    studiousSlots,
    animistApparitions,
    divineFontSlots,
    divineFontRank,
    focusPointsMax,
    size: draft.ancestrySize ?? ancestry?.size ?? "med",
    languages,
    senses,
    notes,
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
      currencyCp,
      committed,
      remaining: budget === null ? null : budget - committed,
    },
    investedLimit,
    features,
    selectedFeats,
    grantedFeats,
    grantedSpells: classGrants.spells,
    casterTradition: tradition,
    casterProgression: caster.progression,
    multiclassCaster:
      multiclass && multiclassSpellDc !== null && multiclassSpellAttack !== null
        ? {
            ...multiclass,
            tradition: multiclassTradition,
            spellSlots: multiclassSlots,
            spellDc: multiclassSpellDc,
            spellAttack: multiclassSpellAttack,
          }
        : null,
    maxSpellRank,
    validation,
    conditionEffects,
    xp: draft.play.xp,
  } satisfies DerivedCharacter;

  const checkedFeats = [
    ...selectedFeats,
    ...(chosenHeritageFeat && !selectedFeats.some((feat) => feat.id === chosenHeritageFeat.id)
      ? [chosenHeritageFeat]
      : []),
  ];
  for (const feat of checkedFeats) {
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
    initiative: derived.initiative,
    fortitude: derived.saves.fortitude,
    reflex: derived.saves.reflex,
    will: derived.saves.will,
    classDc: derived.classDc,
    spellDc: derived.spellDc,
    heroPoints: draft.play.heroPoints,
    focusPoints: draft.play.focusPoints,
    xp: draft.play.xp,
    conditions: draft.play.conditions.map(
      (condition) =>
        `${condition.name}${condition.value ? ` ${condition.value}` : ""}${condition.duration ? ` (${condition.duration}r)` : ""}`
    ),
    portraitUrl: draft.portraitUrl,
    validationErrors: derived.validation.filter((issue) => issue.severity === "error").length,
    validationWarnings: derived.validation.filter((issue) => issue.severity === "warning").length,
    spellPreparationsPending: draft.spells.preparationsPending,
  };
}
