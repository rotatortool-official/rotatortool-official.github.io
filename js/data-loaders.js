/* ══════════════════════════════════════════════════════════════════
   data-loaders.js  —  All data fetching, scoring & the sparkle animation

   HOW TO EDIT THIS FILE:
   ──────────────────────
   • CHANGE SCORING WEIGHTS:
       In computeScores() find the three LAYERS:
       L1 = intra-list rank:  adjust the 0.25 / 0.30 / 0.45 weights
       L2 = macro strength:   adjust the 0.35/0.25/0.10/0.10 core + 0.10 DXY + 0.10 Total3 weights
       L3 = tokenomics:       adjust supplyPts / deflPts / unlockPts values (crypto only — bStocks skip L3)

   • CHANGE AUTO-REFRESH INTERVAL:
       Find startAutoRefresh() and change 15*60*1000 (= 15 minutes)

   • ADD/REMOVE bSTOCKS:
       Nothing to edit. The roster is discovered server-side by the
       sync-bstocks Edge Function from binance_symbol_tags, so a new
       Binance listing arrives on its own. Data reaches the page via
       unified_market_data (Supabase) and loadBstocks() below.
       To EXCLUDE one, add its ticker to FUND_DENYLIST in that function.
       (BSTOCK_LIST in config.js is no longer the roster — see the note
       on it there.)

   Site is crypto (+ bStocks) only now — FOREX/STOCKS as separate modes,
   Yahoo Finance, Alpha Vantage, Frankfurter, ER-API and the whole
   mode-switching UI (setMode/asset-mode-bar/#forex-panel/#stocks-panel)
   were removed. See rotator-bstocks-migration-plan.md.
══════════════════════════════════════════════════════════════════ */

/* ── Shared runtime state ─────────────────────────────────────── */
var busy = false;

/* ══════════════════════════════════════════════════════════════
   CRYPTO — loadCoins + BTC MA200
══════════════════════════════════════════════════════════════ */
/* Typewriter loading message */
var _twTimer = null;
function prog(p, m) {
  /* The bar follows the real steps (promptove/105); it was a fixed 2.5s
     animation that finished long before the data did. */
  var bar = document.getElementById('load-bar-fill');
  if (bar && typeof p === 'number') {
    bar.style.width = Math.max(4, Math.min(100, p)) + '%';
    var pb = document.getElementById('load-bar');
    if (pb) pb.setAttribute('aria-valuenow', String(Math.round(p)));
  }
  var el = document.getElementById('lmsg');
  if (!el) return;
  if (_twTimer) clearTimeout(_twTimer);
  /* Typed letter by letter, so the page-wide translator only ever saw
     fragments: translate the whole message first (promptove/73). */
  el.setAttribute('data-no-i18n', '');
  var _lang = (typeof currentLang !== 'undefined' && currentLang !== 'en') ? currentLang : (function () { try { return localStorage.getItem('rot_lang'); } catch (e) { return null; } })();
  if (_lang === 'mk' && typeof mkTranslate === 'function') m = mkTranslate(m);
  el.textContent = '';
  var i = 0;
  function type() {
    if (i < m.length) { el.textContent += m[i++]; _twTimer = setTimeout(type, 28); }
  }
  type();
}

/* ── Loading screen tips ─────────────────────────────────────── */
var LOAD_TIPS = [
  '"Relative strength is measurable. A narrative is not."',
  '"The best trade is often the one you don\'t make."',
  '"What changed is a better question than what to buy."',
  '"Time in the market beats timing the market."',
  '"A portfolio that survives is a portfolio that thrives."',
  '"Diversify across sectors, not just coins."',
  '"Never invest more than you can afford to lose."',
  '"Consistent small gains compound into big results."',
  '"Zoom out. The 30D trend tells a clearer story than the 1H chart."',
  '"Look for the evidence against it, not just the evidence for it."'
];
(function showLoadTip() {
  var el = document.getElementById('load-tip');
  if (!el) return;
  el.textContent = LOAD_TIPS[Math.floor(Math.random() * LOAD_TIPS.length)];
})();

/* ── Loading screen pulse line (Daniel, 2026-10-03) ──────────────
   "We track the market pulse with this tool": while the page loads, a
   beating heart and a phrase that changes every 2.2s, fading between
   them. Stops as soon as the loader is gone. Translated whole, like
   prog() above, so Macedonian never shows half a sentence. */
var LOAD_PULSE = [
  'Checking today\'s market pulse…',
  'Finding the market\'s beat…',
  'Listening to hundreds of coins at once…',
  'Counting the beats since yesterday…',
  'Is the market resting or racing?'
];
(function showLoadPulse() {
  var el = document.getElementById('load-pulse-txt');
  var loader = document.getElementById('loader');
  if (!el || !loader) return;
  el.setAttribute('data-no-i18n', '');
  var tr = function (m) {
    var lang = (typeof currentLang !== 'undefined' && currentLang !== 'en') ? currentLang
      : (function () { try { return localStorage.getItem('rot_lang'); } catch (e) { return null; } })();
    return (lang === 'mk' && typeof mkTranslate === 'function') ? mkTranslate(m) : m;
  };
  var i = 0;
  el.textContent = tr(LOAD_PULSE[0]);
  var iv = setInterval(function () {
    if (loader.classList.contains('gone')) { clearInterval(iv); return; }
    el.style.opacity = '0';
    setTimeout(function () {
      i = (i + 1) % LOAD_PULSE.length;
      el.textContent = tr(LOAD_PULSE[i]);
      el.style.opacity = '';
    }, 300);
  }, 2200);
})();

/* ── Category-aware lazy loading state ────────────────────────── */
var activeCategory   = 'all';            /* default category on first load */
var _loadedCategories = {};              /* cat → true once fetched */
var _coinCache        = {};              /* coinId → coin object (merged across loads) */

