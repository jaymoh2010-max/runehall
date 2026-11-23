import { useEffect, useState } from "react";
import type { ConditionRef } from "../shared/types";
import { api } from "./api";

let cached: ConditionRef[] | null = null;
let pending: Promise<ConditionRef[]> | null = null;

/**
 * The condition list is small and static. Cache it so opening a sheet and a
 * token panel does not refetch the compendium each time.
 */
export function loadConditionOptions(): Promise<ConditionRef[]> {
  if (cached) return Promise.resolve(cached);
  if (!pending) {
    pending = api<{ items: ConditionRef[] }>("/api/compendium/conditions")
      .then((result) => {
        cached = result.items;
        return result.items;
      })
      .catch(() => {
        pending = null;
        return [];
      });
  }
  return pending;
}

export function useConditionOptions(): ConditionRef[] {
  const [conditions, setConditions] = useState<ConditionRef[]>(cached ?? []);

  useEffect(() => {
    let cancelled = false;
    void loadConditionOptions().then((items) => {
      if (!cancelled) setConditions(items);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return conditions;
}
