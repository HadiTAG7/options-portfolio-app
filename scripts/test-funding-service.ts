// Integration test for the funding-day server service against the
// Firestore EMULATOR — never a real project. Run:
//   npx firebase-tools emulators:exec --only firestore --project demo-funding \
//     "npx tsx scripts/test-funding-service.ts"
//
// Exercises the real transactions end to end: draft → preview → execute
// → idempotent re-execute → undo (byte-for-byte restore), plus the
// guards: stale version, data changed since preview, undo after a later
// change, concurrent executes — and payment tracking (installments on the
// draft and the executed day, never touching the version or the books).
import assert from "node:assert/strict";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  addPayment,
  cancelDraft,
  createDraft,
  removePayment,
  saveDraft,
  previewRound,
  executeRound,
  undoRound,
  FundingError,
} from "@/lib/server/funding-service";
import { paymentItemsFor, paymentProgress, roundSavings } from "@/lib/funding-round";
import { mapFundState } from "@/lib/server/fund-state";
import { computePartnerDistributionFromTrades } from "@/lib/partner-profit";

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("✗ FIRESTORE_EMULATOR_HOST not set — refusing to run against a real project.");
  process.exit(1);
}
initializeApp({ projectId: "demo-funding" });
const db: Firestore = getFirestore();
const UID = "gp-uid";

async function wipe() {
  for (const c of ["partners", "trades", "transactions", "operations", "monthly_profits", "funding_rounds"]) {
    const snap = await db.collection(c).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
}

// Raw documents shaped exactly like production (field names as stored).
const seedPartners: Record<string, Record<string, unknown>> = {
  gp: { name: "هادي", isAdmin: true, managementFeePercent: 0, currentBalance: 200000, total_balance: 200000, totalDeposits: 200000, baseCapital: 200000, totalWithdrawals: 0, gpFeesAccrued: 1200, profitTakenGross: 0, last_settlement_date: "2026-09-01T00:00:00.000Z", entry_date: "2026-01-01", balanceHistory: [{ date: "2026-01-01", balance: 200000 }], archived_at: null },
  a: { name: "تيسير", isAdmin: false, managementFeePercent: 20, currentBalance: 120000, total_balance: 120000, totalDeposits: 120000, baseCapital: 120000, totalWithdrawals: 0, gpFeesAccrued: 0, profitTakenGross: 0, last_settlement_date: "2026-09-01T00:00:00.000Z", entry_date: "2026-01-01", balanceHistory: [{ date: "2026-01-01", balance: 120000 }], archived_at: null },
  b: { name: "علي", isAdmin: false, managementFeePercent: 20, currentBalance: 80000, total_balance: 80000, totalDeposits: 80000, baseCapital: 80000, totalWithdrawals: 500, gpFeesAccrued: 0, profitTakenGross: 300, last_settlement_date: "2026-09-01T00:00:00.000Z", entry_date: "2026-01-01", balanceHistory: [], archived_at: null },
  e: { name: "عبدالله", isAdmin: false, managementFeePercent: 20, currentBalance: 40000, total_balance: 40000, totalDeposits: 40000, baseCapital: 40000, totalWithdrawals: 0, gpFeesAccrued: 0, profitTakenGross: 0, last_settlement_date: "2026-09-01T00:00:00.000Z", entry_date: "2026-01-01", balanceHistory: [{ date: "2026-01-01", balance: 40000 }], archived_at: null },
  old: { name: "مؤرشف", isAdmin: false, managementFeePercent: 20, currentBalance: 0, total_balance: 0, totalDeposits: 0, baseCapital: 0, archived_at: "2026-05-01T00:00:00.000Z" },
};
const seedTrades: Record<string, Record<string, unknown>> = {
  t1: { ticker: "AMD", type: "Sell Put", status: "open", premium: 5, quantity: 300, strike: 50, result: 0, expiration: "2026-11-20", date: "2026-09-05", created_at: "2026-09-05T10:00:00.000Z" },
  t2: { ticker: "MSFT", type: "Sell Call", status: "closed", premium: 10, quantity: 100, strike: 400, result: 2000, expiration: "2026-09-20", date: "2026-09-10", created_at: "2026-09-10T10:00:00.000Z" },
  t3: { ticker: "NVDA", type: "Stock Sell", status: "closed", premium: 0, quantity: 100, strike: 0, result: -700, expiration: "", date: "2026-09-25", created_at: "2026-09-25T10:00:00.000Z" },
  t4: { ticker: "MRK", type: "Dividend", status: "closed", premium: 0, quantity: 100, strike: 0, result: 85, expiration: "", date: "2026-08-28", created_at: "2026-08-28T10:00:00.000Z" },
};

async function seed() {
  await wipe();
  for (const [id, d] of Object.entries(seedPartners)) await db.collection("partners").doc(id).set({ id, ...d });
  for (const [id, d] of Object.entries(seedTrades)) await db.collection("trades").doc(id).set({ id, ...d });
  // An existing frozen month and an existing, still-applied operation.
  await db.collection("monthly_profits").doc("2026-08__a").set({ id: "2026-08__a", month: "2026-08", partnerId: "a", gross: 1, fee: 0.2, net: 0.8, updated_at: "2026-09-01T00:00:00.000Z" });
  await db.collection("operations").doc("prior-op").set({ id: "prior-op", at: "2026-09-02T00:00:00.000Z", kind: "deposit", label: "إيداع", partnerIds: ["b"], snapshots: [], reversedAt: null });
}

async function partnersRaw() {
  const snap = await db.collection("partners").get();
  return Object.fromEntries(snap.docs.map((d) => [d.id, d.data()]));
}
async function count(c: string) {
  return (await db.collection(c).get()).size;
}
async function expectFundingError(p: Promise<unknown>, code: string) {
  try {
    await p;
  } catch (e) {
    assert.ok(e instanceof FundingError, `expected FundingError, got ${e}`);
    assert.equal(e.code, code, `expected code ${code}, got ${e.code}: ${e.message}`);
    return;
  }
  assert.fail(`expected FundingError ${code}`);
}

let passed = 0;
async function step(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`✓ ${name}`);
  } catch (e) {
    console.error(`✗ ${name}`);
    throw e;
  }
}

