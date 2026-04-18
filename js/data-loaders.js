/* ══════════════════════════════════════════════════════════════════
   data-loaders.js  —  All data fetching, scoring, mode switching
                        & the sparkle animation
   
   HOW TO EDIT THIS FILE:
   ──────────────────────
   • CHANGE SCORING WEIGHTS:
       In computeScores() find the three LAYERS:
       L1 = intra-list rank:  adjust the 0.25 / 0.30 / 0.45 weights
       L2 = macro strength:   adjust the 0.35/0.25/0.10/0.10 core + 0.10 DXY + 0.10 Total3 weights
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
/* Typewriter loading message */
var _twTimer = null;
function prog(p, m) {
  var el = document.getElementById('lmsg');
  if (!el) return;
  if (_twTimer) clearTimeout(_twTimer);
  el.textContent = '';
  var i = 0;
  function type() {
    if (i < m.length) { el.textContent += m[i++]; _twTimer = setTimeout(type, 28); }
  }
  type();
}

/* ── Loading screen tips ─────────────────────────────────────── */
var LOAD_TIPS = [
  '"DCA and patience beats chasing moonshots every time."',
  '"The best trade is often the one you don\'t make."',
  '"Rotate into strength, not into hope."',
  '"Time in the market beats timing the market."',
  '"A portfolio that survives is a portfolio that thrives."',
  '"Diversify across sectors, not just coins."',
  '"Never invest more than you can afford to lose."',
  '"Consistent small gains compound into big results."',
  '"Zoom out. The 30D trend tells a clearer story than the 1H chart."',
  '"Conviction without research is just gambling."'
];
(function showLoadTip() {
  var el = document.getElementById('load-tip');
  if (!el) return;
  el.textContent = LOAD_TIPS[Math.floor(Math.random() * LOAD_TIPS.length)];
})();

/* ── Category-aware lazy loading state ────────────────────────── */
var activeCategory   = 'all';            /* default category on first load */
var _loadedCategories = {};              /* cat → true once fetched */
var _coinCache        = {};              /* coinId → coin object (merged across loads) */

/* Load coins for a specific category, or reload all loaded coins on refresh */
async function loadCoins(categoryOverride) {
  var cat       = categoryOverride || activeCategory;
  var isInitial = Object.keys(_loadedCategories).length === 0;
  var catLabel  = cat === 'all' ? 'all 200' : cat.toUpperCase();
  prog(10, 'Fetching market data for ' + catLabel + ' coins…');
  /* Show skeleton rows immediately */
  var tbody = document.getElementById('tbody');
  if (tbody && !tbody.querySelector('tr:not(.skel-tr)')) {
    var skRows = '';
    for (var s = 0; s < 15; s++) {
      skRows += '<tr class="skel-tr"><td></td>'
        + '<td><div class="skel-row"><div class="skel skel-ico"></div><div class="skel skel-name"></div></div></td>'
        + '<td><div class="skel skel-val" style="margin:auto"></div></td>'
        + '<td><div class="skel skel-val" style="margin:auto"></div></td>'
        + '<td><div class="skel skel-val" style="margin:auto"></div></td>'
        + '<td><div class="skel skel-val" style="margin:auto"></div></td>'
        + '<td><div class="skel skel-val" style="margin:auto"></div></td>'
        + '<td><div class="skel skel-val" style="margin:auto"></div></td>'
        + '</tr>';
    }
    tbody.innerHTML = skRows;
  }

  /* ── Item 4: Try Binance 24hr ticker first — free, no key, very reliable ──
     Binance returns p24 and volume in a single fast call. We merge this with
     CoinGecko's 7D/14D/30D data (which Binance doesn't provide per-coin).
     If Binance is available we use it for price + p24 accuracy; CoinGecko
     for the multi-timeframe changes needed by the scorer.
  ──────────────────────────────────────────────────────────────────────── */
  var _binancePrices = {}; /* sym → {price, p24, volume} */
  try {
    var bnbTicker = await apiFetch('https://api.binance.com/api/v3/ticker/24hr');
    if (Array.isArray(bnbTicker)) {
      bnbTicker.forEach(function(t) {
        if (!t.symbol.endsWith('USDT')) return;
        var sym = t.symbol.slice(0, -4); /* strip USDT */
        _binancePrices[sym] = {
          price:  parseFloat(t.lastPrice)  || 0,
          p24:    parseFloat(t.priceChangePercent) || 0,
          volume: parseFloat(t.quoteVolume) || 0
        };
      });
      prog(25, 'Binance prices loaded — fetching historical data…');
    }
  } catch(e) { console.warn('[Binance] 24hr ticker failed — using CoinGecko prices:', e.message); }

  /* Fetch CoinGecko for 7D/14D/30D data (always needed for scoring) */
  /* On initial load: only fetch the active category to save API calls.
     On refresh (doRefresh): re-fetch all previously loaded categories.
     On category switch: fetch only the new category's coins. */
  var idsToFetch;
  if (cat === 'all') {
    idsToFetch = getActiveCoins();
  } else if (_loadedCategories[cat]) {
    /* Already loaded — re-fetch all loaded categories for refresh */
    idsToFetch = [];
    Object.keys(_loadedCategories).forEach(function(c) {
      getCategoryCoins(c).forEach(function(id) { idsToFetch.push(id); });
    });
  } else {
    /* New category — only fetch its coins */
    idsToFetch = getCategoryCoins(cat);
  }
  /* Deduplicate IDs (some may appear twice in the list) */
  var seen = {}; var uniqueIds = [];
  idsToFetch.forEach(function(id) { if (!seen[id]) { seen[id] = true; uniqueIds.push(id); } });

  /* ── Supabase shared cache: try to read CoinGecko data from cloud first ──
     This prevents rate-limit bans when many users load at the same time.
     Only one user per 5 minutes actually hits CoinGecko; everyone else
     gets the cached version from Supabase.
  ──────────────────────────────────────────────────────────────────────── */
  var cacheKey = 'cg_markets_' + cat;
  var rawData  = [];
  var usedCache = false;

  if (typeof supaCacheGet === 'function') {
    try {
      prog(15, 'Checking shared cache…');
      var cached = await supaCacheGet(cacheKey, 5 * 60 * 1000);
      if (cached && Array.isArray(cached) && cached.length > 0) {
        rawData   = cached;
        usedCache = true;
        prog(30, 'Loaded ' + rawData.length + ' coins from shared cache');
      }
    } catch(e) { console.warn('[SupaCache] read skipped:', e.message); }
  }

  if (!usedCache) {
    /* Split into batches of 50 for CoinGecko's per_page limit */
    var batches = [];
    for (var b = 0; b < uniqueIds.length; b += 50) {
      batches.push(uniqueIds.slice(b, b + 50).join(','));
    }
    var baseUrl  = 'https://api.coingecko.com/api/v3/coins/markets'
      + '?vs_currency=usd&order=market_cap_desc&per_page=50&page=1'
      + '&sparkline=false&price_change_percentage=7d,14d,30d&include_24hr_vol=true';

    prog(20, 'Fetching data for ' + uniqueIds.length + ' coins (' + batches.length + ' batches)…');
    var results  = await Promise.all(
      batches.map(function(ids) { return apiFetch(baseUrl + '&ids=' + ids); })
    );
    results.forEach(function(r) { if (Array.isArray(r)) rawData = rawData.concat(r); });

    /* Write fresh data to shared cache for other users */
    if (rawData.length && typeof supaCacheSet === 'function') {
      supaCacheSet(cacheKey, rawData); // fire-and-forget
    }
  }
  if (!rawData.length) throw new Error('CoinGecko data invalid');

  var fetchedCoins = rawData.map(function(c) {
    /* Prefer Binance for real-time price + 24H — it updates every second vs CoinGecko's 60s */
    var bnb = _binancePrices[c.symbol.toUpperCase()];
    var stable = (typeof STABLECOINS !== 'undefined') && STABLECOINS[c.id];
    return {
      id: c.id, sym: c.symbol.toUpperCase(), name: c.name,
      price:  bnb ? bnb.price  : c.current_price,
      image:  (c.image || '').replace(/\/small\//, '/large/'), mcap: c.market_cap, rank: 0,
      p24:    bnb ? bnb.p24    : (c.price_change_percentage_24h || 0),
      p7:     c.price_change_percentage_7d_in_currency  || 0,
      p14:    c.price_change_percentage_14d_in_currency || 0,
      p30:    c.price_change_percentage_30d_in_currency || 0,
      volume24: bnb ? bnb.volume : (c.total_volume || 0),
      circulating_supply: c.circulating_supply || 0,
      max_supply: c.max_supply || null,
      ath: c.ath || 0, ath_change_pct: c.ath_change_percentage || 0,
      score: 0, r7: 0, r14: 0, r30: 0, isPro: false,
      isStable: !!stable,
      apr: stable ? stable.apr : 0,
      aprPlatform: stable ? stable.platform : ''
    };
  });

  /* Merge fetched coins into persistent cache */
  fetchedCoins.forEach(function(c) { _coinCache[c.id] = c; });
  _loadedCategories[cat] = true;
  if (cat === 'all') {
    /* Mark every individual category as loaded too */
    CATEGORY_LIST.forEach(function(ct) { if (ct.key !== 'all') _loadedCategories[ct.key] = true; });
  }

  /* Build coins array from all cached coins */
  coins = [];
  Object.keys(_coinCache).forEach(function(id) { coins.push(_coinCache[id]); });
  coins.sort(function(a, b) { return b.mcap - a.mcap; });
  coins.forEach(function(c, i) { c.rank = i + 1; });

  /* Derive BTC MA200 signal from coins data already fetched — no extra API call needed.
     We use BTC’s 30D return to estimate whether price is above or below its trailing average:
     if BTC rose in the last 30 days, the trailing average is below current price (bull).
     if BTC fell in the last 30 days, the trailing average is above current price (bear).
     This gives an accurate bull/bear signal without a separate 200-day OHLCV call.          */
  var btcCoin = coins.find(function(c) { return c.id === 'bitcoin'; });
  if (btcCoin) {
    btcPrice = btcCoin.price;
    var p30frac = (btcCoin.p30 || 0) / 100;
    /* Conservative estimate: trailing avg ≈ current / (1 + half the 30D move) */
    btcMA200 = btcPrice / (1 + p30frac * 0.5);
  }

  computeScores();
  window.coins = coins; /* sync so ui.js search/modal can access live data */
}


/* ── Macro data (Gold, Silver, Oil, BTC 7D) ──────────────────── */
var _macroData = {btcP7: null, goldP7: null, silverP7: null, oilP7: null, dxyP7: null, total3P7: null};

async function loadMacroData() {
  /* ── Try shared Supabase cache first ── */
  if (typeof supaCacheGet === 'function') {
    try {
      var cached = await supaCacheGet('macro_data', 10 * 60 * 1000); // 10 min TTL
      if (cached && cached.goldP7 != null) {
        _macroData.goldP7    = cached.goldP7;
        _macroData.silverP7  = cached.silverP7;
        _macroData.oilP7     = cached.oilP7;
        _macroData.dxyP7     = cached.dxyP7;
        _macroData.total3P7  = cached.total3P7;
        _macroData.total3Mcap = cached.total3Mcap;
        var btcCoin = coins.find(function(c) { return c.id === 'bitcoin'; });
        if (btcCoin) _macroData.btcP7 = btcCoin.p7;
        return;
      }
    } catch(e) { console.warn('[SupaCache] macro read skipped:', e.message); }
  }

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

    /* DXY (US Dollar Index) — rising DXY is bearish for crypto */
    try {
      var dxyUrl  = 'https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=UUP&apikey=' + getAVKey();
      var dxyData = await apiFetch(dxyUrl);
      var dxyQ    = dxyData && dxyData['Global Quote'];
      if (dxyQ) _macroData.dxyP7 = parseFloat((dxyQ['10. change percent'] || '0%').replace('%', '')) || 0;
    } catch(e2) { console.warn('DXY fetch:', e2.message); }

    /* TOTAL3 (alt market cap excl. BTC+ETH) — via CoinGecko global */
    try {
      var t3Url  = 'https://api.coingecko.com/api/v3/global';
      var t3Data = await apiFetch(t3Url);
      if (t3Data && t3Data.data) {
        var totalMcap = t3Data.data.total_market_cap && t3Data.data.total_market_cap.usd || 0;
        var btcMcap   = (coins.find(function(c){ return c.id==='bitcoin'; }) || {mcap:0}).mcap || 0;
        var ethMcap   = (coins.find(function(c){ return c.id==='ethereum'; }) || {mcap:0}).mcap || 0;
        var total3Now = totalMcap - btcMcap - ethMcap;
        var chgPct    = t3Data.data.market_cap_change_percentage_24h_usd || 0;
        /* Approximate 7D from 24h change — rough but directional */
        _macroData.total3P7 = chgPct * 2.5;
        _macroData.total3Mcap = total3Now;
      }
    } catch(e3) { console.warn('Total3 fetch:', e3.message); }

    /* Write macro data to shared cache for other users */
    if (typeof supaCacheSet === 'function') {
      supaCacheSet('macro_data', {
        goldP7:     _macroData.goldP7,
        silverP7:   _macroData.silverP7,
        oilP7:      _macroData.oilP7,
        dxyP7:      _macroData.dxyP7,
        total3P7:   _macroData.total3P7,
        total3Mcap: _macroData.total3Mcap
      });
    }
  } catch(e) { console.warn('Macro data:', e.message); }
}

/* ── Fear & Greed Index (used by Insight Engine) ─────────────── */
window.fearGreed = { value: 50, label: 'Neutral' };
async function loadFearGreed() {
  /* Try shared cache first (15 min TTL — FnG updates daily) */
  if (typeof supaCacheGet === 'function') {
    try {
      var cached = await supaCacheGet('fear_greed', 15 * 60 * 1000);
      if (cached && cached.value) {
        window.fearGreed = cached;
        return;
      }
    } catch(e) { /* fall through to API */ }
  }

  try {
    var data = await apiFetch('https://api.alternative.me/fng/?limit=1');
    if (data && data.data && data.data[0]) {
      window.fearGreed = {
        value: parseInt(data.data[0].value) || 50,
        label: data.data[0].value_classification || 'Neutral'
      };
      if (typeof supaCacheSet === 'function') {
        supaCacheSet('fear_greed', window.fearGreed);
      }
    }
  } catch(e) { console.warn('[FearGreed]', e.message); }
}

