/* ROTATOR - proprietary software. Copyright (c) 2026 ROTATOR. All rights reserved.
   See LICENSE.txt. This code is public only so the site can run in your browser;
   it is not open source and may not be copied, modified or reused. */
/* ══════════════════════════════════════════════════════════════════
   LIQUIDATIONS (Daniel, 2026-10-14: "we need to make that section
   interactive where users can open modals and share data on social
   networks"; Binance free data only, "we cant pay for 10 api
   subscriptions").

   Data: liquidations_hourly, filled every minute by the edge function
   sync-liquidations from Binance's public liquidation stream. The site
   reads two functions: liquidations_summary(p_hours) for the heatmap and
   totals, liquidations_coin(p_symbol, p_hours) for a coin's window.

   The numbers are a LOWER BOUND for Binance alone (the stream sends at
   most one liquidation per coin per second, and a few seconds a minute
   are not heard), so every total says "at least" and "Binance".

   Colours: red = mostly LONGS were forced out (the price fell on them),
   green = mostly SHORTS (the price rose on them).
══════════════════════════════════════════════════════════════════ */
var _liq = { hours: 24, rows: null, at: 0, loading: false, coin: null, coinRows: null };
var _LIQ_WINDOWS = [1, 4, 12, 24];
/* Collection started 14 Oct 2026, 17:43 UTC. Until 72 hours of data exist
   the section and the coin window say so (Daniel, 2026-10-14: "add those
   line first 72hours"); after that the notes disappear by themselves. */
var _LIQ_START = Date.UTC(2026, 9, 14, 17, 43);
function _liqYoung() { return Date.now() < _LIQ_START + 72 * 36e5; }

function _liqMk() { return typeof currentLang !== 'undefined' && currentLang === 'mk'; }
function _liqL() {
  return _liqMk() ? {
    title: 'Ликвидации', win: function (h) { return h + 'ч'; },
    total: 'Ликвидирано', longs: 'Лонг', shorts: 'Шорт', coins: function (n) { return n + ' монети'; },
    biggest: 'Најголем налог', since: function (t) { return 'од ' + t + ' UTC'; },
    atLeast: 'најмалку', other: 'Останати', none: 'Уште нема ликвидации во овој период. Податоците се собираат секоја минута од 14 октомври.',
    loading: 'Се вчитува…', legendL: 'најмногу лонг', legendS: 'најмногу шорт',
    read: 'Ликвидација е кога берзата насилно затвора позиција со позајмени пари, затоа што цената тргнала против неа. Црвено: најмногу биле избришани лонг позиции (цената паднала). Зелено: шорт позиции (цената пораснала).',
    src: 'Извор: јавниот тек на ликвидации на Binance фјучерси. Само Binance, и најмалку толку: тековот праќа најмногу една ликвидација по монета во секунда.',
    coinTitle: function (s) { return s + ': ликвидации'; }, h72: 'Последните 72 часа, по час', open: 'Отвори ја монетата',
    up: 'шорт избришани', dn: 'лонг избришани', at: 'по', hour: 'Час', share: 'Сподели',
    young: 'Собираме од 14 октомври, 17:43 UTC. Секој час се додава во бројките; приказот за 24ч е полн од 15 октомври, 18:00 UTC.',
    youngCoin: 'Собираме од 14 октомври, 17:43 UTC: нова колона секој час, сите 72 часа од 17 октомври, 18:00 UTC.'
  } : {
    title: 'Liquidations', win: function (h) { return h + 'h'; },
    total: 'Liquidated', longs: 'Longs', shorts: 'Shorts', coins: function (n) { return n + ' coins'; },
    biggest: 'Biggest order', since: function (t) { return 'since ' + t + ' UTC'; },
    atLeast: 'at least', other: 'Other', none: 'No liquidations in this window yet. Collection runs every minute since 14 Oct.',
    loading: 'Loading…', legendL: 'mostly longs', legendS: 'mostly shorts',
    read: 'A liquidation is when the exchange force-closes a borrowed position because the price moved against it. Red: mostly longs were wiped out (the price fell). Green: mostly shorts (the price rose).',
    src: 'Source: Binance futures public liquidation stream. Binance only, and a lower bound: the stream sends at most one liquidation per coin per second.',
    coinTitle: function (s) { return s + ' liquidations'; }, h72: 'Last 72 hours, by hour', open: 'Open the coin',
    up: 'shorts wiped', dn: 'longs wiped', at: 'at', hour: 'Hour', share: 'Share',
    young: 'Collecting since 14 Oct, 17:43 UTC. Every hour adds to the numbers; the 24h view is complete from 15 Oct, 18:00 UTC.',
    youngCoin: 'Collecting since 14 Oct, 17:43 UTC: a new bar every hour, all 72 hours from 17 Oct, 18:00 UTC.'
  };
}

