/* ══════════════════════════════════════════════════════════════════
   holdings.js  —  Holdings panels + Portfolio Signal for all 3 modes
   
   HOW TO EDIT THIS FILE:
   ──────────────────────
   • CHANGE HOW TILES LOOK:     Edit renderTiles() / renderFxTiles() /
                                 renderStHoldings()
   • CHANGE PORTFOLIO SIGNAL:   Edit renderSignal() (crypto),
                                 renderFxTiles() signal block (forex),
                                 renderStHoldings() signal block (stocks)
   • ADD/REMOVE TILE FIELDS:    Find the html+= block inside each
                                 render function and add/remove lines
══════════════════════════════════════════════════════════════════ */

/* ── State ───────────────────────────────────────────────────── */
var holdings   = loadH();
var fxHoldings = loadFxH();
var stHoldings = loadStH();
var sparkStop  = {};

/* ── Crypto holdings persistence ─────────────────────────────── */
function loadH()  { try { return JSON.parse(localStorage.getItem('rot_h5') || '[]'); } catch(e) { return []; } }
function saveH()  { try { localStorage.setItem('rot_h5', JSON.stringify(holdings)); } catch(e) {} }

/* ── Forex holdings persistence ──────────────────────────────── */
function loadFxH() { try { return JSON.parse(localStorage.getItem('rot_fx_h') || '[]'); } catch(e) { return []; } }
function saveFxH() { try { localStorage.setItem('rot_fx_h', JSON.stringify(fxHoldings)); } catch(e) {} }

/* ── Stocks holdings persistence ─────────────────────────────── */
function loadStH() { try { return JSON.parse(localStorage.getItem('rot_st_h') || '[]'); } catch(e) { return []; } }
function saveStH() { try { localStorage.setItem('rot_st_h', JSON.stringify(stHoldings)); } catch(e) {} }

/* ════════════════════════════════
   CRYPTO HOLDINGS
════════════════════════════════ */
/* ── Holdings limits: 2 free / 10 Pro ── */
var FREE_HOLDINGS_LIMIT = 2;
var PRO_HOLDINGS_LIMIT  = 10;

function addHolding() {
  var sym = document.getElementById('coin-sel').value;
  var qty = parseFloat(document.getElementById('inp-qty').value) || null;
  var avg = parseFloat(document.getElementById('inp-avg').value) || null;
  if (!sym) return;
  var isFirst = holdings.length === 0;
  var idx = holdings.findIndex(function(h) { return h.sym === sym; });
  /* Check limit only for new entries (not updates to existing) */
  if (idx < 0) {
    var limit = isPro ? PRO_HOLDINGS_LIMIT : FREE_HOLDINGS_LIMIT;
    if (holdings.length >= limit) {
      if (!isPro) {
        openPro();  /* show Pro modal */
      } else {
        alert('Portfolio limit reached (' + PRO_HOLDINGS_LIMIT + ' assets).');
      }
      return;
    }
  }
  if (idx >= 0) holdings[idx] = {sym, qty, avg};
  else holdings.push({sym, qty, avg});
  saveH();
  if (isFirst) creditReferrer();
  document.getElementById('coin-sel').value  = '';
  document.getElementById('inp-qty').value   = '';
  document.getElementById('inp-avg').value   = '';
  renderAll();
}

function removeHolding(sym) {
  if (sparkStop[sym]) { sparkStop[sym](); delete sparkStop[sym]; }
  holdings = holdings.filter(function(h) { return h.sym !== sym; });
  saveH(); renderAll();
}

/* Enter key on qty/avg inputs triggers add */
['inp-qty', 'inp-avg'].forEach(function(id) {
  document.getElementById(id).addEventListener('keydown', function(e) { if (e.key === 'Enter') addHolding(); });
});

/* ── Crypto tile renderer — always shows 10 slots ───────────── */
var TOTAL_TILE_SLOTS = 10;
var PRO_PROMO_SLOTS  = 2;

