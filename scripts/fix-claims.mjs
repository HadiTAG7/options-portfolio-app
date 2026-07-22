// One-off repair: stamp the gp/partnerId custom claims on each partner's
// Firebase auth account and backfill partners.auth_user_id.
//
// WHY: firestore.rules gate every WRITE on request.auth.token.gp == true.
// The migration (migrate-to-firebase.mjs) only stamps that claim for
// partners whose row already had `auth_user_id`; any GP/partner missing
// it at migration time got NO claim, so their signed-in writes fail with
// "Missing or insufficient permissions" even though the app shows them GP
// controls (those key off the row's isAdmin flag, a separate signal).
//
// This reconciles partners → Firebase auth users (by auth_user_id, else
// by email), sets { gp: isAdmin===true, partnerId }, and links the row.
// Idempotent and money-safe: it never touches balances or trades.
//
// DRY RUN by default (prints before/after, writes nothing).
// Set APPLY=1 to write. Affected users must sign out and back in
// afterwards so their ID token picks up the new claim.
//
// Env: FIREBASE_SERVICE_ACCOUNT (service-account JSON string).
// Run:  APPLY=1 node scripts/fix-claims.mjs

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

const { FIREBASE_SERVICE_ACCOUNT, APPLY } = process.env;
const apply = APPLY === "1";

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
  fail(`Could not parse FIREBASE_SERVICE_ACCOUNT JSON: ${e.message}`);
}

initializeApp({ credential: cert(credJson) });
const db = getFirestore();
const auth = getAuth();

console.log(
  apply ? "MODE: APPLY (writing claims + links)" : "MODE: DRY RUN (no writes)"
);

// 1. Partners.
const pSnap = await db.collection("partners").get();
const partners = pSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
ok(`loaded ${partners.length} partners`);

// 2. All Firebase auth users → lowercase-email map.
const byEmail = new Map();
let pageToken;
let userCount = 0;
do {
  const res = await auth.listUsers(1000, pageToken);
  for (const u of res.users) {
    userCount++;
    if (u.email) byEmail.set(u.email.toLowerCase(), u);
  }
  pageToken = res.pageToken;
} while (pageToken);
ok(`loaded ${userCount} Firebase auth users`);

// 3. Reconcile each partner.
let fixed = 0;
let already = 0;
let linked = 0;
let skipped = 0;

for (const p of partners) {
  if (p.archived_at) continue;
  const wantGp = p.isAdmin === true;

  let uid = p.auth_user_id || null;
  let user = null;
  if (uid) {
    try {
      user = await auth.getUser(uid);
    } catch {
      user = null; // stale/incorrect link — fall through to email match
    }
  }
  if (!user && p.email) {
    user = byEmail.get(String(p.email).toLowerCase()) || null;
    if (user) uid = user.uid;
  }

  if (!user) {
    warn(`SKIP  ${p.name} (${p.email || "no email"}): no matching auth user`);
    skipped++;
    continue;
  }

  const cur = user.customClaims || {};
  const needClaims = cur.gp !== wantGp || cur.partnerId !== String(p.id);
  const needLink = p.auth_user_id !== uid;

  console.log(
    `• ${p.name}${wantGp ? " [GP]" : ""}  uid=${uid}\n` +
      `    before: gp=${cur.gp ?? "unset"} partnerId=${cur.partnerId ?? "unset"} | row.auth_user_id=${p.auth_user_id ?? "unset"}\n` +
      `    action: ${
        needClaims ? `set gp=${wantGp} partnerId=${p.id}` : "claims ok"
      }${needLink ? " + link row" : ""}`
  );

  if (!needClaims && !needLink) {
    already++;
    continue;
  }
  if (apply) {
    if (needClaims) {
      await auth.setCustomUserClaims(uid, {
        gp: wantGp,
        partnerId: String(p.id),
      });
    }
    if (needLink) {
      await db
        .collection("partners")
        .doc(p.id)
        .set({ auth_user_id: uid }, { merge: true });
      linked++;
    }
    fixed++;
  }
}

console.log("─".repeat(28));
console.log(
  `${apply ? "APPLIED" : "WOULD FIX"}: ${fixed} | already-ok: ${already} | rows linked: ${linked} | skipped: ${skipped}`
);
if (!apply) {
  console.log("Re-run with APPLY=1 (commit flag [claims-apply]) to write.");
} else {
  ok(
    "Done. Affected users must SIGN OUT and SIGN IN again to refresh their token."
  );
}
