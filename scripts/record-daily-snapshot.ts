// Record the day's closing snapshot of the open stock book.
//
// WHY a scheduled job and not just the app: the in-app recorder only fires
// when the GP happens to open the page. Any day nobody opens it leaves a
// hole, and a hole doesn't just lose one day — the day AFTER it then shows
// a two-day move, because the move is a difference between consecutive
// snapshots. Running on a schedule keeps the series complete and stamps it
// after the US close instead of at whatever time the page was opened.
//
// Also refreshes active_stocks.currentPrice, so prices stay current even on
// days the app is never opened.
//
// Dates are stamped in UTC. The job runs at 21:15 UTC — after the US close
// in both EDT (20:00) and EST (21:00) — so the UTC date is the trading day
// being recorded. The in-app recorder uses the browser's local date; for
// Riyadh (UTC+3) the two agree except between midnight and 03:00 local.
//
// Env: FIREBASE_SERVICE_ACCOUNT (required), FINNHUB_API_KEY (optional —
// falls back to the app's public key).
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { safeNumber } from "../src/lib/utils";

const { FIREBASE_SERVICE_ACCOUNT, FINNHUB_API_KEY } = process.env;

const ok = (m: string) => console.log(`✓ ${m}`);
const warn = (m: string) => console.warn(`⚠ ${m}`);
function fail(m: string): never {
  console.error(`✗ ${m}`);
  process.exit(1);
}

const FINNHUB_BASE = "https://finnhub.io/api/v1";
const KEY =
  FINNHUB_API_KEY && FINNHUB_API_KEY.trim().length >= 20
    ? FINNHUB_API_KEY.trim()
    : "d7j294pr01qp3g1rhmigd7j294pr01qp3g1rhmj0";

async function quote(symbol: string): Promise<number | null> {
  try {
    const res = await fetch(
      `${FINNHUB_BASE}/quote?symbol=${encodeURIComponent(symbol)}&token=${KEY}`
    );
    if (!res.ok) {
      warn(`${symbol}: HTTP ${res.status}`);
      return null;
    }
    const q = (await res.json()) as { c?: number };
    return typeof q.c === "number" && Number.isFinite(q.c) && q.c > 0
      ? q.c
      : null;
  } catch (e) {
    warn(`${symbol}: ${e instanceof Error ? e.message : "fetch failed"}`);
    return null;
  }
}

async function main(): Promise<void> {
  if (!FIREBASE_SERVICE_ACCOUNT) fail("FIREBASE_SERVICE_ACCOUNT is required");
  initializeApp({ credential: cert(JSON.parse(FIREBASE_SERVICE_ACCOUNT)) });
  const db = getFirestore();

  const now = new Date();
  const dateKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;

  const snap = await db.collection("active_stocks").get();
  const stocks = snap.docs.map((d) => {
    const r = d.data();
    return {
      id: String(r.id ?? d.id),
      ticker: String(r.ticker ?? "").toUpperCase(),
      quantity: safeNumber(r.quantity),
      purchasePrice: safeNumber(r.purchasePrice),
    };
  });

  if (stocks.length === 0) {
    ok("no active stocks — nothing to snapshot");
    return;
  }
  ok(`loaded ${stocks.length} active stocks`);

  const prices = new Map<string, number>();
  for (const s of stocks) {
    if (prices.has(s.ticker)) continue;
    const p = await quote(s.ticker);
    if (p !== null) prices.set(s.ticker, p);
  }

  // Every lot must be priced. A partial snapshot would understate the book
  // and, worse, corrupt BOTH neighbouring days' moves once it's differenced.
  const missing = stocks.filter((s) => !prices.has(s.ticker));
  if (missing.length > 0) {
    fail(
      `no quote for ${missing.map((s) => s.ticker).join(", ")} — refusing to write a partial snapshot`
    );
  }

  let stockUnrealized = 0;
  let stockValue = 0;
  for (const s of stocks) {
    const px = prices.get(s.ticker) as number;
    stockUnrealized += (px - s.purchasePrice) * s.quantity;
    stockValue += px * s.quantity;
  }

  await db.collection("daily_snapshots").doc(dateKey).set({
    id: dateKey,
    date: dateKey,
    stockUnrealized,
    stockValue,
    updated_at: now.toISOString(),
    source: "scheduled",
  });
  ok(
    `snapshot ${dateKey}: unrealized $${stockUnrealized.toFixed(2)}, value $${stockValue.toFixed(2)}`
  );

  // Keep the cached prices fresh too, so the app shows current numbers on
  // open even if it hasn't been used in days.
  const iso = now.toISOString();
  await Promise.all(
    stocks.map((s) =>
      db
        .collection("active_stocks")
        .doc(s.id)
        .set(
          { currentPrice: prices.get(s.ticker), currentPriceUpdatedAt: iso },
          { merge: true }
        )
    )
  );
  ok(`refreshed ${stocks.length} cached prices`);
}

main().catch((e) => {
  console.error("✗ record-daily-snapshot failed:", e);
  process.exit(1);
});
