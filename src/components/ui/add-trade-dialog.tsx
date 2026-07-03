"use client";

import { useState, useEffect, useRef } from "react";
import {
  Plus,
  X,
  ChevronDown,
  Hash,
  DollarSign,
  Layers,
  Save,
} from "lucide-react";
import { DatePicker } from "@/components/ui/date-picker";
import type { ActiveStock } from "@/types";

export interface AddTradePayload {
  type: "Stock" | "Sell Call" | "Sell Put";
  ticker: string;
  quantity: number;
  price: number; // purchase price for Stock, premium for options
  strike?: number;
  expiration?: string;
  date: string;
  // Covered-call linkage: active stock lot this Sell Call is written
  // against (optional).
  linkedStockId?: string | null;
}

interface AddTradeDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: AddTradePayload) => Promise<void>;
  // Open stock lots — offered as covered-call link targets when the
  // trade type is Sell Call and a lot matches the typed ticker.
  activeStocks?: ActiveStock[];
}

const TRADE_TYPES = [
  { value: "Stock", labelAr: "سهم", labelEn: "Stock" },
  { value: "Sell Call", labelAr: "بيع كول", labelEn: "Sell Call" },
  { value: "Sell Put", labelAr: "بيع بوت", labelEn: "Sell Put" },
] as const;

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function AddTradeDialog({
  open,
  onClose,
  onSubmit,
  activeStocks = [],
}: AddTradeDialogProps) {
  const [type, setType] = useState<AddTradePayload["type"]>("Stock");
  const [ticker, setTicker] = useState("");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [strike, setStrike] = useState("");
  const [expiration, setExpiration] = useState("");
  const [date, setDate] = useState(todayISO());
  const [linkedStockId, setLinkedStockId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tickerRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setType("Stock");
    setTicker("");
    setQuantity("");
    setPrice("");
    setStrike("");
    setExpiration("");
    setDate(todayISO());
    setLinkedStockId("");
    setError(null);
    setSubmitting(false);
    setTimeout(() => tickerRef.current?.focus(), 50);
  }, [open]);

  // Stock lots matching the typed ticker — covered-call link targets.
  const linkableStocks =
    type === "Sell Call"
      ? activeStocks.filter(
          (s) => s.ticker.toUpperCase() === ticker.trim().toUpperCase()
        )
      : [];

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !submitting) onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, submitting, onClose]);

  const isOption = type === "Sell Call" || type === "Sell Put";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const cleanedTicker = ticker.trim();
    if (!cleanedTicker) {
      setError("يرجى إدخال رمز السهم");
      return;
    }

    const q = parseFloat(quantity);
    if (!Number.isFinite(q) || q <= 0) {
      setError("يرجى إدخال كمية صحيحة أكبر من صفر");
      return;
    }

    const p = parseFloat(price);
    if (!Number.isFinite(p) || p <= 0) {
      setError(
        isOption
          ? "يرجى إدخال قيمة العلاوة (Premium) بشكل صحيح"
          : "يرجى إدخال سعر الشراء بشكل صحيح"
      );
      return;
    }

    let strikeNum: number | undefined;
    let expirationVal: string | undefined;
    if (isOption) {
      strikeNum = parseFloat(strike);
      if (!Number.isFinite(strikeNum) || strikeNum <= 0) {
        setError("يرجى إدخال سعر التنفيذ (Strike) للخيار");
        return;
      }
      expirationVal = expiration.trim();
      if (!expirationVal) {
        setError("يرجى اختيار تاريخ انتهاء الخيار");
        return;
      }
    }

    if (!date) {
      setError("يرجى اختيار تاريخ الشراء");
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        type,
        ticker: cleanedTicker,
        quantity: q,
        price: p,
        strike: strikeNum,
        expiration: expirationVal,
        date,
        linkedStockId:
          type === "Sell Call" && linkedStockId ? linkedStockId : null,
      });
      onClose();
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "message" in err
          ? (err as { message: string }).message
          : "فشل في إضافة الصفقة. يرجى المحاولة مرة أخرى.";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

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
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800/70 bg-zinc-950/60 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md border border-emerald-500/30 bg-emerald-500/10">
              <Plus size={16} className="text-emerald-400" />
            </div>
            <div>
              <h3 className="font-headline text-sm font-bold tracking-[0.18em] uppercase text-white">
                صفقة جديدة
              </h3>
              <p className="text-[10px] uppercase tracking-widest text-zinc-500">
                Add New Trade
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

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5 p-6">
          {/* Trade Type */}
          <div className="space-y-2">
            <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-400">
              نوع الصفقة{" "}
              <span className="text-zinc-600">(Trade Type)</span>
            </label>
            <div className="relative">
              <Layers
                size={14}
                className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-zinc-600"
              />
              <ChevronDown
                size={14}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600"
              />
              <select
                value={type}
                onChange={(e) =>
                  setType(e.target.value as AddTradePayload["type"])
                }
                disabled={submitting}
                className={`${inputBase} appearance-none pr-10 pl-9`}
              >
                {TRADE_TYPES.map((t) => (
                  <option
                    key={t.value}
                    value={t.value}
                    className="bg-zinc-900 text-white"
                  >
                    {t.labelAr} — {t.labelEn}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Ticker */}
          <div className="space-y-2">
            <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-400">
              رمز السهم{" "}
              <span className="text-zinc-600">(Ticker Symbol)</span>
            </label>
            <div className="relative">
              <Hash
                size={14}
                className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-zinc-600"
              />
              <input
                ref={tickerRef}
                type="text"
                value={ticker}
                onChange={(e) => setTicker(e.target.value.toUpperCase())}
                placeholder="AAPL"
                disabled={submitting}
                maxLength={10}
                className={`${inputBase} pr-10 uppercase`}
              />
            </div>
          </div>

          {/* Quantity + Price */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                الكمية{" "}
                <span className="text-zinc-600">(Quantity)</span>
              </label>
              <input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="0"
                min="0"
                step="1"
                disabled={submitting}
                className={inputBase}
              />
            </div>
            <div className="space-y-2">
              <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                {isOption ? (
                  <>العلاوة <span className="text-zinc-600">(Premium)</span></>
                ) : (
                  <>السعر <span className="text-zinc-600">(Price)</span></>
                )}
              </label>
              <div className="relative">
                <DollarSign
                  size={14}
                  className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-zinc-600"
                />
                <input
                  type="number"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  disabled={submitting}
                  className={`${inputBase} pr-10`}
                />
              </div>
            </div>
          </div>

          {/* Strike + Expiration — options only */}
          {isOption && (
            <div className="grid grid-cols-2 gap-4">
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
                    placeholder="0.00"
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
            </div>
          )}

          {/* Covered-call linkage — Sell Call with a matching stock lot */}
          {type === "Sell Call" && linkableStocks.length > 0 && (
            <div className="space-y-2">
              <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                مرتبط بسهم{" "}
                <span className="text-zinc-600">(Covered · اختياري)</span>
              </label>
              <div className="relative">
                <select
                  value={linkedStockId}
                  onChange={(e) => setLinkedStockId(e.target.value)}
                  disabled={submitting}
                  className={`${inputBase} appearance-none pr-4`}
                >
                  <option value="">— غير مغطى (Naked)</option>
                  {linkableStocks.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.ticker} · {s.quantity} سهم @ ${s.purchasePrice}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={14}
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-zinc-600"
                />
              </div>
            </div>
          )}

          {/* Purchase Date */}
          <div className="space-y-2">
            <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-400">
              تاريخ الشراء{" "}
              <span className="text-zinc-600">(Purchase Date)</span>
            </label>
            <DatePicker
              value={date}
              onChange={setDate}
              disabled={submitting}
              placeholder="اختر تاريخ الشراء"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
              <span className="flex-1">{error}</span>
            </div>
          )}

          {/* Divider */}
          <hr className="border-zinc-800/70" />

          {/* Actions */}
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
                  جاري الحفظ...
                </>
              ) : (
                <>
                  <Save size={12} />
                  حفظ الصفقة
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