/* BTCUSDT -> BTC, 1000PEPEUSDT -> PEPE. */
function _liqSym(s) { return String(s || '').replace(/(USDT|USDC|BUSD)$/, '').replace(/^(1000000|1000|1M)(?=[A-Z])/, ''); }
function _liqCoin(sym) {
  var s = _liqSym(sym);
  return (typeof coins !== 'undefined' && Array.isArray(coins) ? coins : []).filter(function (c) { return c && c.sym === s; })[0] || null;
}
function _liqUsd(v) {
  v = Math.abs(v || 0);
  return v >= 1e9 ? '$' + (v / 1e9).toFixed(2) + 'B' : v >= 1e6 ? '$' + (v / 1e6).toFixed(2) + 'M' : v >= 1e3 ? '$' + (v / 1e3).toFixed(1) + 'K' : '$' + Math.round(v);
}
function _liqPrice(p) { p = Number(p) || 0; return p >= 100 ? p.toLocaleString('en-US', { maximumFractionDigits: 2 }) : p >= 1 ? p.toFixed(4) : p.toPrecision(4); }
function _liqHm(iso) { var d = new Date(iso); return ('0' + d.getUTCHours()).slice(-2) + ':00'; }
/* Long share 0..1 -> colour: 1 = red (longs wiped), 0 = green (shorts wiped). */
function _liqCol(ls, a) {
  var r = ls >= 0.5, k = Math.min(1, Math.abs(ls - 0.5) * 2);
  var base = r ? [234, 57, 67] : [22, 199, 132];
  var mix = function (c) { return Math.round(70 + (c - 70) * (0.45 + 0.55 * k)); };
  return 'rgba(' + mix(base[0]) + ',' + mix(base[1]) + ',' + mix(base[2]) + ',' + (a == null ? 1 : a) + ')';
}

function _liqRpc(fn, body) {
  return fetch(SUPA_URL + '/rest/v1/rpc/' + fn, {
    method: 'POST',
    headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); });
}

function loadLiquidations(hours) {
  if (hours) _liq.hours = hours;
  _liq.loading = true;
  renderLiquidations();
  var h = _liq.hours;
  return _liqRpc('liquidations_summary', { p_hours: h }).then(function (rows) {
    if (h !== _liq.hours) return;
    _liq.rows = Array.isArray(rows) ? rows : [];
    _liq.at = Date.now();
  }).catch(function () { if (!_liq.rows) _liq.rows = []; })
    .then(function () { _liq.loading = false; renderLiquidations(); });
}

function _liqTotals(rows) {
  var t = { long: 0, short: 0, n: 0, coins: rows.length, big: null };
  rows.forEach(function (r) {
    t.long += +r.long_usd || 0; t.short += +r.short_usd || 0; t.n += +r.n || 0;
    if (!t.big || (+r.max_usd || 0) > (+t.big.max_usd || 0)) t.big = r;
  });
  t.all = t.long + t.short;
  return t;
}

/* Squarified treemap (Bruls et al.): items [{v}] sorted big first, into
   the rectangle x,y,w,h. Returns [{item, x, y, w, h}]. */
