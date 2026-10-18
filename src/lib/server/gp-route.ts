import { BACKEND } from "@/lib/backend";
import { adminDb } from "@/lib/firebase-admin";
import { verifyGPRequest } from "@/lib/server/gp-auth";
import { RouteError } from "@/lib/server/route-error";
import type { Firestore } from "firebase-admin/firestore";

// Shared shell for GP-only server routes that write through the admin SDK:
// Firebase-only, JSON in and out, RouteError mapped to HTTP statuses. Every
// response carries the server's clock so a page can warn about a skewed
// device.
export async function gpRoute(
  request: Request,
  handler: (ctx: { db: Firestore; uid: string; body: Record<string, unknown> }) => Promise<unknown>,
  opts: { firebaseOnlyMessage: string }
): Promise<Response> {
  const serverTime = new Date().toISOString();
  if (BACKEND !== "firebase") {
    return Response.json({ ok: false, error: opts.firebaseOnlyMessage, serverTime }, { status: 501 });
  }
  const gp = await verifyGPRequest(request);
  if (!gp) {
    return Response.json({ ok: false, error: "سجّل الدخول كمدير", serverTime }, { status: 401 });
  }
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ ok: false, error: "طلب غير صالح", serverTime }, { status: 400 });
  }
  try {
    const result = await handler({ db: adminDb(), uid: gp.uid, body });
    return Response.json({ ok: true, serverTime, ...(result as object) });
  } catch (e) {
    if (e instanceof RouteError) {
      return Response.json(
        { ok: false, error: e.message, code: e.code, serverTime, ...(e.payload as object | undefined) },
        { status: e.status }
      );
    }
    console.error("[gpRoute] unexpected error:", e);
    return Response.json(
      { ok: false, error: "خطأ غير متوقع في الخادم — لم يُنفّذ شيء", serverTime },
      { status: 500 }
    );
  }
}
