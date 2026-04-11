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

function loadPro() {
  var d = getRefData();
  if (!d.pro) return false;
  /* Check expiry if set */
  if (d.pro_expires) {
    var now = Date.now();
    if (now > d.pro_expires) {
      d.pro = false; d.pro_expires = null; saveRefData(d);
      return false;
    }
  }
  return true;
}
function savePro(v) { var d = getRefData(); d.pro = v; saveRefData(d); }
function saveProWithExpiry(months) {
  var d = getRefData();
  d.pro = true;
  d.pro_expires = Date.now() + (months * 30 * 24 * 60 * 60 * 1000);
  saveRefData(d);
}
function getProDaysLeft() {
  var d = getRefData();
  if (!d.pro || !d.pro_expires) return -1; /* -1 = lifetime/referral */
  var ms = d.pro_expires - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}
function getProExpiry() {
  var d = getRefData();
  return d.pro_expires || null;
}

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
  var me = getMyId();

  /* Save locally (backwards compat) */
  var key = 'rot_credit_for_' + from, ex = [];
  try { ex = JSON.parse(localStorage.getItem(key) || '[]'); } catch(e) {}
  if (ex.indexOf(me) < 0) { ex.push(me); localStorage.setItem(key, JSON.stringify(ex)); }
  localStorage.setItem('rot_credited_' + from, '1');

  /* Save to Supabase (verifiable, cross-device) */
  if (typeof supaSaveReferral === 'function') {
    supaSaveReferral(from, me);
  }
}

function checkMyReferrals() {
  var d = getRefData();

  /* Check Supabase for verified referral count (async, non-blocking) */
  var REF_NEEDED = (typeof REFERRAL_NEEDED !== 'undefined') ? REFERRAL_NEEDED : 5;
  if (typeof supaCountReferrals === 'function' && !d.pro) {
    supaCountReferrals(getMyId()).then(function(count) {
      if (count >= REF_NEEDED && !isPro) {
        isPro = true; savePro(true);
        var dd = getRefData(); dd.pro = true; dd.refs = []; for (var i = 0; i < count; i++) dd.refs.push('supa-' + i); saveRefData(dd);
        showProToast();
        if (typeof supaSavePro === 'function') supaSavePro(getMyId(), 'referral');
        updateTierBadge();
        if (typeof initCategoryLocks === 'function') initCategoryLocks();
        updateProGates();
      }
    });
  }

  /* Also check localStorage (fallback for same-browser referrals) */
  var key = 'rot_credit_for_' + getMyId(), cr = [];
  try { cr = JSON.parse(localStorage.getItem(key) || '[]'); } catch(e) {}
  cr.forEach(function(u) { if (d.refs.indexOf(u) < 0) d.refs.push(u); });
  if (d.refs.length >= REF_NEEDED && !d.pro) {
    d.pro = true; showProToast();
    if (typeof supaSavePro === 'function') supaSavePro(getMyId(), 'referral');
  }
  saveRefData(d); return d;
}

function showProToast() {
  var t = document.createElement('div');
  t.style.cssText = 'position:fixed;top:56px;left:50%;transform:translateX(-50%);background:#1a2030;border:1px solid #a78bfa;border-radius:6px;padding:14px 22px;font-family:IBM Plex Mono,monospace;font-size:12px;color:#a78bfa;z-index:900;text-align:center;box-shadow:0 0 30px rgba(167,139,250,.2);letter-spacing:.06em;';
  t.innerHTML = '⚡ PRO UNLOCKED — 5 friends joined!<br><span style="font-size:12px;color:#3e4d60;margin-top:4px;display:block;">All 200 coins + stablecoin yields available.</span>';
  document.body.appendChild(t);
  setTimeout(function() { t.style.transition = 'opacity .5s'; t.style.opacity = '0'; setTimeout(function() { t.remove(); }, 500); }, 4000);
  /* Start Pro tutorial after toast */
  setTimeout(function() { if (typeof startProTutorial === 'function') startProTutorial(); }, 2500);
}

