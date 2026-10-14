import type { Partner, PartnerSnapshot, Trade } from "@/types";
import type { BalanceHistoryEntry } from "@/types/database";
import {
  computePartnerDistributionFromTrades,
  isEligible,
  isManagerPartner,
  monthlyPartnerNet,
  tradeMonthKey,
  tradeProfit,
  tradeProfitDate,
} from "@/lib/partner-profit";
import { getPartnerInvestment, safeNumber } from "@/lib/utils";
import { riyadhDate, riyadhMonthKey } from "@/lib/riyadh-time";
import { fmtSar, fmtUsd } from "@/lib/money-format";

// يوم التمويل — the unified funding day.
//
// Every partner's deposit/withdrawal request is executed together on one
// day, so only the NET amount crosses to or from the broker. This module is
// the whole calculation, as a pure function: the page uses it for the live
// estimate and the server runs the SAME function inside the Firestore
// transaction that commits it.
//
// Why one function over one snapshot, instead of calling the store's
// per-partner actions in a loop: the profit engine weights every unsettled
// trade by each partner's investment TODAY. Settling or moving one
// partner's capital changes everyone else's pending profit, so a loop
// gives each partner a figure computed from a different state and leaks
// value between them. Here every figure comes from a single distribution,
// and all partners settle at the same instant S.
//
// Order of effects per partner, all at S:
//   1. Settle the cycle: pending net is paid out (if requested) or
//      capitalized — including a negative cycle, which is booked into
//      capital. LP fees move to the GP's commission pot.
//   2. Capital withdrawals (the part of a withdrawal beyond profit).
//   3. Deposits.

export type FundingRequestKind = "deposit" | "withdraw" | "withdraw_profits" | "exit";
export type FundingCurrency = "USD" | "SAR";

export interface FundingRequest {
  partnerId: string;
  kind: FundingRequestKind;
  // In `currency`. Required for deposit / withdraw; ignored otherwise
  // (withdraw_profits and exit are computed amounts).
  amount: number | null;
  currency: FundingCurrency;
  note: string | null;
}

export interface PlanInput {
  partners: Partner[]; // active partners, mapped by fund-rows.rowToPartner
  trades: Trade[];
  requests: FundingRequest[];
  sarPerUsd: number;
  // The moment the plan is computed for. On the server: server time at
  // execution. In the browser preview: device time (an estimate).
  now: Date;
  // `${month}__${partnerId}` ids already present in monthly_profits. When
  // given, the plan includes the freezes to write; when absent, none.
  existingMonthlyKeys?: ReadonlySet<string>;
  // Optional: GP-entered cash at the broker, for the affordability warning.
  brokerCashUsd?: number | null;
}

export interface PlannedTx {
  investorId: string;
  type: "Deposit" | "Withdrawal" | "Fee" | "Capitalize";
  // USD. Positive, except a Capitalize row booking a losing cycle.
  amount: number;
  note: string;
  relatedPartnerId: string | null;
}

export interface PlannedFreeze {
  id: string; // `${month}__${partnerId}`
  month: string;
  partnerId: string;
  gross: number;
  fee: number;
  net: number;
}

export interface FundingLine {
  partnerId: string;
  name: string;
  isManager: boolean;
  request: FundingRequest | null;
  // Request amount converted to USD (deposit / withdraw), else null.
  requestUsd: number | null;
  investmentBefore: number;
  pendingNet: number; // the cycle being settled (LP: after fee)
  fee: number; // LP performance fee moving to the GP pot
  potBefore: number; // GP only
  potAfterFees: number; // GP only: pot + all LP fees of this round
  profitPaid: number;
  potPaid: number; // GP only
  capitalized: number; // pending kept in the fund (negative = loss booked)
  capitalWithdrawn: number;
  deposit: number;
  cashIn: number; // USD booked
  cashOut: number; // USD booked
  // What actually changes hands, in the request's currency.
  cashInCurrency: number;
  cashOutCurrency: number;
  currency: FundingCurrency;
  exits: boolean;
  investmentAfter: number;
  potAfter: number;
  after: PartnerSnapshot;
}

