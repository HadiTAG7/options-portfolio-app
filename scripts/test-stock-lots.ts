// Tests for src/lib/stock-lots.ts. Run: npx tsx scripts/test-stock-lots.ts
import assert from "node:assert/strict";
import { mergeLots, addPurchase, type LotLike } from "@/lib/stock-lots";

const near = (a: number, b: number, msg: string) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} vs ${b}`);
let passed = 0;
const check = (name: string, fn: () => void) => {
  try { fn(); passed++; } catch (e) { console.error(`✗ ${name}`); throw e; }
};

const wdcA: LotLike = { id: "a", ticker: "WDC", quantity: 100, purchasePrice: 415, purchaseDate: "2026-10-16", targetSellPrice: 0 };
const wdcB: LotLike = { id: "b", ticker: "wdc", quantity: 200, purchasePrice: 410, purchaseDate: "2026-10-16", targetSellPrice: 450 };

check("the GP's WDC rows merge to 300 @ weighted average", () => {
  const m = mergeLots([wdcA, wdcB]);
  assert.equal(m.quantity, 300);
  near(m.purchasePrice, 123_500 / 300, "avg");
  near(m.quantity * m.purchasePrice, 123_500, "cost basis is exactly what was paid");
  assert.equal(Math.round(m.purchasePrice * 100) / 100, 411.67);
  assert.equal(m.survivorId, "a");
  assert.deepEqual(m.removedIds, ["b"]);
  assert.equal(m.targetSellPrice, 450, "first non-zero target kept");
  assert.equal(m.purchases.length, 2, "both buys recorded");
});

check("order of input does not matter", () => {
  const m1 = mergeLots([wdcA, wdcB]);
  const m2 = mergeLots([wdcB, wdcA]);
  assert.deepEqual(m1, m2);
});

check("oldest lot survives; position date is the first buy", () => {
  const old: LotLike = { ...wdcB, id: "z", purchaseDate: "2026-09-01" };
  const m = mergeLots([wdcA, old]);
  assert.equal(m.survivorId, "z");
  assert.equal(m.purchaseDate, "2026-09-01");
});

check("a new buy folds into the existing lot", () => {
  const m = addPurchase([wdcA], { ticker: "WDC", quantity: 200, price: 410, date: "2026-10-16" });
  assert.equal(m.survivorId, "a", "existing lot survives");
  assert.deepEqual(m.removedIds, []);
  assert.equal(m.quantity, 300);
  near(m.purchasePrice, 123_500 / 300, "avg");
});

check("a backdated buy still folds into the existing lot", () => {
  const m = addPurchase([wdcA], { ticker: "WDC", quantity: 50, price: 400, date: "2026-01-01" });
  assert.equal(m.survivorId, "a");
  assert.equal(m.purchaseDate, "2026-01-01", "position opened at the earlier buy");
  near(m.purchasePrice, (100 * 415 + 50 * 400) / 150, "avg");
});

check("a buy with no existing lot is just itself", () => {
  const m = addPurchase([], { ticker: "NVDA", quantity: 10, price: 100, date: "2026-10-18" });
  assert.equal(m.quantity, 10);
  assert.equal(m.purchasePrice, 100);
});

check("existing duplicates collapse when a new buy arrives", () => {
  const m = addPurchase([wdcA, wdcB], { ticker: "WDC", quantity: 100, price: 400, date: "2026-10-18" });
  assert.equal(m.quantity, 400);
  assert.equal(m.survivorId, "a");
  assert.deepEqual(m.removedIds, ["b"]);
  near(m.purchasePrice, (41_500 + 82_000 + 40_000) / 400, "avg");
  assert.equal(m.purchases.length, 3);
});

check("bad input is refused", () => {
  assert.throws(() => mergeLots([]));
  assert.throws(() => mergeLots([wdcA, { ...wdcB, ticker: "MU" }]));
  assert.throws(() => addPurchase([wdcA], { ticker: "WDC", quantity: 0, price: 1, date: "2026-10-18" }));
});

console.log(`✓ ${passed} lot checks passed`);
