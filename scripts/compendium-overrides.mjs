import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OVERRIDE_DIR = path.dirname(fileURLToPath(import.meta.url));
const generatedMonsterOverrides = JSON.parse(
  fs.readFileSync(path.join(OVERRIDE_DIR, "monster-overrides.json"), "utf8")
);

/**
 * Curated corrections for PF2e compendium entries where the upstream Foundry
 * data disagrees with the published rules. Keep this file small and cite the
 * source of each correction in the accompanying audit document.
 *
 * These overrides are applied both by the ingest pipeline and by
 * `scripts/apply-compendium-overrides.mjs`, so regenerating the compendium does
 * not silently reintroduce a corrected value.
 */

export const ALL_ABILITIES = ["str", "dex", "con", "int", "wis", "cha"];

/** Spells confirmed against Archives of Nethys entry pages. */
export const SPELL_OVERRIDES = {
  "Gloom Mantle": { actionType: "1", actions: "1" },
  "Metal Merged": { actionType: "1", actions: "1" },
  "Wish Market": { actionType: "1", actions: "1" },
  "Far-Flung Fetch": { actionType: "1", actions: "1" },
  "Timely Reminder": { actionType: "3", actions: "3" },
  "Cup of Dust": { actionType: "2", actions: "2" },
  "Warning Stripes": { actionType: "1", actions: "1" },
  "Channel Arrogance": { actionType: "1 or 3", actions: "1 or 3" },
  "Ember Doppelgänger": { actionType: "3", actions: "3" },
  "Howling Blizzard": { actionType: "2 or 3", actions: "2 or 3" },
  "Sawtooth Terrain": { actionType: "3", actions: "3" },
  "Spiritual Torrent": { actionType: "2 or 3", actions: "2 or 3" },
  "Patron's Protector": { actionType: "3", actions: "3" },
  Theogeny: { actionType: "3", actions: "3" },
  "Summon Oliphaunt of Jandelay": { actionType: "3", actions: "3" },
  "Glimpse the Netherworld": { actionType: "reaction", actions: "reaction" },
  "The Night is Mine": { actionType: "reaction or 1", actions: "reaction or 1" },
  "Pin the Spears in the Lamb": { rank: 2 },
  "Tenebrous Freedom": { rank: 4 },
  "Theatrical Throwdown": { rank: 5 },
  "Adapt Self": { rarity: "uncommon" },
  "Guiding Star": { traditions: ["divine", "occult", "primal"] },
  "Unending Tears": { traditions: ["arcane", "occult"] },
  "Incarnate Draconic Legion": { traditions: ["arcane", "divine", "occult", "primal"] },
  "Thief of Fortune": { range: "30 feet" },
  "Flame Barrier": { range: "60 feet" },
};

