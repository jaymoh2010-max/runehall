/**
 * Structured, curated character effects. The compendium does not carry rule
 * elements for feats (only prose), so these are hand-verified mappings from a
 * compendium id to the sheet numbers it should change. This is intentionally
 * conservative: only unambiguous, always-on effects belong here. Anything
 * conditional or choice-driven stays on the "manual" label in automation.ts.
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

export function featEffect(id: string): EffectModifiers | undefined {
  return FEAT_EFFECTS[id];
}

/** Merge several modifiers into one, summing numeric fields and concatenating lists. */
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
  }
  return merged;
}

/** Collect the merged effect of the given feat ids (typically context.feats keys). */
export function collectFeatEffects(featIds: Iterable<string>): EffectModifiers {
  return mergeEffects([...featIds].map((id) => FEAT_EFFECTS[id]));
}
