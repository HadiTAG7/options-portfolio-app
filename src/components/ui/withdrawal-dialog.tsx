"use client";

import { useState, useEffect, useRef } from "react";
import { Icon } from "@/components/ui/icon";
import { formatCurrency } from "@/lib/utils";
import type { Partner } from "@/types";

interface WithdrawalDialogProps {
  open: boolean;
  partner: Partner | null;
  onClose: () => void;
  onSubmit: (partnerId: string, amount: number) => Promise<void>;
}

export function WithdrawalDialog({
  open,
  partner,
  onClose,
  onSubmit,
}: WithdrawalDialogProps) {
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

  const numericAmount = parseFloat(amount);
  const isOverBalance =
    !isNaN(numericAmount) && numericAmount > partner.currentBalance;
  const percentage =
    !isNaN(numericAmount) && partner.currentBalance > 0
      ? Math.min((numericAmount / partner.currentBalance) * 100, 100)
      : 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!partner) return;

    const parsed = parseFloat(amount);
    if (!amount || isNaN(parsed) || parsed <= 0) {
      setError("يرجى إدخال مبلغ صحيح أكبر من صفر");
      return;
    }

    if (parsed > partner.currentBalance) {
      setError(
        `المبلغ يتجاوز الرصيد المتاح (${formatCurrency(partner.currentBalance)})`
      );
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit(partner.id, parsed);
      onClose();
    } catch {
      setError("فشلت عملية السحب. يرجى المحاولة مرة أخرى.");
    } finally {
      setSubmitting(false);
    }
  }

  function setMaxAmount() {
    setAmount(partner!.currentBalance.toString());
    setError(null);
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={() => !submitting && onClose()}
      />

      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        className="relative bg-surface-container-high border border-white/10 rounded-sm w-full max-w-lg mx-4 shadow-2xl shadow-black/50 overflow-hidden"
      >
        {/* Header */}
        <div className="px-6 py-4 bg-surface-container-highest border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-secondary/10 flex items-center justify-center">
              <Icon name="account_balance" className="text-secondary !text-lg" />
            </div>
            <div>
              <h3 className="text-sm font-headline font-bold text-white">
                سحب أموال
              </h3>
              <p className="text-[10px] text-on-surface-variant">
                Withdraw Funds
              </p>
            </div>
          </div>
          <button
            onClick={() => !submitting && onClose()}
            className="p-1 text-on-surface-variant hover:text-white transition-colors"
          >
            <Icon name="close" className="!text-xl" />
          </button>
        </div>

        {/* Partner Info */}
        <div className="px-6 py-4 border-b border-white/5 flex items-center gap-4">
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
              الرصيد المتاح
            </p>
            <p className="text-sm font-headline font-bold text-primary">
              {formatCurrency(partner.currentBalance)}
            </p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Amount Field */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">
                مبلغ السحب (Withdrawal Amount)
              </label>
              <button
                type="button"
                onClick={setMaxAmount}
                disabled={submitting}
                className="text-[10px] text-primary hover:text-primary/80 font-bold uppercase tracking-widest transition-colors disabled:opacity-50"
              >
                الحد الأقصى
              </button>
            </div>
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
                max={partner.currentBalance}
                step="0.01"
                disabled={submitting}
                className={`w-full bg-surface-container-low border rounded-sm pr-8 pl-4 py-3 text-sm text-white font-mono placeholder:text-on-surface-variant/40 focus:ring-1 outline-none transition-all disabled:opacity-50 ${
                  isOverBalance
                    ? "border-secondary/50 focus:ring-secondary focus:border-secondary/50"
                    : "border-white/10 focus:ring-primary focus:border-primary/50"
                }`}
              />
            </div>
            {isOverBalance && (
              <p className="text-[10px] text-secondary flex items-center gap-1">
                <Icon name="warning" className="!text-xs" />
                المبلغ يتجاوز الرصيد المتاح
              </p>
            )}
          </div>

          {/* Balance Progress Bar */}
          {numericAmount > 0 && !isNaN(numericAmount) && !isOverBalance && (
            <div className="space-y-2">
              <div className="flex justify-between text-[10px] text-on-surface-variant">
                <span>نسبة السحب من الرصيد</span>
                <span className="font-mono">{percentage.toFixed(1)}%</span>
              </div>
              <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300 bg-secondary"
                  style={{ width: `${percentage}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-on-surface-variant/60">
                <span>
                  الرصيد بعد السحب:{" "}
                  <span className="text-white font-mono">
                    {formatCurrency(partner.currentBalance - numericAmount)}
                  </span>
                </span>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="p-3 bg-secondary/10 border border-secondary/20 rounded-sm text-xs text-secondary flex items-center gap-2">
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
              className="flex-1 px-4 py-2.5 rounded-sm border border-white/10 text-on-surface-variant text-xs font-bold uppercase tracking-widest hover:bg-white/5 transition-colors disabled:opacity-50"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={submitting || isOverBalance}
              className="flex-1 px-4 py-2.5 rounded-sm bg-secondary text-white text-xs font-bold uppercase tracking-widest hover:brightness-110 transition-all disabled:opacity-70 flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  جاري السحب...
                </>
              ) : (
                <>
                  <Icon name="account_balance" className="!text-sm" />
                  تأكيد السحب
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
