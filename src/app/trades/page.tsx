"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  Boxes,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  Coins,
  Crown,
  Download,
  Layers,
  PackageOpen,
  Pencil,
  Plus,
  RefreshCw,
  Terminal,
  TrendingDown,
  TrendingUp,
  Trash2,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { TableRowSkeleton } from "@/components/ui/skeleton";
import { EditTradeDialog } from "@/components/ui/edit-trade-dialog";
import type { TradeEditPayload } from "@/components/ui/edit-trade-dialog";
import { EditStockDialog } from "@/components/ui/edit-stock-dialog";
import type { StockEditPayload } from "@/components/ui/edit-stock-dialog";
import { SellStockDialog } from "@/components/ui/sell-stock-dialog";
import type { StockSellPayload } from "@/components/ui/sell-stock-dialog";
import { DividendDialog } from "@/components/ui/dividend-dialog";
import type { DividendPayload } from "@/components/ui/dividend-dialog";
import { AddTradeDialog } from "@/components/ui/add-trade-dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Toast } from "@/components/ui/toast";
import { ExpiryAlert } from "@/components/ui/expiry-alert";
import { AssignmentDialog } from "@/components/ui/assignment-dialog";
import {
  annualizedRoc,
  optionCollateral,
  optionDays,
  computeWheelSummary,
} from "@/lib/wheel-analytics";
import { formatCurrency } from "@/lib/utils";
import { tradeProfit, tradeMonthKey } from "@/lib/partner-profit";
import { useTrades } from "@/hooks/use-trades";
import { usePartners } from "@/hooks/use-partners";
import type { Trade, ActiveStock } from "@/types";
import { useCurrency } from "@/hooks/use-currency";

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

function formatExpiration(trade: Trade): string {
  if (!trade.expiration || trade.expiration.trim() === "") return "—";
  return trade.expiration;
}

function formatRelativeTime(d: Date | null): string {
  if (!d) return "never";
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 5) return "just now";
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleDateString();
}

