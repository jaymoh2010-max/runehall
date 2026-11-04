import type { FastifyInstance } from "fastify";
import {
  actions,
  ancestries,
  backgrounds,
  classes,
  compendiumCounts,
  conditions,
  deities,
  equipment,
  feats,
  compendiumEntry,
  globalSearch,
  heritages,
  lookupItem,
  monsters,
  searchDeities,
  searchEquipment,
  searchFeats,
  searchMonsters,
  searchSpells,
  spells,
  type SearchOptions,
} from "../compendium";
import { isCompendiumEntryKind } from "../../shared/compendium";

function csv(value: unknown): string[] | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  return value.split(",").map((part) => part.trim()).filter(Boolean);
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
    usage: csv(query.usage),
  };
}

export async function registerCompendiumRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/compendium/meta", async (_request, reply) => {
    return reply.send({ counts: compendiumCounts });
  });

  app.get("/api/compendium/ancestries", async (_request, reply) => {
    return reply.send({ items: ancestries });
  });

  app.get("/api/compendium/heritages", async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    const ancestry = typeof query.ancestry === "string" ? query.ancestry.toLowerCase() : "";
    const q = typeof query.q === "string" ? query.q.toLowerCase() : "";
    const items = heritages.filter((heritage) => {
      if (
        ancestry &&
        !heritage.versatile &&
        heritage.ancestrySlug.toLowerCase() !== ancestry &&
        heritage.ancestry.toLowerCase() !== ancestry
      ) {
        return false;
      }
      if (q && !heritage.name.toLowerCase().includes(q)) return false;
      return true;
    });
    return reply.send({ items });
  });

  app.get("/api/compendium/backgrounds", async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    const q = typeof query.q === "string" ? query.q.toLowerCase() : "";
    const legacy = bool(query.legacy, true);
    const items = backgrounds.filter((background) => {
      if (!legacy && !background.remaster) return false;
      if (q && !`${background.name} ${background.traits.join(" ")} ${background.source}`.toLowerCase().includes(q)) return false;
      return true;
    });
    return reply.send({ items });
  });

  app.get("/api/compendium/classes", async (_request, reply) => {
    return reply.send({ items: classes });
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
    const result = searchDeities(typeof query.q === "string" ? query.q : undefined, num(query.limit) ?? 500);
    return reply.send(result);
  });

  app.get("/api/compendium/conditions", async (_request, reply) => {
    return reply.send({ items: conditions });
  });

  app.get("/api/compendium/actions", async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    const q = typeof query.q === "string" ? query.q.toLowerCase() : "";
    return reply.send({
      items: actions.filter((action) => !q || action.name.toLowerCase().includes(q)),
    });
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
    const ids = Array.isArray(body.ids) ? body.ids.filter((id): id is string => typeof id === "string") : [];
    if (ids.length > 500) return reply.code(400).send({ error: "Too many items requested." });
    return reply.send({
      items: ids
        .map((id) => lookupItem(id))
        .filter(Boolean),
    });
  });
}
