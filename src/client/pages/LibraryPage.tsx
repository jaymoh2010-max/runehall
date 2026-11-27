import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  AlertTriangle,
  BookOpen,
  Bug,
  Cat,
  Dices,
  Gift,
  GitBranch,
  GraduationCap,
  HeartPulse,
  Landmark,
  Layers,
  ScrollText,
  Search,
  Shield,
  Skull,
  Sparkles,
  Swords,
  Tags,
  Truck,
  Users,
  X,
  Zap,
} from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import type {
  ActionRef,
  Ancestry,
  Background,
  ClassData,
  ClassFeature,
  ConditionRef,
  Deity,
  Equipment,
  Feat,
  Heritage,
  Monster,
  Spell,
  Hazard,
  Vehicle,
  FamiliarAbility,
  BoonCurse,
  TraitEntry,
  Affliction,
} from "../../shared/types";
import type { DomainEntry } from "../../shared/domains";
import {
  compendiumEntryPath,
  compendiumKindFromId,
  spellTraditionLabel,
  stripHtml,
  vehicleSummary,
  type CompendiumEntryKind,
} from "../../shared/compendium";
import { api, formatCp } from "../api";
import { errorMessage } from "../stores";
import {
  Button,
  EmptyState,
  ErrorState,
  Input,
  PageEyebrow,
  RarityTag,
  Spinner,
  Tag,
  Toggle,
} from "../components/ui";
import { CompendiumDetail } from "../components/CompendiumDetail";
import { HoverCard } from "../components/HoverCard";

type Tab =
  | "ancestries"
  | "heritages"
  | "backgrounds"
  | "classes"
  | "classFeatures"
  | "feats"
  | "spells"
  | "items"
  | "bestiary"
  | "deities"
  | "domains"
  | "conditions"
  | "actions"
  | "hazards"
  | "vehicles"
  | "familiarAbilities"
  | "boonsAndCurses"
  | "traits"
  | "afflictions";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "ancestries", label: "Ancestries", icon: <Users size={15} /> },
  { id: "heritages", label: "Heritages", icon: <GitBranch size={15} /> },
  { id: "backgrounds", label: "Backgrounds", icon: <ScrollText size={15} /> },
  { id: "classes", label: "Classes", icon: <GraduationCap size={15} /> },
  { id: "classFeatures", label: "Class Features", icon: <Layers size={15} /> },
  { id: "feats", label: "Feats", icon: <Swords size={15} /> },
  { id: "spells", label: "Spells", icon: <Sparkles size={15} /> },
  { id: "items", label: "Items", icon: <Shield size={15} /> },
  { id: "bestiary", label: "Bestiary", icon: <Skull size={15} /> },
  { id: "deities", label: "Deities", icon: <BookOpen size={15} /> },
  { id: "domains", label: "Domains", icon: <Landmark size={15} /> },
  { id: "conditions", label: "Conditions", icon: <HeartPulse size={15} /> },
  { id: "actions", label: "Actions", icon: <Zap size={15} /> },
  { id: "hazards", label: "Hazards", icon: <AlertTriangle size={15} /> },
  { id: "vehicles", label: "Vehicles", icon: <Truck size={15} /> },
  { id: "familiarAbilities", label: "Familiars", icon: <Cat size={15} /> },
  { id: "boonsAndCurses", label: "Boons & Curses", icon: <Gift size={15} /> },
  { id: "traits", label: "Traits", icon: <Tags size={15} /> },
  { id: "afflictions", label: "Afflictions", icon: <Bug size={15} /> },
];

type Entry =
  | Ancestry
  | Heritage
  | Background
  | ClassData
  | ClassFeature
  | Feat
  | Spell
  | Equipment
  | Monster
  | Deity
  | DomainEntry
  | ConditionRef
  | ActionRef
  | Hazard
  | Vehicle
  | FamiliarAbility
  | BoonCurse
  | TraitEntry
  | Affliction;

