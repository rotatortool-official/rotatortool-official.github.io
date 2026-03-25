/* ══════════════════════════════════════════════════════════════════

signals.js — Investment opportunities, rotation/momentum signals,
leaderboard table & scoring engine

HOW TO EDIT THIS FILE:
──────────────────────
• CHANGE HOW MANY TILES SHOW: Edit the .slice(0, 6) calls in
renderTopBars() — change 6 to any number you want.

• CHANGE ROTATION THRESHOLD: In renderTopBars(), find:
c.score >= 62   (sells — coins to rotate out of)
c.score <= 38   (buys  — coins to rotate into)
Adjust these numbers to make signals more or less strict.

• CHANGE HIGH MOMENTUM THRESHOLD: Find c.score >= 60 in
renderTopBars() and change the number.

• CHANGE SCORING WEIGHTS: Edit computeScores() below.
L1 = momentum rank (base), L2 = macro adjustment,
L3 = tokenomics bonus/penalty.

══════════════════════════════════════════════════════════════════ */

/* ── Shared state ─────────────────────────────────────────────── */
var coins      = [];
var btcMA200   = null;
var btcPrice   = null;
var sortTF     = 7;   /* default sort column: 7-day */

/* ── Format helpers ──────────────────────────────────────────── */
function fmtP(p) {
if (p === null || p === undefined) return ‘—’;
if (p >= 1000) return ‘$’ + p.toLocaleString(‘en-US’, {maximumFractionDigits: 0});
if (p >= 1)    return ‘$’ + p.toFixed(2);
if (p >= 0.01) return ‘$’ + p.toFixed(4);
return ‘$’ + p.toFixed(6);
}

function pctSpan(v) {
var c = v >= 0 ? ‘pct up’ : ‘pct dn’;
return ‘<span class="' + c + '">’ + (v >= 0 ? ‘+’ : ‘’) + v.toFixed(2) + ‘%</span>’;
}

function dateOffset(days) {
var d = new Date(); d.setDate(d.getDate() + days);
return d.toISOString().slice(0, 10);
}

/* ── BTC trend pill ──────────────────────────────────────────── */
var _bearDismissed = false;
try { _bearDismissed = localStorage.getItem(‘rot_bear_dismissed’) === ‘1’; } catch(e) {}

function renderBTC() {
var pill    = document.getElementById(‘btc-pill’);
var pillTxt = document.getElementById(‘btc-pill-txt’);
var mobInner = document.getElementById(‘mob-btc-inner’);
var mobTxt  = document.getElementById(‘mob-btc-txt’);
if (!btcMA200 || !btcPrice) return;
if (btcPrice > btcMA200) {
if (pill)    pill.className    = ‘btc-pill bull’;
if (pillTxt) pillTxt.textContent = ‘BTC UPTREND ▲’;
if (mobInner) mobInner.className = ‘mob-btc-cell bull’;
if (mobTxt)  mobTxt.textContent = ‘▲ BTC’;
document.getElementById(‘bear-banner’).classList.remove(‘show’);
_bearDismissed = false;
try { localStorage.removeItem(‘rot_bear_dismissed’); } catch(e) {}
} else {
if (pill)    pill.className    = ‘btc-pill bear’;
if (pillTxt) pillTxt.textContent = ‘BTC DOWNTREND ▼’;
if (mobInner) mobInner.className = ‘mob-btc-cell’;
if (mobTxt)  mobTxt.textContent = ‘▼ BTC’;
if (!_bearDismissed) document.getElementById(‘bear-banner’).classList.add(‘show’);
}
}

/* ══════════════════════════════════════════════════════════════
INVESTMENT OPPORTUNITIES (top signal bar)
Three columns: Rotation Opps | High Momentum | Worst 30D
══════════════════════════════════════════════════════════════ */

