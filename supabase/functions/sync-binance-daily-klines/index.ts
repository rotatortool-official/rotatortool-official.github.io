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
// UNIVERSE: symbols called in signal_snapshots over the lookback window,
// UNION the latest signal run's own coins, intersected with what Binance
// actually lists. It self-maintains: a newly called or newly tracked
// coin appears here on the next run without anyone editing a list.
//
// WHY ONLY ~45 DAYS: grading uses the [snap+1d, snap+14d] window, so a
// snapshot older than roughly a month can never be graded from candles
// anyway — it already falls back to current price.
//
// (An earlier version of this note said Binance "returns at most the
// last 30 candles". That was never true — /api/v3/klines accepts limit
// up to 1000. 30 was just what grading needed, and the claim then got
// treated as a hard ceiling. Corrected 2026-09-06.)
//
// SECOND CONSUMER, added 2026-09-06: the leaderboard's metric lenses.
// This function now also DERIVES indicators from the candles it just
// fetched and writes them to coin_technicals — RSI(14) daily and weekly,
// the fast/slow MAs, and the 60/125 cross state.
//
// Derived here, not in the browser, on purpose: the candle table is
// ~16,000 rows and none of it needs to leave Supabase. The page reads one
// small row per coin instead of every candle, so adding indicators costs
// the visitor a single cached request rather than a per-tab recompute.
//
// Weekly RSI(14) needs ~105 daily candles, which is why KLINE_LIMIT moved
// to 140. Daily RSI(14) needs 15 and came free with it. Grading is
// unaffected — it reads the same rows and simply ignores the older ones.
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
/** Candles per symbol.
 *
 * Was 30, with a comment calling that "Binance's practical max" — it is not.
 * /api/v3/klines accepts limit up to 1000; 30 was simply what the
 * track-record lookback needed.
 *
 * 140, and the cross is 60/125 rather than the classic 50/200.
 *
 * 50/200 would need 200 bars just to state which side a coin is on, plus
 * more to date a flip. 60/125 is a recognised shorter-horizon variant
 * (roughly 3-month vs 6-month in trading days) and fits inside 140 with
 * ~15 days of MA125 history to date a recent flip. Chosen deliberately:
 * a lighter sync for a slightly shorter horizon.
 *
 * Weekly RSI(14) (~105 bars) and daily RSI(14) (15) both fit underneath.
 * Still request weight 2 — the 101-500 band — not 5, which starts at 501. */
const KLINE_LIMIT = 140;
/** Concurrent symbol fetches. */
const CONCURRENCY = 8;
/** Drop candles older than this.
 *
 * MUST stay comfortably above KLINE_LIMIT. At 140 bars with the old
 * 60-day retention, every run would fetch 140 candles and then delete
 * the oldest 80 of them — the table would never hold enough history for
 * the weekly RSI the bump was made for, and nothing would look broken.
 */
const RETENTION_DAYS = 180;

// ─────────────── TECHNICALS ───────────────
// Computed here because this function already holds every close in
// memory. Every one of these returns null rather than a placeholder when
// there is not enough history — see the note on coin_technicals.

/** Wilder's RSI. Needs period+1 closes; returns null below that.
 *  Wilder's smoothing, not a plain SMA of gains: the SMA form drifts
 *  from every charting platform a user would compare this against. */
function rsi(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  let avgGain = gain / period, avgLoss = loss / period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + (d > 0 ? d : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (d < 0 ? -d : 0)) / period;
  }
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/** Simple moving average of the last `n` values. */
function sma(v: number[], n: number): number | null {
  if (v.length < n) return null;
  let t = 0;
  for (let i = v.length - n; i < v.length; i++) t += v[i];
  return t / n;
}

/** Last close of each ISO week, oldest first — the series weekly RSI needs. */
function weeklyCloses(bars: { t: number; c: number }[]): number[] {
  const byWeek = new Map<string, { t: number; c: number }>();
  for (const b of bars) {
    const d = new Date(b.t);
    // ISO week key. Thursday-of-week trick avoids year-boundary drift.
    const th = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    th.setUTCDate(th.getUTCDate() + 4 - (th.getUTCDay() || 7));
    const key = `${th.getUTCFullYear()}-${th.getUTCMonth()}-${th.getUTCDate()}`;
    const prev = byWeek.get(key);
    if (!prev || b.t > prev.t) byWeek.set(key, b);
  }
  return [...byWeek.values()].sort((a, b) => a.t - b.t).map((b) => b.c);
}

/** Fast/slow MA periods for the cross. 60/125, not the classic 50/200 —
 *  a recognised shorter-horizon variant that fits inside KLINE_LIMIT.
 *  Named constants because the UI labels the badge with them: calling a
 *  60/125 crossover a "golden cross" without saying which periods
 *  produced it would be a claim the data does not support. */
const CROSS_FAST = 60;
const CROSS_SLOW = 125;

/** Cross state, and how long ago it flipped.
 *
 *  daysAgo is null when the flip predates the window in which the slow MA
 *  exists at all — with 140 bars and a 125 MA that is only the most recent
 *  ~15 days. A coin that crossed 40 days ago is genuinely golden; we
 *  simply cannot date it from what we store, and "unknown" is the honest
 *  answer rather than clamping it to the oldest day we happen to hold. */
