"use client";

import { Icon } from "@/components/ui/icon";

export function TopBar() {
  return (
    <header className="fixed top-0 right-64 left-0 h-16 z-40 flex items-center justify-between px-8 bg-[#0e0e0e]/80 backdrop-blur-xl border-b border-white/5 font-headline text-xs uppercase tracking-widest">
      <div className="flex items-center gap-8">
        {/* Search */}
        <div className="relative group">
          <Icon
            name="search"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 group-focus-within:text-primary text-sm"
          />
          <input
            type="text"
            placeholder="البحث في المحفظة..."
            className="bg-surface-container border-none rounded-sm pr-10 pl-4 py-1.5 w-64 text-xs focus:ring-1 focus:ring-primary outline-none transition-all text-white placeholder:text-neutral-600"
          />
        </div>

        {/* Nav Tabs */}
        <nav className="hidden md:flex items-center gap-6">
          <a href="#" className="text-neutral-500 hover:text-neutral-200 transition-colors duration-200">
            الأسواق
          </a>
          <a href="#" className="text-white font-bold border-b-2 border-primary pb-1">
            المحفظة
          </a>
          <a href="#" className="text-neutral-500 hover:text-neutral-200 transition-colors duration-200">
            التحليلات
          </a>
        </nav>
      </div>

      <div className="flex items-center gap-4">
        {/* Balance */}
        <div className="hidden lg:flex items-center gap-2 px-3 py-1 bg-surface-container rounded-sm border border-white/5">
          <span className="text-[10px] text-on-surface-variant normal-case tracking-normal">الرصيد المتاح:</span>
          <span className="font-bold text-primary">$42,905.12</span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 text-neutral-400">
          <button className="hover:text-primary transition-colors">
            <Icon name="notifications" className="text-xl" />
          </button>
          <button className="hover:text-primary transition-colors">
            <Icon name="account_balance_wallet" className="text-xl" />
          </button>
          <button className="hover:text-primary transition-colors">
            <Icon name="language" className="text-xl" />
          </button>
        </div>

        <div className="h-6 w-px bg-white/10 mx-2" />

        <button className="text-[10px] font-bold tracking-widest text-primary uppercase border border-primary/20 px-3 py-1 hover:bg-primary/10 transition-colors">
          نطاق التاريخ
        </button>
      </div>
    </header>
  );
}
