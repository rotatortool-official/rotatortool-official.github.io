/* ══════════════════════════════════════════════════════════════════
   pro-system.js  —  Pro tier, referral links, donation codes
   
   HOW TO EDIT THIS FILE:
   ──────────────────────
   • Codes and goals are in config.js, not here.
   • This file just handles the logic: checking codes, referral
     tracking, tier badge, and the Pro modal content.
   • If you want to change the Pro modal wording, search for
     openPro() below.
══════════════════════════════════════════════════════════════════ */

/* ── State (loaded from localStorage) ─────────────────────────── */
var isPro = loadPro();

function loadPro()  { return getRefData().pro; }
function savePro(v) { var d = getRefData(); d.pro = v; saveRefData(d); }

/* ── Referral system helpers ─────────────────────────────────── */
function genId()      { return Math.random().toString(36).slice(2, 9); }
function getMyId()    { var id = localStorage.getItem('rot_uid'); if (!id) { id = genId(); localStorage.setItem('rot_uid', id); } return id; }
function getMyReferralLink() { return window.location.origin + window.location.pathname + '?ref=' + getMyId(); }

function getRefData()    { try { return JSON.parse(localStorage.getItem('rot_refs') || '{"refs":[],"pro":false}'); } catch(e) { return {refs:[], pro:false}; } }
function saveRefData(d)  { try { localStorage.setItem('rot_refs', JSON.stringify(d)); } catch(e) {} }

function processIncomingRef() {
  var p = new URLSearchParams(window.location.search), refId = p.get('ref');
  if (!refId || refId === getMyId()) return;
  localStorage.setItem('rot_came_from', refId);
}

function creditReferrer() {
  var from = localStorage.getItem('rot_came_from');
  if (!from || localStorage.getItem('rot_credited_' + from)) return;
  var key = 'rot_credit_for_' + from, ex = [];
  try { ex = JSON.parse(localStorage.getItem(key) || '[]'); } catch(e) {}
  var me = getMyId(); if (ex.indexOf(me) < 0) { ex.push(me); localStorage.setItem(key, JSON.stringify(ex)); }
  localStorage.setItem('rot_credited_' + from, '1');
}

function checkMyReferrals() {
  var key = 'rot_credit_for_' + getMyId(), cr = [];
  try { cr = JSON.parse(localStorage.getItem(key) || '[]'); } catch(e) {}
  var d = getRefData();
  cr.forEach(function(u) { if (d.refs.indexOf(u) < 0) d.refs.push(u); });
  if (d.refs.length >= 3 && !d.pro) {
    d.pro = true; showProToast();
    /* Sync to Supabase */
    if (typeof supaSavePro === 'function') supaSavePro(getMyId(), 'referral');
  }
  saveRefData(d); return d;
}

function showProToast() {
  var t = document.createElement('div');
  t.style.cssText = 'position:fixed;top:56px;left:50%;transform:translateX(-50%);background:#1a2030;border:1px solid #a78bfa;border-radius:6px;padding:14px 22px;font-family:IBM Plex Mono,monospace;font-size:12px;color:#a78bfa;z-index:900;text-align:center;box-shadow:0 0 30px rgba(167,139,250,.2);letter-spacing:.06em;';
  t.innerHTML = '⚡ PRO UNLOCKED — 3 friends joined!<br><span style="font-size:10px;color:#3e4d60;margin-top:4px;display:block;">All 200 coins + stablecoin yields available.</span>';
  document.body.appendChild(t);
  setTimeout(function() { t.style.transition = 'opacity .5s'; t.style.opacity = '0'; setTimeout(function() { t.remove(); }, 500); }, 4000);
}

/* ── Tier badge ──────────────────────────────────────────────── */
function updateTierBadge() {
  var b  = document.getElementById('tier-badge');
  var pb = document.querySelector('.btn.pro-btn');
  var count = getRefData().refs.length;
  if (isPro) {
    b.className = 'tier-badge pro'; b.textContent = '⚡ PRO · TOP 200';
    if (pb) { pb.textContent = '⚡ PRO ACTIVE'; pb.style.opacity = '.6'; }
  } else {
    b.className = 'tier-badge free'; b.textContent = 'FREE · TOP 200';
    if (pb) { pb.textContent = count > 0 ? '⚡ UNLOCK PRO (' + count + '/3)' : '⚡ UNLOCK PRO'; pb.style.opacity = ''; }
  }
}

