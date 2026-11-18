import { describe, expect, it } from "vitest";
import {
  BUILTIN_PROP_CATEGORIES,
  BUILTIN_PROPS,
  builtinPropCategoryLabel,
} from "../src/shared/builtinProps";

describe("built-in props", () => {
  it("has unique ids and valid categories", () => {
    expect(new Set(BUILTIN_PROPS.map((prop) => prop.id)).size).toBe(BUILTIN_PROPS.length);
    const categories = new Set(BUILTIN_PROP_CATEGORIES.map((entry) => entry.id));
    for (const prop of BUILTIN_PROPS) {
      expect(categories.has(prop.category)).toBe(true);
      expect(prop.imageUrl.startsWith("/props/")).toBe(true);
      expect(prop.squaresW).toBeGreaterThan(0);
      expect(prop.squaresH).toBeGreaterThan(0);
    }
  });

  it("covers every category", () => {
    for (const category of BUILTIN_PROP_CATEGORIES) {
      if (category.id === "all") continue;
      expect(BUILTIN_PROPS.some((prop) => prop.category === category.id)).toBe(true);
    }
  });

  it("maps categories to labels", () => {
    expect(builtinPropCategoryLabel("furniture")).toBe("Furniture");
    expect(builtinPropCategoryLabel("dungeon")).toBe("Dungeon");
  });
});
