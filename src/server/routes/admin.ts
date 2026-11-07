import type { FastifyInstance } from "fastify";
import { db, type UserRow } from "../db";
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
import { safeString } from "../util";

function serializeUser(row: UserRow) {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    isAdmin: Boolean(row.is_admin),
    createdAt: row.created_at,
  };
}

export async function registerAdminRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/admin/overview", async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    return reply.send({
      registration: registrationStatus(),
      users: userCount(),
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
    const rows = db.prepare("SELECT * FROM users ORDER BY created_at ASC").all() as UserRow[];
    return reply.send({ users: rows.map(serializeUser) });
  });
}
