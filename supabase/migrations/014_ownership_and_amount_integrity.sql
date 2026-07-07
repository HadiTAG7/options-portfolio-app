-- 014_ownership_and_amount_integrity.sql
--
-- Non-destructive integrity fixes. Safe to run multiple times; nothing
-- here drops, deletes, or rewrites existing data.
--
--  1. recalculate_ownership() now excludes soft-deleted (archived)
--     partners from both the SUM denominator and the UPDATE, matching the
--     app's "archived_at IS NULL" model introduced in migration 012.
--     Previously an archived partner's balance still diluted everyone
--     else's stored ownership_percentage. CREATE OR REPLACE only swaps the
--     function body — no row is touched.
--
--  2. A CHECK (amount > 0) on transactions.amount. Added NOT VALID so it
--     is enforced for FUTURE inserts/updates only and is NOT applied
--     retroactively — existing rows are never re-checked or modified.

-- 1. Ownership recompute excludes archived partners.
create or replace function public.recalculate_ownership()
returns void as $$
declare
  total numeric;
begin
  select coalesce(sum(total_balance), 0) into total
    from public.partners
   where archived_at is null;

  if total > 0 then
    update public.partners
       set ownership_percentage = round((total_balance / total) * 100, 2)
     where archived_at is null;
  end if;
end;
$$ language plpgsql;

-- 2. Guard transactions.amount > 0 (NOT VALID = new rows only; existing
--    rows are left completely untouched). Wrapped in a DO block so
--    re-running the migration is a harmless no-op.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'transactions_amount_positive'
  ) then
    alter table public.transactions
      add constraint transactions_amount_positive check (amount > 0) not valid;
  end if;
end $$;

-- Refresh PostgREST schema cache.
notify pgrst, 'reload schema';
