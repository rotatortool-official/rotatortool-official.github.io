/* ══════════════════════════════════════════════════════════════════
   paper-trades.js — "what if I had bought when the sign appeared"
   (promptove/76, 2026-09-27)

   1. SINCE THE SIGN (automatic, for everyone)
      turn_signs_since() on the server returns every turn sign of the
      last 30 days with the coin's return since the close of the sign's
      day and the market median over the same closes — the same measure
      as the live tests. Each sign in the coin window, the turn-sign list
      and the alerts shows it: winners and losers alike, because a tool
      that only showed the good ones would be selling, not measuring.

   2. PAPER TRADES (your own "what if")
      "Track from this sign" (inside an open sign; "Track this coin" when a
      coin has no sign) adds a PAPER tile: the coin, the sign, its
      date and the entry price (the sign day's close when the sign is
      dated, today's price otherwise). Paper tiles live in this browser
      only (localStorage 'rot_paper'), sit apart from real holdings, and
      never feed the Portfolio Signal or the daily held-coin record.
      Free: 2 paper trades. Pro: 20.
══════════════════════════════════════════════════════════════════ */

var _signSince = {};          /* SYM → [rows from turn_signs_since] */
var _signSinceLast = null;    /* last completed close the rows run to */
var PAPER_KEY = 'rot_paper';
var PAPER_FREE = 2, PAPER_PRO = 20;

async function loadSignSince() {
  if (typeof SUPA_URL === 'undefined') return;
  try {
    var r = await fetch(SUPA_URL + '/rest/v1/rpc/turn_signs_since', {
      method: 'POST',
      headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_days: 30 })
    });
    if (!r.ok) return;
    var rows = await r.json();
    var map = {};
    (rows || []).forEach(function (x) {
      (map[x.base_asset] = map[x.base_asset] || []).push(x);
      if (x.last_date) _signSinceLast = x.last_date;
    });
    _signSince = map;
  } catch (e) { console.warn('[since] read skipped:', e.message); }
}

/* Which detector event each sign in the coin window comes from. */
var _SIGN_EVENT = {
  'Quick RSI bounce': 'rsi_reclaim', 'Slow RSI bounce': 'rsi_reclaim', 'RSI back above 30': 'rsi_reclaim',
  'Golden cross': 'golden_cross', 'Death cross': 'death_cross',
  'Running hot': 'rsi_overbought', 'Overbought': 'rsi_overbought', 'Oversold': 'rsi_oversold',
  'Crowded longs': 'futures_long_crowded', 'Crowded shorts': 'futures_short_crowded',
  'Hot run: higher pullback risk': 'hot_run'
};

/* The newest event of that type for the coin, within 30 days. */
function _sinceFor(sym, title) {
  var type = _SIGN_EVENT[title];
  var rows = type && _signSince[sym];
  if (!rows) return null;
  for (var i = 0; i < rows.length; i++) if (rows[i].event_type === type) return rows[i];
  return null;
}

function _sinceNum(v) { var n = Number(v); return (v == null || !isFinite(n)) ? null : n; }
function _sincePct(v) { var n = _sinceNum(v); return n == null ? '—' : (n >= 0 ? '+' : '') + n.toFixed(1) + '%'; }
function _sinceDay(d) {
  if (!d) return '';
  var t = new Date(String(d).slice(0, 10) + 'T00:00:00Z');
  return t.getUTCDate() + ' ' + ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][t.getUTCMonth()];
}

/* The short tag on a sign row: points above or below the market. */
function sinceTag(row) {
  if (!row) return '';
  var ex = _sinceNum(row.excess);
  if (ex == null) return '<span class="td-since new" title="The sign is from the latest close; its result starts tomorrow.">new</span>';
  return '<span class="td-since ' + (ex >= 0 ? 'up' : 'dn') + '" title="' + _esc(sinceSentence(row)) + '">'
    + (ex >= 0 ? '+' : '') + ex.toFixed(1) + ' vs mkt</span>';
}

