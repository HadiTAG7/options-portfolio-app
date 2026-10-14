import { randomUUID } from "node:crypto";
import type { Firestore, Transaction } from "firebase-admin/firestore";
import type { PartnerSnapshot } from "@/types";
import { safeNumber } from "@/lib/utils";
import {
  planFundingDay,
  fingerprintPlan,
  type FundingPlan,
} from "@/lib/funding-day";
import type { FundingRound, FundingRoundPatch, FundingSummaryLine } from "@/lib/funding-round";
import { mapFundState, type DocLike } from "@/lib/server/fund-state";

// Server side of يوم التمويل. Everything that moves money happens inside
// ONE Firestore transaction: all reads first, then every write, committed
// together or not at all. The browser's store actions can't do this — the
// client shim has no transactions — which is why execution lives here.

export class FundingError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly payload?: unknown
  ) {
    super(message);
  }
}

const ROUNDS = "funding_rounds";
const DEFAULT_RATE = 3.735;

// The admin SDK rejects undefined; JSON round-trip drops it from objects.
// Every number written is asserted finite first, so nothing becomes null
// silently.
function clean<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
function assertFinite(label: string, n: number) {
  if (!Number.isFinite(n)) {
    throw new FundingError(`قيمة غير صالحة في ${label}`, 500, "non_finite");
  }
}

function roundFromDoc(d: DocLike): FundingRound {
  return { ...(d.data() as Omit<FundingRound, "id">), id: d.id };
}

// The restorable before-state, from the RAW document (not the mapped
// Partner, which applies display fallbacks).
function snapshotFromRaw(id: string, raw: Record<string, unknown>): PartnerSnapshot {
  return {
    id,
    currentBalance: safeNumber(raw.currentBalance),
    total_balance: safeNumber(raw.total_balance),
    totalDeposits: safeNumber(raw.totalDeposits),
    totalWithdrawals: safeNumber(raw.totalWithdrawals),
    baseCapital: safeNumber(raw.baseCapital),
    last_settlement_date: (raw.last_settlement_date as string | null | undefined) ?? null,
    profitTakenGross: safeNumber(raw.profitTakenGross),
    gpFeesAccrued: safeNumber(raw.gpFeesAccrued),
    balanceHistory: Array.isArray(raw.balanceHistory)
      ? (raw.balanceHistory as PartnerSnapshot["balanceHistory"])
      : [],
  };
}

function snapshotFields(s: PartnerSnapshot): Omit<PartnerSnapshot, "id"> {
  const { id: _id, ...fields } = s;
  void _id;
  return fields;
}

function sameSnapshot(raw: Record<string, unknown>, s: PartnerSnapshot): boolean {
  const num = (a: unknown, b: number) => Math.abs(safeNumber(a) - b) < 1e-6;
  const hist = Array.isArray(raw.balanceHistory) ? raw.balanceHistory : [];
  return (
    num(raw.currentBalance, s.currentBalance) &&
    num(raw.total_balance, s.total_balance) &&
    num(raw.totalDeposits, s.totalDeposits) &&
    num(raw.totalWithdrawals, s.totalWithdrawals) &&
    num(raw.baseCapital, s.baseCapital) &&
    num(raw.profitTakenGross, s.profitTakenGross) &&
    num(raw.gpFeesAccrued, s.gpFeesAccrued) &&
    ((raw.last_settlement_date as string | null | undefined) ?? null) === s.last_settlement_date &&
    JSON.stringify(hist) === JSON.stringify(s.balanceHistory)
  );
}

// ── Drafts ────────────────────────────────────────────────────────────

export async function listRounds(db: Firestore): Promise<FundingRound[]> {
  const snap = await db.collection(ROUNDS).get();
  return snap.docs
    .map(roundFromDoc)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, 24);
}

export async function getCurrentDraft(db: Firestore): Promise<FundingRound | null> {
  const rounds = await listRounds(db);
  return rounds.find((r) => r.status === "draft") ?? null;
}

// One open draft at a time: create returns the existing one if present.
export async function createDraft(
  db: Firestore,
  uid: string,
  sarPerUsd: number | null
): Promise<FundingRound> {
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(db.collection(ROUNDS));
    const existing = snap.docs.map(roundFromDoc).find((r) => r.status === "draft");
    if (existing) return existing;
    const now = new Date().toISOString();
    const ref = db.collection(ROUNDS).doc(randomUUID());
    const rate = sarPerUsd && Number.isFinite(sarPerUsd) && sarPerUsd > 1 ? sarPerUsd : DEFAULT_RATE;
    const round: FundingRound = {
      id: ref.id,
      status: "draft",
      version: 1,
      plannedDate: null,
      sarPerUsd: rate,
      brokerCashUsd: null,
      requests: [],
      createdAt: now,
      createdBy: uid,
      updatedAt: now,
      updatedBy: uid,
      executedAt: null,
      ledgerDate: null,
      opId: null,
      fingerprint: null,
      summary: null,
      revertedAt: null,
    };
    tx.set(ref, clean(round));
    return round;
  });
}

