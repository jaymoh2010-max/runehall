import { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  Coins,
  Dices,
  Search,
  Shield,
  Skull,
  Sparkles,
  Swords,
} from "lucide-react";
import type { Deity, Equipment, Feat, Monster, Spell } from "../../shared/types";
import { api, formatCp } from "../api";
import { errorMessage } from "../stores";
import { useToasts } from "../stores";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  PageEyebrow,
  RarityTag,
  RichText,
  Spinner,
  Tag,
  Toggle,
} from "../components/ui";
import { titleCase, traitLabel, weaponDamageLabel } from "../../shared/rules";

type Tab = "feats" | "spells" | "items" | "bestiary" | "deities";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "feats", label: "Feats", icon: <Swords size={15} /> },
  { id: "spells", label: "Spells", icon: <Sparkles size={15} /> },
  { id: "items", label: "Equipment", icon: <Shield size={15} /> },
  { id: "bestiary", label: "Bestiary", icon: <Skull size={15} /> },
  { id: "deities", label: "Deities", icon: <BookOpen size={15} /> },
];

type Entry = Feat | Spell | Equipment | Monster | Deity;

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
        if (offset === 0) {
          setItems(result.items);
          setSelected(result.items[0] ?? null);
        } else {
          setItems((current) => [...current, ...result.items]);
        }
        setTotal(result.total ?? result.items.length);
        setNext(result.next ?? null);
      } catch (err) {
        if ((err as { name?: string }).name === "AbortError") return;
        toast(errorMessage(err), "error");
      } finally {
        setLoading(false);
      }
    }, 220);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [tab, query, legacy, offset, toast]);

  const currentTotal = tab === "deities" ? total : total;
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
          <span>{currentTotal.toLocaleString()} entries</span>
        </div>
      </div>

      <div className="library-toolbar">
        <div className="library-tabs">
          {TABS.map((entry) => (
            <button key={entry.id} type="button" className={tab === entry.id ? "is-active" : ""} onClick={() => setTab(entry.id)}>
              {entry.icon} {entry.label}
            </button>
          ))}
        </div>
        <div className="search-box library-search">
          <Search size={16} />
          <Input value={query} onChange={(event) => { setQuery(event.target.value); setOffset(0); }} placeholder={`Search ${TABS.find((entry) => entry.id === tab)?.label.toLowerCase()}…`} />
        </div>
        {tab !== "deities" ? <Toggle checked={legacy} onChange={setLegacy} label="Include legacy" /> : null}
      </div>

      <div className="library-layout">
        <div className="library-list">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`library-row ${selected?.id === item.id ? "is-selected" : ""}`}
              onClick={() => setSelected(item)}
            >
              <div className="grow">
                <span className="library-row-name">{item.name}</span>
                <span className="library-row-sub">
                  {tab === "feats" ? `Level ${(item as Feat).level} · ${(item as Feat).category}` : null}
                  {tab === "spells" ? `${(item as Spell).rank === 0 ? "Cantrip" : `Rank ${(item as Spell).rank}`} · ${(item as Spell).traditions.join(", ") || "focus"}` : null}
                  {tab === "items" ? `${(item as Equipment).type} · level ${(item as Equipment).level} · ${formatCp((item as Equipment).price.cpTotal)}` : null}
                  {tab === "bestiary" ? `Level ${(item as Monster).level} · ${(item as Monster).hp} HP · AC ${(item as Monster).ac}` : null}
                  {tab === "deities" ? `${(item as Deity).domains.slice(0, 3).join(", ") || "Deity"} · ${(item as Deity).source}` : null}
                </span>
              </div>
              {item.rarity && item.rarity !== "common" ? <RarityTag rarity={item.rarity} /> : null}
            </button>
          ))}
          {!loading && !items.length ? <EmptyState icon={<Search size={24} />} title="Nothing found" description="Try a different search term." /> : null}
          {loading ? <Spinner label="Searching the archive…" /> : null}
          {next !== null && !loading ? (
            <Button variant="ghost" size="sm" block onClick={() => setOffset(next)}>Load more ({items.length} of {total})</Button>
          ) : null}
        </div>
        <div className="library-detail card">
          {selected ? <LibraryDetail entry={selected} tab={tab} /> : (
            <EmptyState icon={<BookOpen size={28} />} title="Select an entry" description="Choose something from the archive to read it." />
          )}
        </div>
      </div>
    </div>
  );
}

