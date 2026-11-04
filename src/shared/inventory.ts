import type { CharacterCurrency, CharacterDraft, CharacterEquipment } from "./types";

const MAX_ITEM_QUANTITY = 9999;

function coin(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0;
}

export function currencyToCp(currency: Partial<CharacterCurrency>): number {
  return coin(currency.gp) * 100 + coin(currency.sp) * 10 + coin(currency.cp);
}

export function cpToCurrency(copper: number): CharacterCurrency {
  const total = Math.max(0, Math.floor(Number(copper) || 0));
  return {
    gp: Math.floor(total / 100),
    sp: Math.floor((total % 100) / 10),
    cp: total % 10,
  };
}

export function spendCurrency(
  currency: CharacterCurrency,
  amountCp: number,
): CharacterCurrency | null {
  const total = currencyToCp(currency);
  const spend = Math.max(0, Math.floor(Number(amountCp) || 0));
  if (spend <= 0 || spend > total) return null;
  return cpToCurrency(total - spend);
}

export function addCurrency(currency: CharacterCurrency, amountCp: number): CharacterCurrency {
  return cpToCurrency(currencyToCp(currency) + Math.max(0, Math.floor(Number(amountCp) || 0)));
}

/**
 * Remove a quantity of one item from a draft. A partial stack keeps its runes
 * on the source; transferring the whole stack moves the runes with it.
 */
export function removeItemQuantity(
  draft: CharacterDraft,
  itemId: string,
  quantity: number,
): { draft: CharacterDraft; moved: CharacterEquipment | null } {
  const index = draft.equipment.findIndex((entry) => entry.itemId === itemId);
  if (index < 0) return { draft, moved: null };
  const entry = draft.equipment[index];
  const amount = Math.max(
    1,
    Math.min(entry.quantity, MAX_ITEM_QUANTITY, Math.floor(Number(quantity) || 1)),
  );
  const wholeStack = amount >= entry.quantity;
  const moved: CharacterEquipment = {
    itemId: entry.itemId,
    quantity: amount,
    equipped: false,
    invested: false,
    runes: wholeStack ? [...(entry.runes ?? [])] : [],
  };
  const equipment = draft.equipment.flatMap((candidate, candidateIndex) => {
    if (candidateIndex !== index) return [candidate];
    const remaining = candidate.quantity - amount;
    return remaining > 0 ? [{ ...candidate, quantity: remaining }] : [];
  });
  return { draft: { ...draft, equipment }, moved };
}

/**
 * Add a transferred stack. Existing stacks keep their equipped/invested state
 * and gain the moved runes; a new stack arrives unequipped.
 */
export function addItemToDraft(draft: CharacterDraft, moved: CharacterEquipment): CharacterDraft {
  const quantity = Math.max(1, Math.min(MAX_ITEM_QUANTITY, Math.floor(moved.quantity) || 1));
  const existing = draft.equipment.find((entry) => entry.itemId === moved.itemId);
  if (existing) {
    return {
      ...draft,
      equipment: draft.equipment.map((entry) =>
        entry.itemId === moved.itemId
          ? {
              ...entry,
              quantity: Math.min(MAX_ITEM_QUANTITY, entry.quantity + quantity),
              runes: [...new Set([...(entry.runes ?? []), ...(moved.runes ?? [])])].slice(0, 12),
            }
          : entry,
      ),
    };
  }
  return {
    ...draft,
    equipment: [
      ...draft.equipment,
      {
        itemId: moved.itemId,
        quantity,
        equipped: false,
        invested: false,
        runes: [...new Set(moved.runes ?? [])].slice(0, 12),
      },
    ],
  };
}
