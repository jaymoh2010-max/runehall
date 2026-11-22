import { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Dices,
  Plus,
  RefreshCw,
  Swords,
  Trash2,
  X,
} from "lucide-react";
import type { InitiativeEntry } from "../../../shared/types";
import { Button, IconButton } from "../ui";

export function InitiativeBar({
  entries,
  round,
  turnIndex,
  isGm,
  onRoll,
  onNext,
  onPrevious,
  onClear,
  onRemove,
  onReroll,
  onMove,
  onSetValue,
  onAddManual,
  onSetTurn,
}: {
  entries: InitiativeEntry[];
  round: number;
  turnIndex: number;
  isGm: boolean;
  onRoll: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onClear: () => void;
  onRemove: (entryId: string) => void;
  onReroll: (entryId: string) => void;
  onMove: (entryId: string, direction: -1 | 1) => void;
  onSetValue: (entryId: string, value: number) => void;
  onAddManual: (name: string, value: number) => void;
  onSetTurn: (index: number) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualValue, setManualValue] = useState("10");
  const active = entries[turnIndex] ?? null;

  const submitManual = () => {
    const name = manualName.trim();
    if (!name) return;
    onAddManual(name, Math.round(Number(manualValue) || 0));
    setManualName("");
    setManualValue("10");
    setAdding(false);
  };

  return (
    <div className="initiative-bar core-initiative">
      <div className="initiative-round">
        <Swords size={15} />
        <div>
          <span className="tiny muted">Round</span>
          <strong>{round}</strong>
        </div>
      </div>

      <div className="initiative-track" aria-label="Initiative order">
        {entries.length ? (
          entries.map((entry, index) => (
            <div
              key={entry.id}
              className={`initiative-chip core-initiative-row ${index === turnIndex ? "is-active" : ""}`}
            >
              <button
                type="button"
                className="initiative-order"
                title={`Set ${entry.name} as the active combatant`}
                onClick={() => onSetTurn(index)}
              >
                {index + 1}
              </button>
              <span className="initiative-color" style={{ background: entry.color }} />
              <span className="initiative-name">{entry.name}</span>
              {isGm ? (
                <input
                  className="core-initiative-score"
                  type="number"
                  value={entry.initiative}
                  aria-label={`Initiative for ${entry.name}`}
                  onChange={(event) => onSetValue(entry.id, Number(event.target.value) || 0)}
                />
              ) : (
                <strong>{entry.initiative}</strong>
              )}
              {isGm ? (
                <span className="core-initiative-actions">
                  <IconButton
                    label={`Move ${entry.name} earlier`}
                    onClick={() => onMove(entry.id, -1)}
                    disabled={index === 0}
                  >
                    <ArrowUp size={12} />
                  </IconButton>
                  <IconButton
                    label={`Move ${entry.name} later`}
                    onClick={() => onMove(entry.id, 1)}
                    disabled={index === entries.length - 1}
                  >
                    <ArrowDown size={12} />
                  </IconButton>
                  <IconButton
                    label={`Reroll initiative for ${entry.name}`}
                    onClick={() => onReroll(entry.id)}
                  >
                    <RefreshCw size={12} />
                  </IconButton>
                  <IconButton
                    label={`Remove ${entry.name} from initiative`}
                    onClick={() => onRemove(entry.id)}
                  >
                    <X size={12} />
                  </IconButton>
                </span>
              ) : null}
            </div>
          ))
        ) : (
          <span className="initiative-empty tiny muted">
            No combatants yet. Roll the scene or add names by hand.
          </span>
        )}
      </div>

      <div className="initiative-controls core-initiative-controls">
        {isGm ? (
          <>
            <Button size="sm" variant="secondary" icon={<Dices size={14} />} onClick={onRoll}>
              Roll initiative
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon={<Plus size={14} />}
              onClick={() => setAdding((current) => !current)}
            >
              Add
            </Button>
          </>
        ) : null}
        <IconButton label="Previous turn" onClick={onPrevious} disabled={!entries.length}>
          <ChevronLeft size={14} />
        </IconButton>
        <IconButton label="Next turn" onClick={onNext} disabled={!entries.length}>
          <ChevronRight size={14} />
        </IconButton>
        {isGm ? (
          <IconButton label="Clear initiative" onClick={onClear} disabled={!entries.length}>
            <Trash2 size={14} />
          </IconButton>
        ) : null}
      </div>

      {adding ? (
        <form
          className="core-initiative-add"
          onSubmit={(event) => {
            event.preventDefault();
            submitManual();
          }}
        >
          <input
            autoFocus
            value={manualName}
            placeholder="Combatant name"
            aria-label="Combatant name"
            onChange={(event) => setManualName(event.target.value)}
          />
          <input
            type="number"
            value={manualValue}
            aria-label="Initiative total"
            onChange={(event) => setManualValue(event.target.value)}
          />
          <Button size="sm" type="submit" variant="primary">
            Add
          </Button>
        </form>
      ) : null}

      {active ? (
        <span className="core-initiative-current tiny muted" title="Current combatant">
          Current: <strong>{active.name}</strong>
        </span>
      ) : null}
    </div>
  );
}
