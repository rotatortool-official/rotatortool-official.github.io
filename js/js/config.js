/* ══════════════════════════════════════════════════════════════════
   holdings.js  —  Holdings panels + Portfolio Signal for all 3 modes
   
   HOW TO EDIT THIS FILE:
   ──────────────────────
   • CHANGE HOW TILES LOOK:     Edit renderTiles() / renderFxTiles() /
                                 renderStHoldings()
   • CHANGE PORTFOLIO SIGNAL:   Edit renderSignal() (crypto),
                                 renderFxTiles() signal block (forex),
                                 renderStHoldings() signal block (stocks)
   • ADD/REMOVE TILE FIELDS:    Find the html+= block inside each
                                 render function and add/remove lines
══════════════════════════════════════════════════════════════════ */

/* ── State ───────────────────────────────────────────────────── */
var holdings   = loadH();
var fxHoldings = loadFxH();
var stHoldings = loadStH();
var sparkStop  = {};

/* ── Crypto holdings persistence ─────────────────────────────── */
function loadH()  { try { return JSON.parse(localStorage.getItem('rot_h5') || '[]'); } catch(e) { return []; } }
function saveH()  { try { localStorage.setItem('rot_h5', JSON.stringify(holdings)); } catch(e) {} }

/* ── Forex holdings persistence ──────────────────────────────── */
function loadFxH() { try { return JSON.parse(localStorage.getItem('rot_fx_h') || '[]'); } catch(e) { return []; } }
function saveFxH() { try { localStorage.setItem('rot_fx_h', JSON.stringify(fxHoldings)); } catch(e) {} }

/* ── Stocks holdings persistence ─────────────────────────────── */
function loadStH() { try { return JSON.parse(localStorage.getItem('rot_st_h') || '[]'); } catch(e) { return []; } }
function saveStH() { try { localStorage.setItem('rot_st_h', JSON.stringify(stHoldings)); } catch(e) {} }

/* ════════════════════════════════
   CRYPTO HOLDINGS
════════════════════════════════ */
function addHolding() {
  var sym = document.getElementById('coin-sel').value;
  var qty = parseFloat(document.getElementById('inp-qty').value) || null;
  var avg = parseFloat(document.getElementById('inp-avg').value) || null;
  if (!sym) return;
  var isFirst = holdings.length === 0;
  var idx = holdings.findIndex(function(h) { return h.sym === sym; });
  if (idx >= 0) holdings[idx] = {sym, qty, avg};
  else holdings.push({sym, qty, avg});
  saveH();
  if (isFirst) creditReferrer();
  document.getElementById('coin-sel').value  = '';
  document.getElementById('inp-qty').value   = '';
  document.getElementById('inp-avg').value   = '';
  renderAll();
}

function removeHolding(sym) {
  if (sparkStop[sym]) { sparkStop[sym](); delete sparkStop[sym]; }
  holdings = holdings.filter(function(h) { return h.sym !== sym; });
  saveH(); renderAll();
}

/* Enter key on qty/avg inputs triggers add */
['inp-qty', 'inp-avg'].forEach(function(id) {
  document.getElementById(id).addEventListener('keydown', function(e) { if (e.key === 'Enter') addHolding(); });
});

/* ── Crypto tile renderer ────────────────────────────────────── */
function renderTiles() {
  Object.keys(sparkStop).forEach(function(k) { sparkStop[k](); delete sparkStop[k]; });
  var grid  = document.getElementById('tiles-grid');
  var hcEl  = document.getElementById('hcount');
  if (hcEl) hcEl.textContent = holdings.length ? holdings.length + (holdings.length === 1 ? ' asset' : ' assets') : '';

  if (!holdings.length) {
    grid.innerHTML = '<div class="empty-t">No holdings yet.<br>Add a coin above.</div>';
    document.getElementById('sig-content').innerHTML = '<div style="font-size:11px;color:var(--muted);">Add holdings to see signal.</div>';
    return;
  }

  var heldCoins = holdings.map(function(h) { return coins.find(function(c) { return c.sym === h.sym; }); }).filter(Boolean);
  var topG = null;
  if (isPro) heldCoins.forEach(function(c) { if (!topG || c.p24 > topG.p24) topG = c; });

  var html = '';
  holdings.forEach(function(h) {
    var c = coins.find(function(x) { return x.sym === h.sym; });
    if (!c) {
      html += '<div class="tile"><div class="tile-top"><span class="tile-sym">' + h.sym + '</span><button class="tile-rm" onclick="removeHolding(\'' + h.sym + '\')">×</button></div><div style="font-size:10px;color:var(--muted);">Unavailable</div></div>';
      return;
    }
    var pl = '', plC = '';
    if (h.qty && h.avg) {
      var profit = (c.price - h.avg) * h.qty;
      var plPct  = ((c.price - h.avg) / h.avg * 100);
      plC = profit >= 0 ? 'up' : 'dn';
      pl  = (profit >= 0 ? '+' : '-') + '$' + Math.abs(profit).toLocaleString('en-US', {maximumFractionDigits:0}) + ' (' + (plPct >= 0 ? '+' : '') + plPct.toFixed(1) + '%)';
    }
    var glw   = c.score >= 65 ? 'glow-g' : c.score >= 40 ? 'glow-a' : 'glow-r';
    var scrC  = c.score >= 65 ? 'hi'     : c.score >= 40 ? 'md'     : 'lo';
    var isTop = topG && c.sym === topG.sym && c.p24 > 0;
    html += '<div class="tile ' + glw + '" id="tile-' + c.sym + '">'
      + (isTop ? '<canvas class="sp" id="sp-' + c.sym + '"></canvas>' : '')
      + '<div class="tile-top"><div class="tile-ico"><img src="' + c.image + '" alt="" onerror="this.style.display=\'none\'"></div><span class="tile-sym">' + c.sym + '</span><button class="tile-rm" onclick="removeHolding(\'' + h.sym + '\')">×</button></div>'
      + '<div class="tile-price">' + fmtP(c.price) + '</div>'
      + '<div class="tile-perfs">'
        + '<div class="tpf"><span class="tpf-l">24H</span><span class="tpf-v ' + (c.p24>=0?'up':'dn') + '">' + (c.p24>=0?'+':'') + c.p24.toFixed(1) + '%</span></div>'
        + '<div class="tpf"><span class="tpf-l">7D</span><span class="tpf-v '  + (c.p7>=0?'up':'dn')  + '">' + (c.p7>=0?'+':'')  + c.p7.toFixed(1)  + '%</span></div>'
        + '<div class="tpf"><span class="tpf-l">30D</span><span class="tpf-v ' + (c.p30>=0?'up':'dn') + '">' + (c.p30>=0?'+':'') + c.p30.toFixed(1) + '%</span></div>'
      + '</div>'
      + '<div class="tile-foot">' + (pl ? '<span class="tile-pl ' + plC + '">' + pl + '</span>' : '<span></span>') + '<span class="tile-scr ' + scrC + '">' + c.score + '</span></div>'
      + '</div>';
  });

  grid.innerHTML = html;
  if (topG && topG.p24 > 0) {
    requestAnimationFrame(function() { requestAnimationFrame(function() {
      var cv = document.getElementById('sp-' + topG.sym);
      if (cv) sparkStop[topG.sym] = startSparkle(cv);
    }); });
  }
  renderSignal(heldCoins);
}

/* ── Crypto portfolio signal ─────────────────────────────────── */
function renderSignal(hc) {
  var el = document.getElementById('sig-content');
  if (!hc || !hc.length) { el.innerHTML = '<div style="font-size:11px;color:var(--muted);">Add holdings to see signal.</div>'; return; }
  var avg   = hc.reduce(function(s, c) { return s + c.score; }, 0) / hc.length;
  var avgColor = avg >= 65 ? 'var(--green)' : avg >= 45 ? 'var(--amber)' : 'var(--red)';
  var over  = hc.filter(function(c) { return c.score >= 62; }).sort(function(a, b) { return b.score - a.score; });
  var under = hc.filter(function(c) { return c.score <= 38; }).sort(function(a, b) { return a.score - b.score; });
  var ok    = hc.filter(function(c) { return c.score > 38 && c.score < 62; });
  var h = '<div class="sig-avg" style="color:' + avgColor + ';">' + avg.toFixed(0) + '<span class="sig-avg-lbl">/ 100 avg score</span></div>';
  if (over.length)  { h += '<div class="sig-row-head" style="color:var(--amber);">↑ Rotate out</div>'; h += over.map(function(c)  { return '<div class="sig-coin-row sell"><span class="scr-sym">' + c.sym + '</span><span class="scr-val" style="color:var(--amber);">' + c.score + ' / outperforming</span></div>'; }).join(''); }
  if (under.length) {
    h += '<div class="sig-row-head" style="color:var(--red);">↓ Lagging — watch or exit</div>';
    h += under.map(function(c) { return '<div class="sig-coin-row buy"><span class="scr-sym">' + c.sym + '</span><span class="scr-val" style="color:var(--red);">' + c.score + ' / lagging</span></div>'; }).join('');
    h += '<div style="margin-top:8px;padding:7px 9px;background:rgba(255,69,96,.06);border:1px solid rgba(255,69,96,.2);border-radius:3px;font-size:10px;color:var(--muted);line-height:1.7;">'
      + '<span style="color:var(--red);font-weight:600;">⚠ DYOR:</span> A coin performing badly for months will not automatically recover because you bought it. Research before rotating capital. <span style="color:var(--red);">Rotator is not responsible for your investment decisions.</span>'
      + '</div>';
  }
  if (!over.length && !under.length) { h += '<div class="sig-row-head" style="color:var(--green);">✓ Balanced</div>'; h += ok.map(function(c) { return '<div class="sig-coin-row ok"><span class="scr-sym">' + c.sym + '</span><span class="scr-val" style="color:var(--green);">' + c.score + '</span></div>'; }).join(''); }
  el.innerHTML = h;
}

/* ════════════════════════════════
   FOREX HOLDINGS
════════════════════════════════ */
function addForexHolding() {
  var pair  = document.getElementById('fx-sel').value;
  var qty   = parseFloat(document.getElementById('fx-qty').value) || null;
  var entry = parseFloat(document.getElementById('fx-entry').value) || null;
  if (!pair) return;
  var idx = fxHoldings.findIndex(function(h) { return h.pair === pair; });
  if (idx >= 0) fxHoldings[idx] = {pair, qty, entry};
  else fxHoldings.push({pair, qty, entry});
  saveFxH();
  document.getElementById('fx-sel').value   = '';
  document.getElementById('fx-qty').value   = '';
  document.getElementById('fx-entry').value = '';
  renderFxTiles(); renderForexTable();
}

function removeFxHolding(pair) {
  fxHoldings = fxHoldings.filter(function(h) { return h.pair !== pair; });
  saveFxH(); renderFxTiles(); renderForexTable();
}

function renderFxTiles() {
  var grid  = document.getElementById('fx-tiles-grid');
  var sigEl = document.getElementById('fx-sig-content');
  var fxHcEl = document.getElementById('fx-hcount');
  if (fxHcEl) fxHcEl.textContent = fxHoldings.length ? fxHoldings.length + (fxHoldings.length === 1 ? ' pair' : ' pairs') : '';

  if (!fxHoldings.length) {
    grid.innerHTML  = '<div class="empty-t">No forex pairs yet.<br>Add a pair above.</div>';
    sigEl.innerHTML = '<div style="font-size:11px;color:var(--muted);">Add pairs to see signal.</div>';
    return;
  }

  grid.innerHTML = fxHoldings.map(function(h) {
    var d      = forexData.find(function(f) { return f.from + '/' + f.to === h.pair; });
    var rate   = d ? d.rate : 0;
    var chgPct = d ? d.chgPct : 0;
    var score  = d ? d.score : 0;
    var signal = d ? d.signal : '—';
    var pl = '';
    if (h.qty && h.entry && rate) { var profit = (rate - h.entry) * h.qty; var plC = profit >= 0 ? 'up' : 'dn'; pl = '<div class="tile-pl ' + plC + '">' + (profit >= 0 ? '+' : '') + profit.toFixed(2) + ' pts</div>'; }
    var scC = score >= 65 ? 'hi' : score >= 45 ? 'md' : 'lo';
    var glw = score >= 65 ? 'glow-g' : score >= 45 ? 'glow-a' : 'glow-r';
    var p7d = d ? d.p7 : 0, p30d = d ? d.p30 : 0;
    return '<div class="tile ' + glw + '">'
      + '<div class="tile-top"><span class="tile-sym" style="color:var(--bnb);">' + h.pair + '</span><button class="tile-rm" onclick="removeFxHolding(\'' + h.pair + '\')">×</button></div>'
      + '<div class="tile-price">' + (rate ? rate.toFixed(5) : '—') + '</div>'
      + '<div class="tile-perfs">'
        + '<div class="tpf"><span class="tpf-l">DAY%</span><span class="tpf-v ' + (chgPct>=0?'up':'dn') + '">' + (chgPct>=0?'+':'') + chgPct.toFixed(3) + '%</span></div>'
        + '<div class="tpf"><span class="tpf-l">7D%</span><span  class="tpf-v ' + (p7d>=0?'up':'dn')   + '">' + (p7d>=0?'+':'')   + p7d.toFixed(2)   + '%</span></div>'
        + '<div class="tpf"><span class="tpf-l">30D%</span><span class="tpf-v ' + (p30d>=0?'up':'dn')  + '">' + (p30d>=0?'+':'')  + p30d.toFixed(2)  + '%</span></div>'
      + '</div>'
      + pl
      + '<div class="tile-foot"><span class="tile-pl ' + (score>=65?'up':score<=35?'dn':'fl') + '" style="font-size:9px;">' + signal + '</span><span class="tile-scr ' + scC + '">' + score + '</span></div>'
      + '</div>';
  }).join('');

  /* Forex signal summary */
  if (forexData.length) {
    var held = fxHoldings.map(function(h) { return forexData.find(function(f) { return f.from + '/' + f.to === h.pair; }); }).filter(Boolean);
    if (held.length) {
      var avg  = held.reduce(function(s, f) { return s + f.score; }, 0) / held.length;
      var avgC = avg >= 65 ? 'var(--green)' : avg >= 45 ? 'var(--amber)' : 'var(--red)';
      sigEl.innerHTML = '<div class="sig-avg" style="color:' + avgC + ';">' + avg.toFixed(0) + '<span class="sig-avg-lbl">/ 100 avg score</span></div>'
        + '<div style="font-size:11px;color:var(--muted);margin-top:4px;">Based on trend momentum, volatility position and RSI signal.</div>';
    }
  }
}

/* ════════════════════════════════
   STOCKS HOLDINGS
════════════════════════════════ */
function addStockHolding() {
  var sym = document.getElementById('st-sel').value;
  var qty = parseFloat(document.getElementById('st-qty').value) || null;
  var avg = parseFloat(document.getElementById('st-avg').value) || null;
  if (!sym) return;
  var idx = stHoldings.findIndex(function(h) { return h.sym === sym; });
  if (idx >= 0) stHoldings[idx] = {sym, qty, avg};
  else stHoldings.push({sym, qty, avg});
  saveStH();
  document.getElementById('st-sel').value = '';
  document.getElementById('st-qty').value = '';
  document.getElementById('st-avg').value = '';
  renderStHoldings();
}

function removeStHolding(sym) {
  stHoldings = stHoldings.filter(function(h) { return h.sym !== sym; });
  saveStH(); renderStHoldings();
}