/* Load coins for a specific category, or reload all loaded coins on refresh */
async function loadCoins(categoryOverride) {
  var cat       = categoryOverride || activeCategory;
  var isInitial = Object.keys(_loadedCategories).length === 0;
  var catLabel  = cat === 'all' ? 'all 200' : cat.toUpperCase();
  prog(10, 'Fetching market data for ' + catLabel + ' coins…');
  /* Show skeleton rows immediately */
  var tbody = document.getElementById('tbody');
  if (tbody && !tbody.querySelector('tr:not(.skel-tr)')) {
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

  /* ── Item 4: Try Binance 24hr ticker first — free, no key, very reliable ──
     Binance returns p24 and volume in a single fast call. We merge this with
     CoinGecko's 7D/14D/30D data (which Binance doesn't provide per-coin).
     If Binance is available we use it for price + p24 accuracy; CoinGecko
     for the multi-timeframe changes needed by the scorer.
  ──────────────────────────────────────────────────────────────────────── */
  /* Read from Supabase, not api.binance.com. The browser used to pull
     the FULL ticker payload (~500KB, every USDT pair) on every page
     load just to use three fields per coin; sync-binance-spot now does
     that once for everyone on a 5-minute cron. It also fixes visitors
     in regions where Binance answers HTTP 451, who previously got no
     Binance prices at all with nothing to indicate why.
     Same map shape as before, so nothing downstream changes. */
  var _binancePrices = {}; /* sym → {price, p24, volume} */
  if (typeof supaLoadBinanceSpot === 'function') {
    _binancePrices = await supaLoadBinanceSpot();
    if (Object.keys(_binancePrices).length) {
      prog(25, 'Binance prices loaded — fetching historical data…');
    }
  }

  /* Fetch CoinGecko for 7D/14D/30D data (always needed for scoring) */
  /* On initial load: only fetch the active category to save API calls.
     On refresh (doRefresh): re-fetch all previously loaded categories.
     On category switch: fetch only the new category's coins. */
  var idsToFetch;
  if (cat === 'all') {
    idsToFetch = getActiveCoins();
  } else if (_loadedCategories[cat]) {
    /* Already loaded — re-fetch all loaded categories for refresh */
    idsToFetch = [];
    Object.keys(_loadedCategories).forEach(function(c) {
      getCategoryCoins(c).forEach(function(id) { idsToFetch.push(id); });
    });
  } else {
    /* New category — only fetch its coins */
    idsToFetch = getCategoryCoins(cat);
  }
  /* Deduplicate IDs (some may appear twice in the list) */
  var seen = {}; var uniqueIds = [];
  idsToFetch.forEach(function(id) { if (!seen[id]) { seen[id] = true; uniqueIds.push(id); } });

  /* ── Supabase is the SOURCE, not a cache in front of the browser ──
     Rewritten 2026-09-10.

     This used to be a 5-minute read-through cache in front of a browser
     fetch, and that made the VISITOR the ingest path for the whole coin
     universe. compute-signal-run scores on a 15-minute cron and simply
     read whatever the last visitor had left behind. Measured from
     signal_runs.input_freshness, about half of all runs scored prices
     more than an hour old, worst case just under twelve hours — and the
     tool got less accurate the fewer visitors it had.

     sync-coin-universe now writes cg_markets_all on a cron at minutes
     11/26/41/56, a few minutes ahead of each scoring run. The browser
     READS it and does not normally fetch CoinGecko at all.

     UNIVERSE_TTL_MS is 15 minutes: the freshness the page promises. Past
     it the browser still falls back to a live fetch, because a stale
     page is worse than a rate-limit risk taken once — but that path is
     now the exception that means the cron is broken, not the design.
  ──────────────────────────────────────────────────────────────────────── */
  /* One read of the shared row, with its age (2026-10-04, promptove/89).
     Up to STALE_OK_MS old it is shown at once, to everyone, with no
     warning: 7/14/30-day changes an hour old are still good data, and live
     prices come from Binance anyway. It used to be discarded past 15
     minutes, so one late cron run sent every visitor to CoinGecko through
     up to three routes (5+7+7s) before the same row was read again.

     PRO PRIORITY: past UNIVERSE_TTL_MS, a Pro page also fetches CoinGecko
     live in the background (_proFreshFetch) and re-renders when it lands.
     Free pages wait for the next cron run (the 15-minute auto refresh). The
     Pro window advertises this as "fresh-data priority". Only Pro tabs ever
     call CoinGecko on this path, which is what keeps a late cron from
     turning every open tab into an ingest path.

     Past STALE_OK_MS the cron is broken, not late: everyone fetches live,
     and the shared row at any age is the last resort. */
  var UNIVERSE_TTL_MS = 15 * 60 * 1000;
  var STALE_OK_MS     = 2 * 60 * 60 * 1000;
  var cacheKey = 'cg_markets_' + cat;
  var rawData  = [];
  var usedCache = false;
  var shared   = null;
  var idsKey   = uniqueIds.join(',');

  if (typeof supaCacheGetStale === 'function') {
    prog(15, 'Reading market data…');
    shared = await supaCacheGetStale(cacheKey);
    if (shared && Array.isArray(shared.data) && shared.data.length && shared.ageMs <= STALE_OK_MS) {
      rawData   = shared.data;
      usedCache = true;
      _marketDataTime = Date.now() - shared.ageMs;
      prog(30, 'Loaded ' + rawData.length + ' coins from shared cache');
      if (shared.ageMs > UNIVERSE_TTL_MS && isPro) {
        /* A newer live copy from an earlier background fetch wins. */
        if (_proFresh && _proFresh.ids === idsKey && _proFresh.time > _marketDataTime &&
            Date.now() - _proFresh.time <= UNIVERSE_TTL_MS) {
          rawData = _proFresh.data;
          _marketDataTime = _proFresh.time;
        } else {
          _proFreshFetch(uniqueIds, idsKey);
        }
      }
    }
  }

  if (!usedCache) {
    /* FALLBACK ONLY — the shared row is missing or over STALE_OK_MS old,
       which means sync-coin-universe is broken. */
    prog(20, 'Fetching data for ' + uniqueIds.length + ' coins…');
    rawData = await _cgMarketsFetch(uniqueIds);
    if (rawData.length) _marketDataTime = Date.now();

    /* Write fresh data to shared cache for other users */
    if (rawData.length && typeof supaCacheSet === 'function') {
      supaCacheSet(cacheKey, rawData); // fire-and-forget
    }
  }
  /* Every live path has failed by this point, including apiFetch's own
     per-visitor stale fallback. The shared row read above, at any age, is
     the last copy of this data that exists — and for a first-time visitor
     with an empty localStorage it is the ONLY one. No second request. */
  if (!rawData.length && shared && Array.isArray(shared.data) && shared.data.length) {
    rawData = shared.data;
    _marketDataTime = Date.now() - shared.ageMs;
    console.warn('[loadCoins] live fetch failed — using shared cache ' +
                 Math.round(shared.ageMs / 60000) + ' min old');
  }
  if (!rawData.length) throw new Error('CoinGecko data invalid');

  /* Named so _addRetiredHeld() below builds a retired coin the same way. */
  function _toCoin(c) {
    /* Prefer Binance for real-time price + 24H — it updates every second vs CoinGecko's 60s */
    var bnb = _binancePrices[c.symbol.toUpperCase()];
    var stable = (typeof STABLECOINS !== 'undefined') && STABLECOINS[c.id];
    /* Data-completeness flag — see computeScores() in this file for why it matters.
       Newly-listed coins frequently lack 30d (or 14d) % data; without this flag
       the `|| 0` fallback below would let them pass as "0% change" and rank
       mid-pack in r30, then computeScores would treat them as legitimate
       rotation candidates despite us having no real history. */
    var raw7  = c.price_change_percentage_7d_in_currency;
    var raw14 = c.price_change_percentage_14d_in_currency;
    var raw30 = c.price_change_percentage_30d_in_currency;
    var dataComplete = raw7 != null && raw14 != null && raw30 != null;
    return {
      id: c.id, sym: c.symbol.toUpperCase(), name: c.name,
      price:  bnb ? bnb.price  : c.current_price,
      image:  (c.image || '').replace(/\/small\//, '/large/'), mcap: c.market_cap, rank: 0,
      p24:    bnb ? bnb.p24    : (c.price_change_percentage_24h || 0),
      p7:     raw7  || 0,
      p14:    raw14 || 0,
      p30:    raw30 || 0,
      dataComplete: dataComplete,
      volume24: bnb ? bnb.volume : (c.total_volume || 0),
      circulating_supply: c.circulating_supply || 0,
      max_supply: c.max_supply || null,
      /* Engine 2.6.0: the supply reading falls back to this when there
         is no max. Present for every coin that has a circulating
         supply; max is present for two thirds. */
      total_supply: c.total_supply || null,
      ath: c.ath || 0, ath_change_pct: c.ath_change_percentage || 0,
      score: 0, r7: 0, r14: 0, r30: 0, isPro: false,
      isStable: !!stable,
      apr: stable ? stable.apr : 0,
      aprPlatform: stable ? stable.platform : ''
    };
  }
  var fetchedCoins = rawData.map(_toCoin);

  /* Merge fetched coins into persistent cache */
  fetchedCoins.forEach(function(c) { _coinCache[c.id] = c; });
  _loadedCategories[cat] = true;
  if (cat === 'all') {
    /* Mark every individual category as loaded too */
    CATEGORY_LIST.forEach(function(ct) { if (ct.key !== 'all') _loadedCategories[ct.key] = true; });
  }

  /* Build coins array from all cached coins */
  coins = [];
  Object.keys(_coinCache).forEach(function(id) { coins.push(_coinCache[id]); });
  coins.sort(function(a, b) { return b.mcap - a.mcap; });
  coins.forEach(function(c, i) { c.rank = i + 1; });

  /* BTC price + MA200. Real value comes from loadMarketCycle() (server-side,
     computed from actual 200-day daily closes — see sync-market-cycle Edge
     Function). Until that first successful fetch lands (e.g. very first
     page load before loadMarketCycle() has resolved), fall back to the old
     30-day-return estimate so the bull/bear pill isn't just blank —
     clearly worse than the real thing, but better than nothing for a few
     seconds. marketCycleData.BTC.mayer_multiple, once available, is the
     real, honest ratio the estimate could never provide. */
  var btcCoin = coins.find(function(c) { return c.id === 'bitcoin'; });
  if (btcCoin) {
    btcPrice = btcCoin.price;
    /* The real 200-day average or nothing (2026-09-30). The old fallback
       guessed it from the 30-day return, and a red month made that guess
       sit above the price, so the pill said DOWNTREND and the banner said
       BEAR MARKET while BTC was well above its real average. With no
       reading, renderBTC() leaves the pill on its loading state. */
    btcMA200 = (marketCycleData.BTC && marketCycleData.BTC.ma200) ? marketCycleData.BTC.ma200 : null;
  }

  await runSignalEngine();
  /* AFTER scoring, so a retired coin never enters anyone's ranks. */
  await _addRetiredHeld(_toCoin);
  window.coins = coins; /* sync so ui.js search/modal can access live data */
}

/* ── The weekly coin list (HANDOVER.md Task 1) ──────────────────────
   Read before loadCoins() so getActiveCoins() already names the live
   list. Any failure keeps the hand-written FREE_COINS, which is what the
   page ran on before; nothing here can empty the list. */
async function loadCoinUniverse() {
  try {
    if (typeof supaCacheGetStale !== 'function' || typeof applyCoinUniverse !== 'function') return;
    var r = await supaCacheGetStale('coin_universe');
    if (r && r.data) applyCoinUniverse(r.data);
  } catch (e) {
    console.warn('[loadCoinUniverse] failed, using the built-in list:', e.message);
  }
}

/* ── Coins that left the list, for the visitors who have them ───────
   "If a held coin drops off the list, keep showing it with a short
   note" (HANDOVER.md Task 1). The 15-minute sync keeps their market
   data in its own row, cg_markets_retired, so they never enter the
   scored universe. Only the ones this visitor holds, watches or paper
   trades are added, and only after scoring: they carry no score, never
   reach a list, and the YOURS tile says why (_retired). */
var _retiredCoins = [];
async function _addRetiredHeld(toCoin) {
  _retiredCoins = [];
  if (typeof COIN_UNIVERSE === 'undefined' || !COIN_UNIVERSE || !COIN_UNIVERSE.retired.length) return;
  var paperCount = (typeof _paperLoad === 'function') ? _paperLoad().length : 0;
  var watchCount = (typeof watchlist !== 'undefined' && Array.isArray(watchlist)) ? watchlist.length : 0;
  if (!holdings.length && !watchCount && !paperCount) return;   /* most visitors: no request */
  try {
    var r = await supaCacheGetStale('cg_markets_retired');
    if (!r || !Array.isArray(r.data)) return;
    r.data.forEach(function(row) {
      if (!row || !row.id || COIN_UNIVERSE.retired.indexOf(row.id) < 0) return;
      var c = toCoin(row);
      var mine = isHeldCoin(c) || isWatchedCoin(c)
        || (typeof isPaperCoin === 'function' && isPaperCoin(c));
      if (!mine) return;
      c._retired = true;
      c._eligible = false;
      c._exclusions = ['not_in_universe'];
      c.rank = 0;
      _retiredCoins.push(c);
    });
  } catch (e) {
    console.warn('[_addRetiredHeld] skipped:', e.message);
  }
  _appendRetired();
}
/* coins[] is rebuilt from _coinCache by loadCoins() AND loadBstocks();
   both call this after scoring, so the retired coins survive either. */
function _appendRetired() {
  if (!_retiredCoins.length) return;
  var have = {};
  coins.forEach(function(c) { have[c.id] = true; });
  _retiredCoins.forEach(function(c) { if (!have[c.id]) coins.push(c); });
}


/* ── Macro data (Gold, Silver, Oil, BTC 7D) ──────────────────── */
var _macroData = {btcP7: null, goldP7: null, silverP7: null, oilP7: null, dxyP7: null, total3P7: null, series: null};

/* Binance perpetual metrics for the modal's Derivatives section, keyed
   by base asset. Populated once per load from Supabase — the browser
   never calls Binance. Empty is a valid state: the section hides itself
   for coins with no perpetual, and a failed read simply means no
   section rather than a broken modal. Display only, never scored. */
var _futuresBySym = {};

/* Attribute-safe text for a title="..." tooltip.
   The Derivatives notes are all literals with interpolated numbers, so
   nothing here is currently attacker-controlled — this exists so that
   stays true if someone later interpolates a coin name or an exchange
   string into one of them. */
function _esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ── Where a reading sits in TODAY'S universe, 0..1 ──────────────
   Added 2026-09-16 with the taker-flow and basis cells.

   WHY THIS EXISTS RATHER THAN A CONSTANT. The obvious way to label a
   taker buy/sell ratio is "above 1.0 = more aggressive buying". That is
   wrong here, and measurably so: across the 300 perpetuals we store,
   the median ratio is 0.884, the 10th percentile 0.618 and the 90th
   1.160. A 1.0 cut would label roughly two-thirds of the universe as
   selling pressure at any given moment, which tells the reader nothing
   about the coin and quite a lot about Binance's taker mix.

   Perp basis has the same problem in the other direction: the median
   (mark - index) is -0.108%, not 0, so "negative basis = discount" is
   true of most of the market most of the time.

   So both are read RELATIVE to the rest of the universe right now. The
   tooltip prints the median it was compared against, because a
   percentile with no stated reference is just a number with a
   confident tone.

   Cross-sectional only — this says where a coin sits among its peers
   today, NOT whether the reading is high for that coin historically.
   Those are different claims and only the first one is made.

   Display only. Nothing here reaches a score: the Derivatives section
   is documented as unscored in supaLoadFuturesMetrics() and this does
   not change that. */
function _futuresPercentile(pick, value) {
  if (value == null || !isFinite(value)) return null;
  var vals = [];
  Object.keys(_futuresBySym).forEach(function(k) {
    var v = pick(_futuresBySym[k]);
    if (v != null && isFinite(v)) vals.push(v);
  });
  /* Under ~20 peers a percentile is noise dressed as precision. */
  if (vals.length < 20) return null;
  vals.sort(function(a, b) { return a - b; });
  var below = 0;
  for (var i = 0; i < vals.length; i++) { if (vals[i] < value) below++; else break; }
  var median = vals[Math.floor(vals.length / 2)];
  return { pct: below / vals.length, median: median, n: vals.length };
}

/* Technical events by base asset, from coin_events. Loaded once on boot —
   the whole universe produces a handful of rows a day. See
   supaLoadCoinEvents() for why the site reads rather than detects. */
var _eventsBySym = {};
async function loadCoinEvents() {
  try {
    _eventsBySym = (typeof supaLoadCoinEvents === 'function')
      ? await supaLoadCoinEvents() : {};
  } catch (e) {
    _eventsBySym = {};
  }
}

async function loadFuturesMetrics() {
  if (typeof supaLoadFuturesMetrics !== 'function') return;
  try {
    _futuresBySym = await supaLoadFuturesMetrics();
  } catch (e) {
    _futuresBySym = {};
  }
}

/* ── Delisted/suspended Binance symbols — real reported harm fix ────
   The rotation/buy suggestions were recommending tokens no longer
   actively trading on Binance. binance_delisted_symbols is populated
   daily by the sync-binance-status Edge Function, and since 2026-09-25
   it holds three kinds of row, named in `status`:
     BREAK, HALT, ...   exchangeInfo says the USDT pair stopped trading
     NOT_LISTED         no USDT pair on Binance at all
     DELIST_ANNOUNCED   still trading, but Binance has announced its end
   Any coin whose sym appears here gets excluded from
   buy-zone/rotation-target eligibility everywhere — see _isBuySide()/
   the sell-side filters in signals.js. Read-only, same fail-safe
   design as the server side: if this fetch fails, the Set stays
   empty and nothing gets excluded (fail open on THIS specific check
   only — not a reason to block the whole page).

   delistedStatus keeps the status per sym for the badge only, so a coin
   with an announced delisting is not labelled "not trading" while it
   still is. A cached row from before `status` was read has none, and
   the badge falls back to the generic wording. */
var delistedSymbols = new Set();
var delistedStatus  = {};

async function loadDelistedSymbols() {
  try {
    var rows = null;
    if (typeof supaCacheGet === 'function') {
      try { rows = await supaCacheGet('binance_delisted_symbols', 60 * 60 * 1000); }
      catch (e) { console.warn('[SupaCache] delisted-symbols read skipped:', e.message); }
    }
    if (!rows || !Array.isArray(rows)) {
      rows = await supaRest('binance_delisted_symbols', 'GET', { 'select': 'base_asset,status' });
      if (Array.isArray(rows) && typeof supaCacheSet === 'function') {
        supaCacheSet('binance_delisted_symbols', rows);
      }
    }
    if (Array.isArray(rows)) {
      delistedSymbols = new Set(rows.map(function(r) { return r.base_asset; }));
      delistedStatus  = {};
      rows.forEach(function(r) { if (r.status) delistedStatus[r.base_asset] = r.status; });
    }
  } catch (e) {
    console.warn('[loadDelistedSymbols] failed, no exclusions applied this load:', e.message);
  }
}

/* ── Binance Monitoring Tag — reported harm fix, 2026-09-06 ────────
   Rotation suggestions were surfacing SYN and GLMR. Both carry
   Binance's Monitoring Tag: the exchange's own marker for a token whose
   volatility/risk is materially above listing standards, reviewed
   periodically for possible delisting.

   This is NOT the same as delisted. All 32 Monitoring-tagged USDT pairs
   were status='TRADING' when measured, so loadDelistedSymbols() above
   caught none of them — the tag is the state between "fine" and
   "already broken".

   Excluded from the BUY side only, exactly like delistedSymbols: if a
   coin you already hold gets tagged, you still need to see how it is
   performing. Suppressing that would hide the position, not protect it.

   Same fail-open design: if this fetch fails the Set stays empty and
   nothing is excluded, rather than blocking the page. */
var monitoringSymbols = new Set();

async function loadMonitoringSymbols() {
  try {
    var rows = null;
    if (typeof supaCacheGet === 'function') {
      try { rows = await supaCacheGet('binance_monitoring_symbols', 60 * 60 * 1000); }
      catch (e) { console.warn('[SupaCache] monitoring-symbols read skipped:', e.message); }
    }
    if (!rows || !Array.isArray(rows)) {
      rows = await supaRest('binance_monitoring_symbols', 'GET', { 'select': 'base_asset' });
      if (Array.isArray(rows) && typeof supaCacheSet === 'function') {
        supaCacheSet('binance_monitoring_symbols', rows);
      }
    }
    if (Array.isArray(rows)) {
      monitoringSymbols = new Set(rows.map(function(r) { return r.base_asset; }));
    }
  } catch (e) {
    console.warn('[loadMonitoringSymbols] failed, no exclusions applied this load:', e.message);
  }
}

/* ── Binance's category tags ───────────────────────────────────────
   Same feed, same table, same fail-open contract as the two loaders
   above. Fills config.js's `binanceTags`, which categoryOf() reads.

   This is the streamlining: 194 category assignments were maintained by
   hand in config.js and could drift from what the exchange actually
   says. Binance publishes them. The hand map stays only as the fallback
   for coins Binance does not tag, and as the L1/L2 tie-breaker (Binance
   has one `Layer1_Layer2` tag where the site has two tabs).

   Note the tags are keyed by SYMBOL, not CoinGecko id — that is the
   exchange's key space, and it is why categoryOf() takes the whole coin
   rather than an id. */
async function loadBinanceTags() {
  try {
    var rows = null;
    if (typeof supaCacheGet === 'function') {
      try { rows = await supaCacheGet('binance_symbol_tags', 60 * 60 * 1000); }
      catch (e) { console.warn('[SupaCache] binance-tags read skipped:', e.message); }
    }
    if (!rows || !Array.isArray(rows)) {
      rows = await supaRest('binance_symbol_tags', 'GET', { 'select': 'base_asset,tags', 'limit': '1000' });
      if (Array.isArray(rows) && typeof supaCacheSet === 'function') {
        supaCacheSet('binance_symbol_tags', rows);
      }
    }
    if (Array.isArray(rows)) {
      var map = {};
      rows.forEach(function(r) { if (r.base_asset) map[r.base_asset] = r.tags || []; });
      binanceTags = map;
    }
  } catch (e) {
    console.warn('[loadBinanceTags] failed, falling back to the hand map:', e.message);
  }
}

/* ── Server-computed technicals ─────────────────────────────────────
   RSI(14) daily + weekly, the 60/125 MAs, and the cross state — all
   derived in sync-binance-daily-klines from candles that never leave
   Supabase. One small row per coin; the ~16,000 candles behind them are
   never shipped to a browser.

   Keyed by SYMBOL (the exchange's key space), like the futures metrics
   and the Binance tags.

   A missing entry, or a null field inside one, means NOT COMPUTABLE —
   a coin with no Binance USDT pair, or too few bars for that particular
   indicator. It must never be rendered as 0, as a neutral 50, or as a
   cold heatmap cell; absence has to read as absence or the UI invents a
   signal nobody measured. See _techVal()/crossBadge() in signals.js. */
var coinTechnicals = {};

async function loadCoinTechnicals() {
  try {
    var rows = null;
    if (typeof supaCacheGet === 'function') {
      try { rows = await supaCacheGet('coin_technicals', 60 * 60 * 1000); }
      catch (e) { console.warn('[SupaCache] technicals read skipped:', e.message); }
    }
    if (!rows || !Array.isArray(rows)) {
      rows = await supaRest('coin_technicals', 'GET', {
        'select': 'base_asset,rsi14_daily,rsi14_weekly,cross_state,cross_days_ago,bars_used,vol_ratio,vol_day,rsi14_settled',
        'limit':  '1000'
      });
      if (Array.isArray(rows) && typeof supaCacheSet === 'function') {
        supaCacheSet('coin_technicals', rows);
      }
    }
    if (Array.isArray(rows)) {
      var map = {};
      rows.forEach(function(r) {
        if (!r || !r.base_asset) return;
        map[r.base_asset] = {
          rsiD:      r.rsi14_daily    != null ? Number(r.rsi14_daily)    : null,
          rsiW:      r.rsi14_weekly   != null ? Number(r.rsi14_weekly)   : null,
          cross:     r.cross_state    || null,
          crossDays: r.cross_days_ago != null ? Number(r.cross_days_ago) : null,
          bars:      r.bars_used      != null ? Number(r.bars_used)      : 0,
          /* Volume of the last SETTLED day against its 30-day median
             (sync-binance-daily-klines v8, 2026-10-04). */
          volRatio:  r.vol_ratio      != null ? Number(r.vol_ratio)      : null,
          volDay:    r.vol_day        || null
        };
      });
      coinTechnicals = map;
    }
  } catch (e) {
    console.warn('[loadCoinTechnicals] failed, lenses will show as unavailable:', e.message);
  }
}

/* ── Macro: READ ONLY. The server owns this. ────────────────────────
   Until 2026-09-06 this function FETCHED macro data in the visitor's
   browser and wrote it back to market_cache — and compute-signal-run and
   send-telegram-alerts then read that. The backend's Layer 2 inputs came
   from whatever a random tab last managed to fetch, and a visitor whose
   fetches failed would write nulls over a good reading. That is why
   oilP7/dxyP7/silverP7/total3P7 were all null in production.

   sync-market-data now produces this server-side from Yahoo (no API key,
   see MACRO_SYMBOLS there). This function only reads it. It must never
   write market_cache.macro_data again.

   TTL is a day, not ten minutes: these are 7-day changes refreshed on the
   sync cron, and a short TTL would just make every visitor treat a
   perfectly good server reading as stale and fall through to nothing. */
async function loadMacroData() {
  if (typeof supaCacheGet === 'function') {
    try {
      var cached = await supaCacheGet('macro_data', 24 * 60 * 60 * 1000);
      if (cached && cached.goldP7 != null) {
        _macroData.goldP7    = cached.goldP7;
        _macroData.silverP7  = cached.silverP7;
        _macroData.oilP7     = cached.oilP7;
        _macroData.dxyP7     = cached.dxyP7;
        _macroData.total3P7  = cached.total3P7;
        _macroData.total3Mcap = cached.total3Mcap;
        /* Daily closes for the sparklines (2026-09-11). Copied by name
           like every other field so an absent `series` degrades to a
           cell with no chart, never to a broken cell. */
        _macroData.series    = cached.series || null;
        /* 30-day changes and the 7-day point counts, for the TODAY
           tiles' 7D/30D flip (2026-10-03). Absent on an older row, and
           the tile then says the 30-day reading is not there yet. */
        _macroData.p30       = cached.p30 || null;
        _macroData.n7        = cached.n7 || null;
        var btcCoin = coins.find(function(c) { return c.id === 'bitcoin'; });
        if (btcCoin) _macroData.btcP7 = btcCoin.p7;
        return;
      }
    } catch(e) { console.warn('[SupaCache] macro read skipped:', e.message); }
  }

  /* No server reading available (first run, or the sync is down).
     btcP7 still comes from coins[] because that is already loaded here and
     is not macro — it is one of the tracked assets.

     Everything else is deliberately left null. The engine has fallback
     constants for exactly this case, and a null is honest: it says "no
     reading", which dataQuality already reports. The old code fetched gold
     and silver from CoinGecko here and derived total3 by multiplying a 24h
     change by 2.5 — a fabricated 7d number — then wrote all of it back to
     the shared cache where the backend would read it. Both are gone. */
  var btcCoin = coins.find(function(c) { return c.id === 'bitcoin'; });
  if (btcCoin) _macroData.btcP7 = btcCoin.p7;
}

/* ── The briefing: on-chain readings. READ ONLY. ────────────────────
   sync-market-data's fetchNetwork() owns market_cache.network_data and
   is the only thing that writes it. Four readings, each with the 7-day
   percent already derived server-side:

     hashrateEh   Bitcoin hash rate, exahashes per second
     addrCount    unique Bitcoin addresses used that day
     tvlUsd       total value locked across every chain DefiLlama tracks
     stableUsd    total stablecoin supply

   The browser formats them and does not compute them, for the reason
   spelled out at loadMacroData(): a reading assembled in one visitor's
   tab is a reading nobody else can reproduce.

   Staleness is reported rather than hidden. These move on a daily
   cadence and the sync is cron-driven, so a reading is allowed to be a
   day old — but the section says how old it is, because "yesterday's
   hash rate" and "today's hash rate" are different claims. */
var _networkData = null;
var _networkAgeMs = null;

/* TODAY's money, metals and energy (promptove/86). READ ONLY:
   sync-market-data's fetchWorld() is the only writer. */
var _worldData = null;
var _worldAgeMs = null;
async function loadWorldData() {
  if (typeof supaCacheGetStale !== 'function') return;
  try {
    var row = await supaCacheGetStale('world_data');
    if (row && row.data) { _worldData = row.data; _worldAgeMs = row.ageMs; }
  } catch (e) {
    console.warn('[briefing] world read skipped:', e.message);
  }
}

async function loadNetworkData() {
  if (typeof supaCacheGetStale !== 'function') return;
  try {
    var row = await supaCacheGetStale('network_data');
    if (row && row.data) { _networkData = row.data; _networkAgeMs = row.ageMs; }
  } catch (e) {
    console.warn('[briefing] network read skipped:', e.message);
  }
}

/* ── Market Cycle (real MA200 + Mayer Multiple) ──────────────────
   Read-only — the sync-market-cycle Edge Function is the sole writer
   (see supabase/functions/sync-market-cycle/index.ts + sql/
   sync_market_cycle_cron.sql). This just reads the latest row per
   symbol out of `market_cycle`, same pattern as loadBstocks() reading
   unified_market_data.

   marketCycleData.BTC.mayer_multiple is the ONLY one with a calibrated
   "Stretched/Neutral/Oversold" label attached (see _btcCycleLabel()
   below and its use in computeScores()) — the 2.4×/0.8× bands are
   specific to Bitcoin's own multi-year history. ETH/BNB/SOL/XRP/PAXG
   show their real ratio in the UI but deliberately get NO qualitative
   label — applying BTC's bands to them would be presenting a guess as
   a validated fact. */
var marketCycleData = {}; /* keyed by symbol: 'BTC','ETH','BNB','SOL','XRP','PAXG' */

async function loadMarketCycle() {
  try {
    var rows = null;
    if (typeof supaCacheGet === 'function') {
      try { rows = await supaCacheGet('market_cycle_rows', 60 * 60 * 1000); /* 1hr TTL — updates once/day anyway */ }
      catch (e) { console.warn('[SupaCache] market_cycle read skipped:', e.message); }
    }
    if (!rows || !Array.isArray(rows) || !rows.length) {
      rows = await supaRest('market_cycle', 'GET', {
        'select': 'symbol,name,price,ma200,mayer_multiple,sample_size,computed_at'
      });
      if (Array.isArray(rows) && rows.length && typeof supaCacheSet === 'function') {
        supaCacheSet('market_cycle_rows', rows);
      }
    }
    if (Array.isArray(rows)) {
      rows.forEach(function(r) { marketCycleData[r.symbol] = r; });
    }
  } catch (e) {
    console.warn('[loadMarketCycle] failed:', e.message);
    /* Non-fatal — loadCoins()'s btcMA200 fallback estimate covers this */
  }
}

/* BTC's Mayer Multiple label — the ONLY asset with calibrated bands.
   2.4× / 0.8× are historically-observed cycle top/bottom levels specific
   to Bitcoin's own price history, not a generic rule of thumb. */
function _btcCycleLabel() {
  return (typeof RotatorEngine !== 'undefined')
    ? RotatorEngine.internals.btcCycleLabel()
    : null;
}


/* The unlock cell for the coin modal (2.9.0).

   Engine 2.9.0 made an imminent unlock an ELIGIBILITY reason rather than
   a score penalty, because a low score is the buy signal here and
   subtracting points for a cliff pushed the coin TOWARD being
   recommended. Measured on FF: 35 and in the buy zone with the penalty,
   50 and neutral without it.

   So this cell explains a coin's ABSENCE from the buy list, which is
   exactly the kind of thing a user cannot otherwise discover. It states
   the percentage, the date, and — when there is no schedule — says so
   instead of implying safety. */
function _tdUnlockCell(c) {
  var u = c && c.id && _tokenUnlocks[c.id];
  var pct = u && u.unlock30d_pct != null ? Number(u.unlock30d_pct) : null;
  /* STAMPED from the engine, never typed. The 2026-09-10 failure in
     GUARDRAILS.md was prose quoting a constant that had since moved. */
  var LINE = (window.RotatorEngine && window.RotatorEngine.UNLOCK_PENDING_PCT != null)
    ? window.RotatorEngine.UNLOCK_PENDING_PCT : 5;

  if (pct == null) {
    return '<div class="td-cell"><div class="td-cell-l">UNLOCKS · 30D</div>'
      + '<div class="td-cell-v" style="color:var(--muted);" '
      + 'title="No published vesting schedule for this coin. That is not the same as no unlock due — about 70% of the universe has no schedule available.">'
      + 'no schedule</div></div>';
  }

  var pending = pct > LINE;
  var when = '';
  if (u.next_unlock_at) {
    var d = new Date(u.next_unlock_at);
    if (!isNaN(d)) {
      var days = Math.round((d - Date.now()) / 86400000);
      when = ' · ' + d.toISOString().slice(0, 10) + (days >= 0 ? ' (' + days + 'd)' : '');
    }
  }
  var col = pending ? 'var(--red)' : pct > 0 ? 'var(--amber)' : 'var(--green)';
  var tip = pending
    ? 'Above the ' + LINE + '% line, so this coin is not published as a new entry until the unlock passes. It costs the coin no points — it is still scored, and still shown if you hold it.'
    : 'Share of the supply unlocked so far that vests again over the next 30 days.';

  /* The amount and date are Pro (Daniel, 2026-10-04: "unlock event to
     appear only inside in pro insight"). Free still learns that an
     unlock is due, so the warning itself is never paywalled. */
  if (!isPro && pct > 0) {
    return '<div class="td-cell" style="cursor:pointer;" onclick="openPro()" title="The amount and date are in the Pro Insight Engine.">'
      + '<div class="td-cell-l">UNLOCKS · 30D'
      + (pending ? ' <span style="color:var(--red);">PENDING</span>' : '') + '</div>'
      + '<div class="td-cell-v" style="color:' + col + ';">due · <span style="color:var(--pro);">details in Pro</span></div></div>';
  }

  return '<div class="td-cell"><div class="td-cell-l">UNLOCKS · 30D'
    + (pending ? ' <span style="color:var(--red);">PENDING</span>' : '') + '</div>'
    + '<div class="td-cell-v" style="color:' + col + ';" title="' + tip + '">'
    + pct.toFixed(2) + '%' + when + '</div></div>';
}

/* Pro Insight Engine: the unlock schedule as one tile (promptove/106).
   Same data and line as _tdUnlockCell; empty for stocks and stablecoins. */
function _tdUnlockTile(c) {
  if (!c || c.isStock || c.isStable) return '';
  var u = c.id && _tokenUnlocks[c.id];
  var pct = u && u.unlock30d_pct != null ? Number(u.unlock30d_pct) : null;
  var LINE = (window.RotatorEngine && window.RotatorEngine.UNLOCK_PENDING_PCT != null)
    ? window.RotatorEngine.UNLOCK_PENDING_PCT : 5;
  var cls, icon, val;
  if (pct == null)      { cls = 'neutral'; icon = '—'; val = 'No published schedule'; }
  else if (pct <= 0)    { cls = 'good';    icon = '✓'; val = 'None in the next 30 days'; }
  else {
    var when = '';
    if (u.next_unlock_at) {
      var d = new Date(u.next_unlock_at);
      if (!isNaN(d)) {
        var days = Math.round((d - Date.now()) / 86400000);
        when = ' · next ' + d.toISOString().slice(0, 10) + (days >= 0 ? ' (' + days + 'd)' : '');
      }
    }
    cls = pct > LINE ? 'bad' : 'mid'; icon = pct > LINE ? '−' : '~';
    val = pct.toFixed(2) + '% of supply in 30D' + when;
  }
  var hl = cls === 'good' ? ' highlight-good' : cls === 'bad' ? ' highlight-bad' : '';
  return '<div class="signal-tile' + hl + '" style="margin-top:2px;">'
    + '<span class="tile-icon ' + cls + '">' + icon + '</span>'
    + '<div class="tile-body"><span class="tile-label">UNLOCK SCHEDULE</span>'
    + '<span class="tile-value ' + cls + '">' + val + '</span></div></div>';
}

/* ── Token unlock schedules ────────────────────────────────────────
   Read-only, from the table sync-token-unlocks writes. Cached for an
   hour: published vesting plans do not move faster than that, and the
   server refreshes the full set roughly four times a day.

   COVERAGE IS ~30% of the universe. A coin missing from this map has NO
   PUBLISHED SCHEDULE, which is not the same as having no unlock due —
   the modal says so in as many words rather than showing a reassuring
   dash. That distinction is the whole reason the engine tests
   `typeof unlock30d === 'number'` instead of truthiness.

   Fails open to an empty map: no rows means no unlock lines, never a
   broken modal. */
var _tokenUnlocks = {};
async function loadTokenUnlocks() {
  var rows = null;
  if (typeof supaCacheGet === 'function') {
    try { rows = await supaCacheGet('token_unlocks', 60 * 60 * 1000); }
    catch (e) { console.warn('[SupaCache] token_unlocks read skipped:', e.message); }
  }
  if (!rows) {
    try {
      rows = await supaRest('token_unlocks', 'GET',
        { 'select': 'coin_id,unlock30d_pct,next_unlock_at,next_unlock_pct' });
      if (rows && typeof supaCacheSet === 'function') supaCacheSet('token_unlocks', rows);
    } catch (e) { console.warn('[TokenUnlocks]', e.message); return; }
  }
  if (!Array.isArray(rows)) return;
  var map = {};
  rows.forEach(function (r) { if (r && r.coin_id) map[r.coin_id] = r; });
  _tokenUnlocks = map;
}

/* ── Fear & Greed Index (pillar 6 of the Insight Engine) ───────────
   Rewritten 2026-09-10. Three bugs, all in the same few lines.

   1. NULL IS NOT 50. This initialised window.fearGreed to
      { value: 50, label: 'Neutral' } — a real-looking reading, before
      any fetch had resolved. The engine works hard to keep "sentiment
      was not consulted" apart from "sentiment read neutral" (it is
      rule 4 in GUARDRAILS.md), and this defeated that on the browser
      path: the object always existed, so the run always claimed a
      reading and pillar 6 always scored, sometimes on a number nobody
      measured. The comment at the call site even said so and shrugged.
      It is null now until something real arrives.

   2. THE TTL FOUGHT THE SERVER. 15 minutes, on an index that publishes
      ONCE A DAY and that sync-market-data writes twice a day. The cache
      was therefore almost always "stale" by that rule, so the browser
      skipped the server's row and hit alternative.me on nearly every
      page load — exactly the per-visitor fetching the server-side
      writer was added to end. 12 hours matches the write cadence; the
      engine's own 48h staleness guard is what catches a dead feed, and
      that lives in compute-signal-run where it belongs.

   3. THE BROWSER CLOBBERED THE GOOD ROW. supaCacheSet wrote back only
      { value, label }, dropping the `asOf` and `source` fields the
      server writer records. Every visitor stripped the provenance off
      the row that compute-signal-run reads. The fallback now writes the
      same shape, or does not write at all. */
window.fearGreed = null;
async function loadFearGreed() {
  /* 12h: the index is daily and the server writes it twice a day. */
  if (typeof supaCacheGet === 'function') {
    try {
      var cached = await supaCacheGet('fear_greed', 12 * 60 * 60 * 1000);
      if (cached && typeof cached.value === 'number') {
        window.fearGreed = cached;
        return;
      }
    } catch(e) { /* fall through to the API */ }
  }

  /* FALLBACK ONLY. Reaching here means sync-market-data has not written
     this row in 12 hours, which is a broken feed, not a normal load. */
  try {
    var data = await apiFetch('https://api.alternative.me/fng/?limit=1');
    var row  = data && data.data && data.data[0];
    var val  = row ? parseInt(row.value, 10) : NaN;
    /* No silent `|| 50`: an unparseable reading leaves fearGreed null so
       the pillar is skipped, rather than scoring a fabricated neutral. */
    if (isFinite(val) && val >= 0 && val <= 100) {
      var ts = Number(row.timestamp);
      window.fearGreed = {
        value: val,
        label: row.value_classification || '',
        /* Same shape the server writes, so a fallback does not degrade
           the row that compute-signal-run reads. */
        asOf: isFinite(ts) ? new Date(ts * 1000).toISOString() : null,
        source: 'alternative.me'
      };
      if (typeof supaCacheSet === 'function') {
        supaCacheSet('fear_greed', window.fearGreed);
      }
    }
  } catch(e) { console.warn('[FearGreed]', e.message); }
}

/* ── Rolling 7d volume tracker (client-side, samples 1x/day) ──────
   No historical volume feed exists in this project (CoinGecko/Binance
   only give snapshot volume24), so we build a short series ourselves
   in localStorage. Until a coin has 2+ daily samples, its ratio
   defaults to 1.0 (neutral) rather than skewing L1 on day one — after
   ~1 week of normal site usage every actively-viewed coin has a real
   7d average. */
var _VOL_HIST_KEY  = 'rot_vol_hist_v1';
var _VOL_HIST_DAYS = 7;
var _volHist = {};

function _loadVolHist() {
  try { return JSON.parse(localStorage.getItem(_VOL_HIST_KEY)) || {}; }
  catch (e) { return {}; }
}

/* _trackVolumeHistory lived here. Removed 2026-09-06 with computeScores,
   its only caller — the engine tracks volume history from the
   volumeHistory it is handed and returns it on the run. See promptove/23. */

/* volumeRatio = 24h volume / prior-days average. Falls back to 1
   (neutral — doesn't move the score) when there isn't enough history
   yet for a coin. */
function _volRatio(c) {
  return (typeof RotatorEngine !== 'undefined')
    ? RotatorEngine.internals.volRatio(c)
    : 1;
}
window._volRatio = _volRatio; // exposed for signal-history.js snapshot push

/* ══════════════════════════════════════════════════════════════
   SIGNAL ENGINE BRIDGE  (Phase 3 — server-authoritative crypto)

   Scoring happens in rotator-engine/engine.js, the single implementation
   the website, the Telegram bot and the Supabase edge functions all
   share. computeScores() and _classifyZones() below are NOT called for
   crypto any more (still used for bStocks — see runSignalEngine()) —
   they are kept in place on purpose, because
   rotator-engine/test/verify-verbatim.js compares the engine's copy of
   them against these originals on every test run. That check is what
   proves the extraction changed no mathematics, and deleting these
   would delete the check. They come out in a later commit, once the
   engine is the only copy anywhere.

   As of Step B (promptove/07-roadmap-2026-09-05.md), crypto score/zone
   come from signal_runs/signal_run_items — written every 15 minutes by
   the compute-signal-run Edge Function, not computed in this browser.
   See runSignalEngine() below for exactly what still runs locally
   (bStocks, and the same-session fallback if the server fetch fails).

   Volume history stays in localStorage — measured at ≤1 point of score
   movement, not worth a second schema change for that alone. */
var ROTATOR_ENGINE_READY = (typeof RotatorEngine !== 'undefined');

/* Write a run's per-coin results back onto coins[] under the field names
   the rest of the app already uses, so ui.js / holdings.js / signals.js /
   signal-history.js keep working untouched. */
function applySignalRun(run) {
  var byId = {};
  run.items.forEach(function(it) { byId[it.id] = it; });
  coins.forEach(function(c) {
    var it = byId[c.id];
    if (!it) return;
    c.score           = it.score;
    c.r7              = it.r7;
    c.r14             = it.r14;
    c.r30             = it.r30;
    c.scoreBreakdown  = it.breakdown;
    c._zone           = it.zone;
    c._effectiveScore = it.effectiveScore;
    /* The 7-pillar forward-looking read, computed by the engine since
       2.3.0. It used to be computed in this browser by computeInsights()
       in signals.js, and _classifyZones() used it to move a zone — a
       consumer calculation moving a live number, ARCHITECTURE-MAP.md
       gap 1. signals.js now only formats it: _insightRun is the run's
       own object and c.insight is the presentation copy built from it. */
    c._insightRun     = it.insight || null;
    /* Tradability, computed by the engine's _eligibility() — liquidity
       floor, market-cap sanity, delisted, stablecoin, equity, incomplete
       history. The engine has always returned this per item; nothing on
       the page read it, so illiquid coins kept reaching the buy list.
       See _isTradable() in signals.js. */
    c._eligible       = it.eligible !== false;
    c._exclusions     = it.exclusions || [];
    /* "May this be presented as a NEW entry" — a different question from
       score and from eligibility, answered by the engine and never by
       this page. See _classifyCandidate() in the engine. */
    c._candidateClass = it.candidateClass || null;
    c._rsi            = (typeof it.rsi === 'number') ? it.rsi : null;
    c._rsiState       = it.rsiState || null;
    c._candidate      = it.candidate || null;
    /* Read by coin-reading.js (promptove/67): the engine's futures
       positioning and v2 relative strength were computed and never shown. */
    c._positioning    = it.positioning || null;
    c._strength       = it.strength != null ? it.strength : null;
  });
  window.ROTATOR_RUN = run;
}

/**
 * Refresh coins[] with the latest signal data.
 *
 * Roadmap Step B (promptove/07-roadmap-2026-09-05.md): crypto score/zone/
 * breakdown now come from signal_runs / signal_run_items — the same table
 * compute-signal-run (Supabase Edge Function, on a 15-min cron) writes —
 * instead of being computed in THIS browser. Every visitor sees the same
 * score and zone for the same coin, which local computation could never
 * guarantee: rotator-fixture measured 17 of 177 coins classifying
 * differently depending on whose browser happened to load first. The
 * Telegram bot reads the same table once its own scoring is retired
 * (Step C).
 *
 * bStocks are NOT in that server run (compute-signal-run only scores the
 * CoinGecko crypto universe) and the canonical engine is still run
 * locally to score them — unchanged from before. That local run doubles
 * as the fallback for CRYPTO scores too, if the server fetch fails or
 * hasn't produced a row yet: a temporary backend gap must not blank the
 * dashboard.
 *
 * The old insight↔zone cross-link (a visitor's own rich Insight Engine
 * score nudging THEIR view of a held coin's zone near the 50 threshold)
 * is intentionally gone — it was exactly the kind of per-visitor drift
 * this migration exists to remove for crypto. The `insight` badge itself
 * (ui.js's separate tile, and signals.js's own rotation-panel bonus) is
 * untouched; neither ever read `_zone`/`_effectiveScore`.
 */
/* Set when the engine could not run at all. Read by the UI so a failed
   engine reads as "unavailable" rather than as a page full of zeros. */
var _engineUnavailable = false;

async function runSignalEngine() {
  var localRun = null;
  _engineUnavailable = false;

  /* Local pass, using the canonical engine. Its results are overwritten
     below for anything the server run covers — which since 2026-09-06 is
     crypto AND bStocks — so this is really a cold-start path: a brand-new
     database with no run yet, or a Supabase fetch that failed.

     There is no longer an in-page fallback beneath it. The site used to
     carry its own copy of computeScores()/_classifyZones() for when the
     engine script failed to load; that copy was the thing build.js lifted
     into the engine, and keeping it meant two implementations that could
     drift. A missing engine script is a deploy failure, and the honest
     response is to say so rather than to quietly score with a second
     implementation nobody is testing. See promptove/23. */
  if (typeof RotatorEngine === 'undefined') {
    console.error('[Engine] rotator-engine failed to load — scores unavailable. '
      + 'Check <script src="rotator-engine/engine.js"> in index.html.');
    _engineUnavailable = true;
  } else {
    var volHist = {};
    try { volHist = JSON.parse(localStorage.getItem(_VOL_HIST_KEY)) || {}; } catch (e) {}
    var prevZones = (typeof supaLoadZoneState === 'function') ? await supaLoadZoneState() : {};
    try {
      localRun = RotatorEngine.computeSignalRun({
        asOf:          new Date().toISOString(),
        coins:         coins,
        tokenomics:    (typeof TOKENOMICS_DB !== 'undefined') ? TOKENOMICS_DB : {},
        macro:         _macroData,
        marketCycle:   marketCycleData,
        volumeHistory: volHist,
        previousZones: prevZones,
        /* Real Wilder RSI(14), already loaded for the display lenses and
           keyed by the same symbol the engine matches on. It reaches the
           engine twice over: as the oversold CONFIRMATION step of the
           candidate classification (2.2.0), and as pillar 1 of the
           insight score (2.3.0). One feed, one coverage gate, both
           switched off together if it dies. The page has never computed
           RSI and still does not. loadCoinTechnicals() resolves before
           loadCoins(), so this is populated by the time the engine runs;
           if it is not, the engine sees 0% coverage and says so rather
           than confirming on nothing. */
        technicals:    (typeof coinTechnicals !== 'undefined') ? coinTechnicals : {},
        /* The same exchange lists compute-signal-run passes, so the local
           pass's `eligible` agrees with the server's. Added 2026-09-25:
           until then this run never heard of them, and any consumer of
           c._eligible (the track-record snapshot among them) relied on
           the server overlay arriving to exclude delisted, NOT_LISTED and
           DELIST_ANNOUNCED coins. Both Sets load before loadCoins() and
           are empty on a failed fetch, which the engine reads as "no
           exclusions" — the same fail-open as the server. */
        eligibility: {
          delisted:   (typeof delistedSymbols   !== 'undefined') ? Array.from(delistedSymbols)   : [],
          monitoring: (typeof monitoringSymbols !== 'undefined') ? Array.from(monitoringSymbols) : []
        },
        /* Pillar 6, the contrarian sentiment read. Passed as the whole
           row so the engine can tell "no reading this run" from
           "neutral" — it skips the pillar for the first and would score
           the second.

           Until 2026-09-10 loadFearGreed() defaulted this to
           { value: 50 } before its fetch resolved, so an unresolved
           fetch was indistinguishable from a real neutral reading and
           this line always passed an object. It is null until a real
           reading arrives, and dataQuality.fearGreedSupplied now means
           what it says. */
        fearGreed:     window.fearGreed || null
      });
      applySignalRun(localRun);
      try {
        _volHist = localRun.volumeHistory;
        localStorage.setItem(_VOL_HIST_KEY, JSON.stringify(localRun.volumeHistory));
      } catch (e) {}
    } catch (e) {
      /* Same reasoning as above: no second implementation to fall back
         to. The server overwrite below may still populate scores, so this
         is not necessarily fatal — it is reported, not swallowed. */
      console.error('[Engine] computeSignalRun failed — relying on the server run:', e);
      _engineUnavailable = true;
    }
  }

  /* Server-authoritative overwrite, crypto only — a coin id the server
     run doesn't know about (bStocks, or a coin outside its universe)
     simply keeps whatever the local pass above already set. */
  try {
    /* The newest run whose items are WRITTEN, not the newest header
       (promptove/63). compute-signal-run inserts the header, then every
       item in one insert; a visitor landing in between got a run with no
       items, kept the local scores, and the page stamped them with that
       empty run's time and version. The highest run_id in
       signal_run_items is the newest populated run: one PK index read. */
    var lastItem = await supaRest('signal_run_items', 'GET', {
      select: 'run_id', order: 'run_id.desc', limit: '1'
    });
    var latestId = lastItem && lastItem[0] && lastItem[0].run_id;
    var runRows = latestId == null ? [] : await supaRest('signal_runs', 'GET', {
      id:     'eq.' + latestId,
      /* params->marketOversold arrives as `marketOversold` (engine 2.10.0).
         Only that key: the rest of params is provenance, not page data. */
      select: 'id,as_of,engine_version,cycle_label,params->marketOversold',
      limit:  '1'
    });
    var latest = runRows && runRows[0];
    if (latest) {
      var items = await supaRest('signal_run_items', 'GET', {
        run_id: 'eq.' + latest.id,
        select: 'coin_id,score,effective_score,zone,r7,r14,r30,breakdown,eligible,'
                + 'candidate_class,rsi,rsi_state,candidate,insight,positioning,strength,exclusions'
      });
      var byId = {};
      (items || []).forEach(function(it) { byId[it.coin_id] = it; });
      coins.forEach(function(c) {
        var it = byId[c.id];
        if (!it) return;
        c.score           = Number(it.score);
        c.r7              = it.r7;
        c.r14             = it.r14;
        c.r30             = it.r30;
        c.scoreBreakdown  = it.breakdown;
        c._zone           = it.zone;
        c._effectiveScore = Number(it.effective_score);
        /* Server-side eligibility — same gate, same thresholds, computed
           once by compute-signal-run instead of per visitor. */
        c._eligible       = it.eligible !== false;
        /* Until 2026-09-26 this cleared _exclusions, because the table
           stored the verdict but not the reasons. The reasons ARE stored
           now (sql/signal_run_items_exclusions.sql),
           so the server's own list replaces the local pass's instead of
           being cleared. The coin window shows them (promptove/67). */
        c._exclusions     = Array.isArray(it.exclusions) ? it.exclusions : null;
        c._positioning    = it.positioning || null;
        c._strength       = it.strength != null ? Number(it.strength) : null;
        /* Same classification, from the server run. A run older than
           engine 2.2.0 has these null on every row; the page then shows
           no class rather than falling back to the local pass, because
           mixing a server score with a locally derived label would be
           exactly the parallel calculation this wiring exists to
           prevent. */
        c._candidateClass = it.candidate_class || null;
        c._rsi            = it.rsi != null ? Number(it.rsi) : null;
        c._rsiState       = it.rsi_state || null;
        c._candidate      = it.candidate || null;
        /* Same rule as the class above: a run older than 2.3.0 has this
           null on every row, and the page then shows no insight badge
           rather than computing one locally. Mixing a server score with
           a locally derived insight is exactly the parallel calculation
           this wiring exists to prevent — and it is the one that was
           actually happening until 2.3.0. */
        c._insightRun     = it.insight || null;
        c.insight         = null;   /* rebuilt by computeInsights() */
      });
      window.ROTATOR_RUN = { engineVersion: latest.engine_version, asOf: latest.as_of, cycleLabel: latest.cycle_label, source: 'server',
        /* null on a run older than 2.10.0, and the page then shows no
           line — never a locally derived one. */
        marketOversold: latest.marketOversold || null };
    } else if (localRun) {
      window.ROTATOR_RUN = localRun; /* no server row yet — e.g. cron hasn't ticked since project setup */
    }
  } catch (e) {
    console.warn('[Engine] server signal run fetch failed, using local scores:', e.message);
    if (localRun) window.ROTATOR_RUN = localRun;
  }

  return window.ROTATOR_RUN || null;
}

/* ── Score engine (3 layers) ─────────────────────────────────── */
/* SUPERSEDED — see the SIGNAL ENGINE BRIDGE above. Kept as the
   reference copy that verify-verbatim.js diffs the engine against. */
/* computeScores lived here — 120 lines of Layer 1/2/3 scoring. Removed
   2026-09-06. It was the site's own copy of maths that build.js then
   lifted into the engine; the engine is the source now and the page
   reads a run rather than computing one. See promptove/23. */

/* ══════════════════════════════════════════════════════════════
   bSTOCKS — Binance tokenized equities, merged into coins[]
   Replaces the old loadForex()/loadStocks() client-side fetch chains
   (Yahoo Finance / FMP / Alpha Vantage / Twelve Data / Frankfurter /
   ER-API — all removed, see rotator-bstocks-migration-plan.md).

   bStock rows are fetched from `unified_market_data` (asset_type='stock',
   source_name='binance'), the same server-side-synced table that already
   feeds the ticker tape in global-movers.js. The sync-market-data Edge
   Function (Supabase) is the sole writer — this is a read-only call,
   same pattern as everything else in this file, no client-side Binance
   fetch and therefore no CORS exposure.

   Rows are pushed into the SAME coins[] array crypto uses, tagged
   isStock:true and COIN_CATEGORIES[id]='stocks', so the existing
   category-tab filter, sort columns, holdings, and watchlist code in
   signals.js / holdings.js all work on them without a parallel code path.
══════════════════════════════════════════════════════════════ */
var bstocksLoaded = false;

/* ── Generated fallback icon for bStock rows ─────────────────────
   No live crypto-style logo source exists for these — CoinGecko only
   covers crypto, and both realistic third-party company-logo APIs are
   dead ends for a no-signup static site: Clearbit's free Logo API was
   sunset Dec 8 2025, and its suggested replacement (Logo.dev) requires
   a signed-up API token in the URL, not a drop-in anonymous endpoint.
   Generates a small inline SVG (as a data: URI, zero network request,
   can never 404) — a colored circle with the ticker's first 1-2 letters,
   using the same purple accent as the 🏛 STOCK badge in signals.js so
   it reads as visually consistent with that tag. */
function _bstockIconDataUri(sym) {
  var initials = sym.length <= 2 ? sym : sym.slice(0, 2);
  var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">'
    + '<circle cx="20" cy="20" r="20" fill="#3a2a6e"/>'
    + '<text x="20" y="26" font-family="Arial,Helvetica,sans-serif" font-size="15" '
    + 'font-weight="700" fill="#c0a8ff" text-anchor="middle">' + initials + '</text>'
    + '</svg>';
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

async function loadBstocks() {
  prog(50, 'Fetching bStock data…');
  try {
    var rows = null;

    /* Shared Supabase cache first (5 min TTL, same as crypto) */
    if (typeof supaCacheGet === 'function') {
      try {
        rows = await supaCacheGet('bstock_rows', 5 * 60 * 1000);
      } catch (e) { console.warn('[SupaCache] bstock read skipped:', e.message); }
    }

    /* Cache miss — read unified_market_data directly (read-only, RLS: public select) */
    if (!rows || !Array.isArray(rows) || !rows.length) {
      rows = await supaRest('unified_market_data', 'GET', {
        'asset_type':  'eq.stock',
        'source_name': 'eq.binance',
        'select':      'symbol,name,price,change_24h,metadata,last_updated',
        'order':       'symbol.asc'
      });
      if (Array.isArray(rows) && rows.length && typeof supaCacheSet === 'function') {
        supaCacheSet('bstock_rows', rows); // fire-and-forget
      }
    }

    if (!Array.isArray(rows) || !rows.length) {
      console.warn('[bStocks] no rows returned from unified_market_data yet');
      bstocksLoaded = true;
      return;
    }

    rows.forEach(function(r) {
      var meta = r.metadata || {};
      var id   = 'bstock_' + r.symbol;
      var listing = BSTOCK_LIST.find(function(b) { return b.sym === r.symbol; });

      var bcoin = {
        id: id, sym: r.symbol, name: r.name || (listing && listing.name) || r.symbol,
        price: r.price != null ? parseFloat(r.price) : 0,
        image: _bstockIconDataUri(r.symbol), mcap: meta.mcap || 0, rank: 0,
        /* The UNDERLYING COMPANY's market cap (price × shares
           outstanding), from Binance's product feed via sync-bstocks.
           Display only, and deliberately NOT folded into `mcap` above:
           that field is scored, and the engine's size term and Pillar-4
           turnover rule are calibrated on crypto. A bStock's Binance
           volume measured against the whole company's cap is ~1e-7,
           which would read as dead liquidity on every one of them.
           `mcap` therefore stays 0 for stocks, exactly as it always
           has. See the field note in sync-bstocks/index.ts. */
        equityMcap: meta.equity_mcap != null ? parseFloat(meta.equity_mcap) : null,
        p24: r.change_24h != null ? parseFloat(r.change_24h) : 0,
        p7:  meta.p7  != null ? parseFloat(meta.p7)  : 0,
        p14: meta.p14 != null ? parseFloat(meta.p14) : 0,
        p30: meta.p30 != null ? parseFloat(meta.p30) : 0,
        /* Only require 24h + 7D — klines cron may not backfill 14D on first run */
        dataComplete: (r.change_24h != null && meta.p7 != null),
        volume24: meta.volume24 || 0,
        circulating_supply: 0, max_supply: null, total_supply: null,
        ath: 0, ath_change_pct: 0,
        score: 0, r7: 0, r14: 0, r30: 0, isPro: false,
        isStable: false, isStock: true,
        apr: 0, aprPlatform: ''
      };

      _coinCache[id] = bcoin;
      COIN_CATEGORIES[id] = 'stocks'; /* registers the row with the STOCKS tab */
    });

    /* Rebuild coins[] from cache so bStock rows are included alongside crypto */
    coins = [];
    Object.keys(_coinCache).forEach(function(cid) { coins.push(_coinCache[cid]); });
    coins.sort(function(a, b) { return b.mcap - a.mcap; });
    coins.forEach(function(c, i) { c.rank = i + 1; });

    bstocksLoaded = true;
    await runSignalEngine();
    _appendRetired();   /* after scoring, see _addRetiredHeld() */
    window.coins = coins;
  } catch (e) {
    console.warn('[bStocks] load failed:', e.message);
    bstocksLoaded = true; /* don't retry-loop forever on a hard failure */
  }
}

/* ══════════════════════════════════════════════════════════════
   LOAD / REFRESH / AUTO-REFRESH
   Single-view now — no mode switcher. Crypto + bStocks share one
   table, one refresh cycle. Pauses automatically while the browser
   tab is hidden (Tab Visibility API).
══════════════════════════════════════════════════════════════ */

var _lastUpdated = 0; /* single shared timestamp, crypto + bStocks */

function _setLastUpdated() {
  _lastUpdated = Date.now();
  _renderLastUpdated();
}

/* When the coin market data was fetched from CoinGecko (the shared row's
   updated_at), set by loadCoins(). _lastUpdated is when THIS page last
   loaded; the two differ when the page is showing an old shared copy. */
var _marketDataTime = 0;

/* CoinGecko /coins/markets for these ids, in batches of 125 (per_page
   allows 250). A failed batch is skipped instead of rejecting the lot,
   so loadCoins() still reaches its last-resort shared copy. */
async function _cgMarketsFetch(ids) {
  var baseUrl = 'https://api.coingecko.com/api/v3/coins/markets'
    + '?vs_currency=usd&order=market_cap_desc&per_page=250&page=1'
    + '&sparkline=false&price_change_percentage=7d,14d,30d&include_24hr_vol=true';
  var batches = [];
  for (var b = 0; b < ids.length; b += 125) batches.push(ids.slice(b, b + 125).join(','));
  var results = await Promise.all(batches.map(function(q) {
    return apiFetch(baseUrl + '&ids=' + q).catch(function(e) {
      console.warn('[CG markets] batch failed:', e.message); return null;
    });
  }));
  var out = [];
  results.forEach(function(r) { if (Array.isArray(r)) out = out.concat(r); });
  return out;
}

/* Pro fresh-data priority (see loadCoins). One background fetch at a time;
   the result is kept in _proFresh and doRefresh() picks it up. A copy
   apiFetch served from its own expired cache is not "fresh" and is dropped. */
var _proFresh = null;      /* { data, time, ids } */
var _proFreshBusy = false;
function _proFreshFetch(ids, idsKey) {
  if (_proFreshBusy) return;
  _proFreshBusy = true;
  var staleBefore = (window.__ROT_CACHE_STATS || {}).staleServed || 0;
  _cgMarketsFetch(ids).then(function(data) {
    var servedStale = ((window.__ROT_CACHE_STATS || {}).staleServed || 0) > staleBefore;
    if (!data.length || servedStale) return;
    _proFresh = { data: data, time: Date.now(), ids: idsKey };
    if (!busy) doRefresh();
  }).finally(function() { _proFreshBusy = false; });
}

function _renderLastUpdated() {
  var el = document.getElementById('last-updated-crypto');
  if (!el) return;
  if (!_lastUpdated) { el.style.display = 'none'; el.textContent = ''; return; }
  /* The age of the market data itself, not of this page load, so an older
     shared copy never reads "updated just now". Neutral, no warning: it is
     still good data for a 7-30 day tool (Daniel, 2026-10-04). */
  var since = _marketDataTime || _lastUpdated;
  var mins = Math.floor((Date.now() - since) / 60000);
  var txt = mins < 1 ? 'updated just now'
    : mins < 60 ? 'updated ' + mins + 'm ago'
    : 'updated ' + Math.floor(mins / 60) + 'h ago';
  el.textContent = txt;
  el.style.display = '';
  /* The same age on The market now, the first thing on the page, so
     nobody has to wonder whether it is live (promptove/107). */
  var mn = document.getElementById('mn-fresh-t');
  if (mn) { mn.textContent = 'Prices ' + txt; mn.parentNode.style.display = ''; }
}

/* Tick the "X mins ago" label every minute */
setInterval(_renderLastUpdated, 60000);

var _autoRefreshTimer = null;
var _tabHidden = false;

/* Tab Visibility API — pause refresh when tab is hidden */
document.addEventListener('visibilitychange', function() {
  _tabHidden = document.hidden;
  if (!_tabHidden) {
    /* Tab just became visible — refresh immediately if stale (>14 min) */
    var stale = Date.now() - _lastUpdated > 14 * 60 * 1000;
    if (!busy && stale) doRefresh();
  }
});

/* ── bStock market-hours awareness ──────────────────────────────
   Binance itself trades bStocks ~24/5, but the underlying equity price
   only truly updates during NYSE hours — re-fetching outside that
   window just re-reads the same stale close. Skip the extra call then.
   Weekends: fully closed either way. */
function isStockMarketClosed() {
  var now = new Date();
  var day = now.getUTCDay();   /* 0=Sun … 6=Sat */
  var hm  = now.getUTCHours() * 60 + now.getUTCMinutes();
  if (day === 0 || day === 6) return true;
  if (hm < 13 * 60 + 30 || hm > 20 * 60) return true;
  return false;
}

function startAutoRefresh() {
  if (_autoRefreshTimer) clearInterval(_autoRefreshTimer);
  _autoRefreshTimer = setInterval(function() {
    if (busy || _tabHidden) return; /* skip when busy or tab hidden */
    doRefresh();
  }, 15 * 60 * 1000); /* 15 minutes */
}

async function doLoad() {
  if (typeof supaCountFeature === 'function') supaCountFeature('page_view', true);   /* usage count, promptove/64 */
  processIncomingRef();
  var _d = checkMyReferrals();
  isPro  = _d.pro || loadPro();
  busy   = true;
  /* Inject skeleton signal tiles immediately */
  ['sug-cards','mom-cards','worst-cards'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) {
      var skTiles = '<div class="sig-tiles-grid">';
      for (var s = 0; s < 3; s++) skTiles += '<div class="skel skel-tile"></div>';
      skTiles += '</div>';
      el.innerHTML = skTiles;
    }
  });
  /* Started now, read later (promptove/105). These four only feed what
     the page DRAWS (the TODAY briefing, the ETF strip, each turn sign's
     result since it appeared). Nothing that scores reads them, so
     fetching them while the coins load changes no number, and takes
     their ~1.2s (turn_signs_since alone is ~0.9s) off the wait.
     Fear & Greed, futures, unlocks and macro stay AFTER the coins, as
     before: the local engine (bStocks) reads Fear & Greed while it
     scores, and it must keep seeing what it saw. Each one already
     catches its own failure; the extra catch only keeps a rejection
     from going unhandled before it is awaited. */
  function _quiet(pr) { return Promise.resolve(pr).catch(function(e) { console.warn('[doLoad] early read failed:', e && e.message); }); }
  var _early = Promise.all([
    _quiet(loadNetworkData()), _quiet(loadWorldData()), _quiet(loadEtfFlows()), _quiet(loadChainFlows()),
    _quiet(typeof loadSignSince === 'function' ? loadSignSince() : null)
  ]);
  try {
    prog(8, 'Reading the market cycle…');
    await loadMarketCycle(); /* must resolve before loadCoins() so real btcMA200 is available */
    prog(20, 'Loading the coin list…');
    /* Both must resolve before renderAll() so buy/rotation suggestions
       exclude delisted AND Monitoring-tagged coins. Run together: they are
       independent reads and serialising them would add a round trip to
       first paint for no reason. */
    await Promise.all([loadDelistedSymbols(), loadMonitoringSymbols(), loadBinanceTags(), loadCoinTechnicals(), loadCoinEvents(), loadCoinUniverse()]);
    await loadCoins('all');  prog(50, 'Scoring and ranking coins…');  renderCoinSel();
    await loadBstocks();     prog(65, 'Fetching bStock data…');
    /* Re-key stored holdings/watchlist from ticker to coin id. Must run
       AFTER loadBstocks() — a stock holding can only resolve once the
       stocks are in coins[] — and BEFORE pruneStaleHoldings(), which
       deletes by id and would otherwise see every legacy entry as
       unresolved. The two together are the whole migration. */
    if (typeof upgradeHoldingKeys === 'function') upgradeHoldingKeys();
    if (typeof pruneStaleHoldings === 'function') pruneStaleHoldings();
    prog(78, 'Loading macro data — Gold, Oil…');
    /* Side by side, all after the coins as before (they were one after
       another, ~0.5s): the futures for the coin window's Derivatives
       section (never scores), macro (reads coins[] for BTC's 7d),
       sentiment, and the unlock schedules (a failure leaves the map
       empty and the coin window shows "no schedule"). */
    await Promise.all([loadFuturesMetrics(), loadMacroData(), loadFearGreed(), loadTokenUnlocks()]);
    prog(88, 'Fetching sentiment data…');
    await _early;          /* network, world, ETF flows, turn-sign results: usually done by now */
    renderBriefing();
    renderEtfFlows();
    renderChainFlows();
    renderFearGreed(); /* takes the banner slot if the scaling tip is already dismissed */
    prog(92, 'Almost ready — building your dashboard…');
    renderAll();         prog(100, 'All done! This free tool is built by one person — thanks for your patience ♥');
    window.coins = coins; /* keep window.coins fresh for search/modal */
    _setLastUpdated();
    var tsEl = document.getElementById('last-updated-crypto');
    if (tsEl) tsEl.style.display = '';
    /* A floor, not a delay (promptove/105, Daniel: "half a second is
       just too fast", "should not be more than 3 sec"). On a fast,
       warm connection the data can land in under a second and the
       screen flashed past before its message could be read. It stays
       up until 2.5s after the page started, and never adds time when
       the data itself took longer. */
    await sleep(Math.max(320, 2500 - performance.now()));
    document.getElementById('loader').classList.add('gone');
    startAutoRefresh();
    /* Activate referral: proves this user actually loaded data (anti-abuse) */
    if (typeof supaActivateMyReferral === 'function') try { supaActivateMyReferral(); } catch(e) {}
  } catch(e) {
    var lmsg = document.getElementById('lmsg');
    if (lmsg) lmsg.textContent = 'ERROR: ' + e.message;
    var lbf = document.getElementById('load-bar-fill');
    if (lbf) lbf.style.background = 'var(--red)';
    console.error('[doLoad]', e);
  }
  busy = false;
}

async function doRefresh() {
  if (busy) return;
  busy = true;
  if (typeof _klinesFetched !== 'undefined') _klinesFetched = false; /* re-fetch klines on refresh */
  var tsEl = document.getElementById('ts');
  if (tsEl) tsEl.style.color = 'var(--bnb)';
  try {
    await loadMarketCycle(); /* cheap — 1hr cache TTL, real MA200 barely moves anyway */
    /* Same TTL reasoning — Binance status and tags don't change minute to minute. */
    await Promise.all([loadDelistedSymbols(), loadMonitoringSymbols(), loadBinanceTags(), loadCoinTechnicals(), loadCoinEvents(), loadCoinUniverse()]);

    /* Always refresh crypto — re-fetch all loaded categories */
    await loadCoins(_loadedCategories['all'] ? 'all' : activeCategory);

    /* Refresh bStocks unless NYSE is closed — no point re-reading a stale close */
    if (!isStockMarketClosed()) await loadBstocks();

    renderAll();
    _setLastUpdated();
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
  /* Show scaling tip if not already dismissed */
  var scaleDismissed = false;
  try { scaleDismissed = localStorage.getItem('rot_scale_dismissed') === '1'; } catch(e) {}
  if (!scaleDismissed) {
    var sb = document.getElementById('scale-banner');
    if (sb) sb.classList.add('show');
  }
}

/* ── Dismiss scale tip banner ──────────────────────────────── */
function dismissScaleBanner() {
  try { localStorage.setItem('rot_scale_dismissed', '1'); } catch(e) {}
  var sb = document.getElementById('scale-banner');
  if (sb) sb.classList.remove('show');
  renderFearGreed();
}

/* ── The briefing, rendered ─────────────────────────────────────────
   Four readings from market_cache.network_data. Each cell is a value,
   its 7-day move, and one line saying what the number IS — a hash rate
   means nothing to a reader who has not met one before.

   Deliberately not a call to action. These describe the network, they do
   not argue for a trade, and the wording keeps to that.

   A reading that did not resolve is left out rather than shown as a dash:
   four cells with one empty is worse than three cells. If none resolved
   the whole block stays hidden and the ticker carries the section, which
   is what it did before this existed. */
function _bfNum(v, digits) {
  if (v == null || !isFinite(v)) return null;
  return v.toLocaleString('en-US', {
    minimumFractionDigits: digits || 0, maximumFractionDigits: digits || 0
  });
}
function _bfUsd(v) {
  if (v == null || !isFinite(v)) return null;
  if (v >= 1e12) return '$' + (v / 1e12).toFixed(2) + 'T';
  if (v >= 1e9)  return '$' + (v / 1e9).toFixed(1)  + 'B';
  if (v >= 1e6)  return '$' + (v / 1e6).toFixed(1)  + 'M';
  if (v >= 1e4)  return '$' + Math.round(v / 1e3) + 'K';
  return '$' + Math.round(v).toLocaleString('en-US');
}
function _bfDelta(p, days) {
  if (p == null || !isFinite(p)) return '';
  var cls = p >= 0 ? 'up' : 'dn';
  return '<span class="bf-d ' + cls + '">' + (p >= 0 ? '+' : '')
       + p.toFixed(1) + '% ' + (days || 7) + 'd</span>';
}
/* The LEVEL for a macro cell, taken as the last point of its own daily
   series — the same array the sparkline draws.

   The first version printed the 7-day percentage as the headline value
   AND as the delta beneath it, so every macro cell read "-0.8% / -0.8%
   7d". The level is the missing half: gold at $4,394 having moved -0.8%
   says something the percentage alone does not.

   Decimals follow magnitude rather than a fixed rule, because these
   four span 99 (dollar index) to 4,394 (gold) and one format cannot
   serve both. Returns null when there is no series, and the caller then
   falls back to the percentage rather than dropping the cell. */
function _bfLevel(series, prefix) {
  if (!Array.isArray(series) || !series.length) return null;
  var v = series[series.length - 1];
  if (typeof v !== 'number' || !isFinite(v)) return null;
  var dp = v >= 1000 ? 0 : v >= 100 ? 1 : 2;
  return (prefix || '') + v.toLocaleString('en-US',
    { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

/* Fallback when a macro series is unavailable: show the move itself
   rather than nothing, so the cell still carries information. */
function _bfPct(p) {
  if (p == null || !isFinite(p)) return null;
  return (p >= 0 ? '+' : '') + p.toFixed(1) + '%';
}

function _bfAge(ms) {
  if (ms == null) return '';
  var h = ms / 3600000;
  if (h < 1.5) return 'updated in the last hour';
  if (h < 36)  return 'updated ' + Math.round(h) + 'h ago';
  return 'updated ' + Math.round(h / 24) + 'd ago';
}

/* A sparkline, as inline SVG, from a plain array of numbers.

   WHY THE DATA WAS ALREADY THERE. pct7d() in sync-market-data downloads
   a month of daily closes for gold, silver, oil and DXY and used to keep
   exactly two of them; chainSeries() downloaded nine days of hash rate
   and addresses and kept two; DefiLlama returns the whole TVL history on
   the endpoint already being called. Engine-side these were all thrown
   away. Storing them (2026-09-11) cost ZERO additional API calls.

   No chart library: this is one <path> and it has to render inside a
   cell that is 120px wide on a phone. Colour follows the 7-day delta so
   the line agrees with the number above it rather than stating a second,
   possibly different, opinion.

   Returns '' for anything unplottable, and the caller renders the cell
   without a chart rather than with an empty box. */
/* minSpan (2026-10-03): the smallest move the chart's height stands for.
   A policy rate that wobbled 0.001 points was drawn as a full-height dive;
   rates now pass 0.25 points, so a wobble stays flat. neutral draws the
   line grey, for a rate that did not change. */
/* overlay (promptove/109): a second series lined up day by day with
   `series` (China's oil price on the WTI tile). Same scale as the main
   line, so the gap is drawn as it is; a null breaks the line (a China
   holiday). Blue (Daniel, 2026-10-04), so it never reads as up or down. */
function _bfSpark(series, up, minSpan, neutral, overlay) {
  if (!Array.isArray(series) || series.length < 3) return '';
  var pts = series.filter(function (v) { return typeof v === 'number' && isFinite(v); });
  if (pts.length < 3) return '';
  var ov = (Array.isArray(overlay) && overlay.length === series.length && pts.length === series.length)
    ? overlay : null;
  var ovVals = ov ? ov.filter(function (v) { return typeof v === 'number' && isFinite(v); }) : [];
  if (ovVals.length < 2) ov = null;

  var W = 100, H = 26, PAD = 2;
  var all = ov ? pts.concat(ovVals) : pts;
  var lo = Math.min.apply(null, all), hi = Math.max.apply(null, all);
  if (minSpan && hi - lo < minSpan) { var mid = (hi + lo) / 2; lo = mid - minSpan / 2; hi = mid + minSpan / 2; }
  /* A flat series would divide by zero; draw it down the middle. */
  var span = (hi - lo) || 1;
  var stepX = W / (pts.length - 1);

  var d = pts.map(function (v, i) {
    var x = (i * stepX).toFixed(1);
    var y = (PAD + (H - PAD * 2) * (1 - (v - lo) / span)).toFixed(1);
    return (i ? 'L' : 'M') + x + ' ' + y;
  }).join(' ');

  var col = neutral ? 'var(--muted)' : up ? 'var(--green)' : 'var(--red)';
  var d2 = '';
  if (ov) {
    var pen = false;
    ov.forEach(function (v, i) {
      if (typeof v !== 'number' || !isFinite(v)) { pen = false; return; }
      var x = (i * stepX).toFixed(1);
      var y = (PAD + (H - PAD * 2) * (1 - (v - lo) / span)).toFixed(1);
      d2 += (pen ? 'L' : 'M') + x + ' ' + y + ' ';
      pen = true;
    });
  }
  return '<svg class="bf-spark" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none"'
    + ' aria-hidden="true" focusable="false">'
    + (d2 ? '<path class="bf-spark-ov" d="' + d2.trim() + '" fill="none" stroke-width="1.3"'
      + ' stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>' : '')
    + '<path d="' + d + '" fill="none" stroke="' + col
    + '" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>'
    + '</svg>';
}

/* ── TODAY, regrouped (Daniel, 2026-10-03, promptove/86) ────────────
   Four groups: CENTRAL BANKS & MONEY, METALS, ENERGY COST, ON-CHAIN.
   Every tile names its source (linked) and the date of its reading,
   because these come from many places on many clocks: the Treasury
   publishes after the US close, the BLS electricity price is monthly and
   about six weeks behind. Money/metals/energy come from
   market_cache.world_data (sync-market-data fetchWorld); on-chain from
   network_data as before. If world_data is missing, gold, silver, oil
   and the dollar fall back to macro_data so the section never goes
   blank.

   Every tile shows the window the bar above picks (_bfLong: 7, 30, 90,
   182, 365 or 1095 days; opens on 90 since 2026-10-06, Daniel: "3M is more informative, the
   broader picture can be seen"; it opened on 30 before; 3M and 6M added 2026-10-04). The per-tile 7D/30D flip was retired on
   2026-10-04 (Daniel: the corner "7D" was an artifact from before
   30D/1Y/3Y existed and read as a second, conflicting filter). Rates move in POINTS, not percent: a yield going
   from 4.00% to 4.40% is "+0.40 pts", where "+10%" would mislead. The
   wording explains what a reading is; it does not predict (the yield
   test is pre-registered separately, promptove/86). */
var _bfLong = 90;

var BF_SRC = {
  treasury: { n: 'U.S. Treasury', u: 'https://home.treasury.gov/resource-center/data-chart-center/interest-rates' },
  nyfed:    { n: 'New York Fed', u: 'https://www.newyorkfed.org/markets/reference-rates/effr' },
  ecb:      { n: 'European Central Bank', u: 'https://data.ecb.europa.eu/data/datasets/FM/FM.D.U2.EUR.4F.KR.DFR.LEV' },
  boj:      { n: 'Bank of Japan', u: 'https://www.stat-search.boj.or.jp/' },
  mof:      { n: 'Japan Ministry of Finance', u: 'https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/' },
  bls:      { n: 'U.S. Bureau of Labor Statistics', u: 'https://data.bls.gov/timeseries/APU000072610' },
  comex:    { n: 'COMEX via Yahoo Finance', u: 'https://finance.yahoo.com/quote/' },
  nymex:    { n: 'NYMEX via Yahoo Finance', u: 'https://finance.yahoo.com/quote/' },
  ice:      { n: 'ICE via Yahoo Finance', u: 'https://finance.yahoo.com/quote/DX-Y.NYB' },
  bc:       { n: 'Blockchain.com', u: 'https://www.blockchain.com/explorer/charts' },
  llama:    { n: 'DefiLlama', u: 'https://defillama.com/' }
};
var _BF_MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/* "2 Oct" for a daily reading, "Aug 2026" for a monthly one. */
function _bfDay(iso, monthly) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  var p = iso.split('-');
  return monthly ? _BF_MON[+p[1] - 1] + ' ' + p[0] : (+p[2]) + ' ' + _BF_MON[+p[1] - 1];
}
function _bfSrc(src, sym, date, monthly) {
  if (!src) return '';
  var url = src.u + (sym ? encodeURIComponent(sym) : '');
  var when = _bfDay(date, monthly);
  return '<div class="bf-src"><span>Source</span> <a href="' + url + '" target="_blank" rel="noopener">'
    + src.n + '</a>' + (when ? ' · <span>' + when + '</span>' : '') + '</div>';
}
/* A change, as percent or as points. A policy rate that did not move
   says so in words instead of "+0.00". */
function _bfChange(c, label, pts, usd) {
  if (c == null || !isFinite(c)) return '<span class="bf-d bf-na">No ' + label + ' reading yet</span>';
  /* A spread changes in dollars, not percent (promptove/109). */
  if (usd) return '<span class="bf-d ' + (c >= 0 ? 'up' : 'dn') + '">' + (c >= 0 ? '+$' : '-$') + Math.abs(c).toFixed(2) + ' ' + label + '</span>';
  if (pts) {
    if (Math.abs(c) < 0.005) return '<span class="bf-d bf-flat">unchanged ' + label + '</span>';
    return '<span class="bf-d ' + (c >= 0 ? 'up' : 'dn') + '">' + (c >= 0 ? '+' : '') + c.toFixed(2) + ' pts ' + label + '</span>';
  }
  return '<span class="bf-d ' + (c >= 0 ? 'up' : 'dn') + '">' + (c >= 0 ? '+' : '') + c.toFixed(1) + '% ' + label + '</span>';
}
function _bfFmt(v, kind) {
  if (v == null || !isFinite(v)) return null;
  if (kind === 'rate') return v.toFixed(2) + '%';
  if (kind === 'cents') return (v * 100).toFixed(v * 100 < 10 ? 2 : 1) + '¢';   /* gas per kWh in MK is ~1¢: two decimals */
  if (kind === 'usdBig') return _bfUsd(v);
  var dp = v >= 1000 ? 0 : v >= 100 ? 1 : 2;
  return (kind === 'usd' ? '$' : '') + v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}
/* "raised 24 Sep" / "cut 24 Sep" under a central bank rate. */
function _bfStep(last) {
  if (!last || last.to == null || last.from == null) return '';
  return '<div class="bf-step">' + (last.to > last.from ? 'raised' : 'cut') + ' ' + _bfDay(last.date) + '</div>';
}

/* The China line's key and gap, under the WTI price (promptove/109).
   The gap is on China's latest trading day, against the US and the
   global benchmark. Shanghai crude is Middle-East oil delivered to
   China, so Brent is the like-for-like comparison. */
var BF_CN_TIP = 'Shanghai crude futures (INE SC) via Sina Finance, in dollars at the day\'s yuan rate (CNY=X, Yahoo Finance)';
/* Right of the WTI price, in blue like its line (Daniel, 2026-10-04). */
function _bfChinaRight(cn) {
  return '<div class="bf-cn-big" title="' + BF_CN_TIP + '">'
    + '<span class="bf-cn-lbl">China (Shanghai)</span>'
    + '<span class="bf-cn-v">$' + cn.v.toFixed(2) + '</span></div>';
}
function _bfChinaNote(cn) {
  var parts = [];
  var g = function (v, name) {
    if (v == null || !isFinite(v)) return;
    parts.push('$' + Math.abs(v).toFixed(2) + (v >= 0 ? ' over ' : ' under ') + name);
  };
  g(cn.vsBrent, 'Brent'); g(cn.vsWti, 'WTI');
  if (!parts.length) return '';
  return '<div class="bf-step bf-cn" title="' + BF_CN_TIP + '">'
    + '<span class="bf-cn-gap">' + parts.join(' · ') + '</span>'
    + ' <span class="bf-cn-d">' + _bfDay(cn.date) + '</span></div>';
}

/* One tile spec per reading. `w` holds the windows: c (change) and s
   (the line) for 7, 30 and 365 days. */
function _bfWorldCell(it, o) {
  if (!it || it.v == null) return null;
  var s = Array.isArray(it.s) ? it.s : [];
  var w = {
    7:   { c: it.c7,   s: it.n7 >= 2 ? s.slice(-it.n7) : null, l: '7d' },
    30:  { c: it.c30,  s: it.n30 >= 2 ? s.slice(-it.n30) : null, l: '30d' },
    /* 3 and 6 months (Daniel, 2026-10-04): sliced from the year line by the
       server's own day counts, like 7D and 30D. */
    90:  { c: it.c90,  s: it.n90 >= 2 ? s.slice(-it.n90) : null, l: '3m' },
    182: { c: it.c182, s: it.n182 >= 2 ? s.slice(-it.n182) : null, l: '6m' },
    365: { c: it.c365, s: s, l: '1y' },
    /* 3 years (2026-10-03): ~160 thinned points; a row written before
       the server kept 3 years falls back to the 1-year side. */
    1095: Array.isArray(it.s3) && it.s3.length > 2 ? { c: it.c1095, s: it.s3, l: '3y' } : { c: it.c365, s: s, l: '1y' }
  };
  /* China's oil price on the WTI tile (promptove/109): the server lines it
     up with WTI's own days, so each window takes the same slice. */
  var cn = o.china && it.cn && Array.isArray(it.cn.s) && it.cn.s.length === s.length ? it.cn : null;
  if (cn) {
    w[7].o = it.n7 >= 2 ? cn.s.slice(-it.n7) : null;
    w[30].o = it.n30 >= 2 ? cn.s.slice(-it.n30) : null;
    w[90].o = it.n90 >= 2 ? cn.s.slice(-it.n90) : null;
    w[182].o = it.n182 >= 2 ? cn.s.slice(-it.n182) : null;
    w[365].o = cn.s;
    w[1095].o = w[1095].s === it.s3 && Array.isArray(cn.s3) && cn.s3.length === it.s3.length ? cn.s3 : (w[1095].s === s ? cn.s : null);
  }
  if (o.monthly) {
    /* Monthly: a week means nothing. The front compares with the month
       before; 30D does the same; both draw the 12 months. */
    w[7] = { c: it.c1m, s: s, l: '1m' };
    w[30] = { c: it.c1m, s: s, l: '1m' };
    /* 3M / 6M in months, not days (Daniel, 2026-10-05). The server's n90
       counts the points inside 90 days (Jun, Jul, Aug for an August
       reading): two months of line, while c90 compares with May. A change
       over N months needs N+1 monthly points, so the line now starts at
       the same month the percentage does. */
    if (s.length >= 4) w[90]  = { c: it.c90,  s: s.slice(-4), l: '3m' };
    if (s.length >= 7) w[182] = { c: it.c182, s: s.slice(-7), l: '6m' };
    if (Array.isArray(it.s3) && it.s3.length > 2) w[1095] = { c: it.c1095, s: it.s3, l: '3y' };
  }
  /* o.mk: the Macedonian page shows SI units (Daniel, 2026-10-04): copper
     per tonne, natural gas per kWh. Only the price is converted; the
     changes are percentages, and a line keeps its shape when scaled.
     English keeps the units the markets quote. */
  var si = o.mk && typeof currentLang !== 'undefined' && currentLang === 'mk' ? o.mk : null;
  return {
    k: o.k, v: si ? _bfFmt(it.v * si.mul, si.kind || o.kind) : _bfFmt(it.v, o.kind), u: si ? si.u : (o.u || ''),
    pts: o.kind === 'rate', usd: !!o.usdpts, w: w,
    right: cn && cn.v != null ? _bfChinaRight(cn) : '',
    d: o.d, extra: (o.range && it.lo != null ? '<div class="bf-step">target ' + it.lo.toFixed(2) + '–' + it.hi.toFixed(2) + '%</div>' : '')
      + (cn && cn.v != null ? _bfChinaNote(cn) : '')
      + (o.policy ? _bfStep(it.last) : '')
      + (o.gas && it.gwei != null ? '<div class="bf-step">gas now ' + it.gwei + ' gwei</div>' : ''),
    src: _bfSrc(o.src, o.sym, it.date, o.monthly)
  };
}
/* The on-chain tiles keep their 7/30-day numbers from network_data. Their
   1Y side comes from world_data (o.year: a year of the same reading);
   until that exists, 1Y falls back to the 30 days. */
/* 2026-10-05 (Daniel: "the BTC addresses text is only for 7d"). The hash
   rate and address tiles say their number is a 7-day average, and their
   7D and 30D changes are (sync-market-data compares 7-day means), but
   3M, 6M and 1Y came from world_data's c90/c182/c365: one raw day against
   one raw day, which carries the ~7% block noise and, for addresses, the
   weekday the two days fell on. o.avg7 recomputes those three the same
   way as 7D/30D, from the daily line already loaded: the mean of the last
   7 points against the mean of the 7 points ending where the window
   starts. 3Y stays as stored (s3 is thinned to about one point a week, so
   there is no week to average) and the tile text says so. */
function _bfMean(a) {
  var v = a.filter(function (x) { return typeof x === 'number' && isFinite(x); });
  return v.length ? v.reduce(function (t, x) { return t + x; }, 0) / v.length : null;
}
function _bfAvg7Change(s, n) {
  if (!Array.isArray(s) || s.length < 14 || !(n >= 2)) return null;
  var i0 = Math.max(0, s.length - n);            /* first point inside the window */
  var from = Math.max(0, i0 - 6);
  var past = _bfMean(s.slice(from, from + 7)), now = _bfMean(s.slice(-7));
  return past ? (now / past - 1) * 100 : null;
}
function _bfNetCell(o) {
  if (o.v == null) return null;
  var y = o.year && Array.isArray(o.year.s) ? o.year : null;
  /* Stablecoin supply has no line in network_data, so 7D/30D drew no
     chart; the same reading's daily line is in world_data. */
  var s = Array.isArray(o.s) ? o.s : (y && y.n30 >= 2 ? y.s.slice(-y.n30) : null);
  var s7 = Array.isArray(o.s) ? ((o.n7 >= 3) ? o.s.slice(-o.n7) : o.s) : (y && y.n7 >= 2 ? y.s.slice(-y.n7) : null);
  var yc = function (n, stored) { return o.avg7 ? _bfAvg7Change(y.s, n) : stored; };
  return {
    k: o.k, v: o.v, u: o.u || '', pts: false,
    w: { 7: { c: o.p, s: s7, l: '7d' },
         30: { c: o.p30, s: s, l: '30d' },
         90: y && y.n90 >= 2
           ? { c: yc(y.n90, y.c90), s: y.s.slice(-y.n90), l: '3m' } : { c: null, s: null, l: '3m' },
         182: y && y.n182 >= 2
           ? { c: yc(y.n182, y.c182), s: y.s.slice(-y.n182), l: '6m' } : { c: null, s: null, l: '6m' },
         365: y && y.s.length > 30
           ? { c: yc(y.s.length, y.c365), s: y.s, l: '1y' } : { c: o.p30, s: s, l: '30d' },
         1095: o.year && Array.isArray(o.year.s3) && o.year.s3.length > 2
           ? { c: o.year.c1095, s: o.year.s3, l: '3y' }
           : y && y.s.length > 30
           ? { c: yc(y.s.length, y.c365), s: y.s, l: '1y' } : { c: o.p30, s: s, l: '30d' } },
    /* The date of the reading, like every other tile (it was left out). */
    d: o.d, extra: '', src: _bfSrc(o.src, null, o.year && o.year.date)
  };
}

/* ── TODAY emblems: what a tile is about, before its numbers ──────────
   Tried on the light theme first (the experimental board), then both
   themes (Daniel, 2026-10-05, promptove/113). Every tile gets a picture of
   its subject: a flag for a central bank or a government bond, an ingot
   for a metal, a barrel, a flame, a bolt, a coin. Decoration only: the
   title still says what the tile is, so the picture is aria-hidden.

   Flags are drawn, not emoji: Windows has no flag emoji and would print
   the letters "EU" or "JP" instead. Keyed by the English label, which
   is what c.k holds before the Macedonian layer translates the page. */
var BF_EMB_BY_K = {
  'Fed rate': 'us', 'US 3-month': 'us', 'US 2-year': 'us', 'US 10-year': 'us',
  'ECB rate': 'eu', 'BoJ rate': 'jp', 'Japan 10-year': 'jp', 'Dollar index': 'usd',
  'Gold': 'gold', 'Silver': 'silver', 'Copper': 'copper', 'Aluminum': 'aluminum',
  'Oil · WTI': 'barrel', 'Diesel crack spread': 'diesel', 'Natural gas': 'flame', 'Electricity': 'bolt',
  'Hash rate': 'btc', 'Active addresses': 'btc', 'DeFi TVL': 'lock', 'Stablecoin supply': 'stable',
  'Ethereum fees': 'eth', 'Solana fees': 'sol', 'Solana DEX volume': 'sol'
};
var _BF_INGOT = { gold: ['#e3b23c', '#a87a12'], silver: ['#b0b8c0', '#5d666e'],
                  copper: ['#c87a4a', '#8a4a26'], aluminum: ['#98a3ad', '#55606a'] };
function _bfStar(cx, cy, r) {
  var p = [];
  for (var i = 0; i < 10; i++) {
    var a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.42 : r;
    p.push((cx + rr * Math.cos(a)).toFixed(2) + ' ' + (cy + rr * Math.sin(a)).toFixed(2));
  }
  return '<polygon points="' + p.join(' ') + '" fill="#ffcc00"/>';
}
function _bfIngot(x, y, w, col) {
  return '<polygon points="' + (x + 2.5) + ' ' + y + ' ' + (x + w - 2.5) + ' ' + y + ' ' + (x + w) + ' ' + (y + 6) + ' ' + x + ' ' + (y + 6) + '"'
    + ' fill="' + col[0] + '" stroke="' + col[1] + '" stroke-width=".8" stroke-linejoin="round"/>'
    + '<line x1="' + (x + 3.2) + '" y1="' + (y + 1.4) + '" x2="' + (x + w - 3.2) + '" y2="' + (y + 1.4) + '" stroke="#fff" stroke-opacity=".55" stroke-width=".8"/>';
}
var _bfEmbCache = {};
function _bfEmbSvg(id) {
  if (_bfEmbCache[id]) return _bfEmbCache[id];
  var flag = id === 'us' || id === 'eu' || id === 'jp';
  var s = '';
  if (id === 'us') {
    for (var i = 0; i < 7; i++) s += '<rect y="' + (i * 20 / 7).toFixed(3) + '" width="30" height="' + (20 / 7).toFixed(3) + '" fill="' + (i % 2 ? '#fff' : '#b22234') + '"/>';
    s += '<rect width="13" height="' + (80 / 7).toFixed(3) + '" fill="#3c3b6e"/>';
    for (var r = 0; r < 3; r++) for (var q = 0; q < 4; q++) s += '<circle cx="' + (2 + q * 3) + '" cy="' + (2 + r * 3.4) + '" r=".7" fill="#fff"/>';
  } else if (id === 'eu') {
    s = '<rect width="30" height="20" fill="#003399"/>';
    for (var k = 0; k < 12; k++) {
      var a = k * Math.PI / 6;
      s += _bfStar(15 + 6 * Math.cos(a), 10 + 6 * Math.sin(a), 1.25);
    }
  } else if (id === 'jp') {
    s = '<rect width="30" height="20" fill="#fff"/><circle cx="15" cy="10" r="6" fill="#bc002d"/>';
  } else if (_BF_INGOT[id]) {
    var c = _BF_INGOT[id];
    s = _bfIngot(1, 15, 11, c) + _bfIngot(12, 15, 11, c) + _bfIngot(6.5, 8.6, 11, c);
  } else if (id === 'barrel' || id === 'diesel') {
    var bx = id === 'diesel' ? 2 : 5;
    s = '<rect x="' + bx + '" y="3" width="14" height="18" rx="3" fill="#4a5b65"/>'
      + '<rect x="' + bx + '" y="7.6" width="14" height="1.3" fill="#7d8f99"/>'
      + '<rect x="' + bx + '" y="15.1" width="14" height="1.3" fill="#7d8f99"/>';
    if (id === 'diesel') s += '<path d="M19.5 8.5c0 0-3.5 4.4-3.5 6.8a3.5 3.5 0 0 0 7 0c0-2.4-3.5-6.8-3.5-6.8z" fill="#d49a12"/>';
  } else if (id === 'flame') {
    s = '<path d="M12 2c.8 3.6 6 6 6 12a6 6 0 0 1-12 0c0-2.9 1.7-4.9 3-6.6.1 1.9 1 3 2.1 3.2C11 7.7 10.6 5 12 2z" fill="#2f80ed"/>'
      + '<path d="M12 12.2c.6 1.6 2.6 2.6 2.6 4.6a2.6 2.6 0 0 1-5.2 0c0-1.6 1.6-2.6 2.6-4.6z" fill="#9cc7ff"/>';
  } else if (id === 'bolt') {
    s = '<polygon points="13.5 1.5 4 13.5 11 13.5 9.5 22.5 20 9.5 13 9.5" fill="#f2b705" stroke="#b98600" stroke-width=".6" stroke-linejoin="round"/>';
  } else if (id === 'btc' || id === 'usd' || id === 'stable') {
    var fill = id === 'btc' ? '#f7931a' : id === 'stable' ? '#26a17b' : 'none';
    s = '<circle cx="12" cy="12" r="10" fill="' + fill + '"' + (id === 'usd' ? ' stroke="#2e7d32" stroke-width="1.8"' : '') + '/>';
    if (id === 'btc') s += '<path d="M10 5.5v13M13 5.5v13" stroke="#fff" stroke-width="1.3"/>'
      + '<text x="12.3" y="16.6" text-anchor="middle" font-family="Arial,sans-serif" font-weight="700" font-size="13" fill="#fff">B</text>';
    else s += '<text x="12" y="17" text-anchor="middle" font-family="Arial,sans-serif" font-weight="700" font-size="14" fill="'
      + (id === 'usd' ? '#2e7d32' : '#fff') + '">$</text>';
  } else if (id === 'lock') {
    s = '<path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="#7b61ff" stroke-width="2.2"/>'
      + '<rect x="4.5" y="10.5" width="15" height="11" rx="2.2" fill="#7b61ff"/><circle cx="12" cy="15.4" r="1.6" fill="#fff"/>';
  } else if (id === 'eth') {
    s = '<polygon points="12 1.5 5 12.3 12 16.4 19 12.3" fill="#627eea"/>'
      + '<polygon points="12 17.8 5 13.7 12 22.5 19 13.7" fill="#8fa2f2"/>';
  } else if (id === 'sol') {
    s = '<polygon points="7 4.5 21 4.5 17.5 8.5 3.5 8.5" fill="#9945ff"/>'
      + '<polygon points="3.5 10.2 17.5 10.2 21 14.2 7 14.2" fill="#43b4ca"/>'
      + '<polygon points="7 15.9 21 15.9 17.5 19.9 3.5 19.9" fill="#14f195"/>';
  }
  if (!s) return '';
  return (_bfEmbCache[id] = '<svg viewBox="0 0 ' + (flag ? '30 20' : '24 24') + '" focusable="false">' + s
    + (flag ? '<rect x=".3" y=".3" width="29.4" height="19.4" fill="none" stroke="#000" stroke-opacity=".18" stroke-width=".6"/>' : '')
    + '</svg>');
}
function _bfEmb(k) {
  var id = BF_EMB_BY_K[k];
  var svg = id ? _bfEmbSvg(id) : '';
  if (!svg) return '';
  var flag = id === 'us' || id === 'eu' || id === 'jp';
  return '<span class="bf-emb ' + (flag ? 'bf-emb-flag' : 'bf-emb-ico') + '" aria-hidden="true">' + svg + '</span>';
}

/* ── TODAY: the explanation is on the back of each tile ───────────────
   (Daniel, 2026-10-05, promptove/113.) The front is title, number and
   line; a click or tap turns the tile to what the reading is and where
   it comes from, and another turns it back. The source link on the back
   still opens normally. Every tile is a button for the keyboard too. */
function _bfWireInfo(host) {
  var cells = host.querySelectorAll('.bf-cell:not(.bf-cell-empty)');
  for (var i = 0; i < cells.length; i++) {
    cells[i].setAttribute('tabindex', '0');
    cells[i].setAttribute('role', 'button');
    cells[i].setAttribute('aria-pressed', 'false');
  }
  if (host._bfInfoWired) return;
  host._bfInfoWired = true;
  var turn = function (cell) {
    var on = cell.classList.toggle('flipped');
    cell.setAttribute('aria-pressed', on ? 'true' : 'false');
  };
  host.addEventListener('click', function (e) {
    if (e.target.closest('a,button')) return;
    var cell = e.target.closest('.bf-cell');
    if (cell && !cell.classList.contains('bf-cell-empty')) turn(cell);
  });
  host.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    var cell = e.target.closest && e.target.closest('.bf-cell');
    if (!cell || cell !== e.target || cell.classList.contains('bf-cell-empty')) return;
    e.preventDefault();
    turn(cell);
  });
}

function renderBriefing() {
  var host = document.getElementById('briefing');
  if (!host) return;
  var W = (_worldData && _worldData.items) || {};
  var n = _networkData || {};
  var m = (typeof _macroData !== 'undefined' && _macroData) || {};
  var ms = m.series || {}, mp = m.p30 || {}, mn = m.n7 || {};
  var ns = n.series || {}, np = n.p30 || {}, nn = n.n7 || {};

  /* Fallback for the four readings TODAY had before world_data. */
  var old = function (key, sym, kind) {
    var ser = ms[key];
    if (!Array.isArray(ser) || !ser.length) return null;
    return { v: ser[ser.length - 1], s: ser, n7: mn[key] || 0, n30: ser.length, c7: m[key], c30: mp[key], c365: null };
  };
  var it = function (k, fbKey) { return W[k] || (fbKey ? old(fbKey) : null); };

  var groups = [
    { t: 'Central banks & money', cells: [
      _bfWorldCell(W.fed, { k: 'Fed rate', kind: 'rate', policy: true, range: true, src: BF_SRC.nyfed,
        d: 'The US central bank rate. It sets the price of dollars for the whole world.' }),
      _bfWorldCell(W.ecb, { k: 'ECB rate', kind: 'rate', policy: true, src: BF_SRC.ecb,
        d: 'The euro area central bank rate, paid on money banks park with it.' }),
      _bfWorldCell(W.boj, { k: 'BoJ rate', kind: 'rate', policy: true, src: BF_SRC.boj,
        d: 'For years near zero, so investors borrowed cheap yen to buy risky assets abroad. When Japan raises it, some of that money goes home.' }),
      _bfWorldCell(W.us3m, { k: 'US 3-month', kind: 'rate', src: BF_SRC.treasury,
        d: 'What cash earns in safe US government bonds. When it pays more, money has less reason to sit in risky assets like crypto.' }),
      _bfWorldCell(W.us2y, { k: 'US 2-year', kind: 'rate', src: BF_SRC.treasury,
        d: 'Where markets expect US rates over the next two years. Rising means money is getting tighter.' }),
      _bfWorldCell(W.us10y, { k: 'US 10-year', kind: 'rate', src: BF_SRC.treasury,
        d: 'The benchmark for loans and mortgages worldwide. A fast rise makes money tighter everywhere.' }),
      _bfWorldCell(W.jgb10y, { k: 'Japan 10-year', kind: 'rate', src: BF_SRC.mof,
        d: 'Japan\'s long-term rate. Higher means Japanese savers have more reason to keep money at home.' }),
      _bfWorldCell(it('dxy', 'dxyP7'), { k: 'Dollar index', kind: 'num', src: BF_SRC.ice,
        d: 'A rising dollar is a headwind for risk assets' })
    ] },
    { t: 'Metals', cells: [
      _bfWorldCell(it('gold', 'goldP7'), { k: 'Gold', kind: 'usd', src: BF_SRC.comex, sym: 'GC=F',
        d: 'The oldest store of value, as a benchmark' }),
      _bfWorldCell(it('silver', 'silverP7'), { k: 'Silver', kind: 'usd', src: BF_SRC.comex, sym: 'SI=F',
        d: 'Industrial demand as well as a metal' }),
      _bfWorldCell(W.copper, { k: 'Copper', kind: 'usd', u: ' /lb', src: BF_SRC.comex, sym: 'HG=F',
        mk: { mul: 2204.62262, u: ' /t' },   /* pounds in a metric tonne */
        d: 'Copper is in almost everything electric: appliances, data centers and the tiny parts that make AI possible.' }),
      _bfWorldCell(W.aluminum, { k: 'Aluminum', kind: 'usd', u: ' /t', src: BF_SRC.comex, sym: 'ALI=F',
        d: 'Light metal for data centers, power lines, solar frames and electric cars; often the cheaper stand-in for copper.' })
    ] },
    { t: 'Energy cost', cells: [
      _bfWorldCell(it('oil', 'oilP7'), { k: 'Oil · WTI', kind: 'usd', src: BF_SRC.nymex, sym: 'CL=F', china: true,
        d: 'WTI crude — input cost for the real economy' }),
      /* Diesel crack spread (Daniel, 2026-10-04, promptove/109): heating
         oil futures x 42 minus Brent, computed by sync-market-data. */
      _bfWorldCell(W.crack, { k: 'Diesel crack spread', kind: 'usd', u: ' /bbl', usdpts: true, src: BF_SRC.nymex, sym: 'HO=F',
        d: 'What refiners earn turning a barrel of crude into diesel. When it is high, diesel is scarce and transport costs feed into prices.' }),
      _bfWorldCell(W.gas, { k: 'Natural gas', kind: 'usd', u: ' /MMBtu', src: BF_SRC.nymex, sym: 'NG=F',
        mk: { mul: 1 / 293.07107, kind: 'cents', u: ' /kWh' },   /* 1 MMBtu = 293.07 kWh; cents, like Electricity */
        d: 'The fuel behind much of US electricity, so its price feeds into what power costs.' }),
      _bfWorldCell(W.power, { k: 'Electricity', kind: 'cents', u: ' /kWh', monthly: true, src: BF_SRC.bls,
        d: 'What US homes pay, monthly average. It is also the running cost of data centers, AI and Bitcoin mining.' })
    ] },
    { t: 'On-chain', cells: [
      _bfNetCell({ k: 'Hash rate', v: _bfNum(n.hashrateEh, 0), u: ' EH/s', p: n.hashrateP7, s: ns.hashrateEh,
        p30: np.hashrateEh, n7: nn.hashrateEh, year: W.hash, src: BF_SRC.bc, avg7: true,
        d: 'Computing power securing Bitcoin, averaged over 7 days, and so are its changes. '
           + 'The daily figure is inferred from blocks found, so one day '
           + 'alone carries about 7% of noise — the line below is the raw '
           + 'daily estimate and shows that spread. The 3-year change compares single days.' }),
      _bfNetCell({ k: 'Active addresses', v: _bfNum(n.addrCount, 0), p: n.addrP7, s: ns.addrCount,
        p30: np.addrCount, n7: nn.addrCount, year: W.addr, src: BF_SRC.bc, avg7: true,
        d: 'Bitcoin addresses used per day, averaged over 7 days, and so are its changes. '
           + 'Weekends run well below midweek, so a single day reports '
           + 'partly which day of the week it is. The 3-year change compares single days.' }),
      _bfNetCell({ k: 'DeFi TVL', v: _bfUsd(n.tvlUsd), p: n.tvlP7, s: ns.tvlUsd,
        p30: np.tvlUsd, n7: nn.tvlUsd, year: W.tvl, src: BF_SRC.llama,
        d: 'Value locked across every tracked chain' }),
      _bfNetCell({ k: 'Stablecoin supply', v: _bfUsd(n.stableUsd), p: n.stableP7, s: null,
        p30: np.stableUsd, year: W.stable, src: BF_SRC.llama,
        d: 'Dollars sitting on-chain, unallocated' }),
      /* Activity, in dollars per day (DefiLlama; yesterday, the last
         complete day). Daniel, 2026-10-03: gas fees and Solana volume. */
      _bfWorldCell(W.ethFees, { k: 'Ethereum fees', kind: 'usdBig', u: ' /day', gas: true, src: BF_SRC.llama,
        d: 'What users paid in gas to use Ethereum in a day. More demand for the network means more fees.' }),
      _bfWorldCell(W.solFees, { k: 'Solana fees', kind: 'usdBig', u: ' /day', src: BF_SRC.llama,
        d: 'What users paid to use Solana in a day.' }),
      _bfWorldCell(W.solDex, { k: 'Solana DEX volume', kind: 'usdBig', u: ' /day', src: BF_SRC.llama,
        d: 'Dollars traded on Solana\'s exchanges in a day, a gauge of how busy the chain is.' })
    ] }
  ];
  groups.forEach(function (g) { g.cells = g.cells.filter(function (c) { return c && c.v != null; }); });
  groups = groups.filter(function (g) { return g.cells.length; });
  if (!groups.length) { host.style.display = 'none'; return; }

  var face = function (c, days) {
    var win = c.w[days];
    return '<div class="bf-face bf-front">'
      + _bfEmb(c.k)
      + '<div class="bf-k">' + c.k + '</div>'
      + (c.right
          ? '<div class="bf-vrow"><div class="bf-v">' + c.v + '<span class="bf-u">' + c.u + '</span></div>' + c.right + '</div>'
          : '<div class="bf-v">' + c.v + '<span class="bf-u">' + c.u + '</span></div>')
      + _bfChange(win.c, win.l, c.pts, c.usd) + c.extra
      + _bfSpark(win.s, (win.c == null) || win.c >= 0, c.pts ? 0.25 : 0,
                 c.pts && win.c != null && Math.abs(win.c) < 0.005, win.o)
      + '<div class="bf-d-note">' + c.d + '</div>'
      + c.src
      + '<span class="bf-more" aria-hidden="true">i</span>'
      + '</div>'
      /* The explanation side (promptove/113): a click turns the tile.
         _bfWireInfo below. */
      + '<div class="bf-face bf-back bf-info">'
      + '<div class="bf-k">' + c.k + '</div>'
      + '<div class="bf-d-note">' + c.d + '</div>'
      + c.src
      + '</div>';
  };

  host.style.display = '';
  var html = '<div class="bf-bar"><span class="bf-bar-l">Change over</span>'
    + '<div class="bf-seg" role="group" aria-label="Change over">'
    + '<button type="button" class="bf-seg-b" data-days="7" onclick="bfSetAll(7)">7D</button>'
    + '<button type="button" class="bf-seg-b" data-days="30" onclick="bfSetAll(30)">30D</button>'
    + '<button type="button" class="bf-seg-b" data-days="90" onclick="bfSetAll(90)">3M</button>'
    + '<button type="button" class="bf-seg-b" data-days="182" onclick="bfSetAll(182)">6M</button>'
    + '<button type="button" class="bf-seg-b" data-days="365" onclick="bfSetAll(365)">1Y</button>'
    + '<button type="button" class="bf-seg-b" data-days="1095" onclick="bfSetAll(1095)">3Y</button>'
    + '</div></div>';
  groups.forEach(function (g) {
    html += '<div class="bf-group">' + g.t + '</div>';
    g.cells.forEach(function (c) {
      var pl = (c.pts || c.usd) ? null : c.w[_bfLong].c;
      var hbl = hbBeatSeconds(pl, 0.25);
      html += '<div class="bf-cell" data-k="' + c.k + '"'
        + (hbl != null ? ' style="--hb-dur:' + hbl.toFixed(3) + 's"' : '') + '>'
        + '<div class="bf-tilt"><div class="bf-inner">' + face(c, _bfLong) + '</div></div>'
        + '</div>';
    });
    /* Fill the row so a short group (energy has three) does not leave a
       hole showing the grid's border colour. */
    for (var f = g.cells.length % 4; f && f < 4; f++) html += '<div class="bf-cell bf-cell-empty" aria-hidden="true"></div>';
  });
  var ages = [_worldAgeMs, _networkAgeMs].filter(function (a) { return a != null; });
  html += '<div class="bf-age">' + _bfAge(ages.length ? Math.min.apply(null, ages) : null) + '</div>';
  host.innerHTML = html;

  _bfSyncSeg(host);
  _bfWireTilt(host);
  _bfWireFlash(host);
  _bfWireInfo(host);
}
/* A short glow on every tile when the period changes, in a quick
   left-to-right ripple (it used to fire when a tile finished flipping). */
function _bfWireFlash(host) {
  var cells = host.querySelectorAll('.bf-cell:not(.bf-cell-empty)');
  for (var i = 0; i < cells.length; i++) {
    cells[i].addEventListener('animationend', function () { this.classList.remove('bf-flash'); });
  }
}
function _bfRipple(host) {
  if (!host || _bfReduced()) return;
  var cells = host.querySelectorAll('.bf-cell:not(.bf-cell-empty)');
  for (var i = 0; i < cells.length; i++) {
    (function (cell, d) {
      setTimeout(function () { cell.classList.remove('bf-flash'); void cell.offsetWidth; cell.classList.add('bf-flash'); }, d);
    })(cells[i], i * _BF_FLIP_STEP_MS);
  }
}

/* ── TODAY tiles: one period for all, and the hover tilt ────────────
   The bar above sets the window for every tile (7D, 30D, 1Y, 3Y); there
   is no per-tile flip any more (2026-10-04). The tilt follows the mouse
   on devices with a real pointer only; with reduced motion asked for
   there is no tilt and no ripple. */
function _bfReduced() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
}
var _BF_FLIP_STEP_MS = 40;
function bfSetAll(days) {
  var host = document.getElementById('briefing');
  if (!host || ({ 7: 1, 30: 1, 90: 1, 182: 1, 365: 1, 1095: 1 })[days] !== 1) return;
  if (_bfLong !== days) { _bfLong = days; renderBriefing(); }
  _bfRipple(document.getElementById('briefing'));
}
function _bfSyncSeg(host) {
  if (!host) return;
  var bs = host.querySelectorAll('.bf-seg-b');
  for (var j = 0; j < bs.length; j++) {
    var on = bs[j].getAttribute('data-days') === String(_bfLong);
    bs[j].classList.toggle('on', on);
    bs[j].setAttribute('aria-pressed', on ? 'true' : 'false');
  }
}
function _bfWireTilt(host) {
  var fine = false;
  try { fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches; } catch (e) {}
  if (!fine || _bfReduced()) return;
  var cells = host.querySelectorAll('.bf-cell:not(.bf-cell-empty)');
  for (var i = 0; i < cells.length; i++) {
    (function (cell) {
      cell.addEventListener('mousemove', function (e) {
        var r = cell.getBoundingClientRect();
        var x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
        cell.classList.add('hovering');
        cell.style.setProperty('--rx', (-y * 4).toFixed(2) + 'deg');
        cell.style.setProperty('--ry', (x * 5).toFixed(2) + 'deg');
        cell.style.setProperty('--mx', ((x + 0.5) * 100).toFixed(1) + '%');
        cell.style.setProperty('--my', ((y + 0.5) * 100).toFixed(1) + '%');
      });
      cell.addEventListener('mouseleave', function () {
        cell.classList.remove('hovering');
        cell.style.setProperty('--rx', '0deg');
        cell.style.setProperty('--ry', '0deg');
      });
    })(cells[i]);
  }
}

/* ── ETF flows: US spot Bitcoin and Ether ETFs ──────────────────────
   READ ONLY. sync-etf-flows (twice each morning, UTC) reads Farside
   Investors' daily tables, stores them in etf_flows, and writes ONE
   interpretation per asset to market_cache.etf_flows_summary: a state,
   a headline and a detail line in English AND Macedonian (headline_mk,
   detail_mk), the totals and the last 20 days. The wording is decided on
   the server so the page, the Telegram briefing and the reversal alert
   can never disagree.

   What the numbers can say is stamped from ROTATOR_EVIDENCE.etfFlows:
   flows mostly follow price, so every line here describes money that
   already moved. The card never forecasts.

   ATTRIBUTION. Farside's data is "All rights reserved"; the page shows
   derived figures only (daily totals, sums, a headline) and credits and
   links Farside wherever it appears. The per-fund table stays on their
   site. */
var _etfFlows = null;
var _etfAgeMs = null;
var _etfAsset = 'BTC';
var _ETF_PAGE = { BTC: 'https://farside.co.uk/btc/', ETH: 'https://farside.co.uk/eth/' };

/* The window's own labels, English and Macedonian. The headline and
   detail come from the server in both languages; everything else a
   visitor reads in the tile and the window is here. */
var _ETF_TXT = {
  en: {
    name: { BTC: 'Bitcoin ETFs', ETH: 'Ether ETFs' }, asset: { BTC: 'Bitcoin', ETH: 'Ether' }, group: 'Bitcoin & Ether ETFs',
    netFlow: 'net flow', d5: '5d ', d20: '20d ', details: 'details ›', on: 'on ', title: 'US spot ETF flows', strip: 'US spot ETF flows',
    source: 'Source', open: 'Open details', months: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
    latest: 'Latest day', last5: 'Last 5 days', last20: 'Last 20 days', run: 'Current run',
    tradingDays: 'trading days', month: 'about a month', sameDir: 'same direction', none: 'none',
    runIn: function (n) { return n + ' days in'; }, runOut: function (n) { return n + ' days out'; },
    axis: 'net flow per trading day', still: 'still being reported',
    prov: function (d, v) { return d + ' is still being reported (' + v + ' so far, the hollow bar). It is left out of the reading until every fund has reported.'; },
    bigHd: 'What counts as a big day',
    big: function (n, p10, p90, p5, p95) { return 'Over the past ' + n + ' trading days, 1 day in 10 saw outflows above ' + p10 + ' or inflows above ' + p90
      + ', and 1 day in 20 went beyond ' + p5 + ' out or ' + p95 + ' in. A <b>sharp reversal</b> is a day in that 1-in-10 group going against the previous 5 days.'; },
    canHd: 'What this can and cannot tell you',
    can: function (ev) { return 'We tested ' + ev.days + ' trading days of Bitcoin ETF flows (' + ev.measuredOn + '). Flows mostly <b>follow</b> the price: '
      + 'a week of inflows usually came after a week of rising prices (correlation ' + ev.chaseCorr.toFixed(2) + '). '
      + 'Big inflow weeks did not lead Bitcoin higher. Big outflow weeks were followed by a slightly weaker Bitcoin week ('
      + ev.strongOutflow.excess7.toFixed(2) + '% against an average week), but not reliably enough to call it a signal. '; },
    canEnd: 'Read this as where money already moved, not where the price goes next.',
    failed: 'The last update failed, so this is the previous reading.',
    srcTail: function (a) { return ', daily net flows of every US spot ' + a + ' ETF, in US dollars. The fund-by-fund table is on their site.'; },
    reading: 'Reading'
  },
  mk: {
    name: { BTC: 'Биткоин ETF-ови', ETH: 'Етер ETF-ови' }, asset: { BTC: 'Биткоин', ETH: 'Етер' }, group: 'Биткоин и Етер ETF-ови',
    netFlow: 'нето тек', d5: '5д ', d20: '20д ', details: 'детали ›', on: 'на ', title: 'Текови во американските спот ETF-ови', strip: 'Текови во американските спот ETF-ови',
    source: 'Извор', open: 'Отвори детали', months: ['јан','фев','мар','апр','мај','јун','јул','авг','сеп','окт','ное','дек'],
    latest: 'Последен ден', last5: 'Последни 5 дена', last20: 'Последни 20 дена', run: 'Тековна низа',
    tradingDays: 'дена на тргување', month: 'околу еден месец', sameDir: 'иста насока', none: 'нема',
    runIn: function (n) { return n + ' дена прилив'; }, runOut: function (n) { return n + ' дена одлив'; },
    axis: 'нето тек по ден на тргување', still: 'сè уште се пријавува',
    prov: function (d, v) { return 'За ' + d + ' податоците сè уште пристигнуваат (засега ' + v + ', празната столбица). Денот не влегува во оценката додека сите фондови не пријават.'; },
    bigHd: 'Што е голем ден',
    big: function (n, p10, p90, p5, p95) { return 'Во последните ' + n + ' дена на тргување, 1 од 10 дена имаше одлив поголем од ' + p10 + ' или прилив поголем од ' + p90
      + ', а 1 од 20 дена надмина ' + p5 + ' одлив или ' + p95 + ' прилив. <b>Нагло свртување</b> е ден од таа група 1 од 10 што оди спротивно на претходните 5 дена.'; },
    canHd: 'Што може, а што не може да ви каже ова',
    can: function (ev) { return 'Тестиравме ' + ev.days + ' дена на тргување со текови во Биткоин ETF-овите (' + ev.measuredOn + '). Тековите главно ја <b>следат</b> цената: '
      + 'недела со приливи обично доаѓаше по недела со пораст на цената (корелација ' + ev.chaseCorr.toFixed(2) + '). '
      + 'Неделите со големи приливи не го туркаа Биткоин нагоре. По неделите со големи одливи следуваше малку послаба недела за Биткоин ('
      + ev.strongOutflow.excess7.toFixed(2) + '% во однос на просечна недела), но не доволно сигурно за да се нарече сигнал. '; },
    canEnd: 'Читајте го ова како каде парите веќе отидоа, а не каде ќе оди цената.',
    failed: 'Последното ажурирање не успеа, па ова е претходното читање.',
    srcTail: function (a) { return ', дневни нето текови на сите американски спот ' + a + ' ETF-ови, во американски долари. Табелата по фондови е на нивната страница.'; },
    reading: 'Читање'
  }
};
function _etfL() { return (typeof currentLang !== 'undefined' && currentLang === 'mk') ? _ETF_TXT.mk : _ETF_TXT.en; }
function _etfHead(s) { return (_etfL() === _ETF_TXT.mk && s.headline_mk) ? s.headline_mk : s.headline; }
function _etfDetail(s) { return (_etfL() === _ETF_TXT.mk && s.detail_mk) ? s.detail_mk : s.detail; }

async function loadEtfFlows() {
  if (typeof supaCacheGetStale !== 'function') return;
  try {
    var row = await supaCacheGetStale('etf_flows_summary');
    if (row && row.data) { _etfFlows = row.data; _etfAgeMs = row.ageMs; }
  } catch (e) {
    console.warn('[etf] read skipped:', e.message);
  }
}

/* US$m in, formatted: +$135M, −$1.24B. */
function _etfM(v, signed) {
  if (v == null || !isFinite(v)) return '—';
  var a = Math.abs(v);
  var s = a >= 1000 ? '$' + (a / 1000).toFixed(2) + 'B' : '$' + Math.round(a) + 'M';
  return signed === false ? s : (v < 0 ? '−' : '+') + s;
}
function _etfDay(d) {
  if (!d) return '';
  var t = new Date(d + 'T00:00:00Z');
  return t.getUTCDate() + ' ' + _etfL().months[t.getUTCMonth()];
}
function _etfTone(s) { return s && /^(in|out|warn)$/.test(s.tone) ? s.tone : 'neutral'; }

/* Bars around a zero line: inflow up in green, outflow down in red. A
   day still being reported is drawn hollow. `big` is the modal chart. */
function _etfBars(bars, prov, big) {
  var L = _etfL();
  var pts = (bars || []).slice();
  if (prov) pts.push({ day: prov.day, total: prov.total, prov: true });
  if (pts.length < 2) return '';
  var W = 300, H = big ? 120 : 34, PAD = big ? 6 : 1;
  var hi = Math.max.apply(null, pts.map(function (p) { return Math.abs(p.total); })) || 1;
  var mid = H / 2, scale = (H / 2 - PAD) / hi, bw = W / pts.length;
  var out = '<svg class="' + (big ? 'etf-chart' : 'etf-mini') + '" viewBox="0 0 ' + W + ' ' + H
    + '" preserveAspectRatio="none" role="img" aria-label="' + L.axis + ', ' + pts.length + '">';
  out += '<line x1="0" x2="' + W + '" y1="' + mid + '" y2="' + mid + '" class="etf-zero"/>';
  pts.forEach(function (p, i) {
    var h = Math.max(1, Math.abs(p.total) * scale);
    var y = p.total >= 0 ? mid - h : mid;
    out += '<rect x="' + (i * bw + bw * 0.15).toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + (bw * 0.7).toFixed(1)
      + '" height="' + h.toFixed(1) + '" class="' + (p.total >= 0 ? 'etf-in' : 'etf-out') + (p.prov ? ' etf-prov' : '')
      + '"><title>' + _etfDay(p.day) + ': ' + _etfM(p.total) + (p.prov ? ' (' + L.still + ')' : '') + '</title></rect>';
  });
  return out + '</svg>';
}

function renderEtfFlows() {
  var host = document.getElementById('etf-strip');
  if (!host) return;
  var f = _etfFlows, L = _etfL();
  var assets = ['BTC', 'ETH'].filter(function (a) { return f && f[a] && f[a].last; });
  if (!assets.length) { host.style.display = 'none'; return; }
  host.style.display = '';
  /* Laid out like the TODAY tiles above it (Daniel, 2026-10-04: "same
     style and same visual hierarchy … as continuation of metals, energy,
     on-chain"): an amber group heading, then per tile the label, the big
     number, the figures, the bars and the headline as the description.
     The coloured left edge went; colour stays on the number and bars. */
  host.innerHTML = '<div class="bf-group etf-group">' + L.group + '</div>'
  + assets.map(function (a) {
    var s = f[a];
    return '<button type="button" class="etf-tile etf-' + _etfTone(s) + '" onclick="openEtfModal(\'' + a + '\')"'
      + ' aria-label="' + L.name[a] + ': ' + _esc(_etfHead(s)) + '. ' + L.open + '.">'
      + '<div class="etf-tile-top"><span class="bf-k">' + L.name[a] + '</span>'
      + '<span class="etf-more">' + L.details + '</span></div>'
      + '<div class="etf-num ' + (s.last.total >= 0 ? 'up' : 'dn') + '" title="' + L.netFlow + ', ' + L.on + _etfDay(s.last.day) + '">' + _etfM(s.last.total) + '</div>'
      + '<div class="etf-subs"><span class="etf-sub">' + L.on + _etfDay(s.last.day) + '</span>'
      + '<span class="etf-sub">' + L.d5 + _etfM(s.sum5) + '</span>'
      + '<span class="etf-sub">' + L.d20 + _etfM(s.sum20) + '</span></div>'
      + _etfBars(s.bars, s.provisional, false)
      + '<div class="etf-head">' + _esc(_etfHead(s)) + '</div>'
      + '</button>';
  }).join('')
  + '<div class="etf-src">' + L.strip + ' · ' + L.source + ': <a href="https://farside.co.uk/" target="_blank" rel="noopener">Farside Investors</a>'
  + (_etfAgeMs != null && L === _ETF_TXT.en ? ' · ' + _bfAge(_etfAgeMs) : '') + '</div>';
}

function openEtfModal(asset) {
  if (asset) _etfAsset = asset;
  var body = document.getElementById('etf-modal-body');
  var f = _etfFlows, L = _etfL();
  if (!body || !f) return;
  var a = f[_etfAsset] ? _etfAsset : 'BTC', s = f[a];
  if (!s || !s.last) return;
  var ev = (typeof ROTATOR_EVIDENCE !== 'undefined' && ROTATOR_EVIDENCE.etfFlows) || null;
  var bars = s.bars || [];
  var streak = s.streak && s.streak.len >= 2
    ? (s.streak.dir > 0 ? L.runIn(s.streak.len) : L.runOut(s.streak.len)) : L.none;
  var tabs = ['BTC', 'ETH'].filter(function (x) { return f[x] && f[x].last; }).map(function (x) {
    return '<button type="button" class="etf-tab' + (x === a ? ' on' : '') + '" onclick="openEtfModal(\'' + x + '\')">' + L.name[x] + '</button>';
  }).join('');
  var r = s.ref || {};
  body.innerHTML =
      '<div class="modal-title">' + L.title + '</div>'
    + '<div class="etf-tabs">' + tabs + '</div>'
    + '<div class="etf-scroll">'
    + '<div class="etf-m-head etf-' + _etfTone(s) + '">' + _esc(_etfHead(s)) + '</div>'
    + '<div class="etf-m-detail">' + _esc(_etfDetail(s)) + '</div>'
    + (s.provisional ? '<div class="etf-m-note">' + L.prov(_etfDay(s.provisional.day), _etfM(s.provisional.total)) + '</div>' : '')
    + '<div class="etf-stats">'
    +   '<div><span class="bf-k">' + L.latest + '</span><b class="' + (s.last.total >= 0 ? 'up' : 'dn') + '">' + _etfM(s.last.total) + '</b><em>' + _etfDay(s.last.day) + '</em></div>'
    +   '<div><span class="bf-k">' + L.last5 + '</span><b class="' + (s.sum5 >= 0 ? 'up' : 'dn') + '">' + _etfM(s.sum5) + '</b><em>' + L.tradingDays + '</em></div>'
    +   '<div><span class="bf-k">' + L.last20 + '</span><b class="' + (s.sum20 >= 0 ? 'up' : 'dn') + '">' + _etfM(s.sum20) + '</b><em>' + L.month + '</em></div>'
    +   '<div><span class="bf-k">' + L.run + '</span><b>' + streak + '</b><em>' + L.sameDir + '</em></div>'
    + '</div>'
    + '<div class="etf-chart-wrap">' + _etfBars(bars, s.provisional, true)
    +   '<div class="etf-axis"><span>' + _etfDay((bars[0] || {}).day) + '</span><span>' + L.axis + '</span><span>'
    +   _etfDay((s.provisional || bars[bars.length - 1] || {}).day) + '</span></div></div>'
    + (r.days ? '<div class="etf-m-sec"><div class="bf-k">' + L.bigHd + '</div><p>'
        + L.big(r.days, _etfM(r.p10, false), _etfM(r.p90, false), _etfM(r.p5, false), _etfM(r.p95, false)) + '</p></div>' : '')
    + '<div class="etf-m-sec"><div class="bf-k">' + L.canHd + '</div><p>'
    + (ev ? L.can(ev) : '') + L.canEnd + '</p></div>'
    + (s.error ? '<div class="etf-m-note">' + L.failed + '</div>' : '')
    + '<div class="etf-src">' + L.source + ': <a href="' + _ETF_PAGE[a] + '" target="_blank" rel="noopener">Farside Investors</a>'
    + L.srcTail(L.asset[a])
    + (_etfAgeMs != null && L === _ETF_TXT.en ? ' ' + L.reading + ' ' + _bfAge(_etfAgeMs) + '.' : '') + '</div>'
    + '</div>';
  openModal('etf-modal');
  if (typeof supaCountFeature === 'function') supaCountFeature('etf_flows', true);
}

/* ── Where the money is going: stablecoins per chain ───────────────
   READ ONLY (promptove/125). sync-chain-flows (03:47 UTC) reads
   DefiLlama's stablecoins per chain and writes ONE summary to
   market_cache.chain_flows_summary: for each chain with $50M+ of
   stablecoins, the amount on the latest settled day and its change over
   7 and 30 days.

   CONTEXT, NOT A SIGNAL. The backtests (promptove/120-123) found that
   stablecoins arriving on a chain tilted the odds toward its coin beating
   the market, and leaving tilted them the other way, but neither held in
   both halves of the history. A hidden live test runs until mid-2027
   (promptove/124). So the board describes where dollars already moved: it
   never marks the test's +10% / -10% lines, and it never says buy or sell. */
var _cf = null;
var _cfAgeMs = null;
var _CF_ROWS = 4;   /* chains listed per tile */
/* The window's table sorts by any column (Daniel, 2026-10-05: "clicking on top will sort them by
   change of percentages?"). Biggest first; the same header again flips it. */
var _cfSort = { key: 'p7', dir: -1 };   /* opens on the biggest 7-day % change */
function cfSortBy(key) {
  _cfSort = { key: key, dir: _cfSort.key === key ? -_cfSort.dir : (key === 'chain' ? 1 : -1) };
  var sc = document.querySelector('#cf-modal .etf-scroll'), top = sc ? sc.scrollTop : 0;
  openChainFlowsModal();
  sc = document.querySelector('#cf-modal .etf-scroll'); if (sc) sc.scrollTop = top;
}

var _CF_TXT = {
  en: {
    group: 'Where the money is going', in: 'Arriving', out: 'Leaving', details: 'details ›', open: 'Open details',
    week: 'this week', chains: function (n) { return n + (n === 1 ? ' chain' : ' chains'); },
    headIn: 'Stablecoins that moved onto these chains in the last 7 days.',
    headOut: 'Stablecoins that left these chains in the last 7 days.',
    none: 'No chain gained stablecoins this week.', noneOut: 'No chain lost stablecoins this week.',
    strip: 'Stablecoins per chain', source: 'Source', title: 'Stablecoins by chain',
    total: 'On these chains', d7: '7 days', d30: '30 days', chain: 'Chain', now: 'Now', p7: '7d %', p30: '30d %', sortBy: 'Sort by',
    on: function (d) { return 'Amounts on ' + d + '.'; },
    whatHd: 'What this shows',
    what: 'Stablecoins are dollars parked on a blockchain (USDT, USDC and others), ready to be used there. '
      + 'When they rise on a chain, people moved dollars onto it; when they fall, dollars left. '
      + 'Base has no coin of its own, so it has no ticker.',
    canHd: 'What this can and cannot tell you',
    can: 'We tested two and a half years of these flows on 36 chains. When stablecoins on a chain rose 10% or more in a week while its coin '
      + 'had not moved yet, the coin beat the average coin <b>57 times in 100</b> over the next two weeks. When they fell 10% or more, '
      + 'it beat it only <b>41 times in 100</b>. That held in one half of the history but not the other, so it is not a signal. '
      + 'A live test runs quietly until mid-2027.',
    canEnd: 'Read this as where dollars already moved, not where prices go next.',
    srcTail: ', stablecoins circulating on each chain, in US dollars. Chains with less than $50M are left out.',
    reading: 'Reading', months: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  },
  mk: {
    group: 'Каде одат парите', in: 'Пристигнуваат', out: 'Заминуваат', details: 'детали ›', open: 'Отвори детали',
    week: 'оваа недела', chains: function (n) { return n + (n === 1 ? ' мрежа' : ' мрежи'); },
    headIn: 'Стејблкоини што дојдоа на овие мрежи во последните 7 дена.',
    headOut: 'Стејблкоини што ги напуштија овие мрежи во последните 7 дена.',
    none: 'Оваа недела ниедна мрежа не доби стејблкоини.', noneOut: 'Оваа недела ниедна мрежа не изгуби стејблкоини.',
    strip: 'Стејблкоини по мрежа', source: 'Извор', title: 'Стејблкоини по мрежа',
    total: 'На овие мрежи', d7: '7 дена', d30: '30 дена', chain: 'Мрежа', now: 'Сега', p7: '7д %', p30: '30д %', sortBy: 'Подреди по',
    on: function (d) { return 'Износи на ' + d + '.'; },
    whatHd: 'Што покажува ова',
    what: 'Стејблкоините се долари паркирани на блокчејн (USDT, USDC и други), спремни за користење таму. '
      + 'Кога растат на некоја мрежа, луѓето донеле долари на неа; кога паѓаат, доларите заминале. '
      + 'Base нема своја монета, па нема ни ознака.',
    canHd: 'Што може, а што не може да ви каже ова',
    can: 'Ги тестиравме овие текови две и пол години на 36 мрежи. Кога стејблкоините на некоја мрежа пораснаа 10% или повеќе за една недела, '
      + 'а нејзината монета уште не се помрднала, монетата ја победи просечната монета <b>57 пати од 100</b> во следните две недели. '
      + 'Кога паднаа 10% или повеќе, ја победи само <b>41 пат од 100</b>. Тоа важеше во едната половина од историјата, но не и во другата, '
      + 'па не е сигнал. Тивко тече тест во живо до средината на 2027.',
    canEnd: 'Читајте го ова како каде доларите веќе отидоа, а не каде ќе оди цената.',
    srcTail: ', стејблкоини во оптек на секоја мрежа, во американски долари. Мрежите со помалку од $50M не се прикажани.',
    reading: 'Читање', months: ['јан','фев','мар','апр','мај','јун','јул','авг','сеп','окт','ное','дек']
  }
};
function _cfL() { return (typeof currentLang !== 'undefined' && currentLang === 'mk') ? _CF_TXT.mk : _CF_TXT.en; }

async function loadChainFlows() {
  if (typeof supaCacheGetStale !== 'function') return;
  try {
    var row = await supaCacheGetStale('chain_flows_summary');
    if (row && row.data) { _cf = row.data; _cfAgeMs = row.ageMs; }
  } catch (e) {
    console.warn('[chain flows] read skipped:', e.message);
  }
}

/* US dollars in: +$412M, −$1.24B, $86.3B. */
function _cfUsd(v, signed) {
  if (v == null || !isFinite(v)) return '—';
  var a = Math.abs(v), s;
  if (a >= 1e9) s = '$' + (a / 1e9).toFixed(a >= 1e11 ? 0 : a >= 1e10 ? 1 : 2) + 'B';
  else if (a >= 1e6) s = '$' + Math.round(a / 1e6) + 'M';
  else s = '$' + Math.round(a / 1e3) + 'K';
  return signed ? (v < 0 ? '−' : '+') + s : s;
}
function _cfPct(p) { return p == null || !isFinite(p) ? '' : (p < 0 ? '−' : '+') + Math.abs(p).toFixed(Math.abs(p) < 10 ? 1 : 0) + '%'; }
function _cfDay(d) { if (!d) return ''; var t = new Date(d + 'T00:00:00Z'); return t.getUTCDate() + ' ' + _cfL().months[t.getUTCMonth()]; }
function _cfName(r) { return _esc(r.chain) + (r.sym && r.sym !== r.chain ? ' <span class="cf-sym">' + _esc(r.sym) + '</span>' : ''); }

function _cfTile(dir) {
  var L = _cfL(), rows = (_cf.chains || []).filter(function (r) { return r.d7 != null && (dir > 0 ? r.d7 > 0 : r.d7 < 0); });
  /* Biggest PERCENTAGE change first (Daniel, 2026-10-05), so a small chain doubling its dollars
     shows above a giant moving 1%. The big number stays the dollar total. */
  rows.sort(function (a, b) { var x = a.p7 == null ? 0 : a.p7, y = b.p7 == null ? 0 : b.p7; return dir > 0 ? y - x : x - y; });
  var sum = rows.reduce(function (s, r) { return s + r.d7; }, 0);
  var list = rows.slice(0, _CF_ROWS).map(function (r) {
    return '<div class="cf-row"><span class="cf-name">' + _cfName(r) + '</span>'
      + '<span class="cf-d ' + (dir > 0 ? 'up' : 'dn') + '">' + _cfUsd(r.d7, true) + '</span>'
      + '<span class="cf-p">' + _cfPct(r.p7) + '</span></div>';
  }).join('');
  return '<button type="button" class="etf-tile cf-tile" onclick="openChainFlowsModal(' + dir + ')" aria-label="' + (dir > 0 ? L.in : L.out) + ': '
    + (dir > 0 ? L.headIn : L.headOut) + ' ' + L.open + '.">'
    + '<div class="etf-tile-top"><span class="bf-k">' + (dir > 0 ? L.in : L.out) + '</span><span class="etf-more">' + L.details + '</span></div>'
    + '<div class="etf-num ' + (dir > 0 ? 'up' : 'dn') + '">' + (rows.length ? _cfUsd(sum, true) : '—') + '</div>'
    + '<div class="etf-subs"><span class="etf-sub">' + L.week + '</span><span class="etf-sub">' + L.chains(rows.length) + '</span></div>'
    + (list ? '<div class="cf-list">' + list + '</div>' : '')
    + '<div class="etf-head">' + (rows.length ? (dir > 0 ? L.headIn : L.headOut) : (dir > 0 ? L.none : L.noneOut)) + '</div>'
    + '</button>';
}

function renderChainFlows() {
  var host = document.getElementById('cf-strip');
  if (!host) return;
  var L = _cfL();
  if (!_cf || !Array.isArray(_cf.chains) || _cf.chains.length < 5) { host.style.display = 'none'; return; }
  host.style.display = '';
  host.innerHTML = '<div class="bf-group etf-group">' + L.group + '</div>' + _cfTile(1) + _cfTile(-1)
    + '<div class="etf-src">' + L.strip + ' · ' + L.source + ': <a href="https://defillama.com/stablecoins/chains" target="_blank" rel="noopener">DefiLlama</a>'
    + (_cfAgeMs != null && L === _CF_TXT.en ? ' · ' + _bfAge(_cfAgeMs) : '') + '</div>';
}

/* dir: 1 from Arriving (biggest gain on top), -1 from Leaving (biggest loss on top). Without it
   (a header click, a language switch) the current order stays. */
function openChainFlowsModal(dir) {
  if (dir === 1 || dir === -1) _cfSort = { key: 'p7', dir: -dir };
  var body = document.getElementById('cf-modal-body');
  var L = _cfL();
  if (!body || !_cf || !Array.isArray(_cf.chains)) return;
  var t = _cf.total || {};
  var cls = function (v) { return v == null ? '' : v >= 0 ? 'up' : 'dn'; };
  var k = _cfSort.key, dir = _cfSort.dir;
  var rows = _cf.chains.slice().sort(function (a, b) {
    if (k === 'chain') return dir * String(a.chain).localeCompare(String(b.chain));
    var x = a[k], y = b[k];
    if (x == null) return 1; if (y == null) return -1;          /* missing values always last */
    return dir * (x - y);
  }).map(function (r) {
    return '<tr><td>' + _cfName(r) + '</td><td>' + _cfUsd(r.now) + '</td>'
      + '<td class="' + cls(r.d7) + '">' + _cfUsd(r.d7, true) + '</td>'
      + '<td class="' + cls(r.p7) + '">' + _cfPct(r.p7) + '</td>'
      + '<td class="' + cls(r.p30) + '">' + _cfPct(r.p30) + '</td></tr>';
  }).join('');
  var th = function (key, label) {
    var on = k === key;
    return '<th aria-sort="' + (on ? (dir > 0 ? 'ascending' : 'descending') : 'none') + '"><button type="button" class="cf-sort' + (on ? ' on' : '')
      + '" onclick="cfSortBy(\'' + key + '\')" title="' + L.sortBy + ' ' + label + '">' + label
      + '<span class="cf-arrow" aria-hidden="true">' + (on ? (dir > 0 ? '▲' : '▼') : '') + '</span></button></th>';
  };
  body.innerHTML =
      '<div class="modal-title">' + L.title + '</div>'
    + '<div class="etf-scroll">'
    + '<div class="etf-stats cf-stats">'
    +   '<div><span class="bf-k">' + L.total + '</span><b>' + _cfUsd(t.now) + '</b><em>' + L.chains(_cf.chains.length) + '</em></div>'
    +   '<div><span class="bf-k">' + L.d7 + '</span><b class="' + cls(t.d7) + '">' + _cfUsd(t.d7, true) + '</b><em>' + _cfPct(t.p7) + '</em></div>'
    +   '<div><span class="bf-k">' + L.d30 + '</span><b class="' + cls(t.d30) + '">' + _cfUsd(t.d30, true) + '</b><em>&nbsp;</em></div>'
    + '</div>'
    + '<table class="cf-table"><thead><tr>' + th('chain', L.chain) + th('now', L.now) + th('d7', L.d7) + th('p7', L.p7) + th('p30', L.p30) + '</tr></thead>'
    + '<tbody>' + rows + '</tbody></table>'
    + '<div class="etf-axis"><span>' + L.on(_cfDay(_cf.day)) + '</span></div>'
    + '<div class="etf-m-sec"><div class="bf-k">' + L.whatHd + '</div><p>' + L.what + '</p></div>'
    + '<div class="etf-m-sec"><div class="bf-k">' + L.canHd + '</div><p>' + L.can + ' ' + L.canEnd + '</p></div>'
    + '<div class="etf-src">' + L.source + ': <a href="https://defillama.com/stablecoins/chains" target="_blank" rel="noopener">DefiLlama</a>' + L.srcTail
    + (_cfAgeMs != null && L === _CF_TXT.en ? ' ' + L.reading + ' ' + _bfAge(_cfAgeMs) + '.' : '') + '</div>'
    + '</div>';
  openModal('cf-modal');
  if (typeof supaCountFeature === 'function') supaCountFeature('chain_flows', true);
}

/* Coin window: stablecoins on the coin's OWN chain this week (promptove/126).
   Daniel asked whether this could move the score (e.g. -5 for Berachain);
   it cannot until the hidden test holds (promptove/124: outflow coins lagged
   6 times in 10 but did not lose on average, inflow faded in its second
   half). So it sits under the score as context, and says so. Shown only
   for the ~24 coins whose chain is on the board. */
var _CF_TD = {
  en: { k: function (ch) { return 'Stablecoins on ' + ch; }, week: 'this week', m30: 'in 30 days',
        note: function (s) { return 'Dollars arriving on or leaving ' + s + '\'s own chain. Context only: not part of the score.'; } },
  mk: { k: function (ch) { return 'Стејблкоини на ' + ch; }, week: 'оваа недела', m30: 'за 30 дена',
        note: function (s) { return 'Долари што пристигнуваат на или заминуваат од мрежата на ' + s + '. Само контекст: не влегува во оценката.'; } }
};
function _tdChainFlow(c) {
  var el = document.getElementById('td-chainflow');
  if (!el) return;
  var r = (c && !c.isStock && !c.isStable && _cf && Array.isArray(_cf.chains))
    ? _cf.chains.filter(function (x) { return x.sym && x.sym === c.sym; })[0] : null;
  if (!r || r.d7 == null) { el.innerHTML = ''; return; }
  var T = (typeof currentLang !== 'undefined' && currentLang === 'mk') ? _CF_TD.mk : _CF_TD.en;
  var tone = r.d7 >= 0 ? 'up' : 'dn';
  el.innerHTML = '<div class="td-cf">'
    + '<span class="td-cf-k">' + T.k(_esc(r.chain)) + '</span> '
    + '<b class="' + tone + '">' + _cfUsd(r.d7, true) + '</b> '
    + '<span class="td-cf-p ' + tone + '">' + _cfPct(r.p7) + '</span> ' + T.week
    + (r.p30 != null ? ' · <span class="td-cf-p ' + (r.p30 >= 0 ? 'up' : 'dn') + '">' + _cfPct(r.p30) + '</span> ' + T.m30 : '')
    + '<div class="td-cf-note">' + T.note(_esc(c.sym)) + '</div></div>';
}

/* ── Fear & Greed, in the banner slot ───────────────────────────────
   Deliberately plain text, no gauge, no needle. It is one number and it
   changes once a day; a dial would be more chrome than information.

   COLOUR: red at 25 and below, yellow at 50, green at 80 and above,
   interpolated between those anchors. The value is rounded to the
   nearest 10 first, so the colour moves in steps rather than drifting a
   shade every time the index ticks by one — a 66 and a 67 should not
   look like different readings.

   Market-wide, not per-coin, which is why it sits in the topbar rather
   than as a leaderboard column. The same number already feeds
   _quickInsight()'s contrarian pillar in signals.js; this only surfaces
   what the engine was already using. */
function fngColor(v) {
  /* Anchors are tested on the RAW value, before rounding. Quantising
     first would push exactly-25 up to 30 and paint it orange, when 25 is
     specified as red. The rounding is only for the shades in between. */
  if (v <= 25) return 'hsl(0,82%,58%)';                 /* red   */
  if (v >= 80) return 'hsl(140,82%,58%)';               /* green */
  var q = Math.round(v / 10) * 10;
  var hue = q <= 50
    ? ((q - 25) / 25) * 50                              /* red -> yellow */
    : 50 + ((q - 50) / 30) * 90;                        /* yellow -> green */
  return 'hsl(' + Math.round(Math.max(0, Math.min(140, hue))) + ',82%,58%)';
}

function renderFearGreed(force) {
  var el = document.getElementById('fng-banner');
  var tx = document.getElementById('fng-text');
  if (!el || !tx) return;
  /* Retired 2026-10-04 (Daniel: "we have now duplicate fear and greed,
     lets ditch the top one"). The reading lives in The market now at the
     top of TODAY, coloured with fngColor(). The bar stays hidden; the
     function is kept because the scaling tip and the tour call it. */
  el.classList.remove('show'); return;

  /* Only takes the slot once the scaling tip is out of the way — one
     banner at a time, and the tip is the more urgent thing to read. */
  var scaleDismissed = false;
  try { scaleDismissed = localStorage.getItem('rot_scale_dismissed') === '1'; } catch(e) {}
  var fg = window.fearGreed;
  /* force: the tutorial's TODAY step shows it in the tip's place. */
  if ((!scaleDismissed && !force) || !fg || fg.value == null) { el.classList.remove('show'); return; }

  tx.innerHTML = '<strong style="color:' + fngColor(fg.value) + ';">FEAR &amp; GREED INDEX '
    + fg.value + '</strong>';
  el.title = 'Crypto Fear & Greed Index — ' + (fg.label || '') + '. Market-wide sentiment, 0 = extreme fear, 100 = extreme greed. Source: alternative.me.';
  el.classList.add('show');
}

/* LEARN MORE: counts the click out to the Crypto Gemidzija academy, once a
   session (promptove/119). The link itself is a plain <a target=_blank>. */
function academyClick() {
  if (typeof supaCountFeature === 'function') supaCountFeature('academy_click', true);
}

/* ── Mobile nav — scroll-to helpers ─────────────────────────── */
function _mobScrollTo(el) {
  if (!el) return;
  /* Same scroll the section rail uses (ui.js). It was scrollIntoView
     with behavior:'smooth', which is a silent no-op in a hidden tab and
     under prefers-reduced-motion — the button appeared to do nothing.
     It also now clears the sticky topbar, which the raw call did not. */
  if (typeof window.rotScrollToEl === 'function') { window.rotScrollToEl(el); return; }
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* mobGo(secId) — the bottom bar and MORE go to the rail's sections
   (promptove/103). Where a section opens with a folded block (the
   strongest/weakest lists, the holdings grid, the swap tool, the track
   record), open it first and scroll once the 320ms unfold is done: a
   scroll during the unfold lands short. Navigation never folds anything
   shut; a second tap just scrolls there again. The active button is set
   by the scroll observer in initRail() (js/ui.js), not here. */
var _MOB_SEC_FOLD = {
  'sec-rotation': 'hot',
  'sec-yours':    'holdings',
  'sec-swap':     'swap',
  'sec-record':   'trackrecord'
};
function mobGo(secId) {
  closeMobMore();
  var sec = document.getElementById(secId);
  if (!sec) return;
  var fold = _MOB_SEC_FOLD[secId];
  var body = fold && document.getElementById('cb-' + fold);
  var wasCollapsed = !!(body && body.classList.contains('collapsed'));
  if (wasCollapsed) toggleCollapse(fold);
  if (secId === 'sec-swap' && typeof RatioTracker !== 'undefined') RatioTracker.loadAll();
  setTimeout(function() { _mobScrollTo(sec); }, wasCollapsed ? 350 : 0);
}

/* ── More menu ─────────────────────────────────────────────── */
function mobNavMore() {
  var menu     = document.getElementById('mob-more-menu');
  var backdrop = document.getElementById('mob-more-backdrop');
  var btn      = document.getElementById('mn-more');
  var isOpen   = menu && menu.classList.contains('show');
  if (isOpen) { closeMobMore(); return; }
  if (menu)     menu.classList.add('show');
  if (backdrop) backdrop.classList.add('show');
  if (btn)      { btn.classList.add('menu-open'); btn.setAttribute('aria-expanded', 'true'); }
  /* Sync theme label */
  var isLight = document.documentElement.classList.contains('light');
  var ico = document.getElementById('mm-theme-ico');
  var txt = document.getElementById('mm-theme-txt');
  if (ico) ico.textContent = isLight ? '🌙' : '☀';
  if (txt) txt.textContent = isLight ? 'Dark Mode' : 'Light Mode';
}
function closeMobMore() {
  var menu     = document.getElementById('mob-more-menu');
  var backdrop = document.getElementById('mob-more-backdrop');
  var btn      = document.getElementById('mn-more');
  if (menu)     menu.classList.remove('show');
  if (backdrop) backdrop.classList.remove('show');
  if (btn)      { btn.classList.remove('menu-open'); btn.setAttribute('aria-expanded', 'false'); }
}

/* ── Topbar auto-hide on scroll (mobile portrait) ──────────── */
(function initTopbarAutoHide() {
  var lastY = 0;
  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function() {
      if (window.innerWidth > 700) { ticking = false; return; }
      var topbar = document.querySelector('.topbar');
      if (!topbar) { ticking = false; return; }
      var y = window.scrollY || window.pageYOffset;
      if (y > 80 && y > lastY) {
        topbar.style.transform = 'translateY(-100%)';
        topbar.style.transition = 'transform .25s ease';
      } else {
        topbar.style.transform = 'translateY(0)';
        topbar.style.transition = 'transform .25s ease';
      }
      lastY = y;
      ticking = false;
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
})();

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
/* Windows draws no flag emoji: "🇬🇧 EN" came out as "GB EN" and "🇲🇰 MK"
   as "MK MK" (promptove/113). Draw one on a canvas; a real flag has
   colour, the letter fallback is plain grey. Where it is grey, the flags
   are removed from the language buttons and the code alone remains. */
function _flagEmojiOk() {
  try {
    var c = document.createElement('canvas'); c.width = c.height = 24;
    var x = c.getContext('2d');
    x.textBaseline = 'top'; x.font = '18px sans-serif';
    x.fillText('🇬🇧', 0, 0);
    var d = x.getImageData(0, 0, 24, 24).data;
    for (var i = 0; i < d.length; i += 4) {
      if (d[i + 3] > 40 && (Math.abs(d[i] - d[i + 1]) > 40 || Math.abs(d[i] - d[i + 2]) > 40)) return true;
    }
    return false;
  } catch (e) { return true; }
}
function _stripFlagEmoji() {
  if (_flagEmojiOk()) return;
  var bs = document.querySelectorAll('.lang-btn-modal');
  for (var i = 0; i < bs.length; i++) bs[i].textContent = bs[i].textContent.replace(/\uD83C[\uDDE6-\uDDFF]/g, '').trim();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _stripFlagEmoji);
else _stripFlagEmoji();

function setLang(lang) {
  currentLang = lang;
  /* Macedonian side banners key off this class (styles.css, promptove/72). */
  document.documentElement.classList.toggle('lang-mk', lang === 'mk');
  if (lang === 'mk') document.documentElement.classList.add('mk-seen');
  document.documentElement.lang = lang;
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
  if (typeof applyLang === 'function') applyLang();
  /* The rest of the page (promptove/73): js/i18n-mk.js translates what is on it. */
  if (typeof applyMkLayer === 'function') applyMkLayer(lang);
  /* ETF tiles and an open ETF window carry their own en/mk text. */
  if (typeof renderEtfFlows === 'function') renderEtfFlows();
  if (typeof renderChainFlows === 'function') renderChainFlows();
  /* TODAY: copper and gas show SI units in Macedonian (_bfWorldCell o.mk). */
  if (typeof renderBriefing === 'function') renderBriefing();
  if (typeof _twTgSync === 'function') _twTgSync(false);   /* Telegram alerts follow the site language */
  var etfM = document.getElementById('etf-modal');
  if (etfM && etfM.classList.contains('show') && typeof openEtfModal === 'function') openEtfModal();
  var cfM = document.getElementById('cf-modal');
  if (cfM && cfM.classList.contains('show') && typeof openChainFlowsModal === 'function') openChainFlowsModal();
  if (typeof _tdCoin !== 'undefined' && _tdCoin && typeof _tdChainFlow === 'function') _tdChainFlow(_tdCoin);
}
(function() { try { var l = localStorage.getItem('rot_lang'); if (l) setTimeout(function() { setLang(l); }, 50); } catch(e) {} })();

/* ── Theme toggle (dark/light) ──────────────────────────────── */
function toggleTheme(isLight) {
  document.documentElement.classList.toggle('light', isLight);
  try { localStorage.setItem('rot_theme', isLight ? 'light' : 'dark'); } catch(e) {}
  var tog = document.getElementById('theme-toggle');
  if (tog) tog.checked = isLight;
  var ico = document.getElementById('theme-icon');
  var lbl = document.getElementById('theme-label');
  if (ico) ico.textContent = isLight ? '🌙' : '☀';
  if (lbl) lbl.textContent = isLight ? 'DARK' : 'LIGHT';
}
(function() {
  try {
    var saved = localStorage.getItem('rot_theme');
    if (saved === 'light') {
      document.documentElement.classList.add('light');
      setTimeout(function() {
        var tog = document.getElementById('theme-toggle');
        if (tog) tog.checked = true;
        var ico = document.getElementById('theme-icon');
        var lbl = document.getElementById('theme-label');
        if (ico) ico.textContent = '🌙';
        if (lbl) lbl.textContent = 'DARK';
      }, 100);
    }
  } catch(e) {}
})();

/* ── Modal helpers ───────────────────────────────────────────── */
function openModal(id) {
  if (id === 'settings-modal') { openSettingsPanel(document.querySelector('.settings-btn')); return; }
  document.getElementById(id).classList.add('show');
  if (id === 'donate-modal') renderDonationBar('donate-modal-goal');
}
function closeModal(id) {
  if (id === 'settings-modal') { closeSettingsPanel(); return; }
  document.getElementById(id).classList.remove('show');
}

/* ── Settings panel (positioned near gear button) ─────────────── */
function openSettingsPanel(triggerEl) {
  var panel    = document.getElementById('settings-panel');
  var backdrop = document.getElementById('settings-backdrop');
  if (!panel) return;

  /* Mobile: CSS handles bottom-sheet positioning, skip JS positioning */
  if (window.innerWidth <= 700) {
    panel.style.left = '';
    panel.style.top  = '';
    panel.style.display    = 'block';
    backdrop.style.display = 'block';
    return;
  }

  /* Desktop: position relative to gear button */
  var btn = triggerEl instanceof Element ? triggerEl : (document.querySelector('.settings-btn') || triggerEl);
  if (btn && btn.getBoundingClientRect) {
    var r   = btn.getBoundingClientRect();
    var pw  = 330;
    var bx  = r.left - pw - 12;
    var by  = r.bottom + 8;
    /* Keep within viewport */
    bx = Math.max(10, Math.min(bx, window.innerWidth - pw - 10));
    by = Math.max(10, by);
    var maxH = window.innerHeight - by - 10;
    panel.style.left      = bx + 'px';
    panel.style.top       = by + 'px';
    panel.style.maxHeight = Math.max(200, maxH) + 'px';
  }

  panel.style.display    = 'block';
  backdrop.style.display = 'block';
}

function closeSettingsPanel() {
  var panel    = document.getElementById('settings-panel');
  var backdrop = document.getElementById('settings-backdrop');
  if (panel)    panel.style.display    = 'none';
  if (backdrop) backdrop.style.display = 'none';
}

document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    closeModal('donate-modal'); closeModal('pro-modal'); closeSettingsPanel();
    /* The info windows the rail foot and MORE open (promptove/103). */
    closeModal('how-modal'); closeModal('about-modal'); closeModal('faq-modal');
    closeMobMore();
    /* The coin window and the row hover card (2026-10-05): Escape left
       both open. Both functions are safe to call when nothing is open. */
    if (typeof hideTip === 'function') hideTip();
    if (typeof closeTileDetail === 'function') closeTileDetail();
  }
});

