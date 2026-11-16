import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRightLeft,
  BookOpen,
  CheckCircle2,
  CircleAlert,
  Coins,
  Dices,
  Heart,
  Minus,
  Moon,
  Pencil,
  Plus,
  Printer,
  ScrollText,
  Shield,
  Shuffle,
  Sparkles,
  Swords,
  Trash2,
  UserRound,
} from "lucide-react";
import {
  ABILITIES,
  ABILITY_LABELS,
  ABILITY_SHORT,
  PROFICIENCY_NAMES,
  SAVE_LABELS,
  SIZES,
  SKILLS,
  type CharacterContext,
  type CharacterDraft,
  type CharacterRecord,
  type CharacterCondition,
  type ConditionRef,
  type DerivedCharacter,
  type RollResult,
} from "../../shared/types";
import {
  casterInfo,
  computeCharacter,
  isPreparedCasterClass,
  normalizeCharacterDraft,
  selectedChoiceOptions,
  signed,
  titleCase,
} from "../../shared/rules";
import { DEGREE_LABELS, mod, rollFormula } from "../../shared/dice";
import { currencyToCp } from "../../shared/inventory";
import { applyLongRest } from "../../shared/rest";
import { xpProgress } from "../../shared/xp";
import { spellTraditionLabel, stripHtml } from "../../shared/compendium";
import { conditionLabel } from "../../shared/tokens";
import { api, ApiError, formatCp } from "../api";
import { errorMessage } from "../stores";
import { useToasts } from "../stores";
import { connectSocket } from "../socket";
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  IconButton,
  Input,
  LoadingScreen,
  Modal,
  PageEyebrow,
  ProgressBar,
  RichText,
  Select,
  Stat,
  Tag,
  Toggle,
} from "../components/ui";
import { HoverCard } from "../components/HoverCard";

const COMMON_CONDITIONS = [
  "Blinded",
  "Clumsy",
  "Confused",
  "Deafened",
  "Dazzled",
  "Drained",
  "Encumbered",
  "Enfeebled",
  "Fascinated",
  "Fatigued",
  "Fleeing",
  "Frightened",
  "Grabbed",
  "Immobilized",
  "Off-Guard",
  "Paralyzed",
  "Petrified",
  "Prone",
  "Quickened",
  "Sickened",
  "Slowed",
  "Stunned",
  "Stupefied",
  "Unconscious",
  "Wounded",
];

