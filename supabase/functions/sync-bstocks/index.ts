// ============================================================
// sync-bstocks — Supabase Edge Function
//
// Server-side sync of Binance bStocks (tokenized equities) into
// `unified_market_data` (asset_type='stock', source_name='binance').
//
// WHY SERVER-SIDE, NOT CLIENT-SIDE:
// Binance geo-blocks some regions with HTTP 451, so a visitor there
// would silently get nothing, and every visitor would otherwise
// re-fetch identical data. This function fetches Binance server-to-
// server and writes the results to Supabase; the browser only ever
// reads unified_market_data.
//
// ── THE ROSTER IS NO LONGER HAND-MAINTAINED (2026-09-16) ──────
//
// It used to be a hardcoded array of 24 tickers, duplicated a second
// time in js/config.js, with a comment admitting it was already stale
// and telling the reader to verify it before deploying. Nobody did.
// Measured on 2026-09-16: Binance listed 77 bStocks and we carried 24.
// Nokia, Alphabet and Coinbase were all live and all named in that
// comment as "ticker not confirmed" — NOKB, GOOGLB and COINB had in
// fact existed the whole time.
//
// The roster now comes from `binance_symbol_tags`, which sync-binance-
// status ALREADY populates on every run with Binance's full tag
// vocabulary — including the `bStocks` tag. The complete roster was
// sitting in our own database, refreshed daily, read by nothing. This
// function reads it instead of a list a human has to remember to edit,
// so a new Binance listing appears on the site by itself.
//
// TWO SOURCES, DELIBERATELY, AND THEY DEGRADE DIFFERENTLY:
//   • ROSTER      ← binance_symbol_tags (our table). Authoritative.
//                   If this read fails the function refuses to run
//                   rather than syncing a guess.
//   • ENRICHMENT  ← bapi .../get-products (Binance's undocumented
//                   website endpoint — same one sync-binance-status
//                   uses, same caveat). Supplies the display name and
//                   the share count. Best-effort: if it fails or
//                   changes shape, names fall back and mcap goes NULL.
//                   Nothing here is fabricated to fill a gap.
//
// MARKET CAP, which the old version said was impossible:
// the comment read "mcap intentionally omitted — Binance doesn't
// expose share-count data for bStocks". It does. get-products carries
// `cs` per symbol: Apple 14,690,000,000, Nokia 5,740,000,000 — the
// underlying company's shares outstanding, so cap = price × cs.
//
// It ships as `metadata.equity_mcap`, NOT `metadata.mcap`, and that
// distinction is load-bearing: `metadata.mcap` is wired straight into
// the SCORED field, where two crypto-calibrated engine rules read it.
// See the long note at the field itself. Display value only; scores
// are byte-identical to before this change.
// When `cs` is missing the field is NULL, never 0 — Rule 4.
//
// WHAT IS EXCLUDED, AND WHY IT IS TWO GATES:
// Binance tags sector/index funds and LEVERAGED funds as bStocks too
// (SPY, QQQ, TQQQ, SQQQ, SOXL, SOXS, SMH, EWY, KORU, DRAM, and four
// 2x single-stock wrappers). The migration plan said single-name
// equities only: a 3x inverse semiconductor fund's momentum is not
// comparable to a stock's, and ranking them together is meaningless.
//
// The explicit deny-list below is the decision record. The name
// heuristic behind it is a NET, not a classifier — it exists so that a
// fund Binance lists tomorrow does not ship unreviewed just because
// nobody updated a constant. Anything the heuristic catches is
// reported in the response under `excluded` with reason 'heuristic',
// which is the signal to add it to FUND_DENYLIST by hand and make the
// decision explicit. A heuristic match is not a permanent answer.
//
// A THIRD exclusion has nothing to do with funds: an equity whose
// ticker is already a crypto ticker in our own universe is held back,
// because holdings are keyed by symbol and the holder would silently be
// shown the token's price. See loadCryptoTickers(). Today that costs us
// exactly one listing, Quantinuum (QNT, vs the Quant token).
//
// Every exclusion, of all three kinds, is reported in the response.
// Nothing disappears quietly.
//
// AUTH — read this before changing the env var name.
// This function has its OWN secret, `BSTOCKS_SYNC_SECRET`, NOT the
// shared `SYNC_SECRET`. Both exist in the project, which is the trap:
// the repo copy of this file read `SYNC_SECRET` while the DEPLOYED
// version read `BSTOCKS_SYNC_SECRET`, and the repo had been wrong since
// at least version 12. Deploying the repo's name would have made the
// function return 401 to its own cron — and pg_cron records no error
// for that, so the sync would simply have stopped, silently, while
// every file still said it was fine.
//
// The vault token `sync_bstocks_token` (see sql/sync_bstocks_cron.sql)
// holds the value this is compared against. Change one and you must
// change the other.
//
// verify_jwt is OFF for this function and must stay off: the cron sends
// a bearer secret, not a real Supabase JWT, so platform JWT
// verification would reject it before this code ever runs.
//
// DEPLOY:
//   supabase functions deploy sync-bstocks --no-verify-jwt
//
// SCHEDULE: see sql/sync_bstocks_cron.sql — once daily at 22:00 UTC,
// after the NYSE close, since 1d klines only produce one candle a day.
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/** Binance's own tag for a tokenized equity, as it appears in `tags`. */
const BSTOCK_TAG = 'bStocks';

