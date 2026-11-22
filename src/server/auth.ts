import crypto from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { db, type SessionRow, type UserRow } from "./db";
import { now, parseCookies, randomToken, safeString, sha256 } from "./util";
import type { AuthSession, PublicUser } from "../shared/types";

export const SESSION_COOKIE = "runehall_session";
const SESSION_DAYS = 30;

export function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    isAdmin: Boolean(row.is_admin),
  };
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, hash] = parts;
  try {
    const candidate = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
    const expected = Buffer.from(hash, "hex");
    return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
  } catch {
    return false;
  }
}

/** Constant-time comparison for short setup/bootstrap secrets. */
export function safeEqualText(candidate: string, expected: string): boolean {
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export interface SessionMeta {
  userAgent?: string;
  ip?: string;
}

export function createSession(userId: string, meta: SessionMeta = {}): string {
  const token = randomToken(32);
  const expires = now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  const ts = now();
  db.prepare(
    `INSERT INTO sessions
     (token_hash, user_id, expires_at, created_at, user_agent, ip, last_seen_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    sha256(token),
    userId,
    expires,
    ts,
    safeString(meta.userAgent, "", 300),
    safeString(meta.ip, "", 64),
    ts
  );
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(ts);
  return token;
}

export function destroySession(token: string | undefined): void {
  if (!token) return;
  db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha256(token));
}

/**
 * Resolve a cookie to an active account. Suspended accounts are rejected even
 * if a session row somehow survived the suspension.
 */
export function userFromToken(token: string | undefined | null): UserRow | null {
  if (!token) return null;
  const tokenHash = sha256(token);
  const session = db
    .prepare("SELECT * FROM sessions WHERE token_hash = ? AND expires_at > ?")
    .get(tokenHash, now()) as SessionRow | undefined;
  if (!session) return null;
  const row = db
    .prepare("SELECT * FROM users WHERE id = ? AND disabled_at IS NULL")
    .get(session.user_id) as UserRow | undefined;
  if (!row) {
    // A suspended account should not leave a usable session behind.
    db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
    return null;
  }
  if (now() - session.last_seen_at > 5 * 60 * 1000) {
    db.prepare("UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?").run(now(), tokenHash);
  }
  return row;
}

export function listSessions(userId: string, currentToken?: string): AuthSession[] {
  const currentHash = currentToken ? sha256(currentToken) : "";
  const rows = db
    .prepare(
      `SELECT * FROM sessions
       WHERE user_id = ? AND expires_at > ?
       ORDER BY COALESCE(last_seen_at, created_at) DESC`
    )
    .all(userId, now()) as SessionRow[];
  return rows.map((row) => ({
    id: row.token_hash,
    current: row.token_hash === currentHash,
    userAgent: row.user_agent || "",
    ip: row.ip || "",
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at || row.created_at,
    expiresAt: row.expires_at,
  }));
}

export function revokeSession(userId: string, sessionId: string): boolean {
  const result = db
    .prepare("DELETE FROM sessions WHERE user_id = ? AND token_hash = ?")
    .run(userId, sessionId);
  return Number(result.changes ?? 0) > 0;
}

export function revokeOtherSessions(userId: string, currentToken: string | undefined): number {
  if (!currentToken) {
    const result = db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
    return Number(result.changes ?? 0);
  }
  const result = db
    .prepare("DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?")
    .run(userId, sha256(currentToken));
  return Number(result.changes ?? 0);
}

export function revokeAllSessions(userId: string): number {
  const result = db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
  return Number(result.changes ?? 0);
}

export function userFromCookieHeader(cookieHeader: string | undefined): UserRow | null {
  const token = parseCookies(cookieHeader)[SESSION_COOKIE];
  return userFromToken(token);
}

export function setSessionCookie(reply: FastifyReply, token: string): void {
  reply.setCookie(SESSION_COOKIE, token, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "1",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, { path: "/" });
}

export function attachUser(request: FastifyRequest): void {
  const row = userFromCookieHeader(request.headers.cookie);
  request.user = row ? toPublicUser(row) : null;
}

export function requireUser(request: FastifyRequest, reply: FastifyReply): void {
  if (!request.user) reply.code(401).send({ error: "Sign in to continue." });
}

export function getSessionToken(request: FastifyRequest): string | undefined {
  return parseCookies(request.headers.cookie)[SESSION_COOKIE];
}

export function validateUsername(value: unknown): string {
  const username = typeof value === "string" ? value.trim() : "";
  if (!/^[a-zA-Z0-9_-]{3,24}$/.test(username)) {
    throw new Error(
      "Username must be 3–24 characters, using letters, numbers, dashes, or underscores."
    );
  }
  return username;
}

export function validateDisplayName(value: unknown): string {
  const displayName = typeof value === "string" ? value.trim() : "";
  if (displayName.length < 2 || displayName.length > 40) {
    throw new Error("Display name must be 2–40 characters.");
  }
  return displayName;
}

export function validatePassword(value: unknown): string {
  const password = typeof value === "string" ? value : "";
  if (password.length < 8 || password.length > 200) {
    throw new Error("Password must be at least 8 characters.");
  }
  return password;
}
