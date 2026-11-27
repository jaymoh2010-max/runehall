import { describe, expect, it } from "vitest";
import {
  COMMANDER_TACTICS,
  COMMANDER_TACTICS_BY_ID,
  commanderFeatIds,
  commanderFolioLimit,
  commanderLimitBonuses,
  commanderPreparedLimit,
} from "../src/shared/commander";
import { emptyCharacterDraft, normalizeCharacterDraft } from "../src/shared/rules";

describe("commander tactics", () => {
  it("has a unique tactic id for every entry", () => {
    expect(COMMANDER_TACTICS.length).toBe(37);
    expect(new Set(COMMANDER_TACTICS.map((tactic) => tactic.id)).size).toBe(
      COMMANDER_TACTICS.length
    );
    expect(COMMANDER_TACTICS_BY_ID.size).toBe(COMMANDER_TACTICS.length);
  });

  it("scales the folio and prepared limits at the tactician tiers", () => {
    expect([1, 7, 15, 19].map((level) => commanderFolioLimit(level))).toEqual([5, 7, 9, 11]);
    expect([1, 7, 15, 19].map((level) => commanderPreparedLimit(level))).toEqual([3, 4, 5, 6]);
  });

  it("adds folio and prepared limits from commander feats and dedication", () => {
    const expansion = "feat:7CbjQCIEiGRp9Q2n";
    const excellence = "feat:a7sCZ2ehfsLQutvO";
    const efficient = "feat:UvQjCHNAQVhKvTWb";
    const dedication = "feat:e9iVLfL7KIfUG3NV";
    expect(
      commanderLimitBonuses([expansion, expansion, excellence, efficient, dedication])
    ).toEqual({ folio: 8, prepared: 3 });
    expect(commanderFolioLimit(1, [expansion])).toBe(7);
    expect(commanderPreparedLimit(1, [excellence, efficient, dedication])).toBe(6);

    const draft = emptyCharacterDraft("Commander");
    draft.feats.class["2"] = expansion;
    draft.feats.class["4"] = excellence;
    draft.feats.general["3"] = efficient;
    expect(commanderFeatIds(draft)).toEqual(
      expect.arrayContaining([expansion, excellence, efficient])
    );
    expect(commanderLimitBonuses(commanderFeatIds(draft))).toEqual({
      folio: 4,
      prepared: 2,
    });
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
