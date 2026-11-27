import type { ReactNode } from "react";
import { Coins, Shield, Sparkles, Swords } from "lucide-react";
import { Link } from "react-router-dom";
import {
  ABILITY_LABELS,
  SIZES,
  VISION_LABELS,
  type ActionRef,
  type Ancestry,
  type Background,
  type BoostEntry,
  type ClassChoiceGroup,
  type ClassData,
  type ClassFeature,
  type ConditionRef,
  type Deity,
  type Equipment,
  type Feat,
  type Heritage,
  type Monster,
  type Spell,
  type Hazard,
  type Vehicle,
  type FamiliarAbility,
  type BoonCurse,
  type TraitEntry,
  type Affliction,
} from "../../shared/types";
import { titleCase, traitLabel, weaponDamageLabel } from "../../shared/rules";
import type { DomainEntry } from "../../shared/domains";
import { domainIdForName } from "../../shared/domains";
import {
  COMPENDIUM_KIND_LABELS,
  compendiumEntryPath,
  compendiumKindFromId,
  spellTraditionLabel,
  vehicleSummary,
  type CompendiumEntryKind,
} from "../../shared/compendium";
import { formatCp } from "../api";
import { PageEyebrow, RarityTag, RichText, Tag } from "./ui";

export type CompendiumEntry =
  | Ancestry
  | Heritage
  | Background
  | ClassData
  | ClassFeature
  | Feat
  | Spell
  | Equipment
  | Deity
  | DomainEntry
  | ConditionRef
  | ActionRef
  | Monster
  | Hazard
  | Vehicle
  | FamiliarAbility
  | BoonCurse
  | TraitEntry
  | Affliction;

interface CompendiumDetailProps {
  kind: CompendiumEntryKind;
  entry: CompendiumEntry;
  actions?: ReactNode;
}

export function CompendiumDetail({ kind, entry, actions }: CompendiumDetailProps) {
  const level = entryLevel(kind, entry);
  const source = "source" in entry && entry.source ? entry.source : "";
  const rarity = "rarity" in entry && entry.rarity ? entry.rarity : null;
  const traits = "traits" in entry && Array.isArray(entry.traits) ? entry.traits : [];
  const edition = "remaster" in entry ? (entry.remaster ? "Remastered" : "Legacy") : "";
  const levelLabel =
    level === null
      ? ""
      : kind === "spell"
        ? level === 0
          ? " · cantrip"
          : (entry as Spell).ritual
            ? ` · ritual rank ${level}`
            : ` · rank ${level}`
        : kind === "feat" && level === 0
          ? " · bonus"
          : ` · level ${level}`;

  // Library tab changes can leave the previous selection in state for one
  // render. Never feed a feat into the creature renderer while that settles.
  const actualKind = compendiumKindFromId(entry.id);
  if (actualKind && actualKind !== kind) {
    return (
      <div className="library-detail-body compendium-detail">
        <p className="muted small">
          This entry belongs to the {COMPENDIUM_KIND_LABELS[actualKind].toLowerCase()} category.
        </p>
      </div>
    );
  }

  return (
    <article className="library-detail-body compendium-detail">
      <div className="library-detail-head">
        <div>
          <PageEyebrow>
            {COMPENDIUM_KIND_LABELS[kind]}
            {levelLabel}
          </PageEyebrow>
          <h2>{entry.name}</h2>
          <p className="muted small">{[source, edition].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="compendium-detail-actions">
          {rarity ? <RarityTag rarity={rarity} /> : null}
          {"gmDescription" in entry && entry.gmDescription ? (
            <Tag tone="violet">GM source text</Tag>
          ) : null}
          {actions}
        </div>
      </div>

      {traits.length ? (
        <div className="chip-row" style={{ marginBottom: 12 }}>
          {traits.map((trait) => (
            <Tag key={trait}>{traitLabel(trait)}</Tag>
          ))}
        </div>
      ) : null}

      {renderBody(kind, entry)}
    </article>
  );
}

function entryLevel(kind: CompendiumEntryKind, entry: CompendiumEntry): number | null {
  switch (kind) {
    case "classFeature":
      return (entry as ClassFeature).level;
    case "feat":
      return (entry as Feat).level;
    case "spell":
      return (entry as Spell).rank;
    case "equipment":
      return (entry as Equipment).level;
    case "monster":
      return (entry as Monster).level;
    case "hazard":
      return (entry as Hazard).level;
    case "vehicle":
      return (entry as Vehicle).level;
    case "affliction":
      return (entry as Affliction).level;
    default:
      return null;
  }
}

function Description({
  html,
  empty = "No description is stored for this entry.",
}: {
  html?: string;
  empty?: string;
}) {
  return html?.trim() ? <RichText html={html} /> : <p className="muted small">{empty}</p>;
}

function MetaGrid({ children }: { children: ReactNode }) {
  return <div className="spell-meta-grid">{children}</div>;
}

function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <span>{label}</span>
      <strong>
        {children === null || children === undefined || children === "" ? "—" : children}
      </strong>
    </div>
  );
}

