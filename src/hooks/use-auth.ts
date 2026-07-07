"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Session } from "@supabase/supabase-js";

export type UserRole = "admin" | "investor" | null;

// A user is an admin only if their JWT carries app_metadata.role === 'admin'
// (set server-side in Supabase — investors cannot forge it). Everyone else
// with a session is treated as an investor.
function roleFromSession(session: Session | null): UserRole {
  if (!session) return null;
  const appMeta = session.user.app_metadata as { role?: string } | undefined;
  return appMeta?.role === "admin" ? "admin" : "investor";
}

// Tracks the current Supabase auth session and keeps it live via
// onAuthStateChange (login, logout, token refresh). `loading` is true until
// the initial getSession() resolves so callers can avoid flashing content.
export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setLoading(false);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return {
    session,
    loading,
    role: roleFromSession(session),
    email: session?.user?.email ?? null,
  };
}
