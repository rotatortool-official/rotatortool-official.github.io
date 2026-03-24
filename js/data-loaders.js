/* ══════════════════════════════════════════════════════════════════
   data-loaders.js  —  All data fetching, scoring, mode switching
                        & the sparkle animation
   
   HOW TO EDIT THIS FILE:
   ──────────────────────
   • CHANGE SCORING WEIGHTS:
       In computeScores() find the three LAYERS:
       L1 = intra-list rank:  adjust the 0.25 / 0.30 / 0.45 weights
       L2 = macro strength:   adjust the 0.40 / 0.30 / 0.15 / 0.15 weights
       L3 = tokenomics:       adjust supplyPts / deflPts / unlockPts values
   
   • CHANGE AUTO-REFRESH INTERVAL:
       Find startAutoRefresh() and change 15*60*1000 (= 15 minutes)
   
   • ADD A NEW DATA SOURCE FOR STOCKS:
       In loadStocks() add a new fallback block after the Yahoo/FMP/AV blocks.
   
   • ADD A NEW FOREX DATA SOURCE:
       In loadForex() add a new fallback block after the frankfurter/ER-API blocks.
══════════════════════════════════════════════════════════════════ */

/* ── Shared runtime state ─────────────────────────────────────── */
var forexData    = [];
var stocksData   = [];
var forexLoaded  = false;
var stocksLoaded = false;
var currentMode  = 'crypto';
var busy         = false;

/* Which modes are enabled (persisted) */
var _modeEnabled = {crypto:true, forex:true, stocks:true};
(function() {
  try {
    var saved = JSON.parse(localStorage.getItem('rot_modes') || '{}');
    ['crypto','forex','stocks'].forEach(function(m) { if (saved[m] === false) _modeEnabled[m] = false; });
  } catch(e) {}
})();

function saveModePrefs() { try { localStorage.setItem('rot_modes', JSON.stringify(_modeEnabled)); } catch(e) {} }

/* ══════════════════════════════════════════════════════════════
   CRYPTO — loadCoins + BTC MA200
══════════════════════════════════════════════════════════════ */
function prog(p, m) { var el = document.getElementById('lmsg'); if (el) el.textContent = m; }

async function loadCoins() {
  prog(10, 'FETCHING COINS…');
  var ids = getActiveCoins().join(',');
  var url = 'https://api.coingecko.com/api/v3/coins/markets'
    + '?vs_currency=usd&ids=' + ids
    + '&order=market_cap_desc&per_page=50&page=1'
    + '&sparkline=false'
    + '&price_change_percentage=7d,14d,30d'
    + '&include_24hr_vol=true';
  var data = await apiFetch(url);
  if (!Array.isArray(data)) throw new Error('CoinGecko data invalid');
  coins = data.map(function(c) {
    return {
      id: c.id, sym: c.symbol.toUpperCase(), name: c.name,
      price: c.current_price, image: c.image, mcap: c.market_cap, rank: 0,
      p24: c.price_change_percentage_24h || 0,
      p7:  c.price_change_percentage_7d_in_currency  || 0,
      p14: c.price_change_percentage_14d_in_currency || 0,
      p30: c.price_change_percentage_30d_in_currency || 0,
      volume24: c.total_volume || 0,
      circulating_supply: c.circulating_supply || 0,
      max_supply: c.max_supply || null,
      ath: c.ath || 0, ath_change_pct: c.ath_change_percentage || 0,
      score: 0, r7: 0, r14: 0, r30: 0, isPro: false
    };
  });
  coins.sort(function(a, b) { return b.mcap - a.mcap; });
  coins.forEach(function(c, i) { c.rank = i + 1; });
  computeScores();
}

async function loadBTC() {
  var btcUrl  = 'https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=200';
  var isCached = getCacheInfo(btcUrl) && getCacheInfo(btcUrl).fresh;
  prog(65, isCached ? 'LOADING BTC MA (CACHED)…' : 'FETCHING BTC 200D MA…');
  if (!isCached) await sleep(1200); /* rate-limit guard: only needed for real network calls */
  var d = await apiFetch(btcUrl);
  if (!d || !Array.isArray(d.prices)) throw new Error('BTC history invalid');
  var p = d.prices, s = 0;
  for (var i = 0; i < p.length; i++) s += p[i][1];
  btcMA200 = s / p.length;
  btcPrice = p[p.length - 1][1];
}

/* ── Macro data (Gold, Silver, Oil, BTC 7D) ──────────────────── */
async function loadMacroData() {
  try {
    var goldUrl  = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=tether-gold&price_change_percentage=7d&per_page=1';
    var goldData = await apiFetch(goldUrl);
    if (Array.isArray(goldData) && goldData.length)
      _macroData.goldP7 = goldData[0].price_change_percentage_7d_in_currency || 0;

    var silverUrl  = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=silver&price_change_percentage=7d&per_page=1';
    var silverData = await apiFetch(silverUrl);
    if (Array.isArray(silverData) && silverData.length)
      _macroData.silverP7 = silverData[0].price_change_percentage_7d_in_currency || 0;

    var btcCoin = coins.find(function(c) { return c.id === 'bitcoin'; });
    if (btcCoin) _macroData.btcP7 = btcCoin.p7;

    var oilUrl  = 'https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=USO&apikey=' + getAVKey();
    var oilData = await apiFetch(oilUrl);
    var oilQ    = oilData && oilData['Global Quote'];
    if (oilQ) _macroData.oilP7 = parseFloat((oilQ['10. change percent'] || '0%').replace('%', '')) || 0;
  } catch(e) { console.warn('Macro data:', e.message); }
}

/* ── Score engine (3 layers) ─────────────────────────────────── */
function computeScores() {
  var n = Math.max(coins.length - 1, 1);

  /* LAYER 1: Intra-list rank (0–40 pts) */
  ['p7','p14','p30'].forEach(function(k) {
    var sorted = coins.slice().sort(function(a, b) { return b[k] - a[k]; });
    sorted.forEach(function(c, i) { c['r' + k.slice(1)] = i + 1; });
  });

  coins.forEach(function(c) {
    /* Weighted rank (lower rank# = better) */
    var wAvg   = (c.r7 * 0.25 + c.r14 * 0.30 + c.r30 * 0.45);
    var layer1 = Math.round((1 - (wAvg - 1) / n) * 40);

    /* LAYER 2: Macro relative strength vs BTC/Gold/Silver/Oil (0–30 pts) */
    var btcP7  = _macroData.btcP7    != null ? _macroData.btcP7    : (coins.find(function(x){ return x.id==='bitcoin'; }) || {p7:0}).p7;
    var goldP7 = _macroData.goldP7   != null ? _macroData.goldP7   : 2;
    var silvP7 = _macroData.silverP7 != null ? _macroData.silverP7 : 1.5;
    var oilP7  = _macroData.oilP7    != null ? _macroData.oilP7    : 1;
    var delta  = (c.p7 - btcP7)*0.40 + (c.p7 - goldP7)*0.30 + (c.p7 - silvP7)*0.15 + (c.p7 - oilP7)*0.15;
    var layer2 = Math.min(30, Math.max(0, Math.round(15 + Math.min(Math.max(delta * 0.9, -15), 15))));

    /* LAYER 3: Tokenomics quality (−50 to +30 pts) */
    var tkx      = TOKENOMICS_DB[c.id] || {deflation:'none', unlockRisk:'medium'};
    var supplyPts = 0;
    if (c.circulating_supply && c.max_supply && c.max_supply > 0) {
      var ratio = c.circulating_supply / c.max_supply;
      if      (ratio > 0.90) supplyPts =  10;
      else if (ratio > 0.70) supplyPts =   5;
      else if (ratio > 0.40) supplyPts =   0;
      else if (ratio > 0.20) supplyPts = -15;
      else                   supplyPts = -25;
    } else if (!c.max_supply) { supplyPts = -3; }
    var deflPts   = tkx.deflation  === 'full' ? 15 : tkx.deflation  === 'partial' ? 8 : tkx.deflation === 'fixed' ? 5 : 0;
    var unlockPts = tkx.unlockRisk === 'low'  ?  0 : tkx.unlockRisk === 'medium'  ? -5 : -10;
    var layer3    = Math.min(30, Math.max(-50, supplyPts + deflPts + unlockPts));

    c.score = Math.min(100, Math.max(-50, Math.round(layer1 + layer2 + layer3)));
    c.scoreBreakdown = {layer1, layer2, layer3, supplyPts, deflPts, unlockPts};
  });
}

