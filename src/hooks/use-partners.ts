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

  const totalAssets = partners.reduce((sum, p) => sum + p.totalBalance, 0);

  return { partners, loading, error, totalAssets, deletePartner, refetch: fetchPartners };
}