function renderStHoldings() {
  var grid  = document.getElementById('st-tiles-grid');
  var sigEl = document.getElementById('st-sig-content');
  var stHcEl = document.getElementById('st-hcount');
  if (stHcEl) stHcEl.textContent = stHoldings.length ? stHoldings.length + (stHoldings.length === 1 ? ' stock' : ' stocks') : '';

  if (!stHoldings.length) {
    grid.innerHTML  = '<div class="empty-t">No stocks yet.<br>Add a stock above.</div>';
    sigEl.innerHTML = '<div style="font-size:11px;color:var(--muted);">Add stocks to see signal.</div>';
    return;
  }

  grid.innerHTML = stHoldings.map(function(h) {
    var d      = stocksData.find(function(s) { return s.sym === h.sym; });
    var price  = d ? d.price : 0;
    var chgPct = d ? d.chgPct : 0;
    var score  = d ? d.score : 0;
    var pl = '';
    if (h.qty && h.avg && price) { var profit = (price - h.avg) * h.qty; var plC = profit >= 0 ? 'up' : 'dn'; pl = '<div class="tile-pl ' + plC + '">' + (profit >= 0 ? '+' : '-') + '$' + Math.abs(profit).toLocaleString('en-US', {maximumFractionDigits:0}) + '</div>'; }
    var scC = score >= 65 ? 'hi' : score >= 45 ? 'md' : 'lo';
    var glw = score >= 65 ? 'glow-g' : score >= 45 ? 'glow-a' : 'glow-r';
    return '<div class="tile ' + glw + '">'
      + '<div class="tile-top"><span class="tile-sym">' + h.sym + '</span><button class="tile-rm" onclick="removeStHolding(\'' + h.sym + '\')">×</button></div>'
      + '<div class="tile-price">' + (price ? '$' + price.toFixed(2) : '—') + '</div>'
      + '<div class="tile-perfs">'
        + '<div class="tpf"><span class="tpf-l">TODAY</span><span class="tpf-v ' + (chgPct>=0?'up':'dn') + '">' + (chgPct>=0?'+':'') + chgPct.toFixed(2) + '%</span></div>'
        + '<div class="tpf"><span class="tpf-l">SCORE</span><span class="tpf-v ' + (score>=65?'up':score<=35?'dn':'fl') + '">' + score + '</span></div>'
      + '</div>'
      + pl
      + '<div class="tile-foot"><span></span><span class="tile-scr ' + scC + '">' + score + '</span></div>'
      + '</div>';
  }).join('');

  /* Stocks signal summary */
  if (stocksData.length) {
    var held = stHoldings.map(function(h) { return stocksData.find(function(s) { return s.sym === h.sym; }); }).filter(Boolean);
    if (held.length) {
      var avg  = held.reduce(function(s, d) { return s + d.score; }, 0) / held.length;
      var avgC = avg >= 65 ? 'var(--green)' : avg >= 45 ? 'var(--amber)' : 'var(--red)';
      sigEl.innerHTML = '<div class="sig-avg" style="color:' + avgC + ';">' + avg.toFixed(0) + '<span class="sig-avg-lbl">/ 100 avg score</span></div>'
        + '<div style="font-size:11px;color:var(--muted);margin-top:4px;">Based on 52-week range position and daily momentum.</div>';
    }
  }
}

/* ══════════════════════════════════════════════════════════════════
   pro-system.js  —  Pro tier, referral links, donation codes
   
   HOW TO EDIT THIS FILE:
   ──────────────────────
   • Codes and goals are in config.js, not here.
   • This file just handles the logic: checking codes, referral
     tracking, tier badge, and the Pro modal content.
   • If you want to change the Pro modal wording, search for
     openPro() below.
══════════════════════════════════════════════════════════════════ */

/* ── State (loaded from localStorage) ─────────────────────────── */
var isPro = loadPro();

function loadPro()  { return getRefData().pro; }
function savePro(v) { var d = getRefData(); d.pro = v; saveRefData(d); }

/* ── Referral system helpers ─────────────────────────────────── */
function genId()      { return Math.random().toString(36).slice(2, 9); }
function getMyId()    { var id = localStorage.getItem('rot_uid'); if (!id) { id = genId(); localStorage.setItem('rot_uid', id); } return id; }
function getMyReferralLink() { return window.location.origin + window.location.pathname + '?ref=' + getMyId(); }

function getRefData()    { try { return JSON.parse(localStorage.getItem('rot_refs') || '{"refs":[],"pro":false}'); } catch(e) { return {refs:[], pro:false}; } }
function saveRefData(d)  { try { localStorage.setItem('rot_refs', JSON.stringify(d)); } catch(e) {} }

function processIncomingRef() {
  var p = new URLSearchParams(window.location.search), refId = p.get('ref');
  if (!refId || refId === getMyId()) return;
  localStorage.setItem('rot_came_from', refId);
}

function creditReferrer() {
  var from = localStorage.getItem('rot_came_from');
  if (!from || localStorage.getItem('rot_credited_' + from)) return;
  var key = 'rot_credit_for_' + from, ex = [];
  try { ex = JSON.parse(localStorage.getItem(key) || '[]'); } catch(e) {}
  var me = getMyId(); if (ex.indexOf(me) < 0) { ex.push(me); localStorage.setItem(key, JSON.stringify(ex)); }
  localStorage.setItem('rot_credited_' + from, '1');
}

function checkMyReferrals() {
  var key = 'rot_credit_for_' + getMyId(), cr = [];
  try { cr = JSON.parse(localStorage.getItem(key) || '[]'); } catch(e) {}
  var d = getRefData();
  cr.forEach(function(u) { if (d.refs.indexOf(u) < 0) d.refs.push(u); });
  if (d.refs.length >= 3 && !d.pro) { d.pro = true; showProToast(); }
  saveRefData(d); return d;
}

function showProToast() {
  var t = document.createElement('div');
  t.style.cssText = 'position:fixed;top:56px;left:50%;transform:translateX(-50%);background:#1a2030;border:1px solid #a78bfa;border-radius:6px;padding:14px 22px;font-family:IBM Plex Mono,monospace;font-size:12px;color:#a78bfa;z-index:900;text-align:center;box-shadow:0 0 30px rgba(167,139,250,.2);letter-spacing:.06em;';
  t.innerHTML = '⚡ PRO UNLOCKED — 3 friends joined!<br><span style="font-size:10px;color:#3e4d60;margin-top:4px;display:block;">Top 50 coins now available.</span>';
  document.body.appendChild(t);
  setTimeout(function() { t.style.transition = 'opacity .5s'; t.style.opacity = '0'; setTimeout(function() { t.remove(); }, 500); }, 4000);
}

/* ── Tier badge ──────────────────────────────────────────────── */
function updateTierBadge() {
  var b  = document.getElementById('tier-badge');
  var pb = document.querySelector('.btn.pro-btn');
  var count = getRefData().refs.length;
  if (isPro) {
    b.className = 'tier-badge pro'; b.textContent = '⚡ PRO · TOP 50 COINS';
    if (pb) { pb.textContent = '⚡ PRO ACTIVE'; pb.style.opacity = '.6'; }
  } else {
    b.className = 'tier-badge free'; b.textContent = 'FREE · TOP 50';
    if (pb) { pb.textContent = count > 0 ? '⚡ UNLOCK PRO (' + count + '/3)' : '⚡ UNLOCK PRO'; pb.style.opacity = ''; }
  }
}

/* ── Pro modal ───────────────────────────────────────────────── */
function openPro() {
  var body  = document.getElementById('pro-modal-body');
  var d     = checkMyReferrals();
  var count = d.refs.length, needed = 3, link = getMyReferralLink();
  var pct   = Math.round(count / needed * 100);

  if (isPro) {
    body.innerHTML = '<div class="already-pro">'
      + '<div class="already-pro-icon">⚡</div>'
      + '<div class="already-pro-txt">PRO ACTIVE — TOP 50 UNLOCKED</div>'
      + '<div class="already-pro-sub">' + count + ' friend' + (count !== 1 ? 's' : '') + ' joined via your link. You\'re helping keep Rotator free for everyone — thank you!</div>'
      + '<div style="margin-top:14px;background:var(--bg3);border:1px solid var(--bdr2);border-radius:4px;padding:12px 14px;">'
        + '<div style="font-size:10px;color:var(--muted);letter-spacing:.12em;margin-bottom:8px;">COMING TO PRO FIRST:</div>'
        + '<div style="font-size:11px;color:var(--text);line-height:2;">◈ <strong style="color:var(--bnb)">Forex pairs</strong> rotation tracker<br>◈ <strong style="color:var(--pro)">Stock portfolio</strong> performance screener<br>◈ Multi-asset dashboard — all your assets in one place</div>'
      + '</div>'
      + '<button class="revoke-btn" onclick="revokePro()">Revoke pro access</button>'
      + '</div>';
  } else {
    body.innerHTML = '<div class="modal-title">⚡ Unlock Pro — Free</div>'
      + '<div class="modal-sub">Share Rotator with <strong style="color:var(--pro)">3 friends</strong> and Pro unlocks automatically — no payment, no subscription, ever.</div>'
      + '<div style="background:var(--bg3);border:1px solid rgba(167,139,250,.2);border-radius:4px;padding:12px 14px;margin-bottom:14px;">'
        + '<div style="font-size:10px;color:var(--muted);letter-spacing:.12em;margin-bottom:10px;text-transform:uppercase;">What Pro Unlocks</div>'
        + '<div style="font-size:12px;color:var(--text);line-height:2.2;">'
          + '<span style="color:var(--green);">✓</span> <strong>10 crypto holdings</strong> <span style="color:var(--muted);font-size:10px;">vs 2 on Free</span><br>'
          + '<span style="color:var(--green);">✓</span> <strong>5 forex pairs</strong> <span style="color:var(--muted);font-size:10px;">vs 1 on Free</span><br>'
          + '<span style="color:var(--green);">✓</span> <strong>5 stock holdings</strong> <span style="color:var(--muted);font-size:10px;">vs 1 on Free</span><br>'
          + '<span style="color:var(--pro);">✓</span> <strong style="color:var(--pro)">Sparkle animations</strong> on top-performing tiles<br>'
          + '<span style="color:var(--bnb);">◈</span> <strong style="color:var(--bnb)">Advanced scoring</strong> breakdowns <span style="color:var(--muted);font-size:10px;">— coming soon</span><br>'
          + '<span style="color:var(--bnb);">◈</span> <strong style="color:var(--bnb)">Alert system</strong> — notify on rotation signals <span style="color:var(--muted);font-size:10px;">— coming soon</span>'
        + '</div>'
      + '</div>'
      + '<div style="background:var(--gd);border:1px solid rgba(0,200,150,.2);border-radius:4px;padding:10px 14px;margin-bottom:14px;font-size:11px;line-height:1.8;">'
        + '<span style="color:var(--green);font-weight:600;">✓ Already free for everyone:</span><br>'
        + '<span style="color:var(--muted);">Top 50 coins · Forex pairs · Stock screener · 3-layer scoring · Rotation signals</span>'
      + '</div>'
      + '<div class="pro-steps" id="ref-steps">'
        + '<div class="pro-step"><div class="step-num">1</div><div class="step-txt">Copy your referral link below</div></div>'
        + '<div class="pro-step"><div class="step-num">2</div><div class="step-txt">Share it with <strong>3 friends</strong> — Discord, Twitter, WhatsApp, anywhere</div></div>'
        + '<div class="pro-step"><div class="step-num">3</div><div class="step-txt">When they add their first holding, Pro unlocks <em>automatically</em></div></div>'
      + '</div>'
      + '<div style="display:flex;gap:6px;margin-bottom:10px;">'
        + '<input class="code-input" id="ref-link-display" value="' + link + '" readonly onclick="this.select()" style="font-size:10px;">'
        + '<button class="code-btn" id="copy-ref-btn" onclick="copyRefLink()">COPY</button>'
      + '</div>'
      + '<div class="pro-divider"></div>'
      + '<div class="pro-steps">'
        + '<div class="pro-step"><div class="step-num" style="background:var(--gd);border-color:rgba(0,200,150,.3);color:var(--green);">$</div><div class="step-txt">Or <a href="#" onclick="closeModal(\'pro-modal\');openModal(\'donate-modal\');return false;" style="color:var(--bnb);">make a donation</a> and enter your code below to unlock instantly</div></div>'
      + '</div>'
      + '<div class="code-row">'
        + '<input class="code-input" id="pro-code-input" placeholder="Enter donation code">'
        + '<button class="code-btn" onclick="checkProCode()">UNLOCK</button>'
      + '</div>'
      + '<div class="code-err" id="pro-code-err"></div>'
      + '<div class="pro-divider"></div>'
      + '<div style="font-size:10px;color:var(--muted);line-height:1.8;text-align:center;">'
        + 'Progress: <strong style="color:var(--pro);">' + count + ' / ' + needed + ' friends</strong> joined'
        + (count > 0 ? '<div style="width:100%;height:3px;background:var(--bg4);border-radius:2px;margin-top:5px;"><div style="width:' + pct + '%;height:100%;background:var(--pro);border-radius:2px;transition:width .4s;"></div></div>' : '')
      + '</div>';
  }

  openModal('pro-modal');
  setTimeout(function() {
    var c = document.getElementById('pro-sparkle-c');
    if (c) startSparkle(c);
  }, 100);
}

/* ── Pro code redemption ─────────────────────────────────────── */
function checkProCode() {
  var inp = document.getElementById('pro-code-input');
  var err = document.getElementById('pro-code-err');
  if (!inp || !err) return;
  var code = (inp.value || '').trim().toUpperCase();
  if (!code) { err.textContent = 'Please enter a code.'; return; }

  var valid = VALID_CODES.indexOf(code) >= 0;
  if (!valid) {
    err.textContent = '❌ Invalid code. Check for typos or contact us.';
    inp.style.borderColor = 'var(--red)';
    return;
  }

  var usedKey = 'rot_used_code_' + code;
  try {
    if (localStorage.getItem(usedKey) === '1') {
      err.textContent = '⚠ This code has already been used on this device.';
      inp.style.borderColor = 'var(--amber)';
      return;
    }
  } catch(e) {}

  try { localStorage.setItem(usedKey, '1'); } catch(e) {}
  isPro = true; savePro(true);
  updateTierBadge();
  incrementDonationCount();
  closeModal('pro-modal');

  var t = document.createElement('div');
  t.style.cssText = 'position:fixed;top:56px;left:50%;transform:translateX(-50%);background:var(--bg2);border:1px solid var(--pro);border-radius:6px;padding:14px 22px;font-family:IBM Plex Mono,monospace;font-size:12px;color:var(--pro);z-index:900;text-align:center;box-shadow:0 0 30px rgba(167,139,250,.2);letter-spacing:.06em;';
  t.innerHTML = '⚡ PRO UNLOCKED — Welcome!<br><span style="font-size:10px;color:var(--muted);margin-top:4px;display:block;">Thank you for supporting Rotator ♥</span>';
  document.body.appendChild(t);
  setTimeout(function() { t.style.transition = 'opacity .5s'; t.style.opacity = '0'; setTimeout(function() { t.remove(); }, 500); }, 3500);
  renderAll();
}

function copyRefLink() {
  var link = getMyReferralLink(), btn = document.getElementById('copy-ref-btn');
  var done = function() { btn.textContent = '✓ COPIED!'; btn.classList.add('ok'); setTimeout(function() { btn.textContent = 'COPY REFERRAL LINK'; btn.classList.remove('ok'); }, 2500); };
  if (navigator.clipboard) { navigator.clipboard.writeText(link).then(done).catch(done); }
  else { var t = document.createElement('textarea'); t.value = link; document.body.appendChild(t); t.select(); document.execCommand('copy'); document.body.removeChild(t); done(); }
}

