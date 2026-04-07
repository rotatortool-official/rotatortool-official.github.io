/* ══════════════════════════════════════════════════════════════════
   signals.js  —  Investment opportunities, rotation/momentum signals,
                  leaderboard table & scoring engine
   
   HOW TO EDIT THIS FILE:
   ──────────────────────
   • CHANGE HOW MANY TILES SHOW:  Edit the .slice(0, 6) calls in
     renderTopBars() — change 6 to any number you want.
   
   • CHANGE ROTATION THRESHOLD:   In renderTopBars(), find:
       c.score >= 62   (sells — coins to rotate out of)
       c.score <= 38   (buys  — coins to rotate into)
     Adjust these numbers to make signals more or less strict.
   
   • CHANGE HIGH MOMENTUM THRESHOLD: Find c.score >= 60 in
     renderTopBars() and change the number.
   
   • CHANGE SCORING WEIGHTS:  Edit computeScores() below.
     L1 = momentum rank (base),  L2 = macro adjustment,
     L3 = tokenomics bonus/penalty.
══════════════════════════════════════════════════════════════════ */

/* ── Shared state ─────────────────────────────────────────────── */
var coins   = [];
var btcMA200 = null;
var btcPrice = null;
var sortTF   = 7;   /* default sort column: 7-day */

/* ── Format helpers ──────────────────────────────────────────── */
function fmtP(p) {
  if (p === null || p === undefined) return '—';
  if (p >= 1000) return '$' + p.toLocaleString('en-US', {maximumFractionDigits: 0});
  if (p >= 1)    return '$' + p.toFixed(2);
  if (p >= 0.01) return '$' + p.toFixed(4);
  return '$' + p.toFixed(6);
}
function pctSpan(v) {
  var c = v >= 0 ? 'pct up' : 'pct dn';
  /* Heat-map tint: opacity scales with magnitude, capped at 0.18 */
  var abs = Math.min(Math.abs(v), 50);
  var opacity = (abs / 50 * 0.16 + 0.02).toFixed(3);
  var heatColor = v >= 0 ? 'rgba(0,189,142,' + opacity + ')' : 'rgba(234,57,67,' + opacity + ')';
  return '<span class="pct-heat" style="background:' + heatColor + '"></span><span class="' + c + '">' + (v >= 0 ? '+' : '') + v.toFixed(2) + '%</span>';
}
/* ── BTC trend pill ──────────────────────────────────────────── */
var _bearDismissed = false;
try { _bearDismissed = localStorage.getItem('rot_bear_dismissed') === '1'; } catch(e) {}

function _showScaleBannerIfNeeded() {
  var scaleDismissed = false;
  try { scaleDismissed = localStorage.getItem('rot_scale_dismissed') === '1'; } catch(e) {}
  var sb = document.getElementById('scale-banner');
  if (sb && !scaleDismissed) sb.classList.add('show');
}

function renderBTC() {
  var pill    = document.getElementById('btc-pill');
  var pillTxt = document.getElementById('btc-pill-txt');
  var mobInner = document.getElementById('mob-btc-inner');
  var mobTxt   = document.getElementById('mob-btc-txt');
  if (!btcMA200 || !btcPrice) return;
  if (btcPrice > btcMA200) {
    if (pill)    pill.className = 'btc-pill bull';
    if (pillTxt) pillTxt.textContent = 'BTC UPTREND ▲';
    if (mobInner) mobInner.className = 'mob-btc-cell bull';
    if (mobTxt)   mobTxt.textContent = '▲ BTC';
    document.getElementById('bear-banner').classList.remove('show');
    _bearDismissed = false;
    try { localStorage.removeItem('rot_bear_dismissed'); } catch(e) {}
    /* No bear banner → show scale tip directly */
    _showScaleBannerIfNeeded();
  } else {
    if (pill)    pill.className = 'btc-pill bear';
    if (pillTxt) pillTxt.textContent = 'BTC DOWNTREND ▼';
    if (mobInner) mobInner.className = 'mob-btc-cell';
    if (mobTxt)   mobTxt.textContent = '▼ BTC';
    if (!_bearDismissed) {
      document.getElementById('bear-banner').classList.add('show');
    } else {
      /* Bear banner already dismissed → show scale tip */
      _showScaleBannerIfNeeded();
    }
  }
}

