"use client";

import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, CheckCircle2, XCircle } from "lucide-react";
import type { FundingPlan } from "@/lib/funding-day";
import { fmtSar, fmtUsd } from "@/lib/money-format";

// The answer to "what do I do at the broker?" plus everything behind it:
// totals, the conversion that netting avoided, and who to collect from
// and pay. Amounts are shown in their real currency — never through the
// app's display-currency switch — because these are instructions.
export function FundingSummary({
  plan,
  rates,
  source,
}: {
  plan: FundingPlan;
  // SAR per USD for riyal deposits (rd) and riyal withdrawals (rw).
  rates: { rd: number; rw: number };
  source: "estimate" | "server";
}) {
  const t = plan.totals;
  const net = Math.abs(t.net);
  const receive = plan.lines.filter((l) => l.cashIn >= 0.005);
  const pay = plan.lines.filter((l) => l.cashOut >= 0.005);
  const money = (usd: number, sar: number, currency: "USD" | "SAR") =>
    currency === "SAR" ? fmtSar(sar) : fmtUsd(usd);

  return (
    <div className="space-y-4">
      {/* Broker instruction */}
      <div
        className={`rounded-xl border p-5 ${
          t.brokerAction === "deposit"
            ? "border-blue-500/40 bg-blue-500/10"
            : t.brokerAction === "withdraw"
              ? "border-rose-500/40 bg-rose-500/10"
              : "border-emerald-500/40 bg-emerald-500/10"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {t.brokerAction === "deposit" ? (
              <ArrowUpFromLine className="text-blue-400" size={22} />
            ) : t.brokerAction === "withdraw" ? (
              <ArrowDownToLine className="text-rose-400" size={22} />
            ) : (
              <CheckCircle2 className="text-emerald-400" size={22} />
            )}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400">
                {source === "server" ? "معاينة الخادم — هذا ما سيُنفَّذ" : "تقدير مباشر"}
              </p>
              <p className="font-headline text-lg font-bold text-white">
                {t.brokerAction === "deposit"
                  ? "أودع للبروكر"
                  : t.brokerAction === "withdraw"
                    ? "اسحب من البروكر"
                    : "لا تحويل للبروكر"}
              </p>
            </div>
          </div>
          {t.brokerAction !== "none" && (
            <div className="text-left" dir="ltr">
              <p className="font-mono text-2xl font-bold tabular-nums text-white">{fmtUsd(net)}</p>
              <p className="font-mono text-[11px] tabular-nums text-zinc-400">
                ≈ {fmtSar(net * (t.brokerAction === "deposit" ? rates.rd : rates.rw))}
              </p>
            </div>
          )}
        </div>
        {t.transferAvoided >= 0.005 && (
          <p className="mt-3 text-[11px] text-zinc-300">
            التجميع وفّر تحويل{" "}
            <span className="font-mono font-bold text-emerald-300" dir="ltr">
              {fmtUsd(t.transferAvoided)}
            </span>{" "}
            كان سيمر عبر البروكر لو نُفّذت الطلبات كلٌ على حدة.
            {t.fxAvoidedSar >= 0.005 && (
              <>
                {" "}وتحويل عملة تجنّبته:{" "}
                <span className="font-mono font-bold text-emerald-300" dir="ltr">
                  {fmtSar(t.fxAvoidedSar)}
                </span>
                .
              </>
            )}
          </p>
        )}
      </div>

      {/* Totals */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["إجمالي الإيداعات", fmtUsd(t.deposits), "text-emerald-300"],
          ["إجمالي السحوبات", fmtUsd(t.withdrawals), "text-rose-300"],
          ["أرباح الدورة المُقفلة", fmtUsd(t.settledGross), "text-zinc-200"],
          ["رسوم لعمولة المدير", fmtUsd(t.feesToGp), "text-zinc-200"],
        ].map(([label, value, tone]) => (
          <div key={label} className="rounded-lg border border-zinc-800/60 bg-zinc-950/50 p-3">
            <p className="text-[10px] text-zinc-500">{label}</p>
            <p className={`font-mono text-sm font-bold tabular-nums ${tone}`} dir="ltr">
              {value}
            </p>
          </div>
        ))}
      </div>
      {(t.sarIn >= 0.005 || t.sarOut >= 0.005) && (
        <p className="text-[11px] text-zinc-400">
          بالريال: تستلم <span dir="ltr" className="font-mono text-zinc-200">{fmtSar(t.sarIn)}</span> وتدفع{" "}
          <span dir="ltr" className="font-mono text-zinc-200">{fmtSar(t.sarOut)}</span> — صافي الريال
          المطلوب تحويله: <span dir="ltr" className="font-mono font-bold text-white">{fmtSar(t.fxNeededSar)}</span>{" "}
          (الإيداع بسعر {rates.rd}، والسحب بسعر {rates.rw}).
        </p>
      )}
      {Math.abs(t.fxSpreadSar ?? 0) >= 0.005 && (
        <div
          className={`rounded-lg border p-3 text-[11px] leading-relaxed ${
            (t.fxSpreadSar ?? 0) > 0
              ? "border-blue-500/30 bg-blue-500/[0.06] text-blue-100"
              : "border-rose-500/30 bg-rose-500/[0.06] text-rose-200"
          }`}
        >
          {(t.fxSpreadSar ?? 0) > 0 ? "فرق الصرف — لك كمدير: " : "فرق الصرف — عليك كمدير: "}
          <span dir="ltr" className="font-mono font-bold">
            {fmtSar(Math.abs(t.fxSpreadSar ?? 0))}
          </span>{" "}
          <span dir="ltr" className="font-mono text-zinc-400">
            (≈ {fmtUsd(Math.abs(t.fxSpreadUsd ?? 0))})
          </span>
          . الريالات التي تقابلت داخلياً لم تُحوَّل فعلياً، والفرق بين سعري الإيداع والسحب عليها يبقى عندك — خارج دفاتر
          الصندوق.
        </div>
      )}

      {/* Cash routing */}
      {(receive.length > 0 || pay.length > 0) && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.04] p-3">
            <p className="mb-2 text-[11px] font-bold text-emerald-300">تستلم من</p>
            {receive.length === 0 && <p className="text-[11px] text-zinc-500">—</p>}
            {receive.map((l) => (
              <div key={l.partnerId} className="flex items-center justify-between py-1 text-xs">
                <span className="text-zinc-300">{l.name}</span>
                <span dir="ltr" className="font-mono font-bold tabular-nums text-emerald-300">
                  {money(l.cashIn, l.cashInCurrency, l.currency)}
                </span>
              </div>
            ))}
          </div>
          <div className="rounded-lg border border-rose-500/20 bg-rose-500/[0.04] p-3">
            <p className="mb-2 text-[11px] font-bold text-rose-300">تدفع لـ</p>
            {pay.length === 0 && <p className="text-[11px] text-zinc-500">—</p>}
            {pay.map((l) => (
              <div key={l.partnerId} className="flex items-center justify-between py-1 text-xs">
                <span className="text-zinc-300">
                  {l.name}
                  {l.exits && <span className="ms-1 text-[10px] text-rose-400">(خروج)</span>}
                </span>
                <span dir="ltr" className="font-mono font-bold tabular-nums text-rose-300">
                  {money(l.cashOut, l.cashOutCurrency, l.currency)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {plan.errors.length > 0 && (
        <div className="space-y-1 rounded-lg border border-rose-500/40 bg-rose-500/10 p-3">
          {plan.errors.map((e) => (
            <p key={e} className="flex items-start gap-2 text-xs text-rose-200">
              <XCircle size={13} className="mt-0.5 shrink-0" /> {e}
            </p>
          ))}
        </div>
      )}
      {plan.warnings.length > 0 && (
        <div className="space-y-1 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] p-3">
          {plan.warnings.map((w) => (
            <p key={w} className="flex items-start gap-2 text-[11px] leading-relaxed text-amber-200">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {w}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
