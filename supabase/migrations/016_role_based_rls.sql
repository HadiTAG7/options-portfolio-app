-- 016_role_based_rls.sql
--
-- Role-aware RLS for the investor portal. ADMINS (app_metadata.role='admin')
-- keep full direct access to every table. Everyone else (investors) gets NO
-- direct table access — the investor portal serves their own data through
-- server routes that use the service-role key and return only their slice.
-- Non-destructive: this only changes policies and grants, never rows.
--
-- ⚠️ CUTOVER — do this BEFORE running this migration, or admins lose access:
--   Set app_metadata.role='admin' on every admin (GP) auth user.
--   Supabase dashboard → Authentication → Users → (user) → edit
--   "App Metadata" → add:  { "role": "admin" }
--   (Investors are NOT given this — an investor JWT can never satisfy is_admin.)
--
-- This migration supersedes 015's blanket "authenticated" policies and is
-- self-contained: it drops both the old anon-era and the 015 policy names.

-- is_admin(): true only when the caller's JWT carries app_metadata.role=admin.
-- app_metadata is server-controlled, so investors cannot forge it.
create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false);
$$;
grant execute on function public.is_admin() to authenticated;

-- ---- partners ----
alter table public.partners enable row level security;
drop policy if exists "partners_authenticated_select" on public.partners;
drop policy if exists "partners_authenticated_insert" on public.partners;
drop policy if exists "partners_authenticated_update" on public.partners;
drop policy if exists "partners_authenticated_delete" on public.partners;
drop policy if exists "partners_select_all"           on public.partners;
drop policy if exists "partners_insert_all"           on public.partners;
drop policy if exists "partners_update_all"           on public.partners;
drop policy if exists "partners_delete_all"           on public.partners;
drop policy if exists "Allow all access to partners"  on public.partners;
drop policy if exists "partners_admin_all"            on public.partners;
create policy "partners_admin_all" on public.partners
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---- trades ----
alter table public.trades enable row level security;
drop policy if exists "trades_authenticated_all"   on public.trades;
drop policy if exists "trades_all"                 on public.trades;
drop policy if exists "Allow all access to trades" on public.trades;
drop policy if exists "trades_admin_all"           on public.trades;
create policy "trades_admin_all" on public.trades
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---- transactions ----
alter table public.transactions enable row level security;
drop policy if exists "transactions_authenticated_all"   on public.transactions;
drop policy if exists "transactions_all"                 on public.transactions;
drop policy if exists "Allow all access to transactions" on public.transactions;
drop policy if exists "transactions_admin_all"           on public.transactions;
create policy "transactions_admin_all" on public.transactions
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---- active_stocks ----
alter table public.active_stocks enable row level security;
drop policy if exists "active_stocks_authenticated_all" on public.active_stocks;
drop policy if exists "active_stocks_all"               on public.active_stocks;
drop policy if exists "active_stocks_admin_all"         on public.active_stocks;
create policy "active_stocks_admin_all" on public.active_stocks
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

notify pgrst, 'reload schema';
