"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
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
import { useSidebar } from "./sidebar-context";

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
  const { collapsed, toggle, mobileOpen, closeMobile } = useSidebar();

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  return (
    <aside
      className={cn(
        "flex flex-col h-screen fixed right-0 top-0 z-50 bg-[#050505]/95 backdrop-blur-xl antialiased text-sm font-medium",
        "transition-[width,transform] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
        // Mobile: full-width drawer, hidden off-canvas until opened.
        "w-64",
        mobileOpen ? "translate-x-0" : "translate-x-full",
        // Desktop: always on-screen; width follows the collapse toggle.
        "md:translate-x-0",
        collapsed ? "md:w-16" : "md:w-64"
      )}
      style={{ borderLeft: "1px solid #1f1f1f" }}
    >
      {/* Subtle radial glow behind the logo */}
      <div className="pointer-events-none absolute -top-24 left-1/2 h-48 w-48 -translate-x-1/2 rounded-full bg-emerald-500/[0.06] blur-3xl" />

      {/* ═════ Floating Collapse Toggle ═════ */}
      <button
        onClick={toggle}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        title={collapsed ? "Expand" : "Collapse"}
        className={cn(
          "group/toggle absolute top-7 z-20 hidden h-6 w-6 items-center justify-center rounded-full border border-[#1f1f1f] bg-[#0a0a0a] text-zinc-500 shadow-[0_0_0_4px_#050505] md:flex",
          "transition-all duration-200 hover:border-emerald-500/50 hover:bg-emerald-500/10 hover:text-emerald-300 hover:shadow-[0_0_18px_-2px_rgba(16,185,129,0.55),0_0_0_4px_#050505]",
          "active:scale-95",
          // Park it on the left edge of the sidebar. Because the aside is
          // anchored to right:0 and the LTR chrome flips, using -left-3
          // pins the toggle halfway over the left border for both widths.
          "-left-3"
        )}
      >
        {collapsed ? (
          <ChevronLeft size={12} strokeWidth={2.25} />
        ) : (
          <ChevronRight size={12} strokeWidth={2.25} />
        )}
      </button>

      {/* ═════ Brand ═════ */}
      <div
        className={cn(
          "relative border-b border-[#1f1f1f] transition-[padding] duration-300",
          collapsed ? "px-0 pt-7 pb-5" : "px-5 pt-7 pb-6"
        )}
      >
        <div
          className={cn(
            "flex items-center",
            collapsed ? "justify-center" : "gap-2.5"
          )}
        >
          <div
            className={cn(
              "flex items-center justify-center rounded-md border border-emerald-500/30 bg-emerald-500/10 shadow-[0_0_16px_-4px_rgba(16,185,129,0.45)] transition-all duration-300",
              collapsed ? "h-9 w-9" : "h-8 w-8"
            )}
          >
            {collapsed ? (
              <span className="font-headline text-[13px] font-black text-emerald-300">
                A
              </span>
            ) : (
              <Terminal size={14} className="text-emerald-400" />
            )}
          </div>
          {!collapsed && (
            <div className="flex flex-col leading-tight min-w-0">
              <span className="font-headline text-[11px] font-black tracking-[0.06em] text-white uppercase whitespace-nowrap">
                Alghanim Options Desk
              </span>
              <span className="mt-0.5 font-mono text-[8px] tracking-[0.24em] text-emerald-400/70 uppercase whitespace-nowrap">
                Proprietary Trading Desk
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ═════ Navigation ═════ */}
      <nav
        onClick={closeMobile}
        className={cn(
          "relative flex-1 pt-5 space-y-0.5 transition-[padding] duration-300",
          collapsed ? "px-2" : "px-3"
        )}
      >
        {!collapsed && (
          <p className="mb-2 px-3 text-[9px] font-bold uppercase tracking-[0.28em] text-zinc-600">
            Terminal
          </p>
        )}
        {navItems.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            active={isActive(item.href)}
            collapsed={collapsed}
          />
        ))}
      </nav>

      {/* ═════ Footer ═════ */}
      <div
        onClick={closeMobile}
        className={cn(
          "relative space-y-1 border-t border-[#1f1f1f] transition-[padding] duration-300",
          collapsed ? "p-2" : "p-3"
        )}
      >
        {/* Fund Manager / GP Card */}
        {collapsed ? (
          <SidebarTooltip label="هادي الغانم · Fund Manager">
            <div className="group relative mb-2 flex items-center justify-center rounded-md border border-amber-400/25 bg-gradient-to-br from-zinc-900 via-zinc-900/90 to-zinc-950 py-2 transition-all duration-300 hover:border-amber-400/50 hover:shadow-[0_0_22px_-6px_rgba(251,191,36,0.45)]">
              <div className="relative flex h-9 w-9 items-center justify-center rounded-md border border-amber-400/40 bg-gradient-to-br from-amber-500/20 to-amber-600/5 text-[10px] font-black text-amber-300 shadow-[0_0_12px_-4px_rgba(251,191,36,0.55)]">
                HA
                <span className="absolute -top-1 -right-1 flex h-3 w-3 items-center justify-center rounded-full border border-[#050505] bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.9)]">
                  <Crown
                    size={7}
                    className="text-zinc-900"
                    strokeWidth={2.5}
                  />
                </span>
              </div>
            </div>
          </SidebarTooltip>
        ) : (
          <div className="group relative mb-3 overflow-hidden rounded-lg border border-amber-400/20 bg-gradient-to-br from-zinc-900 via-zinc-900/90 to-zinc-950 p-3.5 transition-all duration-300 hover:border-amber-400/40 hover:shadow-[0_0_28px_-8px_rgba(251,191,36,0.35)]">
            <div className="pointer-events-none absolute -top-10 -right-10 h-24 w-24 rounded-full bg-amber-400/[0.06] blur-2xl" />
            <div className="relative flex items-center gap-3">
              <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-amber-400/40 bg-gradient-to-br from-amber-500/20 to-amber-600/5 text-xs font-black text-amber-300 shadow-[0_0_14px_-4px_rgba(251,191,36,0.55)]">
                HA
                <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-[#050505] bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.9)]">
                  <Crown
                    size={8}
                    className="text-zinc-900"
                    strokeWidth={2.5}
                  />
                </span>
              </div>
              <div className="flex-1 overflow-hidden">
                <p className="truncate text-[13px] font-bold text-white">
                  هادي الغانم
                </p>
                <p className="mt-0.5 flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.22em] text-amber-300/80">
                  <span className="inline-block h-1 w-1 rounded-full bg-emerald-400 shadow-[0_0_4px_rgba(16,185,129,0.9)]" />
                  Fund Manager · GP
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Settings */}
        <FooterLink
          href="/settings"
          icon={Settings}
          label="الإعدادات"
          tooltip="Settings · الإعدادات"
          collapsed={collapsed}
        />

        {/* Logout */}
        <FooterButton
          icon={LogOut}
          label="تسجيل الخروج"
          tooltip="Logout · تسجيل الخروج"
          tone="rose"
          collapsed={collapsed}
        />

        {/* Version / terminal heartbeat */}
        {!collapsed ? (
          <div className="mt-2 flex items-center justify-between px-3 py-1.5">
            <span className="font-mono text-[9px] uppercase tracking-[0.24em] text-zinc-700">
              v1.0.0
            </span>
            <span className="inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.22em] text-emerald-500/60">
              <span className="inline-block h-1 w-1 rounded-full bg-emerald-400 shadow-[0_0_4px_rgba(16,185,129,0.9)] animate-pulse" />
              Online
            </span>
          </div>
        ) : (
          <div
            className="mt-2 flex items-center justify-center py-1.5"
            title="Online"
          >
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.9)] animate-pulse" />
          </div>
        )}
      </div>
    </aside>
  );
}

