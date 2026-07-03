"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LockKeyhole, LogIn } from "lucide-react";
import { supabase } from "@/lib/supabase";

// Standalone sign-in page (no AppShell — it must render for anonymous
// users). Email + password via Supabase Auth; accounts are provisioned
// by the GP from the Supabase dashboard and linked to partner rows via
// partners.auth_user_id (see migration 013).
export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password) {
      setError("يرجى إدخال البريد الإلكتروني وكلمة المرور");
      return;
    }

    setSubmitting(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setSubmitting(false);

    if (signInError) {
      setError(
        signInError.message === "Invalid login credentials"
          ? "بيانات الدخول غير صحيحة"
          : signInError.message
      );
      return;
    }

    router.replace("/");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-500/30 bg-emerald-500/10 shadow-[0_0_40px_-8px_rgba(16,185,129,0.5)]">
            <LockKeyhole size={24} className="text-emerald-400" />
          </div>
          <h1 className="font-headline text-xl font-bold tracking-tight text-white">
            محفظة الخيارات
          </h1>
          <p className="mt-1 text-[10px] uppercase tracking-[0.25em] text-zinc-500 font-semibold">
            Alghanim Options Desk
          </p>
        </div>

        {/* Card */}
        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-xl border border-zinc-800/60 bg-gradient-to-br from-zinc-900/80 to-zinc-950/90 p-6 backdrop-blur-sm"
        >
          <div className="space-y-2">
            <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-400">
              البريد الإلكتروني
            </label>
            <input
              type="email"
              dir="ltr"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={submitting}
              className="w-full rounded-md border border-zinc-800/70 bg-black/60 px-4 py-3 text-left font-mono text-sm text-white outline-none transition-all placeholder:text-zinc-600 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 disabled:opacity-50"
              placeholder="you@example.com"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-400">
              كلمة المرور
            </label>
            <input
              type="password"
              dir="ltr"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={submitting}
              className="w-full rounded-md border border-zinc-800/70 bg-black/60 px-4 py-3 text-left font-mono text-sm text-white outline-none transition-all placeholder:text-zinc-600 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 disabled:opacity-50"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-300">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-emerald-500 px-4 py-3 text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-950 shadow-[0_0_20px_-6px_rgba(16,185,129,0.7)] transition-all hover:bg-emerald-400 active:scale-[0.98] disabled:opacity-60"
          >
            {submitting ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-zinc-900/30 border-t-zinc-900" />
                جاري الدخول...
              </>
            ) : (
              <>
                <LogIn size={14} />
                تسجيل الدخول
              </>
            )}
          </button>

          <p className="pt-1 text-center text-[10px] leading-relaxed text-zinc-600">
            الحسابات تُنشأ من قبل مدير الصندوق فقط
          </p>
        </form>
      </div>
    </main>
  );
}
