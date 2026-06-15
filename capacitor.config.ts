import type { CapacitorConfig } from "@capacitor/cli";

// Capacitor wraps the Next.js static export (`out/`) inside an Android
// WebView so the same codebase ships as an APK.
//
//   appId   — reverse-DNS identifier used by Play Store + sideload
//             install. Pick once; changing it later is messy.
//   webDir  — must point at the static export output directory.
//             `next build` with MOBILE_BUILD=1 writes to ./out
//   server  — left unset so the APK ships the bundle inside itself
//             (file:// URLs) and works offline-first. Only network
//             calls are the Supabase queries, which use the anon key.
const config: CapacitorConfig = {
  appId: "sa.abyancapital.options",
  appName: "محفظة الخيارات",
  webDir: "out",
  android: {
    allowMixedContent: false,
  },
};

export default config;
