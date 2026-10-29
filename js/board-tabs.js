/* Board tabs (Daniel, 2026-10-29, promptove/168; look agreed on
   nav-preview.html). The board is one page; five big buttons in the top
   bar show one part of it at a time, and the left rail lists that part's
   pieces. Phones: the bottom bar holds the tabs and a pill row under the
   top bar holds the pieces.

     TODAY        news and the big picture        sec-today
     MONEY FLOWS  capital rotation, ETF, unlocks  sec-capital
     COINS        momentum, the table, record     sec-rotation, sec-coins, sec-record
     DERIVATIVES  liquidations                    sec-liq
     MY HOLDINGS  portfolio tracker, alerts, Rotator Tool  sec-yours, sec-swap

   Addresses: #today, #flows-etf, #mine-tool ... Back works. The old
   #sec-xxx links (landing page, Telegram, posts) still land on their
   section, and mobGo()/railGo()/rotScrollToEl() switch tab first, so
   every older "go to the Rotator Tool" button keeps working.
   The old rail items stay in the page (initRail reads them) but hidden. */
(function () {
  var IC = {
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    bars: '<path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/>', globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    rot: '<circle cx="6" cy="12" r="3"/><circle cx="18" cy="12" r="3"/><path d="M9 12h6"/>', etf: '<path d="M3 21h18M5 21V10l7-5 7 5v11M9 21v-6h6v6"/>',
    chain: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>', cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    fire: '<path d="M12 3c3 4 6 6 6 10a6 6 0 0 1-12 0c0-3 2-4 3-7 1 2 2 3 3 3 0-2 0-4 0-6z"/>', up: '<path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/>',
    down: '<path d="M3 7l6 6 4-4 8 8"/><path d="M14 17h7v-7"/>', turn: '<path d="M17 2.1 21 6l-4 3.9"/><path d="M3 12a9 9 0 0 1 9-9h9"/><path d="M7 21.9 3 18l4-3.9"/><path d="M21 12a9 9 0 0 1-9 9H3"/>',
    list: '<path d="M3 6h18M3 12h18M3 18h18"/>', cross: '<path d="M3 17c5 0 6-10 18-10"/><path d="M3 7c6 0 8 10 18 10"/>', clock: '<path d="M12 8v4l3 2"/><circle cx="12" cy="12" r="9"/>',
    bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z"/>', pct: '<path d="M19 5 5 19"/><circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="17" r="2.5"/>',
    wallet: '<path d="M20 7h-9"/><path d="M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/>', bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21a2 2 0 0 0 4 0"/>',
    sig: '<path d="M2 12h4l3-8 4 16 3-8h6"/>', chart: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 6-7"/>', what: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.7M12 17h.01"/>',
    swap: '<path d="M7 16V4m0 0L4 7m3-3 3 3"/><path d="M17 8v12m0 0 3-3m-3 3-3-3"/>', target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    book: '<path d="M4 4h6a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4zM20 4h-6a3 3 0 0 0-3 3"/><path d="M20 4v14h-7"/>', cup: '<path d="M17 8h1a4 4 0 0 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z"/><path d="M6 2v3M10 2v3M14 2v3"/>',
    play: '<circle cx="12" cy="12" r="9"/><path d="M10 8l6 4-6 4z"/>', log: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>', help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.7M12 17h.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>', video: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3"/>'
  };
  function ic(k) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + IC[k] + '</svg>'; }

  /* Each piece: k = its address word, el = the board element it scrolls to. */
  var TABS = [
    { id: 'today', lead: 'The day in one look: the market, sentiment, and the macro behind it.', name: 'Today', icon: 'sun', mob: 'TODAY', secs: ['sec-today'], items: [
      { k: 'look', el: 'day-brief', n: 'Today in one look', i: 'sun' },
      { k: 'now', el: 'mkt-now', n: 'Market now', i: 'bars' },
      { k: 'cards', el: 'briefing', n: 'Daily news', i: 'globe' }
    ], pages: [['https://rotatortool.substack.com/', 'Rotator Weekly (Substack)', 'cal']] },
    { id: 'flows', lead: 'Where money moved: what came in, what left, and supply about to reach the market.', name: 'Money flows', icon: 'rot', mob: 'FLOWS', secs: ['sec-capital'], items: [
      { k: 'rotation', el: 'sec-capital', n: 'Capital rotation', i: 'rot', g: 'Coming in, going out' },
      { k: 'etf', el: 'etf-strip', n: 'ETF flows', i: 'etf', g: 'Coming in, going out' },
      { k: 'stables', el: 'cf-strip', n: 'Stablecoins by chain', i: 'chain', g: 'Coming in, going out' },
      { k: 'unlocks', el: 'ul-strip', n: 'Token unlocks', i: 'lock', g: 'Supply pressure' }
    ], pages: [['bitcoin-etf-flows.html', 'Bitcoin ETF page', 'etf'], ['token-unlocks.html', 'Unlocks calendar', 'cal']] },
    { id: 'coins', lead: 'Every tracked coin: who leads, who may be turning, and the full table.', name: 'Coins', icon: 'list', mob: 'COINS', secs: ['sec-rotation', 'sec-coins', 'sec-record'], items: [
      { k: 'turns', el: 'turn-scan', n: 'Turn signs', i: 'turn', g: 'Movers' },
      { k: 'hot', el: 'ch-hot', n: "What's hot", i: 'fire', g: 'Movers' },
      { k: 'best', el: 'mom-cards', n: 'Momentum: best', i: 'up', g: 'Movers' },
      { k: 'worst', el: 'worst-cards', n: 'Momentum: worst', i: 'down', g: 'Movers' },
      { k: 'all', el: 'sec-coins', n: 'All coins', i: 'list', g: 'Lists' },
      { k: 'record', el: 'sec-record', n: 'Record', i: 'clock', g: 'Lists' }
    ], pages: [['golden-cross.html', 'Golden & death cross', 'cross']] },
    { id: 'deriv', lead: 'Futures traders: who got forced out of their positions, and when.', name: 'Derivatives', icon: 'bolt', mob: 'DERIV', secs: ['sec-liq'], items: [
      { k: 'liq', el: 'sec-liq', n: 'Liquidations', i: 'bolt', g: 'Market' },
      { k: 'percoin', el: 'sec-coins', tab: 'coins', n: 'Funding & positioning', i: 'pct', g: 'Per coin', pro: 1, l: 'Open any coin' }
    ] },
    { id: 'mine', lead: 'What you hold and watch, with the warnings and tools that follow your coins.', name: 'My holdings', title: 'Portfolio tracker', icon: 'wallet', mob: 'HOLDINGS', mine: 1, secs: ['sec-yours', 'sec-swap'], items: [
      { k: 'alerts', el: 'coin-alerts', n: 'Alerts for your coins', i: 'bell', g: 'Portfolio' },
      { k: 'signal', el: 'sig-box-crypto', n: 'Portfolio Signal', i: 'sig', g: 'Portfolio' },
      { k: 'holdings', el: 'my-holdings-panel', n: 'Holdings & watchlist', i: 'wallet', g: 'Portfolio' },
      { k: 'chart', el: 'hold-chart', n: 'Your coins on one chart', i: 'chart', g: 'Portfolio' },
      { k: 'whatif', el: 'paper-trades', n: 'What-if trades', i: 'what', g: 'Portfolio' },
      { k: 'opps', el: 'rot-beside', n: 'Rotation opportunities', i: 'target', g: 'Tools' },
      { k: 'tool', el: 'sec-swap', n: 'Rotator Tool', i: 'swap', g: 'Tools' }
    ] }
  ];
  var LEARN = [
    ['how', 'How it works', 'help', "openModal('how-modal')"], ['score', 'How the score works', 'book', 'how-the-score-works.html'],
    ['record', 'Track record', 'clock', 'track-record.html'], ['log', 'Engine changelog', 'log', 'engine-changelog.html'],
    ['tour', 'Tour', 'play', 'tour.html'], ['faq', 'FAQ', 'help', "openModal('faq-modal')"], ['about', 'About Rotator', 'info', "openModal('about-modal')"],
    ['gem', 'Gemidzija videos', 'video', 'https://cryptogemidzija.mk/academy.html']
  ];

  var $ = function (id) { return document.getElementById(id); };
  var byId = {}, secTab = {};
  TABS.forEach(function (t) { byId[t.id] = t; t.secs.forEach(function (s) { secTab[s] = t.id; }); });
  var rail = $('rail'), page = $('page');
  if (!rail || !page || !$('sec-today')) return;
  document.body.classList.add('has-tabs');
  TABS.forEach(function (t) { t.secs.forEach(function (s) { var el = $(s); if (el) el.setAttribute('data-tab', t.id); }); });

  /* ── Top bar: the five big buttons, and Learn + Support beside the icons ── */
  var left = document.querySelector('.topbar-desktop-left');
  var bar = document.createElement('nav'); bar.className = 'btabs'; bar.id = 'btabs'; bar.setAttribute('aria-label', 'Board');
  bar.innerHTML = TABS.map(function (t) {
    return '<a class="btab' + (t.mine ? ' btab-mine' : '') + '" href="#' + t.id + '" data-tab="' + t.id + '">' + ic(t.icon) + '<span>' + t.name + '</span></a>';
  }).join('');
  if (left) left.parentNode.insertBefore(bar, left.nextSibling);
  var right = document.querySelector('.topbar-r'), gear = right && right.querySelector('.settings-btn');
  if (right) {
    var learn = document.createElement('div'); learn.className = 'tb-dropdown-wrap bt-learn';
    learn.innerHTML = '<button class="tb-icon-btn" type="button" title="Learn" aria-label="Learn" aria-expanded="false">' + ic('book') + '</button>'
      + '<div class="bt-slide" role="dialog" aria-label="Learn"><div class="bt-slide-h">Learn</div>' + LEARN.map(function (l) {
        var js = l[3].indexOf('(') > 0, ext = /^https?:/.test(l[3]);
        return '<a class="bt-slide-it" href="' + (js ? '#' : l[3]) + '"' + (js ? ' data-run="' + l[3] + '"' : '') + (ext ? ' target="_blank" rel="noopener"' : '') + '>' + ic(l[2]) + '<span>' + l[1] + '</span></a>';
      }).join('') + '</div>';
    var sup = document.createElement('div'); sup.className = 'tb-dropdown-wrap';
    sup.innerHTML = '<button class="tb-icon-btn" type="button" title="Support Rotator" aria-label="Support Rotator" onclick="openModal(\'donate-modal\')">' + ic('cup') + '</button>';
    var at = gear || null;
    right.insertBefore(learn, at); right.insertBefore(sup, at);
    var lb = learn.firstChild;
    lb.addEventListener('click', function (e) { e.stopPropagation(); var o = learn.classList.toggle('open'); lb.setAttribute('aria-expanded', o ? 'true' : 'false'); });
    learn.addEventListener('click', function (e) {
      var a = e.target.closest('[data-run]'); if (!a) return;
      e.preventDefault(); learn.classList.remove('open');
      try { (new Function(a.getAttribute('data-run')))(); } catch (x) {}
    });
    document.addEventListener('click', function (e) { if (!learn.contains(e.target)) learn.classList.remove('open'); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') learn.classList.remove('open'); });
  }

  /* ── The rail list and the phone pill row ── */
  var list = document.createElement('div'); list.className = 'tr-list'; list.id = 'tr-list';
  rail.insertBefore(list, rail.firstChild);   /* HOME keeps its place at the foot */
  var pills = document.createElement('div'); pills.className = 'tab-pills'; pills.id = 'tab-pills';
  page.insertBefore(pills, page.firstChild);
  /* The page title, as in Wispr Flow's Insights (Daniel, 2026-10-29). */
  var head = document.createElement('div'); head.className = 'tab-head'; head.id = 'tab-head';
  page.insertBefore(head, pills.nextSibling);
  /* The pill row sticks right under the top bar, whatever its height. */
  function tbH() { var tb = document.querySelector('.topbar'); document.documentElement.style.setProperty('--tb-h', (tb ? tb.offsetHeight : 52) + 'px'); }
  tbH(); window.addEventListener('resize', tbH);

  function itemHref(t, it) { return '#' + t.id + '-' + it.k; }
  function renderTab(t) {
    var g = null;
    list.innerHTML = '<div class="tr-h">' + ic(t.icon) + t.name + '</div>' + t.items.map(function (it) {
      var head = it.g && it.g !== g ? '<div class="tr-sep">' + it.g + '</div>' : ''; g = it.g;
      return head + '<a class="tr-it" href="' + itemHref(t, it) + '" data-k="' + it.k + '">' + ic(it.i) + '<span>' + it.n + (it.l ? '<small>' + it.l + '</small>' : '') + '</span>'
        + (it.pro ? '<em class="tr-pro">PRO</em>' : '') + '</a>';
    }).join('') + (t.pages ? '<div class="tr-sep">Full pages</div>' + t.pages.map(function (p) {
      return '<a class="tr-it" href="' + p[0] + '"' + (/^https?:/.test(p[0]) ? ' target="_blank" rel="noopener"' : '') + '>' + ic(p[2]) + '<span>' + p[1] + ' ↗</span></a>';
    }).join('') : '');
    head.innerHTML = '<h1>' + (t.title || t.name) + '</h1><p>' + t.lead + '</p>';
    pills.innerHTML = t.items.map(function (it) { return '<a href="' + itemHref(t, it) + '" data-k="' + it.k + '">' + it.n + '</a>'; }).join('');
    list.classList.remove('tr-in'); void list.offsetWidth; list.classList.add('tr-in');
  }

  /* ── Switching ── */
  var cur = null;
  function setTab(id) {
    var t = byId[id] || byId.today;
    if (cur === t.id) return false;
    cur = t.id;
    document.body.setAttribute('data-tab', t.id);
    document.querySelectorAll('.rsec[data-tab]').forEach(function (s) { s.classList.toggle('tab-off', s.getAttribute('data-tab') !== t.id); });
    document.querySelectorAll('.btab, #mob-nav [data-tab]').forEach(function (b) {
      var on = b.getAttribute('data-tab') === t.id;
      b.classList.toggle('on', on); b.classList.toggle('active', on);
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    renderTab(t);
    try { localStorage.setItem('rot_tab', t.id); } catch (x) {}
    if (t.id === 'mine' && typeof RatioTracker !== 'undefined' && RatioTracker.loadAll) { try { RatioTracker.loadAll(); } catch (x) {} }
    /* Charts drawn while their section was hidden measured 0px: let them redraw. */
    setTimeout(function () { window.dispatchEvent(new Event('resize')); }, 30);
    return true;
  }
  function target(it) {
    var el = $(it.el);
    if (el && el.offsetParent === null) el = el.closest('.rsec');
    return el;
  }
  var scrollFn = window.rotScrollToEl;
  function go(id, k, push) {
    var t = byId[id] || byId.today, it = k && t.items.filter(function (x) { return x.k === k; })[0];
    if (it && it.tab) { go(it.tab, 'all', push); return; }
    var changed = setTab(t.id);
    if (push !== false) { try { history.pushState(null, '', '#' + t.id + (it ? '-' + it.k : '')); } catch (x) {} }
    mark(it ? it.k : t.items[0].k);
    var el = it ? target(it) : null;
    if (!el) { if (changed) window.scrollTo(0, 0); return; }
    /* Scroll so the piece sits under the top bar and the pill row. Content
       above keeps loading while it scrolls, so look again twice and
       correct, as mobGo() does. */
    function over() { var tb = document.querySelector('.topbar'); return (tb ? tb.offsetHeight : 0) + (pills.offsetParent ? pills.offsetHeight : 0) + 10; }
    function to(smooth) { window.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + window.scrollY - over()), behavior: smooth ? 'smooth' : 'auto' }); }
    var gen = ++goGen;
    setTimeout(function () { to(true); }, changed ? 60 : 0);
    /* On a fresh load the data lands for several seconds; stop correcting
       the moment the reader scrolls by themselves. */
    [1100, 2200, 3600, 5500].forEach(function (ms) {
      setTimeout(function () { if (gen === goGen && Math.abs(el.getBoundingClientRect().top - over()) > 30) to(true); }, ms);
    });
  }
  var goGen = 0;
  ['wheel', 'touchstart', 'keydown'].forEach(function (ev) { window.addEventListener(ev, function () { goGen++; }, { passive: true }); });
  window.BoardTabs = { go: go, tabOf: function (secId) { return secTab[secId]; } };

  bar.addEventListener('click', function (e) { var a = e.target.closest('[data-tab]'); if (!a) return; e.preventDefault(); go(a.getAttribute('data-tab')); });
  function onItem(e) {
    var a = e.target.closest('a[data-k]'); if (!a) return;
    e.preventDefault(); go(cur, a.getAttribute('data-k'));
  }
  list.addEventListener('click', onItem); pills.addEventListener('click', onItem);

  /* Older code scrolls to a section by itself: switch to its tab first. */
  function ensureTab(el) {
    var s = el && el.closest && el.closest('.rsec[data-tab]');
    if (s && s.getAttribute('data-tab') !== cur) { setTab(s.getAttribute('data-tab')); return true; }
    return false;
  }
  if (scrollFn) window.rotScrollToEl = function (el) { var ch = ensureTab(el), a = arguments, self = this; if (ch) setTimeout(function () { scrollFn.apply(self, a); }, 60); else scrollFn.apply(this, a); };
  ['_mobScrollTo'].forEach(function (n) {
    var f = window[n]; if (typeof f !== 'function') return;
    window[n] = function (el) { var ch = ensureTab(el), a = arguments, self = this; if (ch) setTimeout(function () { f.apply(self, a); }, 60); else f.apply(this, a); };
  });
  ['mobGo', 'railGo'].forEach(function (n) {
    var f = window[n]; if (typeof f !== 'function') return;
    window[n] = function (secId) { if (secTab[secId]) setTab(secTab[secId]); return f.apply(this, arguments); };
  });

  /* ── Which piece you are reading: lights it in the rail and the pills ── */
  function mark(k) {
    list.querySelectorAll('a[data-k]').forEach(function (a) { a.classList.toggle('on', a.getAttribute('data-k') === k); });
    pills.querySelectorAll('a[data-k]').forEach(function (a) {
      var on = a.getAttribute('data-k') === k; a.classList.toggle('on', on);
      if (on && pills.scrollWidth > pills.clientWidth) pills.scrollTo({ left: a.offsetLeft - 40, behavior: 'smooth' });
    });
  }
  var spyRaf = 0, lastK = null;
  window.addEventListener('scroll', function () {
    if (spyRaf) return;
    spyRaf = requestAnimationFrame(function () {
      spyRaf = 0;
      var t = byId[cur]; if (!t) return;
      var line = 160, best = null;
      /* Only parts that are showing count: an empty one (no alerts yet)
         used to stand in for its whole section and win at the top. */
      var shown = t.items.filter(function (it) { var el = !it.tab && $(it.el); return el && el.offsetParent !== null && el.offsetHeight > 0; });
      shown.forEach(function (it) { if ($(it.el).getBoundingClientRect().top <= line) best = it.k; });
      if (window.scrollY < 10 || !best) best = (shown[0] || t.items[0]).k;
      if (best !== lastK) { lastK = best; mark(best); }
    });
  }, { passive: true });

  /* ── Phone bottom bar: the tabs; Derivatives sits in MORE ── */
  var mob = $('mob-nav');
  if (mob) {
    var more = $('mn-more');
    mob.innerHTML = '';
    TABS.forEach(function (t) {
      if (t.id === 'deriv') return;
      var b = document.createElement('button'); b.type = 'button'; b.className = 'mob-nav-btn'; b.setAttribute('data-tab', t.id);
      b.innerHTML = ic(t.icon) + '<span>' + t.mob + '</span>';
      b.addEventListener('click', function () { if (typeof closeMobMore === 'function') closeMobMore(); go(t.id); });
      mob.appendChild(b);
    });
    if (more) mob.appendChild(more);
    var mm = $('mob-more-menu');
    if (mm) {
      var d = document.createElement('button'); d.type = 'button'; d.className = 'mob-more-item'; d.setAttribute('data-tab', 'deriv');
      d.innerHTML = '<span aria-hidden="true">⚡</span><span>Derivatives</span>';
      d.addEventListener('click', function () { if (typeof closeMobMore === 'function') closeMobMore(); go('deriv'); });
      mm.insertBefore(d, mm.firstChild);
    }
  }

  /* ── Settings in the preview's look (Daniel, 2026-10-29): a glass panel
     dropping under the gear, Theme / Units / Language as segmented pills.
     The old rows and their handlers stay; the Light toggle gives way to
     Auto | Light | Dark (js/theme-mode.js). ── */
  var sp = $('settings-panel');
  if (sp) {
    sp.classList.add('set-glass');
    var rows = sp.querySelectorAll('.setting-row');
    rows.forEach(function (r) { if (r.querySelector('.lang-sel-modal')) r.classList.add('set-seg'); });
    var tt = $('theme-toggle'), oldRow = tt && tt.closest('.setting-row');
    if (oldRow && window.RotTheme) {
      oldRow.style.display = 'none';
      var th = document.createElement('div'); th.className = 'setting-row set-seg';
      th.innerHTML = '<div><div class="setting-label">Theme</div></div><div class="lang-sel-modal" role="group" aria-label="Theme">'
        + [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']].map(function (m) { return '<button type="button" class="lang-btn-modal" data-mode="' + m[0] + '">' + m[1] + '</button>'; }).join('') + '</div>';
      var first = sp.querySelector('.setting-row');
      sp.insertBefore(th, first);
      var markTheme = function () { var m = RotTheme.mode(); th.querySelectorAll('[data-mode]').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-mode') === m); }); };
      th.addEventListener('click', function (e) { var b = e.target.closest('[data-mode]'); if (!b) return; RotTheme.set(b.getAttribute('data-mode')); markTheme(); });
      markTheme();
    }
    /* Drop it under the gear, right edges aligned, instead of beside it. */
    var openSP = window.openSettingsPanel;
    if (typeof openSP === 'function') window.openSettingsPanel = function (btn) {
      openSP.apply(this, arguments);
      if (window.innerWidth <= 700) return;
      var g = btn instanceof Element ? btn : document.querySelector('.settings-btn');
      if (!g) return;
      var r = g.getBoundingClientRect(), w = sp.offsetWidth || 320;
      sp.style.left = Math.max(10, r.right - w) + 'px';
      sp.style.top = (r.bottom + 10) + 'px';
      sp.style.maxHeight = (window.innerHeight - r.bottom - 24) + 'px';
      sp.classList.remove('set-in'); void sp.offsetWidth; sp.classList.add('set-in');
    };
  }

  /* ── The Pro window on desktop (Daniel, 2026-10-29: "too high and
     narrow"): three columns instead of one tall strip. What you get |
     what Pro pays for and other ways to get it | pay with crypto.
     openPro() rebuilds the window every time, so split it after. ── */
  var openPro0 = window.openPro;
  if (typeof openPro0 === 'function') window.openPro = function () {
    var r = openPro0.apply(this, arguments);
    var plb = document.querySelector('#pro-modal .plb'), modal = plb && plb.closest('.modal');
    if (!plb || window.innerWidth < 1000 || plb.classList.contains('plb-split')) return r;
    var kids = Array.prototype.slice.call(plb.children);
    var a = document.createElement('div'), b = document.createElement('div'), c = document.createElement('div');
    a.className = 'plb-a'; b.className = 'plb-b'; c.className = 'plb-c';
    var ref = plb.querySelector(':scope > .refx-section'), ri = kids.indexOf(ref);
    kids.forEach(function (k, i) {
      if (k.classList.contains('plb-title') || k.classList.contains('plb-sub') || k.classList.contains('plb-cols')) a.appendChild(k);
      else if (ri >= 0 && (i === ri + 1 || i === ri + 2)) c.appendChild(k);
      else b.appendChild(k);
    });
    plb.appendChild(a); plb.appendChild(b); plb.appendChild(c);
    plb.classList.add('plb-split');
    if (modal) modal.classList.add('pro-wide');
    return r;
  };

  /* ── Chart windows on desktop (Daniel, 2026-10-29: unlocks, ETF flows and
     the rest "can use the more horizontal layout"): the summary, numbers
     and chart on the left, the table or the longer sections on the right,
     in a wider and calmer window. The builders redraw the body on every
     open, so the split happens after openModal(). ── */
  var openModal0 = window.openModal;
  function fcSplit(id) {
    try {
      var ov = $(id), modal = ov && ov.querySelector('.modal.etf-modal'), sc = modal && modal.querySelector('.etf-scroll');
      if (!sc || window.innerWidth < 1100 || sc.classList.contains('fc-split')) return;
      var kids = Array.prototype.slice.call(sc.children), hasTable = !!sc.querySelector(':scope > table');
      var right = kids.filter(function (k) { return k.tagName === 'TABLE' || (!hasTable && k.classList.contains('etf-m-sec')); });
      if (!right.length) return;
      var L = document.createElement('div'), R = document.createElement('div');
      L.className = 'fc-l'; R.className = 'fc-r';
      kids.forEach(function (k) { (right.indexOf(k) >= 0 ? R : L).appendChild(k); });
      sc.appendChild(L); sc.appendChild(R); sc.classList.add('fc-split'); modal.classList.add('fc-wide');
    } catch (x) {}
  }
  /* Some windows (Bitcoin vs gold) fill a moment after they open: look again. */
  if (typeof openModal0 === 'function') window.openModal = function (id) {
    var r = openModal0.apply(this, arguments);
    fcSplit(id); setTimeout(function () { fcSplit(id); }, 500); setTimeout(function () { fcSplit(id); }, 1500);
    if (id === 'donate-modal') supSplit();
    return r;
  };

  /* ── Home and Pro, Wispr-style (Daniel, 2026-10-29): the logo takes you
     home (it used to reload the page), a house button sits with the small
     buttons top right, and the rail's foot holds a Pro card the way Wispr
     Flow keeps "Upgrade to Pro" at the bottom of its sidebar. ── */
  var logo = $('logo-c');
  if (logo) { logo.onclick = function () { location.href = './'; }; logo.title = 'Rotator home'; logo.setAttribute('role', 'link'); }
  if (right) {
    var hm = document.createElement('div'); hm.className = 'tb-dropdown-wrap';
    hm.innerHTML = '<a class="tb-icon-btn bt-home" href="./" title="Rotator home" aria-label="Rotator home"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/></svg></a>';
    right.insertBefore(hm, right.querySelector('.bt-learn') || right.firstChild);
  }
  var pc = document.createElement('div'); pc.className = 'rail-pro';
  pc.innerHTML = '<div class="rp-t">Rotator <b>Pro</b></div><div class="rp-s">Personal alerts on your coins, sent to you on Telegram.</div>'
    + '<button type="button" class="rp-btn" onclick="openPro()">Get Pro</button>';
  rail.appendChild(pc);
  function proCard() { pc.style.display = (typeof isPro !== 'undefined' && isPro) ? 'none' : ''; }
  proCard(); setInterval(proCard, 4000);

  /* ── Support window on desktop: why to support on the left, how to pay
     on the right (Daniel, 2026-10-29: "in line with the rest"). The markup
     is fixed, so it is split once. ── */
  function supSplit() {
    var m = document.querySelector('#donate-modal .modal'); if (!m || window.innerWidth < 1000 || m.classList.contains('sup-wide')) return;
    var body = m.querySelector(':scope > div[style*="overflow-y"]'); if (!body) return;
    var kids = Array.prototype.slice.call(body.children);
    var a = kids.findIndex(function (k) { return /^Payment Methods/i.test((k.textContent || '').trim()); });
    var b = kids.findIndex(function (k) { return /Need help\?/.test(k.textContent || ''); });
    if (a < 0 || b < a) return;
    var L = document.createElement('div'), R = document.createElement('div'); L.className = 'sup-l'; R.className = 'sup-r';
    kids.forEach(function (k, i) { (i >= a && i <= b ? R : L).appendChild(k); });
    body.appendChild(L); body.appendChild(R); body.classList.add('sup-split'); m.classList.add('sup-wide');
  }

  /* ── Start: the address, else the last tab you used, else Today ── */
  var LEGACY = { 'sec-today': ['today'], 'sec-capital': ['flows'], 'sec-rotation': ['coins', 'best'], 'sec-liq': ['deriv'], 'sec-yours': ['mine'],
    'sec-coins': ['coins', 'all'], 'sec-swap': ['mine', 'tool'], 'sec-record': ['coins', 'record'] };
  function fromHash(push) {
    var h = (location.hash || '').slice(1);
    if (LEGACY[h]) { go(LEGACY[h][0], LEGACY[h][1], false); return true; }
    var p = h.split('-'), t = byId[p[0]];
    if (!t) return false;
    go(t.id, p.slice(1).join('-') || null, false);
    return true;
  }
  window.addEventListener('popstate', function () { fromHash(false); });
  window.addEventListener('hashchange', function () { fromHash(false); });
  if (!fromHash(false)) {
    var last = null; try { last = localStorage.getItem('rot_tab'); } catch (x) {}
    setTab(byId[last] ? last : 'today'); mark(byId[cur].items[0].k);
  }
})();