export default function TradesPage() {
  // Re-render this page when the display currency changes: the money
  // formatters read module state, so a subscription here is what makes
  // every figure below (and in child components) re-denominate.
  useCurrency();

  const {
    trades,
    sellCalls,
    sellPuts,
    stockSells,
    closedOptions,
    activeStocks,
    loading,
    error,
    totalPremium,
    unrealizedStockPnL,
    todayPnL,
    realizedProfit,
    openCount,
    updateTrade,
    updateStock,
    addTrade,
    deleteTrade,
    recordAssignment,
    sellStock,
    recordDividend,
    toast,
    dismissToast,
    refreshPrices,
    lastPriceUpdate,
  } = useTrades();

  const { partners } = usePartners();

  // Active stocks whose live price reached the user's target sell
  // price. Feeds the banner above the table and the row highlight.
  const targetHits = useMemo(
    () =>
      activeStocks.filter(
        (s) =>
          typeof s.currentPrice === "number" &&
          Number.isFinite(s.currentPrice) &&
          s.targetSellPrice > 0 &&
          s.currentPrice >= s.targetSellPrice
      ),
    [activeStocks]
  );

  // Trading Pit ordering: biggest unrealized winner first, biggest loser
  // last — the same (currentPrice − purchasePrice) × qty the P&L column
  // shows, so the sort always matches what's on screen. Lots without a
  // live quote score 0 and land between the winners and the losers rather
  // than being ranked on a price we don't have.
  const sortedActiveStocks = useMemo(() => {
    const pnl = (s: ActiveStock) => {
      const px = s.currentPrice;
      if (typeof px !== "number" || !Number.isFinite(px) || px <= 0) return 0;
      return (px - s.purchasePrice) * s.quantity;
    };
    return [...activeStocks].sort((a, b) => pnl(b) - pnl(a));
  }, [activeStocks]);

  // Current-month profit. Bucketing always uses the trade entry date
  // (when premium was actually collected) — never expiration.
  const { monthProfit, monthLabel } = useMemo(() => {
    const now = new Date();
    const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    let sum = 0;
    for (const t of trades) {
      if (tradeMonthKey(t) === currentKey) sum += tradeProfit(t);
    }
    const label = now.toLocaleString("ar-EG", {
      month: "long",
      year: "numeric",
    });
    return { monthProfit: sum, monthLabel: label };
  }, [trades]);

  const [editingTrade, setEditingTrade] = useState<Trade | null>(null);
  const [editingStock, setEditingStock] = useState<ActiveStock | null>(null);
  const [sellingStock, setSellingStock] = useState<ActiveStock | null>(null);
  const [dividendStock, setDividendStock] = useState<ActiveStock | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [deletingTrade, setDeletingTrade] = useState<Trade | null>(null);
  const [assigningTrade, setAssigningTrade] = useState<Trade | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const pricesRefreshing = activeStocks.some((s) => s.priceLoading);

  // Wheel-strategy stats: annualized return on locked collateral,
  // win rate over closed options, collateral currently committed.
  const wheelSummary = useMemo(
    () => computeWheelSummary([...sellPuts, ...sellCalls], closedOptions),
    [sellPuts, sellCalls, closedOptions]
  );

  // Stock lots covered by an open Sell Call (linked via linked_stock_id).
  const coveredCallByStockId = useMemo(() => {
    const map: Record<string, Trade> = {};
    for (const t of sellCalls) {
      if (t.linkedStockId) map[t.linkedStockId] = t;
    }
    return map;
  }, [sellCalls]);

  // Group open option positions by ticker for the expanded row detail
  const optionsByTicker = useMemo(() => {
    const map: Record<string, Trade[]> = {};
    for (const t of [...sellPuts, ...sellCalls]) {
      const key = t.ticker.toUpperCase();
      if (!map[key]) map[key] = [];
      map[key].push(t);
    }
    return map;
  }, [sellPuts, sellCalls]);

  // Identify the GP (manager) for fee display
  const manager = useMemo(
    () => partners.find((p) => p.isAdmin || p.name?.trim() === "المدير") ?? null,
    [partners]
  );
  const totalCapital = useMemo(
    () => partners.reduce((sum, p) => sum + (Number(p.currentBalance) || 0), 0),
    [partners]
  );

  function toggleRow(id: string) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Keep the "Last Updated · X ago" label live by ticking once a second.
  const [, forceTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  async function handleDeleteTrade() {
    if (!deletingTrade) return;
    try {
      await deleteTrade(deletingTrade.id);
    } finally {
      setDeletingTrade(null);
    }
  }

  async function handleEditTrade(id: string, payload: TradeEditPayload) {
    await updateTrade(id, payload);
  }

  async function handleEditStock(id: string, payload: StockEditPayload) {
    await updateStock(id, payload);
  }

  async function handleSellStock(stock: ActiveStock, payload: StockSellPayload) {
    await sellStock(stock, payload);
  }

  async function handleRecordDividend(
    stock: ActiveStock,
    payload: DividendPayload
  ) {
    await recordDividend(stock, payload);
  }

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
              Active Positions{" "}
              <span className="font-mono text-zinc-500">·</span>{" "}
              <span className="text-zinc-400 font-light">سجل الصفقات</span>
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <button className="inline-flex items-center gap-2 rounded-md border border-zinc-800/60 bg-zinc-900/40 px-3.5 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-300 transition hover:border-zinc-700 hover:bg-zinc-900/80 hover:text-white">
              <Download size={12} />
              Export CSV
            </button>
            <button
              onClick={() => setAddDialogOpen(true)}
              className="group inline-flex items-center gap-2 rounded-md bg-emerald-500 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-950 shadow-[0_0_20px_-6px_rgba(16,185,129,0.7)] transition-all duration-200 hover:bg-emerald-400 hover:shadow-[0_0_28px_-4px_rgba(16,185,129,0.9)] active:scale-95"
            >
              <Plus size={12} className="transition-transform group-hover:rotate-90" />
              صفقة جديدة
            </button>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.9)]" />
          <p className="text-xs text-zinc-500">
            Real-time options + equities ledger
          </p>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mb-6 flex items-center gap-3 rounded-md border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-300 backdrop-blur-sm">
          <span className="font-mono">{error}</span>
        </div>
      )}

      {/* Options expiring within the week */}
      <ExpiryAlert openOptions={[...sellPuts, ...sellCalls]} />

      {/* Active stocks that reached their target sell price */}
      {targetHits.length > 0 && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200 backdrop-blur-sm">
          <TrendingUp size={18} className="mt-0.5 shrink-0 text-emerald-300" />
          <div className="flex-1">
            <p className="font-bold">
              {targetHits.length === 1
                ? "سهم بلغ سعره المستهدف"
                : `${targetHits.length} أسهم بلغت سعرها المستهدف`}
            </p>
            <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-emerald-200/80">
              {targetHits.map((s) => (
                <span key={s.id} className="font-mono tabular-nums">
                  {s.ticker} · ${s.currentPrice?.toFixed(2)} ≥ $
                  {s.targetSellPrice.toFixed(2)}
                </span>
              ))}
            </p>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <SummaryCard
          icon={<CalendarClock size={16} />}
          labelAr="ربح/خسارة اليوم"
          labelEn="Today's P&L"
          value={formatCurrency(todayPnL)}
          tone={todayPnL >= 0 ? "emerald" : "rose"}
        />
        <SummaryCard
          icon={<Boxes size={16} />}
          labelAr="ربح/خسارة الأسهم الحالية"
          labelEn="Open Stock P&L"
          value={formatCurrency(unrealizedStockPnL)}
          tone={unrealizedStockPnL >= 0 ? "emerald" : "rose"}
        />
        <SummaryCard
          icon={<CircleDollarSign size={16} />}
          labelAr="إجمالي العلاوات"
          labelEn="Total Premium"
          value={formatCurrency(totalPremium)}
          tone="emerald"
        />
        <SummaryCard
          icon={<TrendingUp size={16} />}
          labelAr={`ربح الشهر · ${monthLabel}`}
          labelEn="Monthly Profit"
          value={formatCurrency(monthProfit)}
          tone={monthProfit >= 0 ? "emerald" : "rose"}
        />
        <SummaryCard
          icon={<Activity size={16} />}
          labelAr="إجمالي الربح المحقق"
          labelEn="Realized Profit"
          value={formatCurrency(realizedProfit)}
          tone={realizedProfit >= 0 ? "emerald" : "rose"}
        />
        <SummaryCard
          icon={<Layers size={16} />}
          labelAr="الخيارات المفتوحة"
          labelEn="Open Options"
          value={String(openCount)}
          tone="cyan"
        />
      </div>

      {/* Wheel strategy stats */}
      {(wheelSummary.openCount > 0 || wheelSummary.closedCount > 0) && (
        <div className="mb-8 flex flex-wrap items-center gap-x-8 gap-y-3 rounded-xl border border-zinc-800/60 bg-gradient-to-br from-zinc-900/60 to-zinc-950/80 px-6 py-4 backdrop-blur-sm">
          <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-500">
            Wheel Stats · إحصائيات الاستراتيجية
          </span>
          <span className="text-xs text-zinc-400">
            <span className="opacity-70">متوسط ROC السنوي (مرجح بالضمان):</span>{" "}
            <span
              className={`font-mono font-bold tabular-nums ${
                wheelSummary.avgAnnualizedRoc === null
                  ? "text-zinc-600"
                  : wheelSummary.avgAnnualizedRoc >= 20
                    ? "text-emerald-400"
                    : "text-zinc-200"
              }`}
            >
              {wheelSummary.avgAnnualizedRoc === null
                ? "—"
                : `${wheelSummary.avgAnnualizedRoc.toFixed(1)}%`}
            </span>
          </span>
          <span className="text-xs text-zinc-400">
            <span className="opacity-70">win rate:</span>{" "}
            <span className="font-mono font-bold tabular-nums text-zinc-200">
              {wheelSummary.winRate === null
                ? "—"
                : `${wheelSummary.winRate.toFixed(0)}% (${wheelSummary.closedCount} صفقة)`}
            </span>
          </span>
          <span className="text-xs text-zinc-400">
            <span className="opacity-70">الضمان المحجوز حالياً:</span>{" "}
            <span className="font-mono font-bold tabular-nums text-cyan-300">
              {formatCurrency(wheelSummary.lockedCollateral)}
            </span>
          </span>
        </div>
      )}

      {/* Active Stocks - Trading Pit */}
      <section className="mb-8 overflow-hidden rounded-xl border border-zinc-800/60 bg-gradient-to-br from-zinc-900/60 via-zinc-950/80 to-black backdrop-blur-sm shadow-[0_0_40px_-12px_rgba(16,185,129,0.15)]">
        <div className="flex items-center justify-between border-b border-zinc-800/60 bg-zinc-950/60 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md border border-emerald-500/30 bg-emerald-500/10">
              <PackageOpen size={14} className="text-emerald-400" />
            </div>
            <div>
              <h2 className="font-headline text-sm font-bold text-white tracking-[0.18em] uppercase">
                Trading Pit
              </h2>
              <p className="text-[10px] uppercase tracking-widest text-zinc-500">
                Active Stocks · الأسهم النشطة
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.8)]" />
              {activeStocks.length} holdings
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-2 text-[10px] uppercase tracking-widest text-zinc-500 font-semibold">
              <span className="opacity-70">Last Updated</span>
              <span className="font-mono tabular-nums text-zinc-300">
                {formatRelativeTime(lastPriceUpdate)}
              </span>
            </div>
            <button
              type="button"
              onClick={() => void refreshPrices()}
              disabled={pricesRefreshing || activeStocks.length === 0}
              title="Refresh Prices"
              aria-label="Refresh Prices"
              className="group inline-flex items-center gap-2 rounded-md border border-zinc-800/60 bg-zinc-900/60 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-300 transition-all duration-200 hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-300 hover:shadow-[0_0_18px_-4px_rgba(16,185,129,0.5)] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-zinc-800/60 disabled:hover:bg-zinc-900/60"
            >
              <RefreshCw
                size={12}
                className={
                  pricesRefreshing
                    ? "animate-spin text-emerald-400"
                    : "transition-transform duration-500 group-hover:rotate-180"
                }
              />
              <span>{pricesRefreshing ? "Refreshing…" : "Refresh"}</span>
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-zinc-950/80 text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                <th className="px-4 py-3 text-start font-semibold">Ticker</th>
                <th className="px-4 py-3 text-start font-semibold">Qty</th>
                <th className="px-4 py-3 text-start font-semibold">Buy Price</th>
                <th className="px-4 py-3 text-start font-semibold">Current</th>
                <th className="px-4 py-3 text-start font-semibold">Unrealized P&amp;L</th>
                <th className="px-4 py-3 text-start font-semibold">Target</th>
                <th className="px-4 py-3 text-start font-semibold">
                  Potential Profit
                </th>
                <th className="px-4 py-3 text-start font-semibold">Cost Basis</th>
                <th className="px-4 py-3 text-start font-semibold">Date</th>
                <th className="px-4 py-3 w-12 text-start font-semibold" />
              </tr>
            </thead>
            <tbody>
              {loading && (
                <>
                  <TableRowSkeleton cols={10} />
                  <TableRowSkeleton cols={10} />
                </>
              )}

              {!loading && activeStocks.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-16 text-center">
                    <PackageOpen
                      size={36}
                      className="mx-auto mb-2 text-zinc-700"
                    />
                    <p className="text-xs text-zinc-500">
                      لا توجد مراكز نشطة في الأسهم
                    </p>
                  </td>
                </tr>
              )}

              {!loading &&
                sortedActiveStocks.map((stock, idx) => {
                  const hasLivePrice =
                    typeof stock.currentPrice === "number" &&
                    Number.isFinite(stock.currentPrice) &&
                    stock.currentPrice > 0;
                  const pnlAbs = hasLivePrice
                    ? (stock.currentPrice! - stock.purchasePrice) *
                      stock.quantity
                    : 0;
                  const pnlPct =
                    hasLivePrice && stock.purchasePrice > 0
                      ? ((stock.currentPrice! - stock.purchasePrice) /
                          stock.purchasePrice) *
                        100
                      : 0;
                  const pnlPositive = pnlAbs > 0;
                  const pnlNegative = pnlAbs < 0;
                  const pnlTone = pnlPositive
                    ? "text-emerald-400"
                    : pnlNegative
                      ? "text-rose-400"
                      : "text-zinc-500";
                  const hasTarget = stock.targetSellPrice > 0;
                  const potential = hasTarget
                    ? (stock.targetSellPrice - stock.purchasePrice) *
                      stock.quantity
                    : 0;
                  const potentialPositive = potential >= 0;
                  const hitTarget =
                    hasTarget &&
                    hasLivePrice &&
                    stock.currentPrice! >= stock.targetSellPrice;
                  const zebra = idx % 2 === 0 ? "bg-transparent" : "bg-zinc-900/30";
                  const isExpanded = expandedRows.has(stock.id);
                  const relatedOptions =
                    optionsByTicker[stock.ticker.toUpperCase()] ?? [];
                  return (
                    <React.Fragment key={stock.id}>
                      <tr
                        className={`border-t border-zinc-800/50 transition-colors hover:bg-emerald-500/[0.04] cursor-pointer ${zebra} ${
                          isExpanded ? "bg-zinc-900/40" : ""
                        } ${hitTarget ? "bg-emerald-500/[0.06]" : ""}`}
                        onClick={() => toggleRow(stock.id)}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="text-zinc-500 transition-transform duration-200">
                              {isExpanded ? (
                                <ChevronDown size={14} />
                              ) : (
                                <ChevronRight size={14} />
                              )}
                            </span>
                            <span className="font-mono font-bold tracking-wider text-white">
                              {stock.ticker}
                            </span>
                            {hitTarget && (
                              <span className="inline-flex items-center rounded-full border border-emerald-500/40 bg-emerald-500/15 px-1.5 py-[1px] text-[9px] font-bold uppercase tracking-widest text-emerald-300">
                                بلغ الهدف
                              </span>
                            )}
                            {coveredCallByStockId[stock.id] && (
                              <span
                                className="inline-flex items-center rounded-full border border-cyan-400/40 bg-cyan-500/10 px-1.5 py-[1px] text-[9px] font-bold uppercase tracking-widest text-cyan-300"
                                title={`مغطى بـ Sell Call @ $${coveredCallByStockId[stock.id].strike} حتى ${coveredCallByStockId[stock.id].expiration}`}
                              >
                                مغطى
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono tabular-nums text-zinc-300">
                          {stock.quantity.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 font-mono tabular-nums text-zinc-400">
                          {formatCurrency(stock.purchasePrice)}
                        </td>
                        <td className="px-4 py-3 font-mono tabular-nums">
                          {stock.priceLoading ? (
                            <span className="inline-flex items-center gap-2 text-zinc-500">
                              <span className="h-3 w-3 animate-spin rounded-full border-2 border-zinc-700 border-t-emerald-400" />
                              <span className="text-[10px] uppercase tracking-widest">
                                fetching
                              </span>
                            </span>
                          ) : hasLivePrice ? (
                            <span className="text-white font-semibold">
                              {formatCurrency(stock.currentPrice!)}
                            </span>
                          ) : (
                            <span className="text-zinc-600">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-mono tabular-nums">
                          {stock.priceLoading ? (
                            <span className="h-3 w-3 inline-block animate-spin rounded-full border-2 border-zinc-700 border-t-emerald-400" />
                          ) : hasLivePrice ? (
                            <div className="flex items-center gap-2">
                              {pnlPositive && (
                                <ArrowUpRight
                                  size={14}
                                  className="text-emerald-400"
                                />
                              )}
                              {pnlNegative && (
                                <ArrowDownRight
                                  size={14}
                                  className="text-rose-400"
                                />
                              )}
                              <div className="flex flex-col">
                                <span className={`font-bold ${pnlTone}`}>
                                  {pnlPositive ? "+" : ""}
                                  {formatCurrency(pnlAbs)}
                                </span>
                                <span
                                  className={`text-[10px] ${pnlTone} opacity-80`}
                                >
                                  {pnlPositive ? "+" : ""}
                                  {pnlPct.toFixed(2)}%
                                </span>
                              </div>
                            </div>
                          ) : (
                            <span className="text-zinc-600">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-mono tabular-nums">
                          {hasTarget ? (
                            <span className="text-cyan-300">
                              {formatCurrency(stock.targetSellPrice)}
                            </span>
                          ) : (
                            <span className="text-zinc-600">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-mono tabular-nums">
                          {hasTarget ? (
                            <span
                              className={`font-semibold ${
                                potentialPositive
                                  ? "text-cyan-300"
                                  : "text-rose-400"
                              }`}
                              title="(Target − Buy) × Qty"
                            >
                              {potentialPositive ? "+" : ""}
                              {formatCurrency(potential)}
                            </span>
                          ) : (
                            <span className="text-zinc-600">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-mono font-semibold tabular-nums text-white">
                          {formatCurrency(stock.costBasis)}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs tabular-nums text-zinc-500">
                          {stock.purchaseDate || "—"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSellingStock(stock);
                              }}
                              className="flex items-center gap-1 rounded-md border border-emerald-500/25 bg-emerald-500/5 px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-widest text-emerald-300 transition-all duration-200 hover:scale-[1.03] hover:border-emerald-500/50 hover:bg-emerald-500/10 hover:text-emerald-200"
                              title="بيع السهم وتسجيل الربح في شهر البيع"
                              aria-label={`Sell ${stock.ticker}`}
                            >
                              <Banknote size={11} />
                              بيع
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setDividendStock(stock);
                              }}
                              className="rounded-md border border-cyan-400/25 bg-cyan-500/5 p-1.5 text-cyan-300 transition-all duration-200 hover:scale-[1.05] hover:border-cyan-400/50 hover:bg-cyan-500/10 hover:text-cyan-200"
                              title="تسجيل توزيعات أرباح"
                              aria-label={`Dividend ${stock.ticker}`}
                            >
                              <Coins size={12} />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingStock(stock);
                              }}
                              className="rounded-md border border-zinc-800/60 p-1.5 text-zinc-500 transition-all duration-200 hover:scale-[1.05] hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-300"
                              title="تعديل المركز"
                              aria-label={`Edit ${stock.ticker}`}
                            >
                              <Pencil size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* ── Expanded Detail Panel ── */}
                      {isExpanded && (
                        <tr className="border-t border-zinc-800/30">
                          <td colSpan={10} className="p-0">
                            <div className="bg-zinc-950/80 border-b border-zinc-800/40 px-6 py-4 space-y-4 animate-in slide-in-from-top-2 duration-200">
                              {/* Related Options */}
                              {relatedOptions.length > 0 && (
                                <div>
                                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-2">
                                    Related Options · الخيارات المرتبطة
                                  </h4>
                                  <div className="flex flex-wrap gap-2">
                                    {relatedOptions.map((opt) => {
                                      const premium = tradeProfit(opt);
                                      return (
                                        <div
                                          key={opt.id}
                                          className="flex items-center gap-2 rounded-md border border-zinc-800/60 bg-black/40 px-3 py-2"
                                        >
                                          <span
                                            className={`inline-block rounded-full border px-2 py-0.5 text-[9px] font-bold ${typeBadgeClass(opt.type)}`}
                                          >
                                            {opt.type}
                                          </span>
                                          <span className="inline-flex items-center gap-1 rounded border border-rose-500/25 bg-rose-500/5 px-1.5 py-0.5 text-[9px] font-bold text-rose-300">
                                            Strike {formatCurrency(opt.strike)}
                                          </span>
                                          {opt.expiration && (
                                            <span className="inline-flex items-center gap-1 rounded border border-amber-400/25 bg-amber-400/5 px-1.5 py-0.5 text-[9px] font-bold text-amber-300">
                                              Exp {opt.expiration}
                                            </span>
                                          )}
                                          <span className="font-mono text-xs tabular-nums text-emerald-400 font-bold">
                                            +{formatCurrency(premium)}
                                          </span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

                              {/* Entry details */}
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                <DetailBadge
                                  label="Entry Price · سعر الشراء"
                                  value={formatCurrency(stock.purchasePrice)}
                                  tone="zinc"
                                />
                                <DetailBadge
                                  label="Cost Basis · إجمالي التكلفة"
                                  value={formatCurrency(stock.costBasis)}
                                  tone="zinc"
                                />
                                {hasLivePrice && (
                                  <DetailBadge
                                    label="Market Value · القيمة السوقية"
                                    value={formatCurrency(
                                      stock.currentPrice! * stock.quantity
                                    )}
                                    tone="emerald"
                                  />
                                )}
                                {relatedOptions.length > 0 && (
                                  <DetailBadge
                                    label="Options Income · عوائد الخيارات"
                                    value={`+${formatCurrency(
                                      relatedOptions.reduce(
                                        (s, o) => s + tradeProfit(o),
                                        0
                                      )
                                    )}`}
                                    tone="emerald"
                                  />
                                )}
                              </div>

                              {/* Partner Profit Allocation */}
                              {hasLivePrice &&
                                partners.length > 0 &&
                                pnlAbs !== 0 && (
                                  <div>
                                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-2">
                                      Partner Allocation · توزيع أرباح الشركاء
                                    </h4>
                                    <div className="rounded-md border border-zinc-800/60 bg-black/40 overflow-hidden">
                                      <table className="w-full text-xs">
                                        <thead>
                                          <tr className="text-[9px] uppercase tracking-widest text-zinc-600 bg-zinc-950/60">
                                            <th className="px-3 py-2 text-start font-semibold">
                                              Partner
                                            </th>
                                            <th className="px-3 py-2 text-start font-semibold">
                                              Share %
                                            </th>
                                            <th className="px-3 py-2 text-start font-semibold">
                                              Gross Share
                                            </th>
                                            <th className="px-3 py-2 text-start font-semibold">
                                              Fee (20%)
                                            </th>
                                            <th className="px-3 py-2 text-start font-semibold">
                                              Net Profit
                                            </th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-zinc-800/40">
                                          {partners.map((p) => {
                                            const ownership =
                                              totalCapital > 0
                                                ? (Number(
                                                    p.currentBalance
                                                  ) || 0) / totalCapital
                                                : 0;
                                            const grossShare =
                                              pnlAbs * ownership;
                                            const isGP =
                                              p.id === manager?.id;
                                            const feeRate =
                                              (Number(
                                                p.managementFeeRate
                                              ) || 0) / 100;
                                            const fee = isGP
                                              ? 0
                                              : grossShare > 0
                                                ? grossShare * feeRate
                                                : 0;
                                            const netShare = isGP
                                              ? grossShare
                                              : grossShare - fee;
                                            return (
                                              <tr
                                                key={p.id}
                                                className="hover:bg-white/[0.02]"
                                              >
                                                <td className="px-3 py-2 text-zinc-200 font-semibold">
                                                  <span className="inline-flex items-center gap-1.5">
                                                    {p.name}
                                                    {isGP && (
                                                      <Crown
                                                        size={10}
                                                        className="text-amber-300"
                                                      />
                                                    )}
                                                  </span>
                                                </td>
                                                <td className="px-3 py-2 font-mono tabular-nums text-zinc-400">
                                                  {(
                                                    ownership * 100
                                                  ).toFixed(1)}
                                                  %
                                                </td>
                                                <td
                                                  className={`px-3 py-2 font-mono tabular-nums font-bold ${
                                                    grossShare >= 0
                                                      ? "text-white"
                                                      : "text-rose-400"
                                                  }`}
                                                >
                                                  {grossShare >= 0
                                                    ? "+"
                                                    : ""}
                                                  {formatCurrency(
                                                    grossShare
                                                  )}
                                                </td>
                                                <td className="px-3 py-2 font-mono tabular-nums text-rose-400/80">
                                                  {isGP ? (
                                                    <span className="text-amber-300">
                                                      collects
                                                    </span>
                                                  ) : fee > 0 ? (
                                                    `-${formatCurrency(
                                                      fee
                                                    )}`
                                                  ) : (
                                                    "—"
                                                  )}
                                                </td>
                                                <td
                                                  className={`px-3 py-2 font-mono tabular-nums font-bold ${
                                                    netShare >= 0
                                                      ? "text-emerald-400"
                                                      : "text-rose-400"
                                                  }`}
                                                >
                                                  {netShare >= 0
                                                    ? "+"
                                                    : ""}
                                                  {formatCurrency(
                                                    netShare
                                                  )}
                                                </td>
                                              </tr>
                                            );
                                          })}
                                        </tbody>
                                        {/* GP total fee from this asset */}
                                        {manager && (
                                          <tfoot>
                                            <tr className="bg-amber-400/5 border-t border-amber-400/20">
                                              <td
                                                colSpan={3}
                                                className="px-3 py-2 text-[9px] uppercase tracking-widest text-amber-300/70 font-bold"
                                              >
                                                <span className="inline-flex items-center gap-1">
                                                  <Crown
                                                    size={10}
                                                    className="text-amber-300"
                                                  />
                                                  GP Fee from this asset ·
                                                  رسوم المدير
                                                </span>
                                              </td>
                                              <td
                                                colSpan={2}
                                                className="px-3 py-2 font-mono tabular-nums font-bold text-amber-300 text-right"
                                              >
                                                +
                                                {formatCurrency(
                                                  (() => {
                                                    let total = 0;
                                                    for (const p of partners) {
                                                      if (
                                                        p.id === manager.id
                                                      )
                                                        continue;
                                                      const ow =
                                                        totalCapital > 0
                                                          ? (Number(
                                                              p.currentBalance
                                                            ) || 0) /
                                                            totalCapital
                                                          : 0;
                                                      const gs =
                                                        pnlAbs * ow;
                                                      const fr =
                                                        (Number(
                                                          p.managementFeeRate
                                                        ) || 0) / 100;
                                                      if (gs > 0)
                                                        total +=
                                                          gs * fr;
                                                    }
                                                    return total;
                                                  })()
                                                )}
                                              </td>
                                            </tr>
                                          </tfoot>
                                        )}
                                      </table>
                                    </div>
                                  </div>
                                )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Trade History grouped by type */}
      <TradeSection
        title="Sell Put Positions"
        subtitle="بيع الخيارات: Puts"
        icon={<TrendingDown size={14} />}
        accent="rose"
        trades={sellPuts}
        loading={loading}
        valueColumn="premium"
        onEdit={setEditingTrade}
        onDelete={setDeletingTrade}
        onAssign={setAssigningTrade}
        showRoc
      />

      <TradeSection
        title="Sell Call Positions"
        subtitle="بيع الخيارات: Calls"
        icon={<TrendingUp size={14} />}
        accent="cyan"
        trades={sellCalls}
        loading={loading}
        valueColumn="premium"
        onEdit={setEditingTrade}
        onDelete={setDeletingTrade}
        showRoc
      />

      <TradeSection
        title="Expired Options · Auto-Closed"
        subtitle="الخيارات المنتهية"
        icon={<CheckCircle2 size={14} />}
        accent="emerald"
        trades={closedOptions}
        loading={loading}
        valueColumn="result"
        onDelete={setDeletingTrade}
        onAssign={setAssigningTrade}
        groupByMonth
      />

      <TradeSection
        title="Closed Stock Sells"
        subtitle="مبيعات الأسهم المغلقة"
        icon={<CircleDollarSign size={14} />}
        accent="emerald"
        trades={stockSells}
        loading={loading}
        valueColumn="result"
        onDelete={setDeletingTrade}
      />

      {/* Empty state for entire ledger */}
      {!loading && trades.length === 0 && !error && (
        <div className="rounded-xl border border-dashed border-zinc-800/60 bg-zinc-950/60 p-12 text-center backdrop-blur-sm">
          <Activity size={42} className="mx-auto mb-3 text-zinc-700" />
          <p className="text-sm text-zinc-300">لا توجد صفقات مسجّلة بعد</p>
          <p className="mt-1 text-[10px] text-zinc-500 uppercase tracking-widest">
            Add your first position to begin
          </p>
        </div>
      )}

      <AddTradeDialog
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        onSubmit={addTrade}
        activeStocks={activeStocks}
      />

      <AssignmentDialog
        open={assigningTrade !== null}
        trade={assigningTrade}
        onClose={() => setAssigningTrade(null)}
        onSubmit={recordAssignment}
      />

      <EditTradeDialog
        open={editingTrade !== null}
        trade={editingTrade}
        onClose={() => setEditingTrade(null)}
        onSubmit={handleEditTrade}
      />

      <EditStockDialog
        open={editingStock !== null}
        stock={editingStock}
        onClose={() => setEditingStock(null)}
        onSubmit={handleEditStock}
      />

      <SellStockDialog
        open={sellingStock !== null}
        stock={sellingStock}
        onClose={() => setSellingStock(null)}
        onSubmit={handleSellStock}
      />

      <DividendDialog
        open={dividendStock !== null}
        stock={dividendStock}
        onClose={() => setDividendStock(null)}
        onSubmit={handleRecordDividend}
      />

      <ConfirmDialog
        open={deletingTrade !== null}
        title="حذف الصفقة"
        description={`هل أنت متأكد من حذف صفقة ${deletingTrade?.ticker ?? ""} (${deletingTrade?.type ?? ""}) نهائياً؟ لا يمكن التراجع عن هذا الإجراء.`}
        confirmLabel="تأكيد الحذف"
        cancelLabel="إلغاء"
        onConfirm={handleDeleteTrade}
        onCancel={() => setDeletingTrade(null)}
      />

      <Toast message={toast} tone="success" onDismiss={dismissToast} />

      <button className="fixed bottom-8 left-8 z-50 flex h-12 w-12 items-center justify-center rounded-full border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 backdrop-blur-sm shadow-[0_0_24px_-4px_rgba(16,185,129,0.6)] transition hover:scale-105 hover:bg-emerald-500/20">
        <Terminal size={18} />
      </button>
    </AppShell>
  );
}

function SummaryCard({
  icon,
  labelAr,
  labelEn,
  value,
  tone,
}: {
  icon: React.ReactNode;
  labelAr: string;
  labelEn: string;
  value: string;
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
    </div>
  );
}

function TradeSection({
  title,
  subtitle,
  icon,
  accent,
  trades,
  loading,
  valueColumn,
  onEdit,
  onDelete,
  onAssign,
  groupByMonth = false,
  showRoc = false,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  accent: "emerald" | "rose" | "cyan";
  trades: Trade[];
  loading: boolean;
  valueColumn: "premium" | "result";
  onEdit?: (trade: Trade) => void;
  onDelete?: (trade: Trade) => void;
  // Record a put assignment — button rendered on Sell Put rows only.
  onAssign?: (trade: Trade) => void;
  // When true, rows are split into month buckets (newest first) with a
  // sub-header per month showing the count + the month's total PnL.
  groupByMonth?: boolean;
  // Adds the annualized return-on-collateral column (open options).
  showRoc?: boolean;
}) {
  const isResult = valueColumn === "result";
  const valueLabelEn = isResult ? "Result" : "Premium";
  const hasActions = Boolean(onEdit || onDelete || onAssign);
  const colCount = (hasActions ? 9 : 8) + (showRoc ? 1 : 0);

  // Bucket trades by entry-month (tradeMonthKey) when grouping is on.
  // Returns [{ key, labelAr, labelEn, total, trades }] sorted newest
  // first. A null/unknown month key lands in an "غير مؤرخ" bucket so
  // nothing silently disappears.
  const monthGroups = useMemo(() => {
    if (!groupByMonth) return null;
    const buckets: Record<string, Trade[]> = {};
    for (const t of trades) {
      const key = tradeMonthKey(t) ?? "unknown";
      (buckets[key] ??= []).push(t);
    }
    return Object.keys(buckets)
      .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0)) // newest first; "unknown" sorts last
      .map((key) => {
        const rows = buckets[key];
        const total = rows.reduce((s, t) => s + tradeProfit(t), 0);
        let labelAr = "غير مؤرخ";
        let labelEn = "Undated";
        if (key !== "unknown") {
          const [y, m] = key.split("-");
          const d = new Date(Number(y), Number(m) - 1);
          labelAr = d.toLocaleString("ar-SA", {
            month: "long",
            year: "numeric",
          });
          labelEn = d.toLocaleString("en-US", {
            month: "short",
            year: "numeric",
          });
        }
        return { key, labelAr, labelEn, total, trades: rows };
      });
  }, [groupByMonth, trades]);

  const accentRing =
    accent === "emerald"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
      : accent === "rose"
        ? "border-rose-500/30 bg-rose-500/10 text-rose-300"
        : "border-cyan-400/30 bg-cyan-500/10 text-cyan-300";

  // Single source for a trade row so flat + grouped layouts stay
  // identical. `idx` only drives the zebra stripe.
  const renderRow = (trade: Trade, idx: number) => {
    const valueRaw = isResult ? trade.result : trade.premium;
    const valueClass = isResult
      ? valueRaw >= 0
        ? "text-emerald-400"
        : "text-rose-400"
      : "text-emerald-400";
    const pnl = tradeProfit(trade);
    const pnlPositive = pnl >= 0;
    const zebra = idx % 2 === 0 ? "bg-transparent" : "bg-zinc-900/30";
    return (
      <tr
        key={trade.id}
        className={`border-t border-zinc-800/50 transition-colors hover:bg-emerald-500/[0.04] ${zebra}`}
      >
        <td className="px-4 py-3 font-mono font-bold tracking-wider text-white">
          {trade.ticker}
        </td>
        <td className="px-4 py-3">
          <span
            className={`inline-block rounded-full border px-2.5 py-0.5 text-[10px] font-medium ${typeBadgeClass(trade.type)}`}
          >
            {trade.type}
          </span>
        </td>
        <td className="px-4 py-3 font-mono tabular-nums text-zinc-300">
          {trade.quantity}
        </td>
        <td className="px-4 py-3 font-mono tabular-nums text-zinc-400">
          {trade.strike > 0 ? formatCurrency(trade.strike) : "—"}
        </td>
        <td className={`px-4 py-3 font-mono tabular-nums ${valueClass}`}>
          {isResult && valueRaw >= 0 ? "+" : ""}
          {formatCurrency(valueRaw)}
        </td>
        <td
          className={`px-4 py-3 font-mono font-bold tabular-nums ${
            pnlPositive ? "text-emerald-400" : "text-rose-400"
          }`}
          title="Premium × Quantity"
        >
          <span className="inline-flex items-center gap-1.5">
            {pnlPositive ? (
              <ArrowUpRight size={12} />
            ) : (
              <ArrowDownRight size={12} />
            )}
            {pnlPositive ? "+" : ""}
            {formatCurrency(pnl)}
          </span>
        </td>
        {showRoc &&
          (() => {
            const roc = annualizedRoc(trade);
            const rocClass =
              roc === null
                ? "text-zinc-600"
                : roc >= 20
                  ? "text-emerald-400"
                  : roc >= 10
                    ? "text-zinc-200"
                    : "text-zinc-500";
            return (
              <td
                className={`px-4 py-3 font-mono tabular-nums font-bold ${rocClass}`}
                title={
                  roc === null
                    ? "لا يمكن الحساب (strike أو كمية مفقودة)"
                    : `ضمان ${formatCurrency(optionCollateral(trade))} × ${optionDays(trade)} يوم`
                }
              >
                {roc === null ? "—" : `${roc.toFixed(1)}%`}
              </td>
            );
          })()}
        <td className="px-4 py-3 font-mono text-xs tabular-nums text-zinc-400">
          {formatExpiration(trade)}
        </td>
        <td className="px-4 py-3 font-mono text-xs tabular-nums text-zinc-500">
          {trade.date}
        </td>
        {hasActions && (
          <td className="px-4 py-3">
            <div className="flex items-center gap-1">
              {onAssign && trade.type === "Sell Put" && (
                <button
                  onClick={() => onAssign(trade)}
                  className="rounded-md border border-amber-400/25 bg-amber-400/5 px-2 py-1 text-[9px] font-bold uppercase tracking-widest text-amber-300 transition-all duration-200 hover:scale-[1.03] hover:border-amber-400/50 hover:bg-amber-400/10"
                  title="تسجيل Assignment — تحويل العقد لمركز سهم"
                >
                  Assign
                </button>
              )}
              {onEdit && (
                <button
                  onClick={() => onEdit(trade)}
                  className="rounded-md border border-zinc-800/60 p-1.5 text-zinc-500 transition-all duration-200 hover:scale-[1.05] hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-300"
                  title="تعديل الصفقة"
                >
                  <Pencil size={12} />
                </button>
              )}
              {onDelete && (
                <button
                  onClick={() => onDelete(trade)}
                  className="rounded-md border border-zinc-800/60 p-1.5 text-zinc-500 transition-all duration-200 hover:scale-[1.05] hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-300"
                  title="حذف الصفقة"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          </td>
        )}
      </tr>
    );
  };

  return (
    <section className="mb-8 overflow-hidden rounded-xl border border-zinc-800/60 bg-gradient-to-br from-zinc-900/60 to-zinc-950/80 backdrop-blur-sm">
      <div className="flex items-center justify-between border-b border-zinc-800/60 bg-zinc-950/60 px-6 py-4">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-md border ${accentRing}`}
          >
            {icon}
          </div>
          <div>
            <h2 className="font-headline text-sm font-bold text-white tracking-[0.18em] uppercase">
              {title}
            </h2>
            <p className="text-[10px] uppercase tracking-widest text-zinc-500">
              {subtitle}
            </p>
          </div>
          <span className="rounded-full border border-zinc-700/60 bg-zinc-900/60 px-2 py-0.5 text-[10px] font-bold tabular-nums text-zinc-400">
            {trades.length}
          </span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-zinc-950/80 text-[10px] uppercase tracking-[0.2em] text-zinc-500">
              <th className="px-4 py-3 text-start font-semibold">Ticker</th>
              <th className="px-4 py-3 text-start font-semibold">Type</th>
              <th className="px-4 py-3 text-start font-semibold">Qty</th>
              <th className="px-4 py-3 text-start font-semibold">Strike</th>
              <th className="px-4 py-3 text-start font-semibold">
                {valueLabelEn}
              </th>
              <th className="px-4 py-3 text-start font-semibold">Total PnL</th>
              {showRoc && (
                <th
                  className="px-4 py-3 text-start font-semibold"
                  title="العائد السنوي على الضمان المحجوز · (premium ÷ collateral) × (365 ÷ days)"
                >
                  ROC سنوي
                </th>
              )}
              <th className="px-4 py-3 text-start font-semibold">Expiration</th>
              <th className="px-4 py-3 text-start font-semibold">Date</th>
              {hasActions && <th className="px-4 py-3 w-20 text-start" />}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <>
                <TableRowSkeleton cols={colCount} />
                <TableRowSkeleton cols={colCount} />
              </>
            )}

            {!loading && trades.length === 0 && (
              <tr>
                <td
                  colSpan={colCount}
                  className="px-4 py-10 text-center text-xs text-zinc-500"
                >
                  لا توجد صفقات من هذا النوع
                </td>
              </tr>
            )}

            {/* Flat layout */}
            {!loading &&
              !monthGroups &&
              trades.map((trade, idx) => renderRow(trade, idx))}

            {/* Month-grouped layout — sub-header per month, then its rows */}
            {!loading &&
              monthGroups &&
              monthGroups.map((group) => {
                const groupPositive = group.total >= 0;
                return (
                  <React.Fragment key={group.key}>
                    <tr className="border-t border-zinc-800/60 bg-zinc-900/50">
                      <td
                        colSpan={colCount}
                        className="px-4 py-2.5"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <span className="text-xs font-headline font-bold uppercase tracking-[0.18em] text-zinc-300">
                              {group.labelAr}
                            </span>
                            <span className="text-[9px] uppercase tracking-widest text-zinc-600 font-mono">
                              {group.labelEn}
                            </span>
                            <span className="rounded-full border border-zinc-700/60 bg-zinc-900/60 px-2 py-0.5 text-[10px] font-bold tabular-nums text-zinc-400">
                              {group.trades.length}
                            </span>
                          </div>
                          <span
                            className={`font-mono text-xs font-bold tabular-nums ${
                              groupPositive ? "text-emerald-400" : "text-rose-400"
                            }`}
                            title="إجمالي ربح الشهر · Month total PnL"
                          >
                            {groupPositive ? "+" : ""}
                            {formatCurrency(group.total)}
                          </span>
                        </div>
                      </td>
                    </tr>
                    {group.trades.map((trade, idx) => renderRow(trade, idx))}
                  </React.Fragment>
                );
              })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DetailBadge({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "emerald" | "rose" | "zinc";
}) {
  const border =
    tone === "emerald"
      ? "border-emerald-500/25"
      : tone === "rose"
        ? "border-rose-500/25"
        : "border-zinc-800/60";
  const valColor =
    tone === "emerald"
      ? "text-emerald-300"
      : tone === "rose"
        ? "text-rose-400"
        : "text-white";
  return (
    <div
      className={`rounded-md border ${border} bg-black/40 px-3 py-2`}
    >
      <p className="text-[9px] uppercase tracking-widest text-zinc-600 font-semibold">
        {label}
      </p>
      <p className={`mt-0.5 font-mono text-sm font-bold tabular-nums ${valColor}`}>
        {value}
      </p>
    </div>
  );
}
