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
/* Referral links carry a public code, not the browser id (promptove/108).
   The id is what restores Pro and links Telegram alerts, so a shared
   link must not publish it. The code is made here, registered once with
   the server (register_ref_code), and used only after the server has
   confirmed it; until then the link falls back to the id, as before. */
function _genRefCode() {
  var abc = 'abcdefghijklmnopqrstuvwxyz0123456789', out = 'R', buf = new Uint8Array(10);
  try { crypto.getRandomValues(buf); } catch (e) { for (var j = 0; j < 10; j++) buf[j] = Math.floor(Math.random() * 256); }
  for (var i = 0; i < 10; i++) out += abc.charAt(buf[i] % abc.length);
  return out;
}
function getMyRefCode() {
  try { return localStorage.getItem('rot_ref_code_ok') || ''; } catch (e) { return ''; }
}
function ensureRefCode() {
  if (getMyRefCode() || typeof _supaRpc !== 'function') return;
  var c;
  try { c = localStorage.getItem('rot_ref_code'); if (!c) { c = _genRefCode(); localStorage.setItem('rot_ref_code', c); } } catch (e) { return; }
  _supaRpc('register_ref_code', { p_uid: getMyId(), p_code: c }).then(function (code) {
    if (typeof code === 'string' && /^R[a-z0-9]{10}$/.test(code)) {
      try { localStorage.setItem('rot_ref_code_ok', code); } catch (e) {}
      var inp = document.getElementById('refx-link');
      if (inp) inp.value = getMyReferralLink();
    }
  }).catch(function () {});
}
function getMyReferralLink() {
  return window.location.origin + window.location.pathname + '?ref=' + (getMyRefCode() || getMyId());
}
setTimeout(ensureRefCode, 4000);

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
  var REF_NEEDED = (typeof REFERRAL_NEEDED !== 'undefined') ? REFERRAL_NEEDED : 5;

  /* Ask the server to count + grant in one atomic check.
     Step 0b: only the grant_pro_via_referrals RPC can set is_pro=true.
     The client cannot forge a count by padding localStorage. */
  if (typeof supaGrantProViaReferrals === 'function' && !d.pro) {
    supaGrantProViaReferrals(getMyId()).then(function(res) {
      /* The server's own count (credited AND at least 1 hour old) — the
         only number that can unlock Pro. Remembered so the Pro window and
         the tier badge show real progress; the localStorage list below
         only ever saw friends who opened the link in THIS browser. */
      if (res && typeof res.count === 'number') {
        try { localStorage.setItem('rot_ref_verified', String(res.count)); } catch (e) {}
      }
      if (typeof supaCountJoinedReferrals === 'function') {
        supaCountJoinedReferrals(getMyId()).then(function (n) {
          if (n != null) { try { localStorage.setItem('rot_ref_joined', String(n)); } catch (e) {} }
          refreshReferralProgressUI();
        });
      }
      if (res && res.ok && !isPro) {
        isPro = true; savePro(true);
        if (window.Analytics) Analytics.track('Pro Unlocked', { method: 'referral' });
        var count = res.count || REF_NEEDED;
        var dd = getRefData();
        dd.pro = true; dd.refs = [];
        for (var i = 0; i < count; i++) dd.refs.push('supa-' + i);
        saveRefData(dd);
        showProToast();
        updateTierBadge();
        if (typeof initCategoryLocks === 'function') initCategoryLocks();
        updateProGates();
      }
    });
  }

  /* localStorage path is now display-only — we merge credited uids
     into d.refs so the "(N/5)" counter UI still reflects same-browser
     referrals, but Pro itself can only be granted by the server RPC
     above. Any forged localStorage entry won't survive the server
     count. */
  var key = 'rot_credit_for_' + getMyId(), cr = [];
  try { cr = JSON.parse(localStorage.getItem(key) || '[]'); } catch(e) {}
  cr.forEach(function(u) { if (d.refs.indexOf(u) < 0) d.refs.push(u); });
  saveRefData(d); return d;
}

/* Referral progress as the server sees it (2026-09-29).
   joined   = friends whose visit through my link has been credited
   verified = those at least 1 hour old — what grant_pro_via_referrals
              counts. Never below the same-browser list, for old data. */
