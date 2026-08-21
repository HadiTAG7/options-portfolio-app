"use client";

import { useCallback, useMemo, useState } from "react";
import { LineChart, Pencil, Check, X } from "lucide-react";
import {
  useBenchmarks,
  monthReturnPct,
  cumulativeReturnPct,
} from "@/hooks/use-benchmarks";

export interface FundMonth {
  key: string; // YYYY-MM
  labelAr: string;
  profit: number; // gross, before the GP performance fee
  fees: number; // GP performance fee taken that month
  capital: number;
}

// Fund performance vs. selected benchmarks, month by month.
//
// The fund's monthly return is profit ÷ the capital it held THAT month, and
// the cumulative figure chains those monthly returns rather than summing
// them. Chaining is what makes the number comparable to a buy-and-hold
// index: summing would ignore compounding, and dividing total profit by
// today's capital would distort every month a deposit landed in.
//
// One honest limitation is stated in the footer rather than hidden: the
// fund's monthly profit is REALIZED only, while a benchmark's adjusted
// close is mark-to-market. Unrealized moves on open lots aren't in the
// historical months because those prices were never stored — so the fund's
// column is flattered in any month its open positions fell.
export function BenchmarkComparison({ months }: { months: FundMonth[] }) {
  const { series, loading, errors, symbols, setSymbols } = useBenchmarks(12);
  const [editing, setEditing] = useState(false);
  // Net of fees by default: a partner's real alternative is buying the index
  // itself, which carries no performance fee, so comparing the fund's GROSS
  // return against it would overstate what a partner actually earns.
  const [netOfFees, setNetOfFees] = useState(true);
  const [draft, setDraft] = useState(symbols.join(", "));

  // Oldest → newest for the table; chaining needs chronological order.
  const rows = useMemo(
    () => [...months].sort((a, b) => a.key.localeCompare(b.key)),
    [months]
  );
  const monthKeys = useMemo(() => rows.map((r) => r.key), [rows]);

  // useCallback so the cumulative memo can depend on it honestly instead of
  // closing over a function that changes identity every render.
  const fundMonthPct = useCallback(
    (m: FundMonth): number | null => {
      if (m.capital <= 0) return null;
      const profit = netOfFees ? m.profit - m.fees : m.profit;
      return (profit / m.capital) * 100;
    },
    [netOfFees]
  );

  const fundCumulative = useMemo(() => {
    let factor = 1;
    let any = false;
    for (const r of rows) {
      const p = fundMonthPct(r);
      if (p === null) continue;
      factor *= 1 + p / 100;
      any = true;
    }
    return any ? (factor - 1) * 100 : null;
  }, [rows, fundMonthPct]);

  function startEdit() {
    setDraft(symbols.join(", "));
    setEditing(true);
  }
  function saveEdit() {
    const next = draft.split(/[,\s]+/).filter(Boolean);
    if (next.length > 0) setSymbols(next);
    setEditing(false);
  }

  const pct = (v: number | null) =>
    v === null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
  const tone = (v: number | null) =>
    v === null
      ? "text-zinc-600"
      : v > 0
        ? "text-emerald-400"
        : v < 0
          ? "text-rose-400"
          : "text-zinc-400";

  return (
    <div className="mb-8 rounded-2xl border border-zinc-800/60 bg-zinc-950 p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10">
            <LineChart size={18} className="text-emerald-400" />
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
              الأداء مقابل المعيار · vs Benchmark
            </p>
            <p className="text-[10px] text-zinc-600">
              العائد الشهري مقارَناً بالمؤشرات
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded-md border border-zinc-800/70">
            {(
              [
                [true, "بعد الرسوم"],
                [false, "قبل الرسوم"],
              ] as const
            ).map(([v, label]) => (
              <button
                key={label}
                onClick={() => setNetOfFees(v)}
                title={
                  v
                    ? "صافي ما يستلمه الشريك بعد خصم رسوم الأداء"
                    : "أداء الاستراتيجية قبل خصم الرسوم"
                }
                className={`px-2.5 py-1.5 text-[10px] font-bold transition-colors ${
                  netOfFees === v
                    ? "bg-emerald-500/15 text-emerald-300"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        {editing ? (
          <div className="flex items-center gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveEdit();
                if (e.key === "Escape") setEditing(false);
              }}
              placeholder="SPY, QQQ, JEPQ"
              dir="ltr"
              className="w-52 rounded-md border border-zinc-800/70 bg-black/60 px-3 py-1.5 font-mono text-xs text-white outline-none focus:border-emerald-500"
            />
            <button
              onClick={saveEdit}
              className="rounded-md bg-emerald-600 p-1.5 text-white hover:bg-emerald-500"
              aria-label="حفظ"
            >
              <Check size={13} />
            </button>
            <button
              onClick={() => setEditing(false)}
              className="rounded-md border border-zinc-800/70 p-1.5 text-zinc-400 hover:bg-white/5"
              aria-label="إلغاء"
            >
              <X size={13} />
            </button>
          </div>
        ) : (
          <button
            onClick={startEdit}
            title="تغيير المؤشرات"
            className="inline-flex items-center gap-1.5 rounded-md border border-zinc-800/70 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-widest text-zinc-400 transition-colors hover:border-emerald-500/40 hover:text-emerald-300"
          >
            <Pencil size={11} />
            المؤشرات
          </button>
        )}
        </div>
      </div>

      {errors.length > 0 && (
        <div className="mb-3 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-300">
          تعذّر جلب: {errors.join(" · ")}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800/60 text-[10px] uppercase tracking-widest text-zinc-500">
              <th className="px-3 py-2.5 text-start font-semibold">الشهر</th>
              <th className="bg-emerald-500/[0.06] px-3 py-2.5 text-right font-semibold text-emerald-400">
                صندوقك
              </th>
              {symbols.map((s) => (
                <th
                  key={s}
                  dir="ltr"
                  className="px-3 py-2.5 text-right font-semibold"
                >
                  {s}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={symbols.length + 2}
                  className="px-3 py-10 text-center text-zinc-500"
                >
                  لا توجد أشهر بأرباح بعد
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const f = fundMonthPct(r);
              return (
                <tr
                  key={r.key}
                  className="border-b border-zinc-900/60 hover:bg-zinc-900/40"
                >
                  <td className="px-3 py-2.5 text-zinc-300">{r.labelAr}</td>
                  <td
                    dir="ltr"
                    className={`bg-emerald-500/[0.06] px-3 py-2.5 text-right font-mono font-bold tabular-nums ${tone(f)}`}
                  >
                    {pct(f)}
                  </td>
                  {symbols.map((s) => {
                    const b = monthReturnPct(series[s], r.key);
                    return (
                      <td
                        key={s}
                        dir="ltr"
                        className={`px-3 py-2.5 text-right font-mono tabular-nums ${tone(b)}`}
                      >
                        {loading && !series[s] ? "…" : pct(b)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t border-zinc-800 bg-zinc-900/40 text-[13px]">
                <td className="px-3 py-3 text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                  تراكمي · Cumulative
                </td>
                <td
                  dir="ltr"
                  className={`bg-emerald-500/[0.08] px-3 py-3 text-right font-mono font-bold tabular-nums ${tone(fundCumulative)}`}
                >
                  {pct(fundCumulative)}
                </td>
                {symbols.map((s) => (
                  <td
                    key={s}
                    dir="ltr"
                    className={`px-3 py-3 text-right font-mono font-bold tabular-nums ${tone(cumulativeReturnPct(series[s], monthKeys))}`}
                  >
                    {pct(cumulativeReturnPct(series[s], monthKeys))}
                  </td>
                ))}
              </tr>
              <tr className="text-[12px]">
                <td className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                  الفرق · Alpha
                </td>
                <td className="bg-emerald-500/[0.06] px-3 py-2.5 text-right text-zinc-600">
                  —
                </td>
                {symbols.map((s) => {
                  const b = cumulativeReturnPct(series[s], monthKeys);
                  const diff =
                    fundCumulative === null || b === null
                      ? null
                      : fundCumulative - b;
                  return (
                    <td
                      key={s}
                      dir="ltr"
                      className={`px-3 py-2.5 text-right font-mono font-bold tabular-nums ${tone(diff)}`}
                    >
                      {diff === null
                        ? "—"
                        : `${diff >= 0 ? "▲ +" : "▼ "}${diff.toFixed(2)}%`}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <p className="mt-5 max-w-3xl text-[11px] leading-6 text-zinc-500">
        عائد الصندوق = {netOfFees ? "ربح الشهر بعد خصم رسوم الأداء" : "ربح الشهر قبل الرسوم"} ÷ رأس المال في ذلك الشهر، والتراكمي مركّب
        (مضروب لا مجموع) ليكون قابلاً للمقارنة مع مؤشر. أرقام المؤشرات
        بأسعار الإغلاق <span className="text-zinc-400">المعدّلة</span> فتشمل
        التوزيعات — مهم لصناديق الدخل الشهري مثل JEPQ التي يُدفع عائدها
        نقداً.
      </p>
      <p className="mt-2 max-w-3xl text-[11px] leading-6 text-zinc-600">
        ملاحظة للإنصاف: ربح الصندوق هنا <span className="text-zinc-400">محقق
        فقط</span>، أما المؤشر فبسعر السوق — فأي شهر انخفضت فيه أسهمك
        المفتوحة يظهر عمود صندوقك أفضل من الواقع. (الأسعار التاريخية لم
        تُحفظ، والتسجيل اليومي بدأ حديثاً.)
      </p>
    </div>
  );
}
