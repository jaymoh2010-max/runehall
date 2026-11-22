import type { FastifyInstance } from "fastify";
import { db, type UserRow } from "../db";
import { revokeAllSessions } from "../auth";
import {
  auditStatus,
  listAudit,
  listAuditForExport,
  logAudit,
  pruneAuditLog,
  setAuditRetentionDays,
} from "../audit";
import { auditCsv, normalizeAuditRetentionDays } from "../../shared/audit";
import {
  createRegistrationInvite,
  getRegistrationMode,
  listRegistrationInvites,
  registrationStatus,
  revokeRegistrationInvite,
  setRegistrationMode,
  userCount,
} from "../registration";
import { requireAdmin } from "./auth";
import type { AdminUser } from "../../shared/types";
import { now, safeString } from "../util";

function serializeUser(
  row: UserRow & { session_count?: number; last_seen_at?: number | null }
): AdminUser {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    isAdmin: Boolean(row.is_admin),
    createdAt: row.created_at,
    disabledAt: row.disabled_at ?? null,
    disabledReason: row.disabled_reason ?? "",
    sessionCount: Number(row.session_count ?? 0),
    lastSeenAt: row.last_seen_at ?? null,
  };
}

function activeAdminCount(): number {
  const row = db
    .prepare("SELECT COUNT(*) AS count FROM users WHERE is_admin = 1 AND disabled_at IS NULL")
    .get() as { count: number };
  return Number(row?.count ?? 0);
}

function loadAdminUser(id: string) {
  return (
    (db
      .prepare(
        `SELECT u.*,
           (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id AND s.expires_at > ?) AS session_count,
           (SELECT MAX(s.last_seen_at) FROM sessions s WHERE s.user_id = u.id) AS last_seen_at
         FROM users u WHERE u.id = ?`
      )
      .get(now(), id) as
      (UserRow & { session_count: number; last_seen_at: number | null }) | undefined) ?? null
  );
}

/** Drop every live socket for an account so moderation takes effect at once. */
function disconnectUserSockets(app: FastifyInstance, userId: string): void {
  for (const socket of app.io.sockets.sockets.values()) {
    const data = socket.data as { user?: { id?: string } };
    if (data.user?.id === userId) socket.disconnect(true);
  }
}

