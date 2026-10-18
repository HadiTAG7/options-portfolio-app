// Tests the REST-based Firebase Auth admin helpers against the Auth
// EMULATOR only. Run:
//   npx firebase-tools emulators:exec --only auth --project demo-funding \
//     "npx tsx scripts/test-identity-admin.ts"
import assert from "node:assert/strict";
import {
  IdentityError,
  createAuthUser,
  findAuthUserByEmail,
  getAuthClaims,
  setAuthClaims,
  setAuthPassword,
} from "@/lib/server/identity-admin";

const host = process.env.FIREBASE_AUTH_EMULATOR_HOST;
if (!host) {
  console.error("✗ FIREBASE_AUTH_EMULATOR_HOST not set — refusing to touch real accounts.");
  process.exit(1);
}

async function signIn(email: string, password: string): Promise<boolean> {
  const res = await fetch(
    `http://${host}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    }
  );
  return res.ok;
}

let passed = 0;
async function step(name: string, fn: () => Promise<void>) {
  try { await fn(); passed++; console.log(`✓ ${name}`); } catch (e) { console.error(`✗ ${name}`); throw e; }
}

async function main() {
  const email = `mujahid.${Date.now()}@example.com`;
  let uid = "";

  await step("create an account (the «إنشاء ربط» path)", async () => {
    uid = await createAuthUser(email, "first-pass-123");
    assert.ok(uid.length > 0);
    assert.ok(await signIn(email, "first-pass-123"), "can sign in");
  });

  await step("same email again → EMAIL_EXISTS, then link by lookup", async () => {
    await assert.rejects(createAuthUser(email, "other-pass-123"), (e: unknown) =>
      e instanceof IdentityError && e.code === "EMAIL_EXISTS"
    );
    assert.equal(await findAuthUserByEmail(email), uid);
    assert.equal(await findAuthUserByEmail(`nobody.${Date.now()}@example.com`), null);
  });

  await step("claims are stamped and read back", async () => {
    await setAuthClaims(uid, { gp: false, partnerId: "p-mujahid" });
    assert.deepEqual(await getAuthClaims(uid), { gp: false, partnerId: "p-mujahid" });
  });

  await step("password reset works (the «إعادة تعيين كلمة المرور» path)", async () => {
    await setAuthPassword(uid, "second-pass-456");
    assert.ok(await signIn(email, "second-pass-456"), "new password works");
    assert.ok(!(await signIn(email, "first-pass-123")), "old password rejected");
  });

  await step("weak password is a typed error", async () => {
    await assert.rejects(createAuthUser(`weak.${Date.now()}@example.com`, "123"), (e: unknown) =>
      e instanceof IdentityError && e.code === "WEAK_PASSWORD"
    );
  });

  console.log(`\n✓ ${passed} account steps passed (auth emulator)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
