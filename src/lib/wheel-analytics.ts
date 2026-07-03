import type { Trade } from "@/types";

// Wheel-strategy analytics. Pure functions over Trade rows — no I/O.
//
// The core metric for selling cash-secured puts / covered calls is the
// ANNUALIZED RETURN ON COLLATERAL: premium collected relative to the
// cash (or stock value) locked up, scaled by how long it's locked.
// A $500 premium on $50,000 collateral is 1% — great for a week
// (~52%/yr), poor for a year.

export function isShortOption(t: Trade): boolean {
  return t.type === "Sell Put" || t.type === "Sell Call";
}

// Cash (put) or underlying value (call, approximated at strike) locked
// while the option is open. `quantity` already stores total shares.
export function optionCollateral(t: Trade): number {
  const strike = Number(t.strike) || 0;
  const qty = Number(t.quantity) || 0;
  return strike * qty;
}

// Days the collateral is committed: entry date → expiration.
// Clamped to ≥1 so same-day expiries don't divide by zero.
export function optionDays(t: Trade): number {
  const start = new Date(t.date);
  const end = new Date(t.expiration);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 1;
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  return Math.max(1, days);
}

// Annualized return on collateral, in percent. Null when the trade has
// no strike/quantity to compute against (e.g. legacy rows).
export function annualizedRoc(t: Trade): number | null {
  const collateral = optionCollateral(t);
  if (collateral <= 0) return null;
  const premium = (Number(t.premium) || 0) * (Number(t.quantity) || 0);
  const days = optionDays(t);
  return (premium / collateral) * (365 / days) * 100;
}

// Share of closed options that ended profitable. Null when there's no
// history yet (avoids a misleading "0%").
export function winRate(closedOptions: Trade[]): number | null {
  if (closedOptions.length === 0) return null;
  const winners = closedOptions.filter((t) => (Number(t.result) || 0) > 0);
  return (winners.length / closedOptions.length) * 100;
}

export interface WheelSummary {
  // Collateral currently locked by OPEN short options.
  lockedCollateral: number;
  // Collateral-weighted average annualized ROC across open options —
  // "what is my capital earning while it's locked". Null with no
  // computable positions.
  avgAnnualizedRoc: number | null;
  // Win rate over the closed-options history. Null with no history.
  winRate: number | null;
  closedCount: number;
  openCount: number;
}

export function computeWheelSummary(
  openOptions: Trade[],
  closedOptions: Trade[]
): WheelSummary {
  let lockedCollateral = 0;
  let rocWeightedSum = 0;
  let rocWeight = 0;

  for (const t of openOptions) {
    if (!isShortOption(t)) continue;
    const collateral = optionCollateral(t);
    const roc = annualizedRoc(t);
    lockedCollateral += collateral;
    if (roc !== null && collateral > 0) {
      rocWeightedSum += roc * collateral;
      rocWeight += collateral;
    }
  }

  return {
    lockedCollateral,
    avgAnnualizedRoc: rocWeight > 0 ? rocWeightedSum / rocWeight : null,
    winRate: winRate(closedOptions),
    closedCount: closedOptions.length,
    openCount: openOptions.filter(isShortOption).length,
  };
}
