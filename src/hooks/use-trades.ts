"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { safeNumber } from "@/lib/utils";
import { fetchLivePrices } from "@/lib/finnhub";
import { seedTrades, seedActiveStocks } from "@/data/seed-trades";
import type { Trade, ActiveStock } from "@/types";
import type { TradeRow, ActiveStockRow } from "@/types/database";

function rowToTrade(row: TradeRow): Trade {
  return {
    id: row.id,
    ticker: row.ticker,
    type: row.type,
    quantity: safeNumber(row.quantity),
    premium: safeNumber(row.premium),
    strike: safeNumber(row.strike),
    result: safeNumber(row.result),
    expiration: row.expiration ?? "",
    date: row.date,
    status: row.status ?? "open",
    autoClosed: row.autoClosed ?? false,
  };
}

// A trade is expired when it's still open, has a valid expiration date,
// the expiration is on or before today, and it's a short option position
// (Sell Put / Sell Call). Stock Sell rows never expire.
function isExpiredOption(trade: Trade, now: Date = new Date()): boolean {
  if (trade.status !== "open") return false;
  if (trade.type !== "Sell Put" && trade.type !== "Sell Call") return false;
  if (!trade.expiration || trade.expiration.trim() === "") return false;

  const expDate = new Date(trade.expiration);
  if (Number.isNaN(expDate.getTime())) return false;

  // Compare at day granularity (midnight) — if today >= expiration day, it's expired.
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const exp = new Date(
    expDate.getFullYear(),
    expDate.getMonth(),
    expDate.getDate()
  );
  return today.getTime() >= exp.getTime();
}

function rowToActiveStock(row: ActiveStockRow): ActiveStock {
  const qty = safeNumber(row.quantity);
  const price = safeNumber(row.purchasePrice);
  return {
    id: row.id,
    ticker: row.ticker,
    quantity: qty,
    purchasePrice: price,
    targetSellPrice: safeNumber(row.targetSellPrice),
    purchaseDate: row.purchaseDate ?? "",
    costBasis: qty * price,
  };
}