async function main() {
  await seed();
  const originalPartners = await partnersRaw();
  let roundId = "";
  let version = 0;

  await step("create + save a draft (versioned)", async () => {
    const r = await createDraft(db, UID, 3.735);
    roundId = r.id;
    assert.equal(r.depositSarPerUsd, 3.735, "deposit rate seeded");
    assert.equal(r.withdrawSarPerUsd, 3.735, "withdrawal rate seeded");
    const again = await createDraft(db, UID, 3.735);
    assert.equal(again.id, r.id, "one open draft at a time");
    const saved = await saveDraft(db, UID, r.id, r.version, {
      requests: [
        { partnerId: "gp", kind: "withdraw", amount: 1000, currency: "USD", note: null },
        { partnerId: "e", kind: "exit", amount: null, currency: "USD", note: null },
        { partnerId: "b", kind: "deposit", amount: 7470, currency: "SAR", note: "تحويل بنكي" },
      ],
    });
    version = saved.version;
    assert.equal(version, r.version + 1);
    await expectFundingError(saveDraft(db, UID, r.id, r.version, { plannedDate: "2026-10-20" }), "version");
  });

  let fingerprint = "";
  await step("preview is read-only and deterministic", async () => {
    const before = await count("transactions");
    const p1 = await previewRound(db, roundId);
    const p2 = await previewRound(db, roundId);
    assert.deepEqual(p1.plan.errors, []);
    assert.equal(p1.fingerprint, p2.fingerprint);
    assert.equal(await count("transactions"), before, "preview wrote nothing");
    fingerprint = p1.fingerprint;
    const archived = p1.plan.lines.find((l) => l.partnerId === "old");
    assert.equal(archived, undefined, "archived partner excluded");
  });

  await step("execute commits everything atomically", async () => {
    const res = await executeRound(db, UID, roundId, version, fingerprint);
    assert.equal(res.alreadyExecuted, false);
    assert.equal(res.round.status, "executed");
    const plan = res.plan!;
    assert.equal(await count("transactions"), plan.ledger.length);
    const op = (await db.collection("operations").doc(res.round.opId!).get()).data()!;
    assert.equal(op.kind, "funding_day");
    assert.ok((op.priorOpIds as string[]).includes("prior-op"), "prior op locked");
    assert.equal((op.snapshots as unknown[]).length, plan.lines.length);
    // freezes: completed months only, the existing entry untouched
    const aug = (await db.collection("monthly_profits").doc("2026-08__a").get()).data()!;
    assert.equal(aug.net, 0.8, "existing freeze not overwritten");
    for (const id of op.frozenMonthlyIds as string[]) assert.ok(id < "2026-10", `freeze ${id} is a completed month`);
    // the engine, re-run on what is now stored, finds nothing pending
    const [p, t, m] = await Promise.all(["partners", "trades", "monthly_profits"].map((c) => db.collection(c).get()));
    const state = mapFundState(p.docs, t.docs, m.docs);
    const dist = computePartnerDistributionFromTrades(state.partners, state.trades);
    for (const id of Object.keys(dist)) {
      assert.ok(Math.abs(dist[id].settleableNet) < 1e-6, `${id} has nothing pending`);
    }
    const exited = state.partners.find((x) => x.id === "e")!;
    assert.equal(exited.totalDeposits, 0, "exit zeroed");
    const ali = state.partners.find((x) => x.id === "b")!;
    assert.ok(Math.abs(ali.totalDeposits - (80000 + plan.lines.find((l) => l.partnerId === "b")!.capitalized + 2000)) < 1e-6, "SAR deposit booked at 2000 USD");
  });

  await step("re-executing is idempotent", async () => {
    const opsBefore = await count("operations");
    const res = await executeRound(db, UID, roundId, version, fingerprint);
    assert.equal(res.alreadyExecuted, true);
    assert.equal(await count("operations"), opsBefore, "no second operation");
  });

  await step("undo restores every partner byte-for-byte", async () => {
    const reverted = await undoRound(db, UID, roundId);
    assert.equal(reverted.status, "reverted");
    const now = await partnersRaw();
    for (const id of ["gp", "a", "b", "e"]) {
      const o = originalPartners[id];
      const n = now[id];
      for (const k of ["currentBalance", "total_balance", "totalDeposits", "totalWithdrawals", "baseCapital", "last_settlement_date", "profitTakenGross", "gpFeesAccrued"]) {
        assert.deepEqual(n[k] ?? null, o[k] ?? null, `${id}.${k}`);
      }
      assert.deepEqual(n.balanceHistory ?? [], o.balanceHistory ?? [], `${id}.balanceHistory`);
    }
    assert.equal(await count("transactions"), 0, "ledger rows removed");
    const aug = (await db.collection("monthly_profits").doc("2026-08__a").get()).data()!;
    assert.equal(aug.net, 0.8, "pre-existing freeze kept");
    assert.equal(await count("monthly_profits"), 1, "only the day's own freezes removed");
    await expectFundingError(undoRound(db, UID, roundId), "not_executed");
  });

  await step("data changed since preview → 409, nothing written", async () => {
    await seed();
    const r = await createDraft(db, UID, 3.735);
    const saved = await saveDraft(db, UID, r.id, r.version, {
      requests: [{ partnerId: "a", kind: "withdraw", amount: 500, currency: "USD", note: null }],
    });
    const prev = await previewRound(db, r.id);
    await db.collection("trades").doc("t9").set({ id: "t9", ticker: "TSLA", type: "Stock Sell", status: "closed", result: 333, date: "2026-10-01", created_at: "2026-10-01T10:00:00.000Z" });
    await expectFundingError(executeRound(db, UID, r.id, saved.version, prev.fingerprint), "fingerprint");
    assert.equal(await count("transactions"), 0);
    assert.equal(await count("operations"), 1, "only the seeded prior op");
  });

  await step("undo refuses after a later change to a partner", async () => {
    await seed();
    const r = await createDraft(db, UID, 3.735);
    const saved = await saveDraft(db, UID, r.id, r.version, { requests: [] });
    const prev = await previewRound(db, r.id);
    await executeRound(db, UID, r.id, saved.version, prev.fingerprint);
    await db.collection("partners").doc("a").update({ currentBalance: 999999 }); // a later write
    await expectFundingError(undoRound(db, UID, r.id), "partner_changed");
  });

  await step("concurrent executes produce exactly one operation", async () => {
    await seed();
    const r = await createDraft(db, UID, 3.735);
    const saved = await saveDraft(db, UID, r.id, r.version, {
      requests: [{ partnerId: "b", kind: "deposit", amount: 1000, currency: "USD", note: null }],
    });
    const prev = await previewRound(db, r.id);
    const results = await Promise.allSettled([
      executeRound(db, UID, r.id, saved.version, prev.fingerprint),
      executeRound(db, UID, r.id, saved.version, prev.fingerprint),
    ]);
    const ok = results.filter((x) => x.status === "fulfilled");
    assert.ok(ok.length >= 1, "at least one succeeded");
    const funding = (await db.collection("operations").get()).docs.filter((d) => d.data().kind === "funding_day");
    assert.equal(funding.length, 1, "exactly one funding operation");
  });

  await step("a legacy round with one sarPerUsd still plans, same rate both ways", async () => {
    await seed();
    const now = new Date().toISOString();
    await db.collection("funding_rounds").doc("legacy").set({
      id: "legacy", status: "draft", version: 1, plannedDate: null, sarPerUsd: 3.75, brokerCashUsd: null,
      requests: [
        { partnerId: "b", kind: "deposit", amount: 3_750, currency: "SAR", note: null },
        { partnerId: "a", kind: "withdraw", amount: 3_750, currency: "SAR", note: null },
      ],
      createdAt: now, createdBy: UID, updatedAt: now, updatedBy: UID,
      executedAt: null, ledgerDate: null, opId: null, fingerprint: null, summary: null, revertedAt: null,
    });
    const prev = await previewRound(db, "legacy");
    assert.deepEqual(prev.plan.errors, []);
    assert.ok(Math.abs(prev.plan.lines.find((l) => l.partnerId === "b")!.deposit - 1_000) < 1e-9, "deposit at 3.75");
    assert.ok(Math.abs(prev.plan.lines.find((l) => l.partnerId === "a")!.cashOut - 1_000) < 1e-9, "withdrawal at 3.75");
    assert.ok(Math.abs(prev.plan.totals.fxSpreadSar) < 1e-9, "one rate → no spread");
  });

  await step("two rates: stored, executed, and seeded into the next round", async () => {
    await seed();
    const r = await createDraft(db, UID, 3.735);
    const saved = await saveDraft(db, UID, r.id, r.version, {
      depositSarPerUsd: 3.7575,
      withdrawSarPerUsd: 3.7425,
      requests: [
        { partnerId: "b", kind: "deposit", amount: 37_575, currency: "SAR", note: null },
        { partnerId: "a", kind: "withdraw", amount: 37_425, currency: "SAR", note: null },
      ],
    });
    assert.equal(saved.depositSarPerUsd, 3.7575);
    assert.equal(saved.withdrawSarPerUsd, 3.7425);
    const prev = await previewRound(db, r.id);
    assert.ok(Math.abs(prev.plan.totals.fxSpreadSar - 150) < 1e-6, "150 ر.س spread");
    const res = await executeRound(db, UID, r.id, saved.version, prev.fingerprint);
    assert.ok(Math.abs((res.round.summary!.totals.fxSpreadSar ?? 0) - 150) < 1e-6, "spread kept in the round summary");
    const ledger = (await db.collection("transactions").get()).docs.map((d) => d.data());
    const spreadRows = ledger.filter((x) => String(x.note).includes("فرق"));
    assert.equal(spreadRows.length, 0, "the spread is NOT booked in the fund's ledger");
    const next = await createDraft(db, UID, 3.735);
    assert.equal(next.depositSarPerUsd, 3.7575, "next round starts from the last deposit rate");
    assert.equal(next.withdrawSarPerUsd, 3.7425, "next round starts from the last withdrawal rate");
  });

  let payRoundId = "";
  let payVersion = 0;
  await step("payments on a draft: recorded, currency fixed by party, version untouched", async () => {
    await seed();
    const r = await createDraft(db, UID, 3.735);
    const saved = await saveDraft(db, UID, r.id, r.version, {
      requests: [
        { partnerId: "b", kind: "deposit", amount: 7470, currency: "SAR", note: null },
        { partnerId: "a", kind: "withdraw", amount: 500, currency: "USD", note: null },
      ],
    });
    payRoundId = r.id;
    const p1 = await addPayment(db, UID, r.id, { party: "b", amount: 3000, date: "2026-11-10", note: "دفعة أولى" });
    assert.equal(p1.payments!.length, 1);
    assert.equal(p1.payments![0].currency, "SAR", "a riyal request is paid in riyals");
    assert.equal(p1.payments![0].createdBy, UID);
    assert.equal(p1.paymentsRev, 1);
    assert.equal(p1.version, saved.version, "recording a payment never bumps the draft version");
    const p2 = await addPayment(db, UID, r.id, { party: "broker", amount: 100, date: "2026-11-10", note: null });
    assert.equal(p2.payments![1].currency, "USD", "the broker side is in dollars");
    await expectFundingError(addPayment(db, UID, r.id, { party: "e", amount: 1, date: "2026-11-10", note: null }), "bad_party");
    await expectFundingError(addPayment(db, UID, r.id, { party: "nobody", amount: 1, date: "2026-11-10", note: null }), "bad_party");
    await expectFundingError(addPayment(db, UID, "missing", { party: "b", amount: 1, date: "2026-11-10", note: null }), "not_found");
    // the autosave still works with the version it holds, and keeps payments
    const resaved = await saveDraft(db, UID, r.id, saved.version, { plannedDate: "2026-11-20" });
    assert.equal(resaved.payments!.length, 2, "a draft save keeps the recorded payments");
    payVersion = resaved.version;
    assert.equal(await count("transactions"), 0, "payments never touch the ledger");
  });

  await step("concurrent payments all survive; removal is exact", async () => {
    await Promise.all([
      addPayment(db, UID, payRoundId, { party: "a", amount: 100, date: "2026-11-11", note: null }),
      addPayment(db, UID, payRoundId, { party: "a", amount: 150, date: "2026-11-11", note: null }),
      addPayment(db, UID, payRoundId, { party: "a", amount: 250, date: "2026-11-12", note: null }),
    ]);
    const doc = (await db.collection("funding_rounds").doc(payRoundId).get()).data()!;
    assert.equal(doc.payments.length, 5, "no concurrent payment lost");
    assert.equal(doc.paymentsRev, 5);
    const victim = doc.payments.find((p: { amount: number }) => p.amount === 150).id as string;
    const after = await removePayment(db, payRoundId, victim);
    assert.equal(after.payments!.length, 4);
    assert.ok(!after.payments!.some((p) => p.id === victim));
    assert.equal(after.paymentsRev, 6, "removal bumps the payments revision");
    assert.equal(after.version, payVersion, "…but not the draft version");
    await expectFundingError(removePayment(db, payRoundId, victim), "payment_not_found");
  });

  await step("payments carry through execution and keep tracking afterwards", async () => {
    const prev = await previewRound(db, payRoundId);
    assert.deepEqual(prev.plan.errors, []);
    const res = await executeRound(db, UID, payRoundId, payVersion, prev.fingerprint);
    assert.equal(res.round.status, "executed");
    assert.equal(res.round.payments!.length, 4, "draft payments carried into the executed day");
    const more = await addPayment(db, UID, payRoundId, { party: "b", amount: 4470, date: "2026-11-13", note: "الباقي" });
    assert.equal(more.payments!.at(-1)!.currency, "SAR", "currency from the executed line");
    await expectFundingError(addPayment(db, UID, payRoundId, { party: "gp", amount: 1, date: "2026-11-13", note: null }), "bad_party");
    const s = more.summary!;
    const pr = Object.fromEntries(paymentProgress(paymentItemsFor(s.totals, s.lines), more.payments).map((p) => [p.party, p]));
    assert.equal(pr.b.expected, 7470, "expected = the riyals the partner sends");
    assert.equal(pr.b.complete, true, "3000 + 4470 riyals = complete");
    assert.equal(pr.a.paid, 350);
    assert.ok(Math.abs(pr.a.remaining - 150) < 1e-9, "500 − 350 = 150 left to pay");
    assert.equal(pr.broker.paid, 100);
  });

  await step("reverted and cancelled rounds refuse payments", async () => {
    await undoRound(db, UID, payRoundId);
    await expectFundingError(addPayment(db, UID, payRoundId, { party: "b", amount: 1, date: "2026-11-14", note: null }), "not_payable");
    const kept = (await db.collection("funding_rounds").doc(payRoundId).get()).data()!;
    await expectFundingError(removePayment(db, payRoundId, kept.payments[0].id), "not_payable");
    assert.equal(kept.payments.length, 5, "an undone day keeps its payment record");
    const d = await createDraft(db, UID, 3.735);
    await saveDraft(db, UID, d.id, d.version, {
      requests: [{ partnerId: "a", kind: "withdraw", amount: 10, currency: "USD", note: null }],
    });
    await cancelDraft(db, UID, d.id);
    await expectFundingError(addPayment(db, UID, d.id, { party: "a", amount: 1, date: "2026-11-14", note: null }), "not_payable");
  });

  await step("transfer fees: saved on the draft, kept through execution, seeded into the next round", async () => {
    await seed();
    const r = await createDraft(db, UID, 3.75);
    assert.equal(r.transferFees, undefined, "no fees until the GP enters them");
    const saved = await saveDraft(db, UID, r.id, r.version, {
      depositSarPerUsd: 3.75,
      withdrawSarPerUsd: 3.75,
      transferFees: { deposit: { amount: 25, currency: "SAR" }, withdraw: { amount: 10, currency: "USD" } },
      requests: [
        { partnerId: "a", kind: "deposit", amount: 3000, currency: "USD", note: null },
        { partnerId: "b", kind: "deposit", amount: 2000, currency: "USD", note: null },
        { partnerId: "e", kind: "withdraw", amount: 1000, currency: "USD", note: null },
      ],
    });
    const prev = await previewRound(db, r.id);
    assert.deepEqual(prev.plan.errors, []);
    const res = await executeRound(db, UID, r.id, saved.version, prev.fingerprint);
    assert.deepEqual(res.round.transferFees, saved.transferFees, "fees kept on the executed day");
    const sv = roundSavings(res.round)!;
    assert.equal(sv.transfersAvoided, 2, "3 transfers became 1");
    assert.ok(Math.abs(sv.feesSavedUsd - (25 / 3.75 + 10)) < 1e-9, "one deposit fee + one withdrawal fee saved");
    assert.equal(await count("transactions"), prev.plan.ledger.length, "fees never reach the ledger");
    const next = await createDraft(db, UID, 3.75);
    assert.deepEqual(next.transferFees, saved.transferFees, "the next round starts with the same fees");
  });

  console.log(`\n✓ ${passed} integration steps passed (emulator)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
