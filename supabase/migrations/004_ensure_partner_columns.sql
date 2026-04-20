-- 004_ensure_partner_columns.sql
--
-- Defensive migration: ensures every column the Add New Partner
-- form writes to actually exists on public.partners and that
-- PostgREST reloads its schema cache so the REST API can see them.
--
-- Safe to run multiple times — every statement uses IF NOT EXISTS.
--
-- Run this in the Supabase SQL editor. If you still see a schema
-- cache error after running it, hit
-- Project Settings -> API -> "Reload schema cache"
-- in the dashboard.

alter table public.partners
  add column if not exists "isAdmin"              boolean not null default false,
  add column if not exists "totalDeposits"        numeric not null default 0,
  add column if not exists "totalWithdrawals"     numeric not null default 0,
  add column if not exists "currentBalance"       numeric not null default 0,
  add column if not exists "totalNetProfit"       numeric not null default 0,
  add column if not exists "managementFeesPaid"   numeric not null default 0,
  add column if not exists "managementFeePercent" numeric,
  add column if not exists "baseCapital"          numeric not null default 0,
  add column if not exists "balanceHistory"       jsonb   not null default '[]'::jsonb;

-- Make sure PostgREST can see the new columns immediately.
notify pgrst, 'reload schema';
