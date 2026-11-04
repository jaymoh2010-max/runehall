import { describe, expect, it } from "vitest";
import { templateLabel, templateRadiusPx } from "../src/shared/templates";

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
});
