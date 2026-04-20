-- Create the active_stocks table (the app expects it but no prior
-- migration created it, so stock inserts were failing with
-- "relation does not exist") and rebuild the permissive RLS policy on
-- the trades table in case the original policy from schema.sql was
-- dropped or never applied.
--
-- Run this file in the Supabase SQL editor, then wait a few seconds
-- (the NOTIFY at the bottom reloads PostgREST).

-- ============================================================
-- 1. active_stocks table
-- ============================================================
-- Column names are intentionally camelCase to match the TypeScript
-- type definitions in src/types/database.ts, which is what the
-- frontend sends via supabase.from('active_stocks').insert({...}).

create table if not exists public.active_stocks (
  id               uuid         primary key default gen_random_uuid(),
  ticker           text         not null,
  quantity         numeric      not null default 0,
  "purchasePrice"  numeric      not null default 0,
  "targetSellPrice" numeric     not null default 0,
  "purchaseDate"   date         not null default current_date,
  created_at       timestamptz  not null default now(),
  updated_at       timestamptz  not null default now()
);

create index if not exists idx_active_stocks_ticker
  on public.active_stocks (ticker);

-- Auto-update updated_at using the shared trigger function from schema.sql.
-- If that function doesn't exist in a fresh DB, create it inline.
create or replace function public.update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create or replace trigger active_stocks_updated_at
  before update on public.active_stocks
  for each row execute function public.update_updated_at();

-- ============================================================
-- 2. RLS policies for active_stocks
-- ============================================================
alter table public.active_stocks enable row level security;

drop policy if exists "active_stocks_all" on public.active_stocks;

create policy "active_stocks_all"
  on public.active_stocks
  for all
  to anon, authenticated
  using (true)
  with check (true);

-- ============================================================
-- 3. Rebuild the permissive RLS policy on trades
-- ============================================================
-- schema.sql enables RLS on public.trades and creates a policy called
-- "Allow all access to trades". If that policy was ever dropped (for
-- example during manual edits in the Supabase Studio), every INSERT
-- and SELECT silently fails. Re-creating it here is idempotent.
alter table public.trades enable row level security;

drop policy if exists "Allow all access to trades" on public.trades;
drop policy if exists "trades_all"                 on public.trades;

create policy "trades_all"
  on public.trades
  for all
  to anon, authenticated
  using (true)
  with check (true);

-- ============================================================
-- 4. Refresh the PostgREST schema cache
-- ============================================================
notify pgrst, 'reload schema';
