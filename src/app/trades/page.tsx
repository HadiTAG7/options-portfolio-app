"use client";

import { AppShell } from "@/components/layout/app-shell";
import { Icon } from "@/components/ui/icon";
import { optionTrades, stockPositions } from "@/data/mock-data";
import { formatCurrency } from "@/lib/utils";

export default function TradesPage() {
  return (
    <AppShell>
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="font-headline text-3xl font-black uppercase text-on-surface">
          Active Terminal Views
        </h1>
        <div className="mt-2 flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-primary" />
            <p className="text-sm text-on-surface-variant">
              مراقبة الصفقات النشطة والبيانات الحية لمحفظة الخيارات والأسهم
            </p>
          </div>
          <div className="mr-auto flex items-center gap-3">
            <button className="rounded-lg bg-surface-container px-4 py-2 text-sm text-on-surface-variant transition hover:bg-surface-container-high">
              تصدير CSV
            </button>
            <button className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary transition hover:bg-primary/90">
              <Icon name="add" className="text-base" />
              صفقة جديدة
            </button>
          </div>
        </div>
      </div>

      {/* Active Options Chain Table */}
      <section className="mb-8 overflow-hidden rounded-2xl bg-surface-container">
        <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
          <div className="flex items-center gap-3">
            <Icon name="layers" className="text-tertiary" />
            <h2 className="text-sm font-semibold text-on-surface">
              Active Options Chain (عقود الخيارات)
            </h2>
          </div>
          <span className="text-xs text-on-surface-variant">
            Live Update: 2s ago
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-container-low text-[10px] uppercase tracking-wider text-on-surface-variant">
                <th className="px-4 py-3 text-start">الرمز</th>
                <th className="px-4 py-3 text-start">النوع</th>
                <th className="px-4 py-3 text-start">الكمية</th>
                <th className="px-4 py-3 text-start">العلاوة</th>
                <th className="px-4 py-3 text-start">سعر التنفيذ</th>
                <th className="px-4 py-3 text-start">تاريخ الانتهاء</th>
                <th className="px-4 py-3 text-start">تاريخ الدخول</th>
                <th className="px-4 py-3 text-start">P&L غير محقق</th>
                <th className="px-4 py-3 text-start">إجمالي الربح</th>
                <th className="px-4 py-3 text-start">النسبة %</th>
                <th className="px-4 py-3 text-start">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {optionTrades.map((trade) => (
                <tr
                  key={trade.id}
                  className="border-t border-white/5 transition hover:bg-white/[0.02]"
                >
                  <td className="px-4 py-3 font-mono font-semibold text-on-surface">
                    {trade.symbol}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full border px-2.5 py-0.5 text-[10px] font-medium ${
                        trade.type === "Sell Put"
                          ? "border-secondary text-secondary"
                          : "border-tertiary text-tertiary"
                      }`}
                    >
                      {trade.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-on-surface-variant">
                    {trade.quantity}
                  </td>
                  <td className="px-4 py-3 font-mono text-on-surface-variant">
                    ${trade.premium.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 font-mono text-on-surface-variant">
                    ${trade.strikePrice.toFixed(0)}
                  </td>
                  <td className="px-4 py-3 text-on-surface-variant">
                    {trade.expirationDate}
                  </td>
                  <td className="px-4 py-3 text-on-surface-variant">
                    {trade.entryDate}
                  </td>
                  <td
                    className={`px-4 py-3 font-mono ${
                      trade.unrealizedPnL >= 0
                        ? "text-primary"
                        : "text-secondary"
                    }`}
                  >
                    {trade.unrealizedPnL >= 0 ? "+" : ""}
                    {formatCurrency(trade.unrealizedPnL)}
                  </td>
                  <td
                    className={`px-4 py-3 font-mono ${
                      trade.totalProfit >= 0
                        ? "text-primary"
                        : "text-secondary"
                    }`}
                  >
                    {trade.totalProfit >= 0 ? "+" : ""}
                    {formatCurrency(trade.totalProfit)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span
                        className={`font-mono text-xs ${
                          trade.returnPercent >= 0
                            ? "text-primary"
                            : "text-secondary"
                        }`}
                      >
                        {trade.returnPercent >= 0 ? "+" : ""}
                        {trade.returnPercent.toFixed(1)}%
                      </span>
                      <div className="h-1 w-12 overflow-hidden rounded-full bg-white/5">
                        <div
                          className={`h-full rounded-full ${
                            trade.returnPercent >= 0
                              ? "bg-primary"
                              : "bg-secondary"
                          }`}
                          style={{
                            width: `${Math.min(Math.abs(trade.returnPercent), 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <button className="text-secondary-dim transition hover:text-secondary">
                      <Icon name="delete" className="text-lg" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Active Stocks Portfolio Table */}
      <section className="mb-8 overflow-hidden rounded-2xl bg-surface-container">
        <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
          <div className="flex items-center gap-3">
            <Icon name="monitoring" className="text-primary" />
            <h2 className="text-sm font-semibold text-on-surface">
              Active Stocks Portfolio (محفظة الأسهم)
            </h2>
          </div>
          <div className="flex items-center gap-2 text-xs text-primary">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            Live Markets Open
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-container-low text-[10px] uppercase tracking-wider text-on-surface-variant">
                <th className="px-4 py-3 text-start">الرمز</th>
                <th className="px-4 py-3 text-start">الكمية</th>
                <th className="px-4 py-3 text-start">سعر الشراء</th>
                <th className="px-4 py-3 text-start">السعر الحالي (Live)</th>
                <th className="px-4 py-3 text-start">السعر المستهدف</th>
                <th className="px-4 py-3 text-start">المسافة للهدف</th>
                <th className="px-4 py-3 text-start">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {stockPositions.map((stock) => {
                const targetDistance =
                  ((stock.currentPrice - stock.buyPrice) /
                    (stock.targetPrice - stock.buyPrice)) *
                  100;
                return (
                  <tr
                    key={stock.id}
                    className="border-t border-white/5 transition hover:bg-white/[0.02]"
                  >
                    <td className="px-4 py-3 font-mono font-semibold text-on-surface">
                      {stock.symbol}
                    </td>
                    <td className="px-4 py-3 font-mono text-on-surface-variant">
                      {stock.quantity}
                    </td>
                    <td className="px-4 py-3 font-mono text-on-surface-variant">
                      {formatCurrency(stock.buyPrice)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`font-mono ${
                          stock.priceDirection === "up"
                            ? "text-primary"
                            : "text-secondary"
                        }`}
                      >
                        {stock.priceDirection === "up" ? "▲" : "▼"}{" "}
                        {formatCurrency(stock.currentPrice)}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-on-surface-variant">
                      {formatCurrency(stock.targetPrice)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1 w-32 overflow-hidden rounded-full bg-white/5">
                          <div
                            className={`h-full rounded-full ${
                              stock.priceDirection === "up"
                                ? "bg-primary"
                                : "bg-secondary"
                            }`}
                            style={{
                              width: `${Math.max(0, Math.min(targetDistance, 100))}%`,
                            }}
                          />
                        </div>
                        <span
                          className={`font-mono text-xs ${
                            stock.priceDirection === "up"
                              ? "text-primary"
                              : "text-secondary"
                          }`}
                        >
                          {targetDistance.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <button className="text-secondary-dim transition hover:text-secondary">
                        <Icon name="delete" className="text-lg" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Three Bento Summary Cards */}
      <div className="mb-8 grid grid-cols-3 gap-4">
        {/* Card 1: Total Net Worth */}
        <div className="relative overflow-hidden rounded-2xl bg-surface-container p-6">
          <Icon
            name="account_balance"
            className="absolute -bottom-2 -left-2 text-7xl text-white/[0.03]"
          />
          <p className="text-xs uppercase tracking-wider text-on-surface-variant">
            Total Net Worth
          </p>
          <p className="mt-2 font-mono text-2xl font-bold text-on-surface">
            $214,500.80
          </p>
          <p className="mt-1 text-xs text-primary">+4.2% Today</p>
        </div>

        {/* Card 2: Daily P&L */}
        <div className="relative overflow-hidden rounded-2xl bg-surface-container p-6">
          <Icon
            name="analytics"
            className="absolute -bottom-2 -left-2 text-7xl text-white/[0.03]"
          />
          <p className="text-xs uppercase tracking-wider text-on-surface-variant">
            Daily P&L
          </p>
          <p className="mt-2 font-mono text-2xl font-bold text-primary">
            +$8,421.15
          </p>
          <p className="mt-1 text-xs text-on-surface-variant">
            Active across 12 positions
          </p>
        </div>

        {/* Card 3: Margin Utilization */}
        <div className="relative overflow-hidden rounded-2xl bg-surface-container p-6">
          <Icon
            name="security"
            className="absolute -bottom-2 -left-2 text-7xl text-white/[0.03]"
          />
          <p className="text-xs uppercase tracking-wider text-on-surface-variant">
            Margin Utilization
          </p>
          <p className="mt-2 font-mono text-2xl font-bold text-on-surface">
            18.4%
          </p>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/5">
            <div
              className="h-full rounded-full bg-tertiary"
              style={{ width: "18.4%" }}
            />
          </div>
        </div>
      </div>

      {/* System Status Footer */}
      <div className="flex items-center justify-between rounded-xl border border-white/5 bg-surface-container-low px-6 py-3 text-[10px] uppercase tracking-wider text-on-surface-variant">
        <div className="flex items-center gap-6">
          <span>
            Terminal Engine: <span className="text-primary">Optimized</span>
          </span>
          <span>
            Latency: <span className="text-on-surface">14ms</span>
          </span>
          <span>
            API Status: <span className="text-primary">Stable</span>
          </span>
        </div>
        <span>&copy; 2024 Kinetic Terminal v2.4.0-Stable</span>
      </div>

      {/* FAB */}
      <button className="fixed bottom-8 left-8 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-on-primary shadow-lg transition hover:bg-primary/90">
        <Icon name="terminal" className="text-2xl" />
      </button>
    </AppShell>
  );
}
