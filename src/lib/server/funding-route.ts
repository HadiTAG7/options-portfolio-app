import { gpRoute } from "@/lib/server/gp-route";
import type { Firestore } from "firebase-admin/firestore";

// The /api/funding/* routes: GP-only, Firebase-only (see gpRoute).
export function fundingRoute(
  request: Request,
  handler: (ctx: { db: Firestore; uid: string; body: Record<string, unknown> }) => Promise<unknown>
): Promise<Response> {
  return gpRoute(request, handler, { firebaseOnlyMessage: "يوم التمويل يعمل مع Firebase فقط" });
}