/* ── Pro modal ───────────────────────────────────────────────── */
function openPro() {
  var body  = document.getElementById('pro-modal-body');
  var d     = checkMyReferrals();
  var count = d.refs.length, needed = 3, link = getMyReferralLink();
  var pct   = Math.round(count / needed * 100);

  var _ = (typeof t === 'function') ? t : function(k){ return k; };

  if (isPro) {
    body.innerHTML = '<div class="already-pro">'
      + '<div class="already-pro-icon">⚡</div>'
      + '<div class="already-pro-txt">' + _('pro_active') + '</div>'
      + '<div class="already-pro-sub">' + count + _('pro_active_sub_1') + '</div>'
      + '<div style="margin-top:14px;background:var(--bg3);border:1px solid var(--bdr2);border-radius:4px;padding:12px 14px;">'
        + '<div style="font-size:10px;color:var(--muted);letter-spacing:.12em;margin-bottom:8px;">' + _('pro_coming') + '</div>'
        + '<div style="font-size:11px;color:var(--text);line-height:2;">◈ <strong style="color:var(--bnb)">' + _('pro_coming_1') + '</strong> rotation tracker<br>◈ <strong style="color:var(--pro)">' + _('pro_coming_2') + '</strong> performance screener<br>◈ ' + _('pro_coming_3') + '</div>'
      + '</div>'
      + '<div style="margin-top:14px;background:var(--bg3);border:1px solid var(--bdr2);border-radius:4px;padding:12px 14px;">'
        + '<div style="font-size:10px;color:var(--muted);letter-spacing:.12em;margin-bottom:8px;">YOUR RECOVERY KEY</div>'
        + '<div style="font-size:10px;color:var(--muted);line-height:1.6;margin-bottom:8px;">Save this key to restore Pro on another device or browser:</div>'
        + '<div style="display:flex;gap:6px;">'
          + '<input class="code-input" id="recovery-key-display" value="' + getMyId() + '" readonly onclick="this.select()" style="font-size:11px;font-weight:600;color:var(--pro);letter-spacing:.08em;">'
          + '<button class="code-btn" onclick="copyRecoveryKey()">COPY</button>'
        + '</div>'
      + '</div>'
      + '<button class="revoke-btn" onclick="revokePro()">' + _('pro_revoke') + '</button>'
      + '</div>';
  } else {
    /* ── PRO PLANS ── */
    var plansHtml = '<div class="pro-plans-row">';
    PRO_PLANS.forEach(function(plan) {
      plansHtml += '<a href="https://skrill.me/YourName/' + plan.price + '" target="_blank" rel="noopener" class="pro-plan-card" onclick="showTipScreen()">'
        + '<div class="pro-plan-price">$' + plan.price + '</div>'
        + '<div class="pro-plan-dur">' + plan.label + '</div>'
        + '<div class="pro-plan-badge">' + plan.badge + '</div>'
        + '</a>';
    });
    plansHtml += '</div>';

    body.innerHTML = '<div class="modal-title">⚡ Unlock Pro</div>'
      + '<div class="modal-sub">Support development and unlock the full power of Rotator.</div>'

      /* ── FREE vs PRO comparison ── */
      + '<div style="background:var(--bg3);border:1px solid rgba(167,139,250,.2);border-radius:4px;padding:12px 14px;margin-bottom:14px;">'
        + '<div style="display:flex;gap:12px;margin-bottom:10px;">'
          + '<div style="flex:1;font-size:10px;letter-spacing:.12em;color:var(--muted);text-transform:uppercase;">FREE</div>'
          + '<div style="flex:1;font-size:10px;letter-spacing:.12em;color:var(--pro);text-transform:uppercase;text-align:right;">⚡ PRO</div>'
        + '</div>'
        + '<div style="font-size:11px;color:var(--text);line-height:2.4;">'
          + '<div style="display:flex;justify-content:space-between;"><span>Top 50 coins</span><span style="color:var(--pro);">Top 200 coins</span></div>'
          + '<div style="display:flex;justify-content:space-between;"><span>3 categories</span><span style="color:var(--pro);">All 10 categories</span></div>'
          + '<div style="display:flex;justify-content:space-between;"><span>5 holdings max</span><span style="color:var(--pro);">Unlimited holdings</span></div>'
          + '<div style="display:flex;justify-content:space-between;"><span style="color:var(--muted);">—</span><span style="color:var(--pro);">⚡ Insight Engine</span></div>'
          + '<div style="display:flex;justify-content:space-between;"><span style="color:var(--muted);">—</span><span style="color:var(--pro);">↔ Best Time to Swap</span></div>'
          + '<div style="display:flex;justify-content:space-between;"><span style="color:var(--muted);">—</span><span style="color:var(--pro);">💵 Stablecoin Yields</span></div>'
          + '<div style="display:flex;justify-content:space-between;"><span style="color:var(--muted);">—</span><span style="color:var(--pro);">📊 Score Breakdown</span></div>'
        + '</div>'
      + '</div>'

      /* ── Tier plan cards ── */
      + '<div style="font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);margin-bottom:8px;">CHOOSE YOUR PLAN</div>'
      + plansHtml

      /* ── OR use crypto ── */
      + '<div style="text-align:center;margin:10px 0 6px;font-size:9px;color:var(--muted);letter-spacing:.12em;">— OR DONATE CRYPTO —</div>'
      + '<div style="text-align:center;margin-bottom:10px;">'
        + '<a href="#" onclick="closeModal(\'pro-modal\');openModal(\'donate-modal\');return false;" style="font-size:11px;color:var(--bnb);text-decoration:none;font-weight:600;">☕ Send USDT (TRC20) →</a>'
      + '</div>'

      /* ── Free referral option ── */
      + '<div class="pro-divider"></div>'
      + '<div style="font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:var(--green);margin-bottom:8px;">FREE OPTION — REFER 3 FRIENDS</div>'
      + '<div class="pro-steps" id="ref-steps">'
        + '<div class="pro-step"><div class="step-num">1</div><div class="step-txt">' + _('pro_step1') + '</div></div>'
        + '<div class="pro-step"><div class="step-num">2</div><div class="step-txt">' + _('pro_step2') + '</div></div>'
        + '<div class="pro-step"><div class="step-num">3</div><div class="step-txt">' + _('pro_step3') + '</div></div>'
      + '</div>'
      + '<div style="display:flex;gap:6px;margin-bottom:10px;">'
        + '<input class="code-input" id="ref-link-display" value="' + link + '" readonly onclick="this.select()" style="font-size:10px;">'
        + '<button class="code-btn" id="copy-ref-btn" onclick="copyRefLink()">' + _('pro_copy') + '</button>'
      + '</div>'
      + '<div style="font-size:10px;color:var(--muted);line-height:1.8;text-align:center;">'
        + _('pro_progress') + '<strong style="color:var(--pro);">' + count + ' / ' + needed + _('pro_friends') + '</strong>' + _('pro_joined')
        + (count > 0 ? '<div style="width:100%;height:3px;background:var(--bg4);border-radius:2px;margin-top:5px;"><div style="width:' + pct + '%;height:100%;background:var(--pro);border-radius:2px;transition:width .4s;"></div></div>' : '')
      + '</div>'

      /* ── Pro code ── */
      + '<div class="pro-divider"></div>'
      + '<div style="text-align:center;margin-top:6px;">'
        + '<div style="font-size:10px;color:var(--muted);letter-spacing:.08em;margin-bottom:8px;">HAVE A PRO CODE?</div>'
        + '<div style="display:flex;gap:6px;">'
          + '<input class="code-input" id="pro-code-input" placeholder="Enter your Pro code" style="font-size:11px;">'
          + '<button class="code-btn" onclick="checkProCode()">REDEEM</button>'
        + '</div>'
        + '<div id="pro-code-err" style="font-size:10px;margin-top:6px;min-height:14px;color:var(--red);"></div>'
      + '</div>'

      /* ── Recovery key ── */
      + '<div class="pro-divider"></div>'
      + '<div style="text-align:center;margin-top:6px;">'
        + '<div style="font-size:10px;color:var(--muted);letter-spacing:.08em;margin-bottom:8px;">ALREADY HAVE PRO ON ANOTHER DEVICE?</div>'
        + '<div style="display:flex;gap:6px;">'
          + '<input class="code-input" id="restore-key-input" placeholder="Enter your recovery key" style="font-size:11px;">'
          + '<button class="code-btn" onclick="restoreProFromKey()">RESTORE</button>'
        + '</div>'
        + '<div id="restore-err" style="font-size:10px;margin-top:6px;min-height:14px;"></div>'
      + '</div>';
  }

  openModal('pro-modal');
  setTimeout(function() {
    var c = document.getElementById('pro-sparkle-c');
    if (c) startSparkle(c);
  }, 100);
}

