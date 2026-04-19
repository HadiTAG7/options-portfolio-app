-- ============================================================
-- Migration: Add financial tracking columns + transactions table
-- Run this in your Supabase SQL Editor after the initial schema.
-- ============================================================

-- 1. Add new columns to partners table (camelCase, quoted)
-- ============================================================
alter table public.partners
  add column if not exists "isAdmin"              boolean  not null default false,
  add column if not exists "totalDeposits"         numeric  not null default 0,
  add column if not exists "totalWithdrawals"      numeric  not null default 0,
  add column if not exists "currentBalance"        numeric  not null default 0,
  add column if not exists "totalNetProfit"        numeric  not null default 0,
  add column if not exists "managementFeesPaid"    numeric  not null default 0,
  add column if not exists "baseCapital"           numeric  not null default 0,
  add column if not exists "balanceHistory"        jsonb    not null default '[]'::jsonb;

-- Backfill existing partners: set currentBalance and totalDeposits from total_balance
update public.partners
set "currentBalance" = total_balance,
    "totalDeposits"  = total_balance,
    "baseCapital"    = total_balance,
    "balanceHistory" = jsonb_build_array(
      jsonb_build_object('date', to_char(joined_at, 'YYYY-MM-DD'), 'balance', total_balance)
    )
where "currentBalance" = 0 and total_balance > 0;

-- 2. Transactions table
-- ============================================================
create table if not exists public.transactions (
  id            uuid primary key default gen_random_uuid(),
  "investorId"  uuid        not null references public.partners(id) on delete cascade,
  amount        numeric     not null,
  type          text        not null check (type in ('Deposit', 'Withdrawal')),
  date          timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

create index if not exists idx_transactions_investor on public.transactions ("investorId");
create index if not exists idx_transactions_type on public.transactions (type);

-- RLS
alter table public.transactions enable row level security;

create policy "Allow all access to transactions"
  on public.transactions for all
  using (true) with check (true);
