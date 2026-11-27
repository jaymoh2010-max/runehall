import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  BookOpen,
  ChevronDown,
  CircleAlert,
  Dices,
  Heart,
  Minus,
  Moon,
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
  ActionRef,
  CharacterCondition,
  CharacterContext,
  CharacterCustomItem,
  CharacterDraft,
  CharacterRecord,
  DerivedCharacter,
  Equipment,
  SaveKey,
  Spell,
} from "../../../shared/types";
import {
  computeCharacter,
  isPreparedCasterClass,
  normalizeCharacterDraft,
  preparedCantripIds,
  signed,
  sourceSpellIds,
  spellSourceLabel,
  titleCase,
  withSourceSpellIds,
} from "../../../shared/rules";
import { currencyToCp, spendCurrency } from "../../../shared/inventory";
import { learnSpellCostCp, learnSpellDc } from "../../../shared/spellLearning";
import {
  flexibleWandRank,
  scrollSpellRank,
  specificWandSpell,
  staffSpells,
  staffSpecialEffect,
  wandSpellRank,
} from "../../../shared/itemSpellcasting";
import { SpellPicker } from "../builder/pickers";
import { applyHpEditToDraft } from "../../../shared/damage";
import { applyAttackPenalty, rollFormula } from "../../../shared/dice";
import type { LongRestResult } from "../../../shared/rest";
import {
  canRestoreSpellUse,
  castSpell,
  restoreSpellUse,
  spellCastOptions,
  spellDamageAtRank,
  type SpellCastChoice,
} from "../../../shared/spellcasting";
import {
  parseSpellArea,
  spellAreaColor,
  spellDurationRounds,
  type CastAreaRequest,
} from "../../../shared/templates";
import { innateUsesRemaining } from "../../../shared/innate";
import { psiAmpFor } from "../../../shared/psiAmps";
import { ritualPrimaryCheckInfo, ritualPrimarySkillNames } from "../../../shared/ritual";
import {
  beginSustainedSpell,
  endSustainedSpell,
  spellNeedsSustain,
  sustainedSpellFor,
} from "../../../shared/sustain";
import { api, ApiError, formatCp } from "../../api";
import { useConditionOptions } from "../../conditionOptions";
import { errorMessage, useToasts } from "../../stores";
import { DailyPreparationsModal } from "../DailyPreparationsModal";
import { LongRestModal } from "../LongRestModal";

const CharacterBuilderPage = lazy(() =>
  import("../../pages/CharacterBuilderPage").then((module) => ({
    default: module.CharacterBuilderPage,
  }))
);
import { getSocket, joinCampaign } from "../../socket";
import { CompendiumPreviewModal, parseCompendiumPreviewHref } from "../CompendiumPreview";
import {
  Avatar,
  Badge,
  Button,
  Field,
  Input,
  Modal,
  RichText,
  Select,
  Spinner,
  Tag,
  Textarea,
} from "../ui";

type SheetTab =
  "weapons" | "defense" | "gear" | "spells" | "feats" | "actions" | "details" | "status";

const TABS: { id: SheetTab; label: string }[] = [
  { id: "weapons", label: "Weapons" },
  { id: "defense", label: "Defense" },
  { id: "gear", label: "Gear" },
  { id: "spells", label: "Spells" },
  { id: "feats", label: "Feats" },
  { id: "actions", label: "Actions" },
  { id: "details", label: "Details" },
  { id: "status", label: "Status" },
];

const RANK_LABELS = ["U", "T", "E", "M", "L"];

const COMPANION_KIND_LABELS: Record<string, string> = {
  animal: "Animal companion",
  familiar: "Familiar",
  eidolon: "Eidolon",
  summon: "Summon",
};

function castOptionValue(option: { rank: number; resource: string; castRank?: number }): string {
  const suffix =
    option.castRank !== undefined && option.castRank !== option.rank ? `:${option.castRank}` : "";
  return `${option.rank}:${option.resource}${suffix}`;
}

function castChoiceFromValue(value: string): SpellCastChoice | null {
  const [rankText, resource, castRankText] = value.split(":");
  if (!resource) return null;
  const castRank = Number(castRankText);
  return {
    rank: Number(rankText),
    resource: resource as SpellCastChoice["resource"],
    ...(castRankText && Number.isFinite(castRank) ? { castRank } : {}),
  };
}
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

type ItemCategoryId =
  | "all"
  | "weapon"
  | "armor"
  | "shield"
  | "consumable"
  | "ammo"
  | "equipment"
  | "rune"
  | "treasure"
  | "container"
  | "custom"
  | "other";

interface ItemSubcategory {
  id: string;
  label: string;
  values?: string[];
}

const ITEM_CATEGORY_LABELS: Record<ItemCategoryId, string> = {
  all: "All",
  weapon: "Weapons",
  armor: "Armor",
  shield: "Shields",
  consumable: "Consumables",
  ammo: "Ammunition",
  equipment: "Gear",
  rune: "Runes",
  treasure: "Treasure",
  container: "Containers",
  custom: "Custom",
  other: "Other",
};

const ITEM_CATEGORIES: {
  id: ItemCategoryId;
  type?: string;
  runeOnly?: boolean;
  subcategories?: ItemSubcategory[];
}[] = [
  { id: "all" },
  {
    id: "weapon",
    type: "weapon",
    subcategories: [
      { id: "all", label: "All weapons" },
      { id: "simple", label: "Simple", values: ["simple"] },
      { id: "martial", label: "Martial", values: ["martial"] },
      { id: "advanced", label: "Advanced", values: ["advanced"] },
      { id: "unarmed", label: "Unarmed", values: ["unarmed"] },
    ],
  },
  {
    id: "armor",
    type: "armor",
    subcategories: [
      { id: "all", label: "All armor" },
      { id: "unarmored", label: "Unarmored", values: ["unarmored"] },
      { id: "light", label: "Light", values: ["light"] },
      { id: "medium", label: "Medium", values: ["medium"] },
      { id: "heavy", label: "Heavy", values: ["heavy"] },
      { id: "barding", label: "Barding", values: ["light-barding", "heavy-barding"] },
    ],
  },
  { id: "shield", type: "shield" },
  {
    id: "consumable",
    type: "consumable",
    subcategories: [
      { id: "all", label: "All consumables" },
      { id: "potion", label: "Potions", values: ["potion"] },
      { id: "elixir", label: "Elixirs", values: ["elixir"] },
      { id: "oil", label: "Oils", values: ["oil"] },
      { id: "talisman", label: "Talismans", values: ["talisman"] },
      { id: "wand", label: "Wands", values: ["wand"] },
      { id: "scroll", label: "Scrolls", values: ["scroll"] },
      { id: "snare", label: "Snares", values: ["snare"] },
      { id: "poison", label: "Poisons", values: ["poison"] },
      { id: "mutagen", label: "Mutagens", values: ["mutagen"] },
      {
        id: "other",
        label: "Other",
        values: ["other", "catalyst", "fulu", "gadget", "drug", "toolkit"],
      },
    ],
  },
  { id: "ammo", type: "ammo" },
  { id: "equipment", type: "equipment" },
  { id: "rune", type: "equipment", runeOnly: true },
  { id: "treasure", type: "treasure" },
  { id: "container", type: "backpack,kit" },
];

const ITEM_CATEGORY_ORDER: ItemCategoryId[] = [
  "weapon",
  "armor",
  "shield",
  "consumable",
  "ammo",
  "equipment",
  "rune",
  "treasure",
  "container",
  "custom",
  "other",
];

const ITEM_LEVEL_FILTERS: {
  id: string;
  label: string;
  min?: number;
  max?: number;
}[] = [
  { id: "all", label: "Any level" },
  { id: "0", label: "Level 0", min: 0, max: 0 },
  { id: "1-3", label: "Levels 1–3", min: 1, max: 3 },
  { id: "4-6", label: "Levels 4–6", min: 4, max: 6 },
  { id: "7-10", label: "Levels 7–10", min: 7, max: 10 },
  { id: "11-15", label: "Levels 11–15", min: 11, max: 15 },
  { id: "16+", label: "Levels 16+", min: 16 },
];

function itemCategoryForType(type: string): ItemCategoryId {
  if (
    type === "weapon" ||
    type === "armor" ||
    type === "shield" ||
    type === "consumable" ||
    type === "ammo" ||
    type === "equipment" ||
    type === "treasure"
  ) {
    return type;
  }
  if (type === "backpack" || type === "kit") return "container";
  if (type === "custom") return "custom";
  return "other";
}

function itemCategoryFor(item: Equipment): ItemCategoryId {
  if (item.type === "equipment" && item.usage.startsWith("etched-onto")) return "rune";
  return itemCategoryForType(item.type);
}

