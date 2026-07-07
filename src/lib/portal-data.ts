// Server-side helpers shared by the admin monthly-report sender and the
// investor portal routes. Keeping the partner mapping and the per-investor
// computation in ONE place guarantees the numbers an investor sees in the
// portal match the numbers in the emailed PDF.

import type { Partner, Trade } from "@/types";
import type { Database } from "@/types/database";
import { safeNumber, getPartnerInvestment } from "@/lib/utils";
import {
  computePortfolioDistribution,
  tradeProfit,
  tradeMonthKey,
} from "@/lib/partner-profit";
import type { MonthlyReportData } from "@/lib/report-pdf";

type PartnerRow = Database["public"]["Tables"]["partners"]["Row"];
type TradeRow = Database["public"]["Tables"]["trades"]["Row"];

export function rowToPartner(row: PartnerRow): Partner {
  const currentBalance =
    safeNumber(row.currentBalance) || safeNumber(row.total_balance);
  const feePercent =
    safeNumber(row.managementFeePercent) || safeNumber(row.management_fee_rate);
  return {
    id: row.id,
    name: row.name,
    code: row.code ?? "",
    email: row.email ?? null,
    initials: row.initials ?? "",
    avatarUrl: row.avatar_url ?? undefined,
    totalBalance: safeNumber(row.total_balance),
    ownershipPercentage: safeNumber(row.ownership_percentage),
    managementFeeRate: feePercent,
    performance24h: safeNumber(row.performance_24h),
    performanceTrend: row.performance_trend ?? "up",
    joinedAt: row.joined_at,
    entryDate: row.entry_date ?? null,
    lastSettlementDate: row.last_settlement_date ?? null,
    isAdmin: row.isAdmin ?? false,
    totalDeposits: safeNumber(row.totalDeposits),
    totalWithdrawals: safeNumber(row.totalWithdrawals),
    currentBalance,
    totalNetProfit: safeNumber(row.totalNetProfit),
    managementFeesPaid: safeNumber(row.managementFeesPaid),
    baseCapital: safeNumber(row.baseCapital) || currentBalance,
    balanceHistory: Array.isArray(row.balanceHistory)
      ? (row.balanceHistory as Partner["balanceHistory"])
      : [],
    archivedAt: row.archived_at ?? null,
  };
}

export function rowToTrade(row: TradeRow): Trade {
  return {
    id: row.id,
    ticker: row.ticker,
    type: row.type,
    quantity: safeNumber(row.quantity),
    premium: safeNumber(row.premium),
    strike: safeNumber(row.strike),
    result: safeNumber(row.result),
    expiration: row.expiration ?? "",
    date: row.date,
    status: row.status ?? "open",
    autoClosed: row.autoClosed ?? false,
  };
}

export function computeMonthlyBuckets(trades: Trade[]): Record<string, number> {
  const buckets: Record<string, number> = {};
  for (const t of trades) {
    const key = tradeMonthKey(t);
    if (!key) continue;
    buckets[key] = (buckets[key] ?? 0) + tradeProfit(t);
  }
  return buckets;
}

// The one true per-investor monthly computation. `partners` MUST be the full
// (non-archived) list so ownership/AUM are correct; the return value contains
// ONLY the target partner's figures, never anyone else's.
export function computeInvestorReport(
  partner: Partner,
  partners: Partner[],
  trades: Trade[],
  month: string
): MonthlyReportData {
  const buckets = computeMonthlyBuckets(trades);
  const monthProfit = buckets[month] ?? 0;

  const distribution = computePortfolioDistribution(partners, monthProfit);
  const dist = distribution[partner.id];

  const totalAUM = partners.reduce(
    (sum, p) => sum + (Number(p.currentBalance) || 0),
    0
  );
  const ownershipShare =
    totalAUM > 0 ? (Number(partner.currentBalance) || 0) / totalAUM : 0;

  const tradesInMonth = trades.filter((t) => tradeMonthKey(t) === month);
  const positions = tradesInMonth.map((t) => ({
    ticker: t.ticker,
    type: t.type,
    share: tradeProfit(t) * ownershipShare,
  }));

  const [y, m] = month.split("-");
  const periodLabel = new Date(Number(y), Number(m) - 1).toLocaleString(
    "en-US",
    { month: "long", year: "numeric" }
  );

  return {
    periodLabel,
    periodKey: month,
    partner: {
      name: partner.name,
      code: partner.code,
      ownershipPct: dist?.ownershipPct ?? 0,
    },
    partnerSummary: {
      investment: getPartnerInvestment(partner),
      grossProfit: dist?.grossProfit ?? 0,
      feeRatePct: dist?.feeRatePct ?? 0,
      feeAmount: dist?.feeAmount ?? 0,
      netProfit: dist?.netProfit ?? 0,
      returnPct: dist?.returnPct ?? 0,
      currentBalance: partner.currentBalance,
    },
    positions,
  };
}

// The investor's all-time net-profit share across EVERY trade (not month
// scoped), using the same ownership/fee split as the monthly view. Gives the
// portal a meaningful headline number even when the current month has no
// trades. `partners` must be the full non-archived list.
export function computeAllTimeNet(
  partner: Partner,
  partners: Partner[],
  trades: Trade[]
): number {
  const totalProfit = trades.reduce((sum, t) => sum + tradeProfit(t), 0);
  const distribution = computePortfolioDistribution(partners, totalProfit);
  return distribution[partner.id]?.netProfit ?? 0;
}

// The most recent YYYY-MM month that actually has trade activity, or null if
// there are none. Used so the portal opens on a month with data instead of an
// empty current month.
export function latestMonthWithData(trades: Trade[]): string | null {
  const buckets = computeMonthlyBuckets(trades);
  const keys = Object.keys(buckets);
  if (keys.length === 0) return null;
  return keys.sort().at(-1) ?? null;
}

// Find the partner linked to an authenticated investor by email (the linking
// strategy chosen for this app). Case-insensitive; ignores archived partners.
export function findPartnerByEmail(
  partners: Partner[],
  email: string
): Partner | null {
  const target = email.trim().toLowerCase();
  return (
    partners.find(
      (p) => !p.archivedAt && (p.email ?? "").trim().toLowerCase() === target
    ) ?? null
  );
}
