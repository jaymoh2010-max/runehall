import type { Ancestry, CharacterDraft, Feat, Heritage, SkillId } from "./types";
import { SKILLS } from "./types";
import type { EffectModifiers, FeatGrantDefinition } from "./effects";

/**
 * Curated level-1 heritage mechanics. The checked-in heritage compendium is
 * prose-only, so this table encodes only rules that the sheet can apply
 * unambiguously. Keep names alongside ids so a data update fails loudly in the
 * drift test instead of silently applying the wrong mechanics.
 */
export interface HeritageMechanics {
  name: string;
  grantedTraits?: string[];
  featTraits?: string[];
  senses?: {
    lowLight?: boolean;
    darkvisionIfAncestryHasLowLight?: boolean;
  };
  skillChoice?: {
    prompt: string;
    options: SkillId[];
    expertAtLevel?: number;
  };
  featGrant?: FeatGrantDefinition & {
    filterTraits?: string[];
    excludeOwnClass?: boolean;
  };
  languageOptions?: string[];
  notes?: string[];
}

const ALL_SKILLS = SKILLS.map((skill) => skill.id);

export const HERITAGE_MECHANICS: Record<string, HeritageMechanics> = {
  "her:zVf0Hlp5xG0Q7kmc": {
    name: "Skilled Human",
    skillChoice: {
      prompt: "Choose a skill to train",
      options: ALL_SKILLS,
      expertAtLevel: 5,
    },
  },
  "her:hFBwsVcSnNCJoimo": {
    name: "Versatile Human",
    featGrant: {
      prompt: "Choose a 1st-level general feat",
      category: "general",
      level: 1,
    },
  },
  "her:Nd9hdX8rdYyRozw8": {
    name: "Ancient Elf",
    featGrant: {
      prompt: "Choose a multiclass dedication for another class",
      category: "class",
      level: 2,
      filterTraits: ["dedication", "multiclass"],
      excludeOwnClass: true,
    },
    notes: [
      "Ancient Elf ignores the dedication's level prerequisite; you must still meet its other prerequisites.",
    ],
  },
  "her:N36ZR4lh9eCazDaN": {
    name: "Aiuvarin",
    grantedTraits: ["elf"],
    featTraits: ["elf"],
    senses: { lowLight: true },
  },
  "her:tLd8Qg82AwEbbmgX": {
    name: "Dromaar",
    grantedTraits: ["orc"],
    featTraits: ["orc"],
    senses: { lowLight: true },
  },
  "her:1oLMOmLpurfWTTff": {
    name: "Nephilim",
    senses: { lowLight: true, darkvisionIfAncestryHasLowLight: true },
  },
  "her:EKY9v7SF1hVsUdbH": {
    name: "Changeling",
    senses: { lowLight: true, darkvisionIfAncestryHasLowLight: true },
  },
  "her:UaD5VDoFlILEmbyz": {
    name: "Dhampir",
    senses: { lowLight: true, darkvisionIfAncestryHasLowLight: true },
    notes: ["Void healing: harmed by vitality damage and healed by void effects as if undead."],
  },
  "her:cbbXIV4QBred4lM5": {
    name: "Dragonblood",
    languageOptions: ["draconic"],
    notes: [
      "When you roll a success on a saving throw against a fear effect, you get a critical success instead.",
      "Record your draconic exemplar; dragonblood feats that reference it need table tracking.",
    ],
  },
  "her:ZZKZkeSP5TuT62IA": {
    name: "Duskwalker",
    senses: { lowLight: true, darkvisionIfAncestryHasLowLight: true },
    notes: ["Neither your body nor your spirit can ever become undead."],
  },
};

export function heritageMechanics(id: string | null | undefined): HeritageMechanics | null {
  return id ? (HERITAGE_MECHANICS[id] ?? null) : null;
}

export function heritageGrantedTraits(heritage: Heritage | null | undefined): string[] {
  return [...(heritageMechanics(heritage?.id)?.grantedTraits ?? [])];
}

export function heritageFeatTraits(
  heritage: Heritage | null | undefined,
  ancestry: Ancestry | null | undefined
): string[] {
  const mechanics = heritageMechanics(heritage?.id);
  return [
    ...new Set([
      ...(ancestry?.traits ?? []),
      ...(heritage?.traits ?? []),
      ...(mechanics?.featTraits ?? []),
      ...(mechanics?.grantedTraits ?? []),
    ]),
  ];
}

export function heritageSenseList(
  heritage: Heritage | null | undefined,
  ancestry: Ancestry | null | undefined
): string[] {
  const mechanics = heritageMechanics(heritage?.id);
  if (!mechanics?.senses) return [];
  const vision = ancestry?.vision ?? "normal";
  const senses: string[] = [];
  if (mechanics.senses.lowLight && vision === "normal") senses.push("lowLight");
  if (
    mechanics.senses.darkvisionIfAncestryHasLowLight &&
    (vision === "lowLight" || vision === "darkvision")
  ) {
    senses.push("darkvision");
  }
  return senses;
}

export function heritageLanguageOptions(heritage: Heritage | null | undefined): string[] {
  return [...(heritageMechanics(heritage?.id)?.languageOptions ?? [])];
}

export function heritageNotes(heritage: Heritage | null | undefined): string[] {
  return [...(heritageMechanics(heritage?.id)?.notes ?? [])];
}

export function heritageFeatGrant(
  heritage: Heritage | null | undefined
): HeritageMechanics["featGrant"] | null {
  return heritageMechanics(heritage?.id)?.featGrant ?? null;
}

export function heritageSkillChoice(
  heritage: Heritage | null | undefined
): HeritageMechanics["skillChoice"] | null {
  return heritageMechanics(heritage?.id)?.skillChoice ?? null;
}

export function heritageChosenFeatId(
  draft: CharacterDraft,
  heritage: Heritage | null | undefined
): string | null {
  if (!heritageFeatGrant(heritage) || !heritage?.id) return null;
  return draft.featChoices[heritage.id]?.[0]?.trim() || null;
}

export function featAllowedByHeritageGrant(
  feat: Feat,
  grant: HeritageMechanics["featGrant"] | null | undefined,
  className?: string | null
): boolean {
  if (!grant) return false;
  if (feat.category !== grant.category) return false;
  if (feat.level > grant.level) return false;
  if (grant.filterTraits?.length) {
    const traits = new Set(feat.traits.map((trait) => trait.toLowerCase()));
    if (!grant.filterTraits.every((trait) => traits.has(trait.toLowerCase()))) return false;
  }
  if (grant.excludeOwnClass && className) {
    const own = className.toLowerCase();
    if (feat.traits.some((trait) => trait.toLowerCase() === own)) return false;
  }
  return true;
}

export function heritageEffects(
  draft: CharacterDraft,
  heritage: Heritage | null | undefined,
  ancestry: Ancestry | null | undefined
): EffectModifiers {
  const mechanics = heritageMechanics(heritage?.id);
  if (!mechanics) return {};
  const effects: EffectModifiers = {
    senses: heritageSenseList(heritage, ancestry),
    notes: heritageNotes(heritage),
    languages: [],
  };
  const skillChoice = mechanics.skillChoice;
  if (skillChoice && heritage?.id) {
    const chosen = draft.featChoices[heritage.id]?.[0] as SkillId | undefined;
    if (chosen && skillChoice.options.includes(chosen)) {
      const rank = skillChoice.expertAtLevel && draft.level >= skillChoice.expertAtLevel ? 2 : 1;
      effects.trainedSkills = [chosen];
      effects.skillRanks = { [chosen]: rank };
    }
  }
  return effects;
}