function boostLabels(boosts: BoostEntry[]): string[] {
  const fixed = boosts
    .filter((boost) => boost.fixed)
    .flatMap((boost) => boost.from)
    .map((ability) => ABILITY_LABELS[ability]);
  const free = boosts.filter((boost) => !boost.fixed).length;
  return [...new Set(fixed), free ? `${free} free boost${free === 1 ? "" : "s"}` : ""].filter(
    Boolean
  );
}

function listNames(values: { name: string }[] | undefined): string {
  return values?.map((value) => value.name).join(", ") || "";
}

function unknownList(values: unknown[]): string {
  return values
    .map((value) => {
      if (typeof value === "string") return value;
      if (typeof value === "number") return String(value);
      if (value && typeof value === "object") {
        return Object.entries(value as Record<string, unknown>)
          .map(([key, inner]) =>
            typeof inner === "string" || typeof inner === "number" ? `${key} ${inner}` : ""
          )
          .filter(Boolean)
          .join(" ");
      }
      return "";
    })
    .filter(Boolean)
    .join(", ");
}

function MonsterSkills({ skills }: { skills: Monster["skills"] }) {
  const entries = Object.entries(skills ?? {});
  if (!entries.length) return null;
  return (
    <div className="compendium-skill-list">
      {entries.map(([skill, value]) => {
        const modifier =
          typeof value === "number"
            ? value
            : typeof value.mod === "number"
              ? value.mod
              : value.base;
        return (
          <span key={skill}>
            {titleCase(skill)}{" "}
            <strong>
              {typeof modifier === "number" ? (modifier >= 0 ? `+${modifier}` : modifier) : "—"}
            </strong>
          </span>
        );
      })}
    </div>
  );
}

