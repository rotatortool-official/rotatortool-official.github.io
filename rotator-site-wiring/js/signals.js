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

/* ── Format helpers ──────────────────────────────────────────── */
function fmtP(p) {
  if (p === null || p === undefined) return '—';
  if (p >= 1000) return '$' + p.toLocaleString('en-US', {maximumFractionDigits: 0});
  if (p >= 1)    return '$' + p.toFixed(2);
  if (p >= 0.01) return '$' + p.toFixed(4);
  return '$' + p.toFixed(6);
}
function pctSpan(v) {
  var c = v >= 0 ? 'pct up' : 'pct dn';
  return '<span class="' + c + '">' + (v >= 0 ? '+' : '') + v.toFixed(2) + '%</span>';
}
/* ── BTC trend pill ──────────────────────────────────────────── */
var _bearDismissed = false;
try { _bearDismissed = localStorage.getItem('rot_bear_dismissed') === '1'; } catch(e) {}

function _showScaleBannerIfNeeded() {
  var scaleDismissed = false;
  try { scaleDismissed = localStorage.getItem('rot_scale_dismissed') === '1'; } catch(e) {}
  var sb = document.getElementById('scale-banner');
  if (sb && !scaleDismissed) sb.classList.add('show');
}

function renderBTC() {
  var pill    = document.getElementById('btc-pill');
  var pillTxt = document.getElementById('btc-pill-txt');
  var mobInner = document.getElementById('mob-btc-inner');
  var mobTxt   = document.getElementById('mob-btc-txt');
  if (!btcMA200 || !btcPrice) return;

  /* Transparency: when BTC's real Mayer Multiple is pushing scoring into
     the 'stretched'/'oversold' tier (see _adaptiveThresholds() in this
     file), show the actual number in the pill's tooltip rather than
     silently shifting buy/sell bands behind the scenes. Score changes
     that aren't explainable erode trust in the score. */
  var cycleLabel = (typeof _btcCycleLabel === 'function') ? _btcCycleLabel() : null;
  var mm = (typeof marketCycleData !== 'undefined' && marketCycleData.BTC) ? marketCycleData.BTC.mayer_multiple : null;
  var cycleTip = '';
  if (mm != null) {
    cycleTip = ' — Mayer Multiple ' + mm.toFixed(2) + '×'
      + (cycleLabel === 'stretched' ? ' (historically stretched — buy threshold tightened)'
        : cycleLabel === 'oversold' ? ' (historically oversold — buy threshold loosened)'
        : ' (neutral zone)');
  }

  if (btcPrice > btcMA200) {
    if (pill)    { pill.className = 'btc-pill bull'; pill.title = 'BTC above its 200-day average' + cycleTip; }
    if (pillTxt) pillTxt.textContent = 'BTC UPTREND ▲' + (cycleLabel === 'stretched' ? ' 🔥' : '');
    if (mobInner) mobInner.className = 'mob-btc-cell bull';
    if (mobTxt)   mobTxt.textContent = '▲ BTC';
    document.getElementById('bear-banner').classList.remove('show');
    _bearDismissed = false;
    try { localStorage.removeItem('rot_bear_dismissed'); } catch(e) {}
    /* No bear banner → show scale tip directly */
    _showScaleBannerIfNeeded();
  } else {
    if (pill)    { pill.className = 'btc-pill bear'; pill.title = 'BTC below its 200-day average' + cycleTip; }
    if (pillTxt) pillTxt.textContent = 'BTC DOWNTREND ▼' + (cycleLabel === 'oversold' ? ' 🧊' : '');
    if (mobInner) mobInner.className = 'mob-btc-cell';
    if (mobTxt)   mobTxt.textContent = '▼ BTC';
    if (!_bearDismissed) {
      document.getElementById('bear-banner').classList.add('show');
    } else {
      /* Bear banner already dismissed → show scale tip */
      _showScaleBannerIfNeeded();
    }
  }
}

/* ══════════════════════════════════════════════════════════════
   ADAPTIVE THRESHOLDS + HYSTERESIS + MEAN-REVERSION GATE
   ──────────────────────────────────────────────────────────────
   Three small accuracy nudges, applied as a single zone classifier:

   1. Adaptive bands: BTC>MA200 → SELL band raised (don't cut winners
      too early); BTC<MA200 → BUY band lowered (don't catch knives).
   2. Hysteresis deadband: once a coin enters BUY/SELL, it must cross
      50 (not just the entry band) to flip — kills churn from coins
      that hover near 38/62.
   3. Mean-reversion gate on BUY: only call BUY when 30D drawdown is
      in the reversion sweet spot (-40% .. -3%). Tails are usually
      broken markets, not buys.

   The base thresholds (38/62) are still the public/visible ones; the
   adjustments shift the actual signal trigger. Per-coin zone state
   is mirrored to localStorage so hysteresis survives reloads.
══════════════════════════════════════════════════════════════ */
var _SIG_BUY_BASE  = 38;
var _SIG_SELL_BASE = 62;
var _SIG_DEADBAND  = 50;

var _lastZone = {};
try {
  var _zRaw = localStorage.getItem('rot_last_zone');
  if (_zRaw) _lastZone = JSON.parse(_zRaw) || {};
} catch (e) {}

function _adaptiveThresholds() {
  if (btcMA200 && btcPrice) {
    /* BTC's own Mayer Multiple label (real, calibrated to BTC's history —
       see _btcCycleLabel() in data-loaders.js) adds a third tier on top
       of the plain bull/bear split below. This ONLY applies to BTC —
       ETH/BNB/SOL/XRP/PAXG's Mayer Multiples are shown in the UI as raw
       ratios but never touch scoring, since no calibrated bands exist
       for them (see sync-market-cycle Edge Function comments). */
    var cycleLabel = (typeof _btcCycleLabel === 'function') ? _btcCycleLabel() : null;
    if (cycleLabel === 'stretched') {
      /* Market historically overheated (BTC Mayer Multiple ≥ 2.4×) — be
         MORE cautious about new buys, keep the same "let winners run"
         sell discipline as plain bull, since exiting early near a real
         top is its own mistake. */
      return { buy: 32, sell: 66 };
    }
    if (cycleLabel === 'oversold') {
      /* Market historically stretched to the downside (BTC Mayer
         Multiple ≤ 0.8×) — loosen the buy band a bit further than plain
         bear, since this zone has historically been accumulation
         territory rather than a falling knife. */
      return { buy: 38, sell: 58 };
    }
    if (btcPrice > btcMA200) return { buy: 38, sell: 66 }; /* bull: hold winners */
    return { buy: 34, sell: 58 };                           /* bear: skip knives */
  }
  return { buy: _SIG_BUY_BASE, sell: _SIG_SELL_BASE };
}

function _passesMeanRevGate(c) {
  var p30 = (c && typeof c.p30 === 'number') ? c.p30 : 0;
  return p30 <= -3 && p30 >= -40;
}

/* Lightweight forward-looking proxy for ALL coins — used by the zone
   classifier so we can dampen rotation calls when this disagrees with
   the rotation score. The full Insight Engine in computeInsights() is
   richer but only runs on holdings/watchlist (kline rate-limit cost);
   this version uses fields computeScores has already populated, so it's
   free to compute everywhere.

   Returns 0–100 where:
     ≥65 → forward-looking bullish (oversold/accumulating/accelerating)
     ≤35 → forward-looking bearish (overbought/distribution/decelerating)
*/
function _quickInsight(c) {
  if (!c) return 50;
  var pts = 0;
  var p7   = c.p7  || 0;
  var p14  = c.p14 || 0;
  var p30  = c.p30 || 0;

  /* Momentum acceleration: p7 outperforming p14 = momentum building */
  var accel = p7 - p14;
  if      (accel >  5)   pts += 15;
  else if (accel >  1.5) pts += 6;
  else if (accel < -5)   pts -= 15;
  else if (accel < -1.5) pts -= 6;

  /* Recovery vs 30D: short-term lift while still drawn-down = reversion */
  var recovery = p7 - p30;
  if      (recovery >  8) pts += 10;
  else if (recovery < -8) pts -= 8;

  /* Volume × stability: high turnover at flat price = accumulation */
  var vm = (c.volume24 && c.mcap) ? c.volume24 / c.mcap : 0;
  var stable24 = Math.abs(c.p24 || 0) < 3;
  if      (vm > 0.20 && stable24)        pts += 20;
  else if (vm > 0.20)                    pts += 10;
  else if (vm < 0.02 && c.mcap > 5e8)    pts -= 12;

  /* RSI-style proxy from intra-list 30D rank */
  if (c.r30 && typeof coins !== 'undefined' && coins.length > 1) {
    var rsiProxy = (1 - (c.r30 - 1) / Math.max(coins.length - 1, 1)) * 100;
    if      (rsiProxy <= 25) pts += 18;   /* oversold */
    else if (rsiProxy >= 75) pts -= 18;   /* overbought */
  }

  var max = 65, min = -65;
  var raw = Math.min(max, Math.max(min, pts));
  return Math.round(((raw - min) / (max - min)) * 100);
}

