import {
  SKILLS,
  type AbilityKey,
  type CharacterContext,
  type CharacterDraft,
  type SaveKey,
  type SkillId,
} from "./types";

/**
 * Structured, curated character effects. The compendium does not carry rule
 * elements for feats and most items (only prose), so these are hand-verified
 * mappings from a compendium id to the sheet numbers it should change. This is
 * intentionally conservative: only unambiguous, always-on effects belong here.
 * Anything conditional or choice-driven stays on the "manual" label in
 * automation.ts.
 */
export interface EffectModifiers {
  /** Added once per character level (e.g., Toughness gives +1 HP per level). */
  hpPerLevel?: number;
  /** Flat Speed adjustment in feet (e.g., Fleet gives +5). */
  speed?: number;
  /** Senses granted, e.g. "darkvision". Merged into the sheet senses. */
  senses?: string[];
  /** Languages granted. Merged into the sheet languages. */
  languages?: string[];
  /** Extra traits used by prerequisites, e.g. Aiuvarin counting as an elf. */
  traits?: string[];
  /** Skills trained by an always-on effect or heritage choice. */
  trainedSkills?: string[];
  /** Proficiency-rank floors for skills, e.g. Skilled Human at level 5. */
  skillRanks?: Record<string, number>;
  /** Always-on bonuses the sheet cannot fully model; surfaced as notes. */
  notes?: string[];
  /** Circumstance bonus to initiative (highest wins). */
  initiativeBonus?: number;
  /** Untrained skills use half level instead of +0 (Untrained Improvisation). */
  untrainedImprovisation?: boolean;
  /** Item bonuses to skills (highest per skill wins). */
  skillItemBonus?: Partial<Record<SkillId, number>>;
  /** Item bonus to Perception. */
  perceptionItemBonus?: number;
  /** Item bonuses to saves (highest per save wins). */
  saveItemBonus?: Partial<Record<SaveKey, number>>;
  /** Item bonus to AC. */
  acItemBonus?: number;
  /** Proficiency-rank floors keyed by perception, fortitude, reflex, or will. */
  proficiencyRanks?: Record<string, number>;
  /** Apex items raise the chosen ability modifier by 1 or to +4. */
  apexAbilities?: AbilityKey[];
  /** Additional worn magic items that can be invested beyond the base limit. */
  investedLimit?: number;
  /** Ignore the Speed penalty from worn armor. */
  ignoreArmorSpeedPenalty?: boolean;
  /** Reduce one Speed penalty by this many feet. */
  speedPenaltyReduction?: number;
  /** Train the next untrained armor category (Armor Proficiency). */
  armorProficiency?: boolean;
  /** Train martial weapons, or a chosen advanced weapon (Weapon Proficiency). */
  weaponProficiency?: boolean;
  /** Train specific weapons by name (for example, a clan pistol). */
  specificWeaponProficiency?: string[];
  /** Lore skills granted by a choice or effect. */
  lore?: { name: string; rank: number }[];
}

export const WEAPON_PROFICIENCY_ID = "feat:x9wxQ61HNkAVbDHr";

export interface FeatGrantDefinition {
  prompt: string;
  /** Restrict the granted feat pool. */
  category: "ancestry" | "class" | "skill" | "general";
  level: number;
  /** Repeatable feats can be selected more than once; only one grant is applied for now. */
  repeatable?: boolean;
}

/**
 * Feats that grant another feat. The builder stores the granted feat id in
 * draft.featChoices; contextForDraft resolves it into the character's feat map
 * so its own effects apply.
 */
export const FEAT_GRANTS: Record<string, FeatGrantDefinition> = {
  // Ancestral Paragon — gain a 1st-level ancestry feat.
  "feat:m7KjpkAAh9PptJsY": {
    prompt: "Choose a 1st-level ancestry feat",
    category: "ancestry",
    level: 1,
  },
  // Natural Ambition - gain a 1st-level class feat.
  "feat:PodajLVxqYSAqVox": {
    prompt: "Choose a 1st-level class feat",
    category: "class",
    level: 1,
  },
  // General Training - gain a 1st-level general feat. Repeatable at higher levels.
  "feat:D3SuA5MaKucO1flE": {
    prompt: "Choose a 1st-level general feat",
    category: "general",
    level: 1,
    repeatable: true,
  },
};

