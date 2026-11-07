import { useEffect, useMemo, useState } from "react";
import { Coins, Minus, Plus, Search, Sparkles, Trash2, UserPlus } from "lucide-react";
import type {
  CampaignRuleset,
  CharacterRecord,
  Equipment,
  LootParcel,
} from "../../../shared/types";
import { lootCopper, lootIsEmpty, lootItemCount } from "../../../shared/loot";
import { api, formatCp, formatDate } from "../../api";
import { errorMessage } from "../../stores";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  IconButton,
  Input,
  PageEyebrow,
  Select,
  Spinner,
  Tag,
  Textarea,
} from "../ui";

export function LootBuilder({
  campaignId,
  isGm,
  ruleset,
  characters,
  onCharacterUpdated,
  toast,
}: {
  campaignId: string;
  isGm: boolean;
  ruleset: CampaignRuleset;
  characters: CharacterRecord[];
  onCharacterUpdated: (character: CharacterRecord) => void;
  toast: (message: string, kind?: "info" | "success" | "error") => void;
}) {
  const [parcels, setParcels] = useState<LootParcel[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [gpDraft, setGpDraft] = useState("0");
  const [spDraft, setSpDraft] = useState("0");
  const [cpDraft, setCpDraft] = useState("0");
  const [itemQuery, setItemQuery] = useState("");
  const [items, setItems] = useState<Equipment[]>([]);
  const [itemTotal, setItemTotal] = useState(0);
  const [itemLoading, setItemLoading] = useState(false);
  const [recipientId, setRecipientId] = useState("");

  const selected = useMemo(
    () => parcels.find((parcel) => parcel.id === selectedId) ?? null,
    [parcels, selectedId]
  );
  const draftCopper =
    Math.max(0, Number(gpDraft) || 0) * 100 +
    Math.max(0, Number(spDraft) || 0) * 10 +
    Math.max(0, Number(cpDraft) || 0);
  const draftEmpty = (selected?.items.length ?? 0) === 0 && draftCopper === 0;

  useEffect(() => {
    if (!isGm) return;
    let cancelled = false;
    setLoading(true);
    api<{ parcels: LootParcel[] }>(`/api/campaigns/${campaignId}/loot`)
      .then((result) => {
        if (cancelled) return;
        setParcels(result.parcels);
        setSelectedId((current) =>
          current && result.parcels.some((parcel) => parcel.id === current)
            ? current
            : (result.parcels[0]?.id ?? null)
        );
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
  }, [campaignId, isGm]);

  useEffect(() => {
    if (!selected) {
      setNameDraft("");
      setDescriptionDraft("");
      setGpDraft("0");
      setSpDraft("0");
      setCpDraft("0");
      return;
    }
    setNameDraft(selected.name);
    setDescriptionDraft(selected.description);
    setGpDraft(String(selected.gp));
    setSpDraft(String(selected.sp));
    setCpDraft(String(selected.cp));
  }, [selected?.id]);

  useEffect(() => {
    if (!isGm) return;
    setItemLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: itemQuery, limit: "30" });
        if (ruleset === "core") {
          params.set("core", "1");
          params.set("legacy", "0");
        } else if (ruleset === "expanded") {
          params.set("legacy", "0");
        } else {
          params.set("legacy", "1");
        }
        const result = await api<{ items: Equipment[]; total: number }>(
          `/api/compendium/equipment?${params.toString()}`
        );
        setItems(result.items);
        setItemTotal(result.total);
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setItemLoading(false);
      }
    }, 220);
    return () => window.clearTimeout(timer);
  }, [itemQuery, ruleset, isGm]);

  const replaceParcel = (parcel: LootParcel) => {
    setParcels((current) => current.map((entry) => (entry.id === parcel.id ? parcel : entry)));
  };

  const createParcel = async () => {
    setBusy(true);
    try {
      const result = await api<{ parcel: LootParcel }>(`/api/campaigns/${campaignId}/loot`, {
        method: "POST",
        body: { name: "New loot parcel", description: "" },
      });
      setParcels((current) => [...current, result.parcel]);
      setSelectedId(result.parcel.id);
      toast("Loot parcel created.", "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  };

  const saveParcel = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const result = await api<{ parcel: LootParcel }>(
        `/api/campaigns/${campaignId}/loot/${selected.id}`,
        {
          method: "PATCH",
          body: {
            name: nameDraft,
            description: descriptionDraft,
            gp: Number(gpDraft) || 0,
            sp: Number(spDraft) || 0,
            cp: Number(cpDraft) || 0,
          },
        }
      );
      replaceParcel(result.parcel);
      toast("Loot parcel saved.", "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  };

  const deleteParcel = async () => {
    if (!selected) return;
    if (!window.confirm(`Delete “${selected.name}”?`)) return;
    setBusy(true);
    try {
      await api(`/api/campaigns/${campaignId}/loot/${selected.id}`, { method: "DELETE" });
      const remaining = parcels.filter((parcel) => parcel.id !== selected.id);
      setParcels(remaining);
      setSelectedId(remaining[0]?.id ?? null);
      toast("Loot parcel deleted.", "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  };

  const addItem = async (item: Equipment) => {
    if (!selected) return;
    setBusy(true);
    try {
      const result = await api<{ parcel: LootParcel }>(
        `/api/campaigns/${campaignId}/loot/${selected.id}/items`,
        { method: "POST", body: { itemId: item.id, quantity: 1 } }
      );
      replaceParcel(result.parcel);
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  };

  const updateItem = async (itemId: string, quantity: number) => {
    if (!selected) return;
    try {
      const result = await api<{ parcel: LootParcel }>(
        `/api/campaigns/${campaignId}/loot/${selected.id}/items`,
        { method: "PATCH", body: { itemId, quantity } }
      );
      replaceParcel(result.parcel);
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  const removeItem = async (itemId: string) => {
    if (!selected) return;
    try {
      const result = await api<{ parcel: LootParcel }>(
        `/api/campaigns/${campaignId}/loot/${selected.id}/items/${encodeURIComponent(itemId)}`,
        { method: "DELETE" }
      );
      replaceParcel(result.parcel);
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  const distribute = async () => {
    if (!selected || !recipientId) return;
    const recipient = characters.find((character) => character.id === recipientId);
    if (!recipient) return;
    if (!window.confirm(`Give “${selected.name}” to ${recipient.name}?`)) return;
    setBusy(true);
    try {
      const saved = await api<{ parcel: LootParcel }>(
        `/api/campaigns/${campaignId}/loot/${selected.id}`,
        {
          method: "PATCH",
          body: {
            name: nameDraft,
            description: descriptionDraft,
            gp: Number(gpDraft) || 0,
            sp: Number(spDraft) || 0,
            cp: Number(cpDraft) || 0,
          },
        }
      );
      replaceParcel(saved.parcel);
      if (lootIsEmpty(saved.parcel)) {
        toast("Add items or coins before distributing this parcel.", "error");
        return;
      }
      const result = await api<{ parcel: LootParcel; character: CharacterRecord }>(
        `/api/campaigns/${campaignId}/loot/${selected.id}/distribute`,
        { method: "POST", body: { characterId: recipientId } }
      );
      replaceParcel(result.parcel);
      onCharacterUpdated(result.character);
      setRecipientId("");
      toast(`Loot given to ${result.character.name}.`, "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  };

  if (!isGm) {
    return (
      <div className="page-inner">
        <EmptyState
          icon={<Coins size={28} />}
          title="The GM's treasury"
          description="Loot preparation is only visible to the Game Master."
        />
      </div>
    );
  }

  return (
    <div className="page-inner loot-page">
      <div className="section-title">
        <div>
          <PageEyebrow>GM preparation</PageEyebrow>
          <h2>Loot parcels</h2>
          <p>
            Build a treasure parcel, then hand it to a character. Items and coins land on the sheet
            immediately.
          </p>
        </div>
        <Button variant="primary" icon={<Plus size={15} />} loading={busy} onClick={createParcel}>
          New parcel
        </Button>
      </div>

      {error ? (
        <div className="auth-error" style={{ marginBottom: 14 }}>
          {error}
        </div>
      ) : null}

      {loading ? (
        <Spinner label="Opening the treasury…" />
      ) : !parcels.length ? (
        <EmptyState
          icon={<Coins size={30} />}
          title="No loot prepared"
          description="Create a parcel for the next hoard, quest reward, or shop stock."
          action={
            <Button
              variant="primary"
              icon={<Plus size={15} />}
              loading={busy}
              onClick={createParcel}
            >
              Create the first parcel
            </Button>
          }
        />
      ) : (
        <div className="encounter-layout loot-layout">
          <aside className="encounter-list loot-list">
            <div className="row-between">
              <PageEyebrow>Parcels</PageEyebrow>
              <Badge>{parcels.length}</Badge>
            </div>
            <div className="encounter-list-items">
              {parcels.map((parcel) => (
                <button
                  key={parcel.id}
                  type="button"
                  className={`encounter-list-item ${parcel.id === selectedId ? "is-selected" : ""}`}
                  onClick={() => setSelectedId(parcel.id)}
                >
                  <span className="grow">
                    <strong>{parcel.name}</strong>
                    <span className="tiny muted">
                      {lootItemCount(parcel)} {lootItemCount(parcel) === 1 ? "item" : "items"} ·{" "}
                      {formatCp(lootCopper(parcel))}
                    </span>
                  </span>
                  {parcel.status === "distributed" ? (
                    <Tag tone="green">Given</Tag>
                  ) : (
                    <Coins size={14} />
                  )}
                </button>
              ))}
            </div>
          </aside>

          <div className="encounter-workspace">
            {!selected ? (
              <EmptyState
                icon={<Coins size={28} />}
                title="Choose a parcel"
                description="Select a parcel or create a new one."
              />
            ) : (
              <>
                <Card className="loot-header">
                  <div className="loot-header-main">
                    <Field label="Parcel name">
                      <Input
                        value={nameDraft}
                        onChange={(event) => setNameDraft(event.target.value)}
                        disabled={selected.status === "distributed"}
                      />
                    </Field>
                    <div className="loot-coins">
                      <Field label="Gold">
                        <Input
                          type="number"
                          min={0}
                          value={gpDraft}
                          onChange={(event) => setGpDraft(event.target.value)}
                          disabled={selected.status === "distributed"}
                        />
                      </Field>
                      <Field label="Silver">
                        <Input
                          type="number"
                          min={0}
                          value={spDraft}
                          onChange={(event) => setSpDraft(event.target.value)}
                          disabled={selected.status === "distributed"}
                        />
                      </Field>
                      <Field label="Copper">
                        <Input
                          type="number"
                          min={0}
                          value={cpDraft}
                          onChange={(event) => setCpDraft(event.target.value)}
                          disabled={selected.status === "distributed"}
                        />
                      </Field>
                    </div>
                  </div>
                  <div className="encounter-header-actions">
                    {selected.status === "distributed" ? <Tag tone="green">Distributed</Tag> : null}
                    {selected.status === "open" ? (
                      <Button size="sm" variant="secondary" loading={busy} onClick={saveParcel}>
                        Save
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Trash2 size={13} />}
                      onClick={deleteParcel}
                    >
                      Delete
                    </Button>
                  </div>
                  <Field label="Notes" className="encounter-notes">
                    <Textarea
                      rows={2}
                      value={descriptionDraft}
                      onChange={(event) => setDescriptionDraft(event.target.value)}
                      placeholder="Where it came from, what it is for, or who is carrying it."
                      disabled={selected.status === "distributed"}
                    />
                  </Field>
                </Card>

                <div className="encounter-columns">
                  <Card className="loot-items">
                    <div className="row-between">
                      <div>
                        <PageEyebrow>Contents</PageEyebrow>
                        <h3>What is in the parcel?</h3>
                      </div>
                      <Badge tone="gold">{formatCp(draftCopper)}</Badge>
                    </div>
                    {!selected.items.length ? (
                      <p className="muted small">
                        No items yet. Add equipment from the compendium.
                      </p>
                    ) : (
                      <div className="encounter-roster-list">
                        {selected.items.map((item) => (
                          <div key={item.itemId} className="encounter-roster-row">
                            <div className="encounter-roster-main">
                              <strong>{item.name}</strong>
                              <span className="tiny muted">{item.itemId}</span>
                            </div>
                            <div className="encounter-count">
                              <IconButton
                                label="Remove one"
                                onClick={() => void updateItem(item.itemId, item.quantity - 1)}
                                disabled={selected.status === "distributed" || item.quantity <= 1}
                              >
                                <Minus size={13} />
                              </IconButton>
                              <span>{item.quantity}</span>
                              <IconButton
                                label="Add one"
                                onClick={() => void updateItem(item.itemId, item.quantity + 1)}
                                disabled={selected.status === "distributed"}
                              >
                                <Plus size={13} />
                              </IconButton>
                            </div>
                            <IconButton
                              label={`Remove ${item.name}`}
                              onClick={() => void removeItem(item.itemId)}
                              disabled={selected.status === "distributed"}
                            >
                              <Trash2 size={13} />
                            </IconButton>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="loot-distribute">
                      {selected.status === "distributed" ? (
                        <div>
                          <strong>Given to {selected.distributedToName || "a character"}</strong>
                          <p className="tiny muted">
                            {selected.distributedAt
                              ? `Distributed ${formatDate(selected.distributedAt)}.`
                              : "This parcel is closed."}
                          </p>
                        </div>
                      ) : (
                        <>
                          <div>
                            <strong>Hand out the parcel</strong>
                            <p className="tiny muted">
                              {draftEmpty
                                ? "Add items or coins first."
                                : `${lootItemCount(selected)} ${lootItemCount(selected) === 1 ? "item" : "items"} and ${formatCp(draftCopper)} will move to the character.`}
                            </p>
                          </div>
                          <div className="loot-distribute-controls">
                            <Select
                              value={recipientId}
                              onChange={(event) => setRecipientId(event.target.value)}
                            >
                              <option value="">Choose a character…</option>
                              {characters.map((character) => (
                                <option key={character.id} value={character.id}>
                                  {character.name}
                                </option>
                              ))}
                            </Select>
                            <Button
                              variant="primary"
                              icon={<UserPlus size={14} />}
                              loading={busy}
                              disabled={!recipientId || draftEmpty}
                              onClick={distribute}
                            >
                              Give loot
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  </Card>

                  <Card className="loot-compendium">
                    <div className="row-between">
                      <div>
                        <PageEyebrow>Compendium</PageEyebrow>
                        <h3>Add equipment</h3>
                      </div>
                      <Badge tone="violet">
                        {itemLoading
                          ? "Searching…"
                          : itemTotal > items.length
                            ? `${items.length} of ${itemTotal}`
                            : `${items.length} results`}
                      </Badge>
                    </div>
                    <div className="encounter-search">
                      <div className="search-box">
                        <Search size={15} />
                        <Input
                          value={itemQuery}
                          onChange={(event) => setItemQuery(event.target.value)}
                          placeholder="Search equipment…"
                        />
                      </div>
                    </div>
                    {itemLoading ? (
                      <Spinner label="Searching equipment…" />
                    ) : (
                      <div className="encounter-monster-list">
                        {items.map((item) => (
                          <div key={item.id} className="encounter-monster-row">
                            <span className="encounter-monster-mark">
                              <Sparkles size={14} />
                            </span>
                            <div className="grow">
                              <strong>{item.name}</strong>
                              <span className="tiny muted">
                                Level {item.level} · {formatCp(item.price.cpTotal)}
                              </span>
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              icon={<Plus size={13} />}
                              disabled={selected.status === "distributed"}
                              onClick={() => void addItem(item)}
                            >
                              Add
                            </Button>
                          </div>
                        ))}
                        {!items.length ? (
                          <p className="muted small">No equipment matches that search.</p>
                        ) : null}
                      </div>
                    )}
                  </Card>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