function revokePro() {
  isPro = false; savePro(false);
  closeModal('pro-modal');
  updateTierBadge();
  doRefresh();
}

/* ── Donation goal tracker ───────────────────────────────────── */
function getDonationPct() { return Math.min(100, Math.round((DONATION_CURRENT / DONATION_GOAL) * 100)); }

function incrementDonationCount() {
  try { var n = parseInt(localStorage.getItem('rot_donation_est') || '0') + 1; localStorage.setItem('rot_donation_est', String(n)); } catch(e) {}
}

function getVisitStats() {
  try {
    var today = new Date().toISOString().slice(0, 10);
    var data  = JSON.parse(localStorage.getItem('rot_visits') || '{"total":0,"lastDay":"","dailyStreak":0}');
    if (data.lastDay !== today) {
      data.total = (data.total || 0) + 1;
      data.dailyStreak = (data.lastDay === getPrevDay(today)) ? (data.dailyStreak || 0) + 1 : 1;
      data.lastDay = today;
      localStorage.setItem('rot_visits', JSON.stringify(data));
    }
    return data;
  } catch(e) { return {total:1, dailyStreak:1}; }
}
function getPrevDay(dateStr) { var d = new Date(dateStr); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); }

function renderDonationBar(containerId) {
  var el = document.getElementById(containerId);
  if (!el) return;
  var pct = getDonationPct();
  var barColor = pct >= 100 ? 'var(--green)' : pct >= 60 ? 'var(--amber)' : 'var(--bnb)';
  el.innerHTML =
    '<div style="margin-bottom:6px;display:flex;align-items:center;justify-content:space-between;">'
    + '<span style="font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);">Monthly Goal</span>'
    + '<span style="font-size:10px;font-weight:700;color:' + barColor + ';">$' + DONATION_CURRENT + ' / $' + DONATION_GOAL + '</span>'
    + '</div>'
    + '<div style="height:4px;background:var(--bg4);border-radius:2px;overflow:hidden;margin-bottom:5px;">'
    + '<div style="width:' + pct + '%;height:100%;background:' + barColor + ';border-radius:2px;transition:width .6s ease;"></div>'
    + '</div>'
    + '<div style="font-size:9px;color:var(--muted);">'
    + (pct >= 100 ? '<span style="color:var(--green);">✓ Goal reached this month!</span>'
                  : '<span style="color:' + barColor + ';">' + pct + '%</span> of ' + DONATION_LABEL)
    + '</div>';
}

/* Clipboard helper used for donation address copy */
function copyAddr(addr, btnId) {
  var btn  = document.getElementById(btnId);
  var copy = function() { btn.textContent = '✓ COPIED!'; btn.classList.add('ok'); setTimeout(function() { btn.textContent = 'COPY ADDRESS'; btn.classList.remove('ok'); }, 2500); };
  if (navigator.clipboard) { navigator.clipboard.writeText(addr).then(copy).catch(copy); }
  else { var t = document.createElement('textarea'); t.value = addr; document.body.appendChild(t); t.select(); document.execCommand('copy'); document.body.removeChild(t); copy(); }
}

/* Init on page load */
(function() { try { getVisitStats(); } catch(e) {} })();

/* ══════════════════════════════════════════════════════════════════
   signals.js  —  Investment opportunities, rotation/momentum signals,
                  leaderboard table & scoring engine
   
   HOW TO EDIT THIS FILE:
   ──────────────────────
   • CHANGE HOW MANY TILES SHOW:  Edit the .slice(0, 6) calls in
     renderTopBars() — change 6 to any number you want.
   
   • CHANGE ROTATION THRESHOLD:   In renderTopBars(), find:
       c.score >= 62   (sells — coins to rotate out of)
       c.score <= 38   (buys  — coins to rotate into)
     Adjust these numbers to make signals more or less strict.
   
   • CHANGE HIGH MOMENTUM THRESHOLD: Find c.score >= 60 in
     renderTopBars() and change the number.
   
   • CHANGE SCORING WEIGHTS:  Edit computeScores() below.
     L1 = momentum rank (base),  L2 = macro adjustment,
     L3 = tokenomics bonus/penalty.
══════════════════════════════════════════════════════════════════ */

/* ── Shared state ─────────────────────────────────────────────── */
var coins   = [];
var btcMA200 = null;
var btcPrice = null;
var sortTF   = 7;   /* default sort column: 7-day */

/* ── Score engine ────────────────────────────────────────────── */
function computeScores() {
  var n = coins.length;
  if (!n) return;

  /* L1 — rank-based score for each timeframe */
  function rankField(field) {
    var sorted = coins.slice().sort(function(a, b) { return b[field] - a[field]; });
    sorted.forEach(function(c, i) { c['r_' + field] = Math.round(((n - i - 1) / (n - 1)) * 100); });
  }
  rankField('p7'); rankField('p14'); rankField('p30');

  coins.forEach(function(c) {
    /* L1 composite: 40% 7D + 35% 14D + 25% 30D */
    var l1 = Math.round(c.r_p7 * 0.40 + c.r_p14 * 0.35 + c.r_p30 * 0.25);

    /* L2 — macro adjustment: compare coin vs BTC, Gold, Silver, Oil */
    var l2adj = 0;
    var macro = _macroData || {};
    if (macro.btcP7 !== null && macro.btcP7 !== undefined) {
      var vsBtc = c.p7 - (macro.btcP7 || 0);
      l2adj += vsBtc > 5 ? 4 : vsBtc < -5 ? -4 : 0;
    }
    if (macro.goldP7 !== null && macro.goldP7 !== undefined) {
      var vsGold = c.p7 - (macro.goldP7 || 0);
      l2adj += vsGold > 3 ? 2 : vsGold < -3 ? -2 : 0;
    }

    /* L3 — tokenomics quality bonus/penalty */
    var tok = TOKENOMICS_DB[c.id] || {};
    var l3adj = 0;
    if (tok.deflation === 'full')    l3adj += 3;
    if (tok.deflation === 'partial') l3adj += 1;
    if (tok.deflation === 'fixed')   l3adj += 2;
    if (tok.unlockRisk === 'high')   l3adj -= 4;
    if (tok.unlockRisk === 'medium') l3adj -= 1;

    c.score = Math.min(100, Math.max(0, l1 + l2adj + l3adj));
  });
}

/* ── Macro data store ────────────────────────────────────────── */
var _macroData = {btcP7: null, goldP7: null, silverP7: null, oilP7: null};

async function loadMacroData() {
  /* Gold 7D via frankfurter (XAU not supported — use ETF proxy via AV if available) */
  try {
    var start = dateOffset(-14);
    var url   = 'https://api.frankfurter.app/' + start + '..?from=USD&to=EUR,GBP'; /* just to check API is alive */
    await apiFetch(url); /* fire & forget — we only need the BTCvsGold signal */
  } catch(e) {}
  /* BTC 7D change used later after loadBTC() fills btcPrice */
}

/* ── Format helpers ──────────────────────────────────────────── */
function fmtP(p) {
  if (p === null || p === undefined) return '—';
  if (p >= 1000) return '$' + p.toLocaleString('en-US', {maximumFractionDigits: 0});
  if (p >= 1)    return '$' + p.toFixed(2);
  if (p >= 0.01) return '$' + p.toFixed(4);
  return '$' + p.toFixed(6);
}
function pctSpan(v) {
  var c = v >= 0 ? 'pc up' : 'pc dn';
  return '<span class="' + c + '">' + (v >= 0 ? '+' : '') + v.toFixed(2) + '%</span>';
}
function dateOffset(days) {
  var d = new Date(); d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/* ── BTC trend pill ──────────────────────────────────────────── */
var _bearDismissed = false;
try { _bearDismissed = localStorage.getItem('rot_bear_dismissed') === '1'; } catch(e) {}

function renderBTC() {
  var pill    = document.getElementById('btc-pill');
  var pillTxt = document.getElementById('btc-pill-txt');
  var mobInner = document.getElementById('mob-btc-inner');
  var mobTxt   = document.getElementById('mob-btc-txt');
  if (!btcMA200 || !btcPrice) return;
  if (btcPrice > btcMA200) {
    if (pill)    pill.className = 'btc-pill bull';
    if (pillTxt) pillTxt.textContent = 'BTC UPTREND ▲';
    if (mobInner) mobInner.className = 'mob-btc-cell bull';
    if (mobTxt)   mobTxt.textContent = '▲ BTC';
    document.getElementById('bear-banner').classList.remove('show');
    _bearDismissed = false;
    try { localStorage.removeItem('rot_bear_dismissed'); } catch(e) {}
  } else {
    if (pill)    pill.className = 'btc-pill bear';
    if (pillTxt) pillTxt.textContent = 'BTC DOWNTREND ▼';
    if (mobInner) mobInner.className = 'mob-btc-cell';
    if (mobTxt)   mobTxt.textContent = '▼ BTC';
    if (!_bearDismissed) document.getElementById('bear-banner').classList.add('show');
  }
}

/* ══════════════════════════════════════════════════════════════
   INVESTMENT OPPORTUNITIES (top signal bar)
   Three columns: Rotation Opps | High Momentum | Worst 30D
══════════════════════════════════════════════════════════════ */

/* Single signal tile (momentum / worst) */
function sigTile(c, kind) {
  var badges = {rot:'ROT', mom:'MOM', wrst:'WORST'};
  var p24c = c.p24 >= 0 ? 'up' : 'dn';
  var p7c  = c.p7  >= 0 ? 'up' : 'dn';
  var p30c = c.p30 >= 0 ? 'up' : 'dn';
  var scC  = c.score >= 65 ? 'up' : c.score <= 35 ? 'dn' : 'am';
  return '<div class="sig-tile ' + kind + '" onclick="openTileDetail(\'' + c.id + '\',event)" title="Click for details">'
    + '<div class="sig-tile-top">'
      + '<div class="sig-tile-ico"><img src="' + c.image + '" alt="" onerror="this.style.display=\'none\'"></div>'
      + '<span class="sig-tile-sym">' + c.sym + '</span>'
      + '<span class="sig-tile-badge ' + kind + '">' + badges[kind] + '</span>'
    + '</div>'
    + '<div class="sig-tile-stats">'
      + '<div class="sig-stat"><span class="sig-stat-l">24H</span><span class="sig-stat-v ' + p24c + '">' + (c.p24>=0?'+':'') + c.p24.toFixed(1) + '%</span></div>'
      + '<div class="sig-stat"><span class="sig-stat-l">7D</span><span class="sig-stat-v '  + p7c  + '">' + (c.p7>=0?'+':'')  + c.p7.toFixed(1)  + '%</span></div>'
      + '<div class="sig-stat"><span class="sig-stat-l">30D</span><span class="sig-stat-v ' + p30c + '">' + (c.p30>=0?'+':'') + c.p30.toFixed(1) + '%</span></div>'
      + '<div class="sig-stat"><span class="sig-stat-l">SCR</span><span class="sig-stat-v '  + scC  + '">' + c.score + '</span></div>'
    + '</div>'
    + '</div>';
}

/* Rotation opportunity tile (sell→buy pair) */
function sigRotTile(sell, buy) {
  var delta = sell.score - buy.score;
  return '<div class="sig-tile rot" onclick="openTileDetail(\'' + buy.id + '\',event)" title="Click for buy-side details">'
    + '<div class="sig-tile-top">'
      + '<div class="sig-tile-ico"><img src="' + sell.image + '" alt="" onerror="this.style.display=\'none\'"></div>'
      + '<span class="sig-tile-sym" style="color:var(--red);">'   + sell.sym + '</span>'
      + '<span style="color:var(--muted);font-size:10px;">→</span>'
      + '<div class="sig-tile-ico"><img src="' + buy.image  + '" alt="" onerror="this.style.display=\'none\'"></div>'
      + '<span class="sig-tile-sym" style="color:var(--green);">' + buy.sym  + '</span>'
      + '<span class="sig-tile-badge rot">Δ' + delta + '</span>'
    + '</div>'
    + '<div class="sig-tile-stats">'
      + '<div class="sig-stat"><span class="sig-stat-l">SELL 7D</span><span class="sig-stat-v ' + (sell.p7>=0?'up':'dn')  + '">' + (sell.p7>=0?'+':'')  + sell.p7.toFixed(1)  + '%</span></div>'
      + '<div class="sig-stat"><span class="sig-stat-l">BUY 30D</span><span class="sig-stat-v ' + (buy.p30>=0?'up':'dn') + '">' + (buy.p30>=0?'+':'')  + buy.p30.toFixed(1)  + '%</span></div>'
      + '<div class="sig-stat"><span class="sig-stat-l">SCR DELTA</span><span class="sig-stat-v am">' + sell.score + '→' + buy.score + '</span></div>'
    + '</div>'
    + '</div>';
}

/* Render all three signal columns */
function renderTopBars() {
  var hSyms = holdings.map(function(h) { return h.sym; });

  /* ── Column 3: Worst 30D performers — 6 tiles ── */
  var worst = coins.slice().sort(function(a, b) { return a.p30 - b.p30; }).slice(0, 6);
  document.getElementById('worst-cards').innerHTML =
    '<div class="sig-tiles-grid">' + worst.map(function(c) { return sigTile(c, 'wrst'); }).join('') + '</div>';

  /* ── Column 2: High momentum — top scoring coins, 6 tiles ── */
  var momCoins = coins.slice().filter(function(c) { return c.score >= 60; }).sort(function(a, b) { return b.score - a.score; }).slice(0, 6);
  var momEl    = document.getElementById('mom-cards');
  if (momCoins.length) {
    momEl.innerHTML = '<div class="sig-tiles-grid">' + momCoins.map(function(c) { return sigTile(c, 'mom'); }).join('') + '</div>';
  } else {
    momEl.innerHTML = '<div class="no-sug">No high-momentum coins right now.</div>';
  }

  /* ── Column 1: Rotation opportunities (from held coins to laggards) ── */
  var sugEl = document.getElementById('sug-cards');
  if (!holdings.length) { sugEl.innerHTML = '<div class="no-sug">Add holdings to see rotation signals.</div>'; return; }
  var held  = coins.filter(function(c) { return hSyms.indexOf(c.sym) >= 0; });
  var sells = held.filter(function(c)  { return c.score >= 62; }).sort(function(a, b) { return b.score - a.score; });
  var buys  = coins.filter(function(c) { return hSyms.indexOf(c.sym) < 0 && c.score <= 38; }).sort(function(a, b) { return a.score - b.score; });
  if (!sells.length) { sugEl.innerHTML = '<div class="no-sug">No holdings strongly outperforming yet.</div>'; return; }
  if (!buys.length)  { sugEl.innerHTML = '<div class="no-sug">No clear laggards in the screener right now.</div>'; return; }
  var pairs = [];
  for (var i = 0; i < Math.min(6, sells.length); i++) pairs.push({sell: sells[i], buy: buys[i % buys.length]});
  sugEl.innerHTML = '<div class="sig-tiles-grid">' + pairs.map(function(p) { return sigRotTile(p.sell, p.buy); }).join('') + '</div>';
}

/* ══════════════════════════════════════════════════════════════
   LEADERBOARD TABLE
══════════════════════════════════════════════════════════════ */
function renderTable() {
  var body = document.getElementById('tbody');
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
    var isH    = hSyms.indexOf(c.sym) >= 0;
    var sc     = c.score;
    var scC    = sc >= 65 ? 'var(--green)' : sc < 0 ? 'var(--red)' : sc >= 40 ? 'var(--amber)' : 'var(--muted)';
    var mcapStr = c.mcap ? '$' + (c.mcap/1e9 >= 1 ? (c.mcap/1e9).toFixed(2) + 'B' : (c.mcap/1e6).toFixed(0) + 'M') : '—';
    var tipData = 'data-sym="' + c.sym + '" data-name="' + c.name + '" data-mcap="' + mcapStr + '" data-score="' + sc + '" data-p24="' + c.p24.toFixed(2) + '" data-p7="' + c.p7.toFixed(2) + '" data-p30="' + c.p30.toFixed(2) + '" data-held="' + (isH ? '1' : '0') + '"';
    return '<tr class="' + (isH ? 'held' : '') + '" ' + tipData + ' onmouseenter="showRowTip(this,event)" onmouseleave="hideTip()">'
      + '<td style="color:var(--muted);font-size:10px;">' + (i+1) + '</td>'
      + '<td><div class="cc"><div class="ti"><img src="' + c.image + '" alt="" onerror="this.style.display=\'none\'"></div><div><div style="display:flex;align-items:center;"><span class="tsym">' + c.sym + '</span>' + (isH ? '<span class="htag">HELD</span>' : '') + '</div><div class="tname">' + c.name + '</div></div></div></td>'
      + '<td class="r" style="padding-right:8px;">' + fmtP(c.price) + '</td>'
      + '<td class="pc">' + pctSpan(c.p24) + '</td>'
      + '<td class="pc">' + pctSpan(c.p7)  + '</td>'
      + '<td class="pc">' + pctSpan(c.p14) + '</td>'
      + '<td class="pc">' + pctSpan(c.p30) + '</td>'
      + '<td class="r"><div class="sw"><span class="sv" style="color:' + scC + ';">' + sc + '</span><div class="sb"><div class="sbf" style="width:' + Math.max(2, sc) + '%;background:' + scC + ';"></div></div></div></td>'
      + '</tr>';
  }).join('');

  if (!isPro && proCoins.length) {
    html += '<tr class="pro-upsell-row"><td colspan="8"><div class="pro-upsell-banner">'
      + '<div class="pub-left"><span class="pub-icon">⚡</span><div><div class="pub-txt">+' + proCoins.length + ' more coins available in Pro</div><div class="pub-sub">Share your link with 3 friends to unlock — completely free</div></div></div>'
      + '<button class="pub-btn" onclick="openPro()">UNLOCK PRO →</button>'
      + '</div></td></tr>';
  }
  body.innerHTML = html;
}