function NavLink({
  item,
  active,
  collapsed,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
}) {
  const Icon = item.icon;
  const content = (
    <Link
      href={item.href}
      className={cn(
        "group relative flex items-center rounded-md transition-all duration-200 cursor-pointer active:scale-[0.98]",
        collapsed ? "justify-center h-10 w-full" : "gap-3 px-3 py-2.5",
        active
          ? "bg-emerald-500/[0.08] text-emerald-300 shadow-[0_0_22px_-8px_rgba(16,185,129,0.65)]"
          : "text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-200"
      )}
    >
      {active && (
        <span className="absolute left-0 top-1/2 h-6 w-[2px] -translate-y-1/2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.9)]" />
      )}
      <Icon
        size={collapsed ? 17 : 15}
        strokeWidth={active ? 2 : 1.75}
        className={cn(
          "shrink-0 transition-colors",
          active
            ? "text-emerald-400"
            : "text-zinc-500 group-hover:text-zinc-300"
        )}
      />
      {!collapsed && (
        <>
          <span
            className={cn(
              "text-[13px] tracking-wide whitespace-nowrap",
              active ? "font-bold" : "font-medium"
            )}
          >
            {item.label}
          </span>
          {active && (
            <span className="ml-auto inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.9)]" />
          )}
        </>
      )}
    </Link>
  );

  if (!collapsed) return content;
  return <SidebarTooltip label={item.label}>{content}</SidebarTooltip>;
}

