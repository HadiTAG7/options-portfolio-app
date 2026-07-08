import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Alghanim Options Desk | Proprietary Trading",
  description: "Alghanim Options Desk - Proprietary Trading & Portfolio Management",
};

// Drives the Android status-bar tint when the app launches from the
// home screen (PWA install + Capacitor WebView both read it). Matches
// the manifest's theme_color so the system chrome blends with the
// dashboard's emerald accent.
export const viewport: Viewport = {
  themeColor: "#10b981",
  width: "device-width",
  initialScale: 1,
  // Use the area behind the notch / status bar so the standalone app
  // renders edge-to-edge instead of leaving a white safe-area strip.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // JetBrains Mono + Material Symbols are self-hosted from
  // public/fonts/ via @font-face in globals.css (see the font blocks
  // there). No CDN <link> tags: the Capacitor APK must render numbers
  // and icons with zero network access.
  return (
    <html lang="ar" dir="rtl" className="dark" suppressHydrationWarning>
      <head>
        {/* No-flash theme: set the <html> class from localStorage BEFORE
            first paint (default dark). suppressHydrationWarning above
            because this mutates the class before React hydrates. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('theme');if(t!=='light'&&t!=='dark')t='dark';var e=document.documentElement;e.classList.remove('light','dark');e.classList.add(t);}catch(e){}})();",
          }}
        />
      </head>
      <body className="bg-background text-on-surface antialiased overflow-x-hidden">
        {children}
      </body>
    </html>
  );
}
