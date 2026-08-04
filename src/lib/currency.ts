// Display currency. The fund's books are kept ENTIRELY in USD — every
// stored balance, trade, premium and fee is a dollar figure — and this
// module only changes how those dollars are *rendered*. Nothing here ever
// writes to the database, so switching to ريال cannot alter a partner's
// real position.
//
// Why module-level state instead of passing a currency down: the money
// formatters in utils.ts are plain functions called from ~170 places. They
// read the values below, so one toggle re-renders every figure in the app
// without rewriting every call site. use-currency.ts owns the React side
// and keeps this in sync (and re-renders the pages that subscribe).
//
// Server-side code (the emailed monthly report, the PDF builders) never
// calls setDisplayCurrency, so it always renders USD — partner statements
// stay in the fund's book currency regardless of what the GP is viewing.

export type CurrencyCode = "USD" | "SAR";

// SAR is pegged to the dollar; 3.735 is the rate the GP specified.
export const DEFAULT_SAR_PER_USD = 3.735;

let displayCurrency: CurrencyCode = "USD";
let sarPerUsd = DEFAULT_SAR_PER_USD;

export function setDisplayCurrency(code: CurrencyCode, rate?: number): void {
  displayCurrency = code === "SAR" ? "SAR" : "USD";
  if (typeof rate === "number" && Number.isFinite(rate) && rate > 0) {
    sarPerUsd = rate;
  }
}

export function getDisplayCurrency(): CurrencyCode {
  return displayCurrency;
}

export function getSarRate(): number {
  return sarPerUsd;
}

// USD amount → the number to display in the active currency.
export function toDisplayAmount(usd: number): number {
  return displayCurrency === "SAR" ? usd * sarPerUsd : usd;
}

export function currencySymbol(code: CurrencyCode = displayCurrency): string {
  return code === "SAR" ? "ر.س" : "$";
}
