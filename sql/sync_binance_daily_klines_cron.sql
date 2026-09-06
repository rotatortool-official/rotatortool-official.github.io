-- ============================================================
-- sync_binance_daily_klines_cron.sql
--
-- Schedules sync-binance-daily-klines every 3 hours.
--
-- CADENCE: settled daily candles never change. Only today's is still
-- forming, and a 14-day grading window is not sensitive to a few hours
-- of staleness in its final candle. The job fetches ~70 symbols (those
-- actually present in signal_snapshots AND listed on Binance), so it is
-- cheap either way.
--
-- MINUTE 23: keeps it clear of sync-binance-spot (every 5 min from :02)
-- and sync-binance-futures (:07/:37), and off the :00 rush that every
-- scheduled job in the world fires on.
--
-- SECRET REUSE — deliberate and reversible: reads the existing
-- 'compute_signal_run_token' vault entry rather than provisioning a new
-- one, because creating an edge-function secret needs CLI or dashboard
-- access. The function validates against the same project-wide
-- SIGNAL_RUN_SYNC_SECRET.
-- ============================================================

create or replace function public.trigger_binance_daily_klines_sync()
returns bigint
language plpgsql
security definer
as $$
declare
  v_token text;
  v_req   bigint;
begin
  select decrypted_secret into v_token
    from vault.decrypted_secrets where name = 'compute_signal_run_token';

  select net.http_post(
    url     := 'https://wyvwycatgexpbugzkdfw.supabase.co/functions/v1/sync-binance-daily-klines',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_token
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 120000
  ) into v_req;

  return v_req;
end;
$$;

select cron.schedule(
  'sync-binance-daily-klines',
  '23 */3 * * *',
  $$ select public.trigger_binance_daily_klines_sync(); $$
);

-- ── Verify ──────────────────────────────────────────────────────
-- select public.trigger_binance_daily_klines_sync();   -- returns a request id
-- select status_code, content from net._http_response where id = <that id>;
-- -- {"ok":true,"symbols_called":105,"symbols_listed_on_binance":70,
-- --  "symbols_skipped_not_listed":35,"symbols_fetched":70,
-- --  "candles_upserted":2100}
--
-- NOTE: candles_upserted can exceed what ends up stored. Delisted pairs
-- return valid-looking but years-old candles, which the 60-day retention
-- prune then removes. That gap is expected, not a failure - see
-- create_binance_daily_klines.sql.
--
-- select jobid, schedule, active from cron.job where jobname = 'sync-binance-daily-klines';