export async function registerAdminRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/admin/overview", async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const suspended = db
      .prepare("SELECT COUNT(*) AS count FROM users WHERE disabled_at IS NOT NULL")
      .get() as { count: number };
    return reply.send({
      registration: registrationStatus(),
      users: userCount(),
      suspended: Number(suspended?.count ?? 0),
      invites: listRegistrationInvites().filter((invite) => !invite.usedAt && !invite.usedBy)
        .length,
      audit: auditStatus(),
    });
  });

  app.get("/api/admin/registration", async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    return reply.send({ registration: registrationStatus() });
  });

  app.put("/api/admin/registration", async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const body = (request.body ?? {}) as Record<string, unknown>;
    const previous = getRegistrationMode();
    try {
      const mode = setRegistrationMode(body.mode);
      logAudit({
        action: "admin.registration_mode",
        actor: request.user,
        targetType: "setting",
        targetId: "registration_mode",
        detail: `${previous} -> ${mode}`,
        request,
      });
      return reply.send({ registration: registrationStatus() });
    } catch (error) {
      return reply.code(400).send({
        error: error instanceof Error ? error.message : "Could not update registration mode.",
      });
    }
  });

  app.get("/api/admin/invites", async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    return reply.send({ invites: listRegistrationInvites() });
  });

  app.post("/api/admin/invites", async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const body = (request.body ?? {}) as Record<string, unknown>;
    try {
      const invite = createRegistrationInvite({
        note: body.note,
        expiresInDays: body.expiresInDays,
        createdBy: request.user!.id,
      });
      logAudit({
        action: "admin.invite_create",
        actor: request.user,
        targetType: "registration_invite",
        targetId: invite.id,
        detail: `code ${invite.code}${invite.note ? ` (${invite.note})` : ""}`,
        request,
      });
      return reply.code(201).send({ invite });
    } catch (error) {
      return reply.code(400).send({
        error: error instanceof Error ? error.message : "Could not create an invite.",
      });
    }
  });

  app.delete("/api/admin/invites/:id", async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const { id } = request.params as { id: string };
    const revoked = revokeRegistrationInvite(id);
    if (!revoked) {
      return reply.code(404).send({ error: "That invite was not found or has already been used." });
    }
    logAudit({
      action: "admin.invite_revoke",
      actor: request.user,
      targetType: "registration_invite",
      targetId: id,
      request,
    });
    return reply.send({ ok: true });
  });

  app.get("/api/admin/audit/export", async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const query = (request.query ?? {}) as Record<string, unknown>;
    const entries = listAuditForExport(safeString(query.action, "", 80));
    const csv = auditCsv(entries);
    logAudit({
      action: "admin.audit_export",
      actor: request.user,
      targetType: "audit_log",
      detail: `${entries.length} entries`,
      request,
    });
    const date = new Date().toISOString().slice(0, 10);
    return reply
      .header("content-type", "text/csv; charset=utf-8")
      .header("content-disposition", `attachment; filename="runehall-audit-${date}.csv"`)
      .header("cache-control", "no-store")
      .send(csv);
  });

  app.put("/api/admin/audit/retention", async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const body = (request.body ?? {}) as Record<string, unknown>;
    const numeric = Number(body.days);
    if (body.days === undefined || !Number.isFinite(numeric)) {
      return reply.code(400).send({ error: "Choose a valid retention period." });
    }
    const previous = auditStatus().retentionDays;
    const days = normalizeAuditRetentionDays(numeric);
    setAuditRetentionDays(days);
    const pruned = pruneAuditLog(days);
    logAudit({
      action: "admin.audit_retention",
      actor: request.user,
      targetType: "setting",
      targetId: "audit_retention_days",
      detail: `${previous} -> ${days} days; removed ${pruned.deleted}`,
      request,
    });
    return reply.send({ audit: auditStatus(), pruned });
  });

  app.get("/api/admin/audit", async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const query = (request.query ?? {}) as Record<string, unknown>;
    const result = listAudit({
      limit: Number(query.limit) || 50,
      offset: Number(query.offset) || 0,
      action: safeString(query.action, "", 80),
    });
    return reply.send(result);
  });

  app.get("/api/admin/users", async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const rows = db
      .prepare(
        `SELECT u.*,
           (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id AND s.expires_at > ?) AS session_count,
           (SELECT MAX(s.last_seen_at) FROM sessions s WHERE s.user_id = u.id) AS last_seen_at
         FROM users u ORDER BY u.created_at ASC`
      )
      .all(now()) as (UserRow & { session_count: number; last_seen_at: number | null })[];
    return reply.send({ users: rows.map(serializeUser) });
  });

  app.post("/api/admin/users/:id/disable", async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const { id } = request.params as { id: string };
    if (id === request.user!.id) {
      return reply.code(400).send({ error: "You cannot suspend your own account." });
    }
    const target = loadAdminUser(id);
    if (!target) return reply.code(404).send({ error: "User not found." });
    if (target.is_admin && activeAdminCount() <= 1) {
      return reply.code(400).send({ error: "Keep at least one active administrator." });
    }
    const body = (request.body ?? {}) as Record<string, unknown>;
    const reason = safeString(body.reason, "", 200);
    db.prepare("UPDATE users SET disabled_at = ?, disabled_reason = ? WHERE id = ?").run(
      now(),
      reason,
      id
    );
    const revoked = revokeAllSessions(id);
    disconnectUserSockets(app, id);
    logAudit({
      action: "admin.user_disable",
      actor: request.user,
      targetType: "user",
      targetId: id,
      detail: `${target.username}${reason ? `: ${reason}` : ""}; ${revoked} sessions revoked`,
      request,
    });
    return reply.send({ user: serializeUser(loadAdminUser(id)!) });
  });

  app.post("/api/admin/users/:id/enable", async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const { id } = request.params as { id: string };
    const target = loadAdminUser(id);
    if (!target) return reply.code(404).send({ error: "User not found." });
    db.prepare("UPDATE users SET disabled_at = NULL, disabled_reason = '' WHERE id = ?").run(id);
    logAudit({
      action: "admin.user_enable",
      actor: request.user,
      targetType: "user",
      targetId: id,
      detail: target.username,
      request,
    });
    return reply.send({ user: serializeUser(loadAdminUser(id)!) });
  });

  app.post("/api/admin/users/:id/admin", async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const { id } = request.params as { id: string };
    if (id === request.user!.id) {
      return reply.code(400).send({ error: "You cannot change your own administrator role." });
    }
    const target = loadAdminUser(id);
    if (!target) return reply.code(404).send({ error: "User not found." });
    const body = (request.body ?? {}) as Record<string, unknown>;
    if (typeof body.isAdmin !== "boolean") {
      return reply.code(400).send({ error: "Choose whether the account is an administrator." });
    }
    const isAdmin = body.isAdmin;
    if (!isAdmin && target.is_admin && activeAdminCount() <= 1) {
      return reply.code(400).send({ error: "Keep at least one active administrator." });
    }
    db.prepare("UPDATE users SET is_admin = ? WHERE id = ?").run(isAdmin ? 1 : 0, id);
    logAudit({
      action: "admin.user_role",
      actor: request.user,
      targetType: "user",
      targetId: id,
      detail: `${target.username}: ${isAdmin ? "administrator" : "player"}`,
      request,
    });
    return reply.send({ user: serializeUser(loadAdminUser(id)!) });
  });

  app.post("/api/admin/users/:id/sessions/revoke", async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const { id } = request.params as { id: string };
    if (id === request.user!.id) {
      return reply
        .code(400)
        .send({ error: "Use Account → Sessions to sign out your own devices." });
    }
    const target = loadAdminUser(id);
    if (!target) return reply.code(404).send({ error: "User not found." });
    const revoked = revokeAllSessions(id);
    disconnectUserSockets(app, id);
    logAudit({
      action: "admin.user_sessions_revoke",
      actor: request.user,
      targetType: "user",
      targetId: id,
      detail: `${target.username}: ${revoked} sessions revoked`,
      request,
    });
    return reply.send({ user: serializeUser(loadAdminUser(id)!) });
  });
}
