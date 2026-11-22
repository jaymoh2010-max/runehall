import type { FastifyInstance } from "fastify";
import { getCampaign, getCampaignRole } from "../access";
import { db, type CampaignKnowledgeRow, type CampaignPlayerNoteRow } from "../db";
import {
  serializeCampaignKnowledge,
  serializeCampaignPlayerNote,
  touchCampaign,
} from "../serialize";
import { broadcastCampaignSummary } from "../campaignEvents";
import type { CampaignNotesView } from "../../shared/types";
import { newId, now, safeString, sanitizeUserText } from "../util";

function memberRole(
  request: { user: { id: string } | null },
  campaignId: string
): "gm" | "player" | null {
  if (!request.user) return null;
  if (!getCampaign(campaignId)) return null;
  const role = getCampaignRole(campaignId, request.user.id);
  return role === "gm" ? "gm" : role ? "player" : null;
}

function noteRow(campaignId: string, userId: string, noteId: string): CampaignPlayerNoteRow | null {
  return (
    (db
      .prepare(
        "SELECT * FROM campaign_player_notes WHERE id = ? AND campaign_id = ? AND user_id = ?"
      )
      .get(noteId, campaignId, userId) as CampaignPlayerNoteRow | undefined) ?? null
  );
}

function knowledgeRow(campaignId: string, entryId: string): CampaignKnowledgeRow | null {
  return (
    (db
      .prepare("SELECT * FROM campaign_knowledge WHERE id = ? AND campaign_id = ?")
      .get(entryId, campaignId) as CampaignKnowledgeRow | undefined) ?? null
  );
}

function nextKnowledgeSortOrder(campaignId: string): number {
  const row = db
    .prepare(
      "SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM campaign_knowledge WHERE campaign_id = ?"
    )
    .get(campaignId) as { next: number };
  return row.next;
}

function notesView(campaignId: string, userId: string): CampaignNotesView {
  const isGm = getCampaignRole(campaignId, userId) === "gm";
  const notes = (
    db
      .prepare(
        `SELECT * FROM campaign_player_notes
         WHERE campaign_id = ? AND user_id = ?
         ORDER BY updated_at DESC, created_at DESC`
      )
      .all(campaignId, userId) as CampaignPlayerNoteRow[]
  ).map(serializeCampaignPlayerNote);
  const knowledge = (
    isGm
      ? (db
          .prepare(
            `SELECT * FROM campaign_knowledge
             WHERE campaign_id = ?
             ORDER BY sort_order ASC, created_at ASC`
          )
          .all(campaignId) as CampaignKnowledgeRow[])
      : (db
          .prepare(
            `SELECT * FROM campaign_knowledge
             WHERE campaign_id = ? AND visible = 1
             ORDER BY sort_order ASC, created_at ASC`
          )
          .all(campaignId) as CampaignKnowledgeRow[])
  ).map(serializeCampaignKnowledge);
  return { notes, knowledge };
}

