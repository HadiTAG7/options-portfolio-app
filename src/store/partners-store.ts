"use client";

import { create } from "zustand";
import { supabase } from "@/lib/supabase";
import { safeNumber, formatCurrency, getPartnerInvestment } from "@/lib/utils";
import type { Partner } from "@/types";
import type { PartnerRow, BalanceHistoryEntry } from "@/types/database";

function rowToPartner(row: PartnerRow): Partner {
  const currentBalance =
    safeNumber(row.currentBalance) || safeNumber(row.total_balance);
  const feePercent =
    safeNumber(row.managementFeePercent) || safeNumber(row.management_fee_rate);

  return {
    id: row.id,
    name: row.name,
    code: row.code ?? "",
    email: row.email ?? null,
    initials: row.initials ?? "",
    avatarUrl: row.avatar_url ?? undefined,
    totalBalance: safeNumber(row.total_balance),
    ownershipPercentage: safeNumber(row.ownership_percentage),
    managementFeeRate: feePercent,
    performance24h: safeNumber(row.performance_24h),
    performanceTrend: row.performance_trend ?? "up",
    joinedAt: row.joined_at,
    entryDate: row.entry_date ?? null,
    lastSettlementDate: row.last_settlement_date ?? null,
    isAdmin: row.isAdmin ?? false,
    totalDeposits: safeNumber(row.totalDeposits),
    totalWithdrawals: safeNumber(row.totalWithdrawals),
    currentBalance,
    totalNetProfit: safeNumber(row.totalNetProfit),
    managementFeesPaid: safeNumber(row.managementFeesPaid),
    baseCapital: safeNumber(row.baseCapital) || currentBalance,
    balanceHistory: Array.isArray(row.balanceHistory)
      ? (row.balanceHistory as Partner["balanceHistory"])
      : [],
    archivedAt: row.archived_at ?? null,
    gpFeesAccrued: safeNumber(row.gpFeesAccrued),
    profitTakenGross: safeNumber(row.profitTakenGross),
  };
}

function withDerivedOwnership(partners: Partner[]): Partner[] {
  const totalInvestment = partners.reduce(
    (sum, p) => sum + (p.totalDeposits || p.baseCapital || p.currentBalance || 0),
    0
  );
  if (totalInvestment <= 0) {
    return partners.map((p) => ({ ...p, ownershipPercentage: 0 }));
  }
  return partners.map((p) => {
    const investment =
      p.totalDeposits || p.baseCapital || p.currentBalance || 0;
    return {
      ...p,
      ownershipPercentage: (investment / totalInvestment) * 100,
    };
  });
}

interface Notification {
  type: "success" | "error";
  message: string;
}

// GP performance-fee transfer that must accompany an LP settlement.
// When an LP capitalizes or withdraws profit, their pending trades get
// stamped settled and stop generating the GP's fee — so the fee is
// locked into the GP's commission pot (gpFeesAccrued) at that exact
// moment or it evaporates. It is NO LONGER poured into the GP's capital;
// the GP later chooses to withdraw or capitalize the pot themselves.
export interface FeeTransfer {
  amount: number; // fee to lock in (full pending fee, or a prorated slice
  //                 on a partial profit withdrawal)
  gpId: string; // partner id of the General Partner row to credit
  lpId: string; // the settling LP — journaled on the Fee transaction
  lpName: string; // for the Fee transaction's human-readable note
}

// Warning appended to a success message when the balance moved but its
// ledger entry could not be written — so a silently-missing journal row
// (which is what left the old statement empty) can never go unnoticed.
const LOG_WARN =
  " ⚠️ لكن لم تُسجَّل في سجل الحركات (العملية تمت فعلياً — حدّث الصفحة)";

