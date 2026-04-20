"use client";

import { useState, useEffect, useRef } from "react";
import { Icon } from "@/components/ui/icon";
import type { Trade } from "@/types";

export interface TradeEditPayload {
  quantity: number;
  strike: number;
  expiration: string;
  premium: number;
  date: string;
}

interface EditTradeDialogProps {
  open: boolean;
  trade: Trade | null;
  onClose: () => void;
  onSubmit: (id: string, payload: TradeEditPayload) => Promise<void>;
}

export function EditTradeDialog({
  open,
  trade,
  onClose,
  onSubmit,
}: EditTradeDialogProps) {
  const [quantity, setQuantity] = useState("");
  const [strike, setStrike] = useState("");
  const [expiration, setExpiration] = useState("");
  const [premium, setPremium] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && trade) {
      setQuantity(String(trade.quantity));
      setStrike(String(trade.strike));
      setExpiration(trade.expiration ?? "");
      setPremium(String(trade.premium));
      setError(null);
      setSubmitting(false);
      setTimeout(() => firstRef.current?.focus(), 50);
    }
  }, [open, trade]);

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
    if (!trade) return;
    setError(null);

    const q = parseFloat(quantity);
    const s = parseFloat(strike);
    const p = parseFloat(premium);

    if (!Number.isFinite(q) || q <= 0) {
      setError("يرجى إدخال كمية صحيحة أكبر من صفر");
      return;
    }
    if (!Number.isFinite(s) || s < 0) {
      setError("يرجى إدخال سعر تنفيذ صحيح");
      return;
    }
    if (!Number.isFinite(p) || p < 0) {
      setError("يرجى إدخال علاوة صحيحة");
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit(trade.id, {
        quantity: q,
        strike: s,
        expiration: expiration.trim(),
        premium: p,
        date: trade.date,
      });
      onClose();
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "message" in err
          ? (err as { message: string }).message
          : "فشل في تحديث الصفقة. يرجى المحاولة مرة أخرى.";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  if (!open || !trade) return null;

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
        {/* Header */}
        <div className="px-6 py-4 bg-surface-container-highest border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <Icon name="edit" className="text-primary !text-lg" />
            </div>
            <div>
              <h3 className="text-sm font-headline font-bold text-white">
                تعديل الصفقة — {trade.ticker}
              </h3>
              <p className="text-[10px] text-on-surface-variant">
                Edit {trade.type} Position
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

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Quantity */}
          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold block">
              الكمية (Quantity)
            </label>
            <input
              ref={firstRef}
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              min="0"
              step="1"
              disabled={submitting}
              className="w-full bg-surface-container-low border border-white/10 rounded-sm px-4 py-3 text-sm text-white font-mono placeholder:text-on-surface-variant/40 focus:ring-1 focus:ring-primary focus:border-primary/50 outline-none transition-all disabled:opacity-50"
            />
          </div>

          {/* Strike Price */}
          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold block">
              سعر التنفيذ (Strike Price)
            </label>
            <div className="relative">
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant/60 text-sm font-mono">
                $
              </span>
              <input
                type="number"
                value={strike}
                onChange={(e) => setStrike(e.target.value)}
                min="0"
                step="0.01"
                disabled={submitting}
                className="w-full bg-surface-container-low border border-white/10 rounded-sm pr-8 pl-4 py-3 text-sm text-white font-mono placeholder:text-on-surface-variant/40 focus:ring-1 focus:ring-primary focus:border-primary/50 outline-none transition-all disabled:opacity-50"
              />
            </div>
          </div>

          {/* Premium */}
          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold block">
              العلاوة (Premium)
            </label>
            <div className="relative">
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant/60 text-sm font-mono">
                $
              </span>
              <input
                type="number"
                value={premium}
                onChange={(e) => setPremium(e.target.value)}
                min="0"
                step="0.01"
                disabled={submitting}
                className="w-full bg-surface-container-low border border-white/10 rounded-sm pr-8 pl-4 py-3 text-sm text-white font-mono placeholder:text-on-surface-variant/40 focus:ring-1 focus:ring-primary focus:border-primary/50 outline-none transition-all disabled:opacity-50"
              />
            </div>
          </div>

          {/* Expiration */}
          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold block">
              تاريخ الانتهاء (Expiration)
            </label>
            <input
              type="text"
              value={expiration}
              onChange={(e) => setExpiration(e.target.value)}
              placeholder="مثال: 2025-06-20"
              disabled={submitting}
              className="w-full bg-surface-container-low border border-white/10 rounded-sm px-4 py-3 text-sm text-white font-mono placeholder:text-on-surface-variant/40 focus:ring-1 focus:ring-primary focus:border-primary/50 outline-none transition-all disabled:opacity-50"
            />
          </div>

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
              disabled={submitting}
              className="flex-1 px-4 py-2.5 rounded-sm bg-primary text-on-primary text-xs font-bold uppercase tracking-widest hover:brightness-110 transition-all disabled:opacity-70 flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <span className="w-3 h-3 border-2 border-on-primary/30 border-t-on-primary rounded-full animate-spin" />
                  جاري التحديث...
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
