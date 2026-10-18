"use client";

import { callGpApi } from "@/lib/gp-api";
import type { PositionResult } from "@/lib/stock-lots";

// One row per ticker: buys fold into the existing position, duplicates
// collapse — both atomically on the server (see stocks-service).
export const stocksApi = {
  buy: (b: { ticker: string; quantity: number; price: number; date: string }) =>
    callGpApi<PositionResult>("/api/stocks/buy", b),
  merge: (ticker: string) =>
    callGpApi<{ result: PositionResult | null }>("/api/stocks/merge", { ticker }),
};
