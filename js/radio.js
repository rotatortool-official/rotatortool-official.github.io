/* ══════════════════════════════════════════════════════════════
   radio.js — the 🎧 Radio (Daniel, 2026-10-03; live radio 2026-10-04)
   ──────────────────────────────────────────────────────────────
   A small player for everyone on the site. FREE, not Pro.

   Two kinds of station:
   - YouTube: the default since 2026-10-05 is Daniel's own channel, Blink
     Ortodox: the playlist "Macedonian Poetry x Dark Folk", starting at
     "Ленка". Then CRYPTO GEMIDZIJA (@cryptogemidzija, partner channel),
     played as its coin and token analysis playlist, newest first; and up
     to 5 YouTube links the visitor adds. YouTube's embed
     terms apply: the player stays VISIBLE while it plays, closing it
     stops the sound, no hidden or audio-only mode. youtube-nocookie.com.
   - Live radio (promptove/107, Daniel: "go with the mix"): Jazz FM and
     Antenna 5 from Skopje, and Radio Paradise's Mellow and Main mixes.
     Plain <audio> on each station's own public https stream, the way
     internet-radio apps play them, credited with a link to the station.
     Audio only, so it keeps playing in the background. These replaced
     the four Lofi Girl YouTube streams, whose ids changed now and then
     (they needed a daily yt-resolve check, now gone).
     SomaFM was the first pick for the genre stations and was dropped:
     its servers refuse a stream requested from another site (403 with
     our site as referrer, 206 without). That is a deliberate block, so
     we do not use it and must never strip the referrer to get past it.

   Rules this file keeps:
   - Nothing loads from YouTube or a station until the visitor presses a
     station. Named in the Privacy Policy, section 5.
   - The heartbeat sound stays quiet while the radio plays
     (radioPlaying() is checked in hbSoundStart, data-loaders.js).
   - A station that is down says so in words; it never fails silently.
══════════════════════════════════════════════════════════════ */

var RADIO_STATIONS = [
  /* The default (Daniel, 2026-10-05): his own channel's poetry playlist,
     opening on track 3, "Ленка" (Racin, Бели мугри), then on through the
     list. `start` is the video the playlist opens on. A visitor who
     already picked a station keeps it (rot_radio_station). */
  { key: 'blink', label: 'Macedonian Poetry', icon: '🎻', type: 'list', id: 'PLIA-5btKd__dHKXlSy0Tzk4C1r0SvyrkV', start: '1zBF55zWSXc',
    by: 'Blink Ortodox', url: 'https://www.youtube.com/@Blink_Ortodox' },
  /* 2026-10-04 (Daniel, promptove/107): the channel's coin and token
     analysis playlist ("Анализа на Коини/Токени"), newest first,
     instead of the whole uploads list. */
  { key: 'gemidzija', label: 'Crypto Gemidzija', icon: '📺', type: 'list', id: 'PLMZFAeDxJ2EtTGfwt3xOyRb1pq5j6w8AL',
    by: 'CRYPTO GEMIDZIJA', url: 'https://www.youtube.com/@cryptogemidzija' },
  /* Live radio: each station's own public https stream (checked
     2026-10-04 to play from our https page, referrer included). */
  { key: 'jazzfm',   label: 'Jazz FM',   icon: '🎷', type: 'audio', stream: 'https://radio.jazzfm.mk/listen/jazzfm/live',
    by: 'Jazz FM 100.8, Skopje', url: 'https://jazzfm.mk/' },
  { key: 'antenna5', label: 'Antenna 5', icon: '📻', type: 'audio', stream: 'https://fms.off.net.mk:8000/antenna5.stream',
    by: 'Antenna 5, Skopje', url: 'https://antenna5.com.mk/' },
  { key: 'rpmellow', label: 'Mellow',    icon: '🌙', type: 'audio', stream: 'https://stream.radioparadise.com/mellow-128',
    by: 'Radio Paradise, Mellow Mix', url: 'https://radioparadise.com/' },
  { key: 'rpmain',   label: 'Paradise',  icon: '🌍', type: 'audio', stream: 'https://stream.radioparadise.com/aac-128',
    by: 'Radio Paradise, Main Mix', url: 'https://radioparadise.com/' }
];
var _radioStation = null;

