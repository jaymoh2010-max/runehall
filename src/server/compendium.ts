import fs from "node:fs";
import path from "node:path";
import type {
  ActionRef,
  Ancestry,
  Background,
  CharacterContext,
  CharacterDraft,
  ClassChoiceGroup,
  ClassData,
  ClassFeature,
  ConditionRef,
  Deity,
  Equipment,
  Feat,
  Heritage,
  Monster,
  Spell,
} from "../shared/types";
import type { DomainEntry } from "../shared/domains";
import { isCoreSource } from "../shared/content";
import { FEAT_GRANTS } from "../shared/effects";
import {
  featAllowedByHeritageGrant,
  heritageChosenFeatId,
  heritageFeatGrant,
} from "../shared/heritage";
import { selectedClassGrants } from "../shared/classGrants";
import {
  COMPENDIUM_KIND_ORDER,
  compendiumKindFromId,
  stripHtml,
  truncateText,
  type CompendiumEntryKind,
  type CompendiumSearchItem,
  type CompendiumSearchResponse,
} from "../shared/compendium";

const compendiumDir = path.resolve(process.env.COMPENDIUM_DIR || "data/compendium");

export interface CompendiumManifest {
  generatedAt?: string;
  source?: string;
  sourceCommit?: string;
  sourceDirty?: boolean;
  count?: Record<string, number>;
}

/** Version metadata written by the ingest script; safe defaults if absent. */
export const compendiumManifest: CompendiumManifest = (() => {
  const full = path.join(compendiumDir, "manifest.json");
  try {
    return JSON.parse(fs.readFileSync(full, "utf8")) as CompendiumManifest;
  } catch {
    return {};
  }
})();

function readArray<T>(file: string): T[] {
  const full = path.join(compendiumDir, file);
  if (!fs.existsSync(full)) {
    console.warn(`Compendium file missing: ${full}`);
    return [];
  }
  try {
    return JSON.parse(fs.readFileSync(full, "utf8")) as T[];
  } catch (error) {
    console.error(`Failed to read ${full}`, error);
    return [];
  }
}

export const ancestries = readArray<Ancestry>("ancestries.json");
export const heritages = readArray<Heritage>("heritages.json");
export const backgrounds = readArray<Background>("backgrounds.json");
export const classes = readArray<ClassData>("classes.json");
export const classFeatures = readArray<ClassFeature>("classFeatures.json");
export const feats = readArray<Feat>("feats.json");
export const spells = readArray<Spell>("spells.json");
export const equipment = readArray<Equipment>("equipment.json");
export const deities = readArray<Deity>("deities.json");
export const domains = readArray<DomainEntry>("domains.json");
export const conditions = readArray<ConditionRef>("conditions.json");
export const actions = readArray<ActionRef>("actions.json");
export const monsters = readArray<Monster>("monsters.json");

const maps = {
  ancestry: new Map(ancestries.map((item) => [item.id, item])),
  heritage: new Map(heritages.map((item) => [item.id, item])),
  background: new Map(backgrounds.map((item) => [item.id, item])),
  class: new Map(classes.map((item) => [item.id, item])),
  classFeature: new Map(classFeatures.map((item) => [item.id, item])),
  feat: new Map(feats.map((item) => [item.id, item])),
  spell: new Map(spells.map((item) => [item.id, item])),
  equipment: new Map(equipment.map((item) => [item.id, item])),
  deity: new Map(deities.map((item) => [item.id, item])),
  domain: new Map(domains.map((item) => [item.id, item])),
  condition: new Map(conditions.map((item) => [item.id, item])),
  action: new Map(actions.map((item) => [item.id, item])),
  monster: new Map(monsters.map((item) => [item.id, item])),
};

export function lookupItem(id: string): unknown | null {
  const kind = compendiumKindFromId(id);
  if (!kind) return null;
  const map = maps[kind as keyof typeof maps];
  return map?.get(id) ?? null;
}

