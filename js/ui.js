/* coins watcher — makes window.coins available to inline search */
window.coins = window.coins || [];
var _coinsProxy = {
  _arr: window.coins,
  get: function() { return this._arr; }
};
/* Patch Array push so search gets live data without polling */

/* ══════════════════════════════════════════════════════════════
   BOTTOM NAV TOGGLE — second press closes the open section
══════════════════════════════════════════════════════════════ */
/* ── New swap redesign: advanced override toggle ── */
function newToggleAdvanced() {
  var panel = document.getElementById('new-adv-panel');
  var icon  = document.getElementById('new-adv-icon');
  if (!panel) return;
  var open = panel.classList.toggle('open');
  if (icon) icon.classList.toggle('open', open);
}

/* initNavToggle() removed (promptove/103): it rebound the bottom-nav
   buttons so a second tap folded the section shut. The bar now goes to
   the rail's sections through mobGo() in js/data-loaders.js, and the
   active button follows the scroll (initRail() below). */
(function initCollapsible() {
  /* State stored in localStorage so sections remember open/closed */
  var STORAGE_KEY = 'rot_collapse';
  var state = {};
  try { state = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch(e) {}

  function save() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch(e) {} }

  /* Expose globally */
  window.toggleCollapse = function(id) {
    var hdr  = document.getElementById('ch-' + id);
    var body = document.getElementById('cb-' + id);
    if (!hdr || !body) return;

    var isCollapsed = body.classList.contains('collapsed');
    if (isCollapsed) {
      /* Open: measure real height, animate, then clear max-height */
      body.classList.remove('collapsed');
      body.style.maxHeight = body.scrollHeight + 'px';
      body.style.opacity   = '1';
      hdr.classList.add('open');
      state[id] = 'open';
      setTimeout(function() { body.style.maxHeight = 'none'; }, 320);
    } else {
      /* Close: set explicit height first, then collapse */
      body.style.maxHeight = body.scrollHeight + 'px';
      body.offsetHeight; /* force reflow */
      body.style.maxHeight = '0';
      body.style.opacity   = '0';
      hdr.classList.remove('open');
      state[id] = 'closed';
      setTimeout(function() { body.classList.add('collapsed'); }, 320);
    }
    save();
  };

  /* On load: restore saved state (open sections that user previously opened) */
  document.addEventListener('DOMContentLoaded', function() {
    /* 'support' is gone — the Keep it Free card sits beside the swap
       chart now and is never collapsed. The loop already skips ids whose
       header or body is missing, so leaving it here would have been
       harmless and also a lie about what the page contains. */
    var ids = ['hot', 'swap', 'promo', 'holdings', 'trackrecord'];
    ids.forEach(function(id) {
      if (state[id] === 'open') {
        var hdr  = document.getElementById('ch-' + id);
        var body = document.getElementById('cb-' + id);
        if (hdr && body) {
          body.classList.remove('collapsed');
          body.style.maxHeight = 'none';
          body.style.opacity   = '1';
          hdr.classList.add('open');
        }
      }
    });
  });
})();

/* ══════════════════════════════════════════════════════════════
   LOGO RENDERER — draws animated ⬡ ROTATOR text on canvas
══════════════════════════════════════════════════════════════ */
(function drawLogos() {
  function drawLogo(canvas) {
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    /* Hex symbol */
    ctx.font = 'bold ' + Math.round(H * 0.75) + 'px "IBM Plex Mono", monospace';
    ctx.fillStyle = '#F3BA2F';
    ctx.shadowColor = 'rgba(243,186,47,0.55)';
    ctx.shadowBlur = 8;
    ctx.fillText('⬡', 0, H * 0.82);
    ctx.shadowBlur = 0;

    /* ROTATOR text */
    ctx.font = '600 ' + Math.round(H * 0.48) + 'px "IBM Plex Mono", monospace';
    ctx.fillStyle = '#F3BA2F';
    ctx.letterSpacing = '0.18em';
    ctx.fillText('ROTATOR', Math.round(H * 0.88), H * 0.54);

    /* sub-label */
    ctx.font = '300 ' + Math.round(H * 0.3) + 'px "IBM Plex Mono", monospace';
    ctx.fillStyle = 'rgba(140,160,180,0.85)';
    ctx.fillText('SCREENER', Math.round(H * 0.88), H * 0.9);
  }

  /* Draw after fonts are likely loaded */
  function init() {
    drawLogo(document.getElementById('logo-c'));
    drawLogo(document.getElementById('logo-c-mob'));
  }
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(init);
  } else {
    setTimeout(init, 400);
  }
})();

/* ══════════════════════════════════════════════════════════════
   MOBILE SIGNAL STRIP — mirrors Portfolio Signal into neon bar
   ══════════════════════════════════════════════════════════════ */
(function syncMobSignalStrip() {
  function update() {
    var strip = document.getElementById('mob-neon-sig-val');
    if (!strip) return;
    var avg = document.querySelector('#sig-content .sig-avg');
    if (avg) {
      var num = avg.querySelector('.sig-avg-num') || avg;
      strip.textContent = num.textContent.trim() || 'No holdings';
      strip.style.color = '';
      if (avg.classList.contains('up')) strip.style.color = 'var(--green)';
      else if (avg.classList.contains('dn')) strip.style.color = 'var(--red)';
      else if (avg.classList.contains('fl')) strip.style.color = 'var(--amber)';
    } else {
      strip.textContent = 'Add holdings →';
    }
  }
  // Poll lightly — signal updates after data load
  setInterval(update, 2000);
  document.addEventListener('DOMContentLoaded', update);
})();
/* ════════════════════════════════════════════════════════════════
   NEW FEATURES JS
   - Left panel dual tabs (My Holdings / Watchlist)
   - Add Holdings Modal (coin search + inputs)
   - Swap Tool Tutorial
   ════════════════════════════════════════════════════════════════ */

/* The two tabs are gone — one panel holds both now. This remains only
   because the mobile bottom nav and the add-to-watchlist flow still say
   "show me the watchlist", and the honest answer is "it is already on
   screen, here it is". Scrolls to the panel rather than switching to it. */
function switchHoldingsView() {
  var el = document.getElementById('my-holdings-panel');
  if (el && typeof window.rotScrollToEl === 'function') window.rotScrollToEl(el);
}

