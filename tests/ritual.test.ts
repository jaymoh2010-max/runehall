import { describe, expect, it } from "vitest";
import { ritualPrimarySkillName } from "../src/shared/ritual";

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

  it("returns null when the ritual text has no primary check", () => {
    expect(ritualPrimarySkillName("You travel to another plane.")).toBeNull();
    expect(ritualPrimarySkillName("Primary Check to cast the ritual")).toBeNull();
    expect(ritualPrimarySkillName("Primary Check Cooking Lore")).toBeNull();
  });
});