/* ══════════════════════════════════════════════════════════════
   FOREX — loadForex
══════════════════════════════════════════════════════════════ */
function calcRSI(closes, period) {
  if (!closes || closes.length < period + 1) return 50;
  var gains = 0, losses = 0;
  for (var i = closes.length - period; i < closes.length; i++) {
    var d = closes[i] - closes[i-1];
    if (d >= 0) gains += d; else losses -= d;
  }
  var avgG = gains / period, avgL = losses / period;
  if (avgL === 0) return 100;
  return Math.round(100 - (100 / (1 + avgG / avgL)));
}

function calcForexScore(closes) {
  if (!closes || closes.length < 2) return {score:50, rsi:50, signal:'NO DATA', sigC:'var(--muted)', p7:0, p30:0};
  var latest  = closes[closes.length - 1];
  var p7base  = closes.length >= 8  ? closes[closes.length - 8]  : closes[0];
  var p30base = closes.length >= 22 ? closes[closes.length - 22] : closes[0];
  var chg7  = p7base  ? ((latest - p7base)  / p7base  * 100) : 0;
  var chg30 = p30base ? ((latest - p30base) / p30base * 100) : 0;
  var mom7  = Math.round(50 + Math.min(Math.max(chg7  * 12, -48), 48));
  var mom30 = Math.round(50 + Math.min(Math.max(chg30 *  7, -48), 48));
  var rsiVal = calcRSI(closes, Math.min(14, closes.length - 1));
  var score  = Math.min(100, Math.max(0, Math.round(mom7*0.40 + mom30*0.35 + rsiVal*0.25)));
  var signal, sigC;
  if      (rsiVal >= 70 && chg7 > 0) { signal = 'OVERBOUGHT'; sigC = 'var(--red)';   }
  else if (rsiVal <= 30 && chg7 < 0) { signal = 'OVERSOLD';   sigC = 'var(--green)'; }
  else if (score >= 65)               { signal = 'BULLISH';    sigC = 'var(--green)'; }
  else if (score <= 35)               { signal = 'BEARISH';    sigC = 'var(--red)';   }
  else                                { signal = 'NEUTRAL';    sigC = 'var(--muted)'; }
  return {score, rsi:rsiVal, signal, sigC, p7:chg7, p30:chg30};
}

async function loadForex() {
  var loading = document.getElementById('forex-loading');
  loading.style.display = 'block';
  forexData = [];

  var pairsToLoad = isPro ? FOREX_PAIRS : FOREX_PAIRS.filter(function(p) { return !p.pro; });
  var rateHistory = {};

  /* Group standard ISO pairs by base to minimise API calls */
  var bases = {};
  pairsToLoad.forEach(function(p) {
    if (p.from === 'XAU' || p.from === 'XTI') return; /* handled separately */
    if (!bases[p.from]) bases[p.from] = [];
    if (bases[p.from].indexOf(p.to) < 0) bases[p.from].push(p.to);
  });

  var startDate = dateOffset(-60); /* 60 days covers weekends + holidays */

  /* ── Primary source: Frankfurter (ECB data, free, no key) ── */
  var frankfurterFailed = false;
  await Promise.all(Object.keys(bases).map(async function(base) {
    try {
      var url  = 'https://api.frankfurter.app/' + startDate + '..?from=' + base + '&to=' + bases[base].join(',');
      var data = await apiFetch(url);
      if (data && data.rates && Object.keys(data.rates).length > 0) {
        var dates    = Object.keys(data.rates).sort();
        var quoteArr = {};
        dates.forEach(function(d) {
          var dayRates = data.rates[d] || {};
          Object.keys(dayRates).forEach(function(q) {
            if (!quoteArr[q]) quoteArr[q] = [];
            quoteArr[q].push(dayRates[q]);
          });
        });
        rateHistory[base] = quoteArr;
      } else { frankfurterFailed = true; }
    } catch(e) { console.warn('Frankfurter failed for ' + base + ':', e.message); frankfurterFailed = true; }
  }));

  /* ── Fallback: open.er-api.com (free, CORS-friendly, daily rates) ── */
  if (frankfurterFailed || Object.keys(rateHistory).length < Object.keys(bases).length) {
    try {
      var erData = await apiFetch('https://open.er-api.com/v6/latest/USD');
      if (erData && erData.rates) {
        Object.keys(bases).forEach(function(base) {
          if (rateHistory[base] && Object.keys(rateHistory[base]).length > 0) return;
          var baseInUSD = erData.rates[base];
          if (!baseInUSD) return;
          if (!rateHistory[base]) rateHistory[base] = {};
          bases[base].forEach(function(quote) {
            if (rateHistory[base][quote] && rateHistory[base][quote].length > 0) return;
            var quoteInUSD = erData.rates[quote];
            if (!quoteInUSD) return;
            var rate = quoteInUSD / baseInUSD;
            rateHistory[base][quote] = [rate * 0.999, rate]; /* synthetic 2-point history */
          });
        });
      }
    } catch(e) { console.warn('ExchangeRate fallback failed:', e.message); }
  }

  /* ── Build forexData from history ── */
  var results = pairsToLoad.map(function(pair) {
    /* XAU (gold) / XTI (oil) — use macro data already loaded */
    if (pair.from === 'XAU' || pair.from === 'XTI') {
      if (pair.from === 'XAU' && _macroData.goldP7 != null) {
        var gp7   = _macroData.goldP7;
        var score = Math.round(50 + Math.min(Math.max(gp7 * 8, -45), 45));
        var signal = score >= 65 ? 'BULLISH' : score <= 35 ? 'BEARISH' : 'NEUTRAL';
        var sigC   = score >= 65 ? 'var(--green)' : score <= 35 ? 'var(--red)' : 'var(--muted)';
        return {from:pair.from, to:pair.to, name:pair.name, pro:pair.pro, rate:0, chg:0, chgPct:gp7, score, rsi:50, signal, sigC, p7:gp7, p30:0};
      }
      return {from:pair.from, to:pair.to, name:pair.name, pro:pair.pro, rate:0, chg:0, chgPct:0, score:50, rsi:50, signal:'N/A', sigC:'var(--muted)', p7:0, p30:0};
    }

    var hist = rateHistory[pair.from] && rateHistory[pair.from][pair.to];
    if (hist && hist.length >= 2) {
      var latest = hist[hist.length - 1], prev = hist[hist.length - 2];
      var chg    = latest - prev, chgPct = prev ? ((chg / prev) * 100) : 0;
      var scored = calcForexScore(hist);
      return {from:pair.from, to:pair.to, name:pair.name, pro:pair.pro,
        rate:latest, chg, chgPct, score:scored.score, rsi:scored.rsi, signal:scored.signal,
        sigC:scored.sigC, p7:scored.p7, p30:scored.p30};
    }
    return {from:pair.from, to:pair.to, name:pair.name, pro:pair.pro,
      rate:0, chg:0, chgPct:0, score:0, rsi:50, signal:'—', sigC:'var(--muted)', p7:0, p30:0, err:true};
  });

  forexData = results.filter(Boolean);

  /* Append locked Pro pair stubs for free users */
  if (!isPro) {
    FOREX_PAIRS.filter(function(p) { return p.pro; }).forEach(function(p) {
      forexData.push({from:p.from, to:p.to, name:p.name, pro:true, locked:true,
        rate:0, chg:0, chgPct:0, score:0, rsi:50, signal:'PRO', sigC:'var(--pro)'});
    });
  }

  forexLoaded = true;
  loading.style.display = 'none';
  var fxTiles = document.getElementById('forex-tiles');
  if (fxTiles) fxTiles.style.display = '';
  renderForexTable();
  renderFxTiles();
}

