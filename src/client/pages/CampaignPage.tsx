import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  Award,
  Copy,
  Crown,
  Download,
  FileImage,
  FilePlus2,
  ImagePlus,
  Images,
  LayoutGrid,
  LogOut,
  Pencil,
  RefreshCw,
  ScrollText,
  Settings,
  Shield,
  Sparkles,
  Swords,
  Trash2,
  UserPlus,
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
  XpMode,
} from "../../shared/types";
import {
  ADVANCEMENT_SPEED_OPTIONS,
  CAMPAIGN_RULESET_OPTIONS,
  XP_MODE_OPTIONS,
  rulesetLabel,
} from "../../shared/content";
import { QUEST_STATUS_OPTIONS, normalizeQuestXp } from "../../shared/journal";
import { xpPerLevel } from "../../shared/xp";
import { api, copyText, formatDate, uploadImage } from "../api";
import { connectSocket, joinCampaign } from "../socket";
import { errorMessage } from "../stores";
import { useSession, useToasts } from "../stores";
import {
  Avatar,
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  Field,
  Input,
  LoadingScreen,
  Modal,
  PageEyebrow,
  Select,
  Spinner,
  Tag,
  Textarea,
  Toggle,
} from "../components/ui";
import { VttTable } from "../components/table/VttTable";
import { InviteModal } from "../components/campaign/InviteModal";
import { AwardTreasureModal } from "../components/campaign/AwardTreasureModal";
import { CorePartyPanel } from "../components/campaign/CorePartyPanel";
import { JournalBody } from "../components/JournalBody";
import { ImportReport } from "../components/ImportReport";

function questStatusLabel(status: QuestStatus): string {
  return QUEST_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? "Quest";
}

function questStatusTone(status: QuestStatus): "blue" | "green" | "red" {
  return status === "completed" ? "green" : status === "failed" ? "red" : "blue";
}

type Tab = "table" | "party" | "journal" | "settings";

interface CampaignDetails {
  campaign: CampaignSummary;
  members: CampaignMember[];
  characters: CharacterRecord[];
  joinRequests?: CampaignJoinRequest[];
}

