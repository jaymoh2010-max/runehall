import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Dices,
  Eye,
  EyeOff,
  Grid3X3,
  Keyboard,
  Lock,
  Map,
  Maximize2,
  MessageSquare,
  Minimize2,
  Minus,
  MousePointer2,
  Plus,
  Ruler,
  Shield,
  Swords,
  Trash2,
  Unlock,
  Users,
  X,
} from "lucide-react";
import type {
  CampaignTable,
  CharacterRecord,
  CharacterSummary,
  ChatMessage,
  InitiativeEntry,
  Monster,
  PresenceUser,
  PublicUser,
  Scene,
  Token,
} from "../../../shared/types";
import { errorMessage, useToasts } from "../../stores";
import { api } from "../../api";
import { connectSocket } from "../../socket";
import { getSocket } from "../../socket";
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  IconButton,
  Input,
  Select,
  Stat,
  Tag,
  Toggle,
} from "../ui";
import { SceneCanvas } from "./SceneCanvas";
import { ChatPanel } from "./ChatPanel";
import { InitiativeBar } from "./InitiativeBar";
import { PartyRail } from "./PartyRail";
import { TokenEditModal } from "./TokenEditModal";
import { AddTokenModal, SceneEditModal, SceneManagerModal } from "./TableModals";
import { VttToolbar } from "./VttToolbar";
import { VttTokenPanel } from "./VttTokenPanel";
import { BestiaryPalette } from "./BestiaryPalette";

interface VttTableProps {
  initial: CampaignTable;
  campaignId: string;
  user: PublicUser;
  isGm: boolean;
}

