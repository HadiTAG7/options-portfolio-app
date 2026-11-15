"use client";

import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, CheckCircle2, XCircle } from "lucide-react";
import type { FundingLine, FundingTotals } from "@/lib/funding-day";
import {
  paymentItemsFor,
  paymentProgress,
  unmatchedPayments,
  type FundingPayment,
  type PaymentProgress,
} from "@/lib/funding-round";
import { fmtSar, fmtUsd } from "@/lib/money-format";
import { PaymentBlock, UnmatchedPayments } from "@/components/funding/payment-block";

// What the summary reads from a plan — a live/server FundingPlan satisfies
// it, and so does an executed round's stored summary.
export interface SummaryPlan {
  totals: FundingTotals;
  lines: Array<
    Pick<FundingLine, "partnerId" | "name" | "cashIn" | "cashOut" | "cashInCurrency" | "cashOutCurrency" | "currency" | "exits">
  >;
  errors: string[];
  warnings: string[];
}

// Optional payment tracking: paid / remaining per item, with recording.
export interface SummaryTracking {
  payments: FundingPayment[];
  editable: boolean;
  onAdd: (party: string, amount: number, date: string, note: string | null) => Promise<string | null>;
  onRemove: (paymentId: string) => Promise<string | null>;
}

// The answer to "what do I do at the broker?" plus everything behind it:
// totals, the conversion that netting avoided, and who to collect from
// and pay. Amounts are shown in their real currency — never through the
// app's display-currency switch — because these are instructions.
export function FundingSummary({
  plan,
  rates,
  source,
  tracking,
  beforeAdd,
}: {
  plan: SummaryPlan;
  // SAR per USD for riyal deposits (rd) and riyal withdrawals (rw).
  rates: { rd: number; rw: number };
  source: "estimate" | "server" | "executed";
  tracking?: SummaryTracking;
  // Runs before a payment is recorded; a returned message aborts it.
  beforeAdd?: () => Promise<string | null>;
}) {
  const t = plan.totals;
  const net = Math.abs(t.net);
  const receive = plan.lines.filter((l) => l.cashIn >= 0.005);
  const pay = plan.lines.filter((l) => l.cashOut >= 0.005);
  const items = tracking ? paymentItemsFor(t, plan.lines) : [];
  const progressBy = new Map<string, PaymentProgress>(
    tracking ? paymentProgress(items, tracking.payments).map((p) => [p.party, p]) : []
  );
  const unmatched = tracking ? unmatchedPayments(items, tracking.payments) : [];
  const nameOf = (party: string) =>
    party === "broker" ? "البروكر" : (plan.lines.find((l) => l.partnerId === party)?.name ?? "شريك");
  const block = (party: string, label: string, compact: boolean) => {
    const pr = progressBy.get(party);
    if (!tracking || !pr) return null;
    return (
      <PaymentBlock
        progress={pr}
        label={label}
        editable={tracking.editable}
        compact={compact}
        onAdd={async (amount, date, note) => {
          const err = beforeAdd ? await beforeAdd() : null;
          return err ?? tracking.onAdd(party, amount, date, note);
        }}
        onRemove={tracking.onRemove}
      />
    );
  };

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
                {source === "server"
                  ? "معاينة الخادم — هذا ما سيُنفَّذ"
                  : source === "executed"
                    ? "منفّذ — متابعة الدفعات"
                    : "تقدير مباشر"}
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
        {t.brokerAction !== "none" &&
          block(
            "broker",
            t.brokerAction === "deposit" ? "تم تحويله للبروكر" : "تم استلامه من البروكر",
            false
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

      {/* Cash routing — each amount in the currency the cash actually
          moves in, with the other currency under it (deposits at the
          deposit rate, payouts at the withdrawal rate). */}
      {(receive.length > 0 || pay.length > 0) && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.04] p-4">
            <p className="mb-2 text-sm font-bold text-emerald-300">تستلم من</p>
            {receive.length === 0 && <p className="text-sm text-zinc-500">—</p>}
            {receive.map((l) => {
              const usd = l.cashIn;
              const sar = l.currency === "SAR" ? l.cashInCurrency : l.cashIn * rates.rd;
              return (
                <div key={l.partnerId} className="py-1.5">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-zinc-200">{l.name}</span>
                  <span dir="ltr" className="flex flex-col items-end font-mono tabular-nums">
                    <span className="font-bold text-emerald-300">
                      {l.currency === "SAR" ? fmtSar(sar) : fmtUsd(usd)}
                    </span>
                    <span className="text-xs text-zinc-400">
                      ≈ {l.currency === "SAR" ? fmtUsd(usd) : fmtSar(sar)}
                    </span>
                  </span>
                </div>
                {block(l.partnerId, "تم استلامه", true)}
                </div>
              );
            })}
          </div>
          <div className="rounded-lg border border-rose-500/20 bg-rose-500/[0.04] p-4">
            <p className="mb-2 text-sm font-bold text-rose-300">تدفع لـ</p>
            {pay.length === 0 && <p className="text-sm text-zinc-500">—</p>}
            {pay.map((l) => {
              const usd = l.cashOut;
              const sar = l.currency === "SAR" ? l.cashOutCurrency : l.cashOut * rates.rw;
              return (
                <div key={l.partnerId} className="py-1.5">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-zinc-200">
                    {l.name}
                    {l.exits && <span className="ms-1 text-xs text-rose-400">(خروج)</span>}
                  </span>
                  <span dir="ltr" className="flex flex-col items-end font-mono tabular-nums">
                    <span className="font-bold text-rose-300">
                      {l.currency === "SAR" ? fmtSar(sar) : fmtUsd(usd)}
                    </span>
                    <span className="text-xs text-zinc-400">
                      ≈ {l.currency === "SAR" ? fmtUsd(usd) : fmtSar(sar)}
                    </span>
                  </span>
                </div>
                {block(l.partnerId, "تم دفعه", true)}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tracking && unmatched.length > 0 && (
        <UnmatchedPayments
          payments={unmatched}
          nameOf={nameOf}
          editable={tracking.editable}
          onRemove={tracking.onRemove}
        />
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
