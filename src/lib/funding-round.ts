import type {
  FundingCurrency,
  FundingRequest,
  FundingRequestKind,
  FundingTotals,
} from "@/lib/funding-day";

// A funding round as stored in funding_rounds/{id} (server-written only,
// via the admin SDK — the client never touches the collection directly).
export type FundingRoundStatus = "draft" | "executed" | "reverted" | "cancelled";

export interface FundingSummaryLine {
  partnerId: string;
  name: string;
  kind: FundingRequestKind | null;
  currency: FundingCurrency;
  cashIn: number;
  cashOut: number;
  cashInCurrency: number;
  cashOutCurrency: number;
  capitalized: number;
  investmentAfter: number;
  exits: boolean;
}

export interface FundingRound {
  id: string;
  status: FundingRoundStatus;
  // Bumped on every save; a save or execute must name the version it was
  // based on, so two devices can't silently overwrite each other.
  version: number;
  plannedDate: string | null; // YYYY-MM-DD, informational
  sarPerUsd: number;
  brokerCashUsd: number | null;
  requests: FundingRequest[];
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  executedAt: string | null; // the settlement instant S
  ledgerDate: string | null;
  opId: string | null;
  fingerprint: string | null;
  summary: { totals: FundingTotals; lines: FundingSummaryLine[] } | null;
  revertedAt: string | null;
}

export interface FundingRoundPatch {
  requests?: FundingRequest[];
  plannedDate?: string | null;
  sarPerUsd?: number;
  brokerCashUsd?: number | null;
}

const KINDS: readonly FundingRequestKind[] = ["deposit", "withdraw", "withdraw_profits", "exit"];

// Server-side shape check for anything a client sends. Returns the clean
// value or a message; never trusts the client's types.
export function sanitizePatch(raw: unknown): { patch: FundingRoundPatch } | { error: string } {
  if (!raw || typeof raw !== "object") return { error: "بيانات غير صالحة" };
  const r = raw as Record<string, unknown>;
  const patch: FundingRoundPatch = {};

  if ("requests" in r) {
    if (!Array.isArray(r.requests) || r.requests.length > 50) {
      return { error: "قائمة الطلبات غير صالحة" };
    }
    const out: FundingRequest[] = [];
    for (const item of r.requests) {
      if (!item || typeof item !== "object") return { error: "طلب غير صالح" };
      const q = item as Record<string, unknown>;
      const kind = q.kind as FundingRequestKind;
      const currency = q.currency === "SAR" ? "SAR" : q.currency === "USD" ? "USD" : null;
      const amount = q.amount === null || q.amount === undefined ? null : Number(q.amount);
      if (typeof q.partnerId !== "string" || !q.partnerId || q.partnerId.length > 128) {
        return { error: "طلب بدون شريك" };
      }
      if (!KINDS.includes(kind)) return { error: "نوع طلب غير معروف" };
      if (!currency) return { error: "عملة غير صالحة" };
      if (amount !== null && !(Number.isFinite(amount) && amount >= 0 && amount < 1e9)) {
        return { error: "مبلغ غير صالح" };
      }
      const note =
        typeof q.note === "string" && q.note.trim() ? q.note.trim().slice(0, 200) : null;
      out.push({ partnerId: q.partnerId, kind, amount, currency, note });
    }
    patch.requests = out;
  }
  if ("plannedDate" in r) {
    const d = r.plannedDate;
    if (d === null || d === "") patch.plannedDate = null;
    else if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) patch.plannedDate = d;
    else return { error: "تاريخ غير صالح" };
  }
  if ("sarPerUsd" in r) {
    const v = Number(r.sarPerUsd);
    if (!(Number.isFinite(v) && v > 1 && v < 10)) return { error: "سعر صرف غير صالح" };
    patch.sarPerUsd = v;
  }
  if ("brokerCashUsd" in r) {
    const v = r.brokerCashUsd;
    if (v === null || v === "") patch.brokerCashUsd = null;
    else {
      const n = Number(v);
      if (!(Number.isFinite(n) && n >= 0 && n < 1e10)) return { error: "نقد البروكر غير صالح" };
      patch.brokerCashUsd = n;
    }
  }
  return { patch };
}
