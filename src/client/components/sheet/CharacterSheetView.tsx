import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  BookOpen,
  ChevronDown,
  CircleAlert,
  Dices,
  Heart,
  Minus,
  Package,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Shield,
  Sparkles,
  Swords,
  TreePine,
  X,
} from "lucide-react";
import type {
  AbilityKey,
  CharacterCondition,
  CharacterContext,
  CharacterDraft,
  CharacterRecord,
  ConditionRef,
  DerivedCharacter,
  Equipment,
  SaveKey,
} from "../../../shared/types";
import {
  computeCharacter,
  normalizeCharacterDraft,
  signed,
  titleCase,
} from "../../../shared/rules";
import { currencyToCp } from "../../../shared/inventory";
import { applyHpEditToDraft } from "../../../shared/damage";
import { rollFormula } from "../../../shared/dice";
import { api, formatCp } from "../../api";
import { errorMessage, useToasts } from "../../stores";
import { getSocket, joinCampaign } from "../../socket";
import { Avatar, Badge, Spinner, Tag } from "../ui";

type SheetTab = "weapons" | "defense" | "gear" | "spells" | "feats" | "details" | "status";

const TABS: { id: SheetTab; label: string }[] = [
  { id: "weapons", label: "Weapons" },
  { id: "defense", label: "Defense" },
  { id: "gear", label: "Gear" },
  { id: "spells", label: "Spells" },
  { id: "feats", label: "Feats" },
  { id: "details", label: "Details" },
  { id: "status", label: "Status" },
];

const RANK_LABELS = ["U", "T", "E", "M", "L"];
const ABILITY_LABELS: Record<AbilityKey, string> = {
  str: "STR",
  dex: "DEX",
  con: "CON",
  int: "INT",
  wis: "WIS",
  cha: "CHA",
};
const SAVE_LABELS: Record<SaveKey, string> = {
  fortitude: "Fortitude",
  reflex: "Reflex",
  will: "Will",
};

interface LastRoll {
  label: string;
  total: number;
  breakdown: string;
}

