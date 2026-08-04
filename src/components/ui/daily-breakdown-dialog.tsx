"use client";

import { useEffect } from "react";
import { CalendarClock, X } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

export interface DailyBreakdownRow {
  date: string; // YYYY-MM-DD
  labelAr: string; // "٣ أغسطس ٢٠٢٦"
  realized: number; // premium collected + closed results booked that day
  stockMove: number; // mark-to-market move — today only (see note below)
  isToday: boolean;
}

interface DailyBreakdownDialogProps {
  open: boolean;
  rows: DailyBreakdownRow[];
  onClose: () => void;
}

// Day-by-day P&L, newest first.
//
// An honest limitation is surfaced in the footer rather than papered over:
// only realized figures can be reconstructed for past days, because the app
// stores one current price per stock, not a price history. So a past day
// shows what was actually booked that day (premium collected, sales,
// dividends) and today additionally shows the open book's move since the
// previous close. Inventing past unrealized swings would make these numbers
// untrustworthy, so they're simply not claimed.
export function DailyBreakdownDialog({
  open,
  rows,
  onClose,
}: DailyBreakdownDialogProps) {
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  const total = rows.reduce((s, r) => s + r.realized + r.stockMove, 0);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative mx-4 flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-zinc-800/70 bg-zinc-950 shadow-2xl shadow-black/60"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800/60 bg-zinc-900/40 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10">
              <CalendarClock size={17} className="text-emerald-400" />
            </div>
            <div>
              <h3 className="font-headline text-lg font-bold text-white">
                الربح والخسارة اليومية
              </h3>
              <p className="text-[10px] uppercase tracking-widest text-zinc-500">
                Daily P&amp;L
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="إغلاق"
            className="p-1 text-zinc-500 transition-colors hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        {/* Rows */}
        <div className="flex-1 overflow-y-auto">
          {rows.length === 0 ? (
            <p className="px-6 py-16 text-center text-sm text-zinc-500">
              لا توجد حركة مسجّلة بعد
            </p>
          ) : (
            <table className="w-full">
              <thead className="sticky top-0 bg-zinc-950">
                <tr className="border-b border-zinc-800/60 text-[10px] uppercase tracking-widest text-zinc-500">
                  <th className="px-6 py-3 text-right font-semibold">
                    اليوم · Day
                  </th>
                  <th className="px-6 py-3 text-left font-semibold">
                    محقق · Realized
                  </th>
                  <th className="px-6 py-3 text-left font-semibold">
                    حركة الأسهم · Stocks
                  </th>
                  <th className="px-6 py-3 text-left font-semibold">
                    الإجمالي · Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const dayTotal = r.realized + r.stockMove;
                  return (
                    <tr
                      key={r.date}
                      className={`border-b border-zinc-900/60 transition-colors hover:bg-zinc-900/40 ${
                        r.isToday ? "bg-emerald-500/[0.04]" : ""
                      }`}
                    >
                      <td className="px-6 py-3.5 text-sm text-zinc-200">
                        <span className="flex items-center gap-2">
                          {r.labelAr}
                          {r.isToday && (
                            <span className="rounded-full bg-emerald-500/10 px-1.5 py-[1px] text-[8px] font-bold text-emerald-400">
                              اليوم
                            </span>
                          )}
                        </span>
                      </td>
                      <td
                        dir="ltr"
                        className={`px-6 py-3.5 text-left font-mono text-[13px] tabular-nums ${
                          r.realized > 0
                            ? "text-emerald-400"
                            : r.realized < 0
                              ? "text-rose-400"
                              : "text-zinc-600"
                        }`}
                      >
                        {r.realized === 0 ? "—" : formatCurrency(r.realized)}
                      </td>
                      <td
                        dir="ltr"
                        className={`px-6 py-3.5 text-left font-mono text-[13px] tabular-nums ${
                          r.stockMove > 0
                            ? "text-emerald-400"
                            : r.stockMove < 0
                              ? "text-rose-400"
                              : "text-zinc-600"
                        }`}
                      >
                        {r.isToday && r.stockMove !== 0
                          ? formatCurrency(r.stockMove)
                          : "—"}
                      </td>
                      <td
                        dir="ltr"
                        className={`px-6 py-3.5 text-left font-mono text-[13px] font-bold tabular-nums ${
                          dayTotal >= 0 ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {formatCurrency(dayTotal)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer: total + the honest caveat */}
        <div className="border-t border-zinc-800/60 bg-zinc-900/40 px-6 py-4">
          <div className="flex items-baseline justify-between">
            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
              الإجمالي · Total
            </span>
            <span
              dir="ltr"
              className={`font-mono text-lg font-bold tabular-nums ${
                total >= 0 ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              {formatCurrency(total)}
            </span>
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-zinc-500">
            «محقق» = العلاوات المحصّلة والمبيعات والتوزيعات المسجّلة في ذلك
            اليوم. «حركة الأسهم» تظهر لليوم الحالي فقط — التطبيق يحفظ سعراً
            حالياً واحداً لكل سهم ولا يحفظ تاريخ الأسعار، فحركة الأيام السابقة
            غير متوفرة.
          </p>
        </div>
      </div>
    </div>
  );
}
