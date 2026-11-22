import { describe, expect, it } from "vitest";
import { emptyCharacterDraft, normalizeCharacterDraft } from "../src/shared/rules";
import {
  COST_OF_LIVING,
  dailyUpkeepCp,
  lifestyleRate,
  normalizeLifestyle,
  upkeepCostCp,
} from "../src/shared/upkeep";

describe("Player Core cost of living", () => {
  it("encodes the weekly rates from table 6-16", () => {
    expect(COST_OF_LIVING.subsistence.weeklyCp).toBe(40);
    expect(COST_OF_LIVING.comfortable.weeklyCp).toBe(100);
    expect(COST_OF_LIVING.fine.weeklyCp).toBe(3_000);
    expect(COST_OF_LIVING.extravagant.weeklyCp).toBe(10_000);
  });

  it("prorates the weekly rates to a downtime day, rounding up", () => {
    expect(dailyUpkeepCp("subsistence")).toBe(6);
    expect(dailyUpkeepCp("comfortable")).toBe(15);
    expect(dailyUpkeepCp("fine")).toBe(429);
    expect(dailyUpkeepCp("extravagant")).toBe(1_429);
  });

  it("charges by the day and falls back to subsistence", () => {
    expect(upkeepCostCp("comfortable", 3)).toBe(43);
    expect(upkeepCostCp("comfortable", 7)).toBe(100);
    expect(upkeepCostCp("fine", 0)).toBe(0);
    expect(upkeepCostCp("extravagant", -4)).toBe(0);
    expect(lifestyleRate("unknown").id).toBe("subsistence");
    expect(normalizeLifestyle(undefined)).toBe("subsistence");
    expect(normalizeLifestyle("fine")).toBe("fine");
  });
});

describe("character lifestyle", () => {
  it("defaults new and legacy drafts to subsistence", () => {
    expect(emptyCharacterDraft("Upkeep Test").play.lifestyle).toBe("subsistence");
    const draft = normalizeCharacterDraft({ name: "Upkeep Test" }, "Upkeep Test");
    expect(draft.play.lifestyle).toBe("subsistence");
  });

  it("keeps a valid lifestyle and normalizes an invalid one", () => {
    const draft = normalizeCharacterDraft(
      {
        name: "Upkeep Test",
        play: { lifestyle: "fine", downtimeDays: 7 },
      },
      "Upkeep Test"
    );
    expect(draft.play.lifestyle).toBe("fine");
    expect(draft.play.downtimeDays).toBe(7);
    const fallback = normalizeCharacterDraft(
      { name: "Upkeep Test", play: { lifestyle: "royal" } },
      "Upkeep Test"
    );
    expect(fallback.play.lifestyle).toBe("subsistence");
  });
});
