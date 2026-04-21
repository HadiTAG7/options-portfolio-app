"use client";

import { useState, useEffect, useRef } from "react";
import { Icon } from "@/components/ui/icon";
import { DatePicker } from "@/components/ui/date-picker";
import type { Partner } from "@/types";

export interface PartnerEditPayload {
  name: string;
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
  const [feePercent, setFeePercent] = useState("");
  const [entryDate, setEntryDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  // Prefill whenever a partner is handed in
  useEffect(() => {
    if (!open || !partner) return;
    setName(partner.name ?? "");
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

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={() => !submitting && onClose()}
      />

      <div
        role="dialog"
        aria-modal="true"
        className="relative bg-surface-container-high border border-white/10 rounded-sm w-full max-w-lg mx-4 shadow-2xl shadow-black/50 overflow-hidden"
      >
        <div className="px-6 py-4 bg-surface-container-highest border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <Icon name="edit" className="text-primary !text-lg" />
            </div>
            <div>
              <h3 className="text-sm font-headline font-bold text-white">
                تعديل بيانات الشريك
              </h3>
              <p className="text-[10px] text-on-surface-variant">
                Edit Partner — {partner.name}
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

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold block">
              اسم الشريك (Partner Name)
            </label>
            <input
              ref={nameRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={submitting}
              className="w-full bg-surface-container-low border border-white/10 rounded-sm px-4 py-3 text-sm text-white placeholder:text-on-surface-variant/40 focus:ring-1 focus:ring-primary focus:border-primary/50 outline-none transition-all disabled:opacity-50"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold block">
                تاريخ الانضمام (Date Joined)
              </label>
              <DatePicker
                value={entryDate}
                onChange={setEntryDate}
                disabled={submitting}
                placeholder="اختر تاريخ الانضمام"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold block">
                رسوم الإدارة (Management Fee %)
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant/60 text-sm font-mono">
                  %
                </span>
                <input
                  type="number"
                  value={feePercent}
                  onChange={(e) => setFeePercent(e.target.value)}
                  min="0"
                  max="100"
                  step="0.01"
                  disabled={submitting}
                  className="w-full bg-surface-container-low border border-white/10 rounded-sm pl-8 pr-4 py-3 text-sm text-white font-mono focus:ring-1 focus:ring-primary focus:border-primary/50 outline-none transition-all disabled:opacity-50"
                />
              </div>
            </div>
          </div>

          {error && (
            <div className="p-3 bg-secondary/10 border border-secondary/20 rounded-sm text-xs text-secondary flex items-center gap-2">
              <Icon name="error" className="!text-base" />
              {error}
            </div>
          )}

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
              disabled={submitting}
              className="flex-1 px-4 py-2.5 rounded-sm bg-primary text-on-primary text-xs font-bold uppercase tracking-widest hover:brightness-110 transition-all disabled:opacity-70 flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <span className="w-3 h-3 border-2 border-on-primary/30 border-t-on-primary rounded-full animate-spin" />
                  جاري الحفظ...
                </>
              ) : (
                <>
                  <Icon name="save" className="!text-sm" />
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