/* ── Score engine (3 layers) ─────────────────────────────────── */
function computeScores() {
  /* Exclude stablecoins from scoring — they get APR display instead */
  var scorable = coins.filter(function(c) { return !c.isStable; });
  var n = Math.max(scorable.length - 1, 1);

  /* LAYER 1: Intra-list rank (0–40 pts) */
  ['p7','p14','p30'].forEach(function(k) {
    var sorted = scorable.slice().sort(function(a, b) { return b[k] - a[k]; });
    sorted.forEach(function(c, i) { c['r' + k.slice(1)] = i + 1; });
  });

  /* Set stablecoin scores to 0 (they use APR display) */
  coins.forEach(function(c) { if (c.isStable) { c.score = 0; c.r7 = 0; c.r14 = 0; c.r30 = 0; } });

  scorable.forEach(function(c) {
    /* Weighted rank (lower rank# = better) */
    var wAvg   = (c.r7 * 0.25 + c.r14 * 0.30 + c.r30 * 0.45);
    var layer1 = Math.round((1 - (wAvg - 1) / n) * 40);

    /* LAYER 2: Macro relative strength vs BTC/Gold/Silver/Oil + DXY/Total3 (0–30 pts)
       DXY inverse: rising dollar is headwind for crypto, so we ADD dxy strength (coin benefits when DXY falls)
       Total3: rising altcoin market = tailwind, coin benefits when outperforming total3 */
    var btcP7    = _macroData.btcP7    != null ? _macroData.btcP7    : (coins.find(function(x){ return x.id==='bitcoin'; }) || {p7:0}).p7;
    var goldP7   = _macroData.goldP7   != null ? _macroData.goldP7   : 2;
    var silvP7   = _macroData.silverP7 != null ? _macroData.silverP7 : 1.5;
    var oilP7    = _macroData.oilP7    != null ? _macroData.oilP7    : 1;
    var dxyP7    = _macroData.dxyP7    != null ? _macroData.dxyP7    : 0;
    var total3P7 = _macroData.total3P7 != null ? _macroData.total3P7 : 0;
    /* Core: vs traditional assets (60% weight) */
    var coreDelta = (c.p7 - btcP7)*0.35 + (c.p7 - goldP7)*0.25 + (c.p7 - silvP7)*0.10 + (c.p7 - oilP7)*0.10;
    /* DXY headwind: if DXY rose 2%, all crypto gets -2 pts penalty; coin-specific edge stays in coreDelta (10% weight) */
    var dxyDelta  = -dxyP7 * 0.10;
    /* Total3 tailwind: coin outperforming altcoin market = bonus (10% weight) */
    var t3Delta   = (c.p7 - total3P7) * 0.10;
    var delta  = coreDelta + dxyDelta + t3Delta;
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
    c.scoreBreakdown = {layer1, layer2, layer3, supplyPts, deflPts, unlockPts, dxyP7: dxyP7, total3P7: total3P7};
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

  /* Inject skeleton tiles immediately */
  var skelGrid = document.getElementById('forex-skel-grid');
  if (skelGrid) {
    var pairCount = isPro ? FOREX_PAIRS.length : FOREX_PAIRS.filter(function(p){return !p.pro;}).length;
    skelGrid.innerHTML = Array(Math.max(pairCount, 6)).fill(0).map(function() {
      return '<div class="asset-tile skel-asset-tile">'
        + '<div class="skel-asset-head"><div class="skel skel-asset-sym"></div><div class="skel skel-asset-name"></div></div>'
        + '<div class="skel skel-asset-price"></div>'
        + '<div class="skel-asset-stats"><div class="skel skel-asset-stat"></div><div class="skel skel-asset-stat"></div><div class="skel skel-asset-stat"></div></div>'
        + '</div>';
    }).join('');
  }

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

  /* ── Fallback: exchangerate.host — real 30-day timeseries, free, no key ── */
  if (frankfurterFailed || Object.keys(rateHistory).length < Object.keys(bases).length) {
    var endDate   = new Date().toISOString().slice(0, 10);
    var startDate30 = dateOffset(-35); /* 35 days covers weekends + holidays */
    await Promise.all(Object.keys(bases).map(async function(base) {
      if (rateHistory[base] && Object.keys(rateHistory[base]).length > 0) return; /* already have it */
      try {
        /* exchangerate.host timeseries: free, CORS-safe, real ECB/market data */
        var url  = 'https://api.exchangerate.host/timeseries?start_date=' + startDate30
          + '&end_date=' + endDate + '&base=' + base + '&symbols=' + bases[base].join(',');
        var data = await apiFetch(url);
        if (data && data.success && data.rates && Object.keys(data.rates).length > 0) {
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
        }
      } catch(e) { console.warn('exchangerate.host failed for ' + base + ':', e.message); }
    }));
  }

  /* ── Last resort: open.er-api.com (single spot rate only — minimal history) ── */
  if (Object.keys(rateHistory).length < Object.keys(bases).length) {
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
            /* Build a minimal 2-point array — scores will be low-confidence but not crash */
            rateHistory[base][quote] = [rate * 0.999, rate];
          });
        });
      }
    } catch(e) { console.warn('ER-API last-resort failed:', e.message); }
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
  _setLastUpdated('forex');
  loading.style.display = 'none';
  var fxTiles = document.getElementById('forex-tiles');
  if (fxTiles) fxTiles.style.display = '';
  renderForexTable();
  renderFxTiles();
}

/* ══════════════════════════════════════════════════════════════
   STOCKS — loadStocks
══════════════════════════════════════════════════════════════ */
/* ── Item 8: Enhanced stock scorer — uses 7D + 30D when available ──
   The original scorer only used 52-week range position + today's %chg.
   We now add 7D and 30D momentum when history data is available,
   matching the quality of the crypto scorer.
──────────────────────────────────────────────────────────────── */
function calcStockScore(price, high52, low52, chgPct, p7, p30) {
  var range  = high52 - low52;
  /* 52-week position (0–100): where in the yearly range the price sits */
  var pos    = range > 0 ? Math.round(((price - low52) / range) * 100) : 50;
  /* Today's momentum (-40 to +40) */
  var mom1d  = Math.min(Math.max(chgPct * 5, -40), 40);

  if (p7 !== undefined && p30 !== undefined) {
    /* Full 3-timeframe scorer (matches crypto scorer quality) */
    var mom7d  = Math.min(Math.max((p7  || 0) * 3, -40), 40);
    var mom30d = Math.min(Math.max((p30 || 0) * 1.5, -40), 40);
    /* Weights: range 35% + 7D 30% + 30D 25% + 1D 10% */
    return Math.min(100, Math.max(0, Math.round(
      pos * 0.35 + (50 + mom7d) * 0.30 + (50 + mom30d) * 0.25 + (50 + mom1d) * 0.10
    )));
  }
  /* Fallback: original 2-factor scorer when history unavailable */
  return Math.min(100, Math.max(0, Math.round(pos * 0.6 + (50 + mom1d) * 0.4)));
}

/* Fetch Yahoo Finance chart for a single symbol — used to get 7D/30D history */
async function fetchStockHistory(sym) {
  try {
    var url  = 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(sym)
      + '?interval=1d&range=35d';
    var data = await apiFetch(url);
    var closes = data && data.chart && data.chart.result && data.chart.result[0]
      && data.chart.result[0].indicators && data.chart.result[0].indicators.quote
      && data.chart.result[0].indicators.quote[0] && data.chart.result[0].indicators.quote[0].close;
    if (!closes || closes.length < 8) return null;
    var latest = closes[closes.length - 1];
    var w1     = closes[closes.length - 6]  || closes[0];
    var m1     = closes[closes.length - 22] || closes[0];
    return {
      p7:  w1  ? ((latest - w1)  / w1  * 100) : 0,
      p30: m1  ? ((latest - m1)  / m1  * 100) : 0
    };
  } catch(e) { return null; }
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

  /* Inject skeleton tiles immediately */
  var skelGrid = document.getElementById('stocks-skel-grid');
  if (skelGrid) {
    skelGrid.innerHTML = Array(STOCKS_LIST.length).fill(0).map(function() {
      return '<div class="asset-tile skel-asset-tile">'
        + '<div class="skel-asset-head"><div class="skel skel-asset-sym"></div><div class="skel skel-asset-name"></div></div>'
        + '<div class="skel skel-asset-price"></div>'
        + '<div class="skel-asset-stats"><div class="skel skel-asset-stat"></div><div class="skel skel-asset-stat"></div><div class="skel skel-asset-stat"></div></div>'
        + '</div>';
    }).join('');
  }

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
        /* Item 8: include 7D/30D from Yahoo's own quote fields when available */
        var p7  = q.regularMarketChangePercentWeekly  || undefined;
        var p30 = q.regularMarketChangePercentMonthly || undefined;
        return {sym:s.sym, name:q.shortName||s.name, type:s.type, av:s.av,
          price, chg:q.regularMarketChange||0, chgPct:q.regularMarketChangePercent||0,
          high52, low52, p7, p30,
          score:calcStockScore(price, high52, low52, q.regularMarketChangePercent||0, p7, p30)};
      });
      yahooOk = true;

      /* Item 8: Fetch 35-day history for top 8 stocks to get real 7D/30D data.
         We limit to 8 to stay inside free-tier rate limits. Runs in background. */
      var need7d = stocksData.filter(function(s) { return !s.err && s.p7 === undefined; }).slice(0, 8);
      if (need7d.length) {
        Promise.all(need7d.map(async function(s) {
          var hist = await fetchStockHistory(s.sym);
          if (hist) {
            var idx = stocksData.findIndex(function(r) { return r.sym === s.sym; });
            if (idx >= 0) {
              stocksData[idx].p7    = hist.p7;
              stocksData[idx].p30   = hist.p30;
              stocksData[idx].score = calcStockScore(
                stocksData[idx].price, stocksData[idx].high52, stocksData[idx].low52,
                stocksData[idx].chgPct, hist.p7, hist.p30
              );
            }
          }
        })).then(function() { renderStocksTable(); }); /* re-render when history arrives */
      }
    }
  } catch(e) { console.warn('Yahoo stocks failed:', e.message); }

  /* ── Fallback 1: Financial Modeling Prep (free, no key, CORS-friendly) ── */
  if (!yahooOk) {
    var sMsg = document.getElementById('stocks-source-msg');
    if (sMsg) sMsg.textContent = '⟳ Yahoo Finance unavailable — pulling from Financial Modeling Prep…';
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
    var sMsg2 = document.getElementById('stocks-source-msg');
    if (sMsg2) sMsg2.textContent = '⟳ Fetching from Alpha Vantage — this may take a moment due to rate limits…';
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
              name: s.name, err: false, score: calcStockScore(q.price, q.high52, q.low52, q.chgPct, undefined, undefined)
            });
          }
        } catch(e) {}
      }));
      if (b + batchSize < avStocks.length) await sleep(300);
    }
    stocksData = results;
  }

  /* ── Fallback 3: Twelve Data — free tier, bulk quote endpoint ── */
  if (!yahooOk) {
    var sMsg3 = document.getElementById('stocks-source-msg');
    if (sMsg3) sMsg3.textContent = '⟳ Trying Twelve Data bulk quotes…';
    loading.textContent = 'LOADING VIA TWELVE DATA…';
    try {
      /* Free tier: 800 credits/day, bulk quote = 1 credit per symbol */
      var tdSyms = STOCKS_LIST.map(function(s) {
        /* Twelve Data uses clean symbols — strip ^ from indices */
        return (s.av || s.sym).replace('^', '');
      }).join(',');
      var tdUrl  = 'https://api.twelvedata.com/quote?symbol=' + encodeURIComponent(tdSyms)
        + '&apikey=demo'; /* 'demo' key works for up to ~8 symbols; swap for real key when available */
      var tdData = await apiFetch(tdUrl);
      if (tdData && typeof tdData === 'object' && !tdData.message) {
        /* Twelve Data returns { AAPL: {...}, MSFT: {...} } for multi-symbol requests */
        var tdResults = STOCKS_LIST.map(function(s) {
          var key = (s.av || s.sym).replace('^', '');
          var q   = tdData[key] || tdData;
          if (!q || q.status === 'error' || !q.close) {
            return {sym:s.sym, name:s.name, type:s.type, av:s.av,
              price:0, chg:0, chgPct:0, high52:0, low52:0, score:0, err:true};
          }
          var price  = parseFloat(q.close)               || 0;
          var chgPct = parseFloat(q.percent_change)       || 0;
          var chg    = parseFloat(q.change)               || 0;
          var high52 = parseFloat(q.fifty_two_week && q.fifty_two_week.high) || price * 1.3;
          var low52  = parseFloat(q.fifty_two_week && q.fifty_two_week.low)  || price * 0.7;
          return {sym:s.sym, name:q.name||s.name, type:s.type, av:s.av,
            price, chg, chgPct, high52, low52,
            score: calcStockScore(price, high52, low52, chgPct)};
        });
        if (tdResults.some(function(r) { return !r.err; })) {
          stocksData = tdResults;
          yahooOk    = true;
        }
      }
    } catch(e) { console.warn('Twelve Data fallback failed:', e.message); }
  }

  stocksLoaded = true;
  _setLastUpdated('stocks');
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
      + '<div class="at-price">' + (s.err ? '—' : priceStr) + '<span style="font-size:12px;font-weight:600;margin-left:5px;color:' + (s.chgPct>=0?'var(--green)':'var(--red)') + ';">' + (s.err?'':'(' + (s.chgPct>=0?'+':'') + s.chgPct.toFixed(2) + '%)') + '</span></div>'
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
        + '<div style="font-size:12px;color:var(--pro);margin-top:8px;letter-spacing:.06em;">UNLOCK FREE →</div>'
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
      + '<div class="at-price">' + rateStr + '<span style="font-size:12px;font-weight:600;margin-left:5px;color:' + (p.chgPct>=0?'var(--green)':'var(--red)') + ';">' + dayStr + '</span></div>'
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
    var lb = document.getElementById('lm-' + m);
    if (lb) lb.classList.toggle('active', m === mode);
    var h = document.getElementById('holdings-' + m);
    if (h) h.style.display = m === mode ? (m === 'crypto' ? '' : 'flex') : 'none';
    /* Show crypto sig-box only in crypto mode — it's a direct sidebar sibling */
    var cryptoSig = document.getElementById('sig-box-crypto');
    if (cryptoSig) cryptoSig.style.display = mode === 'crypto' ? '' : 'none';
    /* Item 9: show only the active mode's last-updated stamp */
    var ts = document.getElementById('last-updated-' + m);
    if (ts) ts.style.display = m === mode && _lastUpdated[m] ? '' : 'none';
  });
  document.getElementById('crypto-panel').style.display = mode === 'crypto' ? '' : 'none';
  document.getElementById('forex-panel').style.display  = mode === 'forex'  ? '' : 'none';
  document.getElementById('stocks-panel').style.display = mode === 'stocks' ? '' : 'none';
  var catBar = document.getElementById('cat-bar');
  if (catBar) catBar.style.display = mode === 'crypto' ? '' : 'none';
  var sortTabs = document.getElementById('sort-tabs');
  if (sortTabs) sortTabs.style.display = mode === 'crypto' ? '' : 'none';
  var titles = {crypto:'PERFORMANCE LEADERBOARD', forex:'FOREX PAIRS', stocks:'MARKET SCREENER'};
  document.getElementById('tbl-title').textContent = titles[mode];
  if (mode === 'forex'  && !forexLoaded)  loadForex();
  if (mode === 'stocks' && !stocksLoaded) loadStocks();
  requestAnimationFrame(function() { syncPanelAlignment(); });
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
   • Refreshes ALL active tabs (crypto + forex if loaded + stocks if loaded)
   • Pauses automatically while the browser tab is hidden (Tab Visibility API)
   • Per-mode last-updated timestamps shown in each panel header
