/* ══════════════════════════════════════════════════════════════════
   turn-watch.js — the turn-sign list and the alerts for your coins
   (promptove/70, 2026-09-26)

   1. TURN SIGNS ACROSS THE MARKET (#turn-scan, MOMENTUM section)
      The Rotator's goal is spotting coins that are about to change trend.
      Until now a turn sign was only visible by opening coins one at a
      time. This runs the coin window's own reader, _tdSigns() in
      coin-reading.js, over every coin and lists two groups:
        · has lagged, and now shows turn-up signs
        · has run ahead, and now shows cooling signs
      Same reader, same words, same tested record: the list can never say
      something the coin window does not. Coins Binance has flagged
      (delisting, not trading, Monitoring tag) are left out, like every
      other list that could read as a suggestion. Free: the top 2 of each
      group. Pro: all of them.

   2. ALERTS FOR YOUR COINS (#coin-alerts, YOURS section, and the bell)
      What changed on the coins you hold and watch, since you last looked:
        · exchange risk: delisting announced, not trading, Monitoring tag
        · a big unlock due within 30 days
        · a new turn-up or cooling sign
        · a sharp move in Bitcoin or Ether ETF flows, if you hold them
      Exchange and unlock warnings are free: they protect money already
      held, and the holding tile shows them free anyway. Turn signs and
      ETF alerts are Pro. "New" is remembered in this browser only
      (localStorage), since Rotator has no accounts. Pro can also turn on
      browser notifications, which fire while Rotator is open in a tab,
      and link Telegram for direct messages (see _twTgConnect below and
      promptove/71).
══════════════════════════════════════════════════════════════════ */

var _TW_FREE_ROWS = 2;
var _TW_PRO_ROWS = 8;
var _twShowAll = { up: false, down: false };

function _twEligible(c) {
  if (!c || c.isStock || c.isStable || typeof c.score !== 'number') return false;
  if (typeof _isExchangeFlagged === 'function' && _isExchangeFlagged(c)) return false;
  return true;
}

/* A sign is "tested" when its evidence entry exists and has a win rate. */
function _twTested(s) {
  var E = (typeof ROTATOR_EVIDENCE !== 'undefined' && ROTATOR_EVIDENCE.turnSignals) || {};
  return !!(s.ev && E[s.ev] && E[s.ev].verdict === 'weak');
}

function _twScan() {
  var up = [], down = [];
  if (typeof coins === 'undefined' || typeof _tdSigns !== 'function') return { up: up, down: down };
  coins.forEach(function (c) {
    if (!_twEligible(c)) return;
    var st = _tdStatus(c);
    if (st === 'middle') return;
    var S;
    try { S = _tdSigns(c); } catch (e) { return; }
    if (st === 'lagging' && S.up.length) up.push({ c: c, signs: S.up, other: S.down, tested: S.up.some(_twTested) });
    if (st === 'ahead' && S.down.length) down.push({ c: c, signs: S.down, other: S.up, tested: S.down.some(_twTested) });
  });
  up.sort(function (a, b) { return (b.tested - a.tested) || (b.signs.length - a.signs.length) || (a.c.score - b.c.score); });
  down.sort(function (a, b) { return (b.tested - a.tested) || (b.signs.length - a.signs.length) || (b.c.score - a.c.score); });
  return { up: up, down: down };
}

function _twPct(v) { return v == null || !isFinite(v) ? '—' : (v >= 0 ? '+' : '') + v.toFixed(1) + '%'; }

function _twRow(r, dir) {
  var c = r.c;
  var held = (typeof isHeldCoin === 'function') && isHeldCoin(c);
  var chips = r.signs.map(function (s) {
    return '<span class="tw-chip ' + dir + (_twTested(s) ? ' tested' : '') + '">' + _esc(s.title) + '</span>';
  }).join('');
  if (r.other.length) {
    chips += '<span class="tw-chip mixed" title="' + _esc(r.other.map(function (s) { return s.title; }).join(', ')) + '">+'
      + r.other.length + ' the other way</span>';
  }
  return '<button type="button" class="tw-row" onclick="openTileDetail(\'' + c.id + '\', event)">'
    + '<span class="tw-sym">' + _esc(c.sym) + (held ? '<span class="tw-held">held</span>' : '') + '</span>'
    /* 7D beside 30D: the score leans on the last one to two weeks, so a
       coin can be "lagged" with a strong month behind it (KAVA on
       2026-09-26: 30D +50%, 7D -2%, 7-day rank 229). One number alone
       made the label look wrong. */
    + '<span class="tw-chg"><span class="' + ((c.p7 || 0) >= 0 ? 'up' : 'dn') + '">7D ' + _twPct(c.p7) + '</span> '
    + '<span class="' + ((c.p30 || 0) >= 0 ? 'up' : 'dn') + '">30D ' + _twPct(c.p30) + '</span></span>'
    + '<span class="tw-chips">' + chips + '</span>'
    + '</button>';
}

