import { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  Compass,
  Dices,
  Footprints,
  Map,
  MapPin,
  Moon,
  Plus,
  RotateCcw,
  Sun,
  Trash2,
  TrendingUp,
} from "lucide-react";
import type {
  CampaignTravel,
  CharacterRecord,
  TravelEncounterCheck,
  TravelTerrain,
  TravelWatches,
  TravelWeather,
  TravelWaypoint,
} from "../../../shared/types";
import type { GolarionDate } from "../../../shared/calendar";
import {
  EXPLORATION_ACTIVITIES,
  TRAVEL_TERRAIN_OPTIONS,
  TRAVEL_WATCH_KEYS,
  TRAVEL_WATCH_LABELS,
  TRAVEL_WEATHER_OPTIONS,
  emptyTravelWatches,
  explorationActivityLabel,
  normalizeTravelSpeed,
  normalizeTravelWatches,
  travelDaysRemaining,
  travelEncounterDc,
  travelMilesPerDay,
  travelWeatherOption,
} from "../../../shared/travel";
import { formatGolarionDate } from "../../../shared/calendar";
import { api } from "../../api";
import { errorMessage } from "../../stores";
import {
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  Field,
  Input,
  PageEyebrow,
  ProgressBar,
  Select,
  Tag,
  Textarea,
} from "../ui";

interface TravelResponse {
  travel: CampaignTravel | null;
  suggestedSpeed: number;
}

