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

    console.log(
      "[fetchPartners] Supabase response:",
      fetchError ? `ERROR: ${fetchError.message}` : `${(data ?? []).length} rows returned`
    );

    if (fetchError) {
      console.error("[fetchPartners] Error details:", fetchError);
      setError(fetchError.message);
      setPartners([]);
    } else {
      const mapped = withDerivedOwnership((data ?? []).map(rowToPartner));
      console.log("[fetchPartners] Partners loaded:", mapped.map(p => `${p.name} (${p.id})`));
      setPartners(mapped);
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
          entry_date: today,
        };

        console.log("[addPartner] Supabase insert payload:", JSON.stringify(payload));

        const { data: insertedRow, error: insertError } = await supabase
          .from("partners")
          .insert(payload)
          .select()
          .single();

        if (insertError) {
          console.error("[addPartner] Supabase Insert Error:", insertError);
          setError(insertError.message);
          throw insertError;
        }

        console.log("[addPartner] Insert succeeded, returned row:", insertedRow);

        // Log the initial deposit (non-fatal)
        const { error: txError } = await supabase.from("transactions").insert({
          investorId: insertedRow?.id ?? trimmedName,
          amount: capital,
          type: "Deposit" as const,
          date: today,
        });

        if (txError) {
          console.warn("[addPartner] Transaction insert failed (non-fatal):", txError.message);
        }

        // Recalculate ownership server-side (non-fatal)
        const { error: rpcError } = await supabase.rpc(
          "recalculate_ownership"
        );
        if (rpcError) {
          console.warn("[addPartner] recalculate_ownership RPC failed (non-fatal):", rpcError.message);
        }

        console.log("[addPartner] Refetching partners list...");
        await fetchPartners();
      } catch (err) {
        console.error("[addPartner] Failed:", err);
        throw err;
      }
    },
    [fetchPartners]
  );

  const updatePartner = useCallback(
    async (
      id: string,
      payload: {
        name: string;
        managementFeePercent: number;
        entryDate: string; // YYYY-MM-DD
      }
    ) => {
      setError(null);

      const updatePayload = {
        name: payload.name,
        managementFeePercent: Number(payload.managementFeePercent),
        entry_date: payload.entryDate,
      };

      const { error: updateError } = await supabase
        .from("partners")
        .update(updatePayload)
        .eq("id", id);

      if (updateError) {
        console.error("Supabase Update Error (partners):", updateError);
        setError(updateError.message);
        throw updateError;
      }

      // Mirror into local state so the UI reflects changes instantly,
      // even if the refetch below is rate-limited or delayed.
      setPartners((prev) =>
        prev.map((p) =>
          p.id === id
            ? {
                ...p,
                name: updatePayload.name,
                managementFeeRate: updatePayload.managementFeePercent,
                entryDate: updatePayload.entry_date,
              }
            : p
        )
      );

      await fetchPartners();
    },
    [fetchPartners]
  );

  // Use currentBalance (the live working balance) for ownership math; fall
  // back to totalBalance if currentBalance was never populated.
  const totalAssets = partners.reduce(
    (sum, p) => sum + (p.currentBalance || p.totalBalance),
    0
  );

  return {
    partners,
    loading,
    error,
    totalAssets,
    deletePartner,
    addPartner,
    updatePartner,
    refetch: fetchPartners,
  };
}
