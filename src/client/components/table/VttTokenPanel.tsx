import { useEffect, useRef, useState } from "react";
import {
  Dices,
  Eye,
  EyeOff,
  Lock,
  Minus,
  MousePointer2,
  Plus,
  Swords,
  Trash2,
  Unlock,
  X,
} from "lucide-react";
import type { CharacterRecord, PublicUser, Scene, Token } from "../../../shared/types";
import { groupHp, tokenConditionLabel, tokenConditionSummary } from "../../../shared/tokens";
import {
  DAMAGE_TYPE_GROUPS,
  DEFAULT_DAMAGE_TYPE,
  damageTypeLabel,
} from "../../../shared/damageDefenses";
import {
  Avatar,
  Badge,
  Button,
  Field,
  IconButton,
  Input,
  ProgressBar,
  Select,
  Stat,
  Tag,
  Toggle,
} from "../ui";
import { HoverCard } from "../HoverCard";

export function VttTokenPanel({
  activeScene,
  isGm,
  sceneTokens,
  characters,
  selectedTokenId,
  selectedTokenIds,
  setSelectedTokenId,
  setTokens,
  selectedToken,
  updateToken,
  onDamage,
  addSelectedToInitiative,
  setEditingTokenId,
  deleteToken,
  setAddTokenOpen,
  setEditingScene,
  user,
  onGroupHp,
  onBulkHp,
  onBulkCondition,
  onBulkClearConditions,
  onBulkPatch,
  onBulkDelete,
}: {
  activeScene: Scene;
  isGm: boolean;
  sceneTokens: Token[];
  characters: CharacterRecord[];
  selectedTokenId: string | null;
  selectedTokenIds: string[];
  setSelectedTokenId: (tokenId: string | null) => void;
  setTokens: (updater: (current: Token[]) => Token[]) => void;
  selectedToken: Token | null;
  updateToken: (tokenId: string, patch: Partial<Token>) => void;
  onDamage: (
    tokenId: string,
    amount: number,
    critical?: boolean,
    options?: { damageType?: string; nonlethal?: boolean }
  ) => void;
  addSelectedToInitiative: () => void;
  setEditingTokenId: (tokenId: string | null) => void;
  deleteToken: (tokenId: string) => void;
  setAddTokenOpen: (open: boolean) => void;
  setEditingScene: (scene: Scene) => void;
  user: PublicUser;
  onGroupHp: (groupId: string, delta: number) => void;
  onBulkHp: (delta: number, full?: boolean) => void;
  onBulkCondition: (name: string, value: number | null, duration: number | null) => void;
  onBulkClearConditions: () => void;
  onBulkPatch: (patch: Partial<Token>) => void;
  onBulkDelete: () => void;
}) {
  const [groupAmount, setGroupAmount] = useState("5");
  const [damageAmount, setDamageAmount] = useState("1");
  const [damageType, setDamageType] = useState(DEFAULT_DAMAGE_TYPE);
  const [nonlethal, setNonlethal] = useState(false);
  const [bulkCondition, setBulkCondition] = useState("");
  const [bulkValue, setBulkValue] = useState("");
  const [bulkDuration, setBulkDuration] = useState("");
  const tokenScrollRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const selectedTokens = sceneTokens.filter((token) => selectedTokenIds.includes(token.id));
  const groupTokens = selectedToken?.groupId
    ? sceneTokens.filter((token) => token.groupId === selectedToken.groupId)
    : [];
  const group = groupTokens.length > 1 ? groupHp(groupTokens) : null;
  const groupName = selectedToken?.groupName || groupTokens[0]?.name || "Group";

  useEffect(() => {
    if (!selectedTokenId) return;
    tokenScrollRef.current
      ?.querySelector<HTMLElement>(`[data-token-id="${selectedTokenId}"]`)
      ?.scrollIntoView({ block: "nearest" });
    editorRef.current?.scrollTo({ top: 0 });
  }, [selectedTokenId]);

  const applyBulkCondition = () => {
    const name = bulkCondition.trim();
    if (!name) return;
    onBulkCondition(
      name,
      bulkValue === "" ? null : Math.max(0, Math.round(Number(bulkValue))),
      bulkDuration === "" ? null : Math.max(0, Math.round(Number(bulkDuration)))
    );
    setBulkCondition("");
    setBulkValue("");
    setBulkDuration("");
  };

  return (
    <aside className="vtt-left">
      <div className="vtt-left-head">
        <div>
          <span className="tiny muted">Scene</span>
          <h2>{activeScene.name}</h2>
        </div>
        {isGm ? (
          <Button size="sm" variant="ghost" onClick={() => setEditingScene(activeScene)}>
            Edit
          </Button>
        ) : null}
      </div>
      {selectedTokens.length > 1 ? (
        <div className="bulk-token-bar">
          <div className="row-between">
            <strong>{selectedTokens.length} tokens selected</strong>
            <IconButton label="Clear selection" onClick={() => setSelectedTokenId(null)}>
              <X size={13} />
            </IconButton>
          </div>
          <div className="row wrap" style={{ gap: 5 }}>
            <Button size="sm" onClick={() => onBulkHp(-5)}>
              -5 HP
            </Button>
            <Button size="sm" onClick={() => onBulkHp(5)}>
              +5 HP
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onBulkHp(0, true)}>
              Full HP
            </Button>
          </div>
          <div className="row wrap" style={{ gap: 5 }}>
            <Input
              value={bulkCondition}
              onChange={(event) => setBulkCondition(event.target.value)}
              placeholder="Condition"
              style={{ minWidth: 100 }}
            />
            <Input
              type="number"
              min={0}
              value={bulkValue}
              onChange={(event) => setBulkValue(event.target.value)}
              placeholder="Val"
              style={{ maxWidth: 62 }}
            />
            <Input
              type="number"
              min={0}
              value={bulkDuration}
              onChange={(event) => setBulkDuration(event.target.value)}
              placeholder="Rounds"
              style={{ maxWidth: 76 }}
            />
            <Button size="sm" icon={<Plus size={13} />} onClick={applyBulkCondition}>
              Apply
            </Button>
          </div>
          <Button size="sm" variant="ghost" onClick={onBulkClearConditions}>
            Clear conditions
          </Button>
          {isGm ? (
            <div className="row wrap" style={{ gap: 5 }}>
              <Button
                size="sm"
                variant="ghost"
                icon={<EyeOff size={13} />}
                onClick={() => onBulkPatch({ hidden: true })}
              >
                Hide
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon={<Eye size={13} />}
                onClick={() => onBulkPatch({ hidden: false })}
              >
                Show
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon={<Lock size={13} />}
                onClick={() => onBulkPatch({ locked: true })}
              >
                Lock
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon={<Unlock size={13} />}
                onClick={() => onBulkPatch({ locked: false })}
              >
                Unlock
              </Button>
              <Button
                size="sm"
                variant="danger"
                icon={<Trash2 size={13} />}
                onClick={() => {
                  if (window.confirm(`Delete ${selectedTokens.length} selected tokens?`))
                    onBulkDelete();
                }}
              >
                Delete
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="vtt-token-scroll" ref={tokenScrollRef}>
        <div className="vtt-token-list">
          {sceneTokens.map((token) => {
            const character = token.characterId
              ? characters.find((c) => c.id === token.characterId)
              : null;
            const portrait = token.imageUrl || character?.summary?.portraitUrl;
            return (
              <HoverCard
                key={token.id}
                title={token.name}
                subtitle={
                  character?.summary
                    ? `Level ${character.summary.level} ${character.summary.className || "adventurer"}`
                    : (token.groupName ?? "Token")
                }
                meta={
                  <span>
                    {token.hpMax !== null
                      ? `${token.hpCurrent ?? "?"} / ${token.hpMax} HP`
                      : "No HP"}
                    {token.ac !== null ? ` · AC ${token.ac}` : ""}
                    {token.conditions.length ? ` · ${tokenConditionSummary(token.conditions)}` : ""}
                  </span>
                }
                footer={character ? "Double-click for the character sheet" : undefined}
              >
                <button
                  type="button"
                  data-token-id={token.id}
                  className={`vtt-token-row ${selectedTokenIds.includes(token.id) || selectedTokenId === token.id ? "is-selected" : ""} ${token.hidden ? "is-hidden" : ""}`}
                  onClick={() => setSelectedTokenId(token.id)}
                  onDoubleClick={() =>
                    character && window.open(`/characters/${character.id}`, "_blank")
                  }
                >
                  <Avatar name={token.name} src={portrait} size={34} />
                  <span className="grow">
                    <strong>{token.name}</strong>
                    <span className="tiny muted">
                      {token.hpMax !== null
                        ? `${token.hpCurrent ?? "?"} / ${token.hpMax} HP`
                        : "No HP"}
                      {token.ac !== null ? ` · AC ${token.ac}` : ""}
                    </span>
                  </span>
                  {token.hidden ? <EyeOff size={12} /> : null}
                  {token.locked ? <Lock size={12} /> : null}
                  {token.ownerId === user.id ? <Badge tone="blue">Yours</Badge> : null}
                </button>
              </HoverCard>
            );
          })}
          {!sceneTokens.length ? <p className="muted small">No tokens on this scene.</p> : null}
        </div>
      </div>
      {isGm ? (
        <Button
          size="sm"
          variant="gold"
          block
          icon={<Plus size={14} />}
          onClick={() => setAddTokenOpen(true)}
        >
          Add token
        </Button>
      ) : null}
      {selectedToken ? (
        <div className="token-editor" ref={editorRef}>
          <div className="row-between">
            <h3>Selected token</h3>
            <IconButton label="Deselect" onClick={() => setSelectedTokenId(null)}>
              <X size={14} />
            </IconButton>
          </div>
          {group ? (
            <div className="token-group-card">
              <div className="row-between">
                <div>
                  <span className="tiny muted">Group</span>
                  <h3 style={{ marginTop: 2 }}>
                    {groupName} <Badge tone="violet">{group.count}</Badge>
                  </h3>
                </div>
                <strong className="token-group-hp">
                  {group.current} / {group.max} HP
                </strong>
              </div>
              <ProgressBar value={group.current} max={group.max} />
              {isGm ? (
                <div className="token-group-actions">
                  <Input
                    type="number"
                    min={0}
                    value={groupAmount}
                    onChange={(event) => setGroupAmount(event.target.value)}
                    aria-label="HP applied to each group member"
                  />
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() =>
                      onGroupHp(selectedToken.groupId!, -Math.max(0, Number(groupAmount) || 0))
                    }
                  >
                    Damage each
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      onGroupHp(selectedToken.groupId!, Math.max(0, Number(groupAmount) || 0))
                    }
                  >
                    Heal each
                  </Button>
                </div>
              ) : null}
              <p className="tiny muted">
                Group HP is the sum of its members. Damage/heal applies to every creature; use the
                individual controls for one target.
              </p>
            </div>
          ) : null}
          {isGm ? (
            <>
              <Field label="Name">
                <Input
                  value={selectedToken.name}
                  onChange={(event) =>
                    setTokens((current) =>
                      current.map((token) =>
                        token.id === selectedToken.id
                          ? { ...token, name: event.target.value }
                          : token
                      )
                    )
                  }
                  onBlur={(event) => updateToken(selectedToken.id, { name: event.target.value })}
                />
              </Field>
              <div className="form-grid two">
                <Field label="HP current">
                  <Input
                    type="number"
                    value={selectedToken.hpCurrent ?? ""}
                    onChange={(event) =>
                      setTokens((current) =>
                        current.map((token) =>
                          token.id === selectedToken.id
                            ? { ...token, hpCurrent: Number(event.target.value) }
                            : token
                        )
                      )
                    }
                    onBlur={(event) =>
                      updateToken(selectedToken.id, { hpCurrent: Number(event.target.value) })
                    }
                  />
                </Field>
                <Field
                  label="HP max"
                  hint={selectedToken.characterId ? "From the linked character sheet" : undefined}
                >
                  <Input
                    type="number"
                    value={selectedToken.hpMax ?? ""}
                    disabled={Boolean(selectedToken.characterId)}
                    onChange={(event) =>
                      setTokens((current) =>
                        current.map((token) =>
                          token.id === selectedToken.id
                            ? { ...token, hpMax: Number(event.target.value) }
                            : token
                        )
                      )
                    }
                    onBlur={(event) =>
                      updateToken(selectedToken.id, { hpMax: Number(event.target.value) })
                    }
                  />
                </Field>
                <Field label="AC">
                  <Input
                    type="number"
                    value={selectedToken.ac ?? ""}
                    onChange={(event) =>
                      setTokens((current) =>
                        current.map((token) =>
                          token.id === selectedToken.id
                            ? { ...token, ac: Number(event.target.value) }
                            : token
                        )
                      )
                    }
                    onBlur={(event) =>
                      updateToken(selectedToken.id, { ac: Number(event.target.value) })
                    }
                  />
                </Field>
                <Field label="Size">
                  <Select
                    value={selectedToken.size}
                    onChange={(event) =>
                      updateToken(selectedToken.id, { size: Number(event.target.value) })
                    }
                  >
                    <option value={1}>Medium</option>
                    <option value={2}>Large</option>
                    <option value={3}>Huge</option>
                    <option value={4}>Gargantuan</option>
                  </Select>
                </Field>
              </div>
              <div className="token-toggles">
                <Toggle
                  checked={selectedToken.hidden}
                  onChange={(hidden) => updateToken(selectedToken.id, { hidden })}
                  label="Hidden from players"
                />
                <Toggle
                  checked={selectedToken.locked}
                  onChange={(locked) => updateToken(selectedToken.id, { locked })}
                  label="Locked in place"
                />
              </div>
              <div className="row wrap" style={{ gap: 7, marginTop: 10 }}>
                <Button
                  size="sm"
                  variant="primary"
                  icon={<Swords size={13} />}
                  onClick={() => setEditingTokenId(selectedToken.id)}
                >
                  Edit token
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Dices size={13} />}
                  onClick={addSelectedToInitiative}
                >
                  Add to initiative
                </Button>
                {selectedToken.characterId ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Swords size={13} />}
                    onClick={() =>
                      window.open(`/characters/${selectedToken.characterId}`, "_blank")
                    }
                  >
                    Sheet
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="danger"
                  icon={<Trash2 size={13} />}
                  onClick={() => {
                    if (window.confirm(`Delete ${selectedToken.name}?`)) {
                      deleteToken(selectedToken.id);
                    }
                  }}
                >
                  Delete
                </Button>
              </div>
              <div className="token-damage-apply">
                <Input
                  type="number"
                  min={1}
                  value={damageAmount}
                  aria-label="Damage amount"
                  onChange={(event) => setDamageAmount(event.target.value)}
                />
                <Select
                  value={damageType}
                  aria-label="Damage type"
                  onChange={(event) => setDamageType(event.target.value)}
                >
                  <option value={DEFAULT_DAMAGE_TYPE}>Untyped</option>
                  {DAMAGE_TYPE_GROUPS.map((group) => (
                    <optgroup key={group.label} label={group.label}>
                      {group.types.map((type) => (
                        <option key={type} value={type}>
                          {damageTypeLabel(type)}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </Select>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => {
                    const amount = Math.max(0, Math.round(Number(damageAmount) || 0));
                    if (amount > 0) {
                      onDamage(selectedToken.id, amount, false, { damageType, nonlethal });
                    }
                  }}
                >
                  Apply
                </Button>
              </div>
              <Toggle checked={nonlethal} onChange={setNonlethal} label="Nonlethal damage" />
            </>
          ) : (
            <>
              <div className="token-player-stats">
                <Stat
                  label="HP"
                  value={
                    selectedToken.hpMax !== null
                      ? `${selectedToken.hpCurrent ?? "?"} / ${selectedToken.hpMax}`
                      : "—"
                  }
                />
                <Stat label="AC" value={selectedToken.ac ?? "—"} />
              </div>
              {selectedToken.characterId ? (
                <Button
                  size="sm"
                  variant="primary"
                  block
                  icon={<Swords size={13} />}
                  onClick={() => window.open(`/characters/${selectedToken.characterId}`, "_blank")}
                >
                  Open character sheet
                </Button>
              ) : null}
              {selectedToken.hpCurrent !== null ? (
                <div className="token-hp-controls">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onDamage(selectedToken.id, 1)}
                    title="Deal 1 damage (temporary HP applies first)"
                  >
                    <Minus size={12} />
                  </Button>
                  <span>{selectedToken.hpCurrent}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      updateToken(selectedToken.id, {
                        hpCurrent: Math.min(
                          selectedToken.hpMax ?? selectedToken.hpCurrent ?? 0,
                          (selectedToken.hpCurrent ?? 0) + 1
                        ),
                      })
                    }
                  >
                    <Plus size={12} />
                  </Button>
                </div>
              ) : null}
              <div className="token-damage-apply">
                <Input
                  type="number"
                  min={1}
                  value={damageAmount}
                  aria-label="Damage amount"
                  onChange={(event) => setDamageAmount(event.target.value)}
                />
                <Select
                  value={damageType}
                  aria-label="Damage type"
                  onChange={(event) => setDamageType(event.target.value)}
                >
                  <option value={DEFAULT_DAMAGE_TYPE}>Untyped</option>
                  {DAMAGE_TYPE_GROUPS.map((group) => (
                    <optgroup key={group.label} label={group.label}>
                      {group.types.map((type) => (
                        <option key={type} value={type}>
                          {damageTypeLabel(type)}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </Select>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => {
                    const amount = Math.max(0, Math.round(Number(damageAmount) || 0));
                    if (amount > 0) {
                      onDamage(selectedToken.id, amount, false, { damageType, nonlethal });
                    }
                  }}
                >
                  Apply
                </Button>
              </div>
              <Toggle checked={nonlethal} onChange={setNonlethal} label="Nonlethal damage" />
            </>
          )}
          {selectedToken.conditions.length ? (
            <div className="chip-row" style={{ marginTop: 10 }}>
              {selectedToken.conditions.map((condition) => (
                <Tag key={condition.name} tone="red">
                  {tokenConditionLabel(condition)}
                </Tag>
              ))}
            </div>
          ) : null}
          {selectedToken.turnEffects &&
          (selectedToken.turnEffects.fastHealing > 0 ||
            selectedToken.turnEffects.regeneration > 0 ||
            selectedToken.turnEffects.persistentDamage.length) ? (
            <div className="chip-row" style={{ marginTop: 6 }}>
              {selectedToken.turnEffects.fastHealing > 0 ? (
                <Tag tone="green">
                  Fast healing {selectedToken.turnEffects.fastHealing}
                  {selectedToken.turnEffects.fastHealingActive ? "" : " (off)"}
                </Tag>
              ) : null}
              {selectedToken.turnEffects.regeneration > 0 ? (
                <Tag tone="green">
                  Regen {selectedToken.turnEffects.regeneration}
                  {selectedToken.turnEffects.regenerationActive ? "" : " (off)"}
                </Tag>
              ) : null}
              {selectedToken.turnEffects.persistentDamage.map((instance) => (
                <Tag key={instance.id} tone="red">
                  {instance.formula} {instance.type}
                </Tag>
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="vtt-left-tip">
          <MousePointer2 size={18} />
          <p>
            Click a token to select it. Double-click a character token to open its sheet.
            {isGm ? " Right-click a token to edit it." : ""}
          </p>
        </div>
      )}
    </aside>
  );
}
