/* ROTATOR - proprietary software. Copyright (c) 2026 ROTATOR. All rights reserved.
   See LICENSE.txt. This code is public only so the site can run in your browser;
   it is not open source and may not be copied, modified or reused. */
/* ══════════════════════════════════════════════════════════════════
   score-coin.js — the exploding score coin, played on a timer
   (Daniel, 2026-10-23: "How is it calculated? → add our animated panel").

   The same coin as how-the-score-works.html and the landing page's
   chapter 07: five stacked discs (score, momentum, big markets, supply,
   size) that lift apart one at a time, each label arriving with its
   layer, then the sum line. Those two pages drive it by scroll; here it
   plays once each time the board's "How is it calculated?" opens.
   Example numbers, ranges from rotator-engine computeScores. Reduced
   motion shows it already apart. Labels are plain English; the MK layer's
   MutationObserver translates them like any other new text.

   Markup: <div class="se-coin" id="..."><div class="se-coin-sum">…</div></div>
   Call: scoreCoinMount(el) once, scoreCoinPlay(el) to (re)play.
══════════════════════════════════════════════════════════════════ */

var _SC_LAYERS = [
  { key: 'cap',  name: 'Rotator score',           pts: '34',  range: '−50 to 100', col: ['#f6d26b', '#d9a62a', '#8a6610'], ink: '#c9971f' },
  { key: 'mom',  name: 'Momentum rank',           pts: '+22', range: '0 to 40',    col: ['#5fd3a8', '#0e9f72', '#04664a'], ink: '#0e9f72' },
  { key: 'mac',  name: 'Against the big markets', pts: '+18', range: '0 to 30',    col: ['#8ab8f2', '#2f7ad8', '#174a8c'], ink: '#2f7ad8' },
  { key: 'tok',  name: 'Supply and unlocks',      pts: '−6',  range: '−50 to +30', col: ['#f0c27a', '#c98a26', '#7d5310'], ink: '#c98a26' },
  { key: 'size', name: 'Size nudge',              pts: '0',   range: '−4 to +2',   col: ['#c3cdd9', '#8695a8', '#4d5b6d'], ink: 'var(--muted)' }
];
var _SC = { RX: 120, RY: 46, TH: 16, VW: 244, CX: 122 };
_SC.VH = _SC.RY * 2 + _SC.TH + 4; _SC.CY = _SC.RY + 2; _SC.SQ = _SC.RY / _SC.RX;

function _scGlyph(key) {
  var F = 'font-family="IBM Plex Mono,ui-monospace,monospace" font-weight="800"', g = '';
  if (key === 'cap') {
    g += '<circle r="104" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="3"/><circle r="92" fill="none" stroke="rgba(90,60,0,.25)" stroke-width="1.5" stroke-dasharray="3 6"/>';
    g += '<text y="30" text-anchor="middle" ' + F + ' font-size="92" fill="#4a3606">34</text><text y="-50" text-anchor="middle" ' + F + ' font-size="22" letter-spacing="6" fill="rgba(74,54,6,.75)">⬡ SCORE</text>';
  } else if (key === 'mom') {
    g += '<rect x="-66" y="10" width="34" height="40" rx="4" fill="rgba(255,255,255,.75)"/><rect x="-17" y="-20" width="34" height="70" rx="4" fill="rgba(255,255,255,.85)"/><rect x="32" y="-58" width="34" height="108" rx="4" fill="#fff"/>';
    g += '<path d="M-80 30 L-30 -8 L10 -30 L74 -82" fill="none" stroke="#04533c" stroke-width="5" stroke-linecap="round"/><text y="88" text-anchor="middle" ' + F + ' font-size="20" fill="rgba(4,64,46,.8)">7D · 14D · 30D</text>';
  } else if (key === 'mac') {
    [['BTC', -58, -46], ['GOLD', 58, -46], ['SILV', -58, 48], ['OIL', 58, 48]].forEach(function (q) {
      g += '<circle cx="' + q[1] + '" cy="' + q[2] + '" r="30" fill="rgba(255,255,255,.85)"/><text x="' + q[1] + '" y="' + (q[2] + 7) + '" text-anchor="middle" ' + F + ' font-size="17" fill="#174a8c">' + q[0] + '</text>';
    });
    g += '<circle r="16" fill="#fff"/><text y="6" text-anchor="middle" ' + F + ' font-size="15" fill="#174a8c">vs</text>';
  } else if (key === 'tok') {
    var a = 0.78 * Math.PI * 2, r = 70, x = Math.sin(a) * r, y = -Math.cos(a) * r;
    g += '<circle r="' + r + '" fill="rgba(255,255,255,.35)"/><path d="M0 0 L0 ' + (-r) + ' A' + r + ' ' + r + ' 0 1 1 ' + x.toFixed(1) + ' ' + y.toFixed(1) + ' Z" fill="rgba(255,255,255,.9)"/>';
    g += '<text y="8" text-anchor="middle" ' + F + ' font-size="24" fill="#5c3c08">78%</text><text y="100" text-anchor="middle" ' + F + ' font-size="18" fill="rgba(92,60,8,.8)">UNLOCKED</text>';
  } else {
    g += '<circle r="96" fill="none" stroke="rgba(255,255,255,.7)" stroke-width="4"/><circle r="64" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="4"/><circle r="32" fill="none" stroke="rgba(255,255,255,.45)" stroke-width="4"/>';
    g += '<text y="7" text-anchor="middle" ' + F + ' font-size="18" fill="#2c3644">SIZE</text>';
  }
  return '<g transform="translate(' + _SC.CX + ' ' + _SC.CY + ') scale(1 ' + _SC.SQ.toFixed(3) + ')">' + g + '</g>';
}

