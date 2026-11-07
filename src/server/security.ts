import type { FastifyInstance } from "fastify";
import { createRateLimiter } from "./rateLimit";

type Env = Record<string, string | undefined>;

function integerEnv(env: Env, key: string, fallback: number, min: number, max: number): number {
  const value = Number(env[key]);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}

export function buildSecurityHeaders(env: Env = process.env): Record<string, string> {
  const headers: Record<string, string> = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "SAMEORIGIN",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
  };
  const cspEnabled =
    env.ENABLE_CSP === "1" || (env.NODE_ENV === "production" && env.ENABLE_CSP !== "0");
  if (cspEnabled) {
    headers["Content-Security-Policy"] = [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self' ws: wss:",
      "media-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'self'",
    ].join("; ");
  }
  if (env.COOKIE_SECURE === "1") {
    headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains";
  }
  return headers;
}

export function isTrustedOrigin(
  origin: string | undefined,
  host: string | undefined,
  env: Env = process.env
): boolean {
  if (!origin) return true;
  if (origin === "null") return false;
  const trusted = (env.TRUSTED_ORIGINS ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (trusted.includes(origin)) return true;
  try {
    const parsed = new URL(origin);
    return Boolean(host) && parsed.host.toLowerCase() === host!.toLowerCase();
  } catch {
    return false;
  }
}

export function registerSecurity(app: FastifyInstance): void {
  const env = process.env;
  const authLimiter = createRateLimiter({
    max: integerEnv(env, "AUTH_RATE_LIMIT_MAX", 30, 1, 10_000),
    windowMs: integerEnv(env, "AUTH_RATE_LIMIT_WINDOW_MS", 5 * 60_000, 1_000, 86_400_000),
  });
  const uploadLimiter = createRateLimiter({
    max: integerEnv(env, "UPLOAD_RATE_LIMIT_MAX", 60, 1, 10_000),
    windowMs: integerEnv(env, "UPLOAD_RATE_LIMIT_WINDOW_MS", 10 * 60_000, 1_000, 86_400_000),
  });
  const enforceOrigin = env.NODE_ENV === "production" || env.ENFORCE_ORIGIN === "1";
  const headers = buildSecurityHeaders(env);

  app.addHook("onRequest", async (request, reply) => {
    for (const [name, value] of Object.entries(headers)) reply.header(name, value);
    const path = request.url.split("?")[0];
    const method = request.method.toUpperCase();

    if (
      enforceOrigin &&
      ["POST", "PUT", "PATCH", "DELETE"].includes(method) &&
      path.startsWith("/api/") &&
      !isTrustedOrigin(request.headers.origin, request.headers.host, env)
    ) {
      return reply.code(403).send({ error: "Cross-origin request blocked." });
    }

    if (path === "/api/auth/login" || path === "/api/auth/register") {
      const result = authLimiter.check(`${request.ip}:${path}`);
      if (!result.allowed) {
        reply.header("Retry-After", String(result.retryAfterSec));
        return reply.code(429).send({ error: "Too many attempts. Try again later." });
      }
    }

    if (method === "POST" && path === "/api/uploads") {
      const result = uploadLimiter.check(`${request.ip}:upload`);
      if (!result.allowed) {
        reply.header("Retry-After", String(result.retryAfterSec));
        return reply.code(429).send({ error: "Too many uploads. Try again later." });
      }
    }
  });
}