export interface FundingTotals {
  deposits: number; // USD
  withdrawals: number; // USD
  net: number; // deposits − withdrawals
  brokerAction: "deposit" | "withdraw" | "none";
  transferAvoided: number; // USD that did not have to cross the broker
  usdIn: number;
  usdOut: number;
  sarIn: number;
  sarOut: number;
  fxNeededSar: number; // |sarIn − sarOut|
  fxAvoidedSar: number; // 2·min(sarIn, sarOut)
  settledGross: number; // Σ cycle profit settled (before fees)
  feesToGp: number;
}

export interface FundingPlan {
  settlementAt: string; // S, ISO
  ledgerDate: string; // Riyadh YYYY-MM-DD
  lines: FundingLine[];
  ledger: PlannedTx[];
  freezes: PlannedFreeze[];
  totals: FundingTotals;
  includedTradeIds: string[];
  errors: string[];
  warnings: string[];
}

// Below this a ledger row is not written (a sub-cent amount is still
// capitalized into the balance — never just dropped).
const CENT = 0.005;
// A trade or settlement stamp further than this in the future blocks
// execution: settling past it would hide it, settling before it would
// re-open trades.
const FUTURE_TOLERANCE_MS = 60_000;

export function round2(n: number): number {
  return Math.round((n + Math.sign(n) * Number.EPSILON) * 100) / 100;
}

// Cash paid out of a computed amount is floored to the cent: never pay
// more than is owed. The sub-cent remainder stays in the fund (capitalized
// or left in the commission pot), so nothing is lost either.
function floor2(n: number): number {
  return n <= 0 ? 0 : Math.floor(n * 100 + 1e-7) / 100;
}

// A request amount in USD (books are USD). SAR converts at the round rate.
export function toUsd(amount: number, currency: FundingCurrency, sarPerUsd: number): number {
  return round2(currency === "SAR" ? amount / sarPerUsd : amount);
}

function byId<T extends { id: string }>(a: T, b: T): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function stampMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : null;
}

const KIND_AR: Record<FundingRequestKind, string> = {
  deposit: "إيداع",
  withdraw: "سحب",
  withdraw_profits: "سحب الأرباح",
  exit: "خروج",
};

