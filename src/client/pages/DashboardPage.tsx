import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  BookUser,
  CalendarDays,
  Copy,
  Crown,
  Plus,
  ScrollText,
  Sparkles,
  Swords,
  Trash2,
  Upload,
  UserPlus,
  Users,
} from "lucide-react";
import type { CampaignRuleset, CampaignSummary, CharacterRecord, XpMode } from "../../shared/types";
import { CAMPAIGN_RULESET_OPTIONS, XP_MODE_OPTIONS, rulesetLabel } from "../../shared/content";
import { api, copyText, formatDate } from "../api";
import { errorMessage, useSession, useToasts } from "../stores";
import {
  Avatar,
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingScreen,
  Modal,
  PageEyebrow,
  Select,
  Spinner,
  Textarea,
} from "../components/ui";

export function DashboardPage() {
  const user = useSession((state) => state.user);
  const toast = useToasts((state) => state.push);
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [characters, setCharacters] = useState<CharacterRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [characterOpen, setCharacterOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [importPayload, setImportPayload] = useState<Record<string, unknown> | null>(null);
  const [importPreview, setImportPreview] = useState<{
    name: string;
    members: number;
    characters: number;
    ruleset: CampaignRuleset;
  } | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState("");

  const [campaignName, setCampaignName] = useState("");
  const [campaignDescription, setCampaignDescription] = useState("");
  const [campaignRuleset, setCampaignRuleset] = useState<CampaignRuleset>("core");
  const [campaignXpMode, setCampaignXpMode] = useState<XpMode>("milestone");
  const [invite, setInvite] = useState("");
  const [newCharacterName, setNewCharacterName] = useState("");
  const [newCharacterCampaign, setNewCharacterCampaign] = useState("");
  const [formError, setFormError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [campaignResult, characterResult] = await Promise.all([
        api<{ campaigns: CampaignSummary[] }>("/api/campaigns"),
        api<{ characters: CharacterRecord[] }>("/api/characters"),
      ]);
      setCampaigns(campaignResult.campaigns);
      setCharacters(characterResult.characters);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    document.title = "My Campaigns · Runehall";
    void load();
  }, []);

  const campaignNames = useMemo(
    () => new Map(campaigns.map((campaign) => [campaign.id, campaign.name])),
    [campaigns],
  );

  const chooseImportFile = async (file: File | null) => {
    setImportError("");
    setImportPayload(null);
    setImportPreview(null);
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as Record<string, unknown>;
      if (parsed.format !== "runehall-campaign") {
        throw new Error("Choose a .runehall.json campaign export.");
      }
      const campaign = (parsed.campaign ?? {}) as Record<string, unknown>;
      const members = Array.isArray(parsed.members) ? parsed.members.length : 0;
      const characters = Array.isArray(parsed.characters) ? parsed.characters.length : 0;
      setImportPayload(parsed);
      setImportPreview({
        name: typeof campaign.name === "string" ? campaign.name : "Untitled campaign",
        members,
        characters,
        ruleset: (campaign.ruleset as CampaignRuleset) ?? "core",
      });
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "That file could not be read.");
    }
  };

  const importCampaign = async () => {
    if (!importPayload) return;
    setImportBusy(true);
    setImportError("");
    try {
      const result = await api<{ campaign: CampaignSummary }>("/api/campaigns/import", {
        method: "POST",
        body: importPayload,
      });
      setImportOpen(false);
      setImportPayload(null);
      setImportPreview(null);
      toast(`Imported ${result.campaign.name}.`, "success");
      navigate(`/campaigns/${result.campaign.id}`);
    } catch (error) {
      setImportError(errorMessage(error));
    } finally {
      setImportBusy(false);
    }
  };

  const createCampaign = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setFormError("");
    try {
      const result = await api<{ campaign: CampaignSummary }>("/api/campaigns", {
        method: "POST",
        body: {
          name: campaignName,
          description: campaignDescription,
          ruleset: campaignRuleset,
          xpMode: campaignXpMode,
        },
      });
      setCreateOpen(false);
      setCampaignName("");
      setCampaignDescription("");
      setCampaignRuleset("core");
      setCampaignXpMode("milestone");
      toast("Campaign created. Invite your players when you're ready.", "success");
      navigate(`/campaigns/${result.campaign.id}`, { state: { invite: true } });
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const joinCampaign = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setFormError("");
    try {
      const result = await api<{ campaign: CampaignSummary }>("/api/campaigns/join", {
        method: "POST",
        body: { code: invite },
      });
      setJoinOpen(false);
      setInvite("");
      toast(`Joined ${result.campaign.name}.`, "success");
      navigate(`/campaigns/${result.campaign.id}`);
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const createCharacter = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setFormError("");
    try {
      const result = await api<{ character: CharacterRecord }>("/api/characters", {
        method: "POST",
        body: {
          name: newCharacterName || "New Hero",
          campaignId: newCharacterCampaign || null,
        },
      });
      setCharacterOpen(false);
      setNewCharacterName("");
      navigate(`/characters/${result.character.id}/edit`);
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const duplicateCharacter = async (character: CharacterRecord) => {
    try {
      const result = await api<{ character: CharacterRecord }>(`/api/characters/${character.id}/duplicate`, {
        method: "POST",
      });
      toast("Character duplicated.", "success");
      navigate(`/characters/${result.character.id}/edit`);
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  const deleteCharacter = async (character: CharacterRecord) => {
    if (!window.confirm(`Delete ${character.name}? This cannot be undone.`)) return;
    try {
      await api(`/api/characters/${character.id}`, { method: "DELETE" });
      setCharacters((current) => current.filter((item) => item.id !== character.id));
      toast("Character deleted.", "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  if (loading) return <LoadingScreen label="Gathering your campaigns…" />;
  if (error) return <div className="page"><ErrorState message={error} onRetry={load} /></div>;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <PageEyebrow>Welcome back, {user?.displayName?.split(" ")[0]}</PageEyebrow>
          <h1 style={{ marginTop: 7 }}>My Campaigns</h1>
          <p className="sub">Every table, every character, every unfinished map — in one hall. Pick up exactly where you left off.</p>
        </div>
        <div className="page-head-actions">
          <Button icon={<UserPlus size={16} />} onClick={() => { setFormError(""); setJoinOpen(true); }}>
            Join campaign
          </Button>
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => { setFormError(""); setCreateOpen(true); }}>
            Create campaign
          </Button>
          <Button icon={<Upload size={16} />} onClick={() => { setImportError(""); setImportOpen(true); }}>
            Import campaign
          </Button>
        </div>
      </div>

      {campaigns.length === 0 ? (
        <EmptyState
          icon={<Swords size={30} />}
          title="No campaigns yet"
          description="Start a new campaign as the GM, or ask your GM for an invite code and join theirs."
          action={
            <div className="row wrap" style={{ justifyContent: "center" }}>
              <Button variant="primary" icon={<Plus size={16} />} onClick={() => { setFormError(""); setCreateOpen(true); }}>
                Create a campaign
              </Button>
              <Button icon={<UserPlus size={16} />} onClick={() => { setFormError(""); setJoinOpen(true); }}>
                Join with a code
              </Button>
              <Button icon={<Upload size={16} />} onClick={() => { setImportError(""); setImportOpen(true); }}>
                Import campaign
              </Button>
            </div>
          }
        />
      ) : (
        <div className="campaign-grid">
          {campaigns.map((campaign) => (
            <article key={campaign.id} className="campaign-card card card-hover">
              <div className="campaign-card-top">
                <div className="campaign-emblem">
                  <Swords size={20} />
                </div>
                <div className="campaign-meta">
                  <div className="row" style={{ gap: 7 }}>
                    <Badge tone={campaign.role === "gm" ? "gold" : "blue"}>
                      {campaign.role === "gm" ? <Crown size={10} /> : <Users size={10} />}
                      {campaign.role === "gm" ? "Game Master" : "Player"}
                    </Badge>
                    <Badge tone="violet">{rulesetLabel(campaign.ruleset)}</Badge>
                    <Badge tone={campaign.xpMode === "xp" ? "green" : "neutral"}>
                      {campaign.xpMode === "xp" ? "XP budget" : "Milestone"}
                    </Badge>
                    {campaign.lastPlayedAt ? <span className="tiny muted">Played {formatDate(campaign.lastPlayedAt)}</span> : null}
                  </div>
                  <h2>{campaign.name}</h2>
                  <p>{campaign.description || "A new story waiting to be told."}</p>
                </div>
              </div>
              <div className="campaign-card-stats">
                <span><Users size={14} /> {campaign.memberCount} at the table</span>
                <span><BookUser size={14} /> {campaign.characterCount} characters</span>
                <span><CalendarDays size={14} /> Created {formatDate(campaign.createdAt)}</span>
              </div>
              <div className="campaign-card-foot">
                <Link to={`/campaigns/${campaign.id}`} className="btn btn-primary btn-sm">
                  Continue campaign <ArrowRight size={14} />
                </Link>
                {campaign.inviteCode ? (
                  <button
                    type="button"
                    className="invite-chip"
                    title="Copy invite code"
                    onClick={async () => {
                      const copied = await copyText(campaign.inviteCode);
                      toast(copied ? "Invite code copied." : "Could not copy the code.", copied ? "success" : "error");
                    }}
                  >
                    <Copy size={12} /> {campaign.inviteCode}
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="dash-lower">
        <div className="section-title">
          <div>
            <PageEyebrow>Your heroes</PageEyebrow>
            <h2 style={{ marginTop: 5 }}>Characters</h2>
          </div>
          <Button variant="primary" size="sm" icon={<Plus size={15} />} onClick={() => { setFormError(""); setCharacterOpen(true); }}>
            New character
          </Button>
        </div>

        {characters.length === 0 ? (
          <EmptyState
            icon={<BookUser size={28} />}
            title="No characters yet"
            description="Create a hero in a campaign or build one on its own. Every character can be edited, exported, and dropped onto a battle map."
            action={
              <Button variant="primary" icon={<Sparkles size={15} />} onClick={() => { setFormError(""); setCharacterOpen(true); }}>
                Forge a character
              </Button>
            }
          />
        ) : (
          <div className="character-grid">
            {characters.map((character) => (
              <article key={character.id} className="character-card card">
                <Link to={`/characters/${character.id}`} className="character-card-main">
                  <Avatar name={character.name} src={character.summary?.portraitUrl} size={54} />
                  <div className="character-card-copy">
                    <h3>{character.name}</h3>
                    <p>
                      {character.summary
                        ? `Level ${character.summary.level} ${character.summary.className || "Unfinished"}${character.summary.ancestry ? ` · ${character.summary.ancestry}` : ""}`
                        : "Unfinished character"}
                    </p>
                    <span className="tiny muted">
                      {character.campaignId ? campaignNames.get(character.campaignId) || "Campaign" : "Unassigned"}
                      {character.summary ? ` · ${character.summary.hp} HP · AC ${character.summary.ac}` : ""}
                    </span>
                  </div>
                </Link>
                <div className="character-card-actions">
                  <Link to={`/characters/${character.id}/edit`} className="btn btn-ghost btn-sm">
                    Edit
                  </Link>
                  <button className="icon-btn" title="Duplicate" onClick={() => duplicateCharacter(character)}>
                    <Copy size={14} />
                  </button>
                  <button className="icon-btn" title="Delete" onClick={() => deleteCharacter(character)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <div className="dash-footer-note">
        <ScrollText size={15} />
        <span>Runehall runs locally. Your campaigns and characters live in a SQLite database on this machine.</span>
      </div>

      <Modal
        open={importOpen}
        onClose={() => {
          setImportOpen(false);
          setImportPayload(null);
          setImportPreview(null);
          setImportError("");
        }}
        title="Import a campaign"
        subtitle="Choose a .runehall.json export. The imported campaign is created as a new hall."
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setImportOpen(false);
                setImportPayload(null);
                setImportPreview(null);
                setImportError("");
              }}
            >
              Cancel
            </Button>
            <Button variant="primary" icon={<Upload size={14} />} loading={importBusy} disabled={!importPayload} onClick={importCampaign}>
              Import campaign
            </Button>
          </>
        }
      >
        <div className="stack">
          {importError ? <div className="auth-error">{importError}</div> : null}
          <Field label="Campaign export" hint="Choose a .runehall.json file created by Export campaign.">
            <Input
              type="file"
              accept=".json,application/json"
              onChange={(event) => void chooseImportFile(event.target.files?.[0] ?? null)}
            />
          </Field>
          {importPreview ? (
            <div className="import-preview">
              <PageEyebrow>Ready to import</PageEyebrow>
              <h3>{importPreview.name}</h3>
              <p className="muted small">
                {rulesetLabel(importPreview.ruleset)} · {importPreview.members} members · {importPreview.characters} characters
              </p>
              <p className="tiny muted">
                Characters owned by players without a local account are assigned to you. Uploaded image files are not
                copied by this import; use a backup archive to move uploads between machines.
              </p>
            </div>
          ) : null}
        </div>
      </Modal>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create a campaign"
        subtitle="You'll be the GM. The invite code is generated automatically."
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={createCampaign} loading={busy} disabled={!campaignName.trim()}>
              Open the hall
            </Button>
          </>
        }
      >
        <form className="stack" onSubmit={createCampaign}>
          {formError ? <div className="auth-error">{formError}</div> : null}
          <Field label="Campaign name">
            <Input autoFocus value={campaignName} onChange={(event) => setCampaignName(event.target.value)} placeholder="e.g. Crown of the Winter King" />
          </Field>
          <Field label="Premise" hint="A sentence or two for your players.">
            <Textarea value={campaignDescription} onChange={(event) => setCampaignDescription(event.target.value)} placeholder="A frozen kingdom, a missing heir, and a bargain no one remembers making." />
          </Field>
          <Field
            label="Ruleset"
            hint={CAMPAIGN_RULESET_OPTIONS.find((option) => option.value === campaignRuleset)?.description}
          >
            <Select
              value={campaignRuleset}
              onChange={(event) => setCampaignRuleset(event.target.value as CampaignRuleset)}
            >
              {CAMPAIGN_RULESET_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </Select>
          </Field>
          <Field
            label="Advancement"
            hint={XP_MODE_OPTIONS.find((option) => option.value === campaignXpMode)?.description}
          >
            <Select
              value={campaignXpMode}
              onChange={(event) => setCampaignXpMode(event.target.value as XpMode)}
            >
              {XP_MODE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </Select>
          </Field>
          <p className="tiny muted">
            Players inherit this ruleset for their characters. Advancement stays GM-controlled and can be
            changed later in Campaign Settings.
          </p>
        </form>
      </Modal>

      <Modal
        open={joinOpen}
        onClose={() => setJoinOpen(false)}
        title="Join a campaign"
        subtitle="Ask your GM for the seven-character invite code."
        footer={
          <>
            <Button variant="ghost" onClick={() => setJoinOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={joinCampaign} loading={busy} disabled={!invite.trim()}>
              Join the table
            </Button>
          </>
        }
      >
        <form className="stack" onSubmit={joinCampaign}>
          {formError ? <div className="auth-error">{formError}</div> : null}
          <Field label="Invite code or link" hint="Paste the code or the full invite link from your GM.">
            <Input
              autoFocus
              value={invite}
              onChange={(event) => setInvite(event.target.value)}
              placeholder="A7K2M9Q"
              style={{ letterSpacing: "0.08em", fontFamily: "var(--font-head)", fontSize: "1rem" }}
            />
          </Field>
        </form>
      </Modal>

      <Modal
        open={characterOpen}
        onClose={() => setCharacterOpen(false)}
        title="Forge a new hero"
        subtitle="You can change every choice later in the builder."
        footer={
          <>
            <Button variant="ghost" onClick={() => setCharacterOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={createCharacter} loading={busy}>
              Start building
            </Button>
          </>
        }
      >
        <form className="stack" onSubmit={createCharacter}>
          {formError ? <div className="auth-error">{formError}</div> : null}
          <Field label="Character name">
            <Input autoFocus value={newCharacterName} onChange={(event) => setNewCharacterName(event.target.value)} placeholder="e.g. Sora Vell" />
          </Field>
          <Field label="Campaign" hint="You can build a character without a campaign and assign it later.">
            <Select value={newCharacterCampaign} onChange={(event) => setNewCharacterCampaign(event.target.value)}>
              <option value="">No campaign yet</option>
              {campaigns.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>{campaign.name}</option>
              ))}
            </Select>
          </Field>
        </form>
      </Modal>
    </div>
  );
}
