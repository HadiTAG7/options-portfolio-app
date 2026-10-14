import { safeNumber } from "@/lib/utils";
import type { Partner, Trade } from "@/types";
import type { PartnerRow, TradeRow } from "@/types/database";

// The ONE mapping from stored rows to the engine's Partner / Trade shapes.
// The client hooks, the partners store and the server routes all import it,
// so a figure computed in the browser and the same figure computed on the
// server start from identical inputs. Before this, four hand-kept copies
// had drifted (the email route didn't default a missing trade status to
// "open", so it would have valued such an open option at 0).

export function rowToPartner(row: PartnerRow): Partner {
  // currentBalance falls back to total_balance if the new column is empty
  const currentBalance =
    safeNumber(row.currentBalance) || safeNumber(row.total_balance);
  // Fee can be stored under either name depending on schema migrations
  const feePercent =
    safeNumber(row.managementFeePercent) || safeNumber(row.management_fee_rate);

  return {
    id: row.id,
    name: row.name,
    code: row.code ?? "",
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
    email: row.email ?? null,
    phone: row.phone ?? null,
    gpFeesAccrued: safeNumber(row.gpFeesAccrued),
    profitTakenGross: safeNumber(row.profitTakenGross),
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
    createdAt: row.created_at ?? null,
    linkedStockId: row.linked_stock_id ?? null,
    needsReview: row.needsReview === true,
    linkedTradeId: row.linked_trade_id ?? null,
  };
}

// Archived partners are excluded the way the Firestore shim excludes them:
// a row counts as active only when archived_at is absent or null.
export function isActivePartnerRow(row: { archived_at?: string | null }): boolean {
  return (row.archived_at ?? null) === null;
}
