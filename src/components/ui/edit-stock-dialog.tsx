"use client";

import { useEffect, useRef, useState } from "react";
import { Pencil, Save, X } from "lucide-react";
import type { ActiveStock } from "@/types";

export interface StockEditPayload {
  quantity: number;
  purchasePrice: number;
  targetSellPrice: number;
  purchaseDate: string;
}

interface EditStockDialogProps {
  open: boolean;
  stock: ActiveStock | null;
  onClose: () => void;
  onSubmit: (id: string, payload: StockEditPayload) => Promise<void>;
}

export function EditStockDialog({
  open,
  stock,
  onClose,
  onSubmit,
}: EditStockDialogProps) {
  const [quantity, setQuantity] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [targetSellPrice, setTargetSellPrice] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && stock) {
      setQuantity(String(stock.quantity));
      setPurchasePrice(String(stock.purchasePrice));
      setTargetSellPrice(String(stock.targetSellPrice ?? 0));
      setPurchaseDate(stock.purchaseDate ?? "");
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
    const pp = parseFloat(purchasePrice);
    const tsp = parseFloat(targetSellPrice);

    if (!Number.isFinite(q) || q <= 0) {
      setError("يرجى إدخال كمية صحيحة أكبر من صفر");
      return;
    }
    if (!Number.isFinite(pp) || pp < 0) {
      setError("يرجى إدخال سعر شراء صحيح");
      return;
    }
    if (!Number.isFinite(tsp) || tsp < 0) {
      setError("يرجى إدخال سعر مستهدف صحيح");
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit(stock.id, {
        quantity: q,
        purchasePrice: pp,
        targetSellPrice: tsp,
        purchaseDate: purchaseDate.trim(),
      });
      onClose();
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "message" in err
          ? (err as { message: string }).message
          : "فشل في تحديث السهم. يرجى المحاولة مرة أخرى.";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  if (!open || !stock) return null;

  const q = parseFloat(quantity);
  const pp = parseFloat(purchasePrice);
  const tsp = parseFloat(targetSellPrice);
  const previewPotential =
    Number.isFinite(q) && Number.isFinite(pp) && Number.isFinite(tsp) && tsp > 0
      ? (tsp - pp) * q
      : 0;
  const previewPositive = previewPotential >= 0;

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
              <Pencil size={14} className="text-emerald-400" />
            </div>
            <div>
              <h3 className="font-headline text-sm font-bold tracking-[0.18em] uppercase text-white">
                Edit Stock · {stock.ticker}
              </h3>
              <p className="text-[10px] uppercase tracking-widest text-zinc-500">
                تعديل مركز السهم النشط
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
          {/* Quantity */}
          <div className="space-y-2">
            <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500">
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
              className="w-full rounded-md border border-zinc-800/70 bg-black/60 px-4 py-3 font-mono text-sm tabular-nums text-white outline-none transition-all focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
            />
          </div>

          {/* Purchase Price */}
          <div className="space-y-2">
            <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500">
              سعر الشراء (Buy Price)
            </label>
            <div className="relative">
              <span className="absolute right-4 top-1/2 -translate-y-1/2 font-mono text-sm text-zinc-600">
                $
              </span>
              <input
                type="number"
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(e.target.value)}
                min="0"
                step="0.01"
                disabled={submitting}
                className="w-full rounded-md border border-zinc-800/70 bg-black/60 px-4 py-3 pr-8 font-mono text-sm tabular-nums text-white outline-none transition-all focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
              />
            </div>
          </div>

          {/* Target Sell Price */}
          <div className="space-y-2">
            <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500">
              السعر المستهدف (Target Sell Price)
            </label>
            <div className="relative">
              <span className="absolute right-4 top-1/2 -translate-y-1/2 font-mono text-sm text-zinc-600">
                $
              </span>
              <input
                type="number"
                value={targetSellPrice}
                onChange={(e) => setTargetSellPrice(e.target.value)}
                min="0"
                step="0.01"
                disabled={submitting}
                className="w-full rounded-md border border-zinc-800/70 bg-black/60 px-4 py-3 pr-8 font-mono text-sm tabular-nums text-cyan-200 outline-none transition-all focus:border-cyan-400/50 focus:ring-1 focus:ring-cyan-400 disabled:opacity-50"
              />
            </div>
            {tsp > 0 && (
              <div className="flex items-center justify-between rounded-md border border-cyan-400/20 bg-cyan-500/5 px-3 py-2 text-[10px] uppercase tracking-widest">
                <span className="text-zinc-500">Potential Profit at Target</span>
                <span
                  className={`font-mono tabular-nums font-bold ${
                    previewPositive ? "text-cyan-300" : "text-rose-400"
                  }`}
                >
                  {previewPositive ? "+" : ""}$
                  {Math.abs(previewPotential).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>
            )}
          </div>

          {/* Purchase Date */}
          <div className="space-y-2">
            <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500">
              تاريخ الشراء (Purchase Date)
            </label>
            <input
              type="date"
              value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
              disabled={submitting}
              className="w-full rounded-md border border-zinc-800/70 bg-black/60 px-4 py-3 font-mono text-sm tabular-nums text-white outline-none transition-all focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
            />
          </div>

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
