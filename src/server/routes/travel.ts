import type { FastifyInstance } from "fastify";
import { getCampaign, getCampaignRole } from "../access";
import { db, transaction, type CampaignTravelRow } from "../db";
import { serializeCampaignTravel, touchCampaign } from "../serialize";
import { broadcastCampaignSummary } from "../campaignEvents";
import { shiftGolarionDate } from "../../shared/calendar";
import {
  normalizeTravelActivities,
  normalizeTravelMiles,
  normalizeTravelSpeed,
  normalizeTravelTerrain,
  normalizeTravelWatches,
  normalizeTravelWeather,
  travelMilesPerDay,
} from "../../shared/travel";
import type { CampaignTravelState } from "../../shared/types";
import { logAudit } from "../audit";
import { now, parseJson, safeInt, safeString, sanitizeUserText } from "../util";

function travelRow(campaignId: string): CampaignTravelRow | null {
  return (
    (db.prepare("SELECT * FROM campaign_travel WHERE campaign_id = ?").get(campaignId) as
      CampaignTravelRow | undefined) ?? null
  );
}

function campaignCharacterIds(campaignId: string): Set<string> {
  const rows = db.prepare("SELECT id FROM characters WHERE campaign_id = ?").all(campaignId) as {
    id: string;
  }[];
  return new Set(rows.map((row) => row.id));
}

/** Use the slowest character's summary Speed as the party's default travel speed. */
function suggestedTravelSpeed(campaignId: string): number {
  const rows = db
    .prepare("SELECT summary FROM characters WHERE campaign_id = ?")
    .all(campaignId) as { summary: string | null }[];
  let slowest = 0;
  for (const row of rows) {
    const summary = parseJson<{ speed?: number } | null>(row.summary, null);
    const speed = Number(summary?.speed);
    if (Number.isFinite(speed) && speed > 0) {
      slowest = slowest ? Math.min(slowest, speed) : speed;
    }
  }
  return slowest ? normalizeTravelSpeed(slowest) : 25;
}

function travelState(campaignId: string): CampaignTravelState {
  const row = travelRow(campaignId);
  return {
    travel: row ? serializeCampaignTravel(row, campaignCharacterIds(campaignId)) : null,
    suggestedSpeed: suggestedTravelSpeed(campaignId),
  };
}