/* Classify every coin's zone with hysteresis + adaptive bands.
   Sets c._zone ∈ {'buy','sell','neutral'} and persists to localStorage. */
function _classifyZones() {
  if (typeof coins === 'undefined' || !coins.length) return;
  var th = _adaptiveThresholds();
  coins.forEach(function(c) {
    if (!c || c.isStable || c.dataComplete === false) { c._zone = 'neutral'; return; }

    /* Step 3: Insight↔rotation cross-link.
       Prefer the rich Insight Engine score when present (holdings/watchlist),
       fall back to _quickInsight for everything else. If the forward-looking
       signal strongly disagrees with the rotation score, pull the effective
       score back toward neutral (50) so the zone classifier won't trigger.
         · ins ≥65 (bullish ahead) but rot ≥55 (rotation says sell) → dampen sell
         · ins ≤35 (bearish ahead) but rot ≤45 (rotation says buy)  → dampen buy
       Never crosses 50 — only neutralizes the contradiction. */
    var s = c.score;
    var ins = (c.insight && typeof c.insight.score === 'number')
                ? c.insight.score : _quickInsight(c);
    if      (ins >= 65 && s >= 55) s = Math.max(50, s - 6);
    else if (ins <= 35 && s <= 45) s = Math.min(50, s + 6);
    c._effectiveScore = s;
    c._quickIns = ins;

    var prev = _lastZone[c.id];
    var z;
    if      (s <= th.buy)                                 z = 'buy';
    else if (s >= th.sell)                                z = 'sell';
    else if (prev === 'buy'  && s < _SIG_DEADBAND)        z = 'buy';   /* deadband hold */
    else if (prev === 'sell' && s > _SIG_DEADBAND)        z = 'sell';
    else                                                  z = 'neutral';
    _lastZone[c.id] = z;
    c._zone = z;
  });
  try { localStorage.setItem('rot_last_zone', JSON.stringify(_lastZone)); } catch (e) {}
}

/* Exposed for signal-history.js (rotation snapshot uses the same gates).
   Phase 1: these now resolve to the canonical engine's copies rather than
   the in-page ones, so signal-history.js and the engine can never apply
   different gates to the same coin. Falls back to the local definitions
   if the engine script failed to load, for the same reason
   runSignalEngine() does — a missing script must not blank the page. */
window.RotZones = {
  classify: function() {
    /* No-op: zones arrive with the engine run (see runSignalEngine()). */
  },
  passesMeanRevGate: (typeof RotatorEngine !== 'undefined')
    ? RotatorEngine.internals.passesMeanRevGate : _passesMeanRevGate,
  adaptiveThresholds: (typeof RotatorEngine !== 'undefined')
    ? RotatorEngine.internals.adaptiveThresholds : _adaptiveThresholds
};

/* ══════════════════════════════════════════════════════════════
   INVESTMENT OPPORTUNITIES (top signal bar)
   Three columns: Rotation Opps | High Momentum | Worst 30D
══════════════════════════════════════════════════════════════ */

/* Single signal tile (momentum / worst) */
function sigTile(c, kind) {
  var badges = {rot:'ROT', mom:'MOM', wrst:'WORST'};
  var scC  = c.score >= 65 ? 'up' : c.score <= 35 ? 'dn' : 'am';

  /* Supply & sentiment */
  var circ = c.circulating_supply || 0;
  var maxS = c.max_supply || 0;
  var unlockPct = (circ && maxS > 0) ? Math.round((circ / maxS) * 100) : -1;
  var unlockStr = unlockPct >= 0 ? unlockPct + '%' : '∞';
  var sentScore = (c.p24 || 0) * 0.4 + (c.p7 || 0) * 0.6;
  var sentLabel = sentScore >= 0 ? 'BULL' : 'BEAR';
  var sentCls   = sentScore >= 0 ? 'up' : 'dn';

  /* Market cap formatted */
  var mcapStr = c.mcap ? (c.mcap >= 1e9 ? '$' + (c.mcap/1e9).toFixed(1) + 'B' : '$' + (c.mcap/1e6).toFixed(0) + 'M') : '—';

  return '<div class="sig-tile ' + kind + '" onclick="openTileDetail(\'' + c.id + '\',event)" title="Click for details">'
    + '<div class="sig-tile-top">'
      + '<div class="sig-tile-ico"><img src="' + c.image + '" alt="' + c.sym + ' logo" loading="lazy" width="20" height="20" onerror="this.style.display=\'none\'"></div>'
      + '<span class="sig-tile-sym">' + c.sym + '</span>'
      + '<span class="sig-tile-badge ' + kind + '">' + badges[kind] + '</span>'
    + '</div>'
    + '<div class="sig-tile-stats">'
      + '<div class="sig-stat"><span class="sig-stat-l">MCAP</span><span class="sig-stat-v am">' + mcapStr + '</span></div>'
      + '<div class="sig-stat"><span class="sig-stat-l">UNLOCK</span><span class="sig-stat-v am">' + unlockStr + '</span></div>'
      + '<div class="sig-stat"><span class="sig-stat-l">SENT</span><span class="sig-stat-v ' + sentCls + '">' + sentLabel + '</span></div>'
      + '<div class="sig-stat"><span class="sig-stat-l">SCR</span><span class="sig-stat-v '  + scC  + '">' + c.score + '</span></div>'
    + '</div>'
    + '</div>';
}

/* Rotation opportunity tile (sell→buy pair) */
/* ── Standalone "what should I buy" suggestion tile ──────────────
   Unlike sigRotTile (which always pairs a sell with a buy), this shows
   ONE buy-zone candidate on its own — for the very common case of
   someone with no holdings yet asking "what should I buy", where
   forcing a "sell X for Y" framing makes no sense (there's nothing to
   sell). Only ever built from real zone-classified buy candidates
   (_zone==='buy' && passesMeanRevGate), never a raw top/bottom score
   sort — see the fix in renderTopBars() below. */
function buySuggestTile(c) {
  var sent = (c.p24 || 0) * 0.4 + (c.p7 || 0) * 0.6;
  var sentLabel = sent >= 0 ? 'BULL' : 'BEAR';
  var sentCls   = sent >= 0 ? 'up' : 'dn';
  var circ = c.circulating_supply || 0, maxS = c.max_supply || 0;
  var unlock = (circ && maxS > 0) ? Math.round((circ / maxS) * 100) + '%' : '∞';
  /* Visual cue for the held-first sort in allBuys above — otherwise
     why this coin surfaced first is invisible to the person looking. */
  var isHeld = (typeof holdings !== 'undefined') && holdings.some(function(h) { return h.sym === c.sym; });
  var badgeText = isHeld ? 'ADD MORE?' : 'BUY ZONE';
  return '<div class="sig-tile rot" onclick="openTileDetail(\'' + c.id + '\',event)" title="Click for details">'
    + '<div class="sig-tile-top">'
      + '<div class="sig-tile-ico"><img src="' + c.image + '" alt="' + c.sym + ' logo" loading="lazy" width="20" height="20" onerror="this.style.display=\'none\'"></div>'
      + '<span class="sig-tile-sym" style="color:var(--green);">' + c.sym + '</span>'
      + '<span class="sig-tile-badge rot" style="background:rgba(0,200,150,.12);color:var(--green);">' + badgeText + '</span>'
    + '</div>'
    + '<div class="sig-tile-stats">'
      + '<div class="sig-stat"><span class="sig-stat-l">SCORE</span><span class="sig-stat-v am">' + c.score + '</span></div>'
      + '<div class="sig-stat"><span class="sig-stat-l">SENT</span><span class="sig-stat-v ' + sentCls + '">' + sentLabel + '</span></div>'
      + '<div class="sig-stat"><span class="sig-stat-l">UNLOCK</span><span class="sig-stat-v am">' + unlock + '</span></div>'
    + '</div>'
    + (isHeld ? '<div style="font-size:11px;color:var(--muted);margin-top:6px;">Already in your holdings — still in buy zone.</div>' : '')
    + '</div>';
}