══════════════════════════════════════════════════════════════ */

/* Per-mode last-updated timestamps (ms epoch) */
var _lastUpdated = {crypto: 0, forex: 0, stocks: 0};

function _setLastUpdated(mode) {
  _lastUpdated[mode] = Date.now();
  _renderLastUpdated(mode);
}

function _renderLastUpdated(mode) {
  var el = document.getElementById('last-updated-' + mode);
  if (!el) return;
  var t = _lastUpdated[mode];
  if (!t) { el.style.display = 'none'; el.textContent = ''; return; }
  var mins = Math.floor((Date.now() - t) / 60000);
  el.textContent = mins < 1 ? 'updated just now' : 'updated ' + mins + 'm ago';
  /* Only show if this mode is currently active */
  el.style.display = (currentMode === mode) ? '' : 'none';
}

/* Tick the "X mins ago" labels every minute */
setInterval(function() {
  ['crypto','forex','stocks'].forEach(_renderLastUpdated);
}, 60000);

var _autoRefreshTimer = null;
var _tabHidden = false;

/* Tab Visibility API — pause refresh when tab is hidden */
document.addEventListener('visibilitychange', function() {
  _tabHidden = document.hidden;
  if (!_tabHidden) {
    /* Tab just became visible — refresh immediately if stale (>14 min) */
    var stale = Date.now() - (_lastUpdated.crypto || 0) > 14 * 60 * 1000;
    if (!busy && stale) doRefresh();
  }
});

/* ── Item 7: Market hours awareness ─────────────────────────────
   Returns true when refreshing would be pointless:
   • Forex: weekends UTC (Sat 22:00 → Sun 22:00 approx)
   • Stocks: weekends + outside 13:30–20:00 UTC (NYSE hours)
   Crypto never closes.
──────────────────────────────────────────────────────────────── */
function isMarketClosed(mode) {
  if (mode === 'crypto') return false;
  var now = new Date();
  var day = now.getUTCDay();   /* 0=Sun … 6=Sat */
  var hm  = now.getUTCHours() * 60 + now.getUTCMinutes();
  if (mode === 'forex') {
    if (day === 6 && hm >= 22 * 60) return true;
    if (day === 0 && hm <  22 * 60) return true;
    return false;
  }
  if (mode === 'stocks') {
    if (day === 0 || day === 6) return true;
    if (hm < 13 * 60 + 30 || hm > 20 * 60) return true;
    return false;
  }
  return false;
}

function startAutoRefresh() {
  if (_autoRefreshTimer) clearInterval(_autoRefreshTimer);
  _autoRefreshTimer = setInterval(function() {
    if (busy || _tabHidden) return; /* skip when busy or tab hidden */
    doRefresh();
  }, 15 * 60 * 1000); /* 15 minutes */
}

async function doLoad() {
  processIncomingRef();
  var _d = checkMyReferrals();
  isPro  = _d.pro || loadPro();
  busy   = true;
  /* Inject skeleton signal tiles immediately */
  ['sug-cards','mom-cards','worst-cards'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) {
      var skTiles = '<div class="sig-tiles-grid">';
      for (var s = 0; s < 3; s++) skTiles += '<div class="skel skel-tile"></div>';
      skTiles += '</div>';
      el.innerHTML = skTiles;
    }
  });
  try {
    await loadCoins('all');  prog(55, 'Scoring and ranking coins…');  renderCoinSel();
    await loadMacroData(); prog(80, 'Loading macro data — Gold, Oil…');
    await loadFearGreed(); prog(88, 'Fetching sentiment data…');
    prog(92, 'Almost ready — building your dashboard…');
    applyModePrefs();
    renderAll();         prog(100, 'All done! This free tool is built by one person — thanks for your patience ♥');
    window.coins = coins; /* keep window.coins fresh for search/modal */
    _setLastUpdated('crypto');
    var tsEl = document.getElementById('last-updated-crypto');
    if (tsEl) tsEl.style.display = '';
    await sleep(320);
    document.getElementById('loader').classList.add('gone');
    startAutoRefresh();
    /* Activate referral: proves this user actually loaded data (anti-abuse) */
    if (typeof supaActivateMyReferral === 'function') try { supaActivateMyReferral(); } catch(e) {}
  } catch(e) {
    document.getElementById('lmsg').textContent = 'ERROR: ' + e.message;
    document.getElementById('lbf').style.background = 'var(--red)';
  }
  busy = false;
}

