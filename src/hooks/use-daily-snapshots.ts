"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { safeNumber } from "@/lib/utils";
import type { DailySnapshotRow } from "@/types/database";

export interface DailySnapshot {
  date: string; // YYYY-MM-DD
  stockUnrealized: number;
  stockValue: number;
}

export function todayKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Daily snapshots of the open stock book.
//
// WHY this exists: the app stores one *current* price per stock, so the
// day-by-day P&L view could only ever attribute a mark-to-market move to
// today — every earlier day showed realized amounts only. Recording where
// the book stood each day makes the move for day D recoverable as
// stockUnrealized(D) − stockUnrealized(D−1).
//
// It necessarily starts from the day it's switched on: past prices were
// never kept, so history cannot be backfilled.
export function useDailySnapshots(enabled: boolean = true) {
  const [snapshots, setSnapshots] = useState<DailySnapshot[]>([]);
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(async () => {
    if (!enabled) {
      setSnapshots([]);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.from("daily_snapshots").select("*");
    if (error) {
      console.warn("[useDailySnapshots] fetch failed:", error.message);
      setSnapshots([]);
    } else {
      setSnapshots(
        ((data ?? []) as DailySnapshotRow[])
          .map((r) => ({
            date: String(r.date ?? r.id),
            stockUnrealized: safeNumber(r.stockUnrealized),
            stockValue: safeNumber(r.stockValue),
          }))
          .sort((a, b) => a.date.localeCompare(b.date))
      );
    }
    setLoading(false);
  }, [enabled]);

  useEffect(() => {
    const t = setTimeout(() => void refetch(), 0);
    return () => clearTimeout(t);
  }, [refetch]);

  // Upsert today's row (fixed id = the date, so repeat calls overwrite
  // rather than pile up). Called once per session after live prices land;
  // the last write of the day is the one that sticks, which is what we
  // want — it's the closest reading to the close.
  const recordToday = useCallback(
    async (stockUnrealized: number, stockValue: number) => {
      const id = todayKey();
      const { error } = await supabase.from("daily_snapshots").insert({
        id,
        date: id,
        stockUnrealized,
        stockValue,
        updated_at: new Date().toISOString(),
      });
      if (error) {
        console.warn("[useDailySnapshots] record failed:", error.message);
        return;
      }
      setSnapshots((prev) => {
        const rest = prev.filter((s) => s.date !== id);
        return [...rest, { date: id, stockUnrealized, stockValue }].sort((a, b) =>
          a.date.localeCompare(b.date)
        );
      });
    },
    []
  );

  return { snapshots, loading, refetch, recordToday };
}
