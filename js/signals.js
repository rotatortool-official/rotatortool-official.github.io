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
  return (typeof RotatorEngine !== 'undefined')
    ? RotatorEngine.internals.adaptiveThresholds()
    : null;
}

function _passesMeanRevGate(c) {
  return (typeof RotatorEngine !== 'undefined')
    ? RotatorEngine.internals.passesMeanRevGate(c)
    : false;
}

/* ── Delegates to the canonical engine ───────────────────────────────
   The site no longer holds a copy of the scoring maths. Until 2026-09-06
   these bodies lived here and build.js lifted them verbatim into
   rotator-engine/engine.js; the direction is now inverted and engine.js
   is the source. See promptove/23-build-js-inversion-plan.md.

   Neutral returns if the engine script is missing: the page is already
   broken at that point (runSignalEngine reports it loudly), and a
   delegate that guesses would be a second copy of the maths by the back
   door. passesMeanRevGate fails CLOSED — no engine, nothing reaches a
   buy list.

   _quickInsight() was here too, delegating to the engine's forward-looking
   proxy. Both are gone as of engine 2.3.0: the proxy derived an
   "RSI-style" reading from a coin's position in the 30-day return
   ranking, and the pillars that replaced it read the real thing. Nothing
   on the page called this delegate — _classifyZones() left the site in
   2026-09-06's Step B — so removing it removes a name, not a behaviour.
   See ARCHITECTURE-MAP.md gap 1. */

/* Classify every coin's zone with hysteresis + adaptive bands.
   Sets c._zone ∈ {'buy','sell','neutral'} and persists to localStorage. */
/* _classifyZones lived here. Removed 2026-09-06: zones now arrive with
   the engine run (runSignalEngine in data-loaders.js) or from the server
   row, and a second in-page classifier could only ever disagree with
   them. See promptove/23. */

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
    ? RotatorEngine.internals.adaptiveThresholds : _adaptiveThresholds,
  /* Exposed so the daily snapshot recorder applies the SAME candidate
     test the rotation panel does, rather than growing its own. Reads
     c._candidateClass, which the engine set — see _isPresentable(). */
  isPresentable: _isPresentable
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

/* ── Tradability gate for BUY suggestions ────────────────────────
   A coin can score well and still be something nobody can actually get
   into. The engine already decides this — _eligibility() in
   rotator-engine applies a $250k/24h liquidity floor plus a market-cap
   sanity check that catches migrated/delisted tokens reporting real
   volume but no market cap (FTM after Sonic, OMNI, CFG).

   That verdict reached signal_run_items and was used by the Telegram
   bot, but never by this page: the buy lists below filtered on zone,
   mean-reversion and the delisted set only. The golden-fixture harness
   made the gap visible on 2026-09-06 — site and bot shared identical
   scores yet had ZERO overlap in their rotate-in lists, because the
   site was surfacing CFG (no market cap) and DEXT (~$97k/day) while the
   bot's own liquidity check refused them.

   Deliberately fails OPEN: a coin the run doesn't cover (bStocks, or
   anything outside its universe) has no verdict and is left alone,
   rather than being silently dropped from the UI. */
function _isTradable(c) {
  return c && c._eligible !== false;
}

/* "May this be presented as a NEW entry" — the engine's candidate
   classification (2.2.0), read here and never re-derived. It is the
   third of three separate questions the buy list asks, and they are kept
   separate on purpose:

     _passesMeanRevGate  is this a pullback at all
     _isTradable         can anyone actually get in and out
     _isPresentable      has it stopped falling, does RSI agree, and has
                         it not already made its move

   Before this existed the third question was not asked. On the frozen
   fixture day the published buy list carried ICX at +46.8% in 24 hours,
   ranked as a normal buy because everything else about it scored well.

   The thresholds behind the answer — 40% for an extreme daily move, RSI
   45 for oversold confirmation, the falling-knife gap — live in the
   engine's CANDIDATE_RULES. None of them appear in this file, and none
   should ever be copied into it.

   Fails OPEN, exactly like _isTradable(): a coin the run gives no class
   (a server run older than 2.2.0, or a coin outside the universe) is
   left alone rather than silently dropped. A stale run degrades to the
   previous behaviour instead of emptying the panel. */
function _isPresentable(c) {
  return !!c && (c._candidateClass == null || c._candidateClass === 'CANDIDATE');
}

