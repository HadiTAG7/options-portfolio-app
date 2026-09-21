"use client";

import { useEffect, useState } from "react";
import { Undo2, X } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { DatePicker } from "@/components/ui/date-picker";
import type { Trade } from "@/types";

interface BuybackDialogProps {
  open: boolean;
  trade: Trade | null;
  onClose: () => void;
  onSubmit: (trade: Trade, opts: { price: number; date: string }) => Promise<void>;
}

// Arabic month-year for a YYYY-MM(-DD) date string, so the split the
// dialog promises ("premium stays in X, cost lands in Y") is spelled out
// in the months the GP actually reads.
function monthLabel(dateStr: string | undefined): string {
  const s = (dateStr || "").slice(0, 10);
  const [y, m] = s.split("-").map(Number);
  if (!y || !m) return "—";
  return new Date(y, m - 1).toLocaleString("ar-SA", {
    month: "long",
    year: "numeric",
  });
}

// Record buying back a short option before expiry, as two dated legs:
// the sell row keeps its FULL premium in the month it was sold, and a
// "Buy Close" row charges the buy-back cost to the month it was bought.
// Works on an open contract (the normal flow) and on a row that was
// already closed the old way — with the whole net stuffed into the sale
// month — where it acts as the repair: the premium goes back to the sale
// month and the embedded cost moves to its real date (prefilled from the
// stored result, editable).
export function BuybackDialog({
  open,
  trade,
  onClose,
  onSubmit,
}: BuybackDialogProps) {
  const [price, setPrice] = useState("");
  const [date, setDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prefill on open — render-phase adjustment keyed on the trade id so
  // reopening with another trade re-seeds the fields.
  const [seededFor, setSeededFor] = useState<string | null>(null);
  if (open && trade && seededFor !== trade.id) {
    setSeededFor(trade.id);
    const qty = Number(trade.quantity) || 0;
    const premiumTotal = (Number(trade.premium) || 0) * qty;
    // Closed-the-old-way row: the buy-back cost is recoverable from the
    // netted result (premium − cost = result ⇒ cost = premium − result).
    const embedded =
      trade.status === "closed" && qty > 0
        ? (premiumTotal - (Number(trade.result) || 0)) / qty
        : 0;
    setPrice(embedded > 0 ? String(Number(embedded.toFixed(4))) : "");
    setDate(new Date().toISOString().slice(0, 10));
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

  const qty = Number(trade.quantity) || 0;
  const premiumTotal = (Number(trade.premium) || 0) * qty;
  const px = parseFloat(price);
  const valid = Number.isFinite(px) && px > 0 && !!date && qty > 0;
  const cost = valid ? px * qty : 0;
  const net = premiumTotal - cost;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!trade || !valid) {
      setError("يرجى تعبئة سعر إعادة الشراء والتاريخ بقيم صحيحة");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(trade, { price: px, date });
      onClose();
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "message" in err
          ? (err as { message: string }).message
          : "فشل تسجيل إعادة الشراء";
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
        <div className="flex items-center justify-between border-b border-zinc-800/70 bg-zinc-950/60 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md border border-amber-500/30 bg-amber-500/10">
              <Undo2 size={16} className="text-amber-400" />
            </div>
            <div>
              <h3 className="font-headline text-sm font-bold text-white">
                إعادة شراء (إغلاق مبكر) · {trade.ticker}
              </h3>
              <p className="text-[10px] uppercase tracking-widest text-zinc-500">
                Buy to close before expiry
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
            العلاوة المحصّلة{" "}
            <span className="font-mono font-bold text-emerald-300" dir="ltr">
              {formatCurrency(premiumTotal)}
            </span>{" "}
            تبقى في شهر البيع ({monthLabel(trade.date)})، وتكلفة إعادة
            الشراء تُسجَّل كسطر مستقل بتاريخ الشراء — فلا يتغيّر أي شهر
            سابق.
            {trade.status === "closed" && (
              <span className="mt-1 block text-amber-300/90">
                هذا العقد مقفل بنتيجة صافية بالطريقة القديمة — التسجيل
                سيُعيد علاوته كاملة لشهر البيع وينقل التكلفة للتاريخ الذي
                تختاره. السعر مقترح من النتيجة المخزّنة، عدّله إن لزم.
              </span>
            )}
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                سعر إعادة الشراء ($ للسهم)
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
            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                تاريخ الشراء
              </label>
              <DatePicker value={date} onChange={setDate} disabled={submitting} />
            </div>
          </div>

          {valid && (
            <div className="space-y-2 rounded-md border border-zinc-800/60 bg-zinc-950/40 px-4 py-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-zinc-500">
                  علاوة البيع — تدخل في {monthLabel(trade.date)}
                </span>
                <span className="font-mono font-bold tabular-nums text-emerald-400" dir="ltr">
                  +{formatCurrency(premiumTotal)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-500">
                  تكلفة الشراء — تدخل في {monthLabel(date)}
                </span>
                <span className="font-mono font-bold tabular-nums text-rose-400" dir="ltr">
                  −{formatCurrency(cost)}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-zinc-800/60 pt-2">
                <span className="text-zinc-400">صافي المركز كاملاً</span>
                <span
                  dir="ltr"
                  className={`font-mono font-bold tabular-nums ${net >= 0 ? "text-emerald-300" : "text-rose-300"}`}
                >
                  {net >= 0 ? "+" : "−"}
                  {formatCurrency(Math.abs(net))}
                </span>
              </div>
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
              {submitting ? "جارٍ التسجيل…" : "تسجيل إعادة الشراء"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