export function featGrant(id: string): FeatGrantDefinition | undefined {
  return FEAT_GRANTS[id];
}

/** Stable choice key for one selected instance of a granting feat. */
export function featGrantChoiceKey(featId: string, slotKey: string): string {
  return `grant:${featId}:${slotKey}`;
}

export function featGrantChoicePrefix(featId: string): string {
  return `grant:${featId}:`;
}

export interface FeatGrantInstance {
  featId: string;
  slotKey: string;
  grant: FeatGrantDefinition;
  choice: string | null;
}

/**
 * All selected instances of feats that grant another feat. Legacy drafts stored
 * a single choice under the feat id, so that key remains a fallback for the
 * first instance.
 */
export function selectedFeatGrantInstances(
  draft: Pick<CharacterDraft, "feats" | "featChoices">
): FeatGrantInstance[] {
  const out: FeatGrantInstance[] = [];
  const add = (featId: string, slotKey: string) => {
    const grant = FEAT_GRANTS[featId];
    if (!grant) return;
    const choice =
      draft.featChoices[featGrantChoiceKey(featId, slotKey)]?.[0]?.trim() ||
      draft.featChoices[featId]?.[0]?.trim() ||
      null;
    out.push({ featId, slotKey, grant, choice });
  };
  for (const bucket of ["ancestry", "class", "skill", "general", "freeArchetype"] as const) {
    for (const [level, featId] of Object.entries(draft.feats[bucket])) {
      add(featId, `${bucket}:${level}`);
    }
  }
  draft.feats.extras.forEach((featId, index) => add(featId, `extras:${index}`));
  return out;
}

export const GRANTED_FEAT_IDS = Object.keys(FEAT_GRANTS);

/**
 * Verified feat effects, keyed by compendium id. Add one entry per feat as it
 * is verified; automation.ts reads the same table to label the feat "Automated".
 */
