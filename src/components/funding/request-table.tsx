"use client";

import type { Partner } from "@/types";
import type { FundingPlan, FundingRequest, FundingRequestKind } from "@/lib/funding-day";
import { isManagerPartner } from "@/lib/partner-profit";
import { getPartnerInvestment } from "@/lib/utils";
import { fmtSar, fmtUsd } from "@/lib/money-format";

const KIND_LABEL: Record<FundingRequestKind | "none", string> = {
  none: "لا شيء",
  deposit: "إيداع",
  withdraw: "سحب مبلغ",
  withdraw_profits: "سحب كل الأرباح",
  exit: "خروج كامل",
};

// One row per active partner: what they hold, this cycle's pending profit,
// the request, and its effect. Amounts in the request are typed in the
// currency chosen for that row; everything else is shown in USD.
export function RequestTable({
  partners,
  requests,
  estimate,
  disabled,
  onChange,
}: {
  partners: Partner[];
  requests: FundingRequest[];
  estimate: FundingPlan | null;
  disabled: boolean;
  onChange: (next: FundingRequest[]) => void;
}) {
  const byId = new Map(requests.map((r) => [r.partnerId, r]));
  const lineOf = (id: string) => estimate?.lines.find((l) => l.partnerId === id) ?? null;

  function update(partnerId: string, patch: Partial<FundingRequest> | null) {
    const others = requests.filter((r) => r.partnerId !== partnerId);
    if (patch === null) return onChange(others);
    const prev = byId.get(partnerId) ?? {
      partnerId,
      kind: "deposit" as FundingRequestKind,
      amount: null,
      currency: "USD" as const,
      note: null,
    };
    const next = { ...prev, ...patch };
    if (next.kind === "withdraw_profits" || next.kind === "exit") next.amount = null;
    onChange([...others, next]);
  }

  const ordered = [...partners].sort(
    (a, b) => Number(isManagerPartner(b)) - Number(isManagerPartner(a)) || a.name.localeCompare(b.name, "ar")
  );

  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-800/60">
      <table className="w-full min-w-[860px] text-right text-sm">
        <thead>
          <tr className="border-b border-zinc-800/60 bg-zinc-950/60 text-[10px] uppercase tracking-widest text-zinc-500">
            <th className="px-3 py-3 font-bold">الشريك</th>
            <th className="px-3 py-3 font-bold">الاستثمار</th>
            <th className="px-3 py-3 font-bold">ربح الدورة</th>
            <th className="px-3 py-3 font-bold">الطلب</th>
            <th className="px-3 py-3 font-bold">المبلغ</th>
            <th className="px-3 py-3 font-bold">ملاحظة</th>
            <th className="px-3 py-3 font-bold">النتيجة</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/40">
          {ordered.map((p) => {
            const req = byId.get(p.id) ?? null;
            const line = lineOf(p.id);
            const isGP = isManagerPartner(p);
            const kind: FundingRequestKind | "none" = req?.kind ?? "none";
            const needsAmount = kind === "deposit" || kind === "withdraw";
            return (
              <tr key={p.id} className={req ? "bg-blue-500/[0.03]" : ""}>
                <td className="px-3 py-3">
                  <span className="font-bold text-white">{p.name}</span>
                  {isGP && (
                    <span className="ms-2 rounded-full border border-blue-400/40 px-1.5 py-0.5 text-[9px] font-bold text-blue-300">
                      المدير
                    </span>
                  )}
                </td>
                <td className="px-3 py-3 font-mono tabular-nums text-zinc-300" dir="ltr">
                  {fmtUsd(getPartnerInvestment(p))}
                </td>
                <td
                  className={`px-3 py-3 font-mono tabular-nums ${
                    (line?.pendingNet ?? 0) < 0 ? "text-rose-300" : "text-emerald-300"
                  }`}
                  dir="ltr"
                  title={isGP && line ? `+ عمولة متاحة ${fmtUsd(line.potAfterFees)}` : undefined}
                >
                  {line ? fmtUsd(line.pendingNet) : "—"}
                  {isGP && line && line.potAfterFees >= 0.005 && (
                    <span className="block text-[10px] text-zinc-500">+ عمولة {fmtUsd(line.potAfterFees)}</span>
                  )}
                </td>
                <td className="px-3 py-3">
                  <select
                    value={kind}
                    disabled={disabled}
                    onChange={(e) => {
                      const v = e.target.value as FundingRequestKind | "none";
                      update(p.id, v === "none" ? null : { kind: v });
                    }}
                    className="rounded-md border border-zinc-700/60 bg-zinc-950/80 px-2 py-1.5 text-xs text-white focus:border-blue-500 focus:outline-none disabled:opacity-50"
                  >
                    {(["none", "deposit", "withdraw", "withdraw_profits", "exit"] as const)
                      .filter((k) => !(isGP && k === "exit"))
                      .map((k) => (
                        <option key={k} value={k}>
                          {KIND_LABEL[k]}
                        </option>
                      ))}
                  </select>
                </td>
                <td className="px-3 py-3">
                  {req && (
                    <div className="flex items-center gap-1.5" dir="ltr">
                      {needsAmount && (
                        <input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="0.01"
                          disabled={disabled}
                          value={req.amount ?? ""}
                          onChange={(e) =>
                            update(p.id, {
                              amount: e.target.value === "" ? null : Number(e.target.value),
                            })
                          }
                          className="w-28 rounded-md border border-zinc-700/60 bg-zinc-950/80 px-2 py-1.5 text-right font-mono text-xs text-white focus:border-blue-500 focus:outline-none disabled:opacity-50"
                        />
                      )}
                      <div className="flex overflow-hidden rounded-md border border-zinc-700/60">
                        {(["USD", "SAR"] as const).map((c) => (
                          <button
                            key={c}
                            type="button"
                            disabled={disabled}
                            onClick={() => update(p.id, { currency: c })}
                            className={`px-2 py-1.5 text-[10px] font-bold ${
                              req.currency === c ? "bg-blue-600 text-white" : "text-zinc-400 hover:text-white"
                            }`}
                          >
                            {c === "USD" ? "$" : "ر.س"}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </td>
                <td className="px-3 py-3">
                  {req && (
                    <input
                      type="text"
                      maxLength={200}
                      disabled={disabled}
                      value={req.note ?? ""}
                      placeholder="اختياري"
                      onChange={(e) => update(p.id, { note: e.target.value || null })}
                      className="w-32 rounded-md border border-zinc-700/60 bg-zinc-950/80 px-2 py-1.5 text-xs text-white placeholder:text-zinc-600 focus:border-blue-500 focus:outline-none disabled:opacity-50"
                    />
                  )}
                </td>
                <td className="px-3 py-3 text-[11px] leading-5">
                  {line ? (
                    <>
                      {line.cashIn >= 0.005 && (
                        <span className="block text-emerald-300" dir="ltr">
                          +{line.currency === "SAR" ? fmtSar(line.cashInCurrency) : fmtUsd(line.cashIn)}
                        </span>
                      )}
                      {line.cashOut >= 0.005 && (
                        <span className="block text-rose-300" dir="ltr">
                          −{line.currency === "SAR" ? fmtSar(line.cashOutCurrency) : fmtUsd(line.cashOut)}
                        </span>
                      )}
                      <span className="block text-zinc-500">
                        بعدها: <span dir="ltr" className="font-mono text-zinc-300">{fmtUsd(line.investmentAfter)}</span>
                      </span>
                    </>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
