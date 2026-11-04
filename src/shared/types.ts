// ---------------------------------------------------------------------------
// Core PF2e vocabulary
// ---------------------------------------------------------------------------
import type { AoeTemplate } from "./templates";

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

export const SKILL_BY_ID = Object.fromEntries(SKILLS.map((s) => [s.id, s])) as Record<SkillId, SkillDefinition>;

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

export interface Ancestry extends Publication {
  id: string;
  name: string;
  type: "ancestry";
  hp: number;
  size: string;
  speed: number;
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

export interface Spell extends Publication {
  id: string;
  name: string;
  type: "spell";
  rank: number;
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
  spells: Record<string, unknown>;
  sanctification: Record<string, unknown>;
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
}

// ---------------------------------------------------------------------------
// Character
// ---------------------------------------------------------------------------
export interface CharacterEquipment {
  itemId: string;
  quantity: number;
  equipped: boolean;
  invested?: boolean;
  /** Equipment IDs for runes etched onto this weapon, armor, or shield. */
  runes?: string[];
}

export interface CharacterCondition {
  name: string;
  value?: number | null;
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
  xp: number;
  shieldRaised: boolean;
}

export interface CharacterDraft {
  version: 1;
  name: string;
  level: number;
  /** Browsing preference: core content only, or the full compendium. */
  contentMode: ContentMode;
  /** Whether pre-remaster legacy options are allowed for this character. */
  includeLegacy: boolean;
  ancestryId: string | null;
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
    /** Player picks for background-granted Lore choices. */
    backgroundLore: string[];
  };
  feats: {
    ancestry: Record<string, string>;
    class: Record<string, string>;
    skill: Record<string, string>;
    general: Record<string, string>;
    extras: string[];
  };
  classChoices: Record<string, string[]>;
  spells: {
    tradition: SpellTradition | null;
    cantrips: string[];
    known: string[];
    /** Spell IDs prepared for the day by prepared casters. */
    prepared: string[];
    focus: string[];
    /** Divine font pips spent today (cleric heal/harm slots). */
    divineFontUsed: number;
    slotsUsed: Record<string, number>;
  };
  equipment: CharacterEquipment[];
  companions: CharacterCompanion[];
  currency: { gp: number; sp: number; cp: number };
  details: CharacterDetails;
  play: CharacterPlay;
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
  fortitude: number;
  reflex: number;
  will: number;
  classDc: number;
  spellDc: number | null;
  heroPoints: number;
  focusPoints: number;
  conditions: string[];
  portraitUrl: string | null;
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
  createdAt: number;
  updatedAt: number;
  /** Optimistic-lock version, incremented on every save. */
  revision: number;
  ownerName?: string;
  permissions?: { canEdit: boolean; canView: boolean };
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
  saves: Record<SaveKey, number>;
  skills: DerivedSkill[];
  lore: DerivedLore[];
  classDc: number;
  spellDc: number | null;
  spellAttack: number | null;
  attacks: DerivedAttack[];
  spellSlots: number[] | null;
  spellSlotsNote: string | null;
  /** Cleric divine font slots, tracked separately from ordinary slots. */
  divineFontSlots: number | null;
  divineFontRank: number | null;
  focusPointsMax: number;
  size: string;
  languages: string[];
  senses: string[];
  equipment: CharacterEquipment[];
  bulk: { total: number; capacity: number; encumbered: boolean; max: number };
  wealth: { budget: number; spent: number; remaining: number; currencyCp: number };
  features: FeatureSummary[];
  selectedFeats: Feat[];
  grantedFeats: { name: string; id: string | null }[];
  casterTradition: SpellTradition | null;
  casterProgression: CasterProgression;
  maxSpellRank: number;
  validation: ValidationIssue[];
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

export interface CampaignMember extends PublicUser {
  role: "gm" | "player";
  joinedAt: number;
  online?: boolean;
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
  memberCount: number;
  characterCount: number;
  createdAt: number;
  updatedAt: number;
  lastPlayedAt: number | null;
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

export interface LootItem {
  itemId: string;
  name: string;
  quantity: number;
}

export type LootParcelStatus = "open" | "distributed";

export interface LootParcel {
  id: string;
  campaignId: string;
  name: string;
  description: string;
  items: LootItem[];
  gp: number;
  sp: number;
  cp: number;
  status: LootParcelStatus;
  distributedTo: string | null;
  distributedToName: string | null;
  distributedAt: number | null;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

export interface CampaignThread {
  id: string;
  text: string;
  done: boolean;
  visible: boolean;
}

export type SessionStatus = "scheduled" | "played" | "canceled";
export type SessionAttendanceStatus =
  | "attended"
  | "late"
  | "absent"
  | "excused"
  | "unmarked";

export interface SessionAttendance {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  status: SessionAttendanceStatus;
  note: string;
}

export interface CampaignSession {
  id: string;
  campaignId: string;
  title: string;
  scheduledAt: number;
  durationMinutes: number;
  /** GM-only session notes. */
  notes: string;
  status: SessionStatus;
  attendance: SessionAttendance[];
  createdAt: number;
  updatedAt: number;
}

export interface CampaignNpc {
  id: string;
  campaignId: string;
  name: string;
  level: number;
  hp: number | null;
  ac: number | null;
  perception: number | null;
  size: number;
  color: string;
  imageUrl: string | null;
  description: string;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

export interface CampaignDashboard {
  campaignId: string;
  lastSessionSummary: string;
  nextSessionAt: number | null;
  nextSessionTeaser: string;
  nextSessionNotes: string;
  threads: CampaignThread[];
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
  width: number;
  height: number;
  gridSize: number;
  gridOffsetX: number;
  gridOffsetY: number;
  fogEnabled: boolean;
  revealed: string[];
  /** Shared area templates placed on this scene. */
  templates: AoeTemplate[];
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

export interface TokenCondition {
  name: string;
  /** Numeric value for conditions such as Frightened 2 or Clumsy 1. */
  value?: number | null;
  /** Remaining duration in rounds, when tracked. */
  duration?: number | null;
}

export interface Token {
  id: string;
  sceneId: string;
  name: string;
  imageUrl: string | null;
  characterId: string | null;
  ownerId: string | null;
  ownerName?: string;
  x: number;
  y: number;
  size: number;
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
}

export type JournalKind = "note" | "handout";

export interface JournalAttachment {
  id: string;
  name: string;
  url: string;
  mimeType: string;
}

export interface JournalEntry {
  id: string;
  campaignId: string;
  title: string;
  content: string;
  visible: boolean;
  kind: JournalKind;
  attachments: JournalAttachment[];
  createdBy: string | null;
  authorName: string;
  createdAt: number;
  updatedAt: number;
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
  /** Monotonic campaign revision for detecting missed socket events. */
  revision: number;
}

export type DegreeOfSuccess =
  | "critical-success"
  | "success"
  | "failure"
  | "critical-failure";

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
}

/** A GM request for someone at the table to make a roll. */
export interface RollRequest {
  formula: string;
  label: string;
  dc: number | null;
  /** True when the GM asked the whole table for the same check. */
  group?: boolean;
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
  "token:move": (payload: { campaignId: string; sceneId: string; tokenId: string; x: number; y: number }) => void;
  "token:create": (payload: { campaignId: string; sceneId: string; token: Partial<Token> }, ack?: (token: Token | null) => void) => void;
  "token:update": (payload: { campaignId: string; token: Partial<Token> & { id: string } }) => void;
  "token:delete": (payload: { campaignId: string; tokenId: string }) => void;
  "fog:update": (payload: { campaignId: string; sceneId: string; cells: string[]; mode: "reveal" | "hide" | "replace" }) => void;
  "scene:activate": (payload: { campaignId: string; sceneId: string }) => void;
  "scene:update": (payload: { campaignId: string; scene: Partial<Scene> & { id: string } }) => void;
  "scene:create": (payload: { campaignId: string; scene: Partial<Scene> }, ack?: (scene: Scene | null) => void) => void;
  "scene:delete": (payload: { campaignId: string; sceneId: string }) => void;
  "scene:reorder": (payload: { campaignId: string; sceneIds: string[] }) => void;
  "template:add": (payload: { campaignId: string; sceneId: string; template: AoeTemplate }) => void;
  "template:clear": (payload: { campaignId: string; sceneId: string }) => void;
  "chat:send": (payload: { campaignId: string; content: string; visibility?: "all" | "gm" }, ack?: (message: ChatMessage | null) => void) => void;
  "dice:roll": (payload: { campaignId: string; formula: string; label?: string; dc?: number | null; visibility?: "all" | "gm"; characterId?: string | null }, ack?: (message: ChatMessage | null) => void) => void;
  "dice:request": (payload: { campaignId: string; formula: string; label?: string; dc?: number | null; group?: boolean }, ack?: (message: ChatMessage | null) => void) => void;
  "initiative:roll": (payload: { campaignId: string; sceneId: string; tokenIds?: string[] }) => void;
  "initiative:update": (payload: { campaignId: string; entries: InitiativeEntry[]; round?: number; turnIndex?: number }) => void;
  "initiative:next": (payload: { campaignId: string; direction?: 1 | -1 }) => void;
  "initiative:add": (payload: { campaignId: string; tokenId: string; value?: number }) => void;
  "initiative:reroll": (payload: { campaignId: string; entryId: string }) => void;
  "initiative:remove": (payload: { campaignId: string; entryId: string }) => void;
  "pointer": (payload: { campaignId: string; sceneId: string; x: number; y: number }) => void;
}

export interface ServerToClientEvents {
  "presence:update": (users: PresenceUser[]) => void;
  "token:moved": (payload: { tokenId: string; sceneId: string; x: number; y: number }) => void;
  "token:created": (token: Token) => void;
  "token:updated": (token: Token) => void;
  "token:deleted": (payload: { tokenId: string; sceneId: string }) => void;
  "fog:updated": (payload: { sceneId: string; cells: string[]; mode: "reveal" | "hide" | "replace" }) => void;
  "scene:activated": (payload: { sceneId: string }) => void;
  "scene:updated": (scene: Scene) => void;
  "scene:created": (scene: Scene) => void;
  "scene:deleted": (payload: { sceneId: string }) => void;
  "scenes:reordered": (scenes: Scene[]) => void;
  "scene:templates": (payload: { sceneId: string; templates: AoeTemplate[] }) => void;
  "chat:message": (message: ChatMessage) => void;
  "initiative:updated": (payload: { entries: InitiativeEntry[]; round: number; turnIndex: number }) => void;
  "pointer:show": (payload: { userId: string; displayName: string; sceneId: string; x: number; y: number }) => void;
  "character:updated": (payload: { characterId: string; summary: CharacterSummary | null; name: string }) => void;
  "character:created": (payload: { character: CharacterRecord }) => void;
  "campaign:revision": (payload: { revision: number }) => void;
  "error:toast": (payload: { message: string }) => void;
}

export type AuthResponse = { user: PublicUser } | { error: string };

export type RegistrationMode = "open" | "invite" | "closed";

export interface RegistrationStatus {
  mode: RegistrationMode;
  bootstrap: boolean;
  inviteRequired: boolean;
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
