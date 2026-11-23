import type { Equipment, Feat } from "./types";
import { featChoice, featEffect, featGrant, itemEffect } from "./effects";
import { isHandwrapsOfMightyBlows } from "./runes";

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
  /\b(bonus|penalty|resistance|weakness|condition|damage|speed|strike|check|save|dc|hp|hit points|proficiency|trained|expert|master|legendary|grant|gain|increase|reduce|immunity|sense|darkvision|low-light|circumstance|status|item bonus|action|reaction|attack|move|spell|focus|hero point|fortune|reroll|recall knowledge|exploration|downtime|craft|earn income|identify|maneuver|grapple|trip|shove|disarm|climb|swim|fall|jump|escape|squeeze|balance|track|sense direction|hide|sneak|ally|enemy)\b/i;

/**
 * Curated overrides can be added here as specific feats are verified. The
 * compendium does not carry structured rule elements for feats, so the default
 * is necessarily text-based and conservative.
 */
const FEAT_OVERRIDES: Record<string, AutomationInfo> = {
  // Diehard is applied by damage.ts when it raises the dying threshold.
  "feat:I0BhPWqYf1bbzEYg": {
    level: "full",
    reason: "Runehall raises your dying threshold to 5.",
  },
  // Robust Health is applied by the recovery and Battle Medicine routes.
  "feat:yTLGclKtWVFZLKIz": {
    level: "full",
    reason:
      "Runehall adds the extra recovery healing and shortens Battle Medicine immunity to 1 hour.",
  },
};

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
      Boolean(effect.apexAbilities?.length) ||
      Boolean(effect.specificWeaponProficiency?.length) ||
      Boolean(effect.investedLimit) ||
      Boolean(effect.ignoreArmorSpeedPenalty) ||
      Boolean(effect.speedPenaltyReduction) ||
      Boolean(effect.trainedSkills?.length) ||
      Boolean(effect.skillRanks) ||
      Boolean(effect.lore?.length) ||
      Boolean(effect.senses?.length) ||
      Boolean(effect.languages?.length);
    return numeric
      ? effect.notes?.length
        ? {
            level: "partial",
            reason: "Runehall applies the numeric effect; the remaining note needs table tracking.",
          }
        : { level: "full", reason: "Runehall applies this feat's mechanics to the sheet." }
      : { level: "partial", reason: "Runehall records the effect as a note for the table." };
  }
  if (featChoice(feat.id)) {
    return {
      level: "full",
      reason: "Choose the option in the builder; Runehall applies it to the sheet.",
    };
  }
  const grant = featGrant(feat.id);
  if (grant) {
    return grant.repeatable
      ? {
          level: "partial",
          reason:
            "Choose one granted feat in the builder; additional repeatable picks remain manual.",
        }
      : {
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
      Boolean(effect.apexAbilities?.length) ||
      Boolean(effect.hpPerLevel) ||
      Boolean(effect.speed);
    return numeric
      ? {
          level: "partial",
          reason:
            "Runehall applies the item and apex bonuses when the item is equipped and invested; activated or conditional effects may need tracking.",
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
  if (isHandwrapsOfMightyBlows(item)) {
    return {
      level: "partial",
      reason:
        "Rune bonuses apply to your unarmed strikes when the handwraps are equipped and invested; activated effects may need tracking.",
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
