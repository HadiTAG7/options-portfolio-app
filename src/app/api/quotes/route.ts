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
const FINNHUB_BASE = "https://finnhub.io/api/v1";
// Server-side key. Prefers a real env var (rotate without a deploy) and
// falls back to the same public key the client bundle already carried.
const KEY =
  process.env.FINNHUB_API_KEY ||
  process.env.NEXT_PUBLIC_FINNHUB_API_KEY ||
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

  await Promise.all(
    symbols.map(async (symbol) => {
      try {
        const res = await fetch(
          `${FINNHUB_BASE}/quote?symbol=${encodeURIComponent(symbol)}&token=${KEY}`,
          { cache: "no-store" }
        );
        if (!res.ok) {
          quotes[symbol] = null;
          errors.push(`${symbol}: HTTP ${res.status}`);
          return;
        }
        const q = (await res.json()) as { c?: number };
        if (typeof q.c === "number" && Number.isFinite(q.c) && q.c > 0) {
          quotes[symbol] = q.c;
        } else {
          quotes[symbol] = null;
          errors.push(`${symbol}: no price`);
        }
      } catch (e) {
        quotes[symbol] = null;
        errors.push(`${symbol}: ${e instanceof Error ? e.message : "failed"}`);
      }
    })
  );

  return Response.json(
    { quotes, errors },
    { headers: { "Cache-Control": "no-store" } }
  );
}
