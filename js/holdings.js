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

/* ── Crypto (+ bStock) holdings persistence ──────────────────────
   An entry is `{id, sym, qty, avg}`. **`id` is the key; `sym` is a
   label.** Before 2026-09-16 the key WAS `sym`, and entries written by
   that version have no `id` until upgradeHoldingKeys() resolves one.
   Both shapes are readable at all times — see that function. */
function loadH()  { try { return JSON.parse(localStorage.getItem('rot_h5') || '[]'); } catch(e) { return []; } }
function saveH()  { try { localStorage.setItem('rot_h5', JSON.stringify(holdings)); } catch(e) {} }

/* ── Identity, in one place ──────────────────────────────────────
   Every "is this coin the one in this entry?" question in the app goes
   through these, so there is exactly one answer to it.

   WHY THIS CHANGED (2026-09-16). Holdings and the watchlist were keyed
   by SYMBOL, and a symbol is not unique. This project has already been
   bitten twice:

     • FRAX — the universe carried two coins reporting symbol FRAX, and
       a FRAX holding matched whichever loaded first. Engine 2.4.0's
       movement diff was re-keyed onto coin id for exactly this, and the
       stablecoin was eventually dropped (see config.js). Holdings were
       left on symbols.
     • QNT — Binance lists QNTB (Quantinuum, the quantum-computing
       company) while the universe scores QNT (Quant, the token).
       sync-bstocks currently holds Quantinuum back SOLELY because this
       keying would have shown the equity holder the token's price.

   The resolution order made it worse than a coin flip: tiles resolved
   with `coins.find(c => c.sym === h.sym)` over an array sorted by
   market cap, and bStocks carry mcap 0 — so on a crypto/equity
   collision the crypto ALWAYS won, silently, with no error and a
   plausible-looking price.

   A coin id is unique by construction (it is CoinGecko's slug, or
   'bstock_<TICKER>' for an equity), so this removes the class of bug
   rather than the two instances of it. */
function holdingMatches(h, c) {
  if (!h || !c) return false;
  return h.id ? h.id === c.id : h.sym === c.sym;
}
/* The value remove/lookup handlers pass around. Ids are lowercase
   slugs and symbols are uppercase tickers, so the two never collide. */
function holdingKey(h) { return h.id || h.sym; }
function coinOfHolding(h) {
  if (!Array.isArray(coins)) return null;
  for (var i = 0; i < coins.length; i++) if (holdingMatches(h, coins[i])) return coins[i];
  return null;
}
function isHeldCoin(c) {
  return holdings.some(function(h) { return holdingMatches(h, c); });
}
function isWatchedCoin(c) {
  if (typeof watchlist === 'undefined' || !Array.isArray(watchlist)) return false;
  return watchlist.some(function(w) { return w === c.id || w === c.sym; });
}

/* ── Re-key stored entries from symbol to coin id ────────────────
   Runs from doLoad() once coins[] is populated, NOT at parse time:
   resolving a symbol needs the universe, and the universe arrives long
   after this file is evaluated. Anything still on a symbol keeps
   working through holdingMatches() until a run can resolve it.

   COLLISION RULE. If a stored symbol now matches more than one coin,
   the non-equity wins. That is not a guess — it reproduces exactly what
   the visitor was already being shown, because the old mcap-sorted
   `find` always returned the crypto. Migrating to the equity would
   silently change which asset someone's position refers to, which is
   the one outcome worse than the bug.

   Unresolvable entries are KEPT, not dropped. A symbol may be missing
   because its category has not loaded, because bStocks failed, or
   because the coin genuinely left the universe, and this function
   cannot tell those apart. pruneStaleHoldings() owns deletion and now
   only deletes what it can positively identify. */
