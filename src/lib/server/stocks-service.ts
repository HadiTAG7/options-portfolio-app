import { randomUUID } from "node:crypto";
import type { Firestore, Transaction } from "firebase-admin/firestore";
import {
  addPurchase,
  mergeLots,
  type LotLike,
  type MergedLot,
  type PositionResult,
  type StoredLot,
} from "@/lib/stock-lots";
import { RouteError } from "@/lib/server/route-error";

// One row per ticker in active_stocks. A buy of a ticker already held is
// folded into that position at the weighted-average cost; existing
// duplicates can be collapsed. Both run in ONE Firestore transaction:
// updating the survivor, deleting the merged rows and re-pointing covered
// calls (trades.linked_stock_id) commit together — a half-applied merge
// would double-count shares.

const TICKER_RE = /^[A-Z0-9.^-]{1,12}$/;

const sameTicker = (a: unknown, ticker: string) =>
  String(a ?? "").trim().toUpperCase() === ticker;

function lotFromDoc(id: string, d: Record<string, unknown>): LotLike {
  return {
    id,
    ticker: String(d.ticker ?? ""),
    quantity: Number(d.quantity) || 0,
    purchasePrice: Number(d.purchasePrice) || 0,
    purchaseDate: String(d.purchaseDate ?? ""),
    targetSellPrice: Number(d.targetSellPrice) || 0,
    purchases: Array.isArray(d.purchases) ? (d.purchases as LotLike["purchases"]) : null,
  };
}

function clean<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function normalizeTicker(raw: unknown): string {
  const t = String(raw ?? "").trim().toUpperCase();
  if (!TICKER_RE.test(t)) throw new RouteError("رمز سهم غير صالح", 400, "bad_ticker");
  return t;
}

// Writes the merged survivor, deletes the rest, re-points covered calls.
// Caller has done every read already.
function applyMerge(
  tx: Transaction,
  db: Firestore,
  ticker: string,
  merged: MergedLot,
  survivorDoc: Record<string, unknown> | null,
  linkedTradeIds: string[]
): StoredLot {
  for (const n of [merged.quantity, merged.purchasePrice, merged.targetSellPrice]) {
    if (!Number.isFinite(n)) throw new RouteError("قيمة غير صالحة", 500, "non_finite");
  }
  const lot: StoredLot = {
    id: merged.survivorId,
    ticker,
    quantity: merged.quantity,
    purchasePrice: merged.purchasePrice,
    purchaseDate: merged.purchaseDate,
    targetSellPrice: merged.targetSellPrice,
    currentPrice:
      typeof survivorDoc?.currentPrice === "number" ? (survivorDoc.currentPrice as number) : null,
    currentPriceUpdatedAt: (survivorDoc?.currentPriceUpdatedAt as string | null | undefined) ?? null,
    purchases: merged.purchases,
  };
  tx.set(db.collection("active_stocks").doc(lot.id), clean(lot), { merge: true });
  for (const id of merged.removedIds) tx.delete(db.collection("active_stocks").doc(id));
  for (const tid of linkedTradeIds) {
    tx.update(db.collection("trades").doc(tid), { linked_stock_id: lot.id });
  }
  return lot;
}

async function linkedTrades(tx: Transaction, db: Firestore, removedIds: string[]): Promise<string[]> {
  if (removedIds.length === 0) return [];
  const removed = new Set(removedIds);
  const snap = await tx.get(db.collection("trades"));
  return snap.docs
    .filter((d) => removed.has(String((d.data() as { linked_stock_id?: string | null }).linked_stock_id ?? "")))
    .map((d) => d.id);
}

export async function buyIntoPosition(
  db: Firestore,
  input: { ticker: unknown; quantity: unknown; price: unknown; date: unknown }
): Promise<PositionResult> {
  const ticker = normalizeTicker(input.ticker);
  const quantity = Number(input.quantity);
  const price = Number(input.price);
  const date = String(input.date ?? "");
  if (!(Number.isFinite(quantity) && quantity > 0)) throw new RouteError("الكمية غير صالحة", 400, "bad_quantity");
  if (!(Number.isFinite(price) && price > 0)) throw new RouteError("السعر غير صالح", 400, "bad_price");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new RouteError("التاريخ غير صالح", 400, "bad_date");
  const newId = randomUUID(); // outside the transaction: stable across retries

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(db.collection("active_stocks"));
    const docs = snap.docs.filter((d) => sameTicker(d.data().ticker, ticker));

    if (docs.length === 0) {
      const lot: StoredLot = {
        id: newId,
        ticker,
        quantity,
        purchasePrice: price,
        purchaseDate: date,
        targetSellPrice: 0,
        currentPrice: null,
        currentPriceUpdatedAt: null,
        purchases: [{ date, quantity, price }],
      };
      tx.set(db.collection("active_stocks").doc(newId), clean(lot));
      return { lot, removedIds: [], relinkedTradeIds: [], created: true };
    }

    const merged = addPurchase(
      docs.map((d) => lotFromDoc(d.id, d.data())),
      { ticker, quantity, price, date }
    );
    const relinked = await linkedTrades(tx, db, merged.removedIds);
    const survivorDoc = docs.find((d) => d.id === merged.survivorId)?.data() ?? null;
    const lot = applyMerge(tx, db, ticker, merged, survivorDoc, relinked);
    return { lot, removedIds: merged.removedIds, relinkedTradeIds: relinked, created: false };
  });
}

// Collapse existing duplicate rows of one ticker. null when the ticker
// isn't held; a single row comes back unchanged.
export async function mergePosition(db: Firestore, rawTicker: unknown): Promise<PositionResult | null> {
  const ticker = normalizeTicker(rawTicker);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(db.collection("active_stocks"));
    const docs = snap.docs.filter((d) => sameTicker(d.data().ticker, ticker));
    if (docs.length === 0) return null;
    const merged = mergeLots(docs.map((d) => lotFromDoc(d.id, d.data())));
    if (merged.removedIds.length === 0) {
      const d = docs[0];
      const data = d.data();
      return {
        lot: {
          ...lotFromDoc(d.id, data),
          ticker,
          currentPrice: typeof data.currentPrice === "number" ? data.currentPrice : null,
          currentPriceUpdatedAt: (data.currentPriceUpdatedAt as string | null | undefined) ?? null,
          purchases: merged.purchases,
        },
        removedIds: [],
        relinkedTradeIds: [],
        created: false,
      };
    }
    const relinked = await linkedTrades(tx, db, merged.removedIds);
    const survivorDoc = docs.find((d) => d.id === merged.survivorId)?.data() ?? null;
    const lot = applyMerge(tx, db, ticker, merged, survivorDoc, relinked);
    return { lot, removedIds: merged.removedIds, relinkedTradeIds: relinked, created: false };
  });
}
