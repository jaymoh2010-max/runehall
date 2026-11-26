#!/usr/bin/env node
/**
 * Apply the curated compendium corrections to the generated JSON without
 * re-running the full Foundry ingest. This is useful for repairing a checkout
 * after an override is added; the ingest applies the same corrections when it
 * regenerates the files.
 */
import fs from "node:fs";
import path from "node:path";
import {
  ANCESTRY_OVERRIDES,
  BACKGROUND_OVERRIDES,
  DEITY_OVERRIDES,
  EQUIPMENT_OVERRIDES,
  SPELL_OVERRIDES,
  applyNameOverrides,
  normalizeDeityWeapons,
  normalizeMonsterAttackTypes,
} from "./compendium-overrides.mjs";

const OUT = path.resolve("data", "compendium");

function load(name) {
  return JSON.parse(fs.readFileSync(path.join(OUT, name), "utf8"));
}

function save(name, data) {
  fs.writeFileSync(path.join(OUT, name), JSON.stringify(data));
  console.log(`${name}: ${data.length} entries`);
}

save("ancestries.json", applyNameOverrides(load("ancestries.json"), ANCESTRY_OVERRIDES));
save("backgrounds.json", applyNameOverrides(load("backgrounds.json"), BACKGROUND_OVERRIDES));
save("spells.json", applyNameOverrides(load("spells.json"), SPELL_OVERRIDES));
const equipment = applyNameOverrides(load("equipment.json"), EQUIPMENT_OVERRIDES);
save("equipment.json", equipment);
save(
  "deities.json",
  applyNameOverrides(normalizeDeityWeapons(load("deities.json"), equipment), DEITY_OVERRIDES)
);
save("monsters.json", normalizeMonsterAttackTypes(load("monsters.json")));