/* ── Tier badge ──────────────────────────────────────────────── */
function updateTierBadge() {
  var b  = document.getElementById('tier-badge');
  var pb = document.querySelector('.btn.pro-btn');
  var count = getRefData().refs.length;
  if (isPro) {
    var daysLeft = getProDaysLeft();
    var badgeText = '⚡ PRO · TOP 200';
    if (daysLeft >= 0) badgeText = '⚡ PRO · ' + daysLeft + 'd left';
    b.className = 'tier-badge pro'; b.textContent = badgeText;
    if (pb) {
      pb.textContent = daysLeft >= 0 ? '⚡ PRO · ' + daysLeft + 'd' : '⚡ PRO ACTIVE';
      pb.style.opacity = '.6';
    }
    /* 3-day warning */
    if (daysLeft >= 0 && daysLeft <= 3) showExpiryWarning(daysLeft);
  } else {
    b.className = 'tier-badge free'; b.textContent = 'FREE · TOP 200';
    var refNeeded = (typeof REFERRAL_NEEDED !== 'undefined') ? REFERRAL_NEEDED : 5;
    if (pb) { pb.textContent = count > 0 ? '⚡ UNLOCK PRO (' + count + '/' + refNeeded + ')' : '⚡ UNLOCK PRO'; pb.style.opacity = ''; }
  }
}

/* ── Expiry warning (shown once per session) ────────────────── */
var _expiryWarned = false;
function showExpiryWarning(daysLeft) {
  if (_expiryWarned) return;
  _expiryWarned = true;
  var msg = daysLeft === 0
    ? '⚠ Your Pro expires today!'
    : '⚠ Your Pro expires in ' + daysLeft + ' day' + (daysLeft > 1 ? 's' : '') + '.';
  var t = document.createElement('div');
  t.style.cssText = 'position:fixed;top:56px;left:50%;transform:translateX(-50%);background:var(--bg2);border:1px solid var(--amber);border-radius:6px;padding:14px 22px;font-family:IBM Plex Mono,monospace;font-size:12px;color:var(--amber);z-index:900;text-align:center;box-shadow:0 0 30px rgba(240,160,48,.15);letter-spacing:.06em;cursor:pointer;';
  t.innerHTML = msg + '<br><span style="font-size:12px;color:var(--muted);margin-top:4px;display:block;">Click to renew your plan →</span>';
  t.onclick = function() { t.remove(); openPro(); };
  document.body.appendChild(t);
  setTimeout(function() { if (t.parentNode) { t.style.transition = 'opacity .5s'; t.style.opacity = '0'; setTimeout(function() { t.remove(); }, 500); } }, 8000);
}