export async function registerTravelRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/campaigns/:id/travel", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const { id } = request.params as { id: string };
    const campaign = getCampaign(id);
    if (!campaign) return reply.code(404).send({ error: "Campaign not found." });
    if (!getCampaignRole(id, request.user.id)) {
      return reply.code(403).send({ error: "You are not a member of this campaign." });
    }
    return reply.send(travelState(id));
  });

  app.put("/api/campaigns/:id/travel", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const { id } = request.params as { id: string };
    const campaign = getCampaign(id);
    if (!campaign) return reply.code(404).send({ error: "Campaign not found." });
    if (getCampaignRole(id, request.user.id) !== "gm") {
      return reply.code(403).send({ error: "Only the GM can edit the journey." });
    }
    const existing = travelRow(id);
    const body = (request.body ?? {}) as Record<string, unknown>;
    const origin = safeString(body.origin, existing?.origin ?? "", 120);
    const destination = safeString(body.destination, existing?.destination ?? "", 120);
    const terrain =
      body.terrain === undefined
        ? normalizeTravelTerrain(existing?.terrain)
        : normalizeTravelTerrain(body.terrain);
    const distanceMiles =
      body.distanceMiles === undefined
        ? normalizeTravelMiles(existing?.distance_miles)
        : normalizeTravelMiles(body.distanceMiles);
    const requestedProgress =
      body.progressMiles === undefined
        ? normalizeTravelMiles(existing?.progress_miles)
        : normalizeTravelMiles(body.progressMiles);
    const progressMiles = Math.min(distanceMiles, requestedProgress);
    const partySpeed =
      body.partySpeed === undefined
        ? existing
          ? normalizeTravelSpeed(existing.party_speed)
          : suggestedTravelSpeed(id)
        : normalizeTravelSpeed(body.partySpeed);
    const weather =
      body.weather === undefined
        ? normalizeTravelWeather(existing?.weather)
        : normalizeTravelWeather(body.weather);
    const notes =
      body.notes === undefined ? (existing?.notes ?? "") : sanitizeUserText(body.notes, 4000);
    const characterIds = campaignCharacterIds(id);
    const watches = normalizeTravelWatches(
      body.watches === undefined ? parseJson(existing?.watches, {}) : body.watches,
      characterIds
    );
    const activities = normalizeTravelActivities(
      body.activities === undefined ? parseJson(existing?.activities, {}) : body.activities,
      characterIds
    );
    const daysTravelled = safeInt(body.daysTravelled, existing?.days_travelled ?? 0, 0, 100_000);
    const ts = now();
    db.prepare(
      `INSERT INTO campaign_travel
        (campaign_id, origin, destination, terrain, distance_miles, progress_miles, party_speed,
         weather, notes, watches, activities, days_travelled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(campaign_id) DO UPDATE SET
         origin = excluded.origin,
         destination = excluded.destination,
         terrain = excluded.terrain,
         distance_miles = excluded.distance_miles,
         progress_miles = excluded.progress_miles,
         party_speed = excluded.party_speed,
         weather = excluded.weather,
         notes = excluded.notes,
         watches = excluded.watches,
         activities = excluded.activities,
         days_travelled = excluded.days_travelled,
         updated_at = excluded.updated_at`
    ).run(
      id,
      origin,
      destination,
      terrain,
      distanceMiles,
      progressMiles,
      partySpeed,
      weather,
      notes,
      JSON.stringify(watches),
      JSON.stringify(activities),
      daysTravelled,
      ts,
      ts
    );
    touchCampaign(id);
    logAudit({
      action: "campaign.travel_set",
      actor: request.user,
      targetType: "campaign",
      targetId: id,
      detail: `${origin || "Unknown"} to ${destination || "Unknown"} (${distanceMiles} miles, ${terrain})`,
      request,
    });
    const updated = getCampaign(id)!;
    broadcastCampaignSummary(app, updated);
    return reply.send(travelState(id));
  });

  app.post("/api/campaigns/:id/travel/advance", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const { id } = request.params as { id: string };
    const campaign = getCampaign(id);
    if (!campaign) return reply.code(404).send({ error: "Campaign not found." });
    if (getCampaignRole(id, request.user.id) !== "gm") {
      return reply.code(403).send({ error: "Only the GM can advance the journey." });
    }
    const row = travelRow(id);
    if (!row) return reply.code(400).send({ error: "Set up a journey first." });
    const distanceMiles = normalizeTravelMiles(row.distance_miles);
    const progressMiles = Math.min(distanceMiles, normalizeTravelMiles(row.progress_miles));
    if (distanceMiles <= 0) {
      return reply.code(400).send({ error: "Set a destination distance first." });
    }
    if (progressMiles >= distanceMiles) {
      return reply.code(400).send({ error: "This journey is already complete." });
    }
    const body = (request.body ?? {}) as Record<string, unknown>;
    const miles =
      body.miles === undefined
        ? travelMilesPerDay(row.party_speed, row.terrain)
        : normalizeTravelMiles(body.miles);
    if (miles <= 0) return reply.code(400).send({ error: "Travel at least some distance." });
    const nextProgress = Math.min(distanceMiles, progressMiles + miles);
    const currentDate = {
      year: campaign.world_year,
      month: campaign.world_month,
      day: campaign.world_day,
    };
    const worldDate = shiftGolarionDate(currentDate, 1);
    const ts = now();
    transaction(() => {
      db.prepare(
        "UPDATE campaigns SET world_year = ?, world_month = ?, world_day = ?, updated_at = ? WHERE id = ?"
      ).run(worldDate.year, worldDate.month, worldDate.day, ts, id);
      db.prepare(
        `UPDATE campaign_travel
         SET progress_miles = ?, days_travelled = days_travelled + 1, updated_at = ?
         WHERE campaign_id = ?`
      ).run(nextProgress, ts, id);
    });
    touchCampaign(id);
    logAudit({
      action: "campaign.travel_advance",
      actor: request.user,
      targetType: "campaign",
      targetId: id,
      detail: `${miles} miles; ${nextProgress}/${distanceMiles} total`,
      request,
    });
    const updated = getCampaign(id)!;
    broadcastCampaignSummary(app, updated);
    return reply.send({
      travel: serializeCampaignTravel(travelRow(id)!, campaignCharacterIds(id)),
      worldDate,
    });
  });

  app.delete("/api/campaigns/:id/travel", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const { id } = request.params as { id: string };
    const campaign = getCampaign(id);
    if (!campaign) return reply.code(404).send({ error: "Campaign not found." });
    if (getCampaignRole(id, request.user.id) !== "gm") {
      return reply.code(403).send({ error: "Only the GM can clear the journey." });
    }
    db.prepare("DELETE FROM campaign_travel WHERE campaign_id = ?").run(id);
    touchCampaign(id);
    logAudit({
      action: "campaign.travel_clear",
      actor: request.user,
      targetType: "campaign",
      targetId: id,
      detail: "Cleared the travel plan",
      request,
    });
    const updated = getCampaign(id)!;
    broadcastCampaignSummary(app, updated);
    return reply.send(travelState(id));
  });
}
