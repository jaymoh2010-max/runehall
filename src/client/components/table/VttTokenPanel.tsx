import { useState } from "react";
import { Dices, EyeOff, Lock, Minus, MousePointer2, Plus, Swords, Trash2, X } from "lucide-react";
import type { CharacterRecord, PublicUser, Scene, Token } from "../../../shared/types";
import { groupHp, tokenConditionLabel } from "../../../shared/tokens";
import { Avatar, Badge, Button, Field, IconButton, Input, ProgressBar, Select, Stat, Tag, Toggle } from "../ui";

export function VttTokenPanel({
  activeScene,
  isGm,
  sceneTokens,
  characters,
  selectedTokenId,
  setSelectedTokenId,
  setTokens,
  selectedToken,
  updateToken,
  addSelectedToInitiative,
  setEditingTokenId,
  deleteToken,
  setAddTokenOpen,
  setEditingScene,
  user,
  onGroupHp,
}: {
  activeScene: Scene;
  isGm: boolean;
  sceneTokens: Token[];
  characters: CharacterRecord[];
  selectedTokenId: string | null;
  setSelectedTokenId: (tokenId: string | null) => void;
  setTokens: (updater: (current: Token[]) => Token[]) => void;
  selectedToken: Token | null;
  updateToken: (tokenId: string, patch: Partial<Token>) => void;
  addSelectedToInitiative: () => void;
  setEditingTokenId: (tokenId: string | null) => void;
  deleteToken: (tokenId: string) => void;
  setAddTokenOpen: (open: boolean) => void;
  setEditingScene: (scene: Scene) => void;
  user: PublicUser;
  onGroupHp: (groupId: string, delta: number) => void;
}) {
  const [groupAmount, setGroupAmount] = useState("5");
  const groupTokens = selectedToken?.groupId
    ? sceneTokens.filter((token) => token.groupId === selectedToken.groupId)
    : [];
  const group = groupTokens.length > 1 ? groupHp(groupTokens) : null;
  const groupName = selectedToken?.groupName || groupTokens[0]?.name || "Group";

  return (
    <aside className="vtt-left">
      <div className="vtt-left-head">
        <div>
          <span className="tiny muted">Scene</span>
          <h3>{activeScene.name}</h3>
        </div>
        {isGm ? <Button size="sm" variant="ghost" onClick={() => setEditingScene(activeScene)}>Edit</Button> : null}
      </div>
      <div className="vtt-token-list">
        {sceneTokens.map((token) => {
          const character = token.characterId ? characters.find((c) => c.id === token.characterId) : null;
          const portrait = token.imageUrl || character?.summary?.portraitUrl;
          return (
            <button
              type="button"
              key={token.id}
              className={`vtt-token-row ${selectedTokenId === token.id ? "is-selected" : ""} ${token.hidden ? "is-hidden" : ""}`}
              onClick={() => setSelectedTokenId(token.id)}
              onDoubleClick={() => character && window.open(`/characters/${character.id}`, "_blank")}
            >
              <Avatar name={token.name} src={portrait} size={34} />
              <span className="grow">
                <strong>{token.name}</strong>
                <span className="tiny muted">
                  {token.hpMax !== null ? `${token.hpCurrent ?? "?"} / ${token.hpMax} HP` : "No HP"}
                  {token.ac !== null ? ` · AC ${token.ac}` : ""}
                </span>
              </span>
              {token.hidden ? <EyeOff size={12} /> : null}
              {token.locked ? <Lock size={12} /> : null}
              {token.ownerId === user.id ? <Badge tone="blue">Yours</Badge> : null}
            </button>
          );
        })}
        {!sceneTokens.length ? <p className="muted small">No tokens on this scene.</p> : null}
      </div>
      {isGm ? (
        <Button size="sm" variant="gold" block icon={<Plus size={14} />} onClick={() => setAddTokenOpen(true)}>
          Add token
        </Button>
      ) : null}
      {selectedToken ? (
        <div className="token-editor">
          <div className="row-between">
            <h3>Selected token</h3>
            <IconButton label="Deselect" onClick={() => setSelectedTokenId(null)}><X size={14} /></IconButton>
          </div>
          {group ? (
            <div className="token-group-card">
              <div className="row-between">
                <div>
                  <span className="tiny muted">Group</span>
                  <h3 style={{ marginTop: 2 }}>{groupName} <Badge tone="violet">{group.count}</Badge></h3>
                </div>
                <strong className="token-group-hp">{group.current} / {group.max} HP</strong>
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
                    onClick={() => onGroupHp(selectedToken.groupId!, -Math.max(0, Number(groupAmount) || 0))}
                  >
                    Damage each
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => onGroupHp(selectedToken.groupId!, Math.max(0, Number(groupAmount) || 0))}
                  >
                    Heal each
                  </Button>
                </div>
              ) : null}
              <p className="tiny muted">
                Group HP is the sum of its members. Damage/heal applies to every creature; use the individual controls for one target.
              </p>
            </div>
          ) : null}
          {isGm ? (
            <>
              <Field label="Name">
                <Input
                  value={selectedToken.name}
                  onChange={(event) =>
                    setTokens((current) => current.map((token) => token.id === selectedToken.id ? { ...token, name: event.target.value } : token))
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
                      setTokens((current) => current.map((token) => token.id === selectedToken.id ? { ...token, hpCurrent: Number(event.target.value) } : token))
                    }
                    onBlur={(event) => updateToken(selectedToken.id, { hpCurrent: Number(event.target.value) })}
                  />
                </Field>
                <Field label="HP max">
                  <Input
                    type="number"
                    value={selectedToken.hpMax ?? ""}
                    onChange={(event) =>
                      setTokens((current) => current.map((token) => token.id === selectedToken.id ? { ...token, hpMax: Number(event.target.value) } : token))
                    }
                    onBlur={(event) => updateToken(selectedToken.id, { hpMax: Number(event.target.value) })}
                  />
                </Field>
                <Field label="AC">
                  <Input
                    type="number"
                    value={selectedToken.ac ?? ""}
                    onChange={(event) =>
                      setTokens((current) => current.map((token) => token.id === selectedToken.id ? { ...token, ac: Number(event.target.value) } : token))
                    }
                    onBlur={(event) => updateToken(selectedToken.id, { ac: Number(event.target.value) })}
                  />
                </Field>
                <Field label="Size">
                  <Select
                    value={selectedToken.size}
                    onChange={(event) => updateToken(selectedToken.id, { size: Number(event.target.value) })}
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
                <Button size="sm" variant="primary" icon={<Swords size={13} />} onClick={() => setEditingTokenId(selectedToken.id)}>Edit token</Button>
                <Button size="sm" variant="secondary" icon={<Dices size={13} />} onClick={addSelectedToInitiative}>Add to initiative</Button>
                {selectedToken.characterId ? (
                  <Button size="sm" variant="ghost" icon={<Swords size={13} />} onClick={() => window.open(`/characters/${selectedToken.characterId}`, "_blank")}>
                    Sheet
                  </Button>
                ) : null}
                <Button size="sm" variant="danger" icon={<Trash2 size={13} />} onClick={() => deleteToken(selectedToken.id)}>Delete</Button>
              </div>
            </>
          ) : (
            <>
              <div className="token-player-stats">
                <Stat label="HP" value={selectedToken.hpMax !== null ? `${selectedToken.hpCurrent ?? "?"} / ${selectedToken.hpMax}` : "—"} />
                <Stat label="AC" value={selectedToken.ac ?? "—"} />
              </div>
              {selectedToken.characterId ? (
                <Button size="sm" variant="primary" block icon={<Swords size={13} />} onClick={() => window.open(`/characters/${selectedToken.characterId}`, "_blank")}>
                  Open character sheet
                </Button>
              ) : null}
              {selectedToken.hpCurrent !== null ? (
                <div className="token-hp-controls">
                  <Button size="sm" variant="ghost" onClick={() => updateToken(selectedToken.id, { hpCurrent: Math.max(0, (selectedToken.hpCurrent ?? 0) - 1) })}><Minus size={12} /></Button>
                  <span>{selectedToken.hpCurrent}</span>
                  <Button size="sm" variant="ghost" onClick={() => updateToken(selectedToken.id, { hpCurrent: Math.min(selectedToken.hpMax ?? selectedToken.hpCurrent ?? 0, (selectedToken.hpCurrent ?? 0) + 1) })}><Plus size={12} /></Button>
                </div>
              ) : null}
            </>
          )}
          {selectedToken.conditions.length ? (
            <div className="chip-row" style={{ marginTop: 10 }}>
              {selectedToken.conditions.map((condition) => <Tag key={condition.name} tone="red">{tokenConditionLabel(condition)}</Tag>)}
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
