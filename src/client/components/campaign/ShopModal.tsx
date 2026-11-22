import { useEffect, useMemo, useRef, useState } from "react";
import { Coins, Search } from "lucide-react";
import type {
  CharacterRecord,
  Equipment,
  ShopState,
  ShopStockEntry,
  ShopStockMode,
} from "../../../shared/types";
import { currencyToCp } from "../../../shared/inventory";
import { shopBuyCostCp, shopSellValueCp, shopQuantity } from "../../../shared/shop";
import { ApiError, api, formatCp } from "../../api";
import { errorMessage } from "../../stores";
import { Badge, Button, Field, Input, Modal, PageEyebrow, Select, Tag } from "../ui";

interface StockDraftRow {
  itemId: string;
  name: string;
  level: number;
  priceCp: number;
  quantity: string;
}

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
  const [tab, setTab] = useState<"buy" | "sell" | "stock">("buy");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<Equipment[]>([]);
  const [itemTotal, setItemTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [lookup, setLookup] = useState<Record<string, Equipment>>({});
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [shop, setShop] = useState<ShopState | null>(null);
  const [shopLoading, setShopLoading] = useState(false);
  const [stockMode, setStockMode] = useState<ShopStockMode>("open");
  const stockModeRef = useRef<ShopStockMode>("open");
  const [stockRows, setStockRows] = useState<StockDraftRow[]>([]);
  const [stockQuery, setStockQuery] = useState("");
  const [stockResults, setStockResults] = useState<Equipment[]>([]);
  const [stockTotal, setStockTotal] = useState(0);
  const [stockLoading, setStockLoading] = useState(false);
  const [stockSaving, setStockSaving] = useState(false);
  const [merchantBusy, setMerchantBusy] = useState(false);

  const settlementLevel = character?.campaignSettlementLevel ?? 1;
  const ruleset = character?.campaignRuleset ?? "core";
  const currencyCp = character ? currencyToCp(character.data.currency) : 0;
  const isGm = Boolean(character?.permissions?.canAdvance);
  const shopMode = shop?.mode ?? "open";
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
  const stockMatches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (shop?.stock ?? []).filter(
      (entry) => !needle || entry.name.toLowerCase().includes(needle)
    );
  }, [shop?.stock, query]);

  const applyShopState = (state: ShopState) => {
    setShop(state);
    stockModeRef.current = state.mode;
    setStockMode(state.mode);
    setStockRows(
      state.stock.map((entry) => ({
        itemId: entry.itemId,
        name: entry.name,
        level: entry.level,
        priceCp: entry.priceCp,
        quantity: String(entry.quantity),
      }))
    );
  };

  const refreshShop = async () => {
    if (!character?.campaignId) return;
    try {
      const result = await api<{ shop: ShopState }>(`/api/campaigns/${character.campaignId}/shop`);
      applyShopState(result.shop);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  useEffect(() => {
    if (!open || !character?.campaignId) return;
    let cancelled = false;
    setShopLoading(true);
    api<{ shop: ShopState }>(`/api/campaigns/${character.campaignId}/shop`)
      .then((result) => {
        if (!cancelled) applyShopState(result.shop);
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setShopLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, character?.campaignId]);

  useEffect(() => {
    if (!open) return;
    setTab("buy");
    setQuery("");
    setError("");
    setQuantities({});
    setStockQuery("");
    setStockResults([]);
  }, [open, character?.id]);

  useEffect(() => {
    if (!open || !character?.id) return;
    if (!shop) return;
    if (shop.mode === "stocked") {
      setItems([]);
      setItemTotal(0);
      setLoading(false);
      return;
    }
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
  }, [open, character?.id, query, ruleset, settlementLevel, shop]);

  useEffect(() => {
    if (!open || tab !== "stock") return;
    let cancelled = false;
    setStockLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: stockQuery, limit: "40" });
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
        setStockResults(result.items.filter((item) => item.price.cpTotal > 0));
        setStockTotal(result.total);
        setError("");
      } catch (err) {
        if (!cancelled) setError(errorMessage(err));
      } finally {
        if (!cancelled) setStockLoading(false);
      }
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, tab, stockQuery, ruleset]);

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

  const buy = async (item: { id: string; name: string }) => {
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
      void refreshShop();
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
      void refreshShop();
    } catch (err) {
      if (!handleConflict(err)) setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const setStockQuantity = (itemId: string, value: string) =>
    setStockRows((current) =>
      current.map((row) => (row.itemId === itemId ? { ...row, quantity: value } : row))
    );

  const addStockItem = (item: Equipment) => {
    setStockRows((current) => {
      const existing = current.find((row) => row.itemId === item.id);
      if (existing) {
        return current.map((row) =>
          row.itemId === item.id
            ? { ...row, quantity: String(Math.min(9_999, Number(row.quantity || 0) + 1)) }
            : row
        );
      }
      return [
        ...current,
        {
          itemId: item.id,
          name: item.name,
          level: item.level,
          priceCp: item.price.cpTotal,
          quantity: "1",
        },
      ];
    });
  };

  const removeStockItem = (itemId: string) =>
    setStockRows((current) => current.filter((row) => row.itemId !== itemId));

  const saveStock = async () => {
    setStockSaving(true);
    setError("");
    const modeToSave = stockModeRef.current;
    try {
      const result = await api<{ shop: ShopState }>(
        `/api/campaigns/${character.campaignId}/shop/stock`,
        {
          method: "PUT",
          body: {
            mode: modeToSave,
            items: stockRows.map((row) => ({
              itemId: row.itemId,
              quantity: Math.max(0, Math.min(9_999, Math.floor(Number(row.quantity) || 0))),
            })),
          },
        }
      );
      applyShopState(result.shop);
      toast(
        modeToSave === "stocked"
          ? `Merchant stock saved: ${result.shop.stock.length} item row${
              result.shop.stock.length === 1 ? "" : "s"
            }.`
          : "Shop changed to an open market.",
        "success"
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setStockSaving(false);
    }
  };

  const activateMerchant = async (merchantId: string) => {
    setMerchantBusy(true);
    setError("");
    try {
      const result = await api<{ shop: ShopState }>(
        `/api/campaigns/${character.campaignId}/shop/merchants/${merchantId}/activate`,
        { method: "POST" }
      );
      applyShopState(result.shop);
      toast(`Now shopping at ${result.shop.merchantName}.`, "success");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setMerchantBusy(false);
    }
  };

  const addMerchant = async () => {
    const name = window.prompt("Name the new merchant:", "Traveling trader");
    if (!name?.trim()) return;
    setMerchantBusy(true);
    setError("");
    try {
      const result = await api<{ shop: ShopState }>(
        `/api/campaigns/${character.campaignId}/shop/merchants`,
        {
          method: "POST",
          body: {
            name: name.trim(),
            description: "",
            mode: stockModeRef.current,
          },
        }
      );
      applyShopState(result.shop);
      toast(`Merchant “${name.trim()}” added.`, "success");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setMerchantBusy(false);
    }
  };

  const renameMerchant = async () => {
    if (!shop) return;
    const name = window.prompt("Merchant name:", shop.merchantName);
    if (!name?.trim()) return;
    const description = window.prompt("Short merchant description:", shop.merchantDescription);
    if (description === null) return;
    setMerchantBusy(true);
    setError("");
    try {
      const result = await api<{ shop: ShopState }>(
        `/api/campaigns/${character.campaignId}/shop/merchants/${shop.merchantId}`,
        {
          method: "PATCH",
          body: { name: name.trim(), description },
        }
      );
      applyShopState(result.shop);
      toast("Merchant details saved.", "success");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setMerchantBusy(false);
    }
  };

  const deleteMerchant = async () => {
    if (!shop || !window.confirm(`Delete “${shop.merchantName}”?`)) return;
    setMerchantBusy(true);
    setError("");
    try {
      const result = await api<{ shop: ShopState }>(
        `/api/campaigns/${character.campaignId}/shop/merchants/${shop.merchantId}`,
        { method: "DELETE" }
      );
      applyShopState(result.shop);
      toast("Merchant deleted.", "success");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setMerchantBusy(false);
    }
  };

  const restockMerchant = async () => {
    if (!shop) return;
    const raw = window.prompt("Set every stock row to how many?", "5");
    if (raw === null) return;
    const quantity = Math.max(0, Math.min(9_999, Math.floor(Number(raw) || 0)));
    setMerchantBusy(true);
    setError("");
    try {
      const result = await api<{ shop: ShopState }>(
        `/api/campaigns/${character.campaignId}/shop/merchants/${shop.merchantId}/restock`,
        { method: "POST", body: { quantity } }
      );
      applyShopState(result.shop);
      toast(`Restocked ${result.shop.merchantName} to ${quantity}.`, "success");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setMerchantBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Settlement shop"
      subtitle={
        shopMode === "stocked"
          ? "GM-managed merchant stock. Buy what is in stock; gear sells for half price and treasure for full price."
          : `Common items up to level ${settlementLevel}. Gear sells for half price; treasure sells for full price.`
      }
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
          {isGm ? (
            <Button
              type="button"
              size="sm"
              variant={tab === "stock" ? "primary" : "ghost"}
              onClick={() => setTab("stock")}
            >
              Stock
            </Button>
          ) : null}
        </div>
        <Badge tone="gold">
          <Coins size={12} /> {formatCp(currencyCp)}
        </Badge>
      </div>

      {shop ? (
        <div className="shop-merchant-bar">
          <div>
            <PageEyebrow>Merchant</PageEyebrow>
            <strong>{shop.merchantName}</strong>
            {shop.merchantDescription ? (
              <p className="tiny muted">{shop.merchantDescription}</p>
            ) : null}
          </div>
          <div className="row wrap" style={{ gap: 8 }}>
            {isGm ? (
              <Select
                aria-label="Active merchant"
                value={shop.merchantId}
                disabled={merchantBusy}
                onChange={(event) => void activateMerchant(event.target.value)}
              >
                {shop.merchants.map((merchant) => (
                  <option key={merchant.id} value={merchant.id}>
                    {merchant.name} (
                    {merchant.mode === "stocked" ? `${merchant.stockCount} items` : "open"})
                  </option>
                ))}
              </Select>
            ) : (
              <Tag tone={shop.mode === "stocked" ? "violet" : "gold"}>
                {shop.mode === "stocked" ? "Tracked stock" : "Open market"}
              </Tag>
            )}
            {isGm && tab === "stock" ? (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  loading={merchantBusy}
                  onClick={() => void addMerchant()}
                >
                  New merchant
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  loading={merchantBusy}
                  onClick={() => void renameMerchant()}
                >
                  Rename
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  loading={merchantBusy}
                  onClick={() => void restockMerchant()}
                >
                  Restock
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={merchantBusy || shop.merchants.length <= 1}
                  onClick={() => void deleteMerchant()}
                >
                  Delete
                </Button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      {error ? <div className="auth-error">{error}</div> : null}

      {tab === "buy" ? (
        shopLoading && !shop ? (
          <p className="muted small">Loading shop…</p>
        ) : shopMode === "stocked" ? (
          <>
            <div className="encounter-search shop-search">
              <div className="search-box">
                <Search size={15} />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search merchant stock…"
                />
              </div>
              <Badge tone="violet">{stockMatches.length} stocked</Badge>
            </div>
            <div className="shop-list">
              {stockMatches.map((entry) => {
                const requested = quantityFor(entry.itemId);
                const cost = Math.max(0, entry.priceCp) * requested;
                const outOfStock = entry.quantity < 1;
                return (
                  <div key={entry.itemId} className="shop-row">
                    <div className="shop-row-main">
                      <strong>{entry.name}</strong>
                      <span className="tiny muted">
                        Level {entry.level} · {formatCp(entry.priceCp)} each ·{" "}
                        {outOfStock ? "out of stock" : `${entry.quantity} in stock`}
                      </span>
                    </div>
                    <Input
                      type="number"
                      min={1}
                      max={Math.max(1, entry.quantity)}
                      className="shop-quantity"
                      value={quantities[entry.itemId] ?? "1"}
                      onChange={(event) => setQuantity(entry.itemId, event.target.value)}
                      aria-label={`${entry.name} quantity`}
                      disabled={outOfStock}
                    />
                    <span className="shop-price">{formatCp(cost)}</span>
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={busyId === entry.itemId}
                      disabled={outOfStock || requested > entry.quantity || cost > currencyCp}
                      onClick={() => void buy({ id: entry.itemId, name: entry.name })}
                    >
                      {outOfStock ? "Out" : "Buy"}
                    </Button>
                  </div>
                );
              })}
              {!stockMatches.length ? (
                <p className="muted small">
                  {shop?.stock.length
                    ? "No merchant stock matches that search."
                    : "The merchant has no stock yet. The GM can add it from the Stock tab."}
                </p>
              ) : null}
            </div>
          </>
        ) : (
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
        )
      ) : tab === "sell" ? (
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
              {shopMode === "stocked"
                ? "This merchant only buys and sells what the GM has stocked. Selling gear adds it back to the merchant's inventory."
                : "The shop uses the simple common-stock rule. The GM can restrict high-level sales, charge downtime for a shopping trip, or adjust prices for supply and demand."}
            </p>
          </div>
        </div>
      ) : (
        <div className="stack">
          <Field
            label="Shop mode"
            hint="Open market keeps the current infinite common stock. Tracked stock uses the GM-managed inventory below."
          >
            <Select
              value={stockMode}
              aria-label="Shop mode"
              onChange={(event) => {
                stockModeRef.current = event.target.value as ShopStockMode;
                setStockMode(event.target.value as ShopStockMode);
              }}
            >
              <option value="open">Open market (infinite common stock)</option>
              <option value="stocked">Tracked merchant stock</option>
            </Select>
          </Field>

          {stockMode === "stocked" ? (
            <>
              <div className="row-between">
                <div>
                  <PageEyebrow>Merchant inventory</PageEyebrow>
                  <p className="tiny muted">
                    Buyers see these quantities. Selling gear adds it back here. Set 0 to keep an
                    item listed as out of stock.
                  </p>
                </div>
                <Badge tone={stockRows.length ? "green" : "gold"}>
                  {stockRows.length} item row{stockRows.length === 1 ? "" : "s"}
                </Badge>
              </div>
              <div className="shop-list">
                {stockRows.map((row) => (
                  <div key={row.itemId} className="shop-row">
                    <div className="shop-row-main">
                      <strong>{row.name}</strong>
                      <span className="tiny muted">
                        Level {row.level} · {formatCp(row.priceCp)} each
                      </span>
                    </div>
                    <Input
                      type="number"
                      min={0}
                      max={9999}
                      className="shop-quantity"
                      value={row.quantity}
                      aria-label={`${row.name} stock`}
                      onChange={(event) => setStockQuantity(row.itemId, event.target.value)}
                    />
                    <span className="shop-price">in stock</span>
                    <Button size="sm" variant="ghost" onClick={() => removeStockItem(row.itemId)}>
                      Remove
                    </Button>
                  </div>
                ))}
                {!stockRows.length ? (
                  <p className="muted small">
                    No stock yet. Search the compendium below and add items, or save an empty
                    merchant and let players sell to it.
                  </p>
                ) : null}
              </div>

              <div className="encounter-search shop-search">
                <div className="search-box">
                  <Search size={15} />
                  <Input
                    value={stockQuery}
                    onChange={(event) => setStockQuery(event.target.value)}
                    placeholder="Search the compendium to stock…"
                  />
                </div>
                <Badge tone="violet">
                  {stockLoading ? "Searching…" : `${stockResults.length} of ${stockTotal}`}
                </Badge>
              </div>
              <div className="shop-list">
                {stockResults.map((item) => {
                  const stocked = stockRows.some((row) => row.itemId === item.id);
                  return (
                    <div key={item.id} className="shop-row">
                      <div className="shop-row-main">
                        <strong>{item.name}</strong>
                        <span className="tiny muted">
                          Level {item.level} · {formatCp(item.price.cpTotal)} each
                        </span>
                      </div>
                      <span className="shop-price">{stocked ? "stocked" : ""}</span>
                      <span />
                      <Button size="sm" variant="secondary" onClick={() => addStockItem(item)}>
                        {stocked ? "+1" : "Add"}
                      </Button>
                    </div>
                  );
                })}
                {!stockLoading && !stockResults.length ? (
                  <p className="muted small">No compendium items match that search.</p>
                ) : null}
              </div>
            </>
          ) : (
            <div className="shop-note">
              <PageEyebrow>Open market</PageEyebrow>
              <p className="tiny muted">
                Players can buy any common item up to level {settlementLevel}. The stock list is
                kept but ignored until tracked stock is enabled again.
              </p>
            </div>
          )}

          <div className="row-between">
            <span className="tiny muted">
              {stockMode === "stocked"
                ? "Saving replaces the merchant's current inventory with the rows above."
                : "Tracked stock is preserved while the open market is active."}
            </span>
            <Button
              variant="primary"
              loading={stockSaving}
              disabled={stockSaving || shopLoading || !shop}
              onClick={saveStock}
            >
              Save merchant stock
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
