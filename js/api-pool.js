/* ══════════════════════════════════════════════════════════════════
   api-pool.js  —  All network fetching, caching & key rotation
   
   HOW TO EDIT THIS FILE:
   ──────────────────────
   • ADD MORE ALPHA VANTAGE KEYS:  Find AV_KEYS and add to the array
       AV_KEYS = ['KEY1', 'KEY2', 'KEY3']
     Keys rotate automatically when one hits a 429 rate-limit.
   
   • CHANGE CACHE TIMES:  Find CACHE_RULES below. Each entry has a
     `ttl` in milliseconds. Examples:
       5  minutes = 5*60*1000
       15 minutes = 15*60*1000
       1  hour    = 60*60*1000

   • ADD A NEW PROXY:  Add a function to the `ps` array inside apiFetch.
     The system tries each proxy in order and stops at the first success.
══════════════════════════════════════════════════════════════════ */

/* ── Alpha Vantage API Key Pool ─────────────────────────────────────
   Add more keys here — they rotate automatically on 429 errors.
   Get free keys at: https://www.alphavantage.co/support/#api-key
────────────────────────────────────────────────────────────────── */
var AV_KEYS = ['R9V24J5V7LCQYZMF'];
/* To add more keys:  var AV_KEYS = ['KEY1', 'KEY2', 'KEY3']; */

/* ── Smart AV key manager — tracks per-key cooldowns ────────────────
   When a key hits 429 it gets a cooldown (default 65s for free tier).
   getAVKey() always returns the first key that is NOT in cooldown.
   If ALL keys are cooling down, it returns the least-recently-hit one
   (best of bad options) rather than crashing.
────────────────────────────────────────────────────────────────── */
var _avCooldowns = {};   /* key → timestamp when cooldown expires */
var _avCooldownMs = 65 * 1000;  /* 65 seconds — AV free tier resets per minute */

function getAVKey() {
  var now = Date.now();
  /* First: find a key with no active cooldown */
  for (var i = 0; i < AV_KEYS.length; i++) {
    var k = AV_KEYS[i];
    if (!_avCooldowns[k] || now >= _avCooldowns[k]) return k;
  }
  /* All keys cooling — return the one whose cooldown expires soonest */
  var best = AV_KEYS[0];
  for (var j = 1; j < AV_KEYS.length; j++) {
    if (_avCooldowns[AV_KEYS[j]] < _avCooldowns[best]) best = AV_KEYS[j];
  }
  return best;
}

function rotateAVKey() {
  /* Mark current key as rate-limited and return next available */
  var cur = getAVKey();
  _avCooldowns[cur] = Date.now() + _avCooldownMs;
  console.warn('[AV] Key rate-limited, cooling for 65s:', cur.slice(0,6) + '…');
  return getAVKey();
}

/* How long until next AV key is available (ms), 0 if one is ready now */
function avKeyWaitMs() {
  var now = Date.now();
  for (var i = 0; i < AV_KEYS.length; i++) {
    if (!_avCooldowns[AV_KEYS[i]] || now >= _avCooldowns[AV_KEYS[i]]) return 0;
  }
  var min = Infinity;
  AV_KEYS.forEach(function(k) { if (_avCooldowns[k] < min) min = _avCooldowns[k]; });
  return Math.max(0, min - now);
}

var AV_KEY = getAVKey(); /* kept for backwards compat — always use getAVKey() in new code */

/* ── Cache TTL Rules ─────────────────────────────────────────────────
   Rules are checked top-to-bottom; first match wins.
   Increase a ttl to cache longer, decrease to fetch fresher data.
────────────────────────────────────────────────────────────────── */
var CACHE_RULES = [
  { match: /coins\/bitcoin\/market_chart\?.*days=200/, ttl: 60*60*1000, label: 'BTC-MA200'   }, // 1 hour
  { match: /market_chart\?.*days=30/,                  ttl: 30*60*1000, label: 'CHART-30D'   }, // 30 min
  { match: /simple\/price/,                             ttl: 10*60*1000, label: 'SIMPLE-PRC'  }, // 10 min
  { match: /coins\/markets/,                           ttl: 15*60*1000, label: 'COINS-MKT'   }, // 15 min
  { match: /finance\.yahoo\.com/,                      ttl: 30*60*1000, label: 'STOCKS'       }, // 30 min
  { match: /alphavantage\.co/,                         ttl: 15*60*1000, label: 'FOREX-AV'    }, // 15 min
  { match: /frankfurter\.app/,                         ttl: 15*60*1000, label: 'FOREX-FK'    }, // 15 min
  { match: /./,                                        ttl:  5*60*1000, label: 'DEFAULT'      }  // 5 min
];

/* ── Internal cache stores ─────────────────────────────────────── */
var _memCache = {};  /* url → { data, time }  — fast, in-memory     */
var _pending  = {};  /* url → Promise          — dedup in-flight     */

function _getTTL(url) {
  for (var i = 0; i < CACHE_RULES.length; i++) {
    if (CACHE_RULES[i].match.test(url)) return CACHE_RULES[i].ttl;
  }
  return 5*60*1000;
}

