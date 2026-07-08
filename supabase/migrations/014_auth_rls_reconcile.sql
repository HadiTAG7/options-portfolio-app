-- 014_auth_rls_reconcile.sql
-- ═══════════════════════════════════════════════════════════════════
--  THE ONE FILE TO RUN.  Paste this whole file into
--  Supabase → SQL Editor → New query → Run.
--
--  It does TWO things, safely (idempotent + wrapped in a single
--  transaction, so it is all-or-nothing and can be re-run any time):
--
--   1. PARTNER LOGINS  — the reason a partner logged in and saw no
--      data.  The live database's only access rule was
--      `USING is_admin()` (JWT app_metadata.role = 'admin'), which ONLY
--      the GP account has — so every partner was blocked from reading
--      anything.  This links each auth account to its partner row and
--      replaces that rule with:
--        • any signed-in partner may READ partners / trades / stocks
--          (the profit engine needs the full list to compute one
--          partner's share), and READ only their OWN transactions;
--        • only the GP may WRITE anything.
--
--   2. SCHEMA CATCH-UP — a few additive columns / a widened CHECK that
--      earlier migrations never applied on this database (ledger notes,
--      settlement-fee journaling, covered-call linkage, cached live
--      prices).  Purely additive; changes no existing data.
--
--  This SUPERSEDES 013_auth_and_rls.sql for this already-deployed
--  database (013 assumed policy names that don't exist here). Run THIS
--  file; you do not need to run 013.
--
--  AFTER running this, to make each partner see ONLY their own page,
--  redeploy the app with NEXT_PUBLIC_AUTH_ENFORCED=1 (see the app's
--  Settings screen for the exact steps). Run this SQL FIRST, enforce
--  SECOND — never the other way around.
-- ═══════════════════════════════════════════════════════════════════

begin;

-- ─────────────────────────────────────────────────────────────────
--  PART 1 · SCHEMA CATCH-UP  (additive, safe, no data touched)
-- ─────────────────────────────────────────────────────────────────

-- transactions: allow Fee + Capitalize, add ledger context columns
alter table public.transactions
  drop constraint if exists transactions_type_check;
alter table public.transactions
  add constraint transactions_type_check
  check (type in ('Deposit', 'Withdrawal', 'Fee', 'Capitalize'));
-- NOTE: partners.id and active_stocks.id are TEXT (ids like 'admin-1',
-- 'uscn7i1sd'), so the FK columns below must be text, not uuid.
alter table public.transactions
  add column if not exists note               text,
  add column if not exists related_partner_id text
    references public.partners(id) on delete set null;

-- trades: covered-call → active-stock lot linkage
alter table public.trades
  add column if not exists linked_stock_id text
    references public.active_stocks(id) on delete set null;

-- active_stocks: cached live-price columns
alter table public.active_stocks
  add column if not exists "currentPrice"          numeric,
  add column if not exists "currentPriceUpdatedAt" timestamptz;

-- ─────────────────────────────────────────────────────────────────
--  PART 2 · PARTNER LOGINS  (link accounts + role-aware RLS)
-- ─────────────────────────────────────────────────────────────────

-- 2a. Link column
alter table public.partners
  add column if not exists auth_user_id uuid unique;

-- 2b. Link every auth account to its partner row BY EMAIL
--     (case-insensitive; all current accounts match exactly).
update public.partners p
set    auth_user_id = u.id
from   auth.users u
where  lower(p.email) = lower(u.email)
  and  p.auth_user_id is distinct from u.id;

-- 2c. GP check. Accepts EITHER mechanism so the GP can never be locked
--     out: the existing JWT app_metadata.role='admin', OR a linked
--     partner row flagged isAdmin. SECURITY DEFINER so the lookup does
--     not recurse through partners' own RLS.
create or replace function public.is_gp()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false)
    or exists (
      select 1 from public.partners
      where auth_user_id = auth.uid()
        and "isAdmin" = true
        and archived_at is null
    );
$$;

-- 2d. partners — read: any signed-in partner · write: GP only
alter table public.partners enable row level security;
drop policy if exists partners_admin_all          on public.partners;
drop policy if exists partners_read_authenticated  on public.partners;
drop policy if exists partners_write_gp            on public.partners;
drop policy if exists partners_update_gp           on public.partners;
drop policy if exists partners_delete_gp           on public.partners;
create policy partners_read_authenticated on public.partners
  for select to authenticated using (true);
create policy partners_write_gp on public.partners
  for insert to authenticated with check (public.is_gp());
create policy partners_update_gp on public.partners
  for update to authenticated using (public.is_gp()) with check (public.is_gp());
create policy partners_delete_gp on public.partners
  for delete to authenticated using (public.is_gp());

-- 2e. trades
alter table public.trades enable row level security;
drop policy if exists trades_admin_all          on public.trades;
drop policy if exists trades_read_authenticated  on public.trades;
drop policy if exists trades_write_gp            on public.trades;
drop policy if exists trades_update_gp           on public.trades;
drop policy if exists trades_delete_gp           on public.trades;
create policy trades_read_authenticated on public.trades
  for select to authenticated using (true);
create policy trades_write_gp on public.trades
  for insert to authenticated with check (public.is_gp());
create policy trades_update_gp on public.trades
  for update to authenticated using (public.is_gp()) with check (public.is_gp());
create policy trades_delete_gp on public.trades
  for delete to authenticated using (public.is_gp());

-- 2f. active_stocks
alter table public.active_stocks enable row level security;
drop policy if exists active_stocks_admin_all          on public.active_stocks;
drop policy if exists active_stocks_read_authenticated  on public.active_stocks;
drop policy if exists active_stocks_write_gp            on public.active_stocks;
drop policy if exists active_stocks_update_gp           on public.active_stocks;
drop policy if exists active_stocks_delete_gp           on public.active_stocks;
create policy active_stocks_read_authenticated on public.active_stocks
  for select to authenticated using (true);
create policy active_stocks_write_gp on public.active_stocks
  for insert to authenticated with check (public.is_gp());
create policy active_stocks_update_gp on public.active_stocks
  for update to authenticated using (public.is_gp()) with check (public.is_gp());
create policy active_stocks_delete_gp on public.active_stocks
  for delete to authenticated using (public.is_gp());

-- 2g. transactions — LPs read ONLY their own statement; GP reads all
alter table public.transactions enable row level security;
drop policy if exists transactions_admin_all          on public.transactions;
drop policy if exists transactions_read_own_or_gp     on public.transactions;
drop policy if exists transactions_write_gp           on public.transactions;
drop policy if exists transactions_update_gp          on public.transactions;
drop policy if exists transactions_delete_gp          on public.transactions;
create policy transactions_read_own_or_gp on public.transactions
  for select to authenticated using (
    public.is_gp()
    or "investorId" in (
      select id from public.partners where auth_user_id = auth.uid()
    )
  );
create policy transactions_write_gp on public.transactions
  for insert to authenticated with check (public.is_gp());
create policy transactions_update_gp on public.transactions
  for update to authenticated using (public.is_gp()) with check (public.is_gp());
create policy transactions_delete_gp on public.transactions
  for delete to authenticated using (public.is_gp());

commit;

-- Refresh the PostgREST API cache so it sees the new column + policies.
notify pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────
--  VERIFY (read-only) — expect linked_partners = total_partners = 6
-- ─────────────────────────────────────────────────────────────────
select
  count(*) filter (where auth_user_id is not null) as linked_partners,
  count(*)                                          as total_partners
from public.partners;
