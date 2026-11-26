import type { CharacterDraft, ClassData, ClassGrant, ClassGrantSpell, Deity } from "./types";
import {
  ORACLE_REVELATIONS,
  RUNELORD_SIN_SPELLS,
  SORCERER_BLOODLINE_FOCUS,
  SORCERER_DRACONIC_GIFTS,
  SORCERER_ELEMENT_GIFTS,
  SORCERER_GENIE_GIFTS,
  WIZARD_BRANCH_SPELLS,
} from "./classSpellData";

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
  /** Requires this class-choice option (bloodline, mystery, arcane school). */
  requiresClassOption?: string;
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
  /** Restrict domain options to alternate or already-initialized domains. */
  domainScope?:
    | "alternate"
    | "advanced"
    | "mysteryInitial"
    | "mysteryAdvanced"
    | "domainSpirit"
    | "domainSpiritAdvanced";
  /** Expand the number of picks to the number of times this feat is selected. */
  countFromFeat?: string;
  options: GrantChoiceOption[];
}

/**
 * Clerics need a deity that grants at least one domain and a divine font.
 * Champions need a font to choose a devotion spell. Other classes may follow
 * any deity, pantheon, or philosophy.
 */
export function deitySupportsClass(
  deity: Deity | null | undefined,
  classData: ClassData | null | undefined
): boolean {
  if (!deity) return false;
  const name = classData?.name.toLowerCase();
  if (name === "cleric") {
    const domains = [...(deity.domains ?? []), ...(deity.alternateDomains ?? [])];
    return domains.length > 0 && deity.font.length > 0;
  }
  if (name === "champion") return deity.font.length > 0;
  return true;
}

