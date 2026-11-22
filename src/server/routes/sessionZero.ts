import type { FastifyInstance } from "fastify";
import { getCampaign, getCampaignRole } from "../access";
import {
  db,
  type CampaignSafetyPreferenceRow,
  type CampaignSessionZeroRow,
  type MessageRow,
} from "../db";
import {
  serializeCampaignSessionZero,
  serializeMessage,
  serializeSafetyPreference,
  serializeSafetyResponse,
  touchCampaign,
} from "../serialize";
import { broadcastCampaignSummary } from "../campaignEvents";
import { normalizeSessionZeroChecklist } from "../../shared/sessionZero";
import type { SafetyPreference, SessionZeroState } from "../../shared/types";
import { logAudit } from "../audit";
import { newId, now, parseJson, safeString, sanitizeUserText } from "../util";

function sessionZeroRow(campaignId: string): CampaignSessionZeroRow | null {
  return (
    (db.prepare("SELECT * FROM campaign_session_zero WHERE campaign_id = ?").get(campaignId) as
      CampaignSessionZeroRow | undefined) ?? null
  );
}

function preferenceRow(campaignId: string, userId: string): CampaignSafetyPreferenceRow | null {
  return (
    (db
      .prepare("SELECT * FROM campaign_safety_preferences WHERE campaign_id = ? AND user_id = ?")
      .get(campaignId, userId) as CampaignSafetyPreferenceRow | undefined) ?? null
  );
}

function sessionZeroState(campaignId: string, userId: string): SessionZeroState {
  const role = getCampaignRole(campaignId, userId);
  const isGm = role === "gm";
  const responses = isGm
    ? (
        db
          .prepare(
            `SELECT p.*, u.display_name AS author_name
             FROM campaign_safety_preferences p
             LEFT JOIN users u ON u.id = p.user_id
             WHERE p.campaign_id = ?
             ORDER BY p.updated_at DESC`
          )
          .all(campaignId) as (CampaignSafetyPreferenceRow & {
          author_name: string | null;
        })[]
      ).map((row, index) => serializeSafetyResponse(row, row.author_name, index))
    : [];
  return {
    profile: serializeCampaignSessionZero(sessionZeroRow(campaignId), campaignId, isGm),
    preference: serializeSafetyPreference(preferenceRow(campaignId, userId)),
    responses,
  };
}

