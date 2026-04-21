-- Track when each partner last "fixed" (capitalized) their profits.
-- After capitalization, the distribution engine will only credit them for
-- trades whose close date is strictly after this timestamp. NULL means the
-- partner has never settled, so they participate from the beginning.

alter table partners
  add column if not exists last_settlement_date timestamptz null;

-- Refresh PostgREST so the API exposes the new column immediately.
notify pgrst, 'reload schema';
