"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { FundOperation, FundOperationKind, PartnerSnapshot } from "@/types";
import type { OperationRow } from "@/types/database";

function rowToOperation(row: OperationRow): FundOperation {
  return {
    id: String(row.id),
    at: String(row.at ?? row.created_at ?? ""),
    kind: (row.kind as FundOperationKind) ?? "withdrawal",
    label: row.label ?? "",
    partnerIds: Array.isArray(row.partnerIds) ? row.partnerIds : [],
    snapshots: Array.isArray(row.snapshots)
      ? (row.snapshots as PartnerSnapshot[])
      : [],
    reversedAt: row.reversedAt ?? null,
  };
}

// The undo journal, newest first. Fetches on mount and exposes refetch
// (the operations-log dialog refetches every time it opens, and after an
// undo). Empty/erroring silently → an empty list (the collection may not
// exist yet before the first operation, or if rules aren't deployed).
export function useOperations() {
  const [operations, setOperations] = useState<FundOperation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchOperations = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: fetchError } = await supabase
      .from("operations")
      .select("*")
      .order("at", { ascending: false })
      .limit(100);
    if (fetchError) {
      console.warn("[useOperations] fetch failed:", fetchError.message);
      setError(fetchError.message);
      setOperations([]);
    } else {
      setOperations((data ?? []).map(rowToOperation));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // Deferred a tick — fetchOperations flips loading synchronously,
    // which the react-hooks/set-state-in-effect rule forbids inline.
    const t = setTimeout(() => void fetchOperations(), 0);
    return () => clearTimeout(t);
  }, [fetchOperations]);

  return { operations, loading, error, refetch: fetchOperations };
}
