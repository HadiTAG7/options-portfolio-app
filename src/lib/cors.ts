// CORS for the app's own API routes, so the static deployments (Firebase
// Hosting, the Android APK WebView) can call the Vercel-hosted routes
// cross-origin. Named origins only — never "*": send-monthly and the
// admin routes take an Authorization bearer token, and a wildcard would
// invite any site to relay a signed-in GP's browser at them.
//
// Auth still happens inside each route (Firebase ID token verification);
// CORS here only decides which web origins a browser may deliver the
// response to.
const ALLOWED_ORIGINS = new Set([
  "https://option-porfolio.web.app", // Firebase Hosting (yes, that spelling)
  "https://option-porfolio.firebaseapp.com",
  "https://localhost", // Android APK WebView origin
  "http://localhost:3000", // next dev pointed at production APIs
]);

export function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin");
  // Same-origin requests carry no Origin (or their own) — no headers needed.
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

// The browser's preflight. 204 with the allowance (or without it, which
// the browser then refuses — that IS the deny).
export function corsPreflight(request: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

// Stamp CORS onto a route's real response.
export function withCors<T extends Response>(request: Request, response: T): T {
  for (const [k, v] of Object.entries(corsHeaders(request))) {
    response.headers.set(k, v);
  }
  return response;
}