/* ══════════════════════════════════════════════════════════════
   INVESTMENT OPPORTUNITIES (top signal bar)
   Three columns: Rotation Opps | High Momentum | Worst 30D
══════════════════════════════════════════════════════════════ */

/* Single signal tile (momentum / worst) */
function sigTile(c, kind) {
  var badges = {rot:'ROT', mom:'MOM', wrst:'WORST'};
  var scC  = c.score >= 65 ? 'up' : c.score <= 35 ? 'dn' : 'am';

  /* Supply & sentiment */
  var circ = c.circulating_supply || 0;
  var maxS = c.max_supply || 0;
  var unlockPct = (circ && maxS > 0) ? Math.round((circ / maxS) * 100) : -1;
  var unlockStr = unlockPct >= 0 ? unlockPct + '%' : '∞';
  var sentScore = (c.p24 || 0) * 0.4 + (c.p7 || 0) * 0.6;
  var sentLabel = sentScore >= 0 ? 'BULL' : 'BEAR';
  var sentCls   = sentScore >= 0 ? 'up' : 'dn';

  /* Market cap formatted */
  var mcapStr = c.mcap ? (c.mcap >= 1e9 ? '$' + (c.mcap/1e9).toFixed(1) + 'B' : '$' + (c.mcap/1e6).toFixed(0) + 'M') : '—';

  return '<div class="sig-tile ' + kind + '" onclick="openTileDetail(\'' + c.id + '\',event)" title="Click for details">'
    + '<div class="sig-tile-top">'
      + '<div class="sig-tile-ico"><img src="' + c.image + '" alt="' + c.sym + ' logo" loading="lazy" width="20" height="20" onerror="this.style.display=\'none\'"></div>'
      + '<span class="sig-tile-sym">' + c.sym + '</span>'
      + '<span class="sig-tile-badge ' + kind + '">' + badges[kind] + '</span>'
    + '</div>'
    + '<div class="sig-tile-stats">'
      + '<div class="sig-stat"><span class="sig-stat-l">MCAP</span><span class="sig-stat-v am">' + mcapStr + '</span></div>'
      + '<div class="sig-stat"><span class="sig-stat-l">UNLOCK</span><span class="sig-stat-v am">' + unlockStr + '</span></div>'
      + '<div class="sig-stat"><span class="sig-stat-l">SENT</span><span class="sig-stat-v ' + sentCls + '">' + sentLabel + '</span></div>'
      + '<div class="sig-stat"><span class="sig-stat-l">SCR</span><span class="sig-stat-v '  + scC  + '">' + c.score + '</span></div>'
    + '</div>'
    + '</div>';
}

/* Rotation opportunity tile (sell→buy pair) */
function sigRotTile(sell, buy) {
  var delta = sell.score - buy.score;

  /* Buy-side sentiment */
  var buySent = (buy.p24 || 0) * 0.4 + (buy.p7 || 0) * 0.6;
  var buySentLabel = buySent >= 0 ? 'BULL' : 'BEAR';
  var buySentCls   = buySent >= 0 ? 'up' : 'dn';

  /* Buy-side unlock % */
  var bCirc = buy.circulating_supply || 0;
  var bMax  = buy.max_supply || 0;
  var bUnlock = (bCirc && bMax > 0) ? Math.round((bCirc / bMax) * 100) + '%' : '∞';

  return '<div class="sig-tile rot" onclick="openTileDetail(\'' + buy.id + '\',event)" title="Click for buy-side details">'
    + '<div class="sig-tile-top">'
      + '<div class="sig-tile-ico"><img src="' + sell.image + '" alt="' + sell.sym + ' logo" loading="lazy" width="20" height="20" onerror="this.style.display=\'none\'"></div>'
      + '<span class="sig-tile-sym" style="color:var(--red);">'   + sell.sym + '</span>'
      + '<span style="color:var(--muted);font-size:10px;">→</span>'
      + '<div class="sig-tile-ico"><img src="' + buy.image + '" alt="' + buy.sym + ' logo" loading="lazy" width="20" height="20" onerror="this.style.display=\'none\'"></div>'
      + '<span class="sig-tile-sym" style="color:var(--green);">' + buy.sym  + '</span>'
      + '<span class="sig-tile-badge rot">Δ' + delta + '</span>'
    + '</div>'
    + '<div class="sig-tile-stats">'
      + '<div class="sig-stat"><span class="sig-stat-l">BUY SENT</span><span class="sig-stat-v ' + buySentCls + '">' + buySentLabel + '</span></div>'
      + '<div class="sig-stat"><span class="sig-stat-l">UNLOCK</span><span class="sig-stat-v am">' + bUnlock + '</span></div>'
      + '<div class="sig-stat"><span class="sig-stat-l">SCR DELTA</span><span class="sig-stat-v am">' + sell.score + '→' + buy.score + '</span></div>'
    + '</div>'
    + '</div>';
}

