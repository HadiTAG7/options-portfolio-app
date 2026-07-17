// Which backend the app talks to. CUTOVER DONE (2026-07-17): Firebase
// is the default — data, auth users (same passwords, same UIDs) and
// custom claims were migrated and verified against Supabase to the cent
// (run 29589084603: 6/33/4/7 docs, Σ balances $691,029.31 ✓).
//
// ROLLBACK: set NEXT_PUBLIC_BACKEND=supabase in the deploy env (web) /
// the APP_BACKEND repository variable (APK) and redeploy — the Supabase
// project was left untouched as the fallback.
export const BACKEND: "supabase" | "firebase" =
  process.env.NEXT_PUBLIC_BACKEND === "supabase" ? "supabase" : "firebase";
