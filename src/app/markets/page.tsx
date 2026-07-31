"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Gauge,
  Radar,
  RefreshCw,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { formatCurrency } from "@/lib/utils";
import { resolveApiKey } from "@/lib/finnhub";

interface QuoteData {
  price: number;
  change: number;
  changePct: number;
  high52w: number;
  low52w: number;
  loading: boolean;
}

type QuoteMap = Record<string, QuoteData>;

const BENCHMARKS = ["SPY", "QQQ", "SPUS", "HLAL"];
const WATCHLIST = ["NVDA", "AMD", "TSLA", "MSFT", "AMZN"];
const ALL_SYMBOLS = [...BENCHMARKS, ...WATCHLIST];

const BENCHMARK_META: Record<string, { name: string; nameAr: string }> = {
  SPY: { name: "S&P 500", nameAr: "مؤشر S&P 500" },
  QQQ: { name: "Nasdaq 100", nameAr: "مؤشر ناسداك" },
  SPUS: { name: "S&P 500 Sharia", nameAr: "الشريعة S&P" },
  HLAL: { name: "Wahed FTSE USA", nameAr: "حلال FTSE" },
};

// Mock IV Rank data (Finnhub free tier doesn't provide options IV)
const MOCK_IV_RANK: Record<string, number> = {
  NVDA: 72,
  AMD: 65,
  TSLA: 81,
  MSFT: 34,
  AMZN: 48,
};

const FINNHUB_BASE = "https://finnhub.io/api/v1";

async function fetchQuote(
  ticker: string,
  apiKey: string
): Promise<Partial<QuoteData> | null> {
  try {
    const res = await fetch(
      `${FINNHUB_BASE}/quote?symbol=${encodeURIComponent(ticker)}&token=${apiKey}`,
      { cache: "no-store" }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || !Number.isFinite(data.c) || data.c === 0) return null;
    return {
      price: data.c,
      change: data.d ?? 0,
      changePct: data.dp ?? 0,
      high52w: data.h ?? data.c,
      low52w: data.l ?? data.c,
    };
  } catch {
    return null;
  }
}

