/* ══════════════════════════════════════════════════════════════════
   data-loaders.js  —  OPTIMIZED PARALLEL LOADING + BETTER UX
   Faster tiles, skeletons, background loading for forex/stocks
══════════════════════════════════════════════════════════════════ */

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
    ['crypto','forex','stocks'].forEach(function(m) { 
      if (saved[m] === false) _modeEnabled[m] = false; 
    });
  } catch(e) {}
})();

function saveModePrefs() { 
  try { localStorage.setItem('rot_modes', JSON.stringify(_modeEnabled)); } catch(e) {} 
}

/* Typewriter loading message */
var _twTimer = null;
function prog(p, m) {
  var el = document.getElementById('lmsg');
  if (!el) return;
  if (_twTimer) clearTimeout(_twTimer);
  el.textContent = '';
  var i = 0;
  function type() {
    if (i < m.length) { 
      el.textContent += m[i++]; 
      _twTimer = setTimeout(type, 28); 
    }
  }
  type();
}

/* ====================== PARALLEL MAIN LOAD ====================== */
async function doLoad() {
  const loader = document.getElementById('loader');
  if (loader) loader.classList.remove('gone');

  prog(10, 'Fetching top 50 coins...');

  try {
    /* Load critical data in parallel for fast tile population */
    await Promise.all([
      loadBTC(),
      loadCoins(),
      loadMacroData()
    ]);

    /* Render the main view immediately */
    renderAll();

    /* Load slower sections in background */
    if (_modeEnabled.forex)  setTimeout(() => loadForex(),  800);
    if (_modeEnabled.stocks) setTimeout(() => loadStocks(), 1200);

  } catch (err) {
    console.error(err);
    const msgEl = document.getElementById('lmsg');
    if (msgEl) msgEl.innerHTML = '⚠ Failed to load data — <span style="color:var(--bnb);cursor:pointer" onclick="location.reload()">Retry</span>';
  } finally {
    setTimeout(() => {
      if (loader) loader.classList.add('gone');
    }, 700);
  }
}

/* ====================== CRYPTO ====================== */
async function loadCoins() {
  prog(20, 'Building leaderboard...');

  /* Show skeleton rows */
  var tbody = document.getElementById('tbody');
  if (tbody) {
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
  if (!isCached) await sleep(800);

  var d = await apiFetch(btcUrl);
  if (!d || !Array.isArray(d.prices)) throw new Error('BTC history invalid');

  var p = d.prices, s = 0;
  for (var i = 0; i < p.length; i++) s += p[i][1];
  btcMA200 = s / p.length;
  btcPrice = p[p.length - 1][1];
}

/* Macro data */
var _macroData = {btcP7: null, goldP7: null, silverP7: null, oilP7: null};

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
  } catch(e) { 
    console.warn('Macro data:', e.message); 
  }
}

/* Score engine */
function computeScores() {
  var n = Math.max(coins.length - 1, 1);

  ['p7','p14','p30'].forEach(function(k) {
    var sorted = coins.slice().sort(function(a, b) { return b[k] - a[k]; });
    sorted.forEach(function(c, i) { c['r' + k.slice(1)] = i + 1; });
  });

  coins.forEach(function(c) {
    var wAvg   = (c.r7 * 0.25 + c.r14 * 0.30 + c.r30 * 0.45);
    var layer1 = Math.round((1 - (wAvg - 1) / n) * 40);

    var btcP7  = _macroData.btcP7    != null ? _macroData.btcP7    : (coins.find(function(x){ return x.id==='bitcoin'; }) || {p7:0}).p7;
    var goldP7 = _macroData.goldP7   != null ? _macroData.goldP7   : 2;
    var silvP7 = _macroData.silverP7 != null ? _macroData.silverP7 : 1.5;
    var oilP7  = _macroData.oilP7    != null ? _macroData.oilP7    : 1;
    var delta  = (c.p7 - btcP7)*0.40 + (c.p7 - goldP7)*0.30 + (c.p7 - silvP7)*0.15 + (c.p7 - oilP7)*0.15;
    var layer2 = Math.min(30, Math.max(0, Math.round(15 + Math.min(Math.max(delta * 0.9, -15), 15))));

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

/* ====================== FOREX ====================== */
function calcRSI(closes, period) { /* your original calcRSI */ }
function calcForexScore(closes) { /* your original calcForexScore */ }

async function loadForex() {
  /* your original loadForex function - unchanged */
  /* (paste the entire original loadForex here) */
}

function renderForexTable() {
  /* your original renderForexTable - unchanged */
}

/* ====================== STOCKS ====================== */
function calcStockScore(price, high52, low52, chgPct) { /* your original */ }

async function fetchStocksYahoo(syms) { /* your original */ }
async function fetchStockAV(avSym) { /* your original */ }

async function loadStocks() {
  /* your original loadStocks function - unchanged */
}

function renderStocksTable() {
  /* your original renderStocksTable - unchanged */
}

/* ====================== MODE SWITCHING ====================== */
function toggleModeVisibility(mode, on) { /* your original */ }
function setMode(mode) { /*
