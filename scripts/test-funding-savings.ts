// Unit checks for what a funding day saves. Transfers cost nothing; the
// only saving is the currency difference on riyals that offset each other
// (never converted, so the bank's spread stays with the GP). Run:
//   npx tsx scripts/test-funding-savings.ts
import assert from "node:assert/strict";
import { planFundingDay } from "@/lib/funding-day";
import { fundingSavings, roundSavings, sanitizePatch, type FundingRound } from "@/lib/funding-round";
import { hasSavings } from "@/components/funding/savings-box";
import type { Partner } from "@/types";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`✓ ${name}`);
}
const near = (a: number, b: number, msg: string) => assert.ok(Math.abs(a - b) < 1e-6, `${msg}: ${a} ≠ ${b}`);

const partner = (id: string, capital: number, isAdmin = false) =>
  ({
    id, name: id, isAdmin, managementFeePercent: isAdmin ? 0 : 20,
    currentBalance: capital, total_balance: capital, totalDeposits: capital, baseCapital: capital,
    totalWithdrawals: 0, gpFeesAccrued: 0, profitTakenGross: 0,
    last_settlement_date: "2026-10-01T00:00:00.000Z", entry_date: "2026-01-01", balanceHistory: [], archived_at: null,
  }) as unknown as Partner;
const partners = [partner("gp", 100000, true), partner("a", 50000), partner("b", 50000), partner("c", 50000)];
const plan = (requests: Parameters<typeof planFundingDay>[0]["requests"], rd = 3.7575, rw = 3.7425) =>
  planFundingDay({ partners, trades: [], requests, depositSarPerUsd: rd, withdrawSarPerUsd: rw, now: new Date("2026-11-15T12:00:00Z"), brokerCashUsd: null });

check("riyals that offset each other: the rate difference on them is the saving", () => {
  const p = plan([
    { partnerId: "a", kind: "deposit", amount: 37575, currency: "SAR", note: null },
    { partnerId: "b", kind: "withdraw", amount: 37425, currency: "SAR", note: null },
  ]);
  assert.deepEqual(p.errors, []);
  const sv = fundingSavings(p.totals);
  near(sv.savedSar, 150, "37,575 − 37,425 riyals kept, both sides booked at $10,000");
  assert.ok(sv.savedUsd > 0, "same saving in dollars");
  near(sv.fxAvoidedSar, 2 * 37425, "riyals that never needed converting");
  assert.equal(hasSavings(sv), true);
});

check("dollar requests save nothing — transfers cost nothing", () => {
  const p = plan([
    { partnerId: "a", kind: "deposit", amount: 5000, currency: "USD", note: null },
    { partnerId: "b", kind: "withdraw", amount: 3000, currency: "USD", note: null },
  ]);
  const sv = fundingSavings(p.totals);
  assert.equal(sv.savedSar, 0);
  assert.ok(sv.volumeAvoidedUsd > 0, "netting still kept dollars off the broker");
  assert.equal(hasSavings(sv), false, "no savings box for dollar-only netting");
});

check("riyals in one direction only: nothing to offset, nothing saved", () => {
  const p = plan([
    { partnerId: "a", kind: "deposit", amount: 10000, currency: "SAR", note: null },
    { partnerId: "b", kind: "deposit", amount: 5000, currency: "SAR", note: null },
  ]);
  const sv = fundingSavings(p.totals);
  assert.equal(sv.fxAvoidedSar, 0);
  assert.equal(hasSavings(sv), false);
});

check("one rate both ways: riyals still offset, but there is no difference to count", () => {
  const p = plan(
    [
      { partnerId: "a", kind: "deposit", amount: 3750, currency: "SAR", note: null },
      { partnerId: "b", kind: "withdraw", amount: 3750, currency: "SAR", note: null },
    ],
    3.75,
    3.75
  );
  const sv = fundingSavings(p.totals);
  near(sv.savedSar, 0, "no spread");
  assert.equal(hasSavings(sv), true, "the box still shows, with the equal-rates note");
});

check("a deposit rate below the withdrawal rate is a cost, shown negative", () => {
  const sv = fundingSavings({ transferAvoided: 0, fxAvoidedSar: 7500, fxSpreadSar: -15, fxSpreadUsd: -4 });
  assert.equal(sv.savedSar, -15);
  assert.equal(sv.savedUsd, -4);
});

check("legacy totals without spread fields read as zero", () => {
  const sv = fundingSavings({ transferAvoided: 100, fxAvoidedSar: 0 });
  assert.equal(sv.savedSar, 0);
  assert.equal(sv.savedUsd, 0);
});

check("roundSavings: executed rounds only, from the stored summary", () => {
  const base = {
    id: "r", version: 3, plannedDate: null, brokerCashUsd: null, requests: [], createdAt: "", createdBy: "", updatedAt: "", updatedBy: "",
    executedAt: "2026-11-01T10:00:00.000Z", ledgerDate: "2026-11-01", opId: "op", fingerprint: "f", revertedAt: null,
    summary: { totals: { transferAvoided: 0, fxAvoidedSar: 74850, fxSpreadSar: 150, fxSpreadUsd: 40 }, lines: [] },
  } as unknown as FundingRound;
  near(roundSavings({ ...base, status: "executed" })!.savedSar, 150, "executed day");
  assert.equal(roundSavings({ ...base, status: "reverted" }), null, "an undone day saved nothing");
  assert.equal(roundSavings({ ...base, status: "draft" }), null);
});

check("the removed fee fields are not accepted from a client any more", () => {
  const r = sanitizePatch({ transferFees: { deposit: { amount: 25, currency: "SAR" }, withdraw: null } });
  assert.ok("patch" in r);
  assert.equal("transferFees" in r.patch, false);
});

console.log(`\n✓ ${passed} savings checks passed`);
