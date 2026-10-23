/* ROTATOR - proprietary software. Copyright (c) 2026 ROTATOR. All rights reserved.
   See LICENSE.txt. This code is public only so the site can run in your browser;
   it is not open source and may not be copied, modified or reused. */
/* ══════════════════════════════════════════════════════════════════
   scroll-scene.js — scroll-driven scenes for the tour pages (2026-10-20)

   The engine behind how-the-score-works.html's exploding coin, shared so
   every tour scene is just its picture plus a render(p) function.

   A scene is a tall element (its track) holding a sticky stage. As the
   track scrolls past, p runs 0 → 1 and render(p) draws that moment. The
   drawn p chases the scroll each frame (soft landing); with
   prefers-reduced-motion it follows the scroll exactly, no easing.
   Scenes far from the viewport are not drawn.

     ScrollScene.add(trackEl, { render: function (p) {}, resize: fn })
     ScrollScene.seg(p, a, b)   0..1 progress of p inside [a, b]
     ScrollScene.ease(t)        ease-out cubic
     ScrollScene.park(true)     hide scenes far from the screen (phones)
══════════════════════════════════════════════════════════════════ */
var ScrollScene = (function () {
  var scenes = [], raf = 0;
  var reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function seg(p, a, b) { return clamp((p - a) / (b - a), 0, 1); }
  function ease(t) { return 1 - Math.pow(1 - t, 3); }

  /* Parking (2026-10-23, iPhone reloads): with park(true), a scene more
     than a screen away gets the class 'parked' (the page hides its stage
     with display:none, freeing its graphics memory) and is laid out again
     before it scrolls into view. Only from the first real scroll, so a
     page that never scrolls (a search crawler) keeps every scene. */
  var parking = false, scrolled = false;
  function setParked(s, on) {
    if (s.parked === on) return;
    s.parked = on;
    s.el.classList.toggle('parked', on);
    if (!on) {
      if (s.opts.resize) s.opts.resize();
      s.opts.render(s.cur);
    }
  }
  function measure(s) {
    var r = s.el.getBoundingClientRect(), vh = window.innerHeight;
    var span = r.height - vh;
    s.target = span > 0 ? clamp(-r.top / span, 0, 1) : (r.top < vh ? 1 : 0);
    s.near = r.bottom > -vh && r.top < vh * 2;
    if (parking && scrolled) setParked(s, !s.near);
  }
  function tick() {
    var again = false;
    scenes.forEach(function (s) {
      if (!s.near && s.cur === s.target) return;
      var d = s.target - s.cur;
      s.cur = reduce || Math.abs(d) < 0.0005 ? s.target : s.cur + d * 0.14;
      s.opts.render(s.cur);
      if (s.cur !== s.target) again = true;
    });
    raf = again ? requestAnimationFrame(tick) : 0;
  }
  function refresh() {
    scenes.forEach(measure);
    if (!raf) raf = requestAnimationFrame(tick);
  }
  function add(el, opts) {
    var s = { el: el, opts: opts, cur: 0, target: 0, near: true, parked: false };
    measure(s);
    s.cur = s.target;
    if (opts.resize) opts.resize();
    opts.render(s.cur);
    scenes.push(s);
    return s;
  }
  function park(on) {
    parking = !!on;
    if (!parking) scenes.forEach(function (s) { setParked(s, false); });
    else refresh();
  }
  window.addEventListener('scroll', function () { scrolled = true; refresh(); }, { passive: true });
  /* A parked scene measures as 0 x 0; it is laid out when it comes back. */
  window.addEventListener('resize', function () {
    scenes.forEach(function (s) { if (s.parked) return; if (s.opts.resize) s.opts.resize(); s.opts.render(s.cur); });
    refresh();
  });
  return { add: add, refresh: refresh, park: park, clamp: clamp, seg: seg, ease: ease, reduce: reduce };
})();
