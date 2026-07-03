import type { Partner, Trade } from "@/types";
import { getPartnerInvestment } from "@/lib/utils";

// Legacy default fee rate. The GP/LP logic reads each partner's own
// managementFeeRate, but this constant is still exported for consumers
// (like the dashboard) that want a fallback assumption.
export const MANAGEMENT_FEE_RATE = 0.2;


export function isManagerPartner(p: Partner): boolean {
  return p.isAdmin === true || p.name?.trim() === "المدير";
}

// Realized (or upfront-collected) P&L of a trade.
// Short options: credit = premium * quantity. `quantity` already stores
// total shares, so no *100 multiplier.
export function tradeProfit(t: Trade): number {
  const isShortOption = t.type === "Sell Put" || t.type === "Sell Call";
  if (isShortOption && t.status === "open") {
    return Number(t.premium) * Number(t.quantity);
  }
  return Number(t.result) || 0;
}

// Eligibility cutoff for a trade:
// - Options: expiration
// - Stock sells / fallback: the trade date
function tradeCloseDate(t: Trade): string | null {
  const isOption = t.type === "Sell Put" || t.type === "Sell Call";
  const exp = t.expiration?.trim();
  if (isOption && exp) return exp;
  return t.date?.trim() || null;
}

// When was this trade's profit actually earned?
// Short options: premium collected at trade entry — always use t.date
// so the settlement comparison stays stable across open→closed.
// Other trades (Stock Sell): profit realized at close/trade date.
export function tradeProfitDate(t: Trade): string | null {
  const isShortOption = t.type === "Sell Put" || t.type === "Sell Call";
  if (isShortOption) return t.date?.trim() || null;
  return tradeCloseDate(t) ?? t.date?.trim() ?? null;
}

