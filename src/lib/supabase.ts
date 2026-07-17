import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { BACKEND } from "./backend";
import { createFirestoreCompatClient } from "./firestore-shim";

// THE backend switch. Every hook/store/page imports `supabase` from
// here; with NEXT_PUBLIC_BACKEND=firebase the same import returns the
// Firestore compat shim instead (same call surface, same shapes — see
// firestore-shim.ts), so no consumer changes at cutover. The cast is
// safe because the shim implements exactly the query/auth surface the
// app uses.
export const supabase: SupabaseClient<Database> =
  BACKEND === "firebase"
    ? (createFirestoreCompatClient() as unknown as SupabaseClient<Database>)
    : createClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
