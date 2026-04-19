"use client";

import { create } from "zustand";
import { supabase } from "@/lib/supabase";
import type { Partner } from "@/types";
import type { PartnerRow, BalanceHistoryEntry } from "@/types/database";

function rowToPartner(row: PartnerRow): Partner {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    initials: row.initials,
    avatarUrl: row.avatar_url ?? undefined,
    totalBalance: Number(row.total_balance),
    ownershipPercentage: Number(row.ownership_percentage),
    managementFeeRate: Number(row.management_fee_rate),
    performance24h: Number(row.performance_24h),
    performanceTrend: row.performance_trend,
    joinedAt: row.joined_at,
    isAdmin: row.isAdmin ?? false,
    totalDeposits: Number(row.totalDeposits ?? 0),
    totalWithdrawals: Number(row.totalWithdrawals ?? 0),
    currentBalance: Number(row.currentBalance ?? 0),
    totalNetProfit: Number(row.totalNetProfit ?? 0),
    managementFeesPaid: Number(row.managementFeesPaid ?? 0),
    baseCapital: Number(row.baseCapital ?? 0),
    balanceHistory: (row.balanceHistory as Partner["balanceHistory"]) ?? [],
  };
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
  handleWithdrawal: (partnerId: string, amount: number) => Promise<void>;
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
      set({ error: error.message, partners: [], loading: false });
    } else {
      set({ partners: (data ?? []).map(rowToPartner), loading: false });
    }
  },

  handleWithdrawal: async (partnerId: string, amount: number) => {
    set({ error: null, notification: null });

    const partner = get().partners.find((p) => p.id === partnerId);
    if (!partner) {
      set({ error: "الشريك غير موجود" });
      throw new Error("Partner not found");
    }

    if (amount > partner.currentBalance) {
      const msg = `المبلغ المطلوب ($${amount.toLocaleString()}) يتجاوز الرصيد المتاح ($${partner.currentBalance.toLocaleString()})`;
      set({ error: msg });
      throw new Error("Insufficient balance");
    }

    const newCurrentBalance = partner.currentBalance - amount;
    const newTotalBalance = partner.totalBalance - amount;
    const newTotalWithdrawals = partner.totalWithdrawals + amount;
    const today = new Date().toISOString().split("T")[0];

    const newHistoryEntry: BalanceHistoryEntry = {
      date: today,
      balance: newCurrentBalance,
    };
    const updatedHistory = [...partner.balanceHistory, newHistoryEntry];

    // 1. Update the partner row
    const { error: updateError } = await supabase
      .from("partners")
      .update({
        currentBalance: newCurrentBalance,
        total_balance: newTotalBalance,
        totalWithdrawals: newTotalWithdrawals,
        balanceHistory: updatedHistory,
      })
      .eq("id", partnerId);

    if (updateError) {
      set({ error: updateError.message });
      throw updateError;
    }

    // 2. Insert transaction record
    const { error: txError } = await supabase.from("transactions").insert({
      investorId: partnerId,
      amount,
      type: "Withdrawal" as const,
    });

    if (txError) {
      set({ error: txError.message });
      throw txError;
    }

    // 3. Recalculate ownership percentages
    const { error: rpcError } = await supabase.rpc("recalculate_ownership");
    if (rpcError) {
      set({ error: rpcError.message });
    }

    // 4. Optimistic local update for instant UI feedback
    set((state) => ({
      partners: state.partners.map((p) =>
        p.id === partnerId
          ? {
              ...p,
              currentBalance: newCurrentBalance,
              totalBalance: newTotalBalance,
              totalWithdrawals: newTotalWithdrawals,
              balanceHistory: updatedHistory,
            }
          : p
      ),
      notification: {
        type: "success" as const,
        message: `تم سحب $${amount.toLocaleString()} من حساب ${partner.name} بنجاح`,
      },
    }));

    // 5. Refetch for accurate ownership percentages from server
    await get().fetchPartners();
  },

  clearNotification: () => set({ notification: null }),
}));