export const FEAT_EFFECTS: Record<string, EffectModifiers> = {
  // Toughness — increase maximum HP by your level and reduce recovery DCs by 1.
  "feat:AmP0qu7c5dlBSath": { hpPerLevel: 1 },
  // Fleet — +5 feet Speed.
  "feat:Ux73dmoF8KnavyUD": { speed: 5 },
  // Incredible Initiative — +2 circumstance bonus to initiative rolls.
  "feat:2kwXTUjYYhoAGySr": { initiativeBonus: 2 },
  // Untrained Improvisation — untrained skill checks use half your level.
  "feat:9jGaBxLUtevZYcZO": { untrainedImprovisation: true },
  // Armor Proficiency — train the next untrained armor category.
  "feat:BStw1cANwx5baL6d": { armorProficiency: true },
  // Weapon Proficiency — train martial weapons, or a chosen advanced weapon.
  [WEAPON_PROFICIENCY_ID]: { weaponProficiency: true },
  // Diehard — you die at dying 5 instead of dying 4.
  "feat:I0BhPWqYf1bbzEYg": { notes: ["Die at dying 5 instead of dying 4."] },
  // Robust Health — extra healing and a shorter Battle Medicine immunity.
  "feat:yTLGclKtWVFZLKIz": {
    notes: [
      "Regain extra HP from Treat Wounds or Battle Medicine equal to your level; Battle Medicine immunity lasts 1 hour instead of 1 day.",
    ],
  },
  // Fast Recovery — faster rest healing and disease/poison stage reduction.
  "feat:N8Xz5fuW6o7GW124": {
    notes: [
      "Double HP from resting; reduce disease or poison stage by 2 on a success and 3 on a critical success (1/2 for virulent).",
    ],
  },
  // Nimble Elf — +5 feet Speed.
  "feat:kCO4r8NOm8E2T3eH": { speed: 5 },
  // Elven Instincts — +2 circumstance bonus to Perception rolls for initiative.
  "feat:4M36jGbeSDfZFM38": {
    initiativeBonus: 2,
    notes: ["Tie-breaking initiative against an opponent remains manual."],
  },
  // Proximity Alert — +2 circumstance bonus to Perception initiative rolls.
  "feat:enRKfPyCLU5FMUOX": { initiativeBonus: 2 },
  // Unconditional ancestry/class senses.
  "feat:e0Gz3tjd55A5ggYK": { senses: ["darkvision"] }, // Alabaster Eyes
  "feat:YG6OCTbbqZwqRTr3": {
    senses: ["darkvision"], // Arcane Eye
    notes: ["The See the Unseen innate spell and invisible-creature sight remain manual."],
  },
  "feat:qVk9htKv47niPmXS": { senses: ["darkvision"] }, // Deep Vision
  "feat:6ENHSzqg88J6dri6": { senses: ["darkvision"] }, // Elemental Eyes
  "feat:mAhmb9CkYe0J2bCD": { senses: ["darkvision"] }, // Elucidating Vision
  "feat:5EpkOj9CFOjt8vsK": { senses: ["darkvision"] }, // Eyes of Night
  "feat:hxCqQPjlyVI57vQt": { senses: ["darkvision"] }, // Gravesight
  "feat:WzJaArukCUf9hpeP": { senses: ["darkvision"] }, // Hag's Sight
  "feat:RDRNtaFEq9p6KzEO": { senses: ["darkvision"] }, // Jotun's Eyes
  "feat:sza9YDyDBSHbzCjc": { senses: ["darkvision"] }, // Nalinivati's Light
  "feat:akCO62yBCJLjjCZJ": { senses: ["darkvision"] }, // Nephilim Eyes
  "feat:cixf1uAQF2Y3w1Qx": { senses: ["darkvision"] }, // Nightvision Adaptation
  "feat:BNIAfaJPNCWKs3FN": { senses: ["darkvision"] }, // Nocturnal Tripkee
  "feat:SCgqIo8VQZZKZ1Ws": { senses: ["darkvision"] }, // Orc Sight
  "feat:NN1U8ifiURc0h4Fx": { senses: ["darkvision"] }, // Pierce the Darkness
  "feat:XM4zR0q9rBxjR3lG": { senses: ["darkvision"] }, // Darkseer
  "feat:akrj9t0lTrndmf0q": { senses: ["low-light vision"] }, // Canopy Sight
  "feat:sL2GmYve5NXJ0wc1": { senses: ["low-light vision"] }, // Gloomseer
  "feat:lkl5QaDb1mlSD7SC": {
    senses: ["darkvision", "low-light vision"], // Visual Fidelity
    notes: ["Seeing invisible creatures as translucent remains manual."],
  },
  "feat:c3FOqUTK6VJyuCzR": {
    senses: ["darkvision"], // Eyes of the Sea
    notes: ["Underwater visibility remains manual."],
  },
  "feat:CBJ3GZZsrAXioDNM": {
    senses: ["darkvision"], // Worm Sense
    notes: ["Tremorsense remains manual."],
  },
  "feat:3urmaBBJ1obyU90b": {
    senses: ["darkvision"], // Wild Hunter Dedication
    languages: ["Fey"],
    notes: ["The Additional Lore feat remains manual."],
  },
  // Incredible Investiture — increase the invested item limit from 10 to 12.
  "feat:4vu6P3cYoOOeUbLK": { investedLimit: 2 },
  // Unburdened Iron — ignore armor Speed penalties and reduce one other penalty by 5.
  "feat:C1R4wd6G46CAVIn7": {
    ignoreArmorSpeedPenalty: true,
    speedPenaltyReduction: 5,
  },
  // Clan Pistol — trained with a clan pistol; the social circumstance bonus is manual.
  "feat:LvVg83ZDj8mabcWF": {
    specificWeaponProficiency: ["clan pistol"],
    notes: [
      "Training with the clan pistol is applied. The +1 circumstance bonus while the pistol is visible remains manual.",
    ],
  },
  // Hellspawn — trained in Deception and Legal Lore, plus the Lie to Me feat.
  "feat:EXVHePH8alsTZ5TB": {
    trainedSkills: ["deception"],
    lore: [{ name: "Legal Lore", rank: 1 }],
    notes: [
      "If already trained in Deception, choose another skill. The Lie to Me feat remains manual.",
    ],
  },
  // Breath Control — longer breath holding and a bonus against inhaled threats.
  "feat:aJUXbe9HJVvv0Mxa": {
    notes: [
      "Hold your breath 25× longer; +1 circumstance to saves against inhaled threats, and a success becomes a critical success.",
    ],
  },
  // Common general/skill feats whose effects are situational but useful to
  // keep on the sheet instead of losing them in the feat description.
  "feat:6yPrvbSDaa8glLjn": {
    notes: [
      "Pet: track it as a companion. Its level equals yours; AC and saves use yours, Perception/Acrobatics/Stealth use 3 + level, and other skills use level.",
    ],
  },
  "feat:xT593tHyPkumPuzz": {
    notes: [
      "Improvised Repair: the patched item works as shoddy until it takes damage again; this restores no HP.",
    ],
  },
  "feat:Rq5wkA8DtsmbzoGV": {
    notes: [
      "Ride: Command an Animal while mounted automatically succeeds for a move action; the mount acts on your turn.",
    ],
  },
  "feat:fD9xjrnPfJ8aQxYA": {
    notes: [
      "Keen Follower: +3 circumstance to Follow the Expert behind an expert ally, or +4 behind a master; coordinate group checks manually.",
    ],
  },
  "feat:1Eceqc6zbMj2x0q9": {
    notes: [
      "Seasoned: +1 circumstance to Craft food and drink, or +2 if you are a master in the prerequisite skill.",
    ],
  },
  "feat:XmF4q4rzKWg55vG4": {
    notes: [
      "Assured Identification: a critical failure to Identify Magic becomes a failure; a cursed item you would misidentify is simply unidentified.",
    ],
  },
  "feat:38uOVS8fLZxraUrg": {
    notes: [
      "Pick up the Pace: the group can Hustle for as long as the member who could Hustle longest on their own.",
    ],
  },
  "feat:IlOQuCQIhjJpig3S": {
    notes: [
      "Quick Identification: Identify Magic takes 1 minute, or 3 actions at master and 1 action at legendary.",
    ],
  },
  "feat:jM72TjJ965jocBV8": {
    notes: [
      "Shield Block: reaction while your shield is raised; reduce physical damage by the shield's Hardness, then both you and the shield take the remainder.",
    ],
  },
  "feat:9QQnv7nFpsNCGE89": {
    notes: [
      "Thorough Search: Search at up to one quarter Speed for a +2 circumstance bonus to the secret Seek check; a success becomes a critical success.",
    ],
  },
  "feat:MZgE2yonw4HUAyMk": {
    notes: [
      "The Harder They Fall: +1 circumstance to AC and saves against one chosen Huge or larger creature for 1 round.",
    ],
  },
  "feat:8NnIrUijGD2Chl55": {
    notes: [
      "Speedrun Strats: Stride Acrobatics DC 15 for ±5 feet; a critical failure causes permanent paralysis (manual).",
    ],
  },
  "feat:1Bt7uCW2WI4sM84P": {
    notes: [
      "Dubious Knowledge: on a failed Recall Knowledge check, learn one correct fact and one false fact without knowing which is which.",
    ],
  },
  "feat:ZpAwFvTPiGJNp0wI": {
    notes: [
      "Unbound Torrent: cast Unfettered Movement once per day as a divine innate spell, heightened to a rank one lower than half your level rounded up.",
    ],
  },
  "feat:9oU92ttNdXEKFOGh": {
    notes: [
      "Free the Bound: an ally within reach Escapes with a +1 circumstance bonus and can Strike as a reaction without increasing MAP until both attacks are made.",
    ],
  },
  "feat:54yrFg10r680EVvJ": {
    notes: [
      "Bestiary Secrets: on a successful Track, also learn one weakness, resistance, immunity, or lowest save of the tracked monster.",
    ],
  },
  "feat:NMbOfl885pn0Yzu9": {
    notes: [
      "Prepare Elemental Medicine: spend 10 minutes and attempt Crafting, Herbalism Lore, or Medicine against the recipient's level DC; the medicine lasts 24 hours.",
    ],
  },
  "feat:uR62fVC9FyQAMCO1": {
    notes: [
      "Trick Magic Item: attempt the tradition skill check to activate a magic item temporarily; the item's normal activation still applies.",
    ],
  },
  "feat:5ttqjN59TWIMImc3": {
    notes: [
      "Myth Hunter: after Recall Knowledge against a mythic creature, your next Strike treats its mythic resistance as 2 lower (once per 10 minutes).",
    ],
  },
  "feat:v7Bt6hjmzYnLFLeG": {
    notes: [
      "Magical Shorthand: Learning a Spell takes 10 minutes; a success becomes a critical success, and downtime learning uses Earn Income rules.",
    ],
  },
  "feat:H3I2X0f7v4EzwxuN": {
    notes: [
      "Automatic Knowledge: choose an expert Recall Knowledge skill with Assurance; use Recall Knowledge as a free action once per round using Assurance.",
    ],
  },
  "feat:Lc4dJZivRwU3QEmT": {
    notes: [
      "Armor Assist: attempt Athletics or Warfare Lore (usually DC 15/20/25 by armor rarity) to halve the time to don armor for yourself or an ally.",
    ],
  },
  "feat:d2opppdcH19LrAgy": {
    notes: [
      "Tactical Acumen: use Warfare Lore to Recall Knowledge about troops; at legendary, reduce rarity DC adjustments by 5.",
    ],
  },
  "feat:MjQyTcV8Jiv1Jtln": {
    notes: [
      "Recognize Spell: automatically identify common spells of the listed rank or lower when trained in the tradition skill; higher ranks use the normal check.",
    ],
  },
  "feat:TZDQM59QbGDLheEM": {
    notes: [
      "Stifle Flames: +2 circumstance to checks to extinguish non-magical fire; flat checks to end persistent fire damage are DC 10 (or 5 with appropriate aid).",
    ],
  },
  "feat:qvLcZGsV0HP2O0CG": {
    notes: [
      "Battle Planner: spend 1 minute and attempt Warfare Lore to prepare a plan that reduces luck for the coming battle.",
    ],
  },
  "feat:nTHhkHfAItjrO9d9": {
    notes: [
      "Aurochs-Headed: +1 circumstance to Make an Impression or Coerce orcs; enemy orcs that see you take a -1 penalty to initiative.",
    ],
  },
  "feat:5YlHrBCZJmb6Q4Lz": {
    notes: [
      "Slippery Prey: reduce the multiple attack penalty for repeated Escape attempts based on your Acrobatics or Athletics proficiency.",
    ],
  },
};

