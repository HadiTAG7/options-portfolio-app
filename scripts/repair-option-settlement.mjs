// Repairs the damage done by the old expiration sweep.
//
// The sweep used to fire on `today >= expiration` and, when the live quote
// was through the strike, write `(premium − intrinsic) × qty` as the
// trade's result. Two consequences, both visible in this book:
//
//   • Contracts were settled ON their expiration day, while still
//     trading. On 2026-08-21 eleven positions expiring that very day were
//     closed off a pre-market quote.
//   • Because an option's profit month is its TRADE date, a mark computed
//     in August rewrote July — a month already reported to partners.
//     July fell from $28,856 to $22,719 with no trade having happened.
//
// This script undoes that, and nothing else:
//   1. Short options auto-closed while their expiration is still today or
//      later are reopened (status=open, result=0). They have not expired;
//      an open short option is already valued at the premium collected,
//      which is what the month showed before the sweep touched it.
//   2. Short options that legitimately expired but carry a machine-written
//      mark instead of the premium are reset to the premium. The share leg
//      of an assignment is recorded separately by the GP (as MRK was, a
//      Stock Sell at the strike on 2026-07-19), so the mark was double
//      counting the loss.
//
// Only rows with autoClosed === true are eligible: anything the GP typed
// by hand is left exactly as they entered it.
//
// Read-only unless APPLY=1. Env: FIREBASE_SERVICE_ACCOUNT.

import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const { FIREBASE_SERVICE_ACCOUNT, APPLY, TODAY } = process.env;
// Accept both spellings so a workflow expression that resolves to a
// boolean rather than a flag digit still means what it says.
const apply = APPLY === "1" || APPLY === "true";
const ok = (m) => console.log(`✓ ${m}`);
function fail(m) {
  console.error(`✗ ${m}`);
  process.exit(1);
}
if (!FIREBASE_SERVICE_ACCOUNT) fail("FIREBASE_SERVICE_ACCOUNT is required");

let credJson;
try {
  credJson = JSON.parse(FIREBASE_SERVICE_ACCOUNT);
} catch (e) {
  fail(`Bad FIREBASE_SERVICE_ACCOUNT JSON: ${e.message}`);
}
initializeApp({ credential: cert(credJson) });
const db = getFirestore();

// Trading day. Overridable so a dry run can be reasoned about against a
// fixed date instead of whenever the runner happens to start.
const today = (TODAY || new Date().toISOString().slice(0, 10)).slice(0, 10);
console.log(`project: ${credJson.project_id}`);
console.log(`today:   ${today}`);
console.log(`mode:    ${apply ? "APPLY (writes)" : "DRY RUN (no writes)"}`);

const snap = await db.collection("trades").get();
const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
const isShort = (r) => r.type === "Sell Put" || r.type === "Sell Call";
const premiumOf = (r) => (Number(r.premium) || 0) * (Number(r.quantity) || 0);
const monthOf = (r) => String(r.date || "").slice(0, 7);
// Mirrors tradeProfit(): an open short is worth the premium it collected;
// anything else is worth its recorded result.
const profitOf = (r) =>
  isShort(r) && (r.status ?? "open") === "open" ? premiumOf(r) : Number(r.result) || 0;

const monthTotals = (list) => {
  const out = {};
  for (const r of list) {
    const m = monthOf(r);
    if (!m) continue;
    out[m] = (out[m] ?? 0) + profitOf(r);
  }
  return out;
};

// ── Classify ────────────────────────────────────────────────────────
const reopen = [];
const resetToPremium = [];
for (const r of rows) {
  if (!isShort(r)) continue;
  if (r.autoClosed !== true) continue;
  if ((r.status ?? "open") === "open") continue;
  const exp = String(r.expiration || "").slice(0, 10);
  if (exp && exp >= today) {
    reopen.push(r);
    continue;
  }
  if (Math.abs((Number(r.result) || 0) - premiumOf(r)) > 0.5) {
    resetToPremium.push(r);
  }
}

console.log(`\n── reopen (closed before expiring): ${reopen.length} ──`);
for (const r of reopen) {
  console.log(
    `  ${r.date} exp=${r.expiration} ${String(r.ticker).padEnd(6)} ${r.type}` +
      ` result=$${(Number(r.result) || 0).toFixed(0)} → open, premium $${premiumOf(r).toFixed(0)}`
  );
}
console.log(`\n── reset to premium (machine mark on a real expiry): ${resetToPremium.length} ──`);
for (const r of resetToPremium) {
  console.log(
    `  ${r.date} exp=${r.expiration} ${String(r.ticker).padEnd(6)} ${r.type}` +
      ` result=$${(Number(r.result) || 0).toFixed(0)} → $${premiumOf(r).toFixed(0)}`
  );
}

if (reopen.length === 0 && resetToPremium.length === 0) {
  ok("nothing to repair");
  process.exit(0);
}

// ── Effect on each month, before writing anything ───────────────────
const before = monthTotals(rows);
const after = monthTotals(
  rows.map((r) => {
    if (reopen.some((x) => x.id === r.id))
      return { ...r, status: "open", result: 0 };
    if (resetToPremium.some((x) => x.id === r.id))
      return { ...r, result: premiumOf(r) };
    return r;
  })
);
console.log("\n── month totals ──");
for (const m of Object.keys(before).sort()) {
  const d = (after[m] ?? 0) - (before[m] ?? 0);
  console.log(
    `  ${m}  $${(before[m] ?? 0).toFixed(2).padStart(11)} → $${(after[m] ?? 0)
      .toFixed(2)
      .padStart(11)}` + (Math.abs(d) > 0.005 ? `   (${d > 0 ? "+" : ""}${d.toFixed(2)})` : "")
  );
}

if (!apply) {
  ok("dry run complete — set APPLY=1 to write");
  process.exit(0);
}

// ── Write ───────────────────────────────────────────────────────────
let n = 0;
for (const r of reopen) {
  await db
    .collection("trades")
    .doc(r.id)
    .set(
      { status: "open", result: 0, autoClosed: false, needsReview: false },
      { merge: true }
    );
  n++;
}
for (const r of resetToPremium) {
  await db
    .collection("trades")
    .doc(r.id)
    .set({ result: premiumOf(r), needsReview: false }, { merge: true });
  n++;
}
ok(`repaired ${n} row(s)`);
