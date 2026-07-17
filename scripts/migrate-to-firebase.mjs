// Supabase → Firebase migration.
//
// Moves the four data tables into Firestore (same collection names,
// same document ids, same field names — the app's row-mapping code
// keeps working verbatim), imports the auth users WITH their bcrypt
// password hashes (same emails, same passwords, same UIDs), stamps
// GP/partner custom claims used by firestore.rules, then verifies
// counts and money totals against the source and prints a report.
//
// Designed to run from the "Migrate to Firebase" GitHub Actions
// workflow (see .github/workflows/migrate-to-firebase.yml) or locally.
// Safe to re-run: data writes overwrite the same doc ids, already
// imported auth users are skipped, claims are re-stamped.
//
// Required env:
//   SUPABASE_URL                 e.g. https://xxxx.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY    Supabase → Project Settings → API keys
//   FIREBASE_SERVICE_ACCOUNT     the service-account JSON (whole file, as a string)
//     — or GOOGLE_APPLICATION_CREDENTIALS = path to that JSON file
// Optional env:
//   AUTH_USERS_JSON              output of scripts/export-auth-users.sql
//                                (array of {localId,email,passwordHash,emailVerified})
//                                If absent, the auth-import step is skipped.

import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  FIREBASE_SERVICE_ACCOUNT,
  GOOGLE_APPLICATION_CREDENTIALS,
  AUTH_USERS_JSON,
} = process.env;

const ok = (m) => console.log(`✓ ${m}`);
const warn = (m) => console.warn(`⚠ ${m}`);
function fail(m) {
  console.error(`✗ ${m}`);
  process.exit(1);
}

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  fail("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
}

let credJson;
try {
  if (FIREBASE_SERVICE_ACCOUNT) {
    credJson = JSON.parse(FIREBASE_SERVICE_ACCOUNT);
  } else if (GOOGLE_APPLICATION_CREDENTIALS) {
    credJson = JSON.parse(readFileSync(GOOGLE_APPLICATION_CREDENTIALS, "utf8"));
  } else {
    fail(
      "FIREBASE_SERVICE_ACCOUNT (JSON string) or GOOGLE_APPLICATION_CREDENTIALS (path) is required"
    );
  }
} catch (e) {
  fail(`Could not parse the Firebase service account JSON: ${e.message}`);
}

initializeApp({ credential: cert(credJson) });
const db = getFirestore();
const auth = getAuth();

const TABLES = ["partners", "trades", "active_stocks", "transactions"];

// Accepts BOTH Supabase key formats: legacy JWT service_role keys
// (eyJ…) go in apikey + Authorization; new secret keys (sb_secret_…)
// must be sent as apikey ONLY (they are not JWTs — a Bearer header
// would break PostgREST's token parsing).
function supabaseHeaders() {
  const headers = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    // Large enough for this dataset; PostgREST default page is 1000.
    Range: "0-9999",
  };
  if (!SUPABASE_SERVICE_ROLE_KEY.startsWith("sb_")) {
    headers.Authorization = `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`;
  }
  return headers;
}

