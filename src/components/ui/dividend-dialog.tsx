"use client";

import { useEffect, useRef, useState } from "react";
import { Coins, X } from "lucide-react";
import { DatePicker } from "@/components/ui/date-picker";
import { formatCurrency } from "@/lib/utils";
import type { ActiveStock } from "@/types";

export interface DividendPayload {
  perShare: number; // dividend per share
  quantity: number; // shares it was paid on
  date: string; // YYYY-MM-DD payment date — decides the profit month
}

interface DividendDialogProps {
  open: boolean;
  stock: ActiveStock | null;
  onClose: () => void;
  onSubmit: (stock: ActiveStock, payload: DividendPayload) => Promise<void>;
}

const AR_MONTHS = [
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
];

function monthLabel(date: string): string {
  const [y, m] = date.split("-");
  const idx = Number(m) - 1;
  if (!y || !AR_MONTHS[idx]) return date;
  return `${AR_MONTHS[idx]} ${y}`;
}

// Record a cash dividend received on a holding. The payment date is
// the key input: the amount is booked into THAT month's profits and
// distributed to the partners like any other realized gain.
export function DividendDialog({
  open,
  stock,
  onClose,
  onSubmit,
}: DividendDialogProps) {
  const [perShare, setPerShare] = useState("");
  const [quantity, setQuantity] = useState("");
  const [date, setDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && stock) {
      setPerShare("");
      setQuantity(String(stock.quantity));
      setDate(new Date().toISOString().split("T")[0]);
      setError(null);
      setSubmitting(false);
      setTimeout(() => firstRef.current?.focus(), 50);
    }
  }, [open, stock]);

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
    if (!stock) return;
    setError(null);

    const ps = parseFloat(perShare);
    const q = parseFloat(quantity);

    if (!Number.isFinite(ps) || ps <= 0) {
      setError("يرجى إدخال قيمة توزيع لكل سهم أكبر من صفر");
      return;
    }
    if (!Number.isFinite(q) || q <= 0) {
      setError("يرجى إدخال عدد أسهم صحيح أكبر من صفر");
      return;
    }
    if (!date.trim()) {
      setError("يرجى اختيار تاريخ استلام التوزيع");
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit(stock, { perShare: ps, quantity: q, date: date.trim() });
      onClose();
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "message" in err
          ? (err as { message: string }).message
          : "فشل تسجيل التوزيع. يرجى المحاولة مرة أخرى.";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  if (!open || !stock) return null;

  const ps = parseFloat(perShare);
  const q = parseFloat(quantity);
  const total =
    Number.isFinite(ps) && Number.isFinite(q) && ps > 0 && q > 0
      ? ps * q
      : null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-md"
        onClick={() => !submitting && onClose()}
      />

      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-lg mx-4 overflow-hidden rounded-xl border border-zinc-800/70 bg-gradient-to-br from-zinc-900/95 via-zinc-950/95 to-black shadow-[0_0_60px_-12px_rgba(34,211,238,0.25)] backdrop-blur-xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800/70 bg-zinc-950/60 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md border border-cyan-400/30 bg-cyan-500/10">
              <Coins size={14} className="text-cyan-300" />
            </div>
            <div>
              <h3 className="font-headline text-sm font-bold tracking-[0.18em] uppercase text-white">
                Dividend · {stock.ticker}
              </h3>
              <p className="text-[10px] uppercase tracking-widest text-zinc-500">
                تسجيل توزيعات أرباح نقدية
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
          {/* Per-share dividend */}
          <div className="space-y-2">
            <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500">
              التوزيع لكل سهم (Dividend / Share)
            </label>
            <div className="relative">
              <span className="absolute right-4 top-1/2 -translate-y-1/2 font-mono text-sm text-zinc-600">
                $
              </span>
              <input
                ref={firstRef}
                type="number"
                value={perShare}
                onChange={(e) => setPerShare(e.target.value)}
                min="0"
                step="0.0001"
                placeholder="0.25"
                disabled={submitting}
                className="w-full rounded-md border border-zinc-800/70 bg-black/60 px-4 py-3 pr-8 font-mono text-sm tabular-nums text-cyan-200 outline-none transition-all placeholder:text-zinc-700 focus:border-cyan-400/50 focus:ring-1 focus:ring-cyan-400 disabled:opacity-50"
              />
            </div>
          </div>

          {/* Quantity */}
          <div className="space-y-2">
            <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500">
              عدد الأسهم (Shares)
            </label>
            <input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              min="0"
              step="1"
              disabled={submitting}
              className="w-full rounded-md border border-zinc-800/70 bg-black/60 px-4 py-3 font-mono text-sm tabular-nums text-white outline-none transition-all focus:border-cyan-400/50 focus:ring-1 focus:ring-cyan-400 disabled:opacity-50"
            />
            <p className="text-[10px] text-zinc-600">
              معبأة بعدد الأسهم الحالي ({stock.quantity.toLocaleString()}) —
              عدّلها إذا كان التوزيع على كمية مختلفة
            </p>
          </div>

          {/* Payment date — decides the profit month */}
          <div className="space-y-2">
            <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500">
              تاريخ الاستلام (Payment Date)
            </label>
            <DatePicker
              value={date}
              onChange={setDate}
              disabled={submitting}
              placeholder="اختر تاريخ الاستلام"
            />
            {date && (
              <p className="text-[10px] text-zinc-500">
                التوزيع سيُحتسب ضمن أرباح شهر{" "}
                <span className="font-bold text-cyan-300">
                  {monthLabel(date)}
                </span>
              </p>
            )}
          </div>

          {/* Total preview */}
          {total !== null && (
            <div className="flex items-center justify-between rounded-md border border-cyan-400/25 bg-cyan-500/5 px-3 py-2.5 text-[10px] uppercase tracking-widest">
              <span className="text-zinc-400">
                الإجمالي · {formatCurrency(ps)} × {q.toLocaleString()}
              </span>
              <span className="font-mono text-sm font-bold tabular-nums text-cyan-300">
                +{formatCurrency(total)}
              </span>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
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
              disabled={submitting}
              className="flex flex-1 items-center justify-center gap-2 rounded-md bg-cyan-500 px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-zinc-950 shadow-[0_0_20px_-6px_rgba(34,211,238,0.7)] transition-all duration-200 hover:bg-cyan-400 hover:shadow-[0_0_28px_-4px_rgba(34,211,238,0.9)] active:scale-[0.98] disabled:opacity-70"
            >
              {submitting ? (
                <>
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-zinc-950/30 border-t-zinc-950" />
                  جاري التسجيل...
                </>
              ) : (
                <>
                  <Coins size={12} />
                  تسجيل التوزيع
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
