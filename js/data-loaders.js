/* ══════════════════════════════════════════════════════════════════
   data-loaders.js  —  FINAL WORKING VERSION
   Fast loading + restored animations + tiles
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

/* ====================== PARALLEL MAIN LOAD ====================== */
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

    if (_modeEnabled.forex)  setTimeout(loadForex,  800);
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
    var goldData =
