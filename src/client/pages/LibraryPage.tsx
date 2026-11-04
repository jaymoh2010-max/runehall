import { useEffect, useState } from "react";
import { BookOpen, Dices, Search, Shield, Skull, Sparkles, Swords } from "lucide-react";
import { Link } from "react-router-dom";
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
import { useToasts } from "../stores";
import {
  Button,
  EmptyState,
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

export function LibraryPage() {
  const toast = useToasts((state) => state.push);
  const [tab, setTab] = useState<Tab>("feats");
  const [query, setQuery] = useState("");
  const [legacy, setLegacy] = useState(false);
  const [items, setItems] = useState<Entry[]>([]);
  const [total, setTotal] = useState(0);
  const [next, setNext] = useState<number | null>(null);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Entry | null>(null);

  useEffect(() => {
    document.title = "Library · Runehall";
  }, []);

  useEffect(() => {
    setItems([]);
    setSelected(null);
    setOffset(0);
  }, [tab]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
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
        const result = await api<{ items: Entry[]; total?: number; next?: number | null }>(url, { signal: controller.signal });
        if (cancelled) return;
        if (offset === 0) {
          setItems(result.items);
          setSelected(result.items[0] ?? null);
        } else {
          setItems((current) => [...current, ...result.items]);
        }
        setTotal(result.total ?? result.items.length);
        setNext(result.next ?? null);
      } catch (err) {
        if (cancelled || (err as { name?: string }).name === "AbortError") return;
        toast(errorMessage(err), "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 220);
    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [tab, query, legacy, offset, toast]);

  return (
    <div className="page library-page">
      <div className="page-head">
        <div>
          <PageEyebrow>The archive</PageEyebrow>
          <h1>Library</h1>
          <p className="sub">Every feat, spell, item, creature, and deity available to your table.</p>
        </div>
        <div className="library-count">
          <Dices size={15} />
          <span>{total.toLocaleString()} entries</span>
        </div>
      </div>

      <div className="library-toolbar">
        <div className="library-tabs">
          {TABS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={tab === entry.id ? "is-active" : ""}
              onClick={() => {
                if (entry.id === tab) return;
                setTab(entry.id);
                setItems([]);
                setSelected(null);
                setOffset(0);
                setNext(null);
                setLoading(true);
              }}
            >
              {entry.icon} {entry.label}
            </button>
          ))}
        </div>
        <div className="search-box library-search">
          <Search size={16} />
          <Input value={query} onChange={(event) => { setQuery(event.target.value); setOffset(0); }} placeholder={`Search ${TABS.find((entry) => entry.id === tab)?.label.toLowerCase()}…`} />
        </div>
        {tab !== "deities" ? (
          <Toggle
            checked={legacy}
            onChange={(value) => {
              setLegacy(value);
              setOffset(0);
            }}
            label="Include legacy"
          />
        ) : null}
      </div>

      <div className="library-layout">
        <div className="library-list">
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
                onClick={() => setSelected(item)}
              >
                <div className="grow">
                  <span className="library-row-name">{item.name}</span>
                  <span className="library-row-sub">{entrySubtitle(item, tab)}</span>
                </div>
                {"gmDescription" in item && item.gmDescription ? (
                  <Tag tone="violet">GM source</Tag>
                ) : null}
                {item.rarity && item.rarity !== "common" ? <RarityTag rarity={item.rarity} /> : null}
              </button>
            </HoverCard>
          ))}
          {!loading && !items.length ? <EmptyState icon={<Search size={24} />} title="Nothing found" description="Try a different search term." /> : null}
          {loading ? <Spinner label="Searching the archive…" /> : null}
          {next !== null && !loading ? (
            <Button variant="ghost" size="sm" block onClick={() => setOffset(next)}>Load more ({items.length} of {total})</Button>
          ) : null}
        </div>
        <div className="library-detail card">
          {selected && compendiumKindFromId(selected.id) === TAB_KINDS[tab] ? (
            <CompendiumDetail
              kind={TAB_KINDS[tab]}
              entry={selected}
              actions={
                <Link
                  to={compendiumEntryPath(TAB_KINDS[tab], selected.id)}
                  className="btn btn-ghost btn-sm"
                >
                  Open full page
                </Link>
              }
            />
          ) : (
            <EmptyState icon={<BookOpen size={28} />} title="Select an entry" description="Choose something from the archive to read it." />
          )}
        </div>
      </div>
    </div>
  );
}