/* ── Pro modal ───────────────────────────────────────────────── */
function openPro() {
  var body  = document.getElementById('pro-modal-body');
  var d     = checkMyReferrals();
  var count = d.refs.length, needed = (typeof REFERRAL_NEEDED !== 'undefined') ? REFERRAL_NEEDED : 5, link = getMyReferralLink();
  var pct   = Math.round(count / needed * 100);

  var _ = (typeof t === 'function') ? t : function(k){ return k; };

  if (isPro) {
    body.innerHTML = '<div class="already-pro">'
      + '<div class="already-pro-icon">⚡</div>'
      + '<div class="already-pro-txt">Thank You, Supporter!</div>'
      + '<div class="already-pro-sub" style="color:var(--green);font-weight:600;">Pro is active — lifetime access unlocked</div>'
      + '<div style="margin-top:10px;background:var(--gd);border:1px solid rgba(0,200,150,.2);border-radius:4px;padding:8px 14px;text-align:center;font-size:12px;color:var(--green);font-weight:600;">Lifetime Pro — your support keeps Rotator independent</div>'
      + '<div style="margin-top:14px;background:var(--bg3);border:1px solid var(--bdr2);border-radius:4px;padding:12px 14px;">'
        + '<div style="font-size:12px;color:var(--muted);letter-spacing:.12em;margin-bottom:8px;">' + _('pro_coming') + '</div>'
        + '<div style="font-size:12px;color:var(--text);line-height:2;">◈ <strong style="color:var(--bnb)">' + _('pro_coming_1') + '</strong> rotation tracker<br>◈ <strong style="color:var(--pro)">' + _('pro_coming_2') + '</strong> performance screener<br>◈ ' + _('pro_coming_3') + '</div>'
      + '</div>'
      + '<div style="margin-top:14px;background:var(--bg3);border:1px solid var(--bdr2);border-radius:4px;padding:12px 14px;">'
        + '<div style="font-size:12px;color:var(--muted);letter-spacing:.12em;margin-bottom:8px;">YOUR RECOVERY KEY</div>'
        + '<div style="font-size:12px;color:var(--muted);line-height:1.6;margin-bottom:8px;">Save this key to restore Pro on another device or browser:</div>'
        + '<div style="display:flex;gap:6px;">'
          + '<input class="code-input" id="recovery-key-display" value="' + getMyId() + '" readonly onclick="this.select()" style="font-size:12px;font-weight:600;color:var(--pro);letter-spacing:.08em;">'
          + '<button class="code-btn" onclick="copyRecoveryKey()">COPY</button>'
        + '</div>'
      + '</div>'
      + '<button class="revoke-btn" onclick="revokePro()">' + _('pro_revoke') + '</button>'
      + '</div>';
  } else {
    body.innerHTML = '<div class="modal-title">⚡ Support the Project & Unlock Pro</div>'
      + '<div class="modal-sub">No subscriptions. <strong>One-time contribution</strong> for lifetime Pro access.<br>The core tool stays free — Pro is your reward for supporting development.</div>'

      /* ── FREE vs PRO comparison ── */
      + '<div style="background:var(--bg3);border:1px solid rgba(167,139,250,.2);border-radius:4px;padding:12px 14px;margin-bottom:14px;">'
        + '<div style="display:flex;gap:12px;margin-bottom:10px;">'
          + '<div style="flex:1;font-size:12px;letter-spacing:.12em;color:var(--muted);text-transform:uppercase;">FREE</div>'
          + '<div style="flex:1;font-size:12px;letter-spacing:.12em;color:var(--pro);text-transform:uppercase;text-align:right;">⚡ PRO</div>'
        + '</div>'
        + '<div style="font-size:12px;color:var(--text);line-height:2.4;">'
          + '<div style="display:flex;justify-content:space-between;"><span>2 holdings</span><span style="color:var(--pro);">10 holdings</span></div>'
          + '<div style="display:flex;justify-content:space-between;"><span>Default swap pair</span><span style="color:var(--pro);">Choose any swap pair</span></div>'
          + '<div style="display:flex;justify-content:space-between;"><span style="color:var(--muted);">—</span><span style="color:var(--pro);">⚡ Insight Engine</span></div>'
          + '<div style="display:flex;justify-content:space-between;"><span style="color:var(--muted);">—</span><span style="color:var(--pro);">↔ Best Time to Swap</span></div>'
          + '<div style="display:flex;justify-content:space-between;"><span style="color:var(--muted);">—</span><span style="color:var(--pro);">🔄 Rotation Opportunities</span></div>'
          + '<div style="display:flex;justify-content:space-between;"><span style="color:var(--muted);">—</span><span style="color:var(--pro);">📊 Score Breakdown</span></div>'
        + '</div>'
      + '</div>'

      /* ── PRIMARY: Pay with Crypto ── */
      + '<div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--green);margin-bottom:8px;">PAY WITH CRYPTO — AUTO-VERIFIED, INSTANT PRO</div>'
      + '<div style="background:linear-gradient(135deg,rgba(0,200,150,.06),rgba(0,200,150,.02));border:1px solid rgba(0,200,150,.2);border-radius:6px;padding:14px;margin-bottom:14px;">'
        + '<div style="font-size:12px;color:var(--text);line-height:1.7;margin-bottom:10px;">Send <strong>$20+ USDT</strong> (or equivalent BNB/ETH) to any wallet below. Submit your TX hash and <strong>Pro activates instantly</strong> — fully automated, no waiting.</div>'
        + '<div style="font-size:12px;color:var(--muted);margin-bottom:6px;">⬡ USDT · TRC20 (Tron)</div>'
        + '<div style="font-size:12px;color:var(--text);word-break:break-all;background:var(--bg3);padding:6px 8px;border-radius:3px;margin-bottom:6px;font-family:monospace;">TGt3FQmv8AFPqbj6PnQGUAmemV9gDNm4bt</div>'
        + '<div style="font-size:12px;color:var(--muted);margin-bottom:6px;">⬡ USDT / BNB · BEP20 (BSC) &nbsp;|&nbsp; USDT / ETH · ERC20</div>'
        + '<div style="font-size:12px;color:var(--text);word-break:break-all;background:var(--bg3);padding:6px 8px;border-radius:3px;margin-bottom:6px;font-family:monospace;">0x507772f8714bca8e73a7984446edb59fea9bfba3</div>'
        + '<div style="font-size:12px;color:var(--muted);margin-bottom:6px;">⬡ Binance Pay ID</div>'
        + '<div style="font-size:12px;color:var(--text);word-break:break-all;background:var(--bg3);padding:6px 8px;border-radius:3px;margin-bottom:8px;font-family:monospace;">364154350</div>'
        + '<a href="#" onclick="closeModal(\'pro-modal\');openModal(\'donate-modal\');return false;" style="display:block;text-align:center;font-size:12px;color:var(--green);text-decoration:none;font-weight:600;">View full donation page with copy buttons →</a>'
      + '</div>'

      /* ── SECONDARY: Skrill (card) — donation only, does NOT unlock Pro ── */
      + '<div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);margin-bottom:8px;">TIP JAR — SKRILL (CARD)</div>'
      + '<div style="background:var(--bg3);border:1px solid var(--bdr2);border-radius:6px;padding:14px;margin-bottom:14px;">'
        + '<div style="font-size:12px;color:var(--amber);margin-bottom:8px;line-height:1.6;font-weight:600;">Skrill tips support the project but do not unlock Pro.<br>For Pro, use crypto above — it\'s instant and auto-verified.</div>'
        + '<div class="pro-plans-row">'
          + '<a href="https://skrill.me/rq/Daniel/5/USD?key=Aw1OEJXlKgBA8JsQQUlWczzO64A" target="_blank" rel="noopener" class="pro-plan-card" onclick="showTipScreen()">'
            + '<div class="pro-plan-price">$5</div>'
            + '<div class="pro-plan-dur">Small Tip</div>'
            + '<div class="pro-plan-badge" style="color:var(--muted);">Tip</div>'
          + '</a>'
          + '<a href="https://skrill.me/rq/Daniel/15/USD?key=UioGmHInL3DGuPlwSNb7ur5flZr" target="_blank" rel="noopener" class="pro-plan-card" onclick="showTipScreen()">'
            + '<div class="pro-plan-price">$15</div>'
            + '<div class="pro-plan-dur">Generous Tip</div>'
            + '<div class="pro-plan-badge" style="color:var(--muted);">Tip</div>'
          + '</a>'
          + '<a href="https://skrill.me/rq/Daniel/50/USD?key=ERwwyCSOLuNQd0mqjQew-P_YFPu" target="_blank" rel="noopener" class="pro-plan-card" onclick="showTipScreen()">'
            + '<div class="pro-plan-price">$50</div>'
            + '<div class="pro-plan-dur">Legendary Tip</div>'
            + '<div class="pro-plan-badge" style="color:var(--muted);">Tip</div>'
          + '</a>'
        + '</div>'
        + '<div style="font-size:12px;color:var(--muted);text-align:center;margin-top:6px;">Donation only · Does not unlock Pro · Thank you for supporting Rotator!</div>'
      + '</div>'

      /* ── Pro code ── */
      + '<div class="pro-divider"></div>'
      + '<div style="text-align:center;margin-top:6px;">'
        + '<div style="font-size:12px;color:var(--muted);letter-spacing:.08em;margin-bottom:8px;">HAVE A PRO CODE?</div>'
        + '<div style="display:flex;gap:6px;">'
          + '<input class="code-input" id="pro-code-input" placeholder="Enter your Pro code" style="font-size:12px;">'
          + '<button class="code-btn" onclick="checkProCode()">REDEEM</button>'
        + '</div>'
        + '<div id="pro-code-err" style="font-size:12px;margin-top:6px;min-height:14px;color:var(--red);"></div>'
      + '</div>'

      /* ── Recovery key ── */
      + '<div class="pro-divider"></div>'
      + '<div style="text-align:center;margin-top:6px;">'
        + '<div style="font-size:12px;color:var(--muted);letter-spacing:.08em;margin-bottom:8px;">ALREADY HAVE PRO ON ANOTHER DEVICE?</div>'
        + '<div style="display:flex;gap:6px;">'
          + '<input class="code-input" id="restore-key-input" placeholder="Enter your recovery key" style="font-size:12px;">'
          + '<button class="code-btn" onclick="restoreProFromKey()">RESTORE</button>'
        + '</div>'
        + '<div id="restore-err" style="font-size:12px;margin-top:6px;min-height:14px;"></div>'
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
    err.innerHTML = '❌ Invalid code. Check for typos or email <a href="mailto:rotatortool@gmail.com" style="color:var(--bnb);text-decoration:underline;">rotatortool@gmail.com</a>';
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
  renderAll();

  /* Launch Pro tutorial after a brief welcome toast */
  var t = document.createElement('div');
  t.style.cssText = 'position:fixed;top:56px;left:50%;transform:translateX(-50%);background:var(--bg2);border:1px solid var(--pro);border-radius:6px;padding:14px 22px;font-family:IBM Plex Mono,monospace;font-size:12px;color:var(--pro);z-index:900;text-align:center;box-shadow:0 0 30px rgba(167,139,250,.2);letter-spacing:.06em;';
  t.innerHTML = '⚡ PRO UNLOCKED — Welcome!<br><span style="font-size:12px;color:var(--muted);margin-top:4px;display:block;">Thank you for supporting Rotator ♥</span>';
  document.body.appendChild(t);
  setTimeout(function() { t.style.transition = 'opacity .5s'; t.style.opacity = '0'; setTimeout(function() { t.remove(); }, 500); }, 3500);
  /* Start Pro tutorial after toast fades */
  setTimeout(function() { if (typeof startProTutorial === 'function') startProTutorial(); }, 2000);
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
    + '<span style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);">Monthly Goal</span>'
    + '<span style="font-size:12px;font-weight:700;color:' + barColor + ';">$' + DONATION_CURRENT + ' / $' + DONATION_GOAL + '</span>'
    + '</div>'
    + '<div style="height:4px;background:var(--bg4);border-radius:2px;overflow:hidden;margin-bottom:5px;">'
    + '<div style="width:' + pct + '%;height:100%;background:' + barColor + ';border-radius:2px;transition:width .6s ease;"></div>'
    + '</div>'
    + '<div style="font-size:12px;color:var(--muted);">'
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

/* ── Submit Pro request after crypto donation (auto-verified) ── */
function submitProRequest() {
  var network = document.getElementById('pr-network');
  var amount  = document.getElementById('pr-amount');
  var txhash  = document.getElementById('pr-txhash');
  var contact = document.getElementById('pr-contact');
  var status  = document.getElementById('pr-status');
  if (!status) return;

  /* Validation */
  if (!network || !network.value) { status.style.color = 'var(--red)'; status.textContent = 'Please select a network.'; return; }
  if (!txhash || !txhash.value.trim()) { status.style.color = 'var(--red)'; status.textContent = 'Please enter the TX hash.'; return; }

  var net = network.value;
  var hash = txhash.value.trim();
  var amt = amount ? amount.value.trim() : '';
  var cont = contact ? contact.value.trim() : '';

  /* Binance Pay = manual (off-chain, can't auto-verify) */
  if (net === 'Binance Pay') {
    if (!cont) { status.style.color = 'var(--red)'; status.textContent = 'Binance Pay requires contact info for manual review.'; return; }
    status.style.color = 'var(--muted)'; status.textContent = 'Submitting for manual review...';
    supaSubmitProRequest({ amount: amt, network: net, tx_hash: hash, contact: cont, status: 'pending' })
      .then(function(ok) {
        if (ok) {
          _showProRequestPending('Your Binance Pay request has been submitted. Manual review may take up to 24 hours. Pro will activate automatically once approved.');
        } else {
          status.style.color = 'var(--red)'; status.textContent = 'Failed to submit. Please try again.';
        }
      });
    return;
  }

  /* Auto-verify on blockchain (TRC20 / BEP20 / ERC20) */
  if (typeof verifyTxHash !== 'function') {
    status.style.color = 'var(--red)'; status.textContent = 'Verification service unavailable. Try again later.';
    return;
  }

  status.style.color = 'var(--bnb)'; status.textContent = '⏳ Verifying transaction on ' + net + '...';

  verifyTxHash(hash, net).then(function(result) {
    if (result.valid) {
      /* Save as auto_approved + activate Pro */
      var verifiedAmt = '$' + result.amount.toFixed(2) + ' ' + result.token;
      supaSubmitProRequest({ amount: verifiedAmt, network: net, tx_hash: hash, contact: cont, status: 'auto_approved' })
        .then(function() {
          /* Activate Pro locally + sync to Supabase */
          isPro = true; savePro(true);
          if (typeof supaSavePro === 'function') supaSavePro(getMyId(), 'donation-' + net);
          updateTierBadge();
          if (typeof initCategoryLocks === 'function') initCategoryLocks();
          updateProGates();
          renderAll();

          /* Show success */
          _showProRequestPending('⚡ Payment verified! ' + verifiedAmt + ' via ' + result.network + '. <strong style="color:var(--green);">Pro is now active — thank you!</strong>');
          try { localStorage.setItem('rot_pro_requested', '1'); } catch(e) {}

          /* Show toast */
          var t = document.createElement('div');
          t.style.cssText = 'position:fixed;top:56px;left:50%;transform:translateX(-50%);background:var(--bg2);border:1px solid var(--green);border-radius:6px;padding:14px 22px;font-family:IBM Plex Mono,monospace;font-size:12px;color:var(--green);z-index:900;text-align:center;box-shadow:0 0 30px rgba(0,200,150,.2);letter-spacing:.06em;';
          t.innerHTML = '⚡ PRO UNLOCKED — Payment verified!<br><span style="font-size:12px;color:var(--muted);margin-top:4px;display:block;">' + verifiedAmt + ' confirmed on ' + result.network + '</span>';
          document.body.appendChild(t);
          setTimeout(function() { t.style.transition = 'opacity .5s'; t.style.opacity = '0'; setTimeout(function() { t.remove(); }, 500); }, 5000);
          setTimeout(function() { if (typeof startProTutorial === 'function') startProTutorial(); }, 3000);
        });
    } else {
      /* Verification failed — show reason */
      status.style.color = 'var(--red)';
      status.textContent = '❌ ' + result.reason;
    }
  }).catch(function() {
    status.style.color = 'var(--red)';
    status.textContent = 'Verification error. Please try again in a moment.';
  });
}

function _showProRequestPending(msg) {
  var form = document.getElementById('pro-request-form');
  var pending = document.getElementById('pro-request-pending');
  if (form) form.style.display = 'none';
  if (pending) { pending.style.display = 'block'; pending.innerHTML = '<div style="font-size:12px;color:var(--green);line-height:1.7;text-align:center;">' + msg + '</div>'; }
}

/* On load: if user already submitted a request, show pending state */
(function() {
  try {
    if (localStorage.getItem('rot_pro_requested') === '1') {
      setTimeout(function() {
        var form = document.getElementById('pro-request-form');
        var pending = document.getElementById('pro-request-pending');
        if (form) form.style.display = 'none';
        if (pending) pending.style.display = 'block';
      }, 100);
    }
  } catch(e) {}
})();

/* ── Plan-based Pro activation (lifetime — one-time contribution) ── */
function activateProPlan(months) {
  isPro = true;
  savePro(true); /* lifetime — no expiry */
  updateTierBadge();
  if (typeof supaSavePro === 'function') supaSavePro(getMyId(), 'supporter');
  if (typeof initCategoryLocks === 'function') initCategoryLocks();
  updateProGates();
  renderAll();
}

/* ── Pro feature gates ──────────────────────────────────────── */
function updateProGates() {
  /* Swap tool — always visible; only coin picker is Pro-gated */
  var swapGate = document.getElementById('swap-pro-gate');
  var swapBody = document.getElementById('ratio-section');
  if (swapGate) swapGate.style.display = 'none';   /* never show full gate */
  if (swapBody) swapBody.style.display = '';        /* always show tool */
  /* Show/hide Pro hint for coin selection */
  var swapHint = document.getElementById('swap-pro-hint');
  if (swapHint) swapHint.style.display = isPro ? 'none' : 'block';
  /* Show Pro tutorial button in settings only for Pro users */
  var proTutRow = document.getElementById('pro-tut-setting');
  if (proTutRow) proTutRow.style.display = isPro ? '' : 'none';
}

/* ── Skrill helpers ──────────────────────────────────────────── */
function sendSkrill() {
  var amount = document.getElementById('skrill-custom-amount').value;
  if (!amount || amount < 1) { document.getElementById('skrill-custom-amount').style.borderColor = 'var(--red)'; return; }
  document.getElementById('skrill-custom-amount').style.borderColor = '';
  var skrillUrls = {5:'https://skrill.me/rq/Daniel/5/USD?key=Aw1OEJXlKgBA8JsQQUlWczzO64A',10:'https://skrill.me/rq/Daniel/10/USD?key=UioGmHInL3DGuPlwSNb7ur5flZr',20:'https://skrill.me/rq/Daniel/20/USD?key=ERwwyCSOLuNQd0mqjQew-P_YFPu'};
  /* Pick the closest tier link, or default to the $5 link */
  var url = skrillUrls[+amount] || (amount >= 15 ? skrillUrls[20] : amount >= 8 ? skrillUrls[10] : skrillUrls[5]);
  window.open(url, '_blank');
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
