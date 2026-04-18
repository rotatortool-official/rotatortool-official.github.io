-- ══════════════════════════════════════════════════════════════════
-- signal_snapshots_table.sql   (Step 1)
--
-- Moves the "Told You So" Signal Track Record off localStorage and
-- onto Supabase so:
--   • Every visitor sees the SAME authoritative track record
--     (not an empty card until their own browser has 7 days of data)
--   • Snapshots cannot be forged — the server stamps snap_date itself
--   • First-writer-of-the-day wins; subsequent clients no-op
--
-- Run this ONCE in the Supabase SQL editor (choose "Run without RLS"
-- in the confirmation dialog — this script manages RLS itself).
-- ══════════════════════════════════════════════════════════════════

-- ── 1. Table. ─────────────────────────────────────────────────────
-- One row per (date, coin, signal_type). Small: ~20 rows/day.
CREATE TABLE IF NOT EXISTS signal_snapshots (
  id           BIGSERIAL    PRIMARY KEY,
  snap_date    DATE         NOT NULL DEFAULT CURRENT_DATE,
  coin_id      TEXT         NOT NULL,
  coin_sym     TEXT         NOT NULL,
  coin_name    TEXT,
  signal_type  TEXT         NOT NULL CHECK (signal_type IN ('bullish','lagging')),
  signal_label TEXT,                   -- 'STRONG MOM' | 'MOMENTUM' | 'LAGGING' | 'NEUTRAL'
  extras       TEXT[],                 -- ['24H SURGE','7D BREAKOUT', ...]
  score        NUMERIC,
  price        NUMERIC,
  p24          NUMERIC,
  p7           NUMERIC,
  p30          NUMERIC,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (snap_date, coin_id, signal_type)
);

CREATE INDEX IF NOT EXISTS idx_signal_snapshots_date
  ON signal_snapshots (snap_date DESC);

-- ── 2. Lock the table. ────────────────────────────────────────────
ALTER TABLE signal_snapshots ENABLE ROW LEVEL SECURITY;

-- Kill direct writes. The RPC below (SECURITY DEFINER) is exempt.
REVOKE INSERT, UPDATE, DELETE ON signal_snapshots FROM anon, authenticated;

-- Public read — the whole point is that visitors see the track record.
DROP POLICY IF EXISTS "anyone can read signal_snapshots" ON signal_snapshots;
CREATE POLICY "anyone can read signal_snapshots"
  ON signal_snapshots FOR SELECT
  USING (true);

-- ══════════════════════════════════════════════════════════════════
-- record_daily_snapshot(p_rows JSONB) → { ok, reason, count }
--
-- p_rows format (array of up to ~20 objects):
--   [ { coin_id, coin_sym, coin_name, signal_type,
--       signal_label, extras, score, price, p24, p7, p30 }, ... ]
--
-- Returns:
--   ok=true,  reason='recorded'          — rows inserted for today
--   ok=true,  reason='already_recorded'  — today's snapshot exists
--   ok=false, reason='invalid'           — empty / malformed input
--
-- Notes:
--   • snap_date is ALWAYS CURRENT_DATE (server-side) — client cannot
--     backdate snapshots.
--   • ON CONFLICT DO NOTHING — first writer of the day wins, every
--     subsequent call this day is a no-op (idempotent).
--   • Only 'bullish' / 'lagging' rows are accepted; CHECK enforces it.
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION record_daily_snapshot(p_rows JSONB)
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
    SELECT 1 FROM signal_snapshots WHERE snap_date = CURRENT_DATE
  ) INTO already_exists;

  IF already_exists THEN
    RETURN json_build_object('ok', true, 'reason', 'already_recorded', 'count', 0);
  END IF;

  INSERT INTO signal_snapshots
    (snap_date, coin_id, coin_sym, coin_name, signal_type, signal_label,
     extras, score, price, p24, p7, p30)
  SELECT
    CURRENT_DATE,
    r->>'coin_id',
    r->>'coin_sym',
    COALESCE(r->>'coin_name', ''),
    r->>'signal_type',
    COALESCE(r->>'signal_label', ''),
    CASE
      WHEN jsonb_typeof(r->'extras') = 'array'
        THEN ARRAY(SELECT jsonb_array_elements_text(r->'extras'))
      ELSE ARRAY[]::TEXT[]
    END,
    NULLIF(r->>'score','')::NUMERIC,
    NULLIF(r->>'price','')::NUMERIC,
    NULLIF(r->>'p24','')::NUMERIC,
    NULLIF(r->>'p7','')::NUMERIC,
    NULLIF(r->>'p30','')::NUMERIC
  FROM jsonb_array_elements(p_rows) AS r
  WHERE r->>'coin_id'     IS NOT NULL
    AND length(r->>'coin_id') > 0
    AND r->>'signal_type' IN ('bullish','lagging')
  ON CONFLICT (snap_date, coin_id, signal_type) DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;

  RETURN json_build_object('ok', true, 'reason', 'recorded',
                           'count', inserted_count);
END;
$$;

GRANT EXECUTE ON FUNCTION record_daily_snapshot(JSONB) TO anon, authenticated;

-- ══════════════════════════════════════════════════════════════════
-- DONE. Verification queries:
--
--   -- Locked?
--   SELECT has_table_privilege('anon', 'signal_snapshots', 'INSERT'); -- false
--   SELECT has_table_privilege('anon', 'signal_snapshots', 'SELECT'); -- true
--
--   -- Call works?
--   SELECT record_daily_snapshot('[]'::jsonb);                 -- → invalid
--   SELECT record_daily_snapshot(
--     '[{"coin_id":"test","coin_sym":"TST","signal_type":"bullish",
--        "signal_label":"MOMENTUM","price":1.23,"score":70}]'::jsonb);
--
--   -- Inspect today's rows:
--   SELECT snap_date, coin_sym, signal_type, signal_label, score, price
--     FROM signal_snapshots
--    WHERE snap_date = CURRENT_DATE
--    ORDER BY signal_type, score DESC;
--
-- Optional cleanup (run monthly, data is tiny so not urgent):
--   DELETE FROM signal_snapshots WHERE snap_date < CURRENT_DATE - 90;
-- ══════════════════════════════════════════════════════════════════
