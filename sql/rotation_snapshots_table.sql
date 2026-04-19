-- ══════════════════════════════════════════════════════════════════
-- rotation_snapshots_table.sql
--
-- Daily record of rotation pairs (A → B) suggested by the dashboard /
-- bot, used to score rotations on RELATIVE performance:
--   correct ⇔ to-coin outperforms from-coin by ROTATION_THRESHOLD %.
--
-- This complements signal_snapshots (which scores individual coins)
-- and lets us classify outcomes the user cares about:
--   · BIG WIN       — B up, A down
--   · WIN           — B outperformed A (both up)
--   · AVOIDED LOSS  — both down, B dropped less
--   · MISS          — A up, B down
--
-- Same security pattern as signal_snapshots: writes through SECURITY
-- DEFINER RPC only; reads are public.
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS rotation_snapshots (
  id          BIGSERIAL    PRIMARY KEY,
  snap_date   DATE         NOT NULL DEFAULT CURRENT_DATE,
  from_id     TEXT         NOT NULL,
  from_sym    TEXT         NOT NULL,
  from_price  NUMERIC,
  from_score  NUMERIC,
  to_id       TEXT         NOT NULL,
  to_sym      TEXT         NOT NULL,
  to_price    NUMERIC,
  to_score    NUMERIC,
  source      TEXT         DEFAULT 'dashboard',  -- 'dashboard' | 'bot' | 'auto'
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (snap_date, from_id, to_id)
);

CREATE INDEX IF NOT EXISTS idx_rotation_snapshots_date
  ON rotation_snapshots (snap_date DESC);

ALTER TABLE rotation_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON rotation_snapshots FROM anon, authenticated;

DROP POLICY IF EXISTS "anyone can read rotation_snapshots" ON rotation_snapshots;
CREATE POLICY "anyone can read rotation_snapshots"
  ON rotation_snapshots FOR SELECT
  USING (true);

-- ══════════════════════════════════════════════════════════════════
-- record_rotation_snapshot(p_rows JSONB) → { ok, reason, count }
--
-- p_rows = [
--   { from_id, from_sym, from_price, from_score,
--     to_id,   to_sym,   to_price,   to_score, source? }, ...
-- ]
--
-- Server stamps snap_date itself. ON CONFLICT DO NOTHING means the
-- first writer of the day wins; multiple clients submitting the same
-- pair are no-ops. Idempotent and safe.
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION record_rotation_snapshot(p_rows JSONB)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_count INT;
BEGIN
  IF p_rows IS NULL
     OR jsonb_typeof(p_rows) <> 'array'
     OR jsonb_array_length(p_rows) = 0 THEN
    RETURN json_build_object('ok', false, 'reason', 'invalid', 'count', 0);
  END IF;

  INSERT INTO rotation_snapshots
    (snap_date, from_id, from_sym, from_price, from_score,
     to_id, to_sym, to_price, to_score, source)
  SELECT
    CURRENT_DATE,
    r->>'from_id',
    r->>'from_sym',
    NULLIF(r->>'from_price','')::NUMERIC,
    NULLIF(r->>'from_score','')::NUMERIC,
    r->>'to_id',
    r->>'to_sym',
    NULLIF(r->>'to_price','')::NUMERIC,
    NULLIF(r->>'to_score','')::NUMERIC,
    COALESCE(r->>'source', 'dashboard')
  FROM jsonb_array_elements(p_rows) AS r
  WHERE r->>'from_id' IS NOT NULL
    AND r->>'to_id'   IS NOT NULL
    AND length(r->>'from_id') > 0
    AND length(r->>'to_id')   > 0
    AND r->>'from_id' <> r->>'to_id'
  ON CONFLICT (snap_date, from_id, to_id) DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN json_build_object('ok', true, 'reason', 'recorded',
                           'count', inserted_count);
END;
$$;

GRANT EXECUTE ON FUNCTION record_rotation_snapshot(JSONB) TO anon, authenticated;

-- After deploying:
--   NOTIFY pgrst, 'reload schema';
--
-- Verify:
--   SELECT has_table_privilege('anon', 'rotation_snapshots', 'INSERT'); -- false
--   SELECT has_table_privilege('anon', 'rotation_snapshots', 'SELECT'); -- true
--   SELECT record_rotation_snapshot('[]'::jsonb);                       -- → invalid
--   SELECT * FROM rotation_snapshots ORDER BY snap_date DESC LIMIT 10;
