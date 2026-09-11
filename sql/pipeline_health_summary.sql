-- ============================================================
-- pipeline_health_summary() — the public-safe half of pipeline_health()
--
-- Applied 2026-09-11.
--
-- WHY A SECOND FUNCTION RATHER THAN A GRANT.
--
-- The Telegram bot's daily briefing reports whether the pipeline's own
-- inputs arrived today. It runs on GitHub Actions with the publishable
-- key, so it needs something the anon role may execute.
--
-- pipeline_health() is NOT that thing. It returns one row per feed with
-- the feed's name, its expected cadence and its exact age in minutes.
-- That is an outage map: it tells any reader precisely which input is
-- unattended and for how long. Granting it to anon to save writing this
-- function would publish that map to everyone.
--
-- So the detail stays closed and the headline gets its own function.
-- Four numbers, no feed names. The channel can say "all 12 feeds
-- current" or "2 of 12 behind schedule" and nothing more.
--
-- Same least-privilege shape as the apply_zone_state lockdown done
-- earlier today: SECURITY DEFINER so it can read what the caller cannot,
-- REVOKE from public first so the default grant never applies, then an
-- explicit grant to the two roles that need it.
--
-- See promptove/41.
-- ============================================================

create or replace function public.pipeline_health_summary()
returns table (
  feeds_total  int,
  feeds_ok     int,
  feeds_behind int,
  checked_at   timestamptz
)
language sql
security definer
set search_path to 'public'
as $$
  select count(*)::int,
         count(*) filter (where state = 'ok')::int,
         count(*) filter (where state <> 'ok')::int,
         now()
  from public.pipeline_health();
$$;

-- REVOKE FIRST. Postgres grants EXECUTE to PUBLIC on a new function by
-- default, so without this line the explicit grant below would be
-- decoration rather than a boundary.
revoke all on function public.pipeline_health_summary() from public;
grant execute on function public.pipeline_health_summary() to anon, authenticated;

comment on function public.pipeline_health_summary() is
  'Counts only, safe for the public channel. pipeline_health() stays closed to anon because it names which specific feed is behind and by how long.';

-- Verification run 2026-09-11:
--   feeds_total 12, feeds_ok 12, feeds_behind 0
--   anon EXECUTE on pipeline_health()          => false  (unchanged)
--   anon EXECUTE on pipeline_health_summary()  => true
