"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { safeNumber } from "@/lib/utils";
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

  const fetchTradesData = useCallback(async () => {
    setLoading(true);
    setError(null);

    // --- Trades ---
    const { data: trades, error: tradesError } = await supabase
      .from("trades")
      .select("*")
      .order("date", { ascending: false });

    console.log("Fetched Trades:", trades, tradesError);

    if (tradesError) {
      console.error("[useTrades] trades fetch failed:", tradesError);
      setError(`trades: ${tradesError.message}`);
      setTradesList([]);
    } else {
      const mapped = (trades ?? []).map(rowToTrade);
      setTradesList(mapped);
      console.log(
        `[useTrades] trades rows=${mapped.length}`,
        "types seen:",
        Array.from(new Set(mapped.map((t) => t.type)))
      );
    }

    // --- Active Stocks ---
    const { data: activeStocks, error: stocksError } = await supabase
      .from("active_stocks")
      .select("*");

    console.log("Fetched Active Stocks:", activeStocks, stocksError);

    if (stocksError) {
      console.error("[useTrades] active_stocks fetch failed:", stocksError);
      setError((prev) =>
        prev ? `${prev} | active_stocks: ${stocksError.message}` : `active_stocks: ${stocksError.message}`
      );
      setActiveStocksList([]);
    } else {
      const mapped = (activeStocks ?? []).map(rowToActiveStock);
      setActiveStocksList(mapped);
      console.log(`[useTrades] active_stocks rows=${mapped.length}`);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    fetchTradesData();
  }, [fetchTradesData]);

  // --- Categorize by exact string match ---
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

  // --- KPI aggregations (all numerics coerced via safeNumber in rowToTrade) ---
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
    refetch: fetchTradesData,
  };
}
