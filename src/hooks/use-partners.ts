"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { Partner } from "@/types";
import type { PartnerRow } from "@/types/database";

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
      setPartners((data ?? []).map(rowToPartner));
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

  const totalAssets = partners.reduce((sum, p) => sum + p.totalBalance, 0);

  return { partners, loading, error, totalAssets, deletePartner, addPartner, refetch: fetchPartners };
}
