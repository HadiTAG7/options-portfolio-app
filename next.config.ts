import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  compiler: {
    // Strip console.* (except console.error) from PRODUCTION builds so
    // partner PII, balances, and the trade book are never written into the
    // shipped browser console (visible in devtools, screen shares, or
    // recordings). Development keeps full logging for debugging.
    removeConsole:
      process.env.NODE_ENV === "production" ? { exclude: ["error"] } : false,
  },
};

export default nextConfig;
