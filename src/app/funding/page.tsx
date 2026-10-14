"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Landmark, Plus, Trash2 } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { DatePicker } from "@/components/ui/date-picker";
import { RequestTable } from "@/components/funding/request-table";
import { FundingSummary } from "@/components/funding/funding-summary";
import { ExecuteDialog } from "@/components/funding/execute-dialog";
import { RoundHistory } from "@/components/funding/round-history";
import { usePartners } from "@/hooks/use-partners";
import { useTrades } from "@/hooks/use-trades";
import { useAuth } from "@/hooks/use-auth";
import { useCurrencyStore } from "@/hooks/use-currency";
import { fundingApi } from "@/lib/funding-api";
import { planFundingDay, type FundingRequest } from "@/lib/funding-day";
import { roundRates, type FundingRound, type FundingRoundPatch } from "@/lib/funding-round";

interface Local {
  requests: FundingRequest[];
  plannedDate: string;
  rd: string; // SAR per USD for riyal deposits
  rw: string; // SAR per USD for riyal withdrawals
  brokerCash: string;
}

const toLocal = (r: FundingRound): Local => {
  const { rd, rw } = roundRates(r);
  return {
    requests: r.requests,
    plannedDate: r.plannedDate ?? "",
    rd: String(rd),
    rw: String(rw),
    brokerCash: r.brokerCashUsd === null ? "" : String(r.brokerCashUsd),
  };
};

const validRate = (s: string) => {
  const v = Number(s);
  return Number.isFinite(v) && v > 1 && v < 10 ? v : null;
};