function _scDisc(L, i, uid) {
  var S = _SC, c = L.col, id = uid + i;
  var side = 'M' + (S.CX - S.RX) + ' ' + S.CY + ' L' + (S.CX - S.RX) + ' ' + (S.CY + S.TH) + ' A' + S.RX + ' ' + S.RY + ' 0 0 0 ' + (S.CX + S.RX) + ' ' + (S.CY + S.TH)
    + ' L' + (S.CX + S.RX) + ' ' + S.CY + ' A' + S.RX + ' ' + S.RY + ' 0 0 1 ' + (S.CX - S.RX) + ' ' + S.CY + ' Z';
  return '<svg viewBox="0 0 ' + S.VW + ' ' + S.VH + '" aria-hidden="true"><defs>'
    + '<linearGradient id="' + id + 's" x1="0" x2="1"><stop offset="0" stop-color="' + c[2] + '"/><stop offset=".35" stop-color="' + c[1] + '"/><stop offset=".6" stop-color="' + c[0] + '"/><stop offset="1" stop-color="' + c[2] + '"/></linearGradient>'
    + '<radialGradient id="' + id + 'f" cx=".38" cy=".3" r=".9"><stop offset="0" stop-color="' + c[0] + '"/><stop offset=".7" stop-color="' + c[1] + '"/><stop offset="1" stop-color="' + c[2] + '"/></radialGradient></defs>'
    + '<path d="' + side + '" fill="url(#' + id + 's)"/><path d="' + side + '" fill="none" stroke="rgba(0,0,0,.18)" stroke-width="1"/>'
    + '<ellipse cx="' + S.CX + '" cy="' + S.CY + '" rx="' + S.RX + '" ry="' + S.RY + '" fill="url(#' + id + 'f)"/>'
    + '<ellipse cx="' + S.CX + '" cy="' + S.CY + '" rx="' + (S.RX - 1) + '" ry="' + (S.RY - 1) + '" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="1.5"/>'
    + _scGlyph(L.key) + '</svg>';
}

