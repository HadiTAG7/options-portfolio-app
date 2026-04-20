"use client";

import { create } from "zustand";
import { supabase } from "@/lib/supabase";
import { safeNumber } from "@/lib/utils";
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
    initials: row.initials ?? "",
    avatarUrl: row.avatar_url ?? undefined,
    totalBalance: safeNumber(row.total_balance),
    ownershipPercentage: safeNumber(row.ownership_percentage),
    managementFeeRate: feePercent,
    performance24h: safeNumber(row.performance_24h),
    performanceTrend: row.performance_trend ?? "up",
    joinedAt: row.joined_at,
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
    onDone?: () => Promise<void>
  ) => {
    set({ error: null, notification: null });

    // --- Client-side validation ---
    const balance = safeNumber(partner.currentBalance);

    if (amount <= 0) {
      const msg = "مبلغ السحب يجب أن يكون أكبر من صفر";
      set({ error: msg });
      throw new Error(msg);
    }

    if (amount > balance) {
      const msg = `المبلغ المطلوب ($${amount.toLocaleString()}) يتجاوز الرصيد المتاح ($${balance.toLocaleString()})`;
      set({ error: msg });
      throw new Error(msg);
    }

    const newCurrentBalance = balance - amount;
    const newTotalBalance = safeNumber(partner.totalBalance) - amount;
    const newTotalWithdrawals = safeNumber(partner.totalWithdrawals) + amount;
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
    const { error: updateError } = await supabase
      .from("partners")
      .update({
        "currentBalance": newCurrentBalance,
        total_balance: newTotalBalance,
        "totalWithdrawals": newTotalWithdrawals,
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

  clearNotification: () => set({ notification: null }),
}));