async function doRefresh() {
  if (busy) return;
  busy = true;
  if (typeof _klinesFetched !== 'undefined') _klinesFetched = false; /* re-fetch klines on refresh */
  var tsEl = document.getElementById('ts');
  if (tsEl) tsEl.style.color = 'var(--bnb)';
  try {
    /* Always refresh crypto — re-fetch all loaded categories */
    await loadCoins(_loadedCategories['all'] ? 'all' : activeCategory);
    renderAll();
    _setLastUpdated('crypto');

    /* Refresh forex if it has already been loaded (user visited tab) */
    if (forexLoaded && !isMarketClosed('forex')) {
      await loadForex();
      _setLastUpdated('forex');
    }

    /* Refresh stocks if already loaded and market may be open */
    if (stocksLoaded && !isMarketClosed('stocks')) {
      await loadStocks();
      _setLastUpdated('stocks');
    }
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
  /* Show scaling tip if not already dismissed */
  var scaleDismissed = false;
  try { scaleDismissed = localStorage.getItem('rot_scale_dismissed') === '1'; } catch(e) {}
  if (!scaleDismissed) {
    var sb = document.getElementById('scale-banner');
    if (sb) sb.classList.add('show');
  }
}

/* ── Dismiss scale tip banner ──────────────────────────────── */
function dismissScaleBanner() {
  try { localStorage.setItem('rot_scale_dismissed', '1'); } catch(e) {}
  var sb = document.getElementById('scale-banner');
  if (sb) sb.classList.remove('show');
}

/* ── Mobile nav — scroll-to helpers ─────────────────────────── */
function _mobScrollTo(el) {
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function _mobHighlightBtn(activeId) {
  ['signal','hot','holdings','swap','more'].forEach(function(m) {
    var b = document.getElementById('mn-' + m);
    if (b) b.classList.toggle('active', m === activeId);
  });
}

function _mobOpenAndScroll(sectionId, btnId) {
  _mobHighlightBtn(btnId);
  closeMobMore();
  var hdr  = document.getElementById('ch-' + sectionId);
  var body = document.getElementById('cb-' + sectionId);
  /* Track collapsed state before toggling so we know to delay scroll */
  var wasCollapsed = !!(hdr && body && body.classList.contains('collapsed'));
  if (wasCollapsed) toggleCollapse(sectionId);
  /* Wait for 320ms CSS transition to finish before scrolling.
     Firing immediately scrolls to wrong position (section still has height:0) */
  setTimeout(function() {
    if (hdr) _mobScrollTo(hdr);
  }, wasCollapsed ? 350 : 0);
}

function mobNav(mode) {
  closeMobMore();
  setMode(mode);
  var tbl = document.querySelector('.tbl-head');
  if (tbl) _mobScrollTo(tbl);
}

function mobNavSignal() {
  closeMobMore();
  var body = document.getElementById('cb-hot');
  var hdr  = document.getElementById('ch-hot');
  var isOpen = body && !body.classList.contains('collapsed');

  if (isOpen) {
    /* Close: toggle collapse and deselect button */
    toggleCollapse('hot');
    _mobHighlightBtn('');
  } else {
    /* Open: expand section, highlight, and scroll into view */
    _mobHighlightBtn('signal');
    if (body && body.classList.contains('collapsed')) toggleCollapse('hot');
    setTimeout(function() {
      if (hdr) _mobScrollTo(hdr);
    }, 350);
  }
}

function mobNavHot() {
  _mobOpenAndScroll('hot', 'hot');
}

function mobNavSwap() {
  _mobOpenAndScroll('swap', 'swap');
  if (typeof RatioTracker !== 'undefined') RatioTracker.loadAll();
}

function mobNavHoldings() {
  _mobOpenAndScroll('holdings', 'holdings');
}

/* ── More menu ─────────────────────────────────────────────── */
function mobNavMore() {
  var menu     = document.getElementById('mob-more-menu');
  var backdrop = document.getElementById('mob-more-backdrop');
  var btn      = document.getElementById('mn-more');
  var isOpen   = menu && menu.classList.contains('show');
  if (isOpen) { closeMobMore(); return; }
  if (menu)     menu.classList.add('show');
  if (backdrop) backdrop.classList.add('show');
  if (btn)      btn.classList.add('active');
  /* Sync theme label */
  var isLight = document.documentElement.classList.contains('light');
  var ico = document.getElementById('mm-theme-ico');
  var txt = document.getElementById('mm-theme-txt');
  if (ico) ico.textContent = isLight ? '🌙' : '☀';
  if (txt) txt.textContent = isLight ? 'Dark Mode' : 'Light Mode';
}
function closeMobMore() {
  var menu     = document.getElementById('mob-more-menu');
  var backdrop = document.getElementById('mob-more-backdrop');
  var btn      = document.getElementById('mn-more');
  if (menu)     menu.classList.remove('show');
  if (backdrop) backdrop.classList.remove('show');
  if (btn)      btn.classList.remove('active');
}

/* ── Topbar auto-hide on scroll (mobile portrait) ──────────── */
(function initTopbarAutoHide() {
  var lastY = 0;
  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function() {
      if (window.innerWidth > 700) { ticking = false; return; }
      var topbar = document.querySelector('.topbar');
      if (!topbar) { ticking = false; return; }
      var y = window.scrollY || window.pageYOffset;
      if (y > 80 && y > lastY) {
        topbar.style.transform = 'translateY(-100%)';
        topbar.style.transition = 'transform .25s ease';
      } else {
        topbar.style.transform = 'translateY(0)';
        topbar.style.transition = 'transform .25s ease';
      }
      lastY = y;
      ticking = false;
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
})();

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
  if (typeof applyLang === 'function') applyLang();
}
(function() { try { var l = localStorage.getItem('rot_lang'); if (l) setTimeout(function() { setLang(l); }, 50); } catch(e) {} })();

/* ── Theme toggle (dark/light) ──────────────────────────────── */
function toggleTheme(isLight) {
  document.documentElement.classList.toggle('light', isLight);
  try { localStorage.setItem('rot_theme', isLight ? 'light' : 'dark'); } catch(e) {}
  var tog = document.getElementById('theme-toggle');
  if (tog) tog.checked = isLight;
  var ico = document.getElementById('theme-icon');
  var lbl = document.getElementById('theme-label');
  if (ico) ico.textContent = isLight ? '🌙' : '☀';
  if (lbl) lbl.textContent = isLight ? 'DARK' : 'LIGHT';
}
(function() {
  try {
    var saved = localStorage.getItem('rot_theme');
    if (saved === 'light') {
      document.documentElement.classList.add('light');
      setTimeout(function() {
        var tog = document.getElementById('theme-toggle');
        if (tog) tog.checked = true;
        var ico = document.getElementById('theme-icon');
        var lbl = document.getElementById('theme-label');
        if (ico) ico.textContent = '🌙';
        if (lbl) lbl.textContent = 'DARK';
      }, 100);
    }
  } catch(e) {}
})();

/* ── Modal helpers ───────────────────────────────────────────── */
function openModal(id) {
  if (id === 'settings-modal') { openSettingsPanel(document.querySelector('.settings-btn')); return; }
  document.getElementById(id).classList.add('show');
  if (id === 'donate-modal') renderDonationBar('donate-modal-goal');
}
function closeModal(id) {
  if (id === 'settings-modal') { closeSettingsPanel(); return; }
  document.getElementById(id).classList.remove('show');
}

/* ── Settings panel (positioned near gear button) ─────────────── */
function openSettingsPanel(triggerEl) {
  var panel    = document.getElementById('settings-panel');
  var backdrop = document.getElementById('settings-backdrop');
  if (!panel) return;

  /* Mobile: CSS handles bottom-sheet positioning, skip JS positioning */
  if (window.innerWidth <= 700) {
    panel.style.left = '';
    panel.style.top  = '';
    panel.style.display    = 'block';
    backdrop.style.display = 'block';
    return;
  }

  /* Desktop: position relative to gear button */
  var btn = triggerEl instanceof Element ? triggerEl : (document.querySelector('.settings-btn') || triggerEl);
  if (btn && btn.getBoundingClientRect) {
    var r   = btn.getBoundingClientRect();
    var pw  = 330;
    var bx  = r.left - pw - 12;
    var by  = r.bottom + 8;
    /* Keep within viewport */
    bx = Math.max(10, Math.min(bx, window.innerWidth - pw - 10));
    by = Math.max(10, by);
    var maxH = window.innerHeight - by - 10;
    panel.style.left      = bx + 'px';
    panel.style.top       = by + 'px';
    panel.style.maxHeight = Math.max(200, maxH) + 'px';
  }

  panel.style.display    = 'block';
  backdrop.style.display = 'block';
}

function closeSettingsPanel() {
  var panel    = document.getElementById('settings-panel');
  var backdrop = document.getElementById('settings-backdrop');
  if (panel)    panel.style.display    = 'none';
  if (backdrop) backdrop.style.display = 'none';
}

document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') { closeModal('donate-modal'); closeModal('pro-modal'); closeSettingsPanel(); }
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
doLoad().then(function() { initTutorial(); syncPanelAlignment(); _handleCoinDeepLink(); });

/* ── Sync right-panel spacer height to neon-section height ──────
   Makes the ad-panel content start level with the leaderboard
   header on desktop — called after load and on resize.
────────────────────────────────────────────────────────────────── */
function syncPanelAlignment() {
  var neon      = document.querySelector('.neon-section');
  var spacer    = document.getElementById('ad-panel-neon-spacer');
  var modeBar   = document.querySelector('.asset-mode-bar');
  var sigBox    = document.querySelector('.sig-box');
  if (!neon) return;
  var isDesktop = window.innerWidth > 900;

  /* Right panel spacer */
  if (spacer) spacer.style.height = isDesktop ? neon.offsetHeight + 'px' : '0px';

  /* Left sidebar: add top padding to sig-box so Portfolio Signal
     aligns with the tbl-head (neon-section bottom) */
  if (sigBox && modeBar) {
    if (isDesktop) {
      var modeBarH = modeBar.offsetHeight || 0;
      var needed   = neon.offsetHeight - modeBarH;
      /* clamp so it never goes negative */
      sigBox.style.marginTop = Math.max(0, needed) + 'px';
    } else {
      sigBox.style.marginTop = '';
    }
  }
}
window.addEventListener('resize', function() { syncPanelAlignment(); });

/* ══════════════════════════════════════════════════════════════
   TILE DETAIL PANEL — openTileDetail / openAssetDetail
   Shared redesigned card for crypto, forex and stocks.
══════════════════════════════════════════════════════════════ */
var _tdCoin = null;

function fmtMcap(n) {
  if (!n) return '—';
  if (n >= 1e12) return '$' + (n/1e12).toFixed(2) + 'T';
  if (n >= 1e9)  return '$' + (n/1e9).toFixed(2)  + 'B';
  if (n >= 1e6)  return '$' + (n/1e6).toFixed(1)  + 'M';
  return '$' + n.toLocaleString();
}
/* fmtVol uses the same bucketing as market cap — alias, not a copy */
var fmtVol = fmtMcap;

function _positionPanel(panel, evt) {
  var isMobile = window.innerWidth <= 700;
  if (isMobile) {
    /* Mobile: CSS bottom-sheet handles positioning */
    panel.style.left = ''; panel.style.top = '';
    panel.style.display = 'block';
    document.getElementById('td-overlay').classList.add('show');
    return;
  }
  panel.style.display = 'block';
  var pw = panel.offsetWidth || 340;
  var ph = panel.offsetHeight || 460;
  var cx = evt ? evt.clientX : window.innerWidth  / 2;
  var cy = evt ? evt.clientY : window.innerHeight / 2;
  var left = cx + 18, top = cy - 120;
  if (left + pw > window.innerWidth  - 16) left = cx - pw - 18;
  if (left < 8) left = 8;
  if (top  + ph > window.innerHeight - 16) top  = window.innerHeight - ph - 16;
  if (top < 8) top = 8;
  panel.style.left = left + 'px';
  panel.style.top  = top  + 'px';
  document.getElementById('td-overlay').classList.add('show');
}

function openTileDetail(coinId, evt) {
  if (evt) evt.stopPropagation();
  var c = coins.find(function(x) { return x.id === coinId || x.sym === coinId; });
  if (!c) return;
  _tdCoin = c;
  var panel = document.getElementById('td-panel');
  var icoEl = document.getElementById('td-ico');
  icoEl.src = c.image || ''; icoEl.style.display = '';
  document.getElementById('td-sym').textContent   = c.sym;
  document.getElementById('td-name').textContent  = c.name;
  document.getElementById('td-price').textContent = fmtP(c.price);

  /* 24H change under price */
  var p24chgEl = document.getElementById('td-price-chg');
  if (p24chgEl) {
    p24chgEl.textContent = (c.p24 >= 0 ? '+' : '') + c.p24.toFixed(2) + '% (24H)';
    p24chgEl.style.color = c.p24 >= 0 ? 'var(--green)' : 'var(--red)';
  }

  /* Type badge */
  var badge = document.getElementById('td-type-badge');
  if (badge) { badge.textContent = 'CRYPTO'; badge.className = 'td-type-badge crypto'; }

  /* Score breakdown — tile grid with checkmarks */
  var scC = c.score >= 65 ? 'var(--green)' : c.score <= 35 ? 'var(--red)' : '#87CEEB';
  var scHtml = '<div class="td-insight-header" style="margin-bottom:6px;">'
    + '<div class="insight-pulse ' + (c.score >= 65 ? 'green' : c.score <= 35 ? 'red' : 'blue') + ' td-insight-pulse"><span class="insight-dot"></span><span class="insight-lbl">' + (c.score >= 65 ? 'BULLISH' : c.score <= 35 ? 'BEARISH' : 'NEUTRAL') + '</span></div>'
    + '<span class="td-insight-score" style="color:' + scC + ';">' + c.score + '<span style="font-size:12px;color:var(--muted);"> / 100</span></span>'
    + '</div>';
  scHtml += '<div class="signal-tile-grid">';
  [{l:'7D RANK',v:c.r7,w:0.40},{l:'14D RANK',v:c.r14,w:0.35},{l:'30D RANK',v:c.r30,w:0.25}].forEach(function(b) {
    var pct = Math.round((1 - (b.v-1) / Math.max(coins.length-1,1)) * 100);
    var isGood = pct >= 50;
    var icon = isGood ? '✓' : '−';
    var cls  = isGood ? 'good' : 'bad';
    var hlCls = isGood ? ' highlight-good' : ' highlight-bad';
    scHtml += '<div class="signal-tile' + hlCls + '">'
      + '<span class="tile-icon ' + cls + '">' + icon + '</span>'
      + '<div class="tile-body"><span class="tile-label">' + b.l + '</span>'
      + '<span class="tile-value ' + cls + '">#' + b.v + ' · top ' + pct + '%</span></div></div>';
  });
  /* Overall score tile */
  var scGood = c.score >= 50;
  scHtml += '<div class="signal-tile' + (scGood ? ' highlight-good' : ' highlight-bad') + '">'
    + '<span class="tile-icon ' + (scGood ? 'good' : 'bad') + '">' + (scGood ? '✓' : '−') + '</span>'
    + '<div class="tile-body"><span class="tile-label">COMPOSITE</span>'
    + '<span class="tile-value ' + (scGood ? 'good' : 'bad') + '">' + c.score + ' / 100</span></div></div>';
  scHtml += '</div>';
  document.getElementById('td-score-bars').innerHTML = scHtml;

  /* Market data: mkt cap, vol, rank, ATH distance, 7D, 30D */
  var vol24 = c.volume24 || c.total_volume || null;
  var athPct = c.ath_change_pct || 0;
  var athC   = athPct >= 0 ? 'up' : 'dn';
  document.getElementById('td-market').innerHTML =
    '<div class="td-cell"><div class="td-cell-l">MKT CAP</div><div class="td-cell-v bnb">'+fmtMcap(c.mcap)+'</div></div>'
    +'<div class="td-cell"><div class="td-cell-l">24H VOL</div><div class="td-cell-v bnb">'+fmtVol(vol24)+'</div></div>'
    +'<div class="td-cell"><div class="td-cell-l">MC RANK</div><div class="td-cell-v bnb">'+(c.rank?'#'+c.rank:'—')+'</div></div>'
    +'<div class="td-cell"><div class="td-cell-l">7D</div><div class="td-cell-v '+(c.p7>=0?'up':'dn')+'">'+(c.p7>=0?'+':'')+c.p7.toFixed(2)+'%</div></div>'
    +'<div class="td-cell"><div class="td-cell-l">14D</div><div class="td-cell-v '+(c.p14>=0?'up':'dn')+'">'+(c.p14>=0?'+':'')+c.p14.toFixed(2)+'%</div></div>'
    +'<div class="td-cell"><div class="td-cell-l">30D</div><div class="td-cell-v '+(c.p30>=0?'up':'dn')+'">'+(c.p30>=0?'+':'')+c.p30.toFixed(2)+'%</div></div>';
  /* override grid to 3 cols */
  document.getElementById('td-market').style.gridTemplateColumns = 'repeat(3,1fr)';

  /* Supply section */
  var supSec = document.getElementById('td-supply-sec');
  var supEl  = document.getElementById('td-supply');
  if (supSec && supEl) {
    var circ = c.circulating_supply;
    var maxS = c.max_supply;
    var supPct = (circ && maxS && maxS > 0) ? Math.round((circ / maxS) * 100) : null;
    var supPctStr = supPct !== null ? supPct + '%' : '∞';
    var supCol = supPct !== null ? (supPct >= 90 ? 'var(--red)' : supPct >= 70 ? 'var(--amber)' : 'var(--green)') : 'var(--muted)';
    function fmtSup(n) {
      if (!n) return '—';
      if (n >= 1e9) return (n/1e9).toFixed(2) + 'B';
      if (n >= 1e6) return (n/1e6).toFixed(2) + 'M';
      if (n >= 1e3) return (n/1e3).toFixed(1) + 'K';
      return n.toFixed(0);
    }
    supEl.innerHTML =
      '<div class="td-cell"><div class="td-cell-l">CIRCULATING</div><div class="td-cell-v bnb">'+fmtSup(circ)+'</div></div>'
      +'<div class="td-cell"><div class="td-cell-l">MAX SUPPLY</div><div class="td-cell-v bnb">'+(maxS ? fmtSup(maxS) : '∞ / No max')+'</div></div>'
      +'<div class="td-cell"><div class="td-cell-l">% UNLOCKED</div><div class="td-cell-v" style="color:'+supCol+';">'+supPctStr+'</div></div>'
      +'<div class="td-cell"><div class="td-cell-l">FROM ATH</div><div class="td-cell-v '+(athPct>=0?'up':'dn')+'">'+(athPct>=0?'+':'')+athPct.toFixed(1)+'%</div></div>';
    supEl.style.gridTemplateColumns = 'repeat(2,1fr)';
    supSec.style.display = '';
  }

  /* Signal badges */
  var badges = [];
  if (c.score >= 70)      badges.push({t:'STRONG MOM', cls:'bull'});
  else if (c.score >= 55) badges.push({t:'MOMENTUM',   cls:'bull'});
  else if (c.score <= 30) badges.push({t:'LAGGING',    cls:'bear'});
  else                    badges.push({t:'NEUTRAL',    cls:'neu'});
  if (c.p24 >=  3) badges.push({t:'24H SURGE',    cls:'bull'});
  if (c.p24 <= -3) badges.push({t:'24H DIP',      cls:'bear'});
  if (c.p7  >= 10) badges.push({t:'7D BREAKOUT',  cls:'bull'});
  if (c.p7  <=-10) badges.push({t:'7D BREAKDOWN', cls:'bear'});
  if (c.p30 >= 20) badges.push({t:'30D UPTREND',  cls:'bull'});
  if (c.p30 <=-20) badges.push({t:'30D DOWNTREND',cls:'bear'});
  var badgesHtml = '';
  if (isPro || badges.length <= 2) {
    /* Pro: show all signals. Free: show all if 2 or fewer */
    badgesHtml = badges.map(function(b) {
      var sign = b.cls === 'bull' ? '✓ ' : b.cls === 'bear' ? '− ' : '— ';
      return '<span class="td-badge ' + b.cls + '">' + sign + b.t + '</span>';
    }).join('');
  } else {
    /* Free: show first 2 badges, blur the rest with a Pro unlock nudge */
    badgesHtml = badges.slice(0, 2).map(function(b) {
      var sign = b.cls === 'bull' ? '✓ ' : b.cls === 'bear' ? '− ' : '— ';
      return '<span class="td-badge ' + b.cls + '">' + sign + b.t + '</span>';
    }).join('');
    var extraCount = badges.length - 2;
    badgesHtml += '<span class="td-badge-blur-wrap" onclick="openPro()" title="Unlock all signals with Pro" style="cursor:pointer;display:inline-flex;align-items:center;gap:4px;">';
    badges.slice(2).forEach(function(b) {
      badgesHtml += '<span class="td-badge ' + b.cls + '" style="filter:blur(4px);pointer-events:none;user-select:none;">' + b.t + '</span>';
    });
    badgesHtml += '<span style="font-size:12px;color:var(--pro);font-weight:700;letter-spacing:.08em;margin-left:2px;">⚡ PRO</span>';
    badgesHtml += '</span>';
  }
  document.getElementById('td-badges').innerHTML = badgesHtml;

  /* Insight Engine section — PRO only, show for holdings + watchlist coins */
  var insSec = document.getElementById('td-insight-sec');
  var insEl  = document.getElementById('td-insight-content');
  if (insSec && insEl) {
    var hSyms = holdings.map(function(h) { return h.sym; });
    var wSyms = (typeof watchlist !== 'undefined') ? watchlist : [];
    var isTracked = hSyms.indexOf(c.sym) >= 0 || wSyms.indexOf(c.sym) >= 0;
    if (!isPro && isTracked) {
      insEl.innerHTML = '<div style="text-align:center;padding:10px 0;">'
        + '<div style="font-size:12px;color:var(--muted);margin-bottom:6px;">Insight Engine is a Pro feature</div>'
        + '<button class="code-btn" onclick="openPro()" style="font-size:12px;padding:6px 14px;">⚡ UNLOCK PRO</button>'
        + '</div>';
      insSec.style.display = '';
    } else if (isTracked && c.insight) {
      var ins = c.insight;
      var insHtml = '<div class="td-insight-header">'
        + '<div class="insight-pulse ' + ins.color + ' td-insight-pulse"><span class="insight-dot"></span><span class="insight-lbl">' + ins.label + '</span></div>'
        + '<span class="td-insight-score" style="color:' + (ins.score >= 65 ? 'var(--green)' : ins.score <= 35 ? 'var(--red)' : '#87CEEB') + ';">' + ins.score + '<span style="font-size:12px;color:var(--muted);"> / 100</span></span>'
        + '</div>';
      if (ins.signals && ins.signals.length) {
        insHtml += '<div class="signal-tile-grid">';
        ins.signals.forEach(function(s) {
          var cls = 'neutral';
          if (s.indexOf('Oversold') >= 0 || s.indexOf('Accumulation') >= 0 || s.indexOf('Hidden Strength') >= 0 || s.indexOf('Cleared') >= 0 || s.indexOf('Extreme Fear') >= 0 || s.indexOf('Outperforming') >= 0 || s.indexOf('Bullish Cross') >= 0 || s.indexOf('Accelerating') >= 0 || s.indexOf('Recovery') >= 0 || s.indexOf('BB Squeeze') >= 0) cls = 'good';
          else if (s.indexOf('Overbought') >= 0 || s.indexOf('Dilution') >= 0 || s.indexOf('Greed') >= 0 || s.indexOf('Underperforming') >= 0 || s.indexOf('Low Liquidity') >= 0 || s.indexOf('Bearish Cross') >= 0 || s.indexOf('Decelerating') >= 0 || s.indexOf('Weakening') >= 0) cls = 'bad';
          var icon = cls === 'good' ? '✓' : cls === 'bad' ? '−' : '—';
          var hlCls = cls === 'good' ? ' highlight-good' : cls === 'bad' ? ' highlight-bad' : '';
          insHtml += '<div class="signal-tile' + hlCls + '">'
            + '<span class="tile-icon ' + cls + '">' + icon + '</span>'
            + '<div class="tile-body"><span class="tile-value ' + cls + '">' + s + '</span></div></div>';
        });
        insHtml += '</div>';
      }
      var fgVal = window.fearGreed ? window.fearGreed.value : 50;
      var fgLbl = window.fearGreed ? window.fearGreed.label : 'Neutral';
      var fgGood = fgVal <= 40;
      var fgBad  = fgVal >= 75;
      var fgCls  = fgGood ? 'good' : fgBad ? 'bad' : 'neutral';
      var fgIcon = fgGood ? '✓' : fgBad ? '−' : '—';
      var fgHl   = fgGood ? ' highlight-good' : fgBad ? ' highlight-bad' : '';
      insHtml += '<div class="signal-tile' + fgHl + '" style="margin-top:2px;">'
        + '<span class="tile-icon ' + fgCls + '">' + fgIcon + '</span>'
        + '<div class="tile-body"><span class="tile-label">FEAR & GREED INDEX</span>'
        + '<span class="tile-value ' + fgCls + '">' + fgVal + ' — ' + fgLbl + '</span></div></div>';
      insEl.innerHTML = insHtml;
      insSec.style.display = '';
    } else {
      insSec.style.display = 'none';
    }
  }

  /* Edit Holdings section — show only for held coins */
  var editSec = document.getElementById('td-edit-hold-sec');
  if (editSec) {
    var hIdx = holdings.findIndex(function(h) { return h.sym === c.sym; });
    if (hIdx >= 0) {
      editSec.style.display = '';
      var h = holdings[hIdx];
      document.getElementById('td-hold-avg').value = h.avg || '';
      document.getElementById('td-hold-qty').value = h.qty || '';
    } else {
      editSec.style.display = 'none';
    }
  }

  _positionPanel(panel, evt);
}

/* Save edited holdings from tile detail panel */
function saveTileHolding() {
  if (!_tdCoin) return;
  var avg = parseFloat(document.getElementById('td-hold-avg').value) || null;
  var qty = parseFloat(document.getElementById('td-hold-qty').value) || null;
  var idx = holdings.findIndex(function(h) { return h.sym === _tdCoin.sym; });
  if (idx >= 0) {
    holdings[idx].avg = avg;
    holdings[idx].qty = qty;
    saveH();
    renderAll();
    /* Flash save button green */
    var btn = document.getElementById('td-hold-save');
    if (btn) { btn.textContent = '✓ SAVED'; setTimeout(function() { btn.textContent = 'SAVE'; }, 1500); }
  }
}

function openAssetDetail(assetType, id, evt) {
  if (evt) evt.stopPropagation();
  var panel = document.getElementById('td-panel');
  if (!panel) return;
  var icoEl = document.getElementById('td-ico');

  /* Hide supply section for non-crypto */
  var supSec = document.getElementById('td-supply-sec');
  if (supSec) supSec.style.display = 'none';

  /* Clear 24H sub-label */
  var p24chgEl = document.getElementById('td-price-chg');
  if (p24chgEl) { p24chgEl.textContent = ''; }

  if (assetType === 'stock') {
    var data = stocksData.find(function(s) { return s.sym === id; });
    if (!data) return;
    icoEl.src = ''; icoEl.style.display = 'none';
    document.getElementById('td-sym').textContent   = data.sym;
    document.getElementById('td-name').textContent  = data.name;
    document.getElementById('td-price').textContent = data.price >= 1000
      ? '$' + data.price.toLocaleString('en-US', {maximumFractionDigits:0})
      : '$' + data.price.toFixed(2);
    var badge = document.getElementById('td-type-badge');
    if (badge) { badge.textContent = data.type === 'index' ? 'INDEX' : 'STOCK'; badge.className = 'td-type-badge ' + (data.type === 'index' ? 'index' : 'stock'); }

    var dayC = data.chgPct >= 0 ? 'up' : 'dn';
    if (p24chgEl) { p24chgEl.textContent = (data.chgPct>=0?'+':'')+data.chgPct.toFixed(2)+'% today'; p24chgEl.style.color = data.chgPct>=0?'var(--green)':'var(--red)'; }

    var range = data.high52 - data.low52;
    var pos52 = range > 0 ? Math.round(((data.price - data.low52) / range) * 100) : 50;
    var pos52C = pos52>=65?'var(--green)':pos52>=40?'var(--amber)':'var(--red)';
    var scC    = data.score>=65?'var(--green)':data.score<=35?'var(--red)':'var(--amber)';
    document.getElementById('td-score-bars').innerHTML =
      '<div style="display:flex;align-items:baseline;gap:8px;margin-bottom:8px;">'
      +'<span style="font-size:28px;font-weight:700;color:'+scC+';">'+data.score+'</span>'
      +'<span style="font-size:12px;color:var(--muted);">/ 100 momentum score</span></div>'
      +'<div class="td-bar-row"><span class="td-bar-lbl">52W pos</span>'
      +'<div class="td-bar-wrap"><div class="td-bar-fill" style="width:'+pos52+'%;background:'+pos52C+';"></div></div>'
      +'<span class="td-bar-val" style="color:'+pos52C+';">'+pos52+'%</span></div>'
      +'<div class="td-bar-row"><span class="td-bar-lbl">Momentum</span>'
      +'<div class="td-bar-wrap"><div class="td-bar-fill" style="width:'+Math.max(2,data.score)+'%;background:'+scC+';"></div></div>'
      +'<span class="td-bar-val" style="color:'+scC+';">'+data.score+'</span></div>';

    var mktEl = document.getElementById('td-market');
    mktEl.innerHTML =
      '<div class="td-cell"><div class="td-cell-l">CHANGE $</div><div class="td-cell-v '+dayC+'">'+(data.chg>=0?'+$':'−$')+Math.abs(data.chg).toFixed(2)+'</div></div>'
      +'<div class="td-cell"><div class="td-cell-l">52W HIGH</div><div class="td-cell-v bnb">$'+data.high52.toFixed(2)+'</div></div>'
      +'<div class="td-cell"><div class="td-cell-l">52W LOW</div><div class="td-cell-v bnb">$'+data.low52.toFixed(2)+'</div></div>'
      +'<div class="td-cell"><div class="td-cell-l">FROM 52W L</div><div class="td-cell-v '+(data.price>data.low52?'up':'dn')+'">'
      +(range>0?((data.price-data.low52)/data.low52*100).toFixed(1):0)+'%</div></div>';
    mktEl.style.gridTemplateColumns = 'repeat(2,1fr)';

    var badges = [];
    if (data.score >= 65)   badges.push({t:'STRONG MOM', c:'bull'});
    else if (data.score<=35) badges.push({t:'WEAK MOM',  c:'bear'});
    else                    badges.push({t:'NEUTRAL',    c:'neu'});
    if (data.chgPct >=  2) badges.push({t:'DAY SURGE', c:'bull'});
    if (data.chgPct <= -2) badges.push({t:'DAY DROP',  c:'bear'});
    if (pos52 >= 85) badges.push({t:'NEAR 52W HIGH', c:'bull'});
    if (pos52 <= 15) badges.push({t:'NEAR 52W LOW',  c:'bear'});
    if (data.type === 'index') badges.push({t:'INDEX', c:'neu'});
    document.getElementById('td-badges').innerHTML = badges.map(function(b) {
      return '<span class="td-badge '+b.c+'">'+b.t+'</span>';
    }).join('');

  } else if (assetType === 'forex') {
    var parts = id.split('/');
    var data = forexData.find(function(f) { return f.from===parts[0] && f.to===parts[1]; });
    if (!data || data.locked) return;
    var isJPY = data.to==='JPY' || data.to==='MXN';
    var dec = isJPY ? 3 : 5;
    icoEl.style.display = 'none';
    document.getElementById('td-sym').textContent   = data.from + '/' + data.to;
    document.getElementById('td-name').textContent  = data.name;
    document.getElementById('td-price').textContent = data.rate ? data.rate.toFixed(dec) : '—';
    var badge = document.getElementById('td-type-badge');
    if (badge) { badge.textContent = 'FOREX'; badge.className = 'td-type-badge forex'; }

    var dayC = data.chgPct>0.001?'up':data.chgPct<-0.001?'dn':'fl';
    if (p24chgEl) { p24chgEl.textContent = (data.chgPct>=0?'+':'')+data.chgPct.toFixed(3)+'% today'; p24chgEl.style.color = data.chgPct>=0?'var(--green)':'var(--red)'; }

    var scC = data.score>=65?'var(--green)':data.score<=35?'var(--red)':'var(--amber)';
    var p7col  = data.p7>=0?'var(--green)':'var(--red)';
    var p30col = data.p30>=0?'var(--green)':'var(--red)';
    document.getElementById('td-score-bars').innerHTML =
      '<div style="display:flex;align-items:baseline;gap:8px;margin-bottom:8px;">'
      +'<span style="font-size:28px;font-weight:700;color:'+scC+';">'+data.score+'</span>'
      +'<span style="font-size:12px;color:var(--muted);">/ 100 &nbsp;·&nbsp; RSI '+data.rsi+'</span></div>'
      +'<div class="td-bar-row"><span class="td-bar-lbl">7D mom</span>'
      +'<div class="td-bar-wrap"><div class="td-bar-fill" style="width:'+Math.round(50+Math.min(Math.max(data.p7*12,-48),48))+'%;background:'+p7col+'"></div></div>'
      +'<span class="td-bar-val" style="color:'+p7col+';">'+(data.p7>=0?'+':'')+data.p7.toFixed(2)+'%</span></div>'
      +'<div class="td-bar-row"><span class="td-bar-lbl">30D trend</span>'
      +'<div class="td-bar-wrap"><div class="td-bar-fill" style="width:'+Math.round(50+Math.min(Math.max(data.p30*7,-48),48))+'%;background:'+p30col+'"></div></div>'
      +'<span class="td-bar-val" style="color:'+p30col+';">'+(data.p30>=0?'+':'')+data.p30.toFixed(2)+'%</span></div>'
      +'<div class="td-bar-row"><span class="td-bar-lbl">Score</span>'
      +'<div class="td-bar-wrap"><div class="td-bar-fill" style="width:'+data.score+'%;background:'+scC+'"></div></div>'
      +'<span class="td-bar-val" style="color:'+scC+';">'+data.score+'</span></div>';

    var mktEl = document.getElementById('td-market');
    mktEl.innerHTML =
      '<div class="td-cell"><div class="td-cell-l">BASE</div><div class="td-cell-v bnb">'+data.from+'</div></div>'
      +'<div class="td-cell"><div class="td-cell-l">QUOTE</div><div class="td-cell-v bnb">'+data.to+'</div></div>'
      +'<div class="td-cell"><div class="td-cell-l">RSI-14</div><div class="td-cell-v '+(data.rsi>=70?'dn':data.rsi<=30?'up':'fl')+'">'+data.rsi+'</div></div>'
      +'<div class="td-cell"><div class="td-cell-l">7D%</div><div class="td-cell-v '+(data.p7>=0?'up':'dn')+'">'+(data.p7>=0?'+':'')+data.p7.toFixed(2)+'%</div></div>'
      +'<div class="td-cell"><div class="td-cell-l">30D%</div><div class="td-cell-v '+(data.p30>=0?'up':'dn')+'">'+(data.p30>=0?'+':'')+data.p30.toFixed(2)+'%</div></div>'
      +'<div class="td-cell"><div class="td-cell-l">SIGNAL</div><div class="td-cell-v" style="color:'+data.sigC+';">'+data.signal+'</div></div>';
    mktEl.style.gridTemplateColumns = 'repeat(3,1fr)';

    var badges = [];
    if (data.signal==='BULLISH')     badges.push({t:'BULLISH',    c:'bull'});
    else if (data.signal==='BEARISH') badges.push({t:'BEARISH',   c:'bear'});
    else if (data.signal==='OVERBOUGHT') badges.push({t:'OVERBOUGHT',c:'ob'});
    else if (data.signal==='OVERSOLD')   badges.push({t:'OVERSOLD',  c:'os'});
    else badges.push({t:'NEUTRAL', c:'neu'});
    if (data.rsi >= 70) badges.push({t:'RSI HIGH',   c:'bear'});
    if (data.rsi <= 30) badges.push({t:'RSI LOW',    c:'bull'});
    if (data.p7 >=  1) badges.push({t:'7D RISING',  c:'bull'});
    if (data.p7 <= -1) badges.push({t:'7D FALLING', c:'bear'});
    document.getElementById('td-badges').innerHTML = badges.map(function(b) {
      return '<span class="td-badge '+b.c+'">'+b.t+'</span>';
    }).join('');
  }
}

function closeTileDetail() {
  var p = document.getElementById('td-panel');
  var o = document.getElementById('td-overlay');
  if (p) p.style.display = 'none';
  if (o) o.classList.remove('show');
  _tdCoin = null;
}

/* ── Deep link: open coin detail from ?coin= URL param ──────── */
var _pendingDeepLinkCoin = null;

/* Call early to capture param before anything cleans the URL */
(function() {
  try {
    var params = new URLSearchParams(window.location.search);
    var coinParam = params.get('coin');
    if (coinParam) _pendingDeepLinkCoin = coinParam;
  } catch(e) {}
})();

function _handleCoinDeepLink() {
  if (!_pendingDeepLinkCoin) return;
  var coinParam = _pendingDeepLinkCoin;
  _pendingDeepLinkCoin = null;
  try {
    /* Clean URL without reloading */
    var params = new URLSearchParams(window.location.search);
    params.delete('coin');
    var remaining = params.toString();
    var cleanUrl = window.location.pathname + (remaining ? '?' + remaining : '');
    window.history.replaceState({}, '', cleanUrl);
    /* Find coin by symbol (case insensitive) or ID */
    var sym = coinParam.toUpperCase();
    var c = coins.find(function(x) {
      return x.sym === sym || x.id === coinParam.toLowerCase();
    });
    if (c) {
      /* Delay enough for tutorial/consent overlays to settle */
      setTimeout(function() {
        /* Dismiss tutorial if it's active so the panel is visible */
        if (typeof dismissTutorial === 'function') {
          try { dismissTutorial(); } catch(e) {}
        }
        openTileDetail(c.id);
      }, 800);
    }
  } catch(e) { console.warn('Deep link error:', e); }
}

/* ── Share tile insight ─────────────────────────────────────── */
function _shareText() {
  var sym  = (document.getElementById('td-sym')  || {}).textContent || '';
  var name = (document.getElementById('td-name') || {}).textContent || '';
  var prc  = (document.getElementById('td-price')|| {}).textContent || '';
  var chg  = (document.getElementById('td-price-chg') || {}).textContent || '';
  var scoreEl = document.querySelector('#td-score-bars span');
  var score = scoreEl ? scoreEl.textContent.trim() : '';
  var badgeEls = document.querySelectorAll('#td-badges .td-badge');
  var signals = [];
  badgeEls.forEach(function(b){ if(b.textContent) signals.push(b.textContent.trim()); });
  var arrow = chg.indexOf('+') === 0 ? '▲' : chg.indexOf('-') === 0 || chg.indexOf('−') === 0 ? '▼' : '◆';
  var coinUrl = 'https://rotatortool-official.github.io?coin=' + encodeURIComponent(sym);
  var text = '━━━━━━━━━━━━━━━━\n'
    + '📊  ' + sym + '  ·  ' + prc + '\n'
    + arrow + ' ' + chg + '  ';
  if (score) text += '·  Score: ' + score + '/100';
  text += '\n';
  if (signals.length) text += '⚡ ' + signals.join(' · ') + '\n';
  text += '━━━━━━━━━━━━━━━━\n'
    + '🔍 Full analysis → ' + coinUrl + '\n'
    + 'Rotator — Free crypto rotation screener';
  return { sym: sym, text: text, url: coinUrl };
}

function _copyToClip(text, btn) {
  function done() {
    if (!btn) return;
    var orig = btn.innerHTML;
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg><span>Copied!</span>';
    btn.classList.add('copied');
    setTimeout(function(){ btn.innerHTML = orig; btn.classList.remove('copied'); }, 2000);
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done);
  } else {
    var ta = document.createElement('textarea');
    ta.value = text; ta.style.cssText = 'position:fixed;left:-9999px;';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch(e){}
    document.body.removeChild(ta); done();
  }
}

function shareTo(platform) {
  var d = _shareText();
  var enc = encodeURIComponent(d.text);
  var encUrl = encodeURIComponent(d.url);
  var btn = event && event.currentTarget;

  switch (platform) {
    case 'copy':
      _copyToClip(d.text, btn);
      return;
    case 'x':
      window.open('https://x.com/intent/tweet?text=' + enc, '_blank', 'width=550,height=420');
      break;
    case 'telegram':
      window.open('https://t.me/share/url?url=' + encUrl + '&text=' + enc, '_blank', 'width=550,height=420');
      break;
    case 'whatsapp':
      window.open('https://wa.me/?text=' + enc, '_blank', 'width=550,height=420');
      break;
    case 'discord':
      _copyToClip(d.text, btn);
      return;
    case 'messenger':
      window.open('https://www.facebook.com/dialog/send?link=' + encUrl + '&app_id=966242223397117&redirect_uri=' + encUrl, '_blank', 'width=550,height=420');
      break;
    case 'reddit':
      window.open('https://www.reddit.com/submit?title=' + encodeURIComponent('📊 ' + d.sym + ' — Rotator Insight') + '&url=' + encUrl, '_blank', 'width=800,height=600');
      break;
    case 'threads':
      window.open('https://www.threads.net/intent/post?text=' + enc, '_blank', 'width=550,height=420');
      break;
  }
}

/* ══════════════════════════════════════════════════════════════════
   SHARE CARD #1 — COIN / HOLDINGS share card (canvas image generator)
   ──────────────────────────────────────────────────────────────────
   File:     js/data-loaders.js
   Function: shareAsImage()
   Trigger:  "SNAPSHOT & SHARE" button in the coin detail modal
   Context:  Leaderboard / Holdings / Watchlist — any coin tile detail
   Card:     1200×630 (OG-compatible) — shows:
               • Coin symbol, name, price, 24H change
               • Score circle (X / 100) with colored arc
               • Signal badges (STRONG MOM, 7D BREAKOUT, etc.)
               • Market data boxes (MKT CAP, VOL, etc.)
               • CTA hook + ROTATOR branding + referral URL
   Modal:    Reuses viral-share-modal (#viral-share-modal)
   Related:  _viralCopyTemplates[], _getViralCopyData(), _updateViralCopy()

   ⚠ There is a SECOND share card for the Swap Calculator — see:
      js/ratio.js → shareSwapCard()
══════════════════════════════════════════════════════════════════ */
function shareAsImage() {
  if (!_tdCoin) return;
  var c = _tdCoin;
  if (window.Analytics) Analytics.track('Share', { source: 'coin-detail', coin: c.symbol || c.sym || '' });

  /* ── Gather visible data from the detail panel ── */
  var sym   = (document.getElementById('td-sym')  || {}).textContent || c.sym || '';
  var name  = (document.getElementById('td-name') || {}).textContent || c.name || '';
  var price = (document.getElementById('td-price')|| {}).textContent || '';
  var chg   = (document.getElementById('td-price-chg') || {}).textContent || '';
  var scoreEl = document.querySelector('#td-score-bars .td-insight-score');
  var score   = scoreEl ? scoreEl.textContent.trim().split('/')[0].trim() : (c.score || '');

  /* badges */
  var badgeEls = document.querySelectorAll('#td-badges .td-badge');
  var badges = [];
  badgeEls.forEach(function(b) { if (b.textContent) badges.push(b.textContent.trim()); });

  /* market data cells */
  var mktCells = document.querySelectorAll('#td-market .td-mkt-cell');
  var mktData = [];
  mktCells.forEach(function(cell) {
    var label = (cell.querySelector('.td-mkt-label') || {}).textContent || '';
    var val   = (cell.querySelector('.td-mkt-val')   || {}).textContent || '';
    if (label && val) mktData.push({ label: label, val: val });
  });

  /* ── Canvas setup — 1200×630 for OG-compatible ratio ── */
  var W = 1200, H = 630;
  var can = document.createElement('canvas');
  can.width = W; can.height = H;
  var ctx = can.getContext('2d');

  /* ── Background: rich dark gradient ── */
  var bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#080c12');
  bg.addColorStop(0.4, '#0d1420');
  bg.addColorStop(1, '#080c12');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  /* subtle grid pattern */
  ctx.strokeStyle = 'rgba(243,186,47,0.025)';
  ctx.lineWidth = 1;
  for (var gx = 0; gx < W; gx += 50) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke(); }
  for (var gy = 0; gy < H; gy += 50) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke(); }

  /* ── Gold accent line at top ── */
  var gold = ctx.createLinearGradient(0, 0, W, 0);
  gold.addColorStop(0, 'rgba(243,186,47,0)');
  gold.addColorStop(0.3, 'rgba(243,186,47,0.9)');
  gold.addColorStop(0.7, 'rgba(243,186,47,0.9)');
  gold.addColorStop(1, 'rgba(243,186,47,0)');
  ctx.fillStyle = gold;
  ctx.fillRect(0, 0, W, 4);

  /* ── Large glow behind score area ── */
  var glow = ctx.createRadialGradient(W - 180, 200, 0, W - 180, 200, 280);
  glow.addColorStop(0, 'rgba(243,186,47,0.1)');
  glow.addColorStop(1, 'rgba(243,186,47,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(W - 460, 0, 460, 460);

  /* ── Symbol + Name header (bigger) ── */
  ctx.fillStyle = '#f3ba2f';
  ctx.font = 'bold 80px Inter, sans-serif';
  ctx.fillText(sym, 70, 105);

  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.font = '30px Inter, sans-serif';
  ctx.fillText(name, 70, 146);

  /* ── Price (big and bold) ── */
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 82px Inter, sans-serif';
  ctx.fillText(price, 70, 244);

  /* 24H change — large */
  var isPos = chg.indexOf('+') === 0;
  var isNeg = chg.indexOf('-') === 0 || chg.indexOf('\u2212') === 0;
  ctx.fillStyle = isPos ? '#00c896' : isNeg ? '#ff4560' : 'rgba(255,255,255,0.6)';
  ctx.font = 'bold 40px Inter, sans-serif';
  var arrow = isPos ? '\u25B2 ' : isNeg ? '\u25BC ' : '';
  ctx.fillText(arrow + chg + ' (24H)', 70, 296);

  /* ── Score circle (larger, bolder) ── */
  if (score) {
    var cx = W - 180, cy = 175, r = 100;
    /* outer ring bg */
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 8;
    ctx.stroke();
    /* score arc */
    var pct = parseInt(score) / 100;
    ctx.beginPath();
    ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct);
    var arcColor = pct >= 0.6 ? '#00c896' : pct >= 0.35 ? '#f3ba2f' : '#ff4560';
    ctx.strokeStyle = arcColor;
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.lineCap = 'butt';
    /* score number */
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 72px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(score, cx, cy + 24);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = '22px Inter, sans-serif';
    ctx.fillText('/100', cx, cy + 56);
    ctx.textAlign = 'left';
  }

  /* ── Separator line ── */
  ctx.fillStyle = 'rgba(243,186,47,0.12)';
  ctx.fillRect(70, 320, W - 140, 1);

  /* ── Signal badges (larger) ── */
  if (badges.length) {
    var badgeY = 350;
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '18px Inter, sans-serif';
    ctx.fillText('SIGNALS', 70, badgeY);
    var bx2 = 70;
    badgeY += 24;
    ctx.font = 'bold 22px Inter, sans-serif';
    badges.slice(0, 4).forEach(function(b) {
      var tw = ctx.measureText(b).width + 36;
      /* badge bg */
      ctx.fillStyle = 'rgba(0,200,150,0.12)';
      _roundRect(ctx, bx2, badgeY, tw, 44, 8);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,200,150,0.4)';
      ctx.lineWidth = 1;
      _roundRect(ctx, bx2, badgeY, tw, 44, 8);
      ctx.stroke();
      /* badge text */
      ctx.fillStyle = '#00c896';
      ctx.font = 'bold 22px Inter, sans-serif';
      ctx.fillText(b, bx2 + 18, badgeY + 30);
      bx2 += tw + 14;
    });
  }

  /* ── Market data boxes (larger fonts) ── */
  var boxY = badges.length ? 430 : 350, boxH = 80, boxGap = 14;
  var visibleMkt = mktData.slice(0, 5);
  var boxW = Math.min(200, (W - 140 - boxGap * (visibleMkt.length - 1)) / Math.min(visibleMkt.length, 5));
  visibleMkt.forEach(function(d, i) {
    var bx = 70 + i * (boxW + boxGap);
    /* box bg */
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    _roundRect(ctx, bx, boxY, boxW, boxH, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    _roundRect(ctx, bx, boxY, boxW, boxH, 8);
    ctx.stroke();
    /* label */
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '14px Inter, sans-serif';
    ctx.fillText(d.label.toUpperCase(), bx + 14, boxY + 26);
    /* value */
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px Inter, sans-serif';
    var dispVal = d.val.length > 12 ? d.val.substring(0, 11) + '\u2026' : d.val;
    ctx.fillText(dispVal, bx + 14, boxY + 56);
  });

  /* ── CTA teaser — curiosity hook ── */
  var ctaY = H - 140;
  ctx.fillStyle = 'rgba(243,186,47,0.06)';
  _roundRect(ctx, 50, ctaY, W - 100, 76, 8);
  ctx.fill();
  ctx.strokeStyle = 'rgba(243,186,47,0.25)';
  ctx.lineWidth = 1.5;
  _roundRect(ctx, 50, ctaY, W - 100, 76, 8);
  ctx.stroke();
  ctx.fillStyle = 'rgba(243,186,47,0.9)';
  ctx.font = 'bold 34px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Is your coin lagging or leading?', W / 2, ctaY + 32);
  ctx.font = 'bold 26px Inter, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillText('Find out free at Rotator', W / 2, ctaY + 62);
  ctx.textAlign = 'left';

  /* ── Footer: branding + URL ── */
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(70, H - 58, W - 140, 1);

  /* Rotator brand */
  ctx.fillStyle = '#f3ba2f';
  ctx.font = 'bold 32px Inter, sans-serif';
  ctx.fillText('ROTATOR', 70, H - 22);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.font = '20px Inter, sans-serif';
  ctx.fillText('Real-time rotation signals & momentum scoring', 250, H - 22);

  /* URL right-aligned */
  ctx.fillStyle = 'rgba(243,186,47,0.7)';
  ctx.font = 'bold 20px Inter, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('rotatortool-official.github.io', W - 70, H - 22);
  ctx.textAlign = 'left';

  /* ── Gold bottom accent ── */
  ctx.fillStyle = gold;
  ctx.fillRect(0, H - 4, W, 4);

  /* ── Show viral share preview modal instead of direct download ── */
  try {
    can.toBlob(function(blob) {
      if (!blob) { _fallbackDownload(can, sym); return; }
      _viralBlob = blob;
      _viralSym  = sym;
      _viralCanvas = can;
      _viralCopyIdx = Math.floor(Math.random() * _viralCopyTemplates.length);

      /* Set preview image */
      var preview = document.getElementById('viral-share-preview');
      if (preview) {
        var url = URL.createObjectURL(blob);
        preview.innerHTML = '<img src="' + url + '" alt="' + sym + ' share card">';
      }

      /* Set share message */
      _updateViralCopy();

      /* Always show share-with-image button */
      var nativeBtn = document.getElementById('viral-native-btn');
      if (nativeBtn) nativeBtn.style.display = 'flex';

      openModal('viral-share-modal');
    }, 'image/png');
  } catch(e) {
    _fallbackDownload(can, sym);
  }
}