/* ══════════════════════════════════════════════════════════════
   STOCKS — loadStocks
══════════════════════════════════════════════════════════════ */
function calcStockScore(price, high52, low52, chgPct) {
  var range = high52 - low52;
  var pos   = range > 0 ? Math.round(((price - low52) / range) * 100) : 50;
  var mom   = 50 + Math.min(Math.max(chgPct * 5, -40), 40);
  return Math.min(100, Math.max(0, Math.round(pos * 0.6 + mom * 0.4)));
}

async function fetchStocksYahoo(syms) {
  var url = 'https://query1.finance.yahoo.com/v7/finance/quote?symbols=' + encodeURIComponent(syms.join(','))
    + '&fields=shortName,regularMarketPrice,regularMarketChange,regularMarketChangePercent,fiftyTwoWeekHigh,fiftyTwoWeekLow';
  var data = await apiFetch(url);
  return (data && data.quoteResponse && data.quoteResponse.result) || [];
}

async function fetchStockAV(avSym) {
  var url  = 'https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=' + avSym + '&apikey=' + getAVKey();
  var data = await apiFetch(url);
  var q    = data && data['Global Quote'];
  if (!q || !q['05. price']) return null;
  var price   = parseFloat(q['05. price']) || 0;
  var chg     = parseFloat(q['09. change']) || 0;
  var chgPct  = parseFloat((q['10. change percent'] || '0').replace('%','')) || 0;
  var high52  = price * 1.35; /* rough fallback — AV GLOBAL_QUOTE doesn't include 52w */
  var low52   = price * 0.65;
  return {price, chg, chgPct, high52, low52};
}

async function loadStocks() {
  var loading = document.getElementById('stocks-loading');
  loading.style.display = 'block';
  stocksData = [];
  var yahooOk = false;

  /* ── Primary: Yahoo Finance (all symbols in one request) ── */
  try {
    var allSyms = STOCKS_LIST.map(function(s) { return s.sym; });
    var quotes  = await fetchStocksYahoo(allSyms);
    if (quotes.length > 0) {
      stocksData = STOCKS_LIST.map(function(s) {
        var q = quotes.find(function(r) { return r.symbol === s.sym; });
        if (!q) return {sym:s.sym, name:s.name, type:s.type, av:s.av, price:0, chg:0, chgPct:0, high52:0, low52:0, score:0, err:true};
        var price  = q.regularMarketPrice || 0;
        var high52 = q.fiftyTwoWeekHigh   || price * 1.3;
        var low52  = q.fiftyTwoWeekLow    || price * 0.7;
        return {sym:s.sym, name:q.shortName||s.name, type:s.type, av:s.av,
          price, chg:q.regularMarketChange||0, chgPct:q.regularMarketChangePercent||0,
          high52, low52, score:calcStockScore(price, high52, low52, q.regularMarketChangePercent||0)};
      });
      yahooOk = true;
    }
  } catch(e) { console.warn('Yahoo stocks failed:', e.message); }

  /* ── Fallback 1: Financial Modeling Prep (free, no key, CORS-friendly) ── */
  if (!yahooOk) {
    loading.textContent = 'LOADING VIA FMP…';
    try {
      var fmpSyms = STOCKS_LIST.map(function(s) { return s.av || s.sym; }).filter(Boolean).join(',');
      var fmpData = await apiFetch('https://financialmodelingprep.com/api/v3/quote/' + encodeURIComponent(fmpSyms) + '?apikey=demo');
      if (Array.isArray(fmpData) && fmpData.length > 0) {
        stocksData = STOCKS_LIST.map(function(s) {
          var q = fmpData.find(function(r) { return r.symbol === (s.av || s.sym); });
          if (!q) return {sym:s.sym, name:s.name, type:s.type, av:s.av, price:0, chg:0, chgPct:0, high52:0, low52:0, score:0, err:true};
          var price  = q.price || 0, high52 = q.yearHigh || price*1.3, low52 = q.yearLow || price*0.7;
          return {sym:s.sym, name:q.name||s.name, type:s.type, av:s.av,
            price, chg:q.change||0, chgPct:q.changesPercentage||0, high52, low52,
            score:calcStockScore(price, high52, low52, q.changesPercentage||0)};
        });
        yahooOk = true;
      }
    } catch(e) { console.warn('FMP fallback failed:', e.message); }
  }

  /* ── Fallback 2: Alpha Vantage (rate-limited — rotates keys on 429) ── */
  if (!yahooOk) {
    loading.textContent = 'LOADING VIA ALPHA VANTAGE…';
    var results = STOCKS_LIST.map(function(s) {
      return {sym:s.sym, name:s.name, type:s.type, av:s.av, price:0, chg:0, chgPct:0, high52:0, low52:0, score:0, err:true};
    });
    var avStocks  = STOCKS_LIST.filter(function(s) { return s.av; });
    var batchSize = 5;
    for (var b = 0; b < avStocks.length; b += batchSize) {
      var batch = avStocks.slice(b, b + batchSize);
      await Promise.all(batch.map(async function(s) {
        try {
          var q = await fetchStockAV(s.av);
          if (!q) { q = await fetchStockAV((rotateAVKey(), s.av)); } /* rotate key on failure */
          if (q) {
            var idx = results.findIndex(function(r) { return r.sym === s.sym; });
            if (idx >= 0) results[idx] = Object.assign(results[idx], q, {
              name: s.name, err: false, score: calcStockScore(q.price, q.high52, q.low52, q.chgPct)
            });
          }
        } catch(e) {}
      }));
      if (b + batchSize < avStocks.length) await sleep(1000);
    }
    stocksData = results;
  }

  stocksLoaded = true;
  loading.style.display = 'none';
  var stTiles = document.getElementById('stocks-tiles');
  if (stTiles) stTiles.style.display = '';
  renderStocksTable();
  renderStHoldings();
}

