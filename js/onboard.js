/* ═══════════════════════════════════════════════════════════════════
   onboard.js — the first ten seconds, and the return visit (2026-11-15)

   Daniel agreed to five changes for "less friction and easy to onboard
   new users". This file holds three of them:

   1. START CARD (#ob-start, top of Today) for a visitor with no coins:
      "Which coins do you hold?" — the ten biggest coins as one-tap
      buttons plus a search box. No amount, no price, no account. The
      first coins become holdings up to the tier's limit (2 free, 10 Pro);
      any more go to the watchlist, which gets the same readings.
   2. THE READING, right there, the moment a coin is picked: its week
      against the average coin, its price strength (js/strength.js) and
      its turn sign (js/coin-reading.js). Three plain lines per coin.
      The existing one-time Pro offer (offerAlertsFor in holdings.js)
      follows the first coin, as it does in the add-coin window.
   3. SINCE YOUR LAST VISIT (#ob-since, top of My holdings): the price of
      each coin you hold or watch against what it was when you were last
      here (3 hours or more ago), and the score change for Pro. Kept in
      this browser only (localStorage rot_seen_v1); nothing is sent.

   The other two live elsewhere: the thin notice line (board.html +
   styles.css) and "a visitor with coins opens on My holdings"
   (js/board-tabs.js). The guided tour no longer starts by itself on a
   first visit (js/tutorial.js); the card links to it.

   Display only: nothing here feeds the score or the alerts.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  var KEY_SKIP = 'rot_ob_skip', KEY_SEEN = 'rot_seen_v1', GAP_MS = 3 * 36e5;
  var picked = [], open = false, base = null, snapped = false, snapSig = '', note = '';

  function isMk() { return typeof currentLang !== 'undefined' && currentLang === 'mk'; }
  function L() {
    return isMk() ? {
      q: 'Кои монети ги држиш?', sub: 'Допри ги твоите монети. Без сметка, без паричник; се чуваат само во овој прелистувач.',
      ph: 'Друга монета, на пр. LINK', skip: 'Прескокни', tour: 'Кратка тура',
      now: 'Твоите монети во моментов', go: 'Отвори ги моите монети →', done: 'Готово',
      wkUp: function (s, v, a) { return s + ' порасна ' + v + ' оваа недела. Просечната монета: ' + a + '.'; },
      wkDn: function (s, v, a) { return s + ' падна ' + v + ' оваа недела. Просечната монета: ' + a + '.'; },
      ps: function (n) { return 'Ценовна сила ' + n + ' од 100'; }, psUp: ', во пораст оваа недела.', psDn: ', во опаѓање оваа недела.', psFlat: ', без поголема промена.',
      psWait: 'Ценовна сила: се вчитува…',
      tUp: 'Знак за пресврт нагоре: ', tDn: 'Знак за ладење: ', tNo: 'Нема знак за пресврт во моментов.',
      lim: function (n) { return 'Бесплатно се чуваат ' + n + ' монети како твои; другите се на листата за следење, со истите читања.'; },
      since: 'Од твојата последна посета', ago: function (t) { return 'пред ' + t; }, h: ' ч.', d: ' дена', d1: ' ден',
      price: 'цена', score: 'резултат', pro: 'Добивај ги ваквите промени на Telegram, без да ја отвораш страницата.', proBtn: 'Погледни Pro',
      nochg: 'Без поголеми промени кај твоите монети.'
    } : {
      q: 'Which coins do you hold?', sub: 'Tap your coins. No account, no wallet; saved only in this browser.',
      ph: 'Another coin, e.g. LINK', skip: 'Skip', tour: 'Take the short tour',
      now: 'Your coins right now', go: 'Open my coins →', done: 'Done',
      wkUp: function (s, v, a) { return s + ' is up ' + v + ' this week. The average coin: ' + a + '.'; },
      wkDn: function (s, v, a) { return s + ' is down ' + v + ' this week. The average coin: ' + a + '.'; },
      ps: function (n) { return 'Price strength ' + n + ' of 100'; }, psUp: ', rising this week.', psDn: ', falling this week.', psFlat: ', no big change.',
      psWait: 'Price strength: loading…',
      tUp: 'Turn-up sign: ', tDn: 'Cooling sign: ', tNo: 'No turn sign right now.',
      lim: function (n) { return 'Free keeps ' + n + ' coins as your holdings; the others are on your watchlist, with the same readings.'; },
      since: 'Since your last visit', ago: function (t) { return t + ' ago'; }, h: ' h', d: ' days', d1: ' day',
      price: 'price', score: 'score', pro: 'Hear about changes like these on Telegram, without opening the site.', proBtn: 'See Pro',
      nochg: 'No big changes on your coins.'
    };
  }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function pct(v, abs) { var a = Math.abs(v); return (abs ? '' : (v >= 0 ? '+' : '−')) + a.toFixed(a >= 10 ? 0 : 1) + '%'; }
  /* A sign's name comes in English; the Macedonian page has its own dictionary. */
  function tr(s) { return isMk() && typeof window.mkTranslate === 'function' ? window.mkTranslate(s) : s; }
  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function all() { return (typeof coins !== 'undefined' && Array.isArray(coins)) ? coins : []; }
  function pool() { return all().filter(function (c) { return c && c.sym && !c.isStable && !c.isStock && typeof c.p7 === 'number'; }); }
  function held(c) { return typeof isHeldCoin === 'function' && isHeldCoin(c); }
  function watched(c) { return typeof isWatchedCoin === 'function' && isWatchedCoin(c); }
  function mine() { return all().filter(function (c) { return held(c) || watched(c); }); }
  function hasCoins() {
    return (typeof holdings !== 'undefined' && holdings && holdings.length > 0) || (typeof watchlist !== 'undefined' && watchlist && watchlist.length > 0);
  }
  function median(a) { a = a.slice().sort(function (x, y) { return x - y; }); var n = a.length; return n ? (n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2) : 0; }
  function ico(c) { return c.image ? '<img src="' + esc(c.image) + '" alt="" width="18" height="18" loading="lazy" onerror="this.style.display=\'none\'">' : ''; }

  /* ── Picking ── */
  function add(c) {
    if (!c || held(c) || watched(c)) return;
    var limit = (typeof isPro !== 'undefined' && isPro) ? PRO_HOLDINGS_LIMIT : FREE_HOLDINGS_LIMIT;
    if (holdings.length < limit) {
      var first = holdings.length === 0;
      holdings.push({ id: c.id, sym: c.sym, qty: null, avg: null, buys: 0 });
      if (typeof saveH === 'function') saveH();
      if (typeof supaCountFeature === 'function') supaCountFeature('holdings_edit');
      if (first && typeof creditReferrer === 'function') creditReferrer();
      if (first && !(typeof isPro !== 'undefined' && isPro) && typeof offerAlertsFor === 'function') setTimeout(function () { offerAlertsFor(c); }, 6000);   /* after the reading has been read */
    } else {
      watchlist.push(c.id);
      if (typeof saveWatchlist === 'function') saveWatchlist();
      note = L().lim(limit);
    }
    if (picked.indexOf(c.id) < 0) picked.push(c.id);
    open = true;
    /* The price-strength line needs js/strength.js to read its prices now. */
    if (typeof _rs !== 'undefined' && !_rs.seen) { _rs.seen = true; if (typeof renderStrength === 'function') renderStrength(); }
    if (typeof renderAll === 'function') renderAll(); else draw();
  }
  function drop(c) {
    var i = holdings.findIndex(function (h) { return h.id === c.id || h.sym === c.sym; });
    if (i >= 0) { holdings.splice(i, 1); if (typeof saveH === 'function') saveH(); }
    else { i = watchlist.indexOf(c.id); if (i < 0) i = watchlist.indexOf(c.sym); if (i >= 0) { watchlist.splice(i, 1); if (typeof saveWatchlist === 'function') saveWatchlist(); } }
    picked = picked.filter(function (id) { return id !== c.id; });
    if (typeof renderAll === 'function') renderAll(); else draw();
  }
  window.obPick = function (id) {
    var c = all().filter(function (x) { return x.id === id; })[0]; if (!c) return;
    if (held(c) || watched(c)) drop(c); else add(c);
  };
  window.obSearch = function (inp) {
    var v = String(inp.value || '').trim().toUpperCase(); if (!v) return;
    var c = pool().filter(function (x) { return x.sym === v; })[0]; if (!c) return;
    inp.value = ''; add(c);
  };
  window.obClose = function (skip) { open = false; picked = []; if (skip) set(KEY_SKIP, '1'); draw(); };
  window.obGo = function () { open = false; picked = []; draw(); if (window.BoardTabs && BoardTabs.go) BoardTabs.go('mine', 'holdings'); };

  /* ── The three lines for one coin ── */
  function reading(c, avg7) {
    var T = L(), out = [];
    out.push((c.p7 >= 0 ? T.wkUp : T.wkDn)(c.sym, pct(c.p7, true), pct(avg7)));
    var o = (typeof _rs !== 'undefined' && _rs.by) ? _rs.by[c.sym] : null;
    if (o) out.push(T.ps('<b>' + o.s + '</b>') + (o.ch == null ? '.' : o.ch >= 5 ? T.psUp : o.ch <= -5 ? T.psDn : T.psFlat));
    else if (typeof _rs !== 'undefined' && !_rs.fail && !c.isStock) out.push('<span class="ob-wait">' + T.psWait + '</span>');
    var sign = T.tNo;
    try {
      if (typeof _tdSigns === 'function' && typeof _tdStatus === 'function' && typeof c.score === 'number') {
        var st = _tdStatus(c), S = _tdSigns(c);
        if (st === 'lagging' && S.up.length) sign = T.tUp + '<b>' + esc(tr(S.up[0].title)) + '</b>';
        else if (st === 'ahead' && S.down.length) sign = T.tDn + '<b>' + esc(tr(S.down[0].title)) + '</b>';
      }
    } catch (e) {}
    out.push(sign);
    return '<button type="button" class="ob-read" onclick="openTileDetail(\'' + esc(c.id) + '\',event)">'
      + '<span class="ob-read-h">' + ico(c) + '<b>' + esc(c.sym) + '</b><i>›</i></span>'
      + out.map(function (t) { return '<span class="ob-line">' + t + '</span>'; }).join('') + '</button>';
  }

  /* ── The start card ── */
  function drawStart() {
    var host = document.getElementById('ob-start'); if (!host) return;
    var P = pool();
    var show = P.length > 20 && (open || (!hasCoins() && !get(KEY_SKIP)));
    if (!show) { if (host.firstChild) host.innerHTML = ''; host.hidden = true; return; }
    if (document.activeElement && document.activeElement.id === 'ob-inp') return;   /* never redraw under the keyboard */
    var T = L(), top = P.slice().sort(function (a, b) { return (b.mcap || 0) - (a.mcap || 0); }).slice(0, 10);
    picked.forEach(function (id) { if (!top.some(function (c) { return c.id === id; })) { var c = P.filter(function (x) { return x.id === id; })[0]; if (c) top.push(c); } });
    var my = P.filter(function (c) { return picked.indexOf(c.id) >= 0 && (held(c) || watched(c)); });
    var avg7 = median(P.map(function (c) { return c.p7; }));
    host.hidden = false;
    host.innerHTML = '<div class="ob-card" data-no-i18n>'
      + '<div class="ob-q">' + T.q + '</div><p class="ob-sub">' + T.sub + '</p>'
      + '<div class="ob-chips">' + top.map(function (c) {
          var on = held(c) || watched(c);
          return '<button type="button" class="ob-chip' + (on ? ' on' : '') + '" aria-pressed="' + on + '" onclick="obPick(\'' + esc(c.id) + '\')">' + ico(c) + '<b>' + esc(c.sym) + '</b>' + (on ? '<i>✓</i>' : '') + '</button>';
        }).join('')
      + '<input id="ob-inp" class="ob-inp" list="ob-dl" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="' + T.ph + '" onchange="obSearch(this)" oninput="if(this.value.length>1)obSearch(this)">'
      + '<datalist id="ob-dl">' + P.slice().sort(function (a, b) { return a.sym < b.sym ? -1 : 1; }).map(function (c) { return '<option value="' + esc(c.sym) + '">' + esc(c.name || '') + '</option>'; }).join('') + '</datalist></div>'
      + (my.length ? '<div class="ob-now">' + T.now + '</div><div class="ob-reads">' + my.map(function (c) { return reading(c, avg7); }).join('') + '</div>'
          + (note ? '<p class="ob-note">' + esc(note) + '</p>' : '')
          + '<div class="ob-acts"><button type="button" class="ob-go" onclick="obGo()">' + T.go + '</button><button type="button" class="ob-link" onclick="obClose(false)">' + T.done + '</button></div>'
        : '<div class="ob-acts"><button type="button" class="ob-link" onclick="obClose(true)">' + T.skip + '</button>'
          + (typeof startTutorial === 'function' ? '<button type="button" class="ob-link" onclick="startTutorial(true)">' + T.tour + '</button>' : '') + '</div>')
      + '</div>';
  }

  /* ── Since your last visit ── */
  function snapshot() {
    var o = {}; mine().forEach(function (c) { if (c.price > 0) o[c.id] = { p: c.price, s: typeof c.score === 'number' ? Math.round(c.score) : null }; });
    return { at: Date.now(), c: o };
  }
  function seenInit() {
    var my = mine(); if (!my.length || !my.some(function (c) { return c.price > 0; })) return;
    /* The comparison point is chosen once per visit; today's own snapshot is
       rewritten whenever the list of coins changes, so a coin added now is
       there to compare next time. */
    var sig = my.map(function (c) { return c.id; }).join(',');
    if (snapped) { if (sig !== snapSig) { snapSig = sig; set(KEY_SEEN, JSON.stringify({ base: base, cur: snapshot() })); } return; }
    snapped = true; snapSig = sig;
    var st = null; try { st = JSON.parse(get(KEY_SEEN) || 'null'); } catch (e) {}
    if (st && st.cur && Date.now() - st.cur.at > GAP_MS) base = st.cur; else base = (st && st.base) || null;
    set(KEY_SEEN, JSON.stringify({ base: base, cur: snapshot() }));
  }
  function ago(ms) { var T = L(), h = Math.round(ms / 36e5); if (h < 36) return T.ago(h + T.h); var d = Math.round(h / 24); return T.ago(d + (d === 1 ? T.d1 : T.d)); }
  function drawSince() {
    var host = document.getElementById('ob-since'); if (!host) return;
    seenInit();
    var T = L(), rows = [];
    if (base && base.c) mine().forEach(function (c) {
      var b = base.c[c.id]; if (!b || !(b.p > 0) || !(c.price > 0)) return;
      rows.push({ c: c, dp: (c.price / b.p - 1) * 100, ds: (b.s != null && typeof c.score === 'number') ? Math.round(c.score) - b.s : null, from: b.s });
    });
    if (!rows.length) { if (host.firstChild) host.innerHTML = ''; host.hidden = true; return; }
    rows.sort(function (a, b) { return Math.abs(b.dp) - Math.abs(a.dp); });
    var pro = typeof isPro !== 'undefined' && isPro;
    host.hidden = false;
    host.innerHTML = '<div class="ob-since" data-no-i18n><div class="ob-since-h"><b>' + T.since + '</b><span>' + ago(Date.now() - base.at) + '</span></div>'
      + '<div class="ob-since-rows">' + rows.slice(0, 6).map(function (r) {
          return '<button type="button" class="ob-srow" onclick="openTileDetail(\'' + esc(r.c.id) + '\',event)">' + '<span class="ob-sn">' + ico(r.c) + '<b>' + esc(r.c.sym) + '</b></span>'
            + '<span class="ob-sv"><em>' + T.price + '</em> <b class="' + (r.dp >= 0 ? 'up' : 'dn') + '">' + pct(r.dp) + '</b></span>'
            + (pro && r.ds != null ? '<span class="ob-sv"><em>' + T.score + '</em> ' + r.from + ' → <b class="' + (r.ds > 0 ? 'up' : r.ds < 0 ? 'dn' : '') + '">' + Math.round(r.c.score) + '</b></span>' : '') + '</button>';
        }).join('') + '</div>'
      + (!pro && typeof openPro === 'function' ? '<div class="ob-since-pro"><span>' + T.pro + '</span><button type="button" onclick="openPro()">' + T.proBtn + '</button></div>' : '')
      + '</div>';
  }

  function draw() { try { drawStart(); } catch (e) {} try { drawSince(); } catch (e) {} }
  window.obRender = draw;
  /* The price-strength line fills in when its prices arrive. */
  var tries = 0, had = false, tick = setInterval(function () {
    var has = typeof _rs !== 'undefined' && !!_rs.by;
    if (open && has && !had) { had = true; draw(); }
    if (had || ++tries > 400) clearInterval(tick);
  }, 1000);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', draw); else draw();
})();
