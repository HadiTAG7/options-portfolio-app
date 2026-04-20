"use client";

import { useState, useEffect, useRef } from "react";
import { Icon } from "@/components/ui/icon";

export interface AddTradePayload {
  type: "Stock" | "Sell Call" | "Sell Put";
  ticker: string;
  quantity: number;
  price: number; // purchase price for Stock, premium for options
  strike?: number;
  expiration?: string;
  date: string;
}

interface AddTradeDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: AddTradePayload) => Promise<void>;
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
}: AddTradeDialogProps) {
  const [type, setType] = useState<AddTradePayload["type"]>("Stock");
  const [ticker, setTicker] = useState("");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [strike, setStrike] = useState("");
  const [expiration, setExpiration] = useState("");
  const [date, setDate] = useState(todayISO());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tickerRef = useRef<HTMLInputElement>(null);

  // Reset on open
  useEffect(() => {
    if (!open) return;
    setType("Stock");
    setTicker("");
    setQuantity("");
    setPrice("");
    setStrike("");
    setExpiration("");
    setDate(todayISO());
    setError(null);
    setSubmitting(false);
    setTimeout(() => tickerRef.current?.focus(), 50);
  }, [open]);

  // Escape to close
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

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={() => !submitting && onClose()}
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
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <Icon name="add_chart" className="text-primary !text-lg" />
            </div>
            <div>
              <h3 className="text-sm font-headline font-bold text-white">
                صفقة جديدة
              </h3>
              <p className="text-[10px] text-on-surface-variant">
                Add New Trade
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
          {/* Trade Type */}
          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold block">
              نوع الصفقة (Trade Type)
            </label>
            <div className="relative">
              <select
                value={type}
                onChange={(e) =>
                  setType(e.target.value as AddTradePayload["type"])
                }
                disabled={submitting}
                className="w-full appearance-none bg-surface-container-low border border-white/10 rounded-sm px-4 py-3 text-sm text-white focus:ring-1 focus:ring-primary focus:border-primary/50 outline-none transition-all disabled:opacity-50 pl-10"
              >
                {TRADE_TYPES.map((t) => (
                  <option
                    key={t.value}
                    value={t.value}
                    className="bg-surface-container-high text-white"
                  >
                    {t.labelAr} — {t.labelEn}
                  </option>
                ))}
              </select>
              <Icon
                name="expand_more"
                className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/60 !text-base pointer-events-none"
              />
            </div>
          </div>

          {/* Ticker */}
          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold block">
              رمز السهم (Ticker Symbol)
            </label>
            <input
              ref={tickerRef}
              type="text"
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              placeholder="مثال: AAPL"
              disabled={submitting}
              maxLength={10}
              className="w-full bg-surface-container-low border border-white/10 rounded-sm px-4 py-3 text-sm text-white font-mono placeholder:text-on-surface-variant/40 focus:ring-1 focus:ring-primary focus:border-primary/50 outline-none transition-all disabled:opacity-50 uppercase"
            />
          </div>

          {/* Quantity + Price */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold block">
                الكمية (Quantity)
              </label>
              <input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="0"
                min="0"
                step="1"
                disabled={submitting}
                className="w-full bg-surface-container-low border border-white/10 rounded-sm px-4 py-3 text-sm text-white font-mono placeholder:text-on-surface-variant/40 focus:ring-1 focus:ring-primary focus:border-primary/50 outline-none transition-all disabled:opacity-50"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold block">
                {isOption ? "العلاوة (Premium)" : "السعر (Price)"}
              </label>
              <div className="relative">
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant/60 text-sm font-mono">
                  $
                </span>
                <input
                  type="number"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  disabled={submitting}
                  className="w-full bg-surface-container-low border border-white/10 rounded-sm pr-8 pl-4 py-3 text-sm text-white font-mono placeholder:text-on-surface-variant/40 focus:ring-1 focus:ring-primary focus:border-primary/50 outline-none transition-all disabled:opacity-50"
                />
              </div>
            </div>
          </div>

          {/* Strike + Expiration — options only */}
          {isOption && (
            <div className="grid grid-cols-2 gap-4">
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
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                    disabled={submitting}
                    className="w-full bg-surface-container-low border border-white/10 rounded-sm pr-8 pl-4 py-3 text-sm text-white font-mono placeholder:text-on-surface-variant/40 focus:ring-1 focus:ring-primary focus:border-primary/50 outline-none transition-all disabled:opacity-50"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold block">
                  تاريخ الانتهاء (Expiration)
                </label>
                <input
                  type="date"
                  value={expiration}
                  onChange={(e) => setExpiration(e.target.value)}
                  disabled={submitting}
                  className="w-full bg-surface-container-low border border-white/10 rounded-sm px-4 py-3 text-sm text-white font-mono focus:ring-1 focus:ring-primary focus:border-primary/50 outline-none transition-all disabled:opacity-50"
                />
              </div>
            </div>
          )}

          {/* Purchase Date */}
          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold block">
              تاريخ الشراء (Purchase Date)
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              disabled={submitting}
              className="w-full bg-surface-container-low border border-white/10 rounded-sm px-4 py-3 text-sm text-white font-mono focus:ring-1 focus:ring-primary focus:border-primary/50 outline-none transition-all disabled:opacity-50"
            />
          </div>

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
                  <Icon name="add" className="!text-sm" />
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
