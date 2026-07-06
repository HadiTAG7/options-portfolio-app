-- ═══════════════════════════════════════════════════════════════════
--  APPLY ALL PENDING SCHEMA CHANGES  —  paste this whole file once into
--  Supabase → SQL Editor → New query → Run.
--
--  Every statement is idempotent (IF NOT EXISTS / drop-before-add), so
--  it is safe to run even if you already applied some of these, and
--  safe to run again later.
--
--  This bundle is ADDITIVE ONLY — it adds columns, defaults, and
--  ledger plumbing. It does NOT change who can read/write anything.
--
--  ⚠️ It deliberately EXCLUDES 013_auth_and_rls.sql (the login
--     lockdown). Run that one LATER, on its own, only after you have
--     created the partner accounts from Settings → حسابات الشركاء —
--     running it early locks everyone out.
-- ═══════════════════════════════════════════════════════════════════


-- ── active_stocks: cached live price columns ───────────────────────
alter table public.active_stocks
  add column if not exists "currentPrice"          numeric,
  add column if not exists "currentPriceUpdatedAt" timestamptz;

-- ── active_stocks: id default (fixes "null value in column id" when
--    adding a stock in environments created before this default) ─────
alter table public.active_stocks
  alter column id set default gen_random_uuid();

-- ── partners: settlement date, soft-delete, email ──────────────────
alter table public.partners
  add column if not exists last_settlement_date timestamptz,
  add column if not exists archived_at          timestamptz,
  add column if not exists email                text;

create index if not exists partners_active_idx
  on public.partners (total_balance desc)
  where archived_at is null;

create unique index if not exists partners_email_unique
  on public.partners (lower(email))
  where email is not null;

-- ── trades: exact created_at for same-day settlement ordering ──────
alter table public.trades
  add column if not exists created_at timestamptz;

-- Backfill legacy rows to midnight of their trade date (matches the
-- old behavior exactly; only NEW trades gain precise ordering).
update public.trades
  set created_at = nullif(date, '')::timestamptz
  where created_at is null
    and date ~ '^\d{4}-\d{2}-\d{2}';

alter table public.trades
  alter column created_at set default now();

-- ── trades: covered-call linkage ──────────────────────────────────
alter table public.trades
  add column if not exists linked_stock_id uuid
    references public.active_stocks(id) on delete set null;

-- ── transactions: allow Fee + Capitalize types, add context cols ───
-- (drop-then-add so the widened CHECK always wins, even on re-run)
alter table public.transactions
  drop constraint if exists transactions_type_check;

alter table public.transactions
  add constraint transactions_type_check
  check (type in ('Deposit', 'Withdrawal', 'Fee', 'Capitalize'));

alter table public.transactions
  add column if not exists note               text,
  add column if not exists related_partner_id uuid
    references public.partners(id) on delete set null;

-- ── Refresh the PostgREST schema cache so the REST API sees it all ─
notify pgrst, 'reload schema';
