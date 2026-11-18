import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Copy,
  Minus,
  Pencil,
  Play,
  Plus,
  Search,
  Skull,
  Swords,
  Trash2,
  Waves,
} from "lucide-react";
import type {
  CharacterRecord,
  Encounter,
  EncounterCombatant,
  EncounterLaunchMode,
  InitiativeEntry,
  Monster,
  Scene,
  Token,
  XpMode,
} from "../../../shared/types";
import {
  ENCOUNTER_DIFFICULTY_LABELS,
  ENCOUNTER_DIFFICULTY_TONES,
  PARTY_SIZE_PRESETS,
  combatantXp,
  encounterBudget,
  encounterAwardXp,
  encounterWaveSummaries,
  partyDefaults,
} from "../../../shared/encounters";
import { api } from "../../api";
import { errorMessage } from "../../stores";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  IconButton,
  Input,
  Modal,
  PageEyebrow,
  ProgressBar,
  Select,
  Spinner,
  Stat,
  Tag,
  Textarea,
} from "../ui";

export interface EncounterLaunchResult {
  sceneId: string;
  tokens: Token[];
  initiative: InitiativeEntry[];
  combatants: number;
  wave: number | null;
  mode: EncounterLaunchMode;
  round: number;
  turnIndex: number;
}

export function EncounterBuilder({
  campaignId,
  isGm,
  xpMode,
  characters,
  scenes,
  activeSceneId,
  onLaunched,
  toast,
}: {
  campaignId: string;
  isGm: boolean;
  xpMode: XpMode;
  characters: CharacterRecord[];
  scenes: Scene[];
  activeSceneId: string | null;
  onLaunched: (result: EncounterLaunchResult) => void;
  toast: (message: string, kind?: "info" | "success" | "error") => void;
}) {
  const [encounters, setEncounters] = useState<Encounter[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [partyLevelOverride, setPartyLevelOverride] = useState<number | null>(null);
  const [partySizeOverride, setPartySizeOverride] = useState<number | null>(null);
  const [monsterQuery, setMonsterQuery] = useState("");
  const [monsterLevel, setMonsterLevel] = useState("");
  const [bestiaryWave, setBestiaryWave] = useState("1");
  const [monsters, setMonsters] = useState<Monster[]>([]);
  const [monsterTotal, setMonsterTotal] = useState(0);
  const [monsterLoading, setMonsterLoading] = useState(false);
  const [combatantEditor, setCombatantEditor] = useState<EncounterCombatant | "new" | null>(null);
  const [launchOpen, setLaunchOpen] = useState(false);
  const [launchSceneId, setLaunchSceneId] = useState("");
  const [launchWave, setLaunchWave] = useState("all");
  const [launchMode, setLaunchMode] = useState<EncounterLaunchMode>("fresh");

  const defaults = useMemo(
    () => partyDefaults(characters.map((character) => character.summary?.level ?? null)),
    [characters]
  );
  const partyLevel = partyLevelOverride ?? defaults.partyLevel;
  const partySize = partySizeOverride ?? defaults.partySize;

  const selected = useMemo(
    () => encounters.find((encounter) => encounter.id === selectedId) ?? null,
    [encounters, selectedId]
  );

  const budget = useMemo(
    () => encounterBudget(selected?.combatants ?? [], partyLevel, partySize),
    [selected?.combatants, partyLevel, partySize]
  );

  const creatureCount = useMemo(
    () => (selected?.combatants ?? []).reduce((total, combatant) => total + combatant.count, 0),
    [selected?.combatants]
  );

  const waveSummaries = useMemo(
    () => encounterWaveSummaries(selected?.combatants ?? []),
    [selected?.combatants]
  );

  const launchCombatants = useMemo(() => {
    if (!selected) return [];
    if (launchWave === "all") return selected.combatants;
    const wave = Number(launchWave);
    return selected.combatants.filter((combatant) => combatant.wave === wave);
  }, [selected, launchWave]);

  const launchCreatures = useMemo(
    () => launchCombatants.reduce((total, combatant) => total + combatant.count, 0),
    [launchCombatants]
  );

  const launchBudget = useMemo(
    () => encounterBudget(launchCombatants, partyLevel, partySize),
    [launchCombatants, partyLevel, partySize]
  );

  const activeLaunchSceneId =
    activeSceneId && scenes.some((scene) => scene.id === activeSceneId) ? activeSceneId : null;

  useEffect(() => {
    if (!isGm) return;
    let cancelled = false;
    setLoading(true);
    api<{ encounters: Encounter[] }>(`/api/campaigns/${campaignId}/encounters`)
      .then((result) => {
        if (cancelled) return;
        setEncounters(result.encounters);
        setSelectedId((current) =>
          current && result.encounters.some((encounter) => encounter.id === current)
            ? current
            : (result.encounters[0]?.id ?? null)
        );
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [campaignId, isGm]);

  useEffect(() => {
    if (!selected) {
      setNameDraft("");
      setDescriptionDraft("");
      return;
    }
    setNameDraft(selected.name);
    setDescriptionDraft(selected.description);
  }, [selected?.id]);

  useEffect(() => {
    if (!isGm) return;
    let cancelled = false;
    const controller = new AbortController();
    setMonsterLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: monsterQuery, limit: "30" });
        if (monsterLevel !== "") {
          params.set("levelMin", monsterLevel);
          params.set("levelMax", monsterLevel);
        }
        const result = await api<{ items: Monster[]; total: number }>(
          `/api/compendium/monsters?${params.toString()}`,
          { signal: controller.signal }
        );
        if (cancelled) return;
        setMonsters(result.items);
        setMonsterTotal(result.total);
      } catch (err) {
        if (cancelled || (err as { name?: string }).name === "AbortError") return;
        setError(errorMessage(err));
      } finally {
        if (!cancelled) setMonsterLoading(false);
      }
    }, 220);
    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [monsterQuery, monsterLevel, isGm]);

  const replaceEncounter = (encounter: Encounter) => {
    setEncounters((current) =>
      current.map((entry) => (entry.id === encounter.id ? encounter : entry))
    );
  };

  const createEncounter = async () => {
    setBusy(true);
    try {
      const result = await api<{ encounter: Encounter }>(
        `/api/campaigns/${campaignId}/encounters`,
        {
          method: "POST",
          body: {
            name: "New encounter",
            description: "",
            sceneId: scenes[0]?.id ?? null,
          },
        }
      );
      setEncounters((current) => [...current, result.encounter]);
      setSelectedId(result.encounter.id);
      toast("Encounter created.", "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  };

  const saveEncounter = async (patch: Record<string, unknown>) => {
    if (!selected) return;
    setBusy(true);
    try {
      const result = await api<{ encounter: Encounter }>(
        `/api/campaigns/${campaignId}/encounters/${selected.id}`,
        { method: "PATCH", body: patch }
      );
      replaceEncounter(result.encounter);
      toast("Encounter saved.", "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  };

  const deleteEncounter = async () => {
    if (!selected) return;
    if (!window.confirm(`Delete “${selected.name}”?`)) return;
    setBusy(true);
    try {
      await api(`/api/campaigns/${campaignId}/encounters/${selected.id}`, { method: "DELETE" });
      const remaining = encounters.filter((encounter) => encounter.id !== selected.id);
      setEncounters(remaining);
      setSelectedId(remaining[0]?.id ?? null);
      toast("Encounter deleted.", "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  };

  const duplicateEncounter = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const result = await api<{ encounter: Encounter }>(
        `/api/campaigns/${campaignId}/encounters/${selected.id}/duplicate`,
        { method: "POST" }
      );
      setEncounters((current) => [...current, result.encounter]);
      setSelectedId(result.encounter.id);
      toast("Encounter duplicated.", "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  };

  const addMonster = async (monster: Monster) => {
    if (!selected) return;
    setBusy(true);
    try {
      const result = await api<{ combatant: EncounterCombatant }>(
        `/api/campaigns/${campaignId}/encounters/${selected.id}/combatants`,
        {
          method: "POST",
          body: { monsterId: monster.id, count: 1, wave: Number(bestiaryWave) || 1 },
        }
      );
      setEncounters((current) =>
        current.map((encounter) =>
          encounter.id === selected.id
            ? { ...encounter, combatants: [...encounter.combatants, result.combatant] }
            : encounter
        )
      );
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  };

  const updateCombatant = async (combatant: EncounterCombatant, patch: Record<string, unknown>) => {
    if (!selected) return;
    try {
      const result = await api<{ combatant: EncounterCombatant }>(
        `/api/campaigns/${campaignId}/encounters/${selected.id}/combatants/${combatant.id}`,
        { method: "PATCH", body: patch }
      );
      setEncounters((current) =>
        current.map((encounter) =>
          encounter.id === selected.id
            ? {
                ...encounter,
                combatants: encounter.combatants.map((entry) =>
                  entry.id === result.combatant.id ? result.combatant : entry
                ),
              }
            : encounter
        )
      );
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  const removeCombatant = async (combatant: EncounterCombatant) => {
    if (!selected) return;
    try {
      await api(
        `/api/campaigns/${campaignId}/encounters/${selected.id}/combatants/${combatant.id}`,
        { method: "DELETE" }
      );
      setEncounters((current) =>
        current.map((encounter) =>
          encounter.id === selected.id
            ? {
                ...encounter,
                combatants: encounter.combatants.filter((entry) => entry.id !== combatant.id),
              }
            : encounter
        )
      );
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  const openLaunch = () => {
    if (!selected) return;
    setLaunchSceneId(selected.sceneId ?? activeLaunchSceneId ?? scenes[0]?.id ?? "");
    setLaunchWave("all");
    setLaunchMode("fresh");
    setLaunchOpen(true);
  };

  const clearLaunched = async () => {
    if (!selected) return;
    if (
      !window.confirm("Remove every token this encounter launched and their initiative entries?")
    ) {
      return;
    }
    setBusy(true);
    try {
      const result = await api<{ removed: number }>(
        `/api/campaigns/${campaignId}/encounters/${selected.id}/clear`,
        { method: "POST" }
      );
      toast(
        result.removed
          ? `Removed ${result.removed} launched token${result.removed === 1 ? "" : "s"}.`
          : "No launched tokens were found.",
        "success"
      );
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  };

  const launch = async () => {
    if (!selected) return;
    if (!launchCombatants.length) {
      toast("Choose a wave with at least one combatant.", "error");
      return;
    }
    setBusy(true);
    try {
      const result = await api<EncounterLaunchResult>(
        `/api/campaigns/${campaignId}/encounters/${selected.id}/launch`,
        {
          method: "POST",
          body: {
            sceneId: launchSceneId || selected.sceneId || null,
            wave: launchWave === "all" ? null : Number(launchWave),
            mode: launchMode,
          },
        }
      );
      toast(
        result.mode === "reinforce"
          ? `Reinforcements arrived: ${result.combatants} combatants.`
          : `Launched ${result.combatants} combatants.`,
        "success"
      );
      setLaunchOpen(false);
      onLaunched(result);
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  };

  if (!isGm) {
    return (
      <div className="page-inner">
        <EmptyState
          icon={<Skull size={28} />}
          title="The GM's bench"
          description="Encounter preparation is only visible to the Game Master."
        />
      </div>
    );
  }

  return (
    <div className="page-inner encounter-page">
      <div className="section-title">
        <div>
          <PageEyebrow>GM preparation</PageEyebrow>
          <h2>Encounters</h2>
          <p>
            Build a fight from the bestiary, check the budget, then launch it onto the table.
            {xpMode === "milestone"
              ? " Milestone mode keeps XP budgets hidden."
              : " XP mode shows the PF2e budget and difficulty."}
          </p>
        </div>
        <Button
          variant="primary"
          icon={<Plus size={15} />}
          loading={busy}
          onClick={createEncounter}
        >
          New encounter
        </Button>
      </div>

      {error ? (
        <div className="auth-error" style={{ marginBottom: 14 }}>
          {error}
        </div>
      ) : null}

      {loading ? (
        <Spinner label="Opening the encounter bench…" />
      ) : !encounters.length ? (
        <EmptyState
          icon={<Swords size={30} />}
          title="No encounters prepared"
          description="Create an encounter, add monsters from the bestiary, and launch it when the party is ready."
          action={
            <Button
              variant="secondary"
              icon={<Plus size={15} />}
              loading={busy}
              onClick={createEncounter}
            >
              Create the first encounter
            </Button>
          }
        />
      ) : (
        <div className="encounter-layout">
          <aside className="encounter-list card">
            <div className="row-between">
              <PageEyebrow>Saved fights</PageEyebrow>
              <Badge>{encounters.length}</Badge>
            </div>
            <div className="encounter-list-items">
              {encounters.map((encounter) => {
                const count = encounter.combatants.reduce(
                  (total, combatant) => total + combatant.count,
                  0
                );
                return (
                  <button
                    key={encounter.id}
                    type="button"
                    className={`encounter-list-item ${encounter.id === selectedId ? "is-selected" : ""}`}
                    onClick={() => setSelectedId(encounter.id)}
                  >
                    <span className="grow">
                      <strong>{encounter.name}</strong>
                      <span className="tiny muted">
                        {count} {count === 1 ? "creature" : "creatures"}
                        {encounter.sceneId
                          ? ` · ${scenes.find((scene) => scene.id === encounter.sceneId)?.name ?? "Scene"}`
                          : ""}
                      </span>
                    </span>
                    <Swords size={14} />
                  </button>
                );
              })}
            </div>
          </aside>

          <div className="encounter-workspace">
            {!selected ? (
              <EmptyState
                icon={<Swords size={28} />}
                title="Choose an encounter"
                description="Select a saved fight or create a new one."
              />
            ) : (
              <>
                <Card className="encounter-header">
                  <div className="encounter-header-main">
                    <Field label="Encounter name">
                      <Input
                        value={nameDraft}
                        onChange={(event) => setNameDraft(event.target.value)}
                      />
                    </Field>
                    <Field label="Scene" hint="Where the fight will be placed.">
                      <Select
                        value={selected.sceneId ?? ""}
                        onChange={(event) =>
                          void saveEncounter({ sceneId: event.target.value || null })
                        }
                      >
                        <option value="">Active scene</option>
                        {scenes.map((scene) => (
                          <option key={scene.id} value={scene.id}>
                            {scene.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                  <div className="encounter-header-actions">
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={busy}
                      onClick={() =>
                        void saveEncounter({ name: nameDraft, description: descriptionDraft })
                      }
                    >
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Copy size={13} />}
                      onClick={duplicateEncounter}
                    >
                      Duplicate
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Trash2 size={13} />}
                      onClick={deleteEncounter}
                    >
                      Delete
                    </Button>
                  </div>
                  <Field label="Notes" className="encounter-notes">
                    <Textarea
                      rows={2}
                      value={descriptionDraft}
                      onChange={(event) => setDescriptionDraft(event.target.value)}
                      placeholder="Terrain, tactics, treasure, or the reason this fight matters."
                    />
                  </Field>
                </Card>

                <Card className={`encounter-budget ${xpMode === "xp" ? "" : "is-milestone"}`}>
                  <div className="encounter-budget-head">
                    <div>
                      <PageEyebrow>Party setup</PageEyebrow>
                      <h3>
                        {defaults.incomplete
                          ? `${defaults.completed} of ${defaults.partySize} characters have a level`
                          : `${partySize} ${partySize === 1 ? "character" : "characters"} at level ${partyLevel}`}
                      </h3>
                    </div>
                    {xpMode === "xp" ? (
                      <Badge tone={ENCOUNTER_DIFFICULTY_TONES[budget.difficulty]}>
                        {ENCOUNTER_DIFFICULTY_LABELS[budget.difficulty]}
                      </Badge>
                    ) : (
                      <Tag tone="gold">Milestone</Tag>
                    )}
                  </div>
                  <div className="encounter-party-controls">
                    <Field
                      label="Party level"
                      hint="Defaults to the average of finished characters."
                    >
                      <Input
                        type="number"
                        min={1}
                        max={20}
                        value={partyLevel}
                        onChange={(event) =>
                          setPartyLevelOverride(
                            Math.max(1, Math.min(20, Number(event.target.value) || 1))
                          )
                        }
                      />
                    </Field>
                    <Field label="Party size" hint="PF2e budgets assume four characters.">
                      <Input
                        type="number"
                        min={1}
                        max={10}
                        value={partySize}
                        onChange={(event) =>
                          setPartySizeOverride(
                            Math.max(1, Math.min(10, Number(event.target.value) || 1))
                          )
                        }
                      />
                    </Field>
                    <Stat
                      label="Combatants"
                      value={creatureCount}
                      hint={`${selected.combatants.length} roster rows`}
                    />
                  </div>
                  <div className="encounter-party-presets">
                    <span className="tiny muted">Quick party size</span>
                    <button
                      type="button"
                      className={`encounter-preset ${partySizeOverride === null ? "is-active" : ""}`}
                      onClick={() => setPartySizeOverride(null)}
                    >
                      Auto ({defaults.partySize})
                    </button>
                    {PARTY_SIZE_PRESETS.map((size) => (
                      <button
                        key={size}
                        type="button"
                        className={`encounter-preset ${partySizeOverride === size ? "is-active" : ""}`}
                        onClick={() => setPartySizeOverride(size)}
                      >
                        {size}
                      </button>
                    ))}
                  </div>

                  {xpMode === "xp" ? (
                    <>
                      <div className="encounter-budget-bar">
                        <ProgressBar
                          value={budget.awardXp}
                          max={Math.max(1, budget.thresholds.extreme)}
                          label={
                            <span>
                              <strong>{budget.awardXp} XP</strong> against a{" "}
                              <strong>{budget.thresholds.moderate} XP</strong> moderate budget
                            </span>
                          }
                        />
                      </div>
                      <div className="encounter-thresholds">
                        {(["trivial", "low", "moderate", "severe", "extreme"] as const).map(
                          (difficulty) => (
                            <span
                              key={difficulty}
                              className={`encounter-threshold ${budget.difficulty === difficulty ? "is-active" : ""}`}
                            >
                              <span>{ENCOUNTER_DIFFICULTY_LABELS[difficulty]}</span>
                              <strong>{budget.thresholds[difficulty]} XP</strong>
                            </span>
                          )
                        )}
                      </div>
                      <p className="tiny muted">
                        Each PC earns <strong>{budget.awardXp} XP</strong> if they overcome this
                        encounter. Party-size adjustments change the budget, not the award.{" "}
                        {budget.nextThreshold
                          ? `${budget.nextThreshold - budget.awardXp} XP to the next tier.`
                          : "This fight is past the extreme budget."}
                      </p>
                    </>
                  ) : (
                    <p className="tiny muted">
                      Encounter XP is hidden in milestone mode. Level the party from the Party tab
                      when the story calls for it.
                    </p>
                  )}
                </Card>

                <div className="encounter-columns">
                  <Card className="encounter-roster">
                    <div className="row-between">
                      <div>
                        <PageEyebrow>Roster</PageEyebrow>
                        <h3>Who is in the fight?</h3>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Plus size={13} />}
                        onClick={() => setCombatantEditor("new")}
                      >
                        Custom NPC
                      </Button>
                    </div>
                    {!selected.combatants.length ? (
                      <p className="muted small">
                        Add monsters from the bestiary or a custom NPC. Counts make it easy to run a
                        group.
                      </p>
                    ) : (
                      <div className="encounter-roster-list">
                        {waveSummaries.map((wave) => {
                          const waveCombatants = selected.combatants.filter(
                            (combatant) => combatant.wave === wave.wave
                          );
                          const waveXp = encounterAwardXp(waveCombatants, partyLevel);
                          return (
                            <div key={wave.wave} className="encounter-wave-group">
                              <div className="encounter-wave-head">
                                <span>
                                  <strong>Wave {wave.wave}</strong> · {wave.creatures}{" "}
                                  {wave.creatures === 1 ? "creature" : "creatures"}
                                </span>
                                {xpMode === "xp" ? <Tag tone="gold">{waveXp} XP</Tag> : null}
                              </div>
                              {waveCombatants.map((combatant) => (
                                <div key={combatant.id} className="encounter-roster-row">
                                  <div className="encounter-roster-main">
                                    <div className="row wrap" style={{ gap: 7 }}>
                                      <strong>{combatant.name}</strong>
                                      <Tag tone="neutral">Level {combatant.level}</Tag>
                                      {xpMode === "xp" ? (
                                        <Tag tone="gold">
                                          {combatantXp(combatant, partyLevel)} XP
                                        </Tag>
                                      ) : null}
                                    </div>
                                    <span className="tiny muted">
                                      {combatant.hp !== null ? `${combatant.hp} HP` : "HP not set"}
                                      {combatant.ac !== null ? ` · AC ${combatant.ac}` : ""}
                                      {combatant.perception !== null
                                        ? ` · Perception ${combatant.perception}`
                                        : ""}
                                    </span>
                                  </div>
                                  <div className="encounter-count">
                                    <IconButton
                                      label="Remove one"
                                      onClick={() =>
                                        void updateCombatant(combatant, {
                                          count: combatant.count - 1,
                                        })
                                      }
                                      disabled={combatant.count <= 1}
                                    >
                                      <Minus size={13} />
                                    </IconButton>
                                    <span>{combatant.count}</span>
                                    <IconButton
                                      label="Add one"
                                      onClick={() =>
                                        void updateCombatant(combatant, {
                                          count: combatant.count + 1,
                                        })
                                      }
                                    >
                                      <Plus size={13} />
                                    </IconButton>
                                  </div>
                                  <div className="encounter-row-actions">
                                    <IconButton
                                      label={`Edit ${combatant.name}`}
                                      onClick={() => setCombatantEditor(combatant)}
                                    >
                                      <Pencil size={13} />
                                    </IconButton>
                                    <IconButton
                                      label={`Remove ${combatant.name}`}
                                      onClick={() => void removeCombatant(combatant)}
                                    >
                                      <Trash2 size={13} />
                                    </IconButton>
                                  </div>
                                </div>
                              ))}
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <div className="encounter-launch">
                      <div>
                        <strong>Ready to run it?</strong>
                        <p className="tiny muted">
                          Creates tokens on the scene and starts a fresh initiative order.
                        </p>
                      </div>
                      <Button
                        variant="primary"
                        icon={<Play size={14} />}
                        loading={busy}
                        disabled={!selected.combatants.length}
                        onClick={openLaunch}
                      >
                        Launch
                      </Button>
                    </div>
                  </Card>

                  <Card className="encounter-bestiary">
                    <div className="row-between">
                      <div>
                        <PageEyebrow>Bestiary</PageEyebrow>
                        <h3>Add monsters</h3>
                      </div>
                      <Badge tone="violet">
                        {monsterLoading
                          ? "Searching…"
                          : monsterTotal > monsters.length
                            ? `${monsters.length} of ${monsterTotal}`
                            : `${monsters.length} results`}
                      </Badge>
                    </div>
                    <div className="encounter-search">
                      <div className="search-box">
                        <Search size={15} />
                        <Input
                          value={monsterQuery}
                          onChange={(event) => setMonsterQuery(event.target.value)}
                          placeholder="Search monsters…"
                        />
                      </div>
                      <Field label="Level">
                        <Input
                          type="number"
                          min={-1}
                          max={30}
                          value={monsterLevel}
                          onChange={(event) => setMonsterLevel(event.target.value)}
                          placeholder="Any"
                        />
                      </Field>
                      <Field label="Wave" hint="New monsters join this wave.">
                        <Input
                          type="number"
                          min={1}
                          max={20}
                          value={bestiaryWave}
                          onChange={(event) => setBestiaryWave(event.target.value)}
                        />
                      </Field>
                    </div>
                    {monsterLoading ? (
                      <Spinner label="Searching the bestiary…" />
                    ) : (
                      <div className="encounter-monster-list">
                        {monsters.map((monster) => (
                          <div key={monster.id} className="encounter-monster-row">
                            <span className="encounter-monster-mark">
                              <Skull size={14} />
                            </span>
                            <div className="grow">
                              <strong>{monster.name}</strong>
                              <span className="tiny muted">
                                Level {monster.level} · {monster.hp} HP · AC {monster.ac}
                              </span>
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              icon={<Plus size={13} />}
                              onClick={() => void addMonster(monster)}
                            >
                              Add
                            </Button>
                          </div>
                        ))}
                        {!monsters.length ? (
                          <p className="muted small">No monsters match that search.</p>
                        ) : null}
                      </div>
                    )}
                  </Card>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <Modal
        open={launchOpen}
        onClose={() => setLaunchOpen(false)}
        title={`Launch ${selected?.name ?? "encounter"}`}
        subtitle="Preview the scene and wave, then choose whether to start fresh or reinforce the current fight."
        wide
        footer={
          <>
            <Button variant="ghost" onClick={() => setLaunchOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="ghost"
              icon={<Trash2 size={14} />}
              loading={busy}
              onClick={() => void clearLaunched()}
            >
              Clear launched
            </Button>
            <Button
              variant="primary"
              icon={<Play size={14} />}
              loading={busy}
              disabled={!launchCombatants.length || !launchSceneId}
              onClick={launch}
            >
              {launchMode === "reinforce" ? "Launch wave" : "Launch encounter"}
            </Button>
          </>
        }
      >
        {selected ? (
          <>
            <Field
              label="Scene"
              hint="The wave is placed on this scene and broadcast to the table."
            >
              <Select
                value={launchSceneId}
                onChange={(event) => setLaunchSceneId(event.target.value)}
                disabled={launchMode === "reinforce" && Boolean(activeLaunchSceneId)}
              >
                {scenes.map((scene) => (
                  <option key={scene.id} value={scene.id}>
                    {scene.name}
                  </option>
                ))}
              </Select>
              {!scenes.length ? (
                <p className="tiny danger-text">Create a scene before launching this encounter.</p>
              ) : null}
              {launchMode === "reinforce" && activeLaunchSceneId ? (
                <p className="tiny muted">
                  Reinforcements join the active scene and initiative order.
                </p>
              ) : null}
            </Field>
            <Field
              label="Wave"
              hint="Launch one wave now and bring later waves in when they arrive."
            >
              <div className="encounter-wave-options">
                <button
                  type="button"
                  className={`encounter-wave-option ${launchWave === "all" ? "is-active" : ""}`}
                  onClick={() => setLaunchWave("all")}
                >
                  <span>
                    <strong>All waves</strong>{" "}
                    <span className="tiny muted">{selected.combatants.length} roster rows</span>
                  </span>
                  <span>{creatureCount} creatures</span>
                </button>
                {waveSummaries.map((wave) => (
                  <button
                    key={wave.wave}
                    type="button"
                    className={`encounter-wave-option ${launchWave === String(wave.wave) ? "is-active" : ""}`}
                    onClick={() => setLaunchWave(String(wave.wave))}
                  >
                    <span>
                      <strong>Wave {wave.wave}</strong>{" "}
                      <span className="tiny muted">
                        {wave.combatants} {wave.combatants === 1 ? "roster row" : "roster rows"}
                      </span>
                    </span>
                    <span>
                      {wave.creatures} {wave.creatures === 1 ? "creature" : "creatures"}
                      {xpMode === "xp"
                        ? ` · ${encounterAwardXp(
                            selected.combatants.filter((combatant) => combatant.wave === wave.wave),
                            partyLevel
                          )} XP`
                        : ""}
                    </span>
                  </button>
                ))}
              </div>
            </Field>
            <Field
              label="Initiative"
              hint="Reinforcements roll initiative and slot into the existing order without resetting the round."
            >
              <div className="row wrap" style={{ gap: 6 }}>
                <Button
                  size="sm"
                  variant={launchMode === "fresh" ? "primary" : "ghost"}
                  onClick={() => setLaunchMode("fresh")}
                >
                  Start fresh
                </Button>
                <Button
                  size="sm"
                  variant={launchMode === "reinforce" ? "primary" : "ghost"}
                  onClick={() => {
                    setLaunchMode("reinforce");
                    if (activeLaunchSceneId) setLaunchSceneId(activeLaunchSceneId);
                  }}
                >
                  Add to current order
                </Button>
              </div>
            </Field>
            <div className="encounter-launch-preview">
              <Waves size={18} />
              <div>
                <strong>
                  {launchCreatures} {launchCreatures === 1 ? "creature" : "creatures"} ·{" "}
                  {launchCombatants.length} roster {launchCombatants.length === 1 ? "row" : "rows"}
                </strong>
                <span className="tiny muted">
                  {launchMode === "reinforce"
                    ? "Reinforcements arrive at the bottom edge of the scene. The current round and active turn stay put."
                    : "Starts round 1 and rolls initiative for every visible token on the scene. Fresh launch also replaces tokens this encounter already placed here."}
                  {xpMode === "xp"
                    ? ` ${launchBudget.awardXp} XP against a ${launchBudget.thresholds.moderate} XP moderate budget.`
                    : ""}
                </span>
              </div>
            </div>
          </>
        ) : null}
      </Modal>

      <CombatantModal
        open={Boolean(combatantEditor)}
        combatant={combatantEditor}
        onClose={() => setCombatantEditor(null)}
        onSave={async (payload) => {
          if (!selected) return;
          if (combatantEditor && combatantEditor !== "new") {
            await updateCombatant(combatantEditor, payload);
          } else {
            const result = await api<{ combatant: EncounterCombatant }>(
              `/api/campaigns/${campaignId}/encounters/${selected.id}/combatants`,
              { method: "POST", body: payload }
            );
            setEncounters((current) =>
              current.map((encounter) =>
                encounter.id === selected.id
                  ? { ...encounter, combatants: [...encounter.combatants, result.combatant] }
                  : encounter
              )
            );
          }
          setCombatantEditor(null);
        }}
      />
    </div>
  );
}

function CombatantModal({
  open,
  combatant,
  onClose,
  onSave,
}: {
  open: boolean;
  combatant: EncounterCombatant | "new" | null;
  onClose: () => void;
  onSave: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const editing = combatant && combatant !== "new" ? combatant : null;
  const [name, setName] = useState("");
  const [level, setLevel] = useState("1");
  const [count, setCount] = useState("1");
  const [wave, setWave] = useState("1");
  const [hp, setHp] = useState("");
  const [ac, setAc] = useState("");
  const [perception, setPerception] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? "Custom NPC");
    setLevel(String(editing?.level ?? 1));
    setCount(String(editing?.count ?? 1));
    setWave(String(editing?.wave ?? 1));
    setHp(editing?.hp === null || editing?.hp === undefined ? "" : String(editing.hp));
    setAc(editing?.ac === null || editing?.ac === undefined ? "" : String(editing.ac));
    setPerception(
      editing?.perception === null || editing?.perception === undefined
        ? ""
        : String(editing.perception)
    );
    setNotes(editing?.notes ?? "");
    setError("");
  }, [open, editing?.id]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setError("Give the combatant a name.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onSave({
        name: name.trim(),
        level: Number(level) || 1,
        count: Number(count) || 1,
        wave: Number(wave) || 1,
        hp: hp === "" ? null : Number(hp),
        ac: ac === "" ? null : Number(ac),
        perception: perception === "" ? null : Number(perception),
        notes,
      });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "Edit combatant" : "Add a custom NPC"}
      subtitle="Use this for NPCs, hazards, or monsters that are not in the bestiary."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={submit}>
            {editing ? "Save combatant" : "Add to encounter"}
          </Button>
        </>
      }
    >
      <form className="stack" onSubmit={submit}>
        {error ? <div className="auth-error">{error}</div> : null}
        <Field label="Name">
          <Input autoFocus value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <div className="form-grid two">
          <Field label="Level">
            <Input
              type="number"
              min={-1}
              max={30}
              value={level}
              onChange={(event) => setLevel(event.target.value)}
            />
          </Field>
          <Field label="Count">
            <Input
              type="number"
              min={1}
              max={50}
              value={count}
              onChange={(event) => setCount(event.target.value)}
            />
          </Field>
          <Field label="Wave" hint="Bring reinforcements in later.">
            <Input
              type="number"
              min={1}
              max={20}
              value={wave}
              onChange={(event) => setWave(event.target.value)}
            />
          </Field>
          <Field label="HP">
            <Input
              type="number"
              min={0}
              value={hp}
              onChange={(event) => setHp(event.target.value)}
              placeholder="Optional"
            />
          </Field>
          <Field label="AC">
            <Input
              type="number"
              value={ac}
              onChange={(event) => setAc(event.target.value)}
              placeholder="Optional"
            />
          </Field>
          <Field label="Perception" hint="Used for initiative.">
            <Input
              type="number"
              value={perception}
              onChange={(event) => setPerception(event.target.value)}
              placeholder="Optional"
            />
          </Field>
        </div>
        <Field label="Notes">
          <Textarea
            rows={3}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Tactics, abilities, or reminders."
          />
        </Field>
      </form>
    </Modal>
  );
}
