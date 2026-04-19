-- ══════════════════════════════════════════════════════════════════
-- tx_verify_lockdown.sql   (Step: server-side TX verification)
--
-- Run this AFTER the verify-tx Edge Function is deployed and you have
-- confirmed it can call grant_pro_via_tx using the service_role key.
-- Running it before the function is live will break new Pro activations
-- via crypto donation until the function is deployed.
--
-- What this does:
--   Revokes anon/authenticated EXECUTE on grant_pro_via_tx. After this,
--   the ONLY path to a 'tx' grant is through the verify-tx Edge Function,
--   which re-runs the on-chain check with a trusted runtime.
--
-- Why:
--   Before this patch, any holder of SUPA_KEY (i.e. any visitor) could
--   POST directly to /rest/v1/rpc/grant_pro_via_tx with a made-up hash,
--   bypassing tx-verify.js entirely. The only guard was the tx_hash
--   uniqueness check, which doesn't stop first-use forgery.
-- ══════════════════════════════════════════════════════════════════

REVOKE EXECUTE ON FUNCTION grant_pro_via_tx(TEXT, TEXT, TEXT, TEXT, TEXT)
  FROM anon, authenticated, public;

-- PostgREST caches the catalog — reload so the revoke takes effect
-- immediately instead of waiting ~1 minute for the next refresh.
NOTIFY pgrst, 'reload schema';

-- ══════════════════════════════════════════════════════════════════
-- Verification:
--
--   -- Anon should no longer be able to execute the RPC:
--   SELECT has_function_privilege(
--     'anon',
--     'grant_pro_via_tx(text,text,text,text,text)',
--     'EXECUTE'
--   );  -- → false
--
--   -- Service role (used inside the Edge Function) still can:
--   SELECT has_function_privilege(
--     'service_role',
--     'grant_pro_via_tx(text,text,text,text,text)',
--     'EXECUTE'
--   );  -- → true
-- ══════════════════════════════════════════════════════════════════