/* Stocks tile grid (market screener) */
function renderStocksTable() {
  var grid = document.getElementById('stocks-tiles');
  if (!grid || !stocksData.length) return;
  grid.innerHTML = stocksData.map(function(s) {
    var scC    = s.score >= 65 ? 'var(--green)' : s.score <= 35 ? 'var(--red)' : 'var(--amber)';
    var dayC   = s.chgPct > 0.01 ? 'up' : s.chgPct < -0.01 ? 'dn' : 'fl';
    var isBig  = s.price >= 1000;
    var priceStr = isBig ? '$' + s.price.toLocaleString('en-US', {maximumFractionDigits:0}) : '$' + (s.price||0).toFixed(2);
    var glowCls  = s.score >= 65 ? 'score-hi' : s.score <= 35 ? 'score-lo' : '';
    return '<div class="asset-tile type-' + s.type + ' ' + glowCls + '" onclick="openAssetDetail(\'stock\',\'' + s.sym + '\',event)" title="Click for details">'
      + '<div class="at-head">'
        + '<div style="min-width:0;flex:1;">'
          + '<div style="display:flex;align-items:center;gap:4px;">'
            + '<span class="at-sym">' + s.sym + '</span>'
            + '<span class="at-badge ' + (s.type==='index'?'idx':'stk') + '">' + (s.type==='index'?'INDEX':'STOCK') + '</span>'
          + '</div>'
          + '<div class="at-name">' + s.name + '</div>'
        + '</div>'
      + '</div>'
      + '<div class="at-price">' + (s.err ? '—' : priceStr) + '<span style="font-size:10px;font-weight:600;margin-left:5px;color:' + (s.chgPct>=0?'var(--green)':'var(--red)') + ';">' + (s.err?'':'(' + (s.chgPct>=0?'+':'') + s.chgPct.toFixed(2) + '%)') + '</span></div>'
      + '<div class="at-stats">'
        + '<div class="at-stat"><div class="at-stat-l">52W H</div><div class="at-stat-v bnb">' + (s.high52?'$'+s.high52.toFixed(0):'—') + '</div></div>'
        + '<div class="at-stat"><div class="at-stat-l">52W L</div><div class="at-stat-v bnb">'  + (s.low52?'$'+s.low52.toFixed(0):'—')  + '</div></div>'
        + '<div class="at-stat"><div class="at-stat-l">SCR</div><div class="at-stat-v" style="color:' + scC + ';">' + s.score + '</div></div>'
      + '</div>'
      + '<div class="at-foot">'
        + '<span class="at-signal ' + (s.score>=65?'bull':s.score<=35?'bear':'neu') + '">' + (s.score>=65?'MOMENTUM':s.score<=35?'LAGGING':'NEUTRAL') + '</span>'
        + '<span class="at-score" style="color:' + scC + ';">' + s.score + '</span>'
      + '</div>'
      + '</div>';
  }).join('');
}

/* Forex tile grid (market screener) — full version (already in holdings for held tiles) */
function renderForexTable() {
  var grid = document.getElementById('forex-tiles');
  if (!grid) return;
  if (!forexData.length) { grid.innerHTML = '<div class="no-sug">No forex data yet.</div>'; return; }
  grid.innerHTML = forexData.map(function(p) {
    if (p.locked) {
      return '<div class="asset-tile type-forex" style="opacity:.5;cursor:pointer;" onclick="openPro()" title="Pro feature">'
        + '<div class="at-head"><div><div class="at-sym forex-sym">' + p.from + '/' + p.to + '</div>'
        + '<div class="at-name">' + p.name + '</div></div>'
        + '<span class="at-badge fx">⚡PRO</span></div>'
        + '<div style="font-size:10px;color:var(--pro);margin-top:8px;letter-spacing:.06em;">UNLOCK FREE →</div>'
        + '</div>';
    }
    var isHeld  = fxHoldings.some(function(h) { return h.pair === p.from + '/' + p.to; });
    var isJPY   = p.to === 'JPY' || p.to === 'MXN';
    var dec     = isJPY ? 3 : 5;
    var rateStr = p.rate ? p.rate.toFixed(dec) : '—';
    var scC     = p.score >= 65 ? 'var(--green)' : p.score <= 35 ? 'var(--red)' : 'var(--amber)';
    var dayC    = p.chgPct > 0.001 ? 'up' : p.chgPct < -0.001 ? 'dn' : 'fl';
    var dayStr  = p.chgPct ? (p.chgPct>=0?'+':'') + p.chgPct.toFixed(3) + '%' : '—';
    var p7  = p.p7  || 0, p7C  = p7  > 0.001 ? 'up' : p7  < -0.001 ? 'dn' : 'fl';
    var p30 = p.p30 || 0, p30C = p30 > 0.001 ? 'up' : p30 < -0.001 ? 'dn' : 'fl';
    var isCom   = p.from==='XAU' || p.from==='XTI' || p.from==='XAG';
    var typeCls = isCom ? 'type-commodity' : 'type-forex';
    var badgeCls = isCom ? 'cmd' : 'fx', badgeTxt = isCom ? 'CMDTY' : 'FOREX';
    var sigCls  = p.signal==='BULLISH'||p.signal==='OVERSOLD' ? 'bull'
                : p.signal==='BEARISH'||p.signal==='OVERBOUGHT' ? 'bear' : 'neu';
    var glowCls = p.score >= 65 ? 'score-hi' : p.score <= 35 ? 'score-lo' : '';
    var fxId = p.from + '/' + p.to;
    return '<div class="asset-tile ' + typeCls + ' ' + glowCls + (isHeld ? ' held' : '')
      + '" onclick="openAssetDetail(\'forex\',\'' + fxId + '\',event)" title="Click for details">'
      + '<div class="at-head"><div style="min-width:0;flex:1;">'
        + '<div style="display:flex;align-items:center;gap:4px;">'
          + '<span class="at-sym forex-sym">' + p.from + '<span style="color:var(--muted);font-weight:400;">/</span>' + p.to + '</span>'
          + '<span class="at-badge ' + badgeCls + '">' + badgeTxt + '</span>'
          + (isHeld ? '<span class="at-held-tag">HELD</span>' : '')
        + '</div>'
        + '<div class="at-name">' + p.name + '</div>'
      + '</div></div>'
      + '<div class="at-price">' + rateStr + '<span style="font-size:10px;font-weight:600;margin-left:5px;color:' + (p.chgPct>=0?'var(--green)':'var(--red)') + ';">' + dayStr + '</span></div>'
      + '<div class="at-stats">'
        + '<div class="at-stat"><div class="at-stat-l">7D</div><div class="at-stat-v '  + p7C  + '">' + (p7>=0?'+':'')  + p7.toFixed(2)  + '%</div></div>'
        + '<div class="at-stat"><div class="at-stat-l">30D</div><div class="at-stat-v ' + p30C + '">' + (p30>=0?'+':'') + p30.toFixed(2) + '%</div></div>'
        + '<div class="at-stat"><div class="at-stat-l">RSI</div><div class="at-stat-v ' + (p.rsi>=70?'dn':p.rsi<=30?'up':'fl') + '">' + p.rsi + '</div></div>'
      + '</div>'
      + '<div class="at-foot">'
        + '<span class="at-signal ' + sigCls + '">' + p.signal + '</span>'
        + '<div style="display:flex;align-items:center;gap:4px;">'
          + '<div style="width:28px;height:3px;background:var(--bg3);border-radius:2px;overflow:hidden;">'
            + '<div style="width:' + p.score + '%;height:100%;background:' + scC + ';border-radius:2px;"></div>'
          + '</div>'
          + '<span class="at-score" style="color:' + scC + ';">' + p.score + '</span>'
        + '</div>'
      + '</div>'
      + '</div>';
  }).join('');
}

