-- Soft-delete support for partners.
-- Instead of permanently removing rows, we mark them with an archived_at timestamp.
-- All active queries filter on archived_at IS NULL.

alter table public.partners
  add column if not exists archived_at timestamptz;

create index if not exists partners_active_idx
  on public.partners (total_balance desc)
  where archived_at is null;
