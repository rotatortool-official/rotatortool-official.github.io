// ============================================================
// sync-coin-universe — Supabase Edge Function
//
// Fetches the scored coin universe from CoinGecko and writes it to
// market_cache['cg_markets_all']. One call, all 250 ids (the per_page cap).
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
const COINGECKO_API_KEY      = Deno.env.get('COINGECKO_API_KEY') ?? '';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

/* Below this share of ids resolving, treat the response as broken rather
   than as "those coins are gone". Measured baseline was 167/194 = 86%
   when this was written; since the dead ids were replaced on 2026-09-25
   (promptove/62) it is 250/250. 0.70 still catches a truncated page, and
   a single coin CoinGecko drops is the engine's dataComplete to handle,
   not a reason to refuse the whole universe. */
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
    /* 2026-09-29: CoinGecko's CDN began rejecting the single 250-id request
       (a ~3.1 KB URL) with a CloudFront 403 at 03:26 UTC; the same ids in
       two halves (~1.6 KB each) pass. Verified from a GitHub runner, see
       scripts/sync-coin-universe.mjs. Costs 2 credits a run instead of 1
       (~5,800/month on the Demo plan's 10,000). The Demo key is sent too. */
    const base = 'https://api.coingecko.com/api/v3/coins/markets'
      + '?vs_currency=usd&order=market_cap_desc&per_page=250&page=1&sparkline=false'
      + '&price_change_percentage=7d,14d,30d';
    /* WHICH COINS, since 2026-10-01: the weekly list in market_cache
       'coin_universe' (core + fillers + stables), the same set
       scripts/sync-coin-universe.mjs fetches. The vendored FREE_COINS
       is only the fallback when that row is missing.

       2026-10-01: CoinGecko answers Supabase again, and THIS function is
       the live 15-minute sync; the GitHub copy is disabled in Actions.
       So the two side rows the GitHub script writes are written here
       too, after cg_markets_all (see the end of this handler). */
    const { data: uniRow } = await supabase
      .from('market_cache').select('data').eq('cache_key', 'coin_universe').maybeSingle();
    const uni = uniRow?.data as {
      core?: string[]; fillers?: string[]; stables?: string[]; retired?: { id: string }[];
    } | undefined;
    const WANTED: string[] = uni && Array.isArray(uni.core) && uni.core.length >= 200
      ? [...new Set([...uni.core, ...(uni.fillers ?? []), ...(uni.stables ?? [])])]
      : FREE_COINS;
    const half = Math.ceil(WANTED.length / 2);
    const rows: Record<string, unknown>[] = [];
    for (const ids of [WANTED.slice(0, half), WANTED.slice(half)]) {
      const res = await fetch(base + '&ids=' + encodeURIComponent(ids.join(',')), {
        headers: {
          'Accept': 'application/json',
          ...(COINGECKO_API_KEY ? { 'x-cg-demo-api-key': COINGECKO_API_KEY } : {}),
        },
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`coins/markets -> HTTP ${res.status} ${body.slice(0, 200)}`);
      }
      const part = await res.json();
      if (!Array.isArray(part)) throw new Error('coins/markets did not return an array');
      rows.push(...part);
    }

    const resolved = rows.length / WANTED.length;
    if (resolved < MIN_RESOLVED_SHARE) {
      throw new Error(
        `only ${rows.length} of ${WANTED.length} ids resolved `
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

    /* ── Side rows, best effort: neither may fail the price sync. ──
       Same behaviour as scripts/sync-coin-universe.mjs. */
    const cacheWrite = (key: string, data: unknown) => supabase.from('market_cache').upsert(
      { cache_key: key, data, updated_at: new Date().toISOString() }, { onConflict: 'cache_key' },
    );

    // Daily volume for the 7-day average (8 UTC days kept, today overwritten).
    let volumeDays = 0;
    try {
      const { data: vRow } = await supabase
        .from('market_cache').select('data').eq('cache_key', 'coin_volume_days').maybeSingle();
      const days = (vRow?.data ?? {}) as Record<string, Record<string, number>>;
      const vols: Record<string, number> = {};
      for (const r of rows as { id: string; total_volume?: number }[]) {
        if (Number.isFinite(r.total_volume)) vols[r.id] = Math.round(r.total_volume as number);
      }
      days[new Date().toISOString().slice(0, 10)] = vols;
      const keep = Object.keys(days).sort().slice(-8);
      const { error: vErr } = await cacheWrite('coin_volume_days', Object.fromEntries(keep.map((d) => [d, days[d]])));
      if (vErr) throw vErr;
      volumeDays = keep.length;
    } catch (e) {
      console.warn('[sync-coin-universe] coin_volume_days not updated:', (e as Error).message);
    }

    // Coins that left the list, hourly, for the visitors who still hold them.
    let retiredWritten: number | null = null;
    try {
      const live = new Set(WANTED);
      const retiredIds = (uni?.retired ?? []).map((r) => r.id).filter((id) => id && !live.has(id));
      const { data: rRow } = await supabase
        .from('market_cache').select('updated_at').eq('cache_key', 'cg_markets_retired').maybeSingle();
      const age = rRow?.updated_at ? Date.now() - Date.parse(rRow.updated_at) : Infinity;
      if (retiredIds.length && age > 55 * 60 * 1000) {
        const ret: unknown[] = [];
        for (let i = 0; i < retiredIds.length; i += 100) {
          const res = await fetch(base + '&ids=' + encodeURIComponent(retiredIds.slice(i, i + 100).join(',')), {
            headers: {
              'Accept': 'application/json',
              ...(COINGECKO_API_KEY ? { 'x-cg-demo-api-key': COINGECKO_API_KEY } : {}),
            },
          });
          if (!res.ok) throw new Error(`retired coins/markets -> HTTP ${res.status}`);
          ret.push(...await res.json());
        }
        const { error: rErr } = await cacheWrite('cg_markets_retired', ret);
        if (rErr) throw rErr;
        retiredWritten = ret.length;
      }
    } catch (e) {
      console.warn('[sync-coin-universe] cg_markets_retired not updated:', (e as Error).message);
    }

    return new Response(JSON.stringify({
      ok: true,
      requested: WANTED.length,
      returned: rows.length,
      with_market_cap: withMcap,
      with_30d: with30d,
      volume_days: volumeDays,
      retired_written: retiredWritten,
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
