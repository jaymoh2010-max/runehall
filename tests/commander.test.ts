import { describe, expect, it } from "vitest";
import {
  COMMANDER_TACTICS,
  COMMANDER_TACTICS_BY_ID,
  commanderFolioLimit,
  commanderPreparedLimit,
} from "../src/shared/commander";
import { normalizeCharacterDraft } from "../src/shared/rules";

describe("commander tactics", () => {
  it("has a unique tactic id for every entry", () => {
    expect(COMMANDER_TACTICS.length).toBe(37);
    expect(new Set(COMMANDER_TACTICS.map((tactic) => tactic.id)).size).toBe(
      COMMANDER_TACTICS.length
    );
    expect(COMMANDER_TACTICS_BY_ID.size).toBe(COMMANDER_TACTICS.length);
  });

  it("scales the folio and prepared limits at the tactician tiers", () => {
    expect([1, 7, 15, 19].map(commanderFolioLimit)).toEqual([5, 7, 9, 11]);
    expect([1, 7, 15, 19].map(commanderPreparedLimit)).toEqual([3, 4, 5, 6]);
  });

  it("normalizes folio and prepared ids without duplicates", () => {
    const draft = normalizeCharacterDraft({
      name: "Commander",
      commander: {
        folio: [COMMANDER_TACTICS[0].id, COMMANDER_TACTICS[0].id, 7],
        prepared: [COMMANDER_TACTICS[0].id, COMMANDER_TACTICS[0].id, null],
      },
    });
    expect(draft.commander.folio).toEqual([COMMANDER_TACTICS[0].id]);
    expect(draft.commander.prepared).toEqual([COMMANDER_TACTICS[0].id]);
  });
});
