"use client";

import { useEffect, useState } from "react";
import {
  BookOpen,
  Crown,
  Download,
  History,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { toCsv, downloadCsv } from "@/lib/export-csv";
import { useTransactions } from "@/hooks/use-transactions";
import type { FundTransaction, Partner } from "@/types";
import type { PartnerDistribution } from "@/lib/partner-profit";

interface PartnerLedgerDialogProps {
  open: boolean;
  partner: Partner | null;
  distribution: PartnerDistribution | null;
  totalProfit: number;
  partners: Partner[];
  onClose: () => void;
}

const TX_LABELS: Record<
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

export function PartnerLedgerDialog({
  open,
  partner,
  distribution,
  totalProfit,
  partners,
  onClose,
}: PartnerLedgerDialogProps) {
  const [tab, setTab] = useState<"distribution" | "history">("distribution");
  // Reset to the first tab on every open — render-phase state
  // adjustment (the React "derive state from props" pattern), which
  // avoids a setState inside the effect below.
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setTab("distribution");
  }
  // Fetch only while the dialog is open for a specific partner.
  const { transactions, loading: txLoading } = useTransactions(
    open ? (partner?.id ?? null) : null
  );

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open || !partner || !distribution) return null;

  const partnerById = new Map(partners.map((p) => [p.id, p]));
  const netPositive = distribution.netProfit >= 0;

  function exportStatement() {
    if (!partner) return;
    const csv = toCsv(
      ["التاريخ", "النوع", "المبلغ", "ملاحظة"],
      transactions.map((t) => [
        t.date,
        TX_LABELS[t.type].ar,
        `${TX_LABELS[t.type].sign}${t.amount.toFixed(2)}`,
        t.note ?? "",
      ])
    );
    downloadCsv(`statement-${partner.code || partner.name}.csv`, csv);
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-md"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-xl mx-4 overflow-hidden rounded-xl border border-zinc-800/70 bg-gradient-to-br from-zinc-900/95 via-zinc-950/95 to-black shadow-[0_0_60px_-12px_rgba(16,185,129,0.3)] backdrop-blur-xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800/70 bg-zinc-950/60 px-6 py-4">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-9 w-9 items-center justify-center rounded-md border ${
                distribution.isManager
                  ? "border-amber-400/40 bg-amber-400/10"
                  : "border-emerald-500/30 bg-emerald-500/10"
              }`}
            >
              {distribution.isManager ? (
                <Crown size={14} className="text-amber-300" />
              ) : (
                <BookOpen size={14} className="text-emerald-400" />
              )}
            </div>
            <div>
              <h3 className="font-headline text-sm font-bold tracking-[0.18em] uppercase text-white">
                Partner Ledger · {partner.name}
              </h3>
              <p className="text-[10px] uppercase tracking-widest text-zinc-500">
                كشف حساب الشريك ·{" "}
                {distribution.isManager
                  ? "المدير العام (GP)"
                  : "شريك محدود (LP)"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-white/5 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-zinc-800/70 bg-zinc-950/40 px-6">
          <button
            onClick={() => setTab("distribution")}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest transition-colors ${
              tab === "distribution"
                ? "border-emerald-400 text-emerald-300"
                : "border-transparent text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <BookOpen size={11} />
            التوزيع الحالي
          </button>
          <button
            onClick={() => setTab("history")}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest transition-colors ${
              tab === "history"
                ? "border-emerald-400 text-emerald-300"
                : "border-transparent text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <History size={11} />
            سجل الحركات
          </button>
        </div>

        {tab === "history" ? (
          <div className="p-6">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold">
                {txLoading
                  ? "جاري التحميل..."
                  : `${transactions.length} حركة مسجلة`}
              </p>
              <button
                onClick={exportStatement}
                disabled={transactions.length === 0}
                className="inline-flex items-center gap-1.5 rounded-md border border-zinc-800/70 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-zinc-300 transition-colors hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Download size={11} />
                تصدير CSV
              </button>
            </div>
            <div className="max-h-[50vh] space-y-1.5 overflow-y-auto">
              {!txLoading && transactions.length === 0 && (
                <p className="py-10 text-center text-xs text-zinc-500">
                  لا توجد حركات مسجلة لهذا الشريك بعد
                </p>
              )}
              {transactions.map((t) => {
                const meta = TX_LABELS[t.type];
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
                          <p className="mt-0.5 text-[10px] text-zinc-500">
                            {t.note}
                          </p>
                        )}
                      </div>
                    </div>
                    <span
                      className={`font-mono text-sm font-bold tabular-nums ${meta.tone}`}
                    >
                      {meta.sign}
                      {formatCurrency(t.amount)}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="pt-4">
              <button
                onClick={onClose}
                className="w-full rounded-md border border-zinc-800/70 px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-zinc-400 transition-colors hover:bg-white/5 hover:text-white"
              >
                إغلاق
              </button>
            </div>
          </div>
        ) : (
        <div className="space-y-4 p-6">
          {/* Step 1 — pool */}
          <LedgerRow
            step="01"
            labelAr="إجمالي ربح المحفظة"
            labelEn="Total Portfolio Profit"
            value={formatCurrency(totalProfit)}
            tone={totalProfit >= 0 ? "emerald" : "rose"}
          />

          {/* Step 2 — ownership */}
          <LedgerRow
            step="02"
            labelAr="نسبة ملكية الشريك"
            labelEn="Partner Ownership"
            value={`${distribution.ownershipPct.toFixed(2)}%`}
            tone="zinc"
          />

          {/* Step 3 — gross share */}
          <LedgerRow
            step="03"
            labelAr="الحصة الإجمالية (قبل الرسوم)"
            labelEn="Gross Share · ownership × totalProfit"
            value={`${distribution.grossProfit >= 0 ? "+" : ""}${formatCurrency(distribution.grossProfit)}`}
            tone={distribution.grossProfit >= 0 ? "emerald" : "rose"}
          />

          {/* Step 4 — fee */}
          {distribution.isManager ? (
            <LedgerRow
              step="04"
              labelAr="الرسوم المحصّلة من الشركاء"
              labelEn="Performance Fees Collected (from LPs)"
              value={`+${formatCurrency(distribution.feeAmount)}`}
              tone="emerald"
              icon={<TrendingUp size={12} />}
            />
          ) : (
            <LedgerRow
              step="04"
              labelAr={`رسوم الأداء (${distribution.feeRatePct.toFixed(0)}%)`}
              labelEn={`Performance Fee · ${distribution.feeRatePct.toFixed(0)}% of gross`}
              value={`-${formatCurrency(distribution.feeAmount)}`}
              tone="rose"
              icon={<TrendingDown size={12} />}
            />
          )}

          {/* GP breakdown */}
          {distribution.isManager &&
            distribution.collectedFromLps.length > 0 && (
              <div className="rounded-md border border-amber-400/20 bg-amber-400/5 p-4">
                <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-amber-300/80">
                  <Crown size={11} />
                  Fee Sources · مصادر الرسوم
                </div>
                <div className="space-y-1.5">
                  {distribution.collectedFromLps.map((row) => {
                    const lp = partnerById.get(row.partnerId);
                    return (
                      <div
                        key={row.partnerId}
                        className="flex items-center justify-between text-xs"
                      >
                        <span className="text-zinc-300">
                          {lp?.name ?? row.partnerId}
                        </span>
                        <span className="font-mono tabular-nums font-bold text-amber-300">
                          +{formatCurrency(row.amount)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

          {/* Final net */}
          <div
            className={`rounded-md border p-4 ${
              netPositive
                ? "border-emerald-500/30 bg-emerald-500/5"
                : "border-rose-500/30 bg-rose-500/5"
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                  صافي الربح · Net Profit
                </p>
                <p className="mt-1 text-[10px] text-zinc-600">
                  {distribution.isManager
                    ? "Gross + Collected Fees"
                    : "Gross − Performance Fee"}
                </p>
              </div>
              <span
                className={`font-headline text-2xl font-bold font-mono tabular-nums ${
                  netPositive ? "text-emerald-300" : "text-rose-400"
                }`}
              >
                {netPositive ? "+" : ""}
                {formatCurrency(distribution.netProfit)}
              </span>
            </div>
            {distribution.investment > 0 && (
              <div className="mt-3 flex items-center justify-between border-t border-white/5 pt-3 text-[10px]">
                <span className="uppercase tracking-widest text-zinc-500 font-semibold">
                  Return on Investment · العائد
                </span>
                <span
                  className={`font-mono tabular-nums font-bold ${
                    netPositive ? "text-emerald-300" : "text-rose-400"
                  }`}
                >
                  {netPositive ? "+" : ""}
                  {distribution.returnPct.toFixed(2)}%
                </span>
              </div>
            )}
          </div>

          <div className="pt-2">
            <button
              onClick={onClose}
              className="w-full rounded-md border border-zinc-800/70 px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-zinc-400 transition-colors hover:bg-white/5 hover:text-white"
            >
              إغلاق
            </button>
          </div>
        </div>
        )}
      </div>
    </div>
  );
}

function LedgerRow({
  step,
  labelAr,
  labelEn,
  value,
  tone,
  icon,
}: {
  step: string;
  labelAr: string;
  labelEn: string;
  value: string;
  tone: "emerald" | "rose" | "zinc";
  icon?: React.ReactNode;
}) {
  const toneClass =
    tone === "emerald"
      ? "text-emerald-300"
      : tone === "rose"
        ? "text-rose-400"
        : "text-white";
  return (
    <div className="flex items-center justify-between rounded-md border border-zinc-800/60 bg-zinc-950/40 px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-800/70 bg-zinc-900/80 font-mono text-[10px] font-bold tabular-nums text-zinc-500">
          {step}
        </span>
        <div>
          <p className="text-xs font-semibold text-zinc-200">{labelAr}</p>
          <p className="text-[10px] uppercase tracking-widest text-zinc-600">
            {labelEn}
          </p>
        </div>
      </div>
      <span
        className={`inline-flex items-center gap-1.5 font-mono font-bold tabular-nums ${toneClass}`}
      >
        {icon}
        {value}
      </span>
    </div>
  );
}
