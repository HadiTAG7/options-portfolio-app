-- ============================================================
-- Kinetic Terminal: Supabase SQL Schema
-- Run this in your Supabase SQL Editor (https://app.supabase.com)
-- ============================================================

-- 1. Partners (Investors) Table
-- ============================================================
create table if not exists public.partners (
  id            uuid primary key default gen_random_uuid(),
  name          text        not null,
  code          text        not null unique,       -- e.g. "K-89204"
  initials      text        not null,              -- e.g. "AH"
  avatar_url    text,
  total_balance numeric     not null default 0,    -- in USD
  ownership_percentage numeric not null default 0, -- auto-calculated, stored for reads
  management_fee_rate  numeric not null default 1.25,
  performance_24h      numeric not null default 0, -- daily % change
  performance_trend    text    not null default 'up'
                        check (performance_trend in ('up', 'down')),
  joined_at     timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Index for fast lookups by code
create index if not exists idx_partners_code on public.partners (code);

-- 2. Trades (Options & Stock Sells) Table
-- ============================================================
-- IMPORTANT: These column names/types are exactly what the application
-- reads and writes (see src/types/database.ts and src/hooks/use-trades.ts).
-- An earlier revision of this file described a different "options desk"
-- shape (symbol / trade_type / strike_price / expiration_date) that never
-- matched the app and also broke the backfills in migrations 005 and 006.
-- This definition is the source of truth. `"autoClosed"` is quoted so
-- PostgREST exposes it in camelCase, matching migration 005 and the client.
create table if not exists public.trades (
  id            uuid    primary key default gen_random_uuid(),
  ticker        text    not null,                     -- e.g. "NVDA"
  type          text    not null
                  check (type in ('Sell Put', 'Sell Call', 'Stock Sell')),
  quantity      numeric not null default 0,           -- total shares (100, 200, ...)
  premium       numeric not null default 0,           -- per-share premium for options
  strike        numeric not null default 0,
  result        numeric not null default 0,           -- locked-in P&L once closed
  expiration    text    not null default '',          -- option expiry, '' for stock sells
  date          date    not null default current_date,-- trade entry date
  status        text    not null default 'open'
                  check (status in ('open', 'closed')),
  "autoClosed"  boolean not null default false,       -- set when auto-expired
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Indexes for common queries
create index if not exists idx_trades_status on public.trades (status);
create index if not exists idx_trades_ticker on public.trades (ticker);

-- 3. Auto-update `updated_at` trigger
-- ============================================================
create or replace function public.update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create or replace trigger partners_updated_at
  before update on public.partners
  for each row execute function public.update_updated_at();

create or replace trigger trades_updated_at
  before update on public.trades
  for each row execute function public.update_updated_at();

-- 4. Recalculate ownership percentages (callable RPC)
-- ============================================================
-- Call after any insert/update/delete on partners to keep
-- ownership_percentage in sync with total_balance ratios.
create or replace function public.recalculate_ownership()
returns void as $$
declare
  total numeric;
begin
  select coalesce(sum(total_balance), 0) into total from public.partners;

  if total > 0 then
    update public.partners
    set ownership_percentage = round((total_balance / total) * 100, 2);
  end if;
end;
$$ language plpgsql;

-- 5. Enable Row Level Security (RLS)
-- ============================================================
-- For now, allow all operations for authenticated and anon users.
-- Tighten these policies before going to production.
alter table public.partners enable row level security;
alter table public.trades   enable row level security;

create policy "Allow all access to partners"
  on public.partners for all
  using (true) with check (true);

create policy "Allow all access to trades"
  on public.trades for all
  using (true) with check (true);

-- 6. Seed Data
-- ============================================================
-- Demo/seed rows (initial partners and trades) have been MOVED to
-- supabase/seed.sql so this bootstrap file stays pure, production-safe
-- DDL. Running this schema will NOT insert any demo data.
--
-- To load demo data into a DEVELOPMENT project only, run supabase/seed.sql
-- explicitly. Never run seed.sql against production.
