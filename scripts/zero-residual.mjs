// One-off: zero a tiny pending-profit ROUNDING residual on the GP card so
// the "deposit with pending profits" guard stops blocking real deposits.
//
// It replicates what the in-app "تثبيت" (capitalize) does, but is safe for
// a sub-cent amount the UI may not let you confirm:
//   • syncs investment (totalDeposits + baseCapital) to the current
//     balance, so balance − investment = 0, and
//   • stamps last_settlement_date = now, so the distribution engine treats
//     all prior trades as settled and pending net resets to $0.
//
// Only the GP row is touched, and only when |balance − investment| is a
// tiny rounding residual (< $0.02). The historical profit LOG / reports use
// a settlement-blind basis, so they are unaffected. Money-safe: the penny
// is folded into the GP's own capital.
//
// DRY RUN by default; APPLY=1 to write. Env: FIREBASE_SERVICE_ACCOUNT.

import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const { FIREBASE_SERVICE_ACCOUNT, APPLY } = process.env;
const apply = APPLY === "1";
const ok = (m) => console.log(`✓ ${m}`);
function fail(m) {
  console.error(`✗ ${m}`);
  process.exit(1);
}
if (!FIREBASE_SERVICE_ACCOUNT) fail("FIREBASE_SERVICE_ACCOUNT is required");
let cred;
try {
  cred = JSON.parse(FIREBASE_SERVICE_ACCOUNT);
} catch (e) {
  fail(`Bad FIREBASE_SERVICE_ACCOUNT JSON: ${e.message}`);
}
initializeApp({ credential: cert(cred) });
const db = getFirestore();

console.log(apply ? "MODE: APPLY" : "MODE: DRY RUN");

const snap = await db.collection("partners").get();
let touched = 0;
for (const d of snap.docs) {
  const p = d.data();
  if (p.isAdmin !== true) continue; // GP only
  const bal =
    Number(p.currentBalance) || Number(p.total_balance) || 0;
  const inv = Number(p.totalDeposits) || Number(p.baseCapital) || 0;
  const residual = Math.round((bal - inv) * 100) / 100;
  console.log(
    `GP ${p.name} (${d.id}): balance=${bal} investment=${inv} residual=$${residual.toFixed(2)}`
  );
  if (residual === 0) {
    console.log("  → already clean, nothing to do");
    continue;
  }
  if (Math.abs(residual) >= 0.02) {
    console.log(
      "  → residual is NOT a tiny rounding artifact (>= $0.02) — skipping for safety"
    );
    continue;
  }
  if (apply) {
    await db.collection("partners").doc(d.id).set(
      {
        totalDeposits: bal,
        baseCapital: bal,
        last_settlement_date: new Date().toISOString(),
      },
      { merge: true }
    );
    touched++;
    ok(`  → zeroed: investment synced to ${bal}, settlement stamped`);
  } else {
    console.log(`  → WOULD zero: set investment=${bal}, stamp settlement`);
  }
}
console.log("──────────────────────");
console.log(apply ? `done — ${touched} row(s) zeroed` : "dry run complete");
