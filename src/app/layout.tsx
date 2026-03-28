import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Options Portfolio Manager",
  description: "Shared investment portfolio manager for options trading strategies",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