/* ── Entry point ─────────────────────────────────────────────── */
doLoad().then(function() { initTutorial(); syncPanelAlignment(); _handleCoinDeepLink(); });

/* ── Sync right-panel spacer height to neon-section height ──────
   Makes the ad-panel content start level with the leaderboard
   header on desktop — called after load and on resize.
────────────────────────────────────────────────────────────────── */
function syncPanelAlignment() {
  var neon      = document.querySelector('.neon-section');
  var spacer    = document.getElementById('ad-panel-neon-spacer');
  var sigBox    = document.querySelector('.sig-box');
  if (!neon) return;
  var isDesktop = window.innerWidth > 900;

  /* Right panel spacer */
  if (spacer) spacer.style.height = isDesktop ? neon.offsetHeight + 'px' : '0px';

  /* Left sidebar: add top padding to sig-box so Portfolio Signal
     aligns with the tbl-head (neon-section bottom). No mode bar to
     subtract anymore — sig-box is the first sidebar child directly. */
  if (sigBox) {
    if (isDesktop) {
      sigBox.style.marginTop = Math.max(0, neon.offsetHeight) + 'px';
    } else {
      sigBox.style.marginTop = '';
    }
  }
}
window.addEventListener('resize', function() { syncPanelAlignment(); });

/* ══════════════════════════════════════════════════════════════
   TILE DETAIL PANEL — openTileDetail
   Shared card for crypto AND bStocks (both live in coins[] now —
   see loadBstocks() above). openAssetDetail()/openAssetDetail-only
   forex+stock branch removed; holdings.js still needs its two calls
   to the old openAssetDetail('stock'/'forex', …) repointed at
   openTileDetail(id, evt) — see follow-up note.
══════════════════════════════════════════════════════════════ */
var _tdCoin = null;

