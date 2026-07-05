"use client";

import { useEffect, useRef } from "react";
import { Icon } from "@/components/ui/icon";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  // Plain string or rich JSX (e.g. the settlement-preview table).
  description: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "تأكيد الحذف",
  cancelLabel = "إلغاء",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-md"
        onClick={onCancel}
      />

      {/* Dialog — same shell language as the ledger/assignment dialogs,
          with a rose glow since confirms guard destructive actions. */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-md mx-4 overflow-hidden rounded-xl border border-zinc-800/70 bg-gradient-to-br from-zinc-900/95 via-zinc-950/95 to-black p-6 shadow-[0_0_60px_-12px_rgba(244,63,94,0.25)] backdrop-blur-xl"
      >
        {/* Icon */}
        <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-md border border-rose-500/30 bg-rose-500/10">
          <Icon name="warning" className="text-rose-400 !text-2xl" />
        </div>

        {/* Content */}
        <h3 className="text-lg font-headline font-bold text-white text-center mb-2">
          {title}
        </h3>
        {/* div, not p: description may carry block-level JSX (preview tables) */}
        <div className="text-sm text-zinc-400 text-center leading-relaxed mb-6">
          {description}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 rounded-md border border-zinc-800/70 text-zinc-400 text-xs font-bold uppercase tracking-widest hover:bg-white/5 hover:text-white transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2.5 rounded-md bg-rose-500 text-white text-xs font-bold uppercase tracking-widest hover:bg-rose-400 transition-colors flex items-center justify-center gap-2"
          >
            <Icon name="delete" className="!text-sm" />
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
