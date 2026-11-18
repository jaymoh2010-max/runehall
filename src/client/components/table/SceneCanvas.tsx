import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
} from "react";
import { Maximize, Minus, Move, Plus, Ruler } from "lucide-react";
import type {
  CharacterRecord,
  Monster,
  Scene,
  SceneProp,
  ScenePropLayer,
  Token,
  Wall,
  WallKind,
} from "../../../shared/types";
import type { PropPreset } from "../../../shared/props";
import { measureGridDistance } from "../../../shared/measurement";
import { blockingPropForMove } from "../../../shared/collision";
import { findPathAroundProps } from "../../../shared/pathfinding";
import { blockingWallForMove, nearestWall } from "../../../shared/walls";
import { computeVision } from "../../../shared/vision";
import { lightColorRgba } from "../../../shared/lighting";
import { evaluateCover } from "../../../shared/cover";
import { loadExplored, saveExplored } from "./explored";
import { initialsForName, Tag } from "../ui";
import { HoverCard } from "../HoverCard";
import { BESTIARY_DRAG_TYPE, type BestiaryDragPayload } from "./bestiaryDrag";
import {
  templateLabel,
  templateRadiusPx,
  TEMPLATE_LABELS,
  type AoeTemplate,
  type TemplateKind,
} from "../../../shared/templates";

type FogMode = "reveal" | "hide";

interface DragPath {
  /** Polyline including the token's starting position. */
  points: { x: number; y: number }[];
  feet: number;
  reachedGoal: boolean;
  unreachable: boolean;
  budget: number | null;
}

interface ActiveMovement {
  tokenId: string;
  speed: number | null;
  movementUsed: number;
  diagonalSteps: number;
}

interface SceneCanvasProps {
  scene: Scene;
  tokens: Token[];
  characters: CharacterRecord[];
  isGm: boolean;
  userId: string;
  selectedTokenId: string | null;
  selectedTokenIds: string[];
  /** Movement tracker for the combatant whose turn is active, if any. */
  activeMovement: ActiveMovement | null;
  onSelectToken: (id: string | null, additive?: boolean) => void;
  onSelectTokens: (ids: string[], additive?: boolean) => void;
  onOpenCharacter: (id: string) => void;
  onEditToken?: (id: string) => void;
  onMoveToken: (tokenId: string, x: number, y: number) => void;
  onFog: (cells: string[], mode: FogMode) => void;
  fogBrush: FogMode | null;
  brushSize: number;
  measureMode: boolean;
  wallMode: boolean;
  wallKind: WallKind;
  onWalls: (walls: Wall[]) => void;
  previewMode?: boolean;
  propMode: boolean;
  pendingProp: PropPreset | null;
  selectedPropId: string | null;
  onPlaceProp: (x: number, y: number) => void;
  onSelectProp: (propId: string | null) => void;
  onMoveProp: (propId: string, x: number, y: number) => void;
  onPing: (x: number, y: number) => void;
  remotePointer: { x: number; y: number; name: string; ts: number } | null;
  onDropMonster?: (monster: Monster, count: number, x: number, y: number) => void;
  templateKind: TemplateKind | null;
  templateSize: number;
  onTemplate: (template: AoeTemplate) => void;
}

interface Pan {
  x: number;
  y: number;
}

