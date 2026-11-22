import { describe, expect, it } from "vitest";
import { emptyCharacterDraft } from "../src/shared/rules";
import {
  SUSTAINED_SPELL_LIMIT,
  beginSustainedSpell,
  endSustainedSpell,
  normalizeSustainedSpells,
  spellNeedsSustain,
  sustainedSpellFor,
} from "../src/shared/sustain";
import type { Spell } from "../src/shared/types";

function spell(overrides: Partial<Spell> = {}): Spell {
  return {
    id: "spell:flaming-sphere",
    name: "Flaming Sphere",
    type: "spell",
    rank: 2,
    traditions: ["arcane", "primal"],
    rarity: "common",
    traits: ["fire"],
    actionType: "2",
    actions: "2",
    range: "30 feet",
    area: "",
    targets: "",
    duration: "sustained up to 1 minute",
    cost: "",
    requirements: "",
    defense: { save: "reflex", basic: true },
    damage: [{ formula: "3d6", type: "fire" }],
    damageText: "3d6 fire",
    heightening: null,
    source: "Test",
    license: "ORC",
    remaster: true,
    playtest: false,
    description: "<p>You create a sphere of fire. You can Sustain this spell.</p>",
    ...overrides,
  } as Spell;
}

describe("sustained spells", () => {
  it("detects Sustain in the description or duration", () => {
    expect(spellNeedsSustain(spell())).toBe(true);
    expect(spellNeedsSustain(spell({ description: "Instant.", duration: "" }))).toBe(false);
    expect(spellNeedsSustain(spell({ description: "", duration: "sustained" }))).toBe(true);
  });

  it("records a sustained spell once and replaces its rank when recast", () => {
    const draft = emptyCharacterDraft("Sustainer");
    const first = beginSustainedSpell(draft, spell(), 2);
    expect(first.added).toBe(true);
    expect(first.draft.play.sustainedSpells).toHaveLength(1);
    expect(sustainedSpellFor(first.draft, "spell:flaming-sphere")?.rank).toBe(2);

    const recast = beginSustainedSpell(first.draft, spell(), 4);
    expect(recast.added).toBe(false);
    expect(recast.draft.play.sustainedSpells).toHaveLength(1);
    expect(recast.draft.play.sustainedSpells[0].rank).toBe(4);
  });

  it("ignores spells that are not sustained", () => {
    const draft = emptyCharacterDraft("Caster");
    const result = beginSustainedSpell(
      draft,
      spell({ description: "A flash of light.", duration: "instantaneous" }),
      2
    );
    expect(result.added).toBe(false);
    expect(result.draft).toBe(draft);
  });

  it("ends a sustained spell", () => {
    const draft = beginSustainedSpell(emptyCharacterDraft("Caster"), spell(), 2).draft;
    const ended = endSustainedSpell(draft, "spell:flaming-sphere");
    expect(ended.play.sustainedSpells).toEqual([]);
  });

  it("normalizes legacy or malformed sustained lists", () => {
    const normalized = normalizeSustainedSpells([
      { spellId: "spell:one", name: "One", rank: 99, duration: 7 },
      { spellId: "spell:one", name: "Duplicate" },
      { spellId: "", name: "Missing" },
      null,
      "bad",
    ]);
    expect(normalized).toHaveLength(1);
    expect(normalized[0]).toMatchObject({
      spellId: "spell:one",
      name: "One",
      rank: 10,
      duration: "",
    });
  });

  it("caps the active list", () => {
    const draft = emptyCharacterDraft("Caster");
    for (let index = 0; index < SUSTAINED_SPELL_LIMIT + 3; index += 1) {
      const result = beginSustainedSpell(
        draft,
        spell({ id: `spell:sustain-${index}`, name: `Sustain ${index}` }),
        1
      );
      draft.play.sustainedSpells = result.draft.play.sustainedSpells;
    }
    expect(draft.play.sustainedSpells).toHaveLength(SUSTAINED_SPELL_LIMIT);
  });
});
