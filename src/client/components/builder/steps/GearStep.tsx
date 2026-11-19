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
  titleCase,
  traitLabel,
  weaponDamageLabel,
} from "../../../../shared/rules";
import { addCurrency } from "../../../../shared/inventory";
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
import { DeityPicker, EquipmentPicker, FeatPicker, SpellPicker } from "../pickers";
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
import { StepHeading, ValidationNote, SearchInput, MiniFeatureList } from "../shared";

export function GearStep({
  draft,
  update,
  derived,
  context,
  setStep,
  openPicker,
  contentMode,
  contentModeLocked,
  legacyDefault,
  legacyLocked,
}: BuilderProps) {
  const [runeEntryId, setRuneEntryId] = useState<string | null>(null);
  const { budget, spent, currencyCp, committed, remaining } = derived.wealth;
  const budgeted = budget !== null;
  const runeEntry = runeEntryId
    ? (draft.equipment.find((entry) => entry.itemId === runeEntryId) ?? null)
    : null;
  const runeItem = runeEntry ? (context.equipment[runeEntry.itemId] ?? null) : null;
  return (
    <div className="step">
      <StepHeading
        eyebrow="Step 09 · Equipment"
        title="What do you carry?"
        lede="Spend your starting wealth, mark armor and weapons as equipped, and keep an eye on Bulk. Your equipped gear feeds directly into AC and attacks."
      />
      <Card className="wealth-card">
        <div className="wealth-numbers">
          {budgeted ? <Stat label="Starting wealth" value={formatCp(budget)} /> : null}
          <Stat label="Gear value" value={formatCp(spent)} tone="red" />
          <Stat label="Coins" value={formatCp(currencyCp)} />
          {budgeted && remaining !== null ? (
            <Stat
              label="Remaining"
              value={formatCp(remaining)}
              tone={remaining < 0 ? "red" : "green"}
            />
          ) : null}
          <Stat
            label="Bulk"
            value={`${derived.bulk.total}`}
            hint={`${derived.bulk.capacity} before encumbered`}
          />
        </div>
        {budgeted && budget !== null ? (
          <>
            <ProgressBar
              value={Math.min(committed, budget)}
              max={budget}
              label={
                <>
                  <span>Starting wealth used</span>
                  <span>
                    {Math.round((Math.min(committed, budget) / Math.max(1, budget)) * 100)}%
                  </span>
                </>
              }
            />
            {(remaining ?? 0) > 0 ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  update((current) => ({
                    ...current,
                    currency: addCurrency(current.currency, remaining ?? 0),
                  }))
                }
              >
                Take {formatCp(remaining ?? 0)} as coins
              </Button>
            ) : null}
          </>
        ) : (
          <p className="muted small">
            Wealth comes from this character’s import or play history, so no starting budget is
            applied.
          </p>
        )}
        {budgeted && (remaining ?? 0) < 0 ? (
          <div className="validation-note">
            <div className="validation-line warning">
              <CircleAlert size={14} />
              <span>
                Your gear and coins exceed the standard starting wealth for this level. The GM can
                approve it.
              </span>
            </div>
          </div>
        ) : null}
      </Card>

      <div className="row-between" style={{ marginTop: 18 }}>
        <div>
          <h2>Pack and arsenal</h2>
          <p className="muted small">
            Equipped weapons appear on your sheet. Equipped armor and shields affect AC.
          </p>
        </div>
        <Button
          variant="primary"
          icon={<Plus size={15} />}
          onClick={() => openPicker({ kind: "equipment" })}
        >
          Add item
        </Button>
      </div>

      <div className="equipment-list">
        {draft.equipment.map((entry) => {
          const item = context.equipment[entry.itemId];
          if (!item) return null;
          const runes = summarizeRunes(entry.runes, context.equipment);
          const attachedRunes = (entry.runes ?? [])
            .map((id) => context.equipment[id])
            .filter((rune): rune is Equipment => Boolean(rune));
          const canHaveRunes = Boolean(item.weapon || item.armor || item.shield);
          return (
            <div key={entry.itemId} className="equipment-row">
              <div className="equipment-icon">
                {item.weapon ? (
                  <Swords size={18} />
                ) : item.armor || item.shield ? (
                  <Shield size={18} />
                ) : item.consumable ? (
                  <FlaskConical size={18} />
                ) : (
                  <Backpack size={18} />
                )}
              </div>
              <div className="grow">
                <div className="row wrap" style={{ gap: 7 }}>
                  <strong>{item.name}</strong>
                  <Badge tone="neutral">{item.type}</Badge>
                  <span className="tiny muted">level {item.level}</span>
                </div>
                <div className="tiny muted">
                  {formatCp(item.price.cpTotal)} each · {item.bulk || 0} bulk
                  {item.weapon ? ` · ${weaponDamageLabel(item.weapon)}` : ""}
                  {item.armor ? ` · +${item.armor.acBonus} AC · Dex cap +${item.armor.dexCap}` : ""}
                  {item.shield ? ` · +${item.shield.acBonus} AC shield` : ""}
                  {item.weapon && runes.weaponPotency ? ` · +${runes.weaponPotency} potency` : ""}
                  {item.weapon && runes.strikingDice > 1
                    ? ` · ${runes.strikingDice} damage dice`
                    : ""}
                  {item.armor && runes.armorPotency
                    ? ` · +${runes.armorPotency} armor potency`
                    : ""}
                  {item.armor && runes.resilient ? ` · +${runes.resilient} saves` : ""}
                </div>
                {attachedRunes.length ? (
                  <div className="chip-row rune-chip-row">
                    {attachedRunes.map((rune) => (
                      <Tag key={rune.id} tone="gold">
                        {rune.name}
                      </Tag>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="equipment-actions">
                {canHaveRunes ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Sparkles size={13} />}
                    onClick={() => setRuneEntryId(entry.itemId)}
                  >
                    Runes
                  </Button>
                ) : null}
                <div className="qty-control">
                  <button
                    type="button"
                    onClick={() =>
                      update((current) => ({
                        ...current,
                        equipment: current.equipment.map((e) =>
                          e.itemId === entry.itemId
                            ? { ...e, quantity: Math.max(1, e.quantity - 1) }
                            : e
                        ),
                      }))
                    }
                  >
                    <Minus size={12} />
                  </button>
                  <span>{entry.quantity}</span>
                  <button
                    type="button"
                    onClick={() =>
                      update((current) => ({
                        ...current,
                        equipment: current.equipment.map((e) =>
                          e.itemId === entry.itemId ? { ...e, quantity: e.quantity + 1 } : e
                        ),
                      }))
                    }
                  >
                    <Plus size={12} />
                  </button>
                </div>
                <Toggle
                  checked={entry.equipped}
                  onChange={(value) =>
                    update((current) => ({
                      ...current,
                      equipment: current.equipment.map((e) =>
                        e.itemId === entry.itemId ? { ...e, equipped: value } : e
                      ),
                    }))
                  }
                  label="Equipped"
                />
                <button
                  type="button"
                  className="icon-btn"
                  title="Remove item"
                  onClick={() =>
                    update((current) => ({
                      ...current,
                      equipment: current.equipment.filter((e) => e.itemId !== entry.itemId),
                    }))
                  }
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          );
        })}
        {!draft.equipment.length ? (
          <EmptyState
            icon={<Backpack size={27} />}
            title="Your pack is empty"
            description="Add a weapon, armor, a shield, or the small things that keep an adventurer alive."
            action={
              <Button
                variant="primary"
                icon={<Plus size={15} />}
                onClick={() => openPicker({ kind: "equipment" })}
              >
                Browse equipment
              </Button>
            }
          />
        ) : null}
      </div>

      <Card className="currency-card">
        <h3>Purse</h3>
        <p className="muted small">
          Carried coins. Coins count against the starting wealth during creation; use “Take
          remaining as coins” to carry the unspent budget.
        </p>
        <div className="currency-grid">
          {(["gp", "sp", "cp"] as const).map((coin) => (
            <Field key={coin} label={coin.toUpperCase()}>
              <Input
                type="number"
                min={0}
                value={draft.currency[coin]}
                onChange={(event) =>
                  update((current) => ({
                    ...current,
                    currency: {
                      ...current.currency,
                      [coin]: Math.max(0, Number(event.target.value) || 0),
                    },
                  }))
                }
              />
            </Field>
          ))}
        </div>
      </Card>

      <Card className="combat-preview">
        <h3>Combat snapshot</h3>
        <div className="combat-preview-grid">
          <Stat label="Armor class" value={derived.ac} tone="gold" />
          <Stat label="Speed" value={`${derived.speed} ft.`} />
          <Stat label="Attacks" value={derived.attacks.length} />
          <Stat label="Equipped bulk" value={derived.bulk.total} />
        </div>
        <div className="attack-preview-list">
          {derived.attacks.map((attack) => (
            <div key={attack.id} className="attack-preview-row">
              <strong>{attack.name}</strong>
              <span className="mono">{signed(attack.attackBonus)} to hit</span>
              <span className="mono">
                {attack.damageFormula} {attack.damageType}
              </span>
              {attack.extraDamage?.map((extra) => (
                <span key={`${attack.id}-${extra.type}`} className="mono tiny gold-text">
                  +{extra.formula} {extra.type}
                </span>
              ))}
              <span className="chip-row">
                {attack.traits.slice(0, 3).map((trait) => (
                  <Tag key={trait}>{traitLabel(trait)}</Tag>
                ))}
              </span>
            </div>
          ))}
        </div>
      </Card>
      <ValidationNote issues={derived.validation.filter((issue) => issue.step === "gear")} />
      <RunePicker
        open={Boolean(runeEntry && runeItem)}
        onClose={() => setRuneEntryId(null)}
        item={runeItem}
        entry={runeEntry}
        equipment={context.equipment}
        level={draft.level}
        expanded={contentMode === "expanded"}
        onExpandedChange={(mode) => update((current) => ({ ...current, contentMode: mode }))}
        contentModeLocked={contentModeLocked}
        legacyDefault={legacyDefault}
        legacyLocked={legacyLocked}
        onLegacyChange={(value) => update((current) => ({ ...current, includeLegacy: value }))}
        onChange={(runes) =>
          update((current) => ({
            ...current,
            equipment: current.equipment.map((entry) =>
              entry.itemId === runeEntryId ? { ...entry, runes } : entry
            ),
          }))
        }
      />
      <div className="step-actions">
        <Button variant="ghost" onClick={() => setStep("spells")}>
          Back
        </Button>
        <Button
          variant="primary"
          onClick={() => setStep("details")}
          icon={<ArrowRight size={15} />}
        >
          Details
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Details
// ---------------------------------------------------------------------------