function radioPlaying() { return !!_radioStation; }

function _radioSaved() {
  try { return localStorage.getItem('rot_radio_station') || 'blink'; } catch (e) { return 'blink'; }
}
function _radioFind(key) {
  var all = RADIO_STATIONS.concat(_radioCustom());
  for (var i = 0; i < all.length; i++) if (all[i].key === key) return all[i];
  return RADIO_STATIONS[0];
}
function _radioEsc(t) {
  return String(t).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

/* ── Your own channels and links (Daniel, 2026-10-03) ─────────────
   Up to 5 YouTube channels, videos or playlists per browser, e.g. a
   podcast about a coin. The link goes once to our yt-resolve function
   (supabase/functions/yt-resolve), which returns the id to embed and a
   name; nothing is stored on the server. A channel plays its uploads,
   newest first. Same player and same YouTube rules as the stations
   (visible, never hidden). Saved in this browser only. The Terms say
   people are responsible for the links they add. */
var RADIO_MAX_CUSTOM = 5;
function _radioCustom() {
  try {
    var a = JSON.parse(localStorage.getItem('rot_radio_custom') || '[]');
    return Array.isArray(a) ? a.filter(function (c) {
      return c && /^c_[\w-]+$/.test(c.key) && /^[\w-]{10,64}$/.test(c.id) && (c.type === 'video' || c.type === 'list');
    }).slice(0, RADIO_MAX_CUSTOM) : [];
  } catch (e) { return []; }
}
function _radioSaveCustom(a) {
  try { localStorage.setItem('rot_radio_custom', JSON.stringify(a.slice(0, RADIO_MAX_CUSTOM))); } catch (e) {}
}
function radioRemoveCustom(key, ev) {
  if (ev) ev.stopPropagation();
  _radioSaveCustom(_radioCustom().filter(function (c) { return c.key !== key; }));
  if (_radioStation && _radioStation.key === key) radioStop();
  else _radioRefresh();
}
function radioAddOpen() {
  var f = document.getElementById('radio-add');
  if (!f) return;
  var open = f.style.display === 'none';
  f.style.display = open ? '' : 'none';
  if (open) { var i = f.querySelector('input'); i.value = ''; _radioAddMsg(''); i.focus(); }
  var p = document.getElementById('radio-player');
  if (p) _radioPlace(p);
}
function _radioAddMsg(t, bad) {
  var m = document.getElementById('radio-add-msg');
  if (m) { m.textContent = t; m.className = 'radio-add-msg' + (bad ? ' bad' : ''); }
}
function radioAddSubmit(ev) {
  if (ev) ev.preventDefault();
  var input = document.querySelector('#radio-add input');
  var url = (input && input.value || '').trim();
  if (!url) { _radioAddMsg('Paste a YouTube link first.', true); return false; }
  if (_radioCustom().length >= RADIO_MAX_CUSTOM) { _radioAddMsg('You can keep 5. Remove one first.', true); return false; }
  if (typeof SUPA_URL === 'undefined') { _radioAddMsg('Could not reach the server. Try again.', true); return false; }
  _radioAddMsg('Looking it up…');
  fetch(SUPA_URL + '/functions/v1/yt-resolve', {
    method: 'POST',
    headers: { 'apikey': SUPA_KEY, 'Authorization': 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: url })
  }).then(function (r) { return r.json(); }).then(function (d) {
    if (!d || !d.ok || !d.embed) { _radioAddMsg((d && d.reason) || 'That link could not be added.', true); return; }
    var a = _radioCustom();
    var key = 'c_' + d.embed.id;
    if (a.some(function (c) { return c.key === key; })) { _radioAddMsg('Already in your list.', true); return; }
    a.push({ key: key, type: d.embed.type, id: d.embed.id, kind: d.kind,
             label: Array.from(String(d.title || 'YouTube')).slice(0, 80).join(''),
             icon: d.kind === 'channel' ? '📺' : d.kind === 'playlist' ? '🎙' : '▶' });
    _radioSaveCustom(a);
    _radioAddMsg('');
    document.getElementById('radio-add').style.display = 'none';
    radioPlay(key);
  }).catch(function () { _radioAddMsg('Could not reach the server. Try again.', true); });
  return false;
}

