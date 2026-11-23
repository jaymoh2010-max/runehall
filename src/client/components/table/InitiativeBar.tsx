import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Dices,
  Plus,
  RefreshCw,
  SkipForward,
  Swords,
  Trash2,
  X,
} from "lucide-react";
import type { InitiativeEntry } from "../../../shared/types";
import { Button, IconButton } from "../ui";

function InitiativeScore({
  entry,
  onSetValue,
}: {
  entry: InitiativeEntry;
  onSetValue: (entryId: string, value: number) => void;
}) {
  const [value, setValue] = useState(String(entry.initiative));

  useEffect(() => {
    setValue(String(entry.initiative));
  }, [entry.initiative]);

  const commit = () => {
    const parsed = Math.round(Number(value) || 0);
    setValue(String(parsed));
    if (parsed !== entry.initiative) onSetValue(entry.id, parsed);
  };

  return (
    <input
      className="core-initiative-score"
      type="number"
      value={value}
      aria-label={`Initiative for ${entry.name}`}
      onChange={(event) => setValue(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
    />
  );
}

export function InitiativeBar({
  entries,
  round,
  turnIndex,
  isGm,
  onRoll,
  onClear,
  onEndRound,
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
  onClear: () => void;
  onEndRound: () => void;
  onRemove: (entryId: string) => void;
  onReroll: (entryId: string) => void;
  onMove: (entryId: string, direction: -1 | 1) => void;
  onSetValue: (entryId: string, value: number) => void;
  onAddManual: (name: string, value: number) => void;
  onSetTurn: (index: number) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualValue, setManualValue] = useState("10");
  const menuRef = useRef<HTMLDivElement>(null);
  const active = entries[turnIndex] ?? null;
  const activeIndex = active ? entries.findIndex((entry) => entry.id === active.id) : -1;

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  const submitManual = () => {
    const name = manualName.trim();
    if (!name) return;
    onAddManual(name, Math.round(Number(manualValue) || 0));
    setManualName("");
    setManualValue("10");
    setAdding(false);
    setMenuOpen(false);
  };

  return (
    <div className="initiative-bar core-initiative">
      <div className="initiative-round-block">
        <div className="initiative-round">
          <Swords size={15} />
          <div>
            <span className="tiny muted">Round</span>
            <strong>{round}</strong>
          </div>
        </div>
        <div className="initiative-meta">
          {active ? (
            <span className="core-initiative-current tiny muted" title="Current combatant">
              Current: <strong>{active.name}</strong>
            </span>
          ) : null}
          {isGm ? (
            <div className="initiative-gm-menu" ref={menuRef}>
              <Button
                size="sm"
                variant="secondary"
                icon={<Dices size={14} />}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((current) => !current)}
              >
                GM
              </Button>
              {menuOpen ? (
                <div
                  className="initiative-gm-menu-popover"
                  role="menu"
                  aria-label="GM initiative controls"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      onRoll();
                    }}
                  >
                    <Dices size={14} />
                    <span>Roll initiative</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => setAdding((current) => !current)}
                  >
                    <Plus size={14} />
                    <span>{adding ? "Cancel add" : "Add combatant"}</span>
                  </button>
                  {adding ? (
                    <form
                      className="initiative-gm-add"
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
                      <div className="initiative-gm-add-row">
                        <input
                          type="number"
                          value={manualValue}
                          aria-label="Initiative total"
                          onChange={(event) => setManualValue(event.target.value)}
                        />
                        <Button size="sm" type="submit" variant="primary">
                          Add
                        </Button>
                      </div>
                    </form>
                  ) : null}
                  <button
                    type="button"
                    role="menuitem"
                    disabled={!entries.length}
                    onClick={() => {
                      setMenuOpen(false);
                      onEndRound();
                    }}
                  >
                    <SkipForward size={14} />
                    <span>End round (start round {round + 1})</span>
                  </button>
                  {active ? (
                    <>
                      <button
                        type="button"
                        role="menuitem"
                        disabled={activeIndex <= 0}
                        onClick={() => {
                          onMove(active.id, -1);
                          setMenuOpen(false);
                        }}
                      >
                        <ArrowUp size={14} />
                        <span>Move {active.name} earlier</span>
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        disabled={activeIndex < 0 || activeIndex >= entries.length - 1}
                        onClick={() => {
                          onMove(active.id, 1);
                          setMenuOpen(false);
                        }}
                      >
                        <ArrowDown size={14} />
                        <span>Move {active.name} later</span>
                      </button>
                    </>
                  ) : null}
                  <button
                    type="button"
                    role="menuitem"
                    disabled={!entries.length}
                    onClick={() => {
                      setMenuOpen(false);
                      onClear();
                    }}
                  >
                    <Trash2 size={14} />
                    <span>Clear initiative</span>
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
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
                <InitiativeScore entry={entry} onSetValue={onSetValue} />
              ) : (
                <strong>{entry.initiative}</strong>
              )}
              {isGm ? (
                <span className="core-initiative-actions">
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
    </div>
  );
}
