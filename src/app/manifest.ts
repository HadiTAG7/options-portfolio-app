import type { MetadataRoute } from "next";

// Required by `output: 'export'` — without it Next.js bails the static
// export when it encounters the manifest route handler.
export const dynamic = "force-static";

// Web App Manifest. Powers two things:
//   1. PWA install (Add to Home Screen on Android / desktop Chrome).
//   2. Capacitor reads start_url and display when generating the
//      Android wrapper, so they should match the production app's
//      branding.
//
// Theme + background colours track the dashboard's emerald-on-zinc-950
// palette (used in the AUM card and the AppShell background) so the
// splash screen blends into the first paint instead of flashing white.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "محفظة الخيارات · Alghanim Options Desk",
    short_name: "محفظة الخيارات",
    description:
      "Proprietary options & portfolio management for Alghanim Options Desk",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    lang: "ar",
    dir: "rtl",
    theme_color: "#10b981",
    background_color: "#09090b",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
