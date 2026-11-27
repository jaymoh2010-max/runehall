import type {
  AmmoKind,
  CharacterCurrency,
  CharacterCustomItem,
  CharacterDraft,
  CharacterEquipment,
  DerivedAttack,
  Equipment,
} from "./types";

export const MAX_ITEM_QUANTITY = 9999;

/** How many more of an item fit in an existing stack before it is full. */
export function remainingStackSpace(draft: CharacterDraft, itemId: string): number {
  const existing = draft.equipment.find((entry) => entry.itemId === itemId)?.quantity ?? 0;
  return Math.max(0, MAX_ITEM_QUANTITY - Math.max(0, Math.floor(existing)));
}

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

/**
 * PF2e counts 1,000 carried coins of any denomination as 1 Bulk. Only whole
 * thousands are added; fractional coin weight is left to the table.
 */
export function currencyBulk(currency: Partial<CharacterCurrency>): number {
  return Math.floor((coin(currency.gp) + coin(currency.sp) + coin(currency.cp)) / 1000);
}

export function formatCopper(cp: number): string {
  const safe = Math.max(0, Math.round(Number(cp) || 0));
  const gp = Math.floor(safe / 100);
  const sp = Math.floor((safe % 100) / 10);
  const copper = safe % 10;
  const parts: string[] = [];
  if (gp) parts.push(`${gp.toLocaleString("en-US")} gp`);
  if (sp) parts.push(`${sp} sp`);
  if (copper || !parts.length) parts.push(`${copper} cp`);
  return parts.join(" ");
}

