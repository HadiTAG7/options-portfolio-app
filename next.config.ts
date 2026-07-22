import type { NextConfig } from "next";

// MOBILE_BUILD=1 switches the build into static-export mode so the
// output can be wrapped by Capacitor and shipped as an Android APK.
// Web builds (no env var) keep the default Node server target so the
// /api/reports/send-monthly route, image optimisation, and any future
// server features remain available.
const isMobileBuild = process.env.MOBILE_BUILD === "1";

const nextConfig: NextConfig = {
  // Keep heavy Node-only packages OUT of the traced serverless bundle so
  // their dynamic requires resolve at runtime. Without this, firebase-admin
  // (and its @google-cloud / grpc deps) fail to load inside the Vercel
  // function — the /api routes 500 at module init even though `next build`
  // and `next start` locally are fine (405/401 as expected).
  serverExternalPackages: ["firebase-admin", "nodemailer"],
  ...(isMobileBuild
    ? {
        output: "export",
        // Capacitor serves files from android_asset/public/ as file://
        // URLs — trailing slashes make each route resolve to its own
        // index.html, which avoids 404s on deep links inside the APK.
        trailingSlash: true,
        // next/image's default loader requires a server. None is
        // available inside a static export, so we opt every <Image>
        // out of optimisation in this build mode.
        images: { unoptimized: true },
      }
    : {}),
};

export default nextConfig;
