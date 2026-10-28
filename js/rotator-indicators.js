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
     pane 2  RSI 14 on the daily closes, with the 30 and 70 lines
     pane 3  the Rotator score per day (score_variants_shadow_daily, live
             score column; it starts 2026-10-06)

   Facts on a chart, not calls: the flags are the same dated events the
   board and the channel publish. Loaded only when the big card's
   "Rotator indicators" switch is on (js/coin-expand.js). */

var RI_LIB = 'https://cdn.jsdelivr.net/npm/lightweight-charts@5.2.1/dist/lightweight-charts.standalone.production.js';
var _riLibP = null, _riChart = null;

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
  host.innerHTML = '<div class="ri-note">Loading Rotator indicators…</div>';
  var sym = String(c.sym).toUpperCase();
  var since = new Date(Date.now() - 200 * 864e5).toISOString().slice(0, 10);
  Promise.all([
    _riLib(),
    supaRest('binance_daily_klines', 'GET', { base_asset: 'eq.' + sym, select: 'open_time,high,low,close', order: 'open_time.asc', limit: '220' }),
    supaRest('coin_events', 'GET', { base_asset: 'eq.' + sym, event_type: 'in.(golden_cross,death_cross,rsi_reclaim)', event_date: 'gte.' + since, select: 'event_date,event_type', order: 'event_date.asc', limit: '200' }),
    supaRest('score_variants_shadow_daily', 'GET', { coin_sym: 'eq.' + sym, select: 'snap_date,score', order: 'snap_date.asc', limit: '400' })
  ]).then(function (r) {
    if (host.getAttribute('data-sym') !== c.sym) return;
    var kl = Array.isArray(r[1]) ? r[1] : [], ev = Array.isArray(r[2]) ? r[2] : [], sc = Array.isArray(r[3]) ? r[3] : [];
    if (kl.length < 20) { host.innerHTML = '<div class="ri-note">Not enough daily history for ' + sym + ' yet.</div>'; return; }
    var LC = window.LightweightCharts;
    var text = _riCss('--text', '#d6dbe4'), muted = _riCss('--muted', '#8f9aab'), grid = _riCss('--bdr', 'rgba(128,128,128,.18)');
    var green = _riCss('--green', '#16c784'), red = _riCss('--red', '#ea3943'), gold = _riCss('--gold', '#f3ba2f');
    host.innerHTML = '<div class="ri-legend"><b>Rotator indicators</b> <span class="up">▲ golden cross</span> <span class="dn">▼ death cross</span> <span class="ri-gold">● RSI back above 30</span></div><div class="ri-chart"></div>';
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
    var rsi = chart.addSeries(LC.LineSeries, { color: gold, lineWidth: 1.5, priceLineVisible: false, lastValueVisible: true, title: 'RSI 14' }, 1);
    rsi.setData(_riRsi(candles.map(function (k) { return { t: k.time, v: k.close }; })));
    rsi.createPriceLine({ price: 70, color: red, lineStyle: 2, lineWidth: 1, axisLabelVisible: false });
    rsi.createPriceLine({ price: 30, color: green, lineStyle: 2, lineWidth: 1, axisLabelVisible: false });
    if (sc.length) {
      var ss = chart.addSeries(LC.LineSeries, { color: text, lineWidth: 1.5, priceLineVisible: false, title: 'Score' }, 2);
      ss.setData(sc.map(function (s) { return { time: _riDay(s.snap_date), value: Number(s.score) }; }));
    }
    var panes = chart.panes ? chart.panes() : [];
    if (panes[0] && panes[0].setStretchFactor) panes[0].setStretchFactor(3);
    if (panes[1] && panes[1].setStretchFactor) panes[1].setStretchFactor(1.2);
    if (panes[2] && panes[2].setStretchFactor) panes[2].setStretchFactor(1);
    chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, candles.length - 120), to: candles.length + 2 });
  }).catch(function () {
    if (host.getAttribute('data-sym') !== c.sym) return;
    host.innerHTML = '<div class="ri-note">The indicator chart did not load (an ad blocker may block cdn.jsdelivr.net). Try again after allowing it.</div>';
  });
}