/* ── Watchlist state ─────────────────────────────────────────── */
var watchlist = [];
try { watchlist = JSON.parse(localStorage.getItem('rot_watchlist') || '[]'); } catch(e) {}
function saveWatchlist() { try { localStorage.setItem('rot_watchlist', JSON.stringify(watchlist)); } catch(e) {} }
/* Held coins and watched coins share ONE grid now, and renderTiles() in
   js/holdings.js draws it. This stays because three call sites ask for it
   by name — toggleWatch(), removeFromWatchlist() and renderAll() — and
   because "redraw the watchlist" is still a sentence worth being able to
   say. It just is not a second renderer any more. */
function renderWatchlist() {
  if (typeof renderTiles === 'function') renderTiles();
  if (typeof renderCoinAlerts === 'function') renderCoinAlerts();
}
/* Takes a coin id or a ticker and removes EVERY entry for that coin.
   Entries are coin ids since upgradeHoldingKeys() (some are still a
   ticker), and the tile's × button passed the ticker, so comparing the
   two strings matched nothing and the coin stayed watched (reported
   2026-10-01). */
function removeFromWatchlist(key) {
  var c = (typeof coins !== 'undefined' && Array.isArray(coins))
    ? coins.find(function(x) { return x.id === key || x.sym === key; }) : null;
  var drop = c ? [key, c.id, c.sym] : [key];
  watchlist = watchlist.filter(function(s) { return drop.indexOf(s) < 0; });
  saveWatchlist(); renderWatchlist();
  if (typeof renderTable === 'function') renderTable();   /* the table's eye icon too */
}
function openAddWatchlistModal() { openAddHoldingsModal('watchlist'); }

/* Draw the ten slots before any coin data exists, so the panel has its
   shape during the load rather than a single placeholder line. renderAll()
   redraws it with real tiles the moment `coins` is populated. */
document.addEventListener('DOMContentLoaded', function() { renderWatchlist(); });

/* ── Add Holdings Modal ──────────────────────────────────────── */
var _ahmMode = 'holdings'; // 'holdings' or 'watchlist'
var _ahmSelected = null;

function openAddHoldingsModal(mode) {
  _ahmMode = mode || 'holdings';
  _ahmSelected = null;
  document.getElementById('ahm-search').value = '';
  document.getElementById('ahm-qty').value = '';
  document.getElementById('ahm-avg').value = '';
  var watching = _ahmMode === 'watchlist';
  document.querySelector('#add-holdings-modal .modal-title').textContent =
    watching ? 'Add to watchlist' : 'Add to holdings';
  document.querySelector('#add-holdings-modal .modal-sub').textContent = watching
    ? 'Coins you follow without holding. Scores are relative strength in this run, not advice.'
    : _ahmCoins().length + ' coins ranked in this run. Scores are relative strength, not advice.';
  /* Quantity and average mean nothing for a coin you are only watching. */
  document.querySelector('.ahm-inputs').style.display = watching ? 'none' : '';
  ahmFilter();
  ahmPreview();
  openModal('add-holdings-modal');
  /* Re-filter after a tick so coins[] is guaranteed to be populated. */
  setTimeout(function() { ahmFilter(); ahmPreview(); }, 60);
}

/* ── The add-holdings list ────────────────────────────────────────
   A row carries what the engine already knows: the score it ranked the
   coin at and the Insight label it wrote. This is the one screen where
   you choose a coin, and it was the one screen that showed neither.

   Coins already on the watchlist are grouped first. You have said you
   are paying attention to those, so they are the ones most likely to
   become a holding.

   Wording stays descriptive. A score is relative strength in this run,
   not a recommendation, and the subtitle says so. */
function _ahmCoins() {
  if (window.coins && Array.isArray(window.coins) && window.coins.length) return window.coins;
  return (typeof coins !== 'undefined' && Array.isArray(coins)) ? coins : [];
}

function _ahmPrice(v) {
  if (!isFinite(v)) return '—';
  return '$' + (v >= 1 ? v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                       : v.toFixed(5));
}

function _ahmRow(coin) {
  var sel  = _ahmSelected && _ahmSelected.id === coin.id;
  var scrC = scoreBand(coin.score);
  var chg  = (coin.p24 >= 0 ? '+' : '') + (coin.p24 || 0).toFixed(1) + '% 24h';
  var chgC = coin.p24 >= 0 ? 'up' : 'dn';
  return '<div class="ahm-coin-item' + (sel ? ' selected' : '') + '" onclick="ahmSelect(\'' + coin.id + '\')">'
    + '<div class="ahm-coin-ico"><img src="' + coin.image + '" alt="" loading="lazy" onerror="this.style.display=\'none\'"></div>'
    + '<div class="ahm-coin-who">'
      + '<div class="ahm-coin-name">' + coin.sym + '</div>'
      + '<div class="ahm-coin-sub">' + _ahmPrice(coin.price)
        + ' · <span class="' + chgC + '">' + chg + '</span></div>'
    + '</div>'
    + (coin.insight
        ? '<span class="ahm-chip ' + coin.insight.color + '">' + coin.insight.label
          + ' ' + coin.insight.score + '</span>'
        : '')
    + '<span class="ahm-scr ' + scrC + '">' + (coin.score != null ? coin.score : '—') + '</span>'
    + '</div>';
}

function ahmFilter() {
  var q = (document.getElementById('ahm-search').value || '').toLowerCase().trim();
  var c = _ahmCoins();
  var listEl = document.getElementById('ahm-coin-list');
  if (!listEl) return;
  if (!c.length) {
    listEl.innerHTML = '<div class="ahm-empty">Loading coin data…<br>'
      + '<span>Open the app first to fetch prices, then re-open this window.</span></div>';
    return;
  }

  var match = q
    ? c.filter(function(x) { return x.sym.toLowerCase().includes(q) || (x.name || '').toLowerCase().includes(q); })
    : c;

  var held = (typeof holdings !== 'undefined' ? holdings : []).map(function(h) { return h.sym; });
  var watch = (typeof watchlist !== 'undefined' ? watchlist : []);
  var onWatch = [], rest = [];
  match.forEach(function(x) {
    if (held.indexOf(x.sym) >= 0) return;      /* already a holding */
    (watch.indexOf(x.sym) >= 0 ? onWatch : rest).push(x);
  });

  var html = '';
  if (onWatch.length) {
    html += '<div class="ahm-grp watch">Watching</div>'
          + onWatch.slice(0, 20).map(_ahmRow).join('');
    if (rest.length) html += '<div class="ahm-grp">All coins</div>';
  }
  html += rest.slice(0, 50).map(_ahmRow).join('');

  listEl.innerHTML = html
    || '<div class="ahm-empty">No coins found for "' + q + '"</div>';
}

