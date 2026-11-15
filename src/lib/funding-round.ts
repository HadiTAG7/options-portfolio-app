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
  // SAR per USD by direction (riyal deposits / riyal withdrawals).
  depositSarPerUsd?: number;
  withdrawSarPerUsd?: number;
  // Legacy single rate — rounds saved before the split carry only this.
  sarPerUsd?: number;
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
  // Installments actually paid against the round's amounts — the broker
  // transfer and each partner's deposit/payout often move in several
  // tranches. Operational tracking only: the books were (or will be)
  // written once, at execution. Adding one never bumps `version`, so it
  // can't collide with the draft's autosave.
  payments?: FundingPayment[];
  // Bumped by every payment add/remove (never by draft saves), so a client
  // holding two copies of the round can tell which payments are newer.
  paymentsRev?: number;
}

// "broker" or a partnerId. The direction is implied by the round: the
// broker side follows the net (deposit to / withdraw from the broker), a
// partner side follows their request (receive a deposit / pay a payout).
export type PaymentParty = "broker" | string;

export interface FundingPayment {
  id: string;
  party: PaymentParty;
  amount: number; // positive, in `currency`
  // Fixed by the party: USD for the broker, the request's own currency for
  // a partner — so a remaining amount is never a mixed-currency sum.
  currency: FundingCurrency;
  date: string; // YYYY-MM-DD (Riyadh)
  note: string | null;
  createdAt: string;
  createdBy: string;
}

// One thing to pay or collect, and how far along it is.
export interface PaymentItem {
  party: PaymentParty;
  expected: number; // in `currency`
  currency: FundingCurrency;
}

export interface PaymentProgress extends PaymentItem {
  paid: number;
  remaining: number; // never negative
  overpaid: number; // paid beyond expected, if any
  complete: boolean;
  payments: FundingPayment[]; // oldest first
}

const HALF_CENT = 0.005;

// What there is to pay or collect in a round: the broker net (USD) and
// each partner's deposit or payout in the currency the cash moves in.
// One definition for the summary, the page and the history.
export function paymentItemsFor(
  totals: Pick<FundingTotals, "net" | "brokerAction">,
  lines: Array<
    Pick<FundingSummaryLine, "partnerId" | "cashIn" | "cashOut" | "cashInCurrency" | "cashOutCurrency" | "currency">
  >
): PaymentItem[] {
  const items: PaymentItem[] = [];
  if (totals.brokerAction !== "none") {
    items.push({ party: "broker", expected: Math.abs(totals.net), currency: "USD" });
  }
  for (const l of lines) {
    if (l.cashIn >= HALF_CENT) {
      items.push({
        party: l.partnerId,
        expected: l.currency === "SAR" ? l.cashInCurrency : l.cashIn,
        currency: l.currency,
      });
    } else if (l.cashOut >= HALF_CENT) {
      items.push({
        party: l.partnerId,
        expected: l.currency === "SAR" ? l.cashOutCurrency : l.cashOut,
        currency: l.currency,
      });
    }
  }
  return items;
}

export function paymentProgress(
  items: PaymentItem[],
  payments: FundingPayment[] | null | undefined
): PaymentProgress[] {
  const all = [...(payments ?? [])].sort(
    (a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt)
  );
  return items.map((item) => {
    const mine = all.filter((p) => p.party === item.party && p.currency === item.currency);
    const paid = mine.reduce((s2, p) => s2 + p.amount, 0);
    const diff = item.expected - paid;
    return {
      ...item,
      paid,
      remaining: diff > HALF_CENT ? diff : 0,
      overpaid: diff < -HALF_CENT ? -diff : 0,
      complete: diff <= HALF_CENT,
      payments: mine,
    };
  });
}

// Recorded payments that match nothing to pay in the round — the request
// was removed or its currency changed after the payment was recorded.
// Shown separately so a recorded payment never silently disappears.
export function unmatchedPayments(
  items: PaymentItem[],
  payments: FundingPayment[] | null | undefined
): FundingPayment[] {
  const keys = new Set(items.map((i) => `${i.party}|${i.currency}`));
  return (payments ?? [])
    .filter((p) => !keys.has(`${p.party}|${p.currency}`))
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
}

