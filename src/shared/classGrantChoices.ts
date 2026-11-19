import type { CharacterDraft, ClassData, ClassGrant, ClassGrantSpell, Deity } from "./types";

function focus(id: string, name: string, source?: string): ClassGrantSpell {
  return { id, name, rank: 1, kind: "focus", source };
}

function repertoire(id: string, name: string, rank = 1, source?: string): ClassGrantSpell {
  return { id, name, rank, kind: "repertoire", source };
}

function curriculum(id: string, name: string, rank = 1, source?: string): ClassGrantSpell {
  return { id, name, rank, kind: "curriculum", source };
}

export type GrantChoiceSource =
  | { kind: "feat"; featId: string }
  | { kind: "class-option"; optionId: string }
  | { kind: "class-choice-tag"; tag: string };

export interface GrantChoiceOption {
  /** Stable persisted id, e.g. "fire", "domain:fire", "envy". */
  id: string;
  name: string;
  grant: ClassGrant;
  /** Requires this key in the deity's domains or alternate domains. */
  domain?: string;
  /** Requires this entry in the deity's font. */
  requiresDeityFont?: "heal" | "harm";
  hint?: string;
}

export interface GrantChoiceGroup {
  key: string;
  prompt: string;
  chooseLabel: string;
  count: number;
  minLevel: number;
  source: GrantChoiceSource;
  /** Applied once when the group is active, even before a pick is made. */
  baseGrant?: ClassGrant;
  /** Shown when no legal option exists yet, e.g. before a deity is chosen. */
  emptyHint?: string;
  options: GrantChoiceOption[];
}

export const GRANT_CHOICE_KEYS = {
  clericDomain: "grant:cleric-domain",
  championDevotion: "grant:champion-devotion",
  sorcererElement: "grant:sorcerer-element",
  runelordSin: "grant:runelord-sin",
} as const;

const DOMAIN_NAMES: Record<string, string> = {
  abomination: "Abomination",
  air: "Air",
  ambition: "Ambition",
  change: "Change",
  cities: "Cities",
  cold: "Cold",
  confidence: "Confidence",
  creation: "Creation",
  darkness: "Darkness",
  death: "Death",
  decay: "Decay",
  destruction: "Destruction",
  disorientation: "Disorientation",
  dragon: "Dragon",
  dreams: "Dreams",
  dust: "Dust",
  duty: "Duty",
  earth: "Earth",
  family: "Family",
  fate: "Fate",
  fire: "Fire",
  freedom: "Freedom",
  glyph: "Glyph",
  healing: "Healing",
  indulgence: "Indulgence",
  introspection: "Introspection",
  knowledge: "Knowledge",
  lightning: "Lightning",
  luck: "Luck",
  magic: "Magic",
  metal: "Metal",
  might: "Might",
  moon: "Moon",
  naga: "Naga",
  nature: "Nature",
  nightmares: "Nightmares",
  nothingness: "Nothingness",
  pain: "Pain",
  passion: "Passion",
  perfection: "Perfection",
  plague: "Plague",
  protection: "Protection",
  repose: "Repose",
  secrecy: "Secrecy",
  sorrow: "Sorrow",
  soul: "Soul",
  star: "Star",
  sun: "Sun",
  swarm: "Swarm",
  time: "Time",
  toil: "Toil",
  travel: "Travel",
  trickery: "Trickery",
  truth: "Truth",
  tyranny: "Tyranny",
  undeath: "Undeath",
  vigil: "Vigil",
  water: "Water",
  wealth: "Wealth",
  wood: "Wood",
  zeal: "Zeal",
};

export const DOMAIN_ALIASES: Record<string, string> = {
  delirium: "disorientation",
  void: "nothingness",
  wyrmkin: "dragon",
};

export function canonicalDomainKey(raw: string): string {
  const key = raw.trim().toLowerCase();
  return DOMAIN_ALIASES[key] ?? key;
}

export function domainInitialSpell(raw: string): DomainSpell | undefined {
  return DOMAIN_SPELLS[canonicalDomainKey(raw)];
}

interface DomainSpell {
  id: string;
  name: string;
}

