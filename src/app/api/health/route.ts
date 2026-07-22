// Temporary diagnostic. No static imports, so if THIS 500s the problem is
// route-handler infra on Vercel; if it returns JSON, the handler layer is
// fine and the payload tells us whether firebase-admin loads/inits and
// whether the env vars arrived. Delete once the send route is confirmed.
export const dynamic = "force-dynamic";

export async function GET() {
  const out: Record<string, unknown> = {
    ok: true,
    node: process.version,
    hasServiceAccount: !!process.env.FIREBASE_SERVICE_ACCOUNT,
    hasGmailUser: !!process.env.GMAIL_USER,
    hasGmailPass: !!process.env.GMAIL_APP_PASSWORD,
  };
  try {
    const mod = await import("@/lib/firebase-admin");
    mod.adminAuth();
    mod.adminDb();
    out.firebaseAdmin = "ok";
  } catch (e) {
    out.firebaseAdmin =
      "FAIL: " + (e instanceof Error ? e.message : String(e));
  }
  return Response.json(out);
}
