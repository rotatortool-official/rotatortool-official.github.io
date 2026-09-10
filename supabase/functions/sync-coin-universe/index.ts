// ============================================================
// sync-coin-universe — Supabase Edge Function
//
// Fetches the scored coin universe from CoinGecko and writes it to
// market_cache['cg_markets_all']. One call, all 194 ids.
//
// WHY THIS EXISTS, added 2026-09-10.
//
// Until now NOTHING on the server fetched the coin universe. It was
// fetched by the VISITOR'S BROWSER, in four batches, and written to the
// shared cache. compute-signal-run — which runs every 15 minutes on a
// cron — then scored whatever the last visitor happened to leave behind.
//
// ARCHITECTURE-MAP.md listed INGEST as owned by the sync-* functions.
// For the single most important dataset in the project that was not
// true, and the cost was measurable. From signal_runs.input_freshness,
// which has been stamping the age of this cache on every run:
//
//   day      runs   median age   worst    runs on data >1h old
//   09-06      99       40 min   10.1 h                     46
//   09-08      96       48 min    9.7 h                     43
//   09-09      96       51 min   11.8 h                     46
//   09-10      87       83 min    6.7 h                     47
//
// Roughly half of every run scored prices more than an hour old, worst
// case just under twelve hours, on a tool whose whole premise is a
// 15-minute rotation cadence. Not a rounding error — most of the point.
//
// It also meant the system got LESS accurate the fewer visitors it had,
// which is the opposite of how a private tool should behave.
//
// ONE CALL, NOT FOUR. The browser split the universe into batches of 50
// with a comment citing "CoinGecko's per_page limit". The limit is 250.
// Verified 2026-09-10: 194 ids in a single request returns all 167 that
// resolve, with 7d/14d/30d changes and full supply fields. So this costs
// 4 calls an hour, about 2,900 a month, comfortably inside the free
// tier — where four batches every 15 minutes would have been ~11,500 and
// over it.
//
// It also leaves room for 56 more coins at zero additional cost.
//
// SCHEDULE: minutes 11, 26, 41, 56 — a few minutes BEFORE
// compute-signal-run's */15, so every scoring run reads data about four
// minutes old rather than racing the fetch. See
// sql/sync_coin_universe_cron.sql.
//
// FAILS CLOSED ON A BAD PAYLOAD. A partial or empty response must never
// overwrite a good cache: compute-signal-run would then score a universe
// that had silently shrunk. The guards below are the same shape as
// fetchMacro()'s "never write a row of all-nulls".
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { FREE_COINS } from './_vendor/coin-universe.mjs';

const SUPABASE_URL           = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY       = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SIGNAL_RUN_SYNC_SECRET = Deno.env.get('SIGNAL_RUN_SYNC_SECRET')!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

/* Below this share of ids resolving, treat the response as broken rather
   than as "those coins are gone". Measured baseline is 167/194 = 86%;
   27 ids simply do not resolve on CoinGecko and that is longstanding.
   0.70 sits clear of the baseline and still catches a truncated page. */
const MIN_RESOLVED_SHARE = 0.70;

/* The fields the engine and the site actually read. Checked on the
   response rather than assumed, because a silently changed CoinGecko
   schema would otherwise reach scoring as a universe of zeros. */
const REQUIRED_FIELDS = [
  'id', 'symbol', 'current_price', 'market_cap', 'total_volume',
  'circulating_supply', 'total_supply',
  'price_change_percentage_7d_in_currency',
  'price_change_percentage_30d_in_currency',
];

Deno.serve(async (req: Request) => {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!SIGNAL_RUN_SYNC_SECRET || token !== SIGNAL_RUN_SYNC_SECRET) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const url = 'https://api.coingecko.com/api/v3/coins/markets'
      + '?vs_currency=usd&order=market_cap_desc&per_page=250&page=1&sparkline=false'
      + '&price_change_percentage=7d,14d,30d'
      + '&ids=' + encodeURIComponent(FREE_COINS.join(','));

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RotatorSync/1.0; +https://rotatortool-official.github.io)',
        'Accept': 'application/json',
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`coins/markets -> HTTP ${res.status} ${body.slice(0, 200)}`);
    }

    const rows = await res.json();
    if (!Array.isArray(rows)) throw new Error('coins/markets did not return an array');

    const resolved = rows.length / FREE_COINS.length;
    if (resolved < MIN_RESOLVED_SHARE) {
      throw new Error(
        `only ${rows.length} of ${FREE_COINS.length} ids resolved `
        + `(${(resolved * 100).toFixed(0)}%, floor ${MIN_RESOLVED_SHARE * 100}%) — not overwriting the cache`,
      );
    }

    /* One well-formed row is enough to prove the schema; the per-coin
       nulls that legitimately occur (a new listing with no 30d history)
       are the engine's dataComplete flag to handle, not this function's. */
    const sample = rows[0] ?? {};
    const missing = REQUIRED_FIELDS.filter((f) => !(f in sample));
    if (missing.length) {
      throw new Error(`response is missing expected fields: ${missing.join(', ')}`);
    }

    const { error } = await supabase.from('market_cache').upsert(
      { cache_key: 'cg_markets_all', data: rows, updated_at: new Date().toISOString() },
      { onConflict: 'cache_key' },
    );
    if (error) throw error;

    const withMcap = rows.filter((r: Record<string, unknown>) => Number(r.market_cap) > 0).length;
    const with30d = rows.filter(
      (r: Record<string, unknown>) => r.price_change_percentage_30d_in_currency != null,
    ).length;

    console.log(`[sync-coin-universe] wrote ${rows.length} coins `
      + `(${withMcap} with mcap, ${with30d} with 30d)`);

    return new Response(JSON.stringify({
      ok: true,
      requested: FREE_COINS.length,
      returned: rows.length,
      with_market_cap: withMcap,
      with_30d: with30d,
      ts: new Date().toISOString(),
    }, null, 2), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    console.error('[sync-coin-universe] failed:', msg);
    /* 500 so the cron's response row records the failure. The previous
       cache is left untouched, which is the correct degradation: stale
       is recoverable, a truncated universe scored as real is not. */
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
});