/** Initial domain spells for the remastered domains in the deity data. */
export const DOMAIN_SPELLS: Record<string, DomainSpell> = {
  abomination: { id: "spell:6GjJtLJnwC18Y0aZ", name: "Lift Nature's Caul" },
  air: { id: "spell:myC2EIrsjmB8xosi", name: "Pushing Gust" },
  ambition: { id: "spell:Dj44lViYKvOJ8a53", name: "Ignite Ambition" },
  change: { id: "spell:GUnw9YXaW3YyaCAU", name: "Adapt Self" },
  cities: { id: "spell:yH13KXUK2x093NUv", name: "Face in the Crowd" },
  cold: { id: "spell:DeNz6eAUlE0IE9U3", name: "Winter Bolt" },
  confidence: { id: "spell:Q25JQAgnJSGgFDKZ", name: "Veil of Confidence" },
  creation: { id: "spell:xTpp8dHZsNMDm75B", name: "Creative Splash" },
  darkness: { id: "spell:SE0fbgBj7atuukdv", name: "Cloak of Shadow" },
  death: { id: "spell:HG4afO9EOGEU9bZN", name: "Death's Call" },
  decay: { id: "spell:7tp97g0UCJ9wOrd5", name: "Withering Grasp" },
  destruction: { id: "spell:0H1ozccQGGFLUwFI", name: "Cry of Destruction" },
  disorientation: { id: "spell:XhgMx9WC6NfXd9RP", name: "Clouded Focus" },
  dragon: { id: "spell:S6Kkk15MWGqzC00a", name: "Draconic Barrage" },
  dreams: { id: "spell:BRtKFk0PKfWIlCAB", name: "Sweet Dream" },
  dust: { id: "spell:7CUgqHunmHfW2lC5", name: "Parch" },
  duty: { id: "spell:AYN0UihkU8Fa8yC6", name: "Swear Oath" },
  earth: { id: "spell:pRKaEXnjGJXbPHPC", name: "Hurtling Stone" },
  family: { id: "spell:YGRpHU5yxw73mls8", name: "Soothing Words" },
  fate: { id: "spell:Vvxgn7saUPW2bJhb", name: "Read Fate" },
  fire: { id: "spell:oJKZi8OQgmVXHOc0", name: "Fire Ray" },
  freedom: { id: "spell:gwOYh5zMVZB0HNcT", name: "Unimpeded Stride" },
  glyph: { id: "spell:ifXNOhtmU4fKL68v", name: "Redact" },
  healing: { id: "spell:rhJyqB9g3ziImQgM", name: "Healer's Blessing" },
  indulgence: { id: "spell:mFHQ2u4LWiejqKQG", name: "Overstuff" },
  introspection: { id: "spell:R569jdqpNry8m0TJ", name: "Guided Introspection" },
  knowledge: { id: "spell:dXIRotMLsABDQQSB", name: "Scholarly Recollection" },
  lightning: { id: "spell:g1eY1vN44mgluE33", name: "Charged Javelin" },
  luck: { id: "spell:Fr2CGvWcgSyLcUi7", name: "Bit of Luck" },
  magic: { id: "spell:u4FGIUQgruLjml7J", name: "Magic's Vessel" },
  metal: { id: "spell:YKexU7BkwNq4ESCc", name: "Serrate" },
  might: { id: "spell:UGJzJRJDoonfWqqI", name: "Athletic Rush" },
  moon: { id: "spell:SuBtUJiU6DbSJYIw", name: "Moonbeam" },
  naga: { id: "spell:JkyUu62rLxcNT4K9", name: "Chastising Retort" },
  nature: { id: "spell:nnSipUPNd3sm5vYL", name: "Vibrant Thorns" },
  nightmares: { id: "spell:DU5daB09xwfE1y38", name: "Waking Nightmare" },
  nothingness: { id: "spell:0cF9HvHzzWSbCFBP", name: "Empty Inside" },
  pain: { id: "spell:xn0V2HDrmDWNzPEt", name: "Savor the Sting" },
  passion: { id: "spell:ut9IhJ9jSZSHDUop", name: "Charming Touch" },
  perfection: { id: "spell:cDFAQN7Z3es07WSA", name: "Perfected Mind" },
  plague: { id: "spell:NkeLctXo9FLGnDhi", name: "Divine Plagues" },
  protection: { id: "spell:rQYob0QMJ0I1U2sU", name: "Protector's Sacrifice" },
  repose: { id: "spell:cJq5NarY0eOZN74A", name: "Share Burden" },
  secrecy: { id: "spell:1RxPW9I70Nd7wokz", name: "Whispering Quiet" },
  sorrow: { id: "spell:T90ij2uu6ZaBaSXV", name: "Lament" },
  soul: { id: "spell:rVhHaWqUsVUO4GuY", name: "Eject Soul" },
  star: { id: "spell:Yrek2Yd4k3DPC2zV", name: "Zenith Star" },
  sun: { id: "spell:zul5cBTfr7NXHBZf", name: "Dazzling Flash" },
  swarm: { id: "spell:5wjl0ZwEvvUh7sor", name: "Swarmsense" },
  time: { id: "spell:3wmX7htzOXiHLdAn", name: "Delay Consequence" },
  toil: { id: "spell:HOj2YsTpkoMpYJH9", name: "Practice Makes Perfect" },
  travel: { id: "spell:cOjlzWerBwbPWVkX", name: "Agile Feet" },
  trickery: { id: "spell:P9bqJsF3WkxGAJKJ", name: "Sudden Shift" },
  truth: { id: "spell:aF7RiG7c8GzSQLYt", name: "Word of Truth" },
  tyranny: { id: "spell:MmQiEc7aM9PDLO2J", name: "Touch of Obedience" },
  undeath: { id: "spell:GYI4xloAgkm6tTrT", name: "Touch of Undeath" },
  vigil: { id: "spell:RztmhJrLLQWoGVdB", name: "Object Memory" },
  water: { id: "spell:iAnpxrLaBU4V6Sej", name: "Tidal Surge" },
  wealth: { id: "spell:ZeftDoh0nFAXBAWY", name: "Appearance of Wealth" },
  wood: { id: "spell:aHu20NHj7YIqxr80", name: "Arms of Nature" },
  zeal: { id: "spell:W37iBXLsY2trJ1rS", name: "Weapon Surge" },
};

