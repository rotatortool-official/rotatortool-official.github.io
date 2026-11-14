/* ═══════════════════════════════════════════════════════════════════
   strength.js — the Strength analyser on the Coins tab (2026-11-14)

   Daniel: "a nice to have coin relative strength performance analyser".
   One question: is this coin stronger or weaker than the rest of the
   market, and is that changing?

   DISPLAY ONLY. Nothing here feeds the score, the zones, the alerts or
   the track record (the rule: nothing enters the score untested). It
   describes past prices; it is not a forecast and the wording says so.

   Where the numbers come from
   - binance_daily_klines (public read): the daily close of every coin on
     7 days only: the newest candle and 7, 14, 30, 37, 90, 97 days before
     it. About 2,200 small rows, read once the box scrolls into view and
     kept in localStorage for 3 hours (RS_CACHE).
   - For each coin: its move over 7, 30 and 90 days, and the same three
     moves as they stood one week ago.
   - Rank 0-100 per window = the share of coins that moved less. Stable
     coins and stocks are left out.
   - Strength = the average of the three ranks (7 + 30 when a coin has no
     90 days yet). "This week" = strength now minus strength a week ago.
   - "vs Bitcoin" and "vs the average coin" = the coin's move measured
     against Bitcoin's move and against the middle coin's move.
   - Size group: the coins in three equal groups by market cap; the rank
     among its own group, 30 days.
   - The line: the coin priced in Bitcoin over the stored ~6 months,
     read for one coin when it is picked (js/chart-kit.js draws the scale
     and the readout).
   ═══════════════════════════════════════════════════════════════════ */
var RS_OFFS = [0, 7, 14, 30, 37, 90, 97];
var RS_CACHE = 'rot_rs_v1', RS_CACHE_MS = 3 * 36e5;
var _rs = { asked: false, raw: null, by: null, list: null, n: 0, sel: null, lines: {}, fail: false, seen: false };

