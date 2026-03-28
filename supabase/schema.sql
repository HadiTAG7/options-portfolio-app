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

-- 2. Trades (Options & Stocks) Table
-- ============================================================
create table if not exists public.trades (
  id               uuid primary key default gen_random_uuid(),
  symbol           text    not null,                -- e.g. "NVDA", "AAPL 250C 10/24"
  trade_type       text    not null
                    check (trade_type in ('Sell Put', 'Covered Call', 'Buy Call', 'Buy Put')),
  quantity         integer not null default 1,
  premium          numeric not null default 0,      -- per-contract premium
  strike_price     numeric not null default 0,
  expiration_date  date    not null,
  entry_date       date    not null default current_date,
  unrealized_pnl   numeric not null default 0,
  total_profit     numeric not null default 0,
  return_percent   numeric not null default 0,
  status           text    not null default 'open'
                    check (status in ('open', 'closed', 'expired', 'assigned')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Indexes for common queries
create index if not exists idx_trades_status on public.trades (status);
create index if not exists idx_trades_symbol on public.trades (symbol);

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

-- 6. Seed Data (Initial Partners)
-- ============================================================
insert into public.partners (name, code, initials, total_balance, ownership_percentage, management_fee_rate, performance_24h, performance_trend, joined_at)
values
  ('أحمد الهواري',  'K-89204', 'AH', 4120000, 29.00, 1.25,  0.42, 'up',   '2023-01-15'),
  ('سارة منصور',   'K-77312', 'SM', 2850500, 20.10, 1.50, -0.15, 'down', '2023-03-22'),
  ('فهد الكواري',   'K-91283', 'FK', 1240000,  8.70, 1.10,  1.82, 'up',   '2023-06-10'),
  ('سالم العامري',  'K-44521', 'SA', 1780000, 12.50, 1.25,  2.40, 'up',   '2023-02-01'),
  ('نورة الحربي',   'K-55192', 'NH', 2100000, 14.80, 1.30, -0.32, 'down', '2023-04-18'),
  ('خالد المطيري',  'K-62847', 'KM', 2118450, 14.90, 1.25,  0.88, 'up',   '2023-05-30')
on conflict (code) do nothing;

-- Recalculate after seed so percentages are exact
select public.recalculate_ownership();

-- 7. Seed Data (Initial Trades)
-- ============================================================
insert into public.trades (symbol, trade_type, quantity, premium, strike_price, expiration_date, entry_date, unrealized_pnl, total_profit, return_percent, status)
values
  ('NVDA',  'Sell Put',      12, 4.20, 890.00, '2024-06-21', '2024-05-01',  1240.50,  5040.00,  24.6, 'open'),
  ('TSLA',  'Covered Call',   5, 2.15, 185.00, '2024-05-17', '2024-04-22',  -312.20, -1075.00, -12.4, 'open'),
  ('AAPL',  'Sell Put',      25, 1.85, 170.00, '2024-07-19', '2024-05-05',   450.00,  4625.00,   9.8, 'open')
on conflict do nothing;
