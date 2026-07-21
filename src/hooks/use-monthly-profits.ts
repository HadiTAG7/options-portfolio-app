"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { safeNumber } from "@/lib/utils";
import { monthlyPartnerNet, tradeMonthKey } from "@/lib/partner-profit";
import type { Partner, Trade } from "@/types";
import type { MonthlyProfitRow } from "@/types/database";

export type MonthlyProfitValue = { gross: number; fee: number; net: number };

export const monthlyKey = (month: string, partnerId: string) =>
  `${month}__${partnerId}`;

// Frozen monthly-profit records. GP reads the whole collection (rule
// gates LPs, so pass enabled=false for non-GP → empty, falls back to live
// compute). Exposes save (GP edit) and seed (fill missing months from the
// current live values, never overwriting an existing/edited entry).
export function useMonthlyProfits(enabled: boolean = true) {
  const [entries, setEntries] = useState<Map<string, MonthlyProfitValue>>(
    new Map()
  );
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(async () => {
    if (!enabled) {
      setEntries(new Map());
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.from("monthly_profits").select("*");
    if (error) {
      console.warn("[useMonthlyProfits] fetch failed:", error.message);
      setEntries(new Map());
    } else {
      const map = new Map<string, MonthlyProfitValue>();
      for (const r of (data ?? []) as MonthlyProfitRow[]) {
        map.set(monthlyKey(r.month, r.partnerId), {
          gross: safeNumber(r.gross),
          fee: safeNumber(r.fee),
          net: safeNumber(r.net),
        });
      }
      setEntries(map);
    }
    setLoading(false);
  }, [enabled]);

  useEffect(() => {
    const t = setTimeout(() => void refetch(), 0);
    return () => clearTimeout(t);
  }, [refetch]);

  // Upsert one (month, partner) record (fixed id → overwrite).
  const saveEntry = useCallback(
    async (month: string, partnerId: string, v: MonthlyProfitValue) => {
      const { error } = await supabase.from("monthly_profits").insert({
        id: monthlyKey(month, partnerId),
        month,
        partnerId,
        gross: v.gross,
        fee: v.fee,
        net: v.net,
        updated_at: new Date().toISOString(),
      });
      if (error) throw new Error(error.message);
      await refetch();
    },
    [refetch]
  );

  // Fill missing (month × partner) entries from the current live values.
  // Never overwrites an entry that already exists (so edits are safe).
  const seedAll = useCallback(
    async (partners: Partner[], trades: Trade[]): Promise<number> => {
      const months = new Set<string>();
      for (const t of trades) {
        const k = tradeMonthKey(t);
        if (k) months.add(k);
      }
      const { data } = await supabase.from("monthly_profits").select("*");
      const present = new Set<string>();
      for (const r of (data ?? []) as MonthlyProfitRow[]) {
        present.add(monthlyKey(r.month, r.partnerId));
      }
      let n = 0;
      for (const month of months) {
        for (const p of partners) {
          const id = monthlyKey(month, p.id);
          if (present.has(id)) continue;
          const md = monthlyPartnerNet(partners, trades, p.id, month);
          if (md.gross === 0 && md.net === 0) continue;
          const { error } = await supabase.from("monthly_profits").insert({
            id,
            month,
            partnerId: p.id,
            gross: md.gross,
            fee: md.fee,
            net: md.net,
            updated_at: new Date().toISOString(),
          });
          if (!error) n++;
        }
      }
      await refetch();
      return n;
    },
    [refetch]
  );

  return { entries, loading, refetch, saveEntry, seedAll };
}