export async function registerSessionZeroRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/campaigns/:id/session-zero", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const { id } = request.params as { id: string };
    const campaign = getCampaign(id);
    if (!campaign) return reply.code(404).send({ error: "Campaign not found." });
    if (!getCampaignRole(id, request.user.id)) {
      return reply.code(403).send({ error: "You are not a member of this campaign." });
    }
    return reply.send(sessionZeroState(id, request.user.id));
  });

  app.put("/api/campaigns/:id/session-zero", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const { id } = request.params as { id: string };
    const campaign = getCampaign(id);
    if (!campaign) return reply.code(404).send({ error: "Campaign not found." });
    if (getCampaignRole(id, request.user.id) !== "gm") {
      return reply.code(403).send({ error: "Only the GM can edit the session zero charter." });
    }
    const existing = sessionZeroRow(id);
    const body = (request.body ?? {}) as Record<string, unknown>;
    const text = (key: string, fallback: string, max: number) =>
      body[key] === undefined ? fallback : sanitizeUserText(body[key], max);
    const pitch = text("pitch", existing?.pitch ?? "", 20_000);
    const genre = safeString(body.genre, existing?.genre ?? "", 120);
    const tone = safeString(body.tone, existing?.tone ?? "", 200);
    const themes = text("themes", existing?.themes ?? "", 4_000);
    const expectations = text("expectations", existing?.expectations ?? "", 8_000);
    const houseRules = text("houseRules", existing?.house_rules ?? "", 8_000);
    const contentLimits = text("contentLimits", existing?.content_limits ?? "", 8_000);
    const safetyTools = text("safetyTools", existing?.safety_tools ?? "", 8_000);
    const gmNotes = text("gmNotes", existing?.gm_notes ?? "", 20_000);
    const checklist = normalizeSessionZeroChecklist(
      body.checklist === undefined ? parseJson(existing?.checklist, {}) : body.checklist
    );
    const ts = now();
    db.prepare(
      `INSERT INTO campaign_session_zero
         (campaign_id, pitch, genre, tone, themes, expectations, house_rules,
          content_limits, safety_tools, gm_notes, checklist, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(campaign_id) DO UPDATE SET
         pitch = excluded.pitch,
         genre = excluded.genre,
         tone = excluded.tone,
         themes = excluded.themes,
         expectations = excluded.expectations,
         house_rules = excluded.house_rules,
         content_limits = excluded.content_limits,
         safety_tools = excluded.safety_tools,
         gm_notes = excluded.gm_notes,
         checklist = excluded.checklist,
         updated_at = excluded.updated_at`
    ).run(
      id,
      pitch,
      genre,
      tone,
      themes,
      expectations,
      houseRules,
      contentLimits,
      safetyTools,
      gmNotes,
      JSON.stringify(checklist),
      ts,
      ts
    );
    touchCampaign(id);
    logAudit({
      action: "campaign.session_zero",
      actor: request.user,
      targetType: "campaign",
      targetId: id,
      detail: "Updated the session zero charter",
      request,
    });
    broadcastCampaignSummary(app, getCampaign(id)!);
    return reply.send(sessionZeroState(id, request.user.id));
  });

  app.put("/api/campaigns/:id/session-zero/preference", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const { id } = request.params as { id: string };
    const campaign = getCampaign(id);
    if (!campaign) return reply.code(404).send({ error: "Campaign not found." });
    if (!getCampaignRole(id, request.user.id)) {
      return reply.code(403).send({ error: "You are not a member of this campaign." });
    }
    const existing = preferenceRow(id, request.user.id);
    const body = (request.body ?? {}) as Record<string, unknown>;
    const lines =
      body.lines === undefined ? (existing?.lines ?? "") : sanitizeUserText(body.lines, 4_000);
    const veils =
      body.veils === undefined ? (existing?.veils ?? "") : sanitizeUserText(body.veils, 4_000);
    const notes =
      body.notes === undefined ? (existing?.notes ?? "") : sanitizeUserText(body.notes, 4_000);
    const anonymous =
      body.anonymous === undefined ? Boolean(existing?.anonymous) : body.anonymous === true;
    const ts = now();
    db.prepare(
      `INSERT INTO campaign_safety_preferences
         (campaign_id, user_id, lines, veils, notes, anonymous, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(campaign_id, user_id) DO UPDATE SET
         lines = excluded.lines,
         veils = excluded.veils,
         notes = excluded.notes,
         anonymous = excluded.anonymous,
         updated_at = excluded.updated_at`
    ).run(id, request.user.id, lines, veils, notes, anonymous ? 1 : 0, ts, ts);
    const preference: SafetyPreference = {
      lines,
      veils,
      notes,
      anonymous,
      updatedAt: ts,
    };
    return reply.send({ preference });
  });

  app.post("/api/campaigns/:id/session-zero/signal", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const { id } = request.params as { id: string };
    const campaign = getCampaign(id);
    if (!campaign) return reply.code(404).send({ error: "Campaign not found." });
    if (!getCampaignRole(id, request.user.id)) {
      return reply.code(403).send({ error: "You are not a member of this campaign." });
    }
    const body = (request.body ?? {}) as Record<string, unknown>;
    const note = body.note === undefined ? "" : sanitizeUserText(body.note, 500);
    const content = note
      ? `A player requested a safety pause: ${note}`
      : "A player requested a safety pause / X-card.";
    const messageId = newId("msg");
    const createdAt = now();
    db.prepare(
      `INSERT INTO messages
         (id, campaign_id, scene_id, user_id, author_name, type, content, data, visibility, created_at)
       VALUES (?, ?, NULL, NULL, ?, 'system', ?, NULL, 'gm', ?)`
    ).run(messageId, id, "Safety signal", content, createdAt);
    const row = db.prepare("SELECT * FROM messages WHERE id = ?").get(messageId) as MessageRow;
    const message = serializeMessage(row);
    app.broadcastCampaign(id, "chat:message", message, "gm");
    app.broadcastCampaign(id, "safety:signal", { message: content, createdAt }, "gm");
    return reply.send({ ok: true });
  });
}
