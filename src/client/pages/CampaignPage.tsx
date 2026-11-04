import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  BookOpen,
  CalendarClock,
  CalendarDays,
  Check,
  Coins,
  Copy,
  Crown,
  DoorOpen,
  Download,
  FileImage,
  FilePlus2,
  ImagePlus,
  Images,
  LayoutGrid,
  LogOut,
  Pencil,
  Plus,
  RefreshCw,
  ScrollText,
  Settings,
  Shield,
  Skull,
  Sparkles,
  Swords,
  Trash2,
  UserPlus,
  UserRound,
  Users,
} from "lucide-react";
import type {
  CampaignMember,
  CampaignAsset,
  CampaignRuleset,
  CampaignSummary,
  CampaignTable,
  CharacterRecord,
  JournalAttachment,
  JournalEntry,
  JournalKind,
  Token,
  XpMode,
} from "../../shared/types";
import { CAMPAIGN_RULESET_OPTIONS, XP_MODE_OPTIONS, rulesetLabel } from "../../shared/content";
import { api, copyText, formatDate, uploadImage } from "../api";
import { errorMessage } from "../stores";
import { useSession, useToasts } from "../stores";
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingScreen,
  Modal,
  PageEyebrow,
  RichText,
  Select,
  Spinner,
  Stat,
  Tag,
  Textarea,
  Toggle,
} from "../components/ui";
import { VttTable } from "../components/table/VttTable";
import { InviteModal } from "../components/campaign/InviteModal";
import {
  EncounterBuilder,
  type EncounterLaunchResult,
} from "../components/campaign/EncounterBuilder";
import { LootBuilder } from "../components/campaign/LootBuilder";
import { CampaignDashboard } from "../components/campaign/CampaignDashboard";
import { AssetLibrary } from "../components/campaign/AssetLibrary";
import { NpcLibrary } from "../components/campaign/NpcLibrary";
import { SessionsPage } from "../components/campaign/SessionsPage";
import { GmScreen } from "../components/campaign/GmScreen";
import { JournalBody } from "../components/JournalBody";

type Tab =
  | "table"
  | "overview"
  | "party"
  | "sessions"
  | "encounters"
  | "loot"
  | "npcs"
  | "assets"
  | "journal"
  | "gm-screen"
  | "settings";

const TABS: { id: Tab; label: string; icon: React.ReactNode; gmOnly?: boolean }[] = [
  { id: "table", label: "Table", icon: <LayoutGrid size={15} /> },
  { id: "overview", label: "Overview", icon: <CalendarDays size={15} /> },
  { id: "party", label: "Party", icon: <Users size={15} /> },
  { id: "sessions", label: "Sessions", icon: <CalendarClock size={15} /> },
  { id: "encounters", label: "Encounters", icon: <Skull size={15} />, gmOnly: true },
  { id: "loot", label: "Loot", icon: <Coins size={15} />, gmOnly: true },
  { id: "npcs", label: "NPCs", icon: <UserRound size={15} />, gmOnly: true },
  { id: "assets", label: "Assets", icon: <Images size={15} />, gmOnly: true },
  { id: "journal", label: "Journal", icon: <ScrollText size={15} /> },
  { id: "gm-screen", label: "GM Screen", icon: <Shield size={15} />, gmOnly: true },
  { id: "settings", label: "Settings", icon: <Settings size={15} /> },
];

