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

ok("diagnostic complete");