function fmtMcap(n) {
  if (!n) return '—';
  if (n >= 1e12) return '$' + (n/1e12).toFixed(2) + 'T';
  if (n >= 1e9)  return '$' + (n/1e9).toFixed(2)  + 'B';
  if (n >= 1e6)  return '$' + (n/1e6).toFixed(1)  + 'M';
  return '$' + n.toLocaleString();
}
/* fmtVol uses the same bucketing as market cap — alias, not a copy */
var fmtVol = fmtMcap;

function _positionPanel(panel, evt) {
  var isMobile = window.innerWidth <= 700;
  if (isMobile) {
    /* Mobile: CSS bottom-sheet handles positioning */
    panel.style.left = ''; panel.style.top = '';
    panel.style.display = 'block';
    document.getElementById('td-overlay').classList.add('show');
    return;
  }
  panel.style.display = 'block';
  var pw = panel.offsetWidth || 340;
  var ph = panel.offsetHeight || 460;
  var cx = evt ? evt.clientX : window.innerWidth  / 2;
  var cy = evt ? evt.clientY : window.innerHeight / 2;
  var left = cx + 18, top = cy - 120;
  if (left + pw > window.innerWidth  - 16) left = cx - pw - 18;
  if (left < 8) left = 8;
  if (top  + ph > window.innerHeight - 16) top  = window.innerHeight - ph - 16;
  if (top < 8) top = 8;
  panel.style.left = left + 'px';
  panel.style.top  = top  + 'px';
  document.getElementById('td-overlay').classList.add('show');
}

