// ---------------------------------------------------------------------------
// Core PF2e vocabulary
// ---------------------------------------------------------------------------
import type { AoeTemplate } from "./templates";
import type { GolarionDate } from "./calendar";

export type AbilityKey = "str" | "dex" | "con" | "int" | "wis" | "cha";
export type SaveKey = "fortitude" | "reflex" | "will";
export type SkillId =
  | "acrobatics"
  | "arcana"
  | "athletics"
  | "crafting"
  | "deception"
  | "diplomacy"
  | "intimidation"
  | "medicine"
  | "nature"
  | "occultism"
  | "performance"
  | "religion"
  | "society"
  | "stealth"
  | "survival"
  | "thievery";
export type SpellTradition = "arcane" | "divine" | "occult" | "primal";
export type ProficiencyRank = 0 | 1 | 2 | 3 | 4;
export type CasterProgression = "full" | "bounded" | "focus" | "none";

export const ABILITIES: AbilityKey[] = ["str", "dex", "con", "int", "wis", "cha"];
export const ABILITY_LABELS: Record<AbilityKey, string> = {
  str: "Strength",
  dex: "Dexterity",
  con: "Constitution",
  int: "Intelligence",
  wis: "Wisdom",
  cha: "Charisma",
};
export const ABILITY_SHORT: Record<AbilityKey, string> = {
  str: "STR",
  dex: "DEX",
  con: "CON",
  int: "INT",
  wis: "WIS",
  cha: "CHA",
};
export const ABILITY_DESCRIPTIONS: Record<AbilityKey, string> = {
  str: "Melee attacks and Athletics.",
  dex: "Ranged attacks, AC, Reflex, and finesse.",
  con: "Hit points and Fortitude.",
  int: "Trained skills, Recall Knowledge, and Lore.",
  wis: "Perception, Will, and divine magic.",
  cha: "Social skills and spontaneous magic.",
};

export interface SkillDefinition {
  id: SkillId;
  name: string;
  ability: AbilityKey;
  armorPenalty: boolean;
}

export const SKILLS: SkillDefinition[] = [
  { id: "acrobatics", name: "Acrobatics", ability: "dex", armorPenalty: true },
  { id: "arcana", name: "Arcana", ability: "int", armorPenalty: false },
  { id: "athletics", name: "Athletics", ability: "str", armorPenalty: true },
  { id: "crafting", name: "Crafting", ability: "int", armorPenalty: false },
  { id: "deception", name: "Deception", ability: "cha", armorPenalty: false },
  { id: "diplomacy", name: "Diplomacy", ability: "cha", armorPenalty: false },
  { id: "intimidation", name: "Intimidation", ability: "cha", armorPenalty: false },
  { id: "medicine", name: "Medicine", ability: "wis", armorPenalty: false },
  { id: "nature", name: "Nature", ability: "wis", armorPenalty: false },
  { id: "occultism", name: "Occultism", ability: "int", armorPenalty: false },
  { id: "performance", name: "Performance", ability: "cha", armorPenalty: false },
  { id: "religion", name: "Religion", ability: "wis", armorPenalty: false },
  { id: "society", name: "Society", ability: "int", armorPenalty: false },
  { id: "stealth", name: "Stealth", ability: "dex", armorPenalty: true },
  { id: "survival", name: "Survival", ability: "wis", armorPenalty: false },
  { id: "thievery", name: "Thievery", ability: "dex", armorPenalty: true },
];

export const SKILL_BY_ID = Object.fromEntries(SKILLS.map((s) => [s.id, s])) as Record<
  SkillId,
  SkillDefinition
>;

export const SAVE_LABELS: Record<SaveKey, string> = {
  fortitude: "Fortitude",
  reflex: "Reflex",
  will: "Will",
};
export const SAVE_ABILITY: Record<SaveKey, AbilityKey> = {
  fortitude: "con",
  reflex: "dex",
  will: "wis",
};

export const PROFICIENCY_NAMES = ["Untrained", "Trained", "Expert", "Master", "Legendary"];
export const SIZES: Record<string, string> = {
  tiny: "Tiny",
  sm: "Small",
  small: "Small",
  med: "Medium",
  medium: "Medium",
  lg: "Large",
  large: "Large",
  huge: "Huge",
  grg: "Gargantuan",
  gargantuan: "Gargantuan",
};
export const VISION_LABELS: Record<string, string> = {
  normal: "Normal vision",
  lowLight: "Low-light vision",
  lowlight: "Low-light vision",
  darkvision: "Darkvision",
};

// ---------------------------------------------------------------------------
// Compendium shapes (produced by scripts/ingest-pf2e.mjs)
// ---------------------------------------------------------------------------
export interface BoostEntry {
  from: AbilityKey[];
  fixed: boolean;
}

export interface Publication {
  source: string;
  license: string;
  remaster: boolean;
  playtest: boolean;
  /** The displayed rules text came from the source's GM-facing description. */
  gmDescription?: boolean;
}

export interface FeatureSummary {
  id: string;
  name: string;
  level: number;
  description: string;
  traits: string[];
  otherTags?: string[];
  proficiencies?: Record<string, { rank?: number; attribute?: AbilityKey | null }> | null;
  keyOptions?: AbilityKey[] | null;
  suppressedFeatures?: string[] | null;
  senses?: unknown;
  languages?: unknown;
  lore?: { name: string; ability: AbilityKey }[] | null;
  favoredWeaponRank?: number | null;
  /** Automatic proficiency-rank upgrades to skills, such as Inventor Overdrive. */
  skillRanks?: Record<string, number> | null;
}

export interface ReferenceItem {
  id: string;
  name: string;
  level: number;
}

export type ClassGrantSpellKind = "focus" | "focusCantrip" | "repertoire" | "curriculum";

export interface ClassGrantFeat {
  id: string;
  name: string;
  level: number;
  source?: string;
}

export interface ClassGrantSpell {
  id: string;
  name: string;
  rank: number;
  kind: ClassGrantSpellKind;
  source?: string;
}

/** A spell available in a magus studious slot. */
export interface StudiousSlotSpell {
  id: string;
  name: string;
  rank: number;
}

export interface StudiousSlotInfo {
  /** Rank of the current studious slots (2, 3, or 4). */
  rank: number;
  count: number;
  spells: StudiousSlotSpell[];
}

/** One spell in an animist's apparition repertoire, with its source. */
export interface ApparitionSpell {
  apparitionId: string;
  apparitionName: string;
  spell: Spell;
}

/** One attuned apparition and the spells it contributes at this level. */
export interface AttunedApparition {
  id: string;
  name: string;
  skills: string[];
  cantrip: Spell | null;
  spells: Spell[];
  vesselSpell: Spell | null;
}

export interface AnimistApparitionInfo {
  /** Spontaneous apparition slots per rank. */
  slots: number[];
  /** Number of apparitions the character attunes to at this level. */
  maxAttuned: number;
  /** Effective primary apparition, which is always one of the attuned ids. */
  primaryId: string | null;
  attuned: AttunedApparition[];
  /** Deduplicated apparition repertoire, ordered by rank then name. */
  repertoire: ApparitionSpell[];
}

export interface ClassGrant {
  feats?: ClassGrantFeat[];
  spells?: ClassGrantSpell[];
  /** Focus-pool floor established even when the spell itself is a later choice. */
  focusPoints?: number;
  notes?: string[];
}

export interface Ancestry extends Publication {
  id: string;
  name: string;
  type: "ancestry";
  hp: number;
  /** Ancestries such as Awakened Animal choose their size. */
  sizeChoices?: string[];
  /** Ancestries whose HP depends on the chosen size. */
  hpBySize?: Record<string, number>;
  size: string;
  speed: number;
  /** Set when the ancestry's Speed comes from its heritage. */
  speedNote?: string;
  otherSpeeds: { type: string; value: number }[];
  vision: string;
  boosts: BoostEntry[];
  flaws: AbilityKey[];
  languages: string[];
  additionalLanguages: { count: number; options: string[] };
  features: {
    id: string;
    name: string;
    level: number;
    description: string;
  }[];
  rarity: string;
  traits: string[];
  otherTags?: string[];
  description: string;
}