/** Deities whose Foundry attributes, domains, fonts, skills, or sanctification drifted. */
export const DEITY_OVERRIDES = {
  Alocer: {
    domains: ["nature", "pain", "zeal"],
    sanctification: {},
  },
  Angazhan: { sanctification: {} },
  Bharnarol: { sanctification: { modal: "can", what: ["holy"] } },
  Charg: { sanctification: { modal: "can", what: ["unholy"] } },
  Chavazvug: { sanctification: { modal: "can", what: ["unholy"] } },
  Cixyron: {
    font: ["harm"],
    sanctification: { modal: "must", what: ["unholy"] },
  },
  Cormion: { font: ["harm", "heal"] },
  Daikitsu: { alternateDomains: ["earth"] },
  Dajermube: { alternateDomains: ["cities", "introspection", "star", "zeal"] },
  Diomazul: {
    font: ["harm", "heal"],
    sanctification: { modal: "can", what: ["unholy"] },
  },
  Droskar: {
    alternateDomains: ["ambition", "fire", "metal", "toil"],
    sanctification: { modal: "can", what: ["unholy"] },
  },
  Elion: { domains: ["cities", "family", "nature", "travel"] },
  "Essence Dancers": { sanctification: {} },
  Husk: { sanctification: { modal: "must", what: ["unholy"] } },
  "Hei Feng": {
    sanctification: { modal: "can", what: ["unholy", "holy"] },
    sanctificationNote: "Can choose holy only if you are a tengu.",
  },
  "Immaculate Growth": { sanctification: { modal: "can", what: ["holy"] } },
  Imot: { font: ["harm"] },
  Ketephys: { font: ["heal"] },
  Kitumu: { sanctification: { modal: "can", what: ["unholy"] } },
  "Lao Shu Po": { alternateDomains: ["secrecy", "wealth"] },
  Laudinmio: {
    alternateDomains: ["wealth"],
    attribute: ["str", "cha"],
    domains: ["change", "creation", "metal", "sorrow"],
  },
  Lissala: {
    alternateDomains: ["glyph"],
    attribute: ["int", "cha"],
    domains: ["ambition", "duty", "fate", "knowledge"],
    font: ["harm", "heal"],
    sanctification: { modal: "can", what: ["holy", "unholy"] },
  },
  Lorthact: { sanctification: { modal: "can", what: ["unholy"] } },
  Mazludeh: { alternateDomains: ["duty", "nature"] },
  Myr: { sanctification: { modal: "must", what: ["holy"] } },
  Pazuzu: { sanctification: { modal: "must", what: ["unholy"] } },
  Scal: { font: ["harm"] },
  "Sorrow's Sword": { alternateDomains: ["confidence", "fire"] },
  "Srikalis, Sritaming, and Sribaril": { font: ["heal"] },
  Telvrys: { font: ["harm"] },
  Thamir: { font: ["harm"] },
  "The Circle of the Damned": { sanctification: { modal: "must", what: ["unholy"] } },
  "The Perplexing Jest": { attribute: ["con", "cha"] },
  Thremyr: {
    attribute: ["str", "con"],
    sanctification: { modal: "can", what: ["unholy"] },
    skill: ["religion"],
  },
  "Tolte Coatl": { attribute: ["con", "int"] },
  Treerazer: { font: ["harm"] },
  Umarik: {
    font: ["harm"],
    sanctification: { modal: "can", what: ["unholy"] },
  },
  Uskyeria: { font: ["harm", "heal"] },
  Vavaalrav: { font: ["heal"] },
  Ylimancha: { font: ["heal"] },
  Baphomet: { attribute: ["con", "wis"] },
  Corosbel: { attribute: ["con", "wis"] },
  Jezelda: { attribute: ["str", "int"] },
  Kabriri: { attribute: ["dex", "int"] },
  Shawnari: { attribute: ["int", "cha"] },
  Shyka: { attribute: ["con", "int"] },
  "Conqueror Worm": { alternateDomains: [] },
};

/** Class training choices the Foundry export encodes only as ChoiceSet rules. */
export const CLASS_OVERRIDES = {
  Fighter: {
    skillChoices: [
      { prompt: "Choose Acrobatics or Athletics", options: ["acrobatics", "athletics"], count: 1 },
    ],
  },
  Runesmith: {
    skillChoices: [
      {
        prompt: "Choose Arcana, Nature, Occultism, or Religion",
        options: ["arcana", "nature", "occultism", "religion"],
        count: 1,
      },
    ],
  },
};

/** Ancestry fields the Foundry export omits. */
export const ANCESTRY_OVERRIDES = {
  "Awakened Animal": {
    hpBySize: { tiny: 6, sm: 6, med: 8, lg: 10 },
    sizeChoices: ["tiny", "sm", "med", "lg"],
    speed: 0,
    speedNote: "Determined by heritage",
  },
  Kashrishi: { languages: ["common", "kashrishi"] },
  Dragonet: { traits: ["dragon", "dragonet"] },
  Fleshwarp: { traits: ["aberration", "fleshwarp", "humanoid"] },
  Poppet: { traits: ["construct", "humanoid", "poppet"] },
};

/** Heritage speed data that the Foundry export leaves only in prose. */
export const HERITAGE_OVERRIDES = {
  "Climbing Animal": { speeds: { base: 20, other: [{ type: "climb", value: 20 }] } },
  "Flying Animal": { speeds: { base: 20, other: [] } },
  "Running Animal": { speeds: { base: 30, other: [] } },
  "Swimming Animal": { speeds: { base: 20, other: [{ type: "swim", value: 20 }] } },
};

/** Background choices that exist only in the published prose. */
/** Background choices that exist only in the published prose. */
export function addProseLoreChoices(backgrounds) {
  for (const background of backgrounds) {
    if ((background.lore ?? []).length || (background.loreChoices ?? []).length) continue;
    const text = String(background.description ?? "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&[a-z]+;/gi, " ")
      .replace(/\s+/g, " ");
    if (!/\blore\b/i.test(text)) continue;
    const loreSentences = text
      .split(/(?<=[.!?])\s+/)
      .filter((sentence) => /\blore\b/i.test(sentence));
    const generic = loreSentences.some((sentence) =>
      /such as|related to|of your choice|for your|associated with|\ba lore skill\b|any lore/i.test(
        sentence
      )
    );
    const names = [
      ...new Set(
        [...text.matchAll(/\b([A-Z][A-Za-z'’]+(?:\s+[A-Z][A-Za-z'’]+){0,2})\s+Lore\b/g)]
          .map((match) => match[0].replace(/\s+/g, " ").trim())
          .filter((name) => !/^(a|an|the|any|one|your|this|that|such|specific)\b/i.test(name))
      ),
    ];
    background.loreChoices =
      generic || names.length === 0
        ? [{ prompt: "Choose a Lore skill", options: [], count: 1 }]
        : [
            {
              prompt: names.length === 1 ? `Choose ${names[0]}` : `Choose ${names.join(" or ")}`,
              options: names,
              count: 1,
            },
          ];
  }
  return backgrounds;
}

