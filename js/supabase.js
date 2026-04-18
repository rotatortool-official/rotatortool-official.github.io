/* ══════════════════════════════════════════════════════════════════
   supabase.js  —  Supabase Pro sync (persists Pro across devices)

   HOW IT WORKS:
   ─────────────
   • On Pro unlock (code or referral): saves { rot_uid, pro_code } to Supabase
   • On page load: checks if rot_uid exists in Supabase → restores Pro
   • On new device: user enters their rot_uid recovery key → Pro restored
   • Falls back gracefully if Supabase is unreachable (localStorage still works)
══════════════════════════════════════════════════════════════════ */

var SUPA_URL = 'https://wyvwycatgexpbugzkdfw.supabase.co';
var SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5dnd5Y2F0Z2V4cGJ1Z3prZGZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0ODcwNTAsImV4cCI6MjA5MTA2MzA1MH0.msUPOUjd1iZwuG6SxFlhr-0xYPt6fqTUy5iOYnf8Z20';

/* ── Low-level Supabase REST helper ──────────────────────────── */
function supaRest(table, method, params) {
  var url = SUPA_URL + '/rest/v1/' + table;
  var opts = {
    method: method || 'GET',
    headers: {
      'apikey':        SUPA_KEY,
      'Authorization': 'Bearer ' + SUPA_KEY,
      'Content-Type':  'application/json',
      'Prefer':        method === 'POST' ? 'return=representation' : ''
    }
  };

  if (method === 'GET' && params) {
    var qs = Object.keys(params).map(function(k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
    }).join('&');
    url += '?' + qs;
  }

  if ((method === 'POST' || method === 'PATCH') && params) {
    opts.body = JSON.stringify(params);
  }

  if (method === 'POST') {
    opts.headers['Prefer'] = 'return=representation,resolution=merge-duplicates';
  }

  return fetch(url, opts).then(function(r) {
    if (!r.ok) throw new Error('Supabase ' + r.status);
    return r.json();
  });
}

/* ── Save Pro status to Supabase ─────────────────────────────── */
/* DEPRECATED: direct writes to pro_users are no longer permitted
   (RLS + REVOKE enforce this since Step 0b). Pro is now granted only
   through the SECURITY DEFINER RPCs:
     • redeem_pro_code()         — for Pro-code redemption
     • grant_pro_via_referrals() — for the 5-referral unlock
     • grant_pro_via_tx()        — for verified crypto donations
   This shim is kept as a no-op so older code paths don't throw. */
function supaSavePro(uid, proCode) {
  return Promise.resolve();
}

/* ── Grant Pro via verified referral count (server-side check) ── */
function supaGrantProViaReferrals(uid) {
  var url = SUPA_URL + '/rest/v1/rpc/grant_pro_via_referrals';
  return fetch(url, {
    method: 'POST',
    headers: {
      'apikey':        SUPA_KEY,
      'Authorization': 'Bearer ' + SUPA_KEY,
      'Content-Type':  'application/json'
    },
    body: JSON.stringify({ p_uid: uid })
  }).then(function(r) {
    if (!r.ok) throw new Error('rpc ' + r.status);
    return r.json();
  }).then(function(result) {
    if (result && typeof result.ok === 'boolean') return result;
    return { ok: false, reason: 'invalid', count: 0 };
  }).catch(function(e) {
    console.warn('[Supabase] grant_pro_via_referrals failed:', e.message);
    return { ok: false, reason: 'offline', count: 0 };
  });
}