function upgradeHoldingKeys() {
  if (!Array.isArray(coins) || !coins.length) return;

  function resolve(sym) {
    var m = coins.filter(function(c) { return c.sym === sym; });
    if (!m.length) return null;
    if (m.length === 1) return m[0];
    var nonStock = m.filter(function(c) { return !c.isStock; });
    console.info('[upgradeHoldingKeys] "' + sym + '" matches ' + m.length
      + ' coins; keeping the one already being displayed ('
      + (nonStock[0] || m[0]).id + ')');
    return nonStock[0] || m[0];
  }

  var changed = false, stuck = [];
  holdings.forEach(function(h) {
    if (h.id || !h.sym) return;
    var c = resolve(h.sym);
    if (c) { h.id = c.id; h.sym = c.sym; changed = true; }
    else stuck.push(h.sym);
  });
  if (changed) saveH();

  /* Watchlist is a bare array of strings, so an upgraded entry is just
     an id where a ticker used to be. holdingMatches()'s counterpart
     isWatchedCoin() accepts either, so a stuck entry still works. */
  if (typeof watchlist !== 'undefined' && Array.isArray(watchlist)) {
    var wChanged = false;
    for (var i = 0; i < watchlist.length; i++) {
      var w = watchlist[i];
      /* Already an id if any coin claims it as one. */
      if (coins.some(function(c) { return c.id === w; })) continue;
      var wc = resolve(w);
      if (wc) { watchlist[i] = wc.id; wChanged = true; }
      else stuck.push(w);
    }
    /* De-duplicate: two tickers can resolve to one id. */
    if (wChanged) {
      var seen = {};
      watchlist = watchlist.filter(function(w) {
        if (seen[w]) return false; seen[w] = 1; return true;
      });
      if (typeof saveWatchlist === 'function') saveWatchlist();
    }
  }

  if (stuck.length) {
    console.info('[upgradeHoldingKeys] kept on symbol, no coin matched yet: ' + stuck.join(', '));
  }
}

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

  /* Only entries that have been RESOLVED to an id are candidates for
     deletion, and only when that id is genuinely absent from the
     universe. Changed 2026-09-16, and it makes this strictly safer.

     The old version deleted anything whose SYMBOL was not in coins[].
     That treated "this ticker no longer exists" and "the part of the
     universe holding this ticker has not loaded" as the same event,
     because a symbol lookup cannot tell them apart. A partial load —
     bStocks failing while crypto succeeded, which is a real and
     survivable state — would have silently deleted every stock
     holding the visitor owned, with a console.info as the only trace.

     An id that is present in the store and absent from a fully loaded
     universe is a positive identification, so that still gets removed.
     An entry still on a symbol is left alone and shows its Unavailable
     tile until a later run can resolve it. */
  /* Deleting needs positive evidence that the SEGMENT of the universe
     this entry belongs to actually loaded. An id being absent from
     coins[] means "gone" only if its kind is represented at all;
     otherwise it means that half of the load failed.

     Caught by testing the real scenario rather than reasoning about it:
     with bStocks failing and crypto succeeding, an id-only check still
     deleted every stock holding — the earlier guard covered entries
     that had never been upgraded, which after the migration is nobody.

     Equity ids are prefixed 'bstock_' by loadBstocks(); everything else
     is crypto. Two segments, one rule. */
  var haveStocks = coins.some(function(c) { return c.isStock; });
  var haveCrypto = coins.some(function(c) { return !c.isStock; });
  function isEquityKey(h) {
    return (h.id && h.id.indexOf('bstock_') === 0);
  }

  var before = holdings.length;
  holdings = holdings.filter(function(h) {
    if (!h.id) return true;                 /* unresolved — not evidence of anything */
    if (isEquityKey(h) ? !haveStocks : !haveCrypto) return true;  /* segment absent — cannot judge */
    return coins.some(function(c) { return c.id === h.id; });
  });
  if (holdings.length !== before) {
    console.info('[pruneStaleHoldings] removed ' + (before - holdings.length) + ' holding(s) whose coin id is no longer in the universe');
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
  /* The select now carries COIN IDS, not tickers — renderCoinSel() in
     signals.js builds it and ui.js's add-holding modal injects one. A
     ticker arriving here would mean an old cached copy of one of those
     files, so it is resolved rather than trusted. */
  var chosen = document.getElementById('coin-sel').value;
  var qty = parseFloat(document.getElementById('inp-qty').value) || null;
  var avg = parseFloat(document.getElementById('inp-avg').value) || null;
  if (!chosen) return;

  var c = (Array.isArray(coins) ? coins : []).find(function(x) { return x.id === chosen; })
       || (Array.isArray(coins) ? coins : []).find(function(x) { return x.sym === chosen; });
  if (!c) return;

  var isFirst = holdings.length === 0;
  var idx = holdings.findIndex(function(h) { return holdingMatches(h, c); });
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
  if (idx >= 0) holdings[idx] = {id: c.id, sym: c.sym, qty: qty, avg: avg};
  else holdings.push({id: c.id, sym: c.sym, qty: qty, avg: avg});
  saveH();
  if (typeof supaCountFeature === 'function') supaCountFeature('holdings_edit');
  if (isFirst) creditReferrer();
  document.getElementById('coin-sel').value  = '';
  document.getElementById('inp-qty').value   = '';
  document.getElementById('inp-avg').value   = '';
  renderAll();
}

