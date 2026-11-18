import {
  blockingPropForMove,
  propBounds,
  rectsOverlap,
  tokenBounds,
  type CollisionRect,
} from "./collision";
import { measureGridDistance } from "./measurement";
import type { SceneProp } from "./types";

export interface PathPoint {
  x: number;
  y: number;
}

export interface PathfindingInput {
  props: SceneProp[];
  propCollision: boolean;
  gridSize: number;
  gridOffsetX: number;
  gridOffsetY: number;
  width: number;
  height: number;
  tokenSize: number;
  from: PathPoint;
  to: PathPoint;
  /**
   * Movement available for this move in feet. Null or omitted means the token
   * can use as much movement as the path needs.
   */
  budget?: number | null;
  /** Diagonal steps already taken this turn, for PF2e's alternating 5/10 cost. */
  diagonalStart?: number;
}

export interface PathfindingResult {
  /** Waypoints after the start, ending at the furthest reachable square. */
  points: PathPoint[];
  /** Movement cost of the returned path in feet. */
  feet: number;
  /** Diagonal steps in the returned path. */
  diagonals: number;
  /** True when the path reaches the destination square. */
  reachedGoal: boolean;
  /** True when the straight line to the destination was blocked by a prop. */
  detoured: boolean;
  /** True when no amount of movement would reach the destination. */
  unreachable: boolean;
}

interface Grid {
  size: number;
  offsetX: number;
  offsetY: number;
  cols: number;
  rows: number;
  half: number;
  minCol: number;
  maxCol: number;
  minRow: number;
  maxRow: number;
}

interface SearchResult {
  /** Cell indices from the start to the chosen endpoint. */
  cells: number[];
  cost: number;
  reachedGoal: boolean;
}

const FEET_PER_SQUARE = 5;
const MAX_EXPANSIONS = 60_000;

function finite(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function buildGrid(input: PathfindingInput): Grid | null {
  const size = Math.max(1, finite(input.gridSize, 70));
  const half = (Math.max(1, finite(input.tokenSize, 1)) * size) / 2;
  const cols = Math.max(1, Math.ceil(finite(input.width, 0) / size));
  const rows = Math.max(1, Math.ceil(finite(input.height, 0) / size));
  const minCol = Math.max(0, Math.ceil((half - finite(input.gridOffsetX)) / size - 0.5));
  const maxCol = Math.min(
    cols - 1,
    Math.floor((finite(input.width) - half - finite(input.gridOffsetX)) / size - 0.5)
  );
  const minRow = Math.max(0, Math.ceil((half - finite(input.gridOffsetY)) / size - 0.5));
  const maxRow = Math.min(
    rows - 1,
    Math.floor((finite(input.height) - half - finite(input.gridOffsetY)) / size - 0.5)
  );
  if (maxCol < minCol || maxRow < minRow) return null;
  return {
    size,
    offsetX: finite(input.gridOffsetX),
    offsetY: finite(input.gridOffsetY),
    cols,
    rows,
    half,
    minCol,
    maxCol,
    minRow,
    maxRow,
  };
}

function cellCenter(grid: Grid, cell: number): PathPoint {
  const col = cell % grid.cols;
  const row = Math.floor(cell / grid.cols);
  return {
    x: grid.offsetX + (col + 0.5) * grid.size,
    y: grid.offsetY + (row + 0.5) * grid.size,
  };
}

function cellForPoint(grid: Grid, point: PathPoint): number {
  const col = Math.max(
    grid.minCol,
    Math.min(grid.maxCol, Math.round((point.x - grid.offsetX - grid.size / 2) / grid.size))
  );
  const row = Math.max(
    grid.minRow,
    Math.min(grid.maxRow, Math.round((point.y - grid.offsetY - grid.size / 2) / grid.size))
  );
  return row * grid.cols + col;
}

function chebyshev(a: number, b: number, cols: number): number {
  const ax = a % cols;
  const ay = Math.floor(a / cols);
  const bx = b % cols;
  const by = Math.floor(b / cols);
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

/** Squared grid distance, used to pick the closest reachable square. */
function distanceSquared(a: number, b: number, cols: number): number {
  const ax = a % cols;
  const ay = Math.floor(a / cols);
  const bx = b % cols;
  const by = Math.floor(b / cols);
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

/** Small binary heap ordered by f, then h, then node id for deterministic ties. */
class NodeHeap {
  private nodes: number[] = [];
  private scores: number[] = [];
  private heuristics: number[] = [];

  get size(): number {
    return this.nodes.length;
  }

  private before(i: number, j: number): boolean {
    if (this.scores[i] !== this.scores[j]) return this.scores[i] < this.scores[j];
    if (this.heuristics[i] !== this.heuristics[j]) return this.heuristics[i] < this.heuristics[j];
    return this.nodes[i] < this.nodes[j];
  }

  private swap(i: number, j: number): void {
    [this.nodes[i], this.nodes[j]] = [this.nodes[j], this.nodes[i]];
    [this.scores[i], this.scores[j]] = [this.scores[j], this.scores[i]];
    [this.heuristics[i], this.heuristics[j]] = [this.heuristics[j], this.heuristics[i]];
  }

  push(node: number, score: number, heuristic: number): void {
    this.nodes.push(node);
    this.scores.push(score);
    this.heuristics.push(heuristic);
    let index = this.nodes.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (!this.before(index, parent)) break;
      this.swap(index, parent);
      index = parent;
    }
  }

  pop(): number {
    const top = this.nodes[0];
    const last = this.nodes.length - 1;
    this.swap(0, last);
    this.nodes.pop();
    this.scores.pop();
    this.heuristics.pop();
    let index = 0;
    for (;;) {
      const left = index * 2 + 1;
      const right = left + 1;
      let smallest = index;
      if (left < this.nodes.length && this.before(left, smallest)) smallest = left;
      if (right < this.nodes.length && this.before(right, smallest)) smallest = right;
      if (smallest === index) break;
      this.swap(index, smallest);
      index = smallest;
    }
    return top;
  }
}

function markBlockedCells(blocked: Uint8Array, grid: Grid, bounds: CollisionRect): void {
  const x1 = bounds.x1 - grid.half;
  const x2 = bounds.x2 + grid.half;
  const y1 = bounds.y1 - grid.half;
  const y2 = bounds.y2 + grid.half;
  const minCol = Math.max(0, Math.floor((x1 - grid.offsetX) / grid.size - 0.5) + 1);
  const maxCol = Math.min(grid.cols - 1, Math.ceil((x2 - grid.offsetX) / grid.size - 0.5) - 1);
  const minRow = Math.max(0, Math.floor((y1 - grid.offsetY) / grid.size - 0.5) + 1);
  const maxRow = Math.min(grid.rows - 1, Math.ceil((y2 - grid.offsetY) / grid.size - 0.5) - 1);
  if (minCol > maxCol || minRow > maxRow) return;
  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      blocked[row * grid.cols + col] = 1;
    }
  }
}

