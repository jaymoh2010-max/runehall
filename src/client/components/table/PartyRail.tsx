import { useMemo } from "react";
import { Heart, Shield, Sparkles, Swords, Users } from "lucide-react";
import type { CharacterRecord, PresenceUser, Token } from "../../../shared/types";
import { signed } from "../../../shared/rules";
import { Avatar, Tag } from "../ui";

interface PartyRailProps {
  characters: CharacterRecord[];
  tokens: Token[];
  presence: PresenceUser[];
  sceneId: string | null;
  selectedTokenId: string | null;
  onSelectToken: (tokenId: string) => void;
  onOpenCharacter: (characterId: string) => void;
}

export function PartyRail({
  characters,
  tokens,
  presence,
  sceneId,
  selectedTokenId,
  onSelectToken,
  onOpenCharacter,
}: PartyRailProps) {
  const onlineUserIds = useMemo(() => new Set(presence.map((person) => person.userId)), [presence]);

  return (
    <aside className="vtt-party-rail" aria-label="Party roster">
      <div className="party-rail-label" title="Party roster">
        <Users size={14} />
        <span>Party</span>
      </div>
      <div className="party-rail-list">
        {characters.map((character) => {
          const token = sceneId
            ? tokens.find(
                (item) =>
                  item.characterId === character.id && item.sceneId === sceneId && !item.hidden
              )
            : null;
          const summary = character.summary;
          const currentHp = summary?.currentHp ?? summary?.hp ?? 0;
          const maxHp = summary?.hp ?? 0;
          const tempHp = summary?.tempHp ?? 0;
          const hpPercent = maxHp > 0 ? Math.max(0, Math.min(100, (currentHp / maxHp) * 100)) : 0;
          const isSelected = Boolean(token && token.id === selectedTokenId);
          const isOnline = onlineUserIds.has(character.userId);
          return (
            <div key={character.id} className="party-rail-item">
              <button
                type="button"
                className={`party-avatar-button ${isSelected ? "is-selected" : ""} ${token ? "is-on-scene" : ""}`}
                aria-label={`${character.name}${summary ? `, level ${summary.level} ${summary.className}` : ", unfinished character"}. ${isOnline ? "Online" : "Offline"}. Open character sheet.`}
                onClick={() => onOpenCharacter(character.id)}
              >
                <Avatar name={character.name} src={summary?.portraitUrl} size={34} />
                <span className="party-avatar-level">{summary?.level ?? "?"}</span>
                <span className={`party-token-dot ${token ? "is-on-scene" : ""}`} />
                <span
                  className={`party-online-dot ${isOnline ? "is-online" : ""}`}
                  title={isOnline ? "Online" : "Offline"}
                />
              </button>

              <div className="party-popover" role="tooltip">
                <div className="party-popover-head">
                  <Avatar name={character.name} src={summary?.portraitUrl} size={48} />
                  <div className="party-popover-title">
                    <strong>{character.name}</strong>
                    <span>
                      {summary
                        ? `Level ${summary.level} ${summary.className || "Adventurer"}`
                        : "Unfinished character"}
                    </span>
                    <span className="tiny muted">
                      {summary
                        ? [summary.ancestry, summary.heritage].filter(Boolean).join(" · ")
                        : character.ownerName
                          ? `Played by ${character.ownerName}`
                          : "No sheet details yet"}
                    </span>
                  </div>
                  {token ? <Tag tone="gold">On scene</Tag> : <Tag>Off scene</Tag>}
                </div>

                {summary ? (
                  <>
                    <div className="party-hp-block">
                      <div className="party-hp-label">
                        <span>
                          <Heart size={12} /> Hit points
                        </span>
                        <strong>
                          {currentHp} / {maxHp}
                          {tempHp ? <em> +{tempHp} temp</em> : null}
                        </strong>
                      </div>
                      <div className="party-hp-bar">
                        <span
                          className={hpPercent <= 25 ? "is-low" : ""}
                          style={{ width: `${hpPercent}%` }}
                        />
                      </div>
                    </div>

                    <div className="party-popover-stats">
                      <div>
                        <Shield size={12} />
                        <span>AC</span>
                        <strong>{summary.ac ?? "—"}</strong>
                      </div>
                      <div>
                        <Swords size={12} />
                        <span>Speed</span>
                        <strong>{summary.speed ?? "—"} ft.</strong>
                      </div>
                      <div>
                        <Sparkles size={12} />
                        <span>Perception</span>
                        <strong>{signed(summary.perception ?? 0)}</strong>
                      </div>
                      <div>
                        <span>Class DC</span>
                        <strong>{summary.classDc ?? "—"}</strong>
                      </div>
                      <div>
                        <span>Spell DC</span>
                        <strong>{summary.spellDc ?? "—"}</strong>
                      </div>
                      <div>
                        <span>Key ability</span>
                        <strong>{summary.keyAbility?.toUpperCase() || "—"}</strong>
                      </div>
                    </div>

                    <div className="party-save-row">
                      <span>
                        Fort <strong>{signed(summary.fortitude ?? 0)}</strong>
                      </span>
                      <span>
                        Ref <strong>{signed(summary.reflex ?? 0)}</strong>
                      </span>
                      <span>
                        Will <strong>{signed(summary.will ?? 0)}</strong>
                      </span>
                      <span>
                        Hero <strong>{summary.heroPoints ?? 0}</strong>
                      </span>
                      {(summary.focusPoints ?? 0) > 0 ? (
                        <span>
                          Focus <strong>{summary.focusPoints}</strong>
                        </span>
                      ) : null}
                    </div>

                    {(summary.conditions ?? []).length ? (
                      <div className="party-condition-row">
                        {(summary.conditions ?? []).map((condition) => (
                          <Tag key={condition} tone="red">
                            {condition}
                          </Tag>
                        ))}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <p className="party-popover-empty">
                    This character hasn&apos;t been built yet. Open the sheet to finish it.
                  </p>
                )}

                <div className="party-popover-foot">
                  <span className="party-owner-presence">
                    <span className={`party-online-dot ${isOnline ? "is-online" : ""}`} />
                    {character.ownerName
                      ? `${character.ownerName} · ${isOnline ? "online" : "offline"}`
                      : isOnline
                        ? "Online"
                        : "Offline"}
                  </span>
                  <span>
                    {token ? "Click to select · Double-click for sheet" : "Double-click for sheet"}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
        {!characters.length ? (
          <span className="party-rail-empty" title="No characters in this campaign yet">
            +
          </span>
        ) : null}
      </div>
    </aside>
  );
}
