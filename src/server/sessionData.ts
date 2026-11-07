import { campaignMembers } from "./access";
import {
  db,
  type CampaignSessionRow,
  type SessionAttendanceRow,
  type SessionCheckinRow,
} from "./db";
import { serializeCampaignSession } from "./serialize";

export function campaignSessionsFor(campaignId: string, role: "gm" | "player", userId: string) {
  const sessions = db
    .prepare(
      "SELECT * FROM campaign_sessions WHERE campaign_id = ? ORDER BY scheduled_at ASC, created_at ASC"
    )
    .all(campaignId) as CampaignSessionRow[];
  if (!sessions.length) return [];
  const attendance = db
    .prepare(
      `SELECT a.* FROM session_attendance a
       JOIN campaign_sessions s ON s.id = a.session_id
       WHERE s.campaign_id = ?`
    )
    .all(campaignId) as SessionAttendanceRow[];
  const bySession = new Map<string, SessionAttendanceRow[]>();
  for (const row of attendance) {
    const rows = bySession.get(row.session_id) ?? [];
    rows.push(row);
    bySession.set(row.session_id, rows);
  }
  const members = campaignMembers(campaignId);
  const checkins = db
    .prepare(
      `SELECT c.* FROM session_checkins c
       JOIN campaign_sessions s ON s.id = c.session_id
       WHERE s.campaign_id = ?`
    )
    .all(campaignId) as SessionCheckinRow[];
  const checkinsBySession = new Map<string, SessionCheckinRow[]>();
  for (const row of checkins) {
    const rows = checkinsBySession.get(row.session_id) ?? [];
    rows.push(row);
    checkinsBySession.set(row.session_id, rows);
  }
  return sessions.map((session) =>
    serializeCampaignSession(
      session,
      members,
      bySession.get(session.id) ?? [],
      checkinsBySession.get(session.id) ?? [],
      role,
      userId
    )
  );
}