/* Render all three signal columns */
function renderTopBars() {
  var hSyms = holdings.map(function(h) { return h.sym; });

  /* Helper: single ⚡ Pro unlock tile (one per column only) */
  function proUnlockTile(msg) {
    return '<div class="sig-tile pro-locked" onclick="openPro()" style="cursor:pointer;'
      + 'display:flex;flex-direction:column;align-items:center;justify-content:center;'
      + 'gap:6px;min-height:88px;opacity:.85;">'
      + '<span style="font-size:18px;">⚡</span>'
      + '<span style="font-size:9px;font-weight:700;letter-spacing:.1em;color:var(--pro);">PRO</span>'
      + '<span style="font-size:9px;color:var(--muted);text-align:center;line-height:1.4;">' + msg + '</span>'
      + '</div>';
  }

  /* Helper: empty placeholder tile — guides user to add holdings */
  function emptyPlaceholderTile() {
    return '<div class="sig-tile sig-tile-empty" onclick="document.getElementById(\'coin-sel\')&&document.getElementById(\'coin-sel\').focus()" title="Add holdings to get signals">'
      + '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:4px;opacity:.5;padding:6px;text-align:center;">'
      + '<span style="font-size:16px;color:var(--green);line-height:1;">+</span>'
      + '<span style="font-size:9px;letter-spacing:.04em;color:var(--muted);font-family:var(--font-ui);line-height:1.4;">Add holdings to receive signals</span>'
      + '</div></div>';
  }

  /* ── Column 3: Worst 30D — 2 free / 4 Pro ── */
  var worstAll = coins.slice().sort(function(a, b) { return a.p30 - b.p30; });
  var worstEl  = document.getElementById('worst-cards');
  if (isPro) {
    var worstTiles = worstAll.slice(0, 4).map(function(c) { return sigTile(c, 'wrst'); }).join('');
    for (var wp = worstAll.slice(0, 4).length; wp < 4; wp++) worstTiles += emptyPlaceholderTile();
    worstEl.innerHTML = '<div class="sig-tiles-grid">' + worstTiles + '</div>';
  } else {
    var w3 = worstAll.slice(0, 2).map(function(c) { return sigTile(c, 'wrst'); }).join('');
    var wLocked = proUnlockTile('2 more in Pro') + emptyPlaceholderTile();
    worstEl.innerHTML = '<div class="sig-tiles-grid">' + w3 + wLocked + '</div>';
  }

  /* ── Column 2: High Momentum — 1 free / 6 Pro ── */
  var momAll  = coins.slice().filter(function(c) { return c.score >= 60; })
                             .sort(function(a, b) { return b.score - a.score; });
  var momEl   = document.getElementById('mom-cards');
  if (isPro) {
    if (momAll.length) {
      var momTiles = momAll.slice(0, 4).map(function(c) { return sigTile(c, 'mom'); }).join('');
      for (var mp = momAll.slice(0, 4).length; mp < 4; mp++) momTiles += emptyPlaceholderTile();
      momEl.innerHTML = '<div class="sig-tiles-grid">' + momTiles + '</div>';
    } else {
      momEl.innerHTML = '<div class="no-sug">Scanning \u2014 no coins above momentum threshold right now.</div>';
    }
  } else {
    if (momAll.length) {
      var m1 = sigTile(momAll[0], 'mom');
      var mLocked = proUnlockTile('unlock 3 more') + emptyPlaceholderTile() + emptyPlaceholderTile();
      momEl.innerHTML = '<div class="sig-tiles-grid">' + m1 + mLocked + '</div>';
    } else {
      momEl.innerHTML = '<div class="no-sug">Scanning \u2014 no coins above momentum threshold right now.</div>';
    }
  }

  /* ── Column 1: Rotation Opportunities — 1 free (real, unblurred) / 5 blurred+locked Pro ── */
  var sugEl = document.getElementById('sug-cards');

  /* Compute real rotation pairs regardless of tier */
  var held  = coins.filter(function(c) { return hSyms.indexOf(c.sym) >= 0; });
  var sells = held.filter(function(c)  { return c.score >= 62; }).sort(function(a, b) { return b.score - a.score; });
  var buys  = coins.filter(function(c) { return hSyms.indexOf(c.sym) < 0 && c.score <= 38; }).sort(function(a, b) { return a.score - b.score; });

  /* Fallback pairs from all coins when no holdings exist (free preview) */
  var allSells = coins.slice().sort(function(a, b) { return b.score - a.score; });
  var allBuys  = coins.slice().sort(function(a, b) { return a.score - b.score; });

  if (!isPro) {
    /* Build up to 4 real pairs — from holdings if available, else from all coins */
    var previewSells = (sells.length && buys.length) ? sells : allSells;
    var previewBuys  = (sells.length && buys.length) ? buys  : allBuys;
    var previewPairs = [];
    for (var pi = 0; pi < Math.min(4, previewSells.length); pi++) {
      previewPairs.push({ sell: previewSells[pi], buy: previewBuys[pi % previewBuys.length] });
    }

    /* Helper: blurred tile with a centred lock overlay, clicking opens Pro modal */
    function blurLockedTile(sell, buy) {
      return '<div class="sig-rot-locked" onclick="openPro()" title="Unlock with Pro">'
        + '<div class="sig-rot-blur">' + sigRotTile(sell, buy) + '</div>'
        + '<div class="sig-rot-lock-overlay">'
        + '<span style="font-size:14px;">⚡</span>'
        + '<span style="font-size:9px;font-weight:700;letter-spacing:.09em;color:var(--pro);">PRO</span>'
        + '</div>'
        + '</div>';
    }

    var gridHtml = '';
    previewPairs.forEach(function(p, idx) {
      if (idx === 0) {
        /* First tile: real, fully visible, clickable for detail */
        gridHtml += sigRotTile(p.sell, p.buy);
      } else if (idx === 1) {
        /* Second tile: single Pro unlock tile */
        gridHtml += proUnlockTile('unlock pairs');
      } else {
        /* Remaining tiles: plain placeholders */
        gridHtml += emptyPlaceholderTile();
      }
    });

    /* Always pad to exactly 4 slots with plain placeholders */
    var filledCount = previewPairs.length;
    if (filledCount === 1) gridHtml += proUnlockTile('unlock pairs');
    for (var pad = Math.max(filledCount, 2); pad < 4; pad++) {
      gridHtml += emptyPlaceholderTile();
    }

    sugEl.innerHTML = '<div class="sig-tiles-grid">' + gridHtml + '</div>';
    return;
  }

  /* Pro: full rotation signals */
  if (!holdings.length) {
    var emptyGrid = '';
    for (var ep = 0; ep < 4; ep++) emptyGrid += emptyPlaceholderTile();
    sugEl.innerHTML = '<div class="sig-tiles-grid">' + emptyGrid + '</div>';
    return;
  }
  if (!sells.length) { sugEl.innerHTML = '<div class="no-sug">Monitoring \u2014 no holdings strongly outperforming yet.</div>'; return; }
  if (!buys.length)  { sugEl.innerHTML = '<div class="no-sug">Scanning \u2014 no clear rotation targets right now.</div>'; return; }
  var pairs = [];
  for (var i = 0; i < Math.min(4, sells.length); i++) pairs.push({sell: sells[i], buy: buys[i % buys.length]});
  var rotHtml = pairs.map(function(p) { return sigRotTile(p.sell, p.buy); }).join('');
  for (var rp = pairs.length; rp < 4; rp++) rotHtml += emptyPlaceholderTile();
  sugEl.innerHTML = '<div class="sig-tiles-grid">' + rotHtml + '</div>';
}

