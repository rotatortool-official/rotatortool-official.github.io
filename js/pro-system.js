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
  if (d.refs.length >= 3 && !d.pro) { d.pro = true; showProToast(); }
  saveRefData(d); return d;
}

function showProToast() {
  var t = document.createElement('div');
  t.style.cssText = 'position:fixed;top:56px;left:50%;transform:translateX(-50%);background:#1a2030;border:1px solid #a78bfa;border-radius:6px;padding:14px 22px;font-family:IBM Plex Mono,monospace;font-size:12px;color:#a78bfa;z-index:900;text-align:center;box-shadow:0 0 30px rgba(167,139,250,.2);letter-spacing:.06em;';
  t.innerHTML = '⚡ PRO UNLOCKED — 3 friends joined!<br><span style="font-size:10px;color:#3e4d60;margin-top:4px;display:block;">Top 50 coins now available.</span>';
  document.body.appendChild(t);
  setTimeout(function() { t.style.transition = 'opacity .5s'; t.style.opacity = '0'; setTimeout(function() { t.remove(); }, 500); }, 4000);
}

/* ── Tier badge ──────────────────────────────────────────────── */
function updateTierBadge() {
  var b  = document.getElementById('tier-badge');
  var pb = document.querySelector('.btn.pro-btn');
  var count = getRefData().refs.length;
  if (isPro) {
    b.className = 'tier-badge pro'; b.textContent = '⚡ PRO · TOP 50 COINS';
    if (pb) { pb.textContent = '⚡ PRO ACTIVE'; pb.style.opacity = '.6'; }
  } else {
    b.className = 'tier-badge free'; b.textContent = 'FREE · TOP 50';
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
      + '<button class="revoke-btn" onclick="revokePro()">' + _('pro_revoke') + '</button>'
      + '</div>';
  } else {
    body.innerHTML = '<div class="modal-title">' + _('pro_modal_title') + '</div>'
      + '<div class="modal-sub">' + _('pro_modal_sub_1') + '<strong style="color:var(--pro)">' + _('pro_modal_sub_2') + '</strong>' + _('pro_modal_sub_3') + '</div>'
      + '<div style="background:var(--bg3);border:1px solid rgba(167,139,250,.2);border-radius:4px;padding:12px 14px;margin-bottom:14px;">'
        + '<div style="font-size:10px;color:var(--muted);letter-spacing:.12em;margin-bottom:10px;text-transform:uppercase;">' + _('pro_unlocks') + '</div>'
        + '<div style="font-size:12px;color:var(--text);line-height:2.2;">'
          + '<span style="color:var(--green);">✓</span> <strong>' + _('pro_u1') + '</strong> <span style="color:var(--muted);font-size:10px;">' + _('pro_vs2') + '</span><br>'
          + '<span style="color:var(--green);">✓</span> <strong>' + _('pro_u2') + '</strong> <span style="color:var(--muted);font-size:10px;">' + _('pro_vs1') + '</span><br>'
          + '<span style="color:var(--green);">✓</span> <strong>' + _('pro_u3') + '</strong> <span style="color:var(--muted);font-size:10px;">' + _('pro_vs1') + '</span><br>'
          + '<span style="color:var(--pro);">✓</span> <strong style="color:var(--pro)">' + _('pro_u4') + '</strong> ' + _('pro_u4s') + '<br>'
          + '<span style="color:var(--bnb);">◈</span> <strong style="color:var(--bnb)">' + _('pro_u5') + '</strong> ' + _('pro_u5s') + ' <span style="color:var(--muted);font-size:10px;">' + _('pro_soon') + '</span><br>'
          + '<span style="color:var(--bnb);">◈</span> <strong style="color:var(--bnb)">' + _('pro_u6') + '</strong> ' + _('pro_u6s') + ' <span style="color:var(--muted);font-size:10px;">' + _('pro_soon') + '</span>'
        + '</div>'
      + '</div>'
      + '<div style="background:var(--gd);border:1px solid rgba(0,200,150,.2);border-radius:4px;padding:10px 14px;margin-bottom:14px;font-size:11px;line-height:1.8;">'
        + '<span style="color:var(--green);font-weight:600;">' + _('pro_free_all') + '</span><br>'
        + '<span style="color:var(--muted);">' + _('pro_free_list') + '</span>'
      + '</div>'
      + '<div class="pro-steps" id="ref-steps">'
        + '<div class="pro-step"><div class="step-num">1</div><div class="step-txt">' + _('pro_step1') + '</div></div>'
        + '<div class="pro-step"><div class="step-num">2</div><div class="step-txt">' + _('pro_step2') + '</div></div>'
        + '<div class="pro-step"><div class="step-num">3</div><div class="step-txt">' + _('pro_step3') + '</div></div>'
      + '</div>'
      + '<div style="display:flex;gap:6px;margin-bottom:10px;">'
        + '<input class="code-input" id="ref-link-display" value="' + link + '" readonly onclick="this.select()" style="font-size:10px;">'
        + '<button class="code-btn" id="copy-ref-btn" onclick="copyRefLink()">' + _('pro_copy') + '</button>'
      + '</div>'
      + '<div class="pro-divider"></div>'
      + '<div style="text-align:center;margin-bottom:6px;">'
        + '<span style="font-size:10px;color:var(--muted);">' + _('pro_love') + '</span>'
        + '<a href="#" onclick="closeModal(\'pro-modal\');openModal(\'donate-modal\');return false;" style="font-size:10px;color:var(--bnb);">' + _('pro_love_link') + '</a>'
      + '</div>'
      + '<div class="pro-divider"></div>'
      + '<div style="font-size:10px;color:var(--muted);line-height:1.8;text-align:center;">'
        + _('pro_progress') + '<strong style="color:var(--pro);">' + count + ' / ' + needed + _('pro_friends') + '</strong>' + _('pro_joined')
        + (count > 0 ? '<div style="width:100%;height:3px;background:var(--bg4);border-radius:2px;margin-top:5px;"><div style="width:' + pct + '%;height:100%;background:var(--pro);border-radius:2px;transition:width .4s;"></div></div>' : '')
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
  closeModal('pro-modal');
  /* Start ambient sparkle overlay now that Pro is active */
  if (typeof Visuals !== 'undefined') Visuals.start();

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
  /* Stop ambient sparkle when Pro is revoked */
  if (typeof Visuals !== 'undefined') Visuals.stop();
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

/* Init on page load */
(function() { try { getVisitStats(); } catch(e) {} })();