/* Exchange-flagged exclusions for the BUY side.
   Two separate Binance signals, deliberately checked together because
   every buy-side filter wants both:

     delistedSymbols   — the USDT pair has already stopped trading
                         (status != TRADING in exchangeInfo).
     monitoringSymbols — still trading, but carrying Binance's
                         Monitoring Tag: volatility/risk materially
                         above listing standards, under periodic review
                         for possible delisting.

   The second is not a subset of the first. When measured on 2026-09-06
   all 32 Monitoring-tagged USDT pairs were status='TRADING', so the
   delisted check caught none of them — which is how SYN and GLMR kept
   reaching the rotation suggestions.

   BUY SIDE ONLY. A flagged coin you already hold still gets scored and
   still shows its relative performance; hiding it would conceal a
   position rather than protect it. Same reasoning as the sell-side note
   further down.

   Both Sets fail open (empty when their fetch fails), so a Supabase
   outage degrades to "no exclusions", never to "everything excluded".
   The typeof guards matter: signals.js is also loaded by the golden-
   fixture harness, where data-loaders.js may not be present at all. */
function _isExchangeFlagged(c) {
  if (!c || !c.sym) return false;
  if (typeof delistedSymbols   !== 'undefined' && delistedSymbols.has(c.sym))   return true;
  if (typeof monitoringSymbols !== 'undefined' && monitoringSymbols.has(c.sym)) return true;
  return false;
}

/* ══ METRIC LENSES ═══════════════════════════════════════════════════
   The vertical counterpart to the horizontal category tabs. Categories
   answer "what is this asset"; lenses answer "how is it behaving". The
   two are independent, so "DEFI coins ranked by long/short skew" falls
   out of picking one from each.

   Every value is read from data already in the page — _futuresBySym and
   coinTechnicals, both loaded once on boot. Selecting a lens costs no
   request.

   A coin with no reading is NOT a cold cell. ~50 of the tracked coins
   have no Binance USDT pair and can never have open interest or RSI;
   painting them at the bottom of a heatmap would invent a signal nobody
   measured. They render hollow and sort last. */
var activeLens = null;

var LENSES = [
  { id: 'oi',    label: 'OI',    tip: 'Open interest, USD — size of outstanding futures positions.',
    get: function(c) { var f = _futuresBySym[c.sym]; return f && f.open_interest_value != null ? +f.open_interest_value : null; },
    fmt: function(v) { return v >= 1e9 ? '$' + (v/1e9).toFixed(1) + 'B' : v >= 1e6 ? '$' + (v/1e6).toFixed(0) + 'M' : '$' + (v/1e3).toFixed(0) + 'K'; },
    dir: 'high' },
  { id: 'oi24',  label: 'OIΔ',   tip: 'Open interest change over 24h, %. Rising OI with rising price = new money; rising OI with falling price = new shorts.',
    get: function(c) { var f = _futuresBySym[c.sym]; return f && f.oi_change_24h_pct != null ? +f.oi_change_24h_pct : null; },
    fmt: function(v) { return (v >= 0 ? '+' : '') + v.toFixed(1) + '%'; },
    dir: 'signed' },
  { id: 'ls',    label: 'L/S',   tip: 'Global long/short account ratio. Above 1 = more accounts long. Crowding, not a forecast.',
    get: function(c) { var f = _futuresBySym[c.sym]; return f && f.long_short_ratio != null ? +f.long_short_ratio : null; },
    fmt: function(v) { return v.toFixed(2); },
    dir: 'high' },
  { id: 'fund',  label: 'FND',   tip: 'Funding rate. Positive = longs paying shorts.',
    get: function(c) { var f = _futuresBySym[c.sym]; return f && f.funding_rate != null ? +f.funding_rate * 100 : null; },
    fmt: function(v) { return (v >= 0 ? '+' : '') + v.toFixed(3) + '%'; },
    dir: 'signed' },
  { id: 'rsid',  label: 'RSI·D', tip: 'Wilder RSI(14) on daily candles. Computed server-side.',
    get: function(c) { var t = coinTechnicals[c.sym]; return t && t.rsiD != null ? t.rsiD : null; },
    fmt: function(v) { return v.toFixed(0); },
    dir: 'rsi' },
  { id: 'rsiw',  label: 'RSI·W', tip: 'Wilder RSI(14) on weekly closes. Computed server-side.',
    get: function(c) { var t = coinTechnicals[c.sym]; return t && t.rsiW != null ? t.rsiW : null; },
    fmt: function(v) { return v.toFixed(0); },
    dir: 'rsi' }
];

/* Colour for one reading.
   'rsi'    — fixed 0-100 scale, so 70 always looks the same day to day.
   'signed' — diverging around zero; the sign is the meaning.
   'high'   — relative to the coins currently on screen, since open
              interest has no natural ceiling. */
