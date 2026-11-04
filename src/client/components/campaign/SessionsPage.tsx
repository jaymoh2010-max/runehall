import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  CalendarClock,
  Check,
  ListChecks,
  Pencil,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import type {
  CampaignSession,
  SessionAgendaItem,
  SessionAttendanceStatus,
  SessionCheckinStatus,
  SessionStatus,
} from "../../../shared/types";
import {
  ATTENDANCE_STATUS_LABELS,
  SESSION_CHECKIN_LABELS,
  SESSION_STATUS_LABELS,
  sessionCheckinSummary,
} from "../../../shared/sessions";
import { api } from "../../api";
import { errorMessage } from "../../stores";
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  IconButton,
  Input,
  Modal,
  PageEyebrow,
  Select,
  Spinner,
  Tag,
  Textarea,
} from "../ui";

const ATTENDANCE_OPTIONS: SessionAttendanceStatus[] = [
  "unmarked",
  "attended",
  "late",
  "absent",
  "excused",
];

function toDateTimeLocal(timestamp: number | null): string {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function defaultSessionDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(19, 0, 0, 0);
  return toDateTimeLocal(date.getTime());
}

function formatSessionTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatSessionDay(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function SessionsPage({
  campaignId,
  isGm,
  currentUserId,
  toast,
}: {
  campaignId: string;
  isGm: boolean;
  currentUserId: string;
  toast: (message: string, kind?: "info" | "success" | "error") => void;
}) {
  const [sessions, setSessions] = useState<CampaignSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [attendanceBusy, setAttendanceBusy] = useState<string | null>(null);
  const [checkinBusy, setCheckinBusy] = useState<string | null>(null);
  const [editor, setEditor] = useState<CampaignSession | "new" | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api<{ sessions: CampaignSession[] }>(`/api/campaigns/${campaignId}/sessions`)
      .then((result) => {
        if (!cancelled) setSessions(result.sessions);
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  const { upcoming, past } = useMemo(() => {
    const now = Date.now();
    const upcomingEntries = sessions
      .filter((session) => session.status === "scheduled" && session.scheduledAt >= now)
      .sort((a, b) => a.scheduledAt - b.scheduledAt);
    const upcomingIds = new Set(upcomingEntries.map((session) => session.id));
    const pastEntries = sessions
      .filter((session) => !upcomingIds.has(session.id))
      .sort((a, b) => b.scheduledAt - a.scheduledAt);
    return { upcoming: upcomingEntries, past: pastEntries };
  }, [sessions]);

  const replaceSession = (session: CampaignSession) => {
    setSessions((current) =>
      current.some((entry) => entry.id === session.id)
        ? current.map((entry) => (entry.id === session.id ? session : entry))
        : [...current, session],
    );
  };

  const setAttendance = async (
    session: CampaignSession,
    userId: string,
    status: SessionAttendanceStatus,
  ) => {
    const key = `${session.id}:${userId}`;
    setAttendanceBusy(key);
    try {
      const result = await api<{ session: CampaignSession }>(
        `/api/campaigns/${campaignId}/sessions/${session.id}/attendance/${userId}`,
        { method: "PUT", body: { status } },
      );
      replaceSession(result.session);
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setAttendanceBusy(null);
    }
  };

  const setCheckin = async (session: CampaignSession, status: SessionCheckinStatus) => {
    const key = `${session.id}:${currentUserId}`;
    setCheckinBusy(key);
    try {
      const result = await api<{ session: CampaignSession }>(
        `/api/campaigns/${campaignId}/sessions/${session.id}/checkin`,
        { method: "PUT", body: { status } },
      );
      replaceSession(result.session);
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setCheckinBusy(null);
    }
  };

  const markPlayed = async (session: CampaignSession) => {
    setBusy(true);
    try {
      const result = await api<{ session: CampaignSession }>(
        `/api/campaigns/${campaignId}/sessions/${session.id}`,
        { method: "PATCH", body: { status: "played" } },
      );
      replaceSession(result.session);
      toast("Session marked played.", "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  };

  const deleteSession = async (session: CampaignSession) => {
    if (!window.confirm(`Delete “${session.title}”?`)) return;
    setBusy(true);
    try {
      await api(`/api/campaigns/${campaignId}/sessions/${session.id}`, { method: "DELETE" });
      setSessions((current) => current.filter((entry) => entry.id !== session.id));
      toast("Session deleted.", "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  };

  const renderSession = (session: CampaignSession, isPast: boolean) => {
    const ownAttendance = session.attendance[0] ?? null;
    const attended = session.attendance.filter((entry) => entry.status === "attended").length;
    const late = session.attendance.filter((entry) => entry.status === "late").length;
    const checkinSummary = sessionCheckinSummary(session.checkins);
    const showCheckins = !isPast && session.status === "scheduled";
    return (
      <Card key={session.id} className="session-card">
        <div className="session-date">
          <span>{formatSessionDay(session.scheduledAt)}</span>
          <CalendarClock size={17} />
        </div>
        <div className="session-main">
          <div className="row-between">
            <div>
              <div className="row wrap" style={{ gap: 7 }}>
                <h3>{session.title}</h3>
                <Badge
                  tone={
                    session.status === "played"
                      ? "green"
                      : session.status === "canceled"
                        ? "red"
                        : "gold"
                  }
                >
                  {SESSION_STATUS_LABELS[session.status]}
                </Badge>
                {isPast && session.status === "scheduled" ? <Tag tone="red">Overdue</Tag> : null}
              </div>
              <p className="tiny muted">
                {formatSessionTime(session.scheduledAt)} · {session.durationMinutes} min
              </p>
            </div>
            {isGm ? (
              <div className="row" style={{ gap: 4 }}>
                {session.status === "scheduled" ? (
                  <Button size="sm" variant="ghost" icon={<Check size={13} />} loading={busy} onClick={() => void markPlayed(session)}>
                    Mark played
                  </Button>
                ) : null}
                <Button size="sm" variant="ghost" icon={<Pencil size={13} />} onClick={() => setEditor(session)}>
                  Edit
                </Button>
                <IconButton label="Delete session" onClick={() => void deleteSession(session)}>
                  <Trash2 size={13} />
                </IconButton>
              </div>
            ) : null}
          </div>

          {isGm && session.notes ? <p className="session-notes">{session.notes}</p> : null}

          {isGm && session.agenda.length ? (
            <div className="session-agenda">
              <div className="row-between">
                <span className="field-label"><ListChecks size={13} /> Agenda</span>
                <span className="tiny muted">
                  {session.agenda.filter((item) => item.done).length}/{session.agenda.length} done
                </span>
              </div>
              {session.agenda.map((item) => (
                <div key={item.id} className={`session-agenda-item ${item.done ? "is-done" : ""}`}>
                  <span className="session-agenda-check">{item.done ? <Check size={11} /> : null}</span>
                  <span>{item.text}</span>
                </div>
              ))}
            </div>
          ) : null}

          {showCheckins ? (
            <div className="session-checkins">
              <div className="row-between">
                <span className="field-label"><Users size={13} /> Check-in</span>
                <span className="tiny muted">
                  {checkinSummary.yes} in · {checkinSummary.maybe} maybe ·{" "}
                  {checkinSummary.unanswered} no reply
                </span>
              </div>
              {session.checkins.map((entry) => {
                const own = entry.userId === currentUserId;
                const busyKey = `${session.id}:${entry.userId}`;
                return (
                  <div key={entry.userId} className={`session-checkin-row ${own ? "is-self" : ""}`}>
                    <Avatar name={entry.displayName} src={entry.avatarUrl} size={26} />
                    <span className="grow">{entry.displayName}{own ? " (you)" : ""}</span>
                    {own ? (
                      <div className="session-checkin-actions">
                        {(["yes", "maybe", "no"] as const).map((status) => (
                          <Button
                            key={status}
                            size="sm"
                            variant={entry.status === status ? "primary" : "ghost"}
                            loading={checkinBusy === busyKey}
                            onClick={() => void setCheckin(session, status)}
                          >
                            {status === "yes" ? "I'm in" : status === "maybe" ? "Maybe" : "Can't"}
                          </Button>
                        ))}
                      </div>
                    ) : (
                      <Tag
                        tone={
                          entry.status === "yes"
                            ? "green"
                            : entry.status === "maybe"
                              ? "gold"
                              : entry.status === "no"
                                ? "red"
                                : "neutral"
                        }
                      >
                        {SESSION_CHECKIN_LABELS[entry.status]}
                      </Tag>
                    )}
                  </div>
                );
              })}
            </div>
          ) : null}

          {isGm ? (
            <div className="session-attendance">
              <div className="row-between">
                <span className="field-label">Attendance</span>
                <span className="tiny muted">
                  {attended} attended · {late} late · {session.attendance.length} members
                </span>
              </div>
              {session.attendance.map((entry) => {
                const key = `${session.id}:${entry.userId}`;
                return (
                  <div className="session-attendance-row" key={entry.userId}>
                    <Avatar name={entry.displayName} src={entry.avatarUrl} size={28} />
                    <span className="grow">{entry.displayName}</span>
                    <Select
                      value={entry.status}
                      disabled={attendanceBusy === key}
                      onChange={(event) =>
                        void setAttendance(
                          session,
                          entry.userId,
                          event.target.value as SessionAttendanceStatus,
                        )
                      }
                    >
                      {ATTENDANCE_OPTIONS.map((status) => (
                        <option key={status} value={status}>{ATTENDANCE_STATUS_LABELS[status]}</option>
                      ))}
                    </Select>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="session-attendance-self">
              <Users size={14} />
              <span>Your attendance:</span>
              <Tag
                tone={
                  ownAttendance?.status === "attended"
                    ? "green"
                    : ownAttendance?.status === "late"
                      ? "gold"
                      : ownAttendance?.status === "absent"
                        ? "red"
                        : "neutral"
                }
              >
                {ownAttendance ? ATTENDANCE_STATUS_LABELS[ownAttendance.status] : "Not marked"}
              </Tag>
            </div>
          )}
        </div>
      </Card>
    );
  };

  return (
    <div className="page-inner sessions-page">
      <div className="section-title">
        <div>
          <PageEyebrow>Campaign continuity</PageEyebrow>
          <h2>Sessions</h2>
          <p>Schedule the next gathering, keep the calendar visible, and track who made it.</p>
        </div>
        {isGm ? (
          <Button variant="primary" icon={<Plus size={15} />} onClick={() => setEditor("new")}>
            Schedule session
          </Button>
        ) : null}
      </div>

      {error ? <div className="auth-error" style={{ marginBottom: 14 }}>{error}</div> : null}

      {loading ? (
        <Spinner label="Opening the calendar…" />
      ) : !sessions.length ? (
        <EmptyState
          icon={<CalendarClock size={30} />}
          title="Nothing scheduled"
          description={isGm ? "Put the next session on the calendar." : "The GM hasn't scheduled the next session yet."}
          action={isGm ? <Button variant="primary" icon={<Plus size={15} />} onClick={() => setEditor("new")}>Schedule the first session</Button> : undefined}
        />
      ) : (
        <>
          <section className="session-section">
            <div className="session-section-head">
              <h3>Upcoming</h3>
              <Badge tone="gold">{upcoming.length}</Badge>
            </div>
            {upcoming.length ? (
              <div className="session-list">{upcoming.map((session) => renderSession(session, false))}</div>
            ) : (
              <p className="muted small">No upcoming sessions. {isGm ? "Schedule the next one." : "Check back later."}</p>
            )}
          </section>

          {past.length ? (
            <section className="session-section">
              <div className="session-section-head">
                <h3>Past & previous</h3>
                <Badge>{past.length}</Badge>
              </div>
              <div className="session-list">{past.map((session) => renderSession(session, true))}</div>
            </section>
          ) : null}
        </>
      )}

      <SessionEditor
        open={Boolean(editor)}
        session={editor}
        campaignId={campaignId}
        onClose={() => setEditor(null)}
        onSaved={(session) => {
          replaceSession(session);
          setEditor(null);
          toast(editor === "new" ? "Session scheduled." : "Session saved.", "success");
        }}
        onError={(message) => toast(message, "error")}
      />
    </div>
  );
}

function SessionEditor({
  open,
  session,
  campaignId,
  onClose,
  onSaved,
  onError,
}: {
  open: boolean;
  session: CampaignSession | "new" | null;
  campaignId: string;
  onClose: () => void;
  onSaved: (session: CampaignSession) => void;
  onError: (message: string) => void;
}) {
  const editing = session && session !== "new" ? session : null;
  const [title, setTitle] = useState("");
  const [scheduledAt, setScheduledAt] = useState(defaultSessionDate());
  const [duration, setDuration] = useState("180");
  const [status, setStatus] = useState<SessionStatus>("scheduled");
  const [notes, setNotes] = useState("");
  const [agenda, setAgenda] = useState<SessionAgendaItem[]>([]);
  const [agendaText, setAgendaText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setTitle(editing?.title ?? "");
    setScheduledAt(editing ? toDateTimeLocal(editing.scheduledAt) : defaultSessionDate());
    setDuration(String(editing?.durationMinutes ?? 180));
    setStatus(editing?.status ?? "scheduled");
    setNotes(editing?.notes ?? "");
    setAgenda(editing?.agenda ?? []);
    setAgendaText("");
    setError("");
  }, [open, editing?.id]);

  const addAgendaItem = () => {
    const text = agendaText.trim();
    if (!text) return;
    setAgenda((current) => [
      ...current,
      {
        id: `agenda_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        text: text.slice(0, 200),
        done: false,
      },
    ]);
    setAgendaText("");
  };

  const toggleAgendaItem = (id: string) => {
    setAgenda((current) =>
      current.map((item) => (item.id === id ? { ...item, done: !item.done } : item)),
    );
  };

  const removeAgendaItem = (id: string) => {
    setAgenda((current) => current.filter((item) => item.id !== id));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) {
      setError("Give the session a title.");
      return;
    }
    if (!scheduledAt) {
      setError("Choose a date and time.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const payload = {
        title: title.trim(),
        scheduledAt: new Date(scheduledAt).getTime(),
        durationMinutes: Number(duration) || 180,
        status,
        notes,
        agenda,
      };
      const result = editing
        ? await api<{ session: CampaignSession }>(`/api/campaigns/${campaignId}/sessions/${editing.id}`, {
            method: "PATCH",
            body: payload,
          })
        : await api<{ session: CampaignSession }>(`/api/campaigns/${campaignId}/sessions`, {
            method: "POST",
            body: payload,
          });
      onSaved(result.session);
    } catch (err) {
      const message = errorMessage(err);
      setError(message);
      onError(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "Edit session" : "Schedule a session"}
      subtitle="The next scheduled session also appears on the Overview dashboard."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={submit}>
            {editing ? "Save session" : "Schedule session"}
          </Button>
        </>
      }
    >
      <form className="stack" onSubmit={submit}>
        {error ? <div className="auth-error">{error}</div> : null}
        <Field label="Title">
          <Input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Session 5 — The Ashen Gate" />
        </Field>
        <div className="form-grid two">
          <Field label="Date and time">
            <Input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} />
          </Field>
          <Field label="Duration (minutes)">
            <Input type="number" min={30} max={1440} value={duration} onChange={(event) => setDuration(event.target.value)} />
          </Field>
          <Field label="Status">
            <Select value={status} onChange={(event) => setStatus(event.target.value as SessionStatus)}>
              <option value="scheduled">Scheduled</option>
              <option value="played">Played</option>
              <option value="canceled">Canceled</option>
            </Select>
          </Field>
        </div>
        <Field label="GM notes" hint="Only the GM can see these notes.">
          <Textarea
            rows={5}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Open on the ferryman's bargain. Have the vault map ready."
          />
        </Field>
        <Field label="Agenda" hint="A GM-only checklist for this session.">
          <div className="session-agenda-editor">
            {agenda.map((item) => (
              <div key={item.id} className={`session-agenda-edit-row ${item.done ? "is-done" : ""}`}>
                <button
                  type="button"
                  className={`session-agenda-check ${item.done ? "is-done" : ""}`}
                  aria-label={item.done ? "Reopen agenda item" : "Mark agenda item done"}
                  onClick={() => toggleAgendaItem(item.id)}
                >
                  {item.done ? <Check size={11} /> : null}
                </button>
                <span className="grow">{item.text}</span>
                <IconButton label="Remove agenda item" type="button" onClick={() => removeAgendaItem(item.id)}>
                  <Trash2 size={13} />
                </IconButton>
              </div>
            ))}
            <div className="session-agenda-add">
              <Input
                value={agendaText}
                onChange={(event) => setAgendaText(event.target.value)}
                placeholder="Open on the ferryman's bargain"
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addAgendaItem();
                  }
                }}
              />
              <Button type="button" size="sm" variant="secondary" icon={<Plus size={13} />} onClick={addAgendaItem} disabled={!agendaText.trim()}>
                Add
              </Button>
            </div>
            {!agenda.length ? <p className="muted small">No agenda items yet.</p> : null}
          </div>
        </Field>
      </form>
    </Modal>
  );
}
