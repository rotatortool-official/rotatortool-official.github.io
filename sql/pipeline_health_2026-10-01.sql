-- pipeline_health() — 2026-10-01: two feeds added for HANDOVER.md Tasks 1 and 2.
--
-- This file is the CURRENT definition. It is the live one from
-- measurement_hardening_2026-09-23.sql (late_min/dead_min per feed, and
-- the 'dead' state for a feed with no reading at all) plus:
--
--   coin_universe (weekly list)
--     market_cache 'coin_universe', written Mondays 02:37 UTC by the
--     select-coin-universe GitHub workflow. Late after 8 days, because
--     GitHub may start a scheduled run hours late; dead after 14 days,
--     i.e. two missed weeks. A failed run writes nothing by design (the
--     last good list stays in use), so this age is the only signal.
--
--   market_events (daily job)
--     The newest market_daily row with source='live'. The 00:55 UTC job
--     (run_market_events_daily) is one transaction: the reading, the
--     rules and the grades commit together or not at all, so a fresh
--     row means the whole job succeeded. Same late/dead lines as the
--     coin-event detector.
--
-- The Telegram bot's heartbeat (pipeline_health_summary) reads this, so
-- both now reach the admin chat when they stop.

create or replace function public.pipeline_health()
returns table (feed text, expected_min integer, age_min integer, state text, self_heals boolean)
language sql stable security definer set search_path to 'public' as $function$
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
    -- 2026-10-01, HANDOVER.md Task 1
    union all select 'coin_universe (weekly list)', 10080, (extract(epoch from (now()-updated_at))/60)::int, false, 11520, 20160
      from market_cache where cache_key='coin_universe'
    -- 2026-10-01, HANDOVER.md Task 2
    union all select 'market_events (daily job)', 1440, (extract(epoch from (now()-max(computed_at)))/60)::int, false, 1560, 3000
      from market_daily where source = 'live'
  )
  select feed, expected_min, age_min,
         case when age_min is null then 'dead'
              when age_min > coalesce(dead_min, expected_min * 6) then 'dead'
              when age_min > coalesce(late_min, expected_min * 3) then 'late'
              else 'ok' end,
         self_heals
  from f order by (coalesce(age_min, 999999)::numeric / nullif(expected_min,0)) desc;
$function$;

revoke execute on function public.pipeline_health() from public;
revoke execute on function public.pipeline_health() from anon;
