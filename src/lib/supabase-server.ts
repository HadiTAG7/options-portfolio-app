// SERVER-ONLY Supabase helpers. Never import this from client components —
// it uses the service-role key, which must never reach the browser.

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Elevated client that bypasses RLS. Used by the investor portal routes to
// read all partners/trades (needed to compute a single investor's ownership
// and profit share) while returning ONLY that investor's own figures.
export function serviceClient() {
  if (!url || !serviceRoleKey) {
    throw new Error(
      "Server misconfigured: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for portal routes."
    );
  }
  return createClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// Validate the caller's Supabase access token (Authorization: Bearer <jwt>)
// and return the authenticated user's email, or null if unauthenticated.
export async function authedEmail(request: Request): Promise<string | null> {
  if (!url || !anonKey) return null;
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  const client = createClient<Database>(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  try {
    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user?.email) return null;
    return data.user.email;
  } catch {
    // Malformed token / transient failure → treat as unauthenticated.
    return null;
  }
}