/* Single signal tile (momentum / worst) */
function sigTile(c, kind) {
var badges = {rot:‘ROT’, mom:‘MOM’, wrst:‘WORST’};
var p24c = c.p24 >= 0 ? ‘up’ : ‘dn’;
var p7c  = c.p7  >= 0 ? ‘up’ : ‘dn’;
var p30c = c.p30 >= 0 ? ‘up’ : ‘dn’;
var scC  = c.score >= 65 ? ‘up’ : c.score <= 35 ? ‘dn’ : ‘am’;
return ‘<div class="sig-tile ' + kind + '" onclick="openTileDetail(\'' + c.id + '\',event)" title="Click for details">’
+ ‘<div class="sig-tile-top">’
+ ‘<div class="sig-tile-ico"><img src="' + c.image + '" alt="" onerror="this.style.display=\'none\'"></div>’
+ ‘<span class="sig-tile-sym">’ + c.sym + ‘</span>’
+ ‘<span class="sig-tile-badge ' + kind + '">’ + badges[kind] + ‘</span>’
+ ‘</div>’
+ ‘<div class="sig-tile-stats">’
+ ‘<div class="sig-stat"><span class="sig-stat-l">24H</span><span class="sig-stat-v ' + p24c + '">’ + (c.p24>=0?’+’:’’) + c.p24.toFixed(1) + ‘%</span></div>’
+ ‘<div class="sig-stat"><span class="sig-stat-l">7D</span><span class="sig-stat-v '  + p7c  + '">’ + (c.p7>=0?’+’:’’)  + c.p7.toFixed(1)  + ‘%</span></div>’
+ ‘<div class="sig-stat"><span class="sig-stat-l">30D</span><span class="sig-stat-v ' + p30c + '">’ + (c.p30>=0?’+’:’’) + c.p30.toFixed(1) + ‘%</span></div>’
+ ‘<div class="sig-stat"><span class="sig-stat-l">SCR</span><span class="sig-stat-v '  + scC  + '">’ + c.score + ‘</span></div>’
+ ‘</div>’
+ ‘</div>’;
}

/* Rotation opportunity tile (sell→buy pair) */
function sigRotTile(sell, buy) {
var delta = sell.score - buy.score;
return ‘<div class="sig-tile rot" onclick="openTileDetail(\'' + buy.id + '\',event)" title="Click for buy-side details">’
+ ‘<div class="sig-tile-top">’
+ ‘<div class="sig-tile-ico"><img src="' + sell.image + '" alt="" onerror="this.style.display=\'none\'"></div>’
+ ‘<span class="sig-tile-sym" style="color:var(--red);">’ + sell.sym + ‘</span>’
+ ‘<span style="color:var(--muted);font-size:10px;">→</span>’
+ ‘<div class="sig-tile-ico"><img src="' + buy.image + '" alt="" onerror="this.style.display=\'none\'"></div>’
+ ‘<span class="sig-tile-sym" style="color:var(--green);">’ + buy.sym + ‘</span>’
+ ‘<span class="sig-tile-badge rot">Δ’ + delta + ‘</span>’
+ ‘</div>’
+ ‘<div class="sig-tile-stats">’
+ ‘<div class="sig-stat"><span class="sig-stat-l">SELL 7D</span><span class="sig-stat-v '  + (sell.p7>=0?'up':'dn')  + '">’ + (sell.p7>=0?’+’:’’)  + sell.p7.toFixed(1)  + ‘%</span></div>’
+ ‘<div class="sig-stat"><span class="sig-stat-l">BUY 30D</span><span class="sig-stat-v ' + (buy.p30>=0?'up':'dn') + '">’ + (buy.p30>=0?’+’:’’) + buy.p30.toFixed(1) + ‘%</span></div>’
+ ‘<div class="sig-stat"><span class="sig-stat-l">SCR DELTA</span><span class="sig-stat-v am">’ + sell.score + ‘→’ + buy.score + ‘</span></div>’
+ ‘</div>’
+ ‘</div>’;
}

/* Render all three signal columns */
function renderTopBars() {
var hSyms = holdings.map(function(h) { return h.sym; });

/* ── Column 3: Worst 30D performers — 6 tiles ── */
var worst = coins.slice().sort(function(a, b) { return a.p30 - b.p30; }).slice(0, 6);
document.getElementById(‘worst-cards’).innerHTML =
‘<div class="sig-tiles-grid">’ + worst.map(function(c) { return sigTile(c, ‘wrst’); }).join(’’) + ‘</div>’;

/* ── Column 2: High momentum — top scoring coins, 6 tiles ── */
var momCoins = coins.slice().filter(function(c) { return c.score >= 60; }).sort(function(a, b) { return b.score - a.score; }).slice(0, 6);
var momEl = document.getElementById(‘mom-cards’);
if (momCoins.length) {
momEl.innerHTML = ‘<div class="sig-tiles-grid">’ + momCoins.map(function(c) { return sigTile(c, ‘mom’); }).join(’’) + ‘</div>’;
} else {
momEl.innerHTML = ‘<div class="no-sug">Scanning — no coins above momentum threshold right now.</div>’;
}

/* ── Column 1: Rotation opportunities (from held coins to laggards) ── */
var sugEl = document.getElementById(‘sug-cards’);
if (!holdings.length) { sugEl.innerHTML = ‘<div class="no-sug">Add holdings above to see rotation signals.</div>’; return; }

var held  = coins.filter(function(c) { return hSyms.indexOf(c.sym) >= 0; });
var sells = held.filter(function(c) { return c.score >= 62; }).sort(function(a, b) { return b.score - a.score; });
var buys  = coins.filter(function(c) { return hSyms.indexOf(c.sym) < 0 && c.score <= 38; }).sort(function(a, b) { return a.score - b.score; });

if (!sells.length) { sugEl.innerHTML = ‘<div class="no-sug">Monitoring — no holdings strongly outperforming yet.</div>’; return; }
if (!buys.length)  { sugEl.innerHTML = ‘<div class="no-sug">Scanning — no clear rotation targets right now.</div>’; return; }

var pairs = [];
for (var i = 0; i < Math.min(6, sells.length); i++) pairs.push({sell: sells[i], buy: buys[i % buys.length]});
sugEl.innerHTML = ‘<div class="sig-tiles-grid">’ + pairs.map(function(p) { return sigRotTile(p.sell, p.buy); }).join(’’) + ‘</div>’;
}

