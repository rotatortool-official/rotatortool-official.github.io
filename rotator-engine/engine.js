/* ══════════════════════════════════════════════════════════════════
   rotator-engine — the canonical Rotator scoring engine.

   ⚠ THIS FILE IS THE SOURCE. Edit it directly.

     Inverted 2026-09-06. Until then it was GENERATED: build.js lifted
     the scoring functions verbatim out of site/js/data-loaders.js and
     site/js/signals.js, because Phase 1's whole claim was "the maths did
     not change" and generating it made that a fact rather than a promise.

     That phase is over. The site now holds no copy of these functions —
     it delegates into this module — so there is nothing left to extract
     from. engine.js is hand-maintained; build.js only publishes it to
     the copy the browser loads; engine.template.js and
     test/verify-verbatim.js are retired in place.

     The golden fixture is what guards the maths now. It must not change
     unless you meant to change the maths.

     See promptove/23-build-js-inversion-plan.md.

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

   Extracted from (HISTORICAL — the provenance of the Phase 1 lift, kept
   because it is the evidence that this code and the shipped site were
   once byte-identical. The line numbers refer to a version of the site
   that no longer contains these functions):
//   site/js/data-loaders.js            _loadVolHist           L580-583  sha256:baa7903c3e1c
//   site/js/data-loaders.js            _trackVolumeHistory    L585-602  sha256:b35e845b1a35
//   site/js/data-loaders.js            _volRatio              L607-614  sha256:7249fb7cea95
//   site/js/data-loaders.js            _btcCycleLabel         L532-538  sha256:7e1c6abf871d
//   site/js/data-loaders.js            computeScores          L785-906  sha256:8b72b1cc2582
//   site/js/signals.js                 _adaptiveThresholds    L126-153  sha256:3655c005c109
//   site/js/signals.js                 _passesMeanRevGate     L155-158  sha256:92b63c975dcf
//   site/js/signals.js                 _quickInsight          L171-207  sha256:b749552c2655
//   site/js/signals.js                 _classifyZones         L211-244  sha256:f2591b61b33a
══════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RotatorEngine = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* 2.0.0 added the v2 scoring model alongside v1, and v1 was unchanged
     from 1.5.0 — byte for byte, with the golden test enforcing it. The
     major bump was because the module offered two models, not because
     the old one moved.

     2.1.0 IS THE FIRST RELEASE WHERE v1's MATHS MOVED. The market-cap
     bracket adjustment in computeScores() changed from a multiplier to
     a signed additive term (see the comment there for the measured
     reason). Every v1 score for a coin outside the $500M-$50B band
     changes, so the golden fixture necessarily differs from 2.0.0 and
     the diff is the record of what moved.

     Minor, not major: no consumer interface changed. Nothing that reads
     `score`, `zone` or `scoreBreakdown` needs updating — except that
     `scoreBreakdown.mcapMult` is now `scoreBreakdown.sizeAdj`, which
     nothing outside the engine ever read. */
  /* 2.2.0 — candidate classification.

     Adds `candidateClass` and the real RSI it was confirmed against to
     every eligible item, plus a run-level `candidates` block. Purely
     additive: no score, rank, zone or eligibility value changes, so the
     golden fixture's numbers are untouched and 2.1.0's tracking record
     stays comparable. See _classifyCandidate(). */
  /* 2.3.0 — the Insight Engine moves into DERIVE.

     The 7 forward-looking pillars, and the RSI/MACD/Bollinger maths
     under them, lived in site/js/signals.js and produced c.insight.score
     in the visitor's browser. _classifyZones() read that number and used
     it to pull the effective score toward neutral, so a calculation
     living in a CONSUMER moved a live zone — ARCHITECTURE-MAP.md gap 1,
     and the last one of its kind.

     They are here now. Three things changed with the move, and each one
     is a behaviour change, not a relocation:

       · The rank-derived RSI PROXY is gone. Pillar 1 reads the real
         Wilder RSI(14) from coin_technicals — the same input, through
         the same lookup, that candidate classification already
         confirms on. A coin with no RSI simply does not get pillar 1,
         rather than getting relative weakness wearing an RSI label.

       · _quickInsight() is DELETED. It was the cross-link's fallback and
         carried the same rank proxy. A dead proxy kept "just in case"
         reads as present, which is worse than absent; the pillars now
         cover every coin the cross-link classifies.

       · Klines feed the SIGNAL LIST, never the score. insightDetail()
         still computes MACD and Bollinger from candles for the tooltip,
         but the score comes only from inputs a RUN has — real RSI,
         aggregates, fear & greed, BTC — so every visitor sees the same
         number and the server can reproduce it. Before this, a held coin
         normalised over 176 points and an unheld one over 140, which
         meant the badge was not comparable between two coins.

     This MOVES SCORES AND ZONES and is meant to. On the frozen fixture
     day: score unchanged for all 177 (the pillars never touch it),
     effectiveScore moves on 18 of 166 classified coins, zone on 2.
     See promptove/29 and the golden diff. */
  /* 2.4.0 — run-over-run movement.

     Adds `run.changes`: which coins moved rank, moved score, changed
     zone or changed candidate class since a previous run, and out of
     how large a universe. It is the data under the homepage brief's
     "WHAT CHANGED" section.

     It lives HERE and not on the page for one reason. The same
     statements are meant to reach the website, the Telegram bot, the
     alerts function and the Substack; four consumers each diffing the
     same rows would drift apart within a month. One run, one set of
     facts, every surface formats the same object. That is gap 1's
     lesson applied before the fact instead of after it.

     PURELY ADDITIVE, and the golden fixture proves it byte for byte:
     no score, rank, zone, eligibility or class value moves. The
     previous run arrives as `input.previous` — the engine never
     fetches — and its absence yields null, which says "no comparison
     available" rather than "nothing changed".

     It reports facts, never prose: symbol, from, to, places, of. The
     wording is a consumer's job. A sentence generated here would be a
     threshold nobody could see.

     Found while building it: `sym` is NOT unique. FRAX is both `frax`
     and `frax-share` on the frozen fixture, so a symbol-keyed diff
     reported a 9-point move on an identical rerun. The diff keys on
     coin id. See _computeChanges(). */
  /* 2.4.1 — movement stops reporting untradable coins.

     `changes` reported any coin that moved, including ones _eligibility()
     had already refused. On run 375 the biggest mover in the whole
     universe was NTRN at 89 places, on $686 of daily volume, and it was
     leading the brief.

     Filters on the REASON, not the verdict: XMR is equally ineligible and
     its 25-place move stays, because it turns $117.9M a day and is
     excluded only for being delisted on Binance spot. See
     CHANGE_RULES.suppress.

     Additive still — no score, rank, zone, eligibility or class moves,
     and the golden fixture is unchanged. */
  /* 2.5.0 — the hysteresis hold becomes a margin, not a midpoint.
     THE FIRST NON-ADDITIVE VERSION SINCE 2.3.0: zones move, so the
     track record resets. See _SIG_HYSTERESIS for the measurements.

     A coin that entered the buy zone at 38 kept the label until 50, and
     one that entered the sell zone at 66 kept it back down to 50 — hold
     bands of 12 and 16 points that nobody chose. They were the distance
     between a fixed constant and an adaptive threshold, so they also
     changed shape with the cycle: 18 and 16 under `stretched`, 12 and 8
     under `oversold`.

     On the 501 stored runs, 41% of every published SELL and 14% of every
     published BUY were coins whose score no longer met the threshold the
     label claimed. The hold is now 4 points past whichever line granted
     the zone, which means the same thing in every cycle.

     The golden fixture is byte-identical: it runs cold, with no previous
     zones, so the hysteresis branch never fires there. What proves this
     one is verify-determinism's seeded-prior-zone check and the
     simulation in _SIG_HYSTERESIS, not the golden. */
  /* 2.6.0 — the supply reading stops being a coin flip on max_supply.
     Scores move for 55 of 166 coins. See _supplyBasis().

     Layer 3's supplyPts and insight pillar 5 both read `max_supply`
     only. It is present for 111 of 166 scorable coins; `total_supply`
     is present for all 166 and was already ingested and discarded at
     every seam. The 55 without a max took a flat -3 and were skipped by
     pillar 5 entirely, so TRX at 100% circulating scored the same as
     SAGA at 25%.

     The flat constant is replaced by the same bands read against
     total_supply, plus a -3 that now means only "uncapped" instead of
     standing in for the whole reading. Average change on those 55 is
     +7.7 points, range -15 to +10; the other 111 are untouched.

     THE GOLDEN CANNOT SEE THIS. raw/cg_markets_all.csv has no `tot`
     column, so every fixture coin has total_supply null and the
     fallback never fires there — the golden is byte-identical, which
     this version proves rather than assumes. test/verify-supply-basis.js
     constructs its own coins to cover the branch. Both golden checks
     also had to learn that "adding a field is allowed" applies inside
     nested objects too; see rotator-fixture/lib/golden-project.js. */
  var ENGINE_VERSION = '2.7.0';
  var SCORING_MODELS = ['v1', 'v2'];

  /* ── Eligibility defaults ──────────────────────────────────────────
     Tradability, not quality. A coin can score well and still be
     something nobody can actually get in or out of, and publishing it
     as a rotation candidate is the harm the delisted-symbol exclusion
     already exists to prevent — this generalises that.

     $250k of 24h volume is the same floor the Telegram bot has used for
     its DEX check. Measured against one frozen day it removes HOPR
     ($10k/day), DEXT ($97k), PRCL ($151k) and CFG ($0 market cap) from
     the buy-zone list while keeping liquid mid-caps like JTO ($38M/day)
     and SAND ($15M/day).

     Deliberately NOT a market-cap-rank ceiling. The bot's rank<=150 rule
     is an editorial choice about which coins a public channel talks
     about, not a statement about tradability — applied to the site's
     mean-reversion buy zone it removed all 12 candidates including the
     two most liquid ones. Thresholds live here so they are versioned
     with the engine rather than being re-invented per consumer. */
  var ELIGIBILITY_DEFAULTS = {
    minVolume24h: 250000
  };

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

  /* Insight inputs, set by _loadState() like everything else here.
     _rsiApplied is the run-level feed-alive verdict, shared with
     candidate classification so a dead coin_technicals feed switches
     BOTH off together rather than leaving insight confirming on the
     stale fraction that happens to still have rows. */
  var _fearGreed = null;
  var _technicals = null;
  var _futures = null;
  var _rsiApplied = false;
  var _insightRulesOverride = null;

  var _VOL_HIST_KEY = 'rot_vol_hist_v1';
  var _VOL_HIST_DAYS = 7;
  var _SIG_BUY_BASE = 38;
  var _SIG_SELL_BASE = 62;

  /* Hysteresis MARGIN, in score points, measured from whichever
     threshold the coin actually crossed. It replaced _SIG_DEADBAND = 50
     in 2.5.0.

     THE DEADBAND WAS AN ABSOLUTE MIDPOINT, not a margin. A coin that
     entered the buy zone at 38 kept the label until its score reached
     50, and one that entered the sell zone at 66 kept it all the way
     back down to 50. So the hold band was 12 points wide on the buy
     side and 16 on the sell side, and neither number was chosen — both
     fell out of the distance between a fixed 50 and an adaptive
     threshold. Under `stretched` (buy 32 / sell 66) the same constant
     produced 18 and 16; under `oversold` (38 / 58), 12 and 8.

     Measured on the 501 runs stored between 2026-09-05 and 2026-09-10,
     all of them `neutral` (buy 38 / sell 66):

       zone   published rows   still past the threshold
       buy            43,266    6,198  (14.3%), worst at 49
       sell            4,805    1,968  (41.0%), worst at 51

     Two fifths of every SELL the tool has published were coins that no
     longer met the sell threshold, and the page said sell anyway. That
     is not hysteresis absorbing noise, it is a label outliving its
     reason.

     WHY NOT SIMPLY DROP IT. Hysteresis earns its place. Over the same
     history, classifying on the bare thresholds flips 400 times at the
     15-minute cadence; the deadband cuts that to 85. The fault was the
     shape of the rule, not the idea.

     WHY 4. Simulated over that history at 15-minute cadence, and again
     at the daily cadence send-telegram-alerts actually compares on
     (LOOKBACK_HOURS, so intra-day oscillation never reaches a message):

       margin   15-min flips   daily flips   buy rows past threshold
            0            400            94                        0
            3            206            75                    1,836
            4            190            71                    2,392
            6            150            65                    3,625
           12             85            54                    6,922

     4 is the knee. Against the deadband it removes 65% of the
     misleading buy rows and 77% of the sell ones, and costs 17 extra
     alert-visible transitions across 137 coins over five days — about
     three a day. Below 3 the churn cost climbs faster than the honesty
     gain (2 points costs 56 more 15-minute flips to remove 711 rows).

     It is symmetric and it is relative, so it means the same thing in
     every cycle: a zone survives until the score is 4 points past the
     line that granted it. */
  var _SIG_HYSTERESIS = 4;

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
      var sb = _supplyBasis(c);
      var supplyPts = 0;
      if (sb.ratio != null) {
        if      (sb.ratio > 0.90) supplyPts =  10;
        else if (sb.ratio > 0.70) supplyPts =   5;
        else if (sb.ratio > 0.40) supplyPts =   0;
        else if (sb.ratio > 0.20) supplyPts = -15;
        else                      supplyPts = -25;
      }
      /* No cap is its own risk, on top of whatever the ratio says, and
         it is the only part of the old flat -3 that was measuring
         anything. Applied when max_supply is absent — including when
         there is no ratio at all, so a coin with neither figure is not
         quietly better off than one with a total. */
      var uncappedPts = sb.uncapped ? _SUPPLY_UNCAPPED_PTS : 0;
      supplyPts += uncappedPts;
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

      /* Mcap bracket adjustment — a SIGNED ADDITIVE term, never a
         multiplier. Shares _v2SizeAdjust with the v2 path, so one size
         policy serves both models instead of two that can drift apart.

         It WAS a multiplier until 2026-09-07: <$500M scored x0.85,
         >$50B x1.05. Two things were wrong with that, both measured on
         live data rather than argued from taste:

         1. A multiplier below 1 moves NEGATIVE scores UP. Small-cap
            scores ran -25..67 at the time of the change, so the weakest
            micro caps — exactly the coins the penalty exists to flag —
            were pulled toward zero and OUT of the bottom of the range
            (-25 x 0.85 = -21), while the strongest lost 10 points
            (67 x 0.85 = 57). On the coins it was written for it did the
            opposite of its stated purpose, and since low score is the
            buy zone it dragged them out of it.
         2. It scaled with strength rather than with size: -10 points at
            score 67, -4 at 29, +4 at -25. A size risk adjustment must
            not depend on where the coin currently ranks.

         Not an edge case: 145 of 191 coins on the 2026-09-07 run were
         inside the <$500M bracket, so the "adjustment" was the default
         state for three quarters of the universe.

         Re-clamped, unlike the multiplier, which was deliberately left
         free to overflow on the argument that a 1.05x mega-cap bonus on
         a near-100 score should still read as "very strong". That
         argument is proportional and does not carry over to a flat +2. */
      var sizeAdj = _v2SizeAdjust(c);
      c.score = Math.min(100, Math.max(-50, c.score + sizeAdj));

      c.scoreBreakdown = {layer1, layer2, layer3, supplyPts, deflPts, unlockPts, dxyP7: dxyP7, total3P7: total3P7, sizeAdj, volRatio: _volRatio(c),
        /* Which figure the supply reading came from, and the ratio
           itself. Without these a stored -3 is unreadable: it could be
           the uncapped penalty on a fully-circulating coin or a band
           result on a heavily-locked one. */
        supplyBasis: sb.basis, supplyRatio: sb.ratio, uncappedPts: uncappedPts};
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

  /* ─── Supply basis — ONE reading, two consumers ──────────────────
     Layer 3's supplyPts and insight pillar 5 both ask "how much of this
     token is actually circulating". They asked it twice, in two places,
     both against `max_supply` only. This is that question with one owner.

     WHY IT NEEDED FIXING (2.6.0, measured on the live universe).

     `max_supply` is present for 111 of 166 scorable coins. The other 55
     took a flat `supplyPts = -3` "no max supply" penalty, and pillar 5
     skipped them entirely. So the reading with the WORSE coverage was
     the only one consulted, and the gap was filled with a constant.

     `total_supply` is present for 166 of 166 — every coin that has a
     circulating supply also has a total. It was already being ingested
     into market_cache and thrown away at every seam.

     What the flat -3 actually did, on the 55 coins it applied to:

       circ/total   coins   should score   scored
       >0.90           41           +10       -3     ETH, SOL, TRX, XMR…
       >0.70            6            +5       -3     GLMR, TIA, NEO…
       >0.40            7             0       -3     JTO, FIL, SEI…
       >0.20            1           -15       -3     SAGA

     TRX is 100% circulating and was penalised the same as SAGA at 25%.
     The constant was wrong in both directions at once, and it was wrong
     for a third of the universe.

     THE TWO RATIOS ARE NOT THE SAME QUESTION, and that is why `basis`
     is returned rather than hidden:

       circ / max    dilution against the eventual cap — future minting
       circ / total  liquid against what already exists — vesting, team
                     and treasury lockups

     Where both exist they agree closely (total/max is 1.0000 for most
     coins that have a cap), so falling back does not change what the
     number means for coins already covered. `max` stays preferred when
     present.

     UNCAPPED IS STILL A RISK, and the -3 was partly about that. A coin
     with no max supply can mint forever, which circ/total cannot see.
     So the fallback keeps a flat penalty of the same size on top of the
     band — ETH at 100% circulating scores +10-3 = +7, not +10. What is
     removed is the CONFLATION of "uncapped" with "unmeasurable". */
  function _supplyBasis(c) {
    var circ = (c && c.circulating_supply) || 0;
    var maxS = (c && c.max_supply) || 0;
    var tot  = (c && c.total_supply) || 0;
    if (circ > 0 && maxS > 0) return { ratio: circ / maxS, basis: 'max',   uncapped: false };
    if (circ > 0 && tot  > 0) return { ratio: circ / tot,  basis: 'total', uncapped: true  };
    return { ratio: null, basis: 'none', uncapped: !maxS };
  }

  var _SUPPLY_UNCAPPED_PTS = -3;

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

  /* _quickInsight() was here. DELETED in 2.3.0.

     It was the cross-link's fallback, and its fourth term derived an
     "RSI-style proxy" from a coin's position in the 30-day return
     ranking — relative weakness wearing an RSI label, which is the exact
     defect promptove/28 named when it put real Wilder RSI behind
     candidate classification. Its other three terms (momentum
     acceleration, recovery against 30D, volume × stability) all survive
     as pillars 2 and 4 of _computeInsight(), on the same thresholds.

     Deleted rather than kept unused: an unreachable proxy still reads as
     available to the next person looking for one. */

  /* ── Insight — the 7 forward-looking pillars ───────────────────────
     Moved out of site/js/signals.js in 2.3.0. Answers a different
     question from `score`: score ranks a coin against its peers on what
     has already happened; insight reads the same market for what is
     lining up next. _classifyZones() uses it to refuse a rotation call
     that the forward-looking read flatly contradicts.

     Every threshold below was in the browser, and every value is
     unchanged — this is a move plus the three corrections named in the
     2.3.0 note at the top of the file.

     WHY TWO RSI BAND SETS ARE STILL RIGHT. CANDIDATE_RULES.rsi answers
     "is this pullback oversold enough to publish as a new entry" — a
     binary gate at 45 with an explicit unconfirmed state.
     INSIGHT_RULES.rsi grades the same reading into a contribution to a
     0-100 forward score. Same input, same source, one owner, two
     questions. What was wrong before was not that there were two band
     sets; it was that one of them ran on a number derived from a coin's
     position in a list. */
  var INSIGHT_RULES = {
    /* Pillar 1 — RSI. Real Wilder RSI(14) only. Skipped entirely, not
       approximated, when the coin has none. */
    rsi: { deepOversold: 25, oversold: 38, cooling: 45, warming: 55, hot: 62, overbought: 78,
           pts: { deepOversold: 25, oversold: 14, cooling: 6, warming: -4, hot: -10, overbought: -22 } },

    /* Pillar 2 — momentum. This is the aggregate reading, and it is NOT
       MACD: it compares 7d against 14d and 30d. MACD proper needs candles
       and lives in insightDetail(), where it cannot move a score. The
       labels say "momentum", never "MACD", for that reason. */
    momentum: { fast: 5, slow: 1.5, recovery: 8,
                pts: { fast: 18, slow: 8, fade: -6, drop: -15, recovery: 10, decay: -8 } },

    /* Pillar 4 — turnover. High volume against market cap at a flat
       price is the accumulation reading; the price-stability window is
       the same ±3% the deleted _quickInsight() used. */
    volume: { surge: 0.20, active: 0.08, thin: 0.03, dead: 0.02, largeCap: 5e8, stable24: 3,
              pts: { surgeStable: 25, surge: 12, activeStable: 8, active: 4, deadLarge: -10, thin: -5 } },

    /* Pillar 5 — dilution. Circulating against max supply. */
    supply: { cleared: 0.85, partial: 0.50, heavy: 0.30,
              pts: { cleared: 20, partial: 5, heavy: -20 } },

    /* Pillar 6 — contrarian sentiment. Skipped when the run carries no
       fear & greed reading, rather than defaulting to 50 and quietly
       contributing nothing while reading as though it had been
       consulted. */
    fearGreed: { extremeFear: 25, fear: 40, greed: 65, extremeGreed: 80,
                 pts: { extremeFear: 25, fear: 12, greed: -8, extremeGreed: -20 } },

    /* Pillar 7 — relative strength against BTC on the day. */
    vsBtc: { btcDown: -1, strong: 5, edge: 2, weak: -5, lagging: -2,
             pts: { hidden: 28, strong: 18, edge: 8, lagging: -6, weak: -18 } },

    /* Bands the cross-link and the badge both read. */
    bands: { bullish: 65, bearish: 35 },

    /* Normalisation. NOT the shipped ±140 clamp, and this is the one
       place 2.3.0 deliberately changes a number rather than moving it.

       The pillars are not symmetric: their point budgets sum to +151 on
       the bullish side and −113 on the bearish one, because the
       vocabulary is (turnover alone is +25/−10). Against a flat ±140
       clamp that made a score of 100 reachable and 0 not — the real
       floor was 10 — and it made the bearish band at 35 cost 37% of the
       available downside while the bullish band at 65 cost 28% of the
       upside.

       In the browser that asymmetry was cosmetic: it tilted a badge on a
       visitor's own holdings. Moving the pillars into DERIVE made the
       same number the input to a live zone gate for every coin, and
       measured on the frozen day the ±140 form produced 47 coins above
       65 and NOT ONE below 35 — the cross-link's buy-dampening leg fired
       for nobody. A guardrail that cannot fire is worse than none,
       because it reads as present; that is the finding promptove/28
       recorded about the 80% coverage gate, arriving a second time.

       So each side is normalised over its own budget: 50 is exactly zero
       points, 0 is as bearish as these pillars can say, 100 as bullish.
       The budgets are computed from the rules rather than written down,
       so an override or a retuned pillar cannot silently re-open the
       gap. Measured effect of this over the flat clamp on the frozen
       day: 3 coins below 35 instead of 0, one fewer zone move, and SOL —
       whose three signals were all bearish — correctly keeps its
       dampening instead of becoming a buy.

       NOT the other obvious option: renormalising over the pillars a
       coin actually HAS, the way computeSignalRunV2() renormalises over
       the components it has. Measured on production run 279, where 55 of
       166 coins carry no RSI, that puts 11 of those 55 into a cross-link
       band against this form's 6 — it speaks MORE confidently about a
       coin precisely where a pillar of evidence is missing, which is
       2.2.0's UNCONFIRMED instinct inverted.

       The v2 pattern is safe there and not here because a precondition
       does not travel with it: v2 gates its whole technical layer at
       V2_TECHNICAL_MIN_COVERAGE first, so by the time it renormalises,
       the missing components are noise rather than a third of the
       universe. Insight has no such gate — coverage is structural, ~68%
       live, and permanent. Same arithmetic, different guarantee. */
    normalise: { perSideBudget: true },

    /* Display-only, read by insightDetail(). No score reads these. */
    detail: { bbSqueeze: 4, bbWide: 20, bbLow: 10, bbHigh: 95,
              volSurge: 2, volBreakout: 1.8, volDry: 0.3,
              rsiPeriod: 14, bbPeriod: 20, bbMult: 2 }
  };

  /* The most one coin can score, and the least, given a set of rules.
     Each mutually exclusive if/else chain contributes its largest term;
     momentum is the exception, because its two comparisons (7d vs 14d,
     7d vs 30d) are independent and can both fire. */
  function _insightBudget(r) {
    function best(pts, sign) {
      var v = 0;
      for (var k in pts) {
        if (sign > 0 && pts[k] > v) v = pts[k];
        if (sign < 0 && pts[k] < v) v = pts[k];
      }
      return v;
    }
    var pos = best(r.rsi.pts, 1) + r.momentum.pts.fast + r.momentum.pts.recovery
      + best(r.volume.pts, 1) + best(r.supply.pts, 1) + best(r.fearGreed.pts, 1) + best(r.vsBtc.pts, 1);
    var neg = best(r.rsi.pts, -1) + r.momentum.pts.drop + r.momentum.pts.decay
      + best(r.volume.pts, -1) + best(r.supply.pts, -1) + best(r.fearGreed.pts, -1) + best(r.vsBtc.pts, -1);
    return { positive: pos, negative: Math.abs(neg) };
  }

  function _insightRules(override) {
    function clone(o) {
      var out = {};
      for (var k in o) {
        out[k] = (Object.prototype.toString.call(o[k]) === '[object Object]') ? clone(o[k]) : o[k];
      }
      return out;
    }
    var r = clone(INSIGHT_RULES);
    if (!override) return r;
    for (var ok in override) {
      if (!r[ok]) continue;
      for (var oj in override[ok]) {
        if (Object.prototype.toString.call(override[ok][oj]) === '[object Object]' && r[ok][oj]) {
          for (var om in override[ok][oj]) r[ok][oj][om] = override[ok][oj][om];
        } else r[ok][oj] = override[ok][oj];
      }
    }
    return r;
  }

  /* ── Indicator maths ───────────────────────────────────────────────
     Wilder RSI, EMA, MACD and Bollinger, moved verbatim from
     site/js/signals.js. They were the last financial calculation the
     website performed. Nothing in the SCORE calls _calcMACD or
     _calcBollinger — insightDetail() does, for the tooltip — but they
     belong in the same owner as the rest, so there is one implementation
     rather than one here and one that grows back in a consumer. */
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
    var macdLine = ema12.map(function (v, i) { return v - ema26[i]; });
    var signalLine = _calcEMA(macdLine.slice(26), 9);
    var last = macdLine.length - 1;
    var sigLast = signalLine.length - 1;
    return { line: macdLine[last], signal: signalLine[sigLast], hist: macdLine[last] - signalLine[sigLast] };
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

  /* One coin's insight. Pure in the inputs it is handed: the same coin,
     the same RSI and the same context produce the same number on the
     server and in every browser, which is the whole point of the move.

     `rsi` is null when the coin has none, or when the run-level coverage
     gate says the feed is dead. In both cases pillar 1 is skipped and
     `rsiApplied` on the result says so, rather than the score implying a
     reading that never happened. */
  function _computeInsight(c, rsi, ctx, r) {
    var pts = 0;
    var signals = [];

    /* PILLAR 1 — RSI momentum. Real Wilder RSI(14) or nothing. */
    if (typeof rsi === 'number') {
      var lbl = 'RSI(' + rsi.toFixed(0) + ')';
      if      (rsi <= r.rsi.deepOversold) { pts += r.rsi.pts.deepOversold; signals.push(lbl + ' Oversold'); }
      else if (rsi <= r.rsi.oversold)     { pts += r.rsi.pts.oversold;     signals.push(lbl + ' Low Momentum'); }
      else if (rsi <= r.rsi.cooling)      { pts += r.rsi.pts.cooling;      signals.push(lbl + ' Cooling'); }
      else if (rsi >= r.rsi.overbought)   { pts += r.rsi.pts.overbought;   signals.push(lbl + ' Overbought'); }
      else if (rsi >= r.rsi.hot)          { pts += r.rsi.pts.hot;          signals.push(lbl + ' Hot Zone'); }
      else if (rsi >= r.rsi.warming)      { pts += r.rsi.pts.warming;      signals.push(lbl + ' Warming'); }
    }

    /* PILLAR 2 — momentum shape, from the aggregate returns. */
    var d714 = (c.p7 || 0) - (c.p14 || 0);
    var d730 = (c.p7 || 0) - (c.p30 || 0);
    if      (d714 >  r.momentum.fast) { pts += r.momentum.pts.fast; signals.push('Momentum Accelerating (+' + d714.toFixed(1) + '%)'); }
    else if (d714 >  r.momentum.slow) { pts += r.momentum.pts.slow; signals.push('Momentum Building'); }
    else if (d714 < -r.momentum.fast) { pts += r.momentum.pts.drop; signals.push('Momentum Decelerating (' + d714.toFixed(1) + '%)'); }
    else if (d714 < -r.momentum.slow) { pts += r.momentum.pts.fade; signals.push('Momentum Fading'); }
    if      (d730 >  r.momentum.recovery) { pts += r.momentum.pts.recovery; signals.push('Recovery Trend (+' + d730.toFixed(1) + '% vs 30D)'); }
    else if (d730 < -r.momentum.recovery) { pts += r.momentum.pts.decay;    signals.push('Weakening Trend (' + d730.toFixed(1) + '% vs 30D)'); }

    /* PILLAR 4 — turnover against market cap. (Pillar 3, Bollinger, is
       display-only now — see insightDetail(). The numbering is kept
       because it is the numbering every note and tooltip about this
       already uses.) */
    var vm = (c.volume24 && c.mcap) ? c.volume24 / c.mcap : 0;
    var stable24 = Math.abs(c.p24 || 0) < r.volume.stable24;
    if      (vm > r.volume.surge && stable24)  { pts += r.volume.pts.surgeStable;  signals.push('High Volume + Stable Price (Accumulation)'); }
    else if (vm > r.volume.surge)              { pts += r.volume.pts.surge;        signals.push('High Liquidity Interest'); }
    else if (vm > r.volume.active && stable24) { pts += r.volume.pts.activeStable; signals.push('Moderate Volume Activity'); }
    else if (vm > r.volume.active)             { pts += r.volume.pts.active; }
    else if (vm < r.volume.dead && c.mcap > r.volume.largeCap) { pts += r.volume.pts.deadLarge; signals.push('Low Liquidity (Large Cap)'); }
    else if (vm < r.volume.thin)               { pts += r.volume.pts.thin;         signals.push('Below-Average Volume'); }

    /* PILLAR 5 — dilution shield. */
    /* Same owner as layer 3's supplyPts. Pillar 5 used to read
       max_supply only and skip a third of the universe; see
       _supplyBasis(). It does NOT take the uncapped penalty — this
       pillar grades dilution, and "no cap" is layer 3's concern. */
    var _sb = _supplyBasis(c);
    var supplyRatio = (_sb.ratio != null) ? _sb.ratio : -1;
    if      (supplyRatio >= r.supply.cleared) { pts += r.supply.pts.cleared; signals.push('Supply Cleared (' + Math.round(supplyRatio * 100) + '% Unlocked)'); }
    else if (supplyRatio >= r.supply.partial) { pts += r.supply.pts.partial; }
    else if (supplyRatio >= 0 && supplyRatio < r.supply.heavy) { pts += r.supply.pts.heavy; signals.push('High Dilution Risk (' + Math.round(supplyRatio * 100) + '% Unlocked)'); }

    /* PILLAR 6 — contrarian sentiment, only when the run has a reading. */
    var fg = ctx.fearGreed;
    if (typeof fg === 'number') {
      if      (fg < r.fearGreed.extremeFear)  { pts += r.fearGreed.pts.extremeFear;  signals.push('Extreme Fear (' + fg + ') — historically a contrarian reading'); }
      else if (fg < r.fearGreed.fear)         { pts += r.fearGreed.pts.fear;         signals.push('Fear Zone (' + fg + ')'); }
      else if (fg > r.fearGreed.extremeGreed) { pts += r.fearGreed.pts.extremeGreed; signals.push('Extreme Greed (' + fg + ') — Caution'); }
      else if (fg > r.fearGreed.greed)        { pts += r.fearGreed.pts.greed;        signals.push('Greed Zone (' + fg + ')'); }
    }

    /* PILLAR 7 — relative strength against BTC on the day. */
    var btc24 = ctx.btcP24 || 0;
    var rel = (c.p24 || 0) - btc24;
    if      (btc24 < r.vsBtc.btcDown && (c.p24 || 0) > 0) { pts += r.vsBtc.pts.hidden;  signals.push('Hidden Strength vs BTC (' + (rel >= 0 ? '+' : '') + rel.toFixed(1) + '%)'); }
    else if (rel > r.vsBtc.strong)   { pts += r.vsBtc.pts.strong;  signals.push('Outperforming BTC (+' + rel.toFixed(1) + '%)'); }
    else if (rel > r.vsBtc.edge)     { pts += r.vsBtc.pts.edge;    signals.push('Slight Edge vs BTC (+' + rel.toFixed(1) + '%)'); }
    else if (rel < r.vsBtc.weak)     { pts += r.vsBtc.pts.weak;    signals.push('Underperforming BTC (' + rel.toFixed(1) + '%)'); }
    else if (rel < r.vsBtc.lagging)  { pts += r.vsBtc.pts.lagging; signals.push('Lagging BTC (' + rel.toFixed(1) + '%)'); }

    /* 50 is zero points. Each side is scaled by what that side can
       actually reach — see INSIGHT_RULES.normalise. */
    var budget = _insightBudget(r);
    var score = pts >= 0
      ? Math.round(50 + 50 * Math.min(pts, budget.positive) / budget.positive)
      : Math.round(50 - 50 * Math.min(-pts, budget.negative) / budget.negative);

    return {
      score: score,
      label: score >= r.bands.bullish ? 'STRONG' : score <= r.bands.bearish ? 'WARN' : 'NEUTRAL',
      /* The badge's colour class. Kept on the engine's side because the
         label and the colour are one decision, and splitting them is how
         a consumer ends up owning half a rule. */
      color: score >= r.bands.bullish ? 'insight-buy' : score <= r.bands.bearish ? 'insight-warn' : 'insight-neut',
      signals: signals,
      rsi: (typeof rsi === 'number') ? rsi : null,
      rsiApplied: typeof rsi === 'number',
      fearGreedApplied: typeof fg === 'number',
      points: pts
    };
  }

  /* Extra signal lines from candles, for the tooltip. DISPLAY ONLY —
     it returns strings and readings, never a score, and nothing in
     computeSignalRun() calls it. That separation is the point: candles
     reach at most a handful of symbols in one visitor's browser, so a
     number built from them could not be reproduced by the server or
     matched by the next visitor. Before 2.3.0 the badge did exactly
     that, normalising over 176 points for a coin the visitor held and
     140 for one they did not — two coins with the same reading showed
     different numbers.

     `candles` is { closes: [], volumes: [] } at whatever interval the
     caller loaded (the site passes binance_klines_4h). The interval is
     the caller's to state; the maths does not assume one. */
  function insightDetail(candles, rulesOverride) {
    var r = _insightRules(rulesOverride);
    var d = r.detail;
    var out = { signals: [], rsi: null, macd: null, bb: null, volRatio: null };
    if (!candles || !Array.isArray(candles.closes) || candles.closes.length < 30) return out;

    var closes = candles.closes.map(Number);
    var volumes = (candles.volumes || []).map(Number);
    out.rsi = _calcRSI(closes, d.rsiPeriod);
    out.macd = _calcMACD(closes);
    out.bb = _calcBollinger(closes, d.bbPeriod, d.bbMult);

    if (out.macd.line > out.macd.signal && out.macd.hist > 0) out.signals.push('MACD Bullish Cross');
    else if (out.macd.line < out.macd.signal && out.macd.hist < 0) out.signals.push('MACD Bearish Cross');

    if      (out.bb.width < d.bbSqueeze) out.signals.push('BB Squeeze (width ' + out.bb.width.toFixed(1) + '%) — Breakout Likely');
    else if (out.bb.width > d.bbWide)    out.signals.push('BB Wide — High Volatility');
    if      (out.bb.pctB < d.bbLow)      out.signals.push('Price at Lower Band (' + out.bb.pctB.toFixed(0) + '%B)');
    else if (out.bb.pctB > d.bbHigh)     out.signals.push('Price at Upper Band (' + out.bb.pctB.toFixed(0) + '%B)');

    if (volumes.length >= 26) {
      var recent = volumes.slice(-6).reduce(function (a, b) { return a + b; }, 0) / 6;
      var prior  = volumes.slice(-26, -6).reduce(function (a, b) { return a + b; }, 0) / 20;
      out.volRatio = prior > 0 ? recent / prior : 1;
      if      (out.volRatio > d.volSurge)    out.signals.push('Volume Surge (' + out.volRatio.toFixed(1) + 'x avg)');
      else if (out.volRatio > d.volBreakout) out.signals.push('Volume Breakout (' + out.volRatio.toFixed(1) + 'x avg)');
      else if (out.volRatio < d.volDry)      out.signals.push('Volume Drying Up');
    }
    return out;
  }

  /* Attach c.insight to every coin the zone classifier will look at.
     Called BY _classifyZones() rather than beside it, so the invariant
     "the cross-link always has a real insight to read" holds for any
     caller of either — there is no path left where it silently falls
     back to something else, because there is no longer anything to fall
     back to. */
  function _computeInsights() {
    var r = _insightRules(_insightRulesOverride);
    var btc = null;
    for (var b = 0; b < coins.length; b++) if (coins[b].id === 'bitcoin') { btc = coins[b]; break; }
    var ctx = { fearGreed: _fearGreed, btcP24: btc ? (btc.p24 || 0) : 0 };
    for (var i = 0; i < coins.length; i++) {
      var c = coins[i];
      if (!c || c.isStable || c.dataComplete === false) { c.insight = null; continue; }
      var rsi = _rsiApplied ? _candidateRsi(_candidateTechnical(_technicals, c)) : null;
      c.insight = _computeInsight(c, rsi, ctx, r);
    }
  }

  function _classifyZones() {
    if (typeof coins === 'undefined' || !coins.length) return;
    /* The cross-link needs an insight for every coin it will look at,
       and this is the only caller that guarantees it. */
    _computeInsights();
    var th = _adaptiveThresholds();
    var ir = _insightRules(_insightRulesOverride);
    coins.forEach(function(c) {
      if (!c || c.isStable || c.dataComplete === false) { c._zone = 'neutral'; return; }

      /* Insight↔rotation cross-link.
         If the forward-looking signal strongly disagrees with the
         rotation score, pull the effective score back toward neutral
         (50) so the zone classifier won't trigger.
           · ins ≥65 (bullish ahead) but rot ≥55 (rotation says sell) → dampen sell
           · ins ≤35 (bearish ahead) but rot ≤45 (rotation says buy)  → dampen buy
         Never crosses 50 — only neutralizes the contradiction.

         2.3.0: `ins` is the engine's own insight. It used to be either a
         score the VISITOR'S BROWSER computed (holdings and watchlist
         only) or _quickInsight()'s rank proxy for everything else — two
         different calculations, one of them outside DERIVE, deciding
         between them per coin per visitor. It is now one number from one
         owner. See ARCHITECTURE-MAP.md, gap 1. */
      var s = c.score;
      var ins = c.insight.score;
      if      (ins >= ir.bands.bullish && s >= 55) s = Math.max(50, s - 6);
      else if (ins <= ir.bands.bearish && s <= 45) s = Math.min(50, s + 6);
      c._effectiveScore = s;

      var prev = _lastZone[c.id];
      var z;
      if      (s <= th.buy)                                 z = 'buy';
      else if (s >= th.sell)                                z = 'sell';
      /* Hysteresis hold. The margin is measured from the threshold this
         coin crossed to earn the zone, so the grace it gets is the same
         4 points in every cycle. See _SIG_HYSTERESIS. */
      else if (prev === 'buy'  && s <= th.buy  + _SIG_HYSTERESIS)  z = 'buy';
      else if (prev === 'sell' && s >= th.sell - _SIG_HYSTERESIS)  z = 'sell';
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

    /* `insights` used to be an INPUT here: a caller could hand the
       engine a score computed elsewhere and _classifyZones() would use
       it to move a zone. That was ARCHITECTURE-MAP.md gap 1 in one line,
       and removing the parameter is what actually closes it — the
       pillars are computed here now, so there is no longer anywhere for
       an outside score to get in. `insight` is an OUTPUT. */
    _fearGreed = null;
    if (input.fearGreed != null) {
      /* Accepts the raw number or the { value, label } shape the site
         and market_cache both carry. */
      var fgIn = (typeof input.fearGreed === 'object') ? input.fearGreed.value : input.fearGreed;
      if (fgIn != null && isFinite(Number(fgIn))) _fearGreed = Number(fgIn);
    }
    _technicals = input.technicals || null;
    /* Derivatives, keyed the same way technicals are: by coin id or
       by symbol. Absent for most of the universe, which has no perp. */
    _futures = input.futures || null;
    _insightRulesOverride = input.insightRules || null;
    _rsiApplied = false;   /* set by computeSignalRun() once coverage is measured */
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
      technicalsSupplied: !!(input.technicals && Object.keys(input.technicals).length),
      futuresSupplied: !!(input.futures && Object.keys(input.futures).length),
      fearGreedSupplied: _fearGreed != null,
      inputAges: input.inputAges || null
    };
  }

  /* ── Eligibility ───────────────────────────────────────────────────
     Computed AFTER scoring and kept strictly separate from it: this
     never moves a score, a rank or a zone. It answers a different
     question — "may this coin be published as a candidate" — and every
     consumer is expected to filter on it rather than re-deriving its own
     rules, which is how the website (buy-side only) and the edge
     function (whole universe) ended up excluding delisted coins
     differently in the first place.

     Returns the reasons, not just a boolean, so a run can explain
     itself later. */
  function _eligibility(c, cfg, delistedSet) {
    var reasons = [];
    if (c.isStable) reasons.push('stablecoin');
    if (c.dataComplete === false) reasons.push('incomplete_history');
    if (c.isStock) reasons.push('equity');            /* partial 0-70 scale, not comparable to crypto */
    if (delistedSet[c.sym]) reasons.push('delisted');
    var vol = c.volume24 || 0;
    if (cfg.minVolume24h > 0 && vol < cfg.minVolume24h) reasons.push('illiquid');
    /* A coin reporting no market cap at all is a data failure, not a
       micro-cap: CoinGecko returns this for delisted and migrated
       tokens (FTM after the Sonic migration, OMNI, CFG). They can still
       show real volume, so the liquidity floor alone does not catch
       them — and both engines had a falsy-guard bug that let them slip
       past a market-cap check. Naming it here fixes it in one place. */
    if (!c.mcap || c.mcap <= 0) reasons.push('no_market_cap');
    return { eligible: reasons.length === 0, exclusions: reasons };
  }

  /* ── Candidate classification ──────────────────────────────────────
     Answers "may this coin be presented as a NEW rotate-in entry", which
     is a different question from both `score` (how it ranks) and
     `eligible` (whether it is tradable at all). Kept strictly separate
     from scoring for the same reason _eligibility() is: it must never
     move a score, a rank or a zone. Adding it changes no number the
     golden fixture records.

     It exists because the buy list ranked ASCENDING by v1 score with a
     -40%..-3% drawdown gate and nothing else. That promotes a coin for
     being weak, with no requirement that the fall has stopped, no real
     oversold test, and no upper guard at all — a coin already up 40% in
     a day could be published as a fresh entry on the strength of its
     other components.

     Composition, in the order the rules are applied:

       extreme-move filter  →  pullback precondition  →  falling-knife
       filter  →  RSI oversold confirmation  →  stabilisation

     RSI is CONFIRMATION, not the whole score. Relative weakness alone
     cannot promote a coin (that was the defect), and RSI alone does not
     promote one either — it has to be a pullback that has stopped
     falling AND that RSI agrees is oversold.

     Every threshold lives in CANDIDATE_RULES and nowhere else. No
     consumer re-derives one; they read `candidateClass`.

     Classes:
       CANDIDATE      in a pullback, not accelerating down, RSI-confirmed
       STRONG         no pullback — a fine asset, just not a mean-reversion entry
       EXTENDED       already made an extreme one-day move; not a new entry
       COOLDOWN       ran hard today but short of extreme; wait it out
       FALLING_KNIFE  decline accelerating, or deep with no stabilisation
       NOT_OVERSOLD   in a pullback but RSI does not support the setup
       UNCONFIRMED    RSI is being applied this run but missing for this coin
       null           not eligible — _eligibility() already answered

     Deliberately NOT the same band as _passesMeanRevGate(): that gate
     stops at -40% on the argument that deeper is a different regime.
     Here a coin down 55% that has visibly stopped falling stays a
     candidate, because "heavily oversold but stabilising" is exactly the
     case the stabilisation test was written to keep. The two coexist;
     consumers pick which question they are asking. */
  /* ════════════════════════════════════════════════════════════════
     POSITIONING — derivatives, READ AND PUBLISHED, DELIBERATELY UNWEIGHTED

     Added 2.7.0. This is the whole derivatives feed — funding rate, open
     interest and its 24h change, long/short ratio, taker buy/sell ratio
     — reaching the engine for the first time. It contributes EXACTLY
     ZERO points to any score, and that is the point of the design.

     WHY IT IS HERE AT ALL. Until now this data was fetched by the
     visitor's browser, per coin, on modal open, and rendered. It was
     never part of a run, so it was never stored beside the score it sat
     next to, and no past call could be graded against the positioning
     that existed when it was made. Publishing it in the run fixes that
     whether or not it ever earns a weight.

     WHY IT SCORES NOTHING. Measured 2026-09-10 on binance_futures_history,
     the only history that exists: 462 symbols, hourly, 2026-09-06 to
     2026-09-10. Cross-sectional rank IC of funding against the next 24h
     return, computed per hour and averaged, was +0.021 with t = 2.98 —
     which looks convincing and is not. Sampling a 24h forward return
     every hour counts each return about 24 times, so those 86
     observations are roughly 4 independent ones. On NON-OVERLAPPING
     daily snapshots:

       day      symbols   IC(funding)   IC(long/short)
       09-06        273        +0.084             n/a
       09-07        275        +0.017          -0.003
       09-08        275        -0.116          -0.050
       09-09        271        +0.077          -0.066

     The sign flips. Four independent observations, one regime, inside a
     single week's selloff. There is no weight that this evidence
     supports, and GUARDRAILS.md rule 1 says a threshold is chosen from
     data or not at all.

     WHAT UNBLOCKS IT. binance_futures_history is already accumulating
     hourly. At roughly 30 independent daily cross-sections — about a
     month from now — the same measurement becomes worth acting on, and
     the run-stored `positioning` below is what makes it gradeable
     against the calls actually published.

     So: labelled, stored, shown, and worth zero. */
  var POSITIONING_RULES = {
    /* Funding is per 8h on Binance. 0.01% is the neutral resting rate;
       these are multiples of it, not opinions about fair value. */
    funding:   { heavyLong: 0.05, long: 0.015, short: -0.005, heavyShort: -0.03 },
    /* Open-interest change over 24h, in percent. */
    oi:        { surge: 15, build: 5, unwind: -10 },
    /* Binance's top-trader long/short account ratio. 1.0 is balanced. */
    longShort: { crowdedLong: 1.6, crowdedShort: 0.7 }
  };

  function _positioningRules(o) {
    var r = {};
    for (var k in POSITIONING_RULES) {
      r[k] = {};
      for (var j in POSITIONING_RULES[k]) r[k][j] = POSITIONING_RULES[k][j];
    }
    if (!o) return r;
    for (var ok in o) { if (r[ok]) for (var oj in o[ok]) r[ok][oj] = o[ok][oj]; }
    return r;
  }

  function _num2(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }

  /* One coin's positioning, or null when the coin has no futures market.
     null is not "neutral" — most of the universe has no perp at all, and
     the two must stay distinguishable for exactly the reason pillar 6
     keeps `fearGreed: null` apart from a reading of 50. */
  function _positioning(f, r) {
    if (!f) return null;
    var funding = _num2(f.funding_rate);
    var oiChg   = _num2(f.oi_change_24h_pct);
    var ls      = _num2(f.long_short_ratio);
    var takers  = _num2(f.taker_buy_sell_ratio);
    var oiVal   = _num2(f.open_interest_value);
    if (funding === null && oiChg === null && ls === null) return null;

    var signals = [];
    /* Funding is a rate per 8h expressed as a fraction on Binance's API
       (0.0001 = 0.01%). Compared in percent here, so scale once. */
    var fundPct = funding !== null ? funding * 100 : null;
    var fundState = null;
    if (fundPct !== null) {
      if      (fundPct >= r.funding.heavyLong)  { fundState = 'heavy_long';  signals.push('Funding richly positive (' + fundPct.toFixed(4) + '% per 8h) — longs paying'); }
      else if (fundPct >= r.funding.long)       { fundState = 'long';        signals.push('Funding positive (' + fundPct.toFixed(4) + '% per 8h)'); }
      else if (fundPct <= r.funding.heavyShort) { fundState = 'heavy_short'; signals.push('Funding deeply negative (' + fundPct.toFixed(4) + '% per 8h) — shorts paying'); }
      else if (fundPct <= r.funding.short)      { fundState = 'short';       signals.push('Funding negative (' + fundPct.toFixed(4) + '% per 8h)'); }
      else                                      { fundState = 'neutral'; }
    }

    var oiState = null;
    if (oiChg !== null) {
      if      (oiChg >= r.oi.surge)  { oiState = 'surge';  signals.push('Open interest +' + oiChg.toFixed(1) + '% in 24h'); }
      else if (oiChg >= r.oi.build)  { oiState = 'build';  }
      else if (oiChg <= r.oi.unwind) { oiState = 'unwind'; signals.push('Open interest ' + oiChg.toFixed(1) + '% in 24h — positions closing'); }
      else                           { oiState = 'flat';   }
    }

    var lsState = null;
    if (ls !== null) {
      if      (ls >= r.longShort.crowdedLong)  { lsState = 'crowded_long';  signals.push('Top traders ' + ls.toFixed(2) + ':1 long'); }
      else if (ls <= r.longShort.crowdedShort) { lsState = 'crowded_short'; signals.push('Top traders ' + ls.toFixed(2) + ':1 — short-leaning'); }
      else                                     { lsState = 'balanced'; }
    }

    /* A summary label for display. It names the CROWD, never a call:
       "crowded long" is a description of positioning, not a prediction
       that price falls. The measurement that would justify turning it
       into a prediction does not exist yet. */
    var label = 'NEUTRAL';
    if (fundState === 'heavy_long'  || lsState === 'crowded_long')  label = 'CROWDED LONG';
    else if (fundState === 'heavy_short' || lsState === 'crowded_short') label = 'CROWDED SHORT';
    else if (oiState === 'surge' && fundState === 'long')  label = 'NEW MONEY LONG';
    else if (oiState === 'unwind')                          label = 'UNWINDING';

    return {
      funding: fundPct, fundingState: fundState,
      oiChange24h: oiChg, oiState: oiState, oiValue: oiVal,
      longShort: ls, longShortState: lsState,
      takerBuySell: takers,
      label: label, signals: signals,
      /* Never remove this field, and never let it be non-zero without a
         measurement in the commit that changes it. */
      points: 0, weighted: false
    };
  }

  var CANDIDATE_RULES = {
    /* One-day move. 40% is the "no longer an attractive new entry" line;
       25% is "it ran, let it cool" — separated so the second can be
       loosened without touching the hard guard. */
    extremeMove:   { p24: 40 },
    cooldown:      { p24: 25 },

    /* A pullback is the precondition for a mean-reversion entry. Above
       this, the coin may be perfectly good — it is just not this. */
    pullback:      { enter: -3 },

    /* confirm is the line RSI must be at or below for a pullback to read
       as oversold. oversold/neutralHigh/overbought only label the state
       for consumers; they never gate on their own.

       minCoverage is an OUTAGE guard, not a bias guard, and that is why
       it is 0.35 rather than V2_TECHNICAL_MIN_COVERAGE's 0.80.

       It was 0.80, copied from v2's technical layer, and that was wrong.
       Measured on live data 2026-09-07: real RSI covers 68% of the
       scorable universe, 78% of eligible coins and 50% of the coins
       actually on the buy list — because coin_technicals only exists for
       coins with a Binance USDT pair, and HYPE, XMR, OKB, MNT, KAS and
       ~50 others simply do not have one. That is structural and will not
       improve, so an 80% gate meant the confirmation step never ran at
       all. A guardrail that is permanently inert is worse than none,
       because it reads as present.

       v2's 0.80 is right for v2 and does not transfer. There, RSI is
       BLENDED into a weighted score, so partial coverage silently shifts
       the distribution — the only safe answer is all-or-nothing. Here it
       is a per-coin gate with an explicit third state: a coin with no RSI
       is UNCONFIRMED, which says "not confirmed" rather than quietly
       passing. The bias is already handled per coin, so the run-level
       number has only one job left — noticing that the feed is dead. If
       sync-binance-daily-klines stops, coverage collapses toward zero,
       every coin becomes UNCONFIRMED and the buy list empties silently.
       0.35 catches that while sitting far below the structural floor. */
    rsi:           { oversold: 30, confirm: 45, neutralHigh: 60, overbought: 70, minCoverage: 0.35 },

    /* Falling knife: this week's loss materially larger than last
       week's. accelGap is in percentage points of 7-day return. */
    knife:         { accelGap: 5 },

    /* Stabilisation: this week at or better than the pace the trailing
       30 days implies. A coin down 30% on the month is "on pace" for
       about -7%/week; doing better than that is the evidence of a turn. */
    stabilization: { paceFloor: 0 }
  };

  function _candidateRules(override) {
    var r = {};
    for (var k in CANDIDATE_RULES) {
      r[k] = {};
      for (var j in CANDIDATE_RULES[k]) r[k][j] = CANDIDATE_RULES[k][j];
    }
    if (!override) return r;
    for (var ok in override) {
      if (!r[ok]) continue;
      for (var oj in override[ok]) r[ok][oj] = override[ok][oj];
    }
    return r;
  }

  /* Same lookup v2 uses: technicals may be keyed by CoinGecko id or by
     symbol. `rsi` is the engine's field name; `rsiD` is accepted because
     that is what coin_technicals.rsi14_daily is called once it reaches
     the site, and one alias here is cheaper than a rename at the seam. */
  function _candidateTechnical(technicals, c) {
    if (!technicals) return null;
    return technicals[c.id] || technicals[c.sym] || null;
  }

  function _candidateRsi(t) {
    if (!t) return null;
    if (typeof t.rsi === 'number') return t.rsi;
    if (typeof t.rsiD === 'number') return t.rsiD;
    return null;
  }

  function _rsiState(rsi, r) {
    if (typeof rsi !== 'number') return null;
    if (rsi <= r.oversold)    return 'oversold';
    if (rsi <= r.confirm)     return 'low';
    if (rsi <  r.neutralHigh) return 'neutral';
    if (rsi <  r.overbought)  return 'elevated';
    return 'overbought';
  }

  /* Returns the classification AND the numbers it was reached from, so a
     published call can explain itself later without being re-run. */
  function _classifyCandidate(c, rsi, rules, rsiApplied) {
    var p24 = c.p24 || 0, p7 = c.p7 || 0, p14 = c.p14 || 0, p30 = c.p30 || 0;

    /* priorWeek is days 8-14 backed out of the two cumulative returns.
       Arithmetic, not compounded — the comparison is against recentWeek
       on the same footing, and the gap that matters is points, not a
       precise reconstruction. */
    var pace30     = (p30 * 7) / 30;
    var recentWeek = p7;
    var priorWeek  = p14 - p7;

    var accelerating = recentWeek < 0 && recentWeek < (priorWeek - rules.knife.accelGap);
    var stabilizing  = recentWeek >= (pace30 + rules.stabilization.paceFloor);
    var rsiState     = _rsiState(rsi, rules.rsi);

    var cls, flags = [];
    if (p24 >= rules.extremeMove.p24) {
      cls = 'EXTENDED';      flags.push('extreme_daily_gain');
    } else if (p24 >= rules.cooldown.p24) {
      cls = 'COOLDOWN';      flags.push('large_daily_gain');
    } else if (p30 > rules.pullback.enter) {
      cls = 'STRONG';        flags.push('no_pullback');
    } else if (accelerating) {
      cls = 'FALLING_KNIFE'; flags.push('decline_accelerating');
    } else if (rsiApplied && rsi == null) {
      cls = 'UNCONFIRMED';   flags.push('rsi_missing');
    } else if (rsiApplied && rsi > rules.rsi.confirm) {
      cls = 'NOT_OVERSOLD';  flags.push('rsi_not_oversold');
    } else if (!stabilizing) {
      cls = 'FALLING_KNIFE'; flags.push('no_stabilization');
    } else {
      cls = 'CANDIDATE';
      flags.push(!rsiApplied ? 'rsi_unavailable'
        : rsiState === 'oversold' ? 'rsi_oversold' : 'rsi_low');
      if (stabilizing) flags.push('stabilizing');
    }

    return {
      class: cls,
      flags: flags,
      rsi: (typeof rsi === 'number') ? rsi : null,
      rsiState: rsiState,
      rsiApplied: rsiApplied,
      p24: p24,
      pace30: pace30,
      recentWeek: recentWeek,
      priorWeek: priorWeek,
      accelerating: accelerating,
      stabilizing: stabilizing
    };
  }

  /* ════════════════════════════════════════════════════════════════
     SCORING v2 — additive, opt-in, and side by side with v1.

     v1 above is untouched and still the default. v2 is a separate
     function so the two can be run on the same inputs and diffed. It is
     NOT claimed to be more predictive: that requires the forward-return
     backtest, and until that exists the honest description is "the same
     information, arranged so it can act". What it does fix are four
     defects measured on the 2026-09-05 cross-section:

       1. One number served two jobs with opposite signs. The buy list
          sorted ASCENDING by score, so every penalty promoted a coin and
          every bonus demoted it. v2 returns `strength` (high = strong,
          rank on this) and `setup` (high = better rotate-in candidate,
          sort on this). Neither is ever read upside down.

       2. The 0.85x micro-cap multiplier pushed 109 of 166 coins UP the
          buy list — the opposite of dampening micro-cap noise, and the
          reason the panel filled with $7M names. v2 has no multiplier;
          size enters as a signed term that cannot invert.

       3. L3 carried the widest spread of any layer (sd 9.51) while being
          effectively frozen — 122 of 166 coins shared one value, and 49
          more were penalised merely for having no max_supply field. So
          ~30% of the ordering was a constant. v2 caps tokenomics at 15%
          of the weight and makes "no max supply" neutral rather than
          negative.

       4. L2 expanded to 0.90*p7 - K, one scalar K for every coin, so
          gold/silver/oil/DXY/TOTAL3 could only shift the whole
          distribution, never rank it — and three of those five feeds are
          dead in production anyway. v2 keeps the one genuinely
          coin-specific comparison, versus BTC, on two horizons, and
          reports the rest as context instead of scoring it.

     Weights are explicit and renormalise over whatever data is present,
     so a missing component costs coverage rather than silently becoming
     a neutral vote. Tune them here; every run reports what it used.
     ════════════════════════════════════════════════════════════════ */
  var V2_WEIGHTS = {
    momentum:   0.45,   /* intra-list rank blend, same horizons as v1 */
    relBtc:     0.20,   /* relative strength vs BTC, 7d and 30d       */
    tokenomics: 0.15,   /* supply / deflation / unlock                */
    technical:  0.20    /* RSI, MACD, Bollinger, volume — when supplied */
  };

  /* Technical confirmation is all-or-nothing at the RUN level. Scoring
     some coins with real RSI and leaving the rest at a neutral default
     would differentiate exactly the coins that happen to have data and
     bias everything else to the middle — the same trap as 122 coins
     sharing one tokenomics value. Below this coverage the layer is
     dropped for everyone and the remaining weights renormalise. */
  var V2_TECHNICAL_MIN_COVERAGE = 0.80;

  var _clamp = function (v, lo, hi) { return Math.min(hi, Math.max(lo, v)); };
  /* Map a value onto 0..1 across an expected range, clamped. */
  var _norm = function (v, lo, hi) { return _clamp((v - lo) / (hi - lo), 0, 1); };

  /* Tokenomics, rebalanced to -15..+15 (was -50..+30). Same inputs, same
     ordering of preferences — a quarter of the influence. */
  function _v2Tokenomics(c) {
    var tkx = TOKENOMICS_DB[c.id] || { deflation: 'none', unlockRisk: 'medium' };
    var pts = 0;
    var parts = {};
    var circ = c.circulating_supply, maxS = c.max_supply;
    if (circ && maxS && maxS > 0) {
      var ratio = circ / maxS;
      parts.supply = ratio > 0.90 ? 8 : ratio > 0.70 ? 5 : ratio > 0.40 ? 0 : ratio > 0.20 ? -5 : -8;
    } else {
      /* No max supply is a property of the token's design (ETH, SOL, XMR,
         ATOM and 45 others here), not a red flag. v1 charged -3 for it. */
      parts.supply = 0;
      parts.noMaxSupply = true;
    }
    parts.deflation = tkx.deflation === 'full' ? 4 : tkx.deflation === 'partial' ? 2 : tkx.deflation === 'fixed' ? 2 : 0;
    parts.unlock = tkx.unlockRisk === 'low' ? 0 : tkx.unlockRisk === 'medium' ? -2 : -4;
    if (tkx.unlock30d && tkx.unlock30d > 5) parts.unlock -= 4;
    pts = parts.supply + parts.deflation + parts.unlock;
    parts.total = _clamp(pts, -15, 15);
    return parts;
  }

  /* Relative strength versus BTC on two horizons. This is the only part
     of v1's "macro" layer that varied between coins; the rest was a
     market-wide constant. Both horizons because 7d alone is what made
     the old layer a second copy of the momentum signal. */
  function _v2RelBtc(c, btc) {
    if (!btc) return null;
    var r7 = (c.p7 || 0) - (btc.p7 || 0);
    var r30 = (c.p30 || 0) - (btc.p30 || 0);
    return { rel7: r7, rel30: r30, blended: r7 * 0.5 + r30 * 0.5 };
  }

  /* Size, as a signed term rather than a multiplier. A multiplier below
     1 applied to a negative score raises it; this cannot. */
  function _v2SizeAdjust(c) {
    if (!c.mcap || c.mcap <= 0) return 0;
    if (c.mcap < 100e6) return -4;
    if (c.mcap < 500e6) return -2;
    if (c.mcap > 50e9) return 2;
    return 0;
  }

  /* Technical confirmation from real indicator values. Nothing is
     derived from p7/p14/p30 here on purpose — that information is
     already in the momentum component, and re-encoding it was what made
     v1's layers correlate. */
  function _v2Technical(t) {
    if (!t) return null;
    var pts = 0;
    var signals = [];
    if (typeof t.rsi === 'number') {
      if (t.rsi <= 30)      { pts += 6; signals.push('RSI oversold'); }
      else if (t.rsi <= 45) { pts += 3; signals.push('RSI low'); }
      else if (t.rsi >= 70) { pts -= 6; signals.push('RSI overbought'); }
      else if (t.rsi >= 60) { pts -= 3; signals.push('RSI elevated'); }
    }
    if (t.macd && typeof t.macd.hist === 'number') {
      if (t.macd.line > t.macd.signal && t.macd.hist > 0)      { pts += 5; signals.push('MACD bullish'); }
      else if (t.macd.line < t.macd.signal && t.macd.hist < 0) { pts -= 5; signals.push('MACD bearish'); }
    }
    if (t.bb && typeof t.bb.pctB === 'number') {
      if (t.bb.pctB < 10)      { pts += 4; signals.push('at lower band'); }
      else if (t.bb.pctB > 90) { pts -= 4; signals.push('at upper band'); }
    }
    if (typeof t.volRatio === 'number') {
      if (t.volRatio >= 2)        { pts += 5; signals.push('volume surge'); }
      else if (t.volRatio >= 1.5) { pts += 3; signals.push('volume rising'); }
      else if (t.volRatio < 0.5)  { pts -= 3; signals.push('volume drying up'); }
    }
    return { points: _clamp(pts, -20, 20), signals: signals };
  }

  /* Setup quality — a rotate-in candidate's score, high = better.
     Answers "is this a pullback that has stopped falling", which is the
     question v1 had no way to ask: its buy list was "coins that fell,
     ranked by how weak they are", with nothing requiring evidence that
     the fall had ended. Only meaningful for eligible coins. */
  function _v2Setup(c, tech, rel) {
    var p30 = c.p30 || 0, p7 = c.p7 || 0;
    var parts = {};

    /* Drawdown depth: best around -25%..-10%, worthless outside the
       mean-reversion band. Continuous, so -2.9% and -3.1% are no longer
       different worlds. */
    parts.drawdown = p30 >= -3 || p30 <= -40 ? 0
      : p30 >= -10 ? _norm(p30, -3, -10)
      : p30 >= -25 ? 1
      : _norm(p30, -40, -25);

    /* A pullback is a PRECONDITION, not a weighted opinion. Without this
       a coin with no drawdown at all still scored ~50 on the strength of
       the other components — UNI and ARB, both up 40%+ on the week, came
       out as top "rotate-in setups". Outside the band there is no setup
       to score. */
    if (parts.drawdown === 0) return { drawdown: 0, score: null, reason: 'not_in_pullback' };

    /* Has the fall stopped? Compare the last 7 days against the pace the
       trailing 30 days implies. A coin down 30% over a month is "on pace"
       for about -7% a week; doing better than that is the signal, and
       measuring it this way stops a deep drawdown from flattering every
       candidate equally. */
    parts.turning = _norm(p7 - (p30 * 7) / 30, -8, 12);

    /* Confirmation, when technicals are available for this coin. */
    parts.confirmation = tech ? _norm(tech.points, -10, 15) : null;

    /* Not falling behind BTC while it recovers. */
    parts.vsBtc = rel ? _norm(rel.rel7, -12, 12) : null;

    /* Depth is deliberately the SMALLEST weight. Being down a lot is the
       entry ticket, not the case — weighting it heavily is what made v1's
       buy list "coins that fell, ranked by how far", with nothing asking
       whether the fall had stopped. The evidence of a turn carries the
       score. */
    var w = { drawdown: 0.15, turning: 0.40, confirmation: 0.30, vsBtc: 0.15 };
    var sum = 0, wsum = 0;
    for (var k in w) {
      if (parts[k] == null) continue;
      sum += w[k] * parts[k];
      wsum += w[k];
    }
    parts.score = wsum > 0 ? Math.round((sum / wsum) * 100) : null;
    return parts;
  }

  /* ════════════════════════════════════════════════════════════════
     WHAT CHANGED — run-over-run movement (2.4.0)

     The homepage brief wants to open with "ONDO moved 12 places higher
     in the relative-strength ranking". That sentence is a DERIVE
     output, not a page feature, and the distinction is the whole
     reason this lives here.

     If the website composed it, the Telegram bot, the alerts function
     and anything downstream would each grow their own version from the
     same rows, and within a month they would disagree about what
     changed — the exact failure the insight extraction spent 2.3.0
     undoing (ARCHITECTURE-MAP gap 1). One run, one set of facts, every
     surface formats the SAME object.

     This function reports movement. It deliberately does not write
     prose: it emits which symbol moved, from what, to what, and out of
     how many. Wording is a consumer's job; the facts are not.

     PURE. The previous run arrives as input.previous — the engine
     never fetches. No previous (a cold start, the golden fixture, the
     first run after a reset) returns null, which reads as "no
     comparison available" and is different from "nothing changed".

     ADDITIVE. Touches no score, zone, rank, eligibility or class. It
     only compares two runs that already exist.

     THREE THINGS THAT WILL BITE ANYONE EDITING THIS

     1. Rank 1 is the STRONGEST, so an improving coin's rank NUMBER goes
        DOWN. `places` is reported as a positive count in the direction
        named by the list, never as a signed delta, so a consumer cannot
        invert it by accident.

     2. Ranks are PER ASSET CLASS. Measured on run 320: crypto ranks
        1-166, bStocks 1-23. Twelve places in a 23-asset universe is a
        different statement from twelve in 166, so every rank entry
        carries `of` and the consumer can say which. The class map is
        passed IN: _projectItem() does not carry assetType, and
        compute-signal-run's index.ts says plainly that asset_type
        cannot come from the item. This does not change that.

     3. Rank 0 is NOT a rank. It is the unranked sentinel — exactly one
        per asset class on run 320, both with p30 = 0. A coin crossing
        between 0 and a real rank would otherwise generate a confident
        "moved 87 places" out of nothing.

     And one that bit during development: `previous` arrives from
     PostgREST, which returns `numeric` columns as STRINGS depending on
     the path. Every value off the previous run goes through _num().
     ════════════════════════════════════════════════════════════════ */
  var CHANGE_RULES = {
    /* MEASURED, not guessed. Against production runs over a 24-hour
       window (191 coins, 2026-09-09):

         score delta   p50 4   p75 7    p90 12   p95 17   max 33
         rank  delta   p50 4   p75 10   p90 17   p95 24   max 82

       The first draft of this file used 3 and 5, which sit at the
       MEDIAN — they would have called half the market "notable" and the
       counts would have meant nothing. These sit just under p90, so
       roughly the top tenth of movers qualify.

       They are calibrated for a ~24h comparison, which is the window
       the caller is expected to pass and the one a DAILY brief means.
       Over 15 minutes nothing crosses them, correctly: measured on
       adjacent runs, the largest score move in the whole universe was
       ZERO. Market data does not refresh every 15 minutes, so adjacent
       runs are near-identical by construction. */
    minRankDelta:   15,
    minScoreDelta:  10,
    /* Movement is not reported for a coin excluded for one of these
       reasons. Measured on run 375: NTRN was the single biggest mover in
       the universe at 89 places, on $686 of daily volume — six hundred
       and eighty-six dollars. SRM was another, at $31.8k. A rank that
       moves because almost nothing traded is not market information, and
       it was leading the briefing.

       `delisted` is deliberately NOT here. XMR is excluded for it while
       turning $117.9M a day against a $9.5B cap; its 25-place move is
       real and a reader should see it. Same eligible=false verdict, two
       completely different meanings — which is why this filters on the
       REASON and not on the flag.

       `equity` is absent too: bStocks are ranked in their own universe
       (1-23 on run 375) and move within it legitimately. */
    suppress: ['illiquid', 'no_market_cap', 'incomplete_history'],
    /* How many to carry per list. The counts are reported separately,
       so a truncated list never reads as the complete story. */
    topN:           5,
    maxTransitions: 20
  };

  function _changeRules(o) {
    var r = {};
    for (var k in CHANGE_RULES) r[k] = CHANGE_RULES[k];
    if (o) for (var j in o) {
      if (r[j] == null) continue;
      if (typeof o[j] === 'number') r[j] = o[j];
      else if (Array.isArray(o[j]) && Array.isArray(r[j])) r[j] = o[j].slice();
    }
    return r;
  }

  /* PostgREST hands back numerics as strings on some paths. */
  function _num(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }

  /* Does this item's exclusion reason mean its movement should not be
     reported? Reads `exclusions`, which _eligibility() puts on every item
     — so it asks WHY a coin is ineligible, never just whether it is. */
  function _suppressed(it, rules) {
    var ex = (it && it.exclusions) || [];
    if (!ex.length) return false;
    var sup = (rules && rules.suppress) || CHANGE_RULES.suppress;

    /* A tokenised equity has no token market cap, because it is not a
       token — so _eligibility() stamps it `no_market_cap` and that is
       definitional, not a data failure. Suppressing bStocks for it would
       have dropped all 24 of them from movement while they rank
       perfectly well in their own 1-23 universe. For an equity, that one
       reason does not count; every other suppression reason still does,
       so an illiquid bStock is still dropped. */
    var isEquity = ex.indexOf('equity') >= 0;

    for (var i = 0; i < ex.length; i++) {
      var r = ex[i];
      if (isEquity && r === 'no_market_cap') continue;
      if (sup.indexOf(r) >= 0) return true;
    }
    return false;
  }

  /* Identity for the diff. `id` is the coin id and is unique; `sym` is
     not (see the FRAX note below). The previous run may arrive from
     PostgREST, where the column is coin_id. */
  function _changeKey(x) {
    if (!x) return null;
    return x.id || x.coinId || x.coin_id || x.sym || null;
  }

  /* Rank 0 and null both mean "not ranked" — see note 3 above. */
  function _ranked(v) {
    var n = _num(v);
    return (n != null && n > 0) ? n : null;
  }

  /* sym -> asset class, for the rank universe. Built from `coins`,
     which is where isStock lives; the projected item does not carry
     it and this does not change that. */
  function _typeBySym() {
    var m = {};
    for (var i = 0; i < coins.length; i++) m[coins[i].sym] = coins[i].isStock ? 'bstock' : 'crypto';
    return m;
  }

  function _computeChanges(items, prev, rules, typeBySym) {
    if (!items || !items.length || !prev || !prev.length) return null;
    var R = rules || _changeRules();

    /* Keyed by coin ID, never by symbol. On the frozen fixture FRAX is
       TWO coins — `frax` (the stablecoin, score 0) and `frax-share`
       (FXS, score 9) — both projecting sym 'FRAX'. A symbol-keyed map
       keeps the last one, so the other coin diffs against a stranger
       and reports a 9-point move on an IDENTICAL rerun. That would have
       been a permanent false line in the brief. */
    var before = {};
    for (var p = 0; p < prev.length; p++) {
      var pk = _changeKey(prev[p]);
      if (pk) before[pk] = prev[p];
    }

    /* How big is each ranked universe THIS run — the `of` in
       "12 places of 166". Counted, not assumed. */
    var universe = {};
    for (var u = 0; u < items.length; u++) {
      if (items[u].isStable) continue;
      if (_suppressed(items[u], R)) continue;
      if (_ranked(items[u].r30) == null) continue;
      var ut = (typeBySym && typeBySym[items[u].sym]) || 'crypto';
      universe[ut] = (universe[ut] || 0) + 1;
    }

    var rankImproved = [], rankDeclined = [];
    var scoreGained = [], scoreLost = [];
    var zoneMoves = [], classMoves = [];
    var entered = [], seen = {}, compared = 0;

    for (var i = 0; i < items.length; i++) {
      var it = items[i], k = _changeKey(it);
      /* Excluded for a reason that makes movement meaningless — see
         CHANGE_RULES.suppress. Marked SEEN like a stablecoin so a caller
         is not told the coin left the universe. */
      if (_suppressed(it, R)) { seen[k] = true; continue; }
      /* Stablecoins are not scored, not ranked, and never reach
         signal_run_items — the run insert filters them. They carry no
         RSI, no class and no insight; the product shows them for their
         yield APR and nothing else. Diffing them would report all ten
         as newly "entered" on every single run, because the previous
         run read back from the database has never contained one.

         Marked SEEN before skipping, deliberately: a caller that does
         hand one in must not then see it reported as having LEFT the
         universe. Known, but not part of movement. */
      if (it.isStable) { seen[k] = true; continue; }
      var was = before[k];
      seen[k] = true;
      if (!was) { entered.push(it.sym); continue; }
      compared++;

      var type = (typeBySym && typeBySym[it.sym]) || 'crypto';

      /* ── rank ── both must be genuinely ranked */
      var rNow = _ranked(it.r30), rWas = _ranked(was.r30);
      if (rNow != null && rWas != null) {
        var places = rWas - rNow;           /* >0 == toward rank 1 */
        var entry = {
          id: it.id, sym: it.sym, from: rWas, to: rNow,
          places: Math.abs(places), of: universe[type] || null, assetType: type
        };
        if (places >= R.minRankDelta) rankImproved.push(entry);
        else if (-places >= R.minRankDelta) rankDeclined.push(entry);
      }

      /* ── score ── */
      var sNow = _num(it.score), sWas = _num(was.score);
      if (sNow != null && sWas != null) {
        var d = sNow - sWas;
        var se = { id: it.id, sym: it.sym, from: sWas, to: sNow, delta: Math.round(d * 100) / 100 };
        if (d >= R.minScoreDelta) scoreGained.push(se);
        else if (-d >= R.minScoreDelta) scoreLost.push(se);
      }

      /* ── zone and class ── every transition matters, none is noise,
         so there is no threshold here. Null-to-null is not a move. */
      if (it.zone !== was.zone && (it.zone != null || was.zone != null)) {
        zoneMoves.push({ id: it.id, sym: it.sym, from: was.zone || null, to: it.zone || null });
      }
      var cNow = it.candidateClass || null;
      var cWas = (was.candidateClass !== undefined ? was.candidateClass : was.candidate_class) || null;
      if (cNow !== cWas) classMoves.push({ id: it.id, sym: it.sym, from: cWas, to: cNow });
    }

    var left = [];
    for (var w = 0; w < prev.length; w++) {
      var wk = _changeKey(prev[w]);
      if (wk && !seen[wk]) left.push(prev[w].sym || wk);
    }

    function topBy(arr, key, n) {
      return arr.slice().sort(function (a, b) { return b[key] - a[key]; }).slice(0, n);
    }

    return {
      compared: compared,
      entered: entered,
      left: left,
      /* Lists are truncated; the counts beside them are not. A consumer
         saying "5 coins strengthened" when 23 did would be a lie the
         data did not tell it to make. */
      rank: {
        improved: topBy(rankImproved, 'places', R.topN),
        declined: topBy(rankDeclined, 'places', R.topN),
        improvedCount: rankImproved.length,
        declinedCount: rankDeclined.length
      },
      score: {
        gained: topBy(scoreGained, 'delta', R.topN),
        lost: topBy(scoreLost.map(function (x) {
          return { id: x.id, sym: x.sym, from: x.from, to: x.to, delta: x.delta, _mag: -x.delta };
        }), '_mag', R.topN).map(function (x) {
          return { id: x.id, sym: x.sym, from: x.from, to: x.to, delta: x.delta };
        }),
        gainedCount: scoreGained.length,
        lostCount: scoreLost.length
      },
      zoneTransitions: zoneMoves.slice(0, R.maxTransitions),
      zoneTransitionCount: zoneMoves.length,
      classTransitions: classMoves.slice(0, R.maxTransitions),
      classTransitionCount: classMoves.length,
      /* Reported with the run, like `candidates.rules` — a stored brief
         can say which thresholds decided what counted as a move. */
      rules: R
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
      /* `quickInsight` was here — the number the cross-link used, which
         was _quickInsight()'s rank proxy on all but a visitor's own
         holdings. 2.3.0 replaced it with the engine's insight, and the
         field carries the whole reading rather than one number, because
         a stored run that says only "48" cannot explain itself later.
         Nothing outside the engine ever read `quickInsight`: the site
         assigned it to c._quickIns and no file read that back. */
      insight: c.insight || null,
      /* Derivatives positioning. null means NO PERP MARKET, which is
         not the same as balanced positioning — see _positioning(). */
      positioning: c.positioning || null,
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
   *   technicals      {object=} coinId|sym -> { rsi }. Real Wilder
   *                             RSI(14) from coin_technicals. Feeds BOTH
   *                             candidate confirmation and insight
   *                             pillar 1; one feed, one coverage gate.
   *   fearGreed       {number|object=} the index value, or the
   *                             { value, label } row. Absent means
   *                             pillar 6 is skipped, not neutral.
   *   candidateRules  {object=} override CANDIDATE_RULES.
   *   insightRules    {object=} override INSIGHT_RULES.
   *   inputAges       {object=} recorded into dataQuality, not used in maths.
   *
   *   `insights` was an input until 2.3.0 and is not one any more: it
   *   let a caller hand in a score that moved a zone. Insight is an
   *   OUTPUT now, on every item.
   * @returns {object} { engineVersion, asOf, thresholds, cycleLabel,
   *                     items, zones, volumeHistory, dataQuality }
   */
  function computeSignalRun(input) {
    if (!input || !input.asOf) throw new Error('rotator-engine: input.asOf is required');
    if (!input.coins || !input.coins.length) throw new Error('rotator-engine: input.coins is empty');

    _loadState(input);
    _deriveBtcAnchors(input);

    computeScores();

    /* RSI coverage is measured BEFORE the zones are classified, because
       from 2.3.0 two things depend on it and they must agree: candidate
       classification's confirmation step, and the insight pillars the
       cross-link reads. One measurement, one verdict, one feed. If
       sync-binance-daily-klines dies, both switch off together instead
       of insight quietly confirming on whichever rows are still there. */
    var candRules = _candidateRules(input.candidateRules);
    var candTech = input.technicals || null;
    var classifiable = 0, withRsi = 0;
    for (var q = 0; q < coins.length; q++) {
      if (coins[q].isStable || coins[q].dataComplete === false || coins[q].isStock) continue;
      classifiable++;
      if (_candidateRsi(_candidateTechnical(candTech, coins[q])) != null) withRsi++;
    }
    var rsiCoverage = classifiable ? withRsi / classifiable : 0;
    var rsiApplied = rsiCoverage >= candRules.rsi.minCoverage;
    _rsiApplied = rsiApplied;

    /* _classifyZones() computes the insights it needs. */
    _classifyZones();

    /* Eligibility is layered on after the fact — see _eligibility(). */
    var cfg = {
      minVolume24h: (input.eligibility && input.eligibility.minVolume24h != null)
        ? input.eligibility.minVolume24h : ELIGIBILITY_DEFAULTS.minVolume24h
    };
    var delistedSet = {};
    var dl = (input.eligibility && input.eligibility.delisted) || input.delisted || [];
    for (var d = 0; d < dl.length; d++) delistedSet[dl[d]] = true;

    /* Candidate classification. `rsiApplied` (measured above) is a
       feed-alive check, not a coverage-quality one — see
       CANDIDATE_RULES.rsi.minCoverage for why that differs from v2's
       technical layer. When the feed is dead the classifier says so on
       every item rather than pretending confirmation happened, or
       silently emptying the buy list. */
    var candCounts = {};
    var insightCounts = {};
    var posCounts = {};
    /* Derivatives positioning, computed once per coin, worth zero points.
       Counted like the other classifications so a run says how much of
       the universe even has a perp market. */
    var posRules = _positioningRules(input.positioningRules);
    var posCovered = 0;
    for (var pz = 0; pz < coins.length; pz++) {
      coins[pz].positioning = _positioning(_candidateTechnical(_futures, coins[pz]), posRules);
      if (coins[pz].positioning) posCovered++;
    }
    var items = [];
    for (var i = 0; i < coins.length; i++) {
      var item = _projectItem(coins[i]);
      if (item.positioning) posCounts[item.positioning.label] = (posCounts[item.positioning.label] || 0) + 1;
      if (item.insight) insightCounts[item.insight.label] = (insightCounts[item.insight.label] || 0) + 1;
      var el = _eligibility(coins[i], cfg, delistedSet);
      item.eligible = el.eligible;
      item.exclusions = el.exclusions;

      /* Only eligible coins get a class. _eligibility() has already
         answered for the rest, and giving an untradable coin a
         CANDIDATE label would be a second, softer gate. */
      if (el.eligible) {
        var cand = _classifyCandidate(
          coins[i], _candidateRsi(_candidateTechnical(candTech, coins[i])), candRules, rsiApplied);
        item.candidateClass = cand.class;
        item.rsi = cand.rsi;
        item.rsiState = cand.rsiState;
        item.candidate = cand;
        candCounts[cand.class] = (candCounts[cand.class] || 0) + 1;
      } else {
        item.candidateClass = null;
        item.rsi = null;
        item.rsiState = null;
        item.candidate = null;
      }
      items.push(item);
    }

    return {
      engineVersion: ENGINE_VERSION,
      /* Which MATHS ran, as distinct from which module version shipped.
         Without this, a stored signal can name the engine build but not
         the scoring model — and from 2.0.0 the same build can run either.
         v1 runs say so explicitly rather than by omission. */
      scoringVersion: 'v1',
      asOf: input.asOf,
      thresholds: _adaptiveThresholds(),
      /* How far past those lines a zone survives, in score points, and
         a sibling of `thresholds` rather than a key inside it: the
         golden compares that object whole, and a run's zone lines are
         the one thing in it that must never quietly gain a field.

         Reported for the same reason `candidates.rules` is. A stored
         run whose item sits at 42 in the buy zone is unreadable without
         it — 42 is above the buy line, and only the margin says whether
         that is hysteresis or a bug. */
      hysteresis: _SIG_HYSTERESIS,
      cycleLabel: _btcCycleLabel(),
      eligibility: cfg,
      universeSize: coins.length,
      eligibleCount: items.filter(function(it) { return it.eligible; }).length,
      items: items,
      /* The state the run produced. Persist these rather than leaving
         them in one visitor's browser. */
      zones: JSON.parse(_store.rot_last_zone || '{}'),
      volumeHistory: JSON.parse(_store[_VOL_HIST_KEY] || '{}'),
      /* Every threshold the classification used, reported with the run.
         A stored run can be re-read years later and say which rules
         produced its labels, the same way `thresholds` does for zones. */
      /* Derivatives positioning, with the rules that labelled it and how
         much of the universe it reached. `weighted: false` is asserted in
         the run, not just in a comment, so a stored call can prove this
         data did not move its score. See _positioning(). */
      positioning: {
        rules: posRules,
        covered: posCovered,
        universe: coins.length,
        counts: posCounts,
        weighted: false
      },
      candidates: {
        rules: candRules,
        rsiCoverage: Math.round(rsiCoverage * 1000) / 1000,
        rsiApplied: rsiApplied,
        classifiableCount: classifiable,
        counts: candCounts
      },
      /* The same treatment for the insight pillars: every threshold that
         produced these labels, reported with the run, so a stored call
         can still explain itself after they are next tuned.

         `fearGreed` is echoed rather than assumed. Pillar 6 is skipped
         when the run has no reading, and a run that says null there is
         saying "sentiment was not consulted" — which is a different
         statement from "sentiment was neutral", and the one a reader
         needs when a score looks lower than they expected. */
      insights: {
        rules: _insightRules(_insightRulesOverride),
        /* The point budget the scores were normalised over. Derived from
           the rules, reported with the run, so a stored insight score is
           readable as "N% of the way to what these pillars could say"
           years later rather than as a bare number on an unstated scale. */
        budget: _insightBudget(_insightRules(_insightRulesOverride)),
        fearGreed: _fearGreed,
        rsiApplied: rsiApplied,
        counts: insightCounts
      },
      /* What moved since the previous run. null when the caller did
         not supply one — "no comparison available", which is not the
         same statement as "nothing changed". See _computeChanges(). */
      changes: _computeChanges(items, input.previous, _changeRules(input.changeRules), _typeBySym()),
      dataQuality: _dataQuality(input)
    };
  }

  /**
   * Score one market snapshot with the v2 model.
   *
   * Deliberately a SUPERSET of computeSignalRun(): every v1 field is
   * still present and still computed by the untouched v1 code, so a
   * consumer can adopt `strength`/`setup` at its own pace and the two
   * models can be diffed on identical inputs. Same input contract, plus:
   *
   *   technicals  {object=} coinId -> { rsi, macd:{line,signal,hist},
   *                                     bb:{pctB}, volRatio }
   *   weights     {object=} override V2_WEIGHTS
   *
   * Adds per item:
   *   strength  0-100, high = relative strength. Rank on this.
   *   setup     0-100, high = better rotate-in candidate, null when the
   *             coin is not eligible or has no mean-reversion setup.
   *             Sort candidates on this, DESCENDING.
   *   v2        the component breakdown, so a score can explain itself.
   */
  function computeSignalRunV2(input) {
    var run = computeSignalRun(input);
    var w = {};
    for (var wk in V2_WEIGHTS) w[wk] = V2_WEIGHTS[wk];
    if (input.weights) for (var ok in input.weights) w[ok] = input.weights[ok];

    var technicals = input.technicals || null;
    var scorable = [];
    for (var s = 0; s < coins.length; s++) {
      if (!coins[s].isStable && coins[s].dataComplete !== false) scorable.push(coins[s]);
    }
    var withTech = 0;
    if (technicals) {
      for (var t = 0; t < scorable.length; t++) {
        if (technicals[scorable[t].id] || technicals[scorable[t].sym]) withTech++;
      }
    }
    var coverage = scorable.length ? withTech / scorable.length : 0;
    var useTechnical = coverage >= V2_TECHNICAL_MIN_COVERAGE;

    var btc = null;
    for (var b = 0; b < coins.length; b++) if (coins[b].id === 'bitcoin') btc = coins[b];
    var n = Math.max(scorable.length - 1, 1);

    var byId = {};
    for (var m = 0; m < run.items.length; m++) byId[run.items[m].id] = run.items[m];

    for (var i = 0; i < coins.length; i++) {
      var c = coins[i];
      var item = byId[c.id];
      if (!item) continue;
      if (c.isStable || c.dataComplete === false) {
        item.strength = null; item.setup = null; item.v2 = null;
        continue;
      }

      /* Momentum: the same weighted rank blend v1 uses. Measured on the
         fixture, re-weighting these horizons moved the ranking by rho
         0.99, so they are deliberately left alone — the gain was never
         here. */
      var wAvg = c.r7 * 0.25 + c.r14 * 0.30 + c.r30 * 0.45;
      var momentum = _clamp(1 - (wAvg - 1) / n, 0, 1);

      var rel = _v2RelBtc(c, btc);
      var tok = _v2Tokenomics(c);
      var techRaw = useTechnical
        ? _v2Technical(technicals[c.id] || technicals[c.sym]) : null;

      var comp = {
        momentum: momentum,
        relBtc: rel ? _norm(rel.blended, -30, 30) : null,
        tokenomics: _norm(tok.total, -15, 15),
        technical: techRaw ? _norm(techRaw.points, -20, 20) : null
      };

      var sum = 0, wsum = 0, missing = [];
      for (var ck in comp) {
        if (comp[ck] == null) { missing.push(ck); continue; }
        sum += w[ck] * comp[ck];
        wsum += w[ck];
      }
      var strength = wsum > 0 ? (sum / wsum) * 100 : null;
      /* Size as a signed adjustment, never a multiplier. */
      var sizeAdj = _v2SizeAdjust(c);
      if (strength != null) strength = _clamp(Math.round(strength + sizeAdj), 0, 100);

      var setup = null;
      if (item.eligible) {
        var sp = _v2Setup(c, techRaw, rel);
        setup = sp.score;
        item.v2setup = sp;
      }

      item.strength = strength;
      item.setup = setup;
      item.v2 = {
        components: comp,
        weightsUsed: w,
        missingComponents: missing,
        sizeAdjust: sizeAdj,
        tokenomics: tok,
        relBtc: rel,
        technical: techRaw
      };
    }

    run.scoringVersion = 'v2';
    run.v2 = {
      weights: w,
      technicalCoverage: Math.round(coverage * 1000) / 1000,
      technicalApplied: useTechnical,
      technicalMinCoverage: V2_TECHNICAL_MIN_COVERAGE,
      scorableCount: scorable.length,
      /* Reported, not scored. v1 fed these into every coin's score as a
         shared constant, which could shift the distribution but never
         rank it — and three of the five feeds are dead in production. */
      macroContext: {
        goldP7: _macroData.goldP7, silverP7: _macroData.silverP7,
        oilP7: _macroData.oilP7, dxyP7: _macroData.dxyP7,
        total3P7: _macroData.total3P7, btcP7: _macroData.btcP7
      },
      mayer: marketCycleData.BTC ? marketCycleData.BTC.mayer_multiple : null
    };
    return run;
  }

  return {
    ENGINE_VERSION: ENGINE_VERSION,
    computeSignalRun: computeSignalRun,
    computeSignalRunV2: computeSignalRunV2,
    V2_WEIGHTS: V2_WEIGHTS,
    CANDIDATE_RULES: CANDIDATE_RULES,
    INSIGHT_RULES: INSIGHT_RULES,
    /* Candle-derived signal lines for a tooltip. Display only — it
       returns no score, and no run calls it. See its own note. */
    insightDetail: insightDetail,
    /* Exposed for tests and for callers that need one piece in isolation.
       These are the extracted originals, not re-implementations. */
    internals: {
      computeScores: computeScores,
      classifyZones: _classifyZones,
      adaptiveThresholds: _adaptiveThresholds,
      passesMeanRevGate: _passesMeanRevGate,
      btcCycleLabel: _btcCycleLabel,
      volRatio: _volRatio,
      trackVolumeHistory: _trackVolumeHistory,
      classifyCandidate: _classifyCandidate,
      candidateRules: _candidateRules,
      rsiState: _rsiState,
      computeInsight: _computeInsight,
      insightRules: _insightRules,
      calcRSI: _calcRSI,
      calcMACD: _calcMACD,
      calcBollinger: _calcBollinger,
      insightBudget: _insightBudget,
      computeChanges: _computeChanges,
      changeRules: _changeRules
    }
  };
}));
