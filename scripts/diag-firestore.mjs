// Read-only diagnostic: prints the LIVE deployed Firestore ruleset and the
// GP's custom claims, to pinpoint why an authenticated GP write to
// monthly_profits returns "Missing or insufficient permissions".
//
// It answers two questions:
//   1. Does the ACTIVE ruleset actually contain the monthly_profits
//      allow-write? (deploy could have silently shipped an older set)
//   2. Does the GP auth account really carry gp=true?
//
// Writes nothing. Env: FIREBASE_SERVICE_ACCOUNT. Run: node scripts/diag-firestore.mjs

import { cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const { FIREBASE_SERVICE_ACCOUNT } = process.env;
const ok = (m) => console.log(`✓ ${m}`);
const warn = (m) => console.warn(`⚠ ${m}`);
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
const project = credJson.project_id;
const credential = cert(credJson);
initializeApp({ credential });

// ── 1. Live deployed Firestore rules via the Security Rules API ──────
let accessToken;
try {
  const t = await credential.getAccessToken();
  accessToken = t.access_token;
} catch (e) {
  fail(`getAccessToken failed: ${e.message}`);
}

async function api(url) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = await res.text();
  return { status: res.status, body };
}

console.log(`project: ${project}`);
const rel = await api(
  `https://firebaserules.googleapis.com/v1/projects/${project}/releases/cloud.firestore`
);
console.log(`release status: ${rel.status}`);
if (rel.status !== 200) {
  warn(`release fetch failed:\n${rel.body}`);
} else {
  const rulesetName = JSON.parse(rel.body).rulesetName;
  ok(`active ruleset: ${rulesetName}`);
  const rs = await api(`https://firebaserules.googleapis.com/v1/${rulesetName}`);
  console.log(`ruleset status: ${rs.status}`);
  if (rs.status === 200) {
    const files = JSON.parse(rs.body).source?.files ?? [];
    for (const f of files) {
      console.log(`\n===== DEPLOYED ${f.name} =====`);
      console.log(f.content);
    }
    const has = files.some((f) => f.content.includes("monthly_profits"));
    console.log(
      `\n>>> DEPLOYED RULES CONTAIN monthly_profits: ${has ? "YES" : "NO"} <<<`
    );
  } else {
    warn(`ruleset fetch failed:\n${rs.body}`);
  }
}

// ── 2. GP claim ─────────────────────────────────────────────────────
const auth = getAuth();
const db = getFirestore();
const pSnap = await db.collection("partners").get();
for (const d of pSnap.docs) {
  const p = d.data();
  if (p.isAdmin !== true) continue;
  console.log(
    `\nGP partner: ${p.name} (id=${d.id}) email=${p.email ?? "?"} auth_user_id=${p.auth_user_id ?? "unset"}`
  );
  if (p.auth_user_id) {
    try {
      const u = await auth.getUser(p.auth_user_id);
      console.log(
        `  auth email=${u.email} claims=${JSON.stringify(u.customClaims ?? {})}`
      );
    } catch (e) {
      warn(`  getUser failed: ${e.message}`);
    }
  }
}
// ── 3. daily_snapshots: is the series actually accumulating? ────────
const snaps = await db.collection("daily_snapshots").get();
console.log(`\ndaily_snapshots: ${snaps.size} doc(s)`);
const rows = snaps.docs
  .map((d) => d.data())
  .sort((a, b) => String(a.date ?? a.id).localeCompare(String(b.date ?? b.id)));
let prev = null;
for (const r of rows) {
  const u = Number(r.stockUnrealized) || 0;
  const move = prev === null ? null : u - prev;
  console.log(
    `  ${r.date ?? r.id}  unrealized=$${u.toFixed(2)}` +
      (move === null ? "  (first — no move)" : `  move=$${move.toFixed(2)}`)
  );
  prev = u;
}
if (rows.length < 2) {
  warn("fewer than 2 snapshots — no day-over-day move can exist yet");
}