function renderCoinSel() {
  var sel   = document.getElementById('coin-sel');
  var hSyms = holdings.map(function(h) { return h.sym; });
  sel.innerHTML = '<option value="">Select…</option>'
    + coins.map(function(c) {
      var held = hSyms.indexOf(c.sym) >= 0;
      return '<option value="' + c.sym + '"' + (held ? ' disabled' : '') + '>'
        + (held ? '✓ ' : '') + c.sym + ' — ' + c.name + '</option>';
    }).join('');
}

/* Sort column click */
function setSort(tf) {
  sortTF = tf;
  ['24','7','14','30','score'].forEach(function(k) {
    var th = document.getElementById('th-' + k);
    if (th) th.classList.toggle('sorted', (tf === 0 && k === 'score') || (tf > 0 && String(tf) === k));
  });
  renderTable();
}

/* Master render — call this after any data change */
function renderAll() {
  renderBTC(); renderTiles(); renderTopBars(); renderTable(); renderCoinSel(); updateTierBadge();
  var now      = new Date();
  var coinsUrl = 'https://api.coingecko.com/api/v3/coins/markets';
  var info     = getCacheInfo(coinsUrl);
  var suffix   = '';
  if (info && info.fresh && info.age > 30000) {
    var ageMins = Math.floor(info.age / 60000);
    var ageSecs = Math.floor((info.age % 60000) / 1000);
    var remMins = Math.floor(info.remaining / 60000);
    suffix = ' · cached ' + (ageMins > 0 ? ageMins + 'm ' : '') + ageSecs + 's ago'
      + (remMins > 0 ? ' · ↻ in ~' + remMins + 'm' : '');
  }
  renderDonationBar('sidebar-goal');
  document.getElementById('ts').textContent = 'UPDATED ' + now.toLocaleTimeString('en-US', {hour:'2-digit', minute:'2-digit', second:'2-digit'}) + suffix;
}

/* ══════════════════════════════════════════════════════════════════
   tutorial.js  —  Step-by-step onboarding tutorial
   
   HOW TO EDIT THIS FILE:
   ──────────────────────
   • ADD/REMOVE STEPS:  Edit the TUT_STEPS array below.
     Each step needs: target (CSS selector), title, desc (HTML), arrow,
     pos, and optionally agree:true for the checkbox step.
   
   • CHANGE STEP CONTENT:  Just edit the title or desc string in
     the relevant step object.
   
   • DISABLE TUTORIAL BY DEFAULT: Change the initTutorial() function
     — find isOn = (val === null || val === 'on') and change to
     isOn = (val === 'on') so new users don't see it automatically.
══════════════════════════════════════════════════════════════════ */

var TUT_KEY    = 'rot_tutorial_on';
var tutStep_   = 0;
var tutActive  = false;

/* ── Tutorial steps ──────────────────────────────────────────── */
var TUT_STEPS = [
  /* Step 1: Welcome */
  {
    target: '.logo',
    title: 'Welcome to ROTATOR',
    desc: '<strong>Rotator</strong> is a daily performance tracker for crypto, forex and stocks. It measures price momentum across 24H, 7D, 14D and 30D and surfaces <strong>rotation opportunities</strong> — moments where shifting value between assets makes strategic sense.<br><br>'
      + '<strong>What is rotation?</strong> If you hold two assets and one has fallen 17% while the other only fell 5%, rotating part of the weaker position into the stronger one recovers value without adding capital. Over time, compounding these adjustments improves portfolio performance.<br><br>'
      + '<strong>90-day data</strong> reveals sustained trends, not just recent noise. A coin up 40% over 90 days but down 3% this week is very different from one that has been falling for 3 months.',
    arrow: 'bottom', pos: 'below', wide: true
  },
  /* Step 2: Holdings panel */
  {
    target: '.add-form',
    title: 'Your Holdings Panel',
    desc: '<div style="font-size:15px;line-height:1.9;">This panel in the bottom-left is your portfolio tracker. Add any coin with quantity and average buy price — data is saved in your browser, no account needed.<br><br>'
      + 'Once you add holdings, the <strong>Portfolio Signal</strong> box at the bottom of this panel scores your overall portfolio and flags which assets are lagging or outperforming.<br><br>'
      + '<span style="font-size:12px;color:rgba(255,255,255,.7);">Free tier: 2 crypto · 1 forex · 1 stock — upgrade to Pro for 10 · 5 · 5 by sharing with 3 friends.</span>',
    arrow: 'left', pos: 'right'
  },
  /* Step 3: Signal center */
  {
    target: '.neon-section',
    title: 'Signal Center',
    desc: '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;font-size:16px;line-height:1.8;">'
      + '<div><div style="font-size:10px;letter-spacing:.12em;color:rgba(255,255,255,.5);margin-bottom:5px;">ROTATION OPPS ↑</div>'
      + '<div style="color:#4ade80;font-size:17px;font-weight:600;margin-bottom:5px;">↑ Rotate</div>'
      + 'Pairs from your holdings where rotating makes sense. The score gap shows how much one coin is outpacing another.</div>'
      + '<div><div style="font-size:10px;letter-spacing:.12em;color:rgba(255,255,255,.5);margin-bottom:5px;">HIGH MOMENTUM ⚡</div>'
      + '<div style="color:#f3ba2f;font-size:17px;font-weight:600;margin-bottom:5px;">⚡ Leading</div>'
      + 'Top 6 coins by composite score across all timeframes. Sustained strength, not single-week spikes.</div>'
      + '<div><div style="font-size:10px;letter-spacing:.12em;color:rgba(255,255,255,.5);margin-bottom:5px;">WORST 30D ↓</div>'
      + '<div style="color:#ff4560;font-size:17px;font-weight:600;margin-bottom:5px;">↓ Lagging</div>'
      + 'Biggest 30-day losers. Potential bounce candidates — or assets to exit. Click any tile for the full breakdown.</div>'
      + '</div>',
    arrow: 'top', pos: 'below', wide: true
  },
  /* Step 4: Leaderboard + disclaimer */
  {
    target: '.leaderboard',
    title: 'Leaderboard — Scores — Disclaimer',
    desc: '<div style="font-size:14px;line-height:1.9;">'
      + 'Every coin ranked across <strong style="color:#ffffff;">24H · 7D · 14D · 30D</strong>. Click any column header to sort. Click any row for a full score breakdown.<br><br>'
      + 'The <strong>Score</strong> combines three layers:<br>'
      + '<strong>L1</strong> Momentum rank vs all 50 coins &nbsp;·&nbsp; <strong>L2</strong> Relative strength vs BTC, Gold, Silver, Oil &nbsp;·&nbsp; <strong>L3</strong> Tokenomics quality<br><br>'
      + '<div style="background:rgba(255,69,96,.07);border:1px solid rgba(255,69,96,.3);border-radius:4px;padding:10px 12px;">'
      + '<strong style="color:#ff4560;">⚠ NOT FINANCIAL ADVICE</strong><br>'
      + 'Rotator tracks historical price data. Scores do not predict future performance. A coin that has fallen for months will not automatically recover. Nothing here constitutes investment advice. Always research before trading. <strong>Never risk money you cannot afford to lose.</strong>'
      + '</div></div>',
    arrow: 'bottom', pos: 'above', wide: true, agree: true,
    agreeText: 'I understand that Rotator is not financial advice and I am solely responsible for my own investment decisions.'
  },
  /* Step 5: All set */
  {
    target: '.settings-btn',
    title: "You're all set.",
    desc: '<div style="font-size:14px;line-height:1.9;">'
      + 'Data refreshes every 15 minutes automatically. Hit <strong>↻ REFRESH</strong> to force a fresh fetch at any time.<br><br>'
      + '<strong style="color:var(--pro);">⚡ Unlock Pro free</strong> by sharing Rotator with 3 friends — or support the project with a donation for an instant unlock code.<br><br>'
      + 'Click the <strong>⚙ gear icon</strong> (highlighted) to change language, toggle asset modes, or replay this tutorial.'
      + '</div>',
    arrow: 'right', pos: 'gear'
  }
];

/* ── Tutorial engine ─────────────────────────────────────────── */
function tutCheckAgree() {
  var chk = document.getElementById('tut-agree-chk');
  document.getElementById('tut-next').disabled = !chk.checked;
}

function tutGetEl(selector) { return document.querySelector(selector); }

function tutPosition() {
  var step = TUT_STEPS[tutStep_];
  var el   = tutGetEl(step.target);
  var hole = document.getElementById('tut-hole');
  var box  = document.getElementById('tut-box');
  if (!el) { tutGoNext(); return; }
  var r = el.getBoundingClientRect();
  var pad = 8;
  hole.style.left   = (r.left - pad) + 'px';
  hole.style.top    = (r.top  - pad) + 'px';
  hole.style.width  = (r.width  + pad*2) + 'px';
  hole.style.height = (r.height + pad*2) + 'px';

  if (step.pos === 'center') {
    var bw = 360, bx = (window.innerWidth - bw) / 2, by = Math.max(50, window.innerHeight * 0.12);
    box.style.left = bx + 'px'; box.style.top = by + 'px'; box.style.width = bw + 'px';
    box.className = 'tut-box'; return;
  }
  if (step.pos === 'gear') {
    var bw = 320, bx = r.left - bw - 12, by = r.bottom + 10;
    bx = Math.max(10, bx); by = Math.max(10, Math.min(by, window.innerHeight - 280));
    box.style.left = bx + 'px'; box.style.top = by + 'px'; box.style.width = bw + 'px';
    box.className = 'tut-box arrow-right'; return;
  }
  box.style.width = '';
  var bw = step.wide ? Math.min(window.innerWidth - 40, Math.max(600, r.width)) : 320;
  var bh = 240, margin = 14, bx, by;
  if      (step.pos === 'below')      { bx = r.left; by = r.bottom + pad + margin; }
  else if (step.pos === 'above')      { bx = r.left; by = r.top - pad - margin - bh; }
  else if (step.pos === 'above-left') { bx = r.left; by = r.top - pad - margin - bh - 60; }
  else if (step.pos === 'right')      { bx = r.right + pad + margin; by = r.top; }
  else if (step.pos === 'right-high') { bx = r.right + pad + margin; by = Math.max(60, r.top - 120); }
  else                                { bx = r.left - bw - pad - margin; by = r.top; }
  bx = Math.max(10, Math.min(bx, window.innerWidth  - bw - 10));
  by = Math.max(10, Math.min(by, window.innerHeight - bh - 10));
  box.style.left  = bx + 'px'; box.style.top = by + 'px'; box.style.width = bw + 'px';
  box.className = 'tut-box arrow-' + step.arrow;
}

function tutRender() {
  var step = TUT_STEPS[tutStep_];
  document.getElementById('tut-step-label').textContent = 'STEP ' + (tutStep_+1) + ' OF ' + TUT_STEPS.length;
  document.getElementById('tut-title').textContent = step.title;
  document.getElementById('tut-desc').innerHTML    = step.desc;
  var showDisclaimer = !!step.disclaimer;
  document.getElementById('tut-disclaimer').style.display = showDisclaimer ? 'block' : 'none';
  var showAgree  = showDisclaimer || !!step.agree;
  var agreeEl    = document.getElementById('tut-agree');
  var agreeLbl   = document.getElementById('tut-agree-lbl');
  agreeEl.style.display = showAgree ? 'flex' : 'none';
  if (showAgree) {
    document.getElementById('tut-agree-chk').checked = false;
    document.getElementById('tut-next').disabled = true;
    if (agreeLbl) agreeLbl.textContent = step.agreeText || 'I understand that Rotator is not financial advice and I am solely responsible for my own investment decisions.';
  } else {
    document.getElementById('tut-next').disabled = false;
  }
  var dots = '';
  for (var i = 0; i < TUT_STEPS.length; i++) dots += '<div class="tut-dot' + (i === tutStep_ ? ' active' : '') + '"></div>';
  document.getElementById('tut-dots').innerHTML = dots;
  document.getElementById('tut-prev').style.display = tutStep_ === 0 ? 'none' : '';
  var nextBtn = document.getElementById('tut-next');
  if (tutStep_ === TUT_STEPS.length - 1) nextBtn.textContent = 'Finish ✓';
  else if (showAgree)                    nextBtn.textContent = 'I Agree →';
  else                                   nextBtn.textContent = 'Next →';
  tutPosition();
}

function tutGoNext() { tutStep_++; if (tutStep_ >= TUT_STEPS.length) { endTutorial(); return; } tutRender(); }
function tutStep(dir) {
  tutStep_ += dir;
  if (tutStep_ < 0) tutStep_ = 0;
  if (tutStep_ >= TUT_STEPS.length) { endTutorial(); return; }
  tutRender();
}

function startTutorial() {
  tutStep_ = 0; tutActive = true;
  document.getElementById('tut-hole').style.display     = 'block';
  document.getElementById('tut-box').style.display      = 'block';
  document.getElementById('tut-backdrop').classList.add('active');
  tutRender();
}

