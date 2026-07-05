"use client";

import { useState, useEffect, useRef } from "react";
import { Icon } from "@/components/ui/icon";

interface AddPartnerDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (name: string, initialCapital: number) => Promise<void>;
}

export function AddPartnerDialog({ open, onClose, onSubmit }: AddPartnerDialogProps) {
  const [name, setName] = useState("");
  const [capital, setCapital] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setName("");
      setCapital("");
      setError(null);
      setSubmitting(false);
      // Focus the name input after a tick
      setTimeout(() => nameRef.current?.focus(), 50);
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !submitting) onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, submitting, onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("يرجى إدخال اسم الشريك");
      return;
    }

    const numericCapital = parseFloat(capital);
    if (!capital || isNaN(numericCapital) || numericCapital <= 0) {
      setError("يرجى إدخال مبلغ صحيح أكبر من صفر");
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit(trimmedName, numericCapital);
      onClose();
    } catch (err: unknown) {
      console.error("[AddPartnerDialog] Submission error:", err);
      const supabaseMsg =
        err && typeof err === "object" && "message" in err
          ? (err as { message: string }).message
          : null;

      if (supabaseMsg?.includes("permission")) {
        setError("ليس لديك صلاحية لإضافة شريك. تحقق من سياسات RLS في Supabase.");
      } else if (
        supabaseMsg?.includes("column") &&
        supabaseMsg?.includes("schema cache")
      ) {
        setError(
          "أحد الأعمدة مفقود في قاعدة البيانات. يرجى تشغيل ملفات الهجرة."
        );
      } else if (supabaseMsg?.includes("duplicate key")) {
        setError("رمز الشريك مستخدم مسبقًا. يرجى المحاولة مرة أخرى.");
      } else {
        setError(supabaseMsg || "فشل في إضافة الشريك. يرجى المحاولة مرة أخرى.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  // Preview initials
  const previewInitials = name
    .trim()
    .split(/\s+/)
    .map((w) => w[0] || "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-md"
        onClick={() => !submitting && onClose()}
      />

      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-lg mx-4 overflow-hidden rounded-xl border border-zinc-800/70 bg-gradient-to-br from-zinc-900/95 via-zinc-950/95 to-black shadow-[0_0_60px_-12px_rgba(16,185,129,0.3)] backdrop-blur-xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800/70 bg-zinc-950/60 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md border border-emerald-500/30 bg-emerald-500/10">
              <Icon name="person_add" className="text-emerald-400 !text-lg" />
            </div>
            <div>
              <h3 className="text-sm font-headline font-bold text-white">إضافة شريك جديد</h3>
              <p className="text-[10px] uppercase tracking-widest text-zinc-500">Add New Partner</p>
            </div>
          </div>
          <button
            onClick={() => !submitting && onClose()}
            className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-white/5 hover:text-white"
          >
            <Icon name="close" className="!text-xl" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Initials Preview — mirrors the partners-table avatar style */}
          {previewInitials && (
            <div className="flex justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full border border-emerald-500/30 bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 font-headline text-xl font-bold text-emerald-400 shadow-[0_0_12px_-4px_rgba(52,211,153,0.4)]">
                {previewInitials}
              </div>
            </div>
          )}

          {/* Name Field */}
          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-widest text-zinc-400 font-bold block">
              اسم الشريك (Partner Name)
            </label>
            <input
              ref={nameRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثال: سالم العامري"
              disabled={submitting}
              className="w-full rounded-md border border-zinc-700/60 bg-zinc-950/80 px-4 py-3 text-sm text-white outline-none transition-all placeholder:text-zinc-600 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/40 disabled:opacity-50"
            />
          </div>

          {/* Capital Field */}
          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-widest text-zinc-400 font-bold block">
              رأس المال الأولي (Initial Capital)
            </label>
            <div className="relative">
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-600 text-sm font-mono">
                $
              </span>
              <input
                type="number"
                value={capital}
                onChange={(e) => setCapital(e.target.value)}
                placeholder="0.00"
                min="0"
                step="0.01"
                disabled={submitting}
                className="w-full rounded-md border border-zinc-700/60 bg-zinc-950/80 pr-8 pl-4 py-3 text-sm text-white font-mono tabular-nums outline-none transition-all placeholder:text-zinc-600 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/40 disabled:opacity-50"
              />
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
              <Icon name="error" className="!text-base" />
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => !submitting && onClose()}
              disabled={submitting}
              className="flex-1 px-4 py-2.5 rounded-md border border-zinc-800/70 text-zinc-400 text-xs font-bold uppercase tracking-widest hover:bg-white/5 hover:text-white transition-colors disabled:opacity-50"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 px-4 py-2.5 rounded-md bg-emerald-500 text-zinc-950 text-xs font-bold uppercase tracking-widest shadow-[0_0_20px_-6px_rgba(16,185,129,0.7)] hover:bg-emerald-400 transition-colors disabled:opacity-70 flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <span className="w-3 h-3 border-2 border-zinc-900/30 border-t-zinc-900 rounded-full animate-spin" />
                  جاري الإضافة...
                </>
              ) : (
                <>
                  <Icon name="add" className="!text-sm" />
                  إضافة الشريك
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
