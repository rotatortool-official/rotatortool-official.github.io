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
     • grant_pro_via_tx()        — called only from the verify-tx
                                   Edge Function (server-trusted).
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

/* Note: supaGrantProViaTx was removed — grant_pro_via_tx is now only
   callable by the service_role key inside the verify-tx Edge Function.
   The frontend calls that function via verifyAndActivateTx() in
   tx-verify.js, which handles chain check + Pro activation atomically. */

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
      if (window.Analytics) Analytics.track('Pro Unlocked', { method: 'cloud-restore' });
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
      if (window.Analytics) Analytics.track('Pro Unlocked', { method: 'recovery' });
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
   SIGNAL TRACK RECORD  —  Shared, server-verified daily snapshots

   HOW IT WORKS:
   ─────────────
   Instead of each browser maintaining its own localStorage history
   (empty for new visitors, spoofable), one row-per-(day, coin, type)
   is stored in signal_snapshots.
     • First client of the day calls record_daily_snapshot() — wins.
     • Subsequent calls are no-ops (UNIQUE + ON CONFLICT DO NOTHING).
     • Everyone reads the same authoritative history via SELECT.
     • snap_date is stamped CURRENT_DATE server-side — no backdating.
   localStorage is kept as an offline fallback only.
══════════════════════════════════════════════════════════════════ */

/**
 * Submit today's top-bullish + top-lagging rows. Server decides the
 * date and ignores the call if today's rows already exist.
 * @param {Array<object>} rows — each row must have { coin_id, coin_sym,
 *   signal_type: 'bullish'|'lagging', signal_label, extras, score,
 *   price, p24, p7, p30 }. coin_name optional.
 * @returns {Promise<{ok:boolean, reason:string, count:number}>}
 */
function supaRecordSignalSnapshot(rows) {
  var url = SUPA_URL + '/rest/v1/rpc/record_daily_snapshot';
  return fetch(url, {
    method: 'POST',
    headers: {
      'apikey':        SUPA_KEY,
      'Authorization': 'Bearer ' + SUPA_KEY,
      'Content-Type':  'application/json'
    },
    body: JSON.stringify({ p_rows: rows })
  }).then(function(r) {
    if (!r.ok) throw new Error('rpc ' + r.status);
    return r.json();
  }).then(function(result) {
    if (result && typeof result.ok === 'boolean') return result;
    return { ok: false, reason: 'invalid', count: 0 };
  }).catch(function(e) {
    console.warn('[Supabase] record_daily_snapshot failed:', e.message);
    return { ok: false, reason: 'offline', count: 0 };
  });
}

/**
 * Load the last `days` days of shared signal snapshots.
 * Returned array mirrors the legacy localStorage shape so
 * signal-history.js can consume it without further transformation:
 *   [{ date:'YYYY-MM-DD', bullish:[...], lagging:[...] }, ...]
 * Ordered oldest → newest.
 * @param {number} days — window size (default 30)
 * @returns {Promise<Array<object>>}
 */
function supaLoadSignalHistory(days) {
  days = days || 30;
  var cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  var cutoffDate = cutoff.getFullYear() + '-'
                 + String(cutoff.getMonth() + 1).padStart(2, '0') + '-'
                 + String(cutoff.getDate()).padStart(2, '0');

  return supaRest('signal_snapshots', 'GET', {
    'snap_date': 'gte.' + cutoffDate,
    'select':    'snap_date,coin_id,coin_sym,coin_name,signal_type,'
               + 'signal_label,extras,score,price,p24,p7,p30',
    'order':     'snap_date.asc'
  }).then(function(rows) {
    if (!rows || !rows.length) return [];

    /* Group rows by date */
    var byDate = {};
    rows.forEach(function(r) {
      var d = r.snap_date;
      if (!byDate[d]) byDate[d] = { date: d, bullish: [], lagging: [] };
      var entry = {
        id:      r.coin_id,
        sym:     r.coin_sym,
        name:    r.coin_name || '',
        price:   r.price != null ? Number(r.price) : null,
        score:   r.score != null ? Number(r.score) : null,
        signal:  r.signal_label || '',
        extras:  r.extras || [],
        p24:     r.p24 != null ? Number(r.p24) : null,
        p7:      r.p7  != null ? Number(r.p7)  : null,
        p30:     r.p30 != null ? Number(r.p30) : null
      };
      if (r.signal_type === 'bullish')      byDate[d].bullish.push(entry);
      else if (r.signal_type === 'lagging') byDate[d].lagging.push(entry);
    });

    /* Preserve score ordering within each day */
    Object.keys(byDate).forEach(function(d) {
      byDate[d].bullish.sort(function(a, b) { return (b.score || 0) - (a.score || 0); });
      byDate[d].lagging.sort(function(a, b) { return (a.score || 0) - (b.score || 0); });
    });

    return Object.keys(byDate).sort().map(function(d) { return byDate[d]; });
  }).catch(function(e) {
    console.warn('[Supabase] load signal history failed:', e.message);
    return [];
  });
}

