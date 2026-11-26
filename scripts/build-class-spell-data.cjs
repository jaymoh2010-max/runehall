const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..");
const base = path.join(root, "data", "compendium");
const classes = require(path.join(base, "classes.json"));
const features = require(path.join(base, "classFeatures.json"));
const spells = require(path.join(base, "spells.json"));

const plain = (html) =>
  String(html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\u2019/g, "'")
    .replace(/\s+/g, " ")
    .trim();

const byName = new Map();
for (const spell of spells) {
  const key = spell.name.toLowerCase().replace(/\u2019/g, "'");
  if (!byName.has(key)) byName.set(key, []);
  byName.get(key).push(spell);
}

function ranksIn(text) {
  const out = [];
  const re = /\b(cantrips?|1st|2nd|3rd|4th|5th|6th|7th|8th|9th)\s*:?\s*/gi;
  const matches = [...text.matchAll(re)];
  for (let i = 0; i < matches.length; i += 1) {
    const match = matches[i];
    const label = match[1].toLowerCase();
    const rank = label.startsWith("cantrip") ? 0 : Number(label[0]);
    const start = match.index + match[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    out.push({ rank, text: text.slice(start, end) });
  }
  return out;
}

function splitNames(text) {
  return text
    .split(/[,;]/)
    .map((name) =>
      name
        .replace(/\([^)]*\)/g, "")
        .replace(/\*/g, "")
        .replace(/^[—–\-\s]+|[.—–\-\s]+$/g, "")
        .trim()
    )
    .filter(
      (name) =>
        name &&
        !/^(see|variable|choose|your|the|granting|once|level|there|taught|can be|in addition)\b/i.test(
          name
        )
    );
}

function resolve(name, rank) {
  const key = name.toLowerCase().replace(/\u2019/g, "'");
  const list = byName.get(key) ?? [];
  if (!list.length) return { error: "missing", name };
  if (list.length === 1) return { spell: list[0] };
  const exact = list.find((spell) => spell.rank === rank) ?? list[0];
  return { spell: exact };
}

const issues = [];

function parseRanked(text, source) {
  const cleaned = text
    .replace(
      /\s*(?:Blood Magic Damage|Blood Magic|Draconic Sorcerer Bloodlines|Related Domains|School Spells)\b[\s\S]*$/i,
      ""
    )
    .trim();
  const out = [];
  for (const chunk of ranksIn(cleaned)) {
    for (const name of splitNames(chunk.text)) {
      const found = resolve(name, chunk.rank);
      if (found.error) {
        issues.push(`${source}: rank ${chunk.rank} missing spell "${name}"`);
        continue;
      }
      out.push({ id: found.spell.id, name: found.spell.name, rank: chunk.rank });
    }
  }
  return out;
}

function parseNamedFocus(text, source) {
  const readLabel = (label) => {
    const match = text.match(
      new RegExp(`${label}\\s*:?\\s*([^;,]+?)(?=\\s+(?:advanced|greater)\\s*:|[;,]|$)`, "i")
    );
    if (!match) return undefined;
    const name = match[1].trim();
    const found = resolve(name, 1);
    if (found.error) {
      issues.push(`${source}: focus missing spell "${name}"`);
      return undefined;
    }
    return { id: found.spell.id, name: found.spell.name };
  };
  const initial = readLabel("initial");
  if (!initial) return null;
  return {
    initial,
    advanced: readLabel("advanced"),
    greater: readLabel("greater"),
  };
}

// ---------------------------------------------------------------- Sorcerer
const sorcerer = classes.find((c) => c.name === "Sorcerer");
const bloodGroup = sorcerer.choiceGroups.find((g) => /bloodline/i.test(g.key));
const bloodlineSpells = {};
const bloodlineFocus = {};

for (const option of bloodGroup.options) {
  const bloodlineName = option.name.replace(/^Bloodline: /, "");
  const feature = features.find((f) => f.id === option.id);
  const text = plain(feature.description);
  const giftsText =
    text.match(
      /(?:Sorcerous Gifts|Granted Spells)\s+([\s\S]*?)(?:Bloodline Spells|Blood Magic)/i
    )?.[1] ?? "";
  const bloodText = text.match(/Bloodline Spells\s+([\s\S]*?)(?:Blood Magic|$)/i)?.[1] ?? "";
  bloodlineSpells[option.id] = parseRanked(giftsText, `Sorcerer ${bloodlineName}`);
  const focus = parseNamedFocus(bloodText, `Sorcerer ${bloodlineName}`) ?? {
    initial: { id: "", name: "" },
  };
  bloodlineFocus[option.id] = { name: bloodlineName, ...focus };
}

