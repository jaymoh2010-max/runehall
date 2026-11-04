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
  ScrollText,
  Skull,
  Swords,
  Trash2,
  Users,
} from "lucide-react";
import type {
  CampaignDashboard as CampaignDashboardData,
  CampaignThread,
  CharacterRecord,
} from "../../../shared/types";
import { openThreadCount } from "../../../shared/dashboard";
import { api, formatDate } from "../../api";
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
  PageEyebrow,
  Spinner,
  Tag,
  Textarea,
} from "../ui";

type DashboardTab = "table" | "party" | "journal" | "encounters" | "loot";

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
  characters,
  onNavigate,
  toast,
}: {
  campaignId: string;
  isGm: boolean;
  characters: CharacterRecord[];
  onNavigate: (tab: DashboardTab) => void;
  toast: (message: string, kind?: "info" | "success" | "error") => void;
}) {
  const [dashboard, setDashboard] = useState<CampaignDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastSummary, setLastSummary] = useState("");
  const [nextAt, setNextAt] = useState("");
  const [teaser, setTeaser] = useState("");
  const [notes, setNotes] = useState("");
  const [threads, setThreads] = useState<CampaignThread[]>([]);
  const [newThread, setNewThread] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api<{ dashboard: CampaignDashboardData }>(`/api/campaigns/${campaignId}/dashboard`)
      .then((result) => {
        if (cancelled) return;
        setDashboard(result.dashboard);
        setLastSummary(result.dashboard.lastSessionSummary);
        setNextAt(toDateTimeLocal(result.dashboard.nextSessionAt));
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
  }, [campaignId]);

  const completed = useMemo(
    () => characters.filter((character) => character.summary),
    [characters],
  );
  const averageLevel = completed.length
    ? Math.round(
        completed.reduce((total, character) => total + (character.summary?.level ?? 0), 0) /
          completed.length,
      )
    : null;
  const incomplete = characters.length - completed.length;
  const openThreads = openThreadCount(threads);

  const save = async () => {
    setBusy(true);
    try {
      const result = await api<{ dashboard: CampaignDashboardData }>(
        `/api/campaigns/${campaignId}/dashboard`,
        {
          method: "PATCH",
          body: {
            lastSessionSummary: lastSummary,
            nextSessionAt: nextAt ? new Date(nextAt).getTime() : null,
            nextSessionTeaser: teaser,
            nextSessionNotes: notes,
            threads,
          },
        },
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

  const addThread = () => {
    const text = newThread.trim();
    if (!text) return;
    setThreads((current) => [
      ...current,
      { id: newThreadId(), text, done: false, visible: true },
    ]);
    setNewThread("");
  };

  const updateThread = (id: string, patch: Partial<CampaignThread>) => {
    setThreads((current) =>
      current.map((thread) => (thread.id === id ? { ...thread, ...patch } : thread)),
    );
  };

  if (loading) return <div className="page-inner"><Spinner label="Opening the campaign dashboard…" /></div>;
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
            <Tag tone={lastSummary ? "gold" : "neutral"}>{lastSummary ? "Recorded" : "Empty"}</Tag>
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
            <p className="dashboard-prose">{lastSummary}</p>
          ) : (
            <p className="muted small">The GM hasn't written the last session summary yet.</p>
          )}
        </Card>

        <Card className="dashboard-next">
          <div className="row-between">
            <div>
              <PageEyebrow>Next session</PageEyebrow>
              <h3>{formatNextSession(dashboard.nextSessionAt)}</h3>
            </div>
            <CalendarDays size={20} />
          </div>
          {isGm ? (
            <Field label="Date and time">
              <Input type="datetime-local" value={nextAt} onChange={(event) => setNextAt(event.target.value)} />
            </Field>
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
          <div className="dashboard-quick">
            <Button size="sm" variant="secondary" icon={<Map size={14} />} onClick={() => onNavigate("table")}>
              Open table
            </Button>
            <Button size="sm" variant="ghost" icon={<Users size={14} />} onClick={() => onNavigate("party")}>
              Party
            </Button>
            <Button size="sm" variant="ghost" icon={<ScrollText size={14} />} onClick={() => onNavigate("journal")}>
              Journal
            </Button>
            {isGm ? (
              <>
                <Button size="sm" variant="ghost" icon={<Skull size={14} />} onClick={() => onNavigate("encounters")}>
                  Encounters
                </Button>
                <Button size="sm" variant="ghost" icon={<Coins size={14} />} onClick={() => onNavigate("loot")}>
                  Loot
                </Button>
              </>
            ) : null}
          </div>
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
                <Link key={character.id} to={`/characters/${character.id}`} className="dashboard-hero">
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
                        <span>{character.summary.currentHp}/{character.summary.hp} HP</span>
                        <span>AC {character.summary.ac}</span>
                        {character.summary.conditions.length ? (
                          <span className="dashboard-condition">{character.summary.conditions.join(", ")}</span>
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
              <h3>{openThreads} open {openThreads === 1 ? "thread" : "threads"}</h3>
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
                      <IconButton label="Remove thread" onClick={() => setThreads((current) => current.filter((item) => item.id !== thread.id))}>
                        <Trash2 size={13} />
                      </IconButton>
                    </>
                  ) : (
                    <>
                      <span className={`thread-check ${thread.done ? "is-done" : ""}`}>
                        {thread.done ? <Check size={13} /> : null}
                      </span>
                      <span className="dashboard-thread-text">{thread.text}</span>
                      <Tag tone={thread.done ? "green" : "gold"}>{thread.done ? "Done" : "Open"}</Tag>
                    </>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="muted small">No clues or quests yet. Add the threads the party is chasing.</p>
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
              <Button size="sm" variant="secondary" icon={<Plus size={13} />} onClick={addThread} disabled={!newThread.trim()}>
                Add thread
              </Button>
            </div>
          ) : null}
          {dashboard.updatedAt ? (
            <p className="tiny muted">Last updated {formatDate(dashboard.updatedAt)}</p>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
