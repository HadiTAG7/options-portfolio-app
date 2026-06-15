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
  return (
    <html lang="ar" dir="rtl" className="dark">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-background text-on-surface antialiased overflow-x-hidden">
        {children}
      </body>
    </html>
  );
}
