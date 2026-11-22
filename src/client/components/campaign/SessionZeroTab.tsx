import { useEffect, useRef, useState } from "react";
import { HeartHandshake, ShieldCheck, Siren } from "lucide-react";
import type {
  CampaignSessionZero,
  SafetyPreference,
  SafetyResponse,
  SessionZeroState,
} from "../../../shared/types";
import {
  SESSION_ZERO_CHECKLIST,
  safetyPreferenceHasContent,
  sessionZeroCompletion,
} from "../../../shared/sessionZero";
import { api } from "../../api";
import { errorMessage } from "../../stores";
import { Badge, Button, Card, Checkbox, Field, Input, PageEyebrow, Tag, Textarea } from "../ui";

interface ProfileForm {
  pitch: string;
  genre: string;
  tone: string;
  themes: string;
  expectations: string;
  houseRules: string;
  contentLimits: string;
  safetyTools: string;
  allowedSources: string;
  partyGoal: string;
  partyHooks: string;
  gmNotes: string;
  checklist: Record<string, boolean>;
}

function profileForm(profile: CampaignSessionZero): ProfileForm {
  return {
    pitch: profile.pitch,
    genre: profile.genre,
    tone: profile.tone,
    themes: profile.themes,
    expectations: profile.expectations,
    houseRules: profile.houseRules,
    contentLimits: profile.contentLimits,
    safetyTools: profile.safetyTools,
    allowedSources: profile.allowedSources,
    partyGoal: profile.partyGoal,
    partyHooks: profile.partyHooks,
    gmNotes: profile.gmNotes ?? "",
    checklist: { ...profile.checklist },
  };
}

function preferenceForm(preference: SafetyPreference | null) {
  return {
    lines: preference?.lines ?? "",
    veils: preference?.veils ?? "",
    notes: preference?.notes ?? "",
    anonymous: preference?.anonymous ?? false,
  };
}