function _radioChips(cls, manage) {
  var on = _radioStation ? _radioStation.key : '';
  var html = RADIO_STATIONS.concat(_radioCustom()).map(function (s) {
    var own = s.key.indexOf('c_') === 0;
    var chars = Array.from(s.label);   /* by character, so an emoji is never cut in half */
    var name = own && chars.length > 18 ? chars.slice(0, 17).join('').trim() + '…' : s.label;
    return '<button class="' + cls + (s.key === on ? ' active' : '') + (own ? ' own' : '') + '"'
      + ' onclick="radioPlay(\'' + s.key + '\')"' + (own ? ' title="' + _radioEsc(s.label) + '"' : '') + '>'
      + '<span>' + s.icon + '</span> ' + _radioEsc(name)
      + (own && manage ? '<span class="radio-chip-x" role="button" title="Remove" aria-label="Remove" onclick="radioRemoveCustom(\'' + s.key + '\', event)">×</span>' : '')
      + '</button>';
  }).join('');
  if (manage && _radioCustom().length < RADIO_MAX_CUSTOM) {
    html += '<button class="' + cls + ' radio-chip-add" onclick="radioAddOpen()" title="Add a YouTube channel, video or playlist">＋ Add your own</button>';
  }
  return html;
}

function _radioPanel() {
  var p = document.getElementById('radio-player');
  if (p) return p;
  p = document.createElement('div');
  p.id = 'radio-player';
  p.className = 'radio-player';
  var vol = _radioVol();
  p.innerHTML =
      '<div class="radio-hdr" title="Drag to move">'
    +   '<span class="radio-grip" aria-hidden="true">⠿</span>'
    +   '<span class="radio-title">🎧 Radio</span>'
    +   '<button class="radio-btn radio-mute" onclick="radioMute()" title="Mute" aria-label="Mute">' + _radioVolIcon(vol) + '</button>'
    +   '<input type="range" class="radio-vol" min="0" max="100" step="1" value="' + vol + '"'
    +     ' oninput="radioVolume(this.value)" title="Volume" aria-label="Volume">'
    +   '<button class="radio-btn radio-min" onclick="radioCompact()" title="Smaller" aria-label="Smaller">–</button>'
    +   '<button class="radio-btn radio-x" onclick="radioStop()" title="Stop and close" aria-label="Stop and close">×</button>'
    + '</div>'
    + '<div class="radio-chips" id="radio-chips"></div>'
    + '<form class="radio-add" id="radio-add" style="display:none;" onsubmit="return radioAddSubmit(event)">'
    +   '<input type="text" inputmode="url" autocomplete="off" spellcheck="false" placeholder="Paste a YouTube channel, video or playlist link" aria-label="YouTube link">'
    +   '<button type="submit" class="radio-chip">Add</button>'
    +   '<div class="radio-add-msg" id="radio-add-msg"></div>'
    +   '<div class="radio-add-note">Up to 5, saved on this device only. You are responsible for the links you add.</div>'
    + '</form>'
    + '<div class="radio-frame" id="radio-frame"></div>'
    + '<div class="radio-credit" id="radio-credit"></div>';
  document.body.appendChild(p);
  /* The mouse wheel over the slider turns the volume, 5 a notch. */
  p.querySelector('.radio-vol').addEventListener('wheel', function (e) {
    e.preventDefault();
    var v = Math.max(0, Math.min(100, Number(this.value) + (e.deltaY < 0 ? 5 : -5)));
    this.value = v; radioVolume(v);
  }, { passive: false });
  _radioApplyLayout(p);
  _radioDraggable(p);
  return p;
}

