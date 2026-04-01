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

(function initNavToggle() {
  // Track which nav section is currently open
  var _activeNavSection = null;

  // Map each button id to its section key
  var NAV_MAP = {
    'mn-signal':   'signal',
    'mn-hot':      'hot',
    'mn-swap':     'swap',
    'mn-holdings': 'holdings'
  };

  function closeActiveSection() {
    if (!_activeNavSection) return;
    // Collapse the open section
    var bodyId = 'cb-' + _activeNavSection;
    var body = document.getElementById(bodyId);
    var hdr  = document.getElementById('ch-' + _activeNavSection);
    if (body) {
      body.style.maxHeight = body.scrollHeight + 'px';
      body.offsetHeight;
      body.style.maxHeight = '0';
      body.style.opacity   = '0';
      if (hdr) hdr.classList.remove('open');
      setTimeout(function() { body.classList.add('collapsed'); }, 320);
      // save state
      try {
        var state = JSON.parse(localStorage.getItem('rot_collapse') || '{}');
        state[_activeNavSection] = 'closed';
        localStorage.setItem('rot_collapse', JSON.stringify(state));
      } catch(e) {}
    }
    // For swap — hide the swap picker panel too
    if (_activeNavSection === 'swap') {
      var picker = document.getElementById('rt-picker-panel');
      if (picker) picker.style.display = 'none';
    }
    // Remove active class from button
    var btn = document.getElementById('mn-' + _activeNavSection);
    if (btn) btn.classList.remove('active');
    _activeNavSection = null;
  }

  // Wrap each nav button: second tap = close
  function wrapNavBtn(btnId, sectionKey, originalFn) {
    var btn = document.getElementById(btnId);
    if (!btn) return;
    btn.onclick = function(e) {
      e.stopPropagation();
      if (_activeNavSection === sectionKey) {
        // Second press — close
        closeActiveSection();
        return;
      }
      // First press — close whatever is open, then open this
      if (_activeNavSection && _activeNavSection !== sectionKey) {
        closeActiveSection();
      }
      _activeNavSection = sectionKey;
      btn.classList.add('active');
      if (typeof originalFn === 'function') originalFn();
    };
  }

  // Wire up after external JS loads (deferred scripts run in order)
  window.addEventListener('load', function() {
    setTimeout(function() {
      wrapNavBtn('mn-signal',   'signal',   window.mobNavSignal);
      wrapNavBtn('mn-hot',      'hot',      window.mobNavHot);
      wrapNavBtn('mn-holdings', 'holdings', window.mobNavHoldings);

      // SWAP FAB: toggle the swap collapse section
      var swapFab = document.getElementById('mn-swap');
      if (swapFab) {
        swapFab.onclick = function(e) {
          e.stopPropagation();
          if (_activeNavSection === 'swap') {
            closeActiveSection();
            return;
          }
          if (_activeNavSection) closeActiveSection();
          _activeNavSection = 'swap';
          swapFab.classList.add('active');
          if (typeof window.mobNavSwap === 'function') window.mobNavSwap();
        };
      }
    }, 500);
  });
})();
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
    var ids = ['hot', 'swap', 'promo', 'support', 'holdings'];
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
(function patchMobHoldings() {
  var _origMobNavHoldings = window.mobNavHoldings;
  window.mobNavHoldings = function() {
    _origMobNavHoldings();
    var panel = document.getElementById('mob-holdings-panel');
    if (!panel || !panel.classList.contains('open')) return;

    /* Re-wire ADD button to read from cloned inputs inside the panel */
    var addBtn = panel.querySelector('.add-btn');
    if (addBtn) {
      addBtn.onclick = function() {
        var selEl  = panel.querySelector('select');
        var qtyEl  = panel.querySelector('#inp-qty, [id$="-qty"], input[placeholder="amount"]');
        var avgEl  = panel.querySelector('#inp-avg, [id$="-avg"], input[placeholder="avg buy price"]');
        var sym = selEl  ? selEl.value : '';
        var qty = qtyEl  ? parseFloat(qtyEl.value) || null : null;
        var avg = avgEl  ? parseFloat(avgEl.value) || null : null;
        if (!sym) return;

        /* Sync values into the original (desktop) inputs so addHolding() works */
        var dSel = document.getElementById('coin-sel');
        var dQty = document.getElementById('inp-qty');
        var dAvg = document.getElementById('inp-avg');
        if (dSel) dSel.value = sym;
        if (dQty) dQty.value = qty !== null ? qty : '';
        if (dAvg) dAvg.value = avg !== null ? avg : '';

        addHolding();

        /* Clear mobile inputs */
        if (selEl) selEl.value = '';
        if (qtyEl) qtyEl.value = '';
        if (avgEl) avgEl.value = '';
      };
    }
  };
})();

