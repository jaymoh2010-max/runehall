import type { FastifyInstance } from "fastify";
import { getCampaign, getMembership } from "../access";
import { db, type CampaignClockRow } from "../db";
import { logAudit } from "../audit";
import type { CampaignClock } from "../../shared/types";
import { clockIsComplete, normalizeClockFilled, normalizeClockSegments } from "../../shared/clocks";
import { newId, now, safeInt, safeString, sanitizeUserText } from "../util";

function serializeClock(row: CampaignClockRow): CampaignClock {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    name: row.name,
    description: row.description,
    segments: row.segments,
    filled: row.filled,
    visible: Boolean(row.visible),
    playerEditable: Boolean(row.player_editable),
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function roleFor(campaignId: string, userId: string): "gm" | "player" | null {
  const campaign = getCampaign(campaignId);
  if (!campaign) return null;
  if (campaign.gm_id === userId) return "gm";
  return getMembership(campaignId, userId)?.role ?? null;
}

function clockRow(campaignId: string, clockId: string): CampaignClockRow | null {
  return (
    (db
      .prepare("SELECT * FROM campaign_clocks WHERE id = ? AND campaign_id = ?")
      .get(clockId, campaignId) as CampaignClockRow | undefined) ?? null
  );
}

function notifyClock(app: FastifyInstance, row: CampaignClockRow): void {
  app.broadcastCampaign(
    row.campaign_id,
    "clocks:changed",
    { campaignId: row.campaign_id },
    row.visible ? "all" : "gm"
  );
}

export async function registerClockRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/campaigns/:id/clocks", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const { id } = request.params as { id: string };
    const role = roleFor(id, request.user.id);
    if (!role) return reply.code(403).send({ error: "You're not a member of that campaign." });
    const rows = db
      .prepare(
        role === "gm"
          ? "SELECT * FROM campaign_clocks WHERE campaign_id = ? ORDER BY sort_order ASC, created_at ASC"
          : "SELECT * FROM campaign_clocks WHERE campaign_id = ? AND visible = 1 ORDER BY sort_order ASC, created_at ASC"
      )
      .all(id) as CampaignClockRow[];
    return reply.send({ clocks: rows.map(serializeClock) });
  });

  app.post("/api/campaigns/:id/clocks", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const { id } = request.params as { id: string };
    if (roleFor(id, request.user.id) !== "gm") {
      return reply.code(403).send({ error: "Only the GM can create clocks." });
    }
    const body = (request.body ?? {}) as Record<string, unknown>;
    const name = safeString(body.name, "", 80);
    if (!name) return reply.code(400).send({ error: "Give the clock a name." });
    const segments = normalizeClockSegments(body.segments);
    const maxOrder = db
      .prepare(
        "SELECT COALESCE(MAX(sort_order), -1) AS value FROM campaign_clocks WHERE campaign_id = ?"
      )
      .get(id) as { value: number };
    const ts = now();
    const clockId = newId("clock");
    db.prepare(
      `INSERT INTO campaign_clocks
       (id, campaign_id, name, description, segments, filled, visible, player_editable, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`
    ).run(
      clockId,
      id,
      name,
      sanitizeUserText(body.description, 500),
      segments,
      body.visible === false ? 0 : 1,
      body.playerEditable === true ? 1 : 0,
      Number(maxOrder?.value ?? -1) + 1,
      ts,
      ts
    );
    const row = clockRow(id, clockId)!;
    logAudit({
      action: "campaign.clock.create",
      actor: request.user,
      targetType: "campaign_clock",
      targetId: clockId,
      detail: `${name} (${segments} segments)`,
      request,
    });
    notifyClock(app, row);
    return reply.code(201).send({ clock: serializeClock(row) });
  });

  app.put("/api/campaigns/:id/clocks/:clockId", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const { id, clockId } = request.params as { id: string; clockId: string };
    if (roleFor(id, request.user.id) !== "gm") {
      return reply.code(403).send({ error: "Only the GM can edit clocks." });
    }
    const existing = clockRow(id, clockId);
    if (!existing) return reply.code(404).send({ error: "Clock not found." });
    const body = (request.body ?? {}) as Record<string, unknown>;
    const name = body.name === undefined ? existing.name : safeString(body.name, existing.name, 80);
    if (!name) return reply.code(400).send({ error: "Give the clock a name." });
    const segments =
      body.segments === undefined ? existing.segments : normalizeClockSegments(body.segments);
    const filled =
      body.filled === undefined
        ? normalizeClockFilled(existing.filled, segments)
        : normalizeClockFilled(body.filled, segments);
    db.prepare(
      `UPDATE campaign_clocks
       SET name = ?, description = ?, segments = ?, filled = ?, visible = ?, player_editable = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      name,
      body.description === undefined
        ? existing.description
        : sanitizeUserText(body.description, 500),
      segments,
      filled,
      body.visible === undefined ? existing.visible : body.visible === false ? 0 : 1,
      body.playerEditable === undefined
        ? existing.player_editable
        : body.playerEditable === true
          ? 1
          : 0,
      now(),
      clockId
    );
    const row = clockRow(id, clockId)!;
    logAudit({
      action: "campaign.clock.update",
      actor: request.user,
      targetType: "campaign_clock",
      targetId: clockId,
      detail: `${row.name}: ${row.filled}/${row.segments}`,
      request,
    });
    notifyClock(app, row);
    return reply.send({ clock: serializeClock(row) });
  });

  app.post("/api/campaigns/:id/clocks/:clockId/tick", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const { id, clockId } = request.params as { id: string; clockId: string };
    const role = roleFor(id, request.user.id);
    if (!role) return reply.code(403).send({ error: "You're not a member of that campaign." });
    const existing = clockRow(id, clockId);
    if (!existing) return reply.code(404).send({ error: "Clock not found." });
    const canTick =
      role === "gm" || (Boolean(existing.visible) && Boolean(existing.player_editable));
    if (!canTick) {
      return reply.code(403).send({ error: "Only the GM can advance this clock." });
    }
    const body = (request.body ?? {}) as Record<string, unknown>;
    const delta = safeInt(body.delta, 1, -12, 12);
    const filled = normalizeClockFilled(existing.filled + delta, existing.segments);
    db.prepare("UPDATE campaign_clocks SET filled = ?, updated_at = ? WHERE id = ?").run(
      filled,
      now(),
      clockId
    );
    const row = clockRow(id, clockId)!;
    notifyClock(app, row);
    return reply.send({
      clock: serializeClock(row),
      complete: clockIsComplete(row.filled, row.segments),
    });
  });

  app.delete("/api/campaigns/:id/clocks/:clockId", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const { id, clockId } = request.params as { id: string; clockId: string };
    if (roleFor(id, request.user.id) !== "gm") {
      return reply.code(403).send({ error: "Only the GM can delete clocks." });
    }
    const existing = clockRow(id, clockId);
    if (!existing) return reply.code(404).send({ error: "Clock not found." });
    db.prepare("DELETE FROM campaign_clocks WHERE id = ? AND campaign_id = ?").run(clockId, id);
    logAudit({
      action: "campaign.clock.delete",
      actor: request.user,
      targetType: "campaign_clock",
      targetId: clockId,
      detail: existing.name,
      request,
    });
    notifyClock(app, existing);
    return reply.send({ ok: true });
  });
}
