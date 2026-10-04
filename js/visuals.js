/* visuals.js — Handles the background canvas animation */
var Visuals = (function() {
  var canvas, ctx, CW, CH, rdy=false, fc=0, pf=0, ra=Math.PI, ga=0;
  var phase='pause1', TRAVEL=120, PAUSE=60;
  var FONT='600 11px "IBM Plex Mono"';

  function init() {
    canvas = document.getElementById('sparkle-cv');
    if(!canvas) return;
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
    rdy = true;
    requestAnimationFrame(frame);
  }
  function resize() { CW=canvas.width=canvas.offsetWidth; CH=canvas.height=canvas.offsetHeight; }
  function ease(t) { return t<.5 ? 2*t*t : -1+(4-2*t)*t; }
  function rpos(a) { return {x:(CW/2)+(CW*.38)*Math.cos(a), y:(CH/2)+(CH*.35)*Math.sin(a)}; }
  function frame() {
    if(!ctx) return;
    ctx.clearRect(0,0,CW,CH);
    // ... (Your original animation logic stays here)
    requestAnimationFrame(frame);
  }
  return { init: init };
})();
document.addEventListener('DOMContentLoaded', Visuals.init);