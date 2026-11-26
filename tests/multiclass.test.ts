import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { multiclassDedicationFor } from "../src/shared/multiclass";
import { emptyCharacterDraft } from "../src/shared/rules";
import { contextForDraft } from "../src/server/compendium";
import { computeCharacter } from "../src/shared/rules";
import type { ClassData, Spell } from "../src/shared/types";

function read<T>(file: string): T[] {
  return JSON.parse(fs.readFileSync(path.resolve("data", "compendium", file), "utf8")) as T[];
}

const classes = read<ClassData>("classes.json");
const spells = read<Spell>("spells.json");
const fighter = classes.find((entry) => entry.name === "Fighter")!;
const shield = spells.find((entry) => entry.name === "Shield")!;

describe("multiclass dedication cantrips", () => {
  it("recognizes fixed-tradition spellcasting dedications", () => {
    expect(multiclassDedicationFor([])).toBeNull();
    expect(multiclassDedicationFor(["feat:oQ6EZRFXbHWCx08C"])).toMatchObject({
      className: "Wizard",
      tradition: "arcane",
      ability: "int",
      cantripLimit: 2,
    });
    expect(multiclassDedicationFor(["feat:OW3W2vMARiojda7e"])).toMatchObject({
      className: "Psychic",
      cantripLimit: 1,
    });
    expect(multiclassDedicationFor(["feat:unknown"])).toBeNull();
  });

  it("derives a separate spell DC for a dedication cantrip", () => {
    const draft = emptyCharacterDraft("Dedicated Fighter");
    draft.classId = fighter.id;
    draft.keyAbility = "str";
    draft.level = 2;
    draft.feats.class["2"] = "feat:oQ6EZRFXbHWCx08C";
    draft.spells.multiclassCantrips = [shield.id];
    const derived = computeCharacter(draft, contextForDraft(draft));
    expect(derived.multiclassCaster).toMatchObject({
      className: "Wizard",
      tradition: "arcane",
      ability: "int",
      cantripLimit: 2,
    });
    expect(derived.multiclassCaster?.spellDc).toBeTypeOf("number");
    expect(derived.multiclassCaster?.spellAttack).toBeTypeOf("number");
  });
});