// يوم التمويل — collect every partner's deposit/withdrawal request over
// the days before, then execute them all at once so only the NET amount
// crosses to or from the broker. The draft lives on the server (any
// device), autosaves with versioning, and execution is atomic on the
// server after an authoritative preview.
function FundingDay() {
  const { isGP } = useAuth();
  const { partners, loading: partnersLoading, refetch: refetchPartners } = usePartners();
  const { trades, loading: tradesLoading, usingSeedData } = useTrades();
  const defaultRate = useCurrencyStore((s) => s.rate);

  const [round, setRound] = useState<FundingRound | null>(null);
  const [rounds, setRounds] = useState<FundingRound[]>([]);
  const [local, setLocal] = useState<Local | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "pending" | "saving" | "saved" | "error">("idle");
  const [executeOpen, setExecuteOpen] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [now] = useState(() => new Date());

  // Refs mirror what the debounced save needs, written only from handlers.
  const roundRef = useRef<FundingRound | null>(null);
  const localRef = useRef<Local | null>(null);
  const dirtyRef = useRef(false);
  const chainRef = useRef<Promise<unknown>>(Promise.resolve());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const adopt = useCallback((r: FundingRound | null) => {
    roundRef.current = r;
    setRound(r);
    const l = r ? toLocal(r) : null;
    localRef.current = l;
    setLocal(l);
    dirtyRef.current = false;
  }, []);

  const reload = useCallback(async () => {
    const [cur, list] = await Promise.all([fundingApi.current(), fundingApi.list()]);
    if (!cur.ok) {
      setError(cur.error);
    } else {
      adopt(cur.round);
    }
    if (list.ok) setRounds(list.rounds);
    setLoading(false);
  }, [adopt]);

  useEffect(() => {
    if (!isGP) return;
    const t = setTimeout(() => void reload(), 0);
    return () => clearTimeout(t);
  }, [isGP, reload]);

  const doSave = useCallback(async (): Promise<FundingRound | null> => {
    const r = roundRef.current;
    const l = localRef.current;
    if (!r || !l) return null;
    if (!dirtyRef.current) return r;
    dirtyRef.current = false;
    setSaveState("saving");
    const patch: FundingRoundPatch = {
      requests: l.requests,
      plannedDate: l.plannedDate || null,
    };
    const rdV = validRate(l.rd);
    const rwV = validRate(l.rw);
    if (rdV !== null) patch.depositSarPerUsd = rdV;
    if (rwV !== null) patch.withdrawSarPerUsd = rwV;
    if (l.brokerCash.trim() === "") patch.brokerCashUsd = null;
    else if (Number.isFinite(Number(l.brokerCash)) && Number(l.brokerCash) >= 0) {
      patch.brokerCashUsd = Number(l.brokerCash);
    }
    const res = await fundingApi.save(r.id, r.version, patch);
    if (res.ok) {
      roundRef.current = res.round;
      setRound(res.round);
      setSaveState(dirtyRef.current ? "pending" : "saved");
      return res.round;
    }
    if (res.code === "version" && res.round) {
      adopt(res.round);
      setNotice("عُدّلت الجولة من جهاز آخر — تم تحميل آخر نسخة، أعد تعديلك إن لزم.");
      setSaveState("idle");
      return res.round;
    }
    dirtyRef.current = true;
    setSaveState("error");
    setError(res.error);
    return null;
  }, [adopt]);

  const flushSave = useCallback(async (): Promise<FundingRound | null> => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const p = chainRef.current.then(() => doSave());
    chainRef.current = p.catch(() => null);
    return p;
  }, [doSave]);

  function edit(patch: Partial<Local>) {
    if (!localRef.current) return;
    const next = { ...localRef.current, ...patch };
    localRef.current = next;
    setLocal(next);
    dirtyRef.current = true;
    setSaveState("pending");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void flushSave(), 800);
  }

  async function start() {
    setError(null);
    const res = await fundingApi.create(defaultRate);
    if (res.ok) adopt(res.round);
    else setError(res.error);
  }

  async function cancelDraft() {
    if (!round) return;
    const res = await fundingApi.cancel(round.id);
    setConfirmCancel(false);
    if (!res.ok) setError(res.error);
    await reload();
  }

  async function onExecuted() {
    await Promise.all([reload(), refetchPartners()]);
  }

  async function undo(roundId: string): Promise<string | null> {
    const res = await fundingApi.undo(roundId);
    if (!res.ok) return res.error;
    await Promise.all([reload(), refetchPartners()]);
    return null;
  }

  const rd = local ? validRate(local.rd) : null;
  const rw = local ? validRate(local.rw) : null;
  const rateOk = rd !== null && rw !== null;
  const dataReady = !partnersLoading && !tradesLoading && !usingSeedData;
  const estimate = useMemo(() => {
    if (!local || !dataReady || rd === null || rw === null) return null;
    return planFundingDay({
      partners,
      trades,
      requests: local.requests,
      depositSarPerUsd: rd,
      withdrawSarPerUsd: rw,
      now,
      brokerCashUsd: local.brokerCash.trim() === "" ? null : Number(local.brokerCash),
    });
  }, [local, dataReady, rd, rw, partners, trades, now]);

  if (!isGP) {
    return <p className="p-8 text-center text-sm text-zinc-400">هذه الصفحة للمدير فقط.</p>;
  }

  return (
    <>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-emerald-400/80">HADI CAPITAL</p>
          <h1 className="mt-1 font-headline text-3xl font-light tracking-tight text-white">
            Funding Day <span className="font-mono text-zinc-500">·</span>{" "}
            <span className="font-light text-zinc-400">يوم التمويل</span>
          </h1>
          <p className="mt-2 max-w-2xl text-xs leading-relaxed text-zinc-400">
            اجمع طلبات الإيداع والسحب من الشركاء، ويوم التنفيذ يحوَّل للبروكر الصافي فقط — أموال المودعين تغطي
            الساحبين مباشرة، فيقل التحويل وتكاليف الصرف.
          </p>
        </div>
        {round && (
          <span className="text-[11px] text-zinc-500">
            {saveState === "saving" || saveState === "pending"
              ? "جارٍ الحفظ…"
              : saveState === "saved"
                ? "محفوظ ✓ — يظهر من أي جهاز"
                : saveState === "error"
                  ? "لم يُحفظ"
                  : ""}
          </span>
        )}
      </div>

      {error && (
        <p className="mb-4 rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-200">{error}</p>
      )}
      {notice && (
        <p className="mb-4 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">{notice}</p>
      )}
      {usingSeedData && (
        <p className="mb-4 rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-200">
          تعذّر تحميل الصفقات الحقيقية — المعاينة والتنفيذ معطّلان حتى يرجع الاتصال.
        </p>
      )}

      {loading ? (
        <p className="py-16 text-center text-sm text-zinc-500">جارٍ التحميل…</p>
      ) : !round || !local ? (
        <div className="mb-8 rounded-xl border border-dashed border-zinc-700/60 bg-zinc-950/50 p-10 text-center">
          <Landmark size={36} className="mx-auto mb-3 text-zinc-600" />
          <p className="mb-1 text-sm text-zinc-200">لا توجد جولة مفتوحة</p>
          <p className="mb-5 text-xs text-zinc-500">ابدأ جولة، وأضف طلب كل شريك أول ما يوصلك — تنحفظ تلقائياً.</p>
          <button
            onClick={start}
            className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-blue-500"
          >
            <Plus size={14} /> ابدأ جولة جديدة
          </button>
        </div>
      ) : (
        <div className="mb-8 space-y-5">
          <div className="grid gap-4 rounded-xl border border-zinc-800/60 bg-zinc-950/60 p-5 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="mb-1.5 text-[10px] font-bold text-zinc-500">تاريخ التنفيذ المخطط</p>
              <DatePicker value={local.plannedDate} onChange={(v) => edit({ plannedDate: v })} placeholder="اختر اليوم" />
            </div>
            {(
              [
                ["rd", "سعر صرف الإيداع (ر.س لكل $)", "للإيداعات بالريال: تحويل الريال إلى دولار (عادةً الأعلى).", rd],
                ["rw", "سعر صرف السحب (ر.س لكل $)", "للسحوبات بالريال: تحويل الدولار إلى ريال (عادةً الأقل).", rw],
              ] as const
            ).map(([key, label, hint, parsed]) => (
              <div key={key}>
                <p className="mb-1.5 text-[10px] font-bold text-zinc-500">{label}</p>
                <input
                  value={local[key]}
                  onChange={(e) => edit({ [key]: e.target.value })}
                  inputMode="decimal"
                  dir="ltr"
                  className={`w-full rounded-md border bg-zinc-950/80 px-3 py-2.5 text-right font-mono text-sm text-white focus:outline-none ${
                    parsed !== null ? "border-zinc-700/60 focus:border-blue-500" : "border-rose-500/60"
                  }`}
                />
                <p className="mt-1 text-[10px] text-zinc-600">{hint}</p>
              </div>
            ))}
            <div>
              <p className="mb-1.5 text-[10px] font-bold text-zinc-500">النقد المتاح عند البروكر ($ — اختياري)</p>
              <input
                value={local.brokerCash}
                onChange={(e) => edit({ brokerCash: e.target.value })}
                inputMode="decimal"
                dir="ltr"
                placeholder="—"
                className="w-full rounded-md border border-zinc-700/60 bg-zinc-950/80 px-3 py-2.5 text-right font-mono text-sm text-white placeholder:text-zinc-600 focus:border-blue-500 focus:outline-none"
              />
              <p className="mt-1 text-[10px] text-zinc-600">للتنبيه إذا كان السحب الصافي أكبر منه.</p>
            </div>
          </div>

          <RequestTable
            partners={partners}
            requests={local.requests}
            estimate={estimate}
            disabled={false}
            onChange={(next) => edit({ requests: next })}
          />

          {estimate && rd !== null && rw !== null && (
            <FundingSummary plan={estimate} rates={{ rd, rw }} source="estimate" />
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            {confirmCancel ? (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-zinc-400">حذف المسودة وكل طلباتها؟</span>
                <button onClick={cancelDraft} className="rounded-md bg-rose-600 px-3 py-1.5 font-bold text-white hover:bg-rose-500">
                  نعم، احذف
                </button>
                <button onClick={() => setConfirmCancel(false)} className="rounded-md border border-zinc-700 px-3 py-1.5 text-zinc-300">
                  لا
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmCancel(true)}
                className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-rose-300"
              >
                <Trash2 size={12} /> إلغاء المسودة
              </button>
            )}
            <button
              onClick={() => {
                setNotice(null);
                setExecuteOpen(true);
              }}
              disabled={!dataReady || !rateOk || !estimate || estimate.errors.length > 0}
              className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-6 py-3 text-sm font-bold text-white hover:bg-blue-500 disabled:opacity-40"
            >
              <Landmark size={15} /> معاينة نهائية وتنفيذ
            </button>
          </div>
        </div>
      )}

      <RoundHistory rounds={rounds} onUndo={undo} />

      <ExecuteDialog
        open={executeOpen}
        flushSave={flushSave}
        onClose={() => setExecuteOpen(false)}
        onExecuted={() => void onExecuted()}
      />
    </>
  );
}

export default function FundingPage() {
  return (
    <AppShell>
      <FundingDay />
    </AppShell>
  );
}
