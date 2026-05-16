"use client";

import { Sidebar } from "./sidebar";
import { SidebarProvider, useSidebar } from "./sidebar-context";
import { TopBar } from "./top-bar";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <SidebarProvider>
      <AppShellInner>{children}</AppShellInner>
    </SidebarProvider>
  );
}

function AppShellInner({ children }: AppShellProps) {
  const { collapsed } = useSidebar();
  return (
    <>
      <Sidebar />
      <main
        className={`min-h-screen transition-[margin] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${
          collapsed ? "mr-16" : "mr-64"
        }`}
      >
        <TopBar />
        <div className="pt-24 px-4 pb-12 max-w-[1800px] mx-auto">
          {children}
        </div>
      </main>
    </>
  );
}