export const BACKGROUND_OVERRIDES = {
  "Bachuan Revolutionary": { lore: ["Law Lore"] },
  "Bekyar Restorer": { lore: ["Abyss Lore"] },
  Noble: {
    loreChoices: [
      {
        prompt: "Choose Genealogy Lore or Heraldry Lore",
        options: ["Genealogy Lore", "Heraldry Lore"],
        count: 1,
      },
    ],
  },
  "Street Urchin": {
    loreChoices: [
      {
        prompt: "Choose a Lore skill for the city where you lived",
        options: [],
        count: 1,
      },
    ],
  },
  "Gold Falls Regular": {
    loreChoices: [
      {
        prompt: "Choose Cooking Lore or Volcano Lore",
        options: ["Cooking Lore", "Volcano Lore"],
        count: 1,
      },
    ],
  },
  "Second Chance Champion": { trainedSkills: ["athletics"] },
  "Streetfood Vendor": {
    skillChoices: [
      {
        prompt: "Choose Crafting or Society",
        options: ["crafting", "society"],
        count: 1,
      },
    ],
  },
  "Archival Assistant": {
    boosts: [
      { from: ["int", "wis"], fixed: false },
      { from: [...ALL_ABILITIES], fixed: false },
    ],
  },
  "Chitterwood Refugee": {
    boosts: [
      { from: ["con", "wis"], fixed: false },
      { from: [...ALL_ABILITIES], fixed: false },
    ],
  },
};

/** Creature entries with confirmed transcription errors in the Foundry export. */
export const MONSTER_OVERRIDES = {
  ...generatedMonsterOverrides,
  "Totum Font": { hp: 325 },
  Adlet: { level: 9 },
  Zebub: { hp: 45 },
  "Oread Guard": {
    ac: 17,
    fortitude: 7,
    hp: 20,
    perception: 7,
    reflex: 6,
    skills: { society: { base: 3 } },
    will: 5,
  },
};

/** Equipment bulk/trait values corrected against the published item pages. */
export const EQUIPMENT_OVERRIDES = {
  Switchscythe: { bulk: 2 },
  Polytool: { bulk: 0.1 },
  Donchak: { traits: ["hampering", "reach", "reload-1", "tethered", "thrown-20"] },
  "Clockwork Macuahuitl": { traits: ["backswing", "clockwork", "forceful", "versatile-b"] },
  "Rotary Bow": { weapon: { group: "bow" } },
  "Taw Launcher": { weapon: { group: "bow" } },
  "Tri-bladed Katar": { weapon: { group: "brawling" } },
};

/**
 * Foundry stores both melee and ranged NPC strikes as item type "melee"; a
 * nonzero range increment is the reliable ranged indicator.
 */
export function normalizeMonsterAttackTypes(monsters) {
  for (const monster of monsters) {
    for (const attack of monster.attacks ?? []) {
      attack.type = attack.range != null && Number(attack.range) > 0 ? "ranged" : "melee";
    }
  }
  return monsters;
}

export function applyNameOverrides(items, overrides) {
  return items.map((item) => {
    const override = overrides[item.name];
    if (!override) return item;
    const merged = { ...item, ...override };
    if (override.weapon && item.weapon) merged.weapon = { ...item.weapon, ...override.weapon };
    if (override.armor && item.armor) merged.armor = { ...item.armor, ...override.armor };
    if (override.shield && item.shield) merged.shield = { ...item.shield, ...override.shield };
    if (override.skills && item.skills) merged.skills = { ...item.skills, ...override.skills };
    return merged;
  });
}

/** Deity weapons are stored as Foundry slugs; publish normal English names. */
export function normalizeDeityWeapons(deities, equipment = []) {
  const byName = new Map(
    equipment.map((item) => [
      String(item.name)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim(),
      item.name.toLowerCase(),
    ])
  );
  for (const deity of deities) {
    deity.weapons = (deity.weapons ?? []).map((weapon) => {
      const slug = String(weapon);
      const key = slug
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
      return byName.get(key) ?? slug.replace(/-/g, " ").replace(/\s+/g, " ").trim();
    });
  }
  return deities;
}
