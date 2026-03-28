"use client";

import { AppShell } from "@/components/layout/app-shell";
import { Icon } from "@/components/ui/icon";
import { formatCurrency } from "@/lib/utils";
import { partnerDetail } from "@/data/mock-data";

const sparklineHeights = [40, 65, 30, 80, 55, 90, 45, 70, 60, 85];

export default function PartnerDetailPage() {
  const partner = partnerDetail;

  return (
    <AppShell>
      {/* Breadcrumb + Header */}
      <div className="flex justify-between items-start mb-8">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-on-surface-variant font-label mb-2">
            الشركاء / <span className="text-primary">{partner.name}</span>
          </div>
          <h1 className="text-4xl font-black font-headline tracking-tighter uppercase">
            تفاصيل الشريك
          </h1>
          <p className="text-sm text-on-surface-variant mt-1">
            عرض تحليلي للحصة النسبية في المحفظة النشطة
          </p>
        </div>
        <div className="bg-surface-container-highest px-6 py-4 border-r-4 border-primary rounded-sm">
          <span className="text-[10px] uppercase tracking-widest text-on-surface-variant font-label block mb-1">
            نسبة الملكية
          </span>
          <span className="text-3xl font-headline font-black text-primary">
            {partner.ownershipPercentage.toFixed(2)}%
          </span>
        </div>
      </div>

      {/* Bento Grid */}
      <div className="grid grid-cols-12 gap-6">
        {/* Main P&L Card */}
        <div className="col-span-12 lg:col-span-8 bg-surface-variant/60 backdrop-blur-xl p-8 rounded-sm border border-white/5 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-l from-primary to-transparent" />
          <div className="flex justify-between items-start mb-8">
            <div>
              <span className="text-[10px] uppercase tracking-widest text-on-surface-variant font-label block mb-2">
                إجمالي حقوق الملكية (النسبية)
              </span>
              <span className="text-5xl font-headline font-light tracking-tighter text-on-surface block">
                {formatCurrency(partner.totalEquity)}
              </span>
              <span className="text-sm text-primary font-bold mt-2 block">
                +{partner.dailyChangePercent}% اليوم
              </span>
            </div>
            <div className="text-left">
              <span className="text-[10px] uppercase tracking-widest text-on-surface-variant font-label block mb-2">
                صافي الربح/الخسارة
              </span>
              <span className="text-3xl font-headline font-bold text-primary">
                +{formatCurrency(partner.netPnL)}
              </span>
            </div>
          </div>
          {/* Sparkline Bars */}
          <div className="flex items-end gap-2 h-20">
            {sparklineHeights.map((height, i) => (
              <div
                key={i}
                className="flex-1 bg-primary/10 hover:bg-primary/30 rounded-t-sm transition-colors cursor-pointer"
                style={{ height: `${height}%` }}
              />
            ))}
          </div>
        </div>

        {/* Side Cards */}
        <div className="col-span-12 lg:col-span-4 flex flex-col gap-6">
          {/* Fees Card */}
          <div className="bg-surface-container p-6 rounded-sm border border-white/5 border-r-2 border-r-tertiary">
            <div className="flex items-center gap-3 mb-3">
              <Icon name="payments" className="text-tertiary" />
              <span className="text-[10px] uppercase tracking-widest text-on-surface-variant font-label">
                إجمالي الرسوم المدفوعة
              </span>
            </div>
            <span className="text-2xl font-headline font-bold text-white block">
              {formatCurrency(partner.totalFeesPaid)}
            </span>
            <span className="text-[10px] text-on-surface-variant mt-1 block">
              تشمل رسوم التنفيذ والضرائب
            </span>
          </div>

          {/* Liquidity Card */}
          <div className="bg-surface-container p-6 rounded-sm border border-white/5 border-r-2 border-r-primary-container">
            <div className="flex items-center gap-3 mb-3">
              <Icon name="account_balance" className="text-primary-container" />
              <span className="text-[10px] uppercase tracking-widest text-on-surface-variant font-label">
                السيولة المتاحة للتداول
              </span>
            </div>
            <span className="text-2xl font-headline font-bold text-white block">
              {formatCurrency(partner.availableLiquidity)}
            </span>
            <span className="text-[10px] text-on-surface-variant mt-1 block">
              القوة الشرائية المتبقية للشريك
            </span>
          </div>
        </div>

        {/* Assets Table */}
        <div className="col-span-12 bg-surface-container rounded-sm border border-white/5 overflow-hidden">
          <div className="px-6 py-4 border-b border-white/5 flex justify-between items-center bg-surface-container-high">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-headline font-bold text-white tracking-widest uppercase">
                توزيع الأصول النشطة ({partner.ownershipPercentage}%)
              </h2>
            </div>
            <div className="flex items-center gap-4 text-[10px] text-on-surface-variant">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-primary inline-block" />
                أسهم
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-tertiary inline-block" />
                عقود خيارات
              </span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-right">
              <thead>
                <tr className="text-[10px] text-on-surface-variant uppercase tracking-widest bg-surface-container-low">
                  <th className="px-6 py-4 font-medium">الرمز</th>
                  <th className="px-6 py-4 font-medium">النوع</th>
                  <th className="px-6 py-4 font-medium">إجمالي الكمية</th>
                  <th className="px-6 py-4 font-medium">حصة الشريك</th>
                  <th className="px-6 py-4 font-medium">القيمة السوقية</th>
                  <th className="px-6 py-4 font-medium text-left">التغير %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {partner.assets.map((asset) => (
                  <tr
                    key={asset.symbol}
                    className="hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="px-6 py-4 text-sm font-bold text-white font-mono">
                      {asset.symbol}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-sm border font-bold uppercase ${
                          asset.type === "stock"
                            ? "border-primary text-primary"
                            : "border-tertiary text-tertiary"
                        }`}
                      >
                        {asset.type === "stock" ? "سهم" : "خيار"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-on-surface-variant">
                      {asset.totalQuantity}
                    </td>
                    <td className="px-6 py-4 text-sm text-white font-medium">
                      {asset.partnerShare}
                    </td>
                    <td className="px-6 py-4 text-sm font-headline text-white">
                      {formatCurrency(asset.marketValue)}
                    </td>
                    <td
                      className={`px-6 py-4 text-sm font-bold text-left ${
                        asset.changePercent >= 0
                          ? "text-primary"
                          : "text-secondary"
                      }`}
                    >
                      {asset.changePercent >= 0 ? "+" : ""}
                      {asset.changePercent.toFixed(2)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Activity Log */}
        <div className="col-span-12 lg:col-span-6 bg-surface-container rounded-sm border border-white/5">
          <div className="px-6 py-4 border-b border-white/5">
            <h2 className="text-sm font-headline font-bold text-white tracking-widest uppercase">
              آخر النشاطات النسبية
            </h2>
          </div>
          <div className="divide-y divide-white/5">
            {partner.activities.map((activity) => (
              <div
                key={activity.id}
                className="px-6 py-4 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center ${
                      activity.type === "loss"
                        ? "bg-secondary/10"
                        : "bg-primary/10"
                    }`}
                  >
                    <Icon
                      name={
                        activity.type === "loss"
                          ? "trending_down"
                          : "payments"
                      }
                      className={`!text-lg ${
                        activity.type === "loss"
                          ? "text-secondary"
                          : "text-primary"
                      }`}
                    />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm text-white">
                      {activity.description}
                    </span>
                    <span className="text-[10px] text-on-surface-variant">
                      {activity.timestamp}
                    </span>
                  </div>
                </div>
                <span
                  className={`text-sm font-headline font-bold ${
                    activity.type === "loss"
                      ? "text-secondary"
                      : "text-primary"
                  }`}
                >
                  {activity.amount >= 0 ? "+" : ""}
                  {formatCurrency(Math.abs(activity.amount))}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Greeks Card */}
        <div className="col-span-12 lg:col-span-6 bg-surface-container rounded-sm border border-white/5">
          <div className="px-6 py-4 border-b border-white/5">
            <h2 className="text-sm font-headline font-bold text-white tracking-widest uppercase">
              مؤشرات المخاطر (Greeks)
            </h2>
          </div>
          <div className="p-6 grid grid-cols-2 gap-4">
            <div className="bg-surface-container-low p-4 rounded-sm border-l border-primary/20">
              <span className="text-[10px] uppercase tracking-widest text-on-surface-variant font-label block mb-2">
                Delta
              </span>
              <span className="text-2xl font-headline font-bold text-white">
                {partner.greeks.delta}
              </span>
            </div>
            <div className="bg-surface-container-low p-4 rounded-sm border-l border-tertiary/20">
              <span className="text-[10px] uppercase tracking-widest text-on-surface-variant font-label block mb-2">
                Theta
              </span>
              <span className="text-2xl font-headline font-bold text-white">
                {partner.greeks.theta}
              </span>
            </div>
            <div className="bg-surface-container-low p-4 rounded-sm border-l border-white/10">
              <span className="text-[10px] uppercase tracking-widest text-on-surface-variant font-label block mb-2">
                Gamma
              </span>
              <span className="text-2xl font-headline font-bold text-white">
                {partner.greeks.gamma}
              </span>
            </div>
            <div className="bg-surface-container-low p-4 rounded-sm border-l border-white/10">
              <span className="text-[10px] uppercase tracking-widest text-on-surface-variant font-label block mb-2">
                Vega
              </span>
              <span className="text-2xl font-headline font-bold text-white">
                {partner.greeks.vega}
              </span>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
