-- ══════════════════════════════════════════════════════════════════
-- pro_users_lockdown.sql   (Step 0b)
--
-- Closes the "anyone with the anon key can POST
--   /rest/v1/pro_users {rot_uid:'x', is_pro:true}
-- and self-grant Pro" hole by locking the table and routing every
-- legitimate grant through SECURITY DEFINER RPCs:
--
--   • redeem_pro_code()         — Pro-code redemption (extended)
--   • grant_pro_via_referrals() — 5 verified referrals
--   • grant_pro_via_tx()        — after client-side blockchain check
--
-- Run this AFTER pro_codes_table.sql.
-- ══════════════════════════════════════════════════════════════════

-- ── 1. Make sure pro_users has every column we need. ──────────────
-- Existing rows are preserved. New columns default safely.
CREATE TABLE IF NOT EXISTS pro_users (
  rot_uid       TEXT        PRIMARY KEY,
  pro_code      TEXT,
  is_pro        BOOLEAN     NOT NULL DEFAULT false,
  email         TEXT,
  expires_at    TIMESTAMPTZ
);

ALTER TABLE pro_users
  ADD COLUMN IF NOT EXISTS granted_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS grant_method TEXT;      -- 'code' | 'referral' | 'tx'

-- ── 2. Drop any pre-existing open policies (names differ by project). ──
-- The DROP IF EXISTS calls are no-ops if the policy isn't there.
DROP POLICY IF EXISTS "Anyone can insert pro_users"    ON pro_users;
DROP POLICY IF EXISTS "Anyone can read pro_users"      ON pro_users;
DROP POLICY IF EXISTS "Anyone can insert"              ON pro_users;
DROP POLICY IF EXISTS "Anyone can read"                ON pro_users;
DROP POLICY IF EXISTS "Open insert"                    ON pro_users;
DROP POLICY IF EXISTS "Open read"                      ON pro_users;
DROP POLICY IF EXISTS "Enable open RLS and unique rot_uid" ON pro_users;

-- ── 3. Lock the table. ────────────────────────────────────────────
ALTER TABLE pro_users ENABLE ROW LEVEL SECURITY;

-- Kill direct write paths. RPCs (SECURITY DEFINER) are exempt from
-- REVOKE because they run as the function owner.
REVOKE INSERT, UPDATE, DELETE ON pro_users FROM anon, authenticated;

-- Keep SELECT open — the recovery-key flow needs it, and rot_uid itself
-- is the secret. Knowing someone's rot_uid is equivalent to restoring
-- their Pro, which is the intended recovery model.
CREATE POLICY "anon can read pro_users"
  ON pro_users FOR SELECT
  USING (true);

