"use client";

import { useEffect, useState } from "react";
import { Landmark, X } from "lucide-react";
import type { FundingPlan } from "@/lib/funding-day";
import { roundRates, type FundingRound } from "@/lib/funding-round";
import { fundingApi } from "@/lib/funding-api";
import { FundingSummary } from "@/components/funding/funding-summary";

type Phase =
  | { k: "loading" }
  | { k: "ready"; round: FundingRound; plan: FundingPlan; fingerprint: string; notice: string | null }
  | { k: "executing"; round: FundingRound; plan: FundingPlan; fingerprint: string }
  | { k: "done"; round: FundingRound }
  | { k: "error"; message: string };

// Execution is two-step on purpose: the SERVER computes the preview the
// GP confirms (server clock, server data), and execution commits only if
// the state still produces exactly that preview. If anything moved in
// between, the new preview replaces the old one and must be confirmed
// again — the GP never executes numbers they didn't see.
export function ExecuteDialog({
  open,
  flushSave,
  onClose,
  onExecuted,
}: {
  open: boolean;
  // Saves any pending edits and returns the latest round (or null on error).
  flushSave: () => Promise<FundingRound | null>;
  onClose: () => void;
  onExecuted: (round: FundingRound) => void;
}) {
  const [phase, setPhase] = useState<Phase>({ k: "loading" });
  const [ackSettle, setAckSettle] = useState(false);
  const [ackTransfers, setAckTransfers] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      setPhase({ k: "loading" });
      setAckSettle(false);
      setAckTransfers(false);
      const latest = await flushSave();
      if (cancelled) return;
      if (!latest) {
        setPhase({ k: "error", message: "تعذّر حفظ آخر التعديلات — أعد المحاولة" });
        return;
      }
      const res = await fundingApi.preview(latest.id);
      if (cancelled) return;
      if (!res.ok) {
        setPhase({ k: "error", message: res.error });
        return;
      }
      setPhase({ k: "ready", round: res.round, plan: res.plan, fingerprint: res.fingerprint, notice: null });
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [open, flushSave]);

  if (!open) return null;

  async function execute() {
    if (phase.k !== "ready") return;
    const { round, plan, fingerprint } = phase;
    setPhase({ k: "executing", round, plan, fingerprint });
    const res = await fundingApi.execute(round.id, round.version, fingerprint);
    if (res.ok) {
      setPhase({ k: "done", round: res.round });
      onExecuted(res.round);
      return;
    }
    setAckSettle(false);
    setAckTransfers(false);
    if (res.code === "fingerprint" && res.plan && res.fingerprint) {
      setPhase({
        k: "ready",
        round,
        plan: res.plan,
        fingerprint: res.fingerprint,
        notice: "تغيّرت البيانات منذ المعاينة (صفقة أو رصيد). هذه المعاينة الجديدة — راجعها ثم أكّد من جديد.",
      });
      return;
    }
    if (res.code === "plan_errors" && res.errors) {
      setPhase({ k: "error", message: res.errors.join(" · ") });
      return;
    }
    setPhase({ k: "error", message: res.error });
  }

  const busy = phase.k === "loading" || phase.k === "executing";
  const view = phase.k === "ready" || phase.k === "executing" ? phase : null;
  const canExecute =
    phase.k === "ready" && phase.plan.errors.length === 0 && ackSettle && ackTransfers;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => !busy && onClose()} />
      <div
        role="dialog"
        aria-modal="true"
        className="relative mx-4 flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-zinc-800/70 bg-gradient-to-br from-zinc-900/95 via-zinc-950/95 to-black"
      >
        <div className="flex items-center justify-between border-b border-zinc-800/70 bg-zinc-950/60 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md border border-blue-500/30 bg-blue-500/10">
              <Landmark size={16} className="text-blue-400" />
            </div>
            <div>
              <h3 className="font-headline text-sm font-bold text-white">تنفيذ يوم التمويل</h3>
              <p className="text-[10px] text-zinc-500">المعاينة النهائية من الخادم — راجعها قبل التأكيد</p>
            </div>
          </div>
          <button
            onClick={() => !busy && onClose()}
            className="rounded-md p-1.5 text-zinc-500 hover:bg-white/5 hover:text-white"
            aria-label="إغلاق"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-6">
          {phase.k === "loading" && <p className="py-10 text-center text-sm text-zinc-400">جارٍ تجهيز المعاينة من الخادم…</p>}
          {phase.k === "error" && (
            <p className="rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">{phase.message}</p>
          )}
          {phase.k === "done" && (
            <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-200">
              تم تنفيذ يوم التمويل وتسجيل كل العمليات دفعة واحدة. نفّذ الآن التحويل الفعلي للبروكر والبنك حسب
              الملخص، وتقدر تلغي التسجيل من سجل الجولات إذا لزم.
            </div>
          )}
          {view && (
            <>
              {phase.k === "ready" && phase.notice && (
                <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">{phase.notice}</p>
              )}
              <FundingSummary plan={view.plan} rates={roundRates(view.round)} source="server" />
              {view.plan.errors.length === 0 && (
                <div className="space-y-2 rounded-lg border border-zinc-800/60 bg-zinc-950/50 p-4 text-xs text-zinc-300">
                  <label className="flex cursor-pointer items-start gap-2">
                    <input type="checkbox" checked={ackSettle} disabled={busy} onChange={(e) => setAckSettle(e.target.checked)} className="mt-0.5" />
                    <span>
                      أفهم أن دورة الأرباح تُقفل اليوم لكل الشركاء: تُصرف أرباح من طلب سحبها، وتُثبَّت أرباح الباقين في رأس
                      المال، وتنتقل رسوم الأداء لعمولة المدير.
                    </span>
                  </label>
                  <label className="flex cursor-pointer items-start gap-2">
                    <input type="checkbox" checked={ackTransfers} disabled={busy} onChange={(e) => setAckTransfers(e.target.checked)} className="mt-0.5" />
                    <span>
                      التطبيق يسجّل الدفاتر فقط — التحويل الفعلي للبروكر والبنك أنفّذه بنفسي حسب الملخص. والإلغاء لاحقاً
                      يعدّل الدفاتر ولا يعكس أي تحويل.
                    </span>
                  </label>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex gap-3 border-t border-zinc-800/70 px-6 py-4">
          <button
            onClick={() => !busy && onClose()}
            disabled={busy}
            className="flex-1 rounded-md border border-zinc-800/70 px-4 py-2.5 text-xs font-bold text-zinc-300 hover:bg-white/5 disabled:opacity-50"
          >
            {phase.k === "done" ? "إغلاق" : "رجوع"}
          </button>
          {phase.k !== "done" && (
            <button
              onClick={execute}
              disabled={!canExecute}
              className="flex-1 rounded-md bg-blue-600 px-4 py-2.5 text-xs font-bold text-white transition-colors hover:bg-blue-500 disabled:opacity-40"
            >
              {phase.k === "executing" ? "جارٍ التنفيذ…" : "تنفيذ وتسجيل الكل"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
