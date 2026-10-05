/* ══════════════════════════════════════════════════════════════════
   tutorial.js — Step-by-step onboarding tutorial

   REDESIGNED 2026-09-25 (promptove/66). The old tour walked a page that
   no longer exists: a three-column "Signal Center" with a "↑ Rotate"
   column, a left holdings sidebar, a swap tool in a right panel and a
   `.pro-btn` that was removed. It also stated things that stopped being
   true: 200 coins (250 now), a "5-pillar" Insight Engine (7), the swap
   tool finding "the optimal moment", and rotation as the product.

   The tour now follows the rail on the left, one step per section, in
   rail order: TODAY, MOMENTUM, RECORD, YOURS, COINS, SWAP. Each step
   opens its section if it is collapsed, scrolls to it with the rail's
   own railGo(), and highlights the part that is on screen. One placement
   ('section') replaces the four hand-tuned ones, because the sections
   share one layout.

   The copy follows promptove/19 (research-first): past results in the
   past tense, no forecasts, and every tool described as what it shows,
   never as what it predicts.
══════════════════════════════════════════════════════════════════ */

var TUT_KEY = 'rot_tutorial_on';
var tutStep_ = 0;
var tutActive = false;

/* ── Tutorial steps ──────────────────────────────────────────── */
var TUT_STEPS = [

  /* 1. Welcome */
  {
    "target": ".topbar",
    "pos": "center",
    "wide": true,
    "title": "Welcome to Rotator",
    "p": [
      "**Rotator is an honest market pulse for Binance traders.** It scores 250 coins and tokenized stocks every 15 minutes, tracks your portfolio, and warns you about delistings and unlocks before they hit.",
      "Every claim comes with its evidence and the bar it has to beat. When one of its own rules does no better than picking coins at random, it says so."
    ],
    "note": "This tour follows the menu on the left: Today, Momentum, Yours, Coins, Swap and Record. About a minute."
  },

  /* 2. TODAY, in two steps (2026-10-02). The section is ~650px tall,
     too tall to show whole with its card below on a laptop, and the ETF
     strip ended up under the card. Fear & Greed lives in the top bar and
     only shows once the scaling tip is dismissed, so on a first visit it
     was never on screen: this step reveals it, rings it with the
     readings, and drops its paragraph where the banner never shows. */
  {
    "target": "#briefing",
    "goto": "sec-today",
    "pos": "section",
    "wide": true,
    "deskOnly": 1,
    "title": "Today — the market pulse",
    "p": [
      "What the networks and the market are doing right now: gold, silver, oil, the dollar, Bitcoin's hash rate, active addresses, the money locked in DeFi and the stablecoin supply, each with its 7-day change.",
      "**Fear & Greed**, in The market now at the top of this section, is how fearful or greedy the whole market feels today, from 0 to 100."
    ],
    "note": "It describes the market. It does not forecast it."
  },

  /* 2b. TODAY — ETF flows and the ticker */
  {
    "target": "#etf-strip",
    "goto": "etf-strip",
    "pos": "section",
    "wide": true,
    "also": "#market-ticker",
    "title": "Today — ETF flows",
    "p": [
      "**ETF flows** show whether money went into or out of the US Bitcoin and Ether ETFs: the last trading day, then 5 and 20 days. Green bars are money in, red bars money out. Click a tile for the details.",
      "The ticker starts with BTC against its 200-day average, then runs through the biggest movers of the day."
    ],
    "note": "Flows show what big money did, not what it will do next."
  },

  /* 3. MOMENTUM */
  {
    "target": "#sec-rotation",
    "goto": "sec-rotation",
    "open": "hot",
    "pos": "section",
    "title": "Momentum — strongest and weakest",
    "p": [
      "**High Momentum** lists the coins scoring highest across 7, 14 and 30 days. Strength over all three is steadier than one good week.",
      "**Worst 30d** lists the weakest. Weakness can last or reverse, and the score does not know which."
    ],
    "note": "Click any tile for the full breakdown."
  },

  /* 5. YOURS */
  {
    "target": "#sec-yours",
    "goto": "sec-yours",
    "open": "holdings",
    "pos": "section",
    "title": "Yours — what you hold",
    "p": [
      "Add a coin with its quantity and average price. It is saved in this browser only, with **no account**.",
      "Each tile shows your profit or loss and the coin's score, plus an **amber warning** if Binance has announced a delisting, the coin carries Binance's Monitoring tag, or a large unlock is due within 30 days.",
      "**Score gaps** show how your coins score against the rest. They are information, not recommendations: across 771 days of history, moving from a high score into a low one did not beat a random pick."
    ],
    "note": "Free: 2 holdings · Pro: 10."
  },

  /* 6. COINS (the scores, and the agreement) */
  {
    "target": "#sec-coins",
    "goto": "sec-coins",
    "pos": "section",
    "agree": true,
    "title": "Coins — every tracked coin",
    "p": [
      "All 250 coins, sortable by any column. Scores run from **−50 to 100** and combine three layers: **L1** momentum across timeframes, **L2** strength against BTC, gold and oil, and **L3** tokenomics.",
      "The lenses beside the table turn it into a heatmap of open interest, funding, long/short and RSI. Click a row for the full breakdown."
    ],
    "warn": {
      "title": "NOT FINANCIAL ADVICE",
      "text": "Rotator describes past price and market data. Scores do not predict future performance. **Never risk money you cannot afford to lose.**"
    },
    "agreeText": "I understand that Rotator is not financial advice and I am solely responsible for my own investment decisions."
  },

  /* 7. SWAP */
  {
    "target": "#sec-swap",
    "goto": "sec-swap",
    "open": "swap",
    "pos": "section",
    "title": "Swap — one asset against another",
    "p": [
      "Pick what you hold and what you are considering. The ratio shows how many of one you get for the other, where today sits in its recent range, and what a swap would give you at current prices.",
      "It shows where the ratio is, not where it goes next."
    ],
    "note": "Choosing your own pair is a Pro feature."
  },

  /* 7b. RECORD — last, as "learn more" (2026-09-29) */
  {
    "target": "#sec-record",
    "goto": "sec-record",
    "open": "trackrecord",
    "pos": "section",
    "title": "Record — what held up",
    "p": [
      "Every published observation is graded 30 days later against the median coin. Half of all coins beat the median, so **50% is the bar**. Above it is evidence of skill, below it is not.",
      "Live tests show how many days they have graded and when they can first give a verdict. They are never judged early."
    ],
    "note": "The full record is on the track record page."
  },

  /* 8. Pro — with a picture of what it shows (promptove/104). The old
     copy sold the Telegram channel (free for everyone) and the AI
     assistant (kept dormant), and its target matched no button, so the
     card always fell back to the middle of the screen. */
  {
    "target": "#pro-topbar-btn",
    "pos": "below",
    "wide": true,
    "title": "⚡ Pro",
    "p": [
      "**Pro** shows the **Insight Engine** live for the coins you hold or watch: the insight score, its readings, volume against the coin's usual, and golden and death cross timing.",
      "It also unlocks 10 holdings instead of 2, every coin with a turn sign, personal Telegram alerts about your coins, and any swap pair."
    ],
    "img": { "src": "img/pro-insight-{lang}.png", "alt": "The Insight Engine in a coin window, as a Pro member sees it", "cap": "Example: SOL on 4 Oct 2026, as a Pro member sees it, with its golden cross at the bottom. Click to enlarge." },
    "opts": [
      {
        "h": "Crypto",
        "t": "Send $20 or more in USDT, BNB or ETH, submit the transaction hash, and Pro activates in seconds."
      },
      {
        "h": "Refer 5 friends",
        "t": "Pro unlocks when five people join through your link."
      },
      {
        "h": "Pro code",
        "t": "From giveaways or promotions."
      }
    ]
  },

  /* 8b. Install as an app (promptove/104): an installed Rotator opens
     from the desktop or home screen, which is what brings people back.
     Desktop points at the download icon; phones at MORE. */
  {
    "target": "#install-topbar-btn",
    "pos": "below",
    "title": "Use Rotator as an app",
    "p": [
      "**Install Rotator once and open it from your desktop or taskbar** like any other app, in its own window, with no browser tab or address bar. One click and the market pulse is there.",
      "Click the **download icon** at the top right. It is free, with nothing to download from an app store.",
      "**Add Rotator to your home screen** and it opens like an app, full screen, with no browser bar. Tap **MORE → Install App**."
    ],
    "deskOnly": [0, 1],
    "mobOnly": [2],
    "note": "Works in Chrome, Edge and Safari. The app keeps itself up to date."
  },

  /* 9. Done */
  {
    "target": ".settings-btn",
    "pos": "gear",
    "title": "You're all set",
    "p": [
      "Data refreshes every 15 minutes on its own.",
      "The **⚙ gear** changes the language and asset modes, and replays this tour."
    ],
    "note": "Questions: rotatortool@gmail.com"
  }
];