function endTutorial() {
  tutActive = false;
  document.getElementById('tut-hole').style.display     = 'none';
  document.getElementById('tut-box').style.display      = 'none';
  document.getElementById('tut-backdrop').classList.remove('active');
  try { localStorage.setItem(TUT_KEY, 'off'); } catch(e) {}
  document.getElementById('tut-toggle').checked = false;
}

function toggleTutSetting(on) {
  try { localStorage.setItem(TUT_KEY, on ? 'on' : 'off'); } catch(e) {}
  if (on) startTutorial(); else endTutorial();
}

function initTutorial() {
  var val; try { val = localStorage.getItem(TUT_KEY); } catch(e) {}
  /* Default: ON for new users (no key stored yet) */
  var isOn = (val === null || val === 'on');
  document.getElementById('tut-toggle').checked = isOn;
  if (isOn) setTimeout(startTutorial, 800);
}

window.addEventListener('resize', function() { if (tutActive) tutPosition(); });

/* ══════════════════════════════════════════════════════════════════
   api-pool.js  —  All network fetching, caching & key rotation
   
   HOW TO EDIT THIS FILE:
   ──────────────────────
   • ADD MORE ALPHA VANTAGE KEYS:  Find AV_KEYS and add to the array
       AV_KEYS = ['KEY1', 'KEY2', 'KEY3']
     Keys rotate automatically when one hits a 429 rate-limit.
   
   • CHANGE CACHE TIMES:  Find CACHE_RULES below. Each entry has a
     `ttl` in milliseconds. Examples:
       5  minutes = 5*60*1000
       15 minutes = 15*60*1000
       1  hour    = 60*60*1000

   • ADD A NEW PROXY:  Add a function to the `ps` array inside apiFetch.
     The system tries each proxy in order and stops at the first success.
══════════════════════════════════════════════════════════════════ */

/* ── Alpha Vantage API Key Pool ─────────────────────────────────────
   Add more keys here — they rotate automatically on 429 errors.
   Get free keys at: https://www.alphavantage.co/support/#api-key
────────────────────────────────────────────────────────────────── */
var AV_KEYS = ['R9V24J5V7LCQYZMF'];
/* To add more keys:  var AV_KEYS = ['KEY1', 'KEY2', 'KEY3']; */

var _avKeyIdx = 0;
function getAVKey()    { return AV_KEYS[_avKeyIdx % AV_KEYS.length]; }
function rotateAVKey() { _avKeyIdx = (_avKeyIdx + 1) % AV_KEYS.length; return getAVKey(); }
var AV_KEY = getAVKey(); /* kept for backwards compat — always use getAVKey() in new code */

/* ── Cache TTL Rules ─────────────────────────────────────────────────
   Rules are checked top-to-bottom; first match wins.
   Increase a ttl to cache longer, decrease to fetch fresher data.
────────────────────────────────────────────────────────────────── */
var CACHE_RULES = [
  { match: /coins\/bitcoin\/market_chart\?.*days=200/, ttl: 60*60*1000, label: 'BTC-MA200'   }, // 1 hour
  { match: /market_chart\?.*days=30/,                  ttl: 30*60*1000, label: 'CHART-30D'   }, // 30 min
  { match: /coins\/markets/,                           ttl: 15*60*1000, label: 'COINS-MKT'   }, // 15 min
  { match: /finance\.yahoo\.com/,                      ttl: 30*60*1000, label: 'STOCKS'       }, // 30 min
  { match: /alphavantage\.co/,                         ttl: 15*60*1000, label: 'FOREX-AV'    }, // 15 min
  { match: /frankfurter\.app/,                         ttl: 15*60*1000, label: 'FOREX-FK'    }, // 15 min
  { match: /./,                                        ttl:  5*60*1000, label: 'DEFAULT'      }  // 5 min
];

/* ── Internal cache stores ─────────────────────────────────────── */
var _memCache = {};  /* url → { data, time }  — fast, in-memory     */
var _pending  = {};  /* url → Promise          — dedup in-flight     */

function _getTTL(url) {
  for (var i = 0; i < CACHE_RULES.length; i++) {
    if (CACHE_RULES[i].match.test(url)) return CACHE_RULES[i].ttl;
  }
  return 5*60*1000;
}

function _cacheGet(url) {
  var now = Date.now(), ttl = _getTTL(url);
  /* 1. Memory (fastest) */
  if (_memCache[url] && now - _memCache[url].time < ttl) return _memCache[url].data;
  /* 2. localStorage (survives page reload) */
  try {
    var raw = localStorage.getItem('rc:' + url);
    if (raw) {
      var stored = JSON.parse(raw);
      if (stored && now - stored.time < ttl) {
        _memCache[url] = stored; // promote to memory
        return stored.data;
      }
    }
  } catch(e) {}
  return null;
}

function _cacheSet(url, data) {
  var entry = { data: data, time: Date.now() };
  _memCache[url] = entry;
  try {
    localStorage.setItem('rc:' + url, JSON.stringify(entry));
  } catch(e) {
    /* localStorage full — prune 10 oldest entries and retry */
    try {
      var keys = Object.keys(localStorage).filter(function(k){ return k.indexOf('rc:') === 0; });
      keys.sort(function(a, b) {
        try { return (JSON.parse(localStorage.getItem(a))||{time:0}).time - (JSON.parse(localStorage.getItem(b))||{time:0}).time; } catch(e) { return 0; }
      });
      for (var i = 0; i < Math.min(10, keys.length); i++) localStorage.removeItem(keys[i]);
      localStorage.setItem('rc:' + url, JSON.stringify(entry));
    } catch(e2) {}
  }
}

/* Unwrap proxy response wrappers (allorigins etc.) */
function unwrap(r) {
  if (!r) return r;
  if (typeof r.contents === 'string') { try { return JSON.parse(r.contents); } catch(e){} }
  if (typeof r.data === 'string')     { try { return JSON.parse(r.data);     } catch(e){} }
  if (r.data !== undefined && typeof r.data === 'object') return r.data;
  return r;
}

/* Purge expired localStorage entries (called once at startup) */
function purgeStaleCacheEntries() {
  try {
    var now = Date.now();
    Object.keys(localStorage).filter(function(k){ return k.indexOf('rc:') === 0; }).forEach(function(k) {
      try {
        var url    = k.slice(3);
        var ttl    = _getTTL(url);
        var stored = JSON.parse(localStorage.getItem(k));
        if (!stored || now - stored.time > ttl * 4) localStorage.removeItem(k); // purge if 4× expired
      } catch(e) { localStorage.removeItem(k); }
    });
  } catch(e) {}
}
try { purgeStaleCacheEntries(); } catch(e) {}

/* ── Cache info helper ───────────────────────────────────────────── */
function getCacheInfo(url) {
  var now = Date.now(), ttl = _getTTL(url);
  var entry = _memCache[url];
  if (!entry) { try { var raw = localStorage.getItem('rc:' + url); if (raw) entry = JSON.parse(raw); } catch(e){} }
  if (!entry) return null;
  var age       = now - entry.time;
  var remaining = Math.max(0, ttl - age);
  return { age: age, remaining: remaining, ttl: ttl, fresh: age < ttl };
}

/* ══════════════════════════════════════════════════════════════════
   apiFetch(url)
   ─────────────
   The main fetch function. Call this for EVERY API request.
   
   Strategy (tried in order, stops at first success):
     1. Direct fetch          — fastest, works for CORS-safe APIs
     2. thingproxy            — more reliable on mobile
     3. corsproxy.io          — good fallback
     4. allorigins.win        — last resort
   
   Returns: parsed JSON data (already unwrapped from proxy format)
   Throws:  Error with all failure messages if all proxies fail
══════════════════════════════════════════════════════════════════ */
async function apiFetch(url) {
  /* Return cached data if still fresh */
  var cached = _cacheGet(url);
  if (cached !== null) return cached;

  /* Deduplicate concurrent requests to the same URL */
  if (_pending[url]) return _pending[url];

  _pending[url] = (async function() {
    /* ── Proxy pool — add more here if needed ── */
    var ps = [
      function(){ return fetch(url, {signal: AbortSignal.timeout(9000)}); },
      function(){ return fetch('https://thingproxy.freeboard.io/fetch/' + url, {signal: AbortSignal.timeout(11000)}); },
      function(){ return fetch('https://corsproxy.io/?' + encodeURIComponent(url), {signal: AbortSignal.timeout(11000)}); },
      function(){ return fetch('https://api.allorigins.win/get?url=' + encodeURIComponent(url), {signal: AbortSignal.timeout(11000)}); }
    ];

    var errs = [];
    for (var i = 0; i < ps.length; i++) {
      try {
        var r = await ps[i]();
        if (!r.ok) throw new Error('HTTP ' + r.status);
        var j = await r.json();
        var u = unwrap(j);
        if (u && u.status && u.status.error_code === 429) throw new Error('rate_limited');
        _cacheSet(url, u);
        delete _pending[url];
        return u;
      } catch(e) { errs.push(e.message || String(e)); }
    }
    delete _pending[url];
    throw new Error(errs.join(' | '));
  })();

  return _pending[url];
}

var sleep = ms => new Promise(r => setTimeout(r, ms));

/* ══════════════════════════════════════════════════════════════════
   config.js  —  All lists, settings & codes you'll want to edit
   
   HOW TO EDIT THIS FILE:
   ──────────────────────
   • ADD/REMOVE COINS:        Edit FREE_COINS list
   • ADD/REMOVE FOREX PAIRS:  Edit FOREX_PAIRS list (set pro:true to lock behind Pro)
   • ADD/REMOVE STOCKS:       Edit STOCKS_LIST
   • ADD PRO CODES:           Add a string to VALID_CODES
   • UPDATE DONATION GOAL:    Change DONATION_GOAL and DONATION_CURRENT
   • UPDATE TOKENOMICS:       Edit TOKENOMICS_DB
══════════════════════════════════════════════════════════════════ */

/* ── Crypto coin lists ───────────────────────────────────────────── */
var FREE_COINS = [
  /* Mega caps */
  'bitcoin','ethereum','binancecoin','solana','ripple',
  /* Large caps */
  'dogecoin','cardano','avalanche-2','shiba-inu','chainlink',
  'polkadot','bitcoin-cash','near','litecoin','uniswap',
  'internet-computer','ethereum-classic','stellar','monero','okb',
  /* Mid caps */
  'hedera-hashgraph','filecoin','cosmos','vechain','tron',
  'sui','aptos','sei-network','render-token','jupiter-exchange-solana',
  /* DeFi */
  'aave','the-graph','curve-dao-token','maker','lido-dao',
  /* L2 & Infrastructure */
  'arbitrum','optimism','stacks','immutable-x','injective-protocol',
  /* Meme & Emerging */
  'blur','bonk','dogwifcoin','book-of-meme','pepe',
  /* RWA & New */
  'ondo-finance','worldcoin-wld','pyth-network','jito-governance-token','ethena'
];

var PRO_EXTRA_COINS = []; /* All 50 in free tier — Pro reserved for future expansion */

function getActiveCoins() { return FREE_COINS; } /* All 50 always available */

/* ── Forex pairs ─────────────────────────────────────────────────── */
/* Set pro:true to lock a pair behind Pro tier                        */
var FOREX_PAIRS = [
  {from:'EUR', to:'USD', name:'Euro / US Dollar',               pro:false},
  {from:'GBP', to:'USD', name:'British Pound / US Dollar',      pro:false},
  {from:'USD', to:'JPY', name:'US Dollar / Japanese Yen',       pro:false},
  {from:'USD', to:'CHF', name:'US Dollar / Swiss Franc',        pro:false},
  {from:'AUD', to:'USD', name:'Australian Dollar / US Dollar',  pro:false},
  {from:'USD', to:'CAD', name:'US Dollar / Canadian Dollar',    pro:false},
  {from:'NZD', to:'USD', name:'New Zealand Dollar / US Dollar', pro:false},
  {from:'EUR', to:'GBP', name:'Euro / British Pound',           pro:false},
  {from:'EUR', to:'JPY', name:'Euro / Japanese Yen',            pro:false},
  {from:'GBP', to:'JPY', name:'British Pound / Japanese Yen',   pro:false},
  {from:'XAU', to:'USD', name:'Gold / US Dollar',               pro:true},
  {from:'XTI', to:'USD', name:'WTI Crude Oil / USD',            pro:true},
  {from:'EUR', to:'CHF', name:'Euro / Swiss Franc',             pro:true},
  {from:'USD', to:'MXN', name:'US Dollar / Mexican Peso',       pro:true},
  {from:'USD', to:'SGD', name:'US Dollar / Singapore Dollar',   pro:true}
];

/* ── Stocks & Indices list ───────────────────────────────────────── */
/* av: Alpha Vantage symbol (null = not available on AV free tier)   */
var STOCKS_LIST = [
  /* Indices */
  {sym:'^GSPC',  name:'S&P 500',         type:'index', av:'SPY'},
  {sym:'^IXIC',  name:'NASDAQ',           type:'index', av:'QQQ'},
  {sym:'^DJI',   name:'Dow Jones',        type:'index', av:'DIA'},
  {sym:'^RUT',   name:'Russell 2000',     type:'index', av:'IWM'},
  {sym:'^FTSE',  name:'FTSE 100',         type:'index', av:null},
  {sym:'^GDAXI', name:'DAX',              type:'index', av:null},
  {sym:'^N225',  name:'Nikkei 225',       type:'index', av:null},
  /* US Large Caps */
  {sym:'AAPL',   name:'Apple',            type:'stock', av:'AAPL'},
  {sym:'MSFT',   name:'Microsoft',        type:'stock', av:'MSFT'},
  {sym:'NVDA',   name:'NVIDIA',           type:'stock', av:'NVDA'},
  {sym:'TSLA',   name:'Tesla',            type:'stock', av:'TSLA'},
  {sym:'AMZN',   name:'Amazon',           type:'stock', av:'AMZN'},
  {sym:'GOOGL',  name:'Alphabet',         type:'stock', av:'GOOGL'},
  {sym:'META',   name:'Meta Platforms',   type:'stock', av:'META'},
  {sym:'JPM',    name:'JPMorgan Chase',   type:'stock', av:'JPM'},
  {sym:'V',      name:'Visa',             type:'stock', av:'V'},
  {sym:'BRK-B',  name:'Berkshire B',      type:'stock', av:'BRK-B'},
  /* High-growth / AI */
  {sym:'AMD',    name:'AMD',              type:'stock', av:'AMD'},
  {sym:'INTC',   name:'Intel',            type:'stock', av:'INTC'},
  {sym:'PLTR',   name:'Palantir',         type:'stock', av:'PLTR'},
  {sym:'COIN',   name:'Coinbase',         type:'stock', av:'COIN'},
  {sym:'MSTR',   name:'MicroStrategy',    type:'stock', av:'MSTR'}
];

