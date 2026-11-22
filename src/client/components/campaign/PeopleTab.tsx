import { useEffect, useMemo, useState } from "react";
import { MapPin, Shield, Users } from "lucide-react";
import type {
  CampaignFaction,
  CampaignNpc,
  CampaignPeople,
  NpcAttitude,
} from "../../../shared/types";
import { npcAttitudeLabel, reputationLabel } from "../../../shared/people";
import { api } from "../../api";
import { errorMessage } from "../../stores";
import { Avatar, Badge, Card, EmptyState, PageEyebrow, Tag } from "../ui";

function attitudeTone(attitude: NpcAttitude): "red" | "gold" | "green" | "blue" {
  if (attitude === "hostile" || attitude === "unfriendly") return "red";
  if (attitude === "indifferent") return "gold";
  return "green";
}

export function PeopleTab({ campaignId, refreshKey }: { campaignId: string; refreshKey: number }) {
  const [people, setPeople] = useState<CampaignPeople | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api<CampaignPeople>(`/api/campaigns/${campaignId}/people`)
      .then((result) => {
        if (!cancelled) setPeople(result);
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [campaignId, refreshKey]);

  const grouped = useMemo(() => {
    if (!people) return [];
    return people.factions.map((faction) => ({
      faction,
      npcs: people.npcs.filter((npc) => npc.factionId === faction.id),
    }));
  }, [people]);
  const unaffiliated = people?.npcs.filter((npc) => !npc.factionId) ?? [];

  if (loading) return <p className="muted small">Opening the ledger…</p>;
  if (error) return <div className="auth-error">{error}</div>;
  if (!people || (!people.factions.length && !people.npcs.length)) {
    return (
      <div className="page-inner">
        <EmptyState
          icon={<Users size={28} />}
          title="No public people yet"
          description="The GM can share factions and NPCs from the NPC library."
        />
      </div>
    );
  }

  return (
    <div className="page-inner people-page">
      <div className="section-title">
        <div>
          <PageEyebrow>Social ledger</PageEyebrow>
          <h2>People &amp; factions</h2>
          <p>Who the party knows, where to find them, and how they stand with the party.</p>
        </div>
        <Badge tone="violet">
          {people.factions.length} factions · {people.npcs.length} people
        </Badge>
      </div>

      <div className="stack">
        {grouped.map(({ faction, npcs }) => (
          <Card key={faction.id} className="people-faction">
            <div className="people-faction-head">
              <div>
                <div className="row wrap" style={{ gap: 8 }}>
                  <h3>{faction.name}</h3>
                  <Tag tone={attitudeTone(faction.attitude)}>
                    {npcAttitudeLabel(faction.attitude)}
                  </Tag>
                  <Badge tone="gold">{reputationLabel(faction.reputation)}</Badge>
                </div>
                {faction.description ? <p className="small muted">{faction.description}</p> : null}
              </div>
              <Shield size={20} />
            </div>
            <div className="people-faction-details">
              {faction.goals ? (
                <p>
                  <strong>Goals:</strong> {faction.goals}
                </p>
              ) : null}
              {faction.assets ? (
                <p>
                  <strong>Assets:</strong> {faction.assets}
                </p>
              ) : null}
            </div>
            {npcs.length ? (
              <div className="people-grid">
                {npcs.map((npc) => (
                  <PeopleCard key={npc.id} npc={npc} />
                ))}
              </div>
            ) : (
              <p className="muted small">No public NPCs are linked to this faction yet.</p>
            )}
          </Card>
        ))}

        {unaffiliated.length ? (
          <Card>
            <PageEyebrow>Unaffiliated</PageEyebrow>
            <h3>Other people</h3>
            <div className="people-grid">
              {unaffiliated.map((npc) => (
                <PeopleCard key={npc.id} npc={npc} />
              ))}
            </div>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

function PeopleCard({ npc }: { npc: CampaignNpc }) {
  return (
    <div className="people-card">
      <div className="row" style={{ gap: 10 }}>
        <Avatar name={npc.name} src={npc.imageUrl} size={40} />
        <div className="grow">
          <div className="row wrap" style={{ gap: 7 }}>
            <strong>{npc.name}</strong>
            <Tag tone={attitudeTone(npc.attitude)}>{npcAttitudeLabel(npc.attitude)}</Tag>
          </div>
          <p className="tiny muted">
            {[npc.role, npc.location].filter(Boolean).join(" · ") || "Role unknown"}
          </p>
        </div>
      </div>
      {npc.publicDescription ? <p className="small">{npc.publicDescription}</p> : null}
      {npc.location ? (
        <span className="tiny muted">
          <MapPin size={12} /> {npc.location}
        </span>
      ) : null}
    </div>
  );
}
