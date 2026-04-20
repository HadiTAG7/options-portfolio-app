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
  computeCurrentCycleProfits,
} from "@/lib/partner-profit";
import { usePartners } from "@/hooks/use-partners";
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
  const fundBreakdown = computeFundBreakdown(partners, totalAssets);
  // Table shows current-cycle profit only: equity − deposits, with GP/LP
  // fee flow applied on top. Capitalizing collapses gross to $0 because
  // "تثبيت الأرباح" sets totalDeposits = currentBalance. All-time history
  // lives on the Partner Details page via stored columns.
  const profitByPartner = useMemo(
    () => computeCurrentCycleProfits(partners),
    [partners]
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
        <div className="mb-6 p-4 bg-primary/10 border border-primary/30 rounded-sm text-sm text-primary flex items-center gap-3">
          <Icon name="check_circle" className="!text-xl" />
          <span className="flex-1">{notification.message}</span>
          <button
            onClick={clearNotification}
            className="text-primary/60 hover:text-primary transition-colors"
          >
            <Icon name="close" className="!text-base" />
          </button>
        </div>
      )}

      {/* Error Banner */}
      {(error || notification?.type === "error") && (
        <div className="mb-6 p-4 bg-secondary/10 border border-secondary/30 rounded-sm text-sm text-secondary flex items-center gap-3">
          <Icon name="error" className="!text-xl" />
          <span>{error || notification?.message}</span>
        </div>
      )}

      {/* Header Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
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
              className="md:col-span-2 bg-surface-container p-6 rounded-sm border-r-2 border-primary glow-primary flex flex-col justify-between h-32 relative overflow-hidden group"
              title={`رأس المال الأساسي: ${formatCurrency(fundBreakdown.originalCapital)} — الأرباح المحققة: ${formatCurrency(fundBreakdown.generatedProfit)}`}
            >
              <div className="absolute -right-4 -top-4 opacity-5">
                <Icon name="account_balance_wallet" className="!text-8xl" />
              </div>
              <span className="text-[10px] uppercase tracking-widest text-on-surface-variant font-label">
                إجمالي أصول الشركاء (Total Partner Assets)
              </span>
              <div className="flex items-baseline gap-3">
                <span className="text-3xl font-headline font-light tracking-tighter text-on-surface">
                  {formatCurrency(totalAssets)}
                </span>
              </div>
              <div className="flex items-center gap-4 text-[10px] mt-1">
                <span className="text-on-surface-variant">
                  <span className="opacity-60">رأس المال:</span>{" "}
                  <span className="text-white font-mono">
                    {formatCurrency(fundBreakdown.originalCapital)}
                  </span>
                </span>
                <span
                  className={`font-mono font-bold ${
                    fundBreakdown.generatedProfit >= 0
                      ? "text-primary"
                      : "text-secondary"
                  }`}
                >
                  <span className="opacity-60 font-normal">أرباح:</span>{" "}
                  {fundBreakdown.generatedProfit >= 0 ? "+" : ""}
                  {formatCurrency(fundBreakdown.generatedProfit)}
                </span>
              </div>
            </div>

            {/* Total Partners Count */}
            <div className="bg-primary p-6 rounded-sm flex flex-col justify-between h-32 relative overflow-hidden">
              <div className="absolute -right-4 -top-4 opacity-10 text-on-primary">
                <Icon name="group" className="!text-8xl" />
              </div>
              <span className="text-[10px] uppercase tracking-widest text-on-primary/70 font-label">
                إجمالي الشركاء (Total Partners)
              </span>
              <div>
                <span className="text-4xl font-headline font-black tracking-tighter text-on-primary">
                  {partners.length}
                </span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Partners Table */}
      <section className="bg-surface-container rounded-sm overflow-hidden border border-white/5">
        {/* Table Header */}
        <div className="px-6 py-4 border-b border-white/5 flex justify-between items-center bg-surface-container-high">
          <div className="flex items-center gap-3">
            <Icon name="group" className="text-primary" />
            <h2 className="text-sm font-headline font-bold text-white tracking-widest uppercase">
              قائمة الشركاء
            </h2>
            <span className="text-[9px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-bold uppercase">
              النشطين
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button className="p-2 rounded-sm hover:bg-white/5 transition-colors text-on-surface-variant">
              <Icon name="filter_list" className="!text-lg" />
            </button>
            <button
              onClick={() => setShowAddDialog(true)}
              className="text-[10px] px-4 py-2 bg-primary text-on-primary rounded-sm font-bold uppercase tracking-widest hover:brightness-110 transition-all flex items-center gap-1.5"
            >
              <Icon name="add" className="!text-sm" />
              إضافة شريك جديد
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-right">
            <thead>
              <tr className="text-[10px] text-on-surface-variant uppercase tracking-widest bg-surface-container-low">
                <th className="px-6 py-4 font-medium">الاسم والتعريف</th>
                <th className="px-6 py-4 font-medium">الرصيد الكلي</th>
                <th className="px-6 py-4 font-medium">نسبة الملكية</th>
                <th className="px-6 py-4 font-medium">إجمالي الربح</th>
                <th className="px-6 py-4 font-medium">رسوم الإدارة</th>
                <th className="px-6 py-4 font-medium">الأرباح المتبقية</th>
                <th className="px-6 py-4 font-medium">الأداء</th>
                <th className="px-6 py-4 font-medium text-left">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
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
                  <td colSpan={8} className="px-6 py-16 text-center">
                    <Icon
                      name="group_off"
                      className="!text-5xl text-on-surface-variant/30 mb-3 block mx-auto"
                    />
                    <p className="text-sm text-on-surface-variant">
                      لا يوجد شركاء في المحفظة
                    </p>
                    <p className="text-[10px] text-on-surface-variant/60 mt-1">
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
                  return (
                  <tr
                    key={partner.id}
                    className="hover:bg-white/[0.02] transition-colors"
                  >
                    {/* Name & ID */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                          {partner.initials}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm text-white font-bold">
                            {partner.name}
                          </span>
                          <span className="text-[10px] text-on-surface-variant font-mono">
                            {partner.code}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Balance */}
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-sm font-headline font-medium text-white">
                          {formatCurrency(
                            partner.currentBalance || partner.totalBalance
                          )}
                        </span>
                        <span
                          className={`text-[10px] font-bold ${
                            partner.performance24h >= 0
                              ? "text-primary"
                              : "text-secondary"
                          }`}
                        >
                          {formatPercent(partner.performance24h)}
                        </span>
                      </div>
                    </td>

                    {/* Ownership Percentage */}
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1.5">
                        <span className="text-sm font-headline font-medium text-white">
                          {partner.ownershipPercentage.toFixed(1)}%
                        </span>
                        <div className="w-24 h-1 bg-white/5 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full transition-all duration-500"
                            style={{
                              width: `${Math.max(0, Math.min(100, partner.ownershipPercentage))}%`,
                            }}
                          />
                        </div>
                      </div>
                    </td>

                    {/* 1 · Gross Profit — organic share before fees */}
                    <td className="px-6 py-4">
                      <span className="text-sm font-mono font-bold text-white">
                        {profit.grossProfit >= 0 ? "+" : ""}
                        {formatCurrency(profit.grossProfit)}
                      </span>
                    </td>

                    {/* 2 · Management Fee — red (LP paid) or green (GP collected) */}
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span
                          className={`text-sm font-mono font-bold ${
                            profit.isManager
                              ? "text-emerald-500"
                              : "text-rose-500"
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
                        <span className="text-[10px] uppercase tracking-widest text-on-surface-variant/60">
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
                          className={`text-sm font-headline font-bold font-mono ${
                            profitPositive ? "text-primary" : "text-secondary"
                          }`}
                        >
                          {profitPositive ? "+" : ""}
                          {formatCurrency(profit.netProfit)}
                        </span>
                        <span
                          className={`text-[10px] font-bold ${
                            profitPositive
                              ? "text-primary/70"
                              : "text-secondary/70"
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
                        fallbackTrend={
                          partner.performance24h >= 0 ? "up" : "down"
                        }
                      />
                    </td>

                    {/* Actions */}
                    <td className="px-6 py-4 text-left">
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          onClick={() => setEditTarget(partner)}
                          className="p-1.5 rounded-sm border border-white/5 text-on-surface-variant/60 hover:text-primary hover:border-primary/30 hover:bg-primary/5 transition-colors"
                          title="تعديل بيانات الشريك"
                        >
                          <Icon name="edit" className="!text-base" />
                        </button>
                        <button
                          onClick={() => setWithdrawTarget(partner)}
                          className="text-[10px] px-3 py-1.5 rounded-sm border border-secondary/20 text-secondary/80 hover:text-secondary hover:border-secondary/40 hover:bg-secondary/5 transition-colors uppercase tracking-widest font-bold flex items-center gap-1"
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
                          className="text-[10px] px-3 py-1.5 rounded-sm border border-white/10 text-on-surface-variant hover:text-primary hover:border-primary/30 transition-colors uppercase tracking-widest font-bold"
                        >
                          عرض التفاصيل
                        </Link>
                        <button
                          onClick={() => setDeleteTarget(partner)}
                          className="p-1.5 rounded-sm border border-white/5 text-on-surface-variant/40 hover:text-secondary hover:border-secondary/30 hover:bg-secondary/5 transition-all group"
                          title="حذف الشريك"
                        >
                          <Icon
                            name="delete"
                            className="!text-base group-hover:!font-[600]"
                          />
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
        <div className="p-4 bg-surface-container-low flex justify-between items-center text-[10px] text-on-surface-variant">
          <span>عرض {partners.length} شريك</span>
          <div className="flex gap-4">
            <button className="hover:text-white transition-colors">
              السابق
            </button>
            <button className="text-primary font-black">التالي</button>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