// ---------------------------------------------------------------------------
// Search helpers
// ---------------------------------------------------------------------------
export interface SearchOptions {
  q?: string;
  limit?: number;
  offset?: number;
  levelMin?: number;
  levelMax?: number;
  category?: string[];
  traits?: string[];
  allTraits?: string[];
  rarity?: string[];
  includeLegacy?: boolean;
  coreOnly?: boolean;
  recommended?: boolean;
  type?: string[];
  subcategory?: string[];
  usage?: string[];
  ritual?: boolean;
}

function matchesText(text: string, q: string | undefined): boolean {
  if (!q) return true;
  return text.toLowerCase().includes(q.toLowerCase());
}

function searchScore(name: string, q: string | undefined): number {
  if (!q?.trim()) return 0;
  const normalized = name.toLowerCase();
  const query = q.toLowerCase().trim();
  if (normalized === query) return 0;
  if (normalized.startsWith(query)) return 1;
  if (normalized.split(/[^a-z0-9]+/).some((word) => word.startsWith(query))) return 2;
  if (normalized.includes(query)) return 3;
  return 4;
}

function sortByRelevance<T extends { name: string }>(
  items: T[],
  q: string | undefined,
  tieBreak: (a: T, b: T) => number
): T[] {
  return items.sort((a, b) => searchScore(a.name, q) - searchScore(b.name, q) || tieBreak(a, b));
}

function matchesTraits(itemTraits: string[], requested: string[] | undefined): boolean {
  if (!requested?.length) return true;
  return requested.some((trait) => itemTraits.includes(trait));
}

function paginate<T>(
  items: T[],
  opts: SearchOptions
): { items: T[]; total: number; next: number | null } {
  const total = items.length;
  const limit = Math.max(1, Math.min(200, Math.floor(opts.limit ?? 80)));
  const offset = Math.max(0, Math.floor(opts.offset ?? 0));
  return {
    items: items.slice(offset, offset + limit),
    total,
    next: offset + limit < total ? offset + limit : null,
  };
}

export function searchFeats(opts: SearchOptions) {
  const categories = opts.category?.filter(Boolean) ?? [];
  const traits = opts.traits?.filter(Boolean) ?? [];
  const rarities = opts.rarity?.filter(Boolean) ?? [];
  const filtered = feats.filter((feat) => {
    if (!opts.includeLegacy && !feat.remaster) return false;
    if (opts.coreOnly && !isCoreSource(feat.source)) return false;
    if (opts.recommended && (feat.rarity !== "common" || feat.playtest)) return false;
    if (opts.levelMin !== undefined && feat.level < opts.levelMin) return false;
    if (opts.levelMax !== undefined && feat.level > opts.levelMax) return false;
    if (categories.length && !categories.includes(feat.category)) return false;
    if (!matchesTraits(feat.traits, traits.length ? traits : undefined)) return false;
    if (rarities.length && !rarities.includes(feat.rarity)) return false;
    if (!matchesText(`${feat.name} ${feat.traits.join(" ")} ${feat.source}`, opts.q)) return false;
    return true;
  });
  sortByRelevance(filtered, opts.q, (a, b) => a.level - b.level || a.name.localeCompare(b.name));
  return paginate(filtered, opts);
}

