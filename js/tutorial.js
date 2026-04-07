/* ══════════════════════════════════════════════════════════════════
   tutorial.js — Step-by-step onboarding tutorial
══════════════════════════════════════════════════════════════════ */

var TUT_KEY = 'rot_tutorial_on';
var tutStep_ = 0;
var tutActive = false;

/* ── Tutorial steps ──────────────────────────────────────────── */
var TUT_STEPS = [

  /* Step 1: Welcome */
  {
    target: '.topbar',
    title: 'Welcome to ROTATOR',
    desc: '<strong>Rotator</strong> is a daily performance tracker for crypto, forex and stocks. It measures price momentum across <strong>24H, 7D, 14D and 30D</strong> and surfaces opportunities to improve portfolio performance over time.<br><br>'
        + '<strong>What is rotation?</strong> If you hold two assets and one has fallen 17% while the other only fell 5%, rotating part of the weaker position into the stronger one recovers value without adding capital. Over time, compounding these small adjustments significantly improves performance.<br><br>'
        + '<strong>Multi-timeframe scoring</strong> surfaces sustained trends, not just recent noise. A coin ranked highly across 7D, 14D <em>and</em> 30D is behaving very differently from one that just had a single good week.',
    arrow: 'top', pos: 'center', wide: true
  },

  /* Step 2: Holdings Panel — highlight left panel */
  {
    target: '#my-holdings-panel',
    title: 'Your Holdings Panel',
    desc: '<div style="font-size:13px;line-height:1.85;">Track any coin with quantity and average buy price — all saved locally, <strong>no account needed</strong>.<br><br>'
        + 'Once added, the <strong style="color:var(--bnb);">Portfolio Signal</strong> box above scores your portfolio and flags which assets are lagging or outperforming.<br><br>'
        + '<span style="font-size:11px;color:rgba(255,255,255,.6);">Free tier: <strong>2 crypto</strong> slots · Pro: up to 10 holdings, Insight Engine, Best Time to Swap & more.</span></div>',
    arrow: 'left', pos: 'left-panel-right'
  },

  /* Step 3: Signal Center — colored columns, arrow pointing up to tiles */
  {
    target: '.neon-section',
    title: 'Signal Center',
    desc: '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:18px;font-size:13px;line-height:1.85;">'
        + '<div style="border-left:3px solid #00bd8e;padding-left:12px;">'
          + '<div style="font-size:9px;letter-spacing:.13em;color:rgba(0,200,150,.7);margin-bottom:6px;font-weight:700;">↑ ROTATION OPPS</div>'
          + '<div style="color:#00bd8e;font-size:16px;font-weight:700;margin-bottom:7px;">↑ Rotate</div>'
          + '<span style="color:rgba(200,220,210,.85);">Pairs from your holdings where rotating makes sense. The score gap shows how much one coin is outpacing another.</span>'
          + '<div style="margin-top:7px;font-size:10px;color:rgba(167,139,250,.9);font-weight:600;">⚡ Pro feature — unlock free</div>'
        + '</div>'
        + '<div style="border-left:3px solid #f0a030;padding-left:12px;">'
          + '<div style="font-size:9px;letter-spacing:.13em;color:rgba(240,160,48,.7);margin-bottom:6px;font-weight:700;">⚡ HIGH MOMENTUM</div>'
          + '<div style="color:#f0a030;font-size:16px;font-weight:700;margin-bottom:7px;">⚡ Leading</div>'
          + '<span style="color:rgba(220,210,195,.85);">Top coins by composite score across all timeframes. Sustained strength — not single-week spikes. Click any tile for full breakdown.</span>'
        + '</div>'
        + '<div style="border-left:3px solid #f03e58;padding-left:12px;">'
          + '<div style="font-size:9px;letter-spacing:.13em;color:rgba(240,62,88,.7);margin-bottom:6px;font-weight:700;">↓ WORST 30D</div>'
          + '<div style="color:#f03e58;font-size:16px;font-weight:700;margin-bottom:7px;">↓ Lagging</div>'
          + '<span style="color:rgba(220,200,200,.85);">Biggest 30-day losers. Potential bounce candidates — or assets to exit. Monitor or reduce exposure.</span>'
        + '</div>'
        + '</div>',
    arrow: 'top', pos: 'neon-below', wide: true
  },

  /* Step 4: Leaderboard + disclaimer */
  {
    target: '.leaderboard',
    title: 'Leaderboard — Scores — Disclaimer',
    desc: '<div style="font-size:13px;line-height:1.85;">'
        + '<strong>200 coins</strong> (including stablecoins with APR yields) ranked across <strong style="color:#fff;">24H · 7D · 14D · 30D</strong>. Click any column header to sort. Click any row for a full score breakdown.<br><br>'
        + 'The <strong>Score</strong> combines three layers: <strong>L1</strong> Momentum rank · <strong>L2</strong> Relative strength vs BTC, Gold, Oil · <strong>L3</strong> Tokenomics quality<br><br>'
        + '<div style="background:rgba(255,69,96,.07);border:1px solid rgba(255,69,96,.3);border-radius:4px;padding:10px 12px;">'
        + '<strong style="color:#ff4560;">⚠ NOT FINANCIAL ADVICE</strong><br>'
        + 'Rotator tracks historical price data only. Scores do not predict future performance. Always research before trading. <strong>Never risk money you cannot afford to lose.</strong>'
        + '</div></div>',
    arrow: 'bottom', pos: 'above', wide: true, agree: true,
    agreeText: 'I understand that Rotator is not financial advice and I am solely responsible for my own investment decisions.'
  },

  /* Step 5: Swap Tool — positioned BESIDE ratio section, arrow pointing right toward it */
  {
    target: '#ratio-section',
    title: '↔ Swap Tool — Best Time to Swap',
    desc: '<div style="font-size:13px;line-height:1.85;">'
        + 'The <strong style="color:var(--bnb);">Swap Tool</strong> helps you find the <strong>optimal moment</strong> to swap one asset for another — by tracking the live price <strong>ratio</strong> between them over time.<br><br>'
        + 'Pick your <strong>FROM</strong> asset (what you hold) and <strong>TO</strong> asset (what you want). The ratio shows how many TO coins you get per 1 FROM coin right now.<br><br>'
        + 'When the ratio is near its <strong style="color:var(--green);">▲ Period Peak</strong>, you get maximum value. The range bar and chart show exactly where you are in the cycle.<br><br>'
        + '<span style="font-size:11px;color:rgba(255,255,255,.5);">Use the Swap Calculator to simulate exact amounts before executing on your exchange.</span>'
        + '</div>',
    arrow: 'right', pos: 'swap-tool', wide: false
  },

  /* Step 6: All set — LAST STEP */
  {
    target: '.settings-btn',
    title: "You're all set.",
    desc: '<div style="font-size:13px;line-height:1.85;">'
        + 'Data refreshes every 15 minutes automatically. Hit <strong>↻ REFRESH</strong> to force a fresh fetch at any time.<br><br>'
        + '<strong style="color:var(--pro);">⚡ Unlock Pro free</strong> — share Rotator with 3 friends for up to 10 portfolio slots, full Rotation Signals, and the Swap Tool watchlist.<br><br>'
        + 'Click the <strong>⚙ gear icon</strong> (highlighted) to change language, toggle asset modes, or replay this tutorial.'
        + '</div>',
    arrow: 'right', pos: 'gear'
  }
];

