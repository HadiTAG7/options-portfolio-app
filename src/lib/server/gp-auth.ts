// Verify that a request comes from the fund manager (GP).
//
// Uses Google's Identity Toolkit REST endpoint instead of
// firebase-admin/auth: the latter pulls jwks-rsa → jose, which is ESM-only
// and crashes under Vercel's serverless loader (ERR_REQUIRE_ESM). The
// endpoint checks the ID token's signature and expiry server-side and
// returns the account with its custom claims, so the gp claim can be
// trusted. The web API key is public — it already ships in the client.
const FIREBASE_WEB_API_KEY = "AIzaSyBRJS4nWcPyVD97gQXm9G9yWFhMfxAK7E0";

export interface GPIdentity {
  uid: string;
}

// The GP's identity when the token is valid AND carries gp=true; null
// otherwise (bad token, expired, network failure, or not the GP).
export async function verifyGPToken(idToken: string): Promise<GPIdentity | null> {
  if (!idToken) return null;
  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_WEB_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      users?: Array<{ localId?: string; customAttributes?: string }>;
    };
    const user = data.users?.[0];
    if (!user?.customAttributes || !user.localId) return null;
    const claims = JSON.parse(user.customAttributes) as { gp?: boolean };
    return claims.gp === true ? { uid: user.localId } : null;
  } catch {
    return null;
  }
}

// Reads "Authorization: Bearer <idToken>".
export async function verifyGPRequest(request: Request): Promise<GPIdentity | null> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  return verifyGPToken(token);
}
