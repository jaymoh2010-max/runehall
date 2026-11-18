import type { SceneProp } from "./types";

export interface CollisionRect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface CollisionToken {
  size: number;
}

/**
 * Axis-aligned bounds for a possibly rotated prop. Rotation is approximated by
 * the smallest axis-aligned box, which is conservative and predictable on a
 * square grid.
 */
export function propBounds(
  prop: Pick<SceneProp, "x" | "y" | "width" | "height" | "rotation">
): CollisionRect {
  const radians = (prop.rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));
  const halfWidth = prop.width / 2;
  const halfHeight = prop.height / 2;
  const halfX = halfWidth * cos + halfHeight * sin;
  const halfY = halfWidth * sin + halfHeight * cos;
  return {
    x1: prop.x - halfX,
    y1: prop.y - halfY,
    x2: prop.x + halfX,
    y2: prop.y + halfY,
  };
}

export function tokenBounds(
  token: CollisionToken,
  x: number,
  y: number,
  gridSize: number
): CollisionRect {
  const half = (Math.max(1, token.size) * gridSize) / 2;
  return { x1: x - half, y1: y - half, x2: x + half, y2: y + half };
}

export function rectsOverlap(a: CollisionRect, b: CollisionRect): boolean {
  return a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1;
}

/**
 * Returns the first prop that blocks a straight-line token move, or null.
 * Props already overlapping the token's starting position are ignored so a
 * token can escape if collision was enabled after it was placed.
 */
export function blockingPropForMove(
  props: SceneProp[],
  token: CollisionToken,
  from: { x: number; y: number },
  to: { x: number; y: number },
  gridSize: number,
  enabled: boolean
): SceneProp | null {
  if (!enabled || !props.length) return null;
  const startBounds = tokenBounds(token, from.x, from.y, gridSize);
  const candidates = props
    .map((prop) => ({ prop, bounds: propBounds(prop) }))
    .filter((entry) => !rectsOverlap(startBounds, entry.bounds));
  if (!candidates.length) return null;

  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const steps = Math.max(1, Math.min(240, Math.ceil(distance / Math.max(4, gridSize / 4))));
  for (let step = 1; step <= steps; step++) {
    const ratio = step / steps;
    const bounds = tokenBounds(
      token,
      from.x + (to.x - from.x) * ratio,
      from.y + (to.y - from.y) * ratio,
      gridSize
    );
    for (const entry of candidates) {
      if (rectsOverlap(bounds, entry.bounds)) return entry.prop;
    }
  }
  return null;
}