export function CharacterSheetView({
  characterId,
  mode = "page",
  onClose,
  onRoll,
}: {
  characterId: string;
  mode?: "page" | "overlay";
  onClose?: () => void;
  onRoll?: (formula: string, label: string, dc: number | null, gmOnly: boolean) => void;
}) {
  const toast = useToasts((state) => state.push);
  const [character, setCharacter] = useState<CharacterRecord | null>(null);
  const [draft, setDraft] = useState<CharacterDraft | null>(null);
  const [context, setContext] = useState<CharacterContext | null>(null);
  const [derived, setDerived] = useState<DerivedCharacter | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<SheetTab>("weapons");
  const [lastRoll, setLastRoll] = useState<LastRoll | null>(null);
  const [hpInput, setHpInput] = useState("");
  const [trayOpen, setTrayOpen] = useState(false);
  const [trayFormula, setTrayFormula] = useState("1d20");
  const [conditionName, setConditionName] = useState("");
  const [conditionValue, setConditionValue] = useState("");
  const [conditionDuration, setConditionDuration] = useState("");
  const [conditions, setConditions] = useState<ConditionRef[]>([]);
  const [itemQuery, setItemQuery] = useState("");
  const [itemResults, setItemResults] = useState<Equipment[]>([]);
  const [itemQuantities, setItemQuantities] = useState<Record<string, string>>({});
  const [itemBusy, setItemBusy] = useState<string | null>(null);
  const [itemError, setItemError] = useState("");
  const [itemLoading, setItemLoading] = useState(false);

  const applyRecord = useCallback(async (record: CharacterRecord) => {
    const normalized = normalizeCharacterDraft(record.data, record.name);
    const contextResult = await api<{ context: CharacterContext }>(
      `/api/characters/${record.id}/context`,
      { method: "POST", body: { draft: normalized } }
    );
    setCharacter(record);
    setDraft(normalized);
    setContext(contextResult.context);
    setDerived(computeCharacter(normalized, contextResult.context));
    document.title = `${normalized.name} · Runehall`;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await api<{ character: CharacterRecord }>(`/api/characters/${characterId}`);
      await applyRecord(result.character);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [applyRecord, characterId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (derived) setHpInput(String(derived.currentHp));
  }, [derived?.currentHp, derived]);

  useEffect(() => {
    void api<{ items: ConditionRef[] }>("/api/compendium/conditions")
      .then((result) => setConditions(result.items))
      .catch(() => setConditions([]));
  }, []);

  useEffect(() => {
    const campaignId = character?.campaignId;
    if (!campaignId) return;
    const socket = getSocket();
    const leave = mode === "page" && !onRoll ? joinCampaign(campaignId) : () => undefined;
    const onCharacterUpdated = (payload: { characterId: string }) => {
      if (payload.characterId === characterId && !saving) void load();
    };
    socket.on("character:updated", onCharacterUpdated);
    return () => {
      socket.off("character:updated", onCharacterUpdated);
      leave();
    };
  }, [character?.campaignId, characterId, load, mode, onRoll, saving]);

  useEffect(() => {
    if (tab !== "gear") return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setItemLoading(true);
      setItemError("");
      try {
        const result = await api<{ items: Equipment[] }>(
          `/api/compendium/equipment?q=${encodeURIComponent(itemQuery)}&limit=30`
        );
        if (!cancelled) setItemResults(result.items);
      } catch (err) {
        if (!cancelled) setItemError(errorMessage(err));
      } finally {
        if (!cancelled) setItemLoading(false);
      }
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [itemQuery, tab]);

  const targetDc = null;
  const postRoll = useCallback(
    (formula: string, label: string, dc: number | null = targetDc, gmOnly = false) => {
      if (onRoll) {
        onRoll(formula, label, dc, gmOnly);
        return;
      }
      if (!character?.campaignId) {
        try {
          const result = rollFormula(formula, {});
          const total = result.total ?? 0;
          setLastRoll({ label, total, breakdown: result.breakdown ?? formula });
          toast(`${label}: ${total}`, "success");
        } catch {
          toast("That roll could not be made. Check the formula.", "error");
        }
        return;
      }
      getSocket().emit(
        "dice:roll",
        {
          campaignId: character.campaignId,
          formula,
          label,
          dc,
          visibility: gmOnly ? "gm" : "all",
          requestId: null,
        },
        (message) => {
          if (!message) {
            toast("That roll could not be made. Check the formula.", "error");
            return;
          }
          if (message.data && "total" in message.data) {
            setLastRoll({
              label,
              total: message.data.total,
              breakdown: message.data.breakdown ?? formula,
            });
            toast(
              `${label}: ${message.data.total}${message.data.degree ? ` · ${message.data.degree.replace("-", " ")}` : ""}`,
              "success"
            );
          }
        }
      );
    },
    [character?.campaignId, onRoll, targetDc, toast]
  );

  const persist = async (next: CharacterDraft) => {
    if (!character || !context || saving) return;
    const normalized = normalizeCharacterDraft(next, next.name);
    setDraft(normalized);
    setDerived(computeCharacter(normalized, context));
    setSaving(true);
    try {
      const result = await api<{ character: CharacterRecord }>(`/api/characters/${character.id}`, {
        method: "PUT",
        body: { data: normalized, expectedRevision: character.revision },
      });
      setCharacter(result.character);
      toast("Saved.", "success");
    } catch (err) {
      toast(errorMessage(err), "error");
      await load();
    } finally {
      setSaving(false);
    }
  };

  const changeHp = (value: number) => {
    if (!draft || !derived) return;
    const hp = Math.max(0, Math.min(derived.maxHp, Math.round(value)));
    const result = applyHpEditToDraft(draft, derived.maxHp, { type: "set", hp });
    void persist(result.draft);
  };

  const addCondition = () => {
    if (!draft) return;
    const name = conditionName.trim();
    if (!name) return;
    const entry: CharacterCondition = {
      name,
      value: conditionValue === "" ? null : Math.max(0, Math.round(Number(conditionValue))),
      duration:
        conditionDuration === "" ? null : Math.max(0, Math.round(Number(conditionDuration))),
    };
    void persist({
      ...draft,
      play: {
        ...draft.play,
        conditions: [
          ...draft.play.conditions.filter(
            (condition) => condition.name.toLowerCase() !== name.toLowerCase()
          ),
          entry,
        ],
      },
    });
    setConditionName("");
    setConditionValue("");
    setConditionDuration("");
  };

  const removeCondition = (index: number) => {
    if (!draft) return;
    void persist({
      ...draft,
      play: {
        ...draft.play,
        conditions: draft.play.conditions.filter((_condition, at) => at !== index),
      },
    });
  };

  const buyItem = async (item: Equipment, mode: "buy" | "grant") => {
    if (!character || itemBusy) return;
    setItemBusy(item.id);
    setItemError("");
    try {
      const quantity = Math.max(1, Math.round(Number(itemQuantities[item.id] ?? "1") || 1));
      const result = await api<{ character: CharacterRecord; costCp: number }>(
        `/api/characters/${character.id}/items`,
        { method: "POST", body: { itemId: item.id, quantity, mode } }
      );
      await applyRecord(result.character);
      toast(
        mode === "buy"
          ? `Bought ${quantity}× ${item.name} for ${formatCp(result.costCp)}.`
          : `Granted ${quantity}× ${item.name}.`,
        "success"
      );
    } catch (err) {
      setItemError(errorMessage(err));
    } finally {
      setItemBusy(null);
    }
  };

  const toggleEquipment = (itemId: string, field: "equipped" | "invested") => {
    if (!draft) return;
    void persist({
      ...draft,
      equipment: draft.equipment.map((entry) =>
        entry.itemId === itemId ? { ...entry, [field]: !entry[field] } : entry
      ),
    });
  };

  const spellEntries = useMemo(() => {
    if (!draft || !context) return [];
    const groups: { label: string; ids: string[] }[] = [
      { label: "Cantrips", ids: draft.spells.cantrips },
      { label: "Spells", ids: draft.spells.known },
      { label: "Prepared", ids: draft.spells.prepared },
      { label: "Focus", ids: draft.spells.focus },
      { label: "Innate", ids: draft.spells.innate },
      { label: "Rituals", ids: draft.spells.rituals },
    ];
    return groups.flatMap((group) =>
      [...new Set(group.ids)].map((id) => ({
        group: group.label,
        spell: context.spells[id] ?? null,
        id,
      }))
    );
  }, [context, draft]);

  const canGrant =
    Boolean(character?.permissions?.canAdvance) || Boolean(character?.campaignPlayerItemGrant);

  const weaponNameHref = (attackId: string | null, name: string) =>
    attackId ? `/library/item/${attackId}` : `/rules?tab=actions&q=${encodeURIComponent(name)}`;

  if (loading) {
    return (
      <div className={mode === "overlay" ? "pb-sheet-overlay" : "pb-sheet-page"}>
        <Spinner label="Opening character sheet…" />
      </div>
    );
  }
  if (error || !character || !draft || !context || !derived) {
    return (
      <div className={mode === "overlay" ? "pb-sheet-overlay" : "pb-sheet-page"}>
        <div className="pb-error">
          <CircleAlert size={22} />
          <p>{error || "That character could not be loaded."}</p>
          <button type="button" className="pb-button" onClick={() => void load()}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  const classData = context.classData ?? null;
  const hpPercent = derived.maxHp > 0 ? (derived.currentHp / derived.maxHp) * 100 : 0;
  const selectedFeatIds = new Set(derived.selectedFeats.map((feat) => feat.id));

  return (
    <div
      className={mode === "overlay" ? "pb-sheet-overlay" : "pb-sheet-page"}
      onClickCapture={(event) => {
        if (mode !== "overlay") return;
        const anchor = (event.target as HTMLElement | null)?.closest("a");
        if (!anchor || anchor.target === "_blank") return;
        event.preventDefault();
        window.open(anchor.href, "_blank", "noopener");
      }}
    >
      <header className="pb-topbar">
        <div className="pb-topbar-left">
          {mode === "overlay" && onClose ? (
            <button
              type="button"
              className="pb-icon-button"
              aria-label="Minimize sheet"
              onClick={onClose}
            >
              <ChevronDown size={18} />
            </button>
          ) : character.campaignId ? (
            <Link
              className="pb-icon-button"
              to={`/campaigns/${character.campaignId}`}
              aria-label="Back to campaign"
            >
              <ArrowLeft size={18} />
            </Link>
          ) : null}
          <div className="pb-title">
            <strong>{draft.name}</strong>
            <span>
              {classData?.name ?? "Unfinished"} {draft.level}
            </span>
          </div>
          <span className={`pb-save ${saving ? "is-saving" : ""}`}>
            {saving ? "Saving…" : "Saved"}
          </span>
        </div>
        <div className="pb-topbar-right">
          <button type="button" className="pb-button" onClick={() => window.print()}>
            <Printer size={14} /> Print
          </button>
          <a
            className="pb-button is-primary"
            href={`/characters/${character.id}/edit`}
            target={mode === "overlay" ? "_blank" : undefined}
            rel="noreferrer"
          >
            <Pencil size={14} /> Edit build
          </a>
          {mode === "overlay" && onClose ? (
            <button
              type="button"
              className="pb-icon-button"
              aria-label="Close sheet"
              onClick={onClose}
            >
              <X size={18} />
            </button>
          ) : null}
        </div>
      </header>

      <div className="pb-layout">
        <aside className="pb-build">
          <div className="pb-build-cards">
            <Link className="pb-build-card" to={`/library/ancestry/${draft.ancestryId}`}>
              <TreePine size={18} />
              <span>
                <em>Ancestry</em>
                <strong>{context.ancestry?.name ?? "Unselected"}</strong>
              </span>
            </Link>
            <Link
              className="pb-build-card"
              to={draft.backgroundId ? `/library/background/${draft.backgroundId}` : "/library"}
            >
              <BookOpen size={18} />
              <span>
                <em>Background</em>
                <strong>{context.background?.name ?? "Unselected"}</strong>
              </span>
            </Link>
            <Link
              className="pb-build-card"
              to={draft.classId ? `/library/class/${draft.classId}` : "/library"}
            >
              <Swords size={18} />
              <span>
                <em>Class</em>
                <strong>{classData?.name ?? "Unselected"}</strong>
              </span>
            </Link>
          </div>

          <div className="pb-build-summary">
            <div>
              <span>Heritage</span>
              <strong>{context.heritage?.name ?? "Not selected"}</strong>
            </div>
            <div>
              <span>Deity</span>
              <strong>{context.deity?.name ?? "None"}</strong>
            </div>
            <div>
              <span>Key ability</span>
              <strong>{draft.keyAbility?.toUpperCase() ?? "—"}</strong>
            </div>
            <div>
              <span>Size</span>
              <strong>{titleCase(derived.size)}</strong>
            </div>
          </div>

          <div className="pb-build-heading">
            <span>Level {draft.level}</span>
            <Link to={`/characters/${character.id}/edit`}>Open planner</Link>
          </div>
          <div className="pb-build-feats">
            {derived.features.slice(0, 8).map((feature) => (
              <div key={feature.name} className="pb-build-feat">
                <Sparkles size={13} />
                <span>{feature.name}</span>
              </div>
            ))}
            {derived.grantedFeats.slice(0, 8).map((feat) => (
              <div key={`granted-${feat.name}`} className="pb-build-feat is-granted">
                <Sparkles size={13} />
                <span>{feat.name}</span>
              </div>
            ))}
            {!derived.features.length && !derived.grantedFeats.length ? (
              <p className="pb-empty">No class features yet.</p>
            ) : null}
          </div>
        </aside>

        <section className="pb-center">
          <div className="pb-character-line">
            <div>
              <span className="pb-label">Character</span>
              <h1>{draft.name}</h1>
            </div>
            <div className="pb-level-xp">
              <span>
                <em>Level</em>
                <strong>{draft.level}</strong>
              </span>
              <span>
                <em>XP</em>
                <strong>{draft.play.xp}</strong>
              </span>
            </div>
          </div>

          <div className="pb-abilities">
            <div>
              <em>Size</em>
              <strong>{titleCase(derived.size)}</strong>
            </div>
            <div>
              <em>Speed</em>
              <strong>{derived.speed} ft.</strong>
            </div>
            {(Object.keys(ABILITY_LABELS) as AbilityKey[]).map((ability) => (
              <button
                key={ability}
                type="button"
                className="pb-ability"
                title={`Roll a ${ABILITY_LABELS[ability]} check`}
                onClick={() =>
                  postRoll(
                    `1d20${signed(derived.abilityMods[ability])}`,
                    `${ABILITY_LABELS[ability]} check`
                  )
                }
              >
                <em>{ABILITY_LABELS[ability]}</em>
                <strong>{signed(derived.abilityMods[ability])}</strong>
              </button>
            ))}
          </div>

          <div className="pb-vitals">
            <div className="pb-ac">
              <Shield size={20} />
              <strong>{derived.ac}</strong>
              <span>AC</span>
            </div>
            <div className="pb-hp">
              <div className="pb-hp-head">
                <span>
                  <Heart size={14} /> HP
                </span>
                <strong>
                  {derived.currentHp} / {derived.maxHp}
                </strong>
              </div>
              <div className="pb-hp-bar">
                <span style={{ width: `${hpPercent}%` }} />
              </div>
              <div className="pb-hp-controls">
                <button
                  type="button"
                  onClick={() => changeHp(derived.currentHp - 1)}
                  aria-label="Decrease hit points"
                >
                  <Minus size={12} />
                </button>
                <input
                  type="number"
                  aria-label="Current hit points"
                  value={hpInput}
                  onChange={(event) => setHpInput(event.target.value)}
                  onBlur={() => changeHp(Number(hpInput) || 0)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur();
                  }}
                />
                <button
                  type="button"
                  onClick={() => changeHp(derived.currentHp + 1)}
                  aria-label="Increase hit points"
                >
                  <Plus size={12} />
                </button>
                <button type="button" onClick={() => changeHp(derived.currentHp - 5)}>
                  −5
                </button>
                <button type="button" onClick={() => changeHp(derived.currentHp + 5)}>
                  +5
                </button>
              </div>
              <div className="pb-shield-line">
                {derived.shield ? derived.shield.name : "No shield"}
              </div>
            </div>
            <div className="pb-saves">
              {(["fortitude", "reflex", "will"] as SaveKey[]).map((save) => (
                <div className="pb-save-row" key={save}>
                  <Link to={`/rules?tab=basics&q=${SAVE_LABELS[save]}`}>
                    <span className={`pb-rank rank-${derived.prof[save]}`}>
                      {RANK_LABELS[derived.prof[save]]}
                    </span>
                    <strong>{signed(derived.saves[save])}</strong>
                    <span>{SAVE_LABELS[save]}</span>
                  </Link>
                  <button
                    type="button"
                    aria-label={`Roll ${SAVE_LABELS[save]} save`}
                    onClick={() =>
                      postRoll(`1d20${signed(derived.saves[save])}`, `${SAVE_LABELS[save]} save`)
                    }
                  >
                    <Dices size={13} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="pb-points">
            <div>
              <span>Hero Points</span>
              <div className="pb-pips">
                {[0, 1, 2].map((index) => (
                  <button
                    key={index}
                    type="button"
                    className={draft.play.heroPoints > index ? "is-on" : ""}
                    aria-label={`Set hero points to ${index + 1}`}
                    onClick={() =>
                      void persist({
                        ...draft,
                        play: {
                          ...draft.play,
                          heroPoints: draft.play.heroPoints === index + 1 ? index : index + 1,
                        },
                      })
                    }
                  />
                ))}
              </div>
            </div>
            <div className="pb-point-stat">
              <span>Class DC</span>
              <strong>{derived.classDc}</strong>
            </div>
            <div className="pb-point-stat">
              <span>Perception</span>
              <strong>{signed(derived.perception)}</strong>
              <button
                type="button"
                aria-label="Roll Perception"
                onClick={() => postRoll(`1d20${signed(derived.perception)}`, "Perception")}
              >
                <Dices size={12} />
              </button>
            </div>
            <div className="pb-point-stat">
              <span>Initiative</span>
              <strong>{signed(derived.initiative)}</strong>
              <button
                type="button"
                aria-label="Roll Initiative"
                onClick={() => postRoll(`1d20${signed(derived.initiative)}`, "Initiative")}
              >
                <Dices size={12} />
              </button>
            </div>
            {derived.focusPointsMax > 0 ? (
              <div className="pb-point-stat">
                <span>Focus</span>
                <strong>
                  {draft.play.focusPoints} / {derived.focusPointsMax}
                </strong>
              </div>
            ) : null}
          </div>

          <div className="pb-skills">
            <div className="pb-skills-head">
              <h2>Skills</h2>
              <span>Click a name for rules · click the die to roll</span>
            </div>
            {derived.skills.map((skill) => (
              <div className="pb-skill-row" key={skill.id}>
                <Link to={`/rules?tab=basics&q=${encodeURIComponent(skill.name)}`}>
                  <span className={`pb-rank rank-${skill.rank}`}>{RANK_LABELS[skill.rank]}</span>
                  <strong>{signed(skill.mod)}</strong>
                  <span>{skill.name}</span>
                  <em>{ABILITY_LABELS[skill.ability]}</em>
                </Link>
                <button
                  type="button"
                  aria-label={`Roll ${skill.name}`}
                  onClick={() => postRoll(`1d20${signed(skill.mod)}`, skill.name)}
                >
                  <Dices size={13} />
                </button>
              </div>
            ))}
            {derived.lore.map((lore) => (
              <div className="pb-skill-row" key={lore.name}>
                <Link to={`/rules?tab=basics&q=${encodeURIComponent(lore.name)}`}>
                  <span className={`pb-rank rank-${lore.rank}`}>{RANK_LABELS[lore.rank]}</span>
                  <strong>{signed(lore.mod)}</strong>
                  <span>{lore.name}</span>
                  <em>Lore</em>
                </Link>
                <button
                  type="button"
                  aria-label={`Roll ${lore.name}`}
                  onClick={() => postRoll(`1d20${signed(lore.mod)}`, lore.name)}
                >
                  <Dices size={13} />
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="pb-panel">
          <nav className="pb-tabs" aria-label="Character sheet sections">
            {TABS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={tab === entry.id ? "is-active" : ""}
                onClick={() => setTab(entry.id)}
              >
                {entry.label}
              </button>
            ))}
          </nav>

          <div className="pb-tab-body">
            {tab === "weapons" ? (
              <div className="pb-list">
                {derived.attacks.length ? (
                  derived.attacks.map((attack) => (
                    <div className="pb-weapon-row" key={attack.id}>
                      <div className="pb-weapon-name">
                        <Link to={weaponNameHref(attack.sourceItemId, attack.name)}>
                          <strong>{attack.name}</strong>
                        </Link>
                        <span>
                          {signed(attack.attackBonus)} to hit · {attack.damageFormula}{" "}
                          {attack.damageType}
                        </span>
                        <span className="pb-tags">
                          {attack.traits.slice(0, 4).map((trait) => (
                            <Tag key={trait}>{titleCase(trait)}</Tag>
                          ))}
                        </span>
                      </div>
                      <div className="pb-row-actions">
                        <button
                          type="button"
                          className="pb-die-button"
                          aria-label={`Roll ${attack.name} attack`}
                          onClick={() => postRoll(attack.attackFormula, `${attack.name} attack`)}
                        >
                          <Dices size={14} /> {signed(attack.attackBonus)}
                        </button>
                        <button
                          type="button"
                          className="pb-small-button"
                          title="Second attack with the multiple attack penalty"
                          onClick={() =>
                            postRoll(
                              attack.attackFormula.replace(
                                /([+-]?\d+)$/,
                                (match) =>
                                  `${Number(match) - (attack.traits.includes("agile") ? 4 : 5)}`
                              ),
                              `${attack.name} attack (2nd)`
                            )
                          }
                        >
                          2nd
                        </button>
                        <button
                          type="button"
                          className="pb-small-button"
                          title="Third attack with the multiple attack penalty"
                          onClick={() =>
                            postRoll(
                              attack.attackFormula.replace(
                                /([+-]?\d+)$/,
                                (match) =>
                                  `${Number(match) - (attack.traits.includes("agile") ? 8 : 10)}`
                              ),
                              `${attack.name} attack (3rd)`
                            )
                          }
                        >
                          3rd
                        </button>
                        <button
                          type="button"
                          className="pb-small-button"
                          onClick={() => postRoll(attack.damageFormula, `${attack.name} damage`)}
                        >
                          {attack.damageFormula} {attack.damageType}
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="pb-empty">No weapons or unarmed attacks are recorded yet.</p>
                )}
              </div>
            ) : null}

            {tab === "defense" ? (
              <div className="pb-stack">
                <div className="pb-stat-grid">
                  <div>
                    <span>Armor Class</span>
                    <strong>{derived.ac}</strong>
                  </div>
                  <div>
                    <span>Shield</span>
                    <strong>{derived.shield ? derived.shield.name : "None"}</strong>
                  </div>
                  <div>
                    <span>Speed</span>
                    <strong>{derived.speed} ft.</strong>
                  </div>
                  <div>
                    <span>Bulk</span>
                    <strong>
                      {derived.bulk.total} / {derived.bulk.capacity}
                    </strong>
                  </div>
                </div>
                {(["fortitude", "reflex", "will"] as SaveKey[]).map((save) => (
                  <div className="pb-defense-row" key={save}>
                    <Link to={`/rules?tab=basics&q=${SAVE_LABELS[save]}`}>
                      <span className={`pb-rank rank-${derived.prof[save]}`}>
                        {RANK_LABELS[derived.prof[save]]}
                      </span>
                      <strong>{SAVE_LABELS[save]}</strong>
                      <em>{signed(derived.saves[save])}</em>
                    </Link>
                    <button
                      type="button"
                      aria-label={`Roll ${SAVE_LABELS[save]} save`}
                      onClick={() =>
                        postRoll(`1d20${signed(derived.saves[save])}`, `${SAVE_LABELS[save]} save`)
                      }
                    >
                      <Dices size={13} />
                    </button>
                  </div>
                ))}
                {derived.shield ? (
                  <div className="pb-callout">
                    <Shield size={16} />
                    <span>
                      {derived.shield.name} · Hardness {derived.shield.hardness} · HP{" "}
                      {derived.shield.hp} · BT {derived.shield.brokenThreshold}
                    </span>
                  </div>
                ) : null}
              </div>
            ) : null}

            {tab === "gear" ? (
              <div className="pb-stack">
                <div className="pb-currency">
                  {(["gp", "sp", "cp"] as const).map((coin) => (
                    <div key={coin}>
                      <span>{coin.toUpperCase()}</span>
                      <strong>{draft.currency[coin]}</strong>
                    </div>
                  ))}
                  <div>
                    <span>Total</span>
                    <strong>{formatCp(currencyToCp(draft.currency))}</strong>
                  </div>
                </div>

                <div className="pb-gear-search">
                  <div className="pb-search-row">
                    <Search size={14} />
                    <input
                      value={itemQuery}
                      onChange={(event) => setItemQuery(event.target.value)}
                      placeholder="Search the item database"
                      aria-label="Search the item database"
                    />
                    {itemLoading ? <span className="pb-loading-dot" /> : null}
                  </div>
                  {itemError ? <p className="pb-error-text">{itemError}</p> : null}
                  <div className="pb-item-results">
                    {itemResults.slice(0, 16).map((item) => (
                      <div className="pb-item-row" key={item.id}>
                        <Link to={`/library/item/${item.id}`} className="pb-item-name">
                          <strong>{item.name}</strong>
                          <span>
                            Level {item.level} · {formatCp(item.price.cpTotal)}
                          </span>
                        </Link>
                        <input
                          className="pb-qty"
                          type="number"
                          min={1}
                          max={99}
                          aria-label={`Quantity for ${item.name}`}
                          value={itemQuantities[item.id] ?? "1"}
                          onChange={(event) =>
                            setItemQuantities((current) => ({
                              ...current,
                              [item.id]: event.target.value,
                            }))
                          }
                        />
                        <button
                          type="button"
                          className="pb-small-button is-primary"
                          disabled={itemBusy === item.id}
                          onClick={() => void buyItem(item, "buy")}
                        >
                          Buy
                        </button>
                        {canGrant ? (
                          <button
                            type="button"
                            className="pb-small-button"
                            disabled={itemBusy === item.id}
                            title="Add without paying (GM permission)"
                            onClick={() => void buyItem(item, "grant")}
                          >
                            Grant
                          </button>
                        ) : null}
                      </div>
                    ))}
                    {!itemResults.length && !itemLoading ? (
                      <p className="pb-empty">No items match that search.</p>
                    ) : null}
                  </div>
                  {!canGrant ? (
                    <p className="pb-hint">
                      The GM can enable free gear grants in campaign settings.
                    </p>
                  ) : null}
                </div>

                <div className="pb-inventory">
                  <h3>Inventory</h3>
                  {draft.equipment.length ? (
                    draft.equipment.map((entry) => {
                      const item = context.equipment[entry.itemId] ?? null;
                      return (
                        <div className="pb-inventory-row" key={entry.itemId}>
                          <Link to={`/library/item/${entry.itemId}`}>
                            <Package size={13} />
                            <strong>{item?.name ?? entry.itemId}</strong>
                            <span>×{entry.quantity}</span>
                          </Link>
                          <div className="pb-row-actions">
                            {item?.price ? <span>{formatCp(item.price.cpTotal)} each</span> : null}
                            <button
                              type="button"
                              className={
                                entry.equipped ? "pb-small-button is-on" : "pb-small-button"
                              }
                              onClick={() => toggleEquipment(entry.itemId, "equipped")}
                            >
                              {entry.equipped ? "Equipped" : "Equip"}
                            </button>
                            <button
                              type="button"
                              className={
                                entry.invested ? "pb-small-button is-on" : "pb-small-button"
                              }
                              onClick={() => toggleEquipment(entry.itemId, "invested")}
                            >
                              {entry.invested ? "Invested" : "Invest"}
                            </button>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <p className="pb-empty">No gear yet. Search above to buy or grant an item.</p>
                  )}
                </div>
              </div>
            ) : null}

            {tab === "spells" ? (
              <div className="pb-stack">
                <div className="pb-stat-grid">
                  <div>
                    <span>Spell DC</span>
                    <strong>{derived.spellDc ?? "—"}</strong>
                  </div>
                  <div>
                    <span>Spell attack</span>
                    <strong>
                      {derived.spellAttack === null ? "—" : signed(derived.spellAttack)}
                    </strong>
                    {derived.spellAttack !== null ? (
                      <button
                        type="button"
                        onClick={() =>
                          postRoll(`1d20${signed(derived.spellAttack ?? 0)}`, "Spell attack")
                        }
                      >
                        <Dices size={12} />
                      </button>
                    ) : null}
                  </div>
                </div>
                {spellEntries.length ? (
                  spellEntries.map(({ group, spell, id }, index) => (
                    <div className="pb-spell-row" key={`${group}-${id}-${index}`}>
                      <Link to={`/library/spell/${id}`}>
                        <strong>{spell?.name ?? id}</strong>
                        <span>
                          {group} ·{" "}
                          {spell
                            ? spell.rank === 0
                              ? "Cantrip"
                              : `Rank ${spell.rank}`
                            : "Unknown rank"}
                        </span>
                      </Link>
                      {spell?.traits.includes("attack") && derived.spellAttack !== null ? (
                        <button
                          type="button"
                          className="pb-small-button"
                          onClick={() =>
                            postRoll(
                              `1d20${signed(derived.spellAttack ?? 0)}`,
                              `${spell.name} spell attack`
                            )
                          }
                        >
                          <Dices size={12} /> Attack
                        </button>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <p className="pb-empty">No spells recorded.</p>
                )}
              </div>
            ) : null}

            {tab === "feats" ? (
              <div className="pb-stack">
                {derived.selectedFeats.length ? (
                  derived.selectedFeats.map((feat) => (
                    <div className="pb-feat-row" key={feat.id}>
                      <Link to={`/library/feat/${feat.id}`}>
                        <strong>{feat.name}</strong>
                        <span>
                          Level {feat.level} · {feat.traits.slice(0, 3).join(", ") || "Feat"}
                        </span>
                      </Link>
                      {selectedFeatIds.has(feat.id) ? <Badge tone="gold">Selected</Badge> : null}
                    </div>
                  ))
                ) : (
                  <p className="pb-empty">No feats selected.</p>
                )}
                {derived.grantedFeats.length ? (
                  <div className="pb-subsection">
                    <h3>Granted</h3>
                    {derived.grantedFeats.map((feat) => (
                      <div className="pb-feat-row" key={`granted-${feat.name}`}>
                        {feat.id ? (
                          <Link to={`/library/feat/${feat.id}`}>
                            <strong>{feat.name}</strong>
                            <span>Granted by {feat.source ?? "class"}</span>
                          </Link>
                        ) : (
                          <div>
                            <strong>{feat.name}</strong>
                            <span>Granted by {feat.source ?? "class"}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            {tab === "details" ? (
              <div className="pb-stack">
                <div className="pb-detail-grid">
                  <div>
                    <span>Ancestry</span>
                    <Link
                      to={draft.ancestryId ? `/library/ancestry/${draft.ancestryId}` : "/library"}
                    >
                      {context.ancestry?.name ?? "—"}
                    </Link>
                  </div>
                  <div>
                    <span>Heritage</span>
                    <strong>{context.heritage?.name ?? "—"}</strong>
                  </div>
                  <div>
                    <span>Background</span>
                    <Link
                      to={
                        draft.backgroundId
                          ? `/library/background/${draft.backgroundId}`
                          : "/library"
                      }
                    >
                      {context.background?.name ?? "—"}
                    </Link>
                  </div>
                  <div>
                    <span>Class</span>
                    <Link to={draft.classId ? `/library/class/${draft.classId}` : "/library"}>
                      {classData?.name ?? "—"}
                    </Link>
                  </div>
                  <div>
                    <span>Deity</span>
                    <strong>{context.deity?.name ?? "—"}</strong>
                  </div>
                  <div>
                    <span>Key ability</span>
                    <strong>{draft.keyAbility?.toUpperCase() ?? "—"}</strong>
                  </div>
                </div>
                <div>
                  <h3>Languages</h3>
                  <p>{derived.languages.join(", ") || "—"}</p>
                </div>
                <div>
                  <h3>Senses</h3>
                  <p>{derived.senses.join(", ") || "Normal"}</p>
                </div>
                {derived.notes.length ? (
                  <div>
                    <h3>Manual tracking</h3>
                    <ul className="pb-note-list">
                      {derived.notes.map((note) => (
                        <li key={note}>{note}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <div>
                  <h3>Notes</h3>
                  <p className="pb-preline">{draft.details.notes || "No notes yet."}</p>
                </div>
              </div>
            ) : null}

            {tab === "status" ? (
              <div className="pb-stack">
                <div className="pb-status-head">
                  <h3>Conditions</h3>
                  <span>Tracked by hand</span>
                </div>
                <div className="pb-condition-list">
                  {draft.play.conditions.length ? (
                    draft.play.conditions.map((condition, index) => (
                      <div className="pb-condition" key={`${condition.name}-${index}`}>
                        <Tag tone="red">
                          {condition.name}
                          {condition.value ? ` ${condition.value}` : ""}
                          {condition.duration ? ` (${condition.duration}r)` : ""}
                        </Tag>
                        <button
                          type="button"
                          aria-label={`Remove ${condition.name}`}
                          onClick={() => removeCondition(index)}
                        >
                          <X size={13} />
                        </button>
                      </div>
                    ))
                  ) : (
                    <p className="pb-empty">No conditions.</p>
                  )}
                </div>
                <div className="pb-condition-form">
                  <input
                    list="pb-condition-options"
                    value={conditionName}
                    placeholder="Condition"
                    aria-label="Condition name"
                    onChange={(event) => setConditionName(event.target.value)}
                  />
                  <datalist id="pb-condition-options">
                    {conditions.map((condition) => (
                      <option key={condition.id} value={condition.name} />
                    ))}
                  </datalist>
                  <input
                    type="number"
                    value={conditionValue}
                    placeholder="Value"
                    aria-label="Condition value"
                    onChange={(event) => setConditionValue(event.target.value)}
                  />
                  <input
                    type="number"
                    value={conditionDuration}
                    placeholder="Rounds"
                    aria-label="Condition duration in rounds"
                    onChange={(event) => setConditionDuration(event.target.value)}
                  />
                  <button
                    type="button"
                    className="pb-small-button is-primary"
                    onClick={addCondition}
                  >
                    Add
                  </button>
                </div>
                <p className="pb-hint">
                  Conditions affect the character math, but durations and recovery checks are
                  manual.
                </p>
                <div className="pb-subsection">
                  <h3>Ongoing effects</h3>
                  <p className="pb-hint">
                    Fast healing, persistent damage, and afflictions are tracked in the dice log and
                    notes.
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        </section>
      </div>

      <div className="pb-dice-wrap">
        {trayOpen ? (
          <div className="pb-dice-tray">
            <div className="pb-dice-tray-head">
              <strong>Dice Tray</strong>
              <button type="button" aria-label="Close dice tray" onClick={() => setTrayOpen(false)}>
                <X size={14} />
              </button>
            </div>
            <div className="pb-dice-buttons">
              {[4, 6, 8, 10, 12, 20].map((sides) => (
                <button
                  key={sides}
                  type="button"
                  onClick={() => postRoll(`1d${sides}`, `d${sides}`)}
                >
                  d{sides}
                </button>
              ))}
            </div>
            <form
              className="pb-dice-form"
              onSubmit={(event) => {
                event.preventDefault();
                postRoll(trayFormula, trayFormula);
              }}
            >
              <input
                value={trayFormula}
                aria-label="Dice formula"
                onChange={(event) => setTrayFormula(event.target.value)}
              />
              <button type="submit" className="pb-small-button is-primary">
                Roll
              </button>
            </form>
            {lastRoll ? (
              <div className="pb-last-roll">
                <span>{lastRoll.label}</span>
                <strong>{lastRoll.total}</strong>
                <em>{lastRoll.breakdown}</em>
              </div>
            ) : null}
          </div>
        ) : null}
        <button
          type="button"
          className="pb-dice-fab"
          aria-label={trayOpen ? "Close dice tray" : "Open dice tray"}
          onClick={() => setTrayOpen((open) => !open)}
        >
          <Dices size={24} />
        </button>
      </div>
    </div>
  );
}
