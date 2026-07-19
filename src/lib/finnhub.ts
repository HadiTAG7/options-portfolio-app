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

// Public client-side key. NEXT_PUBLIC_* values ship inside the web/APK
// bundle by design, so this is not a secret — committing it just makes
// every build (especially the APK) work out of the box. A build-time
// env var (website env / FINNHUB_API_KEY repo secret) takes precedence,
// so the key can be rotated without touching code.
const FALLBACK_API_KEY = "d7j294pr01qp3g1rhmigd7j294pr01qp3g1rhmj0";

export interface FinnhubQuote {
  c: number; // current price
  h: number; // high of the day
  l: number; // low of the day
  o: number; // open of the day
  pc: number; // previous close
  t: number; // UNIX timestamp
}

// Every failure path returns null SILENTLY (console only, never an
// alert): the UI already degrades gracefully — it hydrates the last
// cached price from the DB and renders "لا يوجد سعر مرجعي" when there
// is none. The old debug alerts fired once per ticker on app open
// (including on partners' phones) when the key wasn't baked in.
export async function fetchLivePrice(ticker: string): Promise<number | null> {
  const apiKey = process.env.NEXT_PUBLIC_FINNHUB_API_KEY || FALLBACK_API_KEY;
  if (!apiKey) {
    console.warn(
      "[finnhub] no API key available — live prices disabled, showing cached prices"
    );
    return null;
  }

  const symbol = ticker.trim().toUpperCase();
  if (!symbol) return null;

  const url = `${FINNHUB_BASE}/quote?symbol=${encodeURIComponent(symbol)}&token=${apiKey}`;

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      console.error(`[finnhub] ${symbol} HTTP ${res.status}:`, await res.text());
      return null;
    }
    const quote = (await res.json()) as FinnhubQuote;
    if (!Number.isFinite(quote.c) || quote.c === 0) {
      console.warn("[finnhub]", symbol, "returned c=0 or invalid — symbol may not exist on Finnhub");
      return null;
    }
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