function FooterLink({
  href,
  icon: Icon,
  label,
  tooltip,
  collapsed,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  tooltip: string;
  collapsed: boolean;
}) {
  const content = (
    <Link
      href={href}
      className={cn(
        "group flex items-center rounded-md text-zinc-500 transition-all duration-200 hover:bg-white/[0.03] hover:text-zinc-200 cursor-pointer",
        collapsed ? "justify-center h-9 w-full" : "gap-3 px-3 py-2"
      )}
    >
      <Icon
        size={collapsed ? 15 : 14}
        strokeWidth={1.75}
        className="shrink-0 transition-colors group-hover:text-zinc-300"
      />
      {!collapsed && (
        <span className="text-[12px] tracking-wide whitespace-nowrap">
          {label}
        </span>
      )}
    </Link>
  );
  if (!collapsed) return content;
  return <SidebarTooltip label={tooltip}>{content}</SidebarTooltip>;
}

function FooterButton({
  icon: Icon,
  label,
  tooltip,
  tone,
  collapsed,
}: {
  icon: LucideIcon;
  label: string;
  tooltip: string;
  tone: "rose" | "zinc";
  collapsed: boolean;
}) {
  const hover =
    tone === "rose"
      ? "hover:bg-rose-500/[0.05] hover:text-rose-300"
      : "hover:bg-white/[0.03] hover:text-zinc-200";
  const iconHover =
    tone === "rose" ? "group-hover:text-rose-400" : "group-hover:text-zinc-300";
  const content = (
    <button
      className={cn(
        "group flex items-center rounded-md w-full text-zinc-500 transition-all duration-200 cursor-pointer",
        hover,
        collapsed ? "justify-center h-9" : "gap-3 px-3 py-2"
      )}
    >
      <Icon
        size={collapsed ? 15 : 14}
        strokeWidth={1.75}
        className={cn("shrink-0 transition-colors", iconHover)}
      />
      {!collapsed && (
        <span className="text-[12px] tracking-wide whitespace-nowrap">
          {label}
        </span>
      )}
    </button>
  );
  if (!collapsed) return content;
  return <SidebarTooltip label={tooltip}>{content}</SidebarTooltip>;
}

// Native-CSS tooltip. Appears to the LEFT of the trigger because this
// sidebar is anchored to the right edge of the screen — putting the
// tooltip on the right would throw it off-screen. The group wrapper
// controls show/hide via group-hover.
function SidebarTooltip({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <div className="group/tip relative">
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute top-1/2 right-full mr-3 -translate-y-1/2 z-[60] whitespace-nowrap rounded-md border border-[#1f1f1f] bg-[#0a0a0a] px-2.5 py-1.5 text-[11px] font-semibold text-zinc-200 shadow-[0_0_0_1px_rgba(0,0,0,0.4),0_8px_24px_-6px_rgba(0,0,0,0.8),0_0_18px_-6px_rgba(16,185,129,0.3)] opacity-0 translate-x-1 transition-all duration-150 group-hover/tip:opacity-100 group-hover/tip:translate-x-0"
      >
        {label}
        <span className="absolute top-1/2 -right-[4px] -translate-y-1/2 h-2 w-2 rotate-45 border-t border-r border-[#1f1f1f] bg-[#0a0a0a]" />
      </span>
    </div>
  );
}
