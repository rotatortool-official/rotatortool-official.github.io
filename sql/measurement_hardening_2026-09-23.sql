-- measurement_hardening_2026-09-23.sql — applied 2026-09-23.
--
-- The 30-day verdict on the rotation rule (live vs inverted, due
-- 2026-10-18) and the gold shadow (7d grades from 2026-09-30) are only
-- as good as the daily rows behind them. 09-20 and 09-22 were lost
-- silently (promptove/54). Three changes so the next loss cannot be
-- silent and the known causes cannot recur.
--
-- 1. SOURCE JOINS THE UPSERT KEY.
--    The key was (snap_date, from_id, to_id). Two sources recording the
--    same pair on the same day was impossible, so sync-rotation-snapshot
--    v15 had to SKIP any gold pair the live snapshot had already written
--    (PAXG sits low enough to land in the live buys). That skip silently
--    removed rows from the gold shadow's grade. With source in the key,
--    each source owns its own row and nothing is skipped. v16 of the
--    function upserts on the new key; v15 would fail against it, so the
--    two ship together, well clear of the 19:07 run.
--    Only sync-rotation-snapshot writes this table (checked: no RPC or
--    client inserts it), so no other ON CONFLICT target depends on the
--    old key.
--
-- 2. THE SNAPSHOT MOVES OFF THE QUARTER HOUR: 19:00 -> 19:07.
--    At 19:00:00 it raced compute-signal-run and read a run header whose
--    items were not written yet. v14 worked around that by reading the
--    newest run WITH items; this removes the race itself. :07 still reads
--    the 19:00 run, which finishes in seconds. send-telegram-alerts at
--    19:30 is still after it.
--
-- 3. pipeline_health() WATCHES THE OUTPUTS, NOT ONLY THE INPUTS.
--    It watched twelve ingest feeds and nothing that the measurement
--    itself depends on, which is why two missing snapshot days went
--    unnoticed. Five rows added. Output columns are UNCHANGED, so
--    pipeline_health_summary() and every caller keep working.
--
--    Daily outputs get their own late/dead limits. The 3x/6x rule would
--    call a daily feed late only after THREE days, i.e. one skipped day
--    would never show. Existing rows keep 3x/6x exactly as before.
--
--      rotation_snapshots          daily 19:07   late > 26h   dead > 50h
--      coin_events (detector)      daily 00:45   late > 26h   dead > 50h
--          measured by the job's last SUCCEEDED run, not by the newest
--          event: a day with no crosses writes no rows and is healthy.
--          detect_coin_events() is SQL, so pg_cron does record its
--          failures (unlike the http-triggered jobs).
--      insight_snapshots           daily, WRITTEN BY THE FIRST VISITOR'S
--      momentum_snapshots          BROWSER (04:00-17:30 UTC observed)
--                                  late > 36h   dead > 60h
--          these have no server-side writer; a day without visitors is
--          a day without history. The row makes that visible.
--      token_unlocks               every 30 min, 3x/6x as usual

-- ── 1. key ──────────────────────────────────────────────────────────
alter table public.rotation_snapshots
  add constraint rotation_snapshots_date_pair_source_key
  unique (snap_date, from_id, to_id, source);
alter table public.rotation_snapshots
  drop constraint rotation_snapshots_snap_date_from_id_to_id_key;

-- ── 2. schedule ─────────────────────────────────────────────────────
select cron.alter_job(
  (select jobid from cron.job where jobname = 'sync-rotation-snapshot-daily'),
  schedule := '7 19 * * *');

-- ── 3. health ───────────────────────────────────────────────────────
create or replace function public.pipeline_health()
returns table (
  feed text, expected_min int, age_min int, state text, self_heals boolean
)
language sql stable security definer set search_path to 'public' as $$
  with f(feed, expected_min, age_min, self_heals, late_min, dead_min) as (
    select 'cg_markets_all (scored universe)', 15,
           (extract(epoch from (now()-updated_at))/60)::int, true, null::int, null::int
      from market_cache where cache_key='cg_markets_all'
    union all select 'fear_greed', 480, (extract(epoch from (now()-updated_at))/60)::int, false, null, null
      from market_cache where cache_key='fear_greed'
    union all select 'macro_data', 480, (extract(epoch from (now()-updated_at))/60)::int, false, null, null
      from market_cache where cache_key='macro_data'
    union all select 'network_data', 480, (extract(epoch from (now()-updated_at))/60)::int, false, null, null
      from market_cache where cache_key='network_data'
    union all select 'binance_spot_metrics', 5, (extract(epoch from (now()-max(updated_at)))/60)::int, false, null, null
      from binance_spot_metrics
    union all select 'binance_futures_metrics', 30, (extract(epoch from (now()-max(updated_at)))/60)::int, false, null, null
      from binance_futures_metrics
    union all select 'coin_technicals (RSI)', 180, (extract(epoch from (now()-max(updated_at)))/60)::int, false, null, null
      from coin_technicals
    union all select 'binance_daily_klines', 180, (extract(epoch from (now()-max(updated_at)))/60)::int, false, null, null
      from binance_daily_klines
    union all select 'binance_klines_4h', 120, (extract(epoch from (now()-max(updated_at)))/60)::int, false, null, null
      from binance_klines_4h
    union all select 'market_cycle (BTC MA200)', 1440, (extract(epoch from (now()-max(computed_at)))/60)::int, false, null, null
      from market_cycle
    union all select 'binance_symbol_tags (monitoring)', 1440, (extract(epoch from (now()-max(checked_at)))/60)::int, false, null, null
      from binance_symbol_tags
    union all select 'signal_runs (the scoring cron itself)', 15, (extract(epoch from (now()-max(created_at)))/60)::int, false, null, null
      from signal_runs
    -- added 2026-09-23: the outputs the measurement depends on
    union all select 'rotation_snapshots (live + shadows)', 1440, (extract(epoch from (now()-max(created_at)))/60)::int, false, 1560, 3000
      from rotation_snapshots
    union all select 'coin_events (detector last success)', 1440, (extract(epoch from (now()-max(d.end_time)))/60)::int, false, 1560, 3000
      from cron.job_run_details d join cron.job j on j.jobid = d.jobid
      where j.jobname = 'detect-coin-events-daily' and d.status = 'succeeded'
    union all select 'insight_snapshots (browser-written)', 1440, (extract(epoch from (now()-max(created_at)))/60)::int, false, 2160, 3600
      from insight_snapshots
    union all select 'momentum_snapshots (browser-written)', 1440, (extract(epoch from (now()-max(created_at)))/60)::int, false, 2160, 3600
      from momentum_snapshots
    union all select 'token_unlocks', 30, (extract(epoch from (now()-max(updated_at)))/60)::int, false, null, null
      from token_unlocks
  )
  select feed, expected_min, age_min,
         case when age_min is null then 'dead'   -- no row at all is not "ok"
              when age_min > coalesce(dead_min, expected_min * 6) then 'dead'
              when age_min > coalesce(late_min, expected_min * 3) then 'late'
              else 'ok' end,
         self_heals
  from f order by (coalesce(age_min, 999999)::numeric / nullif(expected_min,0)) desc;
$$;

revoke execute on function public.pipeline_health() from public;
revoke execute on function public.pipeline_health() from anon;