export interface Heritage extends Publication {
  id: string;
  name: string;
  type: "heritage";
  ancestry: string;
  ancestrySlug: string;
  /** Versatile heritages can be selected by any ancestry. */
  versatile: boolean;
  /** Some heritages, such as Awakened Animal, set the ancestry's Speed. */
  speeds?: { base?: number; other?: { type: string; value: number }[] };
  rarity: string;
  traits: string[];
  otherTags?: string[];
  description: string;
}

export interface Background extends Publication {
  id: string;
  name: string;
  type: "background";
  boosts: BoostEntry[];
  trainedSkills: string[];
  /** Skill choices granted by the background, such as Nature or Occultism. */
  skillChoices: { prompt: string; options: string[]; count: number }[];
  lore: string[];
  /** Free or list-based Lore choices granted by the background. */
  loreChoices: { prompt: string; options: string[]; count: number }[];
  /** Choice of starting feat for backgrounds whose feat depends on another choice. */
  featChoices: { prompt: string; options: ReferenceItem[]; count: number }[];
  grantedFeats: { id: string | null; name: string; level: number }[];
  rarity: string;
  traits: string[];
  otherTags?: string[];
  description: string;
}

export interface ClassChoiceOption {
  id: string;
  name: string;
  level: number;
  traits: string[];
  otherTags?: string[];
  rarity: string;
  source: string;
  remaster: boolean;
  description: string;
  proficiencies?: Record<string, { rank?: number; attribute?: AbilityKey | null }> | null;
  keyOptions?: AbilityKey[] | null;
  suppressedFeatures?: string[] | null;
  senses?: unknown;
  languages?: unknown;
  /** Skills fixed by the option (for example, a rogue racket's trained skill). */
  trainedSkills?: string[];
  /** Automatic skill-rank upgrades from the option. */
  skillRanks?: Record<string, number> | null;
  /** Class features granted by the option at particular levels. */
  grantedFeatures?: FeatureSummary[];
}

export interface ClassChoiceGroup {
  key: string;
  tag: string;
  prompt: string;
  count: number;
  sourceFeature?: { name: string; level: number };
  options: ClassChoiceOption[];
}

export interface ClassData extends Publication {
  id: string;
  name: string;
  type: "class";
  hp: number;
  keyAbility: AbilityKey[];
  perception: number;
  savingThrows: Record<SaveKey, number>;
  attacks: Record<string, number | { name?: string; rank?: number }>;
  defenses: Record<string, number>;
  trainedSkills: { value: string[]; additional: number; custom?: string };
  /** Fixed class training choices, such as the Fighter's Acrobatics/Athletics choice. */
  skillChoices?: { prompt: string; options: string[]; count: number }[];
  featLevels: {
    ancestry: number[];
    class: number[];
    skill: number[];
    general: number[];
  };
  skillIncreaseLevels: number[];
  spellcasting: number;
  features: (FeatureSummary & { choiceGroups: ClassChoiceGroup[] })[];
  choiceGroups: ClassChoiceGroup[];
  rarity: string;
  traits: string[];
  otherTags?: string[];
  description: string;
}

export interface ClassFeature extends Publication {
  id: string;
  name: string;
  level: number;
  traits: string[];
  otherTags?: string[];
  rarity: string;
  description: string;
  actionType: string | null;
  actions: number | null;
  prerequisites: unknown[];
  proficiencies?: Record<string, { rank?: number; attribute?: AbilityKey | null }> | null;
  keyOptions?: AbilityKey[] | null;
  suppressedFeatures?: string[] | null;
  senses?: unknown;
  languages?: unknown;
  lore?: { name: string; ability: AbilityKey }[] | null;
  favoredWeaponRank?: number | null;
  skillRanks?: Record<string, number> | null;
}

export interface Feat extends Publication {
  id: string;
  name: string;
  type: "feat";
  category: string;
  level: number;
  rarity: string;
  traits: string[];
  otherTags?: string[];
  actionType: string | null;
  actions: number | null;
  prerequisites: string[];
  description: string;
}

export type ContentMode = "core" | "expanded";

/**
 * Campaign-level ruleset chosen by the GM. Characters in the campaign inherit
 * both the content scope and the legacy-content allowance.
 */
export type CampaignRuleset = "core" | "expanded" | "legacy";

/**
 * How the GM wants to handle advancement. Milestone mode hides encounter XP
 * budgets; XP mode shows the PF2e budget so encounters can be balanced.
 * Party levels are always advanced by the GM in both modes.
 */
export type XpMode = "milestone" | "xp";

/** GM Core advancement pace; medium is 1,000 XP per level. */
export type AdvancementSpeed = "fast" | "medium" | "slow";

/** The source of an XP award, used for the GM's award ledger. */
export type XpAwardKind = "encounter" | "hazard" | "accomplishment" | "quest" | "other";

export interface XpAward {
  id: string;
  campaignId: string;
  kind: XpAwardKind;
  amount: number;
  reason: string;
  recipientCount: number;
  createdAt: number;
}

export interface RitualData {
  /** Formatted primary-check text, e.g. "Religion (expert)". */
  primaryCheck: string;
  secondaryCasters: number;
  /** Formatted secondary-check text; empty when no secondary casters. */
  secondaryChecks: string;
}

export interface Spell extends Publication {
  id: string;
  name: string;
  type: "spell";
  rank: number;
  /** Rituals live with spells but are not tied to a magical tradition. */
  ritual?: boolean;
  /** Structured ritual checks from the compendium, when available. */
  ritualData?: RitualData;
  traditions: string[];
  rarity: string;
  traits: string[];
  otherTags?: string[];
  actionType: string;
  actions: string;
  range: string;
  area: string;
  targets: string;
  duration: string;
  cost: string;
  requirements: string;
  defense: { save: string | null; basic: boolean } | null;
  damage: { formula: string; type: string }[] | null;
  damageText: string;
  heightening: {
    type: string | null;
    interval: number | null;
    damage: { formula: string; type: string }[] | null;
    area: number | null;
  } | null;
  description: string;
}

export interface Price {
  gp: number;
  sp: number;
  cp: number;
  cpTotal: number;
}

export interface Equipment extends Publication {
  id: string;
  name: string;
  type: string;
  level: number;
  price: Price;
  bulk: number;
  rarity: string;
  traits: string[];
  otherTags?: string[];
  usage: string;
  description: string;
  weapon?: {
    category: string;
    group: string;
    damage: { dice: number; die: string; type: string };
    range: number | null;
    reload: string | null;
    hands: number;
    bonus: number;
  };
  armor?: {
    category: string;
    acBonus: number;
    dexCap: number;
    checkPenalty: number;
    speedPenalty: number;
    strength: number;
    group: string;
  };
  shield?: {
    acBonus: number;
    hardness: number;
    hp: number;
    speedPenalty: number;
  };
  consumable?: {
    category: string;
    uses: number | null;
    duration: string;
  };
}

export interface Deity extends Publication {
  id: string;
  name: string;
  type: "deity";
  category: string;
  attribute: AbilityKey[];
  domains: string[];
  alternateDomains: string[];
  font: string[];
  /** A deity grants one of these skills; some deities offer a choice. */
  skill: string[];
  weapons: string[];
  /** Deity-granted cleric spells, keyed by spell rank. */
  spells: Record<string, { id: string | null; name: string }>;
  sanctification: Record<string, unknown>;
  /** Conditional sanctification text, such as Hei Feng's tengu exception. */
  sanctificationNote?: string;
  rarity: string;
  traits: string[];
  otherTags?: string[];
  description: string;
}

