-- 003_ensure_balance_history.sql
--
-- Ensures the "balanceHistory" JSONB column exists on public.partners.
-- This column stores the running balance timeline used by the sparkline
-- and is appended to on every withdrawal/deposit.
--
-- IMPORTANT: After running this migration you MUST reload the PostgREST
-- schema cache, otherwise the Supabase REST API will keep returning
-- "Could not find the 'balanceHistory' column of 'partners' in the
-- schema cache" until the cache refreshes on its own.
--
--   NOTIFY pgrst, 'reload schema';
--
-- In the Supabase dashboard you can also hit "Reload schema cache"
-- under Project Settings -> API.

alter table public.partners
  add column if not exists "balanceHistory" jsonb not null default '[]'::jsonb;

-- Backfill any rows that somehow ended up with NULL (shouldn't happen
-- given the NOT NULL + default, but guards against older rows inserted
-- before the column existed).
update public.partners
set "balanceHistory" = '[]'::jsonb
where "balanceHistory" is null;

-- Tell PostgREST to reload its schema cache so the REST API sees the
-- new column immediately.
notify pgrst, 'reload schema';
