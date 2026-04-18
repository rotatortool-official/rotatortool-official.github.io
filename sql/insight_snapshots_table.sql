-- ══════════════════════════════════════════════════════════════════
-- insight_snapshots_table.sql
--
-- Daily snapshot of the Insight Engine output for every coin.
--
-- Purpose: let free users see YESTERDAY'S insight (24h-delayed) while
-- Pro users see today's live compute. This:
--   • gives free users genuine daily value → habit loop
--   • creates visible conversion pressure (they see what they're missing)
--   • stays cheap: ~200 rows/day, tiny JSONB payloads.
--
-- Run this ONCE in the Supabase SQL editor (choose "Run without RLS"
-- in the confirmation dialog — this script manages RLS itself).
-- ══════════════════════════════════════════════════════════════════

-- ── 1. Table. ─────────────────────────────────────────────────────
-- One row per (date, coin). Typically ~200 rows per day.
CREATE TABLE IF NOT EXISTS insight_snapshots (
  id           BIGSERIAL    PRIMARY KEY,
  snap_date    DATE         NOT NULL DEFAULT CURRENT_DATE,
  coin_id      TEXT         NOT NULL,
  coin_sym     TEXT         NOT NULL,
  insight      JSONB        NOT NULL,          -- { score, label, color, signals[], tooltip }
  price        NUMERIC,                         -- spot at snapshot time (useful for context)
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (snap_date, coin_id)
);

CREATE INDEX IF NOT EXISTS idx_insight_snapshots_date
  ON insight_snapshots (snap_date DESC);

-- ── 2. Lock the table. ────────────────────────────────────────────
ALTER TABLE insight_snapshots ENABLE ROW LEVEL SECURITY;

-- Kill direct writes. The RPC below (SECURITY DEFINER) is exempt.
REVOKE INSERT, UPDATE, DELETE ON insight_snapshots FROM anon, authenticated;

-- Public read — free users need yesterday's row.
DROP POLICY IF EXISTS "anyone can read insight_snapshots" ON insight_snapshots;
CREATE POLICY "anyone can read insight_snapshots"
  ON insight_snapshots FOR SELECT
  USING (true);

-- ══════════════════════════════════════════════════════════════════
-- record_daily_insights(p_rows JSONB) → { ok, reason, count }
--
-- p_rows format (array of ~200 objects):
--   [ { coin_id, coin_sym, insight, price }, ... ]
--   where `insight` is the full insight object:
--   { score, label, color, signals: [...], tooltip }
--
-- Returns:
--   ok=true,  reason='recorded'          — rows inserted for today
--   ok=true,  reason='already_recorded'  — today's snapshot exists
--   ok=false, reason='invalid'           — empty / malformed input
--
-- Notes:
--   • snap_date is ALWAYS CURRENT_DATE — client can't backdate.
--   • ON CONFLICT DO NOTHING — first writer of the day wins.
--   • Only rows with non-null insight JSON are accepted.
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION record_daily_insights(p_rows JSONB)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_count INT;
  already_exists BOOLEAN;
BEGIN
  IF p_rows IS NULL
     OR jsonb_typeof(p_rows) <> 'array'
     OR jsonb_array_length(p_rows) = 0 THEN
    RETURN json_build_object('ok', false, 'reason', 'invalid', 'count', 0);
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM insight_snapshots WHERE snap_date = CURRENT_DATE
  ) INTO already_exists;

  IF already_exists THEN
    RETURN json_build_object('ok', true, 'reason', 'already_recorded', 'count', 0);
  END IF;

  INSERT INTO insight_snapshots
    (snap_date, coin_id, coin_sym, insight, price)
  SELECT
    CURRENT_DATE,
    r->>'coin_id',
    r->>'coin_sym',
    r->'insight',
    NULLIF(r->>'price','')::NUMERIC
  FROM jsonb_array_elements(p_rows) AS r
  WHERE r->>'coin_id'     IS NOT NULL
    AND length(r->>'coin_id') > 0
    AND jsonb_typeof(r->'insight') = 'object'
  ON CONFLICT (snap_date, coin_id) DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;

  RETURN json_build_object('ok', true, 'reason', 'recorded',
                           'count', inserted_count);
END;
$$;

GRANT EXECUTE ON FUNCTION record_daily_insights(JSONB) TO anon, authenticated;

-- ══════════════════════════════════════════════════════════════════
-- Verification queries:
--
--   -- Locked?
--   SELECT has_table_privilege('anon', 'insight_snapshots', 'INSERT'); -- false
--   SELECT has_table_privilege('anon', 'insight_snapshots', 'SELECT'); -- true
--
--   -- Empty input rejected?
--   SELECT record_daily_insights('[]'::jsonb);                 -- → invalid
--
--   -- Inspect yesterday's rows:
--   SELECT snap_date, coin_sym, insight->>'score' AS score,
--          insight->>'label' AS label
--     FROM insight_snapshots
--    WHERE snap_date = CURRENT_DATE - 1
--    ORDER BY (insight->>'score')::numeric DESC NULLS LAST
--    LIMIT 20;
--
-- Optional cleanup (run monthly, data is tiny so not urgent):
--   DELETE FROM insight_snapshots WHERE snap_date < CURRENT_DATE - 30;
-- ══════════════════════════════════════════════════════════════════