export interface ConditionRef {
  id: string;
  name: string;
  type: "condition";
  description: string;
  source: string;
  remaster: boolean;
}

export interface ActionRef extends Publication {
  id: string;
  name: string;
  type: "action";
  actionType: string | null;
  actions: number | null;
  category: string;
  rarity: string;
  traits: string[];
  description: string;
}

export interface MonsterAttack {
  name: string;
  type: string;
  bonus: number;
  damage: string;
  traits: string[];
  range: number | null;
  effects: string[];
}

export interface MonsterAbility {
  name: string;
  type: string;
  actions: string | number | null;
  actionType: string | null;
  traits: string[];
  description: string;
}

export interface Monster extends Publication {
  id: string;
  name: string;
  type: "monster";
  level: number;
  rarity: string;
  traits: string[];
  size: string;
  sizeCells: number;
  hp: number;
  ac: number;
  fortitude: number;
  reflex: number;
  will: number;
  perception: number;
  speeds: { base: number; other: { type: string; value: number }[] };
  skills: Record<string, { base?: number; mod?: number } | number>;
  immunities: unknown[];
  weaknesses: unknown[];
  resistances: unknown[];
  attacks: MonsterAttack[];
  abilities: MonsterAbility[];
  blurb: string;
  description: string;
}

export interface ReferenceAbility {
  name: string;
  type: string;
  actions: string | number | null;
  actionType: string | null;
  traits: string[];
  description: string;
}

export interface Hazard extends Publication {
  id: string;
  name: string;
  type: "hazard";
  level: number;
  complexity: "simple" | "complex";
  stealth: number | null;
  ac: number | null;
  hardness: number;
  hp: number;
  fortitude: number;
  reflex: number;
  will: number;
  rarity: string;
  traits: string[];
  description: string;
  disable: string;
  reset: string;
  routine: string;
  abilities: ReferenceAbility[];
}

export interface Vehicle extends Publication {
  id: string;
  name: string;
  type: "vehicle";
  level: number;
  priceGp: number;
  ac: number;
  hardness: number;
  hp: number;
  speed: string;
  crew: string;
  passengers: string;
  pilotingCheck: string;
  collisionDC: number;
  collisionDamage: string;
  size: string;
  rarity: string;
  traits: string[];
  description: string;
  immunities: { type: string }[];
  abilities: ReferenceAbility[];
}

export interface FamiliarAbility extends Publication {
  id: string;
  name: string;
  type: "familiarAbility";
  rarity: string;
  traits: string[];
  description: string;
}

export interface BoonCurse extends Publication {
  id: string;
  name: string;
  type: "boonCurse";
  category: "boon" | "curse";
  tier: string;
  deity: string;
  rarity: string;
  traits: string[];
  description: string;
}

export interface TraitEntry extends Publication {
  id: string;
  name: string;
  type: "trait";
  group: string[];
  rarity: string;
  traits: string[];
  description: string;
}

export interface Affliction extends Publication {
  id: string;
  name: string;
  type: "affliction";
  category: "disease" | "curse" | "poison";
  level: number;
  rarity: string;
  traits: string[];
  description: string;
  savingThrow: string;
  onset: string;
  stages: string[];
  usage: string;
  /** Poisons are also items, so they retain their price and duration. */
  priceCp?: number;
  duration?: string;
}

export interface Compendium {
  ancestries: Ancestry[];
  heritages: Heritage[];
  backgrounds: Background[];
  classes: ClassData[];
  classFeatures: ClassFeature[];
  feats: Feat[];
  spells: Spell[];
  equipment: Equipment[];
  deities: Deity[];
  conditions: ConditionRef[];
  actions: ActionRef[];
  monsters: Monster[];
  hazards: Hazard[];
  vehicles: Vehicle[];
  familiarAbilities: FamiliarAbility[];
  boonsAndCurses: BoonCurse[];
  traits: TraitEntry[];
  afflictions: Affliction[];
}

// ---------------------------------------------------------------------------
// Character
// ---------------------------------------------------------------------------
export interface CharacterEquipment {
  itemId: string;
  quantity: number;
  equipped: boolean;
  invested?: boolean;
  /** Daily or per-activation charges already spent on this item. */
  usesUsed?: number;
  /** Optional manual charge cap; otherwise derived from the item's activation. */
  usesMax?: number;
  /**
   * How usesUsed/usesMax are interpreted. Charged staff pools are emptied on a
   * long rest, while daily item uses refill.
   */
  usesKind?: "daily" | "charges";
  /** Equipment IDs for runes etched onto this weapon, armor, or shield. */
  runes?: string[];
}

export interface CharacterCurrency {
  gp: number;
  sp: number;
  cp: number;
}

/** A player-authored inventory item that does not come from the compendium. */
export interface CharacterCustomItem {
  id: string;
  name: string;
  description: string;
}

export interface CharacterCondition {
  name: string;
  value?: number | null;
  /** Remaining duration in rounds, when tracked. */
  duration?: number | null;
}

/**
 * Numeric consequences of the character's active conditions. Penalties are
 * negative numbers and are already merged by type (status vs. circumstance),
 * so callers can add them directly to the base math.
 */
export interface ConditionModifiers {
  ac: number;
  saves: Record<SaveKey, number>;
  perception: number;
  /** Status penalty that applies to every check and DC. */
  allChecks: number;
  /** Penalty to checks and DCs for each ability, including all-check penalties. */
  checks: Record<AbilityKey, number>;
  /** Circumstance penalty to attack rolls, e.g. prone. */
  attackCircumstance: number;
  /** Status penalty to Strength-based damage rolls, e.g. enfeebled. */
  damage: number;
  maxHp: number;
  speed: number;
  dying: number;
  wounded: number;
  doomed: number;
  incapacitated: boolean;
  notes: string[];
}

export type CompanionKind = "animal" | "familiar" | "eidolon" | "summon";

export interface CharacterCompanion {
  id: string;
  name: string;
  kind: CompanionKind;
  level: number;
  hpCurrent: number | null;
  hpMax: number | null;
  ac: number | null;
  /** Optional bestiary entry used as the companion's statblock. */
  monsterId: string | null;
  notes: string;
}

export interface CharacterDetails {
  age: string;
  gender: string;
  pronouns: string;
  height: string;
  weight: string;
  appearance: string;
  personality: string;
  beliefs: string;
  notes: string;
  languages: string[];
}

export interface CharacterPlay {
  hp: number | null;
  tempHp: number;
  heroPoints: number;
  focusPoints: number;
  conditions: CharacterCondition[];
  afflictions: CharacterAffliction[];
  persistentDamage: PersistentDamageInstance[];
  /** Fixed HP regained at the start of the character's turn. */
  fastHealing: number;
  fastHealingActive: boolean;
  fastHealingNote: string;
  /** Regeneration heals at the start of turn and prevents dying from reaching the death threshold. */
  regeneration: number;
  regenerationActive: boolean;
  regenerationNote: string;
  /** Damage types that deactivate regeneration until the end of the next turn. */
  regenerationDeactivatedBy: string[];
  /** Spells currently sustained by this character. */
  sustainedSpells: SustainedSpell[];
  /** The target has received Treat Wounds since their last daily reset. */
  treatWoundsImmune: boolean;
  /** Character IDs of healers whose Battle Medicine this target is immune to. */
  battleMedicineImmuneBy: string[];
  xp: number;
  shieldRaised: boolean;
}

export interface SustainedSpell {
  id: string;
  spellId: string;
  name: string;
  /** Rank at which the spell was cast. */
  rank: number;
  /** Printed duration, such as "sustained up to 1 minute". */
  duration: string;
}