const sorcererElement = {};
{
  const text = plain(features.find((f) => f.id === "cf:RXRnJcG4XSabZ35a").description);
  const section = text.match(/Elemental Influences\s+([\s\S]*?)$/i)?.[1] ?? "";
  const re =
    /(Air|Earth|Fire|Metal|Water|Wood)[—–-]\s*Sorcerous Gifts\s+([\s\S]*?)(?=(?:Air|Earth|Fire|Metal|Water|Wood)[—–-]\s*Sorcerous Gifts|$)/gi;
  for (const match of section.matchAll(re)) {
    sorcererElement[match[1].toLowerCase()] = parseRanked(
      match[2],
      `Sorcerer Elemental ${match[1]}`
    );
  }
}

const sorcererGenie = {};
{
  const fullText = plain(features.find((f) => f.id === "cf:tYOMBiH3HbViNWwn").description);
  const text = fullText.match(/Genie Type\s+([\s\S]*?)$/i)?.[1] ?? fullText;
  const tableStart = text.search(/\bJanni\s+2nd:/i);
  const table = tableStart >= 0 ? text.slice(tableStart) : text;
  const re =
    /(Janni|Jaathoom|Ifrit|Faydhaan|Jabali)\s+([\s\S]*?)(?=(?:Janni|Jaathoom|Ifrit|Faydhaan|Jabali)\s+|$)/gi;
  for (const match of table.matchAll(re)) {
    sorcererGenie[match[1].toLowerCase()] = parseRanked(match[2], `Sorcerer Genie ${match[1]}`);
  }
}

const sorcererDraconic = {};
{
  const text = plain(features.find((f) => f.id === "cf:ZHabYxSgYK0XbjhM").description);
  const section = text.match(/Draconic Exemplars\s+([\s\S]*?)$/i)?.[1] ?? "";
  const re =
    /(Arcane|Divine|Occult|Primal)[—–-]\s*Tradition\s+(?:arcane|divine|occult|primal);[^;]*;\s*Sorcerous Gifts\s+([\s\S]*?)(?=(?:Arcane|Divine|Occult|Primal)[—–-]\s*Tradition|$)/gi;
  for (const match of section.matchAll(re)) {
    sorcererDraconic[match[1].toLowerCase()] = parseRanked(
      match[2],
      `Sorcerer Draconic ${match[1]}`
    );
  }
}

// ------------------------------------------------------------------ Oracle
const oracle = classes.find((c) => c.name === "Oracle");
const mysteryGroup = oracle.choiceGroups.find((g) => g.tag === "oracle-mystery");
const oracleSpells = {};
const oracleRevelations = {};
for (const option of mysteryGroup.options) {
  const feature = features.find((f) => f.id === option.id);
  const text = plain(feature.description);
  const grantedText =
    text.match(/Granted Spells\s+([\s\S]*?)(?:Revelation Spells|Related Domains)/i)?.[1] ?? "";
  const revText = text.match(/Revelation Spells\s+([\s\S]*?)(?:Related Domains|$)/i)?.[1] ?? "";
  oracleSpells[option.id] = parseRanked(grantedText, `Oracle ${option.name}`);
  oracleRevelations[option.id] = {
    name: option.name,
    ...(parseNamedFocus(revText, `Oracle ${option.name}`) ?? {}),
  };
}

// ------------------------------------------------------------------ Wizard
const wizard = classes.find((c) => c.name === "Wizard");
const schoolGroup = wizard.choiceGroups.find((g) => g.tag === "wizard-arcane-school");
const wizardCurriculum = {};

function curriculumFrom(text) {
  const match = text.match(/Curriculum\s+((?:cantrips?|1st)\s*:?\s*[\s\S]*?)(?:School Spells|$)/i);
  return match ? match[1] : "";
}

