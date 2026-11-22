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
  EyeOff,
  Heart,
  HeartPulse,
  Minus,
  Moon,
  Pencil,
  Plus,
  Printer,
  RotateCcw,
  ScrollText,
  Shield,
  Shuffle,
  Sparkles,
  Star,
  Store,
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
  VISION_LABELS,
  type CharacterContext,
  type CharacterDraft,
  type CharacterRecord,
  type CharacterCondition,
  type CharacterAffliction,
  type CharacterEquipment,
  type Equipment,
  type SustainedSpell,
  type AfflictionType,
  type PersistentDamageInstance,
  type ConditionRef,
  type DerivedCharacter,
  type RollResult,
} from "../../shared/types";
import {
  computeCharacter,
  effectiveFontChoice,
  isPreparedCasterClass,
  normalizeCharacterDraft,
  preparedEntries,
  selectedChoiceOptions,
  signed,
  titleCase,
} from "../../shared/rules";
import {
  castSpell,
  defaultSpellActions,
  isHealingSpell,
  spellActionVariants,
  spellCastOptionAvailable,
  spellCastOptions,
  spellDamageAtRank,
  spellHeighteningHint,
  spellHeighteningNotes,
  type SpellCastOption,
  type SpellCastResource,
} from "../../shared/spellcasting";
import { beginSustainedSpell, endSustainedSpell, spellNeedsSustain } from "../../shared/sustain";
import { innateUsesRemaining } from "../../shared/innate";
import { ritualPrimarySkillName } from "../../shared/ritual";
import {
  adjustDegreeForIncapacitation,
  incapacitationNote,
  resolveCounteract,
  spellHasIncapacitation,
  type CounteractResolution,
} from "../../shared/spellChecks";
import {
  DEGREE_LABELS,
  applyAttackPenalty,
  mod,
  rollFormula,
  upgradeDegreeOfSuccess,
  validateFormula,
} from "../../shared/dice";
import { currencyToCp } from "../../shared/inventory";
import { applyLongRest } from "../../shared/rest";
import { applyHpEditToDraft, applyDyingRecovery } from "../../shared/damage";
import {
  RECOVERY_ACTIVITIES,
  RECOVERY_LABELS,
  hasRecoveryFeat,
  medicineRank,
  recoveryDcsForRank,
  recoveryHealingFormula,
  type RecoveryActivity,
} from "../../shared/recovery";
import {
  INVESTED_LIMIT,
  activateItemOnDraft,
  investedCount,
  itemUseInfo,
  setItemInvested,
} from "../../shared/itemActivation";
import { xpProgress } from "../../shared/xp";
import { spellTraditionLabel, stripHtml } from "../../shared/compendium";
import {
  AFFLICTION_TYPES,
  afflictionOnsetPassed,
  afflictionTypeLabel,
  applyAfflictionSave,
  initialIntervalRemaining,
  initialOnsetRemaining,
  newAfflictionId,
  normalizeAffliction,
  resetAfflictionTimers,
} from "../../shared/afflictions";
import {
  PERSISTENT_DAMAGE_DC,
  normalizePersistentDamage,
  persistentDamageLabel,
} from "../../shared/persistentDamage";
import { conditionBaseName, conditionLabel, parseConditionEntry } from "../../shared/tokens";
import { LIFESTYLE_OPTIONS, lifestyleRate, normalizeLifestyle } from "../../shared/upkeep";
import {
  REGENERATION_SUPPRESSED_CONDITION,
  normalizeDamageTypeList,
} from "../../shared/characterTurnEffects";
import { api, ApiError, formatCp } from "../api";
import { errorMessage } from "../stores";
import { useToasts } from "../stores";
import { connectSocket, getSocket, joinCampaign } from "../socket";
import {
  Avatar,
  Badge,
  Button,
  Card,
  Checkbox,
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
  Textarea,
  Toggle,
} from "../components/ui";
import { HoverCard } from "../components/HoverCard";
import { DailyPreparationsModal } from "../components/DailyPreparationsModal";
import { DowntimeModal } from "../components/DowntimeModal";
import { ShopModal } from "../components/campaign/ShopModal";