/* ── Volume (Daniel, 2026-10-03: YouTube's own slider is too fiddly) ─
   Our slider in the bar sends YouTube's own setVolume / mute commands
   to the player (the iframe API, enablejsapi=1). Remembered per
   browser; default 60. The player only listens once it is ready, so the
   saved volume is sent a few times in the first seconds. */
function _radioVol() {
  var v = parseInt(_radioPref('rot_radio_vol', '60'), 10);
  return isNaN(v) ? 60 : Math.max(0, Math.min(100, v));
}
function _radioVolIcon(v) { return v === 0 ? '🔇' : v < 50 ? '🔉' : '🔊'; }
function _radioCmd(func, args) {
  var f = document.querySelector('#radio-frame iframe');
  if (!f || !f.contentWindow) return;
  try {
    f.contentWindow.postMessage(JSON.stringify({ event: 'command', func: func, args: args || [] }),
      'https://www.youtube-nocookie.com');
  } catch (e) {}
}
function _radioSendVol() {
  var v = _radioVol();
  var au = document.querySelector('#radio-frame audio');
  if (au) { au.volume = v / 100; au.muted = v === 0; return; }
  _radioCmd('setVolume', [v]);
  _radioCmd(v === 0 ? 'mute' : 'unMute');
}
var _radioReady = false, _radioKnock = null;
window.addEventListener('message', function (e) {
  if (e.origin !== 'https://www.youtube-nocookie.com') return;
  var d; try { d = JSON.parse(e.data); } catch (x) { return; }
  if (!d || _radioReady) return;
  if (d.event === 'onReady' || d.event === 'initialDelivery' || d.event === 'infoDelivery') {
    _radioReady = true;
    clearInterval(_radioKnock);
    _radioSendVol();
    setTimeout(_radioSendVol, 800);   /* once more, in case playback reset it */
  }
});
function radioVolume(v) {
  v = Math.max(0, Math.min(100, parseInt(v, 10) || 0));
  try { localStorage.setItem('rot_radio_vol', String(v)); } catch (e) {}
  if (v > 0) { try { localStorage.setItem('rot_radio_vol_last', String(v)); } catch (e) {} }
  var p = document.getElementById('radio-player');
  if (p) {
    var r = p.querySelector('.radio-vol');
    r.value = v;
    r.style.setProperty('--fill', v + '%');
    var m = p.querySelector('.radio-mute');
    m.textContent = _radioVolIcon(v);
    m.title = v === 0 ? 'Unmute' : 'Mute';
    m.setAttribute('aria-label', m.title);
  }
  _radioSendVol();
}
function radioMute() {
  if (_radioVol() === 0) radioVolume(parseInt(_radioPref('rot_radio_vol_last', '60'), 10) || 60);
  else radioVolume(0);
}

/* ── Smaller, and anywhere on the screen (Daniel, 2026-10-03) ──────
   Compact keeps only a thin bar and the video. The video never goes
   below 200px tall (YouTube's minimum), so "smaller" is as small as
   the rules allow; hiding it while it plays is not allowed. Drag the
   bar to put it wherever you like (the first version snapped to the
   corners; Daniel wanted it free). The spot is kept as a share of the
   free space (0 = left/top, 1 = right/bottom), so it keeps its place in
   proportion when the window is resized and never falls off screen. */