/**
 * Verified equipment effects, keyed by compendium id. Currently skill items
 * whose always-on item bonus is unambiguous; their activated abilities remain
 * manual. Add entries one at a time as they are verified.
 */
export const ITEM_EFFECTS: Record<string, EffectModifiers> = {
  // Crafter's Eyepiece — +1 item bonus to Crafting.
  "item:RgNBGpBc9G2yw1C2": { skillItemBonus: { crafting: 1 } },
  // Healer's Gloves — +1 item bonus to Medicine.
  "item:o1zKhvYUUc1hE2AE": { skillItemBonus: { medicine: 1 } },
  // Boots of Elvenkind — +1 item bonus to Acrobatics.
  "item:T00Xa9aDwHxd60Zh": { skillItemBonus: { acrobatics: 1 } },
  // Demon Mask — +1 item bonus to Intimidation.
  "item:2gYZiUw9yjtb0yJY": { skillItemBonus: { intimidation: 1 } },
  // Ventriloquist's Ring — +1 item bonus to Deception.
  "item:1r6StS0irdvi5JHY": { skillItemBonus: { deception: 1 } },
  // Greater Crafter's Eyepiece — +2 item bonus to Crafting.
  "item:JSYtBZ7XblyAEFoV": { skillItemBonus: { crafting: 2 } },
  // Greater Healer's Gloves — +2 item bonus to Medicine.
  "item:0GOHTXBxs6H6ARBz": { skillItemBonus: { medicine: 2 } },
  // Greater Boots of Elvenkind — +2 item bonus to Acrobatics.
  "item:8NgA4PFFXZPZ9SSg": { skillItemBonus: { acrobatics: 2 } },
  // Cloak of Elvenkind — +1 item bonus to Stealth.
  "item:MNBnZn0b80Q7yHJM": { skillItemBonus: { stealth: 1 } },
  // Amulet of the Third Eye — +2 item bonus to Perception and an apex Wisdom boost.
  "item:mNgScZVAq037JuNb": {
    perceptionItemBonus: 2,
    apexAbilities: ["wis"],
  },
  // Bands of Force — +1 item bonus to AC and saving throws.
  "item:02q8s6sSicMkhs1l": {
    acItemBonus: 1,
    saveItemBonus: { fortitude: 1, reflex: 1, will: 1 },
    notes: ["Acts as armor with a maximum Dexterity modifier of +5."],
  },
  // Bands of Force (Greater) — +2 item bonus to AC and saving throws.
  "item:8mhSUxEvNuXDP8Ki": {
    acItemBonus: 2,
    saveItemBonus: { fortitude: 2, reflex: 2, will: 2 },
    notes: ["Acts as armor with a maximum Dexterity modifier of +5."],
  },
  // Bands of Force (Major) — +3 item bonus to AC and saving throws.
  "item:rqJzQawe3CbXiWnG": {
    acItemBonus: 3,
    saveItemBonus: { fortitude: 3, reflex: 3, will: 3 },
    notes: ["Acts as armor with a maximum Dexterity modifier of +5."],
  },
  // Belt of Giant Strength — +3 item bonus to Athletics and an apex Strength boost.
  "item:7utuH8VJjKEzKtNw": {
    skillItemBonus: { athletics: 3 },
    apexAbilities: ["str"],
  },
  // Bracers of Strength — +3 item bonus to Athletics and an apex Strength boost.
  "item:WOiCJSS2MicKCMVs": {
    skillItemBonus: { athletics: 3 },
    apexAbilities: ["str"],
  },
  // Bracers of Hammers — +3 item bonus to Athletics and an apex Strength boost.
  "item:tIta1GNQK6sSWnr6": {
    skillItemBonus: { athletics: 3 },
    apexAbilities: ["str"],
    notes: ["Disarm/Trip bonuses and damage remain manual."],
  },
  // Amulet of Kinship's Strength — +2 item bonus to Will saves (+3 against fear).
  "item:P9v4lpVpLlL7AGnw": {
    saveItemBonus: { will: 2 },
    notes: ["The +3 item bonus against fear effects remains conditional and manual."],
  },
  // Uzunjati Storytelling Amulet — +1 item bonus to Performance.
  "item:IIG33n6yrNjz07Ir": {
    skillItemBonus: { performance: 1 },
    notes: ["The Enamoring Story activation remains manual."],
  },
  // Assassin's Bracers (Type I) — +1 item bonus to AC and saving throws.
  "item:LWMlDUCdDGo1wJnF": {
    acItemBonus: 1,
    saveItemBonus: { fortitude: 1, reflex: 1, will: 1 },
    notes: [
      "Acts as armor with a maximum Dexterity modifier of +5. The Focus on the Doomed activation remains manual.",
    ],
  },
  // Assassin's Bracers (Type II) — +2 item bonus to AC and saving throws.
  "item:dtiYqfBG2BcLHX92": {
    acItemBonus: 2,
    saveItemBonus: { fortitude: 2, reflex: 2, will: 2 },
    notes: [
      "Acts as armor with a maximum Dexterity modifier of +5. The Focus on the Doomed activation remains manual.",
    ],
  },
  // Assassin's Bracers (Type III) — +3 item bonus to AC and saving throws.
  "item:9pUwExXYzndCJFYj": {
    acItemBonus: 3,
    saveItemBonus: { fortitude: 3, reflex: 3, will: 3 },
    notes: [
      "Acts as armor with a maximum Dexterity modifier of +5. The Focus on the Doomed activation remains manual.",
    ],
  },
};