/* Takes holdingKey(h) — a coin id, or a ticker for an entry not yet
   upgraded. sparkStop stays keyed by ticker because it addresses a
   canvas element (`sp-<sym>`), so the sym is looked up rather than
   assumed to be the argument. */
function removeHolding(key) {
  var gone = holdings.filter(function(h) { return holdingKey(h) === key; });
  gone.forEach(function(h) {
    if (h.sym && sparkStop[h.sym]) { sparkStop[h.sym](); delete sparkStop[h.sym]; }
  });
  holdings = holdings.filter(function(h) { return holdingKey(h) !== key; });
  saveH(); renderAll();
}

/* Enter key on qty/avg inputs triggers add */
['inp-qty', 'inp-avg'].forEach(function(id) {
  document.getElementById(id).addEventListener('keydown', function(e) { if (e.key === 'Enter') addHolding(); });
});

/* ── What a position is worth, and what it has done ─────────
   OWNER of this arithmetic. It lived inline inside renderTiles() and was
   the only copy, which was fine until the add-holdings modal needed to
   show the same figures BEFORE the holding exists. Two copies of a money
   calculation is how they drift, so there is one, and both callers ask
   it rather than repeat it.

   Returns null when there is nothing to say: no quantity, no average, or
   an average of zero. A caller must render nothing in that case, never a
   dash — "no profit figure yet" and "zero profit" are different claims. */
function holdingPL(price, qty, avg) {
  qty = parseFloat(qty); avg = parseFloat(avg);
  if (!isFinite(price) || !isFinite(qty) || !isFinite(avg)) return null;
  if (!qty || !avg || avg <= 0) return null;
  var profit = (price - avg) * qty;
  var pct    = ((price - avg) / avg) * 100;
  return {
    value:  price * qty,
    profit: profit,
    pct:    pct,
    dir:    profit >= 0 ? 'up' : 'dn',
    text:   (profit >= 0 ? '+' : '-') + '$'
            + Math.abs(profit).toLocaleString('en-US', { maximumFractionDigits: 0 })
            + ' (' + (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%)'
  };
}

/* ── Crypto tile renderer ────────────────────────────────────
   Nine, not ten. This is the GRID SHAPE, not an entitlement: the panel
   is three tiles wide beside the watchlist, so ten left a row of one
   and a hole where the other two would go. Three by three fills it.

   PRO_HOLDINGS_LIMIT stays at 10 — nobody loses a slot they were
   promised. A Pro who fills all ten simply gets two tiles on a third
   row, because the pad below is a MINIMUM shape and the real holdings
   above it are always rendered in full.

   Eight, not nine: the grid is four across, so nine left one tile alone
   on a row with three holes beside it. Two rows of four fill exactly. */
var TOTAL_TILE_SLOTS = 8;

