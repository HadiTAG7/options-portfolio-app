"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { Icon } from "@/components/ui/icon";
import { formatCurrency } from "@/lib/utils";
import { isManagerPartner } from "@/lib/partner-profit";
import { usePartners } from "@/hooks/use-partners";
import { useTrades } from "@/hooks/use-trades";

// GP/LP performance fee. Must match the distribution engine.
const PERFORMANCE_FEE = 0.2;

// Partner's take-home share of a dollar amount X after the 20% GP fee.
//  - LP: gets their ownership slice × 80%
//  - GP: gets their own slice at 100% + 20% skimmed from every LP
function partnerNetOf(total: number, partnerShare: number, isGP: boolean): number {
  if (isGP) {
    return total * (partnerShare + PERFORMANCE_FEE * (1 - partnerShare));
  }
  return total * partnerShare * (1 - PERFORMANCE_FEE);
}

// Format "$120 | 15 Nov" from a strike and an ISO-ish expiry string.
function formatExpiry(expiry: string): string {
  if (!expiry) return "—";
  const d = new Date(expiry);
  if (Number.isNaN(d.getTime())) return expiry;
  const day = d.getDate();
  const month = d.toLocaleString("en-US", { month: "short" });
  return `${day} ${month}`;
}

// Partner-friendly labels. The raw DB types ("Sell Put" / "Sell Call")
// are trader jargon; partners see the strategy name + short English
// gloss instead.
function partnerFriendlyType(type: string): { ar: string; en: string } {
  if (type === "Sell Put") return { ar: "تأمين نقدي", en: "Cash Secured Put" };
  if (type === "Sell Call") return { ar: "بيع مغطى", en: "Covered Call" };
  return { ar: type, en: "" };
}

