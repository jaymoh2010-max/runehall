import { useEffect, useRef, useState } from "react";
import { ImagePlus, Minus, Plus, Shield, Swords, Trash2, Upload, UserRound } from "lucide-react";
import type { CampaignMember, CharacterRecord, Token, TokenCondition } from "../../../shared/types";
import { tokenConditionLabel } from "../../../shared/tokens";
import { uploadImage } from "../../api";
import { errorMessage, useToasts } from "../../stores";
import { Avatar, Button, Field, Input, Modal, Select, Tag, Toggle } from "../ui";

interface TokenEditModalProps {
  open: boolean;
  token: Token | null;
  campaignId: string;
  characters: CharacterRecord[];
  members: CampaignMember[];
  onClose: () => void;
  onSave: (patch: Partial<Token>) => void;
  onDelete: (tokenId: string) => void;
  onOpenCharacter: (characterId: string) => void;
}

export function TokenEditModal({
  open,
  token,
  campaignId,
  characters,
  members,
  onClose,
  onSave,
  onDelete,
  onOpenCharacter,
}: TokenEditModalProps) {
  const toast = useToasts((state) => state.push);
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [hpCurrent, setHpCurrent] = useState("");
  const [hpMax, setHpMax] = useState("");
  const [ac, setAc] = useState("");
  const [size, setSize] = useState("1");
  const [color, setColor] = useState("#c8a96b");
  const [ownerId, setOwnerId] = useState("");
  const [hidden, setHidden] = useState(false);
  const [locked, setLocked] = useState(false);
  const [conditions, setConditions] = useState<TokenCondition[]>([]);
  const [conditionInput, setConditionInput] = useState("");
  const [conditionValue, setConditionValue] = useState("");
  const [conditionDuration, setConditionDuration] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !token) return;
    setName(token.name);
    setImageUrl(token.imageUrl);
    setHpCurrent(token.hpCurrent === null ? "" : String(token.hpCurrent));
    setHpMax(token.hpMax === null ? "" : String(token.hpMax));
    setAc(token.ac === null ? "" : String(token.ac));
    setSize(String(token.size));
    setColor(token.color);
    setOwnerId(token.ownerId ?? "");
    setHidden(token.hidden);
    setLocked(token.locked);
    setConditions(token.conditions.map((condition) => ({ ...condition })));
    setConditionInput("");
    setConditionValue("");
    setConditionDuration("");
    setError("");
  }, [open, token?.id]);

  if (!token) return null;
  const character = token.characterId
    ? characters.find((entry) => entry.id === token.characterId)
    : null;

  const upload = async (file: File) => {
    setUploading(true);
    setError("");
    try {
      const result = await uploadImage(file, campaignId);
      setImageUrl(result.url);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  const addCondition = () => {
    const name = conditionInput.trim();
    if (!name) return;
    const value = conditionValue === "" ? null : Math.max(0, Math.round(Number(conditionValue)));
    const duration =
      conditionDuration === "" ? null : Math.max(0, Math.round(Number(conditionDuration)));
    setConditions((current) =>
      current.some((condition) => condition.name.toLowerCase() === name.toLowerCase())
        ? current
        : [...current, { name, value, duration }]
    );
    setConditionInput("");
    setConditionValue("");
    setConditionDuration("");
  };

  const save = () => {
    const parsedMax = hpMax === "" ? null : Number(hpMax);
    const parsedCurrent = hpCurrent === "" ? null : Number(hpCurrent);
    if (parsedMax !== null && (!Number.isFinite(parsedMax) || parsedMax < 1)) {
      setError("Max HP must be at least 1.");
      return;
    }
    if (parsedCurrent !== null && (!Number.isFinite(parsedCurrent) || parsedCurrent < 0)) {
      setError("Current HP cannot be negative.");
      return;
    }
    onSave({
      name: name.trim() || "Token",
      imageUrl,
      hpMax: parsedMax,
      hpCurrent:
        parsedCurrent === null
          ? parsedMax
          : parsedMax === null
            ? parsedCurrent
            : Math.min(parsedMax, parsedCurrent),
      ac: ac === "" ? null : Number(ac),
      size: Number(size) || 1,
      color,
      ownerId: ownerId || null,
      hidden,
      locked,
      conditions,
    });
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Edit “${token.name}”`}
      subtitle="Token art, hit points, conditions, and table permissions."
      wide
      footer={
        <>
          <Button
            variant="danger"
            icon={<Trash2 size={14} />}
            onClick={() => {
              if (window.confirm(`Delete token “${token.name}”?`)) {
                onDelete(token.id);
                onClose();
              }
            }}
          >
            Delete
          </Button>
          <span className="grow" />
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} loading={uploading}>
            Save token
          </Button>
        </>
      }
    >
      <div className="token-edit-layout">
        <div className="token-edit-art">
          <div className="token-edit-preview">
            {imageUrl ? (
              <img src={imageUrl} alt="" />
            ) : (
              <span>{name.slice(0, 2).toUpperCase() || "TO"}</span>
            )}
          </div>
          <Button
            variant="secondary"
            size="sm"
            icon={<Upload size={14} />}
            loading={uploading}
            onClick={() => fileRef.current?.click()}
            block
          >
            Upload token art
          </Button>
          {imageUrl ? (
            <Button variant="ghost" size="sm" onClick={() => setImageUrl(null)} block>
              Use initials
            </Button>
          ) : null}
          <input
            ref={fileRef}
            type="file"
            hidden
            accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
              event.target.value = "";
            }}
          />
          <p className="tiny muted">
            Token art is saved as an uploaded asset and cropped into a circle on the map.
          </p>
        </div>

        <div className="token-edit-form">
          {error ? <div className="auth-error">{error}</div> : null}
          <Field label="Token name">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={80}
              autoFocus
            />
          </Field>

          <div className="token-edit-stat-grid">
            <Field label="Current HP">
              <div className="token-edit-number">
                <button
                  type="button"
                  onClick={() => setHpCurrent(String(Math.max(0, Number(hpCurrent || 0) - 1)))}
                >
                  <Minus size={13} />
                </button>
                <Input
                  value={hpCurrent}
                  onChange={(event) => setHpCurrent(event.target.value)}
                  placeholder="—"
                  inputMode="numeric"
                />
                <button
                  type="button"
                  onClick={() => setHpCurrent(String(Math.max(0, Number(hpCurrent || 0) + 1)))}
                >
                  <Plus size={13} />
                </button>
              </div>
            </Field>
            <Field label="Max HP">
              <Input
                value={hpMax}
                onChange={(event) => setHpMax(event.target.value)}
                placeholder="—"
                inputMode="numeric"
              />
            </Field>
            <Field label="Armor class">
              <Input
                value={ac}
                onChange={(event) => setAc(event.target.value)}
                placeholder="—"
                inputMode="numeric"
              />
            </Field>
            <Field label="Size">
              <Select value={size} onChange={(event) => setSize(event.target.value)}>
                <option value="1">Medium</option>
                <option value="2">Large</option>
                <option value="3">Huge</option>
                <option value="4">Gargantuan</option>
              </Select>
            </Field>
          </div>

          <div className="token-hp-actions">
            <Button
              size="sm"
              variant="danger"
              onClick={() => setHpCurrent(String(Math.max(0, Number(hpCurrent || 0) - 5)))}
            >
              −5 HP
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                setHpCurrent(
                  String(Math.min(Number(hpMax || hpCurrent || 0), Number(hpCurrent || 0) + 5))
                )
              }
            >
              +5 HP
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setHpCurrent(hpMax)}>
              Full
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setHpCurrent("0")}>
              Down
            </Button>
          </div>

          <div className="token-edit-row">
            <Field label="Color">
              <input
                className="token-color-input"
                type="color"
                value={color}
                onChange={(event) => setColor(event.target.value)}
              />
            </Field>
            <Field label="Owner">
              <Select value={ownerId} onChange={(event) => setOwnerId(event.target.value)}>
                <option value="">Unowned</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.displayName}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="token-toggles token-edit-toggles">
            <Toggle checked={hidden} onChange={setHidden} label="Hidden from players" />
            <Toggle checked={locked} onChange={setLocked} label="Locked in place" />
          </div>

          <div className="token-conditions-editor">
            <div className="row-between">
              <span className="field-label">Conditions</span>
              <span className="tiny muted">Value and duration are optional</span>
            </div>
            <div className="chip-row">
              {conditions.map((condition, index) => (
                <Tag key={`${condition.name}-${index}`} tone="red">
                  {tokenConditionLabel(condition)}
                  <button
                    type="button"
                    className="tag-remove"
                    onClick={() =>
                      setConditions((current) => current.filter((_, i) => i !== index))
                    }
                  >
                    ×
                  </button>
                </Tag>
              ))}
              {!conditions.length ? (
                <span className="tiny muted">No active conditions.</span>
              ) : null}
            </div>
            <div className="row" style={{ marginTop: 7, gap: 6 }}>
              <Input
                value={conditionInput}
                onChange={(event) => setConditionInput(event.target.value)}
                placeholder="Condition"
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addCondition();
                  }
                }}
              />
              <Input
                type="number"
                min={0}
                max={99}
                value={conditionValue}
                onChange={(event) => setConditionValue(event.target.value)}
                placeholder="Value"
                style={{ maxWidth: 78 }}
                title="Condition value, e.g. 2 for Frightened 2"
              />
              <Input
                type="number"
                min={0}
                max={999}
                value={conditionDuration}
                onChange={(event) => setConditionDuration(event.target.value)}
                placeholder="Rounds"
                style={{ maxWidth: 84 }}
                title="Remaining duration in rounds"
              />
              <Button size="sm" icon={<Plus size={13} />} onClick={addCondition}>
                Add
              </Button>
            </div>
          </div>

          {character ? (
            <div className="token-linked-character">
              <Avatar name={character.name} src={character.summary?.portraitUrl} size={36} />
              <div className="grow">
                <strong>{character.name}</strong>
                <span className="tiny muted">Linked character · HP changes sync to the sheet</span>
              </div>
              <Button
                size="sm"
                variant="ghost"
                icon={<UserRound size={13} />}
                onClick={() => onOpenCharacter(character.id)}
              >
                Open sheet
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
