// One position per ticker. Buying a stock already held adds to that
// position at the weighted-average cost — the way a brokerage shows it —
// instead of opening a second row. Pure math, shared by the server (which
// applies it inside a transaction) and the tests.

export interface LotPurchase {
  date: string; // YYYY-MM-DD
  quantity: number;
  price: number; // per share
}

export interface LotLike {
  id: string;
  ticker: string;
  quantity: number;
  purchasePrice: number;
  purchaseDate: string;
  targetSellPrice: number;
  // Every buy that went into this position, oldest first. Absent on lots
  // created before merging existed — the lot itself is then its one buy.
  purchases?: LotPurchase[] | null;
}

export interface MergedLot {
  survivorId: string;
  removedIds: string[];
  quantity: number;
  // Weighted average: Σ(qty × price) ÷ Σ qty. Kept unrounded so the cost
  // basis (qty × price) stays exactly the sum paid — 100 × 415 + 200 × 410
  // = 123,500, not 300 × 411.67 = 123,501.
  purchasePrice: number;
  purchaseDate: string; // when the position was first opened
  targetSellPrice: number;
  purchases: LotPurchase[];
}

function historyOf(lot: LotLike): LotPurchase[] {
  if (Array.isArray(lot.purchases) && lot.purchases.length > 0) return lot.purchases;
  return [{ date: lot.purchaseDate, quantity: lot.quantity, price: lot.purchasePrice }];
}

// Merge every lot of ONE ticker into the oldest. Throws on mixed tickers or
// a non-positive total, which would mean corrupt input.
export function mergeLots(lots: LotLike[]): MergedLot {
  if (lots.length === 0) throw new Error("no lots to merge");
  const ticker = lots[0].ticker.trim().toUpperCase();
  if (lots.some((l) => l.ticker.trim().toUpperCase() !== ticker)) {
    throw new Error("cannot merge different tickers");
  }
  const ordered = [...lots].sort(
    (a, b) =>
      (a.purchaseDate || "9999").localeCompare(b.purchaseDate || "9999") ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
  const quantity = ordered.reduce((s, l) => s + (Number(l.quantity) || 0), 0);
  if (!(quantity > 0)) throw new Error("merged quantity must be positive");
  const cost = ordered.reduce(
    (s, l) => s + (Number(l.quantity) || 0) * (Number(l.purchasePrice) || 0),
    0
  );
  const survivor = ordered[0];
  const target =
    survivor.targetSellPrice > 0
      ? survivor.targetSellPrice
      : (ordered.find((l) => l.targetSellPrice > 0)?.targetSellPrice ?? 0);
  const purchases = ordered
    .flatMap(historyOf)
    .sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  return {
    survivorId: survivor.id,
    removedIds: ordered.slice(1).map((l) => l.id),
    quantity,
    purchasePrice: cost / quantity,
    purchaseDate: ordered.map((l) => l.purchaseDate).filter(Boolean).sort()[0] ?? survivor.purchaseDate,
    targetSellPrice: target,
    purchases,
  };
}

// A new buy folded into the existing lots of the same ticker.
export function addPurchase(existing: LotLike[], buy: LotPurchase & { ticker: string }): MergedLot {
  if (!(buy.quantity > 0) || !(buy.price > 0)) throw new Error("buy needs a positive quantity and price");
  const incoming: LotLike = {
    id: "￿-new", // sorts after any real id, so an existing lot survives
    ticker: buy.ticker,
    quantity: buy.quantity,
    purchasePrice: buy.price,
    purchaseDate: buy.date,
    targetSellPrice: 0,
    purchases: [{ date: buy.date, quantity: buy.quantity, price: buy.price }],
  };
  const merged = mergeLots([...existing, incoming]);
  // The survivor must be a real lot when one exists; the incoming buy is
  // never "removed" (it was never stored).
  if (existing.length > 0 && merged.survivorId === incoming.id) {
    const realOldest = mergeLots(existing).survivorId;
    return { ...merged, survivorId: realOldest, removedIds: existing.map((l) => l.id).filter((id) => id !== realOldest) };
  }
  return { ...merged, removedIds: merged.removedIds.filter((id) => id !== incoming.id) };
}

// A position as stored in active_stocks, and what the buy/merge routes
// return — shared by the server and the client.
export interface StoredLot {
  id: string;
  ticker: string;
  quantity: number;
  purchasePrice: number;
  purchaseDate: string;
  targetSellPrice: number;
  currentPrice: number | null;
  currentPriceUpdatedAt: string | null;
  purchases: LotPurchase[];
}

export interface PositionResult {
  lot: StoredLot;
  removedIds: string[];
  relinkedTradeIds: string[];
  created: boolean;
}
