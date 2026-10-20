/* ROTATOR - proprietary software. Copyright (c) 2026 ROTATOR. All rights reserved.
   See LICENSE.txt. This code is public only so the site can run in your browser;
   it is not open source and may not be copied, modified or reused. */
/* ══════════════════════════════════════════════════════════════════
   topic.js — shared helpers for the search topic pages (promptove/148):
   golden-cross.html, bitcoin-etf-flows.html, token-unlocks.html and
   mk/kripto-denes.html.

   READ ONLY, and only rows the board already reads (no new pipeline):
   coin_events / coin_technicals (crosses), etf_flows + market_cache
   'etf_flows_summary', token_unlocks, market_cache 'cg_markets_all'.
   Same public anon key as js/supabase.js; these pages do not load the
   board's 60 KB supabase.js because they need none of its Pro code.
══════════════════════════════════════════════════════════════════ */
var TOPIC = (function () {
  var URL = 'https://wyvwycatgexpbugzkdfw.supabase.co/rest/v1/';
  var KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind5dnd5Y2F0Z2V4cGJ1Z3prZGZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0ODcwNTAsImV4cCI6MjA5MTA2MzA1MH0.msUPOUjd1iZwuG6SxFlhr-0xYPt6fqTUy5iOYnf8Z20';

  /* One GET with a 10 s timeout (same reason as supaRest: a hung fetch
     never rejects). Resolves to null on any failure, so a page shows its
     "could not load" line instead of breaking. */
  function get(table, params) {
    var qs = Object.keys(params || {}).map(function (k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
    }).join('&');
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var t = ctl ? setTimeout(function () { ctl.abort(); }, 10000) : null;
    return fetch(URL + table + (qs ? '?' + qs : ''), {
      headers: { apikey: KEY, Authorization: 'Bearer ' + KEY },
      signal: ctl ? ctl.signal : undefined
    }).then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; })
      .then(function (x) { if (t) clearTimeout(t); return x; });
  }

  /* A market_cache row's data, or null. */
  function cache(key) {
    return get('market_cache', { cache_key: 'eq.' + key, select: 'data,updated_at' })
      .then(function (r) { return r && r[0] ? { data: r[0].data, at: r[0].updated_at } : null; });
  }

  /* The board's coin list (CoinGecko rows), indexed by id and by symbol. */
  var STABLE = { tether: 1, 'usd-coin': 1, 'first-digital-usd': 1, dai: 1, 'ethena-usde': 1,
    'true-usd': 1, 'usd1-wlfi': 1, 'paypal-usd': 1, usds: 1, 'binance-usd': 1 };
  function coins() {
    return cache('cg_markets_all').then(function (r) {
      var list = r && Array.isArray(r.data) ? r.data : [];
      var byId = {}, bySym = {};
      list.forEach(function (c) {
        if (!c || !c.id || !c.symbol) return;
        c.stable = !!STABLE[c.id];
        byId[c.id] = c;
        var s = c.symbol.toUpperCase();
        if (!bySym[s] || (c.market_cap || 0) > (bySym[s].market_cap || 0)) bySym[s] = c;
      });
      return { list: list, byId: byId, bySym: bySym, at: r && r.at };
    });
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  /* $ amounts: $1.2B / $340M / $12K. Minus is a real minus sign. */
  function usd(v, opts) {
    if (v == null || isNaN(v)) return '—';
    var sign = v < 0 ? '−' : (opts && opts.plus && v > 0 ? '+' : '');
    var a = Math.abs(v), s;
    if (a >= 1e9) s = (a / 1e9).toFixed(a >= 1e10 ? 0 : 1) + 'B';
    else if (a >= 1e6) s = (a / 1e6).toFixed(a >= 1e8 ? 0 : 1) + 'M';
    else if (a >= 1e3) s = (a / 1e3).toFixed(0) + 'K';
    else s = a.toFixed(0);
    return sign + '$' + s;
  }
  /* ETF flows are stored in millions of dollars. */
  function usdM(m, opts) { return m == null ? '—' : usd(Number(m) * 1e6, opts); }
  function price(p) {
    if (p == null || isNaN(p)) return '—';
    var d = p >= 100 ? 0 : p >= 1 ? 2 : p >= 0.01 ? 4 : 6;
    return '$' + Number(p).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  function pct(v, d) {
    if (v == null || isNaN(v)) return '—';
    return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(d == null ? 1 : d) + '%';
  }

  var MON_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var MON_MK = ['јан', 'фев', 'мар', 'апр', 'мај', 'јун', 'јул', 'авг', 'сеп', 'окт', 'ное', 'дек'];
  /* '2026-10-12' or an ISO time → '12 Oct' (UTC, the day the data uses). */
  function day(s, lang) {
    if (!s) return '—';
    var d = new Date(String(s).length === 10 ? s + 'T00:00:00Z' : s);
    if (isNaN(d)) return '—';
    return d.getUTCDate() + ' ' + (lang === 'mk' ? MON_MK : MON_EN)[d.getUTCMonth()];
  }
  function isoDay(offsetDays) {
    return new Date(Date.now() + (offsetDays || 0) * 86400000).toISOString().slice(0, 10);
  }

  function boardLink(sym, root) { return (root || '') + 'board.html?coin=' + encodeURIComponent(sym); }

  function set(id, html) { var el = document.getElementById(id); if (el) el.innerHTML = html; }

  return { get: get, cache: cache, coins: coins, esc: esc, usd: usd, usdM: usdM, price: price,
           pct: pct, day: day, isoDay: isoDay, boardLink: boardLink, set: set };
})();
