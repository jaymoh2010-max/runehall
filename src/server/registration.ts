import { db, type RegistrationInviteRow } from "./db";
import { bootstrapPolicy } from "../shared/registration";
import { inviteCode, newId, now, safeString } from "./util";
import type { RegistrationInvite, RegistrationMode, RegistrationStatus } from "../shared/types";

const MODES: RegistrationMode[] = ["open", "invite", "closed"];
const REGISTRATION_KEY = "registration_mode";
/** Keep the admin invite list small enough to review at a glance. */
export const MAX_PENDING_INVITES = 50;

function isMode(value: unknown): value is RegistrationMode {
  return typeof value === "string" && (MODES as string[]).includes(value);
}

function envMode(): RegistrationMode {
  // Invite-only is the safe default for a self-hosted instance. The first
  // account is still allowed (and becomes the administrator), and the Docker
  // compose file sets this explicitly as well.
  const raw = (process.env.REGISTRATION_MODE ?? "invite").trim().toLowerCase();
  return isMode(raw) ? raw : "invite";
}

export function userCount(): number {
  const row = db.prepare("SELECT COUNT(*) AS count FROM users").get() as { count: number };
  return Number(row?.count ?? 0);
}

export function getRegistrationMode(): RegistrationMode {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = ?").get(REGISTRATION_KEY) as
    { value: string } | undefined;
  return isMode(row?.value) ? row.value : envMode();
}

export function setRegistrationMode(mode: unknown): RegistrationMode {
  if (!isMode(mode)) {
    throw new Error("Registration mode must be open, invite, or closed.");
  }
  db.prepare(
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(REGISTRATION_KEY, mode, now());
  return mode;
}

export function registrationStatus(): RegistrationStatus {
  const mode = getRegistrationMode();
  const count = userCount();
  const policy = bootstrapPolicy({
    userCount: count,
    token: process.env.BOOTSTRAP_TOKEN,
    nodeEnv: process.env.NODE_ENV,
  });
  return {
    mode,
    bootstrap: policy.bootstrap,
    inviteRequired: !policy.bootstrap && mode === "invite",
    bootstrapTokenRequired: policy.tokenRequired,
    bootstrapTokenConfigured: policy.tokenConfigured,
    canRegister: policy.bootstrap ? policy.canRegister : mode === "open" || mode === "invite",
    userCount: count,
  };
}

/**
 * Validate an invite code without consuming it. Consumption is a separate
 * step so a failed registration (duplicate username, bad password) does not
 * burn the invite.
 */
export function requireRegistrationInvite(code: unknown): RegistrationInviteRow | null {
  const status = registrationStatus();
  if (status.bootstrap || status.mode === "open") return null;
  if (status.mode === "closed") {
    throw new Error("Registration is closed. Ask the host for an account.");
  }
  const normalized = safeString(code, "", 40).toUpperCase();
  if (!normalized) throw new Error("An invite code is required to create an account.");
  const invite = db.prepare("SELECT * FROM registration_invites WHERE code = ?").get(normalized) as
    RegistrationInviteRow | undefined;
  if (!invite) throw new Error("That invite code is not valid.");
  if (invite.used_by || invite.used_at) throw new Error("That invite code has already been used.");
  if (invite.expires_at !== null && invite.expires_at <= now()) {
    throw new Error("That invite code has expired.");
  }
  return invite;
}

export function consumeRegistrationInvite(inviteId: string, userId: string): boolean {
  const result = db
    .prepare(
      "UPDATE registration_invites SET used_by = ?, used_at = ? WHERE id = ? AND used_by IS NULL AND used_at IS NULL"
    )
    .run(userId, now(), inviteId);
  return Number(result.changes ?? 0) > 0;
}

function uniqueInviteCode(): string {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = inviteCode();
    if (!db.prepare("SELECT id FROM registration_invites WHERE code = ?").get(code)) return code;
  }
  return inviteCode();
}

function serializeInvite(
  row: RegistrationInviteRow & { used_by_name?: string | null }
): RegistrationInvite {
  return {
    id: row.id,
    code: row.code,
    note: row.note,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    usedBy: row.used_by,
    usedByName: row.used_by_name ?? null,
    usedAt: row.used_at,
  };
}

export function pendingInviteCount(): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS count FROM registration_invites
       WHERE used_by IS NULL AND used_at IS NULL
         AND (expires_at IS NULL OR expires_at > ?)`
    )
    .get(now()) as { count: number };
  return Number(row?.count ?? 0);
}

export function createRegistrationInvite(input: {
  note?: unknown;
  expiresInDays?: unknown;
  createdBy: string;
}): RegistrationInvite {
  if (pendingInviteCount() >= MAX_PENDING_INVITES) {
    throw new Error(
      `There are already ${MAX_PENDING_INVITES} open invites. Revoke one before creating another.`
    );
  }
  const note = safeString(input.note, "", 120);
  const days = Number(input.expiresInDays);
  const expiresAt =
    Number.isFinite(days) && days > 0
      ? now() + Math.max(1, Math.min(365, Math.round(days))) * 24 * 60 * 60 * 1000
      : null;
  const id = newId("invite");
  const code = uniqueInviteCode();
  db.prepare(
    `INSERT INTO registration_invites (id, code, note, created_by, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, code, note, input.createdBy, now(), expiresAt);
  const row = db
    .prepare("SELECT * FROM registration_invites WHERE id = ?")
    .get(id) as RegistrationInviteRow;
  return serializeInvite(row);
}

export function listRegistrationInvites(): RegistrationInvite[] {
  const rows = db
    .prepare(
      `SELECT i.*, u.display_name AS used_by_name
       FROM registration_invites i
       LEFT JOIN users u ON u.id = i.used_by
       ORDER BY i.created_at DESC
       LIMIT 200`
    )
    .all() as (RegistrationInviteRow & { used_by_name: string | null })[];
  return rows.map(serializeInvite);
}

export function revokeRegistrationInvite(id: string): boolean {
  const result = db
    .prepare("DELETE FROM registration_invites WHERE id = ? AND used_by IS NULL")
    .run(id);
  return Number(result.changes ?? 0) > 0;
}
