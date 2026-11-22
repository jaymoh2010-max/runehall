import { Link } from "react-router-dom";
import { Pencil, Plus, ScrollText, Sparkles, Users } from "lucide-react";
import type { CharacterRecord } from "../../../shared/types";
import { Avatar, Badge, Button, EmptyState, PageEyebrow, Stat } from "../ui";

export function CorePartyPanel({
  characters,
  isGm,
  onNewCharacter,
  onLevelUp,
  levelingId,
}: {
  characters: CharacterRecord[];
  isGm: boolean;
  onNewCharacter: () => void;
  onLevelUp: (characterId: string) => void;
  levelingId: string | null;
}) {
  return (
    <div className="page-inner">
      <div className="section-title">
        <div>
          <PageEyebrow>The party</PageEyebrow>
          <h2>Who&apos;s at the table?</h2>
          <p>Open a sheet to roll, manage gear, or make changes between sessions.</p>
        </div>
        <Button variant="primary" icon={<Plus size={15} />} onClick={onNewCharacter}>
          New character
        </Button>
      </div>

      <div className="party-grid">
        {characters.map((character) => (
          <article key={character.id} className="party-card card">
            <div className="party-card-top">
              <Avatar name={character.name} src={character.summary?.portraitUrl} size={58} />
              <div className="grow">
                <div className="row wrap" style={{ gap: 7 }}>
                  <h3>{character.name}</h3>
                  {character.permissions?.canEdit ? <Badge tone="gold">Editable</Badge> : null}
                  {(character.summary?.validationErrors ?? 0) > 0 ? (
                    <Badge tone="red">Needs choices</Badge>
                  ) : null}
                </div>
                <p className="tiny muted">
                  {character.summary
                    ? `Level ${character.summary.level} ${character.summary.className || ""} · ${character.summary.ancestry || "No ancestry"}`
                    : "Unfinished character"}
                </p>
                <p className="tiny muted">
                  {character.ownerName ? `Played by ${character.ownerName}` : ""}
                </p>
              </div>
            </div>

            {character.summary ? (
              <div className="party-stats">
                <Stat
                  label="HP"
                  value={`${character.summary.currentHp ?? character.summary.hp} / ${character.summary.hp}`}
                  tone="red"
                />
                <Stat label="AC" value={character.summary.ac} tone="gold" />
                <Stat label="Perception" value={character.summary.perception} />
                <Stat label="Speed" value={`${character.summary.speed} ft.`} />
              </div>
            ) : null}

            <div className="party-card-actions">
              <Link to={`/characters/${character.id}`} className="btn btn-secondary btn-sm">
                <ScrollText size={14} /> Sheet
              </Link>
              {character.permissions?.canEdit ? (
                <Link to={`/characters/${character.id}/edit`} className="btn btn-ghost btn-sm">
                  <Pencil size={14} /> Edit
                </Link>
              ) : null}
              {isGm ? (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Sparkles size={14} />}
                  loading={levelingId === character.id}
                  onClick={() => onLevelUp(character.id)}
                >
                  Level up
                </Button>
              ) : null}
            </div>
          </article>
        ))}
        {!characters.length ? (
          <EmptyState
            icon={<Users size={30} />}
            title="No heroes yet"
            description="Create the first character for this campaign."
            action={
              <Button variant="primary" icon={<Plus size={15} />} onClick={onNewCharacter}>
                Create a character
              </Button>
            }
          />
        ) : null}
      </div>
    </div>
  );
}