/* ══════════════════════════════════════════════════════════════
   INSIGHT ENGINE — 5-pillar forward-looking signals
   Only computed for holdings + watchlist coins to save resources.
   Attaches c.insight = { score, label, color, tooltip, signals }
══════════════════════════════════════════════════════════════ */
function computeInsights() {
  var btc = coins.find(function(c) { return c.id === 'bitcoin'; }) || { p24: 0, p7: 0, p14: 0 };
  var fg  = (window.fearGreed && typeof window.fearGreed.value === 'number')
              ? window.fearGreed.value : 50;
  var fgLabel = (window.fearGreed && window.fearGreed.label) || 'Neutral';

  /* Only compute for holdings + watchlist coins */
  var hSyms = holdings.map(function(h) { return h.sym; });
  var wSyms = (typeof watchlist !== 'undefined') ? watchlist : [];
  var targetSyms = hSyms.concat(wSyms.filter(function(s) { return hSyms.indexOf(s) < 0; }));

  coins.forEach(function(c) { delete c.insight; }); /* clear old */

  targetSyms.forEach(function(sym) {
    var c = coins.find(function(x) { return x.sym === sym; });
    if (!c) return;

    var signals = [];
    var pts     = 0;

    /* ── PILLAR 1: Momentum Reset (RSI proxy via rank + MACD proxy via p7 vs p14) ── */
    var rsiApprox = Math.round((1 - (c.r30 - 1) / Math.max(coins.length - 1, 1)) * 100);
    var macdUp   = c.p7 > c.p14;
    var macdDown = c.p7 < c.p14;

    if (rsiApprox < 35 && macdUp) {
      pts += 30;
      signals.push('RSI Oversold + MACD Rising');
    } else if (rsiApprox > 75 && macdDown) {
      pts -= 25;
      signals.push('RSI Overbought + MACD Falling');
    } else if (rsiApprox < 40) {
      pts += 15;
      signals.push('Low Momentum (Potential Reset)');
    } else if (rsiApprox > 70) {
      pts -= 12;
      signals.push('High Momentum (Watch for Reversal)');
    }

    /* ── PILLAR 2: Liquidity Trap (Volume / Market Cap) ── */
    var volMcap = (c.volume24 && c.mcap) ? c.volume24 / c.mcap : 0;
    var priceStable = Math.abs(c.p24) < 3;
    if (volMcap > 0.20 && priceStable) {
      pts += 25;
      signals.push('High Volume + Stable Price (Accumulation)');
    } else if (volMcap > 0.20) {
      pts += 12;
      signals.push('High Liquidity Interest');
    } else if (volMcap > 0.10) {
      pts += 6;
      signals.push('Moderate Volume Interest');
    } else if (volMcap < 0.02 && c.mcap > 5e8) {
      pts -= 8;
      signals.push('Low Liquidity (Large Cap)');
    }

    /* ── PILLAR 3: Dilution Shield (Supply Dynamics) ── */
    var circ = c.circulating_supply || 0;
    var maxS = c.max_supply || 0;
    var supplyRatio = (circ && maxS > 0) ? circ / maxS : -1;
    if (supplyRatio >= 0.85) {
      pts += 20;
      signals.push('Supply Cleared (' + Math.round(supplyRatio * 100) + '% Unlocked)');
    } else if (supplyRatio >= 0.50) {
      pts += 5;
    } else if (supplyRatio >= 0 && supplyRatio < 0.30) {
      pts -= 20;
      signals.push('High Dilution Risk (' + Math.round(supplyRatio * 100) + '% Unlocked)');
    }

    /* ── PILLAR 4: Contrarian Sentiment (Fear & Greed) ── */
    if (fg < 25) {
      pts += 25;
      signals.push('Extreme Fear (' + fg + ') — Contrarian Buy');
    } else if (fg < 40) {
      pts += 12;
      signals.push('Fear Zone (' + fg + ')');
    } else if (fg > 80) {
      pts -= 20;
      signals.push('Extreme Greed (' + fg + ') — Caution');
    } else if (fg > 65) {
      pts -= 8;
      signals.push('Greed Zone (' + fg + ')');
    }

    /* ── PILLAR 5: Relative Strength vs BTC ── */
    var btcP24 = btc.p24 || 0;
    var relStr = c.p24 - btcP24;
    if (btcP24 < -1 && c.p24 > 0) {
      pts += 28;
      signals.push('Hidden Strength vs BTC (' + (relStr >= 0 ? '+' : '') + relStr.toFixed(1) + '%)');
    } else if (relStr > 5) {
      pts += 15;
      signals.push('Outperforming BTC (+' + relStr.toFixed(1) + '%)');
    } else if (relStr < -5) {
      pts -= 15;
      signals.push('Underperforming BTC (' + relStr.toFixed(1) + '%)');
    }

    /* ── Normalise to 0–100 ── */
    var raw        = Math.min(128, Math.max(-88, pts));
    var normalised = Math.round(((raw + 88) / 216) * 100);

    /* ── Label & colour ── */
    var label, color;
    if      (normalised >= 65) { label = 'BUY';     color = 'insight-buy';  }
    else if (normalised <= 35) { label = 'WARN';    color = 'insight-warn'; }
    else                       { label = 'NEUTRAL'; color = 'insight-neut'; }

    /* ── Tooltip text ── */
    var tooltip = signals.length
      ? signals.join(' · ')
      : 'No strong signals — monitoring';
    tooltip += ' | F&G: ' + fg + ' (' + fgLabel + ')';

    c.insight = { score: normalised, label: label, color: color, tooltip: tooltip, signals: signals };
  });
}

