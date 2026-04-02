/* ══════════════════════════════════════════════════════════════════
   visuals.js  —  Pro ambient background sparkle overlay
   
   WHAT THIS DOES:
   • When a user has Pro unlocked, injects a full-page canvas behind
     all content that renders a continuous ambient sparkle field —
     gold/green/purple star-shaped particles drifting across the screen.
   • Activated by calling Visuals.start() after Pro is confirmed.
   • Deactivated by Visuals.stop() (e.g. on revokePro).
   • Canvas sits at z-index:0, pointer-events:none — never blocks clicks.
   
   HOW IT CONNECTS:
   • pro-system.js calls Visuals.start() inside openPro() when isPro=true
     and after checkProCode() unlocks Pro.
   • revokePro() calls Visuals.stop().
   • On page load, if isPro is already true, Visuals.start() auto-fires.
══════════════════════════════════════════════════════════════════ */

var Visuals = (function() {

  var canvas, ctx, raf, spawnTimer;
  var CW, CH;
  var pts = [];
  var running = false;

  /* ── Palette: gold, green, purple — matches Rotator theme ── */
  var COLORS = [
    { h: 43,  s: '95%', l: '62%' },   /* gold  — var(--bnb)  */
    { h: 160, s: '90%', l: '55%' },   /* green — var(--green) */
    { h: 265, s: '75%', l: '72%' }    /* pro   — var(--pro)   */
  ];

  function randomColor() {
    return COLORS[Math.floor(Math.random() * COLORS.length)];
  }

  /* ── Spawn a single sparkle particle ── */
  function spawn() {
    var c = randomColor();
    pts.push({
      x:     Math.random() * CW,
      y:     Math.random() * CH,
      r:     Math.random() * 1.6 + 0.5,   /* radius */
      life:  1,
      decay: Math.random() * 0.007 + 0.004, /* slow fade — ambient feel */
      vx:    (Math.random() - 0.5) * 0.45,
      vy:    (Math.random() - 0.5) * 0.45 - 0.12, /* slight upward drift */
      h:     c.h, s: c.s, l: c.l
    });
  }

  /* ── Draw a 4-pointed star at (x,y) with arm length r ── */
  function drawStar(x, y, r, alpha, h, s, l) {
    ctx.save();
    ctx.globalAlpha = alpha * 0.38;   /* subtle — ambient not intrusive */
    ctx.fillStyle   = 'hsl(' + h + ',' + s + ',' + l + ')';
    ctx.shadowColor = 'hsl(' + h + ',100%,70%)';
    ctx.shadowBlur  = 6;
    var s2 = r * 0.35;
    ctx.beginPath();
    ctx.moveTo(x,       y - r * 2.6);
    ctx.lineTo(x + s2,  y - s2);
    ctx.lineTo(x + r * 2.6, y);
    ctx.lineTo(x + s2,  y + s2);
    ctx.lineTo(x,       y + r * 2.6);
    ctx.lineTo(x - s2,  y + s2);
    ctx.lineTo(x - r * 2.6, y);
    ctx.lineTo(x - s2,  y - s2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function frame() {
    if (!running) return;
    ctx.clearRect(0, 0, CW, CH);

    /* Update + draw */
    pts = pts.filter(function(p) { return p.life > 0; });
    pts.forEach(function(p) {
      p.x    += p.vx;
      p.y    += p.vy;
      p.life -= p.decay;
      drawStar(p.x, p.y, p.r, p.life, p.h, p.s, p.l);
    });

    raf = requestAnimationFrame(frame);
  }

  function resize() {
    if (!canvas) return;
    CW = canvas.width  = window.innerWidth;
    CH = canvas.height = window.innerHeight;
  }

  /* ── Public API ── */
  function start() {
    if (running) return;

    /* Create and inject canvas if not already present */
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'sparkle-cv';
      canvas.style.cssText = [
        'position:fixed',
        'inset:0',
        'width:100%',
        'height:100%',
        'pointer-events:none',
        'z-index:0',
        'opacity:1'
      ].join(';');
      document.body.insertBefore(canvas, document.body.firstChild);
      ctx = canvas.getContext('2d');
    }

    resize();
    window.addEventListener('resize', resize);
    running = true;

    /* Seed initial particles so there's something on screen immediately */
    for (var i = 0; i < 35; i++) spawn();

    /* Ongoing spawn rate: 2 new particles every 180ms — gentle ambient density */
    spawnTimer = setInterval(function() {
      if (pts.length < 120) { spawn(); spawn(); }
    }, 180);

    raf = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    clearInterval(spawnTimer);
    cancelAnimationFrame(raf);
    if (canvas && ctx) ctx.clearRect(0, 0, CW, CH);
    window.removeEventListener('resize', resize);
  }

  /* ── Auto-start on page load if user already has Pro ── */
  document.addEventListener('DOMContentLoaded', function() {
    /* isPro is defined in pro-system.js which loads before visuals.js */
    if (typeof isPro !== 'undefined' && isPro) {
      start();
    }
  });

  return { start: start, stop: stop };

})();