/* ══════════════════════════════════════════════════════════════
MOBILE TILE DETAIL POSITIONING
Fixes card being clipped off-screen on portrait mobile.
Called after the panel is shown & positioned by data-loaders.js
══════════════════════════════════════════════════════════════ */
function fixTileDetailMobile() {
var isMobile = window.innerWidth <= 700 ||
(window.innerWidth <= 900 && window.matchMedia(’(orientation: portrait)’).matches);
if (!isMobile) return;

var panel = document.getElementById(‘td-panel’);
if (!panel || panel.style.display === ‘none’) return;

/* Centre the card in the viewport and constrain its size */
panel.style.position   = ‘fixed’;
panel.style.top        = ‘50%’;
panel.style.left       = ‘50%’;
panel.style.transform  = ‘translate(-50%, -50%)’;
panel.style.width      = ‘min(92vw, 340px)’;
panel.style.maxHeight  = ‘82vh’;
panel.style.overflowY  = ‘auto’;
panel.style.zIndex     = ‘1000’;
/* Make sure the dimmed overlay is also visible */
var overlay = document.getElementById(‘td-overlay’);
if (overlay) overlay.style.display = ‘block’;
}

/* Patch openTileDetail to run the mobile fix after the panel appears.
This wraps whatever openTileDetail is defined in data-loaders.js
without replacing it — safe to call multiple times. */
(function() {
/* Wait until DOM + other scripts are ready */
function patchOpenTileDetail() {
var original = window.openTileDetail;
if (typeof original !== ‘function’) return; /* not ready yet, retry */
window.openTileDetail = function(id, evt) {
original(id, evt);          /* run the real function first */
fixTileDetailMobile();      /* then correct position on mobile */
};
}
/* Try immediately, then retry after scripts load */
if (document.readyState === ‘loading’) {
document.addEventListener(‘DOMContentLoaded’, function() {
setTimeout(patchOpenTileDetail, 0);
});
} else {
setTimeout(patchOpenTileDetail, 0);
}
})();

