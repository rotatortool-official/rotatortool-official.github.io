/* ══════════════════════════════════════════════════════════════════
   api-pool.js  —  All network fetching & caching

   HOW TO EDIT THIS FILE:
   ──────────────────────
   • CHANGE CACHE TIMES:  Find CACHE_RULES below. Each entry has a
     `ttl` in milliseconds. Examples:
       5  minutes = 5*60*1000
       15 minutes = 15*60*1000
       1  hour    = 60*60*1000

   • ADD A NEW PROXY:  Add a function to the `ps` array inside apiFetch.
     The system tries each proxy in order and stops at the first success.

   Alpha Vantage support (a key pool + rotation, for the Oil/DXY macro
   feeds) was removed 2026-09-05 — see js/data-loaders.js's loadMacroData()
   for why. If a future feed needs Alpha Vantage again, do NOT hard-code
   a key in this file: it's shipped to every visitor's browser as plain
   text. Fetch it server-side (a Supabase Edge Function + synced table,
   the pattern market_cycle already uses) instead.
══════════════════════════════════════════════════════════════════ */

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
  { match: /frankfurter\.app/,                         ttl: 15*60*1000, label: 'FOREX-FK'    }, // 15 min
  /* These three used to fall through to DEFAULT by accident. Binance's
     ticker stays at 5 min because it is the live price feed; the other
     two are pinned to how often the source actually republishes. */
  { match: /api\.binance\.com\/api\/v3\/ticker\/24hr/, ttl:  5*60*1000, label: 'BNB-TICKER'  }, // 5 min — live prices
  { match: /alternative\.me\/fng/,                     ttl: 60*60*1000, label: 'FEAR-GREED'  }, // 1 hour — index updates once a day
  { match: /coingecko\.com\/api\/v3\/global/,          ttl: 15*60*1000, label: 'CG-GLOBAL'   }, // 15 min — total mcap/dominance drift slowly
  { match: /./,                                        ttl:  5*60*1000, label: 'DEFAULT'      }  // 5 min
];

/* ── Cache metrics ───────────────────────────────────────────────────
   Read-only counters, exposed for monitoring. Nothing branches on
   these — they exist so "the cache quietly stopped working" is
   observable instead of invisible. Inspect via window.__ROT_CACHE_STATS.
────────────────────────────────────────────────────────────────── */
var _cacheStats = {
  hit: 0, miss: 0, staleServed: 0, rateLimited: 0, failed: 0,
  proxyDepth: [0, 0, 0]   /* [direct, corsproxy, allorigins] */
};
try { window.__ROT_CACHE_STATS = _cacheStats; } catch(e) {}

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

/* Read a cached entry REGARDLESS of age. Last-resort only: used after
   every network path has already failed, where a few minutes of
   staleness beats an empty screen. Kept separate from _cacheGet so a
   stale entry can never silently satisfy a normal request.
   Note: purgeStaleCacheEntries() drops entries past 4x their TTL, so
   this can only reach back that far. Returns { data, age } or null. */
function _cacheGetStale(url) {
  var entry = _memCache[url];
  if (!entry) {
    try {
      var raw = localStorage.getItem('rc:' + url);
      if (raw) entry = JSON.parse(raw);
    } catch(e) {}
  }
  if (!entry || entry.data === undefined || entry.data === null) return null;
  return { data: entry.data, age: Date.now() - entry.time };
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
  if (cached !== null) { _cacheStats.hit++; return cached; }
  _cacheStats.miss++;

  /* Deduplicate concurrent requests to the same URL */
  if (_pending[url]) return _pending[url];

  _pending[url] = (async function() {
    /* ── Proxy pool — add more here if needed ── */
    var ps = [
      function(){ return fetch(url, {signal: AbortSignal.timeout(5000)}); },
      function(){ return fetch('https://corsproxy.io/?' + encodeURIComponent(url), {signal: AbortSignal.timeout(7000)}); },
      function(){ return fetch('https://api.allorigins.win/get?url=' + encodeURIComponent(url), {signal: AbortSignal.timeout(7000)}); }
    ];

    var errs = [];
    for (var i = 0; i < ps.length; i++) {
      try {
        var r = await ps[i]();
        if (!r.ok) throw new Error('HTTP ' + r.status);
        var j = await r.json();
        var u = unwrap(j);
        if (u && u.status && u.status.error_code === 429) { _cacheStats.rateLimited++; throw new Error('rate_limited'); }
        _cacheSet(url, u);
        _cacheStats.proxyDepth[i]++;
        delete _pending[url];
        return u;
      } catch(e) { errs.push(e.message || String(e)); }
    }

    delete _pending[url];

    /* Every proxy failed. Before throwing, fall back to whatever is
       still in the cache — expired data is almost always better than
       none, and the age is logged so a genuinely dead endpoint shows up
       as "serving 40-minute-old data" rather than passing unnoticed. */
    var stale = _cacheGetStale(url);
    if (stale) {
      _cacheStats.staleServed++;
      console.warn('[apiFetch] all sources failed — serving cache ' +
                   Math.round(stale.age / 1000) + 's old: ' + url);
      return stale.data;
    }

    _cacheStats.failed++;
    throw new Error(errs.join(' | '));
  })();

  return _pending[url];
}

var sleep = ms => new Promise(r => setTimeout(r, ms));
