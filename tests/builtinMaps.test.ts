import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BUILTIN_MAP_CATEGORIES,
  BUILTIN_MAPS,
  builtinMapCategoryLabel,
  builtinMapSquares,
} from "../src/shared/builtinMaps";

describe("built-in maps", () => {
  it("has unique ids and a map in every category", () => {
    expect(new Set(BUILTIN_MAPS.map((map) => map.id)).size).toBe(BUILTIN_MAPS.length);
    expect(BUILTIN_MAPS).toHaveLength(10);
    const categories = new Set(BUILTIN_MAP_CATEGORIES.map((entry) => entry.id));
    for (const map of BUILTIN_MAPS) {
      expect(categories.has(map.category)).toBe(true);
      expect(map.imageUrl.startsWith("/maps/")).toBe(true);
      expect(map.thumbnailUrl.startsWith("/maps/")).toBe(true);
      expect(fs.existsSync(`public${map.imageUrl}`), map.imageUrl).toBe(true);
      expect(fs.existsSync(`public${map.thumbnailUrl}`), map.thumbnailUrl).toBe(true);
      expect(map.credit).toBeTruthy();
      expect(map.license).toBe("CC BY 4.0");
      expect(map.sourceUrl).toBeTruthy();
    }
    for (const entry of BUILTIN_MAP_CATEGORIES) {
      if (entry.id === "all") continue;
      expect(BUILTIN_MAPS.some((map) => map.category === entry.id)).toBe(true);
    }
  });

  it("has usable grid dimensions and offsets", () => {
    for (const map of BUILTIN_MAPS) {
      const squares = builtinMapSquares(map);
      expect(squares.cols).toBeGreaterThan(10);
      expect(squares.rows).toBeGreaterThan(10);
      expect(map.width % map.gridSize).toBeLessThan(map.gridSize);
      expect(map.height % map.gridSize).toBeLessThan(map.gridSize);
      expect(map.gridOffsetX ?? 0).toBeGreaterThanOrEqual(-map.gridSize);
      expect(map.gridOffsetY ?? 0).toBeGreaterThanOrEqual(-map.gridSize);
    }
  });

  it("maps categories to labels", () => {
    expect(builtinMapCategoryLabel("tavern")).toBe("Tavern");
    expect(builtinMapCategoryLabel("crypt")).toBe("Crypt");
    expect(builtinMapCategoryLabel("village")).toBe("Village");
    expect(builtinMapCategoryLabel("ship")).toBe("Ship");
    expect(builtinMapCategoryLabel("desert")).toBe("Desert");
    expect(builtinMapCategoryLabel("swamp")).toBe("Swamp");
  });
});
