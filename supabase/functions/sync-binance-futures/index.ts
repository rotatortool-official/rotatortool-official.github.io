// ============================================================
// sync-binance-futures — Supabase Edge Function
//
// Step 3 of the Binance integration. Fetches USDⓈ-M futures metrics
// into binance_futures_metrics + binance_futures_history so the
// website can READ them from Supabase and never call Binance itself.
//
// WHY THE WEBSITE MUST NOT CALL BINANCE DIRECTLY:
// not CORS — that was tested from the production origin and Binance
// answers browsers fine. The real reasons are (a) Binance geo-blocks
// some regions with HTTP 451, so a visitor there would silently get
// nothing, and (b) every visitor otherwise re-fetches identical data.
//
// CALL BUDGET — this is the whole design constraint:
//   3 bulk calls cover EVERY symbol no matter how many we track:
//     fapi/v1/exchangeInfo   -> perp list + underlyingSubType (category)
//     fapi/v1/premiumIndex   -> funding rate + mark/index price (all)
//     fapi/v1/ticker/24hr    -> futures price + volume (all)
//   Everything else is per-symbol, so those are what scale with
//   universe size — 3 calls per symbol:
//     futures/data/openInterestHist            -> OI + 1h/24h change
//     futures/data/globalLongShortAccountRatio -> positioning
//     futures/data/takerlongshortRatio         -> aggressive flow
//   They are therefore rotated: each run refreshes the OI_BATCH stalest
//   symbols (order by detail_updated_at nulls first), which
//   self-balances, needs no cursor, and naturally retries symbols that
//   failed. 75 symbols x 3 calls per 30 min stays far inside Binance's
//   futures/data limit (~1000 req / 5 min per IP).
//
// openInterestHist is used rather than openInterest: same one call per
// symbol, but it returns a 24-point series, so current OI *and* the 1h
// and 24h changes all come from a single request. That is what removes
// the need to store a history table just to compute deltas.
//
// SCHEDULE: cron every 30 min (see sql/sync_binance_futures_cron.sql).
// Auth reuses SIGNAL_RUN_SYNC_SECRET, already set project-wide.
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL           = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY       = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SIGNAL_RUN_SYNC_SECRET = Deno.env.get('SIGNAL_RUN_SYNC_SECRET')!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const FAPI = 'https://fapi.binance.com';

/** How many coins to track, ranked by market cap, that have a USDT perp. */
const UNIVERSE_SIZE = 300;
/** Per-symbol OI refreshes per run. 75 @ 30min => each symbol every ~2h. */
const OI_BATCH = 75;
/** Concurrent OI requests in flight. */
const OI_CONCURRENCY = 8;
/** Drop history older than this. */
const HISTORY_RETENTION_DAYS = 180;

async function getJson(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

/** Bounded-concurrency map — keeps us well inside the function's wall clock
 *  and inside Binance's futures/data rate limit. */
async function mapPool<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      try { out.push(await fn(items[idx])); } catch { /* leave row stale; retried next run */ }
    }
  });
  await Promise.all(workers);
  return out;
}

