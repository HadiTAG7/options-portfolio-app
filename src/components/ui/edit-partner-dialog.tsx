"use client";

import { useState, useEffect, useRef } from "react";
import { Pencil, Save, X, Percent } from "lucide-react";
import { DatePicker } from "@/components/ui/date-picker";
import type { Partner } from "@/types";

export interface PartnerEditPayload {
  name: string;
  email: string;
  managementFeePercent: number;
  entryDate: string; // YYYY-MM-DD
}

interface EditPartnerDialogProps {
  open: boolean;
  partner: Partner | null;
  onClose: () => void;
  onSubmit: (id: string, payload: PartnerEditPayload) => Promise<void>;
}

export function EditPartnerDialog({
  open,
  partner,
  onClose,
  onSubmit,
}: EditPartnerDialogProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [feePercent, setFeePercent] = useState("");
  const [entryDate, setEntryDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open || !partner) return;
    setName(partner.name ?? "");
    setEmail(partner.email ?? "");
    setFeePercent(
      Number.isFinite(partner.managementFeeRate)
        ? String(partner.managementFeeRate)
        : ""
    );
    setEntryDate(partner.entryDate ?? "");
    setError(null);
    setSubmitting(false);
    setTimeout(() => nameRef.current?.focus(), 50);
  }, [open, partner]);

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
    if (!partner) return;
    setError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("يرجى إدخال اسم الشريك");
      return;
    }

    const fee = parseFloat(feePercent);
    if (!Number.isFinite(fee) || fee < 0 || fee > 100) {
      setError("نسبة الإدارة يجب أن تكون بين 0 و 100");
      return;
    }

    if (!entryDate) {
      setError("يرجى اختيار تاريخ الانضمام");
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit(partner.id, {
        name: trimmedName,
        email: email.trim(),
        managementFeePercent: fee,
        entryDate,
      });
      onClose();
    } catch (err: unknown) {
      console.error("[EditPartnerDialog] submission error:", err);
      const msg =
        err && typeof err === "object" && "message" in err
          ? (err as { message: string }).message
          : null;
      setError(msg || "فشل في حفظ التعديلات. يرجى المحاولة مرة أخرى.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open || !partner) return null;

  const inputBase =
    "w-full rounded-md border border-zinc-800/70 bg-black/60 px-4 py-3 text-sm text-white outline-none transition-all placeholder:text-zinc-600 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 disabled:opacity-50";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-md"
        onClick={() => !submitting && onClose()}
      />

      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-lg mx-4 overflow-hidden rounded-xl border border-zinc-800/70 bg-gradient-to-br from-zinc-900/95 via-zinc-950/95 to-black shadow-[0_0_60px_-12px_rgba(16,185,129,0.3)] backdrop-blur-xl"
      >
        <div className="flex items-center justify-between border-b border-zinc-800/70 bg-zinc-950/60 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md border border-emerald-500/30 bg-emerald-500/10">
              <Pencil size={14} className="text-emerald-400" />
            </div>
            <div>
              <h3 className="font-headline text-sm font-bold tracking-[0.18em] uppercase text-white">
                تعديل بيانات الشريك
              </h3>
              <p className="text-[10px] uppercase tracking-widest text-zinc-500">
                Edit Partner — {partner.name}
              </p>
            </div>
          </div>
          <button
            onClick={() => !submitting && onClose()}
            className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-white/5 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 p-6">
          <div className="space-y-2">
            <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-400">
              اسم الشريك{" "}
              <span className="text-zinc-600">(Partner Name)</span>
            </label>
            <input
              ref={nameRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={submitting}
              className={inputBase}
            />
          </div>

          <div className="space-y-2">
            <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-400">
              البريد الإلكتروني{" "}
              <span className="text-zinc-600">(Email)</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={submitting}
              placeholder="partner@example.com"
              dir="ltr"
              className={inputBase}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                تاريخ الانضمام{" "}
                <span className="text-zinc-600">(Date Joined)</span>
              </label>
              <DatePicker
                value={entryDate}
                onChange={setEntryDate}
                disabled={submitting}
                placeholder="اختر تاريخ الانضمام"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                رسوم الإدارة{" "}
                <span className="text-zinc-600">(Mgmt Fee %)</span>
              </label>
              <div className="relative">
                <Percent
                  size={14}
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-zinc-600"
                />
                <input
                  type="number"
                  value={feePercent}
                  onChange={(e) => setFeePercent(e.target.value)}
                  min="0"
                  max="100"
                  step="0.01"
                  disabled={submitting}
                  className={`${inputBase} pl-10 font-mono tabular-nums`}
                />
              </div>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
              {error}
            </div>
          )}

          <hr className="border-zinc-800/70" />

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => !submitting && onClose()}
              disabled={submitting}
              className="flex-1 rounded-md border border-zinc-700 px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white disabled:opacity-50"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex flex-1 items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-white shadow-[0_0_20px_-6px_rgba(16,185,129,0.5)] transition-all duration-200 hover:bg-emerald-500 hover:shadow-[0_0_28px_-4px_rgba(16,185,129,0.7)] active:scale-[0.98] disabled:opacity-70"
            >
              {submitting ? (
                <>
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  جاري الحفظ...
                </>
              ) : (
                <>
                  <Save size={12} />
                  حفظ التعديلات
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