/* ── Pro code redemption ─────────────────────────────────────── */
function checkProCode() {
  var inp = document.getElementById('pro-code-input');
  var err = document.getElementById('pro-code-err');
  if (!inp || !err) return;
  var code = (inp.value || '').trim().toUpperCase();
  if (!code) { err.textContent = 'Please enter a code.'; return; }

  var valid = VALID_CODES.indexOf(code) >= 0;
  if (!valid) {
    err.textContent = '❌ Invalid code. Check for typos or contact us.';
    inp.style.borderColor = 'var(--red)';
    return;
  }

  var usedKey = 'rot_used_code_' + code;
  try {
    if (localStorage.getItem(usedKey) === '1') {
      err.textContent = '⚠ This code has already been used on this device.';
      inp.style.borderColor = 'var(--amber)';
      return;
    }
  } catch(e) {}

  try { localStorage.setItem(usedKey, '1'); } catch(e) {}
  isPro = true; savePro(true);
  updateTierBadge();
  incrementDonationCount();
  /* Sync to Supabase */
  if (typeof supaSavePro === 'function') supaSavePro(getMyId(), code);
  closeModal('pro-modal');

  var t = document.createElement('div');
  t.style.cssText = 'position:fixed;top:56px;left:50%;transform:translateX(-50%);background:var(--bg2);border:1px solid var(--pro);border-radius:6px;padding:14px 22px;font-family:IBM Plex Mono,monospace;font-size:12px;color:var(--pro);z-index:900;text-align:center;box-shadow:0 0 30px rgba(167,139,250,.2);letter-spacing:.06em;';
  t.innerHTML = '⚡ PRO UNLOCKED — Welcome!<br><span style="font-size:10px;color:var(--muted);margin-top:4px;display:block;">Thank you for supporting Rotator ♥</span>';
  document.body.appendChild(t);
  setTimeout(function() { t.style.transition = 'opacity .5s'; t.style.opacity = '0'; setTimeout(function() { t.remove(); }, 500); }, 3500);
  renderAll();
}

