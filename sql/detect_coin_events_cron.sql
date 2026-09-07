-- ============================================================
-- pg_cron schedule for detect_coin_events
--
-- APPLIED 2026-09-07 -- jobid 13, jobname detect-coin-events-daily, active.
--
-- Run AFTER:
--   1) sql/create_coin_events.sql
--
-- Simpler than the other *_cron.sql files here: detect_coin_events is a
-- plain SQL function, so there is no vault secret, no net.http_post and
-- no Edge Function URL to keep in sync. Nothing is fetched -- both
-- inputs are already in this database.
--
-- WHY 00:45 UTC:
--
--   00:00  the daily candle closes
--   00:23  sync-binance-daily-klines  (existing, 23 */3 * * *)
--          -- first technicals refresh against the just-closed candle
--   00:37  sync-binance-futures       (existing, 7,37 * * * *)
--   00:45  detect-coin-events-daily   (THIS)
--
-- Eight minutes after the futures sync and twenty-two after the
-- technicals one -- both comfortably inside their own runtimes, and
-- nothing else is scheduled in that minute.
--
-- The slot is not just convenience. Running here means EVERY value in
-- the snapshot is effectively close-based, RSI included, because the
-- last bar in the series is minutes old. Snapshotting in the evening
-- instead would pair a confirmed cross with an RSI computed from a
-- half-formed candle, and the report would silently mix two different
-- meanings of "today".
--
-- Detection and delivery are deliberately separate jobs. This one writes
-- rows; the Telegram send reads them at 07:00 UTC (Step 5/6). Splitting
-- them means a delivery failure never costs us the detection -- the
-- events are already durable in coin_events, and notified_at is still
-- null, so the next send picks them up.
-- ============================================================

select cron.unschedule(jobid)
  from cron.job
 where jobname like 'detect-coin-events%';

select cron.schedule(
  'detect-coin-events-daily',
  '45 0 * * *',
  $$ select public.detect_coin_events(); $$
);

-- == Verify ======================================================
select jobid, jobname, schedule, active
  from cron.job
 where jobname like 'detect-coin-events%';

-- -- Manual trigger (test without waiting for the cron):
-- select * from public.detect_coin_events();
--
-- -- Did the scheduled run actually succeed?
-- select jobid, status, return_message, start_time, end_time
--   from cron.job_run_details
--  where jobid = (select jobid from cron.job where jobname = 'detect-coin-events-daily')
--  order by start_time desc limit 10;
--
-- -- Health check that matters most in week 1: is the record accumulating
-- -- one row per coin per day, with no gaps? A gap longer than
-- -- PREV_MAX_GAP_DAYS (5) silently disables RSI and futures detection,
-- -- because there is then no previous reading to compare against.
-- select as_of_date, count(*) coins
--   from public.coin_indicator_daily
--  group by 1 order by 1 desc limit 14;
