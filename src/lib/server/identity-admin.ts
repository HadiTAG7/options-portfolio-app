import { cert } from "firebase-admin/app";

// Firebase Auth admin operations over the Identity Toolkit REST API — the
// same endpoints firebase-admin/auth calls internally, without importing
// it. That module pulls jwks-rsa → jose, which is ESM-only and crashes
// under Vercel's serverless loader (ERR_REQUIRE_ESM) the moment it loads.
// The service-account access token comes from firebase-admin/app's
// credential (google-auth-library — no jose), the path Firestore already
// uses on Vercel.
//
// FIREBASE_AUTH_EMULATOR_HOST switches to the Auth emulator (tests).

export class IdentityError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

interface ServiceAccount {
  project_id: string;
}

async function endpoint(): Promise<{ base: string; token: string }> {
  const emulator = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (emulator) {
    const project = process.env.GCLOUD_PROJECT || "demo-funding";
    return {
      base: `http://${emulator}/identitytoolkit.googleapis.com/v1/projects/${project}`,
      token: "owner",
    };
  }
  if (!raw) throw new IdentityError("CONFIG", "FIREBASE_SERVICE_ACCOUNT غير مضبوط على الخادم");
  const json = JSON.parse(raw) as ServiceAccount & Record<string, unknown>;
  const { access_token } = await cert(json as Parameters<typeof cert>[0]).getAccessToken();
  return {
    base: `https://identitytoolkit.googleapis.com/v1/projects/${json.project_id}`,
    token: access_token,
  };
}

async function call<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const { base, token } = await endpoint();
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as {
    error?: { message?: string };
  } & T;
  if (!res.ok) {
    const raw = data.error?.message ?? `HTTP ${res.status}`;
    // Identity Toolkit codes look like "EMAIL_EXISTS" or
    // "WEAK_PASSWORD : Password should be at least 6 characters".
    const code = raw.split(":")[0].trim();
    throw new IdentityError(code, raw);
  }
  return data;
}

// Create an email/password account; EMAIL_EXISTS when the email is taken.
export async function createAuthUser(email: string, password: string): Promise<string> {
  const r = await call<{ localId?: string }>("/accounts", {
    email,
    password,
    emailVerified: true,
  });
  if (!r.localId) throw new IdentityError("NO_ID", "لم يُرجع الخادم معرف الحساب");
  return r.localId;
}

export async function findAuthUserByEmail(email: string): Promise<string | null> {
  const r = await call<{ users?: Array<{ localId?: string }> }>("/accounts:lookup", {
    email: [email],
  });
  return r.users?.[0]?.localId ?? null;
}

export async function setAuthPassword(uid: string, password: string): Promise<void> {
  await call("/accounts:update", { localId: uid, password });
}

// Custom claims are what firestore.rules authorize by (gp, partnerId).
export async function setAuthClaims(uid: string, claims: Record<string, unknown>): Promise<void> {
  await call("/accounts:update", { localId: uid, customAttributes: JSON.stringify(claims) });
}

export async function getAuthClaims(uid: string): Promise<Record<string, unknown> | null> {
  const r = await call<{ users?: Array<{ customAttributes?: string }> }>("/accounts:lookup", {
    localId: [uid],
  });
  const attrs = r.users?.[0]?.customAttributes;
  return attrs ? (JSON.parse(attrs) as Record<string, unknown>) : null;
}