// ── 4. trades: which months actually exist, and their profit ────────
const tSnap = await db.collection("trades").get();
console.log(`\ntrades: ${tSnap.size} doc(s)`);
const byMonth = {};
let earliest = null, latest = null;
for (const d of tSnap.docs) {
  const r = d.data();
  const isShort = r.type === "Sell Put" || r.type === "Sell Call";
  const date = String(r.date || "").slice(0, 10);
  if (!date) continue;
  if (!earliest || date < earliest) earliest = date;
  if (!latest || date > latest) latest = date;
  const profit = isShort && (r.status ?? "open") === "open"
    ? Number(r.premium || 0) * Number(r.quantity || 0)
    : Number(r.result || 0);
  const k = date.slice(0, 7);
  byMonth[k] = byMonth[k] || { n: 0, profit: 0 };
  byMonth[k].n++;
  byMonth[k].profit += profit;
}
console.log(`  date range: ${earliest} → ${latest}`);
for (const k of Object.keys(byMonth).sort()) {
  const v = byMonth[k];
  console.log(`  ${k}  trades=${String(v.n).padStart(3)}  profit=$${v.profit.toFixed(2)}`);
}

// ── 5. partner capital per month (the % denominator) ────────────────
const pSnap2 = await db.collection("partners").get();
let capTotal = 0;
const hist = [];
for (const d of pSnap2.docs) {
  const r = d.data();
  if (r.archived_at) continue;
  capTotal += Number(r.totalDeposits ?? r.currentBalance ?? 0);
  const bh = Array.isArray(r.balanceHistory) ? r.balanceHistory : [];
  hist.push(`${r.name}: ${bh.length} balanceHistory entries`);
}
console.log(`\ncurrent total capital (totalDeposits): $${capTotal.toFixed(2)}`);
hist.forEach((h) => console.log("  " + h));


// ── 6. reconstruct ownership % at past month-ends from balanceHistory ─
// The GP can't recall his ownership share in Jan-Mar, and that share is the
// only thing standing between his personal records and a fund-wide figure.
// balanceHistory holds dated balance snapshots, so the split is recoverable
// rather than guessed.
const capAsOf = (bh, cutoff) => {
  let best = null, bestDate = "";
  for (const h of bh) {
    const d = String(h?.date ?? "").slice(0, 10);
    if (!d || d > cutoff) continue;
    if (d >= bestDate) { bestDate = d; best = Number(h.balance) || 0; }
  }
  return best;
};
const people = pSnap2.docs.map((d) => d.data()).filter((r) => !r.archived_at);
console.log("\nbalanceHistory coverage (earliest → latest per partner):");
for (const r of people) {
  const bh = Array.isArray(r.balanceHistory) ? r.balanceHistory : [];
  const ds = bh.map((h) => String(h?.date ?? "").slice(0, 10)).filter(Boolean).sort();
  console.log(`  ${r.name}: ${ds.length ? ds[0] + " → " + ds[ds.length - 1] : "EMPTY"}`);
}
console.log("\nreconstructed ownership at month-end:");
for (const cutoff of ["2026-01-31","2026-02-28","2026-03-31","2026-04-30","2026-07-31"]) {
  const caps = people.map((r) => ({
    name: r.name,
    cap: capAsOf(Array.isArray(r.balanceHistory) ? r.balanceHistory : [], cutoff),
  }));
  const known = caps.filter((c) => c.cap !== null);
  const total = known.reduce((s, c) => s + c.cap, 0);
  const gp = caps.find((c) => /هادي/.test(c.name));
  const missing = caps.length - known.length;
  console.log(
    `  ${cutoff}: total=$${total.toFixed(0)}  GP=$${gp && gp.cap !== null ? gp.cap.toFixed(0) : "n/a"}` +
    `  GP share=${total > 0 && gp && gp.cap !== null ? ((gp.cap / total) * 100).toFixed(1) + "%" : "n/a"}` +
    `  (partners w/o data: ${missing})`
  );
}

