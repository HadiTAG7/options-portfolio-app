"use client";

import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { safeNumber } from "@/lib/utils";
import type { Partner } from "@/types";
import type { PartnerRow } from "@/types/database";

// Auth gating has three states the shell must distinguish:
//   checking  — session unknown yet (render nothing, no flicker)
//   anonymous — no session → redirect to /login
//   signed-in — session + linked partner row (isGP drives routing)
export interface AuthState {
  checking: boolean;
  session: Session | null;
  // The partner row linked to this auth user via partners.auth_user_id.
  // Null while loading, if unlinked, or before migration 013 ran.
  partner: Partner | null;
  isGP: boolean;
  signOut: () => Promise<void>;
}

function rowToPartnerLite(row: PartnerRow): Partner {
  const currentBalance =
    safeNumber(row.currentBalance) || safeNumber(row.total_balance);
  return {
    id: row.id,
    name: row.name,
    code: row.code ?? "",
    email: row.email ?? null,
    initials: row.initials ?? "",
    avatarUrl: row.avatar_url ?? undefined,
    totalBalance: safeNumber(row.total_balance),
    ownershipPercentage: safeNumber(row.ownership_percentage),
    managementFeeRate:
      safeNumber(row.managementFeePercent) ||
      safeNumber(row.management_fee_rate),
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
    balanceHistory: [],
    archivedAt: row.archived_at ?? null,
  };
}

export function useAuth(): AuthState {
  const [checking, setChecking] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [partner, setPartner] = useState<Partner | null>(null);

  // Resolve the linked partner row for a signed-in user. Tolerates the
  // column being absent (pre-013 environments): falls back to null and
  // the shell treats the user as GP-equivalent only if no linkage
  // system exists (see AUTH_ENFORCED below).
  const loadLinkedPartner = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from("partners")
      .select("*")
      .eq("auth_user_id", userId)
      .maybeSingle();
    if (error) {
      // 42703 = undefined column → migration 013 not run yet.
      console.warn("[useAuth] linked-partner lookup failed:", error.message);
      setPartner(null);
      return;
    }
    setPartner(data ? rowToPartnerLite(data as PartnerRow) : null);
  }, []);

  useEffect(() => {
    let cancelled = false;

    // Initial session read + subscription for later changes.
    const init = async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      setSession(data.session);
      if (data.session?.user) {
        await loadLinkedPartner(data.session.user.id);
      }
      if (!cancelled) setChecking(false);
    };
    const t = setTimeout(() => void init(), 0);

    const { data: sub } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession);
        if (nextSession?.user) {
          void loadLinkedPartner(nextSession.user.id);
        } else {
          setPartner(null);
        }
      }
    );

    return () => {
      cancelled = true;
      clearTimeout(t);
      sub.subscription.unsubscribe();
    };
  }, [loadLinkedPartner]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  return {
    checking,
    session,
    partner,
    isGP: partner?.isAdmin === true,
    signOut,
  };
}
