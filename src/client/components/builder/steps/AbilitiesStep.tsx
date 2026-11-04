import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
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
  Heart,
  Loader2,
  Minus,
  Plus,
  ScrollText,
  Shield,
  Sparkles,
  Swords,
  Trash2,
  TrendingUp,
  Upload,
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
} from "../../../../shared/types";
import {
  abilityMod,
  applicableChoiceGroups,
  casterInfo,
  classKeyOptions,
  computeCharacter,
  deitySkillOptions,
  emptyCharacterDraft,
  featSlotsFor,
  flexibleBoosts,
  grantedTrainedSkills,
  normalizeCharacterDraft,
  requiredExtraSkills,
  selectedChoiceOptions,
  selectedDeitySkill,
  signed,
  skillRankCap,
  spellRepertoireLimits,
  spellSlotsFor,
  startingWealthCp,
  titleCase,
  traitLabel,
  weaponDamageLabel,
} from "../../../../shared/rules";
import { api, formatCp, uploadImage } from "../../../api";
import { errorMessage } from "../../../stores";
import { useToasts } from "../../../stores";
import {
  Avatar,
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
  RichText,
  Select,
  Spinner,
  Stat,
  Tag,
  Textarea,
  Toggle,
} from "../../ui";
import {
  DeityPicker,
  EquipmentPicker,
  FeatPicker,
  SpellPicker,
} from "../pickers";
import { ContentSourceToggle } from "../ContentSourceToggle";
import { RunePicker } from "../RunePicker";
import {
  isCoreSource,
  rulesetContentMode,
  rulesetIncludesLegacy,
  rulesetLabel,
} from "../../../../shared/content";
import { summarizeRunes } from "../../../../shared/runes";
import type { BuilderProps } from "../shared";
import {
  BoostSelect,
  StepHeading,
  ValidationNote,
  SearchInput,
  MiniFeatureList,
} from "../shared";

