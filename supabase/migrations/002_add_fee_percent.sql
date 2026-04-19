-- ============================================================
-- Migration: Add managementFeePercent column
-- This is the per-partner fee % the user references in the schema.
-- ============================================================

alter table public.partners
  add column if not exists "managementFeePercent" numeric;

-- Backfill from existing management_fee_rate (snake_case) where present
update public.partners
set "managementFeePercent" = management_fee_rate
where "managementFeePercent" is null;
