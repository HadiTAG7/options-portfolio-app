// Firebase Admin SDK singletons — SERVER ONLY (API routes). Reads the
// service-account JSON from the FIREBASE_SERVICE_ACCOUNT env var (the
// same value stored as a GitHub secret for the migration workflow).
// Never import this from client components.
//
// IMPORTANT: firebase-admin/auth is imported LAZILY (dynamic import inside
// adminAuth) — NOT at module top. Its jwks-rsa → jose dependency is
// ESM-only and throws ERR_REQUIRE_ESM under Vercel's serverless external-
// module loader, which would otherwise crash EVERY route that merely
// imports this module for Firestore. Routes that only need Firestore
// (adminDb) are now unaffected; token verification uses REST instead.
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import type { Auth } from "firebase-admin/auth";

function adminApp(): App {
  const existing = getApps();
  if (existing.length) return existing[0];
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT غير مضبوط في بيئة الخادم — أضف محتوى ملف service account كاملاً في إعدادات الاستضافة (server-only، ليس NEXT_PUBLIC)."
    );
  }
  return initializeApp({ credential: cert(JSON.parse(raw)) });
}

export function adminDb(): Firestore {
  return getFirestore(adminApp());
}

// Lazy — see the module note above. Awaiting this loads firebase-admin/auth
// on demand; on Vercel that still hits the jose ERR_REQUIRE_ESM, so prefer
// REST-based verification in routes. Kept for admin-only ops (creating
// accounts, setting custom claims) that have no REST equivalent.
export async function adminAuth(): Promise<Auth> {
  const { getAuth } = await import("firebase-admin/auth");
  return getAuth(adminApp());
}