function _rsMk() { return typeof currentLang !== 'undefined' && currentLang === 'mk'; }
function _rsL() {
  return _rsMk() ? {
    hd: 'АНАЛИЗАТОР НА СИЛА',
    sub: 'Дали една монета е посилна или послаба од остатокот од пазарот и дали тоа се менува? Опис на минатите цени, не прогноза.',
    pick: 'Избери монета', ph: 'на пр. SOL', yours: 'Твои монети',
    of100: 'од 100', stronger: function (n) { return 'Посилна од ' + n + '% од монетите.'; },
    up: 'Добива сила оваа недела.', dn: 'Губи сила оваа недела.', flat: 'Без поголема промена оваа недела.',
    wk: 'оваа недела', win: 'Период', move: 'Промена', vsBtc: 'спроти BTC', vsAvg: 'спроти просекот', rank: 'Ранг',
    d7: '7 дена', d30: '30 дена', d90: '90 дена',
    size: function (g, r, n) { return 'Меѓу ' + n + ' монети со слична големина (' + g + '): ранг ' + r + ' од 100 за 30 дена.'; },
    big: 'големи', mid: 'средни', small: 'мали',
    line: function (s) { return s + ' изразена во Bitcoin, последните 6 месеци'; },
    lineRead: 'Кога линијата расте, монетата е посилна од Bitcoin. Кога паѓа, Bitcoin е посилен.',
    open: function (s) { return 'Отвори ' + s + ' ›'; },
    gain: 'Добиваат сила оваа недела', lose: 'Губат сила оваа недела',
    foot: function (n) { return 'Рангот ги споредува промените на цените на ' + n + ' монети на Binance, од дневните затворања. Опис, не сигнал.'; },
    wait: 'Се вчитуваат цените…', none: 'Цените не можат да се прочитаат сега. Обиди се подоцна.', nocoin: 'Нема доволно историја за оваа монета.',
    rotHd: 'Идеја за ротација за твоите монети', rotPro: 'Pro',
    rotLock: 'Pro ја споредува твојата најслаба монета со посилни монети со слична големина и ги покажува овде.',
    rotGet: 'Земи Pro', rotAdd: 'Додај ги монетите што ги држиш во „Мои монети“ за да ја видиш оваа споредба.',
    rotOk: function (s, n) { return 'Ниту една од твоите монети не е слаба сега: најслаба е ' + s + ' со сила ' + n + '.'; },
    rotWeak: function (s, n) { return 'Нашето читање: ' + s + ' е твојата најслаба монета (сила ' + n + ').'; },
    rotCand: 'Овие монети со слична големина се посилни и ја држат или ја зголемуваат силата:',
    rotNone: 'Во моментов нема посилна монета со слична големина што ја држи силата.',
    rotNfa: 'Читање на минатите цени, не финансиски совет. Посилна монета може да падне, а послаба да се врати.',
    start: 'почеток', now: 'сега', btcSelf: 'Bitcoin е мерката: линијата се црта за другите монети.'
  } : {
    hd: 'STRENGTH ANALYSER',
    sub: 'Is a coin stronger or weaker than the rest of the market, and is that changing? A description of past prices, not a forecast.',
    pick: 'Pick a coin', ph: 'e.g. SOL', yours: 'Your coins',
    of100: 'of 100', stronger: function (n) { return 'Stronger than ' + n + '% of coins.'; },
    up: 'Gaining strength this week.', dn: 'Losing strength this week.', flat: 'No big change this week.',
    wk: 'this week', win: 'Period', move: 'Move', vsBtc: 'vs BTC', vsAvg: 'vs avg coin', rank: 'Rank',
    d7: '7 days', d30: '30 days', d90: '90 days',
    size: function (g, r, n) { return 'Among ' + n + ' coins of similar size (' + g + '): rank ' + r + ' of 100 over 30 days.'; },
    big: 'big', mid: 'mid-size', small: 'small',
    line: function (s) { return s + ' priced in Bitcoin, last 6 months'; },
    lineRead: 'When the line rises, the coin is stronger than Bitcoin. When it falls, Bitcoin is stronger.',
    open: function (s) { return 'Open ' + s + ' ›'; },
    gain: 'Gaining strength this week', lose: 'Losing strength this week',
    foot: function (n) { return 'Ranks compare the price moves of ' + n + ' coins on Binance, from daily closes. A description, not a signal.'; },
    wait: 'Loading prices…', none: 'Prices cannot be read right now. Try again later.', nocoin: 'Not enough history for this coin yet.',
    rotHd: 'Rotation idea for your coins', rotPro: 'Pro',
    rotLock: 'Pro compares your weakest coin with stronger coins of similar size and shows them here.',
    rotGet: 'Get Pro', rotAdd: 'Add the coins you hold in My holdings to see this comparison.',
    rotOk: function (s, n) { return 'None of your coins is weak right now: the weakest is ' + s + ' at strength ' + n + '.'; },
    rotWeak: function (s, n) { return 'Our reading: ' + s + ' is your weakest coin (strength ' + n + ').'; },
    rotCand: 'These coins of similar size are stronger and holding or gaining strength:',
    rotNone: 'Right now no stronger coin of similar size is holding its strength.',
    rotNfa: 'A reading of past prices, not financial advice. A strong coin can fall and a weak one can recover.',
    start: 'start', now: 'now', btcSelf: 'Bitcoin is the yardstick: the line is drawn for the other coins.'
  };
}
function _rsEsc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function _rsPct(v) { return v == null || !isFinite(v) ? '—' : (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(Math.abs(v) >= 100 ? 0 : 1) + '%'; }
function _rsCls(v) { return v == null || !isFinite(v) ? '' : v >= 0 ? 'up' : 'dn'; }
function _rsRel(a, b) { return a == null || b == null ? null : ((1 + a / 100) / (1 + b / 100) - 1) * 100; }
function _rsMedian(a) { a = a.slice().sort(function (x, y) { return x - y; }); var n = a.length; return n ? (n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2) : null; }

/* ── Reading the seven days ── */
function _rsLoad() {
  if (_rs.asked || typeof supaRest !== 'function') return;
  _rs.asked = true;
  try {
    var o = JSON.parse(localStorage.getItem(RS_CACHE) || 'null');
    if (o && o.v === 1 && o.rows && Date.now() - o.at < RS_CACHE_MS) { _rs.raw = o.rows; renderStrength(); return; }
  } catch (e) {}
  supaRest('binance_daily_klines', 'GET', { base_asset: 'eq.BTC', select: 'open_time', order: 'open_time.desc', limit: '1' })
    .then(function (r) {
      var d0 = Date.parse(r && r[0] && r[0].open_time); if (!d0) throw new Error('no newest day');
      var days = RS_OFFS.map(function (k) { return d0 - k * 864e5; });
      return supaRestAll('binance_daily_klines', {
        select: 'base_asset,open_time,close', order: 'base_asset.asc,open_time.asc',
        open_time: 'in.(' + days.map(function (d) { return '"' + new Date(d).toISOString().slice(0, 19) + 'Z"'; }).join(',') + ')'
      }).then(function (rows) {
        var out = {};
        (rows || []).forEach(function (x) {
          var i = days.indexOf(Date.parse(x.open_time)), v = parseFloat(x.close);
          if (i < 0 || !(v > 0)) return;
          (out[x.base_asset] = out[x.base_asset] || [null, null, null, null, null, null, null])[i] = v;
        });
        if (!out.BTC) throw new Error('no rows');
        _rs.raw = out;
        try { localStorage.setItem(RS_CACHE, JSON.stringify({ v: 1, at: Date.now(), rows: out })); } catch (e) {}
        renderStrength();
      });
    })
    .catch(function () { _rs.fail = true; renderStrength(); });
}

/* ── From closes to ranks ── */
function _rsCompute() {
  if (!_rs.raw || typeof coins === 'undefined' || !coins || !coins.length) return false;
  var ret = function (a, b) { return a > 0 && b > 0 ? (a / b - 1) * 100 : null; };
  var list = [];
  coins.forEach(function (c) {
    var k = _rs.raw[c.sym];
    if (!k || c.isStable || c.isStock || !k[0]) return;
    var o = { c: c, sym: c.sym, r7: ret(k[0], k[1]), r30: ret(k[0], k[3]), r90: ret(k[0], k[5]), q7: ret(k[1], k[2]), q30: ret(k[1], k[4]), q90: ret(k[1], k[6]) };
    if (o.r7 == null || o.r30 == null) return;
    list.push(o);
  });
  if (list.length < 20) return false;
  /* Rank 0-100: the share of the other coins that moved less. */
  ['r7', 'r30', 'r90', 'q7', 'q30', 'q90'].forEach(function (key) {
    var have = list.filter(function (o) { return o[key] != null; }).sort(function (a, b) { return a[key] - b[key]; });
    have.forEach(function (o, i) { o['k' + key] = have.length > 1 ? Math.round(i / (have.length - 1) * 100) : 50; });
  });
  var avg = function (a) { a = a.filter(function (v) { return v != null; }); return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : null; };
  list.forEach(function (o) {
    o.s = Math.round(avg([o.kr7, o.kr30, o.kr90]));
    var p = (o.kq7 != null && o.kq30 != null) ? avg([o.kq7, o.kq30, o.kq90]) : null;
    o.prev = p == null ? null : Math.round(p);
    o.ch = o.prev == null ? null : o.s - o.prev;
  });
  /* Three equal size groups by market cap; rank inside the group, 30 days. */
  var bySize = list.slice().sort(function (a, b) { return (b.c.mcap || 0) - (a.c.mcap || 0); }), third = Math.ceil(bySize.length / 3);
  ['big', 'mid', 'small'].forEach(function (g, gi) {
    var grp = bySize.slice(gi * third, (gi + 1) * third).sort(function (a, b) { return a.r30 - b.r30; });
    grp.forEach(function (o, i) { o.grp = g; o.grpN = grp.length; o.grpRank = grp.length > 1 ? Math.round(i / (grp.length - 1) * 100) : 50; });
  });
  var med = {}; ['r7', 'r30', 'r90'].forEach(function (key) { med[key] = _rsMedian(list.filter(function (o) { return o[key] != null; }).map(function (o) { return o[key]; })); });
  _rs.med = med; _rs.list = list; _rs.n = list.length; _rs.by = {};
  list.forEach(function (o) { _rs.by[o.sym] = o; });
  return true;
}

/* ── The line: one coin priced in Bitcoin ── */
function _rsLoadLine(sym) {
  if (sym === 'BTC' || _rs.lines[sym]) return;
  _rs.lines[sym] = 'wait';
  var q = function (s) { return supaRest('binance_daily_klines', 'GET', { base_asset: 'eq.' + s, select: 'open_time,close', order: 'open_time.asc', limit: '200' }); };
  Promise.all([q(sym), _rs.btcLine ? Promise.resolve(_rs.btcLine) : q('BTC')]).then(function (r) {
    _rs.btcLine = r[1] || [];
    var b = {}; _rs.btcLine.forEach(function (x) { b[x.open_time] = parseFloat(x.close); });
    var pts = (r[0] || []).map(function (x) { var v = parseFloat(x.close) / b[x.open_time]; return isFinite(v) && v > 0 ? { d: x.open_time.slice(0, 10), v: v } : null; }).filter(Boolean);
    _rs.lines[sym] = pts.length >= 14 ? pts : 'none';
    if (_rs.sel === sym) _rsDrawLine();
  }).catch(function () { _rs.lines[sym] = 'none'; if (_rs.sel === sym) _rsDrawLine(); });
}
function _rsDay(iso) {
  var m = _rsMk() ? ['јан', 'фев', 'мар', 'апр', 'мај', 'јун', 'јул', 'авг', 'сеп', 'окт', 'ное', 'дек'] : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return (+iso.slice(8, 10)) + ' ' + m[+iso.slice(5, 7) - 1];
}
function _rsDrawLine() {
  var host = document.getElementById('rs-line'), L = _rsL(), sym = _rs.sel; if (!host) return;
  if (sym === 'BTC') { host.innerHTML = '<p class="rs-note">' + L.btcSelf + '</p>'; return; }
  var pts = _rs.lines[sym];
  if (!pts || pts === 'wait') { host.innerHTML = '<div class="rs-line-wait skel"></div>'; return; }
  if (pts === 'none') { host.innerHTML = ''; return; }
  /* Shown as % change of the coin/BTC ratio since the first stored day. */
  var vals = pts.map(function (p) { return (p.v / pts[0].v - 1) * 100; });
  var W = 300, H = 120, lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals), pad = (hi - lo) * 0.08 || 1;
  var X = function (i) { return (i / (vals.length - 1)) * W; }, Y = function (v) { return H - ((v - lo + pad) / (hi - lo + 2 * pad)) * H; };
  var last = vals[vals.length - 1], up = last >= 0;
  var p = vals.map(function (v, i) { return X(i).toFixed(1) + ',' + Y(v).toFixed(1); }).join(' ');
  var svg = '<svg class="btcg-chart rs-chart" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img" aria-label="' + _rsEsc(L.line(sym)) + '">'
    + '<polygon points="0,' + H + ' ' + p + ' ' + W + ',' + H + '" class="btcg-fill ' + (up ? 'up' : 'dn') + '"/>'
    + '<polyline points="' + p + '" class="btcg-line ' + (up ? 'up' : 'dn') + '" vector-effect="non-scaling-stroke"/></svg>';
  if (typeof ckWrap === 'function') {
    svg = ckWrap(svg, { key: 'rs-' + sym, x: pts.map(function (q) { return _rsDay(q.d); }), series: [{ n: sym + '/BTC', f: vals.map(_rsPct) }],
      scale: [{ y: Y(hi) / H, t: _rsPct(hi) }, { y: Y(lo) / H, t: _rsPct(lo) }], last: { y: Y(last) / H, t: _rsPct(last), cls: up ? 'up' : 'dn' } });
  }
  host.innerHTML = '<div class="bf-k">' + _rsEsc(L.line(sym)) + '</div><div class="fc-stage rs-stage">' + svg + '</div>'
    + '<div class="etf-axis"><span>' + _rsDay(pts[0].d) + '</span><span></span><span>' + L.now + '</span></div>'
    + '<p class="rs-note">' + L.lineRead + '</p>';
}

