import type { CharacterDraft, CharacterEquipment, Equipment } from "./types";

/** PF2e lets a character invest at most ten worn magic items. */
export const INVESTED_LIMIT = 10;

export type ItemUseKind = "consumable" | "charged" | "activate";

export interface ItemUseInfo {
  kind: ItemUseKind;
  label: "Use" | "Activate";
  /** Zero means the item has no limited-use tracker. */
  usesMax: number;
  /** Human-readable frequency such as "once per day". */
  frequency: string | null;
  healingFormula: string | null;
}

function normalizeFormula(value: string): string {
  return value.replace(/\s+/g, "").replace(/[−–]/g, "-");
}

/**
 * Pull the healing formula from item prose. PF2e descriptions use forms such
 * as `(2d8+5)[healing]`, `(2d6+7)[vitality,healing]`, or "regain 2d8 Hit
 * Points". Only healing items return a formula.
 */
export function itemHealingFormula(description: string): string | null {
  const text = String(description || "");
  const bracket = text.match(/(\d+d\d+(?:\s*[+-]\s*\d+)?)\s*\[[^\]]*healing[^\]]*\]/i);
  if (bracket) return normalizeFormula(bracket[1]);
  const parenthesized = text.match(/\((\d+d\d+(?:\s*[+-]\s*\d+)?)\)\s*\[[^\]]*healing[^\]]*\]/i);
  if (parenthesized) return normalizeFormula(parenthesized[1]);
  const regain = text.match(/regain\s+(\d+d\d+(?:\s*[+-]\s*\d+)?)\s+Hit Points/i);
  return regain ? normalizeFormula(regain[1]) : null;
}

function activationFrequency(description: string): string | null {
  const text = String(description || "");
  const strong = text.match(/<strong>\s*Frequency\s*<\/strong>\s*([^<.;]+)/i);
  if (strong) return strong[1].trim();
  const plain = text.match(/Frequency\s*[:—-]?\s*([^<.;]+)/i);
  return plain ? plain[1].trim() : null;
}

function hasActivation(description: string): boolean {
  return /<strong>\s*Activate|(?:^|<p>)\s*Activate\b/i.test(String(description || ""));
}

function isLimitedFrequency(frequency: string): boolean {
  return /once per\s+(?:day|hour|week|10 minutes|minute)/i.test(frequency);
}

/**
 * Describe how the sheet should present an item: a consumable stack that is
 * expended, a limited-use activation such as a wand or per-day ability, or a
 * free activation that only needs its rules text surfaced.
 */
export function itemUseInfo(item: Equipment | null | undefined): ItemUseInfo | null {
  if (!item) return null;
  const traits = (item.traits ?? []).map((trait) => trait.toLowerCase());
  const description = item.description ?? "";
  const healingFormula = itemHealingFormula(description);
  const frequency = activationFrequency(description);
  // Wands are permanent items even when the compendium types them as
  // consumables, so they must not spend their inventory stack on activation.
  if (traits.includes("wand")) {
    return {
      kind: "charged",
      label: "Activate",
      usesMax: 1,
      frequency: frequency ?? "once per day",
      healingFormula,
    };
  }
  if (item.consumable || item.type === "consumable" || traits.includes("consumable")) {
    return {
      kind: "consumable",
      label: "Use",
      usesMax: Math.max(1, Math.min(999, Math.round(item.consumable?.uses ?? 1))),
      frequency: null,
      healingFormula,
    };
  }
  if (traits.includes("staff")) {
    // A staff's charge pool depends on the caster's slots and preparation, so
    // the sheet surfaces the activation without guessing a charge cap.
    return hasActivation(description)
      ? {
          kind: "activate",
          label: "Activate",
          usesMax: 0,
          frequency,
          healingFormula,
        }
      : null;
  }
  if (hasActivation(description)) {
    if (frequency && isLimitedFrequency(frequency)) {
      return {
        kind: "charged",
        label: "Activate",
        usesMax: 1,
        frequency,
        healingFormula,
      };
    }
    return {
      kind: "activate",
      label: "Activate",
      usesMax: 0,
      frequency,
      healingFormula,
    };
  }
  return null;
}

