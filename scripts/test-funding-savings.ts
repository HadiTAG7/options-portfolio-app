// Unit checks for what a funding day saves (transfers avoided × fees, and
// the exchange spread kept on riyals that offset each other). Run:
//   npx tsx scripts/test-funding-savings.ts
import assert from "node:assert/strict";
import { fundingSavings, roundSavings, sanitizePatch, type FundingRound } from "@/lib/funding-round";
import { hasSavings, transfersLabel } from "@/components/funding/savings-box";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`✓ ${name}`);
}
const near = (a: number, b: number, msg: string) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} ≠ ${b}`);
const rates = { rd: 3.75, rw: 3.75 };
const ins = (n: number) => Array.from({ length: n }, () => ({ cashIn: 1000, cashOut: 0 }));
const outs = (n: number) => Array.from({ length: n }, () => ({ cashIn: 0, cashOut: 400 }));
const totals = (brokerAction: "deposit" | "withdraw" | "none", o: Partial<{ transferAvoided: number; fxAvoidedSar: number; fxSpreadUsd: number; fxSpreadSar: number }> = {}) => ({
  brokerAction,
  transferAvoided: 0,
  fxAvoidedSar: 0,
  ...o,
});

check("3 deposits + 2 withdrawals netted into one deposit: 4 transfers avoided, priced per side", () => {
  const sv = fundingSavings(
    totals("deposit", { transferAvoided: 1600 }),
    [...ins(3), ...outs(2), { cashIn: 0, cashOut: 0 }],
    { deposit: { amount: 25, currency: "SAR" }, withdraw: { amount: 10, currency: "USD" } },
    rates
  );
  assert.equal(sv.depositTransfers, 3);
  assert.equal(sv.withdrawTransfers, 2);
  assert.equal(sv.transfersWith, 1);
  assert.equal(sv.transfersAvoided, 4);
  assert.equal(sv.feesSet, true);
  near(sv.feesSavedUsd, 2 * (25 / 3.75) + 2 * 10, "2 deposit fees (riyals) + 2 withdrawal fees (dollars)");
  near(sv.feesSavedSar, 2 * 25 + 2 * 10 * 3.75, "same in riyals");
  near(sv.totalUsd, sv.feesSavedUsd, "no riyals netted → fees only");
  assert.equal(sv.volumeAvoidedUsd, 1600);
});

check("perfect offset: nothing crosses the broker, every transfer avoided", () => {
  const sv = fundingSavings(totals("none"), [...ins(2), ...outs(2)], { deposit: { amount: 5, currency: "USD" }, withdraw: { amount: 5, currency: "USD" } }, rates);
  assert.equal(sv.transfersWith, 0);
  assert.equal(sv.transfersAvoided, 4);
  near(sv.feesSavedUsd, 20, "4 × $5");
});

check("a net withdrawal keeps one withdrawal fee, saves the rest", () => {
  const sv = fundingSavings(totals("withdraw"), [...ins(1), ...outs(3)], { deposit: { amount: 7, currency: "USD" }, withdraw: { amount: 10, currency: "USD" } }, rates);
  assert.equal(sv.transfersAvoided, 3);
  near(sv.feesSavedUsd, 7 + 2 * 10, "1 deposit fee + 2 of 3 withdrawal fees");
});

check("riyal fees convert at the rate of their side", () => {
  const sv = fundingSavings(totals("none"), [...ins(1), ...outs(1)], { deposit: { amount: 37.5, currency: "SAR" }, withdraw: { amount: 37.4, currency: "SAR" } }, { rd: 3.75, rw: 3.74 });
  near(sv.feesSavedUsd, 10 + 10, "37.5/3.75 + 37.4/3.74");
  near(sv.feesSavedSar, 37.5 + 37.4, "riyal fees stay exact in riyals");
});

check("no fee entered: transfers still counted, fee part flagged unknown", () => {
  const sv = fundingSavings(totals("deposit"), [...ins(2), ...outs(1)], null, rates);
  assert.equal(sv.transfersAvoided, 2);
  assert.equal(sv.feesSet, false);
  assert.equal(sv.feesSavedUsd, 0);
  const zero = fundingSavings(totals("deposit"), [...ins(2), ...outs(1)], { deposit: { amount: 0, currency: "USD" }, withdraw: null }, rates);
  assert.equal(zero.feesSet, false, "a zero fee is the same as none");
});

check("the exchange spread on netted riyals counts as saved (and a negative spread as a cost)", () => {
  const sv = fundingSavings(totals("none", { fxSpreadUsd: 40, fxSpreadSar: 150, fxAvoidedSar: 74850 }), [...ins(1), ...outs(1)], null, rates);
  near(sv.fxSavedSar, 150, "spread in riyals");
  near(sv.totalUsd, 40, "total = fx when no fee");
  near(sv.totalSar, 150, "total in riyals = the exact spread");
  assert.equal(sv.fxAvoidedSar, 74850);
  const neg = fundingSavings(totals("none", { fxSpreadUsd: -4, fxSpreadSar: -15 }), [...ins(1), ...outs(1)], { deposit: { amount: 10, currency: "USD" }, withdraw: null }, rates);
  near(neg.totalUsd, 10 - 4, "fees saved minus the spread the GP covers");
});

check("a single request saves nothing; legacy totals without spread fields read as zero", () => {
  const one = fundingSavings(totals("deposit"), ins(1), { deposit: { amount: 25, currency: "SAR" }, withdraw: null }, rates);
  assert.equal(one.transfersAvoided, 0);
  assert.equal(one.totalUsd, 0);
  assert.equal(hasSavings(one), false);
  assert.equal(hasSavings(fundingSavings(totals("none"), [], null, rates)), false);
});

check("roundSavings: executed rounds only, priced with the round's own fees and rates", () => {
  const base = {
    id: "r", version: 3, plannedDate: null, brokerCashUsd: null, requests: [], createdAt: "", createdBy: "", updatedAt: "", updatedBy: "",
    executedAt: "2026-11-01T10:00:00.000Z", ledgerDate: "2026-11-01", opId: "op", fingerprint: "f", revertedAt: null,
    depositSarPerUsd: 3.75, withdrawSarPerUsd: 3.75,
    transferFees: { deposit: { amount: 10, currency: "USD" as const }, withdraw: { amount: 10, currency: "USD" as const } },
    summary: {
      totals: { brokerAction: "deposit", transferAvoided: 800, fxAvoidedSar: 0, fxSpreadUsd: 0, fxSpreadSar: 0 },
      lines: [...ins(2), ...outs(1)].map((l, i) => ({ partnerId: `p${i}`, name: "", kind: null, currency: "USD", cashInCurrency: l.cashIn, cashOutCurrency: l.cashOut, capitalized: 0, investmentAfter: 0, exits: false, ...l })),
    },
  } as unknown as FundingRound;
  near(roundSavings({ ...base, status: "executed" })!.totalUsd, 20, "2 transfers avoided × $10");
  assert.equal(roundSavings({ ...base, status: "reverted" }), null, "an undone day saved nothing");
  assert.equal(roundSavings({ ...base, status: "draft" }), null);
});

check("sanitizePatch: transfer fees validated (amount ≥ 0, USD/SAR, null allowed)", () => {
  const ok = sanitizePatch({ transferFees: { deposit: { amount: "25", currency: "SAR" }, withdraw: null } });
  assert.ok("patch" in ok);
  assert.deepEqual(ok.patch.transferFees, { deposit: { amount: 25, currency: "SAR" }, withdraw: null });
  for (const bad of [
    { transferFees: null },
    { transferFees: "x" },
    { transferFees: { deposit: { amount: -1, currency: "USD" }, withdraw: null } },
    { transferFees: { deposit: { amount: 5, currency: "EUR" }, withdraw: null } },
    { transferFees: { deposit: null, withdraw: { amount: 1e7, currency: "USD" } } },
    { transferFees: { deposit: 5, withdraw: null } },
  ]) {
    assert.ok("error" in sanitizePatch(bad), `rejected: ${JSON.stringify(bad)}`);
  }
});

check("Arabic transfer counts read naturally", () => {
  assert.equal(transfersLabel(1), "حوالة وحدة");
  assert.equal(transfersLabel(2), "حوالتين");
  assert.equal(transfersLabel(4), "4 حوالات");
  assert.equal(transfersLabel(12), "12 حوالة");
});

console.log(`\n✓ ${passed} savings checks passed`);