function getReferralProgress() {
  var local = getRefData().refs.length;
  var num = function (k) { var v = parseInt(localStorage.getItem(k) || '', 10); return isNaN(v) ? 0 : v; };
  var verified = num('rot_ref_verified');
  var joined = Math.max(num('rot_ref_joined'), verified, local);
  return { joined: joined, verified: verified };
}

function referralSubText(p, needed) {
  var left = needed - p.joined;
  if (left > 0) {
    return 'Share your link. When ' + left + ' more ' + (left === 1 ? 'friend opens' : 'friends open')
      + ' Rotator through it, the full features unlock.';
  }
  return 'All ' + needed + ' friends have joined. Pro unlocks automatically once the 1-hour check has passed: refresh the page to check.';
}

/* Redraws the progress in an open Pro window and the tier badge once the
   server's numbers arrive, so nobody stares at a stale 0/5. */
function refreshReferralProgressUI() {
  if (isPro) return;
  var needed = (typeof REFERRAL_NEEDED !== 'undefined') ? REFERRAL_NEEDED : 5;
  var p = getReferralProgress();
  var el;
  if ((el = document.getElementById('refx-count'))) el.textContent = Math.min(p.joined, needed) + '/' + needed;
  if ((el = document.getElementById('refx-bar-fill'))) el.style.width = Math.min(100, Math.round(p.joined / needed * 100)) + '%';
  if ((el = document.getElementById('refx-sub'))) el.textContent = referralSubText(p, needed);
  if ((el = document.getElementById('refx-pending'))) {
    var waiting = Math.max(0, Math.min(p.joined, needed) - p.verified);
    el.textContent = waiting > 0 ? waiting + ' ' + (waiting === 1 ? 'friend is' : 'friends are') + ' waiting for the 1-hour check.' : '';
    el.style.display = waiting > 0 ? '' : 'none';
  }
  if (typeof updateTierBadge === 'function') updateTierBadge();
}

function showProToast() {
  var t = document.createElement('div');
  t.style.cssText = 'position:fixed;top:56px;left:50%;transform:translateX(-50%);background:#1a2030;border:1px solid #a78bfa;border-radius:6px;padding:14px 22px;font-family:IBM Plex Mono,monospace;font-size:12px;color:#a78bfa;z-index:900;text-align:center;box-shadow:0 0 30px rgba(167,139,250,.2);letter-spacing:.06em;';
  t.innerHTML = '⚡ PRO UNLOCKED — 5 friends joined!<br><span style="font-size:12px;color:#3e4d60;margin-top:4px;display:block;">10 holdings, every score gap and the live Insight read are now open.</span>';
  document.body.appendChild(t);
  setTimeout(function() { t.style.transition = 'opacity .5s'; t.style.opacity = '0'; setTimeout(function() { t.remove(); }, 500); }, 4000);
  /* Start Pro tutorial after toast */
  setTimeout(function() { if (typeof startProTutorial === 'function') startProTutorial(); }, 2500);
}

