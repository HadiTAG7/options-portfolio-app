"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { Icon } from "@/components/ui/icon";
import { formatCurrency } from "@/lib/utils";
import { usePartners } from "@/hooks/use-partners";
import { useTrades } from "@/hooks/use-trades";

export default function PartnerDetailPage() {
  const params = useParams<{ id: string }>();
  const partnerId = params?.id ?? "";

  const { partners, loading: partnersLoading, totalAssets } = usePartners();
  const { sellPuts, sellCalls, loading: tradesLoading } = useTrades();

  const partner = useMemo(
    () => partners.find((p) => p.id === partnerId),
    [partners, partnerId]
  );

  // Ownership is always derived from the partner's currentBalance over
  // the total global fund balance so the number stays in sync even when
  // the stored column is stale.
  const ownershipPct = useMemo(() => {
    if (!partner || totalAssets <= 0) return 0;
    return (partner.currentBalance / totalAssets) * 100;
  }, [partner, totalAssets]);

  // Partner's fractional share of every open option position.
  // Market value = premium * quantity. `quantity` already stores total
  // shares (100, 200, ...), so there's no extra *100 multiplier.
  const fractionalAssets = useMemo(() => {
    if (!partner) return [];
    const share = ownershipPct / 100;
    return [...sellPuts, ...sellCalls].map((t) => {
      const globalMarketValue = Number(t.premium) * Number(t.quantity);
      return {
        id: t.id,
        symbol: t.ticker,
        type: t.type,
        totalQuantity: t.quantity,
        partnerQuantity: t.quantity * share,
        partnerMarketValue: globalMarketValue * share,
      };
    });
  }, [partner, ownershipPct, sellPuts, sellCalls]);

  const loading = partnersLoading || tradesLoading;

  if (loading) {
    return (
      <AppShell>
        <div className="py-24 text-center text-on-surface-variant text-sm">
          جاري التحميل...
        </div>
      </AppShell>
    );
  }

  if (!partner) {
    return (
      <AppShell>
        <div className="py-24 text-center">
          <Icon
            name="person_off"
            className="!text-5xl text-on-surface-variant/30 block mx-auto mb-3"
          />
          <p className="text-sm text-on-surface">لم يتم العثور على الشريك</p>
          <p className="text-[10px] text-on-surface-variant mt-1 font-mono">
            {partnerId}
          </p>
        </div>
      </AppShell>
    );
  }

  const netProfitTone =
    partner.totalNetProfit >= 0 ? "text-primary" : "text-secondary";

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
            {ownershipPct.toFixed(2)}%
          </span>
        </div>
      </div>

      {/* Bento Grid */}
      <div className="grid grid-cols-12 gap-6">
        {/* Main Equity Card */}
        <div className="col-span-12 lg:col-span-8 bg-surface-variant/60 backdrop-blur-xl p-8 rounded-sm border border-white/5 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-l from-primary to-transparent" />
          <div className="flex justify-between items-start">
            <div>
              <span className="text-[10px] uppercase tracking-widest text-on-surface-variant font-label block mb-2">
                إجمالي حقوق الملكية (النسبية)
              </span>
              <span className="text-5xl font-headline font-light tracking-tighter text-on-surface block font-mono">
                {formatCurrency(partner.currentBalance)}
              </span>
              <span className="text-[10px] text-on-surface-variant mt-3 block">
                من إجمالي {formatCurrency(totalAssets)} في المحفظة
              </span>
            </div>
            <div className="text-left">
              <span className="text-[10px] uppercase tracking-widest text-on-surface-variant font-label block mb-2">
                صافي الربح/الخسارة
              </span>
              <span
                className={`text-3xl font-headline font-bold font-mono ${netProfitTone}`}
              >
                {partner.totalNetProfit >= 0 ? "+" : ""}
                {formatCurrency(partner.totalNetProfit)}
              </span>
            </div>
          </div>
        </div>

        {/* Side Cards */}
        <div className="col-span-12 lg:col-span-4 flex flex-col gap-6">
          {/* Fees Paid */}
          <div className="bg-surface-container p-6 rounded-sm border border-white/5 border-r-2 border-r-tertiary">
            <div className="flex items-center gap-3 mb-3">
              <Icon name="payments" className="text-tertiary" />
              <span className="text-[10px] uppercase tracking-widest text-on-surface-variant font-label">
                إجمالي الرسوم المدفوعة
              </span>
            </div>
            <span className="text-2xl font-headline font-bold text-white block font-mono">
              {formatCurrency(partner.managementFeesPaid)}
            </span>
            <span className="text-[10px] text-on-surface-variant mt-1 block">
              رسوم الإدارة عبر كل الفترات
            </span>
          </div>

          {/* Base Capital */}
          <div className="bg-surface-container p-6 rounded-sm border border-white/5 border-r-2 border-r-primary-container">
            <div className="flex items-center gap-3 mb-3">
              <Icon name="account_balance" className="text-primary-container" />
              <span className="text-[10px] uppercase tracking-widest text-on-surface-variant font-label">
                رأس المال الأساسي
              </span>
            </div>
            <span className="text-2xl font-headline font-bold text-white block font-mono">
              {formatCurrency(partner.baseCapital)}
            </span>
            <span className="text-[10px] text-on-surface-variant mt-1 block">
              قيمة رأس المال المُودع
            </span>
          </div>
        </div>

        {/* Fractional Assets Table */}
        <div className="col-span-12 bg-surface-container rounded-sm border border-white/5 overflow-hidden">
          <div className="px-6 py-4 border-b border-white/5 flex justify-between items-center bg-surface-container-high">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-headline font-bold text-white tracking-widest uppercase">
                توزيع الأصول النشطة ({ownershipPct.toFixed(2)}%)
              </h2>
              <span className="rounded-full bg-tertiary/10 px-2 py-0.5 text-[9px] font-bold uppercase text-tertiary">
                {fractionalAssets.length} positions
              </span>
            </div>
            <div className="flex items-center gap-4 text-[10px] text-on-surface-variant">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-tertiary inline-block" />
                عقود خيارات نشطة
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
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {fractionalAssets.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center">
                      <Icon
                        name="layers_clear"
                        className="!text-4xl text-on-surface-variant/30 mb-2 block mx-auto"
                      />
                      <p className="text-sm text-on-surface-variant">
                        لا توجد مراكز نشطة في المحفظة
                      </p>
                    </td>
                  </tr>
                )}
                {fractionalAssets.map((asset) => (
                  <tr
                    key={asset.id}
                    className="hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="px-6 py-4 text-sm font-bold text-white font-mono">
                      {asset.symbol}
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-[10px] px-2 py-0.5 rounded-sm border font-bold uppercase border-tertiary text-tertiary">
                        {asset.type}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-on-surface-variant font-mono">
                      {asset.totalQuantity.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-sm text-white font-medium font-mono">
                      {asset.partnerQuantity.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 text-sm font-headline text-white font-mono">
                      {formatCurrency(asset.partnerMarketValue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
