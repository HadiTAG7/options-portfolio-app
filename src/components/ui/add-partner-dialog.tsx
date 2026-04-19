"use client";

import { useState, useEffect, useRef } from "react";
import { Icon } from "@/components/ui/icon";

interface AddPartnerDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (name: string, initialCapital: number) => Promise<void>;
}

export function AddPartnerDialog({ open, onClose, onSubmit }: AddPartnerDialogProps) {
  const [name, setName] = useState("");
  const [capital, setCapital] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setName("");
      setCapital("");
      setError(null);
      setSubmitting(false);
      // Focus the name input after a tick
      setTimeout(() => nameRef.current?.focus(), 50);
    }
  }, [open]);

  // Close on Escape
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
    setError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("يرجى إدخال اسم الشريك");
      return;
    }

    const numericCapital = parseFloat(capital);
    if (!capital || isNaN(numericCapital) || numericCapital <= 0) {
      setError("يرجى إدخال مبلغ صحيح أكبر من صفر");
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit(trimmedName, numericCapital);
      onClose();
    } catch {
      setError("فشل في إضافة الشريك. يرجى المحاولة مرة أخرى.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  // Preview initials
  const previewInitials = name
    .trim()
    .split(/\s+/)
    .map((w) => w[0] || "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

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
              <Icon name="person_add" className="text-primary !text-lg" />
            </div>
            <div>
              <h3 className="text-sm font-headline font-bold text-white">إضافة شريك جديد</h3>
              <p className="text-[10px] text-on-surface-variant">Add New Partner</p>
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
          {/* Initials Preview */}
          {previewInitials && (
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-full bg-primary/10 border-2 border-primary/30 flex items-center justify-center text-xl font-bold text-primary font-headline">
                {previewInitials}
              </div>
            </div>
          )}

          {/* Name Field */}
          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold block">
              اسم الشريك (Partner Name)
            </label>
            <input
              ref={nameRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثال: سالم العامري"
              disabled={submitting}
              className="w-full bg-surface-container-low border border-white/10 rounded-sm px-4 py-3 text-sm text-white placeholder:text-on-surface-variant/40 focus:ring-1 focus:ring-primary focus:border-primary/50 outline-none transition-all disabled:opacity-50"
            />
          </div>

          {/* Capital Field */}
          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold block">
              رأس المال الأولي (Initial Capital)
            </label>
            <div className="relative">
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant/60 text-sm font-mono">
                $
              </span>
              <input
                type="number"
                value={capital}
                onChange={(e) => setCapital(e.target.value)}
                placeholder="0.00"
                min="0"
                step="0.01"
                disabled={submitting}
                className="w-full bg-surface-container-low border border-white/10 rounded-sm pr-8 pl-4 py-3 text-sm text-white font-mono placeholder:text-on-surface-variant/40 focus:ring-1 focus:ring-primary focus:border-primary/50 outline-none transition-all disabled:opacity-50"
              />
            </div>
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
                  جاري الإضافة...
                </>
              ) : (
                <>
                  <Icon name="add" className="!text-sm" />
                  إضافة الشريك
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
