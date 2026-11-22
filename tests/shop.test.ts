import { describe, expect, it } from "vitest";
import {
  MAX_SHOP_STOCK_ROWS,
  isSettlementLevel,
  isShopStockMode,
  normalizeSettlementLevel,
  normalizeShopStockMode,
  shopAvailabilityError,
  shopBuyCostCp,
  shopItemAvailable,
  shopQuantity,
  shopSellRate,
  shopSellValueCp,
  shopStockCount,
} from "../src/shared/shop";
import type { Equipment } from "../src/shared/types";

function item(overrides: Partial<Equipment> = {}): Equipment {
  return {
    id: "item:test",
    name: "Test Sword",
    type: "weapon",
    level: 1,
    price: { gp: 1, sp: 0, cp: 0, cpTotal: 100 },
    bulk: 1,
    rarity: "common",
    traits: [],
    usage: "held",
    description: "",
    source: "Test",
    license: "ORC",
    remaster: true,
    playtest: false,
    ...overrides,
  };
}

describe("settlement levels", () => {
  it("normalizes and clamps levels", () => {
    expect(normalizeSettlementLevel(0)).toBe(0);
    expect(normalizeSettlementLevel(10)).toBe(10);
    expect(normalizeSettlementLevel(99)).toBe(25);
    expect(normalizeSettlementLevel(-4)).toBe(0);
    expect(normalizeSettlementLevel("7")).toBe(7);
    expect(normalizeSettlementLevel("nonsense")).toBe(1);
  });

  it("validates explicit settlement levels", () => {
    expect(isSettlementLevel(0)).toBe(true);
    expect(isSettlementLevel(25)).toBe(true);
    expect(isSettlementLevel(26)).toBe(false);
    expect(isSettlementLevel(1.5)).toBe(false);
  });
});

describe("merchant stock", () => {
  it("normalizes the open-versus-stocked shop mode", () => {
    expect(isShopStockMode("open")).toBe(true);
    expect(isShopStockMode("stocked")).toBe(true);
    expect(isShopStockMode("other")).toBe(false);
    expect(normalizeShopStockMode("stocked")).toBe("stocked");
    expect(normalizeShopStockMode("other")).toBe("open");
    expect(normalizeShopStockMode(undefined)).toBe("open");
  });

  it("allows zero stock without changing purchase quantities", () => {
    expect(shopStockCount(0)).toBe(0);
    expect(shopStockCount(-3)).toBe(0);
    expect(shopStockCount("7")).toBe(7);
    expect(shopStockCount(99_999)).toBe(9_999);
    expect(shopStockCount(undefined)).toBe(0);
    expect(shopQuantity(0)).toBe(1);
    expect(MAX_SHOP_STOCK_ROWS).toBe(500);
  });
});

describe("shop stock and prices", () => {
  it("stocks common items up to the settlement level", () => {
    expect(shopItemAvailable(item({ level: 5 }), 5)).toBe(true);
    expect(shopItemAvailable(item({ level: 6 }), 5)).toBe(false);
    expect(shopItemAvailable(item({ level: 5, rarity: "uncommon" }), 20)).toBe(false);
    expect(
      shopItemAvailable(item({ level: 0, price: { gp: 0, sp: 0, cp: 0, cpTotal: 0 } }), 20)
    ).toBe(false);
  });

  it("explains why stock is unavailable", () => {
    expect(shopAvailabilityError(item({ level: 6 }), 5)).toContain("only stocks up to level 5");
    expect(shopAvailabilityError(item({ rarity: "rare" }), 20)).toContain("common items");
    expect(shopAvailabilityError(item(), 5)).toBeNull();
  });

  it("charges full price when buying", () => {
    expect(shopBuyCostCp(item({ price: { gp: 2, sp: 5, cp: 0, cpTotal: 250 } }), 3)).toBe(750);
    expect(shopQuantity("3")).toBe(3);
    expect(shopQuantity(9_999)).toBe(9_999);
    expect(shopQuantity(-2)).toBe(1);
  });

  it("pays half price for gear and full price for treasure", () => {
    const gear = item({ price: { gp: 10, sp: 0, cp: 0, cpTotal: 1_000 } });
    const treasure = item({
      type: "treasure",
      price: { gp: 10, sp: 0, cp: 0, cpTotal: 1_000 },
    });
    expect(shopSellRate(gear)).toBe(0.5);
    expect(shopSellRate(treasure)).toBe(1);
    expect(shopSellValueCp(gear, 1)).toBe(500);
    expect(shopSellValueCp(treasure, 1)).toBe(1_000);
    expect(shopSellValueCp(gear, 1, 201)).toBe(600);
  });
});