/* ── Toggle watchlist from the leaderboard eye icon ────────── */
function toggleWatch(sym, btn) {
  if (typeof watchlist === 'undefined') return;
  var idx = watchlist.indexOf(sym);
  if (idx >= 0) {
    watchlist.splice(idx, 1);
    if (btn) { btn.classList.remove('watching'); btn.title = 'Add to watchlist'; }
  } else {
    watchlist.push(sym);
    if (btn) { btn.classList.add('watching'); btn.title = 'Watching'; }
  }
  if (typeof saveWatchlist === 'function') saveWatchlist();
  if (typeof renderWatchlist === 'function') renderWatchlist();
}

/* ══════════════════════════════════════════════════════════════
   LEADERBOARD TABLE
══════════════════════════════════════════════════════════════ */
/* ── Free vs Pro categories ──────────────────────────────────── */
var FREE_CATEGORIES = ['all', 'l1', 'defi', 'meme', 'demo'];

function initCategoryLocks() {
  document.querySelectorAll('.cat-tab').forEach(function(el) {
    var cat = el.dataset.cat;
    /* Hide DEMO tab for Pro users — it's for new/free users only */
    if (cat === 'demo') {
      el.style.display = isPro ? 'none' : '';
      return;
    }
    if (!isPro && FREE_CATEGORIES.indexOf(cat) < 0) {
      el.classList.add('pro-locked');
      if (!el.querySelector('.pro-lock-ico')) {
        el.innerHTML += '<span class="pro-lock-ico">🔒</span>';
      }
    } else {
      el.classList.remove('pro-locked');
      var lock = el.querySelector('.pro-lock-ico');
      if (lock) lock.remove();
    }
  });
}