/** Binance's undocumented website endpoint — names and share counts. */
const PRODUCTS_URL =
  'https://www.binance.com/bapi/asset/v2/public/asset-service/product/get-products?includeEtf=true';

// ── Gate 1: the decision record ────────────────────────────────
// Every ticker here was looked at and judged not a single-name
// equity. Reviewed 2026-09-16 against the live roster of 77.
const FUND_DENYLIST = new Set<string>([
  'SPY',  'QQQ',  'TQQQ', 'SQQQ',   // broad index + UltraPro long/short
  'SOXL', 'SOXS', 'SMH',  'DRAM',   // semiconductor / memory sector funds
  'EWY',  'KORU',                   // South Korea, plain and 3x
  'SNXX', 'INTW', 'MVLL', 'MUU'     // 2x single-stock wrappers (SNDK/INTC/MRVL/MU)
]);

// ── Gate 2: the net ────────────────────────────────────────────
// Matches fund naming conventions in Binance's own `an` field. Note
// that this would NOT have caught 'SPY' (name: "SPY") or 'TQQQ'
// (name: "ProShares UltraPro QQQ") on its own — which is exactly why
// the deny-list above exists and why this is not the only gate.
const FUND_NAME_RE =
  /\bETF\b|\bTrust\b|\bBull \d|\bBear \d|\b\d+X (Long|Short)\b|UltraPro|iShares|VanEck|Direxion|ProShares|GraniteShares|Roundhill|Invesco|Tradr/i;

/** Symbols fetched in parallel. Matches sync-binance-klines-4h's shape;
    4 rather than 8 because this hits two endpoints per symbol. The
    cron's http_post timeout is 60s, and 63 symbols sequentially with a
    politeness delay ran uncomfortably close to it. */
const CONCURRENCY = 4;

const SUPABASE_URL       = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BSTOCKS_SYNC_SECRET = Deno.env.get('BSTOCKS_SYNC_SECRET')!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

type RosterEntry = { sym: string; binance: string };
type ProductMeta = { name: string | null; shares: number | null };

/**
 * Display ticker from a bStock base asset.
 *
 * Exactly ONE trailing 'B' comes off, never a greedy strip. Two live
 * tickers end in B themselves — RKLB (Rocket Lab) and ALAB (Astera
 * Labs) — so their base assets are RKLBB and ALABB. A /B+$/ regex
 * turns those into RKL and ALA, which are different companies'
 * tickers. Returns null if the base asset is not shaped like a bStock
 * at all, so an unexpected row is skipped rather than mangled.
 */
function tickerFromBase(baseAsset: string): string | null {
  if (!baseAsset || baseAsset.length < 2 || !baseAsset.endsWith('B')) return null;
  return baseAsset.slice(0, -1);
}

/**
 * The roster, from our own table. Throws rather than returning a
 * partial list: syncing a guessed universe is worse than syncing
 * nothing, because the rows that do land look authoritative.
 */
