import { describe, expect, it } from "vitest";
import {
  PERSISTENT_DAMAGE_DC,
  normalizePersistentDamage,
  normalizePersistentDamageList,
  persistentDamageLabel,
} from "../src/shared/persistentDamage";

describe("persistent damage", () => {
  it("normalizes an instance and defaults the type", () => {
    const instance = normalizePersistentDamage({
      formula: " 1d6 ",
      type: "FIRE",
      notes: "caught in the brazier",
      id: "pd-1",
    });
    expect(instance).toEqual({
      id: "pd-1",
      formula: "1d6",
      type: "fire",
      dc: 15,
      notes: "caught in the brazier",
    });
    expect(normalizePersistentDamage({ formula: "" })).toBeNull();
    expect(normalizePersistentDamage({ formula: "1d4" })?.type).toBe("untyped");
  });

  it("drops duplicate ids and caps the list", () => {
    const entries = Array.from({ length: 25 }, (_, index) => ({
      id: index < 2 ? "same" : `pd-${index}`,
      formula: "1d6",
    }));
    const list = normalizePersistentDamageList(entries);
    expect(list).toHaveLength(20);
    expect(new Set(list.map((entry) => entry.id)).size).toBe(20);
  });

  it("uses the standard end-of-turn flat-check DC", () => {
    expect(PERSISTENT_DAMAGE_DC).toBe(15);
    expect(
      persistentDamageLabel({ id: "pd-1", formula: "1d6", type: "fire", dc: 15, notes: "" })
    ).toBe("1d6 fire");
  });
});
