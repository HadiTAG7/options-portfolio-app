// Where the app's own /api/* routes actually live.
//
// The same client bundle runs from three very different places:
//   • the Vercel deployment — the ONLY origin that has the server routes;
//   • Firebase Hosting — a static export, no server at all;
//   • the Android APK — the same static export inside a WebView
//     (origin https://localhost).
//
// A relative fetch("/api/…") therefore works on Vercel and silently hits
// a static 404 everywhere else — which is exactly how «إرسال» came to
// work on one URL and "fail" on the other while being the same app. Every
// client-side API call goes through apiUrl() instead: relative where the
// routes exist, absolute to the canonical deployment where they don't.
// The server answers those cross-origin calls with an explicit CORS
// allowlist (src/lib/cors.ts).
const CANONICAL_API_ORIGIN = "https://options-portfolio-app.vercel.app";

export function apiUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;

  // Explicit override wins (set at build time when needed).
  const env = process.env.NEXT_PUBLIC_API_ORIGIN?.trim();
  if (env) return `${env.replace(/\/+$/, "")}${p}`;

  // On the server (the route runtime itself) relative is always right.
  if (typeof window === "undefined") return p;

  // The APK is compiled with NEXT_PUBLIC_PLATFORM=mobile and never has
  // routes of its own.
  if (process.env.NEXT_PUBLIC_PLATFORM === "mobile") {
    return `${CANONICAL_API_ORIGIN}${p}`;
  }

  const { hostname, protocol } = window.location;
  // `next dev` serves the routes on plain http://localhost. (The APK's
  // WebView origin is https://localhost — https, so it does NOT match.)
  const isDevServer =
    protocol === "http:" &&
    (hostname === "localhost" || hostname === "127.0.0.1");
  const isVercel = hostname.endsWith(".vercel.app");
  return isDevServer || isVercel ? p : `${CANONICAL_API_ORIGIN}${p}`;
}
