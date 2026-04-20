-- Heal inflated auto-close results.
--
-- An earlier version of the client wrote `premium * quantity * 100` into
-- `trades.result` for auto-expired short options, even though `quantity`
-- already stores the total share count. This divides those specific rows
-- by 100 to restore the correct P&L.
--
-- The WHERE clause is intentionally strict: it only touches rows whose
-- stored result matches the inflated formula to the cent, so re-running
-- the migration is safe.

update trades
   set result = premium * quantity
 where status = 'closed'
   and type in ('Sell Put', 'Sell Call')
   and premium is not null
   and quantity is not null
   and premium * quantity <> 0
   and abs(result - (premium * quantity * 100)) < 0.5;

notify pgrst, 'reload schema';