/* ── Tutorial engine ─────────────────────────────────────────── */

function tutCheckAgree() {
  var chk = document.getElementById('tut-agree-chk');
  document.getElementById('tut-next').disabled = !chk.checked;
}

function tutGetEl(selector) { return document.querySelector(selector); }

/* ── Positioning ─────────────────────────────────────────────── */
function tutPosition() {
  var step = TUT_STEPS[tutStep_];
  var el   = tutGetEl(step.target);
  var hole = document.getElementById('tut-hole');
  var box  = document.getElementById('tut-box');
  var vw   = window.innerWidth;
  var vh   = window.innerHeight;

  /* Mobile: always center */
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

  if (!el) { tutGoNext(); return; }
  var r = el.getBoundingClientRect();

  if (r.width === 0 && r.height === 0) {
    hole.style.display = 'none';
    var bw = step.wide ? Math.min(vw - 40, 620) : 360;
    box.style.width = bw + 'px';
    box.style.left  = ((vw - bw) / 2) + 'px';
    box.style.top   = Math.max(60, vh * 0.12) + 'px';
    box.className   = 'tut-box';
    return;
  }

  var pad = 6;
  hole.style.display = 'block';
  hole.style.left   = (r.left - pad) + 'px';
  hole.style.top    = (r.top  - pad) + 'px';
  hole.style.width  = (r.width  + pad * 2) + 'px';
  hole.style.height = (r.height + pad * 2) + 'px';

  /* ── center (step 1 welcome) ── */
  if (step.pos === 'center') {
    hole.style.display = 'none';
    var bw = step.wide ? Math.min(vw - 40, 620) : 380;
    box.style.width = bw + 'px';
    box.style.left  = ((vw - bw) / 2) + 'px';
    box.style.top   = Math.max(60, vh * 0.18) + 'px';
    box.className   = 'tut-box';
    return;
  }

  /* ── gear (step 6 all set) — left of gear icon ── */
  if (step.pos === 'gear') {
    var bw = 320;
    var bx = Math.max(10, r.left - bw - 12);
    var by = Math.max(10, Math.min(r.bottom + 10, vh - 280));
    box.style.width = bw + 'px';
    box.style.left  = bx + 'px';
    box.style.top   = by + 'px';
    box.className   = 'tut-box arrow-right';
    return;
  }

  /* ── left-panel-right (step 2 holdings) — to the right of left sidebar ── */
  if (step.pos === 'left-panel-right') {
    var bw = 310;
    /* Place box just to the right of the sidebar (left panel is ~310px wide) */
    var sidebar = document.querySelector('.sidebar');
    var sRect   = sidebar ? sidebar.getBoundingClientRect() : r;
    /* Highlight the tiles area specifically */
    var tilesEl = document.getElementById('tiles-grid');
    if (tilesEl) {
      var tr = tilesEl.getBoundingClientRect();
      hole.style.left   = (sRect.left) + 'px';
      hole.style.top    = (sRect.top) + 'px';
      hole.style.width  = (sRect.width) + 'px';
      hole.style.height = (sRect.height) + 'px';
    }
    var bx = sRect.right + 14;
    /* Vertically center on the panel */
    box.style.width = bw + 'px';
    box.className   = 'tut-box arrow-left';
    requestAnimationFrame(function() {
      var bh = box.offsetHeight || 200;
      var by = sRect.top + (sRect.height - bh) / 2;
      by = Math.max(40, Math.min(by, vh - bh - 10));
      bx = Math.min(bx, vw - bw - 10);
      box.style.left = bx + 'px';
      box.style.top  = by + 'px';
    });
    return;
  }

  /* ── neon-below (step 3 signal center) — below the neon section tiles ── */
  if (step.pos === 'neon-below') {
    var bw = step.wide ? Math.min(vw - 40, Math.max(620, r.width - 20)) : 500;
    /* Center horizontally over the neon section */
    var bx = r.left + (r.width - bw) / 2;
    bx = Math.max(10, Math.min(bx, vw - bw - 10));
    box.style.width = bw + 'px';
    box.className   = 'tut-box arrow-top';
    requestAnimationFrame(function() {
      var bh = box.offsetHeight || 220;
      var by = r.bottom + 10;
      if (by + bh > vh - 10) { by = r.top - bh - 10; box.className = 'tut-box arrow-bottom'; }
      box.style.left = bx + 'px';
      box.style.top  = by + 'px';
    });
    return;
  }

  /* ── swap-tool (step 5) — to the LEFT of the right panel, arrow pointing right ── */
  if (step.pos === 'swap-tool') {
    hole.style.display = 'none'; /* don't highlight the whole right panel */
    var bw = 360;
    /* right panel starts at r.left — place box just to its left */
    var bx = r.left - bw - 18;
    if (bx < 10) bx = 10;
    box.style.width = bw + 'px';
    box.className   = 'tut-box arrow-right';
    requestAnimationFrame(function() {
      var bh = box.offsetHeight || 300;
      /* Align vertically to the ratio section top area */
      var by = r.top + 40;
      by = Math.max(40, Math.min(by, vh - bh - 10));
      box.style.left = bx + 'px';
      box.style.top  = by + 'px';
    });
    return;
  }

  /* ── General fallback ── */
  var bw = step.wide ? Math.min(vw - 40, Math.max(600, r.width)) : 320;
  box.style.width = bw + 'px';
  box.className   = 'tut-box arrow-' + step.arrow;

  requestAnimationFrame(function() {
    var bh = box.offsetHeight || 260;
    var margin = 14;
    var bx, by;
    if      (step.pos === 'below')      { bx = r.left; by = r.bottom + pad + margin; }
    else if (step.pos === 'above')      { bx = r.left; by = r.top - pad - margin - bh; }
    else if (step.pos === 'right')      { bx = r.right + pad + margin; by = r.top; }
    else if (step.pos === 'right-high') { bx = r.right + pad + margin; by = Math.max(50, r.top); }
    else                                { bx = r.left - bw - pad - margin; by = r.top; }

    bx = Math.max(10, Math.min(bx, vw - bw - 10));
    by = Math.max(10, Math.min(by, vh - bh - 10));
    box.style.left = bx + 'px';
    box.style.top  = by + 'px';
  });
}

