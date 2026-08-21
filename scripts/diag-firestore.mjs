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

// ── 8. Premature auto-close audit ───────────────────────────────────
// The July total moved TODAY. The suspect is the expiration sweep in
// use-trades.ts: isExpiredOption fires when today >= expiration, so a
// contract expiring today gets settled while it is still trading, and an
// ITM result is computed from whatever the live quote says at that moment
// (pre-market, in this case). This section measures the blast radius:
// which rows were closed on or before their own expiration date, and
// which ones carry a result that is a live mark rather than a settlement.
const stLots = (await db.collection("active_stocks").get()).docs.map((d) => ({ id: d.id, ...d.data() }));
console.log(`\n=== active_stocks (${stLots.length}) ===`);
for (const s of stLots) {
  console.log(
    `  ${String(s.ticker).padEnd(6)} qty=${String(s.quantity).padStart(4)}` +
      ` buy=$${Number(s.purchasePrice || 0).toFixed(2)} target=$${Number(s.targetSellPrice || 0).toFixed(2)}` +
      ` bought=${s.purchaseDate ?? "-"} id=${s.id}`
  );
}
const today = new Date().toISOString().slice(0, 10);
console.log(`\n=== premature auto-close audit (today = ${today}) ===`);

const all = tSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
const isShortOpt = (r) => r.type === "Sell Put" || r.type === "Sell Call";

console.log("\nall trades (date · exp · status · premium*qty vs result):");
for (const r of all.sort((a, b) => String(a.date).localeCompare(String(b.date)))) {
  const prem = Number(r.premium || 0) * Number(r.quantity || 0);
  const res = Number(r.result || 0);
  const exp = String(r.expiration ?? "").slice(0, 10) || "-";
  const premature = isShortOpt(r) && exp !== "-" && exp >= today && (r.status ?? "open") !== "open";
  console.log(
    `  ${String(r.date).slice(0, 10)} exp=${exp} ${String(r.ticker).padEnd(6)}` +
      ` ${String(r.type).padEnd(10)} ${String(r.status ?? "open").padEnd(7)}` +
      ` prem=$${prem.toFixed(0).padStart(6)} result=$${res.toFixed(0).padStart(7)}` +
      ` gap=$${(res - prem).toFixed(0).padStart(7)}` +
      (r.linked_stock_id || r.linkedStockId ? " COVERED" : "") +
      (premature ? "  <<< CLOSED BEFORE IT EXPIRED" : "")
  );
}

const premature = all.filter(
  (r) =>
    isShortOpt(r) &&
    (r.status ?? "open") !== "open" &&
    String(r.expiration ?? "").slice(0, 10) >= today
);
console.log(`\nrows closed on/before their expiration date: ${premature.length}`);

// Spot per ticker, so an ITM mark can be recognised as a live mark.
const tickers = [...new Set(all.map((r) => String(r.ticker).toUpperCase()))];
const spot = {};
for (const t of tickers) {
  try {
    const y = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${t}?range=1d&interval=1d`
    );
    const j = await y.json();
    const p = j?.chart?.result?.[0]?.meta?.regularMarketPrice;
    if (typeof p === "number") spot[t] = p;
  } catch {
    /* leave unset */
  }
}

console.log("\nresults that are a LIVE MARK, not a settlement:");
console.log("  (implied spot = strike ± result-gap per share; compare to spot now)");
let markedGap = 0;
for (const r of all) {
  if (!isShortOpt(r)) continue;
  if ((r.status ?? "open") === "open") continue;
  const qty = Number(r.quantity || 0);
  const prem = Number(r.premium || 0) * qty;
  const res = Number(r.result || 0);
  const gap = res - prem;
  if (Math.abs(gap) < 0.5 || qty === 0) continue;
  const strike = Number(r.strike || 0);
  const perShare = -gap / qty;
  const implied =
    r.type === "Sell Call" ? strike + perShare : strike - perShare;
  const s = spot[String(r.ticker).toUpperCase()];
  const match = typeof s === "number" ? Math.abs(implied - s) : null;
  markedGap += gap;
  console.log(
    `  ${String(r.date).slice(0, 10)} ${String(r.ticker).padEnd(6)} ${r.type}` +
      ` strike=$${strike.toFixed(2)} gap=$${gap.toFixed(2)}` +
      ` implied spot=$${implied.toFixed(2)}` +
      (typeof s === "number" ? ` spot now=$${s.toFixed(2)} |diff|=$${match.toFixed(2)}` : " spot n/a") +
      (match !== null && match < 1 ? "  <<< MATCHES TODAY ⇒ LIVE MARK" : "")
  );
}
console.log(`  total profit removed by these marks: $${markedGap.toFixed(2)}`);

// What July becomes once premature marks are undone, and what proper
// assignment accounting would say for the covered MSFT call.
console.log("\n=== July under each treatment ===");
const julyGap = all
  .filter((r) => String(r.date).startsWith("2026-07") && isShortOpt(r))
  .reduce((s, r) => {
    const prem = Number(r.premium || 0) * Number(r.quantity || 0);
    return s + (Number(r.result || 0) - prem);
  }, 0);
const julyAsRecorded = openPrem + closedRes;
console.log(`  (a) as recorded now                      : $${julyAsRecorded.toFixed(2)}`);
console.log(`  (b) premature marks undone (premium kept): $${(julyAsRecorded - julyGap).toFixed(2)}`);
for (const r of all) {
  const lsid = r.linked_stock_id || r.linkedStockId;
  if (!lsid || !isShortOpt(r)) continue;
  const lot = stLots.find((s) => s.id === lsid);
  if (!lot) continue;
  const qty = Math.min(Number(r.quantity || 0), Number(lot.quantity || 0));
  const strike = Number(r.strike || 0);
  const basis = Number(lot.purchasePrice || 0);
  const prem = Number(r.premium || 0) * Number(r.quantity || 0);
  console.log(
    `  covered ${r.ticker}: if assigned at $${strike.toFixed(2)} →` +
      ` premium $${prem.toFixed(0)} + share gain $${((strike - basis) * qty).toFixed(0)}` +
      ` = $${(prem + (strike - basis) * qty).toFixed(0)} (lot leaves the book)`
  );
}

ok("diagnostic complete");