/* ── Rotation context in the detail modal ──────────────────────
   Shown only when this coin is currently the TARGET of a rotation
   call. It carries the qualifier that used to sit on the tile:

     "Not a forecast that DEXE rises — in 8 of 19 wins both coins fell,
      the target just fell less."

   That sentence is the most important thing on a rotation call and the
   least scannable, so at tile width it was making the card too tall to
   read while being the line most likely skipped. Here it has room, and
   the reader arrives having already clicked through to find out more.

   Reads window.ROTATION_CONTEXT, which signals.js writes as it builds
   the tiles, and ROTATOR_EVIDENCE for every figure. Renders nothing at
   all if either is missing — an unmeasured claim is not made. */
function renderRotationContext(c) {
  var box = document.getElementById('td-rot-ctx');
  if (!box) return;
  var ctx = (window.ROTATION_CONTEXT || {})[c && c.id];
  var ev  = (typeof ROTATOR_EVIDENCE !== 'undefined') && ROTATOR_EVIDENCE.rotation;
  var sec = document.getElementById('td-signals-sec');
  if (!ctx || !ev) { box.hidden = true; box.innerHTML = ''; if (sec) sec.style.display = 'none'; return; }
  if (sec) sec.style.display = '';

  box.innerHTML =
      '<div class="td-rot-ctx-in">'
    /* INFORMATION ONLY since 2026-09-25 (promptove/64). This used to say
       "coins that have lagged tend to outperform the ones that ran". The
       771-day backtest says the opposite, so the box now states the gap
       and what history showed, stamped from ROTATOR_EVIDENCE. */
    +   '<div class="td-rot-ctx-hd">Score gap &middot; '
    +     ctx.fromSym + ' vs ' + ctx.toSym
    +   '</div>'
    +   '<p>' + ctx.fromSym + ' has run ahead (score ' + ctx.fromScore + ') while '
    +     ctx.toSym + ' has lagged (score ' + ctx.toScore + ').</p>'
    +   (ev.backtest && ev.backtest.lowerWonPct != null
          ? '<p class="td-rot-ctx-rec">Over ' + ev.backtest.days + ' days of history, the lower-scored '
            + 'coin in pairs like this did better in only <b>' + ev.backtest.lowerWonPct + '%</b> of '
            + ev.backtest.lowerWonHorizon + '-day periods, against about <b>' + ev.chance
            + '%</b> for two coins picked at random.</p>'
          : '')
    +   '<p class="td-rot-ctx-caveat"><b>Information, not a call.</b> A lagging score does not '
    +     'mean ' + ctx.toSym + ' will catch up.</p>'
    + '</div>';
  box.hidden = false;
}

/* ── About the coin (Daniel, 2026-10-03) ───────────────────────────
   The coin's official website, whitepaper, X account, explorer and code,
   plus a two-sentence description, so a visitor can learn what the
   project is. From CoinGecko's per-coin record (free, keyless, the browser
   may read it), fetched only when a coin window opens and kept in this
   browser for 7 days. Crypto only; stocks have no CoinGecko record.

   Safety, because fake project sites are common: only http(s) links, the
   website button shows its real domain, links open with noopener and
   noreferrer, and a line says to check the address before connecting a
   wallet. "View on CoinGecko" always shows, so the block is never empty.
   Since the same evening the links come from a stored weekly row, not
   from each visitor asking CoinGecko (see _tdAboutRow). */
