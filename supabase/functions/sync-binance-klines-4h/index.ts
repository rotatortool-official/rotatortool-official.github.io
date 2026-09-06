// ============================================================
// sync-binance-klines-4h — Supabase Edge Function
//
// Caches raw 4h candles for the Pro Insight Engine, so js/signals.js
// stops calling api.binance.com from the browser. This removes the LAST
// of the four direct Binance calls the website made.
//
// RAW CANDLES, NOT COMPUTED INDICATORS — deliberate. Storing rsi/macd/bb
// would mean reimplementing _calcRSI, _calcMACD and _calcBollinger in
// TypeScript, creating a second copy of that maths to drift out of sync
// with js/signals.js. This project has already been bitten by exactly
// that failure mode (three separate scoring implementations — see
// promptove/). Caching the INPUTS lets the client keep its existing
// functions unchanged, so there is still only one implementation.
//
// UNIVERSE: the site's own coins that Binance actually trades. Holdings
// and watchlists are per-visitor and the server cannot know them, so it
// covers everything a visitor could possibly hold — which is exactly the
// site's coin list. ~118 symbols against 177 site coins; the rest have
// no Binance pair and keep the existing proxy-RSI fallback.
//
// CADENCE: every 2 hours. Candles are 4h, so only the forming one moves,
// and the Insight Engine's thresholds are not sensitive to sub-candle
// drift.
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL           = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY       = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SIGNAL_RUN_SYNC_SECRET = Deno.env.get('SIGNAL_RUN_SYNC_SECRET')!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

/** Candles per symbol. Matches what js/signals.js always requested. */
const KLINE_LIMIT = 100;
/** js/signals.js rejects series shorter than this, so don't store them. */
const MIN_CANDLES = 30;
const CONCURRENCY = 8;

async function mapPool<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      try { out.push(await fn(items[idx])); } catch { /* skip; retried next run */ }
    }
  }));
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
    // Site coins ∩ what Binance actually trades. binance_spot_metrics is
    // already filtered to TRADING pairs and past the ticker-collision
    // guard, so reusing it inherits both protections for free.
    const [{ data: mkRow }, { data: spotRows }] = await Promise.all([
      supabase.from('market_cache').select('data').eq('cache_key', 'cg_markets_all').maybeSingle(),
      supabase.from('binance_spot_metrics').select('base_asset'),
    ]);

    const tradable = new Set((spotRows ?? []).map((r: any) => r.base_asset));
    const siteCoins: any[] = Array.isArray(mkRow?.data) ? mkRow!.data : [];

    const wanted: string[] = [];
    for (const c of siteCoins) {
      const sym = String(c?.symbol || '').toUpperCase();
      if (sym && tradable.has(sym) && wanted.indexOf(sym) < 0) wanted.push(sym);
    }

    if (!wanted.length) {
      return new Response(JSON.stringify({
        ok: true, note: 'no site coins resolved — market cache empty?',
        site_coins: siteCoins.length, tradable: tradable.size, stored: 0,
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    const now = new Date().toISOString();
    let tooShort = 0;

    const rows = await mapPool(wanted, CONCURRENCY, async (base) => {
      const res = await fetch(
        `https://api.binance.com/api/v3/klines?symbol=${base}USDT&interval=4h&limit=${KLINE_LIMIT}`);
      if (!res.ok) throw new Error(`${base}: HTTP ${res.status}`);
      const raw = await res.json();
      if (!Array.isArray(raw)) throw new Error(`${base}: not an array`);
      if (raw.length < MIN_CANDLES) { tooShort++; throw new Error(`${base}: only ${raw.length}`); }

      return {
        base_asset:   base,
        closes:       raw.map((k: any[]) => Number(k[4])),
        volumes:      raw.map((k: any[]) => Number(k[5])),
        candle_count: raw.length,
        updated_at:   now,
      };
    });

    if (rows.length) {
      const { error: upErr } = await supabase
        .from('binance_klines_4h').upsert(rows, { onConflict: 'base_asset' });
      if (upErr) throw new Error('klines_4h upsert failed: ' + upErr.message);
    }

    // Drop rows this run did not refresh — a coin that left the site's
    // list or stopped trading should not linger with frozen candles.
    const { error: pruneErr } = await supabase
      .from('binance_klines_4h').delete().lt('updated_at', now);
    if (pruneErr) throw new Error('prune failed: ' + pruneErr.message);

    return new Response(JSON.stringify({
      ok: true,
      site_coins: siteCoins.length,
      tradable_on_binance: tradable.size,
      requested: wanted.length,
      stored: rows.length,
      failed_or_short: wanted.length - rows.length,
      too_short: tooShort,
      updated_at: now,
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message ?? e) }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
});
