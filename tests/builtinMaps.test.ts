import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BUILTIN_MAP_CATEGORIES,
  BUILTIN_MAP_THEMES,
  BUILTIN_MAPS,
  builtinMapCategoryLabel,
  builtinMapSquares,
  builtinMapThemeLabel,
} from "../src/shared/builtinMaps";

describe("built-in maps", () => {
  it("has a broad, unique library with a map in every category", () => {
    expect(new Set(BUILTIN_MAPS.map((map) => map.id)).size).toBe(BUILTIN_MAPS.length);
    expect(BUILTIN_MAPS.length).toBeGreaterThanOrEqual(30);
    const categories = new Set(BUILTIN_MAP_CATEGORIES.map((entry) => entry.id));
    for (const map of BUILTIN_MAPS) {
      expect(categories.has(map.category), map.id).toBe(true);
      expect(map.imageUrl.startsWith("/maps/"), map.id).toBe(true);
      expect(map.thumbnailUrl.startsWith("/maps/"), map.id).toBe(true);
      expect(fs.existsSync(`public${map.imageUrl}`), map.imageUrl).toBe(true);
      expect(fs.existsSync(`public${map.thumbnailUrl}`), map.thumbnailUrl).toBe(true);
      expect(map.credit, map.id).toBeTruthy();
      expect(map.license, map.id).toMatch(/^CC BY(-SA)? 4\.0$/);
      expect(map.sourceUrl, map.id).toBeTruthy();
      expect(map.themes.length, map.id).toBeGreaterThan(0);
      expect(map.description.length, map.id).toBeGreaterThan(40);
    }
    for (const entry of BUILTIN_MAP_CATEGORIES) {
      if (entry.id === "all") continue;
      expect(
        BUILTIN_MAPS.some((map) => map.category === entry.id),
        entry.id
      ).toBe(true);
    }
  });

  it("uses usable grid dimensions and offsets", () => {
    for (const map of BUILTIN_MAPS) {
      const squares = builtinMapSquares(map);
      expect(squares.cols, map.id).toBeGreaterThan(10);
      expect(squares.rows, map.id).toBeGreaterThan(10);
      expect(map.width % map.gridSize, map.id).toBeLessThan(map.gridSize);
      expect(map.height % map.gridSize, map.id).toBeLessThan(map.gridSize);
      expect(map.gridOffsetX ?? 0, map.id).toBeGreaterThanOrEqual(-map.gridSize);
      expect(map.gridOffsetY ?? 0, map.id).toBeGreaterThanOrEqual(-map.gridSize);
    }
  });

  it("provides a useful spread of colour maps and adventure themes", () => {
    expect(BUILTIN_MAPS.filter((map) => map.color).length).toBeGreaterThanOrEqual(20);
    const usedThemes = new Set(BUILTIN_MAPS.flatMap((map) => map.themes));
    for (const theme of BUILTIN_MAP_THEMES) {
      expect(usedThemes.has(theme.id), theme.id).toBe(true);
      expect(builtinMapThemeLabel(theme.id)).toBe(theme.label);
    }
  });

  it("maps categories and themes to labels", () => {
    expect(builtinMapCategoryLabel("tavern")).toBe("Tavern");
    expect(builtinMapCategoryLabel("crypt")).toBe("Crypt");
    expect(builtinMapCategoryLabel("village")).toBe("Town");
    expect(builtinMapCategoryLabel("academy")).toBe("Academy");
    expect(builtinMapCategoryLabel("volcano")).toBe("Volcanic");
    expect(builtinMapThemeLabel("kingmaker")).toBe("Kingmaker");
    expect(builtinMapThemeLabel("abomination-vaults")).toBe("Abomination Vaults");
    expect(builtinMapThemeLabel("quest-for-the-frozen-flame")).toBe("Quest for the Frozen Flame");
  });
});
