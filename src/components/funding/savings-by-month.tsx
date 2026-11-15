"use client";

import { PiggyBank } from "lucide-react";
import { roundSavings, type FundingRound } from "@/lib/funding-round";
import { fmtSar, fmtUsd } from "@/lib/money-format";
import { arabicMonthLabel } from "@/lib/whatsapp";

// How much the funding days saved, month by month (by each day's ledger
// date), with the running total. Executed days only — an undone day saved
// nothing.
export function SavingsByMonth({ rounds }: { rounds: FundingRound[] }) {
  const byMonth = new Map<string, { usd: number; sar: number; days: number; feesMissing: boolean }>();
  for (const r of rounds) {
    const sv = roundSavings(r);
    const month = r.ledgerDate?.slice(0, 7);
    if (!sv || !month) continue;
    const m = byMonth.get(month) ?? { usd: 0, sar: 0, days: 0, feesMissing: false };
    m.usd += sv.totalUsd;
    m.sar += sv.totalSar;
    m.days += 1;
    if (sv.transfersAvoided > 0 && !sv.feesSet) m.feesMissing = true;
    byMonth.set(month, m);
  }
  const months = [...byMonth.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  if (months.length === 0) return null;
  const totalUsd = months.reduce((s, [, m]) => s + m.usd, 0);
  const totalSar = months.reduce((s, [, m]) => s + m.sar, 0);
  const anyMissing = months.some(([, m]) => m.feesMissing);
  const money = (usd: number, sar: number, strong: boolean) => (
    <span dir="ltr" className="flex flex-col items-end font-mono tabular-nums">
      <span className={`${strong ? "text-base" : "text-sm"} font-bold ${usd >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
        {usd < 0 ? "−" : ""}
        {fmtUsd(Math.abs(usd))}
      </span>
      <span className="text-[11px] text-zinc-400">
        ≈ {sar < 0 ? "−" : ""}
        {fmtSar(Math.abs(sar))}
      </span>
    </span>
  );

  return (
    <div className="mb-8 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.04] p-5">
      <div className="mb-3 flex items-center gap-2">
        <PiggyBank size={16} className="text-emerald-300" />
        <h3 className="font-headline text-sm font-bold text-white">التوفير الشهري من يوم التمويل</h3>
      </div>
      <div className="divide-y divide-white/5">
        {months.map(([month, m]) => (
          <div key={month} className="flex items-center justify-between gap-3 py-2">
            <span className="text-sm text-zinc-200">
              {arabicMonthLabel(month)}
              {m.days > 1 && <span className="ms-1 text-[11px] text-zinc-500">({m.days} أيام تمويل)</span>}
              {m.feesMissing && <span className="ms-1 text-[11px] text-amber-300/80">*</span>}
            </span>
            {money(m.usd, m.sar, false)}
          </div>
        ))}
        {months.length > 1 && (
          <div className="flex items-center justify-between gap-3 pt-3">
            <span className="text-sm font-bold text-white">الإجمالي من البداية</span>
            {money(totalUsd, totalSar, true)}
          </div>
        )}
      </div>
      {anyMissing && (
        <p className="mt-2 text-[11px] text-amber-200/80">
          * فيه حوالات وفّرتها ما انحسبت رسومها لأن رسوم الحوالة ما كانت محددة وقتها.
        </p>
      )}
    </div>
  );
}
