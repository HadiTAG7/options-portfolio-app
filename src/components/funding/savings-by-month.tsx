"use client";

import { PiggyBank } from "lucide-react";
import { roundSavings, type FundingRound } from "@/lib/funding-round";
import { fmtSar, fmtUsd } from "@/lib/money-format";
import { arabicMonthLabel } from "@/lib/whatsapp";

// How much the funding days saved in currency difference, month by month
// (by each day's ledger date), with the running total. Executed days only
// — an undone day saved nothing.
export function SavingsByMonth({ rounds }: { rounds: FundingRound[] }) {
  const byMonth = new Map<string, { sar: number; usd: number; days: number }>();
  for (const r of rounds) {
    const sv = roundSavings(r);
    const month = r.ledgerDate?.slice(0, 7);
    if (!sv || !month) continue;
    const m = byMonth.get(month) ?? { sar: 0, usd: 0, days: 0 };
    m.sar += sv.savedSar;
    m.usd += sv.savedUsd;
    m.days += 1;
    byMonth.set(month, m);
  }
  const months = [...byMonth.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  if (!months.some(([, m]) => Math.abs(m.sar) >= 0.005)) return null;
  const totalSar = months.reduce((s, [, m]) => s + m.sar, 0);
  const totalUsd = months.reduce((s, [, m]) => s + m.usd, 0);
  const money = (sar: number, usd: number, strong: boolean) => (
    <span dir="ltr" className="flex flex-col items-end font-mono tabular-nums">
      <span className={`${strong ? "text-base" : "text-sm"} font-bold ${sar >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
        {sar < 0 ? "−" : ""}
        {fmtSar(Math.abs(sar))}
      </span>
      <span className="text-[11px] text-zinc-400">
        ≈ {usd < 0 ? "−" : ""}
        {fmtUsd(Math.abs(usd))}
      </span>
    </span>
  );

  return (
    <div className="mb-8 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.04] p-5">
      <div className="mb-1 flex items-center gap-2">
        <PiggyBank size={16} className="text-emerald-300" />
        <h3 className="font-headline text-sm font-bold text-white">التوفير الشهري من يوم التمويل</h3>
      </div>
      <p className="mb-2 text-[11px] text-zinc-500">فرق العملة اللي ما راح للبنك لأن إيداعات وسحوبات الريال تقابلت.</p>
      <div className="divide-y divide-white/5">
        {months.map(([month, m]) => (
          <div key={month} className="flex items-center justify-between gap-3 py-2">
            <span className="text-sm text-zinc-200">
              {arabicMonthLabel(month)}
              {m.days > 1 && <span className="ms-1 text-[11px] text-zinc-500">({m.days} أيام تمويل)</span>}
            </span>
            {money(m.sar, m.usd, false)}
          </div>
        ))}
        {months.length > 1 && (
          <div className="flex items-center justify-between gap-3 pt-3">
            <span className="text-sm font-bold text-white">الإجمالي من البداية</span>
            {money(totalSar, totalUsd, true)}
          </div>
        )}
      </div>
    </div>
  );
}
