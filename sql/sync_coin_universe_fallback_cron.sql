-- Applied 2026-09-11. A SELF-CHECKING retry for the coin universe.
--
-- WHAT "THE CRON DIES" ACTUALLY MEANS, because a backup only helps for
-- one of these:
--
--   1. The edge function returns non-200 -- bad deploy, CoinGecko down,
--      a rate limit. COVERED. A retry minutes later usually succeeds.
--   2. pg_cron itself stops. NOT COVERED, and cannot be: a backup job
--      living in the same pg_cron stops with it.
--   3. The Supabase project is paused or down. NOT COVERED by anything
--      inside the project.
--   4. The trigger function is wrong -- a mistyped name, a missing
--      function. NOT COVERED, because the backup calls the same one.
--      This is the trap that bit twice on 2026-09-10: pg_cron records NO
--      error for a command calling a function that does not exist, so
--      the job silently does nothing. Verify the function exists.
--
-- WHY IT CHECKS RATHER THAN JUST FIRING. A plain second cron would
-- double the API spend to buy nothing, and the budget is the reason the
-- primary runs every 15 minutes instead of every 5 (four batches an hour
-- is ~2,900 calls a month and inside the free tier; every 5 minutes
-- would be ~8,600 and outside it).
--
-- So this asks the only question that matters -- is the cache actually
-- stale -- and calls the sync only if it is. Healthy, it fires ZERO API
-- calls and costs one cheap local query.
--
-- THRESHOLD: 14 minutes against a primary that runs every 15. A healthy
-- cache is under 5 minutes old whenever this checks, so it never trips.
-- One missed primary is repaired within ~2 minutes instead of 15.
--
-- Verified end to end before scheduling: backdating updated_at by 25
-- minutes (data untouched, so no run could score different numbers) made
-- it return 'fired', and the cache was rewritten with all 232 coins 8
-- seconds later.

create or replace function public.trigger_sync_coin_universe_if_stale()
returns text language plpgsql security definer set search_path to 'public' as $$
declare
  age interval;
begin
  select now() - updated_at into age
  from market_cache where cache_key = 'cg_markets_all';

  if age is null or age > interval '14 minutes' then
    perform public.trigger_sync_coin_universe();
    raise warning 'coin universe cache was % old - fallback sync fired', coalesce(age::text, 'MISSING');
    return 'fired: ' || coalesce(age::text, 'missing');
  end if;

  return 'ok: ' || age::text;
end $$;

revoke execute on function public.trigger_sync_coin_universe_if_stale() from public;
revoke execute on function public.trigger_sync_coin_universe_if_stale() from anon;
revoke execute on function public.trigger_sync_coin_universe_if_stale() from authenticated;

select cron.schedule(
  'sync-coin-universe-fallback',
  '3,8,13,18,23,28,33,38,43,48,53,58 * * * *',
  ' select public.trigger_sync_coin_universe_if_stale(); '
);

-- To see whether it has ever had to fire, look for the warning in the
-- Postgres logs, or for an unexpected cg_markets_all write in
-- net._http_response at a minute that is not 11/26/41/56.