export async function saveDraft(
  db: Firestore,
  uid: string,
  roundId: string,
  baseVersion: number,
  patch: FundingRoundPatch
): Promise<FundingRound> {
  return db.runTransaction(async (tx) => {
    const ref = db.collection(ROUNDS).doc(roundId);
    const doc = await tx.get(ref);
    if (!doc.exists) throw new FundingError("الجولة غير موجودة", 404, "not_found");
    const round = roundFromDoc(doc);
    if (round.status !== "draft") {
      throw new FundingError("الجولة لم تعد مسودة", 409, "not_draft", { round });
    }
    if (round.version !== baseVersion) {
      throw new FundingError(
        "عُدّلت الجولة من جهاز آخر — تم تحميل آخر نسخة",
        409,
        "version",
        { round }
      );
    }
    const next: FundingRound = {
      ...round,
      ...patch,
      version: round.version + 1,
      updatedAt: new Date().toISOString(),
      updatedBy: uid,
    };
    tx.set(ref, clean(next));
    return next;
  });
}

export async function cancelDraft(db: Firestore, uid: string, roundId: string): Promise<FundingRound> {
  return db.runTransaction(async (tx) => {
    const ref = db.collection(ROUNDS).doc(roundId);
    const doc = await tx.get(ref);
    if (!doc.exists) throw new FundingError("الجولة غير موجودة", 404, "not_found");
    const round = roundFromDoc(doc);
    if (round.status !== "draft") throw new FundingError("الجولة لم تعد مسودة", 409, "not_draft");
    const next: FundingRound = {
      ...round,
      status: "cancelled",
      version: round.version + 1,
      updatedAt: new Date().toISOString(),
      updatedBy: uid,
    };
    tx.set(ref, clean(next));
    return next;
  });
}

// ── Preview & execute ────────────────────────────────────────────────

async function readState(db: Firestore, tx?: Transaction) {
  const get = (name: string) =>
    tx ? tx.get(db.collection(name)) : db.collection(name).get();
  const [p, t, m] = await Promise.all([get("partners"), get("trades"), get("monthly_profits")]);
  return mapFundState(p.docs, t.docs, m.docs);
}

function planFor(round: FundingRound, state: ReturnType<typeof mapFundState>, now: Date): FundingPlan {
  return planFundingDay({
    partners: state.partners,
    trades: state.trades,
    requests: round.requests,
    sarPerUsd: round.sarPerUsd,
    now,
    existingMonthlyKeys: state.monthlyKeys,
    brokerCashUsd: round.brokerCashUsd,
  });
}

export interface PreviewResult {
  round: FundingRound;
  plan: FundingPlan;
  fingerprint: string;
  serverTime: string;
}

// The authoritative preview the GP confirms: same mapping, same planner,
// server clock. Its fingerprint must match at execution.
export async function previewRound(db: Firestore, roundId: string): Promise<PreviewResult> {
  const doc = await db.collection(ROUNDS).doc(roundId).get();
  if (!doc.exists) throw new FundingError("الجولة غير موجودة", 404, "not_found");
  const round = roundFromDoc(doc);
  const state = await readState(db);
  const now = new Date();
  const plan = planFor(round, state, now);
  return {
    round,
    plan,
    fingerprint: fingerprintPlan(plan, round.id, round.version, round.sarPerUsd),
    serverTime: now.toISOString(),
  };
}

function summaryOf(plan: FundingPlan): FundingRound["summary"] {
  const lines: FundingSummaryLine[] = plan.lines.map((l) => ({
    partnerId: l.partnerId,
    name: l.name,
    kind: l.request?.kind ?? null,
    currency: l.currency,
    cashIn: l.cashIn,
    cashOut: l.cashOut,
    cashInCurrency: l.cashInCurrency,
    cashOutCurrency: l.cashOutCurrency,
    capitalized: l.capitalized,
    investmentAfter: l.investmentAfter,
    exits: l.exits,
  }));
  return { totals: plan.totals, lines };
}

