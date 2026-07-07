"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";

// Gate for the investor portal. Unauthenticated → /login; admins → the admin
// dashboard (they don't use the investor view). Investors are allowed through.
export function PortalGuard({ children }: { children: React.ReactNode }) {
  const { session, loading, role } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!session) {
      router.replace("/login");
    } else if (role === "admin") {
      router.replace("/");
    }
  }, [loading, session, role, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500/30 border-t-emerald-400" />
          <span className="font-headline text-[10px] uppercase tracking-[0.2em] text-zinc-500">
            جارٍ التحقق…
          </span>
        </div>
      </div>
    );
  }

  if (!session || role === "admin") return null;

  return <>{children}</>;
}
