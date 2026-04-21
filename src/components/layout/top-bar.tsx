"use client";

import {
  Bell,
  Calendar,
  Globe,
  Search,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSidebar } from "./sidebar-context";

export function TopBar() {
  const { collapsed } = useSidebar();

  return (
    <header
      className={cn(
        "fixed top-0 left-0 z-40 h-16 flex items-center justify-between px-8 bg-[#050505]/95 backdrop-blur-xl border-b border-[#1f1f1f] font-headline text-xs uppercase tracking-widest transition-[right] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
        collapsed ? "right-16" : "right-64"
      )}
    >
      <div className="flex items-center gap-6">
        {/* Search */}
        <div className="relative group">
          <Search
            size={14}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 transition-colors group-focus-within:text-emerald-400"
          />
          <input
            type="text"
            placeholder="البحث في المحفظة..."
            className="bg-black/50 border border-[#1f1f1f] rounded-md pr-9 pl-4 py-2 w-56 text-[11px] normal-case tracking-normal text-zinc-200 placeholder:text-zinc-600 outline-none transition-all duration-200 focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/20 focus:shadow-[0_0_12px_-4px_rgba(16,185,129,0.3)]"
          />
        </div>

        {/* Nav Tabs */}
        <nav className="hidden md:flex items-center gap-1">
          <NavTab label="الأسواق" active={false} />
          <NavTab label="المحفظة" active={true} />
          <NavTab label="التحليلات" active={false} />
        </nav>
      </div>

      <div className="flex items-center gap-4">
        {/* Balance Widget */}
        <div className="hidden lg:flex items-center gap-2.5 px-4 py-2 rounded-md border border-[#1f1f1f] bg-black/40">
          <span className="text-[9px] font-semibold text-zinc-500 normal-case tracking-[0.12em]">
            الرصيد المتاح
          </span>
          <span className="font-mono text-[13px] font-bold tabular-nums text-emerald-400 tracking-tight shadow-[0_0_8px_rgba(16,185,129,0.3)]">
            $42,905.12
          </span>
        </div>

        {/* Icon Actions */}
        <div className="flex items-center gap-1">
          <IconButton icon={<Wallet size={15} />} label="Wallet" />
          <IconButton icon={<Globe size={15} />} label="Language" />
          <IconButton icon={<Bell size={15} />} label="Notifications" />
        </div>

        <div className="h-5 w-px bg-[#1f1f1f] mx-1" />

        {/* Date Range */}
        <button className="inline-flex items-center gap-2 rounded-md border border-[#1f1f1f] bg-zinc-950/60 px-3 py-1.5 text-[9px] font-bold tracking-[0.18em] text-zinc-400 transition-all duration-200 hover:border-zinc-700 hover:bg-zinc-900/80 hover:text-zinc-200">
          <Calendar size={11} className="text-zinc-500" />
          نطاق التاريخ
        </button>

        <div className="h-5 w-px bg-[#1f1f1f] mx-1" />

        {/* Avatar */}
        <div className="flex h-8 w-8 items-center justify-center rounded-md border border-emerald-500/30 bg-black/60 text-[10px] font-black text-emerald-300 tracking-wide transition-all duration-200 hover:border-emerald-500/50 hover:shadow-[0_0_12px_-4px_rgba(16,185,129,0.5)]">
          HA
        </div>
      </div>
    </header>
  );
}

function NavTab({ label, active }: { label: string; active: boolean }) {
  return (
    <a
      href="#"
      className={cn(
        "relative px-3 py-2 text-[10px] font-bold tracking-[0.14em] transition-colors duration-200",
        active
          ? "text-white"
          : "text-zinc-600 hover:text-zinc-300"
      )}
    >
      {label}
      {active && (
        <span className="absolute bottom-0 left-1/2 -translate-x-1/2 h-[2px] w-4/5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
      )}
    </a>
  );
}

function IconButton({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <button
      aria-label={label}
      title={label}
      className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 transition-all duration-200 hover:bg-white/[0.04] hover:text-white"
    >
      {icon}
    </button>
  );
}