export function planFundingDay(input: PlanInput): FundingPlan {
  const errors: string[] = [];
  const warnings: string[] = [];
  const rate = input.sarPerUsd;
  const nowMs = input.now.getTime();

  // Deterministic order, so the browser and the server sum floats in the
  // same sequence and arrive at the same digits.
  const partners = [...input.partners].sort(byId);
  const trades = [...input.trades].sort(byId);
  const nameOf = (id: string) => partners.find((p) => p.id === id)?.name ?? id;

  const managers = partners.filter(isManagerPartner);
  if (managers.length !== 1) {
    errors.push(`يلزم مدير واحد بالضبط في قائمة الشركاء (الموجود: ${managers.length}).`);
  }
  const gp = managers[0] ?? null;

  // ── Requests ───────────────────────────────────────────────────────
  const requestBy = new Map<string, FundingRequest>();
  for (const r of input.requests) {
    if (!partners.some((p) => p.id === r.partnerId)) {
      errors.push("طلب لشريك غير موجود أو مؤرشف.");
      continue;
    }
    if (requestBy.has(r.partnerId)) {
      errors.push(`أكثر من طلب لـ ${nameOf(r.partnerId)} — طلب واحد لكل شريك.`);
      continue;
    }
    if (r.currency === "SAR" && !(Number.isFinite(rate) && rate > 0)) {
      errors.push("سعر الصرف غير صالح.");
    }
    if (r.kind === "deposit" || r.kind === "withdraw") {
      if (!(typeof r.amount === "number" && Number.isFinite(r.amount) && r.amount > 0)) {
        errors.push(`مبلغ ${KIND_AR[r.kind]} لـ ${nameOf(r.partnerId)} غير صالح.`);
        continue;
      }
    }
    if (r.kind === "exit" && gp && r.partnerId === gp.id) {
      errors.push("خروج المدير من الصندوق غير مدعوم في يوم التمويل.");
      continue;
    }
    requestBy.set(r.partnerId, r);
  }

  // ── One distribution snapshot ──────────────────────────────────────
  const dist = computePartnerDistributionFromTrades(partners, trades);

  // ── Settlement instant S ───────────────────────────────────────────
  // Every trade counted in this snapshot must be excluded afterwards, so S
  // must not precede any included trade's stamp nor any existing
  // settlement; it must not sit in the future either.
  let maxStamp = nowMs;
  const includedTradeIds: string[] = [];
  for (const t of trades) {
    if (tradeProfit(t) === 0) continue;
    const profitDate = tradeProfitDate(t);
    if (!profitDate) continue;
    if (!partners.some((p) => isEligible(p, profitDate, t.createdAt))) continue;
    includedTradeIds.push(t.id);
    const ms = stampMs(t.createdAt?.trim() || profitDate);
    if (ms === null) continue;
    if (ms > nowMs + FUTURE_TOLERANCE_MS) {
      errors.push(
        `صفقة ${t.ticker} مسجّلة بتاريخ مستقبلي (${t.createdAt || profitDate}) — صحّح تاريخها، أو أعد المحاولة بعد دقائق إن كانت ساعة الجهاز متقدمة.`
      );
    }
    if (ms > maxStamp) maxStamp = ms;
  }
  for (const p of partners) {
    const ms = stampMs(p.lastSettlementDate);
    if (ms === null) continue;
    if (ms > nowMs + FUTURE_TOLERANCE_MS) {
      errors.push(`تاريخ آخر تثبيت لـ ${p.name} في المستقبل — لا يمكن التنفيذ قبله.`);
    }
    if (ms > maxStamp) maxStamp = ms;
  }
  const S = new Date(maxStamp + 1);
  const settlementAt = S.toISOString();
  const ledgerDate = riyadhDate(S);
  const dayTag = "يوم التمويل";

  // ── GP pot: grows by every LP fee settled in this round ───────────
  let feesToGp = 0;
  for (const p of partners) {
    if (gp && p.id === gp.id) continue;
    feesToGp += safeNumber(dist[p.id]?.feeAmount);
  }
  const potBefore = gp ? safeNumber(gp.gpFeesAccrued) : 0;
  const potAfterFees = potBefore + feesToGp;

  // ── Per-partner lines ─────────────────────────────────────────────
  const lines: FundingLine[] = [];
  const ledger: PlannedTx[] = [];
  const pushTx = (tx: PlannedTx) => {
    if (Math.abs(tx.amount) >= CENT) ledger.push(tx);
  };
  let settledGross = 0;

  for (const p of partners) {
    const d = dist[p.id];
    const isGP = gp !== null && p.id === gp.id;
    const req = requestBy.get(p.id) ?? null;
    const N = safeNumber(d?.settleableNet);
    const fee = isGP ? 0 : safeNumber(d?.feeAmount);
    settledGross += safeNumber(d?.grossProfit);
    const inv0 = getPartnerInvestment(p);
    const pot1 = isGP ? potAfterFees : 0;
    const equity0 = inv0 + N + pot1; // everything the partner could take today

    const requestUsd =
      req && (req.kind === "deposit" || req.kind === "withdraw") && req.amount !== null
        ? toUsd(req.amount, req.currency, rate)
        : null;

    let profitPaid = 0;
    let potPaid = 0;
    let capitalWithdrawn = 0;
    let deposit = 0;
    let exits = false;

    if (req?.kind === "deposit" && requestUsd !== null) {
      deposit = requestUsd;
    } else if (req?.kind === "withdraw" && requestUsd !== null) {
      if (requestUsd > equity0 + CENT) {
        errors.push(
          `سحب ${fmtUsd(requestUsd)} لـ ${p.name} أكبر من رصيده المتاح ${fmtUsd(equity0)}.`
        );
      } else {
        // Profit first, then (GP) the commission pot, then capital.
        profitPaid = Math.min(requestUsd, Math.max(0, N));
        const rest = requestUsd - profitPaid;
        potPaid = isGP ? Math.min(rest, pot1) : 0;
        capitalWithdrawn = Math.max(0, rest - potPaid);
      }
    } else if (req?.kind === "withdraw_profits") {
      profitPaid = floor2(N);
      potPaid = isGP ? floor2(pot1) : 0;
    } else if (req?.kind === "exit") {
      exits = true;
      const cash = round2(inv0 + N);
      if (cash < 0) {
        errors.push(`رصيد ${p.name} سالب — لا يمكن الخروج.`);
      } else {
        profitPaid = Math.max(0, N);
        capitalWithdrawn = Math.max(0, cash - profitPaid);
      }
    }

    // Pending not paid out stays in the fund. A negative cycle (loss) is
    // booked here too, so the new cycle starts from zero for everyone.
    const capitalized = N - profitPaid;
    const delta = capitalized - capitalWithdrawn + deposit;
    let investmentAfter = inv0 + delta;
    // A withdrawal that empties the account within a cent is an exit; the
    // sub-cent residual of cent-rounded cash is the documented tolerance.
    if (exits || Math.abs(investmentAfter) < CENT) {
      investmentAfter = 0;
      exits = exits || (req?.kind === "withdraw" && inv0 > 0);
    }
    if (investmentAfter < -CENT) {
      errors.push(`رأس مال ${p.name} يصبح سالباً بعد العملية.`);
    }
    const zeroed = investmentAfter === 0;
    const potAfter = isGP ? pot1 - potPaid : safeNumber(p.gpFeesAccrued);

    const currentAfter = zeroed ? 0 : safeNumber(p.currentBalance) + delta;
    const history: BalanceHistoryEntry[] = Array.isArray(p.balanceHistory)
      ? [...p.balanceHistory]
      : [];
    if (Math.abs(currentAfter - safeNumber(p.currentBalance)) >= CENT) {
      history.push({ date: ledgerDate, balance: currentAfter });
    }
    const after: PartnerSnapshot = {
      id: p.id,
      currentBalance: currentAfter,
      total_balance: zeroed ? 0 : safeNumber(p.totalBalance) + delta,
      totalDeposits: investmentAfter,
      totalWithdrawals: safeNumber(p.totalWithdrawals) + profitPaid + capitalWithdrawn,
      baseCapital: zeroed ? 0 : safeNumber(p.baseCapital) + delta,
      last_settlement_date: settlementAt,
      profitTakenGross: 0,
      gpFeesAccrued: potAfter,
      balanceHistory: history,
    };

    const cashIn = deposit;
    const cashOut = profitPaid + potPaid + capitalWithdrawn;
    const currency: FundingCurrency = req?.currency ?? "USD";
    // What changes hands: the GP's typed SAR amount when given, otherwise
    // the USD figure converted at the round rate.
    const typedSar =
      req && req.currency === "SAR" && req.amount !== null && requestUsd !== null
        ? req.amount
        : null;
    const cashInCurrency =
      currency === "SAR" ? (cashIn > 0 ? (typedSar ?? round2(cashIn * rate)) : 0) : cashIn;
    const cashOutCurrency =
      currency === "SAR"
        ? cashOut > 0
          ? (req?.kind === "withdraw" && typedSar !== null ? typedSar : round2(cashOut * rate))
          : 0
        : cashOut;

    // ── Ledger rows ──
    // SAR requests carry the riyal figure in the note. When a withdrawal
    // lands in a single row, that row shows exactly what the GP typed;
    // split across profit / pot / capital, each row shows its converted
    // share (informational — the books are the USD amounts).
    const cashRows = [profitPaid, potPaid, capitalWithdrawn].filter((v) => v >= CENT).length;
    const exactSarFor = (isDeposit: boolean) =>
      isDeposit || (req?.kind === "withdraw" && cashRows === 1) ? typedSar : null;
    const sarNote = (usd: number, exact: number | null) =>
      currency === "SAR" ? ` — ${fmtSar(exact ?? round2(usd * rate))} بسعر ${rate}` : "";
    const extra = req?.note?.trim() ? ` — ${req.note.trim()}` : "";

    pushTx({
      investorId: p.id,
      type: "Capitalize",
      amount: capitalized,
      note:
        capitalized >= 0
          ? `تثبيت الأرباح في رأس المال — ${dayTag}`
          : `خسارة الدورة مخصومة من رأس المال — ${dayTag}`,
      relatedPartnerId: null,
    });
    if (!isGP && fee >= CENT && gp) {
      ledger.push({
        investorId: gp.id,
        type: "Fee",
        amount: fee,
        note: `رسوم أداء من تسوية ${p.name} — ${dayTag}`,
        relatedPartnerId: p.id,
      });
    }
    pushTx({
      investorId: p.id,
      type: "Withdrawal",
      amount: profitPaid,
      note: `سحب أرباح — ${dayTag}${sarNote(profitPaid, exactSarFor(false))}${extra}`,
      relatedPartnerId: null,
    });
    pushTx({
      investorId: p.id,
      type: "Withdrawal",
      amount: potPaid,
      note: `سحب عمولة المدير (نقداً) — ${dayTag}${sarNote(potPaid, exactSarFor(false))}${extra}`,
      relatedPartnerId: null,
    });
    pushTx({
      investorId: p.id,
      type: "Withdrawal",
      amount: capitalWithdrawn,
      note: `${exits ? "خروج من الصندوق" : "سحب من رأس المال"} — ${dayTag}${sarNote(
        capitalWithdrawn,
        exactSarFor(false)
      )}${extra}`,
      relatedPartnerId: null,
    });
    pushTx({
      investorId: p.id,
      type: "Deposit",
      amount: deposit,
      note: `إيداع رأس مال — ${dayTag}${sarNote(deposit, exactSarFor(true))}${extra}`,
      relatedPartnerId: null,
    });

    lines.push({
      partnerId: p.id,
      name: p.name,
      isManager: isGP,
      request: req,
      requestUsd,
      investmentBefore: inv0,
      pendingNet: N,
      fee,
      potBefore: isGP ? potBefore : 0,
      potAfterFees: isGP ? potAfterFees : 0,
      profitPaid,
      potPaid,
      capitalized,
      capitalWithdrawn,
      deposit,
      cashIn,
      cashOut,
      cashInCurrency,
      cashOutCurrency,
      currency,
      exits,
      investmentAfter,
      potAfter,
      after,
    });
  }

  // ── Totals ─────────────────────────────────────────────────────────
  let deposits = 0;
  let withdrawals = 0;
  let usdIn = 0;
  let usdOut = 0;
  let sarIn = 0;
  let sarOut = 0;
  for (const l of lines) {
    deposits += l.cashIn;
    withdrawals += l.cashOut;
    if (l.currency === "SAR") {
      sarIn += l.cashInCurrency;
      sarOut += l.cashOutCurrency;
    } else {
      usdIn += l.cashIn;
      usdOut += l.cashOut;
    }
  }
  const net = deposits - withdrawals;
  const totals: FundingTotals = {
    deposits,
    withdrawals,
    net,
    brokerAction: net >= CENT ? "deposit" : net <= -CENT ? "withdraw" : "none",
    transferAvoided: 2 * Math.min(deposits, withdrawals),
    usdIn,
    usdOut,
    sarIn,
    sarOut,
    fxNeededSar: Math.abs(sarIn - sarOut),
    fxAvoidedSar: 2 * Math.min(sarIn, sarOut),
    settledGross,
    feesToGp,
  };

  // ── Freeze completed months before capital changes re-split them ───
  const freezes: PlannedFreeze[] = [];
  if (input.existingMonthlyKeys) {
    const current = riyadhMonthKey(S);
    const months = new Set<string>();
    for (const t of trades) {
      const k = tradeMonthKey(t);
      if (k && k < current) months.add(k);
    }
    for (const month of [...months].sort()) {
      for (const p of partners) {
        const id = `${month}__${p.id}`;
        if (input.existingMonthlyKeys.has(id)) continue;
        const v = monthlyPartnerNet(partners, trades, p.id, month);
        if (Math.abs(v.gross) < CENT && Math.abs(v.net) < CENT) continue;
        freezes.push({ id, month, partnerId: p.id, ...v });
      }
    }
  }

  // ── Warnings (shown, never blocking) ──────────────────────────────
  const today = riyadhDate(input.now);
  const review = trades.filter((t) => t.needsReview).map((t) => t.ticker);
  if (review.length > 0) {
    warnings.push(
      `صفقات تحتاج تسوية قبل التنفيذ: ${[...new Set(review)].join("، ")} — بعد يوم التمويل لن يغيّر تعديلها أرباح الدورة المقفلة.`
    );
  }
  const staleOpen = trades
    .filter(
      (t) =>
        (t.type === "Sell Put" || t.type === "Sell Call") &&
        t.status === "open" &&
        t.expiration &&
        t.expiration.slice(0, 10) < today
    )
    .map((t) => t.ticker);
  if (staleOpen.length > 0) {
    warnings.push(`عقود انتهت ولم تُقفل بعد: ${[...new Set(staleOpen)].join("، ")}.`);
  }
  const stamps = new Set(
    partners.map((p) => p.lastSettlementDate?.slice(0, 10)).filter(Boolean)
  );
  if (stamps.size > 1 || (stamps.size === 1 && partners.some((p) => !p.lastSettlementDate))) {
    warnings.push(
      "تواريخ آخر تثبيت تختلف بين الشركاء — يوم التمويل يوحّدها، لكن الدورة الحالية تمتد على فترات مختلفة."
    );
  }
  for (const p of partners) {
    const drift = safeNumber(p.currentBalance) - getPartnerInvestment(p);
    if (Math.abs(drift) >= 0.01) {
      warnings.push(
        `رصيد ${p.name} المسجّل يختلف عن استثماره بفرق ${fmtUsd(drift)} — الفرق يبقى كما هو ولا يُنقل لأحد.`
      );
    }
  }
  for (const l of lines) {
    if (l.capitalized <= -CENT) {
      warnings.push(`دورة ${l.name} خاسرة: ${fmtUsd(l.capitalized)} تُخصم من رأس ماله.`);
    }
  }
  const capitalMoves = lines.some((l) => l.capitalWithdrawn >= CENT || l.deposit >= CENT);
  if (capitalMoves) {
    const currentMonth = riyadhMonthKey(S);
    const n = trades.filter(
      (t) => tradeMonthKey(t) === currentMonth && tradeProfit(t) !== 0
    ).length;
    if (n > 0) {
      warnings.push(
        `${n} صفقة في الشهر الحالي سيُعاد توزيعها في سجل الشهر بحسب رؤوس الأموال الجديدة — الأفضل تنفيذ يوم التمويل أول الشهر.`
      );
    }
  }
  if (
    typeof input.brokerCashUsd === "number" &&
    Number.isFinite(input.brokerCashUsd) &&
    totals.brokerAction === "withdraw" &&
    -net > input.brokerCashUsd + CENT
  ) {
    warnings.push(
      `السحب الصافي ${fmtUsd(-net)} أكبر من النقد المتاح عند البروكر ${fmtUsd(input.brokerCashUsd)}.`
    );
  }

  return {
    settlementAt,
    ledgerDate,
    lines,
    ledger,
    freezes,
    totals,
    includedTradeIds,
    errors,
    warnings,
  };
}