export default function MarketsPage() {
  const [quotes, setQuotes] = useState<QuoteMap>(() => {
    const init: QuoteMap = {};
    for (const s of ALL_SYMBOLS) {
      init[s] = {
        price: 0,
        change: 0,
        changePct: 0,
        high52w: 0,
        low52w: 0,
        loading: true,
      };
    }
    return init;
  });
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const fetchAll = useCallback(async () => {
    const apiKey = resolveApiKey();
    if (!apiKey) {
      setQuotes((prev) => {
        const next = { ...prev };
        for (const s of ALL_SYMBOLS) {
          next[s] = { ...next[s], loading: false };
        }
        return next;
      });
      return;
    }

    setRefreshing(true);

    // Fetch sequentially with small delay to respect 60 calls/min rate limit
    for (const symbol of ALL_SYMBOLS) {
      const result = await fetchQuote(symbol, apiKey);
      setQuotes((prev) => ({
        ...prev,
        [symbol]: {
          price: result?.price ?? 0,
          change: result?.change ?? 0,
          changePct: result?.changePct ?? 0,
          high52w: result?.high52w ?? 0,
          low52w: result?.low52w ?? 0,
          loading: false,
        },
      }));
      // 150ms between calls ≈ ~7 per second, well under limit
      await new Promise((r) => setTimeout(r, 150));
    }

    setLastUpdate(new Date());
    setRefreshing(false);
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const hasApiKey = !!resolveApiKey();

  return (
    <AppShell>
      {/* Page Header */}
      <div className="mb-8">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.28em] text-emerald-400/80 font-bold">
              Sovereign Terminal
            </p>
            <h1 className="mt-1 font-headline text-3xl font-light tracking-tight text-white">
              Markets Hub{" "}
              <span className="font-mono text-zinc-500">·</span>{" "}
              <span className="text-zinc-400 font-light">الأسواق</span>
            </h1>
          </div>
          <div className="flex items-center gap-3">
            {lastUpdate && (
              <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono tabular-nums">
                Updated {lastUpdate.toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={() => void fetchAll()}
              disabled={refreshing}
              className="group inline-flex items-center gap-2 rounded-md border border-zinc-800/60 bg-zinc-900/60 px-3.5 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-300 transition-all duration-200 hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-300 hover:shadow-[0_0_18px_-4px_rgba(16,185,129,0.5)] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <RefreshCw
                size={12}
                className={
                  refreshing
                    ? "animate-spin text-emerald-400"
                    : "transition-transform duration-500 group-hover:rotate-180"
                }
              />
              {refreshing ? "Fetching…" : "Refresh All"}
            </button>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.9)]" />
          <p className="text-xs text-zinc-500">
            {hasApiKey
              ? "Live market data via Finnhub · بيانات مباشرة"
              : "Finnhub API key missing · no live data"}
          </p>
        </div>
      </div>

      {/* ═══════ Market Benchmarks ═══════ */}
      <section className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-7 w-7 items-center justify-center rounded-md border border-cyan-400/30 bg-cyan-500/10">
            <Radar size={13} className="text-cyan-300" />
          </div>
          <div>
            <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-white">
              Benchmarks
            </h2>
            <p className="text-[9px] uppercase tracking-widest text-zinc-600">
              المؤشرات الرئيسية · Major Indices & Islamic ETFs
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {BENCHMARKS.map((symbol) => (
            <BenchmarkCard
              key={symbol}
              symbol={symbol}
              meta={BENCHMARK_META[symbol]}
              quote={quotes[symbol]}
            />
          ))}
        </div>
      </section>

      {/* ═══════ Wheel Strategy Watchlist ═══════ */}
      <section className="mb-8 overflow-hidden rounded-xl border border-zinc-800/60 bg-gradient-to-br from-zinc-900/60 via-zinc-950/80 to-black backdrop-blur-sm shadow-[0_0_40px_-12px_rgba(16,185,129,0.15)]">
        <div className="flex items-center justify-between border-b border-zinc-800/60 bg-zinc-950/60 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md border border-emerald-500/30 bg-emerald-500/10">
              <BarChart3 size={14} className="text-emerald-400" />
            </div>
            <div>
              <h2 className="font-headline text-sm font-bold text-white tracking-[0.18em] uppercase">
                Wheel Strategy Watchlist
              </h2>
              <p className="text-[10px] uppercase tracking-widest text-zinc-500">
                قائمة المراقبة · High-Premium Targets
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.8)]" />
              {WATCHLIST.length} tickers
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-zinc-950/80 text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                <th className="px-5 py-3 text-start font-semibold">Ticker</th>
                <th className="px-5 py-3 text-start font-semibold">
                  Live Price
                </th>
                <th className="px-5 py-3 text-start font-semibold">
                  Daily Change
                </th>
                <th className="px-5 py-3 text-start font-semibold">
                  52W Range
                </th>
                <th className="px-5 py-3 text-start font-semibold">
                  IV Rank
                </th>
              </tr>
            </thead>
            <tbody>
              {WATCHLIST.map((symbol, idx) => {
                const q = quotes[symbol];
                const zebra =
                  idx % 2 === 0 ? "bg-transparent" : "bg-zinc-900/30";
                return (
                  <WatchlistRow
                    key={symbol}
                    symbol={symbol}
                    quote={q}
                    ivRank={MOCK_IV_RANK[symbol] ?? 50}
                    zebra={zebra}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}

function BenchmarkCard({
  symbol,
  meta,
  quote,
}: {
  symbol: string;
  meta: { name: string; nameAr: string };
  quote: QuoteData;
}) {
  const positive = quote.change >= 0;
  const tone = positive ? "emerald" : "rose";
  const borderColor =
    tone === "emerald"
      ? "border-emerald-500/20 hover:border-emerald-500/40 hover:shadow-[0_0_28px_-8px_rgba(16,185,129,0.35)]"
      : "border-rose-500/20 hover:border-rose-500/40 hover:shadow-[0_0_28px_-8px_rgba(239,68,68,0.35)]";
  const glowBg =
    tone === "emerald" ? "bg-emerald-500/10" : "bg-rose-500/10";

  return (
    <div
      className={`group relative overflow-hidden rounded-xl border bg-gradient-to-br from-zinc-900/60 via-zinc-950/80 to-black p-5 backdrop-blur-sm transition-all duration-300 ${borderColor}`}
    >
      <div
        className={`pointer-events-none absolute -top-12 -right-8 h-32 w-32 rounded-full ${glowBg} blur-2xl transition-opacity duration-300 group-hover:opacity-80`}
      />
      <div className="relative">
        <div className="flex items-center justify-between mb-1">
          <span className="font-mono text-[13px] font-bold tracking-wider text-white">
            {symbol}
          </span>
          {!quote.loading &&
            (positive ? (
              <TrendingUp size={14} className="text-emerald-400" />
            ) : (
              <TrendingDown size={14} className="text-rose-400" />
            ))}
        </div>
        <p className="text-[9px] uppercase tracking-widest text-zinc-600 mb-3">
          {meta.name}
        </p>

        {quote.loading ? (
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-zinc-700 border-t-emerald-400" />
            <span className="text-[10px] uppercase tracking-widest text-zinc-600">
              fetching
            </span>
          </div>
        ) : quote.price === 0 ? (
          <p className="font-mono text-sm text-zinc-600">—</p>
        ) : (
          <>
            <p className="font-mono text-xl font-semibold tabular-nums tracking-tight text-white">
              {formatCurrency(quote.price)}
            </p>
            <div className="mt-1.5 flex items-center gap-2">
              {positive ? (
                <ArrowUpRight size={12} className="text-emerald-400" />
              ) : (
                <ArrowDownRight size={12} className="text-rose-400" />
              )}
              <span
                className={`font-mono text-[11px] font-bold tabular-nums ${positive ? "text-emerald-400" : "text-rose-400"}`}
              >
                {positive ? "+" : ""}
                {quote.change.toFixed(2)}
              </span>
              <span
                className={`font-mono text-[10px] tabular-nums ${positive ? "text-emerald-400/70" : "text-rose-400/70"}`}
              >
                ({positive ? "+" : ""}
                {quote.changePct.toFixed(2)}%)
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function WatchlistRow({
  symbol,
  quote,
  ivRank,
  zebra,
}: {
  symbol: string;
  quote: QuoteData;
  ivRank: number;
  zebra: string;
}) {
  const positive = quote.change >= 0;

  // 52-week progress: where current price sits between low and high
  const range = quote.high52w - quote.low52w;
  const progress =
    range > 0 ? ((quote.price - quote.low52w) / range) * 100 : 50;

  // IV Rank color tiers
  const ivColor =
    ivRank >= 70
      ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
      : ivRank >= 40
        ? "text-amber-300 border-amber-400/30 bg-amber-400/10"
        : "text-zinc-400 border-zinc-700/40 bg-zinc-800/40";

  return (
    <tr
      className={`border-t border-zinc-800/50 transition-colors hover:bg-emerald-500/[0.04] ${zebra}`}
    >
      <td className="px-5 py-3.5">
        <span className="font-mono text-[13px] font-bold tracking-wider text-white">
          {symbol}
        </span>
      </td>
      <td className="px-5 py-3.5 font-mono tabular-nums">
        {quote.loading ? (
          <span className="inline-flex items-center gap-2 text-zinc-500">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-zinc-700 border-t-emerald-400" />
          </span>
        ) : quote.price === 0 ? (
          <span className="text-zinc-600">—</span>
        ) : (
          <span className="text-[13px] font-semibold text-white">
            {formatCurrency(quote.price)}
          </span>
        )}
      </td>
      <td className="px-5 py-3.5 font-mono tabular-nums">
        {quote.loading ? (
          <span className="text-zinc-600">—</span>
        ) : quote.price === 0 ? (
          <span className="text-zinc-600">—</span>
        ) : (
          <div className="flex items-center gap-1.5">
            {positive ? (
              <ArrowUpRight size={12} className="text-emerald-400" />
            ) : (
              <ArrowDownRight size={12} className="text-rose-400" />
            )}
            <span
              className={`text-[12px] font-bold ${positive ? "text-emerald-400" : "text-rose-400"}`}
            >
              {positive ? "+" : ""}
              {quote.changePct.toFixed(2)}%
            </span>
          </div>
        )}
      </td>
      <td className="px-5 py-3.5">
        {quote.loading || quote.price === 0 ? (
          <span className="text-zinc-600">—</span>
        ) : (
          <div className="flex items-center gap-3 min-w-[160px]">
            <span className="font-mono text-[9px] tabular-nums text-zinc-600">
              {quote.low52w.toFixed(0)}
            </span>
            <div className="relative flex-1 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-rose-500/60 via-amber-400/50 to-emerald-500/60"
                style={{ width: "100%" }}
              />
              <div
                className="absolute top-1/2 -translate-y-1/2 h-3 w-1 rounded-full bg-white shadow-[0_0_6px_rgba(255,255,255,0.8)]"
                style={{ left: `${Math.min(100, Math.max(0, progress))}%` }}
              />
            </div>
            <span className="font-mono text-[9px] tabular-nums text-zinc-600">
              {quote.high52w.toFixed(0)}
            </span>
          </div>
        )}
      </td>
      <td className="px-5 py-3.5">
        <div className="flex items-center gap-2">
          <Gauge size={12} className="text-zinc-600" />
          <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold tabular-nums ${ivColor}`}
          >
            {ivRank}%
          </span>
        </div>
      </td>
    </tr>
  );
}