function _cacheGet(url) {
  var now = Date.now(), ttl = _getTTL(url);
  /* 1. Memory (fastest) */
  if (_memCache[url] && now - _memCache[url].time < ttl) return _memCache[url].data;
  /* 2. localStorage (survives page reload) */
  try {
    var raw = localStorage.getItem('rc:' + url);
    if (raw) {
      var stored = JSON.parse(raw);
      if (stored && now - stored.time < ttl) {
        _memCache[url] = stored; // promote to memory
        return stored.data;
      }
    }
  } catch(e) {}
  return null;
}

function _cacheSet(url, data) {
  var entry = { data: data, time: Date.now() };
  _memCache[url] = entry;
  try {
    localStorage.setItem('rc:' + url, JSON.stringify(entry));
  } catch(e) {
    /* localStorage full — prune 10 oldest entries and retry */
    try {
      var keys = Object.keys(localStorage).filter(function(k){ return k.indexOf('rc:') === 0; });
      keys.sort(function(a, b) {
        try { return (JSON.parse(localStorage.getItem(a))||{time:0}).time - (JSON.parse(localStorage.getItem(b))||{time:0}).time; } catch(e) { return 0; }
      });
      for (var i = 0; i < Math.min(10, keys.length); i++) localStorage.removeItem(keys[i]);
      localStorage.setItem('rc:' + url, JSON.stringify(entry));
    } catch(e2) {}
  }
}

/* Unwrap proxy response wrappers (allorigins etc.) */
function unwrap(r) {
  if (!r) return r;
  if (typeof r.contents === 'string') { try { return JSON.parse(r.contents); } catch(e){} }
  if (typeof r.data === 'string')     { try { return JSON.parse(r.data);     } catch(e){} }
  if (r.data !== undefined && typeof r.data === 'object') return r.data;
  return r;
}

/* Purge expired localStorage entries (called once at startup) */
function purgeStaleCacheEntries() {
  try {
    var now = Date.now();
    Object.keys(localStorage).filter(function(k){ return k.indexOf('rc:') === 0; }).forEach(function(k) {
      try {
        var url    = k.slice(3);
        var ttl    = _getTTL(url);
        var stored = JSON.parse(localStorage.getItem(k));
        if (!stored || now - stored.time > ttl * 4) localStorage.removeItem(k); // purge if 4× expired
      } catch(e) { localStorage.removeItem(k); }
    });
  } catch(e) {}
}
try { purgeStaleCacheEntries(); } catch(e) {}

/* ── Cache info helper ───────────────────────────────────────────── */
function getCacheInfo(url) {
  var now = Date.now(), ttl = _getTTL(url);
  var entry = _memCache[url];
  if (!entry) { try { var raw = localStorage.getItem('rc:' + url); if (raw) entry = JSON.parse(raw); } catch(e){} }
  if (!entry) return null;
  var age       = now - entry.time;
  var remaining = Math.max(0, ttl - age);
  return { age: age, remaining: remaining, ttl: ttl, fresh: age < ttl };
}

/* ══════════════════════════════════════════════════════════════════
   apiFetch(url)
   ─────────────
   The main fetch function. Call this for EVERY API request.
   
   Strategy (tried in order, stops at first success):
     1. Direct fetch          — fastest, works for CORS-safe APIs
     2. corsproxy.io          — good fallback
     3. allorigins.win        — last resort

   Returns: parsed JSON data (already unwrapped from proxy format)
   Throws:  Error with all failure messages if all proxies fail
══════════════════════════════════════════════════════════════════ */
async function apiFetch(url) {
  /* Return cached data if still fresh */
  var cached = _cacheGet(url);
  if (cached !== null) return cached;

  /* Deduplicate concurrent requests to the same URL */
  if (_pending[url]) return _pending[url];

  _pending[url] = (async function() {
    /* ── Proxy pool — add more here if needed ── */
    var ps = [
      function(){ return fetch(url, {signal: AbortSignal.timeout(9000)}); },
      function(){ return fetch('https://corsproxy.io/?' + encodeURIComponent(url), {signal: AbortSignal.timeout(11000)}); },
      function(){ return fetch('https://api.allorigins.win/get?url=' + encodeURIComponent(url), {signal: AbortSignal.timeout(11000)}); }
    ];

    var errs = [];
    for (var i = 0; i < ps.length; i++) {
      try {
        var r = await ps[i]();
        if (!r.ok) {
          if (r.status === 429 && url.indexOf('alphavantage') >= 0) rotateAVKey();
          throw new Error('HTTP ' + r.status);
        }
        var j = await r.json();
        var u = unwrap(j);
        if (u && (u.Note || u.Information) && url.indexOf('alphavantage') >= 0) {
          var msg = u.Note || u.Information;
          if (msg.indexOf('API call frequency') >= 0 || msg.indexOf('rate limit') >= 0 || msg.indexOf('premium') >= 0) {
            rotateAVKey();
            throw new Error('AV rate_limited: ' + msg.slice(0, 60));
          }
        }
        if (u && u.status && u.status.error_code === 429) throw new Error('rate_limited');
        _cacheSet(url, u);
        delete _pending[url];
        return u;
      } catch(e) { errs.push(e.message || String(e)); }
    }
    delete _pending[url];
    throw new Error(errs.join(' | '));
  })();

  return _pending[url];
}

var sleep = ms => new Promise(r => setTimeout(r, ms));
