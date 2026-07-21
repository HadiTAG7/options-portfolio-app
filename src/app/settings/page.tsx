"use client";

import React, { useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  Crown,
  Database,
  Download,
  Gauge,
  Mail,
  RefreshCw,
  Send,
  Server,
  Shield,
  Sliders,
  Trash2,
  Wifi,
  WifiOff,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { useSettings } from "@/hooks/use-settings";
import type { FundSettings } from "@/hooks/use-settings";
import { usePartners } from "@/hooks/use-partners";
import { useTrades } from "@/hooks/use-trades";
import { supabase } from "@/lib/supabase";
import { getPartnerInvestment } from "@/lib/utils";
import {
  computePartnerDistributionFromTrades,
  tradeMonthKey,
  tradeProfit,
  tradeProfitDate,
  asEarnedBasis,
  cumulativeNetForPartner,
} from "@/lib/partner-profit";
import type { MonthlyReportData, PartnerPosition } from "@/lib/report-pdf";
import { appFontFaceCss, buildReportsDocument } from "@/lib/report-html";
import { Wrench } from "lucide-react";
import { DatePicker } from "@/components/ui/date-picker";

const REFRESH_OPTIONS: { value: FundSettings["priceRefreshInterval"]; label: string }[] = [
  { value: "manual", label: "Manual Only" },
  { value: "1m", label: "Every 1 min" },
  { value: "5m", label: "Every 5 min" },
  { value: "15m", label: "Every 15 min" },
];

export default function SettingsPage() {
  const { settings, update, hydrated } = useSettings();
  const [saved, setSaved] = useState(false);
  const [finnhubPresent, setFinnhubPresent] = useState<boolean | null>(null);

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_FINNHUB_API_KEY;
    setFinnhubPresent(!!key && key.length > 0);
  }, []);

  function handleFeeChange(value: number) {
    const clamped = Math.min(100, Math.max(0, value));
    update({ managementFeePct: clamped });
    flashSaved();
  }

  function handleMultiplierToggle() {
    update({ autoMultiplyOptions: !settings.autoMultiplyOptions });
    flashSaved();
  }

  function handleRefreshChange(v: FundSettings["priceRefreshInterval"]) {
    update({ priceRefreshInterval: v });
    flashSaved();
  }

  function flashSaved() {
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  if (!hydrated) return null;

  return (
    <AppShell>
      {/* Page Header */}
      <div className="mb-8">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.28em] text-emerald-400/80 font-bold">
              Sovereign Terminal
            </p>
            <h1 className="mt-1 font-headline text-3xl font-light tracking-tight text-white">
              Fund Control Room{" "}
              <span className="font-mono text-zinc-500">·</span>{" "}
              <span className="text-zinc-400 font-light">الإعدادات</span>
            </h1>
          </div>
          {saved && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-emerald-300 animate-in fade-in duration-200">
              <Check size={12} />
              Saved
            </span>
          )}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.9)]" />
          <p className="text-xs text-zinc-500">
            GP-only configuration · إعدادات المدير العام
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* ═══════ Fund Parameters ═══════ */}
        <SettingsCard
          icon={<Sliders size={14} className="text-emerald-400" />}
          title="Fund Parameters"
          subtitle="إعدادات الصندوق"
        >
          {/* Management Fee */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[12px] font-semibold text-zinc-200">
                  GP Performance Fee
                </p>
                <p className="text-[10px] text-zinc-500 uppercase tracking-widest">
                  رسوم الأداء · Applied to LP profits
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Crown size={12} className="text-amber-300" />
                <span className="font-mono text-lg font-bold tabular-nums text-emerald-300">
                  {settings.managementFeePct}%
                </span>
              </div>
            </div>
            <input
              type="range"
              min={0}
              max={50}
              step={1}
              value={settings.managementFeePct}
              onChange={(e) => handleFeeChange(Number(e.target.value))}
              className="w-full h-1.5 appearance-none rounded-full bg-zinc-800 cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-emerald-400 [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(16,185,129,0.7)] [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-emerald-600 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-emerald-400 [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-emerald-600"
            />
            <div className="flex justify-between text-[9px] uppercase tracking-widest text-zinc-600">
              <span>0%</span>
              <span>25%</span>
              <span>50%</span>
            </div>
          </div>

          <Divider />

          {/* Options Multiplier */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[12px] font-semibold text-zinc-200">
                Auto-Multiply Options ×100
              </p>
              <p className="text-[10px] text-zinc-500 uppercase tracking-widest">
                مُضاعف الخيارات · Industry standard contract size
              </p>
            </div>
            <ToggleSwitch
              enabled={settings.autoMultiplyOptions}
              onToggle={handleMultiplierToggle}
            />
          </div>
        </SettingsCard>

        {/* ═══════ Data & Connections ═══════ */}
        <SettingsCard
          icon={<Server size={14} className="text-cyan-300" />}
          title="Data & Connections"
          subtitle="البيانات والاتصال"
        >
          {/* Refresh Rate */}
          <div className="space-y-3">
            <div>
              <p className="text-[12px] font-semibold text-zinc-200">
                Live Prices Refresh Rate
              </p>
              <p className="text-[10px] text-zinc-500 uppercase tracking-widest">
                معدّل التحديث · Active stock quotes
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {REFRESH_OPTIONS.map((opt) => {
                const active = settings.priceRefreshInterval === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => handleRefreshChange(opt.value)}
                    className={`flex items-center justify-center gap-2 rounded-md border px-3 py-2.5 text-[10px] font-bold uppercase tracking-[0.16em] transition-all duration-200 ${
                      active
                        ? "border-cyan-400/40 bg-cyan-500/10 text-cyan-300 shadow-[0_0_18px_-6px_rgba(34,211,238,0.5)]"
                        : "border-zinc-800/60 bg-zinc-950/60 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
                    }`}
                  >
                    {opt.value === "manual" ? (
                      <Gauge size={12} />
                    ) : (
                      <RefreshCw size={12} />
                    )}
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <Divider />

          {/* Finnhub Status */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {finnhubPresent ? (
                <div className="flex h-8 w-8 items-center justify-center rounded-md border border-emerald-500/30 bg-emerald-500/10">
                  <Wifi size={14} className="text-emerald-400" />
                </div>
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-md border border-rose-500/30 bg-rose-500/10">
                  <WifiOff size={14} className="text-rose-400" />
                </div>
              )}
              <div>
                <p className="text-[12px] font-semibold text-zinc-200">
                  Finnhub API
                </p>
                <p className="text-[10px] text-zinc-500 uppercase tracking-widest">
                  مزوّد البيانات · Market data provider
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`inline-block h-2 w-2 rounded-full shadow-[0_0_6px] ${
                  finnhubPresent
                    ? "bg-emerald-400 shadow-emerald-400/80"
                    : "bg-rose-400 shadow-rose-400/80"
                }`}
              />
              <span
                className={`text-[10px] font-bold uppercase tracking-widest ${
                  finnhubPresent ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                {finnhubPresent ? "Connected" : "Missing Key"}
              </span>
            </div>
          </div>

          <Divider />

          {/* Supabase Status */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-md border border-emerald-500/30 bg-emerald-500/10">
                <Database size={14} className="text-emerald-400" />
              </div>
              <div>
                <p className="text-[12px] font-semibold text-zinc-200">
                  Supabase
                </p>
                <p className="text-[10px] text-zinc-500 uppercase tracking-widest">
                  قاعدة البيانات · Backend storage
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_6px] shadow-emerald-400/80" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">
                Connected
              </span>
            </div>
          </div>
        </SettingsCard>

        {/* ═══════ Monthly Reports ═══════
            Hidden in the Capacitor build (MOBILE_BUILD=1 sets
            NEXT_PUBLIC_PLATFORM=mobile) — the underlying
            /api/reports/send-monthly route uses nodemailer + Gmail
            secrets and isn't shipped with the static export. */}
        {process.env.NEXT_PUBLIC_PLATFORM !== "mobile" && (
          <SettingsCard
            icon={<Mail size={14} className="text-cyan-300" />}
            title="Monthly Reports"
            subtitle="التقارير الشهرية"
          >
            <MonthlyReportSender />
          </SettingsCard>
        )}

        {/* ═══════ Partner Accounts ═══════
            One-click auth-account creation + linking for each partner.
            Talks to /api/admin/partner-accounts, which only exists on
            the web deployment — the APK build shows a pointer note
            instead (same pattern as Monthly Reports above). */}
        <SettingsCard
          icon={<Shield size={14} className="text-emerald-300" />}
          title="Partner Accounts"
          subtitle="حسابات الشركاء"
        >
          <PartnerAccountsPanel />
        </SettingsCard>

        {/* ═══════ Maintenance ═══════ */}
        <SettingsCard
          icon={<Wrench size={14} className="text-amber-300" />}
          title="Maintenance"
          subtitle="الصيانة"
        >
          <DepositSettlementFix />
        </SettingsCard>

        {/* ═══════ Danger Zone ═══════ */}
        <div className="lg:col-span-2">
          <DangerZone />
        </div>
      </div>
    </AppShell>
  );
}

function SettingsCard({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-zinc-800/60 bg-gradient-to-br from-zinc-900/60 via-zinc-950/80 to-black backdrop-blur-sm shadow-[0_0_40px_-12px_rgba(16,185,129,0.08)]">
      <div className="flex items-center gap-3 border-b border-zinc-800/60 bg-zinc-950/60 px-6 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-md border border-zinc-700/40 bg-zinc-900/60">
          {icon}
        </div>
        <div>
          <h2 className="font-headline text-sm font-bold text-white tracking-[0.18em] uppercase">
            {title}
          </h2>
          <p className="text-[10px] uppercase tracking-widest text-zinc-500">
            {subtitle}
          </p>
        </div>
      </div>
      <div className="space-y-5 p-6">{children}</div>
    </div>
  );
}

function MonthlyReportSender() {
  const { partners } = usePartners();
  const { trades } = useTrades();
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [selectedPartnerId, setSelectedPartnerId] = useState<string>("");
  const [downloadMsg, setDownloadMsg] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{
    sentCount: number;
    skippedCount: number;
    errorCount: number;
    results: Array<{ name: string; status: string; reason?: string }>;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const months = React.useMemo(() => {
    const list: { value: string; label: string }[] = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleString("ar-SA", { month: "long", year: "numeric" });
      list.push({ value, label });
    }
    return list;
  }, []);

  async function handleSend() {
    setSending(true);
    setResult(null);
    setError(null);

    try {
      const res = await fetch("/api/reports/send-monthly", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          month: selectedMonth,
          partnerId: selectedPartnerId || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || "فشل في إرسال التقارير");
        return;
      }

      setResult(data);
    } catch {
      setError(
        "تعذر الوصول لخدمة الإرسال على الخادم — استضافتك قد لا تشغّل مسارات API. استخدم زر «تنزيل التقارير PDF» بالأسفل ثم أرسلها بنفسك."
      );
    } finally {
      setSending(false);
    }
  }

  // Client-side generation — the same PDF the email route builds, but
  // rendered in the browser and downloaded directly. Needs NO server,
  // no env vars, and works on static hosting and inside the APK.
  function handleDownload() {
    setError(null);
    setResult(null);
    setDownloadMsg(null);

    try {
      const month = selectedMonth;
      const tradesInMonth = trades.filter((t) => tradeMonthKey(t) === month);
      // Historical statement: settlement stamps nulled (a later تثبيت
      // must not zero the month), entry-date eligibility active — the
      // exact convention of the email route and the dashboard ledger.
      const statementPartners = partners.map(asEarnedBasis);
      const distribution = computePartnerDistributionFromTrades(
        statementPartners,
        tradesInMonth
      );
      const totalInvestment = partners.reduce(
        (sum, p) => sum + getPartnerInvestment(p),
        0
      );
      const targets = selectedPartnerId
        ? partners.filter((p) => p.id === selectedPartnerId)
        : partners;
      const [y, m] = month.split("-");
      const periodLabel = new Date(
        Number(y),
        Number(m) - 1
      ).toLocaleString("en-US", { month: "long", year: "numeric" });

      const reports: MonthlyReportData[] = [];
      for (const partner of targets) {
        const dist = distribution[partner.id];
        if (!dist) continue;
        const ownershipShare =
          totalInvestment > 0
            ? getPartnerInvestment(partner) / totalInvestment
            : 0;
        const entry = partner.entryDate?.trim();
        const positions: PartnerPosition[] = tradesInMonth
          .filter((t) => {
            const profitDate = tradeProfitDate(t);
            if (!profitDate) return false;
            return !entry || entry <= profitDate;
          })
          .map((t) => ({
            ticker: t.ticker,
            type: t.type,
            share: tradeProfit(t) * ownershipShare,
          }));

        reports.push({
          periodLabel,
          periodKey: month,
          partner: {
            name: partner.name,
            code: partner.code,
            ownershipPct: dist.ownershipPct,
          },
          partnerSummary: {
            investment: getPartnerInvestment(partner),
            grossProfit: dist.grossProfit,
            feeRatePct: dist.feeRatePct,
            feeAmount: dist.feeAmount,
            netProfit: dist.netProfit,
            returnPct: dist.returnPct,
            currentBalance: partner.currentBalance,
            cumulativeNetProfit: cumulativeNetForPartner(
              partners,
              trades,
              partner.id,
              month
            ),
          },
          positions,
        });
      }

      if (reports.length === 0) {
        setDownloadMsg("لا توجد بيانات لهذا الشهر");
        return;
      }

      // Print view: one document, a page per partner, the browser's
      // own Arabic shaping + the app fonts. من نافذة الطباعة اختر
      // "حفظ كـ PDF".
      const html = buildReportsDocument(reports, appFontFaceCss());
      const win = window.open("", "_blank");
      if (!win) {
        setError("منع المتصفح فتح نافذة التقارير — اسمح بالنوافذ المنبثقة وحاول مجدداً");
        return;
      }
      win.document.write(html);
      win.document.close();
      win.focus();
      // Give the fonts a beat to load before the print dialog.
      setTimeout(() => win.print(), 700);

      setDownloadMsg(
        `تم تجهيز ${reports.length} تقرير — من نافذة الطباعة اختر «حفظ كـ PDF»`
      );
    } catch (e) {
      console.error("[reports] client-side generation failed:", e);
      setError("فشل توليد التقارير في المتصفح");
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[12px] font-semibold text-zinc-200">
          إرسال التقارير الشهرية
        </p>
        <p className="text-[10px] text-zinc-500 uppercase tracking-widest">
          Send PDF reports via email · لكل مستثمر
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <select
          value={selectedPartnerId}
          onChange={(e) => {
            setSelectedPartnerId(e.target.value);
            setResult(null);
            setError(null);
          }}
          disabled={sending}
          className="w-full rounded-md border border-zinc-800/70 bg-black/60 px-4 py-2.5 text-sm text-white outline-none transition-all focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 disabled:opacity-50"
        >
          <option value="">كل الشركاء — All partners</option>
          {partners
            .filter((p) => p.email)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.code ? ` (${p.code})` : ""}
              </option>
            ))}
        </select>

        <div className="flex items-center gap-3">
          <select
            value={selectedMonth}
            onChange={(e) => {
              setSelectedMonth(e.target.value);
              setResult(null);
              setError(null);
            }}
            disabled={sending}
            className="flex-1 rounded-md border border-zinc-800/70 bg-black/60 px-4 py-2.5 text-sm text-white outline-none transition-all focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 disabled:opacity-50"
          >
            {months.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>

          <button
            onClick={handleSend}
            disabled={sending}
            className="inline-flex items-center gap-2 rounded-md bg-cyan-600 px-5 py-2.5 text-[10px] font-bold uppercase tracking-[0.18em] text-white shadow-[0_0_20px_-6px_rgba(34,211,238,0.5)] transition-all duration-200 hover:bg-cyan-500 hover:shadow-[0_0_28px_-4px_rgba(34,211,238,0.7)] active:scale-[0.98] disabled:opacity-70"
          >
            {sending ? (
              <>
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                جاري الإرسال...
              </>
            ) : (
              <>
                <Send size={12} />
                إرسال
              </>
            )}
          </button>
        </div>

        {/* Server-free path: generate the same PDFs in the browser. */}
        <button
          onClick={handleDownload}
          className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-5 py-2.5 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300 transition-all duration-200 hover:border-emerald-500/50 hover:bg-emerald-500/10 hover:text-emerald-200 active:scale-[0.99]"
          title="توليد التقارير في المتصفح وتنزيلها مباشرة — لا يحتاج خادماً"
        >
          <Download size={12} />
          معاينة وحفظ التقارير PDF
        </button>

        {/* On-demand email blast via the GitHub workflow — works no
            matter what the web hosting supports. Opens the Run
            workflow page; one green click there emails everyone. */}
        <a
          href="https://github.com/HadiTAG7/options-portfolio-app/actions/workflows/send-monthly-reports.yml"
          target="_blank"
          rel="noreferrer"
          className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-cyan-400/30 bg-cyan-500/5 px-5 py-2.5 text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-300 transition-all duration-200 hover:border-cyan-400/50 hover:bg-cyan-500/10 hover:text-cyan-200 active:scale-[0.99]"
          title="يفتح صفحة التشغيل في GitHub — اضغط Run workflow وترسل التقارير للجميع"
        >
          <Mail size={12} />
          إرسال بالإيميل للجميع (عبر GitHub)
        </a>
      </div>

      {downloadMsg && (
        <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300">
          {downloadMsg}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-2 rounded-md border border-zinc-800/60 bg-zinc-950/60 p-4">
          <div className="flex items-center gap-4 text-[11px]">
            {result.sentCount > 0 && (
              <span className="text-emerald-400 font-bold">
                ✓ {result.sentCount} تم الإرسال
              </span>
            )}
            {result.skippedCount > 0 && (
              <span className="text-amber-300 font-bold">
                ⏭ {result.skippedCount} تم تخطيه
              </span>
            )}
            {result.errorCount > 0 && (
              <span className="text-rose-400 font-bold">
                ✗ {result.errorCount} فشل
              </span>
            )}
          </div>
          <div className="space-y-1">
            {result.results.map((r, i) => (
              <div
                key={i}
                className="flex items-center justify-between text-[10px] py-1"
              >
                <span className="text-zinc-300">{r.name}</span>
                <span
                  className={
                    r.status === "sent"
                      ? "text-emerald-400"
                      : r.status === "skipped"
                      ? "text-amber-300"
                      : "text-rose-400"
                  }
                >
                  {r.status === "sent"
                    ? "تم الإرسال"
                    : r.status === "skipped"
                    ? r.reason === "no email"
                      ? "بدون إيميل"
                      : "تخطي"
                    : r.reason || "خطأ"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Set a prior-distribution cutoff for partners whose settlement date
// was cleared (e.g. by the earlier auto-fix tool) so they stop
// double-counting profits earned BEFORE the last actual distribution.
// Touches only partners whose last_settlement_date is currently NULL —
// partners with a valid settlement date are left untouched.
function DepositSettlementFix() {
  const { partners, refetch } = usePartners();
  const [running, setRunning] = useState(false);
  const [date, setDate] = useState("");
  const [result, setResult] = useState<{
    count: number;
    date: string;
    names: string[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const needsDate = partners.filter((p) => !p.lastSettlementDate);

  async function handleApply() {
    if (!date) {
      setError("يرجى اختيار التاريخ أولاً");
      return;
    }
    if (needsDate.length === 0) {
      setError("ما في شركاء يحتاجون تاريخ تسوية");
      return;
    }

    setRunning(true);
    setError(null);
    setResult(null);

    try {
      // End-of-day so any trade profit dated <= picked date is settled.
      const settlementIso = `${date}T23:59:59.999Z`;
      const ids = needsDate.map((p) => p.id);

      const { error: updateError } = await supabase
        .from("partners")
        .update({ last_settlement_date: settlementIso })
        .in("id", ids);

      if (updateError) {
        setError(updateError.message);
        return;
      }

      setResult({
        count: ids.length,
        date,
        names: needsDate.map((p) => p.name),
      });
      await refetch();
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "message" in err
          ? (err as { message: string }).message
          : "خطأ غير متوقع";
      setError(msg);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[12px] font-semibold text-zinc-200">
          تعيين تاريخ التوزيع السابق
        </p>
        <p className="text-[10px] text-zinc-500 uppercase tracking-widest">
          Set previous distribution cutoff
        </p>
      </div>

      <p className="text-[11px] leading-relaxed text-zinc-400">
        اختر تاريخ آخر توزيع فعلي للأرباح. كل ربح صفقة تاريخه قبل أو يساوي هذا
        التاريخ يُعتبر موزّعاً، فلا يُحتسب مرة ثانية. الأداة تحط هذا التاريخ
        فقط للشركاء الذين <strong>ليس عندهم تاريخ تسوية حالياً</strong>؛ من
        عندهم تاريخ موجود لا يتم تعديله.
      </p>

      {needsDate.length > 0 ? (
        <p className="text-[11px] text-amber-300">
          {needsDate.length} شريك بدون تاريخ تسوية: {needsDate.map((p) => p.name).join("، ")}
        </p>
      ) : (
        <p className="text-[11px] text-emerald-300">
          كل الشركاء عندهم تاريخ تسوية. لا حاجة لتطبيق شيء.
        </p>
      )}

      <div className="flex items-end gap-3">
        <div className="flex-1">
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-zinc-400">
            تاريخ التوزيع السابق
          </label>
          <DatePicker
            value={date}
            onChange={setDate}
            disabled={running}
            placeholder="اختر تاريخ التوزيع"
          />
        </div>

        <button
          onClick={handleApply}
          disabled={running || needsDate.length === 0 || !date}
          className="inline-flex items-center gap-2 rounded-md bg-amber-600 px-5 py-2.5 text-[10px] font-bold uppercase tracking-[0.18em] text-white shadow-[0_0_20px_-6px_rgba(245,158,11,0.5)] transition-all duration-200 hover:bg-amber-500 hover:shadow-[0_0_28px_-4px_rgba(245,158,11,0.7)] active:scale-[0.98] disabled:opacity-70"
        >
          {running ? (
            <>
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              جاري التطبيق...
            </>
          ) : (
            <>
              <Wrench size={12} />
              تطبيق
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-2 rounded-md border border-zinc-800/60 bg-zinc-950/60 p-4 text-[11px]">
          <p className="text-emerald-400 font-bold">
            ✓ تم تعيين {result.date} كتاريخ توزيع لـ {result.count} شريك
          </p>
          <ul className="space-y-1 text-zinc-300">
            {result.names.map((name) => (
              <li key={name}>• {name}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function DangerZone() {
  const [resetConfirm, setResetConfirm] = useState(false);

  return (
    <div className="relative overflow-hidden rounded-xl border border-rose-500/25 bg-gradient-to-br from-zinc-900/60 via-zinc-950/80 to-black backdrop-blur-sm">
      <div className="pointer-events-none absolute -top-16 -right-16 h-40 w-40 rounded-full bg-rose-500/[0.05] blur-3xl" />
      <div className="flex items-center gap-3 border-b border-rose-500/20 bg-rose-500/[0.03] px-6 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-md border border-rose-500/30 bg-rose-500/10">
          <Shield size={14} className="text-rose-400" />
        </div>
        <div>
          <h2 className="font-headline text-sm font-bold text-rose-300 tracking-[0.18em] uppercase">
            Danger Zone
          </h2>
          <p className="text-[10px] uppercase tracking-widest text-rose-400/60">
            منطقة الخطر · Irreversible actions
          </p>
        </div>
      </div>
      <div className="p-6 space-y-4">
        <div className="flex items-center gap-3 rounded-md border border-zinc-800/60 bg-zinc-950/40 p-4">
          <div className="flex-1">
            <p className="text-[12px] font-semibold text-zinc-200">
              Export Full Database
            </p>
            <p className="text-[10px] text-zinc-500 uppercase tracking-widest">
              تصدير قاعدة البيانات · Download all data as CSV
            </p>
          </div>
          <button className="inline-flex items-center gap-2 rounded-md border border-zinc-700/60 bg-zinc-900/60 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-300 transition-all duration-200 hover:border-zinc-600 hover:bg-zinc-900 hover:text-white active:scale-95">
            <Download size={12} />
            Export CSV
          </button>
        </div>

        <div className="flex items-center gap-3 rounded-md border border-rose-500/20 bg-rose-500/[0.03] p-4">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <AlertTriangle size={12} className="text-rose-400" />
              <p className="text-[12px] font-semibold text-rose-300">
                Reset All Demo Data
              </p>
            </div>
            <p className="mt-0.5 text-[10px] text-rose-400/60 uppercase tracking-widest">
              إعادة تعيين البيانات التجريبية · This cannot be undone
            </p>
          </div>
          {!resetConfirm ? (
            <button
              onClick={() => setResetConfirm(true)}
              className="inline-flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-rose-300 transition-all duration-200 hover:border-rose-500/50 hover:bg-rose-500/20 hover:text-rose-200 hover:shadow-[0_0_18px_-4px_rgba(239,68,68,0.5)] active:scale-95"
            >
              <Trash2 size={12} />
              Reset
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setResetConfirm(false)}
                className="rounded-md border border-zinc-700/60 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-400 transition hover:text-zinc-200"
              >
                Cancel
              </button>
              <button className="inline-flex items-center gap-2 rounded-md border border-rose-500/50 bg-rose-500/20 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-rose-200 shadow-[0_0_18px_-4px_rgba(239,68,68,0.5)] transition-all duration-200 hover:bg-rose-500/30 active:scale-95">
                <AlertTriangle size={12} />
                Confirm Reset
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ToggleSwitch({
  enabled,
  onToggle,
}: {
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      role="switch"
      aria-checked={enabled}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border transition-all duration-200 ${
        enabled
          ? "border-emerald-500/40 bg-emerald-500/20 shadow-[0_0_12px_-2px_rgba(16,185,129,0.5)]"
          : "border-zinc-700/60 bg-zinc-900/60"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full transition-all duration-200 ${
          enabled
            ? "translate-x-[22px] bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.9)]"
            : "translate-x-[3px] bg-zinc-500"
        }`}
      />
    </button>
  );
}

function Divider() {
  return <div className="border-t border-zinc-800/40" />;
}

// ── Partner Accounts panel ─────────────────────────────────────────
// Lists every active partner with their auth-link status and offers
// one-click create/link (or password reset) through the GP-only
// /api/admin/partner-accounts route. Rollout order (shown in the
// panel): create accounts here (the GP's own first — bootstrap mode
// allows it before any account exists), run migration 014 (links
// accounts + enables role-aware RLS), then redeploy — enforcement is
// on by default.

interface AccountRow {
  id: string;
  name: string;
  email: string | null;
  isAdmin: boolean;
  authUserId: string | null;
}

function generatePassword(): string {
  // 14 chars from a no-lookalike alphabet — shown once, GP copies it.
  const alphabet =
    "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789!@#$%";
  const bytes = new Uint32Array(14);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

function PartnerAccountsPanel() {
  const isMobileBuild = process.env.NEXT_PUBLIC_PLATFORM === "mobile";
  const [rows, setRows] = useState<AccountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Per-partner form state
  const [emails, setEmails] = useState<Record<string, string>>({});
  const [passwords, setPasswords] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowMsg, setRowMsg] = useState<
    Record<string, { ok: boolean; text: string }>
  >({});

  async function loadRows() {
    setLoading(true);
    setLoadError(null);
    const { data, error } = await supabase
      .from("partners")
      .select("id, name, email, isAdmin, auth_user_id")
      .is("archived_at", null)
      .order("isAdmin", { ascending: false });
    if (error) {
      setLoadError(error.message);
      setRows([]);
    } else {
      const mapped: AccountRow[] = (data ?? []).map((r) => ({
        id: r.id,
        name: r.name,
        email: r.email ?? null,
        isAdmin: r.isAdmin ?? false,
        authUserId:
          (r as { auth_user_id?: string | null }).auth_user_id ?? null,
      }));
      setRows(mapped);
      setEmails((prev) => {
        const next = { ...prev };
        for (const p of mapped) {
          if (next[p.id] === undefined) next[p.id] = p.email ?? "";
        }
        return next;
      });
    }
    setLoading(false);
  }

  useEffect(() => {
    // Deferred a tick — loadRows flips loading synchronously, which
    // react-hooks/set-state-in-effect forbids directly in the body.
    const t = setTimeout(() => void loadRows(), 0);
    return () => clearTimeout(t);
  }, []);

  async function callApi(partner: AccountRow, action: "create" | "reset-password") {
    setBusyId(partner.id);
    setRowMsg((m) => ({ ...m, [partner.id]: { ok: true, text: "" } }));
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const res = await fetch("/api/admin/partner-accounts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          action,
          partnerId: partner.id,
          email: emails[partner.id]?.trim(),
          password: passwords[partner.id]?.trim(),
        }),
      });
      const json = (await res.json()) as { success: boolean; error?: string };
      if (!json.success) {
        setRowMsg((m) => ({
          ...m,
          [partner.id]: { ok: false, text: json.error ?? "فشل الطلب" },
        }));
      } else {
        setRowMsg((m) => ({
          ...m,
          [partner.id]: {
            ok: true,
            text:
              action === "create"
                ? "تم إنشاء الحساب وربطه ✓ — احفظ كلمة المرور الآن"
                : "تم تحديث كلمة المرور ✓",
          },
        }));
        await loadRows();
      }
    } catch {
      setRowMsg((m) => ({
        ...m,
        [partner.id]: {
          ok: false,
          text: "تعذر الاتصال بالخادم — هذه الميزة تعمل من نسخة الويب فقط",
        },
      }));
    } finally {
      setBusyId(null);
    }
  }

  if (isMobileBuild) {
    return (
      <p className="text-xs leading-relaxed text-zinc-500">
        إدارة حسابات الشركاء متاحة من <span className="text-zinc-300">نسخة الويب</span> فقط
        (تتطلب خادماً بمفتاح service role).
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-zinc-800/60 bg-zinc-950/40 p-3 text-[11px] leading-relaxed text-zinc-400">
        ترتيب التفعيل: <span className="text-zinc-200">١)</span> أنشئ الحسابات من هنا —
        <span className="text-emerald-300"> حسابك (المدير) أولاً</span>،{" "}
        <span className="text-zinc-200">٢)</span> شغّل{" "}
        <span className="font-mono text-[10px]">migration 014</span> في Supabase (يربط
        الحسابات ويفعّل الصلاحيات)،{" "}
        <span className="text-zinc-200">٣)</span> أعد النشر — التحقق مُفعّل تلقائياً
        (لإيقافه مؤقتاً:{" "}
        <span className="font-mono text-[10px]">NEXT_PUBLIC_AUTH_ENFORCED=0</span>).
      </div>

      {loadError && (
        <p className="rounded-md border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
          {loadError}
        </p>
      )}
      {loading && (
        <p className="text-xs text-zinc-500">جاري تحميل الشركاء...</p>
      )}

      <div className="space-y-3">
        {rows.map((p) => {
          const linked = !!p.authUserId;
          const msg = rowMsg[p.id];
          const busy = busyId === p.id;
          return (
            <div
              key={p.id}
              className="rounded-lg border border-zinc-800/60 bg-zinc-950/40 p-3"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-white">
                    {p.name}
                  </span>
                  {p.isAdmin && (
                    <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-1.5 py-[1px] text-[9px] font-bold uppercase tracking-widest text-amber-300">
                      GP
                    </span>
                  )}
                </div>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-[2px] text-[9px] font-bold uppercase tracking-widest ${
                    linked
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                      : "border-zinc-700/60 bg-zinc-900/60 text-zinc-500"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      linked ? "bg-emerald-400" : "bg-zinc-600"
                    }`}
                  />
                  {linked ? "مرتبط" : "غير مرتبط"}
                </span>
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <input
                  type="email"
                  dir="ltr"
                  placeholder="email@example.com"
                  value={emails[p.id] ?? ""}
                  onChange={(e) =>
                    setEmails((m) => ({ ...m, [p.id]: e.target.value }))
                  }
                  disabled={busy || (linked && false)}
                  className="w-full rounded-md border border-zinc-700/60 bg-zinc-950/80 px-3 py-2 text-left font-mono text-xs text-white outline-none placeholder:text-zinc-600 focus:border-emerald-500/50 disabled:opacity-50"
                />
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    dir="ltr"
                    placeholder="كلمة المرور"
                    value={passwords[p.id] ?? ""}
                    onChange={(e) =>
                      setPasswords((m) => ({ ...m, [p.id]: e.target.value }))
                    }
                    disabled={busy}
                    className="w-full rounded-md border border-zinc-700/60 bg-zinc-950/80 px-3 py-2 text-left font-mono text-xs text-white outline-none placeholder:text-zinc-600 focus:border-emerald-500/50 disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setPasswords((m) => ({ ...m, [p.id]: generatePassword() }))
                    }
                    disabled={busy}
                    title="توليد كلمة مرور قوية"
                    className="shrink-0 rounded-md border border-zinc-800/70 px-2.5 text-[10px] font-bold text-zinc-400 transition-colors hover:bg-white/5 hover:text-white disabled:opacity-50"
                  >
                    توليد
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => callApi(p, linked ? "reset-password" : "create")}
                  disabled={busy}
                  className={`rounded-md px-3 py-2 text-[10px] font-bold uppercase tracking-widest transition-colors disabled:opacity-60 ${
                    linked
                      ? "border border-cyan-400/30 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20"
                      : "bg-emerald-500 text-zinc-950 hover:bg-emerald-400"
                  }`}
                >
                  {busy
                    ? "جاري..."
                    : linked
                      ? "إعادة تعيين كلمة المرور"
                      : "إنشاء وربط"}
                </button>
              </div>

              {msg?.text && (
                <p
                  className={`mt-2 text-[11px] ${
                    msg.ok ? "text-emerald-300" : "text-rose-300"
                  }`}
                >
                  {msg.text}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
