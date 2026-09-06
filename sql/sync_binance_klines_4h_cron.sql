-- ============================================================
-- sync_binance_klines_4h_cron.sql
--
-- Schedules sync-binance-klines-4h every 2 hours.
--
-- CADENCE: the candles are 4h, so only the forming one moves, and the
-- Insight Engine's thresholds (RSI <= 25 oversold, >= 78 overbought,
-- etc.) are not sensitive to sub-candle drift. ~117 symbols per run at
-- concurrency 8.
--
-- MINUTE 43, EVERY 2 HOURS: keeps it clear of the other Binance syncs —
-- spot (every 5 min from :02), futures (:07 and :37), daily klines
-- (:23) — so no two ever fan out against Binance simultaneously from
-- the same Supabase egress IP.
--
-- SECRET REUSE — deliberate and reversible: reads the existing
-- 'compute_signal_run_token' vault entry rather than provisioning a new
-- one, because creating an edge-function secret needs CLI or dashboard
-- access. The function validates against the same project-wide
-- SIGNAL_RUN_SYNC_SECRET.
-- ============================================================

create or replace function public.trigger_binance_klines_4h_sync()
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
    url     := 'https://wyvwycatgexpbugzkdfw.supabase.co/functions/v1/sync-binance-klines-4h',
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
  'sync-binance-klines-4h',
  '43 */2 * * *',
  $$ select public.trigger_binance_klines_4h_sync(); $$
);

-- ── Verify ──────────────────────────────────────────────────────
-- select public.trigger_binance_klines_4h_sync();     -- returns a request id
-- select status_code, content from net._http_response where id = <that id>;
-- -- {"ok":true,"site_coins":177,"tradable_on_binance":486,
-- --  "requested":117,"stored":117,"failed_or_short":0,"too_short":0}
--
-- select jobid, schedule, active from cron.job where jobname = 'sync-binance-klines-4h';