/* ════════════════════════════════════════════════════════════════
   NEW FEATURES JS
   - Left panel dual tabs (My Holdings / Watchlist)
   - Add Holdings Modal (coin search + inputs)
   - Swap Tool Tutorial
   ════════════════════════════════════════════════════════════════ */

/* ── Holdings view tab toggle ───────────────────────────────── */
var _holdingsView = 'my';
function switchHoldingsView(view) {
  _holdingsView = view;
  document.getElementById('hvtab-my').classList.toggle('active', view === 'my');
  var wTab = document.getElementById('hvtab-watch');
  wTab.classList.toggle('active', view === 'watch');
  document.getElementById('my-holdings-panel').style.display = view === 'my' ? 'flex' : 'none';
  document.getElementById('watchlist-panel').style.display   = view === 'watch' ? 'flex' : 'none';
}


/* ── Watchlist state ─────────────────────────────────────────── */
var watchlist = [];
try { watchlist = JSON.parse(localStorage.getItem('rot_watchlist') || '[]'); } catch(e) {}
function saveWatchlist() { try { localStorage.setItem('rot_watchlist', JSON.stringify(watchlist)); } catch(e) {} }
function renderWatchlist() {
  var grid = document.getElementById('watchlist-grid');
  if (!grid) return;
  if (!watchlist.length) {
    grid.innerHTML = '<div class="watchlist-placeholder">Click + to add coins to your watchlist.<br>Compare them in the swap tool →</div>';
    return;
  }
  var c = typeof coins !== 'undefined' ? coins : [];
  var html = watchlist.map(function(sym) {
    var coin = c.find(function(x) { return x.sym === sym; });
    if (!coin) return '<div class="tile-placeholder" title="' + sym + ' (loading…)"><div class="ph-plus">' + sym + '</div><div class="ph-lbl">Loading</div></div>';
    var glw = coin.score >= 65 ? 'glow-g' : coin.score >= 40 ? 'glow-a' : 'glow-r';
    return '<div class="tile ' + glw + '" style="cursor:pointer;" onclick="openTileDetail(\'' + coin.id + '\',event)" title="' + coin.name + '">'
      + '<div class="tile-top"><div class="tile-ico"><img src="' + coin.image + '" onerror="this.style.display=\'none\'"></div>'
      + '<span class="tile-sym">' + coin.sym + '</span>'
      + '<button class="tile-rm" onclick="event.stopPropagation();removeFromWatchlist(\'' + sym + '\')">×</button></div>'
      + '<div class="tile-price">' + (typeof fmtP !== 'undefined' ? fmtP(coin.price) : '$'+coin.price) + '</div>'
      + '<div class="tile-perfs">'
        + '<div class="tpf"><span class="tpf-l">24H</span><span class="tpf-v ' + (coin.p24>=0?'up':'dn') + '">' + (coin.p24>=0?'+':'') + coin.p24.toFixed(1) + '%</span></div>'
        + '<div class="tpf"><span class="tpf-l">7D</span><span class="tpf-v '  + (coin.p7>=0?'up':'dn')  + '">' + (coin.p7>=0?'+':'')  + coin.p7.toFixed(1)  + '%</span></div>'
      + '</div>'
      + '<div class="tile-foot"><span></span><span class="tile-scr ' + (coin.score>=65?'hi':coin.score>=40?'md':'lo') + '">' + coin.score + '</span></div>'
      + '</div>';
  }).join('');
  grid.innerHTML = html;
}
function removeFromWatchlist(sym) {
  watchlist = watchlist.filter(function(s) { return s !== sym; });
  saveWatchlist(); renderWatchlist();
}
function openAddWatchlistModal() { openAddHoldingsModal('watchlist'); }

