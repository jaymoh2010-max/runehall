import type { FastifyInstance } from "fastify";
import {
  campaignCharacterCount,
  campaignMemberCount,
  getCampaignRole,
  getUser,
} from "../access";
import { db, type CampaignRow } from "../db";
import { serializeCampaignSummary } from "../serialize";

export async function registerInviteRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/invites/:code", async (request, reply) => {
    const { code } = request.params as { code: string };
    const row = db
      .prepare(
        `SELECT c.*, u.display_name AS gm_name FROM campaigns c
         JOIN users u ON u.id = c.gm_id
         WHERE UPPER(c.invite_code) = ?`,
      )
      .get(String(code || "").trim().toUpperCase()) as (CampaignRow & { gm_name: string }) | undefined;
    if (!row) return reply.code(404).send({ error: "That invite code is not valid." });

    const role = request.user ? getCampaignRole(row.id, request.user.id) : null;
    const gm = getUser(row.gm_id);
    const summary = serializeCampaignSummary(
      row,
      role ?? "player",
      {
        memberCount: campaignMemberCount(row.id),
        characterCount: campaignCharacterCount(row.id),
      },
      gm?.display_name ?? row.gm_name,
    );

    return reply.send({
      campaign: {
        id: row.id,
        name: row.name,
        description: row.description,
        gmName: gm?.display_name ?? row.gm_name,
        ruleset: summary.ruleset,
        memberCount: summary.memberCount,
        characterCount: summary.characterCount,
        createdAt: row.created_at,
        lastPlayedAt: row.last_played_at,
      },
      alreadyMember: Boolean(role),
      role,
    });
  });
}