/* The full sentence, for the open row and the tooltips. */
function sinceSentence(row) {
  if (!row) return '';
  if (_sinceNum(row.ret) == null) return 'Since ' + _sinceDay(row.event_date) + ': too early, the result starts after the next daily close.';
  return 'Since the ' + _sinceDay(row.event_date) + ' close: ' + _sincePct(row.ret) + ', market median ' + _sincePct(row.mkt)
    + ' (' + (Number(row.excess) >= 0 ? '+' : '') + Number(row.excess).toFixed(1) + ' points), ' + row.days + (Number(row.days) === 1 ? ' day' : ' days') + '.';
}

/* ── Paper trades ─────────────────────────────────────────────── */
function _paperLoad() { try { return JSON.parse(localStorage.getItem(PAPER_KEY) || '[]') || []; } catch (e) { return []; } }
function _paperSave(a) { try { localStorage.setItem(PAPER_KEY, JSON.stringify(a)); } catch (e) {} }
function paperList() { return _paperLoad(); }
function isPaperCoin(c) { return !!c && _paperLoad().some(function (p) { return p.id === c.id; }); }

function addPaperTrade(coinId, sign, opts) {
  var c = (typeof coins !== 'undefined') && coins.find(function (x) { return x.id === coinId; });
  if (!c) return;
  var list = _paperLoad();
  var limit = isPro ? PAPER_PRO : PAPER_FREE;
  if (list.length >= limit) { if (!isPro) openPro(); else alert('Paper trade limit reached (' + PAPER_PRO + ').'); return; }
  /* opts (from "Track from now"): { entry, date } typed by the user.
     Without opts the entry is the sign day's close, or today's price. */
  var row = opts ? null : _sinceFor(c.sym, sign);
  var entry = opts && opts.entry > 0 ? Number(opts.entry)
    : row && _sinceNum(row.entry) != null ? Number(row.entry) : Number(c.price);
  var today = new Date().toISOString().slice(0, 10);
  var date = opts && /^\d{4}-\d{2}-\d{2}$/.test(opts.date || '') && opts.date <= today ? opts.date
    : row ? String(row.event_date).slice(0, 10) : today;
  var key = c.id + '|' + sign + '|' + date + (opts ? '|' + entry : '');
  if (list.some(function (p) { return p.key === key; })) { _paperToast(opts ? 'Already tracking this entry.' : 'Already tracking this sign.'); return; }
  list.push({ key: key, id: c.id, sym: c.sym, sign: sign || 'Manual', date: date, entry: entry, dated: !!row, manual: !!opts, added: new Date().toISOString() });
  _paperSave(list);
  renderPaperTrades();
  if (typeof renderCoinAlerts === 'function') renderCoinAlerts();
  _paperToast(c.sym + ' added as a paper trade from ' + _sinceDay(date) + '.');
  if (typeof supaCountFeature === 'function') supaCountFeature('paper_trade');
}

/* ── "Track from now" (any coin, promptove/77) ────────────────────
   The block in the coin window: a button that opens a two-field form,
   entry price (today's price to start) and start date (today to start).
   Changing either records "Your entry"; leaving both is "From now".
   This is how someone who already follows a coin by hand, at a price
   they noted earlier, carries it over. */
function paperFormHtml(c) {
  if (!c || c.isStable || !(Number(c.price) > 0)) return '';
  var today = new Date().toISOString().slice(0, 10);
  var price = Number(c.price);
  var tracked = _paperLoad().filter(function (p) { return p.id === c.id; }).length;
  /* Shown only where there is no sign to track from: a coin with no turn
     sign, and stocks (Daniel, 2026-10-04). A coin with signs is tracked
     from inside the sign, so nothing is offered twice. */
  return '<div class="td-paper">'
    + '<button type="button" class="td-track" data-coin="' + _esc(c.id) + '" onclick="_paperToggle(this)">📌 Track this coin</button>'
    + (tracked ? '<span class="td-paper-note">' + tracked + ' paper ' + (tracked === 1 ? 'trade' : 'trades') + ' on this coin</span>' : '')
    + '<div class="td-paper-form" hidden>'
    +   '<label><span>Entry price ($)</span><input type="number" step="any" min="0" value="' + price + '" data-now="' + price + '"></label>'
    +   '<label><span>From</span><input type="date" value="' + today + '" max="' + today + '"></label>'
    +   '<button type="button" class="td-paper-go" data-coin="' + _esc(c.id) + '" onclick="_paperFromForm(this)">Track</button>'
    + '</div></div>';
}

