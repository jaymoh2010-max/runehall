import type { FastifyInstance } from "fastify";
import { getCampaign, getCampaignRole, getMembership } from "../access";
import { db, type CampaignSessionRow } from "../db";
import { campaignSessionsFor } from "../sessionData";
import { touchCampaign } from "../serialize";
import {
  isAttendanceStatus,
  isSessionStatus,
  normalizeSessionStatus,
} from "../../shared/sessions";
import { clamp, newId, now, safeString, sanitizeUserText } from "../util";

function getSession(campaignId: string, sessionId: string): CampaignSessionRow | null {
  return (
    (db
      .prepare("SELECT * FROM campaign_sessions WHERE id = ? AND campaign_id = ?")
      .get(sessionId, campaignId) as CampaignSessionRow | undefined) ?? null
  );
}

function syncDashboardNextSession(campaignId: string): void {
  const next = db
    .prepare(
      "SELECT scheduled_at FROM campaign_sessions WHERE campaign_id = ? AND status = 'scheduled' ORDER BY scheduled_at ASC LIMIT 1",
    )
    .get(campaignId) as { scheduled_at: number } | undefined;
  db.prepare(
    "INSERT OR IGNORE INTO campaign_dashboard (campaign_id, updated_at) VALUES (?, ?)",
  ).run(campaignId, now());
  db.prepare(
    "UPDATE campaign_dashboard SET next_session_at = ?, updated_at = ? WHERE campaign_id = ?",
  ).run(next?.scheduled_at ?? null, now(), campaignId);
}

function sessionFor(campaignId: string, sessionId: string) {
  return campaignSessionsFor(campaignId, "gm", "").find((session) => session.id === sessionId) ?? null;
}

export async function registerSessionRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/campaigns/:id/sessions", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const { id } = request.params as { id: string };
    if (!getCampaign(id)) return reply.code(404).send({ error: "Campaign not found." });
    const role = getCampaignRole(id, request.user.id);
    if (!role) return reply.code(403).send({ error: "You're not a member of that campaign." });
    return reply.send({
      sessions: campaignSessionsFor(id, role, request.user.id),
    });
  });

  app.post("/api/campaigns/:id/sessions", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const { id } = request.params as { id: string };
    if (!getCampaign(id)) return reply.code(404).send({ error: "Campaign not found." });
    if (getCampaignRole(id, request.user.id) !== "gm") {
      return reply.code(403).send({ error: "Only the GM can schedule sessions." });
    }
    const body = (request.body ?? {}) as Record<string, unknown>;
    const scheduledAt = Number(body.scheduledAt);
    if (!Number.isFinite(scheduledAt) || scheduledAt <= 0) {
      return reply.code(400).send({ error: "Choose a valid session date." });
    }
    if (body.status !== undefined && !isSessionStatus(body.status)) {
      return reply.code(400).send({ error: "Choose a valid session status." });
    }
    const sessionId = newId("sess");
    const ts = now();
    db.prepare(
      `INSERT INTO campaign_sessions
        (id, campaign_id, title, scheduled_at, duration_minutes, notes, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      sessionId,
      id,
      safeString(body.title, "Untitled session", 140),
      Math.round(scheduledAt),
      clamp(Number(body.durationMinutes) || 180, 30, 1440),
      sanitizeUserText(body.notes, 20_000),
      body.status === undefined ? "scheduled" : normalizeSessionStatus(body.status),
      ts,
      ts,
    );
    syncDashboardNextSession(id);
    touchCampaign(id);
    return reply.code(201).send({ session: sessionFor(id, sessionId) });
  });

  app.patch("/api/campaigns/:id/sessions/:sessionId", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const { id, sessionId } = request.params as { id: string; sessionId: string };
    if (!getCampaign(id)) return reply.code(404).send({ error: "Campaign not found." });
    if (getCampaignRole(id, request.user.id) !== "gm") {
      return reply.code(403).send({ error: "Only the GM can edit sessions." });
    }
    const existing = getSession(id, sessionId);
    if (!existing) return reply.code(404).send({ error: "Session not found." });
    const body = (request.body ?? {}) as Record<string, unknown>;
    if (body.status !== undefined && !isSessionStatus(body.status)) {
      return reply.code(400).send({ error: "Choose a valid session status." });
    }
    let scheduledAt = existing.scheduled_at;
    if (body.scheduledAt !== undefined) {
      const value = Number(body.scheduledAt);
      if (!Number.isFinite(value) || value <= 0) {
        return reply.code(400).send({ error: "Choose a valid session date." });
      }
      scheduledAt = Math.round(value);
    }
    db.prepare(
      `UPDATE campaign_sessions
       SET title = ?, scheduled_at = ?, duration_minutes = ?, notes = ?, status = ?, updated_at = ?
       WHERE id = ?`,
    ).run(
      body.title === undefined ? existing.title : safeString(body.title, existing.title, 140),
      scheduledAt,
      body.durationMinutes === undefined
        ? existing.duration_minutes
        : clamp(Number(body.durationMinutes) || existing.duration_minutes, 30, 1440),
      body.notes === undefined ? existing.notes : sanitizeUserText(body.notes, 20_000),
      body.status === undefined ? normalizeSessionStatus(existing.status) : normalizeSessionStatus(body.status),
      now(),
      sessionId,
    );
    syncDashboardNextSession(id);
    touchCampaign(id);
    return reply.send({ session: sessionFor(id, sessionId) });
  });

  app.delete("/api/campaigns/:id/sessions/:sessionId", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const { id, sessionId } = request.params as { id: string; sessionId: string };
    if (!getCampaign(id)) return reply.code(404).send({ error: "Campaign not found." });
    if (getCampaignRole(id, request.user.id) !== "gm") {
      return reply.code(403).send({ error: "Only the GM can delete sessions." });
    }
    if (!getSession(id, sessionId)) return reply.code(404).send({ error: "Session not found." });
    db.prepare("DELETE FROM campaign_sessions WHERE id = ?").run(sessionId);
    syncDashboardNextSession(id);
    touchCampaign(id);
    return reply.send({ ok: true });
  });

  app.put(
    "/api/campaigns/:id/sessions/:sessionId/attendance/:userId",
    async (request, reply) => {
      if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
      const { id, sessionId, userId } = request.params as {
        id: string;
        sessionId: string;
        userId: string;
      };
      if (!getCampaign(id)) return reply.code(404).send({ error: "Campaign not found." });
      if (getCampaignRole(id, request.user.id) !== "gm") {
        return reply.code(403).send({ error: "Only the GM can record attendance." });
      }
      if (!getSession(id, sessionId)) return reply.code(404).send({ error: "Session not found." });
      if (!getMembership(id, userId)) {
        return reply.code(404).send({ error: "That player is not a member of this campaign." });
      }
      const body = (request.body ?? {}) as Record<string, unknown>;
      if (!isAttendanceStatus(body.status)) {
        return reply.code(400).send({ error: "Choose a valid attendance status." });
      }
      db.prepare(
        `INSERT INTO session_attendance (session_id, user_id, status, note, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(session_id, user_id)
         DO UPDATE SET status = excluded.status, note = excluded.note, updated_at = excluded.updated_at`,
      ).run(
        sessionId,
        userId,
        body.status,
        sanitizeUserText(body.note, 500),
        now(),
      );
      touchCampaign(id);
      return reply.send({ session: sessionFor(id, sessionId) });
    },
  );
}
