-- ============================================================
-- sync_binance_futures_cron.sql
--
-- Schedules sync-binance-futures every 30 minutes.
--
-- CADENCE: deliberately conservative to start. The bulk half (futures
-- price, volume, funding, category) refreshes ALL 300 symbols on every
-- run for a flat 3 API calls. Only open interest is per-symbol, and it
-- rotates 75 symbols per run — so each symbol's OI refreshes about
-- every 2 hours, at ~156 Binance calls/hour total.
--
-- To make the data fresher later, raise OI_BATCH in the edge function
-- or move this to '*/15'. Neither needs a schema change.
--
-- MINUTES 7 AND 37, not 0 and 30: every scheduled job on the planet
-- fires on the hour and half hour. Offsetting avoids that contention.
--
-- SECRET REUSE — deliberate, and reversible: this reads the existing
-- 'compute_signal_run_token' vault entry rather than provisioning a new
-- one, because creating an edge-function secret requires CLI/dashboard
-- access. Both are internal cron-triggered sync jobs in this project,
-- and sync-binance-futures validates against the same project-wide
-- SIGNAL_RUN_SYNC_SECRET env var. To separate them later: create a
-- dedicated secret, add a vault entry, and change the name below.
-- ============================================================

create or replace function public.trigger_binance_futures_sync()
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
    url     := 'https://wyvwycatgexpbugzkdfw.supabase.co/functions/v1/sync-binance-futures',
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
  'sync-binance-futures',
  '7,37 * * * *',
  $$ select public.trigger_binance_futures_sync(); $$
);

-- ── Verify ──────────────────────────────────────────────────────
-- -- fire it by hand, then read the async response:
-- select public.trigger_binance_futures_sync();       -- returns a request id
-- select status_code, content from net._http_response where id = <that id>;
--
-- -- expected shape:
-- -- {"ok":true,"perps_live":528,"universe":300,"oi_refreshed":75,
-- --  "oi_requested":75,"history_rows":300,"bucket":"...T07:00:00.000Z"}
--
-- select jobid, schedule, active from cron.job where jobname = 'sync-binance-futures';