function copyRefLink() {
  var link = getMyReferralLink(), btn = document.getElementById('copy-ref-btn');
  var done = function() { btn.textContent = '✓ COPIED!'; btn.classList.add('ok'); setTimeout(function() { btn.textContent = 'COPY REFERRAL LINK'; btn.classList.remove('ok'); }, 2500); };
  if (navigator.clipboard) { navigator.clipboard.writeText(link).then(done).catch(done); }
  else { var t = document.createElement('textarea'); t.value = link; document.body.appendChild(t); t.select(); document.execCommand('copy'); document.body.removeChild(t); done(); }
}

function revokePro() {
  isPro = false; savePro(false);
  closeModal('pro-modal');
  updateTierBadge();
  doRefresh();
}

/* ── Donation goal tracker ───────────────────────────────────── */
function getDonationPct() { return Math.min(100, Math.round((DONATION_CURRENT / DONATION_GOAL) * 100)); }

function incrementDonationCount() {
  try { var n = parseInt(localStorage.getItem('rot_donation_est') || '0') + 1; localStorage.setItem('rot_donation_est', String(n)); } catch(e) {}
}

function getVisitStats() {
  try {
    var today = new Date().toISOString().slice(0, 10);
    var data  = JSON.parse(localStorage.getItem('rot_visits') || '{"total":0,"lastDay":"","dailyStreak":0}');
    if (data.lastDay !== today) {
      data.total = (data.total || 0) + 1;
      data.dailyStreak = (data.lastDay === getPrevDay(today)) ? (data.dailyStreak || 0) + 1 : 1;
      data.lastDay = today;
      localStorage.setItem('rot_visits', JSON.stringify(data));
    }
    return data;
  } catch(e) { return {total:1, dailyStreak:1}; }
}
function getPrevDay(dateStr) { var d = new Date(dateStr); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); }