/* ── Tokenomics database ─────────────────────────────────────────── */
/* deflation: 'full'=active burn | 'partial'=some burn | 'fixed'=hard cap | 'none'=inflation */
/* unlockRisk: 'low' | 'medium' | 'high' (vesting overhang)                                  */
var TOKENOMICS_DB = {
  'bitcoin':              {deflation:'fixed',   unlockRisk:'low'},
  'ethereum':             {deflation:'partial', unlockRisk:'low'},
  'binancecoin':          {deflation:'full',    unlockRisk:'low'},
  'solana':               {deflation:'none',    unlockRisk:'medium'},
  'ripple':               {deflation:'none',    unlockRisk:'high'},
  'dogecoin':             {deflation:'none',    unlockRisk:'low'},
  'cardano':              {deflation:'none',    unlockRisk:'low'},
  'avalanche-2':          {deflation:'partial', unlockRisk:'medium'},
  'shiba-inu':            {deflation:'partial', unlockRisk:'low'},
  'chainlink':            {deflation:'none',    unlockRisk:'high'},
  'polkadot':             {deflation:'none',    unlockRisk:'medium'},
  'bitcoin-cash':         {deflation:'fixed',   unlockRisk:'low'},
  'near':                 {deflation:'none',    unlockRisk:'medium'},
  'litecoin':             {deflation:'fixed',   unlockRisk:'low'},
  'uniswap':              {deflation:'partial', unlockRisk:'medium'},
  'internet-computer':    {deflation:'none',    unlockRisk:'high'},
  'ethereum-classic':     {deflation:'fixed',   unlockRisk:'low'},
  'stellar':              {deflation:'partial', unlockRisk:'medium'},
  'monero':               {deflation:'none',    unlockRisk:'low'},
  'okb':                  {deflation:'full',    unlockRisk:'low'},
  'hedera-hashgraph':     {deflation:'none',    unlockRisk:'high'},
  'filecoin':             {deflation:'none',    unlockRisk:'high'},
  'cosmos':               {deflation:'none',    unlockRisk:'medium'},
  'vechain':              {deflation:'partial', unlockRisk:'low'},
  'tron':                 {deflation:'partial', unlockRisk:'low'},
  'sui':                  {deflation:'none',    unlockRisk:'high'},
  'aptos':                {deflation:'none',    unlockRisk:'high'},
  'sei-network':          {deflation:'none',    unlockRisk:'high'},
  'render-token':         {deflation:'partial', unlockRisk:'medium'},
  'jupiter-exchange-solana':{deflation:'partial',unlockRisk:'medium'},
  'aave':                 {deflation:'partial', unlockRisk:'low'},
  'the-graph':            {deflation:'none',    unlockRisk:'high'},
  'curve-dao-token':      {deflation:'partial', unlockRisk:'medium'},
  'maker':                {deflation:'full',    unlockRisk:'low'},
  'lido-dao':             {deflation:'none',    unlockRisk:'medium'},
  'arbitrum':             {deflation:'none',    unlockRisk:'high'},
  'optimism':             {deflation:'none',    unlockRisk:'high'},
  'stacks':               {deflation:'fixed',   unlockRisk:'medium'},
  'immutable-x':          {deflation:'none',    unlockRisk:'high'},
  'injective-protocol':   {deflation:'full',    unlockRisk:'low'},
  'blur':                 {deflation:'none',    unlockRisk:'high'},
  'bonk':                 {deflation:'partial', unlockRisk:'low'},
  'dogwifcoin':           {deflation:'none',    unlockRisk:'low'},
  'book-of-meme':         {deflation:'none',    unlockRisk:'low'},
  'pepe':                 {deflation:'none',    unlockRisk:'low'},
  'ondo-finance':         {deflation:'none',    unlockRisk:'high'},
  'worldcoin-wld':        {deflation:'none',    unlockRisk:'high'},
  'pyth-network':         {deflation:'none',    unlockRisk:'high'},
  'jito-governance-token':{deflation:'none',    unlockRisk:'high'},
  'ethena':               {deflation:'partial', unlockRisk:'high'}
};

/* ══════════════════════════════════════════════════════════════════
   PRO DONATION CODES
   ──────────────────
   Each code can only be used ONCE per device.
   To add a new code: add a string to the array below.
   To revoke: remove it (devices that already used it keep Pro
              until they clear their browser storage).
   Format convention: ROT-YEAR-XXXXX
══════════════════════════════════════════════════════════════════ */
var VALID_CODES = [
  'ROT-2026-ALPHA',
  'ROT-2026-BETA1',
  'ROT-2026-BETA2',
  'ROT-2026-PRO01',
  'ROT-2026-PRO02',
  'ROT-2026-PRO03',
  'ROT-2026-PRO04',
  'ROT-2026-PRO05',
  'ROT-2026-DONOR',
  'ROT-2026-EARLY',
  /* ↑ Add more codes here as donations come in */
];

/* ══════════════════════════════════════════════════════════════════
   DONATION GOAL TRACKER
   ─────────────────────
   Update DONATION_CURRENT manually each time a donation comes in.
   DONATION_GOAL = monthly target in USD.
══════════════════════════════════════════════════════════════════ */
var DONATION_GOAL    = 50;   /* $ monthly target  — update as needed */
var DONATION_CURRENT = 0;    /* $ received so far — UPDATE MANUALLY  */
var DONATION_LABEL   = 'monthly server costs';

/* ══════════════════════════════════════════════════════════════════
   data-loaders.js  —  All data fetching, scoring, mode switching
                        & the sparkle animation
   
   HOW TO EDIT THIS FILE:
   ──────────────────────
   • CHANGE SCORING WEIGHTS:
       In computeScores() find the three LAYERS:
       L1 = intra-list rank:  adjust the 0.25 / 0.30 / 0.45 weights
       L2 = macro strength:   adjust the 0.40 / 0.30 / 0.15 / 0.15 weights
       L3 = tokenomics:       adjust supplyPts / deflPts / unlockPts values
   
   • CHANGE AUTO-REFRESH INTERVAL:
       Find startAutoRefresh() and change 15*60*1000 (= 15 minutes)
   
   • ADD A NEW DATA SOURCE FOR STOCKS:
       In loadStocks() add a new fallback block after the Yahoo/FMP/AV blocks.
   
   • ADD A NEW FOREX DATA SOURCE:
       In loadForex() add a new fallback block after the frankfurter/ER-API blocks.
══════════════════════════════════════════════════════════════════ */

/* ── Shared runtime state ─────────────────────────────────────── */
var forexData    = [];
var stocksData   = [];
var forexLoaded  = false;
var stocksLoaded = false;
var currentMode  = 'crypto';
var busy         = false;

/* Which modes are enabled (persisted) */
var _modeEnabled = {crypto:true, forex:true, stocks:true};
(function() {
  try {
    var saved = JSON.parse(localStorage.getItem('rot_modes') || '{}');
    ['crypto','forex','stocks'].forEach(function(m) { if (saved[m] === false) _modeEnabled[m] = false; });
  } catch(e) {}
})();

function saveModePrefs() { try { localStorage.setItem('rot_modes', JSON.stringify(_modeEnabled)); } catch(e) {} }

/* ══════════════════════════════════════════════════════════════
   CRYPTO — loadCoins + BTC MA200
══════════════════════════════════════════════════════════════ */
function prog(p, m) { var el = document.getElementById('lmsg'); if (el) el.textContent = m; }

async function loadCoins() {
  prog(10, 'FETCHING COINS…');
  var ids = getActiveCoins().join(',');
  var url = 'https://api.coingecko.com/api/v3/coins/markets'
    + '?vs_currency=usd&ids=' + ids
    + '&order=market_cap_desc&per_page=50&page=1'
    + '&sparkline=false'
    + '&price_change_percentage=7d,14d,30d'
    + '&include_24hr_vol=true';
  var data = await apiFetch(url);
  if (!Array.isArray(data)) throw new Error('CoinGecko data invalid');
  coins = data.map(function(c) {
    return {
      id: c.id, sym: c.symbol.toUpperCase(), name: c.name,
      price: c.current_price, image: c.image, mcap: c.market_cap, rank: 0,
      p24: c.price_change_percentage_24h || 0,
      p7:  c.price_change_percentage_7d_in_currency  || 0,
      p14: c.price_change_percentage_14d_in_currency || 0,
      p30: c.price_change_percentage_30d_in_currency || 0,
      volume24: c.total_volume || 0,
      circulating_supply: c.circulating_supply || 0,
      max_supply: c.max_supply || null,
      ath: c.ath || 0, ath_change_pct: c.ath_change_percentage || 0,
      score: 0, r7: 0, r14: 0, r30: 0, isPro: false
    };
  });
  coins.sort(function(a, b) { return b.mcap - a.mcap; });
  coins.forEach(function(c, i) { c.rank = i + 1; });
  computeScores();
}

async function loadBTC() {
  var btcUrl  = 'https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=200';
  var isCached = getCacheInfo(btcUrl) && getCacheInfo(btcUrl).fresh;
  prog(65, isCached ? 'LOADING BTC MA (CACHED)…' : 'FETCHING BTC 200D MA…');
  if (!isCached) await sleep(1200); /* rate-limit guard: only needed for real network calls */
  var d = await apiFetch(btcUrl);
  if (!d || !Array.isArray(d.prices)) throw new Error('BTC history invalid');
  var p = d.prices, s = 0;
  for (var i = 0; i < p.length; i++) s += p[i][1];
  btcMA200 = s / p.length;
  btcPrice = p[p.length - 1][1];
}

/* ── Macro data (Gold, Silver, Oil, BTC 7D) ──────────────────── */
async function loadMacroData() {
  try {
    var goldUrl  = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=tether-gold&price_change_percentage=7d&per_page=1';
    var goldData = await apiFetch(goldUrl);
    if (Array.isArray(goldData) && goldData.length)
      _macroData.goldP7 = goldData[0].price_change_percentage_7d_in_currency || 0;

    var silverUrl  = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=silver&price_change_percentage=7d&per_page=1';
    var silverData = await apiFetch(silverUrl);
    if (Array.isArray(silverData) && silverData.length)
      _macroData.silverP7 = silverData[0].price_change_percentage_7d_in_currency || 0;

    var btcCoin = coins.find(function(c) { return c.id === 'bitcoin'; });
    if (btcCoin) _macroData.btcP7 = btcCoin.p7;

    var oilUrl  = 'https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=USO&apikey=' + getAVKey();
    var oilData = await apiFetch(oilUrl);
    var oilQ    = oilData && oilData['Global Quote'];
    if (oilQ) _macroData.oilP7 = parseFloat((oilQ['10. change percent'] || '0%').replace('%', '')) || 0;
  } catch(e) { console.warn('Macro data:', e.message); }
}

/* ── Score engine (3 layers) ─────────────────────────────────── */
function computeScores() {
  var n = Math.max(coins.length - 1, 1);

  /* LAYER 1: Intra-list rank (0–40 pts) */
  ['p7','p14','p30'].forEach(function(k) {
    var sorted = coins.slice().sort(function(a, b) { return b[k] - a[k]; });
    sorted.forEach(function(c, i) { c['r' + k.slice(1)] = i + 1; });
  });

  coins.forEach(function(c) {
    /* Weighted rank (lower rank# = better) */
    var wAvg   = (c.r7 * 0.25 + c.r14 * 0.30 + c.r30 * 0.45);
    var layer1 = Math.round((1 - (wAvg - 1) / n) * 40);

    /* LAYER 2: Macro relative strength vs BTC/Gold/Silver/Oil (0–30 pts) */
    var btcP7  = _macroData.btcP7    != null ? _macroData.btcP7    : (coins.find(function(x){ return x.id==='bitcoin'; }) || {p7:0}).p7;
    var goldP7 = _macroData.goldP7   != null ? _macroData.goldP7   : 2;
    var silvP7 = _macroData.silverP7 != null ? _macroData.silverP7 : 1.5;
    var oilP7  = _macroData.oilP7    != null ? _macroData.oilP7    : 1;
    var delta  = (c.p7 - btcP7)*0.40 + (c.p7 - goldP7)*0.30 + (c.p7 - silvP7)*0.15 + (c.p7 - oilP7)*0.15;
    var layer2 = Math.min(30, Math.max(0, Math.round(15 + Math.min(Math.max(delta * 0.9, -15), 15))));

    /* LAYER 3: Tokenomics quality (−50 to +30 pts) */
    var tkx      = TOKENOMICS_DB[c.id] || {deflation:'none', unlockRisk:'medium'};
    var supplyPts = 0;
    if (c.circulating_supply && c.max_supply && c.max_supply > 0) {
      var ratio = c.circulating_supply / c.max_supply;
      if      (ratio > 0.90) supplyPts =  10;
      else if (ratio > 0.70) supplyPts =   5;
      else if (ratio > 0.40) supplyPts =   0;
      else if (ratio > 0.20) supplyPts = -15;
      else                   supplyPts = -25;
    } else if (!c.max_supply) { supplyPts = -3; }
    var deflPts   = tkx.deflation  === 'full' ? 15 : tkx.deflation  === 'partial' ? 8 : tkx.deflation === 'fixed' ? 5 : 0;
    var unlockPts = tkx.unlockRisk === 'low'  ?  0 : tkx.unlockRisk === 'medium'  ? -5 : -10;
    var layer3    = Math.min(30, Math.max(-50, supplyPts + deflPts + unlockPts));

    c.score = Math.min(100, Math.max(-50, Math.round(layer1 + layer2 + layer3)));
    c.scoreBreakdown = {layer1, layer2, layer3, supplyPts, deflPts, unlockPts};
  });
}

/* ══════════════════════════════════════════════════════════════
   FOREX — loadForex
══════════════════════════════════════════════════════════════ */
function calcRSI(closes, period) {
  if (!closes || closes.length < period + 1) return 50;
  var gains = 0, losses = 0;
  for (var i = closes.length - period; i < closes.length; i++) {
    var d = closes[i] - closes[i-1];
    if (d >= 0) gains += d; else losses -= d;
  }
  var avgG = gains / period, avgL = losses / period;
  if (avgL === 0) return 100;
  return Math.round(100 - (100 / (1 + avgG / avgL)));
}

function calcForexScore(closes) {
  if (!closes || closes.length < 2) return {score:50, rsi:50, signal:'NO DATA', sigC:'var(--muted)', p7:0, p30:0};
  var latest  = closes[closes.length - 1];
  var p7base  = closes.length >= 8  ? closes[closes.length - 8]  : closes[0];
  var p30base = closes.length >= 22 ? closes[closes.length - 22] : closes[0];
  var chg7  = p7base  ? ((latest - p7base)  / p7base  * 100) : 0;
  var chg30 = p30base ? ((latest - p30base) / p30base * 100) : 0;
  var mom7  = Math.round(50 + Math.min(Math.max(chg7  * 12, -48), 48));
  var mom30 = Math.round(50 + Math.min(Math.max(chg30 *  7, -48), 48));
  var rsiVal = calcRSI(closes, Math.min(14, closes.length - 1));
  var score  = Math.min(100, Math.max(0, Math.round(mom7*0.40 + mom30*0.35 + rsiVal*0.25)));
  var signal, sigC;
  if      (rsiVal >= 70 && chg7 > 0) { signal = 'OVERBOUGHT'; sigC = 'var(--red)';   }
  else if (rsiVal <= 30 && chg7 < 0) { signal = 'OVERSOLD';   sigC = 'var(--green)'; }
  else if (score >= 65)               { signal = 'BULLISH';    sigC = 'var(--green)'; }
  else if (score <= 35)               { signal = 'BEARISH';    sigC = 'var(--red)';   }
  else                                { signal = 'NEUTRAL';    sigC = 'var(--muted)'; }
  return {score, rsi:rsiVal, signal, sigC, p7:chg7, p30:chg30};
}

