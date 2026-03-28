/* ══════════════════════════════════════════════════════════════════

   tutorial.js — Step-by-step onboarding tutorial

   HOW TO EDIT THIS FILE:
   ──────────────────────
   • ADD/REMOVE STEPS: Edit the TUT_STEPS array below.
     Each step needs: target (CSS selector), title, desc (HTML), arrow,
     pos, and optionally agree:true for the checkbox step.

   • CHANGE STEP CONTENT: Just edit the title or desc string in
     the relevant step object.

   • DISABLE TUTORIAL BY DEFAULT: Change the initTutorial() function
     — find isOn = (val === null || val === 'on') and change to
     isOn = (val === 'on') so new users don't see it automatically.

══════════════════════════════════════════════════════════════════ */

var TUT_KEY = 'rot_tutorial_on';
var tutStep_ = 0;
var tutActive = false;

/* ── Tutorial steps ──────────────────────────────────────────── */

var TUT_STEPS = [

  /* Step 1: Welcome — centered on screen like a welcome splash */
  {
    target: '.topbar',
    title: 'Welcome to ROTATOR',
    desc: '<strong>Rotator</strong> is a daily performance tracker for crypto, forex and stocks. It measures price momentum across <strong>24H, 7D, 14D and 30D</strong> and surfaces opportunities to improve portfolio performance over time.<br><br>'
        + '<strong>What is rotation?</strong> If you hold two assets and one has fallen 17% while the other only fell 5%, rotating part of the weaker position into the stronger one recovers value without adding capital. Over time, compounding these small adjustments significantly improves performance.<br><br>'
        + '<strong>Multi-timeframe scoring</strong> surfaces sustained trends, not just recent noise. A coin ranked highly across 7D, 14D <em>and</em> 30D is behaving very differently from one that just had a single good week.',
    arrow: 'top', pos: 'center', wide: true
  },

  /* Step 2: Holdings panel — box appears to the right of the panel, anchored near the top */
  {
    target: '.add-form',
    title: 'Your Holdings Panel',
    desc: '<div style="font-size:15px;line-height:1.9;">This panel is your portfolio tracker. Add any coin with quantity and average buy price — data is saved in your browser, no account needed.<br><br>'
        + 'Once you add holdings, the <strong>Portfolio Signal</strong> box scores your overall portfolio and flags which assets are lagging or outperforming.<br><br>'
        + '<span style="font-size:12px;color:rgba(255,255,255,.7);">Free tier: up to <strong>2 crypto</strong> holdings · upgrade to Pro for up to 10, plus Rotation Signals, by sharing with 3 friends.</span>',
    arrow: 'left', pos: 'right-high'
  },

  /* Step 3: Signal center */
  {
    target: '.neon-section',
    title: 'Signal Center',
    desc: '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;font-size:16px;line-height:1.8;">'
        + '<div><div style="font-size:10px;letter-spacing:.12em;color:rgba(255,255,255,.5);margin-bottom:5px;">ROTATION OPPS ↑ ⚡</div>'
        + '<div style="color:#4ade80;font-size:17px;font-weight:600;margin-bottom:5px;">↑ Rotate</div>'
        + 'Pairs from your holdings where rotating makes sense. The score gap shows how much one coin is outpacing another. <strong style="color:var(--pro);">Pro feature</strong> — unlock free by sharing with 3 friends.</div>'
        + '<div><div style="font-size:10px;letter-spacing:.12em;color:rgba(255,255,255,.5);margin-bottom:5px;">HIGH MOMENTUM ⚡</div>'
        + '<div style="color:#f3ba2f;font-size:17px;font-weight:600;margin-bottom:5px;">⚡ Leading</div>'
        + 'Top 6 coins by composite score across all timeframes. Sustained strength, not single-week spikes.</div>'
        + '<div><div style="font-size:10px;letter-spacing:.12em;color:rgba(255,255,255,.5);margin-bottom:5px;">WORST 30D ↓</div>'
        + '<div style="color:#ff4560;font-size:17px;font-weight:600;margin-bottom:5px;">↓ Lagging</div>'
        + 'Biggest 30-day losers. Potential bounce candidates — or assets to exit. Click any tile for the full breakdown.</div>'
        + '</div>',
    arrow: 'top', pos: 'below', wide: true
  },

  /* Step 4: Leaderboard + disclaimer */
  {
    target: '.leaderboard',
    title: 'Leaderboard — Scores — Disclaimer',
    desc: '<div style="font-size:14px;line-height:1.9;">'
        + '<strong>100 coins</strong> ranked across <strong style="color:#ffffff;">24H · 7D · 14D · 30D</strong>. Click any column header to sort. Click any row for a full score breakdown.<br><br>'
        + 'The <strong>Score</strong> combines three layers:<br>'
        + '<strong>L1</strong> Momentum rank vs all 50 coins &nbsp;·&nbsp; <strong>L2</strong> Relative strength vs BTC, Gold, Silver, Oil &nbsp;·&nbsp; <strong>L3</strong> Tokenomics quality<br><br>'
        + '<div style="background:rgba(255,69,96,.07);border:1px solid rgba(255,69,96,.3);border-radius:4px;padding:10px 12px;">'
        + '<strong style="color:#ff4560;">⚠ NOT FINANCIAL ADVICE</strong><br>'
        + 'Rotator tracks historical price data. Scores do not predict future performance. A coin that has fallen for months will not automatically recover. Nothing here constitutes investment advice. Always research before trading. <strong>Never risk money you cannot afford to lose.</strong>'
        + '</div></div>',
    arrow: 'bottom', pos: 'above', wide: true, agree: true,
    agreeText: 'I understand that Rotator is not financial advice and I am solely responsible for my own investment decisions.'
  },

  /* Step 5: All set */
  {
    target: '.settings-btn',
    title: "You're all set.",
    desc: '<div style="font-size:14px;line-height:1.9;">'
        + 'Data refreshes every 15 minutes automatically. Hit <strong>↻ REFRESH</strong> to force a fresh fetch at any time.<br><br>'
        + '<strong style="color:var(--pro);">⚡ Unlock Pro free</strong> by sharing Rotator with 3 friends — this gives you up to 10 portfolio holdings and full Rotation Signals. Or support the project with a donation for an instant unlock code.<br><br>'
        + 'Click the <strong>⚙ gear icon</strong> (highlighted) to change language, toggle asset modes, or replay this tutorial.'
        + '</div>',
    arrow: 'right', pos: 'gear'
  },

  /* Step 6: Swap Tool */
  {
    target: '#ratio-section',
    title: '↔ Swap Tool — Best Time to Swap',
    desc: '<div style="font-size:14px;line-height:1.9;">'
        + 'The <strong style="color:var(--bnb);">Swap Tool</strong> in the right panel helps you find the <strong>optimal moment</strong> to swap one asset for another — not based on guesswork, but on tracking the live price <strong>ratio</strong> between them over time.<br><br>'
        + 'Pick your FROM asset (what you hold) and TO asset (what you want). The ratio shows how many TO coins you receive per 1 FROM coin. When the ratio is near its <strong style="color:var(--green);">period peak ▲</strong>, you get maximum value for your swap.<br><br>'
        + '<span style="font-size:12px;color:rgba(255,255,255,.6);">Use the Swap Calculator to simulate exact amounts. Always verify on your exchange before executing.</span>'
        + '</div>',
    arrow: 'right', pos: 'above-left', wide: true
  }
];

