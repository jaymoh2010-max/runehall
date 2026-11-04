import type { FastifyInstance } from "fastify";
import { getCampaign, getCampaignRole } from "../access";
import { db, type CampaignNpcRow, type SceneRow, type TokenRow } from "../db";
import { serializeCampaignNpc, serializeToken, touchCampaign } from "../serialize";
import { clamp, newId, now, safeInt, safeString, sanitizeUserText } from "../util";

function gmCampaign(
  request: { user: { id: string } | null },
  campaignId: string,
): { row: ReturnType<typeof getCampaign>; error?: string; code?: number } {
  if (!request.user) return { row: null, error: "Sign in to continue.", code: 401 };
  const row = getCampaign(campaignId);
  if (!row) return { row: null, error: "Campaign not found.", code: 404 };
  if (getCampaignRole(campaignId, request.user.id) !== "gm") {
    return { row: null, error: "Only the GM can manage NPCs.", code: 403 };
  }
  return { row };
}

function getNpc(campaignId: string, npcId: string): CampaignNpcRow | null {
  return (
    (db
      .prepare("SELECT * FROM campaign_npcs WHERE id = ? AND campaign_id = ?")
      .get(npcId, campaignId) as CampaignNpcRow | undefined) ?? null
  );
}

function imageUrl(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string") return null;
  const url = value.trim();
  return /^\/uploads\/[A-Za-z0-9._-]+$/.test(url) ? url : null;
}

function nextSortOrder(campaignId: string): number {
  const row = db
    .prepare("SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM campaign_npcs WHERE campaign_id = ?")
    .get(campaignId) as { next: number };
  return row.next;
}

function sceneBelongs(sceneId: string, campaignId: string): SceneRow | null {
  return (
    (db
      .prepare("SELECT * FROM scenes WHERE id = ? AND campaign_id = ?")
      .get(sceneId, campaignId) as SceneRow | undefined) ?? null
  );
}

function activeScene(campaignId: string): SceneRow | null {
  const state = db
    .prepare("SELECT active_scene_id FROM campaign_state WHERE campaign_id = ?")
    .get(campaignId) as { active_scene_id: string | null } | undefined;
  const requested = state?.active_scene_id ? sceneBelongs(state.active_scene_id, campaignId) : null;
  return (
    requested ??
    (db
      .prepare("SELECT * FROM scenes WHERE campaign_id = ? ORDER BY sort_order ASC, created_at ASC LIMIT 1")
      .get(campaignId) as SceneRow | undefined) ??
    null
  );
}

