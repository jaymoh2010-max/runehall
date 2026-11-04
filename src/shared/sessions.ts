import type { SessionAttendanceStatus, SessionStatus } from "./types";

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

export function isSessionStatus(value: unknown): value is SessionStatus {
  return value === "scheduled" || value === "played" || value === "canceled";
}

export function normalizeSessionStatus(value: unknown): SessionStatus {
  return isSessionStatus(value) ? value : "scheduled";
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
