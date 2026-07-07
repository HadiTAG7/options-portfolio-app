-- 015_lock_rls_to_authenticated.sql
--
-- SECURITY FIX. Replaces the permissive "anon + authenticated" policies
-- (using(true)/with check(true)) with authenticated-only policies, so the
-- public NEXT_PUBLIC anon key can no longer read or write ANY data through
-- the PostgREST REST API. This does NOT drop, delete, or modify any row —
-- it only changes access policies and function grants.
--
-- ⚠️  CUTOVER ORDER — follow this to avoid locking yourself out:
--   1. Supabase dashboard → Authentication → Providers → enable "Email".
--   2. Supabase dashboard → Authentication → Users → "Add user": create
--      your admin account(s) (email + password). If email confirmations are
--      on, either confirm them or disable confirmation for now.
--   3. Deploy the app build that contains the /login flow (this branch).
--   4. THEN run this migration.
-- Until an admin user exists and the login flow is deployed, running this
-- makes the app show no data for anon — that is the intended effect.

-- ---- partners ----
alter table public.partners enable row level security;
drop policy if exists "Allow all access to partners" on public.partners;
drop policy if exists "partners_select_all"          on public.partners;
drop policy if exists "partners_insert_all"          on public.partners;
drop policy if exists "partners_update_all"          on public.partners;
drop policy if exists "partners_delete_all"          on public.partners;
drop policy if exists "partners_authenticated_select" on public.partners;
drop policy if exists "partners_authenticated_insert" on public.partners;
drop policy if exists "partners_authenticated_update" on public.partners;
drop policy if exists "partners_authenticated_delete" on public.partners;

create policy "partners_authenticated_select" on public.partners
  for select to authenticated using (true);
create policy "partners_authenticated_insert" on public.partners
  for insert to authenticated with check (true);
create policy "partners_authenticated_update" on public.partners
  for update to authenticated using (true) with check (true);
create policy "partners_authenticated_delete" on public.partners
  for delete to authenticated using (true);

-- ---- trades ----
alter table public.trades enable row level security;
drop policy if exists "Allow all access to trades" on public.trades;
drop policy if exists "trades_all"                  on public.trades;
drop policy if exists "trades_authenticated_all"    on public.trades;
create policy "trades_authenticated_all" on public.trades
  for all to authenticated using (true) with check (true);

-- ---- transactions ----
alter table public.transactions enable row level security;
drop policy if exists "Allow all access to transactions" on public.transactions;
drop policy if exists "transactions_all"                 on public.transactions;
drop policy if exists "transactions_authenticated_all"   on public.transactions;
create policy "transactions_authenticated_all" on public.transactions
  for all to authenticated using (true) with check (true);

-- ---- active_stocks ----
alter table public.active_stocks enable row level security;
drop policy if exists "active_stocks_all"               on public.active_stocks;
drop policy if exists "active_stocks_authenticated_all" on public.active_stocks;
create policy "active_stocks_authenticated_all" on public.active_stocks
  for all to authenticated using (true) with check (true);

-- ---- recalculate_ownership(): deny anon, allow authenticated/service_role ----
revoke execute on function public.recalculate_ownership() from public;
revoke execute on function public.recalculate_ownership() from anon;
grant  execute on function public.recalculate_ownership() to authenticated;
grant  execute on function public.recalculate_ownership() to service_role;

notify pgrst, 'reload schema';
