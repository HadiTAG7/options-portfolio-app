"use client";

import { useState } from "react";
import { History, Undo2 } from "lucide-react";
import type { FundingRound } from "@/lib/funding-round";
import { fmtSar, fmtUsd } from "@/lib/money-format";

const STATUS: Record<FundingRound["status"], { label: string; cls: string }> = {
  draft: { label: "مسودة", cls: "border-blue-400/40 text-blue-300" },
  executed: { label: "منفّذ", cls: "border-emerald-500/40 text-emerald-300" },
  reverted: { label: "أُلغي التسجيل", cls: "border-amber-500/40 text-amber-300" },
  cancelled: { label: "مسودة ملغاة", cls: "border-zinc-600 text-zinc-400" },
};

// Past rounds with what moved. An executed round can be reverted here as
// one unit — the only place a funding day can be undone, because it
// touched every partner at once.
export function RoundHistory({
  rounds,
  onUndo,
}: {
  rounds: FundingRound[];
  onUndo: (roundId: string) => Promise<string | null>; // error message or null
}) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const past = rounds.filter((r) => r.status !== "draft");
  if (past.length === 0) return null;

  async function undo(id: string) {
    setBusy(id);
    setError(null);
    const msg = await onUndo(id);
    setBusy(null);
    setConfirming(null);
    if (msg) setError(msg);
  }

  return (
    <div className="rounded-xl border border-zinc-800/60 bg-zinc-950/60 p-5">
      <div className="mb-4 flex items-center gap-2">
        <History size={15} className="text-zinc-400" />
        <h3 className="font-headline text-sm font-bold text-white">سجل أيام التمويل</h3>
      </div>
      {error && (
        <p className="mb-3 rounded-md border border-rose-500/40 bg-rose-500/10 p-2 text-xs text-rose-200">{error}</p>
      )}
      <div className="space-y-3">
        {past.map((r) => {
          const s = STATUS[r.status];
          const t = r.summary?.totals;
          return (
            <div key={r.id} className="rounded-lg border border-zinc-800/60 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${s.cls}`}>{s.label}</span>
                  <span className="font-mono text-xs text-zinc-300" dir="ltr">
                    {r.ledgerDate ?? r.createdAt.slice(0, 10)}
                  </span>
                </div>
                {t && (
                  <span className="text-[11px] text-zinc-400">
                    {t.brokerAction === "deposit"
                      ? "أودعت للبروكر "
                      : t.brokerAction === "withdraw"
                        ? "سحبت من البروكر "
                        : "بدون تحويل للبروكر"}
                    {t.brokerAction !== "none" && (
                      <span dir="ltr" className="font-mono font-bold text-white">
                        {fmtUsd(Math.abs(t.net))}
                      </span>
                    )}
                  </span>
                )}
              </div>
              {r.summary && (
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-zinc-400">
                  {r.summary.lines
                    .filter((l) => l.cashIn >= 0.005 || l.cashOut >= 0.005)
                    .map((l) => (
                      <span key={l.partnerId}>
                        {l.name}:{" "}
                        <span dir="ltr" className={`font-mono ${l.cashIn >= 0.005 ? "text-emerald-300" : "text-rose-300"}`}>
                          {l.cashIn >= 0.005 ? "+" : "−"}
                          {l.currency === "SAR"
                            ? fmtSar(l.cashIn >= 0.005 ? l.cashInCurrency : l.cashOutCurrency)
                            : fmtUsd(l.cashIn >= 0.005 ? l.cashIn : l.cashOut)}
                        </span>
                        {l.exits && " (خروج)"}
                      </span>
                    ))}
                </div>
              )}
              {r.status === "executed" && (
                <div className="mt-3">
                  {confirming === r.id ? (
                    <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/[0.06] p-2">
                      <span className="text-[11px] text-amber-200">
                        يعيد أرصدة كل الشركاء كما كانت قبل هذا اليوم. التحويلات الفعلية لا تُلغى.
                      </span>
                      <button
                        onClick={() => undo(r.id)}
                        disabled={busy === r.id}
                        className="rounded-md bg-rose-600 px-3 py-1 text-[11px] font-bold text-white hover:bg-rose-500 disabled:opacity-50"
                      >
                        {busy === r.id ? "جارٍ الإلغاء…" : "تأكيد الإلغاء"}
                      </button>
                      <button
                        onClick={() => setConfirming(null)}
                        className="rounded-md border border-zinc-700 px-3 py-1 text-[11px] text-zinc-300"
                      >
                        تراجع
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirming(r.id)}
                      className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 px-2.5 py-1 text-[11px] text-zinc-300 hover:border-rose-500/50 hover:text-rose-200"
                    >
                      <Undo2 size={11} /> إلغاء تسجيل هذا اليوم
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