/* ── Add Holdings Modal ──────────────────────────────────────── */
var _ahmMode = 'holdings'; // 'holdings' or 'watchlist'
var _ahmSelected = null;

function openAddHoldingsModal(mode) {
  _ahmMode = mode || 'holdings';
  _ahmSelected = null;
  document.getElementById('ahm-search').value = '';
  document.getElementById('ahm-qty').value = '';
  document.getElementById('ahm-avg').value = '';
  document.getElementById('ahm-confirm-btn').disabled = true;
  document.getElementById('ahm-confirm-btn').textContent = _ahmMode === 'watchlist' ? '+ ADD TO WATCHLIST' : '+ ADD TO HOLDINGS';
  document.querySelector('#add-holdings-modal .modal-title').textContent = _ahmMode === 'watchlist' ? '+ Add to Watchlist' : '+ Add to Holdings';
  // Show/hide price inputs for watchlist mode
  var inputs = document.querySelector('.ahm-inputs');
  inputs.style.display = _ahmMode === 'watchlist' ? 'none' : '';
  ahmFilter();
  document.querySelector('#add-holdings-modal .modal-sub').textContent = _ahmMode === 'watchlist'
    ? 'Track coins without committing capital. Use the Swap Tool to find best swap timing.'
    : 'Search and select a coin, then enter quantity and average buy price.';
  document.getElementById('ahm-selected-info').classList.remove('show');
  openModal('add-holdings-modal');
  /* Re-filter after a tick so coins array is guaranteed to be populated */
  setTimeout(ahmFilter, 60);
}

function ahmFilter() {
  var q = (document.getElementById('ahm-search').value || '').toLowerCase().trim();
  var c = (typeof coins !== 'undefined' && Array.isArray(coins)) ? coins : [];
  var listEl = document.getElementById('ahm-coin-list');
  if (!listEl) return;
  if (!c.length) {
    listEl.innerHTML = '<div style="padding:14px;font-size:11px;color:var(--muted);text-align:center;line-height:2;">⟳ Loading coin data…<br><span style="font-size:10px;opacity:.6;">Open the app first to fetch prices, then re-open this modal.</span></div>';
    return;
  }
  var filtered = q
    ? c.filter(function(x) { return x.sym.toLowerCase().includes(q) || (x.name||'').toLowerCase().includes(q); })
    : c.slice(0, 50);
  var html = filtered.slice(0, 50).map(function(coin) {
    var sel = _ahmSelected && _ahmSelected.sym === coin.sym;
    var p24c = coin.p24 >= 0 ? '#00bd8e' : '#f03e58';
    return '<div class="ahm-coin-item' + (sel ? ' selected' : '') + '" onclick="ahmSelect(\'' + coin.id + '\')">'
      + '<div class="ahm-coin-ico"><img src="' + coin.image + '" onerror="this.style.display=\'none\'"></div>'
      + '<div style="flex:1;min-width:0;">'
        + '<div class="ahm-coin-name">' + coin.sym + ' <span style="font-weight:400;color:var(--muted);font-size:9px;">' + (coin.name||'') + '</span></div>'
        + '<div class="ahm-coin-sub">$' + (coin.price ? (coin.price >= 1 ? coin.price.toFixed(2) : coin.price.toFixed(5)) : '—')
          + ' &nbsp;<span style="color:' + p24c + '">' + (coin.p24 >= 0 ? '+' : '') + (coin.p24||0).toFixed(1) + '% 24h</span></div>'
      + '</div>'
      + (sel ? '<span style="color:var(--bnb);font-size:12px;">✓</span>' : '')
      + '</div>';
  }).join('');
  listEl.innerHTML = html || '<div style="padding:10px;font-size:11px;color:var(--muted);text-align:center;">No coins found for "' + q + '"</div>';
}

