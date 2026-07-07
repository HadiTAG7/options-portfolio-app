-- ============================================================
-- Kinetic Terminal: DEVELOPMENT / DEMO SEED DATA
-- ------------------------------------------------------------
-- ⚠️  DO NOT RUN THIS AGAINST PRODUCTION.
--
-- These are demo rows only. They previously lived inside schema.sql,
-- which meant every bootstrap run injected phantom investors (and
-- re-runs duplicated trades). They now live here so the schema bootstrap
-- stays production-safe. Run this manually in a DEVELOPMENT project:
--
--   supabase db execute --file supabase/seed.sql
--   -- or paste into the Supabase SQL editor of a dev project
--
-- Every insert is idempotent (on conflict do nothing), so re-running is
-- safe and non-destructive.
-- ============================================================

-- 1. Partners (investors) — preserved verbatim from the original schema.
insert into public.partners
  (name, code, initials, total_balance, ownership_percentage, management_fee_rate, performance_24h, performance_trend, joined_at)
values
  ('أحمد الهواري',  'K-89204', 'AH', 4120000, 29.00, 1.25,  0.42, 'up',   '2023-01-15'),
  ('سارة منصور',   'K-77312', 'SM', 2850500, 20.10, 1.50, -0.15, 'down', '2023-03-22'),
  ('فهد الكواري',   'K-91283', 'FK', 1240000,  8.70, 1.10,  1.82, 'up',   '2023-06-10'),
  ('سالم العامري',  'K-44521', 'SA', 1780000, 12.50, 1.25,  2.40, 'up',   '2023-02-01'),
  ('نورة الحربي',   'K-55192', 'NH', 2100000, 14.80, 1.30, -0.32, 'down', '2023-04-18'),
  ('خالد المطيري',  'K-62847', 'KM', 2118450, 14.90, 1.25,  0.88, 'up',   '2023-05-30')
on conflict (code) do nothing;

-- Recalculate ownership so percentages are exact after seeding.
select public.recalculate_ownership();

-- 2. Trades (demo).
-- Mapped to the real trades columns (ticker/type/strike/result/expiration/
-- date/status). Fixed UUIDs make re-runs idempotent. `result` is 0 for
-- open positions — the app computes premium*quantity for open options.
-- The old seed's 'Covered Call' maps to the app's 'Sell Call' type.
insert into public.trades
  (id, ticker, type, quantity, premium, strike, result, expiration, date, status)
values
  ('00000000-0000-0000-0000-0000000000a1', 'NVDA', 'Sell Put',  12, 4.20, 890.00, 0, '2024-06-21', '2024-05-01', 'open'),
  ('00000000-0000-0000-0000-0000000000a2', 'TSLA', 'Sell Call',  5, 2.15, 185.00, 0, '2024-05-17', '2024-04-22', 'open'),
  ('00000000-0000-0000-0000-0000000000a3', 'AAPL', 'Sell Put',  25, 1.85, 170.00, 0, '2024-07-19', '2024-05-05', 'open')
on conflict (id) do nothing;