function _lensColor(lens, v, lo, hi) {
  if (v == null) return null;
  var t;
  if (lens.dir === 'rsi') {
    t = Math.max(0, Math.min(1, v / 100));
  } else if (lens.dir === 'signed') {
    var m = Math.max(Math.abs(lo), Math.abs(hi)) || 1;
    t = 0.5 + (v / m) * 0.5;
  } else {
    t = hi > lo ? (v - lo) / (hi - lo) : 0.5;
  }
  t = Math.max(0, Math.min(1, t));
  /* Red (cold/low) -> amber -> green (hot/high). Same ramp as the score
     bar so a user is not learning a second colour language. */
  var hue = 4 + t * 136;
  return 'hsl(' + hue.toFixed(0) + ',72%,' + (46 + t * 6).toFixed(0) + '%)';
}

function setLens(id) {
  activeLens = (activeLens === id) ? null : id;
  renderTable();
  renderLensRail();
}

function renderLensRail() {
  var panel = document.getElementById('crypto-panel');
  if (!panel) return;
  var table = panel.querySelector('table');
  if (!table) return;

  /* Wrap the table once so the rail can sit beside it without touching
     the stylesheet or the table's own horizontal scrolling. */
  var wrap = document.getElementById('lens-wrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'lens-wrap';
    wrap.style.cssText = 'display:flex;align-items:flex-start;gap:6px;width:100%;';
    var scroller = document.createElement('div');
    scroller.style.cssText = 'flex:1 1 auto;min-width:0;overflow-x:auto;';
    panel.insertBefore(wrap, table);
    wrap.appendChild(scroller);
    scroller.appendChild(table);
  }

  var rail = document.getElementById('lens-rail');
  if (!rail) {
    rail = document.createElement('div');
    rail.id = 'lens-rail';
    rail.style.cssText = 'flex:0 0 auto;display:flex;flex-direction:column;gap:3px;'
      + 'position:sticky;top:8px;padding-top:2px;';
    wrap.insertBefore(rail, wrap.firstChild);
  }

  rail.innerHTML = LENSES.map(function(l) {
    var on = activeLens === l.id;
    return '<button onclick="setLens(\'' + l.id + '\')" title="' + l.tip.replace(/"/g,'&quot;') + '"'
      + ' style="writing-mode:vertical-rl;text-orientation:mixed;'
      + 'padding:9px 3px;border-radius:4px;cursor:pointer;font-size:10px;letter-spacing:.09em;'
      + 'font-family:var(--font-mono);border:1px solid ' + (on ? 'var(--bnb)' : 'var(--bdr)') + ';'
      + 'background:' + (on ? 'rgba(240,185,11,.14)' : 'var(--bg2)') + ';'
      + 'color:' + (on ? 'var(--bnb)' : 'var(--muted)') + ';">' + l.label + '</button>';
  }).join('')
  + (activeLens
      ? '<button onclick="setLens(null)" title="Clear lens — back to score order"'
        + ' style="margin-top:4px;padding:6px 3px;border-radius:4px;cursor:pointer;font-size:11px;'
        + 'border:1px solid var(--bdr);background:var(--bg2);color:var(--muted);">×</button>'
      : '');
}

/* ── Cross badge, rendered after the coin symbol ────────────────────
   ✨ golden = fast MA above slow, ☠ death = fast below.

   The periods are named in the tooltip on purpose. This is a 60/125
   cross, not the classic 50/200, and a badge that says "golden cross"
   without saying which two lines crossed is a claim the data does not
   support.

   The grey suffix is the age of the flip. It is only shown when the flip
   is actually datable: with a 125-bar MA inside a 140-bar window only
   the last ~15 days have a slow MA at all, so an older cross is real but
   undatable. Those render the state with no age rather than a guess —
   `cross_days_ago` is null and we say nothing rather than something
   wrong. */
function crossBadge(c) {
  if (!c || !c.sym || typeof coinTechnicals === 'undefined') return '';
  var t = coinTechnicals[c.sym];
  if (!t || !t.cross) return '';

  var golden = t.cross === 'golden';
  var icon   = golden ? '✨' : '☠';
  var color  = golden ? 'var(--green)' : 'var(--red)';

  var age = '';
  if (t.crossDays != null) {
    age = '<span style="color:var(--muted);font-size:10px;margin-left:3px;opacity:.75;">'
        + (t.crossDays === 0 ? 'today' : t.crossDays + 'd')
        + '</span>';
  }

  var tip = (golden ? 'Golden cross' : 'Death cross')
    + ' — the 60-day average is ' + (golden ? 'above' : 'below') + ' the 125-day average.'
    + (t.crossDays != null
        ? ' Crossed ' + (t.crossDays === 0 ? 'today' : t.crossDays + ' day' + (t.crossDays === 1 ? '' : 's') + ' ago') + '.'
        : ' The cross happened before the stored window, so its date is not known.')
    + ' Descriptive of past price only.';

  return '<span class="cross-badge" title="' + tip.replace(/"/g, '&quot;') + '"'
    + ' style="margin-left:4px;font-size:11px;color:' + color + ';white-space:nowrap;">'
    + icon + age + '</span>';
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
  var badgeText = isHeld ? 'ALREADY HELD' : 'ROTATION SETUP';
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
    + (isHeld ? '<div style="font-size:11px;color:var(--muted);margin-top:6px;">Already in your holdings — still showing the same relative-weakness setup.</div>' : '')
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
  return '<div class="proof-line" onclick="if(typeof SignalHistory!==\'undefined\')SignalHistory.shareProven(\'' + p.id + '\')" title="Click to share this observation">'
    + '<span style="color:var(--green);">✓ On the record —</span> '
    + p.daysAgo + 'd ago Rotator flagged <b>' + p.sym + '</b> at ' + fmtP(p.priceThen)
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
      + '<span class="sig-tile-badge rot" style="background:rgba(255,69,96,.12);color:var(--red);">OUTPERFORMING</span>'
    + '</div>'
    + '<div class="sig-tile-stats">'
      + '<div class="sig-stat"><span class="sig-stat-l">SCORE</span><span class="sig-stat-v am">' + c.score + '</span></div>'
      + '<div class="sig-stat"><span class="sig-stat-l">30D</span><span class="sig-stat-v ' + (c.p30 >= 0 ? 'up' : 'dn') + '">' + (c.p30 >= 0 ? '+' : '') + c.p30.toFixed(1) + '%</span></div>'
    + '</div>'
    + '<div style="font-size:11px;color:var(--muted);margin-top:6px;line-height:1.4;">Held, and well ahead of the tracked market over 30 days. No rotation target is implied — open it to see what is driving the move.</div>'
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

  return '<div class="sig-tile rot" onclick="openTileDetail(\'' + buy.id + '\',event)" title="Click for details">'
    + '<div class="sig-tile-top">'
      + '<div class="sig-tile-ico"><img src="' + sell.image + '" alt="' + sell.sym + ' logo" loading="lazy" width="20" height="20" onerror="this.style.display=\'none\'"></div>'
      + '<span class="sig-tile-sym" style="color:var(--red);">'   + sell.sym + '</span>'
      + '<span style="color:var(--muted);font-size:12px;">→</span>'
      + '<div class="sig-tile-ico"><img src="' + buy.image + '" alt="' + buy.sym + ' logo" loading="lazy" width="20" height="20" onerror="this.style.display=\'none\'"></div>'
      + '<span class="sig-tile-sym" style="color:var(--green);">' + buy.sym  + '</span>'
      + '<span class="sig-tile-badge rot">Δ' + delta + '</span>'
    + '</div>'
    + '<div class="sig-tile-stats">'
      + '<div class="sig-stat"><span class="sig-stat-l">TO SENT</span><span class="sig-stat-v ' + buySentCls + '">' + buySentLabel + '</span></div>'
      + '<div class="sig-stat"><span class="sig-stat-l">UNLOCK</span><span class="sig-stat-v am">' + bUnlock + '</span></div>'
      + '<div class="sig-stat"><span class="sig-stat-l">SCR DELTA</span><span class="sig-stat-v am">' + sell.score + '→' + buy.score + '</span></div>'
    + '</div>'
    + '</div>';
}

/* How many tiles the Rotation column renders. The other two columns
   document .slice(0, 6) in the file header as their knob; this is
   Rotation's, and it is the SAME number for both tiers — Free renders
   one of them for real and locks the rest, but it must build the same
   list, or the two tiers can disagree about what the run said. */
var ROT_TILE_SLOTS = 4;

/* ── The rotation tile list — ONE builder, both tiers ──────────────────
   Free and Pro each carried their own copy of this construction:
   identical, eleven lines, twice. Two copies of a list that decides what
   the front page recommends is the same shape of defect the engine
   extraction spent three releases removing, one level down.

   WHAT CHANGED. The old code only reached the buy candidates when the
   holdings side had produced NOTHING at all:

       if (!tiles.length) { allBuys.slice(0, 4) ... }

   So a single sell-zone holding capped the entire panel at one tile, and
   the three empty slots beside it read as "the market has nothing to
   offer" when what they actually meant was "you hold one overheated
   coin". An inventory fact rendered as a market fact — and the reason
   two browsers on the SAME run disagreed on 2026-09-08: holding INJ
   (score 76, RSI 73.1, sell zone) collapsed the panel to one tile, while
   holding nothing fell through to the fallback and offered JTO.

   Now the holdings tiles take their slots first — a rotate-out signal
   concerns money already at risk, so it outranks a suggestion — and
   every slot they do not need is filled with real buy candidates
   instead of a placeholder.

   Coins already on screen as the buy leg of a pair are sorted LAST
   rather than dropped. On a normal day the spare slots show different
   coins and this never triggers; when the candidate list is one coin
   deep — run 308: JTO was the only one of 195 to survive the classifier
   — a repeat says more than a blank does.

   NOT a scoring change, and deliberately not a place where one could
   hide. Every coin here was already filtered by the caller through
   _passesMeanRevGate / _isTradable / _isPresentable / _isExchangeFlagged;
   this function only chooses which of those survivors get the slots. It
   reads no globals and touches no DOM, so verify-rotation-tiles.js runs
   this exact function rather than a retyped approximation of it. */
function _buildRotationTiles(sells, buys, allBuys, slots) {
  var tiles = [];
  var sl = (typeof slots === 'number' && slots > 0) ? slots : 4;
  var bl = buys || [];

  /* 1. Holdings first — a sell-zone coin paired with a buy target, or a
        standalone take-profit tile when there is no target left to pair
        it with (the real signal, not discarded for a fake pair). */
  (sells || []).forEach(function(s, i) {
    if (i < bl.length) tiles.push({ type: 'pair', sell: s, buy: bl[i] });
    else tiles.push({ type: 'profit', c: s });
  });
  tiles = tiles.slice(0, sl);

  /* 2. Fill what is left with buy candidates — ones not already on
        screen ahead of ones that are. */
  var onScreen = {};
  tiles.forEach(function(t) { if (t.buy) onScreen[t.buy.sym] = true; });
  var fresh = [], repeats = [];
  (allBuys || []).forEach(function(c) { (onScreen[c.sym] ? repeats : fresh).push(c); });
  fresh.concat(repeats).forEach(function(c) {
    if (tiles.length < sl) tiles.push({ type: 'buy', c: c });
  });

  return tiles;
}

/* Render all three signal columns */
function renderTopBars() {
  /* No re-run here any more (Step B). Zone/score are server-authoritative
     for crypto now (see runSignalEngine() in data-loaders.js) and don't
     change on a render — the old re-run existed only to reapply the
     insight↔zone cross-link with a visitor's own rich Insight score, a
     per-visitor effect this migration deliberately removed. The insight
     BADGE itself (coin.insight, rendered in ui.js) is untouched and needs
     no re-run: it's just read off coins[] here like everything else. */
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
    /* SIX, not four. The three signal columns share a row, so the tallest
       sets the height — and Rotation is the tall one: its tile carries a
       sentence of explanation while a momentum tile is four compact stats.
       Four tiles fill two rows against Rotation's two taller ones, leaving
       a third row of dead space in the middle of the screen. Six fills it
       with real coins instead of nothing. Measured 2026-09-08 at 2371px:
       184px of content in a 236px column. The file header has always
       documented .slice(0, 6) as the knob; this is it being turned. */
    var worstTiles = worstAll.slice(0, 6).map(function(c) { return sigTile(c, 'wrst'); }).join('');
    for (var wp = worstAll.slice(0, 6).length; wp < 6; wp++) worstTiles += emptyPlaceholderTile();
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
  var momAll  = coins.slice().filter(function(c) { return c.score >= 60 && !c.isStock && !_isExchangeFlagged(c); })
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
    if (momRows.length) supaRecordMomentumSnapshot(momRows, (window.ROTATOR_RUN && window.ROTATOR_RUN.engineVersion) || null);
  }
  if (typeof supaRecordHoldingsSnapshot === 'function' && typeof holdings !== 'undefined' && holdings.length) {
    var heldRows = holdings.map(function(h) {
      var c = coins.find(function(cc) { return cc.sym === h.sym; });
      if (!c) return null;
      return { sym: c.sym, coin_id: c.id, score: c.score, price: c.price };
    }).filter(Boolean);
    if (heldRows.length) supaRecordHoldingsSnapshot(heldRows, (window.ROTATOR_RUN && window.ROTATOR_RUN.engineVersion) || null);
  }
  var momEl   = document.getElementById('mom-cards');
  if (isPro) {
    if (momAll.length) {
    /* SIX, not four. The three signal columns share a row, so the tallest
       sets the height — and Rotation is the tall one: its tile carries a
       sentence of explanation while a momentum tile is four compact stats.
       Four tiles fill two rows against Rotation's two taller ones, leaving
       a third row of dead space in the middle of the screen. Six fills it
       with real coins instead of nothing. Measured 2026-09-08 at 2371px:
       184px of content in a 236px column. The file header has always
       documented .slice(0, 6) as the knob; this is it being turned. */
      var momTiles = momAll.slice(0, 6).map(function(c) { return sigTile(c, 'mom'); }).join('');
      for (var mp = momAll.slice(0, 6).length; mp < 6; mp++) momTiles += emptyPlaceholderTile();
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
  var buys  = coins.filter(function(c) { return hSyms.indexOf(c.sym) < 0 && !c.isStock && c._zone === 'buy' && _passesMeanRevGate(c) && _isTradable(c) && _isPresentable(c) && !_isExchangeFlagged(c); }).sort(function(a, b) { return a.score - b.score; });

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
  var allBuys  = coins.slice().filter(function(c) { return !c.isStock && c._zone === 'buy' && _passesMeanRevGate(c) && _isTradable(c) && _isPresentable(c) && !_isExchangeFlagged(c); }).sort(function(a, b) {
    var aHeld = hSyms.indexOf(a.sym) >= 0, bHeld = hSyms.indexOf(b.sym) >= 0;
    if (aHeld !== bHeld) return aHeld ? -1 : 1;
    return a.score - b.score;
  });

  if (!isPro) {
    /* Up to ROT_TILE_SLOTS genuinely mixed tiles — rotation pair,
       standalone take-profit, or standalone buy. Built identically for
       both tiers (see _buildRotationTiles); the tier decides only how
       many of them are rendered for real, never what the list says. */
    var previewTiles = _buildRotationTiles(sells, buys, allBuys, ROT_TILE_SLOTS);

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
    for (var pad = Math.max(filledCount, 2); pad < ROT_TILE_SLOTS; pad++) {
      gridHtml += emptyPlaceholderTile();
    }

    sugEl.innerHTML = '<div class="sig-tiles-grid">' + gridHtml + '</div>' + provenProofLine();
    return;
  }

  /* Pro: full signals — genuinely mixed types, same logic as the free
     tier above but showing up to 4 real tiles instead of 1. */
  /* Same builder the Free branch above uses. Pro renders every tile it
     returns; Free renders the first and locks the rest. */
  var proTiles = _buildRotationTiles(sells, buys, allBuys, ROT_TILE_SLOTS);

  if (!proTiles.length) {
    sugEl.innerHTML = '<div class="no-sug">Scanning — no rotation setups in range right now.</div>';
    return;
  }
  var rotHtml = proTiles.map(function(t) {
    if (t.type === 'pair') return sigRotTile(t.sell, t.buy);
    if (t.type === 'profit') return takeProfitTile(t.c);
    return buySuggestTile(t.c);
  }).join('');
  for (var rp = proTiles.length; rp < ROT_TILE_SLOTS; rp++) rotHtml += emptyPlaceholderTile();
  sugEl.innerHTML = '<div class="sig-tiles-grid">' + rotHtml + '</div>' + provenProofLine();
}

/* ══════════════════════════════════════════════════════════════
   INSIGHT ENGINE — the badge, and only the badge

   The 7 pillars used to be computed HERE, in the visitor's browser, from
   a local kline cache with a rank-derived RSI proxy when no candles were
   loaded. That number was not display-only: the engine's _classifyZones()
   read c.insight.score and used it to pull a coin's effective score
   toward neutral, so a calculation living in a consumer moved a live
   zone. It was ARCHITECTURE-MAP.md gap 1, and the last parallel scoring
   path in the project.

   Engine 2.3.0 owns them. c.insight now ARRIVES with the run — from the
   server row, or from the local engine pass on a cold start — and
   everything below is presentation: a tooltip string, and the extra
   candle-derived signal lines for holdings and watchlist coins.

   What this file may still do: format. What it may not do, and no longer
   can, is produce a number that anything scores on.
══════════════════════════════════════════════════════════════ */

/* ── Binance 4h candle cache ───────────────────────────────────────
   Candles come from Supabase (binance_klines_4h), not api.binance.com.
   This is a CACHE now and nothing more: it holds closes and volumes, and
   the indicator maths that used to live beside it (_calcRSI, _calcEMA,
   _calcMACD, _calcBollinger) moved into rotator-engine/engine.js with
   the pillars. RotatorEngine.insightDetail() reads these. */
var _klineCache = {};  /* sym → { ts, closes, volumes } */
var _klineTTL   = 10 * 60 * 1000;  /* 10 min cache */

function _buildKlineEntry(sym, raw) {
  if (!raw || !Array.isArray(raw.closes) || raw.closes.length < 30) return null;
  var entry = {
    ts: Date.now(),
    closes: raw.closes.map(Number),
    volumes: (raw.volumes || []).map(Number)
  };
  _klineCache[sym] = entry;
  return entry;
}

async function _preloadKlines(syms) {
  if (typeof supaLoad4hKlines !== 'function') return;
  var fresh = syms.filter(function(s) {
    return !(_klineCache[s] && (Date.now() - _klineCache[s].ts) < _klineTTL);
  });
  if (!fresh.length) return;
  var map = await supaLoad4hKlines(fresh);
  fresh.forEach(function(s) { _buildKlineEntry(s, map[s]); });
}

/* ── Fetch candles for holdings + watchlist (called after data load) ── */
async function fetchInsightKlines() {
  /* Skip bStocks entirely: a tokenized stock has no <sym>USDT spot pair,
     so it would never have a row to find. A stock's momentum data comes
     from unified_market_data; there is no RSI/MACD/Bollinger equivalent
     for bStocks yet, so those rows simply go without the extra detail. */
  var stockSyms = (typeof coins !== 'undefined') ? coins.filter(function(c) { return c.isStock; }).map(function(c) { return c.sym; }) : [];
  var hSyms = holdings.map(function(h) { return h.sym; }).filter(function(s) { return stockSyms.indexOf(s) < 0; });
  var wSyms = (typeof watchlist !== 'undefined') ? watchlist.filter(function(s) { return stockSyms.indexOf(s) < 0; }) : [];
  var targetSyms = hSyms.concat(wSyms.filter(function(s) { return hSyms.indexOf(s) < 0; }));
  /* Capped at 10 — not for rate limits (this is one Supabase read), but
     because this depth of detail is only surfaced for holdings and
     watchlist entries. */
  var batch = targetSyms.slice(0, 10);
  await _preloadKlines(batch);
  computeInsights();
}

/* Attach the presentation layer to the insight the ENGINE produced.

   Called on every render. It reads c.insight — set by applySignalRun()
   or by the server-row overwrite in runSignalEngine() — and adds the
   tooltip. For the handful of coins whose candles are loaded it also
   appends MACD / Bollinger / candle-volume lines from
   RotatorEngine.insightDetail().

   Those lines are DISPLAY ONLY and deliberately do not touch
   insight.score. Candles reach at most ten symbols in one visitor's
   browser; a score built from them could not be reproduced by the server
   or matched by the next visitor. Before 2.3.0 the score did include
   them, normalised over a different range, so the same coin showed a
   different number to someone who held it than to someone who did not. */
function computeInsights() {
  if (typeof coins === 'undefined' || !coins.length) return;
  var fg      = (window.fearGreed && typeof window.fearGreed.value === 'number') ? window.fearGreed.value : null;
  var fgLabel = (window.fearGreed && window.fearGreed.label) || 'Neutral';
  var haveEngine = (typeof RotatorEngine !== 'undefined' && typeof RotatorEngine.insightDetail === 'function');

  coins.forEach(function(c) {
    /* Format from the ENGINE'S object every time, never from the last
       formatted one. This runs on every render, and again after
       fetchInsightKlines() resolves — reading back what it wrote would
       stack the candle signal lines a second time and lose the
       rsiApplied / fearGreedApplied flags the tooltip branches on
       (those are not carried onto the formatted object, because nothing
       downstream reads them).

       c._insightRun is set by applySignalRun() and by the server-row
       overwrite, both in data-loaders.js — the same two places that set
       every other engine field — so a new run replaces it rather than
       leaving this reading a previous one. */
    var ins = c._insightRun;
    if (!ins || typeof ins.score !== 'number') { c.insight = null; return; }

    var signals = Array.isArray(ins.signals) ? ins.signals.slice() : [];
    var kd = _klineCache[c.sym];
    var detailed = false;
    if (haveEngine && kd) {
      var d = RotatorEngine.insightDetail(kd);
      if (d && d.signals.length) { signals = signals.concat(d.signals); detailed = true; }
    }

    var tooltip = signals.length ? signals.join(' · ') : 'No strong signals — monitoring';
    /* Fear & greed is stated whether or not the run had a reading, and
       says which — pillar 6 is skipped rather than defaulted when the
       run has none, and a tooltip that shows "50 (Neutral)" for a
       missing reading would be describing a pillar that did not run. */
    tooltip += ins.fearGreedApplied && fg != null
      ? ' | F&G: ' + fg + ' (' + fgLabel + ')'
      : ' | F&G: not available this run';
    if (ins.rsi != null) tooltip += ' | RSI(14) ' + ins.rsi;
    if (detailed) tooltip += ' | Binance 4H data';

    c.insight = {
      score:   ins.score,
      label:   ins.label,
      color:   ins.color,
      signals: signals,
      tooltip: tooltip,
      rsi:     ins.rsi != null ? ins.rsi : null
    };
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

  /* Every coin with an insight, which since engine 2.3.0 means every
     coin the run classified rather than whichever ten the FIRST VISITOR
     OF THE DAY happened to hold. The snapshot used to depend on that
     visitor's portfolio — the same per-visitor drift the zone migration
     removed, sitting quietly in a stored table. The RPC is still
     first-writer-of-day and idempotent, so this is one write of ~170
     rows a day, not 170 more writes. */
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
    await runSignalEngine();
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
    await runSignalEngine();
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
    catCoins = coins.filter(function(c) { return categoryOf(c) === activeCategory; });
  }

  /* A lens takes over the ordering while it is active — that is the
     point of picking one. Readings with no value sort LAST regardless of
     direction: "no data" is not the weakest reading, it is the absence
     of one, and burying it at the bottom keeps it out of the ranking
     rather than pretending it lost. */
  var _lens = activeLens ? LENSES.filter(function(l) { return l.id === activeLens; })[0] : null;
  var _lensLo = 0, _lensHi = 0;
  if (_lens) {
    var vals = catCoins.map(function(c) { return _lens.get(c); })
                       .filter(function(v) { return v != null; });
    if (vals.length) { _lensLo = Math.min.apply(null, vals); _lensHi = Math.max.apply(null, vals); }
  }

  var sorted = catCoins.sort(function(a, b) {
    if (_lens) {
      var av = _lens.get(a), bv = _lens.get(b);
      if (av == null && bv == null) return b.score - a.score;
      if (av == null) return 1;
      if (bv == null) return -1;
      return bv - av;
    }
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

    var _lv = _lens ? _lens.get(c) : null;
    var _lc = _lens ? _lensColor(_lens, _lv, _lensLo, _lensHi) : null;
    /* Hollow left edge when the lens has no reading for this coin —
       visibly different from a low reading, never the same. */
    var _lensStyle = _lens
      ? ' style="box-shadow:inset 3px 0 0 ' + (_lc || 'transparent')
        + (_lc ? '' : ';outline:0') + ';"'
      : '';
    return '<tr class="' + (isH ? 'held' : '') + (c.isStable ? ' stable-row' : '') + (c.isStock ? ' stock-row' : '') + '"' + _lensStyle + ' ' + tipData + ' onmouseenter="showRowTip(this,event)" onmouseleave="hideTip()" onclick="openTileDetail(\'' + c.id + '\',event)">'
      + '<td class="qa-cell">' + qaBtnHtml + '</td>'
      + '<td style="color:var(--muted);font-size:11px;opacity:.5;">' + (i+1) + '</td>'
      + '<td><div class="cc"><div class="ti"><img src="' + c.image + '" alt="' + c.sym + ' logo" loading="lazy" width="18" height="18" onerror="this.style.display=\'none\'"></div><div><div style="display:flex;align-items:center;"><span class="tsym">' + c.sym + '</span>' + (isH ? '<span class="htag">HELD</span>' : '') + stableTag + crossBadge(c) + (_lens
        ? '<span class="lens-chip" title="' + _lens.label + ' — ' + _lens.tip.replace(/"/g,'&quot;') + '" style="margin-left:5px;font-size:10px;font-family:var(--font-mono);padding:1px 4px;border-radius:3px;'
          + (_lv == null
              ? 'color:var(--muted);border:1px dashed var(--bdr);opacity:.6;">no data'
              : 'color:' + _lc + ';border:1px solid ' + _lc + '33;">' + _lens.fmt(_lv))
          + '</span>'
        : '') + '</div><div class="tname">' + (c.name.length > 17 ? c.name.slice(0,15) + '…' : c.name) + '</div></div></div></td>'
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
  if (typeof renderLensRail === 'function') renderLensRail();
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
