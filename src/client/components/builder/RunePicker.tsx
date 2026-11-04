import { useEffect, useMemo, useState } from "react";
import { Check, Coins, Search, Sparkles, X } from "lucide-react";
import type { CharacterEquipment, ContentMode, Equipment } from "../../../shared/types";
import {
  attachRuneIds,
  propertyRuneCount,
  propertyRuneSlots,
  runeCategory,
  runeUsageForTarget,
} from "../../../shared/runes";
import { api, formatCp } from "../../api";
import { errorMessage } from "../../stores";
import { Button, Input, Modal, RichText, Spinner, Tag, Toggle } from "../ui";
import { ContentSourceToggle, ContentTierTag } from "./ContentSourceToggle";

interface RunePickerProps {
  open: boolean;
  onClose: () => void;
  item: Equipment | null;
  entry: CharacterEquipment | null;
  equipment: Record<string, Equipment>;
  level: number;
  expanded: boolean;
  onExpandedChange: (mode: ContentMode) => void;
  contentModeLocked?: boolean;
  legacyDefault?: boolean;
  legacyLocked?: boolean;
  onLegacyChange?: (value: boolean) => void;
  onChange: (runes: string[]) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  weaponPotency: "Weapon potency",
  striking: "Striking",
  armorPotency: "Armor potency",
  resilient: "Resilient",
  shield: "Shield",
  property: "Property",
};