function renderTiles() {
  Object.keys(sparkStop).forEach(function(k) { sparkStop[k](); delete sparkStop[k]; });
  var grid  = document.getElementById('tiles-grid');
  var hcEl  = document.getElementById('hcount');
  var limit = isPro ? PRO_HOLDINGS_LIMIT : FREE_HOLDINGS_LIMIT;
  if (hcEl) hcEl.textContent = holdings.length ? holdings.length + '/' + limit : '';

  var heldCoins = holdings.map(function(h) { return coins.find(function(c) { return c.sym === h.sym; }); }).filter(Boolean);
  var topG = null;
  if (isPro) heldCoins.forEach(function(c) { if (!topG || c.p24 > topG.p24) topG = c; });

  var html = '';

  /* ── Real holding tiles ── */
  holdings.forEach(function(h) {
    var c = coins.find(function(x) { return x.sym === h.sym; });
    if (!c) {
      html += '<div class="tile"><div class="tile-top"><span class="tile-sym">' + h.sym + '</span>'
            + '<button class="tile-rm" onclick="removeHolding(\'' + h.sym + '\')">×</button></div>'
            + '<div style="font-size:10px;color:var(--muted);">Unavailable</div></div>';
      return;
    }
    var pl = '', plC = '';
    if (h.qty && h.avg) {
      var profit = (c.price - h.avg) * h.qty;
      var plPct  = ((c.price - h.avg) / h.avg * 100);
      plC = profit >= 0 ? 'up' : 'dn';
      pl  = (profit >= 0 ? '+' : '-') + '$' + Math.abs(profit).toLocaleString('en-US', {maximumFractionDigits:0})
          + ' (' + (plPct >= 0 ? '+' : '') + plPct.toFixed(1) + '%)';
    }
    var glw  = c.score >= 65 ? 'glow-g' : c.score >= 40 ? 'glow-a' : 'glow-r';
    var scrC = c.score >= 65 ? 'hi'     : c.score >= 40 ? 'md'     : 'lo';
    var isTop = topG && c.sym === topG.sym && c.p24 > 0;
    html += '<div class="tile ' + glw + '" id="tile-' + c.sym + '" onclick="openTileDetail(\'' + c.id + '\',event)" style="cursor:pointer;" title="Click for full breakdown">'
          + (isTop ? '<canvas class="sp" id="sp-' + c.sym + '"></canvas>' : '')
          + '<div class="tile-top"><div class="tile-ico"><img src="' + c.image + '" alt="' + c.sym + ' logo" loading="lazy" width="16" height="16" onerror="this.style.display=\'none\'"></div>'
          + '<span class="tile-sym">' + c.sym + '</span>'
          + '<button class="tile-rm" onclick="event.stopPropagation();removeHolding(\'' + h.sym + '\')">×</button></div>'
          + '<div class="tile-price">' + fmtP(c.price) + '</div>'
          + '<div class="tile-perfs">'
            + '<div class="tpf"><span class="tpf-l">24H</span><span class="tpf-v ' + (c.p24>=0?'up':'dn') + '">' + (c.p24>=0?'+':'') + c.p24.toFixed(1) + '%</span></div>'
            + '<div class="tpf"><span class="tpf-l">7D</span><span class="tpf-v '  + (c.p7>=0?'up':'dn')  + '">' + (c.p7>=0?'+':'')  + c.p7.toFixed(1)  + '%</span></div>'
            + '<div class="tpf"><span class="tpf-l">30D</span><span class="tpf-v ' + (c.p30>=0?'up':'dn') + '">' + (c.p30>=0?'+':'') + c.p30.toFixed(1) + '%</span></div>'
          + '</div>'
          + '<div class="tile-foot">' + (pl ? '<span class="tile-pl ' + plC + '">' + pl + '</span>' : '<span></span>')
          + '<span class="tile-scr ' + scrC + '">' + c.score + '</span></div>'
          + '</div>';
  });

  /* ── Fillable empty slots (green +) ── */
  var filledCount   = holdings.length;
  var fillableLimit = isPro ? TOTAL_TILE_SLOTS : FREE_HOLDINGS_LIMIT;
  for (var i = filledCount; i < fillableLimit; i++) {
    html += '<div class="tile-placeholder" onclick="openAddHoldingsModal()">'
          + '<div class="ph-plus">+</div><div class="ph-lbl">Add Coin</div></div>';
  }

  if (!isPro) {
    /* ── Locked green + slots ── */
    var lockedCount = TOTAL_TILE_SLOTS - PRO_PROMO_SLOTS - FREE_HOLDINGS_LIMIT;
    for (var j = 0; j < lockedCount; j++) {
      html += '<div class="tile-placeholder tile-placeholder-locked" onclick="openPro()" title="Unlock with Pro">'
            + '<div class="ph-plus">+</div><div class="ph-lbl">Pro</div></div>';
    }
    /* ── Purple Pro promo tiles (last 2) ── */
    for (var k = 0; k < PRO_PROMO_SLOTS; k++) {
      html += '<div class="tile-pro-promo" onclick="openPro()">'
            + '<div class="pro-promo-thunder">⚡</div>'
            + '<div class="pro-promo-title">Monitor Multiple<br>Assets at Once</div>'
            + '<div class="pro-promo-sub">Up to 10 with Pro</div>'
            + '</div>';
    }
  } else {
    /* Pro: all remaining slots are green + */
    for (var m = fillableLimit; m < TOTAL_TILE_SLOTS; m++) {
      html += '<div class="tile-placeholder" onclick="openAddHoldingsModal()">'
            + '<div class="ph-plus">+</div><div class="ph-lbl">Add Coin</div></div>';
    }
  }

  grid.innerHTML = html;

  if (topG && topG.p24 > 0) {
    requestAnimationFrame(function() { requestAnimationFrame(function() {
      var cv = document.getElementById('sp-' + topG.sym);
      if (cv) sparkStop[topG.sym] = startSparkle(cv);
    }); });
  }
  renderSignal(heldCoins);
  if (typeof RatioTracker !== 'undefined') RatioTracker.refresh();
}