/* ══════════════════════════════════════════════════════════════════
   INSIGHT SNAPSHOTS  —  24h-delayed Insight Engine for free users

   Pro users see today's live compute; free users see the row the
   server stamped with CURRENT_DATE yesterday. First-writer-of-day
   wins, subsequent clients no-op (see sql/insight_snapshots_table.sql).
   ══════════════════════════════════════════════════════════════════ */

/**
 * Submit today's insights (one row per coin). Server stamps the date
 * and ignores the call if today's rows already exist.
 * @param {Array<object>} rows — each row: { coin_id, coin_sym, insight, price }
 *   where `insight` is the { score, label, color, signals[], tooltip } object.
 * @returns {Promise<{ok:boolean, reason:string, count:number}>}
 */

/**
 * Record today's rotation pairs (A → B). First-writer-of-the-day wins
 * per (snap_date, from_id, to_id). Server stamps snap_date itself.
 * @param {Array<Object>} rows — each: { from_id, from_sym, from_price, from_score, to_id, to_sym, to_price, to_score, source? }
 * @returns {Promise<{ok:boolean, reason:string, count:number}>}
 */
function supaRecordRotationSnapshot(rows) {
  var url = SUPA_URL + '/rest/v1/rpc/record_rotation_snapshot';
  return fetch(url, {
    method: 'POST',
    headers: {
      'apikey':        SUPA_KEY,
      'Authorization': 'Bearer ' + SUPA_KEY,
      'Content-Type':  'application/json'
    },
    body: JSON.stringify({ p_rows: rows })
  }).then(function(r) {
    if (!r.ok) throw new Error('rpc ' + r.status);
    return r.json();
  }).then(function(result) {
    if (result && typeof result.ok === 'boolean') return result;
    return { ok: false, reason: 'invalid', count: 0 };
  }).catch(function(e) {
    console.warn('[Supabase] record_rotation_snapshot failed:', e.message);
    return { ok: false, reason: 'offline', count: 0 };
  });
}

/**
 * Load shared rotation snapshots, grouped by date so signal-history.js
 * can apply peak-capture verdicts to each leg.
 */
function supaLoadRotationHistory(days) {
  days = days || 30;
  var cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  var cutoffDate = cutoff.getFullYear() + '-'
                 + String(cutoff.getMonth() + 1).padStart(2, '0') + '-'
                 + String(cutoff.getDate()).padStart(2, '0');

  return supaRest('rotation_snapshots', 'GET', {
    'snap_date': 'gte.' + cutoffDate,
    'select':    'snap_date,from_id,from_sym,from_price,from_score,to_id,to_sym,to_price,to_score,source',
    'order':     'snap_date.asc'
  }).then(function(rows) {
    if (!rows || !rows.length) return [];
    var byDate = {};
    rows.forEach(function(r) {
      var d = r.snap_date;
      if (!byDate[d]) byDate[d] = { date: d, pairs: [] };
      byDate[d].pairs.push({
        from_id:    r.from_id,
        from_sym:   r.from_sym,
        from_price: r.from_price != null ? Number(r.from_price) : null,
        from_score: r.from_score != null ? Number(r.from_score) : null,
        to_id:      r.to_id,
        to_sym:     r.to_sym,
        to_price:   r.to_price != null ? Number(r.to_price) : null,
        to_score:   r.to_score != null ? Number(r.to_score) : null,
        source:     r.source || 'dashboard'
      });
    });
    return Object.keys(byDate).sort().map(function(k) { return byDate[k]; });
  }).catch(function() { return []; });
}

function supaRecordInsights(rows) {
  var url = SUPA_URL + '/rest/v1/rpc/record_daily_insights';
  return fetch(url, {
    method: 'POST',
    headers: {
      'apikey':        SUPA_KEY,
      'Authorization': 'Bearer ' + SUPA_KEY,
      'Content-Type':  'application/json'
    },
    body: JSON.stringify({ p_rows: rows })
  }).then(function(r) {
    if (!r.ok) throw new Error('rpc ' + r.status);
    return r.json();
  }).then(function(result) {
    if (result && typeof result.ok === 'boolean') return result;
    return { ok: false, reason: 'invalid', count: 0 };
  }).catch(function(e) {
    console.warn('[Supabase] record_daily_insights failed:', e.message);
    return { ok: false, reason: 'offline', count: 0 };
  });
}

/**
 * Load yesterday's insight snapshots, keyed by coin_id for O(1) lookup.
 * If yesterday has no rows (e.g. first day of deployment), falls back
 * to the most-recent past day that does have rows.
 * @returns {Promise<{date:string|null, map:Object<string,object>}>}
 */
