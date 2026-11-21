import { useEffect, useMemo, useState } from "react";
import { Coins, Search } from "lucide-react";
import type { CharacterRecord, Equipment } from "../../../shared/types";
import { currencyToCp } from "../../../shared/inventory";
import { shopBuyCostCp, shopSellValueCp, shopQuantity } from "../../../shared/shop";
import { ApiError, api, formatCp } from "../../api";
import { errorMessage } from "../../stores";
import { Badge, Button, Input, Modal, PageEyebrow } from "../ui";

export function ShopModal({
  open,
  onClose,
  character,
  onCharacterUpdated,
  toast,
}: {
  open: boolean;
  onClose: () => void;
  character: CharacterRecord | null;
  onCharacterUpdated: (character: CharacterRecord) => void;
  toast: (message: string, kind?: "info" | "success" | "error") => void;
}) {
  const [tab, setTab] = useState<"buy" | "sell">("buy");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<Equipment[]>([]);
  const [itemTotal, setItemTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [lookup, setLookup] = useState<Record<string, Equipment>>({});
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const settlementLevel = character?.campaignSettlementLevel ?? 1;
  const ruleset = character?.campaignRuleset ?? "core";
  const currencyCp = character ? currencyToCp(character.data.currency) : 0;
  const equipmentIds = useMemo(
    () =>
      [
        ...new Set(
          (character?.data.equipment ?? []).flatMap((entry) => [
            entry.itemId,
            ...(entry.runes ?? []),
          ])
        ),
      ].sort(),
    [character?.data.equipment]
  );

  useEffect(() => {
    if (!open) return;
    setTab("buy");
    setQuery("");
    setError("");
    setQuantities({});
  }, [open, character?.id]);

  useEffect(() => {
    if (!open || !character?.id) return;
    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          q: query,
          limit: "40",
          rarity: "common",
          levelMax: String(settlementLevel),
        });
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
        if (cancelled) return;
        setItems(result.items.filter((item) => item.price.cpTotal > 0));
        setItemTotal(result.total);
        setError("");
      } catch (err) {
        if (!cancelled) setError(errorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, character?.id, query, ruleset, settlementLevel]);

  useEffect(() => {
    if (!open || !character?.id || !equipmentIds.length) {
      setLookup({});
      return;
    }
    let cancelled = false;
    api<{ items: Equipment[] }>("/api/compendium/lookup", {
      method: "POST",
      body: { ids: equipmentIds },
    })
      .then((result) => {
        if (cancelled) return;
        setLookup(Object.fromEntries(result.items.map((item) => [item.id, item])));
      })
      .catch(() => {
        // Selling still works if the lookup fails; the server resolves prices.
      });
    return () => {
      cancelled = true;
    };
  }, [open, character?.id, equipmentIds]);

  if (!character) return null;

  const quantityFor = (itemId: string) =>
    Math.max(1, Math.floor(Number(quantities[itemId] ?? "1") || 1));
  const setQuantity = (itemId: string, value: string) =>
    setQuantities((current) => ({ ...current, [itemId]: value }));
  const applyCharacter = (updated: CharacterRecord) => onCharacterUpdated(updated);

  const handleConflict = (err: unknown): boolean => {
    if (!(err instanceof ApiError) || err.status !== 409) return false;
    const payload = err.payload as { character?: CharacterRecord } | null;
    if (payload?.character) applyCharacter(payload.character);
    setError("The sheet changed somewhere else. Review the new totals before trying again.");
    return true;
  };

  const buy = async (item: Equipment) => {
    const quantity = quantityFor(item.id);
    setBusyId(item.id);
    setError("");
    try {
      const result = await api<{
        character: CharacterRecord;
        quantity: number;
        totalCp: number;
      }>(`/api/campaigns/${character.campaignId}/shop/buy`, {
        method: "POST",
        body: {
          characterId: character.id,
          itemId: item.id,
          quantity,
          expectedRevision: character.revision,
        },
      });
      applyCharacter(result.character);
      setQuantity(item.id, "1");
      toast(`Bought ${result.quantity}× ${item.name} for ${formatCp(result.totalCp)}.`, "success");
    } catch (err) {
      if (!handleConflict(err)) setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const sell = async (entry: CharacterRecord["data"]["equipment"][number]) => {
    const item = lookup[entry.itemId];
    if (!item) {
      setError("That item has no compendium price.");
      return;
    }
    const quantity = entry.runes?.length
      ? entry.quantity
      : Math.min(entry.quantity, shopQuantity(quantityFor(entry.itemId)));
    setBusyId(entry.itemId);
    setError("");
    try {
      const result = await api<{
        character: CharacterRecord;
        quantity: number;
        totalCp: number;
      }>(`/api/campaigns/${character.campaignId}/shop/sell`, {
        method: "POST",
        body: {
          characterId: character.id,
          itemId: entry.itemId,
          quantity,
          expectedRevision: character.revision,
        },
      });
      applyCharacter(result.character);
      setQuantity(entry.itemId, "1");
      toast(`Sold ${result.quantity}× ${item.name} for ${formatCp(result.totalCp)}.`, "success");
    } catch (err) {
      if (!handleConflict(err)) setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Settlement shop"
      subtitle={`Common items up to level ${settlementLevel}. Gear sells for half price; treasure sells for full price.`}
      extraWide
    >
      <div className="shop-top">
        <div className="shop-tabs">
          <Button
            type="button"
            size="sm"
            variant={tab === "buy" ? "primary" : "ghost"}
            onClick={() => setTab("buy")}
          >
            Buy
          </Button>
          <Button
            type="button"
            size="sm"
            variant={tab === "sell" ? "primary" : "ghost"}
            onClick={() => setTab("sell")}
          >
            Sell
          </Button>
        </div>
        <Badge tone="gold">
          <Coins size={12} /> {formatCp(currencyCp)}
        </Badge>
      </div>

      {error ? <div className="auth-error">{error}</div> : null}

      {tab === "buy" ? (
        <>
          <div className="encounter-search shop-search">
            <div className="search-box">
              <Search size={15} />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search common items…"
              />
            </div>
            <Badge tone="violet">
              {loading ? "Searching…" : `${items.length} of ${itemTotal}`}
            </Badge>
          </div>
          <div className="shop-list">
            {items.map((item) => {
              const quantity = quantityFor(item.id);
              const cost = shopBuyCostCp(item, quantity);
              return (
                <div key={item.id} className="shop-row">
                  <div className="shop-row-main">
                    <strong>{item.name}</strong>
                    <span className="tiny muted">
                      Level {item.level} · {formatCp(item.price.cpTotal)} each
                      {item.bulk ? ` · ${item.bulk} Bulk` : ""}
                    </span>
                  </div>
                  <Input
                    type="number"
                    min={1}
                    max={9999}
                    className="shop-quantity"
                    value={quantities[item.id] ?? "1"}
                    onChange={(event) => setQuantity(item.id, event.target.value)}
                    aria-label={`${item.name} quantity`}
                  />
                  <span className="shop-price">{formatCp(cost)}</span>
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={busyId === item.id}
                    disabled={cost > currencyCp}
                    onClick={() => void buy(item)}
                  >
                    Buy
                  </Button>
                </div>
              );
            })}
            {!loading && !items.length ? (
              <p className="muted small">No common items match that search at this level.</p>
            ) : null}
          </div>
        </>
      ) : (
        <div className="shop-list">
          {(character.data.equipment ?? []).map((entry) => {
            const item = lookup[entry.itemId];
            const wholeStack = entry.quantity;
            const quantity = entry.runes?.length
              ? wholeStack
              : Math.min(entry.quantity, shopQuantity(quantityFor(entry.itemId)));
            const runeCp = (entry.runes ?? []).reduce(
              (sum, runeId) => sum + (lookup[runeId]?.price.cpTotal ?? 0),
              0
            );
            const value = item
              ? shopSellValueCp(item, quantity, quantity >= entry.quantity ? runeCp : 0)
              : 0;
            return (
              <div key={entry.itemId} className="shop-row">
                <div className="shop-row-main">
                  <strong>{item?.name ?? entry.itemId}</strong>
                  <span className="tiny muted">
                    {entry.quantity} owned
                    {entry.runes?.length ? ` · ${entry.runes.length} rune(s)` : ""}
                    {item ? ` · ${formatCp(item.price.cpTotal)} each` : ""}
                  </span>
                </div>
                <Input
                  type="number"
                  min={1}
                  max={entry.quantity}
                  className="shop-quantity"
                  value={
                    entry.runes?.length ? String(entry.quantity) : (quantities[entry.itemId] ?? "1")
                  }
                  onChange={(event) => setQuantity(entry.itemId, event.target.value)}
                  disabled={Boolean(entry.runes?.length)}
                  aria-label={`${item?.name ?? entry.itemId} quantity`}
                />
                <span className="shop-price">{formatCp(value)}</span>
                <Button
                  size="sm"
                  variant="secondary"
                  loading={busyId === entry.itemId}
                  disabled={!item || value < 1}
                  onClick={() => void sell(entry)}
                >
                  {entry.runes?.length ? "Sell stack" : "Sell"}
                </Button>
              </div>
            );
          })}
          {!character.data.equipment.length ? (
            <p className="muted small">This character has no equipment to sell.</p>
          ) : null}
          <div className="shop-note">
            <PageEyebrow>Shop rules</PageEyebrow>
            <p className="tiny muted">
              The shop uses the simple common-stock rule. The GM can restrict high-level sales,
              charge downtime for a shopping trip, or adjust prices for supply and demand.
            </p>
          </div>
        </div>
      )}
    </Modal>
  );
}
