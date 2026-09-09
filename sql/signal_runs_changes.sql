-- ═══════════════════════════════════════════════════════════════════
-- signal_runs — run-over-run movement (engine 2.4.0)
--
-- APPLY THIS BEFORE DEPLOYING compute-signal-run 2.4.0.
--
-- Order:
--   1. this migration
--   2. deploy compute-signal-run   (it starts writing the column)
--   3. consumers, whenever they are ready
--
-- Unusually, the site and bot need NO step here: nothing reads this
-- column yet. It is being filled first so that when the homepage brief
-- is built there is real history behind it rather than an empty panel
-- on day one.
--
-- WHY A COLUMN AND NOT `params`. `params` holds the RULES a run used —
-- thresholds, weights, coverage. This holds an OBSERVATION about two
-- runs. It is also the thing that will be queried ("show me every run
-- where a coin crossed into the buy zone"), and a top-level jsonb
-- column can carry an index where a nested params key cannot.
--
-- THE WINDOW IS 24 HOURS, NOT THE PREVIOUS RUN. Measured on
-- 2026-09-09 across 191 coins: adjacent runs (15 min apart) had a
-- largest score move of ZERO, and four hours apart it was 1 point.
-- Market data does not refresh every 15 minutes, so consecutive runs
-- are near-identical by construction. Diffing them would have written
-- an empty block 96 times a day and told visitors nothing changed.
-- compute-signal-run picks the newest run at least CHANGE_WINDOW_HOURS
-- old; vsAsOf always says how far back it actually reached.
--
-- WHAT IS IN IT
--
--   {
--     vsRunId, vsAsOf,          which run this was compared against
--     compared,                 symbols present in both runs
--     entered[], left[],        universe changes
--     rank:  { improved[], declined[], improvedCount, declinedCount },
--     score: { gained[],   lost[],     gainedCount,   lostCount },
--     zoneTransitions[],  zoneTransitionCount,
--     classTransitions[], classTransitionCount,
--     rules                     the thresholds that decided what counted
--   }
--
-- The arrays are truncated to CHANGE_RULES.topN; the *Count fields are
-- the real totals. A consumer that renders the array and quotes the
-- array's length is making a claim the data did not give it.
--
-- NULL means "no comparison available" — the first run after a reset,
-- or a run where the previous-run read failed. It does NOT mean
-- "nothing changed"; that is `compared > 0` with empty lists. A
-- consumer that conflates the two will tell visitors the market was
-- quiet on exactly the runs where it had no idea.
--
-- BACKFILL: none, and it cannot be done honestly. `changes` is computed
-- from the engine's own items at run time. Reconstructing it for past
-- runs would mean diffing two stored runs with today's thresholds and
-- presenting the result as what the run observed, which is the same
-- mistake as backfilling candidate_class.
--
-- NOT a scoring change. Engine 2.4.0's golden fixture is byte-identical
-- to 2.3.0's; no score, rank, zone, eligibility or class moves.
--
-- Applied 2026-09-09.
-- ═══════════════════════════════════════════════════════════════════

alter table signal_runs
  add column if not exists changes jsonb;

comment on column signal_runs.changes is
  'Engine 2.4.0 run-over-run movement vs the previous run. NULL = no comparison available (first run, or the previous-run read failed) — NOT "nothing changed". Arrays are truncated to rules.topN; the *Count fields are the true totals.';

-- The hot read is "the most recent run that actually observed
-- something", for the homepage brief. Partial: runs with no comparison
-- are never the thing being looked up.
create index if not exists signal_runs_changes_idx
  on signal_runs (as_of desc)
  where changes is not null;
