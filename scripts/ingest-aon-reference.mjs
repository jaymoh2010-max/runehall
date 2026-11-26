#!/usr/bin/env node
/**
 * Generate the Archives of Nethys reference files that are not present in the
 * Foundry PF2e packs: the trait glossary and the disease/curse afflictions.
 *
 * These files are regenerated independently of the Foundry ingest because they
 * come from a different source. Run this after `npm run ingest` when the Aon
 * index changes.
 */
import fs from "node:fs";
import path from "node:path";
import sanitizeHtml from "sanitize-html";

const API = "https://elasticsearch.aonprd.com/aon/_search";
const OUT = path.resolve("data", "compendium");

function decodeEntities(value) {
  return String(value ?? "")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'");
}

function cleanAonTemplates(value) {
  return String(value ?? "").replace(/\{\{([^}]+)\}\}/g, (_, body) => {
    const quoted = String(body).match(/"([^"]+)"/);
    if (quoted) return quoted[1];
    const parts = String(body).trim().split(/\s+/).filter(Boolean);
    return parts[parts.length - 1] ?? "";
  });
}

function markdownToHtml(value) {
  let text = decodeEntities(cleanAonTemplates(value ?? ""));
  text = text.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
  text = text.replace(/<\/?(?:title|traits|trait|column|row|summary|additional-info)[^>]*>/gi, "");
  text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/(^|[\s(])_([^_]+)_(?=[\s).,;:]|$)/g, "$1<em>$2</em>");
  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) =>
      paragraph
        .replace(/\s*\n\s*/g, " ")
        .replace(/\s{2,}/g, " ")
        .trim()
    )
    .filter(Boolean);
  const html = paragraphs.map((paragraph) => `<p>${paragraph}</p>`).join("");
  return sanitizeHtml(html, {
    allowedTags: [
      "p",
      "strong",
      "em",
      "br",
      "hr",
      "ul",
      "ol",
      "li",
      "table",
      "thead",
      "tbody",
      "tr",
      "th",
      "td",
    ],
    allowedAttributes: {},
    disallowedTagsMode: "discard",
  })
    .replace(/<p>\s*<\/p>/g, "")
    .trim();
}

function stripSource(markdown) {
  return String(markdown ?? "")
    .replace(/<title[^>]*>[\s\S]*?<\/title>/gi, "")
    .replace(/<traits>[\s\S]*?<\/traits>/gi, "")
    .replace(/<column[^>]*>[\s\S]*?<\/column>/gi, "")
    .replace(/\*\*Source\*\*\s*\[[^\]]+\]\([^)]*\)[^\n]*\n?/gi, "")
    .replace(/\*\*Source\*\*[^\n]*\n?/gi, "")
    .replace(/\r/g, "")
    .trim();
}

function cleanText(value) {
  return cleanAonTemplates(decodeEntities(value ?? ""))
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<\/?[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchCategory(category) {
  const all = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    const res = await fetch(API, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        size,
        from,
        _source: { excludes: ["text", "search_markdown"] },
        sort: [{ "id.keyword": { order: "asc", unmapped_type: "keyword" } }],
        query: { term: { category } },
      }),
    });
    if (!res.ok) throw new Error(`${category}: HTTP ${res.status} ${await res.text()}`);
    const json = await res.json();
    const hits = json.hits.hits.map((hit) => hit._source);
    all.push(...hits);
    if (hits.length < size) break;
  }
  return all;
}

function traitKey(entry) {
  return entry.name.trim().toLowerCase();
}

function afflictionKey(entry) {
  return `${entry.category}:${entry.name.trim().toLowerCase()}`;
}

function newestFirst(a, b) {
  return String(b.release_date ?? "").localeCompare(String(a.release_date ?? ""));
}

const rawTraits = await fetchCategory("trait");
const rawDiseases = await fetchCategory("disease");
const rawCurses = await fetchCategory("curse");

const traitsByName = new Map();
for (const entry of rawTraits) {
  const key = traitKey(entry);
  const current = traitsByName.get(key);
  if (!current || newestFirst(entry, current) < 0) traitsByName.set(key, entry);
}

const afflictionsByKey = new Map();
for (const entry of [...rawDiseases, ...rawCurses]) {
  const key = afflictionKey(entry);
  const current = afflictionsByKey.get(key);
  if (!current || newestFirst(entry, current) < 0) afflictionsByKey.set(key, entry);
}

const traits = [...traitsByName.values()]
  .map((entry) => ({
    id: `trait:${entry.id}`,
    name: entry.name,
    type: "trait",
    group: Array.isArray(entry.trait_group) ? entry.trait_group : [],
    rarity: entry.rarity ?? "common",
    traits: Array.isArray(entry.trait_raw) ? entry.trait_raw : [],
    description: markdownToHtml(stripSource(entry.markdown)),
    source: entry.primary_source ?? "Unknown",
    license: "ORC",
    remaster: true,
    playtest: false,
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

const afflictions = [...afflictionsByKey.values()]
  .map((entry) => {
    const category = entry.category === "curse" ? "curse" : "disease";
    const description = stripSource(entry.markdown);
    const savingThrow = cleanText(entry.saving_throw);
    return {
      id: `aff:${entry.id}`,
      name: entry.name,
      type: "affliction",
      category,
      level: Number(entry.level ?? 0),
      rarity: entry.rarity ?? "common",
      traits: Array.isArray(entry.trait_raw) ? entry.trait_raw : [],
      description: markdownToHtml(description),
      savingThrow: /DC\s*-1\b/i.test(savingThrow) ? "" : savingThrow,
      onset: cleanText(entry.onset_raw),
      stages: Array.isArray(entry.stage) ? entry.stage.map(cleanText) : [],
      usage: cleanText(entry.usage),
      source: entry.primary_source ?? "Unknown",
      license: "ORC",
      remaster: true,
      playtest: false,
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

function write(name, data) {
  fs.writeFileSync(path.join(OUT, name), JSON.stringify(data));
  console.log(`${name}: ${data.length}`);
}

write("traits.json", traits);
write("afflictions.json", afflictions);

const manifestPath = path.join(OUT, "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
manifest.count.traits = traits.length;
manifest.count.afflictions = afflictions.length;
manifest.aonSource = {
  generatedAt: new Date().toISOString(),
  url: "https://2e.aonprd.com",
  counts: { traits: traits.length, afflictions: afflictions.length },
};
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`Updated ${manifestPath}`);
