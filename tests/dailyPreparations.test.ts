import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { contextForDraft } from "../src/server/compendium";
import { computeCharacter } from "../src/shared/rules";
import {
  addPreparedSpellCopy,
  canPrepareSpellAtRank,
  emptyCharacterDraft,
  isPreparedCasterClass,
  ordinaryPreparedLimitAt,
  preparedEntries,
} from "../src/shared/rules";
import type { ClassData, Deity, Spell } from "../src/shared/types";

function read<T>(file: string): T[] {
  return JSON.parse(fs.readFileSync(path.resolve("data", "compendium", file), "utf8")) as T[];
}

const classes = read<ClassData>("classes.json");
const deities = read<Deity>("deities.json");
const spells = read<Spell>("spells.json");
const cleric = classes.find((entry) => entry.name === "Cleric")!;
const abadar = deities.find((entry) => entry.name === "Abadar")!;
const heal = spells.find((entry) => entry.name === "Heal")!;
const harm = spells.find((entry) => entry.name === "Harm")!;
const forceBarrage = spells.find((entry) => entry.name === "Force Barrage")!;

describe("daily spell preparation", () => {
  function clericDraft() {
    const draft = emptyCharacterDraft("Prepared Test");
    draft.classId = cleric.id;
    draft.deityId = abadar.id;
    draft.keyAbility = "wis";
    draft.spells.known = [heal.id, harm.id, forceBarrage.id];
    return draft;
  }

  it("identifies prepared casters", () => {
    expect(isPreparedCasterClass("Cleric")).toBe(true);
    expect(isPreparedCasterClass("Wizard")).toBe(true);
    expect(isPreparedCasterClass("Sorcerer")).toBe(false);
  });

  it("counts ordinary and divine-font preparation room separately", () => {
    const draft = clericDraft();
    const context = contextForDraft(draft);
    const derived = computeCharacter(draft, context);
    expect(ordinaryPreparedLimitAt(draft, derived, context.classData, 1)).toBeGreaterThan(0);
    expect(canPrepareSpellAtRank(draft, derived, context, heal, 1)).toBe(true);
    expect(canPrepareSpellAtRank(draft, derived, context, forceBarrage, 1)).toBe(true);
    expect(canPrepareSpellAtRank(draft, derived, context, heal, 2)).toBe(false);
  });

  it("locks in a dual-font choice when the first font spell is prepared", () => {
    const draft = clericDraft();
    const context = contextForDraft(draft);
    const prepared = addPreparedSpellCopy(draft, context, heal, 1);
    expect(prepared.spells.preparedByRank["1"]).toEqual([heal.id]);
    expect(prepared.spells.fontChoice).toBe("heal");
    expect(preparedEntries(prepared, context)).toEqual([{ id: heal.id, rank: 1, font: true }]);
  });

  it("rejects preparation once both ordinary and font room are full", () => {
    const draft = clericDraft();
    const context = contextForDraft(draft);
    const derived = computeCharacter(draft, context);
    const fontSlots = derived.divineFontSlots ?? 0;
    const ordinarySlots = ordinaryPreparedLimitAt(draft, derived, context.classData, 1);
    draft.spells.preparedByRank = {
      "1": Array.from({ length: fontSlots + ordinarySlots }, () => heal.id),
    };
    draft.spells.prepared = [...draft.spells.preparedByRank["1"]];
    expect(canPrepareSpellAtRank(draft, derived, context, heal, 1)).toBe(false);
    expect(canPrepareSpellAtRank(draft, derived, context, forceBarrage, 1)).toBe(false);
  });
});
