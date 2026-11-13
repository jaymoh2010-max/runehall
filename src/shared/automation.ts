import type { Equipment, Feat } from "./types";
import { featChoice, featEffect, featGrant, itemEffect } from "./effects";

export type AutomationLevel = "full" | "partial" | "manual";

export interface AutomationInfo {
  level: AutomationLevel;
  reason: string;
}

export const AUTOMATION_LABELS: Record<AutomationLevel, string> = {
  full: "Automated",
  partial: "Partly automated",
  manual: "Manual",
};

export const AUTOMATION_HINTS: Record<AutomationLevel, string> = {
  full: "Runehall applies this option's mechanics to the sheet.",
  partial: "Runehall applies the structured parts; check the description for conditional effects.",
  manual: "Runehall does not apply this effect automatically. Track it yourself during play.",
};

const MECHANICAL_TEXT =
  /\b(bonus|penalty|resistance|weakness|condition|damage|speed|strike|check|save|dc|hp|hit points|proficiency|trained|expert|master|legendary|grant|gain|increase|reduce|immunity|sense|darkvision|low-light|circumstance|status|item bonus)\b/i;

/**
 * Curated overrides can be added here as specific feats are verified. The
 * compendium does not carry structured rule elements for feats, so the default
 * is necessarily text-based and conservative.
 */
const FEAT_OVERRIDES: Record<string, AutomationInfo> = {};

function plainText(html: string): string {
  return html.replace(/<[^>]+>/g, " ");
}

/**
 * Conservative automation labels. "Full" means the sheet math is expected to
 * match the option without extra bookkeeping. When in doubt, prefer "manual"
 * so the table knows what still needs a human.
 */
export function automationForFeat(feat: Feat): AutomationInfo {
  const override = FEAT_OVERRIDES[feat.id];
  if (override) return override;
  const effect = featEffect(feat.id);
  if (effect) {
    const numeric =
      Boolean(effect.hpPerLevel) ||
      Boolean(effect.speed) ||
      Boolean(effect.initiativeBonus) ||
      Boolean(effect.untrainedImprovisation) ||
      Boolean(effect.armorProficiency) ||
      Boolean(effect.weaponProficiency) ||
      Boolean(effect.senses?.length) ||
      Boolean(effect.languages?.length);
    return numeric
      ? { level: "full", reason: "Runehall applies this feat's mechanics to the sheet." }
      : { level: "partial", reason: "Runehall records the effect as a note for the table." };
  }
  if (featChoice(feat.id)) {
    return {
      level: "full",
      reason: "Choose the option in the builder; Runehall applies it to the sheet.",
    };
  }
  if (featGrant(feat.id)) {
    return {
      level: "full",
      reason: "Choose the granted feat in the builder; its effects apply to the sheet.",
    };
  }
  if (MECHANICAL_TEXT.test(plainText(feat.description))) {
    return {
      level: "manual",
      reason: "This feat's mechanical effect is not applied to the sheet automatically.",
    };
  }
  return {
    level: "full",
    reason: "No mechanical effect needs tracking for this feat.",
  };
}

export function automationForEquipment(item: Equipment): AutomationInfo {
  const effect = itemEffect(item.id);
  if (effect) {
    const numeric =
      Boolean(effect.skillItemBonus) ||
      Boolean(effect.perceptionItemBonus) ||
      Boolean(effect.saveItemBonus) ||
      Boolean(effect.acItemBonus) ||
      Boolean(effect.hpPerLevel) ||
      Boolean(effect.speed);
    return numeric
      ? {
          level: "partial",
          reason:
            "Runehall applies the item bonus; activated or conditional effects may need tracking.",
        }
      : {
          level: "manual",
          reason: "This item's effects are not applied to the sheet automatically.",
        };
  }
  const isBaseGear =
    item.level === 0 &&
    !item.traits?.includes("magical") &&
    Boolean(item.weapon || item.armor || item.shield);
  if (isBaseGear) {
    return {
      level: "full",
      reason: "Base weapon, armor, or shield math is applied to the sheet.",
    };
  }
  if (item.weapon || item.armor || item.shield) {
    return {
      level: "partial",
      reason:
        "Base gear math is applied; activated, conditional, or rune-like effects may need tracking.",
    };
  }
  return {
    level: "manual",
    reason: "This item's effects are not applied to the sheet automatically.",
  };
}
