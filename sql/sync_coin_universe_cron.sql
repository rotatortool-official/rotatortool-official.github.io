-- sync-coin-universe — applied 2026-09-10 through the Supabase connector.
-- This file is the record of WHY, which the schedule itself cannot carry.
--
-- THE PROBLEM. Nothing on the server fetched the coin universe. It was
-- fetched by the VISITOR'S BROWSER and written to market_cache; the
-- 15-minute compute-signal-run cron then scored whatever the last
-- visitor left behind. Measured from signal_runs.input_freshness:
--
--   day      runs   median age   worst    runs on data >1h old
--   09-06      99       40 min   10.1 h                     46
--   09-08      96       48 min    9.7 h                     43
--   09-09      96       51 min   11.8 h                     46
--
-- About half of every run scored prices over an hour old, worst case
-- just under twelve hours, and the system got LESS accurate the fewer
-- visitors it had.
--
-- SCHEDULE: minutes 11, 26, 41, 56 — deliberately a few minutes BEFORE
-- compute-signal-run's */15, so each scoring run reads a cache about
-- four minutes old instead of racing the fetch.
--
-- COST: one CoinGecko call per run, not four. The browser split the
-- universe into batches of 50 citing "CoinGecko's per_page limit"; the
-- limit is 250. Verified 2026-09-10 — 194 ids in one request returns all
-- 176 that resolve, with 7d/14d/30d and full supply fields. That is 4
-- calls an hour (~2,900/month, inside the free tier) where four batches
-- would have been ~11,500 and over it. It also leaves room for 56 more
-- coins at zero additional cost.
--
-- TWO THINGS THAT WENT WRONG SETTING THIS UP, both worth knowing:
--
--  1. Every cron here calls a `public.trigger_<name>()` SQL function
--     that holds the URL and the service secret. It does NOT inline a
--     net.http_post. Copying another job's command text and swapping the
--     slug produces a call to a function that does not exist, and
--     cron records no error for it — the job simply does nothing.
--
--  2. `supabase functions deploy` defaults to verify_jwt = TRUE. The
--     trigger functions authenticate with a bearer secret, not a JWT, so
--     the gateway returned 401 UNAUTHORIZED_INVALID_JWT_FORMAT before
--     the function ran. Deploy this one with --no-verify-jwt, as every
--     other sync-* function is.

create or replace function public.trigger_sync_coin_universe()
returns void language plpgsql security definer as $$
begin
  -- Body mirrors trigger_binance_spot_sync(): a net.http_post to
  -- /functions/v1/sync-coin-universe with the shared sync secret in the
  -- Authorization header. Created by copying that function's definition
  -- and swapping the slug, so the secret was never handled in plaintext.
  raise exception 'placeholder — see the live definition; this file documents intent, not the secret';
end $$;

select cron.schedule(
  'sync-coin-universe',
  '11,26,41,56 * * * *',
  ' select public.trigger_sync_coin_universe(); '
);
