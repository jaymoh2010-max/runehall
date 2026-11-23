import { useEffect, useMemo, useState } from "react";
import { Coins, Package, Search, UserRound, Users } from "lucide-react";
import type { CharacterRecord, Equipment } from "../../../shared/types";
import { currencyToCp } from "../../../shared/inventory";
import { api, formatCp } from "../../api";
import { errorMessage } from "../../stores";
import { Button, Field, Input, Modal, Select, Spinner } from "../ui";

export function AwardTreasureModal({
  open,
  onClose,
  campaignId,
  characters,
  onAwarded,
}: {
  open: boolean;
  onClose: () => void;
  campaignId: string;
  characters: CharacterRecord[];
  onAwarded: (result: { message: string; characters: CharacterRecord[] }) => void;
}) {
  const [target, setTarget] = useState("party");
  const [kind, setKind] = useState<"gold" | "item">("gold");
  const [gp, setGp] = useState("0");
  const [sp, setSp] = useState("0");
  const [cp, setCp] = useState("0");
  const [itemQuery, setItemQuery] = useState("");
  const [itemResults, setItemResults] = useState<Equipment[]>([]);
  const [itemLoading, setItemLoading] = useState(false);
  const [selectedItem, setSelectedItem] = useState<Equipment | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setTarget("party");
    setKind("gold");
    setGp("0");
    setSp("0");
    setCp("0");
    setItemQuery("");
    setItemResults([]);
    setSelectedItem(null);
    setQuantity("1");
    setError("");
  }, [open]);

  useEffect(() => {
    if (!open || kind !== "item" || !itemQuery.trim()) {
      setItemResults([]);
      setItemLoading(false);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setItemLoading(true);
      try {
        const params = new URLSearchParams({
          q: itemQuery.trim(),
          limit: "12",
        });
        const result = await api<{ items: Equipment[] }>(
          `/api/compendium/equipment?${params.toString()}`
        );
        if (!cancelled) setItemResults(result.items);
      } catch (err) {
        if (!cancelled) setError(errorMessage(err));
      } finally {
        if (!cancelled) setItemLoading(false);
      }
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [itemQuery, kind, open]);

  const totalCp = currencyToCp({
    gp: Number(gp) || 0,
    sp: Number(sp) || 0,
    cp: Number(cp) || 0,
  });
  const partySize = Math.max(1, characters.length);
  const shareCp = Math.floor(totalCp / partySize);
  const remainderCp = totalCp % partySize;
  const targetName =
    target === "party"
      ? "the whole party"
      : (characters.find((character) => character.id === target)?.name ?? "the character");
  const canSubmit = useMemo(() => {
    if (busy) return false;
    if (kind === "gold") return totalCp > 0;
    return Boolean(selectedItem) && Number(quantity) >= 1;
  }, [busy, kind, quantity, selectedItem, totalCp]);

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError("");
    try {
      const body =
        kind === "gold"
          ? {
              target,
              characterId: target === "party" ? undefined : target,
              kind,
              currency: { gp: Number(gp) || 0, sp: Number(sp) || 0, cp: Number(cp) || 0 },
            }
          : {
              target,
              characterId: target === "party" ? undefined : target,
              kind,
              itemId: selectedItem!.id,
              quantity: Math.max(1, Math.min(999, Math.round(Number(quantity) || 1))),
            };
      const result = await api<{ message: string; characters: CharacterRecord[] }>(
        `/api/campaigns/${campaignId}/awards`,
        { method: "POST", body }
      );
      onAwarded(result);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Award treasure"
      subtitle="Give coins or an item to one hero or the whole party."
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={!canSubmit}
            onClick={() => void submit()}
          >
            Award
          </Button>
        </>
      }
    >
      <div className="stack">
        <Field label="Recipient">
          <Select value={target} onChange={(event) => setTarget(event.target.value)}>
            <option value="party">Whole party ({characters.length})</option>
            {characters.map((character) => (
              <option key={character.id} value={character.id}>
                {character.name}
                {character.ownerName ? ` — ${character.ownerName}` : ""}
              </option>
            ))}
          </Select>
        </Field>

        <div className="segmented award-type" role="group" aria-label="Award type">
          <button
            type="button"
            className={kind === "gold" ? "is-active" : ""}
            aria-pressed={kind === "gold"}
            onClick={() => setKind("gold")}
          >
            <Coins size={14} /> Gold
          </button>
          <button
            type="button"
            className={kind === "item" ? "is-active" : ""}
            aria-pressed={kind === "item"}
            onClick={() => setKind("item")}
          >
            <Package size={14} /> Item
          </button>
        </div>

        {kind === "gold" ? (
          <>
            <div className="award-currency-row">
              <Field label="Gold pieces">
                <Input
                  type="number"
                  min={0}
                  step={1}
                  value={gp}
                  onChange={(event) => setGp(event.target.value)}
                />
              </Field>
              <Field label="Silver pieces">
                <Input
                  type="number"
                  min={0}
                  step={1}
                  value={sp}
                  onChange={(event) => setSp(event.target.value)}
                />
              </Field>
              <Field label="Copper pieces">
                <Input
                  type="number"
                  min={0}
                  step={1}
                  value={cp}
                  onChange={(event) => setCp(event.target.value)}
                />
              </Field>
            </div>
            <p className="award-preview">
              {totalCp > 0 ? (
                target === "party" ? (
                  <>
                    <Users size={14} /> {formatCp(totalCp)} split across {partySize} character
                    {partySize === 1 ? "" : "s"}: <strong>{formatCp(shareCp)} each</strong>
                    {remainderCp ? `, with ${remainderCp} cp of remainder split in order.` : "."}
                  </>
                ) : (
                  <>
                    <UserRound size={14} /> {formatCp(totalCp)} to {targetName}.
                  </>
                )
              ) : (
                "Enter the amount of coins to award."
              )}
            </p>
          </>
        ) : (
          <>
            <Field
              label="Find an item"
              hint="Awards are free; the character's purse is not charged."
            >
              <div className="search-box">
                <Search size={15} />
                <Input
                  value={itemQuery}
                  placeholder="Search items to award"
                  onChange={(event) => {
                    setItemQuery(event.target.value);
                    setSelectedItem(null);
                  }}
                />
              </div>
            </Field>
            {itemLoading ? <Spinner label="Searching the archive…" /> : null}
            {itemResults.length ? (
              <div className="award-item-list">
                {itemResults.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`award-item-row ${selectedItem?.id === item.id ? "is-selected" : ""}`}
                    onClick={() => setSelectedItem(item)}
                  >
                    <span>
                      <strong>{item.name}</strong>
                      <em>
                        Level {item.level} · {formatCp(item.price.cpTotal)}
                      </em>
                    </span>
                    <Package size={14} />
                  </button>
                ))}
              </div>
            ) : null}
            {selectedItem ? (
              <div className="award-selected-item">
                <div>
                  <strong>{selectedItem.name}</strong>
                  <span>
                    Level {selectedItem.level} · {formatCp(selectedItem.price.cpTotal)}
                  </span>
                </div>
                <Field label="Quantity">
                  <Input
                    type="number"
                    min={1}
                    max={999}
                    value={quantity}
                    onChange={(event) => setQuantity(event.target.value)}
                  />
                </Field>
              </div>
            ) : null}
            <p className="award-preview">
              {target === "party"
                ? "Each character in the party receives the selected quantity."
                : `The item is added to ${targetName}'s inventory.`}
            </p>
          </>
        )}

        {error ? <p className="auth-error">{error}</p> : null}
      </div>
    </Modal>
  );
}
