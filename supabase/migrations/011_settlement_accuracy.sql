-- 011_settlement_accuracy.sql
--
-- Two schema fixes that back the settlement-accuracy code changes:
--
-- 1. trades.created_at — the eligibility engine (isEligible in
--    src/lib/partner-profit.ts) used to compare the trade's DATE
--    (YYYY-MM-DD, parses as UTC midnight) against last_settlement_date
--    (a full timestamp). Any trade dated the same day as a settlement
--    was treated as already-settled even when it was entered hours
--    AFTER the settlement, so its profit silently vanished from the
--    distribution. Recording an exact created_at lets the engine
--    order same-day events correctly.
--
--    Backfill: existing rows get midnight of their trade date — the
--    same value the old comparison implied, so historical behavior is
--    unchanged; only NEW trades gain precise ordering.
--
-- 2. transactions.type — the GP performance fee is now credited to
--    the GP row whenever an LP settles (capitalize / profit
--    withdrawal), and that credit is logged as a 'Fee' transaction.
--    The original check constraint only allowed Deposit/Withdrawal.
--
-- Run in the Supabase SQL editor. Idempotent — safe to run twice.

-- ── 1. trades.created_at ──────────────────────────────────────────
alter table public.trades
  add column if not exists created_at timestamptz;

-- Midnight-of-trade-date backfill for rows that predate the column.
-- nullif guards empty-string dates; a failed cast would abort, so
-- only sane YYYY-MM-DD values are converted.
update public.trades
  set created_at = nullif(date, '')::timestamptz
  where created_at is null
    and date ~ '^\d{4}-\d{2}-\d{2}';

alter table public.trades
  alter column created_at set default now();

-- ── 2. transactions type check: allow 'Fee' ───────────────────────
alter table public.transactions
  drop constraint if exists transactions_type_check;

alter table public.transactions
  add constraint transactions_type_check
  check (type in ('Deposit', 'Withdrawal', 'Fee'));

-- Make PostgREST see both changes immediately.
notify pgrst, 'reload schema';