export async function registerNpcRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/campaigns/:id/npcs", async (request, reply) => {
    const { id } = request.params as { id: string };
    const access = gmCampaign(request, id);
    if (!access.row) return reply.code(access.code ?? 403).send({ error: access.error });
    const rows = db
      .prepare("SELECT * FROM campaign_npcs WHERE campaign_id = ? ORDER BY sort_order ASC, name ASC")
      .all(id) as CampaignNpcRow[];
    return reply.send({ npcs: rows.map(serializeCampaignNpc) });
  });

  app.post("/api/campaigns/:id/npcs", async (request, reply) => {
    const { id } = request.params as { id: string };
    const access = gmCampaign(request, id);
    if (!access.row) return reply.code(access.code ?? 403).send({ error: access.error });
    const body = (request.body ?? {}) as Record<string, unknown>;
    const name = safeString(body.name, "", 120);
    if (!name) return reply.code(400).send({ error: "Give the NPC a name." });
    const npcId = newId("npc");
    const ts = now();
    db.prepare(
      `INSERT INTO campaign_npcs
        (id, campaign_id, name, level, hp, ac, perception, size, color, image_url, description, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      npcId,
      id,
      name,
      clamp(safeInt(body.level, 1, -1, 30), -1, 30),
      body.hp === undefined || body.hp === null ? null : safeInt(body.hp, 0, 0, 1_000_000),
      body.ac === undefined || body.ac === null ? null : safeInt(body.ac, 0, -100, 1000),
      body.perception === undefined || body.perception === null
        ? null
        : safeInt(body.perception, 0, -100, 1000),
      clamp(safeInt(body.size, 1, 1, 6), 1, 6),
      safeString(body.color, "#b06767", 30),
      imageUrl(body.imageUrl) ?? null,
      sanitizeUserText(body.description, 20_000),
      nextSortOrder(id),
      ts,
      ts,
    );
    touchCampaign(id);
    return reply
      .code(201)
      .send({ npc: serializeCampaignNpc(getNpc(id, npcId)!) });
  });

  app.patch("/api/campaigns/:id/npcs/:npcId", async (request, reply) => {
    const { id, npcId } = request.params as { id: string; npcId: string };
    const access = gmCampaign(request, id);
    if (!access.row) return reply.code(access.code ?? 403).send({ error: access.error });
    const existing = getNpc(id, npcId);
    if (!existing) return reply.code(404).send({ error: "NPC not found." });
    const body = (request.body ?? {}) as Record<string, unknown>;
    const name = body.name === undefined ? existing.name : safeString(body.name, existing.name, 120);
    if (!name) return reply.code(400).send({ error: "Give the NPC a name." });
    const nextImage = imageUrl(body.imageUrl);
    db.prepare(
      `UPDATE campaign_npcs
       SET name = ?, level = ?, hp = ?, ac = ?, perception = ?, size = ?, color = ?,
           image_url = ?, description = ?, updated_at = ?
       WHERE id = ?`,
    ).run(
      name,
      body.level === undefined
        ? existing.level
        : clamp(safeInt(body.level, existing.level, -1, 30), -1, 30),
      body.hp === undefined
        ? existing.hp
        : body.hp === null
          ? null
          : safeInt(body.hp, 0, 0, 1_000_000),
      body.ac === undefined
        ? existing.ac
        : body.ac === null
          ? null
          : safeInt(body.ac, 0, -100, 1000),
      body.perception === undefined
        ? existing.perception
        : body.perception === null
          ? null
          : safeInt(body.perception, 0, -100, 1000),
      body.size === undefined
        ? existing.size
        : clamp(safeInt(body.size, existing.size, 1, 6), 1, 6),
      body.color === undefined ? existing.color : safeString(body.color, existing.color, 30),
      nextImage === undefined ? existing.image_url : nextImage,
      body.description === undefined
        ? existing.description
        : sanitizeUserText(body.description, 20_000),
      now(),
      npcId,
    );
    touchCampaign(id);
    return reply.send({ npc: serializeCampaignNpc(getNpc(id, npcId)!) });
  });

  app.delete("/api/campaigns/:id/npcs/:npcId", async (request, reply) => {
    const { id, npcId } = request.params as { id: string; npcId: string };
    const access = gmCampaign(request, id);
    if (!access.row) return reply.code(access.code ?? 403).send({ error: access.error });
    if (!getNpc(id, npcId)) return reply.code(404).send({ error: "NPC not found." });
    db.prepare("DELETE FROM campaign_npcs WHERE id = ?").run(npcId);
    touchCampaign(id);
    return reply.send({ ok: true });
  });

  app.post("/api/campaigns/:id/npcs/:npcId/token", async (request, reply) => {
    const { id, npcId } = request.params as { id: string; npcId: string };
    const access = gmCampaign(request, id);
    if (!access.row) return reply.code(access.code ?? 403).send({ error: access.error });
    const npc = getNpc(id, npcId);
    if (!npc) return reply.code(404).send({ error: "NPC not found." });
    const body = (request.body ?? {}) as Record<string, unknown>;
    const requestedScene = typeof body.sceneId === "string" && body.sceneId
      ? sceneBelongs(body.sceneId, id)
      : null;
    const scene = requestedScene ?? activeScene(id);
    if (!scene) return reply.code(400).send({ error: "Create a scene before placing an NPC token." });

    const tokenId = newId("tok");
    const ts = now();
    db.prepare(
      `INSERT INTO tokens
        (id, scene_id, name, image_url, character_id, owner_id, x, y, size, color, hp_current, hp_max, ac, initiative_bonus, group_id, group_name, conditions, hidden, locked, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, '[]', 0, 0, ?, ?, ?)`,
    ).run(
      tokenId,
      scene.id,
      npc.name,
      npc.image_url,
      Math.round(scene.width / 2),
      Math.round(scene.height / 2),
      npc.size,
      npc.color,
      npc.hp,
      npc.hp,
      npc.ac,
      npc.perception,
      Date.now(),
      ts,
      ts,
    );
    const token = db.prepare("SELECT * FROM tokens WHERE id = ?").get(tokenId) as TokenRow;
    app.broadcastCampaign(id, "token:created", serializeToken(token));
    touchCampaign(id);
    return reply.code(201).send({ token: serializeToken(token), sceneId: scene.id });
  });
}
