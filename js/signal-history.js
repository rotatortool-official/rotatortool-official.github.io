/* ══════════════════════════════════════════════════════════════════
   signal-history.js — "Told You So" Signal Track Record

   FEATURES:
   • Takes a daily snapshot of top rotation signals (top 10 bullish + top 10 lagging)
   • Stores up to 30 days of history in localStorage (~5kb/day)
   • After 7 and 14 days, compares price performance
   • Shows a "Signal Track Record" section with proven correct calls
   • Generates shareable "Told You So" cards via canvas

   DEPENDS ON: coins array, shareAsImage patterns, data-loaders.js
══════════════════════════════════════════════════════════════════ */

var SignalHistory = (function() {

  var LS_KEY = 'rot_signal_history';
  var LS_DATE_KEY = 'rot_signal_history_posted';  /* last YYYY-MM-DD we posted */
  var LS_ROT_DATE_KEY = 'rot_rotation_history_posted';
  /* LS_PEAK_KEY and its cached verdicts are gone: a market-relative
     grade is a pure function of the candles, so there is nothing worth
     persisting and no stale verdict that can outlive a fix in a
     visitor's browser. */
  var MAX_DAYS = 30;

  /* ── Scoring window tunables ──────────────────────────────────
     HORIZON_DAYS       the window every call is measured over.
     CONFIRM_DAYS_MIN   and therefore when a call becomes gradeable.
     ROTATION_THRESHOLD spread the target must beat the source by.

     A call is graded on whether the coin BEAT THE MEDIAN COIN over
     HORIZON_DAYS. There is no absolute bar, no peak capture, no lock-in
     and no adverse multiple, because there is no threshold for price to
     sneak across: the benchmark moves with the market, so the null is
     50% and volatility cannot clear it.

     Retired 2026-09-17: CONFIRM_THRESHOLD (2), PEAK_WINDOW_DAYS (14),
     ADVERSE_MULTIPLE (3) and the mcap-tiered bars of 1.5/2/3/5%. A
     blanket call on every coin cleared those 66-72% of the time.
     promptove/49.

     KEEP IN SYNC with track-record.html. */
  var HORIZON_DAYS       = 30;   /* the window every call is measured over */
  var CONFIRM_DAYS_MIN   = HORIZON_DAYS;
  var ROTATION_THRESHOLD = 0;   /* target simply has to out-return the source; null 50.3% */

  /* ── One clock, shared with track-record.html ──────────────
     A snapshot date is a UTC calendar day, and age is the number of
     WHOLE days since — what "7+ days old" actually means. This file had
     Math.round with local midnight in five places; track-record.html's
     rotation half had Math.floor with UTC. On a UTC+2 browser the same
     2026-09-11 snapshot came out 7 days old in one and 6 in the other,
     so one half of the site graded a call while the other still called
     it pending. Math.round was the wrong one: 6.74 days is not 7.
     KEEP IN SYNC with snapTs()/daysSince() in track-record.html. */
  function _snapTs(dateStr) { return new Date(dateStr + 'T00:00:00Z').getTime(); }
  function _daysSince(dateStr) {
    return Math.floor((Date.now() - _snapTs(dateStr)) / 864e5);
  }

  /* Hard cutoff: snapshots dated before STATS_FROM_DATE are excluded from
     accuracy stats and the proven-signals list.

     Reset a THIRD time on 2026-09-08, for engine 2.2.0's candidate
     classification. The reasoning differs from the 2.1.0 reset, and the
     difference is the point:

       2.1.0 reset because the SCORE changed meaning (market-cap
       adjustment went from a multiplier to a signed additive term).
       2.2.0 and 2.3.0 moved NO score and NO zone — verified twice, on
       the golden fixture and on production runs 298 vs 299. A graded
       score still means exactly what it meant on 2026-09-07.

     What changed is WHICH coins get published. 2.2.0 added the candidate
     classification (extreme-move / falling-knife / RSI confirmation) and
     bullCandidates below now filters on it, so from 2026-09-08 the
     graded picks come through a stricter selection than the day before.
     Same score, different population — blending the two would average a
     looser selection with a tighter one and publish it as one number.

     Day one holds rows written under 2.2.0 (dashboard) and 2.3.0 (bot).
     They are comparable on both counts that matter: identical scores,
     and both already selected through the candidate filter.

     ENGINE_LABEL is the engine the RECORD was produced under, not
     whatever is running now. It is deliberately pinned rather than read
     from ROTATOR_RUN, so a later engine bump cannot silently relabel
     history — but that is exactly why it went stale at 2.1.0 through two
     releases. test/verify-tracking-labels.js now fails when it drifts
     from the engine without a recorded reason.

     Keep both constants in sync with track-record.html. */
  /* 2026-09-11. Moved off 09-10 because engine 2.8.0 made the Binance
     Monitoring tag an eligibility reason, which moves what may be
     published — rule 5 in GUARDRAILS.md.

     Today's own snapshot was posted at 05:17 UTC under 2.7.0, an hour
     before 2.8.0 shipped, so it is worth saying why it is kept rather
     than cut: of its 20 rows, the only Monitoring-tagged coins (GLMR,
     GNS, SYN) are on the UNDERPERFORMING side, which the gate does not
     touch, and every bullish row is a tokenised equity. Not one BUY call
     in it would differ under 2.8.0.

     Tomorrow's date would have been cleaner still, and
     verify-tracking-labels rightly refuses a future one. */
  /* 2.10.0 since 2026-09-15, WITHOUT moving STATS_FROM_DATE: 2.10.0 adds
     a market-wide context flag and moves no score (verify-market-oversold),
     so the record since 09-11 is the same record. See the note in
     verify-tracking-labels.js for why the label moved anyway. */
  var STATS_FROM_DATE = '2026-09-11';
  var ENGINE_LABEL    = '2.10.0';

  function _passesCutoff(dateStr) {
    return typeof dateStr === 'string' && dateStr >= STATS_FROM_DATE;
  }

  /* The mcap-tiered confirm bars lived here. Market-relative grading
     judges every coin against the same median on the same day, so
     there is no tier to pick. */



  /* ── In-memory cache of the server history (source of truth). ──
     Populated by loadServerHistory() on module init. Until it
     resolves, loadHistory() falls back to localStorage so the UI
     has something to render immediately. */
  var _serverHistory = null;

  /* ── Load / Save ── */
  function loadHistory() {
    if (_serverHistory && _serverHistory.length) return _serverHistory;
    try {
      var raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch(e) { return []; }
  }

  function saveHistory(hist) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(hist));
    } catch(e) { /* quota exceeded — trim older entries */
      hist = hist.slice(-15);
      try { localStorage.setItem(LS_KEY, JSON.stringify(hist)); } catch(e2) {}
    }
  }

  /* ── Fetch shared snapshots from Supabase; re-render when ready. ── */
  function loadServerHistory() {
    if (typeof supaLoadSignalHistory !== 'function') return Promise.resolve([]);
    return supaLoadSignalHistory(MAX_DAYS).then(function(hist) {
      if (hist && hist.length) {
        _serverHistory = hist;
        /* Mirror to localStorage as offline fallback */
        saveHistory(hist);
      }
      /* Trigger a re-render if the track record container is present */
      try { render(); } catch(e) {}
      return hist;
    });
  }

  /* ── Get today's date key (YYYY-MM-DD) ── */
  function dateKey(d) {
    var dt = d || new Date();
    return dt.getFullYear() + '-' + String(dt.getMonth()+1).padStart(2,'0') + '-' + String(dt.getDate()).padStart(2,'0');
  }

  /* ══════════════════════════════════════════════════════════════
     MARKET-RELATIVE SCORING
     Binance daily closes -> the coin's return over HORIZON_DAYS against
     the median coin's return over the same window. No bar to clear, no
     window extreme, no lock-in: the benchmark moves with the market so
     the null is 50%. A coin with no candles on either endpoint is not
     graded rather than graded against another source. promptove/49. */


  /* Daily candles now come from Supabase (binance_daily_klines), loaded
     in ONE bulk read before grading starts, instead of one Binance
     request per symbol from the browser. Coins with no Binance listing
     simply have no entry here — the same current-price fallback as
     before, minus a guaranteed-to-fail cross-origin request each, which
     was the entire source of the console error noise. */
  var _dailyKlines = {};   /* base asset -> [{openTime, high, low, close}] */





  /* Lock-in: once a signal has cleared its threshold (peak data OR
     current price), persist a verdict so a later price retracement
     can't retroactively flip the call to "wrong". This is the fix for
     "we were right April 15→20 but on April 21 price corrected" —
     the win belongs to the window we predicted, not to today's price.
     Only writes a NEW lock; pre-existing peak verdicts are never
     overwritten (those are the authoritative kline-derived ones). */
  var _lockDirty = false;
  var _flushLocksTimer = null;

  /* ── Determine signal label for a coin ── */
  function getSignalLabel(c) {
    if (c.score >= 70) return 'STRONG MOM';
    if (c.score >= 55) return 'MOMENTUM';
    if (c.score <= 30) return 'LAGGING';
    return 'NEUTRAL';
  }

  function getExtraSignals(c) {
    var extras = [];
    if (c.p24 >= 3)   extras.push('24H SURGE');
    if (c.p24 <= -3)  extras.push('24H DIP');
    if (c.p7 >= 10)   extras.push('7D BREAKOUT');
    if (c.p7 <= -10)  extras.push('7D BREAKDOWN');
    if (c.p30 >= 20)  extras.push('30D UPTREND');
    if (c.p30 <= -20) extras.push('30D DOWNTREND');
    return extras;
  }

  /* ══════════════════════════════════════════════════════════════
     PREDICTIVE FILTERS — pre-snapshot quality gates.
     Raw score alone is noisy. We layer in:
       · Volume/mcap liquidity gate (dead coins rarely follow through)
       · BTC relative-strength overlay (alts tracking BTC → less signal)
       · Insight agreement (the engine's forward-looking read)
       · Dilution risk (heavy unlocks cap bullish upside)
     A `confidence` score reorders the top-10 without touching the public
     `score` field that the leaderboard displays.
  ══════════════════════════════════════════════════════════════ */
  function _btcCoin() {
    if (typeof coins === 'undefined' || !Array.isArray(coins)) return null;
    return coins.find(function(c) { return c.id === 'bitcoin'; }) || null;
  }

  function _volMcap(c) {
    if (!c.volume24 || !c.mcap || c.mcap <= 0) return 0;
    return c.volume24 / c.mcap;
  }

  function _confidenceScore(c, kind) {
    var base = c.score || 50;
    var bonus = 0;
    var vm = _volMcap(c);
    var btc = _btcCoin();
    var btc24 = btc ? (btc.p24 || 0) : 0;
    var relStr = (c.p24 || 0) - btc24;
    var circ = c.circulating_supply || 0;
    var maxS = c.max_supply || 0;
    var unlockRatio = (circ && maxS > 0) ? circ / maxS : -1;

    if (kind === 'bullish') {
      /* Liquidity: real turnover → real breakout */
      if (vm >= 0.10)      bonus += 6;
      else if (vm >= 0.05) bonus += 3;
      else if (vm < 0.02)  bonus -= 8;
      /* Short-term confirmation: p7 must be positive for a bullish call */
      if ((c.p7 || 0) > 0) bonus += 2;
      else                 bonus -= 4;
      /* Insight cross-check. Read from the engine's run since 2.3.0, so
         it now applies to every coin — it used to reach only the coins
         the visitor held or watched, because those were the only ones
         the browser computed an insight for. A public track record whose
         confidence ordering depended on whose browser recorded it was a
         defect; this is the fix arriving as a side effect of moving the
         calculation into the engine. */
      if (c.insight && typeof c.insight.score === 'number') {
        if (c.insight.score >= 65)      bonus += 6;
        else if (c.insight.score <= 35) bonus -= 10;
      }
      /* BTC-relative: true strength is beating BTC on the day */
      if (relStr >= 3)       bonus += 3;
      else if (relStr <= -3) bonus -= 3;
      /* Don't bullish-call coins with heavy upcoming supply unlocks */
      if (unlockRatio >= 0 && unlockRatio < 0.25) bonus -= 6;
    } else { /* lagging */
      /* Lagging signals prefer thin-liquidity, weak momentum,
         and BTC-underperforming coins. */
      if (vm < 0.02)          bonus += 3;
      if ((c.p7 || 0) < 0)    bonus += 2;
      else                    bonus -= 3;
      if (c.insight && typeof c.insight.score === 'number') {
        if (c.insight.score <= 35)      bonus += 6;
        else if (c.insight.score >= 65) bonus -= 8;
      }
      if (relStr <= -3)       bonus += 2;
    }
    return base + bonus;
  }

  function _isValidCandidate(c) {
    if (!c || c.score == null || c.isStable) return false;
    /* dataComplete guard mirrors computeScores() — never snapshot a coin
       whose 7d/14d/30d history was missing at fetch time, otherwise the
       public track record would credit/blame us for calls we couldn't
       legitimately make. */
    if (c.dataComplete === false) return false;
    if (c.p7 == null || c.p30 == null) return false;
    if (!c.price || c.price <= 0) return false;
    /* Tradability, for the same reason as the dataComplete guard above:
       the public track record should not credit or blame us for calls
       nobody could have acted on. Before this, 6 of the 10 "lagging"
       picks on a live run were untradeable — RBN, SBR, SCRT, DEXT
       (illiquid) and CFG (no market cap at all).

       EQUITIES ARE DELIBERATELY EXEMPT. The engine's _eligibility()
       also marks bStocks ineligible, but for a different reason — their
       partial 0-70 scale is not comparable to crypto, not that they are
       hard to trade. AAPL and AMZN are the most liquid things on the
       page. Gating on the raw flag would have silently dropped all 24
       equities from the track record, which is a product decision about
       what the record covers, not a liquidity fix. Kept exactly as they
       were; see promptove/18- for the open question.

       Fails open: a coin the run does not cover has no verdict. */
    if (c._eligible === false && !c.isStock) return false;
    return true;
  }

  /* ── Take daily snapshot ── */
  function takeSnapshot() {
    if (typeof coins === 'undefined' || !Array.isArray(coins) || coins.length < 10) return;

    var today = dateKey();
    var hist = loadHistory();

    /* Don't snapshot twice on the same day */
    if (hist.length && hist[hist.length - 1].date === today) return;

    var btc = _btcCoin();
    var btc24 = btc ? (btc.p24 || 0) : 0;
    var btcBleeding = btc24 < -3;

    /* ── Build candidate pool with predictive filters ── */
    var _rz = (typeof window !== 'undefined' && window.RotZones) || null;
    var bullCandidates = coins.filter(function(c) {
      if (!_isValidCandidate(c)) return false;
      var vm = _volMcap(c);
      /* Kill dead-liquidity large caps — they don't actually move */
      if (vm < 0.015 && c.mcap > 1e8) return false;
      /* When BTC is bleeding, only take coins showing real relative strength */
      if (btcBleeding && (c.p24 || 0) <= 0) return false;
      /* Mean-reversion gate: bullish picks should be pull-backs in the
         -3% .. -40% 30D band. Tails are usually broken markets. */
      if (_rz && !_rz.passesMeanRevGate(c)) return false;
      /* And the engine's candidate classification (2.2.0). These rows
         become the PUBLISHED track record, so a pick recorded here is
         graded and shown as something Rotator called — a coin already up
         40% on the day has no business in that record. Same predicate
         the rotation panel uses; this file defines no threshold of its
         own. */
      if (_rz && _rz.isPresentable && !_rz.isPresentable(c)) return false;
      return true;
    });
    bullCandidates.sort(function(a, b) {
      return _confidenceScore(b, 'bullish') - _confidenceScore(a, 'bullish');
    });

    var lagCandidates = coins.filter(_isValidCandidate);
    lagCandidates.sort(function(a, b) {
      return _confidenceScore(a, 'lagging') - _confidenceScore(b, 'lagging');
    });

    /* Emergency fallback: if filters killed the pool, retry unfiltered so
       we always produce a snapshot. */
    if (bullCandidates.length < 10) {
      /* Filters killed the pool — retry without them so a snapshot still
         gets recorded. The candidate classification is deliberately NOT
         dropped here: "we needed more rows" is not a reason to publish a
         call on a coin that has already made its move. Everything else
         relaxes; this does not. */
      bullCandidates = coins.filter(function(c) {
        return _isValidCandidate(c)
          && (!_rz || !_rz.isPresentable || _rz.isPresentable(c));
      }).sort(function(a, b) { return b.score - a.score; });
    }
    if (lagCandidates.length < 10) {
      lagCandidates = coins.filter(_isValidCandidate)
                            .sort(function(a, b) { return a.score - b.score; });
    }

    function _mapEntry(c, kind) {
      var extras = getExtraSignals(c);
      /* Mark high-conviction picks so the UI can render a badge. */
      var conf = _confidenceScore(c, kind);
      if ((conf - (c.score || 50)) >= 8) extras.push('STRONG EVIDENCE');
      return {
        id: c.id, sym: c.sym, name: c.name || '',
        price: c.price, score: c.score,
        signal: getSignalLabel(c),
        extras: extras,
        mcap: c.mcap || 0,   /* Step 4: stored so vol-normalized threshold survives reloads */
        p24: Math.round(c.p24 * 100) / 100,
        p7: Math.round(c.p7 * 100) / 100,
        p30: Math.round(c.p30 * 100) / 100,
        /* volRatio + zone — added for the Telegram alert Edge Function
           (send-telegram-alerts), which reads today's signal_snapshots
           row instead of recomputing scores server-side. */
        volRatio: (typeof window._volRatio === 'function') ? Math.round(window._volRatio(c) * 100) / 100 : 1,
        zone: c._zone || 'neutral'
      };
    }

    var topBull = bullCandidates.slice(0, 10).map(function(c) { return _mapEntry(c, 'bullish'); });
    var topLag  = lagCandidates.slice(0, 10).map(function(c) { return _mapEntry(c, 'lagging'); });

    hist.push({
      date: today,
      bullish: topBull,
      lagging: topLag
    });

    /* Trim to MAX_DAYS */
    if (hist.length > MAX_DAYS) hist = hist.slice(-MAX_DAYS);
    saveHistory(hist);

    /* Push to Supabase once per day (first client of the day wins;
       the server ignores subsequent calls via ON CONFLICT DO NOTHING). */
    postSnapshotToServer(today, topBull, topLag);

    /* Rotation pairs are now recorded server-side, once daily, by the
       sync-rotation-snapshot Edge Function — see sql/sync_rotation_
       snapshot_cron.sql. The client-side equivalent that used to run
       here (takeRotationSnapshot()) called an RPC/table that turned
       out never to have existed; every call was silently lost. Removed
       rather than left as dead weight — loadServerRotationHistory()
       below still reads the (now real) data this produces. */
  }

  /* ── Push today's snapshot to Supabase. ────────────────────────
     Guards against re-posting within the same browser session/day.
     The server is also idempotent (first-writer-wins), so extra
     calls are safe but wasteful. */
  function postSnapshotToServer(today, topBull, topLag) {
    if (typeof supaRecordSignalSnapshot !== 'function') return;
    try {
      if (localStorage.getItem(LS_DATE_KEY) === today) return;
    } catch(e) {}

    var rows = [];
    topBull.forEach(function(e) {
      rows.push({
        coin_id: e.id, coin_sym: e.sym, coin_name: e.name,
        signal_type: 'bullish', signal_label: e.signal, extras: e.extras || [],
        score: e.score, price: e.price, mcap: e.mcap || 0,
        p24: e.p24, p7: e.p7, p30: e.p30,
        vol_ratio: e.volRatio, zone: e.zone
      });
    });
    topLag.forEach(function(e) {
      rows.push({
        coin_id: e.id, coin_sym: e.sym, coin_name: e.name,
        signal_type: 'lagging', signal_label: e.signal, extras: e.extras || [],
        score: e.score, price: e.price, mcap: e.mcap || 0,
        p24: e.p24, p7: e.p7, p30: e.p30,
        vol_ratio: e.volRatio, zone: e.zone
      });
    });
    if (!rows.length) return;

    var engineVersion = (window.ROTATOR_RUN && window.ROTATOR_RUN.engineVersion) || null;
    supaRecordSignalSnapshot(rows, engineVersion).then(function(result) {
      if (result && result.ok) {
        try { localStorage.setItem(LS_DATE_KEY, today); } catch(e) {}
      }
    });
  }

  /* ── Compare past signals with peak-window (fallback: current price) ──
     For each snapshot ≥CONFIRM_DAYS_MIN old, we prefer the peak-capture
     verdict: best high inside the 14-day window for bullish, worst low
     for lagging. A call that hit +15% at day 8 stays "confirmed" even
     if the coin is back to flat today. Current-price comparison is
     only used when Binance daily klines aren't available for the coin. */
  /* ── Klines, and the market they are measured against ──────────
     A grade is a pure function of the candles: the coin's return over
     HORIZON_DAYS against the median coin over the same window. Nothing
     is cached across sessions and nothing is locked in, because there
     is no threshold for price to sneak across — the benchmark moves
     with the market.

     KEEP IN SYNC with track-record.html, which carries the same four
     helpers. The two files are deliberately separate implementations
     that point at each other; on 2026-09-17 that arrangement produced
     five bugs in one day, so if one of these moves, move both. */
  var _relKlines = {};
  var _relLoaded = false;
  var _relWarmStarted = false;
  var _marketRetCache = {};
  var MARKET_MIN_SYMBOLS = 20;

  function _shiftDate(d, n) {
    var t = new Date(_snapTs(d));
    t.setUTCDate(t.getUTCDate() + n);
    return t.toISOString().slice(0, 10);
  }
  function _closeOn(candles, d) {
    if (!candles || !candles.length) return null;
    var want = _snapTs(d);
    for (var i = 0; i < candles.length; i++) if (candles[i].openTime === want) return candles[i].close;
    return null;
  }
  function _returnOver(candles, from, n) {
    var a = _closeOn(candles, from); if (!a) return null;
    var b = _closeOn(candles, _shiftDate(from, n)); if (!b) return null;
    return ((b - a) / a) * 100;
  }

  /* Median symbol return over the same window. Median not mean, so one
     coin doing +160% cannot move the bar every other call is judged
     against; equal-weight, because the calls are equal-weight. */
  function _marketReturn(d) {
    if (Object.prototype.hasOwnProperty.call(_marketRetCache, d)) return _marketRetCache[d];
    var rets = [];
    for (var sym in _relKlines) {
      if (!Object.prototype.hasOwnProperty.call(_relKlines, sym)) continue;
      var r = _returnOver(_relKlines[sym], d, HORIZON_DAYS);
      if (r != null && isFinite(r)) rets.push(r);
    }
    if (rets.length < MARKET_MIN_SYMBOLS) { _marketRetCache[d] = null; return null; }
    rets.sort(function(x, y) { return x - y; });
    var mid = Math.floor(rets.length / 2);
    _marketRetCache[d] = { median: rets.length % 2 ? rets[mid] : (rets[mid - 1] + rets[mid]) / 2, n: rets.length };
    return _marketRetCache[d];
  }

  /* Null when the coin has no candles on either endpoint, or the
     cross-section is too thin to be a market. A call we cannot measure
     is not graded against a price from another source; it is not
     graded. */
  function _gradeEntry(entry, snapDate, isBullish) {
    var candles = _relKlines[String(entry.sym || '').toUpperCase()];
    var then = _closeOn(candles, snapDate);
    var now  = _closeOn(candles, _shiftDate(snapDate, HORIZON_DAYS));
    if (then == null || now == null) return null;
    var mkt = _marketReturn(snapDate);
    if (!mkt) return null;
    var change = ((now - then) / then) * 100;
    var excess = change - mkt.median;
    return {
      priceThen: then, priceNow: now,
      change: Math.round(change * 10) / 10,
      market: Math.round(mkt.median * 10) / 10,
      excess: Math.round(excess * 10) / 10,
      correct: isBullish ? excess > 0 : excess < 0
    };
  }

  /* One bulk read of the WHOLE table. null asks supaLoadDailyKlines for
     every symbol: the median needs the universe, and the symbols that
     appear in snapshots are by construction the extremes — their median
     would be a median of our own opinions. */
  function _warmRelKlines() {
    if (_relWarmStarted) return Promise.resolve();
    _relWarmStarted = true;
    if (typeof supaLoadDailyKlines !== 'function') return Promise.resolve();
    var oldest = null;
    loadHistory().forEach(function(snap) {
      if (_daysSince(snap.date) < CONFIRM_DAYS_MIN) return;
      if (!oldest || snap.date < oldest) oldest = snap.date;
    });
    if (!oldest) return Promise.resolve();
    return supaLoadDailyKlines(null, oldest + 'T00:00:00Z').then(function(map) {
      _relKlines = map || {};
      _marketRetCache = {};
      _relLoaded = true;
      try { render(); } catch (e) {}
    }).catch(function() { _relKlines = {}; });
  }


  /* ── Proven calls: the ones that beat the market ───────────────
     Same rule as track-record.html — the coin out-returned the median
     coin over HORIZON_DAYS. No cache, no lock-in: the grade is a pure
     function of the candles. */
  function getProvenSignals() {
    if (!_relLoaded) { _warmRelKlines(); return []; }
    var hist = loadHistory();
    if (!hist.length) return [];

    var proven = [];
    hist.forEach(function(snap) {
      if (!_passesCutoff(snap.date)) return;
      var daysAgo = _daysSince(snap.date);
      if (daysAgo < CONFIRM_DAYS_MIN) return;
      [['bullish', true], ['lagging', false]].forEach(function(pair) {
        (snap[pair[0]] || []).forEach(function(entry) {
          if (!entry || !entry.sym) return;
          var g = _gradeEntry(entry, snap.date, pair[1]);
          if (!g || !g.correct) return;
          proven.push({
            id: entry.id, sym: entry.sym, name: entry.name,
            signal: entry.signal, extras: entry.extras || [],
            date: snap.date, daysAgo: daysAgo,
            priceThen: g.priceThen, priceNow: g.priceNow,
            scoreThen: entry.score,
            change: g.change, market: g.market, excess: g.excess,
            type: pair[0], correct: true, source: 'close'
          });
        });
      });
    });

    /* Sorted by how far it beat the MARKET, not by raw move. A coin that
       rose 30% in a month the market rose 35% proved nothing, and used
       to top this list. */
    proven.sort(function(x, y) { return Math.abs(y.excess) - Math.abs(x.excess); });
    var seen = {};
    proven = proven.filter(function(p) {
      if (seen[p.id]) return false;
      seen[p.id] = true;
      return true;
    });
    return proven.slice(0, 8);
  }

  /* ── Accuracy: share of calls that beat the market ─────────────
     50% is the bar, by construction: half of all coins beat the median
     coin. What this replaced had a null of ~68% and was publishing
     63%. promptove/49. */
  function getAccuracyStats() {
    if (!_relLoaded) { _warmRelKlines(); return null; }
    var hist = loadHistory();
    if (!hist.length) return null;

    var totalBull = 0, correctBull = 0, totalLag = 0, correctLag = 0, uncovered = 0;
    hist.forEach(function(snap) {
      if (!_passesCutoff(snap.date)) return;
      if (_daysSince(snap.date) < CONFIRM_DAYS_MIN) return;
      (snap.bullish || []).forEach(function(entry) {
        if (!entry || !entry.sym) return;
        var g = _gradeEntry(entry, snap.date, true);
        if (!g) { uncovered++; return; }
        totalBull++; if (g.correct) correctBull++;
      });
      (snap.lagging || []).forEach(function(entry) {
        if (!entry || !entry.sym) return;
        var g = _gradeEntry(entry, snap.date, false);
        if (!g) { uncovered++; return; }
        totalLag++; if (g.correct) correctLag++;
      });
    });

    var total = totalBull + totalLag;
    var correct = correctBull + correctLag;
    if (total === 0) return null;
    return {
      total: total, correct: correct,
      accuracy: Math.round((correct / total) * 100),
      bullTotal: totalBull, bullCorrect: correctBull,
      lagTotal: totalLag, lagCorrect: correctLag,
      benchmark: 50, horizonDays: HORIZON_DAYS, uncovered: uncovered
    };
  }

  /* ── The rotation verdict, in one place ──────────────────────────
     A rotation call says the target will out-return the source. This
     is that sentence and nothing else.

     It exists as a named function in BOTH files so the acceptance
     test can run the two against each other. Inline, the rule had
     already drifted: track-record.html compared the ROUNDED spread
     with > and signal-history.js compared the RAW spread with >=, so
     a raw spread of +0.04 rounded to 0.0 was a miss on the page and a
     win on the dashboard. Neither file was wrong about anything it
     could see on its own.

     Raw, not rounded: rounding is for display, and a verdict that
     depends on it is a verdict that depends on a display decision.
     Strict >, not >=: a dead heat is not the target out-returning the
     source. Exact ties are effectively impossible on real prices, so
     this costs nothing and removes a case the two files would
     otherwise keep disagreeing about. */
  function _rotationCorrect(fromRet, toRet) {
    return (toRet - fromRet) > ROTATION_THRESHOLD;
  }

  /* ══════════════════════════════════════════════════════════════
     ROTATION-PAIR SCORING  (A → B)
     A rotation call is "right" when, after the confirm window, the
     to-coin outperformed the from-coin by ROTATION_THRESHOLD %.
     This captures the win-win the user described:
       · B up, A down               → BIG WIN  (great rotation)
       · B up, A up but B more      → WIN      (better deployment)
       · Both down, A more than B   → WIN      (avoided bigger loss)
       · A up, B down               → MISS     (rotation hurt)
     Verdicts use the same peak-window cache (best-high for A as the
     "missed gain", worst-low for B as the "downside risk") — but for
     spread we use closing prices at window-end (avoid double-counting
     extremes that didn't co-occur). */
  var _rotationCache = null;   /* server pull cache */
  var _rotationLocal = (function() {
    try { return JSON.parse(localStorage.getItem('rot_rotation_history') || '[]'); }
    catch(e) { return []; }
  })();

  function _saveRotationLocal() {
    try { localStorage.setItem('rot_rotation_history', JSON.stringify(_rotationLocal.slice(-MAX_DAYS))); } catch(e) {}
  }

  function loadRotationHistory() {
    if (_rotationCache && _rotationCache.length) return _rotationCache;
    return _rotationLocal;
  }

  function loadServerRotationHistory() {
    if (typeof supaLoadRotationHistory !== 'function') return Promise.resolve([]);
    return supaLoadRotationHistory(MAX_DAYS).then(function(rows) {
      if (rows && rows.length) {
        _rotationCache = rows;
        _rotationLocal = rows;
        _saveRotationLocal();
        try { render(); } catch(e) {}
      }
      return rows || [];
    });
  }

  /* For each historical rotation pair, look up peak verdicts for both
     legs and classify the outcome. */
  function getRotationProvenSignals() {
    var hist = loadRotationHistory();
    if (!hist.length) return [];
    var priceMap = {};
    if (typeof coins !== 'undefined' && coins.length) {
      coins.forEach(function(c) { priceMap[c.id] = c.price; });
    }
    var results = [];

    hist.forEach(function(snap) {
      if (!_passesCutoff(snap.date)) return;
      var pairs = snap.pairs || (snap.pair ? [snap.pair] : []);
      var snapDate = snap.date;
      var daysAgo = _daysSince(snapDate);
      if (daysAgo < CONFIRM_DAYS_MIN) return;

      pairs.forEach(function(p) {
        if (!p.from_price || !p.to_price) return;
        /* Real closes over the fixed window. This averaged bestHigh and
           worstLow as a "proxy for the close" — a number the price never
           traded at, which track-record.html already flagged as an
           honesty concern. The candles carry closes; use them. A pair we
           cannot measure on both legs is skipped rather than patched up
           from a current price captured at a different moment. */
        var fromChange = _returnOver(_relKlines[String(p.from_sym || '').toUpperCase()], snapDate, HORIZON_DAYS);
        var toChange   = _returnOver(_relKlines[String(p.to_sym   || '').toUpperCase()], snapDate, HORIZON_DAYS);
        if (fromChange == null || toChange == null) return;
        var spread = toChange - fromChange;
        var correct = _rotationCorrect(fromChange, toChange);

        /* Outcome classification */
        var outcome;
        if      (toChange >  0 && fromChange <  0) outcome = 'BIG WIN';
        else if (toChange >  0 && fromChange >= 0 && spread >= 0) outcome = 'WIN';
        else if (toChange <= 0 && fromChange <= 0 && spread >= 0) outcome = 'AVOIDED LOSS';
        else if (toChange <  0 && fromChange >  0) outcome = 'MISS';
        else outcome = correct ? 'WIN' : 'MISS';

        results.push({
          date: snapDate, daysAgo: daysAgo,
          fromSym: p.from_sym, toSym: p.to_sym,
          fromId: p.from_id,   toId: p.to_id,
          fromChange: Math.round(fromChange * 10) / 10,
          toChange:   Math.round(toChange   * 10) / 10,
          spread:     Math.round(spread     * 10) / 10,
          outcome: outcome, correct: correct
        });
      });
    });

    /* Most impressive spreads first */
    results.sort(function(a, b) { return Math.abs(b.spread) - Math.abs(a.spread); });
    /* Dedupe by pair, keep best */
    var seen = {};
    return results.filter(function(r) {
      var k = r.fromId + '>' + r.toId;
      if (seen[k]) return false;
      seen[k] = true;
      return true;
    }).slice(0, 6);
  }

  function getRotationAccuracyStats() {
    var hist = loadRotationHistory();
    if (!hist.length) return null;
    var priceMap = {};
    if (typeof coins !== 'undefined' && coins.length) {
      coins.forEach(function(c) { priceMap[c.id] = c.price; });
    }
    var total = 0, correct = 0;
    hist.forEach(function(snap) {
      if (!_passesCutoff(snap.date)) return;
      var pairs = snap.pairs || (snap.pair ? [snap.pair] : []);
      var snapDate = snap.date;
      var daysAgo = _daysSince(snapDate);
      if (daysAgo < CONFIRM_DAYS_MIN) return;
      pairs.forEach(function(p) {
        if (!p.from_price || !p.to_price) return;
        /* Real closes over the fixed window. This averaged bestHigh and
           worstLow as a "proxy for the close" — a number the price never
           traded at, which track-record.html already flagged as an
           honesty concern. The candles carry closes; use them. A pair we
           cannot measure on both legs is skipped rather than patched up
           from a current price captured at a different moment. */
        var fromChange = _returnOver(_relKlines[String(p.from_sym || '').toUpperCase()], snapDate, HORIZON_DAYS);
        var toChange   = _returnOver(_relKlines[String(p.to_sym   || '').toUpperCase()], snapDate, HORIZON_DAYS);
        if (fromChange == null || toChange == null) return;
        total++;
        if (_rotationCorrect(fromChange, toChange)) correct++;
      });
    });
    if (!total) return null;
    return { total: total, correct: correct, accuracy: Math.round((correct / total) * 100) };
  }

  /* ── Format price ── */
  function fmtP(p) {
    if (p >= 1000) return '$' + p.toLocaleString('en-US', {maximumFractionDigits: 0});
    if (p >= 1)    return '$' + p.toFixed(2);
    if (p >= 0.01) return '$' + p.toFixed(4);
    return '$' + p.toPrecision(4);
  }

  /* ── Render the track record UI ── */
  function render() {
    var container = document.getElementById('signal-track-record');
    if (!container) return;

    /* Kick off async peak-capture warmup on first render. When it
       finishes, it calls render() again so the UI reflects the locked
       verdicts instead of the current-price fallback. */
    _warmRelKlines();

    var proven = getProvenSignals();
    var stats  = getAccuracyStats();
    var hist   = loadHistory();

    var rotProven = (typeof getRotationProvenSignals === 'function') ? getRotationProvenSignals() : [];
    var rotStats  = (typeof getRotationAccuracyStats  === 'function') ? getRotationAccuracyStats()  : null;

    /* Public track-record page link — shown in every render state */
    var publicLink = '<div class="str-public-link">'
      + '<a href="track-record.html" target="_blank" rel="noopener">'
      + 'View the full public track record →</a></div>';

    /* Engine-2.1.0 reset notice — explains why the accuracy number is
       empty or thin (no signals are old enough to grade yet). */
    var resetBadge = '<div class="str-reset-badge" style="font-family:var(--font-mono);font-size:10px;letter-spacing:.08em;color:var(--muted);text-align:center;padding:6px 0 10px;opacity:.85;">'
      + 'STATS RESET ' + STATS_FROM_DATE.replace(/-/g,'·') + ' — SCORING ENGINE v' + ENGINE_LABEL + ' ACTIVE'
      + '</div>';

    /* Data attribution — required by CoinGecko brand guidelines and
       consistent with the Telegram bot footer (project_geckoterminal
       _dex_filter memory). */
    var attribution = '<div class="str-attribution" style="font-family:var(--font-mono);font-size:10px;letter-spacing:.06em;color:var(--muted);text-align:center;padding:8px 0 4px;opacity:.7;display:flex;justify-content:center;gap:14px;flex-wrap:wrap;">'
      + '<span><span style="color:var(--green);">•</span> Powered by <a href="https://www.coingecko.com" target="_blank" rel="noopener" style="color:var(--muted);">CoinGecko</a></span>'
      + '<span><span style="color:#5eead4;">•</span> On-chain by <a href="https://www.geckoterminal.com" target="_blank" rel="noopener" style="color:var(--muted);">GeckoTerminal</a></span>'
      + '</div>';

    /* Count snapshots that pass the v2 cutoff — what stats actually use */
    var qualifyingSnaps = hist.filter(function(s) { return _passesCutoff(s.date); }).length;

    /* Not enough data yet */
    if (!hist.length || qualifyingSnaps < 2) {
      container.innerHTML = resetBadge
        + '<div class="str-empty">'
        + '<div style="font-size:16px;margin-bottom:6px;">📊</div>'
        + '<div style="font-size:12px;color:var(--muted);line-height:1.7;">'
        + 'Tracking from scratch on the v2 engine. Come back in 7 days to see how our signals performed.'
        + '<br>Snapshots since reset: <strong style="color:var(--bnb);">' + qualifyingSnaps + '</strong> / 7 needed'
        + '</div></div>'
        + publicLink
        + attribution;
      container.style.display = '';
      return;
    }

    if (qualifyingSnaps >= 2 && !proven.length && !stats) {
      container.innerHTML = resetBadge
        + '<div class="str-empty">'
        + '<div style="font-size:16px;margin-bottom:6px;">⏳</div>'
        + '<div style="font-size:12px;color:var(--muted);line-height:1.7;">'
        + 'Tracking ' + qualifyingSnaps + ' days of signals on the v2 engine. Results appear after 7 days.'
        + '</div></div>'
        + publicLink
        + attribution;
      container.style.display = '';
      return;
    }

    var html = resetBadge;

    /* ── Accuracy header ── */
    if (stats) {
      var accColor = stats.accuracy >= 65 ? 'var(--green)' : stats.accuracy >= 50 ? 'var(--bnb)' : 'var(--red)';
      html += '<div class="str-stats">'
        + '<div class="str-stats-num" style="color:' + accColor + ';">' + stats.accuracy + '%</div>'
        + '<div class="str-stats-lbl">Signal Accuracy</div>'
        + '<div class="str-stats-detail">'
        + '<span>' + stats.correct + '/' + stats.total + ' signals confirmed</span>'
        + '<span style="color:var(--muted);"> · </span>'
        + '<span style="color:var(--green);">Bullish ' + stats.bullCorrect + '/' + stats.bullTotal + '</span>'
        + '<span style="color:var(--muted);"> · </span>'
        + '<span style="color:var(--red);">Lagging ' + stats.lagCorrect + '/' + stats.lagTotal + '</span>'
        + '</div></div>';
    }

    /* ── Proven signals list ── */
    if (proven.length) {
      html += '<div class="str-list">';
      proven.forEach(function(p) {
        var isBull = p.type === 'bullish';
        var icon = isBull ? '🟢' : '🔴';
        var changeStr = (p.change >= 0 ? '+' : '') + p.change + '%';
        var changeColor = p.change >= 0 ? 'var(--green)' : 'var(--red)';
        var signalBadge = p.signal;
        if (p.extras && p.extras.length) signalBadge = p.extras[0];

        html += '<div class="str-item" onclick="SignalHistory.openDetail(\'' + p.id + '\')">'
          + '<div class="str-item-top">'
          + '<span class="str-item-icon">' + icon + '</span>'
          + '<span class="str-item-sym">' + p.sym + '</span>'
          + '<span class="str-item-signal ' + (isBull ? 'bull' : 'bear') + '">' + signalBadge + '</span>'
          + '<span class="str-item-ago">' + p.daysAgo + 'd ago</span>'
          + '</div>'
          + '<div class="str-item-bot">'
          + '<span class="str-item-price">' + fmtP(p.priceThen) + ' → ' + fmtP(p.priceNow) + '</span>'
          + '<span class="str-item-change" style="color:' + changeColor + ';">' + changeStr + '</span>'
          + '</div>'
          + '<div class="str-item-proof">'
          + (isBull
            ? 'Flagged as <strong style="color:var(--green);">' + p.signal + '</strong> (score ' + p.scoreThen + ') — confirmed ✓'
            : 'Flagged as <strong style="color:var(--red);">' + p.signal + '</strong> (score ' + p.scoreThen + ') — confirmed ✓')
          + '</div>'
          + '<div class="str-item-share">'
          + '<button class="str-share-btn" onclick="event.stopPropagation();SignalHistory.shareProven(\'' + p.id + '\')" title="Share this signal">Share this win</button>'
          + '</div>'
          + '</div>';
      });
      html += '</div>';
    }

    /* ── Rotation pair wins ── */
    if (rotProven.length || rotStats) {
      html += '<div class="str-rot-block">'
        + '<div class="str-rot-title">Rotation Calls'
        + (rotStats ? ' <span class="str-rot-pct">' + rotStats.accuracy + '% — ' + rotStats.correct + '/' + rotStats.total + '</span>' : '')
        + '</div>';
      if (rotProven.length) {
        html += '<div class="str-rot-list">';
        rotProven.forEach(function(r) {
          var spreadColor = r.spread >= 0 ? 'var(--green)' : 'var(--red)';
          var spreadStr = (r.spread >= 0 ? '+' : '') + r.spread + '%';
          var outcomeColor = r.correct
            ? (r.outcome === 'BIG WIN' ? 'var(--green)' : r.outcome === 'AVOIDED LOSS' ? 'var(--bnb)' : 'var(--green)')
            : 'var(--red)';
          html += '<div class="str-rot-item">'
            + '<div class="str-rot-row">'
            + '<span class="str-rot-pair"><strong>' + r.fromSym + '</strong> → <strong>' + r.toSym + '</strong></span>'
            + '<span class="str-rot-outcome" style="color:' + outcomeColor + ';">' + r.outcome + '</span>'
            + '<span class="str-rot-ago">' + r.daysAgo + 'd</span>'
            + '</div>'
            + '<div class="str-rot-row str-rot-detail">'
            + '<span>' + r.fromSym + ' ' + (r.fromChange >= 0 ? '+' : '') + r.fromChange + '%</span>'
            + '<span style="color:var(--muted);">vs</span>'
            + '<span>' + r.toSym + ' ' + (r.toChange >= 0 ? '+' : '') + r.toChange + '%</span>'
            + '<span style="color:' + spreadColor + ';">spread ' + spreadStr + '</span>'
            + '</div></div>';
        });
        html += '</div>';
      }
      html += '</div>';
    }

    html += publicLink + attribution;

    container.innerHTML = html;
    container.style.display = '';
  }

  /* ── Open coin detail when clicking a proven signal ── */
  function openDetail(coinId) {
    if (typeof openTileDetail === 'function') {
      var c = coins.find(function(x) { return x.id === coinId; });
      if (c) openTileDetail(c);
    }
  }

  /* ── Generate "Told You So" share card ── */
  function shareProven(coinId) {
    var proven = getProvenSignals();
    var p = proven.find(function(x) { return x.id === coinId; });
    if (!p) return;
    if (window.Analytics) Analytics.track('Share', { source: 'told-you-so', coin: p.sym, signal: p.type });

    var W = 1200, H = 630;
    var can = document.createElement('canvas');
    can.width = W; can.height = H;
    var ctx = can.getContext('2d');

    /* Background */
    var bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#080c12');
    bg.addColorStop(0.4, '#0d1420');
    bg.addColorStop(1, '#080c12');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    /* Grid */
    ctx.strokeStyle = 'rgba(243,186,47,0.025)';
    ctx.lineWidth = 1;
    for (var gx = 0; gx < W; gx += 50) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke(); }
    for (var gy = 0; gy < H; gy += 50) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke(); }

    /* Gold top accent */
    var gold = ctx.createLinearGradient(0, 0, W, 0);
    gold.addColorStop(0, 'rgba(243,186,47,0)');
    gold.addColorStop(0.3, 'rgba(243,186,47,0.9)');
    gold.addColorStop(0.7, 'rgba(243,186,47,0.9)');
    gold.addColorStop(1, 'rgba(243,186,47,0)');
    ctx.fillStyle = gold;
    ctx.fillRect(0, 0, W, 4);

    /* "CALLED IT" badge */
    var isBull = p.type === 'bullish';
    var badgeColor = isBull ? '#00c896' : '#ff4560';
    ctx.fillStyle = isBull ? 'rgba(0,200,150,0.12)' : 'rgba(255,69,96,0.12)';
    _roundRect(ctx, 60, 40, 260, 50, 8);
    ctx.fill();
    ctx.strokeStyle = badgeColor;
    ctx.lineWidth = 2;
    _roundRect(ctx, 60, 40, 260, 50, 8);
    ctx.stroke();
    ctx.fillStyle = badgeColor;
    ctx.font = 'bold 28px "IBM Plex Mono", monospace';
    ctx.fillText(isBull ? '🟢 CALLED IT' : '🔴 CALLED IT', 80, 74);

    /* Days ago */
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '22px "IBM Plex Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillText(p.daysAgo + ' days ago', W - 70, 74);
    ctx.textAlign = 'left';

    /* Coin symbol and signal */
    ctx.fillStyle = '#f3ba2f';
    ctx.font = 'bold 80px "IBM Plex Mono", monospace';
    ctx.fillText(p.sym, 70, 170);

    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '26px "IBM Plex Mono", monospace';
    ctx.fillText('Signaled: ' + p.signal + ' (Score ' + p.scoreThen + ')', 70, 210);

    /* Price comparison — big */
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '24px "IBM Plex Mono", monospace';
    ctx.fillText('PRICE THEN', 70, 280);
    ctx.fillText('PRICE NOW', W / 2 + 30, 280);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 52px "IBM Plex Mono", monospace';
    ctx.fillText(fmtP(p.priceThen), 70, 340);

    /* Arrow */
    ctx.fillStyle = 'rgba(243,186,47,0.6)';
    ctx.font = '42px "IBM Plex Mono", monospace';
    ctx.fillText('→', W / 2 - 30, 335);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 52px "IBM Plex Mono", monospace';
    ctx.fillText(fmtP(p.priceNow), W / 2 + 30, 340);

    /* Change percentage — huge */
    var changeStr = (p.change >= 0 ? '+' : '') + p.change + '%';
    ctx.fillStyle = p.change >= 0 ? '#00c896' : '#ff4560';
    ctx.font = 'bold 72px "IBM Plex Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(changeStr, W / 2, 440);
    ctx.textAlign = 'left';

    /* CTA */
    ctx.fillStyle = 'rgba(243,186,47,0.06)';
    _roundRect(ctx, 70, 475, W - 140, 42, 6);
    ctx.fill();
    ctx.strokeStyle = 'rgba(243,186,47,0.2)';
    ctx.lineWidth = 1;
    _roundRect(ctx, 70, 475, W - 140, 42, 6);
    ctx.stroke();
    ctx.fillStyle = 'rgba(243,186,47,0.85)';
    ctx.font = 'bold 18px "IBM Plex Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Free rotation signals at Rotator — see what\'s next', W / 2, 502);
    ctx.textAlign = 'left';

    /* Footer */
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(70, H - 60, W - 140, 1);
    ctx.fillStyle = '#f3ba2f';
    ctx.font = 'bold 28px "IBM Plex Mono", monospace';
    ctx.fillText('ROTATOR', 70, H - 25);
    ctx.fillStyle = 'rgba(243,186,47,0.7)';
    ctx.font = 'bold 16px "IBM Plex Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillText('rotatortool-official.github.io', W - 70, H - 25);
    ctx.textAlign = 'left';

    /* Gold bottom */
    ctx.fillStyle = gold;
    ctx.fillRect(0, H - 4, W, 4);

    /* Show in viral modal */
    try {
      can.toBlob(function(blob) {
        if (!blob) return;
        _viralBlob = blob;
        _viralSym = p.sym;
        _viralCanvas = can;

        var preview = document.getElementById('viral-share-preview');
        if (preview) {
          var url = URL.createObjectURL(blob);
          preview.innerHTML = '<img src="' + url + '" alt="' + p.sym + ' signal proof">';
        }

        /* Custom "told you so" message */
        var copyEl = document.getElementById('viral-copy-text');
        if (copyEl) {
          var ref = (typeof getMyReferralLink === 'function') ? getMyReferralLink() : 'https://rotatortool-official.github.io/';
          copyEl.textContent = 'Rotator flagged ' + p.sym + ' as ' + p.signal + ' ' + p.daysAgo + ' days ago at ' + fmtP(p.priceThen) + '. It\'s now ' + fmtP(p.priceNow) + ' (' + changeStr + '). Free signals:\n\n' + ref;
        }

        var nativeBtn = document.getElementById('viral-native-btn');
        if (nativeBtn) nativeBtn.style.display = 'flex';

        openModal('viral-share-modal');
      }, 'image/png');
    } catch(e) {}
  }

  /* ── Public API ── */
  return {
    takeSnapshot: takeSnapshot,
    render: render,
    openDetail: openDetail,
    shareProven: shareProven,
    getProvenSignals: getProvenSignals,
    getAccuracyStats: getAccuracyStats,
    loadHistory: loadHistory,
    loadServerHistory: loadServerHistory,
    /* Rotation-pair scoring (server-synced) — takeRotationSnapshot
       removed (see comment above, ~line 460): it called an RPC/table
       that never existed. No longer exported. */
    loadRotationHistory:         loadRotationHistory,
    loadServerRotationHistory:   loadServerRotationHistory,
    getRotationProvenSignals:    getRotationProvenSignals,
    getRotationAccuracyStats:    getRotationAccuracyStats
  };

})();

/* Fetch shared snapshots from Supabase as soon as the app loads, so
   new visitors see the authoritative track record instead of their
   own (empty) localStorage history. Falls through silently offline. */
(function() {
  function kick() {
    try { SignalHistory.loadServerHistory(); } catch(e) {}
    try { SignalHistory.loadServerRotationHistory(); } catch(e) {}
  }
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(kick, 0);
  } else {
    document.addEventListener('DOMContentLoaded', kick);
  }
})();
