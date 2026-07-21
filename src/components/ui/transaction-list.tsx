"use client";

import { useState } from "react";
import { Download, Undo2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { toCsv, downloadCsv } from "@/lib/export-csv";
import type { FundTransaction, FundOperation } from "@/types";

// Shared statement renderer — used by the Partner Ledger dialog (GP
// view) and the partner details page (the LP's own statement). One
// source for the type badges/colors so the two never drift.
export const TX_LABELS: Record<
  FundTransaction["type"],
  { ar: string; badge: string; sign: string; tone: string }
> = {
  Deposit: {
    ar: "إيداع",
    badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    sign: "+",
    tone: "text-emerald-300",
  },
  Withdrawal: {
    ar: "سحب",
    badge: "border-rose-500/30 bg-rose-500/10 text-rose-300",
    sign: "−",
    tone: "text-rose-400",
  },
  Capitalize: {
    ar: "تثبيت",
    badge: "border-amber-400/30 bg-amber-400/10 text-amber-300",
    sign: "+",
    tone: "text-amber-300",
  },
  Fee: {
    ar: "رسوم",
    badge: "border-cyan-400/30 bg-cyan-500/10 text-cyan-300",
    sign: "+",
    tone: "text-cyan-300",
  },
};

export function exportStatementCsv(
  transactions: FundTransaction[],
  filename: string
) {
  const csv = toCsv(
    ["التاريخ", "النوع", "المبلغ", "ملاحظة"],
    transactions.map((t) => [
      t.date,
      TX_LABELS[t.type].ar,
      `${TX_LABELS[t.type].sign}${t.amount.toFixed(2)}`,
      t.note ?? "",
    ])
  );
  downloadCsv(filename, csv);
}

export function TransactionList({
  transactions,
  loading,
  exportFilename,
  maxHeightClass = "max-h-[50vh]",
  undoableByOpId,
  onUndo,
}: {
  transactions: FundTransaction[];
  loading: boolean;
  // When provided, renders the CSV export button with this filename.
  exportFilename?: string;
  maxHeightClass?: string;
  // opId → the operation that can be undone right now (GP only). A row
  // whose opId is present here shows an inline "إلغاء" (undo) button.
  undoableByOpId?: Map<string, FundOperation>;
  onUndo?: (op: FundOperation) => Promise<void>;
}) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function handleUndo(op: FundOperation, rowId: string) {
    if (!onUndo) return;
    setErr(null);
    setBusyId(rowId);
    try {
      await onUndo(op);
      setConfirmId(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "فشل التراجع عن العملية");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold">
          {loading ? "جاري التحميل..." : `${transactions.length} حركة مسجلة`}
        </p>
        {exportFilename && (
          <button
            onClick={() => exportStatementCsv(transactions, exportFilename)}
            disabled={transactions.length === 0}
            className="inline-flex items-center gap-1.5 rounded-md border border-zinc-800/70 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-zinc-300 transition-colors hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Download size={11} />
            تصدير CSV
          </button>
        )}
      </div>
      {err && (
        <div className="mb-2 flex items-center gap-2 rounded-md border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-300">
          <span className="flex-1">{err}</span>
        </div>
      )}
      <div className={`space-y-1.5 overflow-y-auto ${maxHeightClass}`}>
        {!loading && transactions.length === 0 && (
          <p className="py-10 text-center text-xs text-zinc-500">
            لا توجد حركات مسجلة بعد
          </p>
        )}
        {transactions.map((t) => {
          const meta = TX_LABELS[t.type];
          const op =
            t.opId && undoableByOpId ? undoableByOpId.get(t.opId) : undefined;
          const canUndo = !!op && !!onUndo;
          const confirming = confirmId === t.id;
          const busy = busyId === t.id;
          return (
            <div
              key={t.id}
              className="flex items-center justify-between rounded-md border border-zinc-800/60 bg-zinc-950/40 px-4 py-2.5"
            >
              <div className="flex items-center gap-3">
                <span
                  className={`inline-flex w-14 justify-center rounded-full border px-2 py-[2px] text-[9px] font-bold uppercase tracking-widest ${meta.badge}`}
                >
                  {meta.ar}
                </span>
                <div>
                  <p className="font-mono text-[10px] tabular-nums text-zinc-400">
                    {t.date}
                  </p>
                  {t.note && (
                    <p className="mt-0.5 text-[10px] text-zinc-500">{t.note}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                {canUndo &&
                  (confirming ? (
                    <span className="flex items-center gap-1">
                      <button
                        onClick={() => handleUndo(op!, t.id)}
                        disabled={busy}
                        className="flex items-center gap-1 rounded-md bg-rose-500/90 px-2 py-1 text-[9px] font-bold uppercase tracking-widest text-white transition-all hover:bg-rose-500 disabled:opacity-60"
                      >
                        {busy ? (
                          <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                        ) : (
                          <Undo2 size={10} />
                        )}
                        تأكيد
                      </button>
                      <button
                        onClick={() => setConfirmId(null)}
                        disabled={busy}
                        className="rounded-md border border-zinc-700/60 px-2 py-1 text-[9px] font-bold uppercase tracking-widest text-zinc-400 transition-colors hover:bg-white/5 disabled:opacity-60"
                      >
                        لا
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => {
                        setErr(null);
                        setConfirmId(t.id);
                      }}
                      className="flex items-center gap-1 rounded-md border border-rose-500/30 bg-rose-500/5 px-2 py-1 text-[9px] font-bold uppercase tracking-widest text-rose-300 transition-all hover:bg-rose-500/15"
                      title="التراجع عن هذه العملية وإرجاع كل شيء كما كان"
                    >
                      <Undo2 size={10} />
                      إلغاء
                    </button>
                  ))}
                <span
                  className={`font-mono text-sm font-bold tabular-nums ${meta.tone}`}
                >
                  {meta.sign}
                  {formatCurrency(t.amount)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
