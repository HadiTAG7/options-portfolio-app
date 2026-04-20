-- 005_add_trade_status.sql
--
-- Adds status tracking to the trades table so the auto-expiration engine
-- can close expired Sell Put / Sell Call positions without deleting them.
--
-- Safe to run multiple times (IF NOT EXISTS on every column).

alter table public.trades
  add column if not exists "status"     text    not null default 'open',
  add column if not exists "autoClosed" boolean not null default false;

-- Backfill: any option trade whose expiration is already in the past
-- gets closed + flagged as autoClosed so the first fetch doesn't
-- re-process rows that were already processed.
update public.trades
   set "status" = 'closed',
       "autoClosed" = true
 where "status" = 'open'
   and expiration is not null
   and expiration <> ''
   and expiration::date < current_date
   and type in ('Sell Put', 'Sell Call');

-- Stock Sell rows are already "closed" trades by nature.
update public.trades
   set "status" = 'closed'
 where type = 'Stock Sell'
   and "status" = 'open';

-- Reload PostgREST schema cache so REST sees the new columns.
notify pgrst, 'reload schema';
