import { describe, expect, it } from "vitest";
import {
  computeCharacter,
  emptyCharacterDraft,
  normalizeCharacterDraft,
  startingWealthCp,
} from "../src/shared/rules";
import type { CharacterContext, Equipment } from "../src/shared/types";

const sword: Equipment = {
  id: "item:sword",
  name: "Sword",
  type: "weapon",
  level: 1,
  price: { gp: 15, sp: 0, cp: 0, cpTotal: 1500 },
  bulk: 1,
  rarity: "common",
  traits: [],
  usage: "held",
  description: "",
  source: "Test",
  license: "ORC",
  remaster: true,
  playtest: false,
};

function context(item: Equipment | null = null): CharacterContext {
  return {
    feats: {},
    spells: {},
    equipment: item ? { [item.id]: item } : {},
  };
}

describe("starting wealth", () => {
  it("starts new characters with a creation budget", () => {
    const draft = emptyCharacterDraft("Budget Test");
    expect(draft.wealthBudgetCp).toBe(startingWealthCp(1));
    const derived = computeCharacter(draft, context());
    expect(derived.wealth.budget).toBe(1500);
    expect(derived.wealth.remaining).toBe(1500);
  });

  it("counts both gear and carried coins against the budget", () => {
    const draft = emptyCharacterDraft("Budget Test");
    draft.equipment = [{ itemId: sword.id, quantity: 1, equipped: false }];
    draft.currency.gp = 1;
    const derived = computeCharacter(draft, context(sword));
    expect(derived.wealth.spent).toBe(1500);
    expect(derived.wealth.currencyCp).toBe(100);
    expect(derived.wealth.committed).toBe(1600);
    expect(derived.wealth.remaining).toBe(-100);
    expect(
      derived.validation.some((issue) => issue.message.includes("exceed the standard starting"))
    ).toBe(true);
  });

  it("does not apply a creation budget to imported or legacy characters", () => {
    const draft = emptyCharacterDraft("Imported Hero");
    draft.wealthBudgetCp = null;
    draft.equipment = [{ itemId: sword.id, quantity: 2, equipped: false }];
    const derived = computeCharacter(draft, context(sword));
    expect(derived.wealth.budget).toBeNull();
    expect(derived.wealth.remaining).toBeNull();
    expect(derived.validation.some((issue) => issue.message.includes("starting wealth"))).toBe(
      false
    );
  });

  it("preserves an explicit budget and defaults legacy drafts to unbudgeted", () => {
    const budgeted = normalizeCharacterDraft({
      ...emptyCharacterDraft("Budgeted"),
      wealthBudgetCp: 1500,
    });
    expect(budgeted.wealthBudgetCp).toBe(1500);

    const legacy = normalizeCharacterDraft({ name: "Legacy", level: 1 });
    expect(legacy.wealthBudgetCp).toBeNull();
  });
});
