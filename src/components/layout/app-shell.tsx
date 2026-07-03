"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { LogOut } from "lucide-react";
import { Sidebar } from "./sidebar";
import { SidebarProvider, useSidebar } from "./sidebar-context";
import { TopBar } from "./top-bar";
import { useAuth } from "@/hooks/use-auth";

interface AppShellProps {
  children: React.ReactNode;
}

// Auth enforcement is an explicit build-time switch. Rollout order
// matters: deploy this code (switch off → app behaves exactly as
// before) → create the 6 auth users in the Supabase dashboard → link
// them to partner rows → run migration 013 (locks RLS) → rebuild with
// NEXT_PUBLIC_AUTH_ENFORCED=1. Flipping the switch before the accounts
// exist would lock everyone out.
const AUTH_ENFORCED = process.env.NEXT_PUBLIC_AUTH_ENFORCED === "1";

export function AppShell({ children }: AppShellProps) {
  if (!AUTH_ENFORCED) {
    return (
      <SidebarProvider>
        <AppShellInner>{children}</AppShellInner>
      </SidebarProvider>
    );
  }
  return (
    // Suspense: useSearchParams inside the guard must be prerender-safe
    // for the static export.
    <Suspense fallback={<ShellSplash />}>
      <GuardedShell>{children}</GuardedShell>
    </Suspense>
  );
}

function ShellSplash() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <span className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-800 border-t-emerald-400" />
    </div>
  );
}

// Routing rules when enforcement is on:
//   anonymous            → /login
//   GP (isAdmin partner) → full app
//   LP                   → only their own details page; anything else
//                          redirects there. Writes are hidden by RLS
//                          anyway — this is UX, not the security layer.
function GuardedShell({ children }: AppShellProps) {
  const { checking, session, partner, isGP, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const ownDetailsPath = partner
    ? `/partners/details?id=${partner.id}`
    : null;
  const onOwnDetails =
    pathname.startsWith("/partners/details") &&
    searchParams.get("id") === partner?.id;

  useEffect(() => {
    if (checking) return;
    if (!session) {
      router.replace("/login");
      return;
    }
    if (!isGP && ownDetailsPath && !onOwnDetails) {
      router.replace(ownDetailsPath);
    }
  }, [checking, session, isGP, ownDetailsPath, onOwnDetails, router]);

  if (checking || !session) return <ShellSplash />;

  // Signed in but no linked partner row: surface it instead of a loop.
  if (!partner) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <p className="text-sm text-zinc-300">
          حسابك غير مرتبط بأي شريك — تواصل مع مدير الصندوق
        </p>
        <p className="font-mono text-[10px] text-zinc-600">
          {session.user.email}
        </p>
        <button
          onClick={() => void signOut()}
          className="rounded-md border border-zinc-800/70 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-zinc-400 transition-colors hover:bg-white/5 hover:text-white"
        >
          تسجيل الخروج
        </button>
      </div>
    );
  }

  if (!isGP) {
    // LP layout: no sidebar/topbar — a slim header with sign-out, then
    // the (redirect-guarded) content.
    return (
      <div className="min-h-screen">
        <header className="fixed inset-x-0 top-0 z-40 flex items-center justify-between border-b border-zinc-800/60 bg-zinc-950/80 px-6 py-3 backdrop-blur">
          <div>
            <p className="text-sm font-bold text-white">{partner.name}</p>
            <p className="text-[10px] uppercase tracking-widest text-zinc-500">
              محفظة الخيارات · حساب شريك
            </p>
          </div>
          <button
            onClick={() => void signOut()}
            className="inline-flex items-center gap-2 rounded-md border border-zinc-800/70 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-zinc-400 transition-colors hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-300"
          >
            <LogOut size={12} />
            خروج
          </button>
        </header>
        <main className="pt-20 px-4 pb-12 max-w-[1800px] mx-auto">
          {onOwnDetails ? children : <ShellSplash />}
        </main>
      </div>
    );
  }

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
