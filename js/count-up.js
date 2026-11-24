/* ROTATOR - proprietary software. Copyright (c) 2026 ROTATOR. All rights reserved.
   See LICENSE.txt. */
/* ══════════════════════════════════════════════════════════════════
   count-up.js — numbers that count up once when real data first lands
   (2026-11-24, Daniel: "where to use numbers to show up as a timer").

   CountUp(root, { ms }) finds the numbers in root's text (−6.1%, 41 of 241,
   $1.22B, Fear & Greed 11) and runs each from 0 to its value with an
   ease-out, then puts the exact original text back. Numbers that are a
   period of time ("200-day", "24 hours", "5 trading days") or part of a
   word stay still. Nothing runs with prefers-reduced-motion. The final
   text is always the original string, so nothing can be left half-way.
══════════════════════════════════════════════════════════════════ */
(function (host) {
  'use strict';
  var NUM = /\d[\d,]*(?:\.\d+)?/g;
  var TIME = /^(?:-|\s)?(?:day|days|hour|hours|trading|week|weeks|month|months|year|years|in a row)\b/i;
  function reduced() { try { return host.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } }
  function ease(t) { return 1 - Math.pow(1 - t, 3); }          /* cubic ease-out: quick start, soft landing */
  function split(src) {
    var parts = [], last = 0, m, any = false;
    NUM.lastIndex = 0;
    while ((m = NUM.exec(src))) {
      var raw = m[0], before = src.charAt(m.index - 1), after = src.slice(m.index + raw.length);
      if (/[A-Za-z]/.test(before) || TIME.test(after)) continue;   /* v16, 200-day, 24 hours */
      if (/^[A-Za-z]/.test(after) && !/^[KMBT](?![A-Za-z])/.test(after)) continue;   /* 1INCH, 0G; $1.22B still counts */
      parts.push(src.slice(last, m.index));
      parts.push({ v: parseFloat(raw.replace(/,/g, '')), dec: (raw.split('.')[1] || '').length, comma: raw.indexOf(',') >= 0 });
      last = m.index + raw.length; any = true;
    }
    if (!any) return null;
    parts.push(src.slice(last));
    return parts;
  }
  function fmt(p, k) {
    var x = p.v * k;
    if (p.comma) return x.toLocaleString('en-US', { minimumFractionDigits: p.dec, maximumFractionDigits: p.dec });
    return p.dec ? x.toFixed(p.dec) : String(Math.round(x));
  }
  function CountUp(root, opt) {
    if (!root || reduced()) return;
    var ms = (opt && opt.ms) || 700, items = [];
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    for (var n = walker.nextNode(); n; n = walker.nextNode()) {
      var parts = split(n.nodeValue);
      if (parts) items.push({ n: n, src: n.nodeValue, parts: parts });
    }
    if (!items.length) return;
    root.classList.add('counting');
    /* Start at zero in this same frame, so the final number never flashes first. */
    items.forEach(function (it) { it.n.nodeValue = it.parts.map(function (p) { return typeof p === 'string' ? p : fmt(p, 0); }).join(''); });
    var t0 = null;
    function frame(now) {
      if (t0 === null) t0 = now;
      var t = Math.min(1, (now - t0) / ms), k = ease(t);
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        if (!it.n.isConnected) continue;
        it.n.nodeValue = t >= 1 ? it.src : it.parts.map(function (p) { return typeof p === 'string' ? p : fmt(p, k); }).join('');
      }
      if (t < 1) host.requestAnimationFrame(frame); else root.classList.remove('counting');
    }
    host.requestAnimationFrame(frame);
  }
  /* Count when the element is first on screen (a hidden tab counts later). */
  CountUp.whenSeen = function (root, opt) {
    if (!root || reduced()) return;
    if (!('IntersectionObserver' in host)) { CountUp(root, opt); return; }
    var r = root.getBoundingClientRect();
    if (r.bottom > 0 && r.top < (host.innerHeight || 0)) { CountUp(root, opt); return; }   /* on screen now: start at once */
    var io = new IntersectionObserver(function (es) {
      if (es.some(function (e) { return e.isIntersecting; })) { io.disconnect(); CountUp(root, opt); }
    }, { threshold: 0.25 });
    io.observe(root);
  };
  host.CountUp = CountUp;
})(typeof window !== 'undefined' ? window : this);