/* ── Holder risk (promptove/64, audit item 2) ───────────────────────
   Exchange and unlock facts about a coin you HOLD, on its tile: a
   Binance delisting (announced or done), no Binance pair, a Monitoring
   tag, or an unlock above the engine's UNLOCK_PENDING_PCT within 30
   days. These already kept the coin off the buy side; the holder was
   never told. send-telegram-alerts reports the same facts for the
   owner's my_holdings.

   Reads the page's own sets (loaded before tiles render) and fails
   quiet: a missing set means no line, never a wrong one. */
function _holderRisk(c) {
  if (!c || !c.sym) return '';
  var out = [];
  var st = (typeof delistedStatus !== 'undefined' && delistedStatus[c.sym]) || '';
  if (typeof delistedSymbols !== 'undefined' && delistedSymbols.has(c.sym)) {
    out.push(st === 'DELIST_ANNOUNCED' ? 'Binance delisting announced'
           : st === 'NOT_LISTED'       ? 'Not listed on Binance'
           :                             'Not trading on Binance');
  }
  if (typeof monitoringSymbols !== 'undefined' && monitoringSymbols.has(c.sym)) {
    out.push('Binance Monitoring tag');
  }
  var u = (typeof _tokenUnlocks !== 'undefined' && c.id && _tokenUnlocks[c.id]) || null;
  var pct = u && u.unlock30d_pct != null ? Number(u.unlock30d_pct) : null;
  var line = (window.RotatorEngine && window.RotatorEngine.UNLOCK_PENDING_PCT != null)
    ? window.RotatorEngine.UNLOCK_PENDING_PCT : null;
  if (pct != null && line != null && pct > line) out.push(pct.toFixed(1) + '% unlocks within 30 days');
  return out.join(' · ');
}

