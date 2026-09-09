-- ═══════════════════════════════════════════════════════════════════
-- signal_run_items — why a coin was excluded (engine 2.4.1)
--
-- APPLY BEFORE DEPLOYING compute-signal-run 2.4.1.
--
-- Order:
--   1. this migration
--   2. deploy compute-signal-run   (it starts writing the column)
--   3. consumers, whenever they are ready
--
-- Safe at every step: the column is nullable, nothing reads it yet, and
-- a run written before the deploy simply has NULL there.
--
-- WHY. `eligible` is a boolean, and that turned out to be too little.
-- _eligibility() has always known WHY it refused a coin — it returns a
-- reasons array — but only the verdict was stored, so every consumer had
-- one bit where the engine had six:
--
--   stablecoin · incomplete_history · equity · delisted · illiquid
--   · no_market_cap
--
-- Those do not mean the same thing. Measured on run 375:
--
--   NTRN   excluded `illiquid`   $686 of daily volume     moved 89 places
--   SRM    excluded `illiquid`   $31.8k of daily volume   moved 31 places
--   XMR    excluded `delisted`   $117.9M/day, $9.5B cap   moved 25 places
--
-- All three are eligible=false. NTRN was the single biggest mover in the
-- universe and was leading the daily brief, on six hundred and eighty-six
-- dollars of volume — a rank that moves because almost nothing traded.
-- XMR's move over the same window is real and a reader should see it.
--
-- A consumer filtering on `eligible` has to either keep the noise or drop
-- the signal. With the reason stored it can do neither: engine 2.4.1's
-- CHANGE_RULES.suppress names `illiquid`, `no_market_cap` and
-- `incomplete_history`, and deliberately does NOT name `delisted`.
--
-- NOT a scoring change. No score, rank, zone, eligibility verdict or
-- candidate class moves; the golden fixture is byte-identical to 2.4.0's.
-- This stores a reason the engine already computed and then discarded.
--
-- BACKFILL: none, and it cannot be done honestly. The reasons depend on
-- the volume and market cap the run actually saw, and those are not
-- recoverable for a past run from today's rows. NULL means "this run
-- predates 2.4.1", which is a different statement from "no reasons".
--
-- Applied 2026-09-09.
-- ═══════════════════════════════════════════════════════════════════

alter table signal_run_items
  add column if not exists exclusions text[];

comment on column signal_run_items.exclusions is
  'Engine 2.4.1. WHY _eligibility() refused this coin: stablecoin | incomplete_history | equity | delisted | illiquid | no_market_cap. Empty array = eligible. NULL = run predates 2.4.1. Filter on the reason, never on `eligible` alone — a delisted large cap and an illiquid micro cap share the verdict and mean opposite things.';

-- The hot read is "which coins did this run refuse, and for what" —
-- partial, because an eligible coin has nothing to look up.
create index if not exists signal_run_items_exclusions_idx
  on signal_run_items using gin (exclusions)
  where exclusions is not null and array_length(exclusions, 1) > 0;
