"use client";

import { AppShell } from "@/components/layout/app-shell";
import { Icon } from "@/components/ui/icon";
import { CardSkeleton, TableRowSkeleton } from "@/components/ui/skeleton";
import { formatWholeNumber, formatCompactCurrency } from "@/lib/utils";
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

  return (
    <AppShell>
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
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
            <div className="bg-surface-container p-6 rounded-sm border-r-2 border-primary glow-primary flex flex-col justify-between h-32 relative overflow-hidden">
              <div className="absolute -right-4 -top-4 opacity-5">
                <Icon name="account_balance" className="!text-8xl" />
              </div>
              <span className="text-[10px] uppercase tracking-widest text-on-surface-variant font-label">
                إجمالي الأصول (Total AUM)
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-headline font-light tracking-tighter text-on-surface">
                  {formatWholeNumber(totalAssets)}
                </span>
                <span className="text-[10px] text-primary font-bold">
                  +12%
                </span>
              </div>
            </div>

            {/* Total Profits */}
            <div className="bg-surface-container p-6 rounded-sm border-r-2 border-primary flex flex-col justify-between h-32 relative overflow-hidden">
              <div className="absolute -right-4 -top-4 opacity-10 text-primary">
                <Icon name="trending_up" className="!text-8xl" />
              </div>
              <span className="text-[10px] uppercase tracking-widest text-on-surface-variant font-label">
                مجموع الأرباح (Total Profits)
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-headline font-bold tracking-tighter text-primary">
                  {formatWholeNumber(totalProfit)}
                </span>
                <span className="text-[10px] text-primary font-bold">▲</span>
              </div>
            </div>

            {/* Partners */}
            <div className="bg-surface-container p-6 rounded-sm border-r-2 border-tertiary flex flex-col justify-between h-32 relative overflow-hidden">
              <div className="absolute -right-4 -top-4 opacity-5 text-tertiary">
                <Icon name="group" className="!text-8xl" />
              </div>
              <span className="text-[10px] uppercase tracking-widest text-on-surface-variant font-label">
                إجمالي الشركاء (Total Partners)
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-headline font-light tracking-tighter text-on-surface">
                  {partners.length}
                </span>
                <span className="text-[10px] text-tertiary font-bold">
                  {openCount} صفقة نشطة
                </span>
              </div>
            </div>

            {/* Management Fees (estimated from partner fee rates) */}
            <div className="bg-surface-container p-6 rounded-sm border-r-2 border-outline-variant flex flex-col justify-between h-32 relative overflow-hidden">
              <div className="absolute -right-4 -top-4 opacity-5">
                <Icon name="receipt_long" className="!text-8xl" />
              </div>
              <span className="text-[10px] uppercase tracking-widest text-on-surface-variant font-label">
                رسوم الإدارة المقدّرة (Fees)
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-headline font-light tracking-tighter text-on-surface">
                  {formatWholeNumber(
                    partners.reduce(
                      (sum, p) => sum + p.totalBalance * (p.managementFeeRate / 100),
                      0
                    )
                  )}
                </span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Profit Growth Chart */}
        <div className="lg:col-span-2 bg-surface-container p-6 rounded-sm min-h-[400px] flex flex-col">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h2 className="text-lg font-headline font-bold text-white leading-none">
                نمو الأرباح الشهري
              </h2>
              <p className="text-[10px] text-on-surface-variant uppercase tracking-widest mt-1">
                Monthly Profit Growth Analytics
              </p>
            </div>
            <div className="flex gap-2 items-center">
              <span className="w-3 h-3 rounded-full bg-primary inline-block" />
              <span className="text-[10px] text-on-surface-variant uppercase">Realized</span>
            </div>
          </div>
          <div className="flex-1 flex items-end gap-1 px-2 relative">
            <div className="absolute inset-0 opacity-10">
              <div className="w-full h-full border-b border-l border-white/10" />
            </div>
            <svg
              className="w-full h-full absolute inset-0 p-8"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              <defs>
                <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#5bff49" stopOpacity="0.2" />
                  <stop offset="100%" stopColor="#5bff49" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path
                d="M0 80 Q10 75 20 60 T40 65 T60 40 T80 20 T100 10 L100 100 L0 100 Z"
                fill="url(#chartGradient)"
              />
              <path
                d="M0 80 Q10 75 20 60 T40 65 T60 40 T80 20 T100 10"
                fill="none"
                stroke="#5bff49"
                strokeWidth="2"
              />
            </svg>
            <div className="w-full flex justify-between absolute bottom-4 px-8 text-[9px] text-on-surface-variant font-label uppercase">
              {["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].map((m) => (
                <span key={m}>{m}</span>
              ))}
            </div>
          </div>
        </div>

        {/* Portfolio Distribution */}
        <div className="bg-surface-container p-6 rounded-sm flex flex-col justify-between border-l border-white/5">
          <div>
            <h2 className="text-lg font-headline font-bold text-white leading-none">
              توزيع المحفظة
            </h2>
            <p className="text-[10px] text-on-surface-variant uppercase tracking-widest mt-1">
              Portfolio Distribution
            </p>
          </div>
          <div className="relative flex items-center justify-center py-12">
            <div className="w-48 h-48 rounded-full border-[12px] border-primary-container relative flex items-center justify-center">
              <div
                className="absolute inset-[-12px] rounded-full border-[12px] border-tertiary-dim"
                style={{ clipPath: "polygon(50% 50%, 0 0, 100% 0, 100% 30%)" }}
              />
              <div
                className="absolute inset-[-12px] rounded-full border-[12px] border-secondary"
                style={{ clipPath: "polygon(50% 50%, 100% 30%, 100% 60%)" }}
              />
              <div className="text-center">
                <span className="block text-3xl font-headline font-black text-white">
                  {loading ? "..." : formatCompactCurrency(totalAssets)}
                </span>
                <span className="text-[10px] text-on-surface-variant uppercase">Total Equity</span>
              </div>
            </div>
          </div>
          <div className="space-y-3">
            {portfolioDistribution.map((item) => (
              <div key={item.label} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 bg-${item.color} rounded-full`} />
                  <span className="text-on-surface-variant">
                    {item.labelAr} ({item.label})
                  </span>
                </div>
                <span className="font-bold text-white">{item.percentage}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Monthly Summary Table */}
      <section className="bg-surface-container rounded-sm overflow-hidden border border-white/5">
        <div className="px-6 py-4 border-b border-white/5 flex justify-between items-center bg-surface-container-high">
          <div className="flex items-center gap-3">
            <Icon name="analytics" className="text-primary" />
            <h2 className="text-sm font-headline font-bold text-white tracking-widest uppercase">
              الملخص الشهري (Monthly Summary)
            </h2>
          </div>
          <button className="text-[10px] text-primary hover:underline font-bold uppercase tracking-widest">
            تحميل التقرير
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-right">
            <thead>
              <tr className="text-[10px] text-on-surface-variant uppercase tracking-widest bg-surface-container-low">
                <th className="px-6 py-4 font-medium">الشهر / السنة</th>
                <th className="px-6 py-4 font-medium">إجمالي رأس المال</th>
                <th className="px-6 py-4 font-medium">إجمالي الأرباح</th>
                <th className="px-6 py-4 font-medium">رسوم الإدارة</th>
                <th className="px-6 py-4 font-medium text-left">الحالة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {monthlySummaries.map((summary) => (
                <tr key={summary.id} className="hover:bg-surface-container-highest transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="text-sm text-white font-bold">{summary.monthAr}</span>
                      <span className="text-[9px] text-on-surface-variant uppercase">{summary.quarter}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm font-headline font-medium">
                    {formatWholeNumber(summary.totalCapital)}
                  </td>
                  <td className="px-6 py-4 text-sm font-headline font-bold text-primary">
                    +{formatWholeNumber(summary.totalProfits)}
                  </td>
                  <td className="px-6 py-4 text-sm font-headline font-medium">
                    {formatWholeNumber(summary.managementFees)}
                  </td>
                  <td className="px-6 py-4 text-left">
                    <span className="text-[9px] px-3 py-1 rounded-full border border-primary/30 text-primary font-black uppercase">
                      {summary.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="p-4 bg-surface-container-low flex justify-between items-center text-[10px] text-on-surface-variant">
          <span>عرض 1-4 من أصل 12 شهراً</span>
          <div className="flex gap-4">
            <button className="hover:text-white transition-colors">السابق</button>
            <button className="text-primary font-black">التالي</button>
          </div>
        </div>
      </section>

      {/* FAB */}
      <div className="fixed bottom-8 left-8 z-50">
        <button className="w-14 h-14 bg-primary text-on-primary rounded-full shadow-2xl flex items-center justify-center hover:brightness-110 transition-transform active:scale-95 glow-primary">
          <Icon name="add" className="!text-3xl" />
        </button>
      </div>
    </AppShell>
  );
}