export function RunePicker({
  open,
  onClose,
  item,
  entry,
  equipment,
  level,
  expanded,
  onExpandedChange,
  contentModeLocked,
  legacyDefault,
  legacyLocked,
  onLegacyChange,
  onChange,
}: RunePickerProps) {
  const [query, setQuery] = useState("");
  const [legacy, setLegacy] = useState(Boolean(legacyDefault));
  const [items, setItems] = useState<Equipment[]>([]);
  const [selected, setSelected] = useState<Equipment | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const usage = runeUsageForTarget(item);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelected(null);
    setNotice("");
  }, [open, item?.id]);

  useEffect(() => {
    setLegacy(Boolean(legacyDefault));
  }, [legacyDefault]);

  useEffect(() => {
    setSelected(null);
  }, [expanded, legacy]);

  useEffect(() => {
    if (!open || !usage) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams();
        params.set("usage", usage);
        params.set("limit", "120");
        params.set("levelMax", String(level + 2));
        params.set("legacy", legacy ? "1" : "0");
        if (!expanded) params.set("core", "1");
        if (query.trim()) params.set("q", query.trim());
        const result = await api<{ items: Equipment[] }>(`/api/compendium/equipment?${params.toString()}`);
        if (!cancelled) setItems(result.items);
      } catch (err) {
        if (!cancelled) setError(errorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, usage, query, level, expanded, legacy]);

  const runeById = useMemo(() => {
    const map = new Map<string, Equipment>();
    for (const item of Object.values(equipment)) map.set(item.id, item);
    for (const item of items) map.set(item.id, item);
    return map;
  }, [equipment, items]);

  const effectiveEquipment = useMemo(
    () => Object.fromEntries(runeById.entries()),
    [runeById],
  );
  const attached = (entry?.runes ?? [])
    .map((id) => runeById.get(id))
    .filter((rune): rune is Equipment => Boolean(rune));
  const slots = propertyRuneSlots(entry?.runes, effectiveEquipment);
  const propertyCount = propertyRuneCount(entry?.runes, effectiveEquipment);

  const attach = (rune: Equipment) => {
    if (!entry) return;
    const category = runeCategory(rune);
    if (category === "property" && propertyCount >= slots) {
      setNotice(
        slots
          ? `This item has ${slots} property rune slot${slots === 1 ? "" : "s"} and they are already filled.`
          : "Add a potency rune before etching property runes.",
      );
      return;
    }
    setNotice("");
    onChange(attachRuneIds(entry.runes, rune, effectiveEquipment));
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={item ? `Runes for ${item.name}` : "Runes"}
      subtitle="Fundamental runes change attacks, damage, AC, or saves. Property runes add magical effects."
      extraWide
      footer={<Button variant="primary" onClick={onClose}>Done</Button>}
    >
      <div className="rune-picker">
        {attached.length ? (
          <div className="rune-attached">
            <span className="field-label">Etched runes</span>
            <div className="chip-row">
              {attached.map((rune) => (
                <Tag key={rune.id} tone={runeCategory(rune) === "property" ? "violet" : "gold"}>
                  {rune.name}
                  <button
                    type="button"
                    className="tag-remove"
                    onClick={() => onChange((entry?.runes ?? []).filter((id) => id !== rune.id))}
                    aria-label={`Remove ${rune.name}`}
                  >
                    ×
                  </button>
                </Tag>
              ))}
            </div>
          </div>
        ) : null}

        <div className="rune-picker-toolbar">
          <div className="search-box">
            <Search size={15} />
            <Input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search runes…"
            />
          </div>
          <Toggle
            checked={legacy}
            onChange={(value) => {
              setLegacy(value);
              onLegacyChange?.(value);
            }}
            label="Include legacy"
            disabled={legacyLocked}
          />
          <ContentSourceToggle
            mode={expanded ? "expanded" : "core"}
            onChange={onExpandedChange}
            disabled={contentModeLocked}
          />
        </div>

        {notice ? <div className="auth-error">{notice}</div> : null}
        {error ? <div className="auth-error">{error}</div> : null}
        {loading ? <Spinner label="Reading rune formulas…" /> : null}

        <div className="rune-picker-layout">
          <div className="rune-picker-list">
            {items.map((rune) => {
              const category = runeCategory(rune);
              const isAttached = (entry?.runes ?? []).includes(rune.id);
              const disabled =
                category === "property" ? propertyCount >= slots && !isAttached : false;
              return (
                <button
                  type="button"
                  key={rune.id}
                  className={`rune-row ${selected?.id === rune.id ? "is-selected" : ""}`}
                  onClick={() => {
                    setSelected(rune);
                    setNotice("");
                  }}
                >
                  <span className="rune-row-main">
                    <strong>{rune.name}</strong>
                    <span className="tiny muted">
                      {CATEGORY_LABELS[category ?? ""] ?? "Rune"} · level {rune.level} · {formatCp(rune.price.cpTotal)}
                    </span>
                  </span>
                  {isAttached ? <Tag tone="green">Etched</Tag> : null}
                  {disabled && !isAttached ? <Tag tone="red">No slot</Tag> : null}
                </button>
              );
            })}
            {!loading && !items.length && !error ? (
              <div className="picker-empty">No runes match that search.</div>
            ) : null}
          </div>

          <div className="rune-picker-detail">
            {selected ? (
              <>
                <div className="row-between">
                  <div>
                    <h3>{selected.name}</h3>
                    <p className="tiny muted">
                      {CATEGORY_LABELS[runeCategory(selected) ?? ""] ?? "Rune"} · level {selected.level} ·{" "}
                      {formatCp(selected.price.cpTotal)}
                    </p>
                  </div>
                  <Sparkles size={18} className="gold-text" />
                </div>
                <div className="chip-row" style={{ margin: "10px 0" }}>
                  <ContentTierTag source={selected.source} />
                  {selected.traits.map((trait) => <Tag key={trait}>{trait}</Tag>)}
                  {selected.rarity !== "common" ? <Tag tone="violet">{selected.rarity}</Tag> : null}
                </div>
                <RichText html={selected.description} />
                <div className="row" style={{ marginTop: 16 }}>
                  {(entry?.runes ?? []).includes(selected.id) ? (
                    <Button
                      variant="danger"
                      icon={<X size={14} />}
                      onClick={() => onChange((entry?.runes ?? []).filter((id) => id !== selected.id))}
                    >
                      Remove rune
                    </Button>
                  ) : (
                    <Button
                      variant="primary"
                      icon={<Check size={14} />}
                      onClick={() => attach(selected)}
                      disabled={runeCategory(selected) === "property" && propertyCount >= slots}
                    >
                      Etch rune
                    </Button>
                  )}
                  <span className="tiny muted">
                    {runeCategory(selected) === "property"
                      ? `${propertyCount} of ${slots} property slot${slots === 1 ? "" : "s"} used`
                      : "Replaces the previous rune in this category."}
                  </span>
                </div>
              </>
            ) : (
              <div className="picker-detail-empty">
                <Coins size={26} />
                <p>Select a rune to inspect its price and effect.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
