import { useEffect, useRef, useState, type InputHTMLAttributes } from "react";
import { Dices, Eye, EyeOff, ImagePlus, Lock, Unlock, Trash2, UserRound, X } from "lucide-react";
import type { CharacterRecord, Token } from "../../../shared/types";
import { creatureAvatarDataUrl } from "../../../shared/creatureAvatar";
import { canSeeCreatureStats } from "../../../shared/tokenVisibility";
import { uploadImage } from "../../api";
import { useConditionOptions } from "../../conditionOptions";
import { errorMessage } from "../../stores";
import { Avatar, Button, IconButton, Tag } from "../ui";

/**
 * Token fields commit on blur or Enter. Sending an update per keystroke makes
 * the socket echo fight the caret and floods the table with broadcasts.
 */
function TokenInput({
  value,
  onCommit,
  ...props
}: {
  value: string;
  onCommit: (value: string) => void;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "onBlur" | "onKeyDown">) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const commit = () => {
    if (draft !== value) onCommit(draft);
  };

  return (
    <input
      {...props}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
    />
  );
}

export function TokenQuickPanel({
  token,
  campaignId,
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
  campaignId: string;
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
  const [imageBusy, setImageBusy] = useState(false);
  const [imageError, setImageError] = useState("");
  const imageInputRef = useRef<HTMLInputElement>(null);
  const conditions = useConditionOptions();
  const character = token.characterId
    ? (characters.find((entry) => entry.id === token.characterId) ?? null)
    : null;
  const maxHp = token.hpMax;
  const currentHp = token.hpCurrent ?? maxHp ?? 0;
  const showVitals = canSeeCreatureStats(token, isGm);
  const avatarSrc =
    token.imageUrl ??
    character?.summary?.portraitUrl ??
    (token.characterId ? null : creatureAvatarDataUrl(token.name, token.monsterId ?? token.name));

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

  const uploadArt = async (file: File | null | undefined) => {
    if (!file) return;
    setImageBusy(true);
    setImageError("");
    try {
      const result = await uploadImage(file, campaignId);
      onUpdate({ imageUrl: result.url });
    } catch (error) {
      setImageError(errorMessage(error));
    } finally {
      setImageBusy(false);
    }
  };

  return (
    <aside className="core-token-panel" aria-label={`${token.name} token details`}>
      <div className="core-token-head">
        <Avatar name={token.name} src={avatarSrc} size={40} />
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

      {showVitals ? (
        <div className="core-token-stats">
          <div className="core-token-hp">
            <span className="tiny muted">Hit points</span>
            <div className="core-hp-row">
              <Button size="sm" variant="ghost" onClick={() => setHp(currentHp - 5)}>
                −5
              </Button>
              <TokenInput
                type="number"
                aria-label="Current hit points"
                value={String(currentHp)}
                onCommit={(value) => setHp(Number(value) || 0)}
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
              <TokenInput
                type="number"
                aria-label="Armor class"
                value={token.ac === null ? "" : String(token.ac)}
                onCommit={(value) => onUpdate({ ac: value === "" ? null : Number(value) || 0 })}
              />
            ) : (
              <strong>{token.ac ?? "—"}</strong>
            )}
          </div>
        </div>
      ) : null}

      <div className="core-token-conditions">
        <span className="tiny muted">Conditions</span>
        {token.conditions.length ? (
          <div className="core-token-condition-list">
            {token.conditions.map((entry, index) =>
              canManage ? (
                <div className="core-token-condition" key={`${entry.name}-${index}`}>
                  <span className="core-token-condition-name">{entry.name}</span>
                  <TokenInput
                    type="number"
                    value={entry.value == null ? "" : String(entry.value)}
                    placeholder="Val"
                    aria-label={`Value for ${entry.name}`}
                    onCommit={(value) => updateCondition(index, { value: numberOrNull(value) })}
                  />
                  <TokenInput
                    type="number"
                    value={entry.duration == null ? "" : String(entry.duration)}
                    placeholder="Rds"
                    aria-label={`Duration for ${entry.name}`}
                    onCommit={(value) => updateCondition(index, { duration: numberOrNull(value) })}
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
              list="token-condition-options"
              value={condition}
              placeholder="Add condition"
              aria-label="Add condition"
              onChange={(event) => setCondition(event.target.value)}
            />
            <datalist id="token-condition-options">
              {conditions.map((entry) => (
                <option key={entry.id} value={entry.name} />
              ))}
            </datalist>
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
            <TokenInput
              value={token.name}
              maxLength={80}
              onCommit={(value) => onUpdate({ name: value })}
            />
          </label>
          <label>
            <span>Image URL</span>
            <TokenInput
              value={token.imageUrl ?? ""}
              placeholder="https://…"
              onCommit={(value) => onUpdate({ imageUrl: value || null })}
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
        {canManage ? (
          <>
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                void uploadArt(file);
              }}
            />
            <Button
              size="sm"
              variant="secondary"
              icon={<ImagePlus size={14} />}
              loading={imageBusy}
              onClick={() => imageInputRef.current?.click()}
            >
              Upload image
            </Button>
            {token.imageUrl ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={imageBusy}
                onClick={() => onUpdate({ imageUrl: null })}
              >
                Default art
              </Button>
            ) : null}
          </>
        ) : null}
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
          <IconButton label="Add to initiative" onClick={onAddToInitiative}>
            <Dices size={14} />
          </IconButton>
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
        {imageError ? <span className="core-token-error">{imageError}</span> : null}
      </div>
    </aside>
  );
}