for (const option of schoolGroup.options) {
  if (option.name === "School of Unified Magical Theory") continue;
  const feature = features.find((f) => f.id === option.id);
  const text = plain(feature.description);
  if (option.name === "Runelord") {
    const base =
      text.match(
        /Curriculum\s+(cantrips?\s*:?\s*[\s\S]*?)(?:Advanced School Spell|Envy\s|$)/i
      )?.[1] ?? "";
    const runelordBase = parseRanked(base, "Runelord base");
    wizardCurriculum[option.id] = runelordBase;
    continue;
  }
  wizardCurriculum[option.id] = parseRanked(curriculumFrom(text), `Wizard ${option.name}`);
}

const wizardBranches = {};
for (const id of [
  "cf:4fmks2barqWlLtik",
  "cf:JhczMKRuy53BxqBi",
  "cf:Oa0ENh8Zh7BftViG",
  "cf:bYooavyooaCqdhYJ",
  "cf:ivtpFSNKYZGvApBe",
]) {
  const feature = features.find((f) => f.id === id);
  const text = plain(feature.description);
  const extra = text.match(/Additional Curriculum\s+([\s\S]*?)$/i)?.[1] ?? "";
  wizardBranches[id] = parseRanked(extra, `Wizard branch ${feature.name}`);
}

const runelordSins = {};
for (const sin of ["envy", "gluttony", "greed", "lust", "pride", "sloth", "wrath"]) {
  const feature = features.find((f) => f.name.toLowerCase() === sin);
  const text = plain(feature.description);
  const sinText = text.match(/Sin Spells\s+([\s\S]*?)(?:Initial School Spell|$)/i)?.[1] ?? "";
  runelordSins[sin] = parseRanked(sinText, `Runelord ${sin}`);
}

// ------------------------------------------------------------------ output
const source = `// Generated from the class-feature descriptions in data/compendium by
// scripts/build-class-spell-data.cjs. Re-run that script after compendium updates.
// Every id was resolved against data/compendium/spells.json; entries the data
// cannot resolve are recorded in the review document instead of guessed.

export interface ClassSpellData {
  id: string;
  name: string;
  rank: number;
}

export interface ClassFocusSpell {
  id: string;
  name: string;
}

export interface ClassFocusData {
  name: string;
  initial: ClassFocusSpell;
  advanced?: ClassFocusSpell;
  greater?: ClassFocusSpell;
}

export const SORCERER_BLOODLINE_SPELLS: Record<string, ClassSpellData[]> = ${JSON.stringify(
  bloodlineSpells,
  null,
  2
)};

export const SORCERER_BLOODLINE_FOCUS: Record<string, ClassFocusData> = ${JSON.stringify(
  bloodlineFocus,
  null,
  2
)};

export const SORCERER_ELEMENT_GIFTS: Record<string, ClassSpellData[]> = ${JSON.stringify(
  sorcererElement,
  null,
  2
)};

export const SORCERER_GENIE_GIFTS: Record<string, ClassSpellData[]> = ${JSON.stringify(
  sorcererGenie,
  null,
  2
)};

export const SORCERER_DRACONIC_GIFTS: Record<string, ClassSpellData[]> = ${JSON.stringify(
  sorcererDraconic,
  null,
  2
)};

export const ORACLE_MYSTERY_SPELLS: Record<string, ClassSpellData[]> = ${JSON.stringify(
  oracleSpells,
  null,
  2
)};

export const ORACLE_REVELATIONS: Record<string, ClassFocusData> = ${JSON.stringify(
  oracleRevelations,
  null,
  2
)};

export const WIZARD_CURRICULUM_SPELLS: Record<string, ClassSpellData[]> = ${JSON.stringify(
  wizardCurriculum,
  null,
  2
)};

export const WIZARD_BRANCH_SPELLS: Record<string, ClassSpellData[]> = ${JSON.stringify(
  wizardBranches,
  null,
  2
)};

export const RUNELORD_SIN_SPELLS: Record<string, ClassSpellData[]> = ${JSON.stringify(
  runelordSins,
  null,
  2
)};
`;

fs.writeFileSync(path.join(root, "src", "shared", "classSpellData.ts"), source);

console.log("Wrote classSpellData.ts");
console.log("Sorcerer bloodlines:", Object.keys(bloodlineSpells).length);
console.log("Oracle mysteries:", Object.keys(oracleSpells).length);
console.log("Wizard curricula:", Object.keys(wizardCurriculum).length);
console.log("Wizard branches:", Object.keys(wizardBranches).length);
console.log("Runelord sins:", Object.keys(runelordSins).length);
console.log("\nISSUES:");
for (const issue of issues) console.log("- " + issue);