function supaLoadYesterdayInsights() {
  /* Ask for up to 7 days back in one query so we have a fallback if
     yesterday is empty (e.g. first day after launch). */
  var cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  var cutoffDate = cutoff.getFullYear() + '-'
                 + String(cutoff.getMonth() + 1).padStart(2, '0') + '-'
                 + String(cutoff.getDate()).padStart(2, '0');

  return supaRest('insight_snapshots', 'GET', {
    'snap_date': 'gte.' + cutoffDate,
    'select':    'snap_date,coin_id,coin_sym,insight,price',
    'order':     'snap_date.desc'
  }).then(function(rows) {
    if (!rows || !rows.length) return { date: null, map: {} };

    /* Today's date in the browser's local timezone — used to skip
       any rows stamped "today" (Pro users would see them live anyway,
       and free users should only ever see yesterday or older). */
    var now = new Date();
    var todayStr = now.getFullYear() + '-'
                 + String(now.getMonth() + 1).padStart(2, '0') + '-'
                 + String(now.getDate()).padStart(2, '0');

    /* Find the most recent snap_date that is NOT today. */
    var pickDate = null;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].snap_date !== todayStr) { pickDate = rows[i].snap_date; break; }
    }
    if (!pickDate) return { date: null, map: {} };

    /* Build map of that day's rows only. */
    var map = {};
    rows.forEach(function(r) {
      if (r.snap_date === pickDate && r.coin_id && r.insight) {
        map[r.coin_id] = {
          insight: r.insight,
          price:   r.price != null ? Number(r.price) : null,
          sym:     r.coin_sym || ''
        };
      }
    });
    return { date: pickDate, map: map };
  }).catch(function(e) {
    console.warn('[Supabase] load yesterday insights failed:', e.message);
    return { date: null, map: {} };
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

/* Note: supaCheckTxHashUsed was removed — replay protection lives in
   grant_pro_via_tx (returns reason='tx_used'), called by the verify-tx
   Edge Function after the on-chain check. */

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

/* ══════════════════════════════════════════════════════════════════
   UNIFIED MARKET DATA  —  Cross-asset cache (crypto + stocks + forex)

   Populated by the `sync-market-data` Edge Function every 12h via
   pg_cron. Frontend reads from here to render the "Global Top Movers"
   widget without hitting any external APIs client-side.
   See: 28mart/sql/unified_market_data_table.sql
═══════════════════════════════════════════════════════════════════ */

/**
 * Fetch latest rows from `unified_market_data_latest` (view of the most
 * recent row per asset_type+symbol, last 48h only).
 * @param {string} [assetType] — 'crypto' | 'stock' | 'forex' | undefined (all)
 * @returns {Promise<Array<object>>} rows or [] on error
 */
function supaGetUnifiedMarket(assetType) {
  var params = {
    'select': 'asset_type,symbol,name,price,change_24h,source_name,last_updated,metadata',
    'order':  'change_24h.desc.nullslast',
    'limit':  '500'
  };
  if (assetType) params.asset_type = 'eq.' + assetType;
  return supaRest('unified_market_data_latest', 'GET', params).catch(function(e) {
    console.warn('[Supabase] unified market fetch failed:', e.message);
    return [];
  });
}

/**
 * Get the top N gainers + top N losers across all asset classes.
 * De-dupes by (asset_type, symbol) — prefers Binance > CoinGecko for crypto.
 * @param {number} limit — gainers/losers to return each (default 5)
 * @returns {Promise<{gainers:Array, losers:Array, updatedAt:string|null}>}
 */
function supaGetTopMovers(limit) {
  limit = limit || 5;
  return supaGetUnifiedMarket().then(function(rows) {
    if (!rows || !rows.length) return { gainers: [], losers: [], updatedAt: null };

    /* Deduplicate by (asset_type, symbol) — keep one source per asset. */
    var sourceRank = { binance: 1, coingecko: 2, yahoo: 3, xfra: 4 };
    var seen = {};
    rows.forEach(function(r) {
      if (r.change_24h == null || r.price == null) return;
      var k = r.asset_type + '|' + r.symbol;
      var existing = seen[k];
      var curRank   = sourceRank[r.source_name] || 9;
      var prevRank  = existing ? (sourceRank[existing.source_name] || 9) : 999;
      if (!existing || curRank < prevRank) seen[k] = r;
    });

    var unique = Object.keys(seen).map(function(k) { return seen[k]; });
    var sortedDesc = unique.slice().sort(function(a, b) { return (b.change_24h || 0) - (a.change_24h || 0); });
    var sortedAsc  = unique.slice().sort(function(a, b) { return (a.change_24h || 0) - (b.change_24h || 0); });

    /* Pick freshest timestamp for "last updated" display */
    var maxTs = null;
    unique.forEach(function(r) {
      if (!maxTs || r.last_updated > maxTs) maxTs = r.last_updated;
    });

    return {
      gainers:   sortedDesc.slice(0, limit),
      losers:    sortedAsc.slice(0, limit),
      updatedAt: maxTs
    };
  });
}

/* ── Auto-run on load ────────────────────────────────────────── */
(function() {
  try { supaRestoreOnLoad(); } catch(e) {}
})();
