import type { FastifyInstance } from "fastify";
import { getCampaign, getCampaignRole } from "../access";
import {
  db,
  type CampaignDashboardRow,
  type JournalRow,
  type LootParcelRow,
  type MessageRow,
} from "../db";
import {
  serializeCampaignDashboard,
  serializeJournal,
  serializeLootParcel,
  serializeMessage,
  touchCampaign,
} from "../serialize";
import { campaignSessionsFor } from "../sessionData";
import { normalizeCampaignThreads } from "../../shared/dashboard";
import { buildSessionRecap } from "../../shared/recap";
import { now, parseJson, sanitizeUserText } from "../util";

function ensureDashboard(campaignId: string): CampaignDashboardRow {
  db.prepare(
    "INSERT OR IGNORE INTO campaign_dashboard (campaign_id, updated_at) VALUES (?, ?)",
  ).run(campaignId, now());
  return db
    .prepare("SELECT * FROM campaign_dashboard WHERE campaign_id = ?")
    .get(campaignId) as CampaignDashboardRow;
}

export async function registerDashboardRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/campaigns/:id/dashboard", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const { id } = request.params as { id: string };
    if (!getCampaign(id)) return reply.code(404).send({ error: "Campaign not found." });
    const role = getCampaignRole(id, request.user.id);
    if (!role) return reply.code(403).send({ error: "You're not a member of that campaign." });
    const row = ensureDashboard(id);
    return reply.send({ dashboard: serializeCampaignDashboard(row, role) });
  });

  app.get("/api/campaigns/:id/recap", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const { id } = request.params as { id: string };
    const campaign = getCampaign(id);
    if (!campaign) return reply.code(404).send({ error: "Campaign not found." });
    if (getCampaignRole(id, request.user.id) !== "gm") {
      return reply.code(403).send({ error: "Only the GM can generate a session recap." });
    }

    const query = (request.query ?? {}) as Record<string, unknown>;
    const toValue = typeof query.to === "string" ? Number(query.to) : NaN;
    const to = Number.isFinite(toValue) && toValue > 0 ? Math.round(toValue) : now();
    const sessions = campaignSessionsFor(id, "gm", request.user.id);
    const played = sessions.filter(
      (session) => session.status === "played" && session.scheduledAt <= to,
    );
    const session =
      played[played.length - 1] ??
      sessions.filter((entry) => entry.status === "played").slice(-1)[0] ??
      null;
    const fromValue = typeof query.from === "string" ? Number(query.from) : NaN;
    const from =
      Number.isFinite(fromValue) && fromValue > 0
        ? Math.round(fromValue)
        : session?.scheduledAt ?? to - 24 * 60 * 60 * 1000;
    if (from > to) {
      return reply.code(400).send({ error: "The recap window must start before it ends." });
    }

    const messageRows = db
      .prepare(
        `SELECT * FROM messages
         WHERE campaign_id = ? AND visibility = 'all' AND created_at BETWEEN ? AND ?
         ORDER BY created_at ASC LIMIT 2000`,
      )
      .all(id, from, to) as MessageRow[];
    const journalRows = db
      .prepare(
        `SELECT j.*, u.display_name AS author_name FROM journal_entries j
         LEFT JOIN users u ON u.id = j.created_by
         WHERE j.campaign_id = ? AND j.visible = 1 AND j.updated_at BETWEEN ? AND ?
         ORDER BY j.updated_at ASC LIMIT 500`,
      )
      .all(id, from, to) as (JournalRow & { author_name: string | null })[];
    const lootRows = db
      .prepare(
        `SELECT * FROM loot_parcels
         WHERE campaign_id = ? AND updated_at BETWEEN ? AND ?
         ORDER BY sort_order ASC, created_at ASC LIMIT 200`,
      )
      .all(id, from, to) as LootParcelRow[];
    const dashboardRow = db
      .prepare("SELECT * FROM campaign_dashboard WHERE campaign_id = ?")
      .get(id) as CampaignDashboardRow | undefined;
    const threads = normalizeCampaignThreads(parseJson(dashboardRow?.threads, []));

    const recap = buildSessionRecap({
      campaignId: id,
      campaignName: campaign.name,
      from,
      to,
      session,
      messages: messageRows.map(serializeMessage),
      journal: journalRows.map(serializeJournal),
      loot: lootRows.map(serializeLootParcel),
      threads,
    });
    return reply.send({ recap });
  });

  app.patch("/api/campaigns/:id/dashboard", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const { id } = request.params as { id: string };
    if (!getCampaign(id)) return reply.code(404).send({ error: "Campaign not found." });
    if (getCampaignRole(id, request.user.id) !== "gm") {
      return reply.code(403).send({ error: "Only the GM can edit the campaign dashboard." });
    }
    const existing = ensureDashboard(id);
    const body = (request.body ?? {}) as Record<string, unknown>;

    const lastSessionSummary =
      body.lastSessionSummary === undefined
        ? existing.last_session_summary
        : sanitizeUserText(body.lastSessionSummary, 20_000);
    const nextSessionTeaser =
      body.nextSessionTeaser === undefined
        ? existing.next_session_teaser
        : sanitizeUserText(body.nextSessionTeaser, 500);
    const nextSessionNotes =
      body.nextSessionNotes === undefined
        ? existing.next_session_notes
        : sanitizeUserText(body.nextSessionNotes, 20_000);

    let nextSessionAt = existing.next_session_at;
    if (body.nextSessionAt !== undefined) {
      if (body.nextSessionAt === null || body.nextSessionAt === "") {
        nextSessionAt = null;
      } else {
        const value = Number(body.nextSessionAt);
        if (!Number.isFinite(value) || value <= 0) {
          return reply.code(400).send({ error: "Choose a valid next-session date." });
        }
        nextSessionAt = Math.round(value);
      }
    }

    const threads =
      body.threads === undefined
        ? normalizeCampaignThreads(parseJson(existing.threads, []))
        : normalizeCampaignThreads(body.threads);

    db.prepare(
      `UPDATE campaign_dashboard
       SET last_session_summary = ?, next_session_at = ?, next_session_teaser = ?,
           next_session_notes = ?, threads = ?, updated_at = ?
       WHERE campaign_id = ?`,
    ).run(
      lastSessionSummary,
      nextSessionAt,
      nextSessionTeaser,
      nextSessionNotes,
      JSON.stringify(threads),
      now(),
      id,
    );
    touchCampaign(id);
    const row = ensureDashboard(id);
    return reply.send({ dashboard: serializeCampaignDashboard(row, "gm") });
  });
}
