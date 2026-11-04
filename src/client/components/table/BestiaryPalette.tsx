import { useEffect, useState } from "react";
import { BookOpen, GripVertical, Plus, Search, X } from "lucide-react";
import type { Monster } from "../../../shared/types";
import { api } from "../../api";
import { errorMessage } from "../../stores";
import { Button, Field, IconButton, Input, Spinner } from "../ui";
import { BESTIARY_DRAG_TYPE, type BestiaryDragPayload } from "./bestiaryDrag";

export function BestiaryPalette({
  onAdd,
  onClose,
}: {
  onAdd: (monster: Monster, count: number) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState("");
  const [count, setCount] = useState("1");
  const [monsters, setMonsters] = useState<Monster[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: query, limit: "40" });
        if (level !== "") {
          params.set("levelMin", level);
          params.set("levelMax", level);
        }
        const result = await api<{ items: Monster[]; total: number }>(
          `/api/compendium/monsters?${params.toString()}`,
        );
        setMonsters(result.items);
        setTotal(result.total);
        setError("");
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setLoading(false);
      }
    }, 220);
    return () => window.clearTimeout(timer);
  }, [query, level]);

  const groupCount = Math.max(1, Math.min(20, Number(count) || 1));

  return (
    <aside className="vtt-bestiary-palette">
      <div className="vtt-bestiary-head">
        <div>
          <span className="tiny muted">Drag to map</span>
          <h3><BookOpen size={14} /> Bestiary</h3>
        </div>
        <IconButton label="Close bestiary" onClick={onClose}>
          <X size={14} />
        </IconButton>
      </div>

      <div className="search-box">
        <Search size={14} />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search creatures…"
        />
      </div>

      <div className="vtt-bestiary-controls">
        <Field label="Level">
          <Input
            type="number"
            min={-1}
            max={30}
            value={level}
            onChange={(event) => setLevel(event.target.value)}
            placeholder="Any"
          />
        </Field>
        <Field label="Count">
          <Input
            type="number"
            min={1}
            max={20}
            value={count}
            onChange={(event) => setCount(event.target.value)}
          />
        </Field>
        <span className="tiny muted">{loading ? "Searching…" : `${monsters.length} of ${total}`}</span>
      </div>

      {error ? <div className="auth-error">{error}</div> : null}
      <p className="vtt-bestiary-hint">
        Drag a creature onto the map, or press Add to place it in the center.
        {groupCount > 1 ? ` Group of ${groupCount}.` : ""}
      </p>

      {loading ? (
        <Spinner label="Searching the bestiary…" />
      ) : (
        <div className="vtt-bestiary-list">
          {monsters.map((monster) => (
            <div
              key={monster.id}
              className="vtt-bestiary-row"
              draggable
              onDragStart={(event) => {
                const payload: BestiaryDragPayload = { monster, count: groupCount };
                event.dataTransfer.setData(BESTIARY_DRAG_TYPE, JSON.stringify(payload));
                event.dataTransfer.effectAllowed = "copy";
              }}
            >
              <GripVertical size={13} className="muted" />
              <span className="vtt-bestiary-mark">L{monster.level}</span>
              <span className="grow">
                <strong>{monster.name}</strong>
                <span className="tiny muted">{monster.hp} HP · AC {monster.ac}</span>
              </span>
              <Button
                size="sm"
                variant="ghost"
                icon={<Plus size={12} />}
                onClick={() => onAdd(monster, groupCount)}
              >
                Add
              </Button>
            </div>
          ))}
          {!monsters.length ? <p className="muted small">No creatures match that search.</p> : null}
        </div>
      )}
    </aside>
  );
}
