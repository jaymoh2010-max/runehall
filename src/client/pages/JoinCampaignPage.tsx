import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Crown,
  LogIn,
  Plus,
  ScrollText,
  Sparkles,
  UserPlus,
  Users,
} from "lucide-react";
import type { CampaignRuleset, CharacterRecord } from "../../shared/types";
import { rulesetLabel } from "../../shared/content";
import { api } from "../api";
import { errorMessage, useSession, useToasts } from "../stores";
import {
  Avatar,
  Badge,
  Button,
  EmptyState,
  Field,
  Input,
  LoadingScreen,
  PageEyebrow,
} from "../components/ui";

interface InviteCampaign {
  id: string;
  name: string;
  description: string;
  gmName: string;
  ruleset: CampaignRuleset;
  memberCount: number;
  characterCount: number;
  createdAt: number;
  lastPlayedAt: number | null;
}

interface InviteResponse {
  campaign: InviteCampaign;
  alreadyMember: boolean;
  role: "gm" | "player" | null;
}

export function JoinCampaignPage() {
  const { code = "" } = useParams<{ code: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const user = useSession((state) => state.user);
  const ready = useSession((state) => state.ready);
  const toast = useToasts((state) => state.push);
  const [invite, setInvite] = useState<InviteResponse | null>(null);
  const [characters, setCharacters] = useState<CharacterRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"new" | "existing" | "solo">("new");
  const [newName, setNewName] = useState("");

  const returnPath = useMemo(() => `/join/${encodeURIComponent(code)}`, [code]);
  const authState = { from: returnPath };

  useEffect(() => {
    document.title = "Campaign invite · Runehall";
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    api<InviteResponse>(`/api/invites/${encodeURIComponent(code)}`)
      .then((result) => {
        if (!cancelled) setInvite(result);
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
  }, [code, user?.id]);

  useEffect(() => {
    if (!user || !invite || invite.alreadyMember) {
      setCharacters([]);
      return;
    }
    api<{ characters: CharacterRecord[] }>("/api/characters")
      .then((result) => {
        setCharacters(result.characters.filter((character) => !character.campaignId));
      })
      .catch((err) => toast(errorMessage(err), "error"));
  }, [user, invite, toast]);

  const joinWithCharacter = async (character: CharacterRecord) => {
    if (!invite) return;
    setBusy(true);
    setError("");
    try {
      await api("/api/campaigns/join", {
        method: "POST",
        body: { code, characterId: character.id },
      });
      toast(`${character.name} joined ${invite.campaign.name}.`, "success");
      navigate(character.summary ? `/campaigns/${invite.campaign.id}?tab=party` : `/characters/${character.id}/edit`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const createAndJoin = async (event: FormEvent) => {
    event.preventDefault();
    if (!invite) return;
    setBusy(true);
    setError("");
    try {
      const created = await api<{ character: CharacterRecord }>("/api/characters", {
        method: "POST",
        body: { name: newName.trim() || "New Hero" },
      });
      await api("/api/campaigns/join", {
        method: "POST",
        body: { code, characterId: created.character.id },
      });
      toast(`Welcome to ${invite.campaign.name}.`, "success");
      navigate(`/characters/${created.character.id}/edit`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const joinWithoutCharacter = async () => {
    if (!invite) return;
    setBusy(true);
    setError("");
    try {
      await api("/api/campaigns/join", { method: "POST", body: { code } });
      toast(`Joined ${invite.campaign.name}. You can create a character from the Party tab.`, "success");
      navigate(`/campaigns/${invite.campaign.id}?tab=party`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (loading || !ready) return <LoadingScreen label="Checking your invitation…" />;

  if (error && !invite) {
    return (
      <div className="join-page">
        <div className="join-invalid card">
          <EmptyState
            icon={<ScrollText size={30} />}
            title="That invitation is not valid"
            description="The code may have been regenerated, or the link may be incomplete. Ask your GM for a fresh invite."
            action={
              <div className="row" style={{ justifyContent: "center" }}>
                <Link to="/" className="btn btn-secondary btn-md"><ArrowLeft size={15} /> Back home</Link>
                {user ? <Link to="/campaigns" className="btn btn-primary btn-md">My Campaigns</Link> : null}
              </div>
            }
          />
        </div>
      </div>
    );
  }

  if (!invite) return null;
  const campaign = invite.campaign;
  if (invite.alreadyMember) {
    return (
      <div className="join-page">
        <div className="join-invalid card">
          <div className="join-already-icon"><CheckCircle2 size={30} /></div>
          <PageEyebrow>Already at the table</PageEyebrow>
          <h1>You&apos;re already in {campaign.name}.</h1>
          <p className="muted">
            {invite.role === "gm" ? "You're the GM for this campaign." : "Your seat is saved. Jump back in whenever you're ready."}
          </p>
          <div className="row wrap" style={{ justifyContent: "center", marginTop: 20 }}>
            <Link to={`/campaigns/${campaign.id}`} className="btn btn-primary btn-lg">
              Enter campaign <ArrowRight size={16} />
            </Link>
            <Link to="/campaigns" className="btn btn-secondary btn-lg">My Campaigns</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page join-page">
      <aside className="auth-side join-side">
        <Link to="/" className="brand">
          <img src="/rune.svg" alt="" />
          <span className="brand-word">Rune<span>hall</span></span>
        </Link>
        <div className="join-side-copy">
          <div className="page-eyebrow"><UserPlus size={12} /> You&apos;re invited</div>
          <div className="join-campaign-emblem"><Crown size={22} /></div>
          <h1>{campaign.name}</h1>
          <p>{campaign.description || "A new story is waiting at the table."}</p>
          <div className="join-invite-meta">
            <span><Crown size={14} /> GM: {campaign.gmName}</span>
            <span><Sparkles size={14} /> {rulesetLabel(campaign.ruleset)}</span>
            <span><Users size={14} /> {campaign.memberCount} at the table</span>
            <span><ScrollText size={14} /> {campaign.characterCount} characters</span>
          </div>
        </div>
        <div className="auth-side-quote">
          “Every hero needs a seat, a story, and someone to roll the dice with.”
          <strong>Your campaign is waiting</strong>
        </div>
      </aside>

      <main className="auth-main join-main">
        <div className="auth-card join-card">
          <Link to="/" className="brand auth-brand">
            <img src="/rune.svg" alt="" />
            <span className="brand-word">Rune<span>hall</span></span>
          </Link>

          {!user ? (
            <>
              <PageEyebrow>Join the table</PageEyebrow>
              <h2>Take your seat in {campaign.name}</h2>
              <p className="auth-sub">
                Sign in or create a Runehall account. After that, choose an existing character or create a new one for this campaign.
                Your character will use the <strong>{rulesetLabel(campaign.ruleset)}</strong> ruleset chosen by the GM.
              </p>
              <div className="join-auth-actions">
                <Link to="/register" state={authState} className="btn btn-primary btn-lg btn-block">
                  Create account to join <ChevronRight size={17} />
                </Link>
                <Link to="/login" state={authState} className="btn btn-secondary btn-lg btn-block">
                  <LogIn size={16} /> I already have an account
                </Link>
              </div>
              <div className="auth-hint" style={{ marginTop: 20 }}>
                Your campaign membership and characters will be saved to your account under <strong>My Campaigns</strong>, so you can return for the next session.
              </div>
            </>
          ) : (
            <>
              <PageEyebrow>Choose your hero</PageEyebrow>
              <h2>How are you joining?</h2>
              <p className="auth-sub">
                Signed in as <strong>{user.displayName}</strong>. Bring a hero or forge a new one for this table.
              </p>

              {error ? <div className="auth-error" style={{ marginTop: 14 }}>{error}</div> : null}

              <div className="join-choices">
                <button type="button" className={`join-choice ${mode === "new" ? "is-selected" : ""}`} onClick={() => setMode("new")}>
                  <span className="join-choice-icon"><Plus size={18} /></span>
                  <span><strong>Create a new character</strong><small>Build a fresh hero and join the campaign.</small></span>
                  {mode === "new" ? <CheckCircle2 size={17} /> : null}
                </button>
                <button
                  type="button"
                  className={`join-choice ${mode === "existing" ? "is-selected" : ""}`}
                  onClick={() => setMode("existing")}
                  disabled={!characters.length}
                >
                  <span className="join-choice-icon"><Sparkles size={18} /></span>
                  <span><strong>Bring an existing character</strong><small>{characters.length ? `${characters.length} unassigned hero${characters.length === 1 ? "" : "es"} ready` : "No unassigned characters yet"}</small></span>
                  {mode === "existing" ? <CheckCircle2 size={17} /> : null}
                </button>
              </div>

              {mode === "new" ? (
                <form className="join-new-form" onSubmit={createAndJoin}>
                  <Field label="What's your hero called?">
                    <Input
                      value={newName}
                      onChange={(event) => setNewName(event.target.value)}
                      placeholder="e.g. Sora Vell"
                      autoFocus
                    />
                  </Field>
                  <Button type="submit" variant="primary" size="lg" block loading={busy}>
                    Join and build my character <ArrowRight size={16} />
                  </Button>
                </form>
              ) : (
                <div className="join-character-list">
                  {characters.map((character) => (
                    <button
                      type="button"
                      key={character.id}
                      className="join-character-row"
                      disabled={busy}
                      onClick={() => joinWithCharacter(character)}
                    >
                      <Avatar name={character.name} src={character.summary?.portraitUrl} size={42} />
                      <span className="grow">
                        <strong>{character.name}</strong>
                        <span className="tiny muted">
                          {character.summary
                            ? `Level ${character.summary.level} ${character.summary.className} · ${character.summary.ancestry}`
                            : "Unfinished character"}
                        </span>
                      </span>
                      {character.summary ? <Badge tone="green">Ready</Badge> : <Badge tone="gold">Draft</Badge>}
                      <ArrowRight size={15} />
                    </button>
                  ))}
                  {!characters.length ? (
                    <p className="muted small">
                      You don&apos;t have any unassigned characters. Create a new one instead.
                    </p>
                  ) : null}
                </div>
              )}

              <div className="join-solo-row">
                <span>Just want to look around first?</span>
                <Button variant="ghost" size="sm" onClick={joinWithoutCharacter} loading={busy}>
                  Join without a character
                </Button>
              </div>

              <div className="join-footer-links">
                <Link to="/campaigns" className="tiny muted">My Campaigns</Link>
                <button
                  type="button"
                  className="tiny muted join-signout"
                  onClick={async () => {
                    await useSession.getState().logout();
                  }}
                >
                  Not {user.displayName}? Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
