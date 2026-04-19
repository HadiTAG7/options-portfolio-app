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
    code: row.code,
    initials: row.initials,
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

      // Generate initials from name (first letter of each word, max 2)
      const initials = name
        .trim()
        .split(/\s+/)
        .map((w) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();

      // Generate a unique partner code
      const code = `K-${Math.floor(10000 + Math.random() * 90000)}`;

      const { error: insertError } = await supabase.from("partners").insert({
        name: name.trim(),
        code,
        initials,
        total_balance: initialCapital,
        ownership_percentage: 0, // will be recalculated
        management_fee_rate: 1.25,
        performance_24h: 0,
        performance_trend: "up" as const,
      });

      if (insertError) {
        setError(insertError.message);
        throw insertError;
      }

      // Recalculate ownership percentages for all partners
      const { error: rpcError } = await supabase.rpc("recalculate_ownership");
      if (rpcError) {
        setError(rpcError.message);
      }

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

  return { partners, loading, error, totalAssets, deletePartner, addPartner, refetch: fetchPartners };
}