export function AbilitiesStep({ draft, update, derived, context, setStep }: BuilderProps) {
  const ancestry = context.ancestry;
  const background = context.background;
  const classData = context.classData;
  const flexAncestry = ancestry ? flexibleBoosts(ancestry) : [];
  const flexBackground = background ? background.boosts.filter((boost) => !boost.fixed) : [];
  const keyOptions = classData ? classKeyOptions(draft, classData) : [];
  const issues = derived.validation.filter((issue) => issue.step === "abilities");
  const setPick = (source: "ancestry" | "background", index: number, ability: AbilityKey | null) =>
    update((current) => {
      const list = [...current.boosts[source]];
      list[index] = ability;
      return { ...current, boosts: { ...current.boosts, [source]: list } };
    });
  const setFree = (index: number, ability: AbilityKey | null) =>
    update((current) => {
      const free = [...current.boosts.free];
      free[index] = ability;
      return { ...current, boosts: { ...current.boosts, free } };
    });
  const setLevel = (milestone: number, index: number, ability: AbilityKey | null) =>
    update((current) => {
      const key = String(milestone);
      const picks = [...(current.boosts.levels[key] ?? [])];
      while (picks.length < 4) picks.push(null);
      picks[index] = ability;
      return { ...current, boosts: { ...current.boosts, levels: { ...current.boosts.levels, [key]: picks } } };
    });

  return (
    <div className="step">
      <StepHeading
        eyebrow="Step 05 · Ability scores"
        title="What are you made of?"
        lede="Every hero starts at 10 in each ability. Ancestry, background, class, and free boosts add +2 each; flaws subtract 2. At 1st level no score can exceed 18."
      />
      <div className="ability-summary-card card">
        <div className="ability-grid-large">
          {ABILITIES.map((ability) => (
            <div key={ability} className="ability-block">
              <span className="ability-name">{ABILITY_SHORT[ability]}</span>
              <strong className="ability-score">{derived.abilities[ability]}</strong>
              <span className="ability-mod">{signed(derived.abilityMods[ability])}</span>
              <span className="tiny muted">{ABILITY_LABELS[ability]}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="boost-sections">
        <Card className="boost-section">
          <div className="boost-section-head">
            <div><h3>Ancestry boosts</h3><p>{ancestry ? ancestry.name : "Choose an ancestry first."}</p></div>
            <Badge tone="gold">Source 1</Badge>
          </div>
          {ancestry ? (
            <div className="boost-rows">
              {ancestry.boosts.filter((boost) => boost.fixed).map((boost, index) => (
                <div key={`fixed-${index}`} className="boost-row">
                  <span>Fixed boost</span>
                  <div className="chip-row">{boost.from.map((a) => <Tag key={a} tone="green">{ABILITY_SHORT[a]} +2</Tag>)}</div>
                </div>
              ))}
              {flexAncestry.map((entry, index) => {
                const value = draft.boosts.ancestry[index] ?? null;
                const chosen = draft.boosts.ancestry.filter((x): x is AbilityKey => Boolean(x));
                const fixedAbilities = ancestry.boosts
                  .filter((boost) => boost.fixed)
                  .flatMap((boost) => boost.from);
                return (
                  <div key={`anc-flex-${index}`} className="boost-row">
                    <span>Choose one{entry.from.length === 6 ? " free boost" : ` of ${entry.from.map((a) => ABILITY_SHORT[a]).join(" / ")}`}</span>
                    <BoostSelect
                      value={value}
                      options={entry.from}
                      exclude={[...fixedAbilities, ...chosen.filter((x) => x !== value)]}
                      onChange={(ability) => setPick("ancestry", index, ability)}
                    />
                  </div>
                );
              })}
              {ancestry.flaws.map((flaw) => (
                <div key={flaw} className="boost-row">
                  <span>Ancestry flaw</span>
                  <Tag tone="red">{ABILITY_SHORT[flaw]} −2</Tag>
                </div>
              ))}
            </div>
          ) : <p className="muted small">Choose an ancestry to unlock its boosts.</p>}
        </Card>

        <Card className="boost-section">
          <div className="boost-section-head">
            <div><h3>Background boosts</h3><p>{background ? background.name : "Choose a background first."}</p></div>
            <Badge tone="gold">Source 2</Badge>
          </div>
          {background ? (
            <div className="boost-rows">
              {flexBackground.map((entry, index) => {
                const value = draft.boosts.background[index] ?? null;
                const chosen = draft.boosts.background.filter((x): x is AbilityKey => Boolean(x));
                return (
                  <div key={`bg-flex-${index}`} className="boost-row">
                    <span>{entry.from.length === 6 ? "Free boost" : `Choose ${entry.from.map((a) => ABILITY_SHORT[a]).join(" / ")}`}</span>
                    <BoostSelect
                      value={value}
                      options={entry.from}
                      exclude={chosen.filter((x) => x !== value)}
                      onChange={(ability) => setPick("background", index, ability)}
                    />
                  </div>
                );
              })}
            </div>
          ) : <p className="muted small">Choose a background to unlock its boosts.</p>}
        </Card>

        <Card className="boost-section">
          <div className="boost-section-head">
            <div><h3>Class boost</h3><p>{classData ? classData.name : "Choose a class first."}</p></div>
            <Badge tone="gold">Source 3</Badge>
          </div>
          {classData ? (
            keyOptions.length === 1 ? (
              <div className="boost-row"><span>Key ability</span><Tag tone="green">{ABILITY_LABELS[keyOptions[0]]} +2</Tag></div>
            ) : keyOptions.length > 1 ? (
              <div className="boost-row">
                <span>Choose your key ability</span>
                <Select
                  value={draft.keyAbility ?? ""}
                  onChange={(event) => update((current) => ({ ...current, keyAbility: (event.target.value || null) as AbilityKey | null }))}
                >
                  <option value="">Choose…</option>
                  {keyOptions.map((ability) => <option key={ability} value={ability}>{ABILITY_LABELS[ability]}</option>)}
                </Select>
              </div>
            ) : (
              <p className="muted small">This class determines its key ability through its subclass choices.</p>
            )
          ) : <p className="muted small">Choose a class to unlock its key ability.</p>}
        </Card>

        <Card className="boost-section">
          <div className="boost-section-head">
            <div><h3>Free boosts</h3><p>Four +2 boosts, each to a different ability.</p></div>
            <Badge tone="gold">Source 4</Badge>
          </div>
          <div className="free-boost-grid">
            {[0, 1, 2, 3].map((index) => {
              const value = draft.boosts.free[index] ?? null;
              const chosen = draft.boosts.free.filter((x): x is AbilityKey => Boolean(x));
              return (
                <Field key={index} label={`Free boost ${index + 1}`}>
                  <BoostSelect
                    value={value}
                    options={ABILITIES}
                    exclude={chosen.filter((x) => x !== value)}
                    onChange={(ability) => setFree(index, ability)}
                  />
                </Field>
              );
            })}
          </div>
        </Card>

        {[5, 10, 15, 20].filter((milestone) => draft.level >= milestone).map((milestone) => (
          <Card key={milestone} className="boost-section">
            <div className="boost-section-head">
              <div><h3>Level {milestone} boosts</h3><p>Four boosts, each to a different ability. A boost is +2, or +1 if that score is already 18 or higher.</p></div>
              <Badge tone="gold">Milestone</Badge>
            </div>
            <div className="free-boost-grid">
              {[0, 1, 2, 3].map((index) => {
                const picks = draft.boosts.levels[String(milestone)] ?? [];
                const value = picks[index] ?? null;
                const chosen = picks.filter((x): x is AbilityKey => Boolean(x));
                return (
                  <Field key={index} label={`Boost ${index + 1}`}>
                    <BoostSelect
                      value={value}
                      options={ABILITIES}
                      exclude={chosen.filter((x) => x !== value)}
                      onChange={(ability) => setLevel(milestone, index, ability)}
                    />
                  </Field>
                );
              })}
            </div>
          </Card>
        ))}
      </div>
      <div className="ability-legend">
        {ABILITIES.map((ability) => (
          <span key={ability}><strong>{ABILITY_SHORT[ability]}</strong> {ABILITY_DESCRIPTIONS[ability]}</span>
        ))}
      </div>
      <ValidationNote issues={issues} />
      <div className="step-actions">
        <Button variant="ghost" onClick={() => setStep("class")}>Back</Button>
        <Button variant="primary" onClick={() => setStep("skills")} icon={<ArrowRight size={15} />}>Skills</Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------