/* ── Category switching (lazy load) ───────────────────────────── */
async function switchCategory(cat) {
  if (cat === activeCategory) return;
  /* Block locked categories for free users */
  if (!isPro && FREE_CATEGORIES.indexOf(cat) < 0) {
    openPro();
    return;
  }
  activeCategory = cat;
  /* Update tab UI */
  document.querySelectorAll('.cat-tab').forEach(function(el) {
    el.classList.toggle('active', el.dataset.cat === cat);
  });
  /* If category not loaded yet, fetch it */
  if (cat !== 'all' && !_loadedCategories[cat]) {
    /* Show skeleton while loading */
    var tbody = document.getElementById('tbody');
    if (tbody) {
      var skRows = '';
      for (var s = 0; s < 8; s++) {
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
    await loadCoins(cat);
    computeScores();
    window.coins = coins;
  } else if (cat === 'all' && !_loadedCategories['all']) {
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
    await loadCoins('all');
    computeScores();
    window.coins = coins;
  }
  renderTable();
  renderCoinSel();
}

function renderTable() {
  var body = document.getElementById('tbody');
  if (!coins.length) return;

  /* Filter by active category */
  var DEMO_IDS = ['bitcoin','ethereum','binancecoin','solana','cardano','ripple','polkadot','avalanche-2','chainlink','dogecoin'];
  var catCoins;
  if (activeCategory === 'demo') {
    catCoins = coins.filter(function(c) { return DEMO_IDS.indexOf(c.id) >= 0; });
  } else if (activeCategory === 'all') {
    catCoins = coins.slice();
  } else {
    catCoins = coins.filter(function(c) { return (COIN_CATEGORIES[c.id] || 'other') === activeCategory; });
  }

  var sorted = catCoins.sort(function(a, b) {
    if (sortTF === 0)  return b.score - a.score;
    if (sortTF === 24) return b.p24 - a.p24;
    if (sortTF === 7)  return b.p7  - a.p7;
    if (sortTF === 14) return b.p14 - a.p14;
    return b.p30 - a.p30;
  });
  var hSyms    = holdings.map(function(h) { return h.sym; });
  var freeCoins = sorted.filter(function(c) { return !c.isPro; });
  var proCoins  = sorted.filter(function(c) { return  c.isPro; });
  var toRender  = isPro ? sorted : freeCoins;

  var html = toRender.map(function(c, i) {
    var isH    = hSyms.indexOf(c.sym) >= 0;
    var sc     = c.score;
    var scC    = sc >= 65 ? 'var(--green)' : sc < 0 ? 'var(--red)' : sc >= 40 ? 'var(--amber)' : 'var(--muted)';
    var mcapStr = c.mcap ? '$' + (c.mcap/1e9 >= 1 ? (c.mcap/1e9).toFixed(2) + 'B' : (c.mcap/1e6).toFixed(0) + 'M') : '—';
    var circSup = c.circulating_supply || 0;
    var maxSup  = c.max_supply || 0;
    var unlockPct = (circSup && maxSup && maxSup > 0) ? Math.round((circSup / maxSup) * 100) : -1;
    var tipData = 'data-sym="' + c.sym + '" data-name="' + c.name + '" data-mcap="' + mcapStr + '" data-score="' + sc + '" data-p24="' + c.p24.toFixed(2) + '" data-p7="' + c.p7.toFixed(2) + '" data-p30="' + c.p30.toFixed(2) + '" data-held="' + (isH ? '1' : '0') + '" data-circ="' + circSup + '" data-maxsup="' + maxSup + '" data-unlock="' + unlockPct + '"';
    var isW = (typeof watchlist !== 'undefined') && watchlist.indexOf(c.sym) >= 0;
    var eyeSvg = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
    var qaBtnHtml = isH
      ? '<button class="qa-btn held" title="In holdings" onclick="event.stopPropagation()">✓</button>'
      : '<button class="qa-btn watch-eye' + (isW ? ' watching' : '') + '" title="' + (isW ? 'Watching' : 'Add to watchlist') + '" onclick="event.stopPropagation();toggleWatch(\'' + c.sym + '\',this)">' + eyeSvg + '</button>';

    /* ── Stablecoin APR display ── */
    var stableTag = '';
    var col24, col7, col14, col30, colScore;
    if (c.isStable) {
      stableTag = '<span class="htag" style="background:#2a6e4e;color:#8dffc0;margin-left:4px;">STABLE</span>';
      var aprStr = '<span style="color:#8dffc0;font-size:11px;" title="Estimated DeFi lending/staking APR on ' + c.aprPlatform + '">' + c.apr.toFixed(1) + '% <span style="font-size:8px;opacity:.7;">APR</span></span>';
      col24  = '<td class="pc">' + aprStr + '</td>';
      col7   = '<td class="pc" style="text-align:center;"><span style="color:var(--muted);font-size:9px;" title="' + c.aprPlatform + '">' + c.aprPlatform.split(' / ')[0] + '</span></td>';
      col14  = '<td class="pc" style="text-align:center;"><span style="color:var(--muted);font-size:9px;">~$1.00</span></td>';
      col30  = '<td class="pc" style="text-align:center;"><span style="color:var(--muted);font-size:9px;">PEG</span></td>';
      colScore = '<td class="r"><div class="sw"><span class="sv" style="color:#8dffc0;">YIELD</span></div></td>';
    } else {
      col24  = '<td class="pc">' + pctSpan(c.p24) + '</td>';
      col7   = '<td class="pc">' + pctSpan(c.p7)  + '</td>';
      col14  = '<td class="pc">' + pctSpan(c.p14) + '</td>';
      col30  = '<td class="pc">' + pctSpan(c.p30) + '</td>';
      colScore = '<td class="r"><div class="sw"><span class="sv" style="color:' + scC + ';">' + sc + '</span><div class="sb"><div class="sbf" style="width:' + Math.max(2, sc) + '%;background:' + scC + ';"></div></div></div></td>';
    }

    return '<tr class="' + (isH ? 'held' : '') + (c.isStable ? ' stable-row' : '') + '" ' + tipData + ' onmouseenter="showRowTip(this,event)" onmouseleave="hideTip()" onclick="openTileDetail(\'' + c.id + '\',event)">'
      + '<td class="qa-cell">' + qaBtnHtml + '</td>'
      + '<td style="color:var(--muted);font-size:10px;">' + (i+1) + '</td>'
      + '<td><div class="cc"><div class="ti"><img src="' + c.image + '" alt="' + c.sym + ' logo" loading="lazy" width="18" height="18" onerror="this.style.display=\'none\'"></div><div><div style="display:flex;align-items:center;"><span class="tsym">' + c.sym + '</span>' + (isH ? '<span class="htag">HELD</span>' : '') + stableTag + '</div><div class="tname">' + (c.name.length > 17 ? c.name.slice(0,15) + '…' : c.name) + '</div></div></div></td>'
      + '<td class="r price-col">' + fmtP(c.price) + '</td>'
      + col24 + col7 + col14 + col30 + colScore
      + '</tr>';
  }).join('');

  if (!isPro && proCoins.length) {
    html += '<tr class="pro-upsell-row"><td colspan="9"><div class="pro-upsell-banner">'
      + '<div class="pub-left"><span class="pub-icon">⚡</span><div><div class="pub-txt">+' + proCoins.length + ' more coins available in Pro</div><div class="pub-sub">Share your link with 3 friends to unlock — completely free</div></div></div>'
      + '<button class="pub-btn" onclick="openPro()">UNLOCK PRO →</button>'
      + '</div></td></tr>';
  }
  body.innerHTML = html;
}

function renderCoinSel() {
  var sel   = document.getElementById('coin-sel');
  var hSyms = holdings.map(function(h) { return h.sym; });
  sel.innerHTML = '<option value="">Select…</option>'
    + coins.map(function(c) {
      var held = hSyms.indexOf(c.sym) >= 0;
      return '<option value="' + c.sym + '"' + (held ? ' disabled' : '') + '>'
        + (held ? '✓ ' : '') + c.sym + ' — ' + c.name + '</option>';
    }).join('');
}

/* Sort column click */
function setSort(tf) {
  sortTF = tf;
  ['24','7','14','30','score'].forEach(function(k) {
    var th = document.getElementById('th-' + k);
    if (th) th.classList.toggle('sorted', (tf === 0 && k === 'score') || (tf > 0 && String(tf) === k));
  });
  renderTable();
}

/* Master render — call this after any data change */
function renderAll() {
  computeInsights();
  renderBTC(); renderTiles(); renderTopBars(); renderTable(); renderCoinSel(); updateTierBadge(); if (typeof initCategoryLocks === 'function') initCategoryLocks(); if (typeof updateProGates === 'function') updateProGates();
  var now      = new Date();
  var coinsUrl = 'https://api.coingecko.com/api/v3/coins/markets';
  var info     = getCacheInfo(coinsUrl);
  var suffix   = '';
  if (info && info.fresh && info.age > 30000) {
    var ageMins = Math.floor(info.age / 60000);
    var ageSecs = Math.floor((info.age % 60000) / 1000);
    var remMins = Math.floor(info.remaining / 60000);
    suffix = ' · cached ' + (ageMins > 0 ? ageMins + 'm ' : '') + ageSecs + 's ago'
      + (remMins > 0 ? ' · ↻ in ~' + remMins + 'm' : '');
  }
  renderDonationBar('sidebar-goal-left');
  document.getElementById('ts').textContent = 'UPDATED ' + now.toLocaleTimeString('en-US', {hour:'2-digit', minute:'2-digit', second:'2-digit'}) + suffix;
  /* Sync three-panel vertical alignment after every render */
  requestAnimationFrame(function() {
    if (typeof syncPanelAlignment === 'function') syncPanelAlignment();
  });
}
