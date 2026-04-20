"use client";

import { useEffect } from "react";
import { Icon } from "@/components/ui/icon";

interface ToastProps {
  message: string | null;
  tone?: "info" | "success" | "warning";
  onDismiss: () => void;
  duration?: number;
}

export function Toast({
  message,
  tone = "info",
  onDismiss,
  duration = 4000,
}: ToastProps) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDismiss, duration);
    return () => clearTimeout(t);
  }, [message, duration, onDismiss]);

  if (!message) return null;

  const toneClass =
    tone === "success"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
      : tone === "warning"
        ? "border-amber-500/40 bg-amber-500/10 text-amber-400"
        : "border-primary/40 bg-primary/10 text-primary";

  const iconName =
    tone === "success"
      ? "check_circle"
      : tone === "warning"
        ? "warning"
        : "info";

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed top-6 right-6 z-[200] flex items-center gap-3 rounded-sm border px-4 py-3 shadow-lg shadow-black/40 backdrop-blur-sm ${toneClass}`}
    >
      <Icon name={iconName} className="!text-lg" />
      <span className="text-sm font-medium">{message}</span>
      <button
        onClick={onDismiss}
        className="ml-2 opacity-60 hover:opacity-100 transition-opacity"
      >
        <Icon name="close" className="!text-sm" />
      </button>
    </div>
  );
}
