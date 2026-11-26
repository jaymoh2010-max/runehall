import { describe, expect, it } from "vitest";
import { spells as contextSpells } from "../src/server/compendium";
import {
  ritualPrimaryCheckInfo,
  ritualPrimarySkillName,
  ritualPrimarySkillNames,
} from "../src/shared/ritual";

describe("ritual primary checks", () => {
  it("reads the skill from the printed Primary Check line", () => {
    expect(
      ritualPrimarySkillName(
        "<p><strong>Primary Check</strong> Arcana (expert)</p><p><strong>Secondary Casters</strong> 2</p>"
      )
    ).toBe("arcana");
    expect(ritualPrimarySkillName("Primary Check Occultism")).toBe("occultism");
    expect(ritualPrimarySkillName("Primary Check Religion (master)")).toBe("religion");
  });

  it("prefers structured ritual data and keeps every printed option", () => {
    const info = ritualPrimaryCheckInfo("", {
      primaryCheck: "Arcana (expert), Occultism (expert), or Religion (expert)",
    });
    expect(info).toMatchObject({
      text: "Arcana (expert), Occultism (expert), or Religion (expert)",
      skills: ["arcana", "occultism", "religion"],
      proficiency: "expert",
      structured: true,
    });

    const paired = ritualPrimaryCheckInfo("", {
      primaryCheck: "Arcana or Occultism (master)",
    });
    expect(paired?.skills).toEqual(["arcana", "occultism"]);
    expect(paired?.proficiency).toBe("master");

    const mythic = ritualPrimaryCheckInfo("", { primaryCheck: "Nature (mythic)" });
    expect(mythic?.skills).toEqual(["nature"]);
    expect(mythic?.proficiency).toBe("mythic");
  });

  it("falls back to prose and refuses unsupported checks", () => {
    expect(
      ritualPrimaryCheckInfo("<p><strong>Primary Check</strong> Occultism or Religion</p>", null)
    ).toMatchObject({ skills: ["occultism", "religion"], structured: false });
    expect(ritualPrimaryCheckInfo("", { primaryCheck: "see below" })).toBeNull();
  });

  it("returns null when the ritual text has no primary check", () => {
    expect(ritualPrimarySkillName("You travel to another plane.")).toBeNull();
    expect(ritualPrimarySkillName("Primary Check to cast the ritual")).toBeNull();
    expect(ritualPrimarySkillName("Primary Check Cooking Lore")).toBeNull();
  });

  it("merges structured ritual checks into the loaded compendium", () => {
    const createUndead = contextSpells.find((spell) => spell.name === "Create Undead");
    expect(createUndead?.ritual).toBe(true);
    expect(createUndead?.ritualData?.primaryCheck).toContain("Arcana");
    expect(ritualPrimarySkillNames("", createUndead?.ritualData)).toEqual([
      "arcana",
      "occultism",
      "religion",
    ]);
  });
});
