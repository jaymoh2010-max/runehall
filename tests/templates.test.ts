import { describe, expect, it } from "vitest";
import {
  normalizeAoeTemplate,
  normalizeAoeTemplates,
  templateLabel,
  templateRadiusPx,
} from "../src/shared/templates";

describe("area templates", () => {
  it("converts feet to pixels using the scene grid", () => {
    expect(templateRadiusPx(20, 70)).toBe(280);
    expect(templateRadiusPx(5, 70)).toBe(70);
    expect(templateRadiusPx(1, 70)).toBe(70);
  });

  it("labels templates with kind and size", () => {
    expect(templateLabel({ kind: "burst", size: 20 })).toBe("Burst 20 ft.");
    expect(templateLabel({ kind: "cone", size: 15 })).toBe("Cone 15 ft.");
  });

  it("normalizes the hidden flag and keeps it through a list round-trip", () => {
    expect(normalizeAoeTemplate({ kind: "burst", size: 20 })?.hidden).toBe(false);
    expect(normalizeAoeTemplate({ kind: "burst", size: 20, hidden: true })?.hidden).toBe(true);
    const templates = normalizeAoeTemplates([
      { kind: "burst", size: 20 },
      { kind: "cone", size: 15, hidden: true },
    ]);
    expect(templates.map((entry) => entry.hidden)).toEqual([false, true]);
  });
});
