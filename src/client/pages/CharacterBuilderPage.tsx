import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type MouseEvent,
} from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Backpack,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  Coins,
  Dice5,
  Download,
  Dna,
  FileUp,
  FlaskConical,
  Loader2,
  Minus,
  Plus,
  ScrollText,
  Shield,
  Sparkles,
  Swords,
  Trash2,
  TrendingUp,
  UserRound,
  Users,
} from "lucide-react";
import {
  ABILITIES,
  ABILITY_DESCRIPTIONS,
  ABILITY_LABELS,
  ABILITY_SHORT,
  PROFICIENCY_NAMES,
  SIZES,
  SKILLS,
  SKILL_BY_ID,
  VISION_LABELS,
  type AbilityKey,
  type Ancestry,
  type Background,
  type CampaignRuleset,
  type CharacterContext,
  type CharacterDraft,
  type CharacterRecord,
  type ClassData,
  type ContentMode,
  type Deity,
  type DerivedCharacter,
  type Equipment,
  type Feat,
  type Heritage,
  type SkillId,
  type Spell,
} from "../../shared/types";
import {
  abilityMod,
  addKnownSpellAtRank,
  animistApparitionSlots,
  applicableChoiceGroups,
  casterInfo,
  classKeyOptions,
  computeCharacter,
  deitySkillOptions,
  emptyCharacterDraft,
  featSlotsFor,
  flexibleBoosts,
  grantedTrainedSkills,
  knownSpellRanks,
  normalizeCharacterDraft,
  requiredExtraSkills,
  selectedChoiceOptions,
  selectedDeitySkill,
  signed,
  skillRankCap,
  spellRepertoireLimits,
  spellSlotsFor,
  sourceSpellIds,
  startingWealthCp,
  titleCase,
  traitLabel,
  weaponDamageLabel,
  withSourceSpellIds,
} from "../../shared/rules";
import { api, ApiError, formatCp } from "../api";
import { errorMessage } from "../stores";
import { useToasts } from "../stores";
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  PageEyebrow,
  ProgressBar,
  RichText,
  Select,
  Spinner,
  Stat,
  Tag,
  Textarea,
  Toggle,
} from "../components/ui";
import {
  DeityPicker,
  EquipmentPicker,
  FeatPicker,
  SpellPicker,
} from "../components/builder/pickers";
import { ContentSourceToggle } from "../components/builder/ContentSourceToggle";
import { RunePicker } from "../components/builder/RunePicker";
import { PortraitPicker } from "../components/PortraitPicker";
import {
  STEPS,
  type BuilderProps,
  type Picker,
  type StaticData,
  type StepId,
} from "../components/builder/shared";
import { AncestryStep } from "../components/builder/steps/AncestryStep";
import { HeritageStep } from "../components/builder/steps/HeritageStep";
import { BackgroundStep } from "../components/builder/steps/BackgroundStep";
import { ClassStep } from "../components/builder/steps/ClassStep";
import { AbilitiesStep } from "../components/builder/steps/AbilitiesStep";
import { SkillsStep } from "../components/builder/steps/SkillsStep";
import { FeatsStep } from "../components/builder/steps/FeatsStep";
import { SpellsStep } from "../components/builder/steps/SpellsStep";
import { GearStep } from "../components/builder/steps/GearStep";
import { DetailsStep } from "../components/builder/steps/DetailsStep";
import { ReviewStep } from "../components/builder/steps/ReviewStep";
import {
  isCoreSource,
  rulesetContentMode,
  rulesetIncludesLegacy,
  rulesetLabel,
} from "../../shared/content";
import {
  buildLevelUpWizardSteps,
  levelUpCurrentHp,
  type LevelUpChoice,
} from "../../shared/levelup";
import { summarizeRunes } from "../../shared/runes";
import { heritageFeatTraits } from "../../shared/heritage";

type LevelUpTask = Omit<LevelUpChoice, "step"> & {
  step: StepId;
  kind: "abilities" | "skills" | "feat" | "spells" | "class";
  category?: "ancestry" | "class" | "skill" | "general";
  target?: "freeArchetype";
};