/* ── "Told you so" proof line — real proven calls, not a promise ──
   Reuses SignalHistory.getProvenSignals(), which is already wired to
   real server data (signal_snapshots, 99+ days of history) via
   loadServerHistory() on page load — this is not local-browser-only
   anecdote, it's the same published record shown on track-record.html.
   Shows at most 1 recent proof, since the point is credibility, not
   a wall of self-congratulation next to a buy suggestion. */
function provenProofLine() {
  if (typeof SignalHistory === 'undefined') return '';
  var proven = SignalHistory.getProvenSignals();
  if (!proven || !proven.length) return '';
  var p = proven[0]; /* already sorted most-recent-relevant by getProvenSignals() */
  var changeStr = (p.change >= 0 ? '+' : '') + p.change + '%';
  return '<div class="proof-line" onclick="if(typeof SignalHistory!==\'undefined\')SignalHistory.shareProven(\'' + p.id + '\')" title="Click to share this call">'
    + '<span style="color:var(--green);">✓ Told you so —</span> '
    + p.daysAgo + 'd ago we flagged <b>' + p.sym + '</b> at ' + fmtP(p.priceThen)
    + ', now ' + fmtP(p.priceNow) + ' (<span style="color:' + (p.change >= 0 ? 'var(--green)' : 'var(--red)') + ';">' + changeStr + '</span>)'
    + '</div>';
}

/* ── Standalone "consider taking profit" tile — for a HELD coin in
   sell-zone with NO forced rotation target. Preserves capital framing,
   not a rotation plan: "this is overheated, consider trimming" without
   pretending there's a specific place to put the proceeds. */
function takeProfitTile(c) {
  return '<div class="sig-tile rot" onclick="openTileDetail(\'' + c.id + '\',event)" title="Click for details">'
    + '<div class="sig-tile-top">'
      + '<div class="sig-tile-ico"><img src="' + c.image + '" alt="' + c.sym + ' logo" loading="lazy" width="20" height="20" onerror="this.style.display=\'none\'"></div>'
      + '<span class="sig-tile-sym" style="color:var(--red);">' + c.sym + '</span>'
      + '<span class="sig-tile-badge rot" style="background:rgba(255,69,96,.12);color:var(--red);">TAKE PROFIT</span>'
    + '</div>'
    + '<div class="sig-tile-stats">'
      + '<div class="sig-stat"><span class="sig-stat-l">SCORE</span><span class="sig-stat-v am">' + c.score + '</span></div>'
      + '<div class="sig-stat"><span class="sig-stat-l">30D</span><span class="sig-stat-v ' + (c.p30 >= 0 ? 'up' : 'dn') + '">' + (c.p30 >= 0 ? '+' : '') + c.p30.toFixed(1) + '%</span></div>'
    + '</div>'
    + '<div style="font-size:11px;color:var(--muted);margin-top:6px;line-height:1.4;">Held &amp; overheated — no rotation target implied, just preserve some gains.</div>'
    + '</div>';
}

function sigRotTile(sell, buy) {
  var delta = sell.score - buy.score;

  /* Buy-side sentiment */
  var buySent = (buy.p24 || 0) * 0.4 + (buy.p7 || 0) * 0.6;
  var buySentLabel = buySent >= 0 ? 'BULL' : 'BEAR';
  var buySentCls   = buySent >= 0 ? 'up' : 'dn';

  /* Buy-side unlock % */
  var bCirc = buy.circulating_supply || 0;
  var bMax  = buy.max_supply || 0;
  var bUnlock = (bCirc && bMax > 0) ? Math.round((bCirc / bMax) * 100) + '%' : '∞';

  return '<div class="sig-tile rot" onclick="openTileDetail(\'' + buy.id + '\',event)" title="Click for buy-side details">'
    + '<div class="sig-tile-top">'
      + '<div class="sig-tile-ico"><img src="' + sell.image + '" alt="' + sell.sym + ' logo" loading="lazy" width="20" height="20" onerror="this.style.display=\'none\'"></div>'
      + '<span class="sig-tile-sym" style="color:var(--red);">'   + sell.sym + '</span>'
      + '<span style="color:var(--muted);font-size:12px;">→</span>'
      + '<div class="sig-tile-ico"><img src="' + buy.image + '" alt="' + buy.sym + ' logo" loading="lazy" width="20" height="20" onerror="this.style.display=\'none\'"></div>'
      + '<span class="sig-tile-sym" style="color:var(--green);">' + buy.sym  + '</span>'
      + '<span class="sig-tile-badge rot">Δ' + delta + '</span>'
    + '</div>'
    + '<div class="sig-tile-stats">'
      + '<div class="sig-stat"><span class="sig-stat-l">BUY SENT</span><span class="sig-stat-v ' + buySentCls + '">' + buySentLabel + '</span></div>'
      + '<div class="sig-stat"><span class="sig-stat-l">UNLOCK</span><span class="sig-stat-v am">' + bUnlock + '</span></div>'
      + '<div class="sig-stat"><span class="sig-stat-l">SCR DELTA</span><span class="sig-stat-v am">' + sell.score + '→' + buy.score + '</span></div>'
    + '</div>'
    + '</div>';
}

