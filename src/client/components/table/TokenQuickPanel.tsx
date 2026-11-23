import { useState } from "react";
import { Dices, Eye, EyeOff, Lock, Unlock, Trash2, UserRound, X } from "lucide-react";
import type { CharacterRecord, Token } from "../../../shared/types";
import { Avatar, Button, IconButton, Tag } from "../ui";

export function TokenQuickPanel({
  token,
  characters,
  isGm,
  canManage,
  onClose,
  onUpdate,
  onDelete,
  onOpenCharacter,
  onAddToInitiative,
}: {
  token: Token;
  characters: CharacterRecord[];
  isGm: boolean;
  canManage: boolean;
  onClose: () => void;
  onUpdate: (patch: Partial<Token>) => void;
  onDelete: () => void;
  onOpenCharacter: (characterId: string) => void;
  onAddToInitiative: () => void;
}) {
  const [condition, setCondition] = useState("");
  const character = token.characterId
    ? (characters.find((entry) => entry.id === token.characterId) ?? null)
    : null;
  const maxHp = token.hpMax;
  const currentHp = token.hpCurrent ?? maxHp ?? 0;

  const setHp = (value: number) => {
    const next =
      maxHp !== null
        ? Math.max(0, Math.min(maxHp, Math.round(value)))
        : Math.max(0, Math.round(value));
    onUpdate({ hpCurrent: next });
  };

  const addCondition = () => {
    const name = condition.trim();
    if (!name) return;
    if (token.conditions.some((entry) => entry.name.toLowerCase() === name.toLowerCase())) {
      setCondition("");
      return;
    }
    onUpdate({ conditions: [...token.conditions, { name, value: null, duration: null }] });
    setCondition("");
  };

  const updateCondition = (
    index: number,
    patch: { value?: number | null; duration?: number | null }
  ) => {
    onUpdate({
      conditions: token.conditions.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, ...patch } : entry
      ),
    });
  };

  const removeCondition = (index: number) => {
    onUpdate({ conditions: token.conditions.filter((_entry, entryIndex) => entryIndex !== index) });
  };

  const numberOrNull = (value: string) => (value === "" ? null : Number(value) || 0);

  return (
    <aside className="core-token-panel" aria-label={`${token.name} token details`}>
      <div className="core-token-head">
        <Avatar name={token.name} src={token.imageUrl} size={40} />
        <div className="grow">
          <strong>{token.name}</strong>
          <span className="tiny muted">
            {character
              ? `Level ${character.summary?.level ?? "?"} ${character.summary?.className ?? ""}`
              : token.groupId
                ? "Monster group"
                : "Token"}
          </span>
        </div>
        <IconButton label="Close token details" onClick={onClose}>
          <X size={14} />
        </IconButton>
      </div>

      <div className="core-token-stats">
        <div className="core-token-hp">
          <span className="tiny muted">Hit points</span>
          <div className="core-hp-row">
            <Button size="sm" variant="ghost" onClick={() => setHp(currentHp - 5)}>
              −5
            </Button>
            <input
              type="number"
              aria-label="Current hit points"
              value={currentHp}
              onChange={(event) => setHp(Number(event.target.value) || 0)}
            />
            <span className="muted">/ {maxHp ?? "—"}</span>
            <Button size="sm" variant="ghost" onClick={() => setHp(currentHp + 5)}>
              +5
            </Button>
          </div>
        </div>
        <div className="core-token-ac">
          <span className="tiny muted">AC</span>
          {isGm ? (
            <input
              type="number"
              aria-label="Armor class"
              value={token.ac ?? ""}
              onChange={(event) =>
                onUpdate({ ac: event.target.value === "" ? null : Number(event.target.value) || 0 })
              }
            />
          ) : (
            <strong>{token.ac ?? "—"}</strong>
          )}
        </div>
      </div>

      <div className="core-token-conditions">
        <span className="tiny muted">Conditions</span>
        {token.conditions.length ? (
          <div className="core-token-condition-list">
            {token.conditions.map((entry, index) =>
              canManage ? (
                <div className="core-token-condition" key={`${entry.name}-${index}`}>
                  <span className="core-token-condition-name">{entry.name}</span>
                  <input
                    type="number"
                    value={entry.value ?? ""}
                    placeholder="Val"
                    aria-label={`Value for ${entry.name}`}
                    onChange={(event) =>
                      updateCondition(index, { value: numberOrNull(event.target.value) })
                    }
                  />
                  <input
                    type="number"
                    value={entry.duration ?? ""}
                    placeholder="Rds"
                    aria-label={`Duration for ${entry.name}`}
                    onChange={(event) =>
                      updateCondition(index, { duration: numberOrNull(event.target.value) })
                    }
                  />
                  <IconButton label={`Remove ${entry.name}`} onClick={() => removeCondition(index)}>
                    <X size={11} />
                  </IconButton>
                </div>
              ) : (
                <Tag key={`${entry.name}-${index}`} tone="red">
                  {entry.name}
                  {entry.value ? ` ${entry.value}` : ""}
                  {entry.duration ? ` (${entry.duration}r)` : ""}
                </Tag>
              )
            )}
          </div>
        ) : (
          <span className="tiny muted">None</span>
        )}
        {canManage ? (
          <form
            className="core-condition-add"
            onSubmit={(event) => {
              event.preventDefault();
              addCondition();
            }}
          >
            <input
              value={condition}
              placeholder="Add condition"
              aria-label="Add condition"
              onChange={(event) => setCondition(event.target.value)}
            />
            <Button size="sm" type="submit" variant="secondary">
              Add
            </Button>
          </form>
        ) : null}
      </div>

      {isGm ? (
        <details className="core-token-edit">
          <summary>Edit token</summary>
          <label>
            <span>Name</span>
            <input
              value={token.name}
              maxLength={80}
              onChange={(event) => onUpdate({ name: event.target.value })}
            />
          </label>
          <label>
            <span>Image URL</span>
            <input
              value={token.imageUrl ?? ""}
              placeholder="https://…"
              onChange={(event) => onUpdate({ imageUrl: event.target.value || null })}
            />
          </label>
          <label>
            <span>Size</span>
            <select
              value={token.size}
              onChange={(event) => onUpdate({ size: Number(event.target.value) || 1 })}
            >
              {[1, 2, 3, 4].map((size) => (
                <option key={size} value={size}>
                  {size}×{size}
                </option>
              ))}
            </select>
          </label>
        </details>
      ) : null}

      <div className="core-token-actions">
        {character ? (
          <Button
            size="sm"
            variant="secondary"
            icon={<UserRound size={14} />}
            onClick={() => onOpenCharacter(character.id)}
          >
            Open sheet
          </Button>
        ) : null}
        {isGm ? (
          <Button size="sm" variant="ghost" icon={<Dices size={14} />} onClick={onAddToInitiative}>
            Add to initiative
          </Button>
        ) : null}
        {isGm ? (
          <>
            <IconButton
              label={token.hidden ? "Reveal token to players" : "Hide token from players"}
              onClick={() => onUpdate({ hidden: !token.hidden })}
            >
              {token.hidden ? <EyeOff size={14} /> : <Eye size={14} />}
            </IconButton>
            <IconButton
              label={token.locked ? "Unlock token" : "Lock token"}
              onClick={() => onUpdate({ locked: !token.locked })}
            >
              {token.locked ? <Lock size={14} /> : <Unlock size={14} />}
            </IconButton>
            <IconButton label="Delete token" onClick={onDelete}>
              <Trash2 size={14} />
            </IconButton>
          </>
        ) : null}
      </div>
    </aside>
  );
}
