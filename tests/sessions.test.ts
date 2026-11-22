import { describe, expect, it } from "vitest";
import {
  SESSION_CHECKIN_LABELS,
  SESSION_RECURRENCE_LABELS,
  campaignSessionsIcs,
  nextScheduledSession,
  nextSessionTimestamp,
  normalizeSessionAgenda,
  normalizeSessionRecurrence,
  sessionCheckinSummary,
  sessionTiming,
} from "../src/shared/sessions";
import type { CampaignSession, SessionCheckin } from "../src/shared/types";

function checkin(userId: string, status: SessionCheckin["status"]): SessionCheckin {
  return { userId, displayName: userId, avatarUrl: null, status };
}

describe("session agenda", () => {
  it("trims text, drops empty rows, and keeps completion state", () => {
    expect(
      normalizeSessionAgenda([
        { id: "a1", text: "  Open the gate  ", done: true },
        { text: "" },
        { text: "Bargain with the ferryman" },
        null,
      ])
    ).toEqual([
      { id: "a1", text: "Open the gate", done: true },
      { id: "agenda_3", text: "Bargain with the ferryman", done: false },
    ]);
  });

  it("caps the agenda at forty items", () => {
    const items = Array.from({ length: 60 }, (_, index) => ({ text: `Item ${index}` }));
    expect(normalizeSessionAgenda(items)).toHaveLength(40);
  });
});

function session(overrides: Partial<CampaignSession> = {}): CampaignSession {
  return {
    id: "session_1",
    campaignId: "campaign_1",
    title: "Session",
    scheduledAt: 1_000,
    durationMinutes: 60,
    notes: "",
    agenda: [],
    status: "scheduled",
    recurrence: "none",
    attendance: [],
    checkins: [],
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe("session timing", () => {
  it("keeps a scheduled session current after its start time", () => {
    expect(sessionTiming(session({ scheduledAt: 10_000 }), 5_000)).toBe("upcoming");
    expect(sessionTiming(session({ scheduledAt: 10_000 }), 10_000)).toBe("in-progress");
    expect(sessionTiming(session({ scheduledAt: 10_000 }), 50_000)).toBe("in-progress");
    expect(sessionTiming(session({ scheduledAt: 10_000 }), 3_700_000)).toBe("overdue");
  });

  it("picks the earliest remaining scheduled session regardless of the clock", () => {
    const next = nextScheduledSession([
      session({ id: "played", scheduledAt: 1_000, status: "played" }),
      session({ id: "late", scheduledAt: 2_000 }),
      session({ id: "later", scheduledAt: 3_000 }),
      session({ id: "canceled", scheduledAt: 500, status: "canceled" }),
    ]);
    expect(next?.id).toBe("late");
  });
});

describe("session recurrence", () => {
  it("labels and normalizes the cadence options", () => {
    expect(SESSION_RECURRENCE_LABELS.weekly).toBe("Weekly");
    expect(SESSION_RECURRENCE_LABELS.biweekly).toBe("Every 2 weeks");
    expect(SESSION_RECURRENCE_LABELS.monthly).toBe("Monthly");
    expect(normalizeSessionRecurrence("weekly")).toBe("weekly");
    expect(normalizeSessionRecurrence("yearly")).toBe("none");
  });

  it("advances weekly and biweekly sessions by exact days", () => {
    const start = Date.UTC(2026, 0, 5, 19, 0);
    expect(nextSessionTimestamp(start, "weekly") - start).toBe(7 * 86_400_000);
    expect(nextSessionTimestamp(start, "biweekly") - start).toBe(14 * 86_400_000);
    expect(nextSessionTimestamp(start, "none")).toBe(start);
  });

  it("clamps monthly sessions to the end of shorter months", () => {
    const january = new Date(2026, 0, 31, 19, 0).getTime();
    const february = new Date(nextSessionTimestamp(january, "monthly"));
    expect(february.getMonth()).toBe(1);
    expect(february.getDate()).toBe(28);
    expect(february.getHours()).toBe(19);
  });
});

describe("session calendar feed", () => {
  it("exports upcoming sessions without GM notes and skips canceled entries", () => {
    const start = Date.UTC(2026, 0, 5, 19, 0);
    const ics = campaignSessionsIcs({
      campaignName: "Ashen Crown",
      now: start,
      sessions: [
        session({
          id: "sess_one",
          title: "Session 5, The Ashen Gate",
          scheduledAt: start,
          durationMinutes: 180,
          notes: "Secret traitor reveal.",
        }),
        session({ id: "sess_canceled", status: "canceled", scheduledAt: start + 86_400_000 }),
      ],
    });
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("UID:sess_one@runehall.local");
    expect(ics).toContain("DTSTART:20260105T190000Z");
    expect(ics).toContain("DTEND:20260105T220000Z");
    expect(ics).toContain("SUMMARY:Session 5\\, The Ashen Gate");
    expect(ics).toContain("STATUS:TENTATIVE");
    expect(ics).not.toContain("Secret traitor reveal.");
    expect(ics).not.toContain("sess_canceled");
  });
});

describe("session check-ins", () => {
  it("counts each response state", () => {
    expect(
      sessionCheckinSummary([
        checkin("a", "yes"),
        checkin("b", "maybe"),
        checkin("c", "no"),
        checkin("d", "unanswered"),
      ])
    ).toEqual({ yes: 1, maybe: 1, no: 1, unanswered: 1 });
  });

  it("labels every check-in state", () => {
    expect(SESSION_CHECKIN_LABELS.yes).toBe("Checked in");
    expect(SESSION_CHECKIN_LABELS.maybe).toBe("Maybe");
    expect(SESSION_CHECKIN_LABELS.no).toBe("Can't make it");
    expect(SESSION_CHECKIN_LABELS.unanswered).toBe("No response");
  });
});