/* Render all three signal columns */
function renderTopBars() {
  /* Was _classifyZones(). Zones now come from the canonical engine, which
     also re-applies the Insight↔rotation cross-link — the reason this was
     re-run on every render in the first place (renderTopBars() is called
     again once Binance klines land and holdings gain a real Insight score).
     persist:false because a re-render is not new information; only real
     data loads write zones back to signal_zone_state. */
  if (typeof runSignalEngine === 'function' && typeof coins !== 'undefined' && coins.length) {
    runSignalEngine({ persist: false });
  }
  var hSyms = holdings.map(function(h) { return h.sym; });

  /* Helper: single supporter unlock tile (one per column only) */
  function proUnlockTile(msg) {
    return '<div class="sig-tile pro-locked" onclick="openPro()" style="cursor:pointer;'
      + 'display:flex;flex-direction:column;align-items:center;justify-content:center;'
      + 'gap:6px;min-height:88px;opacity:.85;">'
      + '<span style="font-size:18px;">☕</span>'
      + '<span style="font-size:12px;font-weight:700;letter-spacing:.1em;color:var(--bnb);">SUPPORTERS</span>'
      + '<span style="font-size:12px;color:var(--muted);text-align:center;line-height:1.4;">' + msg + '</span>'
      + '</div>';
  }

  /* Helper: empty placeholder tile — guides user to add holdings */
  function emptyPlaceholderTile() {
    return '<div class="sig-tile sig-tile-empty" onclick="document.getElementById(\'coin-sel\')&&document.getElementById(\'coin-sel\').focus()" title="Add holdings to get signals">'
      + '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:4px;opacity:.5;padding:6px;text-align:center;">'
      + '<span style="font-size:16px;color:var(--green);line-height:1;">+</span>'
      + '<span style="font-size:12px;letter-spacing:.04em;color:var(--muted);font-family:var(--font-ui);line-height:1.4;">Add holdings to receive signals</span>'
      + '</div></div>';
  }

  /* ── Column 3: Worst 30D — 2 free / 4 Pro ──
     bStocks excluded — separate scoring model (momentum-only, no
     tokenomics), not directly comparable to crypto rotation signals. */
  var worstAll = coins.slice().filter(function(c) { return !c.isStock; }).sort(function(a, b) { return a.p30 - b.p30; });
  var worstEl  = document.getElementById('worst-cards');
  if (isPro) {
    var worstTiles = worstAll.slice(0, 4).map(function(c) { return sigTile(c, 'wrst'); }).join('');
    for (var wp = worstAll.slice(0, 4).length; wp < 4; wp++) worstTiles += emptyPlaceholderTile();
    worstEl.innerHTML = '<div class="sig-tiles-grid">' + worstTiles + '</div>';
  } else {
    var w3 = worstAll.slice(0, 2).map(function(c) { return sigTile(c, 'wrst'); }).join('');
    var wLocked = proUnlockTile('2 more in Pro') + emptyPlaceholderTile();
    worstEl.innerHTML = '<div class="sig-tiles-grid">' + w3 + wLocked + '</div>';
  }

  /* ── Column 2: High Momentum — 1 free / 6 Pro ── */
  /* Same delisted-coin exclusion as the buy-side filters above — a
     score-60+ coin shown here reads as a tip, not a warning, so the
     same "don't point at something you can't actually buy" reasoning
     applies. Worst-30D-Performers (below) is deliberately left
     untouched — cautionary framing, not a suggestion to act on. */
  var momAll  = coins.slice().filter(function(c) { return c.score >= 60 && !c.isStock && !(typeof delistedSymbols !== 'undefined' && delistedSymbols.has(c.sym)); })
                             .sort(function(a, b) { return b.score - a.score; });

  /* Persist today's momentum tier + your holdings' scores, once/day,
     for the Telegram alert Edge Function (send-telegram-alerts) —
     signal_snapshots can't be reused here, see
     sql/create_momentum_and_holdings_snapshots.sql for why. Both RPCs
     are idempotent (server checks "already recorded today" and no-ops),
     so calling this on every render is safe, same pattern as the
     existing takeSnapshot() call. */
  if (typeof supaRecordMomentumSnapshot === 'function') {
    var momRows = momAll.slice(0, 20).map(function(c) {
      return {
        coin_id: c.id, coin_sym: c.sym, coin_name: c.name || '',
        score: c.score, price: c.price,
        vol_ratio: (typeof window._volRatio === 'function') ? Math.round(window._volRatio(c) * 100) / 100 : 1,
        mcap: c.mcap || 0
      };
    });
    if (momRows.length) supaRecordMomentumSnapshot(momRows);
  }
  if (typeof supaRecordHoldingsSnapshot === 'function' && typeof holdings !== 'undefined' && holdings.length) {
    var heldRows = holdings.map(function(h) {
      var c = coins.find(function(cc) { return cc.sym === h.sym; });
      if (!c) return null;
      return { sym: c.sym, coin_id: c.id, score: c.score, price: c.price };
    }).filter(Boolean);
    if (heldRows.length) supaRecordHoldingsSnapshot(heldRows);
  }
  var momEl   = document.getElementById('mom-cards');
  if (isPro) {
    if (momAll.length) {
      var momTiles = momAll.slice(0, 4).map(function(c) { return sigTile(c, 'mom'); }).join('');
      for (var mp = momAll.slice(0, 4).length; mp < 4; mp++) momTiles += emptyPlaceholderTile();
      momEl.innerHTML = '<div class="sig-tiles-grid">' + momTiles + '</div>';
    } else {
      momEl.innerHTML = '<div class="no-sug">Scanning \u2014 no coins above momentum threshold right now.</div>';
    }
  } else {
    if (momAll.length) {
      var m1 = sigTile(momAll[0], 'mom');
      var mLocked = proUnlockTile('unlock 3 more') + emptyPlaceholderTile() + emptyPlaceholderTile();
      momEl.innerHTML = '<div class="sig-tiles-grid">' + m1 + mLocked + '</div>';
    } else {
      momEl.innerHTML = '<div class="no-sug">Scanning \u2014 no coins above momentum threshold right now.</div>';
    }
  }

  /* ── Column 1: Rotation Opportunities — 1 free (real, unblurred) / 5 blurred+locked Pro ── */
  var sugEl = document.getElementById('sug-cards');

  /* Compute real rotation pairs regardless of tier — bStocks excluded,
     rotation logic (tokenomics-aware buy/sell zones) doesn't apply to equities. */
  var held  = coins.filter(function(c) { return hSyms.indexOf(c.sym) >= 0 && !c.isStock; });
  var sells = held.filter(function(c)  { return c._zone === 'sell'; }).sort(function(a, b) { return b.score - a.score; });
  var buys  = coins.filter(function(c) { return hSyms.indexOf(c.sym) < 0 && !c.isStock && c._zone === 'buy' && _passesMeanRevGate(c) && !(typeof delistedSymbols !== 'undefined' && delistedSymbols.has(c.sym)); }).sort(function(a, b) { return a.score - b.score; });

  /* Fallback candidates from all coins when no holdings exist —
     REAL zone-classified buy candidates only. The old version also
     built a fake "sell" side from unrelated market data and forced
     everyone with no holdings into a "sell X for Y" framing even
     though they held neither — replaced below with genuine mixed-type
     tiles (pair / take-profit / standalone buy) that reflect what's
     actually true for the visitor. */
  /* Real reported harm fix: exclude coins whose Binance USDT pair is
     delisted/suspended (see loadDelistedSymbols() in data-loaders.js,
     populated daily from Binance's own exchangeInfo). Only excluded
     from the BUY side — if someone already holds a coin that's since
     been delisted, take-profit/sell advice is still valid, arguably
     more urgent (get out before it's fully illiquid), so the sell
     side is deliberately untouched. */
  /* Held-first sort: a coin the user already holds (but is still in
     buy-zone — e.g. bought early, still looks good) should surface
     ahead of a suggestion for something they've never held. Score
     order (strongest buy-zone conviction first) still applies within
     each group. */
  var allBuys  = coins.slice().filter(function(c) { return !c.isStock && c._zone === 'buy' && _passesMeanRevGate(c) && !(typeof delistedSymbols !== 'undefined' && delistedSymbols.has(c.sym)); }).sort(function(a, b) {
    var aHeld = hSyms.indexOf(a.sym) >= 0, bHeld = hSyms.indexOf(b.sym) >= 0;
    if (aHeld !== bHeld) return aHeld ? -1 : 1;
    return a.score - b.score;
  });

  if (!isPro) {
    /* Build up to 4 real tiles — genuinely mixed types, not a forced
       "sell X for Y" shape:
       • held sell-zone coin + real buy target available  -> rotation pair
       • held sell-zone coin, NO qualifying buy target     -> standalone
         take-profit tile (the real signal, not discarded for a fake pair)
       • no held sell-zone coins at all                    -> standalone
         buy suggestions (the actual "what should I buy" answer) */
    var previewTiles = [];
    if (sells.length) {
      sells.forEach(function(s, i) {
        if (i < buys.length) previewTiles.push({ type: 'pair', sell: s, buy: buys[i] });
        else previewTiles.push({ type: 'profit', c: s });
      });
    }
    if (!previewTiles.length) {
      allBuys.slice(0, 4).forEach(function(b) { previewTiles.push({ type: 'buy', c: b }); });
    }
    previewTiles = previewTiles.slice(0, 4);

    function tileHtmlFor(t) {
      if (t.type === 'pair') return sigRotTile(t.sell, t.buy);
      if (t.type === 'profit') return takeProfitTile(t.c);
      return buySuggestTile(t.c);
    }

    /* Helper: blurred tile with a centred lock overlay, clicking opens Pro modal */
    function blurLockedTile(t) {
      return '<div class="sig-rot-locked" onclick="openPro()" title="Unlock with Pro">'
        + '<div class="sig-rot-blur">' + tileHtmlFor(t) + '</div>'
        + '<div class="sig-rot-lock-overlay">'
        + '<span style="font-size:14px;">⚡</span>'
        + '<span style="font-size:12px;font-weight:700;letter-spacing:.09em;color:var(--pro);">PRO</span>'
        + '</div>'
        + '</div>';
    }

    var gridHtml = '';
    previewTiles.forEach(function(t, idx) {
      if (idx === 0) {
        /* First tile: real, fully visible, clickable for detail */
        gridHtml += tileHtmlFor(t);
      } else if (idx === 1) {
        /* Second tile: single Pro unlock tile */
        gridHtml += proUnlockTile('unlock more');
      } else {
        /* Remaining tiles: plain placeholders */
        gridHtml += emptyPlaceholderTile();
      }
    });

    /* Always pad to exactly 4 slots with plain placeholders */
    var filledCount = previewTiles.length;
    if (filledCount === 1) gridHtml += proUnlockTile('unlock more');
    for (var pad = Math.max(filledCount, 2); pad < 4; pad++) {
      gridHtml += emptyPlaceholderTile();
    }

    sugEl.innerHTML = '<div class="sig-tiles-grid">' + gridHtml + '</div>' + provenProofLine();
    return;
  }

  /* Pro: full signals — genuinely mixed types, same logic as the free
     tier above but showing up to 4 real tiles instead of 1. */
  var proTiles = [];
  if (sells.length) {
    sells.forEach(function(s, i) {
      if (i < buys.length) proTiles.push({ type: 'pair', sell: s, buy: buys[i] });
      else proTiles.push({ type: 'profit', c: s });
    });
  }
  if (!proTiles.length) {
    allBuys.slice(0, 4).forEach(function(b) { proTiles.push({ type: 'buy', c: b }); });
  }
  proTiles = proTiles.slice(0, 4);

  if (!proTiles.length) {
    sugEl.innerHTML = '<div class="no-sug">Scanning — no buy-zone or sell-zone signals right now.</div>';
    return;
  }
  var rotHtml = proTiles.map(function(t) {
    if (t.type === 'pair') return sigRotTile(t.sell, t.buy);
    if (t.type === 'profit') return takeProfitTile(t.c);
    return buySuggestTile(t.c);
  }).join('');
  for (var rp = proTiles.length; rp < 4; rp++) rotHtml += emptyPlaceholderTile();
  sugEl.innerHTML = '<div class="sig-tiles-grid">' + rotHtml + '</div>' + provenProofLine();
}

