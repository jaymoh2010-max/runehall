import { ChevronLeft, ChevronRight, Dices, RefreshCw, RotateCcw, Sparkles, Swords, Trash2 } from "lucide-react";
import type { InitiativeEntry, Token } from "../../../shared/types";
import { Badge, Button, IconButton } from "../ui";
import { signed } from "../../../shared/rules";
import { groupHp } from "../../../shared/tokens";

export function InitiativeBar({
  entries,
  tokens,
  round,
  turnIndex,
  isGm,
  selectedTokenId,
  onRoll,
  onNext,
  onPrevious,
  onClear,
  onRemove,
  onReroll,
  onSelectToken,
}: {
  entries: InitiativeEntry[];
  tokens: Token[];
  round: number;
  turnIndex: number;
  isGm: boolean;
  selectedTokenId: string | null;
  onRoll: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onClear: () => void;
  onRemove: (entryId: string) => void;
  onReroll: (entryId: string) => void;
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
            const token = entry.tokenId ? tokens.find((item) => item.id === entry.tokenId) ?? null : null;
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
              ? [...new Set(groupTokens.flatMap((item) => item.conditions))]
              : token?.conditions ?? [];
            const hpLabel = group
              ? group.max > 0
                ? `${group.current} / ${group.max} HP`
                : null
              : token && token.hpMax !== null
                ? `${token.hpCurrent ?? "?"} / ${token.hpMax} HP`
                : null;
            const detail = [
              entry.tokenId ? "Click to select token" : entry.name,
              group ? `${group.count} creatures` : null,
              hpLabel,
              !group && token?.ac !== null && token?.ac !== undefined ? `AC ${token.ac}` : null,
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
                {conditions.length ? (
                  <span className="initiative-condition-count" title={conditions.join(", ")}>
                    <Sparkles size={10} /> {conditions.length}
                  </span>
                ) : null}
                {index === turnIndex ? <Badge tone="gold">Turn</Badge> : null}
                {isGm ? (
                  <>
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
            {isGm ? "No initiative order yet. Roll for the table to begin." : "Waiting for the GM to roll initiative."}
          </span>
        )}
      </div>
      {isGm ? (
        <div className="initiative-controls">
          {entries.length ? (
            <>
              <IconButton label="Previous turn" onClick={onPrevious}><ChevronLeft size={16} /></IconButton>
              <IconButton label="Next turn" onClick={onNext}><ChevronRight size={16} /></IconButton>
            </>
          ) : null}
          <Button size="sm" variant={entries.length ? "ghost" : "primary"} icon={<Dices size={14} />} onClick={onRoll}>
            Roll initiative
          </Button>
          {entries.length ? (
            <IconButton label="Clear initiative" onClick={onClear}><RotateCcw size={14} /></IconButton>
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