function _liqTreemap(items, x, y, w, h) {
  var out = [], total = items.reduce(function (s, it) { return s + it.v; }, 0);
  if (!total) return out;
  var scale = (w * h) / total, rest = items.map(function (it) { return { it: it, a: it.v * scale }; });
  function worst(row, side) {
    var s = row.reduce(function (t, r) { return t + r.a; }, 0), mx = 0, mn = Infinity;
    row.forEach(function (r) { mx = Math.max(mx, r.a); mn = Math.min(mn, r.a); });
    return Math.max(side * side * mx / (s * s), (s * s) / (side * side * mn));
  }
  while (rest.length) {
    var side = Math.min(w, h), row = [rest.shift()];
    while (rest.length && worst(row.concat(rest[0]), side) <= worst(row, side)) row.push(rest.shift());
    var s = row.reduce(function (t, r) { return t + r.a; }, 0), off = 0;
    if (w >= h) {
      var cw = s / h;
      row.forEach(function (r) { var rh = r.a / cw; out.push({ item: r.it, x: x, y: y + off, w: cw, h: rh }); off += rh; });
      x += cw; w -= cw;
    } else {
      var rh2 = s / w;
      row.forEach(function (r) { var rw = r.a / rh2; out.push({ item: r.it, x: x + off, y: y, w: rw, h: rh2 }); off += rw; });
      y += rh2; h -= rh2;
    }
  }
  return out;
}
/* The heatmap's boxes: the top coins, the rest grouped as "Other". */
function _liqBoxes(rows, top) {
  var items = rows.slice(0, top).map(function (r) {
    var l = +r.long_usd || 0, s = +r.short_usd || 0;
    return { sym: r.symbol, name: _liqSym(r.symbol), v: l + s, ls: (l + s) ? l / (l + s) : 0.5 };
  });
  var rest = rows.slice(top);
  if (rest.length) {
    var l = 0, s = 0;
    rest.forEach(function (r) { l += +r.long_usd || 0; s += +r.short_usd || 0; });
    if (l + s > 0) items.push({ sym: null, name: _liqL().other, v: l + s, ls: l / (l + s), n: rest.length });
  }
  return items.filter(function (it) { return it.v > 0; }).sort(function (a, b) { return b.v - a.v; });
}

function renderLiquidations() {
  var box = document.getElementById('liq-body');
  if (!box) return;
  var L = _liqL(), rows = _liq.rows;
  var tabs = '<div class="liq-tabs" role="tablist">' + _LIQ_WINDOWS.map(function (h) {
    return '<button type="button" role="tab" class="liq-tab' + (h === _liq.hours ? ' on' : '') + '" aria-selected="' + (h === _liq.hours) + '" onclick="loadLiquidations(' + h + ')">' + L.win(h) + '</button>';
  }).join('') + '</div>';
  if (!rows) { box.innerHTML = tabs + '<p class="liq-empty">' + L.loading + '</p>'; return; }
  if (!rows.length) { box.innerHTML = tabs + '<p class="liq-empty">' + L.none + '</p>'; return; }

  var t = _liqTotals(rows), lsh = t.all ? t.long / t.all * 100 : 50;
  var since = rows[0] && rows[0].since ? L.since(_liqHm(rows[0].since)) : '';
  /* Laid out on 160 x 100, the box's own shape (.liq-map aspect-ratio 16/10),
     then turned into percentages, so the squares stay square. */
  var cells = _liqTreemap(_liqBoxes(rows, 24), 0, 0, 160, 100).map(function (c) {
    c = { item: c.item, x: c.x / 1.6, y: c.y, w: c.w / 1.6, h: c.h, area: c.w * c.h };
    var it = c.item, area = c.area, big = area > 1000, mid = area > 200;
    var click = it.sym ? ' onclick="openLiqCoin(\'' + it.sym + '\')"' : '';
    var pct = Math.round((it.ls >= 0.5 ? it.ls : 1 - it.ls) * 100) + '% ' + (it.ls >= 0.5 ? L.longs : L.shorts).toLowerCase();
    return '<button type="button" class="liq-cell' + (big ? ' big' : mid ? ' mid' : '') + '"' + click
      + ' style="left:' + c.x.toFixed(3) + '%;top:' + c.y.toFixed(3) + '%;width:' + c.w.toFixed(3) + '%;height:' + c.h.toFixed(3) + '%;background:' + _liqCol(it.ls, 0.88) + '"'
      + ' title="' + _esc(it.name) + ': ' + _liqUsd(it.v) + ' · ' + pct + '"' + (it.sym ? '' : ' disabled') + '>'
      + (mid ? '<b>' + _esc(it.name) + '</b><span>' + _liqUsd(it.v) + '</span>' + (big ? '<em>' + pct + '</em>' : '') : '<b>' + _esc(it.name) + '</b>')
      + '</button>';
  }).join('');
  var big = t.big, bigC = big ? _liqSym(big.symbol) : '';
  box.innerHTML = tabs
    + (_liqYoung() ? '<p class="liq-young">' + L.young + '</p>' : '')
    + '<div class="liq-grid">'
    +   '<div class="liq-map-wrap"><div class="liq-map" aria-label="' + L.title + '">' + cells + '</div>'
    +   '<div class="liq-legend"><span><i class="l"></i>' + L.legendL + '</span><span><i class="s"></i>' + L.legendS + '</span><span class="liq-since">' + since + '</span></div></div>'
    +   '<div class="liq-side">'
    +     '<div class="liq-total"><span class="bf-k">' + L.total + ' · ' + L.win(_liq.hours) + '</span><b>' + _liqUsd(t.all) + '</b><em>' + L.atLeast + ' · Binance · ' + L.coins(t.coins) + '</em></div>'
    +     '<div class="liq-split"><div><span class="bf-k">' + L.longs + '</span><b class="dn">' + _liqUsd(t.long) + '</b></div><div><span class="bf-k">' + L.shorts + '</span><b class="up">' + _liqUsd(t.short) + '</b></div></div>'
    +     '<div class="liq-bar"><i style="width:' + lsh.toFixed(1) + '%"></i></div>'
    +     '<div class="liq-bar-lbl"><span class="dn">' + lsh.toFixed(1) + '%</span><span class="up">' + (100 - lsh).toFixed(1) + '%</span></div>'
    +     (big ? '<button type="button" class="liq-big" onclick="openLiqCoin(\'' + big.symbol + '\')"><span class="bf-k">' + L.biggest + '</span><b>' + _liqUsd(big.max_usd) + '</b><em>' + _esc(bigC) + ' · ' + (big.max_side === 'long' ? L.longs : L.shorts) + ' · ' + L.at + ' $' + _liqPrice(big.max_price) + '</em></button>' : '')
    +     '<button type="button" class="liq-share" onclick="shareLiqMap()">'
    +       '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>' + L.share + '</button>'
    +   '</div>'
    + '</div>'
    + '<p class="liq-read">' + L.read + '</p><div class="etf-src">' + L.src + '</div>';
  /* Measure after layout, and again once the font is in: text measured in
     the fallback font came out narrower and then spilled. */
  requestAnimationFrame(_liqFitCells);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(_liqFitCells);
}

