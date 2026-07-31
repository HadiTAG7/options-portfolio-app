// Server-side quote proxy.
//
// WHY: the app used to call finnhub.io straight from the browser. That
// works on a desktop but is fragile on phones — mobile networks, DNS
// filtering, ad/tracker blockers and strict privacy modes all block
// third-party API hosts, and every failure is silent (fetchLivePrice
// returns null and the UI keeps the cached price). Result: prices quietly
// freeze at whatever was last cached.
//
// Fetching from our own origin removes that whole class of failure: the
// browser only ever talks to this site, and the key never ships to the
// client. Errors are reported instead of swallowed so the UI can say
// something useful.
//
// POST /api/quotes  { symbols: ["MSFT","AMZN"] }
//   → { quotes: { MSFT: 451.1, … }, errors: [] }
//
// POST rather than GET on purpose: the APK build (output: export) refuses
// any GET route handler that isn't force-static, but skips POST-only ones
// entirely — the same reason the reports route is POST. The APK falls back
// to calling Finnhub directly, so it loses nothing.
import { sanitizeApiKey } from "@/lib/finnhub";

const FINNHUB_BASE = "https://finnhub.io/api/v1";
// Server-side key. Prefers a real env var (rotate without a deploy) and
// falls back to the same public key the client bundle already carried.
// sanitizeApiKey drops placeholder junk — Vercel hands back the literal
// "[SENSITIVE]" for env vars marked Sensitive, and that non-empty string
// used to win the `||` chain and 401 every request.
const KEY =
  sanitizeApiKey(process.env.FINNHUB_API_KEY) ??
  sanitizeApiKey(process.env.NEXT_PUBLIC_FINNHUB_API_KEY) ??
  "d7j294pr01qp3g1rhmigd7j294pr01qp3g1rhmj0";

export async function POST(request: Request) {
  let requested: string[] = [];
  try {
    const body = (await request.json()) as { symbols?: unknown };
    if (Array.isArray(body.symbols)) requested = body.symbols.map(String);
  } catch {
    return Response.json(
      { quotes: {}, errors: ["invalid JSON body"] },
      { status: 400 }
    );
  }
  const symbols = Array.from(
    new Set(requested.map((s) => s.trim().toUpperCase()).filter(Boolean))
  ).slice(0, 50);

  if (symbols.length === 0) {
    return Response.json({ quotes: {}, errors: [] });
  }

  const quotes: Record<string, number | null> = {};
  const errors: string[] = [];

  // Two auth styles: the token as a query param, and the documented
  // X-Finnhub-Token header. Finnhub answered 401 to the query form from
  // Vercel's IPs while the identical key worked elsewhere, so we try the
  // header as a fallback before giving up on a symbol.
  async function quote(
    symbol: string
  ): Promise<{ price: number | null; note?: string }> {
    const attempts: Array<{ url: string; init?: RequestInit; label: string }> = [
      {
        url: `${FINNHUB_BASE}/quote?symbol=${encodeURIComponent(symbol)}&token=${KEY}`,
        label: "query",
      },
      {
        url: `${FINNHUB_BASE}/quote?symbol=${encodeURIComponent(symbol)}`,
        init: { headers: { "X-Finnhub-Token": KEY } },
        label: "header",
      },
    ];
    let last = "";
    for (const a of attempts) {
      try {
        const res = await fetch(a.url, { ...a.init, cache: "no-store" });
        if (!res.ok) {
          last = `${a.label} HTTP ${res.status}: ${(await res.text()).slice(0, 120)}`;
          continue;
        }
        const q = (await res.json()) as { c?: number };
        if (typeof q.c === "number" && Number.isFinite(q.c) && q.c > 0) {
          return { price: q.c };
        }
        last = `${a.label} no price`;
      } catch (e) {
        last = `${a.label} ${e instanceof Error ? e.message : "failed"}`;
      }
    }
    return { price: null, note: last };
  }

  await Promise.all(
    symbols.map(async (symbol) => {
      const { price, note } = await quote(symbol);
      quotes[symbol] = price;
      if (price === null && note) errors.push(`${symbol}: ${note}`);
    })
  );

  // Fingerprint only (never the key): tells us at a glance whether the
  // deployment picked up the intended key when quotes fail.
  const keyInfo = `${KEY.slice(0, 4)}…${KEY.slice(-4)} len=${KEY.length} src=${
    sanitizeApiKey(process.env.FINNHUB_API_KEY)
      ? "FINNHUB_API_KEY"
      : sanitizeApiKey(process.env.NEXT_PUBLIC_FINNHUB_API_KEY)
        ? "NEXT_PUBLIC"
        : "fallback"
  }`;

  return Response.json(
    { quotes, errors, ...(errors.length ? { keyInfo } : {}) },
    { headers: { "Cache-Control": "no-store" } }
  );
}