async function loadRoster(): Promise<RosterEntry[]> {
  const { data, error } = await supabase
    .from('binance_symbol_tags')
    .select('base_asset,binance_symbol,tags')
    .contains('tags', [BSTOCK_TAG]);

  if (error) throw new Error(`binance_symbol_tags read failed: ${error.message}`);
  if (!data || !data.length) {
    throw new Error(
      `binance_symbol_tags returned no '${BSTOCK_TAG}' rows — ` +
      'sync-binance-status may not have run, or Binance may have renamed the tag'
    );
  }

  const out: RosterEntry[] = [];
  for (const row of data as { base_asset: string; binance_symbol: string }[]) {
    const sym = tickerFromBase(row.base_asset);
    if (!sym) {
      console.warn(`[sync-bstocks] skipping unexpected base asset: ${row.base_asset}`);
      continue;
    }
    out.push({ sym, binance: row.binance_symbol });
  }
  return out;
}

/**
 * Tickers already used by a crypto coin in the site's own universe.
 *
 * WHY THIS GATE EXISTS. Holdings are stored by SYMBOL, not by coin id
 * (`rot_h5` in js/holdings.js), and the tile resolves one with
 * `coins.find(c => c.sym === h.sym)` — first match wins, and coins[] is
 * sorted by market cap. A bStock carries mcap 0, so on any ticker
 * collision the crypto coin always wins and a holder of the EQUITY
 * silently sees the TOKEN's price. Wrong numbers, no error.
 *
 * Live example the day this was written: Binance lists QNTB
 * (Quantinuum, the quantum-computing company) and the universe already
 * scores QNT (Quant, the token). Nothing in the old 24-ticker roster
 * collided, which is why this never came up before; at 63 it does, and
 * it will keep happening as both lists grow.
 *
 * Detected rather than hardcoded, because BOTH sides move: Binance adds
 * bStocks and sync-coin-universe rewrites the crypto universe. A
 * constant listing QNT would be right today and quietly wrong later.
 *
 * The real fix is to key holdings by coin id, which is a migration
 * across every visitor's localStorage and not this change's job. Until
 * then the equity is held back and reported, because showing the wrong
 * price is worse than not listing the stock.
 *
 * Best-effort: if the universe can't be read, returns an empty set and
 * the sync proceeds. A missed collision is a display bug on one ticker;
 * refusing to sync at all would be worse.
 */
async function loadCryptoTickers(): Promise<Set<string>> {
  const out = new Set<string>();
  try {
    const { data, error } = await supabase
      .from('market_cache')
      .select('data')
      .eq('cache_key', 'cg_markets_all')
      .single();
    if (error) throw new Error(error.message);
    const arr = data?.data;
    if (!Array.isArray(arr) || !arr.length) {
      throw new Error('cg_markets_all is empty or not an array');
    }
    for (const c of arr as any[]) {
      if (c?.symbol) out.add(String(c.symbol).toUpperCase());
    }
  } catch (e) {
    console.warn('[sync-bstocks] crypto ticker collision check unavailable:',
      e instanceof Error ? e.message : e);
  }
  return out;
}

/**
 * Names and share counts, keyed by Binance symbol. Best-effort by
 * design — every caller must cope with an empty map.
 */
