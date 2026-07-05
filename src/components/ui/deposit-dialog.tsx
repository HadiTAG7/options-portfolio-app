"use client";

import { useState, useEffect, useRef } from "react";
import { Icon } from "@/components/ui/icon";
import { formatCurrency, getPartnerInvestment } from "@/lib/utils";
import type { Partner } from "@/types";

interface DepositDialogProps {
  open: boolean;
  partner: Partner | null;
  onClose: () => void;
  onSubmit: (partner: Partner, amount: number) => Promise<void>;
}

export function DepositDialog({
  open,
  partner,
  onClose,
  onSubmit,
}: DepositDialogProps) {
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setAmount("");
      setError(null);
      setSubmitting(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !submitting) onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, submitting, onClose]);

  if (!open || !partner) return null;

  // Read straight from the partner record via the shared helper. This
  // is the same value shown in the Investment column and the same
  // value the WithdrawalDialog header reads — guaranteed to match to
  // the penny.
  const baseCapital = getPartnerInvestment(partner);

  const numericAmount = parseFloat(amount);
  const safeAmount =
    !isNaN(numericAmount) && numericAmount > 0 ? numericAmount : 0;
  const newTotalCapital = baseCapital + safeAmount;
  const isInvalid = amount !== "" && (isNaN(numericAmount) || numericAmount <= 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!partner) return;

    const parsed = parseFloat(amount);
    if (!amount || isNaN(parsed) || parsed <= 0) {
      setError("يرجى إدخال مبلغ صحيح أكبر من صفر");
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit(partner, parsed);
      onClose();
    } catch (err: unknown) {
      console.error("[DepositDialog] Submission error:", err);
      const supabaseMsg =
        err && typeof err === "object" && "message" in err
          ? (err as { message: string }).message
          : null;

      if (supabaseMsg?.includes("permission")) {
        setError("لا توجد صلاحية كافية. تحقق من سياسات RLS في Supabase.");
      } else if (
        supabaseMsg?.includes("column") ||
        supabaseMsg?.includes("schema cache")
      ) {
        setError(
          "أحد الأعمدة مفقود. شغّل ملفات الهجرة وأعد تحميل مخطط PostgREST."
        );
      } else {
        setError(
          supabaseMsg || "فشلت عملية الإيداع. يرجى المحاولة مرة أخرى."
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

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
              <Icon name="savings" className="text-primary !text-lg" />
            </div>
            <div>
              <h3 className="text-sm font-headline font-bold text-white">
                إيداع أموال
              </h3>
              <p className="text-[10px] uppercase tracking-widest text-zinc-500">
                Deposit Capital
              </p>
            </div>
          </div>
          <button
            onClick={() => !submitting && onClose()}
            className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-white/5 hover:text-white"
          >
            <Icon name="close" className="!text-xl" />
          </button>
        </div>

        {/* Partner Info */}
        <div className="px-6 py-4 border-b border-zinc-800/60 flex items-center gap-4">
          <div className="w-11 h-11 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-sm font-bold text-primary shrink-0">
            {partner.initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-white font-bold truncate">
              {partner.name}
            </p>
            <p className="text-[10px] text-on-surface-variant font-mono">
              {partner.code}
            </p>
          </div>
          <div className="text-left">
            <p className="text-[10px] text-on-surface-variant uppercase tracking-widest">
              رأس المال الحالي
            </p>
            <p className="text-sm font-headline font-bold text-white">
              {formatCurrency(baseCapital)}
            </p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Amount Field */}
          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold block">
              مبلغ الإيداع (Deposit Amount)
            </label>
            <div className="relative">
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant/60 text-sm font-mono">
                $
              </span>
              <input
                ref={inputRef}
                type="number"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  setError(null);
                }}
                placeholder="0.00"
                min="0"
                step="0.01"
                disabled={submitting}
                className={`w-full bg-zinc-950/80 border rounded-md pr-8 pl-4 py-3 text-sm text-white font-mono placeholder:text-on-surface-variant/40 focus:ring-1 outline-none transition-all disabled:opacity-50 ${
                  isInvalid
                    ? "border-secondary/50 focus:ring-secondary focus:border-secondary/50"
                    : "border-zinc-700/60 focus:ring-emerald-500/40 focus:border-emerald-500/50"
                }`}
              />
            </div>
            {isInvalid && (
              <p className="text-[10px] text-secondary flex items-center gap-1">
                <Icon name="warning" className="!text-xs" />
                يرجى إدخال مبلغ صحيح أكبر من صفر
              </p>
            )}
          </div>

          {/* Preview */}
          {safeAmount > 0 && (
            <div className="rounded-md border border-primary/20 bg-primary/5 p-4 space-y-2 text-[11px]">
              <div className="flex justify-between">
                <span className="text-on-surface-variant">
                  رأس المال الحالي (Current Capital)
                </span>
                <span className="font-mono text-white">
                  {formatCurrency(baseCapital)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-primary/90">+ الإيداع (Deposit)</span>
                <span className="font-mono text-primary font-bold">
                  + {formatCurrency(safeAmount)}
                </span>
              </div>
              <div className="flex justify-between pt-2 border-t border-primary/10">
                <span className="text-on-surface-variant/90 font-bold uppercase tracking-widest text-[10px]">
                  الإجمالي الجديد (New Total)
                </span>
                <span className="font-mono text-primary font-bold text-sm">
                  {formatCurrency(newTotalCapital)}
                </span>
              </div>
              <div className="flex items-start gap-1.5 pt-1 text-primary/80 text-[10px] leading-relaxed">
                <Icon name="info" className="!text-xs mt-0.5" />
                <span>
                  سيتم ضبط تاريخ التسوية إلى الآن، وستحتسب الأرباح المستقبلية
                  على أساس النسبة الجديدة.
                </span>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="p-3 bg-secondary/10 border border-secondary/20 rounded-md text-xs text-secondary flex items-center gap-2">
              <Icon name="error" className="!text-base" />
              <span className="flex-1">{error}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => !submitting && onClose()}
              disabled={submitting}
              className="flex-1 px-4 py-2.5 rounded-md border border-zinc-800/70 text-on-surface-variant text-xs font-bold uppercase tracking-widest hover:bg-white/5 transition-colors disabled:opacity-50"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={submitting || safeAmount <= 0}
              className="flex-1 px-4 py-2.5 rounded-md bg-primary text-on-primary text-xs font-bold uppercase tracking-widest hover:brightness-110 transition-all disabled:opacity-70 flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <span className="w-3 h-3 border-2 border-on-primary/30 border-t-on-primary rounded-full animate-spin" />
                  جاري الإيداع...
                </>
              ) : (
                <>
                  <Icon name="add" className="!text-sm" />
                  تأكيد الإيداع
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
