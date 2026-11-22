import type { FastifyInstance } from "fastify";
import { getCampaign, getCampaignRole } from "../access";
import { db, type CampaignChapterRow } from "../db";
import { serializeCampaignChapter, touchCampaign } from "../serialize";
import { broadcastCampaignSummary } from "../campaignEvents";
import { normalizeChapterLevel, normalizeChapterStatus } from "../../shared/chapters";
import { logAudit } from "../audit";
import { newId, now, safeString, sanitizeUserText } from "../util";

function chapterRow(campaignId: string, chapterId: string): CampaignChapterRow | null {
  return (
    (db
      .prepare("SELECT * FROM campaign_chapters WHERE id = ? AND campaign_id = ?")
      .get(chapterId, campaignId) as CampaignChapterRow | undefined) ?? null
  );
}

function chaptersFor(campaignId: string): CampaignChapterRow[] {
  return db
    .prepare(
      "SELECT * FROM campaign_chapters WHERE campaign_id = ? ORDER BY sort_order ASC, level_start ASC, created_at ASC"
    )
    .all(campaignId) as CampaignChapterRow[];
}

function nextSortOrder(campaignId: string): number {
  const row = db
    .prepare(
      "SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM campaign_chapters WHERE campaign_id = ?"
    )
    .get(campaignId) as { next: number };
  return row.next;
}

function levelRange(
  body: Record<string, unknown>,
  existing?: CampaignChapterRow
): { levelStart: number; levelEnd: number } {
  const levelStart = normalizeChapterLevel(
    body.levelStart === undefined ? existing?.level_start : body.levelStart,
    1
  );
  const levelEnd = Math.max(
    levelStart,
    normalizeChapterLevel(
      body.levelEnd === undefined ? existing?.level_end : body.levelEnd,
      levelStart
    )
  );
  return { levelStart, levelEnd };
}

