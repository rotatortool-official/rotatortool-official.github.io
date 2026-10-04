/* ══════════════════════════════════════════════════════════════════
   tx-verify.js  —  Thin client wrapper for the verify-tx Edge Function.

   HOW IT WORKS NOW:
   ─────────────────
   Chain verification + Pro activation both happen server-side. The
   Edge Function runs the Tron / BSC / ETH lookup itself, then calls
   grant_pro_via_tx via the service_role key. Direct anon EXECUTE on
   grant_pro_via_tx is revoked (sql/tx_verify_lockdown.sql), so the
   browser can no longer self-report "verified" by hitting the RPC.

   Request:  POST {SUPA_URL}/functions/v1/verify-tx
             body: { uid, tx_hash, network, contact }
   Response: { ok:true,  reason:'granted', amount, token, network }
             { ok:false, reason:'<human message>' | 'tx_used' }

   SUPPORTED NETWORKS:
   ─────────────────
   • TRC20 (Tron)  — via Tronscan API (server-side)
   • BEP20 (BSC)   — via public RPC   (server-side)
   • ERC20 (ETH)   — via public RPC   (server-side)
   • Binance Pay   — manual review (off-chain, handled by submitProRequest)
══════════════════════════════════════════════════════════════════ */

function verifyAndActivateTx(txHash, network, uid, contact) {
  txHash  = (txHash  || '').trim();
  network = (network || '').toUpperCase();

  if (!txHash)  return Promise.resolve({ ok: false, reason: 'Please enter a TX hash.' });
  if (!network) return Promise.resolve({ ok: false, reason: 'Please select a network.' });
  if (!uid)     return Promise.resolve({ ok: false, reason: 'Missing device id. Reload and try again.' });
  if (network !== 'TRC20' && network !== 'BEP20' && network !== 'ERC20') {
    return Promise.resolve({ ok: false, reason: 'This network does not support auto-verification.' });
  }

  var url = SUPA_URL + '/functions/v1/verify-tx';
  return fetch(url, {
    method: 'POST',
    headers: {
      'apikey':        SUPA_KEY,
      'Authorization': 'Bearer ' + SUPA_KEY,
      'Content-Type':  'application/json'
    },
    body: JSON.stringify({
      uid:     uid,
      tx_hash: txHash,
      network: network,
      contact: contact || ''
    })
  }).then(function(r) {
    return r.json().then(function(body) {
      if (body && typeof body.ok === 'boolean') return body;
      return { ok: false, reason: 'Unexpected server response. Please try again.' };
    }, function() {
      return { ok: false, reason: 'Verification service unavailable. Try again in a moment.' };
    });
  }).catch(function() {
    return { ok: false, reason: 'Could not reach verification server. Please try again.' };
  });
}
