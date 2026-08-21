// Benchmark price history, fetched server-side.
//
// WHY server-side: Yahoo's chart endpoint sends no CORS headers, so a
// browser fetch is blocked outright — this isn't optional hardening like
// the quotes proxy, it's the only way the data can be read at all. It also
// keeps working on phones behind networks that block third-party hosts.
//
// WHY Yahoo: Finnhub's free tier returns 403 for historical candles
// (/stock/candle), verified. Yahoo needs no key and returns ADJUSTED
// closes, which include reinvested distributions — the correct basis for
// comparing against an income ETF like JEPQ, whose price barely moves
// because the return is paid out monthly. Using raw closes would understate
// such a fund badly.
//
// POST { symbols: ["SPY","QQQ"], months?: 12 }
//   → { series: { SPY: { "2026-03": 648.67, … } }, errors: [] }
//
// POST (not GET) so the APK's static export skips it, same as the other
// routes here.

const CHART_BASE = "https://query1.finance.yahoo.com/v8/finance/chart";

type Series = Record<string, Record<string, number>>;

export async function POST(request: Request) {
  let requested: string[] = [];
  let months = 12;
  try {
    const body = (await request.json()) as {
      symbols?: unknown;
      months?: unknown;
    };
    if (Array.isArray(body.symbols)) requested = body.symbols.map(String);
    if (typeof body.months === "number" && body.months > 0) {
      months = Math.min(60, Math.floor(body.months));
    }
  } catch {
    return Response.json(
      { series: {}, errors: ["invalid JSON body"] },
      { status: 400 }
    );
  }

  const symbols = Array.from(
    new Set(
      requested
        .map((s) => s.trim().toUpperCase())
        .filter((s) => /^[A-Z0-9.^-]{1,12}$/.test(s))
    )
  ).slice(0, 6);

  if (symbols.length === 0) {
    return Response.json({ series: {}, errors: [] });
  }

  // Ask for a couple of extra months: a return for the first month needs the
  // month BEFORE it as its base, so the caller can't use the earliest point.
  const range = `${Math.min(60, months + 2)}mo`;
  const series: Series = {};
  const errors: string[] = [];

  await Promise.all(
    symbols.map(async (symbol) => {
      try {
        const res = await fetch(
          `${CHART_BASE}/${encodeURIComponent(symbol)}?range=${range}&interval=1mo`,
          {
            cache: "no-store",
            headers: { "User-Agent": "Mozilla/5.0" },
          }
        );
        if (!res.ok) {
          errors.push(`${symbol}: HTTP ${res.status}`);
          return;
        }
        const json = (await res.json()) as {
          chart?: {
            result?: Array<{
              timestamp?: number[];
              indicators?: {
                adjclose?: Array<{ adjclose?: (number | null)[] }>;
                quote?: Array<{ close?: (number | null)[] }>;
              };
            }>;
          };
        };
        const r = json.chart?.result?.[0];
        const ts = r?.timestamp;
        // Prefer adjusted closes; fall back to raw only if absent.
        const closes =
          r?.indicators?.adjclose?.[0]?.adjclose ??
          r?.indicators?.quote?.[0]?.close;
        if (!ts || !closes) {
          errors.push(`${symbol}: no price series`);
          return;
        }
        const byMonth: Record<string, number> = {};
        ts.forEach((t, i) => {
          const p = closes[i];
          if (typeof p !== "number" || !Number.isFinite(p) || p <= 0) return;
          const d = new Date(t * 1000);
          const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
          // Later bars win, so the in-progress month keeps its latest value.
          byMonth[key] = p;
        });
        if (Object.keys(byMonth).length === 0) {
          errors.push(`${symbol}: empty series`);
          return;
        }
        series[symbol] = byMonth;
      } catch (e) {
        errors.push(
          `${symbol}: ${e instanceof Error ? e.message : "fetch failed"}`
        );
      }
    })
  );

  return Response.json(
    { series, errors },
    { headers: { "Cache-Control": "no-store" } }
  );
}