/* ══════════════════════════════
   VIRAL SHARE — Preview modal logic
══════════════════════════════ */
var _viralBlob   = null;
var _viralSym    = '';
var _viralCanvas = null;
var _viralCopyIdx = 0;

var _viralCopyTemplates = [
  function(sym, score, chg, link) {
    return '📊 ' + sym + ' scored ' + score + '/100 on Rotator — ' + chg + ' in 24H\n\nFull breakdown → ' + link;
  },
  function(sym, score, chg, link) {
    return 'Found this setup on Rotator. Analytics don\'t lie. ' + sym + ' ' + chg + '\n\n🔍 ' + link;
  },
  function(sym, score, chg, link) {
    return 'Level up your trading edge — ' + sym + ' is showing strong momentum (' + score + '/100)\n\n' + link + ' 🔥';
  },
  function(sym, score, chg, link) {
    return sym + ' ' + chg + ' · Score: ' + score + '/100\nRotation signals + momentum scoring, all free.\n\n→ ' + link;
  },
  function(sym, score, chg, link) {
    return '⚡ ' + sym + ' momentum alert — ' + score + '/100 composite score\n\nCheck the full analysis: ' + link;
  }
];

function _getViralCopyData() {
  var sym   = (document.getElementById('td-sym')  || {}).textContent || _viralSym || '';
  var chg   = (document.getElementById('td-price-chg') || {}).textContent || '';
  var scoreEl = document.querySelector('#td-score-bars .td-insight-score');
  var score = scoreEl ? scoreEl.textContent.trim().split('/')[0].trim() : (_tdCoin ? _tdCoin.score : '?');
  var link  = (typeof getMyReferralLink === 'function') ? getMyReferralLink() : 'https://rotatortool-official.github.io';
  return { sym: sym, score: score, chg: chg, link: link };
}