// ── 7. July trades in detail — what actually changed ─────────────────
console.log("\nJuly 2026 trades (why the month total moved):");
let openPrem = 0, closedRes = 0;
for (const d of tSnap.docs) {
  const r = d.data();
  const date = String(r.date || "").slice(0, 10);
  if (!date.startsWith("2026-07")) continue;
  const isShort = r.type === "Sell Put" || r.type === "Sell Call";
  const status = r.status ?? "open";
  const prem = Number(r.premium || 0) * Number(r.quantity || 0);
  const res = Number(r.result || 0);
  if (isShort && status === "open") openPrem += prem; else closedRes += res;
  console.log(
    `  ${date} ${String(r.ticker).padEnd(6)} ${String(r.type).padEnd(10)} ${status.padEnd(7)}` +
    ` qty=${String(r.quantity).padStart(4)} premium*qty=$${prem.toFixed(0).padStart(7)} result=$${res.toFixed(0).padStart(7)}`
  );
}
console.log(`  → open premium total=$${openPrem.toFixed(2)}, closed results total=$${closedRes.toFixed(2)}, sum=$${(openPrem+closedRes).toFixed(2)}`);

// ── 8. MSFT deep dive + book-wide consistency of closed short options ─
// The July total hinges on ONE row: a MSFT covered call carrying a large
// negative `result` while the underlying shares are still in the book.
// Two readings are possible and they differ by ~$6k:
//   (a) the call was really bought back → the loss is realized and the
//       offsetting share gain is still unrealized;
//   (b) the row was marked closed with a MARK-TO-MARKET number, which is
//       not how any other open short option in this book is valued.
// This section prints the evidence that separates them: the MSFT rows in
// full, and every closed short option's result next to the premium it
// collected, so an outlier is visible instead of assumed.
console.log("\n=== MSFT rows (trades) ===");
for (const d of tSnap.docs) {
  const r = d.data();
  if (String(r.ticker).toUpperCase() !== "MSFT") continue;
  console.log(
    `  id=${d.id} ${r.date} ${r.type} status=${r.status ?? "open"} qty=${r.quantity}` +
      ` premium=${r.premium} strike=${r.strike} result=${r.result}` +
      ` exp=${r.expiration ?? "-"} autoClosed=${r.autoClosed ?? false}` +
      ` linkedStockId=${r.linked_stock_id ?? r.linkedStockId ?? "-"}`
  );
}

const stSnap = await db.collection("active_stocks").get();
console.log(`\n=== active_stocks (${stSnap.size}) ===`);
for (const d of stSnap.docs) {
  const r = d.data();
  console.log(
    `  id=${d.id} ${String(r.ticker).padEnd(6)} qty=${String(r.quantity).padStart(4)}` +
      ` buy=$${Number(r.purchasePrice || 0).toFixed(2)} target=$${Number(r.targetSellPrice || 0).toFixed(2)}` +
      ` cached=$${r.currentPrice ?? "-"} bought=${r.purchaseDate ?? "-"}`
  );
}

console.log("\n=== closed short options: result vs premium collected ===");
console.log("  (expired-worthless rows should show result ≈ premium*qty)");
const closedShorts = [];
for (const d of tSnap.docs) {
  const r = d.data();
  const isShort = r.type === "Sell Put" || r.type === "Sell Call";
  if (!isShort) continue;
  if ((r.status ?? "open") === "open") continue;
  const prem = Number(r.premium || 0) * Number(r.quantity || 0);
  const res = Number(r.result || 0);
  closedShorts.push({ ticker: r.ticker, date: String(r.date || "").slice(0, 10), prem, res, gap: res - prem, status: r.status });
}
closedShorts.sort((a, b) => a.gap - b.gap);
for (const c of closedShorts) {
  console.log(
    `  ${c.date} ${String(c.ticker).padEnd(6)} ${String(c.status).padEnd(8)}` +
      ` premium=$${c.prem.toFixed(0).padStart(7)} result=$${c.res.toFixed(0).padStart(7)}` +
      ` result-premium=$${c.gap.toFixed(0).padStart(8)}`
  );
}

