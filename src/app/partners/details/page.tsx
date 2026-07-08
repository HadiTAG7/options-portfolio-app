"use client";

import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { Icon } from "@/components/ui/icon";
import { formatCurrency } from "@/lib/utils";
import {
  computePartnerDistributionFromTrades,
  isManagerPartner,
  tradeMonthKey,
} from "@/lib/partner-profit";
import { usePartners } from "@/hooks/use-partners";
import { useTrades } from "@/hooks/use-trades";
import { useTransactions } from "@/hooks/use-transactions";
import { TransactionList } from "@/components/ui/transaction-list";

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

// Gregorian month names in Arabic (Gulf/MSA), indexed 0–11. A manual
// map avoids toLocaleString("ar-SA") defaulting to the Hijri calendar.
const AR_MONTHS = [
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
];

// "20 أبريل 2026" from an ISO / YYYY-MM-DD string (Gregorian, Arabic).
function formatSnapshotDate(iso: string): string {
  const d = (iso || "").slice(0, 10);
  const [y, m, day] = d.split("-");
  if (!y || !m || !day) return iso || "—";
  return `${Number(day)} ${AR_MONTHS[Number(m) - 1] ?? m} ${y}`;
}

// Inner component reads the partner id from the URL query string. Split
// out from the default export so we can wrap it in <Suspense> — that's
// required by useSearchParams during prerender (the static-export build
// would otherwise bail with a "missing Suspense boundary" error).
function PartnerDetailInner() {
  const searchParams = useSearchParams();
  const partnerId = searchParams.get("id") ?? "";

  const { partners, loading: partnersLoading } = usePartners();
  const {
    trades,
    sellPuts,
    sellCalls,
    activeStocks,
    loading: tradesLoading,
  } = useTrades();

  const partner = useMemo(
    () => partners.find((p) => p.id === partnerId),
    [partners, partnerId]
  );

  // The partner's journal for the statement section below.
  const { transactions, loading: txLoading } = useTransactions(
    partnerId || null
  );

  // Single source of truth: the same trade-based distribution engine
  // the Partners table renders from. This replaces the page's old
  // local math (hardcoded 20% fee + currentBalance/totalAssets
  // ownership), which showed a different ownership % and ignored each
  // partner's configurable managementFeeRate.
  const dist = useMemo(
    () => computePartnerDistributionFromTrades(partners, trades)[partnerId],
    [partners, trades, partnerId]
  );

  // Investment-weighted ownership — identical to the نسبة الملكية
  // column on the Partners page.
  const ownershipPct = dist?.ownershipPct ?? 0;
  const feeRatePct = dist?.feeRatePct ?? 0;

  const isGP = partner ? isManagerPartner(partner) : false;

  // Partner's take-home slice of a fund-wide dollar amount, using
  // THEIR fee rate from the distribution engine:
  //  - LP: ownership slice × (1 − feeRate)
  //  - GP: ownership slice only (gross). LP fees are credited to the
  //    GP's capital when each LP settles, so they're not shown as part
  //    of per-position projections here.
  const partnerNetOf = useMemo(() => {
    const share = ownershipPct / 100;
    const feeKeep = isGP ? 1 : 1 - feeRatePct / 100;
    return (total: number) => total * share * feeKeep;
  }, [ownershipPct, feeRatePct, isGP]);

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

      const partnerNetPremium = partnerNetOf(totalPremium);
      const partnerNetUnrealized = partnerNetOf(globalUnrealized);

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
        partnerNetPremium,
        spot,
        globalUnrealized,
        partnerNetUnrealized,
      };
    });
  }, [partner, partnerNetOf, ownershipPct, sellPuts, sellCalls, activeStocks]);

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

  // Monthly profit log — the partner's realized profit, month by month.
  // Reuses the GP dashboard's exact convention: bucket trades by
  // profit-month, then run the distribution engine over each month with
  // settlement stamps nulled (a later تثبيت must NOT erase history) but
  // entry-date eligibility active. So each row is this partner's own
  // gross / fee / net for that month, and the numbers reconcile with the
  // manager's monthly ledger.
  const monthlyLog = useMemo(() => {
    if (!partnerId) return [];
    const statementPartners = partners.map((p) => ({
      ...p,
      lastSettlementDate: null,
    }));
    const tradesByMonth: Record<string, typeof trades> = {};
    for (const t of trades) {
      const key = tradeMonthKey(t);
      if (!key) continue;
      (tradesByMonth[key] ??= []).push(t);
    }
    return Object.keys(tradesByMonth)
      .sort()
      .reverse()
      .map((key) => {
        const md = computePartnerDistributionFromTrades(
          statementPartners,
          tradesByMonth[key]
        )[partnerId];
        const [y, m] = key.split("-");
        return {
          key,
          label: `${AR_MONTHS[Number(m) - 1]} ${y}`,
          gross: md?.grossProfit ?? 0,
          fee: md?.feeAmount ?? 0,
          net: md?.netProfit ?? 0,
        };
      })
      .filter((r) => r.gross !== 0 || r.net !== 0);
  }, [partnerId, partners, trades]);

  // Capital timeline — reconstructed from balanceHistory snapshots.
  // The per-event history (which change was a deposit vs a
  // capitalization vs a fee) was never stored, so each row shows the
  // recorded balance at a date and the NET change since the previous
  // snapshot. Most-recent first.
  const capitalTimeline = useMemo(() => {
    const hist = Array.isArray(partner?.balanceHistory)
      ? [...partner!.balanceHistory]
      : [];
    hist.sort((a, b) =>
      (a.date || "").slice(0, 10).localeCompare((b.date || "").slice(0, 10))
    );
    let prev: number | null = null;
    const rows = hist.map((h) => {
      const balance = Number(h.balance) || 0;
      const delta = prev === null ? null : balance - prev;
      prev = balance;
      return { date: h.date, balance, delta };
    });
    return rows.reverse();
  }, [partner]);

  const loading = partnersLoading || tradesLoading;

  if (loading) {
    return (
      <div className="py-24 text-center text-on-surface-variant text-sm">
        جاري التحميل...
      </div>
    );
  }

  if (!partner) {
    return (
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
    );
  }

  // Realized pending net from the distribution engine — the same
  // number the Partners table shows in its NET column.
  const pendingNet = dist?.netProfit ?? 0;
  const pendingFee = dist?.feeAmount ?? 0;
  const monthlyLogTotal = monthlyLog.reduce((s, r) => s + r.net, 0);

  // Line-chart geometry for the capital timeline (oldest→newest,
  // left→right; SVG coords are LTR, matching the snapshot cards above).
  // Returns null with fewer than 2 snapshots (nothing to connect).
  const capitalChart = (() => {
    const rows = [...capitalTimeline].reverse();
    const n = rows.length;
    if (n < 2) return null;
    const W = 100;
    const H = 40;
    const PAD = 3;
    const bals = rows.map((r) => r.balance);
    const max = Math.max(...bals);
    const min = Math.min(...bals);
    const range = max - min || 1;
    const pts = rows.map((r, i) => {
      const x = PAD + (i / (n - 1)) * (W - 2 * PAD);
      const y = PAD + (1 - (r.balance - min) / range) * (H - 2 * PAD);
      return { x, y, balance: r.balance };
    });
    const line = pts
      .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
      .join(" ");
    const area = `${line} L${pts[n - 1].x.toFixed(2)},${H} L${pts[0].x.toFixed(2)},${H} Z`;
    return { pts, line, area, W, H };
  })();

  const CAPS = "text-[11px] font-bold uppercase tracking-[0.12em]";

  return (
    <div className="mx-auto max-w-[1440px]">
      {/* Breadcrumb + Header */}
      <div className="mb-8">
        <div className="mb-2 flex items-center gap-1.5 text-xs text-on-surface-variant">
          <span>{partner.name}</span>
          <Icon name="chevron_left" className="!text-base" />
          <span className="text-primary">حسابي</span>
        </div>
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="font-headline text-3xl font-bold text-on-surface">
              حسابي في الصندوق
            </h1>
            <p className="mt-1 text-sm text-on-surface-variant">
              عرض تفصيلي لمركزك في الصندوق
            </p>
          </div>
          {partner.entryDate && (
            <div className="inline-flex items-center gap-2 self-start rounded-full border border-outline-variant bg-surface-container-high px-4 py-2">
              <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
              <span className={`${CAPS} text-on-surface`}>
                تاريخ الانضمام: {partner.entryDate}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Eligibility note */}
      <div className="mb-8 flex items-start gap-3 rounded-lg border-r-4 border-primary bg-primary/10 p-4">
        <Icon name="info" className="text-primary !text-base mt-0.5" />
        <p className="text-sm leading-relaxed text-on-surface">
          يتم احتساب أرباحك فقط على الصفقات التي أُغلقت{" "}
          <span className="font-bold">بعد تاريخ انضمامك للصندوق</span> — لضمان
          عدالة التوزيع.
        </p>
      </div>

      {/* Hero — bento */}
      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Current balance (wide) */}
        <div className="glass-card relative overflow-hidden rounded-2xl p-8 lg:col-span-2">
          <div className="relative z-10">
            <p className={`${CAPS} mb-2 text-on-surface-variant`}>
              الرصيد الحالي
            </p>
            <h2 className="mb-4 font-mono text-4xl font-semibold tabular-nums text-on-surface">
              {formatCurrency(partner.currentBalance)}
            </h2>
            <div className="flex items-center gap-5">
              <div className="flex flex-col gap-0.5">
                <p className="text-xs text-on-surface-variant">
                  صافي الربح المعلق · هذه الدورة
                </p>
                <span
                  className={`font-mono text-sm font-bold tabular-nums ${
                    pendingNet >= 0 ? "text-primary" : "text-error"
                  }`}
                >
                  {pendingNet >= 0 ? "+" : ""}
                  {formatCurrency(pendingNet)}
                </span>
              </div>
              <div className="h-10 w-px bg-outline-variant" />
              <div className="flex flex-col gap-0.5">
                <p className="text-xs text-on-surface-variant">
                  رأس المال الأساسي
                </p>
                <span className="font-mono text-sm tabular-nums text-on-surface">
                  {formatCurrency(partner.baseCapital)}
                </span>
              </div>
            </div>
          </div>
          <div className="pointer-events-none absolute bottom-0 left-0 p-6 opacity-10">
            <Icon
              name="account_balance_wallet"
              className="!text-[120px] text-primary"
            />
          </div>
        </div>

        {/* Pending performance fee */}
        <div className="glass-card rounded-2xl p-8 !border-amber-400/30">
          <p className={`${CAPS} mb-2 text-on-surface-variant`}>
            {isGP ? "رسوم الأداء المحصّلة" : "رسوم الأداء المعلقة"}
          </p>
          <h2 className="mb-5 font-mono text-4xl font-semibold tabular-nums text-amber-300">
            {formatCurrency(pendingFee)}
          </h2>
          <div>
            <div className="flex items-center justify-between border-b border-outline-variant/40 py-2.5">
              <span className="text-xs text-on-surface-variant">
                النسبة التقديرية
              </span>
              <span className="font-mono text-sm tabular-nums text-on-surface">
                {feeRatePct.toFixed(0)}%
              </span>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <span className="text-xs text-on-surface-variant">
                طريقة الاحتساب
              </span>
              <span className="text-xs text-on-surface-variant">
                {isGP
                  ? "تُقيد لرأس مالك عند التسوية"
                  : "تُخصم من الربح عند التسوية"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Monthly profit log + Capital timeline */}
      <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-4">
        {/* Monthly profit log (narrow) */}
        <div className="glass-card flex flex-col rounded-2xl p-6 xl:col-span-1">
          <div className="mb-5 flex items-center justify-between">
            <h3 className="font-headline text-xl font-bold text-on-surface">
              سجل الأرباح
            </h3>
            <Icon name="calendar_month" className="text-on-surface-variant" />
          </div>
          {monthlyLog.length > 0 && (
            <div className="mb-4 flex items-baseline justify-between rounded-xl bg-surface-container-low px-4 py-3">
              <span className={`${CAPS} text-on-surface-variant`}>
                إجمالي الصافي
              </span>
              <span
                className={`font-mono text-lg font-bold tabular-nums ${
                  monthlyLogTotal >= 0 ? "text-primary" : "text-error"
                }`}
              >
                {monthlyLogTotal >= 0 ? "+" : ""}
                {formatCurrency(monthlyLogTotal)}
              </span>
            </div>
          )}
          {monthlyLog.length === 0 ? (
            <div className="py-12 text-center">
              <Icon
                name="event_busy"
                className="!text-4xl text-on-surface-variant/30 mb-2 block mx-auto"
              />
              <p className="text-sm text-on-surface-variant">
                لا توجد أرباح مسجلة بعد
              </p>
            </div>
          ) : (
            <div className="flex-1 space-y-3 overflow-y-auto pr-1">
              {monthlyLog.map((row) => (
                <div
                  key={row.key}
                  className="flex flex-col gap-1 rounded-xl bg-surface-container-low p-4 transition-colors hover:bg-surface-container-high"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-on-surface">
                      {row.label}
                    </span>
                    <span
                      className={`font-mono text-sm font-bold tabular-nums ${
                        row.net >= 0 ? "text-primary" : "text-error"
                      }`}
                    >
                      {row.net >= 0 ? "+" : ""}
                      {formatCurrency(row.net)}
                    </span>
                  </div>
                  <div className="flex justify-between text-[11px] text-on-surface-variant">
                    <span>
                      {isGP ? "إجمالي" : "قبل الرسوم"}: {formatCurrency(row.gross)}
                    </span>
                    <span>الرسوم: {formatCurrency(Math.abs(row.fee))}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Capital timeline (wide) */}
        <div className="glass-card rounded-2xl p-6 xl:col-span-3">
          <div className="mb-5 flex items-center justify-between">
            <h3 className="font-headline text-xl font-bold text-on-surface">
              الجدول الزمني لرأس المال
            </h3>
            <span className="rounded-full bg-primary/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-primary">
              {capitalTimeline.length} لقطة
            </span>
          </div>
          {capitalTimeline.length === 0 ? (
            <div className="py-12 text-center">
              <Icon
                name="timeline"
                className="!text-4xl text-on-surface-variant/30 mb-2 block mx-auto"
              />
              <p className="text-sm text-on-surface-variant">
                لا توجد لقطات مسجّلة
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {capitalTimeline.slice(0, 4).map((row, i) => {
                  const up = (row.delta ?? 0) >= 0;
                  return (
                    <div
                      key={`${row.date}-${i}`}
                      className="flex flex-col gap-2 rounded-xl border border-outline-variant p-4"
                    >
                      <span className={`${CAPS} text-on-surface-variant`}>
                        {formatSnapshotDate(row.date)}
                      </span>
                      <span className="font-mono text-sm tabular-nums text-on-surface">
                        {formatCurrency(row.balance)}
                      </span>
                      {row.delta === null ? (
                        <span className="text-[11px] text-on-surface-variant/60">
                          بداية التسجيل
                        </span>
                      ) : (
                        <div
                          className={`flex items-center gap-1 ${
                            up ? "text-primary" : "text-error"
                          }`}
                        >
                          <Icon
                            name={up ? "trending_up" : "trending_down"}
                            className="!text-sm"
                          />
                          <span className="font-mono text-xs tabular-nums">
                            {up ? "+" : ""}
                            {formatCurrency(row.delta)}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {capitalChart && (
                <svg
                  viewBox={`0 0 ${capitalChart.W} ${capitalChart.H}`}
                  preserveAspectRatio="none"
                  className="mt-6 h-28 w-full overflow-visible"
                  role="img"
                  aria-label="مخطط خطي لتطور رأس المال"
                >
                  <defs>
                    <linearGradient id="capFill" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="0%"
                        style={{
                          stopColor: "var(--color-primary)",
                          stopOpacity: 0.22,
                        }}
                      />
                      <stop
                        offset="100%"
                        style={{
                          stopColor: "var(--color-primary)",
                          stopOpacity: 0,
                        }}
                      />
                    </linearGradient>
                  </defs>
                  <path d={capitalChart.area} fill="url(#capFill)" />
                  <path
                    d={capitalChart.line}
                    fill="none"
                    strokeWidth={1.75}
                    vectorEffect="non-scaling-stroke"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    style={{ stroke: "var(--color-primary)" }}
                  />
                </svg>
              )}
              <p className="mt-3 text-[11px] leading-relaxed text-on-surface-variant/70">
                لقطات الرصيد عبر الزمن — التغيّر يعكس صافي الحركة في الفترة
                (إيداع / سحب / تثبيت مجمّعة). الحركات المفصّلة في «كشف الحساب»
                أدناه.
              </p>
            </>
          )}
        </div>
      </div>

      {/* Active options */}
      <div className="glass-card mb-6 overflow-hidden rounded-2xl p-6">
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <h3 className="font-headline text-xl font-bold text-on-surface">
            العقود النشطة
          </h3>
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-bold uppercase text-primary">
            {optionPositions.length} عقد
          </span>
          {isGP ? (
            <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2.5 py-0.5 text-[10px] font-bold uppercase text-amber-300">
              GP · حصة إجمالية
            </span>
          ) : (
            <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[10px] font-bold uppercase text-primary">
              LP · صافي بعد الرسوم {feeRatePct.toFixed(0)}٪
            </span>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-right">
            <thead>
              <tr className={`${CAPS} border-b border-outline-variant text-on-surface-variant`}>
                <th className="px-3 py-3 font-bold">الرمز</th>
                <th className="px-3 py-3 font-bold">الاستراتيجية</th>
                <th className="px-3 py-3 font-bold">التنفيذ · الانتهاء</th>
                <th className="px-3 py-3 font-bold">الأسهم المعرضة</th>
                <th className="px-3 py-3 font-bold">النقد المؤمّن</th>
                <th className="px-3 py-3 font-bold">صافي البريميوم</th>
                <th className="px-3 py-3 font-bold">ربح/خسارة غير محققة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/30">
              {optionPositions.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center">
                    <Icon
                      name="layers_clear"
                      className="!text-4xl text-on-surface-variant/30 mb-2 block mx-auto"
                    />
                    <p className="text-sm text-on-surface-variant">
                      لا توجد عقود نشطة
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
                    className="transition-colors hover:bg-surface-container-high"
                  >
                    <td className="px-3 py-3 font-mono text-sm font-bold text-on-surface">
                      {opt.ticker}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`text-xs font-semibold ${
                          isPut ? "text-error" : "text-primary"
                        }`}
                      >
                        {label.ar}
                      </span>
                    </td>
                    <td className="px-3 py-3 font-mono text-sm tabular-nums text-on-surface">
                      ${opt.strike.toLocaleString()}{" "}
                      <span className="text-on-surface-variant/70">
                        / {formatExpiry(opt.expiration)}
                      </span>
                    </td>
                    <td className="px-3 py-3 font-mono text-sm tabular-nums text-on-surface">
                      {opt.partnerShareExposure.toFixed(2)}
                    </td>
                    <td className="px-3 py-3 font-mono text-sm tabular-nums text-on-surface">
                      {formatCurrency(opt.partnerLockedCollateral)}
                    </td>
                    <td className="px-3 py-3 font-mono text-sm font-bold tabular-nums text-primary">
                      {formatCurrency(opt.partnerNetPremium)}
                    </td>
                    <td className="px-3 py-3 font-mono">
                      <div className="flex flex-col gap-0.5">
                        <span
                          className={`text-sm font-bold tabular-nums ${
                            pnlPositive ? "text-primary" : "text-error"
                          }`}
                        >
                          {pnlPositive ? "+" : ""}
                          {formatCurrency(opt.partnerNetUnrealized)}
                        </span>
                        {opt.spot !== null ? (
                          <span className="text-[10px] tabular-nums text-on-surface-variant/60">
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

      {/* Holdings + Account statement */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Holdings */}
        <div className="glass-card rounded-2xl p-6">
          <div className="mb-5 flex items-center justify-between">
            <h3 className="font-headline text-xl font-bold text-on-surface">
              الأصول المملوكة
            </h3>
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-bold uppercase text-primary">
              {stockPositions.length} سهم
            </span>
          </div>
          {stockPositions.length === 0 ? (
            <div className="py-12 text-center">
              <Icon
                name="layers_clear"
                className="!text-4xl text-on-surface-variant/30 mb-2 block mx-auto"
              />
              <p className="text-sm text-on-surface-variant">
                لا توجد أسهم نشطة
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {stockPositions.map((stk) => {
                const hasLive = stk.currentPrice !== null;
                const pnlPositive = stk.partnerUnrealized >= 0;
                return (
                  <div
                    key={stk.id}
                    className="flex items-center justify-between rounded-xl border border-outline-variant/40 bg-surface-container-low p-4"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 font-mono text-xs font-bold text-primary">
                        {stk.ticker}
                      </div>
                      <div>
                        <p className="font-mono text-sm tabular-nums text-on-surface">
                          {stk.partnerQuantity.toFixed(2)} سهم
                        </p>
                        <p className="font-mono text-[11px] tabular-nums text-on-surface-variant">
                          ${stk.purchasePrice.toFixed(2)}
                          {hasLive && (
                            <> → ${stk.currentPrice!.toFixed(2)}</>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="text-left">
                      <p className="font-mono text-sm tabular-nums text-on-surface">
                        {formatCurrency(stk.partnerMarketValue)}
                      </p>
                      {hasLive ? (
                        <p
                          className={`font-mono text-[11px] tabular-nums ${
                            pnlPositive ? "text-primary" : "text-error"
                          }`}
                        >
                          {pnlPositive ? "+" : ""}
                          {formatCurrency(stk.partnerUnrealized)} (
                          {pnlPositive ? "+" : ""}
                          {stk.unrealizedPct.toFixed(1)}%)
                        </p>
                      ) : (
                        <p className="text-[10px] text-on-surface-variant/40">
                          لا يوجد سعر مرجعي
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Account statement */}
        <div className="glass-card rounded-2xl p-6">
          <h3 className="mb-5 font-headline text-xl font-bold text-on-surface">
            كشف الحساب
          </h3>
          <TransactionList
            transactions={transactions}
            loading={txLoading}
            exportFilename={`statement-${partner.code || partner.name}.csv`}
            maxHeightClass="max-h-[420px]"
          />
        </div>
      </div>
    </div>
  );
}

export default function PartnerDetailPage() {
  return (
    <AppShell>
      <Suspense
        fallback={
          <div className="py-24 text-center text-on-surface-variant text-sm">
            جاري التحميل...
          </div>
        }
      >
        <PartnerDetailInner />
      </Suspense>
    </AppShell>
  );
}