function _updateViralCopy() {
  var d = _getViralCopyData();
  var tpl = _viralCopyTemplates[_viralCopyIdx % _viralCopyTemplates.length];
  var text = tpl(d.sym, d.score, d.chg, d.link);
  var el = document.getElementById('viral-copy-text');
  if (el) el.textContent = text;
}

function cycleViralCopy() {
  _viralCopyIdx = (_viralCopyIdx + 1) % _viralCopyTemplates.length;
  _updateViralCopy();
}

function closeViralShare() {
  closeModal('viral-share-modal');
}

function viralShareTo(platform) {
  var d = _getViralCopyData();
  var tpl = _viralCopyTemplates[_viralCopyIdx % _viralCopyTemplates.length];
  var text = tpl(d.sym, d.score, d.chg, d.link);
  var enc = encodeURIComponent(text);
  var encUrl = encodeURIComponent(d.link);
  var btn = event && event.currentTarget;

  /* Auto-download image before opening platform (so user can attach it) */
  var needsImage = ['x','telegram','whatsapp','messenger','reddit','threads'].indexOf(platform) >= 0;
  if (needsImage && _viralCanvas) {
    _fallbackDownload(_viralCanvas, _viralSym);
    _showShareToast('Image saved — attach it to your post!');
  }

  switch (platform) {
    case 'copy':
      _copyToClip(text, btn);
      return;
    case 'x':
      window.open('https://x.com/intent/tweet?text=' + enc, '_blank', 'width=550,height=420');
      break;
    case 'telegram':
      window.open('https://t.me/share/url?url=' + encUrl + '&text=' + enc, '_blank', 'width=550,height=420');
      break;
    case 'whatsapp':
      window.open('https://wa.me/?text=' + enc, '_blank', 'width=550,height=420');
      break;
    case 'discord':
      _copyToClip(text, btn);
      if (_viralCanvas) _fallbackDownload(_viralCanvas, _viralSym);
      _showShareToast('Text copied + image saved!');
      return;
    case 'messenger':
      window.open('https://www.facebook.com/dialog/send?link=' + encUrl + '&app_id=966242223397117&redirect_uri=' + encUrl, '_blank', 'width=550,height=420');
      break;
    case 'reddit':
      window.open('https://www.reddit.com/submit?title=' + encodeURIComponent('\uD83D\uDCCA ' + d.sym + ' — Rotator Signal') + '&url=' + encUrl, '_blank', 'width=800,height=600');
      break;
    case 'threads':
      window.open('https://www.threads.net/intent/post?text=' + enc, '_blank', 'width=550,height=420');
      break;
  }
}

