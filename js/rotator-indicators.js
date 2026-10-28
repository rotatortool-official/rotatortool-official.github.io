/* ══════════════════════════════════════════════════════════════════
   rotator-indicators.js — Rotator's own indicator chart, Pro
   ──────────────────────────────────────────────────────────────────
   Daniel, 2026-10-28: Pro should offer "access to Trading View and
   advanced indicators ... an indicator that is from the Rotator website".
   TradingView's embedded widget cannot carry our own indicator, and its
   Advanced Charts library may not sit behind a paywall on the free
   licence, so Daniel chose our own Pro chart: TradingView's open-source
   Lightweight Charts (Apache-2.0; its TradingView logo stays on, as the
   licence asks), drawn from data the board already keeps:

     pane 1  daily candles (binance_daily_klines; it stores no open, so a
             candle opens at the day before's close) with our dated flags
             from coin_events: golden cross ▲, death cross ▼, RSI comeback ●
     pane 2  RSI 14 on the daily closes, with the 30 and 70 lines, and
             the Rotator score per day on the same 0-100 scale
             (score_variants_shadow_daily, live score column; it starts
             2026-10-06), its crossings with RSI marked ✕ (2026-10-29)

   Facts on a chart, not calls: the flags are the same dated events the
   board and the channel publish. Loaded only when the big card's
   "Rotator indicators" switch is on (js/coin-expand.js) or in the phone
   full screen (tvFullscreen, js/data-loaders.js).

   Extra indicators, off until the viewer turns them on (chips in the
   legend, kept in this browser). Daniel, 2026-10-28 evening: "search for
   GitHub free top-rated indicators ... implement them into the website".
   Picked from TradingView's most-liked free scripts that work on daily
   candles without volume or a real open: EMA 20/50, Bollinger Bands
   (20, 2), SuperTrend (10, 3), MACD (12, 26, 9) and Squeeze Momentum
   (LazyBear's formula: Bollinger inside Keltner = squeeze; momentum =
   linear regression of the close against the 20-day midline). Formulas
   written out here; deepentropy/lightweight-charts-indicators (MIT) has
   the same set but ships 446 indicators, too heavy for phones. Display
   only: none of them enters the score (nothing-enters-the-score-untested). */

var RI_LIB = 'https://cdn.jsdelivr.net/npm/lightweight-charts@5.2.1/dist/lightweight-charts.standalone.production.js';
var _riLibP = null, _riChart = null;
var RI_IND = [['ema', 'EMA 20/50'], ['bb', 'Bollinger'], ['st', 'SuperTrend'], ['macd', 'MACD'], ['sqz', 'Squeeze']];
var _riOn = (function () { try { return JSON.parse(localStorage.getItem('rot_ri_ind') || '{}') || {}; } catch (e) { return {}; } })();
var _riData = {};
/* Time frames (Daniel, 2026-10-29: "we might need to add time frames"):
   daily candles only (binance_daily_klines holds ~180 days), so the
   frames are how many days are in view. Kept in this browser. */
var RI_FRAMES = [[30, '1M'], [90, '3M'], [180, '6M']];
var _riFrame = (function () { try { return Number(localStorage.getItem('rot_ri_frame')) || 90; } catch (e) { return 90; } })();   /* sym -> [klines, events, scores], kept so a chip redraws without fetching */

function _riLib() {
  if (window.LightweightCharts) return Promise.resolve();
  if (_riLibP) return _riLibP;
  _riLibP = new Promise(function (ok, no) {
    var s = document.createElement('script');
    s.src = RI_LIB; s.async = true;
    s.onload = function () { ok(); };
    s.onerror = function () { _riLibP = null; no(new Error('chart library blocked')); };
    document.head.appendChild(s);
  });
  return _riLibP;
}

function _riDay(t) { return String(t).slice(0, 10); }

/* Wilder's RSI 14, the same formula TradingView uses. */
function _riRsi(closes, n) {
  n = n || 14;
  var out = [], g = 0, l = 0;
  for (var i = 1; i < closes.length; i++) {
    var d = closes[i].v - closes[i - 1].v, up = d > 0 ? d : 0, dn = d < 0 ? -d : 0;
    if (i <= n) { g += up; l += dn; if (i === n) { g /= n; l /= n; out.push({ time: closes[i].t, value: l === 0 ? 100 : 100 - 100 / (1 + g / l) }); } continue; }
    g = (g * (n - 1) + up) / n; l = (l * (n - 1) + dn) / n;
    out.push({ time: closes[i].t, value: l === 0 ? 100 : 100 - 100 / (1 + g / l) });
  }
  return out;
}

