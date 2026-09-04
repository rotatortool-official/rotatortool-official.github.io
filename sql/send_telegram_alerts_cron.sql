-- ============================================================
-- pg_cron schedule for send-telegram-alerts
--
-- Run AFTER:
--   1) sql/add_vol_ratio_zone_to_signal_snapshots.sql
--   2) sql/my_holdings_table.sql
--   3) Edge Function send-telegram-alerts deployed
--   4) Secrets set: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID,
--      TELEGRAM_ALERTS_SECRET (see the .ts file's DEPLOY comment)
--
-- Same pattern as sql/sync_rotation_snapshot_cron.sql.
-- ============================================================

delete from vault.secrets
 where name in ('telegram_alerts_url', 'telegram_alerts_token');

select cron.unschedule(jobid)
  from cron.job
 where jobname like 'send-telegram-alerts%';

select vault.create_secret(
  'https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/send-telegram-alerts',  -- ⚠ replace with your real project URL
  'telegram_alerts_url'
);

select vault.create_secret(
  '<YOUR_TELEGRAM_ALERTS_SECRET>',   -- ⚠ same value as the TELEGRAM_ALERTS_SECRET function secret
  'telegram_alerts_token'
);

create or replace function public.trigger_telegram_alerts()
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
    from vault.decrypted_secrets where name = 'telegram_alerts_url';
  select decrypted_secret into v_token
    from vault.decrypted_secrets where name = 'telegram_alerts_token';

  select net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_token
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  ) into v_req;

  return v_req;
end;
$$;

revoke all on function public.trigger_telegram_alerts() from public, anon, authenticated;

-- Once daily, 19:30 UTC — after sync-rotation-snapshot's 19:00 UTC slot
-- (which itself runs after the day's market data sync). Your
-- signal_snapshots row is currently written by the FIRST VISITOR of
-- the day, not on a fixed schedule, so if you get little/no traffic
-- some days this may find "no snapshot for today yet" and send
-- nothing (the function returns that reason rather than erroring —
-- check Edge Function logs). Consider also wiring signal-history.js's
-- takeSnapshot() to run from a small cron-triggered function instead
-- of relying on visitor traffic, mirroring how rotation_snapshots was
-- fixed — that's a separate, larger change from what was asked here.
select cron.schedule(
  'send-telegram-alerts-daily',
  '30 19 * * *',
  $$ select public.trigger_telegram_alerts(); $$
);

-- ── Verify ──────────────────────────────────────────────────────
select jobid, jobname, schedule, active
  from cron.job
 where jobname like 'send-telegram-alerts%';

-- Manual trigger (test without waiting for the cron):
--   select public.trigger_telegram_alerts();