function emptyAfflictionForm(): CharacterAffliction {
  return {
    id: newAfflictionId(),
    name: "",
    type: "poison",
    dc: 15,
    save: "fortitude",
    stage: 1,
    stageMax: 3,
    interval: "",
    duration: "",
    onset: "",
    onsetRemaining: 0,
    intervalRemaining: null,
    virulent: false,
    virulentSuccesses: 0,
    virulentCrit: "reduce",
    savesCanEnd: true,
    notes: "",
  };
}

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
  const [targetDc, setTargetDc] = useState("");
  const [secretRoll, setSecretRoll] = useState(false);
  const [heroPointArmed, setHeroPointArmed] = useState(false);
  const [conditionName, setConditionName] = useState("");
  const [conditionValue, setConditionValue] = useState("");
  const [conditionDuration, setConditionDuration] = useState("");
  const [conditions, setConditions] = useState<ConditionRef[]>([]);
  const [afflictionOpen, setAfflictionOpen] = useState(false);
  const [afflictionEditingId, setAfflictionEditingId] = useState<string | null>(null);
  const [afflictionForm, setAfflictionForm] = useState<CharacterAffliction>(emptyAfflictionForm);
  const [persistentFormula, setPersistentFormula] = useState("1d6");
  const [persistentType, setPersistentType] = useState("fire");
  const [persistentDc, setPersistentDc] = useState(String(PERSISTENT_DAMAGE_DC));
  const [persistentNotes, setPersistentNotes] = useState("");
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
  const [shopOpen, setShopOpen] = useState(false);
  const [restOpen, setRestOpen] = useState(false);
  const [restRough, setRestRough] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [recoveryActivity, setRecoveryActivity] = useState<RecoveryActivity>("treat-wounds");
  const [recoveryDc, setRecoveryDc] = useState(15);
  const [recoveryTargetId, setRecoveryTargetId] = useState("");
  const [recoveryParty, setRecoveryParty] = useState<CharacterRecord[]>([]);
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [recoveryError, setRecoveryError] = useState("");
  const [recoveryResult, setRecoveryResult] = useState<{
    character: CharacterRecord;
    targetId: string;
    targetName: string;
    activity: RecoveryActivity;
    dc: number;
    degree: RollResult["degree"];
    roll: RollResult;
    healingRoll: RollResult | null;
    damageRoll: RollResult | null;
    healed: number;
    damage: number;
    notes: string[];
  } | null>(null);
  const [prepOpen, setPrepOpen] = useState(false);
  const [heroicRecoveryBusy, setHeroicRecoveryBusy] = useState(false);
  const [downtimeBusy, setDowntimeBusy] = useState(false);
  const [downtimeOpen, setDowntimeOpen] = useState(false);
  const [castState, setCastState] = useState<{
    spellId: string;
    kind: "known" | "cantrip" | "focus" | "innate";
    rank: number;
    resource: SpellCastResource;
    actions: 1 | 2 | 3;
  } | null>(null);
  const [castRanks, setCastRanks] = useState<Record<string, number>>({});
  const [spellToolsOpen, setSpellToolsOpen] = useState(false);
  const [spellToolsMode, setSpellToolsMode] = useState<"counteract" | "save">("counteract");
  const [spellToolsModifier, setSpellToolsModifier] = useState("0");
  const [spellToolsDc, setSpellToolsDc] = useState("20");
  const [spellToolsCastRank, setSpellToolsCastRank] = useState("1");
  const [spellToolsEffectRank, setSpellToolsEffectRank] = useState("1");
  const [spellToolsTargetLevel, setSpellToolsTargetLevel] = useState("1");
  const [spellToolsSaveBonus, setSpellToolsSaveBonus] = useState("0");
  const [spellToolsLabel, setSpellToolsLabel] = useState("Spell");
  const [spellToolsSaveType, setSpellToolsSaveType] = useState("save");
  const [spellToolsIncapacitation, setSpellToolsIncapacitation] = useState(false);
  const [spellToolsResult, setSpellToolsResult] = useState<{
    kind: "counteract" | "save";
    roll: RollResult;
    degree: RollResult["degree"];
    adjustedDegree: RollResult["degree"];
    note: string;
    counteract?: CounteractResolution;
  } | null>(null);
  const [ritualSpell, setRitualSpell] = useState<NonNullable<
    CharacterContext["spells"][string]
  > | null>(null);
  const [ritualDc, setRitualDc] = useState("20");
  const [ritualSkillId, setRitualSkillId] = useState("arcana");
  const [ritualResult, setRitualResult] = useState<RollResult | null>(null);
  const [hpInput, setHpInput] = useState("");
  const [damageType, setDamageType] = useState("");
  const [conflict, setConflict] = useState<CharacterRecord | null>(null);
  const initialized = useRef(false);
  const skipInitialSave = useRef(true);
  const characterRef = useRef<CharacterRecord | null>(null);
  const draftRef = useRef<CharacterDraft | null>(null);
  const saveInFlight = useRef(false);
  const saveQueued = useRef(false);
  const saveWaiters = useRef<Array<() => void>>([]);
  const conflictRef = useRef(false);
  const dirtyRef = useRef(false);
  const castLock = useRef(false);
  const saveStateRef = useRef(saveState);

  useEffect(() => {
    saveStateRef.current = saveState;
  }, [saveState]);

  const refreshFromServer = useCallback(async () => {
    if (!id || saveInFlight.current || dirtyRef.current || conflictRef.current) return;
    try {
      const result = await api<{ character: CharacterRecord }>(`/api/characters/${id}`);
      if ((result.character.revision ?? 0) <= (characterRef.current?.revision ?? 0)) return;
      const normalized = normalizeCharacterDraft(result.character.data, result.character.name);
      const contextResult = await api<{ context: CharacterContext }>(
        `/api/characters/${id}/context`,
        { method: "POST", body: { draft: normalized } }
      );
      skipInitialSave.current = true;
      characterRef.current = result.character;
      draftRef.current = normalized;
      dirtyRef.current = false;
      setCharacter(result.character);
      setDraft(normalized);
      setContext(contextResult.context);
      setSaveState("saved");
      setConflict(null);
      conflictRef.current = false;
      document.title = `${normalized.name} · Runehall`;
    } catch {
      // Keep the local sheet usable; the next save will surface a conflict.
    }
  }, [id]);

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
        dirtyRef.current = false;
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

  useEffect(() => {
    const campaignId = character?.campaignId;
    if (!campaignId || !id) return;
    const socket = getSocket();
    const leaveCampaignRoom = joinCampaign(campaignId);
    const onCharacterUpdated = (payload: { characterId: string }) => {
      if (payload.characterId !== id) return;
      if (saveStateRef.current !== "saved") return;
      void refreshFromServer();
    };
    socket.on("character:updated", onCharacterUpdated);
    return () => {
      socket.off("character:updated", onCharacterUpdated);
      leaveCampaignRoom();
    };
  }, [character?.campaignId, id, refreshFromServer]);

  const derived = useMemo(
    () => (draft ? computeCharacter(draft, context) : null),
    [draft, context]
  );
  useEffect(() => {
    if (!draft || !derived) return;
    setHpInput(String(draft.play.hp ?? derived.maxHp));
  }, [draft?.play.hp, derived?.maxHp]);
  const canEdit = Boolean(character?.permissions?.canEdit);
  const sheetFontChoice = draft
    ? effectiveFontChoice(draft, {
        spells: context.spells,
        deity: context.deity,
        classData: context.classData,
      })
    : null;
  const castSpellEntry = castState ? (context.spells[castState.spellId] ?? null) : null;
  const castOptions =
    castSpellEntry && draft && derived
      ? spellCastOptions(castSpellEntry, draft, context, {
          focus: castState?.kind === "focus",
          focusPointsMax: derived.focusPointsMax,
        })
      : [];
  const selectedCastOption =
    castOptions.find(
      (option) => option.rank === castState?.rank && option.resource === castState?.resource
    ) ??
    castOptions.find(spellCastOptionAvailable) ??
    castOptions[0] ??
    null;
  const castDamage =
    castSpellEntry && selectedCastOption
      ? spellDamageAtRank(castSpellEntry, selectedCastOption.rank)
      : null;
  const castVariants =
    castSpellEntry && selectedCastOption
      ? spellActionVariants(castSpellEntry, selectedCastOption.rank)
      : [];
  const selectedCastVariant =
    castVariants.find((variant) => variant.actions === castState?.actions) ??
    castVariants[0] ??
    null;
  const castPreparedRows =
    castSpellEntry && draft
      ? preparedEntries(draft, {
          spells: context.spells,
          deity: context.deity,
          classData: context.classData,
        }).filter((entry) => entry.id === castSpellEntry.id)
      : [];
  const castPreparedSummary = (() => {
    const groups = new Map<string, { rank: number; font: boolean; count: number }>();
    for (const row of castPreparedRows) {
      const key = `${row.rank}:${row.font ? "font" : "slot"}`;
      const group = groups.get(key) ?? { rank: row.rank, font: row.font, count: 0 };
      group.count += 1;
      groups.set(key, group);
    }
    return [...groups.values()]
      .sort((a, b) => a.rank - b.rank || Number(b.font) - Number(a.font))
      .map((group) => `rank ${group.rank}${group.font ? " font" : " ordinary"} ×${group.count}`)
      .join(", ");
  })();

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
  const upkeepRate = lifestyleRate(draft?.play.lifestyle);
  const upkeepAffordable = draft ? currencyToCp(draft.currency) >= upkeepRate.dailyCp : false;

  const saveDraft = useCallback(
    async (force = false) => {
      if (!id || !canEdit) return;
      if (saveInFlight.current) {
        saveQueued.current = true;
        await new Promise<void>((resolve) => saveWaiters.current.push(resolve));
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
            if (draftRef.current === currentDraft) {
              setSaveState("saved");
              dirtyRef.current = false;
            }
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
        const waiters = saveWaiters.current.splice(0);
        for (const resolve of waiters) resolve();
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
    dirtyRef.current = false;
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
    dirtyRef.current = true;
    setDraft((current) => {
      if (!current) return current;
      const next = updater(current);
      draftRef.current = next;
      return next;
    });
  };

  const applyDamage = (amount: number, types?: string[]) => {
    if (!derived) return;
    const typed = types ?? normalizeDamageTypeList(damageType);
    const damageTypes = typed.length ? typed : undefined;
    update(
      (current) =>
        applyHpEditToDraft(current, derived.maxHp, {
          type: "damage",
          amount,
          damageTypes,
        }).draft
    );
  };

  const applyHealing = (amount: number) => {
    if (!derived) return;
    update((current) => applyHpEditToDraft(current, derived.maxHp, { type: "heal", amount }).draft);
  };

  const setRegenerationSuppressed = (checked: boolean) => {
    update((current) => {
      const conditions = current.play.conditions.filter(
        (condition) => conditionBaseName(condition.name) !== "regeneration suppressed"
      );
      if (checked) {
        conditions.push({
          name: REGENERATION_SUPPRESSED_CONDITION,
          value: null,
          duration: null,
        });
      }
      return {
        ...current,
        play: { ...current.play, conditions },
      };
    });
  };

  const rollDyingRecovery = () => {
    if (!draft || !derived) return;
    const dying = derived.conditionEffects.dying;
    if (dying <= 0) return;
    roll("1d20", "Dying recovery check", 10 + dying, (result) => {
      if (!result.degree) return;
      const applied = applyDyingRecovery(draftRef.current ?? draft, result.degree);
      update((current) => applyDyingRecovery(current, result.degree!).draft);
      toast(
        applied.notes.join(" ") || `Dying recovery: ${DEGREE_LABELS[result.degree!]}.`,
        applied.dead ? "error" : "success"
      );
    });
  };

  const spendHeroicRecovery = async () => {
    if (!character) return;
    setHeroicRecoveryBusy(true);
    try {
      if (dirtyRef.current) await saveDraft();
      if (conflictRef.current) {
        toast("Resolve the sheet conflict before using Heroic Recovery.", "error");
        return;
      }
      const result = await api<{
        character: CharacterRecord;
        spent: number;
        notes: string[];
      }>(`/api/characters/${character.id}/heroic-recovery`, { method: "POST" });
      applyUpdatedCharacter(result.character);
      toast(
        result.notes.join(" ") ||
          `Heroic Recovery: spent ${result.spent} Hero Point${result.spent === 1 ? "" : "s"}.`,
        "success"
      );
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setHeroicRecoveryBusy(false);
    }
  };

  const setHp = (nextHp: number) => {
    if (!derived) return;
    update(
      (current) => applyHpEditToDraft(current, derived.maxHp, { type: "set", hp: nextHp }).draft
    );
  };

  const commitHpInput = () => {
    if (!derived) return;
    const currentHp = draft?.play.hp ?? derived.maxHp;
    if (!hpInput.trim()) {
      setHpInput(String(currentHp));
      return;
    }
    const parsed = Number(hpInput);
    if (!Number.isFinite(parsed)) {
      setHpInput(String(currentHp));
      return;
    }
    setHp(parsed);
  };

  const restPreview =
    draft && derived
      ? applyLongRest(draft, derived, {
          rough: restRough,
          preparedCaster: isPreparedCasterClass(context.classData?.name),
        })
      : null;

  const recoveryRank = derived ? medicineRank(derived) : 0;
  const recoveryActivityOptions = RECOVERY_ACTIVITIES.filter(
    (activity) =>
      activity !== "battle-medicine" || (derived && hasRecoveryFeat(derived, "Battle Medicine"))
  );
  const recoveryDcs = recoveryDcsForRank(recoveryRank, recoveryActivity);
  const recoveryTarget = recoveryParty.find((entry) => entry.id === recoveryTargetId) ?? null;
  const recoveryTargetName = recoveryTarget?.name ?? character?.name ?? "Target";
  const recoveryTargetHp = recoveryTarget?.summary
    ? `${recoveryTarget.summary.currentHp} / ${recoveryTarget.summary.hp} HP`
    : null;
  const recoverySelf = recoveryTargetId === character?.id;
  const recoveryTreatImmune = recoveryTarget?.data.play.treatWoundsImmune === true;
  const recoveryBattleImmune =
    recoveryTarget?.data.play.battleMedicineImmuneBy?.includes(character?.id ?? "") ?? false;
  const recoveryBlocked =
    recoveryRank < 1 ||
    (recoveryActivity === "treat-wounds" && recoveryTreatImmune) ||
    (recoveryActivity === "battle-medicine" && recoveryBattleImmune);

  const openCast = (
    spell: NonNullable<CharacterContext["spells"][string]>,
    kind: "known" | "cantrip" | "focus" | "innate"
  ) => {
    if (!draft || !derived || !canEdit) return;
    const options = spellCastOptions(spell, draft, context, {
      focus: kind === "focus",
      focusPointsMax: derived.focusPointsMax,
      innate: kind === "innate",
      innateRemaining: kind === "innate" ? innateUsesRemaining(draft, spell) : undefined,
    });
    if (!options.length) return;
    const option = options.find(spellCastOptionAvailable) ?? options[0];
    setCastState({
      spellId: spell.id,
      kind,
      rank: option.rank,
      resource: option.resource,
      actions: defaultSpellActions(spell),
    });
  };

  const confirmCast = () => {
    if (!castSpellEntry || !selectedCastOption || !draft || !derived || castLock.current) return;
    if (!spellCastOptionAvailable(selectedCastOption)) return;
    castLock.current = true;
    try {
      const result = castSpell(
        draftRef.current ?? draft,
        castSpellEntry,
        context,
        { rank: selectedCastOption.rank, resource: selectedCastOption.resource },
        {
          focus: castState?.kind === "focus",
          focusPointsMax: derived.focusPointsMax,
          innate: castState?.kind === "innate",
          innateRemaining:
            castState?.kind === "innate"
              ? innateUsesRemaining(draftRef.current ?? draft, castSpellEntry)
              : undefined,
        }
      );
      if (!result) {
        toast("That spell cannot be cast right now.", "error");
        return;
      }
      let nextDraft = result.draft;
      let sustained = false;
      if (spellNeedsSustain(castSpellEntry)) {
        const begun = beginSustainedSpell(nextDraft, castSpellEntry, selectedCastOption.rank);
        nextDraft = begun.draft;
        sustained = begun.added;
      }
      if (nextDraft !== (draftRef.current ?? draft)) {
        skipInitialSave.current = false;
        draftRef.current = nextDraft;
        dirtyRef.current = true;
        setDraft(nextDraft);
        void saveDraft();
      }
      setCastRanks((current) => ({
        ...current,
        [castSpellEntry.id]: selectedCastOption.rank,
      }));
      const cost =
        selectedCastOption.resource === "font"
          ? "divine font"
          : selectedCastOption.resource === "focus"
            ? "focus point"
            : selectedCastOption.resource === "slot"
              ? `rank ${selectedCastOption.rank} slot`
              : selectedCastOption.resource === "innate"
                ? selectedCastOption.remaining === null
                  ? "innate at-will casting"
                  : "innate use"
                : null;
      toast(
        `Cast ${castSpellEntry.name} at rank ${selectedCastOption.rank}${cost ? ` using a ${cost}` : ""}.${sustained ? " Sustaining it; each Sustain costs 1 action." : ""}`,
        "success"
      );
      setCastState(null);
    } finally {
      castLock.current = false;
    }
  };

  const openCounteractTool = () => {
    if (!derived) return;
    setSpellToolsMode("counteract");
    setSpellToolsModifier(
      String(derived.spellAttack ?? (derived.spellDc === null ? 0 : derived.spellDc - 10))
    );
    setSpellToolsDc(String(derived.spellDc ?? 20));
    setSpellToolsCastRank(String(Math.max(1, derived.maxSpellRank || 1)));
    setSpellToolsEffectRank("1");
    setSpellToolsTargetLevel("1");
    setSpellToolsSaveBonus("0");
    setSpellToolsIncapacitation(false);
    setSpellToolsLabel("Counteract");
    setSpellToolsResult(null);
    setSpellToolsOpen(true);
  };

  const openSaveTool = (spell: NonNullable<CharacterContext["spells"][string]>) => {
    if (!derived) return;
    setSpellToolsMode("save");
    setSpellToolsDc(String(derived.spellDc ?? 20));
    setSpellToolsCastRank(String(Math.max(1, spell.rank)));
    setSpellToolsEffectRank(String(Math.max(1, spell.rank)));
    setSpellToolsTargetLevel("1");
    setSpellToolsSaveBonus("0");
    setSpellToolsIncapacitation(spellHasIncapacitation(spell));
    setSpellToolsSaveType(spell.defense?.save || "save");
    setSpellToolsLabel(spell.name);
    setSpellToolsResult(null);
    setSpellToolsOpen(true);
  };

  const runCounteractTool = () => {
    const modifier = Math.round(Number(spellToolsModifier) || 0);
    const dc = Math.max(1, Math.round(Number(spellToolsDc) || 20));
    const castRank = Math.max(1, Math.round(Number(spellToolsCastRank) || 1));
    const effectRank = Math.max(0, Math.round(Number(spellToolsEffectRank) || 0));
    roll(`1d20${signed(modifier)}`, `Counteract check (rank ${castRank})`, dc, (result) => {
      if (!result.degree) return;
      const resolution = resolveCounteract(result.degree, castRank, effectRank);
      setSpellToolsResult({
        kind: "counteract",
        roll: result,
        degree: result.degree,
        adjustedDegree: result.degree,
        note: resolution.note,
        counteract: resolution,
      });
      toast(resolution.note, resolution.counteracted ? "success" : "error");
    });
  };

  const runSaveTool = () => {
    const bonus = Math.round(Number(spellToolsSaveBonus) || 0);
    const dc = Math.max(1, Math.round(Number(spellToolsDc) || 20));
    const effectRank = Math.max(1, Math.round(Number(spellToolsEffectRank) || 1));
    const targetLevel = Math.max(1, Math.round(Number(spellToolsTargetLevel) || 1));
    roll(`1d20${signed(bonus)}`, `${spellToolsLabel} ${spellToolsSaveType} save`, dc, (result) => {
      if (!result.degree) return;
      const adjusted = spellToolsIncapacitation
        ? adjustDegreeForIncapacitation(result.degree, targetLevel, effectRank)
        : { degree: result.degree, adjusted: false, threshold: effectRank * 2 };
      const note = adjusted.adjusted
        ? `Incapacitation: target level ${targetLevel} is above ${adjusted.threshold}, so the save improves from ${DEGREE_LABELS[result.degree]} to ${DEGREE_LABELS[adjusted.degree]}.`
        : spellToolsIncapacitation
          ? `Incapacitation: target level ${targetLevel} is not above ${adjusted.threshold}; use the rolled degree.`
          : `Use the rolled degree: ${DEGREE_LABELS[result.degree]}.`;
      setSpellToolsResult({
        kind: "save",
        roll: result,
        degree: result.degree,
        adjustedDegree: adjusted.degree,
        note,
      });
      toast(note, adjusted.adjusted ? "success" : "info");
    });
  };

  const sustainActiveSpell = (name: string) => {
    toast(`Sustain ${name}: spend 1 action, then resolve the spell's Sustain entry.`, "info");
  };

  const endActiveSpell = (spellId: string) => {
    update((current) => endSustainedSpell(current, spellId));
    toast("Sustained spell ended.", "success");
  };

  const openRitual = (spell: NonNullable<CharacterContext["spells"][string]>) => {
    if (!derived) return;
    const hint = ritualPrimarySkillName(spell.description);
    const hintedSkill = hint
      ? derived.skills.find((skill) => skill.name.toLowerCase() === hint)?.id
      : null;
    const hintedLore = hint
      ? derived.lore.find((lore) => lore.name.toLowerCase() === hint)?.name
      : null;
    setRitualSpell(spell);
    setRitualDc(String(derived.spellDc ?? 20));
    setRitualSkillId(
      hintedSkill ??
        hintedLore ??
        derived.skills.find((skill) => skill.id === "arcana")?.id ??
        derived.skills[0]?.id ??
        "arcana"
    );
    setRitualResult(null);
  };

  const runRitual = () => {
    if (!ritualSpell || !derived) return;
    const skill =
      derived.skills.find((entry) => entry.id === ritualSkillId) ??
      derived.lore.find((entry) => entry.name === ritualSkillId) ??
      null;
    if (!skill) {
      toast("Choose a skill for the ritual's primary check.", "error");
      return;
    }
    const dc = Math.max(1, Math.round(Number(ritualDc) || 20));
    roll(
      `1d20${signed(skill.mod)}`,
      `${ritualSpell.name} ritual check (${skill.name})`,
      dc,
      (result) => {
        setRitualResult(result);
        if (!result.degree) return;
        toast(
          `${ritualSpell.name}: ${DEGREE_LABELS[result.degree]}. Apply the ritual's cost and consequences manually.`,
          result.degree === "critical-failure" || result.degree === "failure" ? "error" : "success"
        );
      }
    );
  };

  const removeRitual = (spellId: string) => {
    update((current) => ({
      ...current,
      spells: {
        ...current.spells,
        rituals: current.spells.rituals.filter((id) => id !== spellId),
      },
    }));
  };

  const takeLongRest = () => {
    if (!draft || !derived) return;
    const result = applyLongRest(draft, derived, {
      rough: restRough,
      preparedCaster: isPreparedCasterClass(context.classData?.name),
    });
    skipInitialSave.current = false;
    draftRef.current = result.draft;
    dirtyRef.current = true;
    setDraft(result.draft);
    setCastRanks({});
    setRestOpen(false);
    setRestRough(false);
    void saveDraft();
    if (isPreparedCasterClass(context.classData?.name)) setPrepOpen(true);
    toast(
      result.summary.healed > 0
        ? `Long rest complete: +${result.summary.healed} HP, spell slots and focus reset.`
        : "Long rest complete: spell slots and focus reset.",
      "success"
    );
  };

  const openRecovery = async () => {
    if (!character || !draft || !derived) return;
    if (dirtyRef.current) {
      await saveDraft();
      if (conflictRef.current) {
        toast("Resolve the sheet conflict before using recovery.", "error");
        return;
      }
    }
    const rank = medicineRank(derived);
    const activities = RECOVERY_ACTIVITIES.filter(
      (activity) => activity !== "battle-medicine" || hasRecoveryFeat(derived, "Battle Medicine")
    );
    const activity = activities[0] ?? "treat-wounds";
    setRecoveryActivity(activity);
    setRecoveryDc(recoveryDcsForRank(rank, activity)[0] ?? 15);
    setRecoveryTargetId(character.id);
    setRecoveryParty([character]);
    setRecoveryResult(null);
    setRecoveryError("");
    setRecoveryOpen(true);
    if (!character.campaignId) return;
    try {
      const result = await api<{ characters: CharacterRecord[] }>(
        `/api/characters?campaignId=${character.campaignId}`
      );
      setRecoveryParty(result.characters);
    } catch (err) {
      setRecoveryError(errorMessage(err));
    }
  };

  const chooseRecoveryActivity = (activity: RecoveryActivity) => {
    setRecoveryActivity(activity);
    setRecoveryDc(recoveryDcsForRank(derived ? medicineRank(derived) : 0, activity)[0] ?? 15);
    setRecoveryResult(null);
    setRecoveryError("");
  };

  const runRecovery = async () => {
    if (!character || recoveryBusy) return;
    setRecoveryBusy(true);
    setRecoveryError("");
    try {
      const result = await api<{
        character: CharacterRecord;
        targetId: string;
        targetName: string;
        activity: RecoveryActivity;
        dc: number;
        degree: RollResult["degree"];
        roll: RollResult;
        healingRoll: RollResult | null;
        damageRoll: RollResult | null;
        healed: number;
        damage: number;
        notes: string[];
      }>(`/api/characters/${character.id}/recovery`, {
        method: "POST",
        body: {
          activity: recoveryActivity,
          dc: recoveryDc,
          targetId: recoveryTargetId || character.id,
        },
      });
      setRecoveryResult(result);
      setRecoveryParty((current) =>
        current.map((entry) => (entry.id === result.targetId ? result.character : entry))
      );
      if (result.targetId === character.id) applyUpdatedCharacter(result.character);
      toast(
        `${result.targetName}: ${result.degree ? DEGREE_LABELS[result.degree] : "check"}${result.healed ? `, +${result.healed} HP` : ""}${result.damage ? `, ${result.damage} damage` : ""}`,
        result.degree === "critical-failure" || result.degree === "failure" ? "error" : "success"
      );
    } catch (err) {
      setRecoveryError(errorMessage(err));
      setRecoveryResult(null);
    } finally {
      setRecoveryBusy(false);
    }
  };

  const clearRecoveryImmunity = async () => {
    if (!character || recoveryBusy) return;
    setRecoveryBusy(true);
    setRecoveryError("");
    try {
      const result = await api<{ character: CharacterRecord }>(
        `/api/characters/${character.id}/recovery/clear`,
        { method: "POST" }
      );
      applyUpdatedCharacter(result.character);
      setRecoveryParty((current) =>
        current.map((entry) => (entry.id === character.id ? result.character : entry))
      );
      setRecoveryResult(null);
      toast("Recovery immunities cleared.", "success");
    } catch (err) {
      setRecoveryError(errorMessage(err));
    } finally {
      setRecoveryBusy(false);
    }
  };

  const consumeItem = (entry: CharacterEquipment, item: Equipment | null) => {
    if (!canEdit || !derived) return;
    const current = draftRef.current ?? draft;
    if (!current) return;
    const activation = activateItemOnDraft(current, entry.itemId, item);
    if (activation.blocked) {
      toast(activation.blocked, "error");
      return;
    }
    let next = activation.draft;
    let healed = 0;
    if (activation.healingFormula) {
      try {
        const rolled = rollFormula(activation.healingFormula, {
          label: `${item?.name ?? entry.itemId} healing`,
        });
        const applied = applyHpEditToDraft(next, derived.maxHp, {
          type: "heal",
          amount: rolled.total,
        });
        next = applied.draft;
        healed = applied.healed;
        setRollLog(rolled);
      } catch (err) {
        toast(errorMessage(err), "error");
        return;
      }
    }
    update(() => next);
    toast(
      `${activation.notes[0] ?? "Item used."}${healed > 0 ? ` Healed ${healed} HP.` : ""}`,
      "success"
    );
  };

  const investItem = (entry: CharacterEquipment, item: Equipment | null, value: boolean) => {
    if (!canEdit) return;
    const current = draftRef.current ?? draft;
    if (!current) return;
    const result = setItemInvested(current, entry.itemId, value);
    if (result.blocked) {
      toast(result.blocked, "error");
      return;
    }
    update(() => result.draft);
    if (value) {
      toast(`Invested ${item?.name ?? entry.itemId}.`, "success");
    }
  };

  const applyDailyPreparations = (next: CharacterDraft) => {
    skipInitialSave.current = false;
    draftRef.current = next;
    dirtyRef.current = true;
    setDraft(next);
    setCastRanks({});
    setPrepOpen(false);
    void saveDraft();
    toast("Daily preparations complete.", "success");
  };

  const applyUpdatedCharacter = useCallback(
    (updated: CharacterRecord) => {
      const normalized = normalizeCharacterDraft(updated.data, updated.name);
      characterRef.current = updated;
      setCharacter(updated);
      skipInitialSave.current = true;
      setDraft(normalized);
      draftRef.current = normalized;
      dirtyRef.current = false;
      conflictRef.current = false;
      setConflict(null);
      setSaveState("saved");
      if (!id) return;
      // Newly bought items need their compendium context on the sheet.
      void api<{ context: CharacterContext }>(`/api/characters/${id}/context`, {
        method: "POST",
        body: { draft: normalized },
      })
        .then((result) => setContext(result.context))
        .catch(() => {
          // The sheet remains usable; context refreshes on the next reload.
        });
    },
    [id]
  );

  const spendDowntime = async () => {
    if (!character || !draft || !canEdit || downtimeBusy) return;
    if (draft.play.downtimeDays < 1) return;
    if (dirtyRef.current) {
      await saveDraft();
      if (dirtyRef.current || conflictRef.current) return;
    }
    setDowntimeBusy(true);
    try {
      const result = await api<{
        character: CharacterRecord;
        days: number;
        paidCp: number;
        label: string;
      }>(`/api/characters/${character.id}/downtime/spend`, {
        method: "POST",
        body: { days: 1 },
      });
      applyUpdatedCharacter(result.character);
      toast(
        `Spent ${result.days} downtime day${result.days === 1 ? "" : "s"} and ${formatCp(
          result.paidCp
        )} on ${result.label.toLowerCase()} living.`,
        "success"
      );
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setDowntimeBusy(false);
    }
  };

  const openShop = async () => {
    if (!character || !character.campaignId || !canEdit) return;
    if (dirtyRef.current) {
      await saveDraft();
      if (conflictRef.current) {
        setShopOpen(false);
        return;
      }
    }
    setShopOpen(true);
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
      applyUpdatedCharacter(result.from);
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

  const roll = (
    formula: string,
    label: string,
    dc?: number | null,
    onResult?: (result: RollResult) => void,
    options: {
      heroPoint?: boolean;
      visibility?: "all" | "gm";
      useTargetDc?: boolean;
      /** Evasion, Juggernaut, or another success-to-critical feature. */
      upgradeSuccess?: boolean;
    } = {}
  ) => {
    if (!draft) return;
    const parsedDc = targetDc.trim() ? Number(targetDc) : null;
    const effectiveDc =
      dc ??
      (options.useTargetDc === false
        ? null
        : parsedDc !== null && Number.isFinite(parsedDc)
          ? Math.round(parsedDc)
          : null);
    const visibility = options.visibility ?? (secretRoll ? "gm" : "all");
    let rollLabel = label;
    if (heroPointArmed && options.heroPoint !== false) {
      if (draft.play.heroPoints < 1) {
        toast("No Hero Points remaining.", "error");
        setHeroPointArmed(false);
        return;
      }
      rollLabel = `Hero Point reroll: ${label}`;
      setHeroPointArmed(false);
      update((current) => ({
        ...current,
        play: { ...current.play, heroPoints: Math.max(0, current.play.heroPoints - 1) },
      }));
    }
    if (!character?.campaignId) {
      try {
        const result = rollFormula(formula, { dc: effectiveDc, label: rollLabel });
        if (options.upgradeSuccess && result.degree === "success") {
          result.degree = upgradeDegreeOfSuccess(result.degree);
          result.degreeUpgraded = true;
        }
        setRollLog(result);
        toast(
          `${rollLabel}: ${result.total}${result.degree ? ` · ${DEGREE_LABELS[result.degree]}` : ""}`,
          result.degree === "critical-failure" || result.degree === "failure" ? "error" : "success"
        );
        onResult?.(result);
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
            label: rollLabel,
            dc: effectiveDc,
            visibility,
            characterId: character.id,
            upgradeSuccess: options.upgradeSuccess === true,
          },
          (message) => {
            if (!message) return;
            if (message.data && "total" in message.data) {
              setRollLog(message.data);
              toast(
                `${rollLabel}: ${message.data.total}${message.data.degree ? ` · ${DEGREE_LABELS[message.data.degree]}` : ""}`,
                message.data.degree === "critical-failure" || message.data.degree === "failure"
                  ? "error"
                  : "success"
              );
              onResult?.(message.data);
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
    const entry = parseConditionEntry({
      name,
      value: conditionValue === "" ? null : Math.max(0, Math.round(Number(conditionValue))),
      duration:
        conditionDuration === "" ? null : Math.max(0, Math.round(Number(conditionDuration))),
    });
    if (!entry) return;
    update((current) => {
      const wanted = conditionBaseName(entry.name);
      const existing = current.play.conditions.some(
        (condition) => conditionBaseName(condition.name) === wanted
      );
      return {
        ...current,
        play: {
          ...current.play,
          conditions: existing
            ? current.play.conditions.map((condition) =>
                conditionBaseName(condition.name) === wanted ? entry : condition
              )
            : [...current.play.conditions, entry],
        },
      };
    });
    setConditionName("");
    setConditionValue("");
    setConditionDuration("");
  };

  const openAfflictionEditor = (existing?: CharacterAffliction) => {
    if (existing) {
      setAfflictionForm({ ...existing });
      setAfflictionEditingId(existing.id);
    } else {
      setAfflictionForm(emptyAfflictionForm());
      setAfflictionEditingId(null);
    }
    setAfflictionOpen(true);
  };

  const saveAffliction = () => {
    const normalized = normalizeAffliction({
      ...afflictionForm,
      id: afflictionEditingId ?? afflictionForm.id,
    });
    if (!normalized) {
      toast("Give the affliction a name.", "error");
      return;
    }
    update((current) => ({
      ...current,
      play: {
        ...current.play,
        afflictions: afflictionEditingId
          ? current.play.afflictions.map((entry) =>
              entry.id === afflictionEditingId
                ? {
                    ...normalized,
                    virulentSuccesses:
                      entry.stage === normalized.stage ? normalized.virulentSuccesses : 0,
                  }
                : entry
            )
          : [...current.play.afflictions, normalized],
      },
    }));
    setAfflictionOpen(false);
  };

  const updateAffliction = (
    id: string,
    updater: (affliction: CharacterAffliction) => CharacterAffliction
  ) =>
    update((current) => ({
      ...current,
      play: {
        ...current.play,
        afflictions: current.play.afflictions.map((entry) =>
          entry.id === id ? updater(entry) : entry
        ),
      },
    }));

  const removeAffliction = (id: string) =>
    update((current) => ({
      ...current,
      play: {
        ...current.play,
        afflictions: current.play.afflictions.filter((entry) => entry.id !== id),
      },
    }));

  const rollAfflictionSave = (affliction: CharacterAffliction) => {
    if (!draft || !derived) return;
    const formula = `1d20${signed(derived.saves[affliction.save])}`;
    roll(
      formula,
      `${affliction.name} stage save`,
      affliction.dc,
      (result) => {
        if (!result.degree) return;
        const applied = applyAfflictionSave(afflictionOnsetPassed(affliction), result.degree);
        update((current) => {
          const active = current.play.afflictions.find((entry) => entry.id === affliction.id);
          if (!active) return current;
          const next = applyAfflictionSave(afflictionOnsetPassed(active), result.degree!);
          return {
            ...current,
            play: {
              ...current.play,
              afflictions: next.affliction
                ? current.play.afflictions.map((entry) =>
                    entry.id === affliction.id ? next.affliction! : entry
                  )
                : current.play.afflictions.filter((entry) => entry.id !== affliction.id),
            },
          };
        });
        toast(applied.message, applied.outcome === "worsened" ? "error" : "success");
      },
      { upgradeSuccess: derived.saveUpgrades?.[affliction.save] === true }
    );
  };

  const addPersistentDamage = () => {
    const instance = normalizePersistentDamage({
      formula: persistentFormula,
      type: persistentType,
      dc: persistentDc,
      notes: persistentNotes,
    });
    if (!instance) {
      toast("Enter a persistent damage formula.", "error");
      return;
    }
    const valid = validateFormula(instance.formula);
    if (!valid.ok) {
      toast(valid.error ?? "That damage formula is not valid.", "error");
      return;
    }
    const replaced = Boolean(
      draft?.play.persistentDamage.some((entry) => entry.type === instance.type)
    );
    update((current) => ({
      ...current,
      play: {
        ...current.play,
        // Same-type persistent damage does not stack; the newest entry
        // replaces the old one so end-of-turn damage is not double-counted.
        persistentDamage: [
          ...current.play.persistentDamage.filter((entry) => entry.type !== instance.type),
          instance,
        ],
      },
    }));
    if (replaced) {
      toast(`Replaced the existing ${instance.type} persistent damage.`, "success");
    }
    setPersistentFormula("1d6");
    setPersistentDc(String(PERSISTENT_DAMAGE_DC));
    setPersistentNotes("");
  };

  const removePersistentDamage = (id: string) =>
    update((current) => ({
      ...current,
      play: {
        ...current.play,
        persistentDamage: current.play.persistentDamage.filter((entry) => entry.id !== id),
      },
    }));

  const endTurnPersistentDamage = () => {
    if (!draft || !derived) return;
    if (draft.play.conditions.some((condition) => conditionBaseName(condition.name) === "dead")) {
      toast("This character is dead.", "error");
      return;
    }
    const instances = draft.play.persistentDamage.filter(
      (instance) => validateFormula(instance.formula).ok
    );
    if (!instances.length) {
      toast("No valid persistent damage to roll.", "error");
      return;
    }

    let total = 0;
    let remaining = instances.length;
    let applied = false;
    const applyTotal = () => {
      if (applied) return;
      applied = true;
      if (total > 0) applyDamage(total, [...new Set(instances.map((entry) => entry.type))]);
      for (const instance of instances) {
        roll(
          "1d20",
          `Persistent ${instance.type} flat check`,
          instance.dc,
          (check) => {
            if (check.degree === "success" || check.degree === "critical-success") {
              update((current) => ({
                ...current,
                play: {
                  ...current.play,
                  persistentDamage: current.play.persistentDamage.filter(
                    (entry) => entry.id !== instance.id
                  ),
                },
              }));
              toast(`${persistentDamageLabel(instance)} ends.`, "success");
            } else if (check.degree) {
              toast(`${persistentDamageLabel(instance)} persists.`, "error");
            }
          },
          { heroPoint: false, visibility: "all" }
        );
      }
    };

    for (const instance of instances) {
      roll(
        instance.formula,
        `Persistent ${instance.type} damage (end of turn)`,
        null,
        (damage) => {
          total += Math.max(0, Math.round(damage.total));
          remaining -= 1;
          if (remaining === 0) applyTotal();
        },
        { heroPoint: false, visibility: "all", useTargetDc: false }
      );
    }
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
  const selectedOptions = selectedChoiceOptions(draft, classData);
  const hp = derived.currentHp;
  const fortune = draft.play;
  const xp = xpProgress(
    draft.play.xp,
    draft.level,
    character?.campaignAdvancementSpeed ?? "medium"
  );
  const reviewIssues = derived.validation.filter((issue) => issue.severity === "error");
  const sheetSections = [
    { id: "sheet-abilities", label: "Abilities" },
    { id: "sheet-defenses", label: "Defenses" },
    { id: "sheet-status", label: "Effects" },
    { id: "sheet-skills", label: "Skills" },
    { id: "sheet-attacks", label: "Attacks" },
    ...(derived.spellDc !== null ||
    draft?.spells.rituals.length ||
    draft?.spells.innate.length ||
    draft?.spells.focus.length
      ? [{ id: "sheet-spells", label: "Spells" }]
      : []),
    { id: "sheet-feats", label: "Feats" },
    { id: "sheet-inventory", label: "Inventory" },
    { id: "sheet-notes", label: "Notes" },
  ];

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
          {canEdit && character.campaignId ? (
            <Button
              variant="secondary"
              size="sm"
              icon={<Store size={14} />}
              onClick={() => void openShop()}
            >
              Shop
            </Button>
          ) : null}
          {canEdit ? (
            <Button
              variant="secondary"
              size="sm"
              icon={<HeartPulse size={14} />}
              onClick={() => void openRecovery()}
            >
              Recovery
            </Button>
          ) : null}
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
          </div>
        </div>
        <div className="sheet-hero-stats">
          <div className={`hp-orb ${hp <= derived.maxHp * 0.25 ? "is-low" : ""}`}>
            <Heart size={15} />
            <strong>{hp}</strong>
            <span>/ {derived.maxHp}</span>
          </div>
          <div className="sheet-quick-stats">
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

      {reviewIssues.length ? (
        <div className="sheet-review-banner" role="status">
          <CircleAlert size={16} />
          <span>
            {reviewIssues.length} required choice{reviewIssues.length === 1 ? "" : "s"} still need
            review.
            <ul className="sheet-review-issues tiny">
              {reviewIssues.slice(0, 6).map((issue, index) => (
                <li key={`${issue.message}-${index}`}>{issue.message}</li>
              ))}
            </ul>
          </span>
          {canEdit ? (
            <Link to={`/characters/${character.id}/edit`} className="btn btn-secondary btn-sm">
              Open builder
            </Link>
          ) : null}
        </div>
      ) : null}

      <nav className="sheet-jump" aria-label="Sheet sections">
        {sheetSections.map((section) => (
          <a key={section.id} href={`#${section.id}`}>
            {section.label}
          </a>
        ))}
      </nav>

      <div className="sheet-layout">
        <div className="sheet-main">
          <Card className="sheet-section" id="sheet-abilities">
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

          <Card className="sheet-section" id="sheet-defenses">
            <div className="sheet-section-head">
              <h2>Defenses</h2>
              <span className="tiny muted">Roll a save against an effect</span>
            </div>
            <div className="defense-grid">
              {(["fortitude", "reflex", "will"] as const).map((save) => {
                const upgraded = derived.saveUpgrades?.[save] === true;
                const upgradeLabel =
                  save === "reflex" ? "Evasion" : save === "fortitude" ? "Juggernaut" : null;
                return (
                  <button
                    key={save}
                    type="button"
                    className="roll-card"
                    title={
                      upgraded && upgradeLabel
                        ? `${upgradeLabel}: a success becomes a critical success.`
                        : undefined
                    }
                    onClick={() =>
                      roll(
                        `1d20${signed(derived.saves[save])}`,
                        SAVE_LABELS[save],
                        null,
                        undefined,
                        {
                          upgradeSuccess: upgraded,
                        }
                      )
                    }
                  >
                    <span>{SAVE_LABELS[save]}</span>
                    <strong>{signed(derived.saves[save])}</strong>
                    <span className="tiny muted">
                      {PROFICIENCY_NAMES[derived.prof[save]]}
                      {upgraded && upgradeLabel ? ` · ${upgradeLabel}` : ""}
                    </span>
                    <Dices size={14} />
                  </button>
                );
              })}
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
            </div>
            {derived.shield ? (
              <p className="tiny muted" style={{ marginTop: 9 }}>
                <Shield size={12} /> {derived.shield.name} · Hardness {derived.shield.hardness} · HP{" "}
                {derived.shield.hp} · BT {derived.shield.brokenThreshold}
                {derived.shield.raised ? " · raised" : ""}
              </p>
            ) : null}
          </Card>

          <Card className="sheet-section sheet-status" id="sheet-status">
            <div className="sheet-section-head">
              <h2>Conditions &amp; effects</h2>
              <span className="tiny muted">Recovery, ongoing damage, and afflictions</span>
            </div>
            <div className="sheet-status-grid">
              <div className="sheet-status-column">
                <div className="persistent-damage-editor">
                  <div className="row-between">
                    <h3>Fast healing &amp; regeneration</h3>
                    <span className="tiny muted">Applied at the start of your turn</span>
                  </div>
                  <p className="tiny muted">
                    Both restore HP when initiative advances. While active, regeneration also keeps
                    dying below the death threshold.
                  </p>
                  <div className="form-grid two">
                    <Field
                      label="Fast healing"
                      hint={draft.play.fastHealingNote || "HP regained at the start of each turn."}
                    >
                      <Input
                        aria-label="Fast healing"
                        type="number"
                        min={0}
                        max={1000}
                        value={draft.play.fastHealing}
                        disabled={!canEdit}
                        onChange={(event) =>
                          update((current) => ({
                            ...current,
                            play: {
                              ...current.play,
                              fastHealing: Math.max(
                                0,
                                Math.min(1000, Math.floor(Number(event.target.value) || 0))
                              ),
                            },
                          }))
                        }
                      />
                    </Field>
                    <Field
                      label="Regeneration"
                      hint={draft.play.regenerationNote || "Skipped while suppressed."}
                    >
                      <Input
                        aria-label="Regeneration"
                        type="number"
                        min={0}
                        max={1000}
                        value={draft.play.regeneration}
                        disabled={!canEdit}
                        onChange={(event) =>
                          update((current) => ({
                            ...current,
                            play: {
                              ...current.play,
                              regeneration: Math.max(
                                0,
                                Math.min(1000, Math.floor(Number(event.target.value) || 0))
                              ),
                            },
                          }))
                        }
                      />
                    </Field>
                  </div>
                  <div className="token-toggles token-edit-toggles">
                    <Toggle
                      checked={draft.play.fastHealingActive}
                      onChange={(checked) =>
                        update((current) => ({
                          ...current,
                          play: { ...current.play, fastHealingActive: checked },
                        }))
                      }
                      label="Fast healing active"
                      disabled={!canEdit}
                    />
                    <Toggle
                      checked={draft.play.regenerationActive}
                      onChange={(checked) =>
                        update((current) => ({
                          ...current,
                          play: { ...current.play, regenerationActive: checked },
                        }))
                      }
                      label="Regeneration active"
                      disabled={!canEdit}
                    />
                    <Toggle
                      checked={draft.play.conditions.some(
                        (condition) =>
                          conditionBaseName(condition.name) === "regeneration suppressed"
                      )}
                      onChange={setRegenerationSuppressed}
                      label="Regeneration suppressed"
                      disabled={!canEdit}
                    />
                  </div>
                  <Field
                    label="Suppressed by"
                    hint="Comma-separated damage types, e.g. acid, fire. Matching typed damage suppresses regeneration automatically."
                  >
                    <Input
                      aria-label="Regeneration suppressed by"
                      value={draft.play.regenerationDeactivatedBy.join(", ")}
                      disabled={!canEdit}
                      onChange={(event) =>
                        update((current) => ({
                          ...current,
                          play: {
                            ...current.play,
                            regenerationDeactivatedBy: normalizeDamageTypeList(event.target.value),
                          },
                        }))
                      }
                      placeholder="acid, fire"
                    />
                  </Field>
                  <div className="form-grid two">
                    <Field label="Fast healing note">
                      <Input
                        aria-label="Fast healing note"
                        value={draft.play.fastHealingNote}
                        disabled={!canEdit}
                        onChange={(event) =>
                          update((current) => ({
                            ...current,
                            play: { ...current.play, fastHealingNote: event.target.value },
                          }))
                        }
                        placeholder="e.g. while below half HP"
                      />
                    </Field>
                    <Field label="Regeneration note">
                      <Input
                        aria-label="Regeneration note"
                        value={draft.play.regenerationNote}
                        disabled={!canEdit}
                        onChange={(event) =>
                          update((current) => ({
                            ...current,
                            play: { ...current.play, regenerationNote: event.target.value },
                          }))
                        }
                        placeholder="e.g. from the regenerate spell"
                      />
                    </Field>
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
                                  conditions: current.play.conditions.flatMap((entry, i) => {
                                    if (i !== index) return [entry];
                                    if (!entry.duration || entry.duration <= 1) return [];
                                    return [{ ...entry, duration: entry.duration - 1 }];
                                  }),
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
                  {derived.conditionEffects.notes.length ? (
                    <ul className="condition-effects tiny muted">
                      {derived.conditionEffects.notes.map((note) => (
                        <li key={note}>{note}</li>
                      ))}
                    </ul>
                  ) : null}
                  {canEdit ? (
                    <div className="condition-add">
                      <Select
                        value=""
                        aria-label="Add a condition"
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
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={!conditionName.trim()}
                        aria-label="Add condition"
                        onClick={() => addCondition(conditionName)}
                      >
                        Add
                      </Button>
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="sheet-status-column">
                <div className="persistent-damage-editor">
                  <div className="row-between">
                    <h3>Persistent damage</h3>
                    <div className="row" style={{ gap: 6 }}>
                      <span className="tiny muted">{draft.play.persistentDamage.length}</span>
                      {canEdit && draft.play.persistentDamage.length ? (
                        <Button
                          size="sm"
                          variant="primary"
                          aria-label="End turn for all persistent damage"
                          onClick={endTurnPersistentDamage}
                        >
                          End turn
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  <p className="tiny muted">
                    During combat, the GM's initiative advance applies the damage and flat checks at
                    the end of your turn.
                  </p>
                  <div className="persistent-damage-list">
                    {draft.play.persistentDamage.map((instance) => (
                      <div className="persistent-damage-row" key={instance.id}>
                        <div className="grow">
                          <Tag tone="red">{persistentDamageLabel(instance)}</Tag>
                          <span className="tiny muted"> · DC {instance.dc}</span>
                          {instance.notes ? (
                            <span className="tiny muted"> · {instance.notes}</span>
                          ) : null}
                        </div>
                        {canEdit ? (
                          <div className="row" style={{ gap: 4 }}>
                            <Button
                              size="sm"
                              variant="ghost"
                              aria-label={`Remove ${persistentDamageLabel(instance)}`}
                              onClick={() => removePersistentDamage(instance.id)}
                            >
                              <Trash2 size={13} />
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    ))}
                    {!draft.play.persistentDamage.length ? (
                      <span className="muted tiny">No persistent damage.</span>
                    ) : null}
                  </div>
                  {canEdit ? (
                    <div className="persistent-damage-add">
                      <Input
                        aria-label="Persistent damage formula"
                        value={persistentFormula}
                        onChange={(event) => setPersistentFormula(event.target.value)}
                        placeholder="1d6"
                        style={{ maxWidth: 90 }}
                      />
                      <Input
                        aria-label="Persistent damage type"
                        value={persistentType}
                        onChange={(event) => setPersistentType(event.target.value)}
                        placeholder="fire"
                        style={{ maxWidth: 110 }}
                      />
                      <Input
                        aria-label="Persistent damage DC"
                        type="number"
                        min={1}
                        max={30}
                        value={persistentDc}
                        onChange={(event) => setPersistentDc(event.target.value)}
                        placeholder="15"
                        style={{ maxWidth: 70 }}
                      />
                      <Input
                        aria-label="Persistent damage notes"
                        value={persistentNotes}
                        onChange={(event) => setPersistentNotes(event.target.value)}
                        placeholder="Source (optional)"
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Plus size={13} />}
                        onClick={addPersistentDamage}
                      >
                        Add persistent
                      </Button>
                    </div>
                  ) : null}
                  <p className="tiny muted">
                    At the end of the turn, take all listed damage at once, then attempt each
                    entry&apos;s flat check. Adding the same damage type replaces the existing
                    entry.
                  </p>
                </div>
                <div className="afflictions-editor">
                  <div className="row-between">
                    <h3>Afflictions</h3>
                    <div className="row" style={{ gap: 6 }}>
                      <span className="tiny muted">{draft.play.afflictions.length}</span>
                      {canEdit ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<Plus size={13} />}
                          onClick={() => openAfflictionEditor()}
                        >
                          Add affliction
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  <div className="affliction-list">
                    {draft.play.afflictions.map((affliction) => (
                      <div
                        className="affliction-row"
                        key={affliction.id}
                        data-testid={`affliction-${affliction.id}`}
                      >
                        <div className="affliction-copy">
                          <div
                            className="row"
                            style={{ gap: 6, flexWrap: "wrap", alignItems: "center" }}
                          >
                            <strong>{affliction.name}</strong>
                            <Tag
                              tone={
                                affliction.type === "poison"
                                  ? "green"
                                  : affliction.type === "disease"
                                    ? "violet"
                                    : "red"
                              }
                            >
                              {afflictionTypeLabel(affliction.type)}
                            </Tag>
                            <Tag tone="gold">
                              Stage {affliction.stage} / {affliction.stageMax}
                            </Tag>
                            {affliction.virulent ? <Tag tone="red">Virulent</Tag> : null}
                          </div>
                          <span className="tiny muted">
                            DC {affliction.dc} · {titleCase(affliction.save)} ·{" "}
                            {affliction.interval
                              ? `every ${affliction.interval}`
                              : "no interval save"}
                            {affliction.duration ? ` · max ${affliction.duration}` : ""}
                            {affliction.onset ? ` · onset ${affliction.onset}` : ""}
                            {affliction.onsetRemaining !== null && affliction.onsetRemaining > 0
                              ? ` · onset in ${affliction.onsetRemaining} round${
                                  affliction.onsetRemaining === 1 ? "" : "s"
                                }`
                              : affliction.onsetRemaining === null && affliction.onset
                                ? " · onset manual"
                                : ""}
                            {affliction.intervalRemaining !== null &&
                            affliction.intervalRemaining > 0
                              ? ` · next save in ${affliction.intervalRemaining} round${
                                  affliction.intervalRemaining === 1 ? "" : "s"
                                }`
                              : affliction.interval &&
                                  affliction.intervalRemaining === null &&
                                  affliction.onsetRemaining !== null
                                ? " · interval manual"
                                : ""}
                            {affliction.virulent
                              ? ` · ${affliction.virulentSuccesses} / 2 consecutive successes`
                              : ""}
                          </span>
                          {affliction.notes ? (
                            <p className="tiny muted affliction-notes">{affliction.notes}</p>
                          ) : null}
                        </div>
                        {canEdit ? (
                          <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
                            {affliction.interval ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                aria-label={`Roll stage save for ${affliction.name}`}
                                onClick={() => rollAfflictionSave(affliction)}
                              >
                                Stage save
                              </Button>
                            ) : null}
                            {affliction.onsetRemaining === null && affliction.onset.trim() ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                aria-label={`Mark onset passed for ${affliction.name}`}
                                onClick={() =>
                                  updateAffliction(affliction.id, (current) =>
                                    afflictionOnsetPassed(current)
                                  )
                                }
                              >
                                Onset passed
                              </Button>
                            ) : null}
                            {affliction.onset.trim() || affliction.interval.trim() ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                aria-label={`Reset timers for ${affliction.name}`}
                                onClick={() =>
                                  updateAffliction(affliction.id, (current) =>
                                    resetAfflictionTimers(current)
                                  )
                                }
                              >
                                <RotateCcw size={13} />
                              </Button>
                            ) : null}
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={affliction.stage <= 1}
                              aria-label={`Reduce stage of ${affliction.name}`}
                              onClick={() =>
                                updateAffliction(affliction.id, (current) => ({
                                  ...current,
                                  stage: Math.max(1, current.stage - 1),
                                  virulentSuccesses: 0,
                                }))
                              }
                            >
                              − Stage
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={affliction.stage >= affliction.stageMax}
                              aria-label={`Increase stage of ${affliction.name}`}
                              onClick={() =>
                                updateAffliction(affliction.id, (current) => ({
                                  ...current,
                                  stage: Math.min(current.stageMax, current.stage + 1),
                                  virulentSuccesses: 0,
                                }))
                              }
                            >
                              + Stage
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              aria-label={`Edit ${affliction.name}`}
                              onClick={() => openAfflictionEditor(affliction)}
                            >
                              <Pencil size={13} />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              aria-label={`End ${affliction.name}`}
                              onClick={() => removeAffliction(affliction.id)}
                            >
                              <Trash2 size={13} />
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    ))}
                    {!draft.play.afflictions.length ? (
                      <span className="muted tiny">No active afflictions.</span>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </Card>

          <Card className="sheet-section" id="sheet-skills">
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

          <Card className="sheet-section" id="sheet-attacks">
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
                      title="Second attack with the multiple attack penalty"
                      onClick={() =>
                        roll(
                          applyAttackPenalty(
                            attack.attackFormula,
                            attack.traits.some((trait) => trait.toLowerCase() === "agile") ? 4 : 5
                          ),
                          `${attack.name} attack (2nd)`
                        )
                      }
                    >
                      2nd
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      title="Third attack with the multiple attack penalty"
                      onClick={() =>
                        roll(
                          applyAttackPenalty(
                            attack.attackFormula,
                            attack.traits.some((trait) => trait.toLowerCase() === "agile") ? 8 : 10
                          ),
                          `${attack.name} attack (3rd)`
                        )
                      }
                    >
                      3rd
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Swords size={13} />}
                      onClick={() => roll(attack.damageFormula, `${attack.name} damage`)}
                    >
                      {attack.damageFormula} {attack.damageType}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      title="Roll doubled weapon damage; deadly, fatal, and critical specialization are manual"
                      onClick={() =>
                        roll(`(${attack.damageFormula})*2`, `${attack.name} critical damage`)
                      }
                    >
                      Crit ×2
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

          {derived.spellDc !== null ||
          draft.spells.rituals.length ||
          draft.spells.innate.length ||
          draft.spells.focus.length ? (
            <Card className="sheet-section" id="sheet-spells">
              <div className="sheet-section-head">
                <h2>Spells</h2>
                <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <span className="tiny muted">
                    {derived.spellDc === null ? (
                      "Innate and ritual magic"
                    ) : (
                      <>
                        Spell attack{" "}
                        {derived.spellAttack === null ? "—" : signed(derived.spellAttack)} · DC{" "}
                        {derived.spellDc}
                        {derived.casterTradition ? ` · ${titleCase(derived.casterTradition)}` : ""}
                      </>
                    )}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Sparkles size={14} />}
                    onClick={openCounteractTool}
                  >
                    Counteract
                  </Button>
                  {canEdit && isPreparedCasterClass(classData?.name) ? (
                    <Button
                      size="sm"
                      variant={draft.spells.preparationsPending ? "primary" : "secondary"}
                      icon={<BookOpen size={14} />}
                      onClick={() => setPrepOpen(true)}
                    >
                      {draft.spells.preparationsPending
                        ? "Prepare today's spells"
                        : "Daily preparations"}
                    </Button>
                  ) : null}
                </div>
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
                            <span>
                              {sheetFontChoice
                                ? `${titleCase(sheetFontChoice)} font`
                                : "Divine font"}{" "}
                              · {rank}
                            </span>
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
                              {fontSlots - fontUsed} / {fontSlots} ·{" "}
                              {(sheetFontChoice
                                ? [sheetFontChoice]
                                : context.deity?.font?.length
                                  ? context.deity.font
                                  : ["heal", "harm"]
                              )
                                .map(titleCase)
                                .join(" or ")}
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
              {derived.grantedSpells.length ? (
                <div style={{ marginTop: 12 }}>
                  <h3>Granted spells</h3>
                  <div className="chip-row" style={{ marginTop: 6 }}>
                    {derived.grantedSpells.map((spell) => (
                      <Tag key={`${spell.kind}-${spell.id}`} tone="gold">
                        {spell.name}
                        {spell.kind === "focus"
                          ? " · focus"
                          : spell.kind === "repertoire"
                            ? " · repertoire"
                            : " · curriculum"}
                      </Tag>
                    ))}
                  </div>
                </div>
              ) : null}
              <SpellGroups
                draft={draft}
                context={context}
                onRoll={roll}
                spellAttack={derived.spellAttack}
                grantedSpells={derived.grantedSpells}
                canEdit={canEdit}
                focusPointsMax={derived.focusPointsMax}
                onCast={openCast}
                castRanks={castRanks}
                sustainedSpells={draft.play.sustainedSpells}
                onSustain={sustainActiveSpell}
                onEndSustain={endActiveSpell}
                onResolveSave={openSaveTool}
                onCastRitual={openRitual}
                onRemoveRitual={removeRitual}
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

          <Card className="sheet-section" id="sheet-feats">
            <div className="sheet-section-head">
              <h2>Feats &amp; features</h2>
              <span className="tiny muted">
                {derived.selectedFeats.length}{" "}
                {derived.selectedFeats.length === 1 ? "feat" : "feats"} · {derived.features.length}{" "}
                class {derived.features.length === 1 ? "feature" : "features"}
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

          <Card className="sheet-section sheet-inventory" id="sheet-inventory">
            <div className="sheet-section-head">
              <h2>Inventory &amp; purse</h2>
              <span className="tiny muted">
                {draft.equipment.length} {draft.equipment.length === 1 ? "stack" : "stacks"} ·{" "}
                {derived.bulk.total} / {derived.bulk.capacity} bulk · {formatCp(inventoryValue)}{" "}
                gear value · Invested {investedCount(draft)} / {INVESTED_LIMIT}
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
                const useInfo = itemUseInfo(item);
                const storedUsesMax = Math.max(0, Math.round(entry.usesMax ?? 0));
                const usesMax =
                  useInfo?.kind === "charged"
                    ? Math.max(0, Math.round(storedUsesMax > 0 ? storedUsesMax : useInfo.usesMax))
                    : 0;
                const usesUsed = Math.max(0, Math.round(entry.usesUsed ?? 0));
                const investable =
                  Boolean(item?.traits?.includes("invested")) || Boolean(entry.invested);
                const atInvestedLimit = investedCount(draft) >= INVESTED_LIMIT && !entry.invested;
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
                      {useInfo?.frequency ? (
                        <span className="tiny muted"> · {useInfo.frequency}</span>
                      ) : null}
                      {usesMax > 0 ? (
                        <span className="tiny muted">
                          {" "}
                          · {Math.max(0, usesMax - usesUsed)} / {usesMax} uses
                        </span>
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
                    {investable ? (
                      <span
                        title={
                          atInvestedLimit
                            ? `All ${INVESTED_LIMIT} invested slots are full`
                            : undefined
                        }
                      >
                        <Toggle
                          checked={entry.invested === true}
                          onChange={(value) => investItem(entry, item, value)}
                          label="Invested"
                          disabled={!canEdit}
                        />
                      </span>
                    ) : null}
                    {useInfo ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => consumeItem(entry, item)}
                        disabled={
                          !canEdit ||
                          (useInfo.kind === "charged" && usesMax > 0 && usesUsed >= usesMax)
                        }
                        title={
                          useInfo.kind === "consumable"
                            ? `Use one ${name}`
                            : `Activate ${name}${useInfo.frequency ? ` (${useInfo.frequency})` : ""}`
                        }
                      >
                        {useInfo.label}
                      </Button>
                    ) : null}
                    <button
                      type="button"
                      className="icon-btn"
                      title={`Remove ${name}`}
                      aria-label={`Remove ${name}`}
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

          <Card className="sheet-section" id="sheet-notes">
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
            <div className="row" style={{ gap: 8, alignItems: "flex-end", marginBottom: 10 }}>
              <Field label="Target DC / AC">
                <Input
                  type="number"
                  min={1}
                  max={99}
                  value={targetDc}
                  onChange={(event) => setTargetDc(event.target.value)}
                  placeholder="Optional"
                  style={{ maxWidth: 110 }}
                />
              </Field>
              <label className={`whisper-small ${secretRoll ? "is-on" : ""}`}>
                <input
                  type="checkbox"
                  checked={secretRoll}
                  onChange={(event) => setSecretRoll(event.target.checked)}
                />
                <EyeOff size={12} /> Secret roll
              </label>
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
                  aria-label="Decrease hit points by 1"
                  onClick={() => applyDamage(1)}
                  disabled={!canEdit}
                >
                  <Minus size={13} />
                </Button>
                <Input
                  type="number"
                  aria-label="Current hit points"
                  value={hpInput}
                  min={0}
                  max={derived.maxHp}
                  disabled={!canEdit}
                  onChange={(event) => setHpInput(event.target.value)}
                  onBlur={commitHpInput}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      event.currentTarget.blur();
                    }
                  }}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="Increase hit points by 1"
                  onClick={() => applyHealing(1)}
                  disabled={!canEdit}
                >
                  <Plus size={13} />
                </Button>
              </div>
              <div className="hp-quick">
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => applyDamage(5)}
                  disabled={!canEdit}
                >
                  −5
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => applyHealing(5)}
                  disabled={!canEdit}
                >
                  +5
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setHp(derived.maxHp)}
                  disabled={!canEdit}
                >
                  Full
                </Button>
              </div>
              <Field
                label="Quick damage type"
                hint="Used by the damage buttons. A type listed in regeneration's suppressed-by field turns regeneration off."
              >
                <Input
                  aria-label="Quick damage type"
                  value={damageType}
                  onChange={(event) => setDamageType(event.target.value)}
                  placeholder="fire, acid, slashing…"
                  disabled={!canEdit}
                />
              </Field>
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

            {derived.conditionEffects.dying > 0 ? (
              <div className="dying-recovery">
                <div className="row-between" style={{ gap: 10, alignItems: "flex-start" }}>
                  <div>
                    <strong>Dying {derived.conditionEffects.dying}</strong>
                    {derived.conditionEffects.doomed > 0 ? (
                      <span className="tiny muted">
                        {" "}
                        · doomed {derived.conditionEffects.doomed} (death threshold{" "}
                        {4 - derived.conditionEffects.doomed})
                      </span>
                    ) : null}
                    <p className="tiny muted">
                      Recovery check DC {10 + derived.conditionEffects.dying} at the start of each
                      turn. In encounter mode, initiative advance defers while Heroic Recovery is
                      available.
                    </p>
                  </div>
                  <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                    <Button
                      size="sm"
                      variant="primary"
                      disabled={!canEdit}
                      aria-label="Roll dying recovery check"
                      onClick={rollDyingRecovery}
                    >
                      Recovery check
                    </Button>
                    {fortune.heroPoints > 0 ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        icon={<Star size={14} />}
                        loading={heroicRecoveryBusy}
                        disabled={!canEdit}
                        aria-label="Use Heroic Recovery"
                        onClick={() => void spendHeroicRecovery()}
                      >
                        Heroic Recovery
                      </Button>
                    ) : null}
                  </div>
                </div>
                <p className="tiny muted">
                  Success: −1 dying · Critical success: −2 · Failure: +1 · Critical failure: +2.
                  Heroic Recovery spends all Hero Points to stabilize at 0 HP without adding
                  wounded.
                </p>
              </div>
            ) : null}

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
                      aria-label={`Set hero points to ${index + 1}`}
                      aria-pressed={draft.play.heroPoints === index + 1}
                    />
                  ))}
                </div>
              </div>
              <div className="point-row">
                <span>Hero Point reroll</span>
                <Button
                  size="sm"
                  variant={heroPointArmed ? "primary" : "ghost"}
                  disabled={!canEdit || draft.play.heroPoints < 1}
                  onClick={() => setHeroPointArmed((armed) => !armed)}
                  title="Spend 1 Hero Point on your next roll and use the new result."
                >
                  {heroPointArmed ? "Armed: roll now" : "Arm next roll"}
                </Button>
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
              <div
                className="point-row"
                title="Cost of living from Player Core table 6-16, prorated to a downtime day."
              >
                <span>Lifestyle</span>
                <Select
                  value={draft.play.lifestyle}
                  aria-label="Cost of living"
                  disabled={!canEdit}
                  style={{ maxWidth: 180 }}
                  onChange={(event) =>
                    update((current) => ({
                      ...current,
                      play: { ...current.play, lifestyle: normalizeLifestyle(event.target.value) },
                    }))
                  }
                >
                  {LIFESTYLE_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label} · {formatCp(option.weeklyCp)}/week
                    </option>
                  ))}
                </Select>
              </div>
              <div
                className="point-row"
                title="The GM grants downtime days. Spending one pays that day's cost of living."
              >
                <span>Downtime</span>
                <div className="row" style={{ gap: 7, alignItems: "center" }}>
                  <strong>
                    {draft.play.downtimeDays} day{draft.play.downtimeDays === 1 ? "" : "s"}
                  </strong>
                  <span className="tiny muted">{formatCp(upkeepRate.dailyCp)}/day</span>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={
                      !canEdit || draft.play.downtimeDays <= 0 || !upkeepAffordable || downtimeBusy
                    }
                    loading={downtimeBusy}
                    onClick={() => void spendDowntime()}
                    title={
                      upkeepAffordable
                        ? `Spend 1 downtime day and ${formatCp(upkeepRate.dailyCp)} on ${upkeepRate.label.toLowerCase()} living.`
                        : `Not enough coins for ${upkeepRate.label.toLowerCase()} living (${formatCp(upkeepRate.dailyCp)} per day).`
                    }
                  >
                    Spend
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<ScrollText size={13} />}
                    disabled={!canEdit}
                    onClick={() => setDowntimeOpen(true)}
                  >
                    Activities
                  </Button>
                </div>
              </div>
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
                        aria-label={`Set focus points to ${index + 1}`}
                        aria-pressed={draft.play.focusPoints === index + 1}
                      />
                    ))}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={!canEdit || draft.play.focusPoints >= derived.focusPointsMax}
                    onClick={() =>
                      update((current) => ({
                        ...current,
                        play: {
                          ...current.play,
                          focusPoints: Math.min(
                            derived.focusPointsMax,
                            current.play.focusPoints + 1
                          ),
                        },
                      }))
                    }
                    title="Refocus for 10 minutes to regain 1 Focus Point."
                  >
                    Refocus
                  </Button>
                </div>
              ) : null}
              <div className="point-row">
                <span>Shield raised</span>
                <Toggle
                  checked={draft.play.shieldRaised}
                  ariaLabel="Shield raised"
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
          </Card>

          <Card className="sheet-meta-card">
            <h3>Traits</h3>
            <dl>
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
                <dd>
                  {derived.senses.map((sense) => VISION_LABELS[sense] ?? sense).join(", ") ||
                    "Normal"}
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
              Prepared casters choose today&apos;s spells after the rest; their current prepared
              list stays selected as the starting point. Hero points and XP are unchanged, and
              companion HP is not touched. Other conditions are left for the GM to adjudicate.
            </p>
            {draft.play.afflictions.length ? (
              <p className="tiny muted">
                Afflictions remain active and need their own stage saves:{" "}
                {draft.play.afflictions.map((entry) => entry.name).join(", ")}.
              </p>
            ) : null}
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
        open={recoveryOpen}
        onClose={() => setRecoveryOpen(false)}
        title="Recovery"
        subtitle="Treat Wounds, Battle Medicine, and Stabilize, rolled by the server."
        footer={
          <>
            <Button variant="ghost" onClick={() => setRecoveryOpen(false)}>
              Close
            </Button>
            {recoverySelf && (recoveryTreatImmune || recoveryBattleImmune) ? (
              <Button variant="ghost" onClick={() => void clearRecoveryImmunity()}>
                Clear immunity
              </Button>
            ) : null}
            <Button
              variant="primary"
              icon={<HeartPulse size={14} />}
              disabled={recoveryBusy || recoveryBlocked}
              onClick={() => void runRecovery()}
            >
              {recoveryBusy ? "Treating…" : `Perform ${RECOVERY_LABELS[recoveryActivity]}`}
            </Button>
          </>
        }
      >
        <div className="stack">
          {recoveryError ? (
            <div className="settings-note">
              <CircleAlert size={16} />
              <span>{recoveryError}</span>
            </div>
          ) : null}
          <div className="form-grid two">
            <Field label="Activity">
              <Select
                value={recoveryActivity}
                onChange={(event) => chooseRecoveryActivity(event.target.value as RecoveryActivity)}
              >
                {recoveryActivityOptions.map((activity) => (
                  <option key={activity} value={activity}>
                    {RECOVERY_LABELS[activity]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Target">
              <Select
                value={recoveryTargetId}
                onChange={(event) => {
                  setRecoveryTargetId(event.target.value);
                  setRecoveryResult(null);
                }}
              >
                {recoveryParty.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                    {entry.id === character?.id ? " (you)" : ""}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Medicine DC">
              <Select
                value={String(recoveryDc)}
                onChange={(event) => {
                  setRecoveryDc(Number(event.target.value));
                  setRecoveryResult(null);
                }}
                disabled={recoveryActivity === "stabilize"}
              >
                {recoveryDcs.map((dc) => (
                  <option key={dc} value={dc}>
                    DC {dc}
                    {recoveryHealingFormula(dc) ? ` — heals ${recoveryHealingFormula(dc)}` : ""}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Medicine">
              <Input
                readOnly
                value={
                  derived?.skills.find((skill) => skill.id === "medicine")
                    ? `${signed(derived.skills.find((skill) => skill.id === "medicine")!.mod)} (${PROFICIENCY_NAMES[recoveryRank] ?? "Untrained"})`
                    : "Untrained"
                }
              />
            </Field>
          </div>
          <p className="tiny muted">
            {recoveryActivity === "treat-wounds"
              ? "10 minutes. Success restores the listed healing; a critical success doubles it, and a critical failure deals 1d8 damage. The target is then immune to Treat Wounds for 1 hour."
              : recoveryActivity === "battle-medicine"
                ? "1 action. Uses the same DC and healing as Treat Wounds and does not remove wounded. The target is then immune to this healer's Battle Medicine for 1 day."
                : "2 actions, DC 15. Success ends dying; a critical success also restores 1 HP. A critical failure increases dying by 1."}
          </p>
          {recoveryRank < 1 ? (
            <div className="settings-note">
              <CircleAlert size={16} />
              <span>
                Train Medicine before using recovery activities. The healer's own Medicine rank and
                modifier are used.
              </span>
            </div>
          ) : null}
          {recoveryTargetHp ? (
            <p className="tiny muted">
              {recoveryTargetName}: {recoveryTargetHp}
              {recoveryTreatImmune ? " · immune to Treat Wounds" : ""}
              {recoveryBattleImmune ? " · immune to your Battle Medicine" : ""}
            </p>
          ) : null}
          {recoveryResult ? (
            <div className="settings-note">
              <div className="stack" style={{ width: "100%" }}>
                <div className="row-between">
                  <strong>
                    {RECOVERY_LABELS[recoveryResult.activity]}: {recoveryResult.roll.total} vs DC{" "}
                    {recoveryResult.dc}
                  </strong>
                  {recoveryResult.degree ? (
                    <Badge
                      tone={
                        recoveryResult.degree === "critical-success" ||
                        recoveryResult.degree === "success"
                          ? "green"
                          : "red"
                      }
                    >
                      {DEGREE_LABELS[recoveryResult.degree]}
                    </Badge>
                  ) : null}
                </div>
                {recoveryResult.healingRoll ? (
                  <p className="tiny muted">
                    Healing roll {recoveryResult.healingRoll.total}; {recoveryResult.healed} HP
                    restored after the HP cap.
                  </p>
                ) : null}
                {recoveryResult.damageRoll ? (
                  <p className="tiny muted">
                    Critical-failure damage roll {recoveryResult.damageRoll.total};{" "}
                    {recoveryResult.damage} HP lost.
                  </p>
                ) : null}
                <ul className="rest-preview">
                  {recoveryResult.notes.map((note, index) => (
                    <li key={`${note}-${index}`}>
                      <span>{note}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}
        </div>
      </Modal>

      <Modal
        open={spellToolsOpen}
        onClose={() => setSpellToolsOpen(false)}
        title="Spell checks"
        subtitle="Counteract checks and saving throws, including incapacitation."
        footer={
          <>
            <Button variant="ghost" onClick={() => setSpellToolsOpen(false)}>
              Close
            </Button>
            <Button
              variant="primary"
              icon={<Sparkles size={14} />}
              onClick={spellToolsMode === "counteract" ? runCounteractTool : runSaveTool}
            >
              {spellToolsMode === "counteract" ? "Roll counteract" : "Roll save"}
            </Button>
          </>
        }
      >
        <div className="stack">
          <div className="row" style={{ gap: 8 }}>
            <Button
              size="sm"
              variant={spellToolsMode === "counteract" ? "primary" : "ghost"}
              onClick={() => {
                setSpellToolsMode("counteract");
                setSpellToolsResult(null);
              }}
            >
              Counteract
            </Button>
            <Button
              size="sm"
              variant={spellToolsMode === "save" ? "primary" : "ghost"}
              onClick={() => {
                setSpellToolsMode("save");
                setSpellToolsIncapacitation(false);
                setSpellToolsLabel("Effect");
                setSpellToolsSaveType("save");
                setSpellToolsResult(null);
              }}
            >
              Resolve save
            </Button>
          </div>
          {spellToolsMode === "counteract" ? (
            <div className="form-grid two">
              <Field label="Counteract modifier" hint="Usually spell attack or spell DC - 10.">
                <Input
                  type="number"
                  value={spellToolsModifier}
                  onChange={(event) => setSpellToolsModifier(event.target.value)}
                />
              </Field>
              <Field label="Effect DC">
                <Input
                  type="number"
                  min={1}
                  value={spellToolsDc}
                  onChange={(event) => setSpellToolsDc(event.target.value)}
                />
              </Field>
              <Field label="Your counteract rank" hint="Usually the spell rank you cast.">
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={spellToolsCastRank}
                  onChange={(event) => setSpellToolsCastRank(event.target.value)}
                />
              </Field>
              <Field label="Effect rank">
                <Input
                  type="number"
                  min={0}
                  max={20}
                  value={spellToolsEffectRank}
                  onChange={(event) => setSpellToolsEffectRank(event.target.value)}
                />
              </Field>
            </div>
          ) : (
            <div className="form-grid two">
              <Field label="Effect">
                <Input
                  value={spellToolsLabel}
                  onChange={(event) => setSpellToolsLabel(event.target.value)}
                />
              </Field>
              <Field label="Save type">
                <Input
                  value={spellToolsSaveType}
                  onChange={(event) => setSpellToolsSaveType(event.target.value)}
                />
              </Field>
              <Field label="Save DC">
                <Input
                  type="number"
                  min={1}
                  value={spellToolsDc}
                  onChange={(event) => setSpellToolsDc(event.target.value)}
                />
              </Field>
              <Field label="Effect rank">
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={spellToolsEffectRank}
                  onChange={(event) => setSpellToolsEffectRank(event.target.value)}
                />
              </Field>
              <Field label="Target level">
                <Input
                  type="number"
                  min={1}
                  max={30}
                  value={spellToolsTargetLevel}
                  onChange={(event) => setSpellToolsTargetLevel(event.target.value)}
                />
              </Field>
              <Field label="Target save bonus">
                <Input
                  type="number"
                  value={spellToolsSaveBonus}
                  onChange={(event) => setSpellToolsSaveBonus(event.target.value)}
                />
              </Field>
            </div>
          )}
          {spellToolsMode === "save" && spellToolsIncapacitation ? (
            <div className="settings-note">
              <CircleAlert size={16} />
              <span>{incapacitationNote(Number(spellToolsEffectRank) || 1)}</span>
            </div>
          ) : null}
          {spellToolsResult ? (
            <div className="settings-note">
              <div className="stack" style={{ width: "100%" }}>
                <div className="row-between">
                  <strong>
                    {spellToolsResult.kind === "counteract" ? "Counteract" : "Save"}:{" "}
                    {spellToolsResult.roll.total} vs DC {spellToolsResult.roll.dc}
                  </strong>
                  {spellToolsResult.degree ? (
                    <Badge
                      tone={
                        spellToolsResult.degree === "critical-success" ||
                        spellToolsResult.degree === "success"
                          ? "green"
                          : "red"
                      }
                    >
                      {
                        DEGREE_LABELS[
                          spellToolsResult.adjustedDegree ?? spellToolsResult.degree ?? "failure"
                        ]
                      }
                    </Badge>
                  ) : null}
                </div>
                {spellToolsResult.adjustedDegree !== spellToolsResult.degree ? (
                  <p className="tiny muted">
                    Rolled {spellToolsResult.degree ? DEGREE_LABELS[spellToolsResult.degree] : "-"}.
                  </p>
                ) : null}
                {spellToolsResult.counteract ? (
                  <p className="tiny muted">
                    Counteract rank {spellToolsResult.counteract.counteractRank ?? "-"} versus
                    effect rank {spellToolsResult.counteract.effectRank}.
                  </p>
                ) : null}
                <p className="tiny muted">{spellToolsResult.note}</p>
              </div>
            </div>
          ) : null}
        </div>
      </Modal>

      <Modal
        open={Boolean(ritualSpell)}
        onClose={() => setRitualSpell(null)}
        title={ritualSpell ? `Cast ${ritualSpell.name}` : "Cast ritual"}
        subtitle="Rituals are downtime magic. Roll the primary check; apply costs and consequences manually."
        footer={
          <>
            <Button variant="ghost" onClick={() => setRitualSpell(null)}>
              Close
            </Button>
            <Button
              variant="primary"
              icon={<Sparkles size={14} />}
              disabled={!ritualSpell || !derived}
              onClick={runRitual}
            >
              Roll ritual check
            </Button>
          </>
        }
      >
        {ritualSpell ? (
          <div className="stack">
            <div className="form-grid two">
              <Field label="Primary check">
                <Select
                  value={ritualSkillId}
                  onChange={(event) => setRitualSkillId(event.target.value)}
                >
                  {derived?.skills.map((skill) => (
                    <option key={skill.id} value={skill.id}>
                      {skill.name} {signed(skill.mod)} ({PROFICIENCY_NAMES[skill.rank]})
                    </option>
                  ))}
                  {derived?.lore.map((lore) => (
                    <option key={lore.name} value={lore.name}>
                      {lore.name} {signed(lore.mod)} (Lore)
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label="Ritual DC"
                hint="The GM sets the DC from the ritual's rank and circumstances."
              >
                <Input
                  type="number"
                  min={1}
                  value={ritualDc}
                  onChange={(event) => setRitualDc(event.target.value)}
                />
              </Field>
            </div>
            <p className="tiny muted">
              Rank {ritualSpell.rank} · {ritualSpell.actions || "ritual"}
              {ritualSpell.cost ? ` · cost ${stripHtml(ritualSpell.cost, 160)}` : ""}
              {ritualSpell.requirements
                ? ` · requirements ${stripHtml(ritualSpell.requirements, 160)}`
                : ""}
            </p>
            <p className="tiny muted">
              {stripHtml(ritualSpell.description, 360) ||
                "Read the ritual's primary check, secondary casters, and outcome."}
            </p>
            {ritualResult ? (
              <div className="settings-note">
                <div className="row-between">
                  <strong>
                    {ritualResult.total} vs DC {ritualResult.dc}
                  </strong>
                  {ritualResult.degree ? (
                    <Badge
                      tone={
                        ritualResult.degree === "critical-success" ||
                        ritualResult.degree === "success"
                          ? "green"
                          : "red"
                      }
                    >
                      {DEGREE_LABELS[ritualResult.degree]}
                    </Badge>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>

      <DailyPreparationsModal
        open={prepOpen}
        onClose={() => setPrepOpen(false)}
        draft={draft}
        context={context}
        derived={derived}
        onApply={applyDailyPreparations}
      />

      <DowntimeModal
        open={downtimeOpen}
        onClose={() => setDowntimeOpen(false)}
        character={character}
        draft={draft}
        derived={derived}
        canEdit={canEdit}
        toast={toast}
        onCharacterUpdated={applyUpdatedCharacter}
      />

      <ShopModal
        open={shopOpen}
        onClose={() => setShopOpen(false)}
        character={character}
        onCharacterUpdated={applyUpdatedCharacter}
        toast={toast}
      />

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
        open={Boolean(castState && castSpellEntry)}
        onClose={() => setCastState(null)}
        title={castSpellEntry ? `Cast ${castSpellEntry.name}` : "Cast spell"}
        subtitle="Choose the rank and resource, then roll from the spell row."
        footer={
          <>
            <Button variant="ghost" onClick={() => setCastState(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              icon={<Sparkles size={15} />}
              disabled={!selectedCastOption || !spellCastOptionAvailable(selectedCastOption)}
              onClick={confirmCast}
            >
              Cast spell
            </Button>
          </>
        }
      >
        {castSpellEntry ? (
          <div className="stack">
            <p className="tiny muted">
              {castSpellEntry.actions || "cast"} · {castSpellEntry.range || "range —"}
              {castSpellEntry.defense?.save ? ` · ${castSpellEntry.defense.save} save` : ""}
            </p>
            {castVariants.length ? (
              <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span className="field-label">Actions</span>
                <div className="chip-row">
                  {castVariants.map((variant) => {
                    const selected = selectedCastVariant?.actions === variant.actions;
                    return (
                      <Button
                        key={variant.actions}
                        size="sm"
                        variant={selected ? "primary" : "ghost"}
                        aria-pressed={selected}
                        aria-label={`Use ${variant.label} for ${castSpellEntry.name}`}
                        title={variant.note}
                        onClick={() =>
                          setCastState((current) =>
                            current ? { ...current, actions: variant.actions } : current
                          )
                        }
                      >
                        {variant.label}
                      </Button>
                    );
                  })}
                </div>
                <span className="tiny muted">{selectedCastVariant?.note}</span>
              </div>
            ) : null}
            {castPreparedRows.length ? (
              <p className="tiny muted" data-testid="cast-prepared-summary">
                Prepared: {castPreparedSummary}
              </p>
            ) : null}
            {castOptions.length > 1 ? (
              <Field label="Cast at rank">
                <Select
                  aria-label="Cast at rank"
                  value={`${selectedCastOption?.rank}:${selectedCastOption?.resource}`}
                  onChange={(event) => {
                    const [rank, resource] = event.target.value.split(":");
                    setCastState((current) =>
                      current
                        ? {
                            ...current,
                            rank: Number(rank),
                            resource: resource as SpellCastResource,
                          }
                        : current
                    );
                  }}
                >
                  {castOptions.map((option) => (
                    <option
                      key={`${option.rank}:${option.resource}`}
                      value={`${option.rank}:${option.resource}`}
                      disabled={!spellCastOptionAvailable(option)}
                    >
                      Rank {option.rank} · {option.label} · {castRemainingLabel(option)}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : (
              <p className="cast-cost">
                Rank {selectedCastOption?.rank} · {selectedCastOption?.label} ·{" "}
                {selectedCastOption ? castRemainingLabel(selectedCastOption) : "unavailable"}
              </p>
            )}
            <p className="cast-cost">
              Cost: <strong>{castCostLabel(selectedCastOption)}</strong>.
            </p>
            <ul className="rest-preview">
              <li>
                <span>Spell attack</span>
                <strong>
                  {derived?.spellAttack === null || derived?.spellAttack === undefined
                    ? "—"
                    : signed(derived.spellAttack)}
                </strong>
              </li>
              <li>
                <span>Spell DC</span>
                <strong>{derived?.spellDc ?? "—"}</strong>
              </li>
              {selectedCastVariant ? (
                <li>
                  <span>{selectedCastVariant.healing ? "Healing" : "Damage"}</span>
                  <strong>
                    {selectedCastVariant.formula}{" "}
                    {selectedCastVariant.healing ? "HP" : selectedCastVariant.type}
                  </strong>
                </li>
              ) : castDamage?.parts.length ? (
                <li>
                  <span>{isHealingSpell(castSpellEntry) ? "Healing" : "Damage"}</span>
                  <strong>
                    {castDamage.parts
                      .map((part) => `${part.formula} ${part.type}`.trim())
                      .join(", ")}
                  </strong>
                </li>
              ) : null}
              {selectedCastVariant ? (
                <li>
                  <span>Range / area</span>
                  <strong>{selectedCastVariant.note}</strong>
                </li>
              ) : castDamage?.areaDelta ? (
                <li>
                  <span>Area</span>
                  <strong>+{castDamage.areaDelta} ft.</strong>
                </li>
              ) : null}
            </ul>
            {selectedCastVariant ? (
              <>
                <p className="tiny muted">{selectedCastVariant.detail}</p>
                <p className="tiny muted">Heightened to rank {selectedCastOption?.rank}.</p>
              </>
            ) : selectedCastOption ? (
              (() => {
                const hint = spellHeighteningHint(castSpellEntry, selectedCastOption.rank);
                if (hint) return <p className="tiny muted">{hint}</p>;
                const printed = spellHeighteningNotes(castSpellEntry)[0];
                return printed ? <p className="tiny muted">{printed}</p> : null;
              })()
            ) : null}
            {castVariants.length ? null : (
              <p className="tiny muted">
                Save spells use your spell DC; targets roll the save. Action-count variants, area
                changes, and unsupported heightening remain manual.
              </p>
            )}
          </div>
        ) : null}
      </Modal>

      <Modal
        open={afflictionOpen}
        onClose={() => setAfflictionOpen(false)}
        title={afflictionEditingId ? "Edit affliction" : "Add affliction"}
        subtitle="Set the stage from the exposure save (failure = 1, critical failure = 2). Recovery rolls use the chosen save and update the stage automatically."
        footer={
          <>
            <Button variant="ghost" onClick={() => setAfflictionOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={saveAffliction}>
              Save affliction
            </Button>
          </>
        }
      >
        <div className="stack">
          <Field label="Name">
            <Input
              autoFocus
              value={afflictionForm.name}
              onChange={(event) =>
                setAfflictionForm((current) => ({ ...current, name: event.target.value }))
              }
              placeholder="e.g. Giant Spider Venom"
              maxLength={80}
            />
          </Field>
          <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
            <Field label="Type">
              <Select
                aria-label="Affliction type"
                value={afflictionForm.type}
                onChange={(event) =>
                  setAfflictionForm((current) => ({
                    ...current,
                    type: event.target.value as AfflictionType,
                  }))
                }
              >
                {AFFLICTION_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {afflictionTypeLabel(type)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="DC">
              <Input
                type="number"
                min={1}
                max={60}
                value={afflictionForm.dc}
                onChange={(event) =>
                  setAfflictionForm((current) => ({
                    ...current,
                    dc: Math.max(1, Math.min(60, Math.round(Number(event.target.value) || 0))),
                  }))
                }
                style={{ maxWidth: 110 }}
              />
            </Field>
            <Field label="Save">
              <Select
                aria-label="Stage save"
                value={afflictionForm.save}
                onChange={(event) =>
                  setAfflictionForm((current) => ({
                    ...current,
                    save: event.target.value as "fortitude" | "reflex" | "will",
                  }))
                }
              >
                {(["fortitude", "reflex", "will"] as const).map((key) => (
                  <option key={key} value={key}>
                    {SAVE_LABELS[key]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
            <Field label="Current stage">
              <Input
                type="number"
                min={1}
                max={afflictionForm.stageMax}
                value={afflictionForm.stage}
                onChange={(event) =>
                  setAfflictionForm((current) => ({
                    ...current,
                    stage: Math.max(
                      1,
                      Math.min(current.stageMax, Math.round(Number(event.target.value) || 1))
                    ),
                  }))
                }
                style={{ maxWidth: 120 }}
              />
            </Field>
            <Field label="Maximum stage">
              <Input
                type="number"
                min={1}
                max={10}
                value={afflictionForm.stageMax}
                onChange={(event) => {
                  const stageMax = Math.max(
                    1,
                    Math.min(10, Math.round(Number(event.target.value) || 1))
                  );
                  setAfflictionForm((current) => ({
                    ...current,
                    stageMax,
                    stage: Math.min(current.stage, stageMax),
                  }));
                }}
                style={{ maxWidth: 120 }}
              />
            </Field>
          </div>
          <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
            <Field label="Onset">
              <Input
                aria-label="Affliction onset"
                value={afflictionForm.onset}
                onChange={(event) => {
                  const onset = event.target.value;
                  setAfflictionForm((current) => ({
                    ...current,
                    onset,
                    onsetRemaining: initialOnsetRemaining(onset),
                  }));
                }}
                placeholder="e.g. 1 round or 1 hour"
                maxLength={40}
              />
            </Field>
            <Field label="Stage interval">
              <Input
                aria-label="Affliction stage interval"
                value={afflictionForm.interval}
                onChange={(event) => {
                  const interval = event.target.value;
                  setAfflictionForm((current) => ({
                    ...current,
                    interval,
                    intervalRemaining: initialIntervalRemaining(interval),
                  }));
                }}
                placeholder="blank = no periodic save"
                maxLength={40}
              />
            </Field>
            <Field label="Maximum duration">
              <Input
                value={afflictionForm.duration}
                onChange={(event) =>
                  setAfflictionForm((current) => ({ ...current, duration: event.target.value }))
                }
                placeholder="e.g. 1 minute; blank = until cured"
                maxLength={40}
              />
            </Field>
          </div>
          <p className="tiny muted">
            One interval drives the Stage save button. Record per-stage interval differences and
            effects in the notes. Use a round-based onset and interval (for example, 1 round) to
            tick them automatically at the end of your turn; other units stay manual.
          </p>
          <Checkbox
            label="Virulent (two consecutive successes per stage)"
            checked={afflictionForm.virulent}
            onChange={(value) =>
              setAfflictionForm((current) => ({
                ...current,
                virulent: value,
                virulentSuccesses: value ? current.virulentSuccesses : 0,
              }))
            }
          />
          {afflictionForm.virulent ? (
            <Field label="Virulent critical success">
              <Select
                aria-label="Virulent critical success"
                value={afflictionForm.virulentCrit}
                onChange={(event) =>
                  setAfflictionForm((current) => ({
                    ...current,
                    virulentCrit: event.target.value as "reduce" | "streak",
                  }))
                }
              >
                <option value="reduce">Reduce 1 stage (common reading)</option>
                <option value="streak">Count as one success (strict reading)</option>
              </Select>
            </Field>
          ) : null}
          <Checkbox
            label="Stage saves can end this affliction"
            checked={afflictionForm.savesCanEnd}
            onChange={(value) =>
              setAfflictionForm((current) => ({ ...current, savesCanEnd: value }))
            }
          />
          {afflictionForm.type === "curse" && afflictionForm.savesCanEnd ? (
            <p className="tiny muted">
              Curses usually require a curse-specific removal. Turn this off unless the stat block
              gives the curse stage saves that can end it.
            </p>
          ) : null}
          <Field label="Stage effects / notes">
            <Textarea
              rows={3}
              value={afflictionForm.notes}
              onChange={(event) =>
                setAfflictionForm((current) => ({ ...current, notes: event.target.value }))
              }
              placeholder="Stage 1: …  Stage 2: …  Stage 3: …"
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={Boolean(conflict)}
        onClose={() => setConflict(null)}
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
function castRemainingLabel(option: SpellCastOption): string {
  return option.remaining === null ? "unlimited" : `${option.remaining} left`;
}

function spellTestId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function castCostLabel(option: SpellCastOption | null): string {
  if (!option) return "nothing";
  if (option.resource === "cantrip") return "no slot";
  if (option.resource === "focus") return "1 focus point";
  if (option.resource === "font") return "1 divine font slot";
  return `1 rank ${option.rank} slot`;
}

function castHint(
  options: SpellCastOption[],
  kind: "known" | "cantrip" | "focus" | "innate",
  preparedCaster: boolean
): string {
  const available = options.find(spellCastOptionAvailable);
  if (available) {
    if (available.resource === "cantrip") return `rank ${available.rank} · no slot`;
    if (available.resource === "innate") {
      return available.remaining === null
        ? "innate · at will"
        : `innate · ${available.remaining} use${available.remaining === 1 ? "" : "s"} left`;
    }
    if (available.resource === "focus") {
      return `${available.remaining ?? 0} focus point${available.remaining === 1 ? "" : "s"}`;
    }
    if (available.resource === "font") return `divine font · ${available.remaining} left`;
    return `rank ${available.rank} slot · ${available.remaining} left`;
  }
  if (!options.length) {
    return preparedCaster && kind === "known" ? "not prepared" : "no slots";
  }
  const font = options.find((option) => option.resource === "font");
  if (font) return "no font casts left";
  const focus = options.find((option) => option.resource === "focus");
  if (focus) return "no focus points";
  const innate = options.find((option) => option.resource === "innate");
  if (innate) return "no innate uses left";
  const slot = options.find((option) => option.resource === "slot");
  if (slot) {
    return preparedCaster
      ? `no rank ${slot.rank} prepared casts left`
      : `no rank ${slot.rank} slots left`;
  }
  return "unavailable";
}

function SpellGroups({
  draft,
  context,
  onRoll,
  spellAttack,
  grantedSpells,
  canEdit,
  focusPointsMax,
  onCast,
  castRanks,
  sustainedSpells,
  onSustain,
  onEndSustain,
  onResolveSave,
  onCastRitual,
  onRemoveRitual,
}: {
  draft: CharacterDraft;
  context: CharacterContext;
  onRoll: (formula: string, label: string, dc?: number | null) => void;
  spellAttack: number | null;
  grantedSpells: DerivedCharacter["grantedSpells"];
  canEdit: boolean;
  focusPointsMax: number;
  onCast: (
    spell: NonNullable<CharacterContext["spells"][string]>,
    kind: "known" | "cantrip" | "focus" | "innate"
  ) => void;
  castRanks: Record<string, number>;
  sustainedSpells: SustainedSpell[];
  onSustain: (name: string) => void;
  onEndSustain: (spellId: string) => void;
  onResolveSave: (spell: NonNullable<CharacterContext["spells"][string]>) => void;
  onCastRitual: (spell: NonNullable<CharacterContext["spells"][string]>) => void;
  onRemoveRitual: (spellId: string) => void;
}) {
  const unique = (spells: NonNullable<CharacterContext["spells"][string]>[]) => {
    const seen = new Set<string>();
    return spells.filter((spell) => {
      if (seen.has(spell.id)) return false;
      seen.add(spell.id);
      return true;
    });
  };
  const grantedKind = new Map(grantedSpells.map((spell) => [spell.id, spell.kind]));
  const granted = grantedSpells
    .map((spell) => context.spells[spell.id])
    .filter((spell): spell is NonNullable<typeof spell> => Boolean(spell));
  const preparedRows = preparedEntries(draft, {
    spells: context.spells,
    deity: context.deity,
    classData: context.classData,
  });
  const preparedSpells = unique(
    preparedRows
      .map((entry) => context.spells[entry.id])
      .filter((spell): spell is NonNullable<typeof spell> => Boolean(spell) && spell.rank > 0)
  );
  const known = unique([
    ...draft.spells.known
      .map((id) => context.spells[id])
      .filter((spell): spell is NonNullable<typeof spell> => Boolean(spell)),
    ...preparedSpells,
    ...granted.filter((spell) => spell.rank > 0 && grantedKind.get(spell.id) !== "focus"),
  ]);
  const cantrips = unique([
    ...draft.spells.cantrips
      .map((id) => context.spells[id])
      .filter((spell): spell is NonNullable<typeof spell> => Boolean(spell)),
    ...granted.filter((spell) => spell.rank === 0 && grantedKind.get(spell.id) !== "focus"),
  ]);
  const focus = unique([
    ...draft.spells.focus
      .map((id) => context.spells[id])
      .filter((spell): spell is NonNullable<typeof spell> => Boolean(spell)),
    ...granted.filter((spell) => grantedKind.get(spell.id) === "focus"),
  ]);
  const innate = unique(
    draft.spells.innate
      .map((id) => context.spells[id])
      .filter((spell): spell is NonNullable<typeof spell> => Boolean(spell))
  );
  const rituals = unique(
    draft.spells.rituals
      .map((id) => context.spells[id])
      .filter((spell): spell is NonNullable<typeof spell> => Boolean(spell))
  );
  const prepared = new Map<
    string,
    { count: number; ranks: { rank: number; font: number; ordinary: number }[] }
  >();
  for (const row of preparedRows) {
    const entry = prepared.get(row.id) ?? { count: 0, ranks: [] };
    entry.count += 1;
    const rank = entry.ranks.find((item) => item.rank === row.rank);
    if (rank) {
      if (row.font) rank.font += 1;
      else rank.ordinary += 1;
    } else {
      entry.ranks.push({
        rank: row.rank,
        font: row.font ? 1 : 0,
        ordinary: row.font ? 0 : 1,
      });
    }
    prepared.set(row.id, entry);
  }
  for (const entry of prepared.values()) entry.ranks.sort((a, b) => a.rank - b.rank);
  const preparedCaster = isPreparedCasterClass(context.classData?.name);
  const grouped = new Map<number, typeof known>();
  for (const spell of known) {
    const list = grouped.get(spell.rank) ?? [];
    list.push(spell);
    grouped.set(spell.rank, list);
  }
  const renderRow = (
    spell: NonNullable<CharacterContext["spells"][string]>,
    castKind: "known" | "cantrip" | "focus" | "innate"
  ) => {
    const options = spellCastOptions(spell, draft, context, {
      focus: castKind === "focus",
      focusPointsMax,
      innate: castKind === "innate",
      innateRemaining: castKind === "innate" ? innateUsesRemaining(draft, spell) : undefined,
    });
    return (
      <SpellRow
        key={spell.id}
        spell={spell}
        onRoll={onRoll}
        spellAttack={spellAttack}
        prepared={prepared.get(spell.id)}
        castOptions={options}
        castable={options.some(spellCastOptionAvailable)}
        castHint={castHint(options, castKind, preparedCaster)}
        castKind={castKind}
        onCast={onCast}
        castRank={castRanks[spell.id]}
        canEdit={canEdit}
        sustained={sustainedSpells.find((entry) => entry.spellId === spell.id) ?? null}
        onSustain={onSustain}
        onEndSustain={onEndSustain}
        onResolveSave={onResolveSave}
      />
    );
  };
  return (
    <div className="sheet-spells">
      {cantrips.length ? (
        <div className="spell-group">
          <h4>Cantrips</h4>
          {cantrips.map((spell) => renderRow(spell, "cantrip"))}
        </div>
      ) : null}
      {[...grouped.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([rank, spells]) => (
          <div key={rank} className="spell-group">
            <h4>
              Rank {rank} {preparedCaster ? "spellbook" : "repertoire"}
            </h4>
            {spells.map((spell) => renderRow(spell, "known"))}
          </div>
        ))}
      {focus.length ? (
        <div className="spell-group">
          <h4>Focus spells</h4>
          {focus.map((spell) => renderRow(spell, "focus"))}
        </div>
      ) : null}
      {innate.length ? (
        <div className="spell-group">
          <h4>Innate spells</h4>
          {innate.map((spell) => renderRow(spell, "innate"))}
        </div>
      ) : null}
      {rituals.length ? (
        <div className="spell-group">
          <h4>Rituals</h4>
          <p className="tiny muted">
            Rituals use downtime and a primary skill check. The GM sets the DC and adjudicates
            costs, secondary casters, and consequences.
          </p>
          {rituals.map((spell) => (
            <div key={spell.id} className="sheet-spell-row">
              <div className="grow">
                <strong>{spell.name}</strong>
                <span className="tiny muted">
                  {" "}
                  · rank {spell.rank}
                  {spell.actions ? ` · ${spell.actions}` : ""}
                  {spell.cost ? ` · cost ${stripHtml(spell.cost, 80)}` : ""}
                </span>
              </div>
              <div className="row" style={{ gap: 5 }}>
                <Button
                  size="sm"
                  variant="primary"
                  icon={<Sparkles size={13} />}
                  onClick={() => onCastRitual(spell)}
                >
                  Cast ritual
                </Button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Remove ritual ${spell.name}`}
                  disabled={!canEdit}
                  onClick={() => onRemoveRitual(spell.id)}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {sustainedSpells.length ? (
        <div className="spell-group">
          <h4>Sustained</h4>
          <p className="tiny muted">
            Each Sustain costs 1 action. Spend it in the initiative tracker, then resolve the
            spell&apos;s Sustain entry.
          </p>
          {sustainedSpells.map((entry) => (
            <div key={entry.id} className="sheet-spell-row">
              <div className="grow">
                <strong>{entry.name}</strong>
                <span className="tiny muted">
                  {" "}
                  · rank {entry.rank}
                  {entry.duration ? ` · ${entry.duration}` : ""}
                </span>
              </div>
              <div className="row" style={{ gap: 5 }}>
                <Button size="sm" variant="ghost" onClick={() => onSustain(entry.name)}>
                  Sustain
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onEndSustain(entry.spellId)}
                  disabled={!canEdit}
                >
                  End
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {!cantrips.length && !known.length && !focus.length && !innate.length && !rituals.length ? (
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
  castOptions,
  castable,
  castHint: hint,
  castKind,
  onCast,
  castRank,
  canEdit,
  sustained,
  onSustain,
  onEndSustain,
  onResolveSave,
}: {
  spell: NonNullable<CharacterContext["spells"][string]>;
  onRoll: (formula: string, label: string, dc?: number | null) => void;
  spellAttack: number | null;
  prepared?: { count: number; ranks: { rank: number; font: number; ordinary: number }[] };
  castOptions: SpellCastOption[];
  castable: boolean;
  castHint: string;
  castKind: "known" | "cantrip" | "focus" | "innate";
  onCast: (
    spell: NonNullable<CharacterContext["spells"][string]>,
    kind: "known" | "cantrip" | "focus" | "innate"
  ) => void;
  castRank?: number;
  canEdit: boolean;
  sustained: SustainedSpell | null;
  onSustain: (name: string) => void;
  onEndSustain: (spellId: string) => void;
  onResolveSave: (spell: NonNullable<CharacterContext["spells"][string]>) => void;
}) {
  const damageRank = castRank ?? castOptions[0]?.rank ?? Math.max(1, spell.rank);
  const damage = spellDamageAtRank(spell, damageRank);
  const actionVariants = spellActionVariants(spell, damageRank);
  const healing = isHealingSpell(spell);
  const computedDamage = damage.parts
    .map((part) => `${part.formula} ${part.type}`.trim())
    .join(", ");
  const showBaseDamage = Boolean(
    spell.damageText && damageRank > Math.max(1, spell.rank) && spell.damageText !== computedDamage
  );
  const damageLabel = (part: { type: string }) => {
    const kind = healing ? "healing" : `${part.type || "untyped"} damage`;
    const rankSuffix = damageRank > Math.max(1, spell.rank) ? ` (rank ${damageRank})` : "";
    return `${spell.name} ${kind}${rankSuffix}`;
  };
  const preparedRankDetail = prepared
    ? prepared.ranks
        .flatMap((entry) => {
          const parts: string[] = [];
          if (entry.font) parts.push(`rank ${entry.rank} font ×${entry.font}`);
          if (entry.ordinary) parts.push(`rank ${entry.rank} ordinary ×${entry.ordinary}`);
          return parts;
        })
        .join(", ")
    : "";
  const showPreparedRanks = Boolean(
    prepared &&
    (prepared.ranks.length > 1 ||
      prepared.ranks.some((entry) => entry.font > 0) ||
      prepared.ranks.some((entry) => entry.rank !== spell.rank))
  );
  return (
    <HoverCard
      title={spell.name}
      subtitle={`${spell.rank === 0 ? "Cantrip" : `Rank ${spell.rank}`} · ${spellTraditionLabel(spell)} · ${spell.source}`}
      body={stripHtml(spell.description, 220) || undefined}
      meta={spell.damageText ? <span>{spell.damageText}</span> : undefined}
    >
      <div className="sheet-spell-row" data-testid={`sheet-spell-${spellTestId(spell.name)}`}>
        <div className="grow">
          <strong>{spell.name}</strong>
          {sustained ? <Badge tone="blue">Sustained</Badge> : null}
          {prepared ? (
            <span
              className="tiny gold-text"
              data-testid={`sheet-prepared-${spellTestId(spell.name)}`}
            >
              {" "}
              · Prepared{prepared.count > 1 ? ` ×${prepared.count}` : ""}
            </span>
          ) : null}
          {showPreparedRanks ? (
            <span
              className="tiny muted"
              data-testid={`sheet-prepared-ranks-${spellTestId(spell.name)}`}
            >
              {" "}
              ({preparedRankDetail})
            </span>
          ) : null}
          <span className="tiny muted">
            {" "}
            · {spell.actions || "—"} · {spell.range || "range —"}
            {spell.defense?.save ? ` · ${spell.defense.save}` : ""}
          </span>
          {actionVariants.length ? (
            <span className="tiny muted">
              {" "}
              ·{" "}
              {actionVariants
                .map((variant) => `${variant.actions}a ${variant.formula}`)
                .join(" · ")}
            </span>
          ) : spell.damageText ? (
            <span className="tiny muted">
              {" "}
              · {showBaseDamage ? `Base ${spell.damageText}` : spell.damageText}
            </span>
          ) : null}
          <span className={`tiny ${castable ? "gold-text" : "muted"}`}> · {hint}</span>
          {spellHasIncapacitation(spell) ? (
            <span className="tiny muted"> · {incapacitationNote(spell.rank)}</span>
          ) : null}
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
          {actionVariants.length
            ? actionVariants.map((variant) => (
                <Button
                  key={variant.actions}
                  size="sm"
                  variant="ghost"
                  title={`${variant.label} · ${variant.note} · ${variant.formula}`}
                  aria-label={`Roll ${spell.name} with ${variant.label}`}
                  onClick={() => onRoll(variant.formula, variant.rollLabel)}
                >
                  <Swords size={13} /> {variant.actions}a {variant.formula}
                </Button>
              ))
            : damage.parts.map((part, index) => (
                <Button
                  key={`${part.type}-${index}`}
                  size="sm"
                  variant="ghost"
                  title={damage.supported ? undefined : "Heightening is manual for this spell."}
                  onClick={() => onRoll(part.formula, damageLabel(part))}
                >
                  <Swords size={13} /> {part.formula}
                  {part.type && !healing ? ` ${part.type}` : ""}
                </Button>
              ))}
          {spell.defense?.save ? (
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Resolve ${spell.name} save`}
              title={`Resolve a ${spell.defense.save} save, including incapacitation when applicable`}
              onClick={() => onResolveSave(spell)}
            >
              Save
            </Button>
          ) : null}
          {sustained ? (
            <>
              <Button size="sm" variant="ghost" onClick={() => onSustain(spell.name)}>
                Sustain
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onEndSustain(spell.id)}
                disabled={!canEdit}
              >
                End
              </Button>
            </>
          ) : null}
          <Button
            size="sm"
            variant="primary"
            aria-label={`Cast ${spell.name}`}
            disabled={!canEdit || !castable}
            title={castable ? `Cast ${spell.name}` : hint}
            onClick={() => onCast(spell, castKind)}
          >
            <Sparkles size={13} /> Cast
          </Button>
        </div>
      </div>
    </HoverCard>
  );
}