export function featEffect(id: string): EffectModifiers | undefined {
  return FEAT_EFFECTS[id];
}

export interface FeatChoiceOption {
  id: string;
  label: string;
}

export interface FeatChoiceDefinition {
  prompt: string;
  /** A fixed select list, or a free-text field (for example, a Lore name). */
  kind?: "select" | "text";
  placeholder?: string;
  options: FeatChoiceOption[];
  /** Hide options that would have no effect for the current draft. */
  optionFilter?: (optionId: string, draft: CharacterDraft, context: CharacterContext) => boolean;
  /** Turn the chosen option into sheet modifiers for the character's level. */
  apply: (choice: string, level: number) => EffectModifiers;
}

/** Options that the builder should offer for the current draft. */
export function featChoiceOptions(
  definition: FeatChoiceDefinition,
  draft: CharacterDraft,
  context: CharacterContext
): FeatChoiceOption[] {
  return definition.optionFilter
    ? definition.options.filter((option) => definition.optionFilter!(option.id, draft, context))
    : definition.options;
}

function loreName(value: string): string {
  const clean = value.trim();
  if (!clean) return "";
  return /\blore$/i.test(clean) ? clean : `${clean} Lore`;
}

/**
 * Choice-driven feats. The builder stores the pick in draft.featChoices and
 * computeCharacter applies the result, so the badge can stay "Automated".
 */
