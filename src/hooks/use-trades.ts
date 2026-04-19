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
  const [trades, setTrades] = useState<Trade[]>([]);
  const [activeStocks, setActiveStocks] = useState<ActiveStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [tradesRes, stocksRes] = await Promise.all([
      supabase.from("trades").select("*").order("date", { ascending: false }),
      supabase.from("active_stocks").select("*"),
    ]);

    if (tradesRes.error) {
      console.error("[useTrades] trades fetch failed:", tradesRes.error);
      setError(tradesRes.error.message);
      setTrades([]);
    } else {
      setTrades((tradesRes.data ?? []).map(rowToTrade));
    }

    if (stocksRes.error) {
      console.error("[useTrades] active_stocks fetch failed:", stocksRes.error);
      if (!tradesRes.error) {
        setError(stocksRes.error.message);
      }
      setActiveStocks([]);
    } else {
      setActiveStocks((stocksRes.data ?? []).map(rowToActiveStock));
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const sellCalls = useMemo(
    () => trades.filter((t) => t.type === "Sell Call"),
    [trades]
  );
  const sellPuts = useMemo(
    () => trades.filter((t) => t.type === "Sell Put"),
    [trades]
  );
  const stockSells = useMemo(
    () => trades.filter((t) => t.type === "Stock Sell"),
    [trades]
  );

  const totalPremium = useMemo(
    () =>
      trades
        .filter((t) => t.type !== "Stock Sell")
        .reduce((sum, t) => sum + t.premium, 0),
    [trades]
  );
  const totalResult = useMemo(
    () => stockSells.reduce((sum, t) => sum + t.result, 0),
    [stockSells]
  );
  const totalProfit = totalPremium + totalResult;
  const openCount = sellCalls.length + sellPuts.length;

  return {
    trades,
    sellCalls,
    sellPuts,
    stockSells,
    activeStocks,
    loading,
    error,
    totalPremium,
    totalResult,
    totalProfit,
    openCount,
    refetch: fetchData,
  };
}
