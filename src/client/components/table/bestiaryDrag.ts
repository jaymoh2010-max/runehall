import type { Monster } from "../../../shared/types";

export const BESTIARY_DRAG_TYPE = "application/x-runehall-bestiary";

export interface BestiaryDragPayload {
  monster: Monster;
  count: number;
}