/* Text never spills out of a box (Daniel, 2026-10-14: "some text is out
   of the square"). Each box is measured as drawn; while its text does not
   fit, it drops the percentage, then the dollar line, then shrinks the
   name, and as a last step shows no text (the tooltip keeps the name). */
/* Measured from the visible lines themselves: a centred box hides text
   that spills over its top, which scrollHeight does not count. */
function _liqFits(el) {
  var kids = Array.prototype.filter.call(el.children, function (k) { return k.style.display !== 'none'; });
  if (!kids.length) return true;
  var h = 6 + 2 * (kids.length - 1), maxW = el.clientWidth - 6;
  for (var i = 0; i < kids.length; i++) {
    h += kids[i].offsetHeight;
    if (kids[i].scrollWidth > maxW || kids[i].scrollWidth > kids[i].clientWidth + 1) return false;
  }
  return h <= el.clientHeight;
}
function _liqFitCells() {
  var cells = document.querySelectorAll('#liq-body .liq-cell');
  Array.prototype.forEach.call(cells, function (el) {
    var b = el.querySelector('b'), sp = el.querySelector('span'), em = el.querySelector('em');
    [b, sp, em].forEach(function (x) { if (x) { x.style.display = ''; x.style.fontSize = ''; } });
    if (_liqFits(el)) return;
    if (em) { em.style.display = 'none'; if (_liqFits(el)) return; }
    if (sp) { sp.style.display = 'none'; if (_liqFits(el)) return; }
    if (b) {
      for (var fs = parseFloat(getComputedStyle(b).fontSize) - 1; fs >= 8; fs--) {
        b.style.fontSize = fs + 'px';
        if (_liqFits(el)) return;
      }
      b.style.display = 'none';
    }
  });
}
var _liqFitT = null;
window.addEventListener('resize', function () { clearTimeout(_liqFitT); _liqFitT = setTimeout(_liqFitCells, 150); });

