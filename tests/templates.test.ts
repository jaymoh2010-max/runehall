import { describe, expect, it } from "vitest";
import {
  normalizeAoeTemplate,
  normalizeAoeTemplates,
  parseSpellArea,
  spellAreaColor,
  spellDurationRounds,
  templateLabel,
  templateRadiusPx,
  tokensInTemplate,
  unexpiredAoeTemplates,
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

  it("parses spell areas, including heightening and square footprints", () => {
    expect(parseSpellArea("burst 20")).toEqual({ kind: "burst", size: 20 });
    expect(parseSpellArea("cone 60")).toEqual({ kind: "cone", size: 60 });
    expect(parseSpellArea("20-foot burst")).toEqual({ kind: "burst", size: 20 });
    expect(parseSpellArea("cube 10")).toEqual({ kind: "square", size: 10 });
    expect(parseSpellArea("cylinder 15")).toEqual({ kind: "burst", size: 15 });
    expect(parseSpellArea("burst 20", 5)).toEqual({ kind: "burst", size: 25 });
    expect(parseSpellArea("")).toBeNull();
  });

  it("converts printed durations into rounds", () => {
    expect(spellDurationRounds("1 round")).toBe(1);
    expect(spellDurationRounds("1 minute")).toBe(10);
    expect(spellDurationRounds("sustained up to 1 minute")).toBe(10);
    expect(spellDurationRounds("1 hour")).toBe(600);
    expect(spellDurationRounds("until your next daily preparations")).toBeNull();
    expect(spellDurationRounds("")).toBeNull();
  });

  it("keeps display metadata and labels spell areas by name", () => {
    const template = normalizeAoeTemplate({
      kind: "burst",
      size: 20,
      x: 100,
      y: 120,
      direction: 1,
      label: "Fireball",
      color: "#e07a3f",
      spellId: "spell:fireball",
      casterTokenId: "tok_1",
      casterUserId: "usr_1",
      durationRounds: 10,
      expiresRound: 4,
      effect: "Reflex DC 20 · 6d6 fire damage",
    });
    expect(template).toMatchObject({
      label: "Fireball",
      color: "#e07a3f",
      spellId: "spell:fireball",
      casterTokenId: "tok_1",
      casterUserId: "usr_1",
      durationRounds: 10,
      expiresRound: 4,
    });
    expect(templateLabel(template!)).toBe("Fireball");
    expect(spellAreaColor({ damage: [{ type: "fire" }] })).toBe("#e07a3f");
    expect(spellAreaColor({ damage: [{ type: "untyped" }] })).toBe("#e5ca91");
  });

  it("expires round-based areas while keeping manual areas", () => {
    const templates = normalizeAoeTemplates([
      { kind: "burst", size: 20, label: "One round", expiresRound: 1 },
      { kind: "cone", size: 15, label: "Three rounds", expiresRound: 3 },
      { kind: "line", size: 30, label: "Manual", expiresRound: null },
    ]);
    expect(unexpiredAoeTemplates(templates, 1).map((entry) => entry.label)).toEqual([
      "One round",
      "Three rounds",
      "Manual",
    ]);
    expect(unexpiredAoeTemplates(templates, 2).map((entry) => entry.label)).toEqual([
      "Three rounds",
      "Manual",
    ]);
    expect(unexpiredAoeTemplates(templates, 4).map((entry) => entry.label)).toEqual(["Manual"]);
  });

  it("finds tokens inside bursts, cones, lines, and squares", () => {
    const tokens = [
      { id: "caster", x: 100, y: 100, size: 1 },
      { id: "near", x: 160, y: 100, size: 1 },
      { id: "far", x: 400, y: 400, size: 1 },
      { id: "behind", x: 40, y: 100, size: 1 },
    ];
    const burst = {
      kind: "burst" as const,
      size: 20,
      x: 100,
      y: 100,
      direction: 0,
      casterTokenId: "caster",
    };
    expect(tokensInTemplate(tokens, burst, 50).map((token) => token.id)).toEqual([
      "near",
      "behind",
    ]);
    const cone = { ...burst, kind: "cone" as const, size: 20, direction: 0 };
    expect(tokensInTemplate(tokens, cone, 50).map((token) => token.id)).toEqual(["near"]);
    const line = { ...burst, kind: "line" as const, size: 20, direction: 0 };
    expect(tokensInTemplate(tokens, line, 50).map((token) => token.id)).toEqual(["near"]);
    const square = { ...burst, kind: "square" as const, size: 20 };
    expect(tokensInTemplate(tokens, square, 50).map((token) => token.id)).toEqual([
      "near",
      "behind",
    ]);
  });
});
