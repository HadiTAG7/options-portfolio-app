"use client";

import { useCallback, useEffect, useState } from "react";

// Benchmarks the fund is measured against. Defaults chosen for THIS book:
//   SPY  — S&P 500, the default "did we beat the market" yardstick.
//   QQQ  — Nasdaq-100. The honest index comparator, since the holdings are
//          US large-cap tech; measuring a tech book against SPY alone
//          flatters it.
//   JEPQ — JPMorgan Nasdaq Equity Premium Income: monthly distributions,
//          Nasdaq universe, and it runs essentially THIS strategy (equity +
//          sold options premium) at institutional scale. The fairest
//          like-for-like comparison of the three.
export const DEFAULT_BENCHMARKS = ["SPY", "QQQ", "JEPQ"] as const;

const STORAGE_KEY = "benchmarkSymbols";

export interface BenchmarkSeries {
  // symbol → { "YYYY-MM": adjusted close }
  series: Record<string, Record<string, number>>;
  loading: boolean;
  errors: string[];
}

function readStored(): string[] {
  if (typeof window === "undefined") return [...DEFAULT_BENCHMARKS];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [...DEFAULT_BENCHMARKS];
    const parsed = JSON.parse(raw) as unknown;
    if (
      Array.isArray(parsed) &&
      parsed.length > 0 &&
      parsed.every((s) => typeof s === "string")
    ) {
      return (parsed as string[]).slice(0, 6);
    }
  } catch {
    // fall through to defaults
  }
  return [...DEFAULT_BENCHMARKS];
}

export function useBenchmarks(months: number = 12) {
  const [symbols, setSymbolsState] = useState<string[]>([
    ...DEFAULT_BENCHMARKS,
  ]);
  const [state, setState] = useState<BenchmarkSeries>({
    series: {},
    loading: false,
    errors: [],
  });

  // Read the saved choice in an effect, not during render: the server
  // renders the defaults, so touching localStorage while rendering would
  // desync hydration.
  useEffect(() => {
    const stored = readStored();
    setSymbolsState((prev) =>
      prev.join(",") === stored.join(",") ? prev : stored
    );
  }, []);

  const setSymbols = useCallback((next: string[]) => {
    const clean = Array.from(
      new Set(
        next
          .map((s) => s.trim().toUpperCase())
          .filter((s) => /^[A-Z0-9.^-]{1,12}$/.test(s))
      )
    ).slice(0, 6);
    if (clean.length === 0) return;
    setSymbolsState(clean);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
    } catch {
      // private mode — the choice just won't persist
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setState((s) => ({ ...s, loading: true }));
      try {
        const res = await fetch("/api/benchmarks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ symbols, months }),
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as {
          series?: Record<string, Record<string, number>>;
          errors?: string[];
        };
        if (cancelled) return;
        setState({
          series: data.series ?? {},
          loading: false,
          errors: data.errors ?? [],
        });
      } catch (e) {
        if (cancelled) return;
        setState({
          series: {},
          loading: false,
          errors: [e instanceof Error ? e.message : "fetch failed"],
        });
      }
    }
    const t = setTimeout(() => void load(), 0);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [symbols, months]);

  return { ...state, symbols, setSymbols };
}

// Month-over-month return in %, or null when either endpoint is missing —
// null renders as "—" instead of a 0 that would read as "flat".
export function monthReturnPct(
  byMonth: Record<string, number> | undefined,
  month: string
): number | null {
  if (!byMonth) return null;
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return null;
  const prevDate = new Date(Date.UTC(y, m - 2, 1));
  const prevKey = `${prevDate.getUTCFullYear()}-${String(prevDate.getUTCMonth() + 1).padStart(2, "0")}`;
  const now = byMonth[month];
  const prev = byMonth[prevKey];
  if (!now || !prev) return null;
  return (now / prev - 1) * 100;
}

// Compounded return across the given months (chained, not summed — that's
// what makes it comparable to a buy-and-hold index).
export function cumulativeReturnPct(
  byMonth: Record<string, number> | undefined,
  months: string[]
): number | null {
  if (!byMonth || months.length === 0) return null;
  let factor = 1;
  let any = false;
  for (const m of months) {
    const r = monthReturnPct(byMonth, m);
    if (r === null) continue;
    factor *= 1 + r / 100;
    any = true;
  }
  return any ? (factor - 1) * 100 : null;
}
