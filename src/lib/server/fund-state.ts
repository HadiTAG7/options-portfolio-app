import type { Partner, Trade } from "@/types";
import type { PartnerRow, TradeRow } from "@/types/database";
import { isActivePartnerRow, rowToPartner, rowToTrade } from "@/lib/fund-rows";

// The fund's state as the server reads it, mapped exactly the way the
// browser's shim maps it (doc id merged in, archived partners excluded),
// so the server's plan and the page's estimate start from the same inputs.

// Minimal shape of a Firestore document snapshot — avoids importing the
// admin SDK's types into code the dry-run script also runs.
export interface DocLike {
  id: string;
  data(): Record<string, unknown> | undefined;
}

export interface FundState {
  partners: Partner[];
  // Raw active partner documents by id — undo snapshots come from these,
  // not from the mapped objects (which apply display fallbacks).
  rawPartners: Map<string, Record<string, unknown>>;
  trades: Trade[];
  monthlyKeys: Set<string>;
}

export function mapFundState(
  partnerDocs: DocLike[],
  tradeDocs: DocLike[],
  monthlyDocs: DocLike[]
): FundState {
  const rawPartners = new Map<string, Record<string, unknown>>();
  const partners: Partner[] = [];
  for (const d of partnerDocs) {
    const row = { id: d.id, ...(d.data() ?? {}) } as PartnerRow;
    if (!isActivePartnerRow(row)) continue;
    rawPartners.set(d.id, { id: d.id, ...(d.data() ?? {}) });
    partners.push(rowToPartner(row));
  }
  const trades = tradeDocs.map((d) => rowToTrade({ id: d.id, ...(d.data() ?? {}) } as TradeRow));
  const monthlyKeys = new Set(monthlyDocs.map((d) => d.id));
  return { partners, rawPartners, trades, monthlyKeys };
}
