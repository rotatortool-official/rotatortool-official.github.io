-- ============================================================
-- sync_binance_spot_cron.sql
--
-- Schedules sync-binance-spot every 5 minutes.
--
-- CADENCE: it is a single bulk call, so frequency is essentially free.
-- 5 minutes matches the shared CoinGecko cache TTL the site already
-- runs on, so displayed prices are about as fresh as they were when the
-- browser fetched Binance itself. Raise or lower without any schema
-- change.
--
-- MINUTE OFFSET (2,7,12,...): every scheduled job in the world fires on
-- :00 and :05. Offsetting avoids that contention, and staggers this
-- against sync-binance-futures on :07/:37.
--
-- SECRET REUSE — deliberate and reversible: reads the existing
-- 'compute_signal_run_token' vault entry rather than provisioning a new
-- one, because creating an edge-function secret needs CLI or dashboard
-- access. sync-binance-spot validates against the same project-wide
-- SIGNAL_RUN_SYNC_SECRET. To separate them later: create a dedicated
-- secret, add a vault entry, change the name below.
-- ============================================================

create or replace function public.trigger_binance_spot_sync()
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
    url     := 'https://wyvwycatgexpbugzkdfw.supabase.co/functions/v1/sync-binance-spot',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_token
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) into v_req;

  return v_req;
end;
$$;

select cron.schedule(
  'sync-binance-spot',
  '2,7,12,17,22,27,32,37,42,47,52,57 * * * *',
  $$ select public.trigger_binance_spot_sync(); $$
);

-- ── Verify ──────────────────────────────────────────────────────
-- select public.trigger_binance_spot_sync();          -- returns a request id
-- select status_code, content from net._http_response where id = <that id>;
-- -- {"ok":true,"pairs_returned":3695,"usdt_pairs_stored":677,...}
--
-- select jobid, schedule, active from cron.job where jobname = 'sync-binance-spot';
