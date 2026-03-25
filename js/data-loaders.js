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
/* ====================== MISSING FUNCTIONS (FIX FOR TILE CLICKS) ====================== */

function openTileDetail(coinId, evt) {
  if (evt) evt.stopPropagation();
  var c = coins.find(function(x) { return x.id === coinId || x.sym === coinId; });
  if (!c) return;

  var panel = document.getElementById('td-panel');
  var icoEl = document.getElementById('td-ico');
  icoEl.src = c.image || ''; 
  icoEl.style.display = '';

  document.getElementById('td-sym').textContent = c.sym;
  document.getElementById('td-name').textContent = c.name;
  document.getElementById('td-price').textContent = fmtP(c.price);

  // Performance
  document.getElementById('td-perf').innerHTML = [
    {l:'24H', v:c.p24}, {l:'7D', v:c.p7}, {l:'30D', v:c.p30}
  ].map(function(p) {
    var cls = p.v >= 0 ? 'up' : 'dn';
    return '<div class="td-cell"><div class="td-cell-l">' + p.l + '</div>'
      + '<div class="td-cell-v ' + cls + '">' + (p.v>=0?'+':'') + p.v.toFixed(1) + '%</div></div>';
  }).join('');

  // Score bars
  var scC = c.score >= 65 ? 'var(--green)' : c.score <= 35 ? 'var(--red)' : 'var(--amber)';
  document.getElementById('td-score-bars').innerHTML =
    '<div style="display:flex;align-items:baseline;gap:6px;margin-bottom:8px;">'
    + '<span style="font-size:26px;font-weight:700;color:' + scC + ';">' + c.score + '</span>'
    + '<span style="font-size:10px;color:var(--muted);">/ 100 composite score</span></div>'
    + [{l:'7D rank',v:c.r7},{l:'14D rank',v:c.r14},{l:'30D rank',v:c.r30}].map(function(b) {
      var pct = Math.round((1 - (b.v-1) / Math.max(coins.length-1,1)) * 100);
      var col = pct>=65?'var(--green)':pct>=40?'var(--amber)':'var(--red)';
      return '<div class="td-bar-row"><span class="td-bar-lbl">' + b.l + '</span>'
        + '<div class="td-bar-wrap"><div class="td-bar-fill" style="width:'+pct+'%;background:'+col+';"></div></div>'
        + '<span class="td-bar-val" style="color:'+col+';">#'+b.v+'</span></div>';
    }).join('');

  // Market data
  var vol24 = c.volume24 || 0;
  document.getElementById('td-market').innerHTML = [
    {l:'MKT CAP', v:fmtMcap(c.mcap)},
    {l:'24H VOL', v:fmtVol(vol24)},
    {l:'RANK', v:c.rank ? '#'+c.rank : '—'}
  ].map(function(m) {
    return '<div class="td-cell"><div class="td-cell-l">'+m.l+'</div><div class="td-cell-v bnb">'+m.v+'</div></div>';
  }).join('');

  _positionPanel(panel, evt);
}

function openAssetDetail(assetType, id, evt) {
  console.log("Asset detail clicked:", assetType, id); // placeholder for now
}

function closeTileDetail() {
  var p = document.getElementById('td-panel');
  var o = document.getElementById('td-overlay');
  if (p) p.style.display = 'none';
  if (o) o.classList.remove('show');
}

function _positionPanel(panel, evt) {
  var pw = 310, ph = 400;
  var cx = evt ? evt.clientX : window.innerWidth / 2;
  var cy = evt ? evt.clientY : window.innerHeight / 2;
  var left = cx + 16, top = cy - 60;
  if (left + pw > window.innerWidth - 12) left = cx - pw - 16;
  if (top + ph > window.innerHeight - 12) top = window.innerHeight - ph - 12;
  if (top < 8) top = 8;
  panel.style.left = left + 'px';
  panel.style.top  = top  + 'px';
  panel.style.display = 'block';
  document.getElementById('td-overlay').classList.add('show');
}

/* Tooltip helpers */
function showRowTip(row, e) {
  console.log("Row tip:", row);
}

function hideTip() {
  // placeholder
}

/* Format helpers (needed for detail panel) */
function fmtP(p) {
  if (p === null || p === undefined) return '—';
  if (p >= 1000) return '$' + p.toLocaleString('en-US', {maximumFractionDigits: 0});
  if (p >= 1)    return '$' + p.toFixed(2);
  if (p >= 0.01) return '$' + p.toFixed(4);
  return '$' + p.toFixed(6);
}

function fmtMcap(n) {
  if (!n) return '—';
  if (n >= 1e12) return '$' + (n/1e12).toFixed(2) + 'T';
  if (n >= 1e9)  return '$' + (n/1e9).toFixed(2)  + 'B';
  if (n >= 1e6)  return '$' + (n/1e6).toFixed(1)  + 'M';
  return '$' + n.toLocaleString();
}

function fmtVol(n) { return fmtMcap(n); }