export function TravelTab({
  campaignId,
  isGm,
  characters,
  worldDate,
  refreshKey,
  toast,
}: {
  campaignId: string;
  isGm: boolean;
  characters: CharacterRecord[];
  worldDate: GolarionDate;
  refreshKey: number;
  toast: (message: string, kind?: "info" | "success" | "error") => void;
}) {
  const [travel, setTravel] = useState<CampaignTravel | null>(null);
  const [suggestedSpeed, setSuggestedSpeed] = useState(25);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [terrain, setTerrain] = useState<TravelTerrain>("normal");
  const [distance, setDistance] = useState("0");
  const [partySpeed, setPartySpeed] = useState("25");
  const [weather, setWeather] = useState<TravelWeather>("clear");
  const [notes, setNotes] = useState("");
  const [watches, setWatches] = useState<TravelWatches>(emptyTravelWatches);
  const [activities, setActivities] = useState<Record<string, string>>({});
  const [waypointName, setWaypointName] = useState("");
  const [waypointMiles, setWaypointMiles] = useState("");
  const [waypointDescription, setWaypointDescription] = useState("");
  const [waypointVisible, setWaypointVisible] = useState(true);
  const [checkWatch, setCheckWatch] = useState("1");
  const [checkNote, setCheckNote] = useState("");
  const travelRef = useRef<CampaignTravel | null>(null);

  const characterIds = useMemo(() => new Set(characters.map((entry) => entry.id)), [characters]);
  const dailyMiles = travelMilesPerDay(Number(partySpeed) || 25, terrain);
  const distanceMiles = Math.max(0, Number(distance) || 0);

  const fillForm = (next: CampaignTravel | null, suggested: number) => {
    if (next) {
      setOrigin(next.origin);
      setDestination(next.destination);
      setTerrain(next.terrain);
      setDistance(String(next.distanceMiles));
      setPartySpeed(String(next.partySpeed));
      setWeather(next.weather);
      setNotes(next.notes);
      setWatches(next.watches);
      setActivities(next.activities);
    } else {
      setOrigin("");
      setDestination("");
      setTerrain("normal");
      setDistance("0");
      setPartySpeed(String(suggested));
      setWeather("clear");
      setNotes("");
      setWatches(emptyTravelWatches());
      setActivities({});
    }
  };

  const applyTravel = (result: TravelResponse) => {
    setTravel(result.travel);
    travelRef.current = result.travel;
    setSuggestedSpeed(result.suggestedSpeed);
    fillForm(result.travel, result.suggestedSpeed);
  };

  const applyTravelMeta = (result: TravelResponse) => {
    setTravel(result.travel);
    travelRef.current = result.travel;
    setSuggestedSpeed(result.suggestedSpeed);
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api<TravelResponse>(`/api/campaigns/${campaignId}/travel`)
      .then((result) => {
        if (cancelled) return;
        setSuggestedSpeed(result.suggestedSpeed);
        setTravel(result.travel);
        const previous = travelRef.current;
        travelRef.current = result.travel;
        if (!result.travel) {
          if (!previous) fillForm(null, result.suggestedSpeed);
          return;
        }
        if (!previous || previous.updatedAt !== result.travel.updatedAt) {
          fillForm(result.travel, result.suggestedSpeed);
        }
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

  const toggleWatch = (watch: (typeof TRAVEL_WATCH_KEYS)[number], characterId: string) => {
    setWatches((current) => {
      const members = current[watch];
      const next = members.includes(characterId)
        ? members.filter((id) => id !== characterId)
        : [...members, characterId];
      return normalizeTravelWatches({ ...current, [watch]: next }, characterIds);
    });
  };

  const setActivity = (characterId: string, activityId: string) => {
    setActivities((current) => {
      const next = { ...current };
      if (activityId) next[characterId] = activityId;
      else delete next[characterId];
      return next;
    });
  };

  const saveJourney = async () => {
    setBusy("save");
    setError("");
    try {
      const result = await api<TravelResponse>(`/api/campaigns/${campaignId}/travel`, {
        method: "PUT",
        body: {
          origin,
          destination,
          terrain,
          distanceMiles,
          partySpeed: normalizeTravelSpeed(Number(partySpeed) || suggestedSpeed),
          weather,
          notes,
          watches,
          activities,
        },
      });
      applyTravel(result);
      toast("Journey saved.", "success");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const advanceDay = async () => {
    setBusy("advance");
    setError("");
    try {
      const result = await api<{ travel: CampaignTravel; worldDate: GolarionDate }>(
        `/api/campaigns/${campaignId}/travel/advance`,
        { method: "POST", body: {} }
      );
      setTravel(result.travel);
      setDistance(String(result.travel.distanceMiles));
      setProgressFromTravel(result.travel);
      toast(
        result.travel.status === "complete"
          ? `The party arrives after ${result.travel.daysTravelled} day${
              result.travel.daysTravelled === 1 ? "" : "s"
            }.`
          : `Advanced one travel day: ${result.travel.progressMiles} of ${result.travel.distanceMiles} miles.`,
        "success"
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const setProgressFromTravel = (next: CampaignTravel) => {
    travelRef.current = next;
    setTravel(next);
    setPartySpeed(String(next.partySpeed));
    setTerrain(next.terrain);
  };

  const resetProgress = async () => {
    setBusy("reset");
    setError("");
    try {
      const result = await api<TravelResponse>(`/api/campaigns/${campaignId}/travel`, {
        method: "PUT",
        body: {
          origin,
          destination,
          terrain,
          distanceMiles,
          progressMiles: 0,
          daysTravelled: 0,
          partySpeed: normalizeTravelSpeed(Number(partySpeed) || suggestedSpeed),
          weather,
          notes,
          watches,
          activities,
        },
      });
      applyTravel(result);
      toast("Travel progress reset.", "success");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const clearJourney = async () => {
    if (!window.confirm("Clear this journey and its watch roster?")) return;
    setBusy("clear");
    setError("");
    try {
      const result = await api<TravelResponse>(`/api/campaigns/${campaignId}/travel`, {
        method: "DELETE",
      });
      applyTravel(result);
      toast("Journey cleared.", "success");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const addWaypoint = async () => {
    if (!waypointName.trim()) {
      toast("Give the waypoint a name.", "error");
      return;
    }
    setBusy("waypoint");
    setError("");
    try {
      const result = await api<TravelResponse>(`/api/campaigns/${campaignId}/travel/waypoints`, {
        method: "POST",
        body: {
          name: waypointName.trim(),
          miles: waypointMiles === "" ? undefined : Number(waypointMiles),
          description: waypointDescription,
          visible: waypointVisible,
        },
      });
      applyTravelMeta(result);
      setWaypointName("");
      setWaypointMiles("");
      setWaypointDescription("");
      setWaypointVisible(true);
      toast("Waypoint added to the route.", "success");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const deleteWaypoint = async (waypoint: TravelWaypoint) => {
    if (!window.confirm(`Remove “${waypoint.name}” from the route?`)) return;
    setBusy(`waypoint-${waypoint.id}`);
    setError("");
    try {
      const result = await api<TravelResponse>(
        `/api/campaigns/${campaignId}/travel/waypoints/${waypoint.id}`,
        { method: "DELETE" }
      );
      applyTravelMeta(result);
      toast("Waypoint removed.", "success");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const checkForEncounter = async () => {
    setBusy("check");
    setError("");
    try {
      const result = await api<{ check: TravelEncounterCheck; travel: CampaignTravel }>(
        `/api/campaigns/${campaignId}/travel/check`,
        {
          method: "POST",
          body: { watch: Number(checkWatch) || 1, note: checkNote.trim() },
        }
      );
      applyTravelMeta({ travel: result.travel, suggestedSpeed });
      setCheckNote("");
      toast(
        result.check.encounter
          ? `Encounter! d20 ${result.check.roll} reached the ${result.check.dc}+ threshold.`
          : `No encounter: d20 ${result.check.roll} stayed below ${result.check.dc}+.`,
        result.check.encounter ? "info" : "success"
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return <p className="muted small">Loading the journey…</p>;
  }

  const statusTone =
    travel?.status === "complete" ? "green" : travel?.status === "traveling" ? "blue" : "gold";

  return (
    <div className="page-inner travel-page">
      <div className="section-title">
        <div>
          <PageEyebrow>Exploration</PageEyebrow>
          <h2>Travel &amp; watches</h2>
          <p>
            Track a journey in miles, assign watches and exploration activities, and advance the
            calendar one travel day at a time.
          </p>
        </div>
        <div className="row wrap" style={{ gap: 8 }}>
          <Badge tone="violet">
            <CalendarDays size={12} /> {formatGolarionDate(worldDate)}
          </Badge>
          {travel ? <Tag tone={statusTone}>{travel.status}</Tag> : <Tag tone="gold">planning</Tag>}
        </div>
      </div>

      {error ? <div className="auth-error">{error}</div> : null}

      {!travel && !isGm ? (
        <EmptyState
          icon={<Compass size={28} />}
          title="No journey underway"
          description="The GM has not started a travel plan yet."
        />
      ) : (
        <>
          {travel ? (
            <Card className="travel-summary">
              <div className="travel-route">
                <span className="travel-place">
                  <MapPin size={15} />
                  <strong>{travel.origin || "Origin"}</strong>
                </span>
                <Footprints size={18} />
                <span className="travel-place">
                  <MapPin size={15} />
                  <strong>{travel.destination || "Destination"}</strong>
                </span>
              </div>
              <ProgressBar
                value={travel.progressMiles}
                max={travel.distanceMiles}
                label={`${travel.progressMiles} of ${travel.distanceMiles} miles · ${travel.daysTravelled} day${
                  travel.daysTravelled === 1 ? "" : "s"
                } travelled`}
              />
              <div className="travel-stats">
                <div>
                  <span>Daily progress</span>
                  <strong>{travel.dailyMiles} mi</strong>
                </div>
                <div>
                  <span>Terrain</span>
                  <strong>
                    {TRAVEL_TERRAIN_OPTIONS.find((e) => e.id === travel.terrain)?.label}
                  </strong>
                </div>
                <div>
                  <span>Weather</span>
                  <strong>{travelWeatherOption(travel.weather).label}</strong>
                </div>
                <div>
                  <span>ETA</span>
                  <strong>
                    {travel.status === "complete"
                      ? "Arrived"
                      : `${travelDaysRemaining(
                          travel.distanceMiles,
                          travel.progressMiles,
                          travel.dailyMiles
                        )} days`}
                  </strong>
                </div>
              </div>
              {travel.notes ? <p className="small muted">{travel.notes}</p> : null}
            </Card>
          ) : null}

          {isGm ? (
            <Card className="travel-editor">
              <div className="row-between">
                <div>
                  <PageEyebrow>GM controls</PageEyebrow>
                  <h3>{travel ? "Edit this journey" : "Plan a journey"}</h3>
                </div>
                <Badge tone="green">Slowest party Speed: {suggestedSpeed} ft</Badge>
              </div>

              <div className="travel-form-grid">
                <Field label="Origin">
                  <Input
                    value={origin}
                    onChange={(event) => setOrigin(event.target.value)}
                    placeholder="Where the party leaves from"
                  />
                </Field>
                <Field label="Destination">
                  <Input
                    value={destination}
                    onChange={(event) => setDestination(event.target.value)}
                    placeholder="Where they are going"
                  />
                </Field>
                <Field
                  label="Terrain"
                  hint={TRAVEL_TERRAIN_OPTIONS.find((entry) => entry.id === terrain)?.note}
                >
                  <Select
                    value={terrain}
                    onChange={(event) => setTerrain(event.target.value as TravelTerrain)}
                  >
                    {TRAVEL_TERRAIN_OPTIONS.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Distance (miles)">
                  <Input
                    type="number"
                    min={0}
                    step={0.5}
                    value={distance}
                    onChange={(event) => setDistance(event.target.value)}
                  />
                </Field>
                <Field
                  label="Party speed"
                  hint={`${dailyMiles} miles/day at this pace and terrain.`}
                >
                  <div className="row" style={{ gap: 8 }}>
                    <Input
                      type="number"
                      min={5}
                      max={120}
                      value={partySpeed}
                      onChange={(event) => setPartySpeed(event.target.value)}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      icon={<TrendingUp size={13} />}
                      onClick={() => setPartySpeed(String(suggestedSpeed))}
                    >
                      Slowest
                    </Button>
                  </div>
                </Field>
                <Field
                  label="Weather"
                  hint={TRAVEL_WEATHER_OPTIONS.find((entry) => entry.id === weather)?.note}
                >
                  <Select
                    value={weather}
                    onChange={(event) => setWeather(event.target.value as TravelWeather)}
                  >
                    {TRAVEL_WEATHER_OPTIONS.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              <Field label="Travel notes & discoveries">
                <Textarea
                  rows={3}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Road conditions, landmarks, rumors, and discoveries."
                />
              </Field>

              <div className="travel-waypoint-editor">
                <div className="row-between">
                  <div>
                    <PageEyebrow>Route map</PageEyebrow>
                    <p className="tiny muted">
                      Mark landmarks along the route. Players see shared waypoints and whether the
                      party has reached them.
                    </p>
                  </div>
                  <Badge>{travel?.waypoints.length ?? 0} landmarks</Badge>
                </div>
                {travel?.waypoints.length ? (
                  <div className="travel-waypoint-list">
                    {travel.waypoints.map((waypoint) => (
                      <div
                        key={waypoint.id}
                        className={`travel-waypoint ${waypoint.reached ? "is-reached" : ""}`}
                      >
                        <span className="travel-waypoint-dot" />
                        <div className="grow">
                          <div className="row wrap" style={{ gap: 7 }}>
                            <strong>{waypoint.name}</strong>
                            <Tag tone={waypoint.reached ? "green" : "neutral"}>
                              {waypoint.reached ? "Reached" : `${waypoint.miles} mi`}
                            </Tag>
                            <Tag tone={waypoint.visible ? "blue" : "gold"}>
                              {waypoint.visible ? "Shared" : "Hidden"}
                            </Tag>
                          </div>
                          {waypoint.description ? (
                            <p className="tiny muted">{waypoint.description}</p>
                          ) : null}
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<Trash2 size={13} />}
                          loading={busy === `waypoint-${waypoint.id}`}
                          onClick={() => void deleteWaypoint(waypoint)}
                        >
                          Remove
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="muted small">No landmarks on this route yet.</p>
                )}
                <div className="travel-waypoint-form">
                  <Field label="Waypoint name">
                    <Input
                      value={waypointName}
                      onChange={(event) => setWaypointName(event.target.value)}
                      placeholder="The Broken Bridge"
                    />
                  </Field>
                  <Field label="Miles from origin">
                    <Input
                      type="number"
                      min={0}
                      step={0.5}
                      value={waypointMiles}
                      onChange={(event) => setWaypointMiles(event.target.value)}
                      placeholder={String(travel?.progressMiles ?? 0)}
                    />
                  </Field>
                  <Field label="Waypoint notes">
                    <Input
                      value={waypointDescription}
                      onChange={(event) => setWaypointDescription(event.target.value)}
                      placeholder="What the party can see or learn here"
                    />
                  </Field>
                  <div className="travel-waypoint-add">
                    <Checkbox
                      label="Share this waypoint with players"
                      checked={waypointVisible}
                      onChange={setWaypointVisible}
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={<Plus size={14} />}
                      loading={busy === "waypoint"}
                      disabled={!travel || busy !== null}
                      onClick={() => void addWaypoint()}
                    >
                      Add waypoint
                    </Button>
                  </div>
                </div>
              </div>

              <div className="travel-encounter-editor">
                <div>
                  <PageEyebrow>Encounter check</PageEyebrow>
                  <p className="tiny muted">
                    Roll a d20 against the current threshold. Terrain and weather make encounters
                    more likely; a result at or above the threshold is an encounter.
                  </p>
                </div>
                <div className="row wrap" style={{ gap: 8 }}>
                  <Select
                    aria-label="Encounter watch"
                    value={checkWatch}
                    onChange={(event) => setCheckWatch(event.target.value)}
                  >
                    {TRAVEL_WATCH_KEYS.map((key, index) => (
                      <option key={key} value={String(index + 1)}>
                        {TRAVEL_WATCH_LABELS[key]}
                      </option>
                    ))}
                  </Select>
                  <Input
                    aria-label="Encounter note"
                    value={checkNote}
                    onChange={(event) => setCheckNote(event.target.value)}
                    placeholder="Optional context"
                    style={{ maxWidth: 280 }}
                  />
                  <Badge tone="gold">
                    Encounter on {travelEncounterDc(travel?.terrain, travel?.weather)}+
                  </Badge>
                  <Button
                    variant="secondary"
                    icon={<Dices size={15} />}
                    loading={busy === "check"}
                    disabled={!travel || busy !== null}
                    onClick={() => void checkForEncounter()}
                  >
                    Check for encounter
                  </Button>
                </div>
                {travel?.encounterChecks?.length ? (
                  <div className="travel-check-list">
                    {travel.encounterChecks.slice(0, 6).map((check) => (
                      <div key={check.id} className="travel-check">
                        <div className="row wrap" style={{ gap: 7 }}>
                          <Tag tone={check.encounter ? "red" : "green"}>
                            {check.encounter ? "Encounter" : "Clear"}
                          </Tag>
                          <strong>
                            Day {check.day} · watch {check.watch}
                          </strong>
                          <span className="tiny muted">
                            d20 {check.roll} vs {check.dc}+
                          </span>
                        </div>
                        {check.note ? <p className="tiny muted">{check.note}</p> : null}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="travel-watch-editor">
                <div className="row-between">
                  <div>
                    <PageEyebrow>Watches</PageEyebrow>
                    <p className="tiny muted">
                      Assign each character to any watch. Empty slots are unguarded.
                    </p>
                  </div>
                  <Badge>
                    {characters.length} character{characters.length === 1 ? "" : "s"}
                  </Badge>
                </div>
                {characters.length ? (
                  <div className="travel-table-wrap">
                    <table className="travel-table">
                      <thead>
                        <tr>
                          <th>Character</th>
                          {TRAVEL_WATCH_KEYS.map((key) => (
                            <th key={key}>{TRAVEL_WATCH_LABELS[key]}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {characters.map((character) => (
                          <tr key={character.id}>
                            <td>{character.name}</td>
                            {TRAVEL_WATCH_KEYS.map((key) => (
                              <td key={key}>
                                <input
                                  type="checkbox"
                                  checked={watches[key].includes(character.id)}
                                  aria-label={`${character.name} ${TRAVEL_WATCH_LABELS[key]}`}
                                  onChange={() => toggleWatch(key, character.id)}
                                />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="muted small">No characters in this campaign yet.</p>
                )}
              </div>

              <div className="travel-activity-editor">
                <PageEyebrow>Exploration activities</PageEyebrow>
                <p className="tiny muted">
                  Activities are reminders for the table; the sheet math and rolls stay manual.
                </p>
                {characters.length ? (
                  <div className="stack-sm">
                    {characters.map((character) => (
                      <div key={character.id} className="travel-activity-row">
                        <strong>{character.name}</strong>
                        <Select
                          value={activities[character.id] ?? ""}
                          aria-label={`${character.name} exploration activity`}
                          onChange={(event) => setActivity(character.id, event.target.value)}
                        >
                          <option value="">None</option>
                          {EXPLORATION_ACTIVITIES.map((entry) => (
                            <option key={entry.id} value={entry.id}>
                              {entry.label}
                            </option>
                          ))}
                        </Select>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="row-between travel-actions">
                <div className="row wrap" style={{ gap: 8 }}>
                  <Button
                    variant="primary"
                    loading={busy === "save"}
                    onClick={() => void saveJourney()}
                  >
                    Save journey
                  </Button>
                  <Button
                    variant="secondary"
                    icon={<Footprints size={14} />}
                    loading={busy === "advance"}
                    disabled={!travel || travel.status !== "traveling" || busy !== null}
                    onClick={() => void advanceDay()}
                  >
                    Advance day
                  </Button>
                  <Button
                    variant="ghost"
                    icon={<RotateCcw size={13} />}
                    loading={busy === "reset"}
                    disabled={!travel || busy !== null}
                    onClick={() => void resetProgress()}
                  >
                    Reset progress
                  </Button>
                </div>
                {travel ? (
                  <Button
                    variant="ghost"
                    icon={<Trash2 size={13} />}
                    loading={busy === "clear"}
                    disabled={busy !== null}
                    onClick={() => void clearJourney()}
                  >
                    Clear journey
                  </Button>
                ) : null}
              </div>
            </Card>
          ) : null}

          {travel ? (
            <div className="travel-player-grid">
              <Card>
                <PageEyebrow>Watches</PageEyebrow>
                <h3>Who is awake?</h3>
                <div className="stack-sm">
                  {TRAVEL_WATCH_KEYS.map((key) => (
                    <div key={key} className="travel-watch-row">
                      <span>
                        {key === "first" || key === "second" ? (
                          <Moon size={14} />
                        ) : (
                          <Sun size={14} />
                        )}{" "}
                        {TRAVEL_WATCH_LABELS[key]}
                      </span>
                      <strong>
                        {travel.watches[key].length
                          ? travel.watches[key]
                              .map(
                                (id) =>
                                  characters.find((character) => character.id === id)?.name ?? id
                              )
                              .join(", ")
                          : "Unguarded"}
                      </strong>
                    </div>
                  ))}
                </div>
              </Card>
              <Card>
                <PageEyebrow>Exploration</PageEyebrow>
                <h3>Party activities</h3>
                <div className="stack-sm">
                  {characters.map((character) => (
                    <div key={character.id} className="travel-watch-row">
                      <span>{character.name}</span>
                      <strong>
                        {explorationActivityLabel(
                          travel.activities[character.id] ?? activities[character.id]
                        )}
                      </strong>
                    </div>
                  ))}
                </div>
              </Card>
              <Card className="travel-map-card">
                <PageEyebrow>Route map</PageEyebrow>
                <h3>
                  <Map size={17} /> Landmarks
                </h3>
                {travel.waypoints.length ? (
                  <div className="travel-waypoint-list">
                    {travel.waypoints.map((waypoint) => (
                      <div
                        key={waypoint.id}
                        className={`travel-waypoint ${waypoint.reached ? "is-reached" : ""}`}
                      >
                        <span className="travel-waypoint-dot" />
                        <div className="grow">
                          <div className="row wrap" style={{ gap: 7 }}>
                            <strong>{waypoint.name}</strong>
                            <Tag tone={waypoint.reached ? "green" : "neutral"}>
                              {waypoint.reached ? "Reached" : `${waypoint.miles} mi`}
                            </Tag>
                          </div>
                          {waypoint.description ? (
                            <p className="tiny muted">{waypoint.description}</p>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="muted small">No landmarks have been shared yet.</p>
                )}
              </Card>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
