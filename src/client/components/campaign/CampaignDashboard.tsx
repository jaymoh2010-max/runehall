import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  CalendarDays,
  Check,
  Coins,
  Eye,
  EyeOff,
  Map,
  Plus,
  RefreshCw,
  ScrollText,
  Skull,
  Sparkles,
  Swords,
  Trash2,
  Users,
} from "lucide-react";
import type {
  CampaignDashboard as CampaignDashboardData,
  CampaignSession,
  CampaignThread,
  CharacterRecord,
  JournalEntry,
  SessionRecap,
} from "../../../shared/types";
import { formatGolarionDate, GOLARION_MONTHS, type GolarionDate } from "../../../shared/calendar";
import { openThreadCount } from "../../../shared/dashboard";
import { nextScheduledSession, sessionCheckinSummary } from "../../../shared/sessions";
import { api, formatDate } from "../../api";
import { getSocket } from "../../socket";
import { errorMessage } from "../../stores";
import { JournalBody } from "../JournalBody";
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
  ProgressBar,
  Select,
  Spinner,
  Tag,
  Textarea,
} from "../ui";

type DashboardTab = "table" | "party" | "sessions" | "journal" | "encounters" | "loot";

function toDateTimeLocal(timestamp: number | null): string {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatNextSession(timestamp: number | null): string {
  if (!timestamp) return "Not scheduled";
  return new Date(timestamp).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function newThreadId(): string {
  return `thread_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function CampaignDashboard({
  campaignId,
  isGm,
  currentUserId,
  memberCount,
  journalCount,
  characters,
  worldDate,
  onWorldDateChange,
  onNavigate,
  onJournalCreated,
  onInvite,
  toast,
}: {
  campaignId: string;
  isGm: boolean;
  currentUserId: string;
  memberCount: number;
  journalCount: number;
  characters: CharacterRecord[];
  worldDate: GolarionDate;
  onWorldDateChange: (date: GolarionDate) => void;
  onNavigate: (tab: DashboardTab) => void;
  onJournalCreated: (entry: JournalEntry) => void;
  onInvite: () => void;
  toast: (message: string, kind?: "info" | "success" | "error") => void;
}) {
  const [dashboard, setDashboard] = useState<CampaignDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastSummary, setLastSummary] = useState("");
  const [refreshToken, setRefreshToken] = useState(0);
  const [teaser, setTeaser] = useState("");
  const [notes, setNotes] = useState("");
  const [threads, setThreads] = useState<CampaignThread[]>([]);
  const [newThread, setNewThread] = useState("");
  const [nextSession, setNextSession] = useState<CampaignSession | null>(null);
  const [recapOpen, setRecapOpen] = useState(false);
  const [sessionRecap, setSessionRecap] = useState<SessionRecap | null>(null);
  const [recapDraft, setRecapDraft] = useState("");
  const [recapFrom, setRecapFrom] = useState("");
  const [recapTo, setRecapTo] = useState("");
  const [recapBusy, setRecapBusy] = useState(false);
  const [recapSaving, setRecapSaving] = useState(false);
  const [recapError, setRecapError] = useState("");
  const [recapHandoutSaved, setRecapHandoutSaved] = useState(false);
  const [recapSummarySaved, setRecapSummarySaved] = useState(false);
  const [calendarBusy, setCalendarBusy] = useState(false);
  const [calendarDraft, setCalendarDraft] = useState({
    year: String(worldDate.year),
    month: String(worldDate.month),
    day: String(worldDate.day),
  });

  useEffect(() => {
    setCalendarDraft({
      year: String(worldDate.year),
      month: String(worldDate.month),
      day: String(worldDate.day),
    });
  }, [worldDate.year, worldDate.month, worldDate.day]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api<{ dashboard: CampaignDashboardData }>(`/api/campaigns/${campaignId}/dashboard`)
      .then((result) => {
        if (cancelled) return;
        setDashboard(result.dashboard);
        setLastSummary(result.dashboard.lastSessionSummary);
        setTeaser(result.dashboard.nextSessionTeaser);
        setNotes(result.dashboard.nextSessionNotes);
        setThreads(result.dashboard.threads);
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
  }, [campaignId, refreshToken]);

  useEffect(() => {
    let cancelled = false;
    api<{ sessions: CampaignSession[] }>(`/api/campaigns/${campaignId}/sessions`)
      .then((result) => {
        if (cancelled) return;
        setNextSession(nextScheduledSession(result.sessions));
      })
      .catch(() => {
        // The check-in reminder is optional; the dashboard remains usable without it.
      });
    return () => {
      cancelled = true;
    };
  }, [campaignId, refreshToken]);

  useEffect(() => {
    const socket = getSocket();
    const refresh = (payload: { campaignId: string }) => {
      if (payload.campaignId === campaignId) setRefreshToken((value) => value + 1);
    };
    socket.on("sessions:changed", refresh);
    socket.on("dashboard:updated", refresh);
    return () => {
      socket.off("sessions:changed", refresh);
      socket.off("dashboard:updated", refresh);
    };
  }, [campaignId]);

  const completed = useMemo(
    () => characters.filter((character) => character.summary),
    [characters]
  );
  const averageLevel = completed.length
    ? Math.round(
        completed.reduce((total, character) => total + (character.summary?.level ?? 0), 0) /
          completed.length
      )
    : null;
  const incomplete = characters.length - completed.length;
  const openThreads = openThreadCount(threads);
  const checkinSummary = nextSession ? sessionCheckinSummary(nextSession.checkins) : null;
  const ownCheckin = nextSession?.checkins.find((entry) => entry.userId === currentUserId) ?? null;
  const setupTasks = [
    {
      id: "invite",
      label: "Invite your players",
      done: memberCount > 1,
      actionLabel: "Invite",
      action: onInvite,
    },
    {
      id: "hero",
      label: "Create a character",
      done: characters.length > 0,
      actionLabel: "Create",
      action: () => onNavigate("party"),
    },
    {
      id: "session",
      label: "Schedule a session",
      done: Boolean(nextSession),
      actionLabel: "Schedule",
      action: () => onNavigate("sessions"),
    },
    {
      id: "handout",
      label: "Write a handout",
      done: journalCount > 0,
      actionLabel: "Write",
      action: () => onNavigate("journal"),
    },
  ];
  const setupDone = setupTasks.filter((task) => task.done).length;

  const save = async () => {
    setBusy(true);
    try {
      const result = await api<{ dashboard: CampaignDashboardData }>(
        `/api/campaigns/${campaignId}/dashboard`,
        {
          method: "PATCH",
          body: {
            lastSessionSummary: lastSummary,
            nextSessionTeaser: teaser,
            nextSessionNotes: notes,
            threads,
          },
        }
      );
      setDashboard(result.dashboard);
      setThreads(result.dashboard.threads);
      toast("Campaign dashboard saved.", "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  };

  const advanceCalendar = async (days: number) => {
    setCalendarBusy(true);
    try {
      const result = await api<{ worldDate: GolarionDate }>(
        `/api/campaigns/${campaignId}/calendar/advance`,
        { method: "POST", body: { days } }
      );
      onWorldDateChange(result.worldDate);
      toast(
        `Advanced ${days} day${days === 1 ? "" : "s"} to ${formatGolarionDate(result.worldDate)}.`,
        "success"
      );
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setCalendarBusy(false);
    }
  };

  const setCalendar = async () => {
    setCalendarBusy(true);
    try {
      const result = await api<{ worldDate: GolarionDate }>(
        `/api/campaigns/${campaignId}/calendar`,
        {
          method: "PUT",
          body: {
            year: Number(calendarDraft.year),
            month: Number(calendarDraft.month),
            day: Number(calendarDraft.day),
          },
        }
      );
      onWorldDateChange(result.worldDate);
      toast(`In-world date set to ${formatGolarionDate(result.worldDate)}.`, "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setCalendarBusy(false);
    }
  };

  const generateRecap = async (fromValue: string, toValue: string) => {
    setRecapBusy(true);
    setRecapError("");
    try {
      const params = new URLSearchParams();
      const fromTimestamp = fromValue ? new Date(fromValue).getTime() : NaN;
      const toTimestamp = toValue ? new Date(toValue).getTime() : NaN;
      if (Number.isFinite(fromTimestamp)) params.set("from", String(fromTimestamp));
      if (Number.isFinite(toTimestamp)) params.set("to", String(toTimestamp));
      const query = params.toString();
      const result = await api<{ recap: SessionRecap }>(
        `/api/campaigns/${campaignId}/recap${query ? `?${query}` : ""}`
      );
      setSessionRecap(result.recap);
      setRecapDraft(result.recap.draft);
      setRecapFrom(toDateTimeLocal(result.recap.from));
      setRecapTo(toDateTimeLocal(result.recap.to));
      setRecapHandoutSaved(false);
      setRecapSummarySaved(false);
    } catch (err) {
      setRecapError(errorMessage(err));
    } finally {
      setRecapBusy(false);
    }
  };

  const openRecap = () => {
    setRecapOpen(true);
    setSessionRecap(null);
    setRecapDraft("");
    setRecapFrom("");
    setRecapTo("");
    setRecapError("");
    setRecapHandoutSaved(false);
    setRecapSummarySaved(false);
    void generateRecap("", "");
  };

  const useRecapAsSummary = async () => {
    const text = recapDraft.trim();
    if (!text) return;
    setRecapSaving(true);
    setRecapError("");
    try {
      const result = await api<{ dashboard: CampaignDashboardData }>(
        `/api/campaigns/${campaignId}/dashboard`,
        { method: "PATCH", body: { lastSessionSummary: text } }
      );
      setDashboard(result.dashboard);
      setLastSummary(result.dashboard.lastSessionSummary);
      setRecapSummarySaved(true);
      toast("Session summary updated from the recap.", "success");
    } catch (err) {
      setRecapError(errorMessage(err));
    } finally {
      setRecapSaving(false);
    }
  };

  const saveRecapHandout = async () => {
    const text = recapDraft.trim();
    if (!text) return;
    setRecapSaving(true);
    setRecapError("");
    try {
      const title = sessionRecap?.sessionTitle
        ? `Session recap — ${sessionRecap.sessionTitle}`
        : `Session recap — ${new Date().toLocaleDateString()}`;
      const result = await api<{ entry: JournalEntry }>(`/api/campaigns/${campaignId}/journal`, {
        method: "POST",
        body: {
          title: title.slice(0, 140),
          content: text,
          visible: true,
          kind: "handout",
        },
      });
      onJournalCreated(result.entry);
      setRecapHandoutSaved(true);
      toast("Recap saved as a shared handout.", "success");
    } catch (err) {
      setRecapError(errorMessage(err));
    } finally {
      setRecapSaving(false);
    }
  };

  const addThread = () => {
    const text = newThread.trim();
    if (!text) return;
    setThreads((current) => [...current, { id: newThreadId(), text, done: false, visible: true }]);
    setNewThread("");
  };

  const updateThread = (id: string, patch: Partial<CampaignThread>) => {
    setThreads((current) =>
      current.map((thread) => (thread.id === id ? { ...thread, ...patch } : thread))
    );
  };

  if (loading)
    return (
      <div className="page-inner">
        <Spinner label="Opening the campaign dashboard…" />
      </div>
    );
  if (error || !dashboard) {
    return (
      <div className="page-inner">
        <EmptyState
          icon={<CalendarDays size={28} />}
          title="Could not open the dashboard"
          description={error || "Try reloading the campaign."}
        />
      </div>
    );
  }

  return (
    <div className="page-inner dashboard-page">
      <div className="section-title">
        <div>
          <PageEyebrow>Campaign continuity</PageEyebrow>
          <h2>Overview</h2>
          <p>Last session, next session, the party, and the threads still in play.</p>
        </div>
        {isGm ? (
          <Button variant="primary" loading={busy} onClick={save}>
            Save dashboard
          </Button>
        ) : null}
      </div>

      <div className="dashboard-grid">
        <Card className="dashboard-session">
          <div className="row-between">
            <div>
              <PageEyebrow>Last session</PageEyebrow>
              <h3>What happened?</h3>
            </div>
            <div className="row" style={{ gap: 7 }}>
              {isGm ? (
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Sparkles size={13} />}
                  onClick={openRecap}
                >
                  Generate recap
                </Button>
              ) : null}
              <Tag tone={lastSummary ? "gold" : "neutral"}>
                {lastSummary ? "Recorded" : "Empty"}
              </Tag>
            </div>
          </div>
          {isGm ? (
            <Field label="Session summary" hint="Shared with players on this overview.">
              <Textarea
                rows={8}
                value={lastSummary}
                onChange={(event) => setLastSummary(event.target.value)}
                placeholder="The party opened the eastern vault, bargained with the ferryman, and learned the key has a second half."
              />
            </Field>
          ) : lastSummary ? (
            <JournalBody content={lastSummary} className="dashboard-prose journal-body" />
          ) : (
            <p className="muted small">The GM hasn't written the last session summary yet.</p>
          )}
        </Card>

        <Card className="dashboard-next">
          <div className="row-between">
            <div>
              <PageEyebrow>Next session</PageEyebrow>
              <h3>{formatNextSession(nextSession?.scheduledAt ?? null)}</h3>
            </div>
            <CalendarDays size={20} />
          </div>
          {isGm ? (
            <Button
              size="sm"
              variant="ghost"
              icon={<CalendarDays size={14} />}
              onClick={() => onNavigate("sessions")}
            >
              Schedule in Sessions
            </Button>
          ) : null}
          {isGm ? (
            <Field label="Shared teaser" hint="A spoiler-free line for the players.">
              <Textarea
                rows={2}
                value={teaser}
                onChange={(event) => setTeaser(event.target.value)}
                placeholder="The vault is open. Something is already inside."
              />
            </Field>
          ) : teaser ? (
            <p className="dashboard-prose">{teaser}</p>
          ) : null}
          {isGm ? (
            <Field label="GM notes" hint="Only the GM can see these notes.">
              <Textarea
                rows={4}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Open on the ferryman's reaction, then the vault guardian."
              />
            </Field>
          ) : null}
          {nextSession && checkinSummary ? (
            <div className="dashboard-checkin">
              <div className="row-between">
                <span className="tiny muted">
                  <Users size={12} /> Check-in
                </span>
                <Tag
                  tone={
                    checkinSummary.unanswered || checkinSummary.no || checkinSummary.maybe
                      ? "gold"
                      : "green"
                  }
                >
                  {checkinSummary.yes}/{nextSession.checkins.length} in
                </Tag>
              </div>
              <p className="tiny muted">
                {[
                  checkinSummary.unanswered
                    ? `${checkinSummary.unanswered} ${
                        checkinSummary.unanswered === 1 ? "person hasn't" : "people haven't"
                      } replied.`
                    : "",
                  checkinSummary.maybe
                    ? `${checkinSummary.maybe} ${checkinSummary.maybe === 1 ? "person is" : "people are"} maybe.`
                    : "",
                  checkinSummary.no
                    ? `${checkinSummary.no} ${checkinSummary.no === 1 ? "person can't" : "people can't"} make it.`
                    : "",
                ]
                  .filter(Boolean)
                  .join(" ") || "Everyone checked in."}
                {ownCheckin?.status === "unanswered" ? " Your check-in is missing." : ""}
              </p>
              {ownCheckin?.status === "unanswered" ? (
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Users size={13} />}
                  onClick={() => onNavigate("sessions")}
                >
                  Check in
                </Button>
              ) : null}
            </div>
          ) : null}
          <div className="dashboard-quick">
            <Button
              size="sm"
              variant="secondary"
              icon={<Map size={14} />}
              onClick={() => onNavigate("table")}
            >
              Open table
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon={<Users size={14} />}
              onClick={() => onNavigate("party")}
            >
              Party
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon={<ScrollText size={14} />}
              onClick={() => onNavigate("journal")}
            >
              Journal
            </Button>
            {isGm ? (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Skull size={14} />}
                  onClick={() => onNavigate("encounters")}
                >
                  Encounters
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Coins size={14} />}
                  onClick={() => onNavigate("loot")}
                >
                  Loot
                </Button>
              </>
            ) : null}
          </div>
        </Card>

        <Card className="dashboard-calendar">
          <div className="row-between">
            <div>
              <PageEyebrow>In-world date</PageEyebrow>
              <h3>{formatGolarionDate(worldDate)}</h3>
            </div>
            <CalendarDays size={20} />
          </div>
          {isGm ? (
            <>
              <div className="row wrap" style={{ gap: 6 }}>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  loading={calendarBusy}
                  onClick={() => void advanceCalendar(1)}
                >
                  +1 day
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  loading={calendarBusy}
                  onClick={() => void advanceCalendar(7)}
                >
                  +7 days
                </Button>
              </div>
              <div className="calendar-editor">
                <Input
                  type="number"
                  aria-label="In-world year"
                  min={1}
                  max={9999}
                  value={calendarDraft.year}
                  onChange={(event) =>
                    setCalendarDraft((current) => ({ ...current, year: event.target.value }))
                  }
                />
                <Select
                  aria-label="In-world month"
                  value={calendarDraft.month}
                  onChange={(event) =>
                    setCalendarDraft((current) => ({ ...current, month: event.target.value }))
                  }
                >
                  {GOLARION_MONTHS.map((name, index) => (
                    <option key={name} value={index + 1}>
                      {name}
                    </option>
                  ))}
                </Select>
                <Input
                  type="number"
                  aria-label="In-world day"
                  min={1}
                  max={31}
                  value={calendarDraft.day}
                  onChange={(event) =>
                    setCalendarDraft((current) => ({ ...current, day: event.target.value }))
                  }
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  loading={calendarBusy}
                  onClick={() => void setCalendar()}
                >
                  Set
                </Button>
              </div>
            </>
          ) : (
            <p className="tiny muted">The GM advances the date between sessions.</p>
          )}
        </Card>

        <Card className="dashboard-party">
          <div className="row-between">
            <div>
              <PageEyebrow>The party</PageEyebrow>
              <h3>
                {characters.length} {characters.length === 1 ? "hero" : "heroes"}
                {averageLevel ? ` · average level ${averageLevel}` : ""}
              </h3>
            </div>
            {!characters.length ? (
              <Badge>Empty</Badge>
            ) : incomplete ? (
              <Badge tone="gold">{incomplete} unfinished</Badge>
            ) : (
              <Badge tone="green">Ready</Badge>
            )}
          </div>
          {characters.length ? (
            <div className="dashboard-party-grid">
              {characters.map((character) => (
                <Link
                  key={character.id}
                  to={`/characters/${character.id}`}
                  className="dashboard-hero"
                >
                  <Avatar name={character.name} src={character.summary?.portraitUrl} size={38} />
                  <span className="dashboard-hero-main">
                    <strong>{character.name}</strong>
                    <span className="tiny muted">
                      {character.summary
                        ? `Level ${character.summary.level} ${character.summary.className || ""}`.trim()
                        : "Unfinished character"}
                    </span>
                    {character.summary ? (
                      <span className="dashboard-hero-stats">
                        <span>
                          {character.summary.currentHp}/{character.summary.hp} HP
                        </span>
                        <span>AC {character.summary.ac}</span>
                        {character.summary.conditions.length ? (
                          <span className="dashboard-condition">
                            {character.summary.conditions.join(", ")}
                          </span>
                        ) : null}
                      </span>
                    ) : null}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="muted small">No heroes in this campaign yet.</p>
          )}
        </Card>

        <Card className="dashboard-threads">
          <div className="row-between">
            <div>
              <PageEyebrow>Open clues & quests</PageEyebrow>
              <h3>
                {openThreads} open {openThreads === 1 ? "thread" : "threads"}
              </h3>
            </div>
            <Swords size={19} />
          </div>

          {threads.length ? (
            <div className="dashboard-thread-list">
              {threads.map((thread) => (
                <div key={thread.id} className={`dashboard-thread ${thread.done ? "is-done" : ""}`}>
                  {isGm ? (
                    <>
                      <button
                        type="button"
                        className={`thread-check ${thread.done ? "is-done" : ""}`}
                        aria-label={thread.done ? "Reopen thread" : "Mark thread done"}
                        onClick={() => updateThread(thread.id, { done: !thread.done })}
                      >
                        {thread.done ? <Check size={13} /> : null}
                      </button>
                      <Input
                        value={thread.text}
                        onChange={(event) => updateThread(thread.id, { text: event.target.value })}
                        className="thread-input"
                      />
                      <button
                        type="button"
                        className={`thread-visibility ${thread.visible ? "is-shared" : ""}`}
                        onClick={() => updateThread(thread.id, { visible: !thread.visible })}
                        title={thread.visible ? "Visible to players" : "GM only"}
                      >
                        {thread.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                        <span>{thread.visible ? "Shared" : "GM only"}</span>
                      </button>
                      <IconButton
                        label="Remove thread"
                        onClick={() =>
                          setThreads((current) => current.filter((item) => item.id !== thread.id))
                        }
                      >
                        <Trash2 size={13} />
                      </IconButton>
                    </>
                  ) : (
                    <>
                      <span className={`thread-check ${thread.done ? "is-done" : ""}`}>
                        {thread.done ? <Check size={13} /> : null}
                      </span>
                      <span className="dashboard-thread-text">{thread.text}</span>
                      <Tag tone={thread.done ? "green" : "gold"}>
                        {thread.done ? "Done" : "Open"}
                      </Tag>
                    </>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="muted small">
              No clues or quests yet. Add the threads the party is chasing.
            </p>
          )}

          {isGm ? (
            <div className="dashboard-add-thread">
              <Input
                value={newThread}
                onChange={(event) => setNewThread(event.target.value)}
                placeholder="Find the second half of the silver key"
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addThread();
                  }
                }}
              />
              <Button
                size="sm"
                variant="secondary"
                icon={<Plus size={13} />}
                onClick={addThread}
                disabled={!newThread.trim()}
              >
                Add thread
              </Button>
            </div>
          ) : null}
          {dashboard.updatedAt ? (
            <p className="tiny muted">Last updated {formatDate(dashboard.updatedAt)}</p>
          ) : null}
        </Card>

        {isGm && setupDone < setupTasks.length ? (
          <Card className="dashboard-first-run">
            <div className="row-between">
              <div>
                <PageEyebrow>Table setup</PageEyebrow>
                <h3>Get ready for the first session</h3>
              </div>
              <Badge tone={setupDone ? "gold" : "neutral"}>
                {setupDone}/{setupTasks.length}
              </Badge>
            </div>
            <ProgressBar
              value={setupDone}
              max={setupTasks.length}
              label={
                <span>
                  {setupDone} of {setupTasks.length} steps complete
                </span>
              }
            />
            <div className="dashboard-setup-list">
              {setupTasks.map((task) => (
                <div key={task.id} className={`dashboard-setup-step ${task.done ? "is-done" : ""}`}>
                  <span className="dashboard-setup-check">
                    {task.done ? <Check size={12} /> : null}
                  </span>
                  <span className="grow">{task.label}</span>
                  {task.done ? (
                    <Tag tone="green">Done</Tag>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={task.action}>
                      {task.actionLabel}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </Card>
        ) : null}
      </div>

      <Modal
        open={recapOpen}
        onClose={() => setRecapOpen(false)}
        title="Generate session recap"
        subtitle="Built from shared rolls, visible journal entries, loot, and open threads. GM-only chat and hidden handouts stay out."
        wide
        footer={
          <>
            <Button variant="ghost" onClick={() => setRecapOpen(false)}>
              Done
            </Button>
            <Button
              variant="secondary"
              icon={<ScrollText size={14} />}
              loading={recapSaving}
              onClick={saveRecapHandout}
              disabled={!recapDraft.trim() || recapHandoutSaved}
            >
              Save as handout
            </Button>
            <Button
              variant="primary"
              icon={<Check size={14} />}
              loading={recapSaving}
              onClick={useRecapAsSummary}
              disabled={!recapDraft.trim()}
            >
              Use as summary
            </Button>
          </>
        }
      >
        {recapError ? <div className="auth-error">{recapError}</div> : null}
        <div className="form-grid two">
          <Field label="From">
            <Input
              type="datetime-local"
              value={recapFrom}
              onChange={(event) => setRecapFrom(event.target.value)}
            />
          </Field>
          <Field label="To">
            <Input
              type="datetime-local"
              value={recapTo}
              onChange={(event) => setRecapTo(event.target.value)}
            />
          </Field>
        </div>
        <div className="row wrap" style={{ gap: 7, alignItems: "center" }}>
          <Button
            size="sm"
            variant="ghost"
            icon={<RefreshCw size={13} />}
            loading={recapBusy}
            onClick={() => void generateRecap(recapFrom, recapTo)}
          >
            Rebuild draft
          </Button>
          {sessionRecap ? (
            <span className="tiny muted">
              {sessionRecap.stats.rolls} rolls · {sessionRecap.stats.journalEntries} journal{" "}
              {sessionRecap.stats.journalEntries === 1 ? "entry" : "entries"} ·{" "}
              {sessionRecap.stats.lootParcels} loot{" "}
              {sessionRecap.stats.lootParcels === 1 ? "parcel" : "parcels"} ·{" "}
              {sessionRecap.stats.openThreads} open{" "}
              {sessionRecap.stats.openThreads === 1 ? "thread" : "threads"}
            </span>
          ) : null}
          {recapSummarySaved ? <Tag tone="green">Summary updated</Tag> : null}
          {recapHandoutSaved ? <Tag tone="green">Handout saved</Tag> : null}
        </div>
        {sessionRecap || !recapBusy ? (
          <Field
            label="Draft"
            hint="Edit anything before saving. GM-only chat and hidden handouts are never included."
          >
            <Textarea
              rows={16}
              value={recapDraft}
              onChange={(event) => {
                setRecapDraft(event.target.value);
                setRecapHandoutSaved(false);
                setRecapSummarySaved(false);
              }}
              placeholder="Generate a draft to start from the shared records."
            />
          </Field>
        ) : (
          <Spinner label="Gathering shared records…" />
        )}
      </Modal>
    </div>
  );
}
