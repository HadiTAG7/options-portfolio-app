"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { Icon } from "@/components/ui/icon";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { AddPartnerDialog } from "@/components/ui/add-partner-dialog";
import { EditPartnerDialog } from "@/components/ui/edit-partner-dialog";
import { WithdrawalDialog } from "@/components/ui/withdrawal-dialog";
import { Sparkline } from "@/components/ui/sparkline";
import { CardSkeleton, TableRowSkeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatPercent } from "@/lib/utils";
import {
  computeFundBreakdown,
  computePartnerProfits,
} from "@/lib/partner-profit";
import { usePartners } from "@/hooks/use-partners";
import { useTrades } from "@/hooks/use-trades";
import { usePartnersStore } from "@/store/partners-store";
import type { Partner } from "@/types";

export default function PartnersPage() {
  const {
    partners,
    loading,
    error,
    totalAssets,
    deletePartner,
    addPartner,
    updatePartner,
    refetch,
  } = usePartners();
  const { trades } = useTrades();
  const fundBreakdown = computeFundBreakdown(partners, totalAssets);
  // Distribute every trade's PnL (premium × quantity for open options,
  // stored result for closed) across eligible partners — where a partner
  // is eligible only if their entry_date is <= the trade's close date.
  // GP/LP fee flow is applied on top. This makes the table react live
  // to new trades without any manual balance edits.
  const profitByPartner = useMemo(
    () => computePartnerProfits(partners, trades),
    [partners, trades]
  );
  // Fund-level total profit = sum of all trade PnL (before fee
  // redistribution — fees are internal transfers, so gross sums to the
  // same total). This replaces the old balance-minus-deposits fallback
  // so the header card matches the per-partner table rows.
  const fundTotalProfit = useMemo(
    () =>
      Object.values(profitByPartner).reduce(
        (sum, p) => sum + p.grossProfit,
        0
      ),
    [profitByPartner]
  );
  const { handleWithdrawal, capitalizeProfits, notification, clearNotification } =
    usePartnersStore();
  const [deleteTarget, setDeleteTarget] = useState<Partner | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [withdrawTarget, setWithdrawTarget] = useState<Partner | null>(null);
  const [editTarget, setEditTarget] = useState<Partner | null>(null);

  // Auto-dismiss success notification
  useEffect(() => {
    if (!notification) return;
    const timer = setTimeout(clearNotification, 4000);
    return () => clearTimeout(timer);
  }, [notification, clearNotification]);

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    await deletePartner(deleteTarget.id);
    setDeleting(false);
    setDeleteTarget(null);
  }

  async function onWithdraw(partner: Partner, amount: number) {
    await handleWithdrawal(partner, amount, refetch);
  }

  async function onCapitalize(partner: Partner) {
    await capitalizeProfits(partner, refetch);
  }

  const generatedPositive = fundTotalProfit >= 0;

  return (
    <AppShell>
      {/* Add Partner Dialog */}
      <AddPartnerDialog
        open={showAddDialog}
        onClose={() => setShowAddDialog(false)}
        onSubmit={addPartner}
      />

      {/* Edit Partner Dialog */}
      <EditPartnerDialog
        open={editTarget !== null}
        partner={editTarget}
        onClose={() => setEditTarget(null)}
        onSubmit={updatePartner}
      />

      {/* Withdrawal Dialog */}
      <WithdrawalDialog
        open={withdrawTarget !== null}
        partner={withdrawTarget}
        remainingProfit={
          withdrawTarget
            ? (profitByPartner[withdrawTarget.id]?.netProfit ?? 0)
            : 0
        }
        onClose={() => setWithdrawTarget(null)}
        onSubmit={onWithdraw}
        onCapitalize={onCapitalize}
      />

      {/* Confirmation Dialog */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="حذف الشريك"
        description={
          deleteTarget
            ? `هل أنت متأكد من حذف "${deleteTarget.name}" من المحفظة؟ سيتم إزالة رصيده (${formatCurrency(deleteTarget.totalBalance)}) وإعادة حساب نسب الملكية لجميع الشركاء المتبقين.`
            : ""
        }
        confirmLabel={deleting ? "جاري الحذف..." : "تأكيد الحذف"}
        onConfirm={handleDelete}
        onCancel={() => !deleting && setDeleteTarget(null)}
      />

      {/* Success Notification */}
      {notification?.type === "success" && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-300 backdrop-blur-sm shadow-[0_0_30px_-12px_rgba(52,211,153,0.4)]">
          <Icon name="check_circle" className="!text-xl text-emerald-400" />
          <span className="flex-1">{notification.message}</span>
          <button
            onClick={clearNotification}
            className="rounded-md p-1 text-emerald-300/60 transition-colors hover:bg-white/5 hover:text-emerald-300"
          >
            <Icon name="close" className="!text-base" />
          </button>
        </div>
      )}

      {/* Error Banner */}
      {(error || notification?.type === "error") && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300 backdrop-blur-sm">
          <Icon name="error" className="!text-xl text-rose-400" />
          <span>{error || notification?.message}</span>
        </div>
      )}

      {/* Header Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
        {loading ? (
          <>
            <div className="md:col-span-2">
              <CardSkeleton />
            </div>
            <CardSkeleton />
          </>
        ) : (
          <>
            {/* Total Partner Assets */}
            <div
              className="group relative md:col-span-2 overflow-hidden rounded-xl border border-zinc-800/60 bg-gradient-to-br from-zinc-900/80 via-zinc-900/60 to-zinc-950/90 p-6 backdrop-blur-sm transition-all duration-300 hover:border-emerald-500/30 hover:shadow-[0_0_40px_-12px_rgba(52,211,153,0.35)]"
              title={`رأس المال الأساسي: ${formatCurrency(fundBreakdown.originalCapital)} — الأرباح المحققة من الصفقات: ${formatCurrency(fundTotalProfit)}`}
            >
              <div className="pointer-events-none absolute -top-24 -right-16 h-56 w-56 rounded-full bg-emerald-500/10 blur-3xl transition-opacity duration-300 group-hover:bg-emerald-500/20" />
              <div className="pointer-events-none absolute -right-4 -top-4 text-zinc-800/40">
                <Icon name="account_balance_wallet" className="!text-8xl" />
              </div>
              <div className="relative flex h-full flex-col justify-between gap-4">
                <span className="text-[10px] uppercase tracking-[0.22em] text-zinc-500 font-semibold">
                  إجمالي أصول الشركاء · Total Partner Assets
                </span>
                <div className="flex items-baseline gap-3">
                  <span className="text-4xl font-headline font-light tracking-tight text-white font-mono tabular-nums">
                    {formatCurrency(totalAssets)}
                  </span>
                </div>
                <div className="flex items-center gap-5 text-[10px]">
                  <span className="text-zinc-500">
                    <span className="opacity-70">رأس المال:</span>{" "}
                    <span className="text-zinc-200 font-mono tabular-nums">
                      {formatCurrency(fundBreakdown.originalCapital)}
                    </span>
                  </span>
                  <span
                    className={`font-mono tabular-nums font-bold ${
                      generatedPositive ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    <span className="opacity-70 font-normal">أرباح:</span>{" "}
                    {generatedPositive ? "+" : ""}
                    {formatCurrency(fundTotalProfit)}
                  </span>
                </div>
              </div>
            </div>

            {/* Total Partners Count */}
            <div className="group relative overflow-hidden rounded-xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/15 via-emerald-500/5 to-zinc-950/90 p-6 backdrop-blur-sm transition-all duration-300 hover:border-emerald-400/50 hover:shadow-[0_0_40px_-12px_rgba(52,211,153,0.5)]">
              <div className="pointer-events-none absolute -top-24 -right-16 h-56 w-56 rounded-full bg-emerald-500/20 blur-3xl transition-opacity duration-300 group-hover:bg-emerald-500/30" />
              <div className="pointer-events-none absolute -right-4 -top-4 text-emerald-500/15">
                <Icon name="group" className="!text-8xl" />
              </div>
              <div className="relative flex h-full flex-col justify-between gap-4">
                <span className="text-[10px] uppercase tracking-[0.22em] text-emerald-400/80 font-semibold">
                  إجمالي الشركاء · Total Partners
                </span>
                <div className="flex items-baseline gap-3">
                  <span className="text-5xl font-headline font-black tracking-tight text-white tabular-nums">
                    {partners.length}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-emerald-300/70 uppercase tracking-widest font-semibold">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.9)]" />
                  <span>نشطين</span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Partners Table */}
      <section className="relative overflow-hidden rounded-xl border border-zinc-800/60 bg-gradient-to-br from-zinc-900/80 to-zinc-950/90 backdrop-blur-sm">
        {/* Table Header */}
        <div className="px-6 py-4 border-b border-zinc-800/60 flex justify-between items-center bg-zinc-900/60">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-emerald-500/10 border border-emerald-500/20">
              <Icon name="group" className="text-emerald-400 !text-base" />
            </div>
            <h2 className="text-sm font-headline font-bold text-white tracking-[0.18em] uppercase">
              قائمة الشركاء
            </h2>
            <span className="inline-flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 font-bold uppercase tracking-widest">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
              النشطين
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="rounded-md p-2 text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-200"
              title="Filter"
            >
              <Icon name="filter_list" className="!text-lg" />
            </button>
            <button
              onClick={() => setShowAddDialog(true)}
              className="group relative flex items-center gap-1.5 rounded-md bg-emerald-500 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-950 shadow-[0_0_20px_-6px_rgba(52,211,153,0.7)] transition-all duration-200 hover:bg-emerald-400 hover:scale-[1.03] active:scale-95"
            >
              <Icon name="add" className="!text-sm" />
              إضافة شريك جديد
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-right">
            <thead className="sticky top-0 z-10">
              <tr className="text-[10px] text-zinc-500 uppercase tracking-[0.2em] bg-zinc-950/80 backdrop-blur">
                <th className="px-6 py-4 font-semibold">الاسم والتعريف</th>
                <th className="px-6 py-4 font-semibold">الرصيد الكلي</th>
                <th className="px-6 py-4 font-semibold">نسبة الملكية</th>
                <th className="px-6 py-4 font-semibold">إجمالي الربح</th>
                <th className="px-6 py-4 font-semibold">رسوم الإدارة</th>
                <th className="px-6 py-4 font-semibold">الأرباح المتبقية</th>
                <th className="px-6 py-4 font-semibold">الأداء</th>
                <th className="px-6 py-4 font-semibold text-left">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {/* Loading State */}
              {loading && (
                <>
                  <TableRowSkeleton cols={8} />
                  <TableRowSkeleton cols={8} />
                  <TableRowSkeleton cols={8} />
                </>
              )}

              {/* Empty State */}
              {!loading && partners.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-20 text-center">
                    <Icon
                      name="group_off"
                      className="!text-5xl text-zinc-700 mb-3 block mx-auto"
                    />
                    <p className="text-sm text-zinc-300">
                      لا يوجد شركاء في المحفظة
                    </p>
                    <p className="text-[10px] text-zinc-500 mt-1">
                      قم بإضافة شريك جديد للبدء
                    </p>
                  </td>
                </tr>
              )}

              {/* Data Rows */}
              {!loading &&
                partners.map((partner) => {
                  const profit = profitByPartner[partner.id] ?? {
                    ownershipPct: 0,
                    grossProfit: 0,
                    feeAmount: 0,
                    isManager: false,
                    netProfit: 0,
                    returnPct: 0,
                  };
                  const profitPositive = profit.netProfit >= 0;
                  const perfPositive = partner.performance24h >= 0;
                  return (
                    <tr
                      key={partner.id}
                      className="group transition-colors hover:bg-white/[0.03]"
                    >
                      {/* Name & ID */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 border border-emerald-500/30 text-xs font-bold text-emerald-400 shadow-[0_0_12px_-4px_rgba(52,211,153,0.4)]">
                            {partner.initials}
                          </div>
                          <div className="flex flex-col">
                            <span className="text-sm text-white font-semibold">
                              {partner.name}
                            </span>
                            <span className="text-[10px] text-zinc-500 font-mono tracking-wider">
                              {partner.code}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Balance */}
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="text-sm font-headline font-semibold text-white font-mono tabular-nums">
                            {formatCurrency(
                              partner.currentBalance || partner.totalBalance
                            )}
                          </span>
                          <span
                            className={`text-[10px] font-bold tabular-nums ${
                              perfPositive ? "text-emerald-400" : "text-rose-400"
                            }`}
                          >
                            {formatPercent(partner.performance24h)}
                          </span>
                        </div>
                      </td>

                      {/* Ownership Percentage */}
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1.5">
                          <span className="text-sm font-headline font-semibold text-white tabular-nums">
                            {partner.ownershipPercentage.toFixed(1)}%
                          </span>
                          <div className="h-1 w-24 overflow-hidden rounded-full bg-zinc-800/80">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)] transition-all duration-500"
                              style={{
                                width: `${Math.max(0, Math.min(100, partner.ownershipPercentage))}%`,
                              }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* 1 · Gross Profit — organic share before fees */}
                      <td className="px-6 py-4">
                        <span
                          className={`text-sm font-mono tabular-nums font-bold ${
                            profit.grossProfit >= 0
                              ? "text-white"
                              : "text-rose-400"
                          }`}
                        >
                          {profit.grossProfit >= 0 ? "+" : ""}
                          {formatCurrency(profit.grossProfit)}
                        </span>
                      </td>

                      {/* 2 · Management Fee — red (LP paid) or green (GP collected) */}
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span
                            className={`text-sm font-mono tabular-nums font-bold ${
                              profit.isManager
                                ? "text-emerald-400"
                                : "text-rose-400"
                            }`}
                            title={
                              profit.isManager
                                ? "الرسوم المحصّلة من جميع الشركاء المحدودين"
                                : `رسوم الإدارة بنسبة ${partner.managementFeeRate.toFixed(2)}%`
                            }
                          >
                            {profit.isManager ? "+" : "-"}
                            {formatCurrency(Math.abs(profit.feeAmount))}
                          </span>
                          <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold">
                            {profit.isManager
                              ? "محصّلة (GP)"
                              : `مدفوعة · ${partner.managementFeeRate.toFixed(0)}%`}
                          </span>
                        </div>
                      </td>

                      {/* 3 · Remaining Profit — gross ∓ fee flow */}
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span
                            className={`text-sm font-headline font-bold font-mono tabular-nums ${
                              profitPositive
                                ? "text-emerald-400"
                                : "text-rose-400"
                            }`}
                          >
                            {profitPositive ? "+" : ""}
                            {formatCurrency(profit.netProfit)}
                          </span>
                          <span
                            className={`text-[10px] font-bold tabular-nums ${
                              profitPositive
                                ? "text-emerald-400/70"
                                : "text-rose-400/70"
                            }`}
                          >
                            {formatPercent(profit.returnPct)}
                          </span>
                        </div>
                      </td>

                      {/* Sparkline */}
                      <td className="px-6 py-4">
                        <Sparkline
                          data={partner.balanceHistory}
                          fallbackTrend={perfPositive ? "up" : "down"}
                        />
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-4 text-left">
                        <div className="flex items-center gap-1.5 justify-end">
                          <button
                            onClick={() => setEditTarget(partner)}
                            className="rounded-md border border-zinc-800/60 p-1.5 text-zinc-500 transition-all duration-200 hover:scale-[1.05] hover:border-emerald-500/30 hover:bg-emerald-500/5 hover:text-emerald-400"
                            title="تعديل بيانات الشريك"
                          >
                            <Icon name="edit" className="!text-base" />
                          </button>
                          <button
                            onClick={() => setWithdrawTarget(partner)}
                            className="flex items-center gap-1 rounded-md border border-rose-500/20 bg-rose-500/5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-rose-300 transition-all duration-200 hover:scale-[1.03] hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-200"
                            title="سحب أموال"
                          >
                            <Icon
                              name="account_balance"
                              className="!text-xs"
                            />
                            سحب
                          </button>
                          <Link
                            href={`/partners/${partner.id}`}
                            className="rounded-md border border-emerald-500/20 bg-emerald-500/5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-emerald-400 transition-all duration-200 hover:scale-[1.03] hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-300"
                          >
                            عرض التفاصيل
                          </Link>
                          <button
                            onClick={() => setDeleteTarget(partner)}
                            className="rounded-md border border-zinc-800/60 p-1.5 text-zinc-500 transition-all duration-200 hover:scale-[1.05] hover:border-rose-500/30 hover:bg-rose-500/5 hover:text-rose-400"
                            title="حذف الشريك"
                          >
                            <Icon name="delete" className="!text-base" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>

        {/* Footer / Pagination */}
        <div className="flex items-center justify-between border-t border-zinc-800/60 bg-zinc-950/60 px-4 py-3 text-[10px] uppercase tracking-widest font-semibold text-zinc-500">
          <span>
            عرض <span className="text-zinc-300 tabular-nums">{partners.length}</span> شريك
          </span>
          <div className="flex gap-4">
            <button className="transition-colors hover:text-zinc-200">
              السابق
            </button>
            <button className="text-emerald-400 transition-colors hover:text-emerald-300 font-bold">
              التالي
            </button>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
