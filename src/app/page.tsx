"use client";

import React, { useMemo, useState } from "react";
import {
  Wallet,
  TrendingUp,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  Target,
  ChevronDown,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { CardSkeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/ui/icon";
import {
  formatWholeNumber,
  formatCompactCurrency,
  formatCurrency,
} from "@/lib/utils";
import {
  computeFundBreakdown,
  computeGpFeeTotal,
  computePortfolioDistribution,
  tradeProfit,
  MANAGEMENT_FEE_RATE,
} from "@/lib/partner-profit";
import { usePartners } from "@/hooks/use-partners";
import { useTrades } from "@/hooks/use-trades";
import type { Partner } from "@/types";

export default function DashboardPage() {
  const { partners, totalAssets, loading: partnersLoading } = usePartners();
  const {
    trades,
    activeStocks,
    sellPuts,
    sellCalls,
    totalProfit,
    openCount,
    potentialTargetProfit,
    projectedPortfolioValue,
    loading: tradesLoading,
  } = useTrades();

  const loading = partnersLoading || tradesLoading;
  const fundBreakdown = computeFundBreakdown(partners, totalAssets);
  const gpFeeTotal = computeGpFeeTotal(partners, totalProfit);
  const netProfitAfterFee = totalProfit - gpFeeTotal;
  const profitPositive = totalProfit >= 0;
  const yieldPct =
    fundBreakdown.originalCapital > 0
      ? (totalProfit / fundBreakdown.originalCapital) * 100
      : 0;
  const potentialPositive = potentialTargetProfit >= 0;
  const potentialReturnPct =
    fundBreakdown.originalCapital > 0
      ? (potentialTargetProfit / fundBreakdown.originalCapital) * 100
      : 0;

  // ── Selected month state (drives distribution + donut center) ──
  const [selectedMonth, setSelectedMonth] = useState<string>("all");

  // ── Monthly profit buckets (shared by chart, ledger, distribution) ──
  const monthlyProfitBuckets = useMemo(() => {
    const buckets: Record<string, number> = {};
    for (const t of trades) {
      const isOption = t.type === "Sell Put" || t.type === "Sell Call";
      const isStockSell = t.type === "Stock Sell";
      if (!isOption && !isStockSell) continue;
      const pnl = tradeProfit(t);
      const rawDate =
        isOption && t.status === "closed" && t.expiration?.trim()
          ? t.expiration
          : t.date;
      if (!rawDate) continue;
      const d = new Date(rawDate);
      if (Number.isNaN(d.getTime())) continue;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      buckets[key] = (buckets[key] ?? 0) + pnl;
    }
    return buckets;
  }, [trades]);

  // ── Cumulative P&L chart data ──
  const cumulativeData = useMemo(() => {
    const months = Object.keys(monthlyProfitBuckets).sort();
    if (months.length === 0) return [];
    let cumulative = 0;
    return months.map((key) => {
      cumulative += monthlyProfitBuckets[key];
      const [y, m] = key.split("-");
      const monthLabel = new Date(Number(y), Number(m) - 1).toLocaleString(
        "en-US",
        { month: "short", year: "2-digit" }
      );
      return { key, label: monthLabel, value: cumulative, monthly: monthlyProfitBuckets[key] };
    });
  }, [monthlyProfitBuckets]);

  // ── Monthly ledger for summary table (newest first) ──
  const monthlyLedger = useMemo(() => {
    const now = new Date();
    const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const capital = partners.reduce(
      (s, p) => s + (Number(p.currentBalance) || 0),
      0
    );
    return Object.keys(monthlyProfitBuckets)
      .sort()
      .reverse()
      .map((key) => {
        const profit = monthlyProfitBuckets[key];
        const [y, m] = key.split("-");
        const date = new Date(Number(y), Number(m) - 1);
        const labelAr = date.toLocaleString("ar-SA", {
          month: "long",
          year: "numeric",
        });
        const quarter = `Q${Math.ceil(Number(m) / 3)} ${y}`;
        const gpFees = computeGpFeeTotal(partners, profit);
        return {
          key,
          labelAr,
          quarter,
          grossProfit: profit,
          gpFees,
          totalCapital: capital,
          status: (key === currentKey ? "Active" : "Settled") as "Active" | "Settled",
        };
      });
  }, [monthlyProfitBuckets, partners]);

  // ── Profit for selected month (or all-time) ──
  const selectedMonthProfit = useMemo(() => {
    if (selectedMonth === "all") return totalProfit;
    return monthlyProfitBuckets[selectedMonth] ?? 0;
  }, [selectedMonth, totalProfit, monthlyProfitBuckets]);

  // ── Equity at end of selected month (for donut center override) ──
  const selectedMonthEquity = useMemo(() => {
    if (selectedMonth === "all") return null;
    const entry = cumulativeData.find((d) => d.key === selectedMonth);
    return entry?.value ?? null;
  }, [selectedMonth, cumulativeData]);

  // ── Portfolio allocation by ticker ──
  const allocationData = useMemo(() => {
    const buckets: Record<string, number> = {};

    // Active stocks: use live price if available, fall back to cost basis
    for (const s of activeStocks) {
      const price =
        typeof s.currentPrice === "number" && Number.isFinite(s.currentPrice) && s.currentPrice > 0
          ? s.currentPrice
          : s.purchasePrice;
      const val = price * s.quantity;
      const key = s.ticker.toUpperCase();
      buckets[key] = (buckets[key] ?? 0) + val;
    }

    // Open option contracts: collateral value (strike × qty)
    for (const t of [...sellPuts, ...sellCalls]) {
      const val = Number(t.strike) * Number(t.quantity);
      if (val <= 0) continue;
      const key = t.ticker.toUpperCase();
      buckets[key] = (buckets[key] ?? 0) + val;
    }

    const entries = Object.entries(buckets)
      .map(([ticker, value]) => ({ ticker, value }))
      .sort((a, b) => b.value - a.value);

    const total = entries.reduce((s, e) => s + e.value, 0);
    if (total === 0) return { slices: [] as AllocSlice[], total: 0 };

    // Top 5 tickers + "Others" bucket
    const MAX_SLICES = 5;
    const top = entries.slice(0, MAX_SLICES);
    const rest = entries.slice(MAX_SLICES);
    const othersValue = rest.reduce((s, e) => s + e.value, 0);

    const slices: AllocSlice[] = top.map((e, i) => ({
      ticker: e.ticker,
      value: e.value,
      pct: (e.value / total) * 100,
      color: ALLOC_COLORS[i % ALLOC_COLORS.length],
    }));

    if (othersValue > 0) {
      slices.push({
        ticker: "Others",
        value: othersValue,
        pct: (othersValue / total) * 100,
        color: ALLOC_COLORS[MAX_SLICES % ALLOC_COLORS.length],
      });
    }

    return { slices, total };
  }, [activeStocks, sellPuts, sellCalls]);

  return (
    <AppShell>
      {/* ═══════ Hero Cards ═══════ */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5 mb-8">
        {loading ? (
          <>
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </>
        ) : (
          <>
            {/* ── Total AUM ── */}
            <div className="group relative overflow-hidden rounded-2xl border border-zinc-800/60 bg-[#09090b] p-6 backdrop-blur-sm transition-all duration-300 hover:border-emerald-500/30 hover:shadow-[0_0_60px_-12px_rgba(52,211,153,0.25)]">
              <div className="pointer-events-none absolute -top-20 -right-20 h-52 w-52 rounded-full bg-emerald-500/[0.07] blur-3xl transition-all duration-500 group-hover:bg-emerald-500/[0.14]" />
              <div className="pointer-events-none absolute bottom-4 left-4 text-zinc-800/30">
                <Wallet size={72} strokeWidth={1} />
              </div>
              <div className="relative flex flex-col gap-4">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                    <Wallet size={18} className="text-emerald-400" />
                  </div>
                  <span className="text-[10px] uppercase tracking-[0.25em] text-zinc-500 font-semibold">
                    إجمالي الأصول المُدارة · AUM
                  </span>
                </div>
                <div className="flex items-baseline gap-3">
                  <span className="text-4xl font-headline font-light tracking-tight text-white font-mono tabular-nums">
                    {formatWholeNumber(totalAssets)}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-[10px]">
                  <span className="text-zinc-500">
                    <span className="opacity-70">رأس المال:</span>{" "}
                    <span className="text-zinc-300 font-mono tabular-nums">
                      {formatCompactCurrency(fundBreakdown.originalCapital)}
                    </span>
                  </span>
                  <span className="text-zinc-600">|</span>
                  <span className="text-zinc-500">
                    <span className="opacity-70">شركاء:</span>{" "}
                    <span className="text-white font-mono tabular-nums font-bold">
                      {partners.length}
                    </span>
                  </span>
                </div>
              </div>
            </div>

            {/* ── Total Yield ── */}
            <div className="group relative overflow-hidden rounded-2xl border border-zinc-800/60 bg-[#09090b] p-6 backdrop-blur-sm transition-all duration-300 hover:border-emerald-500/30 hover:shadow-[0_0_60px_-12px_rgba(52,211,153,0.25)]">
              <div className="pointer-events-none absolute -top-20 -right-20 h-52 w-52 rounded-full bg-emerald-500/[0.07] blur-3xl transition-all duration-500 group-hover:bg-emerald-500/[0.14]" />
              <div className="pointer-events-none absolute bottom-4 left-4 text-zinc-800/30">
                <TrendingUp size={72} strokeWidth={1} />
              </div>
              <div className="relative flex flex-col gap-4">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                    <TrendingUp size={18} className="text-emerald-400" />
                  </div>
                  <span className="text-[10px] uppercase tracking-[0.25em] text-zinc-500 font-semibold">
                    إجمالي العائد · Total Yield
                  </span>
                </div>
                <div className="flex items-baseline gap-3">
                  <span
                    className={`text-4xl font-headline font-bold tracking-tight font-mono tabular-nums ${
                      profitPositive ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {profitPositive ? "+" : ""}
                    {formatWholeNumber(totalProfit)}
                  </span>
                  <span
                    className={`flex items-center gap-0.5 text-xs font-bold ${
                      profitPositive ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {profitPositive ? (
                      <ArrowUpRight size={14} />
                    ) : (
                      <ArrowDownRight size={14} />
                    )}
                    {Math.abs(yieldPct).toFixed(1)}%
                  </span>
                </div>
                <div className="flex items-center gap-4 text-[10px]">
                  <span className="text-zinc-500">
                    <span className="opacity-70">صافي بعد الرسوم:</span>{" "}
                    <span className="text-zinc-300 font-mono tabular-nums font-bold">
                      {formatCompactCurrency(netProfitAfterFee)}
                    </span>
                  </span>
                  <span className="text-zinc-600">|</span>
                  <span className="text-zinc-500 font-mono tabular-nums">
                    {(MANAGEMENT_FEE_RATE * 100).toFixed(0)}% fee
                  </span>
                </div>
              </div>
            </div>

            {/* ── Projected Portfolio Value ── */}
            <div className="group relative overflow-hidden rounded-2xl border border-zinc-800/60 bg-[#09090b] p-6 backdrop-blur-sm transition-all duration-300 hover:border-cyan-400/40 hover:shadow-[0_0_60px_-12px_rgba(34,211,238,0.28)]">
              <div className="pointer-events-none absolute -top-20 -right-20 h-52 w-52 rounded-full bg-cyan-500/[0.07] blur-3xl transition-all duration-500 group-hover:bg-cyan-500/[0.14]" />
              <div className="pointer-events-none absolute bottom-4 left-4 text-zinc-800/30">
                <Target size={72} strokeWidth={1} />
              </div>
              <div className="relative flex flex-col gap-4">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-500/10 border border-cyan-400/20">
                    <Target size={18} className="text-cyan-300" />
                  </div>
                  <span className="text-[10px] uppercase tracking-[0.25em] text-zinc-500 font-semibold">
                    القيمة المستهدفة · Projected Value
                  </span>
                </div>
                <div className="flex items-baseline gap-3">
                  <span className="text-4xl font-headline font-light tracking-tight text-cyan-200 font-mono tabular-nums">
                    {formatWholeNumber(projectedPortfolioValue)}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-[10px]">
                  <span className="text-zinc-500">
                    <span className="opacity-70">الربح المحتمل:</span>{" "}
                    <span
                      className={`font-mono tabular-nums font-bold ${
                        potentialPositive ? "text-cyan-300" : "text-rose-400"
                      }`}
                    >
                      {potentialPositive ? "+" : ""}
                      {formatCompactCurrency(potentialTargetProfit)}
                    </span>
                  </span>
                  <span className="text-zinc-600">|</span>
                  <span
                    className={`font-mono tabular-nums font-bold ${
                      potentialPositive ? "text-cyan-300" : "text-rose-400"
                    }`}
                  >
                    {potentialPositive ? "+" : ""}
                    {potentialReturnPct.toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>

            {/* ── Active Positions ── */}
            <div className="group relative overflow-hidden rounded-2xl border border-zinc-800/60 bg-[#09090b] p-6 backdrop-blur-sm transition-all duration-300 hover:border-cyan-500/30 hover:shadow-[0_0_60px_-12px_rgba(34,211,238,0.2)]">
              <div className="pointer-events-none absolute -top-20 -right-20 h-52 w-52 rounded-full bg-cyan-500/[0.06] blur-3xl transition-all duration-500 group-hover:bg-cyan-500/[0.12]" />
              <div className="pointer-events-none absolute bottom-4 left-4 text-zinc-800/30">
                <Activity size={72} strokeWidth={1} />
              </div>
              <div className="relative flex flex-col gap-4">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-500/10 border border-cyan-500/20">
                    <Activity size={18} className="text-cyan-400" />
                  </div>
                  <span className="text-[10px] uppercase tracking-[0.25em] text-zinc-500 font-semibold">
                    المراكز النشطة · Active Positions
                  </span>
                </div>
                <div className="flex items-baseline gap-3">
                  <span className="text-5xl font-headline font-black tracking-tight text-white tabular-nums">
                    {openCount}
                  </span>
                  <span className="text-sm text-zinc-400">عقد مفتوح</span>
                </div>
                <div className="flex items-center gap-2 text-[10px]">
                  <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)] animate-pulse" />
                  <span className="text-emerald-400/80 uppercase tracking-widest font-bold">
                    Live Trading
                  </span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ═══════ Chart Section ═══════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-8">
        {/* Profit Growth Chart */}
        <CumulativePnLChart data={cumulativeData} loading={loading} />

        {/* Portfolio Composition */}
        <PortfolioComposition
          slices={allocationData.slices}
          total={allocationData.total}
          loading={loading}
          equityOverride={selectedMonthEquity}
        />
      </div>

      {/* ═══════ Monthly Ledger ═══════ */}
      <MonthlySummaryTable
        ledger={monthlyLedger}
        selectedMonth={selectedMonth}
        onSelectMonth={setSelectedMonth}
        loading={loading}
      />

      {/* ═══════ Partner Profit Distribution ═══════ */}
      <ProfitDistribution
        partners={partners}
        totalProfit={selectedMonthProfit}
        loading={loading}
        selectedMonth={selectedMonth}
        onMonthChange={setSelectedMonth}
        monthOptions={monthlyLedger.map((m) => ({ key: m.key, label: m.labelAr }))}
      />
    </AppShell>
  );
}

// ── Monthly Summary Table ──

interface LedgerEntry {
  key: string;
  labelAr: string;
  quarter: string;
  grossProfit: number;
  gpFees: number;
  totalCapital: number;
  status: "Active" | "Settled";
}

function MonthlySummaryTable({
  ledger,
  selectedMonth,
  onSelectMonth,
  loading,
}: {
  ledger: LedgerEntry[];
  selectedMonth: string;
  onSelectMonth: (key: string) => void;
  loading: boolean;
}) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-zinc-800/60 bg-[#09090b] backdrop-blur-sm mb-8">
      <div className="px-6 py-4 border-b border-zinc-800/60 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/20">
            <Icon name="analytics" className="text-emerald-400 !text-base" />
          </div>
          <h2 className="text-sm font-headline font-bold text-white tracking-[0.18em] uppercase">
            السجل الشهري · Monthly Ledger
          </h2>
        </div>
        {selectedMonth !== "all" && (
          <button
            onClick={() => onSelectMonth("all")}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-800/60 bg-zinc-900/50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-zinc-400 transition-all duration-200 hover:border-emerald-500/30 hover:text-emerald-400"
          >
            عرض الكل · Show All
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-700 border-t-emerald-400" />
        </div>
      ) : ledger.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-16">
          <TrendingUp size={28} className="text-zinc-800" />
          <p className="text-xs text-zinc-600">No monthly data yet · لا توجد بيانات شهرية</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-right">
            <thead className="sticky top-0 z-10">
              <tr className="text-[10px] text-zinc-600 uppercase tracking-[0.2em] bg-zinc-950/80 backdrop-blur">
                <th className="px-6 py-4 font-semibold">الشهر / السنة</th>
                <th className="px-6 py-4 font-semibold">إجمالي رأس المال</th>
                <th className="px-6 py-4 font-semibold">إجمالي الأرباح</th>
                <th className="px-6 py-4 font-semibold">رسوم الإدارة (GP)</th>
                <th className="px-6 py-4 font-semibold text-left">الحالة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/40">
              {ledger.map((entry) => {
                const isSelected = selectedMonth === entry.key;
                const profitPositive = entry.grossProfit >= 0;
                return (
                  <tr
                    key={entry.key}
                    onClick={() => onSelectMonth(isSelected ? "all" : entry.key)}
                    className={`cursor-pointer transition-colors duration-150 ${
                      isSelected
                        ? "bg-emerald-500/[0.06] border-r-2 border-r-emerald-400"
                        : "hover:bg-emerald-500/[0.02]"
                    }`}
                  >
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-sm text-white font-semibold">
                          {entry.labelAr}
                        </span>
                        <span className="text-[10px] text-zinc-600 uppercase tracking-widest font-semibold">
                          {entry.quarter}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm font-mono tabular-nums text-zinc-300">
                      {formatWholeNumber(entry.totalCapital)}
                    </td>
                    <td
                      className={`px-6 py-4 text-sm font-mono tabular-nums font-bold ${
                        profitPositive ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      {profitPositive ? "+" : ""}
                      {formatWholeNumber(entry.grossProfit)}
                    </td>
                    <td className="px-6 py-4 text-sm font-mono tabular-nums text-amber-300/80">
                      {formatWholeNumber(entry.gpFees)}
                    </td>
                    <td className="px-6 py-4 text-left">
                      {entry.status === "Active" ? (
                        <span className="inline-flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 text-emerald-400 font-bold uppercase tracking-widest">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)] animate-pulse" />
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-full border border-zinc-700/40 bg-zinc-900/40 text-zinc-500 font-bold uppercase tracking-widest">
                          <span className="h-1.5 w-1.5 rounded-full bg-zinc-600" />
                          Settled
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="p-4 border-t border-zinc-800/40 flex justify-between items-center text-[10px] text-zinc-600 uppercase tracking-widest font-semibold">
        <span className="font-mono tabular-nums">
          {ledger.length} شهر · Months
        </span>
        <span className="text-zinc-600">
          انقر على شهر لتصفية التوزيع · Click a month to filter distribution
        </span>
      </div>
    </section>
  );
}

// ── Dynamic Partner Profit Distribution ──

interface MonthOption {
  key: string;
  label: string;
}

function ProfitDistribution({
  partners,
  totalProfit,
  loading,
  selectedMonth,
  onMonthChange,
  monthOptions,
}: {
  partners: Partner[];
  totalProfit: number;
  loading: boolean;
  selectedMonth: string;
  onMonthChange: (key: string) => void;
  monthOptions: MonthOption[];
}) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const distribution = useMemo(
    () => computePortfolioDistribution(partners, totalProfit),
    [partners, totalProfit]
  );

  const sortedPartners = useMemo(() => {
    return [...partners].sort((a, b) => {
      const aDist = distribution[a.id];
      const bDist = distribution[b.id];
      if (aDist?.isManager && !bDist?.isManager) return -1;
      if (!aDist?.isManager && bDist?.isManager) return 1;
      return (bDist?.netProfit ?? 0) - (aDist?.netProfit ?? 0);
    });
  }, [partners, distribution]);

  const totalNetProfit = useMemo(
    () => Object.values(distribution).reduce((s, d) => s + d.netProfit, 0),
    [distribution]
  );
  const totalFeeCollected = useMemo(() => {
    const mgr = Object.values(distribution).find((d) => d.isManager);
    return mgr?.feeAmount ?? 0;
  }, [distribution]);

  const selectedLabel =
    selectedMonth === "all"
      ? "الكل · All Time"
      : monthOptions.find((m) => m.key === selectedMonth)?.label ?? selectedMonth;

  return (
    <section className="relative overflow-hidden rounded-2xl border border-zinc-800/60 bg-[#09090b] backdrop-blur-sm">
      <div className="px-6 py-4 border-b border-zinc-800/60 flex flex-wrap justify-between items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/20">
            <Icon name="analytics" className="text-emerald-400 !text-base" />
          </div>
          <div className="flex flex-col">
            <h2 className="text-sm font-headline font-bold text-white tracking-[0.18em] uppercase">
              توزيع أرباح الشركاء · Partner Distribution
            </h2>
            <span className="text-[9px] text-zinc-600 uppercase tracking-[0.22em] font-semibold mt-0.5">
              After {(MANAGEMENT_FEE_RATE * 100).toFixed(0)}% Performance Fee
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Month Selector Dropdown */}
          <div className="relative">
            <button
              onClick={() => setDropdownOpen((o) => !o)}
              className="inline-flex items-center gap-2 rounded-md border border-zinc-800/60 bg-zinc-950/60 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-300 transition-all duration-200 hover:border-emerald-500/30 hover:text-white"
            >
              <span className="max-w-[120px] truncate normal-case">{selectedLabel}</span>
              <ChevronDown
                size={12}
                className={`text-zinc-500 transition-transform duration-200 ${dropdownOpen ? "rotate-180" : ""}`}
              />
            </button>
            {dropdownOpen && (
              <div className="absolute top-full left-0 mt-1 z-50 w-52 max-h-56 overflow-y-auto rounded-md border border-[#1f1f1f] bg-[#0a0a0a] shadow-[0_0_30px_-8px_rgba(0,0,0,0.9)] backdrop-blur-xl">
                <button
                  onClick={() => {
                    onMonthChange("all");
                    setDropdownOpen(false);
                  }}
                  className={`w-full text-right px-4 py-2.5 text-[11px] font-semibold transition-colors ${
                    selectedMonth === "all"
                      ? "text-emerald-400 bg-emerald-500/[0.06]"
                      : "text-zinc-400 hover:text-white hover:bg-white/[0.04]"
                  }`}
                >
                  الكل · All Time
                </button>
                {monthOptions.map((m) => (
                  <button
                    key={m.key}
                    onClick={() => {
                      onMonthChange(m.key);
                      setDropdownOpen(false);
                    }}
                    className={`w-full text-right px-4 py-2.5 text-[11px] font-semibold transition-colors ${
                      selectedMonth === m.key
                        ? "text-emerald-400 bg-emerald-500/[0.06]"
                        : "text-zinc-400 hover:text-white hover:bg-white/[0.04]"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="hidden md:flex items-center gap-3 text-[10px] uppercase tracking-[0.18em] font-bold">
            <div className="flex items-center gap-2 rounded-md border border-zinc-800/60 bg-zinc-950/60 px-3 py-1.5">
              <span className="text-zinc-500">GP:</span>
              <span className="font-mono tabular-nums text-amber-300">
                {formatWholeNumber(totalFeeCollected)}
              </span>
            </div>
            <div className="flex items-center gap-2 rounded-md border border-zinc-800/60 bg-zinc-950/60 px-3 py-1.5">
              <span className="text-zinc-500">Net:</span>
              <span
                className={`font-mono tabular-nums ${
                  totalNetProfit >= 0 ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                {totalNetProfit >= 0 ? "+" : ""}
                {formatWholeNumber(totalNetProfit)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-700 border-t-emerald-400" />
        </div>
      ) : sortedPartners.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-16">
          <Activity size={28} className="text-zinc-800" />
          <p className="text-xs text-zinc-600">No partners yet · لا يوجد شركاء</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-right">
            <thead className="sticky top-0 z-10">
              <tr className="text-[10px] text-zinc-600 uppercase tracking-[0.2em] bg-zinc-950/80 backdrop-blur">
                <th className="px-6 py-4 font-semibold">الاسم · Name</th>
                <th className="px-6 py-4 font-semibold">رأس المال · Capital</th>
                <th className="px-6 py-4 font-semibold">الحصة · Share</th>
                <th className="px-6 py-4 font-semibold">الربح الصافي · Net Profit</th>
                <th className="px-6 py-4 font-semibold text-left">الحالة · Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/40">
              {sortedPartners.map((p) => {
                const dist = distribution[p.id];
                if (!dist) return null;
                const netPositive = dist.netProfit >= 0;
                const capital = Number(p.currentBalance) || 0;
                const isActive = capital > 0;
                return (
                  <tr
                    key={p.id}
                    className="hover:bg-emerald-500/[0.02] transition-colors duration-150"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex h-9 w-9 items-center justify-center rounded-lg border text-[11px] font-black tracking-wide ${
                            dist.isManager
                              ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
                              : "border-emerald-500/30 bg-emerald-500/5 text-emerald-300"
                          }`}
                        >
                          {p.initials}
                        </div>
                        <div className="flex flex-col">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm text-white font-semibold">
                              {p.name}
                            </span>
                            {dist.isManager && (
                              <span className="inline-flex items-center rounded-sm border border-amber-500/30 bg-amber-500/10 px-1.5 py-[1px] text-[8px] font-black uppercase tracking-[0.18em] text-amber-300">
                                GP
                              </span>
                            )}
                          </div>
                          <span className="font-mono text-[10px] text-zinc-600 uppercase tracking-widest">
                            {p.code}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm font-mono tabular-nums text-zinc-300">
                      {formatWholeNumber(capital)}
                    </td>
                    <td className="px-6 py-4 text-sm font-mono tabular-nums text-zinc-400">
                      {dist.ownershipPct.toFixed(2)}%
                    </td>
                    <td
                      className={`px-6 py-4 text-sm font-mono tabular-nums font-bold ${
                        netPositive
                          ? "text-emerald-400 [text-shadow:_0_0_12px_rgba(16,185,129,0.4)]"
                          : "text-rose-400"
                      }`}
                    >
                      {netPositive ? "+" : ""}
                      {formatWholeNumber(dist.netProfit)}
                    </td>
                    <td className="px-6 py-4 text-left">
                      {isActive ? (
                        <span className="inline-flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 text-emerald-400 font-bold uppercase tracking-widest">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)] animate-pulse" />
                          نشط · Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-full border border-zinc-700/40 bg-zinc-900/40 text-zinc-500 font-bold uppercase tracking-widest">
                          <span className="h-1.5 w-1.5 rounded-full bg-zinc-600" />
                          مكتمل · Completed
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="p-4 border-t border-zinc-800/40 flex justify-between items-center text-[10px] text-zinc-600 uppercase tracking-widest font-semibold">
        <span className="font-mono tabular-nums">
          {sortedPartners.length} شريك · Partners
        </span>
        <span className="text-zinc-600">
          {selectedMonth === "all" ? "All Time" : selectedLabel} · تصفية حسب الشهر
        </span>
      </div>
    </section>
  );
}

// ── Dynamic Cumulative P&L Chart ──

interface ChartPoint {
  key: string;
  label: string;
  value: number;
  monthly: number;
}

function CumulativePnLChart({
  data,
  loading,
}: {
  data: ChartPoint[];
  loading: boolean;
}) {
  const [hovered, setHovered] = useState<number | null>(null);

  // Chart geometry
  const PAD_L = 52;
  const PAD_R = 16;
  const PAD_T = 16;
  const PAD_B = 28;
  const W = 600;
  const H = 300;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;

  const { points, linePath, areaPath, yTicks } = useMemo(() => {
    if (data.length === 0)
      return { points: [], linePath: "", areaPath: "", yTicks: [] as number[] };

    const values = data.map((d) => d.value);
    const minV = Math.min(0, ...values);
    const maxV = Math.max(0, ...values);
    const range = maxV - minV || 1;

    const pts = data.map((d, i) => {
      const x = PAD_L + (data.length === 1 ? plotW / 2 : (i / (data.length - 1)) * plotW);
      const y = PAD_T + plotH - ((d.value - minV) / range) * plotH;
      return { x, y, ...d };
    });

    const lp = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
    const ap = `${lp} L${pts[pts.length - 1].x},${PAD_T + plotH} L${pts[0].x},${PAD_T + plotH} Z`;

    // Y-axis ticks (4–5 nice values)
    const step = niceStep(range, 4);
    const ticks: number[] = [];
    let tick = Math.floor(minV / step) * step;
    while (tick <= maxV + step * 0.01) {
      ticks.push(tick);
      tick += step;
    }

    return { points: pts, linePath: lp, areaPath: ap, yTicks: ticks };
  }, [data, plotW, plotH]);

  return (
    <div className="lg:col-span-2 relative overflow-hidden rounded-2xl border border-zinc-800/60 bg-[#09090b] p-6 backdrop-blur-sm min-h-[400px] flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-lg font-headline font-bold text-white leading-none tracking-tight">
            نمو الأرباح التراكمي
          </h2>
          <p className="text-[10px] text-zinc-500 uppercase tracking-[0.22em] mt-2 font-semibold">
            Cumulative Realized P&L · نمو تراكمي
          </p>
        </div>
        <div className="flex gap-2 items-center rounded-full border border-zinc-800/60 bg-zinc-900/50 px-3 py-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
          <span className="text-[10px] text-zinc-400 uppercase tracking-widest font-semibold">
            Realized
          </span>
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-700 border-t-emerald-400" />
        </div>
      ) : data.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2">
          <TrendingUp size={32} className="text-zinc-800" />
          <p className="text-xs text-zinc-600">
            No realized trades yet · لا توجد صفقات محققة
          </p>
        </div>
      ) : (
        <div className="flex-1 relative">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="w-full h-full"
            preserveAspectRatio="xMidYMid meet"
          >
            <defs>
              <linearGradient id="cumGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity="0.30" />
                <stop offset="100%" stopColor="#10b981" stopOpacity="0.02" />
              </linearGradient>
            </defs>

            {/* Grid lines */}
            {yTicks.map((tick) => {
              const values = data.map((d) => d.value);
              const minV = Math.min(0, ...values);
              const maxV = Math.max(0, ...values);
              const range = maxV - minV || 1;
              const y = PAD_T + plotH - ((tick - minV) / range) * plotH;
              return (
                <React.Fragment key={tick}>
                  <line
                    x1={PAD_L}
                    y1={y}
                    x2={W - PAD_R}
                    y2={y}
                    stroke="#27272a"
                    strokeWidth={0.5}
                    strokeDasharray="3,3"
                  />
                  <text
                    x={PAD_L - 8}
                    y={y + 3}
                    textAnchor="end"
                    className="fill-zinc-600 text-[8px] font-mono"
                  >
                    {tick >= 1000
                      ? `$${(tick / 1000).toFixed(tick % 1000 === 0 ? 0 : 1)}K`
                      : `$${tick}`}
                  </text>
                </React.Fragment>
              );
            })}

            {/* Area fill */}
            <path d={areaPath} fill="url(#cumGrad)" />

            {/* Line stroke */}
            <path
              d={linePath}
              fill="none"
              stroke="#10b981"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Data points + hover zones */}
            {points.map((p, i) => (
              <React.Fragment key={p.key}>
                {/* Invisible hit zone for hover */}
                <rect
                  x={p.x - plotW / data.length / 2}
                  y={PAD_T}
                  width={plotW / data.length}
                  height={plotH}
                  fill="transparent"
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                />
                {/* Dot */}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={hovered === i ? 5 : 3}
                  fill={hovered === i ? "#10b981" : "#09090b"}
                  stroke="#10b981"
                  strokeWidth={2}
                  className="transition-all duration-150"
                />
                {/* Vertical guide line on hover */}
                {hovered === i && (
                  <line
                    x1={p.x}
                    y1={PAD_T}
                    x2={p.x}
                    y2={PAD_T + plotH}
                    stroke="#10b981"
                    strokeWidth={0.5}
                    strokeDasharray="3,3"
                    opacity={0.4}
                  />
                )}
                {/* X-axis label */}
                <text
                  x={p.x}
                  y={H - 6}
                  textAnchor="middle"
                  className="fill-zinc-600 text-[7px] font-mono uppercase"
                >
                  {p.label}
                </text>
              </React.Fragment>
            ))}
          </svg>

          {/* Tooltip */}
          {hovered !== null && points[hovered] && (
            <div
              className="pointer-events-none absolute z-10 rounded-md border border-[#1f1f1f] bg-[#0a0a0a] px-3 py-2 shadow-[0_0_20px_-4px_rgba(0,0,0,0.8),0_0_12px_-4px_rgba(16,185,129,0.3)]"
              style={{
                left: `${(points[hovered].x / W) * 100}%`,
                top: `${(points[hovered].y / H) * 100 - 14}%`,
                transform: "translate(-50%, -100%)",
              }}
            >
              <p className="text-[9px] uppercase tracking-widest text-zinc-500 font-semibold mb-0.5">
                {points[hovered].label}
              </p>
              <p className="font-mono text-[13px] font-bold tabular-nums text-emerald-400">
                {formatCurrency(points[hovered].value)}
              </p>
              <p className="font-mono text-[10px] tabular-nums text-zinc-500">
                month: {points[hovered].monthly >= 0 ? "+" : ""}
                {formatCurrency(points[hovered].monthly)}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function niceStep(range: number, targetTicks: number): number {
  const rough = range / targetTicks;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const residual = rough / mag;
  if (residual <= 1.5) return mag;
  if (residual <= 3) return 2 * mag;
  if (residual <= 7) return 5 * mag;
  return 10 * mag;
}

// ── Dynamic Portfolio Composition Donut ──

const ALLOC_COLORS = [
  "#10b981", // emerald
  "#22d3ee", // cyan
  "#f59e0b", // amber
  "#8b5cf6", // violet
  "#ef4444", // rose
  "#6b7280", // gray (Others)
];

interface AllocSlice {
  ticker: string;
  value: number;
  pct: number;
  color: string;
}

function PortfolioComposition({
  slices,
  total,
  loading,
  equityOverride,
}: {
  slices: AllocSlice[];
  total: number;
  loading: boolean;
  equityOverride?: number | null;
}) {
  const [hovered, setHovered] = useState<number | null>(null);

  const SIZE = 180;
  const STROKE = 24;
  const RADIUS = (SIZE - STROKE) / 2;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
  const CX = SIZE / 2;
  const CY = SIZE / 2;

  // Build arc segments
  const arcs = useMemo(() => {
    let offset = 0;
    return slices.map((s) => {
      const len = (s.pct / 100) * CIRCUMFERENCE;
      const gap = slices.length > 1 ? 3 : 0;
      const arc = { ...s, dashoffset: -offset, dashlen: Math.max(0, len - gap) };
      offset += len;
      return arc;
    });
  }, [slices, CIRCUMFERENCE]);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-zinc-800/60 bg-[#09090b] p-6 backdrop-blur-sm flex flex-col">
      <div className="mb-4">
        <h2 className="text-lg font-headline font-bold text-white leading-none tracking-tight">
          توزيع المحفظة
        </h2>
        <p className="text-[10px] text-zinc-500 uppercase tracking-[0.22em] mt-2 font-semibold">
          Portfolio Composition · By Ticker
        </p>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center py-12">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-700 border-t-emerald-400" />
        </div>
      ) : slices.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 py-12">
          <Activity size={28} className="text-zinc-800" />
          <p className="text-xs text-zinc-600">No active positions yet</p>
        </div>
      ) : (
        <>
          {/* Donut Chart */}
          <div className="relative flex items-center justify-center py-6">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-48 w-48 rounded-full bg-emerald-500/5 blur-3xl" />
            </div>
            <svg
              width={SIZE}
              height={SIZE}
              viewBox={`0 0 ${SIZE} ${SIZE}`}
              className="relative -rotate-90"
            >
              {/* Background ring */}
              <circle
                cx={CX}
                cy={CY}
                r={RADIUS}
                fill="none"
                stroke="#18181b"
                strokeWidth={STROKE}
              />
              {/* Data arcs */}
              {arcs.map((arc, i) => (
                <circle
                  key={arc.ticker}
                  cx={CX}
                  cy={CY}
                  r={RADIUS}
                  fill="none"
                  stroke={arc.color}
                  strokeWidth={hovered === i ? STROKE + 4 : STROKE}
                  strokeDasharray={`${arc.dashlen} ${CIRCUMFERENCE - arc.dashlen}`}
                  strokeDashoffset={arc.dashoffset}
                  strokeLinecap="round"
                  opacity={hovered !== null && hovered !== i ? 0.35 : 1}
                  className="transition-all duration-200"
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                  style={{ cursor: "pointer" }}
                />
              ))}
            </svg>
            {/* Center label */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                {hovered !== null && slices[hovered] ? (
                  <>
                    <span
                      className="block font-mono text-[13px] font-bold tracking-wider"
                      style={{ color: slices[hovered].color }}
                    >
                      {slices[hovered].ticker}
                    </span>
                    <span className="block font-mono text-lg font-black text-white tabular-nums">
                      {formatCompactCurrency(slices[hovered].value)}
                    </span>
                    <span
                      className="block font-mono text-[10px] tabular-nums"
                      style={{ color: slices[hovered].color }}
                    >
                      {slices[hovered].pct.toFixed(1)}%
                    </span>
                  </>
                ) : equityOverride != null ? (
                  <>
                    <span className={`block text-2xl font-headline font-black tracking-tight tabular-nums ${equityOverride >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      {equityOverride >= 0 ? "+" : ""}{formatCompactCurrency(equityOverride)}
                    </span>
                    <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-semibold">
                      Month P&L
                    </span>
                  </>
                ) : (
                  <>
                    <span className="block text-2xl font-headline font-black text-white tracking-tight tabular-nums">
                      {formatCompactCurrency(total)}
                    </span>
                    <span className="text-[9px] text-zinc-500 uppercase tracking-widest font-semibold">
                      Deployed
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Legend */}
          <div className="space-y-1.5 mt-auto">
            {slices.map((s, i) => (
              <div
                key={s.ticker}
                className={`flex items-center justify-between text-xs rounded-md px-2.5 py-1.5 transition-all duration-150 cursor-default ${
                  hovered === i ? "bg-white/[0.05]" : "hover:bg-white/[0.03]"
                }`}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className="h-2.5 w-2.5 rounded-full shadow-[0_0_6px]"
                    style={{ backgroundColor: s.color, boxShadow: `0 0 6px ${s.color}60` }}
                  />
                  <span className="font-mono text-[11px] font-bold tracking-wider text-zinc-300">
                    {s.ticker}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-[10px] tabular-nums text-zinc-500">
                    {formatCompactCurrency(s.value)}
                  </span>
                  <span
                    className="font-mono text-[11px] font-bold tabular-nums"
                    style={{ color: s.color }}
                  >
                    {s.pct.toFixed(1)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
