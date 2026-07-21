// One-off repair for money operations recorded BEFORE the undo feature
// (so they have no snapshot and can't be reversed from the app).
//
// It reverses a single "withdrawal session" on one partner: the
// Withdrawal row(s) + the auto-Capitalize remainder row(s) on a given
// date, plus the GP performance-fee row that settlement credited. It
// restores the partner's capital columns, un-records the withdrawal,
// puts the partner's last_settlement_date back to the PRIOR settlement
// (recovered from the previous settling row's created_at), removes that
// day's balanceHistory snapshot, and reverses the GP fee out of the GP's
// capital (old creditGpFee poured it there). Then it deletes those
// ledger rows.
//
// SAFE BY DEFAULT: DRY_RUN=1 (the default) prints the full plan +
// verification and writes NOTHING. Re-run with DRY_RUN=0 to apply.
// Idempotent: a second real run finds no matching session and no-ops.
//
// Env:
//   FIREBASE_SERVICE_ACCOUNT   service-account JSON (existing secret)
//   PARTNER_NAME               default "علي الغانم"
//   TARGET_DATE                YYYY-MM-DD of the session, default 2026-07-21
//   DRY_RUN                    "1" (default) = preview, "0" = apply
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { computePartnerDistributionFromTrades } from "../src/lib/partner-profit";
import { getPartnerInvestment, safeNumber } from "../src/lib/utils";
import type { Partner, Trade } from "../src/types";

/* eslint-disable @typescript-eslint/no-explicit-any */

const {
  FIREBASE_SERVICE_ACCOUNT,
  PARTNER_NAME = "علي الغانم",
  TARGET_DATE = "2026-07-21",
  DRY_RUN = "1",
} = process.env;

const APPLY = DRY_RUN === "0";
const money = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const ok = (m: string) => console.log(`✓ ${m}`);
function fail(m: string): never {
  console.error(`✗ ${m}`);
  process.exit(1);
}

if (!FIREBASE_SERVICE_ACCOUNT) fail("FIREBASE_SERVICE_ACCOUNT is required");

function rowToPartner(row: any): Partner {
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
    balanceHistory: Array.isArray(row.balanceHistory) ? row.balanceHistory : [],
    archivedAt: row.archived_at ?? null,
    gpFeesAccrued: safeNumber(row.gpFeesAccrued),
    profitTakenGross: safeNumber(row.profitTakenGross),
  };
}

