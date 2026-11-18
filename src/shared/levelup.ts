export interface LevelUpChoice {
  id: string;
  label: string;
  detail: string;
  /** Builder section that resolves this choice. */
  step: string;
}

export interface LevelUpWizardStep {
  id: string;
  title: string;
  detail: string;
  kind: "overview" | "choice" | "confirm";
  choice?: LevelUpChoice;
  hpBefore?: number;
  hpAfter?: number;
}

/**
 * Builds the pre-level wizard. The first step explains the level and HP change,
 * each required choice gets its own page, and the last step confirms that the
 * level will be applied before the persistent checklist takes over.
 */
export function buildLevelUpWizardSteps(input: {
  fromLevel: number;
  toLevel: number;
  hpBefore: number;
  hpAfter: number;
  choices: LevelUpChoice[];
}): LevelUpWizardStep[] {
  const steps: LevelUpWizardStep[] = [
    {
      id: "overview",
      title: "What changes",
      detail: `Level ${input.fromLevel} → ${input.toLevel}. Hit points ${input.hpBefore} → ${input.hpAfter}.`,
      kind: "overview",
      hpBefore: input.hpBefore,
      hpAfter: input.hpAfter,
    },
  ];
  for (const choice of input.choices) {
    steps.push({
      id: `choice-${choice.id}`,
      title: choice.label,
      detail: choice.detail,
      kind: "choice",
      choice,
    });
  }
  steps.push({
    id: "confirm",
    title: "Ready to level up",
    detail: input.choices.length
      ? "Level up, then work through the persistent checklist. The builder jumps to the first new choice."
      : "No new feat, skill, spell, or ability choices at this level. Review the sheet after leveling.",
    kind: "confirm",
  });
  return steps;
}
