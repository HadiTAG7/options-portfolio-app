"use client";

import { useState } from "react";
import { KeyRound, X } from "lucide-react";
import { supabase } from "@/lib/supabase";

// Self-contained "change my password" control for any signed-in user
// (investor or admin). Uses supabase.auth.updateUser, which authenticates
// via the active session — no email/SMTP or reset link required.
export function ChangePasswordButton({
  className,
}: {
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function reset() {
    setPw("");
    setConfirm("");
    setError(null);
    setDone(false);
    setBusy(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (pw.length < 8) {
      setError("كلمة المرور يجب ألا تقل عن 8 أحرف.");
      return;
    }
    if (pw !== confirm) {
      setError("كلمتا المرور غير متطابقتين.");
      return;
    }
    setBusy(true);
    try {
      const { error: upErr } = await supabase.auth.updateUser({ password: pw });
      if (upErr) {
        setError(upErr.message || "تعذّر تغيير كلمة المرور.");
        return;
      }
      setDone(true);
    } catch {
      setError("تعذّر الاتصال بالخادم.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={() => {
          reset();
          setOpen(true);
        }}
        aria-label="تغيير كلمة المرور"
        title="تغيير كلمة المرور"
        className={
          className ??
          "flex min-h-[44px] items-center gap-2 rounded-md border border-[#1f1f1f] px-3 py-2 text-[12px] text-zinc-400 transition-all hover:border-emerald-500/40 hover:text-emerald-300"
        }
      >
        <KeyRound size={14} />
        <span className="hidden sm:inline">تغيير كلمة المرور</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-lg border border-[#1f1f1f] bg-[#0a0a0a] p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-headline text-sm font-bold text-zinc-100">
                تغيير كلمة المرور
              </h3>
              <button
                onClick={() => setOpen(false)}
                className="-m-1 p-1 text-zinc-500 hover:text-zinc-300"
                aria-label="إغلاق"
              >
                <X size={16} />
              </button>
            </div>

            {done ? (
              <div className="space-y-4">
                <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-3 text-[13px] text-emerald-300">
                  ✓ تم تغيير كلمة المرور بنجاح.
                </p>
                <button
                  onClick={() => setOpen(false)}
                  className="w-full rounded-md bg-emerald-500 py-2.5 text-sm font-bold text-black transition-all hover:bg-emerald-400"
                >
                  تم
                </button>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-3">
                <label className="block">
                  <span className="mb-1 block text-[11px] text-zinc-400">
                    كلمة المرور الجديدة
                  </span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={pw}
                    onChange={(e) => setPw(e.target.value)}
                    dir="ltr"
                    className="w-full rounded-md border border-[#1f1f1f] bg-black/50 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/20"
                    placeholder="••••••••"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] text-zinc-400">
                    تأكيد كلمة المرور
                  </span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    dir="ltr"
                    className="w-full rounded-md border border-[#1f1f1f] bg-black/50 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/20"
                    placeholder="••••••••"
                  />
                </label>

                {error && (
                  <p className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-300">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={busy}
                  className="w-full rounded-md bg-emerald-500 py-2.5 text-sm font-bold text-black transition-all hover:bg-emerald-400 disabled:opacity-60"
                >
                  {busy ? "جارٍ الحفظ…" : "حفظ كلمة المرور الجديدة"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