export const FEAT_CHOICES: Record<string, FeatChoiceDefinition> = {
  // Canny Acumen — expert in one save or Perception, master at 17th level.
  "feat:i4yRvVwvXbGZDsD1": {
    prompt: "Choose a save or Perception",
    options: [
      { id: "fortitude", label: "Fortitude" },
      { id: "reflex", label: "Reflex" },
      { id: "will", label: "Will" },
      { id: "perception", label: "Perception" },
    ],
    apply: (choice, level) => ({ proficiencyRanks: { [choice]: level >= 17 ? 3 : 2 } }),
  },
  // Assurance — record the chosen skill; the "take 10" roll remains manual.
  "feat:W6Gl9ePmItfDHji0": {
    prompt: "Choose a skill for Assurance",
    options: SKILLS.map((skill) => ({ id: skill.id, label: skill.name })),
    apply: (choice) => {
      const skill = SKILLS.find((entry) => entry.id === choice);
      return skill
        ? {
            notes: [
              `Assurance (${skill.name}): treat the check as 10 + proficiency, ignoring other bonuses and penalties.`,
            ],
          }
        : {};
    },
  },
  // Skill Training — trained in the chosen skill. Repeatable picks beyond the
  // first share one stored choice, so automation.ts labels it partial.
  "feat:P6icK2DbRoZ3H6kc": {
    prompt: "Choose a skill",
    options: SKILLS.map((skill) => ({ id: skill.id, label: skill.name })),
    optionFilter: (choice, draft) => !draft.skills.trained.includes(choice),
    apply: (choice) =>
      SKILLS.some((skill) => skill.id === choice) ? { trainedSkills: [choice] } : {},
  },
  // Additional Lore — trained in a chosen Lore, scaling at 3rd/7th/15th.
  "feat:BocFD2KV0qgUC76x": {
    prompt: "Lore subcategory",
    kind: "text",
    placeholder: "e.g. Undead Lore",
    options: [],
    apply: (choice, level) => {
      const name = loreName(choice);
      if (!name) return {};
      return {
        lore: [{ name, rank: level >= 15 ? 4 : level >= 7 ? 3 : level >= 3 ? 2 : 1 }],
      };
    },
  },
};