var _TD_ABOUT_TTL = 7 * 24 * 3600 * 1000;
function _tdUrl(u) {
  try { var x = new URL(u); return (x.protocol === 'https:' || x.protocol === 'http:') ? x : null; } catch (e) { return null; }
}
function _tdEsc(t) {
  return String(t).replace(/[&<>"']/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]; });
}
function _tdAboutCache(id, val) {
  var k = 'rot_about_' + id;
  try {
    if (val) { localStorage.setItem(k, JSON.stringify({ t: Date.now(), d: val })); return val; }
    var c = JSON.parse(localStorage.getItem(k) || 'null');
    return c && Date.now() - c.t < _TD_ABOUT_TTL ? c.d : null;
  } catch (e) { return val || null; }
}
/* Keep only what the block shows. */
function _tdAboutPick(d) {
  var l = d.links || {};
  var first = function (a) { return (a || []).filter(function (x) { return x && _tdUrl(x); })[0] || null; };
  var text = String((d.description && d.description.en) || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  var sentences = text.match(/[^.!?]+[.!?]+(\s|$)/g) || (text ? [text] : []);
  var desc = sentences.slice(0, 2).join('').trim();
  if (desc.length > 320) desc = desc.slice(0, 317).replace(/\s+\S*$/, '') + '…';
  return {
    site: first(l.homepage), paper: _tdUrl(l.whitepaper || '') ? l.whitepaper : null,
    x: /^[A-Za-z0-9_]{1,15}$/.test(l.twitter_screen_name || '') ? l.twitter_screen_name : null,
    explorer: first(l.blockchain_site), code: first(l.repos_url && l.repos_url.github),
    desc: desc
  };
}
function _tdAboutRender(c, a) {
  var sec = document.getElementById('td-about-sec'), box = document.getElementById('td-about');
  if (!sec || !box) return;
  var chip = function (href, icon, label, title) {
    return '<a class="td-link" href="' + _tdEsc(href) + '" target="_blank" rel="noopener noreferrer nofollow"'
      + (title ? ' title="' + _tdEsc(title) + '"' : '') + '><span>' + icon + '</span> ' + _tdEsc(label) + '</a>';
  };
  var html = '';
  if (a && a.desc) html += '<div class="td-about-desc">' + _tdEsc(a.desc) + '</div>';
  var links = '';
  if (a && a.site) { var u = _tdUrl(a.site); links += chip(a.site, '🌐', u.hostname.replace(/^www\./, ''), 'Official website'); }
  if (a && a.paper) links += chip(a.paper, '📄', 'Whitepaper');
  if (a && a.x) links += chip('https://x.com/' + a.x, '𝕏', '@' + a.x);
  if (a && a.explorer) links += chip(a.explorer, '🔎', 'Explorer');
  if (a && a.code) links += chip(a.code, '⌨', 'Code');
  links += chip('https://www.coingecko.com/en/coins/' + encodeURIComponent(c.id), '🦎', 'View on CoinGecko');
  html += '<div class="td-links">' + links + '</div>'
    + '<div class="td-about-note">Links from CoinGecko. Check the address before you connect a wallet anywhere.</div>';
  box.innerHTML = html;
  var title = document.getElementById('td-about-title');
  if (title) title.textContent = 'About ' + c.name;
  sec.style.display = '';
}
/* The stored row first (market_cache 'coin_about', written weekly by
   scripts/sync-coin-about.mjs on GitHub): loaded once, on the first coin
   window, and every coin after that is instant and complete. A coin the
   row does not have yet (new to the list this week) falls back to asking
   CoinGecko live, with one retry when CoinGecko says it is busy. */
var _coinAbout = null, _coinAboutLoading = null;
function _tdAboutRow() {
  if (_coinAbout) return Promise.resolve(_coinAbout);
  if (!_coinAboutLoading) {
    _coinAboutLoading = (typeof supaCacheGetStale === 'function' ? supaCacheGetStale('coin_about') : Promise.resolve(null))
      .then(function (row) { _coinAbout = (row && row.data && row.data.coins) || {}; return _coinAbout; })
      .catch(function () { _coinAbout = {}; return _coinAbout; });
  }
  return _coinAboutLoading;
}
function _tdAboutLive(c, tries) {
  return fetch('https://api.coingecko.com/api/v3/coins/' + encodeURIComponent(c.id)
      + '?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false&sparkline=false')
    .then(function (r) {
      if (r.status === 429 && tries > 0) {
        return new Promise(function (ok) { setTimeout(ok, 4000); }).then(function () { return _tdAboutLive(c, tries - 1); });
      }
      return r.ok ? r.json().then(_tdAboutPick) : null;
    });
}
function _tdAbout(c) {
  var sec = document.getElementById('td-about-sec');
  if (!sec) return;
  if (!c || c.isStock || !c.id) { sec.style.display = 'none'; return; }
  var cached = (_coinAbout && _coinAbout[c.id]) || _tdAboutCache(c.id);
  _tdAboutRender(c, cached);          /* at once: full if known, else the CoinGecko button */
  if (cached) return;
  _tdAboutRow().then(function (rows) {
    if (rows[c.id]) return rows[c.id];
    return _tdAboutLive(c, 1).then(function (a) { return a ? _tdAboutCache(c.id, a) : null; });
  }).then(function (a) {
    if (a && _tdCoin === c) _tdAboutRender(c, a);   /* still the window that asked */
  }).catch(function () { /* busy or offline: the CoinGecko button stays */ });
}

/* ── Golden / death cross, inside the Insight Engine (Pro, 2026-10-04) ──
   The 60/125 cross: which side the coin is on, how long ago it crossed
   (dated for about the last 2 weeks; older is "more than 2 weeks ago"),
   and the tested record, so it is read as context, not as a call. */
function _tdCrossTile(c) {
  if (!c || c.isStock || c.isStable || typeof coinTechnicals === 'undefined') return '';
  var t = coinTechnicals[c.sym];
  if (!t || !t.cross) return '';
  var golden = t.cross === 'golden';
  var cls = golden ? 'good' : 'bad';
  var when = t.crossDays == null ? 'crossed more than 2 weeks ago'
    : t.crossDays === 0 ? 'crossed at the latest close'
    : 'crossed ' + t.crossDays + (t.crossDays === 1 ? ' day' : ' days') + ' ago';
  var tested = (typeof _crossTested === 'function') ? _crossTested(golden ? 'golden' : 'death') : '';
  return '<div class="signal-tile' + (t.crossDays != null ? ' highlight-' + cls : '') + '" style="margin-top:2px;">'
    + '<span class="tile-icon ' + cls + '">' + (golden ? '✨' : '☠') + '</span>'
    + '<div class="tile-body"><span class="tile-label">TREND CROSS (60D / 125D)</span>'
    + '<span class="tile-value ' + cls + '">' + (golden ? 'Golden cross' : 'Death cross') + '</span>'
    + '<span class="td-cross-sub">' + (golden ? '60-day average above the 125-day' : '60-day average below the 125-day') + '</span>'
    + '<span class="td-cross-sub">' + when + '</span>'
    + '<span class="td-cross-sub td-cross-tested">' + tested + '</span>'
    + '</div></div>';
}

/* Volume against the coin's usual, in the Insight Engine for coins you
   hold or watch (Pro, Daniel 2026-10-04). The headline is the last
   SETTLED day from coin_technicals (vol_ratio = that day's quote volume
   over the median of the 30 settled days before it); the last 7 days load
   from binance_daily_klines when the window opens. Worded as activity,
   not direction: in the opportunity test (promptove/96) a 2x volume day
   raised the chance of big moves BOTH ways, and only with a run and RSI
   >= 70 did it become the hot-run warning (promptove/98). */
function _volPct(r) {
  var p = (r - 1) * 100;
  return (p >= 0 ? '+' : '−') + Math.abs(Math.round(p)).toLocaleString('en-US') + '%';
}
function _volDay(iso) {
  var t = new Date(String(iso).slice(0, 10) + 'T00:00:00Z');
  return isNaN(+t) ? '' : t.getUTCDate() + ' ' + ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][t.getUTCMonth()];
}
function _tdVolumeTile(c) {
  if (!c || c.isStock || c.isStable || typeof coinTechnicals === 'undefined') return '';
  var t = coinTechnicals[c.sym];
  if (!t || t.volRatio == null || !isFinite(t.volRatio)) return '';
  var r = t.volRatio, surge = r >= 2;
  return '<div class="signal-tile' + (surge ? ' td-vol-surge' : '') + '" style="margin-top:2px;">'
    + '<span class="tile-icon neutral">📊</span>'
    + '<div class="tile-body"><span class="tile-label">VOLUME vs ITS 30-DAY USUAL</span>'
    + '<span class="tile-value' + (surge ? ' td-vol-hi' : '') + '">' + _volPct(r) + ' (' + r.toFixed(1) + '×) on ' + _volDay(t.volDay) + '</span>'
    + '<div class="td-vol-days" id="td-vol-days" data-sym="' + _esc(c.sym) + '"></div>'
    + '<span class="td-cross-sub">' + (surge
        ? 'A volume surge. In past data, days like this raised the chance of big moves both ways; it is not a direction'
        : 'Normal trading activity for this coin') + '</span>'
    + '<span class="td-cross-sub">Source: Binance daily candles, settled days</span>'
    + '</div></div>';
}
function _tdLoadVolumeDays(sym) {
  if (typeof supaRest !== 'function') return;
  supaRest('binance_daily_klines', 'GET', {
    'base_asset': 'eq.' + sym, 'select': 'open_time,quote_volume',
    'order': 'open_time.desc', 'limit': '40'
  }).then(function (rows) {
    var box = document.getElementById('td-vol-days');
    if (!box || box.getAttribute('data-sym') !== sym || !Array.isArray(rows)) return;
    var today = new Date().toISOString().slice(0, 10);
    var settled = rows.filter(function (x) { return x && x.quote_volume != null && String(x.open_time).slice(0, 10) < today; })
                      .map(function (x) { return { d: String(x.open_time).slice(0, 10), v: Number(x.quote_volume) }; })
                      .reverse();   /* oldest first */
    var out = [];
    for (var i = settled.length - 1; i >= 30 && out.length < 7; i--) {
      var prev = settled.slice(i - 30, i).map(function (x) { return x.v; }).filter(function (v) { return v > 0; }).sort(function (a, b) { return a - b; });
      if (prev.length < 20) break;
      var m = prev.length % 2 ? prev[prev.length >> 1] : (prev[(prev.length >> 1) - 1] + prev[prev.length >> 1]) / 2;
      if (!(m > 0)) break;
      out.push({ d: settled[i].d, r: settled[i].v / m });
    }
    if (!out.length) return;
    box.innerHTML = '<span class="td-vol-days-lbl">Last ' + out.length + ' days</span>'
      + out.reverse().map(function (x) {
          return '<span class="td-vol-day' + (x.r >= 2 ? ' hi' : '') + '" title="' + _volDay(x.d) + ': ' + x.r.toFixed(1) + '× its usual">'
            + _volDay(x.d) + ' ' + _volPct(x.r) + '</span>';
        }).join('');
  }).catch(function () {});
}

function openTileDetail(coinId, evt) {
  if (evt) evt.stopPropagation();
  /* The row's hover card (or its pending 200ms timer) must not outlive
     the click that opened this window and sit on top of it. */
  if (typeof hideTip === 'function') hideTip();
  var c = coins.find(function(x) { return x.id === coinId || x.sym === coinId; });
  if (!c) return;
  if (typeof supaCountFeature === 'function') supaCountFeature('coin_window');
  _tdCoin = c;
  _tdAbout(c);
  _tdChainFlow(c);
  var panel = document.getElementById('td-panel');
  var icoEl = document.getElementById('td-ico');
  /* Logo, with initials behind it when the image does not load. The
     fallback element has existed since the modal was built and nothing
     ever wrote to it or toggled it, so a coin with a broken logo showed
     an empty circle. onerror/onload rather than a guess about c.image:
     the URL is usually present and still 404s. */
  var icoFb = document.getElementById('td-ico-fallback');
  if (icoFb) {
    icoFb.textContent = (c.sym || '?').slice(0, 4);
    icoFb.style.display = 'none';
  }
  icoEl.onerror = function () {
    this.style.display = 'none';
    if (icoFb) icoFb.style.display = 'flex';
  };
  icoEl.onload = function () {
    this.style.display = '';
    if (icoFb) icoFb.style.display = 'none';
  };
  icoEl.src = c.image || ''; icoEl.style.display = '';
  if (!c.image && icoFb) { icoEl.style.display = 'none'; icoFb.style.display = 'flex'; }
  document.getElementById('td-sym').textContent   = c.sym;
  document.getElementById('td-name').textContent  = c.name;
  document.getElementById('td-price').textContent = fmtP(c.price);

  /* 24H change under price */
  var p24chgEl = document.getElementById('td-price-chg');
  if (p24chgEl) {
    p24chgEl.textContent = (c.p24 >= 0 ? '+' : '') + c.p24.toFixed(2) + '% (24H)';
    p24chgEl.style.color = c.p24 >= 0 ? 'var(--green)' : 'var(--red)';
  }

  /* Type badge.
     This said 'CRYPTO' unconditionally, for every asset, so Nokia's
     modal was labelled CRYPTO. Wrong since bStocks launched — it just
     took the roster going from 24 to 60 (2026-09-16) for anyone to
     look. The `.stock` rule has been sitting in styles.css unused the
     whole time; nothing needed writing but the branch. */
  var badge = document.getElementById('td-type-badge');
  if (badge) {
    badge.textContent = c.isStock ? 'STOCK' : 'CRYPTO';
    badge.className   = 'td-type-badge ' + (c.isStock ? 'stock' : 'crypto');
  }

  /* Score breakdown — tile grid with checkmarks */
  var scC = scoreColor(c.score);

  /* The big number, in the column that was reserved for it and never
     filled. #td-score-num has been in index.html since the modal was
     built and NOTHING ever wrote to it — .td-score-wrap is a flex row
     of a fixed 72px column plus the rest, so every modal opened with
     72px of nothing directly under the section title, in the first
     place the eye lands. styles.css even describes the intent it never
     got: "Score section — DOMINANT: oversized number anchors hierarchy".

     So the score moves here at 48px and comes OUT of the header row
     beside the zone label, otherwise the same number would appear
     twice a few pixels apart. The label keeps its row; the rank tiles
     read underneath it. */
  /* The accent bar under the header. index.html calls it "Accent bar that
     changes color by score" and styles it with transition:background .3s,
     and nothing ever set a background — it has been a 2px transparent
     strip since the modal was built. scC is the zone colour computed one
     line above, so this is the number the bar was always meant to show. */
  var accentBar = document.getElementById('td-accent-bar');
  if (accentBar) accentBar.style.background = scC;

  var scoreBig = document.getElementById('td-score-num');
  if (scoreBig) {
    scoreBig.innerHTML = '<div class="td-score-num-val" style="color:' + scC + ';">' + c.score + '</div>'
      + '<div class="td-score-num-lbl">/ 100</div>';
  }

  var scHtml = '<div class="td-insight-header" style="margin-bottom:6px;">'
    /* Same words and cut-offs as the reading at the top (_tdStatus in
       coin-reading.js). It said BULLISH / BEARISH at 65 / 35, a forecast
       the score does not make, next to "Has lagged" and a NEUTRAL badge. */
    + (function () {
        var st = (typeof _tdStatus === 'function') ? _tdStatus(c) : (c.score >= 55 ? 'ahead' : c.score <= 35 ? 'lagging' : 'middle');
        return '<div class="insight-pulse ' + ({ ahead: 'green', lagging: 'red', middle: 'blue' })[st] + ' td-insight-pulse"><span class="insight-dot"></span><span class="insight-lbl">'
          + ({ ahead: 'RAN AHEAD THIS WEEK', lagging: 'LAGGED THIS WEEK', middle: 'MIDDLE OF THE PACK' })[st] + '</span></div>';
      })()
    + '</div>';
  scHtml += '<div class="signal-tile-grid">';
  [{l:'7D RANK',v:c.r7,w:0.40},{l:'14D RANK',v:c.r14,w:0.35},{l:'30D RANK',v:c.r30,w:0.25}].forEach(function(b) {
    var pct = Math.round((1 - (b.v-1) / Math.max(coins.length-1,1)) * 100);
    var isGood = pct >= 50;
    /* pct is the share of coins it BEATS. It was printed as "top pct%",
       so #77 of 334 read "top 77%" when it is in the top 23%. */
    var topPct = Math.max(1, Math.round(b.v / Math.max(coins.length, 1) * 100));
    var icon = isGood ? '✓' : '−';
    var cls  = isGood ? 'good' : 'bad';
    var hlCls = isGood ? ' highlight-good' : ' highlight-bad';
    scHtml += '<div class="signal-tile' + hlCls + '">'
      + '<span class="tile-icon ' + cls + '">' + icon + '</span>'
      + '<div class="tile-body"><span class="tile-label">' + b.l + '</span>'
      + '<span class="tile-value ' + cls + '">#' + b.v + ' · top ' + topPct + '%</span></div></div>';
  });
  /* Overall score tile */
  var scB = scoreBand(c.score), scK = { hi: 'good', md: 'mid', lo: 'bad' }[scB];
  scHtml += '<div class="signal-tile' + (scB === 'hi' ? ' highlight-good' : scB === 'lo' ? ' highlight-bad' : '') + '">'
    + '<span class="tile-icon ' + scK + '">' + { hi: '✓', md: '~', lo: '−' }[scB] + '</span>'
    + '<div class="tile-body"><span class="tile-label">COMPOSITE</span>'
    + '<span class="tile-value ' + scK + '">' + c.score + ' / 100</span></div></div>';
  scHtml += '</div>';
  document.getElementById('td-score-bars').innerHTML = scHtml;

  /* Score Breakdown — the actual layer1/layer2/layer3 numbers behind
     the composite, in plain language. Was already computed every render
     (c.scoreBreakdown) but never displayed — a score someone might put
     real money behind should be inspectable, not a black box. */
  var bdSec = document.getElementById('td-breakdown-sec');
  var bdEl  = document.getElementById('td-breakdown');
  if (bdSec && bdEl && c.scoreBreakdown) {
    var bd = c.scoreBreakdown;
    var l1c = bd.layer1 >= 20 ? 'up' : 'dn';
    var l2c = bd.layer2 >= 15 ? 'up' : 'dn';
    bdEl.innerHTML =
      '<div class="td-cell" title="Rank vs every other tracked coin on 7D/14D/30D momentum, weighted 25/30/45%. Higher = stronger relative recent momentum.">'
      +'<div class="td-cell-l">MOMENTUM</div><div class="td-cell-v '+l1c+'">'+bd.layer1+' / 40</div></div>'
      +'<div class="td-cell" title="Relative strength vs BTC, Gold, Silver, Oil, DXY and the broader alt market (Total3) over 7D. Higher = outperforming the macro backdrop, not just the crypto market.">'
      +'<div class="td-cell-l">MACRO STRENGTH</div><div class="td-cell-v '+l2c+'">'+bd.layer2+' / 30</div></div>'
      + (bd.partial
        ? '<div class="td-cell" title="No tokenomics data applies to equities — see the bStock badge tooltip. This is a partial score (max 70), not directly comparable to a crypto composite.">'
          +'<div class="td-cell-l">TOKENOMICS</div><div class="td-cell-v" style="color:var(--muted);">n/a (stock)</div></div>'
        : '<div class="td-cell" title="Supply issuance schedule, deflationary mechanics, and unlock/vesting risk. Can be negative — bad tokenomics actively subtracts from the score, it is not just a neutral add-on.">'
          +'<div class="td-cell-l">TOKENOMICS</div><div class="td-cell-v '+(bd.layer3>=0?'up':'dn')+'">'+(bd.layer3>=0?'+':'')+bd.layer3+' / 30</div></div>');
    bdEl.style.gridTemplateColumns = 'repeat(3,1fr)';
    bdSec.style.display = '';

    /* Honest scope disclosure — shown once, directly under the numbers
       that could most easily be over-trusted. Not hidden in a tooltip:
       this is the kind of thing someone deciding whether to deploy real
       capital should not have to go hunting for. */
    var scopeNote = document.getElementById('td-breakdown-scope');
    if (!scopeNote) {
      scopeNote = document.createElement('div');
      scopeNote.id = 'td-breakdown-scope';
      scopeNote.style.cssText = 'font-size:11px;color:var(--muted);line-height:1.5;margin-top:8px;padding:8px 10px;background:rgba(255,255,255,.015);border-radius:6px;';
      bdSec.appendChild(scopeNote);
    }
    scopeNote.innerHTML = 'This score measures 7–30 day price momentum, macro relative strength, and (for crypto) supply/unlock mechanics. '
      + 'It is <b>not</b> a security audit, a long-term valuation, a usage/TVL metric, or sentiment analysis — none of those are measured here. '
      + 'A high score means "strong recent relative momentum with reasonable tokenomics", not "guaranteed future profit". DYOR beyond this tool before deploying capital.';
  } else if (bdSec) {
    bdSec.style.display = 'none';
  }

  /* Liquidity — 24h volume ÷ market cap. Deliberately kept OUT of the
     composite score (it's a risk/exit-ability flag, not a momentum
     signal) but shown prominently since it directly protects against a
     real, common way to lose money: buying into a position you can't
     actually exit without moving the price against yourself. Thresholds
     below are a reasonable heuristic (typical liquid large-caps turn
     over several % of mcap daily; sub-1-2% is a real thin-liquidity
     warning sign), not a precise scientific boundary — said plainly in
     the tooltip rather than presented as exact science. */
  /* ── Derivatives (Binance perpetuals) ──────────────────────────────
     Display only — deliberately not part of the composite score. These
     metrics vary per coin, so unlike L2's macro terms they COULD rank;
     but none has been measured against forward returns yet, and this
     project has twice shipped plausible signals that failed that test
     (promptove/09, /12). binance_futures_history accumulates so the
     measurement can actually happen. */
  /* ── Derivatives history sparklines ────────────────────────────────
     binance_futures_history has been banking funding, open interest and
     long/short hourly since 2026-09-06 and nothing had ever read it —
     the modal showed today's number with nothing to compare it against.
     "OI is $8.5B" and "OI is $8.5B, flat for two days" are different
     observations, and only one of them is worth showing.

     MINIMUM POINTS, and why it is not 2. OI arrives on alternating
     buckets (sync-binance-futures rotates detail across ~75 symbols per
     run), so a freshly listed pair can have a handful of readings spread
     over a day. Drawing a two-point line between them looks like a trend
     and is really an artefact of the sampler. Below the floor the panel
     says it is still collecting, which is true and useful; a chart
     drawn from too little data is neither.

     Still display only. Nothing here touches a score. */
  var _SPARK_MIN_POINTS = 6;

  function _sparkline(pts, color, w, h) {
    if (!pts || pts.length < _SPARK_MIN_POINTS) return null;
    var lo = Math.min.apply(null, pts), hi = Math.max.apply(null, pts);
    var span = hi - lo;
    /* A flat series is real information, not a failure — draw it down the
       middle rather than dividing by zero and rendering NaN. */
    var y = function(v) { return span === 0 ? h / 2 : h - ((v - lo) / span) * (h - 2) - 1; };
    var step = pts.length > 1 ? w / (pts.length - 1) : 0;
    var d = pts.map(function(v, i) {
      return (i ? 'L' : 'M') + (i * step).toFixed(1) + ' ' + y(v).toFixed(1);
    }).join(' ');
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" width="100%" height="' + h
      + '" preserveAspectRatio="none" aria-hidden="true" style="display:block;overflow:visible;">'
      + '<path d="' + d + '" fill="none" stroke="' + color
      + '" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>'
      + '<circle cx="' + ((pts.length - 1) * step).toFixed(1) + '" cy="' + y(pts[pts.length - 1]).toFixed(1)
      + '" r="2" fill="' + color + '"/></svg>';
  }

  /* Nulls are SKIPPED, never zero-filled — see supaLoadFuturesHistory(). */
  function _seriesOf(rows, field) {
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var v = rows[i][field];
      if (v !== null && v !== undefined && isFinite(Number(v))) out.push(Number(v));
    }
    return out;
  }

  function _hoursSpanned(rows) {
    if (!rows || rows.length < 2) return 0;
    var a = Date.parse(rows[0].bucket), b = Date.parse(rows[rows.length - 1].bucket);
    return (!isFinite(a) || !isFinite(b)) ? 0 : Math.round((b - a) / 3600000);
  }

  function _renderDerivHistory(sym, futSymbol) {
    var box = document.getElementById('td-deriv-hist');
    if (!box || !futSymbol || typeof supaLoadFuturesHistory !== 'function') return;
    box.innerHTML = '<div class="td-hist-note">Loading history…</div>';
    supaLoadFuturesHistory(futSymbol).then(function(rows) {
      /* The modal may have moved on to another coin while this resolved. */
      if (box.getAttribute('data-sym') !== sym) return;
      var oi = _seriesOf(rows, 'open_interest_value');
      var fund = _seriesOf(rows, 'funding_rate').map(function(v) { return v * 100; });
      var hrs = _hoursSpanned(rows);
      var oiSvg = _sparkline(oi, 'var(--bnb)', 200, 30);
      var fundSvg = _sparkline(fund, fund.length && fund[fund.length - 1] >= 0 ? 'var(--red)' : 'var(--green)', 200, 30);

      if (!oiSvg && !fundSvg) {
        box.innerHTML = '<div class="td-hist-note">Still collecting hourly history for this pair — '
          + 'a trend needs at least ' + _SPARK_MIN_POINTS + ' readings.</div>';
        return;
      }
      var pct = function(a) {
        if (a.length < 2 || a[0] === 0) return null;
        return ((a[a.length - 1] - a[0]) / Math.abs(a[0])) * 100;
      };
      var oiPct = pct(oi);
      var cell = function(lbl, svg, sub, n) {
        if (!svg) return '<div class="td-hist-cell"><div class="td-cell-l">' + lbl
          + '</div><div class="td-hist-note">not enough readings yet</div></div>';
        return '<div class="td-hist-cell"><div class="td-cell-l">' + lbl
          + '<span style="color:var(--muted);font-weight:400;"> · ' + n + ' pts</span></div>'
          + svg + '<div class="td-hist-sub">' + sub + '</div></div>';
      };
      box.innerHTML =
          cell('OPEN INTEREST' + (hrs ? ' · ' + hrs + 'H' : ''), oiSvg,
               oiPct == null ? 'over the recorded window'
                 : (oiPct >= 0 ? '+' : '') + oiPct.toFixed(1) + '% across the window', oi.length)
        + cell('FUNDING' + (hrs ? ' · ' + hrs + 'H' : ''), fundSvg,
               fund.length ? 'now ' + (fund[fund.length - 1] >= 0 ? '+' : '')
                 + fund[fund.length - 1].toFixed(4) + '% per 8h' : '', fund.length);

      /* Daily long/short ratio, from coin_indicator_daily. It was already
         fetched with the RSI history (supaLoadIndicatorHistory selects
         long_short_ratio) and never drawn (promptove/67). Cached, so this
         costs no second request when the RSI panel has loaded it. */
      if (typeof supaLoadIndicatorHistory === 'function') {
        supaLoadIndicatorHistory(sym).then(function(ir) {
          if (box.getAttribute('data-sym') !== sym) return;
          var ls = _seriesOf(ir, 'long_short_ratio');
          var lsSvg = _sparkline(ls, 'var(--amber)', 200, 30);
          if (lsSvg) box.insertAdjacentHTML('beforeend', cell('LONG/SHORT · DAILY', lsSvg,
            ls[0].toFixed(2) + ' → ' + ls[ls.length - 1].toFixed(2) + ' long accounts per short', ls.length));
        });
      }
    });
  }

  /* ── Technical events ──────────────────────────────────────────────
     coin_events, written daily by detect_coin_events() and until now read
     only by send-telegram-alerts. Channel subscribers were told when an
     asset crossed its 125-day average or moved past RSI 80; visitors to
     the site were told nothing, from the same table.

     THE WORDING RULES ARE THE ALERT FUNCTION'S, and they are not
     stylistic:

       · The periods are always named. These are 60/125 averages, not the
         classic 50/200, and a reader who assumes the classic misreads
         every line.
       · Every row carries its own date and the word "today" never
         appears. Detection runs at 00:45 UTC against the previous
         completed daily candle, so even the freshest event is from
         yesterday's close — and one coin can carry events from three
         different closes.
       · Each block says what the reading describes and what it does not.
         A cross is past price. An RSI extreme is uncommon, not an
         outcome. Positioning is how accounts are arranged, not what
         price does next.

     Not filtered by anything the visitor owns: a cross is a fact about
     the coin. Same reasoning as the alert function's own note.

     CASUAL NAMES since 2026-09-15, matching the channel: golden / death
     cross, running hot / sold off hard, longs / shorts piling up. The
     three rules above still hold on every row — the periods are in the
     cross label, the date is on every row, and nothing says what price
     does next. */
  function _eventRow(e) {
    var d = e.detail || {};
    var day = e.event_date || '';
    var v = e.value != null ? Number(e.value) : null;
    var pv = e.prev_value != null ? Number(e.prev_value) : null;
    var fast = d.ma_fast_period || 60, slow = d.ma_slow_period || 125;
    var label, body, color, flash = false;

    switch (e.event_type) {
      case 'golden_cross':
      case 'death_cross': {
        var up = e.event_type === 'golden_cross';
        color = up ? 'var(--green)' : 'var(--red)';
        label = (up ? 'Golden cross · ' : 'Death cross · ')
          + fast + 'D ' + (up ? 'above ' : 'below ') + slow + 'D';
        body = (d.ma_fast != null && d.ma_slow != null)
          ? fmtP(Number(d.ma_fast)) + ' vs ' + fmtP(Number(d.ma_slow))
          : 'moving averages crossed';
        break;
      }
      case 'rsi_overbought':
      case 'rsi_oversold': {
        var above = e.event_type === 'rsi_overbought';
        color = above ? 'var(--red)' : 'var(--green)';
        label = above ? 'Running hot · RSI(14) above 80' : 'Sold off hard · RSI(14) below 30';
        body = 'RSI ' + (v != null ? v.toFixed(1) : '—')
          + (pv != null ? ', ' + (above ? 'up' : 'down') + ' from ' + pv.toFixed(1) + ' the day before' : '');
        break;
      }
      /* RSI reclaim (2026-09-23, promptove/59, sql/rsi_reclaim_events.sql):
         back at or above 30 after closes below it. How LONG it was below
         is the whole signal, and it cuts both ways in the backtest
         (promptove/53): 1-2 days beat the market over the next week 53.2%
         of 1,083 times, 11+ days only 31.0% of 58. So the row says which
         kind this is, and only the quick kind flashes. Past results, in
         the past tense, and never what price does next. */
      case 'rsi_reclaim': {
        var nb = d.days_below != null ? Number(d.days_below) : null;
        var nbTxt = nb == null ? '' : nb + (d.days_below_is_floor ? '+' : '') + (nb === 1 ? ' day' : ' days');
        var from = 'RSI ' + (v != null ? v.toFixed(1) : '—')
          + (pv != null ? ', up from ' + pv.toFixed(1) : '');
        if (d.fast) {
          color = 'var(--green)';
          flash = true;
          label = 'Quick RSI reclaim · back above 30 after ' + nbTxt;
          /* The figure comes from ROTATOR_EVIDENCE.rsiReclaim, never
             typed here; without it the row says the direction only. */
          var rq = (typeof ROTATOR_EVIDENCE !== 'undefined' && ROTATOR_EVIDENCE.rsiReclaim) || null;
          body = from + ' · in past data, quick reclaims beat the market over the next '
            + (rq ? (rq.horizonDays === 7 ? 'week ' : rq.horizonDays + ' days ')
                  + Math.round(rq.quick.beatPct) + '% of the time ('
                  + rq.quick.n.toLocaleString('en-US') + ' cases)'
                : 'week more often than not');
        } else if (nb != null && nb <= 5 && !d.days_below_is_floor) {
          color = 'var(--muted)';
          label = 'RSI back above 30 · after ' + nbTxt + ' below';
          body = from + ' · in past data, reclaims this slow did about as well as the market';
        } else {
          color = 'var(--amber)';
          label = 'Slow RSI reclaim · after ' + nbTxt + ' below 30';
          body = from + ' · in past data, reclaims after 6+ days below mostly trailed the market';
        }
        break;
      }
      case 'futures_long_crowded':
      case 'futures_short_crowded': {
        var lng = e.event_type === 'futures_long_crowded';
        color = 'var(--amber)';
        /* Said from the crowded side, like the channel: "3.07 longs per
           short", or "3.33 shorts per long" instead of an opaque 0.30. */
        var per = function(x) { return (x == null || !(x > 0)) ? '—' : (lng ? x : 1 / x).toFixed(2); };
        label = (lng ? 'Longs piling up · ' + per(v) + ' longs per short'
                     : 'Shorts piling up · ' + per(v) + ' shorts per long');
        body = (pv != null ? 'from ' + per(pv) + ' the day before · ' : '') + 'Binance accounts';
        break;
      }
      default:
        color = 'var(--muted)';
        label = String(e.event_type || '').replace(/_/g, ' ');
        body = v != null ? String(v) : '';
    }
    return '<div class="td-ev-row' + (flash ? ' td-ev-flash' : '') + '"><span class="td-ev-dot" style="background:' + color + ';"></span>'
      + '<div class="td-ev-body"><div class="td-ev-lbl">' + label + '</div>'
      + '<div class="td-ev-sub">' + body + ' · ' + day + '</div></div></div>';
  }

  /* ── RSI(14), value now and shape over time ────────────────────────
     The modal had no RSI at all. The lens rail shows the current reading
     and the engine confirms candidate classification against it, but a
     visitor who opened a coin saw neither the number nor its direction.

     TWO SOURCES, ON PURPOSE, and they are not interchangeable:

       coin_technicals       the CURRENT value. Refreshed every 3h and
                             overwritten, so it cannot answer "what was
                             it last week".
       coin_indicator_daily  a once-a-day snapshot at 00:45 UTC, one row
                             per asset per day. The only thing that has
                             yesterday.

     So the number is read from the fresher table and the line from the
     historical one. Using the snapshot for both would show a reading up
     to 24h stale next to a live price.

     The history started on 2026-09-06 and lengthens by one point per day
     with no further work, so the line appears on its own once there are
     enough readings — the same _SPARK_MIN_POINTS floor the derivatives
     sparklines use, and for the same reason. Until then the panel says
     how many days it has, which is a truthful "not yet" rather than an
     empty box. */
  var rsiSec = document.getElementById('td-rsi-sec');
  var rsiEl  = document.getElementById('td-rsi');
  if (rsiSec && rsiEl) {
    var tech = (typeof coinTechnicals !== 'undefined') ? (coinTechnicals[c.sym] || null) : null;
    var rNow = tech && tech.rsiD != null ? Number(tech.rsiD) : null;
    var rWk  = tech && tech.rsiW != null ? Number(tech.rsiW) : null;

    if (rNow == null && rWk == null) {
      rsiSec.style.display = 'none';
    } else {
      /* Bands are the engine's CANDIDATE_RULES.rsi, named here rather
         than re-invented: 30 oversold, 45 the confirmation line, 70
         overbought. A second set of bands on the same number is exactly
         what 2.3.0 removed. */
      var band = function(v) {
        if (v == null) return { t: '—', c: 'var(--muted)' };
        if (v <= 30) return { t: 'oversold',   c: 'var(--green)' };
        if (v <= 45) return { t: 'low',        c: 'var(--green)' };
        if (v <  60) return { t: 'neutral',    c: 'var(--muted)' };
        if (v <  70) return { t: 'elevated',   c: 'var(--amber)' };
        return             { t: 'overbought', c: 'var(--red)' };
      };
      var bD = band(rNow), bW = band(rWk);
      rsiEl.innerHTML =
          '<div class="td-mkt-grid cols-2" style="margin-bottom:0;">'
        + '<div class="td-cell" title="Wilder RSI(14) on daily candles, computed server-side. Compares recent gains with recent losses on a 0-100 scale. It describes what price has already done."><div class="td-cell-l">RSI · DAILY</div><div class="td-cell-v" style="color:' + bD.c + ';">'
          + (rNow != null ? rNow.toFixed(1) : '—') + ' <span style="font-size:10px;font-weight:400;">' + bD.t + '</span></div></div>'
        + '<div class="td-cell" title="Wilder RSI(14) on weekly closes. Slower, so it moves less often than the daily reading."><div class="td-cell-l">RSI · WEEKLY</div><div class="td-cell-v" style="color:' + bW.c + ';">'
          + (rWk != null ? rWk.toFixed(1) : '—') + ' <span style="font-size:10px;font-weight:400;">' + bW.t + '</span></div></div>'
        + '</div>'
        + '<div id="td-rsi-hist" data-sym="' + c.sym + '"></div>';
      rsiSec.style.display = '';

      (function(sym) {
        if (typeof supaLoadIndicatorHistory !== 'function') return;
        supaLoadIndicatorHistory(sym).then(function(rows) {
          var box = document.getElementById('td-rsi-hist');
          if (!box || box.getAttribute('data-sym') !== sym) return;   /* modal moved on */
          var series = _seriesOf(rows, 'rsi14_daily');
          /* The live reading ends the line (promptove/114). The history is
             one snapshot a day and lags the number above it: FOGO showed
             39.6 over a line ending at 32.2. Now the last point IS the
             number above, so the two cannot disagree. */
          if (series.length && rNow != null && Math.abs(series[series.length - 1] - rNow) > 0.05) series.push(rNow);
          var svg = _sparkline(series, 'var(--bnb)', 200, 34);
          if (!svg) {
            box.innerHTML = '<div class="td-hist-note">' + series.length + ' day'
              + (series.length === 1 ? '' : 's') + ' of history recorded so far — the trend line '
              + 'appears at ' + _SPARK_MIN_POINTS + '. One reading is added per day.</div>';
            return;
          }
          /* Two spans, each with its own numbers (promptove/114). First vs
             last over the whole window alone called 2Z "rising" (35.6 →
             38.6) the week it fell from 68.7 to 38.6. A 1-point band
             counts as flat, so day-to-day noise is not called a move. */
          var dirOf = function (a, b) { return b - a > 1 ? 'rising' : a - b > 1 ? 'falling' : 'flat'; };
          var first = series[0], last = series[series.length - 1];
          var wkFirst = series[Math.max(0, series.length - 8)];
          var spanTxt = function (a, b) { return a.toFixed(1) + ' → ' + b.toFixed(1) + ', ' + dirOf(a, b); };
          box.innerHTML = '<div class="td-hist-cell" style="margin-top:10px;">'
            + '<div class="td-cell-l">RSI · DAILY OVER TIME<span style="color:var(--muted);font-weight:400;"> · '
            + series.length + ' days</span></div>' + svg
            + '<div class="td-hist-sub">'
            + (series.length > 8 ? 'Last 7 days: ' + spanTxt(wkFirst, last) + ' · ' + series.length + ' days: ' + spanTxt(first, last)
                                 : series.length + ' days: ' + spanTxt(first, last))
            + '</div></div>';
        });
      })(c.sym);
    }
  }

  var evSec = document.getElementById('td-events-sec');
  var evEl  = document.getElementById('td-events');
  if (evSec && evEl) {
    var evs = (_eventsBySym[c.sym] || []).filter(function (e) {
      /* Crosses are shown in the Insight Engine (Pro), not here, and a hot
         run under Turn signals with its tested record (2026-10-04). */
      return e.event_type !== 'golden_cross' && e.event_type !== 'death_cross' && e.event_type !== 'hot_run';
    });
    if (evs.length) {
      /* Newest first, and capped: one coin crossing three thresholds in a
         week is interesting, twenty rows is a wall. */
      /* A quick RSI reclaim goes first: it is the one row that flashes,
         and a flash below the fold is a flash nobody sees. */
      var quick = function(x) { return x.event_type === 'rsi_reclaim' && x.detail && x.detail.fast ? 1 : 0; };
      evs.sort(function(a, b) {
        return (quick(b) - quick(a)) || String(b.event_date).localeCompare(String(a.event_date));
      });
      var take = evs.slice(0, 6);
      evEl.innerHTML = take.map(_eventRow).join('')
        + (evs.length > take.length
            ? '<div class="td-ev-more">+ ' + (evs.length - take.length) + ' more in the last '
              + (typeof EVENT_WINDOW_DAYS !== 'undefined' ? EVENT_WINDOW_DAYS : 3) + ' days</div>'
            : '')
        /* The 60/125 clarification is only shown when a cross is actually
           on screen. It exists to stop a reader assuming the classic
           50/200, which is a real misreading — but on a coin whose only
           event is an RSI crossing it is noise, and noise in a caption is
           how captions stop being read. */
        + '<div class="td-ev-note">Detected from completed daily candles at 00:45 UTC.'
          + (take.some(function(x) { return /_cross$/.test(x.event_type); })
              ? ' Moving averages are 60-day and 125-day, not the classic 50/200.' : '')
          + ' These describe what price and positioning have already done.</div>';
      evSec.style.display = '';
    } else {
      evSec.style.display = 'none';
    }
  }

  var drvSec = document.getElementById('td-deriv-sec');
  var drvEl  = document.getElementById('td-deriv');
  if (drvSec && drvEl) {
    var f = _futuresBySym[c.sym];
    if (f && f.open_interest_value) {
      var fund = f.funding_rate != null ? Number(f.funding_rate) * 100 : null;  /* % per 8h */
      var oi24 = f.oi_change_24h_pct != null ? Number(f.oi_change_24h_pct) : null;
      var pc24 = f.price_change_pct_24h != null ? Number(f.price_change_pct_24h) : null;

      /* Funding is charged every 8h, so x3 daily x365 makes it tangible.
         Colour marks crowding, not direction: heavy positive = longs are
         paying to stay in, which is what unwinds violently. */
      var fundColor = 'var(--muted)', fundNote = 'Longs and shorts are close to balanced.';
      if (fund != null) {
        var annual = fund * 3 * 365;
        if (fund >= 0.05)       { fundColor = 'var(--red)';   fundNote = 'Longs are paying shorts heavily — crowded long positioning, the setup that unwinds fastest.'; }
        else if (fund >= 0.015) { fundColor = 'var(--amber)'; fundNote = 'Longs are paying shorts — mildly crowded to the upside.'; }
        else if (fund <= -0.015){ fundColor = 'var(--green)'; fundNote = 'Shorts are paying longs — bearish positioning, which can fuel a squeeze.'; }
      }

      /* Price direction x OI direction. Rising OI means new positions
         are being opened; falling OI means existing ones are closing. */
      var posLabel = '—', posColor = 'var(--muted)', posNote = 'Not enough data to read positioning.';
      if (oi24 != null && pc24 != null) {
        if (pc24 >= 0 && oi24 >= 0)      { posLabel = 'NEW MONEY';     posColor = 'var(--green)'; posNote = 'Price up and open interest up — the move is backed by fresh positions rather than short covering.'; }
        else if (pc24 >= 0 && oi24 < 0)  { posLabel = 'SHORT COVERING';posColor = 'var(--amber)'; posNote = 'Price up while open interest falls — this rally is shorts closing out, which tends to be less durable than new buying.'; }
        else if (pc24 < 0 && oi24 >= 0)  { posLabel = 'NEW SHORTS';    posColor = 'var(--red)';   posNote = 'Price down and open interest up — traders are actively opening shorts, not just exiting longs.'; }
        else                             { posLabel = 'UNWINDING';     posColor = 'var(--muted)'; posNote = 'Price down and open interest down — positions are being flushed out rather than new bets placed.'; }
      }

      var oiColor = oi24 == null ? 'var(--muted)' : (oi24 >= 0 ? 'var(--green)' : 'var(--red)');
      var ageNote = f.detail_updated_at
        ? ' Updated ' + Math.round((Date.now() - Date.parse(f.detail_updated_at)) / 60000) + ' min ago.'
        : '';

      /* ── Fields that were stored and read by nothing until 2026-09-16 ──
         All descriptive, all outside the score, same as the four above. */

      /* OI over 1h. Sits beside OI 24H because the pair is the reading:
         24h up with 1h down is a position build that has started to
         come off, which neither number says alone. */
      var oi1h = f.oi_change_1h_pct != null ? Number(f.oi_change_1h_pct) : null;
      var oi1hColor = oi1h == null ? 'var(--muted)' : (oi1h >= 0 ? 'var(--green)' : 'var(--red)');

      /* Aggressive flow: taker buys vs taker sells, i.e. who is crossing
         the spread rather than resting orders. Labelled by rank in the
         universe, not against 1.0 — see _futuresPercentile(). */
      var taker = f.taker_buy_sell_ratio != null ? Number(f.taker_buy_sell_ratio) : null;
      var takerP = _futuresPercentile(function(r) {
        return r.taker_buy_sell_ratio != null ? Number(r.taker_buy_sell_ratio) : null;
      }, taker);
      var takerLabel = '—', takerColor = 'var(--muted)';
      var takerNote = 'Ratio of aggressive (taker) buying to aggressive selling.';
      if (taker != null) {
        takerLabel = taker.toFixed(2);
        if (takerP) {
          /* Same two bars as the turn sign in coin-reading.js: top or
             bottom 15% AND at least 1.2 to 1 one way. */
          if (takerP.pct >= 0.85 && taker >= 1.2)          { takerColor = 'var(--green)'; takerNote = 'Buyers are stepping in: in the last hour, traders buying at the market price traded ' + taker.toFixed(2) + '× as much as those selling.'; }
          else if (takerP.pct <= 0.15 && taker <= 1 / 1.2) { takerColor = 'var(--red)';   takerNote = 'Sellers are stepping in: in the last hour, traders selling at the market price traded ' + (1 / taker).toFixed(2) + '× as much as those buying.'; }
          else                                              { takerNote = 'Market buying and selling are not unusual for this coin compared with the rest of the market in the last hour.'; }
          takerNote += ' Ranked against ' + takerP.n + ' perpetuals, median '
                    + takerP.median.toFixed(2) + '. Source: Binance futures, last hour.';
        } else {
          takerNote += ' Not enough peers loaded to rank it, so it is shown unlabelled.';
        }
      }

      /* Perp basis: mark vs the spot index the perp settles against.
         Both halves were stored; their difference is the whole point of
         storing them. Premium = perp trading above spot. */
      var mark = f.mark_price  != null ? Number(f.mark_price)  : null;
      var indx = f.index_price != null ? Number(f.index_price) : null;
      var basis = (mark != null && indx) ? ((mark - indx) / indx) * 100 : null;
      var basisP = _futuresPercentile(function(r) {
        var m = r.mark_price != null ? Number(r.mark_price) : null;
        var x = r.index_price != null ? Number(r.index_price) : null;
        return (m != null && x) ? ((m - x) / x) * 100 : null;
      }, basis);
      var basisColor = 'var(--muted)';
      var basisNote = 'How far the perpetual trades from the spot index it settles against. Premium means the perp is above spot.';
      if (basis != null && basisP) {
        if (basisP.pct >= 0.90)      { basisColor = 'var(--green)'; basisNote = 'The perp trades at a premium to spot that is wide compared with the rest of the market — leveraged longs are paying up.'; }
        else if (basisP.pct <= 0.10) { basisColor = 'var(--red)';   basisNote = 'The perp trades at a discount to spot that is wide compared with the rest of the market — leveraged shorts are paying up.'; }
        basisNote += ' Ranked against ' + basisP.n + ' perpetuals, median '
                  + basisP.median.toFixed(3) + '% — most of the market sits slightly below spot, so 0 is not the neutral point.';
      }

      /* Countdown to the next funding charge. Computed at render, so it
         is right when the modal opens; it does not tick afterwards. */
      var nextFund = f.next_funding_time ? Date.parse(f.next_funding_time) : null;
      var fundIn = '—';
      if (nextFund && isFinite(nextFund)) {
        var mins = Math.round((nextFund - Date.now()) / 60000);
        /* Negative means the stored timestamp is behind — the row is
           stale rather than funding being overdue. Say so, don't print
           a negative countdown. */
        fundIn = mins < 0 ? 'stale' : (mins >= 60 ? Math.floor(mins / 60) + 'h ' + (mins % 60) + 'm' : mins + 'm');
      }

      /* How long this perpetual has existed. Short-dated contracts have
         thin open-interest history, which is why some sparklines below
         are stubs — worth saying rather than leaving the reader to
         wonder. */
      var onboard = f.onboard_date ? Date.parse(f.onboard_date) : null;
      var perpAge = '—', perpAgeNote = 'When Binance listed this perpetual.';
      if (onboard && isFinite(onboard)) {
        var days = Math.floor((Date.now() - onboard) / 86400000);
        perpAge = days < 90 ? days + 'd' : (days / 365).toFixed(1) + 'y';
        if (days < 90) perpAgeNote += ' Listed recently, so its open-interest history is short and the trend below is thin.';
      }

      drvEl.innerHTML =
         '<div class="td-cell" title="' + fundNote + ' Shown per 8h funding interval'
           + (fund != null ? '; roughly ' + (fund * 3 * 365).toFixed(1) + '% annualised' : '')
           + '. Not part of the score."><div class="td-cell-l">FUNDING</div><div class="td-cell-v" style="color:' + fundColor + ';">'
           + (fund != null ? (fund >= 0 ? '+' : '') + fund.toFixed(4) + '%' : '—') + '</div></div>'
        + '<div class="td-cell" title="Total value of open perpetual positions on Binance.' + ageNote
           + '"><div class="td-cell-l">OPEN INTEREST</div><div class="td-cell-v bnb">' + fmtVol(Number(f.open_interest_value)) + '</div></div>'
        + '<div class="td-cell" title="Change in open interest over 24h. Rising means positions are being opened, falling means they are closing."><div class="td-cell-l">OI 24H</div><div class="td-cell-v" style="color:' + oiColor + ';">'
           + (oi24 != null ? (oi24 >= 0 ? '+' : '') + oi24.toFixed(1) + '%' : '—') + '</div></div>'
        + '<div class="td-cell" title="' + posNote + ' Derived from price direction versus open-interest direction over 24h. Descriptive only — it does not affect the score."><div class="td-cell-l">POSITIONING</div><div class="td-cell-v" style="color:' + posColor + ';">'
           + posLabel + '</div></div>'
        /* ── The six that were stored and displayed nowhere ── */
        + '<div class="td-cell" title="Change in open interest over the last hour. Read it against OI 24H: a 24h build with a 1h fall is a position that has started coming off."><div class="td-cell-l">OI 1H</div><div class="td-cell-v" style="color:' + oi1hColor + ';">'
           + (oi1h != null ? (oi1h >= 0 ? '+' : '') + oi1h.toFixed(1) + '%' : '—') + '</div></div>'
        + '<div class="td-cell" title="' + _esc(takerNote) + ' Not part of the score."><div class="td-cell-l">TAKER FLOW</div><div class="td-cell-v" style="color:' + takerColor + ';">'
           + takerLabel + '</div></div>'
        + '<div class="td-cell" title="' + _esc(basisNote) + ' Not part of the score."><div class="td-cell-l">BASIS</div><div class="td-cell-v" style="color:' + basisColor + ';">'
           + (basis != null ? (basis >= 0 ? '+' : '') + basis.toFixed(3) + '%' : '—') + '</div></div>'
        + '<div class="td-cell" title="Time until the next funding payment is charged. Calculated when this modal opened — it does not count down."><div class="td-cell-l">NEXT FUNDING</div><div class="td-cell-v bnb">'
           + fundIn + '</div></div>'
        + '<div class="td-cell" title="' + _esc(perpAgeNote) + '"><div class="td-cell-l">PERP AGE</div><div class="td-cell-v bnb">'
           + perpAge + '</div></div>';
      /* 3 across — the section went from 4 readings to 9, and 2 columns
         made a tall thin stack of it. Matches the market grid above. */
      drvEl.style.gridTemplateColumns = 'repeat(3,1fr)';
      drvSec.style.display = '';

      /* History below the current readings. data-sym guards against a
         late response landing in a modal the visitor has already
         navigated away from. */
      var histBox = document.getElementById('td-deriv-hist');
      if (histBox) {
        histBox.setAttribute('data-sym', c.sym);
        histBox.innerHTML = '';
        _renderDerivHistory(c.sym, f.symbol);
      }
    } else {
      drvSec.style.display = 'none';   /* no perpetual for this coin */
    }
  }

  var liqSec = document.getElementById('td-liquidity-sec');
  var liqEl  = document.getElementById('td-liquidity');
  if (liqSec && liqEl) {
    var vol = c.volume24 || c.total_volume || null;
    var mc  = c.mcap || null;
    if (vol != null && mc && mc > 0) {
      var ratio = (vol / mc) * 100;
      var liqLabel, liqColor, liqNote;
      if (ratio >= 8)      { liqLabel = 'HEALTHY';    liqColor = 'var(--green)'; liqNote = 'Plenty of daily turnover relative to size — exiting a normal position should not move the price much.'; }
      else if (ratio >= 2) { liqLabel = 'MODERATE';   liqColor = 'var(--amber)'; liqNote = 'Workable liquidity, but a large order could move the price.'; }
      else                 { liqLabel = 'THIN ⚠';     liqColor = 'var(--red)';   liqNote = 'Low turnover relative to market cap — exiting even a modest position may be difficult without moving the price against yourself.'; }
      liqEl.innerHTML =
        '<div class="td-cell"><div class="td-cell-l">24H VOL / MCAP</div><div class="td-cell-v" style="color:'+liqColor+';">'+ratio.toFixed(2)+'%</div></div>'
        +'<div class="td-cell" title="'+liqNote+' Heuristic thresholds (8%+ / 2-8% / under 2%), not a precise scientific boundary. The order book is where the real depth shows.">'
        +'<div class="td-cell-l">ASSESSMENT</div><div class="td-cell-v" style="color:'+liqColor+';">'+liqLabel+'</div></div>';
      liqEl.style.gridTemplateColumns = 'repeat(2,1fr)';
      liqSec.style.display = '';
    } else {
      liqSec.style.display = 'none';
    }
  }

  /* Market data: mkt cap, vol, rank, ATH distance, 7D, 30D */
  var vol24 = c.volume24 || c.total_volume || null;
  var athPct = c.ath_change_pct || 0;
  var athC   = athPct >= 0 ? 'up' : 'dn';
  /* bStocks: the cap shown is the UNDERLYING COMPANY's, which is a
     different quantity from a token's market cap, so it is labelled
     differently rather than dropped into the same cell silently. It is
     read from equityMcap, never from `mcap` — see loadBstocks(). MC
     RANK is a rank within the crypto universe, so it has no meaning for
     an equity and shows a dash instead of a number that looks real. */
  var capLabel = c.isStock ? 'CO. MKT CAP' : 'MKT CAP';
  var capValue = c.isStock ? c.equityMcap : c.mcap;
  var capHint  = c.isStock
    ? ' title="The listed company&#39;s market capitalisation (share price × shares outstanding), as published by Binance. Not the size of the tokenized market on Binance, and not used in scoring."'
    : '';
  document.getElementById('td-market').innerHTML =
    '<div class="td-cell"'+capHint+'><div class="td-cell-l">'+capLabel+'</div><div class="td-cell-v bnb">'+fmtMcap(capValue)+'</div></div>'
    +'<div class="td-cell"><div class="td-cell-l">24H VOL</div><div class="td-cell-v bnb">'+fmtVol(vol24)+'</div></div>'
    +'<div class="td-cell"><div class="td-cell-l">MC RANK</div><div class="td-cell-v bnb">'+(c.isStock ? '—' : (c.rank?'#'+c.rank:'—'))+'</div></div>'
    +'<div class="td-cell"><div class="td-cell-l">7D</div><div class="td-cell-v '+(c.p7>=0?'up':'dn')+'">'+(c.p7>=0?'+':'')+c.p7.toFixed(2)+'%</div></div>'
    +'<div class="td-cell"><div class="td-cell-l">14D</div><div class="td-cell-v '+(c.p14>=0?'up':'dn')+'">'+(c.p14>=0?'+':'')+c.p14.toFixed(2)+'%</div></div>'
    +'<div class="td-cell"><div class="td-cell-l">30D</div><div class="td-cell-v '+(c.p30>=0?'up':'dn')+'">'+(c.p30>=0?'+':'')+c.p30.toFixed(2)+'%</div></div>'
    /* Binance's own category tags (binance_symbol_tags). Loaded for the
       category tabs and never shown on the coin itself (promptove/67).
       "Seed" in particular is Binance saying the coin is higher-risk. */
    + ((typeof binanceTags !== 'undefined' && Array.isArray(binanceTags[c.sym]) && binanceTags[c.sym].length)
        ? '<div class="td-cell" style="grid-column:1/-1;" title="Binance&#39;s own category tags for this coin. Seed marks projects Binance treats as higher volatility and risk."><div class="td-cell-l">BINANCE TAGS</div><div class="td-cell-v" style="font-size:12px;font-weight:500;">'
          + binanceTags[c.sym].map(function(t) {
              /* Binance's raw names: "Layer1_Layer2", "newListing". */
              return _esc(t === 'newListing' ? 'New listing' : String(t).replace(/_/g, ' / '));
            }).join(' · ') + '</div></div>'
        : '');
  /* override grid to 3 cols */
  document.getElementById('td-market').style.gridTemplateColumns = 'repeat(3,1fr)';

  /* Supply section */
  var supSec = document.getElementById('td-supply-sec');
  var supEl  = document.getElementById('td-supply');
  if (supSec && supEl) {
    var circ = c.circulating_supply;
    var maxS = c.max_supply;
    /* Mirrors the engine's _supplyBasis() (2.6.0): max when present,
       total otherwise. DISPLAY ONLY — it re-derives nothing the score
       used, it just stops the modal saying "∞" for a coin the score
       read at 52%. `supBasis` labels which figure it is, because
       "% of max" and "% of what exists" are different statements. */
    var totS = c.total_supply;
    var supPct = null, supBasis = '';
    if (circ && maxS && maxS > 0)      { supPct = Math.round((circ / maxS) * 100); supBasis = 'of max'; }
    else if (circ && totS && totS > 0) { supPct = Math.round((circ / totS) * 100); supBasis = 'of total'; }
    var supPctStr = supPct !== null ? supPct + '%' : '∞';
    var supCol = supPct !== null ? (supPct >= 90 ? 'var(--red)' : supPct >= 70 ? 'var(--amber)' : 'var(--green)') : 'var(--muted)';
    function fmtSup(n) {
      if (!n) return '—';
      if (n >= 1e9) return (n/1e9).toFixed(2) + 'B';
      if (n >= 1e6) return (n/1e6).toFixed(2) + 'M';
      if (n >= 1e3) return (n/1e3).toFixed(1) + 'K';
      return n.toFixed(0);
    }
    supEl.innerHTML =
      '<div class="td-cell"><div class="td-cell-l">CIRCULATING</div><div class="td-cell-v bnb">'+fmtSup(circ)+'</div></div>'
      +'<div class="td-cell"><div class="td-cell-l">MAX SUPPLY</div><div class="td-cell-v bnb">'+(maxS ? fmtSup(maxS) : '∞ / No max')+'</div></div>'
      +'<div class="td-cell"><div class="td-cell-l">% UNLOCKED'+(supBasis ? ' ('+supBasis+')' : '')+'</div><div class="td-cell-v" style="color:'+supCol+';">'+supPctStr+'</div></div>'
      +'<div class="td-cell"><div class="td-cell-l">FROM ATH</div><div class="td-cell-v '+(athPct>=0?'up':'dn')+'">'+(athPct>=0?'+':'')+athPct.toFixed(1)+'%</div></div>'
      + _tdUnlockCell(c);
    supEl.style.gridTemplateColumns = 'repeat(2,1fr)';
    supSec.style.display = '';
  }

  /* Market Cycle section — only for the 6 assets sync-market-cycle
     tracks (BTC/ETH/BNB/SOL/XRP/PAXG). Hidden entirely for every other
     coin, since there's no real MA200 data for them — showing nothing
     is honest, showing a fabricated number wouldn't be. */
  var cycleSec = document.getElementById('td-cycle-sec');
  var cycleEl  = document.getElementById('td-cycle');
  var cycleRow = (typeof marketCycleData !== 'undefined') ? marketCycleData[c.sym] : null;
  if (cycleSec && cycleEl && cycleRow && cycleRow.mayer_multiple != null) {
    var mm = cycleRow.mayer_multiple;
    var isBTC = c.sym === 'BTC';
    var label = null, labelC = 'var(--muted)';
    if (isBTC) {
      /* Only BTC has historically-calibrated bands — see _btcCycleLabel()
         in data-loaders.js. Everything else stays a raw ratio, no label. */
      var cl = (typeof _btcCycleLabel === 'function') ? _btcCycleLabel() : null;
      if (cl === 'stretched') { label = 'STRETCHED'; labelC = 'var(--red)'; }
      else if (cl === 'oversold') { label = 'OVERSOLD'; labelC = 'var(--green)'; }
      else if (cl === 'neutral') { label = 'NEUTRAL'; labelC = 'var(--muted)'; }
    }
    var mmColor = mm >= 1 ? 'up' : 'dn';
    cycleEl.innerHTML =
      '<div class="td-cell"><div class="td-cell-l">MAYER MULTIPLE</div><div class="td-cell-v '+mmColor+'">'+mm.toFixed(3)+'×</div></div>'
      +'<div class="td-cell"><div class="td-cell-l">200D AVG</div><div class="td-cell-v bnb">'+fmtP(cycleRow.ma200)+'</div></div>'
      + (label
        ? '<div class="td-cell"><div class="td-cell-l">CYCLE STATE</div><div class="td-cell-v" style="color:'+labelC+';">'+label+'</div></div>'
        : isBTC
          ? '<div class="td-cell"><div class="td-cell-l">CYCLE STATE</div><div class="td-cell-v" style="color:var(--muted);">—</div></div>'
          : '<div class="td-cell"><div class="td-cell-l">CYCLE STATE</div><div class="td-cell-v" style="color:var(--muted);font-size:12px;" title="No historically-calibrated stretched/oversold bands exist for '+c.sym+' yet. Only Bitcoin Mayer Multiple has been validated against its own multi-year history.">n/a for '+c.sym+'</div></div>');
    cycleEl.style.gridTemplateColumns = 'repeat(3,1fr)';
    cycleSec.style.display = '';
  } else if (cycleSec) {
    cycleSec.style.display = 'none';
  }

  renderRotationContext(c);

  /* Insight Engine section — the coin window's ONE Pro section (Daniel,
     2026-10-04). Pro: the insight score for coins you hold or watch, and
     the golden / death cross tile on every crypto coin. Free: one unlock,
     on every coin (the 24h-delayed snapshot for tracked coins stays). */
  var insSec = document.getElementById('td-insight-sec');
  var insEl  = document.getElementById('td-insight-content');
  var crossTile = isPro ? _tdCrossTile(c) : '';
  var unlockTile = isPro ? _tdUnlockTile(c) : '';
  if (insSec && insEl) {
    /* Identity via the shared helpers, so a ticker shared by two coins
       cannot unlock one coin's Insight section from the other. */
    var isTracked = ((typeof isHeldCoin === 'function') && isHeldCoin(c))
                 || ((typeof isWatchedCoin === 'function') && isWatchedCoin(c));
    /* Free user: try yesterday's server snapshot. Falls back to the
       old paywall if the snapshot service is offline or empty. */
    var yi = (window.yesterdayInsights && window.yesterdayInsights.map)
              ? window.yesterdayInsights.map[c.id] : null;
    if (!isPro && isTracked && yi && yi.insight) {
      var ydate = window.yesterdayInsights.date || '';
      var ins = yi.insight;
      /* Server data, but escaped anyway (promptove/108): this row used to
         be writable by any browser, and it is put on the page as HTML. */
      var insCls = /^insight-(buy|neut|warn)$/.test(ins.color || '') ? ins.color : 'insight-neut';
      var sc = typeof ins.score === 'number' ? ins.score : 0;
      var scColor = sc >= 65 ? 'var(--green)' : sc <= 35 ? 'var(--red)' : '#87CEEB';
      var dlHtml = '<div class="td-delayed-banner">'
        + '<span class="td-delayed-tag">24H DELAYED</span>'
        + '<span class="td-delayed-sub">Snapshot from ' + _esc(ydate) + ' · Pro sees today\'s live</span>'
        + '</div>'
        + '<div class="td-insight-header">'
        + '<div class="insight-pulse ' + insCls + ' td-insight-pulse"><span class="insight-dot"></span><span class="insight-lbl">' + _esc(ins.label || '—') + '</span></div>'
        + '<span class="td-insight-score" style="color:' + scColor + ';">' + sc + '<span style="font-size:12px;color:var(--muted);"> / 100</span></span>'
        + '</div>';
      if (Array.isArray(ins.signals) && ins.signals.length) {
        dlHtml += '<div class="signal-tile-grid">';
        ins.signals.forEach(function(s) {
          s = String(s == null ? '' : s);
          var cls = 'neutral';
          if (s.indexOf('Oversold') >= 0 || s.indexOf('Accumulation') >= 0 || s.indexOf('Hidden Strength') >= 0 || s.indexOf('Cleared') >= 0 || s.indexOf('Extreme Fear') >= 0 || s.indexOf('Outperforming') >= 0 || s.indexOf('Bullish Cross') >= 0 || s.indexOf('MACD Above') >= 0 || s.indexOf('Accelerating') >= 0 || s.indexOf('Recovery') >= 0) cls = 'good';   /* BB Squeeze left neutral: it says nothing about direction (promptove/75) */
          else if (s.indexOf('Overbought') >= 0 || s.indexOf('Dilution') >= 0 || s.indexOf('Greed') >= 0 || s.indexOf('Underperforming') >= 0 || s.indexOf('Low Liquidity') >= 0 || s.indexOf('Bearish Cross') >= 0 || s.indexOf('MACD Below') >= 0 || s.indexOf('Decelerating') >= 0 || s.indexOf('Weakening') >= 0) cls = 'bad';
          var icon = cls === 'good' ? '✓' : cls === 'bad' ? '−' : '—';
          var hlCls = cls === 'good' ? ' highlight-good' : cls === 'bad' ? ' highlight-bad' : '';
          dlHtml += '<div class="signal-tile' + hlCls + '">'
            + '<span class="tile-icon ' + cls + '">' + icon + '</span>'
            + '<div class="tile-body"><span class="tile-value ' + cls + '">' + _esc(s) + '</span></div></div>';
        });
        dlHtml += '</div>';
      }
      dlHtml += '<div class="td-delayed-cta">'
        + '<div class="td-delayed-cta-txt">Today\'s insight, with unlock dates and golden and death cross timing, is live for Pro users.</div>'
        + '<button class="code-btn" onclick="openPro()" style="font-size:12px;padding:6px 14px;">⚡ UNLOCK TODAY\'S SIGNAL</button>'
        + '</div>';
      insEl.innerHTML = dlHtml;
      insSec.style.display = '';
    } else if (!isPro && !c.isStable) {
      insEl.innerHTML = '<div style="text-align:center;padding:10px 0;">'
        + '<div style="font-size:12px;color:var(--muted);margin-bottom:6px;">The Insight Engine is Pro: the full insight score, unlock amounts and dates, and golden and death cross timing. Free with 5 invites or a code.</div>'
        + '<button class="code-btn" onclick="openPro()" style="font-size:12px;padding:6px 14px;">⚡ UNLOCK PRO</button>'
        + '</div>';
      insSec.style.display = '';
    } else if (isTracked && c.insight) {
      var ins = c.insight;
      var insHtml = '<div class="td-insight-header">'
        + '<div class="insight-pulse ' + ins.color + ' td-insight-pulse"><span class="insight-dot"></span><span class="insight-lbl">' + ins.label + '</span></div>'
        + '<span class="td-insight-score" style="color:' + scoreColor(ins.score) + ';">' + ins.score + '<span style="font-size:12px;color:var(--muted);"> / 100</span></span>'
        + '</div>';
      if (ins.signals && ins.signals.length) {
        insHtml += '<div class="signal-tile-grid">';
        ins.signals.forEach(function(s) {
          var cls = 'neutral';
          if (s.indexOf('Oversold') >= 0 || s.indexOf('Accumulation') >= 0 || s.indexOf('Hidden Strength') >= 0 || s.indexOf('Cleared') >= 0 || s.indexOf('Extreme Fear') >= 0 || s.indexOf('Outperforming') >= 0 || s.indexOf('Bullish Cross') >= 0 || s.indexOf('MACD Above') >= 0 || s.indexOf('Accelerating') >= 0 || s.indexOf('Recovery') >= 0) cls = 'good';   /* BB Squeeze left neutral: it says nothing about direction (promptove/75) */
          else if (s.indexOf('Overbought') >= 0 || s.indexOf('Dilution') >= 0 || s.indexOf('Greed') >= 0 || s.indexOf('Underperforming') >= 0 || s.indexOf('Low Liquidity') >= 0 || s.indexOf('Bearish Cross') >= 0 || s.indexOf('MACD Below') >= 0 || s.indexOf('Decelerating') >= 0 || s.indexOf('Weakening') >= 0) cls = 'bad';
          var icon = cls === 'good' ? '✓' : cls === 'bad' ? '−' : '—';
          var hlCls = cls === 'good' ? ' highlight-good' : cls === 'bad' ? ' highlight-bad' : '';
          insHtml += '<div class="signal-tile' + hlCls + '">'
            + '<span class="tile-icon ' + cls + '">' + icon + '</span>'
            + '<div class="tile-body"><span class="tile-value ' + cls + '">' + s + '</span></div></div>';
        });
        insHtml += '</div>';
      }
      /* No reading is shown as an em-dash, not as 50/Neutral — the
         display must not invent a sentiment the engine refused to use. */
      var fgVal = (window.fearGreed && typeof window.fearGreed.value === 'number')
        ? window.fearGreed.value : null;
      var fgLbl = (window.fearGreed && window.fearGreed.label) || '—';
      var fgGood = fgVal <= 40;
      var fgBad  = fgVal >= 75;
      var fgCls  = fgGood ? 'good' : fgBad ? 'bad' : 'neutral';
      var fgIcon = fgGood ? '✓' : fgBad ? '−' : '—';
      var fgHl   = fgGood ? ' highlight-good' : fgBad ? ' highlight-bad' : '';
      insHtml += '<div class="signal-tile' + fgHl + '" style="margin-top:2px;">'
        + '<span class="tile-icon ' + fgCls + '">' + fgIcon + '</span>'
        + '<div class="tile-body"><span class="tile-label">FEAR & GREED INDEX</span>'
        + '<span class="tile-value ' + fgCls + '">' + fgVal + ' — ' + fgLbl + '</span></div></div>';
      insEl.innerHTML = insHtml + _tdVolumeTile(c) + unlockTile + crossTile;
      insSec.style.display = '';
      if (document.getElementById('td-vol-days')) _tdLoadVolumeDays(c.sym);
    } else if (isPro && (crossTile || unlockTile)) {
      /* A coin you do not hold or watch: the unlock schedule and the
         cross are still shown. */
      insEl.innerHTML = unlockTile + crossTile
        + '<div class="td-ins-note">The full insight score shows for coins you hold or watch.</div>';
      insSec.style.display = '';
    } else {
      insSec.style.display = 'none';
    }
    /* Open the section when there is a fresh cross to see. */
    var insDet = insSec.querySelector('details');
    var tNow = (typeof coinTechnicals !== 'undefined') && coinTechnicals[c.sym];
    if (insDet) insDet.open = !!(isPro && tNow && tNow.cross && tNow.crossDays != null);
  }

  /* Edit Holdings section — show only for held coins */
  var editSec = document.getElementById('td-edit-hold-sec');
  if (editSec) {
    var hIdx = holdings.findIndex(function(h) { return holdingMatches(h, c); });
    if (hIdx >= 0) {
      editSec.style.display = '';
      var h = holdings[hIdx];
      document.getElementById('td-hold-avg').value = h.avg || '';
      document.getElementById('td-hold-qty').value = h.qty || '';
    } else {
      editSec.style.display = 'none';
    }
  }

  /* Warnings, the reading and the turn signals at the top (coin-reading.js). */
  if (typeof renderCoinReading === 'function') renderCoinReading(c);

  _positionPanel(panel, evt);
}

/* Save edited holdings from tile detail panel */
function saveTileHolding() {
  if (!_tdCoin) return;
  var avg = parseFloat(document.getElementById('td-hold-avg').value) || null;
  var qty = parseFloat(document.getElementById('td-hold-qty').value) || null;
  var idx = holdings.findIndex(function(h) { return holdingMatches(h, _tdCoin); });
  if (idx >= 0) {
    holdings[idx].avg = avg;
    holdings[idx].qty = qty;
    saveH();
    renderAll();
    /* Flash save button green */
    var btn = document.getElementById('td-hold-save');
    if (btn) { btn.textContent = '✓ SAVED'; setTimeout(function() { btn.textContent = 'SAVE'; }, 1500); }
  }
}

function closeTileDetail() {
  var p = document.getElementById('td-panel');
  var o = document.getElementById('td-overlay');
  if (p) p.style.display = 'none';
  if (o) o.classList.remove('show');
  _tdCoin = null;
}

/* ── Deep link: open coin detail from ?coin= URL param ──────── */
var _pendingDeepLinkCoin = null;

/* Call early to capture param before anything cleans the URL */
(function() {
  try {
    var params = new URLSearchParams(window.location.search);
    var coinParam = params.get('coin');
    if (coinParam) _pendingDeepLinkCoin = coinParam;
  } catch(e) {}
})();

function _handleCoinDeepLink() {
  if (!_pendingDeepLinkCoin) return;
  var coinParam = _pendingDeepLinkCoin;
  _pendingDeepLinkCoin = null;
  try {
    /* Clean URL without reloading */
    var params = new URLSearchParams(window.location.search);
    params.delete('coin');
    var remaining = params.toString();
    var cleanUrl = window.location.pathname + (remaining ? '?' + remaining : '');
    window.history.replaceState({}, '', cleanUrl);
    /* Find coin by symbol (case insensitive) or ID */
    var sym = coinParam.toUpperCase();
    var c = coins.find(function(x) {
      return x.sym === sym || x.id === coinParam.toLowerCase();
    });
    if (c) {
      /* Delay enough for tutorial/consent overlays to settle */
      setTimeout(function() {
        /* Dismiss tutorial if it's active so the panel is visible */
        if (typeof dismissTutorial === 'function') {
          try { dismissTutorial(); } catch(e) {}
        }
        openTileDetail(c.id);
      }, 800);
    }
  } catch(e) { console.warn('Deep link error:', e); }
}

/* ── Share tile insight ─────────────────────────────────────── */
function _shareText() {
  var sym  = (document.getElementById('td-sym')  || {}).textContent || '';
  var name = (document.getElementById('td-name') || {}).textContent || '';
  var prc  = (document.getElementById('td-price')|| {}).textContent || '';
  var chg  = (document.getElementById('td-price-chg') || {}).textContent || '';
  var scoreEl = document.querySelector('#td-score-bars span');
  var score = scoreEl ? scoreEl.textContent.trim() : '';
  /* The reading and its signs, since the badges are gone (2026-10-04). */
  var R = (typeof coinReading === 'function' && _tdCoin) ? coinReading(_tdCoin) : null;
  var signals = R ? [R.head] : [];
  var arrow = chg.indexOf('+') === 0 ? '▲' : chg.indexOf('-') === 0 || chg.indexOf('−') === 0 ? '▼' : '◆';
  var coinUrl = 'https://rotatortool-official.github.io?coin=' + encodeURIComponent(sym);
  var text = '━━━━━━━━━━━━━━━━\n'
    + '📊  ' + sym + '  ·  ' + prc + '\n'
    + arrow + ' ' + chg + '  ';
  if (score) text += '·  Score: ' + score + '/100';
  text += '\n';
  if (signals.length) text += '⚡ ' + signals.join(' · ') + '\n';
  text += '━━━━━━━━━━━━━━━━\n'
    + '🔍 Full analysis → ' + coinUrl + '\n'
    + 'Rotator — an honest market pulse for Binance traders';
  return { sym: sym, text: text, url: coinUrl };
}

function _copyToClip(text, btn) {
  function done() {
    if (!btn) return;
    var orig = btn.innerHTML;
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg><span>Copied!</span>';
    btn.classList.add('copied');
    setTimeout(function(){ btn.innerHTML = orig; btn.classList.remove('copied'); }, 2000);
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done);
  } else {
    var ta = document.createElement('textarea');
    ta.value = text; ta.style.cssText = 'position:fixed;left:-9999px;';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch(e){}
    document.body.removeChild(ta); done();
  }
}

