import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Partner } from "@/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function safeNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function formatCurrency(amount: number | null | undefined): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safeNumber(amount));
}

export function formatCompactCurrency(amount: number | null | undefined): string {
  const v = safeNumber(amount);
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return formatCurrency(v);
}

export function formatWholeNumber(amount: number | null | undefined): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(safeNumber(amount));
}

export function formatPercent(
  value: number | null | undefined,
  fractionDigits = 2
): string {
  const v = safeNumber(value);
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(fractionDigits)}%`;
}

export function formatNumber(value: number | null | undefined): string {
  return new Intl.NumberFormat("en-US").format(safeNumber(value));
}

// Canonical "Investment" value for a partner. Reads straight from
// the partner record with no extra math — both the deposit and
// withdrawal dialogs, and the distribution engine's `investment`
// field, must pick from this same function so they never drift.
export function getPartnerInvestment(partner: Partner): number {
  return (
    safeNumber(partner.totalDeposits) ||
    safeNumber(partner.baseCapital) ||
    safeNumber(partner.currentBalance)
  );
}