export function featChoice(id: string): FeatChoiceDefinition | undefined {
  return FEAT_CHOICES[id];
}

/** Merge choice-driven feat effects for the selected feats. */
export function collectFeatChoiceEffects(
  featChoices: Record<string, string[] | undefined>,
  selectedFeatIds: Iterable<string>,
  level: number
): EffectModifiers {
  const ids = [...selectedFeatIds];
  return mergeEffects(
    ids.map((id) => {
      const definition = FEAT_CHOICES[id];
      const choice = featChoices[id]?.[0];
      return definition && choice ? definition.apply(choice, level) : undefined;
    })
  );
}

export function itemEffect(id: string): EffectModifiers | undefined {
  return ITEM_EFFECTS[id];
}

/** Merge several modifiers into one. Numbers sum; item bonuses take the highest per key. */
export function mergeEffects(effects: (EffectModifiers | undefined)[]): EffectModifiers {
  const merged: EffectModifiers = {};
  for (const effect of effects) {
    if (!effect) continue;
    if (effect.hpPerLevel) merged.hpPerLevel = (merged.hpPerLevel ?? 0) + effect.hpPerLevel;
    if (effect.speed) merged.speed = (merged.speed ?? 0) + effect.speed;
    if (effect.senses?.length) merged.senses = [...(merged.senses ?? []), ...effect.senses];
    if (effect.languages?.length)
      merged.languages = [...(merged.languages ?? []), ...effect.languages];
    if (effect.traits?.length) merged.traits = [...(merged.traits ?? []), ...effect.traits];
    if (effect.trainedSkills?.length)
      merged.trainedSkills = [...(merged.trainedSkills ?? []), ...effect.trainedSkills];
    if (effect.skillRanks) {
      merged.skillRanks ??= {};
      for (const [skill, rank] of Object.entries(effect.skillRanks)) {
        merged.skillRanks[skill] = Math.max(merged.skillRanks[skill] ?? 0, rank ?? 0);
      }
    }
    if (effect.notes?.length) merged.notes = [...(merged.notes ?? []), ...effect.notes];
    if (effect.initiativeBonus)
      merged.initiativeBonus = Math.max(merged.initiativeBonus ?? 0, effect.initiativeBonus);
    if (effect.untrainedImprovisation) merged.untrainedImprovisation = true;
    if (effect.skillItemBonus) {
      merged.skillItemBonus ??= {};
      for (const [skill, bonus] of Object.entries(effect.skillItemBonus)) {
        const key = skill as SkillId;
        merged.skillItemBonus[key] = Math.max(merged.skillItemBonus[key] ?? 0, bonus ?? 0);
      }
    }
    if (effect.perceptionItemBonus)
      merged.perceptionItemBonus = Math.max(
        merged.perceptionItemBonus ?? 0,
        effect.perceptionItemBonus
      );
    if (effect.saveItemBonus) {
      merged.saveItemBonus ??= {};
      for (const [save, bonus] of Object.entries(effect.saveItemBonus)) {
        const key = save as SaveKey;
        merged.saveItemBonus[key] = Math.max(merged.saveItemBonus[key] ?? 0, bonus ?? 0);
      }
    }
    if (effect.acItemBonus)
      merged.acItemBonus = Math.max(merged.acItemBonus ?? 0, effect.acItemBonus);
    if (effect.investedLimit)
      merged.investedLimit = (merged.investedLimit ?? 0) + effect.investedLimit;
    if (effect.ignoreArmorSpeedPenalty) merged.ignoreArmorSpeedPenalty = true;
    if (effect.speedPenaltyReduction)
      merged.speedPenaltyReduction = Math.max(
        merged.speedPenaltyReduction ?? 0,
        effect.speedPenaltyReduction
      );
    if (effect.proficiencyRanks) {
      merged.proficiencyRanks ??= {};
      for (const [key, rank] of Object.entries(effect.proficiencyRanks)) {
        merged.proficiencyRanks[key] = Math.max(merged.proficiencyRanks[key] ?? 0, rank ?? 0);
      }
    }
    if (effect.armorProficiency) merged.armorProficiency = true;
    if (effect.weaponProficiency) merged.weaponProficiency = true;
    if (effect.apexAbilities?.length) {
      merged.apexAbilities = [...(merged.apexAbilities ?? []), ...effect.apexAbilities];
    }
    if (effect.specificWeaponProficiency?.length) {
      merged.specificWeaponProficiency = [
        ...(merged.specificWeaponProficiency ?? []),
        ...effect.specificWeaponProficiency,
      ];
    }
    if (effect.lore?.length) merged.lore = [...(merged.lore ?? []), ...effect.lore];
  }
  return merged;
}

/** Collect the merged effect of the given feat ids (typically context.feats keys). */
export function collectFeatEffects(featIds: Iterable<string>): EffectModifiers {
  return mergeEffects([...featIds].map((id) => FEAT_EFFECTS[id]));
}

/** Collect the merged effect of the given equipped item ids. */
export function collectItemEffects(itemIds: Iterable<string>): EffectModifiers {
  return mergeEffects([...itemIds].map((id) => ITEM_EFFECTS[id]));
}
