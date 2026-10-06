/* ══════════════════════════════════════════════════════════════════
   share-brand.js — one look for every Rotator share card
   (Daniel, 2026-10-06, promptove/138)

   A share card is seen at about 500px wide on X or Telegram, so a
   1200px card shows at ~0.42x: anything under ~40px on the canvas is
   hard to read in a feed. "Find out more on Rotator" used to be a 26px
   line and the address an 18-20px grey footer. Now every card ends in a
   solid gold bar with the hook, the call and the address, big enough to
   read in a feed.

   Used by: the coin card (data-loaders.js shareAsImage), the swap card
   (ratio.js shareSwapCard), the called-it card (signal-history.js).
══════════════════════════════════════════════════════════════════ */
var ROTATOR_SHARE = {
  url: 'rotatortool-official.github.io',
  /* Daniel's lines; a card shows one at random. "with Rotator" is left off
     the second here because the call beside it already names Rotator. */
  hooks: ['Money moves. Be there first.', 'Stay ahead of the crowd.'],
  cta: 'Find out more on Rotator →',
  gold: '#f3ba2f',
  ink: '#14110a'
};

/* Shrinks a font until the text fits maxW. `font` has {SIZE} in it. */
function shareFit(ctx, text, maxW, font, size, min) {
  var s = size;
  ctx.font = font.replace('{SIZE}', s);
  while (s > (min || 14) && ctx.measureText(text).width > maxW) { s -= 2; ctx.font = font.replace('{SIZE}', s); }
  return s;
}

/* The gold bar across the bottom: hook on the left, the call and the
   address on the right. Returns the bar's top, so a card keeps its
   content above it. */
function shareBrandBar(ctx, W, H, hook) {
  var barH = H >= 900 ? 150 : 124, top = H - barH, pad = W >= 1100 ? 60 : 50;
  ctx.fillStyle = ROTATOR_SHARE.gold;
  ctx.fillRect(0, top, W, barH);
  ctx.fillStyle = ROTATOR_SHARE.ink;
  ctx.textBaseline = 'alphabetic';

  // Right block first, so the hook gets whatever room is left.
  ctx.textAlign = 'right';
  var ctaSize = shareFit(ctx, ROTATOR_SHARE.cta, W * 0.48, '800 {SIZE}px Inter, sans-serif', H >= 900 ? 46 : 40, 26);
  ctx.fillText(ROTATOR_SHARE.cta, W - pad, top + barH / 2 + 2);
  var ctaW = ctx.measureText(ROTATOR_SHARE.cta).width;
  ctx.font = '700 ' + (H >= 900 ? 30 : 26) + 'px Inter, sans-serif';
  ctx.fillText(ROTATOR_SHARE.url, W - pad, top + barH / 2 + ctaSize * 0.95);

  ctx.textAlign = 'left';
  var hookText = hook || ROTATOR_SHARE.hooks[Math.floor(Math.random() * ROTATOR_SHARE.hooks.length)];
  shareFit(ctx, hookText, W - pad * 2 - Math.max(ctaW, 360) - 40, '800 {SIZE}px Inter, sans-serif', H >= 900 ? 44 : 38, 24);
  ctx.fillText(hookText, pad, top + barH / 2 + 14);
  return top;
}

/* A rounded pill with text, for signs on a card. tone: up | down | info */
function sharePill(ctx, x, y, text, tone, size) {
  var col = tone === 'up' ? ['rgba(0,200,150,0.14)', 'rgba(0,200,150,0.55)', '#00c896']
          : tone === 'down' ? ['rgba(243,186,47,0.14)', 'rgba(243,186,47,0.6)', '#f3ba2f']
          : ['rgba(255,255,255,0.06)', 'rgba(255,255,255,0.25)', 'rgba(255,255,255,0.85)'];
  size = size || 24;
  ctx.font = '700 ' + size + 'px Inter, sans-serif';
  var w = ctx.measureText(text).width + size * 1.4, h = size * 1.9;
  ctx.fillStyle = col[0]; _roundRect(ctx, x, y, w, h, h / 2); ctx.fill();
  ctx.strokeStyle = col[1]; ctx.lineWidth = 1.5; _roundRect(ctx, x, y, w, h, h / 2); ctx.stroke();
  ctx.fillStyle = col[2]; ctx.textAlign = 'left';
  ctx.fillText(text, x + size * 0.7, y + h / 2 + size * 0.36);
  return w;
}