function crossState(closes: number[]): { state: string | null; daysAgo: number | null } {
  if (closes.length < CROSS_SLOW) return { state: null, daysAgo: null };
  const diffs: (number | null)[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i + 1 < CROSS_SLOW) { diffs.push(null); continue; }
    const win = closes.slice(0, i + 1);
    const fast = sma(win, CROSS_FAST), slow = sma(win, CROSS_SLOW);
    diffs.push(fast != null && slow != null ? fast - slow : null);
  }
  const last = diffs[diffs.length - 1];
  if (last == null) return { state: null, daysAgo: null };
  const state = last >= 0 ? 'golden' : 'death';

  for (let i = diffs.length - 1; i > 0; i--) {
    const cur = diffs[i], prev = diffs[i - 1];
    if (cur == null || prev == null) break;          // ran out of slow-MA history
    if ((cur >= 0) !== (prev >= 0)) {
      return { state, daysAgo: diffs.length - 1 - i };
    }
  }
  return { state, daysAgo: null };
}

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

    // Latest run's universe — added 2026-09-06 alongside the RSI work.
    // Grading only ever needed coins that had been CALLED, which was 61
    // symbols; an RSI lens on the leaderboard needs the coins actually
    // ON the leaderboard, or it renders for a third of the book and
    // reads as broken data rather than as a narrow universe.
    const { data: latestRun } = await supabase
      .from('signal_runs').select('id').order('as_of', { ascending: false }).limit(1).maybeSingle();

    const [{ data: snapRows }, { data: spotRows }, { data: itemRows }] = await Promise.all([
      supabase.from('signal_snapshots').select('coin_sym').gte('snap_date', cutoff),
      supabase.from('binance_spot_metrics').select('base_asset'),
      latestRun
        ? supabase.from('signal_run_items').select('coin_sym').eq('run_id', latestRun.id)
        : Promise.resolve({ data: [] as { coin_sym: string }[] }),
    ]);

    const listed = new Set((spotRows ?? []).map((r: any) => r.base_asset));
    const called = new Set((snapRows ?? []).map((r: any) => String(r.coin_sym || '').toUpperCase()));
    const tracked = new Set((itemRows ?? []).map((r: any) => String(r.coin_sym || '').toUpperCase()));

    // Union of both consumers, intersected with what Binance actually
    // lists. The intersection is what keeps this from firing a request
    // per unlisted coin — the original reason this function exists.
    const wanted = [...new Set([...called, ...tracked])].filter((s) => s && listed.has(s));

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
      //
      // CHUNKED since the 30 -> 140 bar bump. At 30 bars this was ~1,800
      // rows and a single upsert was fine; at 140 it is ~8,500 and one
      // request that size is where PostgREST starts timing out. The
      // failure would have looked like an intermittent sync, not a size
      // problem, so it is split deliberately rather than left to luck.
      const CHUNK = 1000;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const { error: upErr } = await supabase
          .from('binance_daily_klines')
          .upsert(rows.slice(i, i + CHUNK), { onConflict: 'base_asset,open_time' });
        if (upErr) throw new Error(`klines upsert failed (rows ${i}-${i + CHUNK}): ` + upErr.message);
      }
    }

    // ── Technicals, derived from the candles already in memory ──────
    // Deliberately computed here rather than in the browser. The 16,000
    // candle rows never leave Supabase; what the page reads is one small
    // row per coin. Computing RSI client-side would mean shipping every
    // candle to every visitor and recomputing per tab.
    //
    // Isolated in its own try/catch: the candle cache is what the track
    // record depends on, and a bug in an indicator must not be able to
    // fail the sync that feeds grading.
    let technicalsWritten = 0;
    let technicalsError: string | null = null;
    try {
      const techRows = results
        .filter((bars) => bars.length > 0)
        .map((bars) => {
          const sorted = [...bars].sort(
            (a, b) => Date.parse(a.open_time) - Date.parse(b.open_time));
          const closes = sorted.map((b) => b.close);
          const weekly = weeklyCloses(
            sorted.map((b) => ({ t: Date.parse(b.open_time), c: b.close })));
          const cross = crossState(closes);
          return {
            base_asset:     sorted[0].base_asset,
            rsi14_daily:    rsi(closes, 14),
            rsi14_weekly:   rsi(weekly, 14),
            ma_fast:        sma(closes, CROSS_FAST),
            ma_slow:        sma(closes, CROSS_SLOW),
            cross_state:    cross.state,
            cross_days_ago: cross.daysAgo,
            bars_used:      closes.length,
            updated_at:     new Date().toISOString(),
          };
        });

      for (let i = 0; i < techRows.length; i += 500) {
        const { error } = await supabase
          .from('coin_technicals')
          .upsert(techRows.slice(i, i + 500), { onConflict: 'base_asset' });
        if (error) throw new Error(error.message);
      }
      technicalsWritten = techRows.length;
    } catch (e) {
      technicalsError = String((e as Error)?.message ?? e);
      console.error('[technicals] failed:', technicalsError);
    }

    const pruneBefore = new Date(Date.now() - RETENTION_DAYS * 864e5).toISOString();
    await supabase.from('binance_daily_klines').delete().lt('open_time', pruneBefore);

    return new Response(JSON.stringify({
      ok: true,
      symbols_called: called.size,
      symbols_tracked: tracked.size,
      symbols_listed_on_binance: wanted.length,
      symbols_skipped_not_listed: new Set([...called, ...tracked]).size - wanted.length,
      symbols_fetched: results.length,
      candles_upserted: rows.length,
      technicals_written: technicalsWritten,
      ...(technicalsError ? { technicals_error: technicalsError } : {}),
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message ?? e) }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
});