export function CharacterBuilderPage({
  characterId,
  onClose,
  onDeleted,
}: {
  characterId?: string;
  onClose?: () => void;
  onDeleted?: () => void;
} = {}) {
  const params = useParams<{ id: string }>();
  const id = characterId ?? params.id;
  const navigate = useNavigate();
  const toast = useToasts((state) => state.push);
  const [character, setCharacter] = useState<CharacterRecord | null>(null);
  const [draft, setDraft] = useState<CharacterDraft | null>(null);
  const [context, setContext] = useState<CharacterContext>({
    feats: {},
    spells: {},
    equipment: {},
  });
  const [staticData, setStaticData] = useState<StaticData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [step, setStep] = useState<StepId>("ancestry");
  const [picker, setPicker] = useState<Picker>(null);
  const [levelUpOpen, setLevelUpOpen] = useState(false);
  const [levelUpStep, setLevelUpStep] = useState(0);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "dirty" | "error">("saved");
  const [pendingSheet, setPendingSheet] = useState(false);
  const [conflict, setConflict] = useState<CharacterRecord | null>(null);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [portraitOpen, setPortraitOpen] = useState(false);
  const initialized = useRef(false);
  const skipInitialSave = useRef(true);
  const saveInFlight = useRef(false);
  const saveQueued = useRef(false);
  const characterRef = useRef<CharacterRecord | null>(null);
  const draftRef = useRef<CharacterDraft | null>(null);
  const dirtyRef = useRef(false);
  const conflictRef = useRef(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    (async () => {
      try {
        const [ancestries, heritages, backgrounds, classes, characterResult] = await Promise.all([
          api<{ items: Ancestry[] }>("/api/compendium/ancestries"),
          api<{ items: Heritage[] }>("/api/compendium/heritages"),
          api<{ items: Background[] }>("/api/compendium/backgrounds"),
          api<{ items: ClassData[] }>("/api/compendium/classes"),
          api<{ character: CharacterRecord }>(`/api/characters/${id}`),
        ]);
        if (cancelled) return;
        const normalized = normalizeCharacterDraft(
          characterResult.character.data,
          characterResult.character.name
        );
        const contextResult = await api<{ context: CharacterContext }>(
          `/api/characters/${id}/context`,
          {
            method: "POST",
            body: { draft: normalized },
          }
        );
        if (cancelled) return;
        if (characterResult.character.permissions?.canEdit === false) {
          navigate(`/characters/${id}`, { replace: true });
          return;
        }
        setStaticData({
          ancestries: ancestries.items,
          heritages: heritages.items,
          backgrounds: backgrounds.items,
          classes: classes.items,
        });
        setCharacter(characterResult.character);
        characterRef.current = characterResult.character;
        setDraft(normalized);
        setContext(contextResult.context);
        initialized.current = true;
        document.title = `${normalized.name} · Runehall`;
        // Start on the first chapter that still has an unresolved error.
        const initialDerived = computeCharacter(normalized, contextResult.context);
        const firstIssue = initialDerived.validation.find(
          (issue) =>
            issue.severity === "error" &&
            issue.step &&
            STEPS.some((entry) => entry.id === issue.step)
        );
        setStep((firstIssue?.step as StepId | undefined) ?? "review");
      } catch (err) {
        if (!cancelled) setError(errorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, navigate]);

  // The server context lags the debounced autosave by one request. Resolve the
  // core choices locally so selecting an ancestry, heritage, background, or
  // class immediately updates the step status and summary.
  useEffect(() => {
    if (!staticData || !draft) return;
    setContext((current) => {
      const ancestry = staticData.ancestries.find((entry) => entry.id === draft.ancestryId) ?? null;
      const heritage = staticData.heritages.find((entry) => entry.id === draft.heritageId) ?? null;
      const background =
        staticData.backgrounds.find((entry) => entry.id === draft.backgroundId) ?? null;
      const classData = staticData.classes.find((entry) => entry.id === draft.classId) ?? null;
      if (
        current.ancestry?.id === ancestry?.id &&
        current.heritage?.id === heritage?.id &&
        current.background?.id === background?.id &&
        current.classData?.id === classData?.id
      ) {
        return current;
      }
      return { ...current, ancestry, heritage, background, classData };
    });
  }, [draft?.ancestryId, draft?.heritageId, draft?.backgroundId, draft?.classId, staticData]);

  const derived = useMemo(
    () => (draft ? computeCharacter(draft, context) : null),
    [draft, context]
  );
  const previousMaxHpRef = useRef<number | null>(null);

  useEffect(() => {
    previousMaxHpRef.current = null;
  }, [id]);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const saveDraft = useCallback(
    async (force = false) => {
      if (!id) return;
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
            // Save the authoritative draft first. A context refresh failure
            // must not leave the client on an old revision and manufacture a
            // false 409 on the next save.
            const saveResult = await api<{ character: CharacterRecord }>(`/api/characters/${id}`, {
              method: "PUT",
              body: forceOnce
                ? { data: currentDraft, force: true }
                : { data: currentDraft, expectedRevision: characterRef.current?.revision },
            });
            forceOnce = false;
            characterRef.current = saveResult.character;
            setCharacter(saveResult.character);
            try {
              const contextResult = await api<{ context: CharacterContext }>(
                `/api/characters/${id}/context`,
                { method: "POST", body: { draft: currentDraft } }
              );
              setContext(contextResult.context);
            } catch {
              // Keep the optimistic/local context; the next save retries it.
            }
            setConflict(null);
            conflictRef.current = false;
            if (draftRef.current === currentDraft) {
              setSaveState("saved");
              dirtyRef.current = false;
              document.title = `${currentDraft.name} · Runehall`;
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
      }
    },
    [id, toast]
  );

  useEffect(() => {
    const flush = () => {
      if (!dirtyRef.current || !id || !draftRef.current) return;
      // A route change or tab close can happen before the 650ms autosave timer
      // fires. Send the latest draft with keepalive so the edit is not lost.
      void fetch(`/api/characters/${id}`, {
        method: "PUT",
        credentials: "include",
        keepalive: true,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          data: draftRef.current,
          ...(characterRef.current
            ? { expectedRevision: characterRef.current.revision }
            : { force: true }),
        }),
      });
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [id]);

  useEffect(() => {
    if (!pendingSheet) return;
    if (saveState === "saved" && !dirtyRef.current && id) {
      setPendingSheet(false);
      if (onClose) onClose();
      else navigate(`/characters/${id}`);
    } else if (saveState === "error") {
      setPendingSheet(false);
    }
  }, [pendingSheet, saveState, id, navigate, onClose]);

  const openSheet = (event: MouseEvent<HTMLAnchorElement>) => {
    if (saveState === "saved" && !dirtyRef.current) return;
    event.preventDefault();
    setPendingSheet(true);
    void saveDraft();
  };

  useEffect(() => {
    if (!draft || !initialized.current || !id) return;
    if (skipInitialSave.current || conflictRef.current) return;
    setSaveState("dirty");
    const timer = window.setTimeout(() => void saveDraft(), 650);
    return () => window.clearTimeout(timer);
  }, [draft, id, saveDraft]);

  const applyServerVersion = async () => {
    if (!conflict || !id) return;
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
    setSaveState("dirty");
    dirtyRef.current = true;
    void saveDraft(true);
  };

  const update = (updater: (current: CharacterDraft) => CharacterDraft) => {
    skipInitialSave.current = false;
    dirtyRef.current = true;
    setDraft((current) => {
      if (!current) return current;
      const next = updater(current);
      draftRef.current = next;
      return next;
    });
  };

  // A level-up can raise Constitution or add Toughness after the level was
  // applied. Keep a wounded character's current HP in step with the new
  // maximum instead of leaving them permanently under-healed.
  useEffect(() => {
    if (!derived || !draft) return;
    const maxHp = derived.maxHp;
    const previousMaxHp = previousMaxHpRef.current;
    previousMaxHpRef.current = maxHp;
    if (previousMaxHp === null || previousMaxHp === maxHp) return;
    const currentHp = draft.play.hp;
    if (currentHp === null || currentHp <= 0) return;
    const delta = maxHp - previousMaxHp;
    if (!delta) return;
    update((current) => {
      if (current.play.hp === null || current.play.hp <= 0) return current;
      const nextHp = Math.max(1, Math.min(maxHp, current.play.hp + delta));
      return nextHp === current.play.hp
        ? current
        : { ...current, play: { ...current.play, hp: nextHp } };
    });
  }, [derived, draft, update]);

  const choosePortrait = async (url: string | null) => {
    update((current) => ({ ...current, portraitUrl: url }));
    toast(url ? "Portrait updated." : "Portrait removed.", "success");
  };

  const exportJson = () => {
    if (!draft) return;
    const blob = new Blob(
      [
        JSON.stringify(
          {
            format: "runehall-character",
            version: 1,
            exportedAt: new Date().toISOString(),
            data: draft,
          },
          null,
          2
        ),
      ],
      { type: "application/json" }
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${draft.name.replace(/[^a-z0-9-_ ]/gi, "").trim() || "character"}.runehall.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const importJson = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text());
      if (
        !parsed ||
        parsed.format !== "runehall-character" ||
        parsed.version !== 1 ||
        !parsed.data
      ) {
        throw new Error("Choose a Runehall character export (.runehall.json).");
      }
      if (!window.confirm("Replace this character with the imported file?")) return;
      const normalized = normalizeCharacterDraft(parsed.data, file.name.replace(/\.json$/i, ""));
      update((current) => ({
        ...normalized,
        portraitUrl: current.portraitUrl ?? normalized.portraitUrl,
      }));
      toast("Character imported. Review the choices before your next session.", "success");
      setStep("review");
    } catch (err) {
      toast(`Could not import that file: ${errorMessage(err)}`, "error");
    }
  };

  const removeCharacter = async () => {
    if (!draft) return;
    if (!window.confirm(`Delete ${draft.name}? This cannot be undone.`)) return;
    try {
      await api(`/api/characters/${id}`, { method: "DELETE" });
      toast("Character deleted.", "success");
      if (onDeleted) onDeleted();
      else navigate("/campaigns");
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  if (loading)
    return (
      <div className="builder-loading">
        <Spinner label="Opening the character forge…" />
      </div>
    );
  if (error) {
    return (
      <div className="page">
        <EmptyState
          icon={<CircleAlert size={28} />}
          title="Could not open that character"
          description={error}
          action={<Button onClick={() => navigate("/campaigns")}>Back to campaigns</Button>}
        />
      </div>
    );
  }
  if (!draft || !derived || !staticData) return null;

  const campaignRuleset = character?.campaignRuleset ?? null;
  const contentMode = campaignRuleset ? rulesetContentMode(campaignRuleset) : draft.contentMode;
  const contentModeLocked = Boolean(campaignRuleset);
  const legacyDefault = campaignRuleset
    ? rulesetIncludesLegacy(campaignRuleset)
    : draft.includeLegacy;
  const legacyLocked = Boolean(campaignRuleset);
  const nextLevel = Math.min(20, draft.level + 1);
  const canAdvance = character?.permissions?.canAdvance !== false;
  const levelUpBlocked = derived.validation.some((issue) => issue.severity === "error");
  const nextHp =
    derived.maxHp + Math.max(1, (context.classData?.hp ?? 0) + derived.abilityMods.con);
  const levelUpItems: LevelUpTask[] = [];
  if (nextLevel !== draft.level) {
    for (const milestone of [5, 10, 15, 20]) {
      if (nextLevel === milestone) {
        levelUpItems.push({
          id: `abilities-${nextLevel}`,
          label: "Ability boosts",
          detail: "Choose four ability boosts for this milestone.",
          step: "abilities",
          kind: "abilities",
        });
      }
    }
    for (const level of context.classData?.skillIncreaseLevels ?? []) {
      if (level === nextLevel) {
        levelUpItems.push({
          id: `skills-${nextLevel}`,
          label: "Skill increase",
          detail: "Raise one skill’s proficiency rank.",
          step: "skills",
          kind: "skills",
        });
      }
    }
    const newFeatSlots = featSlotsFor(
      context.classData,
      nextLevel,
      Boolean(context.freeArchetype)
    ).filter((slot) => slot.level === nextLevel);
    for (const slot of newFeatSlots) {
      levelUpItems.push({
        id: `feat-${slot.freeArchetype ? "free" : slot.category}-${slot.level}`,
        label: slot.freeArchetype
          ? "Free archetype feat"
          : `${slot.category === "class" ? "Class" : slot.category === "ancestry" ? "Ancestry" : slot.category === "skill" ? "Skill" : "General"} feat`,
        detail: `Choose a level ${slot.level} feat for this slot.`,
        step: "feats",
        kind: "feat",
        category: slot.category,
        target: slot.freeArchetype ? "freeArchetype" : undefined,
      });
    }
    const currentCaster = casterInfo(context.classData);
    if (currentCaster.progression !== "none") {
      const currentRank = derived.maxSpellRank;
      const newSlots = spellSlotsFor(nextLevel, currentCaster.progression, context.classData?.name);
      const apparitionRank =
        context.classData?.name.toLowerCase() === "animist"
          ? animistApparitionSlots(nextLevel).length
          : 0;
      const newRank = Math.max(newSlots?.length ?? currentRank, apparitionRank);
      if (newRank > currentRank) {
        levelUpItems.push({
          id: `spells-${newRank}`,
          label: `Rank ${newRank} spells`,
          detail: "Your highest spell rank increases. Review your spellbook and slots.",
          step: "spells",
          kind: "spells",
        });
      }
    }
    for (const feature of context.classData?.features ?? []) {
      if (feature.level === nextLevel) {
        levelUpItems.push({
          id: `class-${feature.name}`,
          label: feature.name,
          detail: "New class feature.",
          step: "class",
          kind: "class",
        });
      }
    }
  }
  const levelUpWizard = buildLevelUpWizardSteps({
    fromLevel: draft.level,
    toLevel: nextLevel,
    hpBefore: derived.maxHp,
    hpAfter: nextHp,
    choices: levelUpItems,
  });
  const currentLevelUpStep =
    levelUpWizard[Math.max(0, Math.min(levelUpStep, levelUpWizard.length - 1))];
  const issues = derived.validation;
  const stepErrors = (stepId: StepId) =>
    issues.filter((issue) => issue.step === stepId && issue.severity === "error");
  const stepStatus = (stepId: StepId): "done" | "error" | "pending" | "optional" => {
    if (stepId === "spells" && casterInfo(context.classData).progression === "none")
      return "optional";
    if (stepErrors(stepId).length) return "error";
    const done =
      stepId === "ancestry"
        ? Boolean(draft.ancestryId)
        : stepId === "heritage"
          ? Boolean(draft.heritageId)
          : stepId === "background"
            ? Boolean(draft.backgroundId)
            : stepId === "class"
              ? Boolean(draft.classId) && !issues.some((i) => i.step === "class")
              : stepId === "abilities"
                ? !issues.some((i) => i.step === "abilities")
                : stepId === "skills"
                  ? !issues.some((i) => i.step === "skills")
                  : stepId === "feats"
                    ? !issues.some((i) => i.step === "feats")
                    : stepId === "spells"
                      ? !issues.some((i) => i.step === "spells")
                      : stepId === "gear"
                        ? true
                        : stepId === "details"
                          ? Boolean(draft.name.trim())
                          : !issues.some((i) => i.severity === "error");
    return done ? "done" : "pending";
  };
  const errors = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity === "warning");
  const outstandingChoices = errors.map((issue, index) => {
    const entry = STEPS.find((candidate) => candidate.id === issue.step) ?? STEPS[STEPS.length - 1];
    return {
      id: `${entry.id}-${index}-${issue.message}`,
      step: entry.id,
      label: entry.label,
      detail: issue.message,
    };
  });
  const stepIndex = STEPS.findIndex((entry) => entry.id === step);
  const go = (direction: -1 | 1) => {
    const next = STEPS[stepIndex + direction];
    if (next) setStep(next.id);
  };
  const applyLevel = (level: number) => {
    update((current) => {
      const afterDraft = { ...current, level };
      const before = computeCharacter(current, context).maxHp;
      const after = computeCharacter(afterDraft, context).maxHp;
      const hp =
        level > current.level ? levelUpCurrentHp(current.play.hp, before, after) : current.play.hp;
      const wealthBudgetCp = current.wealthBudgetCp === null ? null : startingWealthCp(level);
      return {
        ...afterDraft,
        wealthBudgetCp,
        play: { ...current.play, hp },
      };
    });
  };
  const completeLevelUp = (targetStep?: StepId) => {
    if (nextLevel === draft.level) return;
    applyLevel(nextLevel);
    setLevelUpOpen(false);
    setStep(targetStep ?? levelUpItems[0]?.step ?? "review");
    toast(`Level ${nextLevel} reached. Review the new choices.`, "success");
  };

  const renderStep = () => {
    const props: BuilderProps = {
      draft,
      update,
      derived,
      context,
      staticData,
      campaignRuleset,
      contentMode,
      contentModeLocked,
      legacyDefault,
      legacyLocked,
      openPicker: setPicker,
      onChoosePortrait: () => setPortraitOpen(true),
      setStep,
    };
    switch (step) {
      case "ancestry":
        return <AncestryStep {...props} />;
      case "heritage":
        return <HeritageStep {...props} />;
      case "background":
        return <BackgroundStep {...props} />;
      case "class":
        return <ClassStep {...props} />;
      case "abilities":
        return <AbilitiesStep {...props} />;
      case "skills":
        return <SkillsStep {...props} />;
      case "feats":
        return <FeatsStep {...props} />;
      case "spells":
        return <SpellsStep {...props} />;
      case "gear":
        return <GearStep {...props} />;
      case "details":
        return <DetailsStep {...props} />;
      case "review":
        return (
          <ReviewStep
            {...props}
            onExport={exportJson}
            onImport={importJson}
            onDelete={removeCharacter}
          />
        );
    }
  };

  return (
    <div className="builder-page">
      <header className="builder-header">
        <div className="builder-header-left">
          {onClose ? (
            <button
              type="button"
              className="icon-btn"
              title="Back to sheet"
              aria-label="Back to sheet"
              onClick={() => {
                if (saveState === "saved" && !dirtyRef.current) onClose();
                else setPendingSheet(true);
              }}
            >
              <ArrowLeft size={18} />
            </button>
          ) : (
            <Link
              to={character?.campaignId ? `/campaigns/${character.campaignId}` : "/campaigns"}
              className="icon-btn"
              title="Back to campaigns"
              aria-label="Back to campaigns"
            >
              <ArrowLeft size={18} />
            </Link>
          )}
          <div className="builder-title">
            <Input
              className="builder-name-input"
              value={draft.name}
              onChange={(event) => update((current) => ({ ...current, name: event.target.value }))}
              aria-label="Character name"
              maxLength={120}
            />
            <span className="builder-meta">
              <span className="tiny muted">
                {saveState === "saved"
                  ? "Saved"
                  : saveState === "saving"
                    ? "Saving…"
                    : saveState === "error"
                      ? "Save failed"
                      : "Unsaved changes"}
              </span>
              {campaignRuleset ? <Badge tone="gold">{rulesetLabel(campaignRuleset)}</Badge> : null}
            </span>
          </div>
        </div>
        <div className="builder-header-actions">
          {!canAdvance ? (
            <span title="Only the campaign GM can change this character's level.">
              <Badge tone="neutral">GM levels up</Badge>
            </span>
          ) : null}
          <Field label="Level">
            <Select
              value={draft.level}
              onChange={(event) => applyLevel(Number(event.target.value))}
              className="level-select"
              disabled={!canAdvance}
            >
              {Array.from({ length: 20 }, (_, index) => index + 1).map((level) => (
                <option key={level} value={level}>
                  Level {level}
                </option>
              ))}
            </Select>
          </Field>
          <Button
            variant="secondary"
            size="sm"
            icon={<TrendingUp size={15} />}
            onClick={() => {
              setLevelUpStep(0);
              setLevelUpOpen(true);
            }}
            disabled={!canAdvance || draft.level >= 20 || levelUpBlocked}
            title={
              !canAdvance
                ? "The campaign GM controls level-ups."
                : levelUpBlocked
                  ? "Resolve the remaining required choices before leveling up."
                  : undefined
            }
          >
            Level up
          </Button>
          <Link to={`/characters/${id}`} className="btn btn-secondary btn-sm" onClick={openSheet}>
            <ScrollText size={15} /> Sheet
          </Link>
          <Button
            variant="ghost"
            size="sm"
            icon={<FileUp size={15} />}
            onClick={() => document.getElementById("builder-import")?.click()}
          >
            Import
          </Button>
          <input
            id="builder-import"
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              const file = event.target.files?.[0];
              if (file) void importJson(file);
              event.target.value = "";
            }}
          />
        </div>
      </header>

      <div className="builder-shell">
        <aside className="builder-steps">
          <div className="builder-steps-title">Chapters</div>
          {STEPS.map((entry, index) => {
            const status = stepStatus(entry.id);
            return (
              <button
                key={entry.id}
                type="button"
                className={`builder-step ${step === entry.id ? "is-active" : ""} is-${status}`}
                onClick={() => setStep(entry.id)}
                aria-label={`${entry.label}, ${status === "done" ? "complete" : status === "error" ? "needs attention" : status === "optional" ? "optional" : "pending"}`}
                title={`${entry.label} · ${status === "done" ? "complete" : status === "error" ? "needs attention" : status === "optional" ? "optional" : "pending"}`}
              >
                <span className="builder-step-num">
                  {status === "done" ? <Check size={13} /> : index + 1}
                </span>
                <span className="builder-step-icon">{entry.icon}</span>
                <span className="builder-step-label">{entry.short}</span>
                {status === "error" ? <span className="builder-step-dot" /> : null}
                {status === "optional" ? <span className="tiny muted">opt</span> : null}
              </button>
            );
          })}
          <div className="builder-steps-help">
            <BookOpen size={14} />
            <span>Every choice autosaves.</span>
          </div>
        </aside>

        <main className="builder-content">
          {outstandingChoices.length ? (
            <div className={`levelup-checklist ${checklistOpen ? "is-open" : ""}`}>
              <button
                type="button"
                className="levelup-checklist-head"
                aria-expanded={checklistOpen}
                onClick={() => setChecklistOpen((current) => !current)}
              >
                <div>
                  <span className="page-eyebrow">CHARACTER CHECKLIST</span>
                  <strong>
                    {outstandingChoices.length} required choice
                    {outstandingChoices.length === 1 ? "" : "s"} remaining
                  </strong>
                </div>
                <span className="levelup-checklist-toggle">
                  {checklistOpen ? "Hide details" : "Show details"}
                  <ChevronDown size={14} className={checklistOpen ? "is-open" : ""} />
                </span>
              </button>
              {checklistOpen ? (
                <div className="levelup-checklist-items">
                  {outstandingChoices.map((task) => (
                    <button
                      key={task.id}
                      type="button"
                      className="levelup-checklist-item"
                      onClick={() => setStep(task.step)}
                    >
                      <span className="levelup-checklist-check" />
                      <span>
                        <strong>{task.label}</strong>
                        <small>{task.detail}</small>
                      </span>
                      <ArrowRight size={13} />
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
          {renderStep()}
          <div className="builder-nav-mobile">
            <Button variant="ghost" onClick={() => go(-1)} disabled={stepIndex <= 0}>
              <ArrowLeft size={15} /> Back
            </Button>
            <span className="tiny muted">
              {stepIndex + 1} / {STEPS.length}
            </span>
            <Button
              variant="secondary"
              onClick={() => go(1)}
              disabled={stepIndex >= STEPS.length - 1}
            >
              Next <ArrowRight size={15} />
            </Button>
          </div>
        </main>

        <aside className="builder-summary">
          <Card className="summary-hero">
            <div className="summary-avatar-wrap">
              <Avatar name={draft.name} src={draft.portraitUrl} size={70} />
              <button
                type="button"
                className="summary-portrait-edit"
                title="Choose portrait"
                onClick={() => setPortraitOpen(true)}
              >
                <UserRound size={13} />
              </button>
            </div>
            <h2>{draft.name || "Unnamed Hero"}</h2>
            <p className="muted small">
              Level {draft.level}
              {context.classData ? ` · ${context.classData.name}` : ""}
            </p>
            <p className="tiny muted">
              {[context.ancestry?.name, context.heritage?.name, context.background?.name]
                .filter(Boolean)
                .join(" · ") || "Choose an ancestry, heritage, and background."}
            </p>
            <div className="summary-ability-row">
              {ABILITIES.map((ability) => (
                <div key={ability}>
                  <span>{ABILITY_SHORT[ability]}</span>
                  <strong>{derived.abilities[ability]}</strong>
                  <em>{signed(derived.abilityMods[ability])}</em>
                </div>
              ))}
            </div>
            <div className="summary-stat-grid">
              <Stat label="HP" value={derived.maxHp} tone="red" />
              <Stat label="AC" value={derived.ac} tone="gold" />
              <Stat label="Speed" value={`${derived.speed}'`} />
              <Stat label="Perception" value={signed(derived.perception)} />
              <Stat label="Initiative" value={signed(derived.initiative)} />
            </div>
            <div className="summary-issues">
              {errors.length ? (
                <span className="danger-text">
                  <CircleAlert size={14} /> {errors.length} to fix
                </span>
              ) : (
                <span className="gold-text">
                  <CheckCircle2 size={14} /> Ready
                </span>
              )}
              {warnings.length ? (
                <span className="muted tiny">
                  {warnings.length} warning{warnings.length === 1 ? "" : "s"}
                </span>
              ) : null}
            </div>
            {onClose ? (
              <button
                type="button"
                className="btn btn-gold btn-sm btn-block"
                style={{ marginTop: 11 }}
                onClick={() => setPendingSheet(true)}
              >
                <ScrollText size={14} /> Back to character sheet
              </button>
            ) : (
              <Link
                to={`/characters/${id}`}
                className="btn btn-gold btn-sm btn-block"
                style={{ marginTop: 11 }}
                onClick={openSheet}
              >
                <ScrollText size={14} /> Open character sheet
              </Link>
            )}
          </Card>
          <Card className="summary-wealth">
            {derived.wealth.budget !== null ? (
              <>
                <div className="row-between">
                  <span className="tiny muted">Gear budget</span>
                  <strong className="tiny">{formatCp(derived.wealth.remaining ?? 0)} left</strong>
                </div>
                <ProgressBar
                  value={Math.min(derived.wealth.committed, derived.wealth.budget)}
                  max={Math.max(1, derived.wealth.budget)}
                />
              </>
            ) : (
              <>
                <div className="row-between">
                  <span className="tiny muted">Gear value</span>
                  <strong className="tiny">{formatCp(derived.wealth.spent)}</strong>
                </div>
                <div className="row-between" style={{ marginTop: 4 }}>
                  <span className="tiny muted">Purse</span>
                  <strong className="tiny">{formatCp(derived.wealth.currencyCp)}</strong>
                </div>
              </>
            )}
            <div className="row-between" style={{ marginTop: 8 }}>
              <span className="tiny muted">Bulk</span>
              <strong className="tiny">
                {derived.bulk.total} / {derived.bulk.capacity}
              </strong>
            </div>
          </Card>
          <div className="summary-links">
            <button type="button" onClick={() => setStep("review")}>
              <CheckCircle2 size={14} /> Review &amp; export
            </button>
            <button
              type="button"
              onClick={() => {
                void removeCharacter();
              }}
              className="danger-text"
            >
              <Trash2 size={14} /> Delete character
            </button>
          </div>
        </aside>
      </div>

      {picker?.kind === "feat" ? (
        <FeatPicker
          open
          onClose={() => setPicker(null)}
          category={picker.category}
          slotLevel={picker.level}
          target={picker.target === "freeArchetype" ? "freeArchetype" : undefined}
          ancestryTrait={heritageFeatTraits(context.heritage, context.ancestry).join(",")}
          classTrait={context.classData?.name.toLowerCase()}
          draft={draft}
          context={context}
          expanded={contentMode === "expanded"}
          onExpandedChange={(mode) => update((current) => ({ ...current, contentMode: mode }))}
          contentModeLocked={contentModeLocked}
          legacyDefault={legacyDefault}
          legacyLocked={legacyLocked}
          onLegacyChange={(value) => update((current) => ({ ...current, includeLegacy: value }))}
          onSelect={(feat) => {
            setContext((current) => ({
              ...current,
              feats: { ...current.feats, [feat.id]: feat },
            }));
            update((current) => ({
              ...current,
              feats:
                picker.target === "extras"
                  ? {
                      ...current.feats,
                      extras: current.feats.extras.length
                        ? [feat.id]
                        : [...current.feats.extras, feat.id],
                    }
                  : picker.target === "freeArchetype"
                    ? {
                        ...current.feats,
                        freeArchetype: {
                          ...current.feats.freeArchetype,
                          [String(picker.level)]: feat.id,
                        },
                      }
                    : {
                        ...current.feats,
                        [picker.category]: {
                          ...current.feats[picker.category],
                          [String(picker.level)]: feat.id,
                        },
                      },
            }));
          }}
        />
      ) : null}
      {picker?.kind === "spell" ? (
        <SpellPicker
          open
          onClose={() => setPicker(null)}
          rank={Number.isFinite(picker.rank) ? picker.rank : null}
          maxRank={
            picker.maxRank ?? (picker.focus ? Math.max(1, Math.ceil(draft.level / 2)) : null)
          }
          tradition={
            picker.target === "rituals" || picker.target === "innate"
              ? null
              : derived.casterTradition
          }
          focus={picker.focus}
          ritual={picker.target === "rituals"}
          classTrait={context.classData?.name.toLowerCase()}
          expanded={contentMode === "expanded"}
          onExpandedChange={(mode) => update((current) => ({ ...current, contentMode: mode }))}
          contentModeLocked={contentModeLocked}
          legacyDefault={legacyDefault}
          legacyLocked={legacyLocked}
          onLegacyChange={(value) => update((current) => ({ ...current, includeLegacy: value }))}
          excludeIds={Array.from(
            new Set([
              ...derived.grantedSpells.map((spell) => spell.id),
              ...(picker.target === "cantrips"
                ? draft.spells.cantrips
                : picker.target === "focus"
                  ? draft.spells.focus
                  : picker.target === "rituals"
                    ? draft.spells.rituals
                    : picker.target === "innate"
                      ? draft.spells.innate
                      : picker.target === "knownAtRank" && picker.learnRank
                        ? draft.spells.known.filter((id) => {
                            const spell = context.spells[id];
                            return spell
                              ? knownSpellRanks(draft, spell).includes(picker.learnRank!)
                              : (draft.spells.knownRanks[id] ?? []).includes(picker.learnRank!);
                          })
                        : sourceSpellIds(draft, context.classData)),
            ])
          )}
          onSelect={(spell) => {
            setContext((current) => ({
              ...current,
              spells: { ...current.spells, [spell.id]: spell },
            }));
            update((current) => {
              if (picker.target === "knownAtRank") {
                return addKnownSpellAtRank(current, spell, picker.learnRank ?? spell.rank);
              }
              if (picker.target === "known") {
                const currentIds = sourceSpellIds(current, context.classData);
                if (currentIds.includes(spell.id)) return current;
                return withSourceSpellIds(current, context.classData, [...currentIds, spell.id]);
              }
              if (picker.target === "cantrips" && spell.rank !== 0) return current;
              const target =
                picker.target === "rituals"
                  ? current.spells.rituals
                  : picker.target === "innate"
                    ? current.spells.innate
                    : current.spells[picker.target];
              if (target.includes(spell.id)) return current;
              return {
                ...current,
                spells: {
                  ...current.spells,
                  ...(picker.target === "rituals"
                    ? { rituals: [...current.spells.rituals, spell.id] }
                    : picker.target === "innate"
                      ? { innate: [...current.spells.innate, spell.id] }
                      : { [picker.target]: [...target, spell.id] }),
                },
              };
            });
          }}
        />
      ) : null}
      {picker?.kind === "equipment" ? (
        <EquipmentPicker
          open
          onClose={() => setPicker(null)}
          level={draft.level}
          expanded={contentMode === "expanded"}
          onExpandedChange={(mode) => update((current) => ({ ...current, contentMode: mode }))}
          contentModeLocked={contentModeLocked}
          legacyDefault={legacyDefault}
          legacyLocked={legacyLocked}
          onLegacyChange={(value) => update((current) => ({ ...current, includeLegacy: value }))}
          onSelect={(item) => {
            setContext((current) => ({
              ...current,
              equipment: { ...current.equipment, [item.id]: item },
            }));
            update((current) => {
              const existing = current.equipment.find((entry) => entry.itemId === item.id);
              if (existing) {
                return {
                  ...current,
                  equipment: current.equipment.map((entry) =>
                    entry.itemId === item.id ? { ...entry, quantity: entry.quantity + 1 } : entry
                  ),
                };
              }
              return {
                ...current,
                equipment: [
                  ...current.equipment,
                  {
                    itemId: item.id,
                    quantity: 1,
                    equipped: Boolean(item.weapon || item.armor || item.shield),
                  },
                ],
              };
            });
          }}
        />
      ) : null}
      {picker?.kind === "deity" ? (
        <DeityPicker
          open
          onClose={() => setPicker(null)}
          expanded={contentMode === "expanded"}
          onExpandedChange={(mode) => update((current) => ({ ...current, contentMode: mode }))}
          contentModeLocked={contentModeLocked}
          legacyDefault={legacyDefault}
          legacyLocked={legacyLocked}
          onLegacyChange={(value) => update((current) => ({ ...current, includeLegacy: value }))}
          classData={context.classData}
          onSelect={(deity) => {
            setContext((current) => ({ ...current, deity }));
            update((current) => ({ ...current, deityId: deity.id, deitySkill: null }));
          }}
        />
      ) : null}
      <PortraitPicker
        open={portraitOpen}
        onClose={() => setPortraitOpen(false)}
        name={draft.name}
        value={draft.portraitUrl}
        campaignId={character?.campaignId}
        onSelect={choosePortrait}
        elevated
      />
      <Modal
        open={levelUpOpen}
        onClose={() => setLevelUpOpen(false)}
        elevated
        title={`Level ${draft.level} → ${nextLevel}`}
        subtitle={`Step ${Math.min(levelUpStep + 1, levelUpWizard.length)} of ${levelUpWizard.length} · ${currentLevelUpStep.title}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setLevelUpOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="secondary"
              onClick={() => setLevelUpStep((current) => Math.max(0, current - 1))}
              disabled={levelUpStep === 0}
            >
              Back
            </Button>
            {levelUpStep >= levelUpWizard.length - 1 ? (
              <Button
                variant="primary"
                icon={<TrendingUp size={15} />}
                onClick={() => completeLevelUp()}
                disabled={!canAdvance || levelUpBlocked}
              >
                Level up
              </Button>
            ) : (
              <Button
                variant="primary"
                onClick={() =>
                  setLevelUpStep((current) => Math.min(levelUpWizard.length - 1, current + 1))
                }
              >
                Next
              </Button>
            )}
          </>
        }
      >
        <div className="levelup-progress" aria-label="Level-up progress">
          {levelUpWizard.map((wizardStep, index) => (
            <span
              key={wizardStep.id}
              className={
                index === levelUpStep ? "is-current" : index < levelUpStep ? "is-done" : ""
              }
            >
              {index + 1}
            </span>
          ))}
        </div>
        <div className="levelup-step">
          <span className="page-eyebrow">
            {currentLevelUpStep.kind === "choice"
              ? "NEW CHOICE"
              : currentLevelUpStep.kind === "confirm"
                ? "CONFIRM"
                : "SUMMARY"}
          </span>
          <h3>{currentLevelUpStep.title}</h3>
          <p className="muted small">{currentLevelUpStep.detail}</p>

          {currentLevelUpStep.kind === "overview" ? (
            <>
              <div className="levelup-compare">
                <div>
                  <span className="tiny muted">Hit points</span>
                  <strong>{currentLevelUpStep.hpBefore}</strong>
                </div>
                <ArrowRight size={16} />
                <div>
                  <span className="tiny muted">After leveling</span>
                  <strong>{currentLevelUpStep.hpAfter}</strong>
                </div>
              </div>
              {levelUpItems.length ? (
                <ul className="levelup-choice-list">
                  {levelUpItems.map((item) => (
                    <li key={item.id}>
                      <strong>{item.label}</strong>
                      <span className="tiny muted">{item.detail}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted small">
                  No new feat, skill, spell, or ability choices at this level. Review the sheet
                  after leveling.
                </p>
              )}
            </>
          ) : null}

          {currentLevelUpStep.kind === "choice" && currentLevelUpStep.choice ? (
            <>
              <div className="levelup-compare">
                <div>
                  <span className="tiny muted">Current sheet</span>
                  <strong>Before level {nextLevel}</strong>
                </div>
                <ArrowRight size={16} />
                <div>
                  <span className="tiny muted">After leveling</span>
                  <strong>{currentLevelUpStep.choice.label}</strong>
                </div>
              </div>
              <p className="tiny muted">
                You’ll make this choice in the{" "}
                <strong>
                  {STEPS.find((entry) => entry.id === currentLevelUpStep.choice?.step)?.label ??
                    currentLevelUpStep.choice.step}
                </strong>{" "}
                section. The checklist keeps it open until it is done.
              </p>
            </>
          ) : null}

          {currentLevelUpStep.kind === "confirm" ? (
            <p className="muted small">
              {levelUpItems.length
                ? `The builder switches to level ${nextLevel} and opens the ${
                    STEPS.find((entry) => entry.id === levelUpItems[0]?.step)?.label ?? "review"
                  } section.`
                : "The builder switches to the new level. Review the sheet when you are ready."}
            </p>
          ) : null}
        </div>
      </Modal>
      <Modal
        open={Boolean(conflict)}
        onClose={() => setConflict(null)}
        closeOnBackdrop={false}
        elevated
        title="This sheet changed elsewhere"
        subtitle="Another tab, device, or the GM saved this character while you were editing."
        footer={
          <>
            <Button variant="ghost" onClick={() => void applyServerVersion()}>
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
            Reloading replaces your unsaved edits with the version from{" "}
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
