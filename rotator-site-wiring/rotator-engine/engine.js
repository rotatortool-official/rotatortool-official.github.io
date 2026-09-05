/* ══════════════════════════════════════════════════════════════════
   rotator-engine — the canonical Rotator scoring engine.

   ⚠ GENERATED FILE — do not edit engine.js by hand during Phase 1.
     Edit engine.template.js and run `node build.js`.

   The scoring functions below are lifted VERBATIM out of the deployed
   site (js/data-loaders.js, js/signals.js). Not a port, not a rewrite —
   the same characters, verified on every test run by
   test/verify-verbatim.js. Phase 1 changes no maths.

   What the extraction DOES change is where those functions get their
   inputs. On the site they close over page globals, three of which live
   in the visitor's own localStorage, which is why two browsers could
   publish different zones for the same market. Here the same globals are
   module-scope variables populated from an explicit input object and read
   back out as explicit output. Same code, stated contract.

   Runtime support:
     browser   <script src="rotator-engine/engine.js"></script>  → window.RotatorEngine
     Node      require('./rotator-engine/engine.js')
     Deno      import Engine from './rotator-engine/engine.mjs'

   Extracted from:
//   4 Sept/js/data-loaders.js          _loadVolHist           L456-459  sha256:baa7903c3e1c
//   4 Sept/js/data-loaders.js          _trackVolumeHistory    L461-478  sha256:b35e845b1a35
//   4 Sept/js/data-loaders.js          _volRatio              L483-490  sha256:7249fb7cea95
//   4 Sept/js/data-loaders.js          _btcCycleLabel         L408-414  sha256:7e1c6abf871d
//   4 Sept/js/data-loaders.js          computeScores          L494-615  sha256:8b72b1cc2582
//   4 Sept/js/signals.js               _adaptiveThresholds    L126-153  sha256:3655c005c109
//   4 Sept/js/signals.js               _passesMeanRevGate     L155-158  sha256:92b63c975dcf
//   4 Sept/js/signals.js               _quickInsight          L171-207  sha256:b749552c2655
//   4 Sept/js/signals.js               _classifyZones         L211-244  sha256:f2591b61b33a
══════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RotatorEngine = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* Bumped ONLY when the maths changes. Phase 1 is an extraction, so this
     is the version of the behaviour already live on the site. The bot
     adopting this engine (Phase 4) is what makes it 2.0.0, because that
     is when published output actually changes. */
  var ENGINE_VERSION = '1.4.0';

  /* ════════════════════════════════════════════════════════════════
     SEAM 1 — page globals, now module state.
     Every name here is one the extracted bodies expect to find in
     scope. They are reset by _loadState() at the top of each run, so a
     run never inherits anything from the run before it.
     ════════════════════════════════════════════════════════════════ */
  var coins = [];
  var TOKENOMICS_DB = {};
  var _macroData = {};
  var marketCycleData = {};
  var btcPrice = 0;
  var btcMA200 = 0;
  var _volHist = {};
  var _lastZone = {};

  var _VOL_HIST_KEY = 'rot_vol_hist_v1';
  var _VOL_HIST_DAYS = 7;
  var _SIG_BUY_BASE = 38;
  var _SIG_SELL_BASE = 62;
  var _SIG_DEADBAND = 50;

  /* ════════════════════════════════════════════════════════════════
     SEAM 2 — localStorage.
     _trackVolumeHistory() and _classifyZones() read and write browser
     storage directly. Rather than edit those bodies, the module gives
     them a store backed by the run's inputs; whatever they write is
     collected and returned as output. That is the whole of "move zone
     state server-side" from the engine's side: the caller decides where
     the store actually lives.
     ════════════════════════════════════════════════════════════════ */
  var _store = {};
  var localStorage = {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(_store, k) ? _store[k] : null; },
    setItem: function (k, v) { _store[k] = String(v); },
    removeItem: function (k) { delete _store[k]; }
  };

  /* ════════════════════════════════════════════════════════════════
     SEAM 3 — the clock.
     _trackVolumeHistory() stamps samples with `new Date()`. A signal run
     must be reproducible from its inputs alone, so Date is shadowed here
     by one frozen at the run's `asOf`. Nothing else in the extracted
     code reads the clock.
     ════════════════════════════════════════════════════════════════ */
  var NativeDate = (typeof globalThis !== 'undefined' ? globalThis : this).Date;
  var _asOf = null;
  function Date() { return new NativeDate(_asOf); }
  Date.now = function () { return new NativeDate(_asOf).getTime(); };

  /* ─── verbatim from data-loaders.js ─────────────────────── */
  function _loadVolHist() {
    try { return JSON.parse(localStorage.getItem(_VOL_HIST_KEY)) || {}; }
    catch (e) { return {}; }
  }

  function _trackVolumeHistory(coinsArr) {
    var hist = _loadVolHist();
    var today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    coinsArr.forEach(function(c) {
      if (!c.volume24) return;
      var h = hist[c.id] || [];
      if (!h.length || h[h.length - 1].d !== today) {
        h.push({ d: today, v: c.volume24 });
        if (h.length > _VOL_HIST_DAYS) h = h.slice(-_VOL_HIST_DAYS);
        hist[c.id] = h;
      } else {
        h[h.length - 1].v = c.volume24; // overwrite same-day sample
      }
    });
    try { localStorage.setItem(_VOL_HIST_KEY, JSON.stringify(hist)); } catch (e) {}
    _volHist = hist;
    return hist;
  }

  function _volRatio(c) {
    var h = _volHist[c.id];
    if (!h || h.length < 2) return 1;
    var priorDays = h.slice(0, -1); // exclude today's own sample
    var avg = priorDays.reduce(function(s, x) { return s + x.v; }, 0) / priorDays.length;
    if (!avg) return 1;
    return c.volume24 / avg;
  }

  function _btcCycleLabel() {
    var mm = marketCycleData.BTC && marketCycleData.BTC.mayer_multiple;
    if (mm == null) return null;
    if (mm >= 2.4) return 'stretched';
    if (mm <= 0.8) return 'oversold';
    return 'neutral';
  }

  function computeScores() {
    _trackVolumeHistory(coins);

    /* Exclude stablecoins (APR display), bStocks (scored separately below —
       UNLOCK/SENT tokenomics has no meaning for equities), and coins with
       incomplete % data — a freshly-listed coin without 14D/30D history
       would otherwise rank mid-pack on r14/r30 (since p14/p30 default to 0)
       and inflate its rotation score, repeatedly surfacing as a "buy zone"
       candidate despite us having no real basis to score it. */
    var scorable = coins.filter(function(c) { return !c.isStable && !c.isStock && c.dataComplete !== false; });
    var n = Math.max(scorable.length - 1, 1);

    /* LAYER 1: Intra-list rank (0–40 pts) — crypto peer group only.
       p7 is ranked on a volume-adjusted value so a coin pumping on thin
       volume doesn't outrank one with the same % move backed by real
       turnover. p14/p30 are left on raw price change — no reliable
       14d/30d volume-average signal exists yet. */
    ['p7','p14','p30'].forEach(function(k) {
      var sorted = scorable.slice().sort(function(a, b) {
        if (k === 'p7') {
          var va = a.p7 * (0.5 + 0.5 * Math.min(_volRatio(a), 2));
          var vb = b.p7 * (0.5 + 0.5 * Math.min(_volRatio(b), 2));
          return vb - va;
        }
        return b[k] - a[k];
      });
      sorted.forEach(function(c, i) { c['r' + k.slice(1)] = i + 1; });
    });

    /* Set stablecoin AND incomplete-data scores to 0 — they're rendered but
       not part of the rotation leaderboard. The detail modal can surface the
       dataComplete flag separately if we want a "🆕 New listing" badge later. */
    coins.forEach(function(c) {
      if (c.isStable || c.dataComplete === false) {
        c.score = 0; c.r7 = 0; c.r14 = 0; c.r30 = 0;
      }
    });

    var btcP7    = _macroData.btcP7    != null ? _macroData.btcP7    : (coins.find(function(x){ return x.id==='bitcoin'; }) || {p7:0}).p7;
    var goldP7   = _macroData.goldP7   != null ? _macroData.goldP7   : 2;
    var silvP7   = _macroData.silverP7 != null ? _macroData.silverP7 : 1.5;
    var oilP7    = _macroData.oilP7    != null ? _macroData.oilP7    : 1;
    var dxyP7    = _macroData.dxyP7    != null ? _macroData.dxyP7    : 0;
    var total3P7 = _macroData.total3P7 != null ? _macroData.total3P7 : 0;

    scorable.forEach(function(c) {
      /* Weighted rank (lower rank# = better) */
      var wAvg   = (c.r7 * 0.25 + c.r14 * 0.30 + c.r30 * 0.45);
      var layer1 = Math.round((1 - (wAvg - 1) / n) * 40);

      /* LAYER 2: Macro relative strength vs BTC/Gold/Silver/Oil + DXY/Total3 (0–30 pts)
         DXY inverse: rising dollar is headwind for crypto, so we ADD dxy strength (coin benefits when DXY falls)
         Total3: rising altcoin market = tailwind, coin benefits when outperforming total3 */
      /* Core: vs traditional assets (60% weight) */
      var coreDelta = (c.p7 - btcP7)*0.35 + (c.p7 - goldP7)*0.25 + (c.p7 - silvP7)*0.10 + (c.p7 - oilP7)*0.10;
      /* DXY headwind: if DXY rose 2%, all crypto gets -2 pts penalty; coin-specific edge stays in coreDelta (10% weight) */
      var dxyDelta  = -dxyP7 * 0.10;
      /* Total3 tailwind: coin outperforming altcoin market = bonus (10% weight) */
      var t3Delta   = (c.p7 - total3P7) * 0.10;
      var delta  = coreDelta + dxyDelta + t3Delta;
      var layer2 = Math.min(30, Math.max(0, Math.round(15 + Math.min(Math.max(delta * 0.9, -15), 15))));

      /* LAYER 3: Tokenomics quality (−50 to +30 pts) — crypto only */
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
      /* Near-term unlock overhang — extra penalty on top of the static
         unlockRisk tier when a coin has a real unlock event coming up.
         unlock30d must be filled in by hand in config.js's
         TOKENOMICS_DB (see that file's comment) — no live vesting data
         source is wired into this project. */
      if (tkx.unlock30d && tkx.unlock30d > 5) unlockPts -= 15;
      var layer3    = Math.min(30, Math.max(-50, supplyPts + deflPts + unlockPts));

      c.score = Math.min(100, Math.max(-50, Math.round(layer1 + layer2 + layer3)));

      /* Mcap bracket adjustment — dampens micro-cap noise (<$500M),
         rewards mega-cap stability (>$50B). Neutral $500M–$10B band is
         implicit (mult stays 1.0). Applied post-clamp, after L1+L2+L3,
         per the spec — can nudge score slightly outside -50..100 in
         edge cases, which is intentional (a 1.05x mega-cap bonus on a
         near-100 score should still read as "very strong"). */
      var mcapMult = 1.0;
      if (c.mcap && c.mcap < 500e6)      mcapMult = 0.85;
      else if (c.mcap && c.mcap > 50e9)  mcapMult = 1.05;
      c.score = Math.round(c.score * mcapMult);

      c.scoreBreakdown = {layer1, layer2, layer3, supplyPts, deflPts, unlockPts, dxyP7: dxyP7, total3P7: total3P7, mcapMult, volRatio: _volRatio(c)};
    });

    /* ── bStocks: partial score, own peer group, no Layer 3 ──────────
       Ship-first version per the migration plan: MCAP + momentum only,
       no fabricated unlock/sentiment number. Ranked against OTHER bStocks
       (not crypto) so a modest-momentum stock isn't buried under a
       pumping memecoin's rank. Max attainable is 70 (40+30), not 100 —
       intentionally not rescaled to look comparable to a full crypto
       score; the UI labels this a partial score (see signals.js). */
    var stockScorable = coins.filter(function(c) { return c.isStock && c.dataComplete !== false; });
    var sn = Math.max(stockScorable.length - 1, 1);
    ['p7','p14','p30'].forEach(function(k) {
      var sorted = stockScorable.slice().sort(function(a, b) { return b[k] - a[k]; });
      sorted.forEach(function(c, i) { c['r' + k.slice(1)] = i + 1; });
    });
    coins.forEach(function(c) { if (c.isStock && c.dataComplete === false) { c.score = 0; c.r7 = 0; c.r14 = 0; c.r30 = 0; } });
    stockScorable.forEach(function(c) {
      var wAvg   = (c.r7 * 0.25 + c.r14 * 0.30 + c.r30 * 0.45);
      var layer1 = Math.round((1 - (wAvg - 1) / sn) * 40);
      var coreDelta = (c.p7 - btcP7) * 0.5 + (c.p7 - goldP7) * 0.5; /* simpler macro compare for equities */
      var layer2 = Math.min(30, Math.max(0, Math.round(15 + Math.min(Math.max(coreDelta * 0.9, -15), 15))));
      c.score = Math.max(0, Math.round(layer1 + layer2));
      c.scoreBreakdown = {layer1: layer1, layer2: layer2, layer3: null, partial: true};
    });
  }

  /* ─── verbatim from signals.js ─────────────────────── */
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

  /* ════════════════════════════════════════════════════════════════
     Glue — the parts of loadCoins()/loadMacroData() that are page
     plumbing rather than scoring. Kept out of the extraction on purpose,
     and kept identical in behaviour to what the site does before it
     calls computeScores().
     ════════════════════════════════════════════════════════════════ */
  function _deriveBtcAnchors(input) {
    var btc = null;
    for (var i = 0; i < coins.length; i++) if (coins[i].id === 'bitcoin') { btc = coins[i]; break; }
    if (!btc) return;
    btcPrice = input.btcPrice != null ? input.btcPrice : btc.price;
    if (input.btcMA200 != null) {
      btcMA200 = input.btcMA200;
    } else if (marketCycleData.BTC && marketCycleData.BTC.ma200) {
      btcMA200 = marketCycleData.BTC.ma200;               /* real 200-day MA */
    } else {
      var p30frac = (btc.p30 || 0) / 100;
      btcMA200 = btcPrice / (1 + p30frac * 0.5);          /* site's fallback estimate */
    }
    if (_macroData.btcP7 == null) _macroData.btcP7 = btc.p7;
  }

  function _loadState(input) {
    coins = input.coins || [];
    TOKENOMICS_DB = input.tokenomics || {};
    _macroData = {
      btcP7: null, goldP7: null, silverP7: null,
      oilP7: null, dxyP7: null, total3P7: null
    };
    if (input.macro) {
      for (var k in input.macro) {
        if (Object.prototype.hasOwnProperty.call(input.macro, k)) _macroData[k] = input.macro[k];
      }
    }
    marketCycleData = {};
    var mc = input.marketCycle || {};
    if (Object.prototype.toString.call(mc) === '[object Array]') {
      for (var i = 0; i < mc.length; i++) marketCycleData[mc[i].symbol] = mc[i];
    } else {
      marketCycleData = mc;
    }
    btcPrice = 0;
    btcMA200 = 0;
    _asOf = input.asOf;
    _store = {};
    _store[_VOL_HIST_KEY] = JSON.stringify(input.volumeHistory || {});
    _store.rot_last_zone = JSON.stringify(input.previousZones || {});
    _volHist = JSON.parse(_store[_VOL_HIST_KEY]);
    _lastZone = JSON.parse(_store.rot_last_zone);

    /* Insights are optional. The site only computes the rich Insight
       score for a visitor's holdings and watchlist; everything else falls
       to _quickInsight() inside _classifyZones(). Passing them in keeps
       that path reachable without the engine having to fetch klines. */
    if (input.insights) {
      for (var j = 0; j < coins.length; j++) {
        var ins = input.insights[coins[j].id] || input.insights[coins[j].sym];
        if (ins) coins[j].insight = ins;
      }
    }
  }

  function _dataQuality(input) {
    var macro = input.macro || {};
    var fields = ['goldP7', 'silverP7', 'oilP7', 'dxyP7', 'total3P7'];
    var missing = [];
    for (var i = 0; i < fields.length; i++) {
      if (macro[fields[i]] == null) missing.push(fields[i]);
    }
    var haveRealMA200 = !!(marketCycleData.BTC && marketCycleData.BTC.ma200);
    return {
      macroFieldsMissing: missing,
      macroComplete: missing.length === 0,
      btcMA200Source: input.btcMA200 != null ? 'supplied'
        : haveRealMA200 ? 'market_cycle' : 'p30_estimate',
      volumeHistorySupplied: !!(input.volumeHistory && Object.keys(input.volumeHistory).length),
      previousZonesSupplied: !!(input.previousZones && Object.keys(input.previousZones).length),
      insightsSupplied: !!(input.insights && Object.keys(input.insights).length),
      inputAges: input.inputAges || null
    };
  }

  function _projectItem(c) {
    return {
      id: c.id,
      sym: c.sym,
      mcap: c.mcap,
      p7: c.p7, p14: c.p14, p30: c.p30,
      dataComplete: c.dataComplete,
      isStable: c.isStable,
      r7: c.r7, r14: c.r14, r30: c.r30,
      score: c.score,
      effectiveScore: c._effectiveScore,
      quickInsight: c._quickIns,
      zone: c._zone,
      meanRevPass: _passesMeanRevGate(c),
      breakdown: c.scoreBreakdown || null
    };
  }

  /* ════════════════════════════════════════════════════════════════
     PUBLIC API
     ════════════════════════════════════════════════════════════════ */
  /**
   * Score one market snapshot. Pure: same input in, same output out.
   *
   * @param {object} input
   *   asOf            {string}  ISO timestamp for the run. Required — the
   *                             engine never reads the clock itself.
   *   coins           {Array}   coins[] as loadCoins() builds it.
   *   tokenomics      {object}  TOKENOMICS_DB.
   *   macro           {object}  btcP7/goldP7/silverP7/oilP7/dxyP7/total3P7,
   *                             nulls allowed — the same hard-coded
   *                             fallbacks apply as on the site.
   *   marketCycle     {object|Array} market_cycle rows, keyed or listed.
   *   btcPrice        {number=} overrides the BTC row's price.
   *   btcMA200        {number=} overrides the market_cycle MA200.
   *   volumeHistory   {object}  was localStorage rot_vol_hist_v1.
   *   previousZones   {object}  was localStorage rot_last_zone.
   *   insights        {object=} coinId|sym -> {score}.
   *   inputAges       {object=} recorded into dataQuality, not used in maths.
   * @returns {object} { engineVersion, asOf, thresholds, cycleLabel,
   *                     items, zones, volumeHistory, dataQuality }
   */
  function computeSignalRun(input) {
    if (!input || !input.asOf) throw new Error('rotator-engine: input.asOf is required');
    if (!input.coins || !input.coins.length) throw new Error('rotator-engine: input.coins is empty');

    _loadState(input);
    _deriveBtcAnchors(input);

    computeScores();
    _classifyZones();

    var items = [];
    for (var i = 0; i < coins.length; i++) items.push(_projectItem(coins[i]));

    return {
      engineVersion: ENGINE_VERSION,
      asOf: input.asOf,
      thresholds: _adaptiveThresholds(),
      cycleLabel: _btcCycleLabel(),
      universeSize: coins.length,
      items: items,
      /* The state the run produced. Persist these rather than leaving
         them in one visitor's browser. */
      zones: JSON.parse(_store.rot_last_zone || '{}'),
      volumeHistory: JSON.parse(_store[_VOL_HIST_KEY] || '{}'),
      dataQuality: _dataQuality(input)
    };
  }

  return {
    ENGINE_VERSION: ENGINE_VERSION,
    computeSignalRun: computeSignalRun,
    /* Exposed for tests and for callers that need one piece in isolation.
       These are the extracted originals, not re-implementations. */
    internals: {
      computeScores: computeScores,
      classifyZones: _classifyZones,
      adaptiveThresholds: _adaptiveThresholds,
      passesMeanRevGate: _passesMeanRevGate,
      quickInsight: _quickInsight,
      btcCycleLabel: _btcCycleLabel,
      volRatio: _volRatio,
      trackVolumeHistory: _trackVolumeHistory
    }
  };
}));
