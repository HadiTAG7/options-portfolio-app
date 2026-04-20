"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  CircleDollarSign,
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
import { AddTradeDialog } from "@/components/ui/add-trade-dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Toast } from "@/components/ui/toast";
import { formatCurrency } from "@/lib/utils";
import { tradeProfit } from "@/lib/partner-profit";
import { useTrades } from "@/hooks/use-trades";
import type { Trade } from "@/types";

function typeBadgeClass(type: string): string {
  switch (type) {
    case "Sell Put":
      return "border-rose-500/30 text-rose-300 bg-rose-500/5";
    case "Sell Call":
      return "border-cyan-400/30 text-cyan-300 bg-cyan-500/5";
    case "Stock Sell":
      return "border-emerald-500/30 text-emerald-300 bg-emerald-500/5";
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
    totalResult,
    totalProfit,
    openCount,
    updateTrade,
    addTrade,
    deleteTrade,
    toast,
    dismissToast,
    refreshPrices,
    lastPriceUpdate,
  } = useTrades();

  const [editingTrade, setEditingTrade] = useState<Trade | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [deletingTrade, setDeletingTrade] = useState<Trade | null>(null);
  const pricesRefreshing = activeStocks.some((s) => s.priceLoading);

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

      {/* Summary Cards */}
      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-4">
        <SummaryCard
          icon={<CircleDollarSign size={16} />}
          labelAr="إجمالي العلاوات"
          labelEn="Total Premium"
          value={formatCurrency(totalPremium)}
          tone="emerald"
        />
        <SummaryCard
          icon={<TrendingUp size={16} />}
          labelAr="النتائج المحققة"
          labelEn="Realized Result"
          value={formatCurrency(totalResult)}
          tone={totalResult >= 0 ? "emerald" : "rose"}
        />
        <SummaryCard
          icon={<Activity size={16} />}
          labelAr="إجمالي الربح"
          labelEn="Total Profit"
          value={formatCurrency(totalProfit)}
          tone={totalProfit >= 0 ? "emerald" : "rose"}
        />
        <SummaryCard
          icon={<Layers size={16} />}
          labelAr="الخيارات المفتوحة"
          labelEn="Open Options"
          value={String(openCount)}
          tone="cyan"
        />
      </div>

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
                <th className="px-4 py-3 text-start font-semibold">Cost Basis</th>
                <th className="px-4 py-3 text-start font-semibold">Date</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <>
                  <TableRowSkeleton cols={8} />
                  <TableRowSkeleton cols={8} />
                </>
              )}

              {!loading && activeStocks.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-16 text-center">
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
                activeStocks.map((stock, idx) => {
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
                  const zebra = idx % 2 === 0 ? "bg-transparent" : "bg-zinc-900/30";
                  return (
                    <tr
                      key={stock.id}
                      className={`border-t border-zinc-800/50 transition-colors hover:bg-emerald-500/[0.04] ${zebra}`}
                    >
                      <td className="px-4 py-3 font-mono font-bold tracking-wider text-white">
                        {stock.ticker}
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
                        {stock.targetSellPrice > 0 ? (
                          <span className="text-cyan-300">
                            {formatCurrency(stock.targetSellPrice)}
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
                    </tr>
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
      />

      <EditTradeDialog
        open={editingTrade !== null}
        trade={editingTrade}
        onClose={() => setEditingTrade(null)}
        onSubmit={handleEditTrade}
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
}) {
  const isResult = valueColumn === "result";
  const valueLabelEn = isResult ? "Result" : "Premium";
  const hasActions = Boolean(onEdit || onDelete);
  const colCount = hasActions ? 9 : 8;

  const accentRing =
    accent === "emerald"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
      : accent === "rose"
        ? "border-rose-500/30 bg-rose-500/10 text-rose-300"
        : "border-cyan-400/30 bg-cyan-500/10 text-cyan-300";

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

            {!loading &&
              trades.map((trade, idx) => {
                const valueRaw = isResult ? trade.result : trade.premium;
                const valueClass = isResult
                  ? valueRaw >= 0
                    ? "text-emerald-400"
                    : "text-rose-400"
                  : "text-emerald-400";
                const pnl = tradeProfit(trade);
                const pnlPositive = pnl >= 0;
                const zebra =
                  idx % 2 === 0 ? "bg-transparent" : "bg-zinc-900/30";
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
                    <td className="px-4 py-3 font-mono text-xs tabular-nums text-zinc-400">
                      {formatExpiration(trade)}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs tabular-nums text-zinc-500">
                      {trade.date}
                    </td>
                    {hasActions && (
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
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
              })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
