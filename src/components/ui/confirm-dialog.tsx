"use client";

import { useEffect, useRef } from "react";
import { Icon } from "@/components/ui/icon";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
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
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onCancel}
      />

      {/* Dialog */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        className="relative bg-surface-container-high border border-white/10 rounded-sm p-6 w-full max-w-md mx-4 shadow-2xl shadow-black/50 animate-in"
      >
        {/* Icon */}
        <div className="w-12 h-12 rounded-full bg-secondary/10 flex items-center justify-center mb-4 mx-auto">
          <Icon name="warning" className="text-secondary !text-2xl" />
        </div>

        {/* Content */}
        <h3 className="text-lg font-headline font-bold text-white text-center mb-2">
          {title}
        </h3>
        <p className="text-sm text-on-surface-variant text-center leading-relaxed mb-6">
          {description}
        </p>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 rounded-sm border border-white/10 text-on-surface-variant text-xs font-bold uppercase tracking-widest hover:bg-white/5 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2.5 rounded-sm bg-secondary text-white text-xs font-bold uppercase tracking-widest hover:brightness-110 transition-all flex items-center justify-center gap-2"
          >
            <Icon name="delete" className="!text-sm" />
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
