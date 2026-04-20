"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { safeNumber } from "@/lib/utils";
import type { Partner } from "@/types";
import type { PartnerRow } from "@/types/database";

function rowToPartner(row: PartnerRow): Partner {
  // currentBalance falls back to total_balance if the new column is empty
  const currentBalance =
    safeNumber(row.currentBalance) || safeNumber(row.total_balance);
  // Fee can be stored under either name depending on schema migrations
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
    entryDate: row.entry_date ?? null,
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

// Recompute ownership client-side from currentBalance so it works even
// when the server-side column is null/stale.
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

export function usePartners() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPartners = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error: fetchError } = await supabase
      .from("partners")
      .select("*")
      .order("total_balance", { ascending: false });

    if (fetchError) {
      setError(fetchError.message);
      setPartners([]);
    } else {
      setPartners(withDerivedOwnership((data ?? []).map(rowToPartner)));
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    fetchPartners();
  }, [fetchPartners]);

  const deletePartner = useCallback(
    async (id: string) => {
      setError(null);

      // 1. Delete the partner row
      const { error: deleteError } = await supabase
        .from("partners")
        .delete()
        .eq("id", id);

      if (deleteError) {
        setError(deleteError.message);
        return;
      }

      // 2. Recalculate ownership percentages server-side
      const { error: rpcError } = await supabase.rpc("recalculate_ownership");

      if (rpcError) {
        setError(rpcError.message);
      }

      // 3. Refetch to get fresh data with recalculated percentages
      await fetchPartners();
    },
    [fetchPartners]
  );

  const addPartner = useCallback(
    async (name: string, initialCapital: number) => {
      setError(null);

      const trimmedName = name.trim();
      const capital = Number(initialCapital);

      if (!trimmedName) {
        const msg = "يرجى إدخال اسم الشريك";
        setError(msg);
        throw new Error(msg);
      }
      if (!Number.isFinite(capital) || capital <= 0) {
        const msg = "يرجى إدخال مبلغ صحيح أكبر من صفر";
        setError(msg);
        throw new Error(msg);
      }

      const nowIso = new Date().toISOString();
      const today = nowIso.split("T")[0];

      try {
        const payload = {
          name: trimmedName,
          currentBalance: capital,
          totalDeposits: capital,
          baseCapital: capital,
          total_balance: capital,
          managementFeePercent: 20,
          balanceHistory: [{ date: nowIso, balance: capital }],
          isAdmin: false,
        };

        console.log("Supabase insert payload:", JSON.stringify(payload));

        const { error: insertError } = await supabase
          .from("partners")
          .insert(payload);

        if (insertError) {
          console.error("Supabase Insert Error:", insertError);
          setError(insertError.message);
          throw insertError;
        }

        // Log the initial deposit (non-fatal)
        const { error: txError } = await supabase.from("transactions").insert({
          investorId: payload.name,
          amount: capital,
          type: "Deposit" as const,
          date: today,
        });

        if (txError) {
          console.error("Supabase Insert Error (transactions):", txError);
        }

        // Recalculate ownership server-side (non-fatal)
        const { error: rpcError } = await supabase.rpc(
          "recalculate_ownership"
        );
        if (rpcError) {
          console.error("Supabase RPC Error:", rpcError);
        }

        await fetchPartners();
      } catch (err) {
        console.error("Supabase Insert Error:", err);
        throw err;
      }
    },
    [fetchPartners]
  );

  // Use currentBalance (the live working balance) for ownership math; fall
  // back to totalBalance if currentBalance was never populated.
  const totalAssets = partners.reduce(
    (sum, p) => sum + (p.currentBalance || p.totalBalance),
    0
  );

  return { partners, loading, error, totalAssets, deletePartner, addPartner, refetch: fetchPartners };
}
