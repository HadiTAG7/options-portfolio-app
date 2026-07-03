"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { safeNumber } from "@/lib/utils";
import { fetchLivePrices } from "@/lib/finnhub";
import { tradeProfit } from "@/lib/partner-profit";
import { seedTrades, seedActiveStocks } from "@/data/seed-trades";
import type { Trade, ActiveStock } from "@/types";
import type { TradeRow, ActiveStockRow } from "@/types/database";

function rowToTrade(row: TradeRow): Trade {
  return {
    id: row.id,
    ticker: row.ticker,
    type: row.type,
    quantity: safeNumber(row.quantity),
    premium: safeNumber(row.premium),
    strike: safeNumber(row.strike),
    result: safeNumber(row.result),
    expiration: row.expiration ?? "",
    date: row.date,
    status: row.status ?? "open",
    autoClosed: row.autoClosed ?? false,
    createdAt: row.created_at ?? null,
    linkedStockId: row.linked_stock_id ?? null,
  };
}

// A trade is expired when it's still open, has a valid expiration date,
// the expiration is on or before today, and it's a short option position
// (Sell Put / Sell Call). Stock Sell rows never expire.
function isExpiredOption(trade: Trade, now: Date = new Date()): boolean {
  if (trade.status !== "open") return false;
  if (trade.type !== "Sell Put" && trade.type !== "Sell Call") return false;
  if (!trade.expiration || trade.expiration.trim() === "") return false;

  const expDate = new Date(trade.expiration);
  if (Number.isNaN(expDate.getTime())) return false;

  // Compare at day granularity (midnight) — if today >= expiration day, it's expired.
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const exp = new Date(
    expDate.getFullYear(),
    expDate.getMonth(),
    expDate.getDate()
  );
  return today.getTime() >= exp.getTime();
}

function rowToActiveStock(row: ActiveStockRow): ActiveStock {
  const qty = safeNumber(row.quantity);
  const price = safeNumber(row.purchasePrice);
  const cached =
    typeof row.currentPrice === "number" && Number.isFinite(row.currentPrice)
      ? row.currentPrice
      : null;
  return {
    id: row.id,
    ticker: row.ticker,
    quantity: qty,
    purchasePrice: price,
    targetSellPrice: safeNumber(row.targetSellPrice),
    purchaseDate: row.purchaseDate ?? "",
    costBasis: qty * price,
    // Hydrate with the last price persisted in the DB so the P&L column
    // is populated instantly on page load; the live refresh overwrites it.
    currentPrice: cached,
  };
}