export function spendCurrency(
  currency: CharacterCurrency,
  amountCp: number
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
 * Split an award into whole copper pieces without losing or creating coins.
 * Remainder copper goes to the earliest characters in the party.
 */
export function splitCurrencyEvenly(totalCp: number, count: number): number[] {
  const total = Math.max(0, Math.floor(Number(totalCp) || 0));
  const parts = Math.max(1, Math.floor(Number(count) || 1));
  const base = Math.floor(total / parts);
  const remainder = total % parts;
  return Array.from({ length: parts }, (_value, index) => base + (index < remainder ? 1 : 0));
}

/** Represent a player-authored item as a harmless compendium-shaped item. */
export function customItemToEquipment(item: CharacterCustomItem): Equipment {
  return {
    id: item.id,
    name: item.name,
    type: "custom",
    level: 0,
    price: { gp: 0, sp: 0, cp: 0, cpTotal: 0 },
    bulk: 0,
    rarity: "common",
    traits: ["custom"],
    usage: "",
    description: item.description,
    source: "Custom",
    license: "",
    remaster: true,
    playtest: false,
  };
}

/**
 * Remove a quantity of one item from a draft. A partial stack keeps its runes
 * on the source; transferring the whole stack moves the runes with it.
 */
export function removeItemQuantity(
  draft: CharacterDraft,
  itemId: string,
  quantity: number
): { draft: CharacterDraft; moved: CharacterEquipment | null } {
  const index = draft.equipment.findIndex((entry) => entry.itemId === itemId);
  if (index < 0) return { draft, moved: null };
  const entry = draft.equipment[index];
  const amount = Math.max(
    1,
    Math.min(entry.quantity, MAX_ITEM_QUANTITY, Math.floor(Number(quantity) || 1))
  );
  const wholeStack = amount >= entry.quantity;
  const moved: CharacterEquipment = {
    itemId: entry.itemId,
    quantity: amount,
    equipped: false,
    invested: false,
    ...(wholeStack && (entry.usesUsed ?? 0) > 0 ? { usesUsed: entry.usesUsed } : {}),
    ...(wholeStack && typeof entry.usesMax === "number" ? { usesMax: entry.usesMax } : {}),
    ...(wholeStack && entry.usesKind ? { usesKind: entry.usesKind } : {}),
    ...(wholeStack && typeof entry.staffBaseCharges === "number"
      ? { staffBaseCharges: entry.staffBaseCharges }
      : {}),
    runes: wholeStack ? [...(entry.runes ?? [])] : [],
  };
  const equipment = draft.equipment.flatMap((candidate, candidateIndex) => {
    if (candidateIndex !== index) return [candidate];
    const remaining = candidate.quantity - amount;
    return remaining > 0 ? [{ ...candidate, quantity: remaining }] : [];
  });
  return { draft: { ...draft, equipment }, moved };
}

/** Set a stack's quantity; zero or less removes the stack from the sheet. */
export function setItemQuantity(
  draft: CharacterDraft,
  itemId: string,
  quantity: number
): CharacterDraft {
  const target = Math.max(0, Math.min(MAX_ITEM_QUANTITY, Math.floor(Number(quantity) || 0)));
  if (target <= 0) {
    return {
      ...draft,
      equipment: draft.equipment.filter((entry) => entry.itemId !== itemId),
    };
  }
  return {
    ...draft,
    equipment: draft.equipment.map((entry) =>
      entry.itemId === itemId ? { ...entry, quantity: target } : entry
    ),
  };
}

/**
 * Sell a quantity of one item at half its purchase price and add the coins.
 * The caller supplies the unit price because it comes from the compendium.
 */
export function sellItemQuantity(
  draft: CharacterDraft,
  itemId: string,
  quantity: number,
  unitPriceCp: number
): { draft: CharacterDraft; sold: CharacterEquipment | null; earnedCp: number } {
  const { draft: next, moved } = removeItemQuantity(draft, itemId, quantity);
  if (!moved) return { draft, sold: null, earnedCp: 0 };
  const unitPrice = Math.max(0, Math.round(Number(unitPriceCp) || 0));
  const earnedCp = Math.floor((unitPrice * moved.quantity) / 2);
  return {
    draft: { ...next, currency: addCurrency(next.currency, earnedCp) },
    sold: moved,
    earnedCp,
  };
}

/**
 * Merge a transferred stack into an existing entry. Limited-use items use an
 * explicit pooled-charge policy so charge state survives the merge: daily and
 * staff pools add their caps and spent uses, while multi-use consumables combine
 * their remaining uses into one pooled container.
 */
export function mergeEquipmentEntries(
  existing: CharacterEquipment,
  incoming: CharacterEquipment
): CharacterEquipment {
  const quantity = Math.min(
    MAX_ITEM_QUANTITY,
    Math.max(1, Math.floor(existing.quantity) || 1) +
      Math.max(1, Math.floor(incoming.quantity) || 1)
  );
  const runes = [...new Set([...(existing.runes ?? []), ...(incoming.runes ?? [])])].slice(0, 12);
  const usesKind = existing.usesKind ?? incoming.usesKind;
  const merged: CharacterEquipment = {
    ...existing,
    quantity,
    equipped: existing.equipped || incoming.equipped,
    runes,
  };
  if (incoming.invested) merged.invested = true;

  if (usesKind === "consumable") {
    const remaining = (entry: CharacterEquipment): number => {
      const max = Math.max(1, Math.round(entry.usesMax ?? 0) || 1);
      const used = Math.max(0, Math.round(entry.usesUsed ?? 0));
      if ((entry.usesMax ?? 0) > 0) {
        return Math.max(0, max - used) + Math.max(0, (entry.quantity || 1) - 1) * max;
      }
      return Math.max(0, entry.quantity || 1);
    };
    const total = remaining(existing) + remaining(incoming);
    return {
      ...merged,
      quantity: 1,
      usesKind: "consumable",
      usesMax: Math.max(1, Math.min(999, total)),
      usesUsed: 0,
    };
  }

  if (usesKind === "daily" || usesKind === "charges") {
    const existingMax = Math.max(1, Math.round(existing.usesMax ?? 1));
    const incomingMax = Math.max(1, Math.round(incoming.usesMax ?? 1));
    const max = Math.min(999, existingMax + incomingMax);
    const used =
      Math.max(0, Math.round(existing.usesUsed ?? 0)) +
      Math.max(0, Math.round(incoming.usesUsed ?? 0));
    if (usesKind === "charges") {
      merged.staffBaseCharges =
        Math.max(0, Math.round(existing.staffBaseCharges ?? existing.usesMax ?? 0)) +
        Math.max(0, Math.round(incoming.staffBaseCharges ?? incoming.usesMax ?? 0));
    }
    merged.usesKind = usesKind;
    merged.usesMax = max;
    merged.usesUsed = Math.min(max, used);
  }

  return merged;
}

/**
 * Add a transferred stack. Existing unlimited stacks merge normally; limited-use
 * stacks use the pooled-charge policy in {@link mergeEquipmentEntries}.
 */
export function addItemToDraft(draft: CharacterDraft, moved: CharacterEquipment): CharacterDraft {
  const quantity = Math.max(1, Math.min(MAX_ITEM_QUANTITY, Math.floor(moved.quantity) || 1));
  const existing = draft.equipment.find((entry) => entry.itemId === moved.itemId);
  const incoming: CharacterEquipment = {
    itemId: moved.itemId,
    quantity,
    equipped: false,
    invested: false,
    ...(moved.usesUsed ? { usesUsed: moved.usesUsed } : {}),
    ...(typeof moved.usesMax === "number" ? { usesMax: moved.usesMax } : {}),
    ...(moved.usesKind ? { usesKind: moved.usesKind } : {}),
    ...(typeof moved.staffBaseCharges === "number"
      ? { staffBaseCharges: moved.staffBaseCharges }
      : {}),
    runes: [...new Set(moved.runes ?? [])].slice(0, 12),
  };
  if (existing) {
    return {
      ...draft,
      equipment: draft.equipment.map((entry) =>
        entry.itemId === moved.itemId ? mergeEquipmentEntries(entry, incoming) : entry
      ),
    };
  }
  return {
    ...draft,
    equipment: [...draft.equipment, incoming],
  };
}

/** Ammunition category used by a ranged weapon, when it can be inferred. */
export function ammoKindForWeapon(item: Equipment | null | undefined): AmmoKind | null {
  if (!item?.weapon) return null;
  const group = String(item.weapon.group ?? "").toLowerCase();
  const name = item.name.toLowerCase();
  if (group.includes("crossbow") || /crossbow/i.test(name)) return "bolts";
  if (group.includes("bow") || /bow/i.test(name)) return "arrows";
  if (group.includes("sling") || /sling/i.test(name)) return "sling";
  if (group.includes("firearm") || /firearm|gun/i.test(name)) return "firearm";
  return null;
}

/** Ammunition category for an ammo item, when it can be inferred from its name. */
export function ammoKindForAmmo(item: Equipment | null | undefined): AmmoKind | null {
  if (!item) return null;
  const name = item.name.toLowerCase();
  if (/arrow/i.test(name)) return "arrows";
  if (/bolt|crossbow/i.test(name)) return "bolts";
  if (/sling/i.test(name)) return "sling";
  if (/bullet|shot|round|cartridge|firearm|black powder/i.test(name)) return "firearm";
  return null;
}

export interface AttackConsumptionResult {
  draft: CharacterDraft;
  blocked: string | null;
  note: string | null;
}

/** Spend one bomb or piece of ammunition for an attack roll. */
export function consumeAttackItem(
  draft: CharacterDraft,
  attack: Pick<DerivedAttack, "name" | "sourceItemId" | "consumesSource" | "ammoKind">,
  ammoItemId?: string | null
): AttackConsumptionResult {
  const consume = (itemId: string, label: string): AttackConsumptionResult => {
    const entry = draft.equipment.find((candidate) => candidate.itemId === itemId);
    if (!entry || entry.quantity < 1) {
      return { draft, blocked: `No ${label} left in the pack.`, note: null };
    }
    const equipment =
      entry.quantity > 1
        ? draft.equipment.map((candidate) =>
            candidate.itemId === itemId
              ? { ...candidate, quantity: candidate.quantity - 1 }
              : candidate
          )
        : draft.equipment.filter((candidate) => candidate.itemId !== itemId);
    return {
      draft: { ...draft, equipment },
      blocked: null,
      note: `Used 1 ${label}.${entry.quantity > 1 ? ` ${entry.quantity - 1} left.` : ""}`,
    };
  };

  if (attack.consumesSource && attack.sourceItemId) {
    return consume(attack.sourceItemId, attack.name);
  }
  if (attack.ammoKind && ammoItemId) {
    return consume(ammoItemId, "ammunition");
  }
  return { draft, blocked: null, note: null };
}
