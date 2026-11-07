import { describe, expect, it } from "vitest";
import { createRateLimiter } from "../src/server/rateLimit";
import { buildSecurityHeaders, isTrustedOrigin } from "../src/server/security";

describe("rate limiting", () => {
  it("allows requests up to the limit and resets after the window", () => {
    let now = 1_000;
    const limiter = createRateLimiter({ max: 2, windowMs: 1_000, now: () => now });
    expect(limiter.check("ip").allowed).toBe(true);
    expect(limiter.check("ip").allowed).toBe(true);
    const blocked = limiter.check("ip");
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBe(1);
    now += 1_000;
    expect(limiter.check("ip").allowed).toBe(true);
  });

  it("tracks keys independently", () => {
    const limiter = createRateLimiter({ max: 1, windowMs: 1_000, now: () => 1_000 });
    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("b").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(false);
  });
});

describe("security headers", () => {
  it("sets baseline headers and enables CSP in production", () => {
    const headers = buildSecurityHeaders({ NODE_ENV: "production" });
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["X-Frame-Options"]).toBe("SAMEORIGIN");
    expect(headers["Content-Security-Policy"]).toContain("script-src 'self'");
    expect(headers["Content-Security-Policy"]).toContain("style-src 'self' 'unsafe-inline'");
    expect(headers["Strict-Transport-Security"]).toBeUndefined();
  });

  it("allows CSP opt-in and opt-out", () => {
    expect(buildSecurityHeaders({ ENABLE_CSP: "1" })["Content-Security-Policy"]).toBeTruthy();
    expect(
      buildSecurityHeaders({ NODE_ENV: "production", ENABLE_CSP: "0" })["Content-Security-Policy"]
    ).toBeUndefined();
  });

  it("sets HSTS only when secure cookies are enabled", () => {
    expect(buildSecurityHeaders({ COOKIE_SECURE: "1" })["Strict-Transport-Security"]).toContain(
      "max-age=31536000"
    );
  });
});

describe("origin checks", () => {
  it("accepts same-host and explicitly trusted origins", () => {
    expect(isTrustedOrigin(undefined, "runehall.local:3001")).toBe(true);
    expect(isTrustedOrigin("https://runehall.local", "runehall.local")).toBe(true);
    expect(
      isTrustedOrigin("https://table.example.com", "runehall.local", {
        TRUSTED_ORIGINS: "https://table.example.com",
      })
    ).toBe(true);
  });

  it("rejects cross-host and null origins", () => {
    expect(isTrustedOrigin("https://evil.example", "runehall.local")).toBe(false);
    expect(isTrustedOrigin("null", "runehall.local")).toBe(false);
    expect(isTrustedOrigin("not a url", "runehall.local")).toBe(false);
  });
});
