export interface GridMeasureOptions {
  /**
   * Treat every diagonal step as 5 feet instead of the standard PF2e
   * alternating 5/10-foot cost. This is an optional table variant.
   */
  uniformDiagonals?: boolean;
  /**
   * Number of diagonal steps already taken this turn. PF2e tracks diagonal
   * movement across a turn, so a caller that tracks that state can pass it in.
   * The ruler starts a fresh count when omitted.
   */
  diagonalStart?: number;
}

export interface GridMeasurement {
  /** Squares along the ruler's longer axis. */
  squares: number;
  /** Movement cost in feet, using PF2e's 5-foot grid. */
  feet: number;
  /** Grid squares crossed horizontally. */
  columns: number;
  /** Grid squares crossed vertically. */
  rows: number;
  /** Diagonal steps in the ruler. */
  diagonals: number;
  /** Straight steps in the ruler. */
  straight: number;
  usesDiagonals: boolean;
}

const FEET_PER_SQUARE = 5;

function safeNumber(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

/**
 * Measures a grid displacement in PF2e squares and feet.
 *
 * The first diagonal step costs 5 feet, the second 10 feet, and the cost
 * alternates thereafter. For example, four diagonal squares cost
 * 5 + 10 + 5 + 10 = 30 feet. Straight steps always cost 5 feet.
 */
export function measureGridDistance(
  dx: number,
  dy: number,
  gridSize: number,
  options: GridMeasureOptions = {}
): GridMeasurement {
  const size = Number.isFinite(gridSize) && gridSize > 0 ? gridSize : 1;
  const columns = Math.max(0, Math.round(Math.abs(safeNumber(dx)) / size));
  const rows = Math.max(0, Math.round(Math.abs(safeNumber(dy)) / size));
  const diagonals = Math.min(columns, rows);
  const straight = Math.abs(columns - rows);
  const squares = Math.max(columns, rows);

  const diagonalStart = Math.max(0, Math.floor(safeNumber(options.diagonalStart ?? 0)));
  const diagonalFeet = options.uniformDiagonals
    ? diagonals * FEET_PER_SQUARE
    : FEET_PER_SQUARE * diagonals +
      FEET_PER_SQUARE *
        (Math.floor((diagonalStart + diagonals) / 2) - Math.floor(diagonalStart / 2));

  return {
    squares,
    feet: straight * FEET_PER_SQUARE + diagonalFeet,
    columns,
    rows,
    diagonals,
    straight,
    usesDiagonals: diagonals > 0,
  };
}
