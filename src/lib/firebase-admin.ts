// Firebase Admin SDK singletons — SERVER ONLY (API routes). Reads the
// service-account JSON from the FIREBASE_SERVICE_ACCOUNT env var (the
// same value stored as a GitHub secret for the migration workflow).
// Never import this from client components.
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

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

export function adminAuth(): Auth {
  return getAuth(adminApp());
}

export function adminDb(): Firestore {
  return getFirestore(adminApp());
}
