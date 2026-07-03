import type { Partner, Trade } from "@/types";
import { getPartnerInvestment } from "@/lib/utils";

// Legacy default fee rate. The GP/LP logic reads each partner's own
// managementFeeRate, but this constant is still exported for consumers
// (like the dashboard) that want a fallback assumption.
export const MANAGEMENT_FEE_RATE = 0.2;

export interface PartnerProfit {
  ownershipPct: number; // 0–100 — of current fund capital
  grossProfit: number; // sum of eligible per-trade shares, before fees
  feeAmount: number; // absolute $ — what an LP paid, or what the GP collected
  isManager: boolean; // true if this partner is the General Partner
  netProfit: number; // what the partner actually earns, after fee flow
  returnPct: number; // netProfit / totalDeposits * 100
}

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
//   1. Entry-date:    partner joined on or before the trade resolved (closeDate)
//   2. Settlement:    profit was recorded strictly AFTER the last capitalization
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
  closeDate: string,
  profitDate: string,
  recordedAt?: string | null
): boolean {
  const entry = partner.entryDate?.trim();
  if (entry && entry > closeDate) return false;
  const settlement = partner.lastSettlementDate?.trim();
  if (settlement) {
    const profitStamp = recordedAt?.trim() || profitDate;
    if (new Date(profitStamp) <= new Date(settlement)) return false;
  }
  return true;
}

// Distribute realized profit trade-by-trade with entry-date eligibility,
// then apply the GP/LP fee flow.
//
// For each trade:
//   1. Pick partners where entry_date <= trade close_date.
//   2. Weight each eligible partner by their **investment** share of
//      the total committed capital (totalDeposits / Σ totalDeposits).
//   3. Accumulate the weighted profit into per-partner grossProfit.
//
// Ownership is intentionally based on Investment (totalDeposits), not
// currentBalance, so two partners with the same money in get the same
// share regardless of small balance drift from withdrawals or pending
// profit accrual.
//
// Then:
//   - LPs pay managementFeeRate% of their gross as a fee.
//   - The Manager pays nothing and collects the sum of all LP fees.
//
// Fees are a zero-sum transfer from LPs to the GP, so summing netProfit
// across all partners equals the sum of all eligible trade profits.
export function computePartnerProfits(
  partners: Partner[],
  trades: Trade[]
): Record<string, PartnerProfit> {
  const managerId = partners.find(isManagerPartner)?.id ?? null;

  const grossById: Record<string, number> = {};
  for (const p of partners) grossById[p.id] = 0;

  // Investment-weighted ownership: same Investment ⇒ same share.
  const totalInvestment = partners.reduce(
    (sum, p) => sum + getPartnerInvestment(p),
    0
  );

  for (const t of trades) {
    const profit = tradeProfit(t);
    if (profit === 0) continue;

    const closeDate = tradeCloseDate(t);
    if (!closeDate) continue;
    const profitDate = tradeProfitDate(t) ?? closeDate;

    if (totalInvestment <= 0) continue;

    for (const p of partners) {
      if (!isEligible(p, closeDate, profitDate, t.createdAt)) continue;
      const share = getPartnerInvestment(p) / totalInvestment;
      grossById[p.id] += profit * share;
    }
  }

  const lpFeeById: Record<string, number> = {};
  let totalLpFees = 0;
  for (const p of partners) {
    if (p.id === managerId) continue;
    const feeRate = (Number(p.managementFeeRate) || 0) / 100;
    const fee = grossById[p.id] * feeRate;
    lpFeeById[p.id] = fee;
    totalLpFees += fee;
  }

  const result: Record<string, PartnerProfit> = {};
  for (const p of partners) {
    const ownershipPct =
      totalInvestment > 0
        ? (getPartnerInvestment(p) / totalInvestment) * 100
        : 0;
    const grossProfit = grossById[p.id];
    const isManager = p.id === managerId;

    let feeAmount: number;
    let netProfit: number;
    if (isManager) {
      feeAmount = totalLpFees;
      netProfit = grossProfit + totalLpFees;
    } else {
      feeAmount = lpFeeById[p.id] ?? 0;
      netProfit = grossProfit - feeAmount;
    }

    const denom = Number(p.totalDeposits) || 0;
    const returnPct = denom > 0 ? (netProfit / denom) * 100 : 0;

    result[p.id] = {
      ownershipPct,
      grossProfit,
      feeAmount,
      isManager,
      netProfit,
      returnPct,
    };
  }

  return result;
}

