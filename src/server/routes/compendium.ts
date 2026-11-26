import type { FastifyInstance } from "fastify";
import {
  classes,
  compendiumCounts,
  deities,
  equipment,
  feats,
  compendiumEntry,
  globalSearch,
  lookupItem,
  monsters,
  searchActions,
  searchAncestries,
  searchBackgrounds,
  searchClasses,
  searchClassFeatures,
  searchConditions,
  searchDeities,
  searchDomains,
  searchEquipment,
  searchFeats,
  searchHeritages,
  searchMonsters,
  searchSpells,
  searchHazards,
  searchVehicles,
  searchFamiliarAbilities,
  searchBoonsAndCurses,
  searchTraits,
  searchAfflictions,
  spells,
  type SearchOptions,
} from "../compendium";
import { isCompendiumEntryKind } from "../../shared/compendium";

function csv(value: unknown): string[] | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function bool(value: unknown, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (typeof value === "boolean") return value;
  return value === "1" || value === "true" || value === "yes";
}

function num(value: unknown): number | undefined {
  if (value === undefined || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function parseSearch(query: Record<string, unknown>): SearchOptions {
  return {
    q: typeof query.q === "string" ? query.q : undefined,
    limit: num(query.limit),
    offset: num(query.offset),
    levelMin: num(query.levelMin),
    levelMax: num(query.levelMax),
    category: csv(query.category),
    traits: csv(query.trait),
    allTraits: csv(query.traitAll),
    rarity: csv(query.rarity),
    includeLegacy: bool(query.legacy, true),
    coreOnly: bool(query.core, false),
    recommended: bool(query.recommended, false),
    type: csv(query.type),
    subcategory: csv(query.subcategory),
    usage: csv(query.usage),
    runeOnly: query.runeOnly === undefined ? undefined : bool(query.runeOnly, false),
    ritual: query.ritual === undefined ? undefined : bool(query.ritual, false),
  };
}

export async function registerCompendiumRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/compendium/meta", async (_request, reply) => {
    return reply.send({ counts: compendiumCounts });
  });

  app.get("/api/compendium/ancestries", async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    return reply.send(searchAncestries(parseSearch(query)));
  });

  app.get("/api/compendium/heritages", async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    const ancestry = typeof query.ancestry === "string" ? query.ancestry : undefined;
    return reply.send(searchHeritages({ ...parseSearch(query), ancestry }));
  });

  app.get("/api/compendium/backgrounds", async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    return reply.send(searchBackgrounds(parseSearch(query)));
  });

  app.get("/api/compendium/classes", async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    return reply.send(searchClasses(parseSearch(query)));
  });

  app.get("/api/compendium/class-features", async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    return reply.send(searchClassFeatures(parseSearch(query)));
  });

  app.get("/api/compendium/classes/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const item = classes.find((cls) => cls.id === id);
    if (!item) return reply.code(404).send({ error: "Class not found." });
    return reply.send({ item });
  });

  app.get("/api/compendium/feats", async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    const result = searchFeats(parseSearch(query));
    return reply.send(result);
  });

  app.get("/api/compendium/feats/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const item = feats.find((feat) => feat.id === id);
    if (!item) return reply.code(404).send({ error: "Feat not found." });
    return reply.send({ item });
  });

  app.get("/api/compendium/spells", async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    const opts = parseSearch(query);
    const result = searchSpells({
      ...opts,
      rank: num(query.rank),
      rankMin: num(query.rankMin),
      rankMax: num(query.rankMax),
      tradition: typeof query.tradition === "string" ? query.tradition : undefined,
    });
    return reply.send(result);
  });

  app.get("/api/compendium/spells/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const item = spells.find((spell) => spell.id === id);
    if (!item) return reply.code(404).send({ error: "Spell not found." });
    return reply.send({ item });
  });

  app.get("/api/compendium/equipment", async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    const result = searchEquipment(parseSearch(query));
    return reply.send(result);
  });

  app.get("/api/compendium/equipment/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const item = equipment.find((entry) => entry.id === id);
    if (!item) return reply.code(404).send({ error: "Item not found." });
    return reply.send({ item });
  });

  app.get("/api/compendium/deities", async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    const result = searchDeities(
      typeof query.q === "string" ? query.q : undefined,
      num(query.limit) ?? 500
    );
    return reply.send(result);
  });

  app.get("/api/compendium/domains", async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    const result = searchDomains(
      typeof query.q === "string" ? query.q : undefined,
      num(query.limit) ?? 200
    );
    return reply.send(result);
  });

  app.get("/api/compendium/conditions", async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    return reply.send(searchConditions(parseSearch(query)));
  });

  app.get("/api/compendium/actions", async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    return reply.send(searchActions(parseSearch(query)));
  });

  app.get("/api/compendium/hazards", async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    return reply.send(searchHazards(parseSearch(query)));
  });

  app.get("/api/compendium/vehicles", async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    return reply.send(searchVehicles(parseSearch(query)));
  });

  app.get("/api/compendium/familiar-abilities", async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    return reply.send(searchFamiliarAbilities(parseSearch(query)));
  });

  app.get("/api/compendium/boons-and-curses", async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    return reply.send(searchBoonsAndCurses(parseSearch(query)));
  });

  app.get("/api/compendium/traits", async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    return reply.send(searchTraits(parseSearch(query)));
  });

  app.get("/api/compendium/afflictions", async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    return reply.send(searchAfflictions(parseSearch(query)));
  });

  app.get("/api/compendium/monsters", async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    const result = searchMonsters(parseSearch(query));
    return reply.send(result);
  });

  app.get("/api/compendium/monsters/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const item = monsters.find((monster) => monster.id === id);
    if (!item) return reply.code(404).send({ error: "Monster not found." });
    return reply.send({ item });
  });

  app.get("/api/compendium/search", async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    const q = typeof query.q === "string" ? query.q : "";
    const kinds = csv(query.kind)?.filter(isCompendiumEntryKind);
    return reply.send(globalSearch(q, num(query.limit) ?? 48, kinds));
  });

  app.get("/api/compendium/entries/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const item = compendiumEntry(id);
    if (!item) return reply.code(404).send({ error: "Compendium entry not found." });
    return reply.send({ item });
  });

  app.post("/api/compendium/lookup", async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const ids = Array.isArray(body.ids)
      ? body.ids.filter((id): id is string => typeof id === "string")
      : [];
    if (ids.length > 500) return reply.code(400).send({ error: "Too many items requested." });
    return reply.send({
      items: ids.map((id) => lookupItem(id)).filter(Boolean),
    });
  });
}