export function CharacterSheetPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToasts((state) => state.push);
  const [character, setCharacter] = useState<CharacterRecord | null>(null);
  const [draft, setDraft] = useState<CharacterDraft | null>(null);
  const [context, setContext] = useState<CharacterContext>({
    feats: {},
    spells: {},
    equipment: {},
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [rollLog, setRollLog] = useState<RollResult | null>(null);
  const [conditionName, setConditionName] = useState("");
  const [conditionValue, setConditionValue] = useState("");
  const [conditionDuration, setConditionDuration] = useState("");
  const [conditions, setConditions] = useState<ConditionRef[]>([]);
  const [party, setParty] = useState<CharacterRecord[]>([]);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferMode, setTransferMode] = useState<"item" | "coins">("item");
  const [transferItemId, setTransferItemId] = useState<string | null>(null);
  const [transferQuantity, setTransferQuantity] = useState("1");
  const [transferTargetId, setTransferTargetId] = useState("");
  const [transferCoins, setTransferCoins] = useState({ gp: "0", sp: "0", cp: "0" });
  const [transferBusy, setTransferBusy] = useState(false);
  const [transferError, setTransferError] = useState("");
  const [transferLoading, setTransferLoading] = useState(false);
  const [restOpen, setRestOpen] = useState(false);
  const [restRough, setRestRough] = useState(false);
  const [conflict, setConflict] = useState<CharacterRecord | null>(null);
  const initialized = useRef(false);
  const skipInitialSave = useRef(true);
  const characterRef = useRef<CharacterRecord | null>(null);
  const draftRef = useRef<CharacterDraft | null>(null);
  const saveInFlight = useRef(false);
  const saveQueued = useRef(false);
  const conflictRef = useRef(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const [result, conditionResult] = await Promise.all([
          api<{ character: CharacterRecord }>(`/api/characters/${id}`),
          api<{ items: ConditionRef[] }>("/api/compendium/conditions"),
        ]);
        if (cancelled) return;
        const normalized = normalizeCharacterDraft(result.character.data, result.character.name);
        const contextResult = await api<{ context: CharacterContext }>(
          `/api/characters/${id}/context`,
          {
            method: "POST",
            body: { draft: normalized },
          }
        );
        if (cancelled) return;
        setCharacter(result.character);
        characterRef.current = result.character;
        setDraft(normalized);
        draftRef.current = normalized;
        setContext(contextResult.context);
        setConditions(conditionResult.items);
        initialized.current = true;
        document.title = `${normalized.name} · Runehall`;
      } catch (err) {
        if (!cancelled) setError(errorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const derived = useMemo(
    () => (draft ? computeCharacter(draft, context) : null),
    [draft, context]
  );
  const canEdit = Boolean(character?.permissions?.canEdit);

  const transferTargets = useMemo(
    () => party.filter((entry) => entry.id !== character?.id),
    [party, character?.id]
  );
  const transferEntry = useMemo(
    () =>
      draft && transferItemId
        ? (draft.equipment.find((entry) => entry.itemId === transferItemId) ?? null)
        : null,
    [draft, transferItemId]
  );
  const transferItem = transferItemId ? (context.equipment[transferItemId] ?? null) : null;
  const transferTotalCp = currencyToCp({
    gp: Number(transferCoins.gp) || 0,
    sp: Number(transferCoins.sp) || 0,
    cp: Number(transferCoins.cp) || 0,
  });
  const inventoryValue = useMemo(
    () =>
      (draft?.equipment ?? []).reduce(
        (total, entry) =>
          total + (context.equipment[entry.itemId]?.price.cpTotal ?? 0) * entry.quantity,
        0
      ),
    [draft?.equipment, context.equipment]
  );

  const saveDraft = useCallback(
    async (force = false) => {
      if (!id || !canEdit) return;
      if (saveInFlight.current) {
        saveQueued.current = true;
        return;
      }
      saveInFlight.current = true;
      try {
        let forceOnce = force;
        let currentDraft: CharacterDraft | null = null;
        do {
          saveQueued.current = false;
          currentDraft = draftRef.current;
          if (!currentDraft) break;
          setSaveState("saving");
          try {
            const result = await api<{ character: CharacterRecord }>(`/api/characters/${id}`, {
              method: "PUT",
              body: forceOnce
                ? { data: currentDraft, force: true }
                : { data: currentDraft, expectedRevision: characterRef.current?.revision },
            });
            forceOnce = false;
            characterRef.current = result.character;
            setCharacter(result.character);
            setConflict(null);
            conflictRef.current = false;
            if (draftRef.current === currentDraft) setSaveState("saved");
          } catch (err) {
            if (err instanceof ApiError && err.status === 409) {
              const payload = err.payload as { character?: CharacterRecord } | null;
              if (payload?.character) {
                setConflict(payload.character);
                conflictRef.current = true;
              }
            } else {
              toast(errorMessage(err), "error");
            }
            setSaveState("error");
            break;
          }
        } while (saveQueued.current || draftRef.current !== currentDraft);
      } finally {
        saveInFlight.current = false;
      }
    },
    [id, canEdit, toast]
  );

  useEffect(() => {
    if (!draft || !id || !canEdit || !initialized.current) return;
    if (skipInitialSave.current || conflictRef.current) return;
    setSaveState("saving");
    const timer = window.setTimeout(() => void saveDraft(), 500);
    return () => window.clearTimeout(timer);
  }, [draft, id, canEdit, saveDraft]);

  const applyServerVersion = async () => {
    if (!conflict) return;
    const normalized = normalizeCharacterDraft(conflict.data, conflict.name);
    characterRef.current = conflict;
    setCharacter(conflict);
    skipInitialSave.current = true;
    setDraft(normalized);
    draftRef.current = normalized;
    conflictRef.current = false;
    setConflict(null);
    setSaveState("saved");
    document.title = `${normalized.name} · Runehall`;
    try {
      const result = await api<{ context: CharacterContext }>(`/api/characters/${id}/context`, {
        method: "POST",
        body: { draft: normalized },
      });
      setContext(result.context);
    } catch {
      // The server draft remains usable; context refreshes on the next save.
    }
  };

  const overwriteConflict = () => {
    conflictRef.current = false;
    setConflict(null);
    setSaveState("saving");
    void saveDraft(true);
  };

  const update = (updater: (current: CharacterDraft) => CharacterDraft) => {
    if (!canEdit) return;
    skipInitialSave.current = false;
    setDraft((current) => {
      if (!current) return current;
      const next = updater(current);
      draftRef.current = next;
      return next;
    });
  };

  const restPreview = draft && derived ? applyLongRest(draft, derived, { rough: restRough }) : null;

  const takeLongRest = () => {
    if (!draft || !derived) return;
    const result = applyLongRest(draft, derived, { rough: restRough });
    skipInitialSave.current = false;
    draftRef.current = result.draft;
    setDraft(result.draft);
    setRestOpen(false);
    setRestRough(false);
    void saveDraft();
    toast(
      result.summary.healed > 0
        ? `Long rest complete: +${result.summary.healed} HP, spell slots and focus reset.`
        : "Long rest complete: spell slots and focus reset.",
      "success"
    );
  };

  const openTransfer = (mode: "item" | "coins", itemId: string | null = null) => {
    if (!character || !draft) return;
    setTransferMode(mode);
    setTransferItemId(itemId);
    setTransferQuantity("1");
    setTransferCoins({ gp: "0", sp: "0", cp: "0" });
    setTransferError("");
    setTransferOpen(true);
    setTransferLoading(true);
    setParty([]);
    setTransferTargetId("");
    if (!character.campaignId) {
      setTransferLoading(false);
      return;
    }
    api<{ characters: CharacterRecord[] }>(`/api/characters?campaignId=${character.campaignId}`)
      .then((result) => {
        setParty(result.characters);
        const others = result.characters.filter((entry) => entry.id !== character.id);
        setTransferTargetId(others[0]?.id ?? "");
      })
      .catch((err) => setTransferError(errorMessage(err)))
      .finally(() => setTransferLoading(false));
  };

  const submitTransfer = async () => {
    if (!character || !draft) return;
    if (!transferTargetId) {
      setTransferError("Choose who receives the transfer.");
      return;
    }
    setTransferBusy(true);
    setTransferError("");
    try {
      let body: Record<string, unknown> = {
        toCharacterId: transferTargetId,
        expectedRevision: characterRef.current?.revision,
        data: draftRef.current,
      };
      let description = "";
      if (transferMode === "item") {
        if (!transferEntry) throw new Error("That item is no longer in the pack.");
        const quantity = Math.max(
          1,
          Math.min(transferEntry.quantity, Math.floor(Number(transferQuantity) || 1))
        );
        body = { ...body, itemId: transferEntry.itemId, quantity };
        description = `${quantity}× ${transferItem?.name ?? transferEntry.itemId}`;
      } else {
        if (transferTotalCp <= 0) throw new Error("Enter some coins to give.");
        body = {
          ...body,
          currency: {
            gp: Math.max(0, Math.floor(Number(transferCoins.gp) || 0)),
            sp: Math.max(0, Math.floor(Number(transferCoins.sp) || 0)),
            cp: Math.max(0, Math.floor(Number(transferCoins.cp) || 0)),
          },
        };
        description = formatCp(transferTotalCp);
      }
      const result = await api<{ from: CharacterRecord; to: CharacterRecord }>(
        `/api/characters/${character.id}/transfer`,
        { method: "POST", body }
      );
      const normalized = normalizeCharacterDraft(result.from.data, result.from.name);
      characterRef.current = result.from;
      setCharacter(result.from);
      skipInitialSave.current = true;
      setDraft(normalized);
      draftRef.current = normalized;
      setSaveState("saved");
      setTransferOpen(false);
      toast(`Sent ${description} to ${result.to.name}.`, "success");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const payload = err.payload as { character?: CharacterRecord } | null;
        if (payload?.character) {
          setConflict(payload.character);
          conflictRef.current = true;
          setTransferOpen(false);
          return;
        }
      }
      setTransferError(errorMessage(err));
    } finally {
      setTransferBusy(false);
    }
  };

  const roll = (formula: string, label: string, dc?: number | null) => {
    if (!draft) return;
    if (!character?.campaignId) {
      try {
        const result = rollFormula(formula, { dc: dc ?? null, label });
        setRollLog(result);
        toast(
          `${label}: ${result.total}${result.degree ? ` · ${DEGREE_LABELS[result.degree]}` : ""}`,
          "success"
        );
      } catch (err) {
        toast(errorMessage(err), "error");
      }
      return;
    }
    const socket = connectSocket();
    const send = () => {
      socket.emit("campaign:join", { campaignId: character.campaignId! }, () => {
        socket.emit(
          "dice:roll",
          {
            campaignId: character.campaignId!,
            formula,
            label,
            dc: dc ?? null,
            characterId: character.id,
          },
          (message) => {
            if (!message) return;
            if (message.data && "total" in message.data) {
              setRollLog(message.data);
              toast(
                `${label}: ${message.data.total}${message.data.degree ? ` · ${DEGREE_LABELS[message.data.degree]}` : ""}`,
                message.data.degree === "critical-failure" || message.data.degree === "failure"
                  ? "error"
                  : "success"
              );
            }
          }
        );
      });
    };
    if (socket.connected) send();
    else {
      socket.once("connect", send);
      socket.connect();
    }
  };

  const addCondition = (name: string) => {
    const clean = name.trim();
    if (!clean) return;
    update((current) => ({
      ...current,
      play: {
        ...current.play,
        conditions: [
          ...current.play.conditions,
          {
            name: clean,
            value: conditionValue === "" ? null : Math.max(0, Math.round(Number(conditionValue))),
            duration:
              conditionDuration === "" ? null : Math.max(0, Math.round(Number(conditionDuration))),
          },
        ],
      },
    }));
    setConditionName("");
    setConditionValue("");
    setConditionDuration("");
  };

  if (loading) return <LoadingScreen label="Opening the character sheet…" />;
  if (error || !character || !draft || !derived) {
    return (
      <div className="page">
        <EmptyState
          icon={<CircleAlert size={28} />}
          title="Could not open that character"
          description={error || "The character may have been deleted."}
          action={<Button onClick={() => navigate("/campaigns")}>Back to campaigns</Button>}
        />
      </div>
    );
  }

  const classData = context.classData;
  const caster = casterInfo(classData);
  const selectedOptions = selectedChoiceOptions(draft, classData);
  const hp = derived.currentHp;
  const fortune = draft.play;
  const xp = xpProgress(draft.play.xp, draft.level);

  return (
    <div className="page sheet-page">
      <div className="sheet-topline">
        <Link
          to={character.campaignId ? `/campaigns/${character.campaignId}` : "/campaigns"}
          className="back-link"
        >
          <ArrowLeft size={15} /> {character.campaignId ? "Back to campaign" : "Back to campaigns"}
        </Link>
        <div className="row" style={{ gap: 8 }}>
          <span className={`save-indicator ${saveState}`}>
            {saveState === "saved" ? "Saved" : saveState === "saving" ? "Saving…" : "Save failed"}
          </span>
          <Button
            variant="secondary"
            size="sm"
            icon={<Printer size={14} />}
            onClick={() => window.print()}
          >
            Print / PDF
          </Button>
          {canEdit ? (
            <Button
              variant="secondary"
              size="sm"
              icon={<Moon size={14} />}
              onClick={() => setRestOpen(true)}
            >
              Long rest
            </Button>
          ) : null}
          {character.permissions?.canEdit ? (
            <Link to={`/characters/${character.id}/edit`} className="btn btn-primary btn-sm">
              <Pencil size={14} /> Edit character
            </Link>
          ) : null}
        </div>
      </div>

      <header className="sheet-hero card">
        <div className="sheet-portrait">
          <Avatar name={draft.name} src={draft.portraitUrl} size={104} />
        </div>
        <div className="sheet-hero-copy">
          <PageEyebrow>
            Level {draft.level} · {classData?.name || "Unfinished character"}
          </PageEyebrow>
          <h1>{draft.name}</h1>
          <p className="sheet-subtitle">
            {[context.ancestry?.name, context.heritage?.name, context.background?.name]
              .filter(Boolean)
              .join(" · ") || "No ancestry or background chosen"}
          </p>
          <div className="chip-row" style={{ marginTop: 10 }}>
            {context.deity ? <Tag tone="gold">{context.deity.name}</Tag> : null}
            {selectedOptions.slice(0, 3).map((option) => (
              <Tag key={option.id} tone="blue">
                {option.name}
              </Tag>
            ))}
            {context.classData ? <Tag>{context.classData.name}</Tag> : null}
          </div>
        </div>
        <div className="sheet-hero-stats">
          <div className={`hp-orb ${hp <= derived.maxHp * 0.25 ? "is-low" : ""}`}>
            <Heart size={15} />
            <strong>{hp}</strong>
            <span>/ {derived.maxHp}</span>
          </div>
          <div className="sheet-quick-stats">
            <Stat label="AC" value={derived.ac} tone="gold" />
            <Stat label="Perception" value={signed(derived.perception)} />
            <Stat label="Initiative" value={signed(derived.initiative)} />
            <Stat label="Class DC" value={derived.classDc} />
            <Stat label="Speed" value={`${derived.speed} ft.`} />
            {(derived.otherSpeeds ?? []).map((entry) => (
              <Stat
                key={entry.type}
                label={`${titleCase(entry.type)} speed`}
                value={`${entry.value} ft.`}
              />
            ))}
          </div>
        </div>
      </header>

      <div className="sheet-layout">
        <div className="sheet-main">
          <Card className="sheet-section">
            <div className="sheet-section-head">
              <h2>Abilities</h2>
              <span className="tiny muted">Final scores at level {draft.level}</span>
            </div>
            <div className="sheet-abilities">
              {ABILITIES.map((ability) => (
                <div key={ability} className="sheet-ability">
                  <span>{ABILITY_SHORT[ability]}</span>
                  <strong>{derived.abilities[ability]}</strong>
                  <em>{signed(derived.abilityMods[ability])}</em>
                  <small>{ABILITY_LABELS[ability]}</small>
                </div>
              ))}
            </div>
          </Card>

          <Card className="sheet-section">
            <div className="sheet-section-head">
              <h2>Defenses</h2>
              <span className="tiny muted">Roll a save against an effect</span>
            </div>
            <div className="defense-grid">
              {(["fortitude", "reflex", "will"] as const).map((save) => (
                <button
                  key={save}
                  type="button"
                  className="roll-card"
                  onClick={() => roll(`1d20${signed(derived.saves[save])}`, SAVE_LABELS[save])}
                >
                  <span>{SAVE_LABELS[save]}</span>
                  <strong>{signed(derived.saves[save])}</strong>
                  <span className="tiny muted">{PROFICIENCY_NAMES[derived.prof[save]]}</span>
                  <Dices size={14} />
                </button>
              ))}
              <button
                type="button"
                className="roll-card"
                onClick={() => roll(`1d20${signed(derived.perception)}`, "Perception")}
              >
                <span>Perception</span>
                <strong>{signed(derived.perception)}</strong>
                <span className="tiny muted">{PROFICIENCY_NAMES[derived.prof.perception]}</span>
                <Dices size={14} />
              </button>
              <button
                type="button"
                className="roll-card"
                onClick={() => roll(`1d20${signed(derived.initiative)}`, "Initiative")}
              >
                <span>Initiative</span>
                <strong>{signed(derived.initiative)}</strong>
                <span className="tiny muted">Perception-based</span>
                <Dices size={14} />
              </button>
              <div className="roll-card is-static">
                <span>Armor Class</span>
                <strong>{derived.ac}</strong>
                <span className="tiny muted">
                  {draft.play.shieldRaised ? "Shield raised" : "Shield down"}
                </span>
                <Shield size={14} />
              </div>
              <div className="roll-card is-static">
                <span>Spell DC</span>
                <strong>{derived.spellDc ?? "—"}</strong>
                <span className="tiny muted">
                  {caster.progression === "none"
                    ? "No spellcasting"
                    : `${derived.casterTradition || ""} caster`}
                </span>
                <Sparkles size={14} />
              </div>
            </div>
            {derived.shield ? (
              <p className="tiny muted" style={{ marginTop: 9 }}>
                <Shield size={12} /> {derived.shield.name} · Hardness {derived.shield.hardness} · HP{" "}
                {derived.shield.hp} · BT {derived.shield.brokenThreshold}
                {derived.shield.raised ? " · raised" : ""}
              </p>
            ) : null}
          </Card>

          <Card className="sheet-section">
            <div className="sheet-section-head">
              <h2>Skills</h2>
              <span className="tiny muted">Click a skill to roll it</span>
            </div>
            <div className="skill-sheet-grid">
              {derived.skills.map((skill) => (
                <button
                  key={skill.id}
                  type="button"
                  className="skill-sheet-row"
                  onClick={() => roll(`1d20${signed(skill.mod)}`, skill.name)}
                >
                  <span className="skill-sheet-name">
                    {skill.name}
                    {skill.trained ? <span className={`rank-dot rank-${skill.rank}`} /> : null}
                  </span>
                  <span className="tiny muted">
                    {ABILITY_SHORT[skill.ability]} · {PROFICIENCY_NAMES[skill.rank]}
                  </span>
                  <strong>{signed(skill.mod)}</strong>
                  <Dices size={13} />
                </button>
              ))}
              {derived.lore.map((lore) => (
                <button
                  key={lore.name}
                  type="button"
                  className="skill-sheet-row"
                  onClick={() => roll(`1d20${signed(lore.mod)}`, lore.name)}
                >
                  <span className="skill-sheet-name">
                    {lore.name}
                    <span className="rank-dot rank-1" />
                  </span>
                  <span className="tiny muted">INT · Lore</span>
                  <strong>{signed(lore.mod)}</strong>
                  <Dices size={13} />
                </button>
              ))}
            </div>
          </Card>

          <Card className="sheet-section">
            <div className="sheet-section-head">
              <h2>Attacks</h2>
              <span className="tiny muted">Attack and damage</span>
            </div>
            <div className="attack-table">
              {derived.attacks.map((attack) => (
                <div key={attack.id} className="attack-sheet-row">
                  <div className="attack-name">
                    <strong>{attack.name}</strong>
                    <span className="chip-row">
                      {attack.traits.slice(0, 4).map((trait) => (
                        <Tag key={trait}>{titleCase(trait)}</Tag>
                      ))}
                    </span>
                  </div>
                  <div className="attack-actions">
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<Dices size={13} />}
                      onClick={() => roll(attack.attackFormula, `${attack.name} attack`)}
                    >
                      {signed(attack.attackBonus)}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Swords size={13} />}
                      onClick={() => roll(attack.damageFormula, `${attack.name} damage`)}
                    >
                      {attack.damageFormula} {attack.damageType}
                    </Button>
                    {attack.extraDamage?.map((extra) => (
                      <Button
                        key={`${attack.id}-${extra.type}`}
                        size="sm"
                        variant="ghost"
                        icon={<Sparkles size={13} />}
                        onClick={() => roll(extra.formula, `${attack.name} ${extra.label} damage`)}
                        title={`${extra.label} extra damage`}
                      >
                        +{extra.formula} {extra.type}
                      </Button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {derived.spellDc !== null ? (
            <Card className="sheet-section">
              <div className="sheet-section-head">
                <h2>Spells</h2>
                <span className="tiny muted">
                  Spell attack {derived.spellAttack === null ? "—" : signed(derived.spellAttack)} ·
                  DC {derived.spellDc}
                </span>
              </div>
              {derived.spellSlots ? (
                <div className="sheet-slots">
                  {derived.spellSlots.map((count, index) => {
                    const rank = index + 1;
                    const fontRank = derived.divineFontRank;
                    const fontSlots = derived.divineFontSlots ?? 0;
                    const regularCount = fontRank === rank ? Math.max(0, count - fontSlots) : count;
                    const used = draft.spells.slotsUsed[String(rank)] ?? 0;
                    const fontUsed = Math.max(
                      0,
                      Math.min(fontSlots, draft.spells.divineFontUsed ?? 0)
                    );
                    return (
                      <div key={index}>
                        <div className="sheet-slot-row">
                          <span>Rank {rank}</span>
                          <div className="slot-pips">
                            {Array.from({ length: regularCount }).map((_, pip) => (
                              <button
                                key={pip}
                                type="button"
                                className={`slot-pip ${pip < used ? "is-used" : ""}`}
                                title={pip < used ? "Restore slot" : "Spend slot"}
                                disabled={!canEdit}
                                onClick={() =>
                                  update((current) => ({
                                    ...current,
                                    spells: {
                                      ...current.spells,
                                      slotsUsed: {
                                        ...current.spells.slotsUsed,
                                        [String(rank)]: pip < used ? pip : pip + 1,
                                      },
                                    },
                                  }))
                                }
                              />
                            ))}
                          </div>
                          <span className="tiny muted">
                            {Math.max(0, regularCount - used)} / {regularCount}
                          </span>
                        </div>
                        {fontRank === rank && fontSlots ? (
                          <div className="sheet-slot-row slot-row-font">
                            <span>Divine font · {rank}</span>
                            <div className="slot-pips">
                              {Array.from({ length: fontSlots }).map((_, pip) => (
                                <button
                                  key={pip}
                                  type="button"
                                  className={`slot-pip is-font ${pip < fontUsed ? "is-used" : ""}`}
                                  title={pip < fontUsed ? "Restore font slot" : "Spend font slot"}
                                  disabled={!canEdit}
                                  onClick={() =>
                                    update((current) => ({
                                      ...current,
                                      spells: {
                                        ...current.spells,
                                        divineFontUsed: pip < fontUsed ? pip : pip + 1,
                                      },
                                    }))
                                  }
                                />
                              ))}
                            </div>
                            <span className="tiny muted">
                              {fontSlots - fontUsed} / {fontSlots} · heal or harm
                            </span>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}
              {derived.spellSlotsNote ? (
                <p className="muted small">{derived.spellSlotsNote}</p>
              ) : null}
              <SpellGroups
                draft={draft}
                context={context}
                onRoll={roll}
                spellAttack={derived.spellAttack}
              />
            </Card>
          ) : null}

          {derived.notes.length ? (
            <Card className="sheet-section">
              <div className="sheet-section-head">
                <h2>Tracking notes</h2>
                <span className="tiny muted">Partly automated; track these during play</span>
              </div>
              <ul className="sheet-note-list">
                {derived.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card className="sheet-section">
            <div className="sheet-section-head">
              <h2>Feats &amp; features</h2>
              <span className="tiny muted">
                {derived.selectedFeats.length} feats · {derived.features.length} class features
              </span>
            </div>
            <div className="sheet-feature-list">
              {derived.selectedFeats.map((feat) => (
                <details key={feat.id} className="sheet-feature">
                  <summary>
                    <span>
                      <strong>{feat.name}</strong>
                      <span className="tiny muted">
                        {" "}
                        · {titleCase(feat.category)} · level {feat.level}
                      </span>
                    </span>
                    <span className="chip-row">
                      {feat.traits.slice(0, 3).map((trait) => (
                        <Tag key={trait}>{trait}</Tag>
                      ))}
                    </span>
                  </summary>
                  <RichText html={feat.description} />
                </details>
              ))}
              {derived.features.map((feature) => (
                <details key={feature.id} className="sheet-feature">
                  <summary>
                    <span>
                      <strong>{feature.name}</strong>
                      <span className="tiny muted"> · class feature · level {feature.level}</span>
                    </span>
                    <span className="chip-row">
                      {feature.traits.slice(0, 2).map((trait) => (
                        <Tag key={trait}>{trait}</Tag>
                      ))}
                    </span>
                  </summary>
                  <RichText html={feature.description} />
                </details>
              ))}
              {derived.grantedFeats.map((feat) => (
                <div key={feat.name} className="sheet-feature static">
                  <span>
                    <strong>{feat.name}</strong>
                    <span className="tiny muted"> · granted</span>
                  </span>
                </div>
              ))}
              {!derived.selectedFeats.length && !derived.features.length ? (
                <p className="muted small">No feats or class features selected yet.</p>
              ) : null}
            </div>
          </Card>

          <Card className="sheet-section sheet-inventory">
            <div className="sheet-section-head">
              <h2>Inventory &amp; purse</h2>
              <span className="tiny muted">
                {draft.equipment.length} {draft.equipment.length === 1 ? "stack" : "stacks"} ·{" "}
                {derived.bulk.total} bulk · {formatCp(inventoryValue)} value
              </span>
            </div>
            <div className="sheet-purse">
              {(["gp", "sp", "cp"] as const).map((coin) => (
                <div key={coin} className="sheet-coin">
                  <span>{coin.toUpperCase()}</span>
                  <strong>{draft.currency[coin]}</strong>
                </div>
              ))}
              <span className="grow" />
              {canEdit && character.campaignId ? (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Coins size={13} />}
                  onClick={() => openTransfer("coins")}
                >
                  Give coins
                </Button>
              ) : null}
            </div>
            <div className="sheet-equipment">
              {draft.equipment.map((entry) => {
                const item = context.equipment[entry.itemId] ?? null;
                const name = item?.name ?? entry.itemId;
                const canTransfer = Boolean(canEdit && character.campaignId);
                return (
                  <div key={entry.itemId} className="sheet-equipment-row">
                    <span className="grow">
                      <strong>{name}</strong> <span className="tiny muted">×{entry.quantity}</span>
                      {item ? (
                        <span className="tiny muted"> · {formatCp(item.price.cpTotal)} each</span>
                      ) : null}
                      {entry.runes?.length ? (
                        <span className="tiny muted"> · {entry.runes.length} runes</span>
                      ) : null}
                    </span>
                    <span className="qty-control sheet-qty">
                      <button
                        type="button"
                        title="Remove one"
                        onClick={() =>
                          update((current) => ({
                            ...current,
                            equipment: current.equipment.map((candidate) =>
                              candidate.itemId === entry.itemId
                                ? { ...candidate, quantity: Math.max(1, candidate.quantity - 1) }
                                : candidate
                            ),
                          }))
                        }
                        disabled={!canEdit || entry.quantity <= 1}
                      >
                        <Minus size={12} />
                      </button>
                      <span>{entry.quantity}</span>
                      <button
                        type="button"
                        title="Add one"
                        onClick={() =>
                          update((current) => ({
                            ...current,
                            equipment: current.equipment.map((candidate) =>
                              candidate.itemId === entry.itemId
                                ? { ...candidate, quantity: candidate.quantity + 1 }
                                : candidate
                            ),
                          }))
                        }
                        disabled={!canEdit}
                      >
                        <Plus size={12} />
                      </button>
                    </span>
                    <Toggle
                      checked={entry.equipped}
                      onChange={(value) =>
                        update((current) => ({
                          ...current,
                          equipment: current.equipment.map((candidate) =>
                            candidate.itemId === entry.itemId
                              ? { ...candidate, equipped: value }
                              : candidate
                          ),
                        }))
                      }
                      label="Equipped"
                      disabled={!canEdit}
                    />
                    <button
                      type="button"
                      className="icon-btn"
                      title={`Remove ${name}`}
                      disabled={!canEdit}
                      onClick={() => {
                        if (!window.confirm(`Remove ${name} from the pack?`)) return;
                        update((current) => ({
                          ...current,
                          equipment: current.equipment.filter(
                            (candidate) => candidate.itemId !== entry.itemId
                          ),
                        }));
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                    {canTransfer ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<ArrowRightLeft size={13} />}
                        onClick={() => openTransfer("item", entry.itemId)}
                      >
                        Give
                      </Button>
                    ) : null}
                  </div>
                );
              })}
              {!draft.equipment.length ? (
                <p className="muted small" style={{ marginTop: 10 }}>
                  No equipment recorded. Add gear from the character builder.
                </p>
              ) : null}
            </div>
          </Card>

          {draft.companions.length ? (
            <Card className="sheet-section">
              <div className="sheet-section-head">
                <h2>Companions &amp; summons</h2>
                <span className="tiny muted">{draft.companions.length} in the roster</span>
              </div>
              <div className="sheet-companion-list">
                {draft.companions.map((companion) => {
                  const linkedMonster = companion.monsterId
                    ? context.monsters?.[companion.monsterId]
                    : null;
                  return (
                    <div key={companion.id} className="sheet-companion-row">
                      <div>
                        <div className="row" style={{ gap: 7 }}>
                          <strong>{companion.name}</strong>
                          <Tag tone="blue">{companion.kind}</Tag>
                          <span className="tiny muted">level {companion.level}</span>
                          {linkedMonster ? <Tag tone="gold">Bestiary</Tag> : null}
                        </div>
                        <p className="tiny muted">
                          {companion.hpMax !== null
                            ? `${companion.hpCurrent ?? "?"} / ${companion.hpMax} HP`
                            : companion.hpCurrent !== null
                              ? `${companion.hpCurrent} HP`
                              : "HP —"}
                          {companion.ac !== null ? ` · AC ${companion.ac}` : ""}
                        </p>
                      </div>
                      {linkedMonster ? (
                        <details className="sheet-companion-statblock">
                          <summary className="tiny gold-text">
                            Bestiary statblock · {linkedMonster.name}
                          </summary>
                          <p className="tiny muted">
                            HP {linkedMonster.hp} · AC {linkedMonster.ac} · Fort{" "}
                            {signed(linkedMonster.fortitude)} · Ref {signed(linkedMonster.reflex)} ·
                            Will {signed(linkedMonster.will)} · Per{" "}
                            {signed(linkedMonster.perception)}
                          </p>
                          {linkedMonster.attacks.length ? (
                            <p className="tiny muted">
                              {linkedMonster.attacks
                                .map(
                                  (attack) =>
                                    `${attack.name} ${signed(attack.bonus)} (${attack.damage})`
                                )
                                .join(" · ")}
                            </p>
                          ) : null}
                          {linkedMonster.abilities.length ? (
                            <details>
                              <summary className="tiny gold-text">
                                {linkedMonster.abilities.length} abilities
                              </summary>
                              {linkedMonster.abilities.map((ability) => (
                                <div key={ability.name} className="companion-ability">
                                  <strong>{ability.name}</strong>
                                  {ability.actions ? (
                                    <span className="tiny muted"> · {ability.actions}</span>
                                  ) : null}
                                  <RichText html={ability.description} />
                                </div>
                              ))}
                            </details>
                          ) : null}
                        </details>
                      ) : null}
                      {companion.notes ? (
                        <p className="tiny muted sheet-companion-notes">{companion.notes}</p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </Card>
          ) : null}

          <Card className="sheet-section">
            <div className="sheet-section-head">
              <h2>Character notes</h2>
              <span className="tiny muted">Backstory, beliefs, and session notes</span>
            </div>
            <div className="sheet-notes">
              {draft.details.appearance ? (
                <div>
                  <h4>Appearance</h4>
                  <p>{draft.details.appearance}</p>
                </div>
              ) : null}
              {draft.details.personality ? (
                <div>
                  <h4>Personality</h4>
                  <p>{draft.details.personality}</p>
                </div>
              ) : null}
              {draft.details.beliefs ? (
                <div>
                  <h4>Beliefs &amp; bonds</h4>
                  <p>{draft.details.beliefs}</p>
                </div>
              ) : null}
              {draft.details.notes ? (
                <div>
                  <h4>Notes</h4>
                  <p style={{ whiteSpace: "pre-wrap" }}>{draft.details.notes}</p>
                </div>
              ) : null}
              {!draft.details.appearance &&
              !draft.details.personality &&
              !draft.details.beliefs &&
              !draft.details.notes ? (
                <p className="muted small">
                  No notes yet. Add a backstory from the character builder.
                </p>
              ) : null}
            </div>
          </Card>
        </div>

        <aside className="sheet-sidebar">
          <Card className="sheet-play-card">
            <div className="row-between">
              <h2>At the table</h2>
              <Badge tone={canEdit ? "green" : "neutral"}>
                {canEdit ? "Editable" : "Read only"}
              </Badge>
            </div>
            <div className="hp-editor">
              <div className="hp-editor-head">
                <span>
                  <Heart size={14} /> Hit points
                </span>
                <span className="tiny muted">
                  {hp} / {derived.maxHp}
                  {fortune.tempHp ? ` (+${fortune.tempHp} temp)` : ""}
                </span>
              </div>
              <ProgressBar value={hp} max={derived.maxHp} />
              <div className="hp-controls">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    update((current) => ({
                      ...current,
                      play: {
                        ...current.play,
                        hp: Math.max(0, (current.play.hp ?? derived.maxHp) - 1),
                      },
                    }))
                  }
                  disabled={!canEdit}
                >
                  <Minus size={13} />
                </Button>
                <Input
                  type="number"
                  value={draft.play.hp ?? derived.maxHp}
                  min={0}
                  max={derived.maxHp}
                  disabled={!canEdit}
                  onChange={(event) =>
                    update((current) => ({
                      ...current,
                      play: {
                        ...current.play,
                        hp: Math.max(0, Math.min(derived.maxHp, Number(event.target.value) || 0)),
                      },
                    }))
                  }
                />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    update((current) => ({
                      ...current,
                      play: {
                        ...current.play,
                        hp: Math.min(derived.maxHp, (current.play.hp ?? derived.maxHp) + 1),
                      },
                    }))
                  }
                  disabled={!canEdit}
                >
                  <Plus size={13} />
                </Button>
              </div>
              <div className="hp-quick">
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() =>
                    update((current) => ({
                      ...current,
                      play: {
                        ...current.play,
                        hp: Math.max(0, (current.play.hp ?? derived.maxHp) - 5),
                      },
                    }))
                  }
                  disabled={!canEdit}
                >
                  −5
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    update((current) => ({
                      ...current,
                      play: {
                        ...current.play,
                        hp: Math.min(derived.maxHp, (current.play.hp ?? derived.maxHp) + 5),
                      },
                    }))
                  }
                  disabled={!canEdit}
                >
                  +5
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    update((current) => ({
                      ...current,
                      play: { ...current.play, hp: derived.maxHp },
                    }))
                  }
                  disabled={!canEdit}
                >
                  Full
                </Button>
              </div>
              <Field label="Temp HP">
                <Input
                  type="number"
                  min={0}
                  value={draft.play.tempHp}
                  disabled={!canEdit}
                  onChange={(event) =>
                    update((current) => ({
                      ...current,
                      play: {
                        ...current.play,
                        tempHp: Math.max(0, Number(event.target.value) || 0),
                      },
                    }))
                  }
                />
              </Field>
            </div>

            <div className="play-points">
              <div className="point-row">
                <span>Hero points</span>
                <div className="point-pips">
                  {[0, 1, 2].map((index) => (
                    <button
                      key={index}
                      type="button"
                      className={`point-pip ${draft.play.heroPoints > index ? "is-on" : ""}`}
                      onClick={() =>
                        update((current) => ({
                          ...current,
                          play: {
                            ...current.play,
                            heroPoints: index + 1 === current.play.heroPoints ? index : index + 1,
                          },
                        }))
                      }
                      disabled={!canEdit}
                      title={`${index + 1} hero point${index ? "s" : ""}`}
                    />
                  ))}
                </div>
              </div>
              {xp.xp > 0 ? (
                <div className="point-row" title="The GM awards XP and decides when to level up.">
                  <span>XP</span>
                  <strong>
                    {xp.xp.toLocaleString()}
                    {xp.required !== null ? ` / ${xp.required.toLocaleString()}` : ""}
                  </strong>
                </div>
              ) : null}
              {derived.focusPointsMax > 0 ? (
                <div className="point-row">
                  <span>Focus points</span>
                  <div className="point-pips">
                    {Array.from({ length: derived.focusPointsMax }).map((_, index) => (
                      <button
                        key={index}
                        type="button"
                        className={`point-pip focus ${draft.play.focusPoints > index ? "is-on" : ""}`}
                        onClick={() =>
                          update((current) => ({
                            ...current,
                            play: {
                              ...current.play,
                              focusPoints:
                                index + 1 === current.play.focusPoints ? index : index + 1,
                            },
                          }))
                        }
                        disabled={!canEdit}
                      />
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="point-row">
                <span>Shield raised</span>
                <Toggle
                  checked={draft.play.shieldRaised}
                  onChange={(value) =>
                    update((current) => ({
                      ...current,
                      play: { ...current.play, shieldRaised: value },
                    }))
                  }
                  disabled={!canEdit}
                />
              </div>
            </div>

            <div className="conditions-editor">
              <div className="row-between">
                <h3>Conditions</h3>
                <span className="tiny muted">{draft.play.conditions.length}</span>
              </div>
              <div className="conditions-list">
                {draft.play.conditions.map((condition, index) => (
                  <Tag key={`${condition.name}-${index}`} tone="red">
                    {conditionLabel(condition)}
                    {canEdit && condition.duration ? (
                      <button
                        type="button"
                        className="tag-remove"
                        title="Reduce duration by one round"
                        onClick={() =>
                          update((current) => ({
                            ...current,
                            play: {
                              ...current.play,
                              conditions: current.play.conditions.map((entry, i) =>
                                i === index
                                  ? {
                                      ...entry,
                                      duration:
                                        entry.duration && entry.duration > 1
                                          ? entry.duration - 1
                                          : null,
                                    }
                                  : entry
                              ),
                            },
                          }))
                        }
                      >
                        −1
                      </button>
                    ) : null}
                    {canEdit ? (
                      <button
                        type="button"
                        className="tag-remove"
                        onClick={() =>
                          update((current) => ({
                            ...current,
                            play: {
                              ...current.play,
                              conditions: current.play.conditions.filter((_, i) => i !== index),
                            },
                          }))
                        }
                      >
                        ×
                      </button>
                    ) : null}
                  </Tag>
                ))}
                {!draft.play.conditions.length ? (
                  <span className="muted tiny">No active conditions.</span>
                ) : null}
              </div>
              {canEdit ? (
                <div className="condition-add">
                  <Select
                    value=""
                    onChange={(event) => {
                      if (event.target.value) addCondition(event.target.value);
                    }}
                  >
                    <option value="">Add condition…</option>
                    {COMMON_CONDITIONS.map((condition) => (
                      <option key={condition} value={condition}>
                        {condition}
                      </option>
                    ))}
                    {conditions
                      .filter((condition) => !COMMON_CONDITIONS.includes(condition.name))
                      .map((condition) => (
                        <option key={condition.id} value={condition.name}>
                          {condition.name}
                        </option>
                      ))}
                  </Select>
                  <Input
                    placeholder="or type one, e.g. Frightened 2"
                    value={conditionName}
                    onChange={(event) => setConditionName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addCondition(conditionName);
                      }
                    }}
                  />
                  <Input
                    type="number"
                    min={0}
                    value={conditionValue}
                    onChange={(event) => setConditionValue(event.target.value)}
                    placeholder="Value"
                    style={{ maxWidth: 74 }}
                    title="Condition value, e.g. 2 for Frightened 2"
                  />
                  <Input
                    type="number"
                    min={0}
                    value={conditionDuration}
                    onChange={(event) => setConditionDuration(event.target.value)}
                    placeholder="Rounds"
                    style={{ maxWidth: 82 }}
                    title="Remaining duration in rounds"
                  />
                </div>
              ) : null}
            </div>
          </Card>

          <Card className="sheet-meta-card">
            <h3>Details</h3>
            <dl>
              {context.ancestry ? (
                <div>
                  <dt>Ancestry</dt>
                  <dd>{context.ancestry.name}</dd>
                </div>
              ) : null}
              {context.heritage ? (
                <div>
                  <dt>Heritage</dt>
                  <dd>{context.heritage.name}</dd>
                </div>
              ) : null}
              {context.background ? (
                <div>
                  <dt>Background</dt>
                  <dd>{context.background.name}</dd>
                </div>
              ) : null}
              {classData ? (
                <div>
                  <dt>Class</dt>
                  <dd>{classData.name}</dd>
                </div>
              ) : null}
              {context.deity ? (
                <div>
                  <dt>Deity</dt>
                  <dd>{context.deity.name}</dd>
                </div>
              ) : null}
              <div>
                <dt>Size</dt>
                <dd>{SIZES[derived.size] || derived.size}</dd>
              </div>
              <div>
                <dt>Languages</dt>
                <dd>{derived.languages.join(", ") || "—"}</dd>
              </div>
              <div>
                <dt>Senses</dt>
                <dd>{derived.senses.join(", ") || "Normal"}</dd>
              </div>
              <div>
                <dt>Bulk</dt>
                <dd>
                  {derived.bulk.total} / {derived.bulk.capacity}
                </dd>
              </div>
              <div>
                <dt>Purse</dt>
                <dd>
                  {formatCp(draft.currency.gp * 100 + draft.currency.sp * 10 + draft.currency.cp)}
                </dd>
              </div>
            </dl>
          </Card>

          <Card className="dice-log-card">
            <div className="row-between">
              <h3>Last roll</h3>
              <Dices size={16} />
            </div>
            {rollLog ? (
              <div className={`sheet-roll-result ${rollLog.degree ?? ""}`}>
                <span className="tiny muted">{rollLog.label || rollLog.formula}</span>
                <strong>{rollLog.total}</strong>
                <span className="tiny muted">{rollLog.breakdown}</span>
                {rollLog.degree ? (
                  <Badge
                    tone={
                      rollLog.degree === "critical-failure"
                        ? "red"
                        : rollLog.degree === "success" || rollLog.degree === "critical-success"
                          ? "green"
                          : "neutral"
                    }
                  >
                    {DEGREE_LABELS[rollLog.degree]}
                  </Badge>
                ) : null}
              </div>
            ) : (
              <p className="muted small">
                Roll a skill, save, attack, or spell to see the result here.
              </p>
            )}
          </Card>
        </aside>
      </div>

      {!draft.play.conditions.length ? null : (
        <div className="sheet-condition-ribbon">
          {draft.play.conditions.map((condition) => (
            <Badge key={condition.name} tone="red">
              {conditionLabel(condition)}
            </Badge>
          ))}
        </div>
      )}

      <Modal
        open={restOpen}
        onClose={() => {
          setRestOpen(false);
          setRestRough(false);
        }}
        title="Take a long rest"
        subtitle="Eight hours of rest followed by daily preparations."
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setRestOpen(false);
                setRestRough(false);
              }}
            >
              Cancel
            </Button>
            <Button variant="primary" icon={<Moon size={14} />} onClick={takeLongRest}>
              Take long rest
            </Button>
          </>
        }
      >
        {restPreview ? (
          <div className="stack">
            <ul className="rest-preview">
              <li>
                <span>Hit Points</span>
                <strong>
                  {restPreview.summary.hpBefore} → {restPreview.summary.hpAfter}
                  {restPreview.summary.healed > 0
                    ? ` (+${restPreview.summary.healed})`
                    : " (already full)"}
                </strong>
              </li>
              {restPreview.summary.tempHpCleared > 0 ? (
                <li>
                  <span>Temporary HP</span>
                  <strong>{restPreview.summary.tempHpCleared} cleared</strong>
                </li>
              ) : null}
              {restPreview.summary.slotsRestored > 0 ? (
                <li>
                  <span>Spell slots</span>
                  <strong>{restPreview.summary.slotsRestored} restored</strong>
                </li>
              ) : null}
              {restPreview.summary.divineFontRestored > 0 ? (
                <li>
                  <span>Divine font</span>
                  <strong>{restPreview.summary.divineFontRestored} restored</strong>
                </li>
              ) : null}
              {restPreview.summary.focusMax > 0 ? (
                <li>
                  <span>Focus points</span>
                  <strong>
                    {restPreview.summary.focusBefore} → {restPreview.summary.focusAfter}
                  </strong>
                </li>
              ) : null}
              {restPreview.summary.removedConditions.length ? (
                <li>
                  <span>Conditions ending</span>
                  <strong>{restPreview.summary.removedConditions.join(", ")}</strong>
                </li>
              ) : null}
              {restPreview.summary.reducedConditions.length ? (
                <li>
                  <span>Conditions reduced</span>
                  <strong>
                    {restPreview.summary.reducedConditions
                      .map((entry) => `${entry.name} ${entry.from} → ${entry.to}`)
                      .join(", ")}
                  </strong>
                </li>
              ) : null}
              {restPreview.summary.shieldLowered ? (
                <li>
                  <span>Stance</span>
                  <strong>Shield lowered</strong>
                </li>
              ) : null}
            </ul>
            <Toggle
              checked={restRough}
              onChange={setRestRough}
              label="Rough rest (half healing)"
              title="Use this when the night was uncomfortable, interrupted, or spent without shelter."
            />
            <p className="tiny muted">
              Prepared spells stay selected so you can adjust them for the new day. Hero points and
              XP are unchanged, and companion HP is not touched. Other conditions are left for the
              GM to adjudicate.
            </p>
            {restPreview.summary.hpBefore === 0 ? (
              <div className="settings-note">
                <CircleAlert size={16} />
                <span>
                  This character is at 0 HP. The rest will heal them and clear dying or unconscious
                  once they are above 0 HP.
                </span>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>

      <Modal
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        title={`Give from ${character.name}`}
        subtitle="Send an item stack or coins to another character in this campaign."
        footer={
          <>
            <Button variant="ghost" onClick={() => setTransferOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              icon={<ArrowRightLeft size={14} />}
              loading={transferBusy}
              disabled={!transferTargetId || transferLoading}
              onClick={submitTransfer}
            >
              Give
            </Button>
          </>
        }
      >
        {transferError ? <div className="auth-error">{transferError}</div> : null}
        {!character.campaignId ? (
          <p className="muted small">
            Assign this character to a campaign before giving items away.
          </p>
        ) : transferLoading ? (
          <p className="muted small">Loading the party…</p>
        ) : !transferTargets.length ? (
          <p className="muted small">No other characters are in this campaign yet.</p>
        ) : (
          <>
            <Field label="Give to">
              <Select
                value={transferTargetId}
                onChange={(event) => setTransferTargetId(event.target.value)}
              >
                {transferTargets.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                    {entry.ownerName ? ` · ${entry.ownerName}` : ""}
                  </option>
                ))}
              </Select>
            </Field>
            {transferMode === "item" ? (
              <>
                <Field label="Item">
                  <Input value={transferItem?.name ?? transferEntry?.itemId ?? ""} disabled />
                </Field>
                <Field
                  label="Quantity"
                  hint={`You have ${transferEntry?.quantity ?? 0} in this stack.`}
                >
                  <Input
                    type="number"
                    min={1}
                    max={transferEntry?.quantity ?? 1}
                    value={transferQuantity}
                    onChange={(event) => setTransferQuantity(event.target.value)}
                  />
                </Field>
              </>
            ) : (
              <>
                <div className="form-grid three">
                  <Field label="Gold">
                    <Input
                      type="number"
                      min={0}
                      value={transferCoins.gp}
                      onChange={(event) =>
                        setTransferCoins((current) => ({ ...current, gp: event.target.value }))
                      }
                    />
                  </Field>
                  <Field label="Silver">
                    <Input
                      type="number"
                      min={0}
                      value={transferCoins.sp}
                      onChange={(event) =>
                        setTransferCoins((current) => ({ ...current, sp: event.target.value }))
                      }
                    />
                  </Field>
                  <Field label="Copper">
                    <Input
                      type="number"
                      min={0}
                      value={transferCoins.cp}
                      onChange={(event) =>
                        setTransferCoins((current) => ({ ...current, cp: event.target.value }))
                      }
                    />
                  </Field>
                </div>
                <p className="tiny muted">
                  Total: <strong>{formatCp(transferTotalCp)}</strong>. Ten copper make a silver; ten
                  silver make a gold.
                </p>
              </>
            )}
          </>
        )}
      </Modal>

      <Modal
        open={Boolean(conflict)}
        onClose={() => void applyServerVersion()}
        closeOnBackdrop={false}
        title="This sheet changed elsewhere"
        subtitle="Another tab, device, or the GM saved this character while you were editing."
        footer={
          <>
            <Button variant="ghost" onClick={applyServerVersion}>
              Reload their version
            </Button>
            <Button variant="primary" icon={<CircleAlert size={15} />} onClick={overwriteConflict}>
              Keep my changes
            </Button>
          </>
        }
      >
        <div className="settings-note">
          <CircleAlert size={16} />
          <span>
            Reloading replaces your unsaved changes with the version from{" "}
            <strong>
              {conflict ? new Date(conflict.updatedAt).toLocaleString() : "the server"}
            </strong>
            . Keeping your changes overwrites that newer save.
          </span>
        </div>
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Spell display helper
// ---------------------------------------------------------------------------
function SpellGroups({
  draft,
  context,
  onRoll,
  spellAttack,
}: {
  draft: CharacterDraft;
  context: CharacterContext;
  onRoll: (formula: string, label: string, dc?: number | null) => void;
  spellAttack: number | null;
}) {
  const known = draft.spells.known.map((id) => context.spells[id]).filter(Boolean);
  const cantrips = draft.spells.cantrips.map((id) => context.spells[id]).filter(Boolean);
  const focus = draft.spells.focus.map((id) => context.spells[id]).filter(Boolean);
  const prepared = new Map<string, number>();
  for (const id of draft.spells.prepared) prepared.set(id, (prepared.get(id) ?? 0) + 1);
  const preparedCaster = isPreparedCasterClass(context.classData?.name);
  const grouped = new Map<number, typeof known>();
  for (const spell of known) {
    const list = grouped.get(spell.rank) ?? [];
    list.push(spell);
    grouped.set(spell.rank, list);
  }
  return (
    <div className="sheet-spells">
      {cantrips.length ? (
        <div className="spell-group">
          <h4>Cantrips</h4>
          {cantrips.map((spell) => (
            <SpellRow key={spell.id} spell={spell} onRoll={onRoll} spellAttack={spellAttack} />
          ))}
        </div>
      ) : null}
      {[...grouped.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([rank, spells]) => (
          <div key={rank} className="spell-group">
            <h4>
              Rank {rank} {preparedCaster ? "spellbook" : "repertoire"}
            </h4>
            {spells.map((spell) => (
              <SpellRow
                key={spell.id}
                spell={spell}
                onRoll={onRoll}
                spellAttack={spellAttack}
                prepared={prepared.get(spell.id) ?? 0}
              />
            ))}
          </div>
        ))}
      {focus.length ? (
        <div className="spell-group">
          <h4>Focus spells</h4>
          {focus.map((spell) => (
            <SpellRow key={spell.id} spell={spell} onRoll={onRoll} spellAttack={spellAttack} />
          ))}
        </div>
      ) : null}
      {!cantrips.length && !known.length && !focus.length ? (
        <p className="muted small">No spells selected yet.</p>
      ) : null}
    </div>
  );
}

function SpellRow({
  spell,
  onRoll,
  spellAttack,
  prepared,
}: {
  spell: NonNullable<CharacterContext["spells"][string]>;
  onRoll: (formula: string, label: string, dc?: number | null) => void;
  spellAttack: number | null;
  prepared?: number;
}) {
  const damageFormula = spell.damage?.[0]?.formula;
  return (
    <HoverCard
      title={spell.name}
      subtitle={`${spell.rank === 0 ? "Cantrip" : `Rank ${spell.rank}`} · ${spellTraditionLabel(spell)} · ${spell.source}`}
      body={stripHtml(spell.description, 220) || undefined}
      meta={spell.damageText ? <span>{spell.damageText}</span> : undefined}
    >
      <div className="sheet-spell-row">
        <div className="grow">
          <strong>{spell.name}</strong>
          {prepared ? (
            <span className="tiny gold-text"> · Prepared{prepared > 1 ? ` ×${prepared}` : ""}</span>
          ) : null}
          <span className="tiny muted">
            {" "}
            · {spell.actions || "—"} · {spell.range || "range —"}
            {spell.defense?.save ? ` · ${spell.defense.save}` : ""}
          </span>
          {spell.damageText ? <span className="tiny gold-text"> · {spell.damageText}</span> : null}
        </div>
        <div className="row" style={{ gap: 5 }}>
          {spellAttack !== null && spell.traits.includes("attack") ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onRoll(`1d20${signed(spellAttack)}`, `${spell.name} spell attack`)}
            >
              <Dices size={13} /> Attack
            </Button>
          ) : null}
          {damageFormula ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onRoll(damageFormula, `${spell.name} damage`)}
            >
              <Swords size={13} /> {damageFormula}
            </Button>
          ) : null}
        </div>
      </div>
    </HoverCard>
  );
}
