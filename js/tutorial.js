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

var _TUT_P = '<div style="font-size:14px;line-height:1.8;">';
var _TUT_SMALL = 'font-size:12px;color:var(--muted);';

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
    "note": "This tour follows the menu on the left: Today, Momentum, Record, Yours, Coins and Swap. About a minute."
  },

  /* 2. TODAY */
  {
    "target": "#sec-today",
    "goto": "sec-today",
    "pos": "section",
    "title": "Today — the market pulse",
    "p": [
      "What the networks and the market are doing right now: network activity, macro readings, Fear & Greed, and where BTC sits against its 200-day average.",
      "The ticker runs through the biggest movers of the day."
    ],
    "note": "It describes the market. It does not forecast it."
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

  /* 4. RECORD */
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

  /* 8. Pro */
  {
    "target": "button.tb-icon-btn[title=\"Unlock Pro\"]",
    "pos": "below",
    "title": "⚡ Pro",
    "p": [
      "**Pro** unlocks 10 holdings instead of 2, every score-gap and momentum tile, the Insight read updated every run instead of yesterday's, your own swap pairs, the Telegram channel and the AI assistant."
    ],
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
  h += (step.p || []).map(_tutMd).join('<br><br>');
  if (step.opts && step.opts.length) {
    h += '<div style="display:grid;gap:8px;font-size:12.5px;line-height:1.6;margin-top:12px;">'
      + step.opts.map(function(o) { return '<div><strong style="color:var(--pro);">' + _tutEsc(o.h) + '</strong> — ' + _tutMd(o.t) + '</div>'; }).join('')
      + '</div>';
  }
  if (step.warn) {
    h += '<div style="margin-top:12px;background:rgba(255,69,96,.07);border:1px solid rgba(255,69,96,.3);border-radius:4px;padding:10px 12px;">'
      + '<strong style="color:#ff4560;">⚠ ' + _tutEsc(step.warn.title) + '</strong><br>' + _tutMd(step.warn.text) + '</div>';
  }
  if (step.note) h += '<br><br><span style="font-size:12px;color:var(--muted);">' + _tutMd(step.note) + '</span>';
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
    var bw = Math.min(460, vw - 40);
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

  /* Place once straight away (so the card never sits on the previous
     step's spot), then again once the section is open and in view. */
  tutPosition();
  var stepAtRender = tutStep_;
  _tutPrepare(step, function() { if (tutActive && tutStep_ === stepAtRender) tutPosition(); });
}

function tutGoNext() {
  tutStep_++;
  if (tutStep_ >= TUT_STEPS.length) { endTutorial(); return; }
  tutRender();
}

function tutStep(dir) {
  tutStep_ += dir;
  if (tutStep_ < 0) tutStep_ = 0;
  if (tutStep_ >= TUT_STEPS.length) { endTutorial(); return; }
  tutRender();
}

function startTutorial() {
  tutStep_ = 0; tutActive = true;
  document.getElementById('tut-hole').style.display     = 'block';
  document.getElementById('tut-box').style.display      = 'block';
  document.getElementById('tut-backdrop').classList.add('active');
  tutRender();
}

function endTutorial() {
  tutActive = false;
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
  if (isOn) setTimeout(startTutorial, 800);
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
   Reuses the same engine with Pro-specific steps. Rewritten 2026-09-25
   to match what Pro unlocks today (holdings.js limits, signals.js tile
   counts, the live Insight read, ratio.js own pairs, the Telegram
   channel and the assistant). "All categories unlocked" and "Top 200
   coins" were removed: neither is gated any more.
══════════════════════════════════════════════════════════════════ */

var PRO_TUT_KEY = 'rot_pro_tutorial_done';

var PRO_TUT_STEPS = [

  {
    target: '.topbar',
    title: '⚡ Welcome to Pro',
    desc: _TUT_P
        + 'Thank you for supporting Rotator. Here is what just unlocked, section by section.'
        + '</div>',
    pos: 'center'
  },

  {
    target: '#sec-yours', goto: 'sec-yours', open: 'holdings',
    title: '10 holdings and every score gap',
    desc: _TUT_P
        + 'You can now track <strong>10 holdings</strong>, and all four score-gap tiles are visible.<br><br>'
        + 'Holder warnings (announced delistings, Monitoring tags, large unlocks) apply to every coin you add.'
        + '</div>',
    pos: 'section'
  },

  {
    target: '#sec-rotation', goto: 'sec-rotation', open: 'hot',
    title: 'Every momentum tile',
    desc: _TUT_P
        + 'All six High Momentum tiles are unlocked, not just the first.'
        + '</div>',
    pos: 'section'
  },

  {
    target: '.topbar',
    title: '⚡ The Insight read, live',
    desc: _TUT_P
        + 'Open any coin to see its Insight read. It now updates with every 15-minute run instead of showing yesterday\'s.<br><br>'
        + '<span style="' + _TUT_SMALL + '">The Insight read describes how a coin is behaving. It is not a forecast.</span>'
        + '</div>',
    pos: 'center'
  },

  {
    target: '#sec-swap', goto: 'sec-swap', open: 'swap',
    title: 'Your own swap pairs',
    desc: _TUT_P
        + 'Choose any two assets and see how their ratio has moved, where today sits in the recent range, and what a swap would give you at current prices.'
        + '</div>',
    pos: 'section'
  },

  {
    target: '.topbar',
    title: 'Telegram channel and AI assistant',
    desc: _TUT_P
        + 'The <strong>Telegram channel</strong> link is now open to you, and the <strong>AI assistant</strong> answers questions about the current scores, using only the latest run.'
        + '</div>',
    pos: 'center'
  },

  {
    target: '.settings-btn',
    title: 'Save your recovery key',
    desc: _TUT_P
        + 'Your Pro status is <strong>synced to the cloud</strong>. To use it on another device or browser:<br><br>'
        + '<strong>1.</strong> Open Pro settings (⚡ in the top bar)<br>'
        + '<strong>2.</strong> Copy your <strong>recovery key</strong><br>'
        + '<strong>3.</strong> Paste it on the new device<br><br>'
        + '<span style="' + _TUT_SMALL + '">Replay this tour any time from the ⚙ gear menu.</span>'
        + '</div>',
    pos: 'gear'
  }
];

/* ── Pro tutorial engine (reuses base tutorial UI) ──────────── */
var proTutOrigSteps = null;

function startProTutorial() {
  /* Don't show if already completed */
  try { if (localStorage.getItem(PRO_TUT_KEY) === 'done') return; } catch(e) {}

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
