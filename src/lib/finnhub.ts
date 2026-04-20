// Finnhub quote fetcher.
//
// Setup:
//   1. Sign up for a free API key at https://finnhub.io (click "Get free API key")
//   2. Add to .env.local at the repo root:
//        NEXT_PUBLIC_FINNHUB_API_KEY=your_key_here
//   3. Restart `npm run dev` so Next.js picks up the env var.
//
// The free tier allows ~60 calls/minute which is plenty for a small
// holdings list. Quotes are delayed ~15 minutes for US stocks.

const FINNHUB_BASE = "https://finnhub.io/api/v1";

export interface FinnhubQuote {
  c: number; // current price
  h: number; // high of the day
  l: number; // low of the day
  o: number; // open of the day
  pc: number; // previous close
  t: number; // UNIX timestamp
}

export async function fetchLivePrice(ticker: string): Promise<number | null> {
  const apiKey = process.env.NEXT_PUBLIC_FINNHUB_API_KEY;
  if (!apiKey) {
    console.warn(
      "[finnhub] NEXT_PUBLIC_FINNHUB_API_KEY is not set — live prices disabled"
    );
    return null;
  }

  const symbol = ticker.trim().toUpperCase();
  if (!symbol) return null;

  const url = `${FINNHUB_BASE}/quote?symbol=${encodeURIComponent(symbol)}&token=${apiKey}`;

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      console.error(`[finnhub] ${symbol} HTTP ${res.status}`);
      return null;
    }
    const quote = (await res.json()) as FinnhubQuote;
    // Finnhub returns c=0 for unknown/invalid symbols
    if (!Number.isFinite(quote.c) || quote.c === 0) return null;
    return quote.c;
  } catch (err) {
    console.error(`[finnhub] ${symbol} fetch failed:`, err);
    return null;
  }
}

export async function fetchLivePrices(
  tickers: string[]
): Promise<Record<string, number | null>> {
  const unique = Array.from(new Set(tickers.map((t) => t.trim().toUpperCase()))).filter(
    Boolean
  );
  const results = await Promise.all(
    unique.map(async (t) => [t, await fetchLivePrice(t)] as const)
  );
  return Object.fromEntries(results);
}
