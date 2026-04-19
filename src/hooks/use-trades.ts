"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { safeNumber } from "@/lib/utils";
import type { Trade, ActiveStock } from "@/types";
import type { TradeRow } from "@/types/database";

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

// Derive current holdings from the trade ledger:
//   - Sell Put strike = assignment price (purchase price)
//   - Sell Call strike = covered-call target sell price
//   - Stock Sell rows mean the ticker has already been exited → skip
function deriveActiveStocks(trades: Trade[]): ActiveStock[] {
  const soldTickers = new Set(
    trades.filter((t) => t.type === "Stock Sell").map((t) => t.ticker)
  );

  type Accum = {
    ticker: string;
    putContracts: number;
    putStrikeWeightedSum: number;
    callStrike: number | null;
    premiumCollected: number;
  };

  const byTicker = new Map<string, Accum>();

  for (const trade of trades) {
    if (trade.type === "Stock Sell") continue;
    if (soldTickers.has(trade.ticker)) continue;

    const acc =
      byTicker.get(trade.ticker) ??
      ({
        ticker: trade.ticker,
        putContracts: 0,
        putStrikeWeightedSum: 0,
        callStrike: null,
        premiumCollected: 0,
      } satisfies Accum);

    acc.premiumCollected += trade.premium;

    if (trade.type === "Sell Put") {
      acc.putContracts += trade.quantity;
      acc.putStrikeWeightedSum += trade.strike * trade.quantity;
    } else if (trade.type === "Sell Call") {
      acc.callStrike = trade.strike;
    }

    byTicker.set(trade.ticker, acc);
  }

  return Array.from(byTicker.values())
    .filter((a) => a.putContracts > 0)
    .map((a) => {
      const shares = a.putContracts * 100;
      const purchasePrice =
        a.putContracts > 0 ? a.putStrikeWeightedSum / a.putContracts : 0;
      return {
        ticker: a.ticker,
        quantity: shares,
        purchasePrice,
        targetSellPrice: a.callStrike,
        costBasis: shares * purchasePrice,
        premiumCollected: a.premiumCollected,
      };
    })
    .sort((a, b) => b.costBasis - a.costBasis);
}

export function useTrades() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTrades = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error: fetchError } = await supabase
      .from("trades")
      .select("*")
      .order("date", { ascending: false });

    if (fetchError) {
      console.error("[useTrades] fetch failed:", fetchError);
      setError(fetchError.message);
      setTrades([]);
    } else {
      setTrades((data ?? []).map(rowToTrade));
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    fetchTrades();
  }, [fetchTrades]);

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

  const activeStocks = useMemo(() => deriveActiveStocks(trades), [trades]);

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
    refetch: fetchTrades,
  };
}
