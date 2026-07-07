"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Mail, LogIn } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";

export default function LoginPage() {
  const router = useRouter();
  const { session, loading: authLoading, role } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Already signed in → route by role: admins to the dashboard, investors to
  // their portal. This also handles the post-login redirect: signInWithPassword
  // updates the session, which re-runs this effect.
  useEffect(() => {
    if (!authLoading && session) {
      router.replace(role === "admin" ? "/" : "/portal");
    }
  }, [authLoading, session, role, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) {
        setError("بيانات الدخول غير صحيحة. تحقق من البريد وكلمة المرور.");
        return;
      }
      // The auth-state change updates `session`, and the effect above
      // redirects by role (admin → /, investor → /portal).
    } catch {
      setError("تعذّر الاتصال بالخادم. حاول مرة أخرى.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="font-headline text-lg font-black uppercase tracking-[0.18em] text-emerald-400">
            AlGhanim Options Desk
          </h1>
          <p className="mt-2 font-headline text-[10px] uppercase tracking-[0.2em] text-zinc-600">
            تسجيل الدخول للمتابعة
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-lg border border-[#1f1f1f] bg-black/40 p-6"
        >
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold text-zinc-400">
              البريد الإلكتروني
            </span>
            <div className="relative">
              <Mail
                size={14}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600"
              />
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border border-[#1f1f1f] bg-black/50 py-2 pr-9 pl-3 text-sm text-zinc-100 outline-none transition-all focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/20"
                placeholder="you@example.com"
                dir="ltr"
              />
            </div>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold text-zinc-400">
              كلمة المرور
            </span>
            <div className="relative">
              <Lock
                size={14}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600"
              />
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border border-[#1f1f1f] bg-black/50 py-2 pr-9 pl-3 text-sm text-zinc-100 outline-none transition-all focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/20"
                placeholder="••••••••"
                dir="ltr"
              />
            </div>
          </label>

          {error && (
            <p className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-300">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-emerald-500 py-2.5 text-sm font-bold text-black transition-all hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <LogIn size={15} />
            {submitting ? "جارٍ الدخول…" : "دخول"}
          </button>
        </form>
      </div>
    </div>
  );
}
