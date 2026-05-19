-- 013_add_partner_email.sql
--
-- Adds the `email` column the Edit Partner dialog and the monthly
-- report sender (src/app/api/reports/send-monthly/route.ts) both
-- write to / read from. Without this column PostgREST returns
-- "Could not find the 'email' column of 'partners' in the schema cache".
--
-- Safe to run multiple times — uses IF NOT EXISTS.

alter table public.partners
  add column if not exists email text;

-- Case-insensitive uniqueness, but only when email is provided.
-- Two NULLs are allowed (partners without an email yet).
create unique index if not exists partners_email_unique
  on public.partners (lower(email))
  where email is not null;

-- Force PostgREST to reload its schema cache so the REST API
-- recognises the new column without waiting for the periodic refresh.
notify pgrst, 'reload schema';