export function useTrades() {
  const [tradesList, setTradesList] = useState<Trade[]>([]);
  const [activeStocksList, setActiveStocksList] = useState<ActiveStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usingSeedData, setUsingSeedData] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const enrichWithLivePrices = useCallback(async (stocks: ActiveStock[]) => {
    if (stocks.length === 0) return;

    // Mark every row as loading while we hit Finnhub
    setActiveStocksList((prev) =>
      prev.map((s) => ({ ...s, priceLoading: true }))
    );

    const prices = await fetchLivePrices(stocks.map((s) => s.ticker));

    setActiveStocksList((prev) =>
      prev.map((s) => ({
        ...s,
        currentPrice: prices[s.ticker.toUpperCase()] ?? null,
        priceLoading: false,
      }))
    );
  }, []);

  const fetchTradesData = useCallback(async () => {
    setLoading(true);
    setError(null);

    // --- Trades ---
    const { data: trades, error: tradesError } = await supabase
      .from("trades")
      .select("*", { count: "exact" })
      .order("date", { ascending: false });

    console.log("Fetched Trades:", trades, tradesError);

    if (tradesError) {
      console.error("[useTrades] trades fetch failed:", tradesError);
      setError(`trades: ${tradesError.message}`);
      setTradesList(seedTrades);
      setUsingSeedData(true);
    } else if (trades && trades.length > 0) {
      setTradesList(trades.map(rowToTrade));
      setUsingSeedData(false);
    } else {
      console.warn("[useTrades] Supabase returned 0 trades — using seed data");
      setTradesList(seedTrades);
      setUsingSeedData(true);
    }

    // --- Active Stocks ---
    const { data: activeStocks, error: stocksError } = await supabase
      .from("active_stocks")
      .select("*", { count: "exact" });

    console.log("Fetched Active Stocks:", activeStocks, stocksError);

    let stocks: ActiveStock[];
    if (stocksError) {
      console.error("[useTrades] active_stocks fetch failed:", stocksError);
      stocks = seedActiveStocks;
    } else if (activeStocks && activeStocks.length > 0) {
      stocks = activeStocks.map(rowToActiveStock);
    } else {
      console.warn(
        "[useTrades] Supabase returned 0 active_stocks — using seed data"
      );
      stocks = seedActiveStocks;
    }
    setActiveStocksList(stocks);

    setLoading(false);

    // Kick off live price enrichment in the background — don't block loading
    void enrichWithLivePrices(stocks);
  }, [enrichWithLivePrices]);

  // Detect expired option positions and auto-close them.
  // - Writes to Supabase in a single `.in('id', [...])` batch update
  //   (skipped when using seed data since those rows don't exist in DB).
  // - Also mirrors the change into local state so the UI updates even
  //   when the DB write is skipped.
  const checkAndCloseExpiredTrades = useCallback(
    async (trades: Trade[]) => {
      const expired = trades.filter((t) => isExpiredOption(t));
      if (expired.length === 0) return 0;

      console.log(
        "[useTrades] expiring",
        expired.length,
        "positions:",
        expired.map((t) => `${t.ticker} ${t.type} @ ${t.expiration}`)
      );

      // Short options expiring OTM: profit = premium * quantity.
      // `quantity` already stores total shares (100, 200, ...), not # of
      // contracts, so we must NOT multiply by 100 again.
      const computeResult = (t: Trade) =>
        Number(t.premium) * Number(t.quantity);

      if (!usingSeedData) {
        // Per-row updates because each expired trade has a different result.
        await Promise.all(
          expired.map(async (t) => {
            const { error: upErr } = await supabase
              .from("trades")
              .update({
                status: "closed",
                autoClosed: true,
                result: computeResult(t),
              })
              .eq("id", t.id);
            if (upErr) {
              console.error(
                `[useTrades] auto-close failed for ${t.id}:`,
                upErr
              );
            }
          })
        );
      }

      // Mirror into local state (works for both DB and seed modes).
      const expiredIds = new Set(expired.map((t) => t.id));
      setTradesList((prev) =>
        prev.map((t) =>
          expiredIds.has(t.id)
            ? {
                ...t,
                status: "closed",
                autoClosed: true,
                result: computeResult(t),
              }
            : t
        )
      );

      return expired.length;
    },
    [usingSeedData]
  );

  useEffect(() => {
    fetchTradesData();
  }, [fetchTradesData]);

  // Auto-expiration sweep: fires whenever the trade list changes
  // and there's at least one open option whose expiration has passed.
  // `ran` guards against re-running on the same set of expired ids.
  const [expirationRan, setExpirationRan] = useState<string>("");
  useEffect(() => {
    if (loading) return;
    if (tradesList.length === 0) return;

    const expired = tradesList.filter((t) => isExpiredOption(t));
    if (expired.length === 0) return;

    const key = expired.map((t) => t.id).sort().join(",");
    if (key === expirationRan) return;
    setExpirationRan(key);

    void (async () => {
      const n = await checkAndCloseExpiredTrades(tradesList);
      if (n > 0) {
        setToast(`Processed ${n} expired position${n === 1 ? "" : "s"}.`);
      }
    })();
  }, [loading, tradesList, expirationRan, checkAndCloseExpiredTrades]);

  // One-shot heal for a historical bug where auto-closed option results
  // were saved as premium * quantity * 100 (off by 100x). If the stored
  // `result` matches the inflated value within a cent, divide it by 100
  // and persist the corrected figure. Idempotent: once rows look sane,
  // this effect becomes a no-op.
  const [healRan, setHealRan] = useState(false);
  useEffect(() => {
    if (loading || healRan) return;
    if (tradesList.length === 0) return;

    const inflated = tradesList.filter((t) => {
      if (t.status !== "closed") return false;
      if (t.type !== "Sell Put" && t.type !== "Sell Call") return false;
      const correct = Number(t.premium) * Number(t.quantity);
      const stored = Number(t.result);
      if (!Number.isFinite(correct) || correct === 0) return false;
      return Math.abs(stored - correct * 100) < 0.5;
    });

    if (inflated.length === 0) {
      setHealRan(true);
      return;
    }

    setHealRan(true);
    void (async () => {
      const fixes = inflated.map((t) => ({
        id: t.id,
        result: Number(t.premium) * Number(t.quantity),
      }));

      if (!usingSeedData) {
        await Promise.all(
          fixes.map(async ({ id, result }) => {
            const { error: upErr } = await supabase
              .from("trades")
              .update({ result })
              .eq("id", id);
            if (upErr) {
              console.error(`[useTrades] heal failed for ${id}:`, upErr);
            }
          })
        );
      }

      const fixMap = new Map(fixes.map((f) => [f.id, f.result]));
      setTradesList((prev) =>
        prev.map((t) =>
          fixMap.has(t.id) ? { ...t, result: fixMap.get(t.id)! } : t
        )
      );
      setToast(
        `Corrected ${fixes.length} inflated option result${fixes.length === 1 ? "" : "s"}.`
      );
    })();
  }, [loading, tradesList, healRan, usingSeedData]);

  const addTrade = useCallback(
    async (payload: {
      type: "Stock" | "Sell Call" | "Sell Put";
      ticker: string;
      quantity: number;
      price: number; // purchasePrice for Stock, premium for options
      strike?: number;
      expiration?: string;
      date: string;
    }) => {
      setError(null);
      const ticker = payload.ticker.trim().toUpperCase();

      // ----- Stock -----
      if (payload.type === "Stock") {
        if (!usingSeedData) {
          const { data, error: insertError } = await supabase
            .from("active_stocks")
            .insert({
              ticker,
              quantity: payload.quantity,
              purchasePrice: payload.price,
              purchaseDate: payload.date,
            })
            .select()
            .single();

          if (insertError) {
            console.error("[useTrades] addTrade stock insert failed:", insertError);
            setError(insertError.message);
            throw insertError;
          }

          const newStock = rowToActiveStock(data as ActiveStockRow);
          setActiveStocksList((prev) => [...prev, newStock]);
          void enrichWithLivePrices([newStock]);
        } else {
          // Seed mode — local-only row
          const newStock: ActiveStock = {
            id: crypto.randomUUID(),
            ticker,
            quantity: payload.quantity,
            purchasePrice: payload.price,
            targetSellPrice: 0,
            purchaseDate: payload.date,
            costBasis: payload.quantity * payload.price,
          };
          setActiveStocksList((prev) => [...prev, newStock]);
          void enrichWithLivePrices([newStock]);
        }
        return;
      }

      // ----- Sell Call / Sell Put -----
      const insertRow = {
        ticker,
        type: payload.type,
        quantity: payload.quantity,
        premium: payload.price,
        strike: payload.strike ?? 0,
        expiration: payload.expiration ?? "",
        date: payload.date,
        status: "open" as const,
      };

      if (!usingSeedData) {
        const { data, error: insertError } = await supabase
          .from("trades")
          .insert(insertRow)
          .select()
          .single();

        if (insertError) {
          console.error("[useTrades] addTrade option insert failed:", insertError);
          setError(insertError.message);
          throw insertError;
        }

        setTradesList((prev) => [rowToTrade(data as TradeRow), ...prev]);
      } else {
        const newTrade: Trade = {
          id: crypto.randomUUID(),
          ticker,
          type: payload.type,
          quantity: payload.quantity,
          premium: payload.price,
          strike: payload.strike ?? 0,
          result: 0,
          expiration: payload.expiration ?? "",
          date: payload.date,
          status: "open",
          autoClosed: false,
        };
        setTradesList((prev) => [newTrade, ...prev]);
      }
    },
    [usingSeedData, enrichWithLivePrices]
  );

  const updateTrade = useCallback(
    async (
      id: string,
      payload: {
        quantity: number;
        strike: number;
        expiration: string;
        premium: number;
        date: string;
      }
    ) => {
      setError(null);

      const updatePayload = {
        quantity: Number(payload.quantity),
        strike: Number(payload.strike),
        premium: Number(payload.premium),
        expiration: payload.expiration,
        date: payload.date,
      };

      console.log("[updateTrade] id:", id, "payload:", updatePayload);

      try {
        const { error: updateError, status, statusText } = await supabase
          .from("trades")
          .update(updatePayload)
          .eq("id", id);

        console.log("[updateTrade] response:", status, statusText, updateError);

        if (updateError) {
          console.error("Supabase Update Error (trades):", updateError);
          setError(updateError.message);
          throw updateError;
        }

        // Update local state immediately so UI reflects changes
        setTradesList((prev) =>
          prev.map((t) =>
            t.id === id
              ? {
                  ...t,
                  quantity: updatePayload.quantity,
                  strike: updatePayload.strike,
                  premium: updatePayload.premium,
                  expiration: updatePayload.expiration,
                  date: updatePayload.date,
                }
              : t
          )
        );

        // Only refetch from Supabase if the data came from the DB;
        // otherwise refetch would overwrite with stale seed data.
        if (!usingSeedData) {
          await fetchTradesData();
        }
      } catch (err) {
        console.error("Supabase Update Error:", err);
        throw err;
      }
    },
    [fetchTradesData, usingSeedData]
  );

  const deleteTrade = useCallback(
    async (id: string) => {
      setError(null);

      if (!usingSeedData) {
        const { error: deleteError } = await supabase
          .from("trades")
          .delete()
          .eq("id", id);

        if (deleteError) {
          console.error("[deleteTrade] Supabase delete failed:", deleteError);
          setError(deleteError.message);
          throw deleteError;
        }
      }

      setTradesList((prev) => prev.filter((t) => t.id !== id));
    },
    [usingSeedData]
  );

  // Only OPEN option positions show up in the active tables
  const sellPuts = useMemo(
    () =>
      tradesList.filter((t) => t.type === "Sell Put" && t.status === "open"),
    [tradesList]
  );
  const sellCalls = useMemo(
    () =>
      tradesList.filter((t) => t.type === "Sell Call" && t.status === "open"),
    [tradesList]
  );
  const stockSells = useMemo(
    () => tradesList.filter((t) => t.type === "Stock Sell"),
    [tradesList]
  );
  // Closed option positions (auto-expired or manually closed)
  const closedOptions = useMemo(
    () =>
      tradesList.filter(
        (t) =>
          (t.type === "Sell Put" || t.type === "Sell Call") &&
          t.status === "closed"
      ),
    [tradesList]
  );

  const totalPremium = useMemo(
    () =>
      tradesList
        .filter(
          (t) =>
            (t.type === "Sell Put" || t.type === "Sell Call") &&
            t.status === "open"
        )
        .reduce((sum, t) => sum + Number(t.premium || 0), 0),
    [tradesList]
  );
  const totalResult = useMemo(
    () =>
      stockSells.reduce((sum, t) => sum + Number(t.result || 0), 0) +
      closedOptions.reduce((sum, t) => sum + Number(t.result || 0), 0),
    [stockSells, closedOptions]
  );
  const totalProfit = totalPremium + totalResult;
  const openCount = sellPuts.length + sellCalls.length;

  return {
    trades: tradesList,
    sellCalls,
    sellPuts,
    stockSells,
    closedOptions,
    activeStocks: activeStocksList,
    loading,
    error,
    totalPremium,
    totalResult,
    totalProfit,
    openCount,
    updateTrade,
    addTrade,
    deleteTrade,
    toast,
    dismissToast: () => setToast(null),
    refetch: fetchTradesData,
  };
}
