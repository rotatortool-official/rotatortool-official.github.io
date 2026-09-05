-- ============================================================
-- pg_cron automation for the `compute-signal-run` Edge Function
--
-- Run AFTER:
--   1) rotator-engine/sql/signal_runs.sql has been applied
--   2) node rotator-engine/sync-to-edge-function.js has been run
--      (refreshes supabase/functions/_shared/rotator-engine/)
--   3) Edge Function compute-signal-run has been deployed
--        supabase functions deploy compute-signal-run
--   4) The Edge Function secret SIGNAL_RUN_SYNC_SECRET has been set
--        supabase secrets set SIGNAL_RUN_SYNC_SECRET=<own secret — do
--        NOT reuse the project-wide SYNC_SECRET, same convention every
--        other *_SYNC_SECRET in this project follows>
--
-- Before running: replace the placeholder below with your actual
-- SIGNAL_RUN_SYNC_SECRET value (the one also stored in the Edge
-- Function secrets).
-- ============================================================

-- ─── Clean up any partial state from a previous run (safe to re-run) ───
delete from vault.secrets
 where name in ('compute_signal_run_url', 'compute_signal_run_token');

select cron.unschedule(jobid)
  from cron.job
 where jobname like 'compute-signal-run%';

-- ─── Store Edge Function URL + shared secret in Vault ───
select vault.create_secret(
  'https://wyvwycatgexpbugzkdfw.supabase.co/functions/v1/compute-signal-run',
  'compute_signal_run_url'
);

select vault.create_secret(
  '<YOUR_SIGNAL_RUN_SYNC_SECRET>',        -- ⚠ replace with the real value
  'compute_signal_run_token'
);

-- ─── Trigger helper ───
create or replace function public.trigger_compute_signal_run()
returns bigint
language plpgsql
security definer
as $$
declare
  v_url   text;
  v_token text;
  v_req   bigint;
begin
  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'compute_signal_run_url';
  select decrypted_secret into v_token
    from vault.decrypted_secrets where name = 'compute_signal_run_token';

  select net.http_post(
    url     := v_url,
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

revoke all on function public.trigger_compute_signal_run() from public, anon, authenticated;

-- ─── Schedule: every 15 minutes ───
-- market_cache['cg_markets_all'] has a 5-minute client-side TTL (see
-- js/data-loaders.js) but is only refreshed when a visitor's page hits
-- it — this cron does not force a refresh, it just reads whatever is
-- cached (same model sync-rotation-snapshot already runs on live).
-- 15 minutes keeps the bot (Step C, 3x/day) and the site comfortably
-- supplied without spamming signal_runs; tune freely, nothing else
-- depends on this exact number.
select cron.schedule(
  'compute-signal-run-15min',
  '*/15 * * * *',
  $$ select public.trigger_compute_signal_run(); $$
);

-- ─── Verify ───
select jobid, jobname, schedule, active
  from cron.job
 where jobname like 'compute-signal-run%';

-- ─── Ad-hoc useful queries ───
-- Manual trigger (returns a request id):
--   select public.trigger_compute_signal_run();
--
-- Recent cron run history:
--   select j.jobname, r.status, r.return_message, r.start_time
--     from cron.job_run_details r
--     join cron.job j using (jobid)
--    where j.jobname like 'compute-signal-run%'
--    order by r.start_time desc
--    limit 10;
--
-- Latest run, bot-derivable shape:
--   select r.as_of, r.engine_version, r.cycle_label, i.coin_sym, i.score, i.zone
--     from signal_runs r
--     join signal_run_items i on i.run_id = r.id
--    where r.id = (select id from signal_runs order by as_of desc limit 1)
--    order by i.score desc;
--
-- To rotate SIGNAL_RUN_SYNC_SECRET later:
--   delete from vault.secrets where name = 'compute_signal_run_token';
--   select vault.create_secret('<NEW_SECRET>', 'compute_signal_run_token');
-- ============================================================