function _paperToggle(btn) {
  var f = btn.parentElement.querySelector('.td-paper-form');
  if (f) f.hidden = !f.hidden;
}

function _paperFromForm(btn) {
  var form = btn.parentElement, inputs = form.querySelectorAll('input');
  var entry = parseFloat(inputs[0].value), now = parseFloat(inputs[0].getAttribute('data-now'));
  var date = inputs[1].value, today = new Date().toISOString().slice(0, 10);
  if (!(entry > 0)) { _paperToast('Enter an entry price above zero.'); return; }
  var own = Math.abs(entry - now) > 1e-12 || (date && date !== today);
  addPaperTrade(btn.getAttribute('data-coin'), own ? 'Your entry' : 'From now', { entry: entry, date: date || today });
  form.hidden = true;
}

function removePaperTrade(key) {
  _paperSave(_paperLoad().filter(function (p) { return p.key !== key; }));
  renderPaperTrades();
  if (typeof renderCoinAlerts === 'function') renderCoinAlerts();
}

function _paperToast(msg) {
  var t = document.createElement('div');
  t.className = 'paper-toast'; t.textContent = typeof mkTranslate === 'function' && currentLang === 'mk' ? mkTranslate(msg) : msg;
  document.body.appendChild(t);
  setTimeout(function () { t.classList.add('out'); }, 2200);
  setTimeout(function () { t.remove(); }, 2700);
}

function renderPaperTrades() {
  var host = document.getElementById('paper-trades');
  if (!host) return;
  var list = _paperLoad();
  if (!list.length) {
    host.innerHTML = '<div class="paper-hd"><span>PAPER TRADES</span><span class="paper-n">0/' + (isPro ? PAPER_PRO : PAPER_FREE) + '</span></div>'
      + '<div class="paper-empty">Open a coin, expand a turn sign and tap “Track from this sign” to see how it would have done if you had bought then. Paper trades never count as holdings.</div>';
    return;
  }
  host.innerHTML = '<div class="paper-hd"><span>PAPER TRADES</span><span class="paper-n">' + list.length + '/' + (isPro ? PAPER_PRO : PAPER_FREE) + '</span></div>'
    + '<div class="paper-grid">' + list.map(function (p) {
      var c = (typeof coins !== 'undefined') && coins.find(function (x) { return x.id === p.id; });
      var now = c ? Number(c.price) : null;
      var ret = now && p.entry ? (now / p.entry - 1) * 100 : null;
      var days = Math.max(0, Math.floor((Date.now() - Date.parse(p.date + 'T00:00:00Z')) / 86400000));
      return '<div class="paper-tile" onclick="openTileDetail(\'' + p.id + '\', event)">'
        + '<div class="paper-top"><span class="paper-sym">' + _esc(p.sym) + '</span><span class="paper-badge">PAPER</span>'
        + '<button class="tile-rm" title="Remove paper trade" onclick="event.stopPropagation();removePaperTrade(\'' + p.key.replace(/'/g, "\\'") + '\')">×</button></div>'
        + '<div class="paper-sign">' + _esc(p.sign) + ' · ' + _sinceDay(p.date) + '</div>'
        + '<div class="paper-ret ' + (ret == null ? '' : ret >= 0 ? 'up' : 'dn') + '">' + (ret == null ? '—' : (ret >= 0 ? '+' : '') + ret.toFixed(1) + '%') + '</div>'
        + '<div class="paper-sub">from ' + (p.entry ? '$' + Number(p.entry).toPrecision(4) : '—') + ' · ' + days + (days === 1 ? ' day' : ' days') + '</div>'
        + '</div>';
    }).join('') + '</div>';
}