async function main(): Promise<void> {
  initializeApp({ credential: cert(JSON.parse(FIREBASE_SERVICE_ACCOUNT!)) });
  const db = getFirestore();

  console.log(
    `\n=== REPAIR ${APPLY ? "(APPLY — WILL WRITE)" : "(DRY RUN — no writes)"} ===`
  );
  console.log(`Partner: ${PARTNER_NAME}   Session date: ${TARGET_DATE}\n`);

  const [pSnap, tSnap, xSnap] = await Promise.all([
    db.collection("partners").get(),
    db.collection("trades").get(),
    db.collection("transactions").get(),
  ]);

  const partners: Partner[] = pSnap.docs
    .map((d) => rowToPartner({ id: d.id, ...d.data() }))
    .filter((p) => !p.archivedAt);

  const partner = partners.find(
    (p) => (p.name ?? "").trim() === PARTNER_NAME.trim()
  );
  if (!partner) {
    console.error("Partners found:", partners.map((p) => p.name).join(" | "));
    fail(`Partner "${PARTNER_NAME}" not found`);
  }
  const gp = partners.find((p) => p.isAdmin);
  if (!gp) fail("GP (isAdmin) partner not found");

  const txAll = xSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

  // The session rows on TARGET_DATE for this partner.
  const sessionWithdrawals = txAll.filter(
    (t) =>
      t.investorId === partner!.id &&
      t.type === "Withdrawal" &&
      String(t.date).startsWith(TARGET_DATE)
  );
  const sessionCapitalizes = txAll.filter(
    (t) =>
      t.investorId === partner!.id &&
      t.type === "Capitalize" &&
      String(t.date).startsWith(TARGET_DATE)
  );
  // GP fee credited by this partner's settlement that day.
  const sessionFees = txAll.filter(
    (t) =>
      t.investorId === gp!.id &&
      t.type === "Fee" &&
      t.related_partner_id === partner!.id &&
      String(t.date).startsWith(TARGET_DATE)
  );

  const wdSum = sessionWithdrawals.reduce((s, t) => s + safeNumber(t.amount), 0);
  const capSum = sessionCapitalizes.reduce((s, t) => s + safeNumber(t.amount), 0);
  const feeSum = sessionFees.reduce((s, t) => s + safeNumber(t.amount), 0);

  console.log("Rows found for this session:");
  for (const t of [...sessionWithdrawals, ...sessionCapitalizes])
    console.log(`  • ${partner!.name}: ${t.type} ${money(safeNumber(t.amount))}  — ${t.note ?? ""}  [${t.id}]`);
  for (const t of sessionFees)
    console.log(`  • ${gp!.name} (GP): Fee ${money(safeNumber(t.amount))}  — ${t.note ?? ""}  [${t.id}]`);

  if (sessionWithdrawals.length === 0 && sessionCapitalizes.length === 0) {
    ok("No matching session rows — nothing to reverse (already clean).");
    return;
  }

  // Recover the PRIOR settlement stamp: the most recent settling row
  // (Withdrawal/Capitalize) for this partner BEFORE the target date. Its
  // created_at is ~the last_settlement_date that op stamped.
  const priorSettling = txAll
    .filter(
      (t) =>
        t.investorId === partner!.id &&
        (t.type === "Withdrawal" || t.type === "Capitalize") &&
        !String(t.date).startsWith(TARGET_DATE) &&
        String(t.date) < TARGET_DATE
    )
    .sort((a, b) => String(b.created_at ?? b.date).localeCompare(String(a.created_at ?? a.date)));
  const priorStamp: string | null =
    priorSettling.length > 0
      ? String(priorSettling[0].created_at ?? `${priorSettling[0].date}T00:00:00.000Z`)
      : null;

  // Reversed partner values.
  const beforeInv = getPartnerInvestment(partner!);
  const afterPartner = {
    currentBalance: safeNumber(partner!.currentBalance) - capSum,
    total_balance: safeNumber(partner!.totalBalance) - capSum,
    totalDeposits: safeNumber(partner!.totalDeposits) - capSum,
    baseCapital: safeNumber(partner!.baseCapital) - capSum,
    totalWithdrawals: Math.max(0, safeNumber(partner!.totalWithdrawals) - wdSum),
    last_settlement_date: priorStamp,
    // Drop this day's snapshot (the withdrawal appended one).
    balanceHistory: (Array.isArray(partner!.balanceHistory)
      ? partner!.balanceHistory
      : []
    ).filter((h) => !String(h.date).startsWith(TARGET_DATE)),
  };

  const afterGp = {
    currentBalance: safeNumber(gp!.currentBalance) - feeSum,
    total_balance: safeNumber(gp!.totalBalance) - feeSum,
    totalDeposits: safeNumber(gp!.totalDeposits) - feeSum,
    baseCapital: safeNumber(gp!.baseCapital) - feeSum,
  };

  console.log(`\n${partner!.name} — BEFORE → AFTER`);
  console.log(`  Investment:     ${money(beforeInv)} → ${money(afterPartner.totalDeposits)}`);
  console.log(`  currentBalance: ${money(safeNumber(partner!.currentBalance))} → ${money(afterPartner.currentBalance)}`);
  console.log(`  totalWithdrawals:${money(safeNumber(partner!.totalWithdrawals))} → ${money(afterPartner.totalWithdrawals)}`);
  console.log(`  last_settlement:${partner!.lastSettlementDate ?? "null"} → ${afterPartner.last_settlement_date ?? "null"}`);
  console.log(`\n${gp!.name} (GP) — reverse fee ${money(feeSum)} out of capital`);
  console.log(`  currentBalance: ${money(safeNumber(gp!.currentBalance))} → ${money(afterGp.currentBalance)}`);

  // VERIFY: with the partner restored, what pending net does the engine
  // show? Should ≈ withdrawn + auto-capitalized (what was settled).
  const restoredPartners = partners.map((p) =>
    p.id === partner!.id
      ? {
          ...p,
          currentBalance: afterPartner.currentBalance,
          totalBalance: afterPartner.total_balance,
          totalDeposits: afterPartner.totalDeposits,
          baseCapital: afterPartner.baseCapital,
          totalWithdrawals: afterPartner.totalWithdrawals,
          lastSettlementDate: afterPartner.last_settlement_date,
          profitTakenGross: 0,
        }
      : p
  );
  const trades: Trade[] = tSnap.docs.map((d) => {
    const r: any = d.data();
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
  const dist = computePartnerDistributionFromTrades(restoredPartners, trades)[
    partner!.id
  ];
  const restoredPending = dist?.netProfit ?? 0;
  const expected = wdSum + capSum;
  console.log(
    `\nVERIFY restored pending net: ${money(restoredPending)}  (expected ≈ withdrawn+capitalized ${money(expected)})`
  );
  const close = Math.abs(restoredPending - expected) < Math.max(1, expected * 0.02);
  console.log(close ? "  ✓ within tolerance" : "  ⚠️ DOES NOT MATCH — review before applying");

  if (!APPLY) {
    console.log("\nDRY RUN — no changes written. Re-run with DRY_RUN=0 to apply.");
    return;
  }

  if (!close) {
    fail("Refusing to APPLY: verification mismatch. Re-check the session.");
  }

  // ---- APPLY ----
  await db.collection("partners").doc(partner!.id).update(afterPartner as any);
  if (feeSum > 0) {
    await db.collection("partners").doc(gp!.id).update(afterGp as any);
  }
  for (const t of [...sessionWithdrawals, ...sessionCapitalizes, ...sessionFees]) {
    await db.collection("transactions").doc(String(t.id)).delete();
  }
  ok(
    `Reversed session for ${partner!.name} on ${TARGET_DATE}: restored ${money(capSum)} capital, un-recorded ${money(wdSum)} withdrawal, reversed ${money(feeSum)} GP fee, deleted ${sessionWithdrawals.length + sessionCapitalizes.length + sessionFees.length} ledger rows.`
  );
}

main().catch((e) => {
  console.error("✗ repair-partner-op failed:", e);
  process.exit(1);
});