/* ── Crypto portfolio signal ─────────────────────────────────── */
function renderSignal(hc) {
  var el = document.getElementById('sig-content');
  if (!hc || !hc.length) {
    el.innerHTML = '<div style="font-size:11px;color:var(--muted);">Add holdings to see signal.</div>';
    return;
  }
  var avg      = hc.reduce(function(s, c) { return s + c.score; }, 0) / hc.length;
  var avgColor = avg >= 65 ? 'var(--green)' : avg >= 45 ? 'var(--amber)' : 'var(--red)';
  var over     = hc.filter(function(c) { return c.score >= 62; });
  var under    = hc.filter(function(c) { return c.score <= 38; });

  /* Headline status */
  var statusTxt, statusCol;
  if (!over.length && !under.length) { statusTxt = '✓ BALANCED';         statusCol = 'var(--green)'; }
  else if (over.length && under.length) { statusTxt = '⚡ MIXED SIGNALS'; statusCol = 'var(--amber)'; }
  else if (over.length)                 { statusTxt = '↑ ROTATE OUT';     statusCol = 'var(--amber)'; }
  else                                  { statusTxt = '↓ LAGGING — WATCH'; statusCol = 'var(--red)';  }

  var h = '<div class="sig-avg" style="color:' + avgColor + ';">'
        + avg.toFixed(0)
        + '<span class="sig-avg-lbl">/ 100 avg score</span></div>'
        + '<div class="sig-row-head" style="color:' + statusCol + ';">' + statusTxt + '</div>';

  /* Show EVERY holding with its individual status */
  hc.forEach(function(coin) {
    var cls, label, color;
    if (coin.score >= 62)      { cls = 'sell'; label = 'outperforming'; color = 'var(--amber)'; }
    else if (coin.score <= 38) { cls = 'buy';  label = 'lagging';       color = 'var(--red)';   }
    else                       { cls = 'ok';   label = 'balanced';      color = 'var(--green)'; }
    h += '<div class="sig-coin-row ' + cls + '">'
       + '<span class="scr-sym">' + coin.sym + '</span>'
       + '<span class="scr-val" style="color:' + color + ';">' + coin.score + ' / ' + label + '</span>'
       + '</div>';
  });

  /* DYOR warning only if any are lagging */
  if (under.length) {
    h += '<div style="margin-top:6px;padding:5px 8px;background:rgba(255,69,96,.06);border:1px solid rgba(255,69,96,.2);border-radius:3px;font-size:9px;color:var(--muted);line-height:1.6;">'
       + '<span style="color:var(--red);font-weight:600;">⚠ DYOR:</span> A coin performing badly for months will not automatically recover because you bought it. Research before rotating capital. '
       + '<span style="color:var(--red);">Rotator is not responsible for your investment decisions.</span>'
       + '</div>';
  }
  el.innerHTML = h;
}

/* ════════════════════════════════
   FOREX HOLDINGS
════════════════════════════════ */
function addForexHolding() {
  var pair  = document.getElementById('fx-sel').value;
  var qty   = parseFloat(document.getElementById('fx-qty').value) || null;
  var entry = parseFloat(document.getElementById('fx-entry').value) || null;
  if (!pair) return;
  var idx = fxHoldings.findIndex(function(h) { return h.pair === pair; });
  if (idx >= 0) fxHoldings[idx] = {pair, qty, entry};
  else fxHoldings.push({pair, qty, entry});
  saveFxH();
  document.getElementById('fx-sel').value   = '';
  document.getElementById('fx-qty').value   = '';
  document.getElementById('fx-entry').value = '';
  renderFxTiles(); renderForexTable();
}

