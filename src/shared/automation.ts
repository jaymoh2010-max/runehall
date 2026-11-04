import type { Equipment, Feat } from "./types";

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
