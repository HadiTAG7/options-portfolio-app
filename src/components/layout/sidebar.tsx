"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "لوحة التحكم", icon: "dashboard" },
  { href: "/partners", label: "الشركاء", icon: "group" },
  { href: "/trades", label: "الصفقات", icon: "show_chart" },
  { href: "/history", label: "السجل", icon: "history" },
];

export function Sidebar() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  return (
    <aside className="flex flex-col h-screen w-64 fixed right-0 top-0 z-50 bg-[#0e0e0e] border-l border-white/5 font-headline antialiased text-sm font-medium">
      {/* Brand */}
      <div className="p-6 flex flex-col gap-1">
        <span className="text-lg font-black tracking-tighter text-white uppercase">
          The Kinetic Terminal
        </span>
        <span className="text-[10px] text-primary tracking-[0.2em] opacity-80 uppercase">
          Precision Options Trading
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 mt-4 space-y-1">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-3 px-4 py-3 transition-all duration-200 cursor-pointer active:scale-95",
              isActive(item.href)
                ? "bg-surface-container-highest text-primary border-r-2 border-primary"
                : "text-neutral-400 hover:text-white hover:bg-surface-container hover:text-primary"
            )}
          >
            <Icon name={item.icon} filled={isActive(item.href)} className="text-xl" />
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-white/5 space-y-1">
        {/* User Card */}
        <div className="flex items-center gap-3 p-3 rounded-lg mb-4 bg-surface-container-low">
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-xs">
            SA
          </div>
          <div className="overflow-hidden">
            <p className="text-xs font-bold truncate">سالم العامري</p>
            <p className="text-[10px] text-on-surface-variant">شريك رئيسي</p>
          </div>
        </div>

        <Link
          href="/settings"
          className="flex items-center gap-3 px-4 py-3 text-neutral-400 hover:text-white transition-all duration-200 hover:bg-surface-container cursor-pointer active:scale-95"
        >
          <Icon name="settings" className="text-xl" />
          <span>الإعدادات</span>
        </Link>
        <button className="flex items-center gap-3 px-4 py-3 text-neutral-400 hover:text-white transition-all duration-200 hover:bg-surface-container cursor-pointer active:scale-95 w-full">
          <Icon name="logout" className="text-xl" />
          <span>تسجيل الخروج</span>
        </button>
      </div>
    </aside>
  );
}