// Shared bucketing helper: which YYYY-MM bucket does this trade's
// profit belong to? Mirrors the eligibility profit-date logic so
// dashboard charts, monthly cards, and the email sender all agree.
// Returns null for trade types we don't bucket (anything other than
// Sell Put / Sell Call / Stock Sell).
export function tradeMonthKey(t: Trade): string | null {
  const isOption = t.type === "Sell Put" || t.type === "Sell Call";
  const isStockSell = t.type === "Stock Sell";
  if (!isOption && !isStockSell) return null;
  const dateStr = tradeProfitDate(t);
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Two checks gate per-trade eligibility:
//   1. Entry-date:    partner joined on or before the profit was EARNED
//                     (profitDate). Comparing against the option's
//                     expiration instead used to credit late joiners
//                     with premium collected before they had any money
//                     in the fund.
//   2. Settlement:    profit was recorded strictly AFTER the last
//                     capitalization.
//
// `profitDate` is the date the money was earned — for open options this is
// the trade date (when premium was collected), not the future expiration.
//
// The settlement comparison prefers `recordedAt` (trades.created_at, a full
// timestamp) over the date-only profitDate. A bare YYYY-MM-DD parses as UTC
// midnight, which made every trade dated the same day as a settlement look
// "already settled" — even one entered hours AFTER the settlement — so its
// profit silently vanished from the distribution. With created_at, same-day
// events order correctly; legacy rows (null created_at) are backfilled to
// midnight of their trade date by migration 011, preserving their historical
// behavior.
function isEligible(
  partner: Partner,
  profitDate: string,
  recordedAt?: string | null
): boolean {
  const entry = partner.entryDate?.trim();
  if (entry && entry > profitDate) return false;
  const settlement = partner.lastSettlementDate?.trim();
  if (settlement) {
    const profitStamp = recordedAt?.trim() || profitDate;
    if (new Date(profitStamp) <= new Date(settlement)) return false;
  }
  return true;
}


// Per-partner slice of a single fund-wide profit pool.
//   Investment        = money the partner put in (totalDeposits, falling
//                       back to currentBalance when deposits aren't tracked)
//   grossProfit       = ownershipPct × totalProfit  — the partner's share
//                       of the fund's combined realized + unrealized PnL
//                       before the GP/LP fee transfer
//   feeAmount         = |fee|. LPs see this as "deducted", the GP sees it
//                       as "collected". The sign is encoded by isManager.
//   netProfit         = LP: gross − fee, GP: gross + Σ(LP fees)
//   isManager         = true iff this partner is the General Partner
//                       (detected by isAdmin or legacy name "المدير")
//   returnPct         = netProfit / investment × 100
export interface PartnerDistribution {
  partnerId: string;
  investment: number;
  ownershipPct: number;
  grossProfit: number;
  feeRatePct: number;
  feeAmount: number;
  netProfit: number;
  isManager: boolean;
  returnPct: number;
  // For the GP only: which LP each collected fee came from. Empty for LPs.
  collectedFromLps: { partnerId: string; amount: number }[];
  // The amount a settlement action (تثبيت / profit withdrawal) may
  // actually move for this partner:
  //   LP: netProfit (gross − fee)
  //   GP: grossProfit ONLY — LP fees are excluded because they are
  //       credited to the GP's capital automatically when each LP
  //       settles. Letting the GP settle gross+fees would double-pay
  //       (and, since fees stay pending until LPs settle, would let
  //       the GP re-capitalize the same fees repeatedly).
  settleableNet: number;
}

// Distribute a single fund-wide profit number (`totalProfit`) across the
// partners in proportion to their currentBalance share, then apply the
// GP/LP 20% performance-fee transfer.
//
// - LP share    = ownership × totalProfit
// - LP fee      = max(0, LP share) × feeRate   ← losses don't refund fees
// - LP net      = LP share − LP fee
// - GP net      = GP share + Σ(LP fees)
//
// This is intentionally simpler than computePartnerProfits (which runs
// per-trade entry-date eligibility). Here we take a single profit total
// — matching what the user sees in the trades-page summary cards — and
// split it by today's ownership, so the Partners table reacts live to
// every price refresh and new trade.
export function computePortfolioDistribution(
  partners: Partner[],
  totalProfit: number
): Record<string, PartnerDistribution> {
  const managerId = partners.find(isManagerPartner)?.id ?? null;

  // Investment-weighted ownership: same Investment ⇒ same share.
  const totalInvestment = partners.reduce(
    (sum, p) => sum + getPartnerInvestment(p),
    0
  );

  // First pass: gross share + LP fee per partner.
  const grossById: Record<string, number> = {};
  const ownershipById: Record<string, number> = {};
  const lpFeeById: Record<string, number> = {};
  let totalLpFees = 0;

  for (const p of partners) {
    const ownership =
      totalInvestment > 0 ? getPartnerInvestment(p) / totalInvestment : 0;
    const gross = ownership * totalProfit;
    grossById[p.id] = gross;
    ownershipById[p.id] = ownership;
  }

  for (const p of partners) {
    if (p.id === managerId) continue;
    const feeRate = (Number(p.managementFeeRate) || 0) / 100;
    // Performance fee only on positive profit — losses don't generate a
    // fee refund to the LP (the GP isn't on the hook for losses).
    const gross = grossById[p.id];
    const fee = gross > 0 ? gross * feeRate : 0;
    lpFeeById[p.id] = fee;
    totalLpFees += fee;
  }

  const result: Record<string, PartnerDistribution> = {};
  for (const p of partners) {
    const isManager = p.id === managerId;
    const gross = grossById[p.id];
    const investment = getPartnerInvestment(p);
    const feeRatePct = Number(p.managementFeeRate) || 0;

    let feeAmount: number;
    let netProfit: number;
    let collectedFromLps: PartnerDistribution["collectedFromLps"] = [];
    if (isManager) {
      feeAmount = totalLpFees;
      netProfit = gross + totalLpFees;
      collectedFromLps = partners
        .filter((lp) => lp.id !== managerId && (lpFeeById[lp.id] ?? 0) > 0)
        .map((lp) => ({ partnerId: lp.id, amount: lpFeeById[lp.id] ?? 0 }));
    } else {
      feeAmount = lpFeeById[p.id] ?? 0;
      netProfit = gross - feeAmount;
    }

    const returnPct = investment > 0 ? (netProfit / investment) * 100 : 0;

    result[p.id] = {
      partnerId: p.id,
      investment,
      ownershipPct: ownershipById[p.id] * 100,
      grossProfit: gross,
      feeRatePct,
      feeAmount,
      netProfit,
      isManager,
      returnPct,
      collectedFromLps,
      settleableNet: isManager ? gross : netProfit,
    };
  }

  return result;
}

// Like computePortfolioDistribution, but profit is built trade-by-trade
// with per-partner eligibility (entry date + last settlement date).
// After a partner calls "تثبيت الأرباح" their grossProfit resets to 0
// for trades closed on or before the settlement timestamp.
export function computePartnerDistributionFromTrades(
  partners: Partner[],
  trades: Trade[]
): Record<string, PartnerDistribution> {
  const managerId = partners.find(isManagerPartner)?.id ?? null;

  const grossById: Record<string, number> = {};
  for (const p of partners) grossById[p.id] = 0;

  // Investment-weighted ownership: same Investment ⇒ same share.
  // Settled partners are still skipped from the loop; their slice
  // evaporates instead of being redistributed.
  const totalInvestment = partners.reduce(
    (sum, p) => sum + getPartnerInvestment(p),
    0
  );

  for (const t of trades) {
    const profit = tradeProfit(t);
    if (profit === 0) continue;

    const profitDate = tradeProfitDate(t);
    if (!profitDate) continue;

    if (totalInvestment <= 0) continue;

    for (const p of partners) {
      if (!isEligible(p, profitDate, t.createdAt)) continue;
      const share = getPartnerInvestment(p) / totalInvestment;
      grossById[p.id] += profit * share;
    }
  }

  const lpFeeById: Record<string, number> = {};
  let totalLpFees = 0;
  for (const p of partners) {
    if (p.id === managerId) continue;
    const feeRate = (Number(p.managementFeeRate) || 0) / 100;
    const gross = grossById[p.id];
    const fee = gross > 0 ? gross * feeRate : 0;
    lpFeeById[p.id] = fee;
    totalLpFees += fee;
  }

  const result: Record<string, PartnerDistribution> = {};
  for (const p of partners) {
    const isManager = p.id === managerId;
    const gross = grossById[p.id];
    const investment = getPartnerInvestment(p);
    const feeRatePct = Number(p.managementFeeRate) || 0;
    const ownershipPct =
      totalInvestment > 0 ? (investment / totalInvestment) * 100 : 0;

    let feeAmount: number;
    let netProfit: number;
    let collectedFromLps: PartnerDistribution["collectedFromLps"] = [];
    if (isManager) {
      feeAmount = totalLpFees;
      netProfit = gross + totalLpFees;
      collectedFromLps = partners
        .filter((lp) => lp.id !== managerId && (lpFeeById[lp.id] ?? 0) > 0)
        .map((lp) => ({ partnerId: lp.id, amount: lpFeeById[lp.id] ?? 0 }));
    } else {
      feeAmount = lpFeeById[p.id] ?? 0;
      netProfit = gross - feeAmount;
    }

    const returnPct = investment > 0 ? (netProfit / investment) * 100 : 0;

    result[p.id] = {
      partnerId: p.id,
      investment,
      ownershipPct,
      grossProfit: gross,
      feeRatePct,
      feeAmount,
      netProfit,
      isManager,
      returnPct,
      collectedFromLps,
      settleableNet: isManager ? gross : netProfit,
    };
  }

  return result;
}

export interface FundBreakdown {
  originalCapital: number;
  generatedProfit: number;
  generatedProfitPct: number;
}

export function computeFundBreakdown(
  partners: Partner[],
  totalAssets: number
): FundBreakdown {
  const originalCapital = partners.reduce(
    (sum, p) => sum + (Number(p.baseCapital) || 0),
    0
  );
  const generatedProfit = totalAssets - originalCapital;
  const generatedProfitPct =
    originalCapital > 0 ? (generatedProfit / originalCapital) * 100 : 0;
  return { originalCapital, generatedProfit, generatedProfitPct };
}