export function CampaignPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToasts((state) => state.push);
  const user = useSession((state) => state.user);
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get("tab");
  const requestedTab: Tab =
    rawTab === "overview" ||
    rawTab === "party" ||
    rawTab === "sessions" ||
    rawTab === "encounters" ||
    rawTab === "loot" ||
    rawTab === "npcs" ||
    rawTab === "assets" ||
    rawTab === "journal" ||
    rawTab === "gm-screen" ||
    rawTab === "settings"
      ? rawTab
      : "table";
  const [campaign, setCampaign] = useState<CampaignSummary | null>(null);
  const [members, setMembers] = useState<CampaignMember[]>([]);
  const [characters, setCharacters] = useState<CharacterRecord[]>([]);
  const [tableData, setTableData] = useState<CampaignTable | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tableMounted, setTableMounted] = useState(requestedTab === "table");
  const [journalEditor, setJournalEditor] = useState<JournalEntry | "new" | null>(null);
  const [journalTitle, setJournalTitle] = useState("");
  const [journalContent, setJournalContent] = useState("");
  const [journalVisible, setJournalVisible] = useState(true);
  const [journalKind, setJournalKind] = useState<JournalKind>("note");
  const [journalAttachments, setJournalAttachments] = useState<JournalAttachment[]>([]);
  const [journalBusy, setJournalBusy] = useState(false);
  const [journalUploadBusy, setJournalUploadBusy] = useState(false);
  const [journalFilter, setJournalFilter] = useState<"all" | JournalKind>("all");
  const [assetPickerOpen, setAssetPickerOpen] = useState(false);
  const [assetPickerAssets, setAssetPickerAssets] = useState<CampaignAsset[]>([]);
  const [assetPickerLoading, setAssetPickerLoading] = useState(false);
  const [assetPickerError, setAssetPickerError] = useState("");
  const [previewAttachment, setPreviewAttachment] = useState<JournalAttachment | null>(null);
  const [selectedJournalId, setSelectedJournalId] = useState<string | null>(null);
  const journalFileInputRef = useRef<HTMLInputElement>(null);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsName, setSettingsName] = useState("");
  const [settingsDescription, setSettingsDescription] = useState("");
  const [settingsRuleset, setSettingsRuleset] = useState<CampaignRuleset>("core");
  const [settingsXpMode, setSettingsXpMode] = useState<XpMode>("milestone");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [levelUpBusy, setLevelUpBusy] = useState(false);

  const isGm = campaign?.role === "gm";
  const tab: Tab =
    (requestedTab === "encounters" ||
      requestedTab === "loot" ||
      requestedTab === "npcs" ||
      requestedTab === "assets" ||
      requestedTab === "gm-screen") &&
    campaign &&
    !isGm
      ? "table"
      : requestedTab;
  const visibleTabs = isGm ? TABS : TABS.filter((entry) => !entry.gmOnly);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const [details, table] = await Promise.all([
        api<{ campaign: CampaignSummary; members: CampaignMember[]; characters: CharacterRecord[] }>(`/api/campaigns/${id}`),
        api<CampaignTable>(`/api/campaigns/${id}/table`),
      ]);
      setCampaign(details.campaign);
      setMembers(details.members);
      setCharacters(details.characters);
      setTableData(table);
      setSettingsName(details.campaign.name);
      setSettingsDescription(details.campaign.description);
      setSettingsRuleset(details.campaign.ruleset);
      setSettingsXpMode(details.campaign.xpMode);
      setSelectedJournalId((current) => current ?? table.journal[0]?.id ?? null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [id]);

  useEffect(() => {
    if (campaign) document.title = `${campaign.name} · Runehall`;
  }, [campaign]);

  useEffect(() => {
    const shouldInvite = (location.state as { invite?: boolean } | null)?.invite;
    if (shouldInvite && campaign?.role === "gm" && campaign.inviteCode) {
      setInviteOpen(true);
      navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
    }
  }, [campaign?.id, campaign?.role, campaign?.inviteCode, location.pathname, location.search, location.state, navigate]);

  useEffect(() => {
    if (tab === "table") setTableMounted(true);
  }, [tab]);

  // Refresh party/settings data when those tabs are opened so newly joined
  // players and newly created characters show up without a full page reload.
  useEffect(() => {
    if (!id || (tab !== "overview" && tab !== "party" && tab !== "loot" && tab !== "settings")) return;
    let cancelled = false;
    api<{ campaign: CampaignSummary; members: CampaignMember[]; characters: CharacterRecord[] }>(`/api/campaigns/${id}`)
      .then((details) => {
        if (cancelled) return;
        setCampaign(details.campaign);
        setMembers(details.members);
        setCharacters(details.characters);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [id, tab]);

  useEffect(() => {
    if (!journalEditor || journalEditor === "new") {
      if (journalEditor === "new") {
        setJournalTitle("");
        setJournalContent("");
        setJournalVisible(true);
        setJournalKind("note");
        setJournalAttachments([]);
      }
      return;
    }
    setJournalTitle(journalEditor.title);
    setJournalContent(journalEditor.content);
    setJournalVisible(journalEditor.visible);
    setJournalKind(journalEditor.kind);
    setJournalAttachments(journalEditor.attachments);
  }, [journalEditor]);

  const filteredJournal = useMemo(() => {
    const entries = tableData?.journal ?? [];
    if (journalFilter === "all") return entries;
    return entries.filter((entry) => entry.kind === journalFilter);
  }, [tableData, journalFilter]);

  const selectedJournal = useMemo(
    () =>
      filteredJournal.find((entry) => entry.id === selectedJournalId) ??
      filteredJournal[0] ??
      null,
    [filteredJournal, selectedJournalId],
  );

  const setTab = (next: Tab) => {
    setSearchParams(next === "table" ? {} : { tab: next }, { replace: true });
  };

  const createCharacter = async () => {
    if (!campaign) return;
    try {
      const result = await api<{ character: CharacterRecord }>("/api/characters", {
        method: "POST",
        body: { name: "New Hero", campaignId: campaign.id },
      });
      navigate(`/characters/${result.character.id}/edit`);
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  const addJournalImages = async (files: File[]) => {
    if (!files.length) return;
    setJournalUploadBusy(true);
    try {
      for (const file of files.slice(0, 12)) {
        const result = await uploadImage(file, id);
        setJournalAttachments((current) => {
          if (current.length >= 12) return current;
          return [
            ...current,
            {
              id: `att_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
              name: file.name || "Handout image",
              url: result.url,
              mimeType: result.mimeType || file.type || "image/*",
            },
          ];
        });
      }
      toast(files.length === 1 ? "Image attached." : "Images attached.", "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setJournalUploadBusy(false);
    }
  };

  const openAssetPicker = async () => {
    if (!id) return;
    setAssetPickerOpen(true);
    setAssetPickerLoading(true);
    setAssetPickerError("");
    setAssetPickerAssets([]);
    try {
      const result = await api<{ assets: CampaignAsset[] }>(`/api/campaigns/${id}/assets`);
      setAssetPickerAssets(result.assets);
    } catch (err) {
      setAssetPickerError(errorMessage(err));
    } finally {
      setAssetPickerLoading(false);
    }
  };

  const attachAsset = (asset: CampaignAsset) => {
    if (journalAttachments.some((attachment) => attachment.url === asset.url)) {
      toast("That image is already attached.", "info");
      return;
    }
    if (journalAttachments.length >= 12) {
      toast("A handout can hold up to 12 images.", "error");
      return;
    }
    setJournalAttachments((current) => [
      ...current,
      {
        id: `att_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        name: asset.name,
        url: asset.url,
        mimeType: asset.mimeType,
      },
    ]);
    setAssetPickerOpen(false);
    toast("Image attached from the library.", "success");
  };

  const saveJournal = async (event: FormEvent) => {
    event.preventDefault();
    if (!id || !campaign) return;
    setJournalBusy(true);
    try {
      if (journalEditor === "new") {
        const result = await api<{ entry: JournalEntry }>(`/api/campaigns/${id}/journal`, {
          method: "POST",
          body: {
            title: journalTitle,
            content: journalContent,
            visible: journalVisible,
            kind: journalKind,
            attachments: journalAttachments,
          },
        });
        setTableData((current) =>
          current ? { ...current, journal: [result.entry, ...current.journal] } : current,
        );
        setSelectedJournalId(result.entry.id);
      } else if (journalEditor) {
        const result = await api<{ entry: JournalEntry }>(`/api/campaigns/${id}/journal/${journalEditor.id}`, {
          method: "PUT",
          body: {
            title: journalTitle,
            content: journalContent,
            visible: journalVisible,
            kind: journalKind,
            attachments: journalAttachments,
          },
        });
        setTableData((current) =>
          current
            ? { ...current, journal: current.journal.map((entry) => (entry.id === result.entry.id ? result.entry : entry)) }
            : current,
        );
      }
      setJournalEditor(null);
      setJournalFilter("all");
      toast(journalKind === "handout" ? "Handout saved." : "Journal entry saved.", "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setJournalBusy(false);
    }
  };

  const deleteJournal = async (entry: JournalEntry) => {
    if (!id || !window.confirm(`Delete “${entry.title}”?`)) return;
    try {
      await api(`/api/campaigns/${id}/journal/${entry.id}`, { method: "DELETE" });
      setTableData((current) =>
        current ? { ...current, journal: current.journal.filter((item) => item.id !== entry.id) } : current,
      );
      setSelectedJournalId(null);
      toast("Journal entry deleted.", "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  const duplicateJournal = async (entry: JournalEntry) => {
    if (!id) return;
    setJournalBusy(true);
    try {
      const result = await api<{ entry: JournalEntry }>(
        `/api/campaigns/${id}/journal/${entry.id}/duplicate`,
        { method: "POST" },
      );
      setTableData((current) =>
        current
          ? { ...current, journal: [result.entry, ...current.journal] }
          : current,
      );
      setSelectedJournalId(result.entry.id);
      setJournalFilter("all");
      toast("Journal entry duplicated.", "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setJournalBusy(false);
    }
  };

  const saveSettings = async (event: FormEvent) => {
    event.preventDefault();
    if (!id || !campaign) return;
    setSettingsBusy(true);
    try {
      const result = await api<{ campaign: CampaignSummary }>(`/api/campaigns/${id}`, {
        method: "PATCH",
        body: {
          name: settingsName,
          description: settingsDescription,
          ruleset: settingsRuleset,
          xpMode: settingsXpMode,
        },
      });
      setCampaign(result.campaign);
      setTableData((current) =>
        current
          ? {
              ...current,
              campaign: {
                ...current.campaign,
                name: result.campaign.name,
                description: result.campaign.description,
                ruleset: result.campaign.ruleset,
                xpMode: result.campaign.xpMode,
              },
            }
          : current,
      );
      toast("Campaign settings saved.", "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setSettingsBusy(false);
    }
  };

  const regenerateCode = async () => {
    if (!id) return;
    try {
      const result = await api<{ inviteCode: string }>(`/api/campaigns/${id}/regenerate-code`, { method: "POST" });
      setCampaign((current) => (current ? { ...current, inviteCode: result.inviteCode } : current));
      toast("Invite code regenerated.", "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  const removeMember = async (member: CampaignMember) => {
    if (!id || !window.confirm(`Remove ${member.displayName} from the campaign?`)) return;
    try {
      await api(`/api/campaigns/${id}/members/${member.id}`, { method: "DELETE" });
      setMembers((current) => current.filter((item) => item.id !== member.id));
      toast("Member removed.", "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  const leaveCampaign = async () => {
    if (!id || !window.confirm("Leave this campaign?")) return;
    try {
      await api(`/api/campaigns/${id}/leave`, { method: "POST" });
      navigate("/campaigns");
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  const exportCampaign = async () => {
    if (!id || !campaign) return;
    try {
      const payload = await api<Record<string, unknown>>(`/api/campaigns/${id}/export`);
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${campaign.name.replace(/[^a-z0-9-_ ]/gi, "").trim() || "campaign"}.runehall.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast("Campaign archive exported.", "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  const levelUpParty = async () => {
    if (!id || !campaign) return;
    if (
      !window.confirm(
        "Advance every character in this campaign by one level? Players can finish their new choices in the builder.",
      )
    ) {
      return;
    }
    setLevelUpBusy(true);
    try {
      const result = await api<{
        leveled: number;
        atMaxLevel: number;
        skipped: number;
        characters: CharacterRecord[];
      }>(`/api/campaigns/${id}/level-up`, { method: "POST" });
      setCharacters(result.characters);
      setTableData((current) =>
        current ? { ...current, characters: result.characters } : current,
      );
      if (result.leveled > 0) {
        toast(
          `Advanced ${result.leveled} ${result.leveled === 1 ? "character" : "characters"} by one level.`,
          "success",
        );
      } else if (result.atMaxLevel > 0 && result.skipped === 0) {
        toast("Every character is already at level 20.", "info");
      } else {
        toast("No characters could be advanced. Check their drafts in the builder.", "info");
      }
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setLevelUpBusy(false);
    }
  };

  const handleCharacterUpdated = (character: CharacterRecord) => {
    setCharacters((current) =>
      current.map((entry) => (entry.id === character.id ? character : entry)),
    );
    setTableData((current) =>
      current
        ? {
            ...current,
            characters: current.characters.map((entry) =>
              entry.id === character.id ? character : entry,
            ),
          }
        : current,
    );
  };

  const handleNpcTokenCreated = (token: Token, _sceneId: string) => {
    setTableData((current) =>
      current
        ? {
            ...current,
            tokens: current.tokens.some((entry) => entry.id === token.id)
              ? current.tokens
              : [...current.tokens, token],
          }
        : current,
    );
  };

  const handleEncounterLaunch = (result: EncounterLaunchResult) => {
    setTableData((current) => {
      if (!current) return current;
      const known = new Set(current.tokens.map((token) => token.id));
      return {
        ...current,
        activeSceneId: result.sceneId,
        tokens: [
          ...current.tokens,
          ...result.tokens.filter((token) => !known.has(token.id)),
        ],
        initiative: result.initiative,
        round: result.round,
        turnIndex: result.turnIndex,
      };
    });
    setTableMounted(true);
    setTab("table");
  };

  const deleteCampaign = async () => {
    if (!id || !campaign) return;
    if (!window.confirm(`Delete “${campaign.name}” permanently? This removes every scene, character link, and journal entry.`)) return;
    try {
      await api(`/api/campaigns/${id}`, { method: "DELETE" });
      navigate("/campaigns");
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  if (loading) return <LoadingScreen label="Opening the campaign…" />;
  if (error || !campaign || !tableData) {
    return (
      <div className="page">
        <EmptyState
          icon={<Shield size={28} />}
          title="Could not open that campaign"
          description={error || "The campaign may have been deleted."}
          action={<Button onClick={() => navigate("/campaigns")}>Back to campaigns</Button>}
        />
      </div>
    );
  }

  return (
    <div className={`campaign-page ${tab === "table" ? "is-table" : ""}`}>
      <div className="campaign-top">
        <div className="campaign-top-main">
          <Link to="/campaigns" className="back-link"><LayoutGrid size={14} /> All campaigns</Link>
          <div className="campaign-title-row">
            <div className="campaign-title-emblem"><Swords size={22} /></div>
            <div>
              <PageEyebrow>{isGm ? "Game Master's table" : "Player's table"}</PageEyebrow>
              <h1>{campaign.name}</h1>
              <p>{campaign.description || "A story in progress."}</p>
              <div className="chip-row" style={{ marginTop: 7 }}>
                <Tag tone="gold">{rulesetLabel(campaign.ruleset)}</Tag>
              </div>
            </div>
          </div>
        </div>
        <div className="campaign-top-actions">
          {isGm && campaign.inviteCode ? (
            <button
              type="button"
              className="invite-chip large"
              onClick={() => setInviteOpen(true)}
            >
              <UserPlus size={14} /> Invite players <strong>{campaign.inviteCode}</strong> <Copy size={13} />
            </button>
          ) : null}
          <div className="campaign-member-stack">
            {members.slice(0, 5).map((member) => (
              <Avatar key={member.id} name={member.displayName} src={member.avatarUrl} size={30} />
            ))}
            {members.length > 5 ? <span className="avatar-more">+{members.length - 5}</span> : null}
          </div>
        </div>
      </div>

      <nav className="campaign-tabs">
        {visibleTabs.map((entry) => (
          <button key={entry.id} type="button" className={tab === entry.id ? "is-active" : ""} onClick={() => setTab(entry.id)}>
            {entry.icon}
            <span>{entry.label}</span>
            {entry.id === "party" ? <span className="tab-count">{characters.length}</span> : null}
            {entry.id === "journal" ? <span className="tab-count">{tableData.journal.length}</span> : null}
          </button>
        ))}
      </nav>

      <div className="campaign-table" style={{ display: tab === "table" ? undefined : "none" }}>
        {tableMounted ? (
          <VttTable initial={tableData} campaignId={campaign.id} user={user!} isGm={isGm} />
        ) : (
          <Spinner label="Lighting the table…" />
        )}
      </div>

      <div className="campaign-content" style={{ display: tab === "table" ? "none" : undefined }}>
        {tab === "overview" ? (
          <CampaignDashboard
            campaignId={campaign.id}
            isGm={isGm}
            currentUserId={user?.id ?? ""}
            characters={characters}
            onNavigate={(next) => setTab(next)}
            onJournalCreated={(entry) => {
              setTableData((current) =>
                current
                  ? { ...current, journal: [entry, ...current.journal] }
                  : current,
              );
              setSelectedJournalId(entry.id);
            }}
            toast={toast}
          />
        ) : null}

        {tab === "party" ? (
          <div className="page-inner">
            <div className="section-title">
              <div>
                <PageEyebrow>The party</PageEyebrow>
                <h2>Who's at the table?</h2>
                <p>Every hero in this campaign. Open a sheet or make a new character.</p>
              </div>
              <div className="row wrap" style={{ gap: 8 }}>
                {isGm ? (
                  <Button
                    variant="secondary"
                    icon={<Sparkles size={15} />}
                    loading={levelUpBusy}
                    onClick={levelUpParty}
                  >
                    Level up party
                  </Button>
                ) : null}
                <Button variant="primary" icon={<Plus size={15} />} onClick={createCharacter}>New character</Button>
              </div>
            </div>
            <div className="party-grid">
              {characters.map((character) => (
                <article key={character.id} className="party-card card">
                  <div className="party-card-top">
                    <Avatar name={character.name} src={character.summary?.portraitUrl} size={58} />
                    <div className="grow">
                      <div className="row wrap" style={{ gap: 7 }}>
                        <h3>{character.name}</h3>
                        {character.permissions?.canEdit ? <Badge tone="gold">Editable</Badge> : null}
                      </div>
                      <p className="tiny muted">
                        {character.summary
                          ? `Level ${character.summary.level} ${character.summary.className || ""} · ${character.summary.ancestry || "No ancestry"}`
                          : "Unfinished character"}
                      </p>
                      <p className="tiny muted">{character.ownerName ? `Played by ${character.ownerName}` : ""}</p>
                    </div>
                  </div>
                  {character.summary ? (
                    <div className="party-stats">
                      <Stat label="HP" value={character.summary.hp} tone="red" />
                      <Stat label="AC" value={character.summary.ac} tone="gold" />
                      <Stat label="Speed" value={`${character.summary.speed} ft.`} />
                    </div>
                  ) : null}
                  <div className="party-card-actions">
                    <Link to={`/characters/${character.id}`} className="btn btn-secondary btn-sm"><ScrollText size={14} /> Sheet</Link>
                    {character.permissions?.canEdit ? <Link to={`/characters/${character.id}/edit`} className="btn btn-ghost btn-sm"><Pencil size={14} /> Edit</Link> : null}
                  </div>
                </article>
              ))}
              {!characters.length ? (
                <EmptyState
                  icon={<Users size={30} />}
                  title="No heroes yet"
                  description="Create the first character for this campaign."
                  action={<Button variant="primary" icon={<Plus size={15} />} onClick={createCharacter}>Create a character</Button>}
                />
              ) : null}
            </div>
          </div>
        ) : null}

        {tab === "sessions" ? (
          <SessionsPage
            campaignId={campaign.id}
            isGm={isGm}
            currentUserId={user?.id ?? ""}
            toast={toast}
          />
        ) : null}

        {tab === "encounters" ? (
          <EncounterBuilder
            campaignId={campaign.id}
            isGm={isGm}
            xpMode={campaign.xpMode}
            characters={characters}
            scenes={tableData.scenes}
            onLaunched={handleEncounterLaunch}
            toast={toast}
          />
        ) : null}

        {tab === "loot" ? (
          <LootBuilder
            campaignId={campaign.id}
            isGm={isGm}
            ruleset={campaign.ruleset}
            characters={characters}
            onCharacterUpdated={handleCharacterUpdated}
            toast={toast}
          />
        ) : null}

        {tab === "npcs" ? (
          <NpcLibrary
            campaignId={campaign.id}
            isGm={isGm}
            scenes={tableData.scenes}
            activeSceneId={tableData.activeSceneId}
            onTokenCreated={handleNpcTokenCreated}
            toast={toast}
          />
        ) : null}

        {tab === "assets" ? (
          <AssetLibrary campaignId={campaign.id} toast={toast} />
        ) : null}

        {tab === "journal" ? (
          <div className="page-inner journal-layout">
            <div className="journal-list">
              <div className="row-between" style={{ marginBottom: 10 }}>
                <div>
                  <PageEyebrow>Chronicle</PageEyebrow>
                  <h2 style={{ marginTop: 5 }}>Journal</h2>
                </div>
                {isGm ? <Button size="sm" variant="primary" icon={<FilePlus2 size={14} />} onClick={() => setJournalEditor("new")}>New entry</Button> : null}
              </div>
              <div className="segmented journal-filter">
                <button type="button" className={journalFilter === "all" ? "is-active" : ""} onClick={() => setJournalFilter("all")}>All</button>
                <button type="button" className={journalFilter === "note" ? "is-active" : ""} onClick={() => setJournalFilter("note")}>Entries</button>
                <button type="button" className={journalFilter === "handout" ? "is-active" : ""} onClick={() => setJournalFilter("handout")}><FileImage size={12} /> Handouts</button>
              </div>
              {filteredJournal.map((entry) => (
                <button
                  type="button"
                  key={entry.id}
                  className={`journal-list-item ${selectedJournal?.id === entry.id ? "is-selected" : ""}`}
                  onClick={() => setSelectedJournalId(entry.id)}
                >
                  <span className="journal-list-title">{entry.title}</span>
                  <span className="journal-list-meta">
                    {entry.kind === "handout" ? <Tag tone="violet">Handout</Tag> : null}
                    <span className="tiny muted">{formatDate(entry.updatedAt)} · {entry.visible ? "Visible" : "GM only"}</span>
                  </span>
                </button>
              ))}
              {!filteredJournal.length ? (
                <p className="muted small">
                  {journalFilter === "handout"
                    ? "No handouts yet. Create one to share a map, letter, or clue."
                    : journalFilter === "note"
                      ? "No journal entries yet."
                      : isGm
                        ? "Write the first page of the chronicle."
                        : "The GM hasn't shared any notes yet."}
                </p>
              ) : null}
            </div>
            <div className="journal-detail card">
              {selectedJournal ? (
                <>
                  <div className="journal-detail-head">
                    <div>
                      <PageEyebrow>
                        {selectedJournal.kind === "handout" ? "Handout" : "Chronicle"} ·{" "}
                        {selectedJournal.visible ? "shared" : "GM only"}
                      </PageEyebrow>
                      <div className="row wrap" style={{ gap: 7, alignItems: "center", marginTop: 4 }}>
                        <h2>{selectedJournal.title}</h2>
                        {selectedJournal.kind === "handout" ? <Tag tone="violet">Handout</Tag> : null}
                      </div>
                      <p className="tiny muted">Written by {selectedJournal.authorName} · {formatDate(selectedJournal.updatedAt)}</p>
                    </div>
                    {isGm ? (
                      <div className="row" style={{ gap: 6 }}>
                        <Button size="sm" variant="ghost" icon={<Pencil size={13} />} onClick={() => setJournalEditor(selectedJournal)}>Edit</Button>
                        <Button size="sm" variant="ghost" icon={<Copy size={13} />} loading={journalBusy} onClick={() => duplicateJournal(selectedJournal)}>Duplicate</Button>
                        <button className="icon-btn" title="Delete entry" onClick={() => deleteJournal(selectedJournal)}><Trash2 size={14} /></button>
                      </div>
                    ) : null}
                  </div>
                  {selectedJournal.attachments.length ? (
                    <div className="handout-gallery">
                      {selectedJournal.attachments.map((attachment) => (
                        <button
                          type="button"
                          key={attachment.id}
                          className="handout-thumb"
                          onClick={() => setPreviewAttachment(attachment)}
                        >
                          <img src={attachment.url} alt={attachment.name} loading="lazy" />
                          <span>{attachment.name}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <JournalBody content={selectedJournal.content} className="journal-body" />
                </>
              ) : (
                <EmptyState icon={<ScrollText size={28} />} title="The page is blank" description="Choose an entry or write a new one." />
              )}
            </div>
          </div>
        ) : null}

        {tab === "gm-screen" ? (
          <GmScreen
            campaignId={campaign.id}
            characters={characters}
            toast={toast}
          />
        ) : null}

        {tab === "settings" ? (
          <div className="page-inner settings-layout">
            <Card className="settings-card">
              <PageEyebrow>Campaign settings</PageEyebrow>
              <h2 style={{ marginTop: 6 }}>The shape of the story</h2>
              <form className="stack" style={{ marginTop: 16 }} onSubmit={saveSettings}>
                <Field label="Campaign name">
                  <Input value={settingsName} onChange={(event) => setSettingsName(event.target.value)} disabled={!isGm} />
                </Field>
                <Field label="Premise">
                  <Textarea value={settingsDescription} onChange={(event) => setSettingsDescription(event.target.value)} disabled={!isGm} />
                </Field>
                <Field
                  label="Ruleset"
                  hint={
                    isGm
                      ? CAMPAIGN_RULESET_OPTIONS.find((option) => option.value === settingsRuleset)?.description
                      : "Set by the campaign GM. Your character inherits this ruleset."
                  }
                >
                  <Select
                    value={settingsRuleset}
                    onChange={(event) => setSettingsRuleset(event.target.value as CampaignRuleset)}
                    disabled={!isGm}
                  >
                    {CAMPAIGN_RULESET_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </Select>
                </Field>
                <Field
                  label="Advancement"
                  hint={
                    isGm
                      ? XP_MODE_OPTIONS.find((option) => option.value === settingsXpMode)?.description
                      : "Set by the campaign GM. It controls whether encounter XP budgets are shown."
                  }
                >
                  <Select
                    value={settingsXpMode}
                    onChange={(event) => setSettingsXpMode(event.target.value as XpMode)}
                    disabled={!isGm}
                  >
                    {XP_MODE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </Select>
                </Field>
                {isGm ? <Button type="submit" variant="primary" loading={settingsBusy}>Save changes</Button> : null}
              </form>
              {isGm ? (
                <div className="settings-note">
                  <Sparkles size={15} />
                  <p>
                    Switch to <strong>XP budget</strong> to see PF2e encounter difficulty while preparing.
                    Switch back to <strong>Milestone</strong> to hide those numbers. Either way, the party
                    only advances when you choose <strong>Level up party</strong> on the Party tab.
                  </p>
                </div>
              ) : null}
              {isGm ? (
                <>
                  <div className="divider" />
                  <h3>Invite code</h3>
                  <p className="muted small">Share this seven-character code with your players. Regenerating it invalidates the old one.</p>
                  <div className="invite-code-row">
                    <code>{campaign.inviteCode}</code>
                    <Button size="sm" icon={<Copy size={14} />} onClick={async () => { const copied = await copyText(campaign.inviteCode); toast(copied ? "Invite code copied." : "Could not copy the code.", copied ? "success" : "error"); }}>Copy</Button>
                    <Button size="sm" variant="primary" icon={<UserPlus size={14} />} onClick={() => setInviteOpen(true)}>Invite link</Button>
                    <Button size="sm" variant="ghost" icon={<RefreshCw size={14} />} onClick={regenerateCode}>Regenerate</Button>
                  </div>
                </>
              ) : null}
            </Card>

            <Card className="settings-card">
              <div className="row-between">
                <div>
                  <PageEyebrow>Party</PageEyebrow>
                  <h2 style={{ marginTop: 6 }}>Members</h2>
                </div>
                <Badge tone="gold">{members.length} seats</Badge>
              </div>
              <div className="member-list">
                {members.map((member) => (
                  <div key={member.id} className="member-row">
                    <Avatar name={member.displayName} src={member.avatarUrl} size={38} />
                    <div className="grow">
                      <div className="row" style={{ gap: 7 }}>
                        <strong>{member.displayName}</strong>
                        {member.role === "gm" ? <Badge tone="gold"><Crown size={10} /> GM</Badge> : null}
                        {member.id === user?.id ? <Badge tone="blue">You</Badge> : null}
                      </div>
                      <p className="tiny muted">@{member.username} · joined {formatDate(member.joinedAt)}</p>
                    </div>
                    {isGm && member.role !== "gm" ? (
                      <button className="icon-btn" title="Remove from campaign" onClick={() => removeMember(member)}><Trash2 size={14} /></button>
                    ) : null}
                  </div>
                ))}
              </div>
              <div className="divider" />
              {isGm ? (
                <div className="settings-action-row">
                  <div>
                    <h3>Campaign archive</h3>
                    <p className="muted small">
                      Export characters, scenes, tokens, chat, journal, and state as portable JSON. Use{" "}
                      <code>npm run backup</code> for a database + uploads archive.
                    </p>
                  </div>
                  <Button variant="secondary" icon={<Download size={14} />} onClick={exportCampaign}>
                    Export campaign
                  </Button>
                </div>
              ) : null}
              <div className="divider" />
              {isGm ? (
                <div className="danger-zone">
                  <div>
                    <h3>Delete campaign</h3>
                    <p className="muted small">This removes the campaign, scenes, journal, and character links permanently.</p>
                  </div>
                  <Button variant="danger" icon={<Trash2 size={14} />} onClick={deleteCampaign}>Delete campaign</Button>
                </div>
              ) : (
                <div className="danger-zone">
                  <div>
                    <h3>Leave campaign</h3>
                    <p className="muted small">Your characters will remain, but they'll no longer be assigned to this campaign.</p>
                  </div>
                  <Button variant="danger" icon={<LogOut size={14} />} onClick={leaveCampaign}>Leave campaign</Button>
                </div>
              )}
            </Card>
          </div>
        ) : null}
      </div>

      <InviteModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        campaign={campaign && campaign.inviteCode ? { id: campaign.id, name: campaign.name, inviteCode: campaign.inviteCode } : null}
      />

      <Modal
        open={Boolean(journalEditor)}
        onClose={() => setJournalEditor(null)}
        title={
          journalEditor === "new"
            ? journalKind === "handout" ? "New handout" : "New journal entry"
            : journalKind === "handout" ? "Edit handout" : "Edit journal entry"
        }
        subtitle={
          journalKind === "handout"
            ? "Share a map, letter, portrait, or clue with the table."
            : "Plain text with simple Markdown-style headings and emphasis."
        }
        wide
        footer={
          <>
            <Button variant="ghost" onClick={() => setJournalEditor(null)}>Cancel</Button>
            <Button variant="primary" onClick={saveJournal} loading={journalBusy} disabled={journalUploadBusy}>
              {journalKind === "handout" ? "Save handout" : "Save entry"}
            </Button>
          </>
        }
      >
        <form className="stack" onSubmit={saveJournal}>
          <div className="segmented">
            <button type="button" className={journalKind === "note" ? "is-active" : ""} onClick={() => setJournalKind("note")}>
              <ScrollText size={13} /> Journal entry
            </button>
            <button type="button" className={journalKind === "handout" ? "is-active" : ""} onClick={() => setJournalKind("handout")}>
              <FileImage size={13} /> Handout
            </button>
          </div>
          <Field label="Title">
            <Input autoFocus value={journalTitle} onChange={(event) => setJournalTitle(event.target.value)} placeholder={journalKind === "handout" ? "The ferryman's letter" : "Session 4 — The Sunken Crypt"} />
          </Field>
          <Field label={journalKind === "handout" ? "Caption or description" : "Entry"}>
            <Textarea
              value={journalContent}
              onChange={(event) => setJournalContent(event.target.value)}
              rows={journalKind === "handout" ? 5 : 14}
              placeholder={
                journalKind === "handout"
                  ? "What the players can see, read, or learn from this handout."
                  : "# What happened\n\nThe party descended into the crypt…\n\n- Found the silver key\n- Made a bargain with the ferryman"
              }
            />
          </Field>
          <div className="journal-attachments-editor">
            <div className="row-between">
              <div>
                <span className="field-label">Images</span>
                <p className="field-hint">Attach maps, letters, portraits, or clues. Shared entries show these to players.</p>
              </div>
              <div className="row" style={{ gap: 6 }}>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  icon={<ImagePlus size={14} />}
                  loading={journalUploadBusy}
                  onClick={() => journalFileInputRef.current?.click()}
                >
                  Add image
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  icon={<Images size={14} />}
                  loading={assetPickerLoading}
                  onClick={() => void openAssetPicker()}
                  disabled={journalAttachments.length >= 12}
                >
                  From library
                </Button>
              </div>
              <input
                ref={journalFileInputRef}
                type="file"
                aria-label="Add handout images"
                accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
                multiple
                hidden
                disabled={journalUploadBusy}
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? []);
                  event.target.value = "";
                  void addJournalImages(files);
                }}
              />
            </div>
            {journalAttachments.length ? (
              <div className="attachment-editor-grid">
                {journalAttachments.map((attachment) => (
                  <div className="attachment-editor-item" key={attachment.id}>
                    <img src={attachment.url} alt={attachment.name} />
                    <span>{attachment.name}</span>
                    <button
                      type="button"
                      className="icon-btn"
                      title="Remove image"
                      onClick={() => setJournalAttachments((current) => current.filter((item) => item.id !== attachment.id))}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted small">No images attached.</p>
            )}
          </div>
          <Toggle
            checked={journalVisible}
            onChange={setJournalVisible}
            label={journalKind === "handout" ? "Visible to players" : "Visible to players"}
          />
          {journalKind === "handout" ? (
            <p className="tiny muted">
              Handouts appear under the Journal's Handouts filter when they are visible to players.
              GM-only handouts remain hidden.
            </p>
          ) : null}
        </form>
      </Modal>

      <Modal
        open={assetPickerOpen}
        onClose={() => setAssetPickerOpen(false)}
        title="Choose from library"
        subtitle="Attach an image already uploaded for this campaign, including scene art, portraits, and token images."
        wide
        footer={<Button variant="ghost" onClick={() => setAssetPickerOpen(false)}>Done</Button>}
      >
        {assetPickerError ? <div className="auth-error">{assetPickerError}</div> : null}
        {assetPickerLoading ? (
          <Spinner label="Reading the asset library…" />
        ) : !assetPickerAssets.length ? (
          <EmptyState
            icon={<Images size={28} />}
            title="No images in the library"
            description="Upload one with Add image first, or add art to a scene, token, character, or NPC."
          />
        ) : (
          <div className="asset-picker-grid">
            {assetPickerAssets.map((asset) => (
              <button
                key={asset.filename}
                type="button"
                className="asset-picker-card"
                onClick={() => attachAsset(asset)}
              >
                <img src={asset.url} alt={asset.name} loading="lazy" />
                <span>
                  <strong>{asset.name}</strong>
                  <span className="tiny muted">
                    {asset.unused ? "Unused" : asset.usage[0] ?? "In use"}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(previewAttachment)}
        onClose={() => setPreviewAttachment(null)}
        title={previewAttachment?.name}
        extraWide
      >
        {previewAttachment ? (
          <img className="handout-preview" src={previewAttachment.url} alt={previewAttachment.name} />
        ) : null}
      </Modal>
    </div>
  );
}
