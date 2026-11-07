import { describe, expect, it } from "vitest";
import {
  SESSION_CHECKIN_LABELS,
  normalizeSessionAgenda,
  sessionCheckinSummary,
} from "../src/shared/sessions";
import type { SessionCheckin } from "../src/shared/types";

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
