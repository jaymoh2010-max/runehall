import type {
  CampaignSession,
  SessionAgendaItem,
  SessionAttendanceStatus,
  SessionCheckin,
  SessionCheckinStatus,
  SessionRecurrence,
  SessionStatus,
} from "./types";

export const SESSION_STATUS_LABELS: Record<SessionStatus, string> = {
  scheduled: "Scheduled",
  played: "Played",
  canceled: "Canceled",
};

export const SESSION_RECURRENCE_LABELS: Record<SessionRecurrence, string> = {
  none: "Does not repeat",
  weekly: "Weekly",
  biweekly: "Every 2 weeks",
  monthly: "Monthly",
};

export function isSessionRecurrence(value: unknown): value is SessionRecurrence {
  return value === "none" || value === "weekly" || value === "biweekly" || value === "monthly";
}

export function normalizeSessionRecurrence(value: unknown): SessionRecurrence {
  return isSessionRecurrence(value) ? value : "none";
}

/**
 * The next occurrence of a session. Weekly cadences keep the same local
 * weekday and time; monthly repeats clamp to the last day of shorter months.
 */
export function nextSessionTimestamp(timestamp: number, recurrence: SessionRecurrence): number {
  const date = new Date(timestamp);
  if (recurrence === "weekly" || recurrence === "biweekly") {
    date.setDate(date.getDate() + (recurrence === "weekly" ? 7 : 14));
    return date.getTime();
  }
  if (recurrence !== "monthly") return timestamp;
  const day = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + 1);
  const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(day, daysInMonth));
  return date.getTime();
}

export const ATTENDANCE_STATUS_LABELS: Record<SessionAttendanceStatus, string> = {
  attended: "Attended",
  late: "Late",
  absent: "Absent",
  excused: "Excused",
  unmarked: "Unmarked",
};

export const SESSION_CHECKIN_LABELS: Record<SessionCheckinStatus, string> = {
  yes: "Checked in",
  maybe: "Maybe",
  no: "Can't make it",
  unanswered: "No response",
};

export type SessionTiming = "upcoming" | "in-progress" | "overdue";

/** Scheduled sessions stay current until the GM marks them played or canceled. */
export function sessionTiming(session: CampaignSession, nowValue = Date.now()): SessionTiming {
  if (nowValue < session.scheduledAt) return "upcoming";
  const end = session.scheduledAt + Math.max(1, session.durationMinutes) * 60_000;
  return nowValue <= end ? "in-progress" : "overdue";
}

/** The next scheduled session, even if its start time has already passed. */
export function nextScheduledSession(sessions: CampaignSession[]): CampaignSession | null {
  return (
    [...sessions]
      .filter((session) => session.status === "scheduled")
      .sort((a, b) => a.scheduledAt - b.scheduledAt)[0] ?? null
  );
}

const MAX_AGENDA_ITEMS = 40;
const MAX_AGENDA_TEXT = 200;

export function normalizeSessionAgenda(value: unknown): SessionAgendaItem[] {
  if (!Array.isArray(value)) return [];
  const items: SessionAgendaItem[] = [];
  for (const [index, raw] of value.entries()) {
    if (!raw || typeof raw !== "object") continue;
    const record = raw as Record<string, unknown>;
    const text =
      typeof record.text === "string" ? record.text.trim().slice(0, MAX_AGENDA_TEXT) : "";
    if (!text) continue;
    const id =
      typeof record.id === "string" && record.id.trim()
        ? record.id.trim().slice(0, 80)
        : `agenda_${index + 1}`;
    items.push({ id, text, done: record.done === true });
    if (items.length >= MAX_AGENDA_ITEMS) break;
  }
  return items;
}

export function sessionCheckinSummary(checkins: SessionCheckin[]) {
  return checkins.reduce(
    (summary, checkin) => {
      summary[checkin.status] += 1;
      return summary;
    },
    { yes: 0, maybe: 0, no: 0, unanswered: 0 }
  );
}

function icsTimestamp(timestamp: number): string {
  return new Date(timestamp)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function foldIcsLine(line: string): string {
  if (line.length <= 73) return line;
  const parts: string[] = [];
  let rest = line;
  parts.push(rest.slice(0, 73));
  rest = rest.slice(73);
  while (rest.length) {
    parts.push(` ${rest.slice(0, 72)}`);
    rest = rest.slice(72);
  }
  return parts.join("\r\n");
}

/**
 * A player-safe calendar feed. GM notes and the prep agenda are deliberately
 * excluded; canceled sessions are left out so subscribed calendars stay clean.
 */
export function campaignSessionsIcs({
  campaignName,
  sessions,
  now = Date.now(),
}: {
  campaignName: string;
  sessions: CampaignSession[];
  now?: number;
}): string {
  const stamp = icsTimestamp(now);
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Runehall//Campaign Sessions//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcsText(campaignName)}`,
  ];
  for (const session of sessions) {
    if (session.status === "canceled") continue;
    const end = session.scheduledAt + Math.max(1, session.durationMinutes) * 60_000;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${escapeIcsText(session.id)}@runehall.local`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${icsTimestamp(session.scheduledAt)}`,
      `DTEND:${icsTimestamp(end)}`,
      `SUMMARY:${escapeIcsText(session.title)}`,
      `DESCRIPTION:${escapeIcsText(
        `Runehall campaign session (${SESSION_STATUS_LABELS[session.status]}).`
      )}`,
      `STATUS:${session.status === "played" ? "CONFIRMED" : "TENTATIVE"}`,
      "END:VEVENT"
    );
  }
  lines.push("END:VCALENDAR");
  return `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
}

export function isSessionStatus(value: unknown): value is SessionStatus {
  return value === "scheduled" || value === "played" || value === "canceled";
}

export function normalizeSessionStatus(value: unknown): SessionStatus {
  return isSessionStatus(value) ? value : "scheduled";
}

export function isSessionCheckinStatus(value: unknown): value is SessionCheckinStatus {
  return value === "yes" || value === "maybe" || value === "no" || value === "unanswered";
}

export function isAttendanceStatus(value: unknown): value is SessionAttendanceStatus {
  return (
    value === "attended" ||
    value === "late" ||
    value === "absent" ||
    value === "excused" ||
    value === "unmarked"
  );
}

export function normalizeAttendanceStatus(value: unknown): SessionAttendanceStatus {
  return isAttendanceStatus(value) ? value : "unmarked";
}