function LibraryDetail({ entry, tab }: { entry: Entry; tab: Tab }) {
  if (tab === "feats") {
    const feat = entry as Feat;
    return (
      <div className="library-detail-body">
        <div className="library-detail-head">
          <div>
            <PageEyebrow>{feat.category} feat</PageEyebrow>
            <h2>{feat.name}</h2>
            <p className="muted small">Level {feat.level} · {feat.source}</p>
          </div>
          <RarityTag rarity={feat.rarity} />
        </div>
        <div className="chip-row" style={{ marginBottom: 12 }}>{feat.traits.map((trait) => <Tag key={trait}>{traitLabel(trait)}</Tag>)}</div>
        {feat.prerequisites.length ? <div className="prereq-box"><strong>Prerequisites</strong><ul>{feat.prerequisites.map((p, i) => <li key={i}>{p}</li>)}</ul></div> : null}
        <RichText html={feat.description} />
      </div>
    );
  }
  if (tab === "spells") {
    const spell = entry as Spell;
    return (
      <div className="library-detail-body">
        <div className="library-detail-head">
          <div>
            <PageEyebrow>{spell.rank === 0 ? "Cantrip" : `Rank ${spell.rank} spell`}</PageEyebrow>
            <h2>{spell.name}</h2>
            <p className="muted small">{spell.source} · {spell.traditions.join(", ") || "focus"}</p>
          </div>
          <RarityTag rarity={spell.rarity} />
        </div>
        <div className="chip-row" style={{ marginBottom: 12 }}>{[...spell.traits, ...spell.traditions].map((trait) => <Tag key={trait}>{traitLabel(trait)}</Tag>)}</div>
        <div className="spell-meta-grid">
          <div><span>Cast</span><strong>{spell.actions || "—"}</strong></div>
          <div><span>Range</span><strong>{spell.range || "—"}</strong></div>
          <div><span>Area</span><strong>{spell.area || "—"}</strong></div>
          <div><span>Targets</span><strong>{spell.targets || "—"}</strong></div>
          <div><span>Defense</span><strong>{spell.defense?.save || "—"}</strong></div>
          <div><span>Duration</span><strong>{spell.duration || "—"}</strong></div>
        </div>
        {spell.damageText ? <div className="damage-callout"><Swords size={14} /> {spell.damageText}</div> : null}
        <RichText html={spell.description} />
      </div>
    );
  }
  if (tab === "items") {
    const item = entry as Equipment;
    return (
      <div className="library-detail-body">
        <div className="library-detail-head">
          <div>
            <PageEyebrow>{item.type}</PageEyebrow>
            <h2>{item.name}</h2>
            <p className="muted small">Level {item.level} · {item.source}</p>
          </div>
          <RarityTag rarity={item.rarity} />
        </div>
        <div className="chip-row" style={{ marginBottom: 12 }}>{item.traits.map((trait) => <Tag key={trait}>{traitLabel(trait)}</Tag>)}</div>
        <div className="spell-meta-grid">
          <div><span>Price</span><strong><Coins size={12} /> {formatCp(item.price.cpTotal)}</strong></div>
          <div><span>Bulk</span><strong>{item.bulk || "—"}</strong></div>
          <div><span>Usage</span><strong>{item.usage || "—"}</strong></div>
          {item.weapon ? <div><span>Damage</span><strong>{weaponDamageLabel(item.weapon)}</strong></div> : null}
          {item.weapon ? <div><span>Category</span><strong>{item.weapon.category}</strong></div> : null}
          {item.armor ? <div><span>AC</span><strong>+{item.armor.acBonus} · Dex cap +{item.armor.dexCap}</strong></div> : null}
          {item.shield ? <div><span>Shield</span><strong>+{item.shield.acBonus} AC · hardness {item.shield.hardness}</strong></div> : null}
        </div>
        <RichText html={item.description} />
      </div>
    );
  }
  if (tab === "bestiary") {
    const monster = entry as Monster;
    return (
      <div className="library-detail-body">
        <div className="library-detail-head">
          <div>
            <PageEyebrow>Creature · level {monster.level}</PageEyebrow>
            <h2>{monster.name}</h2>
            <p className="muted small">{monster.source}</p>
          </div>
          <RarityTag rarity={monster.rarity} />
        </div>
        <div className="chip-row" style={{ marginBottom: 12 }}>{monster.traits.map((trait) => <Tag key={trait}>{traitLabel(trait)}</Tag>)}</div>
        <div className="monster-stat-grid">
          <div><span>HP</span><strong>{monster.hp}</strong></div>
          <div><span>AC</span><strong>{monster.ac}</strong></div>
          <div><span>Fort</span><strong>{monster.fortitude}</strong></div>
          <div><span>Ref</span><strong>{monster.reflex}</strong></div>
          <div><span>Will</span><strong>{monster.will}</strong></div>
          <div><span>Perception</span><strong>{monster.perception}</strong></div>
          <div><span>Size</span><strong>{monster.size}</strong></div>
          <div><span>Speed</span><strong>{monster.speeds.base} ft.</strong></div>
        </div>
        {monster.attacks.length ? (
          <div className="monster-attacks">
            <h3>Attacks</h3>
            {monster.attacks.map((attack) => (
              <div key={attack.name} className="monster-attack-row">
                <strong>{attack.name}</strong>
                <span className="mono">{attack.bonus >= 0 ? `+${attack.bonus}` : attack.bonus}</span>
                <span>{attack.damage}</span>
                <span className="chip-row">{attack.traits.map((trait) => <Tag key={trait}>{traitLabel(trait)}</Tag>)}</span>
              </div>
            ))}
          </div>
        ) : null}
        {monster.abilities.length ? (
          <div className="monster-abilities">
            <h3>Abilities</h3>
            {monster.abilities.map((ability) => (
              <details key={ability.name}>
                <summary><strong>{ability.name}</strong> {ability.actions ? <span className="tiny muted">· {ability.actions}</span> : null}</summary>
                <RichText html={ability.description} />
              </details>
            ))}
          </div>
        ) : null}
        <RichText html={monster.description || monster.blurb} />
      </div>
    );
  }
  const deity = entry as Deity;
  return (
    <div className="library-detail-body">
      <div className="library-detail-head">
        <div>
          <PageEyebrow>Deity</PageEyebrow>
          <h2>{deity.name}</h2>
          <p className="muted small">{deity.source} · {deity.category}</p>
        </div>
        <RarityTag rarity={deity.rarity} />
      </div>
      <div className="deity-grid">
        <div><span>Divine font</span><strong>{deity.font.join(", ") || "—"}</strong></div>
        <div><span>Skill</span><strong>{(deity.skill ?? []).map(titleCase).join(" or ") || "—"}</strong></div>
        <div><span>Domains</span><strong>{[...deity.domains, ...(deity.alternateDomains ?? [])].join(", ") || "—"}</strong></div>
        <div><span>Favored weapon</span><strong>{deity.weapons.join(", ") || "—"}</strong></div>
      </div>
      <RichText html={deity.description} />
    </div>
  );
}