export interface PersistentDamageInstance {
  id: string;
  /** Damage formula rolled at the end of each turn, e.g. "1d6". */
  formula: string;
  /** Damage type, e.g. "fire", "bleed", or "acid". */
  type: string;
  /** Flat-check DC to end this instance; 15 unless the source overrides it. */
  dc: number;
  notes: string;
}

/** Turn-start/end effects stored on an unlinked token. */
export interface TokenTurnEffects {
  fastHealing: number;
  fastHealingActive: boolean;
  fastHealingNote: string;
  regeneration: number;
  regenerationActive: boolean;
  regenerationNote: string;
  regenerationDeactivatedBy: string[];
  persistentDamage: PersistentDamageInstance[];
}

export type AfflictionType = "poison" | "disease" | "curse";

export interface CharacterAffliction {
  id: string;
  name: string;
  type: AfflictionType;
  /** Recovery-check DC. */
  dc: number;
  /** Save used for exposure and stage saves. */
  save: SaveKey;
  /** Current stage, 1..stageMax. */
  stage: number;
  stageMax: number;
  /** Recovery-check interval, e.g. "1 round", "1 day"; blank means no periodic save. */
  interval: string;
  /** Maximum duration, e.g. "1 minute" or empty for until cured. */
  duration: string;
  /** Remaining maximum duration in seconds; null means no timed maximum. */
  durationRemaining: number | null;
  /** Onset text, e.g. "1 round" or "1 hour". */
  onset: string;
  /** Rounds until onset ends; 0 = passed, null = manual/non-round onset. */
  onsetRemaining: number | null;
  /** Rounds until the next automatic stage save; 0 or null = no round timer. */
  intervalRemaining: number | null;
  /** Virulent afflictions need two consecutive successes to reduce a stage. */
  virulent: boolean;
  /** Consecutive successful stage saves for a virulent affliction. */
  virulentSuccesses: number;
  /**
   * How a virulent critical success behaves: the common reading reduces one
   * stage; the strict reading counts as a single success toward the streak.
   */
  virulentCrit: "reduce" | "streak";
  /** False for curses or effects that require a specific removal. */
  savesCanEnd: boolean;
  notes: string;
}

export type PreparedSpellsByRank = Record<string, string[]>;

export interface CharacterDraft {
  version: 1;
  name: string;
  level: number;
  /** Browsing preference: core content only, or the full compendium. */
  contentMode: ContentMode;
  /** Whether pre-remaster legacy options are allowed for this character. */
  includeLegacy: boolean;
  ancestryId: string | null;
  /** Chosen size for ancestries with a size choice (Awakened Animal). */
  ancestrySize: string | null;
  heritageId: string | null;
  backgroundId: string | null;
  classId: string | null;
  deityId: string | null;
  deitySkill: string | null;
  /** Chosen starting feat for a background with multiple feat options. */
  backgroundFeat: string | null;
  keyAbility: AbilityKey | null;
  portraitUrl: string | null;
  boosts: {
    ancestry: (AbilityKey | null)[];
    background: (AbilityKey | null)[];
    free: (AbilityKey | null)[];
    levels: Record<string, (AbilityKey | null)[]>;
  };
  skills: {
    trained: string[];
    increases: Record<string, string>;
    lore: string[];
    /** Player picks for background-granted skill choices. */
    background: string[];
    /** Player picks for class-granted fixed skill choices (Fighter, Runesmith). */
    classSkills: string[];
    /** Player picks for background-granted Lore choices. */
    backgroundLore: string[];
  };
  /** Automatic Bonus Progression: the skill chosen for item-bonus potency. */
  abpSkill?: SkillId | null;
  /** Automatic Bonus Progression: the ability chosen for the 17th-level apex. */
  abpApex?: AbilityKey | null;
  feats: {
    ancestry: Record<string, string>;
    class: Record<string, string>;
    skill: Record<string, string>;
    general: Record<string, string>;
    /** Free Archetype variant feats, keyed by even character level. */
    freeArchetype: Record<string, string>;
    extras: string[];
  };
  classChoices: Record<string, string[]>;
  /**
   * Free sub-choices attached to a class option or class-granted feat, keyed
   * by the registry group key (for example a Cleric domain, Champion devotion
   * spell, Elemental Sorcerer element, or Runelord sin).
   */
  grantChoices: Record<string, string[]>;
  /** Per-feat option picks for choice-driven feats, keyed by feat id. */
  featChoices: Record<string, string[]>;
  spells: {
    tradition: SpellTradition | null;
    cantrips: string[];
    known: string[];
    /** Spellbook, familiar, or dirge contents for book casters. */
    spellbook: string[];
    /** Spell IDs added with the paid Learn a Spell activity. */
    learned: string[];
    /**
     * Ranks at which each spontaneous spell is known, keyed by spell id.
     * Missing entries fall back to the spell's printed rank.
     */
    knownRanks: Record<string, number[]>;
    /** Spell IDs prepared for the day by prepared casters. */
    prepared: string[];
    /**
     * Prepared spells grouped by the rank of the slot they occupy. Keys are
     * decimal strings ("1".."10"); duplicates are separate prepared copies.
     * Empty/absent means legacy: infer ranks from each spell's base rank.
     */
    preparedByRank: PreparedSpellsByRank;
    /**
     * Cantrips prepared for the day by prepared casters. Cantrips remain
     * castable at will once prepared. Null is a legacy draft and falls back to
     * the known cantrip list; an empty array means no cantrips are prepared.
     */
    preparedCantrips: string[] | null;
    /** Magus studious spells prepared in the special slots. */
    studiousPrepared: string[];
    /** Studious spell uses spent today, keyed by spell id. */
    studiousUsed: Record<string, number>;
    /** Animist apparitions attuned during daily preparations. */
    attunedApparitions: string[];
    /** Animist primary apparition; must be one of `attunedApparitions`. */
    primaryApparition: string | null;
    /** Spontaneous apparition slot uses spent today, keyed by rank. */
    apparitionUsed: Record<string, number>;
    focus: string[];
    /** Divine font pips spent today (cleric heal/harm slots). */
    divineFontUsed: number;
    /** Chosen divine font spell when the deity allows both heal and harm. */
    fontChoice: "heal" | "harm" | null;
    slotsUsed: Record<string, number>;
    /** Ordinary prepared copies spent today, keyed `${rank}:${spellId}`. */
    preparedUsed: Record<string, number>;
    /** Divine font copies spent today, keyed by spell id. */
    fontUsed: Record<string, number>;
    /** Spontaneous caster signature spells, which may be heightened freely. */
    signature: string[];
    /** Rituals known or prepared for downtime play. */
    rituals: string[];
    /** Manual primary-check skill overrides for rituals, keyed by spell id. */
    ritualSkills?: Record<string, string>;
    /** Cantrips granted by a spellcasting archetype dedication. */
    multiclassCantrips: string[];
    /** Ranked spells learned through spellcasting archetype feats. */
    multiclassSpells: string[];
    /** Dedication spell slots spent today, keyed by rank. */
    multiclassSlotsUsed: Record<string, number>;
    /** Chosen tradition for a bloodline/patron/eidolon-dependent dedication. */
    multiclassTradition: SpellTradition | null;
    /** Innate spells granted by ancestry, heritage, feats, or items. */
    innate: string[];
    /** Innate spell uses spent today, keyed by spell id. */
    innateUsed: Record<string, number>;
    /** True after a long rest until a prepared caster confirms today's spells. */
    preparationsPending: boolean;
  };
  equipment: CharacterEquipment[];
  /** Homebrew and story items stored alongside the compendium inventory. */
  customItems: CharacterCustomItem[];
  companions: CharacterCompanion[];
  currency: CharacterCurrency;
  /**
   * One-time creation budget in copper. Null for imported or legacy characters
   * whose wealth provenance is not a fresh level-1 build.
   */
  wealthBudgetCp: number | null;
  details: CharacterDetails;
  play: CharacterPlay;
}