export async function registerNotesRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/campaigns/:id/notes", async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    if (!memberRole(request, id)) {
      return reply.code(403).send({ error: "You are not a member of this campaign." });
    }
    return reply.send(notesView(id, request.user.id));
  });

  app.post("/api/campaigns/:id/notes", async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    if (!memberRole(request, id)) {
      return reply.code(403).send({ error: "You are not a member of this campaign." });
    }
    const body = (request.body ?? {}) as Record<string, unknown>;
    const title = safeString(body.title, "", 120) || "Untitled note";
    const content = sanitizeUserText(body.content, 50_000);
    const noteId = newId("note");
    const ts = now();
    db.prepare(
      `INSERT INTO campaign_player_notes
         (id, campaign_id, user_id, title, content, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(noteId, id, request.user.id, title, content, ts, ts);
    return reply
      .code(201)
      .send({ note: serializeCampaignPlayerNote(noteRow(id, request.user.id, noteId)!) });
  });

  app.patch("/api/campaigns/:id/notes/:noteId", async (request, reply) => {
    const { id, noteId } = request.params as { id: string; noteId: string };
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    if (!memberRole(request, id)) {
      return reply.code(403).send({ error: "You are not a member of this campaign." });
    }
    const existing = noteRow(id, request.user.id, noteId);
    if (!existing) return reply.code(404).send({ error: "Note not found." });
    const body = (request.body ?? {}) as Record<string, unknown>;
    const title =
      body.title === undefined
        ? existing.title
        : safeString(body.title, existing.title, 120) || "Untitled note";
    const content =
      body.content === undefined ? existing.content : sanitizeUserText(body.content, 50_000);
    db.prepare(
      "UPDATE campaign_player_notes SET title = ?, content = ?, updated_at = ? WHERE id = ?"
    ).run(title, content, now(), noteId);
    return reply.send({
      note: serializeCampaignPlayerNote(noteRow(id, request.user.id, noteId)!),
    });
  });

  app.delete("/api/campaigns/:id/notes/:noteId", async (request, reply) => {
    const { id, noteId } = request.params as { id: string; noteId: string };
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    if (!memberRole(request, id)) {
      return reply.code(403).send({ error: "You are not a member of this campaign." });
    }
    if (!noteRow(id, request.user.id, noteId)) {
      return reply.code(404).send({ error: "Note not found." });
    }
    db.prepare("DELETE FROM campaign_player_notes WHERE id = ? AND user_id = ?").run(
      noteId,
      request.user.id
    );
    return reply.send({ ok: true });
  });

  app.post("/api/campaigns/:id/knowledge", async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    if (memberRole(request, id) !== "gm") {
      return reply.code(403).send({ error: "Only the GM can edit campaign knowledge." });
    }
    const body = (request.body ?? {}) as Record<string, unknown>;
    const title = safeString(body.title, "", 160);
    if (!title) return reply.code(400).send({ error: "Give the knowledge entry a title." });
    const content = sanitizeUserText(body.content, 50_000);
    const entryId = newId("knowledge");
    const ts = now();
    db.prepare(
      `INSERT INTO campaign_knowledge
         (id, campaign_id, title, content, visible, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      entryId,
      id,
      title,
      content,
      body.visible === true ? 1 : 0,
      nextKnowledgeSortOrder(id),
      ts,
      ts
    );
    touchCampaign(id);
    broadcastCampaignSummary(app, getCampaign(id)!);
    return reply.code(201).send({ entry: serializeCampaignKnowledge(knowledgeRow(id, entryId)!) });
  });

  app.patch("/api/campaigns/:id/knowledge/:entryId", async (request, reply) => {
    const { id, entryId } = request.params as { id: string; entryId: string };
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    if (memberRole(request, id) !== "gm") {
      return reply.code(403).send({ error: "Only the GM can edit campaign knowledge." });
    }
    const existing = knowledgeRow(id, entryId);
    if (!existing) return reply.code(404).send({ error: "Knowledge entry not found." });
    const body = (request.body ?? {}) as Record<string, unknown>;
    const title =
      body.title === undefined
        ? existing.title
        : safeString(body.title, existing.title, 160) || existing.title;
    const content =
      body.content === undefined ? existing.content : sanitizeUserText(body.content, 50_000);
    db.prepare(
      `UPDATE campaign_knowledge
       SET title = ?, content = ?, visible = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      title,
      content,
      body.visible === undefined ? existing.visible : body.visible === true ? 1 : 0,
      now(),
      entryId
    );
    touchCampaign(id);
    broadcastCampaignSummary(app, getCampaign(id)!);
    return reply.send({ entry: serializeCampaignKnowledge(knowledgeRow(id, entryId)!) });
  });

  app.delete("/api/campaigns/:id/knowledge/:entryId", async (request, reply) => {
    const { id, entryId } = request.params as { id: string; entryId: string };
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    if (memberRole(request, id) !== "gm") {
      return reply.code(403).send({ error: "Only the GM can edit campaign knowledge." });
    }
    if (!knowledgeRow(id, entryId)) {
      return reply.code(404).send({ error: "Knowledge entry not found." });
    }
    db.prepare("DELETE FROM campaign_knowledge WHERE id = ?").run(entryId);
    touchCampaign(id);
    broadcastCampaignSummary(app, getCampaign(id)!);
    return reply.send({ ok: true });
  });
}
