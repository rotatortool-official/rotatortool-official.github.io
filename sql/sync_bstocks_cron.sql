-- ============================================================
-- pg_cron automation for the `sync-bstocks` Edge Function
--
-- Run AFTER:
--   1) unified_market_data_table.sql has already been applied
--      (it has — asset_type already allows 'stock' and the comment
--      already lists 'binance' as a valid source_name; no schema
--      change needed for this step)
--   2) Edge Function sync-bstocks has been deployed
--        supabase functions deploy sync-bstocks
--   3) The Edge Function secret SYNC_SECRET has been set
--        supabase secrets set SYNC_SECRET=<value>
--      (reuse the SAME value already stored for sync-market-data,
--      or a different one — either works, this function checks its
--      own SYNC_SECRET env var independently)
--
-- Before running: replace the placeholder below with your actual
-- SYNC_SECRET value (the one also stored in the Edge Function secrets).
-- ============================================================

-- ─── Clean up any partial state from a previous run (safe to re-run) ───
delete from vault.secrets
 where name in ('sync_bstocks_url', 'sync_bstocks_token');

select cron.unschedule(jobid)
  from cron.job
 where jobname like 'sync-bstocks%';

-- ─── Store Edge Function URL + shared secret in Vault ───
select vault.create_secret(
  'https://wyvwycatgexpbugzkdfw.supabase.co/functions/v1/sync-bstocks',
  'sync_bstocks_url'
);

select vault.create_secret(
  '<YOUR_SYNC_SECRET>',                   -- ⚠ replace with the real value
  'sync_bstocks_token'
);

-- ─── Trigger helper ───
create or replace function public.trigger_bstocks_sync()
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
    from vault.decrypted_secrets where name = 'sync_bstocks_url';
  select decrypted_secret into v_token
    from vault.decrypted_secrets where name = 'sync_bstocks_token';

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

revoke all on function public.trigger_bstocks_sync() from public, anon, authenticated;

-- ─── Schedule: once daily ───
-- Daily klines (1d interval) only produce a new candle once a day, so
-- there's no benefit to running this twice like sync-market-data does.
-- 22:00 UTC = after NYSE close (20:00 UTC / 4pm ET), so the day's
-- close is final by the time this runs.
select cron.schedule(
  'sync-bstocks-daily',
  '0 22 * * *',
  $$ select public.trigger_bstocks_sync(); $$
);

-- ─── Verify ───
select jobid, jobname, schedule, active
  from cron.job
 where jobname like 'sync-bstocks%';

-- ─── Ad-hoc useful queries ───
-- Manual trigger (returns a request id):
--   select public.trigger_bstocks_sync();
--
-- Recent cron run history:
--   select j.jobname, r.status, r.return_message, r.start_time
--     from cron.job_run_details r
--     join cron.job j using (jobid)
--    where j.jobname like 'sync-bstocks%'
--    order by r.start_time desc
--    limit 10;
--
-- Check what's actually landed in the table:
--   select symbol, name, price, change_24h, metadata, last_updated
--     from unified_market_data
--    where asset_type = 'stock' and source_name = 'binance'
--    order by symbol;
--
-- To rotate SYNC_SECRET later:
--   delete from vault.secrets where name = 'sync_bstocks_token';
--   select vault.create_secret('<NEW_SECRET>', 'sync_bstocks_token');