export function SessionZeroTab({
  campaignId,
  isGm,
  refreshKey,
  toast,
}: {
  campaignId: string;
  isGm: boolean;
  refreshKey: number;
  toast: (message: string, kind?: "info" | "success" | "error") => void;
}) {
  const [profile, setProfile] = useState<CampaignSessionZero | null>(null);
  const [preference, setPreference] = useState<SafetyPreference | null>(null);
  const [responses, setResponses] = useState<SafetyResponse[]>([]);
  const [form, setForm] = useState<ProfileForm>(() =>
    profileForm({
      campaignId,
      pitch: "",
      genre: "",
      tone: "",
      themes: "",
      expectations: "",
      houseRules: "",
      contentLimits: "",
      safetyTools: "",
      allowedSources: "",
      partyGoal: "",
      partyHooks: "",
      checklist: {},
      updatedAt: 0,
    })
  );
  const [limits, setLimits] = useState(() => preferenceForm(null));
  const [signalNote, setSignalNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [showCharter, setShowCharter] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const profileRef = useRef<CampaignSessionZero | null>(null);
  const preferenceRef = useRef<SafetyPreference | null>(null);

  const applyState = (state: SessionZeroState) => {
    setProfile(state.profile);
    profileRef.current = state.profile;
    setForm(profileForm(state.profile));
    setPreference(state.preference);
    preferenceRef.current = state.preference;
    setLimits(preferenceForm(state.preference));
    setResponses(state.responses);
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api<SessionZeroState>(`/api/campaigns/${campaignId}/session-zero`)
      .then((state) => {
        if (cancelled) return;
        setProfile(state.profile);
        setResponses(state.responses);
        setPreference(state.preference);
        const previousProfile = profileRef.current;
        profileRef.current = state.profile;
        if (!previousProfile || previousProfile.updatedAt !== state.profile.updatedAt) {
          setForm(profileForm(state.profile));
        }
        const previousPreference = preferenceRef.current;
        preferenceRef.current = state.preference;
        if (
          (!previousPreference && state.preference) ||
          previousPreference?.updatedAt !== state.preference?.updatedAt
        ) {
          setLimits(preferenceForm(state.preference));
        }
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
  }, [campaignId, refreshKey]);

  const setChecklist = (id: string, done: boolean) => {
    setForm((current) => ({ ...current, checklist: { ...current.checklist, [id]: done } }));
  };

  const saveProfile = async () => {
    if (!isGm) return;
    setBusy("profile");
    setError("");
    try {
      const state = await api<SessionZeroState>(`/api/campaigns/${campaignId}/session-zero`, {
        method: "PUT",
        body: form,
      });
      applyState(state);
      toast("Session zero charter saved.", "success");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const saveLimits = async () => {
    setBusy("limits");
    setError("");
    try {
      const result = await api<{ preference: SafetyPreference }>(
        `/api/campaigns/${campaignId}/session-zero/preference`,
        { method: "PUT", body: limits }
      );
      setPreference(result.preference);
      preferenceRef.current = result.preference;
      setLimits(preferenceForm(result.preference));
      toast("Your safety preference was saved privately.", "success");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const signalPause = async () => {
    setBusy("signal");
    setError("");
    try {
      await api(`/api/campaigns/${campaignId}/session-zero/signal`, {
        method: "POST",
        body: { note: signalNote },
      });
      setSignalNote("");
      toast("The GM has been signalled. Take the pause you need.", "success");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <p className="muted small">Loading the table charter…</p>;

  const completion = sessionZeroCompletion(profile ?? { checklist: {} });
  const hasCharter = Boolean(
    profile &&
    (profile.pitch ||
      profile.genre ||
      profile.tone ||
      profile.themes ||
      profile.expectations ||
      profile.houseRules ||
      profile.contentLimits ||
      profile.safetyTools ||
      profile.allowedSources ||
      profile.partyGoal ||
      profile.partyHooks)
  );
  const visibleResponses = responses.filter((response) => safetyPreferenceHasContent(response));

  return (
    <div className="page-inner session-zero-page">
      <div className="section-title">
        <div>
          <PageEyebrow>Table charter</PageEyebrow>
          <h2>Session zero &amp; safety</h2>
          <p>
            Set expectations together, share what should stay off-screen, and give everyone a
            private way to pause the table.
          </p>
        </div>
        <Badge tone={completion.done === completion.total ? "green" : "gold"}>
          <ShieldCheck size={12} /> {completion.done}/{completion.total} checklist
        </Badge>
      </div>

      {error ? <div className="auth-error">{error}</div> : null}

      {isGm ? (
        <div className="session-zero-preview-row">
          <Button variant="ghost" size="sm" onClick={() => setShowCharter((current) => !current)}>
            {showCharter ? "Hide player-facing charter" : "Preview player-facing charter"}
          </Button>
        </div>
      ) : null}

      {!isGm || showCharter ? (
        <Card className="session-zero-charter">
          <div className="row-between">
            <div>
              <PageEyebrow>Shared charter</PageEyebrow>
              <h3>How we play</h3>
            </div>
            <HeartHandshake size={22} />
          </div>
          {hasCharter ? (
            <div className="session-zero-sections">
              {profile?.pitch ? (
                <section>
                  <h4>Pitch</h4>
                  <p>{profile.pitch}</p>
                </section>
              ) : null}
              {profile?.genre || profile?.tone || profile?.themes ? (
                <section>
                  <h4>Genre, tone, and themes</h4>
                  <p>
                    {[profile?.genre, profile?.tone, profile?.themes].filter(Boolean).join(" · ")}
                  </p>
                </section>
              ) : null}
              {profile?.expectations ? (
                <section>
                  <h4>Expectations</h4>
                  <p>{profile.expectations}</p>
                </section>
              ) : null}
              {profile?.houseRules ? (
                <section>
                  <h4>House rules</h4>
                  <p>{profile.houseRules}</p>
                </section>
              ) : null}
              {profile?.contentLimits ? (
                <section>
                  <h4>Content limits</h4>
                  <p>{profile.contentLimits}</p>
                </section>
              ) : null}
              {profile?.safetyTools ? (
                <section>
                  <h4>Safety tools</h4>
                  <p>{profile.safetyTools}</p>
                </section>
              ) : null}
              {profile?.allowedSources ? (
                <section>
                  <h4>Allowed sources</h4>
                  <p>{profile.allowedSources}</p>
                </section>
              ) : null}
              {profile?.partyGoal ? (
                <section>
                  <h4>Party goal</h4>
                  <p>{profile.partyGoal}</p>
                </section>
              ) : null}
              {profile?.partyHooks ? (
                <section>
                  <h4>Party hooks</h4>
                  <p>{profile.partyHooks}</p>
                </section>
              ) : null}
            </div>
          ) : (
            <p className="muted small">
              The GM has not written the shared charter yet. Start with the campaign pitch and the
              tone everyone wants at the table.
            </p>
          )}
        </Card>
      ) : null}

      {isGm ? (
        <Card className="session-zero-editor">
          <div className="row-between">
            <div>
              <PageEyebrow>GM preparation</PageEyebrow>
              <h3>Build the charter</h3>
            </div>
            <Tag tone="gold">Players see every field except GM notes</Tag>
          </div>
          <div className="session-zero-form-grid">
            <Field label="Campaign pitch" className="session-zero-wide">
              <Textarea
                rows={4}
                value={form.pitch}
                onChange={(event) =>
                  setForm((current) => ({ ...current, pitch: event.target.value }))
                }
                placeholder="The promise of the campaign in a few sentences."
              />
            </Field>
            <Field label="Genre">
              <Input
                value={form.genre}
                onChange={(event) =>
                  setForm((current) => ({ ...current, genre: event.target.value }))
                }
                placeholder="Dark fantasy, intrigue, dungeon crawl…"
              />
            </Field>
            <Field label="Tone">
              <Input
                value={form.tone}
                onChange={(event) =>
                  setForm((current) => ({ ...current, tone: event.target.value }))
                }
                placeholder="Heroic, gritty, comedic…"
              />
            </Field>
            <Field label="Themes" className="session-zero-wide">
              <Textarea
                rows={2}
                value={form.themes}
                onChange={(event) =>
                  setForm((current) => ({ ...current, themes: event.target.value }))
                }
                placeholder="Loyalty, survival, costly magic…"
              />
            </Field>
            <Field label="Expectations" className="session-zero-wide">
              <Textarea
                rows={3}
                value={form.expectations}
                onChange={(event) =>
                  setForm((current) => ({ ...current, expectations: event.target.value }))
                }
                placeholder="Attendance, spotlight sharing, PvP, rules questions, and table etiquette."
              />
            </Field>
            <Field label="House rules" className="session-zero-wide">
              <Textarea
                rows={3}
                value={form.houseRules}
                onChange={(event) =>
                  setForm((current) => ({ ...current, houseRules: event.target.value }))
                }
                placeholder="Optional subsystems, variant rules, and table rulings."
              />
            </Field>
            <Field label="Content limits" className="session-zero-wide">
              <Textarea
                rows={3}
                value={form.contentLimits}
                onChange={(event) =>
                  setForm((current) => ({ ...current, contentLimits: event.target.value }))
                }
                placeholder="Shared lines, veils, and subjects that stay off-screen."
              />
            </Field>
            <Field label="Safety tools" className="session-zero-wide">
              <Textarea
                rows={3}
                value={form.safetyTools}
                onChange={(event) =>
                  setForm((current) => ({ ...current, safetyTools: event.target.value }))
                }
                placeholder="Explain the X-card, pause signal, check-ins, and how players can reach you."
              />
            </Field>
            <Field label="Allowed sources" className="session-zero-wide">
              <Textarea
                rows={2}
                value={form.allowedSources}
                onChange={(event) =>
                  setForm((current) => ({ ...current, allowedSources: event.target.value }))
                }
                placeholder="Player Core, GM Core, Monster Core, specific AP volumes, optional rules…"
              />
            </Field>
            <Field label="Party goal" className="session-zero-wide">
              <Textarea
                rows={2}
                value={form.partyGoal}
                onChange={(event) =>
                  setForm((current) => ({ ...current, partyGoal: event.target.value }))
                }
                placeholder="The shared goal that keeps the party together."
              />
            </Field>
            <Field label="Party hooks" className="session-zero-wide">
              <Textarea
                rows={3}
                value={form.partyHooks}
                onChange={(event) =>
                  setForm((current) => ({ ...current, partyHooks: event.target.value }))
                }
                placeholder="Why each character cares, who they trust, and what ties them to the group."
              />
            </Field>
            <Field label="GM-only notes" className="session-zero-wide">
              <Textarea
                rows={3}
                value={form.gmNotes}
                onChange={(event) =>
                  setForm((current) => ({ ...current, gmNotes: event.target.value }))
                }
                placeholder="Private reminders for running the table."
              />
            </Field>
          </div>

          <div className="session-zero-checklist">
            <PageEyebrow>Checklist</PageEyebrow>
            <div className="session-zero-checklist-grid">
              {SESSION_ZERO_CHECKLIST.map((item) => (
                <Checkbox
                  key={item.id}
                  label={item.label}
                  checked={Boolean(form.checklist[item.id])}
                  onChange={(done) => setChecklist(item.id, done)}
                />
              ))}
            </div>
          </div>

          <div className="row-between">
            <span className="tiny muted">Saving notifies connected players.</span>
            <Button
              variant="primary"
              loading={busy === "profile"}
              onClick={() => void saveProfile()}
            >
              Save session zero
            </Button>
          </div>
        </Card>
      ) : null}

      <div className="session-zero-columns">
        <Card className="session-zero-limits">
          <PageEyebrow>Private</PageEyebrow>
          <h3>Your limits</h3>
          <p className="tiny muted">
            Only the GM can read this. Anonymous responses hide your name in the GM's list.
          </p>
          <Field label="Lines I do not want">
            <Textarea
              rows={3}
              value={limits.lines}
              onChange={(event) =>
                setLimits((current) => ({ ...current, lines: event.target.value }))
              }
              placeholder="Subjects that should not appear at all."
            />
          </Field>
          <Field label="Veils (fade to black)">
            <Textarea
              rows={3}
              value={limits.veils}
              onChange={(event) =>
                setLimits((current) => ({ ...current, veils: event.target.value }))
              }
              placeholder="Subjects that can happen off-screen."
            />
          </Field>
          <Field label="Private notes">
            <Textarea
              rows={3}
              value={limits.notes}
              onChange={(event) =>
                setLimits((current) => ({ ...current, notes: event.target.value }))
              }
              placeholder="Anything else the GM should know."
            />
          </Field>
          <Checkbox
            label="Hide my name from the GM's response list"
            checked={limits.anonymous}
            onChange={(anonymous) => setLimits((current) => ({ ...current, anonymous }))}
          />
          <div className="row-between">
            <span className="tiny muted">{preference ? "Saved privately." : "Not saved yet."}</span>
            <Button variant="primary" loading={busy === "limits"} onClick={() => void saveLimits()}>
              Save my limits
            </Button>
          </div>
        </Card>

        <Card className="session-zero-pause">
          <PageEyebrow>Safety tool</PageEyebrow>
          <h3>Pause the table</h3>
          <p className="small">
            Send an anonymous safety signal to the GM. Use it for an X-card, a pause, or a private
            check-in; you do not need to explain it in front of the table.
          </p>
          <Field label="Optional note">
            <Input
              value={signalNote}
              onChange={(event) => setSignalNote(event.target.value)}
              placeholder="Only the GM will see this."
            />
          </Field>
          <Button
            variant="secondary"
            icon={<Siren size={14} />}
            loading={busy === "signal"}
            onClick={() => void signalPause()}
          >
            Pause / X-card
          </Button>
        </Card>
      </div>

      {isGm ? (
        <Card className="session-zero-responses">
          <div className="row-between">
            <div>
              <PageEyebrow>GM eyes only</PageEyebrow>
              <h3>Player limits</h3>
            </div>
            <Badge tone="violet">{visibleResponses.length} responses</Badge>
          </div>
          {visibleResponses.length ? (
            <div className="stack-sm">
              {visibleResponses.map((response) => (
                <div key={response.id} className="session-zero-response">
                  <div className="row-between">
                    <strong>{response.anonymous ? "Anonymous player" : response.authorName}</strong>
                    {response.anonymous ? <Tag tone="gold">Anonymous</Tag> : null}
                  </div>
                  {response.lines ? (
                    <p>
                      <span className="muted">Lines:</span> {response.lines}
                    </p>
                  ) : null}
                  {response.veils ? (
                    <p>
                      <span className="muted">Veils:</span> {response.veils}
                    </p>
                  ) : null}
                  {response.notes ? (
                    <p>
                      <span className="muted">Notes:</span> {response.notes}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="muted small">No players have shared limits yet.</p>
          )}
        </Card>
      ) : null}
    </div>
  );
}
