"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { create } from "zustand";
import { LineChart, Pencil, Check, X } from "lucide-react";
import {
  useBenchmarks,
  monthReturnPct,
  cumulativeReturnPct,
} from "@/hooks/use-benchmarks";
import {
  computeSeriesMetrics,
  computeRelativeMetrics,
  type SeriesMetrics,
  type RelativeMetrics,
} from "@/lib/performance-metrics";

export interface FundMonth {
  key: string; // YYYY-MM
  labelAr: string;
  profit: number; // gross, before the GP performance fee
  fees: number; // GP performance fee taken that month
  capital: number;
}

// Annual risk-free rate feeding Sharpe / Sortino / alpha. Stored as the
// raw text the GP typed; validated on read so a half-typed value can't
// poison the math. 4% is only a starting point — the tooltip says to set
// it to the current T-bill yield.
//
// Zustand store + hydrate() in an effect, mirroring use-currency: the
// server renders the default, localStorage is only consulted after
// hydration, and no React setState runs inside the effect.
const RF_STORAGE_KEY = "benchmarkRiskFreePct";
const RF_DEFAULT = 4;

interface RfState {
  text: string;
  set: (s: string) => void;
  hydrate: () => void;
}

const useRfStore = create<RfState>((set) => ({
  text: String(RF_DEFAULT),
  set: (text) => {
    set({ text });
    try {
      window.localStorage.setItem(RF_STORAGE_KEY, text);
    } catch {
      // private mode — the choice just won't persist
    }
  },
  hydrate: () => {
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(RF_STORAGE_KEY);
    } catch {
      return;
    }
    if (raw !== null) set((s) => (s.text === raw ? s : { text: raw }));
  },
}));

type Tab = "monthly" | "metrics";

