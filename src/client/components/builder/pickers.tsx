import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  Check,
  ChevronDown,
  Coins,
  Loader2,
  Search,
  Shield,
  Sparkles,
  Swords,
} from "lucide-react";
import type {
  CharacterContext,
  CharacterDraft,
  ContentMode,
  Deity,
  Equipment,
  Feat,
  Spell,
} from "../../../shared/types";
import { isCoreSource } from "../../../shared/content";
import { spellTraditionLabel, stripHtml } from "../../../shared/compendium";
import { automationForEquipment, automationForFeat } from "../../../shared/automation";
import { ContentSourceToggle, ContentTierTag } from "./ContentSourceToggle";
import { api } from "../../api";
import { errorMessage, useToasts } from "../../stores";
import {
  AutomationTag,
  Badge,
  Button,
  Field,
  Input,
  Modal,
  RarityTag,
  RichText,
  Select,
  Spinner,
  Tag,
  Toggle,
} from "../ui";
import { formatCp } from "../../api";
import { computeCharacter, featPrerequisiteStatus, weaponDamageLabel } from "../../../shared/rules";
import { selectedClassGrantFeatIds } from "../../../shared/classGrants";
import { HoverCard } from "../HoverCard";

interface PickerBase {
  open: boolean;
  onClose: () => void;
}

function useSearch<T>(open: boolean, url: string, deps: unknown[], limit = 100) {
  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [next, setNext] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [offset, setOffset] = useState(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError("");
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const separator = url.includes("?") ? "&" : "?";
        const result = await api<{ items: T[]; total: number; next: number | null }>(
          `${url}${separator}limit=${limit}&offset=${offset}`,
          { signal: controller.signal }
        );
        if (!mounted.current) return;
        if (offset === 0) setItems(result.items);
        else setItems((current) => [...current, ...result.items]);
        setTotal(result.total);
        setNext(result.next);
      } catch (err) {
        if ((err as { name?: string }).name === "AbortError") return;
        if (mounted.current) setError(errorMessage(err));
      } finally {
        if (mounted.current) setLoading(false);
      }
    }, 220);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [open, url, offset, limit, ...deps]);

  return { items, total, next, loading, error, offset, setOffset };
}

