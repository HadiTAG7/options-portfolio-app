import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "هادي كابيتال | Hadi Capital",
  description: "هادي كابيتال — إدارة الاستثمار والمحافظ | Hadi Capital — Investment & Portfolio Management",
  applicationName: "Hadi Capital",
  icons: { icon: "/brand/hadi-capital-icon.svg" },
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