function domainOption(domain: string): GrantChoiceOption {
  const spell = DOMAIN_SPELLS[domain];
  return {
    id: `domain:${domain}`,
    name: `${DOMAIN_NAMES[domain] ?? domain} Domain`,
    domain,
    grant: { spells: [focus(spell.id, spell.name)], focusPoints: 1 },
    hint: spell.name,
  };
}

const ELEMENT_OPTIONS: GrantChoiceOption[] = [
  {
    id: "air",
    name: "Air",
    grant: {
      spells: [
        repertoire("spell:dDiOnjcsBFbAvP6t", "Gale Blast", 0),
        repertoire("spell:KcLVELhCUcKXxiKE", "Tailwind", 1),
      ],
    },
    hint: "Gale Blast · Tailwind",
  },
  {
    id: "earth",
    name: "Earth",
    grant: {
      spells: [
        repertoire("spell:zA0jNIBRgLsyTpbm", "Scatter Scree", 0),
        repertoire("spell:Rn2LkoSq1XhLsODV", "Pummeling Rubble", 1),
      ],
    },
    hint: "Scatter Scree · Pummeling Rubble",
  },
  {
    id: "fire",
    name: "Fire",
    grant: {
      spells: [
        repertoire("spell:6DfLZBl8wKIV03Iq", "Ignition", 0),
        repertoire("spell:y6rAdMK6EFlV6U0t", "Breathe Fire", 1),
      ],
    },
    hint: "Ignition · Breathe Fire",
  },
  {
    id: "metal",
    name: "Metal",
    grant: {
      spells: [
        repertoire("spell:kBhaPuzLUSwS6vVf", "Electric Arc", 0),
        repertoire("spell:zDJS8E66UI0himqV", "Thunderstrike", 1),
      ],
    },
    hint: "Electric Arc · Thunderstrike",
  },
  {
    id: "water",
    name: "Water",
    grant: {
      spells: [
        repertoire("spell:IxhGEKl63R4QBvkj", "Frostbite", 0),
        repertoire("spell:jfVCuOpzC6mUrf6f", "Hydraulic Push", 1),
      ],
    },
    hint: "Frostbite · Hydraulic Push",
  },
  {
    id: "wood",
    name: "Wood",
    grant: {
      spells: [
        repertoire("spell:uZK2BYzPnxUBnDjr", "Tangle Vine", 0),
        repertoire("spell:qXTB7Ec9yYh5JPPV", "Cleanse Cuisine", 1),
      ],
    },
    hint: "Tangle Vine · Cleanse Cuisine",
  },
];

interface SinData {
  focus: [string, string];
  cantrips: [string, string][];
  first: [string, string][];
}

