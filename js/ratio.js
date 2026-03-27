/* ══════════════════════════════════════════════════════════════════
   ratio.js  —  Swap Ratio Tracker
   
   HOW TO EDIT THIS FILE:
   ──────────────────────
   • CHANGE BADGE THRESHOLDS: Find renderRatioBadge() and edit the
     percentile cutoffs (currently: ≥80th = great, ≥50th = decent etc.)
   
   • CHANGE TIMEFRAMES: The widget supports 1d / 7d / 30d. These
     match the same timeframes used in the main leaderboard.
   
   • HOW COIN SELECTION WORKS:
     - "FROM" dropdown is populated from user's crypto holdings
     - "TO" dropdown is populated from FREE_COINS (all 100)
     - When the user has holdings, FROM defaults to their first holding
     - Changing either dropdown triggers a fresh data fetch
   
   • USES apiFetch() from api-pool.js — all caching, proxy rotation
     and rate-limit handling is inherited automatically.
══════════════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════════════════
   MODULE SETUP
══════════════════════════════════════════════════════════════════ */
var RatioTracker = (function() {

  /* ── State ──────────────────────────────────────────────────── */
  var state = {
    fromCoin  : null,   /* CoinGecko ID of the coin being sold    */
    toCoin    : null,   /* CoinGecko ID of the coin being bought  */
    fromPrice : null,
    toPrice   : null,
    fromChg24 : null,
    toChg24   : null,
    days      : 7,      /* active timeframe: 1 | 7 | 30           */
    series    : [],     /* { t, r } ratio history points           */
    chart     : null,
    loading   : false,
    histCache : {}      /* keyed: fromId+'|'+toId+'|'+days         */
  };

  /* ── CoinGecko display name lookup (same IDs as FREE_COINS) ── */
  /* Used to show friendly labels in the dropdowns                 */
  var CG_LABELS = {
    'bitcoin':'BTC','ethereum':'ETH','binancecoin':'BNB','solana':'SOL',
    'ripple':'XRP','dogecoin':'DOGE','cardano':'ADA','avalanche-2':'AVAX',
    'shiba-inu':'SHIB','chainlink':'LINK','polkadot':'DOT','bitcoin-cash':'BCH',
    'near':'NEAR','litecoin':'LTC','uniswap':'UNI','internet-computer':'ICP',
    'ethereum-classic':'ETC','stellar':'XLM','monero':'XMR','okb':'OKB',
    'hedera-hashgraph':'HBAR','filecoin':'FIL','cosmos':'ATOM','vechain':'VET',
    'tron':'TRX','sui':'SUI','aptos':'APT','sei-network':'SEI',
    'render-token':'RENDER','jupiter-exchange-solana':'JUP','aave':'AAVE',
    'the-graph':'GRT','curve-dao-token':'CRV','maker':'MKR','lido-dao':'LDO',
    'arbitrum':'ARB','optimism':'OP','stacks':'STX','immutable-x':'IMX',
    'injective-protocol':'INJ','blur':'BLUR','bonk':'BONK','dogwifcoin':'WIF',
    'book-of-meme':'BOME','pepe':'PEPE','ondo-finance':'ONDO',
    'worldcoin-wld':'WLD','pyth-network':'PYTH',
    'jito-governance-token':'JTO','ethena':'ENA',
    'hyperliquid':'HYPE','toncoin':'TON','the-sandbox':'SAND',
    'decentraland':'MANA','axie-infinity':'AXS','gala':'GALA',
    'illuvium':'ILV','stepn':'GMT','flow':'FLOW','wax':'WAXP',
    'ocean-protocol':'OCEAN','fetch-ai':'FET','singularitynet':'AGIX',
    'numeraire':'NMR','bittensor':'TAO','zetachain':'ZETA',
    'celestia':'TIA','dymension':'DYM','altlayer':'ALT',
    'omni-network':'OMNI','saga-2':'SAGA','manta-network':'MANTA',
    'mew':'MEW','nyan-heroes':'NYAN','parcl':'PRCL',
    'io-net':'IO','kamino':'KMNO','meteora':'MET','drift-protocol':'DRIFT',
    'marginfi':'MRGN','raydium':'RAY','orca':'ORCA','lifinity':'LFNTY',
    'saber':'SBR','serum':'SRM','wormhole':'W','layerzero':'ZRO',
    'across-protocol':'ACX','synapse-2':'SYN','stargate-finance':'STG',
    'gmx':'GMX','gains-network':'GNS','kwenta':'KWENTA',
    'polynomial-protocol':'POL','vertex-protocol':'VRTX',
    'pendle':'PENDLE','spectra-finance':'SPECTRA','time-wonderland':'TIME',
    'convex-finance':'CVX','frax-share':'FXS'
  };

  function label(id) { return CG_LABELS[id] || id.toUpperCase().slice(0,6); }

  /* ── DOM shortcuts ──────────────────────────────────────────── */
  function $  (id) { return document.getElementById(id); }
  function set(id, v) { var el=$(id); if(el) el.textContent = v; }
  function html(id, v) { var el=$(id); if(el) el.innerHTML = v; }

  /* ── Status line ─────────────────────────────────────────────  */
  function status(msg, cls) {
    var el = $('rt-status');
    if (!el) return;
    el.textContent = msg;
    el.className = 'rt-status' + (cls ? ' ' + cls : '');
  }

  /* ── Price formatter (reuse site convention) ─────────────────  */
  function fmtP(n) {
    if (!n) return '—';
    if (n >= 100) return '$' + n.toFixed(2);
    if (n >= 1)   return '$' + n.toFixed(3);
    if (n >= 0.01) return '$' + n.toFixed(4);
    return '$' + n.toFixed(6);
  }

  /* ── Populate "FROM" dropdown from user holdings + FREE_COINS ─ */
  function buildFromDropdown() {
    var sel = $('rt-from');
    if (!sel) return;
    sel.innerHTML = '';

    var holdingIds = (typeof holdings !== 'undefined' ? holdings : [])
      .map(function(h){ return h.sym; })
      .filter(function(id){ return CG_LABELS[id]; });

    /* Holdings group first */
    if (holdingIds.length) {
      var grp = document.createElement('optgroup');
      grp.label = 'My Holdings';
      holdingIds.forEach(function(id) {
        var o = document.createElement('option');
        o.value = id;
        o.textContent = label(id) + '  —  ' + id;
        grp.appendChild(o);
      });
      sel.appendChild(grp);
    }

    /* All coins group */
    var grp2 = document.createElement('optgroup');
    grp2.label = 'All Coins';
    FREE_COINS.forEach(function(id) {
      if (holdingIds.indexOf(id) >= 0) return; /* already shown above */
      var o = document.createElement('option');
      o.value = id;
      o.textContent = label(id) + '  —  ' + id;
      grp2.appendChild(o);
    });
    sel.appendChild(grp2);

    /* Default selection */
    if (holdingIds.length) sel.value = holdingIds[0];
    else sel.value = FREE_COINS[0];

    state.fromCoin = sel.value;
  }

  /* ── Populate "TO" dropdown (all FREE_COINS, skip fromCoin) ─── */
  function buildToDropdown(skipId) {
    var sel = $('rt-to');
    if (!sel) return;
    sel.innerHTML = '';

    var grp = document.createElement('optgroup');
    grp.label = 'All Coins';
    FREE_COINS.forEach(function(id) {
      if (id === skipId) return;
      var o = document.createElement('option');
      o.value = id;
      o.textContent = label(id) + '  —  ' + id;
      grp.appendChild(o);
    });
    sel.appendChild(grp);

    /* Default to a sensible swap target */
    var defaults = ['bitcoin','ethereum','solana','ondo-finance'];
    var picked = defaults.find(function(d){ return d !== skipId; }) || FREE_COINS.find(function(d){ return d !== skipId; });
    sel.value = picked;
    state.toCoin = sel.value;
  }

  /* ── Sync pair header labels ─────────────────────────────────  */
  function updatePairLabels() {
    var f = state.fromCoin, t = state.toCoin;
    if (!f || !t) return;
    set('rt-from-lbl', label(f));
    set('rt-to-lbl',   label(t));
    set('rt-unit-txt', label(t) + ' received per 1 ' + label(f));
    set('rt-from-card-lbl', label(f));
    set('rt-to-card-lbl',   label(t));
    set('rt-calc-from-lbl', 'Amount of ' + label(f));
  }

  /* ══════════════════════════════════════════════════════════════
     DATA LOADING
  ══════════════════════════════════════════════════════════════ */

  /* ── Load live prices for both coins ─────────────────────────  */
  async function loadPrices() {
    var f = state.fromCoin, t = state.toCoin;
    var base = 'https://api.coingecko.com/api/v3/simple/price?vs_currencies=usd&include_24hr_change=true&ids=';

    /* Fetch both in one call if possible */
    var raw = await apiFetch(base + f + ',' + t);

    var fo = raw[f], to = raw[t];
    if (!fo || fo.usd === undefined) throw new Error(label(f) + ' price missing');
    if (!to || to.usd === undefined) throw new Error(label(t) + ' price missing');

    state.fromPrice = fo.usd;
    state.toPrice   = to.usd;
    state.fromChg24 = fo.usd_24h_change || 0;
    state.toChg24   = to.usd_24h_change || 0;

    var ratio = state.fromPrice / state.toPrice;

    /* Ratio display */
    var rEl = $('rt-ratio-num');
    if (rEl) { rEl.textContent = ratio.toFixed(2) + '×'; rEl.classList.remove('dim'); }

    /* Price cards */
    set('rt-from-price', fmtP(state.fromPrice));
    set('rt-to-price',   fmtP(state.toPrice));

    var fChgEl = $('rt-from-chg'), tChgEl = $('rt-to-chg');
    if (fChgEl) {
      fChgEl.textContent = (state.fromChg24 >= 0 ? '+' : '') + state.fromChg24.toFixed(2) + '% 24h';
      fChgEl.style.color = state.fromChg24 >= 0 ? 'var(--green)' : 'var(--red)';
    }
    if (tChgEl) {
      tChgEl.textContent = (state.toChg24 >= 0 ? '+' : '') + state.toChg24.toFixed(2) + '% 24h';
      tChgEl.style.color = state.toChg24 >= 0 ? 'var(--green)' : 'var(--red)';
    }

    renderBadge(ratio);
    calcSwap();
  }

  /* ── Load historical ratio series ───────────────────────────── */
  async function loadHistory() {
    var f = state.fromCoin, t = state.toCoin, d = state.days;
    var ckey = f + '|' + t + '|' + d;
    var CACHE_TTL = 5 * 60 * 1000;

    var cached = state.histCache[ckey];
    if (cached && (Date.now() - cached.ts) < CACHE_TTL) {
      renderChart(cached.series);
      renderRange(cached.series);
      return;
    }

    status('Loading ' + (d === 1 ? '24h' : d + 'd') + ' chart…', '');
    setTfDisabled(true);

    try {
      var base  = 'https://api.coingecko.com/api/v3/coins/';
      var sfx   = '/market_chart?vs_currency=usd&days=' + d;

      /* Two sequential fetches with sleep to respect CG rate limits */
      var rawF = await apiFetch(base + f + sfx);
      var fp = rawF && rawF.prices;
      if (!fp) throw new Error(label(f) + ' chart data missing');

      await (typeof sleep === 'function' ? sleep(1200) : new Promise(function(r){ setTimeout(r,1200); }));

      var rawT = await apiFetch(base + t + sfx);
      var tp = rawT && rawT.prices;
      if (!tp) throw new Error(label(t) + ' chart data missing');

      var len = Math.min(fp.length, tp.length);
      var series = [];
      for (var i = 0; i < len; i++) {
        if (tp[i][1] > 0) series.push({ t: fp[i][0], r: fp[i][1] / tp[i][1] });
      }

      state.histCache[ckey] = { ts: Date.now(), series: series };
      state.series = series;

      renderChart(series);
      renderRange(series);
      status('Updated ' + new Date().toLocaleTimeString(), 'ok');
    } catch(e) {
      status('Chart error: ' + e.message, 'err');
    }
    setTfDisabled(false);
  }

  /* ── Main load ───────────────────────────────────────────────── */
  async function loadAll(clearCache) {
    if (state.loading) return;
    state.loading = true;
    if (clearCache) state.histCache = {};

    setSpin(true);
    status('Fetching prices…');
    updatePairLabels();

    try {
      await loadPrices();
      await (typeof sleep === 'function' ? sleep(800) : new Promise(function(r){ setTimeout(r,800); }));
      await loadHistory();
    } catch(e) {
      status('Error: ' + e.message, 'err');
    }
    setSpin(false);
    state.loading = false;
  }

  /* ══════════════════════════════════════════════════════════════
     RENDERING
  ══════════════════════════════════════════════════════════════ */

  /* ── Badge: how favorable is current ratio vs period? ───────── */
  function renderBadge(ratio) {
    if (!state.series || !state.series.length) return;
    var vals = state.series.map(function(p){ return p.r; });
    var sorted = vals.slice().sort(function(a,b){return a-b;});
    var pct = sorted.filter(function(v){return v<=ratio;}).length / sorted.length;

    var el = $('rt-badge');
    if (!el) return;
    if (pct >= 0.80)      { el.textContent='↑ Great time to swap';       el.style.background='rgba(0,189,142,0.12)'; el.style.color='var(--green)'; el.style.borderColor='rgba(0,189,142,0.25)'; }
    else if (pct >= 0.50) { el.textContent='◈ Decent — above average';   el.style.background='rgba(167,139,250,0.1)'; el.style.color='var(--pro)'; el.style.borderColor='rgba(167,139,250,0.25)'; }
    else if (pct >= 0.25) { el.textContent='◈ Below period average';     el.style.background='rgba(240,160,48,0.1)'; el.style.color='var(--amber)'; el.style.borderColor='rgba(240,160,48,0.25)'; }
    else                  { el.textContent='↓ Unfavorable — wait if possible'; el.style.background='rgba(240,62,88,0.1)'; el.style.color='var(--red)'; el.style.borderColor='rgba(240,62,88,0.25)'; }
  }

  /* ── Range bar ───────────────────────────────────────────────── */
  function renderRange(series) {
    if (!series || !series.length) return;
    var vals    = series.map(function(p){ return p.r; });
    var minR    = Math.min.apply(null, vals);
    var maxR    = Math.max.apply(null, vals);
    var nowR    = vals[vals.length - 1];
    var peakIdx = vals.indexOf(maxR);
    var peakDate = new Date(series[peakIdx].t);
    var startDate = new Date(series[0].t);
    var range   = maxR - minR || 1;

    set('rt-r-low',  minR.toFixed(2) + 'x');
    set('rt-r-peak', maxR.toFixed(2) + 'x');
    set('rt-r-now',  nowR.toFixed(2) + 'x');
    set('rt-peak-val', maxR.toFixed(2) + 'x');

    var nowPct  = Math.max(2, Math.min(98, (nowR - minR) / range * 100));
    var peakPct = peakIdx / Math.max(1, vals.length - 1) * 100;

    var fill    = $('rt-bar-fill');
    var marker  = $('rt-bar-marker');
    if (fill)   fill.style.width  = nowPct.toFixed(1) + '%';
    if (marker) marker.style.left = peakPct.toFixed(1) + '%';

    set('rt-bl-start', (startDate.getMonth()+1) + '/' + startDate.getDate());
    var ps = state.days === 1
      ? peakDate.getHours() + ':00'
      : (peakDate.getMonth()+1) + '/' + peakDate.getDate();
    set('rt-bl-peak', '▲ ' + ps);

    renderBadge(nowR);
  }

  /* ── Sparkline chart ─────────────────────────────────────────── */
  function renderChart(series) {
    var canvas = $('rt-spark');
    if (!canvas || !window.Chart) return;

    var labels = series.map(function(p) {
      var d = new Date(p.t);
      return state.days === 1
        ? d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0')
        : (d.getMonth()+1) + '/' + d.getDate();
    });
    var data = series.map(function(p){ return +p.r.toFixed(4); });

    if (state.chart) { state.chart.destroy(); state.chart = null; }

    var peakIdx = data.indexOf(Math.max.apply(null, data));

    state.chart = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          data: data,
          borderColor: 'var(--green)',
          borderWidth: 1.5,
          backgroundColor: 'rgba(0,189,142,0.07)',
          tension: 0.4,
          pointRadius: data.map(function(v,i){ return (i===peakIdx || i===data.length-1) ? 4 : 0; }),
          pointBackgroundColor: data.map(function(v,i){ return i===peakIdx ? '#f03e58' : 'var(--green)'; }),
          fill: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#141920',
            borderColor: 'rgba(255,255,255,0.1)',
            borderWidth: 1,
            titleColor: '#5a6e85',
            bodyColor: '#dce4f0',
            callbacks: {
              label: function(c){ return ' ' + c.parsed.y.toFixed(3) + '×'; }
            }
          }
        },
        scales: {
          x: {
            display: true,
            grid: { display: false },
            ticks: { font:{size:9}, color:'#5a6e85', maxTicksLimit: state.days===1 ? 6 : 10, maxRotation:0 }
          },
          y: {
            display: true,
            grid: { color: 'rgba(255,255,255,0.04)' },
            ticks: {
              font: { size: 9 }, color: '#5a6e85',
              callback: function(v){ return v.toFixed(1) + '×'; },
              maxTicksLimit: 4
            }
          }
        }
      }
    });
  }

  /* ── Swap calculator ─────────────────────────────────────────── */
  function calcSwap() {
    var amtEl  = $('rt-calc-amt');
    var ovFEl  = $('rt-calc-from-ov');
    var ovTEl  = $('rt-calc-to-ov');
    if (!amtEl) return;

    var amt = parseFloat(amtEl.value) || 0;
    var ovF = parseFloat(ovFEl ? ovFEl.value : '');
    var ovT = parseFloat(ovTEl ? ovTEl.value : '');
    var fp  = (!isNaN(ovF) && ovF > 0) ? ovF : state.fromPrice;
    var tp  = (!isNaN(ovT) && ovT > 0) ? ovT : state.toPrice;

    if (!fp || !tp || amt <= 0) return;

    var receive = amt * (fp / tp);
    var usdVal  = amt * fp;

    set('rt-calc-out',     receive.toLocaleString('en-US', {maximumFractionDigits: 2}) + ' ' + label(state.toCoin));
    set('rt-calc-usd-out', '$' + usdVal.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2}));
  }

  /* ── Timeframe switch ────────────────────────────────────────── */
  function setTF(days) {
    if (state.loading) return;
    state.days = days;
    [1,7,30].forEach(function(d){
      var btn = $('rt-tf-' + d);
      if (btn) btn.classList.toggle('active', d === days);
    });
    loadHistory();
  }

  /* ── UI helpers ──────────────────────────────────────────────── */
  function setSpin(on) {
    var icon = $('rt-spin-icon');
    var btn  = $('rt-refresh-btn');
    if (icon) icon.className = on ? 'spinning' : '';
    if (btn)  btn.disabled   = on;
  }

  function setTfDisabled(v) {
    [1,7,30].forEach(function(d){
      var btn = $('rt-tf-' + d);
      if (btn) btn.disabled = v;
    });
  }

  /* ── Coin selection change ───────────────────────────────────── */
  function onFromChange() {
    var sel = $('rt-from');
    if (!sel) return;
    state.fromCoin = sel.value;
    /* Rebuild TO list excluding new FROM */
    buildToDropdown(state.fromCoin);
    state.toCoin = $('rt-to').value;
    loadAll(true);
  }

  function onToChange() {
    var sel = $('rt-to');
    if (!sel) return;
    state.toCoin = sel.value;
    loadAll(true);
  }

  /* ── Public init ─────────────────────────────────────────────── */
  function init() {
    buildFromDropdown();
    buildToDropdown(state.fromCoin);
    updatePairLabels();
    loadAll(false);
  }

  /* ── Re-init when holdings change (called from holdings.js) ──── */
  function refresh() {
    /* Rebuild FROM dropdown in case holdings changed */
    var fromSel = $('rt-from');
    var prevFrom = fromSel ? fromSel.value : null;
    buildFromDropdown();
    if (prevFrom && FREE_COINS.indexOf(prevFrom) >= 0) {
      var fs = $('rt-from');
      if (fs) fs.value = prevFrom;
      state.fromCoin = prevFrom;
    }
    /* Rebuild TO excluding updated fromCoin */
    buildToDropdown(state.fromCoin);
    updatePairLabels();
  }

  /* ── Expose public API ───────────────────────────────────────── */
  return {
    init       : init,
    refresh    : refresh,
    setTF      : setTF,
    loadAll    : function(){ loadAll(true); },
    onFromChange: onFromChange,
    onToChange : onToChange,
    calcSwap   : calcSwap
  };

})();

/* ── Auto-init once DOM is ready ─────────────────────────────────── */
document.addEventListener('DOMContentLoaded', function() {
  /* Wait a tick so holdings.js has loaded its state first */
  setTimeout(function() { RatioTracker.init(); }, 100);
});