export function useTrades() {
  const [tradesList, setTradesList] = useState<Trade[]>([]);
  const [activeStocksList, setActiveStocksList] = useState<ActiveStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usingSeedData, setUsingSeedData] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [lastPriceUpdate, setLastPriceUpdate] = useState<Date | null>(null);

  const enrichWithLivePrices = useCallback(async (stocks: ActiveStock[]) => {
    if (stocks.length === 0) return;

    // Mark every row as loading while we hit Finnhub
    setActiveStocksList((prev) =>
      prev.map((s) => ({ ...s, priceLoading: true }))
    );

    const prices = await fetchLivePrices(stocks.map((s) => s.ticker));
    console.log("[enrichWithLivePrices] Finnhub results:", prices);

    setActiveStocksList((prev) =>
      prev.map((s) => ({
        ...s,
        currentPrice: prices[s.ticker.toUpperCase()] ?? s.currentPrice ?? null,
        priceLoading: false,
      }))
    );

    // Persist the freshly fetched quotes back to Supabase so a refresh
    // shows the last known price without waiting on Finnhub. Only write
    // rows where we actually got a finite, positive price — don't clobber
    // a good cached price with null when the API rate-limits or errors.
    const nowIso = new Date().toISOString();
    const writes = stocks
      .map((s) => {
        const px = prices[s.ticker.toUpperCase()];
        if (typeof px !== "number" || !Number.isFinite(px) || px <= 0) return null;
        return { id: s.id, ticker: s.ticker, price: px };
      })
      .filter((x): x is { id: string; ticker: string; price: number } => x !== null);

    console.log("[enrichWithLivePrices] Will persist prices for:", writes.map((w) => `${w.ticker}=$${w.price}`));

    if (writes.length > 0) {
      await Promise.all(
        writes.map(async ({ id, ticker, price }) => {
          const { error: upErr, status } = await supabase
            .from("active_stocks")
            .update({ currentPrice: price, currentPriceUpdatedAt: nowIso })
            .eq("id", id);
          if (upErr) {
            console.error(
              `[enrichWithLivePrices] Supabase update FAILED for ${ticker} (${id}):`,
              upErr
            );
          } else {
            console.log(
              `[enrichWithLivePrices] Supabase update OK for ${ticker} (${id}), status:`,
              status
            );
          }
        })
      );
      // Stamp the wall-clock time of the most recent successful refresh
      // so the UI can render a "Last Updated" indicator.
      setLastPriceUpdate(new Date(nowIso));
    } else {
      console.warn("[enrichWithLivePrices] No valid prices to persist — all null/zero from Finnhub");
    }
  }, []);

  const fetchTradesData = useCallback(async () => {
    setLoading(true);
    setError(null);

    // --- Trades ---
    const { data: trades, error: tradesError } = await supabase
      .from("trades")
      .select("*", { count: "exact" })
      .order("date", { ascending: false });

    console.log("Fetched Trades:", trades, tradesError);

    if (tradesError) {
      // Only fall back to seed data when the DB is genuinely unreachable
      // (missing table, network error, RLS policy rejection). Mutations
      // still attempt real inserts regardless — we never silently swallow
      // a write into local-only state when the user added something.
      console.error("[useTrades] trades fetch failed:", tradesError);
      setError(`trades: ${tradesError.message}`);
      setTradesList(seedTrades);
      setUsingSeedData(true);
    } else if (trades && trades.length > 0) {
      setTradesList(trades.map(rowToTrade));
      setUsingSeedData(false);
    } else {
      // Empty DB is a legitimate state — do NOT auto-populate with seed
      // rows. That was causing user-added trades to "disappear" on
      // refresh because the empty-fetch → seed-mode flip hid them.
      console.log("[useTrades] trades table is empty — showing empty state");
      setTradesList([]);
      setUsingSeedData(false);
    }

    // --- Active Stocks ---
    const { data: activeStocks, error: stocksError } = await supabase
      .from("active_stocks")
      .select("*", { count: "exact" });

    console.log("Fetched Active Stocks:", activeStocks, stocksError);

    let stocks: ActiveStock[];
    if (stocksError) {
      console.error("[useTrades] active_stocks fetch failed:", stocksError);
      stocks = seedActiveStocks;
    } else if (activeStocks && activeStocks.length > 0) {
      stocks = activeStocks.map(rowToActiveStock);
      // Hydrate the "Last Updated" indicator from whichever cached
      // currentPriceUpdatedAt is most recent — gives users immediate
      // freshness feedback before the live refresh stamps a new time.
      const latestStamp = activeStocks.reduce<string | null>((acc, row) => {
        const stamp = row.currentPriceUpdatedAt;
        if (!stamp) return acc;
        if (!acc || stamp > acc) return stamp;
        return acc;
      }, null);
      if (latestStamp) setLastPriceUpdate(new Date(latestStamp));
    } else {
      // Empty active_stocks table = empty list. Do not reintroduce
      // seeds on empty result — that was causing user-added stocks
      // to disappear after refresh.
      console.log("[useTrades] active_stocks table is empty");
      stocks = [];
    }
    setActiveStocksList(stocks);

    setLoading(false);

    // Kick off live price enrichment in the background — don't block loading
    void enrichWithLivePrices(stocks);
  }, [enrichWithLivePrices]);

  // Detect expired option positions and auto-close them.
  // - Writes to Supabase in a single `.in('id', [...])` batch update
  //   (skipped when using seed data since those rows don't exist in DB).
  // - Also mirrors the change into local state so the UI updates even
  //   when the DB write is skipped.
  // Returns how many were closed plus the tickers that could not be
  // checked against a live price (their full-premium result may be
  // wrong if the option actually expired in-the-money).
  const checkAndCloseExpiredTrades = useCallback(
    async (trades: Trade[], stocks: ActiveStock[]) => {
      const expired = trades.filter((t) => isExpiredOption(t));
      if (expired.length === 0) return { closed: 0, unverified: [] as string[] };

      console.log(
        "[useTrades] expiring",
        expired.length,
        "positions:",
        expired.map((t) => `${t.ticker} ${t.type} @ ${t.expiration}`)
      );

      // Last known spot per ticker, from the active stock book's live
      // quotes. Used to detect in-the-money expiries.
      const spotByTicker: Record<string, number> = {};
      for (const s of stocks) {
        const px = s.currentPrice;
        if (typeof px === "number" && Number.isFinite(px) && px > 0) {
          spotByTicker[s.ticker.toUpperCase()] = px;
        }
      }

      // Result of an expired short option.
      // `quantity` already stores total shares (100, 200, ...), not # of
      // contracts, so we must NOT multiply by 100 again.
      //  - OTM (or no spot available): full premium is kept.
      //  - ITM (spot known): intrinsic value is surrendered against the
      //    premium — (premium − intrinsic) × qty, which can go negative.
      //    Booking full premium on an ITM expiry fabricated profit on
      //    losing positions.
      const computeResult = (t: Trade) => {
        const premium = Number(t.premium) || 0;
        const qty = Number(t.quantity) || 0;
        const spot = spotByTicker[t.ticker.toUpperCase()];
        if (typeof spot === "number") {
          const strike = Number(t.strike) || 0;
          const intrinsic =
            t.type === "Sell Put"
              ? Math.max(0, strike - spot)
              : Math.max(0, spot - strike);
          return (premium - intrinsic) * qty;
        }
        return premium * qty;
      };

      // Tickers auto-closed blind (no live quote) — surfaced to the user
      // so they can correct the result manually if the expiry was ITM.
      const unverified = [
        ...new Set(
          expired
            .filter(
              (t) => spotByTicker[t.ticker.toUpperCase()] === undefined
            )
            .map((t) => t.ticker)
        ),
      ];

      if (!usingSeedData) {
        // Per-row updates because each expired trade has a different result.
        await Promise.all(
          expired.map(async (t) => {
            const { error: upErr } = await supabase
              .from("trades")
              .update({
                status: "closed",
                autoClosed: true,
                result: computeResult(t),
              })
              .eq("id", t.id);
            if (upErr) {
              console.error(
                `[useTrades] auto-close failed for ${t.id}:`,
                upErr
              );
            }
          })
        );
      }

      // Mirror into local state (works for both DB and seed modes).
      const expiredIds = new Set(expired.map((t) => t.id));
      setTradesList((prev) =>
        prev.map((t) =>
          expiredIds.has(t.id)
            ? {
                ...t,
                status: "closed",
                autoClosed: true,
                result: computeResult(t),
              }
            : t
        )
      );

      return { closed: expired.length, unverified };
    },
    [usingSeedData]
  );

  useEffect(() => {
    fetchTradesData();
  }, [fetchTradesData]);

  // Auto-expiration sweep: fires whenever the trade list changes
  // and there's at least one open option whose expiration has passed.
  // `ran` guards against re-running on the same set of expired ids.
  const [expirationRan, setExpirationRan] = useState<string>("");
  useEffect(() => {
    if (loading) return;
    if (tradesList.length === 0) return;

    const expired = tradesList.filter((t) => isExpiredOption(t));
    if (expired.length === 0) return;

    const key = expired.map((t) => t.id).sort().join(",");
    if (key === expirationRan) return;
    setExpirationRan(key);

    void (async () => {
      const { closed, unverified } = await checkAndCloseExpiredTrades(
        tradesList,
        activeStocksList
      );
      if (closed > 0) {
        setToast(
          unverified.length > 0
            ? `تم إغلاق ${closed} صفقة منتهية — لا يوجد سعر مرجعي لـ ${unverified.join("، ")}: راجع النتيجة يدوياً إذا انتهى العقد ITM`
            : `تم إغلاق ${closed} صفقة منتهية وفق آخر سعر معروف`
        );
      }
    })();
  }, [
    loading,
    tradesList,
    activeStocksList,
    expirationRan,
    checkAndCloseExpiredTrades,
  ]);

  // One-shot heal for a historical bug where auto-closed option results
  // were saved as premium * quantity * 100 (off by 100x). If the stored
  // `result` matches the inflated value within a cent, divide it by 100
  // and persist the corrected figure. Idempotent: once rows look sane,
  // this effect becomes a no-op.
  const [healRan, setHealRan] = useState(false);
  useEffect(() => {
    if (loading || healRan) return;
    if (tradesList.length === 0) return;

    const inflated = tradesList.filter((t) => {
      if (t.status !== "closed") return false;
      if (t.type !== "Sell Put" && t.type !== "Sell Call") return false;
      const correct = Number(t.premium) * Number(t.quantity);
      const stored = Number(t.result);
      if (!Number.isFinite(correct) || correct === 0) return false;
      return Math.abs(stored - correct * 100) < 0.5;
    });

    if (inflated.length === 0) {
      setHealRan(true);
      return;
    }

    setHealRan(true);
    void (async () => {
      const fixes = inflated.map((t) => ({
        id: t.id,
        result: Number(t.premium) * Number(t.quantity),
      }));

      if (!usingSeedData) {
        await Promise.all(
          fixes.map(async ({ id, result }) => {
            const { error: upErr } = await supabase
              .from("trades")
              .update({ result })
              .eq("id", id);
            if (upErr) {
              console.error(`[useTrades] heal failed for ${id}:`, upErr);
            }
          })
        );
      }

      const fixMap = new Map(fixes.map((f) => [f.id, f.result]));
      setTradesList((prev) =>
        prev.map((t) =>
          fixMap.has(t.id) ? { ...t, result: fixMap.get(t.id)! } : t
        )
      );
      setToast(
        `Corrected ${fixes.length} inflated option result${fixes.length === 1 ? "" : "s"}.`
      );
    })();
  }, [loading, tradesList, healRan, usingSeedData]);

  const addTrade = useCallback(
    async (payload: {
      type: "Stock" | "Sell Call" | "Sell Put";
      ticker: string;
      quantity: number;
      price: number; // purchasePrice for Stock, premium for options
      strike?: number;
      expiration?: string;
      date: string;
      // Covered-call linkage: the active stock lot this Sell Call is
      // written against (optional).
      linkedStockId?: string | null;
    }) => {
      setError(null);
      const ticker = payload.ticker.trim().toUpperCase();

      // ----- Stock -----
      if (payload.type === "Stock") {
        // ALWAYS try the Supabase insert first — even in seed mode —
        // so the row actually persists. Only fall back to local-only
        // state if the DB rejects it (missing table, RLS, offline).
        const stockPayload = {
          // Client-generated UUID so the insert doesn't depend on the
          // active_stocks.id column having `default gen_random_uuid()`.
          // Some Supabase environments were created before migration
          // 009 added that default — see
          // migrations/010_fix_active_stocks_id_default.sql.
          id: crypto.randomUUID(),
          ticker,
          quantity: payload.quantity,
          purchasePrice: payload.price,
          purchaseDate: payload.date,
        };
        console.log("[addTrade] active_stocks insert payload:", stockPayload);

        const { data, error: insertError } = await supabase
          .from("active_stocks")
          .insert(stockPayload)
          .select()
          .single();

        if (insertError) {
          console.error(
            "[addTrade] active_stocks insert FAILED — row will only live in local state:",
            insertError
          );
          setError(`Stock insert rejected by Supabase: ${insertError.message}`);
          // Local-only fallback so the UI still shows the row, but
          // warn the user loudly via setError that it won't persist.
          const newStock: ActiveStock = {
            id: crypto.randomUUID(),
            ticker,
            quantity: payload.quantity,
            purchasePrice: payload.price,
            targetSellPrice: 0,
            purchaseDate: payload.date,
            costBasis: payload.quantity * payload.price,
          };
          setActiveStocksList((prev) => [...prev, newStock]);
          void enrichWithLivePrices([newStock]);
          throw insertError;
        }

        console.log("[addTrade] active_stocks insert succeeded:", data);
        const newStock = rowToActiveStock(data as ActiveStockRow);
        setActiveStocksList((prev) => [...prev, newStock]);
        void enrichWithLivePrices([newStock]);
        return;
      }

      // ----- Sell Call / Sell Put -----
      const insertRow = {
        ticker,
        type: payload.type,
        quantity: payload.quantity,
        premium: payload.price,
        strike: payload.strike ?? 0,
        expiration: payload.expiration ?? "",
        date: payload.date,
        status: "open" as const,
        linked_stock_id: payload.linkedStockId ?? null,
      };

      // ALWAYS attempt the Supabase insert first — even in seed mode —
      // so the trade actually persists across refreshes. Only fall
      // back to a local-only row if the DB rejects the insert.
      console.log("[addTrade] trades insert payload:", insertRow);

      const { data, error: insertError } = await supabase
        .from("trades")
        .insert(insertRow)
        .select()
        .single();

      if (insertError) {
        console.error(
          "[addTrade] trades insert FAILED — row will only live in local state:",
          insertError
        );
        setError(`Trade insert rejected by Supabase: ${insertError.message}`);
        const newTrade: Trade = {
          id: crypto.randomUUID(),
          ticker,
          type: payload.type,
          quantity: payload.quantity,
          premium: payload.price,
          strike: payload.strike ?? 0,
          result: 0,
          expiration: payload.expiration ?? "",
          date: payload.date,
          status: "open",
          autoClosed: false,
          linkedStockId: payload.linkedStockId ?? null,
        };
        setTradesList((prev) => [newTrade, ...prev]);
        throw insertError;
      }

      console.log("[addTrade] trades insert succeeded:", data);
      setTradesList((prev) => [rowToTrade(data as TradeRow), ...prev]);
    },
    [enrichWithLivePrices]
  );

  const updateTrade = useCallback(
    async (
      id: string,
      payload: {
        quantity: number;
        strike: number;
        expiration: string;
        premium: number;
        date: string;
      }
    ) => {
      setError(null);

      const updatePayload = {
        quantity: Number(payload.quantity),
        strike: Number(payload.strike),
        premium: Number(payload.premium),
        expiration: payload.expiration,
        date: payload.date,
      };

      console.log("[updateTrade] id:", id, "payload:", updatePayload);

      try {
        const { error: updateError, status, statusText } = await supabase
          .from("trades")
          .update(updatePayload)
          .eq("id", id);

        console.log("[updateTrade] response:", status, statusText, updateError);

        if (updateError) {
          console.error("Supabase Update Error (trades):", updateError);
          setError(updateError.message);
          throw updateError;
        }

        // Update local state immediately so UI reflects changes
        setTradesList((prev) =>
          prev.map((t) =>
            t.id === id
              ? {
                  ...t,
                  quantity: updatePayload.quantity,
                  strike: updatePayload.strike,
                  premium: updatePayload.premium,
                  expiration: updatePayload.expiration,
                  date: updatePayload.date,
                }
              : t
          )
        );

        // Only refetch from Supabase if the data came from the DB;
        // otherwise refetch would overwrite with stale seed data.
        if (!usingSeedData) {
          await fetchTradesData();
        }
      } catch (err) {
        console.error("Supabase Update Error:", err);
        throw err;
      }
    },
    [fetchTradesData, usingSeedData]
  );

  const updateStock = useCallback(
    async (
      id: string,
      payload: {
        quantity: number;
        purchasePrice: number;
        targetSellPrice: number;
        purchaseDate: string;
      }
    ) => {
      setError(null);

      const updatePayload = {
        quantity: Number(payload.quantity),
        purchasePrice: Number(payload.purchasePrice),
        targetSellPrice: Number(payload.targetSellPrice),
        purchaseDate: payload.purchaseDate,
      };

      console.log("[updateStock] id:", id, "payload:", updatePayload);

      const { error: updateError, status, statusText } = await supabase
        .from("active_stocks")
        .update(updatePayload)
        .eq("id", id);

      console.log("[updateStock] response:", status, statusText, updateError);

      if (updateError) {
        console.error("Supabase Update Error (active_stocks):", updateError);
        setError(updateError.message);
        throw updateError;
      }

      // Mirror the change into local state immediately so the UI updates
      // without waiting on a full refetch. costBasis is derived, so we
      // recompute it here to keep it consistent with the new qty/price.
      setActiveStocksList((prev) =>
        prev.map((s) =>
          s.id === id
            ? {
                ...s,
                quantity: updatePayload.quantity,
                purchasePrice: updatePayload.purchasePrice,
                targetSellPrice: updatePayload.targetSellPrice,
                purchaseDate: updatePayload.purchaseDate,
                costBasis:
                  updatePayload.quantity * updatePayload.purchasePrice,
              }
            : s
        )
      );
    },
    []
  );

  const deleteTrade = useCallback(
    async (id: string) => {
      setError(null);

      if (!usingSeedData) {
        const { error: deleteError } = await supabase
          .from("trades")
          .delete()
          .eq("id", id);

        if (deleteError) {
          console.error("[deleteTrade] Supabase delete failed:", deleteError);
          setError(deleteError.message);
          throw deleteError;
        }
      }

      setTradesList((prev) => prev.filter((t) => t.id !== id));
    },
    [usingSeedData]
  );

  // Record a put assignment: the short put was exercised, so the fund
  // buys the underlying at the strike. Creates an active_stocks lot
  // (priced at the strike — the collected premium stays booked on the
  // option trade itself as its result) and closes the option if it's
  // still open.
  const recordAssignment = useCallback(
    async (
      trade: Trade,
      opts: { quantity: number; price: number; date: string }
    ) => {
      setError(null);

      const stockPayload = {
        id: crypto.randomUUID(),
        ticker: trade.ticker.toUpperCase(),
        quantity: opts.quantity,
        purchasePrice: opts.price,
        purchaseDate: opts.date,
      };

      const { data, error: insertError } = await supabase
        .from("active_stocks")
        .insert(stockPayload)
        .select()
        .single();

      if (insertError) {
        console.error("[recordAssignment] stock insert failed:", insertError);
        setError(`فشل تسجيل الـ Assignment: ${insertError.message}`);
        throw insertError;
      }

      const newStock = rowToActiveStock(data as ActiveStockRow);
      setActiveStocksList((prev) => [...prev, newStock]);
      void enrichWithLivePrices([newStock]);

      // Close the option if still open — premium × quantity is the
      // realized result (the premium was kept; the assignment cost is
      // carried by the new stock lot's basis).
      if (trade.status === "open") {
        const result = (Number(trade.premium) || 0) * (Number(trade.quantity) || 0);
        if (!usingSeedData) {
          const { error: upErr } = await supabase
            .from("trades")
            .update({ status: "closed", autoClosed: false, result })
            .eq("id", trade.id);
          if (upErr) {
            console.error("[recordAssignment] trade close failed:", upErr);
          }
        }
        setTradesList((prev) =>
          prev.map((t) =>
            t.id === trade.id
              ? { ...t, status: "closed", autoClosed: false, result }
              : t
          )
        );
      }

      setToast(
        `تم تسجيل Assignment: ${opts.quantity} سهم ${trade.ticker.toUpperCase()} @ ${opts.price}`
      );
    },
    [usingSeedData, enrichWithLivePrices]
  );

  // Only OPEN option positions show up in the active tables
  const sellPuts = useMemo(
    () =>
      tradesList.filter((t) => t.type === "Sell Put" && t.status === "open"),
    [tradesList]
  );
  const sellCalls = useMemo(
    () =>
      tradesList.filter((t) => t.type === "Sell Call" && t.status === "open"),
    [tradesList]
  );
  const stockSells = useMemo(
    () => tradesList.filter((t) => t.type === "Stock Sell"),
    [tradesList]
  );
  // Closed option positions (auto-expired or manually closed)
  const closedOptions = useMemo(
    () =>
      tradesList.filter(
        (t) =>
          (t.type === "Sell Put" || t.type === "Sell Call") &&
          t.status === "closed"
      ),
    [tradesList]
  );

  // Total premium = sum of tradeProfit() for EVERY Sell Put / Sell Call
  // row, open or closed. tradeProfit returns premium * quantity for
  // open options and the locked-in `result` for closed ones — i.e. the
  // same number rendered in the per-row "Total PnL" column. Dropping
  // the status filter is what restores the $7,509 the user sees when
  // they eyeball-sum the option rows in the trades table.
  const totalPremium = useMemo(
    () =>
      tradesList
        .filter((t) => t.type === "Sell Put" || t.type === "Sell Call")
        .reduce((sum, t) => sum + tradeProfit(t), 0),
    [tradesList]
  );
  // Realized result = locked-in P&L from Stock Sell rows ONLY. Closed
  // option results are already counted in totalPremium above (via
  // tradeProfit), so including closedOptions here would double-count
  // every expired Sell Put / Sell Call.
  const totalResult = useMemo(
    () => stockSells.reduce((sum, t) => sum + Number(t.result || 0), 0),
    [stockSells]
  );
  // Unrealized mark-to-market P&L on the active stock book.
  //   (currentPrice − purchasePrice) × quantity
  // Rows without a live quote contribute 0 so the total stays honest.
  const unrealizedStockPnL = useMemo(
    () =>
      activeStocksList.reduce((sum, s) => {
        const px = s.currentPrice;
        if (typeof px !== "number" || !Number.isFinite(px) || px <= 0) {
          return sum;
        }
        return sum + (px - s.purchasePrice) * s.quantity;
      }, 0),
    [activeStocksList]
  );
  // Potential profit if every active stock hits its user-set target price.
  //   Σ (targetSellPrice − purchasePrice) × quantity
  // Rows without a target (target <= 0) contribute 0 so the number is
  // honest and doesn't punish positions the user hasn't priced yet.
  const potentialTargetProfit = useMemo(
    () =>
      activeStocksList.reduce((sum, s) => {
        const tgt = Number(s.targetSellPrice) || 0;
        if (tgt <= 0) return sum;
        return sum + (tgt - s.purchasePrice) * s.quantity;
      }, 0),
    [activeStocksList]
  );
  // Projected portfolio value = cost basis of every active stock priced
  // at its target. Same zero-target rule as potentialTargetProfit — rows
  // without a target fall back to their cost basis so we don't pretend
  // they vanish.
  const projectedPortfolioValue = useMemo(
    () =>
      activeStocksList.reduce((sum, s) => {
        const tgt = Number(s.targetSellPrice) || 0;
        const exitPrice = tgt > 0 ? tgt : s.purchasePrice;
        return sum + exitPrice * s.quantity;
      }, 0),
    [activeStocksList]
  );
  // Global total profit combines all three pools the user sees in the UI:
  //   1. Unrealized stock P&L (trading pit)
  //   2. Realized P&L (closed options + stock sells)
  //   3. Collected premium on still-open short options
  const totalProfit = totalPremium + totalResult + unrealizedStockPnL;
  const openCount = sellPuts.length + sellCalls.length;

  const refreshPrices = useCallback(async () => {
    await enrichWithLivePrices(activeStocksList);
  }, [activeStocksList, enrichWithLivePrices]);

  return {
    trades: tradesList,
    sellCalls,
    sellPuts,
    stockSells,
    closedOptions,
    activeStocks: activeStocksList,
    loading,
    error,
    totalPremium,
    totalResult,
    totalProfit,
    unrealizedStockPnL,
    potentialTargetProfit,
    projectedPortfolioValue,
    openCount,
    updateTrade,
    updateStock,
    addTrade,
    deleteTrade,
    recordAssignment,
    toast,
    dismissToast: () => setToast(null),
    refetch: fetchTradesData,
    refreshPrices,
    lastPriceUpdate,
  };
}
