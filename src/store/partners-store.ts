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
// stamped settled and stop generating the GP's fee — so the fee has to
// be credited to the GP's row at that exact moment or it evaporates.
export interface FeeTransfer {
  amount: number; // the settling LP's feeAmount from the distribution
  gpId: string; // partner id of the General Partner row to credit
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
  clearNotification: () => void;
}

// Credit the GP's capital with a settling LP's performance fee and log
// it as a 'Fee' transaction. Reads the GP row fresh from the DB (the
// store's cached copy may be stale) and adds the fee to every balance
// column so the Investment/Current Balance views pick it up
// immediately. Non-fatal by design: the LP's own settlement has
// already committed, so a failure here is surfaced loudly in the
// console but doesn't roll anything back.
async function creditGpFee(transfer: FeeTransfer): Promise<boolean> {
  const fee = Number(transfer.amount) || 0;
  if (fee <= 0 || !transfer.gpId) return false;

  const { data: gpRow, error: gpFetchError } = await supabase
    .from("partners")
    .select("*")
    .eq("id", transfer.gpId)
    .single();

  if (gpFetchError || !gpRow) {
    console.error(
      "[creditGpFee] Could not load GP row — fee NOT credited:",
      gpFetchError
    );
    return false;
  }

  const { error: gpUpdateError } = await supabase
    .from("partners")
    .update({
      currentBalance: safeNumber(gpRow.currentBalance) + fee,
      total_balance: safeNumber(gpRow.total_balance) + fee,
      totalDeposits: safeNumber(gpRow.totalDeposits) + fee,
      baseCapital: safeNumber(gpRow.baseCapital) + fee,
    })
    .eq("id", transfer.gpId);

  if (gpUpdateError) {
    console.error(
      "[creditGpFee] GP update failed — fee NOT credited:",
      gpUpdateError
    );
    return false;
  }

  // Ledger entry. Requires migration 011 (adds 'Fee' to the
  // transactions type check); tolerated as non-fatal if missing.
  const { error: txError } = await supabase.from("transactions").insert({
    investorId: transfer.gpId,
    amount: fee,
    type: "Fee" as const,
    date: new Date().toISOString().split("T")[0],
  });
  if (txError) {
    console.warn(
      "[creditGpFee] Fee transaction log failed (non-fatal — run migration 011):",
      txError.message
    );
  }

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
    //    The settlement stamp below wipes ALL pending trade profit, so
    //    the remainder must be capitalized into the balance columns in
    //    the same update — otherwise a partial profit withdrawal would
    //    silently forfeit the rest (it would be neither paid out nor
    //    added to capital).
    const profitPortion = Math.min(amount, profit);
    const capitalPortion = Math.max(0, amount - profitPortion);
    const profitRemainder = Math.max(0, profit - profitPortion);

    const newCurrentBalance = balance - capitalPortion + profitRemainder;
    const newTotalBalance =
      safeNumber(partner.totalBalance) - capitalPortion + profitRemainder;
    const newTotalWithdrawals = safeNumber(partner.totalWithdrawals) + amount;
    const newTotalDeposits =
      Math.max(0, safeNumber(partner.totalDeposits) - capitalPortion) +
      profitRemainder;
    const newBaseCapital =
      Math.max(
        0,
        (safeNumber(partner.baseCapital) || balance) - capitalPortion
      ) + profitRemainder;
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
    // Stamp last_settlement_date so the distribution engine treats all
    // prior trade profits as "settled" — profit resets to $0.
    // totalDeposits / baseCapital shrink ONLY by capitalPortion (pure
    // profit payouts leave investment untouched).
    const { error: updateError } = await supabase
      .from("partners")
      .update({
        "currentBalance": newCurrentBalance,
        total_balance: newTotalBalance,
        "totalWithdrawals": newTotalWithdrawals,
        "totalDeposits": newTotalDeposits,
        "baseCapital": newBaseCapital,
        last_settlement_date: new Date().toISOString(),
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

    // --- 2. Insert transaction record (non-blocking) ---
    try {
      const { error: txError } = await supabase.from("transactions").insert({
        investorId: partner.id,
        amount,
        type: "Withdrawal" as const,
        date: today,
      });

      if (txError) {
        console.error("[handleWithdrawal] Transaction insert failed:", txError);

        if (
          txError.message.includes("relation") &&
          txError.message.includes("does not exist")
        ) {
          console.warn(
            'Table "transactions" does not exist. Run supabase/migrations/001_add_withdrawal_columns.sql to create it.'
          );
        } else if (txError.message.includes("permission")) {
          console.warn(
            "Transaction insert blocked by RLS. Check your Supabase policies."
          );
        }
        // Don't block the withdrawal — the partner balance was already updated
      }
    } catch (txCatchErr) {
      console.error(
        "[handleWithdrawal] Transaction insert threw:",
        txCatchErr
      );
    }

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

    // --- 4. Credit the GP's performance fee for the settled profit ---
    // The settlement stamp above just wiped this partner's pending
    // trade profit; the GP's fee claim on it dies with it unless we
    // move the fee into the GP's capital right now.
    let feeCredited = false;
    if (profit > 0 && feeTransfer && feeTransfer.gpId !== partner.id) {
      feeCredited = await creditGpFee(feeTransfer);
    }

    // --- 5. Success! Update UI immediately ---
    const remainderNote =
      profitRemainder > 0
        ? ` وتم تثبيت باقي الأرباح (${formatCurrency(profitRemainder)}) في رأس المال`
        : "";
    const feeNote = feeCredited
      ? ` — رسوم الأداء (${formatCurrency(feeTransfer!.amount)}) قُيدت للمدير`
      : "";
    set({
      notification: {
        type: "success",
        message: `تم سحب $${amount.toLocaleString()} من حساب ${partner.name} بنجاح${remainderNote}${feeNote}`,
      },
    });

    // --- 6. Refetch to sync with server ---
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

    // Credit the GP's performance fee for the profit that was just
    // settled — the settlement stamp stops these trades from
    // generating the fee, so this is the moment it must move.
    let feeCredited = false;
    if (feeTransfer && feeTransfer.gpId !== partner.id) {
      feeCredited = await creditGpFee(feeTransfer);
    }

    const feeNote = feeCredited
      ? ` — رسوم الأداء (${formatCurrency(feeTransfer!.amount)}) قُيدت للمدير`
      : "";
    set({
      notification: {
        type: "success",
        message: `تم تثبيت أرباح ${partner.name} (${formatCurrency(netProfitAmount)}) وإضافتها لرأس المال${feeNote}`,
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

    // --- 2. Insert transaction record (non-blocking) ---
    try {
      const { error: txError } = await supabase.from("transactions").insert({
        investorId: partner.id,
        amount,
        type: "Deposit" as const,
        date: today,
      });
      if (txError) {
        console.error("[handleDeposit] Transaction insert failed:", txError);
      }
    } catch (txCatchErr) {
      console.error("[handleDeposit] Transaction insert threw:", txCatchErr);
    }

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
        message: `تم إيداع ${formatCurrency(amount)} في حساب ${partner.name} بنجاح`,
      },
    });

    if (onDone) await onDone();
    await get().fetchPartners();
  },

  clearNotification: () => set({ notification: null }),
}));
