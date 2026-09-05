-- ============================================================
-- create_signal_run_l2_parts_view.sql
--
-- Step 2 of the L2 refactor: expose Layer 2's named sub-components
-- WITHOUT changing any score.
--
-- WHY A VIEW INSTEAD OF EDITING THE ENGINE:
-- Every L2 term is a pure function of data already stored --
-- signal_run_items.p7 plus the macro constants in
-- signal_runs.params->'macro'. So the decomposition can be derived
-- rather than recomputed. That means:
--   * no engine change, so no score can move
--   * no edge-function redeploy (compute-signal-run ships a ~43KB
--     vendored engine bundle that cannot be re-uploaded safely through
--     a tool that must re-emit its contents)
--   * it applies RETROACTIVELY to every run already recorded, instead
--     of only to runs after a deploy
--
-- FAITHFULNESS: layer2_recomputed reproduces the engine's stored
-- layer2 exactly on 4150 / 4150 comparable rows. Two details matter:
--   1. Missing macro does NOT fall back to zero. engine.js:203-205
--      substitutes invented constants -- gold 2, silver 1.5, oil 1 --
--      and this view must mirror that to stay faithful.
--   2. JS Math.round() is floor(x + 0.5); Postgres round() on numeric
--      disagrees at the .5 boundary. Using floor(x + 0.5) here matters:
--      without it, 559 rows came out off-by-one.
--
-- WHAT IT SHOWS (measured across 4509 rows):
--   sd(part_vs_btc)    = 4.233   = 0.35 x sd(p7)
--   sd(part_vs_gold)   = 3.023   = 0.25 x sd(p7)
--   sd(part_vs_silver) = 1.209   = 0.10 x sd(p7)
--   sd(part_vs_oil)    = 1.209   = 0.10 x sd(p7)
--   sd(part_total3)    = 1.209   = 0.10 x sd(p7)
--   sd(part_dxy)       = 0.000   (a pure constant)
-- Every part's spread is exactly its weight times the spread of the
-- coin's own 7-day return. The comparison asset contributes no
-- variance at all, because (p7 - X) shifts every coin identically when
-- X is market-wide. These are not six signals; they are one signal
-- (p7) split six ways, which is why L2 reduces to 0.90*p7 - K.
-- See promptove/06-scoring-review-2026-09-05.md.
--
-- Useful queries:
--   -- how often the clamp binds (L2 stops responding to p7 entirely)
--   select count(*) filter (where l2_saturated)::float / count(*)
--     from signal_run_l2_parts;
--
--   -- which macro inputs were real vs invented, per run
--   select distinct as_of, gold_is_real, silver_is_real, oil_is_real,
--          dxy_is_real, total3_is_real
--     from signal_run_l2_parts order by as_of desc;
-- ============================================================

create or replace view signal_run_l2_parts as
with m as (
  select r.id as run_id, r.as_of, r.engine_version,
         -- these fallbacks intentionally mirror engine.js:203-207
         coalesce((r.params->'macro'->>'goldP7')::numeric,   2)   as gold_p7,
         coalesce((r.params->'macro'->>'silverP7')::numeric, 1.5) as silver_p7,
         coalesce((r.params->'macro'->>'oilP7')::numeric,    1)   as oil_p7,
         coalesce((r.params->'macro'->>'dxyP7')::numeric,    0)   as dxy_p7,
         coalesce((r.params->'macro'->>'total3P7')::numeric, 0)   as total3_p7,
         -- so a real feed can be told apart from an invented fallback
         (r.params->'macro'->>'goldP7')   is not null as gold_is_real,
         (r.params->'macro'->>'silverP7') is not null as silver_is_real,
         (r.params->'macro'->>'oilP7')    is not null as oil_is_real,
         (r.params->'macro'->>'dxyP7')    is not null as dxy_is_real,
         (r.params->'macro'->>'total3P7') is not null as total3_is_real
    from signal_runs r
),
b as (
  select run_id, coalesce(p7, 0) as btc_p7
    from signal_run_items
   where coin_id = 'bitcoin'
),
parts as (
  select i.run_id, m.as_of, m.engine_version,
         i.coin_id, i.coin_sym, coalesce(i.p7, 0) as p7, i.score, i.zone,
         (i.breakdown->>'layer1')::numeric as layer1,
         (i.breakdown->>'layer2')::numeric as layer2_stored,
         (coalesce(i.p7,0) - b.btc_p7)    * 0.35 as part_vs_btc,
         (coalesce(i.p7,0) - m.gold_p7)   * 0.25 as part_vs_gold,
         (coalesce(i.p7,0) - m.silver_p7) * 0.10 as part_vs_silver,
         (coalesce(i.p7,0) - m.oil_p7)    * 0.10 as part_vs_oil,
         (-m.dxy_p7)                      * 0.10 as part_dxy,
         (coalesce(i.p7,0) - m.total3_p7) * 0.10 as part_total3,
         m.gold_is_real, m.silver_is_real, m.oil_is_real,
         m.dxy_is_real, m.total3_is_real
    from signal_run_items i
    join m on m.run_id = i.run_id
    join b on b.run_id = i.run_id
)
select p.*,
       (part_vs_btc + part_vs_gold + part_vs_silver
        + part_vs_oil + part_dxy + part_total3) as l2_delta,
       least(greatest(floor(15 + least(greatest(
         (part_vs_btc + part_vs_gold + part_vs_silver
          + part_vs_oil + part_dxy + part_total3) * 0.9, -15), 15) + 0.5), 0), 30)
         as layer2_recomputed,
       abs((part_vs_btc + part_vs_gold + part_vs_silver
            + part_vs_oil + part_dxy + part_total3) * 0.9) >= 15 as l2_saturated
  from parts p;

comment on view signal_run_l2_parts is
  'Decomposes scoring Layer 2 into its named component terms, reconstructed from signal_run_items.p7 + signal_runs.params->macro. Read-only and derived: it changes no score and requires no redeploy. layer2_recomputed reproduces the engine exactly (verified 4150/4150 rows). NOTE all six parts are (coin p7 - a market-wide constant), so L2 cannot rank coins on macro - see promptove/06-scoring-review-2026-09-05.md.';
