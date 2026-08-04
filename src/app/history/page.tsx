"use client";

import React, { useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  BookOpen,
  CircleDollarSign,
  Download,
  Layers,
  ScrollText,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { TableRowSkeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/utils";
import { toCsv, downloadCsv } from "@/lib/export-csv";
import { tradeProfit } from "@/lib/partner-profit";
import { useTrades } from "@/hooks/use-trades";
import type { Trade } from "@/types";
import { useCurrency } from "@/hooks/use-currency";

type HistoryCategory = "option" | "stock";
type FilterMode = "all" | HistoryCategory;

interface HistoryEntry {
  id: string;
  ticker: string;
  type: string;
  category: HistoryCategory;
  quantity: number;
  // Strike for options, purchase price for stock sells. Null when not set.
  strikeOrBuy: number | null;
  result: number;
  // "Date Closed": expiration for options, trade date for stock sells. Used
  // to sort the ledger descending so newest closures float to the top.
  closedDate: string;
  autoClosed: boolean;
}

function typeBadgeClass(type: string): string {
  switch (type) {
    case "Sell Put":
      return "border-rose-500/30 text-rose-300 bg-rose-500/5";
    case "Sell Call":
      return "border-cyan-400/30 text-cyan-300 bg-cyan-500/5";
    case "Stock Sell":
      return "border-emerald-500/30 text-emerald-300 bg-emerald-500/5";
    case "Dividend":
      return "border-amber-400/30 text-amber-300 bg-amber-400/5";
    default:
      return "border-zinc-700/50 text-zinc-400 bg-zinc-900/40";
  }
}

// Options close on their expiration; stock sells on their trade date.
// Falling back to `date` keeps older rows (manually closed before we
// tracked expiration) sortable.
function closeDateFor(t: Trade): string {
  const isOption = t.type === "Sell Put" || t.type === "Sell Call";
  if (isOption && t.expiration?.trim()) return t.expiration;
  return t.date ?? "";
}

export default function HistoryPage() {
  // Re-render this page when the display currency changes: the money
  // formatters read module state, so a subscription here is what makes
  // every figure below (and in child components) re-denominate.
  useCurrency();

  const { closedOptions, stockSells, dividends, loading, error } = useTrades();
  const [filter, setFilter] = useState<FilterMode>("all");

  const entries: HistoryEntry[] = useMemo(() => {
    const options: HistoryEntry[] = closedOptions.map((t) => ({
      id: t.id,
      ticker: t.ticker,
      type: t.type,
      category: "option",
      quantity: t.quantity,
      strikeOrBuy: t.strike > 0 ? t.strike : null,
      result: tradeProfit(t),
      closedDate: closeDateFor(t),
      autoClosed: t.autoClosed,
    }));
    const stocks: HistoryEntry[] = stockSells.map((t) => ({
      id: t.id,
      ticker: t.ticker,
      type: t.type,
      category: "stock",
      quantity: t.quantity,
      // Stock sells store the buy/cost-basis side in `premium` on the
      // trades table; fall through to null when the field is blank so
      // the column shows an em-dash instead of $0.00.
      strikeOrBuy: t.premium > 0 ? t.premium : null,
      result: Number(t.result) || 0,
      closedDate: closeDateFor(t),
      autoClosed: false,
    }));
    // Dividends sit in the stock bucket: they're realized income tied
    // to a holding. strikeOrBuy carries the per-share dividend.
    const divs: HistoryEntry[] = dividends.map((t) => ({
      id: t.id,
      ticker: t.ticker,
      type: t.type,
      category: "stock",
      quantity: t.quantity,
      strikeOrBuy: t.premium > 0 ? t.premium : null,
      result: Number(t.result) || 0,
      closedDate: t.date ?? "",
      autoClosed: false,
    }));
    return [...options, ...stocks, ...divs].sort((a, b) =>
      b.closedDate.localeCompare(a.closedDate)
    );
  }, [closedOptions, stockSells, dividends]);

  const visible = useMemo(
    () => (filter === "all" ? entries : entries.filter((e) => e.category === filter)),
    [entries, filter]
  );

  const allTimeRealized = useMemo(
    () => entries.reduce((sum, e) => sum + e.result, 0),
    [entries]
  );
  const optionsRealized = useMemo(
    () =>
      entries
        .filter((e) => e.category === "option")
        .reduce((sum, e) => sum + e.result, 0),
    [entries]
  );
  const stocksRealized = useMemo(
    () =>
      entries
        .filter((e) => e.category === "stock")
        .reduce((sum, e) => sum + e.result, 0),
    [entries]
  );
  const winners = useMemo(
    () => entries.filter((e) => e.result > 0).length,
    [entries]
  );

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
              Trade History Ledger{" "}
              <span className="font-mono text-zinc-500">·</span>{" "}
              <span className="text-zinc-400 font-light">السجل</span>
            </h1>
          </div>
          <button
            onClick={() => {
              const csv = toCsv(
                [
                  "التاريخ",
                  "الرمز",
                  "النوع",
                  "الكمية",
                  "Strike/شراء",
                  "النتيجة",
                  "إغلاق تلقائي",
                ],
                visible.map((e) => [
                  e.closedDate,
                  e.ticker,
                  e.type,
                  e.quantity,
                  e.strikeOrBuy ?? "",
                  e.result.toFixed(2),
                  e.autoClosed ? "نعم" : "لا",
                ])
              );
              downloadCsv(`trade-history-${filter}.csv`, csv);
            }}
            disabled={visible.length === 0}
            className="inline-flex items-center gap-2 rounded-md border border-zinc-800/60 bg-zinc-900/40 px-3.5 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-300 transition hover:border-zinc-700 hover:bg-zinc-900/80 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Download size={12} />
            Export CSV
          </button>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.9)]" />
          <p className="text-xs text-zinc-500">
            Closed &amp; expired positions · إجمالي الصفقات المغلقة
          </p>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mb-6 flex items-center gap-3 rounded-md border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-300 backdrop-blur-sm">
          <span className="font-mono">{error}</span>
        </div>
      )}

      {/* Summary Cards */}
      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-4">
        <SummaryCard
          icon={<BookOpen size={16} />}
          labelAr="إجمالي الأرباح المحققة تاريخياً"
          labelEn="All-Time Realized P&L"
          value={`${allTimeRealized >= 0 ? "+" : ""}${formatCurrency(allTimeRealized)}`}
          tone={allTimeRealized >= 0 ? "emerald" : "rose"}
        />
        <SummaryCard
          icon={<TrendingUp size={16} />}
          labelAr="أرباح الخيارات"
          labelEn="Options Realized"
          value={`${optionsRealized >= 0 ? "+" : ""}${formatCurrency(optionsRealized)}`}
          tone={optionsRealized >= 0 ? "emerald" : "rose"}
        />
        <SummaryCard
          icon={<CircleDollarSign size={16} />}
          labelAr="أرباح الأسهم"
          labelEn="Stocks Realized"
          value={`${stocksRealized >= 0 ? "+" : ""}${formatCurrency(stocksRealized)}`}
          tone={stocksRealized >= 0 ? "emerald" : "rose"}
        />
        <SummaryCard
          icon={<Layers size={16} />}
          labelAr="الصفقات المغلقة"
          labelEn="Closed Trades"
          value={`${entries.length}`}
          hint={
            entries.length > 0
              ? `${winners} win${winners === 1 ? "" : "s"} · ${entries.length - winners} loss${entries.length - winners === 1 ? "" : "es"}`
              : undefined
          }
          tone="cyan"
        />
      </div>

      {/* Ledger Table */}
      <section className="mb-8 overflow-hidden rounded-xl border border-zinc-800/60 bg-gradient-to-br from-zinc-900/60 via-zinc-950/80 to-black backdrop-blur-sm shadow-[0_0_40px_-12px_rgba(16,185,129,0.15)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/60 bg-zinc-950/60 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md border border-emerald-500/30 bg-emerald-500/10">
              <ScrollText size={14} className="text-emerald-400" />
            </div>
            <div>
              <h2 className="font-headline text-sm font-bold text-white tracking-[0.18em] uppercase">
                Realized Ledger
              </h2>
              <p className="text-[10px] uppercase tracking-widest text-zinc-500">
                Sorted by Date Closed · Newest First
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.8)]" />
              {visible.length} records
            </span>
          </div>
          <FilterTabs value={filter} onChange={setFilter} />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-zinc-950/80 text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                <th className="px-4 py-3 text-start font-semibold">
                  Date Closed
                  <span className="ml-2 font-normal normal-case tracking-normal text-zinc-600">
                    تاريخ الإغلاق
                  </span>
                </th>
                <th className="px-4 py-3 text-start font-semibold">
                  Ticker
                  <span className="ml-2 font-normal normal-case tracking-normal text-zinc-600">
                    الرمز
                  </span>
                </th>
                <th className="px-4 py-3 text-start font-semibold">
                  Trade Type
                  <span className="ml-2 font-normal normal-case tracking-normal text-zinc-600">
                    النوع
                  </span>
                </th>
                <th className="px-4 py-3 text-start font-semibold">Qty</th>
                <th className="px-4 py-3 text-start font-semibold">
                  Strike / Buy Price
                  <span className="ml-2 font-normal normal-case tracking-normal text-zinc-600">
                    سعر التنفيذ/الشراء
                  </span>
                </th>
                <th className="px-4 py-3 text-start font-semibold">
                  Result / PnL
                  <span className="ml-2 font-normal normal-case tracking-normal text-zinc-600">
                    النتيجة المحققة
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <>
                  <TableRowSkeleton cols={6} />
                  <TableRowSkeleton cols={6} />
                  <TableRowSkeleton cols={6} />
                </>
              )}

              {!loading && visible.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-16 text-center">
                    <ScrollText
                      size={36}
                      className="mx-auto mb-2 text-zinc-700"
                    />
                    <p className="text-xs text-zinc-500">
                      {filter === "all"
                        ? "لا توجد صفقات مغلقة بعد"
                        : filter === "option"
                          ? "لا توجد خيارات مغلقة"
                          : "لا توجد مبيعات أسهم"}
                    </p>
                    <p className="mt-1 text-[10px] text-zinc-600 uppercase tracking-widest">
                      {filter === "all"
                        ? "Close a position or let an option expire to see it here"
                        : "Try a different filter"}
                    </p>
                  </td>
                </tr>
              )}

              {!loading &&
                visible.map((entry, idx) => {
                  const positive = entry.result > 0;
                  const negative = entry.result < 0;
                  const zebra =
                    idx % 2 === 0 ? "bg-transparent" : "bg-zinc-900/30";
                  return (
                    <tr
                      key={entry.id}
                      className={`border-t border-zinc-800/50 transition-colors hover:bg-emerald-500/[0.04] ${zebra}`}
                    >
                      <td className="px-4 py-3 font-mono text-xs tabular-nums text-zinc-400">
                        {entry.closedDate || "—"}
                      </td>
                      <td className="px-4 py-3 font-mono font-bold tracking-wider text-white">
                        {entry.ticker}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-block rounded-full border px-2.5 py-0.5 text-[10px] font-medium ${typeBadgeClass(entry.type)}`}
                          >
                            {entry.type}
                          </span>
                          {entry.autoClosed && (
                            <span className="inline-flex items-center gap-1 rounded border border-amber-400/25 bg-amber-400/5 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-amber-300/90">
                              Expired
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono tabular-nums text-zinc-300">
                        {entry.quantity.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 font-mono tabular-nums text-zinc-400">
                        {entry.strikeOrBuy !== null
                          ? formatCurrency(entry.strikeOrBuy)
                          : "—"}
                      </td>
                      <td className="px-4 py-3 font-mono tabular-nums">
                        <span
                          className={`inline-flex items-center gap-1.5 font-bold ${
                            positive
                              ? "text-emerald-400"
                              : negative
                                ? "text-rose-400"
                                : "text-zinc-500"
                          }`}
                        >
                          {positive && <ArrowUpRight size={12} />}
                          {negative && <ArrowDownRight size={12} />}
                          {positive ? "+" : ""}
                          {formatCurrency(entry.result)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}

function FilterTabs({
  value,
  onChange,
}: {
  value: FilterMode;
  onChange: (v: FilterMode) => void;
}) {
  const tabs: { key: FilterMode; label: string; icon: React.ReactNode }[] = [
    { key: "all", label: "All", icon: <Layers size={12} /> },
    { key: "option", label: "Options", icon: <TrendingDown size={12} /> },
    { key: "stock", label: "Stocks", icon: <CircleDollarSign size={12} /> },
  ];
  return (
    <div className="inline-flex items-center gap-1 rounded-md border border-zinc-800/60 bg-zinc-950/60 p-1">
      {tabs.map((t) => {
        const active = value === t.key;
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] transition-all duration-200 ${
              active
                ? "bg-emerald-500/15 text-emerald-300 shadow-[0_0_18px_-6px_rgba(16,185,129,0.65)]"
                : "text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-200"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

function SummaryCard({
  icon,
  labelAr,
  labelEn,
  value,
  hint,
  tone,
}: {
  icon: React.ReactNode;
  labelAr: string;
  labelEn: string;
  value: string;
  hint?: string;
  tone: "emerald" | "rose" | "cyan";
}) {
  const accent =
    tone === "emerald"
      ? {
          text: "text-emerald-400",
          ring: "border-emerald-500/20 hover:border-emerald-500/40 hover:shadow-[0_0_28px_-8px_rgba(16,185,129,0.45)]",
          glow: "bg-emerald-500/10",
        }
      : tone === "rose"
        ? {
            text: "text-rose-400",
            ring: "border-rose-500/20 hover:border-rose-500/40 hover:shadow-[0_0_28px_-8px_rgba(239,68,68,0.45)]",
            glow: "bg-rose-500/10",
          }
        : {
            text: "text-cyan-300",
            ring: "border-cyan-400/20 hover:border-cyan-400/40 hover:shadow-[0_0_28px_-8px_rgba(34,211,238,0.45)]",
            glow: "bg-cyan-500/10",
          };
  return (
    <div
      className={`group relative overflow-hidden rounded-xl border bg-gradient-to-br from-zinc-900/60 via-zinc-950/80 to-black p-5 backdrop-blur-sm transition-all duration-300 ${accent.ring}`}
    >
      <div
        className={`pointer-events-none absolute -top-12 -right-8 h-32 w-32 rounded-full ${accent.glow} blur-2xl transition-opacity duration-300 group-hover:opacity-80`}
      />
      <div className="relative flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-[0.22em] text-zinc-500 font-semibold">
          {labelAr}
        </p>
        <span className={accent.text}>{icon}</span>
      </div>
      <p className="text-[9px] uppercase tracking-widest text-zinc-600 mt-0.5">
        {labelEn}
      </p>
      <p
        className={`mt-3 font-mono text-2xl font-semibold tabular-nums tracking-tight ${accent.text}`}
      >
        {value}
      </p>
      {hint && (
        <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
          {hint}
        </p>
      )}
    </div>
  );
}