export interface ExecuteResult {
  round: FundingRound;
  alreadyExecuted: boolean;
  plan: FundingPlan | null;
}

export async function executeRound(
  db: Firestore,
  uid: string,
  roundId: string,
  baseVersion: number,
  fingerprint: string
): Promise<ExecuteResult> {
  // Generated outside the transaction so a retry reuses the same ids.
  const opId = randomUUID();

  return db.runTransaction(async (tx) => {
    // ── Reads (all before any write) ──
    const roundRef = db.collection(ROUNDS).doc(roundId);
    const roundDoc = await tx.get(roundRef);
    if (!roundDoc.exists) throw new FundingError("الجولة غير موجودة", 404, "not_found");
    const round = roundFromDoc(roundDoc);
    if (round.status === "executed") {
      // Idempotent: a retried request after a dropped response.
      return { round, alreadyExecuted: true, plan: null };
    }
    if (round.status !== "draft") {
      throw new FundingError("الجولة ليست مسودة قابلة للتنفيذ", 409, "not_draft");
    }
    if (round.version !== baseVersion) {
      throw new FundingError("عُدّلت الجولة بعد المعاينة — راجع المعاينة من جديد", 409, "version");
    }
    const state = await readState(db, tx);
    const opsSnap = await tx.get(db.collection("operations"));

    const now = new Date();
    const plan = planFor(round, state, now);
    if (plan.errors.length > 0) {
      throw new FundingError("لا يمكن التنفيذ", 422, "plan_errors", { errors: plan.errors });
    }
    const fp = fingerprintPlan(plan, round.id, round.version, round.sarPerUsd);
    if (fp !== fingerprint) {
      throw new FundingError(
        "تغيّرت البيانات منذ المعاينة (صفقة أو رصيد) — راجع المعاينة الجديدة ثم نفّذ",
        409,
        "fingerprint",
        { plan, fingerprint: fp }
      );
    }

    const S = plan.settlementAt;
    const priorOpIds = opsSnap.docs
      .filter((d) => !(d.data() as { reversedAt?: string | null }).reversedAt)
      .map((d) => d.id);

    // ── Writes ──
    const before: PartnerSnapshot[] = [];
    const after: PartnerSnapshot[] = [];
    for (const line of plan.lines) {
      const raw = state.rawPartners.get(line.partnerId);
      if (!raw) throw new FundingError("شريك مفقود أثناء التنفيذ", 409, "partner_missing");
      before.push(snapshotFromRaw(line.partnerId, raw));
      after.push(line.after);
      const fields = snapshotFields(line.after);
      for (const [k, v] of Object.entries(fields)) {
        if (typeof v === "number") assertFinite(`${line.name}.${k}`, v);
      }
      tx.update(db.collection("partners").doc(line.partnerId), clean(fields));
    }

    const base = new Date(S).getTime();
    const transactionIds: string[] = [];
    plan.ledger.forEach((row, i) => {
      assertFinite("ledger", row.amount);
      const id = `${opId}_${String(i).padStart(3, "0")}`;
      transactionIds.push(id);
      tx.set(
        db.collection("transactions").doc(id),
        clean({
          id,
          investorId: row.investorId,
          amount: row.amount,
          type: row.type,
          date: plan.ledgerDate,
          note: row.note,
          related_partner_id: row.relatedPartnerId,
          opId,
          created_at: new Date(base + i + 1).toISOString(),
        })
      );
    });

    const frozenMonthlyIds: string[] = [];
    for (const f of plan.freezes) {
      frozenMonthlyIds.push(f.id);
      // create(): fails the whole transaction rather than overwrite an
      // entry that appeared since the read — frozen values are sacred.
      tx.create(
        db.collection("monthly_profits").doc(f.id),
        clean({
          id: f.id,
          month: f.month,
          partnerId: f.partnerId,
          gross: f.gross,
          fee: f.fee,
          net: f.net,
          updated_at: S,
          frozenBy: "funding_day",
          opId,
        })
      );
    }

    const label = `يوم التمويل ${plan.ledgerDate}`;
    tx.set(
      db.collection("operations").doc(opId),
      clean({
        id: opId,
        at: S,
        kind: "funding_day",
        label,
        partnerIds: plan.lines.map((l) => l.partnerId),
        snapshots: before,
        reversedAt: null,
        roundId: round.id,
        ledgerDate: plan.ledgerDate,
        fingerprint: fp,
        afterSnapshots: after,
        transactionIds,
        frozenMonthlyIds,
        priorOpIds,
        includedTradeIds: plan.includedTradeIds,
        created_at: S,
        createdBy: uid,
      })
    );

    const executed: FundingRound = {
      ...round,
      status: "executed",
      version: round.version + 1,
      executedAt: S,
      ledgerDate: plan.ledgerDate,
      opId,
      fingerprint: fp,
      summary: summaryOf(plan),
      updatedAt: now.toISOString(),
      updatedBy: uid,
    };
    tx.set(roundRef, clean(executed));
    return { round: executed, alreadyExecuted: false, plan };
  });
}

