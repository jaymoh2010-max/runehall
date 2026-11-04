#!/usr/bin/env node
/**
 * Verify the generated PF2e compendium and the local SQLite database.
 *
 * Structural problems (bad JSON, count mismatches, duplicate IDs, broken
 * cross-references, unresolved Foundry macros) exit with code 1. Content gaps
 * that are safe to render as fallbacks (for example a few variant items with no
 * separate rules text) are reported as warnings.
 */
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const root = process.cwd();
const compendiumDir = process.env.COMPENDIUM_DIR
  ? path.resolve(process.env.COMPENDIUM_DIR)
  : path.resolve(root, "data", "compendium");
const databasePath = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : path.resolve(root, "data", "runehall.db");

const files = [
  { key: "ancestries", prefix: "anc", label: "Ancestries" },
  { key: "heritages", prefix: "her", label: "Heritages" },
  { key: "backgrounds", prefix: "bg", label: "Backgrounds" },
  { key: "classes", prefix: "cls", label: "Classes" },
  { key: "classFeatures", prefix: "cf", label: "Class features" },
  { key: "feats", prefix: "feat", label: "Feats" },
  { key: "spells", prefix: "spell", label: "Spells" },
  { key: "equipment", prefix: "item", label: "Items" },
  { key: "deities", prefix: "deity", label: "Deities" },
  { key: "conditions", prefix: "cond", label: "Conditions" },
  { key: "actions", prefix: "act", label: "Actions" },
  { key: "monsters", prefix: "mon", label: "Creatures" },
];

const errors = [];
const warnings = [];
const data = {};

const fail = (message) => errors.push(message);
const warn = (message) => warnings.push(message);