export function SceneCanvas({
  scene,
  tokens,
  characters,
  isGm,
  userId,
  selectedTokenId,
  selectedTokenIds,
  activeMovement,
  onSelectToken,
  onSelectTokens,
  onOpenCharacter,
  onEditToken,
  onMoveToken,
  onFog,
  fogBrush,
  brushSize,
  measureMode,
  wallMode,
  wallKind,
  onWalls,
  previewMode = false,
  propMode,
  pendingProp,
  selectedPropId,
  onPlaceProp,
  onSelectProp,
  onMoveProp,
  onPing,
  remotePointer,
  onDropMonster,
  templateKind,
  templateSize,
  onTemplate,
}: SceneCanvasProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const fogCanvasRef = useRef<HTMLCanvasElement>(null);
  const lightCanvasRef = useRef<HTMLCanvasElement>(null);
  const [zoom, setZoom] = useState(0.5);
  const [pan, setPan] = useState<Pan>({ x: 40, y: 40 });
  const [dragging, setDragging] = useState<{
    tokenId: string;
    positions: Record<string, { x: number; y: number }>;
    paths: Record<string, DragPath>;
  } | null>(null);
  const [panning, setPanning] = useState<{
    startX: number;
    startY: number;
    panX: number;
    panY: number;
  } | null>(null);
  const [measuring, setMeasuring] = useState<{
    startX: number;
    startY: number;
    x: number;
    y: number;
  } | null>(null);
  const [marquee, setMarquee] = useState<{
    startX: number;
    startY: number;
    x: number;
    y: number;
  } | null>(null);
  const [fogPreview, setFogPreview] = useState<Set<string>>(() => new Set(scene.revealed));
  const [exploredCells, setExploredCells] = useState<Set<string>>(() => new Set());
  const [wallDraft, setWallDraft] = useState<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  } | null>(null);
  const wallClickStart = useRef<{ x: number; y: number } | null>(null);
  const [propDrag, setPropDrag] = useState<{
    id: string;
    offsetX: number;
    offsetY: number;
    startClientX: number;
    startClientY: number;
    x: number;
    y: number;
  } | null>(null);
  const [templateDraft, setTemplateDraft] = useState<{
    x: number;
    y: number;
    direction: number;
  } | null>(null);
  const templateDraftRef = useRef<{ x: number; y: number; direction: number } | null>(null);
  const painting = useRef<{ mode: FogMode; cells: Set<string> } | null>(null);
  const fittedScene = useRef<string | null>(null);
  const dragTarget = useRef<{ tokenId: string; x: number; y: number } | null>(null);

  const cols = Math.max(1, Math.ceil(scene.width / scene.gridSize));
  const rows = Math.max(1, Math.ceil(scene.height / scene.gridSize));
  const portraitMap = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const character of characters)
      map.set(character.id, character.summary?.portraitUrl ?? null);
    return map;
  }, [characters]);
  const characterMap = useMemo(() => {
    const map = new Map<string, CharacterRecord>();
    for (const character of characters) map.set(character.id, character);
    return map;
  }, [characters]);
  const tokenLights = useMemo(
    () =>
      tokens
        .filter((token) => !token.hidden && (token.lightRadius ?? 0) > 0)
        .map((token) => ({
          x: token.x,
          y: token.y,
          radius: ((token.lightRadius ?? 0) / 5) * scene.gridSize,
        })),
    [tokens, scene.gridSize]
  );
  const vision = useMemo(() => {
    if (isGm || !scene.fogEnabled || !scene.losEnabled) return null;
    const perPlayer = scene.visionScope === "per-player" && !previewMode;
    const origins = tokens
      .filter((token) => !token.hidden && (token.visionRadius ?? 60) > 0)
      .filter((token) =>
        perPlayer
          ? token.ownerId === userId
          : Boolean(token.characterId) || token.ownerId === userId
      )
      .map((token) => ({
        x: token.x,
        y: token.y,
        radius: ((token.visionRadius ?? 60) / 5) * scene.gridSize,
        mode: token.visionMode ?? "normal",
      }));
    return computeVision(scene, scene.walls, origins, {
      ambientLight: scene.ambientLight ?? "bright",
      lights: tokenLights,
    });
  }, [
    isGm,
    previewMode,
    userId,
    scene.fogEnabled,
    scene.losEnabled,
    scene.visionScope,
    scene.ambientLight,
    scene.width,
    scene.height,
    scene.gridSize,
    scene.gridOffsetX,
    scene.gridOffsetY,
    scene.walls,
    tokens,
    tokenLights,
  ]);

  useEffect(() => {
    if (!wallMode) {
      setWallDraft(null);
      wallClickStart.current = null;
    }
  }, [wallMode]);

  useEffect(() => {
    setExploredCells(loadExplored(scene, userId));
  }, [
    scene.campaignId,
    scene.id,
    scene.width,
    scene.height,
    scene.gridSize,
    scene.gridOffsetX,
    scene.gridOffsetY,
    scene.imageUrl,
    userId,
  ]);

  useEffect(() => {
    if (isGm || !scene.fogEnabled || !scene.losEnabled || !vision?.visible.size) return;
    setExploredCells((current) => {
      let changed = false;
      const next = new Set(current);
      for (const cell of vision.visible) {
        if (!next.has(cell)) {
          next.add(cell);
          changed = true;
        }
      }
      if (!changed) return current;
      saveExplored(scene, userId, next);
      return next;
    });
  }, [vision, isGm, scene, userId]);

  useEffect(() => {
    setFogPreview(new Set(scene.revealed));
  }, [scene.revealed]);

  const fit = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    const scale = Math.min((rect.width - 40) / scene.width, (rect.height - 40) / scene.height);
    const nextZoom = Math.max(0.08, Math.min(2.5, scale));
    setZoom(nextZoom);
    setPan({
      x: (rect.width - scene.width * nextZoom) / 2,
      y: (rect.height - scene.height * nextZoom) / 2,
    });
  }, [scene.width, scene.height]);

  useEffect(() => {
    if (fittedScene.current === scene.id) return;
    fittedScene.current = scene.id;
    const timer = window.setTimeout(fit, 30);
    return () => window.clearTimeout(timer);
  }, [scene.id, fit]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver(() => {
      if (fittedScene.current === scene.id) {
        // keep the current view; only refit when the scene changes
      }
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [scene.id]);

  useEffect(() => {
    const canvas = fogCanvasRef.current;
    if (!canvas) return;
    // Render the mask at up to 2048px on the long edge. Using a scene-
    // resolution canvas (rather than one pixel per grid cell) is what lets
    // revealed cells align correctly when the grid has a non-zero offset.
    const fogScale = Math.min(1, 2048 / Math.max(scene.width, scene.height));
    const width = Math.max(1, Math.ceil(scene.width * fogScale));
    const height = Math.max(1, Math.ceil(scene.height * fogScale));
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, width, height);
    if (!scene.fogEnabled) return;
    const cellSize = scene.gridSize * fogScale;
    const cellRect = (cell: string) => {
      const [cx, cy] = cell.split(",").map(Number);
      if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;
      return {
        x: (scene.gridOffsetX + cx * scene.gridSize) * fogScale,
        y: (scene.gridOffsetY + cy * scene.gridSize) * fogScale,
        size: cellSize,
      };
    };
    if (isGm || !scene.losEnabled) {
      context.fillStyle = isGm ? "rgba(5, 7, 11, 0.78)" : "rgba(5, 7, 11, 0.985)";
      context.fillRect(0, 0, width, height);
      for (const cell of fogPreview) {
        const rect = cellRect(cell);
        if (rect) context.clearRect(rect.x, rect.y, rect.size, rect.size);
      }
      return;
    }
    context.fillStyle = "rgba(5, 7, 11, 0.985)";
    context.fillRect(0, 0, width, height);
    context.fillStyle = "rgba(5, 7, 11, 0.7)";
    for (const cell of exploredCells) {
      const rect = cellRect(cell);
      if (!rect) continue;
      context.clearRect(rect.x, rect.y, rect.size, rect.size);
      context.fillRect(rect.x, rect.y, rect.size, rect.size);
    }
    context.fillStyle = "rgba(5, 7, 11, 0.32)";
    for (const cell of vision?.dim ?? []) {
      const rect = cellRect(cell);
      if (!rect) continue;
      context.clearRect(rect.x, rect.y, rect.size, rect.size);
      context.fillRect(rect.x, rect.y, rect.size, rect.size);
    }
    for (const cell of vision?.bright ?? []) {
      const rect = cellRect(cell);
      if (rect) context.clearRect(rect.x, rect.y, rect.size, rect.size);
    }
  }, [
    fogPreview,
    vision,
    exploredCells,
    isGm,
    scene.width,
    scene.height,
    scene.gridSize,
    scene.gridOffsetX,
    scene.gridOffsetY,
    scene.fogEnabled,
    scene.losEnabled,
  ]);

  useEffect(() => {
    const canvas = lightCanvasRef.current;
    if (!canvas) return;
    const scale = Math.min(1, 2048 / Math.max(scene.width, scene.height));
    const width = Math.max(1, Math.ceil(scene.width * scale));
    const height = Math.max(1, Math.ceil(scene.height * scale));
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, width, height);
    const lights = tokens.filter((token) => !token.hidden && (token.lightRadius ?? 0) > 0);
    if (!lights.length) return;
    context.globalCompositeOperation = "lighter";
    for (const token of lights) {
      const radius = ((token.lightRadius ?? 0) / 5) * scene.gridSize * scale;
      if (radius <= 0) continue;
      const x = token.x * scale;
      const y = token.y * scale;
      const gradient = context.createRadialGradient(x, y, 0, x, y, radius * 2);
      gradient.addColorStop(0, lightColorRgba(token.lightColor, 0.32));
      gradient.addColorStop(0.5, lightColorRgba(token.lightColor, 0.14));
      gradient.addColorStop(1, lightColorRgba(token.lightColor, 0));
      context.fillStyle = gradient;
      context.beginPath();
      context.arc(x, y, radius * 2, 0, Math.PI * 2);
      context.fill();
    }
    context.globalCompositeOperation = "source-over";
  }, [tokens, scene.width, scene.height, scene.gridSize]);

  const scenePoint = (clientX: number, clientY: number) => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (clientX - rect.left) / zoom,
      y: (clientY - rect.top) / zoom,
    };
  };

  const snap = (value: number, offset: number) => {
    const cell = Math.round((value - offset - scene.gridSize / 2) / scene.gridSize);
    return offset + cell * scene.gridSize + scene.gridSize / 2;
  };

  const snapWall = (x: number, y: number) => {
    const grid = Math.max(1, scene.gridSize);
    return {
      x: Math.max(
        0,
        Math.min(scene.width, scene.gridOffsetX + Math.round((x - scene.gridOffsetX) / grid) * grid)
      ),
      y: Math.max(
        0,
        Math.min(
          scene.height,
          scene.gridOffsetY + Math.round((y - scene.gridOffsetY) / grid) * grid
        )
      ),
    };
  };

  const onViewportDragOver = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!onDropMonster) return;
    if (!Array.from(event.dataTransfer.types).includes(BESTIARY_DRAG_TYPE)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };

  const onViewportDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!onDropMonster) return;
    const raw = event.dataTransfer.getData(BESTIARY_DRAG_TYPE);
    if (!raw) return;
    event.preventDefault();
    try {
      const payload = JSON.parse(raw) as BestiaryDragPayload;
      if (!payload?.monster?.id) return;
      const count = Math.max(1, Math.min(20, Math.round(Number(payload.count) || 1)));
      const cells = Math.max(1, Math.round(Number(payload.monster.sizeCells) || 1));
      const point = scenePoint(event.clientX, event.clientY);
      const half = (cells * scene.gridSize) / 2;
      const x = snap(Math.max(half, Math.min(scene.width - half, point.x)), scene.gridOffsetX);
      const y = snap(Math.max(half, Math.min(scene.height - half, point.y)), scene.gridOffsetY);
      onDropMonster(payload.monster, count, x, y);
    } catch {
      // Ignore malformed drag payloads.
    }
  };

  const onWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const viewport = viewportRef.current;
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    const mx = event.clientX - rect.left;
    const my = event.clientY - rect.top;
    const sceneX = (mx - pan.x) / zoom;
    const sceneY = (my - pan.y) / zoom;
    const factor = event.deltaY < 0 ? 1.12 : 0.89;
    const next = Math.max(0.08, Math.min(4, zoom * factor));
    setZoom(next);
    setPan({ x: mx - sceneX * next, y: my - sceneY * next });
  };

  const onViewportPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest(".scene-token")) return;
    if (propMode && isGm) {
      if (pendingProp) {
        const point = scenePoint(event.clientX, event.clientY);
        onPlaceProp(
          Math.max(0, Math.min(scene.width, snap(point.x, scene.gridOffsetX))),
          Math.max(0, Math.min(scene.height, snap(point.y, scene.gridOffsetY)))
        );
        return;
      }
      onSelectProp(null);
    }
    if (wallMode && isGm) {
      const point = scenePoint(event.clientX, event.clientY);
      const snapped = snapWall(point.x, point.y);
      wallClickStart.current = { x: event.clientX, y: event.clientY };
      setWallDraft({
        x1: snapped.x,
        y1: snapped.y,
        x2: snapped.x,
        y2: snapped.y,
      });
      viewportRef.current?.setPointerCapture(event.pointerId);
      return;
    }
    if (templateKind && isGm) {
      const point = scenePoint(event.clientX, event.clientY);
      const draft = {
        x: snap(point.x, scene.gridOffsetX),
        y: snap(point.y, scene.gridOffsetY),
        direction: 0,
      };
      templateDraftRef.current = draft;
      setTemplateDraft(draft);
      viewportRef.current?.setPointerCapture(event.pointerId);
      return;
    }
    if (fogBrush && isGm) {
      const point = scenePoint(event.clientX, event.clientY);
      const cx = Math.floor((point.x - scene.gridOffsetX) / scene.gridSize);
      const cy = Math.floor((point.y - scene.gridOffsetY) / scene.gridSize);
      const cells = new Set<string>();
      const radius = Math.floor((brushSize - 1) / 2);
      for (let x = cx - radius; x <= cx + radius; x++) {
        for (let y = cy - radius; y <= cy + radius; y++) {
          if (x >= 0 && y >= 0 && x < cols && y < rows) cells.add(`${x},${y}`);
        }
      }
      painting.current = { mode: fogBrush, cells };
      setFogPreview((current) => {
        const next = new Set(current);
        for (const cell of cells) {
          if (fogBrush === "reveal") next.add(cell);
          else next.delete(cell);
        }
        return next;
      });
      viewportRef.current?.setPointerCapture(event.pointerId);
      return;
    }
    if (measureMode) {
      const point = scenePoint(event.clientX, event.clientY);
      setMeasuring({ startX: point.x, startY: point.y, x: point.x, y: point.y });
      viewportRef.current?.setPointerCapture(event.pointerId);
      return;
    }
    if (event.shiftKey) {
      const point = scenePoint(event.clientX, event.clientY);
      setMarquee({ startX: point.x, startY: point.y, x: point.x, y: point.y });
      viewportRef.current?.setPointerCapture(event.pointerId);
      return;
    }
    setPanning({
      startX: event.clientX,
      startY: event.clientY,
      panX: pan.x,
      panY: pan.y,
    });
    viewportRef.current?.setPointerCapture(event.pointerId);
  };

  const onViewportPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (wallDraft) {
      const point = scenePoint(event.clientX, event.clientY);
      const snapped = snapWall(point.x, point.y);
      setWallDraft((current) => (current ? { ...current, x2: snapped.x, y2: snapped.y } : current));
      return;
    }
    if (templateDraftRef.current) {
      const point = scenePoint(event.clientX, event.clientY);
      const draft = templateDraftRef.current;
      const next = {
        ...draft,
        direction: Math.atan2(point.y - draft.y, point.x - draft.x),
      };
      templateDraftRef.current = next;
      setTemplateDraft(next);
      return;
    }
    if (painting.current) {
      const point = scenePoint(event.clientX, event.clientY);
      const cx = Math.floor((point.x - scene.gridOffsetX) / scene.gridSize);
      const cy = Math.floor((point.y - scene.gridOffsetY) / scene.gridSize);
      const radius = Math.floor((brushSize - 1) / 2);
      const cells: string[] = [];
      for (let x = cx - radius; x <= cx + radius; x++) {
        for (let y = cy - radius; y <= cy + radius; y++) {
          if (x >= 0 && y >= 0 && x < cols && y < rows) cells.push(`${x},${y}`);
        }
      }
      for (const cell of cells) painting.current.cells.add(cell);
      setFogPreview((current) => {
        const next = new Set(current);
        for (const cell of cells) {
          if (painting.current?.mode === "reveal") next.add(cell);
          else next.delete(cell);
        }
        return next;
      });
      return;
    }
    if (panning) {
      setPan({
        x: panning.panX + event.clientX - panning.startX,
        y: panning.panY + event.clientY - panning.startY,
      });
      return;
    }
    if (marquee) {
      const point = scenePoint(event.clientX, event.clientY);
      setMarquee((current) => (current ? { ...current, x: point.x, y: point.y } : current));
      return;
    }
    if (measuring) {
      const point = scenePoint(event.clientX, event.clientY);
      setMeasuring((current) => (current ? { ...current, x: point.x, y: point.y } : current));
    }
  };

  const onViewportPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (wallDraft) {
      const draft = wallDraft;
      const start = wallClickStart.current;
      wallClickStart.current = null;
      setWallDraft(null);
      viewportRef.current?.releasePointerCapture(event.pointerId);
      const screenDistance = start
        ? Math.hypot(event.clientX - start.x, event.clientY - start.y)
        : 0;
      if (screenDistance < 6) {
        const point = scenePoint(event.clientX, event.clientY);
        const hit = nearestWall(scene.walls, point.x, point.y, 10 / Math.max(zoom, 0.4));
        if (hit?.kind === "door") {
          onWalls(
            scene.walls.map((wall) => (wall.id === hit.id ? { ...wall, open: !wall.open } : wall))
          );
        }
        return;
      }
      const endPoint = scenePoint(event.clientX, event.clientY);
      const end = snapWall(endPoint.x, endPoint.y);
      if (Math.hypot(end.x - draft.x1, end.y - draft.y1) < scene.gridSize / 4) return;
      const wall: Wall = {
        id: `wall_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        x1: draft.x1,
        y1: draft.y1,
        x2: end.x,
        y2: end.y,
        kind: wallKind,
        ...(wallKind === "door" ? { open: false } : {}),
      };
      onWalls([...scene.walls, wall].slice(-500));
      return;
    }
    if (templateDraftRef.current) {
      const draft = templateDraftRef.current;
      templateDraftRef.current = null;
      setTemplateDraft(null);
      if (templateKind) {
        onTemplate({
          kind: templateKind,
          size: templateSize,
          x: draft.x,
          y: draft.y,
          direction: draft.direction,
        });
      }
      viewportRef.current?.releasePointerCapture(event.pointerId);
      return;
    }
    if (painting.current) {
      const painted = painting.current;
      painting.current = null;
      onFog([...painted.cells], painted.mode);
      viewportRef.current?.releasePointerCapture(event.pointerId);
      return;
    }
    if (panning) {
      setPanning(null);
      viewportRef.current?.releasePointerCapture(event.pointerId);
    }
    if (marquee) {
      const minX = Math.min(marquee.startX, marquee.x);
      const maxX = Math.max(marquee.startX, marquee.x);
      const minY = Math.min(marquee.startY, marquee.y);
      const maxY = Math.max(marquee.startY, marquee.y);
      const ids = tokens
        .filter((token) => token.x >= minX && token.x <= maxX && token.y >= minY && token.y <= maxY)
        .map((token) => token.id);
      onSelectTokens(ids, event.ctrlKey || event.metaKey);
      setMarquee(null);
      viewportRef.current?.releasePointerCapture(event.pointerId);
    }
    if (measuring) {
      viewportRef.current?.releasePointerCapture(event.pointerId);
    }
  };

  const onViewportPointerCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (wallDraft) {
      setWallDraft(null);
      wallClickStart.current = null;
      viewportRef.current?.releasePointerCapture(event.pointerId);
      return;
    }
    onViewportPointerUp(event);
  };

  const onPropPointerDown = (event: ReactPointerEvent<HTMLDivElement>, prop: SceneProp) => {
    if (!isGm || !propMode) return;
    event.stopPropagation();
    onSelectProp(prop.id);
    if (prop.locked) return;
    const point = scenePoint(event.clientX, event.clientY);
    setPropDrag({
      id: prop.id,
      offsetX: point.x - prop.x,
      offsetY: point.y - prop.y,
      startClientX: event.clientX,
      startClientY: event.clientY,
      x: prop.x,
      y: prop.y,
    });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPropPointerMove = (event: ReactPointerEvent<HTMLDivElement>, prop: SceneProp) => {
    if (!propDrag || propDrag.id !== prop.id) return;
    event.stopPropagation();
    const point = scenePoint(event.clientX, event.clientY);
    setPropDrag((current) =>
      current
        ? {
            ...current,
            x: point.x - current.offsetX,
            y: point.y - current.offsetY,
          }
        : current
    );
  };

  const onPropPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!propDrag) return;
    event.stopPropagation();
    const drag = propDrag;
    setPropDrag(null);
    event.currentTarget.releasePointerCapture(event.pointerId);
    const moved =
      Math.hypot(event.clientX - drag.startClientX, event.clientY - drag.startClientY) > 4;
    if (!moved) {
      onSelectProp(drag.id);
      return;
    }
    const x = Math.max(0, Math.min(scene.width, snap(drag.x, scene.gridOffsetX)));
    const y = Math.max(0, Math.min(scene.height, snap(drag.y, scene.gridOffsetY)));
    onMoveProp(drag.id, x, y);
  };

  const onPropPointerCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
    setPropDrag(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const movementBudgetFor = (member: Token): number | null => {
    if (isGm || !activeMovement || activeMovement.tokenId !== member.id) return null;
    if (activeMovement.speed === null) return null;
    return Math.max(0, activeMovement.speed - Math.max(0, activeMovement.movementUsed));
  };

  const onTokenPointerDown = (event: ReactPointerEvent<HTMLDivElement>, token: Token) => {
    event.stopPropagation();
    const additive = event.shiftKey || event.ctrlKey || event.metaKey;
    if (additive) {
      onSelectToken(token.id, true);
      return;
    }
    if (!selectedTokenIds.includes(token.id)) onSelectToken(token.id);
    if (event.button !== 0) return;
    if (!isGm && (token.ownerId !== userId || token.locked)) return;
    const point = scenePoint(event.clientX, event.clientY);
    const movingIds = new Set(selectedTokenIds);
    movingIds.add(token.id);
    if (token.groupId) {
      for (const member of tokens) {
        if (member.groupId === token.groupId) movingIds.add(member.id);
      }
    }
    const positions: Record<string, { x: number; y: number }> = {
      [token.id]: { x: point.x, y: point.y },
    };
    for (const id of movingIds) {
      const member = tokens.find((entry) => entry.id === id);
      if (!member) continue;
      if (!isGm && (member.ownerId !== userId || member.locked)) continue;
      positions[id] = { x: member.x, y: member.y };
    }
    dragTarget.current = null;
    setDragging({ tokenId: token.id, positions, paths: {} });
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };

  const onTokenPointerMove = (event: ReactPointerEvent<HTMLDivElement>, token: Token) => {
    if (dragging?.tokenId !== token.id) return;
    const point = scenePoint(event.clientX, event.clientY);
    const half = (token.size * scene.gridSize) / 2;
    const nextX = snap(Math.max(half, Math.min(scene.width - half, point.x)), scene.gridOffsetX);
    const nextY = snap(Math.max(half, Math.min(scene.height - half, point.y)), scene.gridOffsetY);
    if (
      dragTarget.current &&
      dragTarget.current.tokenId === token.id &&
      dragTarget.current.x === nextX &&
      dragTarget.current.y === nextY
    ) {
      return;
    }
    dragTarget.current = { tokenId: token.id, x: nextX, y: nextY };
    const dx = nextX - token.x;
    const dy = nextY - token.y;
    const members = Object.keys(dragging.positions)
      .map((id) => tokens.find((entry) => entry.id === id))
      .filter((entry): entry is Token => Boolean(entry));
    const props = scene.props ?? [];
    const positions: Record<string, { x: number; y: number }> = {};
    const paths: Record<string, DragPath> = {};
    for (const member of members) {
      const memberHalf = (member.size * scene.gridSize) / 2;
      const target = {
        x: Math.max(memberHalf, Math.min(scene.width - memberHalf, member.x + dx)),
        y: Math.max(memberHalf, Math.min(scene.height - memberHalf, member.y + dy)),
      };
      positions[member.id] = target;
      if ((!scene.propCollision || !props.length) && !scene.wallCollision) continue;
      const blockedProp = scene.propCollision
        ? blockingPropForMove(
            props,
            member,
            { x: member.x, y: member.y },
            target,
            scene.gridSize,
            true
          )
        : null;
      const blockedWall = scene.wallCollision
        ? blockingWallForMove(scene.walls, { x: member.x, y: member.y }, target)
        : null;
      if (!blockedProp && !blockedWall) continue;
      const budget = movementBudgetFor(member);
      const result = findPathAroundProps({
        props,
        propCollision: scene.propCollision,
        walls: scene.walls,
        wallCollision: scene.wallCollision,
        gridSize: scene.gridSize,
        gridOffsetX: scene.gridOffsetX,
        gridOffsetY: scene.gridOffsetY,
        width: scene.width,
        height: scene.height,
        tokenSize: member.size,
        from: { x: member.x, y: member.y },
        to: target,
        budget,
        diagonalStart: activeMovement?.tokenId === member.id ? activeMovement.diagonalSteps : 0,
      });
      if (!result.points.length) {
        positions[member.id] = { x: member.x, y: member.y };
        paths[member.id] = {
          points: [{ x: member.x, y: member.y }],
          feet: 0,
          reachedGoal: false,
          unreachable: result.unreachable,
          budget,
        };
        continue;
      }
      positions[member.id] = result.points[result.points.length - 1];
      paths[member.id] = {
        points: [{ x: member.x, y: member.y }, ...result.points],
        feet: result.feet,
        reachedGoal: result.reachedGoal,
        unreachable: result.unreachable,
        budget,
      };
    }
    setDragging({ tokenId: token.id, positions, paths });
  };

  const onTokenPointerUp = (event: ReactPointerEvent<HTMLDivElement>, token: Token) => {
    if (dragging?.tokenId !== token.id) return;
    for (const [tokenId, position] of Object.entries(dragging.positions)) {
      const member = tokens.find((entry) => entry.id === tokenId);
      if (member && Math.hypot(position.x - member.x, position.y - member.y) < 0.5) continue;
      onMoveToken(tokenId, position.x, position.y);
    }
    dragTarget.current = null;
    setDragging(null);
    (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
  };

  const dragPosition = (token: Token) =>
    dragging?.positions[token.id] ?? { x: token.x, y: token.y };

  const renderPropLayer = (layer: ScenePropLayer) => {
    const props = (scene.props ?? [])
      .filter((prop) => prop.layer === layer && (isGm || prop.visible))
      .sort((a, b) => a.z - b.z);
    if (!props.length) return null;
    return (
      <div className={`scene-prop-layer ${layer}`}>
        {props.map((prop) => {
          const position = propDrag?.id === prop.id ? propDrag : prop;
          const selected = prop.id === selectedPropId;
          return (
            <div
              key={prop.id}
              className={`scene-prop ${selected ? "is-selected" : ""} ${prop.visible ? "" : "is-hidden"} ${prop.locked ? "is-locked" : ""}`}
              style={{
                left: position.x,
                top: position.y,
                width: prop.width,
                height: prop.height,
                transform: `translate(-50%, -50%) rotate(${prop.rotation}deg)`,
                zIndex: prop.z,
              }}
              onPointerDown={(event) => onPropPointerDown(event, prop)}
              onPointerMove={(event) => onPropPointerMove(event, prop)}
              onPointerUp={onPropPointerUp}
              onPointerCancel={onPropPointerCancel}
            >
              <img src={prop.imageUrl} alt="" draggable={false} />
            </div>
          );
        })}
      </div>
    );
  };

  const measurement = measuring
    ? measureGridDistance(
        measuring.x - measuring.startX,
        measuring.y - measuring.startY,
        scene.gridSize
      )
    : null;
  const measureSquares = measurement ? Math.max(1, measurement.squares) : 0;
  const measureFeet = measurement ? Math.max(5, measurement.feet) : 0;
  const templateStroke = 2 / Math.max(zoom, 0.4);
  const renderTemplate = (value: AoeTemplate, draft = false): ReactElement => {
    const radius = templateRadiusPx(value.size, scene.gridSize);
    const fill = draft ? "rgba(240,217,168,0.2)" : "rgba(200,169,107,0.14)";
    if (value.kind === "burst" || value.kind === "emanation") {
      return (
        <circle
          cx={value.x}
          cy={value.y}
          r={radius}
          fill={fill}
          stroke="#e5ca91"
          strokeWidth={templateStroke}
        />
      );
    }
    if (value.kind === "cone") {
      const spread = Math.PI / 2;
      const a1 = value.direction - spread / 2;
      const a2 = value.direction + spread / 2;
      const p1x = value.x + Math.cos(a1) * radius;
      const p1y = value.y + Math.sin(a1) * radius;
      const p2x = value.x + Math.cos(a2) * radius;
      const p2y = value.y + Math.sin(a2) * radius;
      return (
        <path
          d={`M ${value.x} ${value.y} L ${p1x} ${p1y} A ${radius} ${radius} 0 0 1 ${p2x} ${p2y} Z`}
          fill={fill}
          stroke="#e5ca91"
          strokeWidth={templateStroke}
        />
      );
    }
    const half = scene.gridSize / 2;
    const px = Math.cos(value.direction + Math.PI / 2) * half;
    const py = Math.sin(value.direction + Math.PI / 2) * half;
    const ex = value.x + Math.cos(value.direction) * radius;
    const ey = value.y + Math.sin(value.direction) * radius;
    return (
      <polygon
        points={`${value.x + px},${value.y + py} ${ex + px},${ey + py} ${ex - px},${ey - py} ${value.x - px},${value.y - py}`}
        fill={fill}
        stroke="#e5ca91"
        strokeWidth={templateStroke}
      />
    );
  };
  const draftTemplate: AoeTemplate | null =
    templateDraft && templateKind
      ? { kind: templateKind, size: templateSize, ...templateDraft }
      : null;
  const coverObserver = selectedTokenId
    ? (tokens.find((token) => token.id === selectedTokenId) ?? null)
    : null;
  const activePath = dragging ? (dragging.paths[dragging.tokenId] ?? null) : null;
  const activePathEnd = activePath?.points[activePath.points.length - 1] ?? null;
  const activePathLabel = activePath
    ? `${activePath.feet} ft${activePath.reachedGoal ? "" : activePath.unreachable ? " · no path" : " · speed limit"}`
    : null;

  return (
    <div
      ref={viewportRef}
      className={`scene-viewport ${fogBrush ? "is-fogging" : ""} ${measureMode ? "is-measuring" : ""} ${wallMode ? "is-walling" : ""} ${propMode ? "is-propping" : ""} ${pendingProp ? "is-placing-prop" : ""} ${templateKind ? "is-templating" : ""}`}
      onWheel={onWheel}
      onPointerDown={onViewportPointerDown}
      onPointerMove={onViewportPointerMove}
      onPointerUp={onViewportPointerUp}
      onPointerCancel={onViewportPointerCancel}
      onDragOver={onViewportDragOver}
      onDrop={onViewportDrop}
      onContextMenu={(event) => {
        event.preventDefault();
        const point = scenePoint(event.clientX, event.clientY);
        if (wallMode && isGm) {
          const hit = nearestWall(scene.walls, point.x, point.y, 10 / Math.max(zoom, 0.4));
          if (hit) {
            onWalls(scene.walls.filter((wall) => wall.id !== hit.id));
            return;
          }
        }
        onPing(point.x, point.y);
      }}
    >
      <div
        ref={surfaceRef}
        className="scene-surface"
        style={{
          width: scene.width,
          height: scene.height,
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
        }}
      >
        {scene.imageUrl ? (
          <img className="scene-map-img" src={scene.imageUrl} alt="" draggable={false} />
        ) : (
          <div className="scene-blank" />
        )}
        {renderPropLayer("ground")}
        <div
          className="scene-grid"
          style={{
            backgroundSize: `${scene.gridSize}px ${scene.gridSize}px`,
            backgroundPosition: `${scene.gridOffsetX}px ${scene.gridOffsetY}px`,
          }}
        />
        <canvas
          ref={lightCanvasRef}
          className="light-canvas"
          aria-hidden="true"
          style={{ width: scene.width, height: scene.height }}
        />
        {dragging && Object.keys(dragging.paths).length ? (
          <svg className="path-layer" width={scene.width} height={scene.height} aria-hidden="true">
            {Object.entries(dragging.paths).map(([tokenId, path]) => {
              const end = path.points[path.points.length - 1];
              return (
                <g key={tokenId}>
                  <polyline
                    points={path.points.map((entry) => `${entry.x},${entry.y}`).join(" ")}
                    fill="none"
                    stroke="#e5ca91"
                    strokeWidth={2 / Math.max(zoom, 0.4)}
                    strokeDasharray={`${8 / Math.max(zoom, 0.4)} ${5 / Math.max(zoom, 0.4)}`}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <circle cx={end.x} cy={end.y} r={4 / Math.max(zoom, 0.4)} fill="#e5ca91" />
                </g>
              );
            })}
          </svg>
        ) : null}
        {tokens.map((token) => {
          const size = token.size * scene.gridSize;
          const position = dragPosition(token);
          const portrait =
            token.imageUrl || (token.characterId ? portraitMap.get(token.characterId) : null);
          const canDrag = isGm || (token.ownerId === userId && !token.locked);
          const isSelected = selectedTokenIds.includes(token.id) || selectedTokenId === token.id;
          const character = token.characterId ? characterMap.get(token.characterId) : null;
          const summary = character?.summary;
          const conditions = token.conditions
            .map((condition) =>
              [
                condition.name,
                condition.value ? ` ${condition.value}` : "",
                condition.duration ? ` (${condition.duration}r)` : "",
              ].join("")
            )
            .join(", ");
          const cover =
            coverObserver && coverObserver.id !== token.id
              ? evaluateCover({
                  attacker: coverObserver,
                  target: token,
                  walls: scene.walls,
                  props: (scene.props ?? []).filter((prop) => isGm || prop.visible),
                  ambientLight: scene.ambientLight ?? "bright",
                  lights: tokenLights,
                })
              : null;
          const coverSummary =
            cover && (cover.cover !== "none" || cover.concealment !== "none")
              ? `${cover.summary} vs. ${coverObserver?.name ?? "observer"}`
              : null;
          const tokenMeta = [
            token.hpMax !== null && token.hpCurrent !== null
              ? `HP ${token.hpCurrent}/${token.hpMax}`
              : "",
            token.ac !== null ? `AC ${token.ac}` : "",
            conditions ? `Conditions: ${conditions}` : "",
            coverSummary ?? "",
          ].filter(Boolean);
          return (
            <HoverCard
              key={token.id}
              title={token.name}
              subtitle={
                summary
                  ? `Level ${summary.level} ${summary.className || "adventurer"}${token.groupName ? ` · ${token.groupName}` : ""}`
                  : (token.groupName ?? (token.hidden && isGm ? "Hidden token" : "Token"))
              }
              meta={tokenMeta.length ? <span>{tokenMeta.join(" · ")}</span> : undefined}
              body={
                summary ? (
                  <span>
                    {[summary.ancestry, summary.heritage].filter(Boolean).join(" · ") ||
                      "Party member"}
                  </span>
                ) : undefined
              }
              footer={
                isGm
                  ? "Right-click to edit"
                  : character
                    ? "Double-click for the character sheet"
                    : undefined
              }
              disabled={Boolean(dragging)}
            >
              <div
                className={`scene-token ${isSelected ? "is-selected" : ""} ${canDrag ? "can-drag" : ""} ${token.hidden && isGm ? "is-hidden" : ""}`}
                style={{
                  width: size,
                  height: size,
                  left: position.x - size / 2,
                  top: position.y - size / 2,
                  borderColor: token.color,
                }}
                onPointerDown={(event) => onTokenPointerDown(event, token)}
                onPointerMove={(event) => onTokenPointerMove(event, token)}
                onPointerUp={(event) => onTokenPointerUp(event, token)}
                onPointerCancel={(event) => onTokenPointerUp(event, token)}
                onDoubleClick={() => token.characterId && onOpenCharacter(token.characterId)}
                onContextMenu={(event) => {
                  if (!onEditToken) return;
                  event.preventDefault();
                  event.stopPropagation();
                  onSelectToken(token.id);
                  onEditToken(token.id);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelectToken(token.id);
                  }
                }}
                tabIndex={0}
                role="button"
                aria-label={`${token.name}${token.characterId ? ", character token" : ""}${
                  token.hpMax !== null && token.hpCurrent !== null
                    ? `, ${token.hpCurrent} of ${token.hpMax} hit points`
                    : ""
                }${isGm ? ", right-click to edit" : ""}`}
              >
                {portrait ? (
                  <img src={portrait} alt="" draggable={false} />
                ) : (
                  <span
                    aria-hidden="true"
                    style={{ background: `linear-gradient(145deg, ${token.color}55, #11161f)` }}
                  >
                    {initialsForName(token.name)}
                  </span>
                )}
                <span className="scene-token-name">{token.name}</span>
                {token.hpMax !== null && token.hpCurrent !== null ? (
                  <span className="token-hp">
                    <span
                      style={{
                        width: `${Math.max(0, Math.min(100, (token.hpCurrent / Math.max(1, token.hpMax)) * 100))}%`,
                      }}
                    />
                  </span>
                ) : null}
                {token.locked ? <span className="token-lock" title="Locked"></span> : null}
              </div>
            </HoverCard>
          );
        })}
        {measuring ? (
          <svg className="measure-layer" width={scene.width} height={scene.height}>
            <line
              x1={measuring.startX}
              y1={measuring.startY}
              x2={measuring.x}
              y2={measuring.y}
              stroke="#e5ca91"
              strokeWidth={2 / Math.max(zoom, 0.4)}
              strokeDasharray={`${8 / Math.max(zoom, 0.4)} ${5 / Math.max(zoom, 0.4)}`}
            />
            <circle
              cx={measuring.startX}
              cy={measuring.startY}
              r={4 / Math.max(zoom, 0.4)}
              fill="#e5ca91"
            />
            <circle cx={measuring.x} cy={measuring.y} r={4 / Math.max(zoom, 0.4)} fill="#e5ca91" />
          </svg>
        ) : null}
        {remotePointer ? (
          <div className="scene-ping" style={{ left: remotePointer.x, top: remotePointer.y }}>
            <span />
            <em>{remotePointer.name}</em>
          </div>
        ) : null}
        {renderPropLayer("overhead")}
        {scene.fogEnabled ? (
          <canvas
            ref={fogCanvasRef}
            className={`fog-canvas ${fogBrush && isGm ? "is-brush" : ""}`}
            style={{ width: scene.width, height: scene.height }}
          />
        ) : null}
        {isGm && (scene.walls.length || wallDraft) ? (
          <svg className="wall-layer" width={scene.width} height={scene.height} aria-hidden="true">
            {scene.walls.map((wall) => {
              const open = wall.kind === "door" && wall.open;
              return (
                <line
                  key={wall.id}
                  x1={wall.x1}
                  y1={wall.y1}
                  x2={wall.x2}
                  y2={wall.y2}
                  className={`wall-line ${wall.kind} ${open ? "is-open" : ""}`}
                  stroke={open ? "#7fbe95" : wall.kind === "door" ? "#d08a5a" : "#e5ca91"}
                  strokeWidth={3 / Math.max(zoom, 0.4)}
                  strokeDasharray={
                    wall.kind === "door"
                      ? `${8 / Math.max(zoom, 0.4)} ${5 / Math.max(zoom, 0.4)}`
                      : undefined
                  }
                  strokeLinecap="round"
                />
              );
            })}
            {wallDraft ? (
              <line
                x1={wallDraft.x1}
                y1={wallDraft.y1}
                x2={wallDraft.x2}
                y2={wallDraft.y2}
                className="wall-line is-draft"
                stroke="#f0d9a8"
                strokeWidth={2.5 / Math.max(zoom, 0.4)}
                strokeDasharray={`${7 / Math.max(zoom, 0.4)} ${5 / Math.max(zoom, 0.4)}`}
                strokeLinecap="round"
              />
            ) : null}
          </svg>
        ) : null}
        {scene.templates.length || draftTemplate ? (
          <svg className="template-layer" width={scene.width} height={scene.height}>
            {scene.templates.map((entry, index) => (
              <g key={`${entry.kind}-${index}`}>{renderTemplate(entry)}</g>
            ))}
            {draftTemplate ? (
              <g>
                {renderTemplate(draftTemplate, true)}
                <text
                  x={draftTemplate.x + 8}
                  y={draftTemplate.y - 8}
                  fill="#f0d9a8"
                  fontSize={14 / Math.max(zoom, 0.4)}
                  fontWeight={600}
                >
                  {templateLabel(draftTemplate)}
                </text>
              </g>
            ) : null}
          </svg>
        ) : null}
        {marquee ? (
          <svg className="marquee-layer" width={scene.width} height={scene.height}>
            <rect
              x={Math.min(marquee.startX, marquee.x)}
              y={Math.min(marquee.startY, marquee.y)}
              width={Math.abs(marquee.x - marquee.startX)}
              height={Math.abs(marquee.y - marquee.startY)}
              fill="rgba(200,169,107,0.12)"
              stroke="#e5ca91"
              strokeWidth={2 / Math.max(zoom, 0.4)}
              strokeDasharray={`${6 / Math.max(zoom, 0.4)} ${4 / Math.max(zoom, 0.4)}`}
            />
          </svg>
        ) : null}
        {measuring ? (
          <div
            className="measure-label"
            title={
              measurement?.usesDiagonals
                ? "PF2e diagonals cost 5 ft, then 10 ft, alternating. The count restarts for each ruler measurement."
                : undefined
            }
            style={{
              left: (measuring.startX + measuring.x) / 2,
              top: (measuring.startY + measuring.y) / 2 - 8,
            }}
          >
            {measureSquares} sq · {measureFeet} ft.
          </div>
        ) : null}
        {activePath && activePathEnd ? (
          <div
            className={`measure-label path-label ${activePath.reachedGoal ? "" : "is-short"}`}
            title={
              activePath.reachedGoal
                ? "Shortest path around blocking props and walls."
                : activePath.unreachable
                  ? "The destination cannot be reached around the blocking props and walls."
                  : `The rest of the path would exceed the ${activePath.budget ?? 0} ft of movement left this turn.`
            }
            style={{ left: activePathEnd.x, top: activePathEnd.y - 8 }}
          >
            {activePathLabel}
          </div>
        ) : null}
      </div>

      <div className="scene-zoom" onPointerDown={(event) => event.stopPropagation()}>
        <button
          type="button"
          onClick={() => setZoom((current) => Math.max(0.08, current - 0.1))}
          title="Zoom out"
        >
          <Minus size={14} />
        </button>
        <span>{Math.round(zoom * 100)}%</span>
        <button
          type="button"
          onClick={() => setZoom((current) => Math.min(4, current + 0.1))}
          title="Zoom in"
        >
          <Plus size={14} />
        </button>
        <button type="button" onClick={fit} title="Fit scene">
          <Maximize size={14} />
        </button>
      </div>
      <div className="scene-hints">
        {fogBrush ? (
          <Tag tone="gold">
            <Move size={11} /> Painting fog (
            {brushSize === 1 ? "1" : brushSize === 3 ? "3×3" : "5×5"})
          </Tag>
        ) : null}
        {measureMode ? (
          <Tag tone="gold">
            <Ruler size={11} /> Measuring
          </Tag>
        ) : null}
        {templateKind ? (
          <Tag tone="gold">
            <Move size={11} /> {TEMPLATE_LABELS[templateKind]} template · click and drag
          </Tag>
        ) : null}
        {wallMode ? (
          <Tag tone="gold">
            <Move size={11} /> {wallKind === "door" ? "Door" : "Wall"} · drag to draw · click a door
            to open · right-click to delete
          </Tag>
        ) : null}
        {propMode ? (
          <Tag tone="gold">
            <Move size={11} />{" "}
            {pendingProp
              ? `Click to place ${pendingProp.name}`
              : "Props · drag to move · click to select"}
          </Tag>
        ) : null}
        {!fogBrush && !measureMode && !templateKind && !wallMode && !propMode ? (
          <span>Drag to pan · Shift-drag to select · wheel to zoom · right-click to ping</span>
        ) : null}
      </div>
    </div>
  );
}
