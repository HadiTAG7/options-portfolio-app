"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { safeNumber } from "@/lib/utils";
import type { FundTransaction } from "@/types";
import type { TransactionRow } from "@/types/database";

function rowToTransaction(row: TransactionRow): FundTransaction {
  return {
    id: row.id,
    investorId: row.investorId,
    amount: safeNumber(row.amount),
    type: row.type,
    date: row.date,
    createdAt: row.created_at,
    note: row.note ?? null,
    relatedPartnerId: row.related_partner_id ?? null,
  };
}

// Journal rows for one partner (the statement view), newest first.
// Fetches on open and exposes refetch for after new settlements.
export function useTransactions(partnerId: string | null) {
  const [transactions, setTransactions] = useState<FundTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTransactions = useCallback(async () => {
    if (!partnerId) {
      setTransactions([]);
      return;
    }
    setLoading(true);
    setError(null);

    const { data, error: fetchError } = await supabase
      .from("transactions")
      .select("*")
      .eq("investorId", partnerId)
      .order("created_at", { ascending: false });

    if (fetchError) {
      console.error("[useTransactions] fetch failed:", fetchError);
      setError(fetchError.message);
      setTransactions([]);
    } else {
      setTransactions((data ?? []).map(rowToTransaction));
    }
    setLoading(false);
  }, [partnerId]);

  useEffect(() => {
    // Deferred a tick: fetchTransactions flips loading state
    // synchronously, which the react-hooks/set-state-in-effect rule
    // forbids directly inside the effect body.
    const t = setTimeout(() => void fetchTransactions(), 0);
    return () => clearTimeout(t);
  }, [fetchTransactions]);

  return { transactions, loading, error, refetch: fetchTransactions };
}
