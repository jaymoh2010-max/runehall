import type { Background } from "./types";

type BackgroundGrantOverride = Partial<
  Pick<
    Background,
    "trainedSkills" | "lore" | "skillChoices" | "loreChoices" | "grantedFeats" | "featChoices"
  >
>;

const feat = (id: string, name: string, level = 1) => ({ id, name, level });
const choice = (prompt: string, options: string[], count = 1) => ({
  prompt,
  options,
  count,
});
const featChoice = (prompt: string, options: ReturnType<typeof feat>[], count = 1) => ({
  prompt,
  options,
  count,
});

/**
 * The generated background data resolves most grants, but a few backgrounds
 * still carry a skill or feat choice only in prose. These overrides fill the
 * missing structured fields without replacing choices that already exist.
 *
 * Choices that depend on a deity, rival, campaign event, or past life stay in
 * the background text and remain manual.
 */
const BACKGROUND_GRANT_OVERRIDES: Record<string, BackgroundGrantOverride> = {
  // Beast Seeker: the feat choice already exists; only the skill choice is missing.
  "bg:J0SCT6yZgdf0DTTD": {
    skillChoices: [choice("Choose Athletics or Thievery", ["athletics", "thievery"])],
  },
  // Brastlewark Student: the feat depends on the chosen skill.
  "bg:RBLjBZ37G34wgxRh": {
    grantedFeats: [],
    featChoices: [
      featChoice("Choose your starting feat", [
        feat("feat:MjQyTcV8Jiv1Jtln", "Recognize Spell"),
        feat("feat:voYr7ygVcWmlg1f4", "Crafter's Appraisal"),
      ]),
    ],
  },
  // Conservator: the feat depends on the chosen skill.
  "bg:Ods1qOZ8CTCru8XQ": {
    grantedFeats: [],
    featChoices: [
      featChoice("Choose your starting feat", [
        feat("feat:ASy9AKEIRxPYUi5o", "Quick Repair"),
        feat("feat:W6Gl9ePmItfDHji0", "Assurance"),
      ]),
    ],
  },
  // Dedicated Delver: the feat depends on the chosen skill.
  "bg:a57iBUZBQtXWZc36": {
    grantedFeats: [],
    skillChoices: [choice("Choose Athletics or Survival", ["athletics", "survival"])],
    featChoices: [
      featChoice("Choose your starting feat", [
        feat("feat:09PurtIanNUPfNRq", "Combat Climber"),
        feat("feat:4tTkRyOQ0VuRBac3", "Terrain Expertise"),
      ]),
    ],
  },
  // Dreams of Vengeance: fixed Titan Wrestler plus the deviant feat choice.
  "bg:fo2nGLI1t1b7nAHK": {
    featChoices: [
      featChoice("Choose your deviant feat", [
        feat("feat:TtAvM02UvfNaXeXd", "Blasting Beams", 2),
        feat("feat:QN7y2CQeiJ2iPioM", "Titan Swing", 2),
      ]),
    ],
  },
  // Glory Hound: the feat choice already exists; only the skill choice is missing.
  "bg:Lue29rc3ZDt64iyL": {
    skillChoices: [choice("Choose Intimidation or Performance", ["intimidation", "performance"])],
  },
  // Historical Reenactor: the feat choice already exists; only the skill choice is missing.
  "bg:2zYdTia5t7w6J2ey": {
    skillChoices: [choice("Choose Performance or Society", ["performance", "society"])],
  },
  // Lost Loved One: fixed Multilingual plus the deviant feat choice.
  "bg:2wGmG7ntcnkvtw8l": {
    featChoices: [
      featChoice("Choose your deviant feat", [
        feat("feat:fFVqsMseN4zA9R24", "Draining Touch", 2),
        feat("feat:C3ukUk4Js10o5IBA", "Ghostly Grasp (Deviant)", 2),
      ]),
    ],
  },
  // Obari Wanderer: the feat choice already exists; only the skill choice is missing.
  "bg:KrlSyOoVcND109iT": {
    skillChoices: [choice("Choose Acrobatics or Survival", ["acrobatics", "survival"])],
  },
  // Sense of Belonging: fixed Forager plus the deviant feat choice.
  "bg:cCi1Lsld9Umz1uHs": {
    featChoices: [
      featChoice("Choose your deviant feat", [
        feat("feat:SC5oZbyvLO5CQwhl", "Sonic Dash", 2),
        feat("feat:jPWF8Xe0UqVvbeyv", "Eerie Flicker", 2),
      ]),
    ],
  },
  // The Hunted: the starting feat is a choice in prose only.
  "bg:HwtR519w8GDmuk8K": {
    featChoices: [
      featChoice("Choose your starting feat", [
        feat("feat:4tTkRyOQ0VuRBac3", "Terrain Expertise"),
        feat("feat:beyw5bdA5hkQbmaG", "Terrain Stalker"),
      ]),
    ],
  },
  // Total Power: fixed Intimidating Glare plus the deviant feat choice.
  "bg:JBRBb2818DZ4hjXw": {
    featChoices: [
      featChoice("Choose your deviant feat", [
        feat("feat:TtAvM02UvfNaXeXd", "Blasting Beams", 2),
        feat("feat:cy9jqlHz75GTjg7l", "Bone Spikes", 2),
      ]),
    ],
  },
  // Wanderlust: fixed Express Rider plus the deviant feat choice.
  "bg:b1588nhgRoYMef44": {
    featChoices: [
      featChoice("Choose your deviant feat", [
        feat("feat:xCi23uEFef9jhtlM", "Overclock Senses", 2),
        feat("feat:QN7y2CQeiJ2iPioM", "Titan Swing", 2),
      ]),
    ],
  },
  // Wish for Riches: fixed Subtle Theft plus the deviant feat choice.
  "bg:vMyMUZpg8MYZT2AZ": {
    featChoices: [
      featChoice("Choose your deviant feat", [
        feat("feat:9Jbl71C5C6MnOqxV", "Consume Energy", 2),
        feat("feat:v4N0tTGjKGMwjqUG", "Borrowed Ability", 2),
      ]),
    ],
  },
};

export function applyBackgroundGrantOverrides(
  background: Background | null | undefined
): Background | null {
  if (!background) return null;
  const override = BACKGROUND_GRANT_OVERRIDES[background.id];
  if (!override) return background;
  return {
    ...background,
    ...override,
    trainedSkills: [...new Set([...background.trainedSkills, ...(override.trainedSkills ?? [])])],
    lore: [...new Set([...background.lore, ...(override.lore ?? [])])],
    skillChoices: override.skillChoices ?? background.skillChoices,
    loreChoices: override.loreChoices ?? background.loreChoices,
    grantedFeats: override.grantedFeats ?? background.grantedFeats,
    featChoices: override.featChoices ?? background.featChoices,
  };
}
