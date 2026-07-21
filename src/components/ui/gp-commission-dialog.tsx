"use client";

import { useState, useEffect, useRef } from "react";
import { Icon } from "@/components/ui/icon";
import { formatCurrency } from "@/lib/utils";
import type { Partner } from "@/types";

interface GpCommissionDialogProps {
  open: boolean;
  partner: Partner | null;
  // Locked-in commission the GP can act on right now (gpFeesAccrued).
  accrued: number;
  // Fees still pending on unsettled LP profit — shown for context only.
  // They become actionable (move into `accrued`) as each LP settles.
  pending: number;
  onClose: () => void;
  onWithdraw: (partner: Partner, amount: number) => Promise<void>;
  onCapitalize: (partner: Partner, amount: number) => Promise<void>;
}

// GP commission wallet: the ONE place the manager's accrued commission
// changes on purpose. The entered amount (≤ accrued) can be taken as
// cash ("سحب نقداً") or folded into the GP's own capital
// ("تثبيت في رأس المال").
export function GpCommissionDialog({
  open,
  partner,
  accrued,
  pending,
  onClose,
  onWithdraw,
  onCapitalize,
}: GpCommissionDialogProps) {
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState<null | "withdraw" | "capitalize">(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      // Default to the full accrued amount — the common case.
      setAmount(accrued > 0 ? accrued.toFixed(2) : "");
      setError(null);
      setBusy(null);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open, accrued]);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, busy, onClose]);

  if (!open || !partner) return null;

  const numericAmount = parseFloat(amount);
  const safeAmount =
    !isNaN(numericAmount) && numericAmount > 0 ? numericAmount : 0;
  const isOverMax = safeAmount > accrued + 0.005;
  const canAct = safeAmount > 0 && !isOverMax && busy === null;

  async function run(action: "withdraw" | "capitalize") {
    if (!partner) return;
    setError(null);
    if (safeAmount <= 0) {
      setError("يرجى إدخال مبلغ صحيح أكبر من صفر");
      return;
    }
    if (isOverMax) {
      setError(`المبلغ يتجاوز العمولة المتاحة (${formatCurrency(accrued)})`);
      return;
    }
    setBusy(action);
    try {
      if (action === "withdraw") await onWithdraw(partner, safeAmount);
      else await onCapitalize(partner, safeAmount);
      onClose();
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "message" in err
          ? (err as { message: string }).message
          : "فشلت العملية. حاول مرة أخرى.";
      setError(msg);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-md"
        onClick={() => !busy && onClose()}
      />

      {/* Dialog — amber accents: GP commission */}
      <div
        role="dialog"
        aria-modal="true"
        className="relative mx-4 w-full max-w-md overflow-hidden rounded-xl border border-amber-400/30 bg-gradient-to-br from-zinc-900/95 via-zinc-950/95 to-black shadow-[0_0_60px_-12px_rgba(251,191,36,0.3)] backdrop-blur-xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800/70 bg-zinc-950/60 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md border border-amber-400/40 bg-amber-400/10">
              <Icon name="savings" className="!text-lg text-amber-300" />
            </div>
            <div>
              <h3 className="font-headline text-sm font-bold text-white">
                عمولة المدير
              </h3>
              <p className="text-[10px] uppercase tracking-widest text-zinc-500">
                GP Commission Wallet
              </p>
            </div>
          </div>
          <button
            onClick={() => !busy && onClose()}
            className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-white/5 hover:text-white"
          >
            <Icon name="close" className="!text-xl" />
          </button>
        </div>

        <div className="space-y-5 p-6">
          {/* Available + pending */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-amber-400/25 bg-amber-400/5 px-4 py-3">
              <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
                متاحة الآن
              </p>
              <p className="mt-1 font-mono text-xl font-bold tabular-nums text-amber-300">
                {formatCurrency(accrued)}
              </p>
            </div>
            <div className="rounded-lg border border-zinc-800/60 bg-zinc-950/40 px-4 py-3">
              <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                معلقة (تتحرر عند التسوية)
              </p>
              <p className="mt-1 font-mono text-xl font-semibold tabular-nums text-zinc-400">
                {formatCurrency(pending)}
              </p>
            </div>
          </div>

          <p className="text-[11px] leading-relaxed text-zinc-500">
            العمولة المعلّقة تتحوّل تلقائياً إلى «متاحة» كل ما ثبّتت أو سحبت
            أرباح أحد الشركاء. تتصرف بالمتاحة فقط: تسحبها نقداً أو تضيفها
            لرأس مالك.
          </p>

          {/* Amount */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                المبلغ
              </label>
              <button
                type="button"
                onClick={() => {
                  setAmount(accrued.toFixed(2));
                  setError(null);
                }}
                disabled={busy !== null}
                className="text-[10px] font-bold uppercase tracking-widest text-amber-300 transition-colors hover:text-amber-200 disabled:opacity-50"
              >
                الكل
              </button>
            </div>
            <div className="relative">
              <span className="absolute right-4 top-1/2 -translate-y-1/2 font-mono text-sm text-zinc-500">
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
                max={accrued}
                step="0.01"
                disabled={busy !== null}
                className={`w-full rounded-md border bg-zinc-950/80 py-3 pl-4 pr-8 font-mono text-sm text-white outline-none transition-all placeholder:text-zinc-600 focus:ring-1 disabled:opacity-50 ${
                  isOverMax
                    ? "border-rose-500/50 focus:border-rose-500/50 focus:ring-rose-500/40"
                    : "border-zinc-700/60 focus:border-amber-400/50 focus:ring-amber-400/40"
                }`}
              />
            </div>
            {isOverMax && (
              <p className="flex items-center gap-1 text-[10px] text-rose-400">
                <Icon name="warning" className="!text-xs" />
                المبلغ يتجاوز العمولة المتاحة
              </p>
            )}
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-md border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-300">
              <Icon name="error" className="!text-base" />
              <span className="flex-1">{error}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => run("withdraw")}
                disabled={!canAct}
                className="flex items-center justify-center gap-1.5 rounded-md border border-rose-500/25 bg-rose-500/10 px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest text-rose-200 transition-all hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy === "withdraw" ? (
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-rose-300/30 border-t-rose-300" />
                ) : (
                  <Icon name="account_balance" className="!text-sm" />
                )}
                سحب نقداً
              </button>
              <button
                type="button"
                onClick={() => run("capitalize")}
                disabled={!canAct}
                className="flex items-center justify-center gap-1.5 rounded-md border border-amber-400/30 bg-amber-400/10 px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest text-amber-200 transition-all hover:bg-amber-400/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy === "capitalize" ? (
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-amber-300/30 border-t-amber-300" />
                ) : (
                  <Icon name="savings" className="!text-sm" />
                )}
                تثبيت في رأس المال
              </button>
            </div>
            <button
              type="button"
              onClick={() => !busy && onClose()}
              disabled={busy !== null}
              className="rounded-md border border-zinc-800/70 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-zinc-400 transition-colors hover:bg-white/5 hover:text-white disabled:opacity-50"
            >
              إغلاق
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