function shareTo(platform) {
  var d = _shareText();
  var enc = encodeURIComponent(d.text);
  var encUrl = encodeURIComponent(d.url);
  var btn = event && event.currentTarget;

  switch (platform) {
    case 'copy':
      _copyToClip(d.text, btn);
      return;
    case 'x':
      window.open('https://x.com/intent/tweet?text=' + enc, '_blank', 'width=550,height=420');
      break;
    case 'telegram':
      window.open('https://t.me/share/url?url=' + encUrl + '&text=' + enc, '_blank', 'width=550,height=420');
      break;
    case 'whatsapp':
      window.open('https://wa.me/?text=' + enc, '_blank', 'width=550,height=420');
      break;
    case 'discord':
      _copyToClip(d.text, btn);
      return;
    case 'messenger':
      window.open('https://www.facebook.com/dialog/send?link=' + encUrl + '&app_id=966242223397117&redirect_uri=' + encUrl, '_blank', 'width=550,height=420');
      break;
    case 'reddit':
      window.open('https://www.reddit.com/submit?title=' + encodeURIComponent('📊 ' + d.sym + ' — Rotator Insight') + '&url=' + encUrl, '_blank', 'width=800,height=600');
      break;
    case 'threads':
      window.open('https://www.threads.net/intent/post?text=' + enc, '_blank', 'width=550,height=420');
      break;
  }
}

/* ══════════════════════════════════════════════════════════════════
   SHARE CARD #1 — COIN / HOLDINGS share card (canvas image generator)
   ──────────────────────────────────────────────────────────────────
   File:     js/data-loaders.js
   Function: shareAsImage()
   Trigger:  "SNAPSHOT & SHARE" button in the coin detail modal
   Context:  Leaderboard / Holdings / Watchlist — any coin tile detail
   Card:     1200×630 (OG-compatible) — shows:
               • Coin symbol, name, price, 24H change
               • Score circle (X / 100) with colored arc
               • Signal badges (STRONG MOM, 7D BREAKOUT, etc.)
               • Market data boxes (MKT CAP, VOL, etc.)
               • CTA hook + ROTATOR branding + referral URL
   Modal:    Reuses viral-share-modal (#viral-share-modal)
   Related:  _viralCopyTemplates[], _getViralCopyData(), _updateViralCopy()

   ⚠ There is a SECOND share card for the Swap Calculator — see:
      js/ratio.js → shareSwapCard()
══════════════════════════════════════════════════════════════════ */
function shareAsImage() {
  if (!_tdCoin) return;
  var c = _tdCoin;
  if (window.Analytics) Analytics.track('Share', { source: 'coin-detail', coin: c.symbol || c.sym || '' });

  /* ── Gather visible data from the detail panel ── */
  var sym   = (document.getElementById('td-sym')  || {}).textContent || c.sym || '';
  var name  = (document.getElementById('td-name') || {}).textContent || c.name || '';
  var price = (document.getElementById('td-price')|| {}).textContent || '';
  var chg   = (document.getElementById('td-price-chg') || {}).textContent || '';
  /* The score moved out of #td-score-bars into #td-score-num when the
     reserved big-number column was finally filled. Both share paths read
     it from the DOM, and both had a fallback, so this would have kept
     working off the fallback and nobody would have noticed the selector
     had gone dead. Pointed at where the number actually is. */
  var scoreEl = document.querySelector('#td-score-num .td-score-num-val');
  var score   = scoreEl ? scoreEl.textContent.trim().split('/')[0].trim() : (c.score || '');

  /* The turn signs as pills, since the badges are gone (2026-10-04). */
  var R = (typeof coinReading === 'function') ? coinReading(c) : null;
  var badges = R ? R.S.up.map(function (x) { return '▲ ' + x.title; })
                     .concat(R.S.down.map(function (x) { return '▼ ' + x.title; })).slice(0, 4) : [];

  /* market data cells */
  var mktCells = document.querySelectorAll('#td-market .td-mkt-cell');
  var mktData = [];
  mktCells.forEach(function(cell) {
    var label = (cell.querySelector('.td-mkt-label') || {}).textContent || '';
    var val   = (cell.querySelector('.td-mkt-val')   || {}).textContent || '';
    if (label && val) mktData.push({ label: label, val: val });
  });

  /* ── Canvas setup — 1200×630 for OG-compatible ratio ── */
  var W = 1200, H = 630;
  var can = document.createElement('canvas');
  can.width = W; can.height = H;
  var ctx = can.getContext('2d');

  /* ── Background: rich dark gradient ── */
  var bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#080c12');
  bg.addColorStop(0.4, '#0d1420');
  bg.addColorStop(1, '#080c12');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  /* subtle grid pattern */
  ctx.strokeStyle = 'rgba(243,186,47,0.025)';
  ctx.lineWidth = 1;
  for (var gx = 0; gx < W; gx += 50) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke(); }
  for (var gy = 0; gy < H; gy += 50) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke(); }

  /* ── Gold accent line at top ── */
  var gold = ctx.createLinearGradient(0, 0, W, 0);
  gold.addColorStop(0, 'rgba(243,186,47,0)');
  gold.addColorStop(0.3, 'rgba(243,186,47,0.9)');
  gold.addColorStop(0.7, 'rgba(243,186,47,0.9)');
  gold.addColorStop(1, 'rgba(243,186,47,0)');
  ctx.fillStyle = gold;
  ctx.fillRect(0, 0, W, 4);

  /* ── Large glow behind score area ── */
  var glow = ctx.createRadialGradient(W - 180, 200, 0, W - 180, 200, 280);
  glow.addColorStop(0, 'rgba(243,186,47,0.1)');
  glow.addColorStop(1, 'rgba(243,186,47,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(W - 460, 0, 460, 460);

  /* ── Symbol + Name header (bigger) ── */
  ctx.fillStyle = '#f3ba2f';
  ctx.font = 'bold 80px Inter, sans-serif';
  ctx.fillText(sym, 70, 105);

  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.font = '30px Inter, sans-serif';
  ctx.fillText(name, 70, 146);

  /* ── Price (big and bold) ── */
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 82px Inter, sans-serif';
  ctx.fillText(price, 70, 244);

  /* 24H change — large */
  var isPos = chg.indexOf('+') === 0;
  var isNeg = chg.indexOf('-') === 0 || chg.indexOf('\u2212') === 0;
  ctx.fillStyle = isPos ? '#00c896' : isNeg ? '#ff4560' : 'rgba(255,255,255,0.6)';
  ctx.font = 'bold 40px Inter, sans-serif';
  var arrow = isPos ? '\u25B2 ' : isNeg ? '\u25BC ' : '';
  ctx.fillText(arrow + chg + ' (24H)', 70, 296);

  /* ── Score circle (larger, bolder) ── */
  if (score) {
    var cx = W - 180, cy = 175, r = 100;
    /* outer ring bg */
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 8;
    ctx.stroke();
    /* score arc */
    var pct = parseInt(score) / 100;
    ctx.beginPath();
    ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct);
    var arcColor = pct >= 0.6 ? '#00c896' : pct >= 0.35 ? '#f3ba2f' : '#ff4560';
    ctx.strokeStyle = arcColor;
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.lineCap = 'butt';
    /* score number */
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 72px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(score, cx, cy + 24);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = '22px Inter, sans-serif';
    ctx.fillText('/100', cx, cy + 56);
    ctx.textAlign = 'left';
  }

  /* ── Separator line ── */
  ctx.fillStyle = 'rgba(243,186,47,0.12)';
  ctx.fillRect(70, 320, W - 140, 1);

  /* ── Signal badges (larger) ── */
  if (badges.length) {
    var badgeY = 350;
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '18px Inter, sans-serif';
    ctx.fillText('SIGNALS', 70, badgeY);
    var bx2 = 70;
    badgeY += 24;
    ctx.font = 'bold 22px Inter, sans-serif';
    badges.slice(0, 4).forEach(function(b) {
      var tw = ctx.measureText(b).width + 36;
      /* badge bg */
      ctx.fillStyle = 'rgba(0,200,150,0.12)';
      _roundRect(ctx, bx2, badgeY, tw, 44, 8);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,200,150,0.4)';
      ctx.lineWidth = 1;
      _roundRect(ctx, bx2, badgeY, tw, 44, 8);
      ctx.stroke();
      /* badge text */
      ctx.fillStyle = '#00c896';
      ctx.font = 'bold 22px Inter, sans-serif';
      ctx.fillText(b, bx2 + 18, badgeY + 30);
      bx2 += tw + 14;
    });
  }

  /* ── Market data boxes (larger fonts) ── */
  var boxY = badges.length ? 430 : 350, boxH = 80, boxGap = 14;
  var visibleMkt = mktData.slice(0, 5);
  var boxW = Math.min(200, (W - 140 - boxGap * (visibleMkt.length - 1)) / Math.min(visibleMkt.length, 5));
  visibleMkt.forEach(function(d, i) {
    var bx = 70 + i * (boxW + boxGap);
    /* box bg */
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    _roundRect(ctx, bx, boxY, boxW, boxH, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    _roundRect(ctx, bx, boxY, boxW, boxH, 8);
    ctx.stroke();
    /* label */
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '14px Inter, sans-serif';
    ctx.fillText(d.label.toUpperCase(), bx + 14, boxY + 26);
    /* value */
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px Inter, sans-serif';
    var dispVal = d.val.length > 12 ? d.val.substring(0, 11) + '\u2026' : d.val;
    ctx.fillText(dispVal, bx + 14, boxY + 56);
  });

  /* ── CTA teaser — curiosity hook ── */
  var ctaY = H - 140;
  ctx.fillStyle = 'rgba(243,186,47,0.06)';
  _roundRect(ctx, 50, ctaY, W - 100, 76, 8);
  ctx.fill();
  ctx.strokeStyle = 'rgba(243,186,47,0.25)';
  ctx.lineWidth = 1.5;
  _roundRect(ctx, 50, ctaY, W - 100, 76, 8);
  ctx.stroke();
  ctx.fillStyle = 'rgba(243,186,47,0.9)';
  ctx.font = 'bold 34px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Is your coin lagging or leading?', W / 2, ctaY + 32);
  ctx.font = 'bold 26px Inter, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillText('Find out free at Rotator', W / 2, ctaY + 62);
  ctx.textAlign = 'left';

  /* ── Footer: branding + URL ── */
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(70, H - 58, W - 140, 1);

  /* Rotator brand */
  ctx.fillStyle = '#f3ba2f';
  ctx.font = 'bold 32px Inter, sans-serif';
  ctx.fillText('ROTATOR', 70, H - 22);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.font = '20px Inter, sans-serif';
  ctx.fillText('Scores, holder warnings & a public track record', 250, H - 22);

  /* URL right-aligned */
  ctx.fillStyle = 'rgba(243,186,47,0.7)';
  ctx.font = 'bold 20px Inter, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('rotatortool-official.github.io', W - 70, H - 22);
  ctx.textAlign = 'left';

  /* ── Gold bottom accent ── */
  ctx.fillStyle = gold;
  ctx.fillRect(0, H - 4, W, 4);

  /* ── Show viral share preview modal instead of direct download ── */
  try {
    can.toBlob(function(blob) {
      if (!blob) { _fallbackDownload(can, sym); return; }
      _viralBlob = blob;
      _viralSym  = sym;
      _viralCanvas = can;
      _viralCopyIdx = Math.floor(Math.random() * _viralCopyTemplates.length);

      /* Set preview image */
      var preview = document.getElementById('viral-share-preview');
      if (preview) {
        var url = URL.createObjectURL(blob);
        preview.innerHTML = '<img src="' + url + '" alt="' + sym + ' share card">';
      }

      /* Set share message */
      _updateViralCopy();

      /* Always show share-with-image button */
      var nativeBtn = document.getElementById('viral-native-btn');
      if (nativeBtn) nativeBtn.style.display = 'flex';

      openModal('viral-share-modal');
    }, 'image/png');
  } catch(e) {
    _fallbackDownload(can, sym);
  }
}

/* ══════════════════════════════
   VIRAL SHARE — Preview modal logic
══════════════════════════════ */
var _viralBlob   = null;
var _viralSym    = '';
var _viralCanvas = null;
var _viralCopyIdx = 0;

var _viralCopyTemplates = [
  function(sym, score, chg, link) {
    return '📊 ' + sym + ' scored ' + score + '/100 on Rotator — ' + chg + ' in 24H\n\nFull breakdown → ' + link;
  },
  function(sym, score, chg, link) {
    return 'Found this setup on Rotator. Analytics don\'t lie. ' + sym + ' ' + chg + '\n\n🔍 ' + link;
  },
  function(sym, score, chg, link) {
    return 'Level up your trading edge — ' + sym + ' is showing strong momentum (' + score + '/100)\n\n' + link + ' 🔥';
  },
  function(sym, score, chg, link) {
    return sym + ' ' + chg + ' · Score: ' + score + '/100\nScores for 250 coins, holder warnings and a public track record, all free.\n\n→ ' + link;
  },
  function(sym, score, chg, link) {
    return '⚡ ' + sym + ' momentum alert — ' + score + '/100 composite score\n\nCheck the full analysis: ' + link;
  }
];

function _getViralCopyData() {
  var sym   = (document.getElementById('td-sym')  || {}).textContent || _viralSym || '';
  var chg   = (document.getElementById('td-price-chg') || {}).textContent || '';
  /* The score moved out of #td-score-bars into #td-score-num when the
     reserved big-number column was finally filled. Both share paths read
     it from the DOM, and both had a fallback, so this would have kept
     working off the fallback and nobody would have noticed the selector
     had gone dead. Pointed at where the number actually is. */
  var scoreEl = document.querySelector('#td-score-num .td-score-num-val');
  var score = scoreEl ? scoreEl.textContent.trim().split('/')[0].trim() : (_tdCoin ? _tdCoin.score : '?');
  var link  = (typeof getMyReferralLink === 'function') ? getMyReferralLink() : 'https://rotatortool-official.github.io';
  return { sym: sym, score: score, chg: chg, link: link };
}

function _updateViralCopy() {
  var d = _getViralCopyData();
  var tpl = _viralCopyTemplates[_viralCopyIdx % _viralCopyTemplates.length];
  var text = tpl(d.sym, d.score, d.chg, d.link);
  var el = document.getElementById('viral-copy-text');
  if (el) el.textContent = text;
}

function cycleViralCopy() {
  _viralCopyIdx = (_viralCopyIdx + 1) % _viralCopyTemplates.length;
  _updateViralCopy();
}

function closeViralShare() {
  closeModal('viral-share-modal');
}

