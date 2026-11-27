import type { ActiveStock, DailyQuote } from "@/types";

const sessionDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
});

export function marketDay(date: Date): string {
  return sessionDate.format(date);
}

export function validDailyQuote(q: Partial<DailyQuote> | null | undefined): q is DailyQuote {
  return !!q && [q.price, q.prevClose, q.timestamp].every(
    n => typeof n === "number" && Number.isFinite(n) && n > 0
  ) && Number.isFinite(new Date(q.timestamp! * 1000).getTime());
}

export function stockDayMove(stock: ActiveStock, day: string) {
  const q = stock.dailyQuote;
  if (!validDailyQuote(q) || marketDay(new Date(q.timestamp * 1000)) !== day) return null;
  return (q.price - q.prevClose) * stock.quantity;
}

export function dailyStockSummary(stocks: ActiveStock[], day: string) {
  let move = 0;
  let missing = 0;
  let oldest: number | null = null;
  for (const stock of stocks) {
    const amount = stockDayMove(stock, day);
    if (amount === null) missing++;
    else move += amount;
    if (validDailyQuote(stock.dailyQuote)) {
      oldest = Math.min(oldest ?? Infinity, stock.dailyQuote.timestamp);
    }
  }
  return { move: missing ? null : move, missing, oldest };
}
