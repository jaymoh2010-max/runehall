import { Minus, Sparkles, Star } from "lucide-react";
import { APPARITION_BY_ID, ANIMIST_APPARITIONS } from "../../shared/apparitions";
import {
  addAttunedApparition,
  animistApparitionInfo,
  canAttuneApparition,
  removeAttunedApparition,
  setPrimaryApparition,
} from "../../shared/rules";
import type { CharacterContext, CharacterDraft } from "../../shared/types";
import { Button, Card, Select, Tag } from "./ui";

interface AnimistApparitionsCardProps {
  draft: CharacterDraft;
  context: CharacterContext;
  onChange: (updater: (draft: CharacterDraft) => CharacterDraft) => void;
  title?: string;
}

/** Shared animist attunement and apparition-slot editor for the builder and daily prep. */
export function AnimistApparitionsCard({
  draft,
  context,
  onChange,
  title = "Apparitions",
}: AnimistApparitionsCardProps) {
  const info = animistApparitionInfo(draft, context);
  if (!info) return null;

  const attuned = draft.spells.attunedApparitions;
  const primaryId = info.primaryId;
  const room = canAttuneApparition(
    draft,
    context.classData,
    ANIMIST_APPARITIONS.find((apparition) => !attuned.includes(apparition.id))?.id ?? ""
  );
  const available = ANIMIST_APPARITIONS.filter((apparition) => !attuned.includes(apparition.id));

  return (
    <Card className="spell-section" data-testid="animist-apparitions">
      <div className="row-between">
        <div>
          <h3>{title}</h3>
          <p className="muted small">
            Choose {info.maxAttuned} apparitions during daily preparations and mark one as primary.
            Their spells form a spontaneous repertoire that only uses apparition slots.
          </p>
        </div>
        <Tag tone={attuned.length === info.maxAttuned ? "gold" : "blue"}>
          {attuned.length} / {info.maxAttuned} attuned
        </Tag>
      </div>

      <div className="prepared-adder" style={{ marginTop: 10 }}>
        <Select
          aria-label="Apparition to attune"
          value=""
          disabled={!room}
          onChange={(event) => {
            const id = event.target.value;
            if (!id) return;
            onChange((current) => addAttunedApparition(current, context.classData, id));
          }}
        >
          <option value="">{room ? "Attune an apparition…" : "Attunement full"}</option>
          {available.map((apparition) => (
            <option key={apparition.id} value={apparition.id}>
              {apparition.name}
            </option>
          ))}
        </Select>
        <span className="tiny muted">
          {attuned.length < info.maxAttuned
            ? `${info.maxAttuned - attuned.length} more required`
            : "All attunements chosen"}
        </span>
      </div>

      <div className="stack" style={{ gap: 10, marginTop: 12 }}>
        {attuned.map((id) => {
          const definition = APPARITION_BY_ID.get(id);
          const entry = info.attuned.find((apparition) => apparition.id === id);
          if (!definition || !entry) return null;
          const isPrimary = primaryId === id;
          const spells = [...(entry.cantrip ? [entry.cantrip] : []), ...entry.spells];
          return (
            <div
              key={id}
              className="prepared-at-rank"
              style={{ padding: "10px 12px" }}
              data-testid={`apparition-${definition.name.replace(/\s+/g, "-").toLowerCase()}`}
            >
              <div className="row-between">
                <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <strong>{definition.name}</strong>
                  {isPrimary ? (
                    <Tag tone="gold">
                      <Star size={11} /> Primary
                    </Tag>
                  ) : null}
                  <span className="tiny muted">{definition.skills.join(" · ")}</span>
                </div>
                <div className="row" style={{ gap: 6 }}>
                  {!isPrimary ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        onChange((current) => setPrimaryApparition(current, context.classData, id))
                      }
                    >
                      Set primary
                    </Button>
                  ) : null}
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Dismiss ${definition.name}`}
                    onClick={() =>
                      onChange((current) => removeAttunedApparition(current, context.classData, id))
                    }
                  >
                    <Minus size={13} />
                  </button>
                </div>
              </div>
              <div className="chip-row" style={{ marginTop: 8 }}>
                {spells.map((spell) => (
                  <Tag key={spell.id} tone={spell.rank === 0 ? "blue" : "gold"}>
                    {spell.name}
                    {spell.rank ? ` · rank ${spell.rank}` : " · cantrip"}
                  </Tag>
                ))}
              </div>
              {entry.vesselSpell ? (
                <p className="tiny muted" style={{ margin: "8px 0 0" }}>
                  <Sparkles size={11} /> Vessel focus spell: {entry.vesselSpell.name}
                </p>
              ) : null}
            </div>
          );
        })}
        {!attuned.length ? (
          <p className="muted small">
            No apparitions attuned. Choose your daily apparitions above.
          </p>
        ) : null}
      </div>

      <div className="slot-rows" style={{ marginTop: 12 }}>
        {info.slots.map((count, index) => {
          const rank = index + 1;
          const used = Math.max(
            0,
            Math.min(count, Math.round(Number(draft.spells.apparitionUsed[String(rank)]) || 0))
          );
          return (
            <div className="slot-row" key={`apparition-slot-${rank}`}>
              <span className="slot-rank">Apparition rank {rank}</span>
              <div className="slot-pips">
                {Array.from({ length: count }).map((_pip, pip) => (
                  <button
                    key={pip}
                    type="button"
                    className={`slot-pip ${pip < used ? "is-used" : ""}`}
                    title={pip < used ? "Restore apparition slot" : "Spend apparition slot"}
                    onClick={() =>
                      onChange((current) => ({
                        ...current,
                        spells: {
                          ...current.spells,
                          apparitionUsed: {
                            ...current.spells.apparitionUsed,
                            [String(rank)]: pip < used ? pip : pip + 1,
                          },
                        },
                      }))
                    }
                  />
                ))}
              </div>
              <span className="tiny muted">
                {count - used} of {count} left
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
