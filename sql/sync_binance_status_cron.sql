-- ============================================================
-- binance_delisted_symbols table + pg_cron schedule for
-- sync-binance-status
--
-- Protects against a real reported harm: the site was suggesting
-- rotation/buy targets for tokens no longer actively trading on
-- Binance (delisted, suspended, halted). Any coin whose base_asset
-- appears in this table should be excluded from buy-zone / rotation-
-- target eligibility everywhere — both the live dashboard's scoring
-- and the sync-rotation-snapshot Edge Function's published calls.
--
-- Run AFTER:
--   1) This file's table creation
--   2) Edge Function sync-binance-status deployed
--   3) Secret set: supabase secrets set BINANCE_STATUS_SYNC_SECRET=<value>
-- ============================================================

create table if not exists binance_delisted_symbols (
  base_asset      text primary key,   -- e.g. 'FIL' — matches coin sym uppercased
  binance_symbol  text not null,      -- e.g. 'FILUSDT' — the actual pair checked
  status          text not null,      -- Binance's real status: BREAK, HALT, END_OF_DAY, etc. (never 'TRADING' — those aren't stored)
  checked_at      timestamptz not null default now()
);

alter table binance_delisted_symbols enable row level security;

drop policy if exists "public read" on binance_delisted_symbols;
create policy "public read" on binance_delisted_symbols for select using (true);
-- No write policy for anon/authenticated — only the Edge Function
-- (service role) writes, same pattern as every other sync table.

-- ── Cron setup ──────────────────────────────────────────────────
delete from vault.secrets
 where name in ('sync_binance_status_url', 'sync_binance_status_token');

select cron.unschedule(jobid)
  from cron.job
 where jobname like 'sync-binance-status%';

select vault.create_secret(
  'https://wyvwycatgexpbugzkdfw.supabase.co/functions/v1/sync-binance-status',
  'sync_binance_status_url'
);

select vault.create_secret(
  '<YOUR_BINANCE_STATUS_SYNC_SECRET>',     -- ⚠ replace with the real value
  'sync_binance_status_token'
);

create or replace function public.trigger_binance_status_sync()
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
    from vault.decrypted_secrets where name = 'sync_binance_status_url';
  select decrypted_secret into v_token
    from vault.decrypted_secrets where name = 'sync_binance_status_token';

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

revoke all on function public.trigger_binance_status_sync() from public, anon, authenticated;

-- Once daily, early — before sync-rotation-snapshot (19:00 UTC) so that
-- function can read a fresh delist list the same day.
select cron.schedule(
  'sync-binance-status-daily',
  '0 17 * * *',
  $$ select public.trigger_binance_status_sync(); $$
);

-- ── Verify ──────────────────────────────────────────────────────
select jobid, jobname, schedule, active
  from cron.job
 where jobname like 'sync-binance-status%';

-- ── Ad-hoc useful queries ───────────────────────────────────────
-- Manual trigger:
--   select public.trigger_binance_status_sync();
--
-- Check what's currently flagged:
--   select * from binance_delisted_symbols order by base_asset;
