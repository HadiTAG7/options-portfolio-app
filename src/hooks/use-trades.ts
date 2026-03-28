"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { OptionTrade } from "@/types";
import type { TradeRow } from "@/types/database";

function rowToTrade(row: TradeRow): OptionTrade {
  return {
    id: row.id,
    symbol: row.symbol,
    type: row.trade_type,
    quantity: Number(row.quantity),
    premium: Number(row.premium),
    strikePrice: Number(row.strike_price),
    expirationDate: row.expiration_date,
    entryDate: row.entry_date,
    unrealizedPnL: Number(row.unrealized_pnl),
    totalProfit: Number(row.total_profit),
    returnPercent: Number(row.return_percent),
  };
}

export function useTrades() {
  const [trades, setTrades] = useState<OptionTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTrades = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error: fetchError } = await supabase
      .from("trades")
      .select("*")
      .order("entry_date", { ascending: false });

    if (fetchError) {
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

  const totalProfit = trades.reduce((sum, t) => sum + t.totalProfit, 0);
  const openCount = trades.length;

  return { trades, loading, error, totalProfit, openCount, refetch: fetchTrades };
}