/* ── Tutorial engine ─────────────────────────────────────────── */

function tutCheckAgree() {
  var chk = document.getElementById('tut-agree-chk');
  document.getElementById('tut-next').disabled = !chk.checked;
}

function tutGetEl(selector) { return document.querySelector(selector); }

/* ── Mobile-safe positioning ─────────────────────────────────── */
function tutPosition() {
  var step = TUT_STEPS[tutStep_];
  var el   = tutGetEl(step.target);
  var hole = document.getElementById('tut-hole');
  var box  = document.getElementById('tut-box');
  var vw   = window.innerWidth;
  var vh   = window.innerHeight;

  /* Mobile: always center, fill width, scroll internally */
  if (vw < 600) {
    hole.style.display  = 'none';
    var mg = 16;
    box.style.left      = mg + 'px';
    box.style.top       = Math.round(vh * 0.06) + 'px';
    box.style.width     = (vw - mg * 2) + 'px';
    box.style.maxHeight = (vh * 0.82) + 'px';
    box.style.overflowY = 'auto';
    box.className       = 'tut-box';
    return;
  }

  /* Desktop — two-pass: set position estimate, then correct after paint */
  box.style.maxHeight = '';
  box.style.overflowY = '';

  if (!el) { tutGoNext(); return; }
  var r = el.getBoundingClientRect();

  /* Element hidden/off-screen → center */
  if (r.width === 0 && r.height === 0) {
    hole.style.display = 'none';
    var bw = step.wide ? Math.min(vw - 40, 620) : 360;
    box.style.width = bw + 'px';
    box.style.left  = ((vw - bw) / 2) + 'px';
    box.style.top   = Math.max(60, vh * 0.12) + 'px';
    box.className   = 'tut-box';
    return;
  }

  /* Highlight hole */
  hole.style.display  = 'block';
  var pad = 8;
  hole.style.left   = (r.left - pad) + 'px';
  hole.style.top    = (r.top  - pad) + 'px';
  hole.style.width  = (r.width  + pad * 2) + 'px';
  hole.style.height = (r.height + pad * 2) + 'px';

  if (step.pos === 'center') {
    hole.style.display = 'none';
    var bw = step.wide ? Math.min(vw - 40, 620) : 380;
    box.style.width = bw + 'px';
    box.style.left  = ((vw - bw) / 2) + 'px';
    box.style.top   = Math.max(60, vh * 0.18) + 'px';
    box.className   = 'tut-box';
    return;
  }

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

  /* General positioning — set width first, then use rAF to read real height */
  var bw = step.wide ? Math.min(vw - 40, Math.max(600, r.width)) : 320;
  box.style.width = bw + 'px';
  box.className   = 'tut-box arrow-' + step.arrow;

  /* Use requestAnimationFrame so box.offsetHeight reflects real rendered height */
  requestAnimationFrame(function() {
    var bh = box.offsetHeight || 260;
    var margin = 14;
    var bx, by;

    if      (step.pos === 'below')      { bx = r.left; by = r.bottom + pad + margin; }
    else if (step.pos === 'above')      { bx = r.left; by = r.top - pad - margin - bh; }
    else if (step.pos === 'above-left') { bx = r.left; by = r.top - pad - margin - bh - 60; }
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

  document.getElementById('tut-step-label').textContent = 'STEP ' + (tutStep_+1) + ' OF ' + TUT_STEPS.length;
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
  if      (tutStep_ === TUT_STEPS.length - 1) nextBtn.textContent = 'Finish ✓';
  else if (showAgree)                          nextBtn.textContent = 'I Agree →';
  else                                         nextBtn.textContent = 'Next →';

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
  /* Default: ON for new users (no key stored yet) */
  var isOn = (val === null || val === 'on');
  document.getElementById('tut-toggle').checked = isOn;
  if (isOn) setTimeout(startTutorial, 800);
}

window.addEventListener('resize', function() { if (tutActive) tutPosition(); });
