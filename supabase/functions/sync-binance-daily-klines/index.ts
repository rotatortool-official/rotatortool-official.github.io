// ============================================================
// sync-binance-daily-klines — Supabase Edge Function
//
// Caches the daily candles the track record needs to grade past calls,
// so js/signal-history.js and track-record.html stop issuing one
// Binance request per graded symbol from the browser.
//
// WHY: those two files each ran their own copy of the same
// fetch-per-symbol loop. For coins with no Binance listing every one of
// those requests failed noisily in the console (35 of the 105 symbols
// called in the last 45 days). Server-side, a coin with no listing
// simply has no rows and the client falls back to the current-price
// comparison exactly as before — silently, and without the request.
//
// UNIVERSE: symbols actually present in signal_snapshots over the
// lookback window, intersected with what Binance actually lists. It
// self-maintains: a newly called coin appears here on the next run
// without anyone editing a list.
//
// WHY ONLY ~45 DAYS: grading uses the [snap+1d, snap+14d] window and
// Binance's klines endpoint returns at most the last 30 candles, so a
// snapshot older than roughly a month can never be graded from candles
// anyway — it already falls back to current price. Fetching more would
// buy nothing.
//
// CADENCE: every 3 hours. Settled candles never change; only today's is
// still forming, and a 14-day window is not sensitive to a few hours of
// staleness in its last candle.
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL           = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY       = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SIGNAL_RUN_SYNC_SECRET = Deno.env.get('SIGNAL_RUN_SYNC_SECRET')!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

/** Snapshot lookback. See "WHY ONLY ~45 DAYS" above. */
const SNAPSHOT_LOOKBACK_DAYS = 45;
/** Candles per symbol — Binance's practical max for this use. */
const KLINE_LIMIT = 30;
/** Concurrent symbol fetches. */
const CONCURRENCY = 8;
/** Drop candles older than this. */
const RETENTION_DAYS = 60;

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
    const cutoff = new Date(Date.now() - SNAPSHOT_LOOKBACK_DAYS * 864e5)
      .toISOString().slice(0, 10);

    const [{ data: snapRows }, { data: spotRows }] = await Promise.all([
      supabase.from('signal_snapshots').select('coin_sym').gte('snap_date', cutoff),
      supabase.from('binance_spot_metrics').select('base_asset'),
    ]);

    const listed = new Set((spotRows ?? []).map((r: any) => r.base_asset));
    const called = new Set((snapRows ?? []).map((r: any) => String(r.coin_sym || '').toUpperCase()));

    // Only symbols that were called AND are actually listed. Everything
    // else would just be a guaranteed-empty request.
    const wanted = [...called].filter((s) => listed.has(s));

    const results = await mapPool(wanted, CONCURRENCY, async (base) => {
      const res = await fetch(
        `https://api.binance.com/api/v3/klines?symbol=${base}USDT&interval=1d&limit=${KLINE_LIMIT}`);
      if (!res.ok) throw new Error(`${base}: HTTP ${res.status}`);
      const raw = await res.json();
      if (!Array.isArray(raw) || raw.length === 0) throw new Error(`${base}: empty`);

      return raw.map((k: any[]) => ({
        base_asset: base,
        open_time:  new Date(Number(k[0])).toISOString(),
        high:       Number(k[2]),
        low:        Number(k[3]),
        close:      Number(k[4]),
        updated_at: new Date().toISOString(),
      }));
    });

    const rows = results.flat();
    if (rows.length) {
      // PK (base_asset, open_time) means today's still-forming candle is
      // updated in place rather than duplicated on every run.
      const { error: upErr } = await supabase
        .from('binance_daily_klines').upsert(rows, { onConflict: 'base_asset,open_time' });
      if (upErr) throw new Error('klines upsert failed: ' + upErr.message);
    }

    const pruneBefore = new Date(Date.now() - RETENTION_DAYS * 864e5).toISOString();
    await supabase.from('binance_daily_klines').delete().lt('open_time', pruneBefore);

    return new Response(JSON.stringify({
      ok: true,
      symbols_called: called.size,
      symbols_listed_on_binance: wanted.length,
      symbols_skipped_not_listed: called.size - wanted.length,
      symbols_fetched: results.length,
      candles_upserted: rows.length,
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message ?? e) }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
});