function _riSma(v, n) {
  var o = [], s = 0;
  for (var i = 0; i < v.length; i++) { s += v[i]; if (i >= n) s -= v[i - n]; o.push(i >= n - 1 ? s / n : null); }
  return o;
}
/* EMA seeded with the first n-value average; skips leading nulls (MACD signal). */
function _riEma(v, n) {
  var o = [], k = 2 / (n + 1), e = null, s = 0, c = 0;
  for (var i = 0; i < v.length; i++) {
    if (v[i] == null) { o.push(null); continue; }
    if (e == null) { s += v[i]; c++; if (c === n) e = s / n; o.push(e); continue; }
    e = v[i] * k + e * (1 - k); o.push(e);
  }
  return o;
}
function _riStd(v, n, m) {
  return v.map(function (_, i) {
    if (m[i] == null) return null;
    var q = 0; for (var j = i - n + 1; j <= i; j++) q += (v[j] - m[i]) * (v[j] - m[i]);
    return Math.sqrt(q / n);
  });
}
function _riTr(k) {
  return k.map(function (b, i) { var pc = i ? k[i - 1].close : b.close; return Math.max(b.high - b.low, Math.abs(b.high - pc), Math.abs(b.low - pc)); });
}
function _riAtr(k, n) {   /* Wilder's smoothing */
  var tr = _riTr(k), o = [], a = null, s = 0;
  for (var i = 0; i < tr.length; i++) {
    if (i < n) { s += tr[i]; if (i === n - 1) a = s / n; o.push(i === n - 1 ? a : null); continue; }
    a = (a * (n - 1) + tr[i]) / n; o.push(a);
  }
  return o;
}
/* SuperTrend: the band under price while the trend is up, over it while down. */
function _riSuperTrend(k, n, m) {
  var atr = _riAtr(k, n), out = [], fu = null, fd = null, d = 1;
  for (var i = 0; i < k.length; i++) {
    if (atr[i] == null) { out.push(null); continue; }
    var hl = (k[i].high + k[i].low) / 2, bu = hl - m * atr[i], bd = hl + m * atr[i], pc = i ? k[i - 1].close : k[i].close;
    fu = fu == null || pc < fu ? bu : Math.max(bu, fu);
    fd = fd == null || pc > fd ? bd : Math.min(bd, fd);
    if (d === 1 && k[i].close < fu) d = -1; else if (d === -1 && k[i].close > fd) d = 1;
    out.push({ d: d, v: d === 1 ? fu : fd });
  }
  return out;
}
/* Least-squares line over the last n values, read at the newest point (Pine's linreg(x, n, 0)). */
function _riLinreg(v, n) {
  return v.map(function (_, i) {
    if (i < n - 1) return null;
    var sx = 0, sy = 0, sxy = 0, sxx = 0;
    for (var j = 0; j < n; j++) { var y = v[i - n + 1 + j]; if (y == null) return null; sx += j; sy += y; sxy += j * y; sxx += j * j; }
    var b = (n * sxy - sx * sy) / (n * sxx - sx * sx);
    return (sy - b * sx) / n + b * (n - 1);
  });
}
function _riLine(k, vals) { return k.map(function (b, i) { return vals[i] == null ? { time: b.time } : { time: b.time, value: vals[i] }; }); }

function _riCss(name, fb) {
  var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fb;
}

function riDestroy() {
  if (_riChart) { try { _riChart.remove(); } catch (e) {} _riChart = null; }
}