export async function registerChapterRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/campaigns/:id/chapters", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const { id } = request.params as { id: string };
    if (!getCampaign(id)) return reply.code(404).send({ error: "Campaign not found." });
    const role = getCampaignRole(id, request.user.id);
    if (!role) {
      return reply.code(403).send({ error: "You are not a member of this campaign." });
    }
    const rows =
      role === "gm" ? chaptersFor(id) : chaptersFor(id).filter((row) => row.visible !== 0);
    return reply.send({
      chapters: rows.map((row) => serializeCampaignChapter(row, role === "gm")),
    });
  });

  app.post("/api/campaigns/:id/chapters", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const { id } = request.params as { id: string };
    if (!getCampaign(id)) return reply.code(404).send({ error: "Campaign not found." });
    if (getCampaignRole(id, request.user.id) !== "gm") {
      return reply.code(403).send({ error: "Only the GM can edit the adventure arc." });
    }
    const body = (request.body ?? {}) as Record<string, unknown>;
    const title = safeString(body.title, "", 160);
    if (!title) return reply.code(400).send({ error: "Give the chapter a title." });
    const { levelStart, levelEnd } = levelRange(body);
    const status = normalizeChapterStatus(body.status);
    const visible = body.visible === undefined ? true : body.visible !== false;
    const chapterId = newId("chapter");
    const ts = now();
    db.prepare(
      `INSERT INTO campaign_chapters
         (id, campaign_id, title, summary, level_start, level_end, status, visible, gm_notes,
          sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      chapterId,
      id,
      title,
      sanitizeUserText(body.summary, 8_000),
      levelStart,
      levelEnd,
      status,
      visible ? 1 : 0,
      sanitizeUserText(body.gmNotes, 8_000),
      nextSortOrder(id),
      ts,
      ts
    );
    if (status === "active") {
      db.prepare(
        "UPDATE campaign_chapters SET status = 'planned', updated_at = ? WHERE campaign_id = ? AND id <> ? AND status = 'active'"
      ).run(ts, id, chapterId);
    }
    touchCampaign(id);
    logAudit({
      action: "campaign.chapter_created",
      actor: request.user,
      targetType: "campaign",
      targetId: id,
      detail: `Created chapter ${title} (levels ${levelStart}-${levelEnd})`,
      request,
    });
    broadcastCampaignSummary(app, getCampaign(id)!);
    return reply.code(201).send({
      chapter: serializeCampaignChapter(chapterRow(id, chapterId)!),
      chapters: chaptersFor(id).map((chapter) => serializeCampaignChapter(chapter)),
    });
  });

  app.patch("/api/campaigns/:id/chapters/:chapterId", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const { id, chapterId } = request.params as { id: string; chapterId: string };
    if (!getCampaign(id)) return reply.code(404).send({ error: "Campaign not found." });
    if (getCampaignRole(id, request.user.id) !== "gm") {
      return reply.code(403).send({ error: "Only the GM can edit the adventure arc." });
    }
    const existing = chapterRow(id, chapterId);
    if (!existing) return reply.code(404).send({ error: "Chapter not found." });
    const body = (request.body ?? {}) as Record<string, unknown>;
    const title =
      body.title === undefined ? existing.title : safeString(body.title, existing.title, 160);
    if (!title) return reply.code(400).send({ error: "Give the chapter a title." });
    const { levelStart, levelEnd } = levelRange(body, existing);
    const status =
      body.status === undefined ? existing.status : normalizeChapterStatus(body.status);
    const visible = body.visible === undefined ? existing.visible : body.visible === false ? 0 : 1;
    const ts = now();
    db.prepare(
      `UPDATE campaign_chapters
       SET title = ?, summary = ?, level_start = ?, level_end = ?, status = ?, visible = ?,
           gm_notes = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      title,
      body.summary === undefined ? existing.summary : sanitizeUserText(body.summary, 8_000),
      levelStart,
      levelEnd,
      status,
      visible,
      body.gmNotes === undefined ? existing.gm_notes : sanitizeUserText(body.gmNotes, 8_000),
      ts,
      chapterId
    );
    if (status === "active") {
      db.prepare(
        "UPDATE campaign_chapters SET status = 'planned', updated_at = ? WHERE campaign_id = ? AND id <> ? AND status = 'active'"
      ).run(ts, id, chapterId);
    }
    touchCampaign(id);
    logAudit({
      action: "campaign.chapter_updated",
      actor: request.user,
      targetType: "campaign",
      targetId: id,
      detail: `Updated chapter ${title} to ${normalizeChapterStatus(status)}`,
      request,
    });
    broadcastCampaignSummary(app, getCampaign(id)!);
    return reply.send({
      chapter: serializeCampaignChapter(chapterRow(id, chapterId)!),
      chapters: chaptersFor(id).map((chapter) => serializeCampaignChapter(chapter)),
    });
  });

  app.delete("/api/campaigns/:id/chapters/:chapterId", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const { id, chapterId } = request.params as { id: string; chapterId: string };
    if (!getCampaign(id)) return reply.code(404).send({ error: "Campaign not found." });
    if (getCampaignRole(id, request.user.id) !== "gm") {
      return reply.code(403).send({ error: "Only the GM can edit the adventure arc." });
    }
    const existing = chapterRow(id, chapterId);
    if (!existing) return reply.code(404).send({ error: "Chapter not found." });
    db.prepare("DELETE FROM campaign_chapters WHERE id = ?").run(chapterId);
    touchCampaign(id);
    logAudit({
      action: "campaign.chapter_deleted",
      actor: request.user,
      targetType: "campaign",
      targetId: id,
      detail: `Deleted chapter ${existing.title}`,
      request,
    });
    broadcastCampaignSummary(app, getCampaign(id)!);
    return reply.send({
      chapters: chaptersFor(id).map((chapter) => serializeCampaignChapter(chapter)),
    });
  });
}
