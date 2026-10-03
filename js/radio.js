/* ══════════════════════════════════════════════════════════════
   radio.js — Lofi Girl radio in the installed app (Daniel, 2026-10-03)
   ──────────────────────────────────────────────────────────────
   A small player with Lofi Girl's four 24/7 YouTube streams. FREE, not
   Pro: YouTube's terms forbid charging for access to embedded videos,
   and that is what shut down the big Discord music bots (Groovy and
   Rythm, 2021). Lofi Girl allows embedding its streams.

   Rules this file keeps:
   - The YouTube player stays VISIBLE while music plays (YouTube's
     embed terms). Closing the player stops the music; there is no
     hidden or audio-only mode.
   - Nothing loads from YouTube until the visitor presses a station.
     Uses youtube-nocookie.com. Named in the Privacy Policy, section 5.
   - The heartbeat sound stays quiet while the radio plays
     (radioPlaying() is checked in hbSoundStart, data-loaders.js).
   - Installed app only (the reward for installing). In a browser tab
     the Settings row offers the install instead.
   Stream IDs taken from the LIVE entries on
   https://www.youtube.com/@LofiGirl/streams on 2026-10-03. Lofi Girl
   restarts a stream under a NEW id now and then; the old one then shows
   "Video unavailable". YouTube oEmbed still answers for ended streams,
   so it cannot tell a dead id from a live one: check the streams page.
══════════════════════════════════════════════════════════════ */

var RADIO_STATIONS = [
  { key: 'lofi',      label: 'Lo-fi',     icon: '📚', id: 'rFZHOHl-L8A' },
  { key: 'jazz',      label: 'Jazz',      icon: '🎷', id: 'E2vONfzoyRI' },
  { key: 'synthwave', label: 'Synthwave', icon: '🌌', id: '4xDzrJKXOOY' },
  { key: 'sleep',     label: 'Sleep',     icon: '💤', id: 'JD-kMIpDfnY' }
];
var _radioStation = null;

function radioInstalled() {
  /* Testing on your own computer: http://localhost:8098/?app=1 acts as
     the installed app. Ignored on the live site. */
  if (location.hostname === 'localhost' && /[?&]app=1\b/.test(location.search)) return true;
  try {
    return window.matchMedia('(display-mode: standalone)').matches || !!window.navigator.standalone;
  } catch (e) { return false; }
}
function radioPlaying() { return !!_radioStation; }

function _radioSaved() {
  try { return localStorage.getItem('rot_radio_station') || 'lofi'; } catch (e) { return 'lofi'; }
}
function _radioFind(key) {
  for (var i = 0; i < RADIO_STATIONS.length; i++) if (RADIO_STATIONS[i].key === key) return RADIO_STATIONS[i];
  return RADIO_STATIONS[0];
}

function _radioChips(cls) {
  var on = _radioStation ? _radioStation.key : '';
  return RADIO_STATIONS.map(function (s) {
    return '<button class="' + cls + (s.key === on ? ' active' : '') + '" onclick="radioPlay(\'' + s.key + '\')">'
      + '<span>' + s.icon + '</span> ' + s.label + '</button>';
  }).join('');
}

function _radioPanel() {
  var p = document.getElementById('radio-player');
  if (p) return p;
  p = document.createElement('div');
  p.id = 'radio-player';
  p.className = 'radio-player';
  p.innerHTML =
      '<div class="radio-hdr" title="Drag to move">'
    +   '<span class="radio-grip" aria-hidden="true">⠿</span>'
    +   '<span class="radio-title">🎧 Lofi Girl radio</span>'
    +   '<button class="radio-btn radio-min" onclick="radioCompact()" title="Smaller" aria-label="Smaller">–</button>'
    +   '<button class="radio-btn radio-x" onclick="radioStop()" title="Stop and close" aria-label="Stop and close">×</button>'
    + '</div>'
    + '<div class="radio-chips" id="radio-chips"></div>'
    + '<div class="radio-frame" id="radio-frame"></div>'
    + '<div class="radio-credit">Music by <a href="https://www.youtube.com/@LofiGirl" target="_blank" rel="noopener">Lofi Girl</a> on YouTube</div>';
  document.body.appendChild(p);
  _radioApplyLayout(p);
  _radioDraggable(p);
  return p;
}