function PickerShell({
  title,
  subtitle,
  children,
  onClose,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <Modal open title={title} subtitle={subtitle} onClose={onClose} extraWide>
      {children}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Feats
// ---------------------------------------------------------------------------
const CATEGORY_LABELS: Record<string, string> = {
  ancestry: "Ancestry",
  class: "Class",
  skill: "Skill",
  general: "General",
  archetype: "Archetype",
  mythic: "Mythic",
};

export function FeatPicker({
  open,
  onClose,
  category,
  slotLevel,
  target,
  ancestryTrait,
  classTrait,
  draft,
  context,
  expanded,
  onExpandedChange,
  contentModeLocked,
  legacyDefault,
  legacyLocked,
  onLegacyChange,
  onSelect,
}: PickerBase & {
  category: "ancestry" | "class" | "skill" | "general";
  slotLevel: number;
  target?: "freeArchetype";
  ancestryTrait?: string;
  classTrait?: string;
  draft: CharacterDraft;
  context: CharacterContext;
  expanded: boolean;
  onExpandedChange: (mode: ContentMode) => void;
  contentModeLocked?: boolean;
  legacyDefault?: boolean;
  legacyLocked?: boolean;
  onLegacyChange?: (value: boolean) => void;
  onSelect: (feat: Feat) => void;
}) {
  const [query, setQuery] = useState("");
  const [onlyMine, setOnlyMine] = useState(
    category === "ancestry" || (category === "class" && target !== "freeArchetype")
  );
  const [legacy, setLegacy] = useState(Boolean(legacyDefault));
  const [recommended, setRecommended] = useState(true);
  const [selected, setSelected] = useState<Feat | null>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelected(null);
    }
  }, [open, category, slotLevel]);

  useEffect(() => {
    setLegacy(Boolean(legacyDefault));
  }, [legacyDefault]);

  useEffect(() => {
    setSelected(null);
  }, [onlyMine, legacy, expanded]);

  const params = new URLSearchParams();
  params.set("category", category === "class" ? "class,archetype" : category);
  params.set("levelMax", String(slotLevel));
  params.set("levelMin", "1");
  if (onlyMine && target !== "freeArchetype") {
    if (category === "ancestry" && ancestryTrait) params.set("trait", ancestryTrait);
    if (category === "class" && classTrait) params.set("trait", classTrait);
  }
  if (!legacy) params.set("legacy", "0");
  if (!expanded) params.set("core", "1");
  if (recommended) params.set("recommended", "1");
  if (query.trim()) params.set("q", query.trim());

  const { items, total, next, loading, error, offset, setOffset } = useSearch<Feat>(
    open,
    `/api/compendium/feats?${params.toString()}`,
    [
      query,
      onlyMine,
      legacy,
      expanded,
      recommended,
      category,
      slotLevel,
      target,
      ancestryTrait,
      classTrait,
    ]
  );

  // Evaluate prerequisites as if this slot were empty, so replacing a feat
  // cannot use the feat being replaced to satisfy its own prerequisites.
  const selectionDraft = useMemo(() => {
    const key = target === "freeArchetype" ? "freeArchetype" : category;
    const bucket = { ...draft.feats[key] };
    delete bucket[String(slotLevel)];
    return { ...draft, feats: { ...draft.feats, [key]: bucket } };
  }, [draft, category, slotLevel, target]);
  const selectionDerived = useMemo(
    () => computeCharacter(selectionDraft, context),
    [selectionDraft, context]
  );

  const pool =
    target === "freeArchetype" ? items.filter((feat) => feat.traits.includes("archetype")) : items;
  const statusById = useMemo(
    () =>
      Object.fromEntries(
        pool.map((feat) => [
          feat.id,
          featPrerequisiteStatus(feat, selectionDraft, context, selectionDerived),
        ])
      ),
    [pool, selectionDraft, context, selectionDerived]
  );
  const grantedFeatIds = selectedClassGrantFeatIds(draft, context.classData);
  const eligible = pool.filter(
    (feat) => statusById[feat.id]?.status !== "unmet" && !grantedFeatIds.has(feat.id)
  );
  const hiddenCount = pool.length - eligible.length;
  const selectedStatus = selected ? statusById[selected.id] : undefined;

  return (
    <PickerShell
      title={
        target === "freeArchetype"
          ? "Choose a free archetype feat"
          : `Choose ${category === "ancestry" ? "an" : "a"} ${category} feat`
      }
      subtitle={`Level ${slotLevel} slot · ${eligible.length} available${hiddenCount ? ` · ${hiddenCount} blocked` : ""}`}
      onClose={onClose}
    >
      <div className="picker-layout">
        <div className="picker-list">
          <div className="picker-filters">
            <div className="search-box">
              <Search size={15} />
              <Input
                autoFocus
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setOffset(0);
                }}
                placeholder="Search feats…"
              />
            </div>
            <div className="row wrap" style={{ gap: 14 }}>
              {(category === "ancestry" ||
                (category === "class" && target !== "freeArchetype")) && (
                <Toggle
                  checked={onlyMine}
                  onChange={(value) => {
                    setOnlyMine(value);
                    setOffset(0);
                  }}
                  label={category === "ancestry" ? "Only my ancestry" : "Only my class"}
                />
              )}
              <Toggle
                checked={legacy}
                onChange={(value) => {
                  setLegacy(value);
                  onLegacyChange?.(value);
                  setOffset(0);
                }}
                label="Include legacy"
                disabled={legacyLocked}
              />
              <ContentSourceToggle
                mode={expanded ? "expanded" : "core"}
                onChange={(mode) => {
                  onExpandedChange(mode);
                  setOffset(0);
                }}
                disabled={contentModeLocked}
              />
              <Toggle
                checked={recommended}
                onChange={(value) => {
                  setRecommended(value);
                  setOffset(0);
                }}
                label="Recommended only"
                title="Show common, non-playtest options first."
              />
            </div>
          </div>
          <div className="picker-scroll">
            {error ? <div className="auth-error">{error}</div> : null}
            {expanded ? (
              <p className="tiny muted picker-prereq-note">
                Expanded sources can include options with effects that need manual tracking.
              </p>
            ) : null}
            <p className="tiny muted picker-prereq-note">
              Automation badges are conservative. Manual means Runehall does not apply that effect
              for you.
            </p>
            {hiddenCount ? (
              <p className="tiny muted picker-prereq-note">
                {hiddenCount} feat{hiddenCount === 1 ? "" : "s"} hidden because prerequisites or
                class access are not met, or the feat is already granted by a class choice.
              </p>
            ) : null}
            {eligible.map((feat) => (
              <HoverCard
                key={feat.id}
                title={feat.name}
                subtitle={`${CATEGORY_LABELS[feat.category] || feat.category} feat · level ${feat.level} · ${feat.source}`}
                body={stripHtml(feat.description, 240) || undefined}
              >
                <button
                  type="button"
                  className={`picker-item ${selected?.id === feat.id ? "is-selected" : ""}`}
                  onClick={() => setSelected(feat)}
                >
                  <div className="picker-item-main">
                    <span className="picker-item-name">{feat.name}</span>
                    <span className="picker-item-sub">
                      {CATEGORY_LABELS[feat.category] || feat.category} · level {feat.level}
                      {feat.actionType && feat.actionType !== "passive"
                        ? ` · ${feat.actions ?? 1} action${feat.actions === 1 ? "" : "s"}`
                        : ""}
                    </span>
                  </div>
                  <div className="picker-item-tags">
                    <AutomationTag level={automationForFeat(feat).level} />
                    {feat.rarity !== "common" ? <RarityTag rarity={feat.rarity} /> : null}
                    {statusById[feat.id]?.status === "unknown" ? (
                      <Tag tone="gold">Check prereqs</Tag>
                    ) : null}
                    {feat.traits.slice(0, 3).map((trait) => (
                      <Tag key={trait}>{trait}</Tag>
                    ))}
                  </div>
                </button>
              </HoverCard>
            ))}
            {!loading && !eligible.length && !error ? (
              <div className="picker-empty">
                No available feats match those filters. Feats with unmet prerequisites or class
                access stay hidden.
              </div>
            ) : null}
            {loading ? <Spinner label="Searching the archives…" /> : null}
            {next !== null && !loading ? (
              <Button variant="ghost" size="sm" onClick={() => setOffset(next)} block>
                Load more ({items.length} of {total})
              </Button>
            ) : null}
          </div>
        </div>
        <div className="picker-detail">
          {selected ? (
            <>
              <div className="picker-detail-head">
                <div>
                  <h3>{selected.name}</h3>
                  <p className="tiny muted">
                    {CATEGORY_LABELS[selected.category] || selected.category} feat · level{" "}
                    {selected.level} · {selected.source}
                  </p>
                </div>
                <div className="chip-row">
                  <ContentTierTag source={selected.source} />
                  <RarityTag rarity={selected.rarity} />
                  <AutomationTag level={automationForFeat(selected).level} />
                </div>
              </div>
              <div className="chip-row" style={{ marginBottom: 12 }}>
                {selected.traits.map((trait) => (
                  <Tag key={trait}>{trait}</Tag>
                ))}
              </div>
              {selected.prerequisites.length ? (
                <div className="prereq-box">
                  <strong>Prerequisites</strong>
                  <ul>
                    {(
                      selectedStatus?.checks ??
                      selected.prerequisites.map((text) => ({ text, status: "unknown" as const }))
                    ).map((check, index) => (
                      <li key={index}>
                        {check.text}
                        <span className="tiny muted">
                          {" "}
                          ·{" "}
                          {check.status === "met"
                            ? "met"
                            : check.status === "unmet"
                              ? "not met"
                              : "verify"}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {selectedStatus?.status === "unmet" ? (
                    <p className="tiny danger-text">
                      This character does not meet these prerequisites, so this feat cannot be
                      selected.
                    </p>
                  ) : null}
                  {selectedStatus?.status === "unknown" ? (
                    <p className="tiny muted">
                      This prerequisite needs table verification. It is available with a warning,
                      but confirm it with your GM before play.
                    </p>
                  ) : null}
                </div>
              ) : null}
              <RichText html={selected.description} />
              <div className="picker-detail-actions">
                <Button variant="ghost" onClick={onClose}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  icon={<Check size={15} />}
                  disabled={selectedStatus?.status === "unmet"}
                  title={
                    selectedStatus?.status === "unmet"
                      ? "All prerequisites must be met before this feat can be selected"
                      : undefined
                  }
                  onClick={() => {
                    onSelect(selected);
                    onClose();
                  }}
                >
                  Take {selected.name}
                </Button>
              </div>
            </>
          ) : (
            <div className="picker-detail-empty">
              <BookOpen size={28} />
              <p>Select a feat to read its full text and prerequisites.</p>
            </div>
          )}
        </div>
      </div>
    </PickerShell>
  );
}

// ---------------------------------------------------------------------------
// Spells
// ---------------------------------------------------------------------------
export function SpellPicker({
  open,
  onClose,
  rank,
  maxRank,
  tradition,
  focus,
  ritual,
  classTrait,
  expanded,
  onExpandedChange,
  contentModeLocked,
  legacyDefault,
  legacyLocked,
  onLegacyChange,
  excludeIds,
  onSelect,
}: PickerBase & {
  rank: number | null;
  maxRank?: number | null;
  tradition: string | null;
  focus?: boolean;
  ritual?: boolean;
  classTrait?: string;
  expanded: boolean;
  onExpandedChange: (mode: ContentMode) => void;
  contentModeLocked?: boolean;
  legacyDefault?: boolean;
  legacyLocked?: boolean;
  onLegacyChange?: (value: boolean) => void;
  excludeIds?: string[];
  onSelect: (spell: Spell) => void;
}) {
  const [query, setQuery] = useState("");
  const [legacy, setLegacy] = useState(Boolean(legacyDefault));
  const psychicCantrips = classTrait === "psychic" && rank === 0 && !focus;
  // Psi cantrips are uncommon and have no tradition; do not hide them behind
  // the default "recommended only" filter.
  const [recommended, setRecommended] = useState(!psychicCantrips && !ritual);
  const [selected, setSelected] = useState<Spell | null>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelected(null);
    }
  }, [open, rank, tradition, focus, ritual]);

  useEffect(() => {
    setLegacy(Boolean(legacyDefault));
  }, [legacyDefault]);

  useEffect(() => {
    setSelected(null);
  }, [legacy, expanded]);

  const params = new URLSearchParams();
  if (rank !== null) params.set("rank", String(rank));
  if (maxRank !== null && maxRank !== undefined) params.set("rankMax", String(maxRank));
  if (tradition && !psychicCantrips && !ritual) params.set("tradition", tradition);
  if (!legacy) params.set("legacy", "0");
  if (!expanded) params.set("core", "1");
  if (recommended) params.set("recommended", "1");
  if (ritual) params.set("ritual", "1");
  if (query.trim()) params.set("q", query.trim());
  if (psychicCantrips) {
    params.set("traitAll", "psychic");
  } else if (focus) {
    params.set("traitAll", [classTrait, "focus"].filter(Boolean).join(","));
  }

  const { items, total, next, loading, error, offset, setOffset } = useSearch<Spell>(
    open,
    `/api/compendium/spells?${params.toString()}`,
    [query, legacy, expanded, recommended, rank, maxRank, tradition, focus, ritual, classTrait]
  );

  const excluded = new Set(excludeIds ?? []);
  const filtered = items.filter((spell) => !excluded.has(spell.id));
  const hiddenCount = items.length - filtered.length;

  return (
    <PickerShell
      title={
        ritual
          ? "Choose a ritual"
          : rank === 0
            ? "Choose a cantrip"
            : focus
              ? "Choose a focus spell"
              : rank
                ? `Choose a rank ${rank} spell`
                : "Choose a spell"
      }
      subtitle={`${total} options${tradition ? ` · ${tradition}` : ""}`}
      onClose={onClose}
    >
      <div className="picker-layout">
        <div className="picker-list">
          <div className="picker-filters">
            <div className="search-box">
              <Search size={15} />
              <Input
                autoFocus
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setOffset(0);
                }}
                placeholder="Search spells…"
              />
            </div>
            <Toggle
              checked={legacy}
              onChange={(value) => {
                setLegacy(value);
                onLegacyChange?.(value);
                setOffset(0);
              }}
              label="Include legacy"
              disabled={legacyLocked}
            />
            <ContentSourceToggle
              mode={expanded ? "expanded" : "core"}
              onChange={(mode) => {
                onExpandedChange(mode);
                setOffset(0);
              }}
              disabled={contentModeLocked}
            />
            <Toggle
              checked={recommended}
              onChange={(value) => {
                setRecommended(value);
                setOffset(0);
              }}
              label="Recommended only"
              title="Show common, non-playtest options first."
            />
          </div>
          <div className="picker-scroll">
            {error ? <div className="auth-error">{error}</div> : null}
            {expanded ? (
              <p className="tiny muted picker-prereq-note">
                Expanded sources can include options with effects that need manual tracking.
              </p>
            ) : null}
            <p className="tiny muted picker-prereq-note">
              Automation badges are conservative. Manual means Runehall does not apply that effect
              for you.
            </p>
            {hiddenCount ? (
              <p className="tiny muted picker-prereq-note">
                {hiddenCount} spell{hiddenCount === 1 ? "" : "s"} hidden because already granted or
                selected.
              </p>
            ) : null}
            {filtered.map((spell) => (
              <HoverCard
                key={spell.id}
                title={spell.name}
                subtitle={`${spell.rank === 0 ? "Cantrip" : `Rank ${spell.rank}`} · ${spellTraditionLabel(spell)} · ${spell.source}`}
                body={stripHtml(spell.description, 240) || undefined}
                meta={spell.damageText ? <span>{spell.damageText}</span> : undefined}
              >
                <button
                  type="button"
                  className={`picker-item ${selected?.id === spell.id ? "is-selected" : ""}`}
                  onClick={() => setSelected(spell)}
                >
                  <div className="picker-item-main">
                    <span className="picker-item-name">{spell.name}</span>
                    <span className="picker-item-sub">
                      {spell.rank === 0 ? "Cantrip" : `Rank ${spell.rank}`} ·{" "}
                      {spellTraditionLabel(spell)}
                      {spell.actions ? ` · ${spell.actions}` : ""}
                    </span>
                  </div>
                  <div className="picker-item-tags">
                    {spell.rarity !== "common" ? <RarityTag rarity={spell.rarity} /> : null}
                    {spell.traits.slice(0, 3).map((trait) => (
                      <Tag key={trait}>{trait}</Tag>
                    ))}
                  </div>
                </button>
              </HoverCard>
            ))}
            {!loading && !filtered.length && !error ? (
              <div className="picker-empty">
                {hiddenCount
                  ? "Everything matching is already granted or selected."
                  : "No spells match those filters."}
              </div>
            ) : null}
            {loading ? <Spinner label="Searching spellbooks…" /> : null}
            {next !== null && !loading ? (
              <Button variant="ghost" size="sm" onClick={() => setOffset(next)} block>
                Load more ({items.length} of {total})
              </Button>
            ) : null}
          </div>
        </div>
        <div className="picker-detail">
          {selected ? (
            <>
              <div className="picker-detail-head">
                <div>
                  <h3>{selected.name}</h3>
                  <p className="tiny muted">
                    {selected.rank === 0 ? "Cantrip" : `Rank ${selected.rank}`} · {selected.source}
                  </p>
                </div>
                <div className="chip-row">
                  <ContentTierTag source={selected.source} />
                  <RarityTag rarity={selected.rarity} />
                </div>
              </div>
              <div className="chip-row" style={{ marginBottom: 12 }}>
                {[...selected.traits, ...selected.traditions].map((trait) => (
                  <Tag key={trait}>{trait}</Tag>
                ))}
              </div>
              <div className="spell-meta-grid">
                <div>
                  <span>Cast</span>
                  <strong>{selected.actions || "—"}</strong>
                </div>
                <div>
                  <span>Range</span>
                  <strong>{selected.range || "—"}</strong>
                </div>
                <div>
                  <span>Area</span>
                  <strong>{selected.area || "—"}</strong>
                </div>
                <div>
                  <span>Targets</span>
                  <strong>{selected.targets || "—"}</strong>
                </div>
                <div>
                  <span>Defense</span>
                  <strong>
                    {selected.defense?.save
                      ? `${selected.defense.save}${selected.defense.basic ? " (basic)" : ""}`
                      : "—"}
                  </strong>
                </div>
                <div>
                  <span>Duration</span>
                  <strong>{selected.duration || "—"}</strong>
                </div>
              </div>
              {selected.damageText ? (
                <div className="damage-callout">
                  <Swords size={14} /> {selected.damageText}
                </div>
              ) : null}
              <RichText html={selected.description} />
              <div className="picker-detail-actions">
                <Button variant="ghost" onClick={onClose}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  icon={<Check size={15} />}
                  onClick={() => {
                    onSelect(selected);
                    onClose();
                  }}
                >
                  Learn {selected.name}
                </Button>
              </div>
            </>
          ) : (
            <div className="picker-detail-empty">
              <Sparkles size={28} />
              <p>Select a spell to read its casting details and description.</p>
            </div>
          )}
        </div>
      </div>
    </PickerShell>
  );
}