export default function PartnerDetailPage() {
  const params = useParams<{ id: string }>();
  const partnerId = params?.id ?? "";

  const { partners, loading: partnersLoading, totalAssets } = usePartners();
  const { sellPuts, sellCalls, activeStocks, loading: tradesLoading } = useTrades();

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

  const isGP = partner ? isManagerPartner(partner) : false;

  // Open option positions with partner-specific net metrics.
  // Uses intrinsic value (underlying spot − strike) as the unrealized-P&L
  // proxy since we don't ingest live option prices.
  const optionPositions = useMemo(() => {
    if (!partner) return [];
    const share = ownershipPct / 100;

    // Index active stock prices by ticker for underlying lookup.
    const spotByTicker: Record<string, number> = {};
    for (const s of activeStocks) {
      const px = s.currentPrice ?? s.purchasePrice;
      if (Number.isFinite(px) && px > 0) {
        spotByTicker[s.ticker.toUpperCase()] = px;
      }
    }

    return [...sellPuts, ...sellCalls].map((t) => {
      const premium = Number(t.premium) || 0;
      const qty = Number(t.quantity) || 0; // total shares, not contracts
      const totalPremium = premium * qty;
      const isPut = t.type === "Sell Put";
      const spot = spotByTicker[t.ticker.toUpperCase()] ?? null;

      // Intrinsic value of the short option per share. If we don't have
      // a spot for the underlying we can't compute intrinsic — treat as
      // zero (unrealized P&L falls back to the full collected premium).
      let intrinsicPerShare = 0;
      if (spot !== null) {
        intrinsicPerShare = isPut
          ? Math.max(0, Number(t.strike) - spot)
          : Math.max(0, spot - Number(t.strike));
      }
      const globalUnrealized = (premium - intrinsicPerShare) * qty;

      const partnerNetPremium = partnerNetOf(totalPremium, share, isGP);
      const partnerNetUnrealized = partnerNetOf(globalUnrealized, share, isGP);

      // Break the net premium into its 3 pieces so the UI can show them
      // separately: gross ownership slice, fee adjustment, net take-home.
      //   - LP: gross = share × total, fee = -PERFORMANCE_FEE × gross,
      //         net = gross + fee   (fee is negative, money paid out)
      //   - GP: gross = share × total, fee = +PERFORMANCE_FEE × LP-slice,
      //         net = gross + fee   (fee is positive, money collected)
      const partnerGrossPremium = totalPremium * share;
      const partnerFeePremium = isGP
        ? totalPremium * PERFORMANCE_FEE * (1 - share)
        : -partnerGrossPremium * PERFORMANCE_FEE;

      // Partner-centric view: how many underlying shares they're exposed
      // to, and how much of their cash is locked as collateral at the
      // option's strike. `qty` already stores total underlying shares
      // across all contracts, so no extra ×100.
      const partnerShareExposure = qty * share;
      const partnerLockedCollateral =
        partnerShareExposure * (Number(t.strike) || 0);

      return {
        id: t.id,
        ticker: t.ticker,
        type: t.type,
        strike: Number(t.strike) || 0,
        expiration: t.expiration,
        premium,
        totalPremium,
        partnerShareExposure,
        partnerLockedCollateral,
        partnerGrossPremium,
        partnerFeePremium,
        partnerNetPremium,
        spot,
        globalUnrealized,
        partnerNetUnrealized,
      };
    });
  }, [partner, ownershipPct, sellPuts, sellCalls, activeStocks, isGP]);

  // Stock holdings — partner-centric view with live pricing + P&L.
  // If the live quote is missing we leave currentPrice null so the UI
  // can render a "no live price" placeholder instead of pretending the
  // purchase price is the current price.
  const stockPositions = useMemo(() => {
    if (!partner) return [];
    const share = ownershipPct / 100;
    return activeStocks.map((s) => {
      const purchasePrice = Number(s.purchasePrice) || 0;
      const currentPrice =
        typeof s.currentPrice === "number" && Number.isFinite(s.currentPrice)
          ? s.currentPrice
          : null;
      const livePrice = currentPrice ?? purchasePrice; // fallback for value calcs
      const partnerQuantity = s.quantity * share;
      const partnerMarketValue = livePrice * partnerQuantity;
      const partnerUnrealized = (livePrice - purchasePrice) * partnerQuantity;
      const unrealizedPct =
        purchasePrice > 0
          ? ((livePrice - purchasePrice) / purchasePrice) * 100
          : 0;
      return {
        id: s.id,
        ticker: s.ticker,
        purchasePrice,
        currentPrice,
        targetPrice: Number(s.targetSellPrice) || 0,
        partnerQuantity,
        partnerMarketValue,
        partnerUnrealized,
        unrealizedPct,
        priceLoading: s.priceLoading === true,
      };
    });
  }, [partner, ownershipPct, activeStocks]);

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
          {partner.entryDate && (
            <p className="text-[10px] text-on-surface-variant/70 mt-2 flex items-center gap-1.5">
              <Icon name="event" className="!text-sm" />
              تاريخ الانضمام:{" "}
              <span className="font-mono text-on-surface">
                {partner.entryDate}
              </span>
            </p>
          )}
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

      {/* Eligibility disclaimer */}
      <div className="mb-6 flex items-start gap-3 p-4 rounded-sm bg-surface-container-low border border-white/5 border-r-2 border-r-tertiary/60">
        <Icon name="info" className="text-tertiary !text-base mt-0.5" />
        <div className="text-[11px] leading-relaxed text-on-surface-variant">
          <span className="font-bold text-on-surface">ملاحظة مهمة: </span>
          يتم احتساب أرباح الشريك فقط على الصفقات التي أُغلقت{" "}
          <span className="font-bold text-on-surface">
            بعد تاريخ انضمامه للصندوق
          </span>
          . الصفقات التي انتهت قبل ذلك التاريخ لا تُدرج في حصته — هذا لضمان
          عدالة التوزيع بين جميع الشركاء.
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

        {/* Active Options Table — option-specific per-partner metrics */}
        <div className="col-span-12 bg-surface-container rounded-sm border border-white/5 overflow-hidden">
          <div className="px-6 py-4 border-b border-white/5 flex justify-between items-center bg-surface-container-high">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-headline font-bold text-white tracking-widest uppercase">
                عقود الخيارات النشطة ({ownershipPct.toFixed(2)}%)
              </h2>
              <span className="rounded-full bg-tertiary/10 px-2 py-0.5 text-[9px] font-bold uppercase text-tertiary">
                {optionPositions.length} positions
              </span>
              {isGP && (
                <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[9px] font-bold uppercase text-amber-300">
                  GP · صافي بعد 20٪ رسوم الأداء من جميع الشركاء
                </span>
              )}
              {!isGP && (
                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold uppercase text-emerald-300">
                  LP · صافي بعد رسوم الأداء 20٪
                </span>
              )}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-right">
              <thead>
                <tr className="text-[10px] text-on-surface-variant uppercase tracking-widest bg-surface-container-low">
                  <th className="px-4 py-3 font-medium">الرمز</th>
                  <th className="px-4 py-3 font-medium">النوع</th>
                  <th className="px-4 py-3 font-medium">
                    Strike · الانتهاء
                  </th>
                  <th className="px-4 py-3 font-medium">
                    الأسهم المعرضة
                  </th>
                  <th className="px-4 py-3 font-medium">
                    الكاش المحجوز
                  </th>
                  <th className="px-4 py-3 font-medium">
                    البريميوم · Entry
                  </th>
                  <th className="px-4 py-3 font-medium">
                    حصة الشريك
                  </th>
                  <th className="px-4 py-3 font-medium text-amber-300/80">
                    رسوم الإدارة
                  </th>
                  <th className="px-4 py-3 font-medium text-emerald-400/80">
                    الصافي
                  </th>
                  <th className="px-4 py-3 font-medium">
                    ربح/خسارة غير محققة
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {optionPositions.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-6 py-12 text-center">
                      <Icon
                        name="layers_clear"
                        className="!text-4xl text-on-surface-variant/30 mb-2 block mx-auto"
                      />
                      <p className="text-sm text-on-surface-variant">
                        لا توجد عقود خيارات نشطة
                      </p>
                    </td>
                  </tr>
                )}
                {optionPositions.map((opt) => {
                  const pnlPositive = opt.partnerNetUnrealized >= 0;
                  const isPut = opt.type === "Sell Put";
                  const label = partnerFriendlyType(opt.type);
                  return (
                    <tr
                      key={opt.id}
                      className="hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="px-4 py-3 text-sm font-bold text-white font-mono">
                        {opt.ticker}
                      </td>
                      <td className="px-4 py-3">
                        <div
                          className={`inline-flex flex-col items-start gap-0.5 px-2 py-1 rounded-sm border ${
                            isPut
                              ? "border-secondary/50"
                              : "border-primary/50"
                          }`}
                        >
                          <span
                            className={`text-[10px] font-bold ${
                              isPut ? "text-secondary" : "text-primary"
                            }`}
                          >
                            {label.ar}
                          </span>
                          <span className="text-[9px] text-on-surface-variant/60 uppercase tracking-wider">
                            {label.en}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-xs text-white tabular-nums">
                            ${opt.strike.toLocaleString()}
                          </span>
                          <span className="text-[10px] text-on-surface-variant/70 tabular-nums">
                            {formatExpiry(opt.expiration)}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-xs text-white tabular-nums">
                            {opt.partnerShareExposure.toFixed(2)}
                          </span>
                          <span className="text-[10px] text-on-surface-variant/60 tabular-nums">
                            shares
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-white font-mono tabular-nums">
                        {formatCurrency(opt.partnerLockedCollateral)}
                      </td>
                      <td className="px-4 py-3 font-mono">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-xs text-white tabular-nums">
                            ${opt.premium.toFixed(2)}
                          </span>
                          <span className="text-[10px] text-on-surface-variant/60 tabular-nums">
                            per share
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-white font-mono tabular-nums">
                        {formatCurrency(opt.partnerGrossPremium)}
                      </td>
                      <td className="px-4 py-3 font-mono">
                        <span
                          className={`text-xs font-bold tabular-nums ${
                            isGP ? "text-amber-300" : "text-rose-400"
                          }`}
                          title={
                            isGP
                              ? "رسوم 20٪ محصّلة من حصة باقي الشركاء"
                              : "رسوم 20٪ مدفوعة للمدير"
                          }
                        >
                          {opt.partnerFeePremium >= 0 ? "+" : ""}
                          {formatCurrency(opt.partnerFeePremium)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm font-headline font-bold text-emerald-400 font-mono tabular-nums drop-shadow-[0_0_6px_rgba(52,211,153,0.35)]">
                          {formatCurrency(opt.partnerNetPremium)}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono">
                        <div className="flex flex-col gap-0.5">
                          <span
                            className={`text-xs font-bold tabular-nums ${
                              pnlPositive ? "text-emerald-400" : "text-rose-400"
                            }`}
                          >
                            {pnlPositive ? "+" : ""}
                            {formatCurrency(opt.partnerNetUnrealized)}
                          </span>
                          {opt.spot !== null ? (
                            <span className="text-[10px] text-on-surface-variant/60 tabular-nums">
                              spot ${opt.spot.toFixed(2)}
                            </span>
                          ) : (
                            <span className="text-[10px] text-on-surface-variant/40">
                              لا يوجد سعر مرجعي
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Stock Holdings Table — partner share of open stock positions */}
        <div className="col-span-12 bg-surface-container rounded-sm border border-white/5 overflow-hidden">
          <div className="px-6 py-4 border-b border-white/5 flex justify-between items-center bg-surface-container-high">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-headline font-bold text-white tracking-widest uppercase">
                الأسهم المحتفظ بها
              </h2>
              <span className="rounded-full bg-tertiary/10 px-2 py-0.5 text-[9px] font-bold uppercase text-tertiary">
                {stockPositions.length} positions
              </span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-right">
              <thead>
                <tr className="text-[10px] text-on-surface-variant uppercase tracking-widest bg-surface-container-low">
                  <th className="px-4 py-3 font-medium">الرمز</th>
                  <th className="px-4 py-3 font-medium">
                    التكلفة · السعر الحالي
                  </th>
                  <th className="px-4 py-3 font-medium">حصة الشريك</th>
                  <th className="px-4 py-3 font-medium">
                    القيمة السوقية
                  </th>
                  <th className="px-4 py-3 font-medium">
                    ربح/خسارة غير محققة
                  </th>
                  <th className="px-4 py-3 font-medium">
                    السعر المستهدف
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {stockPositions.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center">
                      <Icon
                        name="layers_clear"
                        className="!text-4xl text-on-surface-variant/30 mb-2 block mx-auto"
                      />
                      <p className="text-sm text-on-surface-variant">
                        لا توجد أسهم نشطة
                      </p>
                    </td>
                  </tr>
                )}
                {stockPositions.map((stk) => {
                  const hasLive = stk.currentPrice !== null;
                  const pnlPositive = stk.partnerUnrealized >= 0;
                  return (
                    <tr
                      key={stk.id}
                      className="hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="px-4 py-3 text-sm font-bold text-white font-mono">
                        {stk.ticker}
                      </td>
                      <td className="px-4 py-3 font-mono">
                        <div className="flex items-center gap-2 tabular-nums">
                          <span className="text-xs text-on-surface-variant">
                            ${stk.purchasePrice.toFixed(2)}
                          </span>
                          <Icon
                            name="arrow_left_alt"
                            className="!text-xs text-on-surface-variant/40"
                          />
                          {hasLive ? (
                            <span className="text-xs text-white font-bold">
                              ${stk.currentPrice!.toFixed(2)}
                            </span>
                          ) : stk.priceLoading ? (
                            <span className="text-[10px] text-on-surface-variant/60">
                              جاري التحديث...
                            </span>
                          ) : (
                            <span className="text-[10px] text-on-surface-variant/40">
                              —
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-white font-mono tabular-nums">
                        {stk.partnerQuantity.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-sm text-white font-mono tabular-nums">
                        {formatCurrency(stk.partnerMarketValue)}
                      </td>
                      <td className="px-4 py-3 font-mono">
                        {hasLive ? (
                          <div className="flex flex-col gap-0.5 tabular-nums">
                            <span
                              className={`text-xs font-bold ${
                                pnlPositive
                                  ? "text-emerald-400"
                                  : "text-rose-400"
                              }`}
                            >
                              {pnlPositive ? "+" : ""}
                              {formatCurrency(stk.partnerUnrealized)}
                            </span>
                            <span
                              className={`text-[10px] ${
                                pnlPositive
                                  ? "text-emerald-400/70"
                                  : "text-rose-400/70"
                              }`}
                            >
                              {pnlPositive ? "+" : ""}
                              {stk.unrealizedPct.toFixed(2)}%
                            </span>
                          </div>
                        ) : (
                          <span className="text-[10px] text-on-surface-variant/40">
                            لا يوجد سعر مرجعي
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono tabular-nums">
                        {stk.targetPrice > 0 ? (
                          <span className="text-xs text-primary">
                            ${stk.targetPrice.toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-[10px] text-on-surface-variant/40">
                            —
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