/* ── Grant Pro via verified crypto TX (server-side replay guard) ── */
function supaGrantProViaTx(uid, txHash, network, amountText, contact) {
  var url = SUPA_URL + '/rest/v1/rpc/grant_pro_via_tx';
  return fetch(url, {
    method: 'POST',
    headers: {
      'apikey':        SUPA_KEY,
      'Authorization': 'Bearer ' + SUPA_KEY,
      'Content-Type':  'application/json'
    },
    body: JSON.stringify({
      p_uid:     uid,
      p_tx_hash: txHash,
      p_network: network || '',
      p_amount:  amountText || '',
      p_contact: contact || ''
    })
  }).then(function(r) {
    if (!r.ok) throw new Error('rpc ' + r.status);
    return r.json();
  }).then(function(result) {
    if (result && typeof result.ok === 'boolean') return result;
    return { ok: false, reason: 'invalid' };
  }).catch(function(e) {
    console.warn('[Supabase] grant_pro_via_tx failed:', e.message);
    return { ok: false, reason: 'offline' };
  });
}

/* ── Server-side Pro code redemption ─────────────────────────── */
/**
 * Redeem a Pro code via the Supabase RPC (server validates).
 * Codes are NOT shipped to the browser — the full code list lives
 * only in the pro_codes table, locked from the anon role. This
 * function is the only way for the client to check a code.
 *
 * @param   {string} code — user-entered code (any case; server normalises)
 * @param   {string} uid  — this device's rot_uid
 * @returns {Promise<{ok:boolean, reason:string}>}
 *   ok=true,  reason='redeemed'       — first-time successful redeem
 *   ok=true,  reason='already_yours'  — same uid re-activating (re-install)
 *   ok=false, reason='invalid'        — unknown code
 *   ok=false, reason='inactive'       — revoked by admin
 *   ok=false, reason='used'           — consumed by a different device
 *   ok=false, reason='offline'        — network / Supabase unreachable
 */
function supaRedeemProCode(code, uid) {
  var url = SUPA_URL + '/rest/v1/rpc/redeem_pro_code';
  return fetch(url, {
    method: 'POST',
    headers: {
      'apikey':        SUPA_KEY,
      'Authorization': 'Bearer ' + SUPA_KEY,
      'Content-Type':  'application/json'
    },
    body: JSON.stringify({ p_code: code, p_uid: uid })
  }).then(function(r) {
    if (!r.ok) throw new Error('rpc ' + r.status);
    return r.json();
  }).then(function(result) {
    if (result && typeof result.ok === 'boolean') return result;
    return { ok: false, reason: 'invalid' };
  }).catch(function(e) {
    console.warn('[Supabase] code redemption failed:', e.message);
    return { ok: false, reason: 'offline' };
  });
}

/* ── Check if uid has Pro in Supabase ────────────────────────── */
function supaCheckPro(uid) {
  return supaRest('pro_users', 'GET', {
    'rot_uid':  'eq.' + uid,
    'is_pro':   'eq.true',
    'select':   'rot_uid,is_pro,pro_code'
  }).then(function(rows) {
    return rows && rows.length > 0;
  }).catch(function(e) {
    console.warn('[Supabase] check failed, using localStorage:', e.message);
    return false;
  });
}

/* ── Restore Pro on page load (non-blocking) ─────────────────── */
function supaRestoreOnLoad() {
  var uid = localStorage.getItem('rot_uid');
  if (!uid) return;

  /* Already Pro locally? Nothing to do — we can no longer push a
     local-only Pro flag to the server (that was a forgery vector,
     closed in Step 0b). If the server doesn't know about this uid
     the user will just have local Pro on this device until they
     redeem a code / tx / referrals. */
  if (isPro) return;

  /* Not Pro locally — check Supabase */
  supaCheckPro(uid).then(function(hasPro) {
    if (hasPro && !isPro) {
      isPro = true;
      savePro(true);
      updateTierBadge();
      console.log('[Supabase] Pro restored from cloud for uid:', uid);
    }
  });
}

/* ── Recovery: user enters their rot_uid from another device ── */
function supaRecoverPro(inputUid) {
  inputUid = (inputUid || '').trim();
  if (!inputUid) return Promise.resolve(false);

  return supaCheckPro(inputUid).then(function(hasPro) {
    if (hasPro) {
      /* Adopt this uid and activate Pro */
      localStorage.setItem('rot_uid', inputUid);
      isPro = true;
      savePro(true);
      updateTierBadge();
      return true;
    }
    return false;
  });
}

