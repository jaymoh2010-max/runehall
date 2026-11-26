import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  clearSessionCookie,
  createSession,
  destroySession,
  getSessionToken,
  hashPassword,
  listSessions,
  revokeOtherSessions,
  revokeSession,
  safeEqualText,
  setSessionCookie,
  toPublicUser,
  validateDisplayName,
  validatePassword,
  validateUsername,
  verifyPassword,
} from "../auth";
import { getUserByUsername } from "../access";
import { logAudit } from "../audit";
import { db, transaction } from "../db";
import {
  consumeRegistrationInvite,
  registrationStatus,
  requireRegistrationInvite,
} from "../registration";
import { newId, now, safeString, sha256 } from "../util";
import { disconnectUserSockets } from "../socketSessions";

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Error && /UNIQUE|constraint/i.test(error.message);
}

function sessionMeta(request: FastifyRequest) {
  const userAgent = request.headers["user-agent"];
  return {
    userAgent: typeof userAgent === "string" ? userAgent : "",
    ip: request.ip,
  };
}

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/auth/config", async (_request, reply) => {
    return reply.send({ registration: registrationStatus() });
  });

  app.post("/api/auth/register", async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    try {
      const username = validateUsername(body.username);
      const displayName = validateDisplayName(body.displayName);
      const password = validatePassword(body.password);
      if (getUserByUsername(username)) {
        return reply.code(409).send({ error: "That username is already taken." });
      }

      const status = registrationStatus();
      if (!status.canRegister) {
        return reply.code(403).send({
          error: "Registration is closed. Ask the host for an account.",
        });
      }
      const bootstrapToken = (process.env.BOOTSTRAP_TOKEN ?? "").trim();
      if (status.bootstrap && bootstrapToken) {
        const provided = safeString(body.bootstrapToken, "", 200);
        if (!safeEqualText(provided, bootstrapToken)) {
          return reply
            .code(403)
            .send({ error: "Enter the one-time bootstrap token from the host." });
        }
      }
      let invite = null;
      try {
        invite = requireRegistrationInvite(body.inviteCode);
      } catch (error) {
        return reply.code(400).send({
          error: error instanceof Error ? error.message : "That invite code is not valid.",
        });
      }

      const id = newId("usr");
      const bootstrap = status.bootstrap;
      try {
        transaction(() => {
          db.prepare(
            "INSERT INTO users (id, username, display_name, password_hash, avatar_url, is_admin, created_at) VALUES (?, ?, ?, ?, NULL, ?, ?)"
          ).run(id, username, displayName, hashPassword(password), bootstrap ? 1 : 0, now());
          if (invite && !consumeRegistrationInvite(invite.id, id)) {
            throw new Error("That invite code has already been used.");
          }
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          return reply.code(409).send({ error: "That username is already taken." });
        }
        return reply.code(400).send({
          error: error instanceof Error ? error.message : "Could not create account.",
        });
      }

      const row = getUserByUsername(username);
      if (!row) return reply.code(500).send({ error: "The account could not be loaded." });
      logAudit({
        action: "auth.register",
        actor: toPublicUser(row),
        targetType: "user",
        targetId: id,
        detail: bootstrap
          ? "first user; instance administrator"
          : invite
            ? `invite ${invite.code}`
            : "open registration",
        request,
      });
      const token = createSession(id, sessionMeta(request));
      setSessionCookie(reply, token);
      return reply.send({ user: toPublicUser(row) });
    } catch (error) {
      return reply
        .code(400)
        .send({ error: error instanceof Error ? error.message : "Could not create account." });
    }
  });

  app.post("/api/auth/login", async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const username = safeString(body.username, "", 60);
    const password = typeof body.password === "string" ? body.password : "";
    const row = getUserByUsername(username);
    if (!row || !verifyPassword(password, row.password_hash)) {
      logAudit({
        action: "auth.login_failed",
        targetType: "username",
        detail: username || "(blank)",
        request,
      });
      return reply.code(401).send({ error: "Incorrect username or password." });
    }
    if (row.disabled_at) {
      logAudit({
        action: "auth.login_suspended",
        targetType: "user",
        targetId: row.id,
        detail: row.disabled_reason || "account suspended",
        request,
      });
      return reply
        .code(403)
        .send({ error: "That account is suspended. Ask an administrator for help." });
    }
    const token = createSession(row.id, sessionMeta(request));
    setSessionCookie(reply, token);
    logAudit({
      action: "auth.login",
      actor: toPublicUser(row),
      targetType: "user",
      targetId: row.id,
      request,
    });
    return reply.send({ user: toPublicUser(row) });
  });

  app.post("/api/auth/logout", async (request, reply) => {
    const token = getSessionToken(request);
    destroySession(token);
    if (request.user) {
      disconnectUserSockets(app, request.user.id, {
        sessionHash: token ? sha256(token) : undefined,
      });
      logAudit({
        action: "auth.logout",
        actor: request.user,
        targetType: "user",
        targetId: request.user.id,
        request,
      });
    }
    clearSessionCookie(reply);
    return reply.send({ ok: true });
  });

  app.get("/api/auth/me", async (request, reply) => {
    if (!request.user) return reply.send({ user: null });
    return reply.send({ user: request.user });
  });

  app.patch("/api/auth/me", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const body = (request.body ?? {}) as Record<string, unknown>;
    const displayName = safeString(body.displayName, request.user.displayName, 40);
    const avatarUrl =
      body.avatarUrl === null
        ? null
        : safeString(body.avatarUrl, request.user.avatarUrl ?? "", 500);
    if (displayName.length < 2)
      return reply.code(400).send({ error: "Display name is too short." });
    if (
      body.avatarUrl !== undefined &&
      body.avatarUrl !== null &&
      avatarUrl &&
      !avatarUrl.startsWith("/uploads/") &&
      !avatarUrl.startsWith("/portraits/")
    ) {
      return reply.code(400).send({
        error: "Choose an uploaded portrait or a built-in portrait.",
      });
    }
    db.prepare("UPDATE users SET display_name = ?, avatar_url = ? WHERE id = ?").run(
      displayName,
      avatarUrl,
      request.user.id
    );
    logAudit({
      action: "auth.profile_update",
      actor: request.user,
      targetType: "user",
      targetId: request.user.id,
      request,
    });
    return reply.send({
      user: { ...request.user, displayName, avatarUrl },
    });
  });

  app.get("/api/auth/sessions", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    return reply.send({
      sessions: listSessions(request.user.id, getSessionToken(request)),
    });
  });

  app.delete("/api/auth/sessions/:sessionId", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const { sessionId } = request.params as { sessionId: string };
    const current = getSessionToken(request);
    const target = listSessions(request.user.id, current).find(
      (session) => session.id === sessionId
    );
    if (!target) return reply.code(404).send({ error: "Session not found." });
    revokeSession(request.user.id, sessionId);
    disconnectUserSockets(app, request.user.id, { sessionHash: sessionId });
    if (target.current && current) {
      destroySession(current);
      clearSessionCookie(reply);
    }
    logAudit({
      action: "auth.session_revoke",
      actor: request.user,
      targetType: "session",
      targetId: sessionId.slice(0, 12),
      detail: target.current ? "current session" : "signed-out device",
      request,
    });
    return reply.send({ ok: true, current: target.current });
  });

  app.post("/api/auth/sessions/revoke-others", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const current = getSessionToken(request);
    const removed = revokeOtherSessions(request.user.id, current);
    disconnectUserSockets(app, request.user.id, {
      exceptSessionHash: current ? sha256(current) : undefined,
    });
    logAudit({
      action: "auth.sessions_revoke_others",
      actor: request.user,
      targetType: "user",
      targetId: request.user.id,
      detail: `${removed} session${removed === 1 ? "" : "s"} signed out`,
      request,
    });
    return reply.send({
      removed,
      sessions: listSessions(request.user.id, getSessionToken(request)),
    });
  });

  app.post("/api/auth/password", async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: "Sign in to continue." });
    const body = (request.body ?? {}) as Record<string, unknown>;
    const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
    const row = db.prepare("SELECT * FROM users WHERE id = ?").get(request.user.id);
    if (
      !row ||
      !verifyPassword(currentPassword, (row as { password_hash: string }).password_hash)
    ) {
      return reply.code(400).send({ error: "Your current password is incorrect." });
    }
    let newPassword: string;
    try {
      newPassword = validatePassword(body.newPassword);
    } catch (error) {
      return reply
        .code(400)
        .send({ error: error instanceof Error ? error.message : "Choose a longer password." });
    }
    if (newPassword === currentPassword) {
      return reply.code(400).send({ error: "Choose a password you have not used here before." });
    }
    transaction(() => {
      db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(
        hashPassword(newPassword),
        request.user!.id
      );
      // Sign out every other device; then issue a fresh session for this one.
      db.prepare("DELETE FROM sessions WHERE user_id = ?").run(request.user!.id);
    });
    disconnectUserSockets(app, request.user.id);
    const token = createSession(request.user.id, sessionMeta(request));
    setSessionCookie(reply, token);
    logAudit({
      action: "auth.password_change",
      actor: request.user,
      targetType: "user",
      targetId: request.user.id,
      request,
    });
    return reply.send({ ok: true });
  });
}

export function requireAdmin(request: FastifyRequest, reply: FastifyReply): boolean {
  if (!request.user) {
    reply.code(401).send({ error: "Sign in to continue." });
    return false;
  }
  if (!request.user.isAdmin) {
    reply.code(403).send({ error: "Administrators only." });
    return false;
  }
  return true;
}
