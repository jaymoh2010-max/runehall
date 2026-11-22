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
    hidden: record.hidden === true,
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

/** Walls and closed doors block movement. Open doors do not. */
export function wallBlocksMovement(wall: Wall): boolean {
  return wall.kind === "wall" || !wall.open;
}

/** Walls and closed doors block sight. Open doors do not. */
export function wallBlocksSight(wall: Wall): boolean {
  return wallBlocksMovement(wall);
}

function cross(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx;
}

function onSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): boolean {
  return (
    px >= Math.min(ax, bx) - 0.001 &&
    px <= Math.max(ax, bx) + 0.001 &&
    py >= Math.min(ay, by) - 0.001 &&
    py <= Math.max(ay, by) + 0.001
  );
}

/** Inclusive segment intersection, including collinear endpoint touches. */
export function segmentsIntersect(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number
): boolean {
  const d1 = cross(bx - ax, by - ay, cx - ax, cy - ay);
  const d2 = cross(bx - ax, by - ay, dx - ax, dy - ay);
  const d3 = cross(dx - cx, dy - cy, ax - cx, ay - cy);
  const d4 = cross(dx - cx, dy - cy, bx - cx, by - cy);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }
  if (Math.abs(d1) < 0.001 && onSegment(cx, cy, ax, ay, bx, by)) return true;
  if (Math.abs(d2) < 0.001 && onSegment(dx, dy, ax, ay, bx, by)) return true;
  if (Math.abs(d3) < 0.001 && onSegment(ax, ay, cx, cy, dx, dy)) return true;
  if (Math.abs(d4) < 0.001 && onSegment(bx, by, cx, cy, dx, dy)) return true;
  return false;
}

/**
 * Returns the first wall or closed door that a straight move crosses, or null.
 * AABB rejection keeps this cheap inside the pathfinder's neighbour loop.
 */
export function blockingWallForMove(
  walls: Wall[],
  from: { x: number; y: number },
  to: { x: number; y: number },
  enabled = true
): Wall | null {
  if (!enabled || !walls.length) return null;
  const minX = Math.min(from.x, to.x) - 0.001;
  const maxX = Math.max(from.x, to.x) + 0.001;
  const minY = Math.min(from.y, to.y) - 0.001;
  const maxY = Math.max(from.y, to.y) + 0.001;
  for (const wall of walls) {
    if (!wallBlocksMovement(wall)) continue;
    if (Math.max(wall.x1, wall.x2) < minX) continue;
    if (Math.min(wall.x1, wall.x2) > maxX) continue;
    if (Math.max(wall.y1, wall.y2) < minY) continue;
    if (Math.min(wall.y1, wall.y2) > maxY) continue;
    if (segmentsIntersect(from.x, from.y, to.x, to.y, wall.x1, wall.y1, wall.x2, wall.y2)) {
      return wall;
    }
  }
  return null;
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
