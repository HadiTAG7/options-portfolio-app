"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";

// Client-side gate rendered around the whole app shell. It redirects
// unauthenticated visitors to /login. NOTE: this is a UX convenience, not
// the security boundary — Row Level Security (see migration 015) denies the
// anon role at the database, so data cannot be read/written without a valid
// session even if this guard is bypassed.
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !session) {
      router.replace("/login");
    }
  }, [loading, session, router]);

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

  // While the redirect to /login is in flight, render nothing.
  if (!session) return null;

  return <>{children}</>;
}