function renderTiles() {
  Object.keys(sparkStop).forEach(function(k) { sparkStop[k](); delete sparkStop[k]; });
  var grid  = document.getElementById('tiles-grid');
  var hcEl  = document.getElementById('hcount');
  var limit = isPro ? PRO_HOLDINGS_LIMIT : FREE_HOLDINGS_LIMIT;
  if (hcEl) hcEl.textContent = holdings.length ? holdings.length + '/' + limit : '';

  var heldCoins = holdings.map(coinOfHolding).filter(Boolean);
  var topG = null;
  if (isPro) heldCoins.forEach(function(c) { if (!topG || c.p24 > topG.p24) topG = c; });

  var html = '';

  /* ── Real holding tiles ── */
  holdings.forEach(function(h) {
    var c = coinOfHolding(h);
    if (!c) {
      /* `sym` is carried alongside `id` precisely so an unresolvable
         entry can still name itself, rather than showing a slug. */
      html += '<div class="tile"><div class="tile-top"><span class="tile-sym">' + (h.sym || h.id) + '</span>'
            + '<button class="tile-rm" onclick="removeHolding(\'' + holdingKey(h) + '\')">×</button></div>'
            + '<div style="font-size:12px;color:var(--muted);">Unavailable</div></div>';
      return;
    }
    var _pl = holdingPL(c.price, h.qty, h.avg);
    var pl = _pl ? _pl.text : '', plC = _pl ? _pl.dir : '';
    var glw  = c.score >= 65 ? 'glow-g' : c.score >= 40 ? 'glow-a' : 'glow-r';
    var scrC = c.score >= 65 ? 'hi'     : c.score >= 40 ? 'md'     : 'lo';
    var isTop = topG && c.sym === topG.sym && c.p24 > 0;
    html += '<div class="tile ' + glw + '" id="tile-' + c.sym + '" onclick="openTileDetail(\'' + c.id + '\',event)" style="cursor:pointer;" title="Click for full breakdown">'
          + (isTop ? '<canvas class="sp" id="sp-' + c.sym + '"></canvas>' : '')
          + '<div class="tile-top"><div class="tile-ico"><img src="' + c.image + '" alt="' + c.sym + ' logo" loading="lazy" width="16" height="16" onerror="this.style.display=\'none\'"></div>'
          + '<span class="tile-sym">' + c.sym + '</span>'
          + '<button class="tile-rm" onclick="event.stopPropagation();removeHolding(\'' + holdingKey(h) + '\')">×</button></div>'
          + '<div class="tile-price">' + fmtP(c.price) + '</div>'
          + '<div class="tile-perfs">'
            + '<div class="tpf"><span class="tpf-l">24H</span><span class="tpf-v ' + (c.p24>=0?'up':'dn') + '">' + (c.p24>=0?'+':'') + c.p24.toFixed(1) + '%</span></div>'
            + '<div class="tpf"><span class="tpf-l">7D</span><span class="tpf-v '  + (c.p7>=0?'up':'dn')  + '">' + (c.p7>=0?'+':'')  + c.p7.toFixed(1)  + '%</span></div>'
            + '<div class="tpf"><span class="tpf-l">30D</span><span class="tpf-v ' + (c.p30>=0?'up':'dn') + '">' + (c.p30>=0?'+':'') + c.p30.toFixed(1) + '%</span></div>'
          + '</div>'
          + (function() { var r = _holderRisk(c); return r ? '<div class="tile-risk" title="' + r + '">⚠ ' + r + '</div>' : ''; })()
          + (c.insight ? '<div class="tile-insight"><div class="insight-pulse ' + c.insight.color + '" data-tip="' + c.insight.tooltip.replace(/"/g, '&quot;') + '" title="' + c.insight.tooltip.replace(/"/g, '&quot;') + '"><span class="insight-dot"></span><span class="insight-lbl">' + c.insight.label + '</span><span class="insight-score">' + c.insight.score + '</span></div></div>' : '')
          + '<div class="tile-foot">' + (pl ? '<span class="tile-pl ' + plC + '">' + pl + '</span>' : '<span></span>')
          + '<span class="tile-scr ' + scrC + '">' + c.score + '</span></div>'
          + '</div>';
  });

  /* ── Watched coins ──
     Same panel, different claim. A held tile says what you own and what it
     has done to your money; a watched tile says you are paying attention
     and nothing more, so it carries no quantity, no average and no profit
     line. They sit between the holdings and the empty slots so the upsell
     never comes between two real coins.

     watchlist[] still lives in js/ui.js and is still what the eye icon
     writes. This function only DRAWS it. renderSignal() below is handed
     heldCoins and never these, because a coin you are watching must not
     move the portfolio score — it is attention, not capital.

     The empty-slot arithmetic underneath is deliberately left alone: it
     counts HOLDINGS against the tier limit, and watching a coin does not
     consume a holding slot. */
  /* Entries are coin ids after upgradeHoldingKeys(); one that could not
     be resolved is still a ticker, so both are accepted. The held-check
     goes through holdingMatches() so a watch and a holding of the same
     coin collapse even when one side is still on a ticker. */
  var _watched = (typeof watchlist !== 'undefined' ? watchlist : []).filter(function(key) {
    var wc = coins.find(function(x) { return x.id === key || x.sym === key; });
    return wc ? !isHeldCoin(wc) : !holdings.some(function(h) { return holdingKey(h) === key; });
  });
  _watched.forEach(function(sym) {
    var c = coins.find(function(x) { return x.id === sym || x.sym === sym; });
    if (!c) {
      html += '<div class="tile tile-watch"><div class="tile-top"><span class="tile-sym">' + sym + '</span>'
            + '<button class="tile-rm" onclick="event.stopPropagation();removeFromWatchlist(\'' + sym + '\')">×</button></div>'
            + '<div style="font-size:12px;color:var(--muted);">Loading…</div></div>';
      return;
    }
    var wg = c.score >= 65 ? 'glow-g' : c.score >= 40 ? 'glow-a' : 'glow-r';
    html += '<div class="tile tile-watch ' + wg + '" style="cursor:pointer;" onclick="openTileDetail(\'' + c.id + '\',event)" title="Watching ' + c.name + '">'
          + '<div class="tile-top"><div class="tile-ico"><img src="' + c.image + '" alt="' + c.sym + ' logo" loading="lazy" width="16" height="16" onerror="this.style.display=\'none\'"></div>'
          + '<span class="tile-sym">' + c.sym + '</span>'
          + '<span class="tile-watch-badge" title="On your watchlist">👁</span>'
          + '<button class="tile-rm" onclick="event.stopPropagation();removeFromWatchlist(\'' + c.sym + '\')">×</button></div>'
          + '<div class="tile-price">' + fmtP(c.price) + '</div>'
          + '<div class="tile-perfs">'
            + '<div class="tpf"><span class="tpf-l">24H</span><span class="tpf-v ' + (c.p24>=0?'up':'dn') + '">' + (c.p24>=0?'+':'') + c.p24.toFixed(1) + '%</span></div>'
            + '<div class="tpf"><span class="tpf-l">7D</span><span class="tpf-v '  + (c.p7>=0?'up':'dn')  + '">' + (c.p7>=0?'+':'')  + c.p7.toFixed(1)  + '%</span></div>'
            + '<div class="tpf"><span class="tpf-l">30D</span><span class="tpf-v ' + (c.p30>=0?'up':'dn') + '">' + (c.p30>=0?'+':'') + c.p30.toFixed(1) + '%</span></div>'
          + '</div>'
          + (c.insight ? '<div class="tile-insight"><div class="insight-pulse ' + c.insight.color + '" data-tip="' + c.insight.tooltip.replace(/"/g, '&quot;') + '" title="' + c.insight.tooltip.replace(/"/g, '&quot;') + '"><span class="insight-dot"></span><span class="insight-lbl">' + c.insight.label + '</span><span class="insight-score">' + c.insight.score + '</span></div></div>' : '')
          + '<div class="tile-foot"><span class="tile-watch-lbl">watching</span>'
          + '<span class="tile-scr ' + (c.score>=65?'hi':c.score>=40?'md':'lo') + '">' + c.score + '</span></div>'
          + '</div>';
  });

  /* ── Empty slots, to the shape and no further ──
     This used to add a FIXED number of locked tiles on top of whatever
     was already rendered, so eight real holdings produced fourteen cells
     and two dead rows of coffee cups. The pad now fills up to the grid
     shape and stops.

     A slot is a green + while the tier still allows another holding, and
     a locked ☕ after that. The purple "Monitor Multiple Assets at Once"
     tiles are gone — that pitch is one entry at the foot of the rail
     now, where it is asked once instead of twice per screen. */
  var used  = holdings.length + _watched.length;
  var limitH = isPro ? PRO_HOLDINGS_LIMIT : FREE_HOLDINGS_LIMIT;
  for (var i = used; i < TOTAL_TILE_SLOTS; i++) {
    if (holdings.length + (i - used) < limitH) {
      html += '<div class="tile-placeholder" onclick="openAddHoldingsModal()">'
            + '<div class="ph-plus">+</div><div class="ph-lbl">Add Coin</div></div>';
    } else {
      html += '<div class="tile-placeholder tile-placeholder-locked" onclick="openPro()" title="Support & Unlock">'
            + '<div class="ph-plus">+</div><div class="ph-lbl">☕</div></div>';
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
  else if (over.length)                 { statusTxt = '↑ OUTPERFORMING';  statusCol = 'var(--amber)'; }
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

  el.innerHTML = h;

  /* DYOR warning only if any are lagging.
     It used to be appended INSIDE the signal box, where a 230px column
     turned two sentences into five lines and made that column ~140px
     taller than the two beside it — the whole of the empty space at the
     foot of YOURS. It goes across the section instead: same words, same
     condition, two lines, and it now reads as belonging to the section
     rather than to the score. */
  var dy = document.getElementById('signal-dyor');
  if (dy) {
    dy.innerHTML = under.length
      ? '<span class="dyor-flag">⚠ DYOR:</span> A coin performing badly for months will not '
        + 'automatically recover because you bought it. Research before rotating capital. '
        + '<span class="dyor-flag">Rotator is not responsible for your investment decisions.</span>'
      : '';
    dy.style.display = under.length ? '' : 'none';
  }
}
