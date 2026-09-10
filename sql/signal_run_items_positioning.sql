-- Applied 2026-09-10 through the Supabase connector. This file is the
-- record of WHY, which the migration itself cannot carry.
--
-- Engine 2.7.0 reads the derivatives feed for the first time: funding
-- rate, open interest and its 24h change, long/short ratio and taker
-- buy/sell ratio, all already ingested by sync-binance-futures and,
-- until now, only ever rendered in the coin modal by the visitor's
-- browser. Never part of a run, so never stored beside the score it sat
-- next to, so no past call could be graded against it.
--
-- IT IS WEIGHTED AT ZERO, ON PURPOSE.
--
-- Measured 2026-09-10 against binance_futures_history, the only history
-- that exists (462 symbols, hourly, 2026-09-06 to 2026-09-10). Pooled
-- hourly cross-sectional rank IC of funding vs the next 24h return came
-- out +0.021 with t = 2.98, which looks convincing and is not: sampling
-- a 24h forward return every hour counts each return about 24 times, so
-- those 86 observations are roughly 4 independent ones.
--
-- On non-overlapping daily snapshots:
--
--   day      symbols   IC(funding)   IC(long/short)
--   09-06        273        +0.084             n/a
--   09-07        275        +0.017          -0.003
--   09-08        275        -0.116          -0.050
--   09-09        271        +0.077          -0.066
--
-- The sign flips. Four independent observations, one regime, inside a
-- single week's selloff. No weight is supportable from that, and
-- GUARDRAILS.md rule 1 says a threshold comes from data or not at all.
--
-- binance_futures_history keeps accumulating hourly. At roughly 30
-- independent daily cross-sections the same measurement becomes worth
-- acting on, and THIS COLUMN is what makes it gradeable against the
-- calls actually published in the meantime.

alter table public.signal_run_items
  add column if not exists positioning jsonb;

comment on column public.signal_run_items.positioning is
  'Derivatives reading from engine _positioning(): funding, open interest and its 24h change, long/short and taker buy/sell ratios, plus a label. Contributes ZERO points to any score - run.params.positioning.weighted asserts this per run. NULL = no perp market, not neutral.';
