#!/usr/bin/env node
/**
 * Ingest the Apache-2.0 licensed Foundry VTT PF2e system data into Runehall's
 * local compendium. The source data is fetched separately with a sparse clone.
 *
 * Usage:
 *   node scripts/ingest-pf2e.mjs [--source path/to/pf2e/repo]
 *
 * Defaults to %TEMP%/pf2e-data on Windows and /tmp/pf2e-data elsewhere.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import sanitizeHtml from "sanitize-html";
import {
  ANCESTRY_OVERRIDES,
  BACKGROUND_OVERRIDES,
  CLASS_OVERRIDES,
  DEITY_OVERRIDES,
  EQUIPMENT_OVERRIDES,
  HERITAGE_OVERRIDES,
  MONSTER_OVERRIDES,
  SPELL_OVERRIDES,
  addProseLoreChoices,
  applyNameOverrides,
  normalizeDeityWeapons,
  normalizeMonsterAttackTypes,
} from "./compendium-overrides.mjs";

const args = process.argv.slice(2);
const sourceArg = args.indexOf("--source");
const REPO =
  sourceArg >= 0 ? path.resolve(args[sourceArg + 1]) : path.join(os.tmpdir(), "pf2e-data");
const PACKS = path.join(REPO, "packs", "pf2e");
const OUT = path.resolve("data", "compendium");
const LANG_DIR = path.join(REPO, "static", "lang");

if (!fs.existsSync(PACKS)) {
  console.error(`Could not find PF2e packs at ${PACKS}`);
  console.error("Clone foundryvtt/pf2e sparsely first (see docs/DATA.md).");
  process.exit(1);
}

fs.mkdirSync(OUT, { recursive: true });

// ---------------------------------------------------------------------------
// Localization
// ---------------------------------------------------------------------------
function flatten(obj, prefix = "", out = {}) {
  for (const [key, value] of Object.entries(obj)) {
    const next = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) flatten(value, next, out);
    else if (typeof value === "string") out[next] = value;
  }
  return out;
}

const LOCALE = {};
for (const file of ["en.json", "re-en.json", "action-en.json"]) {
  const filePath = path.join(LANG_DIR, file);
  if (!fs.existsSync(filePath)) continue;
  try {
    Object.assign(LOCALE, flatten(JSON.parse(fs.readFileSync(filePath, "utf8"))));
  } catch (error) {
    console.warn(`Could not read ${file}: ${error.message}`);
  }
}
// remaster overrides should win over the base file
if (fs.existsSync(path.join(LANG_DIR, "re-en.json"))) {
  try {
    Object.assign(
      LOCALE,
      flatten(JSON.parse(fs.readFileSync(path.join(LANG_DIR, "re-en.json"), "utf8")))
    );
  } catch {}
}

function localizeKey(key) {
  if (!key) return key;
  return LOCALE[key] ?? key;
}

function resolveLocalize(text) {
  if (typeof text !== "string") return "";
  let out = text.replace(/@Localize\[([^\]]+)\]/g, (_, key) => localizeKey(key));
  // Some data uses a raw localization key as the entire description.
  if (!/[<>{}\n]/.test(out) && LOCALE[out]) out = LOCALE[out];
  return out;
}

// ---------------------------------------------------------------------------
// HTML cleanup / macro expansion
// ---------------------------------------------------------------------------
function stripUuid(match, body, label) {
  if (label) return label;
  const parts = body.split(".");
  return parts[parts.length - 1] || body;
}

// Source items are registered after the packs are loaded. @Embed macros are
// used by several equipment entries to pull in a class feature's rules text.
const EMBED_SOURCES = new Map();

function expandEmbeds(html, depth = 0) {
  if (depth > 4) return "";
  return html.replace(/@Embed\[([^\]]+)\](?:\{([^}]*)\})?/g, (_match, body, label) => {
    const uuid = String(body).trim().split(/\s+/)[0] || "";
    const id = uuid.split(".").pop() || "";
    const source = EMBED_SOURCES.get(id);
    const embedded = source?.system?.description?.value || source?.system?.description?.gm || "";
    return embedded ? expandEmbeds(embedded, depth + 1) : label || "";
  });
}

function descriptionOf(system, includeGm = false) {
  const value = system?.description?.value;
  if (typeof value === "string" && value.trim()) return value;
  if (includeGm) {
    const gm = system?.description?.gm;
    if (typeof gm === "string" && gm.trim()) return gm;
  }
  return "";
}

/** Split a macro body on top-level delimiters, respecting nested [ ]. */
function splitTopLevel(value, delimiter = ",") {
  const parts = [];
  let depth = 0;
  let current = "";
  for (const character of String(value)) {
    if (character === "[") depth += 1;
    else if (character === "]") depth = Math.max(0, depth - 1);
    if (character === delimiter && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += character;
    }
  }
  parts.push(current);
  return parts.map((part) => part.trim()).filter(Boolean);
}

/**
 * Replace a Foundry macro whose body can contain nested square brackets, such
 * as @Damage[4d6[fire]] or @Damage[(@actor.level)d6[bleed]]. The old regex
 * stopped at the first closing bracket and left raw formula fragments behind.
 */
function replaceBalancedMacro(html, name, render) {
  const open = `@${name}[`;
  let out = "";
  let index = 0;
  while (index < html.length) {
    const start = html.indexOf(open, index);
    if (start < 0) {
      out += html.slice(index);
      break;
    }
    out += html.slice(index, start);
    let cursor = start + open.length;
    let depth = 1;
    for (; cursor < html.length; cursor += 1) {
      if (html[cursor] === "[") depth += 1;
      else if (html[cursor] === "]") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    if (depth !== 0) {
      out += html.slice(start);
      break;
    }
    const body = html.slice(start + open.length, cursor);
    cursor += 1;
    let label = "";
    if (html[cursor] === "{") {
      let braceDepth = 1;
      let end = cursor + 1;
      for (; end < html.length; end += 1) {
        if (html[end] === "{") braceDepth += 1;
        else if (html[end] === "}") {
          braceDepth -= 1;
          if (braceDepth === 0) break;
        }
      }
      if (braceDepth === 0) {
        label = html.slice(cursor + 1, end);
        cursor = end + 1;
      }
    }
    out += render(body, label);
    index = cursor;
  }
  return out;
}

function checkMacroText(body, label) {
  if (label.trim()) return label.trim();
  const parts = splitTopLevel(body, "|");
  const kind = (parts[0] ?? "").toLowerCase();
  const rawDc =
    parts
      .find((part) => part.toLowerCase().startsWith("dc:"))
      ?.slice(3)
      .trim() ?? "";
  // "dc:@self.level" and similar formulas cannot be resolved at ingest time;
  // the surrounding sentence supplies the standard DC.
  const dc = /^\d+$/.test(rawDc) ? rawDc : "";
  const basic = parts.some((part) => part.toLowerCase() === "basic");
  if (kind === "flat") return dc ? `DC ${dc} flat check` : "flat check";
  if (!kind) return "check";
  const name = kind === "perception" ? "Perception" : titleCase(kind.replace(/-/g, " "));
  const saveName = basic ? `basic ${name}` : name;
  return dc ? `DC ${dc} ${saveName}` : saveName;
}

function damageMacroText(body, label) {
  if (label.trim()) return label.trim();
  // Options live after a top-level pipe and may contain commas
  // (for example "options:area-damage,damage:material:silver").
  // Only the damage list before that pipe is comma-delimited.
  const [damagePart = ""] = splitTopLevel(body, "|");
  const rendered = splitTopLevel(damagePart).map((part) => {
    const match = part.match(/^([\s\S]*?)\[([^\]]*)\]$/);
    const formula = (match?.[1] ?? part).trim();
    const types = (match?.[2] ?? "")
      .split(",")
      .map((type) => type.trim())
      .filter(Boolean);
    // Keep only simple dice/flat formulas. Level- and actor-dependent formulas
    // are not resolvable at ingest time; the surrounding prose explains them.
    const simpleFormula = /^\d+d\d+(?:[+-]\d+)?$/i.test(formula) || /^\d+$/.test(formula);
    const displayFormula = simpleFormula ? formula : "";
    if (displayFormula && types.length) return `${displayFormula} ${types.join(" ")}`;
    if (displayFormula) return displayFormula;
    if (types.length) return types.join(" ");
    return "damage";
  });
  return rendered.filter(Boolean).join(", ") || "damage";
}

function templateMacroText(body, label) {
  if (label.trim()) return label.trim();
  const parts = splitTopLevel(body, "|");
  const kind = (parts[0] ?? "").replace(/^type:/i, "") || "area";
  const distance = parts.find((part) => part.startsWith("distance:"))?.slice(9);
  return distance ? `${distance}-foot ${kind}` : kind;
}

