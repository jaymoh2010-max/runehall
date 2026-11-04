import type { FastifyInstance } from "fastify";
import { getCampaign, getCampaignRole } from "../access";
import { deleteCampaignAsset, listCampaignAssets } from "../assets";
import { logAudit } from "../audit";

function gmAccess(
  request: { user: { id: string } | null },
  campaignId: string,
): { error?: string; code?: number } {
  if (!request.user) return { error: "Sign in to continue.", code: 401 };
  if (!getCampaign(campaignId)) return { error: "Campaign not found.", code: 404 };
  if (getCampaignRole(campaignId, request.user.id) !== "gm") {
    return { error: "Only the GM can manage campaign assets.", code: 403 };
  }
  return {};
}

export async function registerAssetRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/campaigns/:id/assets", async (request, reply) => {
    const { id } = request.params as { id: string };
    const access = gmAccess(request, id);
    if (access.error) return reply.code(access.code ?? 403).send({ error: access.error });
    return reply.send({ assets: listCampaignAssets(id, request.user!.id) });
  });

  app.delete("/api/campaigns/:id/assets/:filename", async (request, reply) => {
    const { id, filename } = request.params as { id: string; filename: string };
    const access = gmAccess(request, id);
    if (access.error) return reply.code(access.code ?? 403).send({ error: access.error });
    const result = deleteCampaignAsset(id, request.user!.id, filename);
    if (!result.ok) return reply.code(result.code).send({ error: result.error });
    logAudit({
      action: "campaign.asset_delete",
      actor: request.user!,
      targetType: "campaign",
      targetId: id,
      detail: filename,
      request,
    });
    return reply.send({ ok: true });
  });
}
