"use client";

import { useState } from "react";
import { CheckCircle2, Plus, Trash2 } from "lucide-react";
import { DatePicker } from "@/components/ui/date-picker";
import type { FundingPayment, PaymentProgress } from "@/lib/funding-round";
import { fmtSar, fmtUsd } from "@/lib/money-format";
import { riyadhDate } from "@/lib/riyadh-time";

// Paid / remaining for one thing to pay or collect (the broker transfer, or
// one partner's deposit or payout), with the installments recorded so far.
// Tracking only — the books are written once, at execution.
export function PaymentBlock({
  progress,
  label,
  editable,
  compact = false,
  sarPerUsd,
  onAdd,
  onRemove,
}: {
  progress: PaymentProgress;
  label: string; // e.g. «تم تحويله للبروكر»
  editable: boolean;
  compact?: boolean;
  // The rate of this item's side (deposit or withdrawal): paid and
  // remaining are also shown in the other currency at it.
  sarPerUsd?: number;
  onAdd: (amount: number, date: string, note: string | null) => Promise<string | null>;
  onRemove: (paymentId: string) => Promise<string | null>;
}) {
  const fmt = (n: number) => (progress.currency === "SAR" ? fmtSar(n) : fmtUsd(n));
  // "≈ 342,967.61 ر.س" under a dollar amount, "≈ $2,129.30" under riyals.
  const other = (n: number) =>
    sarPerUsd && sarPerUsd > 0 ? (
      <span dir="ltr" className="whitespace-nowrap font-mono text-[11px] text-zinc-500">
        ≈ {progress.currency === "SAR" ? fmtUsd(n / sarPerUsd) : fmtSar(n * sarPerUsd)}
      </span>
    ) : null;
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const pct =
    progress.expected > 0 ? Math.min(100, (progress.paid / progress.expected) * 100) : 100;

  function startAdd() {
    setAmount(progress.remaining > 0 ? progress.remaining.toFixed(2) : "");
    setDate(riyadhDate());
    setNote("");
    setError(null);
    setOpen(true);
  }

  async function save() {
    const n = Number(amount);
    if (!(Number.isFinite(n) && n > 0)) {
      setError("اكتب مبلغاً صحيحاً");
      return;
    }
    setBusy(true);
    const err = await onAdd(Math.round(n * 100) / 100, date || riyadhDate(), note.trim() || null);
    setBusy(false);
    if (err) setError(err);
    else setOpen(false);
  }

  async function remove(id: string) {
    setBusy(true);
    const err = await onRemove(id);
    setBusy(false);
    setConfirmId(null);
    if (err) setError(err);
  }

  return (
    <div className={compact ? "mt-1.5 space-y-1.5" : "mt-4 space-y-2 rounded-lg border border-white/10 bg-black/20 p-3"}>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        {progress.complete ? (
          <span className="inline-flex items-center gap-1 font-bold text-emerald-300">
            <CheckCircle2 size={13} /> مكتمل
            {progress.overpaid > 0 && (
              <span className="font-normal text-amber-300">
                {" "}— زيادة <span dir="ltr" className="font-mono">{fmt(progress.overpaid)}</span>{" "}
                {other(progress.overpaid)}
              </span>
            )}
          </span>
        ) : (
          <span className="flex flex-wrap gap-x-4 gap-y-1 text-zinc-300">
            <span className="inline-flex flex-wrap items-baseline gap-x-1.5">
              <span className="whitespace-nowrap">
                {label}: <span dir="ltr" className="font-mono font-bold text-white">{fmt(progress.paid)}</span>
              </span>
              {other(progress.paid)}
            </span>
            <span className="inline-flex flex-wrap items-baseline gap-x-1.5">
              <span className="whitespace-nowrap">
                الباقي: <span dir="ltr" className="font-mono font-bold text-amber-200">{fmt(progress.remaining)}</span>
              </span>
              {other(progress.remaining)}
            </span>
          </span>
        )}
        {editable && !open && !progress.complete && (
          <button
            type="button"
            onClick={startAdd}
            className="inline-flex items-center gap-1 rounded-md border border-blue-500/40 px-2 py-1 text-[11px] font-bold text-blue-200 hover:bg-blue-500/10"
          >
            <Plus size={12} /> تسجيل دفعة
          </button>
        )}
      </div>

      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <div
          className={`h-full rounded-full ${progress.complete ? "bg-emerald-400" : "bg-blue-500"}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {open && (
        <div className="space-y-2 rounded-md border border-zinc-800/70 bg-zinc-950/70 p-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex items-center gap-1.5" dir="ltr">
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                dir="ltr"
                aria-label="المبلغ"
                disabled={busy}
                className="min-w-0 flex-1 rounded-md border border-zinc-700/60 bg-black/60 px-3 py-2.5 text-right font-mono text-sm text-white focus:border-blue-500 focus:outline-none"
              />
              <span className="text-xs text-zinc-400">{progress.currency === "SAR" ? "ر.س" : "$"}</span>
            </label>
            <DatePicker value={date} onChange={setDate} disabled={busy} placeholder="التاريخ" />
          </div>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="ملاحظة (اختياري)"
            maxLength={200}
            disabled={busy}
            className="w-full rounded-md border border-zinc-700/60 bg-black/60 px-3 py-2 text-xs text-white placeholder:text-zinc-600 focus:border-blue-500 focus:outline-none"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={busy}
              className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300"
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className="rounded-md bg-blue-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-blue-500 disabled:opacity-50"
            >
              {busy ? "…" : "حفظ"}
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-[11px] text-rose-300">{error}</p>}

      {progress.payments.length > 0 && (
        <ul className="space-y-1">
          {progress.payments.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-400">
              <span>
                <span dir="ltr" className="font-mono text-zinc-300">{p.date}</span>
                <span className="text-zinc-600"> · </span>
                <span dir="ltr" className="font-mono font-bold text-zinc-200">{fmt(p.amount)}</span>
                {p.note && <span className="text-zinc-500"> — {p.note}</span>}
              </span>
              {editable &&
                (confirmId === p.id ? (
                  <span className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => remove(p.id)}
                      disabled={busy}
                      className="rounded bg-rose-600 px-2 py-0.5 text-[10px] font-bold text-white"
                    >
                      حذف
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmId(null)}
                      className="rounded border border-zinc-700 px-2 py-0.5 text-[10px] text-zinc-300"
                    >
                      لا
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmId(p.id)}
                    className="text-zinc-600 hover:text-rose-300"
                    aria-label="حذف الدفعة"
                  >
                    <Trash2 size={12} />
                  </button>
                ))}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Recorded payments that no longer match anything to pay in the round (the
// request was removed, or its currency changed). Kept visible so nothing
// recorded silently disappears; delete them once settled.
export function UnmatchedPayments({
  payments,
  nameOf,
  editable,
  onRemove,
}: {
  payments: FundingPayment[];
  nameOf: (party: string) => string;
  editable: boolean;
  onRemove: (paymentId: string) => Promise<string | null>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  if (payments.length === 0) return null;

  async function remove(id: string) {
    setBusy(true);
    const err = await onRemove(id);
    setBusy(false);
    setConfirmId(null);
    setError(err);
  }

  return (
    <div className="space-y-1.5 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] p-3">
      <p className="text-xs font-bold text-amber-200">دفعات مسجّلة لا تطابق مبالغ هذه الجولة</p>
      <p className="text-[11px] text-zinc-400">
        الطلب حُذف أو تغيّرت عملته بعد تسجيل الدفعة. راجعها واحذفها إذا لم تعد لازمة.
      </p>
      <ul className="space-y-1">
        {payments.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-300">
            <span>
              <span className="font-bold">{nameOf(p.party)}</span>
              <span className="text-zinc-600"> · </span>
              <span dir="ltr" className="font-mono">{p.date}</span>
              <span className="text-zinc-600"> · </span>
              <span dir="ltr" className="font-mono font-bold text-zinc-100">
                {p.currency === "SAR" ? fmtSar(p.amount) : fmtUsd(p.amount)}
              </span>
              {p.note && <span className="text-zinc-500"> — {p.note}</span>}
            </span>
            {editable &&
              (confirmId === p.id ? (
                <span className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => remove(p.id)}
                    disabled={busy}
                    className="rounded bg-rose-600 px-2 py-0.5 text-[10px] font-bold text-white"
                  >
                    حذف
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmId(null)}
                    className="rounded border border-zinc-700 px-2 py-0.5 text-[10px] text-zinc-300"
                  >
                    لا
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmId(p.id)}
                  className="text-zinc-500 hover:text-rose-300"
                  aria-label="حذف الدفعة"
                >
                  <Trash2 size={12} />
                </button>
              ))}
          </li>
        ))}
      </ul>
      {error && <p className="text-[11px] text-rose-300">{error}</p>}
    </div>
  );
}