/* ══════════════════════════════════════════════════════════════
   MODE SWITCHER
══════════════════════════════════════════════════════════════ */
function toggleModeVisibility(mode, on) {
  _modeEnabled[mode] = on;
  saveModePrefs();
  var btn = document.getElementById('am-' + mode);
  if (btn) btn.style.display = on ? '' : 'none';
  if (!on && currentMode === mode) {
    var fallback = ['crypto','forex','stocks'].find(function(m) { return _modeEnabled[m]; });
    if (fallback) setMode(fallback);
  }
  var chk = document.getElementById('mode-' + mode + '-toggle');
  if (chk) chk.checked = on;
}

function setMode(mode) {
  if (!_modeEnabled[mode]) return;
  currentMode = mode;
  ['crypto','forex','stocks'].forEach(function(m) {
    var b = document.getElementById('am-' + m);
    if (b) b.classList.toggle('active', m === mode);
    var h = document.getElementById('holdings-' + m);
    if (h) h.style.display = m === mode ? (m === 'crypto' ? '' : 'flex') : 'none';
  });
  document.getElementById('crypto-panel').style.display = mode === 'crypto' ? '' : 'none';
  document.getElementById('forex-panel').style.display  = mode === 'forex'  ? '' : 'none';
  document.getElementById('stocks-panel').style.display = mode === 'stocks' ? '' : 'none';
  document.getElementById('sort-tabs').style.display    = mode === 'crypto' ? '' : 'none';
  var titles = {crypto:'PERFORMANCE LEADERBOARD', forex:'FOREX PAIRS', stocks:'MARKET SCREENER'};
  document.getElementById('tbl-title').textContent = titles[mode];
  if (mode === 'forex'  && !forexLoaded)  loadForex();
  if (mode === 'stocks' && !stocksLoaded) loadStocks();
}

function applyModePrefs() {
  ['crypto','forex','stocks'].forEach(function(m) {
    var btn = document.getElementById('am-' + m);
    var chk = document.getElementById('mode-' + m + '-toggle');
    if (!_modeEnabled[m] && btn) btn.style.display = 'none';
    if (chk) chk.checked = _modeEnabled[m];
  });
}

/* ══════════════════════════════════════════════════════════════
   LOAD / REFRESH / AUTO-REFRESH
══════════════════════════════════════════════════════════════ */
var _autoRefreshTimer = null;
function startAutoRefresh() {
  if (_autoRefreshTimer) clearInterval(_autoRefreshTimer);
  _autoRefreshTimer = setInterval(function() {
    if (!busy && currentMode === 'crypto') doRefresh();
  }, 15*60*1000); /* 15 minutes — change here */
}

async function doLoad() {
  processIncomingRef();
  var _d = checkMyReferrals();
  isPro  = _d.pro || loadPro();
  busy   = true;
  try {
    await loadCoins();   prog(50, 'SCORING…');  renderCoinSel();
    await loadMacroData(); prog(58, 'MACRO…');
    await loadBTC();     prog(92, 'RENDERING…');
    applyModePrefs();
    renderAll();         prog(100, 'READY');
    await sleep(320);
    document.getElementById('loader').classList.add('gone');
    startAutoRefresh();
  } catch(e) {
    document.getElementById('lmsg').textContent = 'ERROR: ' + e.message;
    document.getElementById('lbf').style.background = 'var(--red)';
  }
  busy = false;
}

async function doRefresh() {
  if (busy) return;
  busy = true;
  var tsEl = document.getElementById('ts');
  if (tsEl) tsEl.style.color = 'var(--bnb)';
  try {
    await loadCoins();
    var btcUrl  = 'https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=200';
    var btcInfo = getCacheInfo(btcUrl);
    if (!btcInfo || !btcInfo.fresh) await sleep(1200);
    await loadBTC();
    renderAll();
  } catch(e) { console.error(e); }
  if (tsEl) setTimeout(function() { tsEl.style.color = ''; }, 600);
  busy = false;
}