async function loadForex() {
  var loading = document.getElementById('forex-loading');
  loading.style.display = 'block';
  forexData = [];

  var pairsToLoad = isPro ? FOREX_PAIRS : FOREX_PAIRS.filter(function(p) { return !p.pro; });
  var rateHistory = {};

  /* Group standard ISO pairs by base to minimise API calls */
  var bases = {};
  pairsToLoad.forEach(function(p) {
    if (p.from === 'XAU' || p.from === 'XTI') return; /* handled separately */
    if (!bases[p.from]) bases[p.from] = [];
    if (bases[p.from].indexOf(p.to) < 0) bases[p.from].push(p.to);
  });

  var startDate = dateOffset(-60); /* 60 days covers weekends + holidays */

  /* ── Primary source: Frankfurter (ECB data, free, no key) ── */
  var frankfurterFailed = false;
  await Promise.all(Object.keys(bases).map(async function(base) {
    try {
      var url  = 'https://api.frankfurter.app/' + startDate + '..?from=' + base + '&to=' + bases[base].join(',');
      var data = await apiFetch(url);
      if (data && data.rates && Object.keys(data.rates).length > 0) {
        var dates    = Object.keys(data.rates).sort();
        var quoteArr = {};
        dates.forEach(function(d) {
          var dayRates = data.rates[d] || {};
          Object.keys(dayRates).forEach(function(q) {
            if (!quoteArr[q]) quoteArr[q] = [];
            quoteArr[q].push(dayRates[q]);
          });
        });
        rateHistory[base] = quoteArr;
      } else { frankfurterFailed = true; }
    } catch(e) { console.warn('Frankfurter failed for ' + base + ':', e.message); frankfurterFailed = true; }
  }));

  /* ── Fallback: open.er-api.com (free, CORS-friendly, daily rates) ── */
  if (frankfurterFailed || Object.keys(rateHistory).length < Object.keys(bases).length) {
    try {
      var erData = await apiFetch('https://open.er-api.com/v6/latest/USD');
      if (erData && erData.rates) {
        Object.keys(bases).forEach(function(base) {
          if (rateHistory[base] && Object.keys(rateHistory[base]).length > 0) return;
          var baseInUSD = erData.rates[base];
          if (!baseInUSD) return;
          if (!rateHistory[base]) rateHistory[base] = {};
          bases[base].forEach(function(quote) {
            if (rateHistory[base][quote] && rateHistory[base][quote].length > 0) return;
            var quoteInUSD = erData.rates[quote];
            if (!quoteInUSD) return;
            var rate = quoteInUSD / baseInUSD;
            rateHistory[base][quote] = [rate * 0.999, rate]; /* synthetic 2-point history */
          });
        });
      }
    } catch(e) { console.warn('ExchangeRate fallback failed:', e.message); }
  }

  /* ── Build forexData from history ── */
  var results = pairsToLoad.map(function(pair) {
    /* XAU (gold) / XTI (oil) — use macro data already loaded */
    if (pair.from === 'XAU' || pair.from === 'XTI') {
      if (pair.from === 'XAU' && _macroData.goldP7 != null) {
        var gp7   = _macroData.goldP7;
        var score = Math.round(50 + Math.min(Math.max(gp7 * 8, -45), 45));
        var signal = score >= 65 ? 'BULLISH' : score <= 35 ? 'BEARISH' : 'NEUTRAL';
        var sigC   = score >= 65 ? 'var(--green)' : score <= 35 ? 'var(--red)' : 'var(--muted)';
        return {from:pair.from, to:pair.to, name:pair.name, pro:pair.pro, rate:0, chg:0, chgPct:gp7, score, rsi:50, signal, sigC, p7:gp7, p30:0};
      }
      return {from:pair.from, to:pair.to, name:pair.name, pro:pair.pro, rate:0, chg:0, chgPct:0, score:50, rsi:50, signal:'N/A', sigC:'var(--muted)', p7:0, p30:0};
    }

    var hist = rateHistory[pair.from] && rateHistory[pair.from][pair.to];
    if (hist && hist.length >= 2) {
      var latest = hist[hist.length - 1], prev = hist[hist.length - 2];
      var chg    = latest - prev, chgPct = prev ? ((chg / prev) * 100) : 0;
      var scored = calcForexScore(hist);
      return {from:pair.from, to:pair.to, name:pair.name, pro:pair.pro,
        rate:latest, chg, chgPct, score:scored.score, rsi:scored.rsi, signal:scored.signal,
        sigC:scored.sigC, p7:scored.p7, p30:scored.p30};
    }
    return {from:pair.from, to:pair.to, name:pair.name, pro:pair.pro,
      rate:0, chg:0, chgPct:0, score:0, rsi:50, signal:'—', sigC:'var(--muted)', p7:0, p30:0, err:true};
  });

  forexData = results.filter(Boolean);

  /* Append locked Pro pair stubs for free users */
  if (!isPro) {
    FOREX_PAIRS.filter(function(p) { return p.pro; }).forEach(function(p) {
      forexData.push({from:p.from, to:p.to, name:p.name, pro:true, locked:true,
        rate:0, chg:0, chgPct:0, score:0, rsi:50, signal:'PRO', sigC:'var(--pro)'});
    });
  }

  forexLoaded = true;
  loading.style.display = 'none';
  var fxTiles = document.getElementById('forex-tiles');
  if (fxTiles) fxTiles.style.display = '';
  renderForexTable();
  renderFxTiles();
}

/* ══════════════════════════════════════════════════════════════
   STOCKS — loadStocks
══════════════════════════════════════════════════════════════ */
function calcStockScore(price, high52, low52, chgPct) {
  var range = high52 - low52;
  var pos   = range > 0 ? Math.round(((price - low52) / range) * 100) : 50;
  var mom   = 50 + Math.min(Math.max(chgPct * 5, -40), 40);
  return Math.min(100, Math.max(0, Math.round(pos * 0.6 + mom * 0.4)));
}

async function fetchStocksYahoo(syms) {
  var url = 'https://query1.finance.yahoo.com/v7/finance/quote?symbols=' + encodeURIComponent(syms.join(','))
    + '&fields=shortName,regularMarketPrice,regularMarketChange,regularMarketChangePercent,fiftyTwoWeekHigh,fiftyTwoWeekLow';
  var data = await apiFetch(url);
  return (data && data.quoteResponse && data.quoteResponse.result) || [];
}

async function fetchStockAV(avSym) {
  var url  = 'https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=' + avSym + '&apikey=' + getAVKey();
  var data = await apiFetch(url);
  var q    = data && data['Global Quote'];
  if (!q || !q['05. price']) return null;
  var price   = parseFloat(q['05. price']) || 0;
  var chg     = parseFloat(q['09. change']) || 0;
  var chgPct  = parseFloat((q['10. change percent'] || '0').replace('%','')) || 0;
  var high52  = price * 1.35; /* rough fallback — AV GLOBAL_QUOTE doesn't include 52w */
  var low52   = price * 0.65;
  return {price, chg, chgPct, high52, low52};
}

async function loadStocks() {
  var loading = document.getElementById('stocks-loading');
  loading.style.display = 'block';
  stocksData = [];
  var yahooOk = false;

  /* ── Primary: Yahoo Finance (all symbols in one request) ── */
  try {
    var allSyms = STOCKS_LIST.map(function(s) { return s.sym; });
    var quotes  = await fetchStocksYahoo(allSyms);
    if (quotes.length > 0) {
      stocksData = STOCKS_LIST.map(function(s) {
        var q = quotes.find(function(r) { return r.symbol === s.sym; });
        if (!q) return {sym:s.sym, name:s.name, type:s.type, av:s.av, price:0, chg:0, chgPct:0, high52:0, low52:0, score:0, err:true};
        var price  = q.regularMarketPrice || 0;
        var high52 = q.fiftyTwoWeekHigh   || price * 1.3;
        var low52  = q.fiftyTwoWeekLow    || price * 0.7;
        return {sym:s.sym, name:q.shortName||s.name, type:s.type, av:s.av,
          price, chg:q.regularMarketChange||0, chgPct:q.regularMarketChangePercent||0,
          high52, low52, score:calcStockScore(price, high52, low52, q.regularMarketChangePercent||0)};
      });
      yahooOk = true;
    }
  } catch(e) { console.warn('Yahoo stocks failed:', e.message); }

  /* ── Fallback 1: Financial Modeling Prep (free, no key, CORS-friendly) ── */
  if (!yahooOk) {
    loading.textContent = 'LOADING VIA FMP…';
    try {
      var fmpSyms = STOCKS_LIST.map(function(s) { return s.av || s.sym; }).filter(Boolean).join(',');
      var fmpData = await apiFetch('https://financialmodelingprep.com/api/v3/quote/' + encodeURIComponent(fmpSyms) + '?apikey=demo');
      if (Array.isArray(fmpData) && fmpData.length > 0) {
        stocksData = STOCKS_LIST.map(function(s) {
          var q = fmpData.find(function(r) { return r.symbol === (s.av || s.sym); });
          if (!q) return {sym:s.sym, name:s.name, type:s.type, av:s.av, price:0, chg:0, chgPct:0, high52:0, low52:0, score:0, err:true};
          var price  = q.price || 0, high52 = q.yearHigh || price*1.3, low52 = q.yearLow || price*0.7;
          return {sym:s.sym, name:q.name||s.name, type:s.type, av:s.av,
            price, chg:q.change||0, chgPct:q.changesPercentage||0, high52, low52,
            score:calcStockScore(price, high52, low52, q.changesPercentage||0)};
        });
        yahooOk = true;
      }
    } catch(e) { console.warn('FMP fallback failed:', e.message); }
  }

  /* ── Fallback 2: Alpha Vantage (rate-limited — rotates keys on 429) ── */
  if (!yahooOk) {
    loading.textContent = 'LOADING VIA ALPHA VANTAGE…';
    var results = STOCKS_LIST.map(function(s) {
      return {sym:s.sym, name:s.name, type:s.type, av:s.av, price:0, chg:0, chgPct:0, high52:0, low52:0, score:0, err:true};
    });
    var avStocks  = STOCKS_LIST.filter(function(s) { return s.av; });
    var batchSize = 5;
    for (var b = 0; b < avStocks.length; b += batchSize) {
      var batch = avStocks.slice(b, b + batchSize);
      await Promise.all(batch.map(async function(s) {
        try {
          var q = await fetchStockAV(s.av);
          if (!q) { q = await fetchStockAV((rotateAVKey(), s.av)); } /* rotate key on failure */
          if (q) {
            var idx = results.findIndex(function(r) { return r.sym === s.sym; });
            if (idx >= 0) results[idx] = Object.assign(results[idx], q, {
              name: s.name, err: false, score: calcStockScore(q.price, q.high52, q.low52, q.chgPct)
            });
          }
        } catch(e) {}
      }));
      if (b + batchSize < avStocks.length) await sleep(1000);
    }
    stocksData = results;
  }

  stocksLoaded = true;
  loading.style.display = 'none';
  var stTiles = document.getElementById('stocks-tiles');
  if (stTiles) stTiles.style.display = '';
  renderStocksTable();
  renderStHoldings();
}

/* Stocks tile grid (market screener) */
function renderStocksTable() {
  var grid = document.getElementById('stocks-tiles');
  if (!grid || !stocksData.length) return;
  grid.innerHTML = stocksData.map(function(s) {
    var scC    = s.score >= 65 ? 'var(--green)' : s.score <= 35 ? 'var(--red)' : 'var(--amber)';
    var dayC   = s.chgPct > 0.01 ? 'up' : s.chgPct < -0.01 ? 'dn' : 'fl';
    var isBig  = s.price >= 1000;
    var priceStr = isBig ? '$' + s.price.toLocaleString('en-US', {maximumFractionDigits:0}) : '$' + (s.price||0).toFixed(2);
    var glowCls  = s.score >= 65 ? 'score-hi' : s.score <= 35 ? 'score-lo' : '';
    return '<div class="asset-tile type-' + s.type + ' ' + glowCls + '" onclick="openAssetDetail(\'stock\',\'' + s.sym + '\',event)" title="Click for details">'
      + '<div class="at-head">'
        + '<div style="min-width:0;flex:1;">'
          + '<div style="display:flex;align-items:center;gap:4px;">'
            + '<span class="at-sym">' + s.sym + '</span>'
            + '<span class="at-badge ' + (s.type==='index'?'idx':'stk') + '">' + (s.type==='index'?'INDEX':'STOCK') + '</span>'
          + '</div>'
          + '<div class="at-name">' + s.name + '</div>'
        + '</div>'
      + '</div>'
      + '<div class="at-price">' + (s.err ? '—' : priceStr) + '<span style="font-size:10px;font-weight:600;margin-left:5px;color:' + (s.chgPct>=0?'var(--green)':'var(--red)') + ';">' + (s.err?'':'(' + (s.chgPct>=0?'+':'') + s.chgPct.toFixed(2) + '%)') + '</span></div>'
      + '<div class="at-stats">'
        + '<div class="at-stat"><div class="at-stat-l">52W H</div><div class="at-stat-v bnb">' + (s.high52?'$'+s.high52.toFixed(0):'—') + '</div></div>'
        + '<div class="at-stat"><div class="at-stat-l">52W L</div><div class="at-stat-v bnb">'  + (s.low52?'$'+s.low52.toFixed(0):'—')  + '</div></div>'
        + '<div class="at-stat"><div class="at-stat-l">SCR</div><div class="at-stat-v" style="color:' + scC + ';">' + s.score + '</div></div>'
      + '</div>'
      + '<div class="at-foot">'
        + '<span class="at-signal ' + (s.score>=65?'bull':s.score<=35?'bear':'neu') + '">' + (s.score>=65?'MOMENTUM':s.score<=35?'LAGGING':'NEUTRAL') + '</span>'
        + '<span class="at-score" style="color:' + scC + ';">' + s.score + '</span>'
      + '</div>'
      + '</div>';
  }).join('');
}