function removeFxHolding(pair) {
  fxHoldings = fxHoldings.filter(function(h) { return h.pair !== pair; });
  saveFxH(); renderFxTiles(); renderForexTable();
}

function renderFxTiles() {
  var grid  = document.getElementById('fx-tiles-grid');
  var sigEl = document.getElementById('fx-sig-content');
  var fxHcEl = document.getElementById('fx-hcount');
  if (fxHcEl) fxHcEl.textContent = fxHoldings.length ? fxHoldings.length + (fxHoldings.length === 1 ? ' pair' : ' pairs') : '';

  if (!fxHoldings.length) {
    grid.innerHTML  = '<div class="empty-t">No forex pairs yet.<br>Add a pair above.</div>';
    sigEl.innerHTML = '<div style="font-size:11px;color:var(--muted);">Add pairs to see signal.</div>';
    return;
  }

  grid.innerHTML = fxHoldings.map(function(h) {
    var d      = forexData.find(function(f) { return f.from + '/' + f.to === h.pair; });
    var rate   = d ? d.rate : 0;
    var chgPct = d ? d.chgPct : 0;
    var score  = d ? d.score : 0;
    var signal = d ? d.signal : '—';
    var pl = '';
    if (h.qty && h.entry && rate) { var profit = (rate - h.entry) * h.qty; var plC = profit >= 0 ? 'up' : 'dn'; pl = '<div class="tile-pl ' + plC + '">' + (profit >= 0 ? '+' : '') + profit.toFixed(2) + ' pts</div>'; }
    var scC = score >= 65 ? 'hi' : score >= 45 ? 'md' : 'lo';
    var glw = score >= 65 ? 'glow-g' : score >= 45 ? 'glow-a' : 'glow-r';
    var p7d = d ? d.p7 : 0, p30d = d ? d.p30 : 0;
    return '<div class="tile ' + glw + '" onclick="openAssetDetail(\'forex\',\'' + h.pair + '\',event)" style="cursor:pointer;" title="Click for details">'
      + '<div class="tile-top"><span class="tile-sym" style="color:var(--bnb);">' + h.pair + '</span><button class="tile-rm" onclick="event.stopPropagation();removeFxHolding(\'' + h.pair + '\')">×</button></div>'
      + '<div class="tile-price">' + (rate ? rate.toFixed(5) : '—') + '</div>'
      + '<div class="tile-perfs">'
        + '<div class="tpf"><span class="tpf-l">DAY%</span><span class="tpf-v ' + (chgPct>=0?'up':'dn') + '">' + (chgPct>=0?'+':'') + chgPct.toFixed(3) + '%</span></div>'
        + '<div class="tpf"><span class="tpf-l">7D%</span><span  class="tpf-v ' + (p7d>=0?'up':'dn')   + '">' + (p7d>=0?'+':'')   + p7d.toFixed(2)   + '%</span></div>'
        + '<div class="tpf"><span class="tpf-l">30D%</span><span class="tpf-v ' + (p30d>=0?'up':'dn')  + '">' + (p30d>=0?'+':'')  + p30d.toFixed(2)  + '%</span></div>'
      + '</div>'
      + pl
      + '<div class="tile-foot"><span class="tile-pl ' + (score>=65?'up':score<=35?'dn':'fl') + '" style="font-size:9px;">' + signal + '</span><span class="tile-scr ' + scC + '">' + score + '</span></div>'
      + '</div>';
  }).join('');

  /* Forex signal summary */
  if (forexData.length) {
    var held = fxHoldings.map(function(h) { return forexData.find(function(f) { return f.from + '/' + f.to === h.pair; }); }).filter(Boolean);
    if (held.length) {
      var avg  = held.reduce(function(s, f) { return s + f.score; }, 0) / held.length;
      var avgC = avg >= 65 ? 'var(--green)' : avg >= 45 ? 'var(--amber)' : 'var(--red)';
      sigEl.innerHTML = '<div class="sig-avg" style="color:' + avgC + ';">' + avg.toFixed(0) + '<span class="sig-avg-lbl">/ 100 avg score</span></div>'
        + '<div style="font-size:11px;color:var(--muted);margin-top:4px;">Based on trend momentum, volatility position and RSI signal.</div>';
    }
  }
}

