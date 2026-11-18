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
    }
    for (const entry of BUILTIN_MAP_CATEGORIES) {
      if (entry.id === "all") continue;
      expect(BUILTIN_MAPS.some((map) => map.category === entry.id)).toBe(true);
    }
  });

  it("uses exact grid-aligned dimensions", () => {
    for (const map of BUILTIN_MAPS) {
      expect(map.width % map.gridSize).toBe(0);
      expect(map.height % map.gridSize).toBe(0);
      expect(builtinMapSquares(map)).toEqual({ cols: 24, rows: 16 });
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
