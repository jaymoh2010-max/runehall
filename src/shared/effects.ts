import type { SaveKey, SkillId } from "./types";

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
}

/**
 * Verified feat effects, keyed by compendium id. Add one entry per feat as it
 * is verified; automation.ts reads the same table to label the feat "Automated".
 */
export const FEAT_EFFECTS: Record<string, EffectModifiers> = {
  // Toughness — increase maximum HP by your level.
  "feat:AmP0qu7c5dlBSath": { hpPerLevel: 1 },
  // Fleet — +5 feet Speed.
  "feat:Ux73dmoF8KnavyUD": { speed: 5 },
  // Incredible Initiative — +2 circumstance bonus to initiative rolls.
  "feat:2kwXTUjYYhoAGySr": { initiativeBonus: 2 },
  // Untrained Improvisation — untrained skill checks use half your level.
  "feat:9jGaBxLUtevZYcZO": { untrainedImprovisation: true },
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
  // Amulet of the Third Eye — +2 item bonus to Perception.
  "item:mNgScZVAq037JuNb": { perceptionItemBonus: 2 },
  // Bands of Force — +1 item bonus to AC and saving throws.
  "item:02q8s6sSicMkhs1l": {
    acItemBonus: 1,
    saveItemBonus: { fortitude: 1, reflex: 1, will: 1 },
  },
  // Bands of Force (Greater) — +2 item bonus to AC and saving throws.
  "item:8mhSUxEvNuXDP8Ki": {
    acItemBonus: 2,
    saveItemBonus: { fortitude: 2, reflex: 2, will: 2 },
  },
  // Bands of Force (Major) — +3 item bonus to AC and saving throws.
  "item:rqJzQawe3CbXiWnG": {
    acItemBonus: 3,
    saveItemBonus: { fortitude: 3, reflex: 3, will: 3 },
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
  options: FeatChoiceOption[];
  /** Turn the chosen option into sheet modifiers for the character's level. */
  apply: (choice: string, level: number) => EffectModifiers;
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
    if (effect.proficiencyRanks) {
      merged.proficiencyRanks ??= {};
      for (const [key, rank] of Object.entries(effect.proficiencyRanks)) {
        merged.proficiencyRanks[key] = Math.max(merged.proficiencyRanks[key] ?? 0, rank ?? 0);
      }
    }
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
