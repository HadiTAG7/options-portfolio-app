"use client";

import React, { useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  Crown,
  Database,
  Download,
  Gauge,
  RefreshCw,
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
