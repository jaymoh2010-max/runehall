import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { contextForDraft } from "../src/server/compendium";
import { PSI_AMPS, psiAmpFor } from "../src/shared/psiAmps";
import { computeCharacter, emptyCharacterDraft } from "../src/shared/rules";
import {
  canRestoreSpellUse,
  castSpell,
  restoreSpellUse,
  spellCastOptions,
} from "../src/shared/spellcasting";
import type { ClassData, Spell } from "../src/shared/types";

function read<T>(file: string): T[] {
  return JSON.parse(fs.readFileSync(path.resolve("data", "compendium", file), "utf8")) as T[];
}

function byName<T extends { name: string }>(items: T[], name: string): T {
  const found = items.find((item) => item.name === name);
  if (!found) throw new Error(`Missing ${name}`);
  return found;
}

const classes = read<ClassData>("classes.json");
const spells = read<Spell>("spells.json");
const psychic = byName(classes, "Psychic");
const wizard = byName(classes, "Wizard");
const distantGrasp = "cf:1rlBo3LcwIuPDCvz";
const telekineticProjectile = byName(spells, "Telekinetic Projectile");

function psychicDraft(level: number) {
  const draft = emptyCharacterDraft("Amped Psychic");
  draft.level = level;
  draft.classId = psychic.id;
  draft.keyAbility = "int";
  draft.classChoices["cf:0fv6NVMZZ0peGL9e:psychic-conscious-mind"] = [distantGrasp];
  draft.classChoices["cf:79ZetrRF6S01P4Vf:psychic-subconscious-mind"] = ["cf:Qrhw4SILfT8YNQgB"];
  draft.play.focusPoints = 2;
  return draft;
}

describe("psychic psi amps", () => {
  it("has a curated amp for every granted psi cantrip", () => {
    expect(Object.keys(PSI_AMPS)).toHaveLength(18);
    for (const amp of Object.values(PSI_AMPS)) {
      const spell = spells.find((entry) => entry.id === amp.spellId);
      expect(spell, amp.spellId).toBeTruthy();
      expect(spell!.name).toBe(amp.name);
      expect(spell!.rank).toBe(0);
      expect(amp.summary.length).toBeGreaterThan(10);
      expect(psiAmpFor(amp.spellId)?.mind).toBe(amp.mind);
    }
  });

  it("offers an amp alongside the at-will cantrip and spends focus", () => {
    const draft = psychicDraft(1);
    const context = contextForDraft(draft);
    const derived = computeCharacter(draft, context);
    expect(derived.focusPointsMax).toBe(2);
    const opts = { focusPointsMax: derived.focusPointsMax };
    const options = spellCastOptions(telekineticProjectile, draft, context, opts);
    expect(options).toEqual([
      { rank: 1, resource: "cantrip", remaining: null, label: "Cantrip" },
      { rank: 1, resource: "amp", remaining: 2, label: "Amp (1 Focus)" },
    ]);

    const cast = castSpell(
      draft,
      telekineticProjectile,
      context,
      { rank: 1, resource: "amp" },
      opts
    );
    expect(cast?.draft.play.focusPoints).toBe(1);
    expect(cast?.option.remaining).toBe(1);
    expect(
      canRestoreSpellUse(cast!.draft, telekineticProjectile, { rank: 1, resource: "amp" }, opts)
    ).toBe(true);
    const restored = restoreSpellUse(
      cast!.draft,
      telekineticProjectile,
      context,
      { rank: 1, resource: "amp" },
      opts
    );
    expect(restored?.play.focusPoints).toBe(2);
  });

  it("cannot amp when the focus pool is empty", () => {
    const draft = psychicDraft(1);
    draft.play.focusPoints = 0;
    const context = contextForDraft(draft);
    const derived = computeCharacter(draft, context);
    const opts = { focusPointsMax: derived.focusPointsMax };
    const options = spellCastOptions(telekineticProjectile, draft, context, opts);
    expect(options[1]).toMatchObject({ resource: "amp", remaining: 0 });
    expect(
      castSpell(draft, telekineticProjectile, context, { rank: 1, resource: "amp" }, opts)
    ).toBeNull();
  });

  it("raises the psychic focus pool at 5th level", () => {
    const draft = psychicDraft(5);
    const derived = computeCharacter(draft, contextForDraft(draft));
    expect(derived.focusPointsMax).toBe(3);
  });

  it("does not offer amps to another class that happens to know the cantrip", () => {
    const draft = emptyCharacterDraft("Not Psychic");
    draft.level = 1;
    draft.classId = wizard.id;
    draft.keyAbility = "int";
    draft.spells.cantrips = [telekineticProjectile.id];
    draft.spells.preparedCantrips = [telekineticProjectile.id];
    const context = contextForDraft(draft);
    expect(spellCastOptions(telekineticProjectile, draft, context)).toEqual([
      { rank: 1, resource: "cantrip", remaining: null, label: "Cantrip" },
    ]);
  });
});
