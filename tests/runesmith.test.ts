import { describe, expect, it } from "vitest";
import { classes, contextForDraft, runes } from "../src/server/compendium";
import {
  computeCharacter,
  emptyCharacterDraft,
  normalizeCharacterDraft,
} from "../src/shared/rules";
import {
  normalizeRunesmithState,
  runesmithEtchedLimit,
  runesmithRepertoireLimit,
} from "../src/shared/runesmith";
import type { CharacterDraft, ValidationIssue } from "../src/shared/types";

const runesmith = classes.find((entry) => entry.name === "Runesmith")!;
const levelOne = runes.filter((rune) => rune.level === 1 && !rune.diacritic);
const levelFiveDiacritic = runes.find((rune) => rune.level === 5 && rune.diacritic)!;

function draft(level = 1): CharacterDraft {
  const value = emptyCharacterDraft("Runesmith Test");
  value.classId = runesmith.id;
  value.level = level;
  value.contentMode = "expanded";
  value.includeLegacy = false;
  return value;
}

function runesmithIssues(value: CharacterDraft): ValidationIssue[] {
  return computeCharacter(value, contextForDraft(value)).validation.filter(
    (issue) => issue.step === "class" && issue.message.startsWith("Runesmith:")
  );
}

function filledDraft(level = 1): CharacterDraft {
  const value = draft(level);
  const pool = runes
    .filter((rune) => rune.level <= level && !rune.diacritic)
    .slice(0, runesmithRepertoireLimit(level));
  value.runesmith.repertoire = pool.map((rune) => rune.id);
  return value;
}

describe("Runesmith limits", () => {
  it("uses the printed repertoire and etched-run progression", () => {
    expect([1, 4, 5, 8, 9, 12, 13, 16, 17, 20].map(runesmithRepertoireLimit)).toEqual([
      4, 4, 6, 6, 8, 8, 10, 10, 12, 12,
    ]);
    expect([1, 4, 5, 8, 9, 12, 13, 16, 17, 20].map(runesmithEtchedLimit)).toEqual([
      2, 2, 3, 3, 4, 4, 5, 5, 6, 6,
    ]);
  });
});

describe("Runesmith normalization", () => {
  it("fills defaults for older drafts", () => {
    expect(normalizeRunesmithState(undefined)).toEqual({ repertoire: [], etched: [] });
    expect(normalizeRunesmithState({ repertoire: ["rune:atryl-rune-of-fire"] })).toEqual({
      repertoire: ["rune:atryl-rune-of-fire"],
      etched: [],
    });
  });

  it("deduplicates repertoire entries and repairs etched rune ids", () => {
    const normalized = normalizeRunesmithState({
      repertoire: ["rune:atryl-rune-of-fire", "rune:atryl-rune-of-fire", 7],
      etched: [
        { runeId: "rune:atryl-rune-of-fire", target: "Self" },
        {
          runeId: "rune:ranshu-rune-of-thunder",
          target: "Weapon",
          diacriticId: "rune:av-diacritic-rune-of-succession",
        },
        { runeId: "" },
        null,
      ],
    });
    expect(normalized.repertoire).toEqual(["rune:atryl-rune-of-fire"]);
    expect(normalized.etched).toHaveLength(2);
    expect(normalized.etched[0].id).toBeTruthy();
    expect(normalized.etched[1].diacriticId).toBe("rune:av-diacritic-rune-of-succession");
  });

  it("adds runesmith state to normalized older drafts", () => {
    const normalized = normalizeCharacterDraft({ ...draft(), runesmith: undefined });
    expect(normalized.runesmith).toEqual({ repertoire: [], etched: [] });
  });
});

describe("Runesmith context and validation", () => {
  it("includes the selected repertoire and etched runes", () => {
    const value = filledDraft();
    value.runesmith.etched = [
      { id: "one", runeId: levelOne[0].id, target: "Self", diacriticId: null },
    ];
    const context = contextForDraft(value);
    expect(Object.keys(context.runes ?? {})).toEqual(
      expect.arrayContaining(value.runesmith.repertoire)
    );
    expect(context.runes?.[levelOne[0].id]?.name).toBe(levelOne[0].name);
  });

  it("warns when the repertoire is not full", () => {
    const issues = runesmithIssues(draft());
    expect(
      issues.some(
        (issue) => issue.severity === "warning" && /choose 4 more runes/.test(issue.message)
      )
    ).toBe(true);
  });

  it("rejects a repertoire over the level limit", () => {
    const value = filledDraft();
    value.runesmith.repertoire.push(levelOne[4].id);
    const issues = runesmithIssues(value);
    expect(
      issues.some((issue) => issue.severity === "error" && /only 4 fit/.test(issue.message))
    ).toBe(true);
  });

  it("rejects more etched runes than the level allows", () => {
    const value = filledDraft();
    value.runesmith.etched = levelOne.slice(0, 3).map((rune, index) => ({
      id: String(index),
      runeId: rune.id,
      target: "Self",
      diacriticId: null,
    }));
    const issues = runesmithIssues(value);
    expect(
      issues.some(
        (issue) => issue.severity === "error" && /only 2 can be sustained/.test(issue.message)
      )
    ).toBe(true);
  });

  it("rejects a diacritic etched as a base rune", () => {
    const value = filledDraft(5);
    value.runesmith.repertoire.push(levelFiveDiacritic.id);
    value.runesmith.etched = [
      {
        id: "diacritic",
        runeId: levelFiveDiacritic.id,
        target: "A rune",
        diacriticId: null,
      },
    ];
    const issues = runesmithIssues(value);
    expect(
      issues.some(
        (issue) =>
          issue.severity === "error" && /must be applied to a base rune/.test(issue.message)
      )
    ).toBe(true);
  });

  it("accepts a full repertoire and valid etched runes", () => {
    const value = filledDraft();
    value.runesmith.etched = levelOne.slice(0, 2).map((rune, index) => ({
      id: String(index),
      runeId: rune.id,
      target: index === 0 ? "Self" : "My weapon",
      diacriticId: null,
    }));
    expect(runesmithIssues(value)).toEqual([]);
  });

  it("accepts a diacritic attached to a base rune", () => {
    const value = filledDraft(5);
    value.runesmith.repertoire = [
      ...runes
        .filter((rune) => rune.level <= 5 && !rune.diacritic)
        .slice(0, 5)
        .map((rune) => rune.id),
      levelFiveDiacritic.id,
    ];
    value.runesmith.etched = [
      {
        id: "base",
        runeId: levelOne[0].id,
        target: "Self",
        diacriticId: levelFiveDiacritic.id,
      },
    ];
    expect(runesmithIssues(value)).toEqual([]);
  });

  it("warns when an etched rune has no target", () => {
    const value = filledDraft();
    value.runesmith.etched = [
      { id: "no-target", runeId: levelOne[0].id, target: "", diacriticId: null },
    ];
    const issues = runesmithIssues(value);
    expect(
      issues.some((issue) => issue.severity === "warning" && /record a target/.test(issue.message))
    ).toBe(true);
  });

  it("warns when an etched rune is not in the repertoire", () => {
    const value = filledDraft();
    value.runesmith.etched = [
      { id: "unknown", runeId: levelOne[5].id, target: "Self", diacriticId: null },
    ];
    const issues = runesmithIssues(value);
    expect(
      issues.some(
        (issue) =>
          issue.severity === "warning" && /etched but not in the repertoire/.test(issue.message)
      )
    ).toBe(true);
  });
});