// Fund performance vs. selected benchmarks — two views over the same
// aligned data:
//   • شهري: month-by-month returns with the chained cumulative row.
//   • مقاييس: the standard comparison statistics (CAGR, volatility,
//     Sharpe, Sortino, max drawdown, Calmar, win rate, beta/alpha/
//     correlation/information ratio vs each index).
//
// The fund's monthly return is profit ÷ the capital it held THAT month, and
// cumulative figures chain those monthly returns rather than summing them.
// Chaining is what makes the number comparable to a buy-and-hold index.
//
// Every metric column — fund and benchmarks alike — is computed over the
// SAME months (the fund's active months). A benchmark statistic over a
// longer window next to the fund's short one would not be a comparison.
export function BenchmarkComparison({ months }: { months: FundMonth[] }) {
  const { series, loading, errors, symbols, setSymbols } = useBenchmarks(12);
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState<Tab>("monthly");
  // Net of fees by default: a partner's real alternative is buying the index
  // itself, which carries no performance fee, so comparing the fund's GROSS
  // return against it would overstate what a partner actually earns.
  const [netOfFees, setNetOfFees] = useState(true);
  const [draft, setDraft] = useState(symbols.join(", "));
  const rfText = useRfStore((s) => s.text);
  const onRfChange = useRfStore((s) => s.set);
  useEffect(() => {
    useRfStore.getState().hydrate();
  }, []);
  const rfAnnual = useMemo(() => {
    const v = Number(rfText.trim());
    return Number.isFinite(v) && v >= 0 && v <= 25 ? v : RF_DEFAULT;
  }, [rfText]);

  // Oldest → newest for the table; chaining needs chronological order.
  const rows = useMemo(
    () => [...months].sort((a, b) => a.key.localeCompare(b.key)),
    [months]
  );
  const monthKeys = useMemo(() => rows.map((r) => r.key), [rows]);

  // useCallback so the memos can depend on it honestly instead of closing
  // over a function that changes identity every render.
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

  // ── Aligned return series (the metrics tab's raw material) ──
  const fundSeriesPct = useMemo(
    () => rows.map((r) => fundMonthPct(r)),
    [rows, fundMonthPct]
  );
  const benchSeriesPct = useMemo(() => {
    const out: Record<string, (number | null)[]> = {};
    for (const s of symbols) {
      out[s] = monthKeys.map((k) => monthReturnPct(series[s], k));
    }
    return out;
  }, [symbols, series, monthKeys]);

  const fundMetrics = useMemo(
    () => computeSeriesMetrics(fundSeriesPct, monthKeys, rfAnnual),
    [fundSeriesPct, monthKeys, rfAnnual]
  );
  const benchMetrics = useMemo(() => {
    const out: Record<string, SeriesMetrics> = {};
    for (const s of symbols) {
      out[s] = computeSeriesMetrics(benchSeriesPct[s], monthKeys, rfAnnual);
    }
    return out;
  }, [symbols, benchSeriesPct, monthKeys, rfAnnual]);
  const relMetrics = useMemo(() => {
    const out: Record<string, RelativeMetrics> = {};
    for (const s of symbols) {
      out[s] = computeRelativeMetrics(
        fundSeriesPct,
        benchSeriesPct[s],
        rfAnnual
      );
    }
    return out;
  }, [symbols, fundSeriesPct, benchSeriesPct, rfAnnual]);

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
  // For magnitudes with no "good" sign to celebrate (volatility, win
  // rate) — and for drawdowns, whose own minus sign carries the story.
  const pctPlain = (v: number | null) => (v === null ? "—" : `${v.toFixed(2)}%`);
  const ratio = (v: number | null) => (v === null ? "—" : v.toFixed(2));
  const tone = (v: number | null) =>
    v === null
      ? "text-zinc-600"
      : v > 0
        ? "text-emerald-400"
        : v < 0
          ? "text-rose-400"
          : "text-zinc-400";
  const toneNeutral = (v: number | null) =>
    v === null ? "text-zinc-600" : "text-zinc-200";
  const toneDrawdown = (v: number | null) =>
    v === null ? "text-zinc-600" : v < 0 ? "text-rose-400" : "text-zinc-400";

  // A metrics row: label, tooltip, and how to read + format each column.
  // `relative` rows only exist against a benchmark, so the fund column
  // renders "—".
  interface MetricRow {
    labelAr: string;
    labelEn: string;
    title: string;
    fund: () => { text: string; cls: string; title?: string };
    bench: (s: string) => { text: string; cls: string; title?: string };
  }
  interface MetricGroup {
    heading: string;
    rows: MetricRow[];
  }

  const monthTitle = (key: string | null) =>
    key ? `الشهر: ${key}` : undefined;

  const metricGroups: MetricGroup[] = [
    {
      heading: "العائد · Return",
      rows: [
        {
          labelAr: "العائد التراكمي",
          labelEn: "Cumulative",
          title: "العوائد الشهرية مركّبة (مضروبة لا مجموعة) على كامل الفترة",
          fund: () => ({
            text: pct(fundMetrics.cumulativePct),
            cls: tone(fundMetrics.cumulativePct),
          }),
          bench: (s) => ({
            text: pct(benchMetrics[s]?.cumulativePct ?? null),
            cls: tone(benchMetrics[s]?.cumulativePct ?? null),
          }),
        },
        {
          labelAr: "العائد السنوي المكافئ",
          labelEn: "CAGR",
          title:
            "لو استمرت نفس الوتيرة سنة كاملة: (1+التراكمي)^(12÷عدد الأشهر)−1 — تقدير استقرائي مع فترة قصيرة",
          fund: () => ({
            text: pct(fundMetrics.cagrPct),
            cls: tone(fundMetrics.cagrPct),
          }),
          bench: (s) => ({
            text: pct(benchMetrics[s]?.cagrPct ?? null),
            cls: tone(benchMetrics[s]?.cagrPct ?? null),
          }),
        },
        {
          labelAr: "متوسط العائد الشهري",
          labelEn: "Avg Month",
          title: "متوسط حسابي للعوائد الشهرية",
          fund: () => ({
            text: pct(fundMetrics.meanMonthlyPct),
            cls: tone(fundMetrics.meanMonthlyPct),
          }),
          bench: (s) => ({
            text: pct(benchMetrics[s]?.meanMonthlyPct ?? null),
            cls: tone(benchMetrics[s]?.meanMonthlyPct ?? null),
          }),
        },
        {
          labelAr: "أفضل شهر",
          labelEn: "Best Month",
          title: "أعلى عائد شهري في الفترة",
          fund: () => ({
            text: pct(fundMetrics.bestMonthPct),
            cls: tone(fundMetrics.bestMonthPct),
            title: monthTitle(fundMetrics.bestMonthKey),
          }),
          bench: (s) => ({
            text: pct(benchMetrics[s]?.bestMonthPct ?? null),
            cls: tone(benchMetrics[s]?.bestMonthPct ?? null),
            title: monthTitle(benchMetrics[s]?.bestMonthKey ?? null),
          }),
        },
        {
          labelAr: "أسوأ شهر",
          labelEn: "Worst Month",
          title: "أدنى عائد شهري في الفترة",
          fund: () => ({
            text: pct(fundMetrics.worstMonthPct),
            cls: tone(fundMetrics.worstMonthPct),
            title: monthTitle(fundMetrics.worstMonthKey),
          }),
          bench: (s) => ({
            text: pct(benchMetrics[s]?.worstMonthPct ?? null),
            cls: tone(benchMetrics[s]?.worstMonthPct ?? null),
            title: monthTitle(benchMetrics[s]?.worstMonthKey ?? null),
          }),
        },
        {
          labelAr: "نسبة الأشهر الرابحة",
          labelEn: "Win Rate",
          title: "كم شهراً من الفترة أغلق بعائد موجب",
          fund: () => ({
            text: pctPlain(fundMetrics.winRatePct),
            cls: toneNeutral(fundMetrics.winRatePct),
          }),
          bench: (s) => ({
            text: pctPlain(benchMetrics[s]?.winRatePct ?? null),
            cls: toneNeutral(benchMetrics[s]?.winRatePct ?? null),
          }),
        },
      ],
    },
    {
      heading: "المخاطر · Risk",
      rows: [
        {
          labelAr: "التقلب السنوي",
          labelEn: "Volatility",
          title:
            "الانحراف المعياري للعوائد الشهرية ×√12 — رقم أقل يعني رحلة أهدأ",
          fund: () => ({
            text: pctPlain(fundMetrics.annualVolPct),
            cls: toneNeutral(fundMetrics.annualVolPct),
          }),
          bench: (s) => ({
            text: pctPlain(benchMetrics[s]?.annualVolPct ?? null),
            cls: toneNeutral(benchMetrics[s]?.annualVolPct ?? null),
          }),
        },
        {
          labelAr: "أقصى تراجع",
          labelEn: "Max Drawdown",
          title:
            "أكبر هبوط من قمة سابقة في منحنى النمو المركّب — 0.00% يعني ما حصل تراجع بعد",
          fund: () => ({
            text: pctPlain(fundMetrics.maxDrawdownPct),
            cls: toneDrawdown(fundMetrics.maxDrawdownPct),
          }),
          bench: (s) => ({
            text: pctPlain(benchMetrics[s]?.maxDrawdownPct ?? null),
            cls: toneDrawdown(benchMetrics[s]?.maxDrawdownPct ?? null),
          }),
        },
        {
          labelAr: "نسبة شارب",
          labelEn: "Sharpe",
          title:
            "(متوسط العائد − العائد الخالي من المخاطر) ÷ التقلب، سنوية. فوق 1 جيد وفوق 2 ممتاز",
          fund: () => ({
            text: ratio(fundMetrics.sharpe),
            cls: tone(fundMetrics.sharpe),
          }),
          bench: (s) => ({
            text: ratio(benchMetrics[s]?.sharpe ?? null),
            cls: tone(benchMetrics[s]?.sharpe ?? null),
          }),
        },
        {
          labelAr: "نسبة سورتينو",
          labelEn: "Sortino",
          title:
            "مثل شارب لكنها تعاقب تقلب الخسائر فقط — «—» يعني لا توجد أشهر تحت العائد الخالي من المخاطر أصلاً",
          fund: () => ({
            text: ratio(fundMetrics.sortino),
            cls: tone(fundMetrics.sortino),
          }),
          bench: (s) => ({
            text: ratio(benchMetrics[s]?.sortino ?? null),
            cls: tone(benchMetrics[s]?.sortino ?? null),
          }),
        },
        {
          labelAr: "نسبة كالمار",
          labelEn: "Calmar",
          title:
            "العائد السنوي المكافئ ÷ أقصى تراجع — «—» تعني لا يوجد تراجع يُقسم عليه بعد",
          fund: () => ({
            text: ratio(fundMetrics.calmar),
            cls: tone(fundMetrics.calmar),
          }),
          bench: (s) => ({
            text: ratio(benchMetrics[s]?.calmar ?? null),
            cls: tone(benchMetrics[s]?.calmar ?? null),
          }),
        },
      ],
    },
    {
      heading: "صندوقك مقابل كل مؤشر · vs Index",
      rows: [
        {
          labelAr: "بيتا",
          labelEn: "Beta",
          title:
            "حساسية صندوقك لحركة المؤشر: 1 يتحرك مثله، أقل من 1 أهدأ منه، سالبة عكسه",
          fund: () => ({ text: "—", cls: "text-zinc-600" }),
          bench: (s) => ({
            text: ratio(relMetrics[s]?.beta ?? null),
            cls: toneNeutral(relMetrics[s]?.beta ?? null),
          }),
        },
        {
          labelAr: "ألفا (جنسن، سنوية)",
          labelEn: "Alpha",
          title:
            "العائد الزائد بعد خصم ما يفسّره تعرّضك للمؤشر (بيتا) — الموجبة تعني قيمة مضافة فوق ركوب السوق",
          fund: () => ({ text: "—", cls: "text-zinc-600" }),
          bench: (s) => ({
            text: pct(relMetrics[s]?.alphaAnnualPct ?? null),
            cls: tone(relMetrics[s]?.alphaAnnualPct ?? null),
          }),
        },
        {
          labelAr: "معامل الارتباط",
          labelEn: "Correlation",
          title:
            "من −1 إلى +1: إلى أي حد يتحرك صندوقك مع المؤشر شهرياً",
          fund: () => ({ text: "—", cls: "text-zinc-600" }),
          bench: (s) => ({
            text: ratio(relMetrics[s]?.correlation ?? null),
            cls: toneNeutral(relMetrics[s]?.correlation ?? null),
          }),
        },
        {
          labelAr: "نسبة المعلومات",
          labelEn: "Info Ratio",
          title:
            "متوسط تفوقك على المؤشر ÷ ثبات هذا التفوق (خطأ التتبع)، سنوية — تقيس هل التفوق منتظم أم صدفة",
          fund: () => ({ text: "—", cls: "text-zinc-600" }),
          bench: (s) => ({
            text: ratio(relMetrics[s]?.informationRatio ?? null),
            cls: tone(relMetrics[s]?.informationRatio ?? null),
          }),
        },
      ],
    },
  ];

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
              {tab === "monthly"
                ? "العائد الشهري مقارَناً بالمؤشرات"
                : "مقاييس الأداء والمخاطر القياسية"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-md border border-zinc-800/70">
            {(
              [
                ["monthly", "شهري"],
                ["metrics", "مقاييس الأداء"],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                onClick={() => setTab(v)}
                className={`px-2.5 py-1.5 text-[10px] font-bold transition-colors ${
                  tab === v
                    ? "bg-emerald-500/15 text-emerald-300"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
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

      {tab === "monthly" && (
        <>
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
        </>
      )}

      {tab === "metrics" && (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-zinc-800/50 bg-zinc-900/30 px-3 py-2">
            <p className="text-[11px] text-zinc-500">
              محسوبة على{" "}
              <span className="font-bold text-zinc-300">{fundMetrics.n}</span>{" "}
              {fundMetrics.n === 2 ? "شهرين" : "أشهر"} — نفس الأشهر لكل
              الأعمدة، عائد الصندوق{" "}
              {netOfFees ? "بعد الرسوم" : "قبل الرسوم"}
            </p>
            <label className="flex items-center gap-2 text-[11px] text-zinc-500">
              <span title="يدخل في شارب وسورتينو وألفا — اضبطه على عائد أذون الخزانة الأمريكية الحالي">
                العائد الخالي من المخاطر (سنوي)
              </span>
              <span dir="ltr" className="flex items-center gap-1">
                <input
                  value={rfText}
                  onChange={(e) => onRfChange(e.target.value)}
                  inputMode="decimal"
                  dir="ltr"
                  className="w-14 rounded-md border border-zinc-800/70 bg-black/60 px-2 py-1 text-right font-mono text-xs text-white outline-none focus:border-emerald-500"
                />
                <span className="font-mono text-zinc-400">%</span>
              </span>
            </label>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800/60 text-[10px] uppercase tracking-widest text-zinc-500">
                  <th className="px-3 py-2.5 text-start font-semibold">
                    المقياس
                  </th>
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
                {fundMetrics.n === 0 && (
                  <tr>
                    <td
                      colSpan={symbols.length + 2}
                      className="px-3 py-10 text-center text-zinc-500"
                    >
                      لا توجد أشهر بأرباح بعد
                    </td>
                  </tr>
                )}
                {fundMetrics.n > 0 &&
                  metricGroups.map((group) => (
                    <MetricGroupRows
                      key={group.heading}
                      group={group}
                      symbols={symbols}
                      loading={loading}
                      series={series}
                    />
                  ))}
              </tbody>
            </table>
          </div>

          <p className="mt-5 max-w-3xl text-[11px] leading-6 text-zinc-500">
            كل الأعمدة محسوبة على أشهر الصندوق نفسها لتكون المقارنة عادلة.
            المقاييس الإحصائية (شارب، سورتينو، بيتا، الارتباط) تحتاج تاريخاً
            أطول لتستقر — مع {fundMetrics.n === 2 ? "شهرين" : `${fundMetrics.n} أشهر`}{" "}
            فقط اقرأها كإشارة أولية لا حكماً نهائياً. مرّر المؤشر فوق اسم أي
            مقياس لشرحه.
          </p>
        </>
      )}

      <p className="mt-2 max-w-3xl text-[11px] leading-6 text-zinc-600">
        ملاحظة للإنصاف: ربح الصندوق هنا <span className="text-zinc-400">محقق
        فقط</span>، أما المؤشر فبسعر السوق — فأي شهر انخفضت فيه أسهمك
        المفتوحة يظهر عمود صندوقك أفضل من الواقع. (الأسعار التاريخية لم
        تُحفظ، والتسجيل اليومي بدأ حديثاً.)
      </p>
    </div>
  );
}

// One metric group: a full-width heading row, then its metric rows. The
// benchmark cells show "…" while that symbol's series is still loading, so
// a slow fetch doesn't read as "no data".
function MetricGroupRows({
  group,
  symbols,
  loading,
  series,
}: {
  group: {
    heading: string;
    rows: {
      labelAr: string;
      labelEn: string;
      title: string;
      fund: () => { text: string; cls: string; title?: string };
      bench: (s: string) => { text: string; cls: string; title?: string };
    }[];
  };
  symbols: string[];
  loading: boolean;
  series: Record<string, Record<string, number>>;
}) {
  return (
    <>
      <tr className="bg-zinc-900/50">
        <td
          colSpan={symbols.length + 2}
          className="px-3 py-2 text-[9px] font-bold uppercase tracking-[0.2em] text-zinc-500"
        >
          {group.heading}
        </td>
      </tr>
      {group.rows.map((row) => {
        const fund = row.fund();
        return (
          <tr
            key={row.labelEn}
            className="border-b border-zinc-900/60 hover:bg-zinc-900/40"
          >
            <td className="px-3 py-2.5" title={row.title}>
              <span className="cursor-help text-zinc-300">{row.labelAr}</span>
              <span className="ms-2 text-[9px] uppercase tracking-wider text-zinc-600">
                {row.labelEn}
              </span>
            </td>
            <td
              dir="ltr"
              title={fund.title}
              className={`bg-emerald-500/[0.06] px-3 py-2.5 text-right font-mono font-bold tabular-nums ${fund.cls}`}
            >
              {fund.text}
            </td>
            {symbols.map((s) => {
              const cell = row.bench(s);
              return (
                <td
                  key={s}
                  dir="ltr"
                  title={cell.title}
                  className={`px-3 py-2.5 text-right font-mono tabular-nums ${cell.cls}`}
                >
                  {loading && !series[s] ? "…" : cell.text}
                </td>
              );
            })}
          </tr>
        );
      })}
    </>
  );
}