/* ════════════════════════════════
   STOCKS HOLDINGS
════════════════════════════════ */
function addStockHolding() {
  var sym = document.getElementById('st-sel').value;
  var qty = parseFloat(document.getElementById('st-qty').value) || null;
  var avg = parseFloat(document.getElementById('st-avg').value) || null;
  if (!sym) return;
  var idx = stHoldings.findIndex(function(h) { return h.sym === sym; });
  if (idx >= 0) stHoldings[idx] = {sym, qty, avg};
  else stHoldings.push({sym, qty, avg});
  saveStH();
  document.getElementById('st-sel').value = '';
  document.getElementById('st-qty').value = '';
  document.getElementById('st-avg').value = '';
  renderStHoldings();
}

function removeStHolding(sym) {
  stHoldings = stHoldings.filter(function(h) { return h.sym !== sym; });
  saveStH(); renderStHoldings();
}

function renderStHoldings() {
  var grid  = document.getElementById('st-tiles-grid');
  var sigEl = document.getElementById('st-sig-content');
  var stHcEl = document.getElementById('st-hcount');
  if (stHcEl) stHcEl.textContent = stHoldings.length ? stHoldings.length + (stHoldings.length === 1 ? ' stock' : ' stocks') : '';

  if (!stHoldings.length) {
    grid.innerHTML  = '<div class="empty-t">No stocks yet.<br>Add a stock above.</div>';
    sigEl.innerHTML = '<div style="font-size:11px;color:var(--muted);">Add stocks to see signal.</div>';
    return;
  }

  grid.innerHTML = stHoldings.map(function(h) {
    var d      = stocksData.find(function(s) { return s.sym === h.sym; });
    var price  = d ? d.price : 0;
    var chgPct = d ? d.chgPct : 0;
    var score  = d ? d.score : 0;
    var pl = '';
    if (h.qty && h.avg && price) { var profit = (price - h.avg) * h.qty; var plC = profit >= 0 ? 'up' : 'dn'; pl = '<div class="tile-pl ' + plC + '">' + (profit >= 0 ? '+' : '-') + '$' + Math.abs(profit).toLocaleString('en-US', {maximumFractionDigits:0}) + '</div>'; }
    var scC = score >= 65 ? 'hi' : score >= 45 ? 'md' : 'lo';
    var glw = score >= 65 ? 'glow-g' : score >= 45 ? 'glow-a' : 'glow-r';
    return '<div class="tile ' + glw + '" onclick="openAssetDetail(\'stock\',\'' + h.sym + '\',event)" style="cursor:pointer;" title="Click for details">'
      + '<div class="tile-top"><span class="tile-sym">' + h.sym + '</span><button class="tile-rm" onclick="event.stopPropagation();removeStHolding(\'' + h.sym + '\')">×</button></div>'
      + '<div class="tile-price">' + (price ? '$' + price.toFixed(2) : '—') + '</div>'
      + '<div class="tile-perfs">'
        + '<div class="tpf"><span class="tpf-l">TODAY</span><span class="tpf-v ' + (chgPct>=0?'up':'dn') + '">' + (chgPct>=0?'+':'') + chgPct.toFixed(2) + '%</span></div>'
        + '<div class="tpf"><span class="tpf-l">SCORE</span><span class="tpf-v ' + (score>=65?'up':score<=35?'dn':'fl') + '">' + score + '</span></div>'
      + '</div>'
      + pl
      + '<div class="tile-foot"><span></span><span class="tile-scr ' + scC + '">' + score + '</span></div>'
      + '</div>';
  }).join('');

  /* Stocks signal summary */
  if (stocksData.length) {
    var held = stHoldings.map(function(h) { return stocksData.find(function(s) { return s.sym === h.sym; }); }).filter(Boolean);
    if (held.length) {
      var avg  = held.reduce(function(s, d) { return s + d.score; }, 0) / held.length;
      var avgC = avg >= 65 ? 'var(--green)' : avg >= 45 ? 'var(--amber)' : 'var(--red)';
      sigEl.innerHTML = '<div class="sig-avg" style="color:' + avgC + ';">' + avg.toFixed(0) + '<span class="sig-avg-lbl">/ 100 avg score</span></div>'
        + '<div style="font-size:11px;color:var(--muted);margin-top:4px;">Based on 52-week range position and daily momentum.</div>';
    }
  }
}
