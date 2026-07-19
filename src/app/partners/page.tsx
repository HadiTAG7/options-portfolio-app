"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { BookOpen } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Icon } from "@/components/ui/icon";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { AddPartnerDialog } from "@/components/ui/add-partner-dialog";
import { EditPartnerDialog } from "@/components/ui/edit-partner-dialog";
import { WithdrawalDialog } from "@/components/ui/withdrawal-dialog";
import { DepositDialog } from "@/components/ui/deposit-dialog";
import { PartnerLedgerDialog } from "@/components/ui/partner-ledger-dialog";
import { CardSkeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatPercent, getPartnerInvestment } from "@/lib/utils";
import {
  computePartnerDistributionFromTrades,
  isManagerPartner,
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
    deletePartner,
    addPartner,
    updatePartner,
    refetch,
  } = usePartners();
  const { trades, totalProfit } = useTrades();
  // Trade-based distribution — respects entry dates and last_settlement_date.
  // Used to gate the action buttons ("تثبيت" / "إيداع" / "سحب"): only the
  // profit that's actually sitting in the trade book can be capitalized.
  // After a partner runs "تثبيت الأرباح", their tradeDistribution.netProfit
  // resets to $0 until new trades close.
  const tradeDistribution = useMemo(
    () => computePartnerDistributionFromTrades(partners, trades),
    [partners, trades]
  );
  // Committed-capital total — Σ getPartnerInvestment. Anchors the
  // Investment column and is the denominator for ownership %.
  const investmentTotal = useMemo(
    () => partners.reduce((s, p) => s + getPartnerInvestment(p), 0),
    [partners]
  );
  // Column totals for the footer row. Everything is built from the
  // REALIZED trade distribution + committed capital — NOT from the
  // broker's live balance (totalAssets). Open-position mark-to-market
  // drift is unrealized and is deliberately excluded from every column
  // so the table reflects book value (cost basis + realized gains),
  // not liquidation value.
  //
  //   Current Balance = investment + realized netProfit
  //
  // Withdrawals need no extra term here: a capital withdrawal already
  // shrinks getPartnerInvestment (totalDeposits), and a profit
  // withdrawal stamps last_settlement_date so netProfit resets to $0 —
  // both leave Current Balance == the partner's true remaining stake.
  //
  // Fees are summed across LPs only — GP's feeAmount equals Σ LP fees
  // (collected = paid), so including both would double-count.
  const totals = useMemo(() => {
    const tradeRows = Object.values(tradeDistribution);
    const investment = tradeRows.reduce((s, d) => s + d.investment, 0);
    const net = tradeRows.reduce((s, d) => s + d.netProfit, 0);
    return {
      investment,
      ownership: tradeRows.reduce((s, d) => s + d.ownershipPct, 0),
      gross: tradeRows.reduce((s, d) => s + d.grossProfit, 0),
      fees: tradeRows
        .filter((d) => !d.isManager)
        .reduce((s, d) => s + d.feeAmount, 0),
      net,
      currentBalance: investment + net,
    };
  }, [tradeDistribution]);
  // The Total Partner Assets hero shows the sum of the Current Balance
  // column (Σ investment + Σ realized net), so the card and the footer
  // are guaranteed identical down to the cent. This intentionally
  // ignores the broker's live balance — unrealized drift is not booked.
  const totalCurrentBalanceSum = totals.currentBalance;
  // Fund-level total profit drives the header card. Using the single
  // `totalProfit` number keeps this page in lockstep with the trades
  // page summary cards — when one moves, both move.
  const fundTotalProfit = totalProfit;
  const {
    handleWithdrawal,
    capitalizeProfits,
    handleDeposit,
    notification,
    clearNotification,
  } = usePartnersStore();
  const [deleteTarget, setDeleteTarget] = useState<Partner | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [withdrawTarget, setWithdrawTarget] = useState<Partner | null>(null);
  const [depositTarget, setDepositTarget] = useState<Partner | null>(null);
  // Clean-Slate override: depositing while pending profit exists is
  // allowed, but only through an explicit warning confirm (the deposit
  // re-weights everyone's already-earned pending profit).
  const [depositWarnTarget, setDepositWarnTarget] = useState<Partner | null>(
    null
  );
  const [editTarget, setEditTarget] = useState<Partner | null>(null);
  const [ledgerTarget, setLedgerTarget] = useState<Partner | null>(null);
  const [capitalizeTarget, setCapitalizeTarget] = useState<Partner | null>(null);
  const [capitalizing, setCapitalizing] = useState(false);
  // Table search — toggled by the filter icon in the table header.
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

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

  // Settlement amounts use settleableNet, not netProfit:
  //  - LP: identical (gross − fee)
  //  - GP: gross only. LP fees are excluded from the GP's own
  //    settlements because they're credited automatically when each LP
  //    settles (feeTransferFor below) — settling gross+fees would
  //    double-pay and allow re-capitalizing the same fees repeatedly.
  function settleableFor(partnerId: string): number {
    return tradeDistribution[partnerId]?.settleableNet ?? 0;
  }

  // GP fee transfer accompanying an LP settlement. Null for the GP's
  // own settlements or when there's no fee to move.
  function feeTransferFor(partnerId: string) {
    const dist = tradeDistribution[partnerId];
    if (!dist || dist.isManager) return null;
    const gp = partners.find(isManagerPartner);
    if (!gp || dist.feeAmount <= 0) return null;
    const lp = partners.find((p) => p.id === partnerId);
    return {
      amount: dist.feeAmount,
      gpId: gp.id,
      lpId: partnerId,
      lpName: lp?.name ?? "",
    };
  }

  // Fund-wide Clean-Slate rule for deposits: a deposit changes
  // totalDeposits, and the distribution engine weights EVERY
  // unsettled historical trade by today's investments — so any deposit
  // retroactively re-weights (dilutes) OTHER partners' already-earned
  // pending profit. Depositing while pending profit exists is therefore
  // gated behind an explicit warning confirm (the GP may override —
  // settling everyone first stays the recommended order).
  const anyPendingProfit = useMemo(
    () =>
      Object.values(tradeDistribution).some((d) => d.settleableNet > 0),
    [tradeDistribution]
  );
  // Total unsettled profit across all partners — shown in the override
  // warning so the GP sees exactly what a mid-cycle deposit re-weights.
  const pendingUnsettledTotal = useMemo(
    () =>
      Object.values(tradeDistribution).reduce(
        (s, d) => s + Math.max(0, d.settleableNet),
        0
      ),
    [tradeDistribution]
  );

  // Rows actually rendered — name/code search from the header filter.
  const visiblePartners = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return partners;
    return partners.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.code ?? "").toLowerCase().includes(q)
    );
  }, [partners, searchQuery]);

  async function onWithdraw(partner: Partner, amount: number) {
    const availableProfit = Math.max(0, settleableFor(partner.id));
    await handleWithdrawal(
      partner,
      amount,
      availableProfit,
      refetch,
      feeTransferFor(partner.id)
    );
  }

  async function onCapitalize(partner: Partner) {
    const netProfit = settleableFor(partner.id);
    await capitalizeProfits(
      partner,
      netProfit,
      refetch,
      feeTransferFor(partner.id)
    );
  }

  async function onDeposit(partner: Partner, amount: number) {
    await handleDeposit(partner, amount, refetch);
  }

  async function handleCapitalizeConfirm() {
    if (!capitalizeTarget) return;
    const netProfit = settleableFor(capitalizeTarget.id);
    setCapitalizing(true);
    try {
      await capitalizeProfits(
        capitalizeTarget,
        netProfit,
        refetch,
        feeTransferFor(capitalizeTarget.id)
      );
      setCapitalizeTarget(null);
    } catch {
      // error surfaced via notification
    } finally {
      setCapitalizing(false);
    }
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
          withdrawTarget ? settleableFor(withdrawTarget.id) : 0
        }
        feeAmount={
          withdrawTarget
            ? (feeTransferFor(withdrawTarget.id)?.amount ?? 0)
            : 0
        }
        onClose={() => setWithdrawTarget(null)}
        onSubmit={onWithdraw}
        onCapitalize={onCapitalize}
      />

      {/* Deposit Dialog — new capital inflow */}
      <DepositDialog
        open={depositTarget !== null}
        partner={depositTarget}
        onClose={() => setDepositTarget(null)}
        onSubmit={onDeposit}
      />

      {/* Clean-Slate override — deposit requested while pending profit
          exists. Spell out the re-weighting consequence, then let the
          GP proceed deliberately. */}
      <ConfirmDialog
        open={depositWarnTarget !== null}
        title="إيداع مع وجود أرباح معلقة"
        description={
          depositWarnTarget ? (
            <div className="space-y-3 text-right">
              <div className="flex items-center justify-between rounded-md border border-amber-400/25 bg-amber-400/5 px-3 py-2 text-xs">
                <span className="text-zinc-300">
                  أرباح معلقة غير مثبتة (كل الشركاء)
                </span>
                <span className="font-mono font-bold tabular-nums text-amber-300">
                  {formatCurrency(pendingUnsettledTotal)}
                </span>
              </div>
              <p className="text-xs leading-relaxed text-zinc-400">
                الإيداع الآن يغيّر نسب الملكية، وبالتالي{" "}
                <span className="font-bold text-zinc-200">
                  يُعاد توزيع هذه الأرباح المعلقة
                </span>{" "}
                بالنسب الجديدة — أرباح انكسبت قبل دخول المبلغ الجديد.
              </p>
              <p className="text-xs leading-relaxed text-zinc-400">
                <span className="font-bold text-emerald-300">الأفضل:</span>{" "}
                ثبّت أرباح الجميع أولاً ثم أودع. أو تابع الآن كاستثناء
                واعٍ بالأثر.
              </p>
            </div>
          ) : (
            ""
          )
        }
        confirmLabel="متابعة الإيداع (استثناء)"
        onConfirm={() => {
          const p = depositWarnTarget;
          setDepositWarnTarget(null);
          setDepositTarget(p);
        }}
        onCancel={() => setDepositWarnTarget(null)}
      />

      {/* Partner Ledger Dialog — GP/LP distribution breakdown */}
      <PartnerLedgerDialog
        open={ledgerTarget !== null}
        partner={ledgerTarget}
        distribution={
          ledgerTarget
            ? (tradeDistribution[ledgerTarget.id] ?? null)
            : null
        }
        totalProfit={fundTotalProfit}
        partners={partners}
        onClose={() => setLedgerTarget(null)}
      />

      {/* Capitalize Profits Confirmation — full settlement preview:
          exactly which rows change and by how much, before the
          irreversible stamp. */}
      <ConfirmDialog
        open={capitalizeTarget !== null}
        title="تثبيت الأرباح"
        description={
          capitalizeTarget
            ? (() => {
                const dist = tradeDistribution[capitalizeTarget.id];
                const amount = Math.max(0, dist?.settleableNet ?? 0);
                const fee = feeTransferFor(capitalizeTarget.id);
                const gp = partners.find(isManagerPartner);
                const newCapital =
                  getPartnerInvestment(capitalizeTarget) + amount;
                return (
                  <div className="space-y-2 text-right">
                    <p className="mb-3 text-center">
                      معاينة التسوية — هذه العملية غير قابلة للتراجع:
                    </p>
                    <div className="flex items-center justify-between rounded-md border border-emerald-500/25 bg-emerald-500/5 px-3 py-2 text-xs">
                      <span className="text-zinc-300">
                        {capitalizeTarget.name} — يُثبت في رأس المال
                      </span>
                      <span className="font-mono font-bold tabular-nums text-emerald-300">
                        +{formatCurrency(amount)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-md border border-zinc-800/60 bg-zinc-950/40 px-3 py-2 text-xs">
                      <span className="text-zinc-500">
                        رأس ماله بعد التثبيت
                      </span>
                      <span className="font-mono tabular-nums text-zinc-200">
                        {formatCurrency(newCapital)}
                      </span>
                    </div>
                    {fee && gp && (
                      <div className="flex items-center justify-between rounded-md border border-cyan-400/25 bg-cyan-500/5 px-3 py-2 text-xs">
                        <span className="text-zinc-300">
                          {gp.name} (GP) — رسوم أداء تُقيد لرأس ماله
                        </span>
                        <span className="font-mono font-bold tabular-nums text-cyan-300">
                          +{formatCurrency(fee.amount)}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })()
            : ""
        }
        confirmLabel={capitalizing ? "جاري التثبيت..." : "تأكيد التثبيت"}
        onConfirm={handleCapitalizeConfirm}
        onCancel={() => !capitalizing && setCapitalizeTarget(null)}
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
            <div className="group relative md:col-span-2 overflow-hidden rounded-xl border border-zinc-800/60 bg-gradient-to-br from-zinc-900/80 via-zinc-900/60 to-zinc-950/90 p-6 backdrop-blur-sm transition-all duration-300 hover:border-emerald-500/30 hover:shadow-[0_0_40px_-12px_rgba(52,211,153,0.35)]">
              <div className="pointer-events-none absolute -top-24 -right-16 h-56 w-56 rounded-full bg-emerald-500/10 blur-3xl transition-opacity duration-300 group-hover:bg-emerald-500/20" />
              <div className="pointer-events-none absolute -right-4 -top-4 text-zinc-800/40">
                <Icon name="account_balance_wallet" className="!text-8xl" />
              </div>
              <div className="relative flex h-full flex-col justify-between gap-4">
                <span className="text-[10px] uppercase tracking-[0.22em] text-zinc-500 font-semibold">
                  إجمالي أصول الشركاء · Total Partner Assets
                </span>
                <div className="flex items-baseline gap-3">
                  <span
                    className="text-4xl font-headline font-light tracking-tight text-white font-mono tabular-nums"
                    title={`مجموع الرصيد الحالي = رأس المال (${formatCurrency(investmentTotal)}) + الأرباح المحققة (${formatCurrency(totals.net)})`}
                  >
                    {formatCurrency(totalCurrentBalanceSum)}
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

      {/* Toolbar — title, search, add */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/20">
            <Icon name="group" className="text-emerald-400 !text-lg" />
          </div>
          <div className="flex flex-col">
            <h2 className="text-sm font-headline font-bold text-white tracking-[0.18em] uppercase leading-none">
              قائمة الشركاء
            </h2>
            <span className="mt-1.5 text-[10px] uppercase tracking-widest text-zinc-500 font-semibold">
              Partners
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {searchOpen && (
            <input
              autoFocus
              dir="rtl"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setSearchQuery("");
                  setSearchOpen(false);
                }
              }}
              placeholder="بحث بالاسم أو الكود..."
              className="w-48 rounded-md border border-zinc-700/60 bg-zinc-950/80 px-3 py-2 text-xs text-white placeholder:text-zinc-600 focus:border-emerald-500/50 focus:outline-none"
            />
          )}
          <button
            onClick={() => {
              if (searchOpen) setSearchQuery("");
              setSearchOpen((v) => !v);
            }}
            className={`rounded-md p-2 transition-colors hover:bg-white/5 ${
              searchOpen || searchQuery
                ? "text-emerald-400"
                : "text-zinc-500 hover:text-zinc-200"
            }`}
            title="بحث في الشركاء"
          >
            <Icon name={searchOpen ? "close" : "search"} className="!text-lg" />
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

      {/* Loading — skeleton card grid */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && partners.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-zinc-800/60 bg-gradient-to-br from-zinc-900/70 to-zinc-950/90 px-6 py-20 text-center backdrop-blur-sm">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-zinc-800/70 bg-zinc-950/60">
            <Icon name="group_off" className="!text-4xl text-zinc-600" />
          </div>
          <p className="text-sm text-zinc-200 font-semibold">
            لا يوجد شركاء في المحفظة
          </p>
          <p className="mt-1 text-[11px] text-zinc-500">
            قم بإضافة شريك جديد للبدء
          </p>
          <button
            onClick={() => setShowAddDialog(true)}
            className="mt-5 flex items-center gap-1.5 rounded-md bg-emerald-500 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-950 shadow-[0_0_20px_-6px_rgba(52,211,153,0.7)] transition-all duration-200 hover:bg-emerald-400 hover:scale-[1.03] active:scale-95"
          >
            <Icon name="add" className="!text-sm" />
            إضافة شريك جديد
          </button>
        </div>
      )}

      {/* No search matches */}
      {!loading && partners.length > 0 && visiblePartners.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-zinc-800/60 bg-gradient-to-br from-zinc-900/70 to-zinc-950/90 px-6 py-16 text-center backdrop-blur-sm">
          <Icon name="search_off" className="!text-4xl text-zinc-700 mb-2" />
          <p className="text-sm text-zinc-300">
            لا توجد نتائج لـ &quot;{searchQuery}&quot;
          </p>
        </div>
      )}

      {/* Partner Cards */}
      {!loading && visiblePartners.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {visiblePartners.map((partner) => {
            // dist drives the REALIZED performance figures (Investment,
            // Ownership, GROSS, FEES, NET). It's the trade-based
            // distribution, so it reads $0 when no trade settled this
            // cycle — open-position mark-to-market never bleeds in.
            const dist = tradeDistribution[partner.id] ?? {
              partnerId: partner.id,
              investment: 0,
              ownershipPct: 0,
              grossProfit: 0,
              feeRatePct: 0,
              feeAmount: 0,
              netProfit: 0,
              isManager: false,
              returnPct: 0,
              collectedFromLps: [],
              settleableNet: 0,
            };
            // Gates the تثبيت/إيداع buttons. settleableNet, not
            // netProfit: for the GP, pending LP fees are not settleable
            // (they arrive via LP settlements), so they must not enable
            // another تثبيت.
            const tradeNet = dist.settleableNet;
            const profitPositive = dist.netProfit >= 0;
            // Current Balance = Investment + realized net profit. Equals
            // Investment exactly until a trade settles. Σ across all
            // cards == the AUM hero.
            const currentBalance = dist.investment + dist.netProfit;
            const isGP = dist.isManager;
            return (
              <article
                key={partner.id}
                className={`group relative flex flex-col overflow-hidden rounded-2xl border bg-gradient-to-br from-zinc-900/80 via-zinc-900/50 to-zinc-950/90 p-5 backdrop-blur-sm transition-all duration-300 ${
                  isGP
                    ? "border-amber-400/30 hover:border-amber-400/55 hover:shadow-[0_0_44px_-14px_rgba(251,191,36,0.45)]"
                    : "border-zinc-800/60 hover:border-emerald-500/40 hover:shadow-[0_0_44px_-14px_rgba(52,211,153,0.4)]"
                }`}
              >
                {/* Corner glow */}
                <div
                  className={`pointer-events-none absolute -top-20 -right-16 h-48 w-48 rounded-full blur-3xl transition-opacity duration-300 ${
                    isGP
                      ? "bg-amber-400/10 group-hover:bg-amber-400/20"
                      : "bg-emerald-500/[0.08] group-hover:bg-emerald-500/15"
                  }`}
                />

                {/* Header: avatar + name + edit/delete */}
                <div className="relative flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div
                      className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-bold shadow-[0_0_16px_-4px_rgba(52,211,153,0.4)] ${
                        isGP
                          ? "border border-amber-400/40 bg-gradient-to-br from-amber-400/25 to-amber-400/5 text-amber-300"
                          : "border border-emerald-500/30 bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 text-emerald-400"
                      }`}
                    >
                      {partner.initials}
                    </div>
                    <div className="flex min-w-0 flex-col">
                      <span className="flex items-center gap-1.5 text-[15px] font-bold text-white">
                        <span className="truncate">{partner.name}</span>
                        {isGP && (
                          <span
                            className="inline-flex shrink-0 items-center rounded-full border border-amber-400/40 bg-amber-400/10 px-1.5 py-[1px] text-[9px] font-bold uppercase tracking-widest text-amber-300"
                            title="General Partner · المدير العام"
                          >
                            GP
                          </span>
                        )}
                      </span>
                      <span className="font-mono text-[10px] tracking-wider text-zinc-500">
                        {partner.code}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1 opacity-70 transition-opacity group-hover:opacity-100">
                    <button
                      onClick={() => setEditTarget(partner)}
                      className="rounded-md border border-zinc-800/60 p-1.5 text-zinc-500 transition-all duration-200 hover:scale-[1.05] hover:border-emerald-500/30 hover:bg-emerald-500/5 hover:text-emerald-400"
                      title="تعديل بيانات الشريك"
                    >
                      <Icon name="edit" className="!text-base" />
                    </button>
                    <button
                      onClick={() => setDeleteTarget(partner)}
                      className="rounded-md border border-zinc-800/60 p-1.5 text-zinc-500 transition-all duration-200 hover:scale-[1.05] hover:border-rose-500/30 hover:bg-rose-500/5 hover:text-rose-400"
                      title="حذف الشريك"
                    >
                      <Icon name="delete" className="!text-base" />
                    </button>
                  </div>
                </div>

                {/* Primary stats: Current Balance (hero) + Investment */}
                <div className="relative mt-5 grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-zinc-800/60 bg-zinc-950/40 px-3.5 py-3">
                    <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                      الرصيد الحالي
                    </p>
                    <p
                      className={`mt-1 font-headline font-mono text-lg font-bold tabular-nums ${
                        profitPositive ? "text-white" : "text-rose-400"
                      }`}
                      title={`الاستثمار (${formatCurrency(dist.investment)}) ${profitPositive ? "+" : "−"} الربح المحقق (${formatCurrency(Math.abs(dist.netProfit))})`}
                    >
                      {formatCurrency(currentBalance)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-zinc-800/60 bg-zinc-950/40 px-3.5 py-3">
                    <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                      الاستثمار
                    </p>
                    <p className="mt-1 font-headline font-mono text-lg font-semibold tabular-nums text-zinc-200">
                      {formatCurrency(dist.investment)}
                    </p>
                  </div>
                </div>

                {/* Ownership bar */}
                <div className="relative mt-4">
                  <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
                    <span>نسبة الملكية</span>
                    <span className="font-mono tabular-nums text-zinc-300">
                      {dist.ownershipPct.toFixed(1)}%
                    </span>
                  </div>
                  <div
                    className="relative mt-2 h-[4px] w-full overflow-hidden rounded-full bg-zinc-900 ring-1 ring-inset ring-zinc-800/80"
                    title={`${dist.ownershipPct.toFixed(2)}%`}
                  >
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-600 via-emerald-500 to-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.55)] transition-all duration-700 ease-out"
                      style={{
                        width: `${Math.max(0, Math.min(100, dist.ownershipPct))}%`,
                      }}
                    />
                  </div>
                </div>

                {/* Gross / Fees / Net breakdown */}
                <div className="relative mt-4 grid grid-cols-3 rounded-xl border border-zinc-800/50 bg-zinc-950/30 p-3">
                  <div className="flex flex-col gap-1 pl-2">
                    <span className="text-[9px] font-semibold uppercase tracking-widest text-zinc-500">
                      إجمالي
                    </span>
                    <span
                      className={`font-mono text-xs font-bold tabular-nums ${
                        dist.grossProfit >= 0 ? "text-white" : "text-rose-500"
                      }`}
                    >
                      {dist.grossProfit >= 0 ? "+" : ""}
                      {formatCurrency(dist.grossProfit)}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1 border-x border-zinc-800/40 px-2">
                    <span className="text-[9px] font-semibold uppercase tracking-widest text-zinc-500">
                      {isGP ? "رسوم (GP)" : `رسوم · ${dist.feeRatePct.toFixed(0)}%`}
                    </span>
                    <span
                      className={`font-mono text-xs font-bold tabular-nums ${
                        isGP ? "text-amber-300" : "text-rose-400"
                      }`}
                      title={
                        isGP
                          ? "الرسوم المحصّلة من جميع الشركاء المحدودين"
                          : `رسوم الأداء بنسبة ${dist.feeRatePct.toFixed(2)}%`
                      }
                    >
                      {isGP ? "+" : "-"}
                      {formatCurrency(Math.abs(dist.feeAmount))}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1 pr-2">
                    <span className="text-[9px] font-semibold uppercase tracking-widest text-zinc-500">
                      صافي {formatPercent(dist.returnPct)}
                    </span>
                    <span
                      className={`font-mono text-xs font-bold tabular-nums ${
                        profitPositive ? "text-emerald-400" : "text-rose-500"
                      }`}
                    >
                      {profitPositive ? "+" : ""}
                      {formatCurrency(dist.netProfit)}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="relative mt-auto flex flex-col gap-2 pt-4">
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => setCapitalizeTarget(partner)}
                      disabled={tradeNet <= 0}
                      className="flex items-center justify-center gap-1 rounded-md border border-amber-400/25 bg-amber-400/5 px-2 py-2 text-[10px] font-bold uppercase tracking-widest text-amber-300 transition-all duration-200 hover:scale-[1.03] hover:border-amber-400/50 hover:bg-amber-400/10 hover:text-amber-200 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100 disabled:hover:border-amber-400/25 disabled:hover:bg-amber-400/5 disabled:hover:text-amber-300"
                      title={
                        tradeNet > 0
                          ? "تثبيت الأرباح وتحويلها إلى رأس المال"
                          : "لا توجد أرباح للتثبيت"
                      }
                    >
                      <Icon name="savings" className="!text-xs" />
                      تثبيت
                    </button>
                    <button
                      onClick={() =>
                        anyPendingProfit
                          ? setDepositWarnTarget(partner)
                          : setDepositTarget(partner)
                      }
                      className="flex items-center justify-center gap-1 rounded-md border border-emerald-500/25 bg-emerald-500/5 px-2 py-2 text-[10px] font-bold uppercase tracking-widest text-emerald-300 transition-all duration-200 hover:scale-[1.03] hover:border-emerald-500/50 hover:bg-emerald-500/10 hover:text-emerald-200"
                      title={
                        anyPendingProfit
                          ? "يوجد أرباح معلقة — سيظهر تحذير قبل المتابعة"
                          : "إيداع رأس مال جديد"
                      }
                    >
                      <Icon name="add" className="!text-xs" />
                      إيداع
                    </button>
                    <button
                      onClick={() => setWithdrawTarget(partner)}
                      className="flex items-center justify-center gap-1 rounded-md border border-rose-500/20 bg-rose-500/5 px-2 py-2 text-[10px] font-bold uppercase tracking-widest text-rose-300 transition-all duration-200 hover:scale-[1.03] hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-200"
                      title="سحب أموال"
                    >
                      <Icon name="account_balance" className="!text-xs" />
                      سحب
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setLedgerTarget(partner)}
                      className="flex items-center justify-center gap-1.5 rounded-md border border-cyan-400/25 bg-cyan-500/5 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-cyan-300 transition-all duration-200 hover:scale-[1.02] hover:border-cyan-400/50 hover:bg-cyan-500/10 hover:text-cyan-200"
                      title="عرض كشف الحساب"
                    >
                      <BookOpen size={11} />
                      كشف الحساب
                    </button>
                    <Link
                      href={`/partners/details?id=${partner.id}`}
                      className="flex items-center justify-center gap-1.5 rounded-md border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-emerald-400 transition-all duration-200 hover:scale-[1.02] hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-300"
                    >
                      <Icon name="arrow_forward" className="!text-xs" />
                      التفاصيل
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Portfolio Totals ribbon */}
      {!loading && partners.length > 0 && (
        <div className="mt-6 overflow-hidden rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-zinc-900/80 to-zinc-950/90 backdrop-blur-sm">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-4 px-6 py-4">
            <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-400">
              الإجمالي · Portfolio Total
            </span>
            <div className="flex flex-col">
              <span className="text-[9px] font-semibold uppercase tracking-widest text-zinc-500">
                الاستثمار
              </span>
              <span className="font-headline font-mono text-sm font-bold tabular-nums text-white">
                {formatCurrency(totals.investment)}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-[9px] font-semibold uppercase tracking-widest text-zinc-500">
                الملكية
              </span>
              <span className="font-mono text-sm font-bold tabular-nums text-white">
                {totals.ownership.toFixed(1)}%
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-[9px] font-semibold uppercase tracking-widest text-zinc-500">
                إجمالي الربح
              </span>
              <span
                className={`font-mono text-sm font-bold tabular-nums ${
                  totals.gross >= 0 ? "text-white" : "text-rose-500"
                }`}
              >
                {totals.gross >= 0 ? "+" : ""}
                {formatCurrency(totals.gross)}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-[9px] font-semibold uppercase tracking-widest text-zinc-500">
                الرسوم
              </span>
              <span
                className="font-mono text-sm font-bold tabular-nums text-amber-300"
                title="إجمالي رسوم الأداء المدفوعة من LPs (يساوي ما حصّله GP)"
              >
                {formatCurrency(totals.fees)}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-[9px] font-semibold uppercase tracking-widest text-zinc-500">
                صافي الربح
              </span>
              <span
                className={`font-headline font-mono text-sm font-bold tabular-nums ${
                  totals.net >= 0 ? "text-emerald-500" : "text-rose-500"
                }`}
              >
                {totals.net >= 0 ? "+" : ""}
                {formatCurrency(totals.net)}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-[9px] font-semibold uppercase tracking-widest text-zinc-500">
                الرصيد الحالي
              </span>
              <span
                className="font-headline font-mono text-sm font-bold tabular-nums text-white"
                title={`يطابق إجمالي أصول الشركاء (${formatCurrency(totalCurrentBalanceSum)})`}
              >
                {formatCurrency(totals.currentBalance)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Footer count */}
      {!loading && partners.length > 0 && (
        <div className="mt-4 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
          عرض{" "}
          <span className="tabular-nums text-zinc-300">
            {visiblePartners.length}
          </span>{" "}
          {searchQuery ? `من ${partners.length} ` : ""}شريك
        </div>
      )}
    </AppShell>
  );
}
