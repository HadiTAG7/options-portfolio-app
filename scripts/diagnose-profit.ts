// READ-ONLY diagnostic: for every partner, print the net-profit figure
// each surface computes, so we can see exactly where the Partners-card
// number and the detail-page numbers diverge. Writes nothing.
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import {
  computePartnerDistributionFromTrades,
  tradeMonthKey,
  monthlyPartnerNet,
} from "../src/lib/partner-profit";
import { getPartnerInvestment, safeNumber } from "../src/lib/utils";
import type { Partner, Trade } from "../src/types";

/* eslint-disable @typescript-eslint/no-explicit-any */
const { FIREBASE_SERVICE_ACCOUNT, THIS_MONTH = "2026-07" } = process.env;
if (!FIREBASE_SERVICE_ACCOUNT) {
  console.error("FIREBASE_SERVICE_ACCOUNT required");
  process.exit(1);
}
const m = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function rowToPartner(row: any): Partner {
  const currentBalance =
    safeNumber(row.currentBalance) || safeNumber(row.total_balance);
  return {
    id: String(row.id), name: row.name, code: row.code ?? "", email: row.email ?? null,
    initials: row.initials ?? "", avatarUrl: undefined,
    totalBalance: safeNumber(row.total_balance),
    ownershipPercentage: safeNumber(row.ownership_percentage),
    managementFeeRate: safeNumber(row.managementFeePercent) || safeNumber(row.management_fee_rate),
    performance24h: 0, performanceTrend: "up", joinedAt: row.joined_at,
    entryDate: row.entry_date ?? null, lastSettlementDate: row.last_settlement_date ?? null,
    isAdmin: row.isAdmin ?? false, totalDeposits: safeNumber(row.totalDeposits),
    totalWithdrawals: safeNumber(row.totalWithdrawals), currentBalance,
    totalNetProfit: safeNumber(row.totalNetProfit), managementFeesPaid: safeNumber(row.managementFeesPaid),
    baseCapital: safeNumber(row.baseCapital) || currentBalance,
    balanceHistory: Array.isArray(row.balanceHistory) ? row.balanceHistory : [],
    archivedAt: row.archived_at ?? null, gpFeesAccrued: safeNumber(row.gpFeesAccrued),
    profitTakenGross: safeNumber(row.profitTakenGross),
  };
}

async function main(): Promise<void> {
  initializeApp({ credential: cert(JSON.parse(FIREBASE_SERVICE_ACCOUNT!)) });
  const db = getFirestore();
  const [pSnap, tSnap] = await Promise.all([
    db.collection("partners").get(),
    db.collection("trades").get(),
  ]);
  const partners: Partner[] = pSnap.docs
    .map((d) => rowToPartner({ id: d.id, ...d.data() }))
    .filter((p) => !p.archivedAt);
  const trades: Trade[] = tSnap.docs.map((d) => {
    const r: any = d.data();
    return {
      id: String(r.id ?? d.id), ticker: r.ticker, type: r.type,
      quantity: safeNumber(r.quantity), premium: safeNumber(r.premium),
      strike: safeNumber(r.strike), result: safeNumber(r.result),
      expiration: r.expiration ?? "", date: r.date, status: r.status ?? "open",
      autoClosed: r.autoClosed ?? false, createdAt: r.created_at ?? null,
    } as Trade;
  });

  // CARD basis: settlement-aware, all unsettled trades (what صفحة الشركاء shows).
  const cardDist = computePartnerDistributionFromTrades(partners, trades);

  // NEW LOG basis: historical per-month (monthlyPartnerNet) — the fix.
  const months = new Set<string>();
  for (const t of trades) {
    const k = tradeMonthKey(t);
    if (k) months.add(k);
  }

  for (const p of partners) {
    const c = cardDist[p.id];
    let logSum = 0;
    let thisMonthNet = 0;
    for (const k of months) {
      const net = monthlyPartnerNet(partners, trades, p.id, k).net;
      logSum += net;
      if (k === THIS_MONTH) thisMonthNet = net;
    }
    console.log(`\n=== ${p.name} ${p.isAdmin ? "(GP)" : ""} [${p.id}] ===`);
    console.log(`  investment=${m(getPartnerInvestment(p))}  lastSettlement=${p.lastSettlementDate ?? "null"}`);
    console.log(`  CARD net = ${m(c?.netProfit ?? 0)}  |  DETAIL hero (now = card) = ${m(c?.netProfit ?? 0)}`);
    console.log(`  NEW LOG ${THIS_MONTH} net = ${m(thisMonthNet)}   |  NEW LOG lifetime = ${m(logSum)}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