/* ── Smaller, and in any corner (Daniel, 2026-10-03) ──────────────
   Compact keeps only a thin bar and the video. The video never goes
   below 200px tall (YouTube's minimum), so "smaller" is as small as
   the rules allow; hiding it while it plays is not allowed. Drag the
   bar and the player snaps to the nearest corner; both choices are
   remembered per browser. */
function _radioPref(k, dflt) {
  try { return localStorage.getItem(k) || dflt; } catch (e) { return dflt; }
}
function _radioApplyLayout(p) {
  var compact = _radioPref('rot_radio_compact', '0') === '1';
  var corner = _radioPref('rot_radio_corner', 'br');
  p.classList.toggle('compact', compact);
  p.classList.remove('c-tl', 'c-tr', 'c-bl', 'c-br');
  p.classList.add('c-' + corner);
  p.style.left = p.style.top = p.style.right = p.style.bottom = '';
  var b = p.querySelector('.radio-min');
  if (b) {
    b.textContent = compact ? '+' : '–';
    b.title = compact ? 'Bigger' : 'Smaller';
    b.setAttribute('aria-label', b.title);
  }
}
function radioCompact() {
  var on = _radioPref('rot_radio_compact', '0') !== '1';
  try { localStorage.setItem('rot_radio_compact', on ? '1' : '0'); } catch (e) {}
  var p = document.getElementById('radio-player');
  if (p) _radioApplyLayout(p);
}
function _radioDraggable(p) {
  var hdr = p.querySelector('.radio-hdr');
  var sx, sy, ox, oy, moved = false, dragging = false;
  hdr.addEventListener('pointerdown', function (e) {
    if (e.target.closest('button')) return;
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
    var w = p.offsetWidth, h = p.offsetHeight;
    p.style.right = p.style.bottom = 'auto';
    p.style.left = Math.max(0, Math.min(window.innerWidth - w, ox + dx)) + 'px';
    p.style.top = Math.max(0, Math.min(window.innerHeight - h, oy + dy)) + 'px';
  });
  var end = function () {
    if (!dragging) return;
    dragging = false;
    p.classList.remove('dragging');
    if (!moved) return;
    var r = p.getBoundingClientRect();
    var corner = (r.top + r.height / 2 < window.innerHeight / 2 ? 't' : 'b')
               + (r.left + r.width / 2 < window.innerWidth / 2 ? 'l' : 'r');
    try { localStorage.setItem('rot_radio_corner', corner); } catch (x) {}
    _radioApplyLayout(p);
  };
  hdr.addEventListener('pointerup', end);
  hdr.addEventListener('pointercancel', end);
}

function radioPlay(key) {
  var s = _radioFind(key || _radioSaved());
  if (_radioStation && _radioStation.key === s.key && document.getElementById('radio-player')) return;
  _radioStation = s;
  try { localStorage.setItem('rot_radio_station', s.key); } catch (e) {}
  if (typeof hbSoundStop === 'function') hbSoundStop();
  var p = _radioPanel();
  document.getElementById('radio-frame').innerHTML =
    '<iframe src="https://www.youtube-nocookie.com/embed/' + s.id + '?autoplay=1&playsinline=1&rel=0"'
    + ' title="Lofi Girl ' + s.label + ' radio" allow="autoplay; encrypted-media; picture-in-picture"'
    + ' referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>';
  p.style.display = '';
  _radioRefresh();
}

function radioStop() {
  _radioStation = null;
  var p = document.getElementById('radio-player');
  if (p) p.parentNode.removeChild(p);   /* removing the iframe is what stops the sound */
  _radioRefresh();
}

/* The top-bar button: open the last station, or close if playing. */
function radioToggle() {
  if (radioPlaying()) radioStop(); else radioPlay();
}

function _radioRefresh() {
  var chips = document.getElementById('radio-chips');
  if (chips) chips.innerHTML = _radioChips('radio-chip');
  var set = document.getElementById('radio-setting-chips');
  if (set) set.innerHTML = _radioChips('radio-chip radio-chip-sm');
  var btn = document.getElementById('radio-topbar-btn');
  if (btn) btn.classList.toggle('on', radioPlaying());
}

(function _radioInit() {
  var init = function () {
    var installed = radioInstalled();
    var btn = document.getElementById('radio-topbar-btn');
    if (btn) btn.style.display = installed ? '' : 'none';
    var inApp = document.getElementById('radio-setting-app');
    var inTab = document.getElementById('radio-setting-tab');
    if (inApp) inApp.style.display = installed ? '' : 'none';
    if (inTab) inTab.style.display = installed ? 'none' : '';
    _radioRefresh();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
