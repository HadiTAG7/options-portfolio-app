// Unit checks for funding-day payment tracking (installments against the
// broker transfer and each partner's deposit/payout). Run:
//   npx tsx scripts/test-funding-payments.ts
import assert from "node:assert/strict";
import {
  newerPayments,
  paymentItemsFor,
  paymentProgress,
  sanitizePayment,
  unmatchedPayments,
  type FundingPayment,
  type FundingRound,
} from "@/lib/funding-round";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`✓ ${name}`);
}

const line = (
  partnerId: string,
  o: Partial<{ cashIn: number; cashOut: number; cashInCurrency: number; cashOutCurrency: number; currency: "USD" | "SAR" }>
) => ({
  partnerId,
  cashIn: 0,
  cashOut: 0,
  cashInCurrency: 0,
  cashOutCurrency: 0,
  currency: "USD" as const,
  ...o,
});
let seq = 0;
const pay = (party: string, amount: number, currency: "USD" | "SAR", date = "2026-11-10"): FundingPayment => ({
  id: `p${++seq}`,
  party,
  amount,
  currency,
  date,
  note: null,
  createdAt: `2026-11-10T10:00:${String(seq).padStart(2, "0")}.000Z`,
  createdBy: "gp",
});

const lines = [
  line("a", { cashIn: 2000, cashInCurrency: 7470, currency: "SAR" }), // SAR deposit
  line("b", { cashOut: 614.74, cashOutCurrency: 614.74 }), // USD payout
  line("c", { cashOut: 1000, cashOutCurrency: 3742.5, currency: "SAR" }), // SAR payout
  line("d", {}), // nothing to move (settled only)
];

check("items: broker net in USD, each partner in the currency the cash moves in", () => {
  const items = paymentItemsFor({ net: 385.26, brokerAction: "deposit" }, lines);
  assert.deepEqual(items, [
    { party: "broker", expected: 385.26, currency: "USD" },
    { party: "a", expected: 7470, currency: "SAR" },
    { party: "b", expected: 614.74, currency: "USD" },
    { party: "c", expected: 3742.5, currency: "SAR" },
  ]);
});

check("items: no broker item when nothing crosses the broker; withdrawals use |net|", () => {
  assert.equal(paymentItemsFor({ net: 0, brokerAction: "none" }, []).length, 0);
  const w = paymentItemsFor({ net: -1200, brokerAction: "withdraw" }, []);
  assert.deepEqual(w, [{ party: "broker", expected: 1200, currency: "USD" }]);
});

check("progress: installments add up, remaining never negative, sorted oldest first", () => {
  const items = paymentItemsFor({ net: 385.26, brokerAction: "deposit" }, lines);
  const ps = [
    pay("a", 3000, "SAR", "2026-11-12"),
    pay("a", 2000, "SAR", "2026-11-11"),
    pay("broker", 385.26, "USD"),
    pay("b", 700, "USD"), // more than owed
  ];
  const pr = Object.fromEntries(paymentProgress(items, ps).map((p) => [p.party, p]));
  assert.equal(pr.a.paid, 5000);
  assert.ok(Math.abs(pr.a.remaining - 2470) < 1e-9);
  assert.equal(pr.a.complete, false);
  assert.deepEqual(pr.a.payments.map((p) => p.date), ["2026-11-11", "2026-11-12"], "oldest first");
  assert.equal(pr.broker.complete, true);
  assert.equal(pr.broker.remaining, 0);
  assert.equal(pr.b.complete, true);
  assert.ok(Math.abs(pr.b.overpaid - 85.26) < 1e-9, "overpayment reported, not hidden");
  assert.equal(pr.b.remaining, 0);
  assert.equal(pr.c.paid, 0);
  assert.equal(pr.c.remaining, 3742.5);
});

check("progress: a payment only counts for its own party and currency", () => {
  const items = paymentItemsFor({ net: 0, brokerAction: "none" }, lines);
  const pr = paymentProgress(items, [pay("a", 2000, "USD"), pay("c", 3742.5, "SAR")]);
  const a = pr.find((p) => p.party === "a")!;
  assert.equal(a.paid, 0, "a USD payment never counts against a SAR deposit");
  assert.equal(pr.find((p) => p.party === "c")!.complete, true);
});

