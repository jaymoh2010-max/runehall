import { useEffect, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { BookOpen, Dices, Search, Shield, Skull, Sparkles, Swords } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import type { Deity, Equipment, Feat, Monster, Spell } from "../../shared/types";
import {
  compendiumEntryPath,
  compendiumKindFromId,
  spellTraditionLabel,
  stripHtml,
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

type Tab = "feats" | "spells" | "items" | "bestiary" | "deities";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "feats", label: "Feats", icon: <Swords size={15} /> },
  { id: "spells", label: "Spells", icon: <Sparkles size={15} /> },
  { id: "items", label: "Equipment", icon: <Shield size={15} /> },
  { id: "bestiary", label: "Bestiary", icon: <Skull size={15} /> },
  { id: "deities", label: "Deities", icon: <BookOpen size={15} /> },
];

type Entry = Feat | Spell | Equipment | Monster | Deity;

const TAB_KINDS: Record<Tab, CompendiumEntryKind> = {
  feats: "feat",
  spells: "spell",
  items: "equipment",
  bestiary: "monster",
  deities: "deity",
};

function entrySubtitle(item: Entry, tab: Tab): string {
  // Use the entry's own ID, not only the active tab, so a one-frame tab
  // transition can never feed a feat into the spell formatter.
  const kind = compendiumKindFromId(item.id) ?? TAB_KINDS[tab];
  switch (kind) {
    case "feat":
      return `Level ${(item as Feat).level} · ${(item as Feat).category}`;
    case "spell": {
      const spell = item as Spell;
      return `${spell.rank === 0 ? "Cantrip" : `Rank ${spell.rank}`} · ${spellTraditionLabel(spell)}`;
    }
    case "equipment":
      return `${(item as Equipment).type} · level ${(item as Equipment).level} · ${formatCp((item as Equipment).price.cpTotal)}`;
    case "monster":
      return `Level ${(item as Monster).level} · ${(item as Monster).hp} HP · AC ${(item as Monster).ac}`;
    case "deity":
      return `${(item as Deity).domains.slice(0, 3).join(", ") || "Deity"} · ${(item as Deity).source}`;
    default:
      return item.name;
  }
}

function entryDescription(item: Entry): string {
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
  const [items, setItems] = useState<Entry[]>([]);
  const [total, setTotal] = useState(0);
  const [next, setNext] = useState<number | null>(null);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retryToken, setRetryToken] = useState(0);
  const activeTab = TABS.find((entry) => entry.id === tab) ?? TABS[0];
  const selected = items.find((item) => item.id === selectedId) ?? items[0] ?? null;
  const returnTo = `/library${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;

  useEffect(() => {
    document.title = "Library · Runehall";
  }, []);

  useEffect(() => {
    setItems([]);
    setTotal(0);
    setNext(null);
    setOffset(0);
  }, [tab]);

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
    updateParams({ tab: nextTab === "feats" ? null : nextTab, entry: null });
    setOffset(0);
    setItems([]);
    setNext(null);
    setLoading(true);
  };

  const setQuery = (value: string) => {
    updateParams({ q: value, entry: null });
    setOffset(0);
  };

  const setLegacy = (value: boolean) => {
    updateParams({ legacy: value ? "1" : null, entry: null });
    setOffset(0);
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
        } else {
          const params = new URLSearchParams();
          params.set("q", query);
          params.set("limit", "100");
          params.set("offset", String(offset));
          if (!legacy) params.set("legacy", "0");
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
            Every feat, spell, item, creature, and deity available to your table.
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
        <div className="search-box library-search">
          <Search size={16} aria-hidden="true" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Search ${activeTab.label.toLowerCase()}…`}
            aria-label={`Search ${activeTab.label.toLowerCase()}`}
            autoComplete="off"
          />
        </div>
        {tab !== "deities" ? (
          <Toggle checked={legacy} onChange={setLegacy} label="Include legacy" />
        ) : null}
      </div>

      {error ? (
        <ErrorState message={error} onRetry={() => setRetryToken((current) => current + 1)} />
      ) : (
        <div id="library-panel" role="tabpanel" aria-labelledby={`library-tab-${tab}`}>
          <div className="library-layout">
            <div className="library-list" id="library-results" aria-busy={loading}>
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
                    {item.rarity && item.rarity !== "common" ? (
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
                <Button variant="ghost" size="sm" block onClick={() => setOffset(next)}>
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
        </div>
      )}
    </div>
  );
}
