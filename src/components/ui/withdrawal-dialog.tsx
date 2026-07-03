"use client";

import { useState, useEffect, useRef } from "react";
import { Icon } from "@/components/ui/icon";
import { formatCurrency, getPartnerInvestment } from "@/lib/utils";
import type { Partner } from "@/types";

interface WithdrawalDialogProps {
  open: boolean;
  partner: Partner | null;
  remainingProfit?: number;
  // GP performance fee that will be credited to the manager when this
  // partner's profit settles (0 for the GP's own withdrawals).
  feeAmount?: number;
  onClose: () => void;
  onSubmit: (partner: Partner, amount: number) => Promise<void>;
  onCapitalize?: (partner: Partner) => Promise<void>;
}

export function WithdrawalDialog({
  open,
  partner,
  remainingProfit = 0,
  feeAmount = 0,
  onClose,
  onSubmit,
  onCapitalize,
}: WithdrawalDialogProps) {
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [capitalizing, setCapitalizing] = useState(false);
  const [confirmCapitalize, setConfirmCapitalize] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setAmount("");
      setError(null);
      setSubmitting(false);
      setCapitalizing(false);
      setConfirmCapitalize(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !submitting && !capitalizing) onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, submitting, capitalizing, onClose]);

  if (!open || !partner) return null;

  // Use the same canonical Investment value the DepositDialog and the
  // partners Investment column read from — no drift between modals.
  const balance = getPartnerInvestment(partner);
  const availableProfit = Math.max(0, remainingProfit);
  const maxWithdrawable = balance + availableProfit;
  const numericAmount = parseFloat(amount);
  const isOverMax = !isNaN(numericAmount) && numericAmount > maxWithdrawable;
  // Split preview: profit drawn first (leaves capital intact), then capital.
  const safeAmount = !isNaN(numericAmount) && numericAmount > 0 ? numericAmount : 0;
  const profitPortion = Math.min(safeAmount, availableProfit);
  const capitalPortion = Math.max(0, safeAmount - profitPortion);
  // Withdrawal settles ALL pending profit: whatever the partner doesn't
  // take in cash is auto-capitalized into their investment by the store.
  const profitRemainder =
    profitPortion > 0 ? Math.max(0, availableProfit - profitPortion) : 0;
  const settlesProfit = availableProfit > 0 && safeAmount > 0;
  const newCapitalBalance = balance - capitalPortion + profitRemainder;
  const percentage =
    !isNaN(numericAmount) && maxWithdrawable > 0
      ? Math.min((numericAmount / maxWithdrawable) * 100, 100)
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

    if (parsed > maxWithdrawable) {
      setError(
        `المبلغ يتجاوز المتاح (${formatCurrency(maxWithdrawable)} — رأس المال + الأرباح)`
      );
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit(partner, parsed);
      onClose();
    } catch (err: unknown) {
      console.error("[WithdrawalDialog] Submission error:", err);
      const supabaseMsg =
        err && typeof err === "object" && "message" in err
          ? (err as { message: string }).message
          : null;

      if (supabaseMsg?.includes("does not exist")) {
        setError(
          'جدول "transactions" غير موجود في قاعدة البيانات. يرجى تشغيل ملف الهجرة أولاً.'
        );
      } else if (supabaseMsg?.includes("permission")) {
        setError("لا توجد صلاحية كافية. تحقق من سياسات RLS في Supabase.");
      } else {
        setError(
          supabaseMsg || "فشلت عملية السحب. يرجى المحاولة مرة أخرى."
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  function setMaxAmount() {
    setAmount(maxWithdrawable.toString());
    setError(null);
  }

  function fillProfitAmount() {
    // Pure profit payout — leaves capital untouched. No need to clamp
    // against `balance` anymore since the store allows amount > balance
    // as long as it's within balance + availableProfit.
    const clamped = Math.max(0, availableProfit);
    setAmount(clamped.toFixed(2));
    setError(null);
  }

  async function handleCapitalize() {
    if (!partner || !onCapitalize) return;
    setError(null);
    setCapitalizing(true);
    try {
      await onCapitalize(partner);
      onClose();
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "message" in err
          ? (err as { message: string }).message
          : "فشلت عملية تثبيت الأرباح";
      setError(msg);
      setConfirmCapitalize(false);
    } finally {
      setCapitalizing(false);
    }
  }

  const showProfitActions =
    remainingProfit > 0 && typeof onCapitalize === "function";
  const busy = submitting || capitalizing;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={() => !busy && onClose()}
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
            onClick={() => !busy && onClose()}
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
              رأس المال الحالي
            </p>
            <p className="text-sm font-headline font-bold text-primary">
              {formatCurrency(balance)}
            </p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Profit actions — visible only when partner has remaining profit */}
          {showProfitActions && (
            <div className="p-4 rounded-sm bg-surface-container-low border border-white/5 border-r-2 border-r-primary/60 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">
                    الأرباح المتبقية (Remaining Profit)
                  </p>
                  <p className="text-[10px] text-on-surface-variant/60 mt-0.5">
                    صافي ربح هذا الشريك بعد رسوم الإدارة
                  </p>
                </div>
                <span className="text-lg font-headline font-bold text-primary font-mono">
                  {formatCurrency(remainingProfit)}
                </span>
              </div>

              {confirmCapitalize ? (
                <div className="space-y-2">
                  <p className="text-[11px] text-on-surface leading-relaxed">
                    سيتم تحويل الأرباح الحالية إلى رأس المال الأساسي (لن يغادر
                    أي مبلغ الصندوق). هل أنت متأكد؟
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => !busy && setConfirmCapitalize(false)}
                      disabled={busy}
                      className="flex-1 px-3 py-2 rounded-sm border border-white/10 text-on-surface-variant text-[10px] font-bold uppercase tracking-widest hover:bg-white/5 transition-colors disabled:opacity-50"
                    >
                      إلغاء
                    </button>
                    <button
                      type="button"
                      onClick={handleCapitalize}
                      disabled={busy}
                      className="flex-1 px-3 py-2 rounded-sm bg-primary text-on-primary text-[10px] font-bold uppercase tracking-widest hover:brightness-110 transition-all disabled:opacity-70 flex items-center justify-center gap-1.5"
                    >
                      {capitalizing ? (
                        <>
                          <span className="w-3 h-3 border-2 border-on-primary/30 border-t-on-primary rounded-full animate-spin" />
                          جاري التثبيت...
                        </>
                      ) : (
                        <>
                          <Icon name="check" className="!text-sm" />
                          تأكيد التثبيت
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={fillProfitAmount}
                    disabled={busy}
                    className="flex-1 px-3 py-2 rounded-sm border border-secondary/30 text-secondary text-[10px] font-bold uppercase tracking-widest hover:bg-secondary/10 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                    title="تعبئة المبلغ بقيمة الأرباح المتبقية"
                  >
                    <Icon name="payments" className="!text-sm" />
                    سحب الأرباح
                  </button>
                  <button
                    type="button"
                    onClick={() => !busy && setConfirmCapitalize(true)}
                    disabled={busy}
                    className="flex-1 px-3 py-2 rounded-sm border border-primary/30 text-primary text-[10px] font-bold uppercase tracking-widest hover:bg-primary/10 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                    title="إضافة الأرباح إلى رأس المال الأساسي"
                  >
                    <Icon name="savings" className="!text-sm" />
                    تثبيت الأرباح
                  </button>
                </div>
              )}
            </div>
          )}

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
                max={maxWithdrawable}
                step="0.01"
                disabled={submitting}
                className={`w-full bg-surface-container-low border rounded-sm pr-8 pl-4 py-3 text-sm text-white font-mono placeholder:text-on-surface-variant/40 focus:ring-1 outline-none transition-all disabled:opacity-50 ${
                  isOverMax
                    ? "border-secondary/50 focus:ring-secondary focus:border-secondary/50"
                    : "border-white/10 focus:ring-primary focus:border-primary/50"
                }`}
              />
            </div>
            {isOverMax && (
              <p className="text-[10px] text-secondary flex items-center gap-1">
                <Icon name="warning" className="!text-xs" />
                المبلغ يتجاوز المتاح (رأس المال + الأرباح)
              </p>
            )}
          </div>

          {/* Split Preview — profit first, capital only if amount exceeds profit */}
          {numericAmount > 0 && !isNaN(numericAmount) && !isOverMax && (
            <div className="space-y-2">
              <div className="flex justify-between text-[10px] text-on-surface-variant">
                <span>نسبة السحب من المتاح</span>
                <span className="font-mono">{percentage.toFixed(1)}%</span>
              </div>
              <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300 bg-secondary"
                  style={{ width: `${percentage}%` }}
                />
              </div>
              <div className="rounded-sm border border-white/5 bg-surface-container-low/60 p-3 space-y-1.5 text-[10px]">
                {profitPortion > 0 && (
                  <div className="flex justify-between">
                    <span className="text-on-surface-variant">
                      من الأرباح (Profit)
                    </span>
                    <span className="font-mono text-primary font-bold">
                      {formatCurrency(profitPortion)}
                    </span>
                  </div>
                )}
                {capitalPortion > 0 && (
                  <div className="flex justify-between">
                    <span className="text-secondary/90">
                      من رأس المال (Capital)
                    </span>
                    <span className="font-mono text-secondary font-bold">
                      {formatCurrency(capitalPortion)}
                    </span>
                  </div>
                )}
                {profitRemainder > 0 && (
                  <div className="flex justify-between">
                    <span className="text-on-surface-variant">
                      باقي الأرباح — يُثبت تلقائياً في رأس المال
                    </span>
                    <span className="font-mono text-primary font-bold">
                      +{formatCurrency(profitRemainder)}
                    </span>
                  </div>
                )}
                {settlesProfit && feeAmount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-tertiary/90">
                      رسوم الأداء — تُقيد للمدير (GP)
                    </span>
                    <span className="font-mono text-tertiary font-bold">
                      {formatCurrency(feeAmount)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between pt-1.5 border-t border-white/5">
                  <span className="text-on-surface-variant/80">
                    الاستثمار بعد السحب (New Investment)
                  </span>
                  <span
                    className={`font-mono ${
                      capitalPortion > 0 ? "text-secondary" : "text-white"
                    }`}
                  >
                    {formatCurrency(newCapitalBalance)}
                  </span>
                </div>
                {capitalPortion === 0 && profitRemainder === 0 && (
                  <div className="flex items-center gap-1 pt-1 text-primary/90">
                    <Icon name="check_circle" className="!text-xs" />
                    <span>رأس المال (الاستثمار) لن يتأثر</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="p-3 bg-secondary/10 border border-secondary/20 rounded-sm text-xs text-secondary flex items-center gap-2">
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
              className="flex-1 px-4 py-2.5 rounded-sm border border-white/10 text-on-surface-variant text-xs font-bold uppercase tracking-widest hover:bg-white/5 transition-colors disabled:opacity-50"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={submitting || isOverMax}
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