/** Best-effort Pathbuilder import diagnostics shown to players and GMs. */
export interface PathbuilderImportReport {
  matched: Record<string, number>;
  unmatched: string[];
  warnings: string[];
}

export interface CharacterSummary {
  level: number;
  ancestry: string;
  heritage: string;
  background: string;
  className: string;
  keyAbility: string;
  hp: number;
  currentHp: number;
  tempHp: number;
  ac: number;
  speed: number;
  perception: number;
  /** Perception plus initiative bonuses, used by the table's initiative roll. */
  initiative: number;
  fortitude: number;
  reflex: number;
  will: number;
  classDc: number;
  spellDc: number | null;
  heroPoints: number;
  focusPoints: number;
  xp: number;
  conditions: string[];
  portraitUrl: string | null;
  /** Required builder choices still unresolved. Older saved summaries may omit this. */
  validationErrors?: number;
  /** Non-blocking builder review items. Older saved summaries may omit this. */
  validationWarnings?: number;
  /** True after a rest until a prepared caster confirms today's spells. */
  spellPreparationsPending?: boolean;
}

export interface CharacterRecord {
  id: string;
  userId: string;
  campaignId: string | null;
  name: string;
  data: CharacterDraft;
  summary: CharacterSummary | null;
  /** Set when the character belongs to a campaign; the GM's ruleset wins. */
  campaignRuleset?: CampaignRuleset | null;
  /** Set when the character belongs to a campaign; used for XP progress. */
  campaignAdvancementSpeed?: AdvancementSpeed | null;
  /** Set when the campaign uses the Free Archetype variant. */
  campaignFreeArchetype?: boolean | null;
  /** Set when the campaign uses Automatic Bonus Progression. */
  campaignAutomaticBonusProgression?: boolean | null;
  /** Set when the GM allows players to add gear without paying. */
  campaignPlayerItemGrant?: boolean | null;
  createdAt: number;
  updatedAt: number;
  /** Optimistic-lock version, incremented on every save. */
  revision: number;
  ownerName?: string;
  permissions?: { canEdit: boolean; canView: boolean; canAdvance?: boolean };
}

// ---------------------------------------------------------------------------
// Derived character
// ---------------------------------------------------------------------------
export type Severity = "error" | "warning";
export interface ValidationIssue {
  severity: Severity;
  message: string;
  step?: string;
}

export interface DerivedAttack {
  id: string;
  name: string;
  sourceItemId: string | null;
  attackBonus: number;
  attackFormula: string;
  damageFormula: string;
  damageType: string;
  extraDamage?: { formula: string; type: string; label: string }[];
  traits: string[];
  hands: number;
  ranged: boolean;
  notes: string;
}

export interface CharacterContext {
  ancestry?: Ancestry | null;
  heritage?: Heritage | null;
  background?: Background | null;
  classData?: ClassData | null;
  deity?: Deity | null;
  feats: Record<string, Feat>;
  spells: Record<string, Spell>;
  equipment: Record<string, Equipment>;
  /** Bestiary entries linked to companion statblocks. */
  monsters?: Record<string, Monster>;
  /** Lowercased names of every feat in the compendium, used for prerequisite checks. */
  featNames?: string[];
  /** Campaign variant: grant an extra archetype feat at every even level. */
  freeArchetype?: boolean;
  /** Campaign variant: apply automatic bonus progression to attacks and defenses. */
  automaticBonusProgression?: boolean;
}

export interface DerivedSkill {
  id: string;
  name: string;
  ability: AbilityKey;
  rank: number;
  mod: number;
  trained: boolean;
}

export interface DerivedLore {
  name: string;
  mod: number;
  rank: number;
}

export interface DerivedCharacter {
  abilities: Record<AbilityKey, number>;
  abilityMods: Record<AbilityKey, number>;
  classKeyOptions: AbilityKey[];
  prof: {
    perception: number;
    fortitude: number;
    reflex: number;
    will: number;
    attacks: Record<string, number>;
    defenses: Record<string, number>;
    spellcasting: number;
    classDc: number;
  };
  maxHp: number;
  currentHp: number;
  tempHp: number;
  ac: number;
  shieldBonus: number;
  shield: {
    name: string;
    hardness: number;
    hp: number;
    brokenThreshold: number;
    raised: boolean;
  } | null;
  speed: number;
  otherSpeeds: { type: string; value: number }[];
  perception: number;
  initiative: number;
  saves: Record<SaveKey, number>;
  /** Class features that turn a successful save into a critical success. */
  saveUpgrades: Record<SaveKey, boolean>;
  skills: DerivedSkill[];
  lore: DerivedLore[];
  classDc: number;
  spellDc: number | null;
  spellAttack: number | null;
  /** Spell attack/DC for focus spells from a class that does not grant slots. */
  focusSpellDc: number | null;
  focusSpellAttack: number | null;
  /** Innate spells use their own Charisma-based proficiency. */
  innateSpellDc: number | null;
  innateSpellAttack: number | null;
  attacks: DerivedAttack[];
  spellSlots: number[] | null;
  spellSlotsNote: string | null;
  /** Magus studious slots at 7th level and later, with their allowed spells. */
  studiousSlots: StudiousSlotInfo | null;
  /** Animist prepared/spontaneous split, attunement, and repertoire. */
  animistApparitions: AnimistApparitionInfo | null;
  /** Cleric divine font slots, tracked separately from ordinary slots. */
  divineFontSlots: number | null;
  divineFontRank: number | null;
  focusPointsMax: number;
  size: string;
  languages: string[];
  senses: string[];
  /** Manual tracking notes for partly automated feat/item effects. */
  notes: string[];
  equipment: CharacterEquipment[];
  bulk: { total: number; capacity: number; encumbered: boolean; max: number };
  /** Maximum invested items, including feats such as Incredible Investiture. */
  investedLimit: number;
  wealth: {
    budget: number | null;
    spent: number;
    currencyCp: number;
    committed: number;
    remaining: number | null;
  };
  features: FeatureSummary[];
  selectedFeats: Feat[];
  grantedFeats: { name: string; id: string | null; source?: string }[];
  /** Spells granted by a class choice and not consumed by normal slots. */
  grantedSpells: ClassGrantSpell[];
  casterTradition: SpellTradition | null;
  casterProgression: CasterProgression;
  /** Spellcasting archetype dedication profile, including its own cantrips and DC. */
  multiclassCaster?: {
    featId: string;
    className: string;
    tradition: SpellTradition | null;
    variableTradition?: boolean;
    ability: AbilityKey;
    cantripLimit: number;
    spellSlots: number[];
    spellDc: number;
    spellAttack: number;
  } | null;
  maxSpellRank: number;
  validation: ValidationIssue[];
  /** Condition math already folded into AC, saves, checks, DCs, HP, and Speed. */
  conditionEffects: ConditionModifiers;
  xp: number;
}

// ---------------------------------------------------------------------------
// Table / campaign
// ---------------------------------------------------------------------------
export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  isAdmin: boolean;
}

/** A signed-in device. The id is an opaque session hash, never the cookie. */
export interface AuthSession {
  id: string;
  current: boolean;
  userAgent: string;
  ip: string;
  createdAt: number;
  lastSeenAt: number;
  expiresAt: number;
}

/** Administrator-facing account row with moderation state. */
export interface AdminUser {
  id: string;
  username: string;
  displayName: string;
  isAdmin: boolean;
  createdAt: number;
  disabledAt: number | null;
  disabledReason: string;
  sessionCount: number;
  lastSeenAt: number | null;
}

export interface CampaignMember extends PublicUser {
  role: "gm" | "player";
  joinedAt: number;
  online?: boolean;
}

/** A Pathbuilder import waiting for the campaign GM to approve it. */
export interface PendingJoinRequest {
  id: string;
  characterId: string | null;
  characterName: string;
  createdAt: number;
  report: PathbuilderImportReport | null;
}