function _twCol(key, list, dir, title, empty) {
  var limit = isPro ? (_twShowAll[key] ? list.length : _TW_PRO_ROWS) : _TW_FREE_ROWS;
  var html = '<div class="tw-col"><div class="tw-col-hd ' + dir + '">' + title + ' <span class="tw-n">' + list.length + '</span></div>';
  if (!list.length) return html + '<div class="tw-empty">' + empty + '</div></div>';
  html += list.slice(0, limit).map(function (r) { return _twRow(r, dir); }).join('');
  var rest = list.length - limit;
  if (rest > 0) {
    html += isPro
      ? '<button type="button" class="tw-more" onclick="_twShowAll.' + key + '=true;renderTurnScan()">Show all ' + list.length + '</button>'
      : '<button type="button" class="tw-more pro" onclick="openPro()">⚡ ' + rest + ' more in Pro</button>';
  } else if (isPro && _twShowAll[key] && list.length > _TW_PRO_ROWS) {
    html += '<button type="button" class="tw-more" onclick="_twShowAll.' + key + '=false;renderTurnScan()">Show fewer</button>';
  }
  return html + '</div>';
}

function renderTurnScan() {
  var host = document.getElementById('turn-scan');
  if (!host) return;
  var R = _twScan();
  var E = (typeof ROTATOR_EVIDENCE !== 'undefined' && ROTATOR_EVIDENCE.turnSignals) || null;
  var trust = E && E.rsiQuickReclaim
    ? 'None of these signs has passed its test yet. The closest, the quick RSI bounce, beat the market '
      + E.rsiQuickReclaim.win + '% of the time against ' + E.random + '% for a random pick. Highlighted chips are the tested ones. A reading, not a forecast.'
    : 'None of these signs has passed a test yet. A reading, not a forecast.';
  host.innerHTML = '<div class="tw-hd"><span class="tw-title">Turn signs across the market</span>'
    + (isPro ? '' : '<span class="tw-pro-tag">PRO shows all</span>') + '</div>'
    + '<div class="tw-sub">Coins that have lagged and now show turn-up signs, and coins that have run ahead and now show cooling signs. '
    + 'The same reading as each coin\'s window; tap a coin to open it.</div>'
    + '<div class="tw-cols">'
    + _twCol('up', R.up, 'up', '▲ Lagged, turn-up signs', 'No lagging coin shows a turn-up sign right now.')
    + _twCol('down', R.down, 'down', '▼ Ran ahead, cooling signs', 'No leading coin shows a cooling sign right now.')
    + '</div>'
    + '<details class="tw-trust"><summary>How far to trust this</summary><p>' + _esc(trust) + '</p></details>';
}

