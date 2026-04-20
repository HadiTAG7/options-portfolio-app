-- Fix Row Level Security on the partners table so anon/authenticated
-- clients (the Next.js app using the anon key) can INSERT / SELECT /
-- UPDATE / DELETE rows.
--
-- Symptom that led to this file: newly-added partners disappeared on
-- page refresh. Typical root cause: RLS is enabled on the table but no
-- policy grants write access to anon, so Supabase silently rejects
-- inserts (or returns zero rows from a subsequent SELECT) without a
-- hard error the client can surface.
--
-- Run this entire file in the Supabase SQL editor, then go to
--   Database -> Replication -> Reload schema
-- (or just wait a few seconds — the NOTIFY at the bottom does it).

-- ============================================================
-- OPTION A (RECOMMENDED for current dev stage):
-- Keep RLS enabled, but (re)create a permissive policy that allows
-- full access from the anon and authenticated roles. Tighten before
-- shipping to production.
-- ============================================================

alter table public.partners enable row level security;

-- Drop any stale/misconfigured policies so we start from a clean slate.
drop policy if exists "Allow all access to partners" on public.partners;
drop policy if exists "partners_anon_all"            on public.partners;
drop policy if exists "partners_select_all"          on public.partners;
drop policy if exists "partners_insert_all"          on public.partners;
drop policy if exists "partners_update_all"          on public.partners;
drop policy if exists "partners_delete_all"          on public.partners;

-- One policy per action, explicit about the roles, so it's clear what
-- is allowed and easy to revoke later.
create policy "partners_select_all"
  on public.partners
  for select
  to anon, authenticated
  using (true);

create policy "partners_insert_all"
  on public.partners
  for insert
  to anon, authenticated
  with check (true);

create policy "partners_update_all"
  on public.partners
  for update
  to anon, authenticated
  using (true)
  with check (true);

create policy "partners_delete_all"
  on public.partners
  for delete
  to anon, authenticated
  using (true);

-- Do the same for the companion tables the addPartner flow writes to,
-- otherwise the insert succeeds but the follow-up transaction log and
-- ownership recalculation silently fail.
alter table public.transactions enable row level security;

drop policy if exists "Allow all access to transactions" on public.transactions;
drop policy if exists "transactions_all"                 on public.transactions;

create policy "transactions_all"
  on public.transactions
  for all
  to anon, authenticated
  using (true)
  with check (true);

-- Make sure the PostgREST schema cache picks up the new policies
-- immediately instead of waiting for the next auto-reload.
notify pgrst, 'reload schema';


-- ============================================================
-- OPTION B (FASTEST unblock, less safe):
-- Temporarily disable RLS entirely on the partners table. Use this
-- only while you are developing locally with no real user data.
-- To use it, comment out Option A above and uncomment the block below.
-- ============================================================
--
-- alter table public.partners     disable row level security;
-- alter table public.transactions disable row level security;
-- notify pgrst, 'reload schema';