function readJson(file) {
  const full = path.join(compendiumDir, file);
  if (!fs.existsSync(full)) {
    fail(`${file} is missing from ${compendiumDir}`);
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(full, "utf8"));
  } catch (error) {
    fail(`${file} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

const manifest = readJson("manifest.json");
if (manifest) {
  if (!manifest.source || !manifest.source.includes("foundryvtt/pf2e")) {
    fail("manifest.json does not identify the Foundry PF2e source");
  }
  if (!manifest.sourceCommit || !/^[a-f0-9]{7,40}$/i.test(manifest.sourceCommit)) {
    fail("manifest.json is missing a valid sourceCommit");
  }
  if (!manifest.count || typeof manifest.count !== "object") {
    fail("manifest.json is missing its count object");
  }
}

for (const file of files) {
  const items = readJson(`${file.key}.json`);
  if (!Array.isArray(items)) {
    fail(`${file.key}.json must contain an array`);
    data[file.key] = [];
    continue;
  }
  data[file.key] = items;
  if (manifest?.count?.[file.key] !== items.length) {
    fail(
      `${file.key} count ${items.length} does not match manifest count ${manifest?.count?.[file.key] ?? "missing"}`,
    );
  }
  const ids = new Set();
  for (const item of items) {
    if (!item || typeof item !== "object") {
      fail(`${file.key} contains a non-object entry`);
      continue;
    }
    if (typeof item.id !== "string" || !item.id.startsWith(`${file.prefix}:`)) {
      fail(`${file.key}: ${item.name ?? "(unnamed)"} has an unexpected id: ${item.id}`);
    }
    if (ids.has(item.id)) fail(`${file.key}: duplicate id ${item.id}`);
    ids.add(item.id);
    if (typeof item.name !== "string" || !item.name.trim()) {
      fail(`${file.key}: ${item.id} has no name`);
    }
  }
}

const allIds = new Set();
for (const file of files) {
  for (const item of data[file.key] ?? []) {
    if (allIds.has(item.id)) fail(`duplicate id across compendium: ${item.id}`);
    allIds.add(item.id);
  }
}

function requireFields(key, fields) {
  for (const item of data[key] ?? []) {
    for (const field of fields) {
      if (!(field in item)) {
        fail(`${key}: ${item.name ?? item.id} is missing "${field}"`);
      }
    }
  }
}

requireFields("ancestries", ["name", "hp", "speed", "vision", "boosts", "flaws", "languages", "features", "description", "source"]);
requireFields("heritages", ["name", "ancestry", "versatile", "description", "source"]);
requireFields("backgrounds", ["name", "boosts", "trainedSkills", "skillChoices", "lore", "loreChoices", "featChoices", "grantedFeats", "description", "source"]);
requireFields("classes", ["name", "hp", "keyAbility", "savingThrows", "trainedSkills", "features", "choiceGroups", "description", "source"]);
requireFields("classFeatures", ["name", "level", "description"]);
requireFields("feats", ["name", "category", "level", "prerequisites", "description", "source"]);
requireFields("spells", ["name", "rank", "traditions", "actionType", "actions", "range", "area", "targets", "duration", "defense", "damage", "heightening", "description", "source"]);
requireFields("equipment", ["name", "type", "level", "price", "bulk", "usage", "description", "source"]);
requireFields("deities", ["name", "category", "domains", "alternateDomains", "font", "skill", "weapons", "description", "source"]);
requireFields("conditions", ["name", "description", "source"]);
requireFields("actions", ["name", "category", "description", "source"]);
requireFields("monsters", ["name", "level", "hp", "ac", "fortitude", "reflex", "will", "perception", "speeds", "skills", "attacks", "abilities", "description", "source"]);

// --- Cross references ------------------------------------------------------
const ancestryNames = new Set((data.ancestries ?? []).map((item) => item.name.toLowerCase()));
for (const heritage of data.heritages ?? []) {
  if (!heritage.versatile && !ancestryNames.has(String(heritage.ancestry).toLowerCase())) {
    fail(`heritage ${heritage.name}: ancestry "${heritage.ancestry}" does not exist`);
  }
}

const featIds = new Set((data.feats ?? []).map((item) => item.id));
for (const background of data.backgrounds ?? []) {
  for (const feat of background.grantedFeats ?? []) {
    if (feat.id && !featIds.has(feat.id)) fail(`background ${background.name}: granted feat ${feat.name} is missing`);
  }
  for (const choice of background.featChoices ?? []) {
    for (const feat of choice.options ?? []) {
      if (feat.id && !featIds.has(feat.id)) fail(`background ${background.name}: feat choice ${feat.name} is missing`);
    }
  }
}

const classFeatureIds = new Set((data.classFeatures ?? []).map((item) => item.id));
for (const cls of data.classes ?? []) {
  for (const feature of cls.features ?? []) {
    if (feature.id && !classFeatureIds.has(feature.id)) {
      fail(`class ${cls.name}: feature ${feature.name} is missing from classFeatures.json`);
    }
    for (const group of feature.choiceGroups ?? []) {
      for (const option of group.options ?? []) {
        if (option.id && !classFeatureIds.has(option.id)) {
          fail(`class ${cls.name}/${group.prompt}: option ${option.name} is missing from classFeatures.json`);
        }
      }
    }
  }
}

const skillIds = new Set([
  "acrobatics", "arcana", "athletics", "crafting", "deception", "diplomacy",
  "intimidation", "medicine", "nature", "occultism", "performance", "religion",
  "society", "stealth", "survival", "thievery",
]);
for (const background of data.backgrounds ?? []) {
  for (const skill of background.trainedSkills ?? []) {
    if (!skillIds.has(skill)) fail(`background ${background.name}: unknown skill "${skill}"`);
  }
  for (const choice of background.skillChoices ?? []) {
    for (const skill of choice.options ?? []) {
      if (!skillIds.has(skill)) fail(`background ${background.name}: unknown skill choice "${skill}"`);
    }
  }
}
for (const deity of data.deities ?? []) {
  for (const skill of deity.skill ?? []) {
    if (!skillIds.has(skill)) fail(`deity ${deity.name}: unknown skill "${skill}"`);
  }
}
for (const cls of data.classes ?? []) {
  for (const skill of cls.trainedSkills?.value ?? []) {
    if (!skillIds.has(skill)) fail(`class ${cls.name}: unknown trained skill "${skill}"`);
  }
  for (const group of cls.choiceGroups ?? []) {
    for (const option of group.options ?? []) {
      for (const skill of option.trainedSkills ?? []) {
        if (!skillIds.has(skill)) fail(`class ${cls.name}/${option.name}: unknown trained skill "${skill}"`);
      }
    }
  }
}

// --- Numeric and content sanity -------------------------------------------
for (const ancestry of data.ancestries ?? []) {
  if (!Number.isFinite(ancestry.hp) || ancestry.hp <= 0) fail(`ancestry ${ancestry.name}: invalid HP`);
  if (!Number.isFinite(ancestry.speed) || ancestry.speed <= 0) fail(`ancestry ${ancestry.name}: invalid speed`);
}
for (const cls of data.classes ?? []) {
  if (!Number.isFinite(cls.hp) || cls.hp <= 0) fail(`class ${cls.name}: invalid HP`);
  if (!Array.isArray(cls.keyAbility)) fail(`class ${cls.name}: keyAbility must be an array`);
  for (const save of ["fortitude", "reflex", "will"]) {
    if (!Number.isFinite(cls.savingThrows?.[save])) fail(`class ${cls.name}: invalid ${save} save`);
  }
}
for (const feat of data.feats ?? []) {
  // Some campaign/boon feats are level 0 by design.
  if (!Number.isFinite(feat.level) || feat.level < 0 || feat.level > 20) {
    fail(`feat ${feat.name}: invalid level ${feat.level}`);
  }
}
for (const spell of data.spells ?? []) {
  if (!Number.isFinite(spell.rank) || spell.rank < 0 || spell.rank > 10) {
    fail(`spell ${spell.name}: invalid rank ${spell.rank}`);
  }
  for (const tradition of spell.traditions ?? []) {
    if (!["arcane", "divine", "occult", "primal"].includes(tradition)) {
      fail(`spell ${spell.name}: unknown tradition "${tradition}"`);
    }
  }
  for (const part of spell.damage ?? []) {
    if (!part.formula || /@|\[\[/.test(part.formula)) fail(`spell ${spell.name}: unresolved damage formula ${part.formula}`);
    if (!part.type) fail(`spell ${spell.name}: damage part has no type`);
  }
}
for (const item of data.equipment ?? []) {
  if (!Number.isFinite(item.level) || item.level < 0 || item.level > 30) fail(`item ${item.name}: invalid level ${item.level}`);
  if (!item.price || !Number.isFinite(item.price.cpTotal) || item.price.cpTotal < 0) fail(`item ${item.name}: invalid price`);
  if (!Number.isFinite(item.bulk) || item.bulk < 0) fail(`item ${item.name}: invalid bulk`);
}
for (const monster of data.monsters ?? []) {
  if (!Number.isFinite(monster.level) || monster.level < -1 || monster.level > 30) fail(`creature ${monster.name}: invalid level ${monster.level}`);
  if (!Number.isFinite(monster.hp) || monster.hp <= 0) fail(`creature ${monster.name}: invalid HP`);
  if (!Number.isFinite(monster.ac) || monster.ac <= 0) fail(`creature ${monster.name}: invalid AC`);
  for (const save of ["fortitude", "reflex", "will", "perception"]) {
    if (!Number.isFinite(monster[save])) fail(`creature ${monster.name}: invalid ${save}`);
  }
  if (!Number.isFinite(monster.speeds?.base) || monster.speeds.base < 0) fail(`creature ${monster.name}: invalid base speed`);
  for (const attack of monster.attacks ?? []) {
    if (!Number.isFinite(attack.bonus)) fail(`creature ${monster.name}/${attack.name}: invalid attack bonus`);
  }
}
const attacksWithoutDamage = (data.monsters ?? []).flatMap((monster) =>
  (monster.attacks ?? [])
    .filter((attack) => !attack.damage?.trim())
    .map((attack) => `${monster.name}/${attack.name}`),
);
if (attacksWithoutDamage.length) {
  warn(`${attacksWithoutDamage.length} creature attacks have no damage (normal for web, tongue, and similar control attacks): ${attacksWithoutDamage.slice(0, 8).join(", ")}${attacksWithoutDamage.length > 8 ? ", …" : ""}`);
}

// Content gaps are warnings: variants and class-locked spells can legitimately
// rely on a base entry or a class feature for their full text.
const missingDescriptions = [
  ["classFeatures", "classFeatures"],
  ["feats", "feats"],
  ["spells", "spells"],
  ["equipment", "equipment"],
  ["deities", "deities"],
  ["actions", "actions"],
  ["monsters", "monsters"],
];
for (const [key, label] of missingDescriptions) {
  const missing = (data[key] ?? []).filter((item) => !String(item.description || item.blurb || "").trim());
  if (missing.length) {
    warn(`${missing.length} ${label} have no separate description (fallback text will be shown): ${missing.slice(0, 8).map((item) => item.name).join(", ")}${missing.length > 8 ? ", …" : ""}`);
  }
}
const noTraditions = (data.spells ?? []).filter((spell) => !(spell.traditions ?? []).length);
if (noTraditions.length) {
  const focus = noTraditions.filter((spell) => (spell.traits ?? []).includes("focus")).length;
  const rituals = noTraditions.filter((spell) => spell.ritual).length;
  const classOnly = noTraditions.length - focus - rituals;
  warn(
    `${noTraditions.length} spells have no tradition: ${focus} focus, ${rituals} ritual, and ${classOnly} class-locked/spellshape entries. These are expected to be excluded from ordinary tradition-filtered pickers.`,
  );
}

const unresolvedMacro = /@UUID|\[\[\/|@Damage|@Check|@Localize|@Compendium/;
for (const file of files) {
  for (const item of data[file.key] ?? []) {
    if (unresolvedMacro.test(JSON.stringify(item))) {
      fail(`${file.key} ${item.name}: unresolved Foundry inline macro`);
    }
  }
}

// --- SQLite database -------------------------------------------------------
let databaseSummary = "not present (created on first run)";
if (fs.existsSync(databasePath)) {
  let db;
  try {
    db = new DatabaseSync(databasePath, { readOnly: true });
    const integrity = db.prepare("PRAGMA integrity_check").all();
    const integrityValues = integrity.map((row) => Object.values(row)[0]);
    if (!integrityValues.every((value) => value === "ok")) {
      fail(`SQLite integrity check failed: ${integrityValues.join(", ")}`);
    }
    const foreignKeyIssues = db.prepare("PRAGMA foreign_key_check").all();
    if (foreignKeyIssues.length) {
      fail(`SQLite foreign key check found ${foreignKeyIssues.length} issue(s)`);
    }
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((row) => String(Object.values(row)[0]));
    const migrationRows = tables.includes("schema_migrations")
      ? db.prepare("SELECT version FROM schema_migrations ORDER BY version").all()
      : [];
    const versions = migrationRows.map((row) => Number(Object.values(row)[0]));
    if (new Set(versions).size !== versions.length) {
      fail("SQLite schema_migrations contains duplicate versions");
    }
    const counts = {};
    for (const table of ["users", "campaigns", "characters", "scenes", "tokens", "messages", "journal_entries"]) {
      if (!tables.includes(table)) continue;
      counts[table] = Number(Object.values(db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get())[0]);
    }
    databaseSummary = `integrity ok · ${tables.length} tables · migrations ${versions.join(", ") || "none"} · ${Object.entries(counts).map(([table, count]) => `${table} ${count}`).join(", ")}`;
  } catch (error) {
    fail(`SQLite check failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    try {
      db?.close();
    } catch {
      // ignore close failures
    }
  }
}

// --- Report ----------------------------------------------------------------
console.log("Runehall compendium verification");
console.log(`Source: ${path.relative(root, compendiumDir)}`);
for (const file of files) {
  const count = data[file.key]?.length ?? 0;
  console.log(`  ${file.label.padEnd(14)} ${String(count).padStart(6)}`);
}
console.log(`Database: ${databaseSummary}`);
console.log("");

if (warnings.length) {
  console.log(`Warnings (${warnings.length})`);
  for (const warning of warnings) console.log(`  ! ${warning}`);
  console.log("");
}

if (errors.length) {
  console.error(`Errors (${errors.length})`);
  for (const error of errors) console.error(`  x ${error}`);
  process.exitCode = 1;
} else {
  console.log("Structure, references, counts, and database integrity all pass.");
}
