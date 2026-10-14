// Invariant tests for the funding-day planner (src/lib/funding-day.ts).
// Pure — touches no database. Run: npx tsx scripts/test-funding-day.ts
//
// The planner decides real money movements, so beyond fixed examples this
// checks fund-wide invariants over hundreds of random request mixes:
//   • each partner's equity after = before − cash out + cash in
//   • nothing is left pending after the day (engine re-run → 0)
//   • every LP fee lands in the GP pot exactly once
//   • the ledger rows reconcile to the balance changes
import assert from "node:assert/strict";
import type { Partner, Trade } from "@/types";
import {
  planFundingDay,
  fingerprintPlan,
  applyPlanToPartners,
  toUsd,
  type FundingRequest,
  type FundingPlan,
} from "@/lib/funding-day";
import { computePartnerDistributionFromTrades } from "@/lib/partner-profit";
import { getPartnerInvestment } from "@/lib/utils";

let passed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    passed++;
  } catch (e) {
    console.error(`✗ ${name}`);
    throw e;
  }
}
const near = (a: number, b: number, tol: number, msg: string) =>
  assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (tol ${tol})`);

// ── Fixtures ─────────────────────────────────────────────────────────
function partner(p: Partial<Partner> & { id: string; name: string }): Partner {
  const inv = p.totalDeposits ?? 0;
  return {
    code: "",
    initials: "",
    totalBalance: p.currentBalance ?? inv,
    ownershipPercentage: 0,
    managementFeeRate: 20,
    performance24h: 0,
    performanceTrend: "up",
    joinedAt: "2026-01-01",
    entryDate: "2026-01-01",
    lastSettlementDate: "2026-09-01T00:00:00.000Z",
    isAdmin: false,
    totalWithdrawals: 0,
    currentBalance: inv,
    totalNetProfit: 0,
    managementFeesPaid: 0,
    baseCapital: inv,
    balanceHistory: [{ date: "2026-01-01", balance: inv }],
    archivedAt: null,
    email: null,
    gpFeesAccrued: 0,
    profitTakenGross: 0,
    ...p,
    totalDeposits: inv,
  } as Partner;
}
function trade(t: Partial<Trade> & { id: string }): Trade {
  return {
    ticker: "TEST",
    type: "Stock Sell",
    quantity: 100,
    premium: 0,
    strike: 0,
    result: 0,
    expiration: "",
    date: "2026-09-10",
    status: "closed",
    autoClosed: false,
    createdAt: null,
    ...t,
  } as Trade;
}

const NOW = new Date("2026-10-14T09:00:00.000Z");

const basePartners: Partner[] = [
  partner({ id: "gp", name: "هادي", isAdmin: true, managementFeeRate: 0, totalDeposits: 200_000, gpFeesAccrued: 1_200 }),
  partner({ id: "a", name: "تيسير", totalDeposits: 120_000 }),
  partner({ id: "b", name: "علي", totalDeposits: 80_000, profitTakenGross: 500 }),
  partner({ id: "c", name: "نور", totalDeposits: 50_000, managementFeeRate: 25, lastSettlementDate: "2026-08-01T00:00:00.000Z" }),
  partner({ id: "d", name: "رائد", totalDeposits: 30_000, currentBalance: 30_000.03 }),
  partner({ id: "e", name: "عبدالله", totalDeposits: 40_000, entryDate: "2026-09-20", lastSettlementDate: null }),
];
const baseTrades: Trade[] = [
  trade({ id: "t1", type: "Sell Put", status: "open", premium: 5, quantity: 300, strike: 50, expiration: "2026-11-20", date: "2026-09-05", createdAt: "2026-09-05T10:00:00.000Z" }),
  trade({ id: "t2", type: "Sell Call", result: 2_000, date: "2026-09-10", createdAt: "2026-09-10T10:00:00.000Z" }),
  trade({ id: "t3", type: "Stock Sell", result: -3_000, date: "2026-09-25", createdAt: "2026-09-25T10:00:00.000Z" }),
  trade({ id: "t4", type: "Dividend", result: 85, date: "2026-09-28", createdAt: "2026-09-28T10:00:00.000Z" }),
  trade({ id: "t5", type: "Buy Close", result: -400, date: "2026-10-02", createdAt: "2026-10-02T10:00:00.000Z" }),
  trade({ id: "t6", type: "Stock Sell", result: 1_000, date: "2026-08-15", createdAt: "2026-08-15T10:00:00.000Z" }),
  trade({ id: "t7", type: "Stock Sell", result: 700, date: "2026-09-12", createdAt: null }),
  trade({ id: "t8", type: "Sell Call", result: 9_000, date: "2026-09-02", createdAt: "2026-09-02T10:00:00.000Z" }),
];

function equityById(partners: Partner[], trades: Trade[]): Record<string, number> {
  const dist = computePartnerDistributionFromTrades(partners, trades);
  const out: Record<string, number> = {};
  for (const p of partners) out[p.id] = getPartnerInvestment(p) + dist[p.id].netProfit;
  return out;
}

function run(reqs: FundingRequest[], partners = basePartners, trades = baseTrades, extra: Partial<Parameters<typeof planFundingDay>[0]> = {}): FundingPlan {
  return planFundingDay({ partners, trades, requests: reqs, depositSarPerUsd: 3.735, withdrawSarPerUsd: 3.735, now: NOW, ...extra });
}

function assertInvariants(plan: FundingPlan, partners: Partner[], trades: Trade[], label: string) {
  assert.deepEqual(plan.errors, [], `${label}: unexpected errors`);
  const before = equityById(partners, trades);
  const afterPartners = applyPlanToPartners(partners, plan);
  const afterDist = computePartnerDistributionFromTrades(afterPartners, trades);
  const after = equityById(afterPartners, trades);
  const pre = computePartnerDistributionFromTrades(partners, trades);
  let feeSum = 0;
  for (const p of partners) if (!p.isAdmin) feeSum += pre[p.id].feeAmount;

  for (const l of plan.lines) {
    // 1. conservation per partner (an emptied account may drop ≤ ½ cent)
    near(after[l.partnerId], before[l.partnerId] - l.cashOut + l.cashIn, l.investmentAfter === 0 ? 0.0051 : 1e-6, `${label} equity ${l.name}`);
    // 2. nothing pending afterwards
    near(afterDist[l.partnerId].settleableNet, 0, 1e-9, `${label} pending after ${l.name}`);
    near(afterDist[l.partnerId].grossProfit, 0, 1e-9, `${label} gross after ${l.name}`);
    // 3. no negative capital; emptied accounts zero all four columns
    assert.ok(l.investmentAfter >= 0, `${label} negative investment ${l.name}`);
    if (l.investmentAfter === 0) {
      assert.equal(l.after.currentBalance, 0);
      assert.equal(l.after.total_balance, 0);
      assert.equal(l.after.baseCapital, 0);
      assert.equal(l.after.totalDeposits, 0);
    }
    // 4. ledger reconciles to the line's cash
    const rows = plan.ledger.filter((r) => r.investorId === l.partnerId && r.relatedPartnerId === null);
    const sum = (t: string) => rows.filter((r) => r.type === t).reduce((s, r) => s + r.amount, 0);
    near(sum("Withdrawal"), l.cashOut, 0.015, `${label} withdrawal rows ${l.name}`);
    near(sum("Deposit"), l.cashIn, 0.005, `${label} deposit rows ${l.name}`);
    near(sum("Capitalize"), l.capitalized, 0.005, `${label} capitalize rows ${l.name}`);
    // 5. settlement stamped for everyone at the same instant
    assert.equal(l.after.last_settlement_date, plan.settlementAt);
    assert.equal(l.after.profitTakenGross, 0);
  }
  // 6. fees: rows sum to engine fees, pot accounting closes
  const feeRows = plan.ledger.filter((r) => r.type === "Fee").reduce((s, r) => s + r.amount, 0);
  near(feeRows, feeSum, 0.005 * plan.lines.length, `${label} fee rows`);
  const gpLine = plan.lines.find((l) => l.isManager)!;
  near(gpLine.potAfter, gpLine.potBefore + feeSum - gpLine.potPaid, 1e-9, `${label} pot`);
  near(afterDist[gpLine.partnerId].netProfit, gpLine.potAfter, 1e-9, `${label} GP net after = pot`);
  // 7. broker totals
  near(plan.totals.net, plan.totals.deposits - plan.totals.withdrawals, 1e-9, `${label} net`);
  near(plan.totals.transferAvoided, 2 * Math.min(plan.totals.deposits, plan.totals.withdrawals), 1e-9, `${label} avoided`);
  // 8. fund-wide: total equity moves by exactly D − W
  const tb = Object.values(before).reduce((s, v) => s + v, 0);
  const ta = Object.values(after).reduce((s, v) => s + v, 0);
  near(ta, tb + plan.totals.deposits - plan.totals.withdrawals, 0.0051 * plan.lines.length, `${label} fund equity`);
}

// ── Fixed scenarios ─────────────────────────────────────────────────
check("no requests: everyone capitalized, invariants hold", () => {
  const plan = run([]);
  assertInvariants(plan, basePartners, baseTrades, "no-requests");
  assert.equal(plan.totals.brokerAction, "none");
});

check("the GP's example: Hadi 1000, Abdullah exits, Ali deposits 2000", () => {
  const reqs: FundingRequest[] = [
    { partnerId: "gp", kind: "withdraw", amount: 1_000, currency: "USD", note: null },
    { partnerId: "e", kind: "exit", amount: null, currency: "USD", note: null },
    { partnerId: "b", kind: "deposit", amount: 2_000, currency: "USD", note: null },
  ];
  const plan = run(reqs);
  assertInvariants(plan, basePartners, baseTrades, "example");
  const e = plan.lines.find((l) => l.partnerId === "e")!;
  assert.ok(e.exits, "Abdullah exits");
  assert.equal(e.investmentAfter, 0);
  assert.equal(plan.totals.brokerAction, "withdraw");
  near(plan.totals.deposits, 2_000, 1e-9, "deposits");
});

check("GP withdraw_profits = own profit + whole pot (floored to cents)", () => {
  const pre = computePartnerDistributionFromTrades(basePartners, baseTrades);
  const plan = run([{ partnerId: "gp", kind: "withdraw_profits", amount: null, currency: "USD", note: null }]);
  assertInvariants(plan, basePartners, baseTrades, "gp-profits");
  const gp = plan.lines.find((l) => l.isManager)!;
  near(gp.cashOut, pre.gp.netProfit, 0.02, "GP takes his whole net");
  assert.ok(gp.cashOut <= pre.gp.netProfit + 1e-9, "never pays more than owed");
});

check("LP withdraw_profits pays the cycle net, never more", () => {
  const pre = computePartnerDistributionFromTrades(basePartners, baseTrades);
  const plan = run([{ partnerId: "a", kind: "withdraw_profits", amount: null, currency: "USD", note: null }]);
  assertInvariants(plan, basePartners, baseTrades, "lp-profits");
  const a = plan.lines.find((l) => l.partnerId === "a")!;
  assert.ok(a.profitPaid <= pre.a.settleableNet + 1e-9);
  near(a.profitPaid, pre.a.settleableNet, 0.01, "paid ≈ pending");
  assert.ok(a.capitalized >= 0 && a.capitalized < 0.01, "only the sub-cent stays");
});

check("partial withdrawal: profit first, remainder of profit capitalized", () => {
  const pre = computePartnerDistributionFromTrades(basePartners, baseTrades);
  const plan = run([{ partnerId: "a", kind: "withdraw", amount: 100, currency: "USD", note: null }]);
  assertInvariants(plan, basePartners, baseTrades, "partial");
  const a = plan.lines.find((l) => l.partnerId === "a")!;
  near(a.profitPaid, 100, 1e-9, "from profit");
  near(a.capitalized, pre.a.settleableNet - 100, 1e-9, "rest capitalized");
  assert.equal(a.capitalWithdrawn, 0);
});

check("withdrawal beyond profit eats capital", () => {
  const pre = computePartnerDistributionFromTrades(basePartners, baseTrades);
  const plan = run([{ partnerId: "a", kind: "withdraw", amount: 50_000, currency: "USD", note: null }]);
  assertInvariants(plan, basePartners, baseTrades, "capital");
  const a = plan.lines.find((l) => l.partnerId === "a")!;
  near(a.capitalWithdrawn, 50_000 - pre.a.settleableNet, 1e-6, "capital part");
});

check("over-withdrawal is an error", () => {
  const plan = run([{ partnerId: "a", kind: "withdraw", amount: 10_000_000, currency: "USD", note: null }]);
  assert.ok(plan.errors.length > 0);
});

check("duplicate request, GP exit, bad amount are errors", () => {
  assert.ok(run([
    { partnerId: "a", kind: "deposit", amount: 1, currency: "USD", note: null },
    { partnerId: "a", kind: "deposit", amount: 2, currency: "USD", note: null },
  ]).errors.length > 0, "duplicate");
  assert.ok(run([{ partnerId: "gp", kind: "exit", amount: null, currency: "USD", note: null }]).errors.length > 0, "gp exit");
  assert.ok(run([{ partnerId: "a", kind: "deposit", amount: 0, currency: "USD", note: null }]).errors.length > 0, "zero");
  assert.ok(run([{ partnerId: "zz", kind: "deposit", amount: 5, currency: "USD", note: null }]).errors.length > 0, "unknown");
});

check("SAR deposit converts at the round rate and keeps the typed riyals", () => {
  near(toUsd(37_350, "SAR", 3.735), 10_000, 1e-9, "conversion");
  const plan = run([{ partnerId: "b", kind: "deposit", amount: 37_350, currency: "SAR", note: null }]);
  assertInvariants(plan, basePartners, baseTrades, "sar");
  const b = plan.lines.find((l) => l.partnerId === "b")!;
  near(b.deposit, 10_000, 1e-9, "booked USD");
  near(b.cashInCurrency, 37_350, 1e-9, "riyals received");
  assert.ok(plan.ledger.some((r) => r.type === "Deposit" && r.note.includes("37,350.00 ر.س")), "note keeps SAR");
  near(plan.totals.sarIn, 37_350, 1e-9, "sarIn");
});

check("SAR netting: FX needed is only the riyal difference", () => {
  const plan = run([
    { partnerId: "b", kind: "deposit", amount: 7_470, currency: "SAR", note: null },
    { partnerId: "a", kind: "withdraw", amount: 3_735, currency: "SAR", note: null },
  ]);
  assertInvariants(plan, basePartners, baseTrades, "fx");
  near(plan.totals.fxNeededSar, 3_735, 1e-9, "net riyals");
  near(plan.totals.fxAvoidedSar, 7_470, 1e-9, "avoided riyals");
  near(plan.totals.fxSpreadSar, 0, 1e-9, "one rate → no spread");
});

check("losing cycle is booked into capital, fee 0", () => {
  const trades = [...baseTrades, trade({ id: "big-loss", result: -200_000, date: "2026-10-05", createdAt: "2026-10-05T10:00:00.000Z" })];
  const plan = run([], basePartners, trades);
  assertInvariants(plan, basePartners, trades, "loss");
  const a = plan.lines.find((l) => l.partnerId === "a")!;
  assert.ok(a.capitalized < 0, "loss booked");
  assert.equal(a.fee, 0);
  assert.ok(plan.ledger.some((r) => r.type === "Capitalize" && r.amount < 0), "negative Capitalize row");
  assert.ok(plan.warnings.some((w) => w.includes("خاسرة")), "loss warned");
});

check("drifted balance: the drift is preserved, not moved", () => {
  const plan = run([]);
  const d = plan.lines.find((l) => l.partnerId === "d")!;
  near(d.after.currentBalance - d.after.totalDeposits, 0.03, 1e-9, "drift kept");
  assert.ok(plan.warnings.some((w) => w.includes("رائد")), "drift warned");
});

check("stamp guards: future trade stamp or future settlement blocks", () => {
  const future = [...baseTrades, trade({ id: "fut", result: 10, createdAt: "2026-10-15T09:00:00.000Z" })];
  assert.ok(run([], basePartners, future).errors.length > 0, "future trade");
  const ps = basePartners.map((p) => (p.id === "a" ? { ...p, lastSettlementDate: "2026-10-14T23:59:59.999Z" } : p));
  assert.ok(run([], ps).errors.length > 0, "future settlement");
});

check("S is after every included trade and every prior settlement", () => {
  const plan = run([]);
  const S = new Date(plan.settlementAt).getTime();
  for (const t of baseTrades) {
    if (!plan.includedTradeIds.includes(t.id)) continue;
    const ms = new Date(t.createdAt || t.date).getTime();
    assert.ok(ms < S, `trade ${t.id} before S`);
  }
  assert.ok(S >= NOW.getTime());
  assert.equal(plan.ledgerDate, "2026-10-14");
});

check("freezes: completed months only, never overwrite, skip zeros", () => {
  const plan = run([], basePartners, baseTrades, { existingMonthlyKeys: new Set(["2026-09__a"]) });
  assert.ok(plan.freezes.length > 0);
  for (const f of plan.freezes) {
    assert.ok(f.month < "2026-10", `month ${f.month} completed`);
    assert.notEqual(f.id, "2026-09__a", "existing kept");
    assert.ok(Math.abs(f.gross) >= 0.005 || Math.abs(f.net) >= 0.005);
  }
  assert.equal(run([]).freezes.length, 0, "no keys given → no freezes");
});

check("fingerprint: stable under reordering, sensitive to a cent", () => {
  const reqs: FundingRequest[] = [{ partnerId: "a", kind: "withdraw", amount: 1_000, currency: "USD", note: null }];
  const f1 = fingerprintPlan(run(reqs), "r1", 3, 3.735, 3.735);
  const f2 = fingerprintPlan(run(reqs, [...basePartners].reverse(), [...baseTrades].reverse()), "r1", 3, 3.735, 3.735);
  assert.equal(f1, f2, "order-independent");
  const f3 = fingerprintPlan(run([{ ...reqs[0], amount: 1_000.01 }]), "r1", 3, 3.735, 3.735);
  assert.notEqual(f1, f3, "a cent changes it");
  assert.notEqual(f1, fingerprintPlan(run(reqs), "r1", 4, 3.735, 3.735), "version changes it");
  const moreTrades = [...baseTrades, trade({ id: "t9", result: 50, createdAt: "2026-10-10T10:00:00.000Z" })];
  assert.notEqual(f1, fingerprintPlan(run(reqs, basePartners, moreTrades), "r1", 3, 3.735, 3.735), "new trade changes it");
});

check("no pending + deposit matches the store's deposit arithmetic", () => {
  // Everyone settled after the last trade → nothing pending.
  const settled = basePartners.map((p) => ({ ...p, lastSettlementDate: "2026-10-13T00:00:00.000Z", profitTakenGross: 0, entryDate: "2026-01-01" }));
  const plan = run([{ partnerId: "a", kind: "deposit", amount: 5_000, currency: "USD", note: null }], settled);
  assertInvariants(plan, settled, baseTrades, "parity");
  const a = plan.lines.find((l) => l.partnerId === "a")!;
  const p = settled.find((x) => x.id === "a")!;
  near(a.after.totalDeposits, p.totalDeposits + 5_000, 1e-9, "totalDeposits");
  near(a.after.currentBalance, p.currentBalance + 5_000, 1e-9, "currentBalance");
  assert.equal(plan.ledger.filter((r) => r.investorId === "a").length, 1, "one Deposit row only");
});

// ── Two rates: deposit vs withdrawal ────────────────────────────────
const RD = 3.7575;
const RW = 3.7425;
const settledAll = basePartners.map((p) => ({ ...p, lastSettlementDate: "2026-10-13T00:00:00.000Z", profitTakenGross: 0, entryDate: "2026-01-01" }));

check("the GP's example: 37,575 ر.س in at 3.7575, $10,000 out at 3.7425 → 150 ر.س spread", () => {
  const plan = run(
    [
      { partnerId: "b", kind: "deposit", amount: 37_575, currency: "SAR", note: null },
      { partnerId: "gp", kind: "withdraw", amount: 37_425, currency: "SAR", note: null },
    ],
    settledAll,
    baseTrades,
    { depositSarPerUsd: RD, withdrawSarPerUsd: RW }
  );
  assertInvariants(plan, settledAll, baseTrades, "spread-example");
  const ali = plan.lines.find((l) => l.partnerId === "b")!;
  const hadi = plan.lines.find((l) => l.partnerId === "gp")!;
  near(ali.deposit, 10_000, 1e-9, "Ali booked $10,000");
  near(hadi.cashOut, 10_000, 1e-9, "Hadi booked $10,000");
  near(hadi.cashOutCurrency, 37_425, 1e-9, "Hadi receives the typed riyals");
  assert.equal(plan.totals.brokerAction, "none", "nothing crosses the broker");
  near(plan.totals.fxSpreadSar, 150, 1e-6, "150 ر.س stay with the GP");
  near(plan.totals.fxSpreadUsd, 37_425 * (1 / RW - 1 / RD), 1e-9, "spread in USD");
  near(plan.totals.fxSpreadUsd, 39.92, 0.005, "≈ $39.92");
});

check("each direction converts and is noted at its own rate", () => {
  const plan = run(
    [
      { partnerId: "b", kind: "deposit", amount: 3_757.5, currency: "SAR", note: null },
      { partnerId: "a", kind: "withdraw", amount: 3_742.5, currency: "SAR", note: null },
    ],
    settledAll,
    baseTrades,
    { depositSarPerUsd: RD, withdrawSarPerUsd: RW }
  );
  assertInvariants(plan, settledAll, baseTrades, "directions");
  near(plan.lines.find((l) => l.partnerId === "b")!.deposit, 1_000, 1e-9, "deposit at rd");
  near(plan.lines.find((l) => l.partnerId === "a")!.cashOut, 1_000, 1e-9, "withdrawal at rw");
  assert.ok(plan.ledger.some((r) => r.type === "Deposit" && r.note.includes(`بسعر ${RD}`)), "deposit note rd");
  assert.ok(plan.ledger.some((r) => r.type === "Withdrawal" && r.note.includes(`بسعر ${RW}`)), "withdrawal note rw");
  assert.ok(!plan.ledger.some((r) => r.type === "Deposit" && r.note.includes(`بسعر ${RW}`)), "no rw on deposits");
});

check("computed riyal payout (all profits) converts at the withdrawal rate", () => {
  const plan = run(
    [{ partnerId: "a", kind: "withdraw_profits", amount: null, currency: "SAR", note: null }],
    basePartners,
    baseTrades,
    { depositSarPerUsd: RD, withdrawSarPerUsd: RW }
  );
  assertInvariants(plan, basePartners, baseTrades, "profits-sar");
  const a = plan.lines.find((l) => l.partnerId === "a")!;
  near(a.cashOutCurrency, Math.round(a.cashOut * RW * 100) / 100, 1e-9, "paid at rw");
});

check("inverted rates: negative spread, warned", () => {
  const plan = run(
    [
      { partnerId: "b", kind: "deposit", amount: 10_000, currency: "SAR", note: null },
      { partnerId: "a", kind: "withdraw", amount: 5_000, currency: "SAR", note: null },
    ],
    settledAll,
    baseTrades,
    { depositSarPerUsd: RW, withdrawSarPerUsd: RD }
  );
  assertInvariants(plan, settledAll, baseTrades, "inverted");
  assert.ok(plan.totals.fxSpreadSar < 0, "the GP covers it");
  assert.ok(plan.warnings.some((w) => w.includes("أقل من سعر السحب")), "warned");
});

check("fingerprint changes when either rate changes", () => {
  const reqs: FundingRequest[] = [{ partnerId: "b", kind: "deposit", amount: 37_575, currency: "SAR", note: null }];
  const base = fingerprintPlan(run(reqs, settledAll, baseTrades, { depositSarPerUsd: RD, withdrawSarPerUsd: RW }), "r", 1, RD, RW);
  assert.notEqual(base, fingerprintPlan(run(reqs, settledAll, baseTrades, { depositSarPerUsd: 3.76, withdrawSarPerUsd: RW }), "r", 1, 3.76, RW), "rd");
  assert.notEqual(base, fingerprintPlan(run(reqs, settledAll, baseTrades, { depositSarPerUsd: RD, withdrawSarPerUsd: 3.74 }), "r", 1, RD, 3.74), "rw");
});

// ── Randomized property test ────────────────────────────────────────
let seed = 20261014;
const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const kinds = ["deposit", "withdraw", "withdraw_profits", "exit", "none"] as const;
let tested = 0, skipped = 0;
check("randomized request mixes keep every invariant", () => {
  for (let i = 0; i < 400; i++) {
    const reqs: FundingRequest[] = [];
    const pre = equityById(basePartners, baseTrades);
    for (const p of basePartners) {
      const k = kinds[Math.floor(rand() * kinds.length)];
      if (k === "none") continue;
      if (k === "exit" && p.isAdmin) continue;
      const currency = rand() < 0.5 ? "SAR" : "USD";
      let amount: number | null = null;
      if (k === "deposit") amount = Math.round(rand() * 50_000 * 100) / 100 + 1;
      if (k === "withdraw") {
        const maxUsd = Math.max(1, pre[p.id] * 0.98);
        const usd = Math.round(rand() * maxUsd * 100) / 100 + 0.01;
        amount = currency === "SAR" ? Math.round(usd * 3.735 * 100) / 100 : usd;
      }
      reqs.push({ partnerId: p.id, kind: k, amount, currency, note: null });
    }
    const twoRates = i % 2 === 1;
    const plan = twoRates
      ? run(reqs, basePartners, baseTrades, { depositSarPerUsd: RD, withdrawSarPerUsd: RW })
      : run(reqs);
    if (plan.errors.length > 0) { skipped++; continue; }
    assertInvariants(plan, basePartners, baseTrades, `random#${i}${twoRates ? "/2rates" : ""}`);
    if (twoRates) assert.ok(plan.totals.fxSpreadSar >= -1e-9, "rd > rw never charges the GP");
    tested++;
  }
  console.log(`  random: tested ${tested}, skipped ${skipped}`);
});

console.log(`✓ ${passed} checks passed`);
