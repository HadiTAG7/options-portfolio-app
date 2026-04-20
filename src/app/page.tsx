"use client";

import { AppShell } from "@/components/layout/app-shell";
import { Icon } from "@/components/ui/icon";
import { CardSkeleton } from "@/components/ui/skeleton";
import { formatWholeNumber, formatCompactCurrency, formatCurrency } from "@/lib/utils";
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
  const generatedPositive = fundBreakdown.generatedProfit >= 0;
  const profitPositive = totalProfit >= 0;
  const estimatedFees = partners.reduce(
    (sum, p) => sum + p.totalBalance * (p.managementFeeRate / 100),
    0
  );

  return (
    <AppShell>
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5 mb-8">
        {loading ? (
          <>
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </>
        ) : (
          <>
            {/* Total AUM */}
            <div
              className="group relative overflow-hidden rounded-xl border border-zinc-800/60 bg-gradient-to-br from-zinc-900/80 via-zinc-900/60 to-zinc-950/90 p-5 backdrop-blur-sm transition-all duration-300 hover:border-emerald-500/30 hover:shadow-[0_0_40px_-12px_rgba(52,211,153,0.35)]"
              title={`رأس المال الأساسي: ${formatCurrency(fundBreakdown.originalCapital)} — الأرباح المحققة: ${formatCurrency(fundBreakdown.generatedProfit)}`}
            >
              <div className="pointer-events-none absolute -top-20 -right-16 h-44 w-44 rounded-full bg-emerald-500/10 blur-3xl transition-opacity duration-300 group-hover:bg-emerald-500/20" />
              <div className="pointer-events-none absolute -right-4 -top-4 text-zinc-800/40">
                <Icon name="account_balance" className="!text-8xl" />
              </div>
              <div className="relative flex h-full flex-col justify-between gap-3">
                <span className="text-[10px] uppercase tracking-[0.22em] text-zinc-500 font-semibold">
                  إجمالي الأصول · Total AUM
                </span>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-headline font-light tracking-tight text-white font-mono tabular-nums">
                    {formatWholeNumber(totalAssets)}
                  </span>
                  <span
                    className={`text-[11px] font-bold tabular-nums ${
                      generatedPositive ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {generatedPositive ? "+" : ""}
                    {fundBreakdown.generatedProfitPct.toFixed(1)}%
                  </span>
                </div>
                <div className="flex items-center gap-3 text-[10px]">
                  <span className="text-zinc-500">
                    <span className="opacity-70">رأس المال:</span>{" "}
                    <span className="text-zinc-200 font-mono tabular-nums">
                      {formatCompactCurrency(fundBreakdown.originalCapital)}
                    </span>
                  </span>
                  <span
                    className={`font-mono tabular-nums font-bold ${
                      generatedPositive ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    <span className="opacity-70 font-normal">أرباح:</span>{" "}
                    {generatedPositive ? "+" : ""}
                    {formatCompactCurrency(fundBreakdown.generatedProfit)}
                  </span>
                </div>
              </div>
            </div>

            {/* Total Profits */}
            <div
              className="group relative overflow-hidden rounded-xl border border-zinc-800/60 bg-gradient-to-br from-zinc-900/80 via-zinc-900/60 to-zinc-950/90 p-5 backdrop-blur-sm transition-all duration-300 hover:border-emerald-500/30 hover:shadow-[0_0_40px_-12px_rgba(52,211,153,0.35)]"
              title={`صافي بعد رسوم الإدارة ${(MANAGEMENT_FEE_RATE * 100).toFixed(0)}%: ${formatCurrency(netProfitAfterFee)}`}
            >
              <div className="pointer-events-none absolute -top-20 -right-16 h-44 w-44 rounded-full bg-emerald-500/10 blur-3xl transition-opacity duration-300 group-hover:bg-emerald-500/20" />
              <div className="pointer-events-none absolute -right-4 -top-4 text-emerald-500/10">
                <Icon name="trending_up" className="!text-8xl" />
              </div>
              <div className="relative flex h-full flex-col justify-between gap-3">
                <span className="text-[10px] uppercase tracking-[0.22em] text-zinc-500 font-semibold">
                  مجموع الأرباح · Gross / Net
                </span>
                <div className="flex items-baseline gap-2">
                  <span
                    className={`text-3xl font-headline font-bold tracking-tight font-mono tabular-nums ${
                      profitPositive ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {profitPositive ? "+" : ""}
                    {formatWholeNumber(totalProfit)}
                  </span>
                  <span className={`text-[11px] font-bold ${profitPositive ? "text-emerald-400" : "text-rose-400"}`}>
                    {profitPositive ? "▲" : "▼"}
                  </span>
                </div>
                <div className="text-[10px] text-zinc-500">
                  <span className="opacity-70">صافي بعد الرسوم:</span>{" "}
                  <span className="text-zinc-200 font-mono tabular-nums font-bold">
                    {formatCompactCurrency(netProfitAfterFee)}
                  </span>
                </div>
              </div>
            </div>

            {/* Partners */}
            <div className="group relative overflow-hidden rounded-xl border border-zinc-800/60 bg-gradient-to-br from-zinc-900/80 via-zinc-900/60 to-zinc-950/90 p-5 backdrop-blur-sm transition-all duration-300 hover:border-cyan-500/30 hover:shadow-[0_0_40px_-12px_rgba(34,211,238,0.3)]">
              <div className="pointer-events-none absolute -top-20 -right-16 h-44 w-44 rounded-full bg-cyan-500/10 blur-3xl transition-opacity duration-300 group-hover:bg-cyan-500/20" />
              <div className="pointer-events-none absolute -right-4 -top-4 text-cyan-500/10">
                <Icon name="group" className="!text-8xl" />
              </div>
              <div className="relative flex h-full flex-col justify-between gap-3">
                <span className="text-[10px] uppercase tracking-[0.22em] text-zinc-500 font-semibold">
                  إجمالي الشركاء · Total Partners
                </span>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-headline font-light tracking-tight text-white tabular-nums">
                    {partners.length}
                  </span>
                  <span className="text-[11px] font-bold text-cyan-400 tabular-nums">
                    {openCount} صفقة نشطة
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-zinc-500">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
                  <span>نشطين الآن</span>
                </div>
              </div>
            </div>

            {/* Management Fees (estimated from partner fee rates) */}
            <div className="group relative overflow-hidden rounded-xl border border-zinc-800/60 bg-gradient-to-br from-zinc-900/80 via-zinc-900/60 to-zinc-950/90 p-5 backdrop-blur-sm transition-all duration-300 hover:border-zinc-600">
              <div className="pointer-events-none absolute -top-20 -right-16 h-44 w-44 rounded-full bg-zinc-500/5 blur-3xl" />
              <div className="pointer-events-none absolute -right-4 -top-4 text-zinc-800/40">
                <Icon name="receipt_long" className="!text-8xl" />
              </div>
              <div className="relative flex h-full flex-col justify-between gap-3">
                <span className="text-[10px] uppercase tracking-[0.22em] text-zinc-500 font-semibold">
                  رسوم الإدارة المقدّرة · Fees
                </span>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-headline font-light tracking-tight text-white font-mono tabular-nums">
                    {formatWholeNumber(estimatedFees)}
                  </span>
                </div>
                <div className="text-[10px] text-zinc-500">
                  مقدّرة على الأرصدة الحالية
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-8">
        {/* Profit Growth Chart */}
        <div className="lg:col-span-2 relative overflow-hidden rounded-xl border border-zinc-800/60 bg-gradient-to-br from-zinc-900/80 to-zinc-950/90 p-6 backdrop-blur-sm min-h-[400px] flex flex-col">
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
              <span className="text-[10px] text-zinc-400 uppercase tracking-widest font-semibold">Realized</span>
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
                <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
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
            <div className="w-full flex justify-between absolute bottom-4 px-8 text-[9px] text-zinc-500 uppercase tracking-widest font-semibold">
              {["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].map((m) => (
                <span key={m}>{m}</span>
              ))}
            </div>
          </div>
        </div>

        {/* Portfolio Distribution */}
        <div className="relative overflow-hidden rounded-xl border border-zinc-800/60 bg-gradient-to-br from-zinc-900/80 to-zinc-950/90 p-6 backdrop-blur-sm flex flex-col justify-between">
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
                style={{ clipPath: "polygon(50% 50%, 100% 30%, 100% 60%)" }}
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
                className="flex items-center justify-between text-xs rounded-md px-2 py-1.5 hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <span className={`w-2 h-2 bg-${item.color} rounded-full`} />
                  <span className="text-zinc-400">
                    {item.labelAr}{" "}
                    <span className="text-zinc-600">({item.label})</span>
                  </span>
                </div>
                <span className="font-bold text-white tabular-nums">
                  {item.percentage}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Monthly Summary Table */}
      <section className="relative overflow-hidden rounded-xl border border-zinc-800/60 bg-gradient-to-br from-zinc-900/80 to-zinc-950/90 backdrop-blur-sm">
        <div className="px-6 py-4 border-b border-zinc-800/60 flex justify-between items-center bg-zinc-900/60">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-emerald-500/10 border border-emerald-500/20">
              <Icon name="analytics" className="text-emerald-400 !text-base" />
            </div>
            <h2 className="text-sm font-headline font-bold text-white tracking-[0.18em] uppercase">
              الملخص الشهري · Monthly Summary
            </h2>
          </div>
          <button className="group flex items-center gap-1.5 rounded-md border border-emerald-500/20 bg-emerald-500/5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-emerald-400 transition-all duration-200 hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-300">
            <Icon name="download" className="!text-sm" />
            تحميل التقرير
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-right">
            <thead className="sticky top-0 z-10">
              <tr className="text-[10px] text-zinc-500 uppercase tracking-[0.2em] bg-zinc-950/80 backdrop-blur">
                <th className="px-6 py-4 font-semibold">الشهر / السنة</th>
                <th className="px-6 py-4 font-semibold">إجمالي رأس المال</th>
                <th className="px-6 py-4 font-semibold">إجمالي الأرباح</th>
                <th className="px-6 py-4 font-semibold">رسوم الإدارة</th>
                <th className="px-6 py-4 font-semibold text-left">الحالة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {monthlySummaries.map((summary) => (
                <tr
                  key={summary.id}
                  className="hover:bg-white/[0.03] transition-colors"
                >
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="text-sm text-white font-semibold">
                        {summary.monthAr}
                      </span>
                      <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold">
                        {summary.quarter}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm font-mono tabular-nums text-zinc-200">
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
        <div className="p-4 bg-zinc-950/60 border-t border-zinc-800/60 flex justify-between items-center text-[10px] text-zinc-500 uppercase tracking-widest font-semibold">
          <span>عرض 1-4 من أصل 12 شهراً</span>
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

      {/* FAB */}
      <div className="fixed bottom-8 left-8 z-50">
        <button className="group relative flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-zinc-950 shadow-[0_0_30px_-6px_rgba(52,211,153,0.8)] transition-all duration-200 hover:bg-emerald-400 hover:scale-[1.05] active:scale-95">
          <div className="pointer-events-none absolute inset-0 rounded-full bg-emerald-400/30 blur-xl opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
          <Icon name="add" className="!text-3xl relative" />
        </button>
      </div>
    </AppShell>
  );
}
