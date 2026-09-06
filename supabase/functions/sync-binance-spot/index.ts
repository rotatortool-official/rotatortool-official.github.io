// ============================================================
// sync-binance-spot — Supabase Edge Function
//
// Caches Binance's spot ticker into binance_spot_metrics so the website
// can read it from Supabase instead of calling api.binance.com from
// every visitor's browser.
//
// WHY: the browser previously downloaded the FULL ticker payload
// (~500KB, every USDT pair on Binance) on each page load, per visitor,
// just to use three fields. Server-side it is one call for everyone.
// Binance also geo-blocks some regions with HTTP 451, so a visitor there
// silently got no Binance prices at all and fell back to CoinGecko
// without anything indicating why.
//
// WHAT BINANCE CONTRIBUTES — and what it cannot:
// only price, 24h change and 24h quote volume. Market cap and the
// 7d/14d/30d changes that L1 ranks on have NO Binance equivalent and
// come from CoinGecko. The two sources complement each other; neither
// is a fallback for the other. If this table is empty or unreachable,
// js/data-loaders.js simply keeps CoinGecko's values — the
// `bnb ? bnb.price : c.current_price` pattern already degrades cleanly.
//
// DELISTED PAIRS ARE EXCLUDED — this is a deliberate departure from
// what the client used to do, and it fixes a real bug rather than
// changing behaviour for its own sake.
//
// Binance's ticker keeps returning delisted pairs indefinitely, frozen
// at their final price. The old client filtered only on
// `endsWith('USDT')`, so those stale prices overrode CoinGecko's real
// ones. Measured on live data: FTM served at $0.70 against a true
// $0.03 (+2233%), OMNI $3.88 vs $0.15, EOS $0.78 vs $0.08, HNT $4.67
// vs $0.59. Every one of them was already flagged in
// binance_delisted_symbols — the price path just never consulted it.
//
// exchangeInfo is therefore fetched alongside the ticker and only
// status === 'TRADING' USDT pairs are stored. It also supplies the true
// baseAsset instead of inferring it with slice(0, -4).
//
// SCHEDULE: every 5 min (see sql/sync_binance_spot_cron.sql). It is a
// single bulk call, so cadence is cheap; 5 min matches the shared
// CoinGecko cache TTL the site already runs on.
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL           = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY       = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SIGNAL_RUN_SYNC_SECRET = Deno.env.get('SIGNAL_RUN_SYNC_SECRET')!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

Deno.serve(async (req: Request) => {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!SIGNAL_RUN_SYNC_SECRET || token !== SIGNAL_RUN_SYNC_SECRET) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const [tickerRes, exRes] = await Promise.all([
      fetch('https://api.binance.com/api/v3/ticker/24hr'),
      fetch('https://api.binance.com/api/v3/exchangeInfo'),
    ]);
    if (!tickerRes.ok) throw new Error(`ticker/24hr -> HTTP ${tickerRes.status}`);
    if (!exRes.ok)     throw new Error(`exchangeInfo -> HTTP ${exRes.status}`);

    const all    = await tickerRes.json();
    const exInfo = await exRes.json();
    if (!Array.isArray(all)) throw new Error('ticker/24hr did not return an array');

    // Only pairs Binance still actually trades. See the header note.
    const tradingBase = new Map<string, string>();
    for (const s of exInfo.symbols ?? []) {
      if (s.status === 'TRADING' && s.quoteAsset === 'USDT') {
        tradingBase.set(s.symbol, s.baseAsset);
      }
    }
    if (!tradingBase.size) throw new Error('exchangeInfo returned no TRADING USDT pairs');

    // ── Ticker-collision guard ───────────────────────────────────────
    // Matching Binance pairs to site coins by ticker alone can pair two
    // DIFFERENT assets that happen to share a symbol. Real case: FRAX.
    // CoinGecko's `frax` is the ~$1 stablecoin; Binance's FRAXUSDT is
    // the post-rebrand token at ~$0.30. Storing that hands the site a
    // 70% wrong price for a coin it labels a stablecoin.
    //
    // Rather than hardcode a list that needs maintaining, reject any
    // pair whose price disagrees with CoinGecko beyond a threshold no
    // genuine exchange-vs-aggregate spread reaches. Liquid pairs sit
    // well under 1%; anything past 25% is a different asset or stale
    // data, not a price. Fails OPEN — if the CoinGecko cache is missing
    // the guard simply does not run, rather than emptying the table.
    const MAX_DIVERGENCE_PCT = 25;
    const { data: mkRow } = await supabase
      .from('market_cache').select('data').eq('cache_key', 'cg_markets_all').maybeSingle();
    const cgPrice = new Map<string, number>();
    if (Array.isArray(mkRow?.data)) {
      for (const c of mkRow!.data as any[]) {
        const p = Number(c?.current_price);
        if (c?.symbol && Number.isFinite(p) && p > 0) {
          cgPrice.set(String(c.symbol).toUpperCase(), p);
        }
      }
    }

    const now = new Date().toISOString();
    const skippedNotTrading: string[] = [];
    const skippedDiverged: string[] = [];

    const rows = all
      .filter((t: any) => {
        if (typeof t.symbol !== 'string' || !t.symbol.endsWith('USDT')) return false;
        if (tradingBase.has(t.symbol)) return true;
        skippedNotTrading.push(t.symbol);
        return false;
      })
      .map((t: any) => ({
        symbol:               t.symbol,
        base_asset:           tradingBase.get(t.symbol)!,
        last_price:           Number(t.lastPrice)          || null,
        price_change_pct_24h: Number(t.priceChangePercent) || null,
        volume_24h_quote:     Number(t.quoteVolume)        || null,
        updated_at:           now,
      }))
      // A pair quoting zero across the board is delisted-in-place; storing
      // it would hand the site a 0 price to display.
      .filter((r: any) => r.last_price !== null && r.last_price > 0)
      // Ticker-collision guard — see note above.
      .filter((r: any) => {
        const cg = cgPrice.get(r.base_asset);
        if (!cg) return true;                       // not a site coin, or no reference
        const divergence = Math.abs((r.last_price - cg) / cg) * 100;
        if (divergence > MAX_DIVERGENCE_PCT) {
          skippedDiverged.push(`${r.base_asset} (binance ${r.last_price} vs cg ${cg})`);
          return false;
        }
        return true;
      });

    if (!rows.length) throw new Error('no usable USDT pairs parsed');

    const { error: upErr } = await supabase
      .from('binance_spot_metrics').upsert(rows, { onConflict: 'symbol' });
    if (upErr) throw new Error('spot upsert failed: ' + upErr.message);

    // Remove pairs this run did not refresh, so the table always means
    // "currently listed on Binance spot" rather than accumulating symbols
    // that quietly disappeared. Every surviving row carries this run's
    // `now`, so the comparison is exact.
    const { error: pruneErr } = await supabase
      .from('binance_spot_metrics').delete().lt('updated_at', now);
    if (pruneErr) throw new Error('prune failed: ' + pruneErr.message);

    return new Response(JSON.stringify({
      ok: true,
      pairs_returned: all.length,
      usdt_pairs_trading: tradingBase.size,
      usdt_pairs_stored: rows.length,
      skipped_not_trading: skippedNotTrading.length,
      skipped_sample: skippedNotTrading.slice(0, 8),
      skipped_diverged: skippedDiverged.length,
      skipped_diverged_detail: skippedDiverged,
      cg_reference_coins: cgPrice.size,
      updated_at: now,
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message ?? e) }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
});
