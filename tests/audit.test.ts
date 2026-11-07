import { describe, expect, it } from "vitest";
import {
  AUDIT_RETENTION_MAX_DAYS,
  auditCsv,
  auditRetentionCutoff,
  normalizeAuditRetentionDays,
} from "../src/shared/audit";
import type { AuditEntry } from "../src/shared/types";

const entry: AuditEntry = {
  id: "audit_1",
  createdAt: Date.UTC(2026, 0, 2, 3, 4, 5),
  actorId: "usr_1",
  actorName: "Ada, the GM",
  action: "auth.login",
  targetType: "user",
  targetId: "usr_1",
  detail: 'A "quoted"\nline',
  ip: "127.0.0.1",
};

describe("audit retention", () => {
  it("clamps retention to a safe range", () => {
    expect(normalizeAuditRetentionDays("90")).toBe(90);
    expect(normalizeAuditRetentionDays(-5)).toBe(0);
    expect(normalizeAuditRetentionDays(99_999)).toBe(AUDIT_RETENTION_MAX_DAYS);
    expect(normalizeAuditRetentionDays("nonsense")).toBe(0);
  });

  it("treats zero as keep-forever", () => {
    expect(auditRetentionCutoff(0, 1_000_000)).toBeNull();
    expect(auditRetentionCutoff(10, 1_000_000)).toBe(1_000_000 - 864_000_000);
  });
});

describe("audit CSV", () => {
  it("exports a stable header and escapes commas, quotes, and newlines", () => {
    const csv = auditCsv([entry]);
    const lines = csv.trimEnd().split("\r\n");
    expect(lines[0]).toBe(
      "id,created_at,actor_id,actor_name,action,target_type,target_id,detail,ip"
    );
    expect(lines[1]).toContain('"Ada, the GM"');
    expect(lines[1]).toContain('"A ""quoted""\nline"');
    expect(lines[1]).toContain("2026-01-02T03:04:05.000Z");
  });

  it("handles an empty log", () => {
    expect(auditCsv([])).toBe(
      "id,created_at,actor_id,actor_name,action,target_type,target_id,detail,ip\r\n"
    );
  });

  it("neutralizes spreadsheet formulas in user-controlled fields", () => {
    const csv = auditCsv([{ ...entry, actorName: "=1+1", detail: "@SUM(A1)" }]);
    expect(csv).toContain(",'=1+1,");
    expect(csv).toContain(",'@SUM(A1),");
  });
});
