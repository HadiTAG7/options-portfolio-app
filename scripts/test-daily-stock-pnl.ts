import assert from "node:assert/strict";
import { dailyStockSummary, marketDay, stockDayMove } from "../src/lib/daily-stock-pnl";
import type { ActiveStock } from "../src/types";

const timestamp = Date.parse("2026-11-27T16:00:00Z") / 1000;
const lot = { quantity: 10, dailyQuote: { price: 102, prevClose: 100, timestamp } } as ActiveStock;
const day = "2026-11-27";
assert.equal(stockDayMove(lot, day), 20);
assert.equal(stockDayMove({ ...lot, dailyQuote: { ...lot.dailyQuote!, price: 100 } }, day), 0);
assert.equal(marketDay(new Date("2026-11-28T01:00:00Z")), day);
assert.equal(stockDayMove(lot, "2026-11-28"), null);
assert.equal(dailyStockSummary([lot, { ...lot, dailyQuote: null }], day).move, null);
assert.equal(dailyStockSummary([lot, lot], day).move, 40);
assert.equal(dailyStockSummary([], day).move, 0);
console.log("Daily pricing checks passed");
