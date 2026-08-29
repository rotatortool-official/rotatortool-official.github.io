/* ══════════════════════════════════════════════════════════════════
   holdings.js  —  Holdings panel + Portfolio Signal

   Crypto and bStocks share ONE holdings model now — bStocks live in
   the same coins[] array as crypto (see loadBstocks() in
   data-loaders.js) and match by .sym exactly like any coin, so
   renderTiles()/addHolding()/removeHolding() below work unchanged
   for both. Separate fxHoldings/stHoldings arrays, and the FOREX/
   STOCKS holdings panels that used them, are removed — forex is
   dropped entirely, stock holdings are migrated into the unified
   `holdings` array on first load (see migrateStockHoldings() below)
   so existing users don't lose their saved positions.

   HOW TO EDIT THIS FILE:
   ──────────────────────
   • CHANGE HOW TILES LOOK:     Edit renderTiles()
   • CHANGE PORTFOLIO SIGNAL:   Edit renderSignal()
   • ADD/REMOVE TILE FIELDS:    Find the html+= block inside
                                 renderTiles() and add/remove lines
══════════════════════════════════════════════════════════════════ */

/* ── State ───────────────────────────────────────────────────── */
var holdings   = loadH();
var sparkStop  = {};

/* ── Crypto (+ bStock) holdings persistence ──────────────────── */
function loadH()  { try { return JSON.parse(localStorage.getItem('rot_h5') || '[]'); } catch(e) { return []; } }
function saveH()  { try { localStorage.setItem('rot_h5', JSON.stringify(holdings)); } catch(e) {} }

/* ── One-time migration: fold old stock holdings (rot_st_h) into the
   unified holdings array, then remove the old key. Old forex holdings
   (rot_fx_h) are simply dropped — forex was removed from the site, so
   there's nothing meaningful to migrate them onto. Symbols match
   directly (e.g. 'AAPL') since BSTOCK_LIST reuses the same tickers the
   old STOCKS_LIST used, so this is a straight carry-over, not a remap. */
(function migrateStockHoldings() {
  try {
    var raw = localStorage.getItem('rot_st_h');
    if (!raw) return;
    var oldStocks = JSON.parse(raw);
    /* Only migrate symbols that still exist as a real bStock — the old
       STOCKS_LIST included index ETF proxies (^GSPC, ^IXIC, ^DJI, etc.)
       that BSTOCK_LIST deliberately dropped (Binance has no index
       bStocks). Carrying those over verbatim leaves a holding tile that
       can never resolve to a coin — see pruneStaleHoldings() below for
       the belt-and-braces cleanup that also catches anyone who already
       migrated before this check existed. */
    var validSyms = (typeof BSTOCK_LIST !== 'undefined') ? BSTOCK_LIST.map(function(b) { return b.sym; }) : [];
    if (Array.isArray(oldStocks) && oldStocks.length) {
      oldStocks.forEach(function(h) {
        if (!h || !h.sym) return;
        if (validSyms.indexOf(h.sym) < 0) return; /* dropped ticker (e.g. an index) — skip */
        var exists = holdings.some(function(x) { return x.sym === h.sym; });
        if (!exists) holdings.push({sym: h.sym, qty: h.qty || null, avg: h.avg || null});
      });
      saveH();
    }
    localStorage.removeItem('rot_st_h');
    localStorage.removeItem('rot_fx_h'); /* cleanup only — forex not migrated */
  } catch (e) { console.warn('[migrateStockHoldings] skipped:', e.message); }
})();

/* ── Belt-and-braces cleanup: drop any holding whose symbol no longer
   resolves to a real coin. Catches:
   • Users who already ran the OLD migrateStockHoldings() before the
     BSTOCK_LIST check above existed (e.g. an already-saved '^GSPC'
     holding from before this fix — that ticker will never appear in
     coins[] since Binance has no index bStocks).
   • Any coin/bStock that gets delisted from FREE_COINS/BSTOCK_LIST
     in the future — general robustness, not just this migration.
   Called from doLoad() in data-loaders.js once coins[] (crypto +
   bStocks) is fully populated — calling it any earlier would wrongly
   prune everything, since coins[] starts empty. */
function pruneStaleHoldings() {
  if (!Array.isArray(coins) || !coins.length) return; /* not populated yet — don't prune blind */
  var validSyms = coins.map(function(c) { return c.sym; });
  var before = holdings.length;
  holdings = holdings.filter(function(h) { return validSyms.indexOf(h.sym) >= 0; });
  if (holdings.length !== before) {
    console.info('[pruneStaleHoldings] removed ' + (before - holdings.length) + ' holding(s) with no matching coin (e.g. a dropped index ticker)');
    saveH();
  }
}


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
            + '<div style="font-size:12px;color:var(--muted);">Unavailable</div></div>';
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
          + (c.insight ? '<div class="tile-insight"><div class="insight-pulse ' + c.insight.color + '" data-tip="' + c.insight.tooltip.replace(/"/g, '&quot;') + '" title="' + c.insight.tooltip.replace(/"/g, '&quot;') + '"><span class="insight-dot"></span><span class="insight-lbl">' + c.insight.label + '</span><span class="insight-score">' + c.insight.score + '</span></div></div>' : '')
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
      html += '<div class="tile-placeholder tile-placeholder-locked" onclick="openPro()" title="Support & Unlock">'
            + '<div class="ph-plus">+</div><div class="ph-lbl">☕</div></div>';
    }
    /* ── Purple Pro promo tiles (last 2) ── */
    for (var k = 0; k < PRO_PROMO_SLOTS; k++) {
      html += '<div class="tile-pro-promo" onclick="openPro()">'
            + '<div class="pro-promo-thunder">☕</div>'
            + '<div class="pro-promo-title">Monitor Multiple<br>Assets at Once</div>'
            + '<div class="pro-promo-sub">Up to 10 for Supporters</div>'
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
    el.innerHTML = '<div style="font-size:12px;color:var(--muted);">Add holdings to see signal.</div>';
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
    h += '<div style="margin-top:6px;padding:5px 8px;background:rgba(255,69,96,.06);border:1px solid rgba(255,69,96,.2);border-radius:3px;font-size:12px;color:var(--muted);line-height:1.6;">'
       + '<span style="color:var(--red);font-weight:600;">⚠ DYOR:</span> A coin performing badly for months will not automatically recover because you bought it. Research before rotating capital. '
       + '<span style="color:var(--red);">Rotator is not responsible for your investment decisions.</span>'
       + '</div>';
  }
  el.innerHTML = h;
}
