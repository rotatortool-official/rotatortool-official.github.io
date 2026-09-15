-- Applied 2026-09-15 through the Supabase connector (migration
-- compute_signal_run_fallback_cron). Backlog item 3, promptove/37.
--
-- A SELF-CHECKING retry for the 15-minute scoring run, the same shape as
-- trigger_sync_coin_universe_if_stale() (sync_coin_universe_fallback_cron.sql),
-- and it covers the same failure and misses the same ones:
--
--   1. compute-signal-run returns non-200 (bad deploy, a feed read
--      throwing, a timeout). COVERED: a retry ~5 minutes later.
--   2. pg_cron itself stops. NOT COVERED: this job lives in the same
--      pg_cron.
--   3. The project is paused or down. NOT COVERED by anything inside it.
--   4. trigger_compute_signal_run() is wrong. NOT COVERED: this calls the
--      same function. pg_cron records no error for a missing function.
--
-- WHY IT CHECKS RATHER THAN FIRES. A second unconditional run every 15
-- minutes would double every feed read and every signal_runs row for
-- nothing. Healthy, this costs one indexed max() and calls nothing.
--
-- TIMING. The primary fires at :00/:15/:30/:45 and a run lands within
-- seconds. This checks at :05/:20/:35/:50 with a 20-minute threshold, so a
-- healthy newest run is ~5 minutes old when checked and never trips it,
-- and one missed run is repaired ~5 minutes late instead of 15.
--
-- It is not the external heartbeat (backlog item 2): nothing inside
-- Supabase can report that Supabase is not running.

create or replace function public.trigger_compute_signal_run_if_stale()
returns text language plpgsql security definer set search_path to 'public' as $$
declare
  age interval;
begin
  select now() - max(as_of) into age from signal_runs;

  if age is null or age > interval '20 minutes' then
    perform public.trigger_compute_signal_run();
    raise warning 'newest signal run was % old - fallback compute-signal-run fired', coalesce(age::text, 'MISSING');
    return 'fired: ' || coalesce(age::text, 'missing');
  end if;

  return 'ok: ' || age::text;
end $$;

revoke execute on function public.trigger_compute_signal_run_if_stale() from public;
revoke execute on function public.trigger_compute_signal_run_if_stale() from anon;
revoke execute on function public.trigger_compute_signal_run_if_stale() from authenticated;

select cron.schedule(
  'compute-signal-run-fallback',
  '5,20,35,50 * * * *',
  ' select public.trigger_compute_signal_run_if_stale(); '
);

-- To see whether it has ever had to fire: its return_message in
-- cron.job_run_details reads 'fired: ...' instead of 'ok: ...', and the
-- Postgres log carries the warning.
