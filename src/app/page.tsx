"use client";

import {
  Wallet,
  TrendingUp,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
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
  MANAGEMENT_FEE_RATE,
} from "@/lib/partner-profit";
import { usePartners } from "@/hooks/use-partners";
import { useTrades } from "@/hooks/use-trades";
import {
  monthlySummaries,
  portfolioDistribution,
} from "@/data/mock-data";

export default function DashboardPage() {
  const { partners, totalAssets, loading: partnersLoading } = usePartners();
  const { totalProfit, openCount, loading: tradesLoading } = useTrades();

  const loading = partnersLoading || tradesLoading;
  const fundBreakdown = computeFundBreakdown(partners, totalAssets);
  const netProfitAfterFee = totalProfit * (1 - MANAGEMENT_FEE_RATE);
  const profitPositive = totalProfit >= 0;
  const yieldPct =
    fundBreakdown.originalCapital > 0
      ? (totalProfit / fundBreakdown.originalCapital) * 100
      : 0;

  return (
    <AppShell>
      {/* ═══════ 3 Hero Cards ═══════ */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
        {loading ? (
          <>
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
        <div className="lg:col-span-2 relative overflow-hidden rounded-2xl border border-zinc-800/60 bg-[#09090b] p-6 backdrop-blur-sm min-h-[400px] flex flex-col">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h2 className="text-lg font-headline font-bold text-white leading-none tracking-tight">
                نمو الأرباح الشهري
              </h2>
              <p className="text-[10px] text-zinc-500 uppercase tracking-[0.22em] mt-2 font-semibold">
                Monthly Profit Growth Analytics
              </p>
            </div>
            <div className="flex gap-2 items-center rounded-full border border-zinc-800/60 bg-zinc-900/50 px-3 py-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
              <span className="text-[10px] text-zinc-400 uppercase tracking-widest font-semibold">
                Realized
              </span>
            </div>
          </div>
          <div className="flex-1 flex items-end gap-1 px-2 relative">
            <div className="absolute inset-0 opacity-20 pointer-events-none">
              <div className="w-full h-full border-b border-l border-zinc-700/40" />
            </div>
            <svg
              className="w-full h-full absolute inset-0 p-8"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              <defs>
                <linearGradient
                  id="chartGradient"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor="#34d399" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path
                d="M0 80 Q10 75 20 60 T40 65 T60 40 T80 20 T100 10 L100 100 L0 100 Z"
                fill="url(#chartGradient)"
              />
              <path
                d="M0 80 Q10 75 20 60 T40 65 T60 40 T80 20 T100 10"
                fill="none"
                stroke="#34d399"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <div className="w-full flex justify-between absolute bottom-4 px-8 text-[9px] text-zinc-600 uppercase tracking-widest font-semibold">
              {[
                "Jan",
                "Feb",
                "Mar",
                "Apr",
                "May",
                "Jun",
                "Jul",
                "Aug",
                "Sep",
                "Oct",
                "Nov",
                "Dec",
              ].map((m) => (
                <span key={m}>{m}</span>
              ))}
            </div>
          </div>
        </div>

        {/* Portfolio Distribution */}
        <div className="relative overflow-hidden rounded-2xl border border-zinc-800/60 bg-[#09090b] p-6 backdrop-blur-sm flex flex-col justify-between">
          <div>
            <h2 className="text-lg font-headline font-bold text-white leading-none tracking-tight">
              توزيع المحفظة
            </h2>
            <p className="text-[10px] text-zinc-500 uppercase tracking-[0.22em] mt-2 font-semibold">
              Portfolio Distribution
            </p>
          </div>
          <div className="relative flex items-center justify-center py-10">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-56 w-56 rounded-full bg-emerald-500/5 blur-3xl" />
            </div>
            <div className="relative w-48 h-48 rounded-full border-[12px] border-emerald-500/25 flex items-center justify-center">
              <div
                className="absolute inset-[-12px] rounded-full border-[12px] border-cyan-500/50"
                style={{ clipPath: "polygon(50% 50%, 0 0, 100% 0, 100% 30%)" }}
              />
              <div
                className="absolute inset-[-12px] rounded-full border-[12px] border-rose-500/60"
                style={{
                  clipPath: "polygon(50% 50%, 100% 30%, 100% 60%)",
                }}
              />
              <div className="text-center">
                <span className="block text-3xl font-headline font-black text-white tracking-tight tabular-nums">
                  {loading ? "..." : formatCompactCurrency(totalAssets)}
                </span>
                <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold">
                  Total Equity
                </span>
              </div>
            </div>
          </div>
          <div className="space-y-2.5">
            {portfolioDistribution.map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-between text-xs rounded-md px-2 py-1.5 hover:bg-white/[0.03] transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <span className={`w-2 h-2 bg-${item.color} rounded-full`} />
                  <span className="text-zinc-400">
                    {item.labelAr}{" "}
                    <span className="text-zinc-600">({item.label})</span>
                  </span>
                </div>
                <span className="font-bold text-white tabular-nums font-mono">
                  {item.percentage}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ═══════ Monthly Summary ═══════ */}
      <section className="relative overflow-hidden rounded-2xl border border-zinc-800/60 bg-[#09090b] backdrop-blur-sm">
        <div className="px-6 py-4 border-b border-zinc-800/60 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <Icon name="analytics" className="text-emerald-400 !text-base" />
            </div>
            <h2 className="text-sm font-headline font-bold text-white tracking-[0.18em] uppercase">
              الملخص الشهري · Monthly Summary
            </h2>
          </div>
          <button className="group flex items-center gap-1.5 rounded-lg border border-zinc-800/60 bg-zinc-900/50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-zinc-400 transition-all duration-200 hover:border-emerald-500/30 hover:text-emerald-400">
            <Icon name="download" className="!text-sm" />
            تحميل التقرير
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-right">
            <thead className="sticky top-0 z-10">
              <tr className="text-[10px] text-zinc-600 uppercase tracking-[0.2em] bg-zinc-950/80 backdrop-blur">
                <th className="px-6 py-4 font-semibold">الشهر / السنة</th>
                <th className="px-6 py-4 font-semibold">إجمالي رأس المال</th>
                <th className="px-6 py-4 font-semibold">إجمالي الأرباح</th>
                <th className="px-6 py-4 font-semibold">رسوم الإدارة</th>
                <th className="px-6 py-4 font-semibold text-left">الحالة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/40">
              {monthlySummaries.map((summary) => (
                <tr
                  key={summary.id}
                  className="hover:bg-emerald-500/[0.02] transition-colors duration-150"
                >
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="text-sm text-white font-semibold">
                        {summary.monthAr}
                      </span>
                      <span className="text-[10px] text-zinc-600 uppercase tracking-widest font-semibold">
                        {summary.quarter}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm font-mono tabular-nums text-zinc-300">
                    {formatWholeNumber(summary.totalCapital)}
                  </td>
                  <td className="px-6 py-4 text-sm font-mono tabular-nums font-bold text-emerald-400">
                    +{formatWholeNumber(summary.totalProfits)}
                  </td>
                  <td className="px-6 py-4 text-sm font-mono tabular-nums text-rose-400/80">
                    {formatWholeNumber(summary.managementFees)}
                  </td>
                  <td className="px-6 py-4 text-left">
                    <span className="inline-flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 text-emerald-400 font-bold uppercase tracking-widest">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
                      {summary.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="p-4 border-t border-zinc-800/40 flex justify-between items-center text-[10px] text-zinc-600 uppercase tracking-widest font-semibold">
          <span>
            عرض 1-4 من أصل 12 شهراً
          </span>
          <div className="flex gap-4">
            <button className="hover:text-white transition-colors">
              السابق
            </button>
            <button className="text-emerald-400 hover:text-emerald-300 transition-colors font-bold">
              التالي
            </button>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