export function VttTable({ initial, campaignId, user, isGm }: VttTableProps) {
  const toast = useToasts((state) => state.push);
  const [scenes, setScenes] = useState<Scene[]>(initial.scenes);
  const [tokens, setTokens] = useState<Token[]>(initial.tokens);
  const [characters, setCharacters] = useState<CharacterRecord[]>(initial.characters);
  const [activeSceneId, setActiveSceneId] = useState<string | null>(initial.activeSceneId);
  const [messages, setMessages] = useState<ChatMessage[]>(initial.messages);
  const [initiative, setInitiative] = useState<InitiativeEntry[]>(initial.initiative);
  const [round, setRound] = useState(initial.round);
  const [turnIndex, setTurnIndex] = useState(initial.turnIndex);
  const [presence, setPresence] = useState<PresenceUser[]>([]);
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);
  const [editingTokenId, setEditingTokenId] = useState<string | null>(null);
  const [fogBrush, setFogBrush] = useState<"reveal" | "hide" | null>(null);
  const [brushSize, setBrushSize] = useState(3);
  const [measureMode, setMeasureMode] = useState(false);
  const [sceneManagerOpen, setSceneManagerOpen] = useState(false);
  const [editingScene, setEditingScene] = useState<Scene | null>(null);
  const [addTokenOpen, setAddTokenOpen] = useState(false);
  const [bestiaryOpen, setBestiaryOpen] = useState(false);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [remotePointer, setRemotePointer] = useState<{ x: number; y: number; name: string; ts: number } | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<"connecting" | "online" | "offline">("connecting");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [theaterMode, setTheaterMode] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const pointerTimer = useRef<number | null>(null);
  const joined = useRef(false);
  const wasConnectedOnce = useRef(false);

  const refreshTable = useCallback(async () => {
    try {
      const snapshot = await api<CampaignTable>(`/api/campaigns/${campaignId}/table`);
      setScenes(snapshot.scenes);
      setTokens(snapshot.tokens);
      setCharacters(snapshot.characters);
      setActiveSceneId(snapshot.activeSceneId);
      setInitiative(snapshot.initiative);
      setRound(snapshot.round);
      setTurnIndex(snapshot.turnIndex);
      setMessages((current) => {
        const merged = new globalThis.Map(current.map((message) => [message.id, message]));
        for (const message of snapshot.messages) merged.set(message.id, message);
        return [...merged.values()].sort((a, b) => a.createdAt - b.createdAt).slice(-200);
      });
      setSelectedTokenId((current) =>
        current && snapshot.tokens.some((token) => token.id === current) ? current : null,
      );
    } catch (error) {
      toast(`Could not refresh the table: ${errorMessage(error)}`, "error");
    }
  }, [campaignId, toast]);

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
      setTheaterMode(false);
      return;
    }
    if (theaterMode) {
      setTheaterMode(false);
      return;
    }
    // Enter theater mode immediately so the button always responds, even in
    // embedded browsers where the Fullscreen API is blocked or never settles.
    setTheaterMode(true);
    if (document.fullscreenEnabled && rootRef.current?.requestFullscreen) {
      rootRef.current
        .requestFullscreen()
        .then(() => {
          if (document.fullscreenElement) setTheaterMode(false);
        })
        .catch(() => undefined);
    }
  }, [theaterMode]);

  const activeScene = scenes.find((scene) => scene.id === activeSceneId) ?? null;
  const sceneTokens = useMemo(
    () => tokens.filter((token) => token.sceneId === activeSceneId && (isGm || !token.hidden)),
    [tokens, activeSceneId, isGm],
  );
  const selectedToken = sceneTokens.find((token) => token.id === selectedTokenId) ?? null;
  const editingToken = tokens.find((token) => token.id === editingTokenId) ?? null;

  // ---- Realtime -----------------------------------------------------------
  useEffect(() => {
    if (window.innerWidth < 1160) setRightOpen(false);
    if (window.innerWidth < 760) setLeftOpen(false);
  }, []);

  useEffect(() => {
    const socket = connectSocket();
    const join = () => {
      setConnectionStatus("connecting");
      socket.emit("campaign:join", { campaignId }, (ack) => {
        const result = ack as { ok?: boolean; role?: string } | undefined;
        if (!result?.ok) {
          setConnectionStatus("offline");
          toast("Could not join the live table.", "error");
          return;
        }
        joined.current = true;
        setConnectionStatus("online");
        if (wasConnectedOnce.current) {
          void refreshTable();
        } else {
          wasConnectedOnce.current = true;
        }
      });
    };
    const onDisconnect = () => setConnectionStatus("offline");
    const onConnectError = () => setConnectionStatus("offline");
    const onVisibility = () => {
      if (document.visibilityState === "visible" && socket.connected) void refreshTable();
    };
    if (socket.connected) join();
    socket.on("connect", join);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);
    document.addEventListener("visibilitychange", onVisibility);

    const onPresence = (users: PresenceUser[]) => setPresence(users);
    const onTokenMoved = ({ tokenId, x, y }: { tokenId: string; x: number; y: number }) =>
      setTokens((current) => current.map((token) => (token.id === tokenId ? { ...token, x, y } : token)));
    const onTokenCreated = (token: Token) => {
      setTokens((current) => (current.some((item) => item.id === token.id) ? current : [...current, token]));
      setSelectedTokenId(token.id);
    };
    const onTokenUpdated = (token: Token) =>
      setTokens((current) => current.map((item) => (item.id === token.id ? token : item)));
    const onTokenDeleted = ({ tokenId }: { tokenId: string }) => {
      setTokens((current) => current.filter((token) => token.id !== tokenId));
      setSelectedTokenId((current) => (current === tokenId ? null : current));
    };
    const onFogUpdated = ({ sceneId, cells, mode }: { sceneId: string; cells: string[]; mode: "reveal" | "hide" | "replace" }) => {
      setScenes((current) =>
        current.map((scene) => {
          if (scene.id !== sceneId) return scene;
          const next = new Set(scene.revealed);
          if (mode === "replace") next.clear();
          for (const cell of cells) {
            if (mode === "hide") next.delete(cell);
            else next.add(cell);
          }
          return { ...scene, revealed: [...next] };
        }),
      );
    };
    const onSceneActivated = ({ sceneId }: { sceneId: string }) => {
      setActiveSceneId(sceneId);
      setSelectedTokenId(null);
    };
    const onSceneUpdated = (scene: Scene) =>
      setScenes((current) => current.map((item) => (item.id === scene.id ? scene : item)));
    const onSceneCreated = (scene: Scene) => {
      setScenes((current) => (current.some((item) => item.id === scene.id) ? current : [...current, scene]));
      setActiveSceneId((current) => current ?? scene.id);
    };
    const onSceneDeleted = ({ sceneId }: { sceneId: string }) => {
      setScenes((current) => {
        const next = current.filter((scene) => scene.id !== sceneId);
        setActiveSceneId((active) => (active === sceneId ? next[0]?.id ?? null : active));
        return next;
      });
      setTokens((current) => current.filter((token) => token.sceneId !== sceneId));
    };
    const onChatMessage = (message: ChatMessage) =>
      setMessages((current) => (current.some((item) => item.id === message.id) ? current : [...current, message]));
    const onInitiativeUpdated = (payload: { entries: InitiativeEntry[]; round: number; turnIndex: number }) => {
      setInitiative(payload.entries);
      setRound(payload.round);
      setTurnIndex(payload.turnIndex);
    };
    const onPointer = (payload: { displayName: string; x: number; y: number }) => {
      setRemotePointer({ x: payload.x, y: payload.y, name: payload.displayName, ts: Date.now() });
      if (pointerTimer.current) window.clearTimeout(pointerTimer.current);
      pointerTimer.current = window.setTimeout(() => setRemotePointer(null), 2200);
    };
    const onCharacterUpdated = (payload: { characterId: string; summary: CharacterSummary | null; name: string }) => {
      setCharacters((current) =>
        current.map((character) =>
          character.id === payload.characterId
            ? { ...character, name: payload.name, summary: payload.summary }
            : character,
        ),
      );
    };
    const onCharacterCreated = (payload: { character: CharacterRecord }) => {
      setCharacters((current) =>
        current.some((character) => character.id === payload.character.id)
          ? current.map((character) => (character.id === payload.character.id ? payload.character : character))
          : [...current, payload.character],
      );
    };
    const onError = (payload: { message: string }) => toast(payload.message, "error");

    socket.on("presence:update", onPresence);
    socket.on("token:moved", onTokenMoved);
    socket.on("token:created", onTokenCreated);
    socket.on("token:updated", onTokenUpdated);
    socket.on("token:deleted", onTokenDeleted);
    socket.on("fog:updated", onFogUpdated);
    socket.on("scene:activated", onSceneActivated);
    socket.on("scene:updated", onSceneUpdated);
    socket.on("scene:created", onSceneCreated);
    socket.on("scene:deleted", onSceneDeleted);
    socket.on("chat:message", onChatMessage);
    socket.on("initiative:updated", onInitiativeUpdated);
    socket.on("pointer:show", onPointer);
    socket.on("character:updated", onCharacterUpdated);
    socket.on("character:created", onCharacterCreated);
    socket.on("error:toast", onError);

    return () => {
      socket.off("connect", join);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onConnectError);
      document.removeEventListener("visibilitychange", onVisibility);
      socket.off("presence:update", onPresence);
      socket.off("token:moved", onTokenMoved);
      socket.off("token:created", onTokenCreated);
      socket.off("token:updated", onTokenUpdated);
      socket.off("token:deleted", onTokenDeleted);
      socket.off("fog:updated", onFogUpdated);
      socket.off("scene:activated", onSceneActivated);
      socket.off("scene:updated", onSceneUpdated);
      socket.off("scene:created", onSceneCreated);
      socket.off("scene:deleted", onSceneDeleted);
      socket.off("chat:message", onChatMessage);
      socket.off("initiative:updated", onInitiativeUpdated);
      socket.off("pointer:show", onPointer);
      socket.off("character:updated", onCharacterUpdated);
      socket.off("character:created", onCharacterCreated);
      socket.off("error:toast", onError);
      if (joined.current) socket.emit("campaign:leave", { campaignId });
      if (pointerTimer.current) window.clearTimeout(pointerTimer.current);
    };
  }, [campaignId, toast, refreshTable]);

  // ---- Actions ------------------------------------------------------------
  const activateScene = (sceneId: string) => {
    if (!isGm) return;
    setActiveSceneId(sceneId);
    setSelectedTokenId(null);
    getSocket().emit("scene:activate", { campaignId, sceneId });
  };

  const duplicateScene = async (sceneId: string) => {
    try {
      const result = await api<{ scene: Scene }>(`/api/scenes/${sceneId}/duplicate`, { method: "POST" });
      setScenes((current) => (current.some((scene) => scene.id === result.scene.id) ? current : [...current, result.scene]));
      toast("Scene duplicated with its tokens.", "success");
    } catch (error) {
      toast(errorMessage(error), "error");
    }
  };

  const deleteScene = (sceneId: string) => {
    if (!isGm) return;
    setScenes((current) => current.filter((scene) => scene.id !== sceneId));
    setActiveSceneId((current) => (current === sceneId ? scenes.find((scene) => scene.id !== sceneId)?.id ?? null : current));
    getSocket().emit("scene:delete", { campaignId, sceneId });
  };

  const updateScene = (scene: Scene) => {
    setScenes((current) => current.map((item) => (item.id === scene.id ? scene : item)));
    setEditingScene(null);
  };

  const moveToken = (tokenId: string, x: number, y: number) => {
    setTokens((current) => current.map((token) => (token.id === tokenId ? { ...token, x, y } : token)));
    getSocket().emit("token:move", { campaignId, sceneId: activeSceneId!, tokenId, x, y });
  };

  const applyFog = (cells: string[], mode: "reveal" | "hide") => {
    if (!activeSceneId) return;
    setScenes((current) =>
      current.map((scene) => {
        if (scene.id !== activeSceneId) return scene;
        const next = new Set(scene.revealed);
        for (const cell of cells) {
          if (mode === "hide") next.delete(cell);
          else next.add(cell);
        }
        return { ...scene, revealed: [...next] };
      }),
    );
    getSocket().emit("fog:update", { campaignId, sceneId: activeSceneId, cells, mode });
  };

  const createToken = (partial: Partial<Token>) => {
    if (!activeSceneId) return;
    getSocket().emit(
      "token:create",
      { campaignId, sceneId: activeSceneId, token: partial },
      (token) => {
        if (!token) {
          toast("Could not place that token.", "error");
          return;
        }
        setTokens((current) => (current.some((item) => item.id === token.id) ? current : [...current, token]));
        setSelectedTokenId(token.id);
        toast(`${token.name} placed.`, "success");
      },
    );
  };

  const createTokens = (partials: Partial<Token>[]) => {
    if (!activeSceneId || !partials.length) return;
    const socket = getSocket();
    Promise.all(
      partials.map(
        (partial) =>
          new Promise<Token | null>((resolve) => {
            socket.emit(
              "token:create",
              { campaignId, sceneId: activeSceneId, token: partial },
              (token) => resolve((token as Token | null) ?? null),
            );
          }),
      ),
    )
      .then((created) => {
        const valid = created.filter((token): token is Token => Boolean(token));
        if (!valid.length) {
          toast("Could not place those tokens.", "error");
          return;
        }
        setTokens((current) => {
          const known = new Set(current.map((token) => token.id));
          return [...current, ...valid.filter((token) => !known.has(token.id))];
        });
        setSelectedTokenId(valid[0].id);
        toast(`${valid.length} ${valid.length === 1 ? "token" : "tokens"} placed.`, "success");
      })
      .catch(() => toast("Could not place those tokens.", "error"));
  };

  const placeMonster = (monster: Monster, count: number, x?: number, y?: number) => {
    if (!activeScene) return;
    const total = Math.max(1, Math.min(20, Math.round(count) || 1));
    const groupId =
      total > 1
        ? `grp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
        : null;
    const columns = Math.ceil(Math.sqrt(total));
    const rows = Math.ceil(total / columns);
    const spacing = Math.max(40, activeScene.gridSize);
    const centerX = x ?? activeScene.width / 2;
    const centerY = y ?? activeScene.height / 2;
    const partials = Array.from({ length: total }, (_, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      return {
        name: total > 1 ? `${monster.name} ${index + 1}`.slice(0, 80) : monster.name,
        x: centerX + (column - (columns - 1) / 2) * spacing,
        y: centerY + (row - (rows - 1) / 2) * spacing,
        size: monster.sizeCells,
        color: "#b06767",
        hpCurrent: monster.hp,
        hpMax: monster.hp,
        ac: monster.ac,
        initiativeBonus: monster.perception,
        groupId,
        groupName: groupId ? monster.name : null,
        conditions: [],
        hidden: false,
        locked: false,
      };
    });
    createTokens(partials);
  };

  const updateGroupHp = (groupId: string, delta: number) => {
    if (!activeSceneId) return;
    const members = tokens.filter(
      (token) =>
        token.sceneId === activeSceneId &&
        token.groupId === groupId &&
        token.hpMax !== null,
    );
    for (const member of members) {
      const current = member.hpCurrent ?? member.hpMax ?? 0;
      const next = Math.max(0, Math.min(member.hpMax ?? 0, current + delta));
      updateToken(member.id, { hpCurrent: next });
    }
  };

  const updateToken = (tokenId: string, patch: Partial<Token>) => {
    setTokens((current) => current.map((token) => (token.id === tokenId ? { ...token, ...patch } : token)));
    getSocket().emit("token:update", { campaignId, token: { id: tokenId, ...patch } });
  };

  const deleteToken = (tokenId: string) => {
    setTokens((current) => current.filter((token) => token.id !== tokenId));
    setSelectedTokenId(null);
    getSocket().emit("token:delete", { campaignId, tokenId });
  };

  const sendChat = (content: string, gmOnly: boolean) => {
    getSocket().emit("chat:send", { campaignId, content, visibility: gmOnly ? "gm" : "all" });
  };

  const roll = (formula: string, label: string, dc: number | null, gmOnly: boolean) => {
    getSocket().emit(
      "dice:roll",
      { campaignId, formula, label, dc, visibility: gmOnly ? "gm" : "all" },
      (message) => {
        if (!message) toast("That roll could not be made. Check the formula.", "error");
        else if (message.data && "total" in message.data) toast(`${label}: ${message.data.total}${message.data.degree ? ` · ${message.data.degree.replace("-", " ")}` : ""}`, "success");
      },
    );
  };

  const rollInitiative = () => {
    if (!activeSceneId) return;
    getSocket().emit("initiative:roll", { campaignId, sceneId: activeSceneId });
  };

  const clearInitiative = () => {
    getSocket().emit("initiative:update", { campaignId, entries: [], round: 1, turnIndex: 0 });
  };

  const addSelectedToInitiative = () => {
    if (!selectedToken) return;
    getSocket().emit("initiative:add", { campaignId, tokenId: selectedToken.id });
  };

  const requestRoll = (formula: string, label: string, dc: number | null) => {
    getSocket().emit(
      "dice:request",
      { campaignId, formula, label, dc },
      (message) => {
        if (!message) toast("That roll request could not be sent.", "error");
        else toast("Roll request sent to the table.", "success");
      },
    );
  };

  // Keyboard shortcuts stay out of the way whenever a form control has focus.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true'], [role='dialog']")) return;
      const key = event.key.toLowerCase();

      if (event.key === "Escape") {
        setFogBrush(null);
        setMeasureMode(false);
        setSelectedTokenId(null);
        setTheaterMode(false);
        return;
      }
      if (key === "f") {
        event.preventDefault();
        void toggleFullscreen();
        return;
      }
      if (key === "m") {
        event.preventDefault();
        setMeasureMode((current) => !current);
        setFogBrush(null);
        return;
      }
      if (key === "c") {
        event.preventDefault();
        setRightOpen((open) => !open);
        return;
      }
      if (key === "p") {
        event.preventDefault();
        setLeftOpen((open) => !open);
        return;
      }
      if (!isGm) return;

      if (key === "r" && activeScene?.fogEnabled) {
        event.preventDefault();
        setFogBrush((current) => (current === "reveal" ? null : "reveal"));
        setMeasureMode(false);
        return;
      }
      if (key === "h" && activeScene?.fogEnabled) {
        event.preventDefault();
        setFogBrush((current) => (current === "hide" ? null : "hide"));
        setMeasureMode(false);
        return;
      }
      if (key === "t") {
        event.preventDefault();
        setAddTokenOpen(true);
        return;
      }
      if (key === "e" && selectedTokenId) {
        event.preventDefault();
        setEditingTokenId(selectedTokenId);
        return;
      }
      if (key === "i" && activeSceneId) {
        event.preventDefault();
        getSocket().emit("initiative:roll", { campaignId, sceneId: activeSceneId });
        return;
      }
      if (event.key === "ArrowRight" && initiative.length) {
        event.preventDefault();
        getSocket().emit("initiative:next", { campaignId, direction: 1 });
        return;
      }
      if (event.key === "ArrowLeft" && initiative.length) {
        event.preventDefault();
        getSocket().emit("initiative:next", { campaignId, direction: -1 });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    activeScene?.fogEnabled,
    activeSceneId,
    campaignId,
    initiative.length,
    isGm,
    selectedTokenId,
    toggleFullscreen,
  ]);

  const expanded = isFullscreen || theaterMode;
  const defaultPosition = activeScene
    ? { x: activeScene.width / 2, y: activeScene.height / 2 }
    : { x: 100, y: 100 };

  if (!activeScene) {
    return (
      <div className="table-empty">
        <EmptyState
          icon={<Map size={34} />}
          title="No scene yet"
          description={isGm ? "Create your first map to open the table." : "The GM hasn't opened a scene yet."}
          action={isGm ? <Button variant="primary" onClick={() => setSceneManagerOpen(true)}><Plus size={15} /> Create a scene</Button> : null}
        />
        <SceneManagerModal
          open={sceneManagerOpen}
          onClose={() => setSceneManagerOpen(false)}
          campaignId={campaignId}
          scenes={scenes}
          activeSceneId={activeSceneId}
          onActivate={activateScene}
          onDelete={deleteScene}
          onDuplicate={duplicateScene}
          onCreated={(scene) => setScenes((current) => (current.some((item) => item.id === scene.id) ? current : [...current, scene]))}
          onEdit={setEditingScene}
        />
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className={`vtt ${leftOpen ? "" : "left-collapsed"} ${rightOpen ? "" : "right-collapsed"} ${theaterMode ? "is-theater" : ""}`}
    >
      <VttToolbar
        isGm={isGm}
        scenes={scenes}
        activeSceneId={activeSceneId}
        activateScene={activateScene}
        activeSceneName={activeScene.name}
        setSceneManagerOpen={setSceneManagerOpen}
        fogBrush={fogBrush}
        setFogBrush={setFogBrush}
        brushSize={brushSize}
        setBrushSize={setBrushSize}
        measureMode={measureMode}
        setMeasureMode={setMeasureMode}
        setAddTokenOpen={setAddTokenOpen}
        bestiaryOpen={bestiaryOpen}
        setBestiaryOpen={setBestiaryOpen}
        connectionStatus={connectionStatus}
        presence={presence}
        leftOpen={leftOpen}
        setLeftOpen={setLeftOpen}
        rightOpen={rightOpen}
        setRightOpen={setRightOpen}
        expanded={expanded}
        toggleFullscreen={toggleFullscreen}
        toast={toast}
      />

      <div className="vtt-body">
        {leftOpen ? (
          <VttTokenPanel
            activeScene={activeScene}
            isGm={isGm}
            sceneTokens={sceneTokens}
            characters={characters}
            selectedTokenId={selectedTokenId}
            setSelectedTokenId={setSelectedTokenId}
            setTokens={setTokens}
            selectedToken={selectedToken}
            updateToken={updateToken}
            addSelectedToInitiative={addSelectedToInitiative}
            setEditingTokenId={setEditingTokenId}
            deleteToken={deleteToken}
            setAddTokenOpen={setAddTokenOpen}
            setEditingScene={setEditingScene}
            user={user}
            onGroupHp={updateGroupHp}
          />
        ) : null}

        <PartyRail
          characters={characters}
          tokens={tokens}
          presence={presence}
          sceneId={activeSceneId}
          selectedTokenId={selectedTokenId}
          onSelectToken={setSelectedTokenId}
          onOpenCharacter={(characterId) => window.open(`/characters/${characterId}`, "_blank")}
        />

        <div className="vtt-center">
          <SceneCanvas
            scene={activeScene}
            tokens={sceneTokens}
            characters={characters}
            isGm={isGm}
            userId={user.id}
            selectedTokenId={selectedTokenId}
            onSelectToken={setSelectedTokenId}
            onOpenCharacter={(id) => window.open(`/characters/${id}`, "_blank")}
            onEditToken={isGm ? setEditingTokenId : undefined}
            onMoveToken={moveToken}
            onFog={applyFog}
            fogBrush={activeScene.fogEnabled ? fogBrush : null}
            brushSize={brushSize}
            measureMode={measureMode}
            onPing={(x, y) => getSocket().emit("pointer", { campaignId, sceneId: activeScene.id, x, y })}
            remotePointer={remotePointer}
            onDropMonster={placeMonster}
          />
          {isGm && bestiaryOpen ? (
            <BestiaryPalette
              onAdd={(monster, count) => placeMonster(monster, count)}
              onClose={() => setBestiaryOpen(false)}
            />
          ) : null}
          <InitiativeBar
            entries={initiative}
            tokens={tokens}
            round={round}
            turnIndex={turnIndex}
            isGm={isGm}
            selectedTokenId={selectedTokenId}
            onRoll={rollInitiative}
            onNext={() => getSocket().emit("initiative:next", { campaignId, direction: 1 })}
            onPrevious={() => getSocket().emit("initiative:next", { campaignId, direction: -1 })}
            onClear={clearInitiative}
            onRemove={(entryId) => getSocket().emit("initiative:remove", { campaignId, entryId })}
            onReroll={(entryId) => getSocket().emit("initiative:reroll", { campaignId, entryId })}
            onSelectToken={setSelectedTokenId}
          />
        </div>

        {rightOpen ? (
          <aside className="vtt-right">
            <ChatPanel
              messages={messages}
              presence={presence}
              user={user}
              isGm={isGm}
              onSend={sendChat}
              onRoll={roll}
              onRequest={requestRoll}
            />
          </aside>
        ) : null}
      </div>

      <SceneManagerModal
        open={sceneManagerOpen}
        onClose={() => setSceneManagerOpen(false)}
        campaignId={campaignId}
        scenes={scenes}
        activeSceneId={activeSceneId}
        onActivate={activateScene}
        onDelete={deleteScene}
        onDuplicate={duplicateScene}
        onCreated={(scene) => {
          setScenes((current) => (current.some((item) => item.id === scene.id) ? current : [...current, scene]));
          setActiveSceneId((current) => current ?? scene.id);
        }}
        onEdit={(scene) => {
          setSceneManagerOpen(false);
          setEditingScene(scene);
        }}
      />
      <SceneEditModal
        open={Boolean(editingScene)}
        onClose={() => setEditingScene(null)}
        scene={editingScene}
        onSave={updateScene}
        onDelete={deleteScene}
      />
      <AddTokenModal
        open={addTokenOpen}
        onClose={() => setAddTokenOpen(false)}
        characters={characters}
        onCreate={createToken}
        onCreateMany={createTokens}
        defaultPosition={defaultPosition}
        gridSize={activeScene.gridSize}
      />
      <TokenEditModal
        open={Boolean(editingToken)}
        token={editingToken}
        characters={characters}
        members={initial.members}
        onClose={() => setEditingTokenId(null)}
        onSave={(patch) => {
          if (!editingToken) return;
          updateToken(editingToken.id, patch);
          toast("Token updated.", "success");
        }}
        onDelete={(tokenId) => {
          deleteToken(tokenId);
          toast("Token deleted.", "success");
        }}
        onOpenCharacter={(characterId) => window.open(`/characters/${characterId}`, "_blank")}
      />
    </div>
  );
}