function ahmSelect(coinId) {
  var c = _ahmCoins();
  _ahmSelected = c.find(function(x) { return x.id === coinId; });
  if (!_ahmSelected) return;
  /* Legacy hidden select, still read by addHolding(). */
  var sel = document.getElementById('coin-sel');
  if (sel) {
    /* Value is the coin ID, matching renderCoinSel() in signals.js —
       addHolding() reads this element and expects an id (2026-09-16). */
    sel.innerHTML = '<option value="' + _ahmSelected.id + '">' + _ahmSelected.sym + '</option>';
    sel.value = _ahmSelected.id;
  }
  ahmFilter();
  ahmPreview();
}

/* ── The tile you are about to create ─────────────────────────────
   Value and profit come from holdingPL() in js/holdings.js — the same
   function the real tile calls, so the preview cannot disagree with what
   appears a second later.

   The profit line is absent, not dashed, until an average is entered:
   "no figure yet" and "no profit" are different statements. */
function ahmPreview() {
  var box = document.getElementById('ahm-preview');
  var btn = document.getElementById('ahm-confirm-btn');
  if (!box || !btn) return;

  if (_ahmMode === 'watchlist') {
    box.style.display = 'none';
    btn.disabled = !_ahmSelected;
    btn.textContent = _ahmSelected ? 'Watch ' + _ahmSelected.sym : 'Select a coin';
    return;
  }
  if (!_ahmSelected) {
    box.style.display = 'none';
    btn.disabled = true;
    btn.textContent = 'Select a coin';
    return;
  }

  var c   = _ahmSelected;
  var qty = document.getElementById('ahm-qty').value;
  var avg = document.getElementById('ahm-avg').value;
  var q   = parseFloat(qty);
  var pl  = (typeof holdingPL === 'function') ? holdingPL(c.price, qty, avg) : null;

  btn.disabled = false;
  btn.textContent = (isFinite(q) && q > 0)
    ? 'Add ' + (+q.toFixed(8)) + ' ' + c.sym + ' to holdings'
    : 'Add ' + c.sym + ' to holdings';

  var rows = '';
  if (isFinite(q) && q > 0) {
    rows += '<div class="ahm-pv-row"><span class="ahm-pv-k">Position value</span>'
          + '<span class="ahm-pv-v">$' + (c.price * q).toLocaleString('en-US',
              { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '</span></div>';
  }
  if (pl) {
    rows += '<div class="ahm-pv-row"><span class="ahm-pv-k">Profit vs average</span>'
          + '<span class="ahm-pv-v ' + pl.dir + '">' + pl.text + '</span></div>';
  }

  box.style.display = '';
  box.innerHTML =
      '<div class="ahm-pv-cap">The tile you are about to create</div>'
    + '<div class="ahm-pv-top">'
      + '<div class="ahm-coin-ico"><img src="' + c.image + '" alt="" onerror="this.style.display=\'none\'"></div>'
      + '<div class="ahm-coin-who"><div class="ahm-coin-name">' + c.sym + '</div>'
      + '<div class="ahm-coin-sub">' + _ahmPrice(c.price) + ' · '
      + '<span class="' + (c.p24 >= 0 ? 'up' : 'dn') + '">' + (c.p24 >= 0 ? '+' : '')
      + (c.p24 || 0).toFixed(1) + '% 24h</span></div></div>'
      + '<span class="ahm-scr ' + scoreBand(c.score) + '">'
      + (c.score != null ? c.score : '—') + '</span>'
    + '</div>'
    + (rows ? '<div class="ahm-pv-rows">' + rows + '</div>' : '')
    + (c.insight
        ? '<div class="ahm-pv-note"><span class="ahm-pip ' + c.insight.color + '"></span>'
          + c.insight.label + ' ' + c.insight.score + ' · '
          + String(c.insight.tooltip || '').replace(/</g, '&lt;') + '</div>'
        : '');
}

function ahmConfirm() {
  if (!_ahmSelected) return;
  if (_ahmMode === 'watchlist') {
    if (!watchlist.includes(_ahmSelected.sym)) { watchlist.push(_ahmSelected.sym); saveWatchlist(); }
    closeModal('add-holdings-modal');
    renderWatchlist();
    switchHoldingsView();
    return;
  }
  // holdings mode
  var qty = document.getElementById('ahm-qty').value;
  var avg = document.getElementById('ahm-avg').value;
  document.getElementById('inp-qty').value = qty;
  document.getElementById('inp-avg').value = avg;
  if (typeof addHolding === 'function') addHolding();
  closeModal('add-holdings-modal');
}

/* Run filter when modal opens (populate initial list) */
document.addEventListener('DOMContentLoaded', function() {
  setTimeout(ahmFilter, 1500);
});

/* ── Swap Tool Tutorial ─────────────────────────────────────── */
/* Swap tour. Plain text with **bold**, turned into markup by _tutMd()
   in tutorial.js. Rewritten 2026-09-25 (promptove/66): it used to promise
   "the best moment to swap" and call ▲ Peak "the best swap moment". The
   tool shows where the ratio is, not where it goes next. */
var SWAP_TUT_STEPS = [
  {
    title: "Swap Tool — the ratio between two assets",
    desc: "This tool tracks the live price ratio between two assets over time, so you can see where today sits in its recent range. It shows where the ratio is, not where it goes next.",
    anchor: ".new-ratio-hook"
  },
  {
    title: "Pick your pair",
    desc: "Select the coin you **hold** (FROM) and the coin you are **considering** (TO). The ratio shows how many TO coins you would receive per 1 FROM coin at current prices.",
    anchor: ".new-pair-grid"
  },
  {
    title: "Read the ratio chart",
    desc: "The range bar shows the ratio over your chosen timeframe. **peak** marks the highest ratio in that period: the most TO coins one FROM coin could buy. Where the ratio goes next is not known.",
    anchor: ".new-chart-section"
  },
  {
    title: "Amount and result",
    desc: "Enter your amount on the FROM card and the TO card shows what you would receive. Underneath: the dollar value, both ratio directions, and price overrides for what-if scenarios. Always check on your exchange before trading, because prices move fast.",
    anchor: ".new-swap-hero .new-pair-grid, .new-swap-hero .swap-detail"
  }
];
/* English snapshot; applyLang() falls back to it (see i18n.js). */
var SWAP_EN = JSON.parse(JSON.stringify(SWAP_TUT_STEPS));
var _swapTutStep = 0;
var _swapTutHighlighted = null;

function startSwapTut() {
  _swapTutStep = 0;
  /* Shown before it is placed: swapTutRender() measures the card. */
  document.getElementById('swap-tut-overlay').classList.add('show');
  swapTutRender();
}
function endSwapTut() {
  document.getElementById('swap-tut-overlay').classList.remove('show');
  _swapTutUnmark();
  try { localStorage.setItem('rot_swap_tut', 'done'); } catch(e) {}
}
function swapTutNext() {
  _swapTutStep++;
  if (_swapTutStep >= SWAP_TUT_STEPS.length) { endSwapTut(); return; }
  swapTutRender();
}
function swapTutRender() {
  var step = SWAP_TUT_STEPS[_swapTutStep];
  var _s = (typeof t === 'function') ? t('tut_step') : 'STEP';
  var _o = (typeof t === 'function') ? t('tut_of') : 'OF';
  document.getElementById('swap-tut-step-lbl').textContent = _s + ' ' + (_swapTutStep+1) + ' ' + _o + ' ' + SWAP_TUT_STEPS.length;
  document.getElementById('swap-tut-title').textContent = step.title;
  document.getElementById('swap-tut-desc').innerHTML = (typeof _tutMd === 'function') ? _tutMd(step.desc) : step.desc;
  var nextBtn = document.getElementById('swap-tut-next');
  nextBtn.textContent = _swapTutStep === SWAP_TUT_STEPS.length - 1 ? 'Got it ✓' : 'Next →';
  // dots
  var dots = '';
  for (var i = 0; i < SWAP_TUT_STEPS.length; i++) dots += '<div class="swap-tut-dot' + (i===_swapTutStep?' active':'') + '"></div>';
  document.getElementById('swap-tut-dots').innerHTML = dots;

  /* Highlight what the step talks about, scroll it into view, then place
     the card. `anchor` is a CSS selector and may match several parts
     (step 4: the coin cards and the details row under them); the card is
     placed against all of them together. Until 2026-10-04 step 2 pointed
     at a hidden 2px <select> and step 3 at the 3px range line, and
     nothing scrolled, so a step could describe something off screen
     (Daniel). */
  _swapTutUnmark();
  var parts = step.anchor ? Array.prototype.slice.call(document.querySelectorAll(step.anchor)) : [];
  if (!parts.length) return;
  void document.body.offsetWidth;   /* steps 2 and 4 share the coin cards: restart their pulse */
  parts.forEach(function(p) { p.classList.add('swap-tut-highlight'); });
  _swapTutHighlighted = parts;
  _swapTutPlace(parts);
  var r0 = _swapTutRect(parts), topbar = (typeof rotTopbarH === 'function') ? rotTopbarH() : 60;
  if ((r0.top < topbar || r0.bottom > window.innerHeight - 8) && typeof rotScrollToEl === 'function') {
    /* The scroll listener below re-places the card as the page moves.
       rotScrollToEl jumps instead of animating in some cases (reduced
       motion, a hidden tab), and rAF can be paused, so place it again
       right after, and once more after the longest animation (600ms). */
    rotScrollToEl(parts[0]);
    _swapTutPlace(parts);
    setTimeout(function() { if (_swapTutHighlighted === parts) _swapTutPlace(parts); }, 650);
  }
}
/* Keep the card beside its part while the page scrolls or resizes: the
   tour's own scroll (long from the top of the page) or the reader's. */
var _swapTutRaf = 0;
function _swapTutReflow() {
  if (!_swapTutHighlighted || _swapTutRaf) return;
  _swapTutRaf = requestAnimationFrame(function() { _swapTutRaf = 0; if (_swapTutHighlighted) _swapTutPlace(_swapTutHighlighted); });
}
/* Capture, on document: on phones the page scrolls inside a container, not
   the window, and a plain window listener never hears it. */
document.addEventListener('scroll', _swapTutReflow, { passive: true, capture: true });
window.addEventListener('resize', _swapTutReflow);
function _swapTutUnmark() {
  if (!_swapTutHighlighted) return;
  _swapTutHighlighted.forEach(function(p) { p.classList.remove('swap-tut-highlight'); });
  _swapTutHighlighted = null;
}
function _swapTutRect(parts) {
  var u = null;
  parts.forEach(function(p) {
    var b = p.getBoundingClientRect();
    u = u ? { left: Math.min(u.left, b.left), top: Math.min(u.top, b.top), right: Math.max(u.right, b.right), bottom: Math.max(u.bottom, b.bottom) }
          : { left: b.left, top: b.top, right: b.right, bottom: b.bottom };
  });
  return u;
}
function _swapTutPlace(parts) {
  var r = _swapTutRect(parts);
  var box = document.getElementById('swap-tut-box');
  /* Measured, not assumed (Daniel, 2026-10-04: no card outside the
     screen). Left of the target if it fits, else right of it; with no
     room beside it (phones, full-width parts) below it, else above it,
     so the card never covers what it describes; always clamped to the
     screen. */
  /* The card sits inside <main>, which is zoomed 1.1 on wide screens
     (styles.css, --page-zoom). Work in screen pixels, then divide by
     the zoom actually applied when writing left/top. */
  var vw = window.innerWidth, vh = window.innerHeight;
  var z  = (box.offsetWidth && box.getBoundingClientRect().width / box.offsetWidth) || 1;
  var bw = box.getBoundingClientRect().width || 316 * z, bh = box.getBoundingClientRect().height || 260 * z;
  var left, top, beside = true;
  if (r.left - bw - 12 >= 8)            left = r.left - bw - 12;
  else if (r.right + 12 + bw <= vw - 8) left = r.right + 12;
  else                                  beside = false;
  if (beside) {
    top = Math.min(Math.max(8, r.top + 8), vh - bh - 8);
  } else {
    left = Math.min(Math.max(8, r.left + 8), vw - bw - 8);
    if (r.bottom + 12 + bh <= vh - 8)      top = r.bottom + 12;
    else if (r.top - 12 - bh >= 8)         top = r.top - 12 - bh;
    else                                   top = vh - bh - 8;
  }
  /* The pointer is drawn on the card's right edge, so it is only true
     when the card sits to the LEFT of what it describes. */
  box.classList.toggle('no-arrow', !(beside && left < r.left));
  box.style.left = Math.max(8, left) / z + 'px';
  /* Clamped: mid-scroll the part can still be far below the screen. */
  box.style.top  = Math.max(8, Math.min(top, vh - bh - 8)) / z + 'px';
}

// Auto-show swap tut on first visit to swap tool area
document.addEventListener('DOMContentLoaded', function() {
  setTimeout(function() {
    try { if (!localStorage.getItem('rot_swap_tut')) {
      var ratioSec = document.getElementById('ratio-section');
      if (ratioSec) {
        var obs = new IntersectionObserver(function(entries) {
          /* Not on top of the main or Pro tour, which scrolls through
             here: wait for the next time the swap tool comes into view. */
          if (typeof tutActive !== 'undefined' && tutActive) return;
          if (entries[0].isIntersecting) { startSwapTut(); obs.disconnect(); }
        }, {threshold:0.3});
        obs.observe(ratioSec);
      }
    }} catch(e) {}
  }, 3000);
});

// Wire swap tut button next to the ratio section header (add help button)
document.addEventListener('DOMContentLoaded', function() {
  setTimeout(function() {
    var hdr = document.querySelector('.rt-header-row');
    if (hdr) {
      var btn = document.createElement('button');
      btn.textContent = '? How it works';
      btn.className = 'swap-tut-btn';
      btn.style.cssText = 'margin-left:auto;font-size:12px;padding:2px 8px;';
      btn.onclick = startSwapTut;
      hdr.appendChild(btn);
    }
  }, 800);
});

/* ── Search bar & theme patch injected ── */

/* ── Topbar search logic ──────────────────────────────── */
var _tsOpen = false;
function toggleTopbarSearch(force) {
  _tsOpen = (force !== undefined) ? force : !_tsOpen;
  var dd = document.getElementById('topbar-search-dropdown');
  var inp = document.getElementById('topbar-search-input');
  if (dd) dd.style.display = _tsOpen ? 'block' : 'none';
  if (_tsOpen && inp) { inp.value=''; inp.focus(); renderTopbarResults([]); }
}
var _mobSrchOpen = false;
function toggleMobSearch(force) {
  _mobSrchOpen = (force !== undefined) ? force : !_mobSrchOpen;
  var panel = document.getElementById('mob-search-panel');
  var inp   = document.getElementById('mob-search-input');
  if (panel) panel.style.display = _mobSrchOpen ? 'block' : 'none';
  if (_mobSrchOpen && inp) { inp.value=''; inp.focus(); renderMobResults([]); }
}
/* Close desktop search on outside click */
document.addEventListener('click', function(e) {
  if (!_tsOpen) return;
  var wrap = document.getElementById('topbar-search-wrap');
  if (wrap && !wrap.contains(e.target)) toggleTopbarSearch(false);
}, true);

function handleTableSearch(q) {
  q = (q||'').toLowerCase().trim();
  var dd = document.getElementById('table-search-dropdown');
  if (!q) { if (dd) dd.style.display = 'none'; renderTableResults([]); return; }
  if (dd) dd.style.display = 'block';
  var cArr = (window.coins && Array.isArray(window.coins)) ? window.coins
           : (typeof coins !== 'undefined' && Array.isArray(coins)) ? coins : [];
  if (!cArr.length) {
    renderTableResults([{sym:'Loading…',name:'Coin data not ready yet',id:'',image:'',p24:0}]);
    return;
  }
  var filtered = cArr.filter(function(c) {
    return (c.sym||'').toLowerCase().includes(q) || (c.name||'').toLowerCase().includes(q);
  }).slice(0, 14);
  renderTableResults(filtered);
}
function renderTableResults(arr) {
  var el = document.getElementById('table-search-results');
  if (!el) return;
  if (!arr.length) { el.innerHTML = '<div class="topbar-search-empty">No results found</div>'; return; }
  el.innerHTML = arr.map(_searchItemHTML).join('');
}
/* Close table-header search on outside click / Escape-then-blur already
   handled inline; this covers clicking anywhere else on the page. */
document.addEventListener('click', function(e) {
  var wrap = document.getElementById('table-search-wrap');
  var dd   = document.getElementById('table-search-dropdown');
  if (!wrap || !dd || dd.style.display === 'none') return;
  if (!wrap.contains(e.target)) dd.style.display = 'none';
}, true);

function handleTopbarSearch(q) {
  q = (q||'').toLowerCase().trim();
  if (!q) { renderTopbarResults([]); renderMobResults([]); return; }
  /* coins is set by data-loaders.js (deferred) — access via window to be safe */
  var cArr = (window.coins && Array.isArray(window.coins)) ? window.coins
           : (typeof coins !== 'undefined' && Array.isArray(coins)) ? coins : [];
  if (!cArr.length) {
    renderTopbarResults([{sym:'Loading…',name:'Coin data not ready yet',id:'',image:'',p24:0}]);
    return;
  }
  var filtered = cArr.filter(function(c) {
    return (c.sym||'').toLowerCase().includes(q) || (c.name||'').toLowerCase().includes(q);
  }).slice(0, 14);
  renderTopbarResults(filtered);
  renderMobResults(filtered);
}
function _searchItemHTML(coin) {
  var chgColor = coin.p24 >= 0 ? 'var(--green)' : 'var(--red)';
  var chgTxt   = (coin.p24 >= 0 ? '+' : '') + (coin.p24||0).toFixed(2) + '%';
  var safeId   = (coin.id||'').replace(/'/g, '');
  return '<div class="topbar-search-result-item" onclick="handleSearchSelect(\'' + safeId + '\')">'
    + '<img class="tsri-ico" src="'+(coin.image||'')+'" alt="" onerror="this.style.opacity=\'0\'">'
    + '<span class="tsri-sym">'+(coin.sym||'')+'</span>'
    + '<span class="tsri-name">'+(coin.name||'')+'</span>'
    + '<span class="tsri-chg" style="color:'+chgColor+'">'+chgTxt+'</span>'
    + '</div>';
}
function renderTopbarResults(arr) {
  var el = document.getElementById('topbar-search-results');
  if (!el) return;
  if (!arr.length) { el.innerHTML = '<div class="topbar-search-empty">No results found</div>'; return; }
  el.innerHTML = arr.map(_searchItemHTML).join('');
}
function renderMobResults(arr) {
  var el = document.getElementById('mob-search-results');
  if (!el) return;
  el.innerHTML = arr.length
    ? arr.map(_searchItemHTML).join('')
    : '';
}
function handleSearchSelect(coinId) {
  var closeTableSearch = function() {
    var dd = document.getElementById('table-search-dropdown');
    var inp = document.getElementById('table-search-input');
    if (dd) dd.style.display = 'none';
    if (inp) inp.value = '';
  };
  /* Open coin detail card */
  if (typeof coins !== 'undefined' && typeof openTileDetail === 'function') {
    var c = coins.find(function(x) { return x.id === coinId; });
    if (c) { openTileDetail(c.id); toggleTopbarSearch(false); toggleMobSearch(false); closeTableSearch(); return; }
  }
  /* Fallback: load into swap tool */
  if (typeof RatioTracker !== 'undefined') {
    var fSel = document.getElementById('rt-from');
    if (fSel && fSel.querySelector('option[value="'+coinId+'"]')) {
      fSel.value = coinId;
      RatioTracker.onFromChange();
    }
  }
  toggleTopbarSearch(false);
  toggleMobSearch(false);
  closeTableSearch();
}

/* ── Theme: patch after deferred scripts load ─── */
document.addEventListener('DOMContentLoaded', function() {
  var _themeRAF = null;
  /* Wrap whatever toggleTheme data-loaders.js defined */
  function _applyTheme(isLight) {
    if (_themeRAF) cancelAnimationFrame(_themeRAF);
    _themeRAF = requestAnimationFrame(function() {
      document.documentElement.classList.toggle('light', isLight);
      try { localStorage.setItem('rot_theme', isLight ? 'light' : 'dark'); } catch(e) {}
      var tog = document.getElementById('theme-toggle');
      var ico = document.getElementById('theme-icon');
      var lbl = document.getElementById('theme-label');
      if (tog) tog.checked = isLight;
      if (ico) ico.textContent = isLight ? '🌙' : '☀';
      if (lbl) lbl.textContent = isLight ? 'DARK' : 'LIGHT';
      /* The swap chart is a canvas: its colours are painted, not styled,
         so it is redrawn with the new theme's palette (2026-10-05). After
         a beat, so the light card's frame and padding are laid out first;
         drawn at once it kept the old size and spilled out of its frame. */
      if (typeof RatioTracker !== 'undefined' && RatioTracker.redraw) setTimeout(RatioTracker.redraw, 60);
      /* The Business check lives on the light theme only (promptove/143). */
      if (typeof _tdCoin !== 'undefined' && _tdCoin && typeof _tdBiz === 'function') _tdBiz(_tdCoin);
      _themeRAF = null;
    });
  }
  /* Override after defer scripts have set their version */
  window.toggleTheme = _applyTheme;
  /* Also re-apply saved theme to fix any ghost state on load */
  try {
    var saved = localStorage.getItem('rot_theme');
    if (saved) _applyTheme(saved === 'light');
  } catch(e) {}
});

/* ── Consent banner — show on first visit until accepted ── */
function acceptConsent() {
  try { localStorage.setItem('rot_consent', 'accepted'); } catch(e) {}
  var banner = document.getElementById('consent-banner');
  if (banner) {
    banner.style.transition = 'transform .3s ease, opacity .3s ease';
    banner.style.transform = 'translateY(100%)';
    banner.style.opacity = '0';
    setTimeout(function() { banner.style.display = 'none'; }, 350);
  }
  /* The tour waited for this (initTutorial in tutorial.js). */
  if (window.__tutAfterConsent && typeof startTutorial === 'function') {
    window.__tutAfterConsent = false;
    setTimeout(startTutorial, 450);
  }
}
document.addEventListener('DOMContentLoaded', function() {
  try {
    var accepted = localStorage.getItem('rot_consent');
    if (!accepted) {
      var banner = document.getElementById('consent-banner');
      if (banner) banner.style.display = 'block';
    }
  } catch(e) {}
});

/* ── Install as an app (promptove/104) ─────────────────────────────
   Rotator is an installable web app (manifest.json + sw.js): installed,
   it opens in its own window from the desktop, taskbar or home screen,
   with no tab or address bar. Chrome and Edge (desktop and Android)
   offer their own install prompt, caught here as beforeinstallprompt;
   Safari and iOS never do, so installRotator() always opens a window
   with the steps for the browser in use, plus INSTALL NOW when the
   browser's own prompt is available. The buttons (topbar, MORE,
   Settings) are always shown, and hidden only once Rotator is running
   as an installed app. */
var _deferredInstallPrompt = null;

function _isInstalledApp() {
  return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
}
function _hideInstallButtons() {
  ['install-topbar-btn', 'pwa-install-btn', 'pwa-install-setting'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
}

window.addEventListener('beforeinstallprompt', function(e) {
  e.preventDefault();
  _deferredInstallPrompt = e;
  var now = document.getElementById('install-now-btn');
  if (now) now.style.display = '';
});
window.addEventListener('appinstalled', function() {
  _deferredInstallPrompt = null;
  _hideInstallButtons();
  closeModal('install-modal');
});

/* The browser in use. Its row of steps is copied to the top of the
   window; the rows are plain sentences in index.html so the Macedonian
   dictionary translates each one whole. */
function _installBrowser() {
  var ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  if (/Firefox\//.test(ua)) return 'firefox';
  if (/Edg\//.test(ua)) return 'edge';
  if (/Chrome\//.test(ua)) return 'chrome';
  if (/Safari\//.test(ua) && /Macintosh/.test(ua)) return 'safari';
  return '';
}

function installRotator() {
  if (window.Analytics) Analytics.track('Install Opened');
  if (typeof supaCountFeature === 'function') supaCountFeature('install_open');
  var here = document.getElementById('install-here');
  var row = document.querySelector('#install-modal .install-row[data-b="' + _installBrowser() + '"]');
  if (here) {
    here.innerHTML = '';
    if (row) here.appendChild(row.cloneNode(true));
    else here.textContent = 'Open your browser menu and look for Install or Add to Home Screen.';
  }
  var now = document.getElementById('install-now-btn');
  if (now) now.style.display = _deferredInstallPrompt ? '' : 'none';
  openModal('install-modal');
}

function installRotatorPrompt() {
  if (!_deferredInstallPrompt) return;
  _deferredInstallPrompt.prompt();
  _deferredInstallPrompt.userChoice.then(function(result) {
    _deferredInstallPrompt = null;
    var now = document.getElementById('install-now-btn');
    if (now) now.style.display = 'none';
    if (result && result.outcome === 'accepted') closeModal('install-modal');
  });
}

/* Kept for anything still calling the old name. */
function triggerPWAInstall() { installRotator(); }

if (_isInstalledApp()) {
  document.addEventListener('DOMContentLoaded', _hideInstallButtons);
  /* Opens from the installed app, once per session: the return-rate
     measure. count_feature() ignores names not on its list, so this and
     'install_open' count only once sql/feature_usage.sql allows them. */
  if (typeof supaCountFeature === 'function') supaCountFeature('app_open', true);
}

/* ── Picker patch removed — ratio.js now owns the full open/close/listener lifecycle ── */

/* ══════════════════════════════════════════════════════════════
   SECTION RAIL

   The page is one scroll now, not three columns. The rail is what
   tells you where you are in it and lets you jump — the job the
   three separate scrollbars used to do badly.

   Deliberately reads the DOM rather than taking a feed: every count
   below is already rendered by the time it runs, so the rail cannot
   disagree with the page it is describing. If a section is missing
   it is skipped, not guessed at.
══════════════════════════════════════════════════════════════ */
/* One scroll implementation for the whole page.
   Exposed because data-loaders.js's mobile nav needs the same thing and
   was using behavior:'smooth' directly — which does nothing at all in a
   hidden tab, under prefers-reduced-motion, or in several browsers. Two
   nav controls that scroll differently is one too many. */
/* The sticky bar's own height, measured. Two things need it and neither
   can hardcode it: the rail has to start below the bar rather than behind
   it (CSS, via --topbar-h), and a section scrolled to its exact top would
   otherwise sit under it (rotScrollToEl). The bar wraps to two rows on
   narrow widths, so it is measured on load and on resize. */
function rotTopbarH() {
  var bar = document.querySelector('header') || document.querySelector('.topbar');
  return bar ? Math.round(bar.getBoundingClientRect().height) : 0;
}
function rotSyncTopbarH() {
  document.documentElement.style.setProperty('--topbar-h', rotTopbarH() + 'px');
}
document.addEventListener('DOMContentLoaded', rotSyncTopbarH);
window.addEventListener('resize', rotSyncTopbarH);

function rotScrollToEl(el) {
  if (!el) return;

  var offset = rotTopbarH();
  var target = Math.round(el.getBoundingClientRect().top + window.scrollY) - offset - 4;

  var max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  target = Math.max(0, Math.min(target, max));

  /* Animated by hand rather than with behavior:'smooth'. Native smooth
     is a no-op in several environments — every headless browser I can
     test in, and for anyone with prefers-reduced-motion — and a nav
     control that silently does nothing is worse than one that jumps.
     This always moves, and honours the reduced-motion preference by
     jumping deliberately instead of by accident. */
  var start = window.scrollY;
  var dist = target - start;
  if (Math.abs(dist) < 2) return;

  /* Jump, do not animate, when animating is pointless or unwanted:
     reduced-motion, no rAF, or a hidden tab. That last one is not
     hypothetical — rAF is paused while document.hidden is true, so an
     animated scroll in a background tab never starts and the position
     silently never changes. */
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || !window.requestAnimationFrame || document.hidden) {
    window.scrollTo(0, target);
    return;
  }

  var DUR = Math.min(600, Math.max(240, Math.abs(dist) * 0.5));
  var t0 = null;
  function step(ts) {
    if (t0 === null) t0 = ts;
    var p = Math.min(1, (ts - t0) / DUR);
    /* easeInOutCubic — fast in the middle, settles at the end */
    var e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
    window.scrollTo(0, Math.round(start + dist * e));
    if (p < 1) window.requestAnimationFrame(step);
  }
  window.requestAnimationFrame(step);
}
window.rotScrollToEl = rotScrollToEl;

function railGo(secId) {
  rotScrollToEl(document.getElementById(secId));
}

(function initRail() {
  var rail = document.getElementById('rail');
  if (!rail) return;

  var items = Array.prototype.slice.call(rail.querySelectorAll('.rail-item'));
  if (!items.length) return;

  var sections = items.map(function(it) {
    return document.getElementById(it.dataset.sec);
  });

  /* The mobile bottom bar mirrors the rail (promptove/103). COINS and
     RECORD live in MORE, so MORE lights up while you read them. */
  var mobBtns = Array.prototype.slice.call(document.querySelectorAll('#mob-nav [data-sec]'));
  var mobMore = document.getElementById('mn-more');
  function setActive(id) {
    items.forEach(function(it) {
      var on = it.dataset.sec === id;
      it.classList.toggle('on', on);
      if (on) it.setAttribute('aria-current', 'true'); else it.removeAttribute('aria-current');
    });
    var hit = false;
    mobBtns.forEach(function(b) {
      var on = b.dataset.sec === id;
      if (on) hit = true;
      b.classList.toggle('active', on);
      if (on) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
    });
    if (mobMore) mobMore.classList.toggle('active', !hit && !!id);
  }

  /* RECORD is last and short (2026-09-29): it can never reach the top
     third of the screen, so at the foot of the page the last section is
     the one you are reading. */
  function atBottom() {
    return window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4;
  }
  var lastSec = items[items.length - 1].dataset.sec;
  window.addEventListener('scroll', function() {
    if (atBottom()) setActive(lastSec);
  }, { passive: true });

  /* Whichever section owns the top third of the viewport is the one you
     are reading. An observer rather than a scroll handler so it costs
     nothing while idle. */
  if ('IntersectionObserver' in window) {
    var seen = {};
    var obs = new IntersectionObserver(function(entries) {
      entries.forEach(function(e) { seen[e.target.id] = e.intersectionRatio; });
      var best = null, bestRatio = 0;
      sections.forEach(function(s) {
        if (!s) return;
        var r = seen[s.id] || 0;
        if (r > bestRatio) { bestRatio = r; best = s.id; }
      });
      if (atBottom()) setActive(lastSec);
      else if (best) setActive(best);
    }, { rootMargin: '-10% 0px -60% 0px', threshold: [0, 0.15, 0.4, 0.75, 1] });
    sections.forEach(function(s) { if (s) obs.observe(s); });
  }
  setActive(items[0].dataset.sec);

  /* Sub-labels carry live counts where the page already knows them.
     Read once the data has landed; silent when it has not. */
  function countsFromDom() {
    var out = {};
    var rows = document.querySelectorAll('#tbody tr');
    if (rows.length) out.coins = rows.length + ' ranked';

    /* Held and watched share one grid now, so counting `.tile` and calling
       the answer "holdings" would have reported twelve holdings to someone
       who owns nine. Two counts, named for what they are. */
    var all  = document.querySelectorAll('#tiles-grid .tile').length;
    var watch = document.querySelectorAll('#tiles-grid .tile-watch').length;
    var held = all - watch;
    if (all) {
      out.yours = held + ' held'
        + (watch ? ' · ' + watch + ' watched' : '');
    }

    /* Rotation Opportunities moved into YOURS, so this count no longer
       describes the MOMENTUM section at all. That section holds High
       Momentum and Worst 30d, and those are what it should count. */
    var mov = document.querySelectorAll(
      '#mom-cards .sig-tile:not(.sig-tile-empty):not(.pro-locked), '
      + '#worst-cards .sig-tile:not(.sig-tile-empty):not(.pro-locked)');
    if (mov.length) out.momentum = mov.length + ' listed';

    var from = document.getElementById('rt-from-card-lbl');
    var to = document.getElementById('rt-to-card-lbl');
    if (from && to && from.textContent && to.textContent) {
      out.swap = from.textContent.trim() + ' / ' + to.textContent.trim();
    }
    return out;
  }

  function refreshSubs() {
    var c = countsFromDom();
    Object.keys(c).forEach(function(k) {
      var el = document.getElementById('rail-sub-' + k);
      if (el && c[k]) el.textContent = c[k];
    });
  }
  window.railRefresh = refreshSubs;

  /* The page fills in over several async loads, so look a few times
     rather than once — cheap, bounded, and stops on its own. */
  var tries = 0;
  var iv = setInterval(function() {
    refreshSubs();
    if (++tries >= 12) clearInterval(iv);
  }, 1500);
})();

/* ── Picture zoom (promptove/104) ── the Pro pictures in the tutorial and
   the Pro window are small; a click shows them full size. */
function openImgZoom(img) {
  var z = document.getElementById('img-zoom'), zi = document.getElementById('img-zoom-img');
  if (!z || !zi || !img) return;
  zi.src = img.currentSrc || img.src;
  zi.alt = img.alt || '';
  z.classList.add('show');
}
function closeImgZoom() {
  var z = document.getElementById('img-zoom');
  if (z) z.classList.remove('show');
}
document.addEventListener('keydown', function(e) { if (e.key === 'Escape') closeImgZoom(); });

/* ── Info tips (promptove/107) ───────────────────────────────────
   <button type="button" class="info-i" aria-label="One short sentence">ⓘ</button>
   The text lives in aria-label, so a screen reader reads it and the
   Macedonian layer translates it like any other attribute. Hover shows
   it on a mouse; a tap or Enter shows it on a phone or keyboard, where a
   title= tooltip never appears. One popover for the whole page. */
(function () {
  var pop = null, cur = null, pinned = false;  /* pinned: opened by a click, not a hover */
  function hide() { if (pop) pop.style.display = 'none'; cur = null; pinned = false; }
  function show(btn) {
    if (!pop) {
      pop = document.createElement('div');
      pop.className = 'info-pop';
      pop.setAttribute('role', 'tooltip');
      document.body.appendChild(pop);
    }
    cur = btn;
    pop.textContent = btn.getAttribute('aria-label') || '';
    pop.style.display = 'block';
    var r = btn.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
    var vw = document.documentElement.clientWidth, vh = window.innerHeight;
    var x = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, vw - w - 8));
    var y = r.bottom + 6;
    if (y + h > vh - 8) y = Math.max(8, r.top - h - 6);
    pop.style.left = x + 'px';
    pop.style.top = y + 'px';
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.info-i');
    if (b) {
      /* Inside a fold header or a sortable column: the tip must not also
         open the section or re-sort the list. */
      e.preventDefault(); e.stopPropagation();
      if (cur === b && pinned) { hide(); return; }
      show(b); pinned = true;
      return;
    }
    if (cur) hide();
  }, true);
  document.addEventListener('mouseover', function (e) {
    var b = e.target.closest && e.target.closest('.info-i');
    if (b && b !== cur && !pinned && window.matchMedia('(hover:hover)').matches) show(b);
  });
  document.addEventListener('mouseout', function (e) {
    var b = e.target.closest && e.target.closest('.info-i');
    if (b && b === cur && !pinned && !b.contains(e.relatedTarget)) hide();
  });
  document.addEventListener('focusout', function (e) {
    if (cur && e.target === cur) hide();
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') hide(); });
  window.addEventListener('scroll', function () { if (cur) hide(); }, true);
  window.addEventListener('resize', hide);
})();

/* ── Animations off (promptove/107) ── a Pro setting. Stored in
   rot_anim_off; it takes effect only while Pro is active, so a lapsed
   or revoked Pro simply gets the animations back. */
function applyAnimPref() {
  var off = false;
  try { off = localStorage.getItem('rot_anim_off') === '1'; } catch (e) {}
  var pro = (typeof isPro !== 'undefined') && !!isPro;
  document.documentElement.classList.toggle('no-anim', pro && off);
  var row = document.getElementById('anim-setting');
  var box = document.getElementById('anim-toggle');
  var tag = document.getElementById('anim-pro-tag');
  if (row) row.classList.toggle('pro-locked-row', !pro);
  if (tag) tag.style.display = pro ? 'none' : '';
  if (box) { box.checked = !(pro && off); box.disabled = !pro; }
}
function setAnimOn(on) {
  if (typeof isPro === 'undefined' || !isPro) { applyAnimPref(); return; }
  try { localStorage.setItem('rot_anim_off', on ? '0' : '1'); } catch (e) {}
  applyAnimPref();
}
function animRowClick(e) {
  if (typeof isPro !== 'undefined' && isPro) return;
  e.preventDefault();
  if (typeof closeSettingsPanel === 'function') closeSettingsPanel();
  if (typeof openPro === 'function') openPro();
}
applyAnimPref();
document.addEventListener('DOMContentLoaded', applyAnimPref);