export interface ItemActivationResult {
  draft: CharacterDraft;
  blocked: string | null;
  consumed: boolean;
  usedCharge: boolean;
  healingFormula: string | null;
  notes: string[];
}

function equipmentWithout(equipment: CharacterEquipment[], itemId: string): CharacterEquipment[] {
  return equipment.filter((entry) => entry.itemId !== itemId);
}

/**
 * Apply one use/activation to a draft. Consumables spend one from their stack;
 * charged items increment their daily tracker. Healing is returned as a
 * formula for the caller to roll and apply with the normal HP rules.
 */
export function activateItemOnDraft(
  draft: CharacterDraft,
  itemId: string,
  item: Equipment | null | undefined,
  options: { targetsSelf?: boolean } = {}
): ItemActivationResult {
  const info = itemUseInfo(item);
  const entry = draft.equipment.find((candidate) => candidate.itemId === itemId);
  const base: ItemActivationResult = {
    draft,
    blocked: null,
    consumed: false,
    usedCharge: false,
    healingFormula: null,
    notes: [],
  };
  if (!entry) return { ...base, blocked: "That item is no longer in the pack." };
  if (!info) {
    return { ...base, blocked: "That item has no activation the sheet can track." };
  }
  const name = item?.name ?? itemId;
  if (info.kind === "consumable") {
    if (entry.quantity < 1) return { ...base, blocked: `${name} is out of stock.` };
    const usesMax = Math.max(1, Math.min(999, Math.round(info.usesMax || 1)));
    const healingFormula = options.targetsSelf === false ? null : info.healingFormula;
    if (usesMax > 1) {
      const storedMax =
        entry.usesKind === "consumable" && (entry.usesMax ?? 0) > 0
          ? Math.max(1, Math.min(999, Math.round(entry.usesMax!)))
          : usesMax;
      const used =
        entry.usesKind === "consumable"
          ? Math.max(0, Math.min(storedMax, Math.round(entry.usesUsed ?? 0)))
          : 0;
      if (used + 1 >= storedMax) {
        const equipment =
          entry.quantity > 1
            ? draft.equipment.map((candidate) =>
                candidate.itemId === itemId
                  ? {
                      ...candidate,
                      quantity: candidate.quantity - 1,
                      usesKind: "consumable" as const,
                      usesMax: storedMax,
                      usesUsed: 0,
                    }
                  : candidate
              )
            : equipmentWithout(draft.equipment, itemId);
        return {
          draft: { ...draft, equipment },
          blocked: null,
          consumed: true,
          usedCharge: false,
          healingFormula,
          notes: [
            `Used the last of ${name}.${
              entry.quantity > 1 ? ` ${entry.quantity - 1} left.` : " The stack is empty."
            }`,
            ...(healingFormula ? [`Roll ${healingFormula} healing.`] : []),
          ],
        };
      }
      const equipment = draft.equipment.map((candidate) =>
        candidate.itemId === itemId
          ? {
              ...candidate,
              usesKind: "consumable" as const,
              usesMax: storedMax,
              usesUsed: used + 1,
            }
          : candidate
      );
      return {
        draft: { ...draft, equipment },
        blocked: null,
        consumed: false,
        usedCharge: false,
        healingFormula,
        notes: [
          `Used ${name}. ${storedMax - used - 1} use${
            storedMax - used - 1 === 1 ? "" : "s"
          } left on this item.`,
          ...(healingFormula ? [`Roll ${healingFormula} healing.`] : []),
        ],
      };
    }
    const equipment =
      entry.quantity > 1
        ? draft.equipment.map((candidate) =>
            candidate.itemId === itemId
              ? { ...candidate, quantity: candidate.quantity - 1 }
              : candidate
          )
        : equipmentWithout(draft.equipment, itemId);
    return {
      draft: { ...draft, equipment },
      blocked: null,
      consumed: true,
      usedCharge: false,
      healingFormula,
      notes: [
        `Used ${name}.${entry.quantity > 1 ? ` ${entry.quantity - 1} left.` : " The stack is empty."}`,
        ...(healingFormula ? [`Roll ${healingFormula} healing.`] : []),
      ],
    };
  }
  if (info.kind === "charged") {
    const storedMax = Math.max(0, Math.round(entry.usesMax ?? 0));
    const max = Math.max(0, Math.round(storedMax > 0 ? storedMax : info.usesMax));
    const used = Math.max(0, Math.round(entry.usesUsed ?? 0));
    if (max > 0 && used >= max) {
      return {
        ...base,
        blocked: `${name} has no uses left. Take a long rest or run daily preparations to reset it.`,
      };
    }
    const nextUsed = max > 0 ? Math.min(max, used + 1) : used;
    return {
      draft: {
        ...draft,
        equipment: draft.equipment.map((candidate) =>
          candidate.itemId === itemId
            ? { ...candidate, usesUsed: nextUsed, usesMax: max > 0 ? max : undefined }
            : candidate
        ),
      },
      blocked: null,
      consumed: false,
      usedCharge: true,
      healingFormula: options.targetsSelf === false ? null : info.healingFormula,
      notes: [
        `Activated ${name}${info.frequency ? ` (${info.frequency})` : ""}.`,
        ...(max > 0 ? [`${Math.max(0, max - nextUsed)} of ${max} uses left today.`] : []),
        ...(info.healingFormula && options.targetsSelf !== false
          ? [`Roll ${info.healingFormula} healing.`]
          : []),
      ],
    };
  }
  return {
    ...base,
    healingFormula: options.targetsSelf === false ? null : info.healingFormula,
    notes: [
      `Activated ${name}${info.frequency ? ` (${info.frequency})` : ""}. Resolve its rules text.`,
      ...(info.healingFormula && options.targetsSelf !== false
        ? [`Roll ${info.healingFormula} healing.`]
        : []),
    ],
  };
}

