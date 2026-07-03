-- 013_auth_and_rls.sql
--
-- ⚠️ THE LOCKDOWN MIGRATION — READ THE ORDER BEFORE RUNNING ⚠️
--
-- This replaces the permissive anon policies with authenticated,
-- role-aware RLS. After it runs, the app WITHOUT a signed-in session
-- can read and write NOTHING. Required rollout order:
--
--   1. Deploy the app code that contains the /login page and the
--      AppShell auth guard (guard stays dormant while
--      NEXT_PUBLIC_AUTH_ENFORCED is unset).
--   2. In Supabase Dashboard → Authentication → Users, create one
--      user per partner (6 accounts) with email + password.
--   3. Link each auth user to their partner row (SQL below).
--   4. Run THIS migration.
--   5. Rebuild/redeploy web + APK with NEXT_PUBLIC_AUTH_ENFORCED=1.
--   6. (Recommended) rotate the anon key afterwards; set
--      SUPABASE_SERVICE_ROLE_KEY in the server env so the
--      /api/reports/send-monthly route keeps working.
--
-- Linking template (repeat per partner; get ids from auth.users and
-- public.partners):
--
--   update public.partners
--     set auth_user_id = '<auth.users.id>'
--     where id = '<partners.id>';
--
-- Access model ("family-fund transparency"):
--   - Any AUTHENTICATED partner can READ all rows in all four tables —
--     the distribution engine needs the full partner list to compute
--     any single partner's share, and co-investors already know each
--     other. transactions is the exception: LPs read only their own.
--   - Only the GP (partners.isAdmin = true linked to the session user)
--     can WRITE anything.
--   - anon gets nothing.

-- ── 1. Link column ─────────────────────────────────────────────────
alter table public.partners
  add column if not exists auth_user_id uuid unique;

-- ── 2. GP check helper ─────────────────────────────────────────────
-- SECURITY DEFINER so the check bypasses partners' own RLS (otherwise
-- the policy would recurse).
create or replace function public.is_gp()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.partners
    where auth_user_id = auth.uid()
      and "isAdmin" = true
      and archived_at is null
  );
$$;

-- ── 3. partners ────────────────────────────────────────────────────
alter table public.partners enable row level security;

drop policy if exists "partners_select_all" on public.partners;
drop policy if exists "partners_insert_all" on public.partners;
drop policy if exists "partners_update_all" on public.partners;
drop policy if exists "partners_delete_all" on public.partners;
drop policy if exists "Allow all access to partners" on public.partners;
drop policy if exists "partners_anon_all" on public.partners;

create policy "partners_read_authenticated"
  on public.partners for select
  to authenticated
  using (true);

create policy "partners_write_gp"
  on public.partners for insert
  to authenticated
  with check (public.is_gp());

create policy "partners_update_gp"
  on public.partners for update
  to authenticated
  using (public.is_gp())
  with check (public.is_gp());

create policy "partners_delete_gp"
  on public.partners for delete
  to authenticated
  using (public.is_gp());

-- ── 4. trades ──────────────────────────────────────────────────────
alter table public.trades enable row level security;

drop policy if exists "trades_all" on public.trades;
drop policy if exists "Allow all access to trades" on public.trades;

create policy "trades_read_authenticated"
  on public.trades for select
  to authenticated
  using (true);

create policy "trades_write_gp"
  on public.trades for insert
  to authenticated
  with check (public.is_gp());

create policy "trades_update_gp"
  on public.trades for update
  to authenticated
  using (public.is_gp())
  with check (public.is_gp());

create policy "trades_delete_gp"
  on public.trades for delete
  to authenticated
  using (public.is_gp());

-- ── 5. active_stocks ───────────────────────────────────────────────
alter table public.active_stocks enable row level security;

drop policy if exists "active_stocks_all" on public.active_stocks;

create policy "active_stocks_read_authenticated"
  on public.active_stocks for select
  to authenticated
  using (true);

create policy "active_stocks_write_gp"
  on public.active_stocks for insert
  to authenticated
  with check (public.is_gp());

create policy "active_stocks_update_gp"
  on public.active_stocks for update
  to authenticated
  using (public.is_gp())
  with check (public.is_gp());

create policy "active_stocks_delete_gp"
  on public.active_stocks for delete
  to authenticated
  using (public.is_gp());

-- ── 6. transactions — LPs read ONLY their own statement ────────────
alter table public.transactions enable row level security;

drop policy if exists "transactions_all" on public.transactions;
drop policy if exists "Allow all access to transactions" on public.transactions;

create policy "transactions_read_own_or_gp"
  on public.transactions for select
  to authenticated
  using (
    public.is_gp()
    or "investorId" in (
      select id from public.partners where auth_user_id = auth.uid()
    )
  );

create policy "transactions_write_gp"
  on public.transactions for insert
  to authenticated
  with check (public.is_gp());

create policy "transactions_update_gp"
  on public.transactions for update
  to authenticated
  using (public.is_gp())
  with check (public.is_gp());

create policy "transactions_delete_gp"
  on public.transactions for delete
  to authenticated
  using (public.is_gp());

-- ── 7. Reload PostgREST ────────────────────────────────────────────
notify pgrst, 'reload schema';
