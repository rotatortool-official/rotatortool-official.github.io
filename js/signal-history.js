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
  var LS_PEAK_KEY = 'rot_peak_verdicts';          /* cached peak-window verdicts */
  var MAX_DAYS = 30;

  /* ── Scoring window tunables ──────────────────────────────────
     CONFIRM_DAYS_MIN — earliest day the window starts being checked.
     PEAK_WINDOW_DAYS — latest day we consider for peak/trough lookup.
     CONFIRM_THRESHOLD — min absolute % change to count as confirmed.
     A call is locked in as soon as the best price in the window crosses
     the threshold; current price beyond that does NOT retro-demote it. */
  var CONFIRM_DAYS_MIN   = 7;
  var PEAK_WINDOW_DAYS   = 14;
  var CONFIRM_THRESHOLD  = 2;
  var ROTATION_THRESHOLD = 2;   /* rotation: spread between to-change and from-change, in % */

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
     PEAK-CAPTURE SCORING
     Binance daily klines → max(high) / min(low) inside the confirm
     window. A call is "correct" if the best move inside the window
     crossed CONFIRM_THRESHOLD, regardless of today's price. Solves the
     retroactive-bad problem: a good call at day 7 stays good even if
     momentum fades by day 20. Falls back to current-price comparison
     when klines are unavailable (coins not on Binance, offline, etc).
  ══════════════════════════════════════════════════════════════ */
  var _dailyKlineCache = {};   /* sym → { ts, candles } */
  var _dailyKlineTTL   = 60 * 60 * 1000;  /* 1h */
  var _dailyKlinePend  = {};   /* sym → in-flight promise (dedupes parallel calls) */
  var _peakVerdicts    = {};   /* "YYYY-MM-DD|coin_id" → {bestChange, worstChange, ...} */
  var _peakWarmStarted = false;
  var _peakWarmDone    = false;

  /* Restore persisted verdict cache so re-opening the app doesn't
     re-query Binance for calls that already have a locked verdict. */
  try {
    var _savedPeak = localStorage.getItem(LS_PEAK_KEY);
    if (_savedPeak) _peakVerdicts = JSON.parse(_savedPeak) || {};
  } catch(e) { _peakVerdicts = {}; }

  function _savePeakVerdicts() {
    try { localStorage.setItem(LS_PEAK_KEY, JSON.stringify(_peakVerdicts)); } catch(e) {}
  }

  function _fetchDailyKlines(sym) {
    var now = Date.now();
    var cached = _dailyKlineCache[sym];
    if (cached && (now - cached.ts) < _dailyKlineTTL) return Promise.resolve(cached.candles);
    if (_dailyKlinePend[sym]) return _dailyKlinePend[sym];
    var pair = sym + 'USDT';
    var url = 'https://api.binance.com/api/v3/klines?symbol=' + pair + '&interval=1d&limit=30';
    var p = fetch(url)
      .then(function(r) { return r.ok ? r.json() : null; })
      .then(function(data) {
        if (!Array.isArray(data) || !data.length) { _dailyKlineCache[sym] = { ts: now, candles: null }; return null; }
        var candles = data.map(function(k) {
          return {
            openTime: +k[0],
            high:  parseFloat(k[2]),
            low:   parseFloat(k[3]),
            close: parseFloat(k[4])
          };
        });
        _dailyKlineCache[sym] = { ts: now, candles: candles };
        return candles;
      })
      .catch(function() { _dailyKlineCache[sym] = { ts: now, candles: null }; return null; })
      .then(function(out) { delete _dailyKlinePend[sym]; return out; });
    _dailyKlinePend[sym] = p;
    return p;
  }

  /* Compute best/worst change for one snapshot entry in the confirm window.
     Returns null if no kline data — caller falls back to current-price. */
  function _computePeakVerdict(entry, snapDateStr) {
    var snapTs = new Date(snapDateStr + 'T00:00:00').getTime();
    var windowStart = snapTs + 864e5;                        /* day +1 */
    var windowEnd   = snapTs + PEAK_WINDOW_DAYS * 864e5;     /* day +14 */
    var nowTs = Date.now();
    if (windowEnd > nowTs) windowEnd = nowTs;
    if (windowStart >= windowEnd) return Promise.resolve(null);
    return _fetchDailyKlines(entry.sym).then(function(candles) {
      if (!candles || !candles.length) return null;
      var win = candles.filter(function(c) { return c.openTime >= windowStart && c.openTime <= windowEnd; });
      if (!win.length) return null;
      var bestHigh = win[0].high, worstLow = win[0].low;
      for (var i = 1; i < win.length; i++) {
        if (win[i].high > bestHigh) bestHigh = win[i].high;
        if (win[i].low  < worstLow) worstLow = win[i].low;
      }
      var pt = entry.price;
      if (!pt || pt <= 0) return null;
      return {
        bestHigh:       bestHigh,
        worstLow:       worstLow,
        bestChange:     Math.round(((bestHigh - pt) / pt) * 1000) / 10,   /* one decimal */
        worstChange:    Math.round(((worstLow - pt) / pt) * 1000) / 10,
        windowDaysUsed: Math.min(PEAK_WINDOW_DAYS, Math.round((nowTs - snapTs) / 864e5)),
        candleCount:    win.length,
        computedAt:     nowTs
      };
    });
  }

  /* Background warm-up: iterate snapshots, fetch klines, cache verdicts.
     Triggers a re-render on completion so the UI picks up the new numbers.
     Runs at most once per session; each (date, coin) is only fetched once. */
  function _warmPeakCache() {
    if (_peakWarmStarted) return Promise.resolve();
    _peakWarmStarted = true;
    var hist = loadHistory();
    if (!hist.length) { _peakWarmDone = true; return Promise.resolve(); }

    var now = new Date();
    var tasks = [];
    hist.forEach(function(snap) {
      var daysAgo = Math.round((now - new Date(snap.date + 'T00:00:00')) / 864e5);
      if (daysAgo < CONFIRM_DAYS_MIN) return;   /* too fresh — not scored yet */
      var entries = (snap.bullish || []).concat(snap.lagging || []);
      entries.forEach(function(entry) {
        if (!entry || !entry.id || !entry.sym || !entry.price) return;
        var key = snap.date + '|' + entry.id;
        if (_peakVerdicts[key]) return;   /* already cached */
        tasks.push({ snap: snap, entry: entry, key: key });
      });
    });

    if (!tasks.length) { _peakWarmDone = true; return Promise.resolve(); }

    /* Batch of 5 concurrent with a 50ms pause between batches to stay
       well under Binance's 1200 req/min limit. */
    return new Promise(function(resolve) {
      var BATCH = 5;
      function step(i) {
        if (i >= tasks.length) {
          _peakWarmDone = true;
          _savePeakVerdicts();
          try { render(); } catch(e) {}
          return resolve();
        }
        var batch = tasks.slice(i, i + BATCH);
        Promise.all(batch.map(function(t) {
          return _computePeakVerdict(t.entry, t.snap.date).then(function(v) {
            if (v) _peakVerdicts[t.key] = v;
          });
        })).then(function() { setTimeout(function() { step(i + BATCH); }, 50); });
      }
      step(0);
    });
  }

  function _lookupPeak(entry, snapDate) {
    return _peakVerdicts[snapDate + '|' + entry.id] || null;
  }

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
       · Insight Engine agreement (when available for holdings/watchlist)
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
      /* Insight Engine cross-check (only holdings/watchlist have it) */
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
    if (c.p7 == null || c.p30 == null) return false;
    if (!c.price || c.price <= 0) return false;
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
    var bullCandidates = coins.filter(function(c) {
      if (!_isValidCandidate(c)) return false;
      var vm = _volMcap(c);
      /* Kill dead-liquidity large caps — they don't actually move */
      if (vm < 0.015 && c.mcap > 1e8) return false;
      /* When BTC is bleeding, only take coins showing real relative strength */
      if (btcBleeding && (c.p24 || 0) <= 0) return false;
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
      bullCandidates = coins.filter(_isValidCandidate)
                            .sort(function(a, b) { return b.score - a.score; });
    }
    if (lagCandidates.length < 10) {
      lagCandidates = coins.filter(_isValidCandidate)
                            .sort(function(a, b) { return a.score - b.score; });
    }

    function _mapEntry(c, kind) {
      var extras = getExtraSignals(c);
      /* Mark high-conviction picks so the UI can render a badge. */
      var conf = _confidenceScore(c, kind);
      if ((conf - (c.score || 50)) >= 8) extras.push('HIGH CONVICTION');
      return {
        id: c.id, sym: c.sym, name: c.name || '',
        price: c.price, score: c.score,
        signal: getSignalLabel(c),
        extras: extras,
        p24: Math.round(c.p24 * 100) / 100,
        p7: Math.round(c.p7 * 100) / 100,
        p30: Math.round(c.p30 * 100) / 100
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

    /* Capture today's rotation pairs alongside the bullish/lagging tops. */
    try { takeRotationSnapshot(); } catch(e) {}
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
        score: e.score, price: e.price, p24: e.p24, p7: e.p7, p30: e.p30
      });
    });
    topLag.forEach(function(e) {
      rows.push({
        coin_id: e.id, coin_sym: e.sym, coin_name: e.name,
        signal_type: 'lagging', signal_label: e.signal, extras: e.extras || [],
        score: e.score, price: e.price, p24: e.p24, p7: e.p7, p30: e.p30
      });
    });
    if (!rows.length) return;

    supaRecordSignalSnapshot(rows).then(function(result) {
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
  function getProvenSignals() {
    var hist = loadHistory();
    if (!hist.length) return [];

    /* Build current price map (fallback only). Coins list may be empty
       on very first load; peak verdicts still work without it. */
    var priceMap = {};
    if (typeof coins !== 'undefined' && coins.length) {
      coins.forEach(function(c) { priceMap[c.id] = c.price; });
    }

    var proven = [];
    var now = new Date();

    hist.forEach(function(snap) {
      var snapDate = new Date(snap.date + 'T00:00:00');
      var daysAgo = Math.round((now - snapDate) / (1000 * 60 * 60 * 24));

      /* Only show signals that are CONFIRM_DAYS_MIN+ days old */
      if (daysAgo < CONFIRM_DAYS_MIN) return;

      /* Bullish — correct if best high in window ≥ +threshold */
      snap.bullish.forEach(function(entry) {
        if (!entry.price) return;
        var peak = _lookupPeak(entry, snap.date);
        var change, priceNow, usedPeak = false;
        if (peak) {
          change = peak.bestChange;
          priceNow = peak.bestHigh;
          usedPeak = true;
        } else {
          var currentPrice = priceMap[entry.id];
          if (!currentPrice) return;
          change = ((currentPrice - entry.price) / entry.price) * 100;
          priceNow = currentPrice;
        }
        var correct = change >= CONFIRM_THRESHOLD;
        if (correct) {
          proven.push({
            id: entry.id, sym: entry.sym, name: entry.name,
            signal: entry.signal, extras: entry.extras || [],
            date: snap.date, daysAgo: daysAgo,
            priceThen: entry.price, priceNow: priceNow,
            scoreThen: entry.score,
            change: Math.round(change * 10) / 10,
            type: 'bullish', correct: true,
            source: usedPeak ? 'peak' : 'current'
          });
        }
      });

      /* Lagging — correct if worst low in window ≤ -threshold */
      snap.lagging.forEach(function(entry) {
        if (!entry.price) return;
        var peak = _lookupPeak(entry, snap.date);
        var change, priceNow, usedPeak = false;
        if (peak) {
          change = peak.worstChange;
          priceNow = peak.worstLow;
          usedPeak = true;
        } else {
          var currentPrice = priceMap[entry.id];
          if (!currentPrice) return;
          change = ((currentPrice - entry.price) / entry.price) * 100;
          priceNow = currentPrice;
        }
        var correct = change <= -CONFIRM_THRESHOLD;
        if (correct) {
          proven.push({
            id: entry.id, sym: entry.sym, name: entry.name,
            signal: entry.signal, extras: entry.extras || [],
            date: snap.date, daysAgo: daysAgo,
            priceThen: entry.price, priceNow: priceNow,
            scoreThen: entry.score,
            change: Math.round(change * 10) / 10,
            type: 'lagging', correct: true,
            source: usedPeak ? 'peak' : 'current'
          });
        }
      });
    });

    /* Sort by absolute change magnitude — most impressive first */
    proven.sort(function(a, b) { return Math.abs(b.change) - Math.abs(a.change); });

    /* Deduplicate by coin ID — keep the most impressive result */
    var seen = {};
    proven = proven.filter(function(p) {
      if (seen[p.id]) return false;
      seen[p.id] = true;
      return true;
    });

    return proven.slice(0, 8); /* Top 8 proven signals */
  }

  /* ── Get accuracy stats (peak-capture, falls back to current price) ── */
  function getAccuracyStats() {
    var hist = loadHistory();
    if (!hist.length) return null;

    var priceMap = {};
    if (typeof coins !== 'undefined' && coins.length) {
      coins.forEach(function(c) { priceMap[c.id] = c.price; });
    }

    var now = new Date();
    var totalBull = 0, correctBull = 0, totalLag = 0, correctLag = 0;
    var peakCovered = 0, currentCovered = 0;

    hist.forEach(function(snap) {
      var snapDate = new Date(snap.date + 'T00:00:00');
      var daysAgo = Math.round((now - snapDate) / (1000 * 60 * 60 * 24));
      if (daysAgo < CONFIRM_DAYS_MIN) return;

      snap.bullish.forEach(function(entry) {
        if (!entry.price) return;
        var peak = _lookupPeak(entry, snap.date);
        var change;
        if (peak) { change = peak.bestChange; peakCovered++; }
        else {
          var cp = priceMap[entry.id];
          if (!cp) return;
          change = ((cp - entry.price) / entry.price) * 100;
          currentCovered++;
        }
        totalBull++;
        if (change >= CONFIRM_THRESHOLD) correctBull++;
      });

      snap.lagging.forEach(function(entry) {
        if (!entry.price) return;
        var peak = _lookupPeak(entry, snap.date);
        var change;
        if (peak) { change = peak.worstChange; peakCovered++; }
        else {
          var cp = priceMap[entry.id];
          if (!cp) return;
          change = ((cp - entry.price) / entry.price) * 100;
          currentCovered++;
        }
        totalLag++;
        if (change <= -CONFIRM_THRESHOLD) correctLag++;
      });
    });

    var total = totalBull + totalLag;
    var correct = correctBull + correctLag;
    if (total === 0) return null;

    return {
      total: total,
      correct: correct,
      accuracy: Math.round((correct / total) * 100),
      bullTotal: totalBull,
      bullCorrect: correctBull,
      lagTotal: totalLag,
      lagCorrect: correctLag,
      peakCovered: peakCovered,
      currentCovered: currentCovered
    };
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

  /* Build today's rotation pairs from current dashboard state and
     post once per day to the server. Mirrors takeSnapshot's design. */
  function takeRotationSnapshot() {
    if (typeof coins === 'undefined' || !Array.isArray(coins) || coins.length < 10) return;
    var today = dateKey();
    try {
      if (localStorage.getItem(LS_ROT_DATE_KEY) === today) return;
    } catch(e) {}

    /* Source: dashboard's own rotation logic — top scorers paired with
       bottom scorers, optionally filtered by holdings if present. */
    var hSyms = (typeof holdings !== 'undefined' && holdings.length)
      ? holdings.map(function(h) { return h.sym; }) : [];
    var sells, buys;
    if (hSyms.length) {
      var held = coins.filter(function(c) { return hSyms.indexOf(c.sym) >= 0; });
      sells = held.filter(function(c) { return c.score >= 62; })
                  .sort(function(a, b) { return b.score - a.score; });
      buys  = coins.filter(function(c) { return hSyms.indexOf(c.sym) < 0 && c.score <= 38; })
                   .sort(function(a, b) { return a.score - b.score; });
    }
    /* Fallback: cross-coin pairs (top scorers → bottom scorers). */
    if (!sells || !sells.length || !buys || !buys.length) {
      sells = coins.filter(_isValidCandidate)
                   .sort(function(a, b) { return b.score - a.score; })
                   .slice(0, 5);
      buys  = coins.filter(_isValidCandidate)
                   .sort(function(a, b) { return a.score - b.score; })
                   .slice(0, 5);
    }

    var pairs = [];
    var pairCount = Math.min(5, sells.length, buys.length);
    for (var i = 0; i < pairCount; i++) {
      var s = sells[i], b = buys[i];
      if (!s || !b || s.id === b.id) continue;
      pairs.push({
        from_id: s.id, from_sym: s.sym,
        from_price: s.price, from_score: s.score,
        to_id: b.id, to_sym: b.sym,
        to_price: b.price, to_score: b.score,
        source: 'dashboard'
      });
    }
    if (!pairs.length) return;

    /* Mirror to localStorage (so single-user view survives offline) */
    _rotationLocal.push({ date: today, pairs: pairs });
    _saveRotationLocal();

    if (typeof supaRecordRotationSnapshot === 'function') {
      supaRecordRotationSnapshot(pairs).then(function(res) {
        if (res && res.ok) {
          try { localStorage.setItem(LS_ROT_DATE_KEY, today); } catch(e) {}
        }
      });
    }
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
    var now = new Date();

    hist.forEach(function(snap) {
      var pairs = snap.pairs || (snap.pair ? [snap.pair] : []);
      var snapDate = snap.date;
      var snapTs = new Date(snapDate + 'T00:00:00').getTime();
      var daysAgo = Math.round((now - snapTs) / 864e5);
      if (daysAgo < CONFIRM_DAYS_MIN) return;

      pairs.forEach(function(p) {
        if (!p.from_price || !p.to_price) return;
        /* For the from-coin we want "what would they have lost by holding"
           → prefer the worst-low (down move avoided). For to-coin we want
           "what did the rotation deliver" → best-high. */
        var fromPeak = _lookupPeak({ id: p.from_id, sym: p.from_sym, price: p.from_price }, snapDate);
        var toPeak   = _lookupPeak({ id: p.to_id,   sym: p.to_sym,   price: p.to_price   }, snapDate);
        var fromChange, toChange;
        if (fromPeak) {
          /* For the FROM coin, the realised change for the holder who
             didn't rotate is roughly the close — but we don't have that
             cheap. Approximate as the avg of best-high and worst-low,
             which centres around the path's midpoint. */
          fromChange = (fromPeak.bestChange + fromPeak.worstChange) / 2;
        } else {
          var cpf = priceMap[p.from_id];
          if (!cpf) return;
          fromChange = ((cpf - p.from_price) / p.from_price) * 100;
        }
        if (toPeak) {
          toChange = (toPeak.bestChange + toPeak.worstChange) / 2;
        } else {
          var cpt = priceMap[p.to_id];
          if (!cpt) return;
          toChange = ((cpt - p.to_price) / p.to_price) * 100;
        }
        var spread = toChange - fromChange;
        var correct = spread >= ROTATION_THRESHOLD;

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
    var now = new Date();
    hist.forEach(function(snap) {
      var pairs = snap.pairs || (snap.pair ? [snap.pair] : []);
      var snapDate = snap.date;
      var daysAgo = Math.round((now - new Date(snapDate + 'T00:00:00')) / 864e5);
      if (daysAgo < CONFIRM_DAYS_MIN) return;
      pairs.forEach(function(p) {
        if (!p.from_price || !p.to_price) return;
        var fromPeak = _lookupPeak({ id: p.from_id, sym: p.from_sym, price: p.from_price }, snapDate);
        var toPeak   = _lookupPeak({ id: p.to_id,   sym: p.to_sym,   price: p.to_price   }, snapDate);
        var fromChange, toChange;
        if (fromPeak) fromChange = (fromPeak.bestChange + fromPeak.worstChange) / 2;
        else {
          var cpf = priceMap[p.from_id]; if (!cpf) return;
          fromChange = ((cpf - p.from_price) / p.from_price) * 100;
        }
        if (toPeak) toChange = (toPeak.bestChange + toPeak.worstChange) / 2;
        else {
          var cpt = priceMap[p.to_id]; if (!cpt) return;
          toChange = ((cpt - p.to_price) / p.to_price) * 100;
        }
        total++;
        if ((toChange - fromChange) >= ROTATION_THRESHOLD) correct++;
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
    if (!_peakWarmStarted) _warmPeakCache();

    var proven = getProvenSignals();
    var stats  = getAccuracyStats();
    var hist   = loadHistory();

    var rotProven = (typeof getRotationProvenSignals === 'function') ? getRotationProvenSignals() : [];
    var rotStats  = (typeof getRotationAccuracyStats  === 'function') ? getRotationAccuracyStats()  : null;

    /* Public track-record page link — shown in every render state */
    var publicLink = '<div class="str-public-link">'
      + '<a href="track-record.html" target="_blank" rel="noopener">'
      + 'View the full public track record →</a></div>';

    /* Not enough data yet */
    if (!hist.length || hist.length < 2) {
      container.innerHTML = '<div class="str-empty">'
        + '<div style="font-size:16px;margin-bottom:6px;">📊</div>'
        + '<div style="font-size:12px;color:var(--muted);line-height:1.7;">'
        + 'Signal tracking started. Come back in 7 days to see how our signals performed.'
        + '<br>Snapshots saved: <strong style="color:var(--bnb);">' + hist.length + '</strong> / 7 needed'
        + '</div></div>'
        + publicLink;
      container.style.display = '';
      return;
    }

    if (hist.length >= 2 && !proven.length && !stats) {
      container.innerHTML = '<div class="str-empty">'
        + '<div style="font-size:16px;margin-bottom:6px;">⏳</div>'
        + '<div style="font-size:12px;color:var(--muted);line-height:1.7;">'
        + 'Tracking ' + hist.length + ' days of signals. Results appear after 7 days.'
        + '</div></div>'
        + publicLink;
      container.style.display = '';
      return;
    }

    var html = '';

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

    html += publicLink;

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
    /* Rotation-pair scoring (server-synced) */
    takeRotationSnapshot:        takeRotationSnapshot,
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
