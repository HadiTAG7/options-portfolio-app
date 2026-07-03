-- 012_ledger_and_wheel.sql
--
-- Backs the audit-ledger and wheel-analytics features:
--
-- 1. transactions gains a 'Capitalize' type plus context columns so
--    every settlement event is journaled:
--      note               free-text context ("تثبيت تلقائي لباقي
--                         الأرباح عند السحب", "رسوم أداء من تسوية X")
--      related_partner_id for Fee rows: the LP whose settlement
--                         generated the fee credited to the GP
--
-- 2. trades gains linked_stock_id so a covered call can reference the
--    active stock lot it is written against.
--
-- Run in the Supabase SQL editor after 011. Idempotent.

-- ── 1. transactions: Capitalize + context columns ─────────────────
alter table public.transactions
  drop constraint if exists transactions_type_check;

alter table public.transactions
  add constraint transactions_type_check
  check (type in ('Deposit', 'Withdrawal', 'Fee', 'Capitalize'));

alter table public.transactions
  add column if not exists note text,
  add column if not exists related_partner_id uuid references public.partners(id) on delete set null;

-- ── 2. trades: covered-call linkage ───────────────────────────────
alter table public.trades
  add column if not exists linked_stock_id uuid references public.active_stocks(id) on delete set null;

-- Make PostgREST see the changes immediately.
notify pgrst, 'reload schema';
