"use client";

import { useEffect, useState } from "react";
import { PackageOpen, X } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { DatePicker } from "@/components/ui/date-picker";
import type { Trade } from "@/types";

interface AssignmentDialogProps {
  open: boolean;
  trade: Trade | null;
  onClose: () => void;
  onSubmit: (
    trade: Trade,
    opts: { quantity: number; price: number; date: string }
  ) => Promise<void>;
}

// Record a short-put assignment: prefilled from the option (shares =
// quantity, price = strike, date = expiration), all editable before
// confirming. Creates the stock lot + closes the option via
// useTrades().recordAssignment.
export function AssignmentDialog({
  open,
  trade,
  onClose,
  onSubmit,
}: AssignmentDialogProps) {
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [date, setDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prefill on open — render-phase adjustment keyed on the trade id so
  // reopening with another trade re-seeds the fields.
  const [seededFor, setSeededFor] = useState<string | null>(null);
  if (open && trade && seededFor !== trade.id) {
    setSeededFor(trade.id);
    setQuantity(String(trade.quantity || ""));
    setPrice(String(trade.strike || ""));
    setDate(
      trade.expiration?.trim() || new Date().toISOString().slice(0, 10)
    );
    setError(null);
    setSubmitting(false);
  }
  if (!open && seededFor !== null) {
    setSeededFor(null);
  }

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open || !trade) return null;

  const qty = parseFloat(quantity);
  const px = parseFloat(price);
  const valid =
    Number.isFinite(qty) && qty > 0 && Number.isFinite(px) && px > 0 && !!date;
  const totalCost = valid ? qty * px : 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!trade || !valid) {
      setError("يرجى تعبئة الكمية والسعر والتاريخ بقيم صحيحة");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(trade, { quantity: qty, price: px, date });
      onClose();
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "message" in err
          ? (err as { message: string }).message
          : "فشل تسجيل الـ Assignment";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-md"
        onClick={() => !submitting && onClose()}
      />

      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-md mx-4 overflow-hidden rounded-xl border border-zinc-800/70 bg-gradient-to-br from-zinc-900/95 via-zinc-950/95 to-black shadow-[0_0_60px_-12px_rgba(16,185,129,0.3)]"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800/70 bg-zinc-950/60 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md border border-emerald-500/30 bg-emerald-500/10">
              <PackageOpen size={16} className="text-emerald-400" />
            </div>
            <div>
              <h3 className="font-headline text-sm font-bold text-white">
                تسجيل Assignment · {trade.ticker}
              </h3>
              <p className="text-[10px] uppercase tracking-widest text-zinc-500">
                Put exercised → buy shares at strike
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

        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          <p className="text-[11px] leading-relaxed text-zinc-400">
            سيتم إنشاء مركز سهم جديد بسعر التنفيذ، وإغلاق عقد الـ Put مع
            الاحتفاظ بالـ premium كربح محقق. عدّل القيم إن اختلف التنفيذ
            الفعلي.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                الكمية (أسهم)
              </label>
              <input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                min="1"
                step="1"
                disabled={submitting}
                className="w-full rounded-md border border-zinc-700/60 bg-zinc-950/80 px-3 py-2.5 font-mono text-sm text-white focus:border-emerald-500/50 focus:outline-none disabled:opacity-50"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                سعر التنفيذ ($)
              </label>
              <input
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                min="0.01"
                step="0.01"
                disabled={submitting}
                className="w-full rounded-md border border-zinc-700/60 bg-zinc-950/80 px-3 py-2.5 font-mono text-sm text-white focus:border-emerald-500/50 focus:outline-none disabled:opacity-50"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-zinc-500">
              تاريخ التنفيذ
            </label>
            <DatePicker value={date} onChange={setDate} disabled={submitting} />
          </div>

          {valid && (
            <div className="flex items-center justify-between rounded-md border border-zinc-800/60 bg-zinc-950/40 px-4 py-3 text-xs">
              <span className="text-zinc-500">تكلفة الشراء الإجمالية</span>
              <span className="font-mono font-bold tabular-nums text-white">
                {formatCurrency(totalCost)}
              </span>
            </div>
          )}

          {error && (
            <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-300">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={() => !submitting && onClose()}
              disabled={submitting}
              className="flex-1 rounded-md border border-zinc-800/70 px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-zinc-400 transition-colors hover:bg-white/5 hover:text-white disabled:opacity-50"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={submitting || !valid}
              className="flex flex-1 items-center justify-center gap-2 rounded-md bg-emerald-500 px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-zinc-950 transition-all hover:bg-emerald-400 disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-zinc-900/30 border-t-zinc-900" />
                  جاري التسجيل...
                </>
              ) : (
                "تأكيد الـ Assignment"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