const TAB_KINDS: Record<Tab, CompendiumEntryKind> = {
  ancestries: "ancestry",
  heritages: "heritage",
  backgrounds: "background",
  classes: "class",
  classFeatures: "classFeature",
  feats: "feat",
  spells: "spell",
  items: "equipment",
  bestiary: "monster",
  deities: "deity",
  domains: "domain",
  conditions: "condition",
  actions: "action",
  hazards: "hazard",
  vehicles: "vehicle",
  familiarAbilities: "familiarAbility",
  boonsAndCurses: "boonCurse",
  traits: "trait",
  afflictions: "affliction",
};

const TAB_ROUTES: Partial<Record<Tab, string>> = {
  ancestries: "/api/compendium/ancestries",
  heritages: "/api/compendium/heritages",
  backgrounds: "/api/compendium/backgrounds",
  classes: "/api/compendium/classes",
  classFeatures: "/api/compendium/class-features",
  conditions: "/api/compendium/conditions",
  actions: "/api/compendium/actions",
  hazards: "/api/compendium/hazards",
  vehicles: "/api/compendium/vehicles",
  familiarAbilities: "/api/compendium/familiar-abilities",
  boonsAndCurses: "/api/compendium/boons-and-curses",
  traits: "/api/compendium/traits",
  afflictions: "/api/compendium/afflictions",
};

function entrySubtitle(item: Entry, tab: Tab): string {
  // Use the entry's own ID, not only the active tab, so a one-frame tab
  // transition can never feed a feat into the spell formatter.
  const kind = compendiumKindFromId(item.id) ?? TAB_KINDS[tab];
  switch (kind) {
    case "ancestry": {
      const ancestry = item as Ancestry;
      const hp = ancestry.hpBySize
        ? `${Math.min(...Object.values(ancestry.hpBySize))}-${Math.max(...Object.values(ancestry.hpBySize))}`
        : ancestry.hp;
      const size = ancestry.sizeChoices ? "variable size" : ancestry.size;
      return `${hp} HP · ${size} · ${ancestry.vision}`;
    }
    case "heritage": {
      const heritage = item as Heritage;
      return `${heritage.ancestry}${heritage.versatile ? " · versatile" : ""}`;
    }
    case "background": {
      const background = item as Background;
      return `${background.trainedSkills.slice(0, 2).join(", ") || "Background"} · ${background.source}`;
    }
    case "class": {
      const cls = item as ClassData;
      return `${cls.hp} HP · ${cls.keyAbility.map((ability) => ability.toUpperCase()).join("/")}`;
    }
    case "classFeature": {
      const feature = item as ClassFeature;
      return `Level ${feature.level} · ${feature.traits.slice(0, 2).join(", ") || "Class feature"}`;
    }
    case "feat":
      return `Level ${(item as Feat).level} · ${(item as Feat).category}`;
    case "spell": {
      const spell = item as Spell;
      return `${spell.rank === 0 ? "Cantrip" : `Rank ${spell.rank}`} · ${spellTraditionLabel(spell)}`;
    }
    case "equipment": {
      const itemData = item as Equipment;
      return `${itemData.type} · level ${itemData.level} · ${formatCp(itemData.price.cpTotal)} · ${
        itemData.remaster ? "Remastered" : "Legacy"
      }`;
    }
    case "monster":
      return `Level ${(item as Monster).level} · ${(item as Monster).hp} HP · AC ${(item as Monster).ac}`;
    case "deity":
      return `${(item as Deity).domains.slice(0, 3).join(", ") || "Deity"} · ${(item as Deity).source}`;
    case "domain": {
      const domain = item as DomainEntry;
      return `${domain.domainSpell.name || "Domain"} · ${domain.deities.length} deities`;
    }
    case "condition":
      return (item as ConditionRef).source;
    case "action": {
      const action = item as ActionRef;
      return `${action.category} · ${action.actionType ?? "Action"}`;
    }
    case "hazard": {
      const hazard = item as Hazard;
      return `Level ${hazard.level} · ${hazard.complexity} hazard`;
    }
    case "vehicle": {
      const vehicle = item as Vehicle;
      return `Level ${vehicle.level} · ${vehicle.hp} HP · AC ${vehicle.ac}`;
    }
    case "familiarAbility":
      return (item as FamiliarAbility).source;
    case "boonCurse": {
      const boon = item as BoonCurse;
      return `${boon.category === "boon" ? "Boon" : "Curse"} · ${boon.deity}`;
    }
    case "trait":
      return (item as TraitEntry).group.join(", ") || (item as TraitEntry).source;
    case "affliction": {
      const affliction = item as Affliction;
      const label =
        affliction.category === "disease"
          ? "Disease"
          : affliction.category === "poison"
            ? "Poison"
            : "Curse";
      return `${label} · level ${affliction.level}`;
    }
    default:
      return item.name;
  }
}

