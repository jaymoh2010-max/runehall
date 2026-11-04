export type RevisionAction = "ignore" | "apply" | "refetch";

/**
 * Decide what to do with an incoming campaign revision.
 *
 * - A revision at or below the current one is stale or duplicated.
 * - The next revision is safe to apply locally.
 * - A jump means at least one event was missed, so the authoritative snapshot
 *   should be fetched instead of trusting local state.
 */
export function revisionAction(current: number, incoming: number): RevisionAction {
  if (!Number.isFinite(incoming) || incoming <= current) return "ignore";
  if (incoming > current + 1) return "refetch";
  return "apply";
}
