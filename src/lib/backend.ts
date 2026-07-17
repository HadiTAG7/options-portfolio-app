// Which backend the app talks to. Default is Supabase; the Firebase
// cutover is a deploy-time switch:
//   web:  set NEXT_PUBLIC_BACKEND=firebase in the hosting env + redeploy
//   APK:  set the APP_BACKEND repository variable to "firebase" + rerun
//         the Android workflow
// Rollback = remove the variable (or set it to "supabase") + redeploy.
// Works on both client and server (API routes read the same variable).
export const BACKEND: "supabase" | "firebase" =
  process.env.NEXT_PUBLIC_BACKEND === "firebase" ? "firebase" : "supabase";
