import type { FastifyInstance } from "fastify";
import { getCampaign, getCampaignRole } from "../access";
import { db, type CampaignDashboardRow } from "../db";
import { serializeCampaignDashboard, touchCampaign } from "../serialize";
import { normalizeCampaignThreads } from "../../shared/dashboard";
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
