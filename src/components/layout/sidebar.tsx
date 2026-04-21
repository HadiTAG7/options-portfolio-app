"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Crown,
  History,
  LayoutDashboard,
  LineChart,
  LogOut,
  Settings,
  Terminal,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const navItems: NavItem[] = [
  { href: "/", label: "لوحة التحكم", icon: LayoutDashboard },
  { href: "/partners", label: "الشركاء", icon: Users },
  { href: "/trades", label: "الصفقات", icon: LineChart },
  { href: "/history", label: "السجل", icon: History },
];

export function Sidebar() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  return (
    <aside
      className="flex flex-col h-screen w-64 fixed right-0 top-0 z-50 bg-[#050505]/95 backdrop-blur-xl antialiased text-sm font-medium"
      style={{ borderLeft: "1px solid #1f1f1f" }}
    >
      {/* Subtle radial glow behind the logo */}
      <div className="pointer-events-none absolute -top-24 left-1/2 h-48 w-48 -translate-x-1/2 rounded-full bg-emerald-500/[0.06] blur-3xl" />

      {/* ═════ Brand ═════ */}
      <div className="relative px-6 pt-7 pb-6 border-b border-[#1f1f1f]">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md border border-emerald-500/30 bg-emerald-500/10 shadow-[0_0_16px_-4px_rgba(16,185,129,0.45)]">
            <Terminal size={14} className="text-emerald-400" />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="font-headline text-[13px] font-black tracking-[0.08em] text-white uppercase">
              The Kinetic Terminal
            </span>
            <span className="mt-0.5 font-mono text-[9px] tracking-[0.28em] text-emerald-400/70 uppercase">
              Precision · Options · Trading
            </span>
          </div>
        </div>
      </div>

      {/* ═════ Navigation ═════ */}
      <nav className="relative flex-1 px-3 pt-5 space-y-0.5">
        <p className="mb-2 px-3 text-[9px] font-bold uppercase tracking-[0.28em] text-zinc-600">
          Terminal
        </p>
        {navItems.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group relative flex items-center gap-3 rounded-md px-3 py-2.5 transition-all duration-200 cursor-pointer active:scale-[0.98]",
                active
                  ? "bg-emerald-500/[0.08] text-emerald-300 shadow-[0_0_22px_-8px_rgba(16,185,129,0.65)]"
                  : "text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-200"
              )}
            >
              {/* Left-edge neon indicator for the active route */}
              {active && (
                <span className="absolute left-0 top-1/2 h-6 w-[2px] -translate-y-1/2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.9)]" />
              )}
              <Icon
                size={15}
                strokeWidth={active ? 2 : 1.75}
                className={cn(
                  "transition-colors",
                  active
                    ? "text-emerald-400"
                    : "text-zinc-500 group-hover:text-zinc-300"
                )}
              />
              <span
                className={cn(
                  "text-[13px] tracking-wide",
                  active ? "font-bold" : "font-medium"
                )}
              >
                {item.label}
              </span>
              {active && (
                <span className="ml-auto inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.9)]" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* ═════ Footer ═════ */}
      <div className="relative p-3 space-y-1 border-t border-[#1f1f1f]">
        {/* Fund Manager / GP Card */}
        <div className="group relative mb-3 overflow-hidden rounded-lg border border-amber-400/20 bg-gradient-to-br from-zinc-900 via-zinc-900/90 to-zinc-950 p-3.5 transition-all duration-300 hover:border-amber-400/40 hover:shadow-[0_0_28px_-8px_rgba(251,191,36,0.35)]">
          <div className="pointer-events-none absolute -top-10 -right-10 h-24 w-24 rounded-full bg-amber-400/[0.06] blur-2xl" />
          <div className="relative flex items-center gap-3">
            <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-amber-400/40 bg-gradient-to-br from-amber-500/20 to-amber-600/5 text-xs font-black text-amber-300 shadow-[0_0_14px_-4px_rgba(251,191,36,0.55)]">
              SA
              <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-[#050505] bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.9)]">
                <Crown size={8} className="text-zinc-900" strokeWidth={2.5} />
              </span>
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="truncate text-[13px] font-bold text-white">
                سالم العامري
              </p>
              <p className="mt-0.5 flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.22em] text-amber-300/80">
                <span className="inline-block h-1 w-1 rounded-full bg-emerald-400 shadow-[0_0_4px_rgba(16,185,129,0.9)]" />
                Fund Manager · GP
              </p>
            </div>
          </div>
        </div>

        {/* Sleek footer actions */}
        <Link
          href="/settings"
          className="group flex items-center gap-3 rounded-md px-3 py-2 text-zinc-500 transition-all duration-200 hover:bg-white/[0.03] hover:text-zinc-200 cursor-pointer"
        >
          <Settings
            size={14}
            strokeWidth={1.75}
            className="text-zinc-500 transition-colors group-hover:text-zinc-300"
          />
          <span className="text-[12px] tracking-wide">الإعدادات</span>
        </Link>
        <button className="group flex items-center gap-3 rounded-md px-3 py-2 w-full text-zinc-500 transition-all duration-200 hover:bg-rose-500/[0.05] hover:text-rose-300 cursor-pointer">
          <LogOut
            size={14}
            strokeWidth={1.75}
            className="text-zinc-500 transition-colors group-hover:text-rose-400"
          />
          <span className="text-[12px] tracking-wide">تسجيل الخروج</span>
        </button>

        {/* Version / terminal heartbeat */}
        <div className="mt-2 flex items-center justify-between px-3 py-1.5">
          <span className="font-mono text-[9px] uppercase tracking-[0.24em] text-zinc-700">
            v1.0.0
          </span>
          <span className="inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.22em] text-emerald-500/60">
            <span className="inline-block h-1 w-1 rounded-full bg-emerald-400 shadow-[0_0_4px_rgba(16,185,129,0.9)] animate-pulse" />
            Online
          </span>
        </div>
      </div>
    </aside>
  );
}
