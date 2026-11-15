"use client";

import { PiggyBank } from "lucide-react";
import type { FundingSavings } from "@/lib/funding-round";
import { fmtSar, fmtUsd } from "@/lib/money-format";

// A funding day saves only where riyal deposits and withdrawals offset
// each other — transfers themselves cost nothing.
export function hasSavings(sv: FundingSavings): boolean {
  return sv.fxAvoidedSar >= 0.005 || Math.abs(sv.savedSar) >= 0.005;
}

// The currency difference this funding day kept from the bank: netted
// riyals never convert, so the spread between the deposit and withdrawal
// rates on them stays with the GP. Informational — not booked.
export function SavingsBox({ savings: sv, tense }: { savings: FundingSavings; tense: "future" | "past" }) {
  if (!hasSavings(sv)) return null;
  const cost = sv.savedSar <= -0.005;
  const none = Math.abs(sv.savedSar) < 0.005;
  return (
    <div
      className={`rounded-xl border p-4 ${
        cost ? "border-rose-500/30 bg-rose-500/[0.06]" : "border-emerald-500/30 bg-emerald-500/[0.06]"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <PiggyBank className={cost ? "text-rose-300" : "text-emerald-300"} size={22} />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-300/80">التوفير — فرق العملة</p>
            <p className="font-headline text-base font-bold text-white">
              {cost ? "فرق العملة عليك كمدير" : tense === "past" ? "وفّرت هذي العملية" : "هذي العملية بتوفّر لك"}
            </p>
          </div>
        </div>
        <div className="text-left" dir="ltr">
          <p className={`font-mono text-2xl font-bold tabular-nums ${cost ? "text-rose-300" : "text-emerald-300"}`}>
            {fmtSar(Math.abs(sv.savedSar))}
          </p>
          <p className="font-mono text-[11px] tabular-nums text-zinc-400">≈ {fmtUsd(Math.abs(sv.savedUsd))}</p>
        </div>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-zinc-300">
        <span dir="ltr" className="font-mono font-bold text-white">
          {fmtSar(sv.fxAvoidedSar)}
        </span>{" "}
        ما احتاجت تحويل عملة، لأن إيداعات وسحوبات الريال تقابلت داخلياً — ففرق العملة عليها ما راح للبنك.
      </p>
      <p className="mt-1 text-[11px] text-zinc-500">
        {none
          ? "سعر الإيداع نفس سعر السحب، فما فيه فرق عملة ينحسب."
          : "الفرق بين سعري الإيداع والسحب يبقى لك كمدير — خارج دفاتر الصندوق."}
      </p>
    </div>
  );
}
