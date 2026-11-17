import type { Scene, Wall } from "./types";
import { wallBlocksSight } from "./walls";

export interface VisionPoint {
  x: number;
  y: number;
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

export function hasLineOfSight(from: VisionPoint, to: VisionPoint, walls: Wall[]): boolean {
  for (const wall of walls) {
    if (!wallBlocksSight(wall)) continue;
    if (segmentsIntersect(from.x, from.y, to.x, to.y, wall.x1, wall.y1, wall.x2, wall.y2)) {
      return false;
    }
  }
  return true;
}

export interface VisibleCellsOptions {
  /** Maximum sight distance in scene pixels. Defaults to 24 grid squares. */
  maxDistance?: number;
}

/**
 * Grid-cell line of sight for the shared party view. A cell is visible when
 * its center has an unobstructed line from at least one party token.
 */
export function visibleCells(
  scene: Pick<Scene, "width" | "height" | "gridSize" | "gridOffsetX" | "gridOffsetY">,
  walls: Wall[],
  origins: VisionPoint[],
  options: VisibleCellsOptions = {}
): Set<string> {
  const grid = Math.max(1, scene.gridSize);
  const cols = Math.max(1, Math.ceil(scene.width / grid));
  const rows = Math.max(1, Math.ceil(scene.height / grid));
  const maxDistance = Math.max(grid, options.maxDistance ?? grid * 24);
  const blocking = walls.filter(wallBlocksSight);
  const result = new Set<string>();
  if (!origins.length) return result;

  for (const origin of origins) {
    const minCx = Math.max(0, Math.floor((origin.x - maxDistance - scene.gridOffsetX) / grid));
    const maxCx = Math.min(
      cols - 1,
      Math.ceil((origin.x + maxDistance - scene.gridOffsetX) / grid)
    );
    const minCy = Math.max(0, Math.floor((origin.y - maxDistance - scene.gridOffsetY) / grid));
    const maxCy = Math.min(
      rows - 1,
      Math.ceil((origin.y + maxDistance - scene.gridOffsetY) / grid)
    );
    for (let cy = minCy; cy <= maxCy; cy++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        if (result.has(`${cx},${cy}`)) continue;
        const point = {
          x: scene.gridOffsetX + (cx + 0.5) * grid,
          y: scene.gridOffsetY + (cy + 0.5) * grid,
        };
        if (Math.hypot(point.x - origin.x, point.y - origin.y) > maxDistance) continue;
        if (hasLineOfSight(origin, point, blocking)) result.add(`${cx},${cy}`);
      }
    }
  }
  return result;
}