function searchPath(
  grid: Grid,
  blocked: Uint8Array,
  startCell: number,
  goalCell: number,
  startParity: number
): SearchResult {
  const stateCount = grid.cols * grid.rows * 2;
  const gScore = new Float64Array(stateCount).fill(Infinity);
  const cameFrom = new Int32Array(stateCount).fill(-1);
  const visited = new Uint8Array(stateCount);
  const heap = new NodeHeap();

  const startNode = startCell * 2 + startParity;
  gScore[startNode] = 0;
  heap.push(startNode, FEET_PER_SQUARE * chebyshev(startCell, goalCell, grid.cols), 0);

  let bestNode = startNode;
  let bestDistance = distanceSquared(startCell, goalCell, grid.cols);
  let bestCost = 0;
  let reachedGoal = false;
  let expansions = 0;

  while (heap.size && expansions < MAX_EXPANSIONS) {
    const node = heap.pop();
    if (visited[node]) continue;
    visited[node] = 1;
    expansions++;
    const cell = Math.floor(node / 2);
    const parity = node % 2;
    const cost = gScore[node];

    const distance = distanceSquared(cell, goalCell, grid.cols);
    if (distance < bestDistance || (distance === bestDistance && cost < bestCost)) {
      bestNode = node;
      bestDistance = distance;
      bestCost = cost;
    }

    if (cell === goalCell) {
      bestNode = node;
      bestCost = cost;
      reachedGoal = true;
      break;
    }

    const col = cell % grid.cols;
    const row = Math.floor(cell / grid.cols);
    for (let dc = -1; dc <= 1; dc++) {
      for (let dr = -1; dr <= 1; dr++) {
        if (!dc && !dr) continue;
        const nextCol = col + dc;
        const nextRow = row + dr;
        if (
          nextCol < grid.minCol ||
          nextCol > grid.maxCol ||
          nextRow < grid.minRow ||
          nextRow > grid.maxRow
        ) {
          continue;
        }
        const diagonal = dc !== 0 && dr !== 0;
        if (
          diagonal &&
          (blocked[row * grid.cols + nextCol] || blocked[nextRow * grid.cols + col])
        ) {
          continue;
        }
        const nextCell = nextRow * grid.cols + nextCol;
        if (blocked[nextCell]) continue;

        const stepCost = diagonal
          ? parity === 0
            ? FEET_PER_SQUARE
            : FEET_PER_SQUARE * 2
          : FEET_PER_SQUARE;
        const nextCost = cost + stepCost;
        const nextParity = diagonal ? 1 - parity : parity;
        const nextNode = nextCell * 2 + nextParity;
        if (nextCost >= gScore[nextNode] - 1e-9) continue;

        gScore[nextNode] = nextCost;
        cameFrom[nextNode] = node;
        const heuristic = FEET_PER_SQUARE * chebyshev(nextCell, goalCell, grid.cols);
        heap.push(nextNode, nextCost + heuristic, heuristic);
      }
    }
  }

  const cells: number[] = [];
  for (let node = bestNode; node >= 0; node = cameFrom[node]) {
    cells.push(Math.floor(node / 2));
    if (cells.length > grid.cols * grid.rows) break;
  }
  cells.reverse();
  return { cells, cost: bestCost, reachedGoal };
}