function viralShareTo(platform) {
  var d = _getViralCopyData();
  var tpl = _viralCopyTemplates[_viralCopyIdx % _viralCopyTemplates.length];
  var text = tpl(d.sym, d.score, d.chg, d.link);
  var enc = encodeURIComponent(text);
  var encUrl = encodeURIComponent(d.link);
  var btn = event && event.currentTarget;

  /* Auto-download image before opening platform (so user can attach it) */
  var needsImage = ['x','telegram','whatsapp','messenger','reddit','threads'].indexOf(platform) >= 0;
  if (needsImage && _viralCanvas) {
    _fallbackDownload(_viralCanvas, _viralSym);
    _showShareToast('Image saved — attach it to your post!');
  }

  switch (platform) {
    case 'copy':
      _copyToClip(text, btn);
      return;
    case 'x':
      window.open('https://x.com/intent/tweet?text=' + enc, '_blank', 'width=550,height=420');
      break;
    case 'telegram':
      window.open('https://t.me/share/url?url=' + encUrl + '&text=' + enc, '_blank', 'width=550,height=420');
      break;
    case 'whatsapp':
      window.open('https://wa.me/?text=' + enc, '_blank', 'width=550,height=420');
      break;
    case 'discord':
      _copyToClip(text, btn);
      if (_viralCanvas) _fallbackDownload(_viralCanvas, _viralSym);
      _showShareToast('Text copied + image saved!');
      return;
    case 'messenger':
      window.open('https://www.facebook.com/dialog/send?link=' + encUrl + '&app_id=966242223397117&redirect_uri=' + encUrl, '_blank', 'width=550,height=420');
      break;
    case 'reddit':
      window.open('https://www.reddit.com/submit?title=' + encodeURIComponent('\uD83D\uDCCA ' + d.sym + ' — Rotator Signal') + '&url=' + encUrl, '_blank', 'width=800,height=600');
      break;
    case 'threads':
      window.open('https://www.threads.net/intent/post?text=' + enc, '_blank', 'width=550,height=420');
      break;
  }
}

/* Brief toast notification for share actions */
function _showShareToast(msg) {
  var existing = document.getElementById('share-toast');
  if (existing) existing.remove();
  var toast = document.createElement('div');
  toast.id = 'share-toast';
  toast.textContent = msg;
  toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:rgba(243,186,47,0.95);color:#000;padding:10px 20px;border-radius:8px;font-size:13px;font-weight:600;font-family:Inter,sans-serif;z-index:9999;pointer-events:none;animation:toastIn .3s ease;';
  document.body.appendChild(toast);
  setTimeout(function(){ if (toast.parentNode) toast.remove(); }, 3000);
}

function viralNativeShare() {
  if (!_viralBlob) return;
  var d = _getViralCopyData();
  var tpl = _viralCopyTemplates[_viralCopyIdx % _viralCopyTemplates.length];
  var text = tpl(d.sym, d.score, d.chg, d.link);
  var file = new File([_viralBlob], 'rotator-' + _viralSym.toLowerCase() + '.png', { type: 'image/png' });
  /* Try native share with image, fall back to download */
  if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
    navigator.share({ files: [file], title: d.sym + ' — Rotator Signal', text: text }).catch(function(){});
  } else {
    /* Desktop: download image + copy text to clipboard */
    if (_viralCanvas) _fallbackDownload(_viralCanvas, _viralSym);
    if (navigator.clipboard) navigator.clipboard.writeText(text).catch(function(){});
  }
}

function viralDownload() {
  if (_viralCanvas) _fallbackDownload(_viralCanvas, _viralSym);
}

function _fallbackDownload(can, sym) {
  var a = document.createElement('a');
  a.download = 'rotator-' + sym.toLowerCase() + '.png';
  a.href = can.toDataURL('image/png');
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/* Canvas rounded rect helper */
function _roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/* ══════════════════════════════
   TOOLTIP SYSTEM (Smart Info Card)
══════════════════════════════ */
var tipEl = null;
var _tipTimer = null;
var _tipRow   = null;

/* Native chain lookup for common assets */
var _chainMap = {
  BTC:'Bitcoin',ETH:'Ethereum',BNB:'BNB Chain',SOL:'Solana',XRP:'XRP Ledger',
  ADA:'Cardano',DOGE:'Dogecoin',DOT:'Polkadot',AVAX:'Avalanche',SHIB:'Ethereum',
  LINK:'Ethereum',MATIC:'Polygon',UNI:'Ethereum',LTC:'Litecoin',BCH:'Bitcoin Cash',
  NEAR:'NEAR',ICP:'Internet Computer',ETC:'Ethereum Classic',XLM:'Stellar',XMR:'Monero',
  HBAR:'Hedera',FIL:'Filecoin',ATOM:'Cosmos',VET:'VeChain',TRX:'Tron',
  SUI:'Sui',APT:'Aptos',SEI:'Sei',RENDER:'Solana',JUP:'Solana',
  AAVE:'Ethereum',GRT:'Ethereum',CRV:'Ethereum',MKR:'Ethereum',LDO:'Ethereum',
  ARB:'Arbitrum',OP:'Optimism',STX:'Bitcoin',IMX:'Ethereum',INJ:'Injective',
  BLUR:'Ethereum',BONK:'Solana',WIF:'Solana',BOME:'Solana',PEPE:'Ethereum',
  ONDO:'Ethereum',WLD:'Ethereum',PYTH:'Solana',JTO:'Solana',ENA:'Ethereum',
  HYPE:'HyperEVM',TON:'TON',SAND:'Ethereum',MANA:'Ethereum',AXS:'Ronin',
  GALA:'Ethereum',ILV:'Ethereum',GMT:'Solana',FLOW:'Flow',WAX:'WAX',
  OCEAN:'Ethereum',FET:'Ethereum',AGIX:'Ethereum',NMR:'Ethereum',TAO:'Bittensor',
  ZETA:'ZetaChain',TIA:'Celestia',DYM:'Dymension',ALT:'Ethereum',OMNI:'Ethereum',
  SAGA:'Cosmos',MANTA:'Manta',MEW:'Solana',W:'Solana',RAY:'Solana',
  ORCA:'Solana',IO:'Solana',KMNO:'Solana',MET:'Solana',DRIFT:'Solana',
  MRGN:'Solana',LFI:'Solana',SBR:'Solana',SRM:'Solana',
  GMX:'Arbitrum',GNS:'Arbitrum',KWENTA:'Optimism',PENDLE:'Ethereum',
  CVX:'Ethereum',FXS:'Ethereum',OKB:'OKX Chain',STG:'Ethereum'
};

function getTip() { if (!tipEl) tipEl = document.getElementById('rt-tip'); return tipEl; }

function showTip(title, body, x, y) {
  var t = getTip(); if (!t) return;
  document.getElementById('rt-tip-title').innerHTML = title;
  document.getElementById('rt-tip-body').innerHTML  = body;
  t.classList.add('show');
  var vw = window.innerWidth, vh = window.innerHeight;
  var tw = Math.min(340, vw - 16), th = t.offsetHeight || 200;
  t.style.maxWidth = tw + 'px';
  var lx = x + 16, ly = y + 16;
  if (lx + tw > vw - 8)  lx = x - tw - 10;
  if (lx < 8) lx = 8;
  if (ly + th > vh - 8) ly = Math.max(8, vh - th - 8);
  t.style.left = lx + 'px'; t.style.top = ly + 'px';
}

function hideTip() {
  if (_tipTimer) { clearTimeout(_tipTimer); _tipTimer = null; }
  _tipRow = null;
  var t = getTip(); if (t) t.classList.remove('show');
}

/* The card is a mouse-hover helper and nothing else (2026-10-05).
   On a phone the tap that opens a coin window also fires the emulated
   mouseenter, so the card appeared 200ms later ON TOP of the window
   (position:fixed, z-index 900, pointer-events none) and never closed,
   because a finger never sends mouseleave. Reported on iPhone: "SAND —
   The Sandbox" pinned over the coin window. The window already shows
   everything the card does, so touch input simply does not open it. */
var _tipLastTouch = 0;
document.addEventListener('touchstart', function () { _tipLastTouch = Date.now(); hideTip(); }, { passive: true, capture: true });
/* A fixed card stays where it was drawn; once the page moves it points
   at a different row, so any scroll closes it (capture: modal bodies too). */
window.addEventListener('scroll', function () { if (_tipRow) hideTip(); }, { passive: true, capture: true });
function _tipTouchInput() {
  if (Date.now() - _tipLastTouch < 1000) return true;
  try { return window.matchMedia('(hover: none)').matches; } catch (e) { return false; }
}

function showRowTip(row, e) {
  if (_tipTouchInput()) return;
  /* 200ms hover-intent delay */
  if (_tipTimer) clearTimeout(_tipTimer);
  _tipRow = row;
  var cx = e.clientX, cy = e.clientY;
  _tipTimer = setTimeout(function() {
    if (_tipRow !== row) return;
    _buildRowTip(row, cx, cy);
  }, 200);
}

function _buildRowTip(row, cx, cy) {
  var sym     = row.getAttribute('data-sym');
  var name    = row.getAttribute('data-name');
  var mcap    = row.getAttribute('data-mcap');
  var score   = row.getAttribute('data-score');
  var p24     = row.getAttribute('data-p24');
  var p7      = row.getAttribute('data-p7');
  var p30     = row.getAttribute('data-p30');
  var held    = row.getAttribute('data-held') === '1';
  var unlock  = parseInt(row.getAttribute('data-unlock'));
  var maxSup  = parseFloat(row.getAttribute('data-maxsup'));

  var scN  = parseInt(score);
  var p24N = parseFloat(p24);
  var p7N  = parseFloat(p7);

  /* Direction over 24h + 7d. Plain words, not "Bullish/Bearish"
     (promptove/107): it describes what the price did, not a call. */
  var sentimentScore = p24N * 0.4 + p7N * 0.6;
  var isBull = sentimentScore >= 0;
  var sentimentLabel = isBull ? 'Rising' : 'Falling';
  var sentimentCls   = isBull ? 'bull' : 'bear';

  /* Unlocked % display */
  var unlockStr = unlock >= 0 ? unlock + '% Unlocked' : '∞ No Cap';
  var unlockCls = unlock >= 0 ? 'bnb' : 'muted';

  /* Native chain */
  var chain = _chainMap[sym] || '—';

  /* Build 2-column grid body */
  var body = '<div class="rt-tip-grid">'
    + '<div><div class="rt-tip-cell-l">Market Cap</div><div class="rt-tip-cell-v bnb">' + mcap + '</div></div>'
    + '<div><div class="rt-tip-cell-l">Unlocked Supply</div><div class="rt-tip-cell-v ' + unlockCls + '">' + unlockStr + '</div></div>'
    + '<div><div class="rt-tip-cell-l">Chain</div><div class="rt-tip-cell-v muted">' + chain + '</div></div>'
    + '<div><div class="rt-tip-cell-l">Trend, 24h + 7d</div><div><span class="rt-tip-sentiment ' + sentimentCls + '">' + sentimentLabel + '</span></div></div>'
    + '</div>';

  /* ── Notes ── reworded and put on the page's one score rule
     (promptove/107). They were "Healthy Rotation: Asset is gaining
     dominance" at 55+ and "Strong downward pressure. Exercise caution"
     below 20, from an older 0-100 scale. Now: the strong note in the
     green band (scoreBand 'hi', 65+), the lagging note below 20, and
     the supply note as before. They say what the score measures:
     how a coin did against the others, not what it will do. */
  var warnings = [];
  var band = (typeof scoreBand === 'function') ? scoreBand(scN) : (scN >= 65 ? 'hi' : 'lo');

  if ((maxSup <= 0 || (unlock >= 0 && unlock < 20)) && scN < 45) {
    warnings.push('⚠️ <strong>Supply risk:</strong> most of the supply is not out yet (or there is no cap), and the score is weak.');
  }
  if (scN < 20) {
    warnings.push('🔻 <strong>Lagging:</strong> it has done worse than most coins lately.');
  }
  if (band === 'hi' && mcap !== '—') {
    warnings.push('✅ <strong>Strong:</strong> it has done better than most coins lately.');
  }

  if (warnings.length) {
    body += '<div class="rt-tip-warning">' + warnings.join('<br style="margin-bottom:4px;">') + '</div>';
  }

  /* Holdings tag */
  if (held) {
    body += '<div style="margin-top:6px;font-size:12px;color:var(--bnb);font-family:var(--font-ui);">✓ In your holdings</div>';
  }

  showTip(sym + ' <span style="color:var(--muted);font-weight:300;">—</span> ' + name, body, cx, cy);
}

/* ══════════════════════════════
   SPLASH SCREEN LOGO ANIMATION
   Palindrome showcase: O's orbit + each letter spins on Y-axis one at a time
   Sequence: pause → O orbit → pause → R spin → T spin → A spin → T spin → R spin → pause → O orbit back → repeat
══════════════════════════════ */
(function(){
  var canvas=document.getElementById('splash-c');
  if(!canvas) return;
  var ctx=canvas.getContext('2d');
  var CW=canvas.width,CH=canvas.height;
  /* Drawn at the screen's pixel density (promptove/105): the bitmap was
     420x140 whatever the screen, so a retina phone or tablet, and the
     larger tablet loader, showed it soft. CW/CH stay the logical size
     every drawing call below uses; CSS sets the displayed size. */
  var _shown=canvas.getBoundingClientRect().width||CW;   /* 560 on tablets, less on a narrow phone */
  var _dpr=Math.min(3,(window.devicePixelRatio||1)*Math.max(1,_shown/CW));
  if(_dpr>1){canvas.width=Math.round(CW*_dpr);canvas.height=Math.round(CH*_dpr);ctx.scale(_dpr,_dpr);}
  var FS=52,FONT='bold '+FS+'px Inter, sans-serif';
  var BASE=112,GOLD='#f3ba2f',RED='#ff4560',GREEN='#00c896';
  var fc=0,pf=0;
  var ra=Math.PI,ga=0;
  var xR1,xO1,xT1,xA,xT2,xO2,xR2,wR,wO,wT,wA,s1x,s2x,sY,oCX,oCY,oRX,oRY,rdy=false;

  /* Timing */
  var PAUSE=160,TRAVEL=180,SPIN=60,SPIN_PAUSE=30;

  /* Phase machine:
     pause1 → travel1 (O orbit) → pause2 →
     spinR1 → spR1 → spinT1 → spT1 → spinA → spA → spinT2 → spT2 → spinR2 → spR2 →
     pause3 → travel2 (O orbit back) → repeat */
  var PHASES=[
    'pause1','travel1','pause2',
    'spinR1','spR1','spinT1','spT1','spinA','spA','spinT2','spT2','spinR2','spR2',
    'pause3','travel2'
  ];
  var pi=0;
  function phase(){return PHASES[pi];}
  function nextPhase(){pi=(pi+1)%PHASES.length;pf=0;}

  /* Letter Y-axis spin state: which letter is spinning and its progress 0→1 */
  var spinLetter='',spinP=0;

  function measure(){
    ctx.font=FONT;
    wR=ctx.measureText('R').width;wO=ctx.measureText('O').width;
    wT=ctx.measureText('T').width;wA=ctx.measureText('A').width;
    var tw=wR+wO+wT+wA+wT+wO+wR;
    /* If text is wider than canvas, shrink font */
    if(tw>CW-30){
      FS=Math.floor(FS*(CW-30)/tw);
      FONT='bold '+FS+'px Inter, sans-serif';
      ctx.font=FONT;
      wR=ctx.measureText('R').width;wO=ctx.measureText('O').width;
      wT=ctx.measureText('T').width;wA=ctx.measureText('A').width;
      tw=wR+wO+wT+wA+wT+wO+wR;
    }
    var sx=(CW-tw)/2;
    xR1=sx;xO1=xR1+wR;xT1=xO1+wO;xA=xT1+wT;xT2=xA+wA;xO2=xT2+wT;xR2=xO2+wO;
    s1x=xO1+wO/2;s2x=xO2+wO/2;sY=BASE-FS*0.36;
    oCX=(s1x+s2x)/2;oCY=sY;oRX=(s2x-s1x)/2;oRY=52;rdy=true;
  }
  function ease(t){return t<0.5?2*t*t:-1+(4-2*t)*t;}
  function rpos(a){return{x:oCX+oRX*Math.cos(a),y:oCY-oRY*Math.sin(a)};}
  function gpos(a){return{x:oCX+oRX*Math.cos(a),y:oCY+oRY*Math.sin(a)};}

  /* Draw a single letter with optional Y-axis spin (scaleX) */
  function drawLetter(ch,x,y,color,scaleX,glow){
    ctx.save();
    var hw=ctx.measureText(ch).width/2;
    ctx.translate(x+hw,y);
    ctx.scale(scaleX,1);
    ctx.translate(-hw,0);
    ctx.fillStyle=color;
    if(glow){ctx.shadowBlur=glow;ctx.shadowColor=color;}
    ctx.textBaseline='alphabetic';ctx.textAlign='left';
    ctx.fillText(ch,0,0);
    ctx.restore();
  }

  function frame(){
    if(!document.getElementById('loader')||document.getElementById('loader').classList.contains('gone')) return;
    if(!rdy){requestAnimationFrame(frame);return;}
    ctx.clearRect(0,0,CW,CH);
    var fi=Math.min(1,fc/30);fc++;pf++;
    ctx.globalAlpha=fi;ctx.font=FONT;ctx.shadowBlur=0;

    var ph=phase();

    /* ── O orbit logic ── */
    if(ph==='pause1'){ra=Math.PI;ga=0;if(pf>=PAUSE)nextPhase();}
    else if(ph==='travel1'){var p=ease(Math.min(pf/TRAVEL,1));ra=Math.PI-Math.PI*2*p;ga=Math.PI*2*p;if(pf>=TRAVEL)nextPhase();}
    else if(ph==='pause2'){ra=0;ga=Math.PI;if(pf>=PAUSE)nextPhase();}
    else if(ph==='pause3'){ra=0;ga=Math.PI;if(pf>=PAUSE)nextPhase();}
    else if(ph==='travel2'){var p=ease(Math.min(pf/TRAVEL,1));ra=-Math.PI+Math.PI*2*p;ga=Math.PI*2-Math.PI*2*p;if(pf>=TRAVEL)nextPhase();}
    /* ── Letter spin phases ── */
    else if(ph==='spinR1'){spinLetter='R1';spinP=ease(Math.min(pf/SPIN,1));if(pf>=SPIN)nextPhase();}
    else if(ph==='spR1'){spinLetter='';spinP=0;if(pf>=SPIN_PAUSE)nextPhase();}
    else if(ph==='spinT1'){spinLetter='T1';spinP=ease(Math.min(pf/SPIN,1));if(pf>=SPIN)nextPhase();}
    else if(ph==='spT1'){spinLetter='';spinP=0;if(pf>=SPIN_PAUSE)nextPhase();}
    else if(ph==='spinA'){spinLetter='A';spinP=ease(Math.min(pf/SPIN,1));if(pf>=SPIN)nextPhase();}
    else if(ph==='spA'){spinLetter='';spinP=0;if(pf>=SPIN_PAUSE)nextPhase();}
    else if(ph==='spinT2'){spinLetter='T2';spinP=ease(Math.min(pf/SPIN,1));if(pf>=SPIN)nextPhase();}
    else if(ph==='spT2'){spinLetter='';spinP=0;if(pf>=SPIN_PAUSE)nextPhase();}
    else if(ph==='spinR2'){spinLetter='R2';spinP=ease(Math.min(pf/SPIN,1));if(pf>=SPIN)nextPhase();}
    else if(ph==='spR2'){spinLetter='';spinP=0;if(pf>=SPIN_PAUSE)nextPhase();}

    /* ── Calculate scaleX for spinning letter (full 360: 1→0→-1→0→1) ── */
    var scX=function(id){
      if(spinLetter!==id) return 1;
      return Math.cos(spinP*Math.PI*2);
    };

    /* ── Glow for spinning letter ── */
    var glw=function(id){
      if(spinLetter!==id) return 0;
      return 12*Math.sin(spinP*Math.PI);
    };

    /* ── Draw static letters with potential spin ── */
    drawLetter('R',xR1,BASE,GOLD,scX('R1'),glw('R1'));
    drawLetter('T',xT1,BASE,GOLD,scX('T1'),glw('T1'));
    drawLetter('A',xA,BASE,GOLD,scX('A'),glw('A'));
    drawLetter('T',xT2,BASE,GOLD,scX('T2'),glw('T2'));
    drawLetter('R',xR2,BASE,GOLD,scX('R2'),glw('R2'));

    /* ── Draw orbiting O's ── */
    var mov=(ph==='travel1'||ph==='travel2');
    var Rp=rpos(ra),Gp=gpos(ga);
    ctx.textBaseline='middle';ctx.textAlign='center';
    ctx.shadowBlur=mov?16:8;ctx.shadowColor=GREEN;ctx.fillStyle=GREEN;ctx.fillText('O',Gp.x,Gp.y);
    ctx.shadowBlur=mov?16:8;ctx.shadowColor=RED;ctx.fillStyle=RED;ctx.fillText('O',Rp.x,Rp.y);
    ctx.shadowBlur=0;ctx.globalAlpha=1;
    requestAnimationFrame(frame);
  }
  document.fonts.ready.then(function(){measure();frame();});
})();

/* ══════════════════════════════
   TOPBAR LOGO ANIMATION
   Same palindrome spin as splash but smaller
══════════════════════════════ */
(function(){
  function initLogo(){
    ['logo-c','logo-c-mob'].forEach(function(canvasId){
      var canvas=document.getElementById(canvasId);
      if(!canvas) return;
      var ctx=canvas.getContext('2d');
      var CW=canvas.width,CH=canvas.height;
      var FS=18,FONT='bold '+FS+'px Inter, sans-serif';
      var BASE=22,GOLD='#f3ba2f',RED='#ff4560',GREEN='#00c896';
      var fc=0,pf=0;
      var PAUSE=200,TRAVEL=160,SPIN=50,SPIN_PAUSE=25;
      var ra=Math.PI,ga=0;
      var xR1,xO1,xT1,xA,xT2,xO2,xR2,wR,wO,wT,wA,s1x,s2x,sY,oCX,oCY,oRX,oRY,rdy=false;
      var PHASES=['pause1','travel1','pause2','spinR1','spR1','spinT1','spT1','spinA','spA','spinT2','spT2','spinR2','spR2','pause3','travel2'];
      var pi=0,spinLetter='',spinP=0;
      function ph(){return PHASES[pi];}
      function nxt(){pi=(pi+1)%PHASES.length;pf=0;}
      function measure(){
        ctx.font=FONT;
        wR=ctx.measureText('R').width;wO=ctx.measureText('O').width;
        wT=ctx.measureText('T').width;wA=ctx.measureText('A').width;
        var tw=wR+wO+wT+wA+wT+wO+wR,sx=(CW-tw)/2;
        xR1=sx;xO1=xR1+wR;xT1=xO1+wO;xA=xT1+wT;xT2=xA+wA;xO2=xT2+wT;xR2=xO2+wO;
        s1x=xO1+wO/2;s2x=xO2+wO/2;sY=BASE-FS*0.36;
        oCX=(s1x+s2x)/2;oCY=sY;oRX=(s2x-s1x)/2;oRY=FS*0.52;rdy=true;
      }
      function ease(t){return t<0.5?2*t*t:-1+(4-2*t)*t;}
      function rpos(a){return{x:oCX+oRX*Math.cos(a),y:oCY-oRY*Math.sin(a)};}
      function gpos(a){return{x:oCX+oRX*Math.cos(a),y:oCY+oRY*Math.sin(a)};}
      function drawL(ch,x,y,color,scX,glw){
        ctx.save();var hw=ctx.measureText(ch).width/2;
        ctx.translate(x+hw,y);ctx.scale(scX,1);ctx.translate(-hw,0);
        ctx.fillStyle=color;if(glw){ctx.shadowBlur=glw;ctx.shadowColor=color;}
        ctx.textBaseline='alphabetic';ctx.textAlign='left';ctx.fillText(ch,0,0);ctx.restore();
      }
      function frame(){
        if(!rdy){requestAnimationFrame(frame);return;}
        ctx.clearRect(0,0,CW,CH);
        var fi=Math.min(1,fc/20);fc++;pf++;ctx.globalAlpha=fi;ctx.font=FONT;ctx.shadowBlur=0;
        var p=ph();
        if(p==='pause1'){ra=Math.PI;ga=0;if(pf>=PAUSE)nxt();}
        else if(p==='travel1'){var e=ease(Math.min(pf/TRAVEL,1));ra=Math.PI*(1-2*e);ga=Math.PI*2*e;if(pf>=TRAVEL)nxt();}
        else if(p==='pause2'){ra=0;ga=Math.PI;if(pf>=PAUSE)nxt();}
        else if(p==='pause3'){ra=0;ga=Math.PI;if(pf>=PAUSE)nxt();}
        else if(p==='travel2'){var e=ease(Math.min(pf/TRAVEL,1));ra=-Math.PI+Math.PI*2*e;ga=Math.PI*2*(1-e);if(pf>=TRAVEL)nxt();}
        else if(p.indexOf('spin')===0){var id=p.slice(4);spinLetter=id;spinP=ease(Math.min(pf/SPIN,1));if(pf>=SPIN)nxt();}
        else if(p.indexOf('sp')===0){spinLetter='';spinP=0;if(pf>=SPIN_PAUSE)nxt();}
        var scX=function(id){return spinLetter!==id?1:Math.cos(spinP*Math.PI*2);};
        var glw=function(id){return spinLetter!==id?0:6*Math.sin(spinP*Math.PI);};
        drawL('R',xR1,BASE,GOLD,scX('R1'),glw('R1'));
        drawL('T',xT1,BASE,GOLD,scX('T1'),glw('T1'));
        drawL('A',xA,BASE,GOLD,scX('A'),glw('A'));
        drawL('T',xT2,BASE,GOLD,scX('T2'),glw('T2'));
        drawL('R',xR2,BASE,GOLD,scX('R2'),glw('R2'));
        var mov=(p==='travel1'||p==='travel2');
        var Rp=rpos(ra),Gp=gpos(ga);
        ctx.textBaseline='middle';ctx.textAlign='center';
        ctx.shadowBlur=mov?8:4;ctx.shadowColor=GREEN;ctx.fillStyle=GREEN;ctx.fillText('O',Gp.x,Gp.y);
        ctx.shadowBlur=mov?8:4;ctx.shadowColor=RED;ctx.fillStyle=RED;ctx.fillText('O',Rp.x,Rp.y);
        ctx.shadowBlur=0;ctx.globalAlpha=1;
        requestAnimationFrame(frame);
      }
      document.fonts.ready.then(function(){measure();frame();});
    });
  }
  setTimeout(initLogo, 100);
})();

/* ══════════════════════════════
   MINI AD PANEL ANIMATION
══════════════════════════════ */
(function(){
  function initAdAnim(){
    var canvas=document.getElementById('ad-splash-c');
    if(!canvas) return;
    var ctx=canvas.getContext('2d');
    var CW=canvas.width,CH=canvas.height;
    var FS=28,FONT='bold '+FS+'px Inter, sans-serif';
    var BASE=62,GOLD='#f3ba2f',RED='#ff4560',GREEN='#00c896';
    var fc=0,phase='pause1',pf=0,PAUSE=220,TRAVEL=180;
    var ra=Math.PI,ga=0;
    var xR1,xO1,xT1,xA,xT2,xO2,xR2,s1x,s2x,sY,oCX,oCY,oRX,oRY,rdy=false;
    function measure(){
      ctx.font=FONT;
      var wR=ctx.measureText('R').width,wO=ctx.measureText('O').width,wT=ctx.measureText('T').width,wA=ctx.measureText('A').width;
      var tw=wR+wO+wT+wA+wT+wO+wR,sx=(CW-tw)/2;
      xR1=sx;xO1=xR1+wR;xT1=xO1+wO;xA=xT1+wT;xT2=xA+wA;xO2=xT2+wT;xR2=xO2+wO;
      s1x=xO1+wO/2;s2x=xO2+wO/2;sY=BASE-FS*0.36;
      oCX=(s1x+s2x)/2;oCY=sY;oRX=(s2x-s1x)/2;oRY=28;rdy=true;
    }
    function ease(t){return t<0.5?2*t*t:-1+(4-2*t)*t;}
    function rpos(a){return{x:oCX+oRX*Math.cos(a),y:oCY-oRY*Math.sin(a)};}
    function gpos(a){return{x:oCX+oRX*Math.cos(a),y:oCY+oRY*Math.sin(a)};}
    function frame(){
      if(!rdy){requestAnimationFrame(frame);return;}
      ctx.clearRect(0,0,CW,CH);
      var fi=Math.min(1,fc/20);fc++;pf++;
      if(phase==='pause1'){ra=Math.PI;ga=0;if(pf>=PAUSE){phase='travel1';pf=0;}}
      else if(phase==='travel1'){var p=ease(Math.min(pf/TRAVEL,1));ra=Math.PI*(1-2*p);ga=Math.PI*2*p;if(pf>=TRAVEL){ra=-Math.PI;ga=Math.PI*2;phase='pause2';pf=0;}}
      else if(phase==='pause2'){ra=0;ga=Math.PI;if(pf>=PAUSE){phase='travel2';pf=0;}}
      else if(phase==='travel2'){var p=ease(Math.min(pf/TRAVEL,1));ra=-Math.PI+Math.PI*2*p;ga=Math.PI*2*(1-p);if(pf>=TRAVEL){ra=Math.PI;ga=0;phase='pause1';pf=0;}}
      var R=rpos(ra),G=gpos(ga),mov=(phase==='travel1'||phase==='travel2');
      ctx.globalAlpha=fi;
      ctx.font=FONT;ctx.textBaseline='alphabetic';ctx.textAlign='left';ctx.fillStyle=GOLD;ctx.shadowBlur=0;
      ctx.fillText('R',xR1,BASE);ctx.fillText('T',xT1,BASE);ctx.fillText('A',xA,BASE);ctx.fillText('T',xT2,BASE);ctx.fillText('R',xR2,BASE);
      ctx.textBaseline='middle';ctx.textAlign='center';
      ctx.shadowBlur=mov?10:5;ctx.shadowColor=GREEN;ctx.fillStyle=GREEN;ctx.fillText('O',G.x,G.y);
      ctx.shadowBlur=mov?10:5;ctx.shadowColor=RED;ctx.fillStyle=RED;ctx.fillText('O',R.x,R.y);
      ctx.shadowBlur=0;ctx.globalAlpha=1;
      requestAnimationFrame(frame);
    }
    document.fonts.ready.then(function(){measure();frame();});
  }
  setTimeout(initAdAnim, 200);
})();

/* ── Feeling the pulse (Daniel, 2026-10-03) ─────────────────────────
   A mouse that rests 3 seconds on a TODAY or momentum tile gets a green
   heart-monitor trace in the tile's empty space, beating at the page's
   42 a minute (styles.css, "Market pulse"). Any real movement
   (4px+) or leaving the tile lifts it. Mouse devices only, and never with
   reduced motion asked for. */
/* One beat in a 60-wide cell, baseline at 20 of 40: flat, P bump, Q dip,
   tall R spike, S dip, T bump, flat. Four beats = two seamless halves. */
var _HB_BEAT = 'L14 20 L17 17 L20 20 L24 20 L26 23 L28 3 L30 30 L32 20 L37 20 L41 14 L45 20 L60 20';
function _hbEcgSvg() {
  var d = 'M0 20';
  for (var b = 0; b < 4; b++) {
    d += ' ' + _HB_BEAT.replace(/L(\d+) /g, function (m, x) { return 'L' + (Number(x) + b * 60) + ' '; });
  }
  return '<svg viewBox="0 0 240 40" preserveAspectRatio="none" aria-hidden="true"><path d="' + d + '"/></svg>';
}
/* ── The heartbeat you can hear (Daniel, 2026-10-03) ───────────────
   When the monitor trace appears, a soft, deep lub-dub plays at the
   tile's own rate: faster for a coin that is up, slower for one that is
   down. Made by the browser (Web Audio), no sound files. ON by default,
   off from Settings ("Heartbeat sound", remembered per browser).
   Browsers allow sound only after the visitor has clicked or typed
   something on the page, so it starts after the first click. At most
   10 beats, then silence; moving the mouse stops it at once. Mouse
   devices only and never with reduced motion asked for (the trace that
   triggers it is not drawn then). */
var _hbAudio = null, _hbBeatTimer = null;
function hbSoundOn() {
  try { return localStorage.getItem('rot_hb_sound') !== 'off'; } catch (e) { return true; }
}
function setHbSound(on) {
  try { localStorage.setItem('rot_hb_sound', on ? 'on' : 'off'); } catch (e) {}
  if (!on) hbSoundStop();
}
function _hbCtx() {
  if (!_hbAudio) {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { _hbAudio = new AC(); } catch (e) { return null; }
  }
  if (_hbAudio.state === 'suspended') { try { _hbAudio.resume(); } catch (e) {} }
  return _hbAudio;
}
/* One thump: a low sine that drops in pitch, through a low-pass, with a
   fast attack and a short decay. Quiet on purpose. */
function _hbThump(ctx, t, freq, peak, len) {
  var o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
  o.type = 'sine';
  o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(freq * 0.6, t + len);
  f.type = 'lowpass'; f.frequency.value = 220;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  o.connect(f); f.connect(g); g.connect(ctx.destination);
  o.start(t); o.stop(t + len + 0.02);
}
function hbSoundStart(beatSeconds) {
  hbSoundStop();
  if (!hbSoundOn()) return;
  if (typeof radioPlaying === 'function' && radioPlaying()) return;   /* quiet under the radio (js/radio.js) */
  var ctx = _hbCtx();
  if (!ctx || ctx.state !== 'running') return;   /* no click on the page yet */
  var n = 0;
  (function beat() {
    var t = ctx.currentTime + 0.02;
    _hbThump(ctx, t, 62, 0.20, 0.16);                        /* lub */
    _hbThump(ctx, t + beatSeconds * 0.16, 78, 0.12, 0.12);   /* dub, where the visual dub falls */
    if (++n < 10) _hbBeatTimer = setTimeout(beat, beatSeconds * 1000);
  })();
}
function hbSoundStop() {
  if (_hbBeatTimer) { clearTimeout(_hbBeatTimer); _hbBeatTimer = null; }
}
/* The loading screen's monitor beep (Daniel, 2026-10-03): three soft
   hospital-monitor blips, each on a spike of the green line the loader
   draws (index.html .lp-ecg: 3 beats over 4.3s, the spike 28/60 of the
   way into each). Browsers keep a page silent until the visitor has
   clicked, so on a first visit this usually stays quiet; Chrome lets
   often-visited sites play at once. Same Settings switch as the tiles;
   never with reduced motion asked for. */
function _hbBlip(ctx, t) {
  var o = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'sine'; o.frequency.value = 960;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.06, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
  o.connect(g); g.connect(ctx.destination);
  o.start(t); o.stop(t + 0.14);
}
(function _loaderBeep() {
  if (!hbSoundOn()) return;
  try { if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return; } catch (e) {}
  var loader = document.getElementById('loader');
  if (!loader || loader.classList.contains('gone')) return;
  var ctx = _hbCtx();
  if (!ctx) return;
  var beat = 4.3 / 3, spike = beat * 28 / 60;
  var play = function () {
    if (ctx.state !== 'running') return;
    /* Where the line's own drawing animation is now, so each blip lands
       on its spike; spikes already drawn are skipped. */
    var done = 0;
    try {
      var path = document.querySelector('.lp-ecg path');
      var an = path && path.getAnimations && path.getAnimations()[0];
      if (an && an.currentTime != null) done = an.currentTime / 1000;
    } catch (e) {}
    var t0 = ctx.currentTime;
    for (var k = 0; k < 3; k++) {
      var at = spike + k * beat - done;
      if (at >= 0) _hbBlip(ctx, t0 + at);
    }
  };
  /* Wait briefly for the browser to allow sound; give up quietly if not. */
  if (ctx.state === 'running') play();
  else setTimeout(play, 150);
})();

/* Unlock audio on the first click or key press, and show the saved
   choice in Settings. */
(function _hbSoundInit() {
  var t = document.getElementById('hb-sound-toggle');
  if (t) t.checked = hbSoundOn();
  var unlock = function () {
    if (hbSoundOn()) _hbCtx();
    document.removeEventListener('pointerdown', unlock, true);
    document.removeEventListener('keydown', unlock, true);
  };
  document.addEventListener('pointerdown', unlock, true);
  document.addEventListener('keydown', unlock, true);
})();

(function _hbListen() {
  var fine = false, reduced = false;
  try {
    fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (e) {}
  if (!fine || reduced) return;
  var SEL = '.sig-tile:not(.sig-tile-empty), .bf-cell:not(.bf-cell-empty), #tiles-grid .tile';
  var timer = null, glow = null, tile = null, lx = 0, ly = 0;
  function lift() {
    hbSoundStop();
    if (timer) { clearTimeout(timer); timer = null; }
    if (glow && glow.parentNode) glow.parentNode.removeChild(glow);
    glow = null;
  }
  function host(t) {
    /* A TODAY tile: the glow goes on the face that is showing, so it
       turns with the card and never leaks past its edge. */
    if (!t.classList.contains('bf-cell')) return t;
    return t.querySelector('.bf-front') || t;
  }
  document.addEventListener('mousemove', function (e) {
    var t = e.target && e.target.closest ? e.target.closest(SEL) : null;
    if (t !== tile) { lift(); tile = t; lx = e.clientX; ly = e.clientY; }
    if (!tile) return;
    if (Math.abs(e.clientX - lx) < 4 && Math.abs(e.clientY - ly) < 4 && (timer || glow)) return;
    lift(); lx = e.clientX; ly = e.clientY;
    timer = setTimeout(function () {
      timer = null;
      if (!tile || !document.body.contains(tile)) return;
      var h = host(tile), r = h.getBoundingClientRect();
      glow = document.createElement('span');
      glow.className = 'hb-ecg';
      glow.innerHTML = _hbEcgSvg();
      h.appendChild(glow);   /* placed by CSS in the tile's empty space */
      /* And the sound, at the tile's own rate (--hb-dur). */
      var dur = parseFloat(getComputedStyle(h).getPropertyValue('--hb-dur')) || 1.43;
      hbSoundStart(dur);
    }, 3000);
  }, { passive: true });
  document.addEventListener('mouseleave', function () { lift(); tile = null; });
  /* A scroll lifts it only if the tile has moved out from under the
     mouse. The page fires scroll events on its own while it settles,
     and lifting on every one meant the trace never got to appear. */
  window.addEventListener('scroll', function () {
    if (!tile) return;
    var under = document.elementFromPoint(lx, ly);
    if (!under || !tile.contains(under)) { lift(); tile = null; }
  }, { passive: true });
})();