/* ══════════════════════════════════════════════════════════════
   INSIGHT ENGINE 2.0 — 7-pillar forward-looking signals
   Pillars 1-2 use REAL Binance kline data (RSI, MACD, Bollinger)
   Only computed for holdings + watchlist coins to save resources.
   Attaches c.insight = { score, label, color, tooltip, signals }
══════════════════════════════════════════════════════════════ */

/* ── Binance kline cache & fetcher ─────────────────────────── */
var _klineCache = {};  /* sym → { ts, closes, volumes, rsi, macd, bb } */
var _klineTTL   = 10 * 60 * 1000;  /* 10 min cache */

function _calcRSI(closes, period) {
  if (closes.length < period + 1) return 50;
  var gains = 0, losses = 0;
  for (var i = 1; i <= period; i++) {
    var diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff; else losses -= diff;
  }
  var avgGain = gains / period, avgLoss = losses / period;
  for (var j = period + 1; j < closes.length; j++) {
    var d = closes[j] - closes[j - 1];
    avgGain = (avgGain * (period - 1) + (d > 0 ? d : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (d < 0 ? -d : 0)) / period;
  }
  if (avgLoss === 0) return 100;
  var rs = avgGain / avgLoss;
  return +(100 - 100 / (1 + rs)).toFixed(2);
}

function _calcEMA(arr, period) {
  var k = 2 / (period + 1), ema = [arr[0]];
  for (var i = 1; i < arr.length; i++) ema.push(arr[i] * k + ema[i - 1] * (1 - k));
  return ema;
}

function _calcMACD(closes) {
  if (closes.length < 26) return { line: 0, signal: 0, hist: 0 };
  var ema12 = _calcEMA(closes, 12);
  var ema26 = _calcEMA(closes, 26);
  var macdLine = ema12.map(function(v, i) { return v - ema26[i]; });
  var signalLine = _calcEMA(macdLine.slice(26), 9);
  var last = macdLine.length - 1;
  var sigLast = signalLine.length - 1;
  return {
    line:   macdLine[last],
    signal: signalLine[sigLast],
    hist:   macdLine[last] - signalLine[sigLast]
  };
}

function _calcBollinger(closes, period, mult) {
  if (closes.length < period) return { upper: 0, lower: 0, mid: 0, width: 0, pctB: 50 };
  var slice = closes.slice(-period);
  var sum = 0; for (var i = 0; i < slice.length; i++) sum += slice[i];
  var sma = sum / period;
  var sqSum = 0; for (var j = 0; j < slice.length; j++) sqSum += (slice[j] - sma) * (slice[j] - sma);
  var stdDev = Math.sqrt(sqSum / period);
  var upper = sma + mult * stdDev;
  var lower = sma - mult * stdDev;
  var lastP = closes[closes.length - 1];
  var pctB = (upper - lower) > 0 ? ((lastP - lower) / (upper - lower)) * 100 : 50;
  var width = sma > 0 ? ((upper - lower) / sma) * 100 : 0;
  return { upper: upper, lower: lower, mid: sma, width: width, pctB: pctB };
}

async function _fetchKlines(sym) {
  var now = Date.now();
  if (_klineCache[sym] && (now - _klineCache[sym].ts) < _klineTTL) return _klineCache[sym];
  try {
    var pair = sym + 'USDT';
    var url = 'https://api.binance.com/api/v3/klines?symbol=' + pair + '&interval=4h&limit=100';
    var resp = await fetch(url);
    if (!resp.ok) return null;
    var data = await resp.json();
    if (!Array.isArray(data) || data.length < 30) return null;
    var closes = data.map(function(k) { return parseFloat(k[4]); });
    var volumes = data.map(function(k) { return parseFloat(k[5]); });
    var result = {
      ts: now,
      closes: closes,
      volumes: volumes,
      rsi:  _calcRSI(closes, 14),
      macd: _calcMACD(closes),
      bb:   _calcBollinger(closes, 20, 2)
    };
    _klineCache[sym] = result;
    return result;
  } catch(e) {
    console.warn('[Insight] Kline fetch failed for ' + sym + ':', e.message);
    return null;
  }
}

/* ── Fetch klines for all holdings (called after data load) ── */
async function fetchInsightKlines() {
  /* Skip bStocks entirely — this hits api.binance.com directly from the
     browser (sym + 'USDT'), the exact CORS problem the whole bStocks
     migration moved server-side to avoid (see loadBstocks() in
     data-loaders.js). A stock's momentum data already comes from
     unified_market_data; there's no RSI/MACD/Bollinger equivalent for
     bStocks yet, so these rows just won't have the extra Insight stats
     for now rather than throwing a guaranteed-to-fail request. */
  var stockSyms = (typeof coins !== 'undefined') ? coins.filter(function(c) { return c.isStock; }).map(function(c) { return c.sym; }) : [];
  var hSyms = holdings.map(function(h) { return h.sym; }).filter(function(s) { return stockSyms.indexOf(s) < 0; });
  var wSyms = (typeof watchlist !== 'undefined') ? watchlist.filter(function(s) { return stockSyms.indexOf(s) < 0; }) : [];
  var targetSyms = hSyms.concat(wSyms.filter(function(s) { return hSyms.indexOf(s) < 0; }));
  /* Fetch in parallel, max 10 to respect rate limits */
  var batch = targetSyms.slice(0, 10);
  await Promise.all(batch.map(function(sym) { return _fetchKlines(sym); }));
  /* Re-run insights with fresh kline data */
  computeInsights();
}

function computeInsights() {
  var btc = coins.find(function(c) { return c.id === 'bitcoin'; }) || { p24: 0, p7: 0, p14: 0 };
  var fg  = (window.fearGreed && typeof window.fearGreed.value === 'number')
              ? window.fearGreed.value : 50;
  var fgLabel = (window.fearGreed && window.fearGreed.label) || 'Neutral';

  /* Only compute for holdings + watchlist coins */
  var hSyms = holdings.map(function(h) { return h.sym; });
  var wSyms = (typeof watchlist !== 'undefined') ? watchlist : [];
  var targetSyms = hSyms.concat(wSyms.filter(function(s) { return hSyms.indexOf(s) < 0; }));

  coins.forEach(function(c) { delete c.insight; }); /* clear old */

  targetSyms.forEach(function(sym) {
    var c = coins.find(function(x) { return x.sym === sym; });
    if (!c) return;

    var signals = [];
    var pts     = 0;
    var kd      = _klineCache[sym] || null;  /* Binance kline data if available */

    /* ── PILLAR 1: RSI Momentum (real if klines available, proxy if not) ── */
    var rsi = kd ? kd.rsi : Math.round((1 - (c.r30 - 1) / Math.max(coins.length - 1, 1)) * 100);
    var rsiLabel = kd ? 'RSI(' + rsi.toFixed(0) + ')' : 'RSI~' + rsi;

    if (rsi <= 25) {
      pts += 25;
      signals.push(rsiLabel + ' Oversold');
    } else if (rsi <= 38) {
      pts += 14;
      signals.push(rsiLabel + ' Low Momentum');
    } else if (rsi <= 45) {
      pts += 6;
      signals.push(rsiLabel + ' Cooling');
    } else if (rsi >= 78) {
      pts -= 22;
      signals.push(rsiLabel + ' Overbought');
    } else if (rsi >= 62) {
      pts -= 10;
      signals.push(rsiLabel + ' Hot Zone');
    } else if (rsi >= 55) {
      pts -= 4;
      signals.push(rsiLabel + ' Warming');
    }

    /* ── PILLAR 2: MACD Trend (real if klines, proxy if not) ── */
    if (kd && kd.macd) {
      var mHist = kd.macd.hist;
      if (kd.macd.line > kd.macd.signal && mHist > 0) {
        pts += 20;
        signals.push('MACD Bullish Cross');
      } else if (kd.macd.line < kd.macd.signal && mHist < 0) {
        pts -= 18;
        signals.push('MACD Bearish Cross');
      } else if (mHist > 0) {
        pts += 8;
      } else {
        pts -= 5;
      }
    } else {
      /* Proxy: compare p7 vs p14 and p7 vs p30 */
      var p7p14diff = (c.p7 || 0) - (c.p14 || 0);
      var p7p30diff = (c.p7 || 0) - (c.p30 || 0);
      if (p7p14diff > 5) { pts += 18; signals.push('Momentum Accelerating (+' + p7p14diff.toFixed(1) + '%)'); }
      else if (p7p14diff > 1.5) { pts += 8; signals.push('Momentum Building'); }
      else if (p7p14diff < -5) { pts -= 15; signals.push('Momentum Decelerating (' + p7p14diff.toFixed(1) + '%)'); }
      else if (p7p14diff < -1.5) { pts -= 6; signals.push('Momentum Fading'); }
      /* Extra signal: 30D trend divergence */
      if (p7p30diff > 8) { pts += 10; signals.push('Recovery Trend (+' + p7p30diff.toFixed(1) + '% vs 30D)'); }
      else if (p7p30diff < -8) { pts -= 8; signals.push('Weakening Trend (' + p7p30diff.toFixed(1) + '% vs 30D)'); }
    }

    /* ── PILLAR 3: Bollinger Bands Squeeze & Position (real if klines) ── */
    if (kd && kd.bb) {
      var bb = kd.bb;
      if (bb.width < 4) {
        pts += 18;
        signals.push('BB Squeeze (width ' + bb.width.toFixed(1) + '%) — Breakout Likely');
      } else if (bb.width > 20) {
        pts -= 5;
        signals.push('BB Wide — High Volatility');
      }
      if (bb.pctB < 10) {
        pts += 15;
        signals.push('Price at Lower Band (' + bb.pctB.toFixed(0) + '%B)');
      } else if (bb.pctB > 95) {
        pts -= 15;
        signals.push('Price at Upper Band (' + bb.pctB.toFixed(0) + '%B)');
      }
    }

    /* ── PILLAR 4: Volume Profile (real volumes if klines) ── */
    var volMcap = (c.volume24 && c.mcap) ? c.volume24 / c.mcap : 0;
    var priceStable = Math.abs(c.p24) < 3;
    if (kd && kd.volumes && kd.volumes.length >= 6) {
      /* Compare last 6 candles avg volume vs prior 20 candles */
      var recentVol = kd.volumes.slice(-6).reduce(function(a,b){return a+b;},0) / 6;
      var priorVol  = kd.volumes.slice(-26, -6).reduce(function(a,b){return a+b;},0) / Math.min(20, kd.volumes.length - 6);
      var volRatio  = priorVol > 0 ? recentVol / priorVol : 1;
      if (volRatio > 2 && priceStable) {
        pts += 25;
        signals.push('Volume Surge + Stable Price (Accumulation ' + volRatio.toFixed(1) + 'x)');
      } else if (volRatio > 1.8) {
        pts += 15;
        signals.push('Volume Breakout (' + volRatio.toFixed(1) + 'x avg)');
      } else if (volRatio < 0.3) {
        pts -= 8;
        signals.push('Volume Drying Up');
      }
    } else {
      /* Fallback to basic vol/mcap ratio */
      if (volMcap > 0.20 && priceStable) {
        pts += 25;
        signals.push('High Volume + Stable Price (Accumulation)');
      } else if (volMcap > 0.20) {
        pts += 12;
        signals.push('High Liquidity Interest');
      } else if (volMcap > 0.08 && priceStable) {
        pts += 8;
        signals.push('Moderate Volume Activity');
      } else if (volMcap > 0.08) {
        pts += 4;
      } else if (volMcap < 0.02 && c.mcap > 5e8) {
        pts -= 10;
        signals.push('Low Liquidity (Large Cap)');
      } else if (volMcap < 0.03) {
        pts -= 5;
        signals.push('Below-Average Volume');
      }
    }

    /* ── PILLAR 5: Dilution Shield (Supply Dynamics) ── */
    var circ = c.circulating_supply || 0;
    var maxS = c.max_supply || 0;
    var supplyRatio = (circ && maxS > 0) ? circ / maxS : -1;
    if (supplyRatio >= 0.85) {
      pts += 20;
      signals.push('Supply Cleared (' + Math.round(supplyRatio * 100) + '% Unlocked)');
    } else if (supplyRatio >= 0.50) {
      pts += 5;
    } else if (supplyRatio >= 0 && supplyRatio < 0.30) {
      pts -= 20;
      signals.push('High Dilution Risk (' + Math.round(supplyRatio * 100) + '% Unlocked)');
    }

    /* ── PILLAR 6: Contrarian Sentiment (Fear & Greed) ── */
    if (fg < 25) {
      pts += 25;
      signals.push('Extreme Fear (' + fg + ') — Contrarian Buy');
    } else if (fg < 40) {
      pts += 12;
      signals.push('Fear Zone (' + fg + ')');
    } else if (fg > 80) {
      pts -= 20;
      signals.push('Extreme Greed (' + fg + ') — Caution');
    } else if (fg > 65) {
      pts -= 8;
      signals.push('Greed Zone (' + fg + ')');
    }

    /* ── PILLAR 7: Relative Strength vs BTC ── */
    var btcP24 = btc.p24 || 0;
    var relStr = c.p24 - btcP24;
    if (btcP24 < -1 && c.p24 > 0) {
      pts += 28;
      signals.push('Hidden Strength vs BTC (' + (relStr >= 0 ? '+' : '') + relStr.toFixed(1) + '%)');
    } else if (relStr > 5) {
      pts += 18;
      signals.push('Outperforming BTC (+' + relStr.toFixed(1) + '%)');
    } else if (relStr > 2) {
      pts += 8;
      signals.push('Slight Edge vs BTC (+' + relStr.toFixed(1) + '%)');
    } else if (relStr < -5) {
      pts -= 18;
      signals.push('Underperforming BTC (' + relStr.toFixed(1) + '%)');
    } else if (relStr < -2) {
      pts -= 6;
      signals.push('Lagging BTC (' + relStr.toFixed(1) + '%)');
    }

    /* ── Normalise to 0–100 (symmetric: 0 pts = 50) ── */
    var maxPts = kd ? 176 : 140;
    var minPts = kd ? -176 : -140;
    var raw    = Math.min(maxPts, Math.max(minPts, pts));
    var normalised = Math.round(((raw - minPts) / (maxPts - minPts)) * 100);

    /* ── Label & colour ── */
    var label, color;
    if      (normalised >= 65) { label = 'BUY';     color = 'insight-buy';  }
    else if (normalised <= 35) { label = 'WARN';    color = 'insight-warn'; }
    else                       { label = 'NEUTRAL'; color = 'insight-neut'; }

    /* ── Tooltip text ── */
    var tooltip = signals.length
      ? signals.join(' · ')
      : 'No strong signals — monitoring';
    tooltip += ' | F&G: ' + fg + ' (' + fgLabel + ')';
    if (kd) tooltip += ' | Binance 4H data';

    c.insight = { score: normalised, label: label, color: color, tooltip: tooltip, signals: signals };
  });
}

/* ══════════════════════════════════════════════════════════════════
   Daily insight snapshot sync.

   Twofold job, runs lazily from renderAll():
     1. POST current insights to insight_snapshots — first-writer-of-day
        wins (server enforces via ON CONFLICT DO NOTHING).
     2. For free users: GET yesterday's snapshot map so the coin detail
        panel can render yesterday's insight instead of a hard paywall.

   All runs are gated by a session key (sessionStorage + in-memory) so
   opening the app in two tabs doesn't spam the RPC.
   ══════════════════════════════════════════════════════════════════ */
window.yesterdayInsights = window.yesterdayInsights || { date: null, map: {} };
var _insightSyncStarted = false;

function maybeSyncInsightSnapshots() {
  if (_insightSyncStarted) return;
  if (!coins || !coins.length) return;
  /* Make sure at least one coin has an insight computed — otherwise
     computeInsights hasn't run yet (e.g. very first boot frame). */
  var hasAny = coins.some(function(c) { return c.insight && typeof c.insight.score === 'number'; });
  if (!hasAny) return;
  _insightSyncStarted = true;

  /* ── 1. Post today's insights (session-guarded — once per tab) ── */
  postTodaysInsights();

  /* ── 2. Fetch yesterday's snapshot for free users only ── */
  if (!isPro && typeof supaLoadYesterdayInsights === 'function') {
    supaLoadYesterdayInsights().then(function(res) {
      window.yesterdayInsights = res || { date: null, map: {} };
      /* If a coin detail panel is open, re-render its insight section. */
      if (typeof _tdCoin !== 'undefined' && _tdCoin && typeof openTileDetail === 'function') {
        try { openTileDetail(_tdCoin); } catch (e) {}
      }
    });
  }
}

function postTodaysInsights() {
  if (typeof supaRecordInsights !== 'function') return;
  /* Session guard — one post per tab per day. */
  var today = new Date();
  var dStr  = today.getFullYear() + '-'
            + String(today.getMonth() + 1).padStart(2, '0') + '-'
            + String(today.getDate()).padStart(2, '0');
  var postedKey = 'rot_insights_posted';
  try {
    if (sessionStorage.getItem(postedKey) === dStr) return;
  } catch (e) {}

  var rows = [];
  coins.forEach(function(c) {
    if (!c || !c.insight || typeof c.insight.score !== 'number') return;
    rows.push({
      coin_id:  c.id,
      coin_sym: c.sym,
      price:    c.price != null ? c.price : null,
      insight: {
        score:   c.insight.score,
        label:   c.insight.label,
        color:   c.insight.color,
        signals: Array.isArray(c.insight.signals) ? c.insight.signals.slice(0, 12) : [],
        tooltip: c.insight.tooltip || ''
      }
    });
  });
  if (!rows.length) return;

  /* Small delay so we don't fight the initial render for CPU. */
  setTimeout(function() {
    supaRecordInsights(rows).then(function(res) {
      if (res && res.ok) {
        try { sessionStorage.setItem(postedKey, dStr); } catch (e) {}
      }
    });
  }, 1200);
}

/* ── Toggle watchlist from the leaderboard eye icon ────────── */
function toggleWatch(sym, btn) {
  if (typeof watchlist === 'undefined') return;
  var idx = watchlist.indexOf(sym);
  if (idx >= 0) {
    watchlist.splice(idx, 1);
    if (btn) { btn.classList.remove('watching'); btn.title = 'Add to watchlist'; }
  } else {
    watchlist.push(sym);
    if (btn) { btn.classList.add('watching'); btn.title = 'Watching'; }
  }
  if (typeof saveWatchlist === 'function') saveWatchlist();
  if (typeof renderWatchlist === 'function') renderWatchlist();
}

/* ══════════════════════════════════════════════════════════════
   LEADERBOARD TABLE
══════════════════════════════════════════════════════════════ */
/* ── Category visibility ─────────────────────────────────────── */
/* All categories are open to free & Pro users.                   */
/* Pro gating applies only to: Score column, Insight Engine,      */
/* Best-Time-to-Swap, and holdings limits (2 free / 10 Pro).      */

function initCategoryLocks() {
  document.querySelectorAll('.cat-tab').forEach(function(el) {
    var cat = el.dataset.cat;
    /* Hide DEMO tab for Pro users — it's for new/free users only */
    if (cat === 'demo') {
      el.style.display = isPro ? 'none' : '';
      return;
    }
    /* Remove any legacy locks — all categories are free */
    el.classList.remove('pro-locked');
    var lock = el.querySelector('.pro-lock-ico');
    if (lock) lock.remove();
  });
}

/* ── Category switching (lazy load) ───────────────────────────── */
async function switchCategory(cat) {
  if (cat === activeCategory) return;
  /* All categories open to everyone — Pro gating is on Score/Insights only */
  activeCategory = cat;
  /* Update tab UI */
  document.querySelectorAll('.cat-tab').forEach(function(el) {
    el.classList.toggle('active', el.dataset.cat === cat);
  });
  /* If category not loaded yet, fetch it */
  if (cat !== 'all' && !_loadedCategories[cat]) {
    /* Show skeleton while loading */
    var tbody = document.getElementById('tbody');
    if (tbody) {
      var skRows = '';
      for (var s = 0; s < 8; s++) {
        skRows += '<tr class="skel-tr"><td></td>'
          + '<td><div class="skel-row"><div class="skel skel-ico"></div><div class="skel skel-name"></div></div></td>'
          + '<td><div class="skel skel-val" style="margin:auto"></div></td>'
          + '<td><div class="skel skel-val" style="margin:auto"></div></td>'
          + '<td><div class="skel skel-val" style="margin:auto"></div></td>'
          + '<td><div class="skel skel-val" style="margin:auto"></div></td>'
          + '<td><div class="skel skel-val" style="margin:auto"></div></td>'
          + '<td><div class="skel skel-val" style="margin:auto"></div></td>'
          + '</tr>';
      }
      tbody.innerHTML = skRows;
    }
    await loadCoins(cat);
    runSignalEngine();
    window.coins = coins;
  } else if (cat === 'all' && !_loadedCategories['all']) {
    var tbody = document.getElementById('tbody');
    if (tbody) {
      var skRows = '';
      for (var s = 0; s < 15; s++) {
        skRows += '<tr class="skel-tr"><td></td>'
          + '<td><div class="skel-row"><div class="skel skel-ico"></div><div class="skel skel-name"></div></div></td>'
          + '<td><div class="skel skel-val" style="margin:auto"></div></td>'
          + '<td><div class="skel skel-val" style="margin:auto"></div></td>'
          + '<td><div class="skel skel-val" style="margin:auto"></div></td>'
          + '<td><div class="skel skel-val" style="margin:auto"></div></td>'
          + '<td><div class="skel skel-val" style="margin:auto"></div></td>'
          + '<td><div class="skel skel-val" style="margin:auto"></div></td>'
          + '</tr>';
      }
      tbody.innerHTML = skRows;
    }
    await loadCoins('all');
    runSignalEngine();
    window.coins = coins;
  }
  renderTable();
  renderCoinSel();
}

function renderTable() {
  var body = document.getElementById('tbody');
  if (!coins.length) return;

  /* Filter by active category */
  var DEMO_IDS = ['bitcoin','ethereum','binancecoin','solana','cardano','ripple','polkadot','avalanche-2','chainlink','dogecoin'];
  var catCoins;
  if (activeCategory === 'demo') {
    catCoins = coins.filter(function(c) { return DEMO_IDS.indexOf(c.id) >= 0; });
  } else if (activeCategory === 'all') {
    /* 'ALL' means all crypto — bStocks are a separate filterable category
       (see migration plan Step 2), not blended into the crypto leaderboard. */
    catCoins = coins.filter(function(c) { return !c.isStock; });
  } else if (activeCategory === 'stocks') {
    catCoins = coins.filter(function(c) { return c.isStock; });
  } else {
    catCoins = coins.filter(function(c) { return (COIN_CATEGORIES[c.id] || 'other') === activeCategory; });
  }

  var sorted = catCoins.sort(function(a, b) {
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
    var circSup = c.circulating_supply || 0;
    var maxSup  = c.max_supply || 0;
    var unlockPct = (circSup && maxSup && maxSup > 0) ? Math.round((circSup / maxSup) * 100) : -1;
    var tipData = 'data-sym="' + c.sym + '" data-name="' + c.name + '" data-mcap="' + mcapStr + '" data-score="' + sc + '" data-p24="' + c.p24.toFixed(2) + '" data-p7="' + c.p7.toFixed(2) + '" data-p30="' + c.p30.toFixed(2) + '" data-held="' + (isH ? '1' : '0') + '" data-circ="' + circSup + '" data-maxsup="' + maxSup + '" data-unlock="' + unlockPct + '"';
    var isW = (typeof watchlist !== 'undefined') && watchlist.indexOf(c.sym) >= 0;
    var eyeSvg = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
    var qaBtnHtml = isH
      ? '<button class="qa-btn held" title="In holdings" onclick="event.stopPropagation()">✓</button>'
      : '<button class="qa-btn watch-eye' + (isW ? ' watching' : '') + '" title="' + (isW ? 'Watching' : 'Add to watchlist') + '" onclick="event.stopPropagation();toggleWatch(\'' + c.sym + '\',this)">' + eyeSvg + '</button>';

    /* ── Stablecoin APR display / bStock badge ── */
    var stableTag = '';
    var col24, col7, col14, col30, colScore;
    if (c.isStable) {
      stableTag = '<span class="htag" style="background:#2a6e4e;color:#8dffc0;margin-left:4px;">STABLE</span>';
      var aprStr = '<span style="color:#8dffc0;font-size:12px;" title="Estimated DeFi lending/staking APR on ' + c.aprPlatform + '">' + c.apr.toFixed(1) + '% <span style="font-size:12px;opacity:.7;">APR</span></span>';
      col24  = '<td class="pc">' + aprStr + '</td>';
      col7   = '<td class="pc" style="text-align:center;"><span style="color:var(--muted);font-size:12px;" title="' + c.aprPlatform + '">' + c.aprPlatform.split(' / ')[0] + '</span></td>';
      col14  = '<td class="pc" style="text-align:center;"><span style="color:var(--muted);font-size:12px;">~$1.00</span></td>';
      col30  = '<td class="pc" style="text-align:center;"><span style="color:var(--muted);font-size:12px;">PEG</span></td>';
      colScore = '<td class="r" data-label="SCORE"><div class="sw"><span class="sv" style="color:#8dffc0;">YIELD</span></div></td>';
    } else if (c.isStock) {
      /* bStock rows: honest partial score — momentum only, no tokenomics
         (UNLOCK %/whale SENT are meaningless for equities). Badge makes
         clear these are tokenized certificates, not crypto — see the
         migration plan's Step 2 note on Binance's own risk disclosures
         (liquidity, issuer, custody, broker risk). */
      stableTag = '<span class="htag" style="background:transparent;color:var(--muted);border:1px solid var(--bdr);margin-left:4px;font-weight:400;" title="Binance bStock — a tokenized certificate tracking the price of ' + c.name + ', not direct share ownership.">🏛 stock</span>';
      col24  = '<td class="pc" data-label="24H">' + pctSpan(c.p24) + '</td>';
      col7   = '<td class="pc" data-label="7D">'  + pctSpan(c.p7)  + '</td>';
      col14  = '<td class="pc" data-label="14D">' + pctSpan(c.p14) + '</td>';
      col30  = '<td class="pc" data-label="30D">' + pctSpan(c.p30) + '</td>';
      colScore = '<td class="r" data-label="SCORE" title="Partial score: momentum only (max 70). No tokenomics data applies to equities — not directly comparable to a crypto score."><div class="sw"><span class="sv" style="color:' + scC + ';">' + sc + '</span><div class="sb"><div class="sbf" style="width:' + Math.max(2, sc) + '%;background:' + scC + ';"></div></div><span style="font-size:12px;color:var(--muted);margin-left:3px;">MOM</span></div></td>';
    } else if (isPro) {
      col24  = '<td class="pc" data-label="24H">' + pctSpan(c.p24) + '</td>';
      col7   = '<td class="pc" data-label="7D">' + pctSpan(c.p7)  + '</td>';
      col14  = '<td class="pc" data-label="14D">' + pctSpan(c.p14) + '</td>';
      col30  = '<td class="pc" data-label="30D">' + pctSpan(c.p30) + '</td>';
      colScore = '<td class="r" data-label="SCORE"><div class="sw"><span class="sv" style="color:' + scC + ';">' + sc + '</span><div class="sb"><div class="sbf" style="width:' + Math.max(2, sc) + '%;background:' + scC + ';"></div></div></div></td>';
    } else {
      /* Free users: all % columns visible, only Score gated */
      col24  = '<td class="pc" data-label="24H">' + pctSpan(c.p24) + '</td>';
      col7   = '<td class="pc" data-label="7D">' + pctSpan(c.p7)  + '</td>';
      col14  = '<td class="pc" data-label="14D">' + pctSpan(c.p14) + '</td>';
      col30  = '<td class="pc" data-label="30D">' + pctSpan(c.p30) + '</td>';
      colScore = '<td class="r pro-blur-cell" data-label="SCORE" onclick="event.stopPropagation();openPro()" title="Unlock Rotator Score with Pro"><div class="pro-blur-wrap"><div class="sw"><span class="sv" style="color:var(--muted);">' + sc + '</span><div class="sb"><div class="sbf" style="width:' + Math.max(2, sc) + '%;background:var(--muted);"></div></div></div></div><span class="pro-blur-lock">🔒</span></td>';
    }

    return '<tr class="' + (isH ? 'held' : '') + (c.isStable ? ' stable-row' : '') + (c.isStock ? ' stock-row' : '') + '" ' + tipData + ' onmouseenter="showRowTip(this,event)" onmouseleave="hideTip()" onclick="openTileDetail(\'' + c.id + '\',event)">'
      + '<td class="qa-cell">' + qaBtnHtml + '</td>'
      + '<td style="color:var(--muted);font-size:11px;opacity:.5;">' + (i+1) + '</td>'
      + '<td><div class="cc"><div class="ti"><img src="' + c.image + '" alt="' + c.sym + ' logo" loading="lazy" width="18" height="18" onerror="this.style.display=\'none\'"></div><div><div style="display:flex;align-items:center;"><span class="tsym">' + c.sym + '</span>' + (isH ? '<span class="htag">HELD</span>' : '') + stableTag + '</div><div class="tname">' + (c.name.length > 17 ? c.name.slice(0,15) + '…' : c.name) + '</div></div></div></td>'
      + '<td class="r price-col" data-label="PRICE">' + fmtP(c.price) + '</td>'
      + col24 + col7 + col14 + col30 + colScore
      + '</tr>';
  }).join('');

  if (!isPro && proCoins.length) {
    html += '<tr class="pro-upsell-row"><td colspan="9"><div class="pro-upsell-banner">'
      + '<div class="pub-left"><span class="pub-icon">⚡</span><div><div class="pub-txt">+' + proCoins.length + ' more coins available in Pro</div><div class="pub-sub">Share with 5 friends or pay $20 crypto — instant unlock</div></div></div>'
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
var _klinesFetched = false;
function renderAll() {
  /* Macro risk gate — suppresses BUY-side alerts (Telegram, and any
     future in-app "safe to buy" badge) when broad conditions favor
     caution, independent of any single coin's own score.
       · Fear & Greed > 70 (Greed/Extreme Greed)
       · DXY up >2% over 7d (dollar strength headwind for crypto)
       · Oil up >5% over 7d (risk-off proxy — no absolute oil price
         feed exists in this project, only % 7d change via _macroData,
         so this is a % proxy for the originally-requested ">$95"
         absolute threshold; swap in a real price feed if you wire one
         in later) */
  var fg     = (typeof window.fearGreed === 'object' && window.fearGreed) ? window.fearGreed.value : 50;
  var oilHot = (typeof _macroData !== 'undefined' && _macroData.oilP7 != null) && _macroData.oilP7 > 5;
  var dxyHot = (typeof _macroData !== 'undefined' && _macroData.dxyP7 != null) && _macroData.dxyP7 > 2;
  window.safeToBuy = !(fg > 70 || oilHot || dxyHot);

  computeInsights();
  maybeSyncInsightSnapshots();
  renderBTC(); renderTiles(); renderTopBars(); renderTable(); renderCoinSel(); updateTierBadge(); if (typeof initCategoryLocks === 'function') initCategoryLocks(); if (typeof updateProGates === 'function') updateProGates();
  /* Async: fetch Binance klines for holdings to enrich Insight Engine */
  if (holdings.length && !_klinesFetched) {
    _klinesFetched = true;
    fetchInsightKlines().then(function() {
      /* Re-render insight sections in tile detail if open */
      renderTopBars();
    }).catch(function(e) { console.warn('[Insight] Kline enrich failed:', e); });
  }
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
  renderDonationBar('sidebar-goal-left');
  /* Signal Track Record — snapshot + render */
  if (typeof SignalHistory !== 'undefined') {
    SignalHistory.takeSnapshot();
    SignalHistory.render();
    /* Update accuracy badge */
    var stats = SignalHistory.getAccuracyStats();
    var badge = document.getElementById('str-accuracy-badge');
    if (badge && stats) {
      badge.textContent = stats.accuracy + '% accuracy';
      badge.className = 'str-section-badge ' + (stats.accuracy >= 65 ? 'good' : stats.accuracy >= 50 ? 'mid' : 'low');
      badge.style.display = '';
    }
  }
  document.getElementById('ts').textContent = 'UPDATED ' + now.toLocaleTimeString('en-US', {hour:'2-digit', minute:'2-digit', second:'2-digit'}) + suffix;
  /* Sync three-panel vertical alignment after every render */
  requestAnimationFrame(function() {
    if (typeof syncPanelAlignment === 'function') syncPanelAlignment();
  });
}