export function searchSpells(
  opts: SearchOptions & { rank?: number; tradition?: string; rankMin?: number; rankMax?: number }
) {
  const traits = opts.traits?.filter(Boolean) ?? [];
  const wantsFocus = Boolean(opts.traits?.includes("focus") || opts.allTraits?.includes("focus"));
  const filtered = spells.filter((spell) => {
    if (!opts.includeLegacy && !spell.remaster) return false;
    if (opts.coreOnly && !isCoreSource(spell.source)) return false;
    if (opts.recommended && (spell.rarity !== "common" || spell.playtest)) return false;
    if (opts.ritual !== undefined && Boolean(spell.ritual) !== opts.ritual) return false;
    // Focus spells belong in the focus picker, not the ordinary spell list.
    if (opts.rank !== undefined && !wantsFocus && spell.traits.includes("focus")) return false;
    if (opts.rank !== undefined && spell.rank !== opts.rank) return false;
    if (opts.rankMin !== undefined && spell.rank < opts.rankMin) return false;
    if (opts.rankMax !== undefined && spell.rank > opts.rankMax) return false;
    if (
      opts.tradition &&
      !spell.traditions.includes(opts.tradition) &&
      !spell.traits.includes("focus")
    )
      return false;
    if (opts.levelMin !== undefined && spell.rank < opts.levelMin) return false;
    if (opts.levelMax !== undefined && spell.rank > opts.levelMax) return false;
    if (!matchesTraits(spell.traits, traits.length ? traits : undefined)) return false;
    if (opts.allTraits?.length && !opts.allTraits.every((trait) => spell.traits.includes(trait)))
      return false;
    if (
      !matchesText(`${spell.name} ${spell.traits.join(" ")} ${spell.traditions.join(" ")}`, opts.q)
    )
      return false;
    return true;
  });
  sortByRelevance(filtered, opts.q, (a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
  return paginate(filtered, opts);
}

function matchesUsage(itemUsage: string, requested: string): boolean {
  if (itemUsage === requested) return true;
  if (!itemUsage.startsWith("etched-onto")) return false;
  if (requested === "etched-onto-a-weapon") return /weapon/.test(itemUsage);
  if (requested === "etched-onto-armor") return /armor/.test(itemUsage);
  if (requested === "etched-onto-a-shield") return /shield/.test(itemUsage);
  return false;
}

export function searchEquipment(opts: SearchOptions) {
  const types = opts.type?.filter(Boolean) ?? [];
  const subcategories = opts.subcategory?.filter(Boolean) ?? [];
  const usages = opts.usage?.filter(Boolean) ?? [];
  const filtered = equipment.filter((item) => {
    if (!opts.includeLegacy && !item.remaster) return false;
    if (opts.coreOnly && !isCoreSource(item.source)) return false;
    if (opts.recommended && (item.rarity !== "common" || item.playtest)) return false;
    if (types.length && !types.includes(item.type)) return false;
    if (subcategories.length) {
      const subcategory =
        item.weapon?.category ?? item.armor?.category ?? item.consumable?.category;
      if (!subcategory || !subcategories.includes(subcategory)) return false;
    }
    if (usages.length && !usages.some((usage) => matchesUsage(item.usage, usage))) return false;
    if (opts.levelMin !== undefined && item.level < opts.levelMin) return false;
    if (opts.levelMax !== undefined && item.level > opts.levelMax) return false;
    if (opts.rarity?.length && !opts.rarity.includes(item.rarity)) return false;
    if (!matchesTraits(item.traits, opts.traits?.length ? opts.traits : undefined)) return false;
    if (!matchesText(`${item.name} ${item.traits.join(" ")} ${item.type} ${item.source}`, opts.q))
      return false;
    return true;
  });
  sortByRelevance(filtered, opts.q, (a, b) => a.level - b.level || a.name.localeCompare(b.name));
  return paginate(filtered, opts);
}

export function searchMonsters(opts: SearchOptions) {
  const filtered = monsters.filter((monster) => {
    if (opts.recommended && (monster.rarity !== "common" || monster.playtest)) return false;
    if (opts.levelMin !== undefined && monster.level < opts.levelMin) return false;
    if (opts.levelMax !== undefined && monster.level > opts.levelMax) return false;
    if (opts.rarity?.length && !opts.rarity.includes(monster.rarity)) return false;
    if (!matchesTraits(monster.traits, opts.traits?.length ? opts.traits : undefined)) return false;
    if (!matchesText(`${monster.name} ${monster.traits.join(" ")} ${monster.source}`, opts.q))
      return false;
    return true;
  });
  sortByRelevance(filtered, opts.q, (a, b) => a.level - b.level || a.name.localeCompare(b.name));
  return paginate(filtered, opts);
}

export function searchDeities(q?: string, limit = 80) {
  const filtered = deities.filter((deity) =>
    matchesText(`${deity.name} ${deity.traits.join(" ")} ${deity.source}`, q)
  );
  return {
    items: filtered.slice(0, Math.max(1, Math.min(500, limit))),
    total: filtered.length,
  };
}

export function searchDomains(q?: string, limit = 200) {
  const filtered = domains.filter((domain) =>
    matchesText(
      `${domain.name} ${domain.description} ${domain.deities.join(" ")} ${domain.alternateDeities.join(" ")} ${domain.pantheons.join(" ")}`,
      q
    )
  );
  return {
    items: filtered.slice(0, Math.max(1, Math.min(500, limit))),
    total: filtered.length,
  };
}

interface SearchCandidate {
  id: string;
  name: string;
  kind: CompendiumEntryKind;
  level: number | null;
  source: string;
  rarity: string;
  traits: string[];
  description: string;
  searchMeta: string;
  ritual?: boolean;
  gmDescription?: boolean;
}

const searchCandidates: SearchCandidate[] = (() => {
  const candidates: SearchCandidate[] = [];
  const add = (
    items: {
      id: string;
      name: string;
      source?: string;
      rarity?: string;
      traits?: string[];
      description?: string;
      ritual?: boolean;
      gmDescription?: boolean;
    }[],
    kind: CompendiumEntryKind,
    level: (item: never) => number | null
  ) => {
    for (const item of items) {
      candidates.push({
        id: item.id,
        name: item.name,
        kind,
        level: level(item as never),
        source: item.source ?? "",
        rarity: item.rarity ?? "common",
        traits: item.traits ?? [],
        description: stripHtml(item.description, 2000),
        searchMeta:
          `${item.name} ${(item.traits ?? []).join(" ")} ${item.source ?? ""}`.toLowerCase(),
        ritual: item.ritual,
        gmDescription: item.gmDescription,
      });
    }
  };

  add(ancestries, "ancestry", () => null);
  add(heritages, "heritage", () => null);
  add(backgrounds, "background", () => null);
  add(classes, "class", () => null);
  add(classFeatures, "classFeature", (item: ClassFeature) => item.level);
  add(feats, "feat", (item: Feat) => item.level);
  add(spells, "spell", (item: Spell) => item.rank);
  add(equipment, "equipment", (item: Equipment) => item.level);
  add(deities, "deity", () => null);
  add(domains, "domain", () => null);
  add(conditions, "condition", () => null);
  add(actions, "action", () => null);
  add(monsters, "monster", (item: Monster) => item.level);
  return candidates;
})();

function searchCandidateScore(candidate: SearchCandidate, query: string): number {
  const name = candidate.name.toLowerCase();
  if (name === query) return 0;
  if (name.startsWith(query)) return 1;

  const words = name.split(/[^a-z0-9]+/).filter(Boolean);
  if (words.some((word) => word.startsWith(query))) return 2;
  if (name.includes(query)) return 3;

  const tokens = query.split(/\s+/).filter(Boolean);
  if (tokens.length > 1 && tokens.every((token) => candidate.searchMeta.includes(token))) return 4;
  if (candidate.traits.some((trait) => trait.toLowerCase().includes(query))) return 4;
  if (candidate.source.toLowerCase().includes(query)) return 5;
  if (candidate.description.toLowerCase().includes(query)) return 6;
  return Number.POSITIVE_INFINITY;
}

/**
 * Search the entire compendium, not just one tab. Each entry type gets a fair
 * share of the first page so a broad query like "fire" surfaces spells, items,
 * creatures, and feats instead of letting one large category crowd out the rest.
 */
export function globalSearch(
  q: string,
  limit = 48,
  kinds?: CompendiumEntryKind[]
): CompendiumSearchResponse {
  const query = String(q || "")
    .trim()
    .toLowerCase();
  const safeLimit = Math.max(1, Math.min(200, Math.floor(limit)));
  if (!query) return { items: [], total: 0, counts: {} };

  const allowed = kinds?.length ? new Set(kinds) : null;
  const matches: { candidate: SearchCandidate; score: number }[] = [];
  const counts: Partial<Record<CompendiumEntryKind, number>> = {};

  for (const candidate of searchCandidates) {
    if (allowed && !allowed.has(candidate.kind)) continue;
    const score = searchCandidateScore(candidate, query);
    if (!Number.isFinite(score)) continue;
    matches.push({ candidate, score });
    counts[candidate.kind] = (counts[candidate.kind] ?? 0) + 1;
  }

  matches.sort(
    (a, b) =>
      a.score - b.score ||
      (a.candidate.level ?? 0) - (b.candidate.level ?? 0) ||
      a.candidate.name.localeCompare(b.candidate.name)
  );

  const perKind = Math.max(3, Math.ceil(safeLimit / COMPENDIUM_KIND_ORDER.length));
  const picked = new Map<string, { candidate: SearchCandidate; score: number }>();
  const perKindCount = new Map<CompendiumEntryKind, number>();

  for (const match of matches) {
    const used = perKindCount.get(match.candidate.kind) ?? 0;
    if (used >= perKind) continue;
    picked.set(match.candidate.id, match);
    perKindCount.set(match.candidate.kind, used + 1);
  }

  // Fill any remaining slots with the best matches that lost the per-kind
  // lottery. This keeps exact-name searches useful even when a single type
  // has many close matches.
  if (picked.size < safeLimit) {
    for (const match of matches) {
      if (picked.size >= safeLimit) break;
      picked.set(match.candidate.id, match);
    }
  }

  const items: CompendiumSearchItem[] = [...picked.values()]
    .sort(
      (a, b) =>
        a.score - b.score ||
        (a.candidate.level ?? 0) - (b.candidate.level ?? 0) ||
        a.candidate.name.localeCompare(b.candidate.name)
    )
    .slice(0, safeLimit)
    .map(({ candidate }) => ({
      id: candidate.id,
      name: candidate.name,
      kind: candidate.kind,
      level: candidate.level,
      source: candidate.source,
      rarity: candidate.rarity,
      summary: truncateText(candidate.description, 180),
      ritual: candidate.ritual,
      gmDescription: candidate.gmDescription,
    }));

  return { items, total: matches.length, counts };
}

export function compendiumEntry(id: string): unknown | null {
  return lookupItem(id);
}

// ---------------------------------------------------------------------------
// Character context
// ---------------------------------------------------------------------------
function featIdsFromDraft(draft: CharacterDraft): string[] {
  const ids = new Set<string>();
  for (const bucket of [
    draft.feats.ancestry,
    draft.feats.class,
    draft.feats.skill,
    draft.feats.general,
    draft.feats.freeArchetype,
  ]) {
    for (const id of Object.values(bucket)) if (id) ids.add(id);
  }
  for (const id of draft.feats.extras) ids.add(id);
  if (draft.backgroundFeat) ids.add(draft.backgroundFeat);
  return [...ids];
}

export function contextForDraft(
  draft: CharacterDraft,
  freeArchetype = false,
  automaticBonusProgression = false
): CharacterContext {
  const ancestry = draft.ancestryId ? (maps.ancestry.get(draft.ancestryId) ?? null) : null;
  const heritage = draft.heritageId ? (maps.heritage.get(draft.heritageId) ?? null) : null;
  const background = draft.backgroundId ? (maps.background.get(draft.backgroundId) ?? null) : null;
  const classData = draft.classId ? (maps.class.get(draft.classId) ?? null) : null;
  const deity = draft.deityId ? (maps.deity.get(draft.deityId) ?? null) : null;

  const featMap: Record<string, Feat> = {};
  for (const id of featIdsFromDraft(draft)) {
    const feat = maps.feat.get(id);
    if (feat) featMap[id] = feat;
  }
  for (const granted of background?.grantedFeats ?? []) {
    if (granted.id) {
      const feat = maps.feat.get(granted.id);
      if (feat) featMap[granted.id] = feat;
    }
  }
  for (const [grantId, grant] of Object.entries(FEAT_GRANTS)) {
    if (!featMap[grantId]) continue;
    const chosenId = draft.featChoices[grantId]?.[0];
    if (!chosenId) continue;
    const feat = maps.feat.get(chosenId);
    if (
      feat &&
      feat.id !== grantId &&
      feat.category === grant.category &&
      feat.level <= grant.level
    ) {
      featMap[feat.id] = feat;
    }
  }
  const heritageGrant = heritageFeatGrant(heritage);
  const heritageFeatId = heritageChosenFeatId(draft, heritage);
  const heritageFeat = heritageFeatId ? maps.feat.get(heritageFeatId) : null;
  if (
    heritageFeat &&
    heritageGrant &&
    featAllowedByHeritageGrant(heritageFeat, heritageGrant, classData?.name)
  ) {
    featMap[heritageFeat.id] = heritageFeat;
  }
  const classGrants = selectedClassGrants(draft, classData, deity);
  for (const granted of classGrants.feats) {
    const feat = maps.feat.get(granted.id);
    if (feat) featMap[feat.id] = feat;
  }

  const spellMap: Record<string, Spell> = {};
  for (const id of [
    ...draft.spells.cantrips,
    ...draft.spells.known,
    ...draft.spells.prepared,
    ...Object.values(draft.spells.preparedByRank ?? {}).flat(),
    ...draft.spells.focus,
    ...draft.spells.rituals,
    ...draft.spells.innate,
  ]) {
    const spell = maps.spell.get(id);
    if (spell) spellMap[id] = spell;
  }
  for (const granted of classGrants.spells) {
    const spell = maps.spell.get(granted.id);
    if (spell) spellMap[spell.id] = spell;
  }

  const equipmentMap: Record<string, Equipment> = {};
  for (const entry of draft.equipment) {
    const item = maps.equipment.get(entry.itemId);
    if (item) equipmentMap[item.id] = item;
    for (const runeId of entry.runes ?? []) {
      const rune = maps.equipment.get(runeId);
      if (rune) equipmentMap[rune.id] = rune;
    }
  }

  const monsterMap: Record<string, Monster> = {};
  for (const companion of draft.companions) {
    if (!companion.monsterId) continue;
    const monster = maps.monster.get(companion.monsterId);
    if (monster) monsterMap[monster.id] = monster;
  }

  return {
    ancestry,
    heritage,
    background,
    classData,
    deity,
    feats: featMap,
    spells: spellMap,
    equipment: equipmentMap,
    monsters: monsterMap,
    featNames,
    freeArchetype,
    automaticBonusProgression,
  };
}

export function allChoiceOptions(classData: ClassData | null): ClassChoiceGroup["options"] {
  if (!classData) return [];
  const seen = new Set<string>();
  const out: ClassChoiceGroup["options"] = [];
  for (const group of classData.choiceGroups) {
    for (const option of group.options) {
      if (seen.has(option.id)) continue;
      seen.add(option.id);
      out.push(option);
    }
  }
  return out;
}

export const featNames = feats.map((feat) => feat.name.toLowerCase());

export const compendiumCounts = {
  ancestries: ancestries.length,
  heritages: heritages.length,
  backgrounds: backgrounds.length,
  classes: classes.length,
  feats: feats.length,
  spells: spells.length,
  equipment: equipment.length,
  deities: deities.length,
  domains: domains.length,
  conditions: conditions.length,
  actions: actions.length,
  monsters: monsters.length,
};