async function loadProductMeta(): Promise<Map<string, ProductMeta>> {
  const map = new Map<string, ProductMeta>();
  try {
    const res = await fetch(PRODUCTS_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    const rows = body?.data;
    if (!Array.isArray(rows) || !rows.length) {
      throw new Error('returned no data (shape may have changed)');
    }
    for (const p of rows as any[]) {
      if (!p?.s) continue;
      // `an` reads "Apple (bStocks)" — the suffix is Binance's, not the
      // company's, and does not belong on the site.
      const name = typeof p.an === 'string'
        ? p.an.replace(/\s*\(bStocks\)\s*$/i, '').trim() || null
        : null;
      const cs = Number(p.cs);
      map.set(p.s, {
        name,
        shares: Number.isFinite(cs) && cs > 0 ? cs : null
      });
    }
  } catch (e) {
    // Not fatal. Names fall back, mcap goes NULL, the sync still runs.
    console.warn('[sync-bstocks] get-products enrichment unavailable:',
      e instanceof Error ? e.message : e);
  }
  return map;
}

// ── % change from a klines close-price series ──────────────────
// klines[i] = [openTime, open, high, low, close, volume, ...]
// closes[closes.length-1] is "today" (most recent daily candle).
function pctChange(closes: number[], daysAgo: number): number | null {
  const n = closes.length;
  const idx = n - 1 - daysAgo;
  if (idx < 0 || closes[idx] == null || closes[idx] === 0) return null;
  const latest = closes[n - 1];
  return ((latest - closes[idx]) / closes[idx]) * 100;
}

async function fetchOne(entry: RosterEntry, meta: ProductMeta | undefined) {
  const symbol = entry.binance;

  // 24hr ticker — current price + 24h % change + quote volume.
  // Deliberately the documented /api/v3 endpoint rather than the price
  // fields get-products also carries: the roster may come from the
  // undocumented feed, the numbers should not.
  const tickerRes = await fetch(
    `https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`
  );
  if (!tickerRes.ok) {
    throw new Error(`ticker/24hr ${symbol} -> HTTP ${tickerRes.status}`);
  }
  const ticker = await tickerRes.json();

  // Daily klines, last 31 candles — enough for 7D/14D/30D deltas
  const klinesRes = await fetch(
    `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1d&limit=31`
  );
  if (!klinesRes.ok) {
    throw new Error(`klines ${symbol} -> HTTP ${klinesRes.status}`);
  }
  const klines: unknown[] = await klinesRes.json();
  const closes = (klines as any[]).map((k) => parseFloat(k[4]));

  const price     = parseFloat(ticker.lastPrice);
  const change24h = parseFloat(ticker.priceChangePercent);
  const volume24  = parseFloat(ticker.quoteVolume);

  const p7  = pctChange(closes, 7);
  const p14 = pctChange(closes, 14);
  const p30 = pctChange(closes, 30);

  // NULL, not 0, when either half is unknown — a zero market cap is a
  // claim. See Rule 4.
  const shares = meta?.shares ?? null;
  const equityMcap = (shares != null && Number.isFinite(price) && price > 0)
    ? price * shares
    : null;

  return {
    asset_type:   'stock',
    symbol:       entry.sym,          // display ticker, e.g. 'AAPL'
    name:         meta?.name || entry.sym,
    price:        Number.isFinite(price) ? price : null,
    change_24h:   Number.isFinite(change24h) ? change24h : null,
    source_name:  'binance',
    last_updated: new Date().toISOString(),
    metadata: {
      p7, p14, p30,
      volume24: Number.isFinite(volume24) ? volume24 : null,
      // ── DELIBERATELY NOT `mcap` ──────────────────────────────
      // js/data-loaders.js maps `metadata.mcap` straight onto the
      // scored coin's `mcap`, which the ENGINE reads in two places
      // calibrated entirely on crypto:
      //   • _v2SizeAdjust() — anything over $50B scores +2
      //   • Pillar 4 turnover — volume24/mcap under `dead` while
      //     mcap is over largeCap adds the deadLarge penalty and a
      //     "Low Liquidity (Large Cap)" signal
      // Both would fire on every bStock. AAPL's Binance turnover
      // against Apple's $4.9T cap is ~1.4e-7 — that ratio is an
      // artifact of measuring a wrapper's volume against the whole
      // underlying company, not a liquidity reading, and the +2 would
      // be handed to all of them for being large companies rather
      // than for anything the score is meant to express.
      //
      // So the cap ships under its own key and `mcap` stays absent,
      // which keeps `meta.mcap || 0` resolving to 0 exactly as it has
      // since bStocks launched. Scores do not move. If an equity size
      // or turnover term is ever wanted, it needs its own thresholds
      // and its own measurement — not these.
      equity_mcap: equityMcap,
      shares_outstanding: shares,
      binance_symbol: symbol
    }
  };
}

/** Runs `worker` over `items`, at most `limit` in flight. */
async function pooled<T, R>(
  items: T[], limit: number, worker: (item: T) => Promise<R>
): Promise<void> {
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      await worker(items[i]);
    }
  });
  await Promise.all(runners);
}

