import { useEffect, useState } from "react";
import type { Affliction } from "../../../shared/types";
import { api } from "../../api";
import { errorMessage } from "../../stores";
import { Button, Input, Modal, Spinner, Tag } from "../ui";

type AfflictionCategory = "all" | "poison" | "disease" | "curse";

const CATEGORY_LABELS: Record<AfflictionCategory, string> = {
  all: "All",
  poison: "Poison",
  disease: "Disease",
  curse: "Curse",
};

function categoryLabel(category: Affliction["category"]): string {
  return category === "disease" ? "Disease" : category === "curse" ? "Curse" : "Poison";
}

function plainText(value: string): string {
  return String(value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stageSummary(affliction: Affliction): string {
  const first = affliction.stages?.[0];
  if (!first) return affliction.savingThrow || "No stages recorded.";
  const text = plainText(first);
  return text.length > 110 ? `${text.slice(0, 107)}...` : text;
}

export function AfflictionPicker({
  open,
  onClose,
  onSelect,
  initialQuery = "",
  elevated = false,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (affliction: Affliction) => void;
  initialQuery?: string;
  elevated?: boolean;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState<AfflictionCategory>("all");
  const [items, setItems] = useState<Affliction[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setQuery(initialQuery);
  }, [open, initialQuery]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({
          q: query.trim(),
          limit: "60",
          legacy: "1",
        });
        if (category !== "all") params.set("category", category);
        const result = await api<{ items: Affliction[]; total?: number }>(
          `/api/compendium/afflictions?${params.toString()}`
        );
        if (cancelled) return;
        setItems(result.items ?? []);
        setTotal(result.total ?? result.items?.length ?? 0);
      } catch (err) {
        if (!cancelled) setError(errorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 160);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, query, category]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add from compendium"
      subtitle="Choose a published affliction to prefill the recovery tracker. Stage effects stay manual."
      elevated={elevated}
      wide
      footer={
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="stack">
        <div className="pb-search-row">
          <Input
            autoFocus
            value={query}
            placeholder="Search poisons, diseases, and curses"
            aria-label="Search compendium afflictions"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="chip-row">
          {(Object.keys(CATEGORY_LABELS) as AfflictionCategory[]).map((id) => (
            <Button
              key={id}
              size="sm"
              variant={category === id ? "secondary" : "ghost"}
              aria-pressed={category === id}
              onClick={() => setCategory(id)}
            >
              {CATEGORY_LABELS[id]}
            </Button>
          ))}
        </div>
        {loading ? (
          <div className="picker-empty">
            <Spinner />
          </div>
        ) : error ? (
          <p className="pb-error">{error}</p>
        ) : items.length ? (
          <>
            <div className="picker-scroll" style={{ maxHeight: "46vh" }}>
              {items.map((affliction) => (
                <button
                  key={affliction.id}
                  type="button"
                  className="picker-item"
                  onClick={() => onSelect(affliction)}
                >
                  <span className="picker-item-main">
                    <span className="picker-item-name">{affliction.name}</span>
                    <span className="picker-item-sub">
                      {categoryLabel(affliction.category)} · level {affliction.level} ·{" "}
                      {affliction.source}
                    </span>
                    <span className="picker-item-sub">{stageSummary(affliction)}</span>
                  </span>
                  <span className="picker-item-tags">
                    {affliction.onset ? <Tag>Onset {affliction.onset}</Tag> : null}
                    {affliction.duration ? <Tag>{affliction.duration}</Tag> : null}
                  </span>
                </button>
              ))}
            </div>
            <p className="pb-hint">
              Showing {items.length.toLocaleString()} of {total.toLocaleString()}.
            </p>
          </>
        ) : (
          <p className="pb-empty">
            No compendium afflictions match. Use the manual form to record a custom poison, disease,
            or curse.
          </p>
        )}
      </div>
    </Modal>
  );
}