/* ══════════════════════════════════════════════════════════════════
   REFERRAL SYSTEM  —  Supabase-backed, anti-abuse

   HOW IT WORKS:
   ─────────────
   1. User B clicks A's referral link → referral saved (credited: false)
   2. User B loads coin data (proves real usage) → credited flipped to true
   3. Count only referrals where credited=true AND created 1+ hour ago
   4. Need 5 verified referrals to unlock Pro
   This prevents: incognito-tab spam, bot clicks, drive-by visits
══════════════════════════════════════════════════════════════════ */

var REFERRAL_NEEDED = 5;
var REFERRAL_TIME_GATE_MS = 60 * 60 * 1000; /* 1 hour */

/**
 * Save referral to Supabase (initially NOT credited).
 * Credited flips to true only after the referred user loads data.
 */
function supaSaveReferral(referrerUid, referredUid) {
  return supaRest('referrals', 'POST', {
    referrer_uid: referrerUid,
    referred_uid: referredUid,
    credited:     false
  }).catch(function(e) {
    console.warn('[Supabase] referral save failed:', e.message);
  });
}

/**
 * Activate the current user's referral (called after first data load).
 * This proves the referred user actually used the app, not just clicked.
 */
function supaActivateMyReferral() {
  var myUid = localStorage.getItem('rot_uid');
  var from  = localStorage.getItem('rot_came_from');
  if (!myUid || !from) return Promise.resolve();
  if (localStorage.getItem('rot_ref_activated')) return Promise.resolve();

  /* PATCH: set credited=true where referred_uid = me */
  var url = SUPA_URL + '/rest/v1/referrals?referred_uid=eq.' + myUid;
  return fetch(url, {
    method: 'PATCH',
    headers: {
      'apikey':        SUPA_KEY,
      'Authorization': 'Bearer ' + SUPA_KEY,
      'Content-Type':  'application/json',
      'Prefer':        'return=minimal'
    },
    body: JSON.stringify({ credited: true })
  }).then(function() {
    try { localStorage.setItem('rot_ref_activated', '1'); } catch(e) {}
    console.log('[Supabase] referral activated for uid:', myUid);
  }).catch(function(e) {
    console.warn('[Supabase] referral activation failed:', e.message);
  });
}

/**
 * Count verified referrals for a user from Supabase.
 * Only counts referrals where:
 *   - credited = true (referred user actually loaded data)
 *   - created_at is 1+ hour ago (time gate to prevent instant abuse)
 * @param {string} uid — the referrer's rot_uid
 * @returns {Promise<number>} count of verified unique referrals
 */
function supaCountReferrals(uid) {
  var cutoff = new Date(Date.now() - REFERRAL_TIME_GATE_MS).toISOString();
  return supaRest('referrals', 'GET', {
    'referrer_uid': 'eq.' + uid,
    'credited':     'eq.true',
    'created_at':   'lt.' + cutoff,
    'select':       'referred_uid'
  }).then(function(rows) {
    if (!rows) return 0;
    /* Deduplicate referred_uids */
    var seen = {};
    rows.forEach(function(r) { seen[r.referred_uid] = true; });
    return Object.keys(seen).length;
  }).catch(function(e) {
    console.warn('[Supabase] referral count failed:', e.message);
    return 0;
  });
}

/* ══════════════════════════════════════════════════════════════════
   SHARED API CACHE  —  Prevents CoinGecko rate-limit bans

   HOW IT WORKS:
   ─────────────
   Instead of every user hitting CoinGecko directly, the first user
   to load fetches the data and writes it to the market_cache table.
   All subsequent users within the TTL window read from Supabase
   instead — fast and free of rate limits.

   • supaCacheGet(key, ttlMs)  → returns cached data or null
   • supaCacheSet(key, data)   → writes/updates cache entry
══════════════════════════════════════════════════════════════════ */