/** GM-facing view of a pending join request, including review details. */
export interface CampaignJoinRequest extends PendingJoinRequest {
  campaignId: string;
  userId: string;
  status: "pending" | "approved" | "declined";
  source: "pathbuilder" | "existing";
  playerName: string;
  playerUsername: string;
  summary: CharacterSummary | null;
  validation: ValidationIssue[];
}

/** Player-initiated actions that wait for the GM's approval. */
export type CampaignRequestKind = "level-up" | "journal";
export type CampaignRequestStatus = "pending" | "approved" | "denied" | "withdrawn";

/**
 * A queued player request. The server keeps the validated payload so approval
 * can apply the exact action the player proposed.
 */
export interface CampaignRequest {
  id: string;
  campaignId: string;
  characterId: string | null;
  characterName: string;
  kind: CampaignRequestKind;
  title: string;
  detail: string;
  note: string;
  status: CampaignRequestStatus;
  playerId: string;
  playerName: string;
  gmNote: string;
  resolvedByName: string | null;
  createdAt: number;
  resolvedAt: number | null;
  payload: {
    fromLevel?: number;
    toLevel?: number;
    title?: string;
    content?: string;
  };
}

export interface CampaignSummary {
  id: string;
  name: string;
  description: string;
  gmId: string;
  gmName: string;
  inviteCode: string;
  role: "gm" | "player";
  ruleset: CampaignRuleset;
  xpMode: XpMode;
  advancementSpeed: AdvancementSpeed;
  /** Campaign variant: grant an extra archetype feat at every even level. */
  freeArchetype: boolean;
  /** Campaign variant: grant automatic attack/defense/save/Perception/skill potency. */
  automaticBonusProgression: boolean;
  /** Players may add compendium gear without paying, when the GM allows it. */
  playerItemGrant: boolean;
  /** Current in-world date for this campaign. */
  worldDate: GolarionDate;
  memberCount: number;
  characterCount: number;
  /** Pending join requests, shown to the GM only. */
  pendingJoinRequests?: number;
  createdAt: number;
  updatedAt: number;
  lastPlayedAt: number | null;
}

export interface CampaignSessionZero {
  campaignId: string;
  pitch: string;
  genre: string;
  tone: string;
  themes: string;
  expectations: string;
  houseRules: string;
  contentLimits: string;
  safetyTools: string;
  /** Books, supplements, and optional rules the table allows. */
  allowedSources: string;
  /** The shared reason the party is together. */
  partyGoal: string;
  /** Per-character or per-player ties to the party and its goal. */
  partyHooks: string;
  checklist: Record<string, boolean>;
  /** GM-only notes; omitted from player responses. */
  gmNotes?: string;
  updatedAt: number;
}

export interface EncounterCombatant {
  id: string;
  encounterId: string;
  monsterId: string | null;
  name: string;
  level: number;
  count: number;
  hp: number | null;
  ac: number | null;
  perception: number | null;
  notes: string;
  /** Reinforcement wave. Combatants in the same wave arrive together. */
  wave: number;
  sortOrder: number;
}

export interface Encounter {
  id: string;
  campaignId: string;
  name: string;
  description: string;
  sceneId: string | null;
  combatants: EncounterCombatant[];
  createdAt: number;
  updatedAt: number;
}

export type EncounterLaunchMode = "fresh" | "reinforce";

export interface EncounterWaveSummary {
  wave: number;
  combatants: number;
  creatures: number;
}

/** Party treasure by level from GM Core table 10-9 (four characters). */
export interface TreasureBudget {
  level: number;
  totalGp: number;
  currencyGp: number;
}

export type NpcAttitude = "hostile" | "unfriendly" | "indifferent" | "friendly" | "helpful";

