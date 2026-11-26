import { strict as assert } from "node:assert";
import { computePartnerDistributionFromTrades as distribute, monthlyPartnerNet, reportTradePositions } from "../src/lib/partner-profit";
import type { Partner, Trade } from "../src/types";

const bookedAt = "2026-04-20T12:00:00Z";
const makePartner = (id: string, amount: number, entry: string) => ({
  id, totalDeposits: amount, entryDate: entry, managementFeeRate: 20,
} as Partner);
const makeTrade = (id: string, date: string) => ({
  id, type: "Stock Sell", date, createdAt: date, result: 100,
} as Trade);
const trades = [makeTrade("old", "2026-03-01"), makeTrade("split", "2026-04-10"), makeTrade("future", "2026-05-10")];
const before = [makePartner("donor", 700, "2026-01-01"), makePartner("recipient", 100, "2026-04-20"), makePartner("other", 200, "2026-01-01")];
const after = before.map(p => ({ ...p }));
after[0].totalDeposits -= 100;
after[0].profitReallocations = [{ bookedAt, priorCapitalDelta: 100, grossByTrade: { split: -10 } }];
after[1].profitReallocations = [{ bookedAt, priorCapitalDelta: 0, grossByTrade: { split: 10 } }];
const month = (id: string, key: string) => monthlyPartnerNet(after, trades, id, key).net;
assert.equal(month("donor", "2026-03"), 56);
assert.equal(month("recipient", "2026-03"), 0);
assert.equal(month("donor", "2026-04"), 48);
assert.equal(month("recipient", "2026-04"), 8);
assert.equal(month("other", "2026-04"), 16);
assert.equal(reportTradePositions(after, trades.slice(0,2), "recipient")[0].share, 10);
assert.equal(distribute(after, [trades[2]]).recipient.grossProfit, 100 * (100 / 900));
after[1].lastSettlementDate = "2026-04-21";
assert.equal(distribute(after, [trades[1]]).recipient.settleableNet, 0);
assert.equal(month("recipient", "2026-04"), 8);
console.log("Verified capital split, monthly reports, subsequent settlement and future trades");