const TABS: { id: Tab; label: string; icon: React.ReactNode; gmOnly?: boolean }[] = [
  { id: "table", label: "Table", icon: <LayoutGrid size={15} /> },
  { id: "party", label: "Party", icon: <Users size={15} /> },
  { id: "journal", label: "Journal", icon: <ScrollText size={15} /> },
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
    rawTab === "party" || rawTab === "journal" || rawTab === "settings" ? rawTab : "table";
  const [campaign, setCampaign] = useState<CampaignSummary | null>(null);
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
  const [transferTarget, setTransferTarget] = useState("");
  const [transferBusy, setTransferBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [settingsDescription, setSettingsDescription] = useState("");
  const [settingsRuleset, setSettingsRuleset] = useState<CampaignRuleset>("core");
  const [settingsXpMode, setSettingsXpMode] = useState<XpMode>("milestone");
  const [settingsAdvancementSpeed, setSettingsAdvancementSpeed] =
    useState<AdvancementSpeed>("medium");
  const [settingsFreeArchetype, setSettingsFreeArchetype] = useState(false);
  const [settingsAutomaticBonusProgression, setSettingsAutomaticBonusProgression] = useState(false);
  const [settingsPlayerItemGrant, setSettingsPlayerItemGrant] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [awardOpen, setAwardOpen] = useState(false);
  const [levelingId, setLevelingId] = useState<string | null>(null);

  const isGm = campaign?.role === "gm";
  const tab = requestedTab as Tab;
  const visibleTabs = isGm ? TABS : TABS.filter((entry) => !entry.gmOnly);
  const primaryTabs = visibleTabs.filter((entry) => entry.id !== "settings");
  const settingsTab = visibleTabs.find((entry) => entry.id === "settings");

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
      setSettingsFreeArchetype(details.campaign.freeArchetype);
      setSettingsAutomaticBonusProgression(details.campaign.automaticBonusProgression);
      setSettingsPlayerItemGrant(details.campaign.playerItemGrant);
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
    if (!id || (tab !== "party" && tab !== "settings")) return;
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
    socket.on("campaign:updated", applySummary);
    socket.on("character:updated", onCharacterUpdated);
    socket.on("character:created", onCharacterCreated);
    socket.on("character:removed", onCharacterRemoved);
    socket.on("journal:created", upsertJournal);
    socket.on("journal:updated", upsertJournal);
    socket.on("journal:deleted", onJournalDeleted);
    socket.on("join-request:created", refreshDetails);
    socket.on("join-request:updated", refreshDetails);
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
      }>(`/api/campaigns/${id}/journal/${entry.id}/award-quest-xp`, { method: "POST" });
      setCharacters(result.characters);
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
          freeArchetype: settingsFreeArchetype,
          automaticBonusProgression: settingsAutomaticBonusProgression,
          playerItemGrant: settingsPlayerItemGrant,
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
                freeArchetype: result.campaign.freeArchetype,
                automaticBonusProgression: result.campaign.automaticBonusProgression,
                playerItemGrant: result.campaign.playerItemGrant,
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

  const transferCampaign = async () => {
    if (!id || !transferTarget) return;
    const target = members.find((member) => member.id === transferTarget);
    if (
      !target ||
      !window.confirm(
        `Make ${target.displayName} the GM? You will become a player and lose GM controls.`
      )
    ) {
      return;
    }
    setTransferBusy(true);
    try {
      const result = await api<{ campaign: CampaignSummary }>(`/api/campaigns/${id}/transfer`, {
        method: "POST",
        body: { userId: transferTarget },
      });
      setCampaign(result.campaign);
      setMembers((current) =>
        current.map((member) => ({
          ...member,
          role: member.id === transferTarget ? "gm" : "player",
        }))
      );
      setTransferTarget("");
      toast(`${target.displayName} is now the GM.`, "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setTransferBusy(false);
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
    const cost =
      campaign.xpMode === "xp"
        ? `this consumes up to ${xpPerLevel(campaign.advancementSpeed).toLocaleString()} XP`
        : "milestone advancement costs no XP";
    const message = target
      ? `Advance ${target.name} by one level? The GM controls advancement, and ${cost}.`
      : `Advance every character in this campaign by one level? The GM controls advancement, and each character advances with ${cost}.`;
    if (!window.confirm(message)) return;
    if (target) setLevelingId(target.id);
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
    }
  };

  const deleteCampaign = async () => {
    if (!id || !campaign) return;
    if (deleteConfirm.trim() !== campaign.name) {
      toast("Type the campaign name exactly to confirm deletion.", "error");
      return;
    }
    setDeleteBusy(true);
    try {
      await api(`/api/campaigns/${id}`, {
        method: "DELETE",
        body: { confirmName: deleteConfirm.trim() },
      });
      navigate("/campaigns");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setDeleteBusy(false);
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
        {tab === "party" ? (
          <CorePartyPanel
            characters={characters}
            isGm={isGm}
            onNewCharacter={createCharacter}
            onLevelUp={(characterId) => void levelUpCharacters(characterId)}
            onAwardTreasure={() => setAwardOpen(true)}
            levelingId={levelingId}
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
                    Session recaps, handouts, and quests.
                  </p>
                </div>
                <div className="row wrap" style={{ gap: 8 }}>
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
                          type="button"
                          className="icon-btn"
                          title="Delete entry"
                          aria-label={`Delete ${selectedJournal.title}`}
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
                <details className="settings-advanced">
                  <summary>Advanced: XP and advancement</summary>
                  <Field
                    label="Advancement"
                    hint={
                      isGm
                        ? XP_MODE_OPTIONS.find((option) => option.value === settingsXpMode)
                            ?.description
                        : "Set by the campaign GM. It controls whether level-ups spend XP and whether quest rewards can be granted."
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
                </details>
                <div>
                  <Checkbox
                    label="Free Archetype variant"
                    checked={settingsFreeArchetype}
                    onChange={setSettingsFreeArchetype}
                    disabled={!isGm}
                  />
                  <p className="tiny muted">
                    Adds an extra archetype feat slot at every even level. Existing characters gain
                    the slots the next time their builder or sheet loads.
                  </p>
                </div>
                <div>
                  <Checkbox
                    label="Automatic Bonus Progression"
                    checked={settingsAutomaticBonusProgression}
                    onChange={setSettingsAutomaticBonusProgression}
                    disabled={!isGm}
                  />
                  <p className="tiny muted">
                    Replaces fundamental weapon and armor rune math with level-based attack, damage,
                    AC, save, Perception, and skill potency. Property runes still work.
                  </p>
                </div>
                <div>
                  <Checkbox
                    label="Players may add gear without paying"
                    checked={settingsPlayerItemGrant}
                    onChange={setSettingsPlayerItemGrant}
                    disabled={!isGm}
                  />
                  <p className="tiny muted">
                    Adds a free “Grant” action beside Buy in every character&apos;s gear browser.
                    The GM can always grant gear.
                  </p>
                </div>
                {isGm ? (
                  <Field
                    label="Transfer GM"
                    hint="Hand this campaign to another member. You become a player and lose GM controls."
                  >
                    <div className="row wrap" style={{ gap: 8 }}>
                      <Select
                        value={transferTarget}
                        onChange={(event) => setTransferTarget(event.target.value)}
                      >
                        <option value="">Choose a member.</option>
                        {members
                          .filter((member) => member.id !== campaign?.gmId)
                          .map((member) => (
                            <option key={member.id} value={member.id}>
                              {member.displayName}
                            </option>
                          ))}
                      </Select>
                      <Button
                        type="button"
                        variant="secondary"
                        loading={transferBusy}
                        disabled={!transferTarget}
                        onClick={() => void transferCampaign()}
                      >
                        Transfer
                      </Button>
                    </div>
                  </Field>
                ) : null}
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
                    Switch to <strong>XP tracking</strong> to spend XP on level-ups and award quest
                    rewards. <strong>Milestone</strong> skips XP bookkeeping. Advancement speed sets
                    the XP threshold for each level (fast 800, medium 1,000, slow 1,200). Either
                    way, no character levels up automatically; use <strong>Level up party</strong>{" "}
                    or the <strong>Level up</strong> button on a party card when you decide.
                  </p>
                </div>
              ) : null}
            </Card>

            <div className="settings-side">
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

              {isGm ? (
                <Card className="settings-card">
                  <PageEyebrow>Players</PageEyebrow>
                  <h2 style={{ marginTop: 6 }}>Invite code</h2>
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
                </Card>
              ) : null}

              <Card className="settings-card">
                <div className="row-between">
                  <div>
                    <PageEyebrow>Party</PageEyebrow>
                    <h2 style={{ marginTop: 6 }}>Members</h2>
                  </div>
                  <Badge tone="gold">
                    {members.length} {members.length === 1 ? "seat" : "seats"}
                  </Badge>
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
                          type="button"
                          className="icon-btn"
                          title="Remove from campaign"
                          aria-label={`Remove ${member.displayName} from the campaign`}
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
                        Export characters, scenes, tokens, chat, journal, and state as portable
                        JSON. Choose <strong>with files</strong> to embed uploaded images and audio
                        in the archive. Private player notes are never included.
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
                    <Button
                      variant="danger"
                      icon={<Trash2 size={14} />}
                      onClick={() => {
                        setDeleteConfirm("");
                        setDeleteOpen(true);
                      }}
                    >
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
          </div>
        ) : null}
      </div>

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete this campaign permanently?"
        subtitle="There is no undo. Export a copy first if you might want any of it later."
        footer={
          <>
            <Button variant="ghost" onClick={() => void exportCampaign(true)}>
              Export with files
            </Button>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={deleteBusy}
              disabled={!campaign || deleteConfirm.trim() !== campaign.name}
              onClick={() => void deleteCampaign()}
            >
              Delete permanently
            </Button>
          </>
        }
      >
        <div className="stack">
          <p className="small muted">
            This removes the campaign, every scene and token, journal entries, and character links.
            Characters themselves are kept but unassigned.
          </p>
          <Field
            label="Type the campaign name to confirm"
            hint={campaign ? `Type "${campaign.name}" exactly.` : undefined}
          >
            <Input
              autoFocus
              value={deleteConfirm}
              onChange={(event) => setDeleteConfirm(event.target.value)}
              placeholder={campaign?.name ?? ""}
            />
          </Field>
        </div>
      </Modal>

      <InviteModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        campaign={
          campaign && campaign.inviteCode
            ? { id: campaign.id, name: campaign.name, inviteCode: campaign.inviteCode }
            : null
        }
      />

      <AwardTreasureModal
        open={awardOpen}
        onClose={() => setAwardOpen(false)}
        campaignId={campaign.id}
        characters={characters}
        onAwarded={(result) => {
          const updated = new Map(result.characters.map((character) => [character.id, character]));
          setCharacters((current) =>
            current.map((character) => updated.get(character.id) ?? character)
          );
          setTableData((current) =>
            current
              ? {
                  ...current,
                  characters: current.characters.map(
                    (character) => updated.get(character.id) ?? character
                  ),
                }
              : current
          );
          toast(result.message, "success");
        }}
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
                      aria-label={`Remove ${attachment.name}`}
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
