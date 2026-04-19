-- ============================================================
-- pg_cron automation for the `sync-market-data` Edge Function
-- Run AFTER:
--   1) unified_market_data_table.sql has been applied
--   2) Edge Function sync-market-data has been deployed
--   3) The Edge Function secret SYNC_SECRET has been set in
--      Supabase Dashboard → Edge Functions → Secrets
--
-- Before running: replace the placeholder below with your actual
-- SYNC_SECRET value (the one also stored in the Edge Function secrets).
-- ============================================================

-- ─── Extensions FIRST (cron.* and vault.* don't exist until these run) ───
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ─── Clean up any partial state from a previous run (safe to re-run) ───
delete from vault.secrets
 where name in ('sync_market_data_url', 'sync_market_data_token');

select cron.unschedule(jobid)
  from cron.job
 where jobname like 'sync-market-data%';

-- ─── Store Edge Function URL + shared secret in Vault ───
select vault.create_secret(
  'https://wyvwycatgexpbugzkdfw.supabase.co/functions/v1/sync-market-data',
  'sync_market_data_url'
);

select vault.create_secret(
  '<YOUR_SYNC_SECRET>',                   -- ⚠ replace with the real value
  'sync_market_data_token'
);

-- ─── Trigger helper ───
create or replace function public.trigger_market_sync()
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
    from vault.decrypted_secrets where name = 'sync_market_data_url';
  select decrypted_secret into v_token
    from vault.decrypted_secrets where name = 'sync_market_data_token';

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

revoke all on function public.trigger_market_sync() from public, anon, authenticated;

-- ─── Schedule: twice daily (UTC) ───
-- 06:00 UTC = pre US-open
-- 18:00 UTC = post US-close, pre-Asia
select cron.schedule(
  'sync-market-data-am',
  '0 6 * * *',
  $$ select public.trigger_market_sync(); $$
);

select cron.schedule(
  'sync-market-data-pm',
  '0 18 * * *',
  $$ select public.trigger_market_sync(); $$
);

-- ─── Verify ───
select jobid, jobname, schedule, active
  from cron.job
 where jobname like 'sync-market-data%';

-- ─── Ad-hoc useful queries ───
-- Manual trigger (returns a request id):
--   select public.trigger_market_sync();
--
-- Recent cron run history:
--   select j.jobname, r.status, r.return_message, r.start_time
--     from cron.job_run_details r
--     join cron.job j using (jobid)
--    where j.jobname like 'sync-market-data%'
--    order by r.start_time desc
--    limit 10;
--
-- Row freshness per source:
--   select source_name, count(*), max(last_updated)
--     from unified_market_data
--    group by source_name;
--
-- To rotate SYNC_SECRET later (after updating the Edge Function secret):
--   delete from vault.secrets where name = 'sync_market_data_token';
--   select vault.create_secret('<NEW_SECRET>', 'sync_market_data_token');
