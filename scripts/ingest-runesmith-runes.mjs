#!/usr/bin/env node
/**
 * Build the Runesmith rune compendium from the Archives of Nethys rune list.
 *
 * Usage:
 *   node scripts/ingest-runesmith-runes.mjs [--source path/to/RunesmithRunes.html]
 *
 * The checked-in JSON is the source of truth for the app. Re-run this script
 * after a data update and review the diff before committing it.
 */
import fs from "node:fs";
import path from "node:path";
import sanitizeHtml from "sanitize-html";

const RUNE_URL = "https://2e.aonprd.com/RunesmithRunes.aspx";
const OUT = path.resolve("data", "compendium", "runes.json");
const MANIFEST = path.resolve("data", "compendium", "manifest.json");

const args = process.argv.slice(2);
const sourceArg = args.indexOf("--source");
const sourcePath = sourceArg >= 0 ? path.resolve(args[sourceArg + 1]) : null;

function clean(html) {
  if (!html) return "";
  const normalized = String(html)
    .replace(/<b(\s[^>]*)?>/gi, "<strong>")
    .replace(/<\/b>/gi, "</strong>")
    .replace(/<i(\s[^>]*)?>/gi, "<em>")
    .replace(/<\/i>/gi, "</em>");
  return sanitizeHtml(normalized, {
    allowedTags: ["p", "strong", "em", "ul", "ol", "li", "br"],
    allowedAttributes: {},
  })
    .replace(/\s+/g, " ")
    .replace(/>\s+</g, "><")
    .trim();
}

function plain(html) {
  return clean(html)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(name) {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseRunes(html) {
  const runes = [];
  const sections = html.split('<h2 class="title">').slice(1);
  for (const section of sections) {
    const idMatch = section.match(
      /RunesmithRunes\.aspx\?ID=(\d+)">\s*([^<]+)<\/a><span[^>]*>\s*Rune\s+(\d+)<\/span>/
    );
    if (!idMatch) continue;
    const aonId = Number(idMatch[1]);
    const name = idMatch[2].trim();
    const level = Number(idMatch[3]);

    const traits = [...section.matchAll(/<span class="trait"><a [^>]*>([^<]+)<\/a><\/span>/g)].map(
      (match) => match[1].trim()
    );

    const sourceMatch = section.match(/<b>Source<\/b>[\s\S]*?<i>([^<]+)<\/i>/);
    const sourceText = sourceMatch?.[1]?.trim() ?? "Impossible Magic";
    const pageMatch = sourceText.match(/pg\.\s*(\d+)/i);
    const sourcePage = pageMatch ? Number(pageMatch[1]) : null;

    const usageMatch = section.match(/<b>Usage<\/b>\s*([\s\S]*?)<hr\s*\/?>/i);
    const usage = plain(usageMatch?.[1] ?? "");

    const firstHr = section.search(/<hr\s*\/?>/i);
    const body = firstHr >= 0 ? section.slice(firstHr).replace(/^<hr\s*\/?>/i, "") : "";
    const invocationMatch = body.match(
      /<div class="subclass-feature[^"]*">[\s\S]*?<h2[^>]*>[\s\S]*?Invocation[\s\S]*?<\/h2>\s*<p class="subclass-feature-description">([\s\S]*?)<\/p>\s*<\/div>/i
    );
    const invocationStart = invocationMatch ? body.indexOf(invocationMatch[0]) : -1;
    const invocationEnd =
      invocationMatch && invocationStart >= 0 ? invocationStart + invocationMatch[0].length : -1;
    const beforeInvocation = invocationStart >= 0 ? body.slice(0, invocationStart) : body;
    const afterInvocation = invocationEnd >= 0 ? body.slice(invocationEnd) : "";

    const trailingIndex = beforeInvocation.search(/<hr\s*\/?>\s*<b>\s*(Level|Special)\b/i);
    const descriptionHtml =
      trailingIndex >= 0 ? beforeInvocation.slice(0, trailingIndex) : beforeInvocation;
    const trailingHtml =
      trailingIndex >= 0 ? beforeInvocation.slice(trailingIndex).replace(/^<hr\s*\/?>/i, "") : "";

    const remainder = `${trailingHtml} ${afterInvocation}`.trim();
    const specialMatch = remainder.match(/<b>\s*Special\b\s*<\/b>([\s\S]*)$/i);
    const special = specialMatch ? clean(specialMatch[1]) : "";
    const heightening = clean(remainder.replace(specialMatch?.[0] ?? "", ""));
    const invocation = invocationMatch ? clean(invocationMatch[1]) : "";

    runes.push({
      id: `rune:${slugify(name)}`,
      name,
      type: "rune",
      level,
      rarity: "common",
      traits,
      usage,
      source: "Pathfinder Impossible Magic",
      sourcePage,
      license: "ORC",
      remaster: true,
      playtest: false,
      diacritic: traits.some((trait) => trait.toLowerCase() === "diacritic"),
      description: clean(descriptionHtml),
      invocation,
      heightening,
      special,
      aonId,
    });
  }
  return runes;
}

async function main() {
  const html = sourcePath
    ? fs.readFileSync(sourcePath, "utf8")
    : await fetch(RUNE_URL).then((response) => {
        if (!response.ok) throw new Error(`AoN returned ${response.status}`);
        return response.text();
      });

  const runes = parseRunes(html);
  if (!runes.length) throw new Error("No runes parsed; the AoN page structure may have changed.");

  const ids = new Set();
  for (const rune of runes) {
    if (ids.has(rune.id)) throw new Error(`Duplicate rune id: ${rune.id}`);
    ids.add(rune.id);
    if (!rune.description) console.warn(`Missing description: ${rune.name}`);
  }

  runes.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  fs.writeFileSync(OUT, `${JSON.stringify(runes, null, 2)}\n`);
  if (fs.existsSync(MANIFEST)) {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
    manifest.count = { ...(manifest.count ?? {}), runes: runes.length };
    manifest.runesSource = {
      generatedAt: new Date().toISOString(),
      url: RUNE_URL,
      count: runes.length,
    };
    fs.writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  }
  console.log(`Wrote ${runes.length} Runesmith runes to ${OUT}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
