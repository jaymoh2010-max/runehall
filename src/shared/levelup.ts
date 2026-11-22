/**
 * Current HP after gaining a level. Full characters stay at "full" (null),
 * while wounded characters gain the same increase as their maximum.
 */
export function levelUpCurrentHp(
  currentHp: number | null,
  maxHpBefore: number,
  maxHpAfter: number
): number | null {
  if (currentHp === null || currentHp >= maxHpBefore) return null;
  // A dying character stays at 0 HP and keeps their dying state. Leveling up
  // must not revive them.
  if (currentHp <= 0) return Math.max(0, currentHp);
  const gained = Math.max(0, maxHpAfter - maxHpBefore);
  return Math.min(maxHpAfter, currentHp + gained);
}

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
