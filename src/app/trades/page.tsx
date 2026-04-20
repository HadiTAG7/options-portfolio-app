"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Icon } from "@/components/ui/icon";
import { TableRowSkeleton } from "@/components/ui/skeleton";
import { EditTradeDialog } from "@/components/ui/edit-trade-dialog";
import type { TradeEditPayload } from "@/components/ui/edit-trade-dialog";
import { AddTradeDialog } from "@/components/ui/add-trade-dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Toast } from "@/components/ui/toast";
import { formatCurrency } from "@/lib/utils";
import { tradeProfit } from "@/lib/partner-profit";
import { useTrades } from "@/hooks/use-trades";
import type { Trade } from "@/types";

function typeBadgeClass(type: string): string {
  switch (type) {
    case "Sell Put":
      return "border-secondary/40 text-secondary bg-secondary/5";
    case "Sell Call":
      return "border-tertiary/40 text-tertiary bg-tertiary/5";
    case "Stock Sell":
      return "border-primary/40 text-primary bg-primary/5";
    default:
      return "border-white/10 text-on-surface-variant bg-white/[0.02]";
  }
}

function formatExpiration(trade: Trade): string {
  // Stock Sell rows may have an empty expiration — show a placeholder instead.
  if (!trade.expiration || trade.expiration.trim() === "") return "—";
  return trade.expiration;
}