/**
 * Read from shared Supabase cache.
 * @param {string} key   — cache key (e.g. 'coins_markets_l1')
 * @param {number} ttlMs — max age in ms (default 5 min)
 * @returns {Promise<object|null>} cached data or null if stale/missing
 */
function supaCacheGet(key, ttlMs) {
  ttlMs = ttlMs || 5 * 60 * 1000;
  return supaRest('market_cache', 'GET', {
    'cache_key': 'eq.' + key,
    'select':    'data,updated_at',
    'limit':     '1'
  }).then(function(rows) {
    if (!rows || !rows.length) return null;
    var row = rows[0];
    var age = Date.now() - new Date(row.updated_at).getTime();
    if (age > ttlMs) return null; // stale
    return row.data;
  }).catch(function(e) {
    console.warn('[SupaCache] read failed, will fetch from API:', e.message);
    return null;
  });
}

/**
 * Write to shared Supabase cache (upsert).
 * @param {string} key  — cache key
 * @param {object} data — JSON-serializable data
 */
function supaCacheSet(key, data) {
  return supaRest('market_cache', 'POST', {
    cache_key:  key,
    data:       data,
    updated_at: new Date().toISOString()
  }).catch(function(e) {
    console.warn('[SupaCache] write failed (non-critical):', e.message);
  });
}

/* ══════════════════════════════════════════════════════════════════
   PRO REQUEST PIPELINE  —  Donation → Auto-verified Pro activation

   HOW IT WORKS:
   ─────────────
   1. User donates crypto and submits TX hash + network
   2. tx-verify.js auto-verifies on blockchain (destination, amount, confirmed)
   3. If valid → saved with status 'auto_approved', Pro activated instantly
   4. Binance Pay → saved as 'pending' (off-chain, needs manual review)
   5. TX hash uniqueness enforced — one hash = one Pro activation
══════════════════════════════════════════════════════════════════ */

/**
 * Check if a TX hash has already been submitted (any status).
 * Prevents reuse of the same transaction.
 * @param {string} txHash
 * @returns {Promise<boolean>} true if already used
 */
function supaCheckTxHashUsed(txHash) {
  return supaRest('pro_requests', 'GET', {
    'tx_hash': 'eq.' + txHash,
    'select':  'id',
    'limit':   '1'
  }).then(function(rows) {
    return rows && rows.length > 0;
  }).catch(function() {
    return false; /* fail open — verification will still run */
  });
}

/**
 * Submit a Pro activation request after crypto donation.
 * @param {object} req — { amount, network, tx_hash, contact, status }
 * @returns {Promise<boolean>} true if saved successfully
 */
function supaSubmitProRequest(req) {
  var uid = localStorage.getItem('rot_uid') || getMyId();
  return supaRest('pro_requests', 'POST', {
    rot_uid:  uid,
    amount:   req.amount   || '',
    network:  req.network  || '',
    tx_hash:  req.tx_hash  || '',
    contact:  req.contact  || '',
    status:   req.status   || 'pending'
  }).then(function(rows) {
    return rows && rows.length > 0;
  }).catch(function(e) {
    console.warn('[Supabase] pro request failed:', e.message);
    return false;
  });
}

/**
 * Check if user has a pending or approved request.
 * @returns {Promise<object|null>} latest request or null
 */
function supaCheckProRequest() {
  var uid = localStorage.getItem('rot_uid');
  if (!uid) return Promise.resolve(null);
  return supaRest('pro_requests', 'GET', {
    'rot_uid':  'eq.' + uid,
    'select':   'status,created_at',
    'order':    'created_at.desc',
    'limit':    '1'
  }).then(function(rows) {
    return rows && rows.length > 0 ? rows[0] : null;
  }).catch(function() { return null; });
}

/* ── Auto-run on load ────────────────────────────────────────── */
(function() {
  try { supaRestoreOnLoad(); } catch(e) {}
})();
