import { describe, expect, it } from "vitest";
import { emptyCharacterDraft } from "../src/shared/rules";
import { consumeInnateUse, innateUsesMax, innateUsesRemaining } from "../src/shared/innate";
import { castSpell, spellCastOptionAvailable, spellCastOptions } from "../src/shared/spellcasting";
import type { CharacterContext, Spell } from "../src/shared/types";

function spell(overrides: Partial<Spell> = {}): Spell {
  return {
    id: "spell:innate",
    name: "Innate Spell",
    type: "spell",
    rank: 1,
    traditions: ["arcane"],
    rarity: "common",
    traits: [],
    actionType: "2",
    actions: "2",
    range: "",
    area: "",
    targets: "",
    duration: "",
    cost: "",
    requirements: "",
    defense: null,
    damage: null,
    damageText: "",
    heightening: null,
    source: "Test",
    license: "ORC",
    remaster: true,
    playtest: false,
    description: "<p>You can cast this spell once per day.</p>",
    ...overrides,
  } as Spell;
}

const context: CharacterContext = { feats: {}, spells: {}, equipment: {} };

describe("innate spell uses", () => {
  it("treats innate cantrips as at will", () => {
    expect(innateUsesMax(spell({ rank: 0 }))).toBeNull();
  });

  it("parses once, twice, and three times per day", () => {
    expect(innateUsesMax(spell())).toBe(1);
    expect(innateUsesMax(spell({ description: "You can cast this twice per day." }))).toBe(2);
    expect(innateUsesMax(spell({ description: "Use this three times per day." }))).toBe(3);
    expect(innateUsesMax(spell({ description: "Use this once per hour." }))).toBe(1);
  });

  it("prefers an explicit daily maximum over the spell prose", () => {
    expect(innateUsesMax(spell(), 3)).toBe(3);
    expect(innateUsesMax(spell({ rank: 0 }), 3)).toBeNull();
    const draft = emptyCharacterDraft("Innate");
    draft.spells.innateMax = { "spell:innate": 2 };
    draft.spells.innateUsed = { "spell:innate": 1 };
    expect(innateUsesRemaining(draft, spell())).toBe(1);
  });

  it("tracks remaining uses on the character", () => {
    const draft = emptyCharacterDraft("Innate");
    draft.spells.innateUsed = { "spell:innate": 1 };
    expect(innateUsesRemaining(draft, spell())).toBe(0);
    expect(innateUsesRemaining(draft, spell({ rank: 0 }))).toBeNull();
  });

  it("consumes one use when cast through the innate resource", () => {
    const draft = emptyCharacterDraft("Innate");
    const options = spellCastOptions(spell(), draft, context, {
      innate: true,
      innateRemaining: 1,
    });
    expect(options).toMatchObject([{ resource: "innate", remaining: 1 }]);
    expect(options[0].label).toBe("Innate use (1 left)");
    expect(spellCastOptionAvailable(options[0])).toBe(true);
    const result = castSpell(
      draft,
      spell(),
      context,
      { rank: 1, resource: "innate" },
      { innate: true, innateRemaining: 1 }
    );
    expect(result?.draft.spells.innateUsed["spell:innate"]).toBe(1);

    const spent = spellCastOptions(spell(), result!.draft, context, {
      innate: true,
      innateRemaining: 0,
    });
    expect(spellCastOptionAvailable(spent[0])).toBe(false);
    expect(
      castSpell(
        result!.draft,
        spell(),
        context,
        { rank: 1, resource: "innate" },
        { innate: true, innateRemaining: 0 }
      )
    ).toBeNull();
  });

  it("does not consume a use for an at-will innate cantrip", () => {
    const draft = emptyCharacterDraft("Innate");
    const result = castSpell(
      draft,
      spell({ rank: 0 }),
      context,
      { rank: 1, resource: "innate" },
      { innate: true, innateRemaining: null }
    );
    expect(result?.draft.spells.innateUsed).toEqual({});
  });

  it("increments the use counter directly", () => {
    const draft = emptyCharacterDraft("Innate");
    expect(consumeInnateUse(draft, "spell:innate").spells.innateUsed).toEqual({
      "spell:innate": 1,
    });
  });
});
