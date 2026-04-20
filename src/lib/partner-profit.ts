import type { Partner } from "@/types";

// Legacy default fee rate. The GP/LP logic now reads each partner's
// own managementFeeRate, but this constant is still exported for
// consumers (like the dashboard) that want a fallback assumption.
export const MANAGEMENT_FEE_RATE = 0.2;

export interface PartnerProfit {
  ownershipPct: number; // 0–100
  grossProfit: number; // organic share of fund profit, before fees
  feeAmount: number; // absolute $ — what an LP paid, or what the GP collected
  isManager: boolean; // true if this partner is the General Partner
  netProfit: number; // what the partner actually earns, after fee flow
  returnPct: number; // netProfit / totalDeposits * 100
}

function isManagerPartner(p: Partner): boolean {
  return p.isAdmin === true || p.name?.trim() === "المدير";
}

// Fund-wide GP/LP profit distribution.
//
// 1. Gross per partner = fundGrossProfit * (ownership% / 100)
// 2. LPs pay managementFeeRate% of their gross as a fee. The fee is
//    subtracted from their net.
// 3. The Manager (first partner matching isAdmin === true OR name
//    === "المدير") pays nothing and instead collects the sum of all
//    LP fees on top of their own organic gross.
//
// Because fees are a zero-sum transfer from LPs to the GP, the sum of
// all netProfit values equals fundGrossProfit.
export function computePartnerProfits(
  partners: Partner[],
  totalAssets: number,
  fundGrossProfit: number
): Record<string, PartnerProfit> {
  const managerId = partners.find(isManagerPartner)?.id ?? null;

  // Pass 1 — organic gross profits + each LP's fee.
  const grossById: Record<string, number> = {};
  const lpFeeById: Record<string, number> = {};
  let totalLpFees = 0;

  for (const p of partners) {
    const ownershipPct =
      totalAssets > 0 ? (p.currentBalance / totalAssets) * 100 : 0;
    const grossProfit = fundGrossProfit * (ownershipPct / 100);
    grossById[p.id] = grossProfit;

    if (p.id !== managerId) {
      const feeRate = (Number(p.managementFeeRate) || 0) / 100;
      const feePaid = grossProfit * feeRate;
      lpFeeById[p.id] = feePaid;
      totalLpFees += feePaid;
    }
  }

  // Pass 2 — final PartnerProfit per partner.
  const result: Record<string, PartnerProfit> = {};
  for (const p of partners) {
    const ownershipPct =
      totalAssets > 0 ? (p.currentBalance / totalAssets) * 100 : 0;
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
