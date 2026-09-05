-- ============================================================
-- rotation_snapshots table + pg_cron schedule for sync-rotation-snapshot
--
-- This table was ALWAYS expected by the frontend (supaLoadRotationHistory
-- in js/supabase.js already reads from it) but never actually existed —
-- confirmed via direct query. The client-side recording path
-- (record_rotation_snapshot RPC) doesn't exist either. Every rotation
-- "call" since the feature shipped was silently lost; nothing was ever
-- durably saved. This fixes that going forward with a reliable
-- server-side daily job, same pattern as signal_snapshots.
--
-- Run AFTER:
--   1) This file's table creation
--   2) Edge Function sync-rotation-snapshot deployed
--   3) Secret set: supabase secrets set ROTATION_SYNC_SECRET=<value>
--      (its OWN secret — do not reuse SYNC_SECRET, same reasoning as
--      every other sync function added today)
-- ============================================================

-- ── Table — column names match exactly what supaLoadRotationHistory()
--    in js/supabase.js already selects, so the existing read path works
--    completely unmodified. ──
create table if not exists rotation_snapshots (
  id          bigint generated always as identity primary key,
  snap_date   date not null,
  from_id     text not null,
  from_sym    text not null,
  from_price  numeric not null,
  from_score  numeric not null,
  to_id       text not null,
  to_sym      text not null,
  to_price    numeric not null,
  to_score    numeric not null,
  source      text not null default 'sync-rotation-snapshot',
  created_at  timestamptz not null default now(),
  unique (snap_date, from_id, to_id)
);

create index if not exists idx_rotation_snapshots_date on rotation_snapshots (snap_date desc);
create index if not exists idx_rotation_snapshots_from_sym on rotation_snapshots (from_sym);
create index if not exists idx_rotation_snapshots_to_sym on rotation_snapshots (to_sym);

alter table rotation_snapshots enable row level security;

drop policy if exists "public read" on rotation_snapshots;
create policy "public read" on rotation_snapshots for select using (true);
-- No insert/update/delete policy for anon/authenticated — only the
-- Edge Function (service role) writes, same pattern as every other
-- sync table added today.

-- ── Cron setup ──────────────────────────────────────────────────
delete from vault.secrets
 where name in ('sync_rotation_url', 'sync_rotation_token');

select cron.unschedule(jobid)
  from cron.job
 where jobname like 'sync-rotation-snapshot%';

select vault.create_secret(
  'https://wyvwycatgexpbugzkdfw.supabase.co/functions/v1/sync-rotation-snapshot',
  'sync_rotation_url'
);

select vault.create_secret(
  '<YOUR_ROTATION_SYNC_SECRET>',           -- ⚠ replace with the real value
  'sync_rotation_token'
);

create or replace function public.trigger_rotation_snapshot_sync()
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
    from vault.decrypted_secrets where name = 'sync_rotation_url';
  select decrypted_secret into v_token
    from vault.decrypted_secrets where name = 'sync_rotation_token';

  select net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_token
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000  -- fast: reads already-cached data, no external API calls
  ) into v_req;

  return v_req;
end;
$$;

revoke all on function public.trigger_rotation_snapshot_sync() from public, anon, authenticated;

-- Once daily. Run AFTER sync-market-data has refreshed cg_markets_all
-- for the day (that function runs at 06:00/18:00 UTC per the original
-- migration plan) — 19:00 UTC gives a safety margin after the 18:00 run.
select cron.schedule(
  'sync-rotation-snapshot-daily',
  '0 19 * * *',
  $$ select public.trigger_rotation_snapshot_sync(); $$
);

-- ── Verify ──────────────────────────────────────────────────────
select jobid, jobname, schedule, active
  from cron.job
 where jobname like 'sync-rotation-snapshot%';

-- ── Ad-hoc useful queries ───────────────────────────────────────
-- Manual trigger:
--   select public.trigger_rotation_snapshot_sync();
--
-- Check results:
--   select * from rotation_snapshots order by snap_date desc, from_score desc limit 20;
--
-- Full history count (should grow by ~5 rows/day going forward):
--   select count(*), count(distinct snap_date) from rotation_snapshots;
