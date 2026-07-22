// Temporary diagnostic. Tests firebase-admin Firestore vs Auth SEPARATELY
// so we know Firestore-admin works even though firebase-admin/auth fails
// under Vercel's loader (jwks-rsa → jose ERR_REQUIRE_ESM). Delete once the
// send route is confirmed.
export const dynamic = "force-dynamic";

export async function GET() {
  const msg = (e: unknown) =>
    "FAIL: " + (e instanceof Error ? e.message : String(e));
  const out: Record<string, unknown> = {
    ok: true,
    node: process.version,
    hasServiceAccount: !!process.env.FIREBASE_SERVICE_ACCOUNT,
    hasGmailUser: !!process.env.GMAIL_USER,
    hasGmailPass: !!process.env.GMAIL_APP_PASSWORD,
  };
  try {
    const { adminDb } = await import("@/lib/firebase-admin");
    const snap = await adminDb().collection("partners").limit(1).get();
    out.adminDbFirestore = `ok (${snap.size} doc read)`;
  } catch (e) {
    out.adminDbFirestore = msg(e);
  }
  return Response.json(out);
}
