"use client";

import { useMemo } from "react";
import { CalendarClock } from "lucide-react";
import type { Trade } from "@/types";

// Amber banner listing open short options that expire within the next
// `windowDays` days. Derived purely from the open positions passed in —
// no polling, no storage. Renders nothing when the window is clear.
export function ExpiryAlert({
  openOptions,
  windowDays = 7,
}: {
  openOptions: Trade[];
  windowDays?: number;
}) {
  const expiring = useMemo(() => {
    const today = new Date();
    const startOfToday = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate()
    );
    const horizon = new Date(startOfToday);
    horizon.setDate(horizon.getDate() + windowDays);

    return openOptions
      .filter((t) => {
        if (t.status !== "open") return false;
        if (!t.expiration?.trim()) return false;
        const exp = new Date(t.expiration);
        if (Number.isNaN(exp.getTime())) return false;
        const expDay = new Date(
          exp.getFullYear(),
          exp.getMonth(),
          exp.getDate()
        );
        return expDay >= startOfToday && expDay <= horizon;
      })
      .sort((a, b) => (a.expiration < b.expiration ? -1 : 1));
  }, [openOptions, windowDays]);

  if (expiring.length === 0) return null;

  return (
    <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-200 backdrop-blur-sm">
      <CalendarClock size={18} className="mt-0.5 shrink-0 text-amber-300" />
      <div className="flex-1">
        <p className="font-bold">
          {expiring.length === 1
            ? "عقد واحد ينتهي خلال أسبوع"
            : `${expiring.length} عقود تنتهي خلال أسبوع`}
        </p>
        <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-amber-200/80">
          {expiring.map((t) => (
            <span key={t.id} className="font-mono tabular-nums">
              {t.ticker} · {t.type} · {t.expiration}
            </span>
          ))}
        </p>
      </div>
    </div>
  );
}
