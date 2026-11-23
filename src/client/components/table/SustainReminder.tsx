import { BookOpen, Sparkles, X } from "lucide-react";
import { useState } from "react";
import type { CharacterRecord } from "../../../shared/types";
import { Button } from "../ui";

interface SustainReminderProps {
  character: CharacterRecord;
  canEnd: boolean;
  onEnd: (spellId: string) => void;
  onOpenSheet: () => void;
}

/**
 * Turn-start reminder for a character with active sustained spells. Acknowledging
 * the reminder is local to the turn; ending a spell updates the character.
 */
export function SustainReminder({ character, canEnd, onEnd, onOpenSheet }: SustainReminderProps) {
  const [acknowledged, setAcknowledged] = useState(false);
  const sustained = character.data.play.sustainedSpells ?? [];
  if (!sustained.length) return null;

  return (
    <div
      className={`table-sustain-reminder ${acknowledged ? "is-acknowledged" : ""}`}
      data-testid="table-sustain-reminder"
    >
      <span className="table-sustain-label">
        <Sparkles size={14} />
        {acknowledged ? "Sustained this turn" : "Sustain at the start of your turn"}
      </span>
      <div className="chip-row">
        {sustained.map((spell) => (
          <span className="table-sustain-chip" key={spell.id}>
            <strong>{spell.name}</strong>
            <em>rank {spell.rank}</em>
            {canEnd ? (
              <button
                type="button"
                className="icon-btn"
                aria-label={`End sustained ${spell.name}`}
                onClick={() => onEnd(spell.spellId)}
              >
                <X size={12} />
              </button>
            ) : null}
          </span>
        ))}
      </div>
      <div className="row" style={{ gap: 6 }}>
        <Button size="sm" variant="secondary" onClick={onOpenSheet}>
          <BookOpen size={13} /> Sheet
        </Button>
        <Button
          size="sm"
          variant={acknowledged ? "ghost" : "primary"}
          disabled={acknowledged}
          onClick={() => setAcknowledged(true)}
        >
          {acknowledged ? "Sustained" : "Sustain"}
        </Button>
      </div>
    </div>
  );
}