function ChoiceGroups({ groups }: { groups: ClassChoiceGroup[] }) {
  if (!groups?.length) return null;
  return (
    <div className="compendium-choice-groups">
      {groups.map((group) => (
        <div key={group.key} className="compendium-choice-group">
          <div className="tiny muted">
            {group.prompt} {group.count > 1 ? `Choose ${group.count}.` : ""}
          </div>
          <div className="chip-row">
            {group.options.map((option) => (
              <Tag key={option.id} tone="gold">
                {option.name}
              </Tag>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function renderBody(kind: CompendiumEntryKind, entry: CompendiumEntry): ReactNode {
  switch (kind) {
    case "ancestry": {
      const ancestry = entry as Ancestry;
      return (
        <>
          <MetaGrid>
            <Meta label="Hit points">
              {ancestry.hpBySize
                ? `${Math.min(...Object.values(ancestry.hpBySize))}–${Math.max(...Object.values(ancestry.hpBySize))}`
                : ancestry.hp}
            </Meta>
            <Meta label="Size">
              {ancestry.sizeChoices
                ? ancestry.sizeChoices.map((size) => SIZES[size] ?? size).join(", ")
                : (SIZES[ancestry.size] ?? ancestry.size)}
            </Meta>
            <Meta label="Speed">{ancestry.speedNote || `${ancestry.speed} ft.`}</Meta>
            <Meta label="Vision">{VISION_LABELS[ancestry.vision] ?? ancestry.vision}</Meta>
          </MetaGrid>
          <div className="compendium-facts">
            <div>
              <span>Ability boosts</span>
              <strong>{boostLabels(ancestry.boosts).join(", ") || "—"}</strong>
            </div>
            <div>
              <span>Ability flaws</span>
              <strong>
                {ancestry.flaws.map((ability) => ABILITY_LABELS[ability]).join(", ") || "—"}
              </strong>
            </div>
            <div>
              <span>Languages</span>
              <strong>{ancestry.languages.map(titleCase).join(", ") || "—"}</strong>
            </div>
            <div>
              <span>Additional languages</span>
              <strong>
                {ancestry.additionalLanguages.count
                  ? `${ancestry.additionalLanguages.count} + Int modifier`
                  : "—"}
              </strong>
            </div>
            {ancestry.otherSpeeds.length ? (
              <div>
                <span>Other speeds</span>
                <strong>
                  {ancestry.otherSpeeds
                    .map((speed) => `${speed.value} ft. ${speed.type}`)
                    .join(", ")}
                </strong>
              </div>
            ) : null}
          </div>
          <Description html={ancestry.description} />
          {ancestry.features.length ? (
            <section className="compendium-section">
              <h3>Ancestry features</h3>
              <div className="monster-abilities">
                {ancestry.features.map((feature) => (
                  <details key={`${feature.name}-${feature.level}`} open>
                    <summary>
                      <strong>{feature.name}</strong>{" "}
                      {feature.level ? (
                        <span className="tiny muted">· level {feature.level}</span>
                      ) : null}
                    </summary>
                    <RichText html={feature.description} />
                  </details>
                ))}
              </div>
            </section>
          ) : null}
        </>
      );
    }

    case "heritage": {
      const heritage = entry as Heritage;
      return (
        <>
          <MetaGrid>
            <Meta label="Ancestry">{heritage.ancestry || "Versatile"}</Meta>
            <Meta label="Versatile">{heritage.versatile ? "Yes" : "No"}</Meta>
            {heritage.speeds?.base ? (
              <Meta label="Speed">
                {heritage.speeds.base} ft.
                {(heritage.speeds.other ?? []).length
                  ? ` · ${(heritage.speeds.other ?? [])
                      .map((speed) => `${speed.value} ft. ${speed.type}`)
                      .join(", ")}`
                  : ""}
              </Meta>
            ) : null}
          </MetaGrid>
          <Description html={heritage.description} />
        </>
      );
    }

    case "background": {
      const background = entry as Background;
      return (
        <>
          <MetaGrid>
            <Meta label="Ability boosts">{boostLabels(background.boosts).join(", ")}</Meta>
            <Meta label="Trained skills">{background.trainedSkills.map(titleCase).join(", ")}</Meta>
            <Meta label="Lore">{background.lore.join(", ")}</Meta>
            <Meta label="Granted feats">{listNames(background.grantedFeats)}</Meta>
          </MetaGrid>
          {background.skillChoices.length ||
          background.loreChoices.length ||
          background.featChoices.length ? (
            <div className="compendium-facts">
              {background.skillChoices.map((choice, index) => (
                <div key={`skill-${index}`}>
                  <span>{choice.prompt}</span>
                  <strong>
                    {choice.options.map(titleCase).join(", ") ||
                      `${choice.count} choice${choice.count === 1 ? "" : "s"}`}
                  </strong>
                </div>
              ))}
              {background.loreChoices.map((choice, index) => (
                <div key={`lore-${index}`}>
                  <span>{choice.prompt}</span>
                  <strong>
                    {choice.options.join(", ") ||
                      `${choice.count} choice${choice.count === 1 ? "" : "s"}`}
                  </strong>
                </div>
              ))}
              {background.featChoices.map((choice, index) => (
                <div key={`feat-${index}`}>
                  <span>{choice.prompt}</span>
                  <strong>{listNames(choice.options)}</strong>
                </div>
              ))}
            </div>
          ) : null}
          <Description html={background.description} />
        </>
      );
    }

    case "class": {
      const cls = entry as ClassData;
      return (
        <>
          <MetaGrid>
            <Meta label="Hit points">{cls.hp}</Meta>
            <Meta label="Key ability">
              {cls.keyAbility.length
                ? cls.keyAbility.map((ability) => ABILITY_LABELS[ability]).join(" or ")
                : "Chosen by subclass"}
            </Meta>
            <Meta label="Perception">{cls.perception}</Meta>
            <Meta label="Saving throws">
              Fort {cls.savingThrows.fortitude} · Ref {cls.savingThrows.reflex} · Will{" "}
              {cls.savingThrows.will}
            </Meta>
            <Meta label="Trained skills">
              {cls.trainedSkills.value.map(titleCase).join(", ")}
              {cls.trainedSkills.additional ? ` + ${cls.trainedSkills.additional}` : ""}
            </Meta>
            {cls.skillChoices?.length ? (
              <Meta label="Skill choices">
                {cls.skillChoices
                  .map((choice) => choice.options.map(titleCase).join(" or "))
                  .join("; ")}
              </Meta>
            ) : null}
            <Meta label="Spellcasting">{cls.spellcasting ? "Yes" : "No"}</Meta>
          </MetaGrid>
          <Description html={cls.description} />
          <section className="compendium-section">
            <h3>Class features</h3>
            <div className="monster-abilities">
              {cls.features.map((feature) => (
                <details key={`${feature.id ?? feature.name}-${feature.level}`}>
                  <summary>
                    <strong>{feature.name}</strong>{" "}
                    <span className="tiny muted">· level {feature.level}</span>
                  </summary>
                  <RichText html={feature.description} />
                  <ChoiceGroups groups={feature.choiceGroups} />
                </details>
              ))}
            </div>
          </section>
        </>
      );
    }

    case "classFeature": {
      const feature = entry as ClassFeature;
      return (
        <>
          <MetaGrid>
            <Meta label="Level">{feature.level}</Meta>
            <Meta label="Action">
              {feature.actions
                ? `${feature.actions} action${feature.actions === 1 ? "" : "s"}`
                : feature.actionType || "—"}
            </Meta>
            <Meta label="Prerequisites">{unknownList(feature.prerequisites) || "—"}</Meta>
          </MetaGrid>
          <Description html={feature.description} />
        </>
      );
    }

    case "feat": {
      const feat = entry as Feat;
      return (
        <>
          <MetaGrid>
            <Meta label="Level">{feat.level}</Meta>
            <Meta label="Category">{titleCase(feat.category)}</Meta>
            <Meta label="Action">
              {feat.actions
                ? `${feat.actions} action${feat.actions === 1 ? "" : "s"}`
                : feat.actionType || "—"}
            </Meta>
          </MetaGrid>
          {feat.prerequisites.length ? (
            <div className="prereq-box">
              <strong>Prerequisites</strong>
              <ul>
                {feat.prerequisites.map((prerequisite, index) => (
                  <li key={index}>{prerequisite}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <Description html={feat.description} />
        </>
      );
    }

    case "spell": {
      const spell = entry as Spell;
      return (
        <>
          <MetaGrid>
            <Meta label="Rank">{spell.rank === 0 ? "Cantrip" : spell.rank}</Meta>
            <Meta label="Cast">{spell.actions || "—"}</Meta>
            <Meta label="Traditions">{spellTraditionLabel(spell)}</Meta>
            <Meta label="Range">{spell.range || "—"}</Meta>
            <Meta label="Area">{spell.area || "—"}</Meta>
            <Meta label="Targets">{spell.targets || "—"}</Meta>
            <Meta label="Defense">
              {spell.defense?.save
                ? `${titleCase(spell.defense.save)}${spell.defense.basic ? " (basic)" : ""}`
                : "—"}
            </Meta>
            <Meta label="Duration">{spell.duration || "—"}</Meta>
            <Meta label="Cost">{spell.cost || "—"}</Meta>
            <Meta label="Requirements">{spell.requirements || "—"}</Meta>
          </MetaGrid>
          {spell.damageText ? (
            <div className="damage-callout">
              <Swords size={14} /> {spell.damageText}
            </div>
          ) : null}
          {spell.heightening?.damage?.length || spell.heightening?.area ? (
            <div className="compendium-heightening">
              <strong>Heightening</strong>
              <span>
                {spell.heightening?.type ? `${spell.heightening.type} ` : ""}
                {spell.heightening?.interval ? `+${spell.heightening.interval} · ` : ""}
                {spell.heightening?.damage
                  ?.map((part) => `${part.formula} ${part.type}`)
                  .join(", ")}
                {spell.heightening?.area ? ` area +${spell.heightening.area} ft.` : ""}
              </span>
            </div>
          ) : null}
          <Description html={spell.description} />
        </>
      );
    }

    case "equipment": {
      const item = entry as Equipment;
      return (
        <>
          <MetaGrid>
            <Meta label="Type">{titleCase(item.type)}</Meta>
            <Meta label="Level">{item.level}</Meta>
            <Meta label="Price">
              <Coins size={12} /> {formatCp(item.price.cpTotal)}
            </Meta>
            <Meta label="Bulk">{item.bulk || "—"}</Meta>
            <Meta label="Usage">{item.usage || "—"}</Meta>
            {item.weapon ? <Meta label="Damage">{weaponDamageLabel(item.weapon)}</Meta> : null}
            {item.weapon ? <Meta label="Category">{titleCase(item.weapon.category)}</Meta> : null}
            {item.armor ? (
              <Meta label="AC">
                <Shield size={12} /> +{item.armor.acBonus} · Dex cap +{item.armor.dexCap}
              </Meta>
            ) : null}
            {item.armor ? (
              <Meta label="Armor traits">
                Check {item.armor.checkPenalty} · Speed {item.armor.speedPenalty} · Str{" "}
                {item.armor.strength}
              </Meta>
            ) : null}
            {item.shield ? (
              <Meta label="Shield">
                +{item.shield.acBonus} AC · hardness {item.shield.hardness} · HP {item.shield.hp}
              </Meta>
            ) : null}
            {item.consumable ? (
              <Meta label="Consumable">
                {titleCase(item.consumable.category)} · {item.consumable.uses ?? "—"} uses
              </Meta>
            ) : null}
          </MetaGrid>
          <Description
            html={item.description}
            empty="No separate rules text is provided for this item in the source data."
          />
        </>
      );
    }

    case "deity": {
      const deity = entry as Deity;
      return (
        <>
          <MetaGrid>
            <Meta label="Category">{titleCase(deity.category)}</Meta>
            <Meta label="Divine font">{deity.font.map(titleCase).join(", ")}</Meta>
            <Meta label="Skill">{deity.skill.map(titleCase).join(" or ")}</Meta>
            <Meta label="Domains">
              {deity.domains.length
                ? deity.domains.map((domain, index) => (
                    <span key={domain}>
                      {index > 0 ? ", " : ""}
                      <Link to={compendiumEntryPath("domain", domainIdForName(domain))}>
                        {titleCase(domain)}
                      </Link>
                    </span>
                  ))
                : "—"}
            </Meta>
            <Meta label="Alternate domains">
              {deity.alternateDomains.length
                ? deity.alternateDomains.map((domain, index) => (
                    <span key={domain}>
                      {index > 0 ? ", " : ""}
                      <Link to={compendiumEntryPath("domain", domainIdForName(domain))}>
                        {titleCase(domain)}
                      </Link>
                    </span>
                  ))
                : "—"}
            </Meta>
            <Meta label="Favored weapon">{deity.weapons.map(titleCase).join(", ")}</Meta>
            <Meta label="Sanctification">
              {(() => {
                const sanctification = deity.sanctification ?? {};
                const what = Array.isArray(sanctification.what)
                  ? sanctification.what.map(titleCase).join(" or ")
                  : "";
                const base = what
                  ? `${sanctification.modal === "must" ? "Must choose" : "Can choose"} ${what}`
                  : "None";
                return deity.sanctificationNote ? `${base} (${deity.sanctificationNote})` : base;
              })()}
            </Meta>
            <Meta label="Deity spells">
              {Object.entries(deity.spells)
                .sort(([a], [b]) => Number(a) - Number(b))
                .map(([rank, spell]) => `${rank}: ${spell.name}`)
                .join(" · ") || "None listed"}
            </Meta>
          </MetaGrid>
          <Description html={deity.description} />
        </>
      );
    }

    case "domain": {
      const domain = entry as DomainEntry;
      const spellRef = (spell: DomainEntry["domainSpell"]) =>
        spell.id ? (
          <Link to={compendiumEntryPath("spell", spell.id)}>{spell.name}</Link>
        ) : (
          spell.name || "—"
        );
      return (
        <>
          <MetaGrid>
            <Meta label="Domain spell">{spellRef(domain.domainSpell)}</Meta>
            <Meta label="Advanced domain spell">{spellRef(domain.advancedDomainSpell)}</Meta>
            <Meta label="Deities">{domain.deities.join(", ") || "—"}</Meta>
            <Meta label="Alternate deities">{domain.alternateDeities.join(", ") || "—"}</Meta>
            <Meta label="Covenants">{domain.covenants.join(", ") || "—"}</Meta>
            <Meta label="Alternate covenants">{domain.alternateCovenants.join(", ") || "—"}</Meta>
            <Meta label="Pantheons">{domain.pantheons.join(", ") || "—"}</Meta>
            <Meta label="Alternate pantheons">{domain.alternatePantheons.join(", ") || "—"}</Meta>
            <Meta label="Oracle mysteries">{domain.mysteries.join(", ") || "—"}</Meta>
            <Meta label="Legacy names">{domain.aliases.join(", ") || "—"}</Meta>
          </MetaGrid>
          <Description html={domain.description} />
        </>
      );
    }

    case "condition": {
      const condition = entry as ConditionRef;
      return (
        <>
          <MetaGrid>
            <Meta label="Source">{condition.source}</Meta>
            <Meta label="Edition">{condition.remaster ? "Remastered" : "Legacy"}</Meta>
          </MetaGrid>
          <Description html={condition.description} />
        </>
      );
    }

    case "action": {
      const action = entry as ActionRef;
      return (
        <>
          <MetaGrid>
            <Meta label="Category">{titleCase(action.category)}</Meta>
            <Meta label="Action">
              {action.actions
                ? `${action.actions} action${action.actions === 1 ? "" : "s"}`
                : action.actionType || "—"}
            </Meta>
          </MetaGrid>
          <Description html={action.description} />
        </>
      );
    }

    case "monster": {
      const monster = entry as Monster;
      return (
        <>
          <div className="monster-stat-grid">
            <div>
              <span>HP</span>
              <strong>{monster.hp}</strong>
            </div>
            <div>
              <span>AC</span>
              <strong>{monster.ac}</strong>
            </div>
            <div>
              <span>Fort</span>
              <strong>{monster.fortitude}</strong>
            </div>
            <div>
              <span>Ref</span>
              <strong>{monster.reflex}</strong>
            </div>
            <div>
              <span>Will</span>
              <strong>{monster.will}</strong>
            </div>
            <div>
              <span>Perception</span>
              <strong>{monster.perception}</strong>
            </div>
            <div>
              <span>Size</span>
              <strong>{SIZES[monster.size] ?? monster.size}</strong>
            </div>
            <div>
              <span>Speed</span>
              <strong>{monster.speeds?.base ?? 0} ft.</strong>
            </div>
          </div>
          <div className="compendium-facts">
            {monster.immunities?.length ? (
              <div>
                <span>Immunities</span>
                <strong>{unknownList(monster.immunities) || "—"}</strong>
              </div>
            ) : null}
            {monster.weaknesses?.length ? (
              <div>
                <span>Weaknesses</span>
                <strong>{unknownList(monster.weaknesses) || "—"}</strong>
              </div>
            ) : null}
            {monster.resistances?.length ? (
              <div>
                <span>Resistances</span>
                <strong>{unknownList(monster.resistances) || "—"}</strong>
              </div>
            ) : null}
            {monster.speeds.other?.length ? (
              <div>
                <span>Other speeds</span>
                <strong>
                  {monster.speeds.other
                    .map((speed) => `${speed.value} ft. ${speed.type}`)
                    .join(", ")}
                </strong>
              </div>
            ) : null}
          </div>
          <MonsterSkills skills={monster.skills} />
          {monster.attacks.length ? (
            <section className="monster-attacks">
              <h3>
                <Swords size={14} /> Attacks
              </h3>
              {monster.attacks.map((attack) => (
                <div key={`${attack.name}-${attack.bonus}`} className="monster-attack-row">
                  <strong>{attack.name}</strong>
                  <span className="mono">
                    {attack.bonus >= 0 ? `+${attack.bonus}` : attack.bonus}
                  </span>
                  <span className={attack.damage ? undefined : "muted"}>
                    {attack.damage || "No damage"}
                  </span>
                  {attack.effects.length ? (
                    <span className="muted small">{attack.effects.join(", ")}</span>
                  ) : null}
                  <span className="chip-row">
                    {attack.traits.map((trait) => (
                      <Tag key={trait}>{traitLabel(trait)}</Tag>
                    ))}
                  </span>
                </div>
              ))}
            </section>
          ) : null}
          {monster.abilities.length ? (
            <section className="monster-abilities">
              <h3>
                <Sparkles size={14} /> Abilities
              </h3>
              {monster.abilities.map((ability) => (
                <details key={`${ability.name}-${ability.type}`}>
                  <summary>
                    <strong>{ability.name}</strong>
                    {ability.actions ? (
                      <span className="tiny muted"> · {ability.actions}</span>
                    ) : null}
                    {ability.traits.length ? (
                      <span className="tiny muted">
                        {" "}
                        · {ability.traits.map(traitLabel).join(", ")}
                      </span>
                    ) : null}
                  </summary>
                  <RichText html={ability.description} />
                </details>
              ))}
            </section>
          ) : null}
          <Description
            html={monster.description || monster.blurb}
            empty="No description is stored for this creature."
          />
        </>
      );
    }
    case "hazard": {
      const hazard = entry as Hazard;
      return (
        <>
          <MetaGrid>
            <Meta label="Complexity">{titleCase(hazard.complexity)}</Meta>
            <Meta label="Stealth">{hazard.stealth ?? "—"}</Meta>
            <Meta label="AC">{hazard.ac ?? "—"}</Meta>
            <Meta label="Hardness">{hazard.hardness}</Meta>
            <Meta label="HP">{hazard.hp || "—"}</Meta>
            <Meta label="Fort">{hazard.fortitude}</Meta>
            <Meta label="Ref">{hazard.reflex}</Meta>
            <Meta label="Will">{hazard.will}</Meta>
          </MetaGrid>
          <Description
            html={hazard.description}
            empty="No description is stored for this hazard."
          />
          {hazard.disable ? (
            <section className="compendium-section">
              <h3>Disable</h3>
              <RichText html={hazard.disable} />
            </section>
          ) : null}
          {hazard.routine ? (
            <section className="compendium-section">
              <h3>Routine</h3>
              <RichText html={hazard.routine} />
            </section>
          ) : null}
          {hazard.reset ? (
            <section className="compendium-section">
              <h3>Reset</h3>
              <RichText html={hazard.reset} />
            </section>
          ) : null}
          {hazard.abilities.length ? (
            <section className="monster-abilities">
              <h3>
                <Sparkles size={14} /> Abilities
              </h3>
              {hazard.abilities.map((ability) => (
                <details key={`${ability.name}-${ability.type}`}>
                  <summary>
                    <strong>{ability.name}</strong>
                    {ability.actions ? (
                      <span className="tiny muted"> · {ability.actions}</span>
                    ) : null}
                  </summary>
                  <RichText html={ability.description} />
                </details>
              ))}
            </section>
          ) : null}
        </>
      );
    }
    case "vehicle": {
      const vehicle = entry as Vehicle;
      return (
        <>
          <MetaGrid>
            <Meta label="Price">{vehicle.priceGp.toLocaleString()} gp</Meta>
            <Meta label="AC">{vehicle.ac}</Meta>
            <Meta label="Hardness">{vehicle.hardness}</Meta>
            <Meta label="HP">{vehicle.hp}</Meta>
            <Meta label="Speed">{vehicle.speed || "—"}</Meta>
            <Meta label="Size">{SIZES[vehicle.size] ?? vehicle.size}</Meta>
            <Meta label="Crew">{vehicle.crew || "—"}</Meta>
            <Meta label="Passengers">{vehicle.passengers || "—"}</Meta>
            <Meta label="Piloting">{vehicle.pilotingCheck || "—"}</Meta>
            <Meta label="Collision">{vehicle.collisionDC || "—"}</Meta>
            <Meta label="Collision damage">{vehicle.collisionDamage || "—"}</Meta>
          </MetaGrid>
          <Description html={vehicle.description} empty={vehicleSummary(vehicle)} />
          {vehicle.abilities.length ? (
            <section className="monster-abilities">
              <h3>
                <Sparkles size={14} /> Abilities
              </h3>
              {vehicle.abilities.map((ability) => (
                <details key={`${ability.name}-${ability.type}`}>
                  <summary>
                    <strong>{ability.name}</strong>
                  </summary>
                  <RichText html={ability.description} />
                </details>
              ))}
            </section>
          ) : null}
        </>
      );
    }
    case "familiarAbility": {
      const ability = entry as FamiliarAbility;
      return <Description html={ability.description} />;
    }
    case "boonCurse": {
      const boon = entry as BoonCurse;
      return (
        <>
          <MetaGrid>
            <Meta label="Type">{boon.category === "boon" ? "Boon" : "Curse"}</Meta>
            <Meta label="Tier">{titleCase(boon.tier) || "—"}</Meta>
            <Meta label="Deity">{boon.deity}</Meta>
          </MetaGrid>
          <Description html={boon.description} />
        </>
      );
    }
    case "trait": {
      const trait = entry as TraitEntry;
      return (
        <>
          {trait.group.length ? (
            <MetaGrid>
              <Meta label="Group">{trait.group.join(", ")}</Meta>
            </MetaGrid>
          ) : null}
          <Description html={trait.description} empty="No trait description is stored." />
        </>
      );
    }
    case "affliction": {
      const affliction = entry as Affliction;
      const label =
        affliction.category === "disease"
          ? "Disease"
          : affliction.category === "poison"
            ? "Poison"
            : "Curse";
      return (
        <>
          <MetaGrid>
            <Meta label="Type">{label}</Meta>
            <Meta label="Level">{affliction.level}</Meta>
            <Meta label="Saving throw">{affliction.savingThrow || "—"}</Meta>
            <Meta label="Onset">{affliction.onset || "—"}</Meta>
            <Meta label="Duration">{affliction.duration || "—"}</Meta>
            <Meta label="Usage">{affliction.usage || "—"}</Meta>
            {affliction.priceCp != null ? (
              <Meta label="Price">{formatCp(affliction.priceCp)}</Meta>
            ) : null}
          </MetaGrid>
          <Description html={affliction.description} />
          {affliction.stages.length ? (
            <section className="compendium-section">
              <h3>Stages</h3>
              <ol className="compendium-stage-list">
                {affliction.stages.map((stage, index) => (
                  <li key={index}>{stage}</li>
                ))}
              </ol>
            </section>
          ) : null}
        </>
      );
    }
  }
}