function tutRender() {
  var step = TUT_STEPS[tutStep_];

  var _s = (typeof t === 'function') ? t('tut_step') : 'STEP';
  var _o = (typeof t === 'function') ? t('tut_of') : 'OF';
  document.getElementById('tut-step-label').textContent = _s + ' ' + (tutStep_+1) + ' ' + _o + ' ' + TUT_STEPS.length;
  document.getElementById('tut-title').textContent      = step.title;
  document.getElementById('tut-desc').innerHTML         = step.desc;

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
  var _fin = (typeof t === 'function') ? t('tut_finish') : 'Finish \u2713';
  var _agr = (typeof t === 'function') ? t('tut_agree_btn') : 'I Agree \u2192';
  var _nxt = (typeof t === 'function') ? t('tut_next') : 'Next \u2192';
  if      (tutStep_ === TUT_STEPS.length - 1) nextBtn.textContent = _fin;
  else if (showAgree)                          nextBtn.textContent = _agr;
  else                                         nextBtn.textContent = _nxt;

  tutPosition();
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

window.addEventListener('resize', function() { if (tutActive) tutPosition(); });

/* ══════════════════════════════════════════════════════════════════
   PRO TUTORIAL — shown once after Pro is unlocked
   Reuses the same engine but with Pro-specific steps.
══════════════════════════════════════════════════════════════════ */

var PRO_TUT_KEY = 'rot_pro_tutorial_done';

var PRO_TUT_STEPS = [

  /* Step 1: Welcome to Pro */
  {
    target: '.topbar',
    title: '⚡ Welcome to Pro!',
    desc: '<div style="font-size:13px;line-height:1.85;">'
        + 'Thank you for supporting Rotator! You\'ve unlocked the full experience.<br><br>'
        + 'Let\'s quickly walk through <strong style="color:var(--pro);">what\'s new</strong> so you get the most out of your upgrade.'
        + '</div>',
    arrow: 'top', pos: 'center', wide: false
  },

  /* Step 2: All categories unlocked */
  {
    target: '#cat-bar',
    title: 'All Categories Unlocked',
    desc: '<div style="font-size:13px;line-height:1.85;">'
        + 'You now have access to <strong>all 10 categories</strong> — L2, AI, Gaming, RWA, Infra, and Stablecoins are all unlocked.<br><br>'
        + 'Each category filters the leaderboard to show sector-specific performance. Use this to spot <strong>sector rotation</strong> trends.'
        + '</div>',
    arrow: 'top', pos: 'neon-below', wide: true
  },

  /* Step 3: Top 200 coins */
  {
    target: '.leaderboard',
    title: 'Top 200 Coins',
    desc: '<div style="font-size:13px;line-height:1.85;">'
        + 'The leaderboard now shows <strong>200 coins</strong> including stablecoins with live DeFi <strong style="color:#8dffc0;">APR yields</strong>.<br><br>'
        + 'More coins means more rotation opportunities and better coverage of emerging trends across sectors.'
        + '</div>',
    arrow: 'bottom', pos: 'above', wide: true
  },

  /* Step 4: Insight Engine */
  {
    target: '#td-insight-sec',
    title: '⚡ Insight Engine',
    desc: '<div style="font-size:13px;line-height:1.85;">'
        + 'The <strong style="color:var(--pro);">Insight Engine</strong> gives you a 5-pillar forward-looking signal on any coin in your holdings or watchlist:<br><br>'
        + '<div style="display:grid;gap:6px;font-size:11px;line-height:1.6;">'
          + '<div><strong style="color:var(--green);">Momentum Reset</strong> — oversold/overbought detection</div>'
          + '<div><strong style="color:var(--bnb);">Liquidity Trap</strong> — volume vs market cap analysis</div>'
          + '<div><strong style="color:var(--pro);">Dilution Shield</strong> — token unlock risk assessment</div>'
          + '<div><strong style="color:#87CEEB;">Contrarian Sentiment</strong> — Fear & Greed signals</div>'
          + '<div><strong style="color:var(--green);">Relative Strength</strong> — performance vs BTC</div>'
        + '</div><br>'
        + '<span style="font-size:11px;color:var(--muted);">Click any coin in your holdings to see its Insight score.</span>'
        + '</div>',
    arrow: 'top', pos: 'center', wide: true
  },

  /* Step 5: Best Time to Swap */
  {
    target: '#ratio-section',
    title: '↔ Best Time to Swap',
    desc: '<div style="font-size:13px;line-height:1.85;">'
        + 'The Swap Tool now shows <strong style="color:var(--green);">support and resistance levels</strong> on the ratio chart — green dashed lines marking the best swap zone.<br><br>'
        + '<strong>BEST SWAP ▲</strong> — when the ratio hits the <strong>resistance level</strong> (75th percentile), you get maximum value for your swap.<br><br>'
        + '<strong style="color:var(--bnb);">SUPPORT ▼</strong> — when the ratio drops to the <strong>support level</strong> (25th percentile), it may be better to wait.<br><br>'
        + '<span style="font-size:11px;color:var(--muted);">Use the calculator below the chart to simulate exact amounts before executing.</span>'
        + '</div>',
    arrow: 'right', pos: 'swap-tool', wide: false
  },

  /* Step 6: Pro holdings */
  {
    target: '#my-holdings-panel',
    title: 'Pro Holdings (Up to 10)',
    desc: '<div style="font-size:13px;line-height:1.85;">'
        + 'Your holdings limit has been raised to <strong>10 assets</strong>. Track your full portfolio with advanced insights on each coin.<br><br>'
        + 'The <strong style="color:var(--bnb);">Portfolio Signal</strong> improves with more data — it compares your holdings against each other and against the broader market to surface rotation opportunities.<br><br>'
        + '<strong>Full Rotation Signals</strong> — all 4 rotation pair slots are now unlocked in the Signal Center above.'
        + '</div>',
    arrow: 'left', pos: 'left-panel-right'
  },

  /* Step 7: Recovery key */
  {
    target: '.settings-btn',
    title: 'Save Your Recovery Key',
    desc: '<div style="font-size:13px;line-height:1.85;">'
        + 'Your Pro status is <strong>synced to the cloud</strong>. To access it on another device or browser:<br><br>'
        + '<strong>1.</strong> Open Pro settings (click ⚡ in the top bar)<br>'
        + '<strong>2.</strong> Copy your <strong>Recovery Key</strong><br>'
        + '<strong>3.</strong> Paste it on the new device to restore Pro<br><br>'
        + '<span style="font-size:11px;color:var(--muted);">You can replay this tutorial anytime from the ⚙ gear menu.</span>'
        + '</div>',
    arrow: 'right', pos: 'gear'
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