check("progress: half-cent tolerance — floating sums don't leave a phantom remainder", () => {
  const items = [{ party: "x", expected: 0.3, currency: "USD" as const }];
  const pr = paymentProgress(items, [pay("x", 0.1, "USD"), pay("x", 0.2, "USD")]);
  assert.equal(pr[0].complete, true);
  assert.equal(pr[0].remaining, 0);
  assert.equal(pr[0].overpaid, 0);
  const almost = paymentProgress([{ party: "x", expected: 100, currency: "USD" }], [pay("x", 99.99, "USD")]);
  assert.equal(almost[0].complete, false, "a real cent is still owed");
});

check("progress: missing payments array is an empty list", () => {
  const pr = paymentProgress([{ party: "broker", expected: 10, currency: "USD" }], undefined);
  assert.equal(pr[0].paid, 0);
  assert.equal(pr[0].remaining, 10);
});

check("unmatched: payments whose request was removed or changed currency stay visible", () => {
  const items = paymentItemsFor({ net: 385.26, brokerAction: "deposit" }, lines);
  const gone = pay("z", 50, "USD");
  const wrongCcy = pay("a", 100, "USD");
  const ok = pay("a", 100, "SAR");
  assert.deepEqual(unmatchedPayments(items, [ok, gone, wrongCcy]).map((p) => p.id), [gone.id, wrongCcy.id]);
  assert.deepEqual(unmatchedPayments(items, undefined), []);
});

check("newerPayments: the copy with the higher revision wins; ties take the later copy", () => {
  type Copy = Pick<FundingRound, "payments" | "paymentsRev">;
  const older: Copy = { payments: [pay("a", 1, "SAR")], paymentsRev: 1 };
  const newer: Copy = { payments: [pay("a", 1, "SAR"), pay("a", 2, "SAR")], paymentsRev: 2 };
  assert.equal(newerPayments(older, newer), newer);
  assert.equal(newerPayments(newer, older), newer, "a stale save response can't roll payments back");
  const legacy: Copy = {};
  assert.equal(newerPayments(legacy, older), older);
  const tie: Copy = { payments: [], paymentsRev: 2 };
  assert.equal(newerPayments(newer, tie), tie);
});

check("sanitizePayment: accepts a well-formed payment, trims the note", () => {
  const r = sanitizePayment({ party: " a ", amount: "1500.5", date: "2026-11-10", note: "  تحويل أول  " });
  assert.ok("payment" in r);
  assert.deepEqual(r.payment, { party: "a", amount: 1500.5, date: "2026-11-10", note: "تحويل أول" });
  const n = sanitizePayment({ party: "broker", amount: 1, date: "2026-11-10", note: "   " });
  assert.ok("payment" in n && n.payment.note === null, "blank note → null");
  const long = sanitizePayment({ party: "broker", amount: 1, date: "2026-11-10", note: "x".repeat(500) });
  assert.ok("payment" in long && long.payment.note!.length === 200, "note capped at 200");
});

check("sanitizePayment: rejects bad shapes", () => {
  const bad: unknown[] = [
    null,
    "x",
    { party: "", amount: 1, date: "2026-11-10" },
    { party: "a".repeat(200), amount: 1, date: "2026-11-10" },
    { party: "a", amount: 0, date: "2026-11-10" },
    { party: "a", amount: -5, date: "2026-11-10" },
    { party: "a", amount: "abc", date: "2026-11-10" },
    { party: "a", amount: Infinity, date: "2026-11-10" },
    { party: "a", amount: 1e11, date: "2026-11-10" },
    { party: "a", amount: 1, date: "10/11/2026" },
    { party: "a", amount: 1 },
  ];
  for (const b of bad) assert.ok("error" in sanitizePayment(b), `rejected: ${JSON.stringify(b)}`);
});

console.log(`\n✓ ${passed} payment checks passed`);