// ── Fingerprint ─────────────────────────────────────────────────────
// A change detector between the preview the GP confirmed and the state
// the server finds at commit. Covers every amount that moves (rounded to
// cents) plus the round's identity; excludes the instant S, the ledger
// date and labels, which legitimately differ between preview and commit.
export function fingerprintPlan(
  plan: FundingPlan,
  roundId: string,
  roundVersion: number,
  sarPerUsd: number
): string {
  const c = (n: number) => Math.round(n * 100);
  const canonical = JSON.stringify({
    r: roundId,
    v: roundVersion,
    x: Math.round(sarPerUsd * 1e6),
    l: plan.lines.map((l) => [
      l.partnerId,
      c(l.pendingNet),
      c(l.fee),
      c(l.profitPaid),
      c(l.potPaid),
      c(l.capitalized),
      c(l.capitalWithdrawn),
      c(l.deposit),
      c(l.investmentAfter),
      c(l.potAfter),
    ]),
    e: plan.errors.length,
  });
  // Two FNV-1a 32-bit passes with different offset bases → 64 bits.
  const fnv = (seed: number) => {
    let h = seed >>> 0;
    for (let i = 0; i < canonical.length; i++) {
      h ^= canonical.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, "0");
  };
  return fnv(0x811c9dc5) + fnv(0x01000193 ^ 0x811c9dc5);
}

// The partners as they will be after the plan — for tests and for
// re-running the engine to prove nothing is left pending.
export function applyPlanToPartners(partners: Partner[], plan: FundingPlan): Partner[] {
  const after = new Map(plan.lines.map((l) => [l.partnerId, l.after]));
  return partners.map((p) => {
    const a = after.get(p.id);
    if (!a) return p;
    return {
      ...p,
      currentBalance: a.currentBalance,
      totalBalance: a.total_balance,
      totalDeposits: a.totalDeposits,
      totalWithdrawals: a.totalWithdrawals,
      baseCapital: a.baseCapital,
      lastSettlementDate: a.last_settlement_date,
      profitTakenGross: a.profitTakenGross,
      gpFeesAccrued: a.gpFeesAccrued,
      balanceHistory: a.balanceHistory,
    };
  });
}
