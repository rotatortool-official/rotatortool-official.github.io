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

/* ── Auto-run on load ────────────────────────────────────────── */
(function() {
  try { supaRestoreOnLoad(); } catch(e) {}
})();
