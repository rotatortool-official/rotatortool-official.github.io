/* ═══════════════════════════════════════════════════════════════════
   chart-kit.js — one frame for the page's own SVG charts (2026-11-14)

   Three things every chart gets, learned from charts.blockhorizon.io:
   1. A readout: move the mouse (or drag a finger) over a chart and a
      dashed line follows, with a small card naming the day and the value.
   2. A scale: faint lines at the high and the low with their values, and
      on line charts a coloured tag at the right edge with the last value.
   3. A soft start: the first time a chart is drawn it wipes in from the
      left. A redraw of the same chart (data refresh) does not repeat it.

   A chart builder calls ckWrap(svgHtml, options) and uses the returned
   HTML in place of the bare <svg>. Pages that do not load this file keep
   the bare chart: every caller checks `typeof ckWrap`.

   options:
     key     name of the chart; the wipe-in runs once per key
     x       line charts: the label of each point (a date)
     series  line charts: [{ n: name, f: [value as text, one per point] }]
             in the order the lines are drawn in the SVG
     scale   [{ y: 0..1 from the top of the chart, t: text }]
     last    { y: 0..1, t: text, cls: 'up' | 'dn' | 'gold' | 'blue' }
   Bar charts need no x/series: each bar's <title> ("13 Nov: −$185M") is
   the readout.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  var seen = {};
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function pct(y) { return (Math.max(0, Math.min(1, y)) * 100).toFixed(1); }

  window.ckWrap = function (svg, o) {
    if (!svg) return '';
    o = o || {};
    var fresh = o.key && !seen[o.key];
    if (o.key) seen[o.key] = 1;
    var h = '<div class="ck' + (fresh ? ' ck-new' : '') + (o.last ? ' ck-has-last' : '') + '"'
      + (o.x ? ' data-ck="' + esc(JSON.stringify({ x: o.x, s: o.series || [] })) + '"' : '') + '><div class="ck-plot">' + svg;
    (o.scale || []).forEach(function (s) {
      if (s && s.t) h += '<span class="ck-grid' + (s.y < 0.5 ? ' ck-g-top' : '') + '" style="top:' + pct(s.y) + '%"><i>' + esc(s.t) + '</i></span>';
    });
    /* One tag per line. Two lines that end close together would print on
       top of each other: push them apart to at least 15% of the height. */
    var tags = (o.last ? [].concat(o.last) : []).filter(function (t) { return t && t.t; })
      .map(function (t) { return { y: Math.max(0.05, Math.min(0.95, t.y)), t: t.t, cls: t.cls }; })
      .sort(function (a, b) { return a.y - b.y; });
    if (tags.length === 2 && tags[1].y - tags[0].y < 0.15) {
      var m = Math.max(0.125, Math.min(0.875, (tags[0].y + tags[1].y) / 2)); tags[0].y = m - 0.075; tags[1].y = m + 0.075;
    }
    tags.forEach(function (t) { h += '<span class="ck-last ' + esc(t.cls || '') + '" style="top:' + pct(t.y) + '%">' + esc(t.t) + '</span>'; });
    return h + '</div></div>';
  };
  /* A new range or coin is a new picture: let it wipe in again. */
  window.ckForget = function (key) { delete seen[key]; };

  /* ── Reading the chart back from its SVG ── */
  function paint(el, prop) { var c = getComputedStyle(el)[prop]; return c && c !== 'none' && c !== 'rgba(0, 0, 0, 0)' ? c : ''; }
  function parse(plot) {
    if (plot._ck) return plot._ck;
    var svg = plot.querySelector('svg'), ck = plot.parentNode, vb = svg && svg.viewBox && svg.viewBox.baseVal;
    if (!svg || !vb || !vb.width) return null;
    var g = { svg: svg, W: vb.width, H: vb.height, lines: [], cols: [], d: null };
    try { g.d = JSON.parse(ck.getAttribute('data-ck') || 'null'); } catch (e) {}
    svg.querySelectorAll('polyline, path').forEach(function (el) {
      var n = (el.getAttribute('points') || el.getAttribute('d') || '').match(/-?\d+(?:\.\d+)?/g) || [], pts = [];
      for (var i = 0; i + 1 < n.length; i += 2) pts.push([+n[i], +n[i + 1]]);
      if (pts.length > 1) g.lines.push({ pts: pts, color: paint(el, 'stroke') });
    });
    var by = {};
    svg.querySelectorAll('rect').forEach(function (r) {
      var t = r.querySelector('title'), x = +r.getAttribute('x'), k = x.toFixed(1);
      if (!by[k]) { by[k] = { cx: x + (+r.getAttribute('width') || 0) / 2, rects: [], rows: [] }; g.cols.push(by[k]); }
      by[k].rects.push(r);
      by[k].rows.push({ t: t ? t.textContent : '', color: paint(r, 'fill') || paint(r, 'stroke') });
      if (t) { r.setAttribute('aria-label', t.textContent); t.remove(); }   /* our card replaces the browser's slow tooltip */
    });
    return (plot._ck = g);
  }

  /* ── The readout: one set of elements, moved to whichever chart is under the pointer ── */
  var cur = null, hot = [], lineEl, tipEl, dotsEl, hideT;
  function els() {
    if (lineEl) return;
    lineEl = document.createElement('span'); lineEl.className = 'ck-x';
    dotsEl = document.createElement('span'); dotsEl.className = 'ck-dots';
    tipEl = document.createElement('div'); tipEl.className = 'ck-tip';
  }
  function hide() {
    clearTimeout(hideT);
    hot.forEach(function (r) { r.classList.remove('ck-hot'); }); hot = [];
    if (!cur) return;
    cur.parentNode.classList.remove('ck-on');
    [lineEl, dotsEl, tipEl].forEach(function (e) { if (e.parentNode) e.parentNode.removeChild(e); });
    cur = null;
  }
  function show(plot, clientX) {
    var g = parse(plot); if (!g) return;
    var r = g.svg.getBoundingClientRect(); if (!r.width) return;
    var fx = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    var head = '', rows = [], px = 0, dots = '';
    if (cur && cur !== plot) hide();
    if (g.lines.length) {
      var n = g.lines[0].pts.length, i = Math.round(fx * (n - 1));
      px = g.lines[0].pts[i][0] / g.W * r.width;
      head = g.d && g.d.x ? g.d.x[i] : '';
      g.lines.forEach(function (ln, k) {
        var p = ln.pts[Math.min(i, ln.pts.length - 1)], s = g.d && g.d.s && g.d.s[k];
        dots += '<i style="top:' + (p[1] / g.H * r.height).toFixed(1) + 'px;background:' + ln.color + '"></i>';
        if (s && s.f && s.f[i] != null) rows.push({ color: ln.color, n: s.n, v: s.f[i] });
      });
    } else if (g.cols.length) {
      var vx = fx * g.W, best = g.cols[0];
      g.cols.forEach(function (c) { if (Math.abs(c.cx - vx) < Math.abs(best.cx - vx)) best = c; });
      px = best.cx / g.W * r.width;
      hot.forEach(function (x) { x.classList.remove('ck-hot'); });
      hot = best.rects.slice(); hot.forEach(function (x) { x.classList.add('ck-hot'); });
      best.rows.forEach(function (row) {
        var k = row.t.indexOf(': ');
        if (k > 0 && !head) head = row.t.slice(0, k);
        rows.push({ color: row.color, n: '', v: k > 0 ? row.t.slice(k + 2) : row.t });
      });
    } else return;
    els(); clearTimeout(hideT);
    if (cur !== plot) { cur = plot; plot.appendChild(lineEl); plot.appendChild(dotsEl); plot.appendChild(tipEl); plot.parentNode.classList.add('ck-on'); }
    lineEl.style.left = px.toFixed(1) + 'px';
    dotsEl.style.left = px.toFixed(1) + 'px'; dotsEl.innerHTML = dots;
    if (!head && !rows.length) { tipEl.style.display = 'none'; return; }
    tipEl.style.display = '';
    tipEl.innerHTML = (head ? '<b class="ck-h">' + esc(head) + '</b>' : '') + rows.map(function (w) {
      return '<span class="ck-row"><i style="background:' + w.color + '"></i>' + (w.n ? '<em>' + esc(w.n) + '</em>' : '') + '<b>' + esc(w.v) + '</b></span>';
    }).join('');
    /* The card sits on the side with more room, and never leaves the chart. */
    var tw = tipEl.offsetWidth, x = px < r.width / 2 ? px + 12 : px - 12 - tw;
    tipEl.style.left = Math.max(0, Math.min(x, r.width - tw)).toFixed(1) + 'px';
  }
  function plotOf(e) { var t = e.target; return t && t.closest ? t.closest('.ck-plot') : null; }
  function onMove(e) {
    var p = plotOf(e);
    if (p) show(p, e.clientX); else if (cur && e.pointerType !== 'touch') hide();
  }
  document.addEventListener('pointermove', onMove, { passive: true });
  document.addEventListener('pointerdown', onMove, { passive: true });
  /* A finger lifts: leave the card up long enough to read, then clear. */
  function later(e) { if (cur && e.pointerType === 'touch') { clearTimeout(hideT); hideT = setTimeout(hide, 1800); } }
  document.addEventListener('pointerup', later, { passive: true });
  document.addEventListener('pointercancel', later, { passive: true });
  document.addEventListener('mouseleave', hide);
  window.addEventListener('blur', hide);
})();
