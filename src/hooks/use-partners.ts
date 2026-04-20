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

      // Generate initials from name (first letter of each word, max 2)
      const initials = trimmedName
        .split(/\s+/)
        .map((w) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();

      // Unique id (crypto.randomUUID where available, short fallback otherwise)
      const id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `p-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      const code = `K-${Math.floor(10000 + Math.random() * 90000)}`;
      const nowIso = new Date().toISOString();
      const today = nowIso.split("T")[0];

      try {
        // --- 1. Insert partner with full camelCase + snake_case payload ---
        const { error: insertError } = await supabase.from("partners").insert({
          id,
          name: trimmedName,
          code,
          initials,
          total_balance: capital,
          ownership_percentage: 0, // recalculated by RPC below
          management_fee_rate: 1.25,
          performance_24h: 0,
          performance_trend: "up" as const,
          isAdmin: false,
          totalDeposits: capital,
          totalWithdrawals: 0,
          currentBalance: capital,
          totalNetProfit: 0,
          managementFeesPaid: 0,
          managementFeePercent: 20,
          baseCapital: capital,
          balanceHistory: [{ date: nowIso, balance: capital }],
        });

        if (insertError) {
          console.error("Supabase Insert Error:", insertError);
          setError(insertError.message);
          throw insertError;
        }

        // --- 2. Log the initial deposit (non-fatal on failure) ---
        const { error: txError } = await supabase.from("transactions").insert({
          investorId: id,
          amount: capital,
          type: "Deposit" as const,
          date: today,
        });

        if (txError) {
          console.error("Supabase Insert Error (transactions):", txError);
          // don't throw — partner was created successfully
        }

        // --- 3. Recalculate ownership server-side ---
        const { error: rpcError } = await supabase.rpc(
          "recalculate_ownership"
        );
        if (rpcError) {
          console.error("Supabase RPC Error:", rpcError);
        }

        // --- 4. Refresh local state ---
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