// ---------------------------------------------------------------------------
// Equipment
// ---------------------------------------------------------------------------
const ITEM_TYPES = [
  ["", "All"],
  ["weapon", "Weapons"],
  ["armor", "Armor"],
  ["shield", "Shields"],
  ["consumable", "Consumables"],
  ["equipment", "Gear"],
  ["ammo", "Ammo"],
  ["treasure", "Treasure"],
  ["backpack,kit", "Containers"],
] as const;

export function EquipmentPicker({
  open,
  onClose,
  level,
  expanded,
  onExpandedChange,
  contentModeLocked,
  legacyDefault,
  legacyLocked,
  onLegacyChange,
  onSelect,
}: PickerBase & {
  level: number;
  expanded: boolean;
  onExpandedChange: (mode: ContentMode) => void;
  contentModeLocked?: boolean;
  legacyDefault?: boolean;
  legacyLocked?: boolean;
  onLegacyChange?: (value: boolean) => void;
  onSelect: (item: Equipment) => void;
}) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [legacy, setLegacy] = useState(Boolean(legacyDefault));
  const [recommended, setRecommended] = useState(true);
  const [selected, setSelected] = useState<Equipment | null>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelected(null);
    }
  }, [open]);

  useEffect(() => {
    setLegacy(Boolean(legacyDefault));
  }, [legacyDefault]);

  useEffect(() => {
    setSelected(null);
  }, [legacy, expanded]);

  const params = new URLSearchParams();
  if (type) params.set("type", type);
  if (!legacy) params.set("legacy", "0");
  if (!expanded) params.set("core", "1");
  if (recommended) params.set("recommended", "1");
  if (query.trim()) params.set("q", query.trim());
  params.set("levelMax", String(level + 2));

  const { items, total, next, loading, error, offset, setOffset } = useSearch<Equipment>(
    open,
    `/api/compendium/equipment?${params.toString()}`,
    [query, type, legacy, expanded, recommended, level]
  );

  return (
    <PickerShell
      title="Add equipment"
      subtitle={`${total} items · prices count toward gear value`}
      onClose={onClose}
    >
      <div className="picker-layout">
        <div className="picker-list">
          <div className="picker-filters">
            <div className="search-box">
              <Search size={15} />
              <Input
                autoFocus
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setOffset(0);
                }}
                placeholder="Search weapons, armor, gear…"
              />
            </div>
            <div className="segmented" style={{ width: "100%", overflowX: "auto" }}>
              {ITEM_TYPES.map(([value, label]) => (
                <button
                  type="button"
                  key={value}
                  className={type === value ? "is-active" : ""}
                  onClick={() => {
                    setType(value);
                    setOffset(0);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <Toggle
              checked={legacy}
              onChange={(value) => {
                setLegacy(value);
                onLegacyChange?.(value);
                setOffset(0);
              }}
              label="Include legacy"
              disabled={legacyLocked}
            />
            <ContentSourceToggle
              mode={expanded ? "expanded" : "core"}
              onChange={(mode) => {
                onExpandedChange(mode);
                setOffset(0);
              }}
              disabled={contentModeLocked}
            />
            <Toggle
              checked={recommended}
              onChange={(value) => {
                setRecommended(value);
                setOffset(0);
              }}
              label="Recommended only"
              title="Show common, non-playtest options first."
            />
          </div>
          <div className="picker-scroll">
            {error ? <div className="auth-error">{error}</div> : null}
            {expanded ? (
              <p className="tiny muted picker-prereq-note">
                Expanded sources can include options with effects that need manual tracking.
              </p>
            ) : null}
            <p className="tiny muted picker-prereq-note">
              Automation badges are conservative. Manual means Runehall does not apply that effect
              for you.
            </p>
            {items.map((item) => (
              <HoverCard
                key={item.id}
                title={item.name}
                subtitle={`${item.type} · level ${item.level} · ${formatCp(item.price.cpTotal)} · ${item.source}`}
                body={stripHtml(item.description, 240) || undefined}
              >
                <button
                  type="button"
                  className={`picker-item ${selected?.id === item.id ? "is-selected" : ""}`}
                  onClick={() => setSelected(item)}
                >
                  <div className="picker-item-main">
                    <span className="picker-item-name">{item.name}</span>
                    <span className="picker-item-sub">
                      {item.type} · level {item.level} · {formatCp(item.price.cpTotal)}
                      {item.bulk ? ` · ${item.bulk} bulk` : ""}
                    </span>
                  </div>
                  <div className="picker-item-tags">
                    <AutomationTag level={automationForEquipment(item).level} />
                    {item.rarity !== "common" ? <RarityTag rarity={item.rarity} /> : null}
                    {item.traits.slice(0, 3).map((trait) => (
                      <Tag key={trait}>{trait}</Tag>
                    ))}
                  </div>
                </button>
              </HoverCard>
            ))}
            {!loading && !items.length && !error ? (
              <div className="picker-empty">No items match those filters.</div>
            ) : null}
            {loading ? <Spinner label="Opening the armory…" /> : null}
            {next !== null && !loading ? (
              <Button variant="ghost" size="sm" onClick={() => setOffset(next)} block>
                Load more ({items.length} of {total})
              </Button>
            ) : null}
          </div>
        </div>
        <div className="picker-detail">
          {selected ? (
            <>
              <div className="picker-detail-head">
                <div>
                  <h3>{selected.name}</h3>
                  <p className="tiny muted">
                    {selected.type} · level {selected.level} · {selected.source}
                  </p>
                </div>
                <div className="chip-row">
                  <ContentTierTag source={selected.source} />
                  <RarityTag rarity={selected.rarity} />
                  <AutomationTag level={automationForEquipment(selected).level} />
                </div>
              </div>
              <div className="chip-row" style={{ marginBottom: 12 }}>
                {selected.traits.map((trait) => (
                  <Tag key={trait}>{trait}</Tag>
                ))}
              </div>
              <div className="spell-meta-grid">
                <div>
                  <span>Price</span>
                  <strong>{formatCp(selected.price.cpTotal)}</strong>
                </div>
                <div>
                  <span>Bulk</span>
                  <strong>{selected.bulk || "—"}</strong>
                </div>
                <div>
                  <span>Usage</span>
                  <strong>{selected.usage || "—"}</strong>
                </div>
                {selected.weapon ? (
                  <div>
                    <span>Damage</span>
                    <strong>{weaponDamageLabel(selected.weapon)}</strong>
                  </div>
                ) : null}
                {selected.weapon ? (
                  <div>
                    <span>Category</span>
                    <strong>{selected.weapon.category}</strong>
                  </div>
                ) : null}
                {selected.armor ? (
                  <div>
                    <span>AC</span>
                    <strong>
                      +{selected.armor.acBonus} · Dex cap +{selected.armor.dexCap}
                    </strong>
                  </div>
                ) : null}
                {selected.shield ? (
                  <div>
                    <span>Shield</span>
                    <strong>
                      +{selected.shield.acBonus} AC · hardness {selected.shield.hardness}
                    </strong>
                  </div>
                ) : null}
              </div>
              <RichText html={selected.description} />
              <div className="picker-detail-actions">
                <Button variant="ghost" onClick={onClose}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  icon={<Coins size={15} />}
                  onClick={() => {
                    onSelect(selected);
                    onClose();
                  }}
                >
                  Add to gear
                </Button>
              </div>
            </>
          ) : (
            <div className="picker-detail-empty">
              <Shield size={28} />
              <p>Select an item to inspect it before adding it to your pack.</p>
            </div>
          )}
        </div>
      </div>
    </PickerShell>
  );
}

// ---------------------------------------------------------------------------
// Deities
// ---------------------------------------------------------------------------
export function DeityPicker({
  open,
  onClose,
  expanded,
  onExpandedChange,
  contentModeLocked,
  legacyDefault,
  legacyLocked,
  onLegacyChange,
  onSelect,
}: PickerBase & {
  expanded: boolean;
  onExpandedChange: (mode: ContentMode) => void;
  contentModeLocked?: boolean;
  legacyDefault?: boolean;
  legacyLocked?: boolean;
  onLegacyChange?: (value: boolean) => void;
  onSelect: (deity: Deity) => void;
}) {
  const [query, setQuery] = useState("");
  const [legacy, setLegacy] = useState(Boolean(legacyDefault));
  const [selected, setSelected] = useState<Deity | null>(null);
  const [items, setItems] = useState<Deity[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelected(null);
    setLoading(true);
    setError("");
    api<{ items: Deity[] }>("/api/compendium/deities?limit=500")
      .then((result) => setItems(result.items))
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, [open]);

  useEffect(() => {
    setLegacy(Boolean(legacyDefault));
  }, [legacyDefault]);

  useEffect(() => {
    setSelected(null);
  }, [expanded, legacy]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((deity) => {
      if (!expanded && !isCoreSource(deity.source, "deity")) return false;
      if (!legacy && !deity.remaster) return false;
      if (!q) return true;
      return `${deity.name} ${deity.domains.join(" ")} ${(deity.alternateDomains ?? []).join(" ")} ${deity.traits.join(" ")} ${deity.source}`
        .toLowerCase()
        .includes(q);
    });
  }, [items, query, expanded, legacy]);

  return (
    <PickerShell
      title="Choose a deity"
      subtitle={`${filtered.length} deities and faiths shown`}
      onClose={onClose}
    >
      <div className="picker-layout">
        <div className="picker-list">
          <div className="picker-filters">
            <div className="search-box">
              <Search size={15} />
              <Input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search deities, domains, traits…"
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
          <div className="picker-scroll">
            {loading ? <Spinner label="Reading the heavens…" /> : null}
            {error ? <div className="auth-error">{error}</div> : null}
            {!loading &&
              filtered.map((deity) => (
                <HoverCard
                  key={deity.id}
                  title={deity.name}
                  subtitle={`${deity.category} · ${deity.source}`}
                  body={stripHtml(deity.description, 240) || undefined}
                  meta={<span>{deity.domains.slice(0, 4).join(" · ")}</span>}
                >
                  <button
                    type="button"
                    className={`picker-item ${selected?.id === deity.id ? "is-selected" : ""}`}
                    onClick={() => setSelected(deity)}
                  >
                    <div className="picker-item-main">
                      <span className="picker-item-name">{deity.name}</span>
                      <span className="picker-item-sub">
                        {deity.domains.slice(0, 4).join(" · ") || "Deity"} · {deity.source}
                      </span>
                    </div>
                    <div className="picker-item-tags">
                      {deity.font.map((font) => (
                        <Tag key={font} tone="gold">
                          {font}
                        </Tag>
                      ))}
                    </div>
                  </button>
                </HoverCard>
              ))}
            {!loading && !filtered.length ? (
              <div className="picker-empty">No deity matches that search.</div>
            ) : null}
          </div>
        </div>
        <div className="picker-detail">
          {selected ? (
            <>
              <div className="picker-detail-head">
                <div>
                  <h3>{selected.name}</h3>
                  <p className="tiny muted">
                    {selected.category} · {selected.source}
                  </p>
                </div>
                <RarityTag rarity={selected.rarity} />
              </div>
              <div className="deity-grid">
                <div>
                  <span>Divine font</span>
                  <strong>{selected.font.join(", ") || "—"}</strong>
                </div>
                <div>
                  <span>Skill</span>
                  <strong>{(selected.skill ?? []).join(" or ") || "—"}</strong>
                </div>
                <div>
                  <span>Domains</span>
                  <strong>
                    {[...selected.domains, ...(selected.alternateDomains ?? [])].join(", ") || "—"}
                  </strong>
                </div>
                <div>
                  <span>Favored weapon</span>
                  <strong>{selected.weapons.join(", ") || "—"}</strong>
                </div>
              </div>
              <RichText html={selected.description} />
              <div className="picker-detail-actions">
                <Button variant="ghost" onClick={onClose}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  icon={<Check size={15} />}
                  onClick={() => {
                    onSelect(selected);
                    onClose();
                  }}
                >
                  Follow {selected.name}
                </Button>
              </div>
            </>
          ) : (
            <div className="picker-detail-empty">
              <Sparkles size={28} />
              <p>Select a deity to see their domains, divine font, and favored weapon.</p>
            </div>
          )}
        </div>
      </div>
    </PickerShell>
  );
}
