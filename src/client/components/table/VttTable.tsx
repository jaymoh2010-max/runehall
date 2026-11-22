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
  InitiativeEntry,
  Monster,
  PublicUser,
  Scene,
  SceneProp,
  ScenePropLayer,
  Token,
  Wall,
  WallKind,
} from "../../../shared/types";
import type { PropPreset } from "../../../shared/props";
import { tokenTurnEffectsFromMonster } from "../../../shared/tokenTurnEffects";
import { suggestedTokenPosition } from "../../../shared/tokens";
import { errorMessage, useToasts } from "../../stores";
import { api } from "../../api";
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
import { PropPalette } from "./PropPalette";
import { SoundPanel } from "./SoundPanel";
import { useCampaignTable } from "./useCampaignTable";
import type { AoeTemplate, TemplateKind } from "../../../shared/templates";

interface VttTableProps {
  initial: CampaignTable;
  campaignId: string;
  user: PublicUser;
  isGm: boolean;
  active: boolean;
}

export function VttTable({ initial, campaignId, user, isGm, active }: VttTableProps) {
  const toast = useToasts((state) => state.push);
  const {
    scenes,
    setScenes,
    tokens,
    setTokens,
    characters,
    activeSceneId,
    setActiveSceneId,
    messages,
    initiative,
    round,
    turnIndex,
    audioTracks,
    setAudioTracks,
    audioState,
    presence,
    selectedTokenId,
    setSelectedTokenId,
    selectedTokenIds,
    selectToken,
    selectTokens,
    remotePointer,
    connectionStatus,
  } = useCampaignTable({ initial, campaignId, toast });
  const [editingTokenId, setEditingTokenId] = useState<string | null>(null);
  const [fogBrush, setFogBrush] = useState<"reveal" | "hide" | null>(null);
  const [brushSize, setBrushSize] = useState(3);
  const [measureMode, setMeasureMode] = useState(false);
  const [wallMode, setWallMode] = useState(false);
  const [wallKind, setWallKind] = useState<WallKind>("wall");
  const [wallHidden, setWallHidden] = useState(false);
  const [propMode, setPropMode] = useState(false);
  const [propPaletteOpen, setPropPaletteOpen] = useState(false);
  const [propLayer, setPropLayer] = useState<ScenePropLayer>("ground");
  const [pendingProp, setPendingProp] = useState<PropPreset | null>(null);
  const [selectedPropId, setSelectedPropId] = useState<string | null>(null);
  const [sceneManagerOpen, setSceneManagerOpen] = useState(false);
  const [editingScene, setEditingScene] = useState<Scene | null>(null);
  const [addTokenOpen, setAddTokenOpen] = useState(false);
  const [bestiaryOpen, setBestiaryOpen] = useState(false);
  const [templateKind, setTemplateKind] = useState<TemplateKind | null>(null);
  const [templateSize, setTemplateSize] = useState(20);
  const [templateHidden, setTemplateHidden] = useState(false);
  const [previewSceneId, setPreviewSceneId] = useState<string | null>(null);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [theaterMode, setTheaterMode] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

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

  const activeScene =
    scenes.find((scene) => scene.id === (previewSceneId ?? activeSceneId)) ?? null;
  const previewing = Boolean(previewSceneId);
  const sceneTokens = useMemo(
    () =>
      tokens.filter(
        (token) =>
          token.sceneId === (previewSceneId ?? activeSceneId) &&
          ((!previewing && isGm) || !token.hidden)
      ),
    [tokens, activeSceneId, previewSceneId, previewing, isGm]
  );
  const activeMovement = useMemo(() => {
    const entry = initiative[turnIndex];
    if (!entry?.tokenId || !activeSceneId || entry.sceneId !== activeSceneId) return null;
    const token = tokens.find((item) => item.id === entry.tokenId);
    if (!token) return null;
    const speed = token.characterId
      ? characters.find((record) => record.id === token.characterId)?.summary?.speed
      : null;
    return {
      tokenId: token.id,
      speed: typeof speed === "number" && Number.isFinite(speed) && speed > 0 ? speed : null,
      movementUsed: Math.max(0, Math.round(entry.movementUsed ?? 0)),
      diagonalSteps: Math.max(0, Math.round(entry.diagonalSteps ?? 0)),
    };
  }, [initiative, turnIndex, activeSceneId, tokens, characters]);
  const selectedToken = sceneTokens.find((token) => token.id === selectedTokenId) ?? null;
  const editingToken = tokens.find((token) => token.id === editingTokenId) ?? null;

  useEffect(() => {
    setSelectedPropId(null);
    setPendingProp(null);
  }, [activeSceneId, previewSceneId]);

  useEffect(() => {
    setPreviewSceneId(null);
  }, [activeSceneId]);

  useEffect(() => {
    if (previewSceneId && !scenes.some((scene) => scene.id === previewSceneId)) {
      setPreviewSceneId(null);
    }
  }, [scenes, previewSceneId]);

  // ---- Realtime -----------------------------------------------------------
  useEffect(() => {
    if (window.innerWidth < 1160) setRightOpen(false);
    if (window.innerWidth < 760) setLeftOpen(false);
  }, []);

  // ---- Actions ------------------------------------------------------------
  const activateScene = (sceneId: string) => {
    if (!isGm) return;
    setActiveSceneId(sceneId);
    setSelectedTokenId(null);
    getSocket().emit("scene:activate", { campaignId, sceneId });
  };

  const placeTemplate = (next: AoeTemplate) => {
    if (!activeSceneId) return;
    getSocket().emit("template:add", { campaignId, sceneId: activeSceneId, template: next });
  };

  const clearTemplates = () => {
    if (!activeSceneId) return;
    getSocket().emit("template:clear", { campaignId, sceneId: activeSceneId });
  };

  const reorderScenes = (sceneIds: string[]) => {
    if (!isGm) return;
    getSocket().emit("scene:reorder", { campaignId, sceneIds });
  };

  const previewScene = (sceneId: string) => {
    if (!isGm) return;
    setPreviewSceneId(sceneId);
    setSelectedTokenId(null);
  };

  const exitPreview = () => {
    setPreviewSceneId(null);
    setSelectedTokenId(null);
  };

  const duplicateScene = async (sceneId: string) => {
    try {
      const result = await api<{ scene: Scene }>(`/api/scenes/${sceneId}/duplicate`, {
        method: "POST",
      });
      setScenes((current) =>
        current.some((scene) => scene.id === result.scene.id) ? current : [...current, result.scene]
      );
      toast("Scene duplicated with its tokens.", "success");
    } catch (error) {
      toast(errorMessage(error), "error");
    }
  };

  const deleteScene = (sceneId: string) => {
    if (!isGm) return;
    setScenes((current) => current.filter((scene) => scene.id !== sceneId));
    setActiveSceneId((current) =>
      current === sceneId ? (scenes.find((scene) => scene.id !== sceneId)?.id ?? null) : current
    );
    getSocket().emit("scene:delete", { campaignId, sceneId });
  };

  const updateScene = (scene: Scene) => {
    setScenes((current) => current.map((item) => (item.id === scene.id ? scene : item)));
    setEditingScene(null);
  };

  const moveToken = (tokenId: string, x: number, y: number) => {
    setTokens((current) =>
      current.map((token) => (token.id === tokenId ? { ...token, x, y } : token))
    );
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
      })
    );
    getSocket().emit("fog:update", { campaignId, sceneId: activeSceneId, cells, mode });
  };

  const saveWalls = (walls: Wall[]) => {
    if (!isGm || !activeSceneId) return;
    setScenes((current) =>
      current.map((scene) => (scene.id === activeSceneId ? { ...scene, walls } : scene))
    );
    getSocket().emit("scene:walls", { campaignId, sceneId: activeSceneId, walls });
  };

  const clearWalls = () => {
    if (!isGm) return;
    if (!window.confirm("Remove all walls and doors from this scene?")) return;
    saveWalls([]);
  };

  const enterWallMode = useCallback((next: boolean) => {
    setWallMode(next);
    setPropMode(false);
    setPropPaletteOpen(false);
    setPendingProp(null);
    setSelectedPropId(null);
    if (!next) return;
    setFogBrush(null);
    setMeasureMode(false);
    setTemplateKind(null);
  }, []);

  const saveProps = (props: SceneProp[]) => {
    if (!isGm || !activeSceneId) return;
    setScenes((current) =>
      current.map((scene) => (scene.id === activeSceneId ? { ...scene, props } : scene))
    );
    getSocket().emit("scene:props", { campaignId, sceneId: activeSceneId, props });
  };

  const placeProp = (x: number, y: number) => {
    if (!activeScene || !pendingProp) return;
    const width = Math.max(8, pendingProp.squaresW * activeScene.gridSize);
    const height = Math.max(8, pendingProp.squaresH * activeScene.gridSize);
    const z = Math.max(0, ...(activeScene.props ?? []).map((prop) => prop.z)) + 1;
    const prop: SceneProp = {
      id: `prop_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      name: pendingProp.name,
      imageUrl: pendingProp.imageUrl,
      x,
      y,
      width,
      height,
      rotation: 0,
      layer: propLayer,
      visible: true,
      locked: false,
      z,
    };
    saveProps([...(activeScene.props ?? []), prop]);
    setSelectedPropId(prop.id);
    setPendingProp(null);
  };

  const updateProp = (propId: string, patch: Partial<SceneProp>) => {
    if (!activeScene) return;
    saveProps(
      (activeScene.props ?? []).map((prop) => (prop.id === propId ? { ...prop, ...patch } : prop))
    );
  };

  const deleteProp = (propId: string) => {
    if (!activeScene) return;
    saveProps((activeScene.props ?? []).filter((prop) => prop.id !== propId));
    setSelectedPropId((current) => (current === propId ? null : current));
  };

  const enterPropMode = useCallback((next: boolean) => {
    setPropMode(next);
    setPropPaletteOpen(next);
    if (!next) {
      setPendingProp(null);
      setSelectedPropId(null);
      return;
    }
    setWallMode(false);
    setFogBrush(null);
    setMeasureMode(false);
    setTemplateKind(null);
    setBestiaryOpen(false);
  }, []);

  const setPropCollision = async (enabled: boolean) => {
    if (!activeScene || !isGm) return;
    const sceneId = activeScene.id;
    setScenes((current) =>
      current.map((scene) => (scene.id === sceneId ? { ...scene, propCollision: enabled } : scene))
    );
    try {
      const result = await api<{ scene: Scene }>(`/api/scenes/${sceneId}`, {
        method: "PATCH",
        body: { propCollision: enabled },
      });
      setScenes((current) =>
        current.map((scene) => (scene.id === result.scene.id ? result.scene : scene))
      );
      toast(`Prop collision ${enabled ? "enabled" : "disabled"}.`, "success");
    } catch (error) {
      setScenes((current) =>
        current.map((scene) =>
          scene.id === sceneId ? { ...scene, propCollision: !enabled } : scene
        )
      );
      toast(errorMessage(error), "error");
    }
  };

  const createToken = (partial: Partial<Token>) => {
    if (!activeSceneId) return;
    if (previewSceneId) {
      toast("Exit preview before placing tokens.", "info");
      return;
    }
    getSocket().emit(
      "token:create",
      { campaignId, sceneId: activeSceneId, token: partial },
      (token) => {
        if (!token) {
          toast("Could not place that token.", "error");
          return;
        }
        setTokens((current) =>
          current.some((item) => item.id === token.id) ? current : [...current, token]
        );
        setSelectedTokenId(token.id);
        toast(`${token.name} placed.`, "success");
      }
    );
  };

  const createTokens = (partials: Partial<Token>[]) => {
    if (!activeSceneId || !partials.length) return;
    if (previewSceneId) {
      toast("Exit preview before placing tokens.", "info");
      return;
    }
    const socket = getSocket();
    Promise.all(
      partials.map(
        (partial) =>
          new Promise<Token | null>((resolve) => {
            socket.emit(
              "token:create",
              { campaignId, sceneId: activeSceneId, token: partial },
              (token) => resolve((token as Token | null) ?? null)
            );
          })
      )
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
    if (previewSceneId) {
      toast("Exit preview before placing tokens.", "info");
      return;
    }
    const total = Math.max(1, Math.min(20, Math.round(count) || 1));
    const groupId =
      total > 1 ? `grp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}` : null;
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
        turnEffects: tokenTurnEffectsFromMonster(monster),
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
        token.sceneId === activeSceneId && token.groupId === groupId && token.hpMax !== null
    );
    for (const member of members) {
      if (delta < 0) {
        damageToken(member.id, Math.abs(delta));
        continue;
      }
      const current = member.hpCurrent ?? member.hpMax ?? 0;
      const next = Math.max(0, Math.min(member.hpMax ?? 0, current + delta));
      updateToken(member.id, { hpCurrent: next });
    }
  };

  const updateToken = (tokenId: string, patch: Partial<Token>) => {
    setTokens((current) =>
      current.map((token) => (token.id === tokenId ? { ...token, ...patch } : token))
    );
    getSocket().emit("token:update", { campaignId, token: { id: tokenId, ...patch } });
  };

  const damageToken = (
    tokenId: string,
    amount: number,
    critical = false,
    options: { damageType?: string; nonlethal?: boolean } = {}
  ) => {
    getSocket().emit(
      "token:damage",
      { campaignId, tokenId, amount, critical, ...options },
      (result) => {
        if (result.notes.length) toast(result.notes.join("; "), "info");
      }
    );
  };

  const bulkHp = (delta: number, full = false) => {
    const selected = tokens.filter(
      (token) => selectedTokenIds.includes(token.id) && token.sceneId === activeSceneId
    );
    for (const token of selected) {
      const max = token.hpMax;
      const current = token.hpCurrent ?? max ?? 0;
      if (full) {
        updateToken(token.id, { hpCurrent: max ?? current });
      } else if (delta < 0) {
        damageToken(token.id, Math.abs(delta));
      } else {
        updateToken(token.id, {
          hpCurrent: Math.min(max ?? 1_000_000, current + delta),
        });
      }
    }
  };

  const bulkCondition = (name: string, value: number | null, duration: number | null) => {
    const selected = tokens.filter(
      (token) => selectedTokenIds.includes(token.id) && token.sceneId === activeSceneId
    );
    for (const token of selected) {
      if (
        token.conditions.some((condition) => condition.name.toLowerCase() === name.toLowerCase())
      ) {
        continue;
      }
      updateToken(token.id, { conditions: [...token.conditions, { name, value, duration }] });
    }
  };

  const bulkClearConditions = () => {
    const selected = tokens.filter(
      (token) => selectedTokenIds.includes(token.id) && token.sceneId === activeSceneId
    );
    for (const token of selected) updateToken(token.id, { conditions: [] });
  };

  const bulkPatch = (patch: Partial<Token>) => {
    const selected = tokens.filter(
      (token) => selectedTokenIds.includes(token.id) && token.sceneId === activeSceneId
    );
    for (const token of selected) updateToken(token.id, patch);
  };

  const bulkDelete = () => {
    const selected = tokens.filter(
      (token) => selectedTokenIds.includes(token.id) && token.sceneId === activeSceneId
    );
    if (!selected.length) return;
    const ids = new Set(selected.map((token) => token.id));
    setTokens((current) => current.filter((token) => !ids.has(token.id)));
    for (const token of selected) {
      getSocket().emit("token:delete", { campaignId, tokenId: token.id });
    }
    setSelectedTokenId(null);
  };

  const deleteToken = (tokenId: string) => {
    setTokens((current) => current.filter((token) => token.id !== tokenId));
    setSelectedTokenId(null);
    getSocket().emit("token:delete", { campaignId, tokenId });
  };

  const sendChat = (content: string, gmOnly: boolean) => {
    getSocket().emit("chat:send", { campaignId, content, visibility: gmOnly ? "gm" : "all" });
  };

  const roll = (
    formula: string,
    label: string,
    dc: number | null,
    gmOnly: boolean,
    requestId?: string | null
  ) => {
    getSocket().emit(
      "dice:roll",
      {
        campaignId,
        formula,
        label,
        dc,
        visibility: gmOnly ? "gm" : "all",
        requestId: requestId ?? null,
      },
      (message) => {
        if (!message) toast("That roll could not be made. Check the formula.", "error");
        else if (message.data && "total" in message.data)
          toast(
            `${label}: ${message.data.total}${message.data.degree ? ` · ${message.data.degree.replace("-", " ")}` : ""}`,
            "success"
          );
      }
    );
  };

  const rollInitiative = () => {
    if (!activeSceneId) return;
    if (
      initiative.length &&
      !window.confirm("Reroll initiative? This resets the current order and round.")
    ) {
      return;
    }
    getSocket().emit("initiative:roll", { campaignId, sceneId: activeSceneId });
  };

  const clearInitiative = () => {
    if (!window.confirm("Clear the entire initiative order?")) return;
    getSocket().emit("initiative:update", { campaignId, entries: [], round: 1, turnIndex: 0 });
  };

  const emitInitiative = (entries: InitiativeEntry[], nextRound = round, nextTurn = turnIndex) => {
    getSocket().emit("initiative:update", {
      campaignId,
      entries,
      round: nextRound,
      turnIndex: nextTurn,
    });
  };

  const delayEntry = (entryId: string) => {
    const index = initiative.findIndex((entry) => entry.id === entryId);
    if (index < 0) return;
    const entry = { ...initiative[index], delayed: true, readied: false };
    const next = [...initiative.filter((item) => item.id !== entryId), entry];
    emitInitiative(next, round, Math.min(index, Math.max(0, next.length - 1)));
  };

  const readyEntry = (entryId: string) => {
    const next = initiative.map((entry) =>
      entry.id === entryId ? { ...entry, readied: true, delayed: false } : entry
    );
    let nextTurn = turnIndex + 1;
    let nextRound = round;
    if (nextTurn >= next.length) {
      nextTurn = 0;
      nextRound += 1;
    }
    emitInitiative(next, nextRound, nextTurn);
  };

  const triggerReady = (entryId: string) => {
    const entry = initiative.find((item) => item.id === entryId);
    if (!entry?.readied) return;
    emitInitiative(
      initiative.map((item) => (item.id === entryId ? { ...item, readied: false } : item))
    );
    sendChat(`${entry.name}'s readied action triggers.`, false);
  };

  const clearInitiativeState = (entryId: string) => {
    emitInitiative(
      initiative.map((entry) =>
        entry.id === entryId ? { ...entry, delayed: false, readied: false } : entry
      )
    );
  };

  const resetMovement = () => {
    if (!initiative.length) return;
    emitInitiative(
      initiative.map((entry, index) =>
        index === turnIndex ? { ...entry, movementUsed: 0, diagonalSteps: 0 } : entry
      )
    );
  };

  const moveInitiativeEntry = (entryId: string, direction: -1 | 1) => {
    const index = initiative.findIndex((entry) => entry.id === entryId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= initiative.length) return;
    if (initiative[target].initiative !== initiative[index].initiative) return;
    const next = [...initiative];
    [next[index], next[target]] = [next[target], next[index]];
    const normalized = next.map((entry, order) => ({ ...entry, tieBreak: order }));
    let nextTurn = turnIndex;
    if (turnIndex === index) nextTurn = target;
    else if (turnIndex === target) nextTurn = index;
    emitInitiative(normalized, round, nextTurn);
  };

  const addSelectedToInitiative = () => {
    if (!selectedToken) return;
    getSocket().emit("initiative:add", { campaignId, tokenId: selectedToken.id });
  };

  const requestRoll = (formula: string, label: string, dc: number | null) => {
    getSocket().emit("dice:request", { campaignId, formula, label, dc }, (message) => {
      if (!message) toast("That roll request could not be sent.", "error");
      else toast("Roll request sent to the table.", "success");
    });
  };

  // Keyboard shortcuts stay out of the way whenever a form control has focus.
  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true'], [role='dialog']"))
        return;
      const key = event.key.toLowerCase();

      if (event.key === "Escape") {
        setFogBrush(null);
        setMeasureMode(false);
        setWallMode(false);
        setPropMode(false);
        setPropPaletteOpen(false);
        setPendingProp(null);
        setSelectedPropId(null);
        setSelectedTokenId(null);
        setTheaterMode(false);
        setTemplateKind(null);
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
        setWallMode(false);
        setPropMode(false);
        setPropPaletteOpen(false);
        return;
      }
      if (key === "a" && isGm) {
        event.preventDefault();
        setTemplateKind((current) => (current ? null : "burst"));
        setFogBrush(null);
        setMeasureMode(false);
        setWallMode(false);
        setPropMode(false);
        setPropPaletteOpen(false);
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
        setWallMode(false);
        setPropMode(false);
        setPropPaletteOpen(false);
        return;
      }
      if (key === "h" && activeScene?.fogEnabled) {
        event.preventDefault();
        setFogBrush((current) => (current === "hide" ? null : "hide"));
        setMeasureMode(false);
        setWallMode(false);
        setPropMode(false);
        setPropPaletteOpen(false);
        return;
      }
      if (key === "w") {
        event.preventDefault();
        enterWallMode(!wallMode);
        return;
      }
      if (key === "g") {
        event.preventDefault();
        enterPropMode(!propMode);
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
        rollInitiative();
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
    active,
    activeScene?.fogEnabled,
    activeSceneId,
    campaignId,
    enterPropMode,
    enterWallMode,
    initiative.length,
    isGm,
    propMode,
    selectedTokenId,
    toggleFullscreen,
    wallMode,
  ]);

  const expanded = isFullscreen || theaterMode;
  const activeSceneIndex = scenes.findIndex((scene) => scene.id === activeSceneId);
  const previousScene = activeSceneIndex > 0 ? scenes[activeSceneIndex - 1] : null;
  const nextScene =
    activeSceneIndex >= 0 && activeSceneIndex < scenes.length - 1
      ? scenes[activeSceneIndex + 1]
      : null;
  const defaultPosition = activeScene
    ? suggestedTokenPosition(activeScene, tokens)
    : { x: 100, y: 100 };

  if (!activeScene) {
    return (
      <div className="table-empty">
        <EmptyState
          icon={<Map size={34} />}
          title="No scene yet"
          description={
            isGm ? "Create your first map to open the table." : "The GM hasn't opened a scene yet."
          }
          action={
            isGm ? (
              <Button variant="primary" onClick={() => setSceneManagerOpen(true)}>
                <Plus size={15} /> Create a scene
              </Button>
            ) : null
          }
        />
        <SceneManagerModal
          open={sceneManagerOpen}
          onClose={() => setSceneManagerOpen(false)}
          campaignId={campaignId}
          scenes={scenes}
          activeSceneId={activeSceneId}
          previewSceneId={previewSceneId}
          onActivate={activateScene}
          onDelete={deleteScene}
          onDuplicate={duplicateScene}
          onReorder={reorderScenes}
          onPreview={previewScene}
          onCreated={(scene) =>
            setScenes((current) =>
              current.some((item) => item.id === scene.id) ? current : [...current, scene]
            )
          }
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
        activeSceneName={activeScene.name}
        onPreviousScene={previousScene ? () => activateScene(previousScene.id) : undefined}
        onNextScene={nextScene ? () => activateScene(nextScene.id) : undefined}
        setSceneManagerOpen={setSceneManagerOpen}
        fogBrush={fogBrush}
        setFogBrush={(next) => {
          setWallMode(false);
          setPropMode(false);
          setPropPaletteOpen(false);
          setPendingProp(null);
          setSelectedPropId(null);
          setFogBrush(next);
        }}
        brushSize={brushSize}
        setBrushSize={setBrushSize}
        measureMode={measureMode}
        setMeasureMode={(next) => {
          setWallMode(false);
          setPropMode(false);
          setPropPaletteOpen(false);
          setPendingProp(null);
          setSelectedPropId(null);
          setMeasureMode(next);
        }}
        wallMode={wallMode}
        setWallMode={enterWallMode}
        wallKind={wallKind}
        setWallKind={setWallKind}
        wallHidden={wallHidden}
        setWallHidden={setWallHidden}
        onClearWalls={clearWalls}
        propMode={propMode}
        setPropMode={enterPropMode}
        setAddTokenOpen={setAddTokenOpen}
        bestiaryOpen={bestiaryOpen}
        setBestiaryOpen={(next) => {
          setPropMode(false);
          setPropPaletteOpen(false);
          setPendingProp(null);
          setSelectedPropId(null);
          setBestiaryOpen(next);
        }}
        templateHidden={templateHidden}
        setTemplateHidden={setTemplateHidden}
        templateKind={templateKind}
        setTemplateKind={(next) => {
          setWallMode(false);
          setPropMode(false);
          setPropPaletteOpen(false);
          setPendingProp(null);
          setSelectedPropId(null);
          setTemplateKind(next);
        }}
        templateSize={templateSize}
        setTemplateSize={setTemplateSize}
        hasTemplate={Boolean(activeScene?.templates.length)}
        onClearTemplate={clearTemplates}
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

      {previewing && activeScene ? (
        <div className="vtt-preview-banner">
          <Eye size={14} />
          <span>
            Previewing <strong>{activeScene.name}</strong> as players see it. The table is still on{" "}
            <strong>
              {scenes.find((scene) => scene.id === activeSceneId)?.name ?? "another scene"}
            </strong>
            .
            {activeScene.visionScope === "per-player"
              ? " Per-player scenes use shared party vision in preview."
              : ""}
          </span>
          <Button size="sm" variant="ghost" onClick={exitPreview}>
            Exit preview
          </Button>
        </div>
      ) : null}

      <div className="vtt-body">
        {leftOpen ? (
          <VttTokenPanel
            activeScene={activeScene}
            isGm={isGm}
            sceneTokens={sceneTokens}
            characters={characters}
            selectedTokenId={selectedTokenId}
            selectedTokenIds={selectedTokenIds}
            setSelectedTokenId={setSelectedTokenId}
            setTokens={setTokens}
            selectedToken={selectedToken}
            updateToken={updateToken}
            onDamage={damageToken}
            addSelectedToInitiative={addSelectedToInitiative}
            setEditingTokenId={setEditingTokenId}
            deleteToken={deleteToken}
            setAddTokenOpen={setAddTokenOpen}
            setEditingScene={setEditingScene}
            user={user}
            onGroupHp={updateGroupHp}
            onBulkHp={bulkHp}
            onBulkCondition={bulkCondition}
            onBulkClearConditions={bulkClearConditions}
            onBulkPatch={bulkPatch}
            onBulkDelete={bulkDelete}
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
            isGm={isGm && !previewing}
            userId={user.id}
            selectedTokenId={selectedTokenId}
            selectedTokenIds={selectedTokenIds}
            activeMovement={activeMovement}
            onSelectToken={selectToken}
            onSelectTokens={selectTokens}
            onOpenCharacter={(id) => window.open(`/characters/${id}`, "_blank")}
            onEditToken={isGm && !previewing ? setEditingTokenId : undefined}
            onMoveToken={moveToken}
            onFog={applyFog}
            fogBrush={previewing ? null : activeScene.fogEnabled ? fogBrush : null}
            brushSize={brushSize}
            measureMode={measureMode}
            wallMode={previewing ? false : wallMode}
            wallKind={wallKind}
            wallHidden={wallHidden}
            onWalls={saveWalls}
            previewMode={previewing}
            propMode={previewing ? false : propMode}
            pendingProp={pendingProp}
            selectedPropId={selectedPropId}
            onPlaceProp={placeProp}
            onSelectProp={setSelectedPropId}
            onMoveProp={(propId, x, y) => updateProp(propId, { x, y })}
            onPing={(x, y) =>
              getSocket().emit("pointer", { campaignId, sceneId: activeScene.id, x, y })
            }
            remotePointer={remotePointer}
            onDropMonster={previewing ? undefined : placeMonster}
            templateKind={previewing ? null : templateKind}
            templateSize={templateSize}
            templateHidden={templateHidden}
            onTemplate={placeTemplate}
          />
          {isGm && bestiaryOpen ? (
            <BestiaryPalette
              onAdd={(monster, count) => placeMonster(monster, count)}
              onClose={() => setBestiaryOpen(false)}
            />
          ) : null}
          {isGm && propPaletteOpen && !previewing ? (
            <PropPalette
              scene={activeScene}
              campaignId={campaignId}
              selectedPropId={selectedPropId}
              pendingProp={pendingProp}
              layer={propLayer}
              setLayer={setPropLayer}
              onSetCollision={(enabled) => void setPropCollision(enabled)}
              onPick={(preset) => {
                setPendingProp(preset);
                setSelectedPropId(null);
              }}
              onSelect={(propId) => {
                setSelectedPropId(propId);
                setPendingProp(null);
              }}
              onUpdate={updateProp}
              onDelete={deleteProp}
              onClose={() => enterPropMode(false)}
              toast={toast}
            />
          ) : null}
          <InitiativeBar
            entries={initiative}
            tokens={tokens}
            characters={characters}
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
            onDelay={delayEntry}
            onReady={readyEntry}
            onClearState={clearInitiativeState}
            onMove={moveInitiativeEntry}
            onTriggerReady={triggerReady}
            onResetMovement={resetMovement}
            onSelectToken={setSelectedTokenId}
          />
        </div>

        {rightOpen ? (
          <aside className="vtt-right">
            <SoundPanel
              campaignId={campaignId}
              isGm={isGm}
              tracks={audioTracks}
              state={audioState}
              onTracksChange={setAudioTracks}
            />
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
        previewSceneId={previewSceneId}
        onActivate={activateScene}
        onDelete={deleteScene}
        onDuplicate={duplicateScene}
        onReorder={reorderScenes}
        onPreview={previewScene}
        onCreated={(scene) => {
          setScenes((current) =>
            current.some((item) => item.id === scene.id) ? current : [...current, scene]
          );
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
        campaignId={campaignId}
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