function equipmentTypeLabel(item: Equipment): string {
  switch (item.type) {
    case "weapon":
      return `${titleCase(item.weapon?.category ?? "weapon")} weapon`;
    case "armor":
      return `${titleCase(item.armor?.category ?? "armor")} armor`;
    case "shield":
      return "Shield";
    case "consumable":
      return titleCase(item.consumable?.category ?? "consumable");
    case "ammo":
      return "Ammunition";
    case "treasure":
      return "Treasure";
    case "backpack":
      return "Container";
    case "kit":
      return "Kit";
    case "equipment":
      if (item.usage.startsWith("etched-onto")) return "Rune";
      return item.traits.includes("magical") ? "Magic item" : "Gear";
    case "custom":
      return "Custom item";
    default:
      return titleCase(item.type || "Item");
  }
}

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
  onCastArea,
}: {
  characterId: string;
  mode?: "page" | "overlay";
  onClose?: () => void;
  onRoll?: (
    formula: string,
    label: string,
    dc: number | null,
    gmOnly: boolean,
    requestId?: string | null,
    upgradeSuccess?: boolean
  ) => void;
  onCastArea?: (request: CastAreaRequest) => void;
}) {
  const toast = useToasts((state) => state.push);
  const navigate = useNavigate();
  const [character, setCharacter] = useState<CharacterRecord | null>(null);
  const [draft, setDraft] = useState<CharacterDraft | null>(null);
  const [context, setContext] = useState<CharacterContext | null>(null);
  const [derived, setDerived] = useState<DerivedCharacter | null>(null);
  const classData = context?.classData ?? null;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<SheetTab>("weapons");
  const [showFullPlan, setShowFullPlan] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [restOpen, setRestOpen] = useState(false);
  const [prepOpen, setPrepOpen] = useState(false);
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const [castChoices, setCastChoices] = useState<Record<string, string>>({});
  const [lastRoll, setLastRoll] = useState<LastRoll | null>(null);
  const [hpInput, setHpInput] = useState("");
  const hpInputRef = useRef<HTMLInputElement>(null);
  const [trayOpen, setTrayOpen] = useState(false);
  const [trayFormula, setTrayFormula] = useState("1d20");
  const [conditionName, setConditionName] = useState("");
  const [conditionValue, setConditionValue] = useState("");
  const [conditionDuration, setConditionDuration] = useState("");
  const conditions = useConditionOptions();
  const [actions, setActions] = useState<ActionRef[]>([]);
  const [actionQuery, setActionQuery] = useState("");
  const [actionCategory, setActionCategory] = useState("all");
  const [actionLimit, setActionLimit] = useState(120);
  const [actionsLoading, setActionsLoading] = useState(false);
  const [detailsForm, setDetailsForm] = useState({
    name: "",
    age: "",
    gender: "",
    pronouns: "",
    height: "",
    weight: "",
    appearance: "",
    personality: "",
    beliefs: "",
    notes: "",
  });
  const [detailsSaving, setDetailsSaving] = useState(false);
  const [detailsDirty, setDetailsDirty] = useState(false);
  const [conflict, setConflict] = useState<CharacterRecord | null>(null);
  const [saveError, setSaveError] = useState("");
  const hasUnsavedChanges = detailsDirty || Boolean(saveError) || Boolean(conflict);

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasUnsavedChanges]);
  const [sheetDc, setSheetDc] = useState("");
  const [sheetSecret, setSheetSecret] = useState(false);
  const [itemQuery, setItemQuery] = useState("");
  const [itemResults, setItemResults] = useState<Equipment[]>([]);
  const [itemQuantities, setItemQuantities] = useState<Record<string, string>>({});
  const [itemBusy, setItemBusy] = useState<string | null>(null);
  const [itemError, setItemError] = useState("");
  const [itemLoading, setItemLoading] = useState(false);
  const [itemCategory, setItemCategory] = useState<ItemCategoryId>("all");
  const [itemSubcategory, setItemSubcategory] = useState("all");
  const [itemLevelFilter, setItemLevelFilter] = useState("all");
  const [itemMagicOnly, setItemMagicOnly] = useState(false);
  const [itemLimit, setItemLimit] = useState(30);
  const [itemTotal, setItemTotal] = useState(0);
  const [customItemOpen, setCustomItemOpen] = useState(false);
  const [customItemView, setCustomItemView] = useState<CharacterCustomItem | null>(null);
  const [customItemName, setCustomItemName] = useState("");
  const [customItemDescription, setCustomItemDescription] = useState("");
  const [customItemQuantity, setCustomItemQuantity] = useState("1");
  const [customItemSaving, setCustomItemSaving] = useState(false);
  const [itemCast, setItemCast] = useState<{
    item: Equipment;
    rank: number;
    kind: "scroll" | "wand";
  } | null>(null);
  const [staffCast, setStaffCast] = useState<{
    item: Equipment;
    spells: { spell: Spell; rank: number }[];
  } | null>(null);
  const [staffCharge, setStaffCharge] = useState<Equipment | null>(null);
  const [staffEffect, setStaffEffect] = useState<Equipment | null>(null);
  const [ritualView, setRitualView] = useState<Spell | null>(null);
  const [learnOpen, setLearnOpen] = useState(false);
  const characterRef = useRef<CharacterRecord | null>(null);
  const loadedCharacterIdRef = useRef<string | null>(null);
  const draftRef = useRef<CharacterDraft | null>(null);
  const savingRef = useRef(false);
  const pendingDraftRef = useRef<CharacterDraft | null>(null);
  const saveWaitersRef = useRef<Array<(ok: boolean) => void>>([]);
  const conflictDraftRef = useRef<CharacterDraft | null>(null);
  const conflictWasDetailsRef = useRef(false);
  const detailsSaveInFlightRef = useRef(false);
  const forceSaveRef = useRef(false);
  const canEdit = Boolean(character?.permissions?.canEdit);

  const requestClose = useCallback(() => {
    if (!onClose) return;
    if (hasUnsavedChanges && !window.confirm("Discard unsaved character changes?")) return;
    onClose();
  }, [hasUnsavedChanges, onClose]);

  useEffect(() => {
    if (mode !== "overlay" || !onClose) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (
        target?.closest("input, textarea, select, [contenteditable='true'], .modal-backdrop") ||
        document.querySelector(".modal-backdrop")
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      requestClose();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [mode, onClose, requestClose]);

  const applyRecord = useCallback(async (record: CharacterRecord) => {
    const normalized = normalizeCharacterDraft(record.data, record.name);
    const contextResult = await api<{ context: CharacterContext }>(
      `/api/characters/${record.id}/context`,
      { method: "POST", body: { draft: normalized } }
    );
    characterRef.current = record;
    draftRef.current = normalized;
    if (loadedCharacterIdRef.current !== record.id) {
      loadedCharacterIdRef.current = record.id;
      setDetailsDirty(false);
    }
    setCharacter(record);
    setDraft(normalized);
    setContext(contextResult.context);
    setDerived(computeCharacter(normalized, contextResult.context));
    document.title = `${normalized.name} · Runehall`;
  }, []);

  const load = useCallback(
    async (options: { silent?: boolean } = {}) => {
      if (!options.silent) setLoading(true);
      setError("");
      try {
        const result = await api<{ character: CharacterRecord }>(`/api/characters/${characterId}`);
        await applyRecord(result.character);
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        if (!options.silent) setLoading(false);
      }
    },
    [applyRecord, characterId]
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const previousTitle = document.title;
    return () => {
      document.title = previousTitle;
    };
  }, []);

  useEffect(() => {
    if (derived && document.activeElement !== hpInputRef.current) {
      setHpInput(String(derived.currentHp));
    }
  }, [derived?.currentHp, derived]);

  useEffect(() => {
    if (!character || !draft || detailsDirty) return;
    setDetailsForm({
      name: draft.name,
      age: draft.details.age,
      gender: draft.details.gender,
      pronouns: draft.details.pronouns,
      height: draft.details.height,
      weight: draft.details.weight,
      appearance: draft.details.appearance,
      personality: draft.details.personality,
      beliefs: draft.details.beliefs,
      notes: draft.details.notes,
    });
  }, [character?.revision, detailsDirty, draft]);

  useEffect(() => {
    if (tab !== "actions" || actions.length) return;
    let cancelled = false;
    setActionsLoading(true);
    api<{ items: ActionRef[] }>("/api/compendium/actions")
      .then((result) => {
        if (!cancelled) setActions(result.items);
      })
      .catch(() => {
        if (!cancelled) setActions([]);
      })
      .finally(() => {
        if (!cancelled) setActionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [actions.length, tab]);

  useEffect(() => {
    const campaignId = character?.campaignId;
    if (!campaignId) return;
    const socket = getSocket();
    const leave = mode === "page" && !onRoll ? joinCampaign(campaignId) : () => undefined;
    const onCharacterUpdated = (payload: { characterId: string }) => {
      if (
        payload.characterId === characterId &&
        !savingRef.current &&
        !pendingDraftRef.current &&
        !conflict
      ) {
        void load({ silent: true });
      }
    };
    socket.on("character:updated", onCharacterUpdated);
    return () => {
      socket.off("character:updated", onCharacterUpdated);
      leave();
    };
  }, [character?.campaignId, characterId, conflict, load, mode, onRoll]);

  useEffect(() => {
    if (tab !== "gear") return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setItemLoading(true);
      setItemError("");
      try {
        const params = new URLSearchParams();
        params.set("q", itemQuery);
        params.set("limit", String(itemLimit));
        const category = ITEM_CATEGORIES.find((entry) => entry.id === itemCategory);
        if (category?.type) params.set("type", category.type);
        if (category?.runeOnly) params.set("runeOnly", "1");
        const subcategory = category?.subcategories?.find((entry) => entry.id === itemSubcategory);
        if (subcategory?.values?.length) {
          params.set("subcategory", subcategory.values.join(","));
        }
        const level = ITEM_LEVEL_FILTERS.find((entry) => entry.id === itemLevelFilter);
        if (level?.min !== undefined) params.set("levelMin", String(level.min));
        if (level?.max !== undefined) params.set("levelMax", String(level.max));
        if (itemMagicOnly) params.set("trait", "magical");
        const result = await api<{ items: Equipment[]; total?: number }>(
          `/api/compendium/equipment?${params.toString()}`
        );
        if (!cancelled) {
          setItemResults(result.items);
          setItemTotal(result.total ?? result.items.length);
        }
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
  }, [itemCategory, itemLevelFilter, itemLimit, itemMagicOnly, itemQuery, itemSubcategory, tab]);

  const inventoryGroups = useMemo(() => {
    if (!draft || !context) return [];
    const groups = new Map<ItemCategoryId, typeof draft.equipment>();
    for (const entry of draft.equipment) {
      const item = context.equipment[entry.itemId] ?? null;
      const category = item ? itemCategoryFor(item) : "other";
      const entries = groups.get(category) ?? [];
      entries.push(entry);
      groups.set(category, entries);
    }
    return [...groups.entries()]
      .sort(
        (left, right) =>
          ITEM_CATEGORY_ORDER.indexOf(left[0]) - ITEM_CATEGORY_ORDER.indexOf(right[0])
      )
      .map(([id, entries]) => ({
        id,
        label: ITEM_CATEGORY_LABELS[id],
        entries: [...entries].sort((left, right) =>
          (context.equipment[left.itemId]?.name ?? left.itemId).localeCompare(
            context.equipment[right.itemId]?.name ?? right.itemId
          )
        ),
      }));
  }, [context, draft]);

  const customItemsById = useMemo(
    () => new Map((draft?.customItems ?? []).map((item) => [item.id, item])),
    [draft?.customItems]
  );

  const spellsByName = useMemo(
    () =>
      new Map(
        Object.values(context?.spells ?? {}).map((spell) => [spell.name.toLowerCase(), spell])
      ),
    [context?.spells]
  );

  const parsedDc = Number(sheetDc);
  const targetDc = sheetDc.trim() !== "" && Number.isFinite(parsedDc) ? Math.round(parsedDc) : null;
  const postRoll = useCallback(
    (
      formula: string,
      label: string,
      dc: number | null = targetDc,
      gmOnly = sheetSecret,
      upgradeSuccess = false
    ) => {
      if (onRoll) {
        onRoll(formula, label, dc, gmOnly, null, upgradeSuccess);
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
          upgradeSuccess,
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
    [character?.campaignId, onRoll, sheetSecret, targetDc, toast]
  );

  const persist = async (
    next: CharacterDraft | ((current: CharacterDraft) => CharacterDraft)
  ): Promise<boolean> => {
    if (!canEdit) {
      toast("This sheet is read-only.", "error");
      return false;
    }
    const base = draftRef.current;
    if (!base || !context) return false;
    const target = typeof next === "function" ? next(base) : next;
    const normalized = normalizeCharacterDraft(target, target.name);
    draftRef.current = normalized;
    setDraft(normalized);
    setDerived(computeCharacter(normalized, context));
    pendingDraftRef.current = normalized;
    if (savingRef.current) {
      return new Promise<boolean>((resolve) => saveWaitersRef.current.push(resolve));
    }
    savingRef.current = true;
    setSaving(true);
    let succeeded = true;
    try {
      while (pendingDraftRef.current) {
        const draftToSave = pendingDraftRef.current;
        pendingDraftRef.current = null;
        const current: CharacterRecord | null = characterRef.current;
        if (!current) break;
        const force = forceSaveRef.current;
        forceSaveRef.current = false;
        const result: { character: CharacterRecord } = await api<{ character: CharacterRecord }>(
          `/api/characters/${current.id}`,
          {
            method: "PUT",
            body: force
              ? { data: draftToSave, force: true }
              : { data: draftToSave, expectedRevision: current.revision },
          }
        );
        characterRef.current = result.character;
        setCharacter(result.character);
        if (!pendingDraftRef.current) {
          const saved = normalizeCharacterDraft(result.character.data, result.character.name);
          draftRef.current = saved;
          setDraft(saved);
          setDerived(computeCharacter(saved, context));
        }
      }
      setSaveError("");
      toast("Saved.", "success");
    } catch (err) {
      succeeded = false;
      const payload =
        err instanceof ApiError && err.status === 409
          ? (err.payload as { character?: CharacterRecord } | null)
          : null;
      if (payload?.character) {
        conflictDraftRef.current = draftRef.current;
        conflictWasDetailsRef.current = detailsSaveInFlightRef.current;
        pendingDraftRef.current = null;
        setSaveError("");
        setConflict(payload.character);
        toast("This sheet changed elsewhere. Choose which version to keep.", "info");
      } else {
        pendingDraftRef.current = draftRef.current;
        setSaveError(errorMessage(err));
        toast(errorMessage(err), "error");
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
      const waiters = saveWaitersRef.current.splice(0);
      for (const resolve of waiters) resolve(succeeded);
    }
    return succeeded;
  };

  const applyServerVersion = async () => {
    if (!conflict) return;
    const server = conflict;
    conflictDraftRef.current = null;
    conflictWasDetailsRef.current = false;
    pendingDraftRef.current = null;
    forceSaveRef.current = false;
    setConflict(null);
    setSaveError("");
    setDetailsDirty(false);
    try {
      await applyRecord(server);
    } catch (err) {
      setSaveError(errorMessage(err));
      toast(errorMessage(err), "error");
    }
  };

  const keepLocalVersion = async () => {
    const localDraft = conflictDraftRef.current ?? draftRef.current;
    const detailsConflict = conflictWasDetailsRef.current;
    conflictDraftRef.current = null;
    conflictWasDetailsRef.current = false;
    pendingDraftRef.current = null;
    setConflict(null);
    setSaveError("");
    if (!localDraft) return;
    forceSaveRef.current = true;
    const saved = await persist(localDraft);
    if (saved && detailsConflict) setDetailsDirty(false);
  };

  const retrySave = () => {
    const current = draftRef.current;
    if (!current) return;
    void persist(current);
  };

  const changeHp = (value: number) => {
    if (!canEdit || !derived) return;
    void persist((currentDraft) => {
      const hp = Math.max(0, Math.min(derived.maxHp, Math.round(value)));
      return applyHpEditToDraft(currentDraft, derived.maxHp, { type: "set", hp }).draft;
    });
  };

  const updateDetails = (key: keyof typeof detailsForm, value: string) => {
    setDetailsDirty(true);
    setDetailsForm((current) => ({ ...current, [key]: value }));
  };

  const saveDetails = async () => {
    if (!canEdit || !draft) return;
    setDetailsSaving(true);
    detailsSaveInFlightRef.current = true;
    try {
      const saved = await persist((currentDraft) => ({
        ...currentDraft,
        name: detailsForm.name.trim() || currentDraft.name,
        details: {
          ...currentDraft.details,
          age: detailsForm.age,
          gender: detailsForm.gender,
          pronouns: detailsForm.pronouns,
          height: detailsForm.height,
          weight: detailsForm.weight,
          appearance: detailsForm.appearance,
          personality: detailsForm.personality,
          beliefs: detailsForm.beliefs,
          notes: detailsForm.notes,
        },
      }));
      if (saved) setDetailsDirty(false);
    } finally {
      detailsSaveInFlightRef.current = false;
      setDetailsSaving(false);
    }
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
    void persist((currentDraft) => ({
      ...currentDraft,
      play: {
        ...currentDraft.play,
        conditions: [
          ...currentDraft.play.conditions.filter(
            (condition) => condition.name.toLowerCase() !== name.toLowerCase()
          ),
          entry,
        ],
      },
    }));
    setConditionName("");
    setConditionValue("");
    setConditionDuration("");
  };

  const removeCondition = (index: number) => {
    if (!draft) return;
    void persist((currentDraft) => ({
      ...currentDraft,
      play: {
        ...currentDraft.play,
        conditions: currentDraft.play.conditions.filter((_condition, at) => at !== index),
      },
    }));
  };

  const buyItem = async (item: Equipment, mode: "buy" | "grant") => {
    if (!canEdit || !character || itemBusy) return;
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
    if (!canEdit || !draft) return;
    const entry = draft.equipment.find((candidate) => candidate.itemId === itemId);
    if (field === "invested" && entry && !entry.invested && derived) {
      const invested = draft.equipment.filter((candidate) => candidate.invested).length;
      if (invested >= derived.investedLimit) {
        setItemError(
          `You can invest at most ${derived.investedLimit} items. Uninvest another item first.`
        );
        return;
      }
    }
    void persist((currentDraft) => ({
      ...currentDraft,
      equipment: currentDraft.equipment.map((entry) =>
        entry.itemId === itemId ? { ...entry, [field]: !entry[field] } : entry
      ),
    }));
  };

  const addCustomItem = async () => {
    if (!canEdit || customItemSaving) return;
    const name = customItemName.trim();
    if (!name) return;
    const quantity = Math.max(1, Math.min(999, Math.round(Number(customItemQuantity) || 1)));
    const random =
      globalThis.crypto?.randomUUID?.() ??
      `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    const id = `custom:${random}`;
    setCustomItemSaving(true);
    try {
      const saved = await persist((currentDraft) => ({
        ...currentDraft,
        customItems: [
          ...currentDraft.customItems,
          {
            id,
            name: name.slice(0, 120),
            description: customItemDescription.trim().slice(0, 4000),
          },
        ],
        equipment: [
          ...currentDraft.equipment,
          { itemId: id, quantity, equipped: false, invested: false, runes: [] },
        ],
      }));
      if (!saved) return;
      setCustomItemOpen(false);
      setCustomItemName("");
      setCustomItemDescription("");
      setCustomItemQuantity("1");
      toast("Custom item added to inventory.", "success");
      if (characterRef.current) await applyRecord(characterRef.current);
    } finally {
      setCustomItemSaving(false);
    }
  };

  const removeCustomItem = async (itemId: string) => {
    if (!canEdit) return;
    const saved = await persist((currentDraft) => ({
      ...currentDraft,
      customItems: currentDraft.customItems.filter((item) => item.id !== itemId),
      equipment: currentDraft.equipment.filter((entry) => entry.itemId !== itemId),
    }));
    if (!saved) return;
    setCustomItemView(null);
    toast("Custom item removed.", "success");
    if (characterRef.current) await applyRecord(characterRef.current);
  };

  const openAreaPlacement = (spell: Spell, rank: number): void => {
    const scaled = spellDamageAtRank(spell, rank);
    const area = parseSpellArea(spell.area, scaled.areaDelta ?? 0);
    if (!area) return;
    const current = characterRef.current;
    const damage = scaled.parts.map((part) => `${part.formula} ${part.type}`).join(" + ");
    const save = spell.defense?.save
      ? `${spell.defense.save.slice(0, 1).toUpperCase()}${spell.defense.save.slice(1).toLowerCase()}`
      : "";
    const effect = [
      save ? `${save}${derived?.spellDc ? ` DC ${derived.spellDc}` : ""}` : "",
      damage ? `${damage} damage` : "",
      spell.duration ? `Duration ${spell.duration}` : "",
    ]
      .filter(Boolean)
      .join(" · ");
    if (onCastArea && current) {
      onCastArea({
        characterId: current.id,
        characterName: current.name,
        label: spell.name,
        kind: area.kind,
        size: area.size,
        color: spellAreaColor(spell),
        spellId: spell.id,
        durationRounds: spellDurationRounds(spell.duration),
        effect,
      });
    } else {
      toast(`Open the table to place ${spell.name}'s ${area.size}-ft. ${area.kind}.`, "info");
    }
  };

  const castWandSpell = async (
    item: Equipment,
    rank: number,
    spell: Spell,
    options: { flexible?: boolean } = {}
  ) => {
    if (!canEdit) return;
    const entry = draftRef.current?.equipment.find((candidate) => candidate.itemId === item.id);
    if (!entry) {
      toast("That wand is no longer in the inventory.", "error");
      return;
    }
    const max = Math.max(1, Math.round(entry.usesMax ?? 1));
    const used = Math.max(0, Math.round(entry.usesUsed ?? 0));
    if (used >= max) {
      toast(`${item.name} has no uses left today.`, "error");
      return;
    }
    const saved = await persist((currentDraft) => ({
      ...currentDraft,
      equipment: currentDraft.equipment.map((candidate) => {
        if (candidate.itemId !== item.id) return candidate;
        const candidateMax = Math.max(1, Math.round(candidate.usesMax ?? max));
        const candidateUsed = Math.max(0, Math.round(candidate.usesUsed ?? 0));
        return {
          ...candidate,
          usesUsed: Math.min(candidateMax, candidateUsed + 1),
          usesMax: candidateMax,
        };
      }),
    }));
    if (!saved) return;
    toast(
      options.flexible
        ? `Cast ${spell.name} from ${item.name} at rank ${rank}. Apply the wand's effect.`
        : `Cast ${spell.name} from a magic wand at rank ${rank}.`,
      "success"
    );
    const current = characterRef.current;
    if (current?.campaignId) {
      getSocket().emit("chat:send", {
        campaignId: current.campaignId,
        content: options.flexible
          ? `${current.name} casts ${spell.name} at rank ${rank} from ${item.name}; apply the wand's effect.`
          : `${current.name} casts ${spell.name} at rank ${rank} from a magic wand.`,
        visibility: "all",
      });
    }
    openAreaPlacement(spell, rank);
  };

  const castItemSpell = async (spell: Spell) => {
    if (!canEdit || !itemCast) return;
    const { item, rank, kind } = itemCast;
    setItemCast(null);
    if (kind === "wand") {
      await castWandSpell(item, rank, spell, { flexible: flexibleWandRank(item) != null });
      return;
    }
    const saved = await persist((currentDraft) => ({
      ...currentDraft,
      equipment: currentDraft.equipment.flatMap((entry) => {
        if (entry.itemId !== item.id) return [entry];
        if (entry.quantity <= 1) return [];
        return [{ ...entry, quantity: entry.quantity - 1 }];
      }),
    }));
    if (!saved) return;
    toast(`Cast ${spell.name} from a scroll at rank ${rank}.`, "success");
    const current = characterRef.current;
    if (current?.campaignId) {
      getSocket().emit("chat:send", {
        campaignId: current.campaignId,
        content: `${current.name} casts ${spell.name} at rank ${rank} from a scroll.`,
        visibility: "all",
      });
    }
    openAreaPlacement(spell, rank);
  };

  const castStaffSpell = async (item: Equipment, spell: Spell, rank: number) => {
    if (!canEdit) return;
    const entry = draftRef.current?.equipment.find((candidate) => candidate.itemId === item.id);
    if (!entry) {
      toast("That staff is no longer in the inventory.", "error");
      return;
    }
    const max = Math.max(0, Math.round(entry.usesMax ?? 0));
    const used = Math.max(0, Math.round(entry.usesUsed ?? 0));
    const remaining = Math.max(0, max - used);
    if (rank > remaining) {
      toast(
        `${item.name} needs ${rank} charge${rank === 1 ? "" : "s"} but has ${remaining}. Charge it during daily preparations.`,
        "error"
      );
      return;
    }
    const saved = await persist((currentDraft) => ({
      ...currentDraft,
      equipment: currentDraft.equipment.map((candidate) => {
        if (candidate.itemId !== item.id) return candidate;
        const candidateMax = Math.max(0, Math.round(candidate.usesMax ?? max));
        const candidateUsed = Math.max(0, Math.round(candidate.usesUsed ?? used));
        return {
          ...candidate,
          usesKind: "charges",
          usesMax: candidateMax,
          usesUsed: Math.min(candidateMax, candidateUsed + rank),
        };
      }),
    }));
    if (!saved) return;
    setStaffCast(null);
    const after = Math.max(0, remaining - rank);
    toast(
      rank
        ? `Cast ${spell.name} from ${item.name} using ${rank} charge${rank === 1 ? "" : "s"} (${after} left).`
        : `Cast ${spell.name} from ${item.name}.`,
      "success"
    );
    const current = characterRef.current;
    if (current?.campaignId) {
      getSocket().emit("chat:send", {
        campaignId: current.campaignId,
        content: rank
          ? `${current.name} casts ${spell.name} from ${item.name} using ${rank} charge${rank === 1 ? "" : "s"}.`
          : `${current.name} casts ${spell.name} from ${item.name}.`,
        visibility: "all",
      });
    }
    openAreaPlacement(spell, rank);
  };

  const chargeStaff = async (item: Equipment, rank: number) => {
    if (!canEdit) return;
    const max = Math.max(0, Math.min(5, Math.round(rank)));
    const saved = await persist((currentDraft) => ({
      ...currentDraft,
      equipment: currentDraft.equipment.map((candidate) =>
        candidate.itemId === item.id
          ? { ...candidate, usesKind: "charges", usesMax: max, usesUsed: 0 }
          : candidate
      ),
    }));
    if (!saved) return;
    setStaffCharge(null);
    toast(
      max
        ? `Charged ${item.name} with ${max} charge${max === 1 ? "" : "s"}. Mark the spent spell slot manually.`
        : `Cleared ${item.name} charges.`,
      "success"
    );
  };

  const staffSlotRemaining = (rank: number): number => {
    const total = Math.max(0, Math.round(derived?.spellSlots?.[rank - 1] ?? 0));
    const font =
      rank === derived?.divineFontRank ? Math.max(0, Math.round(derived?.divineFontSlots ?? 0)) : 0;
    const used = Math.max(0, Math.round(Number(draft?.spells.slotsUsed[String(rank)] ?? 0)));
    return Math.max(0, total - font - used);
  };

  const castStaffSpellWithSlot = async (item: Equipment, spell: Spell, rank: number) => {
    if (!canEdit || rank < 1) return;
    if (staffSlotRemaining(rank) <= 0) {
      toast(`No rank ${rank} spell slot remains.`, "error");
      return;
    }
    const used = Math.max(
      0,
      Math.round(Number(draftRef.current?.spells.slotsUsed[String(rank)] ?? 0))
    );
    const saved = await persist((currentDraft) => ({
      ...currentDraft,
      spells: {
        ...currentDraft.spells,
        slotsUsed: {
          ...currentDraft.spells.slotsUsed,
          [String(rank)]: used + 1,
        },
      },
    }));
    if (!saved) return;
    setStaffCast(null);
    toast(`Cast ${spell.name} from ${item.name} using a rank ${rank} spell slot.`, "success");
    const current = characterRef.current;
    if (current?.campaignId) {
      getSocket().emit("chat:send", {
        campaignId: current.campaignId,
        content: `${current.name} casts ${spell.name} from ${item.name} using a rank ${rank} spell slot.`,
        visibility: "all",
      });
    }
    openAreaPlacement(spell, rank);
  };

  const staffPool = (item: Equipment): { max: number; remaining: number } => {
    const entry = draft?.equipment.find((candidate) => candidate.itemId === item.id);
    const max = Math.max(0, Math.round(entry?.usesMax ?? 0));
    const used = Math.max(0, Math.round(entry?.usesUsed ?? 0));
    return { max, remaining: Math.max(0, max - used) };
  };

  const spellEntries = useMemo(() => {
    if (!draft || !context) return [];
    const preparedCaster = isPreparedCasterClass(context.classData?.name);
    const grantedGroups = (derived?.grantedSpells ?? []).map((spell) => ({
      label:
        spell.kind === "focus" ? "Focus" : spell.kind === "curriculum" ? "Curriculum" : "Granted",
      ids: [spell.id],
    }));
    const groups: { label: string; ids: string[] }[] = [
      {
        label: preparedCaster ? "Prepared cantrips" : "Cantrips",
        ids: preparedCantripIds(draft, context),
      },
      { label: "Prepared", ids: draft.spells.prepared },
      {
        label: "Apparition",
        ids: (derived?.animistApparitions?.repertoire ?? []).map((entry) => entry.spell.id),
      },
      { label: "Spells", ids: sourceSpellIds(draft, classData) },
      {
        label: "Multiclass",
        ids: [...draft.spells.multiclassCantrips, ...draft.spells.multiclassSpells],
      },
      { label: "Focus", ids: draft.spells.focus },
      { label: "Innate", ids: draft.spells.innate },
      { label: "Rituals", ids: draft.spells.rituals },
      ...grantedGroups,
    ];
    const seen = new Set<string>();
    return groups.flatMap((group) =>
      [...new Set(group.ids)]
        .filter((id) => {
          // Prepared casters list known spells in their book and again in
          // today's preparations; show the prepared copy once. Innate copies
          // spend a different resource, so they stay visible alongside a
          // cantrip or prepared copy of the same spell.
          if (group.label === "Innate") return true;
          if (seen.has(id)) return false;
          seen.add(id);
          return true;
        })
        .map((id) => ({
          group: group.label,
          spell: context.spells[id] ?? null,
          id,
        }))
    );
  }, [context, derived?.animistApparitions?.repertoire, derived?.grantedSpells, draft, classData]);

  const featName = useCallback(
    (id: string | null | undefined) => (id ? (context?.feats[id]?.name ?? id) : ""),
    [context]
  );

  const levelPlan = useMemo(() => {
    if (!draft || !context || !derived) return [];
    const maxLevel = showFullPlan ? 20 : Math.max(1, draft.level);
    return Array.from({ length: maxLevel }, (_entry, index) => {
      const level = index + 1;
      const key = String(level);
      const items: { key: string; label: string; detail: string; href?: string }[] = [];
      const addFeat = (
        featId: string | undefined,
        detail: string,
        href: (id: string) => string
      ) => {
        if (!featId) return;
        items.push({
          key: `${level}-${detail}-${featId}`,
          label: featName(featId),
          detail,
          href: href(featId),
        });
      };
      addFeat(draft.feats.ancestry[key], "Ancestry feat", (id) => `/library/feat/${id}`);
      addFeat(draft.feats.class[key], "Class feat", (id) => `/library/feat/${id}`);
      addFeat(draft.feats.skill[key], "Skill feat", (id) => `/library/feat/${id}`);
      addFeat(draft.feats.general[key], "General feat", (id) => `/library/feat/${id}`);
      addFeat(draft.feats.freeArchetype[key], "Free archetype feat", (id) => `/library/feat/${id}`);
      const increase = draft.skills.increases[key];
      if (increase) {
        items.push({
          key: `${level}-skill-increase`,
          label: titleCase(increase),
          detail: "Skill increase",
        });
      }
      const boosts = (draft.boosts.levels[key] ?? []).filter((ability): ability is AbilityKey =>
        Boolean(ability)
      );
      if (boosts.length) {
        items.push({
          key: `${level}-boosts`,
          label: boosts.map((ability) => ABILITY_LABELS[ability]).join(", "),
          detail: "Ability boosts",
        });
      }
      for (const feature of derived.features.filter((entry) => entry.level === level)) {
        items.push({
          key: `${level}-feature-${feature.id}`,
          label: feature.name,
          detail: "Class feature",
        });
      }
      return { level, items };
    });
  }, [context, derived, draft, featName, showFullPlan]);

  const visibleActions = useMemo(() => {
    const query = actionQuery.trim().toLowerCase();
    return actions.filter((action) => {
      if (actionCategory !== "all" && action.category !== actionCategory) return false;
      if (!query) return true;
      return `${action.name} ${action.category} ${action.traits.join(" ")} ${action.description}`
        .toLowerCase()
        .includes(query);
    });
  }, [actionCategory, actionQuery, actions]);

  useEffect(() => {
    setActionLimit(120);
  }, [actionCategory, actionQuery]);

  const actionCategories = useMemo(
    () => [...new Set(actions.map((action) => action.category).filter(Boolean))].sort(),
    [actions]
  );

  const canGrant =
    Boolean(character?.permissions?.canAdvance) || Boolean(character?.campaignPlayerItemGrant);

  const optionsForSpell = useCallback(
    (spell: Spell, group: string) =>
      spellCastOptions(spell, draft as CharacterDraft, context as CharacterContext, {
        focus: group === "Focus",
        focusPointsMax: derived?.focusPointsMax ?? 0,
        innate: group === "Innate",
        innateRemaining:
          group === "Innate" && draft ? innateUsesRemaining(draft, spell) : undefined,
        multiclass: group === "Multiclass",
        multiclassSlots: derived?.multiclassCaster?.spellSlots ?? [],
        multiclassSlotsUsed: draft?.spells.multiclassSlotsUsed,
      }),
    [context, derived?.focusPointsMax, derived?.multiclassCaster, draft]
  );

  const cast = async (spell: Spell, group: string) => {
    if (!canEdit || !context) return;
    const currentDraft = draftRef.current;
    if (!currentDraft) return;
    const options = optionsForSpell(spell, group);
    const key = `${group}:${spell.id}`;
    const selected = castChoices[key] ?? (options[0] ? castOptionValue(options[0]) : "");
    const choice = castChoiceFromValue(selected);
    if (!choice) {
      toast("No spell resource is available for that spell.", "error");
      return;
    }
    const result = castSpell(currentDraft, spell, context, choice, {
      focus: group === "Focus",
      focusPointsMax: derived?.focusPointsMax ?? 0,
      innate: group === "Innate",
      innateRemaining: group === "Innate" ? innateUsesRemaining(currentDraft, spell) : undefined,
      multiclass: group === "Multiclass",
      multiclassSlots: derived?.multiclassCaster?.spellSlots ?? [],
      multiclassSlotsUsed: currentDraft.spells.multiclassSlotsUsed,
    });
    if (!result) {
      toast("That spell has no uses left at the selected rank.", "error");
      return;
    }
    const sustains = spellNeedsSustain(spell);
    const effectiveRank = result.option.castRank ?? result.option.rank;
    const downcast = effectiveRank !== result.option.rank;
    let nextDraft: CharacterDraft = result.draft;
    if (sustains) {
      nextDraft = beginSustainedSpell(nextDraft, spell, effectiveRank).draft;
    }
    const saved = await persist(nextDraft);
    if (!saved) return;
    const amped = result.option.resource === "amp";
    toast(
      `Cast ${spell.name} at rank ${effectiveRank}${downcast ? ` using a rank ${result.option.rank} slot` : ""}${amped ? " · amped" : ""}${sustains ? " · sustained" : ""}.`,
      "success"
    );
    if (character?.campaignId) {
      getSocket().emit("chat:send", {
        campaignId: character.campaignId,
        content: `${currentDraft.name} casts ${spell.name} at rank ${effectiveRank}${downcast ? ` using a rank ${result.option.rank} slot` : ""}${amped ? " (amped)" : ""} (${result.option.label}).`,
        visibility: "all",
      });
    }
    openAreaPlacement(spell, effectiveRank);
  };

  const selectedChoiceFor = (
    spell: Spell,
    group: string,
    options: ReturnType<typeof optionsForSpell>
  ): SpellCastChoice | null => {
    const key = `${group}:${spell.id}`;
    const selected = castChoices[key] ?? (options[0] ? castOptionValue(options[0]) : "");
    return castChoiceFromValue(selected);
  };

  const restore = async (spell: Spell, group: string) => {
    if (!canEdit || !context) return;
    const currentDraft = draftRef.current;
    if (!currentDraft) return;
    const options = optionsForSpell(spell, group);
    const choice = selectedChoiceFor(spell, group, options);
    if (!choice) return;
    const result = restoreSpellUse(currentDraft, spell, context, choice, {
      focusPointsMax: derived?.focusPointsMax ?? 0,
    });
    if (!result) {
      toast("There is no spent use to restore for that spell.", "info");
      return;
    }
    const restored = spellNeedsSustain(spell) ? endSustainedSpell(result, spell.id) : result;
    const saved = await persist(restored);
    if (!saved) return;
    toast(`Restored ${spell.name} at rank ${choice.rank}.`, "success");
  };

  const toggleSustain = async (spell: Spell, group: string) => {
    if (!canEdit) return;
    const currentDraft = draftRef.current;
    if (!currentDraft) return;
    if (!spellNeedsSustain(spell)) {
      toast("That spell does not use the Sustain action.", "info");
      return;
    }
    const existing = sustainedSpellFor(currentDraft, spell.id);
    if (existing) {
      const saved = await persist(endSustainedSpell(currentDraft, spell.id));
      if (saved) toast(`Ended ${spell.name}.`, "info");
      return;
    }
    const options = optionsForSpell(spell, group);
    const choice = selectedChoiceFor(spell, group, options);
    const result = beginSustainedSpell(
      currentDraft,
      spell,
      choice?.rank ?? Math.max(1, spell.rank)
    );
    if (!result.added && result.reason !== "already-active") {
      toast("This spell cannot be sustained from the sheet.", "info");
      return;
    }
    const saved = await persist(result.draft);
    if (saved) toast(`Sustaining ${spell.name}.`, "success");
  };

  const stopSustain = async (spellId: string) => {
    if (!canEdit) return;
    const currentDraft = draftRef.current;
    if (!currentDraft) return;
    const saved = await persist(endSustainedSpell(currentDraft, spellId));
    if (saved) toast("Sustain ended.", "info");
  };

  const rollRitual = (spell: Spell) => {
    const override = draftRef.current?.spells.ritualSkills?.[spell.id];
    const candidates = override
      ? [override]
      : ritualPrimarySkillNames(spell.description, spell.ritualData);
    if (!candidates.length) {
      toast("This ritual has no readable primary check; resolve it manually.", "info");
      return;
    }
    const hasSkill = (primary: string) =>
      (derived?.skills ?? []).some(
        (entry) => entry.id.toLowerCase() === primary || entry.name.toLowerCase() === primary
      ) || (derived?.lore ?? []).some((entry) => entry.name.toLowerCase() === primary);
    const primary = candidates.find(hasSkill) ?? candidates[0];
    const skill = (derived?.skills ?? []).find(
      (entry) => entry.id.toLowerCase() === primary || entry.name.toLowerCase() === primary
    );
    const lore = (derived?.lore ?? []).find((entry) => entry.name.toLowerCase() === primary);
    const mod = skill?.mod ?? lore?.mod;
    if (mod === undefined) {
      toast(`This character has no ${titleCase(primary)} skill for the ritual check.`, "error");
      return;
    }
    postRoll(`1d20${signed(mod)}`, `${spell.name} primary check (${titleCase(primary)})`);
  };

  const setRitualSkill = async (spellId: string, skill: string) => {
    if (!canEdit) return;
    await persist((currentDraft) => {
      const ritualSkills = { ...(currentDraft.spells.ritualSkills ?? {}) };
      if (skill) ritualSkills[spellId] = skill;
      else delete ritualSkills[spellId];
      return {
        ...currentDraft,
        spells: { ...currentDraft.spells, ritualSkills },
      };
    });
  };

  const learnSpell = async (spell: Spell) => {
    if (!canEdit) return;
    setLearnOpen(false);
    const current = draftRef.current;
    if (!current) return;
    const cost = learnSpellCostCp(spell);
    const currency = spendCurrency(current.currency, cost);
    if (!currency) {
      toast(
        `Learning ${spell.name} costs ${formatCp(cost)}; the character does not have enough.`,
        "error"
      );
      return;
    }
    const saved = await persist((currentDraft) => {
      const source = sourceSpellIds(currentDraft, classData);
      const alreadyKnown = source.includes(spell.id);
      const next = alreadyKnown
        ? currentDraft
        : withSourceSpellIds(currentDraft, classData, [...source, spell.id]);
      return {
        ...next,
        currency,
        spells: {
          ...next.spells,
          learned: alreadyKnown ? next.spells.learned : [...(next.spells.learned ?? []), spell.id],
        },
      };
    });
    if (!saved) return;
    setContext((current) =>
      current ? { ...current, spells: { ...current.spells, [spell.id]: spell } } : current
    );
    toast(
      `Learned ${spell.name} for ${formatCp(cost)}. Attempt the DC ${learnSpellDc(spell.rank)} check with your GM; remove it if the check fails.`,
      "success"
    );
  };

  const takeLongRest = async (result: LongRestResult) => {
    const saved = await persist(result.draft);
    if (!saved) return;
    setRestOpen(false);
    toast(
      result.summary.healed > 0
        ? `Long rest complete: +${result.summary.healed} HP, spell slots and focus reset.`
        : "Long rest complete: spell slots and focus reset.",
      "success"
    );
    if (preparedCaster) setPrepOpen(true);
  };

  const applyPreparations = async (next: CharacterDraft) => {
    const saved = await persist(next);
    if (!saved) return;
    setPrepOpen(false);
    toast("Daily preparations complete.", "success");
  };

  const weaponNameHref = (attackId: string | null, name: string) =>
    attackId
      ? `/library/equipment/${attackId}`
      : `/rules?tab=actions&q=${encodeURIComponent(name)}`;

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

  const preparedCaster = isPreparedCasterClass(classData?.name);
  const canLearnSpells = ["spellbook", "familiar", "dirge"].includes(spellSourceLabel(classData));
  const preparationsPending = preparedCaster && draft.spells.preparationsPending;
  const spellProfileFor = (group: string): { attack: number | null; dc: number | null } => {
    if (group === "Focus") {
      return {
        attack: derived.focusSpellAttack ?? derived.spellAttack,
        dc: derived.focusSpellDc ?? derived.spellDc,
      };
    }
    if (group === "Innate") {
      return { attack: derived.innateSpellAttack, dc: derived.innateSpellDc };
    }
    if (group === "Multiclass") {
      return {
        attack: derived.multiclassCaster?.spellAttack ?? derived.spellAttack,
        dc: derived.multiclassCaster?.spellDc ?? derived.spellDc,
      };
    }
    return { attack: derived.spellAttack, dc: derived.spellDc };
  };
  const hpPercent = derived.maxHp > 0 ? (derived.currentHp / derived.maxHp) * 100 : 0;
  const selectedFeatIds = new Set(derived.selectedFeats.map((feat) => feat.id));
  const activeItemCategory =
    ITEM_CATEGORIES.find((entry) => entry.id === itemCategory) ?? ITEM_CATEGORIES[0];
  const itemSubcategories = activeItemCategory.subcategories ?? [];
  const itemFiltersActive =
    itemQuery.trim() !== "" ||
    itemCategory !== "all" ||
    itemSubcategory !== "all" ||
    itemLevelFilter !== "all" ||
    itemMagicOnly;

  return (
    <div
      className={mode === "overlay" ? "pb-sheet-overlay" : "pb-sheet-page"}
      role={mode === "overlay" ? "dialog" : undefined}
      aria-modal={mode === "overlay" ? true : undefined}
      aria-label={mode === "overlay" ? "Character sheet" : undefined}
      onClickCapture={(event) => {
        const anchor = (event.target as HTMLElement | null)?.closest("a");
        if (!anchor) return;
        const preview = parseCompendiumPreviewHref(anchor.getAttribute("href"));
        const modified =
          event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;
        if (preview) {
          if (modified || anchor.target === "_blank") return;
          event.preventDefault();
          setPreviewPath(preview.path);
          return;
        }
        if (mode !== "overlay" || anchor.target === "_blank") return;
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
              onClick={requestClose}
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
          <span
            className={`pb-save ${saving ? "is-saving" : saveError ? "is-error" : ""}`}
            title={saveError || undefined}
          >
            {saving ? "Saving…" : saveError ? "Not saved" : "Saved"}
          </span>
          {saveError ? (
            <button type="button" className="pb-button" onClick={retrySave}>
              Retry
            </button>
          ) : null}
        </div>
        <div className="pb-topbar-right">
          <div className="pb-dc-control">
            <label>
              <span>DC</span>
              <input
                type="number"
                value={sheetDc}
                placeholder="—"
                aria-label="Target DC for sheet rolls"
                onChange={(event) => setSheetDc(event.target.value)}
              />
            </label>
            <button
              type="button"
              className={sheetSecret ? "pb-button is-on" : "pb-button"}
              aria-pressed={sheetSecret}
              title="Send these rolls to the GM only"
              onClick={() => setSheetSecret((current) => !current)}
            >
              Secret
            </button>
          </div>
          <button type="button" className="pb-button" onClick={() => window.print()}>
            <Printer size={14} /> Print
          </button>
          {canEdit ? (
            <button type="button" className="pb-button" onClick={() => setRestOpen(true)}>
              <Moon size={14} /> Long rest
            </button>
          ) : null}
          {canEdit ? (
            <button
              type="button"
              className="pb-button is-primary"
              onClick={() => setBuilderOpen(true)}
            >
              <Pencil size={14} /> Edit build
            </button>
          ) : null}
          {mode === "overlay" && onClose ? (
            <button
              type="button"
              className="pb-icon-button"
              aria-label="Close sheet"
              onClick={requestClose}
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
            <span>Character plan</span>
            <Link to={`/characters/${character.id}/edit`}>Open planner</Link>
          </div>
          <div className="pb-plan">
            {levelPlan.map((entry) => (
              <div className="pb-plan-level" key={entry.level}>
                <div className="pb-plan-level-head">
                  <span>Level {entry.level}</span>
                  {entry.level === draft.level ? <em>Current</em> : null}
                </div>
                {entry.items.length ? (
                  entry.items.map((item) => (
                    <div className={`pb-plan-item ${item.href ? "is-link" : ""}`} key={item.key}>
                      <Sparkles size={11} />
                      <div>
                        {item.href ? (
                          <Link to={item.href}>{item.label}</Link>
                        ) : (
                          <span>{item.label}</span>
                        )}
                        <em>{item.detail}</em>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="pb-plan-empty">No choices recorded at this level.</p>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            className="pb-plan-toggle"
            onClick={() => setShowFullPlan((current) => !current)}
          >
            {showFullPlan ? "Show current level only" : "Show all 20 levels"}
          </button>
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

          {preparationsPending ? (
            <div className="pb-prep-banner" data-testid="prep-pending-banner">
              <BookOpen size={18} />
              <div className="grow">
                <strong>Spell preparations pending</strong>
                <span>
                  Long rest complete. Choose the spells and cantrips you have prepared today.
                </span>
              </div>
              {canEdit ? (
                <button
                  type="button"
                  className="pb-small-button is-primary"
                  onClick={() => setPrepOpen(true)}
                >
                  Prepare today&apos;s spells
                </button>
              ) : null}
            </div>
          ) : null}

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
                  disabled={!canEdit}
                >
                  <Minus size={12} />
                </button>
                <input
                  ref={hpInputRef}
                  type="number"
                  aria-label="Current hit points"
                  value={hpInput}
                  disabled={!canEdit}
                  onChange={(event) => setHpInput(event.target.value)}
                  onBlur={() => {
                    if (!hpInput.trim()) {
                      setHpInput(String(derived.currentHp));
                      return;
                    }
                    changeHp(Number(hpInput) || 0);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur();
                  }}
                />
                <button
                  type="button"
                  onClick={() => changeHp(derived.currentHp + 1)}
                  aria-label="Increase hit points"
                  disabled={!canEdit}
                >
                  <Plus size={12} />
                </button>
                <button
                  type="button"
                  onClick={() => changeHp(derived.currentHp - 5)}
                  disabled={!canEdit}
                >
                  −5
                </button>
                <button
                  type="button"
                  onClick={() => changeHp(derived.currentHp + 5)}
                  disabled={!canEdit}
                >
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
                      postRoll(
                        `1d20${signed(derived.saves[save])}`,
                        `${SAVE_LABELS[save]} save`,
                        targetDc,
                        sheetSecret,
                        derived.saveUpgrades[save]
                      )
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
                    disabled={!canEdit}
                    onClick={() =>
                      void persist((currentDraft) => ({
                        ...currentDraft,
                        play: {
                          ...currentDraft.play,
                          heroPoints:
                            currentDraft.play.heroPoints === index + 1 ? index : index + 1,
                        },
                      }))
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
                              applyAttackPenalty(
                                attack.attackFormula,
                                attack.traits.includes("agile") ? 4 : 5
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
                              applyAttackPenalty(
                                attack.attackFormula,
                                attack.traits.includes("agile") ? 8 : 10
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
                        postRoll(
                          `1d20${signed(derived.saves[save])}`,
                          `${SAVE_LABELS[save]} save`,
                          targetDc,
                          sheetSecret,
                          derived.saveUpgrades[save]
                        )
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
                  <div
                    className="pb-filter-row pb-category-row"
                    role="group"
                    aria-label="Item categories"
                  >
                    {ITEM_CATEGORIES.map((category) => (
                      <button
                        key={category.id}
                        type="button"
                        className={itemCategory === category.id ? "is-active" : ""}
                        aria-pressed={itemCategory === category.id}
                        onClick={() => {
                          setItemCategory(category.id);
                          setItemSubcategory("all");
                          setItemLimit(30);
                        }}
                      >
                        {ITEM_CATEGORY_LABELS[category.id]}
                      </button>
                    ))}
                  </div>
                  <div className="pb-search-row">
                    <Search size={14} />
                    <input
                      value={itemQuery}
                      onChange={(event) => {
                        setItemQuery(event.target.value);
                        setItemLimit(30);
                      }}
                      placeholder="Search the item database"
                      aria-label="Search the item database"
                    />
                    {itemLoading ? <span className="pb-loading-dot" /> : null}
                  </div>
                  {itemSubcategories.length ? (
                    <div
                      className="pb-filter-row pb-subcategory-row"
                      role="group"
                      aria-label="Item subcategories"
                    >
                      {itemSubcategories.map((subcategory) => (
                        <button
                          key={subcategory.id}
                          type="button"
                          className={itemSubcategory === subcategory.id ? "is-active" : ""}
                          aria-pressed={itemSubcategory === subcategory.id}
                          onClick={() => {
                            setItemSubcategory(subcategory.id);
                            setItemLimit(30);
                          }}
                        >
                          {subcategory.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <div className="pb-item-filter-row">
                    <select
                      className="pb-gear-filter-select"
                      value={itemLevelFilter}
                      aria-label="Item level"
                      onChange={(event) => {
                        setItemLevelFilter(event.target.value);
                        setItemLimit(30);
                      }}
                    >
                      {ITEM_LEVEL_FILTERS.map((level) => (
                        <option key={level.id} value={level.id}>
                          {level.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className={`pb-filter-chip ${itemMagicOnly ? "is-active" : ""}`}
                      aria-pressed={itemMagicOnly}
                      title="Show only items with the magical trait"
                      onClick={() => {
                        setItemMagicOnly((current) => !current);
                        setItemLimit(30);
                      }}
                    >
                      Magic only
                    </button>
                    {itemFiltersActive ? (
                      <button
                        type="button"
                        className="pb-filter-chip"
                        aria-label="Reset item filters"
                        onClick={() => {
                          setItemQuery("");
                          setItemCategory("all");
                          setItemSubcategory("all");
                          setItemLevelFilter("all");
                          setItemMagicOnly(false);
                          setItemLimit(30);
                        }}
                      >
                        Reset
                      </button>
                    ) : null}
                    <span className="pb-item-count" role="status">
                      {itemLoading
                        ? "Searching…"
                        : `${itemTotal.toLocaleString()} item${itemTotal === 1 ? "" : "s"}`}
                    </span>
                  </div>
                  {itemError ? <p className="pb-error-text">{itemError}</p> : null}
                  <div className="pb-item-results">
                    {itemResults.map((item) => {
                      const quantity = Math.max(
                        1,
                        Math.round(Number(itemQuantities[item.id] ?? "1") || 1)
                      );
                      const costCp = Math.max(0, Math.round(item.price.cpTotal)) * quantity;
                      const purseCp = currencyToCp(draft.currency);
                      const canAfford = item.price.cpTotal > 0 && costCp <= purseCp;
                      return (
                        <div className="pb-item-row" key={item.id}>
                          <Link to={`/library/equipment/${item.id}`} className="pb-item-name">
                            <strong>{item.name}</strong>
                            <span>
                              {equipmentTypeLabel(item)} · Level {item.level} ·{" "}
                              {formatCp(item.price.cpTotal)}
                              {quantity > 1 ? ` · ${formatCp(costCp)} total` : ""}
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
                            disabled={!canEdit || itemBusy === item.id || !canAfford}
                            title={
                              item.price.cpTotal <= 0
                                ? "This item has no purchase price."
                                : !canAfford
                                  ? `Not enough coins — ${formatCp(costCp)} needed.`
                                  : undefined
                            }
                            onClick={() => void buyItem(item, "buy")}
                          >
                            Buy
                          </button>
                          {canGrant ? (
                            <button
                              type="button"
                              className="pb-small-button"
                              disabled={!canEdit || itemBusy === item.id}
                              title="Add without paying (GM permission)"
                              onClick={() => void buyItem(item, "grant")}
                            >
                              Grant
                            </button>
                          ) : null}
                        </div>
                      );
                    })}
                    {!itemResults.length && !itemLoading ? (
                      <p className="pb-empty">
                        {itemFiltersActive
                          ? "No items match those filters."
                          : "No items available."}
                      </p>
                    ) : null}
                  </div>
                  {!itemLoading && itemResults.length < itemTotal && itemLimit < 200 ? (
                    <button
                      type="button"
                      className="pb-small-button"
                      onClick={() => setItemLimit((current) => Math.min(200, current + 30))}
                    >
                      Show {Math.min(30, itemTotal - itemResults.length)} more
                    </button>
                  ) : null}
                  {itemResults.length < itemTotal ? (
                    <p className="pb-hint">
                      Showing {itemResults.length.toLocaleString()} of {itemTotal.toLocaleString()}.
                      Refine the category or search to narrow it down.
                    </p>
                  ) : null}
                  {!canGrant ? (
                    <p className="pb-hint">
                      The GM can enable free gear grants in campaign settings.
                    </p>
                  ) : null}
                </div>

                <div className="pb-inventory">
                  <div className="pb-inventory-head">
                    <h3>Inventory</h3>
                    <div className="pb-inventory-head-actions">
                      <span>
                        {draft.equipment.length} item{draft.equipment.length === 1 ? "" : "s"}
                      </span>
                      {canEdit ? (
                        <button
                          type="button"
                          className="pb-small-button"
                          aria-label="Add custom item"
                          onClick={() => setCustomItemOpen(true)}
                        >
                          <Plus size={12} /> Custom
                        </button>
                      ) : null}
                    </div>
                  </div>
                  {inventoryGroups.length ? (
                    inventoryGroups.map((group) => (
                      <section
                        className="pb-inventory-group"
                        key={group.id}
                        aria-label={group.label}
                      >
                        <h4>
                          {group.label} <span>{group.entries.length}</span>
                        </h4>
                        {group.entries.map((entry) => {
                          const item = context.equipment[entry.itemId] ?? null;
                          const custom = entry.itemId.startsWith("custom:")
                            ? (customItemsById.get(entry.itemId) ?? null)
                            : null;
                          const scrollRank = item ? scrollSpellRank(item) : null;
                          const wandRank = item ? wandSpellRank(item) : null;
                          const flexibleRank = item ? flexibleWandRank(item) : null;
                          const staffEntries = item
                            ? staffSpells(item).flatMap((staffSpell) => {
                                const spell = spellsByName.get(staffSpell.name.toLowerCase());
                                return spell ? [{ spell, rank: staffSpell.rank }] : [];
                              })
                            : [];
                          const staffMax = Math.max(0, Math.round(entry.usesMax ?? 0));
                          const staffRemaining = Math.max(
                            0,
                            staffMax - Math.max(0, Math.round(entry.usesUsed ?? 0))
                          );
                          const wandMax = Math.max(1, Math.round(entry.usesMax ?? 1));
                          const wandUsed = Math.max(0, Math.round(entry.usesUsed ?? 0)) >= wandMax;
                          const canCastItem =
                            derived?.spellDc != null && Boolean(derived.casterTradition);
                          const fixedWand = item ? specificWandSpell(item) : null;
                          const fixedWandSpell = fixedWand
                            ? (spellsByName.get(fixedWand.name.toLowerCase()) ?? null)
                            : null;
                          const fixedWandRank =
                            fixedWand && fixedWandSpell
                              ? (fixedWand.rank ?? fixedWandSpell.rank)
                              : null;
                          const fixedWandCastable =
                            Boolean(fixedWandSpell && fixedWandRank && canCastItem) &&
                            Boolean(
                              fixedWandSpell &&
                              derived?.casterTradition &&
                              (fixedWandSpell.traditions.length === 0 ||
                                fixedWandSpell.traditions.includes(derived.casterTradition))
                            );
                          return (
                            <div className="pb-inventory-row" key={entry.itemId}>
                              {custom ? (
                                <button
                                  type="button"
                                  className="pb-inventory-link"
                                  onClick={() => setCustomItemView(custom)}
                                >
                                  <Package size={13} />
                                  <strong>{custom.name}</strong>
                                  <span>×{entry.quantity}</span>
                                </button>
                              ) : entry.itemId.startsWith("custom:") ? (
                                <div className="pb-inventory-link">
                                  <Package size={13} />
                                  <strong>{item?.name ?? entry.itemId}</strong>
                                  <span>×{entry.quantity}</span>
                                </div>
                              ) : (
                                <Link to={`/library/equipment/${entry.itemId}`}>
                                  <Package size={13} />
                                  <strong>{item?.name ?? entry.itemId}</strong>
                                  <span>×{entry.quantity}</span>
                                </Link>
                              )}
                              <div className="pb-row-actions">
                                {custom ? (
                                  <button
                                    type="button"
                                    className="pb-small-button"
                                    disabled={!canEdit}
                                    title="Remove this custom item from the inventory"
                                    onClick={() => void removeCustomItem(custom.id)}
                                  >
                                    Remove
                                  </button>
                                ) : (
                                  <>
                                    {item && scrollRank && canCastItem ? (
                                      <button
                                        type="button"
                                        className="pb-small-button"
                                        disabled={!canEdit}
                                        aria-label={`Cast spell from ${item.name}`}
                                        onClick={() =>
                                          setItemCast({
                                            item,
                                            rank: scrollRank,
                                            kind: "scroll",
                                          })
                                        }
                                      >
                                        Cast scroll
                                      </button>
                                    ) : null}
                                    {item && wandRank && canCastItem ? (
                                      <button
                                        type="button"
                                        className="pb-small-button"
                                        disabled={!canEdit || wandUsed}
                                        aria-label={
                                          wandUsed
                                            ? `${item.name} is used today`
                                            : `Cast spell from ${item.name}`
                                        }
                                        title="Magic wands have one cast per day; a long rest resets them."
                                        onClick={() =>
                                          setItemCast({
                                            item,
                                            rank: wandRank,
                                            kind: "wand",
                                          })
                                        }
                                      >
                                        {wandUsed ? "Used today" : "Cast wand"}
                                      </button>
                                    ) : null}
                                    {item && flexibleRank && canCastItem ? (
                                      <button
                                        type="button"
                                        className="pb-small-button"
                                        disabled={!canEdit || wandUsed}
                                        aria-label={
                                          wandUsed
                                            ? `${item.name} is used today`
                                            : `Cast spell from ${item.name}`
                                        }
                                        title="This wand holds a chosen spell. Apply the wand's effect when you cast it."
                                        onClick={() =>
                                          setItemCast({
                                            item,
                                            rank: flexibleRank,
                                            kind: "wand",
                                          })
                                        }
                                      >
                                        {wandUsed ? "Used today" : "Cast wand"}
                                      </button>
                                    ) : null}
                                    {item &&
                                    fixedWandSpell &&
                                    fixedWandRank &&
                                    fixedWandCastable ? (
                                      <button
                                        type="button"
                                        className="pb-small-button"
                                        disabled={!canEdit || wandUsed}
                                        aria-label={
                                          wandUsed
                                            ? `${item.name} is used today`
                                            : `Cast ${fixedWandSpell.name} from ${item.name}`
                                        }
                                        title="Magic wands have one cast per day; a long rest resets them."
                                        onClick={() =>
                                          void castWandSpell(item, fixedWandRank, fixedWandSpell)
                                        }
                                      >
                                        {wandUsed ? "Used today" : "Cast wand"}
                                      </button>
                                    ) : null}
                                    {item && staffEntries.length && canCastItem ? (
                                      <>
                                        <span className="tiny muted">
                                          {staffRemaining} / {staffMax} charges
                                        </span>
                                        <button
                                          type="button"
                                          className="pb-small-button"
                                          disabled={!canEdit}
                                          aria-label={`Charge ${item.name}`}
                                          onClick={() => setStaffCharge(item)}
                                        >
                                          Charge
                                        </button>
                                        <button
                                          type="button"
                                          className="pb-small-button"
                                          aria-label={`View ${item.name} effects`}
                                          onClick={() => setStaffEffect(item)}
                                        >
                                          Effects
                                        </button>
                                        <button
                                          type="button"
                                          className="pb-small-button"
                                          disabled={!canEdit}
                                          aria-label={`Cast spell from ${item.name}`}
                                          onClick={() =>
                                            setStaffCast({ item, spells: staffEntries })
                                          }
                                        >
                                          Cast staff
                                        </button>
                                      </>
                                    ) : null}
                                    {item?.price ? (
                                      <span>{formatCp(item.price.cpTotal)} each</span>
                                    ) : null}
                                    <button
                                      type="button"
                                      className={
                                        entry.equipped ? "pb-small-button is-on" : "pb-small-button"
                                      }
                                      disabled={!canEdit}
                                      onClick={() => toggleEquipment(entry.itemId, "equipped")}
                                    >
                                      {entry.equipped ? "Equipped" : "Equip"}
                                    </button>
                                    <button
                                      type="button"
                                      className={
                                        entry.invested ? "pb-small-button is-on" : "pb-small-button"
                                      }
                                      disabled={!canEdit}
                                      onClick={() => toggleEquipment(entry.itemId, "invested")}
                                    >
                                      {entry.invested ? "Invested" : "Invest"}
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </section>
                    ))
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
                  {derived.focusSpellDc !== null && derived.focusSpellDc !== derived.spellDc ? (
                    <div>
                      <span>Focus DC</span>
                      <strong>{derived.focusSpellDc}</strong>
                    </div>
                  ) : null}
                  {derived.innateSpellDc !== null && derived.innateSpellDc !== derived.spellDc ? (
                    <div>
                      <span>Innate DC</span>
                      <strong>{derived.innateSpellDc}</strong>
                    </div>
                  ) : null}
                </div>
                {preparedCaster ? (
                  <div className="row-between pb-prep-actions">
                    <span className="tiny muted">
                      {draft.spells.preparationsPending
                        ? "Today's spells are not confirmed."
                        : "Prepared spells can be changed during daily preparations."}
                    </span>
                    {canEdit ? (
                      <button
                        type="button"
                        className="pb-small-button"
                        onClick={() => setPrepOpen(true)}
                      >
                        <BookOpen size={12} /> Daily preparations
                      </button>
                    ) : null}
                  </div>
                ) : null}
                {canLearnSpells && canEdit ? (
                  <div className="row-between pb-prep-actions">
                    <span className="tiny muted">
                      Downtime: learn a spell from a scroll, teacher, or another{" "}
                      {spellSourceLabel(classData)}.
                    </span>
                    <button
                      type="button"
                      className="pb-small-button"
                      onClick={() => setLearnOpen(true)}
                    >
                      <BookOpen size={12} /> Learn spell
                    </button>
                  </div>
                ) : null}
                {draft.play.sustainedSpells.length ? (
                  <div className="pb-sustain-list" data-testid="sustained-spells">
                    <span className="tiny muted">Sustained</span>
                    <div className="chip-row">
                      {draft.play.sustainedSpells.map((entry) => (
                        <span className="pb-sustain-chip" key={entry.id}>
                          <strong>{entry.name}</strong>
                          <em>rank {entry.rank}</em>
                          {canEdit ? (
                            <button
                              type="button"
                              className="pb-small-button"
                              onClick={() => void stopSustain(entry.spellId)}
                            >
                              End
                            </button>
                          ) : null}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
                {derived.animistApparitions ? (
                  <div className="pb-sustain-list" data-testid="attuned-apparitions">
                    <span className="tiny muted">Apparitions</span>
                    <div className="chip-row">
                      {derived.animistApparitions.attuned.map((apparition) => (
                        <span className="pb-sustain-chip" key={apparition.id}>
                          <strong>{apparition.name}</strong>
                          {derived.animistApparitions?.primaryId === apparition.id ? (
                            <em>primary</em>
                          ) : null}
                        </span>
                      ))}
                      {!derived.animistApparitions.attuned.length ? (
                        <span className="tiny muted">None attuned</span>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                <div className="pb-slot-list">
                  {(derived.spellSlots ?? []).map((slotTotal, index) => {
                    if (slotTotal <= 0) return null;
                    const rank = index + 1;
                    const fontAtRank =
                      derived.divineFontRank === rank ? (derived.divineFontSlots ?? 0) : 0;
                    const total = Math.max(0, slotTotal - fontAtRank);
                    if (total <= 0) return null;
                    const used = Math.max(
                      0,
                      Math.min(total, Math.round(Number(draft.spells.slotsUsed[String(rank)]) || 0))
                    );
                    return (
                      <div className="pb-slot-row" key={`rank-${rank}`}>
                        <span>Rank {rank}</span>
                        <div className="pb-slot-pips">
                          {Array.from({ length: total }).map((_pip, pip) => (
                            <button
                              key={pip}
                              type="button"
                              className={used > pip ? "is-used" : ""}
                              aria-label={`Set rank ${rank} slots used to ${pip + 1}`}
                              disabled={!canEdit}
                              onClick={() =>
                                void persist((currentDraft) => {
                                  const currentUsed = Math.max(
                                    0,
                                    Math.round(
                                      Number(currentDraft.spells.slotsUsed[String(rank)]) || 0
                                    )
                                  );
                                  return {
                                    ...currentDraft,
                                    spells: {
                                      ...currentDraft.spells,
                                      slotsUsed: {
                                        ...currentDraft.spells.slotsUsed,
                                        [String(rank)]: currentUsed === pip + 1 ? pip : pip + 1,
                                      },
                                    },
                                  };
                                })
                              }
                            />
                          ))}
                        </div>
                        <em>
                          {total - used} / {total}
                        </em>
                      </div>
                    );
                  })}
                  {(derived.animistApparitions?.slots ?? []).map((slotTotal, index) => {
                    if (slotTotal <= 0) return null;
                    const rank = index + 1;
                    const used = Math.max(
                      0,
                      Math.min(
                        slotTotal,
                        Math.round(Number(draft.spells.apparitionUsed[String(rank)]) || 0)
                      )
                    );
                    return (
                      <div className="pb-slot-row" key={`apparition-rank-${rank}`}>
                        <span>Apparition rank {rank}</span>
                        <div className="pb-slot-pips">
                          {Array.from({ length: slotTotal }).map((_pip, pip) => (
                            <button
                              key={pip}
                              type="button"
                              className={used > pip ? "is-used" : ""}
                              aria-label={`Set apparition rank ${rank} slots used to ${pip + 1}`}
                              disabled={!canEdit}
                              onClick={() =>
                                void persist((currentDraft) => {
                                  const currentUsed = Math.max(
                                    0,
                                    Math.round(
                                      Number(currentDraft.spells.apparitionUsed[String(rank)]) || 0
                                    )
                                  );
                                  return {
                                    ...currentDraft,
                                    spells: {
                                      ...currentDraft.spells,
                                      apparitionUsed: {
                                        ...currentDraft.spells.apparitionUsed,
                                        [String(rank)]: currentUsed === pip + 1 ? pip : pip + 1,
                                      },
                                    },
                                  };
                                })
                              }
                            />
                          ))}
                        </div>
                        <em>
                          {slotTotal - used} / {slotTotal}
                        </em>
                      </div>
                    );
                  })}
                  {(derived.divineFontSlots ?? 0) > 0 ? (
                    <div className="pb-slot-row">
                      <span>Divine font</span>
                      <div className="pb-slot-pips">
                        {Array.from({ length: derived.divineFontSlots ?? 0 }).map((_pip, pip) => {
                          const used = Math.max(0, Math.round(draft.spells.divineFontUsed));
                          return (
                            <button
                              key={pip}
                              type="button"
                              className={used > pip ? "is-used" : ""}
                              aria-label={`Set divine font slots used to ${pip + 1}`}
                              disabled={!canEdit}
                              onClick={() =>
                                void persist((currentDraft) => {
                                  const currentUsed = Math.max(
                                    0,
                                    Math.round(Number(currentDraft.spells.divineFontUsed) || 0)
                                  );
                                  return {
                                    ...currentDraft,
                                    spells: {
                                      ...currentDraft.spells,
                                      divineFontUsed: currentUsed === pip + 1 ? pip : pip + 1,
                                    },
                                  };
                                })
                              }
                            />
                          );
                        })}
                      </div>
                      <em>
                        {(derived.divineFontSlots ?? 0) -
                          Math.max(0, Math.round(draft.spells.divineFontUsed))}{" "}
                        / {derived.divineFontSlots}
                      </em>
                    </div>
                  ) : null}
                  {derived.focusPointsMax > 0 ? (
                    <div className="pb-slot-row">
                      <span>Focus</span>
                      <div className="pb-slot-pips is-focus">
                        {Array.from({ length: derived.focusPointsMax }).map((_pip, pip) => (
                          <button
                            key={pip}
                            type="button"
                            className={draft.play.focusPoints > pip ? "is-used" : ""}
                            aria-label={`Set focus points to ${pip + 1}`}
                            disabled={!canEdit}
                            onClick={() =>
                              void persist((currentDraft) => ({
                                ...currentDraft,
                                play: {
                                  ...currentDraft.play,
                                  focusPoints:
                                    currentDraft.play.focusPoints === pip + 1 ? pip : pip + 1,
                                },
                              }))
                            }
                          />
                        ))}
                      </div>
                      <em>
                        {draft.play.focusPoints} / {derived.focusPointsMax}
                      </em>
                    </div>
                  ) : null}
                  {derived.studiousSlots
                    ? (() => {
                        const studiousUsed = Object.values(draft.spells.studiousUsed).reduce(
                          (total, value) => total + Math.max(0, Math.round(Number(value) || 0)),
                          0
                        );
                        const used = Math.max(
                          0,
                          Math.min(derived.studiousSlots.count, studiousUsed)
                        );
                        const preparedNames = draft.spells.studiousPrepared
                          .map(
                            (id) =>
                              derived.studiousSlots?.spells.find((spell) => spell.id === id)
                                ?.name ?? id
                          )
                          .join(", ");
                        return (
                          <div
                            className="pb-slot-row"
                            title={`Studious spells: ${preparedNames || "none prepared"}`}
                          >
                            <span>Studious rank {derived.studiousSlots.rank}</span>
                            <div className="pb-slot-pips">
                              {Array.from({ length: derived.studiousSlots.count }).map(
                                (_pip, pip) => (
                                  <span
                                    key={pip}
                                    className={`pb-slot-pip ${used > pip ? "is-used" : ""}`}
                                  />
                                )
                              )}
                            </div>
                            <em>
                              {derived.studiousSlots.count - used} / {derived.studiousSlots.count}
                            </em>
                          </div>
                        );
                      })()
                    : null}
                </div>

                {spellEntries.length ? (
                  spellEntries.map(({ group, spell, id }, index) => {
                    const options = spell ? optionsForSpell(spell, group) : [];
                    const available = options.filter(
                      (option) => option.remaining === null || option.remaining > 0
                    );
                    const key = `${group}:${id}`;
                    const selected =
                      castChoices[key] ?? (options[0] ? castOptionValue(options[0]) : "");
                    const selectedChoice = castChoiceFromValue(selected);
                    const restorable = Boolean(
                      canEdit &&
                      spell &&
                      selectedChoice &&
                      canRestoreSpellUse(draft, spell, selectedChoice, {
                        focusPointsMax: derived.focusPointsMax,
                      })
                    );
                    const profile = spellProfileFor(group);
                    const sustained = spell ? sustainedSpellFor(draft, spell.id) : null;
                    const sustains = spell ? spellNeedsSustain(spell) : false;
                    const amp =
                      spell && context?.classData?.name.toLowerCase() === "psychic"
                        ? psiAmpFor(spell.id)
                        : null;
                    return (
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
                            {group === "Focus" || group === "Innate"
                              ? ` · DC ${profile.dc ?? "—"}`
                              : ""}
                          </span>
                          {amp ? (
                            <span
                              className="pb-amp-note"
                              title={`${amp.summary}${amp.heightened ? ` ${amp.heightened}` : ""}`}
                            >
                              Amp (1 Focus): {amp.summary}
                            </span>
                          ) : null}
                        </Link>
                        <div className="pb-row-actions">
                          {spell?.traits.includes("attack") && profile.attack !== null ? (
                            <button
                              type="button"
                              className="pb-small-button"
                              onClick={() =>
                                postRoll(
                                  `1d20${signed(profile.attack ?? 0)}`,
                                  `${spell.name} spell attack`
                                )
                              }
                            >
                              <Dices size={12} /> Attack
                            </button>
                          ) : null}
                          {options.length > 1 ? (
                            <select
                              className="pb-cast-select"
                              aria-label={`Cast rank for ${spell?.name ?? id}`}
                              value={selected}
                              disabled={!canEdit}
                              onChange={(event) =>
                                setCastChoices((current) => ({
                                  ...current,
                                  [key]: event.target.value,
                                }))
                              }
                            >
                              {options.map((option) => {
                                const effectiveRank = option.castRank ?? option.rank;
                                return (
                                  <option
                                    key={`${option.rank}-${option.resource}-${effectiveRank}`}
                                    value={castOptionValue(option)}
                                  >
                                    Rank {option.rank} ·{" "}
                                    {option.resource === "amp" ? "Amp (1 Focus)" : option.resource}
                                    {effectiveRank !== option.rank
                                      ? ` · cast at rank ${effectiveRank}`
                                      : ""}
                                  </option>
                                );
                              })}
                            </select>
                          ) : null}
                          {canEdit && spell && group !== "Rituals" && available.length ? (
                            <button
                              type="button"
                              className="pb-small-button is-primary"
                              onClick={() => void cast(spell, group)}
                            >
                              Cast
                            </button>
                          ) : null}
                          {restorable && spell ? (
                            <button
                              type="button"
                              className="pb-small-button"
                              onClick={() => void restore(spell, group)}
                            >
                              Restore
                            </button>
                          ) : null}
                          {canEdit && spell && sustains ? (
                            <button
                              type="button"
                              className="pb-small-button"
                              onClick={() => void toggleSustain(spell, group)}
                            >
                              {sustained ? "End sustain" : "Sustain"}
                            </button>
                          ) : null}
                          {canEdit && spell && group === "Rituals" ? (
                            <>
                              <button
                                type="button"
                                className="pb-small-button"
                                onClick={() => setRitualView(spell)}
                              >
                                Details
                              </button>
                              <button
                                type="button"
                                className="pb-small-button"
                                onClick={() => rollRitual(spell)}
                              >
                                Primary check
                              </button>
                            </>
                          ) : null}
                        </div>
                      </div>
                    );
                  })
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

            {tab === "actions" ? (
              <div className="pb-stack">
                <div className="pb-action-search">
                  <div className="pb-search-row">
                    <Search size={14} />
                    <input
                      value={actionQuery}
                      placeholder="Search actions"
                      aria-label="Search actions"
                      onChange={(event) => setActionQuery(event.target.value)}
                    />
                  </div>
                  <div className="pb-filter-row">
                    <button
                      type="button"
                      className={actionCategory === "all" ? "is-active" : ""}
                      aria-pressed={actionCategory === "all"}
                      onClick={() => setActionCategory("all")}
                    >
                      All
                    </button>
                    {actionCategories.map((category) => (
                      <button
                        key={category}
                        type="button"
                        className={actionCategory === category ? "is-active" : ""}
                        aria-pressed={actionCategory === category}
                        onClick={() => setActionCategory(category)}
                      >
                        {titleCase(category)}
                      </button>
                    ))}
                  </div>
                  <span className="pb-action-count">
                    {visibleActions.length} action{visibleActions.length === 1 ? "" : "s"}
                  </span>
                </div>
                {actionsLoading ? (
                  <p className="pb-empty">Loading actions…</p>
                ) : visibleActions.length ? (
                  <div className="pb-action-list">
                    {visibleActions.slice(0, actionLimit).map((action) => (
                      <Link
                        className="pb-action-row"
                        key={action.id}
                        to={`/library/action/${action.id}`}
                      >
                        <span className="pb-action-cost">
                          {action.actions !== null
                            ? "◆".repeat(Math.max(0, Math.min(3, action.actions)))
                            : (action.actionType ?? "—")}
                        </span>
                        <span className="pb-action-copy">
                          <strong>{action.name}</strong>
                          <em>
                            {[titleCase(action.category), ...action.traits.slice(0, 3)].join(" · ")}
                          </em>
                        </span>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="pb-empty">No actions match that search.</p>
                )}
                {visibleActions.length > actionLimit ? (
                  <button
                    type="button"
                    className="pb-small-button"
                    onClick={() => setActionLimit((current) => current + 120)}
                  >
                    Show {Math.min(120, visibleActions.length - actionLimit)} more
                  </button>
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
                {draft.companions.length ? (
                  <div>
                    <h3>Companions &amp; summons</h3>
                    <div className="stack" style={{ gap: 8 }}>
                      {draft.companions.map((companion) => {
                        const monster = companion.monsterId
                          ? (context.monsters?.[companion.monsterId] ?? null)
                          : null;
                        const hpMax = companion.hpMax ?? monster?.hp ?? null;
                        const ac = companion.ac ?? monster?.ac ?? null;
                        return (
                          <div key={companion.id} className="companion-row">
                            <div className="companion-row-head">
                              <strong>{companion.name || "Companion"}</strong>
                              <span className="tiny muted">
                                {COMPANION_KIND_LABELS[companion.kind] ?? companion.kind} · level{" "}
                                {companion.level}
                              </span>
                            </div>
                            <div className="tiny muted">
                              HP {companion.hpCurrent ?? "—"} / {hpMax ?? "—"} · AC {ac ?? "—"}
                            </div>
                            {monster ? (
                              <div className="companion-statblock">
                                <div className="tiny muted">
                                  Fort {signed(monster.fortitude)} · Ref {signed(monster.reflex)} ·
                                  Will {signed(monster.will)} · Per {signed(monster.perception)}
                                </div>
                                {monster.attacks.length ? (
                                  <div className="tiny">
                                    {monster.attacks
                                      .map(
                                        (attack) =>
                                          `${attack.name} ${signed(attack.bonus)} (${attack.damage})`
                                      )
                                      .join(" · ")}
                                  </div>
                                ) : null}
                                {monster.abilities.length ? (
                                  <details>
                                    <summary className="tiny gold-text">
                                      {monster.abilities.length} abilities
                                    </summary>
                                    {monster.abilities.map((ability) => (
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
                              </div>
                            ) : null}
                            {companion.notes ? <p className="tiny">{companion.notes}</p> : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
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
                <div className="pb-detail-edit">
                  <div className="pb-status-head">
                    <h3>Edit details</h3>
                    <span>Saved to the character sheet</span>
                  </div>
                  <fieldset className="pb-detail-fields" disabled={!canEdit}>
                    <div className="pb-edit-grid">
                      <label className="pb-edit-field">
                        <span>Name</span>
                        <input
                          value={detailsForm.name}
                          onChange={(event) => updateDetails("name", event.target.value)}
                        />
                      </label>
                      <label className="pb-edit-field">
                        <span>Age</span>
                        <input
                          value={detailsForm.age}
                          onChange={(event) => updateDetails("age", event.target.value)}
                        />
                      </label>
                      <label className="pb-edit-field">
                        <span>Gender</span>
                        <input
                          value={detailsForm.gender}
                          onChange={(event) => updateDetails("gender", event.target.value)}
                        />
                      </label>
                      <label className="pb-edit-field">
                        <span>Pronouns</span>
                        <input
                          value={detailsForm.pronouns}
                          onChange={(event) => updateDetails("pronouns", event.target.value)}
                        />
                      </label>
                      <label className="pb-edit-field">
                        <span>Height</span>
                        <input
                          value={detailsForm.height}
                          onChange={(event) => updateDetails("height", event.target.value)}
                        />
                      </label>
                      <label className="pb-edit-field">
                        <span>Weight</span>
                        <input
                          value={detailsForm.weight}
                          onChange={(event) => updateDetails("weight", event.target.value)}
                        />
                      </label>
                    </div>
                    <label className="pb-edit-field is-full">
                      <span>Appearance</span>
                      <textarea
                        value={detailsForm.appearance}
                        onChange={(event) => updateDetails("appearance", event.target.value)}
                      />
                    </label>
                    <label className="pb-edit-field is-full">
                      <span>Personality</span>
                      <textarea
                        value={detailsForm.personality}
                        onChange={(event) => updateDetails("personality", event.target.value)}
                      />
                    </label>
                    <label className="pb-edit-field is-full">
                      <span>Beliefs</span>
                      <textarea
                        value={detailsForm.beliefs}
                        onChange={(event) => updateDetails("beliefs", event.target.value)}
                      />
                    </label>
                    <label className="pb-edit-field is-full">
                      <span>Notes</span>
                      <textarea
                        className="is-tall"
                        value={detailsForm.notes}
                        onChange={(event) => updateDetails("notes", event.target.value)}
                      />
                    </label>
                  </fieldset>
                  <div className="pb-edit-actions">
                    <span className="pb-hint">
                      {canEdit
                        ? "Changes save to the shared character record."
                        : "This sheet is read-only."}
                    </span>
                    <button
                      type="button"
                      className="pb-small-button is-primary"
                      disabled={!canEdit || detailsSaving || saving}
                      onClick={() => void saveDetails()}
                    >
                      {detailsSaving || saving ? "Saving…" : "Save details"}
                    </button>
                  </div>
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
                        {canEdit ? (
                          <button
                            type="button"
                            aria-label={`Remove ${condition.name}`}
                            onClick={() => removeCondition(index)}
                          >
                            <X size={13} />
                          </button>
                        ) : null}
                      </div>
                    ))
                  ) : (
                    <p className="pb-empty">No conditions.</p>
                  )}
                </div>
                {canEdit ? (
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
                ) : null}
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
      {builderOpen && canEdit ? (
        <div className="pb-builder-overlay">
          <Suspense fallback={<Spinner label="Opening the planner…" />}>
            <CharacterBuilderPage
              characterId={character.id}
              onClose={() => {
                setBuilderOpen(false);
                void load();
              }}
              onDeleted={() => {
                setBuilderOpen(false);
                if (onClose) onClose();
                else if (character.campaignId) navigate(`/campaigns/${character.campaignId}`);
                else navigate("/campaigns");
              }}
            />
          </Suspense>
        </div>
      ) : null}
      <LongRestModal
        open={restOpen}
        onClose={() => setRestOpen(false)}
        draft={draft}
        derived={derived}
        preparedCaster={preparedCaster}
        onRest={(result) => void takeLongRest(result)}
      />
      <DailyPreparationsModal
        open={prepOpen}
        onClose={() => setPrepOpen(false)}
        draft={draft}
        context={context}
        derived={derived}
        onApply={(next) => void applyPreparations(next)}
      />
      <Modal
        open={customItemOpen}
        onClose={() => {
          if (!customItemSaving) setCustomItemOpen(false);
        }}
        title="Add custom item"
        subtitle="Track a homebrew, story, or improvised item on this sheet."
        elevated={mode === "overlay"}
        footer={
          <>
            <Button
              variant="ghost"
              disabled={customItemSaving}
              onClick={() => setCustomItemOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={customItemSaving}
              disabled={!customItemName.trim()}
              onClick={() => void addCustomItem()}
            >
              Add item
            </Button>
          </>
        }
      >
        <div className="stack">
          <Field label="Item name">
            <Input
              autoFocus
              value={customItemName}
              maxLength={120}
              onChange={(event) => setCustomItemName(event.target.value)}
            />
          </Field>
          <Field label="Quantity">
            <Input
              type="number"
              min={1}
              max={999}
              value={customItemQuantity}
              onChange={(event) => setCustomItemQuantity(event.target.value)}
            />
          </Field>
          <Field label="Description" hint="Optional. Plain text is fine.">
            <Textarea
              rows={5}
              value={customItemDescription}
              maxLength={4000}
              onChange={(event) => setCustomItemDescription(event.target.value)}
            />
          </Field>
        </div>
      </Modal>
      {learnOpen ? (
        <SpellPicker
          open
          onClose={() => setLearnOpen(false)}
          rank={null}
          maxRank={derived.maxSpellRank}
          tradition={derived.casterTradition}
          classTrait={context.classData?.name.toLowerCase()}
          expanded={draft.contentMode === "expanded"}
          onExpandedChange={() => undefined}
          contentModeLocked
          legacyDefault={draft.includeLegacy}
          legacyLocked
          excludeIds={[
            ...sourceSpellIds(draft, classData),
            ...derived.grantedSpells.map((spell) => spell.id),
          ]}
          confirmLabelFor={(spell) =>
            `Learn for ${formatCp(learnSpellCostCp(spell))} · DC ${learnSpellDc(spell.rank)}`
          }
          onSelect={(spell) => void learnSpell(spell)}
        />
      ) : null}
      {itemCast ? (
        <SpellPicker
          open
          onClose={() => setItemCast(null)}
          rank={itemCast.rank}
          tradition={derived.casterTradition}
          classTrait={context.classData?.name.toLowerCase()}
          expanded={draft.contentMode === "expanded"}
          onExpandedChange={() => undefined}
          contentModeLocked
          legacyDefault={draft.includeLegacy}
          legacyLocked
          requiredTrait={itemCast.item.name.startsWith("Cyrusian Wand") ? "illusion" : undefined}
          confirmLabel={itemCast.kind === "wand" ? "Cast from wand" : "Cast from scroll"}
          onSelect={(spell) => void castItemSpell(spell)}
        />
      ) : null}
      {staffCast ? (
        <Modal
          open
          onClose={() => setStaffCast(null)}
          title={staffCast.item.name}
          subtitle="Cast a spell from the staff"
          elevated={mode === "overlay"}
          footer={
            <Button variant="ghost" onClick={() => setStaffCast(null)}>
              Close
            </Button>
          }
        >
          {(() => {
            const pool = staffPool(staffCast.item);
            const ranks = [...new Set(staffCast.spells.map((entry) => entry.rank))].sort(
              (left, right) => left - right
            );
            return (
              <div className="stack">
                <p className="muted small">
                  {pool.remaining} / {pool.max} charges. Cantrips are free; ranked spells cost
                  charges equal to their rank or one spell slot of that rank.
                </p>
                {ranks.map((rank) => (
                  <div key={rank}>
                    <h4>{rank === 0 ? "Cantrips" : `Rank ${rank}`}</h4>
                    <div className="chip-row">
                      {staffCast.spells
                        .filter((entry) => entry.rank === rank)
                        .map(({ spell, rank: spellRank }) => (
                          <span
                            key={`${spell.id}:${spellRank}`}
                            style={{ display: "inline-flex", gap: 4 }}
                          >
                            <Button
                              size="sm"
                              disabled={!canEdit || spellRank > pool.remaining}
                              onClick={() => void castStaffSpell(staffCast.item, spell, spellRank)}
                            >
                              {spell.name}
                              {spellRank
                                ? ` · ${spellRank} charge${spellRank === 1 ? "" : "s"}`
                                : ""}
                            </Button>
                            {spellRank ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={!canEdit || staffSlotRemaining(spellRank) <= 0}
                                title={`Use a rank ${spellRank} spell slot`}
                                onClick={() =>
                                  void castStaffSpellWithSlot(staffCast.item, spell, spellRank)
                                }
                              >
                                Slot
                              </Button>
                            ) : null}
                          </span>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </Modal>
      ) : null}
      {staffEffect ? (
        <Modal
          open
          onClose={() => setStaffEffect(null)}
          title={`${staffEffect.name} effects`}
          subtitle="Special staff effects apply manually at the table"
          elevated={mode === "overlay"}
          footer={
            <Button variant="ghost" onClick={() => setStaffEffect(null)}>
              Close
            </Button>
          }
        >
          <div className="stack">
            {staffSpecialEffect(staffEffect) ? (
              <p>{staffSpecialEffect(staffEffect)}</p>
            ) : (
              <p>No special staff effect was found in the item text.</p>
            )}
            <p className="tiny muted">
              Charges, spell casting, and spell slots are tracked. Bonuses, triggered effects, and
              destruction effects remain manual.
            </p>
            <a className="pb-link" href={`/library/equipment/${staffEffect.id}`}>
              Open the full item page
            </a>
          </div>
        </Modal>
      ) : null}
      {staffCharge ? (
        <Modal
          open
          onClose={() => setStaffCharge(null)}
          title={`Charge ${staffCharge.name}`}
          subtitle="Expend a spell slot during daily preparations"
          elevated={mode === "overlay"}
          footer={
            <Button variant="ghost" onClick={() => setStaffCharge(null)}>
              Close
            </Button>
          }
        >
          <div className="stack">
            <p className="muted small">
              A staff holds up to 5 charges. Choose the rank of the spell slot you expend; mark the
              slot manually if your table tracks it.
            </p>
            <div className="chip-row">
              {Array.from(
                { length: Math.min(5, Math.max(0, derived.maxSpellRank)) },
                (_, index) => index + 1
              ).map((rank) => (
                <Button key={rank} size="sm" onClick={() => void chargeStaff(staffCharge, rank)}>
                  Expend rank {rank}
                </Button>
              ))}
            </div>
            <div>
              <Button variant="ghost" size="sm" onClick={() => void chargeStaff(staffCharge, 0)}>
                Clear charges
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}
      {ritualView ? (
        <Modal
          open
          onClose={() => setRitualView(null)}
          title={ritualView.name}
          subtitle={`Ritual · Rank ${ritualView.rank}`}
          elevated={mode === "overlay"}
          wide
          footer={
            <Button variant="ghost" onClick={() => setRitualView(null)}>
              Close
            </Button>
          }
        >
          {(() => {
            const primary = ritualPrimaryCheckInfo(ritualView.description, ritualView.ritualData);
            const detected = primary?.skills[0] ?? null;
            const selected = draft.spells.ritualSkills?.[ritualView.id] ?? "";
            const seen = new Set<string>();
            const options = [
              ...(derived?.skills ?? []).map((skill) => ({
                value: skill.id,
                label: skill.name,
              })),
              ...(derived?.lore ?? []).map((lore) => ({
                value: lore.name,
                label: lore.name,
              })),
            ].filter((option) => {
              if (seen.has(option.value)) return false;
              seen.add(option.value);
              return true;
            });
            return (
              <div className="stack">
                <div className="chip-row">
                  <Tag>Rank {ritualView.rank}</Tag>
                  {ritualView.actions ? <Tag>{ritualView.actions}</Tag> : null}
                </div>
                {ritualView.cost ? (
                  <p>
                    <strong>Cost</strong> {ritualView.cost}
                  </p>
                ) : null}
                {ritualView.requirements ? (
                  <p>
                    <strong>Requirements</strong> {ritualView.requirements}
                  </p>
                ) : null}
                {primary ? (
                  <p>
                    <strong>Primary check</strong> {primary.text}
                  </p>
                ) : null}
                {ritualView.ritualData?.secondaryCasters ? (
                  <p>
                    <strong>Secondary casters</strong> {ritualView.ritualData.secondaryCasters}
                    {ritualView.ritualData.secondaryChecks
                      ? ` — ${ritualView.ritualData.secondaryChecks}`
                      : ""}
                  </p>
                ) : null}
                <Field
                  label="Primary check"
                  hint={
                    primary
                      ? `${primary.structured ? "Compendium" : "Detected"} primary check: ${primary.text}.`
                      : "The data does not name a primary check. Choose one manually."
                  }
                >
                  <Select
                    value={selected}
                    onChange={(event) => void setRitualSkill(ritualView.id, event.target.value)}
                  >
                    <option value="">
                      {primary && primary.skills.length > 1
                        ? `Choose one of: ${primary.skills.map(titleCase).join(", ")}`
                        : detected
                          ? `Use detected: ${titleCase(detected)}`
                          : "Choose a skill…"}
                    </option>
                    {options.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <div>
                  <Button size="sm" onClick={() => rollRitual(ritualView)}>
                    Roll primary check
                  </Button>
                </div>
                <RichText html={ritualView.description} />
              </div>
            );
          })()}
        </Modal>
      ) : null}
      <Modal
        open={Boolean(customItemView)}
        onClose={() => setCustomItemView(null)}
        title={customItemView?.name ?? "Custom item"}
        subtitle="Custom inventory item"
        elevated={mode === "overlay"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setCustomItemView(null)}>
              Close
            </Button>
            {customItemView && canEdit ? (
              <Button
                variant="danger"
                onClick={() => {
                  if (customItemView) void removeCustomItem(customItemView.id);
                }}
              >
                Remove from inventory
              </Button>
            ) : null}
          </>
        }
      >
        <p className="custom-item-description">
          {customItemView?.description || "No description recorded."}
        </p>
      </Modal>
      <Modal
        open={Boolean(conflict)}
        onClose={() => undefined}
        closeOnBackdrop={false}
        title="This sheet changed elsewhere"
        subtitle="Another tab, device, or the GM saved this character while you were editing."
        elevated={mode === "overlay"}
        footer={
          <>
            <Button variant="ghost" onClick={() => void applyServerVersion()}>
              Reload their version
            </Button>
            <Button
              variant="primary"
              icon={<CircleAlert size={15} />}
              onClick={() => void keepLocalVersion()}
            >
              Keep my changes
            </Button>
          </>
        }
      >
        <p className="muted small">
          Reloading replaces your unsaved edits with the version saved{" "}
          {conflict ? new Date(conflict.updatedAt).toLocaleString() : "on the server"}. Keeping your
          changes overwrites that newer save.
        </p>
      </Modal>
      <CompendiumPreviewModal
        href={previewPath}
        elevated={mode === "overlay"}
        onClose={() => setPreviewPath(null)}
      />
    </div>
  );
}