function entryDescription(item: Entry): string {
  if (compendiumKindFromId(item.id) === "vehicle") {
    const vehicle = item as Vehicle;
    return stripHtml(vehicle.description || vehicleSummary(vehicle), 240);
  }
  const description =
    "description" in item && item.description
      ? item.description
      : "blurb" in item
        ? item.blurb
        : "";
  return stripHtml(description, 240);
}

function validTab(value: string | null): Tab {
  return TABS.some((entry) => entry.id === value) ? (value as Tab) : "feats";
}

export function LibraryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = validTab(searchParams.get("tab"));
  const query = searchParams.get("q") ?? "";
  const legacy = searchParams.get("legacy") === "1";
  const selectedId = searchParams.get("entry");
  const offset = Math.max(0, Number(searchParams.get("offset")) || 0);
  const [items, setItems] = useState<Entry[]>([]);
  const [total, setTotal] = useState(0);
  const [next, setNext] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retryToken, setRetryToken] = useState(0);
  const queryKeyRef = useRef<string | null>(null);
  const [searchText, setSearchText] = useState(query);
  // React Router can defer the URL update from `setSearchParams`. Keep the
  // values we asked it to apply so stale echoes of earlier keystrokes are not
  // written back over the input while the router catches up.
  const latestSearchRef = useRef(query);
  const pendingSearchesRef = useRef<Set<string>>(new Set());
  const activeTab = TABS.find((entry) => entry.id === tab) ?? TABS[0];
  const selected = items.find((item) => item.id === selectedId) ?? items[0] ?? null;
  const returnTo = `/library${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;

  useEffect(() => {
    document.title = "Library · Runehall";
  }, []);

  // Keep the input in sync with external URL changes (back/forward, links),
  // without reverting characters typed ahead while the router catches up.
  useEffect(() => {
    const pending = pendingSearchesRef.current;
    if (pending.has(query)) {
      pending.delete(query);
      // An earlier write from this typing burst is not the canonical value yet.
      if (query !== latestSearchRef.current) return;
      pending.clear();
    } else if (pending.size) {
      // The URL changed outside the search box; accept it and drop stale writes.
      pending.clear();
    }
    setSearchText(query);
  }, [query]);

  useEffect(() => {
    setItems([]);
    setTotal(0);
    setNext(null);
  }, [tab]);

  useEffect(() => {
    const key = `${tab}|${query}|${legacy}`;
    if (queryKeyRef.current === null) {
      queryKeyRef.current = key;
      return;
    }
    if (queryKeyRef.current !== key && offset > 0) {
      setSearchParams(
        (current) => {
          const nextParams = new URLSearchParams(current);
          nextParams.delete("offset");
          return nextParams;
        },
        { replace: true }
      );
    }
    queryKeyRef.current = key;
  }, [tab, query, legacy, offset, setSearchParams]);

  useEffect(() => {
    if (!selectedId || loading || !items.length) return;
    if (items.some((item) => item.id === selectedId)) return;
    setSearchParams(
      (current) => {
        const nextParams = new URLSearchParams(current);
        nextParams.delete("entry");
        return nextParams;
      },
      { replace: true }
    );
  }, [items, selectedId, loading, setSearchParams]);

  useEffect(() => {
    document.getElementById("library-detail")?.scrollTo({ top: 0 });
  }, [selectedId]);

  const updateParams = (updates: Record<string, string | null>) => {
    setSearchParams(
      (current) => {
        const nextParams = new URLSearchParams(current);
        for (const [key, value] of Object.entries(updates)) {
          if (value === null || value === "") nextParams.delete(key);
          else nextParams.set(key, value);
        }
        return nextParams;
      },
      { replace: true }
    );
  };

  const selectTab = (nextTab: Tab) => {
    if (nextTab === tab) return;
    updateParams({ tab: nextTab === "feats" ? null : nextTab, entry: null, offset: null });
    setItems([]);
    setNext(null);
    setLoading(true);
  };

  const setQuery = (value: string) => {
    if (value !== query) {
      latestSearchRef.current = value;
      pendingSearchesRef.current.add(value);
    }
    updateParams({ q: value, entry: null, offset: null });
  };

  const onSearchChange = (value: string) => {
    setSearchText(value);
    setQuery(value);
  };

  const setLegacy = (value: boolean) => {
    updateParams({ legacy: value ? "1" : null, entry: null, offset: null });
  };

  const onTabKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const index = TABS.findIndex((entry) => entry.id === tab);
    let nextIndex = index;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % TABS.length;
    else if (event.key === "ArrowLeft") nextIndex = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = TABS.length - 1;
    else return;
    event.preventDefault();
    const nextTab = TABS[nextIndex].id;
    selectTab(nextTab);
    document.getElementById(`library-tab-${nextTab}`)?.focus();
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        let url = "";
        if (tab === "deities") {
          url = `/api/compendium/deities?q=${encodeURIComponent(query)}&limit=200`;
        } else if (tab === "domains") {
          url = `/api/compendium/domains?q=${encodeURIComponent(query)}&limit=200`;
        } else {
          const params = new URLSearchParams();
          params.set("q", query);
          params.set("limit", "100");
          params.set("offset", String(offset));
          if (!legacy) params.set("legacy", "0");
          const route = TAB_ROUTES[tab];
          if (route) url = `${route}?${params}`;
          if (tab === "feats") url = `/api/compendium/feats?${params}`;
          if (tab === "spells") url = `/api/compendium/spells?${params}`;
          if (tab === "items") url = `/api/compendium/equipment?${params}`;
          if (tab === "bestiary") url = `/api/compendium/monsters?${params}`;
        }
        const result = await api<{ items: Entry[]; total?: number; next?: number | null }>(url, {
          signal: controller.signal,
        });
        if (cancelled) return;
        if (offset === 0) {
          setItems(result.items);
        } else {
          setItems((current) => [...current, ...result.items]);
        }
        setTotal(result.total ?? result.items.length);
        setNext(result.next ?? null);
      } catch (err) {
        if (cancelled || (err as { name?: string }).name === "AbortError") return;
        setError(errorMessage(err));
        if (offset === 0) {
          setItems([]);
          setTotal(0);
          setNext(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 220);
    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [tab, query, legacy, offset, retryToken]);

  return (
    <div className="page library-page library-index-page">
      <div className="page-head">
        <div>
          <PageEyebrow>The archive</PageEyebrow>
          <h1>Library</h1>
          <p className="sub">
            Search ancestries, classes, feats, spells, items, creatures, deities, and rules
            references.
          </p>
        </div>
        <div className="library-count">
          <Dices size={15} aria-hidden="true" />
          <span>
            {total.toLocaleString()} {total === 1 ? "entry" : "entries"}
          </span>
        </div>
      </div>

      <div className="library-toolbar">
        <div
          className="library-tabs"
          role="tablist"
          aria-label="Library categories"
          onKeyDown={onTabKeyDown}
        >
          {TABS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              id={`library-tab-${entry.id}`}
              aria-selected={tab === entry.id}
              aria-controls="library-panel"
              tabIndex={tab === entry.id ? 0 : -1}
              className={tab === entry.id ? "is-active" : ""}
              onClick={() => selectTab(entry.id)}
            >
              {entry.icon} {entry.label}
            </button>
          ))}
        </div>
        <div className={`search-box library-search${searchText ? " has-clear" : ""}`}>
          <Search size={16} aria-hidden="true" />
          <Input
            value={searchText}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={`Search ${activeTab.label.toLowerCase()}…`}
            aria-label={`Search ${activeTab.label.toLowerCase()}`}
            autoComplete="off"
          />
          {searchText ? (
            <button
              type="button"
              className="search-clear"
              aria-label="Clear search input"
              onClick={() => onSearchChange("")}
            >
              <X size={14} aria-hidden="true" />
            </button>
          ) : null}
        </div>
        {tab !== "deities" && tab !== "domains" ? (
          <Toggle checked={legacy} onChange={setLegacy} label="Include legacy" />
        ) : null}
      </div>

      <div id="library-panel" role="tabpanel" aria-labelledby={`library-tab-${tab}`}>
        {error && !items.length ? (
          <ErrorState message={error} onRetry={() => setRetryToken((current) => current + 1)} />
        ) : (
          <div className="library-layout">
            <div className="library-list" id="library-results" aria-busy={loading}>
              {error ? (
                <ErrorState
                  message={error}
                  onRetry={() => setRetryToken((current) => current + 1)}
                />
              ) : null}
              {items.map((item) => (
                <HoverCard
                  key={item.id}
                  title={item.name}
                  subtitle={entrySubtitle(item, tab)}
                  body={entryDescription(item) || undefined}
                  footer={
                    "gmDescription" in item && item.gmDescription
                      ? "GM source text · Click to preview · Open full page for the complete entry"
                      : "Click to preview · Open full page for the complete entry"
                  }
                >
                  <button
                    type="button"
                    className={`library-row ${selected?.id === item.id ? "is-selected" : ""}`}
                    aria-current={selected?.id === item.id ? "true" : undefined}
                    aria-controls="library-detail"
                    onClick={() => updateParams({ entry: item.id })}
                  >
                    <div className="grow">
                      <span className="library-row-name">{item.name}</span>
                      <span className="library-row-sub">{entrySubtitle(item, tab)}</span>
                    </div>
                    {"gmDescription" in item && item.gmDescription ? (
                      <Tag tone="violet">GM source</Tag>
                    ) : null}
                    {"rarity" in item && item.rarity && item.rarity !== "common" ? (
                      <RarityTag rarity={item.rarity} />
                    ) : null}
                  </button>
                </HoverCard>
              ))}
              {!loading && !items.length ? (
                <EmptyState
                  icon={<Search size={24} />}
                  title={
                    query
                      ? `No ${activeTab.label.toLowerCase()} match “${query}”`
                      : `No ${activeTab.label.toLowerCase()} available`
                  }
                  description={query ? "Try a different term or clear the search." : undefined}
                  action={
                    query ? (
                      <Button variant="secondary" size="sm" onClick={() => setQuery("")}>
                        Clear search
                      </Button>
                    ) : undefined
                  }
                />
              ) : null}
              {loading ? <Spinner label="Searching the archive…" /> : null}
              {next !== null && !loading ? (
                <Button
                  variant="ghost"
                  size="sm"
                  block
                  onClick={() => updateParams({ offset: next === 0 ? null : String(next) })}
                >
                  Load more ({items.length} of {total})
                </Button>
              ) : null}
            </div>
            <div
              className="library-detail card"
              id="library-detail"
              role="region"
              aria-label="Entry detail"
            >
              {selected && compendiumKindFromId(selected.id) === TAB_KINDS[tab] ? (
                <CompendiumDetail
                  kind={TAB_KINDS[tab]}
                  entry={selected}
                  actions={
                    <Link
                      to={compendiumEntryPath(TAB_KINDS[tab], selected.id)}
                      state={{ from: returnTo }}
                      className="btn btn-ghost btn-sm"
                    >
                      Open full page
                    </Link>
                  }
                />
              ) : (
                <EmptyState
                  icon={<BookOpen size={28} />}
                  title="Select an entry"
                  description="Choose something from the archive to read it."
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