/* The English text, kept so switching back from another language
   restores it: applyLang() copies a language's fields over these
   steps, and falls back to this when a language has none. */
var TUT_EN = JSON.parse(JSON.stringify(TUT_STEPS));

/* ── Tutorial engine ─────────────────────────────────────────── */

function tutCheckAgree() {
  var chk = document.getElementById('tut-agree-chk');
  document.getElementById('tut-next').disabled = !chk.checked;
}

function tutGetEl(selector) { return document.querySelector(selector); }

/* Steps carry plain text (title, p[], note, warn, opts[]) so a
   translation is plain text too; this is the one place that turns it
   into markup. **x** becomes bold. A step with a ready-made desc (the
   Pro tour) is used as is. */
function _tutEsc(x) { return String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function _tutMd(x)  { return _tutEsc(x).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>'); }
function _tutDesc(step) {
  if (step.desc && !step.p) return step.desc;
  var h = '<div style="font-size:14px;line-height:1.8;">';
  /* deskOnly: paragraphs about something phones never show (hidden on
     phones). mobOnly (promptove/104): paragraphs only phones show (hidden
     on desktops). Each takes one index or a list of them. */
  var narrow = window.matchMedia && window.matchMedia('(max-width:768px)').matches;
  function _hit(v, i) { return Array.isArray(v) ? v.indexOf(i) >= 0 : v === i; }
  var paras = (step.p || []).filter(function(x, i) {
    return narrow ? !_hit(step.deskOnly, i) : !_hit(step.mobOnly, i);
  }).map(_tutMd).join('<br><br>');
  /* img (promptove/104): a picture beside the text, {lang} picked from
     the page language so the Macedonian tour shows the Macedonian one. */
  if (step.img) {
    var lang = (typeof currentLang !== 'undefined' && currentLang === 'mk') ? 'mk' : 'en';
    h += '<div class="tut-split">'
      + '<figure class="tut-fig"><img src="' + _tutEsc(step.img.src.replace('{lang}', lang)) + '" alt="' + _tutEsc(step.img.alt || '') + '" loading="lazy" tabindex="0" role="button" onclick="openImgZoom(this)" onkeydown="if(event.keyCode===13)openImgZoom(this)">'
      + (step.img.cap ? '<figcaption>' + _tutEsc(step.img.cap) + '</figcaption>' : '') + '</figure>'
      + '<div class="tut-split-text">' + paras;
  } else {
    h += paras;
  }
  if (step.opts && step.opts.length) {
    h += '<div style="display:grid;gap:8px;font-size:12px;line-height:1.6;margin-top:12px;">'
      + step.opts.map(function(o) { return '<div><strong style="color:var(--pro);">' + _tutEsc(o.h) + '</strong> — ' + _tutMd(o.t) + '</div>'; }).join('')
      + '</div>';
  }
  if (step.img) h += '</div></div>';   /* closes .tut-split-text and .tut-split */
  if (step.warn) {
    h += '<div style="margin-top:12px;background:rgba(255,69,96,.07);border:1px solid rgba(255,69,96,.3);border-radius:4px;padding:10px 12px;">'
      + '<strong style="color:#ff4560;">⚠ ' + _tutEsc(step.warn.title) + '</strong><br>' + _tutMd(step.warn.text) + '</div>';
  }
  if (step.note) {
    /* On a phone the section menu is not on the left (2026-09-29). */
    var note = step.note;
    if (window.matchMedia && window.matchMedia('(max-width:700px)').matches) {
      note = note.replace('follows the menu on the left', 'walks through the sections')
                 .replace('го следи менито од левата страна', 'поминува низ секциите');
    }
    h += '<br><br><span style="font-size:12px;color:var(--muted);">' + _tutMd(note) + '</span>';
  }
  return h + '</div>';
}

/* ── Positioning ─────────────────────────────────────────────── */
function _tutCenter(box, hole, wide, vw, vh) {
  hole.style.display = 'none';
  var bw = wide ? Math.min(vw - 40, 600) : 380;
  box.style.width = bw + 'px';
  box.style.left  = ((vw - bw) / 2) + 'px';
  box.style.top   = Math.max(60, vh * 0.16) + 'px';
  box.className   = 'tut-box';
}

function tutPosition() {
  var step = TUT_STEPS[tutStep_];
  if (!step) return;
  var el   = tutGetEl(step.target);
  var hole = document.getElementById('tut-hole');
  var box  = document.getElementById('tut-box');
  var vw   = window.innerWidth;
  var vh   = window.innerHeight;

  /* Phones: always a centred card, no cut-out. The section has already
     been scrolled into view behind it. */
  if (vw < 700) {
    hole.style.display = 'none';
    var mg = 12;
    box.style.left      = mg + 'px';
    box.style.top       = Math.round(vh * 0.06) + 'px';
    box.style.width     = (vw - mg * 2) + 'px';
    box.style.maxHeight = (vh * 0.82) + 'px';
    box.style.overflowY = 'auto';
    box.className       = 'tut-box';
    return;
  }

  box.style.maxHeight = '';
  box.style.overflowY = '';

  if (step.pos === 'center') { _tutCenter(box, hole, step.wide, vw, vh); return; }

  /* A missing or hidden target never skips a step silently (the old
     engine did, which is how a tour quietly lost its Pro step when
     .pro-btn was removed). It shows the card centred instead. */
  var r = el ? el.getBoundingClientRect() : null;
  if (!r || (r.width === 0 && r.height === 0)) { _tutCenter(box, hole, step.wide, vw, vh); return; }

  var pad = 6;

  /* ── section: highlight what of the section is on screen, card below
     it (or above when there is no room). A section can be taller than
     the viewport, so the cut-out is clipped to the top ~55% and the card
     takes the rest. ── */
  if (step.pos === 'section') {
    /* The card is measured FIRST and the cut-out gets whatever height is
       left below the section's top, so the two never overlap. A section
       taller than the screen is shown from its top down; a short one is
       shown whole. (The first version clipped the cut-out to a fixed 55%
       of the screen, and on a 1133px screen the taller cards landed on
       top of it for four of the six sections.) */
    /* also: a second element (outside the section) inside the same
       cut-out, when it is on screen. */
    var a2 = step.also ? tutGetEl(step.also) : null;
    var r2 = a2 ? a2.getBoundingClientRect() : null;
    if (r2 && r2.width > 0 && r2.height > 0) {
      var L = Math.min(r.left, r2.left), R = Math.max(r.right, r2.right);
      r = { left: L, right: R, width: R - L, top: Math.min(r.top, r2.top), bottom: Math.max(r.bottom, r2.bottom) };
    }
    var bw = Math.min(step.wide ? 880 : 460, vw - 40);
    var bx = Math.max(10, Math.min(r.left + (r.width - bw) / 2, vw - bw - 10));
    box.style.width = bw + 'px';
    box.className   = 'tut-box arrow-top';
    hole.style.display = 'block';
    /* Synchronous on purpose: offsetHeight forces the layout it needs,
       and requestAnimationFrame does not run in a background tab. */
    (function() {
      var bh = box.offsetHeight || 260;
      var gap = pad + 12;
      var top = Math.max(r.top, 8);
      var room = vh - 10 - bh - gap - top - pad;   /* cut-out height that still leaves the card room below */
      var bottom = Math.min(r.bottom, top + Math.max(80, room));
      hole.style.left   = (r.left - pad) + 'px';
      hole.style.top    = (top - pad) + 'px';
      hole.style.width  = (r.width + pad * 2) + 'px';
      hole.style.height = Math.max(40, bottom - top + pad * 2) + 'px';
      var by = bottom + gap;
      if (by + bh > vh - 10) {
        /* Not enough room for the whole card (the COINS step, with its
           disclaimer, on a 720px laptop): let it scroll inside the space
           that is left rather than cover what it is describing. Only if
           even that is too small does it fall back to overlapping. */
        var space = vh - 10 - by;
        if (space >= 240) { box.style.maxHeight = space + 'px'; box.style.overflowY = 'auto'; }
        else { by = Math.max(10, vh - bh - 10); box.className = 'tut-box'; }
      }
      box.style.left = bx + 'px';
      box.style.top  = by + 'px';
    })();
    return;
  }

  hole.style.display = 'block';
  hole.style.left   = (r.left - pad) + 'px';
  hole.style.top    = (r.top  - pad) + 'px';
  hole.style.width  = (r.width  + pad * 2) + 'px';
  hole.style.height = (r.height + pad * 2) + 'px';

  /* ── gear: left of the settings button ── */
  if (step.pos === 'gear') {
    var gw = 320;
    box.style.width = gw + 'px';
    box.style.left  = Math.max(10, r.left - gw - 12) + 'px';
    box.style.top   = Math.max(10, Math.min(r.bottom + 10, vh - 280)) + 'px';
    box.className   = 'tut-box arrow-right';
    return;
  }

  /* ── below: under a top-bar control ── */
  var w = step.wide ? Math.min(vw - 40, 600) : 360;
  box.style.width = w + 'px';
  box.className   = 'tut-box arrow-top';
  var bh = box.offsetHeight || 260;   /* synchronous, as in 'section' */
  box.style.left = Math.max(10, Math.min(r.left + r.width / 2 - w + 40, vw - w - 10)) + 'px';
  box.style.top  = Math.max(10, Math.min(r.bottom + pad + 12, vh - bh - 10)) + 'px';
}

/* Open a collapsed section, then scroll to it, then place the card.
   The collapse animation runs ~320ms and the scroll is smooth, so the
   card is placed after both; the scroll listener below keeps it in
   place if the page settles later. */
function _tutPrepare(step, done) {
  var wait = 0;
  if (step.open) {
    var body = document.getElementById('cb-' + step.open);
    if (body && body.classList.contains('collapsed') && typeof toggleCollapse === 'function') {
      toggleCollapse(step.open);
      wait = 340;
    }
  }
  setTimeout(function() {
    if (step.goto && typeof railGo === 'function') {
      railGo(step.goto);
      setTimeout(done, 450);
    } else {
      done();
    }
  }, wait);
}

function tutRender() {
  var step = TUT_STEPS[tutStep_];

  var _s = (typeof t === 'function') ? t('tut_step') : 'STEP';
  var _o = (typeof t === 'function') ? t('tut_of') : 'OF';
  document.getElementById('tut-step-label').textContent = _s + ' ' + (tutStep_+1) + ' ' + _o + ' ' + TUT_STEPS.length;
  document.getElementById('tut-title').textContent      = step.title;
  document.getElementById('tut-desc').innerHTML         = _tutDesc(step);

  var showDisclaimer = !!step.disclaimer;
  document.getElementById('tut-disclaimer').style.display = showDisclaimer ? 'block' : 'none';

  var showAgree = showDisclaimer || !!step.agree;
  var agreeEl   = document.getElementById('tut-agree');
  var agreeLbl  = document.getElementById('tut-agree-lbl');
  agreeEl.style.display = showAgree ? 'flex' : 'none';
  if (showAgree) {
    document.getElementById('tut-agree-chk').checked = false;
    document.getElementById('tut-next').disabled     = true;
    if (agreeLbl) agreeLbl.textContent = step.agreeText || 'I understand that Rotator is not financial advice and I am solely responsible for my own investment decisions.';
  } else {
    document.getElementById('tut-next').disabled = false;
  }

  var dots = '';
  for (var i = 0; i < TUT_STEPS.length; i++)
    dots += '<div class="tut-dot' + (i === tutStep_ ? ' active' : '') + '"></div>';
  document.getElementById('tut-dots').innerHTML = dots;

  document.getElementById('tut-prev').style.display = tutStep_ === 0 ? 'none' : '';

  var nextBtn = document.getElementById('tut-next');
  var _fin = (typeof t === 'function') ? t('tut_finish') : 'Finish ✓';
  var _agr = (typeof t === 'function') ? t('tut_agree_btn') : 'I Agree →';
  var _nxt = (typeof t === 'function') ? t('tut_next') : 'Next →';
  if      (tutStep_ === TUT_STEPS.length - 1) nextBtn.textContent = _fin;
  else if (showAgree)                          nextBtn.textContent = _agr;
  else                                         nextBtn.textContent = _nxt;

  _tutReveal(step);

  /* Restart the pulse (styles.css, .tut-hole), so each step's spot starts
     with a fresh glow instead of picking up the last step's mid-beat. */
  var _hole = document.getElementById('tut-hole');
  _hole.style.animation = 'none'; void _hole.offsetWidth; _hole.style.animation = '';

  /* Place once straight away (so the card never sits on the previous
     step's spot), then again once the section is open and in view. */
  tutPosition();
  var stepAtRender = tutStep_;
  _tutPrepare(step, function() { if (tutActive && tutStep_ === stepAtRender) tutPosition(); });
}

/* reveal: 'fng' shows the Fear & Greed banner for this step, in place of
   the scaling tip if that is up, and puts the tip back afterwards. */
var _tutFngForced = false, _tutScaleWasShown = false;
function _tutReveal(step) {
  var want = !!(step && step.reveal === 'fng');
  if (want === _tutFngForced || typeof renderFearGreed !== 'function') return;
  _tutFngForced = want;
  var sb = document.getElementById('scale-banner');
  if (want) {
    _tutScaleWasShown = !!(sb && sb.classList.contains('show'));
    if (sb) sb.classList.remove('show');
    renderFearGreed(true);
  } else {
    renderFearGreed();
    if (sb && _tutScaleWasShown) sb.classList.add('show');
  }
}

function tutGoNext() {
  tutStep_++;
  if (tutStep_ >= TUT_STEPS.length) { endTutorial(); return; }
  tutRender();
}

function tutStep(dir) {
  /* The phone suggestion's "Start here anyway" is the Next button. */
  if (_tutGate) { var go = _tutGate; _tutGate = null; if (dir > 0) go(); return; }
  tutStep_ += dir;
  if (tutStep_ < 0) tutStep_ = 0;
  if (tutStep_ >= TUT_STEPS.length) { endTutorial(); return; }
  tutRender();
}

/* ── Phones: suggest the computer first (Daniel, 2026-10-05) ──
   On a phone the tour card covers 80-90% of the screen, so the reader
   never sees what it points at. Before either tour starts on a phone,
   one card says so and offers to start anyway; "Turn off" ends it, and
   the ⚙ gear can replay it. */
var _tutGate = null;
function _tutIsPhone() { return window.innerWidth < 700; }   /* same test as tutPosition()'s centred phone card */
function _tutShowGate(go) {
  _tutGate = go; tutActive = true;
  var tr = function(k, d) { return (typeof t === 'function') ? t(k) : d; };
  document.getElementById('tut-hole').style.display = 'none';
  document.getElementById('tut-box').style.display  = 'block';
  document.getElementById('tut-backdrop').classList.add('active');
  document.getElementById('tut-step-label').textContent = tr('tut_phone_label', 'TIP');
  document.getElementById('tut-title').textContent      = tr('tut_phone_title', 'The tour is made for a computer');
  document.getElementById('tut-desc').innerHTML         = '<div style="font-size:14px;line-height:1.8;">' + _tutMd(tr('tut_phone_text', '')) + '</div>';
  document.getElementById('tut-disclaimer').style.display = 'none';
  document.getElementById('tut-agree').style.display      = 'none';
  document.getElementById('tut-dots').innerHTML = '';
  document.getElementById('tut-prev').style.display = 'none';
  var next = document.getElementById('tut-next');
  next.disabled = false; next.textContent = tr('tut_phone_go', 'Start here anyway →');
  var box = document.getElementById('tut-box');
  box.style.maxHeight = ''; box.style.overflowY = '';
  tutPosition();
}

function startTutorial(force) {
  if (force !== true && _tutIsPhone()) { _tutShowGate(function() { startTutorial(true); }); return; }
  _tutGate = null;
  tutStep_ = 0; tutActive = true;
  document.getElementById('tut-hole').style.display     = 'block';
  document.getElementById('tut-box').style.display      = 'block';
  document.getElementById('tut-backdrop').classList.add('active');
  tutRender();
}

function endTutorial() {
  tutActive = false; _tutGate = null;
  _tutReveal(null);
  document.getElementById('tut-hole').style.display = 'none';
  document.getElementById('tut-box').style.display  = 'none';
  document.getElementById('tut-backdrop').classList.remove('active');
  try { localStorage.setItem(TUT_KEY, 'off'); } catch(e) {}
  document.getElementById('tut-toggle').checked = false;
}

function toggleTutSetting(on) {
  try { localStorage.setItem(TUT_KEY, on ? 'on' : 'off'); } catch(e) {}
  if (on) startTutorial(); else endTutorial();
}

function initTutorial() {
  var val; try { val = localStorage.getItem(TUT_KEY); } catch(e) {}
  var isOn = (val === null || val === 'on');
  document.getElementById('tut-toggle').checked = isOn;
  if (!isOn) return;
  /* First visit: the consent banner comes first, the tour after it is
     accepted (acceptConsent in ui.js), instead of both at once. */
  var consented = true;
  try { consented = !!localStorage.getItem('rot_consent'); } catch(e) {}
  if (consented) setTimeout(startTutorial, 800);
  else window.__tutAfterConsent = true;
}

/* Keep the cut-out on its section while the page moves: resize, and any
   scroll (the reader's own, or a section settling after it opened).
   One frame per burst of events. */
var _tutRaf = 0;
function _tutReflow() {
  if (!tutActive || _tutRaf) return;
  _tutRaf = requestAnimationFrame(function() { _tutRaf = 0; tutPosition(); });
}
window.addEventListener('resize', _tutReflow);
window.addEventListener('scroll', _tutReflow, { passive: true });

/* ══════════════════════════════════════════════════════════════════
   PRO TUTORIAL — shown once after Pro is unlocked
   Reuses the same engine with Pro-specific steps.

   REWRITTEN 2026-10-04 against the Pro window's own FREE/PRO table
   (pro-system.js). The 2026-09-25 version sold the Telegram channel
   (free for everyone) and the AI assistant (dormant), and said nothing
   about personal Telegram alerts, which are the main thing Pro gives.
   The steps are plain text now (title, p[], note, img), like the main
   tour, so applyLang() can put the Macedonian `pro_tut` over them.
══════════════════════════════════════════════════════════════════ */

var PRO_TUT_KEY = 'rot_pro_tutorial_done';

var PRO_TUT_STEPS = [

  /* 1. Welcome */
  {
    "target": ".topbar",
    "pos": "center",
    "title": "⚡ Welcome to Pro",
    "p": [
      "Thank you for supporting Rotator. Pro is a **one-time unlock**, with no subscription.",
      "This short tour shows what just unlocked, section by section."
    ]
  },

  /* 2. The Insight Engine, live — the picture the Pro window shows too */
  {
    "target": ".topbar",
    "pos": "center",
    "wide": true,
    "title": "⚡ The Insight Engine, live",
    "p": [
      "Open any coin you hold or watch. Its **Insight Engine** now updates with every 15-minute run, instead of showing yesterday's.",
      "You see the insight score and the readings behind it, volume against the coin's usual, **golden and death cross** timing with its tested record, and the **amount, date and countdown** of a big unlock."
    ],
    "img": { "src": "img/pro-insight-{lang}.png", "alt": "The Insight Engine in a coin window, as a Pro member sees it", "cap": "Example: SOL on 4 Oct 2026, with its golden cross at the bottom. Click to enlarge." },
    "note": "It describes how a coin is behaving. It is not a forecast."
  },

  /* 3. MOMENTUM: every turn sign, every tile */
  {
    "target": "#sec-rotation",
    "goto": "sec-rotation",
    "open": "hot",
    "pos": "section",
    "title": "Every turn sign, every tile",
    "p": [
      "**Turn signs across the market** now list every coin with a turn sign, not only the top 2 of each list.",
      "**High Momentum** and **Worst 30d** show all 6 tiles each."
    ],
    "note": "A turn sign is a reading, not a forecast. Its tested record is in the coin window."
  },

  /* 4. YOURS: limits and the alerts panel */
  {
    "target": "#sec-yours",
    "goto": "sec-yours",
    "open": "holdings",
    "pos": "section",
    "title": "10 holdings and fuller alerts",
    "p": [
      "You can now track **10 holdings** instead of 2, and keep up to 20 paper trades.",
      "**Alerts for your coins** now add new turn signs and sharp moves in Bitcoin and Ether ETF flows to the free exchange and unlock warnings. You can also turn on browser notifications, which fire while Rotator is open in a tab."
    ]
  },

  /* 5. Telegram DMs — the main thing Pro gives (site-is-a-telegram-pro-funnel) */
  {
    "target": "#coin-alerts",
    "goto": "coin-alerts",
    "open": "holdings",
    "pos": "section",
    "title": "📨 Your alerts on Telegram",
    "p": [
      "At the bottom of **Alerts for your coins**, click **Get these on Telegram**. Telegram opens; tap **Start** and you are linked.",
      "From then on, new alerts about the coins you hold and watch are messaged to you once a day, in the language this site is set to. A quiet day sends nothing."
    ],
    "note": "Disconnect any time from the same panel. The market pulse channel stays free for everyone."
  },

  /* 6. COINS: the cross lenses and badges (Pro only since 2026-10-04) */
  {
    "target": "#sec-coins",
    "goto": "sec-coins",
    "pos": "section",
    "title": "Golden and death crosses in the table",
    "p": [
      "The **✨GC** and **☠DC** lenses beside the table sort coins by their most recent golden or death cross, and a coin with a recent cross carries a badge.",
      "Pro also has **fresh-data priority**: when the shared market data is more than 15 minutes old, your browser fetches a fresh copy instead of waiting."
    ]
  },

  /* 7. SWAP: any pair */
  {
    "target": "#sec-swap",
    "goto": "sec-swap",
    "open": "swap",
    "pos": "section",
    "title": "Your own swap pairs",
    "p": [
      "Choose any two assets and see how their ratio has moved, where today sits in its recent range, and what a swap would give you at current prices."
    ],
    "note": "It shows where the ratio is, not where it goes next."
  },

  /* 8. Recovery key — it is a bearer token (promptove/108), so say so */
  {
    "target": "#pro-topbar-btn",
    "pos": "below",
    "title": "🔑 Keep your recovery key safe",
    "p": [
      "To use Pro on another device or browser: **1.** Click **⚡** at the top and copy your **recovery key**. **2.** On the new device, click **⚡** and paste it under **Already have Pro on another device?**",
      "**Treat it like a password.** Anyone who has it can use your Pro and change your Telegram alerts. Never post it or send it in a chat."
    ],
    "note": "Replay this tour any time from the ⚙ gear."
  }
];

/* English snapshot, for switching back from another language (applyLang). */
var PRO_TUT_EN = JSON.parse(JSON.stringify(PRO_TUT_STEPS));

/* ── Pro tutorial engine (reuses base tutorial UI) ──────────── */
var proTutOrigSteps = null;

function startProTutorial(force) {
  if (force !== true) {
    /* Don't show if already completed */
    try { if (localStorage.getItem(PRO_TUT_KEY) === 'done') return; } catch(e) {}
    /* Phones: the computer suggestion first (see _tutShowGate). It counts
       as seen, so it does not come back; the ⚙ gear replays the tour. */
    if (_tutIsPhone()) {
      try { localStorage.setItem(PRO_TUT_KEY, 'done'); } catch(e) {}
      _tutShowGate(function() { startProTutorial(true); });
      return;
    }
  }
  _tutGate = null;

  /* Swap in Pro steps, preserving originals */
  proTutOrigSteps = TUT_STEPS;
  TUT_STEPS = PRO_TUT_STEPS;
  tutStep_ = 0;
  tutActive = true;
  document.getElementById('tut-hole').style.display = 'block';
  document.getElementById('tut-box').style.display  = 'block';
  document.getElementById('tut-backdrop').classList.add('active');
  tutRender();
}

/* Patch endTutorial to handle Pro tutorial cleanup */
var _origEndTutorial = endTutorial;
endTutorial = function() {
  if (proTutOrigSteps) {
    /* We were running Pro tutorial — mark it done and restore base steps */
    try { localStorage.setItem(PRO_TUT_KEY, 'done'); } catch(e) {}
    TUT_STEPS = proTutOrigSteps;
    proTutOrigSteps = null;
  }
  _origEndTutorial();
};

/* Allow replaying Pro tutorial from settings */
function replayProTutorial() {
  try { localStorage.removeItem(PRO_TUT_KEY); } catch(e) {}
  startProTutorial();
}
