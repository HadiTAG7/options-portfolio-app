"use client";

import { create } from "zustand";
import { supabase } from "@/lib/supabase";
import { safeNumber, formatCurrency } from "@/lib/utils";
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
  const totalAssets = partners.reduce((sum, p) => sum + p.currentBalance, 0);
  if (totalAssets <= 0) {
    return partners.map((p) => ({ ...p, ownershipPercentage: 0 }));
  }
  return partners.map((p) => ({
    ...p,
    ownershipPercentage: (p.currentBalance / totalAssets) * 100,
  }));
}

interface Notification {
  type: "success" | "error";
  message: string;
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
    onDone?: () => Promise<void>
  ) => Promise<void>;
  capitalizeProfits: (
    partner: Partner,
    netProfitAmount: number,
    onDone?: () => Promise<void>
  ) => Promise<void>;
  handleDeposit: (
    partner: Partner,
    amount: number,
    onDone?: () => Promise<void>
  ) => Promise<void>;
  clearNotification: () => void;
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
    onDone?: () => Promise<void>
  ) => {
    set({ error: null, notification: null });

    // --- Client-side validation ---
    const balance = safeNumber(partner.currentBalance);
    const profit = Math.max(0, availableProfit);
    const maxWithdrawable = balance + profit;

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
    //  - profitPortion  → paid out of realized trade gains. It does NOT
    //    reduce the investment (totalDeposits / baseCapital). It only
    //    reduces currentBalance + total_balance by the same amount the
    //    distribution engine would have added when capitalized.
    //  - capitalPortion → the slice that exceeds available profit. This
    //    IS a principal reduction: it reduces currentBalance AND the
    //    investment columns (totalDeposits / baseCapital) so future
    //    ownership % is computed against the smaller stake.
    const profitPortion = Math.min(amount, profit);
    const capitalPortion = Math.max(0, amount - profitPortion);

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

    // --- 4. Success! Update UI immediately ---
    set({
      notification: {
        type: "success",
        message: `تم سحب $${amount.toLocaleString()} من حساب ${partner.name} بنجاح`,
      },
    });

    // --- 5. Refetch to sync with server ---
    if (onDone) {
      await onDone();
    }
    await get().fetchPartners();
  },

  // Capitalize ("fix") a partner's profits: add the trade-based net
  // profit to their balance and cost basis, then stamp a settlement
  // date so the distribution engine stops crediting old trades.
  capitalizeProfits: async (
    partner: Partner,
    netProfitAmount: number,
    onDone?: () => Promise<void>
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

    set({
      notification: {
        type: "success",
        message: `تم تثبيت أرباح ${partner.name} (${formatCurrency(netProfitAmount)}) وإضافتها لرأس المال`,
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
    const settlementDate = new Date().toISOString();
    const today = settlementDate.split("T")[0];

    // --- 1a. Update numeric fields with .select() to detect RLS silent failures ---
    const { data, error: updateError } = await supabase
      .from("partners")
      .update({
        currentBalance: newBalance,
        total_balance: newTotalBalance,
        totalDeposits: newTotalDeposits,
        baseCapital: newBaseCapital,
        last_settlement_date: settlementDate,
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
