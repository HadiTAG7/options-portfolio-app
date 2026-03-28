"use client";

import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <>
      <Sidebar />
      <main className="mr-64 min-h-screen">
        <TopBar />
        <div className="pt-24 px-8 pb-12 max-w-[1600px] mx-auto">
          {children}
        </div>
      </main>
    </>
  );
}
