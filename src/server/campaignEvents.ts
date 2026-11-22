import type { FastifyInstance } from "fastify";
import { campaignCharacterCount, campaignMemberCount, getUser } from "./access";
import type { CampaignRow } from "./db";
import { serializeCampaignSummary } from "./serialize";

/** Push role-appropriate campaign metadata to anyone in the room. */
export function broadcastCampaignSummary(app: FastifyInstance, row: CampaignRow): void {
  const counts = {
    memberCount: campaignMemberCount(row.id),
    characterCount: campaignCharacterCount(row.id),
  };
  const gmName = getUser(row.gm_id)?.display_name ?? "";
  app.broadcastCampaign(
    row.id,
    "campaign:updated",
    serializeCampaignSummary(row, "gm", counts, gmName),
    "gm"
  );
  app.broadcastCampaign(
    row.id,
    "campaign:updated",
    serializeCampaignSummary(row, "player", counts, gmName),
    "players"
  );
}