Deno.serve(async (req) => {
  // ── Auth: same shared-secret pattern as sync-market-data ──────
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!BSTOCKS_SYNC_SECRET || token !== BSTOCKS_SYNC_SECRET) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // ── Roster + enrichment ───────────────────────────────────────
  let roster: RosterEntry[];
  let productMeta: Map<string, ProductMeta>;
  let cryptoTickers: Set<string>;
  try {
    [roster, productMeta, cryptoTickers] = await Promise.all([
      loadRoster(), loadProductMeta(), loadCryptoTickers()
    ]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[sync-bstocks] roster unavailable:', msg);
    // 503, and nothing written. Existing rows stay as they are and
    // their last_updated shows the staleness honestly.
    return new Response(JSON.stringify({ error: msg, synced: 0 }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // ── Exclusions: funds (two gates) + ticker collisions ─────────
  const excluded: { symbol: string; name: string | null; reason: string }[] = [];
  const universe = roster.filter((e) => {
    const name = productMeta.get(e.binance)?.name ?? null;
    if (FUND_DENYLIST.has(e.sym)) {
      excluded.push({ symbol: e.sym, name, reason: 'denylist' });
      return false;
    }
    if (cryptoTickers.has(e.sym)) {
      console.warn(`[sync-bstocks] ${e.sym} ("${name}") collides with a crypto ticker — held back`);
      excluded.push({ symbol: e.sym, name, reason: 'crypto_ticker_collision' });
      return false;
    }
    if (name && FUND_NAME_RE.test(name)) {
      // Caught by the net, not by a decision. Reported so it can be
      // promoted into FUND_DENYLIST deliberately.
      console.warn(`[sync-bstocks] heuristic excluded ${e.sym} ("${name}") — add to FUND_DENYLIST if correct`);
      excluded.push({ symbol: e.sym, name, reason: 'heuristic' });
      return false;
    }
    return true;
  });
  universe.sort((a, b) => a.sym.localeCompare(b.sym));

  const results: { symbol: string; ok: boolean; error?: string }[] = [];
  const rows: Record<string, unknown>[] = [];

  await pooled(universe, CONCURRENCY, async (entry) => {
    try {
      const row = await fetchOne(entry, productMeta.get(entry.binance));
      rows.push(row);
      results.push({ symbol: entry.sym, ok: true });
    } catch (e) {
      console.error(`[sync-bstocks] ${entry.sym} failed:`, e instanceof Error ? e.message : e);
      results.push({ symbol: entry.sym, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  });

  if (rows.length) {
    const { error } = await supabase
      .from('unified_market_data')
      .upsert(rows, { onConflict: 'asset_type,symbol,source_name' });

    if (error) {
      console.error('[sync-bstocks] upsert failed:', error.message);
      return new Response(JSON.stringify({ error: error.message, results }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  // ── Orphans: reported, NOT deleted ────────────────────────────
  // A stock we hold a row for that Binance no longer tags as a bStock
  // keeps serving its last price forever — the same frozen-price bug
  // sync-binance-spot documents for delisted crypto pairs. Deleting
  // production rows is not this change's job, so this surfaces them
  // instead of acting on them. If this list is ever non-empty, that is
  // the prompt to decide what removal should mean.
  let orphans: string[] = [];
  try {
    const { data: existing } = await supabase
      .from('unified_market_data')
      .select('symbol')
      .eq('asset_type', 'stock')
      .eq('source_name', 'binance');
    const live = new Set(universe.map((e) => e.sym));
    orphans = (existing || [])
      .map((r: { symbol: string }) => r.symbol)
      .filter((s: string) => !live.has(s));
    if (orphans.length) {
      console.warn('[sync-bstocks] rows with no live bStock listing:', orphans.join(', '));
    }
  } catch (e) {
    console.warn('[sync-bstocks] orphan check skipped:', e instanceof Error ? e.message : e);
  }

  const failed = results.filter((r) => !r.ok).length;
  return new Response(
    JSON.stringify({
      roster_size:   roster.length,
      universe_size: universe.length,
      synced:        rows.length,
      with_mcap:     rows.filter((r: any) => r.metadata?.equity_mcap != null).length,
      enrichment:    productMeta.size ? 'ok' : 'unavailable',
      failed,
      excluded,
      orphans,
      results
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
});
