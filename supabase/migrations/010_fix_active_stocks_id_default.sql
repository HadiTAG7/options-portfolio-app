-- 010_fix_active_stocks_id_default.sql
--
-- The active_stocks table in some environments was created before
-- migration 009 with no default on `id`. Because migration 009 used
-- `create table if not exists`, the default was never applied to those
-- pre-existing tables, and inserts without an explicit id fail with:
--   null value in column "id" of relation "active_stocks" violates not-null constraint
--
-- Symptom: clicking "حفظ الصفقة" with trade type = Stock returns a
-- Postgres NOT NULL violation, and the row never persists.
--
-- This migration is idempotent: `alter column ... set default` is a
-- no-op if the default is already in place, so it's safe to run on
-- fresh environments too.

alter table public.active_stocks
  alter column id set default gen_random_uuid();

-- Force PostgREST to pick up the schema change immediately rather than
-- waiting for the next reload cycle. Same pattern as 008_fix_partners_rls
-- and 004_ensure_partner_columns.
notify pgrst, 'reload schema';
