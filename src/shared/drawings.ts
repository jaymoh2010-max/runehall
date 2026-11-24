import type { SceneDrawing } from "./types";

/** Maximum number of strokes persisted on one scene. */
export const DRAWING_LIMIT = 300;
/** Maximum number of points in one freehand stroke. */
export const DRAWING_POINT_LIMIT = 1_000;

export const DRAWING_COLORS = [
  "#f4c96b",
  "#f4f1de",
  "#7cc4ff",
  "#8fd694",
  "#f08a8a",
  "#c79bf2",
] as const;

export const DRAWING_WIDTHS = [3, 6, 12] as const;

const DEFAULT_COLOR = DRAWING_COLORS[0];
const DEFAULT_WIDTH = DRAWING_WIDTHS[1];

function finite(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function rounded(value: number): number {
  return Math.round(value * 10) / 10;
}

export function normalizeDrawingColor(value: unknown): string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value.trim())
    ? value.trim().toLowerCase()
    : DEFAULT_COLOR;
}

export function normalizeSceneDrawing(
  value: unknown,
  sceneWidth: number,
  sceneHeight: number
): SceneDrawing | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id.trim().slice(0, 80) : "";
  if (!id) return null;

  const widthLimit = Math.max(1, finite(sceneWidth, 10_000));
  const heightLimit = Math.max(1, finite(sceneHeight, 10_000));
  const rawPoints = Array.isArray(record.points) ? record.points : [];
  const points: number[] = [];
  for (let index = 0; index + 1 < rawPoints.length; index += 2) {
    if (points.length >= DRAWING_POINT_LIMIT * 2) break;
    const x = finite(rawPoints[index], Number.NaN);
    const y = finite(rawPoints[index + 1], Number.NaN);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const px = rounded(clamp(x, 0, widthLimit));
    const py = rounded(clamp(y, 0, heightLimit));
    const lastX = points[points.length - 2];
    const lastY = points[points.length - 1];
    if (lastX !== undefined && lastY !== undefined) {
      if (Math.abs(px - lastX) < 0.5 && Math.abs(py - lastY) < 0.5) continue;
    }
    points.push(px, py);
  }
  if (points.length < 2) return null;

  const ownerId = typeof record.ownerId === "string" ? record.ownerId.trim().slice(0, 120) : "";
  const ownerName =
    typeof record.ownerName === "string" && record.ownerName.trim()
      ? record.ownerName.trim().slice(0, 80)
      : "Player";

  return {
    id,
    ownerId,
    ownerName,
    points,
    color: normalizeDrawingColor(record.color),
    width: clamp(Math.round(finite(record.width, DEFAULT_WIDTH)), 1, 24),
    createdAt: Math.max(0, Math.round(finite(record.createdAt))),
  };
}

export function normalizeSceneDrawings(
  value: unknown,
  sceneWidth: number,
  sceneHeight: number
): SceneDrawing[] {
  if (!Array.isArray(value)) return [];
  const drawings: SceneDrawing[] = [];
  const seen = new Set<string>();
  for (const entry of value.slice(-DRAWING_LIMIT)) {
    const drawing = normalizeSceneDrawing(entry, sceneWidth, sceneHeight);
    if (!drawing || seen.has(drawing.id)) continue;
    seen.add(drawing.id);
    drawings.push(drawing);
  }
  return drawings;
}

/** The GM can erase any drawing; players may only erase their own. */
export function canEraseDrawing(
  drawing: Pick<SceneDrawing, "ownerId">,
  userId: string,
  isGm: boolean
): boolean {
  return isGm || (Boolean(userId) && drawing.ownerId === userId);
}

function distanceToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) return Math.hypot(px - x1, py - y1);
  const t = clamp(((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy), 0, 1);
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/** Hit-test a stroke for the eraser, including its painted width. */
export function drawingHitByPoint(
  drawing: Pick<SceneDrawing, "points" | "width">,
  x: number,
  y: number,
  tolerance: number
): boolean {
  const points = drawing.points;
  if (points.length < 2) return false;
  const reach = Math.max(2, tolerance) + Math.max(1, drawing.width) / 2;
  if (points.length === 2) return Math.hypot(x - points[0], y - points[1]) <= reach;
  for (let index = 0; index + 3 < points.length; index += 2) {
    if (
      distanceToSegment(
        x,
        y,
        points[index],
        points[index + 1],
        points[index + 2],
        points[index + 3]
      ) <= reach
    ) {
      return true;
    }
  }
  return false;
}