interface TruncatedPath {
  cells: number[];
  cost: number;
  reachedEnd: boolean;
}

/** Cuts a full path at the last square the movement budget can pay for. */
function truncateCells(
  grid: Grid,
  cells: number[],
  startParity: number,
  budget: number
): TruncatedPath {
  let cost = 0;
  let parity = startParity;
  let end = 0;
  for (let index = 1; index < cells.length; index++) {
    const previous = cells[index - 1];
    const current = cells[index];
    const previousCol = previous % grid.cols;
    const previousRow = Math.floor(previous / grid.cols);
    const currentCol = current % grid.cols;
    const currentRow = Math.floor(current / grid.cols);
    const diagonal = previousCol !== currentCol && previousRow !== currentRow;
    const stepCost = diagonal
      ? parity === 0
        ? FEET_PER_SQUARE
        : FEET_PER_SQUARE * 2
      : FEET_PER_SQUARE;
    if (cost + stepCost > budget + 1e-9) break;
    cost += stepCost;
    if (diagonal) parity = 1 - parity;
    end = index;
  }
  return { cells: cells.slice(0, end + 1), cost, reachedEnd: end === cells.length - 1 };
}

/**
 * Finds the shortest PF2e grid path from `from` to `to`, routing around props
 * that block movement. When a movement budget is supplied, the shortest route
 * is followed as far as the remaining Speed can pay for, leaving the token on
 * the last square it can afford.
 */
export function findPathAroundProps(input: PathfindingInput): PathfindingResult {
  const size = Math.max(1, finite(input.tokenSize, 1));
  const gridSize = Math.max(1, finite(input.gridSize, 70));
  const diagonalStart = Math.max(0, Math.round(finite(input.diagonalStart)));
  const budget =
    input.budget === undefined || input.budget === null
      ? Infinity
      : Math.max(0, finite(input.budget));
  const from = { x: finite(input.from?.x), y: finite(input.from?.y) };
  const to = { x: finite(input.to?.x), y: finite(input.to?.y) };

  const direct = measureGridDistance(to.x - from.x, to.y - from.y, gridSize, {
    diagonalStart,
  });
  const blocker = input.propCollision
    ? blockingPropForMove(input.props, { size }, from, to, gridSize, true)
    : null;

  if (!blocker && direct.feet <= budget) {
    return {
      points: direct.feet > 0 ? [to] : [],
      feet: direct.feet,
      diagonals: direct.diagonals,
      reachedGoal: true,
      detoured: false,
      unreachable: false,
    };
  }

  const grid = buildGrid({ ...input, tokenSize: size, gridSize });
  if (!grid) {
    return {
      points: [],
      feet: 0,
      diagonals: 0,
      reachedGoal: false,
      detoured: Boolean(blocker),
      unreachable: true,
    };
  }

  const startCell = cellForPoint(grid, from);
  const goalCell = cellForPoint(grid, to);
  const blocked = new Uint8Array(grid.cols * grid.rows);
  const startBounds = tokenBounds({ size }, from.x, from.y, gridSize);
  for (const prop of input.props ?? []) {
    const bounds = propBounds(prop);
    if (rectsOverlap(startBounds, bounds)) continue;
    markBlockedCells(blocked, grid, bounds);
  }

  if (startCell === goalCell) {
    return {
      points: [],
      feet: 0,
      diagonals: 0,
      reachedGoal: true,
      detoured: Boolean(blocker),
      unreachable: false,
    };
  }

  const startParity = diagonalStart % 2;
  const main = searchPath(grid, blocked, startCell, goalCell, startParity);
  const unreachable = !main.reachedGoal;

  if (!main.cells.length || (main.cells.length === 1 && unreachable)) {
    return {
      points: [],
      feet: 0,
      diagonals: 0,
      reachedGoal: false,
      detoured: Boolean(blocker),
      unreachable,
    };
  }

  const truncated = truncateCells(grid, main.cells, startParity, budget);
  const points = truncated.cells.slice(1).map((cell) => cellCenter(grid, cell));
  let diagonals = 0;
  for (let index = 1; index < truncated.cells.length; index++) {
    const previous = truncated.cells[index - 1];
    const current = truncated.cells[index];
    const previousCol = previous % grid.cols;
    const previousRow = Math.floor(previous / grid.cols);
    const currentCol = current % grid.cols;
    const currentRow = Math.floor(current / grid.cols);
    if (previousCol !== currentCol && previousRow !== currentRow) diagonals++;
  }

  return {
    points,
    feet: truncated.cost,
    diagonals,
    reachedGoal: main.reachedGoal && truncated.reachedEnd,
    detoured: Boolean(blocker),
    unreachable,
  };
}
