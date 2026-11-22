import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  Award,
  BookOpen,
  CalendarClock,
  CalendarDays,
  Check,
  ChevronDown,
  Coins,
  Compass,
  Copy,
  Crown,
  DoorOpen,
  Download,
  FileImage,
  FilePlus2,
  HeartHandshake,
  ImagePlus,
  Images,
  LayoutGrid,
  LogOut,
  Moon,
  Pencil,
  Plus,
  RefreshCw,
  ScrollText,
  Settings,
  Shield,
  Skull,
  Sparkles,
  Star,
  Swords,
  Trash2,
  UserPlus,
  UserRound,
  Users,
} from "lucide-react";
import type {
  CampaignJoinRequest,
  CampaignMember,
  CampaignAsset,
  CampaignRuleset,
  AdvancementSpeed,
  CampaignSummary,
  CampaignTable,
  CharacterRecord,
  JournalAttachment,
  JournalEntry,
  JournalKind,
  QuestStatus,
  Token,
  XpAward,
  XpAwardKind,
  XpMode,
} from "../../shared/types";
import {
  ADVANCEMENT_SPEED_OPTIONS,
  CAMPAIGN_RULESET_OPTIONS,
  XP_MODE_OPTIONS,
  rulesetLabel,
} from "../../shared/content";
import { QUEST_STATUS_OPTIONS, normalizeQuestXp } from "../../shared/journal";
import {
  ACCOMPLISHMENT_LABELS,
  ACCOMPLISHMENT_TIERS,
  ACCOMPLISHMENT_XP,
  XP_AWARD_KIND_LABELS,
  XP_AWARD_KINDS,
  hazardXp,
  xpProgress,
  type AccomplishmentTier,
} from "../../shared/xp";
import { startingWealthCp } from "../../shared/rules";
import { api, copyText, formatCp, formatDate, uploadImage } from "../api";
import { connectSocket, joinCampaign } from "../socket";
import { TravelTab } from "../components/campaign/TravelTab";
import { SessionZeroTab } from "../components/campaign/SessionZeroTab";
import { PeopleTab } from "../components/campaign/PeopleTab";
import { NotesTab } from "../components/campaign/NotesTab";
import { errorMessage } from "../stores";
import { useSession, useToasts } from "../stores";
import {
  Avatar,
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingScreen,
  Modal,
  PageEyebrow,
  ProgressBar,
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
import { ImportReport } from "../components/ImportReport";

function questStatusLabel(status: QuestStatus): string {
  return QUEST_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? "Quest";
}

function questStatusTone(status: QuestStatus): "blue" | "green" | "red" {
  return status === "completed" ? "green" : status === "failed" ? "red" : "blue";
}

type Tab =
  | "table"
  | "overview"
  | "session-zero"
  | "party"
  | "people"
  | "travel"
  | "sessions"
  | "encounters"
  | "loot"
  | "npcs"
  | "assets"
  | "journal"
  | "notes"
  | "gm-screen"
  | "settings";

interface CampaignDetails {
  campaign: CampaignSummary;
  members: CampaignMember[];
  characters: CharacterRecord[];
  joinRequests?: CampaignJoinRequest[];
}

const TABS: { id: Tab; label: string; icon: React.ReactNode; gmOnly?: boolean }[] = [
  { id: "table", label: "Table", icon: <LayoutGrid size={15} /> },
  { id: "overview", label: "Overview", icon: <CalendarDays size={15} /> },
  { id: "session-zero", label: "Session zero", icon: <HeartHandshake size={15} /> },
  { id: "party", label: "Party", icon: <Users size={15} /> },
  { id: "people", label: "People", icon: <Shield size={15} /> },
  { id: "travel", label: "Travel", icon: <Compass size={15} /> },
  { id: "journal", label: "Journal", icon: <ScrollText size={15} /> },
  { id: "notes", label: "Notes & lore", icon: <BookOpen size={15} /> },
  { id: "sessions", label: "Sessions", icon: <CalendarClock size={15} /> },
  { id: "encounters", label: "Encounters", icon: <Skull size={15} />, gmOnly: true },
  { id: "loot", label: "Loot", icon: <Coins size={15} />, gmOnly: true },
  { id: "npcs", label: "NPCs", icon: <UserRound size={15} />, gmOnly: true },
  { id: "assets", label: "Assets", icon: <Images size={15} />, gmOnly: true },
  { id: "gm-screen", label: "GM Screen", icon: <Shield size={15} />, gmOnly: true },
  { id: "settings", label: "Settings", icon: <Settings size={15} /> },
];

const PRIMARY_TAB_IDS = new Set<Tab>(["table", "overview", "party", "people", "journal"]);

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
    rawTab === "session-zero" ||
    rawTab === "party" ||
    rawTab === "people" ||
    rawTab === "travel" ||
    rawTab === "sessions" ||
    rawTab === "encounters" ||
    rawTab === "loot" ||
    rawTab === "npcs" ||
    rawTab === "assets" ||
    rawTab === "journal" ||
    rawTab === "notes" ||
    rawTab === "gm-screen" ||
    rawTab === "settings"
      ? rawTab
      : "table";
  const [campaign, setCampaign] = useState<CampaignSummary | null>(null);
  const [prepOpen, setPrepOpen] = useState(false);
  const prepRef = useRef<HTMLDivElement>(null);
  const [partyActionsOpen, setPartyActionsOpen] = useState(false);
  const partyActionsRef = useRef<HTMLDivElement>(null);
  const partyActionsMenuRef = useRef<HTMLDivElement>(null);
  const [members, setMembers] = useState<CampaignMember[]>([]);
  const [characters, setCharacters] = useState<CharacterRecord[]>([]);
  const [joinRequests, setJoinRequests] = useState<CampaignJoinRequest[]>([]);
  const [joinRequestBusy, setJoinRequestBusy] = useState<string | null>(null);
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
  const [journalQuestStatus, setJournalQuestStatus] = useState<QuestStatus>("none");
  const [journalQuestXp, setJournalQuestXp] = useState("0");
  const [journalBusy, setJournalBusy] = useState(false);
  const [journalUploadBusy, setJournalUploadBusy] = useState(false);
  const [journalFilter, setJournalFilter] = useState<"all" | JournalKind | "quest">("all");
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
  const [settingsAdvancementSpeed, setSettingsAdvancementSpeed] =
    useState<AdvancementSpeed>("medium");
  const [settingsSettlementLevel, setSettingsSettlementLevel] = useState("1");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [levelUpBusy, setLevelUpBusy] = useState(false);
  const [catchUpBusy, setCatchUpBusy] = useState(false);
  const [levelingId, setLevelingId] = useState<string | null>(null);
  const [wealthBusyId, setWealthBusyId] = useState<string | null>(null);
  const [restBusy, setRestBusy] = useState(false);
  const [xpOpen, setXpOpen] = useState(false);
  const [xpAwards, setXpAwards] = useState<XpAward[]>([]);
  const [xpKind, setXpKind] = useState<XpAwardKind>("encounter");
  const [xpAmount, setXpAmount] = useState("20");
  const [xpReason, setXpReason] = useState("");
  const [xpHazardLevel, setXpHazardLevel] = useState("1");
  const [xpPartyLevel, setXpPartyLevel] = useState("1");
  const [xpHazardComplexity, setXpHazardComplexity] = useState<"simple" | "complex">("complex");
  const [xpAccomplishmentTier, setXpAccomplishmentTier] = useState<AccomplishmentTier>("moderate");
  const [xpRecipientIds, setXpRecipientIds] = useState<string[]>([]);
  const [xpBusy, setXpBusy] = useState(false);
  const [xpError, setXpError] = useState("");
  const [downtimeOpen, setDowntimeOpen] = useState(false);
  const [downtimeDays, setDowntimeDays] = useState("1");
  const [downtimeTargetIds, setDowntimeTargetIds] = useState<string[]>([]);
  const [downtimeBusy, setDowntimeBusy] = useState(false);
  const [downtimeError, setDowntimeError] = useState("");
  const [heroPointOpen, setHeroPointOpen] = useState(false);
  const [heroPointAmount, setHeroPointAmount] = useState("1");
  const [heroPointRecipientIds, setHeroPointRecipientIds] = useState<string[]>([]);
  const [heroPointBusy, setHeroPointBusy] = useState(false);
  const [heroPointError, setHeroPointError] = useState("");

  const isGm = campaign?.role === "gm";
  const xpPreviewAmount =
    xpKind === "hazard"
      ? hazardXp(Number(xpHazardLevel) || 0, Number(xpPartyLevel) || 1, xpHazardComplexity)
      : xpKind === "accomplishment"
        ? ACCOMPLISHMENT_XP[xpAccomplishmentTier]
        : Math.max(0, Math.floor(Number(xpAmount) || 0));
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
  const primaryTabs = visibleTabs.filter((entry) => PRIMARY_TAB_IDS.has(entry.id));
  const prepTabs = visibleTabs.filter(
    (entry) => entry.id !== "settings" && !PRIMARY_TAB_IDS.has(entry.id)
  );
  const settingsTab = visibleTabs.find((entry) => entry.id === "settings");
  const activePrepTab = prepTabs.find((entry) => entry.id === tab);

  useEffect(() => {
    if (!prepOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!prepRef.current?.contains(event.target as Node)) setPrepOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPrepOpen(false);
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [prepOpen]);

  useEffect(() => {
    if (!partyActionsOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!partyActionsRef.current?.contains(event.target as Node)) setPartyActionsOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPartyActionsOpen(false);
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [partyActionsOpen]);

  useEffect(() => {
    if (!partyActionsOpen) return;
    const items = partyActionsMenuRef.current?.querySelectorAll<HTMLButtonElement>(
      '[role="menuitem"]:not(:disabled)'
    );
    items?.[0]?.focus();
  }, [partyActionsOpen]);

  const handlePartyActionsMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setPartyActionsOpen(false);
      partyActionsRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
      return;
    }

    if (event.key === "Tab") {
      setPartyActionsOpen(false);
      partyActionsRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
      return;
    }

    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')
    );
    if (!items.length) return;
    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);

    if (event.key === "ArrowDown") {
      event.preventDefault();
      items[(currentIndex + 1) % items.length]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      items[currentIndex <= 0 ? items.length - 1 : currentIndex - 1]?.focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      items[0]?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      items[items.length - 1]?.focus();
    }
  };

  useEffect(() => {
    setPartyActionsOpen(false);
  }, [tab]);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const [details, table] = await Promise.all([
        api<CampaignDetails>(`/api/campaigns/${id}`),
        api<CampaignTable>(`/api/campaigns/${id}/table`),
      ]);
      setCampaign(details.campaign);
      setMembers(details.members);
      setCharacters(details.characters);
      setJoinRequests(details.joinRequests ?? []);
      setTableData(table);
      setSettingsName(details.campaign.name);
      setSettingsDescription(details.campaign.description);
      setSettingsRuleset(details.campaign.ruleset);
      setSettingsXpMode(details.campaign.xpMode);
      setSettingsAdvancementSpeed(details.campaign.advancementSpeed);
      setSettingsSettlementLevel(String(details.campaign.settlementLevel));
      if (details.campaign.role === "gm") {
        try {
          const ledger = await api<{ awards: XpAward[] }>(`/api/campaigns/${id}/xp-awards`);
          setXpAwards(ledger.awards);
        } catch {
          setXpAwards([]);
        }
      }
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
  }, [
    campaign?.id,
    campaign?.role,
    campaign?.inviteCode,
    location.pathname,
    location.search,
    location.state,
    navigate,
  ]);

  useEffect(() => {
    if (tab === "table") setTableMounted(true);
  }, [tab]);

  // Refresh party/settings data when those tabs are opened so newly joined
  // players and newly created characters show up without a full page reload.
  useEffect(() => {
    if (!id || (tab !== "overview" && tab !== "party" && tab !== "loot" && tab !== "settings"))
      return;
    let cancelled = false;
    api<CampaignDetails>(`/api/campaigns/${id}`)
      .then((details) => {
        if (cancelled) return;
        setCampaign(details.campaign);
        setMembers(details.members);
        setCharacters(details.characters);
        setJoinRequests(details.joinRequests ?? []);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [id, tab]);

  // Encounter and NPC prep read scene/token state from the table snapshot.
  // Refresh it when those tabs open so scenes created this session appear.
  useEffect(() => {
    if (!id || (tab !== "encounters" && tab !== "npcs")) return;
    let cancelled = false;
    api<CampaignTable>(`/api/campaigns/${id}/table`)
      .then((table) => {
        if (!cancelled) setTableData(table);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [id, tab]);

  // Keep shared campaign metadata (the in-world date, name, ruleset, counts)
  // live for the whole campaign view. The table hook references the same room,
  // so the shared subscription keeps one socket joined until the page closes.
  useEffect(() => {
    if (!id) return;
    const socket = connectSocket();
    const applySummary = (summary: CampaignSummary) => {
      if (summary.id !== id) return;
      setCampaign(summary);
      setTableData((current) =>
        current ? { ...current, campaign: { ...current.campaign, ...summary } } : current
      );
    };
    const refreshDetails = () => {
      api<CampaignDetails>(`/api/campaigns/${id}`)
        .then((details) => {
          setCampaign(details.campaign);
          setMembers(details.members);
          setCharacters(details.characters);
          setJoinRequests(details.joinRequests ?? []);
        })
        .catch(() => undefined);
    };
    const onCharacterRemoved = ({ characterId }: { characterId: string }) => {
      setCharacters((current) => current.filter((character) => character.id !== characterId));
    };
    const onCharacterUpdated = ({
      characterId,
      summary,
      name,
    }: {
      characterId: string;
      summary: CharacterRecord["summary"];
      name?: string;
    }) => {
      const patch = (character: CharacterRecord): CharacterRecord =>
        character.id === characterId
          ? { ...character, summary, name: name ?? character.name }
          : character;
      setCharacters((current) => current.map(patch));
      setTableData((current) =>
        current ? { ...current, characters: current.characters.map(patch) } : current
      );
    };
    const onCharacterCreated = ({ character }: { character: CharacterRecord }) => {
      setCharacters((current) =>
        current.some((entry) => entry.id === character.id)
          ? current.map((entry) => (entry.id === character.id ? character : entry))
          : [...current, character]
      );
      setTableData((current) =>
        current && !current.characters.some((entry) => entry.id === character.id)
          ? { ...current, characters: [...current.characters, character] }
          : current
      );
    };
    const upsertJournal = (entry: JournalEntry) => {
      setTableData((current) => {
        if (!current) return current;
        const journal = [
          entry,
          ...current.journal.filter((existing) => existing.id !== entry.id),
        ].sort((a, b) => b.updatedAt - a.updatedAt);
        return { ...current, journal };
      });
    };
    const onJournalDeleted = ({ entryId }: { entryId: string }) => {
      setTableData((current) =>
        current
          ? { ...current, journal: current.journal.filter((entry) => entry.id !== entryId) }
          : current
      );
    };
    const onSafetySignal = (payload: { message: string }) => {
      toast(payload.message, "error");
    };
    socket.on("campaign:updated", applySummary);
    socket.on("character:updated", onCharacterUpdated);
    socket.on("character:created", onCharacterCreated);
    socket.on("character:removed", onCharacterRemoved);
    socket.on("journal:created", upsertJournal);
    socket.on("journal:updated", upsertJournal);
    socket.on("journal:deleted", onJournalDeleted);
    socket.on("join-request:created", refreshDetails);
    socket.on("join-request:updated", refreshDetails);
    socket.on("safety:signal", onSafetySignal);
    const leaveCampaignRoom = joinCampaign(id);
    return () => {
      socket.off("campaign:updated", applySummary);
      socket.off("character:updated", onCharacterUpdated);
      socket.off("character:created", onCharacterCreated);
      socket.off("character:removed", onCharacterRemoved);
      socket.off("journal:created", upsertJournal);
      socket.off("journal:updated", upsertJournal);
      socket.off("journal:deleted", onJournalDeleted);
      socket.off("join-request:created", refreshDetails);
      socket.off("join-request:updated", refreshDetails);
      socket.off("safety:signal", onSafetySignal);
      leaveCampaignRoom();
    };
  }, [id, toast]);

  useEffect(() => {
    if (!journalEditor || journalEditor === "new") {
      if (journalEditor === "new") {
        setJournalTitle("");
        setJournalContent("");
        setJournalVisible(true);
        setJournalKind("note");
        setJournalAttachments([]);
        setJournalQuestStatus("none");
        setJournalQuestXp("0");
      }
      return;
    }
    setJournalTitle(journalEditor.title);
    setJournalContent(journalEditor.content);
    setJournalVisible(journalEditor.visible);
    setJournalKind(journalEditor.kind);
    setJournalAttachments(journalEditor.attachments);
    setJournalQuestStatus(journalEditor.questStatus ?? "none");
    setJournalQuestXp(String(journalEditor.questXp ?? 0));
  }, [journalEditor]);

  const filteredJournal = useMemo(() => {
    const entries = tableData?.journal ?? [];
    if (journalFilter === "all") return entries;
    if (journalFilter === "quest") return entries.filter((entry) => entry.questStatus !== "none");
    return entries.filter((entry) => entry.kind === journalFilter);
  }, [tableData, journalFilter]);

  const selectedJournal = useMemo(
    () =>
      filteredJournal.find((entry) => entry.id === selectedJournalId) ?? filteredJournal[0] ?? null,
    [filteredJournal, selectedJournalId]
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
            questStatus: journalKind === "handout" ? journalQuestStatus : "none",
            questXp: journalKind === "handout" ? normalizeQuestXp(Number(journalQuestXp)) : 0,
          },
        });
        setTableData((current) =>
          current ? { ...current, journal: [result.entry, ...current.journal] } : current
        );
        setSelectedJournalId(result.entry.id);
      } else if (journalEditor) {
        const result = await api<{ entry: JournalEntry }>(
          `/api/campaigns/${id}/journal/${journalEditor.id}`,
          {
            method: "PUT",
            body: {
              title: journalTitle,
              content: journalContent,
              visible: journalVisible,
              kind: journalKind,
              attachments: journalAttachments,
              questStatus: journalKind === "handout" ? journalQuestStatus : "none",
              questXp: journalKind === "handout" ? normalizeQuestXp(Number(journalQuestXp)) : 0,
            },
          }
        );
        setTableData((current) =>
          current
            ? {
                ...current,
                journal: current.journal.map((entry) =>
                  entry.id === result.entry.id ? result.entry : entry
                ),
              }
            : current
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
        current
          ? { ...current, journal: current.journal.filter((item) => item.id !== entry.id) }
          : current
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
        { method: "POST" }
      );
      setTableData((current) =>
        current ? { ...current, journal: [result.entry, ...current.journal] } : current
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

  const awardQuestXp = async (entry: JournalEntry) => {
    if (!id || !isGm) return;
    setJournalBusy(true);
    try {
      const result = await api<{
        entry: JournalEntry;
        amount: number;
        recipients: number;
        characters: CharacterRecord[];
        award?: XpAward;
      }>(`/api/campaigns/${id}/journal/${entry.id}/award-quest-xp`, { method: "POST" });
      setCharacters(result.characters);
      const award = result.award;
      if (award) {
        setXpAwards((current) => [award, ...current].slice(0, 20));
      }
      setTableData((current) =>
        current
          ? {
              ...current,
              journal: current.journal.map((item) =>
                item.id === result.entry.id ? result.entry : item
              ),
              characters: result.characters,
            }
          : current
      );
      toast(
        `Awarded ${result.amount} quest XP to ${result.recipients} character${
          result.recipients === 1 ? "" : "s"
        }.`,
        "success"
      );
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
          advancementSpeed: settingsAdvancementSpeed,
          settlementLevel: Number(settingsSettlementLevel) || 0,
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
                advancementSpeed: result.campaign.advancementSpeed,
                settlementLevel: result.campaign.settlementLevel,
              },
            }
          : current
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
      const result = await api<{ inviteCode: string }>(`/api/campaigns/${id}/regenerate-code`, {
        method: "POST",
      });
      setCampaign((current) => (current ? { ...current, inviteCode: result.inviteCode } : current));
      toast("Invite code regenerated.", "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  const removeMember = async (member: CampaignMember) => {
    if (!id || !window.confirm(`Remove ${member.displayName} from the campaign?`)) return;
    try {
      const result = await api<{ inviteCode?: string }>(
        `/api/campaigns/${id}/members/${member.id}`,
        { method: "DELETE" }
      );
      setMembers((current) => current.filter((item) => item.id !== member.id));
      if (result.inviteCode) {
        setCampaign((current) =>
          current ? { ...current, inviteCode: result.inviteCode! } : current
        );
      }
      toast("Member removed. Invite code regenerated.", "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  const decideJoinRequest = async (
    request: CampaignJoinRequest,
    decision: "approve" | "decline"
  ) => {
    if (!id) return;
    setJoinRequestBusy(request.id);
    try {
      await api(`/api/campaigns/${id}/join-requests/${request.id}/${decision}`, {
        method: "POST",
      });
      const details = await api<CampaignDetails>(`/api/campaigns/${id}`);
      setCampaign(details.campaign);
      setMembers(details.members);
      setCharacters(details.characters);
      setJoinRequests(details.joinRequests ?? []);
      toast(
        decision === "approve"
          ? `${request.characterName} joined the party.`
          : `Declined ${request.characterName}.`,
        "success"
      );
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setJoinRequestBusy(null);
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

  const exportCampaign = async (selfContained = false) => {
    if (!id || !campaign) return;
    try {
      const payload = await api<Record<string, unknown>>(
        `/api/campaigns/${id}/export${selfContained ? "?selfContained=1" : ""}`
      );
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${campaign.name.replace(/[^a-z0-9-_ ]/gi, "").trim() || "campaign"}${
        selfContained ? ".runehall.self-contained.json" : ".runehall.json"
      }`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast(
        selfContained ? "Self-contained campaign archive exported." : "Campaign archive exported.",
        "success"
      );
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  const levelUpCharacters = async (characterId?: string) => {
    if (!id || !campaign) return;
    const target = characterId ? characters.find((entry) => entry.id === characterId) : null;
    const message = target
      ? `Advance ${target.name} by one level? The GM controls advancement, and this consumes up to 1,000 XP.`
      : "Advance every character in this campaign by one level? The GM controls advancement, and each character consumes up to 1,000 XP.";
    if (!window.confirm(message)) return;
    if (target) setLevelingId(target.id);
    else setLevelUpBusy(true);
    try {
      const result = await api<{
        leveled: number;
        atMaxLevel: number;
        skipped: number;
        characters: CharacterRecord[];
      }>(`/api/campaigns/${id}/level-up`, {
        method: "POST",
        body: target ? { characterId: target.id } : {},
      });
      setCharacters(result.characters);
      setTableData((current) =>
        current ? { ...current, characters: result.characters } : current
      );
      if (target) {
        const updated = result.characters.find((entry) => entry.id === target.id);
        if (result.leveled > 0) {
          toast(
            `Advanced ${target.name} to level ${updated?.summary?.level ?? "the next level"}.`,
            "success"
          );
        } else if (result.atMaxLevel > 0) {
          toast(`${target.name} is already at level 20.`, "info");
        } else {
          toast(`Could not advance ${target.name}. Check their draft in the builder.`, "info");
        }
      } else if (result.leveled > 0) {
        toast(
          `Advanced ${result.leveled} ${result.leveled === 1 ? "character" : "characters"} by one level.`,
          "success"
        );
      } else if (result.atMaxLevel > 0 && result.skipped === 0) {
        toast("Every character is already at level 20.", "info");
      } else {
        toast("No characters could be advanced. Check their drafts in the builder.", "info");
      }
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setLevelingId(null);
      setLevelUpBusy(false);
    }
  };

  const catchUpParty = async () => {
    if (!id || !isGm) return;
    const confirmed = window.confirm(
      "Raise every character below the party's highest level up to that level and match its XP? Use this for new or returning characters; review their new feats and spells afterward."
    );
    if (!confirmed) return;
    setCatchUpBusy(true);
    try {
      const result = await api<{
        caughtUp: number;
        alreadyCurrent: number;
        skipped: number;
        targetLevel: number;
        targetXp: number;
        characters: CharacterRecord[];
      }>(`/api/campaigns/${id}/catch-up`, { method: "POST" });
      setCharacters(result.characters);
      setTableData((current) =>
        current ? { ...current, characters: result.characters } : current
      );
      if (result.caughtUp > 0) {
        toast(
          `Caught up ${result.caughtUp} ${
            result.caughtUp === 1 ? "character" : "characters"
          } to level ${result.targetLevel}. Review new class choices.`,
          "success"
        );
      } else {
        toast("The whole party is already caught up.", "info");
      }
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setCatchUpBusy(false);
    }
  };

  const topUpWealth = async (character: CharacterRecord) => {
    if (!id || !isGm || !character.summary) return;
    const level = character.summary.level;
    const targetCp = startingWealthCp(level);
    const confirmed = window.confirm(
      `Top up ${character.name}'s wealth to the level ${level} lump-sum benchmark (${formatCp(targetCp)} total)? This grants only the difference.`
    );
    if (!confirmed) return;
    setWealthBusyId(character.id);
    try {
      const result = await api<{
        character: CharacterRecord;
        grantCp: number;
        targetCp: number;
        committedCp: number;
      }>(`/api/campaigns/${id}/characters/${character.id}/wealth`, { method: "POST" });
      setCharacters((current) =>
        current.map((entry) => (entry.id === result.character.id ? result.character : entry))
      );
      setTableData((current) =>
        current
          ? {
              ...current,
              characters: current.characters.map((entry) =>
                entry.id === result.character.id ? result.character : entry
              ),
            }
          : current
      );
      toast(
        result.grantCp > 0
          ? `Granted ${formatCp(result.grantCp)} to ${result.character.name}. Total wealth is now about ${formatCp(result.committedCp)}.`
          : `${result.character.name} already meets the level ${level} wealth benchmark.`,
        "success"
      );
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setWealthBusyId(null);
    }
  };

  const openXpAward = () => {
    const partyLevel = Math.max(1, ...characters.map((character) => character.summary?.level ?? 1));
    setXpKind("encounter");
    setXpAmount("20");
    setXpReason("");
    setXpHazardLevel(String(partyLevel));
    setXpPartyLevel(String(partyLevel));
    setXpHazardComplexity("complex");
    setXpAccomplishmentTier("moderate");
    setXpRecipientIds(characters.map((character) => character.id));
    setXpError("");
    setXpOpen(true);
  };

  const toggleXpRecipient = (characterId: string, checked: boolean) => {
    setXpRecipientIds((current) =>
      checked
        ? [...new Set([...current, characterId])]
        : current.filter((entry) => entry !== characterId)
    );
  };

  const awardXp = async () => {
    if (!id) return;
    if (xpPreviewAmount < 1) {
      setXpError("This award is worth no XP. Raise the hazard level or award at least 1 XP.");
      return;
    }
    if (!xpRecipientIds.length) {
      setXpError("Choose at least one character.");
      return;
    }
    setXpBusy(true);
    setXpError("");
    try {
      const result = await api<{
        amount: number;
        recipients: number;
        skipped: number;
        characters: CharacterRecord[];
        award: XpAward;
      }>(`/api/campaigns/${id}/award-xp`, {
        method: "POST",
        body: {
          kind: xpKind,
          amount: xpPreviewAmount,
          characterIds: xpRecipientIds,
          reason: xpReason.trim(),
          hazardLevel: Number(xpHazardLevel),
          partyLevel: Number(xpPartyLevel),
          hazardComplexity: xpHazardComplexity,
          tier: xpAccomplishmentTier,
        },
      });
      setCharacters(result.characters);
      setTableData((current) =>
        current ? { ...current, characters: result.characters } : current
      );
      if (result.award) {
        setXpAwards((current) => [result.award, ...current].slice(0, 20));
      }
      setXpOpen(false);
      toast(
        `Awarded ${result.amount} XP to ${result.recipients} ${
          result.recipients === 1 ? "character" : "characters"
        }. Level-ups remain GM-triggered.`,
        "success"
      );
    } catch (err) {
      setXpError(errorMessage(err));
    } finally {
      setXpBusy(false);
    }
  };

  const openDowntime = () => {
    setDowntimeDays("1");
    setDowntimeTargetIds(characters.map((character) => character.id));
    setDowntimeError("");
    setDowntimeOpen(true);
  };

  const toggleDowntimeTarget = (characterId: string, checked: boolean) => {
    setDowntimeTargetIds((current) =>
      checked
        ? [...new Set([...current, characterId])]
        : current.filter((entry) => entry !== characterId)
    );
  };

  const grantDowntime = async () => {
    if (!id) return;
    const days = Math.max(1, Math.floor(Number(downtimeDays) || 0));
    if (!downtimeTargetIds.length) {
      setDowntimeError("Choose at least one character.");
      return;
    }
    setDowntimeBusy(true);
    setDowntimeError("");
    try {
      const result = await api<{
        days: number;
        recipients: number;
        characters: CharacterRecord[];
      }>(`/api/campaigns/${id}/downtime`, {
        method: "POST",
        body: { days, characterIds: downtimeTargetIds },
      });
      setCharacters(result.characters);
      setTableData((current) =>
        current ? { ...current, characters: result.characters } : current
      );
      setDowntimeOpen(false);
      toast(
        `Granted ${result.days} downtime day${result.days === 1 ? "" : "s"} to ${
          result.recipients
        } character${result.recipients === 1 ? "" : "s"}.`,
        "success"
      );
    } catch (err) {
      setDowntimeError(errorMessage(err));
    } finally {
      setDowntimeBusy(false);
    }
  };

  const openHeroPoints = () => {
    setHeroPointAmount("1");
    setHeroPointRecipientIds(characters.map((character) => character.id));
    setHeroPointError("");
    setHeroPointOpen(true);
  };

  const toggleHeroPointRecipient = (characterId: string, checked: boolean) => {
    setHeroPointRecipientIds((current) =>
      checked
        ? [...new Set([...current, characterId])]
        : current.filter((entry) => entry !== characterId)
    );
  };

  const awardHeroPoints = async () => {
    if (!id) return;
    if (!heroPointRecipientIds.length) {
      setHeroPointError("Choose at least one character.");
      return;
    }
    setHeroPointBusy(true);
    setHeroPointError("");
    try {
      const result = await api<{
        amount: number;
        recipients: number;
        capped: number;
        skipped: number;
        characters: CharacterRecord[];
      }>(`/api/campaigns/${id}/award-hero-points`, {
        method: "POST",
        body: {
          amount: Math.max(1, Math.min(3, Math.floor(Number(heroPointAmount) || 1))),
          characterIds: heroPointRecipientIds,
        },
      });
      setCharacters(result.characters);
      setTableData((current) =>
        current ? { ...current, characters: result.characters } : current
      );
      setHeroPointOpen(false);
      toast(
        `Awarded ${result.amount} Hero Point${result.amount === 1 ? "" : "s"} to ${
          result.recipients
        } character${result.recipients === 1 ? "" : "s"}${
          result.capped ? `; ${result.capped} already at the maximum` : ""
        }.`,
        "success"
      );
    } catch (err) {
      setHeroPointError(errorMessage(err));
    } finally {
      setHeroPointBusy(false);
    }
  };

  const startNewSession = async () => {
    if (!id) return;
    if (
      !window.confirm(
        "Start a new session? Every character's Hero Points are set to 1. HP, focus, spells, conditions, and session status are unchanged."
      )
    ) {
      return;
    }
    setHeroPointBusy(true);
    setHeroPointError("");
    try {
      const result = await api<{
        value: number;
        recipients: number;
        skipped: number;
        characters: CharacterRecord[];
      }>(`/api/campaigns/${id}/reset-hero-points`, {
        method: "POST",
        body: { value: 1 },
      });
      setCharacters(result.characters);
      setTableData((current) =>
        current ? { ...current, characters: result.characters } : current
      );
      setHeroPointOpen(false);
      toast(
        result.recipients > 0
          ? `New session: reset ${result.recipients} character${
              result.recipients === 1 ? "" : "s"
            } to 1 Hero Point.`
          : "New session: every character already had 1 Hero Point.",
        "success"
      );
    } catch (err) {
      setHeroPointError(errorMessage(err));
    } finally {
      setHeroPointBusy(false);
    }
  };

  const longRestParty = async () => {
    if (!id || !campaign) return;
    if (
      !window.confirm(
        "Apply a long rest to every character in this campaign? This heals, resets spell slots and focus, clears temporary HP, removes fatigued, and reduces doomed and drained by 1."
      )
    ) {
      return;
    }
    setRestBusy(true);
    try {
      const result = await api<{
        rested: number;
        skipped: number;
        healed: number;
        conditionsRemoved: number;
        conditionsReduced: number;
        slotsRestored: number;
        focusRestored: number;
        characters: CharacterRecord[];
      }>(`/api/campaigns/${id}/long-rest`, { method: "POST" });
      setCharacters(result.characters);
      setTableData((current) =>
        current ? { ...current, characters: result.characters } : current
      );
      if (result.rested > 0) {
        toast(
          `Long rest complete for ${result.rested} ${
            result.rested === 1 ? "character" : "characters"
          }: +${result.healed} HP, ${result.slotsRestored} spell slots restored, ${result.conditionsRemoved} conditions removed${
            result.conditionsReduced ? `, ${result.conditionsReduced} reduced` : ""
          }.`,
          "success"
        );
      } else {
        toast("No characters could rest. Check their drafts in the builder.", "info");
      }
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setRestBusy(false);
    }
  };

  const handleCharacterUpdated = (character: CharacterRecord) => {
    setCharacters((current) =>
      current.map((entry) => (entry.id === character.id ? character : entry))
    );
    setTableData((current) =>
      current
        ? {
            ...current,
            characters: current.characters.map((entry) =>
              entry.id === character.id ? character : entry
            ),
          }
        : current
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
        : current
    );
  };

  const handleEncounterLaunch = (result: EncounterLaunchResult) => {
    setTableData((current) => {
      if (!current) return current;
      const known = new Set(current.tokens.map((token) => token.id));
      return {
        ...current,
        activeSceneId: result.sceneId,
        tokens: [...current.tokens, ...result.tokens.filter((token) => !known.has(token.id))],
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
    if (
      !window.confirm(
        `Delete “${campaign.name}” permanently? This removes every scene, character link, and journal entry.`
      )
    )
      return;
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
          <Link to="/campaigns" className="back-link">
            <LayoutGrid size={14} /> All campaigns
          </Link>
          <div className="campaign-title-row">
            <div className="campaign-title-emblem">
              <Swords size={22} />
            </div>
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
            <button type="button" className="invite-chip large" onClick={() => setInviteOpen(true)}>
              <UserPlus size={14} /> Invite players <strong>{campaign.inviteCode}</strong>{" "}
              <Copy size={13} />
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

      <nav className="campaign-tabs" aria-label="Campaign sections">
        {primaryTabs.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={tab === entry.id ? "is-active" : ""}
            aria-current={tab === entry.id ? "page" : undefined}
            onClick={() => setTab(entry.id)}
          >
            {entry.icon}
            <span>{entry.label}</span>
            {entry.id === "party" ? <span className="tab-count">{characters.length}</span> : null}
            {entry.id === "journal" ? (
              <span className="tab-count">{tableData.journal.length}</span>
            ) : null}
          </button>
        ))}

        {prepTabs.length ? (
          <div className="campaign-tab-group" ref={prepRef}>
            <button
              type="button"
              className={`campaign-tab-prep ${activePrepTab ? "is-active" : ""}`}
              aria-expanded={prepOpen}
              aria-haspopup="menu"
              onClick={() => setPrepOpen((current) => !current)}
              title={activePrepTab ? `Prep tools · ${activePrepTab.label}` : "Prep tools"}
            >
              <BookOpen size={15} />
              <span>Prep</span>
              {activePrepTab ? (
                <span className="campaign-tab-prep-current">{activePrepTab.label}</span>
              ) : null}
              <ChevronDown size={13} className={prepOpen ? "is-open" : ""} />
            </button>
            {prepOpen ? (
              <div className="campaign-tab-menu" role="menu" aria-label="Prep tools">
                {prepTabs.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    role="menuitem"
                    className={tab === entry.id ? "is-active" : ""}
                    aria-current={tab === entry.id ? "page" : undefined}
                    onClick={() => {
                      setTab(entry.id);
                      setPrepOpen(false);
                    }}
                  >
                    {entry.icon}
                    <span>{entry.label}</span>
                    {tab === entry.id ? <Check size={13} /> : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {settingsTab ? (
          <button
            type="button"
            className={`campaign-tab-settings ${tab === settingsTab.id ? "is-active" : ""}`}
            aria-current={tab === settingsTab.id ? "page" : undefined}
            onClick={() => setTab(settingsTab.id)}
          >
            {settingsTab.icon}
            <span>{settingsTab.label}</span>
            {isGm && joinRequests.length ? (
              <span className="tab-count">{joinRequests.length}</span>
            ) : null}
          </button>
        ) : null}
      </nav>

      <div className="campaign-table" style={{ display: tab === "table" ? undefined : "none" }}>
        {tableMounted ? (
          <VttTable
            initial={tableData}
            campaignId={campaign.id}
            user={user!}
            isGm={isGm}
            active={tab === "table"}
          />
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
            memberCount={members.length}
            journalCount={tableData.journal.filter((entry) => entry.kind === "handout").length}
            characters={characters}
            worldDate={campaign.worldDate}
            onWorldDateChange={(worldDate) => {
              setCampaign((current) => (current ? { ...current, worldDate } : current));
              setTableData((current) =>
                current ? { ...current, campaign: { ...current.campaign, worldDate } } : current
              );
            }}
            onNavigate={(next) => setTab(next)}
            onJournalCreated={(entry) => {
              setTableData((current) =>
                current ? { ...current, journal: [entry, ...current.journal] } : current
              );
              setSelectedJournalId(entry.id);
            }}
            onInvite={() => setInviteOpen(true)}
            toast={toast}
          />
        ) : null}

        {tab === "session-zero" ? (
          <SessionZeroTab
            campaignId={campaign.id}
            isGm={isGm}
            refreshKey={campaign.updatedAt}
            toast={toast}
          />
        ) : null}

        {tab === "people" ? (
          <PeopleTab campaignId={campaign.id} refreshKey={campaign.updatedAt} />
        ) : null}

        {tab === "travel" ? (
          <TravelTab
            campaignId={campaign.id}
            isGm={isGm}
            characters={characters}
            worldDate={campaign.worldDate}
            refreshKey={campaign.updatedAt}
            toast={toast}
          />
        ) : null}

        {tab === "party" ? (
          <div className="page-inner">
            <div className="section-title">
              <div>
                <PageEyebrow>The party</PageEyebrow>
                <h2>Who's at the table?</h2>
                <p>
                  Every hero in this campaign. The GM controls advancement; XP never levels a
                  character automatically.
                </p>
              </div>
              <div className="row wrap" style={{ gap: 8 }}>
                {isGm ? (
                  <>
                    {campaign.xpMode === "xp" ? (
                      <Button variant="secondary" icon={<Award size={15} />} onClick={openXpAward}>
                        Award XP
                      </Button>
                    ) : null}
                    <Button variant="secondary" icon={<Star size={15} />} onClick={openHeroPoints}>
                      Hero Points
                    </Button>
                    <div className="party-actions" ref={partyActionsRef}>
                      <Button
                        variant="secondary"
                        icon={<Sparkles size={15} />}
                        aria-expanded={partyActionsOpen}
                        aria-haspopup="menu"
                        loading={restBusy || levelUpBusy || catchUpBusy}
                        onClick={() => setPartyActionsOpen((current) => !current)}
                      >
                        Party actions
                        <ChevronDown size={13} className={partyActionsOpen ? "is-open" : ""} />
                      </Button>
                      {partyActionsOpen ? (
                        <div
                          className="party-actions-menu"
                          role="menu"
                          aria-label="Party actions"
                          ref={partyActionsMenuRef}
                          onKeyDown={handlePartyActionsMenuKeyDown}
                        >
                          <button
                            type="button"
                            role="menuitem"
                            disabled={restBusy}
                            onClick={() => {
                              setPartyActionsOpen(false);
                              void longRestParty();
                            }}
                          >
                            <Moon size={15} />
                            <span>Long rest party</span>
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            disabled={levelUpBusy}
                            onClick={() => {
                              setPartyActionsOpen(false);
                              void levelUpCharacters();
                            }}
                          >
                            <Sparkles size={15} />
                            <span>Level up party</span>
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            disabled={catchUpBusy}
                            onClick={() => {
                              setPartyActionsOpen(false);
                              void catchUpParty();
                            }}
                          >
                            <Users size={15} />
                            <span>Catch up party</span>
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setPartyActionsOpen(false);
                              openDowntime();
                            }}
                          >
                            <CalendarClock size={15} />
                            <span>Grant downtime</span>
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </>
                ) : null}
                <Button variant="primary" icon={<Plus size={15} />} onClick={createCharacter}>
                  New character
                </Button>
              </div>
            </div>
            <div className="party-grid">
              {characters.map((character) => {
                const progress = character.summary
                  ? xpProgress(
                      character.summary.xp ?? 0,
                      character.summary.level,
                      campaign?.advancementSpeed ?? character.campaignAdvancementSpeed ?? "medium"
                    )
                  : null;
                return (
                  <article key={character.id} className="party-card card">
                    <div className="party-card-top">
                      <Avatar
                        name={character.name}
                        src={character.summary?.portraitUrl}
                        size={58}
                      />
                      <div className="grow">
                        <div className="row wrap" style={{ gap: 7 }}>
                          <h3>{character.name}</h3>
                          {character.permissions?.canEdit ? (
                            <Badge tone="gold">Editable</Badge>
                          ) : null}
                          {(character.summary?.validationErrors ?? 0) > 0 ? (
                            <Badge tone="red">Needs choices</Badge>
                          ) : null}
                        </div>
                        <p className="tiny muted">
                          {character.summary
                            ? `Level ${character.summary.level} ${character.summary.className || ""} · ${character.summary.ancestry || "No ancestry"}`
                            : "Unfinished character"}
                        </p>
                        <p className="tiny muted">
                          {character.ownerName ? `Played by ${character.ownerName}` : ""}
                        </p>
                      </div>
                    </div>
                    {character.summary ? (
                      <div className="party-stats">
                        <Stat label="HP" value={character.summary.hp} tone="red" />
                        <Stat label="AC" value={character.summary.ac} tone="gold" />
                        <Stat label="Speed" value={`${character.summary.speed} ft.`} />
                        <Stat label="Hero" value={`${character.summary.heroPoints ?? 0} / 3`} />
                        <Stat label="Downtime" value={`${character.summary.downtimeDays ?? 0} d`} />
                      </div>
                    ) : null}
                    {campaign.xpMode === "xp" && progress ? (
                      <div className="party-xp">
                        <div className="row-between">
                          <span className="tiny muted">XP</span>
                          <strong>
                            {progress.xp.toLocaleString()}
                            {progress.required !== null
                              ? ` / ${progress.required.toLocaleString()}`
                              : ""}
                          </strong>
                        </div>
                        {progress.required !== null ? (
                          <ProgressBar
                            value={Math.min(progress.xp, progress.required)}
                            max={progress.required}
                          />
                        ) : null}
                        {progress.ready ? <Badge tone="gold">Ready to level</Badge> : null}
                        {progress.required === null ? (
                          <span className="tiny muted">Maximum level</span>
                        ) : null}
                      </div>
                    ) : null}
                    <div className="party-card-actions">
                      <Link to={`/characters/${character.id}`} className="btn btn-secondary btn-sm">
                        <ScrollText size={14} /> Sheet
                      </Link>
                      {character.permissions?.canEdit ? (
                        <Link
                          to={`/characters/${character.id}/edit`}
                          className="btn btn-ghost btn-sm"
                        >
                          <Pencil size={14} /> Edit
                        </Link>
                      ) : null}
                      {isGm ? (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={<Coins size={14} />}
                            loading={wealthBusyId === character.id}
                            onClick={() => void topUpWealth(character)}
                          >
                            Top up wealth
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={<Sparkles size={14} />}
                            loading={levelingId === character.id}
                            onClick={() => void levelUpCharacters(character.id)}
                          >
                            Level up
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </article>
                );
              })}
              {!characters.length ? (
                <EmptyState
                  icon={<Users size={30} />}
                  title="No heroes yet"
                  description="Create the first character for this campaign."
                  action={
                    <Button variant="primary" icon={<Plus size={15} />} onClick={createCharacter}>
                      Create a character
                    </Button>
                  }
                />
              ) : null}
            </div>
            {isGm && campaign.xpMode === "xp" && xpAwards.length ? (
              <Card className="xp-ledger">
                <div className="section-title">
                  <div>
                    <PageEyebrow>XP ledger</PageEyebrow>
                    <h3>Recent awards</h3>
                  </div>
                </div>
                <div className="stack" style={{ gap: 8 }}>
                  {xpAwards.slice(0, 6).map((award) => (
                    <div key={award.id} className="row-between xp-ledger-row">
                      <div>
                        <div className="row wrap" style={{ gap: 8 }}>
                          <strong>{award.amount.toLocaleString()} XP</strong>
                          <Badge tone="neutral">{XP_AWARD_KIND_LABELS[award.kind]}</Badge>
                        </div>
                        <p className="tiny muted">{award.reason || "No reason recorded"}</p>
                      </div>
                      <span className="tiny muted">
                        {award.recipientCount}{" "}
                        {award.recipientCount === 1 ? "character" : "characters"} ·{" "}
                        {formatDate(award.createdAt)}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            ) : null}
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
            activeSceneId={tableData.activeSceneId}
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

        {tab === "assets" ? <AssetLibrary campaignId={campaign.id} toast={toast} /> : null}

        {tab === "notes" ? (
          <NotesTab
            campaignId={campaign.id}
            isGm={Boolean(isGm)}
            refreshKey={campaign.updatedAt}
            toast={toast}
          />
        ) : null}

        {tab === "journal" ? (
          <div className="page-inner journal-layout">
            <div className="journal-list">
              <div className="row-between" style={{ marginBottom: 10 }}>
                <div>
                  <PageEyebrow>Chronicle</PageEyebrow>
                  <h2 style={{ marginTop: 5 }}>Journal</h2>
                  <p className="tiny muted" style={{ marginTop: 4 }}>
                    Session recaps, handouts, and quests. Private notes and shared lore are in Notes
                    &amp; lore.
                  </p>
                </div>
                <div className="row wrap" style={{ gap: 8 }}>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<BookOpen size={14} />}
                    onClick={() => setTab("notes")}
                  >
                    Notes &amp; lore
                  </Button>
                  {isGm ? (
                    <Button
                      size="sm"
                      variant="primary"
                      icon={<FilePlus2 size={14} />}
                      onClick={() => setJournalEditor("new")}
                    >
                      New entry
                    </Button>
                  ) : null}
                </div>
              </div>
              <div className="segmented journal-filter">
                <button
                  type="button"
                  className={journalFilter === "all" ? "is-active" : ""}
                  aria-pressed={journalFilter === "all"}
                  onClick={() => setJournalFilter("all")}
                >
                  All
                </button>
                <button
                  type="button"
                  className={journalFilter === "note" ? "is-active" : ""}
                  aria-pressed={journalFilter === "note"}
                  onClick={() => setJournalFilter("note")}
                >
                  Entries
                </button>
                <button
                  type="button"
                  className={journalFilter === "handout" ? "is-active" : ""}
                  aria-pressed={journalFilter === "handout"}
                  onClick={() => setJournalFilter("handout")}
                >
                  <FileImage size={12} /> Handouts
                </button>
                <button
                  type="button"
                  className={journalFilter === "quest" ? "is-active" : ""}
                  aria-pressed={journalFilter === "quest"}
                  onClick={() => setJournalFilter("quest")}
                >
                  <Swords size={12} /> Quests
                </button>
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
                    {entry.questStatus !== "none" ? (
                      <Tag tone={questStatusTone(entry.questStatus)}>
                        {questStatusLabel(entry.questStatus)}
                      </Tag>
                    ) : null}
                    <span className="tiny muted">
                      {formatDate(entry.updatedAt)} · {entry.visible ? "Visible" : "GM only"}
                    </span>
                  </span>
                </button>
              ))}
              {!filteredJournal.length ? (
                <p className="muted small">
                  {journalFilter === "handout"
                    ? "No handouts yet. Create one to share a map, letter, or clue."
                    : journalFilter === "quest"
                      ? "No quests yet. Mark a handout as a quest to track its status and XP."
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
                      <div
                        className="row wrap"
                        style={{ gap: 7, alignItems: "center", marginTop: 4 }}
                      >
                        <h2>{selectedJournal.title}</h2>
                        {selectedJournal.kind === "handout" ? (
                          <Tag tone="violet">Handout</Tag>
                        ) : null}
                        {selectedJournal.questStatus !== "none" ? (
                          <Tag tone={questStatusTone(selectedJournal.questStatus)}>
                            {questStatusLabel(selectedJournal.questStatus)}
                          </Tag>
                        ) : null}
                      </div>
                      <p className="tiny muted">
                        Written by {selectedJournal.authorName} ·{" "}
                        {formatDate(selectedJournal.updatedAt)}
                      </p>
                    </div>
                    {isGm ? (
                      <div className="row" style={{ gap: 6 }}>
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<Pencil size={13} />}
                          onClick={() => setJournalEditor(selectedJournal)}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<Copy size={13} />}
                          loading={journalBusy}
                          onClick={() => duplicateJournal(selectedJournal)}
                        >
                          Duplicate
                        </Button>
                        <button
                          className="icon-btn"
                          title="Delete entry"
                          onClick={() => deleteJournal(selectedJournal)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ) : null}
                  </div>
                  {selectedJournal.questStatus !== "none" ? (
                    <div className="quest-reward-banner">
                      <div>
                        <span className="field-label">Quest reward</span>
                        <p className="tiny muted">
                          {campaign.xpMode === "xp"
                            ? selectedJournal.questXp > 0
                              ? `${selectedJournal.questXp} XP when completed.`
                              : "No XP reward set."
                            : "Milestone campaign: quest XP is not used for advancement."}
                          {selectedJournal.questRewardedAt
                            ? ` Awarded ${formatDate(selectedJournal.questRewardedAt)}.`
                            : ""}
                        </p>
                      </div>
                      <div className="row" style={{ gap: 6, alignItems: "center" }}>
                        {selectedJournal.questRewardedAt ? <Tag tone="green">Rewarded</Tag> : null}
                        {isGm &&
                        campaign.xpMode === "xp" &&
                        selectedJournal.questStatus === "completed" &&
                        selectedJournal.questXp > 0 &&
                        !selectedJournal.questRewardedAt ? (
                          <Button
                            size="sm"
                            variant="primary"
                            icon={<Award size={13} />}
                            loading={journalBusy}
                            onClick={() => void awardQuestXp(selectedJournal)}
                          >
                            Award XP
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
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
                <EmptyState
                  icon={<ScrollText size={28} />}
                  title="The page is blank"
                  description="Choose an entry or write a new one."
                />
              )}
            </div>
          </div>
        ) : null}

        {tab === "gm-screen" ? (
          <GmScreen campaignId={campaign.id} characters={characters} toast={toast} />
        ) : null}

        {tab === "settings" ? (
          <div className="page-inner settings-layout">
            <Card className="settings-card">
              <PageEyebrow>Campaign settings</PageEyebrow>
              <h2 style={{ marginTop: 6 }}>The shape of the story</h2>
              <form className="stack" style={{ marginTop: 16 }} onSubmit={saveSettings}>
                <Field label="Campaign name">
                  <Input
                    value={settingsName}
                    onChange={(event) => setSettingsName(event.target.value)}
                    disabled={!isGm}
                  />
                </Field>
                <Field label="Premise">
                  <Textarea
                    value={settingsDescription}
                    onChange={(event) => setSettingsDescription(event.target.value)}
                    disabled={!isGm}
                  />
                </Field>
                <Field
                  label="Ruleset"
                  hint={
                    isGm
                      ? CAMPAIGN_RULESET_OPTIONS.find((option) => option.value === settingsRuleset)
                          ?.description
                      : "Set by the campaign GM. Your character inherits this ruleset."
                  }
                >
                  <Select
                    value={settingsRuleset}
                    onChange={(event) => setSettingsRuleset(event.target.value as CampaignRuleset)}
                    disabled={!isGm}
                  >
                    {CAMPAIGN_RULESET_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field
                  label="Advancement"
                  hint={
                    isGm
                      ? XP_MODE_OPTIONS.find((option) => option.value === settingsXpMode)
                          ?.description
                      : "Set by the campaign GM. It controls whether encounter XP budgets and awards are shown."
                  }
                >
                  <Select
                    value={settingsXpMode}
                    onChange={(event) => setSettingsXpMode(event.target.value as XpMode)}
                    disabled={!isGm}
                  >
                    {XP_MODE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field
                  label="Advancement speed"
                  hint={
                    isGm
                      ? ADVANCEMENT_SPEED_OPTIONS.find(
                          (option) => option.value === settingsAdvancementSpeed
                        )?.description
                      : "Set by the campaign GM. It controls how much XP each level requires."
                  }
                >
                  <Select
                    value={settingsAdvancementSpeed}
                    onChange={(event) =>
                      setSettingsAdvancementSpeed(event.target.value as AdvancementSpeed)
                    }
                    disabled={!isGm}
                  >
                    {ADVANCEMENT_SPEED_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field
                  label="Settlement level"
                  hint={
                    isGm
                      ? "The shop stocks common items of this level or lower. Characters sell gear for half price. Set 0 for a tiny outpost."
                      : "Set by the campaign GM. It controls which common items the settlement shop stocks."
                  }
                >
                  <Input
                    type="number"
                    min={0}
                    max={25}
                    value={settingsSettlementLevel}
                    onChange={(event) => setSettingsSettlementLevel(event.target.value)}
                    disabled={!isGm}
                  />
                </Field>
                {isGm ? (
                  <Button type="submit" variant="primary" loading={settingsBusy}>
                    Save changes
                  </Button>
                ) : null}
              </form>
              {isGm ? (
                <div className="settings-note">
                  <Sparkles size={15} />
                  <p>
                    Switch to <strong>XP tracking</strong> to see PF2e encounter difficulty and
                    award XP. <strong>Milestone</strong> hides those numbers. Advancement speed sets
                    the XP threshold for each level (fast 800, medium 1,000, slow 1,200). Either
                    way, no character levels up automatically; use <strong>Level up party</strong>{" "}
                    or the <strong>Level up</strong> button on a party card when you decide.
                  </p>
                </div>
              ) : null}
              {isGm ? (
                <>
                  <div className="divider" />
                  <h3>Invite code</h3>
                  <p className="muted small">
                    Share this seven-character code with your players. Regenerating it invalidates
                    the old one.
                  </p>
                  <div className="invite-code-row">
                    <code>{campaign.inviteCode}</code>
                    <Button
                      size="sm"
                      icon={<Copy size={14} />}
                      onClick={async () => {
                        const copied = await copyText(campaign.inviteCode);
                        toast(
                          copied ? "Invite code copied." : "Could not copy the code.",
                          copied ? "success" : "error"
                        );
                      }}
                    >
                      Copy
                    </Button>
                    <Button
                      size="sm"
                      variant="primary"
                      icon={<UserPlus size={14} />}
                      onClick={() => setInviteOpen(true)}
                    >
                      Invite link
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<RefreshCw size={14} />}
                      onClick={regenerateCode}
                    >
                      Regenerate
                    </Button>
                  </div>
                </>
              ) : null}
            </Card>

            {isGm ? (
              <Card className="settings-card">
                <div className="row-between">
                  <div>
                    <PageEyebrow>Approval queue</PageEyebrow>
                    <h2 style={{ marginTop: 6 }}>Join requests</h2>
                    <p className="muted small">
                      Pathbuilder imports waiting for your review before they join the party.
                    </p>
                  </div>
                  <Badge tone={joinRequests.length ? "gold" : "neutral"}>
                    {joinRequests.length} pending
                  </Badge>
                </div>
                {joinRequests.length ? (
                  <div className="join-request-list">
                    {joinRequests.map((request) => {
                      const errors = request.validation.filter(
                        (issue) => issue.severity === "error"
                      ).length;
                      return (
                        <div key={request.id} className="join-request-row">
                          <Avatar
                            name={request.characterName}
                            src={request.summary?.portraitUrl}
                            size={40}
                          />
                          <div className="grow">
                            <div className="row wrap" style={{ gap: 7 }}>
                              <strong>{request.characterName}</strong>
                              {request.summary ? (
                                <Badge tone="blue">Level {request.summary.level}</Badge>
                              ) : (
                                <Badge tone="gold">Draft</Badge>
                              )}
                            </div>
                            <p className="tiny muted">
                              Imported by {request.playerName}
                              {request.summary
                                ? ` · ${request.summary.className || "No class"} · ${request.summary.ancestry || "No ancestry"}`
                                : " · Unfinished character"}
                            </p>
                            {request.validation.length ? (
                              <details className="join-request-details" open={errors > 0}>
                                <summary className="tiny" style={{ color: "#e7b1b1" }}>
                                  {errors
                                    ? `${errors} build ${errors === 1 ? "error" : "errors"}`
                                    : `${request.validation.length} review ${request.validation.length === 1 ? "item" : "items"}`}
                                </summary>
                                <ul className="join-request-issues tiny">
                                  {[...request.validation]
                                    .sort((a, b) =>
                                      a.severity === b.severity
                                        ? 0
                                        : a.severity === "error"
                                          ? -1
                                          : 1
                                    )
                                    .slice(0, 10)
                                    .map((issue, index) => (
                                      <li
                                        key={`${issue.message}-${index}`}
                                        className={
                                          issue.severity === "error" ? "is-error" : "is-warning"
                                        }
                                      >
                                        {issue.message}
                                      </li>
                                    ))}
                                </ul>
                              </details>
                            ) : null}
                            {request.report ? (
                              <details className="join-request-details">
                                <summary className="tiny muted">View import report</summary>
                                <ImportReport report={request.report} limit={12} />
                              </details>
                            ) : null}
                          </div>
                          <div className="join-request-actions">
                            {request.characterId ? (
                              <Link
                                to={`/characters/${request.characterId}`}
                                className="btn btn-ghost btn-sm"
                              >
                                Review sheet
                              </Link>
                            ) : null}
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={joinRequestBusy === request.id}
                              onClick={() => void decideJoinRequest(request, "decline")}
                            >
                              Decline
                            </Button>
                            <Button
                              size="sm"
                              variant="primary"
                              loading={joinRequestBusy === request.id}
                              onClick={() => void decideJoinRequest(request, "approve")}
                            >
                              Approve
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="muted small" style={{ marginTop: 12 }}>
                    No pending requests. When a player imports a Pathbuilder character from the
                    invite page, it appears here for review.
                  </p>
                )}
              </Card>
            ) : null}

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
                        {member.role === "gm" ? (
                          <Badge tone="gold">
                            <Crown size={10} /> GM
                          </Badge>
                        ) : null}
                        {member.id === user?.id ? <Badge tone="blue">You</Badge> : null}
                      </div>
                      <p className="tiny muted">
                        @{member.username} · joined {formatDate(member.joinedAt)}
                      </p>
                    </div>
                    {isGm && member.role !== "gm" ? (
                      <button
                        className="icon-btn"
                        title="Remove from campaign"
                        onClick={() => removeMember(member)}
                      >
                        <Trash2 size={14} />
                      </button>
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
                      Export characters, scenes, tokens, chat, journal, and state as portable JSON.
                      Choose <strong>with files</strong> to embed uploaded images and audio in the
                      archive. Private player notes are never included.
                    </p>
                  </div>
                  <div className="row wrap" style={{ gap: 8 }}>
                    <Button
                      variant="secondary"
                      icon={<Download size={14} />}
                      onClick={() => void exportCampaign()}
                    >
                      Export campaign
                    </Button>
                    <Button
                      variant="ghost"
                      icon={<Download size={14} />}
                      onClick={() => void exportCampaign(true)}
                    >
                      Export with files
                    </Button>
                  </div>
                </div>
              ) : null}
              <div className="divider" />
              {isGm ? (
                <div className="danger-zone">
                  <div>
                    <h3>Delete campaign</h3>
                    <p className="muted small">
                      This removes the campaign, scenes, journal, and character links permanently.
                    </p>
                  </div>
                  <Button variant="danger" icon={<Trash2 size={14} />} onClick={deleteCampaign}>
                    Delete campaign
                  </Button>
                </div>
              ) : (
                <div className="danger-zone">
                  <div>
                    <h3>Leave campaign</h3>
                    <p className="muted small">
                      Your characters will remain, but they'll no longer be assigned to this
                      campaign.
                    </p>
                  </div>
                  <Button variant="danger" icon={<LogOut size={14} />} onClick={leaveCampaign}>
                    Leave campaign
                  </Button>
                </div>
              )}
            </Card>
          </div>
        ) : null}
      </div>

      <InviteModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        campaign={
          campaign && campaign.inviteCode
            ? { id: campaign.id, name: campaign.name, inviteCode: campaign.inviteCode }
            : null
        }
      />

      <Modal
        open={Boolean(journalEditor)}
        onClose={() => setJournalEditor(null)}
        title={
          journalEditor === "new"
            ? journalKind === "handout"
              ? "New handout"
              : "New journal entry"
            : journalKind === "handout"
              ? "Edit handout"
              : "Edit journal entry"
        }
        subtitle={
          journalKind === "handout"
            ? "Share a map, letter, portrait, or clue with the table."
            : "Plain text with simple Markdown-style headings and emphasis."
        }
        wide
        footer={
          <>
            <Button variant="ghost" onClick={() => setJournalEditor(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={saveJournal}
              loading={journalBusy}
              disabled={journalUploadBusy}
            >
              {journalKind === "handout" ? "Save handout" : "Save entry"}
            </Button>
          </>
        }
      >
        <form className="stack" onSubmit={saveJournal}>
          <div className="segmented">
            <button
              type="button"
              className={journalKind === "note" ? "is-active" : ""}
              onClick={() => setJournalKind("note")}
            >
              <ScrollText size={13} /> Journal entry
            </button>
            <button
              type="button"
              className={journalKind === "handout" ? "is-active" : ""}
              onClick={() => setJournalKind("handout")}
            >
              <FileImage size={13} /> Handout
            </button>
          </div>
          <Field label="Title">
            <Input
              autoFocus
              value={journalTitle}
              onChange={(event) => setJournalTitle(event.target.value)}
              placeholder={
                journalKind === "handout" ? "The ferryman's letter" : "Session 4 — The Sunken Crypt"
              }
            />
          </Field>
          {journalKind === "handout" ? (
            <div className="form-grid two">
              <Field label="Quest status" hint="Track this handout as an active quest.">
                <Select
                  value={journalQuestStatus}
                  onChange={(event) => setJournalQuestStatus(event.target.value as QuestStatus)}
                >
                  {QUEST_STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label="Quest XP"
                hint={
                  campaign?.xpMode === "xp"
                    ? "Awarded to the party when completed. 0 disables the reward."
                    : "Stored for reference only in milestone campaigns."
                }
              >
                <Input
                  type="number"
                  min={0}
                  max={1000}
                  step={5}
                  value={journalQuestXp}
                  onChange={(event) => setJournalQuestXp(event.target.value)}
                />
              </Field>
            </div>
          ) : null}
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
                <p className="field-hint">
                  Attach maps, letters, portraits, or clues. Shared entries show these to players.
                </p>
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
                    <img
                      src={attachment.url}
                      alt={attachment.name}
                      loading="lazy"
                      decoding="async"
                    />
                    <span>{attachment.name}</span>
                    <button
                      type="button"
                      className="icon-btn"
                      title="Remove image"
                      onClick={() =>
                        setJournalAttachments((current) =>
                          current.filter((item) => item.id !== attachment.id)
                        )
                      }
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
        footer={
          <Button variant="ghost" onClick={() => setAssetPickerOpen(false)}>
            Done
          </Button>
        }
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
                    {asset.unused ? "Unused" : (asset.usage[0] ?? "In use")}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </Modal>

      <Modal
        open={downtimeOpen}
        onClose={() => setDowntimeOpen(false)}
        title="Grant downtime"
        subtitle="Give the party time between adventures. Players spend the days from their character sheet."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDowntimeOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              icon={<CalendarClock size={15} />}
              loading={downtimeBusy}
              onClick={() => void grantDowntime()}
            >
              Grant downtime
            </Button>
          </>
        }
      >
        <div className="stack">
          {downtimeError ? <div className="auth-error">{downtimeError}</div> : null}
          <Field
            label="Downtime days"
            hint="Each character receives this many days to spend on earn income, crafting, retraining, or other downtime activities."
          >
            <Input
              type="number"
              min={1}
              max={365}
              value={downtimeDays}
              onChange={(event) => setDowntimeDays(event.target.value)}
            />
          </Field>
          <div className="row-between">
            <strong>Recipients</strong>
            <div className="row" style={{ gap: 6 }}>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setDowntimeTargetIds(characters.map((entry) => entry.id))}
              >
                All
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setDowntimeTargetIds([])}
              >
                None
              </Button>
            </div>
          </div>
          <div className="stack" style={{ gap: 4 }}>
            {characters.map((entry) => (
              <Checkbox
                key={entry.id}
                label={`${entry.name} (${entry.summary?.downtimeDays ?? 0} days)`}
                checked={downtimeTargetIds.includes(entry.id)}
                onChange={(checked) => toggleDowntimeTarget(entry.id, checked)}
              />
            ))}
          </div>
        </div>
      </Modal>

      <Modal
        open={heroPointOpen}
        onClose={() => setHeroPointOpen(false)}
        title="Hero Points"
        subtitle="Award points for heroic actions, or reset the table for a new session."
        footer={
          <>
            <Button variant="ghost" onClick={() => setHeroPointOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              icon={<Star size={15} />}
              loading={heroPointBusy}
              onClick={() => void awardHeroPoints()}
            >
              Award Hero Points
            </Button>
          </>
        }
      >
        <div className="stack">
          {heroPointError ? <div className="auth-error">{heroPointError}</div> : null}
          <Field
            label="Amount"
            hint="Hero Points are capped at 3. Award 1 for a notable heroic act, or more for an especially memorable moment."
          >
            <Select
              value={heroPointAmount}
              onChange={(event) => setHeroPointAmount(event.target.value)}
            >
              <option value="1">1 Hero Point</option>
              <option value="2">2 Hero Points</option>
              <option value="3">3 Hero Points</option>
            </Select>
          </Field>
          <div className="row-between">
            <strong>Recipients</strong>
            <div className="row" style={{ gap: 6 }}>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setHeroPointRecipientIds(characters.map((entry) => entry.id))}
              >
                All
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setHeroPointRecipientIds([])}
              >
                None
              </Button>
            </div>
          </div>
          <div className="stack" style={{ gap: 4 }}>
            {characters.map((entry) => (
              <Checkbox
                key={entry.id}
                label={`${entry.name} (${entry.summary?.heroPoints ?? 0} / 3)`}
                checked={heroPointRecipientIds.includes(entry.id)}
                onChange={(checked) => toggleHeroPointRecipient(entry.id, checked)}
              />
            ))}
          </div>
          <div className="divider" />
          <div>
            <strong>Start a new session</strong>
            <p className="tiny muted">
              Sets every character's Hero Points to 1. HP, focus, spells, conditions, and session
              status are unchanged.
            </p>
            <Button
              type="button"
              variant="secondary"
              loading={heroPointBusy}
              onClick={() => void startNewSession()}
            >
              Start new session (reset to 1)
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={xpOpen}
        onClose={() => setXpOpen(false)}
        title="Award XP"
        subtitle="Track experience without advancing anyone automatically. Level-ups stay in the GM's hands."
        footer={
          <>
            <Button variant="ghost" onClick={() => setXpOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              icon={<Award size={15} />}
              loading={xpBusy}
              onClick={() => void awardXp()}
            >
              Award XP
            </Button>
          </>
        }
      >
        <div className="stack">
          {xpError ? <div className="auth-error">{xpError}</div> : null}
          <Field
            label="Award type"
            hint="Encounters use the PF2e threat XP. Hazards use the level-difference table. Accomplishments cover exploration and story milestones."
          >
            <Select
              value={xpKind}
              onChange={(event) => setXpKind(event.target.value as XpAwardKind)}
            >
              {XP_AWARD_KINDS.filter((kind) => kind !== "quest").map((kind) => (
                <option key={kind} value={kind}>
                  {XP_AWARD_KIND_LABELS[kind]}
                </option>
              ))}
            </Select>
          </Field>
          {xpKind === "hazard" ? (
            <>
              <div className="form-grid three">
                <Field label="Hazard level">
                  <Input
                    type="number"
                    min={0}
                    max={30}
                    value={xpHazardLevel}
                    onChange={(event) => setXpHazardLevel(event.target.value)}
                  />
                </Field>
                <Field label="Party level">
                  <Input
                    type="number"
                    min={1}
                    max={20}
                    value={xpPartyLevel}
                    onChange={(event) => setXpPartyLevel(event.target.value)}
                  />
                </Field>
                <Field label="Hazard type">
                  <Select
                    value={xpHazardComplexity}
                    onChange={(event) =>
                      setXpHazardComplexity(event.target.value as "simple" | "complex")
                    }
                  >
                    <option value="complex">Complex hazard</option>
                    <option value="simple">Simple hazard</option>
                  </Select>
                </Field>
              </div>
              <p className="tiny muted">
                This hazard is worth <strong>{xpPreviewAmount.toLocaleString()} XP</strong>. Award
                it once, whether the party disables, avoids, or endures the hazard.
              </p>
            </>
          ) : null}
          {xpKind === "accomplishment" ? (
            <Field
              label="Accomplishment"
              hint="Minor 10 XP, moderate 30 XP, major 80 XP. Moderate and major awards often also grant a Hero Point."
            >
              <div className="xp-quick">
                {ACCOMPLISHMENT_TIERS.map((tier) => (
                  <Button
                    key={tier}
                    type="button"
                    size="sm"
                    variant={xpAccomplishmentTier === tier ? "primary" : "ghost"}
                    onClick={() => setXpAccomplishmentTier(tier)}
                  >
                    {ACCOMPLISHMENT_LABELS[tier]} ({ACCOMPLISHMENT_XP[tier]} XP)
                  </Button>
                ))}
              </div>
            </Field>
          ) : null}
          {xpKind === "encounter" || xpKind === "other" ? (
            <>
              <Field
                label="XP amount"
                hint="PF2e encounter awards: trivial 10, low 15, moderate 20, severe 30, extreme 40."
              >
                <Input
                  type="number"
                  min={1}
                  max={100000}
                  value={xpAmount}
                  onChange={(event) => setXpAmount(event.target.value)}
                />
              </Field>
              <div className="xp-quick">
                {[10, 15, 20, 30, 40].map((value) => (
                  <Button
                    key={value}
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setXpAmount(String(value))}
                  >
                    {value} XP
                  </Button>
                ))}
              </div>
            </>
          ) : null}
          <Field label="Reason (optional)">
            <Input
              value={xpReason}
              onChange={(event) => setXpReason(event.target.value)}
              placeholder="Moderate encounter · Session 12"
            />
          </Field>
          <div className="row-between">
            <strong>Recipients</strong>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setXpRecipientIds(characters.map((character) => character.id))}
            >
              Select all
            </Button>
          </div>
          <div className="xp-recipients">
            {characters.map((character) => (
              <Checkbox
                key={character.id}
                checked={xpRecipientIds.includes(character.id)}
                onChange={(checked) => toggleXpRecipient(character.id, checked)}
                label={
                  <span>
                    {character.name}
                    {character.summary ? (
                      <span className="tiny muted">
                        {" "}
                        · Level {character.summary.level} · {character.summary.xp ?? 0} XP
                      </span>
                    ) : null}
                  </span>
                }
              />
            ))}
            {!characters.length ? (
              <p className="muted small">No characters in this campaign yet.</p>
            ) : null}
          </div>
          <div className="settings-note">
            <Award size={16} />
            <span>
              XP never triggers a level-up. Use <strong>Level up</strong> on a party card or{" "}
              <strong>Level up party</strong> when you decide.
            </span>
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(previewAttachment)}
        onClose={() => setPreviewAttachment(null)}
        title={previewAttachment?.name}
        extraWide
      >
        {previewAttachment ? (
          <img
            className="handout-preview"
            src={previewAttachment.url}
            alt={previewAttachment.name}
          />
        ) : null}
      </Modal>
    </div>
  );
}
