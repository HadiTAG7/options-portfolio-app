import type { Partner, Trade } from "@/types";

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

function isManagerPartner(p: Partner): boolean {
  return p.isAdmin === true || p.name?.trim() === "المدير";
}

// Realized (or upfront-collected) P&L of a trade.
// Short options: credit = premium * quantity. `quantity` already stores
// total shares, so no *100 multiplier.
function tradeProfit(t: Trade): number {
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

// A partner is eligible for a trade's profit iff they joined on or
// before the trade's close date. Partners without an entry date fall
// back to "always eligible" so legacy rows don't get silently excluded.
function isEligible(partner: Partner, closeDate: string): boolean {
  const entry = partner.entryDate?.trim();
  if (!entry) return true;
  return entry <= closeDate;
}

// Distribute realized profit trade-by-trade with entry-date eligibility,
// then apply the GP/LP fee flow.
//
// For each trade:
//   1. Pick partners where entry_date <= trade close_date.
//   2. Weight each eligible partner by their currentBalance share of
//      the eligible pool.
//   3. Accumulate the weighted profit into per-partner grossProfit.
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

  for (const t of trades) {
    const profit = tradeProfit(t);
    if (profit === 0) continue;

    const closeDate = tradeCloseDate(t);
    if (!closeDate) continue;

    const eligible = partners.filter((p) => isEligible(p, closeDate));
    const totalEligibleCapital = eligible.reduce(
      (sum, p) => sum + (Number(p.currentBalance) || 0),
      0
    );
    if (totalEligibleCapital <= 0) continue;

    for (const p of eligible) {
      const share = (Number(p.currentBalance) || 0) / totalEligibleCapital;
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

  const totalCapital = partners.reduce(
    (sum, p) => sum + (Number(p.currentBalance) || 0),
    0
  );

  const result: Record<string, PartnerProfit> = {};
  for (const p of partners) {
    const ownershipPct =
      totalCapital > 0
        ? ((Number(p.currentBalance) || 0) / totalCapital) * 100
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