async function fetchAll(table) {
  const res = await fetch(
    `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/${table}?select=*`,
    { headers: supabaseHeaders() }
  );
  if (!res.ok) {
    fail(`Reading ${table} failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

// ── 1. Data: Supabase tables → Firestore collections ────────────────
const source = {};
for (const table of TABLES) {
  source[table] = await fetchAll(table);
  ok(`read ${table}: ${source[table].length} rows`);
}

for (const table of TABLES) {
  const rows = source[table];
  let written = 0;
  let batch = db.batch();
  let inBatch = 0;
  for (const row of rows) {
    const id = row.id != null ? String(row.id) : null;
    if (!id) {
      warn(`${table}: skipped a row with no id: ${JSON.stringify(row).slice(0, 120)}`);
      continue;
    }
    batch.set(db.collection(table).doc(id), row);
    written++;
    inBatch++;
    if (inBatch === 400) {
      await batch.commit();
      batch = db.batch();
      inBatch = 0;
    }
  }
  if (inBatch > 0) await batch.commit();
  ok(`wrote ${table}: ${written} docs`);
}

// ── 2. Auth: import users with their bcrypt password hashes ─────────
let authImported = 0;
let authSkipped = 0;
if (AUTH_USERS_JSON) {
  let users;
  try {
    users = JSON.parse(AUTH_USERS_JSON);
  } catch (e) {
    fail(`AUTH_USERS_JSON is not valid JSON: ${e.message}`);
  }
  if (!Array.isArray(users)) fail("AUTH_USERS_JSON must be a JSON array");

  const toImport = [];
  for (const u of users) {
    if (!u?.localId || !u?.email) {
      warn(`auth: skipped a user missing localId/email: ${JSON.stringify(u).slice(0, 80)}`);
      continue;
    }
    if (!/^\$2[aby]\$/.test(u.passwordHash ?? "")) {
      warn(`auth: ${u.email} has a non-bcrypt hash — skipped (reset their password manually)`);
      continue;
    }
    // Idempotency: skip users that already exist in Firebase.
    try {
      await auth.getUser(u.localId);
      authSkipped++;
      continue;
    } catch {
      // not found → import it
    }
    toImport.push({
      uid: u.localId,
      email: u.email,
      emailVerified: u.emailVerified === true,
      passwordHash: Buffer.from(u.passwordHash, "utf8"),
    });
  }

  if (toImport.length > 0) {
    const result = await auth.importUsers(toImport, {
      hash: { algorithm: "BCRYPT" },
    });
    authImported = result.successCount;
    for (const err of result.errors) {
      warn(`auth import error for ${toImport[err.index]?.email}: ${err.error.message}`);
    }
  }
  ok(`auth: imported ${authImported}, already existed ${authSkipped}`);
} else {
  warn("AUTH_USERS_JSON not provided — auth-import step skipped");
}

// ── 3. Custom claims: gp + partnerId (used by firestore.rules) ──────
let claimsSet = 0;
for (const p of source.partners) {
  const uid = p.auth_user_id;
  if (!uid) {
    warn(`claims: partner "${p.name}" has no auth_user_id — skipped`);
    continue;
  }
  try {
    await auth.setCustomUserClaims(uid, {
      gp: p.isAdmin === true,
      partnerId: String(p.id),
    });
    claimsSet++;
  } catch (e) {
    warn(`claims: failed for "${p.name}" (${uid}): ${e.message}`);
  }
}
ok(`claims: stamped ${claimsSet} users (gp/partnerId)`);

// ── 4. Verify: counts + money totals, source vs Firestore ───────────
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const money = (v) => Math.round(num(v) * 100) / 100;

let allGood = true;
console.log("\n──── VERIFICATION ────");
for (const table of TABLES) {
  const snap = await db.collection(table).count().get();
  const fsCount = snap.data().count;
  const srcCount = source[table].length;
  const match = fsCount >= srcCount; // ≥: reruns may have extra docs from later app writes
  if (!match) allGood = false;
  console.log(
    `${match ? "✓" : "✗"} ${table}: source ${srcCount} → firestore ${fsCount}`
  );
}

const srcBalance = money(
  source.partners.reduce((s, p) => s + num(p.currentBalance), 0)
);
const fsPartners = await db.collection("partners").get();
const fsBalance = money(
  fsPartners.docs.reduce((s, d) => s + num(d.data().currentBalance), 0)
);
const balanceMatch = srcBalance === fsBalance;
if (!balanceMatch) allGood = false;
console.log(
  `${balanceMatch ? "✓" : "✗"} Σ partners.currentBalance: source $${srcBalance} → firestore $${fsBalance}`
);

const srcResult = money(
  source.trades.reduce((s, t) => s + num(t.result), 0)
);
const fsTrades = await db.collection("trades").get();
const fsResult = money(
  fsTrades.docs.reduce((s, d) => s + num(d.data().result), 0)
);
const resultMatch = srcResult === fsResult;
if (!resultMatch) allGood = false;
console.log(
  `${resultMatch ? "✓" : "✗"} Σ trades.result: source $${srcResult} → firestore $${fsResult}`
);

console.log("──────────────────────");
if (allGood) {
  ok("MIGRATION COMPLETE — all checks passed");
} else {
  fail("Migration finished with mismatches — see ✗ lines above. Do NOT cut over yet.");
}
