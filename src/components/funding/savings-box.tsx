"use client";

import { PiggyBank } from "lucide-react";
import type { FundingSavings } from "@/lib/funding-round";
import { fmtSar, fmtUsd } from "@/lib/money-format";

// "حوالة وحدة / حوالتين / 3 حوالات / 11 حوالة"
export function transfersLabel(n: number): string {
  if (n === 1) return "حوالة وحدة";
  if (n === 2) return "حوالتين";
  if (n >= 3 && n <= 10) return `${n} حوالات`;
  return `${n} حوالة`;
}

export function hasSavings(sv: FundingSavings): boolean {
  return sv.transfersAvoided > 0 || Math.abs(sv.fxSavedSar) >= 0.005;
}

// What this funding day saved against moving every request on its own:
// the transfers it avoided (priced at the GP's fees) and the exchange
// spread on riyals that offset each other. Informational — not booked.
export function SavingsBox({
  savings: sv,
  tense,
  feesEditable,
}: {
  savings: FundingSavings;
  tense: "future" | "past";
  feesEditable: boolean; // the fee fields are on screen (the open draft)
}) {
  if (!hasSavings(sv)) return null;
  const without = sv.depositTransfers + sv.withdrawTransfers;
  const total = sv.totalUsd;
  return (
    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <PiggyBank className="text-emerald-300" size={22} />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-300/80">التوفير</p>
            <p className="font-headline text-base font-bold text-white">
              {tense === "past" ? "وفّرت هذي العملية" : "هذي العملية بتوفّر لك"}
            </p>
          </div>
        </div>
        <div className="text-left" dir="ltr">
          <p className={`font-mono text-2xl font-bold tabular-nums ${total >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
            {total < 0 ? "−" : ""}
            {fmtUsd(Math.abs(total))}
          </p>
          <p className="font-mono text-[11px] tabular-nums text-zinc-400">
            ≈ {sv.totalSar < 0 ? "−" : ""}
            {fmtSar(Math.abs(sv.totalSar))}
          </p>
        </div>
      </div>

      <ul className="mt-3 space-y-2 text-xs text-zinc-300">
        {sv.transfersAvoided > 0 && (
          <li>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span>
                رسوم {transfersLabel(sv.transfersAvoided)} ما احتجتها
                <span className="text-zinc-500">
                  {" "}— بدل {transfersLabel(without)}، {sv.transfersWith === 1 ? "حوالة وحدة" : "ولا حوالة"}
                </span>
              </span>
              {sv.feesSet ? (
                <span dir="ltr" className="font-mono font-bold text-white">
                  <bdi>{fmtUsd(sv.feesSavedUsd)}</bdi>
                  <span className="font-normal text-zinc-400">
                    {" "}≈ <bdi>{fmtSar(sv.feesSavedSar)}</bdi>
                  </span>
                </span>
              ) : (
                <span className="text-[11px] text-amber-200/90">
                  {feesEditable ? "حدّد رسوم الحوالة فوق عشان تنحسب" : "رسوم الحوالة ما كانت محددة"}
                </span>
              )}
            </div>
          </li>
        )}
        {Math.abs(sv.fxSavedSar) >= 0.005 && (
          <li>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span>{sv.fxSavedSar > 0 ? "فرق صرف ما راح للبنك" : "فرق الصرف عليك كمدير"}</span>
              <span dir="ltr" className={`font-mono font-bold ${sv.fxSavedSar > 0 ? "text-white" : "text-rose-300"}`}>
                <bdi>{fmtSar(Math.abs(sv.fxSavedSar))}</bdi>
                <span className="font-normal text-zinc-400">
                  {" "}≈ <bdi>{fmtUsd(Math.abs(sv.fxSavedUsd))}</bdi>
                </span>
              </span>
            </div>
            <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-500">
              الريالات اللي تقابلت داخلياً ما تحوّلت، والفرق بين سعري الإيداع والسحب عليها يبقى لك كمدير — خارج دفاتر
              الصندوق.
            </p>
          </li>
        )}
      </ul>

      {(sv.volumeAvoidedUsd >= 0.005 || sv.fxAvoidedSar >= 0.005) && (
        <p className="mt-3 border-t border-white/5 pt-2 text-[11px] text-zinc-500">
          {sv.volumeAvoidedUsd >= 0.005 && (
            <>
              ما مرّ عبر البروكر:{" "}
              <span dir="ltr" className="font-mono text-zinc-300">
                {fmtUsd(sv.volumeAvoidedUsd)}
              </span>
            </>
          )}
          {sv.volumeAvoidedUsd >= 0.005 && sv.fxAvoidedSar >= 0.005 && " · "}
          {sv.fxAvoidedSar >= 0.005 && (
            <>
              ريالات ما احتاجت تحويل عملة:{" "}
              <span dir="ltr" className="font-mono text-zinc-300">
                {fmtSar(sv.fxAvoidedSar)}
              </span>
            </>
          )}
        </p>
      )}
    </div>
  );
}