function _scClamp(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function _scEase(t) { return 1 - Math.pow(1 - t, 3); }
function _scSeg(p, a, b) { return _scClamp((p - a) / (b - a)); }

function scoreCoinMount(el) {
  if (!el || el._sc) return;
  var N = _SC_LAYERS.length, uid = 'sc' + Math.random().toString(36).slice(2, 7) + '-';
  var st = { el: el, discs: [], labels: [], G: {}, p: 0, raf: 0 };
  /* Bottom layer first, so the score cap paints on top. */
  for (var i = N - 1; i >= 0; i--) {
    var d = document.createElement('div'); d.className = 'sc-disc'; d.innerHTML = _scDisc(_SC_LAYERS[i], i, uid);
    el.appendChild(d); st.discs[i] = d;
  }
  _SC_LAYERS.forEach(function (L, i) {
    var l = document.createElement('div'); l.className = 'sc-lbl';
    l.innerHTML = '<div class="hd"><span class="nm">' + L.name + '</span><span class="pt" style="color:' + L.ink + '">' + L.pts + '</span></div><div class="rg">' + L.range + '</div>';
    el.appendChild(l); st.labels[i] = l;
  });
  st.sum = el.querySelector('.se-coin-sum');
  el._sc = st;
  window.addEventListener('resize', function () { if (el.offsetWidth) { _scLayout(st); _scRender(st, st.p); } });
}

function _scLayout(st) {
  var S = _SC, N = _SC_LAYERS.length, G = st.G, W = st.el.clientWidth, H = st.el.clientHeight, phone = W < 520;
  G.coinW = phone ? Math.min(W * 0.36, 130) : Math.min(W * 0.24, 170);
  G.discH = S.VH * G.coinW / S.VW; G.th = S.TH * G.coinW / S.VW; G.faceY = S.CY * G.coinW / S.VW;
  var usable = H - (phone ? 46 : 54);
  G.gap = Math.max(G.th, (usable - G.discH) / (N - 1));
  G.top0 = 10 + Math.max(0, (usable - (G.gap * (N - 1) + G.discH)) / 2);
  G.topAsm = (H - 30 - (G.th * (N - 1) + G.discH)) / 2;
  G.dx = phone ? 3 : 10;
  G.x0 = phone ? 6 : Math.max(16, W * 0.06);
  G.lblX = G.x0 + G.coinW + (phone ? 10 : 30);
  var lw = Math.max(120, Math.min(W - G.lblX - (N - 1) * G.dx - 8, 290));
  st.discs.forEach(function (d) { d.firstChild.setAttribute('width', G.coinW); d.firstChild.setAttribute('height', G.discH); });
  st.labels.forEach(function (l) { l.style.width = lw + 'px'; });
}

/* 0–.08 stacked; each layer lifts in its own slice of .08–.72, top
   first (the landing's chapter 07 timing); the sum line comes in last. */
function _scRender(st, p) {
  var G = st.G, N = _SC_LAYERS.length;
  for (var i = 0; i < N; i++) {
    var li = _scEase(_scSeg(p, 0.08 + i * 0.128, 0.08 + (i + 1) * 0.128));
    var y = G.topAsm + i * G.th + (G.top0 + i * G.gap - G.topAsm - i * G.th) * li;
    var x = G.x0 + i * G.dx * li;
    st.discs[i].style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)';
    var lo = _scSeg(li, 0.6, 1), l = st.labels[i];
    l.style.opacity = lo.toFixed(3);
    l.style.transform = 'translate3d(' + (G.lblX + i * G.dx + (1 - lo) * 14).toFixed(1) + 'px,' + (y + G.faceY - l.offsetHeight / 2).toFixed(1) + 'px,0)';
  }
  if (st.sum) st.sum.style.opacity = _scSeg(p, 0.76, 0.84).toFixed(3);
}

function scoreCoinPlay(el) {
  scoreCoinMount(el);
  var st = el && el._sc;
  if (!st || !el.offsetWidth) return;
  _scLayout(st);
  if (st.raf) cancelAnimationFrame(st.raf);
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) { st.p = 1; _scRender(st, 1); return; }
  var DUR = 2600, t0 = 0;
  st.p = 0; _scRender(st, 0);
  function tick(now) {
    if (!t0) t0 = now;
    st.p = Math.min(1, (now - t0) / DUR);
    _scRender(st, st.p);
    st.raf = st.p < 1 ? requestAnimationFrame(tick) : 0;
  }
  st.raf = requestAnimationFrame(tick);
}
