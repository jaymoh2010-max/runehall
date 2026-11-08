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
  /** Item bonuses to skills (highest per skill wins). */
  skillItemBonus?: Partial<Record<SkillId, number>>;
  /** Item bonus to Perception. */
  perceptionItemBonus?: number;
  /** Item bonuses to saves (highest per save wins). */
  saveItemBonus?: Partial<Record<SaveKey, number>>;
  /** Item bonus to AC. */
  acItemBonus?: number;
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
};

export function featEffect(id: string): EffectModifiers | undefined {
  return FEAT_EFFECTS[id];
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