export const GRANT_CHOICE_KEYS = {
  clericDomain: "grant:cleric-domain",
  clericExpandedDomain: "grant:cleric-expanded-domain",
  clericAdvancedDomain: "grant:cleric-advanced-domain",
  domainSpirit: "grant:domain-spirit",
  domainSpiritAdvanced: "grant:domain-spirit-advanced",
  championDevotion: "grant:champion-devotion",
  sorcererElement: "grant:sorcerer-element",
  sorcererGenie: "grant:sorcerer-genie",
  sorcererDraconic: "grant:sorcerer-draconic",
  sorcererAdvancedBloodline: "grant:sorcerer-advanced-bloodline",
  sorcererGreaterBloodline: "grant:sorcerer-greater-bloodline",
  runelordSin: "grant:runelord-sin",
  wizardRootedBranch: "grant:wizard-rooted-branch",
  witchHex: "grant:witch-hex",
  oracleMystery: "grant:oracle-mystery",
  oracleDomainAcumen: "grant:oracle-domain-acumen",
  oracleDomainFluency: "grant:oracle-domain-fluency",
  oracleAdvancedRevelation: "grant:oracle-advanced-revelation",
  oracleGreaterRevelation: "grant:oracle-greater-revelation",
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

/** Advanced domain spells granted by Advanced Domain and Domain Fluency. */
export const DOMAIN_ADVANCED_SPELLS: Record<string, DomainSpell> = {
  abomination: { id: "spell:0qA4MfMkFklOz2Lk", name: "Fearful Feast" },
  air: { id: "spell:L8pzCOi7Jzx5ALs9", name: "Disperse into Air" },
  ambition: { id: "spell:NOB92Wpn7jXvtyVW", name: "Competitive Edge" },
  change: { id: "spell:GoKkejPj5yWJPIPK", name: "Adaptive Ablation" },
  cities: { id: "spell:ivKnEtI1z4UqEKIA", name: "Pulse of Civilization" },
  cold: { id: "spell:wjJW9hWY5CkkMvY5", name: "Diamond Dust" },
  confidence: { id: "spell:J8pL8yTshga8QOk8", name: "Delusional Pride" },
  creation: { id: "spell:eb4FXf62NYArTqek", name: "Artistic Flourish" },
  darkness: { id: "spell:2WNFbvToMsEGxmeK", name: "Darkened Sight" },
  death: { id: "spell:J5MNC4xq3CHH31qT", name: "Eradicate Undeath" },
  decay: { id: "spell:2RhZkHNv8ajq0yLq", name: "Fallow Field" },
  destruction: { id: "spell:7d4DUTDIlzDa8OvX", name: "Destructive Aura" },
  disorientation: { id: "spell:HisaZTk67YAxLGBq", name: "Ephemeral Hazards" },
  dragon: { id: "spell:FSu6ZKxr3xdS75wq", name: "Roar of the Dragon" },
  dreams: { id: "spell:PztLrElcZfLwRnEq", name: "Dreamer's Call" },
  dust: { id: "spell:K1wmI4qPmRhFczmy", name: "Dust Storm" },
  duty: { id: "spell:caehfpQz7yp9yNzz", name: "Dutiful Challenge" },
  earth: { id: "spell:cBUuG1yJHGeKffpg", name: "Localized Quake" },
  family: { id: "spell:tYLBjOTvBVn9JtRb", name: "Unity" },
  fate: { id: "spell:GqvKSxzN7A7kuFk4", name: "Tempt Fate" },
  fire: { id: "spell:y7Tusv3CieZktkkV", name: "Flame Barrier" },
  freedom: { id: "spell:2jB9eyX7YekwoCvA", name: "Word of Freedom" },
  glyph: { id: "spell:vhe9DduqaivMs8FV", name: "Ghostly Transcription" },
  healing: { id: "spell:4nHYSMHito1GUXlm", name: "Rebuke Death" },
  indulgence: { id: "spell:ZeHeNQ5BNq6m5F1j", name: "Take its Course" },
  introspection: { id: "spell:VGK9s6LCMMS027zP", name: "Confront Selves" },
  knowledge: { id: "spell:l6zjNysNedpJcmDT", name: "Know the Enemy" },
  lightning: { id: "spell:VUwpDY4Z91s9QCg0", name: "Bottle the Storm" },
  luck: { id: "spell:7OwZHalOdRCRnFmZ", name: "Lucky Break" },
  magic: { id: "spell:2SYq0ZTsOtJEigFx", name: "Mystic Beacon" },
  metal: { id: "spell:pZBovpzdBNLQQQmE", name: "Repel Metal" },
  might: { id: "spell:eG1fBodYwolaXK98", name: "Enduring Might" },
  moon: { id: "spell:oXCwHBeDja4e0Mx0", name: "Touch of the Moon" },
  naga: { id: "spell:jLc8tHSNeXm0RvMQ", name: "Show the Path" },
  nature: { id: "spell:vSSKyUdrHu86E5Gk", name: "Nature's Bounty" },
  nightmares: { id: "spell:skvgOWNTitLehL0b", name: "Shared Nightmare" },
  nothingness: { id: "spell:iMmexY6ZosLS4I5R", name: "Door to Beyond" },
  pain: { id: "spell:SSsUC7rZo0CwayPn", name: "Retributive Pain" },
  passion: { id: "spell:jJphHQlENHFlSElH", name: "Captivating Adoration" },
  perfection: { id: "spell:8ifpNZkaxrbs3dBJ", name: "Perfected Body" },
  plague: { id: "spell:6nTBr5XNuKOuPM5m", name: "Foul Miasma" },
  protection: { id: "spell:DH9Y3RQGWO0GzXGU", name: "Protector's Sphere" },
  repose: { id: "spell:yY1H5zhO5dHmD8lz", name: "Font of Serenity" },
  secrecy: { id: "spell:OsrtOeG0TvDNnEFH", name: "Safeguard Secret" },
  sorrow: { id: "spell:eCniO6INHNfc9Svr", name: "Overflowing Sorrow" },
  soul: { id: "spell:QE9f3OxvvBThymD4", name: "Ectoplasmic Interstice" },
  star: { id: "spell:KG7amdeXWc7MjGXe", name: "Asterism" },
  sun: { id: "spell:8XuNn0h0rHE24m3B", name: "Vital Luminance" },
  swarm: { id: "spell:Pd2M1XY8EXrSfWgJ", name: "Swarm Form" },
  time: { id: "spell:cOwSsSXRsBaXUvlr", name: "Stasis" },
  toil: { id: "spell:gzvRDpM6EvcfYHeu", name: "Tireless Worker" },
  travel: { id: "spell:LrhTFHUtSS9ahogL", name: "Traveler's Transit" },
  trickery: { id: "spell:ZhLYJlOZzUB1OKoe", name: "Trickster's Twin" },
  truth: { id: "spell:ZjbVgIIqMstmdkqP", name: "Glimpse the Truth" },
  tyranny: { id: "spell:4DaHIgtMBTyxebY3", name: "Commanding Lash" },
  undeath: { id: "spell:qzsQmpiQodHBBWYI", name: "Malignant Sustenance" },
  vigil: { id: "spell:nrW6lGV4xDMqLS3P", name: "Remember the Lost" },
  water: { id: "spell:K4LXpaBWrGy6jIER", name: "Downpour" },
  wealth: { id: "spell:APTMURAW1N0Wpk4w", name: "Precious Metals" },
  wood: { id: "spell:Up4zLmZDgciUDpIv", name: "Wood Walk" },
  zeal: { id: "spell:I8CPe9Pp7GABqOyB", name: "Zeal for Battle" },
};

export function domainAdvancedSpell(raw: string): DomainSpell | undefined {
  return DOMAIN_ADVANCED_SPELLS[canonicalDomainKey(raw)];
}

const ORACLE_MYSTERY_DOMAINS: Record<string, string[]> = {
  ancestors: ["death", "duty", "family", "soul"],
  ashes: ["destruction", "dust", "fire", "nothingness"],
  battle: ["destruction", "might", "perfection", "zeal"],
  blight: ["death", "decay", "disorientation", "plague"],
  bones: ["death", "decay", "undeath", "vigil"],
  cosmos: ["darkness", "moon", "nothingness", "star"],
  flames: ["dust", "fire", "star", "sun"],
  life: ["death", "healing", "pain", "soul"],
  lore: ["knowledge", "magic", "secrecy", "truth"],
  tempest: ["air", "cold", "lightning", "water"],
  time: ["change", "fate", "nothingness", "time"],
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

function advancedDomainOption(domain: string): GrantChoiceOption {
  const spell = DOMAIN_ADVANCED_SPELLS[domain];
  return {
    id: `advanced-domain:${domain}`,
    name: `${DOMAIN_NAMES[domain] ?? domain} Advanced Domain`,
    domain,
    grant: { spells: [{ id: spell.id, name: spell.name, rank: 4, kind: "focus" }] },
    hint: spell.name,
  };
}

const ELEMENT_NAMES: Record<string, string> = {
  air: "Air",
  earth: "Earth",
  fire: "Fire",
  metal: "Metal",
  water: "Water",
  wood: "Wood",
};

function spellGiftOption(
  id: string,
  name: string,
  spells: Array<{ id: string; name: string; rank: number }>,
  requiresClassOption?: string
): GrantChoiceOption {
  return {
    id,
    name,
    ...(requiresClassOption ? { requiresClassOption } : {}),
    grant: {
      spells: spells.map((spell) => repertoire(spell.id, spell.name, spell.rank)),
    },
    hint: spells.map((spell) => `${spell.name} (rank ${spell.rank})`).join(" · "),
  };
}

const ELEMENT_OPTIONS: GrantChoiceOption[] = Object.entries(SORCERER_ELEMENT_GIFTS).map(
  ([element, spells]) => spellGiftOption(element, ELEMENT_NAMES[element] ?? element, spells)
);

const GENIE_OPTIONS: GrantChoiceOption[] = Object.entries(SORCERER_GENIE_GIFTS).map(
  ([genie, spells]) => spellGiftOption(genie, genie, spells)
);

const DRACONIC_OPTIONS: GrantChoiceOption[] = Object.entries(SORCERER_DRACONIC_GIFTS).map(
  ([tradition, spells]) => spellGiftOption(tradition, tradition, spells)
);

const ADVANCED_BLOODLINE_OPTIONS: GrantChoiceOption[] = Object.entries(
  SORCERER_BLOODLINE_FOCUS
).flatMap(([featureId, focusData]) => {
  const spell = focusData.advanced;
  if (!spell) return [];
  return [
    {
      id: `advanced-bloodline:${featureId}`,
      name: spell.name,
      requiresClassOption: featureId,
      grant: { spells: [focus(spell.id, spell.name)] },
      hint: `${focusData.name} advanced bloodline spell`,
    },
  ];
});

const GREATER_BLOODLINE_OPTIONS: GrantChoiceOption[] = Object.entries(
  SORCERER_BLOODLINE_FOCUS
).flatMap(([featureId, focusData]) => {
  const spell = focusData.greater;
  if (!spell) return [];
  return [
    {
      id: `greater-bloodline:${featureId}`,
      name: spell.name,
      requiresClassOption: featureId,
      grant: { spells: [focus(spell.id, spell.name)] },
      hint: `${focusData.name} greater bloodline spell`,
    },
  ];
});

const ADVANCED_REVELATION_OPTIONS: GrantChoiceOption[] = Object.entries(ORACLE_REVELATIONS).flatMap(
  ([featureId, mystery]) => {
    const spell = mystery.advanced;
    if (!spell) return [];
    return [
      {
        id: `advanced-revelation:${featureId}`,
        name: spell.name,
        requiresClassOption: featureId,
        grant: { spells: [focus(spell.id, spell.name)] },
        hint: `${mystery.name} advanced revelation`,
      },
    ];
  }
);

const GREATER_REVELATION_OPTIONS: GrantChoiceOption[] = Object.entries(ORACLE_REVELATIONS).flatMap(
  ([featureId, mystery]) => {
    const spell = mystery.greater;
    if (!spell) return [];
    return [
      {
        id: `greater-revelation:${featureId}`,
        name: spell.name,
        requiresClassOption: featureId,
        grant: { spells: [focus(spell.id, spell.name)] },
        hint: `${mystery.name} greater revelation`,
      },
    ];
  }
);

const ROOTED_BRANCH_NAMES: Record<string, string> = {
  "cf:4fmks2barqWlLtik": "Cascade Bearers",
  "cf:JhczMKRuy53BxqBi": "Emerald Boughs",
  "cf:Oa0ENh8Zh7BftViG": "Rain-Scribes",
  "cf:bYooavyooaCqdhYJ": "Tempest-Sun Mages",
  "cf:ivtpFSNKYZGvApBe": "Uzunjati",
};

const ROOTED_BRANCH_OPTIONS: GrantChoiceOption[] = Object.entries(WIZARD_BRANCH_SPELLS).map(
  ([featureId, spells]) => ({
    id: featureId,
    name: ROOTED_BRANCH_NAMES[featureId] ?? featureId,
    grant: {
      spells: spells.map((spell) => curriculum(spell.id, spell.name, spell.rank)),
    },
    hint: spells
      .slice(0, 3)
      .map((spell) => spell.name)
      .join(" · "),
  })
);

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
  const generated = RUNELORD_SIN_SPELLS[sin];
  const spells = generated?.length
    ? generated
    : [
        ...data.cantrips.map(([id, name]) => ({ id, name, rank: 0 })),
        ...data.first.map(([id, name]) => ({ id, name, rank: 1 })),
      ];
  return {
    id: sin,
    name: SIN_NAMES[sin] ?? sin,
    grant: {
      spells: [
        focus(data.focus[0], data.focus[1]),
        ...spells.map((spell) => curriculum(spell.id, spell.name, spell.rank)),
      ],
    },
    hint: `${data.focus[1]} · full sin curriculum`,
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

const WITCH_HEX_OPTIONS: GrantChoiceOption[] = [
  {
    id: "patrons-puppet",
    name: "Patron's Puppet",
    grant: { spells: [focus("spell:aq1yonHeYpbaj3XI", "Patron's Puppet")], focusPoints: 1 },
    hint: "Command your familiar.",
  },
  {
    id: "phase-familiar",
    name: "Phase Familiar",
    grant: { spells: [focus("spell:rMOI8JFJ0nT2mrCF", "Phase Familiar")], focusPoints: 1 },
    hint: "Protect your familiar from harm.",
  },
];

const ORACLE_REVELATION_OPTIONS: GrantChoiceOption[] = [
  ["Ancestors", "Ancestral Touch", "spell:d2pi7laQkzlr3wrS"],
  ["Ashes", "Ashen Wind", "spell:NtzNCW32UlPdY2xS"],
  ["Battle", "Weapon Trance", "spell:RpGB961b8FjXbGHi"],
  ["Blight", "Ulcerous Canker", "spell:DnVTBGCsai6zqMwL"],
  ["Bones", "Soul Siphon", "spell:D6T17BdazhNy3KPm"],
  ["Cosmos", "Spray of Stars", "spell:mlNYROcFrUF8nFgk"],
  ["Flames", "Incendiary Aura", "spell:AspA30tzKCHFWRf0"],
  ["Life", "Life Link", "spell:2gQYrCPwBmwau26O"],
  ["Lore", "Brain Drain", "spell:k2QrUk7jWMAWozMh"],
  ["Tempest", "Tempest Touch", "spell:EzB9i7R6aBRAtJCh"],
  ["Time", "Temporal Distortion", "spell:UbHK19RYbxRXWgWX"],
].map(([name, spellName, spellId]) => ({
  id: name.toLowerCase(),
  name,
  grant: { spells: [focus(spellId, spellName)], focusPoints: 1 },
  hint: spellName,
}));

export const GRANT_CHOICE_GROUPS: GrantChoiceGroup[] = [
  {
    key: GRANT_CHOICE_KEYS.clericDomain,
    prompt: "Domain Initiate: choose a domain.",
    chooseLabel: "domain",
    count: 1,
    minLevel: 1,
    source: { kind: "feat", featId: "feat:hT4INKGtly4QY8KN" },
    baseGrant: { focusPoints: 1 },
    emptyHint: "Choose a deity that grants domains on the Class step.",
    options: Object.keys(DOMAIN_SPELLS).map(domainOption),
  },
  {
    key: GRANT_CHOICE_KEYS.clericExpandedDomain,
    prompt: "Expanded Domain Initiate: choose an alternate domain.",
    chooseLabel: "alternate domain",
    count: 1,
    minLevel: 4,
    source: { kind: "feat", featId: "feat:vQ4DNfpktmaqdgdM" },
    domainScope: "alternate",
    emptyHint: "Choose a deity with an alternate domain that you do not already have.",
    options: Object.keys(DOMAIN_SPELLS).map(domainOption),
  },
  {
    key: GRANT_CHOICE_KEYS.clericAdvancedDomain,
    prompt: "Advanced Domain: choose an advanced domain spell.",
    chooseLabel: "advanced domain",
    count: 1,
    minLevel: 8,
    source: { kind: "feat", featId: "feat:uR44wELN9OlU68cL" },
    domainScope: "advanced",
    countFromFeat: "feat:uR44wELN9OlU68cL",
    emptyHint: "Choose Domain Initiate and one of your deity's domains first.",
    options: Object.keys(DOMAIN_ADVANCED_SPELLS).map(advancedDomainOption),
  },
  {
    key: GRANT_CHOICE_KEYS.domainSpirit,
    prompt: "Domain Spirit: choose a domain tied to your domain spirit.",
    chooseLabel: "domain",
    count: 1,
    minLevel: 6,
    source: { kind: "feat", featId: "feat:DjRkD92AyHNMHOK8" },
    domainScope: "domainSpirit",
    baseGrant: {
      focusPoints: 1,
      notes: [
        "Domain Spirit: the spirit bond and domain approval remain table decisions; the chosen domain spell is granted.",
      ],
    },
    emptyHint: "Take the Rivethun Emissary Dedication and Domain Spirit feat first.",
    options: Object.keys(DOMAIN_SPELLS).map(domainOption),
  },
  {
    key: GRANT_CHOICE_KEYS.domainSpiritAdvanced,
    prompt: "Advanced Domain Spirit: choose your domain spirit's advanced spell.",
    chooseLabel: "advanced domain",
    count: 1,
    minLevel: 10,
    source: { kind: "feat", featId: "feat:053lglnu0gsC6S2N" },
    domainScope: "domainSpiritAdvanced",
    emptyHint: "Choose a domain with Domain Spirit first.",
    options: Object.keys(DOMAIN_ADVANCED_SPELLS).map(advancedDomainOption),
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
    key: GRANT_CHOICE_KEYS.sorcererGenie,
    prompt: "Genie bloodline: choose a genie type.",
    chooseLabel: "genie type",
    count: 1,
    minLevel: 1,
    source: { kind: "class-option", optionId: "cf:tYOMBiH3HbViNWwn" },
    options: GENIE_OPTIONS,
  },
  {
    key: GRANT_CHOICE_KEYS.sorcererDraconic,
    prompt: "Draconic bloodline: choose a draconic exemplar tradition.",
    chooseLabel: "draconic tradition",
    count: 1,
    minLevel: 1,
    source: { kind: "class-option", optionId: "cf:ZHabYxSgYK0XbjhM" },
    options: DRACONIC_OPTIONS,
  },
  {
    key: GRANT_CHOICE_KEYS.sorcererAdvancedBloodline,
    prompt: "Advanced Bloodline: choose your advanced bloodline spell.",
    chooseLabel: "advanced bloodline spell",
    count: 1,
    minLevel: 6,
    source: { kind: "feat", featId: "feat:eZrftEihfuJBldG5" },
    emptyHint: "Choose a bloodline on the Class step first.",
    options: ADVANCED_BLOODLINE_OPTIONS,
  },
  {
    key: GRANT_CHOICE_KEYS.sorcererGreaterBloodline,
    prompt: "Greater Bloodline: choose your greater bloodline spell.",
    chooseLabel: "greater bloodline spell",
    count: 1,
    minLevel: 10,
    source: { kind: "feat", featId: "feat:DpRMdytpPiCypmkJ" },
    emptyHint: "Choose a bloodline on the Class step first.",
    options: GREATER_BLOODLINE_OPTIONS,
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
  {
    key: GRANT_CHOICE_KEYS.wizardRootedBranch,
    prompt: "Rooted Wisdom: choose a secondary branch.",
    chooseLabel: "branch",
    count: 1,
    minLevel: 1,
    source: { kind: "class-option", optionId: "cf:KGkWSv9rARpwWzXW" },
    options: ROOTED_BRANCH_OPTIONS,
  },
  {
    key: GRANT_CHOICE_KEYS.witchHex,
    prompt: "Hexes: choose your first hex.",
    chooseLabel: "hex",
    count: 1,
    minLevel: 1,
    source: { kind: "class-choice-tag", tag: "witch-patron" },
    baseGrant: { focusPoints: 1 },
    options: WITCH_HEX_OPTIONS,
  },
  {
    key: GRANT_CHOICE_KEYS.oracleMystery,
    prompt: "Revelation Spells: choose your initial revelation.",
    chooseLabel: "revelation",
    count: 1,
    minLevel: 1,
    source: { kind: "class-choice-tag", tag: "oracle-mystery" },
    baseGrant: { focusPoints: 1 },
    options: ORACLE_REVELATION_OPTIONS,
  },
  {
    key: GRANT_CHOICE_KEYS.oracleDomainAcumen,
    prompt: "Domain Acumen: choose a domain tied to your mystery.",
    chooseLabel: "domain",
    count: 1,
    minLevel: 2,
    source: { kind: "feat", featId: "feat:qmFWCHOuubEl7VpX" },
    domainScope: "mysteryInitial",
    countFromFeat: "feat:qmFWCHOuubEl7VpX",
    emptyHint: "Choose a domain associated with your oracle mystery that you do not already have.",
    options: Object.keys(DOMAIN_SPELLS).map(domainOption),
  },
  {
    key: GRANT_CHOICE_KEYS.oracleDomainFluency,
    prompt: "Domain Fluency: choose an advanced domain spell tied to your mystery.",
    chooseLabel: "advanced domain",
    count: 1,
    minLevel: 12,
    source: { kind: "feat", featId: "feat:ENoRkTXtdfsbs98S" },
    domainScope: "mysteryAdvanced",
    emptyHint: "Choose an initial mystery domain spell first.",
    options: Object.keys(DOMAIN_ADVANCED_SPELLS).map(advancedDomainOption),
  },
  {
    key: GRANT_CHOICE_KEYS.oracleAdvancedRevelation,
    prompt: "Advanced Revelation: choose your advanced revelation spell.",
    chooseLabel: "advanced revelation",
    count: 1,
    minLevel: 6,
    source: { kind: "feat", featId: "feat:FPVe3o7YctBicSQa" },
    emptyHint: "Choose a mystery on the Class step first.",
    options: ADVANCED_REVELATION_OPTIONS,
  },
  {
    key: GRANT_CHOICE_KEYS.oracleGreaterRevelation,
    prompt: "Greater Revelation: choose your greater revelation spell.",
    chooseLabel: "greater revelation",
    count: 1,
    minLevel: 12,
    source: { kind: "feat", featId: "feat:HSW3N9pfHhM7upRB" },
    emptyHint: "Choose a mystery on the Class step first.",
    options: GREATER_REVELATION_OPTIONS,
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
  const selectedFeatIds = [
    ...Object.values(draft.feats.ancestry),
    ...Object.values(draft.feats.class),
    ...Object.values(draft.feats.skill),
    ...Object.values(draft.feats.general),
    ...draft.feats.extras,
    ...Object.values(draft.featChoices).flat(),
    ...(draft.backgroundFeat ? [draft.backgroundFeat] : []),
    ...extraFeatIds,
  ];
  const activeFeatIds = new Set(selectedFeatIds);
  const featCount = (id: string) => selectedFeatIds.filter((selected) => selected === id).length;
  const mysteryGroup = classData.choiceGroups.find((group) => group.tag === "oracle-mystery");
  const mysteryPick = mysteryGroup ? (draft.classChoices[mysteryGroup.key] ?? [])[0] : undefined;
  const mysteryName = mysteryGroup?.options.find((option) => option.id === mysteryPick)?.name;
  const mysteryDomains = new Set(
    (ORACLE_MYSTERY_DOMAINS[mysteryName?.toLowerCase() ?? ""] ?? []).map(canonicalDomainKey)
  );
  const sourceActive = (source: GrantChoiceSource) => {
    if (source.kind === "feat") return activeFeatIds.has(source.featId);
    if (source.kind === "class-option") return selectedOptionIds.has(source.optionId);
    return selectedTags.has(source.tag);
  };
  const optionAllowed = (option: GrantChoiceOption, group: GrantChoiceGroup) => {
    if (option.requiresClassOption) return selectedOptionIds.has(option.requiresClassOption);
    if (option.domain) {
      if (group.domainScope?.startsWith("mystery")) return true;
      if (group.domainScope === "domainSpirit" || group.domainScope === "domainSpiritAdvanced")
        return true;
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
  const initialDomains = new Set(
    (draft.grantChoices[GRANT_CHOICE_KEYS.clericDomain] ?? [])
      .filter((id) => id.startsWith("domain:"))
      .map((id) => canonicalDomainKey(id.slice("domain:".length)))
  );
  const expandedInitialDomains = new Set(
    (draft.grantChoices[GRANT_CHOICE_KEYS.clericExpandedDomain] ?? [])
      .filter((id) => id.startsWith("domain:"))
      .map((id) => canonicalDomainKey(id.slice("domain:".length)))
  );
  const preExistingDomains = new Set([...initialDomains, ...expandedInitialDomains]);
  const initializedDomains = new Set([
    ...preExistingDomains,
    ...(draft.grantChoices[GRANT_CHOICE_KEYS.oracleDomainAcumen] ?? [])
      .filter((id) => id.startsWith("domain:"))
      .map((id) => canonicalDomainKey(id.slice("domain:".length))),
  ]);
  const alternateDomains = new Set((deity?.alternateDomains ?? []).map(canonicalDomainKey));
  const domainSpiritDomains = new Set(
    (draft.grantChoices[GRANT_CHOICE_KEYS.domainSpirit] ?? [])
      .filter((id) => id.startsWith("domain:"))
      .map((id) => canonicalDomainKey(id.slice("domain:".length)))
  );

  return GRANT_CHOICE_GROUPS.flatMap((group) => {
    if (group.minLevel > draft.level || !sourceActive(group.source)) return [];
    let options = group.options.filter((option) => optionAllowed(option, group));
    if (group.domainScope === "alternate") {
      options = options.filter(
        (option) =>
          option.domain &&
          alternateDomains.has(canonicalDomainKey(option.domain)) &&
          !initialDomains.has(canonicalDomainKey(option.domain))
      );
    }
    if (group.domainScope === "advanced") {
      options = options.filter(
        (option) => option.domain && initializedDomains.has(canonicalDomainKey(option.domain))
      );
    }
    if (group.domainScope === "mysteryInitial") {
      options = options.filter(
        (option) =>
          option.domain &&
          mysteryDomains.has(canonicalDomainKey(option.domain)) &&
          !preExistingDomains.has(canonicalDomainKey(option.domain))
      );
    }
    if (group.domainScope === "mysteryAdvanced") {
      options = options.filter(
        (option) =>
          option.domain &&
          mysteryDomains.has(canonicalDomainKey(option.domain)) &&
          initializedDomains.has(canonicalDomainKey(option.domain))
      );
    }
    if (group.domainScope === "domainSpiritAdvanced") {
      options = options.filter(
        (option) => option.domain && domainSpiritDomains.has(canonicalDomainKey(option.domain))
      );
    }
    if (!options.length && !group.emptyHint) return [];
    const count = group.countFromFeat
      ? Math.max(group.count, featCount(group.countFromFeat))
      : group.count;
    return [{ ...group, count, options }];
  });
}
