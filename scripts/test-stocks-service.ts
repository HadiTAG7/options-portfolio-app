// Integration test for one-row-per-ticker positions against the Firestore
// EMULATOR only. Run:
//   npx firebase-tools emulators:exec --only firestore --project demo-funding \
//     "npx tsx scripts/test-stocks-service.ts"
import assert from "node:assert/strict";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { buyIntoPosition, mergePosition } from "@/lib/server/stocks-service";
import { RouteError } from "@/lib/server/route-error";

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("✗ FIRESTORE_EMULATOR_HOST not set — refusing to run against a real project.");
  process.exit(1);
}
initializeApp({ projectId: "demo-funding" });
const db: Firestore = getFirestore();

async function wipe() {
  for (const c of ["active_stocks", "trades"]) {
    const s = await db.collection(c).get();
    await Promise.all(s.docs.map((d) => d.ref.delete()));
  }
}
async function seed() {
  await wipe();
  await db.collection("active_stocks").doc("a").set({ id: "a", ticker: "WDC", quantity: 100, purchasePrice: 415, purchaseDate: "2026-10-16", targetSellPrice: 0, currentPrice: 332 });
  await db.collection("active_stocks").doc("b").set({ id: "b", ticker: "WDC", quantity: 200, purchasePrice: 410, purchaseDate: "2026-10-16", targetSellPrice: 450, currentPrice: 332 });
  await db.collection("active_stocks").doc("c").set({ id: "c", ticker: "MU", quantity: 100, purchasePrice: 950, purchaseDate: "2026-07-17", targetSellPrice: 1100 });
  await db.collection("trades").doc("cc").set({ id: "cc", ticker: "WDC", type: "Sell Call", status: "open", quantity: 200, premium: 5, strike: 450, linked_stock_id: "b" });
  await db.collection("trades").doc("other").set({ id: "other", ticker: "MU", type: "Sell Call", status: "open", quantity: 100, premium: 9, strike: 1100, linked_stock_id: "c" });
}
const lots = async (ticker: string) =>
  (await db.collection("active_stocks").get()).docs.map((d) => d.data()).filter((d) => d.ticker === ticker);
const near = (a: number, b: number, m: string) => assert.ok(Math.abs(a - b) < 1e-9, `${m}: ${a} vs ${b}`);

let passed = 0;
async function step(name: string, fn: () => Promise<void>) {
  try { await fn(); passed++; console.log(`✓ ${name}`); } catch (e) { console.error(`✗ ${name}`); throw e; }
}

async function main() {
  await step("the GP's two WDC rows merge into one, atomically", async () => {
    await seed();
    const r = await mergePosition(db, "wdc");
    assert.ok(r);
    const w = await lots("WDC");
    assert.equal(w.length, 1, "one row left");
    assert.equal(w[0].id, "a");
    assert.equal(w[0].quantity, 300);
    near(w[0].purchasePrice, 123_500 / 300, "weighted average");
    assert.equal(w[0].targetSellPrice, 450, "target kept");
    assert.equal(w[0].currentPrice, 332, "cached price kept");
    assert.equal((w[0].purchases as unknown[]).length, 2, "both buys recorded");
    const cc = (await db.collection("trades").doc("cc").get()).data()!;
    assert.equal(cc.linked_stock_id, "a", "covered call re-pointed to the merged row");
    const other = (await db.collection("trades").doc("other").get()).data()!;
    assert.equal(other.linked_stock_id, "c", "other tickers untouched");
    assert.equal((await lots("MU"))[0].quantity, 100, "MU untouched");
  });

  await step("merging a single row is a no-op", async () => {
    const before = await lots("WDC");
    await mergePosition(db, "WDC");
    assert.deepEqual(await lots("WDC"), before);
    assert.equal(await mergePosition(db, "TSLA"), null, "not held → null");
  });

  await step("a new buy folds into the existing row", async () => {
    const r = await buyIntoPosition(db, { ticker: "WDC", quantity: 100, price: 400, date: "2026-10-18" });
    assert.equal(r.created, false);
    assert.equal(r.lot.id, "a");
    const w = await lots("WDC");
    assert.equal(w.length, 1);
    assert.equal(w[0].quantity, 400);
    near(w[0].purchasePrice, (123_500 + 40_000) / 400, "average");
  });

  await step("a buy of a ticker not held creates its row", async () => {
    const r = await buyIntoPosition(db, { ticker: "nvda", quantity: 10, price: 100, date: "2026-10-18" });
    assert.equal(r.created, true);
    const n = await lots("NVDA");
    assert.equal(n.length, 1);
    assert.equal(n[0].quantity, 10);
  });

  await step("a buy while duplicates exist collapses them too, re-pointing calls", async () => {
    await seed();
    const r = await buyIntoPosition(db, { ticker: "WDC", quantity: 100, price: 400, date: "2026-10-18" });
    assert.deepEqual(r.removedIds, ["b"]);
    assert.deepEqual(r.relinkedTradeIds, ["cc"]);
    const w = await lots("WDC");
    assert.equal(w.length, 1);
    assert.equal(w[0].quantity, 400);
  });

  await step("simultaneous buys are both counted", async () => {
    await seed();
    await mergePosition(db, "WDC");
    await Promise.all([
      buyIntoPosition(db, { ticker: "WDC", quantity: 50, price: 400, date: "2026-10-18" }),
      buyIntoPosition(db, { ticker: "WDC", quantity: 70, price: 390, date: "2026-10-18" }),
    ]);
    const w = await lots("WDC");
    assert.equal(w.length, 1);
    assert.equal(w[0].quantity, 420, "300 + 50 + 70");
    near(w[0].quantity * w[0].purchasePrice, 123_500 + 20_000 + 27_300, "cost basis is every dollar paid");
  });

  await step("bad input is refused with nothing written", async () => {
    const before = (await db.collection("active_stocks").get()).size;
    for (const bad of [
      { ticker: "", quantity: 1, price: 1, date: "2026-10-18" },
      { ticker: "WDC", quantity: 0, price: 1, date: "2026-10-18" },
      { ticker: "WDC", quantity: 1, price: -5, date: "2026-10-18" },
      { ticker: "WDC", quantity: 1, price: 1, date: "18/10/2026" },
    ]) {
      await assert.rejects(buyIntoPosition(db, bad), (e: unknown) => e instanceof RouteError);
    }
    assert.equal((await db.collection("active_stocks").get()).size, before);
  });

  console.log(`\n✓ ${passed} position steps passed (emulator)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
