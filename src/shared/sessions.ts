import type {
  SessionAgendaItem,
  SessionAttendanceStatus,
  SessionCheckin,
  SessionCheckinStatus,
  SessionStatus,
} from "./types";

export const SESSION_STATUS_LABELS: Record<SessionStatus, string> = {
  scheduled: "Scheduled",
  played: "Played",
  canceled: "Canceled",
};

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

const MAX_AGENDA_ITEMS = 40;
const MAX_AGENDA_TEXT = 200;

export function normalizeSessionAgenda(value: unknown): SessionAgendaItem[] {
  if (!Array.isArray(value)) return [];
  const items: SessionAgendaItem[] = [];
  for (const [index, raw] of value.entries()) {
    if (!raw || typeof raw !== "object") continue;
    const record = raw as Record<string, unknown>;
    const text = typeof record.text === "string" ? record.text.trim().slice(0, MAX_AGENDA_TEXT) : "";
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
    { yes: 0, maybe: 0, no: 0, unanswered: 0 },
  );
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