Deno.serve(async (req: Request) => {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!SIGNAL_RUN_SYNC_SECRET || token !== SIGNAL_RUN_SYNC_SECRET) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    // ── 1. Three bulk calls cover every symbol ──────────────────────
    const [exInfo, premium, ticker] = await Promise.all([
      getJson(`${FAPI}/fapi/v1/exchangeInfo`),
      getJson(`${FAPI}/fapi/v1/premiumIndex`),
      getJson(`${FAPI}/fapi/v1/ticker/24hr`),
    ]);

    // Live USDT perpetuals only, with Binance's own category and listing date.
    const perps = new Map<string, {
      base: string; category: string | null; onboard: string | null;
    }>();
    for (const s of exInfo.symbols ?? []) {
      if (s.contractType === 'PERPETUAL' && s.status === 'TRADING' && s.quoteAsset === 'USDT') {
        perps.set(s.symbol, {
          base: s.baseAsset,
          category: Array.isArray(s.underlyingSubType) && s.underlyingSubType.length
            ? s.underlyingSubType[0] : null,
          onboard: s.onboardDate ? new Date(Number(s.onboardDate)).toISOString() : null,
        });
      }
    }

    // ── 2. Universe = top N by market cap that actually have a perp ──
    // Reuses the same visitor-populated cache compute-signal-run reads,
    // so no extra CoinGecko call is made here.
    const { data: mkRow } = await supabase
      .from('market_cache').select('data').eq('cache_key', 'cg_markets_all').maybeSingle();
    const coins: any[] = mkRow?.data?.data ?? [];

    const wanted = new Map<string, { base: string; category: string | null; onboard: string | null }>();
    for (const c of coins) {                       // already mcap-ordered
      const sym = String(c.symbol || '').toUpperCase() + 'USDT';
      const hit = perps.get(sym);
      if (hit && !wanted.has(sym)) wanted.set(sym, hit);
      if (wanted.size >= UNIVERSE_SIZE) break;
    }
    // Cold start (empty/failed cache): fall back to Binance's own list so
    // the job still does something useful rather than writing nothing.
    if (wanted.size === 0) {
      for (const [sym, v] of perps) {
        wanted.set(sym, v);
        if (wanted.size >= UNIVERSE_SIZE) break;
      }
    }

    const premiumBy = new Map(premium.map((p: any) => [p.symbol, p]));
    const tickerBy  = new Map(ticker.map((t: any) => [t.symbol, t]));
    const now = new Date().toISOString();

    const bulkRows = [...wanted.entries()].map(([symbol, meta]) => {
      const p: any = premiumBy.get(symbol);
      const t: any = tickerBy.get(symbol);
      return {
        symbol,
        base_asset: meta.base,
        binance_category: meta.category,
        onboard_date:         meta.onboard,
        // Advances only while the symbol is still in the live TRADING perp
        // list, so a delisted contract is spotted by this going stale.
        last_seen_at:         now,
        last_price:           t ? Number(t.lastPrice) : null,
        price_change_pct_24h: t ? Number(t.priceChangePercent) : null,
        volume_24h_quote:     t ? Number(t.quoteVolume) : null,
        funding_rate:         p ? Number(p.lastFundingRate) : null,
        next_funding_time:    p?.nextFundingTime ? new Date(Number(p.nextFundingTime)).toISOString() : null,
        mark_price:           p ? Number(p.markPrice) : null,
        index_price:          p ? Number(p.indexPrice) : null,
        bulk_updated_at:      now,
        updated_at:           now,
      };
    });

    // onConflict merges into existing rows, leaving per-symbol OI columns
    // untouched — bulk and detail refresh independently by design.
    const { error: upErr } = await supabase
      .from('binance_futures_metrics').upsert(bulkRows, { onConflict: 'symbol' });
    if (upErr) throw new Error('metrics upsert failed: ' + upErr.message);

    // ── 3. Open interest for the stalest slice ──────────────────────
    // base_asset comes along because PostgREST's upsert is a full INSERT
    // with ON CONFLICT — omitting a NOT NULL column fails even when the
    // row already exists. Selecting it here also covers symbols still in
    // the table but no longer in the current top-N universe.
    const { data: stale } = await supabase
      .from('binance_futures_metrics')
      .select('symbol, base_asset')
      .order('detail_updated_at', { ascending: true, nullsFirst: true })
      .limit(OI_BATCH);

    const staleSyms: { symbol: string; base_asset: string }[] = stale ?? [];

    const oiRows = await mapPool(staleSyms, OI_CONCURRENCY, async ({ symbol, base_asset }) => {
      // period=1h & limit=24 gives current OI plus 1h and 24h change
      // from a single request.
      const hist = await getJson(
        `${FAPI}/futures/data/openInterestHist?symbol=${symbol}&period=1h&limit=24`);
      if (!Array.isArray(hist) || hist.length === 0) throw new Error('no oi history');

      const latest = hist[hist.length - 1];
      const oiVal  = Number(latest.sumOpenInterestValue);
      const prev1h = hist.length >= 2 ? Number(hist[hist.length - 2].sumOpenInterestValue) : null;
      const prev24 = Number(hist[0].sumOpenInterestValue);
      const pct = (from: number | null, to: number) =>
        from && from > 0 ? ((to - from) / from) * 100 : null;

      // Positioning is best-effort: these feeds don't exist for every
      // contract, and a missing one must not cost us the OI reading we
      // already paid for. Note an unknown symbol returns HTTP 200 with an
      // EMPTY ARRAY rather than an error, so length is what to check.
      const lastOf = async (path: string, field: string): Promise<number | null> => {
        try {
          const rows = await getJson(`${FAPI}/futures/data/${path}?symbol=${symbol}&period=1h&limit=1`);
          if (!Array.isArray(rows) || rows.length === 0) return null;
          const v = Number(rows[rows.length - 1][field]);
          return Number.isFinite(v) ? v : null;
        } catch { return null; }
      };

      const [longShort, takerRatio] = await Promise.all([
        lastOf('globalLongShortAccountRatio', 'longShortRatio'),
        lastOf('takerlongshortRatio', 'buySellRatio'),
      ]);

      return {
        symbol,
        base_asset,
        open_interest:        Number(latest.sumOpenInterest),
        open_interest_value:  oiVal,
        oi_change_1h_pct:     pct(prev1h, oiVal),
        oi_change_24h_pct:    pct(prev24, oiVal),
        long_short_ratio:     longShort,
        taker_buy_sell_ratio: takerRatio,
        detail_updated_at:    new Date().toISOString(),
        updated_at:           new Date().toISOString(),
      };
    });

    if (oiRows.length) {
      const { error: oiErr } = await supabase
        .from('binance_futures_metrics').upsert(oiRows, { onConflict: 'symbol' });
      if (oiErr) throw new Error('oi upsert failed: ' + oiErr.message);
    }

    // ── 4. Hourly history — upsert into the current hour bucket ─────
    const bucket = new Date();
    bucket.setUTCMinutes(0, 0, 0);
    const bucketIso = bucket.toISOString();
    const oiBy = new Map(oiRows.map((r: any) => [r.symbol, r]));

    const histRows = bulkRows.map((r) => ({
      symbol: r.symbol,
      bucket: bucketIso,
      open_interest_value: oiBy.get(r.symbol)?.open_interest_value ?? null,
      funding_rate: r.funding_rate,
      last_price: r.last_price,
    }));

    const { error: hErr } = await supabase
      .from('binance_futures_history').upsert(histRows, { onConflict: 'symbol,bucket' });
    if (hErr) throw new Error('history upsert failed: ' + hErr.message);

    // Cheap prune; the PK already bounds growth to 24 rows/symbol/day.
    const cutoff = new Date(Date.now() - HISTORY_RETENTION_DAYS * 864e5).toISOString();
    await supabase.from('binance_futures_history').delete().lt('bucket', cutoff);

    return new Response(JSON.stringify({
      ok: true,
      perps_live: perps.size,
      universe: bulkRows.length,
      oi_refreshed: oiRows.length,
      oi_requested: staleSyms.length,
      history_rows: histRows.length,
      bucket: bucketIso,
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message ?? e) }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
});