/** Daily preparations reset per-day item uses and empty charged staff pools. */
export function resetItemUses(draft: CharacterDraft): CharacterDraft {
  if (!draft.equipment.some((entry) => (entry.usesUsed ?? 0) > 0 || entry.usesKind === "charges")) {
    return draft;
  }
  return {
    ...draft,
    equipment: draft.equipment.map((entry) => {
      if (entry.usesKind === "charges") {
        const max = Math.max(0, Math.round(entry.usesMax ?? 0));
        return entry.usesUsed === max ? entry : { ...entry, usesUsed: max };
      }
      // Multi-use consumables do not refill at daily preparation.
      if (entry.usesKind === "consumable") return entry;
      return (entry.usesUsed ?? 0) > 0 ? { ...entry, usesUsed: 0 } : entry;
    }),
  };
}

export function investedCount(draft: CharacterDraft): number {
  return draft.equipment.reduce(
    (total, entry) =>
      entry.invested ? total + Math.max(0, Math.floor(Number(entry.quantity) || 0)) : total,
    0
  );
}

export interface InvestItemResult {
  draft: CharacterDraft;
  blocked: string | null;
}

/** Toggle investment while enforcing the ten-item limit. */
export function setItemInvested(
  draft: CharacterDraft,
  itemId: string,
  invested: boolean,
  limit = INVESTED_LIMIT
): InvestItemResult {
  const entry = draft.equipment.find((candidate) => candidate.itemId === itemId);
  if (!entry) return { draft, blocked: "That item is no longer in the pack." };
  if (entry.invested === invested) return { draft, blocked: null };
  const investedLimit = Math.max(INVESTED_LIMIT, Math.round(limit));
  if (invested && investedCount(draft) >= investedLimit) {
    return {
      draft,
      blocked: `You can invest at most ${investedLimit} items. Uninvest another item first.`,
    };
  }
  return {
    draft: {
      ...draft,
      equipment: draft.equipment.map((candidate) =>
        candidate.itemId === itemId ? { ...candidate, invested } : candidate
      ),
    },
    blocked: null,
  };
}
