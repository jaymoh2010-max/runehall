import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export function now(): number {
  return Date.now();
}

export function newId(prefix = ""): string {
  const id = crypto.randomBytes(12).toString("hex");
  return prefix ? `${prefix}_${id}` : id;
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function parseCookies(header: string | undefined | null): Record<string, string> {
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(value);
    } catch {
      out[key] = value;
    }
  }
  return out;
}

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

export function dataDir(): string {
  const dir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.resolve("data");
  ensureDir(dir);
  return dir;
}

export function uploadsDir(): string {
  const dir = path.join(dataDir(), "uploads");
  ensureDir(dir);
  return dir;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function safeString(value: unknown, fallback = "", max = 500): string {
  if (typeof value !== "string") return fallback;
  const clean = value.replace(/\u0000/g, "").trim();
  return clean.slice(0, max) || fallback;
}

export function safeInt(value: unknown, fallback = 0, min = -1_000_000, max = 1_000_000): number {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, Math.round(num)));
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function inviteCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  const bytes = crypto.randomBytes(7);
  for (const byte of bytes) code += alphabet[byte % alphabet.length];
  return code;
}

export function sanitizeUserText(value: unknown, max = 20_000): string {
  if (typeof value !== "string") return "";
  return value.replace(/\u0000/g, "").slice(0, max);
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