function riRender(host, c) {
  if (!host || !c) return;
  riDestroy();
  host.setAttribute('data-sym', c.sym);
  if (_riData[c.sym] && window.LightweightCharts) { _riDraw(host, c); return; }
  host.innerHTML = '<div class="ri-note">Loading Rotator indicators…</div>';
  var sym = String(c.sym).toUpperCase();
  var since = new Date(Date.now() - 200 * 864e5).toISOString().slice(0, 10);
  Promise.all([
    _riLib(),
    supaRest('binance_daily_klines', 'GET', { base_asset: 'eq.' + sym, select: 'open_time,high,low,close', order: 'open_time.asc', limit: '220' }),
    supaRest('coin_events', 'GET', { base_asset: 'eq.' + sym, event_type: 'in.(golden_cross,death_cross,rsi_reclaim)', event_date: 'gte.' + since, select: 'event_date,event_type', order: 'event_date.asc', limit: '200' }),
    supaRest('score_variants_shadow_daily', 'GET', { coin_sym: 'eq.' + sym, select: 'snap_date,score', order: 'snap_date.asc', limit: '400' })
  ]).then(function (r) {
    _riData[c.sym] = [r[1], r[2], r[3]];
    if (host.getAttribute('data-sym') !== c.sym) return;
    _riDraw(host, c);
  }).catch(function () {
    if (host.getAttribute('data-sym') !== c.sym) return;
    host.innerHTML = '<div class="ri-note">The indicator chart did not load (an ad blocker may block cdn.jsdelivr.net). Try again after allowing it.</div>';
  });
}