/* Brief toast notification for share actions */
function _showShareToast(msg) {
  var existing = document.getElementById('share-toast');
  if (existing) existing.remove();
  var toast = document.createElement('div');
  toast.id = 'share-toast';
  toast.textContent = msg;
  toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:rgba(243,186,47,0.95);color:#000;padding:10px 20px;border-radius:8px;font-size:13px;font-weight:600;font-family:Inter,sans-serif;z-index:9999;pointer-events:none;animation:toastIn .3s ease;';
  document.body.appendChild(toast);
  setTimeout(function(){ if (toast.parentNode) toast.remove(); }, 3000);
}

function viralNativeShare() {
  if (!_viralBlob) return;
  var d = _getViralCopyData();
  var tpl = _viralCopyTemplates[_viralCopyIdx % _viralCopyTemplates.length];
  var text = tpl(d.sym, d.score, d.chg, d.link);
  var file = new File([_viralBlob], 'rotator-' + _viralSym.toLowerCase() + '.png', { type: 'image/png' });
  /* Try native share with image, fall back to download */
  if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
    navigator.share({ files: [file], title: d.sym + ' — Rotator Signal', text: text }).catch(function(){});
  } else {
    /* Desktop: download image + copy text to clipboard */
    if (_viralCanvas) _fallbackDownload(_viralCanvas, _viralSym);
    if (navigator.clipboard) navigator.clipboard.writeText(text).catch(function(){});
  }
}

function viralDownload() {
  if (_viralCanvas) _fallbackDownload(_viralCanvas, _viralSym);
}

