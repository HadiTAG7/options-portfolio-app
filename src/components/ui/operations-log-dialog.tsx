"use client";

import { useEffect, useMemo, useState } from "react";
import {
  X,
  Undo2,
  Lock,
  CheckCircle2,
  ArrowUpFromLine,
  ArrowDownToLine,
  PiggyBank,
  Coins,
} from "lucide-react";
import { useOperations } from "@/hooks/use-operations";
import type { FundOperation, FundOperationKind } from "@/types";

interface OperationsLogDialogProps {
  open: boolean;
  onClose: () => void;
  onUndo: (op: FundOperation) => Promise<void>;
}

const KIND_META: Record<
  FundOperationKind,
  { icon: typeof Undo2; tone: string }
> = {
  withdrawal: { icon: ArrowUpFromLine, tone: "text-rose-300 border-rose-500/30" },
  deposit: {
    icon: ArrowDownToLine,
    tone: "text-emerald-300 border-emerald-500/30",
  },
  capitalize: { icon: PiggyBank, tone: "text-amber-300 border-amber-400/30" },
  commission_withdraw: {
    icon: Coins,
    tone: "text-rose-300 border-rose-500/30",
  },
  commission_capitalize: {
    icon: PiggyBank,
    tone: "text-amber-300 border-amber-400/30",
  },
};

// DD/MM/YYYY HH:mm — Gregorian, stable regardless of locale calendar.
function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} · ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// The GP's audit log of every money operation, with a per-row undo.
// Undo is offered only on the newest still-applied operation per partner
// (older ones on the same partner are locked until the newer one is
// reversed first) — so a restore never silently clobbers later work.
export function OperationsLogDialog({
  open,
  onClose,
  onUndo,
}: OperationsLogDialogProps) {
  const { operations, loading, refetch } = useOperations();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Reset transient UI state whenever the dialog toggles (render-phase
  // state adjustment — no effect needed).
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setConfirmId(null);
      setErr(null);
    }
  }

  // Refetch on open (deferred a tick to avoid setState-in-effect).
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => void refetch(), 0);
    return () => clearTimeout(t);
  }, [open, refetch]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busyId) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, busyId, onClose]);

  // Undoable = newest non-reversed op per partner group. Iterating
  // newest-first, an op is undoable only if none of its partners were
  // already claimed by a newer still-applied op.
  const undoableIds = useMemo(() => {
    const claimed = new Set<string>();
    const ids = new Set<string>();
    for (const op of operations) {
      if (op.reversedAt) continue;
      const overlaps = op.partnerIds.some((p) => claimed.has(p));
      if (!overlaps) ids.add(op.id);
      op.partnerIds.forEach((p) => claimed.add(p));
    }
    return ids;
  }, [operations]);

  if (!open) return null;

  async function handleUndo(op: FundOperation) {
    setErr(null);
    setBusyId(op.id);
    try {
      await onUndo(op);
      setConfirmId(null);
      await refetch();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "فشل التراجع عن العملية");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-md"
        onClick={() => !busyId && onClose()}
      />

      <div
        role="dialog"
        aria-modal="true"
        className="relative mx-4 flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-zinc-800/70 bg-gradient-to-br from-zinc-900/95 via-zinc-950/95 to-black shadow-[0_0_60px_-12px_rgba(52,211,153,0.25)] backdrop-blur-xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800/70 bg-zinc-950/60 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md border border-emerald-500/30 bg-emerald-500/10">
              <Undo2 size={16} className="text-emerald-300" />
            </div>
            <div>
              <h3 className="font-headline text-sm font-bold text-white">
                سجل العمليات · التراجع
              </h3>
              <p className="text-[10px] uppercase tracking-widest text-zinc-500">
                Operations Log · Undo
              </p>
            </div>
          </div>
          <button
            onClick={() => !busyId && onClose()}
            className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-white/5 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        <p className="border-b border-zinc-800/60 bg-zinc-950/40 px-6 py-2.5 text-[11px] leading-relaxed text-zinc-500">
          إلغاء أي عملية يُرجِع كل شيء تماماً لما كان قبلها — الأرصدة والعمولة
          وسجل الحركات. تُلغى الأحدث أولاً.
        </p>

        {err && (
          <div className="mx-6 mt-3 flex items-center gap-2 rounded-md border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-300">
            <X size={14} />
            <span className="flex-1">{err}</span>
          </div>
        )}

        {/* List */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading && operations.length === 0 ? (
            <div className="flex items-center justify-center py-16">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-700 border-t-emerald-400" />
            </div>
          ) : operations.length === 0 ? (
            <div className="py-16 text-center">
              <Undo2 size={28} className="mx-auto mb-2 text-zinc-700" />
              <p className="text-xs text-zinc-500">
                لا توجد عمليات مسجّلة بعد
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {operations.map((op) => {
                const meta = KIND_META[op.kind] ?? KIND_META.withdrawal;
                const Icon = meta.icon;
                const reversed = !!op.reversedAt;
                const undoable = undoableIds.has(op.id);
                const confirming = confirmId === op.id;
                const busy = busyId === op.id;
                return (
                  <div
                    key={op.id}
                    className={`rounded-lg border bg-zinc-950/40 p-3 ${
                      reversed ? "border-zinc-800/40 opacity-60" : "border-zinc-800/70"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md border bg-zinc-900/60 ${meta.tone}`}
                      >
                        <Icon size={14} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p
                          className={`truncate text-[13px] font-semibold ${
                            reversed
                              ? "text-zinc-500 line-through"
                              : "text-zinc-100"
                          }`}
                        >
                          {op.label}
                        </p>
                        <p className="font-mono text-[10px] tabular-nums text-zinc-500">
                          {fmtDateTime(op.at)}
                        </p>
                      </div>

                      {/* Action / status */}
                      {reversed ? (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-zinc-700/50 bg-zinc-900/50 px-2.5 py-1 text-[9px] font-bold uppercase tracking-widest text-zinc-500">
                          <CheckCircle2 size={11} />
                          ملغاة
                        </span>
                      ) : undoable ? (
                        confirming ? (
                          <div className="flex shrink-0 items-center gap-1.5">
                            <button
                              onClick={() => handleUndo(op)}
                              disabled={busy}
                              className="flex items-center gap-1 rounded-md bg-rose-500/90 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-widest text-white transition-all hover:bg-rose-500 disabled:opacity-60"
                            >
                              {busy ? (
                                <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                              ) : (
                                <Undo2 size={12} />
                              )}
                              تأكيد
                            </button>
                            <button
                              onClick={() => setConfirmId(null)}
                              disabled={busy}
                              className="rounded-md border border-zinc-700/60 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-widest text-zinc-400 transition-colors hover:bg-white/5 disabled:opacity-60"
                            >
                              لا
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmId(op.id)}
                            className="flex shrink-0 items-center gap-1 rounded-md border border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-widest text-rose-200 transition-all hover:bg-rose-500/20"
                          >
                            <Undo2 size={12} />
                            إلغاء
                          </button>
                        )
                      ) : (
                        <span
                          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-zinc-800/60 bg-zinc-900/40 px-2.5 py-1 text-[9px] font-bold uppercase tracking-widest text-zinc-600"
                          title="ألغِ العملية الأحدث على نفس الشريك أولاً"
                        >
                          <Lock size={10} />
                          مقفلة
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="border-t border-zinc-800/70 p-4">
          <button
            onClick={() => !busyId && onClose()}
            className="w-full rounded-md border border-zinc-800/70 px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-zinc-400 transition-colors hover:bg-white/5 hover:text-white"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}
