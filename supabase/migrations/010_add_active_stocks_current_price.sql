-- 010_add_active_stocks_current_price.sql
--
-- Persist the most recent live quote alongside each active_stocks row so
-- the "Current Price" / "Unrealized P&L" columns survive a page refresh
-- without waiting on Finnhub again. Both columns are nullable because a
-- freshly inserted holding has no quote yet.
--
-- camelCase identifiers match the rest of the active_stocks schema
-- (purchasePrice, targetSellPrice, purchaseDate) and the TypeScript
-- Row type in src/types/database.ts.

alter table public.active_stocks
  add column if not exists "currentPrice"          numeric,
  add column if not exists "currentPriceUpdatedAt" timestamptz;

-- Reload PostgREST so the REST surface exposes the new columns.
notify pgrst, 'reload schema';
