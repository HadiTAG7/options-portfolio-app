"use client";

import { Sidebar } from "./sidebar";
import { SidebarProvider, useSidebar } from "./sidebar-context";
import { TopBar } from "./top-bar";
import { AuthGuard } from "@/components/auth/auth-guard";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <AuthGuard>
      <SidebarProvider>
        <AppShellInner>{children}</AppShellInner>
      </SidebarProvider>
    </AuthGuard>
  );
}

function AppShellInner({ children }: AppShellProps) {
  const { collapsed, mobileOpen, closeMobile } = useSidebar();
  return (
    <>
      <Sidebar />
      {/* Mobile backdrop — tap to close the drawer */}
      {mobileOpen && (
        <div
          onClick={closeMobile}
          aria-hidden="true"
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
        />
      )}
      <main
        className={`min-h-screen transition-[margin] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] mr-0 ${
          collapsed ? "md:mr-16" : "md:mr-64"
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
