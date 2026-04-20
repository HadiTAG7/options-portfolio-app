-- Add an `entry_date` column to partners. Defaults to the row's
-- creation day so existing rows get backfilled and new inserts don't
-- need to specify it.

alter table partners
  add column if not exists entry_date date default current_date;

-- Refresh PostgREST so the API exposes the new column immediately.
notify pgrst, 'reload schema';
