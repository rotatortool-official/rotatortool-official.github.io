-- pipeline_health() — applied 2026-09-11.
--
-- ONE reading for all twelve feeds, instead of a fallback cron per feed.
--
-- WHY THIS SHAPE. The self-checking fallback built for the coin universe
-- is the right pattern, but twelve copies of it would be twelve places to
-- keep a cadence in sync, and eleven of the feeds cannot repair
-- themselves anyway -- their syncs are daily or three-hourly and re-firing
-- one early buys nothing. What every feed DOES need is for somebody to
-- notice it stopped. That is one function, not twelve crons.
--
-- The failure this is built for is the one that actually happened:
-- market_cache['fear_greed'] had no writer at all and sat frozen for a
-- week. Nothing was broken, nothing errored, and no alert existed,
-- because every check in the project asked "did this call succeed" and
-- none asked "is this data still arriving".
--
-- STATES. late = 3x the expected cadence, dead = 6x. Late enough that one
-- missed run is not noise; early enough to catch within a session.
--
-- `self_heals` marks the feeds a fallback can repair on its own. Today
-- that is only the coin universe (see sync_coin_universe_fallback_cron.sql).
-- The column exists so the answer is visible rather than assumed.
--
-- VERIFIED before shipping, on network_data because it is display-only
-- and no scoring path reads it: backdating 30h reported `late`,
-- backdating 60h reported `dead`, and restoring reported `ok`. A health
-- check that has only ever returned "fine" is not a tested health check.
--
-- WHAT IT STILL DOES NOT COVER, and the reason the next step is outside
-- this database: pg_cron is a single point of failure for all fifteen
-- jobs. If it stops, every feed stops, and a watcher scheduled IN pg_cron
-- stops with it. Nothing inside Supabase can report that Supabase is not
-- running. The telegram bot already runs on GitHub Actions at 08:00,
-- 14:00 and 20:00 UTC -- different infrastructure, different scheduler,
-- and it already has a delivery channel. Calling this function from there
-- is what actually removes the single point of failure.

create or replace function public.pipeline_health()
returns table (
  feed text, expected_min int, age_min int, state text, self_heals boolean
)
language sql stable security definer set search_path to 'public' as $$
  with f(feed, expected_min, age_min, self_heals) as (
    select 'cg_markets_all (scored universe)', 15,
           (extract(epoch from (now()-updated_at))/60)::int, true
      from market_cache where cache_key='cg_markets_all'
    union all select 'fear_greed', 480, (extract(epoch from (now()-updated_at))/60)::int, false
      from market_cache where cache_key='fear_greed'
    union all select 'macro_data', 480, (extract(epoch from (now()-updated_at))/60)::int, false
      from market_cache where cache_key='macro_data'
    union all select 'network_data', 480, (extract(epoch from (now()-updated_at))/60)::int, false
      from market_cache where cache_key='network_data'
    union all select 'binance_spot_metrics', 5, (extract(epoch from (now()-max(updated_at)))/60)::int, false
      from binance_spot_metrics
    union all select 'binance_futures_metrics', 30, (extract(epoch from (now()-max(updated_at)))/60)::int, false
      from binance_futures_metrics
    union all select 'coin_technicals (RSI)', 180, (extract(epoch from (now()-max(updated_at)))/60)::int, false
      from coin_technicals
    union all select 'binance_daily_klines', 180, (extract(epoch from (now()-max(updated_at)))/60)::int, false
      from binance_daily_klines
    union all select 'binance_klines_4h', 120, (extract(epoch from (now()-max(updated_at)))/60)::int, false
      from binance_klines_4h
    union all select 'market_cycle (BTC MA200)', 1440, (extract(epoch from (now()-max(computed_at)))/60)::int, false
      from market_cycle
    union all select 'binance_symbol_tags (monitoring)', 1440, (extract(epoch from (now()-max(checked_at)))/60)::int, false
      from binance_symbol_tags
    union all select 'signal_runs (the scoring cron itself)', 15, (extract(epoch from (now()-max(created_at)))/60)::int, false
      from signal_runs
  )
  select feed, expected_min, age_min,
         case when age_min > expected_min * 6 then 'dead'
              when age_min > expected_min * 3 then 'late'
              else 'ok' end,
         self_heals
  from f order by (age_min::numeric / nullif(expected_min,0)) desc;
$$;

revoke execute on function public.pipeline_health() from public;
revoke execute on function public.pipeline_health() from anon;