export interface CampaignFaction {
  id: string;
  campaignId: string;
  name: string;
  description: string;
  goals: string;
  assets: string;
  attitude: NpcAttitude;
  reputation: number;
  visible: boolean;
  /** GM-only notes; omitted from player responses. */
  gmNotes?: string;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

export type CampaignNpcKind = "npc" | "hazard";
export type HazardComplexity = "simple" | "complex";

export interface CampaignNpc {
  id: string;
  campaignId: string;
  kind: CampaignNpcKind;
  complexity: HazardComplexity;
  name: string;
  level: number;
  hp: number | null;
  ac: number | null;
  perception: number | null;
  size: number;
  color: string;
  imageUrl: string | null;
  description: string;
  factionId: string | null;
  role: string;
  location: string;
  attitude: NpcAttitude;
  publicDescription: string;
  visible: boolean;
  /** Hazard trigger and timing. Empty for ordinary NPCs. */
  trigger: string;
  /** How the hazard can be disabled or avoided. */
  disable: string;
  /** Hazard routine or repeating effect. */
  routine: string;
  /** GM-only secrets; omitted from player responses. */
  secrets?: string;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

export interface CampaignKnowledgeEntry {
  id: string;
  campaignId: string;
  title: string;
  content: string;
  visible: boolean;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

export type ChapterStatus = "planned" | "active" | "complete";

export interface CampaignChapter {
  id: string;
  campaignId: string;
  title: string;
  summary: string;
  levelStart: number;
  levelEnd: number;
  status: ChapterStatus;
  /** When false, only the GM sees this chapter. */
  visible: boolean;
  /** GM-only prep notes; omitted from player responses. */
  gmNotes?: string;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

export type EncounterDifficulty = "trivial" | "low" | "moderate" | "severe" | "extreme" | "beyond";

export interface EncounterBudget {
  partyLevel: number;
  partySize: number;
  /** Sum of creature XP using the party level. This is the XP each PC earns. */
  awardXp: number;
  /** Adjusted budgets for this party size. */
  thresholds: Record<"trivial" | "low" | "moderate" | "severe" | "extreme", number>;
  difficulty: EncounterDifficulty;
  /** XP required to reach the next difficulty, or null at extreme+. */
  nextThreshold: number | null;
}

export interface Campaign extends CampaignSummary {
  members: CampaignMember[];
  characters: CharacterRecord[];
}

export interface Scene {
  id: string;
  campaignId: string;
  name: string;
  imageUrl: string | null;
  /** Generated small preview used by scene pickers. */
  thumbnailUrl: string | null;
  width: number;
  height: number;
  gridSize: number;
  gridOffsetX: number;
  gridOffsetY: number;
  fogEnabled: boolean;
  revealed: string[];
  /** Shared area templates placed on this scene. */
  templates: AoeTemplate[];
  /** GM-drawn walls and doors. Walls and closed doors block sight. */
  walls: Wall[];
  /** Use wall-based line-of-sight fog for players instead of manual reveal only. */
  losEnabled: boolean;
  /** When enabled, walls and closed doors block token movement. */
  wallCollision: boolean;
  /** Ambient light level used by the token lighting model. */
  ambientLight: AmbientLight;
  /** Shared party perception or each player sees only from their own tokens. */
  visionScope: PartyVisionScope;
  /** Decorative ground and overhead props placed by the GM. */
  props: SceneProp[];
  /** Shared freehand annotations drawn on top of the map. */
  drawings: SceneDrawing[];
  /** When enabled, every prop on the scene blocks token movement. */
  propCollision: boolean;
  /** When false, only the GM receives this scene and its tokens. */
  visible: boolean;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

/** A shared freehand annotation on a scene. */
export interface SceneDrawing {
  id: string;
  /** User who drew the stroke. The GM may erase any stroke. */
  ownerId: string;
  ownerName: string;
  /** Flat scene-pixel coordinates: [x1, y1, x2, y2, ...]. */
  points: number[];
  /** CSS hex color. */
  color: string;
  /** Stroke width in scene pixels. */
  width: number;
  createdAt: number;
}

export interface TokenCondition {
  name: string;
  /** Numeric value for conditions such as Frightened 2 or Clumsy 1. */
  value?: number | null;
  /** Remaining duration in rounds, when tracked. */
  duration?: number | null;
}

export type WallKind = "wall" | "door";

export interface Wall {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  kind: WallKind;
  /** Only meaningful for doors. Open doors no longer block sight. */
  open?: boolean;
  /** GM-only wall: excluded from player snapshots and player line of sight. */
  hidden: boolean;
}

export type AmbientLight = "bright" | "dim" | "darkness";
export type TokenVisionMode = "normal" | "low-light" | "darkvision";
export type PartyVisionScope = "shared" | "per-player";

export type ScenePropLayer = "ground" | "overhead";

export interface SceneProp {
  id: string;
  name: string;
  imageUrl: string;
  /** Center position in scene pixels. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Rotation in degrees. */
  rotation: number;
  layer: ScenePropLayer;
  visible: boolean;
  locked: boolean;
  /** Draw order within the prop layer. */
  z: number;
}

export interface Token {
  id: string;
  sceneId: string;
  name: string;
  imageUrl: string | null;
  /** Server-provided archetype art when no custom image is set. */
  defaultImageUrl?: string | null;
  characterId: string | null;
  /** Bestiary source for an unlinked monster token, used for defenses. */
  monsterId?: string | null;
  ownerId: string | null;
  ownerName?: string;
  x: number;
  y: number;
  size: number;
  /** Per-token sight radius in feet. 0 disables vision from this token. */
  visionRadius: number;
  /** Light emitted by this token in feet of bright light. 0 emits no light. */
  lightRadius: number;
  /** Hex color used to tint this token's light. */
  lightColor: string;
  /** Senses used when calculating what this token can see. */
  visionMode: TokenVisionMode;
  color: string;
  hpCurrent: number | null;
  hpMax: number | null;
  ac: number | null;
  /** Perception-style bonus added when initiative is rolled for this token. */
  initiativeBonus?: number | null;
  /** Tokens with the same group id move and roll initiative together. */
  groupId?: string | null;
  groupName?: string | null;
  conditions: TokenCondition[];
  /** Fast healing, regeneration, and persistent damage for unlinked tokens. */
  turnEffects: TokenTurnEffects;
  hidden: boolean;
  locked: boolean;
  sortOrder: number;
}

export interface InitiativeEntry {
  id: string;
  tokenId: string | null;
  name: string;
  initiative: number;
  color: string;
  ownerId: string | null;
  sceneId: string | null;
  /** Set when one initiative entry represents a whole token group. */
  groupId?: string | null;
  /** Manual ordering within an initiative tie. */
  tieBreak?: number;
  /** Perception modifier used as the default tie break. */
  perception?: number;
  /** The combatant chose to delay their turn. */
  delayed?: boolean;
  /** The combatant readied an action. */
  readied?: boolean;
  /** Feet moved during the current turn. */
  movementUsed?: number;
  /** Diagonal steps taken during the current turn, for PF2e 5/10 diagonals. */
  diagonalSteps?: number;
  /** Actions spent during the current turn, 0-3. */
  actionsUsed?: number;
  /** Reactions spent since the start of this combatant's most recent turn, 0-1. */
  reactionsUsed?: number;
}

export type JournalKind = "note" | "handout";

export interface JournalAttachment {
  id: string;
  name: string;
  url: string;
  mimeType: string;
}

export interface CampaignAsset {
  filename: string;
  url: string;
  name: string;
  mimeType: string;
  size: number;
  createdAt: number;
  /** Human-readable places in this campaign that reference the image. */
  usage: string[];
  unused: boolean;
  /** True when no table in any campaign references the file. */
  deletable: boolean;
  /** The image is no longer used here but is still referenced elsewhere. */
  usedElsewhere: boolean;
}

export type QuestStatus = "none" | "active" | "completed" | "failed";

export interface JournalEntry {
  id: string;
  campaignId: string;
  title: string;
  content: string;
  visible: boolean;
  kind: JournalKind;
  attachments: JournalAttachment[];
  /** Optional quest tracking on handouts. */
  questStatus: QuestStatus;
  /** XP reward paid when the quest is completed. */
  questXp: number;
  /** Set once the quest reward has been paid. */
  questRewardedAt: number | null;
  createdBy: string | null;
  authorName: string;
  createdAt: number;
  updatedAt: number;
}

export interface CampaignAudioTrack {
  id: string;
  campaignId: string;
  name: string;
  url: string;
  mimeType: string;
  size: number;
  sortOrder: number;
  createdAt: number;
}

export type AudioMood = "battle" | "exploration" | "tavern" | "relaxing" | "mystery";

/** A bundled, openly licensed track the GM can add to a campaign soundtrack. */
export interface AudioLibraryTrack {
  id: string;
  title: string;
  mood: AudioMood;
  url: string;
  mimeType: string;
  size: number;
  author: string;
  license: string;
  sourceUrl: string;
  sortOrder: number;
  /** True when the track is already in the campaign soundtrack. */
  added?: boolean;
}

export interface CampaignAudioState {
  trackId: string | null;
  playing: boolean;
  /** Playback position in seconds when the state was last changed. */
  position: number;
  /** Server timestamp for extending the position while playing. */
  updatedAt: number;
  /** Server timestamp when this snapshot was serialized, for clock-skew-safe sync. */
  serverTime: number;
}

export interface CampaignTable {
  campaign: {
    id: string;
    name: string;
    description: string;
    gmId: string;
    inviteCode: string;
    role: "gm" | "player";
    ruleset: CampaignRuleset;
    xpMode: XpMode;
    advancementSpeed: AdvancementSpeed;
  };
  members: CampaignMember[];
  characters: CharacterRecord[];
  scenes: Scene[];
  tokens: Token[];
  activeSceneId: string | null;
  initiative: InitiativeEntry[];
  round: number;
  turnIndex: number;
  messages: ChatMessage[];
  journal: JournalEntry[];
  audioTracks: CampaignAudioTrack[];
  audioState: CampaignAudioState;
  /** Monotonic campaign revision for detecting missed socket events. */
  revision: number;
}

export type DegreeOfSuccess = "critical-success" | "success" | "failure" | "critical-failure";

export interface DiceTerm {
  type: "dice";
  count: number;
  sides: number;
  results: number[];
  kept: number[];
  subtotal: number;
}

export interface RollResult {
  formula: string;
  total: number;
  terms: DiceTerm[];
  constants: { value: number; sign: 1 | -1 }[];
  breakdown: string;
  d20: number | null;
  dc: number | null;
  degree: DegreeOfSuccess | null;
  label: string;
  /** A class feature such as Evasion improved a success to a critical success. */
  degreeUpgraded?: boolean;
  /** Set when this roll answered a GM request. */
  requestId?: string | null;
}

/** A GM request for someone at the table to make a roll. */
export interface RollRequest {
  formula: string;
  label: string;
  dc: number | null;
  /** True when the GM asked the whole table for the same check. */
  group?: boolean;
  /** Message id used to match player responses. */
  requestId?: string;
}

export interface ChatMessage {
  id: string;
  campaignId: string;
  sceneId: string | null;
  userId: string | null;
  authorName: string;
  type: "chat" | "roll" | "request" | "system";
  content: string;
  data: RollResult | RollRequest | null;
  visibility: "all" | "gm";
  createdAt: number;
}

export interface PresenceUser {
  userId: string;
  socketId: string;
  displayName: string;
  role: "gm" | "player";
  avatarUrl: string | null;
}

export interface ClientToServerEvents {
  "campaign:join": (payload: { campaignId: string }, ack?: (ok: unknown) => void) => void;
  "campaign:leave": (payload: { campaignId: string }) => void;
  "token:move": (payload: {
    campaignId: string;
    sceneId: string;
    tokenId: string;
    x: number;
    y: number;
  }) => void;
  "token:create": (
    payload: { campaignId: string; sceneId: string; token: Partial<Token> },
    ack?: (token: Token | null) => void
  ) => void;
  "token:update": (payload: { campaignId: string; token: Partial<Token> & { id: string } }) => void;
  "token:damage": (
    payload: {
      campaignId: string;
      tokenId: string;
      amount: number;
      critical?: boolean;
      damageType?: string;
      nonlethal?: boolean;
    },
    ack?: (result: { applied: number; notes: string[] }) => void
  ) => void;
  "token:delete": (payload: { campaignId: string; tokenId: string }) => void;
  "fog:update": (payload: {
    campaignId: string;
    sceneId: string;
    cells: string[];
    mode: "reveal" | "hide" | "replace";
  }) => void;
  "scene:activate": (
    payload: { campaignId: string; sceneId: string },
    ack?: (result: { ok: boolean; error?: string }) => void
  ) => void;
  "scene:update": (payload: { campaignId: string; scene: Partial<Scene> & { id: string } }) => void;
  "scene:create": (
    payload: { campaignId: string; scene: Partial<Scene> },
    ack?: (scene: Scene | null) => void
  ) => void;
  "scene:delete": (payload: { campaignId: string; sceneId: string }) => void;
  "scene:reorder": (payload: { campaignId: string; sceneIds: string[] }) => void;
  "template:add": (payload: { campaignId: string; sceneId: string; template: AoeTemplate }) => void;
  "template:remove": (payload: { campaignId: string; sceneId: string; templateId: string }) => void;
  "template:clear": (payload: { campaignId: string; sceneId: string }) => void;
  "scene:walls": (payload: { campaignId: string; sceneId: string; walls: Wall[] }) => void;
  "scene:props": (payload: { campaignId: string; sceneId: string; props: SceneProp[] }) => void;
  "drawing:add": (
    payload: {
      campaignId: string;
      sceneId: string;
      drawing: Pick<SceneDrawing, "points" | "color" | "width">;
    },
    ack?: (drawing: SceneDrawing | null) => void
  ) => void;
  "drawing:erase": (payload: { campaignId: string; sceneId: string; drawingId: string }) => void;
  "drawing:clear": (payload: {
    campaignId: string;
    sceneId: string;
    scope: "mine" | "all";
  }) => void;
  "audio:update": (payload: {
    campaignId: string;
    trackId: string | null;
    playing: boolean;
    position: number;
  }) => void;
  "chat:send": (
    payload: { campaignId: string; content: string; visibility?: "all" | "gm" },
    ack?: (message: ChatMessage | null) => void
  ) => void;
  "dice:roll": (
    payload: {
      campaignId: string;
      formula: string;
      label?: string;
      dc?: number | null;
      visibility?: "all" | "gm";
      characterId?: string | null;
      requestId?: string | null;
      /** Upgrade a success to a critical success (Evasion, Juggernaut). */
      upgradeSuccess?: boolean;
    },
    ack?: (message: ChatMessage | null) => void
  ) => void;
  "dice:request": (
    payload: {
      campaignId: string;
      formula: string;
      label?: string;
      dc?: number | null;
      group?: boolean;
    },
    ack?: (message: ChatMessage | null) => void
  ) => void;
  "initiative:roll": (payload: {
    campaignId: string;
    sceneId: string;
    tokenIds?: string[];
  }) => void;
  "initiative:update": (payload: {
    campaignId: string;
    entries: InitiativeEntry[];
    round?: number;
    turnIndex?: number;
  }) => void;
  "initiative:next": (payload: { campaignId: string; direction?: 1 | -1 }) => void;
  "initiative:add": (payload: { campaignId: string; tokenId: string; value?: number }) => void;
  "initiative:reroll": (payload: { campaignId: string; entryId: string }) => void;
  "initiative:remove": (payload: { campaignId: string; entryId: string }) => void;
  pointer: (payload: { campaignId: string; sceneId: string; x: number; y: number }) => void;
}

export interface ServerToClientEvents {
  "presence:update": (users: PresenceUser[]) => void;
  "token:moved": (payload: { tokenId: string; sceneId: string; x: number; y: number }) => void;
  "token:created": (token: Token) => void;
  "token:updated": (token: Token) => void;
  "token:deleted": (payload: { tokenId: string; sceneId: string }) => void;
  "fog:updated": (payload: {
    sceneId: string;
    cells: string[];
    mode: "reveal" | "hide" | "replace";
  }) => void;
  "scene:activated": (payload: { sceneId: string }) => void;
  "scene:updated": (scene: Scene) => void;
  "scene:created": (scene: Scene) => void;
  "scene:deleted": (payload: { sceneId: string }) => void;
  "scenes:reordered": (scenes: Scene[]) => void;
  "scene:templates": (payload: { sceneId: string; templates: AoeTemplate[] }) => void;
  "scene:walls": (payload: { sceneId: string; walls: Wall[] }) => void;
  "scene:props": (payload: { sceneId: string; props: SceneProp[] }) => void;
  "scene:drawings": (payload: { sceneId: string; drawings: SceneDrawing[] }) => void;
  "audio:state": (payload: { campaignId: string; state: CampaignAudioState }) => void;
  "audio:tracks": (payload: { campaignId: string; tracks: CampaignAudioTrack[] }) => void;
  "chat:message": (message: ChatMessage) => void;
  "initiative:updated": (payload: {
    entries: InitiativeEntry[];
    round: number;
    turnIndex: number;
  }) => void;
  "pointer:show": (payload: {
    userId: string;
    displayName: string;
    sceneId: string;
    x: number;
    y: number;
  }) => void;
  "character:updated": (payload: {
    characterId: string;
    summary: CharacterSummary | null;
    name: string;
  }) => void;
  "character:created": (payload: { character: CharacterRecord }) => void;
  "character:removed": (payload: { characterId: string }) => void;
  "journal:created": (entry: JournalEntry) => void;
  "journal:updated": (entry: JournalEntry) => void;
  "journal:deleted": (payload: { entryId: string }) => void;
  "join-request:created": (payload: {
    requestId: string;
    characterName: string;
    playerName: string;
  }) => void;
  "join-request:updated": (payload: {
    requestId: string | null;
    status: "approved" | "declined" | "withdrawn";
  }) => void;
  "campaign-request:created": (payload: {
    requestId: string;
    kind: CampaignRequestKind;
    title: string;
    playerName: string;
  }) => void;
  "campaign-request:updated": (payload: {
    requestId: string;
    status: CampaignRequestStatus;
  }) => void;
  "campaign:revision": (payload: { revision: number }) => void;
  "campaign:updated": (campaign: CampaignSummary) => void;
  "safety:signal": (payload: { message: string; createdAt: number }) => void;
  "error:toast": (payload: { message: string }) => void;
}

export type AuthResponse = { user: PublicUser } | { error: string };

export type RegistrationMode = "open" | "invite" | "closed";

export interface RegistrationStatus {
  mode: RegistrationMode;
  bootstrap: boolean;
  inviteRequired: boolean;
  /** The first account must include the host's BOOTSTRAP_TOKEN. */
  bootstrapTokenRequired: boolean;
  /** Whether the host has actually configured BOOTSTRAP_TOKEN. */
  bootstrapTokenConfigured: boolean;
  canRegister: boolean;
  userCount: number;
}

export interface RegistrationInvite {
  id: string;
  code: string;
  note: string;
  createdAt: number;
  expiresAt: number | null;
  usedBy: string | null;
  usedByName: string | null;
  usedAt: number | null;
}

export interface AuditEntry {
  id: string;
  createdAt: number;
  actorId: string | null;
  actorName: string;
  action: string;
  targetType: string;
  targetId: string | null;
  detail: string;
  ip: string;
}
