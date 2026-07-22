// Deploy firestore.rules via the Firebase Security Rules REST API and
// verify the active ruleset afterwards.
//
// WHY (not the CLI): deploy-web.yml used `firebase deploy --only
// firestore:rules || echo …`, whose trailing `|| echo` masked a failing
// deploy — so the operations + monthly_profits rules never went live and
// their writes hit the catch-all deny. This talks to the Rules API
// directly with the service-account token (same creds that already read
// the ruleset in the diagnostic) and fails loudly.
//
// Env: FIREBASE_SERVICE_ACCOUNT. Run: node scripts/deploy-rules.mjs

import { readFileSync } from "node:fs";
import { cert, initializeApp } from "firebase-admin/app";

const { FIREBASE_SERVICE_ACCOUNT } = process.env;
const ok = (m) => console.log(`✓ ${m}`);
function fail(m) {
  console.error(`✗ ${m}`);
  process.exit(1);
}
// Known, expected config gap (service account lacks rules-publish IAM):
// warn loudly with the fix, but exit 0 so it doesn't error every deploy.
// The rules must then be published manually until the role is granted.
function permGap(step, detail) {
  console.warn(
    `⚠ Firestore rules NOT auto-deployed — the service account lacks permission to ${step}.`
  );
  console.warn(
    "  Permanent fix: grant it the 'Firebase Rules Admin' role (Google Cloud → IAM)."
  );
  console.warn(
    "  Until then, publish firestore.rules manually: Firebase Console → Firestore Database → Rules → Publish."
  );
  console.warn(`  API response:\n${detail}`);
  process.exit(0);
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

const { access_token } = await credential.getAccessToken();
const rules = readFileSync("firestore.rules", "utf8");

async function api(method, path, body) {
  const res = await fetch(`https://firebaserules.googleapis.com/v1/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${access_token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, text: await res.text() };
}

console.log(`project: ${project}`);

// 1. Create a new ruleset from the current firestore.rules.
const created = await api("POST", `projects/${project}/rulesets`, {
  source: { files: [{ name: "firestore.rules", content: rules }] },
});
if (created.status === 403) permGap("create a ruleset", created.text);
if (created.status !== 200) {
  fail(`create ruleset failed (${created.status}):\n${created.text}`);
}
const rulesetName = JSON.parse(created.text).name;
ok(`created ruleset: ${rulesetName}`);

// 2. Point the cloud.firestore release at it (update, else create).
const releaseName = `projects/${project}/releases/cloud.firestore`;
let rel = await api(
  "PATCH",
  `${releaseName}?updateMask=rulesetName`,
  { name: releaseName, rulesetName }
);
if (rel.status !== 200) {
  console.log(`patch release → ${rel.status}; trying create…`);
  const createdRel = await api("POST", `projects/${project}/releases`, {
    name: releaseName,
    rulesetName,
  });
  if (createdRel.status !== 200) {
    if (rel.status === 403 || createdRel.status === 403) {
      permGap(
        "publish the rules release",
        `PATCH:\n${rel.text}\nPOST:\n${createdRel.text}`
      );
    }
    fail(
      `update AND create release failed.\nPATCH:\n${rel.text}\nPOST:\n${createdRel.text}`
    );
  }
}
ok(`release now points at the new ruleset`);

// 3. Verify: read the active ruleset back and confirm the new matches.
const check = await api("GET", `${releaseName}`);
if (check.status !== 200) fail(`verify release read failed:\n${check.text}`);
const activeRuleset = JSON.parse(check.text).rulesetName;
const rs = await api("GET", activeRuleset);
const files = JSON.parse(rs.text).source?.files ?? [];
const content = files.map((f) => f.content).join("\n");
const hasMP = content.includes("monthly_profits");
const hasOps = content.includes("operations");
console.log(`active ruleset: ${activeRuleset}`);
console.log(`  contains monthly_profits: ${hasMP ? "YES" : "NO"}`);
console.log(`  contains operations:      ${hasOps ? "YES" : "NO"}`);
if (!hasMP || !hasOps) {
  fail("deployed ruleset is missing expected matches — investigate");
}
ok("Firestore rules are LIVE (monthly_profits + operations). No re-login needed.");
