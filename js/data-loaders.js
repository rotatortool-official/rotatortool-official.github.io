/* ══════════════════════════════════════════════════════════════════
   data-loaders.js  —  FINAL CLEAN VERSION
   Parallel loading + fixed syntax
══════════════════════════════════════════════════════════════════ */

var forexData    = [];
var stocksData   = [];
var forexLoaded  = false;
var stocksLoaded = false;
var currentMode  = 'crypto';
var busy         = false;

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

/* Typewriter */
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

/* ====================== MAIN PARALLEL LOAD ====================== */
async function doLoad() {
  const loader = document.getElementById('loader');
  if (loader) loader.classList.remove('gone');

  prog(10, 'Fetching top 50 coins...');

  try {
    await Promise.all([
      loadBTC(),
      loadCoins(),
      loadMacroData()
    ]);

    renderAll();

    if (_modeEnabled.forex)  setTimeout(loadForex, 800);
    if (_modeEnabled.stocks) setTimeout(loadStocks, 1200);

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
      score: 0, r7: 0, r14: 0, r30: 0, isPro: false
    };
  });

  coins.sort(function(a, b) { return b.mcap - a.mcap; });
  coins.forEach(function(c, i) { c.rank = i + 1; });

  computeScores();
}

async function loadBTC() {
  var btcUrl = 'https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=200';
  var d = await apiFetch(btcUrl);
  if (!d || !Array.isArray(d.prices)) throw new Error('BTC history invalid');

  var p = d.prices, s = 0;
  for (var i = 0; i < p.length; i++) s += p[i][1];
  btcMA200 = s / p.length;
  btcPrice = p[p.length - 1][1];
}

var _macroData = {btcP7: null, goldP7: null, silverP7: null, oilP7: null};

async function loadMacroData() {
  try {
    var goldUrl = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=tether-gold&price_change_percentage=7d&per_page=1';
    var goldData = await apiFetch(goldUrl);
    if (Array.isArray(goldData) && goldData.length)
      _macroData.goldP7 = goldData[0].price_change_percentage_7d_in_currency || 0;

    var silverUrl = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=silver&price_change_percentage=7d&per_page=1';
    var silverData = await apiFetch(silverUrl);
    if (Array.isArray(silverData) && silverData.length)
      _macroData.silverP7 = silverData[0].price_change_percentage_7d_in_currency || 0;

    var btcCoin = coins.find(function(c) { return c.id === 'bitcoin'; });
    if (btcCoin) _macroData.btcP7 = btcCoin.p7;
  } catch(e) { 
    console.warn('Macro data:', e.message); 
  }
}

function computeScores() {
  var n = Math.max(coins.length - 1, 1);

  ['p7','p14','p30'].forEach(function(k) {
    var sorted = coins.slice().sort(function(a, b) { return b[k] - a[k]; });
    sorted.forEach(function(c, i) { c['r' + k.slice(1)] = i + 1; });
  });

  coins.forEach(function(c) {
    var wAvg = (c.r7 * 0.25 + c.r14 * 0.30 + c.r30 * 0.45);
    var layer1 = Math.round((1 - (wAvg - 1) / n) * 40);

    var btcP7 = _macroData.btcP7 != null ? _macroData.btcP7 : 0;
    var goldP7 = _macroData.goldP7 != null ? _macroData.goldP7 : 2;
    var silvP7 = _macroData.silverP7 != null ? _macroData.silverP7 : 1.5;
    var oilP7 = _macroData.oilP7 != null ? _macroData.oilP7 : 1;

    var delta = (c.p7 - btcP7)*0.40 + (c.p7 - goldP7)*0.30 + (c.p7 - silvP7)*0.15 + (c.p7 - oilP7)*0.15;
    var layer2 = Math.min(30, Math.max(0, Math.round(15 + Math.min(Math.max(delta * 0.9, -15), 15))));

    var tkx = TOKENOMICS_DB[c.id] || {deflation:'none', unlockRisk:'medium'};
    var supplyPts = 0;
    if (c.circulating_supply && c.max_supply && c.max_supply > 0) {
      var ratio = c.circulating_supply / c.max_supply;
      if (ratio > 0.90) supplyPts = 10;
      else if (ratio > 0.70) supplyPts = 5;
      else if (ratio > 0.40) supplyPts = 0;
      else if (ratio > 0.20) supplyPts = -15;
      else supplyPts = -25;
    } else if (!c.max_supply) supplyPts = -3;

    var deflPts = tkx.deflation === 'full' ? 15 : tkx.deflation === 'partial' ? 8 : tkx.deflation === 'fixed' ? 5 : 0;
    var unlockPts = tkx.unlockRisk === 'low' ? 0 : tkx.unlockRisk === 'medium' ? -5 : -10;
    var layer3 = Math.min(30, Math.max(-50, supplyPts + deflPts + unlockPts));

    c.score = Math.min(100, Math.max(-50, Math.round(layer1 + layer2 + layer3)));
  });
}

/* ====================== PLACEHOLDERS (to avoid errors) ====================== */
async function loadForex() {
  console.log("Forex loading skipped for now");
  forexLoaded = true;
}

async function loadStocks() {
  console.log("Stocks loading skipped for now");
  stocksLoaded = true;
}

function renderForexTable() {}
function renderStocksTable() {}

/* ====================== MODE SWITCHING ====================== */
function setMode(mode) {
  if (!_modeEnabled[mode]) return;
  currentMode = mode;
  ['crypto','forex','stocks'].forEach(function(m) {
    var b = document.getElementById('am-' + m);
    if (b) b.classList.toggle('active', m === mode);
    var h = document.getElementById('holdings-' + m);
    if (h) h.style.display = (m === mode) ? 'flex' : 'none';
  });
  document.getElementById('crypto-panel').style.display = mode === 'crypto' ? '' : 'none';
  document.getElementById('forex-panel').style.display  = mode === 'forex'  ? '' : 'none';
  document.getElementById('stocks-panel').style.display = mode === 'stocks' ? '' : 'none';
}

function applyModePrefs() {
  ['crypto','forex','stocks'].forEach(function(m) {
    var chk = document.getElementById('mode-' + m + '-toggle');
    if (chk) chk.checked = _modeEnabled[m];
  });
}

/* ====================== OTHER ====================== */
function dismissBearBanner() {
  _bearDismissed = true;
  try { localStorage.setItem('rot_bear_dismissed', '1'); } catch(e) {}
  document.getElementById('bear-banner').classList.remove('show');
}

function openModal(id) { 
  document.getElementById(id).classList.add('show'); 
}
function closeModal(id) { 
  document.getElementById(id).classList.remove('show'); 
}

/* Expose for index.html */
window.doLoad = doLoad;
