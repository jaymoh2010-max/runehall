import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CampaignAudioState,
  CampaignAudioTrack,
  CampaignTable,
  CharacterRecord,
  ChatMessage,
  InitiativeEntry,
  PresenceUser,
  Scene,
  Token,
} from "../../../shared/types";
import { api } from "../../api";
import { connectSocket, joinCampaign } from "../../socket";
import { revisionAction } from "../../../shared/revisions";
import {
  applyCharacterCreated,
  applyCharacterUpdated,
  applyChatMessage,
  applyFogUpdated,
  applySceneCreated,
  applySceneDeleted,
  applySceneUpdated,
  applyTokenCreated,
  applyTokenDeleted,
  applyTokenMoved,
  applyTokenUpdated,
  mergeSnapshotMessages,
  toggleTokenSelection,
} from "./tableEvents";

type ToastKind = "info" | "success" | "error";

export interface UseCampaignTableOptions {
  initial: CampaignTable;
  campaignId: string;
  toast: (message: string, kind?: ToastKind) => void;
}

/**
 * Owns the live campaign-table state and the Socket.IO subscription. Keeping
 * this out of VttTable makes the event application testable and prevents the
 * component from growing another state machine.
 */
export function useCampaignTable({ initial, campaignId, toast }: UseCampaignTableOptions) {
  const [scenes, setScenes] = useState<Scene[]>(initial.scenes);
  const [tokens, setTokens] = useState<Token[]>(initial.tokens);
  const [characters, setCharacters] = useState<CharacterRecord[]>(initial.characters);
  const [activeSceneId, setActiveSceneId] = useState<string | null>(initial.activeSceneId);
  const [messages, setMessages] = useState<ChatMessage[]>(initial.messages);
  const [initiative, setInitiative] = useState<InitiativeEntry[]>(initial.initiative);
  const [round, setRound] = useState(initial.round);
  const [turnIndex, setTurnIndex] = useState(initial.turnIndex);
  const [audioTracks, setAudioTracks] = useState<CampaignAudioTrack[]>(initial.audioTracks ?? []);
  const [audioState, setAudioState] = useState<CampaignAudioState>(
    initial.audioState ?? {
      trackId: null,
      playing: false,
      position: 0,
      updatedAt: 0,
      serverTime: 0,
    }
  );
  const [presence, setPresence] = useState<PresenceUser[]>([]);
  const [selectedTokenId, setSelectedTokenIdState] = useState<string | null>(null);
  const [selectedTokenIds, setSelectedTokenIds] = useState<string[]>([]);
  const [remotePointer, setRemotePointer] = useState<{
    x: number;
    y: number;
    name: string;
    ts: number;
  } | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<"connecting" | "online" | "offline">(
    "connecting"
  );

  const revisionRef = useRef(initial.revision);
  const refreshingRef = useRef(false);
  const pointerTimer = useRef<number | null>(null);
  const scenesRef = useRef(scenes);
  const tokensRef = useRef(tokens);
  const activeSceneIdRef = useRef(activeSceneId);
  scenesRef.current = scenes;
  tokensRef.current = tokens;
  activeSceneIdRef.current = activeSceneId;

  const setSelectedTokenId = useCallback((tokenId: string | null) => {
    setSelectedTokenIdState(tokenId);
    setSelectedTokenIds(tokenId ? [tokenId] : []);
  }, []);

  const selectToken = useCallback((tokenId: string | null, additive = false) => {
    if (!tokenId) {
      setSelectedTokenIdState(null);
      setSelectedTokenIds([]);
      return;
    }
    if (!additive) {
      setSelectedTokenIdState(tokenId);
      setSelectedTokenIds([tokenId]);
      return;
    }
    setSelectedTokenIds((current) => {
      const next = toggleTokenSelection(current, tokenId);
      setSelectedTokenIdState(next.includes(tokenId) ? tokenId : (next[0] ?? null));
      return next;
    });
  }, []);

  const selectTokens = useCallback((tokenIds: string[], additive = false) => {
    setSelectedTokenIds((current) => {
      const next = additive ? [...new Set([...current, ...tokenIds])] : tokenIds;
      setSelectedTokenIdState(next[0] ?? null);
      return next;
    });
  }, []);

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
      setAudioTracks(snapshot.audioTracks ?? []);
      setAudioState(
        snapshot.audioState ?? {
          trackId: null,
          playing: false,
          position: 0,
          updatedAt: 0,
          serverTime: 0,
        }
      );
      revisionRef.current = snapshot.revision;
      setMessages((current) => mergeSnapshotMessages(current, snapshot.messages));
      setSelectedTokenIds((current) =>
        current.filter((tokenId) => snapshot.tokens.some((token) => token.id === tokenId))
      );
      setSelectedTokenIdState((current) =>
        current && snapshot.tokens.some((token) => token.id === current) ? current : null
      );
    } catch (error) {
      toast(
        `Could not refresh the table: ${error instanceof Error ? error.message : "Unknown error"}`,
        "error"
      );
    }
  }, [campaignId, toast]);

  useEffect(() => {
    const socket = connectSocket();
    setConnectionStatus("connecting");
    const leaveCampaignRoom = joinCampaign(campaignId, (ack) => {
      const result = ack as { ok?: boolean; role?: string; presence?: PresenceUser[] } | undefined;
      if (result?.presence) setPresence(result.presence);
      if (!result?.ok) {
        setConnectionStatus("offline");
        toast("Could not join the live table.", "error");
        return;
      }
      setConnectionStatus("online");
      // The initial snapshot may have been loaded before the GM created a
      // scene or moved tokens. Always reconcile once the room is joined.
      void refreshTable();
    });
    const onDisconnect = () => setConnectionStatus("offline");
    const onConnectError = () => setConnectionStatus("offline");
    const onVisibility = () => {
      if (document.visibilityState === "visible" && socket.connected) void refreshTable();
    };
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);
    document.addEventListener("visibilitychange", onVisibility);

    const onPresence = (users: PresenceUser[]) => setPresence(users);
    const onTokenMoved = (payload: { tokenId: string; x: number; y: number }) =>
      setTokens((current) => applyTokenMoved(current, payload));
    const onTokenCreated = (token: Token) => {
      setTokens((current) => applyTokenCreated(current, token));
      setSelectedTokenIdState(token.id);
      setSelectedTokenIds([token.id]);
    };
    const onTokenUpdated = (token: Token) =>
      setTokens((current) => applyTokenUpdated(current, token));
    const onTokenDeleted = ({ tokenId }: { tokenId: string }) => {
      setTokens((current) => applyTokenDeleted(current, tokenId));
      setSelectedTokenIds((current) => {
        const next = current.filter((id) => id !== tokenId);
        setSelectedTokenIdState((primary) => (primary === tokenId ? (next[0] ?? null) : primary));
        return next;
      });
    };
    const onFogUpdated = (payload: {
      sceneId: string;
      cells: string[];
      mode: "reveal" | "hide" | "replace";
    }) => setScenes((current) => applyFogUpdated(current, payload));
    const onSceneActivated = ({ sceneId }: { sceneId: string }) => {
      setActiveSceneId(sceneId);
      setSelectedTokenIdState(null);
      setSelectedTokenIds([]);
    };
    const onSceneUpdated = (scene: Scene) =>
      setScenes((current) => applySceneUpdated(current, scene));
    const onSceneCreated = (scene: Scene) => {
      setScenes((current) => applySceneCreated(current, scene));
      setActiveSceneId((current) => current ?? scene.id);
    };
    const onSceneDeleted = ({ sceneId }: { sceneId: string }) => {
      const result = applySceneDeleted(
        {
          scenes: scenesRef.current,
          tokens: tokensRef.current,
          activeSceneId: activeSceneIdRef.current,
        },
        sceneId
      );
      setScenes(result.scenes);
      setTokens(result.tokens);
      setActiveSceneId(result.activeSceneId);
      setSelectedTokenIds((current) =>
        current.filter((tokenId) => result.tokens.some((token) => token.id === tokenId))
      );
      setSelectedTokenIdState((current) =>
        current && result.tokens.some((token) => token.id === current) ? current : null
      );
    };
    const onSceneTemplates = ({
      sceneId,
      templates,
    }: {
      sceneId: string;
      templates: Scene["templates"];
    }) =>
      setScenes((current) =>
        current.map((scene) => (scene.id === sceneId ? { ...scene, templates } : scene))
      );
    const onSceneWalls = ({ sceneId, walls }: { sceneId: string; walls: Scene["walls"] }) =>
      setScenes((current) =>
        current.map((scene) => (scene.id === sceneId ? { ...scene, walls } : scene))
      );
    const onSceneProps = ({ sceneId, props }: { sceneId: string; props: Scene["props"] }) =>
      setScenes((current) =>
        current.map((scene) => (scene.id === sceneId ? { ...scene, props } : scene))
      );
    const onSceneDrawings = ({
      sceneId,
      drawings,
    }: {
      sceneId: string;
      drawings: Scene["drawings"];
    }) =>
      setScenes((current) =>
        current.map((scene) => (scene.id === sceneId ? { ...scene, drawings } : scene))
      );
    const onScenesReordered = (nextScenes: Scene[]) => setScenes(nextScenes);
    const onChatMessage = (message: ChatMessage) =>
      setMessages((current) => applyChatMessage(current, message));
    const onInitiativeUpdated = (payload: {
      entries: InitiativeEntry[];
      round: number;
      turnIndex: number;
    }) => {
      setInitiative(payload.entries);
      setRound(payload.round);
      setTurnIndex(payload.turnIndex);
    };
    const onAudioState = (payload: { campaignId: string; state: CampaignAudioState }) => {
      if (payload.campaignId === campaignId) setAudioState(payload.state);
    };
    const onAudioTracks = (payload: { campaignId: string; tracks: CampaignAudioTrack[] }) => {
      if (payload.campaignId === campaignId) setAudioTracks(payload.tracks);
    };
    const onPointer = (payload: { displayName: string; x: number; y: number }) => {
      setRemotePointer({ x: payload.x, y: payload.y, name: payload.displayName, ts: Date.now() });
      if (pointerTimer.current) window.clearTimeout(pointerTimer.current);
      pointerTimer.current = window.setTimeout(() => setRemotePointer(null), 2200);
    };
    const onCharacterUpdated = (payload: {
      characterId: string;
      summary: CharacterRecord["summary"];
      name: string;
    }) => setCharacters((current) => applyCharacterUpdated(current, payload));
    const onCharacterCreated = (payload: { character: CharacterRecord }) =>
      setCharacters((current) => applyCharacterCreated(current, payload.character));
    const onCharacterRemoved = ({ characterId }: { characterId: string }) =>
      setCharacters((current) => current.filter((character) => character.id !== characterId));
    const onRevision = ({ revision }: { revision: number }) => {
      const action = revisionAction(revisionRef.current, revision);
      if (action === "ignore") return;
      if (action === "apply") {
        revisionRef.current = revision;
        return;
      }
      if (!refreshingRef.current) {
        refreshingRef.current = true;
        void refreshTable().finally(() => {
          refreshingRef.current = false;
        });
      }
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
    socket.on("scene:templates", onSceneTemplates);
    socket.on("scene:walls", onSceneWalls);
    socket.on("scene:props", onSceneProps);
    socket.on("scene:drawings", onSceneDrawings);
    socket.on("scenes:reordered", onScenesReordered);
    socket.on("chat:message", onChatMessage);
    socket.on("initiative:updated", onInitiativeUpdated);
    socket.on("audio:state", onAudioState);
    socket.on("audio:tracks", onAudioTracks);
    socket.on("pointer:show", onPointer);
    socket.on("character:updated", onCharacterUpdated);
    socket.on("character:created", onCharacterCreated);
    socket.on("character:removed", onCharacterRemoved);
    socket.on("campaign:revision", onRevision);
    socket.on("error:toast", onError);

    return () => {
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
      socket.off("scene:templates", onSceneTemplates);
      socket.off("scene:walls", onSceneWalls);
      socket.off("scene:props", onSceneProps);
      socket.off("scene:drawings", onSceneDrawings);
      socket.off("scenes:reordered", onScenesReordered);
      socket.off("chat:message", onChatMessage);
      socket.off("initiative:updated", onInitiativeUpdated);
      socket.off("audio:state", onAudioState);
      socket.off("audio:tracks", onAudioTracks);
      socket.off("pointer:show", onPointer);
      socket.off("character:updated", onCharacterUpdated);
      socket.off("character:created", onCharacterCreated);
      socket.off("character:removed", onCharacterRemoved);
      socket.off("campaign:revision", onRevision);
      socket.off("error:toast", onError);
      leaveCampaignRoom();
      if (pointerTimer.current) window.clearTimeout(pointerTimer.current);
    };
  }, [campaignId, toast, refreshTable]);

  return {
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
    refreshTable,
  };
}
