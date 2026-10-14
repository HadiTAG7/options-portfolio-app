// Read-only rehearsal of the funding day against LIVE data.
//
// Plans the day exactly as the server would (same mapping, same planner)
// and checks the fund-wide invariants on the result. Writes nothing.
//
// PRIVACY: this repository is public, so Actions logs are world-readable.
// The output therefore contains NO partner names and NO amounts — only
// pass/fail, counts and the largest numerical deviation. The full
// per-partner preview is served to the GP alone, inside the app.
//
// Env: FIREBASE_SERVICE_ACCOUNT. Optional REQUESTS_JSON (FundingRequest[]).
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { mapFundState } from "@/lib/server/fund-state";
import {
  planFundingDay,
  applyPlanToPartners,
  fingerprintPlan,
  type FundingRequest,
} from "@/lib/funding-day";
import { computePartnerDistributionFromTrades } from "@/lib/partner-profit";
import { getPartnerInvestment } from "@/lib/utils";
import { getSarRateFallback } from "./funding-dry-run-rate";

async function main() {
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!sa) throw new Error("FIREBASE_SERVICE_ACCOUNT is required");
  initializeApp({ credential: cert(JSON.parse(sa)) });
  const db = getFirestore();

  const [pSnap, tSnap, mSnap] = await Promise.all([
    db.collection("partners").get(),
    db.collection("trades").get(),
    db.collection("monthly_profits").get(),
  ]);
  const state = mapFundState(pSnap.docs, tSnap.docs, mSnap.docs);
  console.log(`partners (active): ${state.partners.length}`);
  console.log(`trades: ${state.trades.length}`);
  console.log(`monthly_profits entries: ${state.monthlyKeys.size}`);

  let failures = 0;
  function scenario(label: string, requests: FundingRequest[]) {
    const plan = planFundingDay({
      partners: state.partners,
      trades: state.trades,
      requests,
      depositSarPerUsd: getSarRateFallback(),
    withdrawSarPerUsd: getSarRateFallback(),
      now: new Date(),
      existingMonthlyKeys: state.monthlyKeys,
    });
    console.log(`\n── ${label} ──`);
    console.log(`requests: ${requests.length}`);
    console.log(`errors: ${plan.errors.length}  warnings: ${plan.warnings.length}`);
    console.log(`included trades: ${plan.includedTradeIds.length}`);
    console.log(
      `writes: partners ${plan.lines.length}, ledger rows ${plan.ledger.length}, monthly freezes ${plan.freezes.length}, + 1 operation + 1 round`
    );
    console.log(`broker action: ${plan.totals.brokerAction}`);
    console.log(`fingerprint: ${fingerprintPlan(plan, "dry-run", 0, getSarRateFallback(), getSarRateFallback())}`);
    if (plan.errors.length > 0) {
      console.log("(errors block execution — invariants not evaluated)");
      return;
    }

    const before = computePartnerDistributionFromTrades(state.partners, state.trades);
    const afterPartners = applyPlanToPartners(state.partners, plan);
    const after = computePartnerDistributionFromTrades(afterPartners, state.trades);
    let maxEquityDev = 0;
    let maxPendingAfter = 0;
    for (const l of plan.lines) {
      const p0 = state.partners.find((p) => p.id === l.partnerId)!;
      const p1 = afterPartners.find((p) => p.id === l.partnerId)!;
      const e0 = getPartnerInvestment(p0) + before[l.partnerId].netProfit;
      const e1 = getPartnerInvestment(p1) + after[l.partnerId].netProfit;
      maxEquityDev = Math.max(maxEquityDev, Math.abs(e1 - (e0 - l.cashOut + l.cashIn)));
      maxPendingAfter = Math.max(maxPendingAfter, Math.abs(after[l.partnerId].settleableNet));
    }
    const equityOk = maxEquityDev <= 0.0051;
    const pendingOk = maxPendingAfter <= 1e-6;
    console.log(`invariant equity conservation: ${equityOk ? "PASS" : "FAIL"} (max deviation ${maxEquityDev.toExponential(2)})`);
    console.log(`invariant nothing pending after: ${pendingOk ? "PASS" : "FAIL"} (max ${maxPendingAfter.toExponential(2)})`);
    if (!equityOk || !pendingOk) failures++;
}

scenario("no requests (settle everyone)", []);
const raw = process.env.REQUESTS_JSON?.trim();
if (raw) {
  try {
    scenario("REQUESTS_JSON", JSON.parse(raw) as FundingRequest[]);
  } catch (e) {
    console.error(`✗ bad REQUESTS_JSON: ${(e as Error).message}`);
    failures++;
  }
}

if (failures > 0) {
  console.error(`\n✗ ${failures} scenario(s) failed an invariant`);
  process.exit(1);
}
console.log("\n✓ dry run complete — nothing was written");
}

main().catch((e) => {
  console.error(`✗ ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
