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
function supaSavePro(uid, proCode) {
  return supaRest('pro_users', 'POST', {
    rot_uid:   uid,
    pro_code:  proCode || 'referral',
    is_pro:    true
  }).catch(function(e) {
    console.warn('[Supabase] save failed, Pro still works locally:', e.message);
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

  /* Already Pro locally? Make sure it's saved to Supabase too */
  if (isPro) {
    supaSavePro(uid, 'local-sync');
    return;
  }

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

/* ── Save referral to Supabase ───────────────────────────────── */
function supaSaveReferral(referrerUid, referredUid) {
  return supaRest('referrals', 'POST', {
    referrer_uid: referrerUid,
    referred_uid: referredUid,
    credited:     true
  }).catch(function(e) {
    console.warn('[Supabase] referral save failed:', e.message);
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
   PRO REQUEST PIPELINE  —  Donation → Pro activation

   HOW IT WORKS:
   ─────────────
   1. User donates crypto and clicks "I've sent payment"
   2. Fills: amount, network, TX hash, contact (Telegram/Discord)
   3. Request saved to pro_requests table (status: 'pending')
   4. Admin (Daniel) checks wallet → verifies TX → sets status: 'approved'
      AND flips is_pro=true in pro_users via dashboard
   5. User's next page load → supaRestoreOnLoad() auto-activates Pro
══════════════════════════════════════════════════════════════════ */

/**
 * Submit a Pro activation request after crypto donation.
 * @param {object} req — { amount, network, tx_hash, contact }
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
    status:   'pending'
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