// Current-cycle profit: unsettled earnings still sitting on top of a
// partner's invested basis. After "تثبيت الأرباح" (capitalize) runs,
// totalDeposits == currentBalance, so gross reduces to $0 by design.
//
// Unlike computePartnerProfits (which sums every eligible trade for
// an all-time view), this pays no attention to historical trades — it
// reads live equity vs. deposits, so the Partners Table always
// reflects "what the partner could withdraw right now as profit".
export function computeCurrentCycleProfits(
  partners: Partner[]
): Record<string, PartnerProfit> {
  const managerId = partners.find(isManagerPartner)?.id ?? null;

  const grossById: Record<string, number> = {};
  for (const p of partners) {
    const equity = Number(p.currentBalance) || 0;
    const basis = Number(p.totalDeposits) || 0;
    grossById[p.id] = equity - basis;
  }

  const lpFeeById: Record<string, number> = {};
  let totalLpFees = 0;
  for (const p of partners) {
    if (p.id === managerId) continue;
    const feeRate = (Number(p.managementFeeRate) || 0) / 100;
    // Fees only accrue on positive profit — losses don't refund fees
    const gross = grossById[p.id];
    const fee = gross > 0 ? gross * feeRate : 0;
    lpFeeById[p.id] = fee;
    totalLpFees += fee;
  }

  const totalInvestment = partners.reduce(
    (sum, p) => sum + getPartnerInvestment(p),
    0
  );

  const result: Record<string, PartnerProfit> = {};
  for (const p of partners) {
    const ownershipPct =
      totalInvestment > 0
        ? (getPartnerInvestment(p) / totalInvestment) * 100
        : 0;
    const grossProfit = grossById[p.id];
    const isManager = p.id === managerId;

    let feeAmount: number;
    let netProfit: number;
    if (isManager) {
      feeAmount = totalLpFees;
      netProfit = grossProfit + totalLpFees;
    } else {
      feeAmount = lpFeeById[p.id] ?? 0;
      netProfit = grossProfit - feeAmount;
    }

    const denom = Number(p.totalDeposits) || 0;
    const returnPct = denom > 0 ? (netProfit / denom) * 100 : 0;

    result[p.id] = {
      ownershipPct,
      grossProfit,
      feeAmount,
      isManager,
      netProfit,
      returnPct,
    };
  }

  return result;
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

    const closeDate = tradeCloseDate(t);
    if (!closeDate) continue;
    const profitDate = tradeProfitDate(t) ?? closeDate;

    if (totalInvestment <= 0) continue;

    for (const p of partners) {
      if (!isEligible(p, closeDate, profitDate, t.createdAt)) continue;
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

// Total GP fee collected from LPs only (the GP pays no fee on their own share).
// Mirrors the fee loop inside computePortfolioDistribution but returns a single
// number for use in summary cards and the monthly ledger.
export function computeGpFeeTotal(
  partners: Partner[],
  totalProfit: number
): number {
  if (totalProfit <= 0) return 0;
  const managerId = partners.find(isManagerPartner)?.id ?? null;
  const totalInvestment = partners.reduce(
    (sum, p) => sum + getPartnerInvestment(p),
    0
  );
  if (totalInvestment <= 0) return 0;
  return partners.reduce((sum, p) => {
    if (p.id === managerId) return sum;
    const ownership = getPartnerInvestment(p) / totalInvestment;
    const feeRate = (Number(p.managementFeeRate) || 0) / 100;
    return sum + ownership * totalProfit * feeRate;
  }, 0);
}
