import type { CharacterDraft, Equipment } from "./types";
import { addItemToDraft, removeItemQuantity } from "./inventory";
import {
  attachRuneIds,
  propertyRuneCount,
  propertyRuneSlots,
  runeCategory,
  runeUsageForItem,
  runeUsageForTarget,
} from "./runes";

export interface AvailableRuneItem {
  itemId: string;
  name: string;
  quantity: number;
  level: number;
  category: NonNullable<ReturnType<typeof runeCategory>>;
}

export interface RuneLifecycleResult {
  draft: CharacterDraft;
  error: string | null;
}

/** Rune items in the pack that can be etched onto the target and are not already attached. */
export function availableRuneItems(
  draft: CharacterDraft,
  targetItemId: string,
  equipment: Record<string, Equipment>
): AvailableRuneItem[] {
  const target = equipment[targetItemId];
  const usage = runeUsageForTarget(target);
  if (!usage) return [];
  const attached = new Set(draft.equipment.flatMap((entry) => entry.runes ?? []));
  const available: AvailableRuneItem[] = [];
  for (const entry of draft.equipment) {
    if (entry.quantity < 1 || attached.has(entry.itemId)) continue;
    const rune = equipment[entry.itemId];
    // runeUsageForItem falls back to the target usage, so require an actual
    // etched-onto usage here rather than treating the target item as a rune.
    if (!rune || !String(rune.usage ?? "").startsWith("etched-onto")) continue;
    if (runeUsageForItem(rune) !== usage) continue;
    const category = runeCategory(rune);
    if (!category) continue;
    available.push({
      itemId: rune.id,
      name: rune.name,
      quantity: entry.quantity,
      level: rune.level,
      category,
    });
  }
  return available.sort(
    (left, right) => left.level - right.level || left.name.localeCompare(right.name)
  );
}

/** Consume one rune item and etch it, returning replaced fundamental runes to the pack. */
export function etchRuneFromInventory(
  draft: CharacterDraft,
  targetItemId: string,
  runeItemId: string,
  equipment: Record<string, Equipment>
): RuneLifecycleResult {
  const target = equipment[targetItemId];
  const rune = equipment[runeItemId];
  if (!target || !rune) {
    return { draft, error: "That item or rune is missing from the compendium." };
  }
  const usage = runeUsageForTarget(target);
  if (!usage || runeUsageForItem(rune) !== usage) {
    return { draft, error: "That rune cannot be etched onto this item." };
  }
  const targetEntry = draft.equipment.find((entry) => entry.itemId === targetItemId);
  const runeEntry = draft.equipment.find((entry) => entry.itemId === runeItemId);
  if (!targetEntry) return { draft, error: "That target is no longer in the pack." };
  if (!runeEntry || runeEntry.quantity < 1) {
    return { draft, error: "That rune is no longer in the pack." };
  }
  if ((targetEntry.runes ?? []).includes(runeItemId)) {
    return { draft, error: "That rune is already etched onto this item." };
  }
  const category = runeCategory(rune);
  if (!category) return { draft, error: "That item is not a rune." };

  const currentRunes = targetEntry.runes ?? [];
  const slots = propertyRuneSlots(currentRunes, equipment);
  const propertyCount = propertyRuneCount(currentRunes, equipment);
  if (category === "property" && propertyCount >= slots) {
    return {
      draft,
      error: slots
        ? `This item has ${slots} property rune slot${slots === 1 ? "" : "s"} and they are already filled.`
        : "Add a potency rune before etching property runes.",
    };
  }

  const nextRunes = attachRuneIds(currentRunes, rune, equipment);
  if (propertyRuneCount(nextRunes, equipment) > propertyRuneSlots(nextRunes, equipment)) {
    return {
      draft,
      error:
        "That fundamental rune would leave too few property rune slots for the attached runes.",
    };
  }

  const replaced = currentRunes.filter((id) => {
    const current = equipment[id];
    return current && runeCategory(current) === category && id !== runeItemId;
  });

  let next = removeItemQuantity(draft, runeItemId, 1).draft;
  for (const replacedId of replaced) {
    next = addItemToDraft(next, {
      itemId: replacedId,
      quantity: 1,
      equipped: false,
      invested: false,
      runes: [],
    });
  }
  next = {
    ...next,
    equipment: next.equipment.map((entry) =>
      entry.itemId === targetItemId ? { ...entry, runes: nextRunes } : entry
    ),
  };
  return { draft: next, error: null };
}

/** Detach a rune from an item and return it to the pack. */
export function detachRuneToInventory(
  draft: CharacterDraft,
  targetItemId: string,
  runeId: string
): RuneLifecycleResult {
  const targetEntry = draft.equipment.find((entry) => entry.itemId === targetItemId);
  if (!targetEntry) return { draft, error: "That target is no longer in the pack." };
  if (!(targetEntry.runes ?? []).includes(runeId)) {
    return { draft, error: "That rune is not etched onto this item." };
  }
  let next: CharacterDraft = {
    ...draft,
    equipment: draft.equipment.map((entry) =>
      entry.itemId === targetItemId
        ? { ...entry, runes: (entry.runes ?? []).filter((id) => id !== runeId) }
        : entry
    ),
  };
  next = addItemToDraft(next, {
    itemId: runeId,
    quantity: 1,
    equipped: false,
    invested: false,
    runes: [],
  });
  return { draft: next, error: null };
}