/* ══════════════════════════════════════════════════════════════
   SPARKLE ANIMATION  (Pro — top tile)
══════════════════════════════════════════════════════════════ */
function startSparkle(canvas) {
  var ctx = canvas.getContext('2d');
  var W   = canvas.offsetWidth || 140, H = canvas.offsetHeight || 100;
  canvas.width = W; canvas.height = H;
  var pts = [];
  var si  = setInterval(function() {
    for (var i = 0; i < 3; i++) pts.push({
      x: Math.random()*W, y: Math.random()*H,
      r: Math.random()*2 + 0.5, life: 1,
      decay: Math.random()*0.018 + 0.01,
      vx: (Math.random()-0.5)*0.9, vy: (Math.random()-0.5)*0.9,
      h: 38 + Math.random()*20
    });
  }, 70);
  var raf;
  function frame() {
    ctx.clearRect(0, 0, W, H);
    pts = pts.filter(function(p) { return p.life > 0; });
    pts.forEach(function(p) {
      p.x += p.vx; p.y += p.vy; p.life -= p.decay;
      ctx.save();
      ctx.globalAlpha = p.life * 0.85;
      ctx.fillStyle   = 'hsl(' + p.h + ',95%,68%)';
      ctx.shadowColor = 'hsl(' + p.h + ',100%,60%)';
      ctx.shadowBlur  = 5;
      var s = p.r, x = p.x, y = p.y;
      ctx.beginPath();
      ctx.moveTo(x, y-s*2.8); ctx.lineTo(x+s*0.4, y-s*0.4);
      ctx.lineTo(x+s*2.8, y); ctx.lineTo(x+s*0.4, y+s*0.4);
      ctx.lineTo(x, y+s*2.8); ctx.lineTo(x-s*0.4, y+s*0.4);
      ctx.lineTo(x-s*2.8, y); ctx.lineTo(x-s*0.4, y-s*0.4);
      ctx.closePath(); ctx.fill(); ctx.restore();
    });
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  return function() { clearInterval(si); cancelAnimationFrame(raf); ctx.clearRect(0, 0, W, H); };
}

/* ── Dismiss bear banner ─────────────────────────────────────── */
function dismissBearBanner() {
  _bearDismissed = true;
  try { localStorage.setItem('rot_bear_dismissed', '1'); } catch(e) {}
  document.getElementById('bear-banner').classList.remove('show');
}

/* ── Mobile holdings panel ───────────────────────────────────── */
var _mobHoldingsOpen = false;
function mobNav(mode) {
  _mobHoldingsOpen = false;
  document.getElementById('mob-holdings-panel').classList.remove('open');
  ['crypto','forex','stocks','holdings'].forEach(function(m) {
    var b = document.getElementById('mn-' + m);
    if (b) b.classList.toggle('active', m === mode);
  });
  setMode(mode);
}
function mobNavHoldings() {
  _mobHoldingsOpen = !_mobHoldingsOpen;
  var panel = document.getElementById('mob-holdings-panel');
  var btn   = document.getElementById('mn-holdings');
  panel.classList.toggle('open', _mobHoldingsOpen);
  if (btn) btn.classList.toggle('active', _mobHoldingsOpen);
  if (_mobHoldingsOpen) {
    var src = document.getElementById('holdings-' + (currentMode || 'crypto'));
    if (src) {
      panel.innerHTML = '';
      var clone = src.cloneNode(true);
      clone.style.display = 'flex'; clone.style.flexDirection = 'column';
      panel.appendChild(clone);

      /* ── Re-wire ADD button to use cloned inputs, then sync to desktop ── */
      var addBtn = panel.querySelector('.add-btn');
      if (addBtn) {
        addBtn.onclick = function() {
          var mode = currentMode || 'crypto';
          if (mode === 'crypto') {
            var selEl = panel.querySelector('select');
            var qtyEl = panel.querySelector('input[placeholder="amount"]');
            var avgEl = panel.querySelector('input[placeholder="avg buy price"]');
            var sym = selEl ? selEl.value : '';
            if (!sym) return;
            var dSel = document.getElementById('coin-sel');
            var dQty = document.getElementById('inp-qty');
            var dAvg = document.getElementById('inp-avg');
            if (dSel) dSel.value = sym;
            if (dQty) dQty.value = qtyEl ? (parseFloat(qtyEl.value) || '') : '';
            if (dAvg) dAvg.value = avgEl ? (parseFloat(avgEl.value) || '') : '';
            addHolding();
            if (selEl) selEl.value = '';
            if (qtyEl) qtyEl.value = '';
            if (avgEl) avgEl.value = '';
          } else if (mode === 'forex') {
            var fromEl = panel.querySelector('#fx-from, select[id*="from"]');
            var toEl   = panel.querySelector('#fx-to, select[id*="to"]');
            var dFrom  = document.getElementById('fx-from');
            var dTo    = document.getElementById('fx-to');
            if (fromEl && dFrom) dFrom.value = fromEl.value;
            if (toEl   && dTo)   dTo.value   = toEl.value;
            addForexHolding();
          } else if (mode === 'stocks') {
            var stSelEl = panel.querySelector('#st-sel, select[id*="st"]');
            var stQtyEl = panel.querySelector('input[placeholder*="shares"]');
            var stAvgEl = panel.querySelector('input[placeholder*="price"]');
            var dStSel = document.getElementById('st-sel');
            var dStQty = document.getElementById('inp-st-qty');
            var dStAvg = document.getElementById('inp-st-avg');
            if (dStSel && stSelEl) dStSel.value = stSelEl.value;
            if (dStQty && stQtyEl) dStQty.value = parseFloat(stQtyEl.value) || '';
            if (dStAvg && stAvgEl) dStAvg.value = parseFloat(stAvgEl.value) || '';
            addStockHolding();
          }
        };
      }

      /* Re-wire Enter key on mobile inputs */
      panel.querySelectorAll('input[type="number"]').forEach(function(inp) {
        inp.addEventListener('keydown', function(e) {
          if (e.key === 'Enter' && addBtn) addBtn.click();
        });
      });
    }
  }
}

/* ── Language system ─────────────────────────────────────────── */
var LANG_STRINGS = {
  en:{support:'☕ SUPPORT',    unlockpro:'⚡ UNLOCK PRO',         flag:'🇬🇧'},
  zh:{support:'☕ 支持',       unlockpro:'⚡ 解锁专业版',           flag:'🇨🇳'},
  ar:{support:'☕ دعم',        unlockpro:'⚡ الترقية',             flag:'🇸🇦'},
  es:{support:'☕ APOYAR',     unlockpro:'⚡ DESBLOQUEAR PRO',     flag:'🇪🇸'},
  fr:{support:'☕ SOUTENIR',   unlockpro:'⚡ DÉBLOQUER PRO',       flag:'🇫🇷'},
  de:{support:'☕ UNTERSTÜTZEN',unlockpro:'⚡ PRO FREISCHALTEN',   flag:'🇩🇪'},
  mk:{support:'☕ ПОДДРЖИ',    unlockpro:'⚡ ОТКЛУЧИ ПРО',         flag:'🇲🇰'}
};
var currentLang = 'en';
function setLang(lang) {
  currentLang = lang;
  var s = LANG_STRINGS[lang] || LANG_STRINGS.en;
  var flagEl  = document.getElementById('lang-flag');
  if (flagEl) flagEl.textContent = s.flag;
  ['en','zh','ar','es','fr','de','mk'].forEach(function(l) {
    var b = document.getElementById('lbtn-' + l);
    if (b) b.classList.toggle('active', l === lang);
  });
  var donate = document.querySelector('.btn.donate');
  if (donate) donate.textContent = s.support;
  var pro = document.querySelector('.btn.pro-btn');
  if (pro && !pro.textContent.includes('ACTIVE')) pro.textContent = s.unlockpro;
  try { localStorage.setItem('rot_lang', lang); } catch(e) {}
}
(function() { try { var l = localStorage.getItem('rot_lang'); if (l) setTimeout(function() { setLang(l); }, 50); } catch(e) {} })();

/* ── Tooltip system ──────────────────────────────────────────── */
var tipEl = null;
function getTip() { if (!tipEl) tipEl = document.getElementById('rt-tip'); return tipEl; }
function showTip(title, body, x, y) {
  var t = getTip();
  document.getElementById('rt-tip-title').textContent = title;
  document.getElementById('rt-tip-body').innerHTML    = body;
  t.classList.add('show');
  var tw = 220, lx = x+14, ly = y+14;
  if (lx+tw > window.innerWidth-10)  lx = x-tw-8;
  if (ly+100 > window.innerHeight-10) ly = y-100-8;
  t.style.left = lx + 'px'; t.style.top = ly + 'px';
}
function hideTip() { var t = getTip(); if (t) t.classList.remove('show'); }
function showRowTip(row, e) {
  var sym   = row.getAttribute('data-sym');
  var name  = row.getAttribute('data-name');
  var mcap  = row.getAttribute('data-mcap');
  var score = row.getAttribute('data-score');
  var p24   = row.getAttribute('data-p24');
  var p7    = row.getAttribute('data-p7');
  var p30   = row.getAttribute('data-p30');
  var held  = row.getAttribute('data-held') === '1';
  var scN   = parseInt(score);
  var signal = scN >= 65 ? '⬆ Strong momentum' : scN >= 45 ? '→ Neutral' : '⬇ Lagging — watch closely';
  var body  = 'Market Cap: <strong style="color:var(--bnb)">' + mcap + '</strong><br>'
    + '24H: <strong>' + (parseFloat(p24)>=0?'+':'') + p24 + '%</strong> &nbsp; '
    + '7D: <strong>'  + (parseFloat(p7)>=0?'+':'')  + p7  + '%</strong> &nbsp; '
    + '30D: <strong>' + (parseFloat(p30)>=0?'+':'') + p30 + '%</strong><br>'
    + 'Signal: <strong>' + signal + '</strong>'
    + (held ? '<br><span style="color:var(--bnb)">✓ In your holdings</span>' : '');
  showTip(sym + ' — ' + name, body, e.clientX, e.clientY);
}
document.addEventListener('DOMContentLoaded', function() {
  document.querySelectorAll('th[data-tip]').forEach(function(th) {
    th.addEventListener('mouseenter', function(e) { showTip(th.textContent.replace('⚡','').trim(), th.getAttribute('data-tip'), e.clientX, e.clientY); });
    th.addEventListener('mouseleave', hideTip);
  });
});

/* ── Modal helpers ───────────────────────────────────────────── */
function openModal(id) {
  document.getElementById(id).classList.add('show');
  if (id === 'donate-modal') renderDonationBar('donate-modal-goal');
}
function closeModal(id) { document.getElementById(id).classList.remove('show'); }
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') { closeModal('donate-modal'); closeModal('pro-modal'); }
});

