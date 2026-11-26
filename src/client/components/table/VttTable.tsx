import { useCallback, useEffect, useMemo, useState } from "react";
import { Map, Plus, Volume2, X } from "lucide-react";
import type {
  CampaignTable,
  CharacterRecord,
  InitiativeEntry,
  Monster,
  PublicUser,
  Scene,
  Token,
} from "../../../shared/types";
import { suggestedTokenPosition } from "../../../shared/tokens";
import { DRAWING_COLORS, DRAWING_WIDTHS } from "../../../shared/drawings";
import {
  TEMPLATE_COLOR,
  TEMPLATE_LABELS,
  TEMPLATE_SIZES,
  templateLabel,
  tokensInTemplate,
  type AoeTemplate,
  type CastAreaRequest,
  type TemplateKind,
} from "../../../shared/templates";
import { errorMessage, useToasts } from "../../stores";
import { api } from "../../api";
import { getSocket } from "../../socket";
import { Button, EmptyState, Select } from "../ui";
import { SceneCanvas } from "./SceneCanvas";
import type { DrawingTool } from "./DrawingToolbar";
import { ChatPanel } from "./ChatPanel";
import { InitiativeBar } from "./InitiativeBar";
import { SustainReminder } from "./SustainReminder";
import { PartyRail } from "./PartyRail";
import { AddTokenModal, SceneEditModal, SceneManagerModal } from "./TableModals";
import { BestiaryPalette } from "./BestiaryPalette";
import { SoundPanel } from "./SoundPanel";
import { CoreToolbar } from "./CoreToolbar";
import { TokenQuickPanel } from "./TokenQuickPanel";
import { CharacterSheetView } from "../sheet/CharacterSheetView";
import { useCampaignTable } from "./useCampaignTable";

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
    setCharacters,
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

  const [fogBrush, setFogBrush] = useState<"reveal" | "hide" | null>(null);
  const [brushSize, setBrushSize] = useState(3);
  const [measureMode, setMeasureMode] = useState(false);
  const [drawingTool, setDrawingTool] = useState<DrawingTool | null>(null);
  const [drawingColor, setDrawingColor] = useState<string>(DRAWING_COLORS[0]);
  const [drawingWidth, setDrawingWidth] = useState<number>(DRAWING_WIDTHS[1]);
  const [sceneManagerOpen, setSceneManagerOpen] = useState(false);
  const [editingScene, setEditingScene] = useState<Scene | null>(null);
  const [addTokenOpen, setAddTokenOpen] = useState(false);
  const [bestiaryOpen, setBestiaryOpen] = useState(false);
  const [partyOpen, setPartyOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [sheetCharacterId, setSheetCharacterId] = useState<string | null>(null);
  const [myCharacterChoice, setMyCharacterChoice] = useState<string | null>(null);
  const [fullscreenMode, setFullscreenMode] = useState(false);
  const [templateKind, setTemplateKind] = useState<TemplateKind | null>(null);
  const [templateSize, setTemplateSize] = useState(20);
  const [templatePlacement, setTemplatePlacement] = useState<CastAreaRequest | null>(null);

  useEffect(() => {
    if (window.innerWidth < 1160) setRightOpen(false);
    if (window.innerWidth < 900) setPartyOpen(false);
  }, []);

  useEffect(() => {
    if (!fullscreenMode) return;
    document.body.classList.add("table-fullscreen-active");
    const background = Array.from(
      document.querySelectorAll<HTMLElement>(".topbar, .campaign-top, .campaign-tabs")
    );
    const previousInert = background.map((element) => element.inert);
    for (const element of background) element.inert = true;
    return () => {
      document.body.classList.remove("table-fullscreen-active");
      background.forEach((element, index) => {
        element.inert = previousInert[index];
      });
    };
  }, [fullscreenMode]);

  useEffect(() => {
    if (!active) setFullscreenMode(false);
  }, [active]);

  const toggleFullscreen = useCallback(() => {
    setFullscreenMode((current) => !current);
  }, []);

  const activeScene = scenes.find((scene) => scene.id === activeSceneId) ?? null;
  const activeEntry = initiative[turnIndex] ?? null;
  const activeToken = activeEntry?.tokenId
    ? (tokens.find((token) => token.id === activeEntry.tokenId) ?? null)
    : null;
  const activeCharacter = activeToken?.characterId
    ? (characters.find((character) => character.id === activeToken.characterId) ?? null)
    : null;
  const sceneTokens = useMemo(
    () => tokens.filter((token) => token.sceneId === activeSceneId && (isGm || !token.hidden)),
    [tokens, activeSceneId, isGm]
  );
  const selectedToken = sceneTokens.find((token) => token.id === selectedTokenId) ?? null;
  const myCharacters = useMemo(
    () =>
      characters
        .filter((character) => character.userId === user.id)
        .sort(
          (a, b) =>
            Number(Boolean(b.summary)) - Number(Boolean(a.summary)) || b.updatedAt - a.updatedAt
        ),
    [characters, user.id]
  );
  const tokenCharacter = selectedToken?.characterId
    ? (myCharacters.find((character) => character.id === selectedToken.characterId) ?? null)
    : null;
  const chosenCharacter =
    myCharacterChoice && myCharacters.some((character) => character.id === myCharacterChoice)
      ? myCharacterChoice
      : null;
  const myCharacterId = chosenCharacter ?? tokenCharacter?.id ?? myCharacters[0]?.id ?? null;
  const canvasScene = useMemo(
    () =>
      activeScene
        ? { ...activeScene, wallCollision: false, propCollision: false, losEnabled: false }
        : null,
    [activeScene]
  );

  const activateScene = (sceneId: string) => {
    if (!isGm) return;
    setActiveSceneId(sceneId);
    setSelectedTokenId(null);
    getSocket().emit("scene:activate", { campaignId, sceneId });
  };

  const reorderScenes = (sceneIds: string[]) => {
    if (!isGm) return;
    getSocket().emit("scene:reorder", { campaignId, sceneIds });
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
        monsterId: monster.id,
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

  const updateToken = (tokenId: string, patch: Partial<Token>) => {
    setTokens((current) =>
      current.map((token) => (token.id === tokenId ? { ...token, ...patch } : token))
    );
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

  const beginAreaPlacement = () => {
    setTemplatePlacement(null);
    setTemplateKind("burst");
    setTemplateSize(20);
    setFogBrush(null);
    setMeasureMode(false);
    setDrawingTool(null);
  };

  const beginSpellArea = (request: CastAreaRequest) => {
    const casterToken =
      sceneTokens.find((token) => token.characterId === request.characterId) ?? null;
    setSheetCharacterId(null);
    setTemplatePlacement({ ...request, casterTokenId: casterToken?.id ?? null });
    setTemplateKind(request.kind);
    setTemplateSize(request.size);
    setFogBrush(null);
    setMeasureMode(false);
    setDrawingTool(null);
    toast(`Choose where ${request.label} lands on the map.`, "info");
  };

  const cancelAreaPlacement = () => {
    setTemplateKind(null);
    setTemplatePlacement(null);
  };

  const placeTemplate = (template: AoeTemplate) => {
    if (!activeScene || !activeSceneId) return;
    const meta = templatePlacement;
    const full: AoeTemplate = {
      ...template,
      label: meta?.label ?? templateLabel(template),
      color: meta?.color ?? TEMPLATE_COLOR,
      spellId: meta?.spellId ?? null,
      casterTokenId: meta?.casterTokenId ?? null,
      durationRounds: meta?.durationRounds ?? null,
      effect: meta?.effect ?? "",
    };
    getSocket().emit("template:add", {
      campaignId,
      sceneId: activeSceneId,
      template: full,
    });
    const affected = tokensInTemplate(sceneTokens, full, activeScene.gridSize);
    if (meta) {
      const names = affected.map((token) => token.name).join(", ");
      const effect = meta.effect ? `${meta.effect}. ` : "";
      sendChat(
        names
          ? `${meta.characterName} casts ${meta.label}. ${effect}Targets in the area: ${names}.`
          : `${meta.characterName} casts ${meta.label}. ${effect}No tokens are in the area.`,
        false
      );
      toast(
        names ? `${meta.label} affects ${names}.` : `${meta.label} placed; no tokens in the area.`,
        names ? "success" : "info"
      );
    } else {
      toast(
        affected.length
          ? `Area placed. In the area: ${affected.map((token) => token.name).join(", ")}.`
          : "Area placed; no tokens are in the area.",
        "success"
      );
    }
    cancelAreaPlacement();
  };

  const removeTemplate = (template: AoeTemplate) => {
    if (!activeSceneId || !template.id) return;
    if (!isGm && template.casterUserId !== user.id) return;
    setScenes((current) =>
      current.map((scene) =>
        scene.id === activeSceneId
          ? { ...scene, templates: scene.templates.filter((entry) => entry.id !== template.id) }
          : scene
      )
    );
    getSocket().emit("template:remove", {
      campaignId,
      sceneId: activeSceneId,
      templateId: template.id,
    });
  };

  const clearTemplates = () => {
    if (!activeSceneId || !isGm) return;
    setScenes((current) =>
      current.map((scene) => (scene.id === activeSceneId ? { ...scene, templates: [] } : scene))
    );
    getSocket().emit("template:clear", { campaignId, sceneId: activeSceneId });
  };

  const roll = (
    formula: string,
    label: string,
    dc: number | null,
    gmOnly: boolean,
    requestId?: string | null,
    upgradeSuccess?: boolean
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
        upgradeSuccess: upgradeSuccess === true,
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

  const emitInitiative = (entries: InitiativeEntry[], nextRound = round, nextTurn = turnIndex) => {
    getSocket().emit("initiative:update", {
      campaignId,
      entries,
      round: nextRound,
      turnIndex: nextTurn,
    });
  };

  const clearInitiative = () => {
    if (!window.confirm("Clear the entire initiative order?")) return;
    emitInitiative([], 1, 0);
  };

  const addSelectedToInitiative = () => {
    if (!selectedToken) {
      toast("Select a token first.", "info");
      return;
    }
    getSocket().emit("initiative:add", { campaignId, tokenId: selectedToken.id });
  };

  const moveInitiativeEntry = (entryId: string, direction: -1 | 1) => {
    const index = initiative.findIndex((entry) => entry.id === entryId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= initiative.length) return;
    const next = [...initiative];
    [next[index], next[target]] = [next[target], next[index]];
    let nextTurn = turnIndex;
    if (turnIndex === index) nextTurn = target;
    else if (turnIndex === target) nextTurn = index;
    emitInitiative(next, round, nextTurn);
  };

  const setInitiativeValue = (entryId: string, value: number) => {
    emitInitiative(
      initiative.map((entry) => (entry.id === entryId ? { ...entry, initiative: value } : entry))
    );
  };

  const endTableSustain = async (record: CharacterRecord, spellId: string) => {
    const spell = record.data.play.sustainedSpells.find((entry) => entry.spellId === spellId);
    const nextDraft: CharacterRecord["data"] = {
      ...record.data,
      play: {
        ...record.data.play,
        sustainedSpells: record.data.play.sustainedSpells.filter(
          (entry) => entry.spellId !== spellId
        ),
      },
    };
    try {
      const result = await api<{ character: CharacterRecord }>(`/api/characters/${record.id}`, {
        method: "PUT",
        body: { data: nextDraft, expectedRevision: record.revision },
      });
      setCharacters((current) =>
        current.map((character) =>
          character.id === result.character.id ? result.character : character
        )
      );
      toast(`Ended ${spell?.name ?? "sustained spell"}.`, "success");
    } catch (error) {
      toast(errorMessage(error), "error");
    }
  };

  const addManualInitiative = (name: string, value: number) => {
    const activeId = initiative[turnIndex]?.id ?? null;
    const next = [
      ...initiative,
      {
        id: `init_manual_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        tokenId: null,
        name,
        initiative: value,
        color: "#c8a96b",
        ownerId: null,
        sceneId: activeSceneId,
        groupId: null,
        perception: undefined,
      },
    ].sort((a, b) => b.initiative - a.initiative || a.name.localeCompare(b.name));
    const nextTurn = activeId
      ? Math.max(
          0,
          next.findIndex((entry) => entry.id === activeId)
        )
      : 0;
    emitInitiative(next, round, nextTurn);
  };

  const requestRoll = (formula: string, label: string, dc: number | null) => {
    getSocket().emit("dice:request", { campaignId, formula, label, dc }, (message) => {
      if (!message) toast("That roll request could not be sent.", "error");
      else toast("Roll request sent to the table.", "success");
    });
  };

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
        setDrawingTool(null);
        setSelectedTokenId(null);
        setSheetCharacterId(null);
        setFullscreenMode(false);
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
        setDrawingTool(null);
        return;
      }
      if (key === "d") {
        event.preventDefault();
        setDrawingTool((current) => (current === "pen" ? null : "pen"));
        setFogBrush(null);
        setMeasureMode(false);
        return;
      }
      if (key === "e") {
        event.preventDefault();
        setDrawingTool((current) => (current === "eraser" ? null : "eraser"));
        setFogBrush(null);
        setMeasureMode(false);
        return;
      }
      if (key === "c") {
        event.preventDefault();
        setRightOpen((open) => !open);
        return;
      }
      if (key === "p") {
        event.preventDefault();
        setPartyOpen((open) => !open);
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
    initiative.length,
    isGm,
    setSelectedTokenId,
    toggleFullscreen,
  ]);

  const expanded = fullscreenMode;
  const activeSceneIndex = scenes.findIndex((scene) => scene.id === activeSceneId);
  const previousScene = activeSceneIndex > 0 ? scenes[activeSceneIndex - 1] : null;
  const nextScene =
    activeSceneIndex >= 0 && activeSceneIndex < scenes.length - 1
      ? scenes[activeSceneIndex + 1]
      : null;
  const defaultPosition = activeScene
    ? suggestedTokenPosition(activeScene, tokens)
    : { x: 100, y: 100 };

  if (!activeScene || !canvasScene) {
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
          previewSceneId={null}
          onActivate={activateScene}
          onDelete={deleteScene}
          onDuplicate={duplicateScene}
          onReorder={reorderScenes}
          onPreview={() => undefined}
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
      className={`vtt core-table-vtt ${partyOpen ? "" : "party-collapsed"} ${rightOpen ? "" : "right-collapsed"} ${fullscreenMode ? "is-fullscreen" : ""}`}
    >
      <CoreToolbar
        isGm={isGm}
        activeSceneName={activeScene.name}
        onPreviousScene={previousScene ? () => activateScene(previousScene.id) : undefined}
        onNextScene={nextScene ? () => activateScene(nextScene.id) : undefined}
        onOpenScenes={() => setSceneManagerOpen(true)}
        onAddToken={() => setAddTokenOpen(true)}
        bestiaryOpen={bestiaryOpen}
        onToggleBestiary={() => {
          setBestiaryOpen((open) => !open);
          setFogBrush(null);
          setMeasureMode(false);
          setDrawingTool(null);
        }}
        fogBrush={fogBrush}
        onFogBrush={(next) => {
          setFogBrush(next);
          setMeasureMode(false);
          setDrawingTool(null);
        }}
        brushSize={brushSize}
        onBrushSize={setBrushSize}
        measureMode={measureMode}
        onMeasureMode={(next) => {
          setMeasureMode(next);
          setFogBrush(null);
          setDrawingTool(null);
        }}
        areaActive={templateKind !== null}
        onArea={() => {
          if (templateKind) cancelAreaPlacement();
          else beginAreaPlacement();
        }}
        connectionStatus={connectionStatus}
        presence={presence}
        partyOpen={partyOpen}
        onPartyOpen={setPartyOpen}
        rightOpen={rightOpen}
        onRightOpen={setRightOpen}
        expanded={expanded}
        onFullscreen={toggleFullscreen}
        myCharacterId={myCharacterId}
        myCharacters={myCharacters.map((character) => ({
          id: character.id,
          name: character.name,
        }))}
        onMyCharacterChange={setMyCharacterChoice}
        onOpenMySheet={() => {
          if (myCharacterId) setSheetCharacterId(myCharacterId);
          else toast("You do not have a character in this campaign yet.", "info");
        }}
      />

      <div className="vtt-body">
        {partyOpen ? (
          <PartyRail
            characters={characters}
            tokens={tokens}
            presence={presence}
            sceneId={activeSceneId}
            selectedTokenId={selectedTokenId}
            onSelectToken={setSelectedTokenId}
            onOpenCharacter={setSheetCharacterId}
          />
        ) : null}

        <div className={`vtt-center ${bestiaryOpen ? "has-bestiary" : ""}`}>
          <InitiativeBar
            entries={initiative}
            round={round}
            turnIndex={turnIndex}
            isGm={isGm}
            onRoll={rollInitiative}
            onClear={clearInitiative}
            onEndRound={() => emitInitiative(initiative, round + 1, 0)}
            onRemove={(entryId) => getSocket().emit("initiative:remove", { campaignId, entryId })}
            onReroll={(entryId) => getSocket().emit("initiative:reroll", { campaignId, entryId })}
            onMove={moveInitiativeEntry}
            onSetValue={setInitiativeValue}
            onAddManual={addManualInitiative}
            onSetTurn={(index) => emitInitiative(initiative, round, index)}
          />

          {activeCharacter ? (
            <SustainReminder
              key={`${activeCharacter.id}:${round}:${turnIndex}`}
              character={activeCharacter}
              canEnd={isGm || activeCharacter.userId === user.id}
              onEnd={(spellId) => void endTableSustain(activeCharacter, spellId)}
              onOpenSheet={() => setSheetCharacterId(activeCharacter.id)}
            />
          ) : null}

          {templateKind ? (
            <div className="aoe-placement-bar" role="status">
              <div className="aoe-placement-copy">
                <strong>
                  {templatePlacement
                    ? templatePlacement.label
                    : `Place a ${TEMPLATE_LABELS[templateKind].toLowerCase()}`}
                </strong>
                <span className="tiny muted">
                  {templatePlacement
                    ? `${templatePlacement.size} ft. · ${
                        templatePlacement.effect || "click and drag on the map"
                      }`
                    : "Click and drag on the map to place the area."}
                </span>
              </div>
              {templatePlacement ? (
                <span className="aoe-placement-size">{templatePlacement.size} ft.</span>
              ) : (
                <>
                  <Select
                    aria-label="Area shape"
                    value={templateKind}
                    onChange={(event) => setTemplateKind(event.target.value as TemplateKind)}
                  >
                    {(Object.keys(TEMPLATE_LABELS) as TemplateKind[]).map((kind) => (
                      <option key={kind} value={kind}>
                        {TEMPLATE_LABELS[kind]}
                      </option>
                    ))}
                  </Select>
                  <Select
                    aria-label="Area size in feet"
                    value={templateSize}
                    onChange={(event) => setTemplateSize(Number(event.target.value))}
                  >
                    {TEMPLATE_SIZES.map((size) => (
                      <option key={size} value={size}>
                        {size} ft.
                      </option>
                    ))}
                  </Select>
                </>
              )}
              <Button size="sm" variant="ghost" onClick={cancelAreaPlacement}>
                Cancel
              </Button>
            </div>
          ) : null}

          <SceneCanvas
            scene={canvasScene}
            tokens={sceneTokens}
            characters={characters}
            isGm={isGm}
            userId={user.id}
            selectedTokenId={selectedTokenId}
            selectedTokenIds={selectedTokenIds}
            onSelectToken={selectToken}
            onSelectTokens={selectTokens}
            onOpenCharacter={setSheetCharacterId}
            onMoveToken={moveToken}
            onFog={applyFog}
            fogBrush={activeScene.fogEnabled ? fogBrush : null}
            brushSize={brushSize}
            measureMode={measureMode}
            wallMode={false}
            wallKind="wall"
            wallHidden={false}
            onWalls={() => undefined}
            previewMode={false}
            propMode={false}
            pendingProp={null}
            selectedPropId={null}
            onPlaceProp={() => undefined}
            onSelectProp={() => undefined}
            onMoveProp={() => undefined}
            onPing={(x, y) =>
              getSocket().emit("pointer", { campaignId, sceneId: activeScene.id, x, y })
            }
            remotePointer={remotePointer}
            onDropMonster={isGm ? placeMonster : undefined}
            templateKind={templateKind}
            templateSize={templateSize}
            templateHidden={false}
            onTemplate={placeTemplate}
            drawingTool={drawingTool}
            drawingColor={drawingColor}
            drawingWidth={drawingWidth}
            onDrawingToolChange={(next) => {
              setDrawingTool(next);
              if (next) {
                setFogBrush(null);
                setMeasureMode(false);
              }
            }}
            onDrawingColorChange={setDrawingColor}
            onDrawingWidthChange={setDrawingWidth}
            onAddDrawing={(points, color, width) =>
              getSocket().emit("drawing:add", {
                campaignId,
                sceneId: activeScene.id,
                drawing: { points, color, width },
              })
            }
            onEraseDrawing={(drawingId) =>
              getSocket().emit("drawing:erase", {
                campaignId,
                sceneId: activeScene.id,
                drawingId,
              })
            }
            onClearMyDrawings={() =>
              getSocket().emit("drawing:clear", {
                campaignId,
                sceneId: activeScene.id,
                scope: "mine",
              })
            }
            onClearAllDrawings={() =>
              getSocket().emit("drawing:clear", {
                campaignId,
                sceneId: activeScene.id,
                scope: "all",
              })
            }
          />

          {activeScene.templates.length ? (
            <div className="aoe-active-panel">
              <div className="aoe-active-title">
                <strong>Active areas</strong>
                <span>{activeScene.templates.length}</span>
              </div>
              <div className="aoe-active-list">
                {activeScene.templates.map((entry, index) => {
                  const remaining = entry.expiresRound
                    ? Math.max(0, entry.expiresRound - round + 1)
                    : null;
                  return (
                    <div className="aoe-active-row" key={entry.id ?? `${entry.kind}-${index}`}>
                      <span
                        className="aoe-swatch"
                        style={{ background: entry.color ?? TEMPLATE_COLOR }}
                      />
                      <div className="grow">
                        <div>{templateLabel(entry)}</div>
                        {entry.effect ? <span className="tiny muted">{entry.effect}</span> : null}
                      </div>
                      <span className="tiny muted">
                        {remaining === null ? "until cleared" : `${remaining} rd`}
                      </span>
                      {entry.id && (isGm || entry.casterUserId === user.id) ? (
                        <button
                          type="button"
                          className="aoe-clear"
                          aria-label={`Clear area ${templateLabel(entry)}`}
                          onClick={() => removeTemplate(entry)}
                        >
                          <X size={12} />
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              {isGm ? (
                <Button size="sm" variant="ghost" onClick={clearTemplates}>
                  Clear all
                </Button>
              ) : null}
            </div>
          ) : null}

          {isGm && bestiaryOpen ? (
            <BestiaryPalette
              onAdd={(monster, count) => placeMonster(monster, count)}
              onClose={() => setBestiaryOpen(false)}
            />
          ) : null}

          {selectedToken && !sheetCharacterId ? (
            <TokenQuickPanel
              token={selectedToken}
              campaignId={campaignId}
              characters={characters}
              isGm={isGm}
              canManage={isGm || selectedToken.ownerId === user.id}
              onClose={() => setSelectedTokenId(null)}
              onUpdate={(patch) => updateToken(selectedToken.id, patch)}
              onDelete={() => deleteToken(selectedToken.id)}
              onOpenCharacter={setSheetCharacterId}
              onAddToInitiative={addSelectedToInitiative}
            />
          ) : null}
        </div>

        {rightOpen ? (
          <aside className="vtt-right">
            <details className="core-audio">
              <summary>
                <Volume2 size={13} /> Soundtrack
              </summary>
              <SoundPanel
                campaignId={campaignId}
                isGm={isGm}
                tracks={audioTracks}
                state={audioState}
                onTracksChange={setAudioTracks}
              />
            </details>
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
        previewSceneId={null}
        onActivate={activateScene}
        onDelete={deleteScene}
        onDuplicate={duplicateScene}
        onReorder={reorderScenes}
        onPreview={() => undefined}
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

      {sheetCharacterId ? (
        <CharacterSheetView
          characterId={sheetCharacterId}
          mode="overlay"
          onClose={() => setSheetCharacterId(null)}
          onRoll={roll}
          onCastArea={beginSpellArea}
        />
      ) : null}
    </div>
  );
}