/* ── Tier badge ──────────────────────────────────────────────── */
function updateTierBadge() {
  var b  = document.getElementById('tier-badge');
  var pb = document.querySelector('.btn.pro-btn');
  var count = getReferralProgress().joined;
  if (isPro) {
    var daysLeft = getProDaysLeft();
    var badgeText = '⚡ PRO';
    if (daysLeft >= 0) badgeText = '⚡ PRO · ' + daysLeft + 'd left';
    b.className = 'tier-badge pro'; b.textContent = badgeText;
    if (pb) {
      pb.textContent = daysLeft >= 0 ? '⚡ PRO · ' + daysLeft + 'd' : '⚡ PRO ACTIVE';
      pb.style.opacity = '.6';
    }
    /* 3-day warning */
    if (daysLeft >= 0 && daysLeft <= 3) showExpiryWarning(daysLeft);
  } else {
    b.className = 'tier-badge free'; b.textContent = 'FREE';
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
  if (window.Analytics) Analytics.track('Pro Modal Opened');
  var body  = document.getElementById('pro-modal-body');
  var d     = checkMyReferrals();
  var needed = (typeof REFERRAL_NEEDED !== 'undefined') ? REFERRAL_NEEDED : 5, link = getMyReferralLink();
  var prog  = getReferralProgress(), count = Math.min(prog.joined, needed);
  var waiting = Math.max(0, count - prog.verified);
  var pct   = Math.round(count / needed * 100);

  var _ = (typeof t === 'function') ? t : function(k){ return k; };

  if (isPro) {
    body.innerHTML = '<div class="already-pro">'
      + '<div class="already-pro-icon">⚡</div>'
      + '<div class="already-pro-txt">Thank you!</div>'
      + '<div class="already-pro-sub" style="color:var(--green);font-weight:600;">Pro is active — full features unlocked</div>'
      + '<div style="margin-top:10px;background:var(--gd);border:1px solid rgba(0,200,150,.2);border-radius:4px;padding:8px 14px;text-align:center;font-size:12px;color:var(--green);font-weight:600;">Full features — your support keeps Rotator independent</div>'
      + '<div style="margin-top:14px;background:var(--bg3);border:1px solid var(--bdr2);border-radius:4px;padding:12px 14px;">'
        + '<div style="font-size:12px;color:var(--muted);letter-spacing:.12em;margin-bottom:8px;">' + _('pro_coming') + '</div>'
        + '<div style="font-size:12px;color:var(--text);line-height:2;">◈ <strong style="color:var(--bnb)">' + _('pro_coming_1') + '</strong><br>◈ <strong style="color:var(--pro)">' + _('pro_coming_2') + '</strong><br>◈ ' + _('pro_coming_3') + '</div>'
      + '</div>'
      + '<div style="margin-top:14px;background:var(--bg3);border:1px solid var(--bdr2);border-radius:4px;padding:12px 14px;">'
        + '<div style="font-size:12px;color:var(--muted);letter-spacing:.12em;margin-bottom:8px;">YOUR RECOVERY KEY</div>'
        + '<div style="font-size:12px;color:var(--muted);line-height:1.6;margin-bottom:8px;">Save this key to restore Pro on another device or browser:</div>'
        + '<div style="display:flex;gap:6px;">'
          + '<input class="code-input" id="recovery-key-display" value="' + getMyId() + '" readonly onclick="this.select()" style="font-size:12px;font-weight:600;color:var(--pro);letter-spacing:.08em;">'
          + '<button class="code-btn" onclick="copyRecoveryKey()">COPY</button>'
        + '</div>'
      + '</div>'
      + '<div class="refx-section" style="margin-top:14px;">'
        + '<div class="refx-hdr">'
          + '<span class="refx-title">💜 SHARE ROTATOR WITH FRIENDS</span>'
        + '</div>'
        + '<div class="refx-sub">Rotator stays independent because supporters like you spread the word. Share the love:</div>'
        + '<div class="refx-row">'
          + '<input class="refx-link" value="' + link + '" readonly onclick="this.select()">'
          + '<button class="refx-copy" id="copy-ref-btn" onclick="copyRefLink()">COPY</button>'
        + '</div>'
        + '<div class="refx-channels">'
          + '<button class="refx-ch refx-ch-x"  onclick="shareReferral(\'x\')">𝕏 Post</button>'
          + '<button class="refx-ch refx-ch-tg" onclick="shareReferral(\'telegram\')">✈ Telegram</button>'
          + '<button class="refx-ch refx-ch-wa" onclick="shareReferral(\'whatsapp\')">💬 WhatsApp</button>'
          + '<button class="refx-ch refx-ch-rd" onclick="shareReferral(\'reddit\')">◉ Reddit</button>'
        + '</div>'
      + '</div>'
      + '<button class="revoke-btn" onclick="revokePro()">' + _('pro_revoke') + '</button>'
      + '</div>';
  } else {
    var _proRequested = false;
    try { _proRequested = localStorage.getItem('rot_pro_requested') === '1'; } catch (e) {}
    body.innerHTML = '<div class="modal-title">⚡ Pro — free, or with a contribution</div>'
      + '<div class="modal-sub">Pro is optional. <strong>Rotator is free</strong> and runs on donations and the honor system.<br>Three ways to unlock the full features, all equal: <strong>invite 5 friends</strong> (free), <strong>redeem a Pro code</strong> (free), or a <strong>one-time contribution</strong>. The first 10 who pay keep Pro for as long as Rotator runs: their contributions cover the domain and the first year of servers. After that, Pro becomes a subscription.</div>'
      /* What Rotator is, and what Pro is worth (Daniel, 2026-10-10). Arithmetic, not a promise. */
      + '<div class="pro-why"><div class="pro-why-hdr">NOT BUY AND SELL SIGNALS</div>'
        + '<div>Rotator does not sell buy or sell signals. It presents data relevant to your holdings, on time, so you stay informed and make your own decisions.</div>'
        + '<div>Pro sends that data to you personally, about the coins you hold. $20 is what a 2% drop costs on a $1,000 portfolio.</div>'
        + '<div>See even one of those coming in time, and Pro has paid for itself.</div></div>'

      /* ── FREE vs PRO comparison ── */
      + '<div style="background:var(--bg3);border:1px solid rgba(167,139,250,.2);border-radius:4px;padding:12px 14px;margin-bottom:14px;">'
        + '<div style="display:flex;gap:12px;margin-bottom:10px;">'
          + '<div style="flex:1;font-size:12px;letter-spacing:.12em;color:var(--muted);text-transform:uppercase;">FREE</div>'
          + '<div style="flex:1;font-size:12px;letter-spacing:.12em;color:var(--pro);text-transform:uppercase;text-align:right;">⚡ PRO<button type="button" class="info-i" aria-label="The first 10 who pay $20 keep Pro for as long as Rotator runs; after that Pro becomes a subscription. You can also invite 5 friends or use a Pro code. A Support donation does not unlock it.">ⓘ</button></div>'
        + '</div>'
        + '<div style="font-size:12px;color:var(--text);line-height:2.4;">'
          /* What Pro actually changes, checked against the code 2026-09-26
             (promptove/69). Score gaps, the score breakdown and the swap
             tool's support/resistance cues are free for everyone, so they
             are not listed here: the list used to claim them as Pro. */
          + '<div style="display:flex;justify-content:space-between;gap:10px;"><span>2 holdings</span><span style="color:var(--pro);text-align:right;">10 holdings</span></div>'
          + '<div style="display:flex;justify-content:space-between;gap:10px;"><span>Exchange and unlock alerts</span><span style="color:var(--pro);text-align:right;">+ turn signs, ETF, Telegram DMs</span></div>'
          + '<div style="display:flex;justify-content:space-between;gap:10px;"><span>Default swap pair</span><span style="color:var(--pro);text-align:right;">Any swap pair</span></div>'
          /* 2026-10-10 (Daniel): every reading on the site is free; Pro is the
             personal alerts. The live Insight Engine, unlock amounts, crosses,
             all board tiles and all turn signs left this list that day. */
          + '<div style="display:flex;justify-content:space-between;gap:10px;"><span>Save swap pairs</span><span style="color:var(--pro);text-align:right;">⚡ Alert when a saved pair hits its zone or target</span></div>'
          + '<div style="display:flex;justify-content:space-between;gap:10px;"><span>Unlocks on the board</span><span style="color:var(--pro);text-align:right;">⚡ Telegram warning 3+ days before an unlock on your coins</span></div>'
          + '<div style="display:flex;justify-content:space-between;gap:10px;"><span>Telegram market pulse channel</span><span style="color:var(--pro);text-align:right;">+ personal Telegram briefing, Mon and Thu</span></div>'
        + '</div>'
      + '</div>'

      /* ── What Pro sends you (2026-10-10). Was a picture of the Insight
         Engine (promptove/104); that is free now, so the window shows the
         personal alerts instead. ── */
      + '<div class="pro-peek">'
        + '<div class="pro-peek-hdr">WHAT PRO SENDS YOU</div>'
        + '<div class="pro-peek-body">'
          + '<ul class="pro-peek-list">'
            + '<li>A Telegram briefing every Monday and Thursday: the market, your coins, your swap pairs</li>'
            + '<li>A warning 3+ days before an unlock on a coin you hold</li>'
            + '<li>Right away: a Binance delisting on your coins, and your saved pairs reaching their zone or target</li>'
            + '<li>Everything on the site stays free to read.</li>'
          + '</ul>'
        + '</div>'
      + '</div>'

      /* ── Viral: Invite 5 friends → Pro free ── */
      + '<div class="refx-section">'
        + '<div class="refx-hdr">'
          + '<span class="refx-title">🎁 INVITE ' + needed + ' FRIENDS → UNLOCK PRO FREE</span>'
          + '<span class="refx-count" id="refx-count">' + count + '/' + needed + '</span>'
        + '</div>'
        + '<div class="refx-bar"><div class="refx-bar-fill" id="refx-bar-fill" style="width:' + Math.min(100, pct) + '%;"></div></div>'
        + '<div class="refx-sub" id="refx-sub">' + referralSubText(prog, needed) + '</div>'
        + '<div class="refx-sub" id="refx-pending" style="color:var(--amber);' + (waiting > 0 ? '' : 'display:none;') + '">' + (waiting > 0 ? waiting + ' ' + (waiting === 1 ? 'friend is' : 'friends are') + ' waiting for the 1-hour check.' : '') + '</div>'
        + '<div class="refx-sub" style="opacity:.75;">A friend counts once Rotator has fully loaded for them through your link. Each friend counts once, and is confirmed 1 hour after their visit.</div>'
        + '<div class="refx-row">'
          + '<input class="refx-link" id="refx-link" value="' + link + '" readonly onclick="this.select()">'
          + '<button class="refx-copy" id="copy-ref-btn" onclick="copyRefLink()">COPY</button>'
        + '</div>'
        + '<div class="refx-channels">'
          + '<button class="refx-ch refx-ch-x"  onclick="shareReferral(\'x\')">𝕏 Post</button>'
          + '<button class="refx-ch refx-ch-tg" onclick="shareReferral(\'telegram\')">✈ Telegram</button>'
          + '<button class="refx-ch refx-ch-wa" onclick="shareReferral(\'whatsapp\')">💬 WhatsApp</button>'
          + '<button class="refx-ch refx-ch-rd" onclick="shareReferral(\'reddit\')">◉ Reddit</button>'
        + '</div>'
      + '</div>'

      /* ── PRIMARY: Pay with Crypto ──
         The TX check moved here from the Support window (promptove/107):
         Support is a thank-you that unlocks nothing; this $20 payment is
         the paid Pro unlock. Same field ids, so submitProRequest() is
         unchanged. */
      + '<div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--green);margin-bottom:8px;">PAY WITH CRYPTO — AUTO-VERIFIED, INSTANT PRO</div>'
      + '<div style="background:linear-gradient(135deg,rgba(0,200,150,.06),rgba(0,200,150,.02));border:1px solid rgba(0,200,150,.2);border-radius:6px;padding:14px;margin-bottom:14px;">'
        + '<div style="font-size:12px;color:var(--text);line-height:1.7;margin-bottom:10px;">Send <strong>$20+ USDT</strong> (or equivalent BNB/ETH) to any wallet below. Submit your TX hash and <strong>Pro activates instantly</strong> — fully automated, no waiting.</div>'
        + '<div style="font-size:12px;color:var(--muted);margin-bottom:6px;">⬡ USDT · TRC20 (Tron)</div>'
        + '<div class="pro-pay-addr">TGt3FQmv8AFPqbj6PnQGUAmemV9gDNm4bt</div>'
        + '<button class="copy-btn" id="pro-copy-trc20" onclick="copyAddr(\'TGt3FQmv8AFPqbj6PnQGUAmemV9gDNm4bt\',\'pro-copy-trc20\')">COPY ADDRESS</button>'
        + '<div style="font-size:12px;color:var(--muted);margin:10px 0 6px;">⬡ USDT / BNB · BEP20 (BSC) &nbsp;|&nbsp; USDT / ETH · ERC20</div>'
        + '<div class="pro-pay-addr">0x507772f8714bca8e73a7984446edb59fea9bfba3</div>'
        + '<button class="copy-btn" id="pro-copy-evm" onclick="copyAddr(\'0x507772f8714bca8e73a7984446edb59fea9bfba3\',\'pro-copy-evm\')">COPY ADDRESS</button>'
        + '<div style="font-size:12px;color:var(--muted);margin:10px 0 6px;">⬡ Binance Pay ID</div>'
        + '<div class="pro-pay-addr">364154350</div>'
        + '<button class="copy-btn" id="pro-copy-bnpay" onclick="copyAddr(\'364154350\',\'pro-copy-bnpay\')">COPY BINANCE ID</button>'
        + '<div class="modal-note" style="margin-top:10px;">⚠ Always double-check the network before sending.<br>Wrong network = permanent loss.</div>'
        /* Verify the payment */
        + '<div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--green);margin:14px 0 8px;font-weight:700;">Already sent payment? Verify & activate Pro instantly</div>'
        + '<div style="font-size:12px;color:var(--muted);line-height:1.6;margin-bottom:10px;">Submit your TX hash below — we verify it automatically on the blockchain. If the payment is confirmed and $20+, <strong style="color:var(--green);">Pro activates instantly</strong>.</div>'
        + '<div id="pro-request-form"' + (_proRequested ? ' style="display:none;"' : '') + '>'
          + '<div style="display:flex;gap:6px;margin-bottom:6px;">'
            + '<select id="pr-network" class="code-input" style="font-size:12px;text-transform:none;letter-spacing:normal;flex:1;padding:6px 8px;">'
              + '<option value="">Network...</option>'
              + '<option value="TRC20">USDT TRC20 (Tron)</option>'
              + '<option value="BEP20">USDT / BNB · BEP20 (BSC)</option>'
              + '<option value="ERC20">USDT / ETH · ERC20</option>'
              + '<option value="Binance Pay">Binance Pay (manual review)</option>'
            + '</select>'
            + '<input type="text" id="pr-amount" class="code-input" placeholder="Amount (e.g. 20 USDT)" style="font-size:12px;text-transform:none;letter-spacing:normal;flex:1;min-width:0;">'
          + '</div>'
          + '<input type="text" id="pr-txhash" class="code-input" placeholder="TX hash (from your wallet or block explorer)" style="font-size:12px;text-transform:none;letter-spacing:normal;width:100%;margin-bottom:6px;">'
          + '<input type="text" id="pr-contact" class="code-input" placeholder="Contact (optional — Telegram/Discord/Email)" style="font-size:12px;text-transform:none;letter-spacing:normal;width:100%;margin-bottom:8px;">'
          + '<button class="code-btn" onclick="submitProRequest()" style="width:100%;padding:9px;font-size:12px;letter-spacing:.08em;background:linear-gradient(135deg,rgba(0,200,150,.2),rgba(0,200,150,.08));border-color:rgba(0,200,150,.4);color:var(--green);">VERIFY TX & ACTIVATE PRO</button>'
          + '<div id="pr-status" style="font-size:12px;margin-top:6px;min-height:14px;text-align:center;"></div>'
        + '</div>'
        + '<div id="pro-request-pending" style="' + (_proRequested ? '' : 'display:none;') + 'text-align:center;">'
          + (_proRequested ? '<div style="font-size:12px;color:var(--muted);line-height:1.7;text-align:center;">Your payment check was sent from this browser. If Pro is not active yet, write to <a href="mailto:rotatortool@gmail.com" style="color:var(--bnb);text-decoration:none;">rotatortool@gmail.com</a>.</div>'
             + '<a href="#" onclick="document.getElementById(\'pro-request-pending\').style.display=\'none\';document.getElementById(\'pro-request-form\').style.display=\'\';return false;" style="display:inline-block;margin-top:6px;font-size:12px;color:var(--green);text-decoration:none;">Check another TX →</a>' : '')
        + '</div>'
      + '</div>'

      /* ── SECONDARY: Community channels (Telegram = market pulse notifications, Discord placeholder) ── */
      + '<div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);margin-bottom:8px;">COMMUNITY &amp; NOTIFICATIONS</div>'
      + '<div style="background:var(--bg3);border:1px solid var(--bdr2);border-radius:6px;padding:14px;margin-bottom:14px;">'
        + '<div style="font-size:12px;color:var(--muted);margin-bottom:8px;line-height:1.6;">The market pulse channel on Telegram is <strong style="color:var(--pro);">free for everyone</strong>. Pro adds personal alerts about your own coins. Discord coming soon.</div>'
        + '<div class="community-tier-row">'
          + '<a href="https://t.me/rotatortool" target="_blank" rel="noopener" class="community-btn community-btn-tg" onclick="return joinTelegram(event)">'
            + '<div style="font-size:14px;font-weight:800;">Telegram</div>'
            + '<div style="font-size:12px;color:inherit;opacity:.75;margin-top:2px;">Free market pulse</div>'
          + '</a>'
          + '<a href="#" class="community-btn community-btn-dc community-btn-soon" onclick="event.preventDefault();return false;" aria-disabled="true">'
            + '<div style="font-size:14px;font-weight:800;">Discord</div>'
            + '<div style="font-size:12px;color:inherit;opacity:.75;margin-top:2px;">Coming soon</div>'
          + '</a>'
        + '</div>'
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
/* Codes are validated server-side by the redeem_pro_code() RPC in
   Supabase (see sql/pro_codes_table.sql). The full code list is
   never shipped to the browser, so View Source cannot reveal it. */
function checkProCode() {
  var inp = document.getElementById('pro-code-input');
  var err = document.getElementById('pro-code-err');
  var btn = inp && inp.parentNode ? inp.parentNode.querySelector('.code-btn') : null;
  if (!inp || !err) return;

  var code = (inp.value || '').trim().toUpperCase();
  if (!code) { err.textContent = 'Please enter a code.'; return; }

  if (typeof supaRedeemProCode !== 'function') {
    err.textContent = 'Code service unavailable. Please reload and try again.';
    return;
  }

  var uid = (typeof getMyId === 'function' ? getMyId() : null)
         || localStorage.getItem('rot_uid');
  if (!uid) {
    err.textContent = 'Could not identify this device. Please reload the page.';
    return;
  }

  /* Block double-submit while the RPC is in flight */
  err.textContent = '';
  inp.style.borderColor = '';
  if (btn) { btn.disabled = true; btn.textContent = 'CHECKING…'; }
  var restoreBtn = function() {
    if (btn) { btn.disabled = false; btn.textContent = 'REDEEM'; }
  };

  supaRedeemProCode(code, uid).then(function(res) {
    restoreBtn();

    if (!res.ok) {
      inp.style.borderColor = 'var(--red)';
      if (res.reason === 'used') {
        err.textContent = '⚠ This code has already been redeemed on another device.';
      } else if (res.reason === 'inactive') {
        err.textContent = '⚠ This code is no longer active.';
      } else if (res.reason === 'offline') {
        err.textContent = '⚠ Could not reach the server. Check your connection and try again.';
      } else {
        err.innerHTML = '❌ Invalid code. Check for typos or email <a href="mailto:rotatortool@gmail.com" style="color:var(--bnb);text-decoration:underline;">rotatortool@gmail.com</a>';
      }
      return;
    }

    /* Server confirmed the redeem — activate Pro locally.
       The RPC already wrote pro_users (Step 0b), so we don't need
       a separate supaSavePro call here. */
    isPro = true; savePro(true);
    if (window.Analytics) Analytics.track('Pro Unlocked', { method: 'code' });
    updateTierBadge();
    if (res.reason === 'redeemed') incrementDonationCount();
    closeModal('pro-modal');
    renderAll();

    /* Launch Pro tutorial after a brief welcome toast */
    var t = document.createElement('div');
    t.style.cssText = 'position:fixed;top:56px;left:50%;transform:translateX(-50%);background:var(--bg2);border:1px solid var(--pro);border-radius:6px;padding:14px 22px;font-family:IBM Plex Mono,monospace;font-size:12px;color:var(--pro);z-index:900;text-align:center;box-shadow:0 0 30px rgba(167,139,250,.2);letter-spacing:.06em;';
    t.innerHTML = '⚡ PRO UNLOCKED — Welcome!<br><span style="font-size:12px;color:var(--muted);margin-top:4px;display:block;">Thank you for supporting Rotator ♥</span>';
    document.body.appendChild(t);
    setTimeout(function() { t.style.transition = 'opacity .5s'; t.style.opacity = '0'; setTimeout(function() { t.remove(); }, 500); }, 3500);
    setTimeout(function() { if (typeof startProTutorial === 'function') startProTutorial(); }, 2000);
  });
}

function copyRefLink() {
  var link = getMyReferralLink(), btn = document.getElementById('copy-ref-btn');
  var done = function() { btn.textContent = '✓ COPIED!'; btn.classList.add('ok'); setTimeout(function() { btn.textContent = 'COPY REFERRAL LINK'; btn.classList.remove('ok'); }, 2500); };
  if (navigator.clipboard) { navigator.clipboard.writeText(link).then(done).catch(done); }
  else { var t = document.createElement('textarea'); t.value = link; document.body.appendChild(t); t.select(); document.execCommand('copy'); document.body.removeChild(t); done(); }
  if (window.Analytics) Analytics.track('Share', { source: 'referral', channel: 'copy' });
}

/* ── Pre-composed share intents for the referral link ────────── */
function shareReferral(channel) {
  var link = getMyReferralLink();
  var text = 'I\'ve been using Rotator: an honest market pulse for Binance traders. 250 coins scored every 15 minutes, holder warnings for delistings and unlocks, and a public track record. Free to try:';
  var title = 'Rotator — an honest market pulse for Binance traders';
  var url;
  if (channel === 'x') {
    url = 'https://x.com/intent/tweet?text=' + encodeURIComponent(text + '\n\n' + link);
  } else if (channel === 'telegram') {
    url = 'https://t.me/share/url?url=' + encodeURIComponent(link) + '&text=' + encodeURIComponent(text);
  } else if (channel === 'whatsapp') {
    url = 'https://wa.me/?text=' + encodeURIComponent(text + ' ' + link);
  } else if (channel === 'reddit') {
    url = 'https://reddit.com/submit?url=' + encodeURIComponent(link) + '&title=' + encodeURIComponent(title);
  } else {
    return;
  }
  window.open(url, '_blank', 'noopener,width=600,height=500');
  if (window.Analytics) Analytics.track('Share', { source: 'referral', channel: channel });
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

  /* Server-side verify + activate (TRC20 / BEP20 / ERC20).
     Edge Function re-runs the chain check with a trusted runtime and
     calls grant_pro_via_tx itself — the client no longer self-reports
     "verified". Replay protection (one-tx_hash-one-Pro) is enforced
     inside the RPC. */
  if (typeof verifyAndActivateTx !== 'function') {
    status.style.color = 'var(--red)'; status.textContent = 'Verification service unavailable. Try again later.';
    return;
  }

  status.style.color = 'var(--bnb)'; status.textContent = '⏳ Verifying transaction on ' + net + '...';

  verifyAndActivateTx(hash, net, getMyId(), cont).then(function(res) {
    if (!res.ok) {
      status.style.color = 'var(--red)';
      if (res.reason === 'tx_used') {
        status.textContent = '❌ This TX hash has already been used to activate Pro.';
      } else {
        status.textContent = '❌ ' + res.reason;
      }
      return;
    }

    /* Server confirmed — activate Pro locally */
    var verifiedAmt = '$' + res.amount.toFixed(2) + ' ' + res.token;
    isPro = true; savePro(true);
    if (window.Analytics) Analytics.track('Pro Unlocked', { method: 'tx', network: res.network });
    updateTierBadge();
    if (typeof initCategoryLocks === 'function') initCategoryLocks();
    updateProGates();
    renderAll();

    _showProRequestPending('⚡ Payment verified! ' + verifiedAmt + ' via ' + res.network + '. <strong style="color:var(--green);">Pro is now active — thank you!</strong>');
    try { localStorage.setItem('rot_pro_requested', '1'); } catch(e) {}

    var t = document.createElement('div');
    t.style.cssText = 'position:fixed;top:56px;left:50%;transform:translateX(-50%);background:var(--bg2);border:1px solid var(--green);border-radius:6px;padding:14px 22px;font-family:IBM Plex Mono,monospace;font-size:12px;color:var(--green);z-index:900;text-align:center;box-shadow:0 0 30px rgba(0,200,150,.2);letter-spacing:.06em;';
    t.innerHTML = '⚡ PRO UNLOCKED — Payment verified!<br><span style="font-size:12px;color:var(--muted);margin-top:4px;display:block;">' + verifiedAmt + ' confirmed on ' + res.network + '</span>';
    document.body.appendChild(t);
    setTimeout(function() { t.style.transition = 'opacity .5s'; t.style.opacity = '0'; setTimeout(function() { t.remove(); }, 500); }, 5000);
    setTimeout(function() { if (typeof startProTutorial === 'function') startProTutorial(); }, 3000);
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

/* ── Pro feature gates ──────────────────────────────────────── */
function updateProGates() {
  if (typeof renderTokenUnlocks === 'function') renderTokenUnlocks();   /* unlock sizes are Pro */
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
  /* Animations off is a Pro setting (promptove/107, js/ui.js) */
  if (typeof applyAnimPref === 'function') applyAnimPref();
}

/* ── Telegram (Pro-gated) ────────────────────────────────────── */
/* The channel is public (anyone can read t.me/s/rotatortool), so the
   button no longer pretends it is Pro-only (2026-09-30). What Pro adds
   is personal alerts about your own coins, set up in YOURS. */
function joinTelegram(ev) {
  if (window.Analytics) Analytics.track('Telegram Channel Opened');
  if (typeof supaCountFeature === 'function') supaCountFeature('telegram_click');
  /* The visit came from the Substack weekly (data-loaders.js _countSubstackArrival). */
  try { if (sessionStorage.getItem('rot_from_substack') && typeof supaCountFeature === 'function') supaCountFeature('substack_to_telegram'); } catch (e) {}
  return true;
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