/* ── Alerts for your coins ─────────────────────────────────────── */
var _TW_SEEN_KEY = 'rot_alerts_seen';
var _TW_NOTIFIED_KEY = 'rot_alerts_notified';
var _TW_NOTIFY_ON = 'rot_alerts_notify';
function _twLoad(k) { try { return JSON.parse(localStorage.getItem(k) || '{}') || {}; } catch (e) { return {}; } }
function _twSave(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

function _twMyCoins() {
  if (typeof coins === 'undefined') return [];
  return coins.filter(function (c) {
    var h = (typeof isHeldCoin === 'function') && isHeldCoin(c);
    var w = (typeof isWatchedCoin === 'function') && isWatchedCoin(c);
    if (h || w) { c._twRole = h ? 'held' : 'watching'; return true; }
    return false;
  });
}

/* Every alert: { key, sym, id, role, kind, pro, sev, title, detail }.
   The key names the fact, not the moment, so an alert that is still
   true stays "read" once read, and a new one is new. */
function _twAlerts() {
  var out = [];
  _twMyCoins().forEach(function (c) {
    var base = { sym: c.sym, id: c.id, role: c._twRole };
    var st = (typeof delistedStatus !== 'undefined' && delistedStatus[c.sym]) || '';
    if (typeof delistedSymbols !== 'undefined' && delistedSymbols.has(c.sym)) {
      var t = st === 'DELIST_ANNOUNCED' ? 'Binance delisting announced' : st === 'NOT_LISTED' ? 'Not listed on Binance' : 'Not trading on Binance';
      out.push(Object.assign({ key: c.sym + '|exchange|' + (st || 'BREAK'), kind: 'exchange', pro: false, sev: 3, title: t,
        detail: 'Check Binance\'s announcement for dates and what happens to balances.' }, base));
    }
    if (typeof monitoringSymbols !== 'undefined' && monitoringSymbols.has(c.sym)) {
      out.push(Object.assign({ key: c.sym + '|exchange|MONITORING', kind: 'exchange', pro: false, sev: 2, title: 'Binance Monitoring tag',
        detail: 'Binance reviews tagged coins for possible delisting.' }, base));
    }
    var u = (typeof _tokenUnlocks !== 'undefined' && c.id && _tokenUnlocks[c.id]) || null;
    var pct = u && u.unlock30d_pct != null ? Number(u.unlock30d_pct) : null;
    var line = (window.RotatorEngine && window.RotatorEngine.UNLOCK_PENDING_PCT != null) ? window.RotatorEngine.UNLOCK_PENDING_PCT : 5;
    if (pct != null && pct > line) {
      var when = u.next_unlock_at ? String(u.next_unlock_at).slice(0, 10) : '';
      out.push(Object.assign({ key: c.sym + '|unlock|' + when, kind: 'unlock', pro: false, sev: 2,
        title: pct.toFixed(1) + '% of supply unlocks within 30 days', detail: when ? 'Next unlock ' + when + '.' : 'New supply reaching the market can weigh on price.' }, base));
    }
    if (!c.isStock && !c.isStable && typeof _tdSigns === 'function') {
      var S; try { S = _tdSigns(c); } catch (e) { S = null; }
      if (S) {
        S.up.concat(S.down).forEach(function (s) {
          var isUp = S.up.indexOf(s) >= 0;
          if (/^ETF flows:/.test(s.title)) return;   /* ETF has its own alert below */
          /* Only a real date goes into the key. "3 days ago" changes every
             day and would bring the same sign back as new each morning. */
          var dated = /^\d{4}-\d{2}-\d{2}/.test(s.when || '') ? String(s.when).slice(0, 10) : '';
          out.push(Object.assign({ key: c.sym + '|sign|' + s.title + '|' + dated, kind: isUp ? 'up' : 'down', pro: true, sev: 1,
            title: (isUp ? '▲ ' : '▼ ') + s.title, detail: s.detail || '' }, base));
        });
      }
    }
    var etfA = c.id === 'bitcoin' ? 'BTC' : c.id === 'ethereum' ? 'ETH' : null;
    var etf = etfA && typeof _etfFlows !== 'undefined' && _etfFlows && _etfFlows[etfA];
    if (etf && etf.last && !etf.error && /^(reversal|extreme|turned)_/.test(etf.state || '')) {
      out.push(Object.assign({ key: c.sym + '|etf|' + etf.state + '|' + etf.last.day, kind: etf.tone === 'out' ? 'down' : 'up', pro: true, sev: 1,
        title: 'ETF flows: ' + etf.headline, detail: (etf.detail || '') + ' Source: Farside Investors.' }, base));
    }
  });
  out.sort(function (a, b) { return b.sev - a.sev || (a.sym < b.sym ? -1 : 1); });
  return out;
}

function _twMarkRead() {
  var seen = _twLoad(_TW_SEEN_KEY), now = new Date().toISOString();
  _twAlerts().forEach(function (a) { if (!a.pro || isPro) seen[a.key] = seen[a.key] || now; });
  _twSave(_TW_SEEN_KEY, seen);
  renderCoinAlerts();
}

function _twToggleNotify() {
  if (!isPro) { openPro(); return; }
  if (!('Notification' in window)) { alert('This browser does not support notifications.'); return; }
  var on = false; try { on = localStorage.getItem(_TW_NOTIFY_ON) === '1'; } catch (e) {}
  if (on) { try { localStorage.removeItem(_TW_NOTIFY_ON); } catch (e) {} renderCoinAlerts(); return; }
  Notification.requestPermission().then(function (p) {
    if (p === 'granted') {
      try { localStorage.setItem(_TW_NOTIFY_ON, '1'); } catch (e) {}
      /* Everything already on the list counts as notified: only what
         appears from now on pops up. */
      var n = _twLoad(_TW_NOTIFIED_KEY);
      _twAlerts().forEach(function (a) { n[a.key] = 1; });
      _twSave(_TW_NOTIFIED_KEY, n);
    }
    renderCoinAlerts();
  });
}

function _twNotify(list) {
  var on = false; try { on = localStorage.getItem(_TW_NOTIFY_ON) === '1'; } catch (e) {}
  if (!on || !isPro || !('Notification' in window) || Notification.permission !== 'granted') return;
  var n = _twLoad(_TW_NOTIFIED_KEY), fresh = list.filter(function (a) { return !n[a.key]; });
  fresh.slice(0, 3).forEach(function (a) {
    try { new Notification('Rotator · ' + a.sym, { body: a.title.replace(/^[▲▼] /, '') + (a.detail ? '. ' + a.detail : ''), tag: a.key, icon: 'icon-192.png' }); } catch (e) {}
  });
  fresh.forEach(function (a) { n[a.key] = 1; });
  _twSave(_TW_NOTIFIED_KEY, n);
}

function renderCoinAlerts() {
  var host = document.getElementById('coin-alerts');
  var badge = document.getElementById('tw-badge');
  var all = _twAlerts();
  var seen = _twLoad(_TW_SEEN_KEY);
  var visible = all.filter(function (a) { return !a.pro || isPro; });
  var locked = all.length - visible.length;
  var fresh = visible.filter(function (a) { return !seen[a.key]; });
  if (badge) { badge.textContent = fresh.length ? String(fresh.length) : ''; badge.style.display = fresh.length ? '' : 'none'; }
  _twNotify(visible);
  if (!host) return;
  if (!_twMyCoins().length) {
    host.innerHTML = '<div class="ca-hd"><span class="ca-title">🔔 Alerts for your coins</span></div>'
      + '<div class="ca-empty">Add a holding or watch a coin, and changes to it show up here: exchange warnings, big unlocks, and new turn signs.</div>';
    return;
  }
  var notifyOn = false; try { notifyOn = localStorage.getItem(_TW_NOTIFY_ON) === '1'; } catch (e) {}
  var rows = visible.map(function (a) {
    return '<button type="button" class="ca-row ' + a.kind + (seen[a.key] ? '' : ' new') + '" onclick="openTileDetail(\'' + a.id + '\', event)">'
      + '<span class="ca-sym">' + _esc(a.sym) + '<span class="ca-role">' + a.role + '</span></span>'
      + '<span class="ca-body"><span class="ca-t">' + _esc(a.title) + (seen[a.key] ? '' : ' <span class="ca-new">NEW</span>') + '</span>'
      + (a.detail ? '<span class="ca-d">' + _esc(a.detail) + '</span>' : '') + '</span></button>';
  }).join('');
  host.innerHTML = '<div class="ca-hd"><span class="ca-title">🔔 Alerts for your coins</span>'
    + (fresh.length ? '<button type="button" class="ca-act" onclick="_twMarkRead()">Mark all read</button>' : '') + '</div>'
    + (rows || '<div class="ca-empty">Nothing to flag on your coins right now.</div>')
    + (locked ? '<button type="button" class="ca-lock" onclick="openPro()">⚡ ' + locked + ' turn-sign and ETF alert' + (locked === 1 ? '' : 's')
        + ' on your coins. Unlock with Pro</button>' : '')
    + '<div class="ca-foot">' + (isPro
        ? _twTgFoot()
          + '<button type="button" class="ca-act" onclick="_twToggleNotify()">' + (notifyOn ? '🔕 Turn off browser notifications' : '🔔 Notify me in this browser') + '</button>'
          + '<span>Browser notifications fire while Rotator is open in a tab. "New" is remembered in this browser.</span>'
        : '<span>Exchange and unlock warnings are free. Pro adds turn signs, ETF alerts, Telegram messages and browser notifications.</span>')
    + '</div>';
  _twTgSync(false);
}

/* ── Telegram DMs for Pro (promptove/71) ───────────────────────────
   The browser has no account, so it links by its rot_uid: a one-time
   code from alert_link_start() opens t.me/<bot>?start=<code>, and the
   telegram-webhook function ties the chat to this browser. From then
   on this browser keeps the server's copy of its coin list current
   (alert_set_coins, only when the list changes), and send-dm-alerts
   messages what is new every hour. The bot's username is read from
   market_cache, where the webhook's setup stored it. */
var _twTg = { linked: null, sig: '', busy: false, note: '' };

function _twRpc(fn, args) {
  return fetch(SUPA_URL + '/rest/v1/rpc/' + fn, {
    method: 'POST',
    headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(args)
  }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
}

function _twTgCoins() {
  return _twMyCoins().slice(0, 60).map(function (c) { return { id: c.id, sym: c.sym, role: c._twRole }; });
}

function _twTgSync(force) {
  if (!isPro || typeof getMyId !== 'function' || typeof SUPA_URL === 'undefined') return;
  var lang = (typeof currentLang !== 'undefined' && currentLang === 'mk') ? 'mk' : 'en';
  var list = _twTgCoins(), sig = lang + JSON.stringify(list);
  if (!force && sig === _twTg.sig) return;
  _twTg.sig = sig;
  _twRpc('alert_set_coins', { p_uid: getMyId(), p_coins: list, p_lang: lang }).then(function (linked) {
    var was = _twTg.linked;
    _twTg.linked = linked === true;
    if (was !== _twTg.linked) renderCoinAlerts();
  });
}

function _twTgFoot() {
  if (_twTg.linked) {
    return '<span class="ca-tg on">📨 Telegram connected. New alerts are messaged to you every hour.'
      + ' <button type="button" class="ca-act" onclick="_twTgUnlink()">Disconnect</button></span>';
  }
  return '<button type="button" class="ca-act ca-tg-btn" onclick="_twTgConnect()"' + (_twTg.busy ? ' disabled' : '') + '>📨 Get these on Telegram</button>'
    + (_twTg.note ? '<span class="ca-tg-note">' + _esc(_twTg.note) + '</span>' : '');
}

function _twTgConnect() {
  if (!isPro) { openPro(); return; }
  /* Open the tab inside the click, so popup blockers allow it, then
     point it at the bot once the code is back. */
  var w = null; try { w = window.open('about:blank', '_blank'); } catch (e) {}
  _twTg.busy = true; _twTg.note = ''; renderCoinAlerts();
  Promise.all([
    _twRpc('alert_link_start', { p_uid: getMyId(), p_lang: (typeof currentLang !== 'undefined' && currentLang === 'mk') ? 'mk' : 'en' }),
    (typeof supaCacheGetStale === 'function') ? supaCacheGetStale('telegram_bot_info') : Promise.resolve(null)
  ]).then(function (res) {
    var code = res[0], bot = res[1] && res[1].data && res[1].data.username;
    _twTg.busy = false;
    if (!code || !bot) {
      if (w) try { w.close(); } catch (e) {}
      _twTg.note = !code
        ? 'Our server does not have Pro on record for this browser. Restore Pro with your recovery key, then try again.'
        : 'The Telegram bot is not reachable right now. Try again in a few minutes.';
      renderCoinAlerts();
      return;
    }
    var link = 'https://t.me/' + encodeURIComponent(bot) + '?start=' + encodeURIComponent(code);
    if (w) w.location.href = link; else window.location.href = link;
    _twTg.note = 'In Telegram, tap Start. This panel updates once the bot confirms.';
    renderCoinAlerts();
    /* Check back a few times while the user is in Telegram. */
    [15000, 40000, 90000].forEach(function (ms) { setTimeout(function () { if (!_twTg.linked) _twTgSync(true); }, ms); });
  });
}

function _twTgUnlink() {
  _twRpc('alert_unlink', { p_uid: getMyId() }).then(function () {
    _twTg.linked = false; _twTg.note = 'Telegram disconnected.'; renderCoinAlerts();
  });
}

/* Back from Telegram: check whether the link went through. */
window.addEventListener('focus', function () { if (isPro && !_twTg.linked && _twTg.note) _twTgSync(true); });

function openCoinAlerts() {
  if (typeof railGo === 'function') railGo('sec-yours');
}
