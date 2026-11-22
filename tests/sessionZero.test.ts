import { describe, expect, it } from "vitest";
import {
  SESSION_ZERO_CHECKLIST,
  normalizeSessionZeroChecklist,
  safetyPreferenceHasContent,
  sessionZeroCompletion,
} from "../src/shared/sessionZero";

describe("session zero checklist", () => {
  it("keeps only known true items", () => {
    expect(
      normalizeSessionZeroChecklist({
        pitch: true,
        themes: false,
        limits: true,
        unknown: true,
        schedule: "yes",
      })
    ).toEqual({ pitch: true, limits: true });
    expect(normalizeSessionZeroChecklist(null)).toEqual({});
    expect(normalizeSessionZeroChecklist(["pitch"])).toEqual({});
  });

  it("counts completed items", () => {
    const checklist = Object.fromEntries(
      SESSION_ZERO_CHECKLIST.slice(0, 3).map((item) => [item.id, true])
    );
    expect(sessionZeroCompletion({ checklist })).toEqual({
      done: 3,
      total: SESSION_ZERO_CHECKLIST.length,
    });
    expect(sessionZeroCompletion({ checklist: {} }).done).toBe(0);
  });

  it("detects whether a private safety response has content", () => {
    expect(safetyPreferenceHasContent({ lines: "", veils: "", notes: "" })).toBe(false);
    expect(safetyPreferenceHasContent({ lines: "Spiders", veils: "", notes: "" })).toBe(true);
    expect(safetyPreferenceHasContent({ lines: "", veils: "Torture", notes: "" })).toBe(true);
    expect(safetyPreferenceHasContent({ lines: "", veils: "", notes: "Check in often." })).toBe(
      true
    );
  });
});
