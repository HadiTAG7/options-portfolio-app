"use client";

import { useEffect } from "react";
import { BookOpen, Crown, TrendingDown, TrendingUp, X } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { Partner } from "@/types";
import type { PartnerDistribution } from "@/lib/partner-profit";

interface PartnerLedgerDialogProps {
  open: boolean;
  partner: Partner | null;
  distribution: PartnerDistribution | null;
  totalProfit: number;
  partners: Partner[];
  onClose: () => void;
}

export function PartnerLedgerDialog({
  open,
  partner,
  distribution,
  totalProfit,
  partners,
  onClose,
}: PartnerLedgerDialogProps) {
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
