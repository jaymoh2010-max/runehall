import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Clock,
  Dices,
  Flag,
  Footprints,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Swords,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import type { CharacterRecord, InitiativeEntry, Token } from "../../../shared/types";
import { Badge, Button, IconButton } from "../ui";
import { signed } from "../../../shared/rules";
import { groupHp, tokenConditionLabel } from "../../../shared/tokens";

export function InitiativeBar({
  entries,
  tokens,
  characters,
  round,
  turnIndex,
  isGm,
  userId,
  selectedTokenId,
  onRoll,
  onNext,
  onPrevious,
  onClear,
  onRemove,
  onReroll,
  onDelay,
  onReady,
  onClearState,
  onMove,
  onTriggerReady,
  onResetMovement,
  onResetTurnActions,
  onSetActions,
  onSetReaction,
  onSelectToken,
}: {
  entries: InitiativeEntry[];
  tokens: Token[];
  characters: CharacterRecord[];
  round: number;
  turnIndex: number;
  isGm: boolean;
  userId: string;
  selectedTokenId: string | null;
  onRoll: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onClear: () => void;
  onRemove: (entryId: string) => void;
  onReroll: (entryId: string) => void;
  onDelay: (entryId: string) => void;
  onReady: (entryId: string) => void;
  onClearState: (entryId: string) => void;
  onMove: (entryId: string, direction: -1 | 1) => void;
  onTriggerReady: (entryId: string) => void;
  onResetMovement: () => void;
  onResetTurnActions: () => void;
  onSetActions: (entryId: string, actionsUsed: number) => void;
  onSetReaction: (entryId: string, reactionsUsed: number) => void;
  onSelectToken: (tokenId: string) => void;
}) {
  const active = entries[turnIndex] ?? null;
  return (
    <div className="initiative-bar">
      <div className="initiative-round">
        <Swords size={15} />
        <div>
          <span className="tiny muted">Round</span>
          <strong>{round}</strong>
        </div>
      </div>
      <div className="initiative-track">
        {entries.length ? (
          entries.map((entry, index) => {
            const token = entry.tokenId
              ? (tokens.find((item) => item.id === entry.tokenId) ?? null)
              : null;
            const groupTokens = entry.groupId
              ? tokens.filter((item) => item.groupId === entry.groupId)
              : [];
            const group = groupTokens.length ? groupHp(groupTokens) : null;
            const hpPercent = group
              ? group.percent
              : token && token.hpMax && token.hpMax > 0 && token.hpCurrent !== null
                ? (token.hpCurrent / token.hpMax) * 100
                : null;
            const conditions = group
              ? [
                  ...new Set(
                    groupTokens.flatMap((item) => item.conditions.map(tokenConditionLabel))
                  ),
                ]
              : (token?.conditions ?? []).map(tokenConditionLabel);
            const hpLabel = group
              ? group.max > 0
                ? `${group.current} / ${group.max} HP`
                : null
              : token && token.hpMax !== null
                ? `${token.hpCurrent ?? "?"} / ${token.hpMax} HP`
                : null;
            const character = token?.characterId
              ? (characters.find((record) => record.id === token.characterId) ?? null)
              : null;
            const speed = character?.summary?.speed ?? null;
            const movementUsed = Math.max(0, Math.round(entry.movementUsed ?? 0));
            const overSpeed = speed !== null && movementUsed > speed;
            const movementLabel =
              movementUsed > 0 || (index === turnIndex && speed !== null)
                ? `${movementUsed}${speed !== null ? ` / ${speed}` : ""} ft.`
                : null;
            const actionsUsed = Math.max(0, Math.min(3, Math.round(entry.actionsUsed ?? 0)));
            const reactionUsed = Math.max(0, Math.min(1, Math.round(entry.reactionsUsed ?? 0)));
            const canManage = isGm || entry.ownerId === userId;
            const canSpendActions = canManage && (isGm || index === turnIndex);
            const canSpendReaction = canManage;
            const detail = [
              entry.tokenId ? "Click to select token" : entry.name,
              group ? `${group.count} creatures` : null,
              hpLabel,
              !group && token?.ac !== null && token?.ac !== undefined ? `AC ${token.ac}` : null,
              movementLabel
                ? `Movement: ${movementUsed}${speed !== null ? ` / ${speed}` : ""} ft.${overSpeed ? " (over Speed)" : ""}`
                : null,
              `Actions: ${3 - actionsUsed} / 3 left`,
              `Reaction: ${reactionUsed ? "used" : "available"}`,
              conditions.length ? `Conditions: ${conditions.join(", ")}` : null,
            ]
              .filter(Boolean)
              .join(" · ");
            const selected = group
              ? groupTokens.some((item) => item.id === selectedTokenId)
              : entry.tokenId === selectedTokenId;
            return (
              <button
                type="button"
                key={entry.id}
                className={`initiative-chip ${index === turnIndex ? "is-active" : ""} ${selected ? "is-selected" : ""} ${hpPercent !== null && hpPercent <= 50 ? "is-wounded" : ""}`}
                onClick={() => entry.tokenId && onSelectToken(entry.tokenId)}
                title={detail}
              >
                <span className="initiative-order">{index + 1}</span>
                <span className="initiative-color" style={{ background: entry.color }} />
                <span className="initiative-name">{entry.name}</span>
                <strong>{signed(entry.initiative)}</strong>
                {hpLabel ? <span className="initiative-hp">{hpLabel}</span> : null}
                {canManage || actionsUsed > 0 ? (
                  <span
                    className="initiative-actions"
                    title={`${3 - actionsUsed} of 3 actions left this turn`}
                  >
                    {[0, 1, 2].map((pip) => {
                      const used = pip < actionsUsed;
                      return (
                        <span
                          key={pip}
                          className={`action-pip ${used ? "is-used" : ""} ${canSpendActions ? "is-clickable" : ""}`}
                          role={canSpendActions ? "button" : undefined}
                          tabIndex={canSpendActions ? 0 : undefined}
                          aria-label={`${used ? "Restore" : "Spend"} action ${pip + 1} for ${entry.name}`}
                          onClick={
                            canSpendActions
                              ? (event) => {
                                  event.stopPropagation();
                                  onSetActions(entry.id, used ? pip : pip + 1);
                                }
                              : undefined
                          }
                          onKeyDown={
                            canSpendActions
                              ? (event) => {
                                  if (event.key !== "Enter" && event.key !== " ") return;
                                  event.preventDefault();
                                  event.stopPropagation();
                                  onSetActions(entry.id, used ? pip : pip + 1);
                                }
                              : undefined
                          }
                        />
                      );
                    })}
                  </span>
                ) : null}
                {canManage || reactionUsed > 0 ? (
                  <span
                    className={`initiative-reaction ${reactionUsed ? "is-used" : ""} ${canSpendReaction ? "is-clickable" : ""}`}
                    role={canSpendReaction ? "button" : undefined}
                    tabIndex={canSpendReaction ? 0 : undefined}
                    aria-label={`${reactionUsed ? "Restore" : "Spend"} reaction for ${entry.name}`}
                    title={reactionUsed ? "Reaction used" : "Reaction available"}
                    onClick={
                      canSpendReaction
                        ? (event) => {
                            event.stopPropagation();
                            onSetReaction(entry.id, reactionUsed ? 0 : 1);
                          }
                        : undefined
                    }
                    onKeyDown={
                      canSpendReaction
                        ? (event) => {
                            if (event.key !== "Enter" && event.key !== " ") return;
                            event.preventDefault();
                            event.stopPropagation();
                            onSetReaction(entry.id, reactionUsed ? 0 : 1);
                          }
                        : undefined
                    }
                  >
                    R
                  </span>
                ) : null}
                {movementLabel ? (
                  <span
                    className={`initiative-movement ${overSpeed ? "is-over" : ""}`}
                    title={
                      overSpeed
                        ? "Movement exceeds this combatant's Speed"
                        : "Straight-line movement used this turn"
                    }
                  >
                    {movementLabel}
                  </span>
                ) : null}
                {conditions.length ? (
                  <span className="initiative-condition-count" title={conditions.join(", ")}>
                    <Sparkles size={10} /> {conditions.length}
                  </span>
                ) : null}
                {index === turnIndex ? <Badge tone="gold">Turn</Badge> : null}
                {entry.delayed ? <Badge tone="blue">Delayed</Badge> : null}
                {entry.readied ? <Badge tone="gold">Ready</Badge> : null}
                {isGm ? (
                  <>
                    {index > 0 && entries[index - 1].initiative === entry.initiative ? (
                      <span
                        className="initiative-reroll"
                        role="button"
                        tabIndex={0}
                        title="Move up within the tie"
                        onClick={(event) => {
                          event.stopPropagation();
                          onMove(entry.id, -1);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.stopPropagation();
                            onMove(entry.id, -1);
                          }
                        }}
                      >
                        <ArrowUp size={10} />
                      </span>
                    ) : null}
                    {index < entries.length - 1 &&
                    entries[index + 1].initiative === entry.initiative ? (
                      <span
                        className="initiative-reroll"
                        role="button"
                        tabIndex={0}
                        title="Move down within the tie"
                        onClick={(event) => {
                          event.stopPropagation();
                          onMove(entry.id, 1);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.stopPropagation();
                            onMove(entry.id, 1);
                          }
                        }}
                      >
                        <ArrowDown size={10} />
                      </span>
                    ) : null}
                    {index === turnIndex ? (
                      <>
                        <span
                          className="initiative-reroll"
                          role="button"
                          tabIndex={0}
                          title="Delay this turn"
                          onClick={(event) => {
                            event.stopPropagation();
                            onDelay(entry.id);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.stopPropagation();
                              onDelay(entry.id);
                            }
                          }}
                        >
                          <Clock size={10} />
                        </span>
                        <span
                          className="initiative-reroll"
                          role="button"
                          tabIndex={0}
                          title="Ready an action and end this turn"
                          onClick={(event) => {
                            event.stopPropagation();
                            onReady(entry.id);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.stopPropagation();
                              onReady(entry.id);
                            }
                          }}
                        >
                          <Flag size={10} />
                        </span>
                      </>
                    ) : null}
                    {entry.readied ? (
                      <span
                        className="initiative-reroll"
                        role="button"
                        tabIndex={0}
                        title="Trigger readied action"
                        onClick={(event) => {
                          event.stopPropagation();
                          onTriggerReady(entry.id);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.stopPropagation();
                            onTriggerReady(entry.id);
                          }
                        }}
                      >
                        <Zap size={10} />
                      </span>
                    ) : null}
                    {entry.delayed || entry.readied ? (
                      <span
                        className="initiative-reroll"
                        role="button"
                        tabIndex={0}
                        title="Clear delayed/ready state"
                        onClick={(event) => {
                          event.stopPropagation();
                          onClearState(entry.id);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.stopPropagation();
                            onClearState(entry.id);
                          }
                        }}
                      >
                        <X size={10} />
                      </span>
                    ) : null}
                    <span
                      className="initiative-reroll"
                      role="button"
                      tabIndex={0}
                      title="Reroll this initiative"
                      onClick={(event) => {
                        event.stopPropagation();
                        onReroll(entry.id);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.stopPropagation();
                          onReroll(entry.id);
                        }
                      }}
                    >
                      <RefreshCw size={10} />
                    </span>
                    <span
                      className="initiative-remove"
                      role="button"
                      tabIndex={0}
                      title="Remove from initiative"
                      onClick={(event) => {
                        event.stopPropagation();
                        onRemove(entry.id);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.stopPropagation();
                          onRemove(entry.id);
                        }
                      }}
                    >
                      <Trash2 size={11} />
                    </span>
                  </>
                ) : null}
              </button>
            );
          })
        ) : (
          <span className="initiative-empty">
            {isGm
              ? "No initiative order yet. Roll for the table to begin."
              : "Waiting for the GM to roll initiative."}
          </span>
        )}
      </div>
      {isGm ? (
        <div className="initiative-controls">
          {entries.length ? (
            <>
              <IconButton label="Reset movement" onClick={onResetMovement} disabled={!active}>
                <Footprints size={16} />
              </IconButton>
              <IconButton
                label="Reset turn actions"
                onClick={onResetTurnActions}
                disabled={!active}
              >
                <Zap size={16} />
              </IconButton>
              <IconButton label="Previous turn" onClick={onPrevious}>
                <ChevronLeft size={16} />
              </IconButton>
              <IconButton label="Next turn" onClick={onNext}>
                <ChevronRight size={16} />
              </IconButton>
            </>
          ) : null}
          <Button
            size="sm"
            variant={entries.length ? "ghost" : "primary"}
            icon={<Dices size={14} />}
            onClick={onRoll}
          >
            Roll initiative
          </Button>
          {entries.length ? (
            <IconButton label="Clear initiative" onClick={onClear}>
              <RotateCcw size={14} />
            </IconButton>
          ) : null}
        </div>
      ) : (
        <div className="initiative-controls">
          {active ? <span className="tiny muted">Up: {active.name}</span> : null}
        </div>
      )}
    </div>
  );
}