// Of two copies of the same round, the one whose payments are newer.
export function newerPayments<T extends Pick<FundingRound, "payments" | "paymentsRev">>(a: T, b: T): T {
  return (b.paymentsRev ?? 0) >= (a.paymentsRev ?? 0) ? b : a;
}

// Shape check for a payment a client sends. The server fixes the currency
// from the party; the client only names party, amount, date and note.
export function sanitizePayment(
  raw: unknown
): { payment: { party: string; amount: number; date: string; note: string | null } } | { error: string } {
  if (!raw || typeof raw !== "object") return { error: "بيانات الدفعة غير صالحة" };
  const r = raw as Record<string, unknown>;
  const party = typeof r.party === "string" ? r.party.trim() : "";
  const amount = Number(r.amount);
  const date = typeof r.date === "string" ? r.date : "";
  if (!party || party.length > 128) return { error: "الدفعة بدون طرف" };
  if (!(Number.isFinite(amount) && amount > 0 && amount < 1e10)) return { error: "مبلغ الدفعة غير صالح" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "تاريخ الدفعة غير صالح" };
  const note = typeof r.note === "string" && r.note.trim() ? r.note.trim().slice(0, 200) : null;
  return { payment: { party, amount, date, note } };
}

export interface FundingRoundPatch {
  requests?: FundingRequest[];
  plannedDate?: string | null;
  depositSarPerUsd?: number;
  withdrawSarPerUsd?: number;
  brokerCashUsd?: number | null;
}

// What a funding day saved. Transfers themselves cost nothing; the only
// cost is the bank's exchange spread. Riyal deposits and withdrawals that
// offset each other are never converted, so the spread between the deposit
// and withdrawal rates on them stays with the GP instead of going to the
// bank. Informational only — nothing here is booked.
export interface FundingSavings {
  savedSar: number; // the spread kept on netted riyals (negative = a cost)
  savedUsd: number;
  fxAvoidedSar: number; // riyals that never needed converting
  volumeAvoidedUsd: number; // dollars that never crossed the broker
}

export function fundingSavings(
  totals: Pick<FundingTotals, "transferAvoided" | "fxAvoidedSar"> &
    Partial<Pick<FundingTotals, "fxSpreadUsd" | "fxSpreadSar">>
): FundingSavings {
  return {
    savedSar: totals.fxSpreadSar ?? 0,
    savedUsd: totals.fxSpreadUsd ?? 0,
    fxAvoidedSar: totals.fxAvoidedSar ?? 0,
    volumeAvoidedUsd: totals.transferAvoided ?? 0,
  };
}

// Savings of an executed round, from what it stored at execution.
export function roundSavings(round: FundingRound): FundingSavings | null {
  if (round.status !== "executed" || !round.summary) return null;
  return fundingSavings(round.summary.totals);
}

const DEFAULT_SAR_PER_USD = 3.735;

// A round's two rates, reading rounds saved before the split (one
// sarPerUsd) as the same rate in both directions — no migration needed.
export function roundRates(round: Pick<FundingRound, "depositSarPerUsd" | "withdrawSarPerUsd" | "sarPerUsd">): {
  rd: number;
  rw: number;
} {
  const legacy = round.sarPerUsd ?? DEFAULT_SAR_PER_USD;
  return {
    rd: round.depositSarPerUsd ?? legacy,
    rw: round.withdrawSarPerUsd ?? legacy,
  };
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
  for (const [key, label] of [
    ["depositSarPerUsd", "سعر صرف الإيداع"],
    ["withdrawSarPerUsd", "سعر صرف السحب"],
  ] as const) {
    if (key in r) {
      const v = Number(r[key]);
      if (!(Number.isFinite(v) && v > 1 && v < 10)) return { error: `${label} غير صالح` };
      patch[key] = v;
    }
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
