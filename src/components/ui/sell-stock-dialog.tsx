"use client";

import { useEffect, useRef, useState } from "react";
import { Banknote, X } from "lucide-react";
import { DatePicker } from "@/components/ui/date-picker";
import { formatCurrency } from "@/lib/utils";
import type { ActiveStock } from "@/types";

export interface StockSellPayload {
  quantity: number;
  price: number; // sell price per share
  date: string; // YYYY-MM-DD — the month this profit belongs to
}

interface SellStockDialogProps {
  open: boolean;
  stock: ActiveStock | null;
  onClose: () => void;
  onSubmit: (stock: ActiveStock, payload: StockSellPayload) => Promise<void>;
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

// Sell (fully or partially) an active stock lot. The date field is the
// heart of it: the realized P&L is booked to THAT month's profits.
export function SellStockDialog({
  open,
  stock,
  onClose,
  onSubmit,
}: SellStockDialogProps) {
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [date, setDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && stock) {
      setQuantity(String(stock.quantity));
      // Prefill with the live price when we have one — it's the most
      // likely sale price and saves typing.
      setPrice(
        typeof stock.currentPrice === "number" && stock.currentPrice > 0
          ? String(stock.currentPrice)
          : ""
      );
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

    const q = parseFloat(quantity);
    const p = parseFloat(price);

    if (!Number.isFinite(q) || q <= 0) {
      setError("يرجى إدخال كمية صحيحة أكبر من صفر");
      return;
    }
    if (q > stock.quantity) {
      setError(`الكمية المتاحة ${stock.quantity.toLocaleString()} سهم فقط`);
      return;
    }
    if (!Number.isFinite(p) || p <= 0) {
      setError("يرجى إدخال سعر بيع صحيح");
      return;
    }
    if (!date.trim()) {
      setError("يرجى اختيار تاريخ البيع");
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit(stock, { quantity: q, price: p, date: date.trim() });
      onClose();
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "message" in err
          ? (err as { message: string }).message
          : "فشل تسجيل البيع. يرجى المحاولة مرة أخرى.";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  if (!open || !stock) return null;

  const q = parseFloat(quantity);
  const p = parseFloat(price);
  const preview =
    Number.isFinite(q) && Number.isFinite(p) && q > 0 && p > 0
      ? (p - stock.purchasePrice) * q
      : null;
  const previewPositive = (preview ?? 0) >= 0;
  const isPartial = Number.isFinite(q) && q > 0 && q < stock.quantity;

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
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800/70 bg-zinc-950/60 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md border border-emerald-500/30 bg-emerald-500/10">
              <Banknote size={14} className="text-emerald-400" />
            </div>
            <div>
              <h3 className="font-headline text-sm font-bold tracking-[0.18em] uppercase text-white">
                Sell Stock · {stock.ticker}
              </h3>
              <p className="text-[10px] uppercase tracking-widest text-zinc-500">
                بيع مركز السهم وتسجيل الربح
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
          {/* Position summary */}
          <div className="grid grid-cols-2 gap-3 rounded-md border border-zinc-800/60 bg-black/40 p-3 text-xs">
            <div>
              <span className="block text-[9px] uppercase tracking-widest text-zinc-500">
                الكمية المتاحة
              </span>
              <span className="font-mono font-bold tabular-nums text-white">
                {stock.quantity.toLocaleString()} سهم
              </span>
            </div>
            <div>
              <span className="block text-[9px] uppercase tracking-widest text-zinc-500">
                سعر الشراء
              </span>
              <span className="font-mono font-bold tabular-nums text-white">
                {formatCurrency(stock.purchasePrice)}
              </span>
            </div>
          </div>

          {/* Sell price */}
          <div className="space-y-2">
            <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500">
              سعر البيع (Sell Price)
            </label>
            <div className="relative">
              <span className="absolute right-4 top-1/2 -translate-y-1/2 font-mono text-sm text-zinc-600">
                $
              </span>
              <input
                ref={firstRef}
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                min="0"
                step="0.01"
                disabled={submitting}
                className="w-full rounded-md border border-zinc-800/70 bg-black/60 px-4 py-3 pr-8 font-mono text-sm tabular-nums text-white outline-none transition-all focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
              />
            </div>
          </div>

          {/* Quantity */}
          <div className="space-y-2">
            <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500">
              الكمية المباعة (Quantity)
            </label>
            <input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              min="0"
              max={stock.quantity}
              step="1"
              disabled={submitting}
              className="w-full rounded-md border border-zinc-800/70 bg-black/60 px-4 py-3 font-mono text-sm tabular-nums text-white outline-none transition-all focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
            />
            {isPartial && (
              <p className="text-[10px] text-amber-300/90">
                بيع جزئي — يبقى{" "}
                <span className="font-mono tabular-nums">
                  {(stock.quantity - q).toLocaleString()}
                </span>{" "}
                سهم في المركز
              </p>
            )}
          </div>

          {/* Sell date — decides the profit month */}
          <div className="space-y-2">
            <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500">
              تاريخ البيع (Sell Date)
            </label>
            <DatePicker
              value={date}
              onChange={setDate}
              disabled={submitting}
              placeholder="اختر تاريخ البيع"
            />
            {date && (
              <p className="text-[10px] text-zinc-500">
                الربح/الخسارة سيُحتسب ضمن أرباح شهر{" "}
                <span className="font-bold text-emerald-300">
                  {monthLabel(date)}
                </span>
              </p>
            )}
          </div>

          {/* Realized P&L preview */}
          {preview !== null && (
            <div
              className={`flex items-center justify-between rounded-md border px-3 py-2.5 text-[10px] uppercase tracking-widest ${
                previewPositive
                  ? "border-emerald-500/25 bg-emerald-500/5"
                  : "border-rose-500/25 bg-rose-500/5"
              }`}
            >
              <span className="text-zinc-400">
                {previewPositive ? "الربح المحقق" : "الخسارة المحققة"} · (
                {formatCurrency(p)} − {formatCurrency(stock.purchasePrice)}) ×{" "}
                {q.toLocaleString()}
              </span>
              <span
                className={`font-mono text-sm font-bold tabular-nums ${
                  previewPositive ? "text-emerald-300" : "text-rose-300"
                }`}
              >
                {previewPositive ? "+" : "−"}
                {formatCurrency(Math.abs(preview))}
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
              className="flex flex-1 items-center justify-center gap-2 rounded-md bg-emerald-500 px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-zinc-950 shadow-[0_0_20px_-6px_rgba(16,185,129,0.7)] transition-all duration-200 hover:bg-emerald-400 hover:shadow-[0_0_28px_-4px_rgba(16,185,129,0.9)] active:scale-[0.98] disabled:opacity-70"
            >
              {submitting ? (
                <>
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-zinc-950/30 border-t-zinc-950" />
                  جاري التسجيل...
                </>
              ) : (
                <>
                  <Banknote size={12} />
                  تأكيد البيع
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