/* ══════════════════════════════════════════════════════════════
LEADERBOARD TABLE
══════════════════════════════════════════════════════════════ */
function renderTable() {
var body = document.getElementById(‘tbody’);
if (!coins.length) return;

var sorted = coins.slice().sort(function(a, b) {
if (sortTF === 0)  return b.score - a.score;
if (sortTF === 24) return b.p24 - a.p24;
if (sortTF === 7)  return b.p7  - a.p7;
if (sortTF === 14) return b.p14 - a.p14;
return b.p30 - a.p30;
});

var hSyms    = holdings.map(function(h) { return h.sym; });
var freeCoins = sorted.filter(function(c) { return !c.isPro; });
var proCoins  = sorted.filter(function(c) { return  c.isPro; });
var toRender  = isPro ? sorted : freeCoins;

var html = toRender.map(function(c, i) {
var isH = hSyms.indexOf(c.sym) >= 0;
var sc  = c.score;
var scC = sc >= 65 ? ‘var(–green)’ : sc < 0 ? ‘var(–red)’ : sc >= 40 ? ‘var(–amber)’ : ‘var(–muted)’;
var mcapStr = c.mcap ? ‘$’ + (c.mcap/1e9 >= 1 ? (c.mcap/1e9).toFixed(2) + ‘B’ : (c.mcap/1e6).toFixed(0) + ‘M’) : ‘—’;
var tipData = ‘data-sym=”’  + c.sym  + ‘” data-name=”’ + c.name + ‘” data-mcap=”’ + mcapStr
+ ‘” data-score=”’ + sc  + ‘” data-p24=”’  + c.p24.toFixed(2)
+ ‘” data-p7=”’   + c.p7.toFixed(2) + ‘” data-p30=”’ + c.p30.toFixed(2)
+ ‘” data-held=”’ + (isH ? ‘1’ : ‘0’) + ‘”’;
return ‘<tr class=”’ + (isH ? ‘held’ : ‘’) + ‘” ’ + tipData
+ ’ onmouseenter=“showRowTip(this,event)” onmouseleave=“hideTip()”>’
+ ‘<td style="color:var(--muted);font-size:10px;">’ + (i+1) + ‘</td>’
+ ‘<td><div class="cc"><div class="ti"><img src="' + c.image + '" alt="" onerror="this.style.display=\'none\'"></div>’
+ ‘<div><div style="display:flex;align-items:center;">’
+ ‘<span class="tsym">’ + c.sym + ‘</span>’
+ (isH ? ‘<span class="htag">HELD</span>’ : ‘’)
+ ‘</div><div class="tname">’ + c.name + ‘</div></div></div></td>’
+ ‘<td class="r" style="padding-right:8px;">’ + fmtP(c.price) + ‘</td>’
+ ‘<td class="pc">’ + pctSpan(c.p24) + ‘</td>’
+ ‘<td class="pc">’ + pctSpan(c.p7)  + ‘</td>’
+ ‘<td class="pc">’ + pctSpan(c.p14) + ‘</td>’
+ ‘<td class="pc">’ + pctSpan(c.p30) + ‘</td>’
+ ‘<td class="r"><div class="sw"><span class="sv" style="color:' + scC + ';">’ + sc + ‘</span>’
+ ‘<div class="sb"><div class="sbf" style="width:' + Math.max(2, sc) + '%;background:' + scC + ';"></div></div></div></td>’
+ ‘</tr>’;
}).join(’’);

if (!isPro && proCoins.length) {
html += ‘<tr class="pro-upsell-row"><td colspan="8"><div class="pro-upsell-banner">’
+ ‘<div class="pub-left"><span class="pub-icon">⚡</span><div>’
+ ‘<div class="pub-txt">+’ + proCoins.length + ’ more coins available in Pro</div>’
+ ‘<div class="pub-sub">Share your link with 3 friends to unlock — completely free</div>’
+ ‘</div></div>’
+ ‘<button class="pub-btn" onclick="openPro()">UNLOCK PRO →</button>’
+ ‘</div></td></tr>’;
}

body.innerHTML = html;
}

function renderCoinSel() {
var sel   = document.getElementById(‘coin-sel’);
var hSyms = holdings.map(function(h) { return h.sym; });
sel.innerHTML = ‘<option value="">Select…</option>’
+ coins.map(function(c) {
var held = hSyms.indexOf(c.sym) >= 0;
return ‘<option value=”’ + c.sym + ‘”’ + (held ? ’ disabled’ : ‘’) + ‘>’
+ (held ? ‘✓ ’ : ‘’) + c.sym + ’ — ’ + c.name + ‘</option>’;
}).join(’’);
}

/* Sort column click */
function setSort(tf) {
sortTF = tf;
[‘24’,‘7’,‘14’,‘30’,‘score’].forEach(function(k) {
var th = document.getElementById(‘th-’ + k);
if (th) th.classList.toggle(‘sorted’, (tf === 0 && k === ‘score’) || (tf > 0 && String(tf) === k));
});
renderTable();
}

/* Master render — call this after any data change */
function renderAll() {
renderBTC(); renderTiles(); renderTopBars(); renderTable(); renderCoinSel(); updateTierBadge();
var now     = new Date();
var coinsUrl = ‘https://api.coingecko.com/api/v3/coins/markets’;
var info    = getCacheInfo(coinsUrl);
var suffix  = ‘’;
if (info && info.fresh && info.age > 30000) {
var ageMins = Math.floor(info.age / 60000);
var ageSecs = Math.floor((info.age % 60000) / 1000);
var remMins = Math.floor(info.remaining / 60000);
suffix = ’ · cached ’ + (ageMins > 0 ? ageMins + ’m ’ : ‘’) + ageSecs + ‘s ago’
+ (remMins > 0 ? ’ · ↻ in ~’ + remMins + ‘m’ : ‘’);
}
renderDonationBar(‘sidebar-goal’);
document.getElementById(‘ts’).textContent =
’UPDATED ’ + now.toLocaleTimeString(‘en-US’, {hour:‘2-digit’, minute:‘2-digit’, second:‘2-digit’}) + suffix;
}