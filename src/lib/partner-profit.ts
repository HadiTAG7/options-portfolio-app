import type { Partner } from "@/types";

// Limited partners pay a 20% management fee on gross profits.
// Net profit shown to each partner is already net of this fee.
export const MANAGEMENT_FEE_RATE = 0.2;

export interface PartnerProfit {
  ownershipPct: number; // 0–100
  grossProfit: number; // before 20% fee
  netProfit: number; // after 20% fee — this is what the partner actually earns
  returnPct: number; // netProfit / totalDeposits * 100
}

export function computePartnerProfit(
  partner: Partner,
  totalAssets: number,
  fundGrossProfit: number
): PartnerProfit {
  const ownershipPct =
    totalAssets > 0 ? (partner.currentBalance / totalAssets) * 100 : 0;
  const grossProfit = fundGrossProfit * (ownershipPct / 100);
  const netProfit = grossProfit * (1 - MANAGEMENT_FEE_RATE);
  const denom = Number(partner.totalDeposits) || 0;
  const returnPct = denom > 0 ? (netProfit / denom) * 100 : 0;
  return { ownershipPct, grossProfit, netProfit, returnPct };
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
