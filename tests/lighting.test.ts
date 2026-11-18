import { describe, expect, it } from "vitest";
import {
  DEFAULT_LIGHT_COLOR,
  lightColorRgba,
  lightLevelAt,
  normalizeAmbientLight,
  normalizeLightColor,
  normalizeTokenVisionMode,
  visionLevelFor,
} from "../src/shared/lighting";

describe("lighting", () => {
  it("defaults to bright light for missing values", () => {
    expect(normalizeAmbientLight(undefined)).toBe("bright");
    expect(normalizeAmbientLight("dim")).toBe("dim");
    expect(normalizeAmbientLight("darkness")).toBe("darkness");
    expect(normalizeTokenVisionMode("low-light")).toBe("low-light");
    expect(normalizeTokenVisionMode("darkvision")).toBe("darkvision");
    expect(normalizeTokenVisionMode("nonsense")).toBe("normal");
  });

  it("handles ambient light and light sources", () => {
    const torch = { x: 100, y: 100, radius: 20 };
    expect(lightLevelAt(0, 0, "bright", [])).toBe("bright");
    expect(lightLevelAt(0, 0, "dim", [])).toBe("dim");
    expect(lightLevelAt(0, 0, "dim", [torch])).toBe("dim");
    expect(lightLevelAt(100, 100, "dim", [torch])).toBe("bright");
    expect(lightLevelAt(100, 100, "darkness", [torch])).toBe("bright");
    expect(lightLevelAt(130, 100, "darkness", [torch])).toBe("dim");
    expect(lightLevelAt(160, 100, "darkness", [torch])).toBe("darkness");
  });

  it("turns light levels into what each sense can see", () => {
    expect(visionLevelFor("normal", "bright")).toBe("bright");
    expect(visionLevelFor("normal", "dim")).toBe("dim");
    expect(visionLevelFor("normal", "darkness")).toBeNull();
    expect(visionLevelFor("low-light", "dim")).toBe("bright");
    expect(visionLevelFor("low-light", "darkness")).toBeNull();
    expect(visionLevelFor("darkvision", "darkness")).toBe("dim");
  });

  it("normalizes light colors and converts them to rgba", () => {
    expect(normalizeLightColor("#7FB8FF")).toBe("#7fb8ff");
    expect(normalizeLightColor("blue")).toBe(DEFAULT_LIGHT_COLOR);
    expect(normalizeLightColor(undefined)).toBe(DEFAULT_LIGHT_COLOR);
    expect(lightColorRgba("#7fb8ff", 0.5)).toBe("rgba(127, 184, 255, 0.5)");
    expect(lightColorRgba("nonsense", 2)).toBe(`rgba(255, 210, 125, 1)`);
  });
});
