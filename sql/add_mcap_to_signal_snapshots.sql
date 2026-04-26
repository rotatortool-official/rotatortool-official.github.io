-- ══════════════════════════════════════════════════════════════════
-- add_mcap_to_signal_snapshots.sql   (Step 4 follow-up)
--
-- Adds the per-snapshot market cap so the public track-record page
-- can apply the v2 vol-normalized confirmation threshold against the
-- mcap THE COIN HAD at snapshot time, not today's mcap.
--
-- Without this, the public page falls back to live CoinGecko mcap,
-- which is fine in steady state but wrong if a coin's mcap tier
-- changed since the call (e.g. a $400M coin that pumped to $4B —
-- threshold should be 3% from the small-cap snapshot, not 2% from
-- today's mid-cap reading).
--
-- Run this ONCE in the Supabase SQL editor. It's idempotent — safe
-- to re-run.
-- ══════════════════════════════════════════════════════════════════

-- ── 1. Add the column. ────────────────────────────────────────────
ALTER TABLE signal_snapshots
  ADD COLUMN IF NOT EXISTS mcap NUMERIC;

-- ── 2. Replace the RPC so it accepts and stores mcap. ─────────────
-- Same logic as before, just one extra field. ON CONFLICT DO NOTHING
-- still applies; existing rows are not retroactively backfilled.
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
     extras, score, price, mcap, p24, p7, p30)
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
    NULLIF(r->>'mcap','')::NUMERIC,
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

-- ── 3. Tell PostgREST to refresh its schema cache. ────────────────
-- Without this you'll get PGRST204 ("column not found") for ~60s.
NOTIFY pgrst, 'reload schema';

-- ══════════════════════════════════════════════════════════════════
-- Verify:
--   \d signal_snapshots                 -- confirms mcap NUMERIC column
--   SELECT record_daily_snapshot(
--     '[{"coin_id":"_test","coin_sym":"TST","signal_type":"bullish",
--        "signal_label":"MOMENTUM","price":1,"mcap":12345,"score":70}]'::jsonb);
--   SELECT coin_sym, mcap FROM signal_snapshots WHERE coin_id='_test';
--   DELETE FROM signal_snapshots WHERE coin_id='_test';
-- ══════════════════════════════════════════════════════════════════