// Does the recorded loss equal TODAY's intrinsic value of the short call?
// If it matches to the cent, the row is a live mark, not a settled trade.
console.log("\n=== is the MSFT result a mark-to-market? ===");
const msftCall = tSnap.docs
  .map((d) => ({ id: d.id, ...d.data() }))
  .find(
    (r) =>
      String(r.ticker).toUpperCase() === "MSFT" &&
      r.type === "Sell Call" &&
      (r.status ?? "open") !== "open"
  );
const msftLot = stSnap.docs
  .map((d) => d.data())
  .find((r) => String(r.ticker).toUpperCase() === "MSFT");
if (!msftCall) {
  console.log("  no closed MSFT short call found");
} else {
  const qty = Number(msftCall.quantity || 0);
  const prem = Number(msftCall.premium || 0) * qty;
  const res = Number(msftCall.result || 0);
  const buyback = prem - res; // what closing the short cost
  const perShare = qty > 0 ? buyback / qty : 0;
  const strike = Number(msftCall.strike || 0);
  console.log(`  premium collected  = $${prem.toFixed(2)}`);
  console.log(`  recorded result    = $${res.toFixed(2)}`);
  console.log(`  implied buyback    = $${buyback.toFixed(2)}  ($${perShare.toFixed(2)}/share)`);
  console.log(`  strike             = $${strike.toFixed(2)}`);
  console.log(`  implied spot       = strike + per-share = $${(strike + perShare).toFixed(2)}`);
  let spot = null;
  try {
    const y = await fetch(
      "https://query1.finance.yahoo.com/v8/finance/chart/MSFT?range=5d&interval=1d"
    );
    const j = await y.json();
    const q = j?.chart?.result?.[0];
    const closes = (q?.indicators?.quote?.[0]?.close ?? []).filter((v) => typeof v === "number");
    spot = q?.meta?.regularMarketPrice ?? closes[closes.length - 1] ?? null;
  } catch (e) {
    warn(`  spot fetch failed: ${e.message}`);
  }
  if (spot !== null) {
    console.log(`  MSFT spot now      = $${Number(spot).toFixed(2)}`);
    const diff = Math.abs(strike + perShare - Number(spot));
    console.log(
      `  |implied spot - spot| = $${diff.toFixed(2)}  → ${diff < 1 ? "MATCHES today's intrinsic ⇒ MARK-TO-MARKET, not a settled buyback" : "does NOT match today ⇒ consistent with a real buyback at an earlier price"}`
    );
  }
  if (msftLot) {
    const lotQty = Number(msftLot.quantity || 0);
    const buy = Number(msftLot.purchasePrice || 0);
    console.log(
      `  shares still held  = ${lotQty} @ $${buy.toFixed(2)}` +
        (spot !== null
          ? `  unrealized = $${((Number(spot) - buy) * lotQty).toFixed(2)}`
          : "")
    );
    console.log(
      `  if assigned at $${strike.toFixed(2)}: share gain $${((strike - buy) * Math.min(lotQty, qty)).toFixed(2)} + premium $${prem.toFixed(2)} = $${((strike - buy) * Math.min(lotQty, qty) + prem).toFixed(2)} capped total`
    );
  }
  console.log("\n=== July under each reading ===");
  console.log(`  (a) result as recorded, realized only : $${(openPrem + closedRes).toFixed(2)}`);
  console.log(`  (b) call valued at premium collected  : $${(openPrem + closedRes - res + prem).toFixed(2)}`);
  if (spot !== null && msftLot) {
    const unreal = (Number(spot) - Number(msftLot.purchasePrice || 0)) * Number(msftLot.quantity || 0);
    console.log(`  (c) as recorded + unrealized shares  : $${(openPrem + closedRes + unreal).toFixed(2)}`);
  }
}

ok("diagnostic complete");
