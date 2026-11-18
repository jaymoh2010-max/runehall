import { describe, expect, it } from "vitest";
import { buildLevelUpWizardSteps } from "../src/shared/levelup";

describe("level-up wizard", () => {
  it("builds an overview, one page per choice, and a confirmation", () => {
    const steps = buildLevelUpWizardSteps({
      fromLevel: 1,
      toLevel: 2,
      hpBefore: 12,
      hpAfter: 20,
      choices: [
        {
          id: "feat-class-2",
          label: "Class feat",
          detail: "Choose a level 2 feat.",
          step: "feats",
        },
        { id: "skills-2", label: "Skill increase", detail: "Raise one skill.", step: "skills" },
      ],
    });
    expect(steps.map((step) => step.kind)).toEqual(["overview", "choice", "choice", "confirm"]);
    expect(steps[0]).toMatchObject({ hpBefore: 12, hpAfter: 20 });
    expect(steps[1].choice?.id).toBe("feat-class-2");
    expect(steps[1].id).toBe("choice-feat-class-2");
    expect(steps[2].choice?.step).toBe("skills");
    expect(steps.at(-1)?.id).toBe("confirm");
  });

  it("still confirms a level with no new choices", () => {
    const steps = buildLevelUpWizardSteps({
      fromLevel: 2,
      toLevel: 3,
      hpBefore: 20,
      hpAfter: 27,
      choices: [],
    });
    expect(steps).toHaveLength(2);
    expect(steps[1].detail).toContain("No new feat");
  });
});
