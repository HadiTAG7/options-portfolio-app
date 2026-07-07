"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, LogOut, TrendingUp, TrendingDown } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { PortalGuard } from "@/components/auth/portal-guard";
import { formatCurrency, formatPercent } from "@/lib/utils";

interface PortalPosition {
  ticker: string;
  type: string;
  share: number;
}

interface PortalReport {
  periodLabel: string;
  periodKey: string;
  partner: { name: string; code: string; ownershipPct: number };
  partnerSummary: {
    investment: number;
    grossProfit: number;
    feeRatePct: number;
    feeAmount: number;
    netProfit: number;
    returnPct: number;
    currentBalance: number;
  };
  positions: PortalPosition[];
}

interface PortalTransaction {
  amount: number;
  type: "Deposit" | "Withdrawal";
  date: string;
}

interface PortalPayload {
  success: boolean;
  error?: string;
  report: PortalReport;
  transactions: PortalTransaction[];
  months: string[];
}

async function authHeader(): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${session?.access_token ?? ""}` };
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  return new Date(Number(y), Number(m) - 1).toLocaleString("ar-SA", {
    month: "long",
    year: "numeric",
  });
}

function PortalContent() {
  const router = useRouter();
  const [month, setMonth] = useState<string | null>(null);
  const [data, setData] = useState<PortalPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const load = useCallback(async (m: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const headers = await authHeader();
      const qs = m ? `?month=${m}` : "";
      const res = await fetch(`/api/portal/me${qs}`, { headers });
      const json = (await res.json()) as PortalPayload;
      if (!res.ok || !json.success) {
        setError(json.error || "تعذّر تحميل بيانات حسابك.");
        setData(null);
        return;
      }
      setData(json);
      setMonth(json.report.periodKey);
    } catch {
      setError("تعذّر الاتصال بالخادم.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(null);
  }, [load]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  async function downloadReport() {
    if (!month) return;
    setDownloading(true);
    try {
      const headers = await authHeader();
      const res = await fetch(`/api/portal/report?month=${month}`, { headers });
      if (!res.ok) {
        setError("تعذّر تنزيل التقرير.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `report-${month}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("تعذّر تنزيل التقرير.");
    } finally {
      setDownloading(false);
    }
  }

  const report = data?.report;
  const summary = report?.partnerSummary;
  const positive = (summary?.netProfit ?? 0) >= 0;

  return (
    <div className="min-h-screen bg-background px-4 pb-16 pt-8">
      <div className="mx-auto max-w-4xl">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="font-headline text-base font-black uppercase tracking-[0.16em] text-emerald-400">
              AlGhanim Options Desk
            </h1>
            <p className="mt-1 text-sm text-zinc-400">
              {report ? `مرحباً ${report.partner.name}` : "بوابة المستثمر"}
            </p>
          </div>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-2 rounded-md border border-[#1f1f1f] px-3 py-2 text-[12px] text-zinc-400 transition-all hover:border-rose-500/40 hover:text-rose-300"
          >
            <LogOut size={14} />
            خروج
          </button>
        </div>

        {/* Month selector */}
        {data && data.months.length > 0 && (
          <div className="mb-6 flex items-center gap-3">
            <span className="text-[12px] text-zinc-500">الشهر:</span>
            <select
              value={month ?? ""}
              onChange={(e) => load(e.target.value)}
              className="rounded-md border border-[#1f1f1f] bg-black/50 px-3 py-1.5 text-sm text-zinc-200 outline-none focus:border-emerald-500/40"
            >
              {data.months.map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                </option>
              ))}
            </select>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-emerald-500/30 border-t-emerald-400" />
          </div>
        )}

        {!loading && error && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-6 text-center text-sm text-rose-300">
            {error}
          </div>
        )}

        {!loading && !error && report && summary && (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <SummaryCard
                label="الرصيد الحالي"
                value={formatCurrency(summary.currentBalance)}
              />
              <SummaryCard
                label="نسبة الملكية"
                value={formatPercent(report.partner.ownershipPct)}
              />
              <SummaryCard
                label={`صافي ربح ${report.periodLabel}`}
                value={formatCurrency(summary.netProfit)}
                tone={positive ? "up" : "down"}
              />
              <SummaryCard
                label="العائد على الاستثمار"
                value={formatPercent(summary.returnPct)}
                tone={summary.returnPct >= 0 ? "up" : "down"}
              />
            </div>

            {/* Investment / fee row */}
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <SummaryCard
                label="رأس المال المستثمر"
                value={formatCurrency(summary.investment)}
                small
              />
              <SummaryCard
                label="إجمالي الربح (قبل الرسوم)"
                value={formatCurrency(summary.grossProfit)}
                small
              />
              <SummaryCard
                label={`رسوم الإدارة (${formatPercent(summary.feeRatePct)})`}
                value={formatCurrency(summary.feeAmount)}
                small
              />
            </div>

            {/* Download report */}
            <div className="mt-6">
              <button
                onClick={downloadReport}
                disabled={downloading}
                className="flex items-center gap-2 rounded-md bg-emerald-500 px-4 py-2.5 text-sm font-bold text-black transition-all hover:bg-emerald-400 disabled:opacity-60"
              >
                <Download size={15} />
                {downloading
                  ? "جارٍ التحضير…"
                  : `تحميل تقرير ${report.periodLabel} (PDF)`}
              </button>
            </div>

            {/* Positions */}
            <section className="mt-8">
              <h2 className="mb-3 font-headline text-[11px] uppercase tracking-[0.16em] text-zinc-500">
                حصتك من المراكز — {report.periodLabel}
              </h2>
              <div className="overflow-x-auto rounded-lg border border-[#1f1f1f]">
                <table className="w-full text-sm">
                  <thead className="bg-black/40 text-[11px] uppercase tracking-wider text-zinc-500">
                    <tr>
                      <th className="px-4 py-2.5 text-right">الرمز</th>
                      <th className="px-4 py-2.5 text-right">النوع</th>
                      <th className="px-4 py-2.5 text-left">حصتك</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.positions.length === 0 && (
                      <tr>
                        <td
                          colSpan={3}
                          className="px-4 py-6 text-center text-zinc-600"
                        >
                          لا توجد مراكز في هذا الشهر
                        </td>
                      </tr>
                    )}
                    {report.positions.map((p, i) => (
                      <tr key={i} className="border-t border-[#161616]">
                        <td className="px-4 py-2.5 font-mono text-zinc-200">
                          {p.ticker}
                        </td>
                        <td className="px-4 py-2.5 text-zinc-400">{p.type}</td>
                        <td
                          className={`px-4 py-2.5 text-left font-mono tabular-nums ${
                            p.share >= 0 ? "text-emerald-400" : "text-rose-400"
                          }`}
                        >
                          {formatCurrency(p.share)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Transactions */}
            <section className="mt-8">
              <h2 className="mb-3 font-headline text-[11px] uppercase tracking-[0.16em] text-zinc-500">
                سجل حركاتك
              </h2>
              <div className="overflow-x-auto rounded-lg border border-[#1f1f1f]">
                <table className="w-full text-sm">
                  <thead className="bg-black/40 text-[11px] uppercase tracking-wider text-zinc-500">
                    <tr>
                      <th className="px-4 py-2.5 text-right">التاريخ</th>
                      <th className="px-4 py-2.5 text-right">النوع</th>
                      <th className="px-4 py-2.5 text-left">المبلغ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.transactions.length ?? 0) === 0 && (
                      <tr>
                        <td
                          colSpan={3}
                          className="px-4 py-6 text-center text-zinc-600"
                        >
                          لا توجد حركات
                        </td>
                      </tr>
                    )}
                    {data?.transactions.map((t, i) => {
                      const isDeposit = t.type === "Deposit";
                      return (
                        <tr key={i} className="border-t border-[#161616]">
                          <td className="px-4 py-2.5 font-mono text-zinc-400">
                            {t.date}
                          </td>
                          <td className="px-4 py-2.5">
                            <span
                              className={`inline-flex items-center gap-1 ${
                                isDeposit ? "text-emerald-400" : "text-amber-400"
                              }`}
                            >
                              {isDeposit ? (
                                <TrendingUp size={13} />
                              ) : (
                                <TrendingDown size={13} />
                              )}
                              {isDeposit ? "إيداع" : "سحب"}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-left font-mono tabular-nums text-zinc-200">
                            {formatCurrency(t.amount)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
  small,
}: {
  label: string;
  value: string;
  tone?: "up" | "down";
  small?: boolean;
}) {
  const valueColor =
    tone === "up"
      ? "text-emerald-400"
      : tone === "down"
        ? "text-rose-400"
        : "text-zinc-100";
  return (
    <div className="rounded-lg border border-[#1f1f1f] bg-black/40 px-4 py-3">
      <p className="text-[11px] text-zinc-500">{label}</p>
      <p
        className={`mt-1 font-mono font-bold tabular-nums ${
          small ? "text-sm" : "text-lg"
        } ${valueColor}`}
      >
        {value}
      </p>
    </div>
  );
}

export default function PortalPage() {
  return (
    <PortalGuard>
      <PortalContent />
    </PortalGuard>
  );
}