function expandMacros(html) {
  let out = expandEmbeds(resolveLocalize(html));

  // Foundry inline roll/action macros, e.g. [[/act recall-knowledge]],
  // [[/r 2d6 #fire]], and [[/check athletics dc=15]].
  out = out.replace(
    /\[\[\/([a-z]+)\s*([^\]]*)\]\](?:\{([^}]*)\})?/gi,
    (_match, command, body, display) => {
      const tokens = String(body || "")
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      if (["r", "gmr", "br", "dr"].includes(command.toLowerCase())) {
        const formula = (tokens[0] || "").replace(/^\{|\}$/g, "");
        const label = tokens.slice(1).join(" ").replace(/^#/, "");
        const simple = /^\d+d\d+(?:[+-]\d+)?$/i.test(formula) || /^\d+$/.test(formula);
        // Actor- and level-dependent inline rolls cannot be resolved during
        // ingest. Prefer the authored display label over raw @actor syntax.
        if (!simple && display && display.trim()) return display.trim();
        // Inline rolls often repeat the modifier in a trailing display label,
        // e.g. [[/r 1d20+17]]{+17}; the formula already contains it.
        return [formula, label].filter(Boolean).join(" ");
      }
      if (display && display.trim()) return display.trim();
      const slug = tokens[0] || command;
      const keys = tokens
        .filter((token) => token.startsWith("key="))
        .map((token) => titleCase(token.slice(4)));
      const name = titleCase(slug);
      return keys.length ? `${name} (${keys.join(", ")})` : name;
    }
  );

  out = out.replace(/@UUID\[([^\]]+)\](?:\{([^}]*)\})?/g, (m, body, label) =>
    stripUuid(m, body, label)
  );
  out = out.replace(/@Compendium\[([^\]]+)\](?:\{([^}]*)\})?/g, (m, body, label) =>
    stripUuid(m, body, label)
  );
  out = out.replace(/@Actor\[([^\]]+)\](?:\{([^}]*)\})?/g, (m, body, label) =>
    stripUuid(m, body, label)
  );
  out = out.replace(/@Item\[([^\]]+)\](?:\{([^}]*)\})?/g, (m, body, label) =>
    stripUuid(m, body, label)
  );
  out = replaceBalancedMacro(out, "Damage", damageMacroText);
  out = replaceBalancedMacro(out, "Check", checkMacroText);
  out = replaceBalancedMacro(out, "Save", checkMacroText);
  out = replaceBalancedMacro(out, "Template", templateMacroText);
  out = out.replace(/@Embed\[[^\]]*\](?:\{([^}]*)\})?/g, (m, label) => label || "");
  out = out.replace(/@Localize\[([^\]]+)\]/g, (_, key) => localizeKey(key));
  out = out.replace(/@[A-Za-z]+\[[^\]]*\](?:\{([^}]*)\})?/g, (m, label) => label || "");
  out = out.replace(/\{@[A-Za-z]+ ([^}]+)\}/g, (_, body) => body.split("|")[0]);
  out = out.replace(/@[A-Za-z]+/g, "");
  // Macro-aware replacements can leave doubled words such as "save save"
  // when the source prose already names the check.
  out = out
    .replace(/\b(save|check|damage)\s+\1\b/gi, "$1")
    .replace(/\bHit Points\s+Hit Points\b/gi, "Hit Points")
    .replace(/\b(a|an)\s+\1\b/gi, "$1");
  // Any remaining damage-type annotation should keep its label, not the
  // raw bracketed form.
  out = out.replace(/\[([a-z-]+(?:,[a-z-]+)*)\]\{([^}]*)\}/gi, "$2");
  out = out.replace(/\[([a-z-]+(?:,[a-z-]+)*)\]/gi, "");

  return out;
}