const SIN_DATA: Record<string, SinData> = {
  envy: {
    focus: ["spell:mMyMOxYzMxADdO5M", "Cutting Eye"],
    cantrips: [
      ["spell:TVKNbcgTee19PXZR", "Shield"],
      ["spell:uZK2BYzPnxUBnDjr", "Tangle Vine"],
    ],
    first: [
      ["spell:8E97SA9KAWCNdXfO", "Schadenfreude"],
      ["spell:J7Y7tl0bbdz7TcCc", "Enfeeble"],
    ],
  },
  gluttony: {
    focus: ["spell:wJi0lq4yA5Mlj0MY", "All-Encompassing Hunger"],
    cantrips: [
      ["spell:thAHF1zxNplLCJPO", "Caustic Blast"],
      ["spell:mAMEt4FFbdqoRnkN", "Void Warp"],
    ],
    first: [
      ["spell:k34hDOfIIMAxNL4a", "Grim Tendrils"],
      ["spell:9WGeBwIIbbUuWKq0", "Summon Undead"],
    ],
  },
  greed: {
    focus: ["spell:v14zLiiSc4sl9RrK", "Precious Gleam"],
    cantrips: [
      ["spell:Vbj8bTQ1nwrOBbYF", "Live Wire"],
      ["spell:OhD2Z6rIGGD5ocZA", "Read Aura"],
    ],
    first: [
      ["spell:X9dkmh23lFwMjrYd", "Ant Haul"],
      ["spell:2tHYKoVc5YhSewDO", "Leaden Steps"],
    ],
  },
  lust: {
    focus: ["spell:1B8BLEQBQn9aEMoY", "Heart's Hook"],
    cantrips: [
      ["spell:4gBIw4IDrSfFHik4", "Daze"],
      ["spell:vLzFcIaSXs7YTIqJ", "Message"],
    ],
    first: [
      ["spell:vLA0q0WOK2YPuJs6", "Charm"],
      ["spell:aIHY2DArKFweIrpf", "Command"],
    ],
  },
  pride: {
    focus: ["spell:C8HWMMuB5tMhqJ5W", "Crescent Scepter"],
    cantrips: [
      ["spell:W02bHXylIpoXbO4e", "Bullhorn"],
      ["spell:0zU8CPejjQFnhZFI", "Figment"],
    ],
    first: [
      ["spell:UKsIOWmMx4hSpafl", "Dizzying Colors"],
      ["spell:i35dpZFI7jZcRoBo", "Illusory Disguise"],
    ],
  },
  sloth: {
    focus: ["spell:lsR3RLEdBG4rcSzd", "Reclined Apport"],
    cantrips: [
      ["spell:pwzdSlJgYqN7bs2w", "Telekinetic Hand"],
      ["spell:60sgbuMWN0268dB7", "Telekinetic Projectile"],
    ],
    first: [
      ["spell:o4lRVTwSxnOOn5vl", "Sleep"],
      ["spell:J7Y7tl0bbdz7TcCc", "Enfeeble"],
    ],
  },
  wrath: {
    focus: ["spell:8uVMoiYDzhzWJEZ2", "Vengeful Glare"],
    cantrips: [
      ["spell:IxhGEKl63R4QBvkj", "Frostbite"],
      ["spell:6DfLZBl8wKIV03Iq", "Ignition"],
    ],
    first: [
      ["spell:gKKqvLohtrSJj3BM", "Force Barrage"],
      ["spell:zDJS8E66UI0himqV", "Thunderstrike"],
    ],
  },
};

const SIN_NAMES: Record<string, string> = {
  envy: "Envy",
  gluttony: "Gluttony",
  greed: "Greed",
  lust: "Lust",
  pride: "Pride",
  sloth: "Sloth",
  wrath: "Wrath",
};

function sinOption(sin: string): GrantChoiceOption {
  const data = SIN_DATA[sin];
  return {
    id: sin,
    name: SIN_NAMES[sin] ?? sin,
    grant: {
      spells: [
        focus(data.focus[0], data.focus[1]),
        ...data.cantrips.map(([id, name]) => curriculum(id, name, 0)),
        ...data.first.map(([id, name]) => curriculum(id, name, 1)),
      ],
    },
    hint: `${data.focus[1]} · sin curriculum`,
  };
}

