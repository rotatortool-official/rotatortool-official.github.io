-- Applied 2026-09-11 through the Supabase connector. This file is the
-- record of WHY.
--
-- apply_zone_state writes signal_zone_state, which IS the hysteresis
-- memory: the engine reads it back as `previousZones` to decide whether
-- a coin keeps its buy/sell label. It is SECURITY DEFINER and was
-- executable by PUBLIC, anon and authenticated -- i.e. by anyone holding
-- the site's publishable key, which is in every page load.
--
-- The timestamp guard inside the function (`where excluded.as_of >
-- signal_zone_state.as_of`) stops ACCIDENTS: stale writes and
-- out-of-order writes are rejected per row. It does not stop a
-- deliberate one, because a caller can simply supply a future as_of.
--
-- And a wrong zone does not self-correct. Hysteresis reads the stored
-- state, so a pinned label survives until the coin's score moves 4
-- points past the threshold that granted it.
--
-- Nothing legitimate calls it with the anon key:
--   - compute-signal-run uses the service role
--   - site/js/supabase.js has supaApplyZoneState(), which is never
--     invoked; its own comment says the client only reads now
--
-- So this is restricted to match detect_coin_events, which was already
-- correct. Verified after applying: the 06:30 run wrote zone state one
-- second after inserting the run, 246 rows, no failures.

revoke execute on function public.apply_zone_state(jsonb, text, timestamptz) from public;
revoke execute on function public.apply_zone_state(jsonb, text, timestamptz) from anon;
revoke execute on function public.apply_zone_state(jsonb, text, timestamptz) from authenticated;

-- Leaves: postgres=X | service_role=X