/* ── Drawing ── */
function _rsIco(c) { return c.image ? '<img src="' + _rsEsc(c.image) + '" alt="" width="18" height="18" loading="lazy" onerror="this.style.display=\'none\'">' : ''; }
function _rsBar(n) { return '<span class="rs-bar"><i class="' + (n >= 65 ? 'up' : n < 35 ? 'dn' : 'mid') + '" style="width:' + Math.max(3, n) + '%"></i></span>'; }
function _rsChTag(ch) {
  if (ch == null) return '';
  return '<span class="rs-ch ' + (ch > 0 ? 'up' : ch < 0 ? 'dn' : '') + '">' + (ch > 0 ? '▲ ' : ch < 0 ? '▼ ' : '') + Math.abs(ch) + '</span>';
}
function rsPick(sym) {
  sym = String(sym || '').trim().toUpperCase();
  if (!_rs.by || !_rs.by[sym]) return false;
  _rs.sel = sym;
  try { localStorage.setItem('rot_rs_sel', sym); } catch (e) {}
  _rsDrawCoin();
  return true;
}
function _rsDefault() {
  var saved = null; try { saved = localStorage.getItem('rot_rs_sel'); } catch (e) {}
  if (saved && _rs.by[saved]) return saved;
  var mine = _rsMine();
  return mine.length ? mine[0] : (_rs.by.ETH ? 'ETH' : _rs.list[0].sym);
}
/* The visitor's own coins first: what they hold, then what they watch. */
function _rsMine() {
  var out = [], add = function (s) { if (s && _rs.by[s] && out.indexOf(s) < 0) out.push(s); };
  var symOf = function (x) {
    if (!x) return null;
    if (typeof x === 'string') { var c = coins.find(function (k) { return k.id === x || k.sym === x; }); return c ? c.sym : null; }
    if (x.sym) return x.sym;
    var c2 = coins.find(function (k) { return k.id === (x.id || x.coinId); }); return c2 ? c2.sym : null;
  };
  try { if (typeof holdings !== 'undefined' && holdings) (Array.isArray(holdings) ? holdings : Object.keys(holdings)).forEach(function (h) { add(symOf(h)); }); } catch (e) {}
  try { if (typeof watchlist !== 'undefined' && watchlist) (Array.isArray(watchlist) ? watchlist : Object.keys(watchlist)).forEach(function (h) { add(symOf(h)); }); } catch (e) {}
  return out.slice(0, 6);
}
function _rsDrawCoin() {
  var host = document.getElementById('rs-coin'), L = _rsL(), o = _rs.by && _rs.by[_rs.sel]; if (!host) return;
  if (!o) { host.innerHTML = '<p class="rs-note">' + L.nocoin + '</p>'; return; }
  var b = _rs.by.BTC, m = _rs.med;
  var row = function (lab, k) {
    var v = o[k], rk = o['k' + k];
    /* divs, not a table: the page's phone rules turn every table into stacked cards */
    return '<div class="rs-tr"><span class="rs-tp">' + lab + '</span><span class="' + _rsCls(v) + '">' + _rsPct(v) + '</span>'
      + '<span class="' + (o.sym === 'BTC' ? '' : _rsCls(_rsRel(v, b && b[k]))) + '">' + (o.sym === 'BTC' ? '—' : _rsPct(_rsRel(v, b && b[k]))) + '</span>'
      + '<span class="' + _rsCls(_rsRel(v, m[k])) + '">' + _rsPct(_rsRel(v, m[k])) + '</span>'
      + '<span class="rs-rk">' + (rk == null ? '—' : '<b>' + rk + '</b>' + _rsBar(rk)) + '</span></div>';
  };
  var mood = o.ch == null ? '' : o.ch >= 5 ? L.up : o.ch <= -5 ? L.dn : L.flat;
  host.innerHTML = '<div class="rs-head">'
    + '<div class="rs-name">' + _rsIco(o.c) + '<b>' + _rsEsc(o.sym) + '</b><span>' + _rsEsc(o.c.name || '') + '</span></div>'
    + '<div class="rs-big"><b class="' + (o.s >= 65 ? 'up' : o.s < 35 ? 'dn' : '') + '">' + o.s + '</b><span>' + L.of100 + '</span>' + (o.ch == null ? '' : _rsChTag(o.ch) + '<em>' + L.wk + '</em>') + '</div>'
    + '<p class="rs-say">' + L.stronger(o.s) + ' ' + mood + '</p></div>'
    + '<div class="rs-t"><div class="rs-tr rs-th"><span>' + L.win + '</span><span>' + L.move + '</span><span>' + L.vsBtc + '</span><span>' + L.vsAvg + '</span><span>' + L.rank + '</span></div>'
    + row(L.d7, 'r7') + row(L.d30, 'r30') + row(L.d90, 'r90') + '</div>'
    + (o.grp ? '<p class="rs-note">' + L.size(L[o.grp], '<b>' + o.grpRank + '</b>', o.grpN) + '</p>' : '')
    + '<div id="rs-line"></div>'
    + (typeof openTileDetail === 'function' ? '<button type="button" class="rs-open" onclick="openTileDetail(\'' + _rsEsc(o.c.id) + '\',event)">' + _rsEsc(L.open(o.sym)) + '</button>' : '');
  var inp = document.getElementById('rs-inp'); if (inp && document.activeElement !== inp) inp.value = o.sym;
  document.querySelectorAll('#rs-box .rs-chip').forEach(function (x) { x.classList.toggle('on', x.getAttribute('data-s') === o.sym); });
  _rsDrawLine(); _rsLoadLine(o.sym);
}
function _rsRows(list) {
  return list.map(function (o) {
    return '<button type="button" class="rs-row" onclick="rsPick(\'' + _rsEsc(o.sym) + '\');_rsToTop()">'
      + '<span class="rs-rn">' + _rsIco(o.c) + '<b>' + _rsEsc(o.sym) + '</b></span>'
      + '<span class="rs-rv">' + o.prev + ' → <b>' + o.s + '</b></span>' + _rsChTag(o.ch) + '</button>';
  }).join('');
}
function _rsToTop() {
  var el = document.getElementById('rs-coin'); if (!el) return;
  var r = el.getBoundingClientRect();
  if (r.top < 60 || r.top > window.innerHeight * 0.6) { if (typeof rotScrollToEl === 'function') rotScrollToEl(document.getElementById('rs-box')); else el.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
}
/* ── Pro: a rotation idea from the visitor's own holdings ──
   Daniel, 2026-11-14: "should suggest rotation opportunity for pro users
   in the section, based on our reading, not financial advice". The
   weakest coin they hold, beside up to three coins of the same size group
   that are strong (70+) and not losing strength, which they do not hold.
   Free visitors see what it is and the way to Pro. */
function _rsRotHtml() {
  var L = _rsL(), hd = '<div class="rs-rot-hd"><span>' + L.rotHd + '</span><i>' + L.rotPro + '</i></div>';
  var pro = typeof isPro !== 'undefined' && isPro;
  if (!pro) return '<div class="rs-rot rs-rot-lock">' + hd + '<p>' + L.rotLock + '</p>'
    + (typeof openPro === 'function' ? '<button type="button" class="rs-rot-btn" onclick="openPro()">' + L.rotGet + '</button>' : '') + '</div>';
  var held = [];
  try { (holdings || []).forEach(function (h) { var o = h && _rs.by[h.sym]; if (o && held.indexOf(o) < 0) held.push(o); }); } catch (e) {}
  if (!held.length) return '<div class="rs-rot">' + hd + '<p>' + L.rotAdd + '</p></div>';
  var weak = held.slice().sort(function (a, b) { return a.s - b.s; })[0];
  if (weak.s >= 50) return '<div class="rs-rot">' + hd + '<p>' + L.rotOk('<b>' + _rsEsc(weak.sym) + '</b>', weak.s) + '</p></div>';
  var cand = _rs.list.filter(function (o) { return o.grp === weak.grp && o.s >= 70 && o.ch != null && o.ch >= 0 && held.indexOf(o) < 0; })
    .sort(function (a, b) { return b.s - a.s || b.ch - a.ch; }).slice(0, 3);
  return '<div class="rs-rot">' + hd
    + '<p>' + L.rotWeak('<b>' + _rsEsc(weak.sym) + '</b>', weak.s) + ' ' + (cand.length ? L.rotCand : L.rotNone) + '</p>'
    + (cand.length ? '<div class="rs-rot-rows">' + _rsRows(cand) + '</div>' : '')
    + '<p class="rs-rot-nfa">' + L.rotNfa + '</p></div>';
}
function renderStrength() {
  var host = document.getElementById('rs-box'), L = _rsL(); if (!host) return;
  var head = '<div class="tw-hd"><span class="rs-hd">' + L.hd + '</span></div><p class="tw-sub">' + L.sub + '</p>';
  if (!_rs.seen) { if (!host.firstChild) host.innerHTML = head + '<div class="rs-wait skel"></div>'; return; }   /* not on screen yet: read nothing */
  if (_rs.fail) { host.innerHTML = head + '<p class="rs-note">' + L.none + '</p>'; return; }
  if (!_rs.raw) { host.innerHTML = head + '<div class="rs-wait skel"></div>'; _rsLoad(); return; }
  if (!_rsCompute()) { host.innerHTML = head + '<div class="rs-wait skel"></div>'; return; }   /* coins still loading: signals.js calls again */
  if (!_rs.sel || !_rs.by[_rs.sel]) _rs.sel = _rsDefault();
  var typing = document.activeElement && document.activeElement.id === 'rs-inp';
  if (typing && document.getElementById('rs-coin')) return;   /* a data refresh must not take the box from under the keyboard */
  var mine = _rsMine(), chips = mine.length ? mine : ['BTC', 'ETH', 'SOL', 'BNB', 'XRP'].filter(function (s) { return _rs.by[s]; });
  var moved = _rs.list.filter(function (o) { return o.ch != null; });
  var gain = moved.slice().sort(function (a, b) { return b.ch - a.ch; }).slice(0, 6);
  var lose = moved.slice().sort(function (a, b) { return a.ch - b.ch; }).slice(0, 6);
  host.innerHTML = head
    + '<div class="rs-pick"><label for="rs-inp">' + L.pick + '</label>'
    + '<input id="rs-inp" class="rs-inp" list="rs-dl" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="' + L.ph + '" oninput="rsPick(this.value)" onchange="if(!rsPick(this.value))this.value=_rs.sel" onfocus="this.select()">'
    + '<datalist id="rs-dl">' + _rs.list.slice().sort(function (a, b) { return a.sym < b.sym ? -1 : 1; }).map(function (o) { return '<option value="' + _rsEsc(o.sym) + '">' + _rsEsc(o.c.name || '') + '</option>'; }).join('') + '</datalist>'
    + '<span class="rs-chips">' + chips.map(function (s) { return '<button type="button" class="rs-chip" data-s="' + s + '" onclick="rsPick(\'' + s + '\')">' + s + '</button>'; }).join('') + '</span></div>'
    + '<div class="rs-grid"><div class="rs-coin" id="rs-coin"></div>'
    + '<div class="rs-lists"><div><div class="bf-k rs-up">▲ ' + L.gain + '</div>' + _rsRows(gain) + '</div>'
    + '<div><div class="bf-k rs-dn">▼ ' + L.lose + '</div>' + _rsRows(lose) + '</div></div></div>'
    + _rsRotHtml()
    + '<p class="rs-foot">' + L.foot(_rs.n) + '</p>';
  _rsDrawCoin();
}
/* Read the prices only when the box is about to be seen (saves the
   database for visitors who never open the Coins tab). */
(function () {
  function arm() {
    var host = document.getElementById('rs-box'); if (!host) return;
    renderStrength();
    if (!('IntersectionObserver' in window)) { _rs.seen = true; renderStrength(); return; }
    var io = new IntersectionObserver(function (es) {
      if (es.some(function (e) { return e.isIntersecting; })) { io.disconnect(); _rs.seen = true; renderStrength(); }
    }, { rootMargin: '300px' });
    io.observe(host);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arm); else arm();
})();