/* ── One coin's window ─────────────────────────────────────────── */
function openLiqCoin(symbol) {
  var body = document.getElementById('liq-modal-body');
  if (!body) return;
  _liq.coin = symbol; _liq.coinRows = null;
  body.innerHTML = '<div class="modal-title">' + _liqL().coinTitle(_esc(_liqSym(symbol))) + '</div><p class="btcg-none">' + _liqL().loading + '</p>';
  openModal('liq-modal');
  fcTopShare('liq-modal', null);
  if (typeof supaCountFeature === 'function') supaCountFeature('liq_coin_window', true);
  _liqRpc('liquidations_coin', { p_symbol: symbol, p_hours: 72 }).then(function (rows) {
    if (_liq.coin !== symbol) return;
    _liq.coinRows = Array.isArray(rows) ? rows : [];
    _liqRenderCoin();
  }).catch(function () { _liq.coinRows = []; _liqRenderCoin(); });
}
/* 72 hourly slots, oldest first, empty hours as zeros. */
function _liqSlots(rows, n) {
  var by = {}; (rows || []).forEach(function (r) { by[new Date(r.hour).toISOString()] = r; });
  var now = new Date(); now.setUTCMinutes(0, 0, 0);
  var out = [];
  for (var i = n - 1; i >= 0; i--) {
    var k = new Date(now.getTime() - i * 36e5).toISOString(), r = by[k];
    out.push({ hour: k, long: r ? +r.long_usd || 0 : 0, short: r ? +r.short_usd || 0 : 0 });
  }
  return out;
}
/* Shorts wiped above the line (green), longs wiped below (red). */
function _liqBarsSvg(slots) {
  var W = 300, H = 140, mid = H / 2, hi = Math.max.apply(null, slots.map(function (s) { return Math.max(s.long, s.short); })) || 1;
  var sc = (mid - 4) / hi, bw = W / slots.length, out = '<svg class="fc-chart" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img">'
    + '<line x1="0" x2="' + W + '" y1="' + mid + '" y2="' + mid + '" class="etf-zero"/>';
  slots.forEach(function (s, i) {
    var x = (i * bw + bw * 0.12).toFixed(1), w = (bw * 0.76).toFixed(1), t = _liqHm(s.hour) + ' ' + new Date(s.hour).getUTCDate() + ': ';
    if (s.short) out += '<rect x="' + x + '" y="' + (mid - Math.max(1, s.short * sc)).toFixed(1) + '" width="' + w + '" height="' + Math.max(1, s.short * sc).toFixed(1) + '" class="etf-in"><title>' + t + _liqUsd(s.short) + ' shorts</title></rect>';
    if (s.long) out += '<rect x="' + x + '" y="' + mid + '" width="' + w + '" height="' + Math.max(1, s.long * sc).toFixed(1) + '" class="etf-out"><title>' + t + _liqUsd(s.long) + ' longs</title></rect>';
  });
  return out + '</svg>';
}
function _liqRenderCoin() {
  var body = document.getElementById('liq-modal-body'), L = _liqL(), sym = _liq.coin, name = _liqSym(sym);
  if (!body) return;
  var slots = _liqSlots(_liq.coinRows, 72), d24 = slots.slice(-24);
  var l24 = d24.reduce(function (a, s) { return a + s.long; }, 0), s24 = d24.reduce(function (a, s) { return a + s.short; }, 0);
  var l72 = slots.reduce(function (a, s) { return a + s.long; }, 0), s72 = slots.reduce(function (a, s) { return a + s.short; }, 0);
  var big = (_liq.coinRows || []).slice().sort(function (a, b) { return (+b.max_usd || 0) - (+a.max_usd || 0); })[0];
  var c = _liqCoin(sym), has = l72 + s72 > 0;
  var rowsHtml = slots.slice().reverse().filter(function (s) { return s.long || s.short; }).slice(0, 12).map(function (s) {
    return '<tr><td>' + new Date(s.hour).getUTCDate() + ' · ' + _liqHm(s.hour) + '</td><td class="dn">' + (s.long ? _liqUsd(s.long) : '—') + '</td><td class="up">' + (s.short ? _liqUsd(s.short) : '—') + '</td></tr>';
  }).join('');
  body.innerHTML = '<div class="modal-title">' + L.coinTitle(_esc(name)) + '</div><div class="etf-scroll">'
    + (has ? (
        '<div class="btcg-big">' + _liqUsd(l24 + s24) + ' <span>' + L.atLeast + ', 24h · Binance</span></div>'
      + '<div class="etf-stats fc-stats3">'
      +   '<div><span class="bf-k">' + L.longs + ' 24h</span><b class="dn">' + _liqUsd(l24) + '</b><em>72h ' + _liqUsd(l72) + '</em></div>'
      +   '<div><span class="bf-k">' + L.shorts + ' 24h</span><b class="up">' + _liqUsd(s24) + '</b><em>72h ' + _liqUsd(s72) + '</em></div>'
      +   (big ? '<div><span class="bf-k">' + L.biggest + '</span><b>' + _liqUsd(big.max_usd) + '</b><em>' + (big.max_side === 'long' ? L.longs : L.shorts) + ' · $' + _liqPrice(big.max_price) + '</em></div>' : '<div></div>')
      + '</div>'
      + '<div class="fc-stage" id="liq-fc-stage">' + _liqBarsSvg(slots) + '</div>'
      + '<div class="etf-axis"><span>-72h</span><span>' + L.h72 + ' · <b class="up">▲ ' + L.up + '</b> <b class="dn">▼ ' + L.dn + '</b></span><span>' + _liqHm(slots[slots.length - 1].hour) + '</span></div>'
      + (_liqYoung() ? '<p class="liq-young">' + L.youngCoin + '</p>' : '')
      + '<table class="btcg-table"><thead><tr><th>' + L.hour + ' (UTC)</th><th>' + L.longs + '</th><th>' + L.shorts + '</th></tr></thead><tbody>' + rowsHtml + '</tbody></table>'
    ) : '<p class="btcg-none">' + L.none + '</p>')
    + (c ? '<button type="button" class="liq-open" onclick="closeModal(\'liq-modal\');openTileDetail(\'' + c.id + '\')">' + L.open + ' ' + _esc(c.sym) + ' →</button>' : '')
    + '<p class="btcg-read">' + L.read + '</p><div class="etf-src">' + L.src + '</div></div>';
  fcTopShare('liq-modal', has ? 'shareLiqCoin' : null);
  if (typeof fcWatermark === 'function') fcWatermark('liq-fc-stage');
}

