-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- Creates the pro_codes table + redeem_pro_code() RPC.
--
-- WHY THIS EXISTS:
-- ───────────────
-- Codes used to live in js/config.js as the VALID_CODES array.
-- That array was shipped to every visitor's browser, so anyone with
-- View Source could extract every working code. This migration moves
-- validation server-side: the table is completely locked from the
-- anon role, and the only entry point is the redeem_pro_code() RPC.

CREATE TABLE IF NOT EXISTS pro_codes (
  code             TEXT PRIMARY KEY,
  active           BOOLEAN     NOT NULL DEFAULT true,
  redeemed_by_uid  TEXT,                         -- rot_uid of the device that consumed it
  redeemed_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  note             TEXT                          -- free-form: who you gave it to
);

-- Lock the table from the public roles. The RPC below is the only path in.
ALTER TABLE pro_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON pro_codes FROM anon, authenticated;

-- ══════════════════════════════════════════════════════════════════
-- redeem_pro_code(p_code, p_uid)  →  JSON { ok, reason }
--
--   ok=true,  reason='redeemed'       — first-time successful redeem
--   ok=true,  reason='already_yours'  — same uid re-activating (re-install)
--   ok=false, reason='invalid'        — unknown code or empty input
--   ok=false, reason='inactive'       — revoked by admin
--   ok=false, reason='used'           — already consumed by a different uid
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION redeem_pro_code(p_code TEXT, p_uid TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r pro_codes%ROWTYPE;
BEGIN
  IF p_code IS NULL OR length(btrim(p_code)) = 0
     OR p_uid  IS NULL OR length(btrim(p_uid))  = 0 THEN
    RETURN json_build_object('ok', false, 'reason', 'invalid');
  END IF;

  SELECT * INTO r FROM pro_codes
    WHERE code = upper(btrim(p_code))
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'reason', 'invalid');
  END IF;

  IF NOT r.active THEN
    RETURN json_build_object('ok', false, 'reason', 'inactive');
  END IF;

  IF r.redeemed_by_uid IS NOT NULL THEN
    IF r.redeemed_by_uid = p_uid THEN
      RETURN json_build_object('ok', true, 'reason', 'already_yours');
    END IF;
    RETURN json_build_object('ok', false, 'reason', 'used');
  END IF;

  UPDATE pro_codes
     SET redeemed_by_uid = p_uid,
         redeemed_at     = now()
   WHERE code = r.code;

  RETURN json_build_object('ok', true, 'reason', 'redeemed');
END;
$$;

-- Let anon call the RPC, but still not touch the table directly.
GRANT EXECUTE ON FUNCTION redeem_pro_code(TEXT, TEXT) TO anon, authenticated;

-- ══════════════════════════════════════════════════════════════════
-- Seed the legacy codes from the old client-side VALID_CODES array,
-- so anything handed out before this migration continues to work.
-- ══════════════════════════════════════════════════════════════════
INSERT INTO pro_codes (code, note) VALUES
  ('ROT-2026-ALPHA', 'legacy seed'),
  ('ROT-2026-BETA1', 'legacy seed'),
  ('ROT-2026-BETA2', 'legacy seed'),
  ('ROT-2026-PRO01', 'legacy seed'),
  ('ROT-2026-PRO02', 'legacy seed'),
  ('ROT-2026-PRO03', 'legacy seed'),
  ('ROT-2026-PRO04', 'legacy seed'),
  ('ROT-2026-PRO05', 'legacy seed'),
  ('ROT-2026-DONOR', 'legacy seed'),
  ('ROT-2026-EARLY', 'legacy seed'),
  ('ГЕМИЏИЈА',       'legacy seed')
ON CONFLICT (code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════
-- DAY-TO-DAY OPS
--
-- Add a new code:
--   INSERT INTO pro_codes (code, note)
--     VALUES ('ROT-2026-NEWCODE', 'who it went to');
--
-- Revoke a code (leaves audit trail, stops new redeems):
--   UPDATE pro_codes SET active = false WHERE code = 'ROT-2026-XXX';
--
-- Un-revoke:
--   UPDATE pro_codes SET active = true WHERE code = 'ROT-2026-XXX';
--
-- See who redeemed what:
--   SELECT code, redeemed_by_uid, redeemed_at, note
--     FROM pro_codes
--    WHERE redeemed_by_uid IS NOT NULL
--    ORDER BY redeemed_at DESC;
-- ══════════════════════════════════════════════════════════════════