function _radioPref(k, dflt) {
  try { return localStorage.getItem(k) || dflt; } catch (e) { return dflt; }
}
var RADIO_EDGE = 8;
function _radioPos() {
  try {
    var o = JSON.parse(localStorage.getItem('rot_radio_pos') || 'null');
    if (o && typeof o.x === 'number' && typeof o.y === 'number') return o;
  } catch (e) {}
  return { x: 1, y: 1 };   /* bottom right */
}
function _radioPlace(p) {
  var o = _radioPos();
  var fw = Math.max(0, window.innerWidth - p.offsetWidth - 2 * RADIO_EDGE);
  var fh = Math.max(0, window.innerHeight - p.offsetHeight - 2 * RADIO_EDGE);
  p.style.left = (RADIO_EDGE + o.x * fw) + 'px';
  p.style.top = (RADIO_EDGE + o.y * fh) + 'px';
}
function _radioApplyLayout(p) {
  var compact = _radioPref('rot_radio_compact', '0') === '1';
  p.classList.toggle('compact', compact);
  var b = p.querySelector('.radio-min');
  if (b) {
    b.textContent = compact ? '+' : '–';
    b.title = compact ? 'Bigger' : 'Smaller';
    b.setAttribute('aria-label', b.title);
  }
  p.querySelector('.radio-vol').style.setProperty('--fill', _radioVol() + '%');
  _radioPlace(p);
}
function radioCompact() {
  var on = _radioPref('rot_radio_compact', '0') !== '1';
  try { localStorage.setItem('rot_radio_compact', on ? '1' : '0'); } catch (e) {}
  var p = document.getElementById('radio-player');
  if (p) _radioApplyLayout(p);
}
window.addEventListener('resize', function () {
  var p = document.getElementById('radio-player');
  if (p) _radioPlace(p);
});
function _radioDraggable(p) {
  var hdr = p.querySelector('.radio-hdr');
  var sx, sy, ox, oy, moved = false, dragging = false;
  hdr.addEventListener('pointerdown', function (e) {
    if (e.target.closest('button, input')) return;
    var r = p.getBoundingClientRect();
    sx = e.clientX; sy = e.clientY; ox = r.left; oy = r.top;
    dragging = true; moved = false;
    p.classList.add('dragging');   /* the video ignores the pointer while dragging */
    try { hdr.setPointerCapture(e.pointerId); } catch (x) {}
  });
  hdr.addEventListener('pointermove', function (e) {
    if (!dragging) return;
    var dx = e.clientX - sx, dy = e.clientY - sy;
    if (!moved && Math.abs(dx) + Math.abs(dy) < 4) return;
    moved = true;
    var maxL = window.innerWidth - p.offsetWidth - RADIO_EDGE;
    var maxT = window.innerHeight - p.offsetHeight - RADIO_EDGE;
    p.style.left = Math.max(RADIO_EDGE, Math.min(maxL, ox + dx)) + 'px';
    p.style.top = Math.max(RADIO_EDGE, Math.min(maxT, oy + dy)) + 'px';
  });
  var end = function () {
    if (!dragging) return;
    dragging = false;
    p.classList.remove('dragging');
    if (!moved) return;
    var fw = window.innerWidth - p.offsetWidth - 2 * RADIO_EDGE;
    var fh = window.innerHeight - p.offsetHeight - 2 * RADIO_EDGE;
    var x = fw > 0 ? (parseFloat(p.style.left) - RADIO_EDGE) / fw : 1;
    var y = fh > 0 ? (parseFloat(p.style.top) - RADIO_EDGE) / fh : 1;
    try {
      localStorage.setItem('rot_radio_pos', JSON.stringify({ x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) }));
    } catch (x2) {}
  };
  hdr.addEventListener('pointerup', end);
  hdr.addEventListener('pointercancel', end);
}

function radioPlay(key) {
  _radioPlayNow(_radioFind(key || _radioSaved()).key);
}
function _radioPlayNow(key) {
  var s = _radioFind(key);
  if (_radioStation && _radioStation.key === s.key && document.getElementById('radio-player')) return;
  _radioStation = s;
  try { localStorage.setItem('rot_radio_station', s.key); } catch (e) {}
  if (typeof hbSoundStop === 'function') hbSoundStop();
  var p = _radioPanel();
  p.classList.toggle('is-audio', s.type === 'audio');
  if (s.type === 'audio') { _radioPlayAudio(p, s); return; }
  document.getElementById('radio-frame').innerHTML =
    '<iframe src="https://www.youtube-nocookie.com/embed/'
    + (s.type === 'list' ? (s.start ? s.start + '?list=' + s.id + '&' : 'videoseries?list=' + s.id + '&') : s.id + '?')
    + 'autoplay=1&playsinline=1&rel=0&enablejsapi=1&origin=' + encodeURIComponent(location.origin) + '"'
    + ' title="' + _radioEsc(s.label) + '" allow="autoplay; encrypted-media; picture-in-picture"'
    + ' referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>';
  /* Set the saved volume once the player is ready. Commands sent before
     that are dropped (tested: the player came up at its own volume), so
     knock with 'listening' until it answers, then send. */
  _radioReady = false;
  var f = document.querySelector('#radio-frame iframe');
  f.addEventListener('load', function () {
    var tries = 0;
    clearInterval(_radioKnock);
    _radioKnock = setInterval(function () {
      if (_radioReady || ++tries > 40 || !f.contentWindow) { clearInterval(_radioKnock); return; }
      try { f.contentWindow.postMessage(JSON.stringify({ event: 'listening', id: 'rotator-radio' }), 'https://www.youtube-nocookie.com'); } catch (e) {}
    }, 250);
  });
  var own = s.key.indexOf('c_') === 0;
  document.getElementById('radio-credit').innerHTML = own
    ? 'Playing <b>' + _radioEsc(s.label) + '</b> from YouTube'
    : s.by
    ? 'Latest videos from <a href="' + s.url + '" target="_blank" rel="noopener">' + _radioEsc(s.by) + '</a> on YouTube'
    : '';
  p.style.display = '';
  _radioRefresh();
}