// ── Undo ─────────────────────────────────────────────────────────────

// Reverses a whole funding day atomically. Refuses unless every partner
// row is still exactly as the funding day left it — anything recorded
// since would otherwise be wiped by the restore. The books only: real
// transfers are not reversed by this.
export async function undoRound(db: Firestore, uid: string, roundId: string): Promise<FundingRound> {
  return db.runTransaction(async (tx) => {
    const roundRef = db.collection(ROUNDS).doc(roundId);
    const roundDoc = await tx.get(roundRef);
    if (!roundDoc.exists) throw new FundingError("الجولة غير موجودة", 404, "not_found");
    const round = roundFromDoc(roundDoc);
    if (round.status !== "executed" || !round.opId) {
      throw new FundingError("الجولة غير منفّذة", 409, "not_executed");
    }
    const opRef = db.collection("operations").doc(round.opId);
    const opDoc = await tx.get(opRef);
    const op = opDoc.data() as
      | {
          at: string;
          reversedAt: string | null;
          snapshots: PartnerSnapshot[];
          afterSnapshots: PartnerSnapshot[];
          transactionIds: string[];
          frozenMonthlyIds: string[];
          priorOpIds?: string[];
        }
      | undefined;
    if (!op || op.reversedAt) {
      throw new FundingError("عملية يوم التمويل غير موجودة أو ملغاة", 409, "op_missing");
    }

    const partnerDocs = await Promise.all(
      op.afterSnapshots.map((s) => tx.get(db.collection("partners").doc(s.id)))
    );
    const freezeDocs = await Promise.all(
      (op.frozenMonthlyIds ?? []).map((id) => tx.get(db.collection("monthly_profits").doc(id)))
    );
    const opsSnap = await tx.get(db.collection("operations"));

    // Any later, still-applied operation on these partners blocks the undo.
    // Operations listed in priorOpIds happened BEFORE the funding day even
    // if a fast device clock stamped them later, so they never count.
    const touched = new Set(op.afterSnapshots.map((s) => s.id));
    const prior = new Set(op.priorOpIds ?? []);
    const later = opsSnap.docs.find((d) => {
      const o = d.data() as { at?: string; reversedAt?: string | null; partnerIds?: string[] };
      return (
        d.id !== round.opId &&
        !prior.has(d.id) &&
        !o.reversedAt &&
        String(o.at ?? "") > op.at &&
        (o.partnerIds ?? []).some((p) => touched.has(p))
      );
    });
    if (later) {
      throw new FundingError(
        "توجد عملية أحدث على أحد الشركاء بعد يوم التمويل — ألغها أولاً",
        409,
        "later_op"
      );
    }
    partnerDocs.forEach((d, i) => {
      const expected = op.afterSnapshots[i];
      const raw = d.data();
      if (!raw || !sameSnapshot(raw, expected)) {
        throw new FundingError(
          "تغيّر رصيد أحد الشركاء بعد يوم التمويل — الإلغاء سيمسح ذلك التغيير، فتم إيقافه",
          409,
          "partner_changed"
        );
      }
    });

    // ── Writes ──
    for (const snap of op.snapshots) {
      tx.update(db.collection("partners").doc(snap.id), clean(snapshotFields(snap)));
    }
    for (const id of op.transactionIds ?? []) {
      tx.delete(db.collection("transactions").doc(id));
    }
    // Remove only the monthly freezes this day created and nobody edited.
    freezeDocs.forEach((d) => {
      const f = d.data() as { opId?: string; updated_at?: string } | undefined;
      if (f && f.opId === round.opId && f.updated_at === op.at) tx.delete(d.ref);
    });
    const now = new Date().toISOString();
    tx.update(opRef, { reversedAt: now });
    const reverted: FundingRound = {
      ...round,
      status: "reverted",
      version: round.version + 1,
      revertedAt: now,
      updatedAt: now,
      updatedBy: uid,
    };
    tx.set(roundRef, clean(reverted));
    return reverted;
  });
}