function renderDonationBar(containerId) {
  var el = document.getElementById(containerId);
  if (!el) return;
  var pct = getDonationPct();
  var barColor = pct >= 100 ? 'var(--green)' : pct >= 60 ? 'var(--amber)' : 'var(--bnb)';
  el.innerHTML =
    '<div style="margin-bottom:6px;display:flex;align-items:center;justify-content:space-between;">'
    + '<span style="font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);">Monthly Goal</span>'
    + '<span style="font-size:10px;font-weight:700;color:' + barColor + ';">$' + DONATION_CURRENT + ' / $' + DONATION_GOAL + '</span>'
    + '</div>'
    + '<div style="height:4px;background:var(--bg4);border-radius:2px;overflow:hidden;margin-bottom:5px;">'
    + '<div style="width:' + pct + '%;height:100%;background:' + barColor + ';border-radius:2px;transition:width .6s ease;"></div>'
    + '</div>'
    + '<div style="font-size:9px;color:var(--muted);">'
    + (pct >= 100 ? '<span style="color:var(--green);">✓ Goal reached this month!</span>'
                  : '<span style="color:' + barColor + ';">' + pct + '%</span> of ' + DONATION_LABEL)
    + '</div>';
}

/* Clipboard helper used for donation address copy */
function copyAddr(addr, btnId) {
  var btn  = document.getElementById(btnId);
  var copy = function() { btn.textContent = '✓ COPIED!'; btn.classList.add('ok'); setTimeout(function() { btn.textContent = 'COPY ADDRESS'; btn.classList.remove('ok'); }, 2500); };
  if (navigator.clipboard) { navigator.clipboard.writeText(addr).then(copy).catch(copy); }
  else { var t = document.createElement('textarea'); t.value = addr; document.body.appendChild(t); t.select(); document.execCommand('copy'); document.body.removeChild(t); copy(); }
}

/* ── Recovery key helpers ────────────────────────────────────── */
function copyRecoveryKey() {
  var inp = document.getElementById('recovery-key-display');
  var val = inp ? inp.value : getMyId();
  var done = function() {
    var btn = inp.nextElementSibling;
    if (btn) { btn.textContent = '✓ COPIED!'; btn.classList.add('ok'); setTimeout(function() { btn.textContent = 'COPY'; btn.classList.remove('ok'); }, 2500); }
  };
  if (navigator.clipboard) { navigator.clipboard.writeText(val).then(done).catch(done); }
  else { var t = document.createElement('textarea'); t.value = val; document.body.appendChild(t); t.select(); document.execCommand('copy'); document.body.removeChild(t); done(); }
}

function restoreProFromKey() {
  var inp = document.getElementById('restore-key-input');
  var err = document.getElementById('restore-err');
  if (!inp || !err) return;
  var key = (inp.value || '').trim();
  if (!key) { err.style.color = 'var(--red)'; err.textContent = 'Please enter your recovery key.'; return; }

  err.style.color = 'var(--muted)'; err.textContent = 'Checking...';

  if (typeof supaRecoverPro !== 'function') {
    err.style.color = 'var(--red)'; err.textContent = 'Recovery service unavailable. Try again later.';
    return;
  }

  supaRecoverPro(key).then(function(ok) {
    if (ok) {
      err.style.color = 'var(--green)'; err.textContent = '⚡ Pro restored! Reloading...';
      setTimeout(function() { location.reload(); }, 1200);
    } else {
      err.style.color = 'var(--red)'; err.textContent = 'No Pro found for this key. Check and try again.';
    }
  }).catch(function() {
    err.style.color = 'var(--red)'; err.textContent = 'Connection error. Try again later.';
  });
}

/* ── Pro feature gates ──────────────────────────────────────── */
function updateProGates() {
  /* Swap tool gate */
  var swapGate = document.getElementById('swap-pro-gate');
  var swapBody = document.getElementById('ratio-section');
  if (swapGate && swapBody) {
    swapGate.style.display = isPro ? 'none' : 'block';
    swapBody.style.display = isPro ? '' : 'none';
  }
}

/* ── Skrill helpers ──────────────────────────────────────────── */
function sendSkrill() {
  var amount = document.getElementById('skrill-custom-amount').value;
  if (!amount || amount < 1) { document.getElementById('skrill-custom-amount').style.borderColor = 'var(--red)'; return; }
  document.getElementById('skrill-custom-amount').style.borderColor = '';
  window.open('https://skrill.me/YourName/' + amount, '_blank');
  showTipScreen();
}

function showTipScreen() {
  setTimeout(function() { openModal('tip-modal'); }, 800);
}

/* Init on page load */
(function() {
  try { getVisitStats(); } catch(e) {}
  /* Apply Pro gates as soon as DOM is ready */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      if (typeof initCategoryLocks === 'function') initCategoryLocks();
      updateProGates();
    });
  } else {
    setTimeout(function() {
      if (typeof initCategoryLocks === 'function') initCategoryLocks();
      updateProGates();
    }, 0);
  }
})();
