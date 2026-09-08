-- ═══════════════════════════════════════════════════════════════════
-- signal_run_items — candidate classification columns (engine 2.2.0)
--
-- APPLY THIS BEFORE DEPLOYING ANY CODE THAT READS THE COLUMNS.
-- compute-signal-run INSERTs them, and send-telegram-alerts, the
-- Telegram bot and the website all name them in a PostgREST `select`.
-- Against a table that does not have them yet, that select returns 400:
-- the website degrades quietly to its local pass (it catches), but the
-- bot and the alerts function fail their cron outright.
--
-- Order:
--   1. this migration
--   2. push site + bot to git
--   3. deploy send-telegram-alerts
--   4. deploy compute-signal-run  LAST
--
-- Steps 2 and 3 are safe the moment the columns exist: every row is
-- still NULL, and every consumer fails OPEN on a null class, so they
-- behave exactly as they did before. compute-signal-run is what starts
-- writing real labels, so it is the single moment the buy list changes
-- — which is also promptove/26's rule that the server moves last,
-- because the server run is what visitors actually see.
--
-- Applied 2026-09-07.
--
-- WHY. Until now the only thing a consumer could ask about a coin was
-- "what did it score" and "is it tradable". Neither answers "may this be
-- presented as a NEW entry", and the gap was visible: on the frozen
-- fixture day the published buy list contained ICX, up 46.8% in 24
-- hours, ranked as a normal buy because every other component scored
-- well.
--
-- Engine 2.2.0 answers it as `candidateClass`, computed in the engine
-- alongside score and eligibility and never by a consumer. These columns
-- are where that answer is stored so the website, the Telegram bot and
-- the alerts function all read the SAME label rather than each deciding
-- what "too pumped" means.
--
-- NOT a scoring change. `score`, `zone`, `effective_score`, `r7/r14/r30`
-- and `eligible` are untouched by this and by 2.2.0 — verified
-- byte-for-byte against the golden fixture, and by an acceptance test
-- that runs the engine with and without RSI and requires every one of
-- those fields to be identical.
--
-- BACKFILL: none. Rows written before 2026-09-07 have no classification
-- and must read as "not classified", which is what NULL says. Filling
-- them in would be inventing a label from data the run never saw — and
-- `rsi` in particular is a point-in-time reading that cannot be
-- reconstructed for a past run from the current coin_technicals row.
-- ═══════════════════════════════════════════════════════════════════

alter table signal_run_items
  -- CANDIDATE | STRONG | EXTENDED | COOLDOWN | FALLING_KNIFE
  -- | NOT_OVERSOLD | UNCONFIRMED, or NULL when the coin is not eligible
  -- (eligibility has already answered) or the run predates 2.2.0.
  add column if not exists candidate_class text,

  -- The real Wilder RSI(14) the classification was confirmed against,
  -- from coin_technicals.rsi14_daily. NULL when RSI was unavailable for
  -- this coin, or when the run-level coverage floor (CANDIDATE_RULES.rsi
  -- .minCoverage, 0.35 — a dead-feed check, not a quality bar) was not
  -- met and the engine dropped confirmation for everyone.
  add column if not exists rsi numeric,

  -- oversold | low | neutral | elevated | overbought — the engine's own
  -- labelling of that number, so no consumer re-derives the bands.
  add column if not exists rsi_state text,

  -- The numbers the class was reached from: p24, the 30-day implied
  -- weekly pace, this week vs last week, and the accelerating /
  -- stabilizing booleans. Stored so a published call can explain itself
  -- later without being re-run.
  add column if not exists candidate jsonb;

-- Deliberately NOT a check constraint on candidate_class. The set of
-- classes is owned by the engine's CANDIDATE_RULES and is expected to
-- grow; a constraint here would mean a schema migration is required
-- before an engine that adds a class can write a single row, and the
-- failure mode is a silent cron error rather than a visible one.

-- The buy list is the hot read: "eligible coins in the buy zone that are
-- actually presentable". Partial, because rows that are not candidates
-- are never the thing being looked up.
create index if not exists signal_run_items_candidate_idx
  on signal_run_items (run_id, candidate_class)
  where candidate_class is not null;

comment on column signal_run_items.candidate_class is
  'Engine 2.2.0 candidate classification. Read this; never re-derive it. NULL = ineligible or pre-2.2.0 run.';