function _riDraw(host, c) {
  riDestroy();
  var r = _riData[c.sym], sym = String(c.sym).toUpperCase();
  var kl = Array.isArray(r[0]) ? r[0] : [], ev = Array.isArray(r[1]) ? r[1] : [], sc = Array.isArray(r[2]) ? r[2] : [];
  if (kl.length < 20) { host.innerHTML = '<div class="ri-note">Not enough daily history for ' + sym + ' yet.</div>'; return; }
  var LC = window.LightweightCharts;
  var text = _riCss('--text', '#d6dbe4'), muted = _riCss('--muted', '#8f9aab'), grid = _riCss('--bdr', 'rgba(128,128,128,.18)');
  var green = _riCss('--green', '#16c784'), red = _riCss('--red', '#ea3943'), gold = _riCss('--gold', '#f3ba2f');
  host.innerHTML = '<div class="ri-legend"><b>Rotator indicators</b>'
    + '<span class="ri-frames">' + RI_FRAMES.map(function (f) { return '<button type="button" class="ri-frame' + (f[0] === _riFrame ? ' on' : '') + '" data-d="' + f[0] + '">' + f[1] + '</button>'; }).join('') + '</span>'
    + ' <span class="up">▲ golden cross</span> <span class="dn">▼ death cross</span> <span class="ri-gold">● RSI back above 30</span>'
    + ' <span class="ri-score-k">— score</span> <span class="ri-x">✕ score crossed RSI</span>'
    + '<span class="ri-chips">' + RI_IND.map(function (x) {
      return '<button type="button" class="ri-chip' + (_riOn[x[0]] ? ' on' : '') + '" data-i="' + x[0] + '" aria-pressed="' + (_riOn[x[0]] ? 'true' : 'false') + '">' + x[1] + '</button>';
    }).join('') + '</span></div><div class="ri-chart"></div>';
  host.querySelectorAll('.ri-frame').forEach(function (b) {
    b.addEventListener('click', function () {
      _riFrame = Number(b.getAttribute('data-d'));
      try { localStorage.setItem('rot_ri_frame', String(_riFrame)); } catch (e) {}
      host.querySelectorAll('.ri-frame').forEach(function (x) { x.classList.toggle('on', x === b); });
      if (_riChart && _riChart._riLen) _riChart.timeScale().setVisibleLogicalRange({ from: Math.max(0, _riChart._riLen - _riFrame), to: _riChart._riLen + 2 });
    });
  });
  host.querySelectorAll('.ri-chip').forEach(function (b) {
    b.addEventListener('click', function () {
      var i = b.getAttribute('data-i'); _riOn[i] = !_riOn[i];
      try { localStorage.setItem('rot_ri_ind', JSON.stringify(_riOn)); } catch (e) {}
      if (_riOn[i] && typeof supaCountFeature === 'function') supaCountFeature('rotator_indicators');
      _riDraw(host, c);
    });
  });
  var box = host.querySelector('.ri-chart');
  var chart = LC.createChart(box, {
    autoSize: true,
    layout: { background: { type: 'solid', color: 'transparent' }, textColor: muted, fontSize: 11, panes: { separatorColor: grid } },
    grid: { vertLines: { color: 'transparent' }, horzLines: { color: grid } },
    rightPriceScale: { borderColor: grid }, timeScale: { borderColor: grid },
    crosshair: { mode: 1 }
  });
  _riChart = chart;
  var candles = kl.map(function (k, i) {
    var cl = Number(k.close), op = i ? Number(kl[i - 1].close) : cl;
    return { time: _riDay(k.open_time), open: op, high: Math.max(Number(k.high), op, cl), low: Math.min(Number(k.low), op, cl), close: cl };
  });
  var cs = chart.addSeries(LC.CandlestickSeries, { upColor: green, downColor: red, borderVisible: false, wickUpColor: green, wickDownColor: red }, 0);
  cs.setData(candles);
  var have = {}; candles.forEach(function (k) { have[k.time] = 1; });
  var marks = ev.filter(function (e) { return have[_riDay(e.event_date)]; }).map(function (e) {
    var t = e.event_type;
    return t === 'golden_cross' ? { time: _riDay(e.event_date), position: 'belowBar', color: green, shape: 'arrowUp', text: 'GC' }
         : t === 'death_cross' ? { time: _riDay(e.event_date), position: 'aboveBar', color: red, shape: 'arrowDown', text: 'DC' }
         : { time: _riDay(e.event_date), position: 'belowBar', color: gold, shape: 'circle', text: 'RSI' };
  });
  if (marks.length && LC.createSeriesMarkers) LC.createSeriesMarkers(cs, marks);

  /* Overlays on the candles. */
  var closes = candles.map(function (k) { return k.close; });
  var thin = { lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false };
  var over = function (vals, col, extra) {
    chart.addSeries(LC.LineSeries, Object.assign({ color: col }, thin, extra || {}), 0).setData(_riLine(candles, vals));
  };
  if (_riOn.ema) { over(_riEma(closes, 20), '#4aa3ff', { title: 'EMA 20' }); over(_riEma(closes, 50), '#c77dff', { title: 'EMA 50' }); }
  if (_riOn.bb) {
    var mid = _riSma(closes, 20), sd = _riStd(closes, 20, mid);
    over(mid, muted, { lineStyle: 2 });
    over(mid.map(function (m, i) { return m == null ? null : m + 2 * sd[i]; }), muted);
    over(mid.map(function (m, i) { return m == null ? null : m - 2 * sd[i]; }), muted);
  }
  if (_riOn.st) {
    /* One series coloured per day: two series would draw a straight line
       across the days the other one owns. A segment takes the colour of
       the day it starts on, so the day before a flip is transparent and
       the jump from one band to the other is not drawn. */
    var st = _riSuperTrend(candles, 10, 3);
    chart.addSeries(LC.LineSeries, Object.assign({ color: green }, thin, { lineWidth: 2, title: 'SuperTrend' }), 0).setData(candles.map(function (b, i) {
      var x = st[i], n = st[i + 1];
      if (!x) return { time: b.time };
      return { time: b.time, value: x.v, color: n && n.d !== x.d ? 'rgba(0,0,0,0)' : x.d === 1 ? green : red };
    }));
  }

  /* Panes under the candles: RSI with the score, then MACD / Squeeze when on. */
  var pane = 1;
  var rsi = chart.addSeries(LC.LineSeries, { color: gold, lineWidth: 1.5, priceLineVisible: false, lastValueVisible: true, title: 'RSI 14' }, pane++);
  var rsiData = _riRsi(candles.map(function (k) { return { t: k.time, v: k.close }; }));
  rsi.setData(rsiData);
  rsi.createPriceLine({ price: 70, color: red, lineStyle: 2, lineWidth: 1, axisLabelVisible: false });
  rsi.createPriceLine({ price: 30, color: green, lineStyle: 2, lineWidth: 1, axisLabelVisible: false });
  if (_riOn.macd) {
    var e12 = _riEma(closes, 12), e26 = _riEma(closes, 26), mp = pane++;
    var macd = e12.map(function (v, i) { return v == null || e26[i] == null ? null : v - e26[i]; }), sig = _riEma(macd, 9);
    chart.addSeries(LC.HistogramSeries, { priceLineVisible: false, lastValueVisible: false, title: 'MACD 12 26 9' }, mp).setData(candles.map(function (b, i) {
      if (macd[i] == null || sig[i] == null) return { time: b.time };
      var h = macd[i] - sig[i];
      return { time: b.time, value: h, color: h >= 0 ? 'rgba(22,199,132,.6)' : 'rgba(234,57,67,.6)' };
    }));
    chart.addSeries(LC.LineSeries, Object.assign({ color: '#4aa3ff' }, thin), mp).setData(_riLine(candles, macd));
    chart.addSeries(LC.LineSeries, Object.assign({ color: '#ff9f43' }, thin), mp).setData(_riLine(candles, sig));
  }
  if (_riOn.sqz) {
    var hi = candles.map(function (k) { return k.high; }), lo = candles.map(function (k) { return k.low; });
    var m20 = _riSma(closes, 20), sd20 = _riStd(closes, 20, m20), rng = _riSma(_riTr(candles), 20);
    var dev = closes.map(function (cl, i) {
      if (i < 19) return null;
      var h = Math.max.apply(null, hi.slice(i - 19, i + 1)), l = Math.min.apply(null, lo.slice(i - 19, i + 1));
      return cl - ((h + l) / 2 + m20[i]) / 2;
    });
    var mom = _riLinreg(dev, 20);
    var sq = chart.addSeries(LC.HistogramSeries, { priceLineVisible: false, lastValueVisible: false, title: 'Squeeze' }, pane++);
    sq.setData(candles.map(function (b, i) {
      if (mom[i] == null) return { time: b.time };
      var prev = i && mom[i - 1] != null ? mom[i - 1] : mom[i];
      var col = mom[i] >= 0 ? (mom[i] >= prev ? '#16c784' : 'rgba(22,199,132,.45)') : (mom[i] <= prev ? '#ea3943' : 'rgba(234,57,67,.45)');
      return { time: b.time, value: mom[i], color: col };
    }));
    /* The zero line turns gold while the squeeze is on (the Bollinger Bands
       sit inside the Keltner Channel), grey once it is released. */
    chart.addSeries(LC.LineSeries, Object.assign({ color: muted }, thin, { lineWidth: 3 }), sq.paneIndex ? sq.paneIndex() : pane - 1).setData(candles.map(function (b, i) {
      if (m20[i] == null || rng[i] == null) return { time: b.time };
      return { time: b.time, value: 0, color: 2 * sd20[i] < 1.5 * rng[i] ? gold : 'rgba(143,154,171,.35)' };
    }));
  }
  /* The score shares the RSI panel (Daniel, 2026-10-29: "the white
     scoring line should have interaction with rsi ... and crossing should
     be marked"). Both read 0-100, so one scale; a crossing is the day the
     score moves from under the RSI line to over it (red ✕) or back
     under it (green ✕); colours swapped the same day at Daniel's word, as
     he reads them. Shown as a fact on the chart, not a tested signal. */
  if (sc.length) {
    var ss = chart.addSeries(LC.LineSeries, { color: text, lineWidth: 1.5, priceLineVisible: false, lastValueVisible: true, title: 'Score' }, 1);
    var sData = sc.map(function (s) { return { time: _riDay(s.snap_date), value: Number(s.score) }; });
    ss.setData(sData);
    var rsiAt = {}; rsiData.forEach(function (p) { rsiAt[p.time] = p.value; });
    var xm = [], prev = null;
    sData.forEach(function (p) {
      var rv = rsiAt[p.time]; if (rv == null) return;
      var d = p.value - rv;
      if (prev != null && d !== 0 && (prev < 0) !== (d < 0))
        xm.push({ time: p.time, position: 'inBar', color: d > 0 ? red : green, shape: 'circle', size: 0.6, text: '✕' });
      if (d !== 0) prev = d;
    });
    if (xm.length && LC.createSeriesMarkers) LC.createSeriesMarkers(ss, xm);
  }
  var panes = chart.panes ? chart.panes() : [];
  panes.forEach(function (p, i) { if (p.setStretchFactor) p.setStretchFactor(i === 0 ? 3 : i === 1 ? 1.4 : 1); });
  chart._riLen = candles.length;
  chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, candles.length - _riFrame), to: candles.length + 2 });
}