/* ── Share cards (1200x675, the same frame as the other charts) ─── */
function _liqCard(draw) {
  if (typeof _shareWatermark !== 'function' || typeof shareBrandBar !== 'function') return;
  var fonts = document.fonts && document.fonts.load
    ? Promise.all(['600 22px Inter', '700 18px Inter', '800 38px Inter'].map(function (f) { return document.fonts.load(f); }))
    : Promise.resolve();
  fonts.catch(function () {}).then(function () { _shareWatermark(draw); });
  if (typeof supaCountFeature === 'function') supaCountFeature('share_chart', false);
}
function _liqCardHead(ctx, W, kicker, wm) {
  ctx.fillStyle = '#0a0f17'; ctx.fillRect(0, 0, W, 675);
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left'; ctx.fillStyle = '#8a96a8';
  var k = kicker.toUpperCase();
  shareFit(ctx, k, 900, '700 {SIZE}px Inter, sans-serif', 18, 13);
  if (ctx.letterSpacing !== undefined) ctx.letterSpacing = '2px';
  ctx.fillText(k, 60, 50);
  if (ctx.letterSpacing !== undefined) ctx.letterSpacing = '0px';
  var nd = new Date(), MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  ctx.fillStyle = '#f3ba2f'; ctx.beginPath(); ctx.arc(64, 71, 4, 0, Math.PI * 2); ctx.fill();
  ctx.font = '600 15px Inter, sans-serif';
  ctx.fillText('Updated ' + nd.getUTCDate() + ' ' + MON[nd.getUTCMonth()] + ', ' + ('0' + nd.getUTCHours()).slice(-2) + ':' + ('0' + nd.getUTCMinutes()).slice(-2) + ' UTC', 76, 76);
  if (wm.icon) ctx.drawImage(wm.icon, W - 108, 26, 48, 48);
}
function shareLiqMap() {
  var rows = _liq.rows; if (!rows || !rows.length) return;
  var t = _liqTotals(rows), h = _liq.hours, lsh = t.all ? t.long / t.all * 100 : 50;
  _liqCard(function (wm) {
    var W = 1200, H = 675, can = document.createElement('canvas'); can.width = W; can.height = H;
    var ctx = can.getContext('2d');
    _liqCardHead(ctx, W, 'Binance futures liquidations · last ' + h + 'h · ' + t.coins + ' coins', wm);
    /* The heatmap on the left, totals on the right. */
    var MX = 60, MY = 96, MW = 700, MH = 400;
    _liqTreemap(_liqBoxes(rows, 16), MX, MY, MW, MH).forEach(function (c) {
      var it = c.item;
      ctx.fillStyle = _liqCol(it.ls, 1);
      if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(c.x + 2, c.y + 2, c.w - 4, c.h - 4, 6); ctx.fill(); } else ctx.fillRect(c.x + 2, c.y + 2, c.w - 4, c.h - 4);
      /* Text only where it fits inside the box, with 8 px of margin. */
      var room = c.w - 16, fs = Math.min(44, c.h / 2.6);
      ctx.font = '800 ' + fs + 'px Inter, sans-serif';
      while (fs > 13 && ctx.measureText(it.name).width > room) { fs -= 1; ctx.font = '800 ' + fs + 'px Inter, sans-serif'; }
      if (fs > 13 && ctx.measureText(it.name).width <= room && c.h > fs + 12) {
        var vs = Math.round(fs * 0.62), val = _liqUsd(it.v);
        ctx.font = '700 ' + vs + 'px Inter, sans-serif';
        var two = vs >= 11 && ctx.measureText(val).width <= room && c.h > fs + vs + 22;
        ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center';
        ctx.font = '800 ' + fs + 'px Inter, sans-serif';
        ctx.fillText(it.name, c.x + c.w / 2, c.y + c.h / 2 + (two ? -fs * 0.1 : fs * 0.35));
        if (two) { ctx.font = '700 ' + vs + 'px Inter, sans-serif'; ctx.fillText(val, c.x + c.w / 2, c.y + c.h / 2 + fs * 0.75); }
      }
    });
    var RX = 800;
    ctx.textAlign = 'left'; ctx.fillStyle = '#8a96a8'; ctx.font = '700 18px Inter, sans-serif'; ctx.fillText('LIQUIDATED, AT LEAST', RX, 128);
    ctx.fillStyle = '#ffffff'; shareFit(ctx, _liqUsd(t.all), 340, '800 {SIZE}px Inter, sans-serif', 64, 36); ctx.fillText(_liqUsd(t.all), RX, 196);
    ctx.font = '700 24px Inter, sans-serif';
    ctx.fillStyle = '#ea3943'; ctx.fillText('Longs  ' + _liqUsd(t.long) + '  ' + lsh.toFixed(0) + '%', RX, 252);
    ctx.fillStyle = '#16c784'; ctx.fillText('Shorts ' + _liqUsd(t.short) + '  ' + (100 - lsh).toFixed(0) + '%', RX, 290);
    ctx.fillStyle = '#16c784'; ctx.fillRect(RX, 312, 340, 12);
    ctx.fillStyle = '#ea3943'; ctx.fillRect(RX, 312, 340 * lsh / 100, 12);
    if (t.big) {
      ctx.fillStyle = '#8a96a8'; ctx.font = '700 18px Inter, sans-serif'; ctx.fillText('BIGGEST ORDER', RX, 372);
      ctx.fillStyle = '#ffffff'; ctx.font = '800 34px Inter, sans-serif'; ctx.fillText(_liqUsd(t.big.max_usd) + ' ' + _liqSym(t.big.symbol), RX, 414);
      ctx.fillStyle = '#c9d2de'; ctx.font = '600 20px Inter, sans-serif';
      ctx.fillText((t.big.max_side === 'long' ? 'Long' : 'Short') + ' closed at $' + _liqPrice(t.big.max_price), RX, 446);
    }
    ctx.fillStyle = '#8a96a8'; ctx.font = '500 16px Inter, sans-serif';
    ctx.fillText('Red: mostly longs wiped out · Green: mostly shorts · Binance stream, a lower bound', MX, 528);
    shareBrandBar(ctx, W, H);
    var text = 'At least ' + _liqUsd(t.all) + ' of Binance futures positions were liquidated in the last ' + h + 'h: '
      + lsh.toFixed(0) + '% longs, ' + (100 - lsh).toFixed(0) + '% shorts.'
      + (t.big ? ' Biggest single order: ' + _liqUsd(t.big.max_usd) + ' on ' + _liqSym(t.big.symbol) + '.' : '')
      + '\nLive liquidation heatmap, free on Rotator → ' + ROTATOR_SHARE.link;
    if (typeof _openShareCard === 'function') _openShareCard(can, 'LIQUIDATIONS', text);
  });
}
function shareLiqCoin() {
  var sym = _liq.coin, name = _liqSym(sym), slots = _liqSlots(_liq.coinRows, 72), d24 = slots.slice(-24);
  var l24 = d24.reduce(function (a, s) { return a + s.long; }, 0), s24 = d24.reduce(function (a, s) { return a + s.short; }, 0);
  if (!(l24 + s24) && !slots.some(function (s) { return s.long || s.short; })) return;
  _liqCard(function (wm) {
    var W = 1200, H = 675, can = document.createElement('canvas'); can.width = W; can.height = H;
    var ctx = can.getContext('2d');
    _liqCardHead(ctx, W, name + ' liquidations on Binance futures · last 72 hours, by hour', wm);
    var CX = 60, CY = 100, CW = 1080, CH = 260, mid = CY + CH / 2;
    var hi = Math.max.apply(null, slots.map(function (s) { return Math.max(s.long, s.short); })) || 1, sc = (CH / 2 - 8) / hi, bw = CW / slots.length;
    if (wm.mark) { ctx.globalAlpha = 0.08; ctx.drawImage(wm.mark, CX + CW / 2 - 130, CY, 260, 260); ctx.globalAlpha = 1; }
    ctx.strokeStyle = '#3a4352'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(CX, mid); ctx.lineTo(CX + CW, mid); ctx.stroke();
    slots.forEach(function (s, i) {
      var x = CX + i * bw + bw * 0.14, w = bw * 0.72;
      if (s.short) { ctx.fillStyle = '#16c784'; ctx.fillRect(x, mid - Math.max(2, s.short * sc), w, Math.max(2, s.short * sc)); }
      if (s.long) { ctx.fillStyle = '#ea3943'; ctx.fillRect(x, mid, w, Math.max(2, s.long * sc)); }
    });
    ctx.fillStyle = '#6f7b8c'; ctx.font = '600 16px Inter, sans-serif';
    ctx.textAlign = 'left'; ctx.fillText('72h ago', CX, CY + CH + 26);
    ctx.textAlign = 'center'; ctx.fillText('▲ shorts wiped out   ▼ longs wiped out', W / 2, CY + CH + 26);
    ctx.textAlign = 'right'; ctx.fillText('now', CX + CW, CY + CH + 26);
    ctx.textAlign = 'left'; ctx.fillStyle = '#ffffff';
    var head = 'At least ' + _liqUsd(l24 + s24) + ' of ' + name + ' positions liquidated in 24h';
    shareFit(ctx, head, W - 120, '800 {SIZE}px Inter, sans-serif', 38, 26); ctx.fillText(head, 60, 436);
    ctx.font = '700 24px Inter, sans-serif';
    ctx.fillStyle = '#ea3943'; ctx.fillText('Longs ' + _liqUsd(l24), 60, 482);
    var lw = ctx.measureText('Longs ' + _liqUsd(l24)).width;
    ctx.fillStyle = '#6f7b8c'; ctx.fillText('  ·  ', 60 + lw, 482);
    ctx.fillStyle = '#16c784'; ctx.fillText('Shorts ' + _liqUsd(s24), 60 + lw + ctx.measureText('  ·  ').width, 482);
    ctx.fillStyle = '#8a96a8'; ctx.font = '500 16px Inter, sans-serif';
    ctx.fillText('Source: Binance futures liquidation stream, a lower bound', 60, 520);
    shareBrandBar(ctx, W, H);
    var text = 'At least ' + _liqUsd(l24 + s24) + ' of $' + name + ' futures positions were liquidated on Binance in the last 24h: '
      + 'longs ' + _liqUsd(l24) + ', shorts ' + _liqUsd(s24) + '.\nLive liquidations for every coin, free on Rotator → ' + ROTATOR_SHARE.link + '/?coin=' + encodeURIComponent(name);
    if (typeof _openShareCard === 'function') _openShareCard(can, name + '-LIQ', text);
  });
}

/* First load when the section comes near the screen, then every 2 minutes
   while the page is open and visible. */
(function initLiquidations() {
  function start() {
    var sec = document.getElementById('sec-liq');
    if (!sec) return;
    var go = function () { if (!_liq.rows || Date.now() - _liq.at > 110e3) loadLiquidations(); };
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es, ob) { if (es[0].isIntersecting) { go(); ob.disconnect(); } }, { rootMargin: '600px' }).observe(sec);
    } else go();
    setInterval(function () { if (_liq.rows && !document.hidden) loadLiquidations(); }, 120e3);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