// Journal a movement (deposit / withdrawal / capitalize / fee) into the
// transactions table. Requires migration 014 (the 'Capitalize'/'Fee'
// types + note/related_partner_id columns). Returns true iff the row
// was written; callers surface LOG_WARN on false. Never throws — any
// error is caught and reported as a false result.
async function logTransaction(row: {
  investorId: string;
  amount: number;
  type: "Deposit" | "Withdrawal" | "Fee" | "Capitalize";
  note?: string;
  relatedPartnerId?: string;
}): Promise<boolean> {
  try {
    const { error } = await supabase.from("transactions").insert({
      investorId: row.investorId,
      amount: row.amount,
      type: row.type,
      date: new Date().toISOString().split("T")[0],
      note: row.note ?? null,
      related_partner_id: row.relatedPartnerId ?? null,
    });
    if (error) {
      console.warn(`[logTransaction] ${row.type} journal failed:`, error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.warn(`[logTransaction] ${row.type} journal threw:`, e);
    return false;
  }
}

interface PartnersState {
  partners: Partner[];
  loading: boolean;
  error: string | null;
  notification: Notification | null;

  fetchPartners: () => Promise<void>;
  handleWithdrawal: (
    partner: Partner,
    amount: number,
    availableProfit: number,
    onDone?: () => Promise<void>,
    feeTransfer?: FeeTransfer | null
  ) => Promise<void>;
  capitalizeProfits: (
    partner: Partner,
    netProfitAmount: number,
    onDone?: () => Promise<void>,
    feeTransfer?: FeeTransfer | null
  ) => Promise<void>;
  handleDeposit: (
    partner: Partner,
    amount: number,
    onDone?: () => Promise<void>
  ) => Promise<void>;
  // GP-only commission-pot actions. The pot (gpFeesAccrued) accumulates
  // from LP settlements and only ever moves through one of these two.
  withdrawGpCommission: (
    partner: Partner,
    amount: number,
    onDone?: () => Promise<void>
  ) => Promise<void>;
  capitalizeGpCommission: (
    partner: Partner,
    amount: number,
    onDone?: () => Promise<void>
  ) => Promise<void>;
  clearNotification: () => void;
}

// Lock a settling LP's performance fee into the GP's commission pot
// (gpFeesAccrued) and log it as a 'Fee' transaction. Reads the GP row
// fresh from the DB (the store's cached copy may be stale) and ADDS to
// gpFeesAccrued only — capital columns are deliberately untouched, so
// the GP's Investment never moves on an LP settlement. Non-fatal by
// design: the LP's own settlement has already committed, so a failure
// here is surfaced loudly in the console but doesn't roll anything back.
async function accrueGpFee(transfer: FeeTransfer): Promise<boolean> {
  const fee = Number(transfer.amount) || 0;
  if (fee <= 0 || !transfer.gpId) return false;

  const { data: gpRow, error: gpFetchError } = await supabase
    .from("partners")
    .select("*")
    .eq("id", transfer.gpId)
    .single();

  if (gpFetchError || !gpRow) {
    console.error(
      "[accrueGpFee] Could not load GP row — fee NOT accrued:",
      gpFetchError
    );
    return false;
  }

  const { error: gpUpdateError } = await supabase
    .from("partners")
    .update({
      gpFeesAccrued: safeNumber(gpRow.gpFeesAccrued) + fee,
    })
    .eq("id", transfer.gpId);

  if (gpUpdateError) {
    console.error(
      "[accrueGpFee] GP update failed — fee NOT accrued:",
      gpUpdateError
    );
    return false;
  }

  // Ledger entry — names the LP whose settlement generated the fee.
  await logTransaction({
    investorId: transfer.gpId,
    amount: fee,
    type: "Fee",
    note: `رسوم أداء من تسوية ${transfer.lpName}`,
    relatedPartnerId: transfer.lpId,
  });

  return true;
}

export const usePartnersStore = create<PartnersState>((set, get) => ({
  partners: [],
  loading: true,
  error: null,
  notification: null,

  fetchPartners: async () => {
    set({ loading: true, error: null });

    const { data, error } = await supabase
      .from("partners")
      .select("*")
      .is("archived_at", null)
      .order("total_balance", { ascending: false });

    if (error) {
      console.error("[fetchPartners] Supabase error:", error);
      set({ error: error.message, partners: [], loading: false });
    } else {
      set({
        partners: withDerivedOwnership((data ?? []).map(rowToPartner)),
        loading: false,
      });
    }
  },

  handleWithdrawal: async (
    partner: Partner,
    amount: number,
    availableProfit: number,
    onDone?: () => Promise<void>,
    feeTransfer?: FeeTransfer | null
  ) => {
    set({ error: null, notification: null });

    // --- Client-side validation ---
    // Validate against the same capital basis the WithdrawalDialog
    // shows (getPartnerInvestment) so the store never rejects or
    // mis-splits an amount the dialog presented as valid. Balance
    // mutations below still operate on currentBalance.
    const balance = safeNumber(partner.currentBalance);
    const capitalBasis = getPartnerInvestment(partner);
    const profit = Math.max(0, availableProfit);
    const maxWithdrawable = capitalBasis + profit;

    if (amount <= 0) {
      const msg = "مبلغ السحب يجب أن يكون أكبر من صفر";
      set({ error: msg });
      throw new Error(msg);
    }

    if (amount > maxWithdrawable) {
      const msg = `المبلغ المطلوب ($${amount.toLocaleString()}) يتجاوز المتاح ($${maxWithdrawable.toLocaleString()} — رأس المال + الأرباح)`;
      set({ error: msg });
      throw new Error(msg);
    }

    // Split the withdrawal: profit first, then capital.
    //  - profitPortion    → paid out of realized trade gains. Profit was
    //    never inside currentBalance, so paying it out doesn't touch the
    //    balance columns.
    //  - capitalPortion   → the slice that exceeds available profit. This
    //    IS a principal reduction: it reduces currentBalance AND the
    //    investment columns (totalDeposits / baseCapital) so future
    //    ownership % is computed against the smaller stake.
    //  - profitRemainder  → pending profit the partner did NOT withdraw.
    //    It now STAYS pending (Issue 2): a partial profit withdrawal no
    //    longer stamps a full settlement, so the remainder keeps showing
    //    as this partner's pending profit for the GP to handle later.
    //    (profitRemainder > 0 implies capitalPortion === 0, since the
    //    split takes profit before capital.)
    const profitPortion = Math.min(amount, profit);
    const capitalPortion = Math.max(0, amount - profitPortion);
    const profitRemainder = Math.max(0, profit - profitPortion);

    // Three settlement shapes:
    //  - full profit settle: all pending profit taken as cash (maybe plus
    //    capital) → stamp a settlement and clear the partial offset.
    //  - partial profit:     some pending profit left → no stamp; grow the
    //    offset by the gross just taken so the rest stays pending.
    //  - pure capital:       no pending profit at all → leave settlement
    //    state untouched (a capital withdrawal isn't a profit settlement).
    const isFullProfitSettle = profitPortion > 0 && profitRemainder === 0;
    const isPartialProfit = profitRemainder > 0;

    // Fee locked into the GP's commission pot NOW = fee on the profit
    // actually settled this action. feeTransfer.amount is the fee on the
    // FULL pending profit, so prorate by the fraction being resolved.
    const lockedFee =
      feeTransfer && profit > 0
        ? feeTransfer.amount * (profitPortion / profit)
        : 0;
    // Gross equivalent of the cash profit taken (net + its fee) — what
    // the offset must grow by so the engine drops exactly this slice.
    const grossTakenNow = profitPortion + lockedFee;

    // Capital columns move ONLY by capitalPortion now — the remainder is
    // no longer folded into capital.
    const newCurrentBalance = balance - capitalPortion;
    const newTotalBalance = safeNumber(partner.totalBalance) - capitalPortion;
    const newTotalWithdrawals = safeNumber(partner.totalWithdrawals) + amount;
    const newTotalDeposits = Math.max(
      0,
      safeNumber(partner.totalDeposits) - capitalPortion
    );
    const newBaseCapital = Math.max(
      0,
      (safeNumber(partner.baseCapital) || balance) - capitalPortion
    );
    const prevTakenGross = safeNumber(partner.profitTakenGross);
    // Settlement bookkeeping applied to the update below.
    const settlementPatch: {
      last_settlement_date?: string;
      profitTakenGross?: number;
    } = isFullProfitSettle
      ? { last_settlement_date: new Date().toISOString(), profitTakenGross: 0 }
      : isPartialProfit
        ? { profitTakenGross: prevTakenGross + grossTakenNow }
        : {};
    const today = new Date().toISOString().split("T")[0];

    const newHistoryEntry: BalanceHistoryEntry = {
      date: today,
      balance: newCurrentBalance,
    };
    const existingHistory = Array.isArray(partner.balanceHistory)
      ? partner.balanceHistory
      : [];
    const updatedHistory = [...existingHistory, newHistoryEntry];

    // --- 1a. Update the numeric fields (guaranteed to exist) ---
    // settlementPatch stamps last_settlement_date (and clears the offset)
    // only on a FULL profit settle; on a partial withdrawal it grows the
    // offset instead so the remainder stays pending. totalDeposits /
    // baseCapital shrink ONLY by capitalPortion (profit payouts leave
    // investment untouched).
    const { error: updateError } = await supabase
      .from("partners")
      .update({
        "currentBalance": newCurrentBalance,
        total_balance: newTotalBalance,
        "totalWithdrawals": newTotalWithdrawals,
        "totalDeposits": newTotalDeposits,
        "baseCapital": newBaseCapital,
        ...settlementPatch,
      })
      .eq("id", partner.id);

    if (updateError) {
      console.error("[handleWithdrawal] Partner update failed:", updateError);

      let userMsg = `فشل تحديث رصيد الشريك: ${updateError.message}`;
      if (updateError.message.includes("permission")) {
        userMsg =
          "ليس لديك صلاحية لتحديث بيانات الشريك. تحقق من سياسات RLS في Supabase.";
      } else if (
        updateError.message.includes("column") &&
        updateError.message.includes("schema cache")
      ) {
        userMsg =
          "أحد الأعمدة مفقود في قاعدة البيانات. يرجى تشغيل ملف الهجرة وإعادة تحميل مخطط Supabase.";
      }
      set({ notification: { type: "error", message: userMsg } });
      throw updateError;
    }

    // --- 1b. Update balanceHistory separately (tolerate missing column) ---
    // The column may be absent or the PostgREST schema cache may be stale.
    // Either way, don't let it block the withdrawal itself.
    try {
      const { error: historyError } = await supabase
        .from("partners")
        .update({
          "balanceHistory": updatedHistory as unknown as BalanceHistoryEntry[],
        })
        .eq("id", partner.id);

      if (historyError) {
        console.error(
          "[handleWithdrawal] balanceHistory update failed (non-fatal):",
          historyError
        );
        if (
          historyError.message.includes("column") &&
          historyError.message.includes("schema cache")
        ) {
          console.warn(
            'The "balanceHistory" column is missing from the partners table schema cache.\n' +
              "Run this SQL in Supabase, then reload the schema:\n" +
              "  alter table public.partners add column if not exists \"balanceHistory\" jsonb not null default '[]'::jsonb;\n" +
              "  notify pgrst, 'reload schema';"
          );
        }
      }
    } catch (historyCatchErr) {
      console.error(
        "[handleWithdrawal] balanceHistory update threw (non-fatal):",
        historyCatchErr
      );
    }

    // --- 2. Journal the withdrawal (visible on failure) ---
    let logFailed = false;
    const withdrawLogged = await logTransaction({
      investorId: partner.id,
      amount,
      type: "Withdrawal",
      note:
        capitalPortion > 0 && profitPortion > 0
          ? "سحب أرباح + رأس مال"
          : capitalPortion > 0
            ? "سحب من رأس المال"
            : "سحب أرباح",
    });
    if (!withdrawLogged) logFailed = true;

    // --- 3. Recalculate ownership (non-blocking) ---
    try {
      const { error: rpcError } = await supabase.rpc("recalculate_ownership");
      if (rpcError) {
        console.error(
          "[handleWithdrawal] recalculate_ownership RPC failed:",
          rpcError
        );
      }
    } catch (rpcCatchErr) {
      console.error(
        "[handleWithdrawal] recalculate_ownership threw:",
        rpcCatchErr
      );
    }

    // --- 4. (Removed) No auto-capitalize of the remainder ---
    // A partial profit withdrawal now leaves profitRemainder pending
    // (see settlementPatch above); nothing is force-moved into capital.

    // --- 5. Lock the GP's performance fee into the commission pot ---
    // Only the fee on the profit ACTUALLY settled this action (lockedFee)
    // is locked in; the fee on any remainder stays pending with it. This
    // adds to the GP's pot, never to GP capital.
    let feeCredited = false;
    if (lockedFee > 0 && feeTransfer && feeTransfer.gpId !== partner.id) {
      feeCredited = await accrueGpFee({ ...feeTransfer, amount: lockedFee });
    }

    // --- 6. Success! Update UI immediately ---
    const remainderNote =
      profitRemainder > 0
        ? ` — تبقّى ${formatCurrency(profitRemainder)} أرباح معلقة كما هي`
        : "";
    const feeNote = feeCredited
      ? ` — رسوم الأداء (${formatCurrency(lockedFee)}) قُيدت لعمولة المدير`
      : "";
    set({
      notification: {
        type: "success",
        message: `تم سحب $${amount.toLocaleString()} من حساب ${partner.name} بنجاح${remainderNote}${feeNote}${logFailed ? LOG_WARN : ""}`,
      },
    });

    // --- 7. Refetch to sync with server ---
    if (onDone) {
      await onDone();
    }
    await get().fetchPartners();
  },

  // Capitalize ("fix") a partner's profits: add the trade-based net
  // profit to their balance and cost basis, then stamp a settlement
  // date so the distribution engine stops crediting old trades.
  // For an LP, the caller must pass feeTransfer so the GP's performance
  // fee on the settled profit is credited in the same operation.
  capitalizeProfits: async (
    partner: Partner,
    netProfitAmount: number,
    onDone?: () => Promise<void>,
    feeTransfer?: FeeTransfer | null
  ) => {
    set({ error: null, notification: null });

    if (netProfitAmount <= 0) {
      const msg = "لا توجد أرباح للتثبيت";
      set({ notification: { type: "error", message: msg } });
      throw new Error(msg);
    }

    const oldBalance = safeNumber(partner.currentBalance);
    const oldTotalBalance = safeNumber(partner.totalBalance);
    const newBalance = oldBalance + netProfitAmount;
    const settlementDate = new Date().toISOString();

    console.log("[capitalizeProfits] Partner:", partner.name, partner.id);
    console.log("[capitalizeProfits] Net profit to capitalize:", netProfitAmount);
    console.log("[capitalizeProfits] Balance:", oldBalance, "→", newBalance);

    const { data, error: updateError } = await supabase
      .from("partners")
      .update({
        currentBalance: newBalance,
        total_balance: oldTotalBalance + netProfitAmount,
        totalDeposits: newBalance,
        baseCapital: newBalance,
        last_settlement_date: settlementDate,
        // Full settlement — clear any partial-withdrawal offset.
        profitTakenGross: 0,
      })
      .eq("id", partner.id)
      .select()
      .single();

    if (updateError) {
      console.error("[capitalizeProfits] update failed:", updateError);
      let userMsg = `فشل تثبيت الأرباح: ${updateError.message}`;
      if (updateError.message.includes("permission")) {
        userMsg =
          "ليس لديك صلاحية لتثبيت الأرباح. تحقق من سياسات RLS في Supabase.";
      } else if (
        updateError.message.includes("column") ||
        updateError.message.includes("schema cache")
      ) {
        userMsg =
          "أحد الأعمدة مفقود في قاعدة البيانات. يرجى تشغيل ملفات الهجرة وإعادة تحميل مخطط PostgREST.";
      }
      set({ notification: { type: "error", message: userMsg } });
      throw updateError;
    }

    if (!data) {
      console.error("[capitalizeProfits] Update returned no data — RLS may be blocking the write");
      const msg =
        "لم يتم تحديث أي سجل. تحقق من صلاحيات RLS في Supabase أو أن الشريك موجود.";
      set({ notification: { type: "error", message: msg } });
      throw new Error(msg);
    }

    console.log("[capitalizeProfits] Success. Updated row:", {
      currentBalance: data.currentBalance,
      totalDeposits: data.totalDeposits,
      last_settlement_date: data.last_settlement_date,
    });

    // Journal the capitalization itself.
    const capLogged = await logTransaction({
      investorId: partner.id,
      amount: netProfitAmount,
      type: "Capitalize",
      note: "تثبيت الأرباح في رأس المال",
    });

    // Lock the GP's performance fee on the just-settled profit into the
    // commission pot — the settlement stamp stops these trades from
    // generating the fee, so this is the moment it must move. It goes to
    // the pot, not GP capital.
    let feeCredited = false;
    if (feeTransfer && feeTransfer.gpId !== partner.id) {
      feeCredited = await accrueGpFee(feeTransfer);
    }

    const feeNote = feeCredited
      ? ` — رسوم الأداء (${formatCurrency(feeTransfer!.amount)}) قُيدت لعمولة المدير`
      : "";
    set({
      notification: {
        type: "success",
        message: `تم تثبيت أرباح ${partner.name} (${formatCurrency(netProfitAmount)}) وإضافتها لرأس المال${feeNote}${capLogged ? "" : LOG_WARN}`,
      },
    });

    if (onDone) await onDone();
    await get().fetchPartners();
  },

  // Deposit fresh capital into a partner's account. Adds to balance,
  // totalDeposits, and baseCapital, then stamps a settlement date so
  // future trade profits share against the new capital ratio.
  // "Clean Slate Rule": callers must block this action when the partner
  // has outstanding net profit (net profit must be capitalized first).
  handleDeposit: async (
    partner: Partner,
    amount: number,
    onDone?: () => Promise<void>
  ) => {
    set({ error: null, notification: null });

    if (amount <= 0) {
      const msg = "مبلغ الإيداع يجب أن يكون أكبر من صفر";
      set({ notification: { type: "error", message: msg } });
      throw new Error(msg);
    }

    const oldBalance = safeNumber(partner.currentBalance);
    const oldTotalBalance = safeNumber(partner.totalBalance);
    const oldTotalDeposits = safeNumber(partner.totalDeposits);
    const oldBaseCapital =
      safeNumber(partner.baseCapital) || oldBalance;

    const newBalance = oldBalance + amount;
    const newTotalBalance = oldTotalBalance + amount;
    const newTotalDeposits = oldTotalDeposits + amount;
    const newBaseCapital = oldBaseCapital + amount;
    const today = new Date().toISOString().split("T")[0];

    // --- 1a. Update numeric fields with .select() to detect RLS silent failures ---
    // Note: deposits MUST NOT stamp last_settlement_date — that field gates
    // eligibility for prior-period profits in isEligible(). A deposit isn't
    // a settlement; the partner hasn't been paid out, so their share of
    // existing trade profits must be preserved.
    const { data, error: updateError } = await supabase
      .from("partners")
      .update({
        currentBalance: newBalance,
        total_balance: newTotalBalance,
        totalDeposits: newTotalDeposits,
        baseCapital: newBaseCapital,
      })
      .eq("id", partner.id)
      .select()
      .single();

    if (updateError) {
      console.error("[handleDeposit] Partner update failed:", updateError);
      let userMsg = `فشل إيداع الأموال: ${updateError.message}`;
      if (updateError.message.includes("permission")) {
        userMsg =
          "ليس لديك صلاحية لتنفيذ الإيداع. تحقق من سياسات RLS في Supabase.";
      } else if (
        updateError.message.includes("column") ||
        updateError.message.includes("schema cache")
      ) {
        userMsg =
          "أحد الأعمدة مفقود في قاعدة البيانات. يرجى تشغيل ملفات الهجرة وإعادة تحميل مخطط PostgREST.";
      }
      set({ notification: { type: "error", message: userMsg } });
      throw updateError;
    }

    if (!data) {
      const msg =
        "لم يتم تحديث أي سجل. تحقق من صلاحيات RLS في Supabase أو أن الشريك موجود.";
      set({ notification: { type: "error", message: msg } });
      throw new Error(msg);
    }

    // --- 1b. Update balanceHistory separately (tolerate missing column) ---
    const newHistoryEntry: BalanceHistoryEntry = {
      date: today,
      balance: newBalance,
    };
    const existingHistory = Array.isArray(partner.balanceHistory)
      ? partner.balanceHistory
      : [];
    const updatedHistory = [...existingHistory, newHistoryEntry];

    try {
      const { error: historyError } = await supabase
        .from("partners")
        .update({
          "balanceHistory": updatedHistory as unknown as BalanceHistoryEntry[],
        })
        .eq("id", partner.id);

      if (historyError) {
        console.error(
          "[handleDeposit] balanceHistory update failed (non-fatal):",
          historyError
        );
      }
    } catch (historyCatchErr) {
      console.error(
        "[handleDeposit] balanceHistory update threw (non-fatal):",
        historyCatchErr
      );
    }

    // --- 2. Journal the deposit (visible on failure) ---
    const depositLogged = await logTransaction({
      investorId: partner.id,
      amount,
      type: "Deposit",
      note: "إيداع رأس مال",
    });

    // --- 3. Recalculate ownership (non-blocking) ---
    try {
      const { error: rpcError } = await supabase.rpc("recalculate_ownership");
      if (rpcError) {
        console.error(
          "[handleDeposit] recalculate_ownership RPC failed:",
          rpcError
        );
      }
    } catch (rpcCatchErr) {
      console.error("[handleDeposit] recalculate_ownership threw:", rpcCatchErr);
    }

    set({
      notification: {
        type: "success",
        message: `تم إيداع ${formatCurrency(amount)} في حساب ${partner.name} بنجاح${depositLogged ? "" : LOG_WARN}`,
      },
    });

    if (onDone) await onDone();
    await get().fetchPartners();
  },

  // Withdraw part or all of the GP's accrued commission as CASH. Draws
  // down gpFeesAccrued only — capital is untouched (the commission was
  // never in capital). Money leaves the fund, journaled as a Withdrawal.
  withdrawGpCommission: async (partner, amount, onDone) => {
    set({ error: null, notification: null });
    const accrued = safeNumber(partner.gpFeesAccrued);

    if (amount <= 0) {
      const msg = "مبلغ السحب يجب أن يكون أكبر من صفر";
      set({ notification: { type: "error", message: msg } });
      throw new Error(msg);
    }
    if (amount > accrued + 0.005) {
      const msg = `المبلغ يتجاوز العمولة المتاحة (${formatCurrency(accrued)})`;
      set({ notification: { type: "error", message: msg } });
      throw new Error(msg);
    }

    const newAccrued = Math.max(0, accrued - amount);
    const { data, error: updateError } = await supabase
      .from("partners")
      .update({ gpFeesAccrued: newAccrued })
      .eq("id", partner.id)
      .select()
      .single();

    if (updateError) {
      const msg = `فشل سحب العمولة: ${updateError.message}`;
      set({ notification: { type: "error", message: msg } });
      throw updateError;
    }
    if (!data) {
      const msg = "لم يتم تحديث أي سجل. تحقق من الصلاحيات.";
      set({ notification: { type: "error", message: msg } });
      throw new Error(msg);
    }

    const logged = await logTransaction({
      investorId: partner.id,
      amount,
      type: "Withdrawal",
      note: "سحب عمولة المدير (نقداً)",
    });

    set({
      notification: {
        type: "success",
        message: `تم سحب عمولة بقيمة ${formatCurrency(amount)} للمدير${logged ? "" : LOG_WARN}`,
      },
    });

    if (onDone) await onDone();
    await get().fetchPartners();
  },

  // Capitalize part or all of the GP's accrued commission INTO capital:
  // moves gpFeesAccrued → investment columns so it starts earning as the
  // GP's own stake. Deliberately does NOT stamp last_settlement_date —
  // that would wipe the GP's pending TRADE profit, which is unrelated to
  // the commission pot.
  capitalizeGpCommission: async (partner, amount, onDone) => {
    set({ error: null, notification: null });
    const accrued = safeNumber(partner.gpFeesAccrued);

    if (amount <= 0) {
      const msg = "لا توجد عمولة للتثبيت";
      set({ notification: { type: "error", message: msg } });
      throw new Error(msg);
    }
    if (amount > accrued + 0.005) {
      const msg = `المبلغ يتجاوز العمولة المتاحة (${formatCurrency(accrued)})`;
      set({ notification: { type: "error", message: msg } });
      throw new Error(msg);
    }

    const oldBalance = safeNumber(partner.currentBalance);
    const oldTotalBalance = safeNumber(partner.totalBalance);
    const oldTotalDeposits = safeNumber(partner.totalDeposits);
    const oldBaseCapital = safeNumber(partner.baseCapital) || oldBalance;
    const newAccrued = Math.max(0, accrued - amount);
    const newBalance = oldBalance + amount;
    const today = new Date().toISOString().split("T")[0];

    const { data, error: updateError } = await supabase
      .from("partners")
      .update({
        currentBalance: newBalance,
        total_balance: oldTotalBalance + amount,
        totalDeposits: oldTotalDeposits + amount,
        baseCapital: oldBaseCapital + amount,
        gpFeesAccrued: newAccrued,
      })
      .eq("id", partner.id)
      .select()
      .single();

    if (updateError) {
      const msg = `فشل تثبيت العمولة: ${updateError.message}`;
      set({ notification: { type: "error", message: msg } });
      throw updateError;
    }
    if (!data) {
      const msg = "لم يتم تحديث أي سجل. تحقق من الصلاحيات.";
      set({ notification: { type: "error", message: msg } });
      throw new Error(msg);
    }

    // balanceHistory snapshot (tolerate a missing/stale column).
    try {
      const existingHistory = Array.isArray(partner.balanceHistory)
        ? partner.balanceHistory
        : [];
      const updatedHistory = [
        ...existingHistory,
        { date: today, balance: newBalance } as BalanceHistoryEntry,
      ];
      await supabase
        .from("partners")
        .update({
          balanceHistory: updatedHistory as unknown as BalanceHistoryEntry[],
        })
        .eq("id", partner.id);
    } catch (e) {
      console.error(
        "[capitalizeGpCommission] balanceHistory update threw (non-fatal):",
        e
      );
    }

    const logged = await logTransaction({
      investorId: partner.id,
      amount,
      type: "Capitalize",
      note: "تثبيت عمولة المدير في رأس المال",
    });

    set({
      notification: {
        type: "success",
        message: `تم تثبيت عمولة بقيمة ${formatCurrency(amount)} في رأس مال المدير${logged ? "" : LOG_WARN}`,
      },
    });

    if (onDone) await onDone();
    await get().fetchPartners();
  },

  clearNotification: () => set({ notification: null }),
}));