function ahmSelect(coinId) {
  var c = typeof coins !== 'undefined' ? coins : [];
  _ahmSelected = c.find(function(x) { return x.id === coinId; });
  if (!_ahmSelected) return;
  var info = document.getElementById('ahm-selected-info');
  info.textContent = 'Selected: ' + _ahmSelected.sym + ' · Current price: $' + (_ahmSelected.price ? _ahmSelected.price.toFixed(2) : '—');
  info.classList.add('show');
  document.getElementById('ahm-confirm-btn').disabled = false;
  // Update coin-sel hidden select for legacy addHolding()
  var sel = document.getElementById('coin-sel');
  if (sel) { sel.innerHTML = '<option value="' + _ahmSelected.sym + '">' + _ahmSelected.sym + '</option>'; sel.value = _ahmSelected.sym; }
  ahmFilter(); // re-render to show selection
}

function ahmConfirm() {
  if (!_ahmSelected) return;
  if (_ahmMode === 'watchlist') {
    if (!watchlist.includes(_ahmSelected.sym)) { watchlist.push(_ahmSelected.sym); saveWatchlist(); }
    closeModal('add-holdings-modal');
    renderWatchlist();
    switchHoldingsView('watch');
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
var SWAP_TUT_STEPS = [
  {
    title: 'Swap Tool — Price Ratio Tracker',
    desc: 'This tool helps you find the <strong>best moment to swap</strong> one asset for another — not by guessing, but by tracking the live price ratio between them over time.',
    anchor: 'ratio-section'
  },
  {
    title: 'Pick Your Pair',
    desc: 'Select the coin you <strong>HOLD</strong> (FROM) and the coin you <strong>WANT</strong> (TO). The ratio shows how many TO coins you\'d receive per 1 FROM coin at current prices.',
    anchor: 'rt-from'
  },
  {
    title: 'Read the Ratio Chart',
    desc: 'The range bar shows the ratio over your chosen timeframe. <strong>▲ Peak</strong> = the best swap moment. When current ratio is near the peak, you get more value for your swap.',
    anchor: 'rt-bar-track'
  },
  {
    title: 'Swap Calculator',
    desc: 'Enter your amount to see exactly how much you\'d receive. Override prices manually for hypothetical scenarios. Always verify on your exchange before executing — prices shift fast.',
    anchor: 'rt-calc'
  }
];
var _swapTutStep = 0;
var _swapTutHighlighted = null;

function startSwapTut() {
  _swapTutStep = 0;
  swapTutRender();
  document.getElementById('swap-tut-overlay').classList.add('show');
}
function endSwapTut() {
  document.getElementById('swap-tut-overlay').classList.remove('show');
  if (_swapTutHighlighted) { _swapTutHighlighted.classList.remove('swap-tut-highlight'); _swapTutHighlighted = null; }
  try { localStorage.setItem('rot_swap_tut', 'done'); } catch(e) {}
}
function swapTutNext() {
  _swapTutStep++;
  if (_swapTutStep >= SWAP_TUT_STEPS.length) { endSwapTut(); return; }
  swapTutRender();
}
function swapTutRender() {
  var step = SWAP_TUT_STEPS[_swapTutStep];
  document.getElementById('swap-tut-step-lbl').textContent = 'STEP ' + (_swapTutStep+1) + ' OF ' + SWAP_TUT_STEPS.length;
  document.getElementById('swap-tut-title').textContent = step.title;
  document.getElementById('swap-tut-desc').innerHTML = step.desc;
  var nextBtn = document.getElementById('swap-tut-next');
  nextBtn.textContent = _swapTutStep === SWAP_TUT_STEPS.length - 1 ? 'Got it ✓' : 'Next →';
  // dots
  var dots = '';
  for (var i = 0; i < SWAP_TUT_STEPS.length; i++) dots += '<div class="swap-tut-dot' + (i===_swapTutStep?' active':'') + '"></div>';
  document.getElementById('swap-tut-dots').innerHTML = dots;
  // highlight anchor element and position box
  if (_swapTutHighlighted) _swapTutHighlighted.classList.remove('swap-tut-highlight');
  var anchor = step.anchor ? document.getElementById(step.anchor) : null;
  if (anchor) {
    anchor.classList.add('swap-tut-highlight');
    _swapTutHighlighted = anchor;
    var r = anchor.getBoundingClientRect();
    var box = document.getElementById('swap-tut-box');
    var bw = 280, bh = 200;
    var left = r.left - bw - 12;
    var top  = r.top + 8;
    if (left < 8) left = r.right + 12;
    if (top + bh > window.innerHeight - 8) top = window.innerHeight - bh - 8;
    box.style.left = Math.max(8, left) + 'px';
    box.style.top  = Math.max(8, top)  + 'px';
    // update arrow direction
    box.style.setProperty('--arr', left < r.left ? 'right' : 'left');
  }
}

// Auto-show swap tut on first visit to swap tool area
document.addEventListener('DOMContentLoaded', function() {
  setTimeout(function() {
    try { if (!localStorage.getItem('rot_swap_tut')) {
      var ratioSec = document.getElementById('ratio-section');
      if (ratioSec) {
        var obs = new IntersectionObserver(function(entries) {
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
      btn.style.cssText = 'margin-left:auto;font-size:9px;padding:2px 8px;';
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
    + '<img class="tsri-ico" src="'+(coin.image||'')+'" alt="" onerror="this.style.opacity='0'">'
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
  /* Load coin into swap ratio tracker */
  if (typeof RatioTracker !== 'undefined') {
    var fSel = document.getElementById('rt-from');
    if (fSel && fSel.querySelector('option[value="'+coinId+'"]')) {
      fSel.value = coinId;
      RatioTracker.onFromChange();
    }
  }
  /* Scroll to swap section */
  var sec = document.getElementById('ratio-section');
  if (sec) sec.scrollIntoView({behavior:'smooth', block:'start'});
  toggleTopbarSearch(false);
  toggleMobSearch(false);
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

/* ── Picker: show/hide inline panel, set internal mode, populate list ── */
document.addEventListener('DOMContentLoaded', function() {
  function patchPicker2() {
    if (typeof RatioTracker === 'undefined' || !RatioTracker._openPicker) {
      return setTimeout(patchPicker2, 100);
    }

    var orig_open   = RatioTracker._openPicker;
    var orig_close  = RatioTracker._closePicker;

    RatioTracker._openPicker = function(mode) {
      /* Call original — this sets _pickerMode in ratio.js closure and populates rt-picker-list */
      orig_open.call(this, mode);

      /* Now show OUR inline panel (original may have shown rt-picker-panel but we restyled it as inline) */
      var panel = document.getElementById('rt-picker-panel');
      var title = document.getElementById('rt-picker-title');
      var inp   = document.getElementById('rt-picker-search');
      if (panel) {
        panel.style.display = 'flex';
        /* Scroll panel into view smoothly */
        panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
      if (title) title.textContent = (mode === 'from' ? 'FROM' : 'TO');
      if (inp)   setTimeout(function(){ inp.focus(); }, 60);
    };

    RatioTracker._closePicker = function() {
      orig_close.call(this);
      var panel = document.getElementById('rt-picker-panel');
      if (panel) panel.style.display = 'none';
    };
  }
  patchPicker2();
});