/* Live radio: a plain <audio> on the station's stream, a small card
   instead of a video, and the state in words (connecting, live,
   buffering, offline). The click that chose the station allows play(). */
function _radioPlayAudio(p, s) {
  var frame = document.getElementById('radio-frame');
  frame.innerHTML = '<div class="radio-live">'
    + '<span class="radio-live-ico" aria-hidden="true">' + s.icon + '</span>'
    + '<div class="radio-live-txt"><b>' + _radioEsc(s.label) + '</b>'
    + '<span class="radio-live-state" id="radio-live-state">Connecting…</span></div></div>';
  var au = document.createElement('audio');
  au.preload = 'none';
  au.src = s.stream;
  frame.appendChild(au);
  var state = function (t, cls) {
    var el = document.getElementById('radio-live-state');
    if (el) { el.textContent = t; el.className = 'radio-live-state' + (cls ? ' ' + cls : ''); }
  };
  au.addEventListener('playing', function () { state('● Live', 'on'); });
  au.addEventListener('waiting', function () { state('Buffering…'); });
  au.addEventListener('error', function () { state('This station is offline right now. Try another one.', 'bad'); });
  _radioSendVol();
  var pr = au.play();
  if (pr && pr.catch) pr.catch(function (e) {
    if (e && e.name === 'NotAllowedError') state('Press the station again to start.', 'bad');
  });
  document.getElementById('radio-credit').innerHTML = 'Live from <a href="' + s.url + '" target="_blank" rel="noopener">'
    + _radioEsc(s.by) + '</a>';
  p.style.display = '';
  _radioRefresh();
}

function radioStop() {
  _radioStation = null;
  var p = document.getElementById('radio-player');
  var au = p && p.querySelector('audio');
  if (au) { au.pause(); au.removeAttribute('src'); au.load(); }   /* close the stream, not just the sound */
  if (p) p.parentNode.removeChild(p);   /* removing the iframe is what stops a YouTube station */
  _radioRefresh();
}

/* The top-bar button: open the last station, or close if playing. */
function radioToggle() {
  if (radioPlaying()) radioStop(); else radioPlay();
}

function _radioRefresh() {
  var chips = document.getElementById('radio-chips');
  if (chips) chips.innerHTML = _radioChips('radio-chip', true);
  /* Place it again whenever its contents change: placed while still
     empty, the player sat too low and the video ran off the bottom. */
  var player = document.getElementById('radio-player');
  if (player) _radioPlace(player);
  var set = document.getElementById('radio-setting-chips');
  if (set) set.innerHTML = _radioChips('radio-chip radio-chip-sm');
  var btn = document.getElementById('radio-topbar-btn');
  if (btn) btn.classList.toggle('on', radioPlaying());
}

(function _radioInit() {
  var init = function () {
    /* Left over from the Lofi Girl stations (retired 2026-10-04). */
    try { localStorage.removeItem('rot_radio_lofi'); } catch (e) {}
    _radioRefresh();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