function cleanHtml(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  let html = expandMacros(value);
  if (!html.trim()) return "";
  html = sanitizeHtml(html, {
    allowedTags: [
      "p",
      "br",
      "hr",
      "strong",
      "em",
      "b",
      "i",
      "u",
      "s",
      "ul",
      "ol",
      "li",
      "blockquote",
      "code",
      "pre",
      "table",
      "thead",
      "tbody",
      "tfoot",
      "tr",
      "th",
      "td",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "caption",
      "sup",
      "sub",
    ],
    allowedAttributes: {},
    disallowedTagsMode: "discard",
  });
  return html
    .replace(/<p>\s*<\/p>/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function textOf(value) {
  return cleanHtml(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// Generic helpers
// ---------------------------------------------------------------------------
const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"];
const ABILITY_SET = new Set(ABILITIES);

function titleCase(value) {
  if (!value) return "";
  return String(value)
    .split(/[-_ ]+/)
    .filter(Boolean)
    .map((part) =>
      part.length <= 3 && part === part.toUpperCase() ? part : part[0].toUpperCase() + part.slice(1)
    )
    .join(" ");
}

const SKILL_IDS = new Set([
  "acrobatics",
  "arcana",
  "athletics",
  "crafting",
  "deception",
  "diplomacy",
  "intimidation",
  "medicine",
  "nature",
  "occultism",
  "performance",
  "religion",
  "society",
  "stealth",
  "survival",
  "thievery",
]);

function skillFromPath(path) {
  if (typeof path !== "string") return null;
  const match = /^system\.skills\.([a-z-]+)(?:\.rank)?$/.exec(path);
  return match && SKILL_IDS.has(match[1]) ? match[1] : null;
}

/** Fixed skill training encoded as ActiveEffectLike rank upgrades. */
function staticSkillRanks(rules) {
  const out = new Set();
  for (const rule of rules ?? []) {
    if (rule?.key !== "ActiveEffectLike") continue;
    const skill = skillFromPath(rule.path);
    const rank = Number(rule.value);
    if (skill && Number.isFinite(rank) && rank > 0) out.add(skill);
  }
  return [...out];
}

/** Skill choices encoded as ChoiceSet rules with explicit skill options. */
function skillChoicesFromRules(rules) {
  const out = [];
  for (const rule of rules ?? []) {
    if (rule?.key !== "ChoiceSet") continue;
    const options = [];
    if (rule.choices?.config === "skills") {
      options.push(...SKILL_IDS);
    } else if (Array.isArray(rule.choices)) {
      for (const choice of rule.choices) {
        const value = typeof choice === "string" ? choice : choice?.value;
        if (typeof value === "string" && SKILL_IDS.has(value)) options.push(value);
      }
    }
    if (!options.length) continue;
    out.push({
      prompt: localizeKey(rule.prompt || "Choose a skill"),
      options: [...new Set(options)],
      count: 1,
    });
  }
  return out;
}

/** Custom Lore skills encoded in a class feature's ActiveEffectLike rules. */
function loreFromRules(rules) {
  const out = [];
  for (const rule of rules ?? []) {
    if (rule?.key !== "ActiveEffectLike" || typeof rule.path !== "string") continue;
    const match = /^system\.skills\.([a-z0-9-]+)$/.exec(rule.path);
    if (!match || SKILL_IDS.has(match[1])) continue;
    const value = rule.value;
    const ability = value && typeof value === "object" ? value.attribute : null;
    if (!ABILITY_SET.has(ability)) continue;
    out.push({ name: titleCase(match[1]), ability });
  }
  return out;
}

function skillRanksFromRules(rules) {
  const out = {};
  for (const rule of rules ?? []) {
    if (rule?.key !== "ActiveEffectLike" || typeof rule.path !== "string") continue;
    const match = /^system\.skills\.([a-z-]+)\.rank$/.exec(rule.path);
    if (!match) continue;
    if (rule.predicate && !isClassOnlyPredicate(rule.predicate)) continue;
    const rank = numericRank(rule.value);
    if (!rank || rank <= 0) continue;
    out[match[1]] = Math.max(Number(out[match[1]] ?? 0), Math.min(4, rank));
  }
  return Object.keys(out).length ? out : null;
}

function favoredWeaponRankFromRules(rules) {
  let rank = 0;
  for (const rule of rules ?? []) {
    if (rule?.key !== "ActiveEffectLike") continue;
    if (rule.path !== "flags.system.favoredWeaponRank") continue;
    const value = Number(rule.value);
    if (Number.isFinite(value)) rank = Math.max(rank, value);
  }
  return rank;
}

function numericRank(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value);
  return null;
}

function isClassOnlyPredicate(predicate) {
  if (typeof predicate === "string") return predicate.startsWith("class:");
  if (Array.isArray(predicate)) return predicate.every((entry) => isClassOnlyPredicate(entry));
  if (predicate && typeof predicate === "object") {
    const keys = Object.keys(predicate);
    if (keys.length !== 1) return false;
    if (keys[0] !== "or" && keys[0] !== "and") return false;
    const value = predicate[keys[0]];
    return Array.isArray(value) && value.every((entry) => isClassOnlyPredicate(entry));
  }
  return false;
}

/** Static proficiency upgrades encoded in class feature rules. */
function proficienciesFromRules(rules) {
  const out = {};
  const add = (key, value) => {
    const rank = numericRank(value);
    if (!rank) return;
    out[key] = { ...(out[key] ?? {}), rank: Math.max(Number(out[key]?.rank ?? 0), rank) };
  };
  for (const rule of rules ?? []) {
    if (rule?.key !== "ActiveEffectLike" && rule?.key !== "MartialProficiency") continue;
    const predicate = rule.predicate;
    // Rules gated on another feature or the actor's level cannot be applied
    // unconditionally. Class-only predicates are safe because the feature
    // itself is only granted to that class.
    if (predicate && !isClassOnlyPredicate(predicate)) continue;
    if (rule.key === "ActiveEffectLike" && typeof rule.path === "string") {
      let match = /^system\.proficiencies\.attacks\.([a-z0-9-]+)\.rank$/.exec(rule.path);
      if (match) add(match[1], rule.value);
      match = /^system\.proficiencies\.defenses\.([a-z0-9-]+)\.rank$/.exec(rule.path);
      if (match) add(match[1], rule.value);
      match = /^system\.proficiencies\.saves\.([a-z0-9-]+)\.rank$/.exec(rule.path);
      if (match) add(match[1], rule.value);
      match = /^system\.saves\.([a-z0-9-]+)\.rank$/.exec(rule.path);
      if (match) add(match[1], rule.value);
      match = /^system\.proficiencies\.classDCs\.([a-z0-9-]+)\.rank$/.exec(rule.path);
      if (match) add(match[1], rule.value);
      if (rule.path === "system.proficiencies.spellcasting.rank") add("spellcasting", rule.value);
      if (rule.path === "system.perception.rank") add("perception", rule.value);
    }
    if (rule?.key === "MartialProficiency") {
      const definition = JSON.stringify(rule.definition ?? []);
      const groupSpecific = /item:group:|rulesSelections/.test(definition);
      const broad = ["simple", "martial", "unarmed"].filter((category) =>
        definition.includes(`item:category:${category}`)
      );
      // Fighter weapon mastery/legend list all three broad categories. Other
      // group-specific rules (gunslinger firearms, swashbuckler polearms) are
      // handled from the class's `attacks.other` entry instead.
      if (!groupSpecific || broad.length === 3) {
        for (const category of broad) add(category, rule.value);
      }
      if (!groupSpecific && definition.includes("item:category:advanced")) {
        add("advanced", rule.value);
      }
    }
  }
  return out;
}

function mergeProficiencies(...maps) {
  const out = {};
  for (const map of maps) {
    if (!map) continue;
    for (const [key, value] of Object.entries(map)) {
      const rank = Number(value?.rank ?? value);
      if (!Number.isFinite(rank) || rank <= 0) continue;
      out[key] = {
        ...(out[key] ?? {}),
        rank: Math.max(Number(out[key]?.rank ?? 0), rank),
      };
    }
  }
  return Object.keys(out).length ? out : null;
}

/** Class feature UUIDs referenced directly or inside rule values. */
function featureNamesFromRules(rules) {
  const names = new Set();
  const visit = (value) => {
    if (typeof value === "string") {
      const match = /Compendium\.pf2e\.classfeatures\.Item\.([^"]+)/.exec(value);
      if (match) names.add(match[1]);
    } else if (Array.isArray(value)) {
      for (const entry of value) visit(entry);
    } else if (value && typeof value === "object") {
      for (const entry of Object.values(value)) visit(entry);
    }
  };
  for (const rule of rules ?? []) {
    visit(rule.uuid);
    visit(rule.value);
  }
  return [...names];
}

function publication(system) {
  const pub = system?.publication ?? system?.details?.publication ?? {};
  return {
    source: pub.title || "Unknown",
    license: pub.license || "",
    remaster: Boolean(pub.remaster),
    playtest: /playtest/i.test(pub.title || ""),
  };
}

function traits(system) {
  return {
    rarity: system?.traits?.rarity || "common",
    traits: Array.isArray(system?.traits?.value) ? system.traits.value.filter(Boolean) : [],
    otherTags: Array.isArray(system?.traits?.otherTags)
      ? system.traits.otherTags.filter(Boolean)
      : [],
  };
}

function levelOf(system) {
  return Number(system?.level?.value ?? 0);
}

function actionOf(system) {
  return {
    actionType: system?.actionType?.value ?? null,
    actions: system?.actions?.value ?? null,
  };
}

function normalizePrice(value) {
  if (!value || typeof value !== "object") return { gp: 0, sp: 0, cp: 0, cpTotal: 0 };
  const gp = Number(value.gp ?? 0) || 0;
  const sp = Number(value.sp ?? 0) || 0;
  const cp = Number(value.cp ?? 0) || 0;
  return { gp, sp, cp, cpTotal: gp * 100 + sp * 10 + cp };
}

function normalizeBoosts(boosts) {
  const entries = [];
  if (!boosts || typeof boosts !== "object") return entries;
  for (const key of Object.keys(boosts).sort((a, b) => Number(a) - Number(b))) {
    const entry = boosts[key];
    let values = entry?.value;
    if (!Array.isArray(values)) continue;
    values = values.filter((v) => ABILITY_SET.has(v));
    if (!values.length) continue;
    if (values.length === 6) entries.push({ from: ABILITIES.slice(), fixed: false });
    else if (values.length === 1) entries.push({ from: values, fixed: true });
    else entries.push({ from: values, fixed: false });
  }
  return entries;
}

function normalizeFlaws(flaws) {
  const out = [];
  if (!flaws || typeof flaws !== "object") return out;
  for (const key of Object.keys(flaws)) {
    const values = flaws[key]?.value;
    if (Array.isArray(values)) for (const v of values) if (ABILITY_SET.has(v)) out.push(v);
  }
  return [...new Set(out)];
}

function walkJson(dir) {
  const files = [];
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walkJson(full));
    else if (entry.isFile() && entry.name.endsWith(".json") && !entry.name.startsWith("_"))
      files.push(full);
  }
  return files;
}

function readJson(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    if (Array.isArray(parsed) || !parsed || typeof parsed !== "object" || !parsed.name) return null;
    return parsed;
  } catch (error) {
    console.warn(`Skipping ${file}: ${error.message}`);
    return null;
  }
}

function byNamePreference(a, b) {
  // Prefer remastered content, then lower level, then alphabetical.
  if (a.remaster !== b.remaster) return a.remaster ? -1 : 1;
  if ((a.level ?? 0) !== (b.level ?? 0)) return (a.level ?? 0) - (b.level ?? 0);
  return a.name.localeCompare(b.name);
}

function indexByName(items) {
  const map = new Map();
  for (const item of items) {
    const key = item.name.toLowerCase();
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  for (const list of map.values()) list.sort(byNamePreference);
  return map;
}

function pickByName(map, name) {
  return map.get(String(name || "").toLowerCase())?.[0] ?? null;
}

function nameFromUuid(uuid) {
  const value = String(uuid || "");
  const marker = value.indexOf(".Item.");
  if (marker >= 0) return value.slice(marker + 6);
  return value.split(".").pop() || "";
}

// ---------------------------------------------------------------------------
// Load source items
// ---------------------------------------------------------------------------
console.log("Reading PF2e packs...");
const raw = {
  ancestries: [],
  ancestryFeatures: [],
  heritages: [],
  backgrounds: [],
  classes: [],
  classFeatures: [],
  feats: [],
  spells: [],
  equipment: [],
  deities: [],
  conditions: [],
  actions: [],
  monsters: [],
};

for (const file of walkJson(path.join(PACKS, "ancestries"))) {
  const j = readJson(file);
  if (j?.type === "ancestry") raw.ancestries.push(j);
}
for (const file of walkJson(path.join(PACKS, "ancestry-features"))) {
  const j = readJson(file);
  if (j?.type === "feat") raw.ancestryFeatures.push(j);
}
for (const file of walkJson(path.join(PACKS, "heritages"))) {
  const j = readJson(file);
  if (j?.type === "heritage") raw.heritages.push(j);
}
for (const file of walkJson(path.join(PACKS, "backgrounds"))) {
  const j = readJson(file);
  if (j?.type === "background") raw.backgrounds.push(j);
}
for (const file of walkJson(path.join(PACKS, "classes"))) {
  const j = readJson(file);
  if (j?.type === "class") raw.classes.push(j);
}
for (const file of walkJson(path.join(PACKS, "class-features"))) {
  const j = readJson(file);
  if (j?.type === "feat") raw.classFeatures.push(j);
}
for (const file of walkJson(path.join(PACKS, "feats"))) {
  const j = readJson(file);
  if (j?.type === "feat") raw.feats.push(j);
}
for (const file of walkJson(path.join(PACKS, "spells"))) {
  const j = readJson(file);
  if (j?.type === "spell") {
    const relative = path.relative(path.join(PACKS, "spells"), file);
    raw.spells.push({ ...j, __folder: relative.split(path.sep)[0] });
  }
}
for (const file of walkJson(path.join(PACKS, "equipment"))) {
  const j = readJson(file);
  if (j?.type) raw.equipment.push(j);
}
for (const file of walkJson(path.join(PACKS, "deities"))) {
  const j = readJson(file);
  if (j?.type === "deity") raw.deities.push(j);
}
for (const file of walkJson(path.join(PACKS, "conditions"))) {
  const j = readJson(file);
  if (j?.type === "condition") raw.conditions.push(j);
}
for (const file of walkJson(path.join(PACKS, "actions"))) {
  const j = readJson(file);
  if (j?.type === "action") raw.actions.push(j);
}
// The domains reference is a journal with one page per domain.
const domainsJournal = readJson(path.join(PACKS, "journals", "domains.json"));
for (const pack of [
  "pathfinder-monster-core",
  "pathfinder-monster-core-2",
  "pathfinder-npc-core",
  // Legacy and expansion bestiaries make the "Legacy + Remastered" ruleset
  // meaningful for creatures as well as character options.
  "pathfinder-bestiary",
  "pathfinder-bestiary-2",
  "pathfinder-bestiary-3",
  "lost-omens-bestiary",
  "npc-gallery",
  "battlecry-bestiary",
  "howl-of-the-wild-bestiary",
  "book-of-the-dead-bestiary",
  "rage-of-elements-bestiary",
  "war-of-immortals-bestiary",
]) {
  for (const file of walkJson(path.join(PACKS, pack))) {
    const j = readJson(file);
    if (j?.type === "npc") raw.monsters.push({ ...j, __pack: pack });
  }
}

for (const items of Object.values(raw)) {
  for (const item of items) {
    if (item?._id) EMBED_SOURCES.set(item._id, item);
  }
}

console.log(
  Object.entries(raw)
    .map(([k, v]) => `${k}: ${v.length}`)
    .join(", ")
);

// ---------------------------------------------------------------------------
// Normalize
// ---------------------------------------------------------------------------
// A few remaster classes express their key ability through a choice rather
// than the class item's keyAbility value. Keep the public class data explicit.
const CLASS_KEY_ABILITY_OVERRIDES = {
  Psychic: ["int", "cha"],
};

function baseItem(j, idPrefix, type) {
  const pub = publication(j.system);
  const tr = traits(j.system);
  return {
    id: `${idPrefix}:${j._id}`,
    name: j.name,
    type,
    level: levelOf(j.system),
    rarity: tr.rarity,
    traits: tr.traits,
    otherTags: tr.otherTags,
    ...pub,
    description: cleanHtml(j.system?.description?.value),
  };
}

const ancestryFeatureMap = indexByName(
  raw.ancestryFeatures.map((j) => ({ ...baseItem(j, "af", "ancestryFeature"), raw: j }))
);
const classFeatureItems = raw.classFeatures
  .map((j) => ({ ...baseItem(j, "cf", "classFeature"), raw: j }))
  .sort(byNamePreference);
const classFeatureMap = indexByName(classFeatureItems);
const featItems = raw.feats
  .map((j) => ({ ...baseItem(j, "feat", "feat"), raw: j }))
  .sort(byNamePreference);
const featMap = indexByName(featItems);

// --- Ancestries ------------------------------------------------------------
const ancestries = raw.ancestries
  .map((j) => {
    const s = j.system;
    const pub = publication(s);
    const tr = traits(s);
    const items = Object.values(s.items ?? {});
    const speedRules = (s.rules ?? []).filter((rule) => rule?.key === "BaseSpeed");
    const landSpeedRule = speedRules.find((rule) => !rule.selector || rule.selector === "land");
    const otherSpeeds = speedRules
      .filter((rule) => rule.selector && rule.selector !== "land")
      .map((rule) => ({ type: rule.selector, value: Number(rule.value ?? 0) }))
      .filter((entry) => Number.isFinite(entry.value) && entry.value > 0);
    const speed = landSpeedRule
      ? Number(landSpeedRule.value ?? s.speed ?? 25)
      : Number(s.speed ?? 25);
    const features = items
      .map((item) => {
        const uuidName = nameFromUuid(item.uuid);
        const resolved =
          pickByName(ancestryFeatureMap, item.name) ||
          pickByName(featMap, item.name) ||
          pickByName(ancestryFeatureMap, uuidName) ||
          pickByName(featMap, uuidName);
        return resolved
          ? {
              id: resolved.id,
              name: resolved.name,
              level: resolved.level,
              description: resolved.description,
            }
          : null;
      })
      .filter(Boolean);
    return {
      id: `anc:${j._id}`,
      name: j.name,
      type: "ancestry",
      hp: Number(s.hp ?? 0),
      size: s.size || "med",
      speed,
      otherSpeeds,
      vision: s.vision === "low-light-vision" ? "lowLight" : s.vision || "normal",
      boosts: normalizeBoosts(s.boosts),
      flaws: normalizeFlaws(s.flaws),
      languages: Array.isArray(s.languages?.value) ? s.languages.value : [],
      additionalLanguages: {
        count: Number(s.additionalLanguages?.count ?? 0),
        options: Array.isArray(s.additionalLanguages?.value) ? s.additionalLanguages.value : [],
      },
      features,
      ...pub,
      rarity: tr.rarity,
      traits: tr.traits,
      description: cleanHtml(s.description?.value),
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

// --- Heritages -------------------------------------------------------------
const heritages = raw.heritages
  .map((j) => {
    const s = j.system;
    const pub = publication(s);
    const tr = traits(s);
    return {
      id: `her:${j._id}`,
      name: j.name,
      type: "heritage",
      ancestry: s.ancestry?.name || "",
      ancestrySlug: s.ancestry?.slug || String(s.ancestry?.name || "").toLowerCase(),
      versatile: !s.ancestry?.name,
      ...pub,
      rarity: tr.rarity,
      traits: tr.traits,
      description: cleanHtml(s.description?.value),
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

// --- Backgrounds -----------------------------------------------------------
// Some legacy/rare backgrounds keep their skill or Lore choices only in prose.
// These overrides capture the official choices that Foundry does not encode.
const BACKGROUND_FIXED_LORE = {
  "Bookish Providence": ["Academia Lore"],
  "Brevic Outcast": ["Politics Lore"],
};

const BACKGROUND_FIXED_FEATS = {
  Clown: "Virtuosic Performer",
};

const BACKGROUND_FEAT_CHOICES = {
  "Able Carter": ["Charming Liar", "Hobnobber"],
  "Animal Wrangler": ["Titan Wrestler", "Train Animal"],
  "Blow-In": ["Lengthy Diversion", "Subtle Theft"],
  "Construction Occultist": ["Hefty Hauler", "Oddity Identification"],
  "Corpse Stitcher": ["Risky Surgery", "Stitch Flesh"],
  "Food Trader": ["Seasoned", "Streetwise"],
  "Martial Disciple": ["Cat Fall", "Quick Jump"],
  "Money Counter": ["Eye for Numbers", "Subtle Theft"],
  "Professional Letter Writer": ["Specialty Crafting", "Multilingual"],
  "Propaganda Promoter": ["Steady Balance", "Impressive Performance"],
  "Sponsored by a Stranger": ["Dubious Knowledge", "Quick Identification"],
  "Sponsored by a Village": ["Crafter's Appraisal", "Forager"],
  "Sponsored by Family": ["Hobnobber", "Eye for Numbers"],
  "Sponsored by Teacher Ot": ["Survey Wildlife", "Impressive Performance"],
  Unsponsored: ["Group Impression", "Intimidating Glare"],
  "Verduran City Folk": ["Multilingual", "Streetwise"],
};

const BACKGROUND_SKILL_CHOICES = {
  "Anti-Thrune Saboteur": [
    { prompt: "Choose Deception or Thievery", options: ["deception", "thievery"], count: 1 },
  ],
  "Child Of Notoriety": [
    {
      prompt: "Choose Diplomacy or Intimidation",
      options: ["diplomacy", "intimidation"],
      count: 1,
    },
  ],
  "Child of the Polis": [
    { prompt: "Choose Diplomacy or Society", options: ["diplomacy", "society"], count: 1 },
  ],
  Conservator: [
    { prompt: "Choose Crafting or Thievery", options: ["crafting", "thievery"], count: 1 },
  ],
  "Raised by Belief": [
    { prompt: "Choose your deity's divine skill", options: [...SKILL_IDS], count: 1 },
  ],
};

function grantedFeatOptionsFromDescription(description) {
  const text = textOf(description);
  const names = [
    ...text.matchAll(
      /(?:gain|gains)\s+(?:the\s+)?([A-Z][A-Za-z'’ -]{2,80}?)\s+(?:skill |general |ancestry )?feat/gi
    ),
  ]
    .map((match) => match[1].trim())
    .filter((name) => !/^(a|an|one|your choice|either|that|this|the)$/i.test(name));
  const resolved = [...new Set(names)]
    .map((name) => pickByName(featMap, name))
    .filter((feat) => Boolean(feat));
  return resolved;
}

const BACKGROUND_LORE_CHOICES = {
  "Able Carter": [
    {
      prompt: "Choose a Lore skill for one of Geb's cities",
      options: ["Graydirge Lore", "Mechitar Lore", "Yled Lore"],
      count: 1,
    },
  ],
  "Animal Wrangler": [
    { prompt: "Choose a Lore skill for a kind of common animal", options: [], count: 1 },
  ],
  "Sponsored by a Village": [
    { prompt: "Choose a Lore skill for your community's terrain", options: [], count: 1 },
  ],
  "Anti-Magical": [
    { prompt: "Choose a Lore skill (not about a magical subject)", options: [], count: 1 },
  ],
  "Anti-Thrune Saboteur": [
    {
      prompt: "Choose Cheliax Lore or Engineering Lore",
      options: ["Cheliax Lore", "Engineering Lore"],
      count: 1,
    },
  ],
  Blessed: [{ prompt: "Choose a Lore skill associated with your deity", options: [], count: 1 }],
  "Child Of Notoriety": [
    {
      prompt: "Choose Genealogy Lore or Underworld Lore",
      options: ["Genealogy Lore", "Underworld Lore"],
      count: 1,
    },
  ],
  "Child of the Polis": [
    { prompt: "Choose a Lore skill for an Iblydan city-state", options: [], count: 1 },
  ],
  "Concordance Researcher": [
    {
      prompt: "Choose four elemental plane Lore skills",
      options: [
        "Plane of Air Lore",
        "Plane of Earth Lore",
        "Plane of Fire Lore",
        "Plane of Metal Lore",
        "Plane of Water Lore",
        "Plane of Wood Lore",
      ],
      count: 4,
    },
  ],
  Conservator: [
    {
      prompt: "Choose Accounting Lore or Underworld Lore",
      options: ["Accounting Lore", "Underworld Lore"],
      count: 1,
    },
  ],
  "Crown of Chaos": [
    { prompt: "Choose a Lore skill about the terrain where you grew up", options: [], count: 1 },
  ],
  Eclipseborn: [
    { prompt: "Choose a Lore skill related to the omen at your birth", options: [], count: 1 },
  ],
  "Elementally Infused": [
    {
      prompt: "Choose your elemental plane Lore",
      options: [
        "Plane of Air Lore",
        "Plane of Earth Lore",
        "Plane of Fire Lore",
        "Plane of Metal Lore",
        "Plane of Water Lore",
        "Plane of Wood Lore",
      ],
      count: 1,
    },
  ],
  "Energy Scarred": [
    {
      prompt: "Choose a Lore skill for your energy",
      options: [
        "Acid Lore",
        "Cold Lore",
        "Electricity Lore",
        "Fire Lore",
        "Force Lore",
        "Sonic Lore",
        "Vitality Lore",
        "Void Lore",
      ],
      count: 1,
    },
  ],
  "Fated Rival": [
    { prompt: "Choose two Lore skills related to your rival", options: [], count: 2 },
  ],
  "Hammered by Fate": [
    {
      prompt: "Choose Daemon, Demon, or Devil Lore",
      options: ["Daemon Lore", "Demon Lore", "Devil Lore"],
      count: 1,
    },
  ],
  "Keys to Destiny": [
    {
      prompt: "Choose a profession Lore skill",
      options: [
        "Art Lore",
        "Engineering Lore",
        "Farming Lore",
        "Herbalism Lore",
        "Labor Lore",
        "Mercantile Lore",
        "Scribing Lore",
        "Theater Lore",
        "Warfare Lore",
      ],
      count: 1,
    },
  ],
  "Raised by Belief": [
    { prompt: "Choose a Lore skill related to your deity", options: [], count: 1 },
  ],
  "Reborn Soul": [{ prompt: "Choose two Lore skills from your past life", options: [], count: 2 }],
  "Time Traveler": [
    { prompt: "Choose three Lore skills from your old time", options: [], count: 3 },
  ],
};

const backgrounds = raw.backgrounds
  .map((j) => {
    const s = j.system;
    const pub = publication(s);
    const tr = traits(s);
    const lore = [];
    const trained = new Set();
    const trainedSkills = s.trainedSkills ?? {};
    if (Array.isArray(trainedSkills.value))
      for (const skill of trainedSkills.value) trained.add(skill);
    for (const skill of staticSkillRanks(s.rules)) trained.add(skill);
    for (const [key, values] of Object.entries(trainedSkills)) {
      if (key === "value" || !Array.isArray(values)) continue;
      for (const v of values) lore.push(/lore$/i.test(v) ? v : `${v} ${titleCase(key)}`);
    }
    if (typeof trainedSkills.custom === "string" && trainedSkills.custom.trim()) {
      lore.push(
        /lore$/i.test(trainedSkills.custom) ? trainedSkills.custom : `${trainedSkills.custom} Lore`
      );
    }
    const skillChoices = skillChoicesFromRules(s.rules);
    const extraLore = BACKGROUND_FIXED_LORE[j.name] ?? [];
    const extraSkillChoices = BACKGROUND_SKILL_CHOICES[j.name] ?? [];
    const loreChoices = BACKGROUND_LORE_CHOICES[j.name] ?? [];
    const extraFeatChoices = BACKGROUND_FEAT_CHOICES[j.name] ?? [];
    const fixedFeatName = BACKGROUND_FIXED_FEATS[j.name];
    const granted = Object.values(s.items ?? {}).map((item) => {
      const found = pickByName(featMap, item.name) || pickByName(featMap, nameFromUuid(item.uuid));
      return found
        ? { id: found.id, name: found.name, level: found.level }
        : { id: null, name: item.name, level: item.level ?? 0 };
    });
    const featChoices = [];
    if (fixedFeatName && !granted.length) {
      const fixedFeat = pickByName(featMap, fixedFeatName);
      if (fixedFeat)
        granted.push({ id: fixedFeat.id, name: fixedFeat.name, level: fixedFeat.level });
    }
    if (extraFeatChoices.length) {
      const resolved = extraFeatChoices
        .map((name) => pickByName(featMap, name))
        .filter(Boolean)
        .map((feat) => ({ id: feat.id, name: feat.name, level: feat.level }));
      if (resolved.length) {
        featChoices.push({ prompt: "Choose your starting feat", options: resolved, count: 1 });
      }
    } else if (!granted.length) {
      const parsed = grantedFeatOptionsFromDescription(s.description?.value);
      if (parsed.length === 1) {
        granted.push({ id: parsed[0].id, name: parsed[0].name, level: parsed[0].level });
      } else if (parsed.length > 1) {
        featChoices.push({
          prompt: "Choose your starting feat",
          options: parsed.map((feat) => ({ id: feat.id, name: feat.name, level: feat.level })),
          count: 1,
        });
      }
    }
    return {
      id: `bg:${j._id}`,
      name: j.name,
      type: "background",
      boosts: normalizeBoosts(s.boosts),
      trainedSkills: [...trained],
      skillChoices: [...skillChoices, ...extraSkillChoices],
      lore: [...new Set([...lore, ...extraLore])],
      loreChoices,
      featChoices,
      grantedFeats: granted,
      ...pub,
      rarity: tr.rarity,
      traits: tr.traits,
      description: cleanHtml(s.description?.value),
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

// --- Class features + choices ---------------------------------------------
function featureSummary(item) {
  const sub = item.raw?.system?.subfeatures;
  return {
    id: item.id,
    name: item.name,
    level: item.level,
    description: item.description,
    traits: item.traits,
    otherTags: item.otherTags,
    proficiencies: mergeProficiencies(
      sub?.proficiencies,
      proficienciesFromRules(item.raw?.system?.rules)
    ),
    keyOptions: sub?.keyOptions ?? null,
    suppressedFeatures: sub?.suppressedFeatures ?? null,
    senses: sub?.senses ?? null,
    languages: sub?.languages ?? null,
    lore: loreFromRules(item.raw?.system?.rules),
    favoredWeaponRank: favoredWeaponRankFromRules(item.raw?.system?.rules) || null,
    skillRanks: skillRanksFromRules(item.raw?.system?.rules),
  };
}

function grantedFeaturesFor(option) {
  const features = [];
  const seen = new Set();
  for (const name of featureNamesFromRules(option.raw?.system?.rules)) {
    const resolved = pickByName(classFeatureMap, name);
    if (!resolved || resolved.id === option.id || seen.has(resolved.id)) continue;
    seen.add(resolved.id);
    features.push(featureSummary(resolved));
  }
  return features;
}

function choiceGroupsFor(feature) {
  const rules = feature.raw?.system?.rules ?? [];
  const groups = new Map();
  for (const rule of rules) {
    if (rule.key !== "ChoiceSet") continue;
    const filters = JSON.stringify(rule.choices?.filter ?? []) ?? "";
    const tags = [...filters.matchAll(/item:tag:([a-z0-9-]+)/g)].map((m) => m[1]);
    for (const tag of tags) {
      const options = classFeatureItems.filter(
        (item) => item.traits.includes(tag) || item.otherTags.includes(tag)
      );
      if (!options.length) continue;
      const deduped = [];
      const seen = new Set();
      for (const option of options.sort(byNamePreference)) {
        if (seen.has(option.name.toLowerCase())) continue;
        seen.add(option.name.toLowerCase());
        deduped.push(option);
      }
      const existing = groups.get(tag);
      const prompt = localizeKey(rule.prompt || `Choose ${titleCase(tag)}`);
      if (existing) {
        existing.count += 1;
        continue;
      }
      groups.set(tag, {
        key: `${feature.id}:${tag}`,
        tag,
        prompt,
        sourceFeature: { name: feature.name, level: feature.level },
        count: 1,
        options: deduped
          .map((option) => ({
            id: option.id,
            name: option.name,
            level: option.level,
            traits: option.traits,
            otherTags: option.otherTags,
            rarity: option.rarity,
            source: option.source,
            remaster: option.remaster,
            description: option.description,
            trainedSkills: staticSkillRanks(option.raw?.system?.rules),
            skillRanks: skillRanksFromRules(option.raw?.system?.rules),
            grantedFeatures: grantedFeaturesFor(option),
          }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      });
    }
  }
  return [...groups.values()];
}

const classFeaturesById = new Map(classFeatureItems.map((f) => [f.id, f]));

const classes = raw.classes
  .map((j) => {
    const s = j.system;
    const pub = publication(s);
    const tr = traits(s);
    const featureRefs = Object.values(s.items ?? {}).map((item) => {
      const resolved =
        pickByName(classFeatureMap, item.name) ||
        pickByName(classFeatureMap, nameFromUuid(item.uuid));
      if (!resolved) {
        return {
          id: null,
          name: item.name,
          level: Number(item.level ?? 0),
          description: "",
          traits: [],
          proficiencies: null,
          keyOptions: null,
          suppressedFeatures: null,
          senses: null,
          languages: null,
          lore: [],
          favoredWeaponRank: null,
          choiceGroups: [],
        };
      }
      return {
        ...featureSummary(resolved),
        name: item.name,
        level: Number(item.level ?? resolved.level ?? 0),
        choiceGroups: choiceGroupsFor(resolved),
      };
    });
    // Only groups belonging to features that are actually granted by the class.
    // Some features contain several filters for the same choice (e.g. Champion's
    // sanctification variants); keep the group with the most complete option list.
    const choiceGroups = [];
    for (const feature of featureRefs) {
      for (const group of feature.choiceGroups) {
        const duplicate = choiceGroups.find(
          (g) => g.sourceFeature?.name === group.sourceFeature?.name && g.prompt === group.prompt
        );
        if (!duplicate) choiceGroups.push(group);
        else if (group.options.length > duplicate.options.length) {
          const index = choiceGroups.indexOf(duplicate);
          choiceGroups[index] = group;
        }
      }
    }
    choiceGroups.sort(
      (a, b) =>
        (a.sourceFeature?.level ?? 0) - (b.sourceFeature?.level ?? 0) ||
        a.prompt.localeCompare(b.prompt)
    );
    // The upstream Swashbuckler class item lists odd skill-feat levels. Use
    // the standard even progression instead of shipping illegal slots.
    const skillFeatLevels =
      j.name === "Swashbuckler"
        ? [2, 4, 6, 8, 10, 12, 14, 16, 18, 20]
        : (s.skillFeatLevels?.value ?? []).map(Number);
    return {
      id: `cls:${j._id}`,
      name: j.name,
      type: "class",
      hp: Number(s.hp ?? 0),
      keyAbility:
        CLASS_KEY_ABILITY_OVERRIDES[j.name] ??
        (Array.isArray(s.keyAbility?.value)
          ? s.keyAbility.value.filter((a) => ABILITY_SET.has(a))
          : []),
      perception: Number(s.perception ?? 1),
      savingThrows: {
        fortitude: Number(s.savingThrows?.fortitude ?? 1),
        reflex: Number(s.savingThrows?.reflex ?? 1),
        will: Number(s.savingThrows?.will ?? 1),
      },
      attacks: {
        unarmed: Number(s.attacks?.unarmed ?? 1),
        simple: Number(s.attacks?.simple ?? 1),
        martial: Number(s.attacks?.martial ?? 0),
        advanced: Number(s.attacks?.advanced ?? 0),
        other: s.attacks?.other ?? null,
      },
      defenses: {
        unarmored: Number(s.defenses?.unarmored ?? 1),
        light: Number(s.defenses?.light ?? 0),
        medium: Number(s.defenses?.medium ?? 0),
        heavy: Number(s.defenses?.heavy ?? 0),
      },
      trainedSkills: {
        value: Array.isArray(s.trainedSkills?.value) ? s.trainedSkills.value : [],
        additional: Number(s.trainedSkills?.additional ?? 0),
        custom: typeof s.trainedSkills?.custom === "string" ? s.trainedSkills.custom : "",
      },
      skillChoices: skillChoicesFromRules(s.rules),
      featLevels: {
        ancestry: (s.ancestryFeatLevels?.value ?? [1, 5, 9, 13, 17]).map(Number),
        class: (s.classFeatLevels?.value ?? []).map(Number),
        skill: skillFeatLevels,
        general: (s.generalFeatLevels?.value ?? [3, 7, 11, 15, 19]).map(Number),
      },
      skillIncreaseLevels: (s.skillIncreaseLevels?.value ?? [3, 5, 7, 9, 11, 13, 15, 17, 19]).map(
        Number
      ),
      spellcasting: Number(s.spellcasting ?? 0),
      features: featureRefs.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name)),
      choiceGroups,
      ...pub,
      rarity: tr.rarity,
      traits: tr.traits,
      description: cleanHtml(s.description?.value),
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

// Attach selected-option subfeatures to choice options for the rules engine.
for (const cls of classes) {
  for (const group of cls.choiceGroups) {
    for (const option of group.options) {
      const feature = classFeaturesById.get(option.id);
      const sub = feature?.raw?.system?.subfeatures;
      option.proficiencies = sub?.proficiencies ?? null;
      option.keyOptions = sub?.keyOptions ?? null;
      option.suppressedFeatures = sub?.suppressedFeatures ?? null;
      option.senses = sub?.senses ?? null;
      option.languages = sub?.languages ?? null;
    }
  }
}

const classFeatures = classFeatureItems.map((f) => {
  const summary = featureSummary(f);
  return {
    ...summary,
    rarity: f.rarity,
    source: f.source,
    remaster: f.remaster,
    actionType: actionOf(f.raw?.system).actionType,
    actions: actionOf(f.raw?.system).actions,
    prerequisites: f.raw?.system?.prerequisites?.value ?? [],
  };
});

// --- Feats -----------------------------------------------------------------
const feats = featItems
  .map((f) => {
    const s = f.raw.system;
    const action = actionOf(s);
    return {
      id: f.id,
      name: f.name,
      type: "feat",
      category: s.category || "general",
      level: f.level,
      rarity: f.rarity,
      traits: f.traits,
      otherTags: f.otherTags,
      source: f.source,
      license: f.license,
      remaster: f.remaster,
      playtest: f.playtest,
      actionType: action.actionType,
      actions: action.actions,
      prerequisites: (s.prerequisites?.value ?? [])
        .map((p) => (typeof p === "string" ? textOf(p) : textOf(p?.value ?? "")))
        .filter(Boolean),
      description: f.description,
    };
  })
  .sort(
    (a, b) =>
      a.category.localeCompare(b.category) || a.level - b.level || a.name.localeCompare(b.name)
  );

// --- Spells ----------------------------------------------------------------
function normalizeDamage(damage, fallbackType = "untyped") {
  if (!damage || typeof damage !== "object" || !Object.keys(damage).length) return null;
  const parts = [];
  for (const value of Object.values(damage)) {
    if (typeof value === "string") {
      if (value.trim()) parts.push({ formula: value.trim(), type: fallbackType });
      continue;
    }
    if (!value || typeof value !== "object") continue;
    const formula = String(value.formula ?? value.damage ?? value.dice ?? "").trim();
    if (!formula) continue;
    const type = value.type || value.damageType || fallbackType;
    parts.push({ formula, type: type || "untyped" });
  }
  return parts.length ? parts : null;
}

function normalizeHeightening(heightening, baseType = "untyped") {
  if (!heightening || typeof heightening !== "object") return null;
  return {
    type: heightening.type || null,
    interval: heightening.interval ?? null,
    damage: normalizeDamage(heightening.damage, baseType),
    area: heightening.area ?? null,
  };
}

function spellDamageText(damage) {
  if (!damage) return "";
  return damage
    .map((part) => `${part.formula ?? ""} ${part.type ?? ""}`.trim())
    .filter(Boolean)
    .join(", ");
}

const spells = raw.spells
  .map((j) => {
    const s = j.system;
    const pub = publication(s);
    const tr = traits(s);
    const rank = (s.traits?.value ?? []).includes("cantrip") ? 0 : Number(s.level?.value ?? 0);
    const resolveRank = (parts) =>
      parts?.map((part) => ({
        ...part,
        formula: part.formula.replace(/@item\.rank/gi, String(rank)),
      })) ?? null;
    const damage = resolveRank(normalizeDamage(s.damage));
    const heightening = normalizeHeightening(s.heightening, damage?.[0]?.type);
    if (heightening) heightening.damage = resolveRank(heightening.damage);
    const gmOnlyDescription =
      !String(s.description?.value ?? "").trim() && Boolean(String(s.description?.gm ?? "").trim());
    return {
      id: `spell:${j._id}`,
      name: j.name,
      type: "spell",
      rank,
      /** Rituals are stored with the spells but have no magical tradition. */
      ritual: j.__folder === "rituals",
      traditions: Array.isArray(s.traits?.traditions) ? s.traits.traditions : [],
      rarity: tr.rarity,
      traits: tr.traits,
      source: pub.source,
      license: pub.license,
      remaster: pub.remaster,
      playtest: pub.playtest,
      gmDescription: gmOnlyDescription || undefined,
      actionType: s.time?.value ?? "",
      actions: s.time?.value ?? "",
      range: s.range?.value ?? "",
      area: s.area ? [s.area.type, s.area.value, s.area.details].filter(Boolean).join(" ") : "",
      targets: s.target?.value ?? "",
      duration: s.duration?.value ?? "",
      cost: s.cost?.value ?? "",
      requirements: s.requirements ?? "",
      defense: s.defense
        ? { save: s.defense.save?.statistic ?? null, basic: Boolean(s.defense.save?.basic) }
        : null,
      damage,
      damageText: spellDamageText(damage),
      heightening,
      description: cleanHtml(descriptionOf(s, true)),
    };
  })
  .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));

// --- Equipment -------------------------------------------------------------
const equipment = raw.equipment
  .map((j) => {
    const s = j.system;
    const pub = publication(s);
    const tr = traits(s);
    const price = normalizePrice(s.price?.value);
    const gmOnlyDescription =
      !String(s.description?.value ?? "").trim() && Boolean(String(s.description?.gm ?? "").trim());
    const out = {
      id: `item:${j._id}`,
      name: j.name,
      type: j.type,
      level: levelOf(s),
      price,
      bulk: Number(s.bulk?.value ?? 0),
      rarity: tr.rarity,
      traits: tr.traits,
      source: pub.source,
      license: pub.license,
      remaster: pub.remaster,
      playtest: pub.playtest,
      usage: s.usage?.value ?? "",
      description: cleanHtml(descriptionOf(s, true)),
      gmDescription: gmOnlyDescription || undefined,
    };
    if (j.type === "weapon") {
      out.weapon = {
        category: s.category || "simple",
        group: s.group || "",
        damage: {
          dice: Number(s.damage?.dice ?? 1),
          die: s.damage?.die || "d4",
          type: s.damage?.damageType || "untyped",
        },
        range: s.range ?? null,
        reload: s.reload?.value ?? null,
        hands: s.usage?.value?.includes("two-hand") ? 2 : 1,
        bonus: Number(s.bonus?.value ?? 0),
      };
    }
    if (j.type === "armor") {
      out.armor = {
        category: s.category || "light",
        acBonus: Number(s.acBonus ?? 0),
        dexCap: Number(s.dexCap ?? 0),
        checkPenalty: Number(s.checkPenalty ?? 0),
        speedPenalty: Number(s.speedPenalty ?? 0),
        strength: Number(s.strength ?? 0),
        group: s.group || "",
      };
    }
    if (j.type === "shield") {
      out.shield = {
        acBonus: Number(s.acBonus ?? 2),
        hardness: Number(s.hardness ?? 0),
        hp: Number(s.hp?.max ?? 0),
        speedPenalty: Number(s.speedPenalty ?? 0),
      };
    }
    if (j.type === "consumable") {
      out.consumable = {
        category: s.category || "",
        uses: s.uses?.value ?? null,
        duration: s.duration?.value ?? "",
      };
    }
    return out;
  })
  .sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));

// --- Deities ---------------------------------------------------------------
// Deity spell lists are stored as Foundry UUIDs that end with the spell name.
// Resolve them against the local spell pack so the compendium never exposes
// raw "Compendium.pf2e.spells-srd.Item..." strings.
const deitySpellMap = indexByName(
  raw.spells.map((j) => ({
    name: j.name,
    id: `spell:${j._id}`,
    remaster: publication(j.system).remaster,
  }))
);
function resolveDeitySpell(value) {
  const rawName = nameFromUuid(String(value ?? ""));
  return {
    id: pickByName(deitySpellMap, rawName)?.id ?? null,
    name: rawName,
  };
}

// Foundry's deity items omit the cleric spell lists for these three deities
// even though the published stat blocks include them.
const DEITY_SPELL_OVERRIDES = {
  Dammar: { 1: "Ill Omen", 3: "Insect Form", 5: "Flammable Fumes" },
  Inna: { 1: "Fold Metal", 3: "Fireball", 4: "Creation" },
  "Tolte Coatl": { 1: "Tailwind", 3: "Hypercognition", 8: "Quandary" },
};

const deities = raw.deities
  .map((j) => {
    const s = j.system;
    const pub = publication(s);
    const tr = traits(s);
    return {
      id: `deity:${j._id}`,
      name: j.name,
      type: "deity",
      category: s.category || "deity",
      attribute: Array.isArray(s.attribute) ? s.attribute.filter((a) => ABILITY_SET.has(a)) : [],
      domains: Array.isArray(s.domains?.primary) ? s.domains.primary : [],
      alternateDomains: Array.isArray(s.domains?.alternate) ? s.domains.alternate : [],
      font: Array.isArray(s.font) ? s.font : [],
      skill: Array.isArray(s.skill)
        ? s.skill.filter((value) => typeof value === "string")
        : s.skill
          ? [s.skill]
          : [],
      weapons: Array.isArray(s.weapons) ? s.weapons : [],
      spells: Object.fromEntries(
        Object.entries(
          Object.keys(s.spells ?? {}).length ? s.spells : (DEITY_SPELL_OVERRIDES[j.name] ?? {})
        ).map(([rank, uuid]) => [rank, resolveDeitySpell(uuid)])
      ),
      sanctification: s.sanctification ?? {},
      rarity: tr.rarity,
      traits: tr.traits,
      source: pub.source,
      license: pub.license,
      remaster: pub.remaster,
      description: cleanHtml(s.description?.value),
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

// --- Domains ---------------------------------------------------------------
function domainSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+domain$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const DOMAIN_ALIASES = {
  delirium: "disorientation",
  void: "nothingness",
  wyrmkin: "dragon",
};

function domainAliases(name) {
  const slug = domainSlug(name);
  return Object.entries(DOMAIN_ALIASES)
    .filter(([, target]) => target === slug)
    .map(([alias]) => alias);
}

function domainUuidNames(html) {
  const names = [];
  for (const match of String(html ?? "").matchAll(/@UUID\[([^\]]+)\](?:\{([^}]*)\})?/g)) {
    const name = match[2]?.trim() || nameFromUuid(match[1]);
    if (name) names.push(name);
  }
  return [...new Set(names)];
}

function domainAlternates(html) {
  const parts = String(html ?? "").split(/<p><em>Alternate Domain<\/em><\/p>/i);
  return [domainUuidNames(parts[0] ?? ""), domainUuidNames(parts[1] ?? "")];
}

const domains = (domainsJournal?.pages ?? [])
  .map((page) => {
    const content = String(page.text?.content ?? "");
    const description = cleanHtml(content.split(/<p><strong>Domain Spell<\/strong>/i)[0] ?? "");
    const domainUuid = content.match(
      /<strong>Domain Spell<\/strong>[\s\S]*?@UUID\[([^\]]+)\]/i
    )?.[1];
    const advancedUuid = content.match(
      /<strong>Advanced Domain Spell<\/strong>[\s\S]*?@UUID\[([^\]]+)\]/i
    )?.[1];
    const sections = {};
    const chunks = content.split(/<h4><strong>([^<]+)<\/strong><\/h4>/i);
    for (let index = 1; index < chunks.length; index += 2) {
      sections[chunks[index].trim().toLowerCase()] = chunks[index + 1] ?? "";
    }
    const [deities, alternateDeities] = domainAlternates(sections.deities ?? "");
    const [covenants, alternateCovenants] = domainAlternates(sections.covenants ?? "");
    const [pantheons, alternatePantheons] = domainAlternates(sections.pantheons ?? "");
    const name = String(page.name ?? "")
      .replace(/\s+Domain$/i, "")
      .trim();
    if (!name) return null;
    return {
      id: `domain:${domainSlug(name)}`,
      name,
      type: "domain",
      description,
      domainSpell: resolveDeitySpell(domainUuid),
      advancedDomainSpell: resolveDeitySpell(advancedUuid),
      deities,
      alternateDeities,
      covenants,
      alternateCovenants,
      pantheons,
      alternatePantheons,
      mysteries: domainUuidNames(sections["oracle mysteries"] ?? ""),
      aliases: domainAliases(name),
      rarity: "common",
      traits: [],
      source: "Pathfinder 2e",
      license: "ORC",
      remaster: true,
    };
  })
  .filter(Boolean)
  .sort((a, b) => a.name.localeCompare(b.name));

// --- Conditions / actions --------------------------------------------------
const conditions = raw.conditions
  .map((j) => ({
    id: `cond:${j._id}`,
    name: j.name,
    type: "condition",
    description: cleanHtml(j.system?.description?.value),
    source: publication(j.system).source,
    remaster: publication(j.system).remaster,
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

const actions = raw.actions
  .map((j) => {
    const s = j.system;
    const pub = publication(s);
    const tr = traits(s);
    return {
      id: `act:${j._id}`,
      name: j.name,
      type: "action",
      actionType: s.actionType?.value ?? null,
      actions: s.actions?.value ?? null,
      category: s.category || "",
      rarity: tr.rarity,
      traits: tr.traits,
      source: pub.source,
      license: pub.license,
      remaster: pub.remaster,
      description: cleanHtml(s.description?.value),
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

// --- Monsters --------------------------------------------------------------
function monsterSizeCells(size) {
  switch ((size || "").toLowerCase()) {
    case "tiny":
      return 1;
    case "sm":
    case "small":
    case "med":
    case "medium":
      return 1;
    case "lg":
    case "large":
      return 2;
    case "huge":
      return 3;
    case "grg":
    case "gargantuan":
      return 4;
    default:
      return 1;
  }
}

function normalizeMonster(j) {
  const s = j.system;
  const pub = publication(s);
  const tr = traits(s);
  const items = Array.isArray(j.items) ? j.items : [];
  const attacks = items
    .filter((item) => ["melee", "ranged"].includes(item.type))
    .map((item) => {
      const is = item.system ?? {};
      const damage = Object.values(is.damageRolls ?? {})
        .map((d) => `${d.damage ?? ""} ${d.damageType ?? ""}`.trim())
        .filter(Boolean)
        .join(" plus ");
      return {
        name: item.name,
        // Foundry uses item type "melee" for both melee and ranged NPC
        // strikes. A range increment is the reliable ranged indicator.
        type: is.range?.increment != null && Number(is.range.increment) > 0 ? "ranged" : "melee",
        bonus: Number(is.bonus?.value ?? 0),
        damage,
        traits: is.traits?.value ?? [],
        range: is.range?.increment ?? null,
        effects: is.attackEffects?.value ?? [],
      };
    });
  const abilities = items
    .filter((item) => ["action", "spell"].includes(item.type))
    .map((item) => ({
      name: item.name,
      type: item.type,
      actions: item.system?.actions?.value ?? item.system?.time?.value ?? null,
      actionType: item.system?.actionType?.value ?? null,
      traits: item.system?.traits?.value ?? [],
      description: cleanHtml(item.system?.description?.value),
    }))
    .filter((a) => a.description || a.traits.length);
  const speeds = s.attributes?.speed ?? {};
  const otherSpeeds = Array.isArray(speeds.otherSpeeds)
    ? speeds.otherSpeeds.map((sp) => ({ type: sp.type, value: sp.value }))
    : [];
  return {
    id: `mon:${j._id}`,
    name: j.name,
    type: "monster",
    level: Number(s.details?.level?.value ?? 0),
    rarity: tr.rarity,
    traits: tr.traits,
    size: s.traits?.size?.value || "med",
    sizeCells: monsterSizeCells(s.traits?.size?.value),
    hp: Number(s.attributes?.hp?.max ?? 0),
    ac: Number(s.attributes?.ac?.value ?? 0),
    fortitude: Number(s.saves?.fortitude?.value ?? 0),
    reflex: Number(s.saves?.reflex?.value ?? 0),
    will: Number(s.saves?.will?.value ?? 0),
    perception: Number(s.perception?.mod ?? s.perception?.value ?? 0),
    speeds: { base: Number(speeds.value ?? 25), other: otherSpeeds },
    skills: s.skills ?? {},
    immunities: s.attributes?.immunities ?? [],
    weaknesses: s.attributes?.weaknesses ?? [],
    resistances: s.attributes?.resistances ?? [],
    attacks,
    abilities,
    blurb: textOf(s.details?.blurb),
    description: cleanHtml(s.details?.publicNotes),
    source: pub.source,
    license: pub.license,
    remaster: pub.remaster,
    playtest: pub.playtest,
  };
}

const monsterMap = new Map();
for (const j of raw.monsters) {
  const monster = normalizeMonster(j);
  const key = `${monster.name.toLowerCase()}|${monster.level}`;
  if (!monsterMap.has(key)) monsterMap.set(key, monster);
  else {
    const existing = monsterMap.get(key);
    const rank = (m) =>
      m.source.includes("Monster Core") ? 2 : m.source.includes("NPC Core") ? 1 : 0;
    if (rank(monster) > rank(existing)) monsterMap.set(key, monster);
  }
}
const monsters = [...monsterMap.values()].sort(
  (a, b) => a.level - b.level || a.name.localeCompare(b.name)
);

// ---------------------------------------------------------------------------
// Write files
// ---------------------------------------------------------------------------
function write(name, data) {
  const file = path.join(OUT, name);
  fs.writeFileSync(file, JSON.stringify(data));
  const size = fs.statSync(file).size;
  console.log(
    `  ${name.padEnd(24)} ${String(data.length).padStart(6)} entries  ${(size / 1024).toFixed(0)} KB`
  );
}

console.log("\nWriting compendium:");
normalizeDeityWeapons(deities, equipment);
normalizeMonsterAttackTypes(monsters);
write("ancestries.json", applyNameOverrides(ancestries, ANCESTRY_OVERRIDES));
write("heritages.json", applyNameOverrides(heritages, HERITAGE_OVERRIDES));
write(
  "backgrounds.json",
  addProseLoreChoices(applyNameOverrides(backgrounds, BACKGROUND_OVERRIDES))
);
write("classes.json", applyNameOverrides(classes, CLASS_OVERRIDES));
write("classFeatures.json", classFeatures);
write("feats.json", feats);
write("spells.json", applyNameOverrides(spells, SPELL_OVERRIDES));
write("equipment.json", applyNameOverrides(equipment, EQUIPMENT_OVERRIDES));
write("deities.json", applyNameOverrides(deities, DEITY_OVERRIDES));
write("domains.json", domains);
write("conditions.json", conditions);
write("actions.json", actions);
write("monsters.json", applyNameOverrides(monsters, MONSTER_OVERRIDES));

function gitOutput(gitArgs) {
  try {
    return execFileSync("git", ["-C", REPO, ...gitArgs], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

const sourceCommit = gitOutput(["rev-parse", "HEAD"]) || null;
const sourceRef = gitOutput(["describe", "--tags", "--always"]) || null;
const sourceDirty = sourceCommit ? gitOutput(["status", "--porcelain"]).length > 0 : null;

const manifest = {
  generatedAt: new Date().toISOString(),
  source: "https://github.com/foundryvtt/pf2e (Apache-2.0)",
  sourceCommit,
  sourceRef,
  sourceDirty,
  count: {
    ancestries: ancestries.length,
    heritages: heritages.length,
    backgrounds: backgrounds.length,
    classes: classes.length,
    classFeatures: classFeatures.length,
    feats: feats.length,
    spells: spells.length,
    equipment: equipment.length,
    deities: deities.length,
    domains: domains.length,
    conditions: conditions.length,
    actions: actions.length,
    monsters: monsters.length,
  },
  remasterOnlyCount: {
    ancestries: ancestries.filter((x) => x.remaster).length,
    backgrounds: backgrounds.filter((x) => x.remaster).length,
    feats: feats.filter((x) => x.remaster).length,
    spells: spells.filter((x) => x.remaster).length,
    equipment: equipment.filter((x) => x.remaster).length,
    monsters: monsters.filter((x) => x.remaster).length,
  },
};
fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log("\nManifest:", JSON.stringify(manifest.count, null, 2));
if (sourceCommit)
  console.log(
    `Source commit: ${sourceRef || sourceCommit}${sourceDirty ? " (dirty working tree)" : ""}`
  );
console.log(`\nDone. Compendium written to ${OUT}`);
