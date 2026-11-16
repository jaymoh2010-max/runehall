import { measureGridDistance, type GridMeasurement } from "./measurement";

export interface MovementState {
  /** Feet moved during the current turn. */
  movementUsed: number;
  /** Diagonal steps taken during the current turn. */
  diagonalSteps: number;
}

export interface MovementUpdate extends MovementState {
  step: GridMeasurement;
  /** True when this move pushed the total past the supplied Speed. */
  overSpeed: boolean;
}

export function emptyMovement(): MovementState {
  return { movementUsed: 0, diagonalSteps: 0 };
}

/**
 * Add a straight-line grid move to the current turn's movement.
 *
 * The diagonal count carries across separate moves in the same turn, which is
 * what PF2e requires for the alternating 5/10-foot diagonal cost.
 */
export function applyGridMovement(
  current: MovementState,
  dx: number,
  dy: number,
  gridSize: number,
  speed?: number | null
): MovementUpdate {
  const step = measureGridDistance(dx, dy, gridSize, {
    diagonalStart: Math.max(0, Math.round(current.diagonalSteps)),
  });
  const movementUsed = Math.max(0, Math.round(current.movementUsed + step.feet));
  const diagonalSteps = Math.max(0, Math.round(current.diagonalSteps + step.diagonals));
  return {
    movementUsed,
    diagonalSteps,
    step,
    overSpeed: typeof speed === "number" && Number.isFinite(speed) && movementUsed > speed,
  };
}
