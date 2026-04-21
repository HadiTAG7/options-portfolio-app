"use client";

import { useState, useEffect, useRef } from "react";
import { Pencil, Save, X, DollarSign } from "lucide-react";
import { DatePicker } from "@/components/ui/date-picker";
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

  const inputBase =
    "w-full rounded-md border border-zinc-800/70 bg-black/60 px-4 py-3 font-mono text-sm tabular-nums text-white outline-none transition-all placeholder:text-zinc-600 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 disabled:opacity-50";

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
                تعديل الصفقة · {trade.ticker}
              </h3>
              <p className="text-[10px] uppercase tracking-widest text-zinc-500">
                Edit {trade.type} Position
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
              الكمية{" "}
              <span className="text-zinc-600">(Quantity)</span>
            </label>
            <input
              ref={firstRef}
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              min="0"
              step="1"
              disabled={submitting}
              className={inputBase}
            />
          </div>

          <div className="space-y-2">
            <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-400">
              سعر التنفيذ{" "}
              <span className="text-zinc-600">(Strike Price)</span>
            </label>
            <div className="relative">
              <DollarSign
                size={14}
                className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-zinc-600"
              />
              <input
                type="number"
                value={strike}
                onChange={(e) => setStrike(e.target.value)}
                min="0"
                step="0.01"
                disabled={submitting}
                className={`${inputBase} pr-10`}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-400">
              العلاوة{" "}
              <span className="text-zinc-600">(Premium)</span>
            </label>
            <div className="relative">
              <DollarSign
                size={14}
                className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-zinc-600"
              />
              <input
                type="number"
                value={premium}
                onChange={(e) => setPremium(e.target.value)}
                min="0"
                step="0.01"
                disabled={submitting}
                className={`${inputBase} pr-10`}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-400">
              تاريخ الانتهاء{" "}
              <span className="text-zinc-600">(Expiration)</span>
            </label>
            <DatePicker
              value={expiration}
              onChange={setExpiration}
              disabled={submitting}
              placeholder="اختر تاريخ الانتهاء"
            />
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
                  جاري التحديث...
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
