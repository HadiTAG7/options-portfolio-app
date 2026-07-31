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

// Guard against placeholder junk masquerading as a key.
//
// Vercel writes the literal string "[SENSITIVE]" back for env vars marked
// Sensitive, so `vercel pull && vercel build` baked
// NEXT_PUBLIC_FINNHUB_API_KEY="[SENSITIVE]" into the bundle. Because that
// is a non-empty string it won the `env || FALLBACK` check and every quote
// came back 401 "Invalid API key" — silently, so prices simply froze at
// their last cached values. Anything that isn't a plausible key is treated
// as absent so the working fallback is used.
export function sanitizeApiKey(value: string | undefined): string | null {
  const k = value?.trim();
  if (!k) return null;
  if (k.startsWith("[") || k.includes("SENSITIVE")) return null;
  if (k.length < 20) return null; // real Finnhub keys are ~40 chars
  return k;
}

export function resolveApiKey(): string {
  return sanitizeApiKey(process.env.NEXT_PUBLIC_FINNHUB_API_KEY) ?? FALLBACK_API_KEY;
}

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
  const apiKey = resolveApiKey();
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

// Prefer our OWN /api/quotes proxy over calling finnhub.io from the
// browser. Phones are the problem case: mobile networks, DNS filtering and
// ad/privacy blockers routinely block third-party API hosts, and every
// such failure is silent — the quote comes back null and the UI keeps
// showing the last cached price, so prices appear frozen. Talking only to
// our own origin removes that entirely.
//
// Falls back to direct Finnhub calls when the proxy isn't there — the APK
// is a static export with no server, so it must keep working.
// Current price plus the previous close, which is what "today's P&L" is
// measured against ((price − prevClose) × qty).
export interface LiveQuote {
  price: number | null;
  prevClose: number | null;
}

export async function fetchLiveQuotes(
  tickers: string[]
): Promise<Record<string, LiveQuote>> {
  const unique = Array.from(
    new Set(tickers.map((t) => t.trim().toUpperCase()))
  ).filter(Boolean);
  if (unique.length === 0) return {};

  try {
    const res = await fetch("/api/quotes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbols: unique }),
      cache: "no-store",
    });
    if (res.ok) {
      const data = (await res.json()) as {
        quotes?: Record<string, number | null>;
        prevCloses?: Record<string, number | null>;
        errors?: string[];
      };
      if (data.quotes) {
        if (data.errors?.length) {
          console.warn("[finnhub] proxy reported:", data.errors.join(", "));
        }
        return Object.fromEntries(
          unique.map((t) => [
            t,
            {
              price: data.quotes?.[t] ?? null,
              prevClose: data.prevCloses?.[t] ?? null,
            },
          ])
        );
      }
    }
    console.warn(
      `[finnhub] quote proxy unavailable (HTTP ${res.status}) — falling back to direct calls`
    );
  } catch (err) {
    console.warn("[finnhub] quote proxy unreachable, direct fallback:", err);
  }

  // Direct fallback (static APK build): fetch the full quote so today's
  // change still works there.
  const apiKey = resolveApiKey();
  const results = await Promise.all(
    unique.map(async (symbol): Promise<readonly [string, LiveQuote]> => {
      try {
        const res = await fetch(
          `${FINNHUB_BASE}/quote?symbol=${encodeURIComponent(symbol)}&token=${apiKey}`,
          { cache: "no-store" }
        );
        if (!res.ok) return [symbol, { price: null, prevClose: null }];
        const q = (await res.json()) as FinnhubQuote;
        const price =
          Number.isFinite(q.c) && q.c > 0 ? q.c : null;
        const prevClose =
          Number.isFinite(q.pc) && q.pc > 0 ? q.pc : null;
        return [symbol, { price, prevClose }];
      } catch {
        return [symbol, { price: null, prevClose: null }];
      }
    })
  );
  return Object.fromEntries(results);
}

// Back-compat wrapper: prices only.
export async function fetchLivePrices(
  tickers: string[]
): Promise<Record<string, number | null>> {
  const quotes = await fetchLiveQuotes(tickers);
  return Object.fromEntries(
    Object.entries(quotes).map(([k, v]) => [k, v.price])
  );
}