function _fallbackDownload(can, sym) {
  var a = document.createElement('a');
  a.download = 'rotator-' + sym.toLowerCase() + '.png';
  a.href = can.toDataURL('image/png');
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/* Canvas rounded rect helper */
function _roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/* ══════════════════════════════
   TOOLTIP SYSTEM (Smart Info Card)
══════════════════════════════ */
var tipEl = null;
var _tipTimer = null;
var _tipRow   = null;

/* Native chain lookup for common assets */
var _chainMap = {
  BTC:'Bitcoin',ETH:'Ethereum',BNB:'BNB Chain',SOL:'Solana',XRP:'XRP Ledger',
  ADA:'Cardano',DOGE:'Dogecoin',DOT:'Polkadot',AVAX:'Avalanche',SHIB:'Ethereum',
  LINK:'Ethereum',MATIC:'Polygon',UNI:'Ethereum',LTC:'Litecoin',BCH:'Bitcoin Cash',
  NEAR:'NEAR',ICP:'Internet Computer',ETC:'Ethereum Classic',XLM:'Stellar',XMR:'Monero',
  HBAR:'Hedera',FIL:'Filecoin',ATOM:'Cosmos',VET:'VeChain',TRX:'Tron',
  SUI:'Sui',APT:'Aptos',SEI:'Sei',RENDER:'Solana',JUP:'Solana',
  AAVE:'Ethereum',GRT:'Ethereum',CRV:'Ethereum',MKR:'Ethereum',LDO:'Ethereum',
  ARB:'Arbitrum',OP:'Optimism',STX:'Bitcoin',IMX:'Ethereum',INJ:'Injective',
  BLUR:'Ethereum',BONK:'Solana',WIF:'Solana',BOME:'Solana',PEPE:'Ethereum',
  ONDO:'Ethereum',WLD:'Ethereum',PYTH:'Solana',JTO:'Solana',ENA:'Ethereum',
  HYPE:'HyperEVM',TON:'TON',SAND:'Ethereum',MANA:'Ethereum',AXS:'Ronin',
  GALA:'Ethereum',ILV:'Ethereum',GMT:'Solana',FLOW:'Flow',WAX:'WAX',
  OCEAN:'Ethereum',FET:'Ethereum',AGIX:'Ethereum',NMR:'Ethereum',TAO:'Bittensor',
  ZETA:'ZetaChain',TIA:'Celestia',DYM:'Dymension',ALT:'Ethereum',OMNI:'Ethereum',
  SAGA:'Cosmos',MANTA:'Manta',MEW:'Solana',W:'Solana',RAY:'Solana',
  ORCA:'Solana',IO:'Solana',KMNO:'Solana',MET:'Solana',DRIFT:'Solana',
  MRGN:'Solana',LFI:'Solana',SBR:'Solana',SRM:'Solana',
  GMX:'Arbitrum',GNS:'Arbitrum',KWENTA:'Optimism',PENDLE:'Ethereum',
  CVX:'Ethereum',FXS:'Ethereum',OKB:'OKX Chain',STG:'Ethereum'
};

function getTip() { if (!tipEl) tipEl = document.getElementById('rt-tip'); return tipEl; }

function showTip(title, body, x, y) {
  var t = getTip(); if (!t) return;
  document.getElementById('rt-tip-title').innerHTML = title;
  document.getElementById('rt-tip-body').innerHTML  = body;
  t.classList.add('show');
  var vw = window.innerWidth, vh = window.innerHeight;
  var tw = Math.min(340, vw - 16), th = t.offsetHeight || 200;
  t.style.maxWidth = tw + 'px';
  var lx = x + 16, ly = y + 16;
  if (lx + tw > vw - 8)  lx = x - tw - 10;
  if (lx < 8) lx = 8;
  if (ly + th > vh - 8) ly = Math.max(8, vh - th - 8);
  t.style.left = lx + 'px'; t.style.top = ly + 'px';
}

function hideTip() {
  if (_tipTimer) { clearTimeout(_tipTimer); _tipTimer = null; }
  _tipRow = null;
  var t = getTip(); if (t) t.classList.remove('show');
}

function showRowTip(row, e) {
  /* 200ms hover-intent delay */
  if (_tipTimer) clearTimeout(_tipTimer);
  _tipRow = row;
  var cx = e.clientX, cy = e.clientY;
  _tipTimer = setTimeout(function() {
    if (_tipRow !== row) return;
    _buildRowTip(row, cx, cy);
  }, 200);
}

function _buildRowTip(row, cx, cy) {
  var sym     = row.getAttribute('data-sym');
  var name    = row.getAttribute('data-name');
  var mcap    = row.getAttribute('data-mcap');
  var score   = row.getAttribute('data-score');
  var p24     = row.getAttribute('data-p24');
  var p7      = row.getAttribute('data-p7');
  var p30     = row.getAttribute('data-p30');
  var held    = row.getAttribute('data-held') === '1';
  var unlock  = parseInt(row.getAttribute('data-unlock'));
  var maxSup  = parseFloat(row.getAttribute('data-maxsup'));

  var scN  = parseInt(score);
  var p24N = parseFloat(p24);
  var p7N  = parseFloat(p7);

  /* Directional sentiment based on 24h + 7d trend */
  var sentimentScore = p24N * 0.4 + p7N * 0.6;
  var isBull = sentimentScore >= 0;
  var sentimentLabel = isBull ? 'Bullish' : 'Bearish';
  var sentimentCls   = isBull ? 'bull' : 'bear';

  /* Unlocked % display */
  var unlockStr = unlock >= 0 ? unlock + '% Unlocked' : '∞ No Cap';
  var unlockCls = unlock >= 0 ? 'bnb' : 'muted';

  /* Native chain */
  var chain = _chainMap[sym] || '—';

  /* Build 2-column grid body */
  var body = '<div class="rt-tip-grid">'
    + '<div><div class="rt-tip-cell-l">Market Cap</div><div class="rt-tip-cell-v bnb">' + mcap + '</div></div>'
    + '<div><div class="rt-tip-cell-l">Unlocked Supply</div><div class="rt-tip-cell-v ' + unlockCls + '">' + unlockStr + '</div></div>'
    + '<div><div class="rt-tip-cell-l">Chain</div><div class="rt-tip-cell-v muted">' + chain + '</div></div>'
    + '<div><div class="rt-tip-cell-l">Sentiment</div><div><span class="rt-tip-sentiment ' + sentimentCls + '">' + sentimentLabel + '</span></div></div>'
    + '</div>';

  /* ── Smart Warning Engine ── */
  var warnings = [];

  /* High Inflation Warning: infinite supply OR unlocked < 20% AND score negative */
  if ((maxSup <= 0 || (unlock >= 0 && unlock < 20)) && scN < 45) {
    warnings.push('⚠️ <strong>High Inflation Risk:</strong> Low circulating supply and negative momentum.');
  }

  /* Avoidance Tip: score deep red (< -50 maps to raw score < 20 on 0-100 scale) */
  if (scN < 20) {
    warnings.push('🛑 <strong>Sentiment Warning:</strong> Strong downward pressure. Exercise caution.');
  }

  /* Strength Indicator: positive score AND market cap present */
  if (scN >= 55 && mcap !== '—') {
    warnings.push('✅ <strong>Healthy Rotation:</strong> Asset is gaining dominance.');
  }

  if (warnings.length) {
    body += '<div class="rt-tip-warning">' + warnings.join('<br style="margin-bottom:4px;">') + '</div>';
  }

  /* Holdings tag */
  if (held) {
    body += '<div style="margin-top:6px;font-size:12px;color:var(--bnb);font-family:var(--font-ui);">✓ In your holdings</div>';
  }

  showTip(sym + ' <span style="color:var(--muted);font-weight:300;">—</span> ' + name, body, cx, cy);
}

/* ══════════════════════════════
   SPLASH SCREEN LOGO ANIMATION
   Palindrome showcase: O's orbit + each letter spins on Y-axis one at a time
   Sequence: pause → O orbit → pause → R spin → T spin → A spin → T spin → R spin → pause → O orbit back → repeat
══════════════════════════════ */
(function(){
  var canvas=document.getElementById('splash-c');
  if(!canvas) return;
  var ctx=canvas.getContext('2d');
  var CW=canvas.width,CH=canvas.height;
  var FS=52,FONT='bold '+FS+'px Inter, sans-serif';
  var BASE=112,GOLD='#f3ba2f',RED='#ff4560',GREEN='#00c896';
  var fc=0,pf=0;
  var ra=Math.PI,ga=0;
  var xR1,xO1,xT1,xA,xT2,xO2,xR2,wR,wO,wT,wA,s1x,s2x,sY,oCX,oCY,oRX,oRY,rdy=false;

  /* Timing */
  var PAUSE=160,TRAVEL=180,SPIN=60,SPIN_PAUSE=30;

  /* Phase machine:
     pause1 → travel1 (O orbit) → pause2 →
     spinR1 → spR1 → spinT1 → spT1 → spinA → spA → spinT2 → spT2 → spinR2 → spR2 →
     pause3 → travel2 (O orbit back) → repeat */
  var PHASES=[
    'pause1','travel1','pause2',
    'spinR1','spR1','spinT1','spT1','spinA','spA','spinT2','spT2','spinR2','spR2',
    'pause3','travel2'
  ];
  var pi=0;
  function phase(){return PHASES[pi];}
  function nextPhase(){pi=(pi+1)%PHASES.length;pf=0;}

  /* Letter Y-axis spin state: which letter is spinning and its progress 0→1 */
  var spinLetter='',spinP=0;

  function measure(){
    ctx.font=FONT;
    wR=ctx.measureText('R').width;wO=ctx.measureText('O').width;
    wT=ctx.measureText('T').width;wA=ctx.measureText('A').width;
    var tw=wR+wO+wT+wA+wT+wO+wR;
    /* If text is wider than canvas, shrink font */
    if(tw>CW-30){
      FS=Math.floor(FS*(CW-30)/tw);
      FONT='bold '+FS+'px Inter, sans-serif';
      ctx.font=FONT;
      wR=ctx.measureText('R').width;wO=ctx.measureText('O').width;
      wT=ctx.measureText('T').width;wA=ctx.measureText('A').width;
      tw=wR+wO+wT+wA+wT+wO+wR;
    }
    var sx=(CW-tw)/2;
    xR1=sx;xO1=xR1+wR;xT1=xO1+wO;xA=xT1+wT;xT2=xA+wA;xO2=xT2+wT;xR2=xO2+wO;
    s1x=xO1+wO/2;s2x=xO2+wO/2;sY=BASE-FS*0.36;
    oCX=(s1x+s2x)/2;oCY=sY;oRX=(s2x-s1x)/2;oRY=52;rdy=true;
  }
  function ease(t){return t<0.5?2*t*t:-1+(4-2*t)*t;}
  function rpos(a){return{x:oCX+oRX*Math.cos(a),y:oCY-oRY*Math.sin(a)};}
  function gpos(a){return{x:oCX+oRX*Math.cos(a),y:oCY+oRY*Math.sin(a)};}

  /* Draw a single letter with optional Y-axis spin (scaleX) */
  function drawLetter(ch,x,y,color,scaleX,glow){
    ctx.save();
    var hw=ctx.measureText(ch).width/2;
    ctx.translate(x+hw,y);
    ctx.scale(scaleX,1);
    ctx.translate(-hw,0);
    ctx.fillStyle=color;
    if(glow){ctx.shadowBlur=glow;ctx.shadowColor=color;}
    ctx.textBaseline='alphabetic';ctx.textAlign='left';
    ctx.fillText(ch,0,0);
    ctx.restore();
  }

  function frame(){
    if(!document.getElementById('loader')||document.getElementById('loader').classList.contains('gone')) return;
    if(!rdy){requestAnimationFrame(frame);return;}
    ctx.clearRect(0,0,CW,CH);
    var fi=Math.min(1,fc/30);fc++;pf++;
    ctx.globalAlpha=fi;ctx.font=FONT;ctx.shadowBlur=0;

    var ph=phase();

    /* ── O orbit logic ── */
    if(ph==='pause1'){ra=Math.PI;ga=0;if(pf>=PAUSE)nextPhase();}
    else if(ph==='travel1'){var p=ease(Math.min(pf/TRAVEL,1));ra=Math.PI-Math.PI*2*p;ga=Math.PI*2*p;if(pf>=TRAVEL)nextPhase();}
    else if(ph==='pause2'){ra=0;ga=Math.PI;if(pf>=PAUSE)nextPhase();}
    else if(ph==='pause3'){ra=0;ga=Math.PI;if(pf>=PAUSE)nextPhase();}
    else if(ph==='travel2'){var p=ease(Math.min(pf/TRAVEL,1));ra=-Math.PI+Math.PI*2*p;ga=Math.PI*2-Math.PI*2*p;if(pf>=TRAVEL)nextPhase();}
    /* ── Letter spin phases ── */
    else if(ph==='spinR1'){spinLetter='R1';spinP=ease(Math.min(pf/SPIN,1));if(pf>=SPIN)nextPhase();}
    else if(ph==='spR1'){spinLetter='';spinP=0;if(pf>=SPIN_PAUSE)nextPhase();}
    else if(ph==='spinT1'){spinLetter='T1';spinP=ease(Math.min(pf/SPIN,1));if(pf>=SPIN)nextPhase();}
    else if(ph==='spT1'){spinLetter='';spinP=0;if(pf>=SPIN_PAUSE)nextPhase();}
    else if(ph==='spinA'){spinLetter='A';spinP=ease(Math.min(pf/SPIN,1));if(pf>=SPIN)nextPhase();}
    else if(ph==='spA'){spinLetter='';spinP=0;if(pf>=SPIN_PAUSE)nextPhase();}
    else if(ph==='spinT2'){spinLetter='T2';spinP=ease(Math.min(pf/SPIN,1));if(pf>=SPIN)nextPhase();}
    else if(ph==='spT2'){spinLetter='';spinP=0;if(pf>=SPIN_PAUSE)nextPhase();}
    else if(ph==='spinR2'){spinLetter='R2';spinP=ease(Math.min(pf/SPIN,1));if(pf>=SPIN)nextPhase();}
    else if(ph==='spR2'){spinLetter='';spinP=0;if(pf>=SPIN_PAUSE)nextPhase();}

    /* ── Calculate scaleX for spinning letter (full 360: 1→0→-1→0→1) ── */
    var scX=function(id){
      if(spinLetter!==id) return 1;
      return Math.cos(spinP*Math.PI*2);
    };

    /* ── Glow for spinning letter ── */
    var glw=function(id){
      if(spinLetter!==id) return 0;
      return 12*Math.sin(spinP*Math.PI);
    };

    /* ── Draw static letters with potential spin ── */
    drawLetter('R',xR1,BASE,GOLD,scX('R1'),glw('R1'));
    drawLetter('T',xT1,BASE,GOLD,scX('T1'),glw('T1'));
    drawLetter('A',xA,BASE,GOLD,scX('A'),glw('A'));
    drawLetter('T',xT2,BASE,GOLD,scX('T2'),glw('T2'));
    drawLetter('R',xR2,BASE,GOLD,scX('R2'),glw('R2'));

    /* ── Draw orbiting O's ── */
    var mov=(ph==='travel1'||ph==='travel2');
    var Rp=rpos(ra),Gp=gpos(ga);
    ctx.textBaseline='middle';ctx.textAlign='center';
    ctx.shadowBlur=mov?16:8;ctx.shadowColor=GREEN;ctx.fillStyle=GREEN;ctx.fillText('O',Gp.x,Gp.y);
    ctx.shadowBlur=mov?16:8;ctx.shadowColor=RED;ctx.fillStyle=RED;ctx.fillText('O',Rp.x,Rp.y);
    ctx.shadowBlur=0;ctx.globalAlpha=1;
    requestAnimationFrame(frame);
  }
  document.fonts.ready.then(function(){measure();frame();});
})();

/* ══════════════════════════════
   TOPBAR LOGO ANIMATION
   Same palindrome spin as splash but smaller
══════════════════════════════ */
(function(){
  function initLogo(){
    ['logo-c','logo-c-mob'].forEach(function(canvasId){
      var canvas=document.getElementById(canvasId);
      if(!canvas) return;
      var ctx=canvas.getContext('2d');
      var CW=canvas.width,CH=canvas.height;
      var FS=18,FONT='bold '+FS+'px Inter, sans-serif';
      var BASE=22,GOLD='#f3ba2f',RED='#ff4560',GREEN='#00c896';
      var fc=0,pf=0;
      var PAUSE=200,TRAVEL=160,SPIN=50,SPIN_PAUSE=25;
      var ra=Math.PI,ga=0;
      var xR1,xO1,xT1,xA,xT2,xO2,xR2,wR,wO,wT,wA,s1x,s2x,sY,oCX,oCY,oRX,oRY,rdy=false;
      var PHASES=['pause1','travel1','pause2','spinR1','spR1','spinT1','spT1','spinA','spA','spinT2','spT2','spinR2','spR2','pause3','travel2'];
      var pi=0,spinLetter='',spinP=0;
      function ph(){return PHASES[pi];}
      function nxt(){pi=(pi+1)%PHASES.length;pf=0;}
      function measure(){
        ctx.font=FONT;
        wR=ctx.measureText('R').width;wO=ctx.measureText('O').width;
        wT=ctx.measureText('T').width;wA=ctx.measureText('A').width;
        var tw=wR+wO+wT+wA+wT+wO+wR,sx=(CW-tw)/2;
        xR1=sx;xO1=xR1+wR;xT1=xO1+wO;xA=xT1+wT;xT2=xA+wA;xO2=xT2+wT;xR2=xO2+wO;
        s1x=xO1+wO/2;s2x=xO2+wO/2;sY=BASE-FS*0.36;
        oCX=(s1x+s2x)/2;oCY=sY;oRX=(s2x-s1x)/2;oRY=FS*0.52;rdy=true;
      }
      function ease(t){return t<0.5?2*t*t:-1+(4-2*t)*t;}
      function rpos(a){return{x:oCX+oRX*Math.cos(a),y:oCY-oRY*Math.sin(a)};}
      function gpos(a){return{x:oCX+oRX*Math.cos(a),y:oCY+oRY*Math.sin(a)};}
      function drawL(ch,x,y,color,scX,glw){
        ctx.save();var hw=ctx.measureText(ch).width/2;
        ctx.translate(x+hw,y);ctx.scale(scX,1);ctx.translate(-hw,0);
        ctx.fillStyle=color;if(glw){ctx.shadowBlur=glw;ctx.shadowColor=color;}
        ctx.textBaseline='alphabetic';ctx.textAlign='left';ctx.fillText(ch,0,0);ctx.restore();
      }
      function frame(){
        if(!rdy){requestAnimationFrame(frame);return;}
        ctx.clearRect(0,0,CW,CH);
        var fi=Math.min(1,fc/20);fc++;pf++;ctx.globalAlpha=fi;ctx.font=FONT;ctx.shadowBlur=0;
        var p=ph();
        if(p==='pause1'){ra=Math.PI;ga=0;if(pf>=PAUSE)nxt();}
        else if(p==='travel1'){var e=ease(Math.min(pf/TRAVEL,1));ra=Math.PI*(1-2*e);ga=Math.PI*2*e;if(pf>=TRAVEL)nxt();}
        else if(p==='pause2'){ra=0;ga=Math.PI;if(pf>=PAUSE)nxt();}
        else if(p==='pause3'){ra=0;ga=Math.PI;if(pf>=PAUSE)nxt();}
        else if(p==='travel2'){var e=ease(Math.min(pf/TRAVEL,1));ra=-Math.PI+Math.PI*2*e;ga=Math.PI*2*(1-e);if(pf>=TRAVEL)nxt();}
        else if(p.indexOf('spin')===0){var id=p.slice(4);spinLetter=id;spinP=ease(Math.min(pf/SPIN,1));if(pf>=SPIN)nxt();}
        else if(p.indexOf('sp')===0){spinLetter='';spinP=0;if(pf>=SPIN_PAUSE)nxt();}
        var scX=function(id){return spinLetter!==id?1:Math.cos(spinP*Math.PI*2);};
        var glw=function(id){return spinLetter!==id?0:6*Math.sin(spinP*Math.PI);};
        drawL('R',xR1,BASE,GOLD,scX('R1'),glw('R1'));
        drawL('T',xT1,BASE,GOLD,scX('T1'),glw('T1'));
        drawL('A',xA,BASE,GOLD,scX('A'),glw('A'));
        drawL('T',xT2,BASE,GOLD,scX('T2'),glw('T2'));
        drawL('R',xR2,BASE,GOLD,scX('R2'),glw('R2'));
        var mov=(p==='travel1'||p==='travel2');
        var Rp=rpos(ra),Gp=gpos(ga);
        ctx.textBaseline='middle';ctx.textAlign='center';
        ctx.shadowBlur=mov?8:4;ctx.shadowColor=GREEN;ctx.fillStyle=GREEN;ctx.fillText('O',Gp.x,Gp.y);
        ctx.shadowBlur=mov?8:4;ctx.shadowColor=RED;ctx.fillStyle=RED;ctx.fillText('O',Rp.x,Rp.y);
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
    var FS=28,FONT='bold '+FS+'px Inter, sans-serif';
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