export default function TradesPage() {
  const {
    trades,
    sellCalls,
    sellPuts,
    stockSells,
    closedOptions,
    activeStocks,
    loading,
    error,
    totalPremium,
    totalResult,
    totalProfit,
    openCount,
    updateTrade,
    addTrade,
    deleteTrade,
    toast,
    dismissToast,
    refreshPrices,
  } = useTrades();

  const [editingTrade, setEditingTrade] = useState<Trade | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [deletingTrade, setDeletingTrade] = useState<Trade | null>(null);
  const pricesRefreshing = activeStocks.some((s) => s.priceLoading);

  async function handleDeleteTrade() {
    if (!deletingTrade) return;
    try {
      await deleteTrade(deletingTrade.id);
    } finally {
      setDeletingTrade(null);
    }
  }

  async function handleEditTrade(id: string, payload: TradeEditPayload) {
    await updateTrade(id, payload);
  }

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
              سجل الصفقات والمراكز النشطة للمحفظة
            </p>
          </div>
          <div className="mr-auto flex items-center gap-3">
            <button className="rounded-lg bg-surface-container px-4 py-2 text-sm text-on-surface-variant transition hover:bg-surface-container-high">
              تصدير CSV
            </button>
            <button
              onClick={() => setAddDialogOpen(true)}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-on-primary transition hover:bg-primary/90"
            >
              <Icon name="add" className="text-base" />
              صفقة جديدة
            </button>
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mb-6 flex items-center gap-3 rounded-sm border border-secondary/30 bg-secondary/10 p-4 text-sm text-secondary">
          <Icon name="error" className="!text-xl" />
          <span className="font-mono">{error}</span>
        </div>
      )}

      {/* Summary Cards */}
      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-4">
        <SummaryCard
          icon="savings"
          labelAr="إجمالي العلاوات"
          labelEn="Total Premium"
          value={formatCurrency(totalPremium)}
          tone="primary"
        />
        <SummaryCard
          icon="paid"
          labelAr="النتائج المحققة"
          labelEn="Realized Result"
          value={formatCurrency(totalResult)}
          tone={totalResult >= 0 ? "primary" : "secondary"}
        />
        <SummaryCard
          icon="analytics"
          labelAr="إجمالي الربح"
          labelEn="Total Profit"
          value={formatCurrency(totalProfit)}
          tone={totalProfit >= 0 ? "primary" : "secondary"}
        />
        <SummaryCard
          icon="layers"
          labelAr="الخيارات المفتوحة"
          labelEn="Open Options"
          value={String(openCount)}
          tone="tertiary"
        />
      </div>

      {/* Active Stocks (Current Holdings) */}
      <section className="mb-8 overflow-hidden rounded-2xl bg-surface-container">
        <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
          <div className="flex items-center gap-3">
            <Icon name="inventory_2" className="text-primary" />
            <h2 className="text-sm font-semibold text-on-surface">
              الأسهم النشطة (Active Stocks)
            </h2>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-bold uppercase text-primary">
              {activeStocks.length} holdings
            </span>
            <button
              type="button"
              onClick={() => void refreshPrices()}
              disabled={pricesRefreshing || activeStocks.length === 0}
              title="Refresh Prices"
              aria-label="Refresh Prices"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-on-surface-variant/70 transition hover:bg-primary/10 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
            >
              <RefreshCw
                size={14}
                className={pricesRefreshing ? "animate-spin" : ""}
              />
            </button>
          </div>
          <span className="text-xs text-on-surface-variant">
            Current Holdings
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-container-low text-[10px] uppercase tracking-wider text-on-surface-variant">
                <th className="px-4 py-3 text-start">الرمز (Ticker)</th>
                <th className="px-4 py-3 text-start">الكمية (Quantity)</th>
                <th className="px-4 py-3 text-start">سعر الشراء (Purchase Price)</th>
                <th className="px-4 py-3 text-start">السعر الحالي (Current Price)</th>
                <th className="px-4 py-3 text-start">الربح غير المحقق (Unrealized P&amp;L)</th>
                <th className="px-4 py-3 text-start">السعر المستهدف (Target Sell)</th>
                <th className="px-4 py-3 text-start">الأساس الكلي (Cost Basis)</th>
                <th className="px-4 py-3 text-start">تاريخ الشراء (Date)</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <>
                  <TableRowSkeleton cols={8} />
                  <TableRowSkeleton cols={8} />
                </>
              )}

              {!loading && activeStocks.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center">
                    <Icon
                      name="inventory_2"
                      className="!text-4xl text-on-surface-variant/30 mb-2 block mx-auto"
                    />
                    <p className="text-sm text-on-surface-variant">
                      لا توجد مراكز نشطة في الأسهم
                    </p>
                  </td>
                </tr>
              )}

              {!loading &&
                activeStocks.map((stock) => {
                  const hasLivePrice =
                    typeof stock.currentPrice === "number" &&
                    Number.isFinite(stock.currentPrice) &&
                    stock.currentPrice > 0;
                  const pnlAbs = hasLivePrice
                    ? (stock.currentPrice! - stock.purchasePrice) *
                      stock.quantity
                    : 0;
                  const pnlPct =
                    hasLivePrice && stock.purchasePrice > 0
                      ? ((stock.currentPrice! - stock.purchasePrice) /
                          stock.purchasePrice) *
                        100
                      : 0;
                  const pnlTone =
                    pnlAbs > 0
                      ? "text-emerald-500"
                      : pnlAbs < 0
                        ? "text-rose-500"
                        : "text-on-surface-variant";

                  return (
                    <tr
                      key={stock.id}
                      className="border-t border-white/5 transition hover:bg-white/[0.02]"
                    >
                      <td className="px-4 py-3 font-mono font-semibold text-on-surface">
                        {stock.ticker}
                      </td>
                      <td className="px-4 py-3 font-mono text-on-surface-variant">
                        {stock.quantity.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 font-mono text-on-surface-variant">
                        {formatCurrency(stock.purchasePrice)}
                      </td>
                      <td className="px-4 py-3 font-mono">
                        {stock.priceLoading ? (
                          <span className="inline-flex items-center gap-2 text-on-surface-variant/60">
                            <span className="h-3 w-3 animate-spin rounded-full border-2 border-on-surface-variant/30 border-t-primary" />
                            <span className="text-[10px] uppercase tracking-wider">
                              جاري...
                            </span>
                          </span>
                        ) : hasLivePrice ? (
                          <span className="text-on-surface">
                            {formatCurrency(stock.currentPrice!)}
                          </span>
                        ) : (
                          <span className="text-on-surface-variant/40">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono">
                        {stock.priceLoading ? (
                          <span className="h-3 w-3 inline-block animate-spin rounded-full border-2 border-on-surface-variant/30 border-t-primary" />
                        ) : hasLivePrice ? (
                          <div className="flex flex-col">
                            <span className={`font-semibold ${pnlTone}`}>
                              {pnlAbs >= 0 ? "+" : ""}
                              {formatCurrency(pnlAbs)}
                            </span>
                            <span className={`text-[10px] ${pnlTone} opacity-80`}>
                              {pnlPct >= 0 ? "+" : ""}
                              {pnlPct.toFixed(2)}%
                            </span>
                          </div>
                        ) : (
                          <span className="text-on-surface-variant/40">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono">
                        {stock.targetSellPrice > 0 ? (
                          <span className="text-tertiary">
                            {formatCurrency(stock.targetSellPrice)}
                          </span>
                        ) : (
                          <span className="text-on-surface-variant/40">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono font-semibold text-on-surface">
                        {formatCurrency(stock.costBasis)}
                      </td>
                      <td className="px-4 py-3 text-on-surface-variant">
                        {stock.purchaseDate || "—"}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Trade History grouped by type */}
      <TradeSection
        title="بيع الخيارات: Puts"
        subtitle="Sell Put Positions"
        icon="trending_down"
        iconColor="text-secondary"
        trades={sellPuts}
        loading={loading}
        valueColumn="premium"
        onEdit={setEditingTrade}
        onDelete={setDeletingTrade}
      />

      <TradeSection
        title="بيع الخيارات: Calls"
        subtitle="Sell Call Positions"
        icon="trending_up"
        iconColor="text-tertiary"
        trades={sellCalls}
        loading={loading}
        valueColumn="premium"
        onEdit={setEditingTrade}
        onDelete={setDeletingTrade}
      />

      <TradeSection
        title="الخيارات المنتهية"
        subtitle="Expired Options (Auto-Closed)"
        icon="event_busy"
        iconColor="text-emerald-500"
        trades={closedOptions}
        loading={loading}
        valueColumn="result"
        onDelete={setDeletingTrade}
      />

      <TradeSection
        title="مبيعات الأسهم المغلقة"
        subtitle="Closed Stock Sells"
        icon="check_circle"
        iconColor="text-primary"
        trades={stockSells}
        loading={loading}
        valueColumn="result"
        onDelete={setDeletingTrade}
      />

      {/* Empty state for entire ledger */}
      {!loading && trades.length === 0 && !error && (
        <div className="rounded-2xl border border-dashed border-white/10 bg-surface-container-low p-12 text-center">
          <Icon
            name="query_stats"
            className="!text-5xl text-on-surface-variant/30 mb-3 block mx-auto"
          />
          <p className="text-sm text-on-surface">
            لا توجد صفقات مسجّلة بعد
          </p>
          <p className="mt-1 text-[10px] text-on-surface-variant">
            أضف أول صفقة لتبدأ في بناء سجلك
          </p>
        </div>
      )}

      {/* Add Trade Dialog */}
      <AddTradeDialog
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        onSubmit={addTrade}
      />

      {/* Edit Trade Dialog */}
      <EditTradeDialog
        open={editingTrade !== null}
        trade={editingTrade}
        onClose={() => setEditingTrade(null)}
        onSubmit={handleEditTrade}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deletingTrade !== null}
        title="حذف الصفقة"
        description={`هل أنت متأكد من حذف صفقة ${deletingTrade?.ticker ?? ""} (${deletingTrade?.type ?? ""}) نهائياً؟ لا يمكن التراجع عن هذا الإجراء.`}
        confirmLabel="تأكيد الحذف"
        cancelLabel="إلغاء"
        onConfirm={handleDeleteTrade}
        onCancel={() => setDeletingTrade(null)}
      />

      {/* Auto-expiration toast */}
      <Toast message={toast} tone="success" onDismiss={dismissToast} />

      {/* FAB */}
      <button className="fixed bottom-8 left-8 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-on-primary shadow-lg transition hover:bg-primary/90">
        <Icon name="terminal" className="text-2xl" />
      </button>
    </AppShell>
  );
}

function SummaryCard({
  icon,
  labelAr,
  labelEn,
  value,
  tone,
}: {
  icon: string;
  labelAr: string;
  labelEn: string;
  value: string;
  tone: "primary" | "secondary" | "tertiary";
}) {
  const toneClass =
    tone === "primary"
      ? "text-primary"
      : tone === "secondary"
        ? "text-secondary"
        : "text-tertiary";

  return (
    <div className="relative overflow-hidden rounded-2xl bg-surface-container p-6">
      <Icon
        name={icon}
        className={`absolute -bottom-2 -left-2 text-7xl text-white/[0.03]`}
      />
      <p className="text-[10px] uppercase tracking-wider text-on-surface-variant">
        {labelAr}
      </p>
      <p className="text-[9px] uppercase tracking-wider text-on-surface-variant/60">
        {labelEn}
      </p>
      <p className={`mt-2 font-mono text-2xl font-bold ${toneClass}`}>
        {value}
      </p>
    </div>
  );
}

function TradeSection({
  title,
  subtitle,
  icon,
  iconColor,
  trades,
  loading,
  valueColumn,
  onEdit,
  onDelete,
}: {
  title: string;
  subtitle: string;
  icon: string;
  iconColor: string;
  trades: Trade[];
  loading: boolean;
  valueColumn: "premium" | "result";
  onEdit?: (trade: Trade) => void;
  onDelete?: (trade: Trade) => void;
}) {
  const isResult = valueColumn === "result";
  const valueLabelAr = isResult ? "النتيجة" : "العلاوة";
  const valueLabelEn = isResult ? "Result" : "Premium";
  const hasActions = onEdit || onDelete;
  const colCount = hasActions ? 9 : 8;

  return (
    <section className="mb-8 overflow-hidden rounded-2xl bg-surface-container">
      <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
        <div className="flex items-center gap-3">
          <Icon name={icon} className={iconColor} />
          <div>
            <h2 className="text-sm font-semibold text-on-surface">{title}</h2>
            <p className="text-[10px] uppercase tracking-wider text-on-surface-variant/70">
              {subtitle}
            </p>
          </div>
          <span className="rounded-full bg-white/5 px-2 py-0.5 text-[9px] font-bold uppercase text-on-surface-variant">
            {trades.length}
          </span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-container-low text-[10px] uppercase tracking-wider text-on-surface-variant">
              <th className="px-4 py-3 text-start">الرمز</th>
              <th className="px-4 py-3 text-start">النوع</th>
              <th className="px-4 py-3 text-start">الكمية</th>
              <th className="px-4 py-3 text-start">سعر التنفيذ</th>
              <th className="px-4 py-3 text-start">
                {valueLabelAr} ({valueLabelEn})
              </th>
              <th className="px-4 py-3 text-start">إجمالي الربح (Total PnL)</th>
              <th className="px-4 py-3 text-start">تاريخ الانتهاء</th>
              <th className="px-4 py-3 text-start">التاريخ</th>
              {hasActions && <th className="px-4 py-3 text-start w-20" />}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <>
                <TableRowSkeleton cols={colCount} />
                <TableRowSkeleton cols={colCount} />
              </>
            )}

            {!loading && trades.length === 0 && (
              <tr>
                <td
                  colSpan={colCount}
                  className="px-4 py-8 text-center text-xs text-on-surface-variant"
                >
                  لا توجد صفقات من هذا النوع
                </td>
              </tr>
            )}

            {!loading &&
              trades.map((trade) => {
                const valueRaw = isResult ? trade.result : trade.premium;
                const valueClass = isResult
                  ? valueRaw >= 0
                    ? "text-primary"
                    : "text-secondary"
                  : "text-primary";
                const pnl = tradeProfit(trade);
                const pnlPositive = pnl >= 0;
                return (
                  <tr
                    key={trade.id}
                    className="border-t border-white/5 transition hover:bg-white/[0.02]"
                  >
                    <td className="px-4 py-3 font-mono font-semibold text-on-surface">
                      {trade.ticker}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded-full border px-2.5 py-0.5 text-[10px] font-medium ${typeBadgeClass(trade.type)}`}
                      >
                        {trade.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-on-surface-variant">
                      {trade.quantity}
                    </td>
                    <td className="px-4 py-3 font-mono text-on-surface-variant">
                      {trade.strike > 0 ? formatCurrency(trade.strike) : "—"}
                    </td>
                    <td className={`px-4 py-3 font-mono ${valueClass}`}>
                      {isResult && valueRaw >= 0 ? "+" : ""}
                      {formatCurrency(valueRaw)}
                    </td>
                    <td
                      className={`px-4 py-3 font-mono font-semibold ${
                        pnlPositive ? "text-emerald-500" : "text-rose-500"
                      }`}
                      title="Premium × Quantity"
                    >
                      {pnlPositive ? "+" : ""}
                      {formatCurrency(pnl)}
                    </td>
                    <td className="px-4 py-3 text-on-surface-variant">
                      {formatExpiration(trade)}
                    </td>
                    <td className="px-4 py-3 text-on-surface-variant">
                      {trade.date}
                    </td>
                    {hasActions && (
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {onEdit && (
                            <button
                              onClick={() => onEdit(trade)}
                              className="p-1.5 rounded-md text-on-surface-variant/50 hover:text-primary hover:bg-primary/10 transition-all"
                              title="تعديل الصفقة"
                            >
                              <Icon name="edit" className="!text-base" />
                            </button>
                          )}
                          {onDelete && (
                            <button
                              onClick={() => onDelete(trade)}
                              className="p-1.5 rounded-md text-on-surface-variant/50 hover:text-rose-500 hover:bg-rose-500/10 transition-all"
                              title="حذف الصفقة"
                            >
                              <Icon name="delete" className="!text-base" />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
