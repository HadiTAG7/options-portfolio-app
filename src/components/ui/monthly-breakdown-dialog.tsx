"use client";

import { useEffect, useMemo } from "react";
import { Receipt, TrendingUp, X } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

export interface MonthlyBreakdownRow {
  key: string; // "YYYY-MM"
  labelAr: string;
  quarter: string;
  grossProfit: number;
  gpFees: number;
  status: "Active" | "Settled";
}

interface MonthlyBreakdownDialogProps {
  open: boolean;
  mode: "profit" | "fees";
  rows: MonthlyBreakdownRow[];
  onClose: () => void;
}

// One dialog, two modes. "profit" picks grossProfit and styles in
// emerald (same accent as the Total Yield card). "fees" picks gpFees
// and styles in cyan (same accent as the Management Fees card). Total
// row at the bottom sums whichever field is in play, so the dialog
// stays self-checking against the card it was launched from.
export function MonthlyBreakdownDialog({
  open,
  mode,
  rows,
  onClose,
}: MonthlyBreakdownDialogProps) {
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  const isProfit = mode === "profit";
  const titleAr = isProfit ? "إجمالي العائد الشهري" : "رسوم الإدارة الشهرية";
  const titleEn = isProfit ? "Monthly Yield" : "Monthly Fees";
  const valueLabel = isProfit ? "الأرباح · Profit" : "الرسوم · Fees";

  // Newest-first; show only months that actually have a value in the
  // selected mode (avoids cluttering with $0 rows).
  const visibleRows = useMemo(
    () =>
      rows.filter((r) =>
        isProfit ? r.grossProfit !== 0 : r.gpFees !== 0
      ),
    [rows, isProfit]
  );

  const total = useMemo(
    () =>
      visibleRows.reduce(
        (s, r) => s + (isProfit ? r.grossProfit : r.gpFees),
        0
      ),
    [visibleRows, isProfit]
  );

  if (!open) return null;

  const accent = isProfit
    ? {
        border: "border-emerald-500/30",
        chipBg: "bg-emerald-500/10",
        chipBorder: "border-emerald-500/30",
        iconColor: "text-emerald-400",
        valuePositive: "text-emerald-400",
        valueNegative: "text-rose-400",
        shadow: "shadow-[0_0_60px_-12px_rgba(16,185,129,0.3)]",
      }
    : {
        border: "border-cyan-400/30",
        chipBg: "bg-cyan-500/10",
        chipBorder: "border-cyan-400/30",
        iconColor: "text-cyan-300",
        valuePositive: "text-cyan-200",
        valueNegative: "text-rose-400",
        shadow: "shadow-[0_0_60px_-12px_rgba(34,211,238,0.28)]",
      };

  const Icn = isProfit ? TrendingUp : Receipt;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-md"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        className={`relative w-full max-w-xl mx-4 overflow-hidden rounded-xl border ${accent.border} bg-gradient-to-br from-zinc-900/95 via-zinc-950/95 to-black ${accent.shadow} backdrop-blur-xl`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800/70 bg-zinc-950/60 px-6 py-4">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-9 w-9 items-center justify-center rounded-md border ${accent.chipBorder} ${accent.chipBg}`}
            >
              <Icn size={18} className={accent.iconColor} />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-headline font-bold text-white">
                {titleAr}
              </span>
              <span className="text-[10px] uppercase tracking-[0.22em] text-zinc-500 font-semibold">
                {titleEn}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-200"
            aria-label="إغلاق"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        {visibleRows.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="text-sm text-zinc-300">
              {isProfit
                ? "لا توجد أرباح مسجلة بعد"
                : "لا توجد رسوم مسجلة بعد"}
            </p>
            <p className="text-[10px] text-zinc-500 mt-1">
              No monthly data yet
            </p>
          </div>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto">
            <table className="w-full text-right">
              <thead className="sticky top-0 z-10 bg-zinc-950/90 backdrop-blur">
                <tr className="text-[10px] text-zinc-500 uppercase tracking-[0.2em]">
                  <th className="px-6 py-3 font-semibold">الشهر · Month</th>
                  <th className="px-6 py-3 font-semibold">الربع · Quarter</th>
                  <th className="px-6 py-3 font-semibold text-left">
                    {valueLabel}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {visibleRows.map((r) => {
                  const value = isProfit ? r.grossProfit : r.gpFees;
                  const positive = value >= 0;
                  return (
                    <tr
                      key={r.key}
                      className="transition-colors hover:bg-white/[0.03]"
                    >
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-white font-semibold">
                            {r.labelAr}
                          </span>
                          {r.status === "Active" && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-[1px] text-[9px] font-bold uppercase tracking-widest text-emerald-300">
                              <span className="h-1 w-1 rounded-full bg-emerald-400" />
                              نشط
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-3">
                        <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono font-semibold">
                          {r.quarter}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-left">
                        <span
                          className={`text-sm font-mono tabular-nums font-bold ${
                            positive ? accent.valuePositive : accent.valueNegative
                          }`}
                        >
                          {positive ? "+" : ""}
                          {formatCurrency(value)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-zinc-800/80 bg-zinc-950/80">
                  <td className="px-6 py-3" colSpan={2}>
                    <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-400">
                      الإجمالي · Total
                    </span>
                  </td>
                  <td className="px-6 py-3 text-left">
                    <span
                      className={`text-sm font-headline font-bold font-mono tabular-nums ${
                        total >= 0 ? accent.valuePositive : accent.valueNegative
                      }`}
                    >
                      {total >= 0 ? "+" : ""}
                      {formatCurrency(total)}
                    </span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
