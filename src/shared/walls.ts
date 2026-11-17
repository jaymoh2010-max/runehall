import type { Wall, WallKind } from "./types";

export const WALL_LIMIT = 500;

function finite(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function normalizeWall(value: unknown): Wall | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id.trim().slice(0, 80) : "";
  if (!id) return null;
  const kind: WallKind = record.kind === "door" ? "door" : "wall";
  const wall: Wall = {
    id,
    x1: finite(record.x1),
    y1: finite(record.y1),
    x2: finite(record.x2),
    y2: finite(record.y2),
    kind,
  };
  if (kind === "door") wall.open = record.open === true;
  return wall;
}

export function normalizeWalls(value: unknown): Wall[] {
  if (!Array.isArray(value)) return [];
  const walls: Wall[] = [];
  const seen = new Set<string>();
  for (const entry of value.slice(0, WALL_LIMIT)) {
    const wall = normalizeWall(entry);
    if (!wall || seen.has(wall.id)) continue;
    seen.add(wall.id);
    walls.push(wall);
  }
  return walls;
}

/** Walls and closed doors block sight. Open doors do not. */
export function wallBlocksSight(wall: Wall): boolean {
  return wall.kind === "wall" || !wall.open;
}

/** Distance from a point to a line segment, used for wall hit-testing. */
export function distanceToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSq));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

export function nearestWall(walls: Wall[], x: number, y: number, maxDistance: number): Wall | null {
  let best: Wall | null = null;
  let bestDistance = maxDistance;
  for (const wall of walls) {
    const distance = distanceToSegment(x, y, wall.x1, wall.y1, wall.x2, wall.y2);
    if (distance <= bestDistance) {
      best = wall;
      bestDistance = distance;
    }
  }
  return best;
}