/* Forex tile grid (market screener) — full version (already in holdings for held tiles) */
function renderForexTable() {
  var grid = document.getElementById('forex-tiles');
  if (!grid) return;
  if (!forexData.length) { grid.innerHTML = '<div class="no-sug">No forex data yet.</div>'; return; }
  grid.innerHTML = forexData.map(function(p) {
    if (p.locked) {
      return '<div class="asset-tile type-forex" style="opacity:.5;cursor:pointer;" onclick="openPro()" title="Pro feature">'
        + '<div class="at-head"><div><div class="at-sym forex-sym">' + p.from + '/' + p.to + '</div>'
        + '<div class="at-name">' + p.name + '</div></div>'
        + '<span class="at-badge fx">⚡PRO</span></div>'
        + '<div style="font-size:10px;color:var(--pro);margin-top:8px;letter-spacing:.06em;">UNLOCK FREE →</div>'
        + '</div>';
    }
    var isHeld  = fxHoldings.some(function(h) { return h.pair === p.from + '/' + p.to; });
    var isJPY   = p.to === 'JPY' || p.to === 'MXN';
    var dec     = isJPY ? 3 : 5;
    var rateStr = p.rate ? p.rate.toFixed(dec) : '—';
    var scC     = p.score >= 65 ? 'var(--green)' : p.score <= 35 ? 'var(--red)' : 'var(--amber)';
    var dayC    = p.chgPct > 0.001 ? 'up' : p.chgPct < -0.001 ? 'dn' : 'fl';
    var dayStr  = p.chgPct ? (p.chgPct>=0?'+':'') + p.chgPct.toFixed(3) + '%' : '—';
    var p7  = p.p7  || 0, p7C  = p7  > 0.001 ? 'up' : p7  < -0.001 ? 'dn' : 'fl';
    var p30 = p.p30 || 0, p30C = p30 > 0.001 ? 'up' : p30 < -0.001 ? 'dn' : 'fl';
    var isCom   = p.from==='XAU' || p.from==='XTI' || p.from==='XAG';
    var typeCls = isCom ? 'type-commodity' : 'type-forex';
    var badgeCls = isCom ? 'cmd' : 'fx', badgeTxt = isCom ? 'CMDTY' : 'FOREX';
    var sigCls  = p.signal==='BULLISH'||p.signal==='OVERSOLD' ? 'bull'
                : p.signal==='BEARISH'||p.signal==='OVERBOUGHT' ? 'bear' : 'neu';
    var glowCls = p.score >= 65 ? 'score-hi' : p.score <= 35 ? 'score-lo' : '';
    var fxId = p.from + '/' + p.to;
    return '<div class="asset-tile ' + typeCls + ' ' + glowCls + (isHeld ? ' held' : '')
      + '" onclick="openAssetDetail(\'forex\',\'' + fxId + '\',event)" title="Click for details">'
      + '<div class="at-head"><div style="min-width:0;flex:1;">'
        + '<div style="display:flex;align-items:center;gap:4px;">'
          + '<span class="at-sym forex-sym">' + p.from + '<span style="color:var(--muted);font-weight:400;">/</span>' + p.to + '</span>'
          + '<span class="at-badge ' + badgeCls + '">' + badgeTxt + '</span>'
          + (isHeld ? '<span class="at-held-tag">HELD</span>' : '')
        + '</div>'
        + '<div class="at-name">' + p.name + '</div>'
      + '</div></div>'
      + '<div class="at-price">' + rateStr + '<span style="font-size:10px;font-weight:600;margin-left:5px;color:' + (p.chgPct>=0?'var(--green)':'var(--red)') + ';">' + dayStr + '</span></div>'
      + '<div class="at-stats">'
        + '<div class="at-stat"><div class="at-stat-l">7D</div><div class="at-stat-v '  + p7C  + '">' + (p7>=0?'+':'')  + p7.toFixed(2)  + '%</div></div>'
        + '<div class="at-stat"><div class="at-stat-l">30D</div><div class="at-stat-v ' + p30C + '">' + (p30>=0?'+':'') + p30.toFixed(2) + '%</div></div>'
        + '<div class="at-stat"><div class="at-stat-l">RSI</div><div class="at-stat-v ' + (p.rsi>=70?'dn':p.rsi<=30?'up':'fl') + '">' + p.rsi + '</div></div>'
      + '</div>'
      + '<div class="at-foot">'
        + '<span class="at-signal ' + sigCls + '">' + p.signal + '</span>'
        + '<div style="display:flex;align-items:center;gap:4px;">'
          + '<div style="width:28px;height:3px;background:var(--bg3);border-radius:2px;overflow:hidden;">'
            + '<div style="width:' + p.score + '%;height:100%;background:' + scC + ';border-radius:2px;"></div>'
          + '</div>'
          + '<span class="at-score" style="color:' + scC + ';">' + p.score + '</span>'
        + '</div>'
      + '</div>'
      + '</div>';
  }).join('');
}

/* ══════════════════════════════════════════════════════════════
   MODE SWITCHER
══════════════════════════════════════════════════════════════ */
function toggleModeVisibility(mode, on) {
  _modeEnabled[mode] = on;
  saveModePrefs();
  var btn = document.getElementById('am-' + mode);
  if (btn) btn.style.display = on ? '' : 'none';
  if (!on && currentMode === mode) {
    var fallback = ['crypto','forex','stocks'].find(function(m) { return _modeEnabled[m]; });
    if (fallback) setMode(fallback);
  }
  var chk = document.getElementById('mode-' + mode + '-toggle');
  if (chk) chk.checked = on;
}

function setMode(mode) {
  if (!_modeEnabled[mode]) return;
  currentMode = mode;
  ['crypto','forex','stocks'].forEach(function(m) {
    var b = document.getElementById('am-' + m);
    if (b) b.classList.toggle('active', m === mode);
    var h = document.getElementById('holdings-' + m);
    if (h) h.style.display = m === mode ? (m === 'crypto' ? '' : 'flex') : 'none';
  });
  document.getElementById('crypto-panel').style.display = mode === 'crypto' ? '' : 'none';
  document.getElementById('forex-panel').style.display  = mode === 'forex'  ? '' : 'none';
  document.getElementById('stocks-panel').style.display = mode === 'stocks' ? '' : 'none';
  document.getElementById('sort-tabs').style.display    = mode === 'crypto' ? '' : 'none';
  var titles = {crypto:'PERFORMANCE LEADERBOARD', forex:'FOREX PAIRS', stocks:'MARKET SCREENER'};
  document.getElementById('tbl-title').textContent = titles[mode];
  if (mode === 'forex'  && !forexLoaded)  loadForex();
  if (mode === 'stocks' && !stocksLoaded) loadStocks();
}

function applyModePrefs() {
  ['crypto','forex','stocks'].forEach(function(m) {
    var btn = document.getElementById('am-' + m);
    var chk = document.getElementById('mode-' + m + '-toggle');
    if (!_modeEnabled[m] && btn) btn.style.display = 'none';
    if (chk) chk.checked = _modeEnabled[m];
  });
}

/* ══════════════════════════════════════════════════════════════
   LOAD / REFRESH / AUTO-REFRESH
══════════════════════════════════════════════════════════════ */
var _autoRefreshTimer = null;
function startAutoRefresh() {
  if (_autoRefreshTimer) clearInterval(_autoRefreshTimer);
  _autoRefreshTimer = setInterval(function() {
    if (!busy && currentMode === 'crypto') doRefresh();
  }, 15*60*1000); /* 15 minutes — change here */
}

async function doLoad() {
  processIncomingRef();
  var _d = checkMyReferrals();
  isPro  = _d.pro || loadPro();
  busy   = true;
  try {
    await loadCoins();   prog(50, 'SCORING…');  renderCoinSel();
    await loadMacroData(); prog(58, 'MACRO…');
    await loadBTC();     prog(92, 'RENDERING…');
    applyModePrefs();
    renderAll();         prog(100, 'READY');
    await sleep(320);
    document.getElementById('loader').classList.add('gone');
    startAutoRefresh();
  } catch(e) {
    document.getElementById('lmsg').textContent = 'ERROR: ' + e.message;
    document.getElementById('lbf').style.background = 'var(--red)';
  }
  busy = false;
}

async function doRefresh() {
  if (busy) return;
  busy = true;
  var tsEl = document.getElementById('ts');
  if (tsEl) tsEl.style.color = 'var(--bnb)';
  try {
    await loadCoins();
    var btcUrl  = 'https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=200';
    var btcInfo = getCacheInfo(btcUrl);
    if (!btcInfo || !btcInfo.fresh) await sleep(1200);
    await loadBTC();
    renderAll();
  } catch(e) { console.error(e); }
  if (tsEl) setTimeout(function() { tsEl.style.color = ''; }, 600);
  busy = false;
}

/* ══════════════════════════════════════════════════════════════
   SPARKLE ANIMATION  (Pro — top tile)
══════════════════════════════════════════════════════════════ */
function startSparkle(canvas) {
  var ctx = canvas.getContext('2d');
  var W   = canvas.offsetWidth || 140, H = canvas.offsetHeight || 100;
  canvas.width = W; canvas.height = H;
  var pts = [];
  var si  = setInterval(function() {
    for (var i = 0; i < 3; i++) pts.push({
      x: Math.random()*W, y: Math.random()*H,
      r: Math.random()*2 + 0.5, life: 1,
      decay: Math.random()*0.018 + 0.01,
      vx: (Math.random()-0.5)*0.9, vy: (Math.random()-0.5)*0.9,
      h: 38 + Math.random()*20
    });
  }, 70);
  var raf;
  function frame() {
    ctx.clearRect(0, 0, W, H);
    pts = pts.filter(function(p) { return p.life > 0; });
    pts.forEach(function(p) {
      p.x += p.vx; p.y += p.vy; p.life -= p.decay;
      ctx.save();
      ctx.globalAlpha = p.life * 0.85;
      ctx.fillStyle   = 'hsl(' + p.h + ',95%,68%)';
      ctx.shadowColor = 'hsl(' + p.h + ',100%,60%)';
      ctx.shadowBlur  = 5;
      var s = p.r, x = p.x, y = p.y;
      ctx.beginPath();
      ctx.moveTo(x, y-s*2.8); ctx.lineTo(x+s*0.4, y-s*0.4);
      ctx.lineTo(x+s*2.8, y); ctx.lineTo(x+s*0.4, y+s*0.4);
      ctx.lineTo(x, y+s*2.8); ctx.lineTo(x-s*0.4, y+s*0.4);
      ctx.lineTo(x-s*2.8, y); ctx.lineTo(x-s*0.4, y-s*0.4);
      ctx.closePath(); ctx.fill(); ctx.restore();
    });
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  return function() { clearInterval(si); cancelAnimationFrame(raf); ctx.clearRect(0, 0, W, H); };
}

/* ── Dismiss bear banner ─────────────────────────────────────── */
function dismissBearBanner() {
  _bearDismissed = true;
  try { localStorage.setItem('rot_bear_dismissed', '1'); } catch(e) {}
  document.getElementById('bear-banner').classList.remove('show');
}

/* ── Mobile holdings panel ───────────────────────────────────── */
var _mobHoldingsOpen = false;
function mobNav(mode) {
  _mobHoldingsOpen = false;
  document.getElementById('mob-holdings-panel').classList.remove('open');
  ['crypto','forex','stocks','holdings'].forEach(function(m) {
    var b = document.getElementById('mn-' + m);
    if (b) b.classList.toggle('active', m === mode);
  });
  setMode(mode);
}
function mobNavHoldings() {
  _mobHoldingsOpen = !_mobHoldingsOpen;
  var panel = document.getElementById('mob-holdings-panel');
  var btn   = document.getElementById('mn-holdings');
  panel.classList.toggle('open', _mobHoldingsOpen);
  if (btn) btn.classList.toggle('active', _mobHoldingsOpen);
  if (_mobHoldingsOpen) {
    var src = document.getElementById('holdings-' + (currentMode || 'crypto'));
    if (src) {
      panel.innerHTML = '';
      var clone = src.cloneNode(true);
      clone.style.display = 'flex'; clone.style.flexDirection = 'column';
      panel.appendChild(clone);
    }
  }
}

/* ── Language system ─────────────────────────────────────────── */
var LANG_STRINGS = {
  en:{support:'☕ SUPPORT',    unlockpro:'⚡ UNLOCK PRO',         flag:'🇬🇧'},
  zh:{support:'☕ 支持',       unlockpro:'⚡ 解锁专业版',           flag:'🇨🇳'},
  ar:{support:'☕ دعم',        unlockpro:'⚡ الترقية',             flag:'🇸🇦'},
  es:{support:'☕ APOYAR',     unlockpro:'⚡ DESBLOQUEAR PRO',     flag:'🇪🇸'},
  fr:{support:'☕ SOUTENIR',   unlockpro:'⚡ DÉBLOQUER PRO',       flag:'🇫🇷'},
  de:{support:'☕ UNTERSTÜTZEN',unlockpro:'⚡ PRO FREISCHALTEN',   flag:'🇩🇪'},
  mk:{support:'☕ ПОДДРЖИ',    unlockpro:'⚡ ОТКЛУЧИ ПРО',         flag:'🇲🇰'}
};
var currentLang = 'en';
function setLang(lang) {
  currentLang = lang;
  var s = LANG_STRINGS[lang] || LANG_STRINGS.en;
  var flagEl  = document.getElementById('lang-flag');
  if (flagEl) flagEl.textContent = s.flag;
  ['en','zh','ar','es','fr','de','mk'].forEach(function(l) {
    var b = document.getElementById('lbtn-' + l);
    if (b) b.classList.toggle('active', l === lang);
  });
  var donate = document.querySelector('.btn.donate');
  if (donate) donate.textContent = s.support;
  var pro = document.querySelector('.btn.pro-btn');
  if (pro && !pro.textContent.includes('ACTIVE')) pro.textContent = s.unlockpro;
  try { localStorage.setItem('rot_lang', lang); } catch(e) {}
}
(function() { try { var l = localStorage.getItem('rot_lang'); if (l) setTimeout(function() { setLang(l); }, 50); } catch(e) {} })();

/* ── Tooltip system ──────────────────────────────────────────── */
var tipEl = null;
function getTip() { if (!tipEl) tipEl = document.getElementById('rt-tip'); return tipEl; }
function showTip(title, body, x, y) {
  var t = getTip();
  document.getElementById('rt-tip-title').textContent = title;
  document.getElementById('rt-tip-body').innerHTML    = body;
  t.classList.add('show');
  var tw = 220, lx = x+14, ly = y+14;
  if (lx+tw > window.innerWidth-10)  lx = x-tw-8;
  if (ly+100 > window.innerHeight-10) ly = y-100-8;
  t.style.left = lx + 'px'; t.style.top = ly + 'px';
}
function hideTip() { var t = getTip(); if (t) t.classList.remove('show'); }
function showRowTip(row, e) {
  var sym   = row.getAttribute('data-sym');
  var name  = row.getAttribute('data-name');
  var mcap  = row.getAttribute('data-mcap');
  var score = row.getAttribute('data-score');
  var p24   = row.getAttribute('data-p24');
  var p7    = row.getAttribute('data-p7');
  var p30   = row.getAttribute('data-p30');
  var held  = row.getAttribute('data-held') === '1';
  var scN   = parseInt(score);
  var signal = scN >= 65 ? '⬆ Strong momentum' : scN >= 45 ? '→ Neutral' : '⬇ Lagging — watch closely';
  var body  = 'Market Cap: <strong style="color:var(--bnb)">' + mcap + '</strong><br>'
    + '24H: <strong>' + (parseFloat(p24)>=0?'+':'') + p24 + '%</strong> &nbsp; '
    + '7D: <strong>'  + (parseFloat(p7)>=0?'+':'')  + p7  + '%</strong> &nbsp; '
    + '30D: <strong>' + (parseFloat(p30)>=0?'+':'') + p30 + '%</strong><br>'
    + 'Signal: <strong>' + signal + '</strong>'
    + (held ? '<br><span style="color:var(--bnb)">✓ In your holdings</span>' : '');
  showTip(sym + ' — ' + name, body, e.clientX, e.clientY);
}
document.addEventListener('DOMContentLoaded', function() {
  document.querySelectorAll('th[data-tip]').forEach(function(th) {
    th.addEventListener('mouseenter', function(e) { showTip(th.textContent.replace('⚡','').trim(), th.getAttribute('data-tip'), e.clientX, e.clientY); });
    th.addEventListener('mouseleave', hideTip);
  });
});

/* ── Modal helpers ───────────────────────────────────────────── */
function openModal(id) {
  document.getElementById(id).classList.add('show');
  if (id === 'donate-modal') renderDonationBar('donate-modal-goal');
}
function closeModal(id) { document.getElementById(id).classList.remove('show'); }
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') { closeModal('donate-modal'); closeModal('pro-modal'); }
});

/* ── Asset tile click delegation ─────────────────────────────── */
document.addEventListener('click', function(e) {
  var tile = e.target.closest('[data-assettype]');
  if (!tile) return;
  var type = tile.getAttribute('data-assettype');
  var id   = tile.getAttribute('data-assetid');
  if (type && id) openAssetDetail(type, id, e);
});

/* ── Entry point ─────────────────────────────────────────────── */
doLoad().then(function() { initTutorial(); });