/* ── Asset tile click delegation ─────────────────────────────── */
document.addEventListener('click', function(e) {
  var tile = e.target.closest('[data-assettype]');
  if (!tile) return;
  var type = tile.getAttribute('data-assettype');
  var id   = tile.getAttribute('data-assetid');
  if (type && id) openAssetDetail(type, id, e);
});

/* ── Entry point ─────────────────────────────────────────────── */
doLoad().then(function() { initTutorial(); });

/* ══════════════════════════════
   SPLASH SCREEN LOGO ANIMATION
══════════════════════════════ */
(function(){
  var canvas=document.getElementById('splash-c');
  if(!canvas) return;
  var ctx=canvas.getContext('2d');
  var CW=canvas.width,CH=canvas.height;
  var FS=52,FONT='bold '+FS+'px "IBM Plex Mono"';
  var BASE=112,GOLD='#f3ba2f',RED='#ff4560',GREEN='#00c896';
  var fc=0,phase='pause1',pf=0,PAUSE=220,TRAVEL=180;
  var ra=Math.PI,ga=0;
  var xR1,xO1,xT1,xA,xT2,xO2,xR2,s1x,s2x,sY,oCX,oCY,oRX,oRY,rdy=false;
  function measure(){
    ctx.font=FONT;
    var wR=ctx.measureText('R').width,wO=ctx.measureText('O').width,wT=ctx.measureText('T').width,wA=ctx.measureText('A').width;
    var tw=wR+wO+wT+wA+wT+wO+wR,sx=(CW-tw)/2;
    xR1=sx;xO1=xR1+wR;xT1=xO1+wO;xA=xT1+wT;xT2=xA+wA;xO2=xT2+wT;xR2=xO2+wO;
    s1x=xO1+wO/2;s2x=xO2+wO/2;sY=BASE-FS*0.36;
    oCX=(s1x+s2x)/2;oCY=sY;oRX=(s2x-s1x)/2;oRY=52;rdy=true;
  }
  function ease(t){return t<0.5?2*t*t:-1+(4-2*t)*t;}
  function rpos(a){return{x:oCX+oRX*Math.cos(a),y:oCY-oRY*Math.sin(a)};}
  function gpos(a){return{x:oCX+oRX*Math.cos(a),y:oCY+oRY*Math.sin(a)};}
  function frame(){
    if(!document.getElementById('loader')||document.getElementById('loader').classList.contains('gone')) return;
    if(!rdy){requestAnimationFrame(frame);return;}
    ctx.clearRect(0,0,CW,CH);
    var fi=Math.min(1,fc/30);fc++;pf++;
    if(phase==='pause1'){ra=Math.PI;ga=0;if(pf>=PAUSE){phase='travel1';pf=0;}}
    else if(phase==='travel1'){var p=ease(Math.min(pf/TRAVEL,1));ra=Math.PI-Math.PI*2*p;ga=Math.PI*2*p;if(pf>=TRAVEL){ra=-Math.PI;ga=Math.PI*2;phase='pause2';pf=0;}}
    else if(phase==='pause2'){ra=0;ga=Math.PI;if(pf>=PAUSE){phase='travel2';pf=0;}}
    else if(phase==='travel2'){var p=ease(Math.min(pf/TRAVEL,1));ra=-Math.PI+Math.PI*2*p;ga=Math.PI*2-Math.PI*2*p;if(pf>=TRAVEL){ra=Math.PI;ga=0;phase='pause1';pf=0;}}
    var R=rpos(ra),G=gpos(ga),mov=(phase==='travel1'||phase==='travel2');
    ctx.globalAlpha=fi;
    ctx.font=FONT;ctx.textBaseline='alphabetic';ctx.textAlign='left';ctx.fillStyle=GOLD;ctx.shadowBlur=0;
    ctx.fillText('R',xR1,BASE);ctx.fillText('T',xT1,BASE);ctx.fillText('A',xA,BASE);ctx.fillText('T',xT2,BASE);ctx.fillText('R',xR2,BASE);
    ctx.textBaseline='middle';ctx.textAlign='center';
    ctx.shadowBlur=mov?16:8;ctx.shadowColor=GREEN;ctx.fillStyle=GREEN;ctx.fillText('O',G.x,G.y);
    ctx.shadowBlur=mov?16:8;ctx.shadowColor=RED;ctx.fillStyle=RED;ctx.fillText('O',R.x,R.y);
    ctx.shadowBlur=0;ctx.globalAlpha=1;
    requestAnimationFrame(frame);
  }
  document.fonts.ready.then(function(){measure();frame();});
})();