-- ══════════════════════════════════════════════════════════════════
-- redeem_pro_code() — REPLACES the Step 0a version.
-- On success it now also UPSERTS the pro_users row atomically, so
-- the frontend never needs to touch pro_users directly.
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION redeem_pro_code(p_code TEXT, p_uid TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r      pro_codes%ROWTYPE;
  reason TEXT;
BEGIN
  IF p_code IS NULL OR length(btrim(p_code)) = 0
     OR p_uid  IS NULL OR length(btrim(p_uid))  = 0 THEN
    RETURN json_build_object('ok', false, 'reason', 'invalid');
  END IF;

  SELECT * INTO r FROM pro_codes
    WHERE code = upper(btrim(p_code))
    FOR UPDATE;

  IF NOT FOUND        THEN RETURN json_build_object('ok', false, 'reason', 'invalid');  END IF;
  IF NOT r.active     THEN RETURN json_build_object('ok', false, 'reason', 'inactive'); END IF;

  IF r.redeemed_by_uid IS NOT NULL THEN
    IF r.redeemed_by_uid = p_uid THEN
      reason := 'already_yours';
    ELSE
      RETURN json_build_object('ok', false, 'reason', 'used');
    END IF;
  ELSE
    UPDATE pro_codes
       SET redeemed_by_uid = p_uid,
           redeemed_at     = now()
     WHERE code = r.code;
    reason := 'redeemed';
  END IF;

  INSERT INTO pro_users (rot_uid, pro_code, is_pro, grant_method, granted_at)
    VALUES (p_uid, r.code, true, 'code', now())
    ON CONFLICT (rot_uid) DO UPDATE
      SET is_pro       = true,
          pro_code     = EXCLUDED.pro_code,
          grant_method = EXCLUDED.grant_method;

  RETURN json_build_object('ok', true, 'reason', reason);
END;
$$;

GRANT EXECUTE ON FUNCTION redeem_pro_code(TEXT, TEXT) TO anon, authenticated;

-- ══════════════════════════════════════════════════════════════════
-- grant_pro_via_referrals(p_uid)
--   Returns JSON { ok, reason, count, needed }.
--
--   ok=true,  reason='granted'     — ≥ 5 verified referrals, Pro granted
--   ok=false, reason='not_enough'  — under threshold
--   ok=false, reason='invalid'     — bad input
--
-- Server counts referrals with:  credited=true,  created_at older than
-- 1 hour,  deduped by referred_uid.  The 1-hour gate matches the
-- existing client logic (supaCountReferrals).
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION grant_pro_via_referrals(p_uid TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  verified_count INT;
  NEEDED CONSTANT INT := 5;
BEGIN
  IF p_uid IS NULL OR length(btrim(p_uid)) = 0 THEN
    RETURN json_build_object('ok', false, 'reason', 'invalid', 'count', 0, 'needed', NEEDED);
  END IF;

  SELECT COUNT(DISTINCT referred_uid) INTO verified_count
    FROM referrals
   WHERE referrer_uid = p_uid
     AND credited     = true
     AND created_at   < now() - interval '1 hour';

  IF verified_count < NEEDED THEN
    RETURN json_build_object('ok', false, 'reason', 'not_enough',
                             'count', verified_count, 'needed', NEEDED);
  END IF;

  INSERT INTO pro_users (rot_uid, pro_code, is_pro, grant_method, granted_at)
    VALUES (p_uid, 'referral', true, 'referral', now())
    ON CONFLICT (rot_uid) DO UPDATE
      SET is_pro       = true,
          grant_method = EXCLUDED.grant_method;

  RETURN json_build_object('ok', true, 'reason', 'granted',
                           'count', verified_count, 'needed', NEEDED);
END;
$$;

GRANT EXECUTE ON FUNCTION grant_pro_via_referrals(TEXT) TO anon, authenticated;

-- ══════════════════════════════════════════════════════════════════
-- grant_pro_via_tx(p_uid, p_tx_hash, p_network, p_amount, p_contact)
--   Called by the client AFTER tx-verify.js has checked the chain.
--   Atomically:
--     • enforces one-tx_hash-one-Pro (prevents reuse),
--     • records pro_requests row as status='auto_approved' (audit),
--     • upserts pro_users with is_pro=true.
--
-- ⚠ LIMITATION: this RPC still TRUSTS the client's blockchain check.
-- A full fix requires a Supabase Edge Function that re-verifies the
-- tx hash on the server. Until then, this closes the
-- "anon self-POSTs to pro_users" hole and enforces replay-protection,
-- which are the two biggest pieces.
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION grant_pro_via_tx(
  p_uid      TEXT,
  p_tx_hash  TEXT,
  p_network  TEXT,
  p_amount   TEXT,
  p_contact  TEXT DEFAULT NULL
) RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_id BIGINT;
  clean_hash  TEXT;
BEGIN
  IF p_uid     IS NULL OR length(btrim(p_uid))     = 0
     OR p_tx_hash IS NULL OR length(btrim(p_tx_hash)) = 0 THEN
    RETURN json_build_object('ok', false, 'reason', 'invalid');
  END IF;

  clean_hash := btrim(p_tx_hash);

  SELECT id INTO existing_id
    FROM pro_requests
   WHERE tx_hash = clean_hash
   LIMIT 1;

  IF FOUND THEN
    RETURN json_build_object('ok', false, 'reason', 'tx_used');
  END IF;

  INSERT INTO pro_requests (rot_uid, amount, network, tx_hash, contact, status)
    VALUES (p_uid,
            COALESCE(p_amount,  ''),
            COALESCE(p_network, ''),
            clean_hash,
            COALESCE(p_contact, ''),
            'auto_approved');

  INSERT INTO pro_users (rot_uid, pro_code, is_pro, grant_method, granted_at)
    VALUES (p_uid, 'donation-' || COALESCE(p_network, ''), true, 'tx', now())
    ON CONFLICT (rot_uid) DO UPDATE
      SET is_pro       = true,
          pro_code     = EXCLUDED.pro_code,
          grant_method = EXCLUDED.grant_method;

  RETURN json_build_object('ok', true, 'reason', 'granted');
END;
$$;

GRANT EXECUTE ON FUNCTION grant_pro_via_tx(TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;

-- ══════════════════════════════════════════════════════════════════
-- pro_requests — restrict anon INSERT to status='pending' only.
-- The grant_pro_via_tx RPC is SECURITY DEFINER and is unaffected by
-- this policy, so it can still insert 'auto_approved' rows.
--
-- Leaves the manual-review path intact for Binance Pay etc. (client
-- submits 'pending', you approve in the dashboard).
-- ══════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Anyone can submit a request"    ON pro_requests;
DROP POLICY IF EXISTS "pro_requests insert pending only" ON pro_requests;

CREATE POLICY "pro_requests insert pending only"
  ON pro_requests FOR INSERT
  WITH CHECK (status = 'pending');

-- ══════════════════════════════════════════════════════════════════
-- DONE. Verification queries:
--
--   -- Table locked?
--   SELECT has_table_privilege('anon', 'pro_users', 'INSERT'); -- → false
--   SELECT has_table_privilege('anon', 'pro_users', 'SELECT'); -- → true
--
--   -- RPCs callable?
--   SELECT redeem_pro_code('NOT-REAL', 'probe-uid');           -- → invalid
--   SELECT grant_pro_via_referrals('probe-uid');               -- → not_enough
-- ══════════════════════════════════════════════════════════════════
