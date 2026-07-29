// One-off: clear the fund-wide "أرباح معلقة" DUST that trips the
// deposit warning (Clean-Slate rule) even though nobody actually has
// profit owing.
//
// WHY this and not the .mjs guess: the first attempt assumed the residual
// was balance − investment. The dry run disproved that (balance was $0.03
// BELOW investment while the card showed $0.01 pending). The pending figure
// comes from the DISTRIBUTION ENGINE: each unsettled trade contributes a
// fractional share, and many fractions that each round to $0.00 can sum to
// a cent. So this script runs the SAME engine the app runs
// (computePartnerDistributionFromTrades) and reports every partner's real
// pending net.
//
// It then does what the app's "ثبّت أرباح الجميع" does — stamps
// last_settlement_date so the engine treats prior trades as settled and
// pending resets to $0 — but ONLY if every partner's pending is dust
// (< $0.02). If anyone has real profit owing it ABORTS, so a genuine
// payout can never be silently absorbed.
//
// Safe for history: the profit log and the emailed reports use a
// settlement-blind basis (asEarnedBasis) and the frozen monthly_profits
// records, so past months are unchanged. The GP's commission pot
// (gpFeesAccrued) is untouched.
//
// DRY RUN by default; APPLY=1 writes. Env: FIREBASE_SERVICE_ACCOUNT.
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { computePartnerDistributionFromTrades } from "../src/lib/partner-profit";
import { safeNumber } from "../src/lib/utils";
import type { Partner, Trade } from "../src/types";

const { FIREBASE_SERVICE_ACCOUNT, APPLY } = process.env;
const apply = APPLY === "1";
const ok = (m: string) => console.log(`✓ ${m}`);
function fail(m: string): never {
  console.error(`✗ ${m}`);
  process.exit(1);
}

const DUST = 0.02; // anything below this is a rounding artifact

async function main(): Promise<void> {
  if (!FIREBASE_SERVICE_ACCOUNT) fail("FIREBASE_SERVICE_ACCOUNT is required");
  initializeApp({ credential: cert(JSON.parse(FIREBASE_SERVICE_ACCOUNT)) });
  const db = getFirestore();
  console.log(apply ? "MODE: APPLY" : "MODE: DRY RUN");

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const toPartner = (row: any): Partner => {
    const currentBalance =
      safeNumber(row.currentBalance) || safeNumber(row.total_balance);
    return {
      id: String(row.id),
      name: row.name,
      code: row.code ?? "",
      email: row.email ?? null,
      initials: row.initials ?? "",
      avatarUrl: row.avatar_url ?? undefined,
      totalBalance: safeNumber(row.total_balance),
      ownershipPercentage: safeNumber(row.ownership_percentage),
      managementFeeRate:
        safeNumber(row.managementFeePercent) ||
        safeNumber(row.management_fee_rate),
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
        ? row.balanceHistory
        : [],
      archivedAt: row.archived_at ?? null,
      gpFeesAccrued: safeNumber(row.gpFeesAccrued),
      profitTakenGross: safeNumber(row.profitTakenGross),
    };
  };

  const [pSnap, tSnap] = await Promise.all([
    db.collection("partners").get(),
    db.collection("trades").get(),
  ]);
  const partners: Partner[] = pSnap.docs
    .map((d) => toPartner(d.data()))
    .filter((p) => !p.archivedAt);
  const trades: Trade[] = tSnap.docs.map((d) => {
    const r = d.data();
    return {
      id: String(r.id ?? d.id),
      ticker: r.ticker,
      type: r.type,
      quantity: safeNumber(r.quantity),
      premium: safeNumber(r.premium),
      strike: safeNumber(r.strike),
      result: safeNumber(r.result),
      expiration: r.expiration ?? "",
      date: r.date,
      status: r.status ?? "open",
      autoClosed: r.autoClosed ?? false,
      createdAt: r.created_at ?? null,
    } as Trade;
  });
  /* eslint-enable @typescript-eslint/no-explicit-any */
  ok(`loaded ${partners.length} partners, ${trades.length} trades`);

  // The app's live pending figures — exactly what the cards show.
  const dist = computePartnerDistributionFromTrades(partners, trades);

  let fundPending = 0;
  const real: string[] = [];
  console.log("\nPending net per partner (live engine):");
  for (const p of partners) {
    const d = dist[p.id];
    const net = d?.netProfit ?? 0;
    fundPending += net;
    const flag = Math.abs(net) >= DUST ? "  ← REAL" : "";
    console.log(
      `  ${p.name.padEnd(18)} net=$${net.toFixed(6)} gross=$${(d?.grossProfit ?? 0).toFixed(6)} fee=$${(d?.feeAmount ?? 0).toFixed(6)}${flag}`
    );
    if (Math.abs(net) >= DUST) real.push(`${p.name} ($${net.toFixed(2)})`);
  }
  console.log(`\nfund-wide pending = $${fundPending.toFixed(6)}`);

  if (real.length > 0) {
    fail(
      `ABORT — real pending profit found for: ${real.join(", ")}. ` +
        `Settle/withdraw these properly in the app instead; this script only clears dust.`
    );
  }
  if (Math.abs(fundPending) < 0.005) {
    ok("fund-wide pending is already effectively zero — nothing to do");
    return;
  }

  console.log(
    `\nAll pending amounts are dust (< $${DUST}). ` +
      (apply ? "Stamping settlements…" : "WOULD stamp settlements:")
  );
  const stamp = new Date().toISOString();
  let n = 0;
  for (const p of partners) {
    if (apply) {
      await db
        .collection("partners")
        .doc(p.id)
        .set({ last_settlement_date: stamp }, { merge: true });
    }
    console.log(`  ${apply ? "stamped" : "would stamp"} ${p.name}`);
    n++;
  }
  console.log("──────────────────────");
  if (apply) {
    ok(`done — ${n} partner(s) settled; pending profit now $0.00`);
  } else {
    console.log(`dry run complete — ${n} partner(s) would be settled`);
  }
}

main().catch((e) => {
  console.error("✗ settle-dust failed:", e);
  process.exit(1);
});
