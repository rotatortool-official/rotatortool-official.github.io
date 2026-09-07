-- ============================================================
-- add_long_short_ratio_to_futures_history.sql
--
-- Applied 2026-09-07 via the Supabase connector.
--
-- WHY THIS IS URGENT RATHER THAN NICE-TO-HAVE:
-- binance_futures_history exists precisely because Binance serves only
-- ~30 days of this class of data and it CANNOT be reconstructed after
-- the fact (unlike price, which rotator-backtest rebuilds from klines
-- over 771 days). The table already accumulates open interest, funding
-- and price for that reason. long_short_ratio was left out, so every
-- day that passed was a day of positioning history permanently lost.
--
-- The value is already fetched — sync-binance-futures pulls
-- globalLongShortAccountRatio for each symbol in its rotation and
-- writes it to binance_futures_metrics, which keeps only the CURRENT
-- reading and overwrites it on the next refresh. This column is what
-- turns that throwaway reading into a series.
--
-- It also feeds detect_coin_events(): "extreme positioning" is
-- currently detected by comparing today's daily snapshot to
-- yesterday's, which is the coarsest possible view of a value that
-- moves hourly. With an hourly series the same events can later be
-- measured against forward returns, which is the only way to find out
-- whether they predict anything.
--
-- Nullable with no default, on purpose: NULL means "not measured in
-- this hour", which is the truth for every symbol outside the current
-- rotation batch. A default of 0 or 1 would claim balanced positioning
-- for symbols nobody looked at.
-- ============================================================

alter table public.binance_futures_history
  add column if not exists long_short_ratio numeric;

comment on column public.binance_futures_history.long_short_ratio is
  'Binance globalLongShortAccountRatio at this hour bucket, for symbols in that run''s rotation batch. NULL means not sampled this hour, never "balanced". Accumulated because Binance serves only ~30 days and it cannot be rebuilt later.';

-- ── Verify ──────────────────────────────────────────────────────
-- -- Immediately after applying: all NULL, nothing has been written yet.
-- select count(*) rows, count(long_short_ratio) with_ls
--   from public.binance_futures_history;
--
-- -- After the next sync-binance-futures run (:07 or :37), the current
-- -- bucket should carry roughly OI_BATCH (75) non-null readings, and
-- -- with_oi should now MATCH with_ls — both are written from the same
-- -- rotation batch.
-- select bucket, count(*) rows,
--        count(open_interest_value) with_oi,
--        count(long_short_ratio)    with_ls
--   from public.binance_futures_history
--  group by bucket order by bucket desc limit 6;
--
-- -- THE NUMBER THAT PROVES THE OVERWRITE FIX (see the function change
-- -- shipped alongside this migration): with two runs per hour at 75
-- -- symbols each, a bucket should accumulate ~150 sampled symbols, not
-- -- ~75. Before the fix the second run's NULLs overwrote the first
-- -- run's readings and half of every hour's collected data was thrown
-- -- away. Measured on 2026-09-07 before the change: 302 rows/bucket,
-- -- 75-77 with OI.
