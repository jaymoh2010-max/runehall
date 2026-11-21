import type { Equipment } from "./types";

export const MIN_SETTLEMENT_LEVEL = 0;
export const MAX_SETTLEMENT_LEVEL = 25;
export const DEFAULT_SETTLEMENT_LEVEL = 1;

export function isSettlementLevel(value: unknown): boolean {
  const number = typeof value === "number" ? value : Number(value);
  return (
    Number.isInteger(number) && number >= MIN_SETTLEMENT_LEVEL && number <= MAX_SETTLEMENT_LEVEL
  );
}

export function normalizeSettlementLevel(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return DEFAULT_SETTLEMENT_LEVEL;
  return Math.max(MIN_SETTLEMENT_LEVEL, Math.min(MAX_SETTLEMENT_LEVEL, Math.round(number)));
}

/**
 * A settlement normally stocks common items of its level or lower. Items with
 * no price are not purchasable stock (unarmed attacks, free gear, and similar
 * entries still exist in the compendium for display).
 */
export function shopAvailabilityError(item: Equipment, settlementLevel: number): string | null {
  if (item.rarity !== "common") return "This settlement only stocks common items.";
  if (item.price.cpTotal <= 0) return "That item has no purchase price.";
  const level = normalizeSettlementLevel(settlementLevel);
  if (item.level > level) {
    return `That item is level ${item.level}; this settlement only stocks up to level ${level}.`;
  }
  return null;
}

export function shopItemAvailable(item: Equipment, settlementLevel: number): boolean {
  return shopAvailabilityError(item, settlementLevel) === null;
}

export function shopQuantity(value: unknown, max = 9_999): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return 1;
  return Math.max(1, Math.min(max, Math.floor(number)));
}

export function shopBuyCostCp(item: Equipment, quantity: number): number {
  return Math.max(0, Math.round(item.price.cpTotal)) * shopQuantity(quantity);
}

/** Treasure (gems, art, raw materials) sells at full price; gear and magic items at half. */
export function shopSellRate(item: Equipment): number {
  return item.type === "treasure" ? 1 : 0.5;
}

/** Attached runes are included when the whole stack is sold. */
export function shopSellValueCp(item: Equipment, quantity: number, runeCp = 0): number {
  const base = Math.max(0, Math.round(item.price.cpTotal)) * shopQuantity(quantity);
  return Math.floor((base + Math.max(0, Math.round(runeCp))) * shopSellRate(item));
}