/* ══════════════════════════════
   TOPBAR LOGO ANIMATION
══════════════════════════════ */
(function(){
  function initLogo(){
    ['logo-c','logo-c-mob'].forEach(function(canvasId){
      var canvas=document.getElementById(canvasId);
      if(!canvas) return;
      var ctx=canvas.getContext('2d');
      var CW=canvas.width,CH=canvas.height;
      var FS=18,FONT='bold '+FS+'px "IBM Plex Mono"';
      var BASE=22,GOLD='#f3ba2f',RED='#ff4560',GREEN='#00c896';
      var fc=0,phase='pause1',pf=0,PAUSE=200,TRAVEL=160;
      var ra=Math.PI,ga=0;
      var xR1,xO1,xT1,xA,xT2,xO2,xR2,s1x,s2x,sY,oCX,oCY,oRX,oRY,rdy=false;
      function measure(){
        ctx.font=FONT;
        var wR=ctx.measureText('R').width,wO=ctx.measureText('O').width,wT=ctx.measureText('T').width,wA=ctx.measureText('A').width;
        var tw=wR+wO+wT+wA+wT+wO+wR,sx=(CW-tw)/2;
        xR1=sx;xO1=xR1+wR;xT1=xO1+wO;xA=xT1+wT;xT2=xA+wA;xO2=xT2+wT;xR2=xO2+wO;
        s1x=xO1+wO/2;s2x=xO2+wO/2;sY=BASE-FS*0.36;
        oCX=(s1x+s2x)/2;oCY=sY;oRX=(s2x-s1x)/2;oRY=FS*0.52;rdy=true;
      }
      function ease(t){return t<0.5?2*t*t:-1+(4-2*t)*t;}
      function rpos(a){return{x:oCX+oRX*Math.cos(a),y:oCY-oRY*Math.sin(a)};}
      function gpos(a){return{x:oCX+oRX*Math.cos(a),y:oCY+oRY*Math.sin(a)};}
      function frame(){
        if(!rdy){requestAnimationFrame(frame);return;}
        ctx.clearRect(0,0,CW,CH);
        var fi=Math.min(1,fc/20);fc++;pf++;
        if(phase==='pause1'){ra=Math.PI;ga=0;if(pf>=PAUSE){phase='travel1';pf=0;}}
        else if(phase==='travel1'){var p=ease(Math.min(pf/TRAVEL,1));ra=Math.PI*(1-2*p);ga=Math.PI*2*p;if(pf>=TRAVEL){ra=-Math.PI;ga=Math.PI*2;phase='pause2';pf=0;}}
        else if(phase==='pause2'){ra=0;ga=Math.PI;if(pf>=PAUSE){phase='travel2';pf=0;}}
        else if(phase==='travel2'){var p=ease(Math.min(pf/TRAVEL,1));ra=-Math.PI+Math.PI*2*p;ga=Math.PI*2*(1-p);if(pf>=TRAVEL){ra=Math.PI;ga=0;phase='pause1';pf=0;}}
        var R=rpos(ra),G=gpos(ga),mov=(phase==='travel1'||phase==='travel2');
        ctx.globalAlpha=fi;
        ctx.font=FONT;ctx.textBaseline='alphabetic';ctx.textAlign='left';ctx.fillStyle=GOLD;ctx.shadowBlur=0;
        ctx.fillText('R',xR1,BASE);ctx.fillText('T',xT1,BASE);ctx.fillText('A',xA,BASE);ctx.fillText('T',xT2,BASE);ctx.fillText('R',xR2,BASE);
        ctx.textBaseline='middle';ctx.textAlign='center';
        ctx.shadowBlur=mov?8:4;ctx.shadowColor=GREEN;ctx.fillStyle=GREEN;ctx.fillText('O',G.x,G.y);
        ctx.shadowBlur=mov?8:4;ctx.shadowColor=RED;ctx.fillStyle=RED;ctx.fillText('O',R.x,R.y);
        ctx.shadowBlur=0;ctx.globalAlpha=1;
        requestAnimationFrame(frame);
      }
      document.fonts.ready.then(function(){measure();frame();});
    });
  }
  setTimeout(initLogo, 100);
})();

/* ══════════════════════════════
   MINI AD PANEL ANIMATION
══════════════════════════════ */
(function(){
  function initAdAnim(){
    var canvas=document.getElementById('ad-splash-c');
    if(!canvas) return;
    var ctx=canvas.getContext('2d');
    var CW=canvas.width,CH=canvas.height;
    var FS=28,FONT='bold '+FS+'px "IBM Plex Mono"';
    var BASE=62,GOLD='#f3ba2f',RED='#ff4560',GREEN='#00c896';
    var fc=0,phase='pause1',pf=0,PAUSE=220,TRAVEL=180;
    var ra=Math.PI,ga=0;
    var xR1,xO1,xT1,xA,xT2,xO2,xR2,s1x,s2x,sY,oCX,oCY,oRX,oRY,rdy=false;
    function measure(){
      ctx.font=FONT;
      var wR=ctx.measureText('R').width,wO=ctx.measureText('O').width,wT=ctx.measureText('T').width,wA=ctx.measureText('A').width;
      var tw=wR+wO+wT+wA+wT+wO+wR,sx=(CW-tw)/2;
      xR1=sx;xO1=xR1+wR;xT1=xO1+wO;xA=xT1+wT;xT2=xA+wA;xO2=xT2+wT;xR2=xO2+wO;
      s1x=xO1+wO/2;s2x=xO2+wO/2;sY=BASE-FS*0.36;
      oCX=(s1x+s2x)/2;oCY=sY;oRX=(s2x-s1x)/2;oRY=28;rdy=true;
    }
    function ease(t){return t<0.5?2*t*t:-1+(4-2*t)*t;}
    function rpos(a){return{x:oCX+oRX*Math.cos(a),y:oCY-oRY*Math.sin(a)};}
    function gpos(a){return{x:oCX+oRX*Math.cos(a),y:oCY+oRY*Math.sin(a)};}
    function frame(){
      if(!rdy){requestAnimationFrame(frame);return;}
      ctx.clearRect(0,0,CW,CH);
      var fi=Math.min(1,fc/20);fc++;pf++;
      if(phase==='pause1'){ra=Math.PI;ga=0;if(pf>=PAUSE){phase='travel1';pf=0;}}
      else if(phase==='travel1'){var p=ease(Math.min(pf/TRAVEL,1));ra=Math.PI*(1-2*p);ga=Math.PI*2*p;if(pf>=TRAVEL){ra=-Math.PI;ga=Math.PI*2;phase='pause2';pf=0;}}
      else if(phase==='pause2'){ra=0;ga=Math.PI;if(pf>=PAUSE){phase='travel2';pf=0;}}
      else if(phase==='travel2'){var p=ease(Math.min(pf/TRAVEL,1));ra=-Math.PI+Math.PI*2*p;ga=Math.PI*2*(1-p);if(pf>=TRAVEL){ra=Math.PI;ga=0;phase='pause1';pf=0;}}
      var R=rpos(ra),G=gpos(ga),mov=(phase==='travel1'||phase==='travel2');
      ctx.globalAlpha=fi;
      ctx.font=FONT;ctx.textBaseline='alphabetic';ctx.textAlign='left';ctx.fillStyle=GOLD;ctx.shadowBlur=0;
      ctx.fillText('R',xR1,BASE);ctx.fillText('T',xT1,BASE);ctx.fillText('A',xA,BASE);ctx.fillText('T',xT2,BASE);ctx.fillText('R',xR2,BASE);
      ctx.textBaseline='middle';ctx.textAlign='center';
      ctx.shadowBlur=mov?10:5;ctx.shadowColor=GREEN;ctx.fillStyle=GREEN;ctx.fillText('O',G.x,G.y);
      ctx.shadowBlur=mov?10:5;ctx.shadowColor=RED;ctx.fillStyle=RED;ctx.fillText('O',R.x,R.y);
      ctx.shadowBlur=0;ctx.globalAlpha=1;
      requestAnimationFrame(frame);
    }
    document.fonts.ready.then(function(){measure();frame();});
  }
  setTimeout(initAdAnim, 200);
})();
