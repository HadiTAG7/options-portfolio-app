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
  };
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
    } else if (trades && trades.length > 0) {
      setTradesList(trades.map(rowToTrade));
    } else {
      console.warn("[useTrades] Supabase returned 0 trades — using seed data");
      setTradesList(seedTrades);
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

  useEffect(() => {
    fetchTradesData();
  }, [fetchTradesData]);

  const updateTrade = useCallback(
    async (
      id: string,
      payload: { quantity: number; strike: number; expiration: string; premium: number }
    ) => {
      setError(null);

      try {
        const { error: updateError } = await supabase
          .from("trades")
          .update({
            quantity: payload.quantity,
            strike: payload.strike,
            expiration: payload.expiration,
            premium: payload.premium,
          })
          .eq("id", id);

        if (updateError) {
          console.error("Supabase Update Error (trades):", updateError);
          setError(updateError.message);
          throw updateError;
        }

        await fetchTradesData();
      } catch (err) {
        console.error("Supabase Update Error:", err);
        throw err;
      }
    },
    [fetchTradesData]
  );

  const sellPuts = useMemo(
    () => tradesList.filter((t) => t.type === "Sell Put"),
    [tradesList]
  );
  const sellCalls = useMemo(
    () => tradesList.filter((t) => t.type === "Sell Call"),
    [tradesList]
  );
  const stockSells = useMemo(
    () => tradesList.filter((t) => t.type === "Stock Sell"),
    [tradesList]
  );

  const totalPremium = useMemo(
    () =>
      tradesList
        .filter((t) => t.type === "Sell Put" || t.type === "Sell Call")
        .reduce((sum, t) => sum + Number(t.premium || 0), 0),
    [tradesList]
  );
  const totalResult = useMemo(
    () => stockSells.reduce((sum, t) => sum + Number(t.result || 0), 0),
    [stockSells]
  );
  const totalProfit = totalPremium + totalResult;
  const openCount = sellPuts.length + sellCalls.length;

  return {
    trades: tradesList,
    sellCalls,
    sellPuts,
    stockSells,
    activeStocks: activeStocksList,
    loading,
    error,
    totalPremium,
    totalResult,
    totalProfit,
    openCount,
    updateTrade,
    refetch: fetchTradesData,
  };
}