const DEVOTION_OPTIONS: GrantChoiceOption[] = [
  {
    id: "lay-on-hands",
    name: "Lay on Hands",
    requiresDeityFont: "heal",
    grant: { spells: [focus("spell:zNN9212H2FGfM7VS", "Lay on Hands")], focusPoints: 1 },
  },
  {
    id: "touch-of-the-void",
    name: "Touch of the Void",
    requiresDeityFont: "harm",
    grant: { spells: [focus("spell:jFmWSIpJGGebim6y", "Touch of the Void")], focusPoints: 1 },
  },
  {
    id: "shields-of-the-spirit",
    name: "Shields of the Spirit",
    grant: {
      spells: [focus("spell:ZL97DcoJ8us6EwAF", "Shields of the Spirit")],
      focusPoints: 1,
    },
  },
];

export const GRANT_CHOICE_GROUPS: GrantChoiceGroup[] = [
  {
    key: GRANT_CHOICE_KEYS.clericDomain,
    prompt: "Domain Initiate: choose a domain.",
    chooseLabel: "domain",
    count: 1,
    minLevel: 1,
    source: { kind: "feat", featId: "feat:hT4INKGtly4QY8KN" },
    baseGrant: { focusPoints: 1 },
    emptyHint: "Choose a deity on the Class step to see its domains.",
    options: Object.keys(DOMAIN_SPELLS).map(domainOption),
  },
  {
    key: GRANT_CHOICE_KEYS.championDevotion,
    prompt: "Choose your devotion spell.",
    chooseLabel: "devotion spell",
    count: 1,
    minLevel: 1,
    source: { kind: "class-choice-tag", tag: "champion-cause" },
    baseGrant: { focusPoints: 1 },
    emptyHint: "Choose a deity with a heal or harm font to see its devotion options.",
    options: DEVOTION_OPTIONS,
  },
  {
    key: GRANT_CHOICE_KEYS.sorcererElement,
    prompt: "Elemental bloodline: choose an element.",
    chooseLabel: "element",
    count: 1,
    minLevel: 1,
    source: { kind: "class-option", optionId: "cf:RXRnJcG4XSabZ35a" },
    options: ELEMENT_OPTIONS,
  },
  {
    key: GRANT_CHOICE_KEYS.runelordSin,
    prompt: "Runelord: choose your sin.",
    chooseLabel: "sin",
    count: 1,
    minLevel: 1,
    source: { kind: "class-option", optionId: "cf:HYTaibaCGE85rhbZ" },
    options: ["envy", "gluttony", "greed", "lust", "pride", "sloth", "wrath"].map(sinOption),
  },
];

export function activeGrantChoiceGroups(
  draft: CharacterDraft,
  classData: ClassData | null | undefined,
  deity?: Deity | null,
  extraFeatIds: Iterable<string> = []
): GrantChoiceGroup[] {
  if (!classData) return [];
  const selectedOptionIds = new Set<string>();
  const selectedTags = new Set<string>();
  for (const group of classData.choiceGroups) {
    const picks = draft.classChoices[group.key] ?? [];
    if (picks.length) selectedTags.add(group.tag);
    for (const id of picks) selectedOptionIds.add(id);
  }
  const activeFeatIds = new Set<string>([
    ...Object.values(draft.feats.ancestry),
    ...Object.values(draft.feats.class),
    ...Object.values(draft.feats.skill),
    ...Object.values(draft.feats.general),
    ...draft.feats.extras,
    ...Object.values(draft.featChoices).flat(),
    ...(draft.backgroundFeat ? [draft.backgroundFeat] : []),
    ...extraFeatIds,
  ]);
  const sourceActive = (source: GrantChoiceSource) => {
    if (source.kind === "feat") return activeFeatIds.has(source.featId);
    if (source.kind === "class-option") return selectedOptionIds.has(source.optionId);
    return selectedTags.has(source.tag);
  };
  const optionAllowed = (option: GrantChoiceOption) => {
    if (option.domain) {
      if (!deity) return false;
      const domains = new Set(
        [...(deity.domains ?? []), ...(deity.alternateDomains ?? [])].map(canonicalDomainKey)
      );
      return domains.has(canonicalDomainKey(option.domain));
    }
    if (option.requiresDeityFont) {
      return !deity || deity.font.includes(option.requiresDeityFont);
    }
    return true;
  };

  return GRANT_CHOICE_GROUPS.flatMap((group) => {
    if (group.minLevel > draft.level || !sourceActive(group.source)) return [];
    const options = group.options.filter(optionAllowed);
    if (!options.length && !group.emptyHint) return [];
    return [{ ...group, options }];
  });
}
